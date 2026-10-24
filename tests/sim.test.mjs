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
