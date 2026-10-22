// Film page entry: fonts, then the film; exposes __init / __frame for the frame driver (tools/render.mjs).
// ?scale=1  &timeline=timeline.json   or   __init({ timeline: {...} }) with an inline timeline (lab previews)
import { Film2 } from './film.js';
import { FONT } from '../engine/core/draw.js';

const q = new URLSearchParams(location.search);
const scale = parseFloat(q.get('scale') || '1');
let film;

async function loadFonts() {
  let chars = '';
  try {
    chars = await (await fetch('../data/charset.txt')).text();
  } catch (e) {
    chars = '';
  }
  chars += '0123456789:·.,—-()[]%/×→ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const loads = [];
  for (const w of [300, 400, 500, 600, 700, 900]) {
    loads.push(document.fonts.load(`${w} 40px ${FONT.serif.split(',')[0]}`, chars));
    loads.push(document.fonts.load(`${w} 40px ${FONT.sans.split(',')[0]}`, chars));
  }
  for (const w of [400, 500, 700]) loads.push(document.fonts.load(`${w} 40px "JetBrains Mono"`, chars));
  await Promise.all(loads);
  await document.fonts.ready;
}

window.__init = async (opts = {}) => {
  await loadFonts();
  film = new Film2(document.getElementById('out'), scale);
  return film.load(opts.timeline || q.get('timeline') || 'timeline.json');
};

window.__frame = async (t, fi) => film.frame(t, fi);
