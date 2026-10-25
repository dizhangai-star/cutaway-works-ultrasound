#!/usr/bin/env node
// Ultrasound probe score + machine sound, written in code (Sprint 6). Series style B (xray, user 2026-10-21; kept for
// No. 03): quiet, clinical, glass pads and a low drone, no percussion. The probe is silent, so the "machine" stem
// sonifies the solver's drawn sweep replayed from demo.json (one tick per scan line, a ping per frame, stops on freeze).
// Four stems on the film's audio timeline (film time × K, K = the render's --rate), 48 kHz stereo float WAV, unscaled:
//   BED  drone + air, always (ducked a little under the voice by tools/mix.mjs)
//   MID  glass pads + tines (ducked deeply under the voice), with its reverb
//   MAC  scan-line ticks, stone tick, frame pings
//   UI   knob detents, view swipes
//   node audio/score.mjs [--rate 1]  → audio/build/{bed,mid,mac,ui}.wav
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hz, panG, rng, freeverb } from '../../../_kit/audio/dsp.mjs'
import { createSim, stoneLine, PROBE } from '../js/sim.js'
import { plan } from '../js/demo-plan.js'

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '..')
const argv = process.argv.slice(2), K = +(argv[argv.indexOf('--rate') + 1] || 1) || 1
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'demo.json'), 'utf8')), PL = plan(D)
const SR = 48000, LEN = D.len * K, N = Math.ceil(LEN * SR), A = (t) => t * K   // film time → audio time
const bus = () => [new Float32Array(N), new Float32Array(N)]
const BED = bus(), MID = bus(), MAC = bus(), UI = bus()
const { rnd } = rng(5202)
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x)), sm = (u) => (u = clamp(u), u * u * (3 - 2 * u))

// ---------- the solver, replayed (film time, 1/240 s): drawn sweep line, frozen or scanning
const DT = 1 / 240, trace = { line: [], frozen: [] }
{
  const sim = createSim(); let i = 0
  for (let t = 0; t <= D.len + 1e-9; t += DT) {
    while (i < PL.sim.length && PL.sim[i].t <= t + 1e-9) { const c = PL.sim[i++]; c.k === 'set' ? sim.set(c.p, c.v) : sim[c.k]() }
    const r = sim.step(DT); trace.line.push(r.line); trace.frozen.push(r.frozen ? 1 : 0)
  }
}
const STONE = Math.floor((stoneLine().th + PROBE.fov / 2) / PROBE.fov * PROBE.lines)   // the line through the stone
// ---------- voices
function tone(b, t, d, f, v, pan, { atk = 0.002, dec = 0, rel = 0.01 } = {}) {   // sine, attack / exp decay / release
  const s0 = Math.floor(t * SR), n = Math.min(Math.ceil((d + rel) * SR), N - s0); if (n <= 0 || s0 < 0) return
  const [gl, gr] = panG(pan), w = 2 * Math.PI * f / SR, dn = d * SR, ph = rnd() * 6.28
  for (let i = 0; i < n; i++) {
    const e = Math.min(1, i / (atk * SR + 1)) * (dec ? Math.exp(-i / (dec * SR)) : 1) * (i > dn ? Math.exp(-(i - dn) / (rel * SR + 1)) : 1)
    const y = Math.sin(ph + w * i) * e * v; b[0][s0 + i] += y * gl; b[1][s0 + i] += y * gr
  }
}
function noise(b, t, d, v, pan, { bp = 2000, q = 1, atk = 0.002, dec, sweep, shape } = {}) {   // band-passed noise
  const s0 = Math.floor(t * SR), n = Math.min(Math.ceil(d * SR), N - s0); if (n <= 0 || s0 < 0) return
  const [gl, gr] = panG(pan); let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < n; i++) {
    const u = i / n, f0 = sweep ? sweep[0] * (sweep[1] / sweep[0]) ** u : bp
    const w = 2 * Math.PI * Math.min(f0, SR * 0.45) / SR, al = Math.sin(w) / (2 * q), a0 = 1 + al
    const xin = rnd() * 2 - 1, y = (al * xin - al * x2 + 2 * Math.cos(w) * y1 - (1 - al) * y2) / a0
    x2 = x1; x1 = xin; y2 = y1; y1 = y
    const e = Math.min(1, i / (atk * SR + 1)) * (shape ? shape(u) : Math.exp(-i / (SR * (dec ?? d / 4))))
    b[0][s0 + i] += y * e * v * gl; b[1][s0 + i] += y * e * v * gr
  }
}
// glass pad note: 5 detuned voices (±3 / ±7 cents) each with 6 partials falling 1/k^1.7, slow random pitch drift per
// voice, a breath of band-passed noise on the fundamental, long attack and release, soft saturation
function pad(t0, t1, m, v, pan) {
  const f = hz(m), atk = 2.2, rel = 2.8, s0 = Math.floor(t0 * SR), n = Math.min(Math.ceil((t1 - t0 + rel * 2.5) * SR), N - s0)
  if (n <= 0) return
  const dn = (t1 - t0) * SR, [gl, gr] = panG(pan), DET = [-7, -3, 0, 3, 7], H = 6
  const vs = DET.map((c, j) => ({ r: 2 ** (c / 1200), ph: Array.from({ length: H }, () => rnd() * 6.28), dr: rnd() * 6.28, ds: 0.13 + 0.11 * rnd(), side: (j - 2) / 2 }))
  let b1 = 0, b2 = 0, bx1 = 0, bx2 = 0; const bw = 2 * Math.PI * f / SR, bal = Math.sin(bw) / 16, ba0 = 1 + bal
  for (let i = 0; i < n; i++) {
    const t = i / SR, e = sm(i / (atk * SR)) * (i > dn ? Math.exp(-(i - dn) / (rel * SR)) : 1)
    let l = 0, r = 0
    for (const o of vs) {
      const drift = 2 ** (4 * Math.sin(o.dr + t * o.ds) / 1200)
      let y = 0
      for (let k = 1; k <= H; k++) { o.ph[k - 1] += 2 * Math.PI * f * k * o.r * drift * (1 + 0.0004 * k * k) / SR; y += Math.sin(o.ph[k - 1]) / k ** 1.7 }
      l += y * (1 - o.side * 0.6); r += y * (1 + o.side * 0.6)
    }
    const xin = rnd() * 2 - 1, yb = (bal * xin - bal * bx2 + 2 * Math.cos(bw) * b1 - (1 - bal) * b2) / ba0; bx2 = bx1; bx1 = xin; b2 = b1; b1 = yb
    const g = e * v * 0.2
    MID[0][s0 + i] += Math.tanh((l + yb * 1.2) * g * 4) / 4 * gl * 1.41; MID[1][s0 + i] += Math.tanh((r + yb * 1.2) * g * 4) / 4 * gr * 1.41
  }
}
// glass tine: struck glass, inharmonic partials (1, 2.76, 5.4) dying fast above the fundamental
function tine(t, m, v, pan) {
  const f = hz(m); tone(MID, t, 0, f, v, pan, { rel: 1.9 }); tone(MID, t, 0, f * 2.76, v * 0.18, pan, { rel: 0.35 }); tone(MID, t, 0, f * 5.4, v * 0.05, pan, { rel: 0.08 })
}
// drone: root with 8 partials under a slowly breathing low-pass (~90–260 Hz), two detuned voices, crossfaded per section
function drone(t0, t1, m, v) {
  const s0 = Math.floor(t0 * SR), s1 = Math.min(N, Math.ceil(t1 * SR)), x = 1.6 * SR, f = hz(m), ph = Array.from({ length: 17 }, () => rnd() * 6.28), lf = rnd() * 6.28
  let lpL = 0, lpR = 0
  for (let s = s0; s < s1; s++) {
    const i = s - s0, t = i / SR, e = Math.min(1, i / x, (s1 - s) / x) * v, fc = 90 + 170 * (0.5 + 0.5 * Math.sin(lf + t * 0.21)), a = 1 - Math.exp(-2 * Math.PI * fc / SR)
    let yl = 0, yr = 0
    for (let k = 1; k <= 8; k++) { const w = 2 * Math.PI * f * k / SR; yl += Math.sin(ph[k] + w * i * 1.0015) / k; yr += Math.sin(ph[k + 8] + w * i * 0.9985) / k }
    lpL += a * (yl - lpL); lpR += a * (yr - lpR)
    BED[0][s] += lpL * e; BED[1][s] += lpR * e
  }
}
// ---------- harmony (film time), per demo section: E-centred glass voicings, lydian lift at the end
const SECT = [
  [0, 9.71, 28, [64, 67, 71, 78]],        // cold open: the stone on the film, Em(add9)
  [9.71, 19.5, 36, [64, 67, 71, 76]],     // the probe: Cmaj7
  [19.5, 38, 33, [60, 64, 67, 71]],       // cut open, the stack: Am9
  [38, 51.45, 28, [59, 64, 66, 71]],      // the pulse, focusing: Esus2
  [51.45, 66.2, 31, [62, 66, 67, 71]],    // frozen line, echo times: Gmaj7
  [66.2, 77.88, 33, [60, 64, 71, 76]],    // the shadow: Am(add9)
  [77.88, 84.34, 36, [64, 66, 67, 71]],   // scanning again, a frame: C lydian
  [84.34, 98.99, 35, [64, 66, 71, 76]],   // the array, frequency vs depth: Bsus4
  [98.99, 112.4, 33, [60, 64, 67, 71]],   // the use shot again: Am9
  [112.4, D.len, 28, [68, 71, 75, 78]],   // the end: E(add9)
]
for (const [t0, t1, root, ch] of SECT) {
  const a0 = A(t0), a1 = A(t1), last = t1 >= D.len
  drone(Math.max(0, a0 - 0.8), last ? LEN : a1 + 0.8, root, 0.05)
  ch.forEach((m, k) => pad(Math.max(0, a0 - 0.6), last ? LEN - 3.2 : a1 + 0.2, m, 0.016 * (k === 3 ? 0.6 : 1), [-0.5, -0.15, 0.2, 0.5][k]))
}
// air: a lightbox room tone above the voice, very low
noise(BED, 0, LEN, 0.004, 0, { bp: 7500, q: 0.5, shape: (u) => Math.min(1, u * LEN / 2, (1 - u) * LEN / 3) })
// tines in the caption gaps (≥ 0.7 s): 2–3 notes of the chord, rising, an octave up
const chordAt = (t) => SECT.find(([a, b]) => t >= a && t < b)?.[3] ?? SECT[0][3]
D.captions.forEach((c, i) => {
  const end = c.t + c.d, next = D.captions[i + 1]?.t ?? D.len, gap = next - end
  if (gap < 0.7) return
  const ch = chordAt(end + 0.1), n = gap > 1.4 ? 3 : 2
  for (let k = 0; k < n; k++) tine(A(end + 0.12 + k * 0.32), ch[(i + k) % 4] + 12, 0.05 * (1 - k * 0.2), (k - 1) * 0.3)
})
// the end: a last high tine on the downbeat of the final chord
tine(A(112.6), 80, 0.06, 0); tine(A(112.95), 83, 0.045, 0.2)

// sub blooms (no drums): a 45 Hz swell under the reveals — the result, the cut, the shadow, the end
for (const [t, v] of [[0.9, 0.3], [19.5, 0.2], [66.2, 0.22], [112.4, 0.3]]) {
  const a0 = A(t) - 0.6, s0 = Math.floor(a0 * SR), n = Math.min(Math.ceil(4.5 * SR), N - s0), ph = rnd() * 6.28
  for (let i = 0; i < n; i++) { const u = i / SR, e = u < 0.6 ? sm(u / 0.6) : Math.exp(-(u - 0.6) / 1.4), y = Math.sin(ph + 2 * Math.PI * (45 - 4 * Math.min(1, u / 3)) * u) * e * v; BED[0][s0 + i] += y; BED[1][s0 + i] += y }
}

// ---------- machine: the probe itself is silent (MHz); the drawn sweep is sonified, honestly slowed like the picture
// (DRAWN = 1/100): a faint tick per scan line (one transmit-receive), a brighter one on the stone's line, a soft
// glass ping at each new frame; nothing while frozen, so the freeze is heard
{
  let prev = trace.line[0]
  for (let k = 1; k < trace.line.length; k++) {
    if (trace.frozen[k]) { prev = trace.line[k]; continue }
    const l = trace.line[k], t = A(k * DT)
    if (l === prev) continue
    if (l < prev) { tone(MAC, t, 0, 659.3, 0.022, 0, { atk: 0.006, rel: 1.2 }); tone(MAC, t, 0, 659.3 * 2.76, 0.005, 0, { rel: 0.2 }); tone(MAC, t, 0, 659.3 * 5.4, 0.002, 0, { rel: 0.06 }) }   // new frame: soft glass
    const pan = (l / PROBE.lines - 0.5) * 1.2, hit = l === STONE
    noise(MAC, t, 0.008, hit ? 0.1 : 0.05, pan, { bp: hit ? 2400 : 5200, q: 2.5, dec: 0.0015 })
    if (hit) tone(MAC, t + 0.004, 0, 1975.5, 0.02, pan, { rel: 0.25 })
    prev = l
  }
}
// ---------- UI
const knob = (t) => { noise(UI, t, 0.012, 0.25, -0.4, { bp: 3500, q: 1.5, dec: 0.002 }); tone(UI, t, 0, 920, 0.05, -0.4, { rel: 0.015 }) }
for (const a of PL.acts) {
  if (a.kind === 'click') knob(A(a.t))
  else if (a.kind === 'drag') for (let t = a.t; t < a.t1; t += 0.11) noise(UI, A(t), 0.006, 0.07, -0.4, { bp: 5200, q: 2, dec: 0.0015 })
}
// view changes: a swipe peaking on the cut + a soft detent on it (an attack the eye's cut can land on); the film's first frame too
const detent = (t, v) => { noise(UI, t, 0.01, v, 0, { bp: 2600, q: 1.2, dec: 0.003 }); tone(UI, t, 0, 640, v * 0.25, 0, { rel: 0.03 }) }
for (const v of PL.views) if (v.t > 0.5) { noise(UI, A(v.t) - 0.28, 0.55, 0.06, 0, { sweep: [700, 3200], q: 0.9, shape: (u) => Math.sin(Math.PI * u) ** 2 }); detent(A(v.t), 0.14) }
detent(0.18, 0.12)

// ---------- ensemble on MID and BED: three slowly modulated delays per side (string-machine chorus, 7–19 ms)
function ensemble(b, mix = 0.6) {
  const D = Math.ceil(0.03 * SR), src = [Float32Array.from(b[0]), Float32Array.from(b[1])]
  const taps = [[0.011, 0.0035, 0.31], [0.014, 0.0028, 0.53], [0.017, 0.0041, 0.83]].map(([d, dep, r], j) => ({ d, dep, r, p: j * 2.1 }))
  for (let c = 0; c < 2; c++) for (let s = D; s < N; s++) {
    let y = 0
    for (const o of taps) { const del = (o.d + o.dep * Math.sin(o.p + c * 1.6 + 2 * Math.PI * o.r * s / SR)) * SR, i = Math.floor(del), fr = del - i; y += src[c][s - i] * (1 - fr) + src[c][s - i - 1] * fr }
    b[c][s] = src[c][s] * (1 - mix) + y / 3 * mix * 1.3
  }
}
ensemble(MID); ensemble(BED, 0.4)
for (let s = 0; s < N; s++) { const m = (MID[0][s] + MID[1][s]) / 2, d = (MID[0][s] - MID[1][s]) / 2 * 1.8; MID[0][s] = m + d; MID[1][s] = m - d }   // wider pads (M/S)
// ---------- room on BED (short) and MID (pads + tines, long): mono send, two decorrelated tails
{
  const send = new Float32Array(N); for (let s = 0; s < N; s++) send[s] = (BED[0][s] + BED[1][s]) * 0.5
  const wl = freeverb(send, 0, { room: 0.8, damp: 0.6 }), wr = freeverb(send, 23, { room: 0.8, damp: 0.6 })
  for (let s = 0; s < N; s++) { BED[0][s] += wl[s] * 0.35; BED[1][s] += wr[s] * 0.35 }
}
{
  const send = new Float32Array(N); for (let s = 0; s < N; s++) send[s] = (MID[0][s] + MID[1][s]) * 0.5
  const wl = freeverb(send, 0, { room: 0.9, damp: 0.45, pre: 0.035 }), wr = freeverb(send, 23, { room: 0.9, damp: 0.45, pre: 0.035 })
  for (let s = 0; s < N; s++) { MID[0][s] += wl[s] * 0.7; MID[1][s] += wr[s] * 0.7 }
}
// fade the whole score out over the last 2.5 s
for (const b of [BED, MID, MAC, UI]) for (let s = Math.floor((LEN - 2.5) * SR); s < N; s++) { const g = sm((N - s) / (2.5 * SR)); b[0][s] *= g; b[1][s] *= g }

// ---------- float WAV out
function writeF32(f, [L, R]) {
  const n = L.length, data = Buffer.alloc(n * 8)
  for (let s = 0; s < n; s++) { data.writeFloatLE(L[s], s * 8); data.writeFloatLE(R[s], s * 8 + 4) }
  const h = Buffer.alloc(44)
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(2, 22)
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 8, 28); h.writeUInt16LE(8, 32); h.writeUInt16LE(32, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40)
  fs.writeFileSync(f, Buffer.concat([h, data]))
}
const out = path.join(HERE, 'build'); fs.mkdirSync(out, { recursive: true })
for (const [k, b] of Object.entries({ bed: BED, mid: MID, mac: MAC, ui: UI })) writeF32(path.join(out, `${k}.wav`), b)
console.log(`score ×${K}: ${LEN.toFixed(2)} s, stone line ${STONE} → audio/build/{bed,mid,mac,ui}.wav`)
