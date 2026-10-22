// Render lab scenes to PNG: node lab/shoot.mjs <scene> <t1,t2,...> [scale] [params-json]
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '../tools/server.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [scene, ts = '0', scale = '1', params = '{}'] = process.argv.slice(2);
const { srv, port } = await serve(ROOT);
const b = await chromium.launch({ args: ['--disable-gpu-vsync', '--ignore-gpu-blocklist'] });
const W = Math.round(1920 * +scale), H = Math.round(1080 * +scale);
const p = await b.newPage({ viewport: { width: W, height: H } });
p.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/GL Driver|GPU stall/.test(m.text())) console.log('[page]', m.text().slice(0, 1200)); });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto(`http://127.0.0.1:${port}/lab/page.html?scene=${scene}&scale=${scale}&p=${encodeURIComponent(params)}`);
await p.waitForFunction(() => window.__ready || window.__error, null, { timeout: 300000 });
const err = await p.evaluate(() => window.__error);
if (err) { console.log('SETUP ERROR', err); process.exit(1); }
for (const t of ts.split(',').map(Number)) {
  const t0 = Date.now();
  await p.evaluate((tt) => window.__frame(tt), t);
  const f = path.join(ROOT, `out/lab/${scene}_${t.toFixed(2)}.png`);
  await p.locator('canvas').screenshot({ path: f });
  console.log(f, `${Date.now() - t0} ms`);
}
await b.close();
srv.close();
