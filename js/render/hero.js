// Main 3D view: the tube on the back-lit film base. Rendered with a scissor into the stage rect of the
// shared full-window canvas (clear alpha 0, so the printed paper shows through).

import * as THREE from 'three';
import { DIM } from '../build/tube.js';

export const VIEWS = {
  housing: { az: 112, el: 13, zoom: 1.0 },
  cutaway: { az: 116, el: 13, zoom: 1.0 },
  beam: { az: 98, el: 9, zoom: 1.12 },
  exploded: { az: 112, el: 20, zoom: 0.64 },
  // the use shot: the whole set (tube on its column, phantom, detector at SID 180 cm) small on the left of the stage
  image: { az: 124, el: 8, zoom: 0.172, ty: -0.93, cx: 0.125, cy: 0.49 },
};
for (const v of Object.values(VIEWS)) { v.ty ??= 0; v.cx ??= 0.5; v.cy ??= 0.43; }

export function createHero(renderer, tubeApi) {
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studio(), 0.03).texture;
  scene.environmentIntensity = 0.5;

  const hemi = new THREE.HemisphereLight(0xe8f1ff, 0x30363c, 0.5);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff0dc, 2.5);
  key.position.set(-0.9, 2.2, 1.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -0.5, right: 0.5, top: 0.5, bottom: -0.5, near: 0.5, far: 5 });
  key.shadow.bias = -0.0003; key.shadow.normalBias = 0.006; key.shadow.radius = 5;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbcd6ff, 1.6);
  rim.position.set(1.4, 0.9, -1.8);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xd8e6ee, 0.35);
  fill.position.set(0.3, -0.4, 2.0);
  scene.add(fill);
  // warm interior light so the amber oil and the insert read through the cut
  const inner = new THREE.PointLight(0xffb45a, 0.12, 0.4, 2);
  inner.position.set(-0.02, 0.02, 0.03);
  scene.add(inner);

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.5 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = DIM.floor; shadow.receiveShadow = true;
  scene.add(shadow);
  const contactTex = radialTexture();
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.42), new THREE.MeshBasicMaterial({ map: contactTex, transparent: true, depthWrite: false, opacity: 0.8, color: 0x000000 }));
  contact.rotation.x = -Math.PI / 2; contact.position.y = DIM.floor + 0.0005; contact.renderOrder = -1;
  scene.add(contact);

  scene.add(tubeApi.root);
  // per-material reflection strength: three uses scene.environmentIntensity unless the material has its own envMap
  tubeApi.root.traverse((o) => { const m = o.material; if (m?.userData?.env != null && !m.envMap) { m.envMap = scene.environment; m.envMapIntensity = scene.environmentIntensity * m.userData.env; } });

  const camera = new THREE.PerspectiveCamera(20, 1, 0.05, 30);
  const target = new THREE.Vector3(0.0, -0.012, 0);
  let view = VIEWS.cutaway, dist = 2, ppm = 1000, extra = { az: 0, el: 0, zoom: 1 };

  function place() {
    const az = (view.az + extra.az) * Math.PI / 180, el = (view.el + extra.el) * Math.PI / 180;
    const d = dist / (view.zoom * extra.zoom);
    target.y = -0.012 + (view.ty || 0);
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

  /** draw into rect (window px, top-left origin); the tube centre lands on `center`; `pxPerM` = scale on screen */
  /** set the camera for rect / center / pxPerM without drawing (project() then answers for this frame) */
  function aim(rect, center, pxPerM) {
    const w = Math.max(1, rect.w), h = Math.max(1, rect.h);
    ppm = pxPerM;
    const tanHalf = Math.tan(camera.fov * Math.PI / 360);
    dist = h / (2 * tanHalf * ppm);
    place();
    camera.aspect = w / h;
    camera.setViewOffset(w, h, w / 2 - (center.x - rect.x), h / 2 - (center.y - rect.y), w, h);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }
  function render(rect, center, pxPerM, viewportH) {
    aim(rect, center, pxPerM);
    const w = Math.max(1, rect.w), h = Math.max(1, rect.h);
    const y = viewportH - rect.y - h;
    renderer.setViewport(rect.x, y, w, h);
    renderer.setScissor(rect.x, y, w, h);
    renderer.render(scene, camera);
  }

  return {
    scene, camera, key, rim, contact, shadow, setTheme, aim, render,
    /** a view name, or a pose { az, el, zoom } (main.js blends between views) */
    setView(v) { view = typeof v === 'string' ? (VIEWS[v] || VIEWS.cutaway) : v; },
    setExtra(e) { extra = { az: 0, el: 0, zoom: 1, ...e }; },
    /** world point → window px of the last render */
    project(p, rect) { const q = p.clone().project(camera); return { x: rect.x + (q.x * 0.5 + 0.5) * rect.w, y: rect.y + (1 - (q.y * 0.5 + 0.5)) * rect.h }; },
  };
}

function radialTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 6, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,0.7)'); g.addColorStop(0.5, 'rgba(255,255,255,0.28)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** studio for reflections (generic): dark room, a large warm softbox overhead-left (the key), a tall cool strip
 *  behind-right (the rim), a long low strip in front so cylinders carry a highlight line, a faint floor bounce */
function studio() {
  const sc = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(12, 8, 12), new THREE.MeshBasicMaterial({ color: 0x8c949b, side: THREE.BackSide }));
  room.position.y = 2; sc.add(room);
  const panel = (w, h, col, k, pos, look) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(...look); sc.add(m);
  };
  panel(4.0, 2.6, 0xfff1de, 5.0, [-1.6, 4.0, 2.0], [0, 0, 0]);       // key softbox
  panel(0.7, 4.0, 0xcfe0ff, 4.0, [3.2, 1.6, -3.0], [0, 0, 0]);       // rim strip
  panel(9.0, 0.45, 0xffffff, 6.0, [1.5, 2.8, 2.7], [0, 0, 0]);         // long strip above the camera → highlight line along the housing
  panel(1.2, 1.2, 0xffe2c0, 1.4, [-4.5, 1.0, -1.0], [0, 0, 0]);      // warm side card
  panel(8.0, 8.0, 0x22272c, 1.0, [0, -1.9, 0], [0, 1, 0]);           // floor bounce
  return sc;
}
