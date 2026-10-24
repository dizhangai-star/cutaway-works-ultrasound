// Generic material hook (plate skill, never mentions the subject). Every hooked material shares one onBeforeCompile:
//   * enamel / casting variation from object-space noise (no textures anywhere)
//   * cut faces: back faces revealed by the clip planes print as red 45° hatch (no cap geometry). The hatch is
//     printed on the section plane itself: the view ray is traced to where it leaves the removed region (the
//     material's own clip planes, world space), so the stripes stay on the part as the camera moves; filtered by
//     fwidth, so a sliver of section a few pixels wide turns an even dark red instead of flickering.
//     Never put a clip plane on a surface: it clips that surface pixel by pixel at random (flicker).
//   * focal track: a world-space hot spot, smeared round the ring by rotation (track: true)
//   * bump: a noise height field perturbs the normal (orange peel, casting skin), no normal maps
//   * turn: lathe marks (fine rings in radius + axial position round X) modulate roughness on machined parts
// The subject's palette lives in js/materials.js and calls hook(); SHARED.uHatchPeriod is set by the subject (metres).

import * as THREE from 'three';

export const SHARED = {
  uSection: { value: 0 },
  uHatchPeriod: { value: 0.004 },                         // stripe pitch on the section plane, metres (subject sets it)
  uHatch: { value: new THREE.Color(0xD2322D) },
  uHatchWash: { value: new THREE.Color(0x3a1414) },
  uHeat: { value: 0 },                                   // focal track 0..1 (S3: from sim)
  uSpotY: { value: -0.03 },                              // focal spot height (world)
  uSpin: { value: 0 },                                   // smear length, radians
};

const NOISE = /* glsl */`
  float xrHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float xrNoise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(xrHash(i), xrHash(i + vec3(1,0,0)), f.x), mix(xrHash(i + vec3(0,1,0)), xrHash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(xrHash(i + vec3(0,0,1)), xrHash(i + vec3(1,0,1)), f.x), mix(xrHash(i + vec3(0,1,1)), xrHash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  vec3 xrHot(float t) {           // --hot ramp: red → orange → white
    vec3 a = vec3(0.82, 0.12, 0.10), b = vec3(1.0, 0.6, 0.24), c = vec3(1.0, 0.96, 0.88);
    return t < 0.5 ? mix(a, b, t * 2.0) : mix(b, c, (t - 0.5) * 2.0);
  }
`;

export function hook(mat, { grain = 1, rough = 0.12, cut = true, hatch = true, track = false, glow = false, scale = 55,
  bump = 0, bscale = 900, turn = 0, env = 1 } = {}) {
  mat.userData.cuttable = cut;
  const MAXC = 6;                                        // clip planes per material (intersection), world space
  mat.userData.cutU = { uCut: { value: Array.from({ length: MAXC }, () => new THREE.Vector4()) }, uCutN: { value: 0 } };
  mat.userData.env = env;
  mat.userData.dis = { value: 0 };                       // dissolve 0..1 (ghost.js fades a part out before it ghosts)
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, mat.userData.cutU, { uHatchPeriod: SHARED.uHatchPeriod });
    Object.assign(shader.uniforms, { uDis: mat.userData.dis, uSection: SHARED.uSection, uHatch: SHARED.uHatch, uHatchWash: SHARED.uHatchWash,
      uHeat: SHARED.uHeat, uSpotY: SHARED.uSpotY, uSpin: SHARED.uSpin,
      uGrain: { value: grain }, uRoughVar: { value: rough }, uNScale: { value: scale },
      uBump: { value: bump }, uBScale: { value: bscale }, uTurn: { value: turn } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vXrObj; varying vec3 vXrW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvXrObj = position; vXrW = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vXrObj; varying vec3 vXrW;
        uniform float uDis; uniform float uSection; uniform vec3 uHatch, uHatchWash; uniform float uHeat, uSpotY, uSpin;
        uniform vec4 uCut[${MAXC}]; uniform int uCutN; uniform float uHatchPeriod;
        uniform float uGrain, uRoughVar, uNScale, uBump, uBScale, uTurn;
        ${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // dissolve: a world-space noise burns the part away (~7 cm blotches with fine edges); uDis = 1 leaves nothing
        if (uDis > 0.0 && (!gl_FrontFacing || xrNoise(vXrW * 14.0) * 0.8 + xrNoise(vXrW * 70.0) * 0.2 < uDis * 1.02)) discard;   // no inside faces (no hatch) through the holes
        float xrN = xrNoise(vXrObj * uNScale) * 0.6 + xrNoise(vXrObj * uNScale * 3.4) * 0.4;
        float xrBig = xrNoise(vXrObj * uNScale * 0.16);
        diffuseColor.rgb *= mix(1.0, 0.92 + 0.13 * xrN - 0.05 * xrBig, uGrain);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + uRoughVar * (xrN - 0.5) * uGrain, 0.04, 1.0);
        ${turn > 0 ? `{
          // lathe marks: rings in radius (faces) and in x (diameters), ≈ 0.8 mm apart, two pitches beat;
          // faded by the screen-space rate so they never alias into moiré
          float rr = length(vXrObj.yz) + abs(vXrObj.x);
          float ph = rr * 7800.0, fw = fwidth(ph);
          float ln = 0.5 + 0.5 * sin(ph) * (0.6 + 0.4 * sin(rr * 900.0 + 1.3));
          ln = mix(0.5, ln, 1.0 - smoothstep(0.3, 0.8, fw));
          roughnessFactor = clamp(roughnessFactor + uTurn * (ln - 0.5) * 0.22, 0.04, 1.0);
          diffuseColor.rgb *= 1.0 + uTurn * (ln - 0.5) * 0.06;
        }` : ''}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        ${bump > 0 ? `{
          // height field → normal (surface-gradient method), object-space noise so it sticks to the part
          float hb = xrNoise(vXrObj * uBScale) * 0.65 + xrNoise(vXrObj * uBScale * 2.7) * 0.35;
          vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
          vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
          float det = dot(sx, r1) * faceDirection;
          vec3 grad = sign(det) * (dFdx(hb) * r1 + dFdy(hb) * r2) * uBump;
          normal = normalize(abs(det) * normal - grad);
        }` : ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        ${track ? `{
          // angle round the X axis, 0 straight down at the hot spot; the ring turns toward +angle
          float a = atan(vXrW.z, -vXrW.y);
          float behind = a < 0.0 ? a + 6.2831853 : a;
          float spot = exp(-pow(a / 0.06, 2.0));
          float trail = exp(-behind / max(uSpin, 0.05)) * 0.55 + 0.22;
          float h = clamp(uHeat * max(spot, trail), 0.0, 1.0);
          totalEmissiveRadiance += xrHot(h) * h * 6.0;
        }` : ''}
        ${glow ? `{
          // a volume lit from inside (glow: true): warm near a point on the axis, darker toward the top
          float d = length(vXrW - vec3(0.0, -0.03, 0.0));
          float k = 0.35 + 1.6 * exp(-d / 0.07) + 0.9 * uHeat * exp(-d / 0.04);
          totalEmissiveRadiance *= k * mix(1.0, 0.55, smoothstep(-0.02, 0.06, vXrW.y));
          diffuseColor.rgb *= mix(1.0, 0.6, smoothstep(-0.02, 0.06, vXrW.y));
        }` : ''}`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        ${hatch ? `if (uSection > 0.5 && !gl_FrontFacing) {
          // where the view ray leaves the removed region (inside = every plane's distance < 0): that is the section
          vec3 ro = cameraPosition, rd = vXrW - cameraPosition;
          float tOut = 1.0;
          for (int i = 0; i < ${MAXC}; i++) {
            if (i >= uCutN) break;
            float nd = dot(uCut[i].xyz, rd);
            if (nd > 1e-6) tOut = min(tOut, -(dot(uCut[i].xyz, ro) + uCut[i].w) / nd);
          }
          vec3 sp = ro + clamp(tOut, 0.0, 1.0) * rd;
          float ph = dot(sp, vec3(0.57735)) / uHatchPeriod;
          float fw = fwidth(ph);
          float tri = abs(fract(ph) - 0.5) * 2.0;
          float s = smoothstep(0.42 - fw, 0.42 + fw, tri);
          s = mix(s, 0.58, smoothstep(0.3, 0.6, fw));        // finer than a pixel: the stripes' average
          gl_FragColor = vec4(mix(uHatchWash, uHatch, s), 1.0);
        }` : ''}`);
  };
  mat.customProgramCacheKey = () => `xr2-${grain > 0 ? 1 : 0}-${hatch ? 1 : 0}-${track ? 1 : 0}-${glow ? 1 : 0}-${bump > 0 ? 1 : 0}-${turn > 0 ? 1 : 0}`;
  return mat;
}

/** Turn the section on/off: clip planes (intersection) on every cuttable material. */
export function setCut(materials, planes, on) {
  SHARED.uSection.value = on ? 1 : 0;
  for (const mat of Object.values(materials)) {
    if (!mat.userData.cuttable) continue;
    const all = mat.userData.ownCut || [...planes, ...(mat.userData.extraCut || [])];      // ownCut: a part opened by its own planes only
    mat.clippingPlanes = on ? all : null;
    if (mat.userData.cutU) { mat.userData.cutU.uCutN.value = on ? all.length : 0; all.forEach((p, i) => mat.userData.cutU.uCut.value[i]?.set(p.normal.x, p.normal.y, p.normal.z, p.constant)); }
    mat.clipIntersection = true;
    if (mat.side !== THREE.BackSide) mat.side = on ? THREE.DoubleSide : THREE.FrontSide;
    mat.needsUpdate = true;
  }
}

/** Parts the cut leaves whole (uncut material) but that lie entirely inside the removed region are hidden with it,
 *  so nothing floats in the opening. A part = a named mesh or named group; `keepWhole` parts stay regardless. */
/** Sweep the cut in (amount 0 → 1): every plane moves `reach` metres along its normal at 0, so the removed region
 *  grows from nothing into place (a view switch that opens the subject instead of popping). Planes are shared
 *  objects, so the native clipping follows; the hatch uniforms are refreshed here. Call after setCut(…, true). */
const BASE = new WeakMap();
export function sweepCut(materials, planes, amount, reach = 1.5, { own = true } = {}) {   // own: false leaves ownCut planes in place
  const all = new Set(planes);
  for (const mat of Object.values(materials)) for (const p of [...(own ? mat.userData.ownCut || [] : []), ...(mat.userData.extraCut || [])]) all.add(p);
  for (const p of all) { if (!BASE.has(p)) BASE.set(p, p.constant); p.constant = BASE.get(p) + (1 - amount) * reach; }
  if (!own) for (const mat of Object.values(materials)) for (const p of mat.userData.ownCut || []) if (BASE.has(p)) p.constant = BASE.get(p);
  for (const mat of Object.values(materials)) {
    const u = mat.userData.cutU; if (!u || !mat.userData.cuttable) continue;
    const pl = mat.userData.ownCut || [...planes, ...(mat.userData.extraCut || [])];
    pl.forEach((p, i) => u.uCut.value[i]?.set(p.normal.x, p.normal.y, p.normal.z, p.constant));
  }
}

export function hideRemoved(root, planes, on, keepWhole = []) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3(), c = new THREE.Vector3();
  const removed = (o) => {
    box.setFromObject(o);
    for (let i = 0; i < 8; i++) {
      c.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
      if (planes.some((p) => p.distanceToPoint(c) >= 0)) return false;     // clipIntersection: removed only where every plane clips
    }
    return true;
  };
  root.traverse((o) => {
    if (!o.isMesh || o.material.userData?.cuttable) return;
    for (let p = o; p && p !== root; p = p.parent) if (keepWhole.includes(p.name)) { o.visible = true; return; }
    o.visible = !(on && removed(o));
  });
}
