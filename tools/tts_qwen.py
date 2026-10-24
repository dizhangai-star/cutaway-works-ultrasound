"""Local Qwen3-TTS (MLX) for film narration: a list of lines in, one 48 kHz mono PCM16 WAV per line out.

Subject-free. Run with the Python that has mlx_audio (default: ~/dev/tools/qwen-local/.venv/bin/python):
  python tts_qwen.py job.json
job.json = { "out": dir, "model": id, "speaker": "Serena", "language": "Chinese", "instruct": "...", "temperature": 0.6,
             "items": [ { "id": "c01", "text": "...", "seed": 1 }, ... ] }
Clone mode (a Base model): "ref_audio": wav, "ref_text": its exact transcript, instead of speaker / instruct: every
line continues the reference recording, so timbre, pace and tone follow one take.
Each WAV is cached under <out>/<sha1 of model|speaker|language|instruct|text|seed>.wav, so a re-run only
voices lines that changed. Prints a JSON list [{ id, file, seconds, f0, tail_db, cached }] on the last stdout line
(f0 = median pitch in Hz, for the caller's speaker-drift guard).
"""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

RATE = 48000
DECODE = "full-length"   # cache tag: mlx_audio's decode trims by (codes[..., 0] > 0), see patch_decode()


def key(job, item):
    parts = [job["model"], job["speaker"], job["language"], job.get("instruct") or "", item["text"], str(item.get("seed", 1)), DECODE]
    if job.get("temperature") is not None:   # absent = model default (0.9), keeps the old cache keys
        parts.append(f"t{job['temperature']}")
    if job.get("ref_audio"):
        parts += [hashlib.sha1(Path(job["ref_audio"]).read_bytes()).hexdigest(), job["ref_text"]]
    return hashlib.sha1("\x1f".join(parts).encode("utf-8")).hexdigest()[:16]


def patch_decode(model):
    """mlx_audio's speech_tokenizer.decode() reports the valid length as the count of frames whose first code is > 0,
    and the generate paths cut the audio to it. 0 is a valid code, so every 0 frame (in the clone reference or the
    take) cut 80 ms off the END: last syllables swallowed (2 zero frames in our Serena reference = 0.16 s on every
    clone line). One sequence is decoded at a time here, so its true length is all of its frames."""
    st = model.speech_tokenizer
    orig = st.decode

    def decode(codes):
        import mlx.core as mx
        wav, _ = orig(codes)
        return wav, mx.array([codes.shape[1] * st.decode_upsample_rate])
    st.decode = decode


def measure(path):
    """(seconds, median F0 in Hz by YIN on voiced 40 ms frames (0 if none), peak dBFS of the last 10 ms): the F0
    catches speaker drift, the tail level a take that stops mid-syllable (clone mode does that in ~40 % of takes)."""
    import numpy as np
    import soundfile as sf
    x, sr = sf.read(str(path))
    secs = len(x) / sr
    tail = float(20 * np.log10(np.abs(x[-int(0.01 * sr):]).max() + 1e-9))
    x, sr = x[::3], sr // 3
    w, hop, lo, hi = int(sr * 0.04), int(sr * 0.01), int(sr / 400), int(sr / 70)
    f = []
    for s in range(0, len(x) - w - hi, hop):
        fr = x[s:s + w + hi]
        if np.sqrt(np.mean(fr[:w] ** 2)) < 0.02:
            continue
        d = np.array([np.sum((fr[:w] - fr[t:t + w]) ** 2) for t in range(1, hi + 1)])
        cm = d / (np.cumsum(d) / np.arange(1, hi + 1) + 1e-12)
        idx = np.where(cm[lo - 1:] < 0.15)[0]
        if len(idx):
            f.append(sr / (lo + idx[0]))
    return secs, float(np.median(f)) if f else 0.0, tail


def main():
    job = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    out = Path(job["out"]).resolve()
    out.mkdir(parents=True, exist_ok=True)
    todo, report = [], []
    for item in job["items"]:
        f = out / f"{key(job, item)}.wav"
        report.append(dict(id=item["id"], file=str(f), cached=f.exists()))
        if not f.exists():
            todo.append((item, f))
    if todo:
        import mlx.core as mx
        import numpy as np
        import soundfile as sf
        from mlx_audio.tts.utils import load_model
        model = load_model(job["model"])
        patch_decode(model)
        for n, (item, f) in enumerate(todo, 1):
            print(f"[{n}/{len(todo)}] {item['id']} {item['text']}", file=sys.stderr, flush=True)
            mx.random.seed(int(item.get("seed", 1)))
            if job.get("ref_audio"):
                res = list(model.generate(text=item["text"], ref_audio=job["ref_audio"], ref_text=job["ref_text"],
                                          lang_code=job["language"].lower(), temperature=job.get("temperature")))
            else:
                res = list(model.generate_custom_voice(text=item["text"], speaker=job["speaker"], language=job["language"],
                                                       instruct=job.get("instruct"), temperature=job.get("temperature"),
                                                       stream=False))
            if not res or len({r.sample_rate for r in res}) != 1:
                raise RuntimeError(f"{item['id']}: no audio")
            audio = np.concatenate([np.asarray(r.audio).reshape(-1) for r in res])
            if not len(audio) or not np.isfinite(audio).all():
                raise RuntimeError(f"{item['id']}: empty or non-finite audio")
            raw = f.with_suffix(".raw.wav")
            sf.write(str(raw), audio, res[0].sample_rate, subtype="FLOAT")
            subprocess.run(["ffmpeg", "-nostdin", "-y", "-v", "error", "-i", str(raw), "-ar", str(RATE), "-ac", "1",
                            "-c:a", "pcm_s16le", str(f.with_suffix(".part.wav"))], check=True)
            raw.unlink()
            f.with_suffix(".part.wav").replace(f)
    for r in report:
        secs, f0, tail = measure(r["file"])
        r["seconds"], r["f0"], r["tail_db"] = round(secs, 3), round(f0, 1), round(tail, 1)
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
