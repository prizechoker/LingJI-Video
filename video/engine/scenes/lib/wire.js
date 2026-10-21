// 3D line-art helpers: models are lists of 3D polylines drawn through a projector with glow.
import { PAL } from '../../core/stage.js';
import { stroke } from '../../core/draw.js';
import { clamp, smoothstep } from '../../core/math.js';

// transform a point by position/rotationY/scale
export const xf = (p, { pos = [0, 0, 0], ry = 0, s = 1 } = {}) => {
  const c = Math.cos(ry), sn = Math.sin(ry);
  const x = p[0] * s, y = p[1] * s, z = p[2] * s;
  return [pos[0] + x * c + z * sn, pos[1] + y, pos[2] - x * sn + z * c];
};

// Draw polylines (arrays of [x,y,z]) with optional reveal 0..1 (each polyline grows from its start)
export function wire(pen, P, polys, o = {}) {
  const { color = PAL.cool, a = 1, w = 1.6, glow = 0.5, glowColor = null, reveal = 1, T = null, fog = null, dash = null } = o;
  if (a <= 0.001) return;
  for (const poly of polys) {
    const pts = poly.map((p) => P(...(T ? xf(p, T) : p)));
    if (pts.some((q) => !q.visible)) continue;
    let fa = 1;
    if (fog) {
      const z = pts.reduce((s, q) => s + q.z, 0) / pts.length;
      fa = 1 - smoothstep(fog[0], fog[1], z);
    }
    if (fa <= 0.01) continue;
    // partial reveal by length
    let total = 0;
    const seg = [];
    for (let i = 1; i < pts.length; i++) {
      const L = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      seg.push(L);
      total += L;
    }
    const target = total * clamp(reveal);
    stroke(pen, (c) => {
      c.beginPath();
      c.moveTo(pts[0].x, pts[0].y);
      let acc = 0;
      for (let i = 1; i < pts.length; i++) {
        if (acc + seg[i - 1] <= target) { c.lineTo(pts[i].x, pts[i].y); acc += seg[i - 1]; }
        else { const f = (target - acc) / (seg[i - 1] || 1); c.lineTo(pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f); break; }
      }
    }, { color, a: a * fa, w, glow, glowColor: glowColor || color, dash });
  }
}

// primitive builders (local coords, metres)
export function boxLines(w, h, d, y0 = 0) {
  const x = w / 2, z = d / 2;
  const b = [[-x, y0, -z], [x, y0, -z], [x, y0, z], [-x, y0, z]];
  const t = b.map(([px, , pz]) => [px, y0 + h, pz]);
  return [[...b, b[0]], [...t, t[0]], ...b.map((p, i) => [p, t[i]])];
}
export function circleLines(r, y = 0, n = 40, axis = 'y', c = [0, 0, 0]) {
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * Math.PI * 2;
    if (axis === 'y') pts.push([c[0] + Math.cos(a) * r, c[1] + y, c[2] + Math.sin(a) * r]);
    else if (axis === 'x') pts.push([c[0] + y, c[1] + Math.cos(a) * r, c[2] + Math.sin(a) * r]);
    else pts.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r, c[2] + y]);
  }
  return [pts];
}

// A simple dining chair seen in 3D (seat 0.42 wide, 0.45 high, back 0.9)
export function chairLines() {
  const L = [];
  const s = 0.21, hy = 0.45;
  for (const [x, z] of [[-s, -s], [s, -s], [s, s], [-s, s]]) L.push([[x, 0, z], [x, hy, z]]);
  L.push(...boxLines(0.44, 0.03, 0.44, hy));
  for (const x of [-s, s]) L.push([[x, hy, -s], [x, 0.92, -s]]);
  L.push([[-s, 0.92, -s], [s, 0.92, -s]], [[-s, 0.78, -s], [s, 0.78, -s]], [[-s, 0.64, -s], [s, 0.64, -s]]);
  return L;
}
