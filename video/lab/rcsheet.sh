#!/usr/bin/env bash
# render robot check views and tile them: lab/rcsheet.sh <out.png> cam1 cam2 cam3 cam4
out=$1; shift
for c in "$@"; do node lab/shoot.mjs robotcheck 0 0.5 "{\"cam\":\"$c\"}" 2>&1 | grep -E "error|Error" | head -3; mv out/lab/robotcheck_0.00.png out/lab/rc_$c.png; done
python3 - "$out" "$@" <<'PY'
import sys
from PIL import Image
out, cams = sys.argv[1], sys.argv[2:]
ims = [Image.open(f'out/lab/rc_{c}.png') for c in cams]
w, h = ims[0].size
o = Image.new('RGB', (w * 2, h * ((len(ims) + 1) // 2)))
for i, im in enumerate(ims): o.paste(im, ((i % 2) * w, (i // 2) * h))
o.save(out)
PY
