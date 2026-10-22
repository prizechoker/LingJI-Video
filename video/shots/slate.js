// A placeholder for a shot still being built: a dark frame naming the shot (only used in previews).
import { THREE } from '../engine2/core.js';
import { text, FONT, sstep } from './lib/kit.js';

export async function create({ p, dur }) {
  return {
    studio: null,
    update() {},
    overlay(g, t) {
      g.fillStyle = '#0b0d10';
      g.fillRect(0, 0, 1920, 1080);
      const a = sstep(0, 0.3, t);
      text(g, p.label || 'shot', 960, 500, { size: 54, font: FONT.sans, weight: 600, color: [190, 200, 212], a });
      text(g, `${dur.toFixed(1)} s`, 960, 580, { size: 26, font: FONT.mono, weight: 500, color: [120, 130, 142], a });
    },
  };
}
export { THREE };
