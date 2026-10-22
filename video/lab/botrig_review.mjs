// The rigged robot's review set: the poses the film needs and close-ups of the joints, on the dark stage of
// lab/sf_bot.js (via lab/sf_botrig.js). Writes out/lab/botrig/review/<name>.png and contact sheets (sheet_*.png).
// usage: node lab/botrig_review.mjs [wide|close|all] [name-filter]
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '../tools/server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out/lab/botrig/review');
const [which = 'all', filter = ''] = process.argv.slice(2);

const RAISE = { armL: { shoulder: [2.3, 0.15, 0.45], elbow: 0.3, wrist: [-0.1, 0.4, 0], fingers: 0.05, spread: 0.3 },
  armR: { shoulder: [2.3, 0.15, 0.45], elbow: 0.3, wrist: [-0.1, 0.4, 0], fingers: 0.05, spread: 0.3 } };
const BEND = { armL: { shoulder: [0.5, 0.2, 0.15], elbow: 2.1, fingers: 0.3 }, armR: { shoulder: [0.5, 0.2, 0.15], elbow: 2.1, fingers: 0.3 } };
const TWIST = { armL: { shoulder: [0.25, 0, 0.1], elbow: 1.57, wrist: [0, -1.4, 0], fingers: 0.1 }, armR: { shoulder: [0.25, 0, 0.1], elbow: 1.57, wrist: [0, 1.4, 0], fingers: 0.1 } };
const SQUAT = { root: { pos: [0, -0.33, -0.06], rot: [0.45, 0, 0] }, spine: [0.15, 0, 0], chest: [0.05, 0, 0], neck: [-0.3, 0, 0], head: [-0.25, 0, 0],
  legL: { hip: [1.75, 0.2, 0.18], knee: 2.0, ankle: [0.38, 0, 0] }, legR: { hip: [1.75, 0.2, 0.18], knee: 2.0, ankle: [0.38, 0, 0] },
  armL: { shoulder: [1.1, 0.1, 0.1], elbow: 0.5, fingers: 0.3 }, armR: { shoulder: [1.1, 0.1, 0.1], elbow: 0.5, fingers: 0.3 } };
const LOOK = { neck: [-0.2, 0.45, 0.05], head: [-0.25, 0.55, 0.12], chest: [0, 0.1, 0] };
const FIST = { armL: { shoulder: [0.9, 0.3, 0.15], elbow: 1.45, wrist: [0, 0.3, 0], fingers: 1, thumb: 1 }, armR: { shoulder: [0.9, 0.3, 0.15], elbow: 1.45, wrist: [0, 0.3, 0], fingers: 0.55, thumb: 0.5, spread: 0.4 } };
const UATWIST = { armL: { shoulder: [0.3, 0.9, 0.2], elbow: 1.57, fingers: 0.3 }, armR: { shoulder: [0.3, -0.7, 0.25], elbow: 1.57, fingers: 0.3 } };
const DANCE = { root: { pos: [0.02, -0.035, 0], rot: [0.04, 0.18, 0.03] }, spine: [0.02, 0.1, 0.02], chest: [0, 0.08, 0], head: [-0.05, -0.12, 0], // (shots/gala.js at a beat's peak)
  armL: { shoulder: [2.5, 0, 0.73], elbow: 0.15, wrist: [0.1, 0, 0], fingers: -0.15, spread: 0.6 }, armR: { shoulder: [0.2, 0, 0.18], elbow: 0.35, wrist: [0.1, 0, 0], fingers: -0.15, spread: 0.6 },
  legL: { hip: [0.12, 0.05, 0.06], knee: 0.22, ankle: [0.08, 0, 0] }, legR: { hip: [0.12, 0.05, 0.06], knee: 0.22, ankle: [0.08, 0, 0] } };
const COUNTER = { pos: [0, 0.88, 0.62], w: 1.4, d: 0.6 };
const REACH = { side: 'R', target: [-0.1, 0.97, 0.34], point: 'grip', wrist: [0.15, 0.5, 0.1] };

const C = (pos, look, fov) => ({ pos, look, fov });
const WIDE = [
  ['rest_front', 'rest', { cam: 'full', yaw: 0.22 }],
  ['rest_side', 'rest', { camera: C([5.4, 0.92, 0.6], [0, 0.87, 0], 23), yaw: 0 }],
  ['idle_0', 'idle:0', { camera: C([2.2, 1.1, 4.6], [0, 0.88, 0], 23), yaw: 0 }],
  ['idle_5', 'idle:5', { camera: C([2.2, 1.1, 4.6], [0, 0.88, 0], 23), yaw: 0 }],
  ['walk_000', 'walk:0', { camera: C([4.6, 0.95, 0.4], [0, 0.85, 0.05], 23), yaw: 0 }],
  ['walk_025', 'walk:0.25', { camera: C([4.6, 0.95, 0.4], [0, 0.85, 0.05], 23), yaw: 0 }],
  ['walk_050', 'walk:0.5', { camera: C([4.6, 0.95, 0.4], [0, 0.85, 0.05], 23), yaw: 0 }],
  ['walk_075', 'walk:0.75', { camera: C([4.6, 0.95, 0.4], [0, 0.85, 0.05], 23), yaw: 0 }],
  ['walk_front', 'walk:0.1', { camera: C([0.6, 1.0, 4.6], [0, 0.85, 0], 23), yaw: 0 }],
  ['run_side', 'run:0.42', { camera: C([4.3, 0.95, 0.3], [0, 0.88, 0.05], 22), yaw: 0 }],
  ['run_f34', 'run:0.42', { camera: C([3.0, 1.05, 3.2], [0, 0.88, 0.05], 22), yaw: 0 }],
  ['run_front', 'run:0.42', { camera: C([-0.4, 1.0, 4.4], [0, 0.88, 0.0], 22), yaw: 0 }],
  ['reach_f34', 'idle:0', { camera: C([-2.4, 1.45, 2.4], [-0.05, 1.0, 0.2], 26), yaw: 0, reach: REACH, counter: COUNTER }],
  ['reach_side', 'idle:0', { camera: C([-3.4, 1.15, 0.5], [0, 1.0, 0.25], 24), yaw: 0, reach: REACH, counter: COUNTER }],
  ['raise_front', RAISE, { camera: C([0.6, 1.2, 4.8], [0, 1.05, 0], 26), yaw: 0 }],
  ['raise_back', RAISE, { camera: C([-1.2, 1.3, -4.4], [0, 1.1, 0], 26), yaw: 0 }],
];
const CLOSE = [
  ['cu_raise_shoulders', RAISE, { camera: C([0.5, 1.5, 1.5], [0, 1.4, 0], 32), yaw: 0 }],
  ['cu_raise_armpit', RAISE, { camera: C([1.2, 1.25, 0.9], [0.1, 1.35, 0], 30), yaw: 0 }],
  ['cu_raise_back', RAISE, { camera: C([-0.4, 1.5, -1.5], [0, 1.4, 0], 32), yaw: 0 }],
  ['cu_reach_shoulder', 'idle:0', { camera: C([-1.1, 1.45, 1.0], [-0.12, 1.2, 0.15], 30), yaw: 0, reach: REACH, counter: COUNTER }],
  ['cu_elbow_bend', BEND, { camera: C([0.85, 1.2, -0.33], [0.25, 1.17, 0.12], 24), yaw: 0 }],
  ['cu_elbow_inside', BEND, { camera: C([0.75, 1.22, 0.6], [0.24, 1.2, 0.15], 24), yaw: 0 }],
  ['cu_twist', TWIST, { camera: C([0.0, 1.45, 1.0], [0, 1.2, 0.2], 30), yaw: 0 }],
  ['cu_fist', FIST, { camera: C([0.45, 1.55, 0.95], [0.1, 1.42, 0.34], 22), yaw: 0 }],
  ['cu_squat_knees', SQUAT, { camera: C([1.6, 0.7, 1.4], [0, 0.45, 0.15], 30), yaw: 0 }],
  ['cu_squat_hips', SQUAT, { camera: C([0.3, 0.8, 1.6], [0, 0.6, 0.1], 30), yaw: 0 }],
  ['cu_run_hips', 'run:0.42', { camera: C([1.4, 0.95, 1.3], [0, 0.75, 0.05], 30), yaw: 0 }],
  ['cu_run_back', 'run:0.42', { camera: C([-1.0, 1.0, -1.6], [0, 0.8, 0], 30), yaw: 0 }],
  ['cu_run_shoes', 'run:0.36', { camera: C([1.3, 0.3, 0.5], [0, 0.15, -0.1], 30), yaw: 0 }],
  ['cu_contact_shoes', 'run:0.1', { camera: C([1.3, 0.3, 0.5], [0, 0.15, 0.0], 30), yaw: 0 }],
  ['cu_look_neck', LOOK, { camera: C([0.6, 1.55, 1.1], [0, 1.48, 0], 30), yaw: 0 }],
  ['cu_run_upper', 'run:0.42', { camera: C([1.6, 1.35, 1.2], [0, 1.2, 0.05], 30), yaw: 0 }],
  ['cu_uatwist', UATWIST, { camera: C([0.0, 1.35, 1.5], [0, 1.15, 0.1], 32), yaw: 0 }],
  ['cu_dance', DANCE, { camera: C([0.2, 1.45, 1.2], [0.1, 1.4, 0], 28), yaw: 0 }],
  ['cu_hand_fist', { armL: { shoulder: [0.5, 0, 0.1], elbow: 1.0, wrist: [0, -1.0, 0], fingers: 1, thumb: 1 } }, { camera: C([0.45, 1.42, 0.75], [0.21, 1.22, 0.42], 20), yaw: 0 }],
  ['cu_hand_half', { armL: { shoulder: [0.5, 0, 0.1], elbow: 1.0, wrist: [0, -1.0, 0], fingers: 0.5, thumb: 0.6, spread: 0.4 } }, { camera: C([0.0, 1.3, 0.75], [0.21, 1.22, 0.42], 20), yaw: 0 }],
];

async function render(list, scale, extra = {}) {
  const shots = list.filter(([n]) => n.includes(filter));
  if (!shots.length) return [];
  const params = { shots: shots.map(([, pose, o]) => ({ pose, ...o })), key: 6, keyPos: [2.5, 2.2, 3.0], ...extra };
  const { srv, port } = await serve(ROOT);
  const b = await chromium.launch({ args: ['--disable-gpu-vsync', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: Math.round(1920 * scale), height: Math.round(1080 * scale) } });
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/GL Driver|GPU stall|fallback to software/.test(m.text())) console.log('[page]', m.text().slice(0, 600)); });
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p.goto(`http://127.0.0.1:${port}/lab/page.html?scene=sf_botrig&scale=${scale}&p=${encodeURIComponent(JSON.stringify(params))}`);
  await p.waitForFunction(() => window.__ready || window.__error, null, { timeout: 300000 });
  const err = await p.evaluate(() => window.__error);
  if (err) throw new Error(err);
  fs.mkdirSync(OUT, { recursive: true });
  const files = [];
  for (let i = 0; i < shots.length; i++) {
    await p.evaluate((t) => window.__frame(t), i);
    const f = path.join(OUT, `${shots[i][0]}.png`);
    await p.locator('canvas').screenshot({ path: f });
    console.log(f);
    files.push(f);
  }
  await b.close();
  srv.close();
  return files;
}

function sheet(name, files, cols) {
  if (!files.length) return;
  const py = `import sys\nfrom PIL import Image\nims=[Image.open(f) for f in sys.argv[3:]]\nw,h=ims[0].size\nc=int(sys.argv[2])\nr=(len(ims)+c-1)//c\nS=Image.new('RGB',(w*c,h*r))\nfor i,im in enumerate(ims): S.paste(im,((i%c)*w,(i//c)*h))\nS.save(sys.argv[1])`;
  execFileSync('python3', ['-c', py, path.join(OUT, `sheet_${name}.png`), String(cols), ...files]);
}

if (which === 'wide' || which === 'all') sheet('wide', await render(WIDE, 0.5), 4);
if (which === 'close' || which === 'all') sheet('close', await render(CLOSE, 0.75), 4);
