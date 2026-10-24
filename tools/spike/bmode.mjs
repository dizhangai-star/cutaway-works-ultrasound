// Sprint 0 feasibility spike: abdominal B-mode from point scatterers, convex array.
// Line-by-line beam model (Gaussian focused beam × Gabor pulse, I/Q summed per line),
// two-way frequency-dependent attenuation marched per line, interface transmission,
// TGC for liver, envelope, log compression, scan conversion. Not the plate's solver.
// node tools/spike/bmode.mjs [--f 3.5] [--n 120000] [--out out/review/spike-bmode.png]
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { deflateSync } from 'node:zlib';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const f0 = +arg('f', 3.5);            // MHz
const N = +arg('n', 600000);          // scatterers
const out = arg('out', 'out/review/spike-bmode.png');

// probe (SOURCES: 128 elements, R 50 mm, FOV 67.5°, 5-2 MHz class)
const R = 50, FOV = 67.5 * Math.PI / 180, LINES = 256, DEPTH = 160;
const c = 1.54;                       // mm/µs
const lam = c / f0;                   // mm
const k2 = 4 * Math.PI / lam;         // two-way wavenumber
const sigZ = 0.25 * lam / 0.6;        // axial pulse σ (≈60 % bandwidth)
const focus = 70, Fnum = 2.5;
const sig0 = 0.42 * lam * Fnum;       // lateral σ at focus
const AP = 40;                        // active receive aperture, mm (dynamic receive focus)

// phantom (modelled): x lateral, y depth below skin, mm
const tissues = {
  //            α dB/cm/MHz, Z MRayl, scatter amplitude
  fat:     { a: 0.6, Z: 1.38, s: 0.35 },
  muscle:  { a: 1.0, Z: 1.70, s: 0.9 },
  liver:   { a: 0.5, Z: 1.65, s: 1.0 },
  bile:    { a: 0.2, Z: 1.52, s: 0.0 },
  stone:   { a: 30,  Z: 3.0,  s: 0.3 },
  kidney:  { a: 0.8, Z: 1.62, s: 0.55 },
};
const GB = { x: -4, y: 72, rx: 30, ry: 14 };
const ST = { x: 2, y: GB.y + GB.ry - 7.5, r: 6.5 };
const tissueAt = (x, y) => {
  if (y < 9) return 'fat';
  if (y < 20) return 'muscle';
  if ((x - ST.x) ** 2 + (y - ST.y) ** 2 < ST.r ** 2) return 'stone';
  if (((x - GB.x) / GB.rx) ** 2 + ((y - GB.y) / GB.ry) ** 2 < 1) return 'bile';
  if (((x - 38) / 26) ** 2 + ((y - 128) / 16) ** 2 < 1) return 'kidney';
  return 'liver';
};

const t0 = performance.now();
// scatterers in sector
const dz = 0.05, NS = Math.round(DEPTH / dz);
const I = new Float32Array(LINES * NS), Q = new Float32Array(LINES * NS);
const dth = FOV / (LINES - 1);
let rnd = 12345; const rand = () => ((rnd = (Math.imul(rnd, 1664525) + 1013904223) >>> 0) / 4294967296);
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
const pts = [];
for (let n = 0; n < N; n++) pts.push([(rand() - .5) * FOV, rand() * DEPTH, gauss()]);
// specular surfaces: stone top, gallbladder wall, diaphragm, kidney capsule
const arc = (cx, cy, rx, ry, a0, a1, amp, m) => { for (let i = 0; i < m; i++) { const a = a0 + (a1 - a0) * rand(); pts.push(['xy', cx + rx * Math.cos(a), cy + ry * Math.sin(a), amp * (0.7 + 0.3 * rand())]); } };
arc(ST.x, ST.y, ST.r, ST.r, Math.PI * 1.05, Math.PI * 1.95, 14, 1500);
arc(GB.x, GB.y, GB.rx + .6, GB.ry + .6, 0, 2 * Math.PI, 3.5, 2500);
arc(0, 330, 200, 180, Math.PI * 1.35, Math.PI * 1.65, 6, 3000);
arc(38, 128, 26.5, 16.5, 0, 2 * Math.PI, 3, 1500);

const toPolar = (x, y) => { const r = Math.hypot(x, y + R); return [Math.atan2(x, y + R), r - R]; };
const toXY = (th, d) => [(R + d) * Math.sin(th), (R + d) * Math.cos(th) - R];
for (const p of pts) {
  let th, d, amp;
  if (p[0] === 'xy') { [th, d] = toPolar(p[1], p[2]); amp = p[3]; }
  else { [th, d] = p; const [x, y] = toXY(th, d); amp = p[2] * tissues[tissueAt(x, y)].s; }
  if (!amp || d < 0 || d >= DEPTH || Math.abs(th) > FOV / 2) continue;
  const sig = Math.hypot(sig0, 0.42 * lam * Math.max(d, 5) / AP, 0.3 * sig0 * Math.abs(d - focus) / focus * Fnum) / (R + d);   // angular σ
  const l0 = Math.round((th + FOV / 2) / dth), span = Math.ceil(3 * sig / dth);
  const s0 = Math.max(0, Math.floor((d - 3 * sigZ) / dz)), s1 = Math.min(NS - 1, Math.ceil((d + 3 * sigZ) / dz));
  for (let l = Math.max(0, l0 - span); l <= Math.min(LINES - 1, l0 + span); l++) {
    const w = amp * Math.exp(-(((l * dth - FOV / 2) - th) ** 2) / (sig * sig));   // two-way beam = Gaussian²
    for (let s = s0; s <= s1; s++) {
      const u = s * dz - d, e = w * Math.exp(-u * u / (2 * sigZ * sigZ));
      I[l * NS + s] += e * Math.cos(k2 * u); Q[l * NS + s] += e * Math.sin(k2 * u);
    }
  }
}
// attenuation + interface loss marched per line, TGC for liver-average
const TGCMAX = 55, NOISE = 4e-4;
const img = new Float32Array(LINES * NS);
for (let l = 0; l < LINES; l++) {
  const th = l * dth - FOV / 2; let dB = 0, T = 1, prev = null;
  for (let s = 0; s < NS; s++) {
    const d = s * dz, [x, y] = toXY(th, d), t = tissues[tissueAt(x, y)];
    if (prev && prev !== t) { const r = (t.Z - prev.Z) / (t.Z + prev.Z); T *= (1 - r * r) ** 2; }
    prev = t; dB += 2 * t.a * f0 * dz / 10;
    const tgc = Math.min(TGCMAX, 2 * 0.5 * 3.5 * d / 10);      // TGC set for liver at 3.5 MHz, capped
    const e = Math.hypot(I[l * NS + s], Q[l * NS + s]) * 10 ** (-dB / 20) * T;
    img[l * NS + s] = Math.hypot(e, NOISE * gauss()) * 10 ** (tgc / 20);
  }
}
const tSolve = performance.now() - t0;
const DR = +arg('dr', 60);
// log compress DR dB, scan convert
const srt = Float32Array.from(img).filter(v => v > 0).sort(); let ref = srt[Math.floor(srt.length * 0.995)] * 2.5;   // white point (gain)
const W = 900, H = 720, px = (2 * (R + DEPTH) * Math.sin(FOV / 2)) / W * 1.05;
const rgb = Buffer.alloc(W * H * 3, 8);
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  const x = (i - W / 2) * px, y = j * px - 2;
  const [th, d] = toPolar(x, y);
  if (d < 0 || d >= DEPTH - dz || Math.abs(th) > FOV / 2) continue;
  const lf = (th + FOV / 2) / dth, l = Math.min(LINES - 2, Math.floor(lf)), a = lf - l, s = Math.round(d / dz);
  const v = img[l * NS + s] * (1 - a) + img[(l + 1) * NS + s] * a;
  const g = Math.max(0, Math.min(1, 1 + 20 * Math.log10(v / ref + 1e-9) / DR));
  const o = (j * W + i) * 3; rgb[o] = rgb[o + 1] = rgb[o + 2] = Math.round(255 * g);
}
// PNG
const crc = (b) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c >>> 0; };
const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length); b.write(t, 4); d.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, 8 + d.length)), 8 + d.length); return b; };
const raw = Buffer.alloc(H * (W * 3 + 1)); for (let j = 0; j < H; j++) rgb.copy(raw, j * (W * 3 + 1) + 1, j * W * 3, (j + 1) * W * 3);
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log(JSON.stringify({ f0, lambda_mm: +lam.toFixed(3), scatterers: pts.length, lines: LINES, solve_ms: Math.round(tSolve), out }));
