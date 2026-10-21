// Burned-in subtitles: serif, bottom centre, keyword highlights, soft fades.
import { PAL } from './stage.js';
import { richText } from './draw.js';
import { smoothstep } from './math.js';

const COLORS = { gold: PAL.gold, cyan: [150, 214, 255], warm: PAL.warm, red: PAL.red };

export function drawSubtitles(pen, t, subs) {
  const ui = pen.ui;
  for (const s of subs) {
    if (t < s.start - 0.15 || t > s.end + 0.2) continue;
    const a = smoothstep(s.start - 0.12, s.start + 0.06, t) * (1 - smoothstep(s.end + 0.02, s.end + 0.18, t));
    if (a <= 0.001) continue;
    const segs = s.segs.map((g) => ({ t: g.t, c: g.c ? COLORS[g.c] || g.c : null }));
    const rise = (1 - smoothstep(s.start - 0.12, s.start + 0.25, t)) * 6;
    ui.save();
    // soft dark band behind text for legibility on bright frames
    ui.globalAlpha = a * 0.5;
    const grad = ui.createLinearGradient(0, 900, 0, 1080);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.55)');
    ui.fillStyle = grad;
    ui.fillRect(0, 900, 1920, 180);
    ui.restore();
    richText(ui, segs, 960, 968 + rise, {
      size: 46, weight: 600, a, spacing: 2, color: [244, 239, 231], shadow: 14, shadowColor: 'rgba(0,0,0,0.85)',
    });
  }
}
