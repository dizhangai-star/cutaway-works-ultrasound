// Live orthographic drawings of the running model (method from FL3): per view a normal + depth render target,
// then an ink pass (silhouette / crease / depth-step edges, 45° dot screen for shade, red hatch where the
// section plane cuts), on the theme's drawing paper. Generic: views and overlays come from the caller.

import * as THREE from 'three';
import { rgb } from '../theme.js';

const NORMAL_VERT = /* glsl */`
  #include <common>
  #include <clipping_planes_pars_vertex>
  varying vec3 vN;
  void main() {
    #include <begin_vertex>
    #include <project_vertex>
    #include <clipping_planes_vertex>
    vN = normalize(normalMatrix * normal);
  }`;
const NORMAL_FRAG = /* glsl */`
  #include <clipping_planes_pars_fragment>
  varying vec3 vN;
  void main() {
    #include <clipping_planes_fragment>
    if (!gl_FrontFacing) { gl_FragColor = vec4(0.5, 0.5, 1.0, 0.5); return; }
    gl_FragColor = vec4(normalize(vN) * 0.5 + 0.5, 1.0);
  }`;
const INK_FRAG = /* glsl */`
  uniform sampler2D tN, tD; uniform vec2 uRes, uOrigin; uniform float uDpr;
  uniform vec3 uLine, uDot, uHatch, uLight, uPaper, uGrid;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  vec4 N(vec2 o) { return texture2D(tN, vUv + o / uRes); }
  float D(vec2 o) { return texture2D(tD, vUv + o / uRes).r; }
  void main() {
    vec4 c = N(vec2(0.0));
    float w = max(1.0, uDpr * 0.85), edge = 0.0, d0 = D(vec2(0.0));
    for (int k = 0; k < 4; k++) {
      vec2 o = k == 0 ? vec2(w, 0.0) : k == 1 ? vec2(-w, 0.0) : k == 2 ? vec2(0.0, w) : vec2(0.0, -w);
      vec4 n = N(o);
      float a = abs(n.a - c.a);
      float nd = (c.a > 0.75 && n.a > 0.75) ? 1.0 - dot(c.xyz * 2.0 - 1.0, n.xyz * 2.0 - 1.0) : 0.0;
      float dd = abs(D(o) - d0);
      edge = max(edge, max(step(0.2, a), max(smoothstep(0.2, 0.45, nd), smoothstep(0.002, 0.005, dd))));
    }
    vec2 px = gl_FragCoord.xy;
    vec3 col = vec3(0.0); float alpha = 0.0;
    if (c.a > 0.75) {
      vec3 n = normalize(c.xyz * 2.0 - 1.0);
      float tone = clamp(1.0 - (dot(n, normalize(uLight)) * 0.6 + 0.45), 0.0, 1.0);
      float cell = 3.4 * uDpr;
      vec2 r = mat2(0.7071, -0.7071, 0.7071, 0.7071) * px / cell;
      float dist = length(fract(r) - 0.5) * cell, rad = cell * 0.5 * sqrt(tone);
      col = uDot; alpha = smoothstep(rad + 0.7, rad - 0.7, dist) * step(0.08, tone) * 0.9;
    } else if (c.a > 0.25) {
      float s = step(0.55, fract((px.x - px.y) / (4.5 * uDpr)));
      col = uHatch; alpha = 0.3 + 0.62 * s;
    }
    if (edge > 0.0) { col = mix(col, uLine, edge); alpha = max(alpha, edge); }
    vec2 q = (px - uOrigin) / uDpr;
    float g = max(step(fract(q.x / 10.0), 0.1), step(fract(q.y / 10.0), 0.1));
    vec3 paper = mix(uPaper, uGrid, g * 0.6) * (0.99 + 0.02 * hash(floor(q * 1.5)));
    gl_FragColor = vec4(mix(paper, col, alpha), 1.0);
  }`;

const lin = (css) => { const [r, g, b] = rgb(css); const c = new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace); return new THREE.Vector3(c.r, c.g, c.b); };

/**
 * @param defs  { [name]: { dir, up, clip?, frame?(box) → {center, w, h}, overlay?(ctx, v, project, tk), live? } }
 *   dir / up may be functions; `live` views follow moving parts: re-framed and re-annotated at every render
 * @param subject  Object3D drawn; `hide` objects are hidden during the passes; `boxOf` frames the views
 */
export function createDrawings(renderer, { subject, boxOf, hide = [], elements, defs }) {
  const normalMat = new THREE.ShaderMaterial({ vertexShader: NORMAL_VERT, fragmentShader: NORMAL_FRAG, side: THREE.DoubleSide, clipping: true, blending: THREE.NoBlending });
  const inkMat = new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: INK_FRAG, depthTest: false, depthWrite: false,
    uniforms: { tN: { value: null }, tD: { value: null }, uRes: { value: new THREE.Vector2() }, uDpr: { value: 1 }, uOrigin: { value: new THREE.Vector2() },
      uLine: { value: new THREE.Vector3() }, uDot: { value: new THREE.Vector3() }, uHatch: { value: new THREE.Vector3() },
      uLight: { value: new THREE.Vector3(-0.45, 0.7, 0.55) }, uPaper: { value: new THREE.Vector3() }, uGrid: { value: new THREE.Vector3() } },
  });
  const quadScene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), inkMat); quad.frustumCulled = false; quadScene.add(quad);
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let tk = null;

  const views = [...elements].map((el) => {
    const def = defs[el.dataset.view];
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
    const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.UnsignedByteType, depthBuffer: true });
    target.depthTexture = new THREE.DepthTexture(4, 4);
    const ink = document.createElement('canvas'); ink.className = 'dwg-ink'; el.appendChild(ink);
    return { el, name: el.dataset.view, def, cam, target, ink, w: 0, h: 0, frame: 0, dirty: true };
  });

  function frameCamera(v) {
    const val = (x) => (typeof x === 'function' ? x() : x);
    const dir = val(v.def.dir), up = val(v.def.up);
    const box = boxOf();
    const right = new THREE.Vector3().crossVectors(dir.clone().negate(), up).normalize();
    const size = box.getSize(new THREE.Vector3());
    const ext = (a) => Math.abs(a.x) * size.x + Math.abs(a.y) * size.y + Math.abs(a.z) * size.z;
    const f = v.def.frame ? v.def.frame(box) : { center: box.getCenter(new THREE.Vector3()), w: ext(right), h: ext(up) };
    const pad = v.def.pad ?? 1.42, aspect = v.w / Math.max(1, v.h);
    let hw = f.w / 2 * pad, hh = f.h / 2 * pad;
    if (hw / hh > aspect) hh = hw / aspect; else hw = hh * aspect;
    Object.assign(v.cam, { left: -hw, right: hw, top: hh, bottom: -hh, near: 0.2, far: 4 });
    v.cam.position.copy(f.center).addScaledVector(dir, 2);
    v.cam.up.copy(up); v.cam.lookAt(f.center);
    v.cam.updateProjectionMatrix(); v.cam.updateMatrixWorld();
  }
  const project = (v) => (p) => { const q = p.clone().project(v.cam); return [(q.x * 0.5 + 0.5) * v.w, (1 - (q.y * 0.5 + 0.5)) * v.h]; };

  function drawOverlay(v) {
    const dpr = renderer.getPixelRatio();
    v.ink.width = Math.round(v.w * dpr); v.ink.height = Math.round(v.h * dpr);
    const ctx = v.ink.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, v.w, v.h);
    v.s = S;
    v.def.overlay?.(ctx, v, project(v), tk);
  }

  function setTheme(t) {
    tk = t;
    const U = inkMat.uniforms;
    U.uLine.value.copy(lin(t['dwg-line'])); U.uDot.value.copy(lin(t['dwg-dot'])); U.uHatch.value.copy(lin(t.accent));
    U.uPaper.value.copy(lin(t['dwg-paper'])); U.uGrid.value.copy(lin(t['dwg-grid']));
    views.forEach((v) => (v.dirty = true));
  }

  let tick = 0, S = 1;
  function render(viewportH, plateScale) {
    tick++;
    if (plateScale !== S) { S = plateScale; views.forEach((v) => (v.dirty = true)); }
    const scene = subject.parent; if (!scene) return;
    const prevClip = renderer.clippingPlanes, bg = scene.background, env = scene.environment;
    const hidden = [];
    const hideObj = (o) => { if (o.visible) { o.visible = false; hidden.push(o); } };
    hide.forEach(hideObj);
    scene.children.forEach((o) => { if (o !== subject && !o.isLight) hideObj(o); });
    subject.traverse((o) => { if (o.isMesh && ((o.material.transparent && !o.material.userData.ghost) || o.userData.noDrawing)) hideObj(o); });
    scene.background = null;
    const prevAuto = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
    for (const v of views) {
      const r = v.el.getBoundingClientRect();
      const w = Math.round(r.width), h = Math.round(r.height);
      if (w < 8 || h < 8 || r.bottom < 0 || r.top > viewportH) continue;
      if (w !== v.w || h !== v.h || v.dirty) {
        v.w = w; v.h = h; v.dirty = false;
        const dpr = renderer.getPixelRatio();
        v.target.setSize(Math.round(w * dpr), Math.round(h * dpr));
        frameCamera(v); drawOverlay(v); v.frame = 0;
      } else if (v.def.live) { frameCamera(v); drawOverlay(v); }
      if ((tick + views.indexOf(v)) % 2 === 0 || v.frame === 0 || v.def.live) {
        scene.overrideMaterial = normalMat;
        renderer.clippingPlanes = v.def.clip ? [v.def.clip] : [];
        renderer.setRenderTarget(v.target);
        renderer.setClearColor(0x000000, 0);
        renderer.setScissorTest(false);
        renderer.clear(true, true, true);
        renderer.render(scene, v.cam);
        renderer.setRenderTarget(null);
        renderer.setScissorTest(true);
        v.frame++;
      }
      scene.overrideMaterial = null;
      renderer.clippingPlanes = prevClip;
      const dpr = renderer.getPixelRatio();
      const U = inkMat.uniforms;
      U.tN.value = v.target.texture; U.tD.value = v.target.depthTexture;
      U.uRes.value.set(v.target.width, v.target.height); U.uDpr.value = dpr * plateScale;
      const y = viewportH - r.top - h;
      U.uOrigin.value.set(r.left * dpr, y * dpr);
      renderer.setViewport(r.left, y, w, h); renderer.setScissor(r.left, y, w, h);
      renderer.render(quadScene, quadCam);
    }
    scene.overrideMaterial = null; renderer.clippingPlanes = prevClip;
    scene.background = bg; scene.environment = env; renderer.shadowMap.autoUpdate = prevAuto;
    hidden.forEach((o) => (o.visible = true));
  }

  return { render, setTheme, views, redrawOverlays() { views.forEach((v) => (v.dirty = true)); } };
}
