// Cover image: the hand holding the stone above the glowing board, with the hook line.
import { draw as drawGo } from './go.js';
import { PAL } from '../core/stage.js';
import { text, glowText, FONT } from '../core/draw.js';

export function draw(pen, t, p, env) {
  drawGo(pen, 3.2, { mode: 'callback', dur: 4, cue: { handIn: -1, place: 99, heat: -9, ghost: -9 } }, env);
  const ui = pen.ui;
  const g = ui.createLinearGradient(0, 0, 1100, 0);
  g.addColorStop(0, 'rgba(2,3,6,0.88)');
  g.addColorStop(0.75, 'rgba(2,3,6,0.35)');
  g.addColorStop(1, 'rgba(2,3,6,0)');
  ui.fillStyle = g;
  ui.fillRect(0, 0, 1100, 1080);
  text(ui, '机器人发展史 · 第 1 集', 110, 300, { size: 34, font: FONT.serif, weight: 500, color: [214, 206, 194], align: 'left', spacing: 6 });
  glowText(pen, 'AI 赢了世界冠军', 104, 430, { size: 112, font: FONT.serif, weight: 900, color: [246, 240, 230], glowColor: PAL.cyan, glow: 0.25, align: 'left', spacing: 4 });
  text(ui, 'AI 赢了世界冠军', 104, 430, { size: 112, font: FONT.serif, weight: 900, color: [246, 240, 230], align: 'left', spacing: 4 });
  glowText(pen, '却拿不起一颗棋子', 104, 580, { size: 112, font: FONT.serif, weight: 900, color: [255, 210, 140], glowColor: PAL.warm, glow: 0.35, align: 'left', spacing: 4 });
  text(ui, '却拿不起一颗棋子', 104, 580, { size: 112, font: FONT.serif, weight: 900, color: [255, 210, 140], align: 'left', spacing: 4 });
  text(ui, '为什么机器人还洗不好你家的碗？', 110, 720, { size: 40, font: FONT.serif, weight: 600, color: [200, 206, 214], align: 'left', spacing: 4 });
}
