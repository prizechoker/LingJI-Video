#!/usr/bin/env bash
# Episode 1 v2.3 = the v2.2 picture with two stretches re-rendered, spliced in by stream copy (no re-encode of the rest):
#   - the hook (frames 0..332): its first line is new and longer by exactly 14 frames (tts_select --lead pads it);
#   - the robot shots (s42's tail to s47's head, 262.58 s..290.58 s): the shoulder fix, the gala wave, the teleop reach.
# Every other frame is v2.2's own, 14 frames later. Cuts fall on the old film's keyframes (closed GOPs), so a cut-out
# run of packets decodes exactly as before. The new mix is muxed in on the way.
#   tools/patch_v23.sh            (needs out/film_v2_1080.mp4, out/v23_hook.mp4, out/v23_robot.mp4, audio/mix.wav)
set -euo pipefail
cd "$(dirname "$0")/.."
OLD=out/film_v2_1080.mp4
SHIFT=14                      # frames the v2.2 picture moves by after the hook
A0=319 A1=6288 B0=6960        # old keyframes: copy [A0, A1) and [B0, end)
TMP=out/.patch_v23
mkdir -p "$TMP"
NOLD=$(ffprobe -v error -select_streams v -count_packets -show_entries stream=nb_read_packets -of csv=p=0 "$OLD")
cut() { # first frame, frame count, output
  ffmpeg -y -loglevel error -ss "$(python3 -c "print($1 / 24)")" -i "$OLD" -map 0:v -c copy -frames:v "$2" -avoid_negative_ts make_zero "$3"
  local n
  n=$(ffprobe -v error -select_streams v -count_packets -show_entries stream=nb_read_packets -of csv=p=0 "$3")
  [ "$n" = "$2" ] || { echo "cut $1+$2: got $n frames" >&2; exit 1; }
}
cut $A0 $((A1 - A0)) "$TMP/a.mp4"
cut $B0 $((NOLD - B0)) "$TMP/b.mp4"
printf "file '%s'\n" "$PWD/out/v23_hook.mp4" "$PWD/$TMP/a.mp4" "$PWD/out/v23_robot.mp4" "$PWD/$TMP/b.mp4" > "$TMP/list.txt"
ffmpeg -y -loglevel error -f concat -safe 0 -i "$TMP/list.txt" -i audio/mix.wav -map 0:v -map 1:a \
  -c:v copy -c:a aac -b:a 320k -ar 48000 -movflags +faststart -shortest out/ep01_v23_1080.mp4
rm -rf "$TMP"
N=$(ffprobe -v error -select_streams v -count_packets -show_entries stream=nb_read_packets -of csv=p=0 out/ep01_v23_1080.mp4)
echo "v2.3: $N frames (v2.2: $NOLD, +$SHIFT)"
[ "$N" = "$((NOLD + SHIFT))" ] || { echo "frame count mismatch" >&2; exit 1; }
echo "done: out/ep01_v23_1080.mp4"
