#!/usr/bin/env bash
# Build the finished episode from selected narration takes:
#   timeline -> score -> mix -> render -> mux -> subtitles -> cover
# usage: tools/finalize.sh [scale] [workers]     (scale 1 = 1920x1080, 2 = 3840x2160)
set -euo pipefail
cd "$(dirname "$0")/.."
SCALE="${1:-1}"
WORKERS="${2:-3}"
TAG=$([ "$SCALE" = "2" ] && echo 4k || echo 1080)
source /opt/venvs/asr/bin/activate
export PYTHONPATH=tools
python tools/build_timeline.py > out/timeline.log
python tools/score.py
python tools/mix.py
python tools/make_srt.py out/ep01.srt
node tools/render.mjs --scale "$SCALE" --workers "$WORKERS" --crf 14 --out "out/film_${TAG}.mp4"
# mux: high-quality video stream + 320k AAC audio; faststart for web players
ffmpeg -y -loglevel error -i "out/film_${TAG}.mp4" -i audio/mix.wav -map 0:v -map 1:a \
  -c:v copy -c:a aac -b:a 320k -ar 48000 -movflags +faststart -shortest "out/ep01_${TAG}.mp4"
node tools/still.mjs --proto cover --t 0 --scale "$SCALE" --out out/cover >/dev/null
# covers: 16:9 as rendered, plus a centred 16:10 crop (text is kept inside its safe area)
python3 -c "
from PIL import Image
im = Image.open('out/cover_0.00.png').convert('RGB'); w, h = im.size
im.save('out/cover_16x9.jpg', quality=95)
cw = round(h * 1.6); x0 = (w - cw) // 2
im.crop((x0, 0, x0 + cw, h)).save('out/cover_16x10.jpg', quality=95)
"
echo "done: out/ep01_${TAG}.mp4"
