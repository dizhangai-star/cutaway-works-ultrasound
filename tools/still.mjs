#!/usr/bin/env node
// Stills of the plate in film mode, any theme × language × size (generic; render.mjs has no theme flag).
//   node tools/still.mjs --t 3 [--theme dark,light] [--lang en,zh] [--w 1440 --h 900] [--tag s0.5] [--q "view=housing"]
//   --js "code": run in the page after load, before the stills (e.g. __film.seek(2.5); __plate.set('kv', 70))
//   phone: --w 390 --h 844 --dpr 2 --full 1   (whole scrolling page: viewport grown to the page height)
// → out/review/<tag>-<theme>-<lang>-<t>.jpg
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import os from 'node:os'

const LIB = path.join(os.homedir(), '.claude/skills/cutaway/scripts/lib/common.mjs')
const { serve, launch, guardedShot, args } = await import(pathToFileURL(LIB).href)
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const A = args(), F = JSON.parse(fs.readFileSync(path.join(dir, 'film.json'), 'utf8'))
const W = Number(A.opt('--w', 1440)), H = Number(A.opt('--h', 900)), tag = A.opt('--tag', 'still'), extra = A.opt('--q', '')
const js = A.opt('--js', ''), dpr = Number(A.opt('--dpr', 1)), full = A.opt('--full', '') === '1'
const times = String(A.opt('--t', '3')).split(',').map(Number)
const srv = await serve(dir)
const { browser, page } = await launch({ width: W, height: H })
if (dpr !== 1) await page.setViewport({ width: W, height: H, deviceScaleFactor: dpr })
fs.mkdirSync(path.join(dir, 'out/review'), { recursive: true })
for (const theme of A.opt('--theme', 'dark').split(',')) for (const lang of A.opt('--lang', 'en').split(',')) {
  await page.goto(`${srv.url}/${F.slug}.html?film=1&theme=${theme}&lang=${lang}${extra ? '&' + extra : ''}`, { waitUntil: 'load', timeout: 120000 })
  await page.waitForFunction(() => window.__film?.ready && window.__film.loaded(), { timeout: 180000, polling: 250 })
  await page.evaluate(() => document.fonts.ready)
  if (full) {
    await page.setViewport({ width: W, height: H, deviceScaleFactor: dpr })
    await new Promise((r) => setTimeout(r, 200))
    const ph = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight))
    await page.setViewport({ width: W, height: ph, deviceScaleFactor: dpr })
    await new Promise((r) => setTimeout(r, 300))
  }
  if (js) await page.evaluate(js)
  for (const t of times) {
    await page.evaluate((x) => { window.__film.seek(x); window.__film.step(0) }, t)
    await new Promise((r) => setTimeout(r, 150))
    const f = path.join(dir, `out/review/${tag}-${theme}-${lang}-${t.toFixed(1)}.jpg`)
    fs.writeFileSync(f, await guardedShot(page, { type: 'jpeg', quality: 92 }))
    console.log('still', path.relative(dir, f))
  }
}
await browser.close(); srv.server.close()
