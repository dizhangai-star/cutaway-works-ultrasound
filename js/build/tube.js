// The tube assembly, S0.5 rough: real outline (SOURCES S1), insert modelled (BRIEF §3).
// Axis = world X, cathode at -X, anode at +X, central ray straight down (-Y) at x = 0, HV receptacles
// leave the same side radially (back and up), housing centre at the origin. Metres.

import * as THREE from 'three';
import { latheX, shellX, cylBetween, tube, bolt, box, shadowAll, panelX } from './geo.js';

export const DIM = {
  len: 0.476, R: 0.070, Rring: 0.0762, Rin: 0.064,
  floor: -0.158,
  spot: new THREE.Vector3(0, -0.030, 0),       // focal spot on the track (track radius 30 mm, modelled)
  cathode: new THREE.Vector3(-0.024, -0.030, 0),
  recAngle: 38 * Math.PI / 180,                 // receptacles: from straight back, tilted up
  recX: { anode: 0.1465, cathode: -0.1345 },    // from the central ray (SOURCES S1)
  trackAngle: 12 * Math.PI / 180,
};

export function buildTube(M) {
  const root = new THREE.Group(); root.name = 'assembly';
  const housing = new THREE.Group(); housing.name = 'housing';
  const insert = new THREE.Group(); insert.name = 'insert';
  const rotor = new THREE.Group(); rotor.name = 'rotor';     // turns round X
  const stand = new THREE.Group(); stand.name = 'stand';
  root.add(housing, insert, stand);
  const add = (g, m) => { g.add(m); return m; };
  // name a part; `ok` = parts it is built into (joints the audit accepts: seals, pressed fits, fasteners)
  const name = (m, n, ...ok) => { m.name = n; if (ok.length) m.userData.auditOk = ok; return m; };

  // ── housing (outline-true lengths and diameters) ───────────────────────────
  const H = DIM.len / 2;
  // body: the enamelled casting between the clamp rings; end caps: domed sand-cast aluminium, joined under the rings
  const J = H - 0.040, t = 0.006;
  name(add(housing, new THREE.Mesh(shellX(0.070, 0.064, -J, J, 128), M.enamel)), 'housing shell');
  const capProf = [[0.064, J], [0.070, J], [0.067, H - 0.030], [0.059, H - 0.019], [0.047, H - 0.009], [0.032, H - 0.002], [0.024, H], [0, H],
    [0, H - t], [0.022, H - t], [0.043, H - 0.014], [0.055, H - 0.023], [0.061, H - 0.032], [0.064, J]];
  for (const s of [-1, 1]) {
    const pr = s > 0 ? capProf : capProf.map(([r, x]) => [r, -x]).reverse();
    name(add(housing, new THREE.Mesh(latheX(pr, 128), M.cast)), 'end cap', 'housing shell');
  }
  // lead lining, visible in section
  name(add(housing, new THREE.Mesh(shellX(0.0638, 0.0608, -0.19, 0.19), M.lead)), 'lead lining', 'housing shell');   // 3 mm Pb (modelled)
  // clamp rings Ø 152.4 × 11.1 at the cap joints
  for (const s of [-1, 1]) {
    const x = s * (H - 0.040);
    name(add(housing, new THREE.Mesh(latheX([[0.0695, x - 0.0056], [0.0745, x - 0.0056], [0.0762, x - 0.004], [0.0762, x + 0.004], [0.0745, x + 0.0056], [0.0695, x + 0.0056], [0.0695, x - 0.0056]], 128), M.alu)), 'clamp ring', 'housing shell', 'end cap');
    // ring clamp lug + screw at the top-back
    const lug = name(add(housing, box(0.014, 0.012, 0.016, M.alu)), 'clamp lug', 'clamp ring'); lug.position.set(x, 0.079 * Math.sin(2.4), 0.079 * Math.cos(2.4));
    lug.rotation.x = -2.4 + Math.PI / 2;
    // end-cap bolts
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.2;
      const b = name(add(housing, bolt(0.004, 0.003, M.steel)), 'cap bolt', 'end cap');
      const r = 0.040, xb = s * (H - 0.0075);
      b.position.set(xb, r * Math.cos(a), r * Math.sin(a));
      b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(s * 0.55, Math.cos(a) * 0.83, Math.sin(a) * 0.83).normalize());
    }
  }
  // end bosses: cathode end = expansion bellows cap (modelled), anode end = earthing boss
  name(add(housing, new THREE.Mesh(latheX([[0, -H - 0.014], [0.018, -H - 0.014], [0.021, -H - 0.011], [0.021, -H - 0.009], [0.019, -H - 0.007], [0.021, -H - 0.005], [0.021, -H - 0.003], [0.019, -H - 0.001], [0.024, -H + 0.001], [0, -H + 0.001]], 64, 50), M.alu)), 'bellows cap', 'end cap');
  name(add(housing, new THREE.Mesh(latheX([[0, H - 0.001], [0.022, H - 0.001], [0.022, H + 0.006], [0.014, H + 0.008], [0.014, H + 0.016], [0, H + 0.016]], 64), M.alu)), 'anode end boss', 'end cap');

  // window port, 90 × 90 flange under the central ray, 4 × M5, Ø 74 aperture (SOURCES S1)
  const port = add(housing, new THREE.Group()); port.name = 'window port';
  const flange = name(add(port, box(0.090, 0.008, 0.090, M.alu)), 'port flange', 'housing shell'); flange.position.y = -0.0745;
  const neck = name(add(port, new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.050, 0.010, 64), M.cast)), 'port neck', 'housing shell', 'lead lining', 'port flange'); neck.position.y = -0.068;
  for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const b = name(add(port, bolt(0.0045, 0.004, M.steel)), 'flange bolt', 'port flange'); b.position.set(dx * 0.039, -0.0705, dz * 0.039); }   // heads on top: the filter slides underneath
  const win = add(port, new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.002, 64), M.window)); win.position.y = -0.0790; name(win, 'window', 'port flange', 'port neck');
  const winRing = name(add(port, new THREE.Mesh(new THREE.TorusGeometry(0.0375, 0.0016, 10, 64), M.steel)), 'window ring', 'window', 'port flange'); winRing.rotation.x = Math.PI / 2; winRing.position.y = -0.0792;
  // added-filter slot: two rails under the flange, a 2.5 mm Al filter slid in from the anode side (pull tab, stamped value)
  for (const s of [-1, 1]) { const r = name(add(port, box(0.090, 0.0062, 0.006, M.cast)), 'filter rail', 'port flange'); r.position.set(0, -0.0816, s * 0.043); }
  const filt = name(add(port, box(0.088, 0.0025, 0.080, M.filter)), 'added filter', 'filter rail'); filt.position.set(0.001, -0.0822, 0);
  const tab = name(add(port, box(0.012, 0.0025, 0.030, M.filter)), 'added filter', 'filter rail'); tab.position.set(0.051, -0.0822, 0);
  const grip = name(add(port, cylBetween([0.0545, -0.0835, 0], [0.0545, -0.0880, 0], 0.0028, M.redRubber, 16)), 'added filter', 'added filter');
  // collimator interface: a 6 mm adapter plate with the Ø 70 beam aperture, 2 locating dowels, 4 knurled thumb screws
  const ad = new THREE.Shape(); ad.moveTo(-0.045, -0.045); ad.lineTo(0.045, -0.045); ad.lineTo(0.045, 0.045); ad.lineTo(-0.045, 0.045); ad.closePath();
  const ah = new THREE.Path(); ah.absarc(0, 0, 0.035, 0, Math.PI * 2, true); ad.holes.push(ah);
  const adg = new THREE.ExtrudeGeometry(ad, { depth: 0.005, bevelEnabled: true, bevelSize: 0.0008, bevelThickness: 0.0008, bevelSegments: 1, curveSegments: 64 });
  adg.rotateX(Math.PI / 2); adg.translate(0, -0.0855, 0);
  name(add(port, new THREE.Mesh(adg, M.alu)), 'collimator adapter', 'filter rail');
  for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const k = name(add(port, cylBetween([dx * 0.039, -0.0912, dz * 0.039], [dx * 0.039, -0.0975, dz * 0.039], 0.0042, M.steel, 20)), 'thumb screw', 'collimator adapter');
    for (let i = 0; i < 10; i++) { const a2 = i / 10 * Math.PI * 2; const r = box(0.0009, 0.0055, 0.0009, M.steel); r.position.set(dx * 0.039 + 0.0043 * Math.cos(a2), -0.0943, dz * 0.039 + 0.0043 * Math.sin(a2)); r.rotation.y = -a2; r.name = 'thumb screw'; r.userData.auditOk = ['thumb screw']; port.add(r); }
  }
  for (const dz of [-1, 1]) name(add(port, cylBetween([dz * -0.030, -0.0912, dz * 0.039], [dz * -0.030, -0.0950, dz * 0.039], 0.0018, M.steel, 12)), 'locating dowel', 'collimator adapter');

  // HV receptacles: same side, radially, 90° to the beam (anode at +146.5, cathode at -134.5)
  const rdir = new THREE.Vector3(0, Math.sin(DIM.recAngle), -Math.cos(DIM.recAngle));
  const WELL = { anode: 0.036, cathode: 0.046 };          // well floor, from the tube axis (clear of the glass)
  const cables = [];
  for (const [key, x] of Object.entries(DIM.recX)) {
    const g = add(housing, new THREE.Group()); g.name = `${key} receptacle`; g.userData.auditOk = ['housing shell', 'lead lining'];
    g.position.set(x, 0, 0); g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), rdir);
    // inside: epoxy insulator well into the oil (socket contact at its floor); outside: enamelled boss on the casting,
    // receptacle flange with 4 bolts, bayonet nut Ø 70 (3 lugs, knurled ring), rubber plug, clamp collar, red strain relief
    const d0 = WELL[key];
    g.add(lathY([[0.014, d0], [0.022, 0.054], [0.034, 0.054], [0.034, 0.0562]], M.epoxy));
    g.add(lathY([[0.006, d0 - 0.0015], [0.006, d0 + 0.0005]], M.nickel));
    g.add(lathY([[0.042, 0.056], [0.042, 0.074], [0.040, 0.076]], M.enamel));
    g.add(lathY([[0.045, 0.0755], [0.045, 0.0805], [0.043, 0.081]], M.alu));
    for (let k = 0; k < 4; k++) { const a2 = (k + 0.5) / 4 * Math.PI * 2; const bb = bolt(0.0032, 0.0028, M.steel); bb.position.set(0.0405 * Math.cos(a2), 0.0805, 0.0405 * Math.sin(a2)); g.add(bb); }
    g.add(lathY([[0.035, 0.080], [0.035, 0.100], [0.032, 0.104]], M.alu));
    for (let k = 0; k < 3; k++) { const a2 = k / 3 * Math.PI * 2 + 0.4; const l = box(0.008, 0.007, 0.006, M.alu); l.position.set(0.037 * Math.cos(a2), 0.0845, 0.037 * Math.sin(a2)); l.rotation.y = -a2; g.add(l); }
    const knurl = new THREE.Mesh(new THREE.CylinderGeometry(0.0352, 0.0352, 0.010, 48, 1), M.steel); knurl.position.y = 0.094; g.add(knurl);
    for (let k = 0; k < 24; k++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.0022, 0.010, 0.0022), M.steel); const a2 = k / 24 * Math.PI * 2; r.position.set(0.0355 * Math.cos(a2), 0.094, 0.0355 * Math.sin(a2)); r.rotation.y = -a2; g.add(r); }
    g.add(lathY([[0.024, 0.100], [0.026, 0.104], [0.026, 0.150], [0.022, 0.158]], M.rubber));
    g.add(lathY([[0.0228, 0.140], [0.0275, 0.141], [0.0275, 0.149], [0.0228, 0.150]], M.steel));
    const cs = box(0.006, 0.010, 0.008, M.steel); cs.position.set(0.030, 0.145, 0); g.add(cs);
    g.add(lathY([[0.020, 0.156], [0.018, 0.176], [0.014, 0.190]], M.redRubber));
    // cable: leaves the plug along the receptacle axis, arcs up and out of frame
    const p0 = new THREE.Vector3(x, 0, 0).addScaledVector(rdir, 0.185);
    const pts = [p0, p0.clone().addScaledVector(rdir, 0.06), new THREE.Vector3(x * 1.25, 0.26, -0.22), new THREE.Vector3(x * 1.6, 0.50, -0.30)];
    cables.push(name(add(housing, tube(pts.map((p) => p.toArray()), 0.0105, M.rubber, 80, 14)), 'HV cable', `${key} receptacle`));
  }
  // stator terminal box on the top-back, temperature relay boss
  const up = new THREE.Vector3(0, Math.sin(1.9), Math.cos(1.9));
  const tb = name(add(housing, box(0.060, 0.026, 0.040, M.enamel)), 'terminal box', 'housing shell'); tb.position.set(0.04, 0.0775 * Math.sin(1.9), 0.0775 * Math.cos(1.9) - 0.003); tb.rotation.x = -1.9 + Math.PI / 2;
  const tbl = name(add(housing, box(0.064, 0.004, 0.044, M.cast)), 'terminal lid', 'terminal box'); tbl.position.copy(tb.position).addScaledVector(up, 0.014); tbl.rotation.copy(tb.rotation);
  for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const sc = name(add(housing, bolt(0.0026, 0.0018, M.steel)), 'lid screw', 'terminal lid');
    sc.position.copy(tbl.position).add(new THREE.Vector3(dx * 0.028, 0, 0)).addScaledVector(new THREE.Vector3(0, -Math.cos(1.9), Math.sin(1.9)), dz * 0.018).addScaledVector(up, 0.002);
    sc.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
  }
  // stator cable gland on the anode-side face of the box, its cable dropping back behind the housing
  const gp = tb.position.clone().add(new THREE.Vector3(0.030, 0, 0));
  name(add(housing, cylBetween(gp.toArray(), gp.clone().add(new THREE.Vector3(0.010, 0, 0)).toArray(), 0.0075, M.steel, 6)), 'cable gland', 'terminal box');
  name(add(housing, cylBetween(gp.clone().add(new THREE.Vector3(0.0095, 0, 0)).toArray(), gp.clone().add(new THREE.Vector3(0.016, 0, 0)).toArray(), 0.0058, M.rubber, 24)), 'cable gland', 'cable gland');
  const g0 = gp.clone().add(new THREE.Vector3(0.0155, 0, 0));
  cables.push(name(add(housing, tube([g0.toArray(), [g0.x + 0.010, g0.y, g0.z - 0.002], [g0.x + 0.020, g0.y + 0.004, g0.z - 0.024], [g0.x + 0.028, g0.y + 0.080, -0.10], [g0.x + 0.03, 0.32, -0.22]], 0.0045, M.rubber, 60, 10)), 'stator cable', 'cable gland'));
  const relay = add(housing, cylBetween([-0.07, 0.06, 0.03], [-0.07, 0.076, 0.036], 0.011, M.alu, 32)); name(relay, 'temperature relay', 'housing shell');
  // nameplate on the front: etched anodised plate, type data only (no maker), 4 rivets
  {
    const r = 0.0702, x0 = -0.110, x1 = -0.036, a0 = 62 * Math.PI / 180, a1 = 88 * Math.PI / 180;
    const pg = panelX(r, x0, x1, a0, a1, 24, 8);
    const np = name(add(housing, new THREE.Mesh(pg, M.plate)), 'nameplate', 'housing shell');
    M.plate.map = nameplateTexture(); M.plate.needsUpdate = true;
    for (const [x, a] of [[x0 + 0.004, a0 + 0.06], [x1 - 0.004, a0 + 0.06], [x0 + 0.004, a1 - 0.06], [x1 - 0.004, a1 - 0.06]]) {
      const rv = name(add(housing, new THREE.Mesh(new THREE.SphereGeometry(0.0016, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.ball)), 'rivet', 'nameplate');
      rv.position.set(x, Math.cos(a) * r, Math.sin(a) * r); rv.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, Math.cos(a), Math.sin(a)));
    }
    np.userData.redraw = () => { M.plate.map = nameplateTexture(); M.plate.needsUpdate = true; };
  }
  // mounting bosses 4 × M6 on the underside
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const b = add(housing, cylBetween([sx * 0.085, -0.062, sz * 0.03], [sx * 0.085, -0.072, sz * 0.03], 0.007, M.cast, 20)); name(b, 'mount boss', 'housing shell'); }

  // ── oil: fills the housing; only its far wall shows through the cut, amber ──
  // a skin just inside the housing wall and both end domes
  name(add(housing, new THREE.Mesh(latheX([[0, -0.2315], [0.022, -0.2315], [0.0425, -0.2235], [0.0545, -0.2145], [0.0602, -0.205], [0.0602, 0.205], [0.0545, 0.2145], [0.0425, 0.2235], [0.022, 0.2315], [0, 0.2315]], 96, 40), M.oil)), 'oil').userData.noAudit = true;

  // ── insert (modelled beyond the published numbers) ─────────────────────────
  // glass envelope: cathode neck, bulb round the disc, rotor neck; a surface (not cut), ends sealed into Kovar caps
  const gl = [[0.018, -0.200], [0.022, -0.180], [0.034, -0.150], [0.048, -0.105], [0.054, -0.060], [0.055, 0.010], [0.052, 0.034], [0.040, 0.046], [0.031, 0.056], [0.030, 0.150], [0.026, 0.170], [0.012, 0.182]];
  const glassG = latheX(gl, 96, 60);
  const glass = add(insert, new THREE.Mesh(glassG, M.glass)); glass.name = 'glass envelope'; glass.userData.audit = true;
  const rim = add(insert, new THREE.Mesh(glassG, M.glassRim)); rim.name = 'glass rim'; rim.userData.noDrawing = true; rim.userData.noAudit = true;
  const gr = (x) => { for (let i = 0; i < gl.length - 1; i++) if (x <= gl[i + 1][1]) return gl[i][0] + (gl[i + 1][0] - gl[i][0]) * (x - gl[i][1]) / (gl[i + 1][1] - gl[i][1]); return gl.at(-1)[0]; };
  const radial = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];             // angle round X: 0 = +Y (up), 90° = +Z (front)
  const spoke = (g, name, x, deg, r0, r1, w, tx, mat) => {
    const a = deg * Math.PI / 180, [y, z] = radial(a, (r0 + r1) / 2);
    const s = add(g, box(tx, r1 - r0, w, mat)); s.position.set(x, y, z); s.rotation.x = a; s.name = name; return s;
  };
  const SUP = [30, 150, 270];                                              // support spokes, clear of the HV leads at 308°

  // cathode end: Kovar seal cap, three feedthrough pins (common, small, large), stem
  name(add(insert, new THREE.Mesh(latheX([[0, -0.214], [0.0195, -0.214], [0.0195, -0.199], [0.0165, -0.199], [0.0165, -0.204], [0, -0.204]], 64), M.kovar)), 'cathode seal', 'glass envelope');
  const PIN = { large: [0, 0, -0.0125], small: [0, 0, 0.0125], common: [0, -0.0125, 0] };
  for (const [y, z] of Object.values(PIN).map((p) => [p[1], p[2]])) name(add(insert, cylBetween([-0.226, y, z], [-0.2035, y, z], 0.0012, M.nickel, 12)), 'feedthrough pin', 'cathode seal');
  name(add(insert, new THREE.Mesh(latheX([[0, -0.204], [0.010, -0.204], [0.010, -0.160], [0.007, -0.150], [0.007, -0.080], [0, -0.080]], 48), M.nickel)), 'cathode stem', 'cathode seal');
  name(add(insert, tube([[-0.084, 0, 0], [-0.062, -0.002, 0], [-0.046, -0.022, 0], [-0.034, -0.030, 0]], 0.0055, M.nickel, 40, 14)), 'cathode arm', 'cathode stem', 'focusing cup');
  // focusing cup with two filament slots, tungsten coils glowing with the filament state
  const cup = add(insert, new THREE.Group()); cup.name = 'focusing cup'; cup.position.copy(DIM.cathode);
  cup.add(new THREE.Mesh(latheX([[0, -0.016], [0.011, -0.016], [0.013, -0.012], [0.013, -0.002], [0.010, 0.0], [0.006, 0.0], [0.006, -0.003], [0, -0.003]], 48), M.nickel));
  const slotMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
  for (const [dz, w] of [[-0.0032, 0.0034], [0.0032, 0.0022]]) { const s = box(0.001, 0.0016, w * 2, slotMat); s.position.set(0.0003, 0, dz); s.userData.noAudit = true; cup.add(s); }
  const filMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffb060, emissiveIntensity: 0, roughness: 0.4 });
  for (const [dz, len, nm] of [[-0.0032, 0.006, 'large filament'], [0.0032, 0.004, 'small filament']]) {
    const pts = []; for (let i = 0; i <= 60; i++) { const a = i / 60 * Math.PI * 2 * 10; pts.push([-0.0012 + 0.0004 * Math.cos(a), 0.0004 * Math.sin(a), dz - len / 2 + len * i / 60]); }
    name(add(cup, tube(pts, 0.00012, filMat, 240, 4)), nm, 'focusing cup');
    for (const e of [-1, 1]) name(add(cup, cylBetween([-0.0008, 0, dz + e * (len / 2 - 0.0003)], [-0.0032, 0, dz + e * (len / 2 - 0.0003)], 0.00016, M.nickel, 6)), nm, 'focusing cup');
  }
  // filament leads: from the large / small pins along the stem and the arm into the back of the cup; common pin → stem
  for (const s of [-1, 1]) name(add(insert, tube([[-0.2035, 0, s * 0.0125], [-0.175, 0, s * 0.0125], [-0.150, 0, s * 0.0105], [-0.100, 0, s * 0.0095], [-0.084, 0, s * 0.0080],
    [-0.062, -0.002, s * 0.0082], [-0.050, -0.016, s * 0.0082], [-0.043, -0.026, s * 0.0064], [-0.0405, -0.030, s * 0.0035]], 0.0007, M.nickel, 80, 6)), 'filament lead', 'feedthrough pin', 'focusing cup');
  name(add(insert, tube([[-0.2035, -0.0125, 0], [-0.2005, -0.0112, 0], [-0.1975, -0.0104, 0]], 0.0007, M.nickel, 8, 6)), 'common lead', 'feedthrough pin', 'cathode stem');

  // anode end: Kovar seal cap carrying the stationary bearing shaft, terminal stud
  name(add(insert, new THREE.Mesh(latheX([[0, 0.1795], [0.0135, 0.1795], [0.0135, 0.186], [0.009, 0.188], [0, 0.188]], 64), M.kovar)), 'anode seal', 'glass envelope');
  name(add(insert, new THREE.Mesh(latheX([[0, 0.188], [0.005, 0.188], [0.005, 0.200], [0, 0.200]], 24), M.shaft)), 'anode terminal', 'anode seal');
  name(add(insert, new THREE.Mesh(latheX([[0, 0.052], [0.008, 0.052], [0.008, 0.1795], [0, 0.1795]], 32), M.shaft)), 'bearing shaft', 'anode seal');

  // rotor (turns round X): Mo disc Ø 74 with a 12° bevel facing the cathode, W-Re focal track, graphite backing,
  // Mo stem → hub → iron core inside the copper sleeve (the induction motor's armature), end cap
  insert.add(rotor);
  const tn = Math.tan(DIM.trackAngle);
  const u = (r) => -0.0003 + (r - 0.030) * tn;            // bevel: x of the front face at radius r
  name(add(rotor, new THREE.Mesh(latheX([[0, -0.0070], [0.0075, -0.0070], [0.0082, -0.0050], [0.022, -0.0035], [0.0220, u(0.022)], [0.037, u(0.037)], [0.037, 0.0095], [0.034, 0.0105], [0.012, 0.0115], [0.0, 0.0115]], 128), M.moly)), 'anode disc');
  const track = name(add(rotor, new THREE.Mesh(latheX([[0.0255, u(0.0255) - 0.0002], [0.0345, u(0.0345) - 0.0002]], 160), M.tungsten)), 'focal track', 'anode disc');
  name(add(rotor, new THREE.Mesh(latheX([[0.012, 0.0112], [0.033, 0.0112], [0.034, 0.0135], [0.034, 0.026], [0.031, 0.028], [0.010, 0.028], [0.010, 0.0112]], 96), M.graphite)), 'graphite backing', 'anode disc');
  // marks on the disc face so the spin reads
  const marks = [];
  for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; const s = name(add(rotor, box(0.0008, 0.010, 0.0016, M.steel)), 'disc mark', 'anode disc'); s.position.set(-0.0045, 0.013 * Math.cos(a), 0.013 * Math.sin(a)); s.rotation.x = a; marks.push(s); }
  name(add(rotor, new THREE.Mesh(latheX([[0, -0.0085], [0.0055, -0.0085], [0.0065, -0.0070], [0.0065, -0.0050], [0, -0.0050]], 6, 10), M.steel)), 'disc nut', 'anode disc');
  name(add(rotor, new THREE.Mesh(latheX([[0, 0.0115], [0.006, 0.0115], [0.006, 0.0445], [0, 0.0445]], 32), M.moly)), 'stem', 'anode disc', 'rotor hub');
  name(add(rotor, new THREE.Mesh(latheX([[0, 0.044], [0.021, 0.044], [0.0235, 0.0465], [0.0235, 0.050], [0, 0.050]], 64), M.shaft)), 'rotor hub', 'rotor core', 'rotor sleeve');
  name(add(rotor, new THREE.Mesh(shellX(0.0205, 0.0165, 0.050, 0.126, 96), M.iron)), 'rotor core');
  name(add(rotor, new THREE.Mesh(latheX([[0.0205, 0.050], [0.0235, 0.050], [0.0235, 0.1245], [0.0225, 0.126], [0.0205, 0.126], [0.0205, 0.050]], 96), M.copper)), 'rotor sleeve', 'rotor core');
  name(add(rotor, new THREE.Mesh(shellX(0.0235, 0.0095, 0.126, 0.130, 96), M.shaft)), 'rotor end cap', 'rotor core', 'rotor sleeve');
  // spinning features + their motion-blur smears (render/spinblur.js fades one into the other by the true rpm)
  const spin = (src, extra) => { const m = src.clone(); m.transparent = true; m.userData = { ...src.userData, ...extra }; M[`${Object.keys(M).find((k) => M[k] === src)}Spin`] = m; return m; };
  const smear = (src) => { const m = new THREE.MeshStandardMaterial({ color: src.color, roughness: src.roughness, metalness: src.metalness, transparent: true, opacity: 0, depthWrite: false });
    m.userData = { ...src.userData }; M[`${Object.keys(M).find((k) => M[k] === src)}Smear`] = m; return m; };
  const barM = spin(M.dark), barS = smear(M.dark), markM = spin(M.steel), markS = smear(M.steel), ballM = spin(M.ball), ballS = smear(M.ball);
  const bars = [];
  for (let k = 0; k < 18; k++) { const a = k / 18 * Math.PI * 2; const s = name(add(rotor, box(0.070, 0.0012, 0.0015, barM)), 'rotor bar', 'rotor sleeve'); s.position.set(0.086, 0.0236 * Math.cos(a), 0.0236 * Math.sin(a)); s.rotation.x = a; bars.push(s); }
  for (const m of marks) m.material = markM;
  const markRing = name(add(rotor, new THREE.Mesh(shellX(0.0182, 0.0078, -0.0049, -0.0041, 96), markS)), 'disc mark', 'anode disc');
  const barBand = name(add(rotor, new THREE.Mesh(shellX(0.0242, 0.0234, 0.051, 0.121, 96), barS)), 'rotor bar', 'rotor sleeve'); barBand.userData.auditOk = ['rotor sleeve', 'rotor bar'];

  // two ball bearings: inner race on the fixed shaft, outer race in the rotor core, 8 balls in a cage turning at ≈ 0.4 × rotor
  const cages = [];
  for (const bx of [0.062, 0.114]) {
    name(add(insert, new THREE.Mesh(shellX(0.0105, 0.0080, bx - 0.003, bx + 0.003, 48), M.shaft)), 'inner race', 'bearing shaft', 'bearing balls');
    name(add(rotor, new THREE.Mesh(shellX(0.0165, 0.0140, bx - 0.003, bx + 0.003, 48), M.shaft)), 'outer race', 'rotor core', 'bearing balls');
    const cage = add(insert, new THREE.Group()); cage.name = 'bearing balls'; cage.position.x = bx; cages.push(cage);
    for (let k = 0; k < 8; k++) { const [y, z] = radial(k / 8 * Math.PI * 2, 0.01225); const b = add(cage, new THREE.Mesh(new THREE.SphereGeometry(0.0018, 16, 12), ballM)); b.position.set(0, y, z); }
    const tor = new THREE.TorusGeometry(0.01225, 0.0018, 12, 64); tor.rotateY(Math.PI / 2);
    add(cage, new THREE.Mesh(tor, ballS)).name = 'bearing balls';
  }

  // insert supports: epoxy rings round the two glass necks, three spokes each to the lead lining (modelled)
  for (const [x, nm] of [[-0.185, 'cathode support'], [0.160, 'anode support']]) {
    const r0 = gr(x), r1 = r0 + 0.005;
    name(add(insert, new THREE.Mesh(shellX(r1, r0, x - 0.004, x + 0.004, 64), M.epoxy)), nm, 'glass envelope');
    for (const d of SUP) name(spoke(insert, nm, x, d, r1 - 0.0005, 0.0608, 0.008, 0.008, M.epoxy), nm, 'lead lining');
  }

  // stator outside the glass: laminated core (1.5 mm sheets read as fine ridges) + copper end windings, held by three spokes
  const core = [[0.034, 0.058], [0.054, 0.058]];
  for (let x = 0.058; x < 0.1115; x += 0.0015) core.push([0.054, x + 0.0002], [0.0532, x + 0.00075], [0.054, x + 0.0013]);
  core.push([0.054, 0.112], [0.034, 0.112], [0.034, 0.058]);
  name(add(insert, new THREE.Mesh(latheX(core, 96, 10), M.lam)), 'stator core');
  // end windings: rounded copper rings just outside the glass shoulder (cathode side) and neck (anode side)
  const ew = [[0.040, 0.058], [0.040, 0.051], [0.042, 0.047], [0.047, 0.0455], [0.052, 0.047], [0.0545, 0.051], [0.0548, 0.058], [0.040, 0.058]];
  name(add(insert, new THREE.Mesh(latheX(ew, 96, 50), M.winding)), 'stator winding', 'stator core');
  name(add(insert, new THREE.Mesh(latheX(ew.map(([r, x]) => [r, 0.170 - x]).reverse(), 96, 50), M.winding)), 'stator winding', 'stator core');
  for (let k = 0; k < 12; k++) { const a = (k + 0.5) / 12 * Math.PI * 2; const b = name(add(insert, box(0.050, 0.004, 0.006, M.winding)), 'stator winding', 'stator core'); b.position.set(0.085, 0.0545 * Math.cos(a), 0.0545 * Math.sin(a)); b.rotation.x = a; }
  for (const d of SUP) name(spoke(insert, 'stator mount', 0.085, d, 0.0538, 0.0608, 0.008, 0.020, M.epoxy), 'stator mount', 'stator core', 'lead lining');

  // HV leads in the oil: receptacle sockets → cathode pins (three wires) / anode terminal (one)
  const rd = new THREE.Vector3(0, Math.sin(DIM.recAngle), -Math.cos(DIM.recAngle));
  const sock = (x) => new THREE.Vector3(x, 0, 0).addScaledVector(rd, (x > 0 ? 0.036 : 0.046) - 0.001);
  const at = (x, r) => [x, rd.y * r, rd.z * r];
  {
    const S = sock(DIM.recX.cathode);
    const order = [PIN.large, PIN.common, PIN.small];
    order.forEach((p, i) => {
      const dx = (i - 1) * 0.006, s0 = S.clone().add(new THREE.Vector3(dx, 0, 0)), s1 = s0.clone().addScaledVector(rd, -0.004);
      const m3 = [-0.2245, p[1] * 0.5 + rd.y * 0.012, p[2] * 0.5 + rd.z * 0.012];
      name(add(insert, tube([s0.toArray(), s1.toArray(), [-0.175 + dx * 0.5, rd.y * 0.040 + dx * 0.3, rd.z * 0.040], at(-0.212, 0.026).map((v, j) => j ? v + (j === 1 ? dx : 0) * 0.4 : v), m3, [-0.2272, p[1], p[2]]], 0.0012, M.nickel, 60, 8)),
        'cathode lead', 'cathode receptacle', 'feedthrough pin');
    });
    const A0 = sock(DIM.recX.anode);
    name(add(insert, tube([A0.toArray(), A0.clone().addScaledVector(rd, -0.004).toArray(), at(0.168, 0.040), at(0.190, 0.022), at(0.1985, 0.011), at(0.2016, 0.003), [0.2016, 0, 0]], 0.0016, M.nickel, 60, 8)),
      'anode lead', 'anode receptacle', 'anode terminal');
  }

  // ── stand: two cast cradles (web with a lightening arch, saddle rim, foot flange), rubber saddle liners,
  //    base plate with the beam aperture, 4 rubber feet; all bolted ──────────────────────────────────────
  const yb = DIM.floor + 0.010, yt = yb + 0.012;              // base plate bottom / top
  const RS = 0.0742, RL = 0.0702, A0 = Math.asin(0.040 / RS); // saddle radius, liner inner radius, horn angle below horizontal
  const sector = (r0, r1, depth, mat) => {                    // annular saddle sector under the housing, extruded along X
    const sh = new THREE.Shape(); sh.absarc(0, 0, r1, -A0, -Math.PI + A0, true); sh.absarc(0, 0, r0, -Math.PI + A0, -A0, false); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 64 }); g.translate(0, 0, -depth / 2); g.rotateY(Math.PI / 2);
    return new THREE.Mesh(g, mat);
  };
  for (const x of [-0.13, 0.13]) {
    const sh = new THREE.Shape();
    sh.moveTo(-0.080, yt + 0.010); sh.lineTo(0.080, yt + 0.010); sh.lineTo(0.090, -0.040);
    sh.absarc(0, 0, RS, -A0, -Math.PI + A0, true);
    sh.lineTo(-0.090, -0.040); sh.closePath();
    const hole = new THREE.Path(); hole.moveTo(-0.026, yt + 0.022); hole.lineTo(0.026, yt + 0.022); hole.lineTo(0.026, -0.112); hole.absarc(0, -0.112, 0.026, 0, Math.PI, false); hole.closePath(); sh.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.018, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.0015, bevelSegments: 2, curveSegments: 48 });
    g.translate(0, 0, -0.009); g.rotateY(Math.PI / 2);
    const c = new THREE.Mesh(g, M.stand); c.position.x = x; name(c, 'cradle', 'base plate', 'saddle liner'); stand.add(c);
    const rim = sector(RS, RS + 0.007, 0.040, M.stand); rim.position.x = x; name(rim, 'cradle', 'saddle liner'); stand.add(rim);
    const foot = box(0.040, 0.010, 0.190, M.stand); foot.position.set(x, yt + 0.005, 0); name(foot, 'cradle', 'base plate'); stand.add(foot);
    // side ribs between the foot flange and the web
    for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
      const rs = new THREE.Shape(); rs.moveTo(0, 0); rs.lineTo(0.011, 0); rs.lineTo(0, 0.034); rs.closePath();
      const rg = new THREE.ExtrudeGeometry(rs, { depth: 0.006, bevelEnabled: false }); rg.translate(0, 0, -0.003);
      const r = new THREE.Mesh(rg, M.stand); r.position.set(x + sx * 0.009, yt + 0.010, sz * 0.060); r.rotation.y = sx > 0 ? 0 : Math.PI; name(r, 'cradle'); stand.add(r);
    }
    const ln = sector(RL, RS, 0.042, M.liner); ln.position.x = x; name(ln, 'saddle liner', 'housing shell'); stand.add(ln);
    // horn bolts and foot bolts with washers
    for (const z of [-0.081, 0.081]) { const bb = name(bolt(0.0048, 0.004, M.steel), 'cradle bolt', 'cradle'); bb.position.set(x, -0.040, z); stand.add(bb); }
    for (const z of [-0.084, 0.084]) for (const dx of [-0.011, 0.011]) {
      const w = name(cylBetween([x + dx, yt + 0.010, z], [x + dx, yt + 0.0112, z], 0.0062, M.steel, 20), 'foot bolt', 'cradle'); stand.add(w);
      const bb = name(bolt(0.0045, 0.0035, M.steel), 'foot bolt', 'foot bolt'); bb.position.set(x + dx, yt + 0.0112, z); stand.add(bb);
    }
  }
  // base plate with an aperture under the window (the beam passes through)
  const bp = new THREE.Shape(); bp.moveTo(-0.215, -0.12); bp.lineTo(0.215, -0.12); bp.lineTo(0.215, 0.12); bp.lineTo(-0.215, 0.12); bp.closePath();
  const ap = new THREE.Path(); ap.moveTo(-0.075, -0.06); ap.lineTo(-0.075, 0.06); ap.lineTo(0.075, 0.06); ap.lineTo(0.075, -0.06); ap.closePath(); bp.holes.push(ap);
  const bg = new THREE.ExtrudeGeometry(bp, { depth: 0.010, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.001, bevelSegments: 2 });
  bg.rotateX(-Math.PI / 2); bg.translate(0, yb + 0.001, 0);
  const base = new THREE.Mesh(bg, M.standBase); base.name = 'base plate'; stand.add(base);
  for (const x of [-0.19, 0.19]) for (const z of [-0.1, 0.1]) { const f = cylBetween([x, DIM.floor, z], [x, yb, z], 0.014, M.feet, 24, 0.012); name(f, 'foot', 'base plate'); stand.add(f); }

  shadowAll(root);
  // what spins and how its blur reads: n features per turn, k = turns per rotor turn, cover = their share of the swept ring
  const blur = [{ mat: barM, smear: barS, n: 18, k: 1, cover: 0.18 }, { mat: markM, smear: markS, n: 3, k: 1, cover: 0.06 }, { mat: ballM, smear: ballS, n: 8, k: 0.42, cover: 0.37 }];
  root.traverse((o) => { for (const e of blur) { if (o.material === e.mat) o.userData.audit = true; if (o.material === e.smear) o.userData.noAudit = true; } });
  return { root, housing, insert, rotor, stand, cup, filMat, track, cables, port, cages, blur };
}

/** small helper: lathe round local Y (for parts on the radial receptacle axis); prof [[r, y], ...] closed to the axis */
function lathY(prof, mat) {
  const p = [[0, prof[0][1]], ...prof, [0, prof[prof.length - 1][1]]];
  const g = latheX(p, 48);
  g.rotateZ(Math.PI / 2);
  return new THREE.Mesh(g, mat);
}

/** nameplate artwork: type data only (an independent study, no maker), etched light on dark anodised aluminium */
function nameplateTexture() {
  const W = 1024, Hh = 452, c = document.createElement('canvas'); c.width = W; c.height = Hh;
  const g = c.getContext('2d');
  g.fillStyle = '#23292f'; g.fillRect(0, 0, W, Hh);
  g.strokeStyle = '#b9c3c9'; g.lineWidth = 5; g.strokeRect(22, 22, W - 44, Hh - 44); g.lineWidth = 1.5; g.strokeRect(34, 34, W - 68, Hh - 68);
  const F = (w, px) => `${w} ${px}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  g.fillStyle = '#d8e0e4'; g.textBaseline = 'alphabetic';
  g.font = F(700, 50); g.fillText('ROTATING ANODE X-RAY TUBE ASSEMBLY', 64, 104);
  g.fillRect(64, 124, W - 128, 3);
  g.font = F(600, 34);
  const rows = [['TYPE', 'RA-150 · STUDY'], ['MAX. VOLTAGE', '150 kV'], ['ANODE HEAT', '300 kHU'], ['FOCAL SPOTS', '0.6 / 1.2'], ['INHERENT FILTRATION', '0.9 mm Al']];
  rows.forEach(([k, v], i) => { const y = 178 + i * 46; g.fillStyle = '#9aa7ae'; g.fillText(k, 64, y); g.fillStyle = '#e6ecef'; g.fillText(v, 380, y); });
  // radiation trefoil, signal red
  const cx = 840, cy = 270, R = 92;
  g.fillStyle = '#d2322d'; g.beginPath(); g.arc(cx, cy, R + 14, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#23292f';
  for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + k * 2 * Math.PI / 3; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R, a - Math.PI / 6, a + Math.PI / 6); g.closePath(); g.fill(); }
  g.fillStyle = '#d2322d'; g.beginPath(); g.arc(cx, cy, R * 0.26, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#23292f'; g.beginPath(); g.arc(cx, cy, R * 0.18, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#d2322d'; g.beginPath(); g.arc(cx, cy, R * 0.13, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
