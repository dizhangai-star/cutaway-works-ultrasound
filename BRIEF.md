# BRIEF · Ultrasound Probe · a live technical plate (No. 03)

The spec every sprint builds from. Numbers: [SOURCES.md](SOURCES.md) or the *modelled* list (§3). Target frame: `refs/target.png`. Series look and furniture: `../ct/BRIEF.md` §4–5 (art direction B, dark default).

## 0. Topic quick check

- **Hook**: 「一颗 13 毫米的石头，让下面整片变黑。」 / "A 13 mm stone, and everything under it goes black."
- **Money shot**: the B-mode sector beside the cut-open probe. A beam line runs from one active aperture down through liver and gallbladder, ends at the stone, and the shadow column sits under it. The readout reads round-trip time 91 µs → 7.0 cm (*t* = 2*d*/*c*, *c* = 1540 m/s).
- **Use shot**: abdominal B-mode image of the shared series phantom (liver, gallbladder with bile, a Ø 13 mm stone, right kidney), computed from point scatterers by the solver: speckle, an anechoic gallbladder, a bright stone surface, an acoustic shadow, posterior enhancement. Feasibility shown in S0 (`out/review/spike-bmode.png`, §7).
- **Three public hard numbers**: field of view **67.5°**, radius of curvature **50 mm**, bandwidth **5–2 MHz** (S1); plus the 1540 m/s convention (S2).
- **Reference object**: handheld 5–2 MHz curved array with the beamformer inside (S1). One public spec block, no outline drawing → outline and internals *modelled* from aperture and ROC.
- **Series line**: CT could not catch this stone (many stones look like bile on CT), and ultrasound cannot see the lung nodule from No. 02 (air stops sound). Each machine has its blind spot.

### Kill lines

- S0.5 fails "could this be posted?" twice → change art direction or topic.
- Target frame not signed after three rounds → rethink.
- Any compare sheet worse than the previous sprint → stop and fix.
- A number on screen without a SOURCES row or *modelled* tag → not shippable.

## 1. Hard rules

As `../ct/BRIEF.md` §1 (procedural, r186 vendored, 1440 × 900, phone column, `theme=dark` default, zh/en strings, no name or logo, no em dash, `window.__film`). Drawings carry only S1 dimensions: FOV 67.5°, ROC 50, aperture 60, depth ≤ 300.

## 2. Public facts (SOURCES S1, S2)

FOV 67.5° · 5–2 MHz · aperture 60 mm · ROC 50 mm · depth up to 30 cm · presets abdomen / gallbladder / lung / OB-GYN · 2D, colour + PW Doppler, M-mode, harmonic · c = 1540 m/s scanner convention · stones > 4 mm shadow regardless of composition.

Derived: arc 58.9 mm · λ = 0.44 mm at 3.5 MHz, 0.17 mm at 9 MHz · round trip 13 µs per cm · frame time at 16 cm depth × 128 lines ≈ 27 ms (≈ 37 fps, single focus).

## 3. Modelled

Element count 128 and pitch 0.46 mm (unconfirmed) · elevation lens and focus · matching layers ×2, backing, flex circuit, ASIC beamformer board, housing outline, cable strain relief, grip · centre frequency 3.5 MHz and 60 % bandwidth pulse · transmit focus, F-number, receive aperture · TGC curve, noise floor, dynamic range · tissue α / Z / scatter strength per tissue (from the S2 ranges) · stone c / Z / α · phantom geometry (liver, gallbladder 60 × 28 mm, stone Ø 13 mm, kidney). The comparison 9 MHz linear array (frequency control) is a *modelled* array.

## 4. Art direction B (series)

Identical tokens, type and furniture to `../ct/BRIEF.md` §4 (datasheet on a lightbox, dark default, signal red `#D2322D` only for section hatch, the beam line and warnings). Background glyph: a faint fan sector. B-mode image in true grey on the dark paper, framed like a film on the lightbox.

- Hero: the probe in its own colours, cut open in a stepped quarter. Warm-white / pale-grey moulded housing with a satin grip, a dark-grey rubber acoustic lens on the curved face, under it amber matching layers, the thin grey PZT array (kerfs visible at macro), a black tungsten-epoxy backing block, green flex circuit to a small dark PCB with the beamformer ASIC, a black strain relief and cable. Warm key, cool rim, soft contact shadow.

## 5. Layout (1440 × 900)

- **Left (≈ 300 px)**: kicker, 「B超探头」 / "ULTRASOUND PROBE", subtitle 「听回声，画出身体里面。」 / "Listen to the echo, draw the inside.", intro, controls (FREEZE / SCAN, frequency 2–5 MHz + 9 MHz linear toggle, depth 4–30 cm, focus, gain, TGC ×4 sliders, dynamic range), views ×5; datasheet panels **Spec block** (S1 values, live cell) and **Penetration vs frequency** (computed from α·f, live dot).
- **Centre**: probe hero ≥ 1/3, on the phantom block, one scan line in red; balloons; narration line under it.
- **Right**: four instruments (§8).
- **Bottom band**: drawings FRONT (sector geometry, ROC 50, 67.5°) / SIDE (elevation lens) / ARRAY (element stack in section) / SECTION A-A + readings card.

## 6. Parts (≥ 30, metres, closed solids; S2 builds)

Housing upper / lower shells, grip insert, nose cone, lens (silicone rubber), matching layer 1 and 2, PZT array (128 elements as instances, kerf), ground foil, signal flex, backing block, array frame, epoxy fill, heat spreader, PCB, beamformer ASIC, power IC, connectors, flex-to-PCB clamp, cable gland, strain relief, cable, shield braid, screws ×4, seal ring, label recess (blank), phantom block (gel top, liver, gallbladder, stone, kidney), gel layer.

## 7. Solver (`sim.js`, pure, `node --test`)

- **Imaging (feasibility signed in S0)**: `tools/spike/bmode.mjs`. Point scatterers (≈ 6 × 10⁵ in the sector, tissue amplitudes) → Gaussian focused beam (fixed transmit focus, dynamic receive aperture 40 mm) × Gabor pulse, summed as I/Q per line (256 lines) → two-way attenuation α·f marched per line + interface transmission (1 − r²)² → noise floor added before TGC (TGC capped at 55 dB) → envelope → log compression (60 dB) → scan conversion to the 67.5° sector. 2.2 s per frame at 3.5 MHz in Node (one core). The page computes it once per parameter change, never per frame. A real 128-channel delay-and-sum is a stretch goal (S3); the beam model is stated in Known simplifications.
- **Spike result**: speckle fully developed (needed a 32-bit RNG; a float-overflow LCG gave dotty fake speckle), anechoic bile, bright stone arc, shadow column, kidney visible. At 9 MHz the image dies into noise past ≈ 6 cm, which is the frequency trade-off computed with no special code. Posterior enhancement is weak (≈ 6 dB); S3 tunes bile α / TGC so it reads.
- **Session**: pulse timing (PRF from depth), line sequencing for the beam-sweep effect, frame rate, events (freeze, depth change).
- **Tests**: λ = c/f; t = 2d/c; frame rate from depth × lines; shadow column width ≈ stone width; 9 MHz penetration < 3.5 MHz.

## 8. Instruments

1. **RF A-line**: echo amplitude vs time for the red line (stone spike, then silence).
2. **Pulse**: transmit waveform + spectrum (centre f, −6 dB band against the 5–2 MHz spec).
3. **TGC / attenuation**: received level vs depth, TGC curve, noise floor; the gap = penetration.
4. **Delay profile**: per-element focusing delays (curved array + focus), live.

## 9. Interaction

Controls in §5; views 1 overview, 2 cutaway stack, 3 one pulse (beam + delays), 4 frequency trade-off, 5 use shot (B-mode + phantom). Keys 1–5, space freeze, S slow, T theme, L lang, M sound, R reset.

## 10. Narration lines (draft; S5 rewrites as spoken text)

| key | zh | en |
|---|---|---|
| pulse | 晶片一震，发出 3.5 MHz 的声脉冲。 | The crystals ring out a 3.5 MHz pulse. |
| echo | 每遇到一层组织，就弹回一点回声。 | Every boundary sends a little echo back. |
| depth | 回声晚 13 微秒，就是深 1 厘米。 | 13 µs later means 1 cm deeper. |
| stone | 石头把声音全挡住，下面一片黑。 | The stone stops the sound; below it, black. |
| freq | 频率越高越清楚，也越浅。 | Higher frequency, sharper image, shallower reach. |

## 11. Demo outline (S5)

| t (s) | Action | Push-in |
|---|---|---|
| 0–3 | cold open: the B-mode image, stone + shadow | on the sector |
| 3–20 | probe hero, cut open, stack | probe nose |
| 20–45 | one pulse: delays, beam, A-line, depth | beam line |
| 45–65 | frame builds line by line; frequency trade-off | sector |
| 65–80 | CT vs ultrasound blind spots (series line) | split |
| last 10 | full scan, ends on the same stone + shadow | sector |
