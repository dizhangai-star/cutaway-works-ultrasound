// The probe (subject geometry), metres. Lens apex (skin contact) at the origin, up = +Y along the handle, the wide
// face (array plane) in X, elevation in Z, camera side +Z. Public (S1): the array is a 50 mm radius arc spanning the
// 67.5° field (58.9 mm), aperture 60 mm. Everything else is *modelled* (BRIEF §3): housing outline, stack thicknesses,
// elevation, electronics. S0.5: rough shapes with final materials; S2 refines every part (≥ 30 named, audit to zero).

import * as THREE from 'three';
import { PROBE } from '../sim.js';

const mm = (v) => v / 1000;
const R = mm(PROBE.roc);                                   // element face radius (S1)
export const DIM = {
  // radii about the centre of curvature C = (0, cy): PZT, matching 1, matching 2, lens (modelled thicknesses)
  pzt: [R - mm(0.55), R], m1: [R, R + mm(0.35)], m2: [R + mm(0.35), R + mm(0.6)], lens: [R + mm(0.6), R + mm(1.6)],
  backing: [mm(36), R - mm(0.55)],
  half: PROBE.fov / 2,                                     // 33.75°: the arc carrying the 128 elements
  elev: mm(6.5), elevLens: mm(11.5),                       // half elevation of the elements / the lens (modelled)
  top: mm(166),
};
DIM.cy = DIM.lens[1];                                      // lens apex at y = 0
const C = (r, a) => [r * Math.sin(a), DIM.cy - r * Math.cos(a)];

// housing outline (modelled): rings (y, half width, half thickness); ring 0 follows the nose arc
const RINGS = [[null, 33.0, 13.0], [7, 33.8, 13.6], [26, 33.5, 13.7], [40, 30.0, 13.3], [55, 23.5, 12.5], [70, 19.5, 12.2],
  [90, 17.8, 12.8], [115, 17.6, 13.4], [140, 16.5, 12.8], [155, 14.0, 11.2], [163, 10.5, 9.0], [166, 8.0, 7.5]];
const WALL = mm(1.8), M = 72, NEXP = 2.6;
const noseY = (x) => DIM.cy - Math.sqrt(Math.max(0, (DIM.lens[1] - mm(0.4)) ** 2 - x * x));

function housingGeometry() {
  const pos = [], idx = [];
  const ring = (k, inset) => {
    const [y, W, T] = RINGS[k], w = mm(W) - inset, t = mm(T) - inset, out = [];
    for (let i = 0; i < M; i++) {
      const p = i / M * Math.PI * 2, c = Math.cos(p), s = Math.sin(p);
      const x = w * Math.sign(c) * Math.abs(c) ** (2 / NEXP), z = t * Math.sign(s) * Math.abs(s) ** (2 / NEXP);
      const yy = k === 0 ? noseY(x) : k === 1 ? noseY(x) + mm(y) : k === 2 ? mm(y) + 0.3 * noseY(x) : mm(y);
      out.push([x, yy, z]);
    }
    return out;
  };
  const K = RINGS.length, O = [], I = [];
  for (let k = 0; k < K; k++) { O.push(ring(k, 0)); I.push(ring(k, WALL)); }
  const base = (rings) => { const b = pos.length / 3; for (const r of rings) for (const p of r) pos.push(...p); return b; };
  const bo = base(O), bi = base(I);
  const q = (a, b, c, d, flip) => (flip ? idx.push(a, c, b, b, c, d) : idx.push(a, b, c, b, d, c));
  for (let k = 0; k < K - 1; k++) for (let i = 0; i < M; i++) {
    const j = (i + 1) % M;
    q(bo + k * M + i, bo + k * M + j, bo + (k + 1) * M + i, bo + (k + 1) * M + j, true);
    q(bi + k * M + i, bi + k * M + j, bi + (k + 1) * M + i, bi + (k + 1) * M + j, false);
  }
  for (const k of [0, K - 1]) for (let i = 0; i < M; i++) {
    const j = (i + 1) % M;
    q(bo + k * M + i, bo + k * M + j, bi + k * M + i, bi + k * M + j, k !== 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/** annular sector about C in the x–y plane, radii r0..r1, ±a, extruded ±hz in z; `bulge` thickens the outer face at z = 0 */
function arcBand(r0, r1, a, hz, { seg = 96, bulge = 0 } = {}) {
  const s = new THREE.Shape();
  for (let i = 0; i <= seg; i++) { const [x, y] = C(r1, -a + 2 * a * i / seg); i ? s.lineTo(x, y) : s.moveTo(x, y); }
  for (let i = seg; i >= 0; i--) { const [x, y] = C(r0, -a + 2 * a * i / seg); s.lineTo(x, y); }
  const g = new THREE.ExtrudeGeometry(s, { depth: 2 * hz, bevelEnabled: false, curveSegments: 1, steps: bulge ? 16 : 1 });
  g.translate(0, 0, -hz);
  if (bulge) {                                             // cylindrical elevation lens: thicker at z = 0
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, DIM.cy - y);
      if (r < r1 - 1e-6) continue;
      const k = 1 + bulge * (1 - (z / hz) ** 2) / r1, a2 = Math.atan2(x, DIM.cy - y);
      const [nx, ny] = C(r * k, a2); p.setXYZ(i, nx, ny, z);
    }
    g.computeVertexNormals();
  }
  return g;
}

function backingGeometry() {
  const [r0, r1] = [DIM.backing[0], DIM.backing[1]], a = DIM.half + 0.01, s = new THREE.Shape(), top = mm(28);
  const n = 64;
  for (let i = 0; i <= n; i++) { const [x, y] = C(r1, -a + 2 * a * i / n); i ? s.lineTo(x, y) : s.moveTo(x, y); }
  const [xr] = C(r1, a); s.lineTo(xr - mm(1.5), top); s.lineTo(-xr + mm(1.5), top); s.closePath();
  void r0;
  const g = new THREE.ExtrudeGeometry(s, { depth: 2 * mm(7.5), bevelEnabled: true, bevelThickness: mm(0.4), bevelSize: mm(0.4), bevelSegments: 2, curveSegments: 1 });
  g.translate(0, 0, -mm(7.5));
  return g;
}

/** a flat ribbon along a path in the x–y plane, width 2·hz in z */
function ribbon(pts, hz, z0 = 0) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, z0)));
  const P = curve.getPoints(48), pos = [], idx = [], uv = [];
  P.forEach((p, i) => { pos.push(p.x, p.y, z0 - hz, p.x, p.y, z0 + hz); uv.push(i / 48, 0, i / 48, 1); });
  for (let i = 0; i < P.length - 1; i++) { const a = 2 * i; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}

function boardShape() {
  const s = new THREE.Shape(), pts = [[-24, 38], [24, 38], [24, 50], [16.5, 62], [15.5, 70], [15.5, 128], [12.5, 140], [-12.5, 140], [-15.5, 128], [-15.5, 70], [-16.5, 62], [-24, 50]];
  pts.forEach(([x, y], i) => (i ? s.lineTo(mm(x), mm(y)) : s.moveTo(mm(x), mm(y))));
  s.closePath(); return s;
}

export function buildProbe(M) {
  const root = new THREE.Group(); root.name = 'probe bench';
  const probe = new THREE.Group(); probe.name = 'probe'; root.add(probe);
  const add = (geo, mat, name, parent = probe) => { const o = new THREE.Mesh(geo, mat); o.name = name; o.castShadow = o.receiveShadow = true; parent.add(o); return o; };

  add(housingGeometry(), M.housing, 'housing');

  // acoustic stack (outermost first)
  add(arcBand(DIM.lens[0], DIM.lens[1] - mm(0.6), DIM.half + 0.05, DIM.elevLens, { bulge: mm(0.9) }), M.lens, 'acoustic lens');
  add(arcBand(...DIM.m2, DIM.half + 0.012, DIM.elev + mm(0.6)), M.match2, 'matching layer 2');
  add(arcBand(...DIM.m1, DIM.half + 0.012, DIM.elev + mm(0.6)), M.match1, 'matching layer 1');
  add(arcBand(DIM.pzt[1] - mm(0.03), DIM.pzt[1], DIM.half + 0.012, DIM.elev + mm(0.6)), M.foil, 'ground foil');
  // 128 PZT elements on the arc, kerf ≈ 0.05 mm (modelled)
  const N = PROBE.elements, pitchA = 2 * DIM.half / N, ew = R * pitchA - mm(0.05), eh = DIM.pzt[1] - DIM.pzt[0] - mm(0.03);
  const el = new THREE.InstancedMesh(new THREE.BoxGeometry(ew, eh, 2 * DIM.elev), M.pzt, N); el.name = 'PZT elements';
  const mtx = new THREE.Matrix4(), qq = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < N; i++) {
    const a = -DIM.half + pitchA * (i + 0.5), [x, y] = C((DIM.pzt[0] + DIM.pzt[1] - mm(0.03)) / 2, a);
    e.set(0, 0, a); qq.setFromEuler(e); mtx.compose(new THREE.Vector3(x, y, 0), qq, new THREE.Vector3(1, 1, 1)); el.setMatrixAt(i, mtx);
  }
  el.castShadow = el.receiveShadow = true; probe.add(el);
  add(backingGeometry(), M.backing, 'backing block');
  // array frame: two machined side cheeks holding the stack (modelled)
  // (S2: the array frame cheeks, thin enough not to hide the backing in the cut)

  // signal flex: from both ends of the array up to the board connector, plus a front fan across the backing
  for (const sx of [-1, 1]) {
    add(ribbon([[sx * 29, 15], [sx * 30.5, 24], [sx * 27, 33], [sx * 20, 38.5], [sx * 13, 40]].map(([x, y]) => [mm(x), mm(y)]), mm(6)), M.flex, `signal flex ${sx < 0 ? 'left' : 'right'}`);
  }
  // board: green PCB with the beamformer ASIC, a second IC, passives, the flex connector; aluminium spreader behind
  const board = new THREE.ExtrudeGeometry(boardShape(), { depth: mm(1.2), bevelEnabled: false });
  add(board, M.pcb, 'PCB').position.z = mm(0.4);
  const zTop = mm(1.6);
  const chip = (w, h, d, x, y, name, m = M.chip) => { const o = add(new THREE.BoxGeometry(mm(w), mm(h), mm(d)), m, name); o.position.set(mm(x), mm(y), zTop + mm(d) / 2); return o; };
  chip(12, 12, 1.4, 0, 54, 'beamformer ASIC');
  for (const [w, h, x, y] of [[13.2, 0.5, 0, 47.6], [13.2, 0.5, 0, 60.4], [0.5, 13.2, -6.4, 54], [0.5, 13.2, 6.4, 54]]) chip(w, h, 0.3, x, y, 'ASIC pins', M.pins);
  chip(8, 8, 1.1, 0, 80, 'power IC');
  chip(20, 3.2, 2.2, 0, 42, 'flex connector');
  chip(14, 4, 2.4, 0, 132, 'cable connector', M.pins);
  // passives: a deterministic scatter of 0402-size parts
  const pas = new THREE.InstancedMesh(new THREE.BoxGeometry(mm(1.0), mm(0.5), mm(0.45)), M.chip, 60); pas.name = 'passives';
  let sd = 7; const r = () => ((sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 60; i++) {
    const y = 66 + r() * 60, x = (r() - 0.5) * 24, rot = r() < 0.5 ? 0 : Math.PI / 2;
    if (Math.abs(y - 80) < 6 && Math.abs(x) < 6) { mtx.makeScale(0, 0, 0); pas.setMatrixAt(i, mtx); continue; }
    e.set(0, 0, rot); qq.setFromEuler(e); mtx.compose(new THREE.Vector3(mm(x), mm(y), zTop + mm(0.22)), qq, new THREE.Vector3(1, 1, 1)); pas.setMatrixAt(i, mtx);
  }
  probe.add(pas);
  const spreader = add(new THREE.BoxGeometry(mm(28), mm(70), mm(1.0)), M.alu, 'heat spreader'); spreader.position.set(0, mm(98), -mm(3.2));

  // strain relief + cable
  const sr = []; for (let i = 0; i <= 24; i++) { const u = i / 24, rr = mm(8.4 - 3.4 * u) * (i % 3 === 1 ? 1.06 : 1); sr.push(new THREE.Vector2(rr, mm(160) + u * mm(58))); }
  sr.unshift(new THREE.Vector2(0.0001, mm(160))); sr.push(new THREE.Vector2(0.0001, mm(218)));
  add(new THREE.LatheGeometry(sr, 48), M.rubber, 'strain relief');
  const path = new THREE.CatmullRomCurve3([[0, 214, 0], [2, 250, 0], [20, 300, -6], [70, 330, -18], [160, 345, -30]].map(([x, y, z]) => new THREE.Vector3(mm(x), mm(y), mm(z))));
  add(new THREE.TubeGeometry(path, 80, mm(3.4), 20), M.cable, 'cable');

  // the bench: the phantom block (clear gel) and a gel film under the lens
  const bs = new THREE.Shape(); const BW = mm(62), BD = mm(42), rr = mm(6);
  bs.moveTo(-BW + rr, -BD); bs.lineTo(BW - rr, -BD); bs.quadraticCurveTo(BW, -BD, BW, -BD + rr); bs.lineTo(BW, BD - rr); bs.quadraticCurveTo(BW, BD, BW - rr, BD);
  bs.lineTo(-BW + rr, BD); bs.quadraticCurveTo(-BW, BD, -BW, BD - rr); bs.lineTo(-BW, -BD + rr); bs.quadraticCurveTo(-BW, -BD, -BW + rr, -BD);
  const blk = new THREE.ExtrudeGeometry(bs, { depth: mm(46), bevelEnabled: true, bevelThickness: mm(2), bevelSize: mm(2), bevelSegments: 3 });
  blk.rotateX(Math.PI / 2); blk.translate(0, -mm(2.3), 0);       // top face 0.3 mm under the lens apex (the gel film)
  const block = add(blk, M.block, 'phantom block', root); block.castShadow = false; block.renderOrder = 2; block.userData.noDrawing = true;
  const gel = add(new THREE.SphereGeometry(mm(22), 48, 16), M.gel, 'gel', root); gel.scale.set(1.25, 0.07, 0.75); gel.position.y = -mm(0.6); gel.renderOrder = 3; gel.userData.noDrawing = true;
  DIM.floor = -mm(50.3);
  return { root, probe, block, gel };
}
