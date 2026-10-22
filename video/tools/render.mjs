// Render the film (or a time range) with parallel headless-Chromium workers, streaming PNG frames into ffmpeg.
// usage: node tools/render.mjs --scale 1 --fps 24 --workers 2 --out out/film_1080.mp4 [--from 0 --to 20]
//        [--timeline timeline.json] [--crf 14] [--page engine2/film.html] [--seg 240] [--resume 1]
// Each worker renders a contiguous run of frames on one page (shots stay built across segments) and closes an
// ffmpeg segment every --seg frames; finished segments are marked .done, so an interrupted render resumes with
// --resume 1 (only unfinished segments are redone).
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
const workers = parseInt(args.workers || '2', 10);
const out = path.resolve(ROOT, args.out || 'out/film.mp4');
const crf = args.crf || '14';
const PAGE = args.page || 'engine2/film.html';
const SEG = parseInt(args.seg || '240', 10);
const tmpDir = path.join(path.dirname(out), `.seg_${path.basename(out, '.mp4')}`);
if (!args.resume) fs.rmSync(tmpDir, { recursive: true, force: true });
fs.mkdirSync(tmpDir, { recursive: true });

const { srv, port } = await serve(ROOT);
const probeB = await chromium.launch();
const probe = await probeB.newPage({ viewport: { width: 64, height: 36 } });
await probe.goto(`http://127.0.0.1:${port}/${PAGE}?scale=0.05`);
const info = await probe.evaluate((o) => window.__init(o), { timeline: args.timeline || 'timeline.json' });
await probeB.close();
const fps = parseFloat(args.fps || info.fps || 24);
const t0 = parseFloat(args.from || '0');
const t1 = Math.min(parseFloat(args.to || String(info.duration)), info.duration);
const f0 = Math.round(t0 * fps), f1 = Math.round(t1 * fps);
const total = f1 - f0;
const segs = [];
for (let a = f0; a < f1; a += SEG) segs.push([a, Math.min(f1, a + SEG)]);
const segFile = (i) => path.join(tmpDir, `seg_${String(i).padStart(4, '0')}.mp4`);
const todo = segs.filter((_, i) => !fs.existsSync(segFile(i) + '.done')).length;
console.log(`render ${t0}s..${t1}s = ${total} frames @${fps}fps, scale ${scale}, ${workers} workers, ${segs.length} segments (${todo} to do)`);

const W = Math.round(1920 * scale), H = Math.round(1080 * scale);
const started = Date.now();
let done = 0;
const todoFrames = segs.reduce((n, [a, b], i) => n + (fs.existsSync(segFile(i) + '.done') ? 0 : b - a), 0);

async function worker(k, first, last) {
  let browser = null, page = null;
  for (let i = first; i < last; i++) {
    const seg = segFile(i);
    if (fs.existsSync(seg + '.done')) continue;
    if (!page) {
      browser = await chromium.launch({ args: ['--disable-gpu-vsync'] });
      page = await browser.newPage({ viewport: { width: W, height: H } });
      page.on('pageerror', (e) => console.log(`[w${k} pageerror]`, e.message));
      page.on('console', (m) => { if (m.type() === 'error') console.log(`[w${k}]`, m.text().slice(0, 300)); });
      await page.goto(`http://127.0.0.1:${port}/${PAGE}?scale=${scale}`);
      await page.evaluate((o) => window.__init(o), { timeline: args.timeline || 'timeline.json' });
    }
    const [a, b] = segs[i];
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', crf, '-pix_fmt', 'yuv420p', '-tune', 'film', seg], { stdio: ['pipe', 'inherit', 'inherit'] });
    const canvas = page.locator('#out');
    const ts = Date.now();
    for (let f = a; f < b; f++) {
      await page.evaluate(([tt, fi]) => window.__frame(tt, fi), [f / fps, f]);
      const buf = await canvas.screenshot({ type: 'png' });
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      done++;
    }
    ff.stdin.end();
    await new Promise((r) => ff.on('close', r));
    fs.writeFileSync(seg + '.done', '');
    const el = (Date.now() - started) / 1000;
    console.log(`  w${k} seg ${i} [${(a / fps).toFixed(1)}s..${(b / fps).toFixed(1)}s] ${((Date.now() - ts) / 1000 / (b - a)).toFixed(2)} s/frame | ${done}/${todoFrames} frames, eta ${((todoFrames - done) / (done / el) / 60).toFixed(0)} min`);
  }
  if (browser) await browser.close();
}

// contiguous blocks of segments per worker, balanced by remaining frames
const per = Math.ceil(segs.length / workers);
await Promise.all(Array.from({ length: workers }, (_, k) => worker(k, k * per, Math.min(segs.length, (k + 1) * per))));
srv.close();
const list = path.join(tmpDir, 'list.txt');
fs.writeFileSync(list, segs.map((_, i) => `file '${segFile(i)}'`).join('\n'));
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out]);
console.log(`done -> ${out} in ${((Date.now() - started) / 60000).toFixed(1)} min`);
