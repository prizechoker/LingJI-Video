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
echo "done: out/ep01_${TAG}.mp4"
