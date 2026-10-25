# SCRIPT · B超探头 · 口播稿 v1 (Sprint 5, 2026-10-25)

Spoken text, written to be voiced first; captions and demo are timed to the voice afterwards.
Numbers: `sim.js` (useShot: Ø 13 mm, 7.0 cm, 91 µs; frame rate 38 fps at 17 cm; λ 0.44 / 0.17 mm; 9 MHz reach ≈ 7 cm), SOURCES S1 (67.5°, 5–2 MHz), S3 (CT misses many stones). No tissue table numbers quoted (still *modelled*).
Estimate: 20 lines, ≈ 390 zh chars ≈ 102 s speech at 3.8 chars/s, ≈ 120 s with gaps (≈ 80 % speech).

| # | view | zh | en |
|---|---|---|---|
| 1 | 用途 (cold open) | 这道黑影，是一颗 13 毫米的胆结石投下的。 | This dark stripe is cast by a gallstone, 13 millimetres across. |
| 2 | 用途 | 拍下它的，不是 X 光，而是声音。 | No X-rays made this picture. Only sound. |
| 3 | 总览 | 整台超声机，就装在这只探头里。 | The whole scanner fits inside this probe. |
| 4 | 总览 | 插在手机上，就能用。 | Plug it into a phone, and it works. |
| 5 | 叠层 | 剖开探头的前端，最外面是一层硅胶声透镜。 | Cut open the nose. On the outside sits a silicone lens. |
| 6 | 叠层 | 透镜下面是两层匹配层，再下面，是一排压电晶片。 | Under it are two matching layers, and under those, a row of piezo crystals. |
| 7 | 叠层 | 晶片后面的背衬块，让每一次振动很快停下来。 | The backing block behind them makes every ring stop fast. |
| 8 | 脉冲 | 通上电，晶片一震，就发出 3.5 兆赫的声脉冲。 | A voltage kicks the crystals, and they ring out a 3.5 megahertz pulse. |
| 9 | 脉冲 | 每个晶片都晚一点点出发，声波就汇聚到同一个焦点。 | Each crystal fires a little later than the next, so the waves meet at one focus. |
| 10 | 脉冲 | 声音每遇到一层组织，就弹回来一点回声。 | Every boundary in the body sends a little echo back. |
| 11 | 脉冲 | 机器假定声速是每秒 1540 米。 | The scanner assumes sound travels 1540 metres a second. |
| 12 | 脉冲 | 所以回声晚 13 微秒，就是深了 1 厘米。 | So an echo 13 microseconds later means 1 centimetre deeper. |
| 13 | 脉冲 | 结石在 7 厘米深的地方，回声 91 微秒就回来了。 | The stone is 7 centimetres down. Its echo is back in 91 microseconds. |
| 14 | 脉冲 | 声音过不去结石，下面就没有回声，只剩一道黑影。 | Sound cannot get through the stone. Below it there is no echo, only a shadow. |
| 15 | 扫描 | 一条线接一条线扫过去，一秒钟能画 38 张。 | Line after line sweeps across, 38 pictures every second. |
| 16 | 频率 | 换成 9 兆赫，波长只有 0.17 毫米，画面更细。 | Switch to 9 megahertz. The wavelength drops to 0.17 millimetres, and the picture gets finer. |
| 17 | 频率 | 但是声音衰减得更快，7 厘米以下就看不见了。 | But the sound fades faster, and below 7 centimetres there is nothing left. |
| 18 | 用途 | 在 CT 上，很多结石和胆汁几乎一样，常常被漏掉。 | On CT, many gallstones look almost like bile, and they are often missed. |
| 19 | 用途 | 超声也有盲区，声音穿不过充满空气的肺。 | Ultrasound has a blind spot too. Sound cannot cross the air in the lungs. |
| 20 | 用途 (= cold open) | 回到这颗结石，下面那道黑影，就是声音过不去的地方。 | Back to the stone. The shadow below is where the sound could not go. |
| 21 | end hold | 剖面影像工坊，让看不见的原理被看见。 | Cutaway Works. Making the invisible visible. |

## To check before voicing

- Line 4: Lumify connects to a phone / tablet (S1 product page, "app-based"); add the row to SOURCES.
- Line 19: air blocks ultrasound (impedance mismatch, standard); add a textbook row (Szabo) to SOURCES.
- Line 17: "7 厘米以下" = the solver's 9 MHz reach arc (7 vs 17 cm), computed.
