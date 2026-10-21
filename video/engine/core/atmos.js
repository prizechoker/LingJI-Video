// Atmosphere: slow drifting dust motes with parallax and soft bokeh, tinted per shot (cool / warm).
import { PAL, rgba } from './stage.js';
import { rng, noise2 } from './math.js';

const R = rng(2024);
const MOTES = Array.from({ length: 140 }, () => ({
  x: R() * 1920, y: R() * 1080, z: 0.2 + R() * 0.8, ph: R() * 100, sz: R(),
}));

export function drawAtmos(pen, t, tint = 'cool', amount = 1) {
  if (amount <= 0) return;
  const col = tint === 'warm' ? [255, 214, 170] : [170, 214, 255];
  const g = pen.glow;
  const m = pen.main;
  for (const p of MOTES) {
    // drift: slow upward + noise sway; nearer motes (small z) move faster and blur more
    const speed = 6 + 22 * (1 - p.z);
    let x = p.x + noise2(p.ph, t * 0.07) * 60 + t * speed * 0.35;
    let y = p.y - t * speed + noise2(p.ph + 7, t * 0.05) * 40;
    x = ((x % 2020) + 2020) % 2020 - 50;
    y = ((y % 1180) + 1180) % 1180 - 50;
    const near = 1 - p.z;
    const r = 0.9 + p.sz * 1.6 + near * near * 9;
    const tw = 0.6 + 0.4 * Math.sin(t * (0.5 + p.sz) + p.ph);
    const a = amount * tw * (0.05 + 0.16 * p.z * p.z + (near > 0.75 ? 0.05 : 0));
    const ctx = near > 0.7 ? g : m; // big near motes only in the bloom layer = soft bokeh
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, rgba(col, a));
    gr.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}
