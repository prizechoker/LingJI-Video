// Render still frames for review.
// usage: node tools/still.mjs --proto handtest --t 0,1.5,3 --scale 0.5 --out out/stills/hand
//        node tools/still.mjs --t 12.4,30 --scale 0.5          (film timeline)
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
const scale = parseFloat(args.scale || '0.5');
const times = String(args.t || '0').split(',').map(Number);
const out = path.resolve(ROOT, args.out || 'out/stills/still');
fs.mkdirSync(path.dirname(out), { recursive: true });

const { srv, port } = await serve(ROOT);
const browser = await chromium.launch({ args: ['--disable-web-security'] });
const page = await browser.newPage({ viewport: { width: Math.round(1920 * scale), height: Math.round(1080 * scale) } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/engine/index.html?scale=${scale}`);
const init = {};
if (args.proto) { init.proto = args.proto; init.protoDur = parseFloat(args.dur || '10'); }
if (args.params) init.protoParams = JSON.parse(args.params);
if (args.timeline) init.timeline = args.timeline;
await page.evaluate((o) => window.__init(o), init);
for (const t of times) {
  await page.evaluate(([tt, f]) => window.__frame(tt, f), [t, Math.round(t * 30)]);
  const f = `${out}_${t.toFixed(2)}.png`;
  await page.locator('#out').screenshot({ path: f });
  console.log(f);
}
await browser.close();
srv.close();
