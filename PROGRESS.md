# B超探头 · 活的技术图版 (ultrasound)

> **Now (2026-10-25):** Sprint 0.5 signed + merged (compare `out/review/compare-s0.5.jpg`); the hero's detail (stack legibility, grip, parting line, cable in frame) goes to Sprint 2. **Next: Sprint 1 plate.** Demo: `ultrasound.html?film=1&shot=main`. Tests: `node --test tests/sim.test.mjs`. Subject files still to rewrite: `SUBJECT.md`.

Interactive landscape "technical plate" (1440×900) of **Ultrasound Probe**, one solver driving parts, instruments, live drawings and sound; a scripted demo recorded frame by frame into 1920×1080 60 fps films, zh + en, narrated by local TTS. Method: `~/.claude/skills/plate/references/method.md`.

## Working rules (details: the plate skill)

1. Generic modules stay generic (`template/` from the skill); subject code only in `js/build/`, `sim.js`, `materials.js`, `hero.js`, `effects.js`, `instruments.js`, `main.js`, `audio/score.mjs`. Each sprint adds 1–2 lines to **Skill notes**.
2. One sprint per conversation; stop at the gate.
3. This file ≤ 15 KB; done sprints compressed to 1–3 lines, full text to `PROGRESS-archive.md`.
4. Two themes (tokens), two languages (`strings.*.json`), one `demo.json` rendered twice.
5. Whole frame first: target frame → S0.5 look test → `out/review/compare-s<n>.jpg` every sprint; worse → stop.
6. Use shot: what it is for, computed by the solver; cold open = result, ending = same result.
7. Narration first: script → voice → captions and picture timed to the voice (70–80 % speech).
8. End every film with the channel sign-off.

## Status

- [x] Sprint 0 · Brief 与资料: S1 Lumify-class C5-2, `SOURCES.md`, `BRIEF.md`, B-mode spike, `refs/target.png` = v1b (signed 2026-10-25)
- [x] Sprint 0.5 · 画面打样 (signed 2026-10-25, hero to S2: probe + stepped cut through the lens, computed B-mode film linked by the red scan line, A-line / pulse / TGC / delay instruments, spec block + penetration chart, four live drawings, zh/en × dark/light; tests 8/8)
- [ ] Sprint 1 · 图版铺开
- [ ] Sprint 2 · 模型、材质、剖面
- [ ] Sprint 3 · Solver 与仪表
- [ ] Sprint 4 · 晒图、视图、标注、用途镜头
- [ ] Sprint 5 · 口播稿 → 口播 → 演示录制
- [ ] Sprint 6 · 声音、混音、渲染
- [ ] Sprint 7 · 交付与投放

## Decisions

- 2026-10-24: subject = abdominal curved-array probe, use shot = gallstone with acoustic shadow (series line: CT misses many stones, ultrasound misses the lung nodule). Episode No. 03, before MRI.
- Reference S1 = handheld 5–2 MHz curved array, beamformer in the probe (FOV 67.5°, ROC 50 mm, aperture 60 mm); element count *modelled* 128.
- Imaging solver = line-by-line beam model on point scatterers (S0 spike, 2.2 s / frame Node), computed per parameter change; true DAS optional in S3.

## Open

- S0.5: hook says "6 mm stone", the phantom stone is Ø 13 mm (BRIEF §3): reconcile in S3.
- S0.5: the B-mode white point comes from each image's 99.5th percentile (gain still moves it); S3 fixes it to a constant.

- Element count / pitch / outline need a document (service manual, FCC filing, teardown); else stay *modelled*.
- Tissue table: pick one primary source (Duck / Szabo) in S3.
- Posterior enhancement weak in the spike (≈ 6 dB); tune in S3.

## Notes

## Skill notes

- S0.5: a series episode starts S0.5 from the previous episode's signed S0.5 commit (`git archive <sha>` of ct: html skeleton, plate.css, hook.js), not from the scaffold's xray files; a convex-array lofted housing came out inside-out the first time (check ring winding: all red hatch = back faces).
- S0.5: a layered stack thinner than the hatch period never reads in a section; cut it a step deeper (the lens opens in front of the layer faces) so the layers show face-on, and give the macro view to a drawing.

- S0: a quick feasibility spike for the use shot (one Node file → PNG) before the target frame de-risks the episode; a float-overflow LCG gave fake dotty speckle (use Math.imul).

## Known simplifications
