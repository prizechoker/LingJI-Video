"""Synthesize every narration unit with a cloned (designed) voice, several takes each.

Run inside the qwen-tts venv:
  python tools/tts_produce.py --ref ref.wav --ref-text "..." --takes 3 --out audio/takes [--only U03,U07]
"""
import argparse
import json
import os
import time

import soundfile as sf
import torch

ap = argparse.ArgumentParser()
ap.add_argument("--script", default="data/script.json")
ap.add_argument("--ref", required=True)
ap.add_argument("--ref-text", required=True)
ap.add_argument("--takes", type=int, default=3)
ap.add_argument("--out", default="audio/takes")
ap.add_argument("--only", default="")
ap.add_argument("--seed0", type=int, default=7)
ap.add_argument("--temperature", type=float, default=0.8)
args = ap.parse_args()

torch.set_num_threads(int(os.environ.get("TTS_THREADS", "4")))
from qwen_tts import Qwen3TTSModel  # noqa: E402

os.makedirs(args.out, exist_ok=True)
units = json.load(open(args.script, encoding="utf-8"))["units"]
only = set(x for x in args.only.split(",") if x)

model = Qwen3TTSModel.from_pretrained("Qwen/Qwen3-TTS-12Hz-1.7B-Base", device_map="cpu", dtype=torch.float32)
prompt = model.create_voice_clone_prompt(ref_audio=args.ref, ref_text=args.ref_text, x_vector_only_mode=False)

for u in units:
    if only and u["id"] not in only:
        continue
    todo = [k for k in range(args.takes) if not os.path.exists(os.path.join(args.out, f"{u['id']}_t{k}.wav"))]
    if not todo:
        continue
    # all missing takes of a unit in one batch: much better CPU throughput than one by one
    torch.manual_seed(args.seed0 + sum(map(ord, u["id"])) * 13 + len(todo))
    t0 = time.time()
    n_chars = len(u["tts"])
    wavs, sr = model.generate_voice_clone(
        text=[u["tts"]] * len(todo), language=["Chinese"] * len(todo), voice_clone_prompt=prompt * len(todo),
        do_sample=True, temperature=args.temperature, top_p=0.9, max_new_tokens=int(60 + n_chars * 6),
    )
    for k, w in zip(todo, wavs):
        sf.write(os.path.join(args.out, f"{u['id']}_t{k}.wav"), w, sr)
    print(f"{u['id']} takes{todo} {time.time() - t0:.1f}s -> {[round(len(w) / sr, 2) for w in wavs]}", flush=True)
print("DONE", flush=True)
