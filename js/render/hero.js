// Main 3D view: the probe on its phantom block, on the back-lit film base. Rendered with a scissor into the stage rect
// of the shared full-window canvas (clear alpha 0, so the printed paper shows through).

import * as THREE from 'three';
import { DIM } from '../build/probe.js';

export const VIEWS = {
  // az: camera azimuth from +X toward +Z (the cut side); tx / ty: target offset (m); cx / cy: where the target lands
  housing: { az: 62, el: 10, zoom: 0.44, ty: 0.08, cy: 0.56, cx: 0.5 },
  cutaway: { az: 124, el: 20, zoom: 0.76, ty: 0.03, cy: 0.12 },
  beam: { az: 96, el: 6, zoom: 1.15, ty: -0.01 },
  array: { az: 104, el: 4, zoom: 3.0, tx: -0.012, ty: -0.03, cy: 0.3 },
  section: { az: 90, el: 4, zoom: 1.0 },
};
for (const v of Object.values(VIEWS)) { v.tx ??= 0; v.ty ??= 0; v.cx ??= 0.5; v.cy ??= 0.205; }

export function createHero(renderer, subject) {
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studio(), 0.03).texture;
  scene.environmentIntensity = 0.5;

  const hemi = new THREE.HemisphereLight(0xe8f1ff, 0x30363c, 0.5);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff6ec, 2.1);
  key.position.set(-0.25, 0.55, 0.45);
  key.target.position.set(0, 0.04, 0); scene.add(key.target);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  Object.assign(key.shadow.camera, { left: -0.25, right: 0.25, top: 0.3, bottom: -0.2, near: 0.2, far: 1.6 });
  key.shadow.bias = -0.0002; key.shadow.normalBias = 0.002; key.shadow.radius = 5;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbcd6ff, 1.0);
  rim.position.set(0.4, 0.3, -0.5);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xd8e6ee, 0.35);
  fill.position.set(0.3, -0.05, 0.4);
  scene.add(fill);
  // a soft work light in the open quarter, so the board and stack read under the housing's shadow
  const inner = new THREE.PointLight(0xfff4e8, 0.16, 0.25, 2);
  inner.position.set(-0.035, 0.07, 0.07);
  scene.add(inner);

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.5 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = DIM.floor; shadow.receiveShadow = true;
  scene.add(shadow);
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.14), new THREE.MeshBasicMaterial({ map: radialTexture(), transparent: true, depthWrite: false, opacity: 0.8, color: 0x000000 }));
  contact.rotation.x = -Math.PI / 2; contact.position.set(0, DIM.floor + 0.0005, 0); contact.renderOrder = -1;
  scene.add(contact);

  scene.add(subject);
  subject.traverse((o) => { const m = o.material; if (m?.userData?.env != null && !m.envMap) { m.envMap = scene.environment; m.envMapIntensity = scene.environmentIntensity * m.userData.env; } });

  const camera = new THREE.PerspectiveCamera(20, 1, 0.01, 10);
  const T0 = new THREE.Vector3(0, 0.035, 0), target = T0.clone();
  let view = VIEWS.cutaway, dist = 1, ppm = 1000, extra = { az: 0, el: 0, zoom: 1 };

  function place() {
    const az = (view.az + extra.az) * Math.PI / 180, el = (view.el + extra.el) * Math.PI / 180;
    const d = dist / (view.zoom * extra.zoom);
    target.set(T0.x + (view.tx || 0), T0.y + (view.ty || 0), T0.z);
    camera.position.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).multiplyScalar(d).add(target);
    camera.lookAt(target);
  }

  function setTheme(tk) {
    const dark = tk.name === 'dark';
    shadow.material.opacity = dark ? 0.62 : 0.26;
    shadow.material.color.set(dark ? 0x000000 : 0x1B2433);
    contact.material.opacity = dark ? 0.85 : 0.45;
    hemi.groundColor.set(dark ? 0x22282e : 0xd8dcdc);
    hemi.intensity = dark ? 0.45 : 0.7;
    renderer.toneMappingExposure = dark ? 1.0 : 1.05;
  }

  /** set the camera for rect / center / pxPerM without drawing (project() then answers for this frame) */
  function aim(rect, center, pxPerM) {
    const w = Math.max(1, rect.w), h = Math.max(1, rect.h);
    ppm = pxPerM;
    dist = h / (2 * Math.tan(camera.fov * Math.PI / 360) * ppm);
    place();
    camera.aspect = w / h;
    camera.setViewOffset(w, h, w / 2 - (center.x - rect.x), h / 2 - (center.y - rect.y), w, h);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }
  function render(rect, center, pxPerM, viewportH) {
    aim(rect, center, pxPerM);
    const w = Math.max(1, rect.w), h = Math.max(1, rect.h), y = viewportH - rect.y - h;
    renderer.setViewport(rect.x, y, w, h);
    renderer.setScissor(rect.x, y, w, h);
    renderer.render(scene, camera);
  }

  return {
    scene, camera, key, rim, contact, shadow, setTheme, aim, render,
    setView(v) { view = typeof v === 'string' ? (VIEWS[v] || VIEWS.cutaway) : v; },
    setExtra(e) { extra = { az: 0, el: 0, zoom: 1, ...e }; },
    project(p, rect) { const q = p.clone().project(camera); return { x: rect.x + (q.x * 0.5 + 0.5) * rect.w, y: rect.y + (1 - (q.y * 0.5 + 0.5)) * rect.h }; },
  };
}

function radialTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const ctx = c.getContext('2d'), g = ctx.createRadialGradient(128, 128, 6, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,0.7)'); g.addColorStop(0.5, 'rgba(255,255,255,0.28)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** studio for reflections (generic): dark room, warm key softbox, cool rim strip, a long strip for highlight lines */
function studio() {
  const sc = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(12, 8, 12), new THREE.MeshBasicMaterial({ color: 0x8c949b, side: THREE.BackSide }));
  room.position.y = 2; sc.add(room);
  const panel = (w, h, col, k, pos, look) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(...look); sc.add(m);
  };
  panel(4.0, 2.6, 0xfff1de, 5.0, [-1.6, 4.0, 2.0], [0, 0, 0]);
  panel(0.7, 4.0, 0xcfe0ff, 4.0, [3.2, 1.6, -3.0], [0, 0, 0]);
  panel(9.0, 0.45, 0xffffff, 6.0, [1.5, 2.8, 2.7], [0, 0, 0]);
  panel(1.2, 1.2, 0xffe2c0, 1.4, [-4.5, 1.0, -1.0], [0, 0, 0]);
  panel(8.0, 8.0, 0x22272c, 1.0, [0, -1.9, 0], [0, 1, 0]);
  return sc;
}
