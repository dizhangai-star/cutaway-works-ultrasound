# B超探头 · 活的技术图版 (ultrasound)

> **Now (2026-10-25):** Sprint 0.5 signed + merged (compare `out/review/compare-s0.5.jpg`); the hero's detail (stack legibility, grip, parting line, cable in frame) goes to Sprint 2. Sprint 1 signed + merged (PR #2, compare `out/review/compare-s1.jpg`). Sprint 2a signed + merged (gate `out/review/s2a-tt-housing.jpg`, `s2a-tt-cutaway.jpg`, `s2a-{dark,light}-zh-3.0.jpg`). Sprint 2b signed + merged (PR #4, compare `out/review/compare-s2.jpg`). Sprint 3 solver built on `s3-solver` (still `out/review/s3-dark-en-3.0.jpg`), **waiting for sign-off**. Demo: `ultrasound.html?film=1&shot=main`. Tests: `node --test tests/sim.test.mjs`. Subject files still to rewrite: `SUBJECT.md`.

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
- [x] Sprint 1 · 图版铺开 (`s1-plate`, signed + merged 2026-10-25, PR #2): all §5 controls (focus 2–15 cm into the beam model + delay chart + focus mark on the film, dynamic range 40–80 dB, 9 MHz linear toggle, TGC ×4 draggable faders), views relabelled to §9 (overview / stack / pulse / freq. / use), keys T L M R, reset = parameters + camera, phone stage taller with the film full width; tests 9/9
- [x] Sprint 2 · 模型、材质、剖面 (split 2a / 2b as ct)
  - [x] 2a · 部件与审计 (`s2a-model`, signed + merged 2026-10-25): audit ported (ground = acoustic lens; the clear phantom block is not audited); baseline 19 parts, 5 overlaps (PZT × backing bevel, lens corners through the nose wall, flex, strain relief), 2 floating; now **35 named parts / 44 meshes, 0 open, 0 overlaps, 0 floating at h 0.3 mm**. New: nose cone + front / back shells parted at z = 0 (`shellGeometry`), grip inserts ×2 (cut with the housing), blank label, seal ring, array frame cheeks ×2, epoxy fill, flex clamp, PCB screws ×4 on back-shell bosses, thermal pad, cable gland, hollow strain relief, capped cable, shield braid, cable conductors; lens ends rounded in plan to sit inside the nose
  - [x] 2b · 材质、光、取景 (`s2b-look`, signed + merged 2026-10-25, PR #4; audit still zero, tests 9/9): views re-framed (cutaway: nose above the film; array: stack face-on, kerfs + both matching layers read; housing: zoomed out, whole probe + cable); rim 1.8 → 1.0, key 2.1, inner work light 0.16; housing cooler, env 0.6, no sheen; PCB darker; lens grey-blue; lens / matching callouts moved to the cut side; cable re-routed to bend sideways after the strain relief (*modelled*)
- [ ] Sprint 3 · Solver 与仪表 (`s3-solver`, gate pending): white point frozen (`REF` 18.8, gain moves the picture: +6 dB = +6.0 dB tested); bile α 0.2 → 0.05 (bile ≈ water), posterior enhancement 4.4 → 7.0 dB; shadow width 16.5 mm at 10.5 cm = stone Ø 13 × sector divergence (tested); hook reconciled to 13 mm; readings 91 µs / 7.0 cm / 0.44 mm / 38 fps / 17 cm; tests 10/10; DAS not done (beam model stays)
- [ ] Sprint 4 · 晒图、视图、标注、用途镜头
- [ ] Sprint 5 · 口播稿 → 口播 → 演示录制
- [ ] Sprint 6 · 声音、混音、渲染
- [ ] Sprint 7 · 交付与投放

## Decisions

- 2026-10-24: subject = abdominal curved-array probe, use shot = gallstone with acoustic shadow (series line: CT misses many stones, ultrasound misses the lung nodule). Episode No. 03, before MRI.
- Reference S1 = handheld 5–2 MHz curved array, beamformer in the probe (FOV 67.5°, ROC 50 mm, aperture 60 mm); element count *modelled* 128.
- 2026-10-25: the B-mode film stays on the plate in every view (it is the probe's read-out); S4 makes view 5 「用途」 the reveal (push in on the film, stone + shadow called out, the phantom explained); the film hides or shows it per demo.json.
- Imaging solver = line-by-line beam model on point scatterers (S0 spike, 2.2 s / frame Node), computed per parameter change; true DAS optional in S3.

## Open

- S2a: phantom organs (liver, gallbladder, stone, kidney) not modelled: the slice reaches 14 cm, the bench block is 46 mm deep; decide in S4 (use shot).
- 2026-10-25 (user, S2b): probe stays upright; the cable shows only in the zoomed-out housing view.
- S2b: housing keeps a faint cream cast under the warm key (NeutralToneMapping).


- Element count / pitch / outline need a document (service manual, FCC filing, teardown); else stay *modelled*.
- Tissue table (α / Z) still *modelled* from S2 ranges: no primary table checked page by page yet (Duck 1990 / Szabo App. B); do before S5 narration quotes any tissue number.

## Notes

## Skill notes

- S3: freeze the log-compression white point to a constant measured once from the default image; a per-image percentile cancels the gain control. Test geometric claims (shadow width × sector divergence) against the solver, not by eye.

- S2b: with the B-mode film fixed on the lower stage, only ≈ 290 px of stage remain for the hero; a vertical subject cannot show the head and the cable at one scale, so each view carries its own zoom / cy (head views tight, one zoomed-out view for the whole object).

- S2a: a housing piece as one closed solid from rings × angle range × two insets (`shellGeometry`, faces oriented by known outward directions) gives shells, nose cone, grip and label from one function; candidate for the template. A transparent ground part is skipped by the audit: ground on a solid part.

- S1: `bindFader` (vertical fader) added to the film's `controls.js`; candidate for the skill's template (needs OK).

- S0.5: a series episode starts S0.5 from the previous episode's signed S0.5 commit (`git archive <sha>` of ct: html skeleton, plate.css, hook.js), not from the scaffold's xray files; a convex-array lofted housing came out inside-out the first time (check ring winding: all red hatch = back faces).
- S0.5: a layered stack thinner than the hatch period never reads in a section; cut it a step deeper (the lens opens in front of the layer faces) so the layers show face-on, and give the macro view to a drawing.

- S0: a quick feasibility spike for the use shot (one Node file → PNG) before the target frame de-risks the episode; a float-overflow LCG gave fake dotty speckle (use Math.imul).

## Known simplifications

- 9 MHz toggle images a linear probe's frequency on this curved sector (no rectangular linear geometry).
