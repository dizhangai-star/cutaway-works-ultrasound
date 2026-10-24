#!/usr/bin/env node
// Compare sheet (rule 6, generic): four frames 2 × 2 at 960 × 600, each labelled; composed in headless Chrome
// (this ffmpeg has no drawtext).
//   node tools/compare.mjs out/review/compare-s0.5.jpg "TARGET" refs/target.png "S0.5 DARK" a.jpg "S0.5 LIGHT" b.jpg "FL3" c.jpg
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { pathToFileURL } from 'node:url'

const { launch } = await import(pathToFileURL(path.join(os.homedir(), '.claude/skills/cutaway/scripts/lib/common.mjs')).href)
const [out, ...rest] = process.argv.slice(2)
const cells = []
for (let i = 0; i + 1 < rest.length; i += 2) {
  const f = path.resolve(rest[i + 1]), ext = path.extname(f).slice(1).replace('jpg', 'jpeg')
  cells.push({ label: rest[i], src: `data:image/${ext};base64,${fs.readFileSync(f).toString('base64')}` })
}
const html = `<body style="margin:0;background:#101418;display:grid;grid-template-columns:960px 960px;gap:0">${cells.map((c) =>
  `<div style="position:relative;width:960px;height:600px;display:flex;align-items:center;justify-content:center;overflow:hidden">
     <img src="${c.src}" style="max-width:960px;max-height:600px">
     <span style="position:absolute;left:12px;top:10px;background:#D2322D;color:#fff;font:700 20px/1 Arial;padding:6px 9px;letter-spacing:.04em">${c.label}</span></div>`).join('')}</body>`
const { browser, page } = await launch({ width: 1920, height: 600 * Math.ceil(cells.length / 2), gl: false })
await page.setContent(html, { waitUntil: 'load' })
fs.writeFileSync(out, await page.screenshot({ type: 'jpeg', quality: 88 }))
await browser.close()
console.log('compare', out)
