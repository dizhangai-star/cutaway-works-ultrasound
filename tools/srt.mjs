#!/usr/bin/env node
// Subtitles (subject-free): demo.json captions → out/<slug>.<lang>.srt, film time × --rate (the render's slow-down).
//   node tools/srt.mjs [--lang zh,en] [--rate 1.15]
// Captions are the spoken text (rule 8), so the SRT is also the narration transcript.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d }
const rate = +opt('--rate', 1.15), slug = path.basename(ROOT)
const { captions } = JSON.parse(fs.readFileSync(path.join(ROOT, 'demo.json'), 'utf8'))
const ts = (s) => { const ms = Math.round(s * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}` }
for (const lang of opt('--lang', 'zh,en').split(',')) {
  const cues = captions.filter((c) => c[lang]).map((c) => [c.t * rate, (c.t + c.d) * rate, c[lang]])
  const out = path.join(ROOT, 'out', `${slug}.${lang}.srt`)
  fs.writeFileSync(out, cues.map(([a, b, text], i) => `${i + 1}\n${ts(a)} --> ${ts(b)}\n${text}\n`).join('\n'))
  console.log(`${cues.length} subtitles → ${path.relative(ROOT, out)}  (×${rate}, last ends ${ts(cues.at(-1)[1])})`)
}
