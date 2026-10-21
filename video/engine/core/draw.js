// Drawing primitives. Every primitive can paint a crisp stroke on `main` and a soft copy on `glow`.
import { PAL, rgba } from './stage.js';
import { clamp, lerp } from './math.js';

export const FONT = {
  serif: '"Noto Serif SC Variable", "Noto Serif SC", serif',
  sans: '"Noto Sans SC Variable", "Noto Sans SC", sans-serif',
  mono: '"JetBrains Mono", monospace',
};

// ---------------- lines ----------------
export function stroke(pen, path, { color = PAL.cool, a = 1, w = 2, glow = 0.6, glowColor = null, glowW = null, cap = 'round', dash = null } = {}) {
  if (a <= 0.001) return;
  const { main, glow: gx } = pen;
  main.save();
  main.lineCap = cap;
  main.lineJoin = 'round';
  main.strokeStyle = rgba(color, a);
  main.lineWidth = w;
  if (dash) main.setLineDash(dash);
  path(main);
  main.stroke();
  main.restore();
  if (glow > 0) {
    gx.save();
    gx.lineCap = cap;
    gx.lineJoin = 'round';
    gx.strokeStyle = rgba(glowColor || color, a * glow);
    gx.lineWidth = glowW || w * 2.2;
    if (dash) gx.setLineDash(dash);
    path(gx);
    gx.stroke();
    gx.restore();
  }
}

export function line(pen, x1, y1, x2, y2, o) {
  stroke(pen, (c) => { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); }, o);
}

// Polyline revealed from 0..1 along its length.
export function polyline(pen, pts, progress = 1, o = {}) {
  if (pts.length < 2 || progress <= 0) return;
  const segs = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    segs.push(L);
    total += L;
  }
  const target = total * clamp(progress);
  stroke(pen, (c) => {
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      if (acc + segs[i - 1] <= target) {
        c.lineTo(pts[i][0], pts[i][1]);
        acc += segs[i - 1];
      } else {
        const f = (target - acc) / (segs[i - 1] || 1);
        c.lineTo(lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f));
        break;
      }
    }
  }, o);
  return total;
}

export function circle(pen, x, y, r, o = {}) {
  stroke(pen, (c) => { c.beginPath(); c.arc(x, y, Math.max(0.01, r), 0, Math.PI * 2); }, o);
}

export function arc(pen, x, y, r, a0, a1, o = {}) {
  stroke(pen, (c) => { c.beginPath(); c.arc(x, y, Math.max(0.01, r), a0, a1); }, o);
}

export function fillCircle(pen, x, y, r, color, a = 1, glow = 0.8) {
  if (a <= 0.001) return;
  pen.main.fillStyle = rgba(color, a);
  pen.main.beginPath();
  pen.main.arc(x, y, r, 0, Math.PI * 2);
  pen.main.fill();
  if (glow > 0) {
    pen.glow.fillStyle = rgba(color, a * glow);
    pen.glow.beginPath();
    pen.glow.arc(x, y, r * 1.8, 0, Math.PI * 2);
    pen.glow.fill();
  }
}

// soft light blob (for "light sources", sparks, focus points)
export function lightDot(pen, x, y, r, color, a = 1) {
  if (a <= 0.001) return;
  for (const ctx of [pen.main, pen.glow]) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(color, a));
    g.addColorStop(0.35, rgba(color, a * 0.35));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---------------- text ----------------
export function text(ctx, str, x, y, { size = 40, font = FONT.serif, weight = 600, color = PAL.warmHi, a = 1, align = 'center', base = 'middle', spacing = 0, shadow = 0, shadowColor = 'rgba(0,0,0,0.7)' } = {}) {
  if (a <= 0.001 || !str) return 0;
  ctx.save();
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = base;
  ctx.letterSpacing = `${spacing}px`;
  ctx.fillStyle = typeof color === 'string' ? color : rgba(color, a);
  if (typeof color === 'string') ctx.globalAlpha *= a;
  if (shadow) {
    ctx.shadowColor = shadowColor;
    ctx.shadowBlur = shadow;
  }
  ctx.fillText(str, x, y);
  const w = ctx.measureText(str).width;
  ctx.restore();
  return w;
}

export function measure(ctx, str, { size = 40, font = FONT.serif, weight = 600, spacing = 0 } = {}) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.letterSpacing = `${spacing}px`;
  const w = ctx.measureText(str).width;
  ctx.restore();
  return w;
}

// Glowing title text: painted to main and blurred copy to glow layer.
export function glowText(pen, str, x, y, o = {}) {
  const { a = 1, glow = 0.8, glowColor = o.color || PAL.cyan } = o;
  text(pen.main, str, x, y, o);
  if (glow > 0) text(pen.glow, str, x, y, { ...o, color: glowColor, a: a * glow });
}

// Rich line: segments [{t:'普通'}, {t:'重点', c:PAL.gold}] centred at x.
export function richText(ctx, segs, x, y, o = {}) {
  const { size = 44, font = FONT.serif, weight = 600, a = 1, spacing = 1, align = 'center' } = o;
  const widths = segs.map((s) => measure(ctx, s.t, { size, font, weight, spacing }));
  const total = widths.reduce((p, c) => p + c, 0);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  segs.forEach((s, i) => {
    text(ctx, s.t, cx, y, { ...o, size, font, weight, spacing, align: 'left', color: s.c || o.color || PAL.warmHi, a: a * (s.a ?? 1) });
    cx += widths[i];
  });
  return total;
}

// Small HUD label: mono caps line + Chinese line with a hairline rule.
export function label(pen, x, y, { en = '', zh = '', a = 1, color = PAL.cool, align = 'left', rule = 120, zhSize = 22, enSize = 13 } = {}) {
  if (a <= 0.001) return;
  const ui = pen.ui;
  const dir = align === 'right' ? -1 : 1;
  ui.save();
  ui.globalAlpha = a;
  ui.strokeStyle = rgba(color, 0.55);
  ui.lineWidth = 1;
  if (rule) {
    ui.beginPath();
    ui.moveTo(x, y);
    ui.lineTo(x + dir * rule, y);
    ui.stroke();
  }
  ui.restore();
  if (zh) text(ui, zh, x, y + 8 + zhSize * 0.6, { size: zhSize, font: FONT.sans, weight: 500, color, a, align, base: 'middle', spacing: 1 });
  if (en) text(ui, en, x, y - 12, { size: enSize, font: FONT.mono, weight: 500, color: PAL.dim, a: a * 0.95, align, base: 'middle', spacing: 3 });
}

// --------------- misc ---------------
export function withAlpha(ctx, a, fn) {
  ctx.save();
  ctx.globalAlpha *= a;
  fn();
  ctx.restore();
}

export function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
