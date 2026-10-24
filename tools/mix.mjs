#!/usr/bin/env node
// Final mix (subject-free): score stems + voice stem → voice-keyed ducking → one loudness gain → limiter → mux.
//   node tools/mix.mjs --lang zh [--voice out/voice/voice.zh.x1.15.wav] [--video out/xray.zh.video.mp4] [--lufs -14]
// Stems: audio/build/{bed,mid,mac,ui}.wav (48 kHz stereo float, unscaled, from audio/score.mjs). Each stem is first
// set to its own loudness (LEVEL, LUFS, measured alone), so the balance does not depend on the score's raw scale;
// then ducked by the voice's envelope (DUCK dB at full voice), summed with the voice, given one gain to --lufs and
// limited (true peak checked ≤ −1 dBTP). → out/<slug>.<lang>.wav (+ .mp4 with --video)
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d }
const lang = opt('--lang', 'zh'), slug = path.basename(ROOT), TARGET = +opt('--lufs', -14), SR = 48000
const VOICE = path.resolve(ROOT, opt('--voice', `out/voice/voice.${lang}.x1.15.wav`))
const VIDEO = opt('--video') && path.resolve(ROOT, opt('--video'))
const LEVEL = { bed: -33, mid: -30, mac: -31, ui: -34 }   // each stem alone, LUFS, before ducking (voice stem is −16)
const DUCK = { bed: -4, mid: -11, mac: -3, ui: 0 }        // dB at full voice

const loud = (f) => { const log = spawnSync('ffmpeg', ['-nostdin', '-i', f, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' }).stderr
  const last = (re) => +log.match(re).slice(-1)[0].match(/-?[\d.]+/)[0]; return { I: last(/I:\s+-?[\d.]+ LUFS/g), TP: last(/Peak:\s+-?[\d.]+ dBFS/g) } }
function read(f) {   // any WAV → stereo float via ffmpeg
  const raw = execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-i', f, '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-'], { maxBuffer: 1 << 30 })
  const x = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4), n = x.length / 2, L = new Float32Array(n), R = new Float32Array(n)
  for (let i = 0; i < n; i++) { L[i] = x[2 * i]; R[i] = x[2 * i + 1] } return [L, R]
}
function write(f, [L, R]) {
  const n = L.length, b = Buffer.alloc(n * 8); for (let i = 0; i < n; i++) { b.writeFloatLE(L[i], i * 8); b.writeFloatLE(R[i], i * 8 + 4) }
  const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + b.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(2, 22)
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 8, 28); h.writeUInt16LE(8, 32); h.writeUInt16LE(32, 34); h.write('data', 36); h.writeUInt32LE(b.length, 40)
  fs.writeFileSync(f, Buffer.concat([h, b]))
}

const voice = read(VOICE), n = voice[0].length
// voice envelope → 0..1 duck amount: RMS over 30 ms, attack 40 ms, release 600 ms, knee −42…−24 dBFS
const env = new Float32Array(n)
{
  let ms = 0, e = 0; const a = Math.exp(-1 / (0.03 * SR)), up = 1 - Math.exp(-1 / (0.04 * SR)), dn = 1 - Math.exp(-1 / (0.6 * SR))
  for (let i = 0; i < n; i++) {
    ms = a * ms + (1 - a) * voice[0][i] ** 2
    const db = 10 * Math.log10(ms + 1e-12), k = Math.min(1, Math.max(0, (db + 42) / 18))
    e += (k - e) * (k > e ? up : dn); env[i] = e
  }
}
const mix = [new Float32Array(n), new Float32Array(n)]
for (let i = 0; i < n; i++) { mix[0][i] = voice[0][i]; mix[1][i] = voice[1][i] }
const tmp = path.join(ROOT, 'out/voice', `.stem-${lang}.wav`), report = {}
for (const k of Object.keys(LEVEL)) {
  const f = path.join(ROOT, 'audio/build', `${k}.wav`), I = loud(f).I, g = 10 ** ((LEVEL[k] - I) / 20), s = read(f)
  report[k] = { raw: +I.toFixed(1), gain_db: +(LEVEL[k] - I).toFixed(1) }
  for (let i = 0; i < Math.min(n, s[0].length); i++) { const d = g * 10 ** (DUCK[k] * env[i] / 20); mix[0][i] += s[0][i] * d; mix[1][i] += s[1][i] * d }
}
write(tmp, mix)
const L0 = loud(tmp), out = path.join(ROOT, 'out', `${slug}.${lang}.wav`)
execFileSync('ffmpeg', ['-nostdin', '-y', '-v', 'error', '-i', tmp, '-af', `volume=${(TARGET - L0.I).toFixed(2)}dB,alimiter=limit=${10 ** (-1.5 / 20)}:attack=1:release=50:level=false`, '-ar', String(SR), '-c:a', 'pcm_s24le', out])
fs.rmSync(tmp)
const L1 = loud(out)
console.log(`stems ${JSON.stringify(report)}\nmix ${L0.I.toFixed(1)} LUFS → ${path.relative(ROOT, out)}  ${L1.I.toFixed(1)} LUFS, true peak ${L1.TP.toFixed(1)} dBTP`)
if (L1.TP > -1) console.error('true peak above −1 dBTP: lower the limiter')
if (VIDEO) {
  const mp4 = path.join(ROOT, 'out', `${slug}.${lang}.mp4`)
  execFileSync('ffmpeg', ['-nostdin', '-y', '-v', 'error', '-i', VIDEO, '-i', out, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', mp4])
  console.log(`→ ${path.relative(ROOT, mp4)}`)
}
