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
