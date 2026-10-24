// The use shot's set (view 5 Image): a chest phantom (engineering stand-in, no person) on a flat-panel detector,
// the tube's stand carried by a column at SID 180 cm. Real adult proportions (modelled); every part is a closed
// solid tagged with its tissue (`userData.tissue` = shell | lung | heart | bone, `userData.rho` = density relative
// to the table value), so render/radiograph.js can measure path lengths through them.
// Phantom frame: u = film right (the phantom's left), v = head, w = posterior (toward the tube; PA projection).
// World: x = v (head toward the anode side, cathode toward the thicker base: the usual heel placement), z = −u, y = w
// (left / posterior / head as in anatomy's right-handed LPS frame).

import * as THREE from 'three';
import { DIM } from './tube.js';

export const SETUP = {
  sid: 1.80,                                   // source–image distance, m (PA chest standard)
  field: { u: 0.35, v: 0.43 },                 // collimated to a 35 × 43 cm detector, long side head–foot
  pad: 0.006,                                  // detector cover to the phantom's front
};
SETUP.det = DIM.spot.y - SETUP.sid;            // detector surface height (world y)


export function buildSetup() {
  const root = new THREE.Group(); root.name = 'setup';
  const phantom = new THREE.Group(); phantom.name = 'phantom';
  root.add(phantom);
  const M = materials();

  // shell: superelliptic sections lofted head–foot, flat-cut ends (a machined test object, not a body)
  const SHELL = [[-0.235, 0.140, 0.100], [-0.19, 0.145, 0.104], [-0.12, 0.153, 0.108], [-0.02, 0.159, 0.110], [0.08, 0.163, 0.106], [0.13, 0.161, 0.099],
    [0.168, 0.150, 0.086], [0.184, 0.128, 0.068], [0.196, 0.072, 0.054]];
  const half = (v) => interp(SHELL, v);
  const b0 = half(0)[1];
  const yc = SETUP.det + SETUP.pad + b0;       // phantom axis height (its front rests on the detector cover)
  phantom.position.set(0, yc, 0);
  // phantom (u, v, w) → local (x = v, y = w, z = −u)
  const P = (u, v, w) => new THREE.Vector3(v, w, -u);

  const add = (geo, mat, name, tissue, rho = 1) => {
    const m = new THREE.Mesh(geo, mat); m.name = name; m.userData.tissue = tissue; m.userData.rho = rho;
    m.castShadow = tissue !== 'shell'; phantom.add(m); return m;
  };
  add(loft(SHELL.map(([v, a, b]) => ({ v, a, b })), 2.5, 72), M.shell, 'phantom shell', 'shell').renderOrder = 3;

  // cortical bone = an outer solid at ρ_rel plus an inner (x-ray only) solid at a negative ρ: the marrow, so edges
  // print brighter than centres, as on a real film. `rim` = inner size share, `marrow` = its net ρ_rel.
  const cortex = (outer, inner, name, rho = 0.95, marrow = 0.3) => {
    add(outer, M.bone, name, 'bone', rho);
    const m = add(inner, M.bone, name, 'bone', marrow - rho); m.visible = false; m.userData.xrayOnly = true;
  };
  const right = -1;                                                    // s = −1: the phantom's right, +1: its left

  // lungs: apex under the clavicle, widest at the base, domes over the diaphragm (right dome ≈ 2 cm higher),
  // sharp costophrenic angles (the lateral base runs lower than the medial), the left notched by the heart
  const lungs = {};
  for (const s of [-1, 1]) {
    const left = s > 0, dv = left ? -0.006 : 0.012;
    // rows [v, medial edge, lateral edge, half depth]: domed apex, the mediastinal border carved by the SVC (right),
    // the aortic knob and the heart (left), deep lateral recesses at the base
    const R = left
      ? [[0.160, 0.058, 0.064, 0.008], [0.152, 0.046, 0.076, 0.020], [0.138, 0.038, 0.092, 0.034], [0.112, 0.032, 0.110, 0.050], [0.075, 0.027, 0.122, 0.066],
        [0.040, 0.030, 0.129, 0.078], [0.000, 0.034, 0.133, 0.084], [-0.040, 0.040, 0.128, 0.085], [-0.090, 0.040, 0.134, 0.085], [-0.130, 0.044, 0.138, 0.084],
        [-0.158, 0.050, 0.140, 0.078], [-0.168, 0.070, 0.136, 0.060], [-0.172, 0.095, 0.122, 0.034]]
      : [[0.160, 0.058, 0.064, 0.008], [0.152, 0.046, 0.078, 0.020], [0.138, 0.038, 0.094, 0.034], [0.112, 0.033, 0.112, 0.050], [0.070, 0.029, 0.126, 0.066],
        [0.030, 0.026, 0.133, 0.078], [-0.020, 0.026, 0.137, 0.084], [-0.060, 0.030, 0.134, 0.085], [-0.100, 0.032, 0.138, 0.085], [-0.130, 0.034, 0.142, 0.084],
        [-0.158, 0.040, 0.144, 0.078], [-0.168, 0.060, 0.140, 0.060], [-0.172, 0.090, 0.126, 0.034]];
    const L = R.map(([v, m, l, b]) => ({ v: v + (v < -0.08 ? dv : dv * Math.max(0, 1 - (v + 0.08) / 0.2)), a: (l - m) / 2, b, cu: s * (l + m) / 2, cw: 0.010 }));
    add(loft(L, 3.0, 48), M.lung, left ? 'left lung' : 'right lung', 'lung');
    lungs[s] = L;
  }
  const inLung = (s, u, v, w, m = 0.85) => {                           // inside lung s, shrunk by m
    const L = lungs[s]; if (v > L[0].v || v < L[L.length - 1].v) return false;
    let i = 1; while (L[i].v > v) i++;
    const a = L[i - 1], b = L[i], t = (v - a.v) / (b.v - a.v), lerp = (k) => a[k] + (b[k] - a[k]) * t;
    return ((u - lerp('cu')) / (lerp('a') * m)) ** 2 + ((w - lerp('cw')) / (lerp('b') * m)) ** 2 < 1;
  };

  // heart + great vessels (soft tissue; they show only where they push the lung aside): left ventricle, right atrium,
  // aortic arch ("knob") and descending aorta, superior vena cava, pulmonary trunk to both hila
  const soft = [];
  const blob = (u, v, w, ru, rv, rw, rot = 0) => { const g = new THREE.SphereGeometry(1, 40, 28); g.scale(rv, rw, ru); g.rotateY(rot); g.translate(...P(u, v, w).toArray()); soft.push(g); };
  blob(0.040, -0.100, -0.032, 0.070, 0.041, 0.050, 0.50);            // left ventricle: long axis down and out to the apex
  blob(-0.026, -0.086, -0.014, 0.026, 0.048, 0.040);                  // right atrium (the right heart border)
  blob(0.006, -0.060, -0.030, 0.030, 0.034, 0.044);                   // the base, filling the middle
  // diaphragm domes (liver under the right, spleen + stomach under the left): convex up into the lung bases, so the
  // lungs keep their deep lateral and posterior recesses (sharp costophrenic angles)
  const domes = [];
  blob(-0.075, -0.262, 0.010, 0.095, 0.135, 0.115); domes.push(soft.pop());
  blob(0.078, -0.278, 0.010, 0.090, 0.135, 0.112); domes.push(soft.pop());
  const dia = add(merge(domes), M.heart, 'diaphragm', 'heart'); dia.visible = false; dia.userData.xrayOnly = true;   // inside the shell's soft base
  soft.push(sweep([P(-0.012, -0.03, -0.035), P(-0.010, 0.040, -0.030), P(-0.002, 0.075, -0.012), P(0.020, 0.083, 0.010), P(0.032, 0.066, 0.034),
    P(0.030, 0.020, 0.044), P(0.026, -0.080, 0.046), P(0.022, -0.150, 0.046)], 0.0135, 0.0135, 28, 14));   // aorta: ascending, arch, descending
  soft.push(sweep([P(-0.030, 0.120, -0.012), P(-0.032, 0.060, -0.012), P(-0.034, -0.040, -0.010)], 0.0095, 0.0095, 10, 12));   // SVC
  soft.push(sweep([P(0.012, -0.010, -0.025), P(0.022, 0.030, -0.012), P(0.030, 0.040, 0.000)], 0.012, 0.012, 8, 12));         // pulmonary trunk
  // hila + vessel trees: arteries branch from each hilum, tapering, stopping 1–2 cm inside the pleura (deterministic)
  const rnd = mulberry(7);
  const hila = { [-1]: [-0.050, 0.020, 0.008], [1]: [0.052, 0.032, 0.010] };
  for (const s of [-1, 1]) {
    const [hu, hv, hw] = hila[s];
    soft.push(sweep([P(s * 0.014, 0.035, -0.002), P(hu, hv, hw)], 0.010, 0.0085, 6, 12));                       // the main pulmonary artery
    const grow = (p, d, len, r, gen) => {
      if (gen > 7 || r < 0.0005) return;
      const pts = [p.clone()];
      let q = p.clone(), dir = d.clone();
      for (let k = 1; k <= 3; k++) {
        let n = null;
        for (let a = 0; a < 4 && !n; a++) {                              // bend away from the pleura rather than stop
          const d2 = dir.clone().add(new THREE.Vector3((rnd() - 0.5), (rnd() - 0.5), (rnd() - 0.5)).multiplyScalar(0.5 + a * 0.4)).normalize();
          const c = q.clone().addScaledVector(d2, len / 3);
          if (inLung(s, -c.z, c.x, c.y, 0.92)) { n = c; dir = d2; }     // local (x = v, y = w, z = −u)
        }
        if (!n) break;
        pts.push(n); q = n;
      }
      if (pts.length < 2) return;
      soft.push(sweep(pts, r, r * 0.8, 3 * (pts.length - 1), 6));
      for (let b = 0; b < 2; b++) {                                     // dichotomous: the daughters split ±30–45°
        const t = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(1.1);
        grow(q, dir.clone().add(t).normalize(), len * (0.74 + rnd() * 0.1), r * 0.76, gen + 1);
      }
    };
    // lobar trunks: up, out, down (the lower lobes carry the most)
    for (const [du, dv, dw, len] of [[0.35, 1, 0.1, 0.034], [0.5, 0.8, 0.5, 0.03], [1, 0.1, -0.2, 0.03], [1, -0.1, 0.4, 0.03], [0.6, -1, 0.15, 0.04], [0.4, -0.8, 0.6, 0.038], [0.7, -0.6, -0.5, 0.034]]) {
      const d = P(s * du, dv, dw).normalize();
      grow(P(hu, hv, hw), d, len, 0.0050, 0);
    }
  }
  const vessels = add(merge(soft), M.heart, 'heart · vessels', 'heart');
  // trachea and main bronchi: an air column over the upper spine (lung channel: tissue at lung density)
  add(merge([sweep([P(0, 0.19, -0.010), P(0, 0.120, -0.006), P(0.002, 0.062, 0.000)], 0.0085, 0.0085, 12, 16),
    sweep([P(0.002, 0.064, 0), P(-0.022, 0.044, 0.004), P(-0.044, 0.026, 0.008)], 0.0066, 0.0055, 8, 12),
    sweep([P(0.002, 0.064, 0), P(0.026, 0.050, 0.004), P(0.048, 0.036, 0.008)], 0.0060, 0.0050, 8, 12)]), M.lung, 'trachea', 'lung');

  // vertebral column T1–T12 (+ C7): bodies with cortical end plates, pedicles (the paired ovals of a PA film),
  // transverse processes meeting the rib heads, spinous processes (the teardrops in the midline)
  const VB = [];
  for (let k = 0; k < 13; k++) {
    const v = 0.192 - k * 0.0285, h = 0.0215 + k * 0.0007, r = 0.0135 + k * 0.0008;
    VB.push(v);
    const body = (rr, hh) => { const g = new THREE.CylinderGeometry(rr, rr, hh, 32); g.scale(1, 1, 1.25); g.rotateZ(Math.PI / 2); g.translate(...P(0, v, 0.046).toArray()); return g; };
    cortex(body(r, h), body(r * 0.82, h * 0.8), 'vertebral column', 0.48, 0.18);
    for (const s of [-1, 1]) {
      const ped = (rr) => { const g = new THREE.CylinderGeometry(rr * 0.75, rr * 0.75, 0.020, 20); g.scale(1.35, 1, 1); g.translate(...P(s * 0.0105, v + 0.003, 0.068).toArray()); return g; };
      cortex(ped(0.0050), ped(0.0032), 'vertebral column', 0.85, 0.45);
      const tp = new THREE.CylinderGeometry(0.0042, 0.0050, 0.026, 12); tp.rotateX(Math.PI / 2); tp.rotateY(s * 0.25);
      tp.translate(...P(s * 0.024, v + 0.002, 0.074).toArray()); add(tp, M.bone, 'vertebral column', 'bone', 0.7);
    }
    const sp = new THREE.CylinderGeometry(0.0028, 0.0050, 0.030, 12); sp.rotateZ(Math.PI / 2 + 0.6); sp.translate(...P(0, v - 0.010, 0.088).toArray());
    add(sp, M.bone, 'vertebral column', 'bone', 0.8);
  }

  // ribs 1–12: from the transverse process, out and slightly up, round the side, then down and in to the
  // costochondral junction (cartilage = soft tissue, invisible); 11–12 float. Flat section ≈ 12 × 5 mm, cortical rim.
  for (let k = 0; k < 12; k++) {
    const v0 = VB[k + 1] + 0.004, end = k >= 10 ? 1.45 - (k - 10) * 0.25 : Math.PI - 1.05 + Math.min(k, 6) * 0.03;
    const reach = k === 0 ? 0.62 : k === 1 ? 0.82 : 0.90;
    for (const s of [-1, 1]) {
      const pts = [P(s * 0.020, v0, 0.072)];
      for (let i = 0; i <= 26; i++) {
        const th = 0.40 + (end - 0.40) * (i / 26);                     // 0 = straight back
        const v = v0 + 0.012 * Math.sin(Math.min(th, 1.6) * 1.9) - (0.040 + 0.006 * Math.min(k, 7)) * Math.max(0, (th - 0.9) / 1.2) ** 1.7;
        const [a, b] = half(v);
        pts.push(P(s * a * reach * Math.sin(th), v, b * 0.86 * Math.cos(th) - 0.004));
      }
      const hgt = 0.0085 + Math.min(k, 6) * 0.0006, th = 0.0042;
      cortex(rib(pts, hgt, th), rib(pts, hgt * 0.62, th * 0.5), 'ribs', 0.95, 0.30);
    }
  }
  // clavicles: sternal notch to the shoulder, a shallow S, rising laterally
  for (const s of [-1, 1]) {
    const pts = [P(s * 0.018, 0.150, -0.080), P(s * 0.055, 0.158, -0.076), P(s * 0.090, 0.164, -0.056), P(s * 0.114, 0.171, -0.030), P(s * 0.124, 0.174, -0.012)];
    cortex(sweep(pts, 0.0068, 0.0060, 30, 16), sweep(pts, 0.0042, 0.0036, 30, 12), 'clavicle', 0.95, 0.3);
  }
  // scapulae: thin blades on the back with a thick lateral border and spine, over the upper lateral lung
  for (const s of [-1, 1]) {
    const blade = new THREE.Shape([[0.090, 0.150], [0.128, 0.160], [0.122, 0.080], [0.104, -0.010], [0.092, 0.030], [0.086, 0.110]].map(([u, v]) => new THREE.Vector2(u, v)));
    const g = new THREE.ExtrudeGeometry(blade, { depth: 0.004, bevelEnabled: false });   // shape in (u, v), depth along w
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) { const u = pos.getX(i), v = pos.getY(i), w = 0.062 + pos.getZ(i) - (u - 0.09) * 0.35; const q = P(s * u, v, w); pos.setXYZ(i, q.x, q.y, q.z); }
    if (s > 0) flip(g);                                              // P mirrors u for the left side
    add(g, M.bone, 'scapula', 'bone', 0.7);
    add(sweep([P(s * 0.122, 0.080, 0.050), P(s * 0.112, 0.030, 0.058), P(s * 0.104, -0.008, 0.064)], 0.0045, 0.0035, 12, 10), M.bone, 'scapula', 'bone', 0.8);
    add(sweep([P(s * 0.088, 0.128, 0.068), P(s * 0.112, 0.140, 0.058), P(s * 0.130, 0.152, 0.040)], 0.0040, 0.0045, 12, 10), M.bone, 'scapula', 'bone', 0.8);
  }
  // sternum: manubrium + body, a flat bar on the front (mostly hidden behind the spine on a PA film)
  const stg = new THREE.BoxGeometry(0.165, 0.011, 0.030); stg.translate(...P(0, 0.060, -0.090).toArray());
  cortex(stg, new THREE.BoxGeometry(0.15, 0.006, 0.022).translate(...P(0, 0.060, -0.090).toArray()), 'sternum', 0.8, 0.35);

  // flat-panel detector: dark slab, thin red edge, cable stub (lies on the floor plate under the phantom)
  const det = new THREE.Group(); det.name = 'detector'; root.add(det);
  const dt = 0.020, slab = new THREE.Mesh(new THREE.BoxGeometry(0.50, dt, 0.42), M.detector);
  slab.position.y = SETUP.det - dt / 2; slab.receiveShadow = slab.castShadow = true; slab.name = 'detector'; det.add(slab);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(SETUP.field.v, SETUP.field.u), M.detFace);
  face.rotation.x = -Math.PI / 2; face.position.y = SETUP.det + 0.0004; face.receiveShadow = true; face.name = 'detector'; det.add(face);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(0.502, 0.004, 0.422), M.red); edge.position.y = SETUP.det - 0.006; edge.name = 'detector'; det.add(edge);

  // column: floor plate, square post behind, a carriage and a fork under the tube's base plate (the beam aperture stays clear)
  const col = new THREE.Group(); col.name = 'column'; root.add(col);
  const floorY = SETUP.det - dt;
  const bx = (w, h, d, x, y, z, mat = M.red) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; m.name = 'column'; col.add(m); return m; };
  const pz = -0.36, topY = DIM.floor + 0.010 - 0.004;                // under the tube's base plate
  bx(0.30, 0.016, 0.26, 0, floorY + 0.008, pz, M.redDark);
  bx(0.075, topY - floorY - 0.07, 0.075, 0, (topY + floorY) / 2 - 0.02, pz);
  bx(0.11, 0.12, 0.10, 0, topY - 0.07, pz + 0.01, M.redDark);        // carriage
  bx(0.40, 0.024, 0.05, 0, topY - 0.024, pz + 0.07);                  // cross bar
  for (const x of [-0.17, 0.17]) bx(0.032, 0.020, 0.33, x, topY - 0.010, pz + 0.21);   // fork arms, outside the aperture
  // floor under it all
  root.userData.floor = floorY;

  root.traverse((o) => { if (o.isMesh && o.userData.tissue !== 'shell') o.castShadow = true; });
  return { root, phantom, detector: det, column: col, materials: M, yc,
    /** world anchors for the balloons */
    anchors: { shell: P(-0.14, -0.06, 0.06), lung: P(-0.10, 0.04, 0.0), heart: P(0.05, -0.09, -0.02), spine: P(0, 0.11, 0.06), det: new THREE.Vector3(-0.20, SETUP.det - 0.01, 0.20) },
    toWorld: (p) => p.clone().add(phantom.position) };
}

function materials() {
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);
  return {
    shell: phys({ color: 0xb8cede, roughness: 0.18, metalness: 0, transparent: true, opacity: 0.24, depthWrite: false,
      clearcoat: 1, clearcoatRoughness: 0.08, side: THREE.DoubleSide }),
    lung: phys({ color: 0x2e4152, roughness: 0.5, transparent: true, opacity: 0.55, depthWrite: false }),
    heart: phys({ color: 0x9aa7b3, roughness: 0.45, transparent: true, opacity: 0.8 }),
    bone: phys({ color: 0xe9e4d6, roughness: 0.55, clearcoat: 0.2 }),
    detector: phys({ color: 0x2b2f34, roughness: 0.6, metalness: 0.1 }),
    detFace: phys({ color: 0x14181c, roughness: 0.7, metalness: 0.0, envMapIntensity: 0.2 }),
    red: phys({ color: 0x9a1a15, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.32 }),
    redDark: phys({ color: 0x7c130f, roughness: 0.62, clearcoat: 0.18 }),
  };
}

// ── geometry helpers (closed, outward-wound: the radiograph measures paths by front / back faces) ───────────
function interp(T, v) {
  if (v <= T[0][0]) return [T[0][1], T[0][2]];
  for (let i = 1; i < T.length; i++) if (v <= T[i][0]) { const u = (v - T[i - 1][0]) / (T[i][0] - T[i - 1][0]); return [T[i - 1][1] + (T[i][1] - T[i - 1][1]) * u, T[i - 1][2] + (T[i][2] - T[i - 1][2]) * u]; }
  const l = T[T.length - 1]; return [l[1], l[2]];
}

/** loft superelliptic rings {v, a (half u), b (half w), cu, cw} along v, capped both ends; local (x = v, y = w, z = −u) */
function loft(S, n = 2.5, seg = 64) {
  const pos = [], idx = [], inside = [];
  const ctr = (s) => new THREE.Vector3(s.v, s.cw || 0, -(s.cu || 0));
  for (const s of S) for (let i = 0; i < seg; i++) {
    const t = (i / seg) * Math.PI * 2, c = Math.cos(t), sn = Math.sin(t);
    pos.push(s.v, (s.cw || 0) + s.b * Math.sign(sn) * Math.abs(sn) ** (2 / n), -((s.cu || 0) + s.a * Math.sign(c) * Math.abs(c) ** (2 / n)));
  }
  for (let r = 0; r < S.length - 1; r++) {
    const m = ctr(S[r]).add(ctr(S[r + 1])).multiplyScalar(0.5);
    for (let i = 0; i < seg; i++) { const a = r * seg + i, b = r * seg + (i + 1) % seg; idx.push(a, a + seg, b, b, a + seg, b + seg); inside.push(m, m); }
  }
  for (const [r, k] of [[0, 1], [S.length - 1, -1]]) {               // caps: a centre fan, inside = a little way in along v
    const ci = pos.length / 3, c = ctr(S[r]); pos.push(c.x, c.y, c.z);
    const m = c.clone(); m.x += k * 0.01;
    for (let i = 0; i < seg; i++) { idx.push(ci, r * seg + i, r * seg + (i + 1) % seg); inside.push(m); }
  }
  return closed(pos, idx, inside);
}

/** a tapered tube along points (radius r0 → r1), capped: vessels, airways, clavicles */
function sweep(pts, r0, r1 = r0, n = 24, radial = 12) {
  return section(pts, n, radial, (i, t) => [r0 + (r1 - r0) * t, r0 + (r1 - r0) * t], null);
}
/** a rib: flat section, `h` along the body's long axis side, `t` radial (thickness through the chest wall) */
function rib(pts, h, t) {
  return section(pts, 40, 14, () => [t / 2, h / 2], (p) => new THREE.Vector3(0, p.y, p.z).normalize());   // local radial = (0, w, −u)
}
/** generic swept section: rad(i, t) → [rN, rB]; `out(p)` fixes the N axis (else Frenet) */
function section(pts, n, radial, rad, out) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const fr = curve.computeFrenetFrames(n, false), pos = [], idx = [], inside = [], C = [];
  for (let i = 0; i <= n; i++) {
    const p = curve.getPointAt(i / n), T = curve.getTangentAt(i / n); C.push(p);
    let N = fr.normals[i], B = fr.binormals[i];
    if (out) { N = out(p); N.addScaledVector(T, -N.dot(T)).normalize(); B = T.clone().cross(N).normalize(); }
    const [rn, rb] = rad(i, i / n);
    for (let j = 0; j < radial; j++) { const a = (j / radial) * Math.PI * 2, x = Math.cos(a) * rn, y = Math.sin(a) * rb;
      pos.push(p.x + x * N.x + y * B.x, p.y + x * N.y + y * B.y, p.z + x * N.z + y * B.z); }
  }
  for (let i = 0; i < n; i++) { const m = C[i].clone().add(C[i + 1]).multiplyScalar(0.5);
    for (let j = 0; j < radial; j++) { const a = i * radial + j, b = i * radial + (j + 1) % radial; idx.push(a, b, a + radial, b, b + radial, a + radial); inside.push(m, m); } }
  for (const [i, k] of [[0, 1], [n, -1]]) {
    const ci = pos.length / 3, p = C[i]; pos.push(p.x, p.y, p.z);
    const m = p.clone().addScaledVector(curve.getTangentAt(i / n), k * 1e-4);
    for (let j = 0; j < radial; j++) { idx.push(ci, i * radial + j, i * radial + (j + 1) % radial); inside.push(m); }
  }
  return closed(pos, idx, inside);
}
/** merge indexed geometries (position only) */
function merge(gs) {
  const pos = [], idx = [];
  for (const g of gs) {
    const base = pos.length / 3, p = g.attributes.position.array;
    for (let i = 0; i < p.length; i++) pos.push(p[i]);
    const I = g.index ? g.index.array : [...Array(p.length / 3).keys()];
    for (let i = 0; i < I.length; i++) idx.push(I[i] + base);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function flip(g) {
  if (g.index) { const I = g.index.array; for (let i = 0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; } }
  else { const p = g.attributes.position; for (let i = 0; i < p.count; i += 3) { const a = [p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1)]; p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)); p.setXYZ(i + 2, ...a); } }
  g.computeVertexNormals();
}
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/** a tube along points with flat caps, as one closed mesh (section slightly flattened in y) */
function cappedTube(pts, r, radial = 14) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const n = 40, fr = curve.computeFrenetFrames(n, false), pos = [], idx = [], inside = [], C = [];
  for (let i = 0; i <= n; i++) {
    const p = curve.getPointAt(i / n), N = fr.normals[i], B = fr.binormals[i]; C.push(p);
    for (let j = 0; j < radial; j++) { const t = (j / radial) * Math.PI * 2, x = Math.cos(t), y = Math.sin(t);
      pos.push(p.x + r * (x * N.x + y * B.x), p.y + r * 0.75 * (x * N.y + y * B.y), p.z + r * (x * N.z + y * B.z)); }
  }
  for (let i = 0; i < n; i++) { const m = C[i].clone().add(C[i + 1]).multiplyScalar(0.5);
    for (let j = 0; j < radial; j++) { const a = i * radial + j, b = i * radial + (j + 1) % radial; idx.push(a, b, a + radial, b, b + radial, a + radial); inside.push(m, m); } }
  for (const [i, k] of [[0, 1], [n, -1]]) {
    const ci = pos.length / 3, p = C[i]; pos.push(p.x, p.y, p.z);
    const m = p.clone().addScaledVector(curve.getTangentAt(i / n), k * r * 0.5);
    for (let j = 0; j < radial; j++) { idx.push(ci, i * radial + j, i * radial + (j + 1) % radial); inside.push(m); }
  }
  return closed(pos, idx, inside);
}

/** wind every triangle so its normal points away from its own inside point (the radiograph needs true front faces) */
function closed(pos, idx, inside) {
  const v = (i) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  for (let f = 0; f < idx.length / 3; f++) {
    const a = v(idx[f * 3]), b = v(idx[f * 3 + 1]), c = v(idx[f * 3 + 2]);
    const nrm = b.clone().sub(a).cross(c.clone().sub(a)), cen = a.add(b).add(c).multiplyScalar(1 / 3);
    if (nrm.dot(cen.sub(inside[f])) < 0) { const t = idx[f * 3 + 1]; idx[f * 3 + 1] = idx[f * 3 + 2]; idx[f * 3 + 2] = t; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
