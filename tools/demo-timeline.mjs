// demo.json from the voiced lines: caption slots = the longer of zh / en + a gap; holds before view changes
import fs from 'node:fs'
const D = JSON.parse(fs.readFileSync('demo.json', 'utf8'))
const v = (l) => Object.fromEntries(JSON.parse(fs.readFileSync(`out/voice/report-${l}.json`, 'utf8')).report.map((r) => [r.id, r.voice]))
const zh = v('zh'), en = v('en')
// per line: view switched at the line (hold = picture time before the voice starts), spot, camera
const beats = {
  c01: { view: 'section', hold: 0.6, cam: { fit: ['#stage'], pad: 0.02 } },
  c02: {},
  c03: { view: 'housing', hold: 2.4, cam: { full: true } },
  c04: {},
  c05: { view: 'cutaway', hold: 1.4, cam: { fit: ['#stage'], pad: 0.03 } },
  c06: {},
  c07: { spot: ['.d-array'] },
  c08: { view: 'beam', hold: 1.4, cam: { full: true }, spot: ['#stage', '.panel.pulse'] },
  c09: { spot: ['#stage', '.panel.delay'] },
  c10: { do: 'freeze', spot: ['#stage', '.panel.aline'] },
  c11: { spot: ['.panel.aline', '#bfilm'] },
  c12: { spot: ['.panel.aline', '#bfilm'] },
  c13: { spot: ['.panel.aline', '#bfilm'] },
  c14: { spot: ['#bfilm', '.panel.aline'] },
  c15: { do: 'scan', click: 'knob', hold: 0.8, spot: 'off', cam: { full: true } },
  c16: { view: 'array', hold: 1.6, cam: { fit: ['#stage'], pad: 0.02 } },
  c17: { spot: ['#stage', '.panel.pen'] },
  c18: { view: 'section', hold: 2.0, spot: 'off', cam: { fit: ['#stage'], pad: 0.02 } },
  c19: {},
  c20: { gap: 0.4 },
  c21: { hold: 0.8, cam: { full: true } },
}
let t = 0, cmds = [{ t: 0, view: 'section' }], camera = [], spot = [{ t: 0, dur: 0, off: true }]
const caps = D.captions.map((c, i) => {
  const id = `c${String(i + 1).padStart(2, '0')}`, b = beats[id] ?? {}, voice = Math.max(zh[id], en[id])
  const at = t
  if (b.view && i > 0) cmds.push({ t: +at.toFixed(2), view: b.view })
  if (b.do) cmds.push({ t: +at.toFixed(2), do: b.do, ...(b.click ? { click: b.click } : {}) })
  if (b.cam) camera.push({ t: +at.toFixed(2), dur: i ? 1.4 : 0, ...b.cam })
  if (b.spot) spot.push(b.spot === 'off' ? { t: +at.toFixed(2), dur: 0.6, off: true } : { t: +at.toFixed(2), dur: 0.6, on: b.spot, a: 0.55 })
  const ct = at + (i ? (b.hold ?? 0) : 0.3)
  t = ct + voice + (b.gap ?? 0.9)
  return { ...c, t: +ct.toFixed(2), d: +(voice + 0.35).toFixed(2) }
})
D.captions = caps; D.cmds = cmds; D.camera = camera; D.spot = spot
D.initial = { view: 'section', t0: -10 }; D.len = +(t + 0.6).toFixed(2)
D.note = 'The scripted demo (S5), timed to the voice: caption slots = the longer of the zh / en takes + 0.9 s, holds before view changes. Film time in seconds. cmds drive the real page (views, freeze / scan, sets); camera / spot / captions are the film\'s own layers (selectors of ultrasound.html).'
fs.writeFileSync('demo.json', JSON.stringify(D, null, 2) + '\n')
const F = JSON.parse(fs.readFileSync('film.json', 'utf8')); F.len = D.len; fs.writeFileSync('film.json', JSON.stringify(F, null, 2) + '\n')   // the recorder's length
const sp = caps.reduce((a, c) => a + Math.max(zh[c.id] ?? 0, 0), 0)
console.log('len', D.len, 'speech zh', Object.values(zh).reduce((a, b) => a + b).toFixed(1), 'en', Object.values(en).reduce((a, b) => a + b).toFixed(1))
for (const c of caps) console.log(c.t.toFixed(2).padStart(7), c.d, c.zh)
