// node --test tests/   (BRIEF §7 acceptance)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as X from '../js/sim.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} ± ${tol}`);

test('arc length and pitch from FOV × ROC', () => {
  near(X.PROBE.arc, 58.9, 0.05, 'arc mm');
  near(X.PROBE.pitch, 0.46, 0.005, 'pitch mm');
});

test('λ = c / f', () => {
  near(X.lambda(3.5), 0.44, 0.005, 'λ at 3.5 MHz');
  near(X.lambda(9), 0.171, 0.002, 'λ at 9 MHz');
});

test('t = 2d / c: 13 µs per cm, the stone at 7.0 cm reads 91 µs', () => {
  near(X.roundTrip(10), 12.99, 0.01, 'µs per cm');
  const st = X.stoneLine();
  near(st.d, 70, 0.1, 'stone top depth mm');
  near(X.roundTrip(st.d), 91, 0.5, 'round trip µs');
});

test('frame rate at 16 cm × 128 lines ≈ 37 fps', () => near(X.frameRate(160), 37.6, 0.3, 'fps'));

test('penetration: 30 cm at 2 MHz, shallower as f rises', () => {
  near(X.penetration(2), 300, 0.5, '2 MHz');
  assert.ok(X.penetration(5) < X.penetration(3.5) && X.penetration(3.5) < X.penetration(2));
});

test('pulse spectrum: −6 dB band 2.45–4.55 MHz inside the 5–2 MHz spec', () => {
  const [lo, hi] = X.band6(3.5);
  near(X.spectrum(lo), 0.5, 0.01, 'lower edge −6 dB'); near(X.spectrum(hi), 0.5, 0.01, 'upper edge −6 dB');
  assert.ok(lo >= 2 && hi <= 5);
});

test('focusing delays: symmetric, zero at the edges of the active aperture, µs scale', () => {
  const D = X.delays();
  const act = D.d.slice(D.i0, D.i0 + D.active);
  near(act[0], act[act.length - 1], 1e-9, 'symmetric');
  const max = Math.max(...act);
  assert.ok(max > 1 && max < 6, `max delay ${max} µs`);
  near(Math.min(act[0], act[act.length - 1]), 0, 1e-9, 'edge');
});

test('B-mode: anechoic bile, bright stone surface, shadow under the stone', () => {
  const B = X.bmode({ density: 150000 / 160 });
  const at = (x, y) => { const [th, d] = X.toPolar(x, y); const l = Math.round((th + X.PROBE.fov / 2) / B.dth); return 20 * Math.log10(B.env[l * B.NS + Math.round(d / B.dz)] / B.ref + 1e-12); };
  const avg = (x, y0, y1) => { let s = 0, n = 0; for (let y = y0; y <= y1; y += 0.5) for (const dx of [-1, 0, 1]) { s += at(x + dx, y); n++; } return s / n; };
  const liver = avg(-40, 40, 60), bile = avg(-20, 62, 72), stone = Math.max(...[69.8, 70, 70.2, 70.4].map((y) => at(2, y))), shadow = avg(2, 95, 115), beside = avg(-40, 95, 115);
  assert.ok(bile < liver - 20, `bile ${bile} vs liver ${liver}`);
  assert.ok(stone > liver + 6, `stone ${stone} vs liver ${liver}`);
  assert.ok(shadow < beside - 15, `shadow ${shadow} vs beside ${beside}`);
});

test('S1 controls: 9 MHz toggle images at 9 MHz, focus moves the delay curve', () => {
  const sim = X.createSim({ f: 3.5 });
  sim.set('lin', true);
  const r = sim.read();
  near(r.f, 9, 1e-9, 'imaged f'); near(r.fDial, 3.5, 1e-9, 'dial f');
  assert.ok(r.pen < X.penetration(3.5), '9 MHz shallower');
  const d = (focus) => Math.max(...X.delays({ focus }).d);
  assert.ok(d(30) > d(120), `near focus = more delay spread: ${d(30)} vs ${d(120)}`);
});

test('S3: fixed white point, gain brightens, shadow ≈ stone width × sector divergence, posterior enhancement', () => {
  const B0 = X.bmode({ density: 150000 / 160 }), B1 = X.bmode({ density: 150000 / 160, gain: 6 });
  assert.equal(B0.ref, B1.ref);
  const mean = (B) => { let s = 0; for (let i = 0; i < B.env.length; i += 53) s += B.env[i]; return s; };
  near(20 * Math.log10(mean(B1) / mean(B0)), 6, 0.3, 'gain dB');
  const B = X.bmode();
  const at = (x, y) => { const [th, d] = X.toPolar(x, y); const l = Math.round((th + X.PROBE.fov / 2) / B.dth); return 20 * Math.log10(B.env[l * B.NS + Math.round(d / B.dz)] / B.ref + 1e-12); };
  const avg = (x, y0, y1) => { let s = 0, n = 0; for (let y = y0; y <= y1; y += 0.5) for (const dx of [-1, 0, 1]) { s += at(x + dx, y); n++; } return s / n; };
  const base = avg(-40, 100, 110); let w = 0;
  for (let x = -20; x <= 24; x += 0.5) { let s = 0; for (let y = 100; y <= 110; y += 0.5) s += at(x, y); if (s / 21 < base - 10) w += 0.5; }
  const geo = 2 * X.PH.stone.r * (X.PROBE.roc + 105) / (X.PROBE.roc + X.PH.stone.y);
  near(w, geo, 2.5, 'shadow width mm at 10.5 cm');
  assert.ok(avg(-22, 88, 100) - avg(-50, 88, 100) > 5, 'posterior enhancement under the bile');
});
