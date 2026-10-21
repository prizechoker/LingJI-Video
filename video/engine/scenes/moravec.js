// U07: Moravec's paradox as a balance: "chess, IQ tests" weigh nothing for a computer; "look, walk, grab" weigh a ton.
import { PAL, rgba } from '../core/stage.js';
import { line, text, label, FONT, lightDot, circle, polyline, arc } from '../core/draw.js';
import { clamp, lerp, smoothstep, ease, prog } from '../core/math.js';

// icon strokes in a 100x100 box centred at 0
const ICONS = {
  knight: [[[-28, 40], [28, 40]], [[-22, 40], [-18, 22], [22, 22], [26, 40]], [[-16, 22], [-14, 6], [-26, -6], [-24, -16], [-8, -30], [2, -42], [6, -30], [20, -24], [26, -8], [18, 4], [16, 22]], [[-6, -22], [-2, -18]]],
  puzzle: [[[-30, -30], [-6, -30], [-6, -38], [6, -38], [6, -30], [30, -30], [30, -6], [38, -6], [38, 6], [30, 6], [30, 30], [-30, 30], [-30, -30]]],
  eye: [[[-40, 0], [-20, -20], [0, -26], [20, -20], [40, 0], [20, 20], [0, 26], [-20, 20], [-40, 0]]],
  feet: [[[-22, 30], [-26, 10], [-20, -8], [-10, -10], [-6, 6], [-12, 28], [-22, 30]], [[10, 6], [6, -14], [12, -32], [22, -34], [26, -18], [20, 4], [10, 6]]],
  grab: [[[-30, 26], [-30, -6], [-22, -10], [-16, -4], [-16, -26], [-8, -30], [-2, -26], [-2, -32], [6, -34], [12, -28], [12, -26], [18, -28], [24, -22], [24, 6], [12, 30], [-30, 26]]],
};
function icon(pen, name, cx, cy, s, a, color) {
  for (const poly of ICONS[name]) {
    const pts = poly.map(([x, y]) => [cx + x * s, cy + y * s]);
    polyline(pen, pts, 1, { color, a, w: 2.2, glow: 0.7 });
  }
  if (name === 'eye') circle(pen, cx, cy, 10 * s, { color, a, w: 2.2, glow: 0.7 });
}

export function draw(pen, t, p) {
  const c = p.cue || {};
  const dur = p.dur || 11;
  const tName = 0, tSay = c.say ?? 2.6, tEasy = c.easy ?? 3.6, tHard = c.hard ?? 5.6, tLook = c.look ?? 7.4, tWalk = c.walk ?? 8.2, tGrab = c.grab ?? 9.0;
  // name card
  const na = smoothstep(0.1, 0.6, t) * (1 - smoothstep(tSay + 0.2, tSay + 0.8, t));
  if (na > 0) {
    text(pen.ui, '汉斯·莫拉维克', 960, 470, { size: 64, font: FONT.serif, weight: 700, color: [240, 234, 224], a: na, spacing: 6 });
    text(pen.ui, 'HANS MORAVEC', 960, 540, { size: 18, font: FONT.mono, weight: 500, color: PAL.dim, a: na, spacing: 10 });
    text(pen.ui, '当年斯坦福的博士生，后来成为卡内基梅隆大学的机器人学家', 960, 590, { size: 21, font: FONT.sans, weight: 400, color: [190, 198, 208], a: na * 0.9, spacing: 1 });
  }
  // the balance
  const ba = smoothstep(tSay - 0.1, tSay + 0.6, t);
  if (ba <= 0) return;
  const cx = 960, cy = 540;
  // tilt: easy side rises as the hard side gets heavier
  const heavy = smoothstep(tHard, tHard + 1.2, t) * 0.6 + smoothstep(tLook, tGrab + 0.8, t) * 0.4;
  const tilt = ease.outBack(clamp(heavy)) * 0.2; // radians, right side down
  const beamL = 470;
  const lx = cx - Math.cos(tilt) * beamL, ly = cy - 60 - Math.sin(tilt) * beamL;
  const rx = cx + Math.cos(tilt) * beamL, ry = cy - 60 + Math.sin(tilt) * beamL;
  // fulcrum
  polyline(pen, [[cx - 60, cy + 150], [cx, cy - 60], [cx + 60, cy + 150]], ba, { color: PAL.cool, a: 0.6 * ba, w: 2, glow: 0.4 });
  line(pen, cx - 140, cy + 150, cx + 140, cy + 150, { color: PAL.cool, a: 0.4 * ba, w: 1.5, glow: 0.3 });
  line(pen, lx, ly, rx, ry, { color: PAL.cool, a: 0.9 * ba, w: 2.6, glow: 0.8 });
  lightDot(pen, cx, cy - 60, 14, PAL.cool, 0.8 * ba);
  // pans hang from beam ends
  const pan = (x, y, col, aa) => {
    line(pen, x, y, x - 120, y + 150, { color: col, a: 0.45 * aa, w: 1.2, glow: 0.3 });
    line(pen, x, y, x + 120, y + 150, { color: col, a: 0.45 * aa, w: 1.2, glow: 0.3 });
    arc(pen, x, y + 150, 150, 0.12, Math.PI - 0.12, { color: col, a: 0.75 * aa, w: 2.2, glow: 0.6 });
    line(pen, x - 150, y + 150, x + 150, y + 150, { color: col, a: 0.75 * aa, w: 2.2, glow: 0.6 });
  };
  const ea = smoothstep(tEasy - 0.2, tEasy + 0.4, t);
  const ha = smoothstep(tHard - 0.2, tHard + 0.4, t);
  pan(lx, ly, PAL.cyan, ba);
  pan(rx, ry, PAL.warm, ba);
  // left pan: chess + puzzle (light for computers)
  if (ea > 0) {
    icon(pen, 'knight', lx - 50, ly + 105, 0.9, ea, PAL.cyan);
    icon(pen, 'puzzle', lx + 55, ly + 112, 0.75, ea, PAL.cyan);
    text(pen.ui, '下棋 · 做智力题', lx, ly + 245, { size: 30, font: FONT.serif, weight: 600, color: [150, 214, 255], a: ea, spacing: 3 });
    text(pen.ui, '对电脑：并不难', lx, ly + 290, { size: 20, font: FONT.sans, weight: 400, color: PAL.dim, a: ea, spacing: 2 });
  }
  // right pan: look, walk, grab (each appears on its word)
  const items = [['eye', tLook, -80], ['feet', tWalk, 0], ['grab', tGrab, 80]];
  for (const [nm, tt, dx] of items) {
    const a = smoothstep(tt - 0.15, tt + 0.25, t);
    if (a > 0) icon(pen, nm, rx + dx, ry + 108 - (1 - ease.outBack(clamp((t - tt + 0.15) / 0.5))) * 40, 0.75, a, PAL.warm);
  }
  if (ha > 0) {
    text(pen.ui, '看 · 走 · 拿', rx, ry + 245, { size: 30, font: FONT.serif, weight: 600, color: [255, 205, 150], a: ha, spacing: 6 });
    text(pen.ui, '一岁小孩都会，对机器人：难如登天', rx, ry + 290, { size: 20, font: FONT.sans, weight: 400, color: PAL.dim, a: ha, spacing: 2 });
  }
  // term chip (for the experts): on-screen only
  const ta = smoothstep(tHard + 0.5, tHard + 1.1, t) * (1 - smoothstep(dur - 0.5, dur, t));
  label(pen, 140, 170, { en: "MORAVEC'S PARADOX · 1988", zh: '莫拉维克悖论', a: ta, color: PAL.gold, rule: 200 });
}
