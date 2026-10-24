#!/usr/bin/env node
// Assembly audit (generic runner for tools/audit.html): named parts, open meshes under the cut, overlaps, floating parts.
//   node tools/audit.mjs [--min 30] [--h 0.001] [--json]
// Exit 1 when a rule fails.
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const { serve, launch, args } = await import(pathToFileURL(path.join(os.homedir(), '.claude/skills/cutaway/scripts/lib/common.mjs')).href)
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const A = args(), min = Number(A.opt('--min', 30))
const srv = await serve(dir)
const { browser, page } = await launch({ width: 400, height: 300, gl: false })
page.on('pageerror', (e) => console.error('page:', e.message))
const t0 = Date.now()
await page.goto(`${srv.url}/tools/audit.html?h=${A.opt('--h', 0.001)}`, { waitUntil: 'load', timeout: 0 })    // the audit runs during load
const R = await page.waitForFunction(() => window.__audit, { timeout: 600000, polling: 500 }).then((x) => x.jsonValue())
await browser.close(); srv.close?.()

if (A.has?.('--json') || process.argv.includes('--json')) { console.log(JSON.stringify(R, null, 1)); process.exit(0) }
const ok = { named: R.named >= min, open: !R.openCut.length, overlap: !R.overlaps.length, float: !R.floating.length }
console.log(`audit  ${((Date.now() - t0) / 1000).toFixed(1)} s  ·  ${R.meshes} meshes  ·  ${R.parts} parts  ·  ${R.named} named (min ${min})  ${ok.named ? 'ok' : 'FAIL'}`)
console.log(`open meshes under the cut: ${R.openCut.length}`); for (const o of R.openCut) console.log(`  ${o.name}  open ${o.open}  non-manifold ${o.nonman}`)
console.log(`overlaps: ${R.overlaps.length}`); for (const o of R.overlaps) console.log(`  ${o.a}  ×  ${o.b}   ${o.mm3} mm³  (${o.pct} % of the smaller)  at ${o.where.join('; ')}`)
if (R.thin.length) console.log(`thinner than the grid (contact by bounding box): ${R.thin.join(', ')}`)
console.log(`floating groups: ${R.floating.length}`); for (const c of R.floating) console.log(`  [${c.join(', ')}]  ${c.slice(0, 2).map((n) => `${n} mm ${JSON.stringify(R.bbox[n])}`).join('  ')}`)
process.exit(Object.values(ok).every(Boolean) ? 0 : 1)
