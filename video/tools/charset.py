"""Collect every CJK character the film can draw (script subtitles, chapter titles, text in the shots) into
data/charset.txt, so the render page preloads exactly those font subsets."""
import glob
import json
import re

chars = set()
d = json.load(open("data/script.json", encoding="utf-8"))
for u in d["units"]:
    chars.update(u["sub"])
for c in d.get("chapters", []):
    chars.update(c["title"])
for f in glob.glob("shots/**/*.js", recursive=True) + glob.glob("engine2/*.js") + glob.glob("tools/build_timeline*.py"):
    chars.update(open(f, encoding="utf-8").read())
cjk = sorted(c for c in chars if re.match(r"[　-〿一-鿿＀-￯—…“”·]", c))
open("data/charset.txt", "w", encoding="utf-8").write("".join(cjk))
print(len(cjk), "characters")
