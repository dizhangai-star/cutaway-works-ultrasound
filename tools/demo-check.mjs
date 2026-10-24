#!/usr/bin/env node
// Replays demo.json through the solver (no browser): beam intervals, interlocks, rotor stops, anode heat, and the
// captions' reading time. Run after every timeline change.   node tools/demo-check.mjs [--every 1]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSim, ANODE } from '../js/sim.js'
import { plan } from '../js/demo-plan.js'

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const D = JSON.parse(fs.readFileSync(path.join(dir, 'demo.json'), 'utf8'))
const pl = plan(D)
const sim = createSim({ kv: 120, ma: 100, ms: 4000, focus: 'auto' })
const dt = 1 / 120
let i = 0, beam = null
const out = []
for (let t = 0; t <= pl.len + 1e-9; t += dt) {
  while (i < pl.sim.length && pl.sim[i].t <= t + 1e-9) { const c = pl.sim[i++]; c.k === 'set' ? sim.set(c.p, c.v) : sim[c.k]() }
  const r = sim.step(dt)
  if (r.on && !beam) beam = { t0: t, kv0: r.kv }
  if (!r.on && beam) { out.push(`beam ${beam.t0.toFixed(2)}–${t.toFixed(2)} s  ${beam.kv0}→${r.kv} kV`); beam = null }
}
for (const e of sim.events) if (!['expose-end'].includes(e.type)) out.push(`${e.t.toFixed(2)}  ${e.type}${e.reason ? ' ' + e.reason : ''}${e.rpm ? ' ' + Math.round(e.rpm) : ''}`)
const sorted = out.sort((a, b) => parseFloat(a.replace(/^beam /, '')) - parseFloat(b.replace(/^beam /, '')))
console.log(sorted.join('\n'))
// heat at a few moments
const s2 = createSim({ kv: 120, ma: 100, ms: 4000, focus: 'auto' }); i = 0
const marks = new Set([20, 31, 42, 47, 52, 56, 62, 66, 73, 80])
for (let t = 0, k = 0; t <= pl.len; t += dt, k++) {
  while (i < pl.sim.length && pl.sim[i].t <= t + 1e-9) { const c = pl.sim[i++]; c.k === 'set' ? s2.set(c.p, c.v) : s2[c.k]() }
  const r = s2.step(dt)
  if (k % 120 === 0 && marks.has(Math.round(t))) console.log(`t ${Math.round(t)}  anode ${(r.heat * 100).toFixed(0)} %  rpm ${Math.round(r.rpm)}  phase ${r.phase}  track ${Math.round(r.trackT ?? 0)} °C`)
}
// captions: reading time (zh ≈ 5 chars/s, en ≈ 20 chars/s = the subtitle norm for captions read with the voice, + 0.6 s), gaps, overlaps
const zc = (s) => (s.match(/[一-鿿]/g) || []).length + (s.match(/[0-9]+(?:[. ][0-9]+)*/g) || []).length * 1.5 + (s.match(/[A-Za-z]+/g) || []).length
let prev = null
for (const c of pl.captions) {
  const need = Math.max(1.8, zc(c.zh) / 5 + 0.6, c.en.length / 20 + 0.6)
  const flag = [c.d + 0.05 < need ? `SHORT need ${need.toFixed(1)}` : '', prev && c.t < prev.t + prev.d + 0.2 - 1e-6 ? 'OVERLAP' : ''].filter(Boolean).join(' ')
  if (flag) console.log(`caption ${c.t}: ${flag}  ${c.zh}`)
  prev = c
}
console.log(`len ${pl.len} s, ${pl.captions.length} captions, ${pl.sim.length} solver commands`)
