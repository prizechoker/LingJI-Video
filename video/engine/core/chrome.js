// Persistent overlays: chapter marker (top-left) and the small AI-voice disclosure.
import { PAL, rgba } from './stage.js';
import { text, FONT } from './draw.js';
import { smoothstep, clamp } from './math.js';

export function drawChrome(pen, t, chapters, env) {
  const ui = pen.ui;
  for (const ch of chapters || []) {
    if (t < ch.start || t > ch.end) continue;
    const local = t - ch.start;
    const a = smoothstep(0, 0.6, local) * (1 - smoothstep(ch.end - ch.start - 0.5, ch.end - ch.start, local));
    if (a <= 0) continue;
    const grow = clamp(local / 0.8);
    ui.save();
    ui.globalAlpha = a;
    ui.strokeStyle = rgba(PAL.gold, 0.85);
    ui.lineWidth = 2;
    ui.beginPath();
    ui.moveTo(64, 52);
    ui.lineTo(64, 52 + 34 * grow);
    ui.stroke();
    ui.restore();
    text(ui, ch.num, 80, 60, { size: 14, font: FONT.mono, weight: 500, color: PAL.gold, a: a * 0.95, align: 'left', spacing: 3 });
    text(ui, ch.title, 80, 80, { size: 20, font: FONT.serif, weight: 600, color: [232, 226, 216], a: a * 0.9, align: 'left', spacing: 2 });
  }
  const d = env.film && env.film.tl && env.film.tl.disclosure;
  if (d && t >= d.start && t <= d.end) {
    const a = smoothstep(d.start, d.start + 0.5, t) * (1 - smoothstep(d.end - 0.5, d.end, t));
    text(ui, d.text, 1920 - 56, 1080 - 40, { size: 15, font: FONT.sans, weight: 400, color: [200, 205, 212], a: a * 0.55, align: 'right', spacing: 1 });
  }
}
