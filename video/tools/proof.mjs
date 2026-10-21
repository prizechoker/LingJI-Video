// Proof sheet: render several scenes at a few times each in ONE browser session, then tile them.
// usage: node tools/proof.mjs --spec '[["cart",13,[1,6,9]],["moravec",11,[2,6,10]]]' --scale 0.4 --out out/proof/sheet.png
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { serve } from './server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]]);
  return acc;
}, []));
const spec = JSON.parse(args.spec);
const scale = parseFloat(args.scale || '0.4');
const out = path.resolve(ROOT, args.out || 'out/proof/sheet.png');
const tmp = path.join(path.dirname(out), 'tiles');
fs.mkdirSync(tmp, { recursive: true });
const { srv, port } = await serve(ROOT);
const browser = await chromium.launch();
const files = [];
for (const [scene, dur, times, params] of spec) {
  const page = await browser.newPage({ viewport: { width: Math.round(1920 * scale), height: Math.round(1080 * scale) } });
  page.on('pageerror', (e) => console.log(`[pageerror ${scene}]`, e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log(`[console ${scene}]`, m.text()); });
  await page.goto(`http://127.0.0.1:${port}/engine/index.html?scale=${scale}`);
  await page.evaluate((o) => window.__init(o), { proto: scene, protoDur: dur, protoParams: params || {} });
  for (const t of times) {
    await page.evaluate(([tt]) => window.__frame(tt, Math.round(tt * 30)), [t]);
    const f = path.join(tmp, `${scene}_${t.toFixed(2)}.png`);
    await page.locator('#out').screenshot({ path: f });
    files.push([f, `${scene} @${t}s`]);
  }
  await page.close();
}
await browser.close();
srv.close();
// tile with python/PIL (labels)
const py = `
import sys, json
from PIL import Image, ImageDraw
items = json.loads(sys.argv[1]); out = sys.argv[2]; cols = int(sys.argv[3])
ims = [Image.open(f) for f, _ in items]
w, h = ims[0].size
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * w, rows * (h + 22)), (20, 20, 20))
d = ImageDraw.Draw(sheet)
for i, (im, (_, lab)) in enumerate(zip(ims, items)):
    x, y = (i % cols) * w, (i // cols) * (h + 22)
    sheet.paste(im, (x, y + 22)); d.text((x + 6, y + 5), lab, fill=(230, 230, 230))
sheet.save(out)
`;
execFileSync('python3', ['-c', py, JSON.stringify(files), out, String(args.cols || 3)]);
console.log(out);
