// Solver, pure module (no DOM, no three; `node --test`). Every number on the plate comes from here.
//   Datasheet (SOURCES S1): rating table, anode / assembly heat, cooling, rotor 9,700 rpm / 1.2 s / 3 s brake,
//   filament ≤ 5.5 A, filtration. Fitted shapes (modelled): emission curves, cooling exponents, rotor curve,
//   focal-track temperature, heel profile. NIST XCOM μ/ρ tables for Al, W and the phantom tissues.
// Spectrum: Kramers bremsstrahlung (E0 − E) on 0.5-keV bins, filtered by aluminium and a tungsten self-absorption
// term (modelled), plus W K lines above the 69.525 keV edge (SOURCES S2; intensity modelled).

export const K_EDGE = 69.525;
export const K_LINES = [            // keV, relative weight (modelled, TASMIP-like ratios)
  { e: 57.98, w: 0.58, name: 'Kα2' },
  { e: 59.32, w: 1.00, name: 'Kα1' },
  { e: 67.24, w: 0.34, name: 'Kβ1' },
  { e: 69.07, w: 0.09, name: 'Kβ2' },
];

// ── mass attenuation μ/ρ (cm²/g), NIST X-ray mass attenuation tables (Hubbell & Seltzer, checked 2026-10-20), log-log interpolated ─────────────
const XE = [10, 15, 20, 30, 40, 50, 60, 80, 100, 150];
export const MU = {
  al: [26.23, 7.955, 3.441, 1.128, 0.5685, 0.3681, 0.2778, 0.2018, 0.1704, 0.1378],
  soft: [5.379, 1.699, 0.8230, 0.3790, 0.2688, 0.2264, 0.2048, 0.1823, 0.1693, 0.1492],   // tissue, soft (ICRU-44)
  bone: [28.51, 9.032, 4.001, 1.331, 0.6655, 0.4242, 0.3148, 0.2229, 0.1855, 0.1480],    // bone, cortical (ICRU-44)
  fat: [3.268, 1.083, 0.5677, 0.3063, 0.2396, 0.2123, 0.1974, 0.1800, 0.1688, 0.1500],     // adipose (ICRU-44)
  air: [5.120, 1.614, 0.7779, 0.3538, 0.2485, 0.2080, 0.1875, 0.1662, 0.1541, 0.1356],
};
// densities g/cm³ (ICRU-44; inflated lung = soft tissue at 0.26, modelled)
export const RHO = { al: 2.699, soft: 1.06, bone: 1.92, fat: 0.95, lung: 0.26, air: 0.0012 };
export function mu(mat, E) {
  const m = MU[mat === 'lung' ? 'soft' : mat];
  if (E <= XE[0]) return m[0] * (XE[0] / E) ** 3;
  for (let i = 1; i < XE.length; i++) {
    if (E <= XE[i]) {
      const u = Math.log(E / XE[i - 1]) / Math.log(XE[i] / XE[i - 1]);
      return Math.exp(Math.log(m[i - 1]) + u * Math.log(m[i] / m[i - 1]));
    }
  }
  return m[m.length - 1];
}
export const muAl = (E) => mu('al', E);

/** @returns {{E: Float32Array, I: Float32Array, C: Float32Array, kv: number, mean: number, kOn: boolean}} I normalised to its max */
export function spectrum(kv, { alMM = 2.5, step = 0.5, eMax = 150 } = {}) {
  const n = Math.round(eMax / step) + 1;
  const E = new Float32Array(n), I = new Float32Array(n);
  let sum = 0, sumE = 0;
  for (let i = 0; i < n; i++) {
    const e = i * step; E[i] = e;
    if (e < 1 || e >= kv) continue;
    const brems = kv - e;                                      // Kramers, energy per bin: ∝ Z (E0 − E)
    const filt = Math.exp(-muAl(e) * RHO.al * alMM / 10);      // Al: 0.9 mm inherent + oil/glass equivalent (modelled)
    const self = Math.exp(-1.3e4 / (e * e * e));               // W self-absorption in the target (modelled)
    I[i] = brems * filt * self;
  }
  const Cn = Float32Array.from(I);                             // continuum alone, same scale
  const kOn = kv > K_EDGE;
  if (kOn) {
    // line strength grows with overvoltage (kVp/edge − 1)^1.6 (modelled): Kα1 ≈ 2.6 × the continuum peak at 120 kV
    let ref = 0; for (let i = 0; i < n; i++) ref = Math.max(ref, I[i]);
    const s = ref * 2.6 * Math.min(1.25, ((kv / K_EDGE - 1) / 0.726) ** 1.6);
    for (const L of K_LINES) {
      const j = Math.round(L.e / step);
      for (let d = -1; d <= 1; d++) if (I[j + d] !== undefined) I[j + d] += s * L.w * (d === 0 ? 1 : 0.25);
    }
  }
  let peak = 0;
  for (let i = 0; i < n; i++) { peak = Math.max(peak, I[i]); sum += I[i]; sumE += I[i] * E[i]; }
  for (let i = 0; i < n; i++) { I[i] /= peak || 1; Cn[i] /= peak || 1; }
  return { E, I, C: Cn, kv, mean: sum ? sumE / sum : 0, kOn };
}

/** the spectrum in ~15 energy bins for the radiograph (use shot): energy fluence `w` (sums to 1) and photon share `n` */
export function binned(kv, { width = 10, ...o } = {}) {
  const sp = spectrum(kv, o), out = [];
  for (let lo = 0; lo < kv; lo += width) {
    let w = 0, eW = 0, n = 0;
    for (let i = 0; i < sp.E.length; i++) if (sp.E[i] >= lo && sp.E[i] < lo + width && sp.E[i] > 0) { w += sp.I[i]; eW += sp.I[i] * sp.E[i]; n += sp.I[i] / sp.E[i]; }
    if (w > 0) out.push({ e: eW / w, w, n });
  }
  const W = out.reduce((a, b) => a + b.w, 0), N = out.reduce((a, b) => a + b.n, 0);
  for (const b of out) { b.w /= W; b.n /= N; }
  return out;
}
/** detector signal (energy-integrating) behind thicknesses {mat: cm}, relative to the open beam (Beer–Lambert per bin) */
export function transmit(bins, path) {
  let s = 0;
  for (const b of bins) { let a = 0; for (const m in path) a += mu(m, b.e) * RHO[m] * path[m]; s += b.w * Math.exp(-a); }
  return s;
}

/** entrance surface air kerma, mGy (modelled): tube output Y ≈ 0.042 mGy/mAs at 1 m and 80 kV behind 2.5 mm Al, ∝ kV²,
 *  inverse square to the entrance surface, backscatter factor 1.35 (typical values; to verify against SOURCES) */
export const entranceDose = (kv, mas, d) => 0.042 * (kv / 80) ** 2 * mas / (d * d) * 1.35;
/** the console's chest program for the Image view (PA, SID 180 cm): 120 kV, 4 mAs as 400 mA × 10 ms */
export const CHEST = { kv: 120, ma: 400, ms: 10 };

// ── derived numbers (SOURCES S5) ──────────────────────────────────────────────────────────────────────────
export const C = 299792458, ME = 510.998950;                 // keV
export const electronBeta = (kv) => { const g = 1 + kv / ME; return Math.sqrt(1 - 1 / (g * g)); };
export const xrayShare = (kv) => 1e-9 * 74 * kv * 1e3;     // η ≈ 1e-9 Z V

// ── datasheet ratings (p 4, 6: absolute maximum, 180 Hz) ─────────────────────────────────────────────────
// The rating curves are constant power at each time (every kV curve gives the same kV × mA within ±1 %), so one
// table per focus holds them: [s, kW], read off p 6 (±3 %; 75 kW at 0.1 s is the printed nominal).
export const RATING = {
  large: [[0.01, 84.5], [0.02, 82], [0.05, 78.8], [0.1, 75], [0.2, 64.6], [0.5, 49], [1, 38], [2, 27.7], [5, 16.7], [10, 11.8]],
  small: [[0.01, 29.6], [0.02, 29.2], [0.05, 28.3], [0.1, 27], [0.2, 24.7], [0.5, 21.3], [1, 18.1], [2, 14.7], [5, 10.2], [10, 7.3]],
};
// current caps from the same charts: 1,000 / 400 mA, lower at 40–50 kV (space charge)
const CAP = { large: [[40, 800], [50, 1000]], small: [[40, 300], [50, 350], [60, 400]] };
export const FOCUS = { large: { mm: 1.2, maxMA: 1000 }, small: { mm: 0.6, maxMA: 400 } };
export const ANODE = { Q: 210e3, P: 475, n: 1.26, R: 0.037, track: 0.030, angle: 12 };   // J, W, fitted exponent, m, m, °
export const ASSY = { Q: 900e3, P: 158, n: 1.24, C: 16.4e3 };                           // P, n fitted to p 10; C modelled (J/K)
export const ROTOR = { rpm: 9700, up: 1.2, brake: 3, tau: 0.30, over: 1.02 };           // tau, over: modelled curve
export const HU = 0.70;                                                                   // J per heat unit

const lerpLog = (tab, x) => {
  if (x <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) if (x <= tab[i][0]) {
    const [x0, y0] = tab[i - 1], [x1, y1] = tab[i];
    return y0 + (y1 - y0) * Math.log(x / x0) / Math.log(x1 / x0);
  }
  const [xa, ya] = tab[tab.length - 2], [xb, yb] = tab[tab.length - 1];          // beyond 10 s: same log slope
  return yb * (x / xb) ** (Math.log(yb / ya) / Math.log(xb / xa));
};
export const ratingKW = (sec, focus = 'large') => lerpLog(RATING[focus], sec);
export function maxMA(kv, focus = 'large') {
  const c = CAP[focus], top = FOCUS[focus].maxMA;
  if (kv <= c[0][0]) return c[0][1];
  for (let i = 1; i < c.length; i++) if (kv <= c[i][0]) return c[i - 1][1] + (c[i][1] - c[i - 1][1]) * (kv - c[i - 1][0]) / (c[i][0] - c[i - 1][0]);
  return top;
}
/** auto focus: the small spot when its rating and cap allow, else the large */
export const autoFocus = (kv, ma, ms) => (ma <= maxMA(kv, 'small') && kv * ma / 1000 <= ratingKW(ms / 1000, 'small') ? 'small' : 'large');

/** why an exposure may not run, or null. Q = anode heat now (J) */
export function interlock({ kv, ma, ms, focus }, Q = 0) {
  const kw = kv * ma / 1000;
  if (ma > maxMA(kv, focus) + 1e-9) return 'current';
  if (kw > ratingKW(ms / 1000, focus) * 1.0001) return 'rating';
  if (Q + kw * 1e3 * (1 - xrayShare(kv)) * ms / 1000 > ANODE.Q) return 'heat';
  return null;
}

// ── filament emission (p 9 shape, fitted: Richardson–Dushman × Schottky, blended with the Child space-charge
// limit). Filament temperature T = 2,700 K × (I / 5 A)^0.52 (modelled). RMS fit error ≈ 11 % on the large focus.
const KB = 8.617e-5, WF = 4.54;
const EM = { large: { A: 28184, G: 5.01, off: 0 }, small: { A: 28184, G: 2.0, off: 0.32 } };
export const filamentK = (amps, focus = 'large') => 2700 * (Math.max(0.5, amps - EM[focus].off) / 5) ** 0.52;
export function emission(amps, kv, focus = 'large') {
  const T = filamentK(amps, focus), e = EM[focus];
  const sat = e.A * T * T * Math.exp(-WF / (KB * T)) * (1 + 0.04 * Math.sqrt(kv));
  const cl = e.G * kv ** 1.5;
  return 1 / (1 / sat + 1 / cl);
}
export const FIL = { max: 5.5, standby: 3.3, tau: 0.25 };   // A; standby and boost time constant modelled
export function filamentFor(ma, kv, focus = 'large') {
  let lo = 2, hi = FIL.max;
  if (emission(hi, kv, focus) < ma) return hi;
  for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; emission(m, kv, focus) < ma ? (lo = m) : (hi = m); }
  return (lo + hi) / 2;
}

// ── heel effect (modelled): X-rays made ≈ 5 µm deep in W leave at α = 12° + φ to the target face (φ > 0 toward the
// cathode); the W path d / sin α filters them. Returns intensity relative to the central ray, at the mean energy.
const MU_W = [[30, 22.73], [40, 10.67], [50, 5.949], [60, 3.713], [69.52, 2.552], [69.53, 11.23], [80, 7.81], [100, 4.438], [150, 1.581]];  // NIST, cm²/g
const muW = (E) => { let i = 1; while (i < MU_W.length - 1 && E > MU_W[i][0]) i++; const [e0, m0] = MU_W[i - 1], [e1, m1] = MU_W[i]; return Math.exp(Math.log(m0) + Math.log(m1 / m0) * Math.log(E / e0) / Math.log(e1 / e0)); };
export function heel(phiDeg, kv = 120) {
  const e = spectrum(kv).mean, rd = 19.3 * 5e-4;                 // ρ d (g/cm²)
  const f = (p) => Math.exp(-muW(e) * rd / Math.sin(Math.max(0.3, ANODE.angle + p) * Math.PI / 180));
  return f(phiDeg) / f(0);
}

// ── focal-track temperature (modelled): disc bulk (radiation balance) + track ring (1-D heating of the 5.8 mm
// band, relaxing into the disc over ~20 s) + flash under the spot (dwell = spot width / track speed). Constants:
// tungsten √(kρc) = 17,800 J m⁻² K⁻¹ s⁻½; ring and flash scales fitted so a cold-anode exposure on the rating curve peaks at 2,050–3,180 °C
// (large 2,380–3,180, small 2,050–2,580), always under W melting (3,422 °C).
const EFF = 17800, TAU_RING = 20, RING_S = 0.59, FLASH_S = 0.515, SIGMA_EA = ANODE.P / (1473 ** 4 - 293 ** 4);
const ringG = (x) => (x <= 0 ? 0 : Math.sqrt(TAU_RING) * Math.tanh(Math.sqrt(x / TAU_RING)));
export const spotArea = (focus) => { const w = FOCUS[focus].mm * 1e-3; return { w, l: w / Math.sin(ANODE.angle * Math.PI / 180) }; };
export const trackSpeed = (rpm) => 2 * Math.PI * ANODE.track * rpm / 60;
export const anodeLoss = (Q) => ANODE.P * Math.max(0, Q / ANODE.Q) ** ANODE.n;
export const housingLoss = (Q) => ASSY.P * Math.max(0, Q / ASSY.Q) ** ASSY.n;
export const oilC = (Qh) => 20 + Qh / ASSY.C;
export function discC(Qa, Qh) { const To = oilC(Qh) + 273.15; return (anodeLoss(Qa) / SIGMA_EA + To ** 4) ** 0.25 - 273.15; }
export function flashK(watts, focus, rpm) {
  if (watts <= 0) return 0;
  const { w, l } = spotArea(focus), dwell = w / Math.max(trackSpeed(rpm), 0.05 * trackSpeed(ROTOR.rpm));
  return FLASH_S * 2 * (watts / (w * l)) * Math.sqrt(Math.min(dwell, 0.05) / Math.PI) / EFF;
}
const RING_A = 2 * Math.PI * ANODE.track * spotArea('large').l;           // m², the band the spot sweeps
const ringK = (segs, t) => {
  let s = 0;
  for (const g of segs) s += (g.w / RING_A) * (ringG(t - g.t0) - ringG(t - (g.t1 ?? t)));
  return RING_S * 2 * s / (Math.sqrt(Math.PI) * EFF);
};

// ── the stepped simulation ───────────────────────────────────────────────────────────────────────────────
// Commands: prep(), expose() (preps first when needed, starts once the rotor is above 95 % and the filament has
// boosted), release() (ends the exposure, or cancels a waiting one), set(k, v) for kv / ma / ms / focus.
// step(dt) integrates in ≤ 1/240 s sub-steps; events are pushed with their exact sub-step time, never dropped.
export const PHASES = ['idle', 'prep', 'ready', 'expose', 'brake'];
export function createSim({ kv = 120, ma = 100, ms = 4000, focus = 'auto', anode = 0.12, assy = 150e3 } = {}) {
  const s = {
    t: 0, phase: 'idle', kv, ma, ms, focus, rpm: 0, rev: 0, drive: 0,
    amps: FIL.standby, ampsSet: FIL.standby, mA: 0, on: false, expT: 0, t0: -1, t1: -1,
    Qa: anode * ANODE.Q, Qh: assy, waiting: false, hold: 0, reason: null, ring: [], kOn: false,
  };
  const events = [];
  const emit = (type, extra) => events.push({ t: s.t, type, ...extra });
  const op = () => ({ kv: s.kv, ma: s.ma, ms: s.ms, focus: s.focus === 'auto' ? autoFocus(s.kv, s.ma, s.ms) : s.focus });
  const target = () => filamentFor(s.ma, s.kv, op().focus);

  function prep() {
    if (s.phase === 'idle' || s.phase === 'brake') { s.phase = 'prep'; s.ampsSet = target(); emit('prep'); }
  }
  function expose() {
    if (s.phase === 'expose') return;
    s.reason = interlock(op(), s.Qa);                     // the console refuses at the press (checked again at ready)
    if (s.reason) { emit('interlock', { reason: s.reason }); return; }
    prep(); s.waiting = true;
  }
  function endBeam(type = 'expose-end') {
    if (!s.on) return;
    s.on = false; s.mA = 0; s.t1 = s.t; s.ring.at(-1).t1 = s.t;
    emit(type, { expT: s.expT });
    if (s.kOn) { s.kOn = false; emit('k-lines-off'); }
    s.phase = 'brake'; s.hold = 0; s.ampsSet = FIL.standby; emit('brake');
  }
  function release() {
    if (s.on) endBeam();
    else if (s.waiting || s.phase === 'prep' || s.phase === 'ready') { s.waiting = false; s.phase = 'brake'; s.ampsSet = FIL.standby; emit('brake'); }
  }
  function set(k, v) {
    if (s[k] === v) return;
    s[k] = v;
    if (s.phase !== 'idle' && s.phase !== 'brake') s.ampsSet = target();
    if (s.on && (k === 'kv' || k === 'ma' || k === 'focus')) {           // a new constant-power piece of the ring history
      s.ring.at(-1).t1 = s.t; s.ring.push({ t0: s.t, w: power() });
      const kOn = s.kv > K_EDGE; if (kOn !== s.kOn) { s.kOn = kOn; emit(kOn ? 'k-lines-on' : 'k-lines-off'); }
    }
  }
  const power = () => s.kv * s.ma * (1 - xrayShare(s.kv));             // W into the anode

  function sub(dt) {
    s.t += dt;
    // rotor: induction drive towards 1.02 × 9,700 rpm (first order), DC brake = constant deceleration to stop in 3 s
    const run = ROTOR.rpm * ROTOR.over;
    if (s.phase === 'prep' || s.phase === 'ready' || s.phase === 'expose') s.rpm += (run - s.rpm) * (1 - Math.exp(-dt / ROTOR.tau));
    else if (s.phase === 'brake') {
      s.rpm = Math.max(0, s.rpm - ROTOR.rpm / ROTOR.brake * dt);
      if (s.rpm === 0) { s.phase = 'idle'; emit('stop'); }
    }
    s.rev += s.rpm / 60 * dt;
    // filament: first-order boost / fall back
    s.amps += (s.ampsSet - s.amps) * (1 - Math.exp(-dt / FIL.tau));
    if (s.phase === 'prep' && s.rpm >= 0.95 * ROTOR.rpm && Math.abs(s.amps - s.ampsSet) < 0.02) { s.phase = 'ready'; emit('rotor-up', { rpm: s.rpm }); }
    if (s.phase === 'ready' && s.waiting) {
      s.waiting = false;
      const o = op(), why = interlock(o, s.Qa);
      if (why) { s.reason = why; emit('interlock', { reason: why }); s.phase = 'brake'; s.ampsSet = FIL.standby; emit('brake'); }
      else {
        s.phase = 'expose'; s.on = true; s.t0 = s.t; s.expT = 0; s.ring.push({ t0: s.t, w: power() });
        emit('expose-start', { ...o });
        if (s.kv > K_EDGE) { s.kOn = true; emit('k-lines-on'); }
      }
    }
    // beam: tube current follows the filament (emission at the present kV); heat in
    if (s.on) {
      const f = op().focus;
      s.mA = Math.min(emission(s.amps, s.kv, f), maxMA(s.kv, f) * 1.05);
      s.expT = s.t - s.t0;
      s.Qa += s.kv * s.mA * (1 - xrayShare(s.kv)) * dt;
      if (s.Qa >= ANODE.Q) { s.reason = 'heat'; emit('interlock', { reason: 'heat' }); endBeam(); }
      else if (s.expT >= s.ms / 1000 - 1e-9) endBeam();
    }
    // heat out: anode → housing / oil (radiation, fitted), housing → room
    const qa = anodeLoss(s.Qa) * dt, qh = housingLoss(s.Qh) * dt;
    s.Qa = Math.max(0, s.Qa - qa); s.Qh = Math.max(0, s.Qh + qa - qh);
    if (s.ring.length > 8) s.ring = s.ring.filter((g) => g.t1 == null || s.t - g.t1 < 6 * TAU_RING);
  }

  function step(dt) { let left = dt; while (left > 1e-12) { const h = Math.min(left, 1 / 240); sub(h); left -= h; } return api.read(); }

  const api = {
    s, events, prep, expose, release, set, step,
    /** a plain snapshot for the plate: everything instruments, card, hero and narration show */
    read() {
      const o = op(), kw = s.on ? s.kv * s.mA / 1000 : 0;
      const disc = discC(s.Qa, s.Qh), ring = ringK(s.ring, s.t);
      const flash = s.on ? flashK(s.kv * s.mA * (1 - xrayShare(s.kv)), o.focus, s.rpm) : 0;
      return {
        t: s.t, phase: s.phase, on: s.on, waiting: s.waiting, reason: s.reason,
        kv: s.kv, maSet: s.ma, ma: s.mA, ms: s.ms, focus: o.focus, spot: FOCUS[o.focus].mm,
        expT: s.on ? s.expT : s.t1 > s.t0 ? s.t1 - s.t0 : 0, t0: s.t0, t1: s.t1,
        rpm: s.rpm, rev: s.rev, amps: s.amps, filK: filamentK(s.amps, o.focus),
        kw, xshare: xrayShare(s.kv), beta: electronBeta(s.kv), kOn: s.on && s.kv > K_EDGE,
        Q: s.Qa, heat: s.Qa / ANODE.Q, hu: s.Qa / HU, Qh: s.Qh, oil: oilC(s.Qh),
        disc, trackT: disc + ring + flash, ring, flash,
        rating: ratingKW(s.ms / 1000, o.focus), lock: interlock(o, s.Qa),
      };
    },
  };
  return api;
}
