#!/usr/bin/env bash
# Episode 1 v2, the realistic film: narration takes -> timeline -> score -> mix -> subtitles -> render -> mux.
# (v2.3 re-rendered only the hook and the robot shots and spliced them into the v2.2 picture: tools/patch_v23.sh)
# usage: tools/finalize_v2.sh [stage]   stage: audio (everything but the picture) | render | mux | all (default)
#   RENDER_WORKERS=2 RENDER_SCALE=1 tools/finalize_v2.sh render
set -euo pipefail
cd "$(dirname "$0")/.."
STAGE="${1:-all}"
SCALE="${RENDER_SCALE:-1}"
WORKERS="${RENDER_WORKERS:-2}"
TAG=$([ "$SCALE" = "2" ] && echo 4k || echo 1080)
PY=/opt/venvs/asr/bin/python
if [ "$STAGE" = "audio" ] || [ "$STAGE" = "all" ]; then
  [ -f audio/narration.json ] || $PY tools/tts_select.py --takes audio/takes --out audio
  python3 tools/build_timeline.py > out/timeline.log
  python3 tools/charset.py
  $PY tools/score_v2.py
  $PY tools/mix.py
  python3 tools/make_srt.py out/ep01_v2.srt
fi
if [ "$STAGE" = "render" ] || [ "$STAGE" = "all" ]; then
  node tools/render.mjs --page engine2/film.html --scale "$SCALE" --fps 24 --workers "$WORKERS" --crf 14 --seg 240 --resume 1 --out "out/film_v2_${TAG}.mp4"
fi
if [ "$STAGE" = "mux" ] || [ "$STAGE" = "all" ]; then
  ffmpeg -y -loglevel error -i "out/film_v2_${TAG}.mp4" -i audio/mix.wav -map 0:v -map 1:a \
    -c:v copy -c:a aac -b:a 320k -ar 48000 -movflags +faststart -shortest "out/ep01_v2_${TAG}.mp4"
  echo "done: out/ep01_v2_${TAG}.mp4"
fi
