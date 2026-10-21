// Page entry: sets up the stage, preloads fonts, exposes __init / __frame for the frame driver.
import { Stage } from './core/stage.js';
import { FONT } from './core/draw.js';
import { Film } from './film.js';
import { getThree } from './core/three.js';
import { preload } from './core/data.js';

const params = new URLSearchParams(location.search);
const scale = parseFloat(params.get('scale') || '1');
let stage, film;

async function loadFonts() {
  let chars = '';
  try {
    chars = await (await fetch('../data/charset.txt')).text();
  } catch (e) {
    chars = '';
  }
  chars += '0123456789:·.,—-()[]%/×ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
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
  stage = new Stage(document.getElementById('out'), scale);
  await loadFonts();
  await getThree(scale);
  await preload();
  film = new Film(stage, opts);
  await film.load();
  return { duration: film.duration, fps: film.fps };
};

window.__frame = async (t, frameIndex) => {
  film.render(t, frameIndex);
  return true;
};
