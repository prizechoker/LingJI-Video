// Render the film (or a time range) with parallel headless-Chromium workers, streaming PNG frames into ffmpeg.
// usage: node tools/render.mjs --scale 1 --fps 30 --workers 3 --out out/film_1080.mp4 [--from 0 --to 20] [--timeline timeline.json] [--crf 14]
//        [--page engine2/film.html] (the realistic film; default engine/index.html, the v1 film)
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { serve } from './server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]]);
  return acc;
}, []));
const scale = parseFloat(args.scale || '1');
const workers = parseInt(args.workers || '3', 10);
const out = path.resolve(ROOT, args.out || 'out/film.mp4');
const crf = args.crf || '14';
const PAGE = args.page || 'engine/index.html';
const tmpDir = path.join(path.dirname(out), `.seg_${path.basename(out, '.mp4')}`);
if (!args.resume) fs.rmSync(tmpDir, { recursive: true, force: true });
fs.mkdirSync(tmpDir, { recursive: true });

const { srv, port } = await serve(ROOT);
// read duration/fps from a probe page
const probeB = await chromium.launch();
const probe = await probeB.newPage({ viewport: { width: 64, height: 36 } });
await probe.goto(`http://127.0.0.1:${port}/${PAGE}?scale=0.05`);
const info = await probe.evaluate((o) => window.__init(o), { timeline: args.timeline || 'timeline.json' });
await probeB.close();
const fps = parseFloat(args.fps || info.fps || 30);
const t0 = parseFloat(args.from || '0');
const t1 = Math.min(parseFloat(args.to || String(info.duration)), info.duration);
const f0 = Math.round(t0 * fps), f1 = Math.round(t1 * fps);
const total = f1 - f0;
console.log(`render ${t0}s..${t1}s = ${total} frames @${fps}fps, scale ${scale}, ${workers} workers`);

const W = Math.round(1920 * scale), H = Math.round(1080 * scale);
const started = Date.now();
let done = 0;
async function worker(k, a, b) {
  const seg = path.join(tmpDir, `seg_${String(k).padStart(2, '0')}.mp4`);
  if (fs.existsSync(seg + '.done')) return seg;
  const browser = await chromium.launch({ args: ['--disable-gpu-vsync'] });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => console.log(`[w${k} pageerror]`, e.message));
  await page.goto(`http://127.0.0.1:${port}/${PAGE}?scale=${scale}`);
  await page.evaluate((o) => window.__init(o), { timeline: args.timeline || 'timeline.json' });
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', crf, '-pix_fmt', 'yuv420p', '-tune', 'film', seg], { stdio: ['pipe', 'inherit', 'inherit'] });
  const canvas = page.locator('#out');
  for (let f = a; f < b; f++) {
    await page.evaluate(([tt, fi]) => window.__frame(tt, fi), [f / fps, f]);
    const buf = await canvas.screenshot({ type: 'png' });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    done++;
    if (done % 60 === 0) {
      const el = (Date.now() - started) / 1000;
      console.log(`  ${done}/${total} frames  ${(done / el).toFixed(2)} fps  eta ${((total - done) / (done / el) / 60).toFixed(1)} min`);
    }
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  await browser.close();
  fs.writeFileSync(seg + '.done', '');
  return seg;
}
const per = Math.ceil(total / workers);
const segs = await Promise.all(Array.from({ length: workers }, (_, k) => worker(k, f0 + k * per, Math.min(f1, f0 + (k + 1) * per))));
srv.close();
const list = path.join(tmpDir, 'list.txt');
fs.writeFileSync(list, segs.map((s) => `file '${s}'`).join('\n'));
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out]);
console.log(`done -> ${out} in ${((Date.now() - started) / 60000).toFixed(1)} min`);
