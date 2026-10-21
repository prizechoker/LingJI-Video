"""Export the burned-in subtitles as an .srt file (for platforms that accept external captions)."""
import json
import sys

tl = json.load(open("data/timeline.json", encoding="utf-8"))
out = sys.argv[1] if len(sys.argv) > 1 else "out/ep01.srt"


def ts(t):
    t = max(0.0, t)
    h, m = int(t // 3600), int(t % 3600 // 60)
    s = t - h * 3600 - m * 60
    return f"{h:02d}:{m:02d}:{int(s):02d},{int(round((s - int(s)) * 1000)):03d}"


lines = []
subs = tl["subtitles"]
for i, s in enumerate(subs):
    text = "".join(g["t"] for g in s["segs"]).strip()
    end = s["end"]
    if i + 1 < len(subs):
        end = min(end, subs[i + 1]["start"] - 0.02)
    lines.append(f"{i + 1}\n{ts(s['start'])} --> {ts(end)}\n{text}\n")
open(out, "w", encoding="utf-8").write("\n".join(lines))
print(out, len(subs))
