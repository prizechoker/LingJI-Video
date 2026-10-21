// U19: can't change the world -> change the robot. The board's lines lift off and reassemble into a humanoid figure.
import { PAL } from '../core/stage.js';
import { line, text, FONT, lightDot } from '../core/draw.js';
import { clamp, lerp, smoothstep, ease, rng } from '../core/math.js';

// humanoid figure (front view) as straight segments around (960, 560), ~620px tall
const FIG = (() => {
  const S = [];
  const seg = (a, b) => S.push([a, b]);
  const poly = (pts, closed = true) => { for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) seg(pts[i], pts[(i + 1) % pts.length]); };
  const cx = 960, top = 250;
  poly([[cx - 42, top], [cx + 42, top], [cx + 52, top + 40], [cx + 42, top + 92], [cx - 42, top + 92], [cx - 52, top + 40]]); // head
  poly([[cx - 30, top + 100], [cx + 30, top + 100], [cx + 30, top + 118], [cx - 30, top + 118]]); // neck
  poly([[cx - 120, top + 126], [cx + 120, top + 126], [cx + 98, top + 330], [cx - 98, top + 330]]); // torso
  poly([[cx - 92, top + 340], [cx + 92, top + 340], [cx + 82, top + 390], [cx - 82, top + 390]]); // pelvis
  for (const s of [-1, 1]) {
    poly([[cx + s * 126, top + 132], [cx + s * 170, top + 140], [cx + s * 182, top + 300], [cx + s * 146, top + 300]]); // upper arm
    poly([[cx + s * 148, top + 308], [cx + s * 182, top + 308], [cx + s * 190, top + 450], [cx + s * 160, top + 450]]); // forearm
    poly([[cx + s * 158, top + 458], [cx + s * 194, top + 458], [cx + s * 196, top + 500], [cx + s * 160, top + 500]]); // hand
    poly([[cx + s * 20, top + 398], [cx + s * 86, top + 398], [cx + s * 80, top + 590], [cx + s * 28, top + 590]]); // thigh
    poly([[cx + s * 28, top + 598], [cx + s * 80, top + 598], [cx + s * 76, top + 780], [cx + s * 34, top + 780]]); // shin
    poly([[cx + s * 26, top + 788], [cx + s * 96, top + 788], [cx + s * 100, top + 812], [cx + s * 22, top + 812]]); // foot
  }
  return S;
})();

// board segments: a flat 19x19 board, cut into the same number of pieces
const BOARD = (() => {
  const out = [];
  const n = 19, st = 34, ox = 960 - (n - 1) * st / 2, oy = 560 - (n - 1) * st / 2;
  const R = rng(5);
  const all = [];
  for (let i = 0; i < n; i++) for (let k = 0; k < n - 1; k++) {
    all.push([[ox + k * st, oy + i * st], [ox + (k + 1) * st, oy + i * st]]);
    all.push([[ox + i * st, oy + k * st], [ox + i * st, oy + (k + 1) * st]]);
  }
  // keep one board piece per figure segment, spread over the board
  for (let i = 0; i < FIG.length; i++) out.push(all[Math.floor((i / FIG.length) * all.length + R() * 6) % all.length]);
  return { out, all };
})();

export function draw(pen, t, p) {
  const c = p.cue || {};
  const dur = p.dur || 6;
  const tLift = c.lift ?? 2.4; // "改不了世界"
  const tRobot = c.robot ?? 3.8; // "那就改机器人"
  const fade = 1 - smoothstep(dur - 0.4, dur, t);
  // the full board fades as its pieces lift away
  const lift = smoothstep(tLift - 0.4, tLift + 0.4, t);
  for (const [a, b] of BOARD.all) line(pen, a[0], a[1], b[0], b[1], { color: PAL.cool, a: 0.32 * (1 - lift) * fade, w: 1.1, glow: 0.4, glowColor: PAL.cyan });
  // moving pieces: board -> figure, staggered, with a slight lift arc
  FIG.forEach((f, i) => {
    const b = BOARD.out[i];
    const st = tLift + (i / FIG.length) * 1.0;
    const u = ease.inOutCubic(clamp((t - st) / 1.1));
    if (t < st - 0.01 && lift < 0.5) return;
    const arcH = Math.sin(Math.PI * u) * 60;
    const a0 = [lerp(b[0][0], f[0][0], u), lerp(b[0][1], f[0][1], u) - arcH];
    const a1 = [lerp(b[1][0], f[1][0], u), lerp(b[1][1], f[1][1], u) - arcH];
    const col = u > 0.98 ? PAL.cyan : PAL.cool;
    line(pen, a0[0], a0[1], a1[0], a1[1], { color: col, a: (0.5 + 0.5 * u) * fade, w: 1.6 + 0.6 * u, glow: 0.5 + 0.6 * u, glowColor: PAL.cyan });
  });
  const ra = smoothstep(tRobot + 0.3, tRobot + 0.9, t) * fade;
  if (ra > 0) lightDot(pen, 960, 290, 60, PAL.cyan, 0.35 * ra);
  // words
  const wa = smoothstep(0.2, 0.7, t) * fade;
  text(pen.ui, '改造世界', 420, 520, { size: 44, font: FONT.serif, weight: 600, color: [190, 198, 208], a: wa * (1 - 0.6 * lift), spacing: 8 });
  if (lift > 0) line(pen, 330, 522, 330 + 180 * lift, 522, { color: PAL.dim, a: 0.8 * wa * lift, w: 2.5, glow: 0 });
  const ba = smoothstep(tRobot - 0.1, tRobot + 0.5, t) * fade;
  text(pen.ui, '改造机器人', 1500, 520, { size: 44, font: FONT.serif, weight: 700, color: [150, 214, 255], a: ba, spacing: 8 });
}
