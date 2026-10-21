// Burned-in subtitles: serif, bottom centre, keyword highlights. Exactly one line on screen at a time.
import { PAL } from './stage.js';
import { richText } from './draw.js';
import { smoothstep } from './math.js';

const COLORS = { gold: PAL.gold, cyan: [150, 214, 255], warm: PAL.warm, red: PAL.red };
const LEAD = 0.08; // appear slightly before the voice

// soft darkening behind the text: present while any line is on (or about to be), so it never flickers between lines
function backdrop(t, subs, k) {
  let b = 0;
  for (const s of [subs[k], subs[k + 1]]) {
    if (!s) continue;
    b = Math.max(b, smoothstep(s.start - LEAD - 0.3, s.start - LEAD, t) * (1 - smoothstep(s.end + 0.15, s.end + 0.5, t)));
  }
  return b;
}

export function drawSubtitles(pen, t, subs) {
  // the latest subtitle that has started is the only one shown
  let k = -1;
  for (let i = 0; i < subs.length; i++) if (subs[i].start - LEAD <= t) k = i;
  const ui = pen.ui;
  const b = backdrop(t, subs, k);
  if (b > 0.001) {
    ui.save();
    ui.globalAlpha = 0.5 * b;
    const grad = ui.createLinearGradient(0, 900, 0, 1080);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.55)');
    ui.fillStyle = grad;
    ui.fillRect(0, 900, 1920, 180);
    ui.restore();
  }
  if (k < 0) return;
  const s = subs[k];
  if (t > s.end + 0.22) return;
  const next = subs[k + 1];
  const tIn = s.start - LEAD;
  let a = smoothstep(tIn, tIn + 0.12, t) * (1 - smoothstep(s.end + 0.02, s.end + 0.2, t));
  if (next) a *= 1 - smoothstep(next.start - LEAD - 0.06, next.start - LEAD, t);
  if (a <= 0.001) return;
  const segs = s.segs.map((g) => ({ t: g.t, c: g.c ? COLORS[g.c] || g.c : null }));
  const rise = (1 - smoothstep(tIn, tIn + 0.25, t)) * 5;
  richText(ui, segs, 960, 968 + rise, { size: 46, weight: 600, a, spacing: 2, color: [244, 239, 231], shadow: 14, shadowColor: 'rgba(0,0,0,0.85)' });
}
