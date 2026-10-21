"""Contact sheets for reviewing a rendered film: one frame per subtitle chunk (taken at the chunk's
middle) plus one shortly after every cut, each labelled with time, shot and the line being spoken.

usage: python tools/review_sheet.py out/ep01_1080.mp4 out/review [--cols 4 --rows 5 --width 480]
       python tools/review_sheet.py --render out/review_pre      (no video yet: render the frames from the timeline)
"""
import argparse
import json
import os
import subprocess

from PIL import Image, ImageDraw, ImageFont

ap = argparse.ArgumentParser()
ap.add_argument("video", nargs="?")
ap.add_argument("outdir")
ap.add_argument("--render", action="store_true", help="render frames with tools/still.mjs instead of reading a video")
ap.add_argument("--timeline", default="data/timeline.json")
ap.add_argument("--cols", type=int, default=4)
ap.add_argument("--rows", type=int, default=5)
ap.add_argument("--width", type=int, default=480)
args = ap.parse_args()

tl = json.load(open(args.timeline, encoding="utf-8"))
shot_at = lambda t: next((s["scene"] for s in reversed(tl["shots"]) if s["start"] <= t), "-")
items = []
for s in tl["subtitles"]:
    text = "".join(g["t"] for g in s["segs"])
    items.append(((s["start"] + s["end"]) / 2, text))
for s in tl["shots"]:
    items.append((s["start"] + s.get("fadeIn", 0) + 0.15, f"[cut → {s['scene']}]"))
items.sort()

os.makedirs(args.outdir, exist_ok=True)
w = args.width
h = round(w * 9 / 16)
font = None
for f in ("/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc", "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"):
    if os.path.exists(f):
        font = ImageFont.truetype(f, 15)
font = font or ImageFont.load_default()


frames = {}
if args.render:
    tmp = os.path.join(args.outdir, "frames")
    os.makedirs(tmp, exist_ok=True)
    ts = ",".join(f"{t:.2f}" for t, _ in items)
    subprocess.run(["node", "tools/still.mjs", "--t", ts, "--scale", f"{w / 1920:.3f}", "--out", os.path.join(tmp, "f")], check=True, capture_output=True)
    for t, _ in items:
        frames[round(t, 2)] = Image.open(os.path.join(tmp, f"f_{t:.2f}.png")).convert("RGB").resize((w, h))


def grab(t):
    if args.render:
        return frames[round(t, 2)]
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-ss", f"{t:.3f}", "-i", args.video, "-frames:v", "1",
                          "-vf", f"scale={w}:{h}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
    return Image.frombytes("RGB", (w, h), raw) if len(raw) == w * h * 3 else Image.new("RGB", (w, h))


per = args.cols * args.rows
for k in range(0, len(items), per):
    chunk = items[k:k + per]
    rows = (len(chunk) + args.cols - 1) // args.cols
    sheet = Image.new("RGB", (args.cols * w, rows * (h + 40)), (18, 18, 18))
    d = ImageDraw.Draw(sheet)
    for i, (t, label) in enumerate(chunk):
        x, y = (i % args.cols) * w, (i // args.cols) * (h + 40)
        sheet.paste(grab(t), (x, y + 40))
        d.text((x + 6, y + 3), f"{t:6.2f}s  {shot_at(t)}", fill=(150, 200, 255), font=font)
        d.text((x + 6, y + 20), label[:34], fill=(235, 235, 235), font=font)
    path = os.path.join(args.outdir, f"review_{k // per:02d}.png")
    sheet.save(path)
    print(path, f"{chunk[0][0]:.1f}-{chunk[-1][0]:.1f}s")
