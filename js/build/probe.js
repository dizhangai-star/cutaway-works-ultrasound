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
const sup = (p, w, t) => { const c = Math.cos(p), s = Math.sin(p); return [w * Math.sign(c) * Math.abs(c) ** (2 / NEXP), t * Math.sign(s) * Math.abs(s) ** (2 / NEXP)]; };
/** point of housing ring k at angle p (0 = +x, π/2 = +z), `inset` inward (negative = outward) */
function ringPt(k, p, inset) {
  const [y, W, T] = RINGS[k], [x, z] = sup(p, mm(W) - inset, mm(T) - inset);
  const yy = k === 0 ? noseY(x) : k === 1 ? noseY(x) + mm(y) : k === 2 ? mm(y) + 0.3 * noseY(x) : mm(y);
  return [x, yy, z];
}
/** the housing's inner surface |z| at (x, y) on the plain rings (k ≥ 3), for parts that rest on the wall */
function innerZ(x, y, inset = WALL) {
  const yy = y / 1000; let k = 3; while (k < RINGS.length - 2 && mm(RINGS[k + 1][0]) < yy) k++;
  const u = (yy - mm(RINGS[k][0])) / (mm(RINGS[k + 1][0]) - mm(RINGS[k][0]));
  const w = mm(RINGS[k][1] + u * (RINGS[k + 1][1] - RINGS[k][1])) - inset, t = mm(RINGS[k][2] + u * (RINGS[k + 1][2] - RINGS[k][2])) - inset;
  return t * Math.max(0, 1 - Math.abs(x / w) ** NEXP) ** (1 / NEXP);
}

/** a closed piece of the housing wall: rings k0..k1, angles p0..p1 (a full turn when p1 − p0 = 2π), between two insets.
 *  Every face is oriented outward by its known direction (radial, ±y at the ring ends, ±tangent at the angle ends). */
function shellGeometry(k0, k1, p0, p1, in0 = 0, in1 = WALL) {
  const full = Math.abs(p1 - p0 - 2 * Math.PI) < 1e-6, n = full ? M : Math.max(4, Math.round(M * (p1 - p0) / (2 * Math.PI))) + 1;
  const ang = (i) => p0 + (p1 - p0) * i / (full ? n : n - 1), K = k1 - k0 + 1;
  const pos = [], idx = [], P = (j) => pos.slice(3 * j, 3 * j + 3);
  for (const inset of [in0, in1]) for (let k = k0; k <= k1; k++) for (let i = 0; i < n; i++) pos.push(...ringPt(k, ang(i), inset));
  const at = (side, k, i) => side * K * n + (k - k0) * n + ((i + n) % n);
  const quad = (a, b, c, d, out) => {                     // a b / c d, oriented so the normal points along `out`
    const A = P(a), B = P(b), C = P(c), u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0];
    const o = out(A); (nx * o[0] + ny * o[1] + nz * o[2] > 0) ? idx.push(a, b, c, b, d, c) : idx.push(a, c, b, b, c, d);
  };
  const I = full ? n : n - 1, rad = (s) => (q) => [s * q[0], 0, s * q[2]];
  for (let k = k0; k < k1; k++) for (let i = 0; i < I; i++) {
    quad(at(0, k, i), at(0, k, i + 1), at(0, k + 1, i), at(0, k + 1, i + 1), rad(in0 < in1 ? 1 : -1));
    quad(at(1, k, i), at(1, k, i + 1), at(1, k + 1, i), at(1, k + 1, i + 1), rad(in0 < in1 ? -1 : 1));
  }
  for (const [k, sy] of [[k0, -1], [k1, 1]]) for (let i = 0; i < I; i++) quad(at(0, k, i), at(0, k, i + 1), at(1, k, i), at(1, k, i + 1), () => [0, sy, 0]);
  if (!full) for (const [i, sp] of [[0, -1], [n - 1, 1]]) {
    const pa = ang(i), tg = [-Math.sin(pa) * sp, 0, Math.cos(pa) * sp];
    for (let k = k0; k < k1; k++) quad(at(0, k, i), at(0, k + 1, i), at(1, k, i), at(1, k + 1, i), () => tg);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/** a capped tube (closed solid) along a curve */
function cappedTube(curve, r, segs = 80, radial = 20) {
  const F = curve.computeFrenetFrames(segs, false), pos = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const c = curve.getPointAt(i / segs);
    for (let j = 0; j < radial; j++) {
      const a = j / radial * Math.PI * 2, N = F.normals[i], B = F.binormals[i];
      pos.push(c.x + r * (Math.cos(a) * N.x + Math.sin(a) * B.x), c.y + r * (Math.cos(a) * N.y + Math.sin(a) * B.y), c.z + r * (Math.cos(a) * N.z + Math.sin(a) * B.z));
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * radial + j, b = i * radial + (j + 1) % radial, c = a + radial, d = b + radial; idx.push(a, c, b, b, c, d);
  }
  for (const [i, s] of [[0, 1], [segs, -1]]) {
    const c = curve.getPointAt(i / segs), m = pos.length / 3; pos.push(c.x, c.y, c.z);
    for (let j = 0; j < radial; j++) { const a = i * radial + j, b = i * radial + (j + 1) % radial; s > 0 ? idx.push(m, a, b) : idx.push(m, b, a); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
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
  // outline drawn 0.4 mm inside, the bevel grows it back (a bevel never pushes into the PZT)
  const b = mm(0.4), ri = r1 - b;
  for (let i = 0; i <= n; i++) { const [x, y] = C(ri, -a + 2 * a * i / n); i ? s.lineTo(x, y) : s.moveTo(x, y); }
  const [xr] = C(ri, a); s.lineTo(xr - mm(1.5), top - b); s.lineTo(-xr + mm(1.5), top - b); s.closePath();
  void r0;
  const g = new THREE.ExtrudeGeometry(s, { depth: 2 * mm(7.1), bevelEnabled: true, bevelThickness: mm(0.4), bevelSize: mm(0.4), bevelSegments: 2, curveSegments: 1 });
  g.translate(0, 0, -mm(7.1));
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

  // housing (modelled): nose cone round the lens, front / back shells parted at z = 0, soft-touch grip inserts on the
  // waist, a blank label plate on the back, an O-ring at the nose joint
  const TAU = Math.PI * 2, KT = RINGS.length - 1;
  add(shellGeometry(0, 2, 0, TAU), M.housing, 'nose cone');
  add(shellGeometry(2, KT, 0, Math.PI), M.housing, 'housing front shell');
  add(shellGeometry(2, KT, Math.PI, TAU), M.housing, 'housing back shell');
  for (const [sx, pc] of [[1, 0], [-1, Math.PI]]) add(shellGeometry(5, 8, pc - 0.55, pc + 0.55, -mm(0.8), 0), M.grip, `grip insert ${sx < 0 ? 'left' : 'right'}`);
  add(shellGeometry(6, 7, Math.PI + 0.95, TAU - 0.95, -mm(0.15), 0), M.label, 'label (blank)');
  {
    const P = []; for (let i = 0; i < 72; i++) { const [x, y, z] = ringPt(2, i / 72 * TAU, WALL + mm(0.5)); P.push(new THREE.Vector3(x, y, z)); }
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(P, true), 144, mm(0.5), 10, true), M.rubber, 'seal ring');
  }

  // acoustic stack (outermost first)
  {
    const g = arcBand(DIM.lens[0], DIM.lens[1] - mm(0.6), DIM.half + 0.05, DIM.elevLens, { bulge: mm(0.9) }), p = g.attributes.position;
    const W = mm(RINGS[1][1]) - WALL - mm(0.25), T = mm(RINGS[1][2]) - WALL - mm(0.25);   // rounded ends in plan: inside the nose wall
    for (let i = 0; i < p.count; i++) { const zm = T * Math.max(0, 1 - Math.abs(p.getX(i) / W) ** NEXP) ** (1 / NEXP); p.setZ(i, p.getZ(i) * Math.min(1, zm / DIM.elevLens)); }
    g.computeVertexNormals(); add(g, M.lens, 'acoustic lens');
  }
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
  // array frame: two machined cheeks on the backing faces (modelled); epoxy potting on the backing top
  {
    const sh = new THREE.Shape(), a = 0.42, n = 32, rr = DIM.backing[1];
    for (let i = 0; i <= n; i++) { const [x, y] = C(rr, -a + 2 * a * i / n); i ? sh.lineTo(x, y) : sh.moveTo(x, y); }
    sh.lineTo(mm(19), mm(28)); sh.lineTo(-mm(19), mm(28)); sh.closePath();
    for (const sz of [1, -1]) {
      const g = new THREE.ExtrudeGeometry(sh, { depth: mm(1.0), bevelEnabled: false, curveSegments: 1 });
      g.translate(0, 0, sz > 0 ? mm(7.5) : -mm(8.5)); add(g, M.frame, `array frame ${sz > 0 ? 'front' : 'back'}`);
    }
    add(new THREE.BoxGeometry(mm(48), mm(2.6), mm(12)), M.epoxy, 'epoxy fill').position.set(0, mm(28.0 + 1.3), 0);
  }

  // signal flex: from both ends of the array up to the board connector, plus a front fan across the backing
  for (const sx of [-1, 1]) {
    add(ribbon([[sx * 28.6, 14], [sx * 28.8, 22], [sx * 27.4, 32], [sx * 20, 38.5], [sx * 13, 40]].map(([x, y]) => [mm(x), mm(y)]), mm(6)), M.flex, `signal flex ${sx < 0 ? 'left' : 'right'}`);
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
  chip(24, 5, 1.0, 0, 42, 'flex clamp', M.frame).position.z = mm(3.8 + 0.5);
  // four screws hold the board on bosses moulded in the back shell
  const SCR = [[-12.5, 74], [12.5, 74], [-12.5, 124], [12.5, 124]];
  for (const [x, y] of SCR) {
    const hd = add(new THREE.CylinderGeometry(mm(1.7), mm(1.7), mm(1.0), 24), M.screw, 'PCB screw'); hd.rotation.x = Math.PI / 2; hd.position.set(mm(x), mm(y), zTop + mm(0.5));
    const zb = -Math.min(...[-2.2, 0, 2.2].map((d) => innerZ(x + d, y)));    // boss foot on the wall where it is highest
    const bs = add(new THREE.CylinderGeometry(mm(2.2), mm(2.6), mm(0.4) - zb, 24), M.housing, 'screw boss'); bs.rotation.x = Math.PI / 2; bs.position.set(mm(x), mm(y), (mm(0.4) + zb) / 2);
  }
  // passives: a deterministic scatter of 0402-size parts
  const pas = new THREE.InstancedMesh(new THREE.BoxGeometry(mm(1.0), mm(0.5), mm(0.45)), M.chip, 60); pas.name = 'passives';
  let sd = 7; const r = () => ((sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 60; i++) {
    const y = 66 + r() * 60, x = (r() - 0.5) * 24, rot = r() < 0.5 ? 0 : Math.PI / 2;
    if ((Math.abs(y - 80) < 6 && Math.abs(x) < 6) || SCR.some(([sx, sy]) => Math.hypot(x - sx, y - sy) < 3.2)) { mtx.makeScale(0, 0, 0); pas.setMatrixAt(i, mtx); continue; }
    e.set(0, 0, rot); qq.setFromEuler(e); mtx.compose(new THREE.Vector3(mm(x), mm(y), zTop + mm(0.22)), qq, new THREE.Vector3(1, 1, 1)); pas.setMatrixAt(i, mtx);
  }
  probe.add(pas);
  const spreader = add(new THREE.BoxGeometry(mm(19), mm(70), mm(1.0)), M.alu, 'heat spreader'); spreader.position.set(0, mm(98), -mm(3.2));
  add(new THREE.BoxGeometry(mm(16), mm(20), mm(3.1)), M.pad, 'thermal pad').position.set(0, mm(80), mm(0.4 - 1.55));

  // cable gland in the housing top, hollow strain relief, cable; the braid and conductors run down to the connector
  const lathe = (pr, name, m) => add(new THREE.LatheGeometry(pr.map(([r, y]) => new THREE.Vector2(mm(r), mm(y))), 48), m, name);
  const BORE = 3.4;
  lathe([[BORE, 152], [5.4, 152], [5.4, 166], [7.0, 166], [7.0, 167.4], [BORE, 167.4], [BORE, 152]], 'cable gland', M.frame);
  const sr = [[BORE, 167.4]]; for (let i = 0; i <= 24; i++) { const u = i / 24; sr.push([(6.8 - 2.4 * u) * (i % 3 === 1 ? 1.06 : 1), 167.4 + u * 54]); }
  sr.push([BORE, 221.4], [BORE, 167.4]); lathe(sr, 'strain relief', M.rubber);
  const path = new THREE.CatmullRomCurve3([[0, 150.2, 0], [0, 200, 0], [0.6, 230, 0], [20, 300, -6], [70, 330, -18], [160, 345, -30]].map(([x, y, z]) => new THREE.Vector3(mm(x), mm(y), mm(z))));
  add(cappedTube(path, mm(BORE), 160, 20), M.cable, 'cable');
  add(cappedTube(new THREE.LineCurve3(new THREE.Vector3(0, mm(140), 0), new THREE.Vector3(0, mm(150.2), 0)), mm(3.0), 4, 20), M.braid, 'shield braid');
  add(ribbon([[0, 133.6], [0, 137], [0, 140.6]].map(([x, y]) => [mm(x), mm(y)]), mm(1.5), mm(2.4)), M.flex, 'cable conductors');

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
