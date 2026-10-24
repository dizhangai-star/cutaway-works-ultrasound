# Narration (口播) — tools and lessons

Subject-free: `voice.mjs` needs only `demo.json` (`len`, `captions: [{ t, d, zh, en, say?, seed? }]`). Built and learned
in xray Sprint 6a (2026-10-21); meant to move into the cutaway skill as `references/narration.md` + `scripts/voice.mjs`.

## Tools

| file | does |
|---|---|
| `tools/tts_qwen.py` | job JSON in → one 48 kHz mono PCM16 WAV per line, cached by (model, speaker, language, instruct, text, seed, temperature, reference, decode fix). Speaker mode (CustomVoice) or clone mode (Base + reference take). Reports `seconds`, median `f0` (YIN), `tail_db` (last 10 ms) per take. Patches mlx_audio's decode length (see lesson 6). |
| `tools/voice.mjs` | captions → spoken text → 5 takes per line → pick → trim / squeeze / fit → voice stem on the film timeline → loudness chain → `out/voice/voice.<lang>.wav` + `report-<lang>.json`. |
| `tools/demo-hold.mjs` | insert a hold: every event at/after `--at` moves `--add` s later, `len` grows (demo.json + film.json); refuses inside a move. |

```sh
node tools/voice.mjs --lang zh --lines                      # spoken text only (check before voicing)
node tools/voice.mjs --lang zh --retime --mux out/preview/xray-zh-preview.mp4
#   --retime          lengthen captions that end before their voice (never closer than 0.2 s to the next)
#   --draft           write the stem even with failed lines (laid in whole, overlapping) to hear them
#   --speaker         preset speaker instead of the clone reference (outputs get .speaker)
#   --clone <wav>     another reference take (transcript in <wav>.txt, or --clone-text)
#   --stretch k       picture k× slower: lines placed at t × k (outputs get .x<k>)
node tools/demo-hold.mjs --at 56.9 --add 1.5                # room for a long line where the picture is still
```

Python: `~/dev/tools/qwen-local/.venv/bin/python` (`QWEN_HOME`, `QWEN_PYTHON` override). Models (HF cache):
`mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-4bit` (speaker mode), `…-1.7B-Base-4bit` (clone mode, 2.34 GB).
Cost on the Mac: 18 lines × 5 takes ≈ 1–2 min (speaker), ≈ 3.5 min (clone); cached re-runs ≈ 20 s.

Per line in `demo.json`: `zh` / `en` = the caption (written form: `9 700`, `3 422 °C`, `1%`); `say: { zh }` = what is
spoken when the automatic conversion is not enough; `seed: { zh }` pins one speaker-mode take (ignored in clone mode).
Per language in `voice.mjs` `VOICES` (or `demo.json` `voice.<lang>`): `speaker`, `f0` (the speaker's median pitch),
`temperature`, `instruct`, `clone` (reference wav, transcript beside it as .txt).

## Pipeline (what voice.mjs does)

1. **Spoken text** = caption minus (parenthesised terms) and quotes; `9 700` → `9700`; zh `1%` → 百分之一, `°C` → 摄氏度; en `kV` → kilovolts. `say` wins.
2. **Takes**: 5 seeds per line at temperature 0.6 (a second round of 5 if none passes).
3. **Guards** per take: rate (zh ≥ 2.8 chars/s, en ≥ 1.6 words/s, else it looped), pitch (median F0 within ½ octave of the speaker's, else another timbre), tail (last 10 ms ≤ −35 dBFS, else the last word is cut), fit (≤ slot × 1.12).
4. **Pick the most typical** passing take: nearest the speaker's pitch and the line's median rate — never "the first that passes" (that kept the extreme takes).
5. Trim silence (−45 dBFS), drop a lead-in blip, squeeze inner pauses to 0.3 s, atempo ≤ 1.12 into the slot (caption start + 0.05 s → next caption − 0.12 s).
6. Chain: high-pass 70 Hz, 3:1 compression, one static gain to −16 LUFS (mono; = −13 LUFS read as dual-mono stereo, which earshot reports), limiter −2 dBFS.

## Lessons (xray S6a, with the numbers that settled them)

1. **Narration first.** Voicing captions that were timed for reading left speech at 88 % of the film, 9 of 17 gaps < 0.4 s: rushed. Target 70–80 % speech, 0.6–1 s between sentences, ≈ 3.5–4 zh chars/s. Next narrated film: write the spoken script, voice it, then time captions and picture to the voice. For a finished picture: `demo-hold` where the picture is still, or a uniform slow-down (xray: ×1.15 → 110 s, 77 %, median gap 1.12 s) rendered with film-time steps of 1 / (fps × k).
2. **Captions follow the voice**, rewritten as spoken language; the user heard every rewrite as "much more natural". Spoken-Chinese rules that fixed real lines: no colons, semicolons or parentheses (剖开： → 剖开来看，); keep the subject (撞上钨… → 电子撞上钨…); add connectives (就 / 也 / 反而 / 一旦 / 但是); no personified verbs that make the TTS act (机器拒绝曝光 came out angry in 5 of 5 takes → 机器就不让曝光了); no slogan phrasing (快到半个光速 came out child-like → 速度能达到光速的一半); no 、-lists (the model loops: one list line ran 5.8–16 s by seed → split it: 外面是…里面是…); very short lines and questions drift (怎么拍的？ came out in a male timbre). Big numbers may be written as characters in `say` (九千七百转).
3. **Sampling variance dominates.** Same line, 5 seeds: pitch over ½ octave, rate × 2 (e.g. 195–372 Hz, 2.0–6.0 chars/s). Temperature 0.6 narrows some lines (c10 sd 40 → 12 Hz) but not all; 0.3 can stall (1.4 chars/s). So: temperature 0.6 + 5 takes + most-typical pick.
4. **Clone mode unifies the film.** Lines voiced one by one with a preset speaker each re-act the tone (line-to-line pitch sd 0.99 semitones); continuing one reference take (Qwen3-TTS Base, ICL) gives 0.39. The reference needs its exact transcript, a calm explainer delivery, and **≥ 0.6 s of trailing silence**: our reference stopped 0.01 s after its last syllable (…工作的), and that syllable leaked into the start of every line (27 / 101 takes, the user heard "的"); padded: 0 / 91. Base takes no `instruct`: the reference sets the style.
5. **Speaker choice.** Uncle_Fu (male, 4-bit) was far less stable than Serena: 39 / 90 takes ran > 1.5× long (sighs, "shouting"), line pitch spread 10.6 vs 3.4 semitones. Dylan / Eric carry Beijing / Sichuan accents. Lower pitch does not make a voice steadier; the per-speaker training does. The YIN pitch guard is unreliable on male voices (octave errors): judge male takes by length + earshot.
6. **mlx_audio decode bug (swallowed last words).** `speech_tokenizer.decode()` reports the valid length as the count of frames whose first code is > 0 and the generate paths cut to it. 0 is a valid code, so each such frame cuts 80 ms off the END; our reference had 2 → 0.16 s off every clone line, and 6 / 174 speaker takes were cut too. `tts_qwen.py` `patch_decode()` returns the true length (one sequence per decode); cache keys carry `DECODE` so stale takes are re-voiced. Check a new TTS by the level of each take's last 10 ms.
7. **Measure, then let the user listen.** Pitch, rate, length, tail level and earshot (`realness` 0.88, `describe`) catch drift, loops, cuts and leaks; tone ("angry", "rushed", "dialect") needs the user's ears. Listening packs that work: one file per question, A / B / C in a fixed order with a timestamp table; raw-then-processed pairs for our own processing. No ASR is installed; a local Whisper (≈ 1.6 GB, ask first) would catch repeated or dropped words automatically.
8. **Small traps.** A `--retime` regex replaced the `4` of `"d": 4.0` → `5.2.0` (invalid JSON, committed): edit numbers with a whole-number pattern and `JSON.parse` before writing. Caption gap checks need a float tolerance (38 + 5.8 + 0.2 > 44). A seed pinned for one model means nothing in another.

## English (xray S6b)

- Reference: 8 preset Aiden takes of one neutral sentence ("Hello, this is a voice made right here on this computer. Today, we take a look at how a machine works on the inside."), A–G pack, the user picks one, trim + pad 0.8 s → `VOICES.en.clone`. Clone mode then passed 90 / 90 takes (pitch 128–142 Hz): English is far steadier than zh.
- Spoken English: same rules as zh (no colons / parentheses / bare lists), numbers in `say` as words (nine thousand seven hundred, sixty-nine point five kilovolts); captions keep digits. Reading check 20 chars/s.
- Slowed films: `--stretch k` places lines at t × k; `--retime` and the caption check work in film time (end / k).

## Channel sign-off

Last line of every film (cutaway skill rule): 剖面影像工坊，让看不见的原理被看见。/ Cutaway Works. Making the invisible visible. ≈ 4.2 s zh / 2.9 s en + ≈ 1 s tail on its own end hold (`demo-hold --at <len>`). A very short closing question (你看懂了吗？, 0.83 s) sounded rushed.

## Next

- Move into the cutaway skill as `references/narration.md` + `scripts/voice.mjs` (Sprint 6, with the user's OK).
