# Concept log · fix in code, never copy

## A-series v1 (2026-10-25, --series ct, dark ×2)

- Both: SIDE view shows **170 mm** and **50 mm** probe dimensions: invented (not in SOURCES). The drawing keeps only ROC 50, FOV 67.5°, aperture 60.
- Both: TGC drawn as a straight line; real TGC = α·f·depth capped at 55 dB plus four slider points (S3).
- v1a / v1b delay scale: corrected in S0.5. The solver gives µs (≈ 2.3 µs max for 64 elements focused at 70 mm on the 50 mm arc: the convex face itself defocuses), so v1a's µs scale was right and v1b's ns was wrong.
- v1a: the B-mode depth ruler reads 30 cm but the stone sits at 13 cm; ours puts it at 7 cm in a 16 cm view.
- v1a: the hero's piezo row looks like a stack of large blocks; real elements are 0.46 mm × 128 (instanced, kerfs visible only at macro).
- v1b: B-mode is a photo-like clinical image; ours is the computed spike look (finer speckle, grey kidney with a capsule line).
- v1b: the red scan line from the probe nose into the sector is the strongest single idea (the cause → image link); keep it whatever direction is signed.
