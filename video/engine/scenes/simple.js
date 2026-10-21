// U12 bridge ("the same trick") and U16 insight: four arranged worlds merge into one board.
import { PAL, rgba } from '../core/stage.js';
import { line, text, glowText, FONT, lightDot, arc, circle } from '../core/draw.js';
import { clamp, lerp, smoothstep, ease, rng } from '../core/math.js';

const TILES = [
  { key: 'factory', zh: '工厂' },
  { key: 'warehouse', zh: '仓库' },
  { key: 'floor', zh: '地板' },
  { key: 'dish', zh: '洗碗机' },
];

function tile(pen, key, cx, cy, s, a) {
  const n = 7, half = s / 2, st = s / (n - 1);
  for (let i = 0; i < n; i++) {
    line(pen, cx - half, cy - half + i * st, cx + half, cy - half + i * st, { color: PAL.cool, a: 0.5 * a, w: 1.1, glow: 0.5, glowColor: PAL.cyan });
    line(pen, cx - half + i * st, cy - half, cx - half + i * st, cy + half, { color: PAL.cool, a: 0.5 * a, w: 1.1, glow: 0.5, glowColor: PAL.cyan });
  }
  const R = rng(key.length * 77);
  if (key === 'factory') for (let i = 1; i < n; i += 2) for (let j = 1; j < n; j += 2) lightDot(pen, cx - half + i * st, cy - half + j * st, st * 0.35, PAL.gold, 0.8 * a);
  if (key === 'warehouse') for (let i = 0; i < n - 1; i++) for (let j = 0; j < n - 1; j++) {
    const x = cx - half + (i + 0.5) * st, y = cy - half + (j + 0.5) * st, e = st * 0.22;
    line(pen, x - e, y - e, x + e, y - e, { color: PAL.cool, a: 0.6 * a, w: 1, glow: 0.2 });
    line(pen, x + e, y - e, x + e, y + e, { color: PAL.cool, a: 0.6 * a, w: 1, glow: 0.2 });
    if (R() > 0.4) line(pen, x - e, y + e, x - e, y - e, { color: PAL.cool, a: 0.6 * a, w: 1, glow: 0.2 });
  }
  if (key === 'floor') {
    const pts = [];
    for (let r = 0; r < 6; r++) {
      const y = cy - half + (r + 0.5) * (s / 6);
      const xs = r % 2 ? [cx + half * 0.85, cx - half * 0.85] : [cx - half * 0.85, cx + half * 0.85];
      pts.push([xs[0], y], [xs[1], y]);
    }
    for (let k = 1; k < pts.length; k++) line(pen, pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], { color: PAL.cyan, a: 0.8 * a, w: 2, glow: 0.8 });
  }
  if (key === 'dish') for (let i = 1; i < n - 1; i++) {
    const x = cx - half + i * st;
    arc(pen, x, cy, st * 0.42, -Math.PI / 2 - 1.1, -Math.PI / 2 + 1.1, { color: PAL.warm, a: 0.85 * a, w: 2, glow: 0.8 });
    arc(pen, x, cy + st * 1.6, st * 0.42, -Math.PI / 2 - 1.1, -Math.PI / 2 + 1.1, { color: PAL.warm, a: 0.85 * a, w: 2, glow: 0.8 });
  }
}

export function draw(pen, t, p) {
  const c = p.cue || {};
  const dur = p.dur || 8;
  if (p.mode === 'bridge') {
    // "后来的成功，几乎都靠这一招" — the board becomes a stamp applied again and again
    TILES.forEach((T, i) => {
      const a = smoothstep(0.05 + i * 0.25, 0.4 + i * 0.25, t) * (1 - smoothstep(dur - 0.3, dur, t));
      const x = 960 + (i - 1.5) * 300, y = 520 + (1 - ease.outCubic(clamp((t - i * 0.25) / 0.6))) * 40;
      tile(pen, T.key === 'factory' ? 'factory' : 'blank', x, y, 220, a);
    });
    const ta = smoothstep(0.6, 1.2, t) * (1 - smoothstep(dur - 0.3, dur, t));
    text(pen.ui, '同一招：把世界摆成棋盘', 960, 760, { size: 34, font: FONT.serif, weight: 600, color: [236, 230, 220], a: ta, spacing: 6 });
    return;
  }
  // merge mode
  const tNot = c.not ?? 2.4; // "靠的大多不是机器变聪明"
  const tBut = c.but ?? 4.6; // "而是我们把世界，变简单了"
  const merge = ease.inOutCubic(clamp((t - tBut + 0.3) / 1.2));
  const pos = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  TILES.forEach((T, i) => {
    const a = smoothstep(0.1 + i * 0.18, 0.5 + i * 0.18, t);
    const s = lerp(250, 520, merge);
    const x = 960 + pos[i][0] * lerp(170, 0, merge), y = 470 + pos[i][1] * lerp(165, 0, merge);
    tile(pen, T.key, x, y, s, a * lerp(1, 0.5, merge));
    if (merge < 0.5) text(pen.ui, T.zh, x + pos[i][0] * (s / 2 + 52), y + 6, { size: 20, font: FONT.sans, weight: 500, color: PAL.dim, a: a * (1 - merge * 2), spacing: 4 });
  });
  // the shared board after the merge
  if (merge > 0.6) {
    const a = smoothstep(0.6, 1, merge);
    const s = 560, n = 19, st = s / (n - 1);
    for (let i = 0; i < n; i++) {
      line(pen, 960 - s / 2, 470 - s / 2 + i * st, 960 + s / 2, 470 - s / 2 + i * st, { color: PAL.cool, a: 0.35 * a, w: 1, glow: 0.6, glowColor: PAL.cyan });
      line(pen, 960 - s / 2 + i * st, 470 - s / 2, 960 - s / 2 + i * st, 470 + s / 2, { color: PAL.cool, a: 0.35 * a, w: 1, glow: 0.6, glowColor: PAL.cyan });
    }
  }
  // the sentence
  const na = smoothstep(tNot - 0.1, tNot + 0.4, t);
  const ba = smoothstep(tBut + 0.2, tBut + 0.9, t);
  const ui = pen.ui;
  if (ba > 0) {
    const g = ui.createRadialGradient(960, 470, 0, 960, 470, 520);
    g.addColorStop(0, `rgba(3,5,8,${0.72 * ba})`);
    g.addColorStop(1, 'rgba(3,5,8,0)');
    ui.fillStyle = g;
    ui.fillRect(300, 100, 1320, 760);
  }
  if (na > 0) {
    const y = lerp(470, 390, ba);
    text(ui, '不是机器变聪明', 960, y, { size: lerp(52, 34, ba), font: FONT.serif, weight: 600, color: [190, 198, 208], a: na * lerp(1, 0.75, ba), spacing: 8 });
    if (ba > 0) line(pen, 960 - 150, y + 2, 960 - 150 + 300 * ba, y + 2, { color: PAL.dim, a: 0.6 * ba, w: 2, glow: 0 });
  }
  if (ba > 0) {
    glowText(pen, '而是我们把世界变简单了', 960, 500, { size: 72, font: FONT.serif, weight: 800, color: [246, 222, 170], glowColor: PAL.gold, glow: 0.4, a: ba, spacing: 8 });
    text(ui, '而是我们把世界变简单了', 960, 500, { size: 72, font: FONT.serif, weight: 800, color: [246, 222, 170], a: ba, spacing: 8 });
  }
}
