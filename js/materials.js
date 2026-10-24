// Materials. Every hooked material shares one onBeforeCompile hook (method from FL3, code our own):
//   * enamel / casting variation from object-space noise (no textures anywhere)
//   * cut faces: back faces revealed by the clip planes print as red 45° hatch (no cap geometry)
//   * focal track: a world-space hot spot under the cathode, smeared round the ring by rotation
//   * bump: a noise height field perturbs the normal (orange peel, casting skin, rolled lead), no normal maps
//   * turn: lathe marks (fine rings in radius + axial position round X) modulate roughness on machined parts
// Generic part: hook(), SHARED, setCut(). Subject part: the palette in createMaterials().

import * as THREE from 'three';

export const SHARED = {
  uSection: { value: 0 },
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
  mat.userData.env = env;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uSection: SHARED.uSection, uHatch: SHARED.uHatch, uHatchWash: SHARED.uHatchWash,
      uHeat: SHARED.uHeat, uSpotY: SHARED.uSpotY, uSpin: SHARED.uSpin,
      uGrain: { value: grain }, uRoughVar: { value: rough }, uNScale: { value: scale },
      uBump: { value: bump }, uBScale: { value: bscale }, uTurn: { value: turn } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vXrObj; varying vec3 vXrW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvXrObj = position; vXrW = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vXrObj; varying vec3 vXrW;
        uniform float uSection; uniform vec3 uHatch, uHatchWash; uniform float uHeat, uSpotY, uSpin;
        uniform float uGrain, uRoughVar, uNScale, uBump, uBScale, uTurn;
        ${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
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
          // angle round the tube axis (x), 0 at the focal spot (straight down); the disc turns toward +angle
          float a = atan(vXrW.z, -vXrW.y);
          float behind = a < 0.0 ? a + 6.2831853 : a;
          float spot = exp(-pow(a / 0.06, 2.0));
          float trail = exp(-behind / max(uSpin, 0.05)) * 0.55 + 0.22;
          float h = clamp(uHeat * max(spot, trail), 0.0, 1.0);
          totalEmissiveRadiance += xrHot(h) * h * 6.0;
        }` : ''}
        ${glow ? `{
          // oil lit from inside: warm near the focal spot and the insert axis, darker toward the top of the housing
          float d = length(vXrW - vec3(0.0, -0.03, 0.0));
          float k = 0.35 + 1.6 * exp(-d / 0.07) + 0.9 * uHeat * exp(-d / 0.04);
          totalEmissiveRadiance *= k * mix(1.0, 0.55, smoothstep(-0.02, 0.06, vXrW.y));
          diffuseColor.rgb *= mix(1.0, 0.6, smoothstep(-0.02, 0.06, vXrW.y));
        }` : ''}`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        ${hatch ? `if (uSection > 0.5 && !gl_FrontFacing) {
          float s = step(0.42, fract((gl_FragCoord.x + gl_FragCoord.y) / 6.0));
          gl_FragColor = vec4(mix(uHatchWash, uHatch, s), 1.0);
        }` : ''}`);
  };
  mat.customProgramCacheKey = () => `xr-${grain > 0 ? 1 : 0}-${hatch ? 1 : 0}-${track ? 1 : 0}-${glow ? 1 : 0}-${bump > 0 ? 1 : 0}-${turn > 0 ? 1 : 0}`;
  return mat;
}

export function createMaterials() {
  const phys = (o, h) => hook(new THREE.MeshPhysicalMaterial(o), h);
  const m = {
    // housing: blue-grey stoved enamel over a casting, orange peel under the clearcoat
    enamel: phys({ color: 0x8a9aa6, roughness: 0.42, metalness: 0.1, clearcoat: 0.9, clearcoatRoughness: 0.12 }, { grain: 0.7, bump: 1.6e-5, bscale: 700, env: 1.2 }),
    // end caps / bosses: sand-cast aluminium, satin, casting skin
    cast: phys({ color: 0xa9b1b6, roughness: 0.46, metalness: 0.85 }, { grain: 0.3, rough: 0.12, scale: 260, bump: 1.4e-5, bscale: 1100, env: 1.3 }),
    alu: phys({ color: 0xd4d9dc, roughness: 0.2, metalness: 1.0 }, { grain: 0.35, scale: 140, turn: 1, env: 1.6 }),
    steel: phys({ color: 0xa9b0b5, roughness: 0.24, metalness: 1.0 }, { grain: 0.4, turn: 0.6, env: 1.5 }),
    dark: phys({ color: 0x2b3036, roughness: 0.45, metalness: 0.6 }, { grain: 0.6 }),
    lead: phys({ color: 0x6b7075, roughness: 0.72, metalness: 0.45 }, { grain: 1.2, rough: 0.2, scale: 120, bump: 3e-5, bscale: 600 }),
    copper: phys({ color: 0xec8545, roughness: 0.28, metalness: 0.65 }, { grain: 0.5, turn: 0.8, env: 1.8 }),
    winding: phys({ color: 0xd27a40, roughness: 0.34, metalness: 0.75 }, { grain: 1.0, scale: 400, env: 1.6 }),
    lam: phys({ color: 0x7a8088, roughness: 0.36, metalness: 0.9 }, { grain: 1.0, scale: 300, env: 1.3 }),
    nickel: phys({ color: 0xd4d6d2, roughness: 0.18, metalness: 1.0 }, { grain: 0.3, cut: false, env: 1.5 }),
    kovar: phys({ color: 0x8e8a84, roughness: 0.3, metalness: 1.0 }, { grain: 0.5, env: 1.3 }),
    iron: phys({ color: 0x5d6166, roughness: 0.42, metalness: 1.0 }, { grain: 0.9, scale: 200 }),
    shaft: phys({ color: 0xa4abb0, roughness: 0.2, metalness: 1.0 }, { grain: 0.4, cut: false, turn: 0.7, env: 1.5 }),   // rotor bearing system stays whole in the cut
    ball: phys({ color: 0xb8bec2, roughness: 0.12, metalness: 1.0 }, { grain: 0.2, cut: false, env: 1.6 }),
    epoxy: phys({ color: 0xc9b07a, roughness: 0.55, metalness: 0.0, clearcoat: 0.3 }, { grain: 0.8 }),
    moly: phys({ color: 0x9a9a98, roughness: 0.3, metalness: 1.0 }, { grain: 0.5, cut: false, turn: 0.8, env: 1.4 }),
    tungsten: phys({ color: 0xdcdbd6, roughness: 0.16, metalness: 1.0 }, { grain: 0.3, cut: false, track: true, scale: 600, env: 1.6 }),
    graphite: phys({ color: 0x1d1e20, roughness: 0.78, metalness: 0.1 }, { grain: 1.2, cut: false, bump: 2e-5, bscale: 2000 }),
    rubber: phys({ color: 0x141517, roughness: 0.62, metalness: 0.0, clearcoat: 0.25, clearcoatRoughness: 0.35 }, { grain: 0.5, cut: false }),
    liner: phys({ color: 0x17181a, roughness: 0.85, metalness: 0.0 }, { grain: 0.6, cut: false, bump: 1.5e-5, bscale: 1500 }),
    redRubber: phys({ color: 0xa82420, roughness: 0.6, clearcoat: 0.3 }, { grain: 0.5, cut: false }),
    stand: phys({ color: 0x9a1a15, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.32 }, { grain: 0.8, cut: false, bump: 1.2e-5, bscale: 500 }),
    standBase: phys({ color: 0x7c130f, roughness: 0.62, clearcoat: 0.18, clearcoatRoughness: 0.45 }, { grain: 0.9, cut: false, bump: 1e-5, bscale: 400 }),
    feet: phys({ color: 0x18191b, roughness: 0.9 }, { grain: 0.4, cut: false }),
    // beryllium window: pale grey, satin; aluminium filter: rolled sheet, faint machining
    window: phys({ color: 0xa2a3a1, roughness: 0.42, metalness: 0.75 }, { grain: 0.6, scale: 300, env: 1.2 }),
    filter: phys({ color: 0xc4c8ca, roughness: 0.34, metalness: 1.0 }, { grain: 0.5, scale: 90, env: 1.4 }),
    plate: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.6, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    // transformer oil: only its far wall shows, through the cut, as a warm amber glow
    oil: phys({ color: 0x5a3c12, roughness: 0.45, metalness: 0.0, emissive: 0x4a2a06, emissiveIntensity: 0.4, side: THREE.BackSide }, { grain: 0.5, hatch: false, glow: true, scale: 20 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xcfe6f2, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.22,
      depthWrite: false, clearcoat: 1, clearcoatRoughness: 0.02, side: THREE.DoubleSide, specularIntensity: 1 }),
  };
  m.glass.userData.cuttable = false;
  m.plate.userData.cuttable = false;
  // stepped cut: the rotor loses only the quadrant above its axis, so the copper stays below and the bearings show above
  for (const k of ['copper', 'iron', 'dark']) m[k].userData.extraCut = [new THREE.Plane(new THREE.Vector3(0, -1, 0), 0.002)];
  // glass edges: a fresnel rim so the envelope reads against the oil
  m.glassRim = new THREE.ShaderMaterial({
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main() { vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying vec3 vN; varying vec3 vV; void main() { float f = pow(1.0 - abs(dot(normalize(vN), vV)), 3.0); gl_FragColor = vec4(vec3(0.75, 0.9, 1.0) * f * 0.55, f * 0.55); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  m.glassRim.userData.cuttable = false;
  return m;
}

/** Turn the section on/off: clip planes (intersection) on every cuttable material. */
export function setCut(materials, planes, on) {
  SHARED.uSection.value = on ? 1 : 0;
  for (const mat of Object.values(materials)) {
    if (!mat.userData.cuttable) continue;
    mat.clippingPlanes = on ? [...planes, ...(mat.userData.extraCut || [])] : null;
    mat.clipIntersection = true;
    if (mat.side !== THREE.BackSide) mat.side = on ? THREE.DoubleSide : THREE.FrontSide;
    mat.needsUpdate = true;
  }
}

/** Parts the cut leaves whole (uncut material) but that lie entirely inside the removed region are hidden with it,
 *  so nothing floats in the opening. A part = a named mesh or named group; `keepWhole` parts stay regardless. */
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
