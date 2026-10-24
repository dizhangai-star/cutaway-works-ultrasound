#!/usr/bin/env node
// Narration (口播): demo.json captions → spoken lines → local Qwen3-TTS (tools/tts_qwen.py) → one voice stem on the
// film timeline, out/voice/voice.<lang>.wav (48 kHz mono PCM16), plus a per-line report.
//   node tools/voice.mjs --lang zh [--retime] [--draft] [--speaker | --clone <wav>] [--mux out/preview/xray-zh-preview.mp4] [--lines]
//   (--lines: print spoken text only; --retime: lengthen captions to cover their voice; --draft: write even with failed lines)
// Subject-free: needs only demo.json { len, captions: [{ t, d, zh, en, say?: { zh?, en? }, seed?: { zh?, en? } }] }.
// Spoken text = caption minus (parenthesised terms) and “quotes”, numbers made speakable; `say` overrides it.
// Each line starts at its caption and may run into the gap up to the next caption − GAP; past that it is sped up
// (≤ MAX_SPEED, atempo), and past that the run fails and says by how much to lengthen the slot.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '..')
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d }
const lang = opt('--lang', 'zh'), RATE = 48000, DRAFT = argv.includes('--draft')
// --stretch k: the picture plays k× slower (render with film-time steps of 1 / (fps × k)); lines are placed at t × k
const K = +opt('--stretch', 1)
const QWEN = process.env.QWEN_HOME || path.join(os.homedir(), 'dev/tools/qwen-local')
const PY = process.env.QWEN_PYTHON || path.join(QWEN, '.venv/bin/python')
const GAP = 0.12, MAX_SPEED = 1.12, LEAD = 0.05, TARGET_LUFS = -16

const VOICES = {   // clone: a reference take (+ .txt transcript beside it) every line continues = the default mode
  zh: { speaker: 'Serena', f0: 250, temperature: 0.6, language: 'Chinese', instruct: '自然、清晰的普通话科普解说，语气平实，避免夸张。',
    clone: 'refs/voice/serena-ref-pad.wav' },
  en: { speaker: 'Aiden', temperature: 0.6, language: 'English', instruct: 'Clear, natural documentary narration, calm and even, no hype.',
    clone: 'refs/voice/aiden-ref-pad.wav' },
}
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'demo.json'), 'utf8'))
const V = { model: 'mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-4bit', ...VOICES[lang], ...(D.voice?.[lang] ?? {}) }
// Clone mode (default when the voice has a `clone` reference): every line continues one reference take (Base model,
// no speaker / instruct), so the whole narration keeps that take's timbre, pace and tone; lines voiced one by one
// with a preset speaker drift in tone from line to line. --clone <wav> [--clone-text "..."] picks another reference
// (transcript defaults to <wav>.txt); --speaker forces the preset speaker (outputs then get the suffix .speaker).
const SPEAKER = argv.includes('--speaker'), CLONE = SPEAKER ? null : opt('--clone', V.clone)
const TAG = (SPEAKER && V.clone ? '.speaker' : '') + (K !== 1 ? `.x${K.toFixed(2)}` : '')
delete V.clone
if (CLONE) Object.assign(V, { model: opt('--clone-model', 'mlx-community/Qwen3-TTS-12Hz-1.7B-Base-4bit'), ref_audio: path.resolve(ROOT, CLONE),
  ref_text: opt('--clone-text', fs.readFileSync(path.resolve(ROOT, CLONE).replace(/\.wav$/, '.txt'), 'utf8').trim()), speaker: 'clone', instruct: undefined })

// ---- spoken text
function speakable(s) {
  s = s.replace(/[（(][^）)]*[）)]/g, '').replace(/[“”"]/g, '')
  s = s.replace(/(\d)[\s\u2009\u202f,](?=\d{3}\b)/g, '$1')              // 9 700 / 9,700 → 9700
  if (lang === 'zh') {
    s = s.replace(/(\d+(?:\.\d+)?)\s*%/g, (_, n) => `百分之${/^\d$/.test(n) ? '零一二三四五六七八九'[n] : n}`).replace(/\s*°C/g, '摄氏度')
    s = s.replace(/\s+/g, '').replace(/([，。：；？！])\1+/g, '$1')
  } else {
    s = s.replace(/(\d)\s*%/g, '$1 percent').replace(/\s*°C/g, ' degrees Celsius').replace(/\bkV\b/g, 'kilovolts').replace(/\bcm\b/g, 'centimetres')
    s = s.replace(/\s+([,.:;?!])/g, '$1').replace(/\s{2,}/g, ' ').trim()
  }
  return s
}
const caps = D.captions.map((c, i) => ({ i, id: `c${String(i + 1).padStart(2, '0')}`, t: c.t, d: c.d, caption: c[lang],
  text: c.say?.[lang] ?? speakable(c[lang]), seed: (!CLONE && c.seed?.[lang]) || 1, pinned: !CLONE && c.seed?.[lang] != null }))   // a pinned seed belongs to the speaker model, not the clone
if (argv.includes('--lines')) { for (const c of caps) console.log(`${c.id} ${c.t.toFixed(2).padStart(6)}  ${c.text}`); process.exit(0) }

// ---- voice lines (cached by text + seed)
const work = path.join(ROOT, 'out/voice'), cache = path.join(work, `cache-${lang}${CLONE ? '.clone' : ''}`)
fs.mkdirSync(cache, { recursive: true })
function synth(items) {
  const jobFile = path.join(work, `job-${lang}.json`)
  fs.writeFileSync(jobFile, JSON.stringify({ out: cache, ...V, items }, null, 1))
  const out = execFileSync(PY, ['-I', path.join(HERE, 'tts_qwen.py'), jobFile], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 26 })
  return JSON.parse(out.trim().split('\n').pop())
}
// speech rate guard: a take far slower than normal speech has repeated or rambled (TTS loops on lists)
const units = (s) => lang === 'zh' ? s.replace(/[^\p{Script=Han}A-Za-z0-9]/gu, '').length : s.split(/\s+/).filter(Boolean).length
const MIN_RATE = lang === 'zh' ? 2.8 : 1.6, TAKES = 5   // zh chars / s, en words / s (after pause squeeze)

// ---- WAV I/O (PCM16 mono)
function readWav(f) {
  const b = fs.readFileSync(f); let p = 12, data = null
  while (p < b.length) { const id = b.toString('ascii', p, p + 4), n = b.readUInt32LE(p + 4); if (id === 'data') { data = b.subarray(p + 8, p + 8 + n); break } p += 8 + n + (n & 1) }
  const x = new Float32Array(data.length >> 1); for (let i = 0; i < x.length; i++) x[i] = data.readInt16LE(i * 2) / 32768
  return x
}
function writeWav(f, x) {
  const b = Buffer.alloc(44 + x.length * 2)
  b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22)
  b.writeUInt32LE(RATE, 24); b.writeUInt32LE(RATE * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(x.length * 2, 40)
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), 44 + i * 2)
  fs.writeFileSync(f, b)
}
// trim leading / trailing silence (−45 dBFS over 10 ms windows), keep 30 ms
function trim(x) {
  const w = RATE / 100, th = 10 ** (-45 / 20), loud = (k) => { let m = 0; for (let i = k; i < Math.min(x.length, k + w); i++) m = Math.max(m, Math.abs(x[i])); return m > th }
  let a = 0, z = x.length; while (a < z && !loud(a)) a += w; while (z > a && !loud(z - w)) z -= w
  // a lead-in blip (≤ 250 ms of sound, then ≥ 80 ms quiet) is the clone reference's last syllable leaking in: drop it
  let b = a; while (b < z && loud(b)) b += w
  let c = b; while (c < z && !loud(c)) c += w
  if (b - a <= 0.25 * RATE && c - b >= 0.08 * RATE && c < z) a = c
  return x.subarray(Math.max(0, a - 0.03 * RATE), Math.min(x.length, z + 0.03 * RATE))
}
// shorten every inner pause (< −40 dBFS over 20 ms windows) longer than PAUSE to PAUSE, cut in its middle
const PAUSE = 0.3
function squeeze(x) {
  const w = RATE / 50, th = 10 ** (-40 / 20), quiet = []
  for (let k = 0; k + w <= x.length; k += w) { let m = 0; for (let i = k; i < k + w; i++) m = Math.max(m, Math.abs(x[i])); quiet.push(m < th) }
  const keep = []; let a = 0
  for (let k = 0; k < quiet.length;) {
    if (!quiet[k]) { k++; continue }
    let z = k; while (z < quiet.length && quiet[z]) z++
    const len = (z - k) * w
    if (k > 0 && z < quiet.length && len > PAUSE * RATE) { const mid = k * w + len / 2, cut = (len - PAUSE * RATE) / 2; keep.push([a, Math.round(mid - cut)]); a = Math.round(mid + cut) }
    k = z
  }
  keep.push([a, x.length])
  const y = new Float32Array(keep.reduce((s, [p, q]) => s + q - p, 0)); let o = 0
  for (const [p, q] of keep) { y.set(x.subarray(p, q), o); o += q - p }
  return y
}
function tempo(x, speed) {
  const a = path.join(work, 'tmp-a.wav'), b = path.join(work, 'tmp-b.wav'); writeWav(a, x)
  execFileSync('ffmpeg', ['-nostdin', '-y', '-v', 'error', '-i', a, '-af', `atempo=${speed.toFixed(6)}`, '-ar', String(RATE), '-ac', '1', '-c:a', 'pcm_s16le', b])
  const y = readWav(b); fs.rmSync(a); fs.rmSync(b); return y
}

// ---- pick a take per line. Qwen's sampling varies a lot per seed (same line: pitch ±½ octave, rate ×2, now and then
// another timbre), so voice TAKES seeds per line and keep the most typical take: among those with a plausible rate,
// the speaker's pitch (median F0 within DRIFT octaves of REF) and a fit in the slot, the one nearest the speaker's
// pitch and the line's median rate. A `seed` on the caption pins that one take. Up to ROUNDS × TAKES seeds.
caps.forEach((c, k) => { c.start = c.t * K + LEAD; c.slot = (k + 1 < caps.length ? caps[k + 1].t : D.len) * K - GAP - c.start })
const DRIFT = 0.5, ROUNDS = 2
let REF = V.f0   // the speaker's median F0; else the median of the first takes
const drift = (f0) => !f0 || Math.abs(Math.log2(f0 / REF)) > DRIFT
const CUT_DB = -35   // a take whose last 10 ms is louder than this stopped mid-syllable (swallowed last word)
const ok = (c, k) => units(c.text) / k.x.length * RATE >= MIN_RATE && k.x.length / RATE <= c.slot * MAX_SPEED && !drift(k.f0) && !(k.tail > CUT_DB)
for (const c of caps) c.takes = []
let todo = caps
for (let round = 0; round < ROUNDS && todo.length; round++) {
  const items = todo.flatMap((c) => (c.pinned ? [c.seed] : Array.from({ length: TAKES }, (_, s) => c.seed + round * TAKES + s)).map((seed) => ({ id: c.id, text: c.text, seed, c })))
  const res = synth(items.map(({ id, text, seed }) => ({ id, text, seed })))
  if (!REF) { const f = res.map((r) => r.f0).filter(Boolean).sort((a, b) => a - b); REF = f[f.length >> 1] }
  items.forEach((it, j) => it.c.takes.push({ seed: it.seed, f0: res[j].f0, tail: res[j].tail_db, x: squeeze(trim(readWav(res[j].file))) }))
  todo = todo.filter((c) => !c.pinned && !c.takes.some((k) => ok(c, k)))
}
for (const c of caps) {
  const good = c.takes.filter((k) => ok(c, k)), pool = good.length ? good : c.takes
  const rates = pool.map((k) => units(c.text) / k.x.length * RATE).sort((a, b) => a - b), mr = rates[rates.length >> 1]
  const score = (k) => Math.abs(Math.log2((k.f0 || 1) / REF)) + Math.abs(units(c.text) / k.x.length * RATE - mr) / mr
  const best = pool.reduce((a, b) => (score(b) < score(a) ? b : a))
  Object.assign(c, { x: best.x, f0: best.f0, tail: best.tail, take: best.seed, nGood: good.length, nTakes: c.takes.length }); delete c.takes
}

// ---- place on the timeline
const report = [], fail = [], stem = new Float32Array(Math.ceil(D.len * K * RATE))
caps.forEach((c, k) => {
  let x = c.x; const raw = x.length / RATE, start = c.start, slot = c.slot
  const speed = Math.max(1, raw / slot), rate = units(c.text) / raw
  const r = { id: c.id, t: c.t, caption_d: c.d, slot: +slot.toFixed(2), voice: +raw.toFixed(2), speed: +speed.toFixed(3), rate: +rate.toFixed(2), f0: c.f0, seed: c.take, good: c.nGood, takes: c.nTakes, text: c.text }
  if (rate < MIN_RATE) r.suspect = true
  if (drift(c.f0)) r.suspect = r.drift = true
  if (c.tail > CUT_DB) r.suspect = r.cut = true
  const bad = speed > MAX_SPEED || r.suspect
  if (bad) { r.need = +Math.max(0, raw / MAX_SPEED - slot).toFixed(2); fail.push(r) }
  if (!bad || DRAFT) {   // --draft: a failed line is laid in whole, running over the next one, so it can be heard
    if (speed > 1 && !bad) x = tempo(x, speed)
    const n = bad ? Math.min(x.length, stem.length - Math.round(start * RATE)) : Math.min(x.length, Math.round(slot * RATE)), s0 = Math.round(start * RATE), f = Math.round(0.008 * RATE)
    for (let i = 0; i < n; i++) stem[s0 + i] += x[i] * Math.min(1, i / f, (n - 1 - i) / f)
    r.end = +(start + n / RATE).toFixed(2)
    if (r.end > (c.t + c.d) * K) r.caption_short = +(r.end / K - c.t - c.d).toFixed(2)   // the caption leaves before the voice ends (film time)
  }
  report.push(r)
})
fs.writeFileSync(path.join(work, `report-${lang}${TAG}.json`), JSON.stringify({ voice: V, report }, null, 1))
for (const r of report) console.log(`${r.id} ${r.t.toFixed(2).padStart(6)}  slot ${r.slot.toFixed(2)}  voice ${r.voice.toFixed(2)}  ×${r.speed.toFixed(2)}  ${r.rate.toFixed(1)}/s  ${Math.round(r.f0)} Hz  seed ${r.seed} (${r.good}/${r.takes} ok)${r.cut ? "  CUT (last word swallowed)" : r.drift ? "  DRIFT (another voice)" : r.suspect ? "  SUSPECT (slow: repeated?)" : ""}${r.need ? `  FAIL +${r.need}s` : ''}${r.caption_short ? `  caption +${r.caption_short}s` : ''}  ${r.text}`)
if (fail.length) { console.error(`\n${fail.length} line(s) failed after ${ROUNDS * TAKES} takes: reword (say), pin a seed, or open the slot; ${DRAFT ? 'draft: laid in whole, overlapping' : 'nothing written (--draft lays them in anyway)'}.`); if (!DRAFT) process.exit(1) }

// ---- voice chain: high-pass + gentle compression, one static gain to TARGET_LUFS, true-peak limit −1.5 dBFS
const pre = path.join(work, `voice.${lang}.pre.wav`), mid = path.join(work, `voice.${lang}.comp.wav`), wav = path.join(work, `voice.${lang}${TAG}.wav`)
const ff = (i, af, o) => execFileSync('ffmpeg', ['-nostdin', '-y', '-v', 'error', '-i', i, '-af', af, '-ar', String(RATE), '-ac', '1', '-c:a', 'pcm_s16le', o])
const loud = (f) => { const log = spawnSync('ffmpeg', ['-nostdin', '-i', f, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' }).stderr
  const last = (re) => +log.match(re).slice(-1)[0].match(/-?[\d.]+/)[0]; return { I: last(/I:\s+-?[\d.]+ LUFS/g), TP: last(/Peak:\s+-?[\d.]+ dBFS/g) } }
writeWav(pre, stem)
ff(pre, `highpass=f=70,acompressor=threshold=${10 ** (-26 / 20)}:ratio=3:attack=4:release=120:knee=4`, mid)
const L0 = loud(pre), L1 = loud(mid)
ff(mid, `volume=${(TARGET_LUFS - L1.I).toFixed(2)}dB,alimiter=limit=${10 ** (-2 / 20)}:attack=2:release=60:level=false`, wav)
const L2 = loud(wav); fs.rmSync(pre); fs.rmSync(mid)
console.log(`\n${caps.length} lines → ${path.relative(ROOT, wav)}  (${L0.I.toFixed(1)} LUFS → ${L2.I.toFixed(1)} LUFS, peak ${L2.TP.toFixed(1)} dBFS)`)

// ---- --retime: lengthen captions that leave before their voice ends (never into the next caption)
if (argv.includes('--retime')) {   // in film time (r.end / K): the picture, captions included, plays K× slower
  let src = fs.readFileSync(path.join(ROOT, 'demo.json'), 'utf8'), n = 0
  report.forEach((r, k) => {
    if (!r.caption_short) return
    const next = k + 1 < caps.length ? caps[k + 1].t : D.len, d = +Math.min(r.end / K + 0.15 - r.t, next - 0.2 - r.t).toFixed(1)
    const re = new RegExp(`("t": ${String(r.t).replace(".", "\\.")}(?:\\.0)?, "d": )[0-9.]+(?=,)`)
    if (d > r.caption_d && re.test(src)) { src = src.replace(re, `$1${d}`); n++; console.log(`  ${r.id} caption d ${r.caption_d} → ${d}`) }
  })
  if (n) { JSON.parse(src); fs.writeFileSync(path.join(ROOT, "demo.json"), src) }
}

// ---- optional: lay the stem under a picture for review
const mux = opt('--mux')
if (mux) {
  const dst = path.join(path.dirname(path.resolve(ROOT, mux)), path.basename(mux).replace(/\.mp4$/, '') + `-voice${TAG}.mp4`)
  execFileSync('ffmpeg', ['-nostdin', '-y', '-v', 'error', '-i', path.resolve(ROOT, mux), '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', dst])
  console.log(`→ ${path.relative(ROOT, dst)}`)
}
