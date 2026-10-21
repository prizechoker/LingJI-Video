// U22: the same motion repeated thirty thousand times on a track vs. a stack of bowls that differs every time.
import { PAL, rgba } from '../core/stage.js';
import { line, text, FONT, label, polyline } from '../core/draw.js';
import { clamp, lerp, smoothstep, ease, rng, noise2 } from '../core/math.js';

export function draw(pen, t, p) {
  const c = p.cue || {};
  const dur = p.dur || 7;
  const tBowls = c.bowls ?? 2.6; // "和面对一摞每次都不一样的碗"
  const tTwo = c.two ?? 5.2; // "是两回事"
  const fade = 1 - smoothstep(dur - 0.4, dur, t);
  // divider
  const dv = smoothstep(0, 0.5, t) * fade;
  line(pen, 960, 180, 960, 860, { color: PAL.dim, a: 0.35 * dv, w: 1, glow: 0 });
  // ---- left: the gait trace, perfectly periodic
  const la = smoothstep(0.1, 0.6, t) * fade;
  const x0 = 140, x1 = 880, yc = 470;
  for (const [amp, ph, col, yo] of [[70, 0, PAL.cyan, -60], [55, 1.2, PAL.cool, 70]]) {
    const pts = [];
    for (let x = x0; x <= x1; x += 4) {
      const u = (x - x0) / 90 + t * 3.0;
      pts.push([x, yc + yo + Math.sin(u + ph) * amp * (0.7 + 0.3 * Math.sin(2 * (u + ph)))]);
    }
    polyline(pen, pts, 1, { color: col, a: 0.85 * la, w: 2.2, glow: 0.8 });
  }
  text(pen.ui, '髋关节', x0, yc - 160, { size: 16, font: FONT.sans, weight: 500, color: PAL.dim, a: la, align: 'left', spacing: 2 });
  text(pen.ui, '膝关节', x0, yc + 170, { size: 16, font: FONT.sans, weight: 500, color: PAL.dim, a: la, align: 'left', spacing: 2 });
  const reps = Math.floor(30000 * ease.outCubic(clamp(t / (tBowls + 1.2))));
  text(pen.ui, `× ${reps.toLocaleString('en-US')}`, (x0 + x1) / 2, 300, { size: 54, font: FONT.mono, weight: 500, color: [150, 214, 255], a: la, spacing: 2 });
  text(pen.ui, '同一个动作', (x0 + x1) / 2, 790, { size: 30, font: FONT.serif, weight: 600, color: [150, 214, 255], a: la, spacing: 6 });
  // ---- right: bowls that never repeat
  const ra = smoothstep(tBowls - 0.2, tBowls + 0.4, t) * fade;
  if (ra > 0) {
    const cx = 1440;
    const changes = Math.floor((t - tBowls) * 3.2);
    const R = rng(77 + Math.max(0, changes) * 13);
    let y = 640;
    for (let k = 0; k < 5; k++) {
      const w = 140 + R() * 120, h = 28 + R() * 40, off = (R() - 0.5) * 40, tilt = (R() - 0.5) * 0.18;
      const pts = [];
      for (let s = 0; s <= 24; s++) {
        const u = s / 24;
        const bx = cx + off + (u - 0.5) * w;
        const by = y - Math.sin(Math.PI * u) * -h * 0.15 + (u - 0.5) * w * tilt;
        pts.push([bx, by + Math.pow(Math.abs(u - 0.5) * 2, 2.2) * -h + h]);
      }
      polyline(pen, pts, 1, { color: PAL.warm, a: ra * 0.9, w: 2.2, glow: 0.8 });
      line(pen, pts[0][0], pts[0][1], pts[pts.length - 1][0], pts[pts.length - 1][1], { color: PAL.warm, a: ra * 0.9, w: 2.2, glow: 0.8 });
      y -= h * 0.9 + 10;
    }
    text(pen.ui, `第 ${Math.max(1, changes + 1)} 次`, cx, 300, { size: 54, font: FONT.mono, weight: 500, color: [255, 205, 150], a: ra, spacing: 2 });
    text(pen.ui, '每次都不一样', cx, 790, { size: 30, font: FONT.serif, weight: 600, color: [255, 205, 150], a: ra, spacing: 6 });
  }
  // expert note, small
  const na = smoothstep(tTwo, tTwo + 0.5, t) * fade;
  text(pen.ui, '腿先于手：步态可以在仿真里反复练；手和物体的接触、摩擦、形变，仿真很难算准', 960, 880, { size: 17, font: FONT.sans, weight: 400, color: PAL.dim, a: na * 0.9, spacing: 1 });
}
