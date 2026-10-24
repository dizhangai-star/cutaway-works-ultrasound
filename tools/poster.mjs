#!/usr/bin/env node
// Posters / covers from the finished film (subject-free; per subject only poster.json).
//   node tools/poster.mjs [--lang zh,en] [--size 16x9,3x4] [--theme dark]
// Grabs frames from the muxed film at film time × rate (what viewers see, captions cropped off), places the crops on
// the plate's film base with the title in the plate's type, screenshots with headless Chrome.
// → out/poster.<lang>.png (16x9) and out/cover-<size>.<lang>.png (other sizes)
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const LIB = path.join(os.homedir(), '.claude/skills/cutaway/scripts/lib/common.mjs')
const { launch, args } = await import(pathToFileURL(LIB).href)
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const A = args(), P = JSON.parse(fs.readFileSync(path.join(dir, 'poster.json'), 'utf8'))
const langs = A.opt('--lang', 'zh,en').split(','), sizes = A.opt('--size', Object.keys(P.sizes).join(',')).split(',')
const TOK = { // plate tokens (css/plate.css, dark = lightbox film base)
  dark: { base: '#0E141B', ink: '#D8E6EE', dim: '#7F93A3', red: '#D2322D', grid: 'rgba(216,230,238,0.05)' },
  light: { base: '#F7F7F4', ink: '#1B2433', dim: '#5E6B7A', red: '#D2322D', grid: 'rgba(27,36,51,0.06)' },
}[A.opt('--theme', 'dark')]
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'poster-'))

function grab(lang, key) {   // frame at film time t → PNG data URL, cropped
  const video = path.join(dir, P.video.replace('{lang}', lang)), f = path.join(tmp, `${lang}-${key}.png`)
  const [x, y, w, h] = P.crops[key]
  execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-ss', String(P.frames[key] * P.rate), '-i', video,
    '-frames:v', '1', '-vf', `crop=${w}:${h}:${x}:${y}`, f])
  return 'data:image/png;base64,' + fs.readFileSync(f).toString('base64')
}

const html = (S, T, img) => `<!doctype html><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=IBM+Plex+Mono:wght@500&family=Noto+Sans+SC:wght@500;700;900&display=swap" rel="stylesheet">
<style>
  html,body{margin:0;width:${S.w}px;height:${S.h}px;overflow:hidden;background:${TOK.base}}
  body{position:relative;background-image:linear-gradient(${TOK.grid} 1px,transparent 1px),linear-gradient(90deg,${TOK.grid} 1px,transparent 1px);background-size:24px 24px}
  .tube,.film{position:absolute;display:block}
  .tube{left:${S.tube[0]}px;top:${S.tube[1]}px;width:${S.tube[2]}px;
    -webkit-mask-image:linear-gradient(to bottom,transparent 14%,#000 34%),radial-gradient(ellipse 62% 60% at 48% 52%,#000 62%,transparent 100%);
    -webkit-mask-composite:source-in;mask-composite:intersect}
  .film{left:${S.film[0]}px;top:${S.film[1]}px;width:${S.film[2]}px;outline:2px solid ${TOK.ink};outline-offset:6px;
    box-shadow:0 0 80px rgba(216,230,238,0.18)}
  .title{position:absolute;left:${S.title[0]}px;top:${S.title[1]}px;width:${S.title[2]}px;color:${TOK.ink};
    font:900 ${S.title[3]}px/1.12 "Barlow Condensed","Noto Sans SC",sans-serif;letter-spacing:0.01em}
  .title em{font-style:normal;color:${TOK.red}}
  .sub{margin-top:18px;font:500 ${Math.round(S.title[3] * 0.34)}px/1.3 "IBM Plex Mono","Noto Sans SC",monospace;color:${TOK.dim};letter-spacing:0.04em}
  .tag{position:absolute;${S.tag === 'left' ? 'left' : 'right'}:40px;bottom:30px;font:600 ${Math.round(S.title[3] * 0.32)}px "Barlow Condensed","Noto Sans SC",sans-serif;
    color:${TOK.ink};letter-spacing:0.12em;padding:6px 12px;border-left:6px solid ${TOK.red};background:${TOK.base}}
</style>
<img class="tube" src="${img.tube}"><img class="film" src="${img.film}">
<div class="title">${T.title}<div class="sub">${T.sub}</div></div><div class="tag">${T.tag}</div>`

const { browser, page } = await launch({ width: 1920, height: 1080 })
for (const lang of langs) {
  const img = { tube: grab(lang, 'tube'), film: grab(lang, 'film') }
  for (const size of sizes) {
    const S = P.sizes[size]
    await page.setViewport({ width: S.w, height: S.h, deviceScaleFactor: 1 })
    await page.setContent(html(S, P.text[lang], img), { waitUntil: 'load', timeout: 60000 })
    await page.evaluate(() => document.fonts.ready)
    const out = path.join(dir, 'out', size === '16x9' ? `poster.${lang}.png` : `cover-${size}.${lang}.png`)
    fs.writeFileSync(out, await page.screenshot({ type: 'png' }))
    console.log('poster', path.relative(dir, out))
  }
}
await browser.close(); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(0)
