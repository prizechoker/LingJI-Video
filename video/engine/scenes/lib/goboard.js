// Go board geometry, game replay with captures, and drawing in perspective.
import { PAL, rgba } from '../../core/stage.js';
import { line, lightDot } from '../../core/draw.js';
import { clamp, smoothstep } from '../../core/math.js';
import { drawStone } from './stone.js';

export const G = 0.022; // grid spacing in metres (real boards ~22mm)
export const toWorld = (i, j) => [(i - 9) * G, 0, (j - 9) * G];

// Replay moves with capture rules; returns board[i][j] = 'B' | 'W' | null after n moves
export function replay(moves, n) {
  const b = Array.from({ length: 19 }, () => Array(19).fill(null));
  const nb = (i, j) => [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]].filter(([a, c]) => a >= 0 && a < 19 && c >= 0 && c < 19);
  const group = (i, j) => {
    const col = b[i][j], seen = new Set([i * 19 + j]), st = [[i, j]];
    let libs = 0;
    const libSet = new Set();
    while (st.length) {
      const [x, y] = st.pop();
      for (const [a, c] of nb(x, y)) {
        if (b[a][c] === null) libSet.add(a * 19 + c);
        else if (b[a][c] === col && !seen.has(a * 19 + c)) { seen.add(a * 19 + c); st.push([a, c]); }
      }
    }
    libs = libSet.size;
    return { stones: [...seen].map((k) => [Math.floor(k / 19), k % 19]), libs };
  };
  for (let k = 0; k < Math.min(n, moves.length); k++) {
    const [c, i, j] = moves[k];
    b[i][j] = c;
    for (const [a, d] of nb(i, j)) {
      if (b[a][d] && b[a][d] !== c) {
        const gr = group(a, d);
        if (gr.libs === 0) for (const [x, y] of gr.stones) b[x][y] = null;
      }
    }
  }
  return b;
}

// Draw the 19x19 grid through a projector P(x,y,z) -> screen.
export function drawGrid(pen, P, { a = 1, fogNear = 0.2, fogFar = 0.9, reveal = 1, glowAt = null, glowAmt = 0 } = {}) {
  const fog = (z) => 1 - smoothstep(fogNear, fogFar, z);
  for (let k = 0; k < 19; k++) {
    for (const dir of [0, 1]) {
      // draw each line in short pieces so fog can vary along it
      const pieces = 9;
      for (let s = 0; s < pieces; s++) {
        const u0 = s / pieces, u1 = (s + 1) / pieces;
        // reveal: lines grow out from the centre
        const rv = clamp(reveal * 1.6 - Math.abs(k - 9) / 9 * 0.6);
        if (rv <= 0) continue;
        const span = 18 * rv;
        const lo = 9 - span / 2, hi = 9 + span / 2;
        let a0 = lo + (hi - lo) * u0, a1 = lo + (hi - lo) * u1;
        const p0 = dir ? toWorld(k, a0) : toWorld(a0, k);
        const p1 = dir ? toWorld(k, a1) : toWorld(a1, k);
        const s0 = P(...p0), s1 = P(...p1);
        if (!s0.visible || !s1.visible) continue;
        const f = fog((s0.z + s1.z) / 2);
        let boost = 0;
        if (glowAt && glowAmt > 0) {
          const mid = [(p0[0] + p1[0]) / 2, (p0[2] + p1[2]) / 2];
          const d = Math.hypot(mid[0] - glowAt[0], mid[1] - glowAt[2]);
          boost = glowAmt * Math.exp(-d * d / (2 * 0.05 * 0.05));
        }
        const edge = k === 0 || k === 18 ? 1.25 : 1;
        line(pen, s0.x, s0.y, s1.x, s1.y, { color: PAL.cool, a: a * f * (0.6 * edge + boost * 0.6), w: 1.25 * edge, glow: 0.55 + boost, glowColor: PAL.cyan });
      }
    }
  }
  // star points
  for (const i of [3, 9, 15]) for (const j of [3, 9, 15]) {
    const s = P(...toWorld(i, j));
    if (!s.visible) continue;
    const f = fog(s.z);
    lightDot(pen, s.x, s.y, 5, PAL.cool, a * f * 0.45 * clamp(reveal * 2 - 1));
  }
}

// Stones: projected ellipses (radius from x/z offsets so perspective squash is right).
export function stoneAt(pen, P, i, j, color, o = {}) {
  const [x, , z] = toWorld(i, j);
  const lift = o.lift || 0;
  const c = P(x, 0.004 + lift, z);
  if (!c.visible) return;
  const r = G * 0.47;
  const ex = P(x + r, 0.004 + lift, z), ez = P(x, 0.004 + lift, z + r);
  const rx = Math.hypot(ex.x - c.x, ex.y - c.y);
  const ry = Math.hypot(ez.x - c.x, ez.y - c.y);
  const blur = o.focusZ ? clamp(Math.abs(c.z - o.focusZ) * (o.dof ?? 40), 0, 7) : 0;
  drawStone(pen, c.x, c.y, rx, color, { squash: clamp(ry / rx, 0.2, 1), a: (o.a ?? 1) * (1 - blur / 16), shadow: o.shadow ?? 0.6, glow: o.glow ?? 0, blur });
}

export function stoneAtWorld(pen, P, x, y, z, color, o = {}) {
  const c = P(x, y, z);
  if (!c.visible) return;
  const r = G * 0.47;
  const ex = P(x + r, y, z), ez = P(x, y, z + r);
  const rx = Math.hypot(ex.x - c.x, ex.y - c.y);
  const ry = Math.hypot(ez.x - c.x, ez.y - c.y);
  drawStone(pen, c.x, c.y, rx, color, { squash: clamp(ry / rx, 0.2, 1), a: o.a ?? 1, shadow: o.shadow ?? 0, glow: o.glow ?? 0 });
}

// A circle lying on the board plane (ripples, highlights)
export function planeCircle(pen, P, x, z, r, o = {}) {
  const pts = [];
  for (let k = 0; k <= 48; k++) {
    const a = (k / 48) * Math.PI * 2;
    const s = P(x + Math.cos(a) * r, 0.002, z + Math.sin(a) * r);
    pts.push([s.x, s.y]);
  }
  const { main, glow } = pen;
  for (const [ctx, isG] of [[main, false], [glow, true]]) {
    ctx.save();
    ctx.beginPath();
    pts.forEach(([px, py], k) => (k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    if (o.fill) {
      ctx.fillStyle = rgba(o.color || PAL.cyan, (o.a ?? 1) * (isG ? 0.8 : 0.5));
      ctx.fill();
    } else {
      ctx.strokeStyle = rgba(o.color || PAL.cyan, (o.a ?? 1) * (isG ? 0.7 : 1));
      ctx.lineWidth = isG ? (o.w || 1.5) * 3 : o.w || 1.5;
      if (o.dash) ctx.setLineDash(o.dash);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// Soft gaussian-looking glow lying on the board plane (AI "attention")
export function heatBlob(pen, P, x, z, r, a, color = PAL.cyan) {
  if (a <= 0.001) return;
  const c = P(x, 0.001, z);
  const ex = P(x + r, 0.001, z), ez = P(x, 0.001, z + r);
  const rx = Math.hypot(ex.x - c.x, ex.y - c.y), ry = Math.hypot(ez.x - c.x, ez.y - c.y);
  for (const [ctx, k] of [[pen.main, 0.55], [pen.glow, 0.9]]) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, rgba(color, a * k));
    g.addColorStop(0.45, rgba(color, a * k * 0.45));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
