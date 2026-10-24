#!/usr/bin/env node
// Insert a hold into the scripted demo: every event at or after --at moves later by --add seconds, len grows by --add.
//   node tools/demo-hold.mjs --at 56.9 --add 1.5
// Subject-free (any demo.json whose cmds / camera / spot / captions carry "t"). Edits the text in place, so the
// file's one-event-per-line layout stays; refuses when an event's [t, t + dur] spans --at (the hold would cut a move).
// Use it where the picture is still (no move, no command running) and the voice needs more room.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), file = path.join(ROOT, 'demo.json')
const argv = process.argv.slice(2), opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? +argv[i + 1] : NaN }
const at = opt('--at'), add = opt('--add')
if (!(at >= 0) || !(add > 0)) { console.error('usage: demo-hold.mjs --at <s> --add <s>'); process.exit(1) }

const D = JSON.parse(fs.readFileSync(file, 'utf8'))
const span = ['cmds', 'camera', 'spot'].flatMap((k) => D[k].filter((e) => e.t < at && at < e.t + (e.dur ?? e.ramp?.dur ?? 0)).map((e) => `${k} ${JSON.stringify(e)}`))
if (span.length) { console.error(`--at ${at} falls inside:\n  ${span.join('\n  ')}`); process.exit(1) }

const r = (x) => +x.toFixed(3)
let src = fs.readFileSync(file, 'utf8'), n = 0
src = src.replace(/"t": (-?\d+(?:\.\d+)?)/g, (m, t) => (+t >= at ? (n++, `"t": ${r(+t + add)}`) : m))
src = src.replace(/"len": (\d+(?:\.\d+)?)/, (m, l) => `"len": ${r(+l + add)}`)
JSON.parse(src)
fs.writeFileSync(file, src)
const film = path.join(ROOT, 'film.json')   // the recorder's length (cutaway render.mjs reads film.json len)
if (fs.existsSync(film)) { const f = fs.readFileSync(film, 'utf8'); fs.writeFileSync(film, f.replace(/"len": (\d+(?:\.\d+)?)/, (m, l) => `"len": ${r(+l + add)}`)) }
console.log(`${n} events moved by +${add} s from ${at} s; len ${D.len} → ${r(D.len + add)} s`)
