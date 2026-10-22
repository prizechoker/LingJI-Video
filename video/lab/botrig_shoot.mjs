// Render lab/sf_botrig.js frames to PNG: node lab/botrig_shoot.mjs <out-prefix> <scale> <params-json>
// Renders one image per entry of params.poses: <out-prefix>_<i>.png (the prefix relative to video/).
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '../tools/server.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [prefix, scale = '0.5', params = '{}'] = process.argv.slice(2);
const P = JSON.parse(params);
const n = (P.shots || P.poses || ['rest']).length;
const { srv, port } = await serve(ROOT);
const b = await chromium.launch({ args: ['--disable-gpu-vsync', '--ignore-gpu-blocklist'] });
const W = Math.round(1920 * +scale), H = Math.round(1080 * +scale);
const p = await b.newPage({ viewport: { width: W, height: H } });
p.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/GL Driver|GPU stall|fallback to software/.test(m.text())) console.log('[page]', m.text().slice(0, 1500)); });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto(`http://127.0.0.1:${port}/lab/page.html?scene=sf_botrig&scale=${scale}&p=${encodeURIComponent(params)}`);
await p.waitForFunction(() => window.__ready || window.__error, null, { timeout: 300000 });
const err = await p.evaluate(() => window.__error);
if (err) { console.log('SETUP ERROR', err); process.exit(1); }
fs.mkdirSync(path.dirname(path.resolve(ROOT, prefix)), { recursive: true });
for (let i = 0; i < n; i++) {
  await p.evaluate((tt) => window.__frame(tt), i);
  const f = path.resolve(ROOT, `${prefix}_${i}.png`);
  await p.locator('canvas').screenshot({ path: f });
  console.log(f);
}
await b.close();
srv.close();
