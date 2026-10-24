#!/usr/bin/env node
// Turntable stills of the hero alone (generic: needs window.__plate.orbit / view and a #stage element).
//   node tools/turntable.mjs [--views housing,cutaway] [--az -40,0,40,140] [--el 0] [--zoom 1] [--theme dark] [--t 3] [--dpr 2] [--tag s2]
// → out/review/<tag>-tt-<view>-<theme>-az<az>.jpg (stage rect only), and the list on stdout for tools/compare.mjs
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const { serve, launch, args } = await import(pathToFileURL(path.join(os.homedir(), '.claude/skills/cutaway/scripts/lib/common.mjs')).href)
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const A = args(), F = JSON.parse(fs.readFileSync(path.join(dir, 'film.json'), 'utf8'))
const views = A.opt('--views', 'housing,cutaway').split(','), azs = String(A.opt('--az', '0')).split(',').map(Number)
const el = Number(A.opt('--el', 0)), zoom = Number(A.opt('--zoom', 1)), tag = A.opt('--tag', 'tt'), dpr = Number(A.opt('--dpr', 2)), t = Number(A.opt('--t', 3))
const srv = await serve(dir)
const { browser, page } = await launch({ width: 1440, height: 900 })
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: dpr })
page.on('pageerror', (e) => console.error('page:', e.message))
fs.mkdirSync(path.join(dir, 'out/review'), { recursive: true })
for (const theme of A.opt('--theme', 'dark').split(',')) {
  await page.goto(`${srv.url}/${F.slug}.html?film=1&theme=${theme}&lang=en`, { waitUntil: 'load', timeout: 120000 })
  await page.waitForFunction(() => window.__film?.ready && window.__film.loaded(), { timeout: 180000, polling: 250 })
  for (const v of views) for (const az of azs) {
    // film mode adds a drift of -2° + 0.8°/s; cancel it so az is the offset from the view preset
    await page.evaluate(({ v, az, el, zoom, t }) => {
      window.__plate.view(v); window.__plate.orbit({ az: az + 2 - t * 0.8, el, zoom: zoom / (1 + t * 0.006) })
      window.__film.seek(t); window.__film.step(0)
    }, { v, az, el, zoom, t })
    await new Promise((r) => setTimeout(r, 200))
    const r = await page.evaluate(() => { const b = document.getElementById('stage').getBoundingClientRect(); return { x: b.left, y: b.top, width: b.width, height: b.height } })
    const f = path.join(dir, `out/review/${tag}-tt-${v}-${theme}-az${az}.jpg`)
    fs.writeFileSync(f, await page.screenshot({ type: 'jpeg', quality: 92, clip: r }))
    console.log(path.relative(dir, f))
  }
}
await browser.close(); process.exit(0)
