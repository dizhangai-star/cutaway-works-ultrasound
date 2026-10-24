#!/usr/bin/env node
// Jump check (generic): finds frames where the picture changes at once (a view switch that steps instead of
// easing), prints them and writes a sheet (one row per jump, 4 frames across ±0.15 s). Run on the 480p review film.
//   node tools/jumps.mjs out/preview/ct-zh-480.video.mp4 [out/review/jumps.jpg] [--thr 0.08]
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const args = process.argv.slice(2)
const ti = args.indexOf('--thr'), thr = ti >= 0 ? +args.splice(ti, 2)[1] : 0.08
const [film, out = 'out/review/jumps.jpg'] = args
if (!film) { console.error('usage: jumps.mjs <film.mp4> [sheet.jpg] [--thr 0.08]'); process.exit(1) }

// scene score on a small copy (≈ 214 px wide): the mean frame difference, 0 = same, 1 = a hard cut
const log = execFileSync('ffmpeg', ['-v', 'error', '-i', film, '-vf', `scale=214:-2,select='gt(scene,${thr})',metadata=print:file=-`, '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 })
const hits = [], lines = log.split('\n')
for (let i = 0; i < lines.length; i++) {
  const t = lines[i].match(/pts_time:([\d.]+)/), s = lines[i + 1]?.match(/scene_score=([\d.]+)/)
  if (t && s) hits.push({ t: +t[1], s: +s[1] })
}
// one jump = one switch: merge hits closer than 0.2 s, keep the biggest
const jumps = []
for (const h of hits) { const j = jumps.at(-1); if (j && h.t - j.t < 0.2) { if (h.s > j.s) Object.assign(j, h) } else jumps.push({ ...h }) }
for (const j of jumps) console.log(`${j.t.toFixed(2).padStart(7)} s  ${j.s.toFixed(3)}  ${'█'.repeat(Math.round(j.s * 40))}`)
console.log(`${jumps.length} jump(s) over ${thr}`)
if (!jumps.length) process.exit(0)

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jumps-'))
const rows = jumps.map((j, i) => {
  const f = path.join(tmp, `r${i}.jpg`)
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(Math.max(0, j.t - 0.15)), '-i', film, '-vf', "select='lte(n\\,9)*not(mod(n\\,3))',scale=320:-2,tile=4x1", '-frames:v', '1', '-update', '1', f])
  return f
})
fs.mkdirSync(path.dirname(out), { recursive: true })
execFileSync('ffmpeg', ['-v', 'error', '-y', ...rows.flatMap((f) => ['-i', f]), '-filter_complex', rows.length > 1 ? `vstack=${rows.length}` : 'null', out])
fs.rmSync(tmp, { recursive: true })
console.log('sheet', out)
