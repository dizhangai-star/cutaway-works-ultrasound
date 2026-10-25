// The solver (subject): a 5–2 MHz curved-array probe imaging the series phantom. Pure (no DOM, no three.js), so
// node --test runs it. Public facts (SOURCES S1): FOV 67.5°, ROC 50 mm, aperture 60 mm, 5–2 MHz, depth ≤ 30 cm;
// c = 1540 m/s scanner convention (S2). Everything else is *modelled* (BRIEF §3).
//   · pulse / spectrum: Gabor pulse, 60 % fractional bandwidth (modelled)
//   · bmode(): line-by-line beam model on point scatterers (S0 spike, BRIEF §7): Gaussian focused beam × pulse,
//     RF summed per line, two-way attenuation α·f marched per line, interface transmission, noise floor before TGC,
//     envelope, log compression, scan conversion. Computed once per parameter change, never per frame.
//   · createSim(): session state (freeze, f, depth, gain), the drawn line sweep, events; pure in t + a command log.

export const PROBE = {
  fov: 67.5 * Math.PI / 180,          // S1
  roc: 50,                            // mm, S1
  aperture: 60,                       // mm, S1
  band: [2, 5],                       // MHz, S1
  depthMax: 300,                      // mm, S1
  c: 1.54,                            // mm/µs = 1540 m/s, S2
  elements: 128,                      // modelled (resellers, unconfirmed)
  fc: 3.5,                            // MHz, modelled centre
  bw: 0.6,                            // fractional −6 dB bandwidth, modelled
  focus: 70,                          // mm transmit focus, modelled
  rxAp: 40,                           // mm dynamic receive aperture, modelled
  lines: 128,                         // lines per frame (frame-rate reading), modelled
};
PROBE.arc = PROBE.roc * PROBE.fov;                   // 58.9 mm
PROBE.pitch = PROBE.arc / PROBE.elements;            // 0.46 mm (modelled with the count)

export const lambda = (f) => PROBE.c / f;                         // mm
export const roundTrip = (dmm) => 2 * dmm / PROBE.c;              // µs
export const depthOf = (us) => us * PROBE.c / 2;                  // mm
export const frameRate = (depthMm, lines = PROBE.lines) => 1e6 / (lines * roundTrip(depthMm));

// tissues (modelled from the S2 ranges): α dB/cm/MHz, Z MRayl, scatter amplitude
export const TISSUE = {
  gel:    { a: 0.0, Z: 1.50, s: 0.0 },
  fat:    { a: 0.6, Z: 1.38, s: 0.35 },
  muscle: { a: 1.0, Z: 1.70, s: 0.9 },
  liver:  { a: 0.5, Z: 1.65, s: 1.0 },
  bile:   { a: 0.05, Z: 1.52, s: 0.0 },
  stone:  { a: 30, Z: 3.0, s: 0.3 },
  kidney: { a: 0.8, Z: 1.62, s: 0.55 },
};

// the phantom slice under the probe (modelled): x lateral, y below the skin, mm; the stone's top at 70 mm depth
export const PH = {
  gb: { x: -4, y: 69, rx: 30, ry: 14 },
  stone: { x: 2, y: 76.5, r: 6.5 },
  kidney: { x: 38, y: 128, rx: 26, ry: 16 },
};
export function tissueAt(x, y) {
  if (y < 9) return 'fat';
  if (y < 20) return 'muscle';
  const { gb, stone: st, kidney: k } = PH;
  if ((x - st.x) ** 2 + (y - st.y) ** 2 < st.r ** 2) return 'stone';
  if (((x - gb.x) / gb.rx) ** 2 + ((y - gb.y) / gb.ry) ** 2 < 1) return 'bile';
  if (((x - k.x) / k.rx) ** 2 + ((y - k.y) / k.ry) ** 2 < 1) return 'kidney';
  return 'liver';
}

// sector geometry: the virtual apex C sits R above the face centre; (θ, d) ↔ (x, y below the skin)
export const toXY = (th, d) => [(PROBE.roc + d) * Math.sin(th), (PROBE.roc + d) * Math.cos(th) - PROBE.roc];
export const toPolar = (x, y) => [Math.atan2(x, y + PROBE.roc), Math.hypot(x, y + PROBE.roc) - PROBE.roc];
/** the line through the stone centre: angle and the depth of its top surface (the money-shot reading) */
export function stoneLine() {
  const [th, d] = toPolar(PH.stone.x, PH.stone.y);
  return { th, d: d - PH.stone.r };
}
/** view 5 Use: the stone's size, depth, echo time and the shadow it casts (the beams diverge from the sector apex) */
export function useShot(at = 105) {
  const st = stoneLine(), dia = 2 * PH.stone.r;
  return { ...st, dia, us: roundTrip(st.d), at, shadowW: dia * (PROBE.roc + at) / (PROBE.roc + PH.stone.y) };
}

// ── pulse and spectrum ─────────────────────────────────────────────────────────
const sigT = (f, bw = PROBE.bw) => Math.sqrt(2 * Math.log(2)) / (Math.PI * f * bw);   // µs, −6 dB band = bw·f
export function pulse(f = PROBE.fc, n = 240, span = 3) {
  const s = sigT(f), t = [], v = [], t0 = span / 2;
  for (let i = 0; i < n; i++) { const x = span * i / (n - 1); t.push(x); v.push(Math.exp(-((x - t0) ** 2) / (2 * s * s)) * Math.cos(2 * Math.PI * f * (x - t0))); }
  return { t, v };
}
/** amplitude spectrum, peak 1; −6 dB edges at f·(1 ± bw/2) */
export const spectrum = (fq, f = PROBE.fc, bw = PROBE.bw) => { const s = sigT(f, bw); return Math.exp(-2 * (Math.PI * s * (fq - f)) ** 2); };
export const band6 = (f = PROBE.fc, bw = PROBE.bw) => [f * (1 - bw / 2), f * (1 + bw / 2)];

// ── attenuation, TGC, penetration ──────────────────────────────────────────────
export const BUDGET = 60;              // dB between a liver echo at the face and the noise floor (modelled; gives 30 cm at 2 MHz)
export const TGCMAX = 55;              // dB
export const loss = (dmm, f, a = TISSUE.liver.a) => 2 * a * f * dmm / 10;            // two-way, dB
export const penetration = (f, a = TISSUE.liver.a) => Math.min(PROBE.depthMax, BUDGET / (2 * a * f) * 10);   // mm
/** TGC (dB) at depth: liver slope capped at TGCMAX, plus four slider points (dB) spread over the depth */
export function tgc(dmm, f, depth, sl = [0, 0, 0, 0]) {
  const k = Math.min(3, Math.max(0, dmm / depth * 3)), i = Math.min(2, Math.floor(k)), u = k - i;
  const pts = [sl[0], sl[1], sl[2], sl[3]];
  return Math.min(TGCMAX, loss(dmm, f)) + pts[i] + (pts[i + 1] - pts[i]) * u;
}

// ── focusing delays: per element, curved array, transmit focus on the line through the aperture centre ──
export function delays({ line = 0, focus = PROBE.focus, active = 64 } = {}) {
  const N = PROBE.elements, R = PROBE.roc, out = new Array(N).fill(0);
  const ang = (i) => -PROBE.fov / 2 + PROBE.fov * (i + 0.5) / N;
  const fx = (R + focus) * Math.sin(line), fy = (R + focus) * Math.cos(line);
  const c0 = Math.round((line + PROBE.fov / 2) / PROBE.fov * N - active / 2);
  const i0 = Math.max(0, Math.min(N - active, c0));
  let max = 0; const path = [];
  for (let i = i0; i < i0 + active; i++) { const p = Math.hypot(R * Math.sin(ang(i)) - fx, R * Math.cos(ang(i)) - fy); path.push(p); max = Math.max(max, p); }
  for (let k = 0; k < active; k++) out[i0 + k] = (max - path[k]) / PROBE.c;      // µs: the far elements fire first
  return { d: out, i0, active };
}

/** white point of the log compression: the 99.5th-percentile echo × 2.5 of the default image (3.5 MHz, 16 cm,
 *  gain 0), measured once and frozen (S3) so every control moves the picture against one scale. */
export const REF = 18.8;

// ── the B-mode image ───────────────────────────────────────────────────────────
let seed = 12345;
const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());

/** RF + envelope per line. Deterministic (fixed seed). ≈ 2 s at 3.5 MHz, 160 mm, 192 lines (Node, one core). */
export function bmode({ f = PROBE.fc, depth = 160, lines = 192, gain = 0, tgcPts = [0, 0, 0, 0], focus = PROBE.focus, density = 600000 / 160 } = {}) {
  seed = 12345;
  const R = PROBE.roc, FOV = PROBE.fov, lam = lambda(f), k2 = 4 * Math.PI / lam;
  const sigZ = 0.25 * lam / PROBE.bw, Fnum = 2.5, sig0 = 0.42 * lam * Fnum, AP = PROBE.rxAp;
  const dz = 0.05, NS = Math.round(depth / dz), dth = FOV / (lines - 1);
  const I = new Float32Array(lines * NS);
  const Q = new Float32Array(lines * NS);
  const N = Math.round(density * depth * (depth + 2 * R) / (160 + 2 * R));
  const pts = [];
  for (let n = 0; n < N; n++) pts.push([(rand() - 0.5) * FOV, rand() * depth, gauss()]);
  // specular surfaces: stone top, gallbladder wall, diaphragm, kidney capsule
  const arc = (cx, cy, rx, ry, a0, a1, amp, m) => { for (let i = 0; i < m; i++) { const a = a0 + (a1 - a0) * rand(); pts.push(['xy', cx + rx * Math.cos(a), cy + ry * Math.sin(a), amp * (0.7 + 0.3 * rand())]); } };
  const { gb, stone: st, kidney: kd } = PH;
  arc(st.x, st.y, st.r, st.r, Math.PI * 1.05, Math.PI * 1.95, 14, 1500);
  arc(gb.x, gb.y, gb.rx + 0.6, gb.ry + 0.6, 0, 2 * Math.PI, 3.5, 2500);
  arc(0, 330, 200, 180, Math.PI * 1.35, Math.PI * 1.65, 6, 3000);
  arc(kd.x, kd.y, kd.rx + 0.5, kd.ry + 0.5, 0, 2 * Math.PI, 3, 1500);
  for (const p of pts) {
    let th, d, amp;
    if (p[0] === 'xy') { [th, d] = toPolar(p[1], p[2]); amp = p[3]; }
    else { [th, d] = p; const [x, y] = toXY(th, d); amp = p[2] * TISSUE[tissueAt(x, y)].s; }
    if (!amp || d < 0 || d >= depth || Math.abs(th) > FOV / 2) continue;
    const sig = Math.hypot(sig0, 0.42 * lam * Math.max(d, 5) / AP, 0.3 * sig0 * Math.abs(d - focus) / focus * Fnum) / (R + d);
    const l0 = Math.round((th + FOV / 2) / dth), span = Math.ceil(3 * sig / dth);
    const s0 = Math.max(0, Math.floor((d - 3 * sigZ) / dz)), s1 = Math.min(NS - 1, Math.ceil((d + 3 * sigZ) / dz));
    for (let l = Math.max(0, l0 - span); l <= Math.min(lines - 1, l0 + span); l++) {
      const w = amp * Math.exp(-(((l * dth - FOV / 2) - th) ** 2) / (sig * sig));
      for (let s = s0; s <= s1; s++) {
        const u = s * dz - d, e = w * Math.exp(-u * u / (2 * sigZ * sigZ));
        I[l * NS + s] += e * Math.cos(k2 * u); Q[l * NS + s] += e * Math.sin(k2 * u);
      }
    }
  }
  // attenuation + interface loss marched per line; noise before TGC; envelope (env) and RF (rf) after TGC
  const NOISE = 4e-4, env = new Float32Array(lines * NS), rf = new Float32Array(lines * NS);
  const rx = new Float32Array(NS);                    // mean received level per depth, dB (before TGC), for the TGC chart
  for (let l = 0; l < lines; l++) {
    const th = l * dth - FOV / 2; let dB = 0, T = 1, prev = null;
    for (let s = 0; s < NS; s++) {
      const d = s * dz, [x, y] = toXY(th, d), tt = TISSUE[tissueAt(x, y)];
      if (prev && prev !== tt) { const r = (tt.Z - prev.Z) / (tt.Z + prev.Z); T *= (1 - r * r) ** 2; }
      prev = tt; dB += 2 * tt.a * f * dz / 10;
      const g = 10 ** ((tgc(d, f, depth, tgcPts) + gain) / 20), k = 10 ** (-dB / 20) * T;
      const n1 = NOISE * gauss(), n2 = NOISE * gauss();
      const ei = I[l * NS + s] * k + n1, eq = Q[l * NS + s] * k + n2;
      env[l * NS + s] = Math.hypot(ei, eq) * g; rf[l * NS + s] = ei * g;
      rx[s] += Math.hypot(ei, eq) / lines;
    }
  }
  const ref = REF;                                   // fixed white point: gain, TGC and f move the picture
  return { f, depth, lines, NS, dz, dth, env, rf, ref, rx: Array.from(rx, (v) => 20 * Math.log10(v / ref + 1e-12)), noise: 20 * Math.log10(NOISE * 1.25 / ref) };
}

/** scan-convert into an RGBA buffer W × H covering the sector; `px` mm per pixel, apex at (W/2, −R/px + top) */
export function scanConvert(B, W, H, { dr = 60, top = 2 } = {}) {
  const R = PROBE.roc, FOV = PROBE.fov, px = sectorPx(B.depth, W, H, top), out = new Uint8ClampedArray(W * H * 4);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const o = (j * W + i) * 4, x = (i + 0.5 - W / 2) * px, y = (j + 0.5 - top) * px;
    const [th, d] = toPolar(x, y);
    if (d < 0 || d >= B.depth - B.dz || Math.abs(th) > FOV / 2) continue;
    const lf = (th + FOV / 2) / B.dth, l = Math.min(B.lines - 2, Math.floor(lf)), a = lf - l, s = Math.round(d / B.dz);
    const v = B.env[l * B.NS + s] * (1 - a) + B.env[(l + 1) * B.NS + s] * a;
    const g = Math.max(0, Math.min(1, 1 + 20 * Math.log10(v / B.ref + 1e-9) / dr));
    out[o] = out[o + 1] = out[o + 2] = Math.round(255 * g); out[o + 3] = 255;
  }
  return out;
}
/** mm per pixel so the whole sector of `depth` fits W × H below a `top` px margin */
export function sectorPx(depth, W, H, top = 2) {
  const R = PROBE.roc, half = PROBE.fov / 2;
  const w = 2 * (R + depth) * Math.sin(half), h = (R + depth) - R * Math.cos(half);
  return Math.max(w / W, h / (H - top - 2));
}

// ── session: freeze / scan, parameters, the drawn sweep ────────────────────────
// The real frame takes 27 ms at 16 cm (37 fps): far too fast to watch, so the sweep is drawn at 1/100 speed.
export const DRAWN = 1 / 100;
export const LINEAR_F = 9;           // MHz, typical linear-array centre (modelled)
export function createSim(opts = {}) {
  const s = { t: 0, f: PROBE.fc, lin: false, depth: 160, focus: PROBE.focus, gain: 0, dr: 60, tgc: [0, 0, 0, 0], frozen: false, sweep: 0, frames: 0, events: [], ...opts };
  return {
    s,
    set(k, v) { s[k] = v; s.events.push({ t: s.t, type: 'set', k, v }); },
    freeze() { s.frozen = true; s.events.push({ t: s.t, type: 'freeze' }); },
    scan() { s.frozen = false; s.events.push({ t: s.t, type: 'scan' }); },
    step(dt) {
      s.t += dt;
      if (!s.frozen) { s.sweep += dt * DRAWN * frameRate(s.depth); while (s.sweep >= 1) { s.sweep -= 1; s.frames++; } }
      return this.read();
    },
    read() {
      // LINEAR: the 9 MHz comparison (a linear probe's frequency on this sector, BRIEF §5); f is the one imaged
      const st = stoneLine(), us = roundTrip(st.d), f = s.lin ? LINEAR_F : s.f;
      return { ...s, f, fDial: s.f, events: s.events, lambda: lambda(f), fps: frameRate(s.depth), line: Math.min(PROBE.lines - 1, Math.floor(s.sweep * PROBE.lines)),
        stone: { ...st, us }, pen: penetration(f), band: band6(f) };
    },
  };
}
