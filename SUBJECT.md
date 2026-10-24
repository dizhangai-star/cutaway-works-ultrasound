# SUBJECT · files to rewrite for ultrasound

Copied from `~/dev/workspace/claude/videos/cutaway-works/xray` (xray) as a working start. Rewrite each; delete this file when none is left.

- [x] `js/main.js`: boot, clock, __film / __plate, views, wiring of every module (keep the structure, swap the subject)
- [x] `js/sim.js`: the solver: createSim() + command log, public ratings as calibration targets
- [x] `js/materials.js`: the PBR palette; imports hook() / setCut() from the generic js/hook.js (a reference film without js/hook.js carries its own copy of the hook: delete it, import instead)
- [x] `js/build/probe.js` (new: S0.5 rough probe)
- [ ] `js/build/parts.js`: part list, explode groups, balloons
- [x] `js/render/hero.js`: hero camera + VIEWS (timed moves)
- [x] `js/render/effects.js`: the invisible thing made visible (beam, flow, field…)
- [x] `js/ui/instruments.js`: gauges and datasheet charts driven by the solver
- [ ] `audio/score.mjs`: harmony per section + machine sounds from the solver replay
- [ ] `tools/demo-check.mjs`: replays demo.json through the solver without a browser
- [x] `tests/sim.test.mjs`: solver against the datasheet numbers
- [x] `strings.zh.json`: every visible string (zh)
- [x] `strings.en.json`: every visible string (en)
- [ ] `demo.json`: the scripted demo: cmds, camera, spot, captions (spoken text)
- [ ] `js/build/phantom.js`: subject geometry (reference film; replace)
- [ ] `js/build/tube.js`: subject geometry (reference film; replace)
- [x] `ultrasound.html`: page skeleton: title, meta, panels
