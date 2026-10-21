// Title card: an ordered board (cool) floating in a warm, irregular world. 《棋盘之外》
import { PAL, rgba } from '../core/stage.js';
import { line, text, glowText, FONT, lightDot } from '../core/draw.js';
import { clamp, smoothstep, ease, prog, rng, noise2, lerp } from '../core/math.js';

const R = rng(42);
// warm organic strokes outside the board (pre-generated, deterministic)
const STROKES = Array.from({ length: 70 }, () => {
  let a = R() * Math.PI * 2, rr = 330 + R() * 620;
  const pts = [];
  let x = 960 + Math.cos(a) * rr * 1.25, y = 520 + Math.sin(a) * rr * 0.72;
  let dir = R() * Math.PI * 2;
  const n = 6 + Math.floor(R() * 10);
  for (let k = 0; k < n; k++) {
    pts.push([x, y]);
    dir += (R() - 0.5) * 1.1;
    const step = 8 + R() * 16;
    x += Math.cos(dir) * step;
    y += Math.sin(dir) * step;
  }
  return { pts, ph: R() * 6.28, sp: 0.2 + R() * 0.5 };
});

export function draw(pen, t, p) {
  const c = p.cue || {};
  const tTitle = c.title ?? 1.0;
  const dur = p.dur || 5;
  const out = 1 - smoothstep(dur - 0.6, dur, t);
  const cx = 960, cy = 500, size = 470, step = size / 18;
  const grow = prog(t, 0, 1.1, ease.outCubic);
  // board grid (flat, top-down) growing from the centre
  for (let k = 0; k < 19; k++) {
    const off = (k - 9) * step;
    const span = (size / 2) * grow;
    const ga = 0.5 * out * (k === 0 || k === 18 ? 1.4 : 1);
    line(pen, cx - span, cy + off, cx + span, cy + off, { color: PAL.cool, a: ga * smoothstep(9, 0, Math.abs(k - 9) - grow * 9), w: 1.2, glow: 0.6, glowColor: PAL.cyan });
    line(pen, cx + off, cy - span, cx + off, cy + span, { color: PAL.cool, a: ga * smoothstep(9, 0, Math.abs(k - 9) - grow * 9), w: 1.2, glow: 0.6, glowColor: PAL.cyan });
  }
  // the world outside: warm, irregular, slowly breathing
  const wa = smoothstep(tTitle - 0.6, tTitle + 1.2, t) * out;
  if (wa > 0) {
    for (const s of STROKES) {
      const drift = noise2(s.ph, t * s.sp) * 6;
      const pts = s.pts.map(([x, y]) => [x + drift, y + noise2(x * 0.01, t * 0.3 + s.ph) * 4]);
      // skip strokes that would overlap the board
      if (Math.abs(pts[0][0] - cx) < size * 0.62 && Math.abs(pts[0][1] - cy) < size * 0.62) continue;
      const fl = 0.55 + 0.45 * Math.sin(t * 0.9 + s.ph);
      for (let k = 1; k < pts.length; k++) line(pen, pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], { color: PAL.warm, a: wa * 0.33 * fl, w: 1.3, glow: 0.7 });
    }
  }
  // darken behind the title for legibility
  const ta = smoothstep(tTitle, tTitle + 0.9, t) * out;
  if (ta > 0) {
    const ui = pen.ui;
    const g = ui.createRadialGradient(cx, cy, 0, cx, cy, 420);
    g.addColorStop(0, `rgba(3,5,8,${0.78 * ta})`);
    g.addColorStop(1, 'rgba(3,5,8,0)');
    ui.fillStyle = g;
    ui.fillRect(cx - 600, cy - 420, 1200, 840);
    const track = lerp(46, 22, ease.outCubic(clamp((t - tTitle) / 1.6)));
    glowText(pen, '棋盘之外', cx + track * 1.5, cy - 6, { size: 128, font: FONT.serif, weight: 800, color: [246, 240, 230], glowColor: PAL.warm, glow: 0.45, a: ta, spacing: track, align: 'center' });
    // copy also into ui so it sits above the darkening plate
    text(pen.ui, '棋盘之外', cx + track * 1.5, cy - 6, { size: 128, font: FONT.serif, weight: 800, color: [246, 240, 230], a: ta, spacing: track });
    const sa = smoothstep(tTitle + 0.6, tTitle + 1.4, t) * out;
    text(pen.ui, '机器人发展史 · 第 1 集', cx, cy + 108, { size: 28, font: FONT.serif, weight: 500, color: [214, 206, 194], a: sa, spacing: 6 });
    text(pen.ui, 'BEYOND THE BOARD', cx, cy + 156, { size: 15, font: FONT.mono, weight: 500, color: PAL.dim, a: sa * 0.9, spacing: 9 });
  }
}
