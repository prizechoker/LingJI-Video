// Preview one film shot (video/shots/<scene>.js) through the real film page: fonts, overlays, grain and all.
// usage: node tools/shot.mjs <scene> <t1,t2,...> [scale] ['{"dur":6,"p":{...},"cues":{...},"subs":[...]}']
//   -> out/lab/<scene>_<t>.png   (add "--video out.mp4 --fps 30" after the json to render the whole shot as a clip)
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { serve } from './server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [scene, ts = '0', scale = '0.5', json = '{}', ...rest] = process.argv.slice(2);
const opt = JSON.parse(json);
const video = rest[0] === '--video' ? path.resolve(ROOT, rest[1]) : null;
const fps = rest[2] === '--fps' ? +rest[3] : 30;
const dur = opt.dur ?? 6;
const timeline = {
  fps, duration: dur, grain: opt.grain,
  shots: [{ id: 'x', scene, start: 0, end: dur, p: opt.p || {}, cues: opt.cues || {} }],
  subtitles: opt.subs || [], chapters: opt.chapters || [],
};
const { srv, port } = await serve(ROOT);
const b = await chromium.launch({ args: ['--disable-gpu-vsync', '--ignore-gpu-blocklist'] });
const W = Math.round(1920 * +scale), H = Math.round(1080 * +scale);
const page = await b.newPage({ viewport: { width: W, height: H } });
page.on('console', (m) => { if (['error', 'warning', 'log'].includes(m.type()) && !/GL Driver|GPU stall|GroupMarker|swiftshader/i.test(m.text())) console.log('[page]', m.text().slice(0, 400)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/engine2/film.html?scale=${scale}`);
await page.evaluate((tl) => window.__init({ timeline: tl }), timeline);
const canvas = page.locator('#out');
fs.mkdirSync(path.join(ROOT, 'out/lab'), { recursive: true });
if (video) {
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', video], { stdio: ['pipe', 'inherit', 'inherit'] });
  const n = Math.round(dur * fps);
  const t0 = Date.now();
  for (let f = 0; f < n; f++) {
    await page.evaluate(([t, fi]) => window.__frame(t, fi), [f / fps, f]);
    if (!ff.stdin.write(await canvas.screenshot({ type: 'png' }))) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log(video, `${n} frames, ${((Date.now() - t0) / n / 1000).toFixed(2)} s/frame`);
} else {
  for (const t of ts.split(',').map(Number)) {
    const t0 = Date.now();
    await page.evaluate(([tt, fi]) => window.__frame(tt, fi), [t, Math.round(t * fps)]);
    const f = path.join(ROOT, `out/lab/${scene}_${t.toFixed(2)}.png`);
    await canvas.screenshot({ path: f });
    console.log(f, `${Date.now() - t0} ms`);
  }
}
await b.close();
srv.close();
