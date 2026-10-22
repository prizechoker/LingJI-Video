// Shared helpers for the film's shots: easing, keyframes, the house grade, typography.
import { THREE } from '../../engine2/core.js';
import { text, richText, measure, FONT } from '../../engine/core/draw.js';

export { text, richText, measure, FONT };
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const sstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
// smootherstep, and the usual easing curves on [0, 1]
export const ss = (t) => { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10); };
export const easeOut = (t, p = 3) => 1 - (1 - clamp(t)) ** p;
export const easeIn = (t, p = 3) => clamp(t) ** p;
export const easeInOut = (t) => ss(t);

// piecewise keyframes: keys = [[t, value], ...] (numbers or arrays), eased between keys (smootherstep by default)
export function key(t, keys, ease = ss) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, v0] = keys[i], [t1, v1] = keys[i + 1];
    if (t <= t1) {
      const u = ease((t - t0) / (t1 - t0));
      return Array.isArray(v0) ? v0.map((x, k) => lerp(x, v1[k], u)) : lerp(v0, v1, u);
    }
  }
  return keys[keys.length - 1][1];
}

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// deterministic random
export function rng(seed) {
  let s = (seed % 2147483647) || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

// camera from position / look-at / fov (arrays), with an optional slow drift for life
export function aim(cam, pos, look, fov) {
  cam.position.set(...pos);
  cam.lookAt(...look);
  if (fov && cam.fov !== fov) {
    cam.fov = fov;
    cam.updateProjectionMatrix();
  }
}

// a small handheld breathing: deterministic, ~mm at macro scale (amp in metres)
export function breathe(t, amp = 0.001, seed = 1) {
  const s = seed * 1.37;
  return [
    amp * (Math.sin(t * 0.73 + s) * 0.6 + Math.sin(t * 1.91 + s * 2) * 0.4),
    amp * (Math.sin(t * 0.61 + s * 3) * 0.6 + Math.sin(t * 1.47 + s) * 0.4),
    amp * 0.5 * Math.sin(t * 0.53 + s * 5),
  ];
}

// the house grade on top of a studio's post chain
export function grade(st, o = {}) {
  return st.post({
    ao: o.ao === null ? null : { radius: 0.03, intensity: 1.4, ...(o.ao || {}) },
    dof: o.dof || null,
    bloom: { intensity: 0.28, threshold: 0.9, radius: 0.75, ...(o.bloom || {}) },
    vignette: o.vignette ?? 0.55,
    exposure: o.exposure ?? 1.0,
    contrast: o.contrast ?? 0.08,
    saturation: o.saturation ?? -0.04,
  });
}

// typography: a title line with letter spacing that tracks out as it fades in
export function title(g, str, x, y, { size = 72, a = 1, color = [246, 241, 233], font = FONT.serif, weight = 600, spacing = 8, track = 6, align = 'center', shadow = 24 } = {}) {
  if (a <= 0.001) return;
  text(g, str, x, y, { size, a, color, font, weight, spacing: spacing + track * (1 - a), align, shadow, shadowColor: 'rgba(0,0,0,0.75)' });
}

// a small caps caption with a hairline rule (labels in the scene)
export function caption(g, x, y, { en = '', zh = '', a = 1, color = [226, 232, 240], align = 'left', rule = 90, zhSize = 24, enSize = 13 } = {}) {
  if (a <= 0.001) return;
  const dir = align === 'right' ? -1 : 1;
  g.save();
  g.globalAlpha *= a;
  g.strokeStyle = `rgba(${color.join(',')},0.6)`;
  g.lineWidth = 1;
  if (rule) {
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + dir * rule * a, y);
    g.stroke();
  }
  g.restore();
  if (zh) text(g, zh, x, y + 10 + zhSize * 0.55, { size: zhSize, font: FONT.sans, weight: 500, color, a, align, spacing: 1, shadow: 10 });
  if (en) text(g, en, x, y - 13, { size: enSize, font: FONT.mono, weight: 500, color: [170, 180, 192], a: a * 0.9, align, spacing: 3, shadow: 8 });
}

// world point -> 1920 x 1080 overlay coordinates
export function toScreen(cam, p) {
  const v = p.clone().project(cam);
  return [(v.x * 0.5 + 0.5) * 1920, (-v.y * 0.5 + 0.5) * 1080, v.z];
}

// a quotation set large in the frame, line by line, with its attribution
export function quote(g, t, Q) {
  const at = Q.at ?? 0.4;
  const lines = Q.lines;
  const step = Q.step ?? 1.2;
  const size = Q.size ?? 54;
  const x = Q.x ?? 960, y0 = Q.y ?? 540 - ((lines.length - 1) * size * 1.65) / 2 - 30;
  lines.forEach((ln, i) => {
    const t0 = (Q.times && Q.times[i]) ?? at + i * step;
    const a = sstep(t0, t0 + 0.7, t) * (1 - sstep(Q.out ?? 1e9, (Q.out ?? 1e9) + 0.8, t));
    if (a <= 0.001) return;
    const segs = Array.isArray(ln) ? ln : [{ t: ln }];
    let w = 0;
    for (const s of segs) w += measure(g, s.t, { size, font: FONT.serif, weight: 600, spacing: 4 });
    let cx = x - w / 2;
    for (const s of segs) {
      text(g, s.t, cx, y0 + i * size * 1.65 + (1 - a) * 8, { size, font: FONT.serif, weight: 600, spacing: 4, color: s.c || [244, 238, 228], a, align: 'left', shadow: 26, shadowColor: 'rgba(0,0,0,0.9)' });
      cx += measure(g, s.t, { size, font: FONT.serif, weight: 600, spacing: 4 });
    }
  });
  if (Q.by) {
    const t0 = (Q.byAt ?? at + lines.length * step);
    const a = sstep(t0, t0 + 0.8, t) * (1 - sstep(Q.out ?? 1e9, (Q.out ?? 1e9) + 0.8, t));
    text(g, Q.by, x + (Q.byX ?? 260), y0 + lines.length * size * 1.65 + 10, { size: 28, font: FONT.serif, weight: 500, spacing: 6, color: [214, 200, 178], a, align: 'center', shadow: 16 });
  }
}

// a label pinned to a point in the scene: a dot, a leader line out to the side, a main line and an optional small
// line under it. side: 1 = to the right, -1 = to the left; a = opacity (the leader draws out as a rises).
export function callout(g, cam, p, { text: main = '', sub = '', a = 1, side = 1, dx = 150, dy = -90, size = 34, color = [236, 240, 246], line = [200, 220, 240], font = FONT.sans, subSize = 20 } = {}) {
  if (a <= 0.001) return;
  cam.updateMatrixWorld();
  const [x, y, z] = toScreen(cam, p);
  if (z > 1) return;
  const ex = x + side * dx * Math.min(1, a * 1.4), ey = y + dy * Math.min(1, a * 1.4);
  g.save();
  g.globalAlpha *= a;
  g.strokeStyle = `rgba(${line.join(',')},0.85)`;
  g.fillStyle = `rgba(${line.join(',')},1)`;
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(x, y, 4, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(ex, ey);
  g.lineTo(ex + side * 26, ey);
  g.stroke();
  g.restore();
  const tx = ex + side * 36;
  text(g, main, tx, ey - (sub ? 10 : 0), { size, font, weight: 600, color, a, align: side > 0 ? 'left' : 'right', spacing: 2, shadow: 14 });
  if (sub) text(g, sub, tx, ey + size * 0.5 + 8, { size: subSize, font: FONT.sans, weight: 500, color: [190, 198, 208], a: a * 0.9, align: side > 0 ? 'left' : 'right', spacing: 1, shadow: 10 });
}

// archive footage look, drawn over a shot's frame (call first thing in overlay()): faded colour, a warm cast, uneven
// exposure flicker, dust and the odd scratch, a heavy vignette. 24 "film frames" a second regardless of the fps.
export function archive(g, t, { amount = 1, seed = 1, tint = [255, 232, 196], dust = 1 } = {}) {
  if (amount <= 0.001) return;
  const f = Math.floor(t * 24);
  const R = rng(seed * 7919 + f * 104729 + 1);
  g.save();
  g.globalCompositeOperation = 'saturation';
  g.fillStyle = `rgba(128,128,128,${0.62 * amount})`;
  g.fillRect(0, 0, 1920, 1080);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = `rgba(${tint.join(',')},${0.85 * amount})`;
  g.fillRect(0, 0, 1920, 1080);
  g.globalCompositeOperation = 'source-over';
  // flicker
  const fl = 0.035 * amount * (R() - 0.3);
  g.fillStyle = fl > 0 ? `rgba(0,0,0,${fl})` : `rgba(255,240,220,${-fl})`;
  g.fillRect(0, 0, 1920, 1080);
  // lifted blacks (faded print)
  g.globalCompositeOperation = 'screen';
  g.fillStyle = `rgba(38,32,26,${0.6 * amount})`;
  g.fillRect(0, 0, 1920, 1080);
  g.globalCompositeOperation = 'source-over';
  // dust and hairs
  for (let k = 0; k < 10 * dust; k++) {
    const x = R() * 1920, y = R() * 1080, r = 0.6 + R() * R() * 3.5;
    g.fillStyle = R() < 0.75 ? `rgba(20,16,12,${0.5 * amount})` : `rgba(255,250,240,${0.35 * amount})`;
    g.beginPath();
    g.ellipse(x, y, r, r * (0.4 + R()), R() * 3, 0, Math.PI * 2);
    g.fill();
  }
  if (R() < 0.25 * dust) {
    g.strokeStyle = `rgba(30,24,18,${0.35 * amount})`;
    g.lineWidth = 0.8;
    g.beginPath();
    const x = R() * 1920, y = R() * 1080;
    g.moveTo(x, y);
    g.bezierCurveTo(x + (R() - 0.5) * 60, y + 20, x + (R() - 0.5) * 60, y + 40, x + (R() - 0.5) * 50, y + 30 + R() * 50);
    g.stroke();
  }
  // a scratch that wanders for a few frames
  const sc = rng(seed + Math.floor(t * 1.3) * 31)();
  if (sc < 0.5 * dust) {
    const x = 200 + sc * 3000 + Math.sin(t * 7) * 3;
    g.fillStyle = `rgba(235,228,215,${0.12 * amount})`;
    g.fillRect(x % 1920, 0, 1.2, 1080);
  }
  // vignette
  const v = g.createRadialGradient(960, 540, 380, 960, 540, 1150);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, `rgba(0,0,0,${0.55 * amount})`);
  g.fillStyle = v;
  g.fillRect(0, 0, 1920, 1080);
  g.restore();
}

// a small handheld / gate-weave jitter for archive cameras: returns [dx, dy] in radians-ish (apply to rotation)
export function weave(t, amp = 0.0012, seed = 3) {
  const f = Math.floor(t * 24);
  const R = rng(seed * 131 + f * 7);
  return [amp * (R() - 0.5) + amp * 0.6 * Math.sin(t * 1.7), amp * (R() - 0.5) * 0.7];
}
