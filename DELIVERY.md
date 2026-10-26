# DELIVERY · B超探头 (No. 03)

Platform (user 2026-10-26): **抖音 剖面影像工坊 (zh) only**. No en render. Page kept local.

| File | What |
|---|---|
| `out/ultrasound.zh.mp4` | 1920×1080 60 fps, 124.3 s, −14 LUFS, burned-in captions, bg film, dark |
| `out/poster.zh.png` | 1920×1080 横版封面 (`node tools/poster.mjs --lang zh`, layout in `poster.json`) |
| `out/cover-3x4.zh.png` | 1080×1440 主页网格封面 |
| `out/ultrasound.zh.srt` | 字幕 = 口播稿 (`node tools/srt.mjs --lang zh --rate 1`); already burned in, for search only |

Rules: no em dash; numbers as on screen; the model only in the sources note; synthetic voice declared.

---

## 抖音 · 剖面影像工坊 (zh)

**标题 / 作品描述**（首行即标题，≤ 30 字）

> 胆结石，怎么用声音拍出来？

**正文**

```
胆结石，怎么用声音拍出来？
把一只 B 超探头剖开：一排压电晶片发出 3.5 兆赫的声脉冲，每片晚一点点出发，声波汇聚到一个焦点。
回声晚 13 微秒，就是深了 1 厘米。7 厘米深的结石，91 微秒回声就回来了。
声音穿不过结石，下面只剩一道黑影，这就是医生找的声影。
画面上每个数字都由同一个模型算出来。
剖面影像工坊，让看不见的原理被看见。

#B超 #超声 #胆结石 #科普 #医学影像 #原理动画 #剖面影像工坊
```

**设置**：封面 `out/poster.zh.png`（横版作品）；主页网格封面 `out/cover-3x4.zh.png` · 作者声明：**内容由 AI 生成**（口播为合成音色，画面代码生成）· 第 03 期，放进合集「剖面影像工坊」（X 光管 → CT → B超）。

**评论区置顶（可选）**：数据依据一款 5–2 MHz 掌上凸阵探头的公开资料（视野角 67.5°、曲率半径 50 mm），晶片数等为建模值；独立研究，与任何厂商无关。片中图像由仿真体计算，不是真人。
