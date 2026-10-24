// node --test tests/   (BRIEF §7 acceptance + the use-shot export)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as X from '../js/sim.js';

const run = (sim, sec, until = () => false) => { let r = sim.read(); for (let i = 0; i < sec * 60; i++) { r = sim.step(1 / 60); if (until(r)) break; } return r; };
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} ± ${tol}`);

test('spectrum endpoint = kVp', () => {
  for (const kv of [40, 70, 120, 150]) {
    const sp = X.spectrum(kv);
    let last = 0; for (let i = 0; i < sp.E.length; i++) if (sp.I[i] > 0) last = sp.E[i];
    assert.ok(last < kv && last >= kv - 0.5, `${kv} kV ends at ${last}`);
  }
});

test('K lines present above the 69.5 keV edge only', () => {
  assert.equal(X.spectrum(69).kOn, false);
  assert.equal(X.spectrum(120).kOn, true);
  const sp = X.spectrum(120), j = (e) => Math.round(e / 0.5);
  assert.ok(sp.I[j(59.32)] > 2 * sp.C[j(59.32)], 'Kα1 stands above the continuum');
  const ka = X.K_LINES.find((l) => l.name === 'Kα1'), kb = X.K_LINES.find((l) => l.name === 'Kβ1');
  near(ka.e, 59.3, 0.5, 'Kα1'); near(kb.e, 67.2, 0.5, 'Kβ1');
  const s69 = X.spectrum(69); assert.equal(s69.I[j(59.32)], s69.C[j(59.32)], 'no line at 69 kV');
});

test('rating table: 75 kW at 0.1 s, every kV gives the same power', () => {
  near(X.ratingKW(0.1), 75, 0.01, 'nominal');
  assert.ok(X.ratingKW(10) < X.ratingKW(1) && X.ratingKW(1) < X.ratingKW(0.1));
  assert.equal(X.interlock({ kv: 120, ma: 600, ms: 100, focus: 'large' }), null, '72 kW, 0.1 s');
  assert.equal(X.interlock({ kv: 120, ma: 700, ms: 100, focus: 'large' }), 'rating', '84 kW, 0.1 s');
  assert.equal(X.interlock({ kv: 40, ma: 1000, ms: 10, focus: 'large' }), 'current', '40 kV space charge');
  assert.equal(X.autoFocus(80, 200, 100), 'small'); assert.equal(X.autoFocus(120, 500, 100), 'large');
});

test('75 kW for 2.8 s fills the anode', () => {
  const sim = X.createSim({ anode: 0 }); sim.s.Qa = 0;
  // heat input only (no rating check): integrate the anode power directly through the solver's loss model
  let Q = 0; for (let t = 0; t < 2.8; t += 1e-3) Q += (75e3 - X.anodeLoss(Q)) * 1e-3;
  near(Q / X.ANODE.Q, 1, 0.03, 'anode full');
});

test('anode cooling matches the datasheet at 2 / 6 / 12 min (±10 %)', () => {
  const sim = X.createSim({ anode: 1 });
  const at = {}; for (let m = 1; m <= 12; m++) { run(sim, 60); at[m] = sim.read().Q / 1e3; }
  for (const [m, kJ] of [[2, 165], [6, 100], [12, 54]]) near(at[m], kJ, kJ * 0.1, `${m} min`);
});

test('rotor reaches 9,700 rpm in 1.2 s, brakes to a stop in about 3 s', () => {
  const sim = X.createSim(); sim.prep();
  const r = run(sim, 1.2); assert.ok(r.rpm >= 9700, `${r.rpm.toFixed(0)} rpm at 1.2 s`);
  sim.release(); const b = run(sim, 3.2, (x) => x.phase === 'idle');
  assert.equal(b.phase, 'idle'); near(b.t - 1.2, 3.1, 0.25, 'brake time');
});

test('filament: emission follows the datasheet shape, the solver reaches the set mA', () => {
  near(X.emission(4.7, 100), 430, 60, '100 kV, 4.7 A');
  assert.ok(X.emission(5.0, 40) < X.emission(5.0, 100), 'space charge at low kV');
  const If = X.filamentFor(300, 120); assert.ok(If > 3.9 && If < 5.5, `${If} A`);
  const sim = X.createSim({ kv: 120, ma: 300, ms: 500 }); sim.expose();
  const r = run(sim, 3, (x) => x.on && x.expT > 0.3); near(r.ma, 300, 15, 'tube current');
});

test('events in order, none lost between steps, exposure lasts ms', () => {
  const sim = X.createSim({ kv: 120, ma: 100, ms: 250 }); sim.expose();
  sim.step(10);                                           // one long step: sub-stepping must keep every event
  const seq = sim.events.map((e) => e.type);
  assert.deepEqual(seq, ['prep', 'rotor-up', 'expose-start', 'k-lines-on', 'expose-end', 'k-lines-off', 'brake', 'stop']);
  const a = sim.events.find((e) => e.type === 'expose-start').t, b = sim.events.find((e) => e.type === 'expose-end').t;
  near(b - a, 0.25, 1 / 240 + 1e-9, 'exposure time');
  assert.ok(a >= 0.9 && a <= 1.3, `starts after rotor-up at ${a}`);
});

test('interlock refuses an over-rated exposure and never turns the beam on', () => {
  const sim = X.createSim({ kv: 150, ma: 1000, ms: 1000, focus: 'large' }); sim.expose();
  sim.step(4);
  assert.ok(sim.events.some((e) => e.type === 'interlock' && e.reason === 'rating'));
  assert.ok(!sim.events.some((e) => e.type === 'expose-start'));
  const hot = X.createSim({ kv: 120, ma: 100, ms: 5000, anode: 0.95 }); hot.expose(); hot.step(4);
  assert.equal(hot.events.find((e) => e.type === 'interlock')?.reason, 'heat');
});

test('focal track stays under W melting on the rating curve, slower rotor runs hotter', () => {
  for (const [sec, kw] of X.RATING.large) {
    const sim = X.createSim({ kv: 120, ma: kw * 1000 / 120 * 0.999, ms: sec * 1000, focus: 'large', anode: 0 }); sim.expose();
    let peak = 0; for (let i = 0; i < 4000; i++) { const r = sim.step(1 / 240); if (r.on) peak = Math.max(peak, r.trackT); else if (r.t1 > 0) break; }
    assert.ok(peak < 3422 && peak > 2000, `${sec} s: ${peak.toFixed(0)} °C`);
  }
  assert.ok(X.flashK(60e3, 'large', 3200) > 1.5 * X.flashK(60e3, 'large', 9700));
});

test('heel: anode side dimmer than the cathode side', () => {
  assert.ok(X.heel(-8) < 0.8 && X.heel(-8) > 0.55, `φ −8°: ${X.heel(-8)}`);
  assert.ok(X.heel(8) > 1 && X.heel(8) < 1.15);
});

test('use shot: bone / soft-tissue contrast is lower at 120 kV than at 70 kV', () => {
  const contrast = (kv) => { const b = X.binned(kv); return 1 - X.transmit(b, { soft: 15, bone: 1 }) / X.transmit(b, { soft: 16 }); };
  const b = X.binned(120); assert.ok(b.length >= 10 && b.length <= 16, `${b.length} bins`);
  near(b.reduce((a, x) => a + x.w, 0), 1, 1e-6, 'bins sum');
  assert.ok(contrast(120) < contrast(70), `${contrast(120)} vs ${contrast(70)}`);
});

// ── use shot (S4b): the radiograph's physics and the chest program ─────────────────────────────────────────
test('chest: bone contrast falls from 70 to 120 kV (Beer–Lambert over the binned spectrum)', async () => {
  const { binned, transmit } = await import('../js/sim.js');
  const C = (kv) => { const b = binned(kv), lung = transmit(b, { soft: 6, lung: 16 }), rib = transmit(b, { soft: 6, lung: 15, bone: 0.7 }); return 1 - rib / lung; };
  assert.ok(C(70) > C(120) * 1.3, `rib contrast 70 kV ${C(70).toFixed(3)} vs 120 kV ${C(120).toFixed(3)}`);
});
test('chest program: 120 kV · 4 mAs passes the rating, entrance dose in the 0.1–0.3 mGy PA range', async () => {
  const { CHEST, autoFocus, interlock, entranceDose } = await import('../js/sim.js');
  const focus = autoFocus(CHEST.kv, CHEST.ma, CHEST.ms);
  assert.equal(interlock({ ...CHEST, focus }), null);
  const d = entranceDose(CHEST.kv, CHEST.ma * CHEST.ms / 1000, 1.56);
  assert.ok(d > 0.1 && d < 0.3, `dose ${d}`);
});
