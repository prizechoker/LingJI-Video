"""Score every take (ASR pinyin error rate, UTMOSv2 naturalness, pacing), pick the best per unit,
assemble the narration track and export per-character timestamps for subtitles and visual cues.

Run inside the ASR venv:
  python tools/tts_select.py --takes audio/takes --out audio
"""
import argparse
import glob
import json
import os
import re

import librosa
import numpy as np
import soundfile as sf
import torch
from pypinyin import Style, lazy_pinyin

ap = argparse.ArgumentParser()
ap.add_argument("--script", default="data/script.json")
ap.add_argument("--takes", default="audio/takes")
ap.add_argument("--out", default="audio")
ap.add_argument("--force", default="", help="comma list UNIT=take overrides, e.g. U03=2")
args = ap.parse_args()
torch.set_num_threads(int(os.environ.get("SEL_THREADS", "3")))

DIG = dict(zip("0123456789", "零一二三四五六七八九"))


def norm_cn(s):
    s = re.sub(r"\d", lambda m: DIG[m.group(0)], s)
    s = s.replace("〇", "零")
    return re.sub(r"[^一-鿿]", "", s)


def py(s):
    return lazy_pinyin(norm_cn(s), style=Style.TONE3, neutral_tone_with_five=True)


def edit(a, b):
    d = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        p, d[0] = d[0], i
        for j, y in enumerate(b, 1):
            p, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, p + (x != y))
    return d[len(b)]


def toneless(seq):
    return [re.sub(r"\d", "", x) for x in seq]


from funasr import AutoModel  # noqa: E402

os.environ.setdefault("MODELSCOPE_CACHE", "/opt/models/asr")
asr = AutoModel(model="iic/speech_seaco_paraformer_large_asr_nat-zh-cn-16k-common-vocab8404-pytorch", disable_update=True, log_level="ERROR")
from transformers import AutoModel as HFModel  # noqa: E402

utm = HFModel.from_pretrained("prj-beatrice/utmosv2-torch-native", trust_remote_code=True).eval()

units = json.load(open(args.script, encoding="utf-8"))["units"]
forced = dict(x.split("=") for x in args.force.split(",") if x)
report, chosen = [], {}
missing = []
for u in units:
    exp = py(u["tts"])
    best = None
    if not glob.glob(os.path.join(args.takes, f"{u['id']}_t*.wav")):
        missing.append(u["id"])
        continue
    for f in sorted(glob.glob(os.path.join(args.takes, f"{u['id']}_t*.wav"))):
        y, sr = sf.read(f, dtype="float32")
        y = y if y.ndim == 1 else y.mean(1)
        y16 = librosa.resample(y, orig_sr=sr, target_sr=16000)
        r = asr.generate(input=y16, disable_pbar=True)[0]
        hyp = py(r["text"])
        cer = edit(exp, hyp) / max(1, len(exp))
        cer_tl = edit(toneless(exp), toneless(hyp)) / max(1, len(exp))
        with torch.inference_mode():
            mos = utm(torch.from_numpy(y), sampling_rate=sr).scores[0].item()
        iv = librosa.effects.split(y16, top_db=38)
        speech = sum(b - a for a, b in iv) / 16000
        gaps = [(iv[k + 1][0] - iv[k][1]) / 16000 for k in range(len(iv) - 1)]
        n_punct = len(re.findall(r"[，。：；？！、—]", u["tts"]))
        long_gaps = sum(1 for g in gaps if g > 0.75)
        rate = len(norm_cn(u["tts"])) / max(0.3, speech)
        score = mos - 6 * cer_tl - 1.5 * max(0, cer - cer_tl) - 0.6 * max(0, long_gaps - n_punct // 3) - 0.35 * abs(rate - 5.0)
        take = int(re.search(r"_t(\d+)", f).group(1))
        rec = dict(unit=u["id"], take=take, file=f, cer=round(cer, 3), cer_toneless=round(cer_tl, 3), utmos=round(mos, 3),
                   rate=round(rate, 2), dur=round(len(y) / sr, 2), long_gaps=long_gaps, score=round(score, 3), asr=r["text"])
        report.append(rec)
        print(json.dumps(rec, ensure_ascii=False), flush=True)
        if best is None or score > best["score"]:
            best = rec
    if u["id"] in forced:
        best = next(x for x in report if x["unit"] == u["id"] and x["take"] == int(forced[u["id"]]))
    chosen[u["id"]] = best

json.dump(report, open(os.path.join(args.out, "takes_report.json"), "w"), ensure_ascii=False, indent=1)
if missing:
    print("MISSING", missing, "- evaluation only, narration not assembled")
    raise SystemExit(0)
# ---- assemble narration with designed pauses; collect char timestamps
import pyloudnorm as pyln  # noqa: E402

SR = 24000
meter = pyln.Meter(SR, block_size=0.2)
track, units_out, t = [], [], 0.25
track.append(np.zeros(int(SR * t), dtype=np.float32))
for u in units:
    b = chosen[u["id"]]
    y, sr = sf.read(b["file"], dtype="float32")
    y = y if y.ndim == 1 else y.mean(1)
    if sr != SR:
        y = librosa.resample(y, orig_sr=sr, target_sr=SR)
    iv = librosa.effects.split(y, top_db=42)
    a0 = max(0, iv[0][0] - int(0.05 * SR))
    a1 = min(len(y), iv[-1][1] + int(0.08 * SR))
    y = y[a0:a1]
    # even out level between units (takes come out of the model at slightly different loudness)
    lu = meter.integrated_loudness(y)
    if np.isfinite(lu):
        y = y * 10 ** (np.clip(-20.0 - lu, -6, 6) / 20)
    fade = int(0.012 * SR)
    y[:fade] *= np.linspace(0, 1, fade)
    y[-fade:] *= np.linspace(1, 0, fade)
    y16 = librosa.resample(y, orig_sr=SR, target_sr=16000)
    r = asr.generate(input=y16, disable_pbar=True)[0]
    ts = r.get("timestamp", [])
    chars = [c for c in re.sub(r"\s", "", r["text"])]
    start = t
    track.append(y)
    t += len(y) / SR
    units_out.append(dict(id=u["id"], start=round(start, 3), end=round(t, 3), take=b["take"], asr=r["text"],
                          chars=[[c, round(start + a / 1000, 3), round(start + e / 1000, 3)] for c, (a, e) in zip(chars, ts)]))
    pause = u.get("pause", 0.4)
    track.append(np.zeros(int(SR * pause), dtype=np.float32))
    t += pause
narr = np.concatenate(track)
os.makedirs(args.out, exist_ok=True)
sf.write(os.path.join(args.out, "narration_raw.wav"), narr, SR)
json.dump(dict(sr=SR, duration=round(len(narr) / SR, 3), units=units_out), open(os.path.join(args.out, "narration.json"), "w"), ensure_ascii=False, indent=1)
json.dump(report, open(os.path.join(args.out, "takes_report.json"), "w"), ensure_ascii=False, indent=1)
print("TOTAL", round(len(narr) / SR, 2), "s")
