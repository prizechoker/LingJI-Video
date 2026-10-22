// Review the film shot by shot: for every shot of data/timeline.json render frames near its start, middle and end
// (plus any extra times) through the real film page, then tile them into contact sheets (out/review_v2/sheet_NN.jpg).
// usage: node tools/review_v2.mjs [scale=0.4] [from_shot=0] [to_shot=999] [--times 0.15,0.5,0.85]
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { serve } from './server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ti = process.argv.indexOf('--times');
const [scale = '0.4', from = '0', to = '999'] = process.argv.slice(2, ti > 0 ? ti : undefined);
const fracs = ti > 0 ? process.argv[ti + 1].split(',').map(Number) : [0.12, 0.5, 0.88];
const tl = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/timeline.json'), 'utf8'));
const outDir = path.join(ROOT, 'out/review_v2');
fs.mkdirSync(outDir, { recursive: true });
const { srv, port } = await serve(ROOT);
const b = await chromium.launch({ args: ['--disable-gpu-vsync'] });
const W = Math.round(1920 * +scale), H = Math.round(1080 * +scale);
const page = await b.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[error]', m.text().slice(0, 300)); });
await page.goto(`http://127.0.0.1:${port}/engine2/film.html?scale=${scale}`);
await page.evaluate(() => window.__init({ timeline: 'timeline.json' }));
const canvas = page.locator('#out');
const fps = tl.fps || 24;
for (let i = +from; i < Math.min(tl.shots.length, +to + 1); i++) {
  const s = tl.shots[i];
  const t0 = Date.now();
  for (const f of fracs) {
    const t = s.start + (s.end - s.start) * f;
    await page.evaluate(([tt, fi]) => window.__frame(tt, fi), [t, Math.round(t * fps)]);
    await canvas.screenshot({ path: path.join(outDir, `${s.id}_${f.toFixed(2)}.png`) });
  }
  console.log(`${s.id} ${s.scene} ${s.p.mode || ''} ${(s.end - s.start).toFixed(1)}s  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
await b.close();
srv.close();
// contact sheets: 8 shots per sheet, one row per shot
const ids = tl.shots.slice(+from, +to + 1).map((s) => s.id);
const py = `
import json, sys
from PIL import Image, ImageDraw
tl = json.load(open('data/timeline.json'))
ids = ${JSON.stringify(ids)}
fr = ${JSON.stringify(fracs.map((f) => f.toFixed(2)))}
shots = {s['id']: s for s in tl['shots']}
for k in range(0, len(ids), 8):
    rows = ids[k:k + 8]
    ims = [[Image.open(f'out/review_v2/{i}_{f}.png').convert('RGB') for f in fr] for i in rows]
    w, h = ims[0][0].size
    sheet = Image.new('RGB', (w * len(fr), h * len(rows)), (20, 20, 20))
    d = ImageDraw.Draw(sheet)
    for r, row in enumerate(ims):
        for c, im in enumerate(row):
            sheet.paste(im, (c * w, r * h))
        s = shots[rows[r]]
        d.text((6, r * h + 4), f"{s['id']} {s['scene']} {s['p'].get('mode', '')} {s['start']:.1f}-{s['end']:.1f}", fill=(255, 255, 0))
    sheet.save(f'out/review_v2/sheet_{k // 8:02d}.jpg', quality=82)
    print('sheet', k // 8)
`;
execFileSync('python3', ['-c', py], { cwd: ROOT, stdio: 'inherit' });
