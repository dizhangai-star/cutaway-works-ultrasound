// The radiograph (use shot), computed, never painted:
//  1. bake (once): path lengths through each tissue along every ray from the focal spot to the detector. A float
//     target accumulates ±distance per face (front −d, back +d), so each channel = the chord length in cm:
//     R shell (tissue-equivalent body), G lung, B bone (× its density relative to cortical), A heart.
//  2. per frame: Beer–Lambert per energy bin of the live spectrum (sim.binned, NIST μ/ρ), energy-integrating
//     detector, heel-effect profile along the anode–cathode axis, quantum noise from mAs, then −ln, a fixed
//     window whose level follows the lung (an AEC), and the film on the lightbox (clear = bone white).
// Bone = cortical at fraction ρ_rel of its volume, the rest soft tissue (so it never double-counts the shell).
// Geometry generic: any `setup.phantom` whose meshes carry `userData.tissue`. Display: PA, viewed facing the
// phantom (its left on the viewer's right), head up.

import * as THREE from 'three';
import { binned, mu, RHO, heel } from '../sim.js';
import { DIM } from '../build/tube.js';
import { SETUP } from '../build/phantom.js';

const NB = 16, REF = 1.6;                                 // max bins; distance offset (m) keeps the float sums small
const CH = { shell: [1, 0, 0, 0], lung: [0, 1, 0, 0], bone: [0, 0, 1, 0], heart: [0, 0, 0, 1] };
const WIN = { lung: 0.20, width: 1 };                     // display: lung at 20 % before the DR compression; width from 120 kV

export function createRadiograph(renderer, setup, { w = 420, h = 516 } = {}) {
  // ── 1. bake ────────────────────────────────────────────────────────────────
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: false,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const bakeScene = new THREE.Scene();
  setup.root.updateMatrixWorld(true);
  setup.phantom.traverse((o) => {
    if (!o.isMesh || !CH[o.userData.tissue]) return;
    const k = o.userData.rho ?? 1;                       // bone: ρ_rel (negative for a marrow cavity)
    const m = new THREE.Mesh(o.geometry, new THREE.ShaderMaterial({
      uniforms: { uMask: { value: new THREE.Vector4(...CH[o.userData.tissue]).multiplyScalar(k) } },
      vertexShader: 'varying vec3 vP; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vP = mv.xyz; gl_Position = projectionMatrix * mv; }',
      fragmentShader: `uniform vec4 uMask; varying vec3 vP; void main() { float d = (length(vP) - ${REF.toFixed(2)}) * 100.0; gl_FragColor = uMask * (gl_FrontFacing ? -d : d); }`,
      side: THREE.DoubleSide, depthTest: false, depthWrite: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
    }));
    m.matrixAutoUpdate = false; m.matrix.copy(o.matrixWorld); m.frustumCulled = false;
    bakeScene.add(m);
  });
  // the source: a pinhole at the focal spot looking straight down, image up = head (+x), field = the detector
  const halfV = SETUP.field.v / 2, halfU = SETUP.field.u / 2;
  const cam = new THREE.PerspectiveCamera(2 * Math.atan(halfV / SETUP.sid) * 180 / Math.PI, halfU / halfV, 0.05, 3);
  cam.position.copy(DIM.spot); cam.up.set(1, 0, 0); cam.lookAt(DIM.spot.x, DIM.spot.y - 1, DIM.spot.z); cam.updateMatrixWorld(true);

  const prev = { rt: renderer.getRenderTarget(), sc: renderer.getScissorTest(), cc: renderer.getClearColor(new THREE.Color()), ca: renderer.getClearAlpha() };
  renderer.setRenderTarget(rt); renderer.setScissorTest(false); renderer.setClearColor(0x000000, 0); renderer.clear();
  renderer.render(bakeScene, cam);
  const map = new Float32Array(w * h * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, w, h, map);
  renderer.setRenderTarget(prev.rt); renderer.setScissorTest(prev.sc); renderer.setClearColor(prev.cc, prev.ca);
  // texture row 0 = image bottom (feet). Camera right = +z = the phantom's right (seen from behind): the film flips u.

  // ── CPU side: the same physics for the numbers on the card ────────────────────
  const at = (u, v) => {                                  // phantom (u = its left, v = head) in m on the detector → paths in cm
    const px = Math.round((0.5 - u / SETUP.field.u) * (w - 1)), py = Math.round((0.5 + v / SETUP.field.v) * (h - 1));
    const i = (Math.min(h - 1, Math.max(0, py)) * w + Math.min(w - 1, Math.max(0, px))) * 4;
    return paths(map[i], map[i + 1], map[i + 2], map[i + 3]);
  };
  const D = (bins, p) => -Math.log(bins.reduce((s, b) => s + b.w * Math.exp(-(p.soft * mS(b.e) + p.lung * mL(b.e) + p.bone * (mB(b.e) - mS(b.e)))), 0));
  // reference points (detector plane, so × SID / SOD magnification is inside the map): lung field, spine, a rib over lung
  const lungP = at(-0.085, 0.03), spineP = at(0, 0.06), heartP = at(0.05, -0.10);
  const rib = (() => { let best = null; for (let v = -0.02; v < 0.10; v += 0.001) { const p = at(-0.10, v); if (!best || p.bone > best.p.bone) best = { v, p }; } return best; })();
  const ribGap = (() => { let best = null; for (let dv = 0.006; dv < 0.02; dv += 0.001) { const p = at(-0.10, rib.v + dv); if (!best || p.bone < best.p.bone) best = { p }; } return best.p; })();
  const cache = new Map();
  function numbers(kv) {
    let r = cache.get(kv); if (r) return r;
    const bins = binned(kv), dl = D(bins, lungP);
    r = { bins, dLung: dl, dSpine: D(bins, spineP), dHeart: D(bins, heartP), ribC: 1 - Math.exp(-(D(bins, rib.p) - D(bins, ribGap))), spineC: 1 - Math.exp(-(D(bins, spineP) - dl)) };
    cache.set(kv, r); return r;
  }
  WIN.width = (numbers(120).dHeart - numbers(120).dLung) / 0.62;       // 120 kV: heart ≈ 0.8 before the DR compression

  // ── 2. the film ───────────────────────────────────────────────────────────
  const heelLUT = new Float32Array(NB);
  const U = {
    uMap: { value: rt.texture }, uNb: { value: 0 }, uW: { value: new Float32Array(NB) }, uMs: { value: new Float32Array(NB) },
    uMl: { value: new Float32Array(NB) }, uMb: { value: new Float32Array(NB) }, uHeel: { value: heelLUT },
    uA: { value: 1 }, uD0: { value: 0 }, uWd: { value: 1 }, uDev: { value: 0 }, uLight: { value: 0 }, uNoise: { value: 0 }, uSeed: { value: 0 },
    uRes: { value: new THREE.Vector2(w, h) }, uBox: { value: new THREE.Vector4(0, 0, 1, 1) },
  };
  const filmMat = new THREE.ShaderMaterial({
    uniforms: U, depthTest: false, depthWrite: false, transparent: true,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */`
      precision highp float;
      uniform sampler2D uMap; uniform int uNb; uniform float uW[${NB}], uMs[${NB}], uMl[${NB}], uMb[${NB}], uHeel[${NB}];
      uniform float uA, uD0, uWd, uDev, uLight, uNoise, uSeed; uniform vec2 uRes; uniform vec4 uBox; varying vec2 vUv;
      float det(vec2 uv) {
        vec4 t = texture2D(uMap, uv);
        float lung = max(t.g - t.a, 0.0), soft = max(t.r - lung, 0.0), bone = t.b;
        float I = 0.0;
        for (int i = 0; i < ${NB}; i++) { if (i >= uNb) break; I += uW[i] * exp(-(soft * uMs[i] + lung * uMl[i] + bone * (uMb[i] - uMs[i]))); }
        return I;
      }
      float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423) + uSeed); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
      void main() {
        vec2 uv = vec2(1.0 - vUv.x, vUv.y);                               // PA: viewed facing the phantom
        float I = det(uv);
        // DR processing: a mild unsharp mask on −ln I (radius ≈ 8 mm), as every digital chest image gets
        vec2 o = 10.0 / uRes;
        float Ib = 0.25 * (det(uv + vec2(o.x, 0.0)) + det(uv - vec2(o.x, 0.0)) + det(uv + vec2(0.0, o.y)) + det(uv - vec2(0.0, o.y)));
        I = exp(log(max(I, 1e-6)) + 0.28 * (log(max(I, 1e-6)) - log(max(Ib, 1e-6))));
        float hp = uv.y * ${(NB - 1).toFixed(1)}; int hi = int(floor(hp)); float hf = fract(hp), h0 = 1.0, h1 = 1.0;
        for (int i = 0; i < ${NB}; i++) { if (i == hi) h0 = uHeel[i]; if (i == hi + 1) h1 = uHeel[i]; }
        I *= mix(h0, h1, hf);
        // quantum noise: σ(ln I) = 1 / √N, N ∝ mAs × I per pixel (Box–Muller from a fixed pattern)
        vec2 px = floor(vUv * uRes * 2.0);
        float g = sqrt(-2.0 * log(max(hash(px), 1e-4))) * cos(6.2831853 * hash(px + 17.0));
        float Dn = -log(max(I, 1e-6)) + g * uNoise / sqrt(max(I, 1e-4));
        // DR dynamic-range compression: subtract 40 % of the large-scale density (≈ 3 cm), so lungs and mediastinum
        // both read, as every chest workstation does
        float Dl = 0.0; vec2 R = 34.0 / uRes;
        for (int k = 0; k < 8; k++) { float a = float(k) * 0.785398; Dl += -log(max(det(uv + R * vec2(cos(a), sin(a))), 1e-6)); }
        Dl = (Dl + -log(max(I, 1e-6))) / 9.0;
        Dn -= 0.40 * (Dl - (uD0 + 0.45 * uWd));
        float b = clamp((Dn - uD0) / uWd, 0.0, 1.0);
        b = pow(b, 0.9);
        // film on the lightbox: before the light, a dim sheet; developing darkens it from clear to the image
        float clear = mix(1.0, b, uDev);
        float base = 0.10;
        vec3 sheet = vec3(0.13, 0.17, 0.21);
        vec3 lit = vec3(0.86, 0.93, 0.98) * (0.035 + 0.965 * clear);
        vec2 e = min(vUv, 1.0 - vUv); float vig = smoothstep(0.0, 0.08, min(e.x, e.y * 0.82));
        vec3 c = mix(sheet, lit * (0.86 + 0.14 * vig), uLight);
        gl_FragColor = vec4(c, uA);
      }`,
  });
  const fsScene = new THREE.Scene(), fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), filmMat); quad.frustumCulled = false; fsScene.add(quad);

  let kvSet = -1;
  /** draw the film into rect (window px). p = { kv, mas, focus, dev 0..1, light 0..1, seed } */
  function render(rect, vh, p) {
    if (p.kv !== kvSet) {
      kvSet = p.kv;
      const n = numbers(p.kv);
      U.uNb.value = n.bins.length;
      n.bins.forEach((b, i) => { U.uW.value[i] = b.w; U.uMs.value[i] = mS(b.e); U.uMl.value[i] = mL(b.e); U.uMb.value[i] = mB(b.e); });
      // heel along the film's height: bottom = feet = cathode side (φ > 0), top = head = anode side
      for (let i = 0; i < NB; i++) { const v = (i / (NB - 1) - 0.5) * SETUP.field.v; heelLUT[i] = heel(-Math.atan(v / SETUP.sid) * 180 / Math.PI, p.kv); }
      U.uD0.value = n.dLung - WIN.lung * WIN.width; U.uWd.value = WIN.width;
    }
    U.uA.value = p.a ?? 1; U.uDev.value = p.dev; U.uLight.value = p.light; U.uSeed.value = p.seed || 0;
    U.uNoise.value = 0.009 / Math.sqrt(Math.max(p.mas, 0.05) / 4);       // 4 mAs → 0.9 % in the open field (modelled)
    const x = rect.x, y = vh - rect.y - rect.h;
    renderer.setViewport(x, y, rect.w, rect.h); renderer.setScissor(x, y, rect.w, rect.h);
    renderer.render(fsScene, fsCam);
  }

  return { render, numbers, map, size: { w, h }, camera: cam,
    /** contrast on the film for the card: a rib over lung and the spine vs lung, 0..1 */
    contrast: (kv) => { const n = numbers(kv); return { rib: n.ribC, spine: n.spineC }; } };
}

// μ (cm⁻¹) per bin energy: soft tissue, inflated lung (soft at 0.26 g/cm³), cortical bone
const mS = (e) => mu('soft', e) * RHO.soft, mL = (e) => mu('soft', e) * RHO.lung, mB = (e) => mu('bone', e) * RHO.bone;
const paths = (r, g, b, a) => { const lung = Math.max(g - a, 0); return { soft: Math.max(r - lung, 0), lung, bone: b }; };
