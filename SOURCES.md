# SOURCES · B超探头 图版

Every number on screen has a row here or a *modelled* tag (BRIEF §3). Footnote on the plate: "An independent study based on the published specifications of a 5–2 MHz curved-array ultrasound transducer; not affiliated with any manufacturer." No name or logo on the plate.

Reference object (S0, 2026-10-24): a **handheld 5–2 MHz curved array with the beamformer in the probe** (USB to a phone or tablet), so the probe is the whole machine.

## S1 · Probe: Philips Lumify C5-2 curved array transducer

Product page, Philips Healthcare USA, read 2026-10-24: https://www.usa.philips.com/healthcare/product/HC989605450382/lumify-c5-2-curved-array-transducer (Specifications block).

| Item | Value |
|---|---|
| Field of view | **67.5°** |
| Bandwidth | **5–2 MHz** |
| Aperture | **60 mm** |
| Radius of curvature | **50 mm** |
| Scan depth | up to **30 cm** |
| Applications (presets) | Abdomen, **Gallbladder**, Lung, OB/GYN |
| Imaging features | 2D, color Doppler, PW Doppler, M-mode, SonoCT, tissue harmonic, xRes |
| Cable | detachable |

Derived: arc length 50 mm × 67.5° = **58.9 mm** (consistent with the 60 mm aperture).

Not on the page → *modelled* until a document is found: element count (128 per resellers, unconfirmed), pitch (58.9 / 128 = 0.46 mm if 128), elevation focus, outline / weight, internal stack.

## S2 · Tissue acoustics (to pin to a primary table in Sprint 3)

| Item | Value | Status |
|---|---|---|
| Scanner sound speed | 1540 m/s (soft-tissue convention every scanner is calibrated to) | standard; cite Szabo / Duck in S3 |
| Liver | c 1549–1585 m/s, Z ≈ 1.62–1.65 MRayl, α 0.23–0.73 dB/cm/MHz | literature range; pick one table in S3 |
| Water / bile | c ≈ 1480–1520 m/s, α low (≈ 0.002 dB/cm/MHz² water; bile *modelled* 0.2) | S3 |
| Gallstone | shadows when > 4 mm, independent of composition | Gastroenterology 1979 (UTMB record "Ultrasonic properties of gallstones. Effect of stone size and composition"); stone c / Z / α *modelled* |

## S3 · CT comparison (narration only)

| Item | Value | Source |
|---|---|---|
| CT sensitivity for gallstones | ≈ 39 % vs 83 % for ultrasound; up to 57 % of stones isoattenuating to bile | ARRS 2023 abstract E2259 (conference abstract: say "many", not the number, unless a journal source is found) |
| Ultrasound sensitivity | 0.85, specificity 1 vs histopathology | retrospective study (PMC, S3 to pin) |

## S4 · Narration claims (S5)

| Item | Value | Source |
|---|---|---|
| Probe runs on a phone (script line 4) | Lumify transducer + Lumify app on a compatible Android / iOS smart device | S1 product page (Philips Lumify system description) |
| Air blocks ultrasound (script line 19) | soft tissue / air impedance ratio ≈ 1.6 MRayl / 0.0004 MRayl: reflection ≈ 99.9 %, so aerated lung is not imaged | standard acoustics; Szabo, *Diagnostic Ultrasound Imaging: Inside Out*, ch. 3 (page to pin) |
