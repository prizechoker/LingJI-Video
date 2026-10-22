// The episode cover (thumbnail): the robot's white hand stopped over the black stone of move 37, cold light, and the
// question in large type. Rendered as a still through the film page: node tools/shot.mjs cover 3 1 '{"dur":4}'.
import { create as reach } from './botreach.js';
import { text, FONT, measure } from './lib/kit.js';

export async function create(ctx) {
  const inner = await reach({ ...ctx, p: { range: 0.07, exposure: 1.0, key: 9, rim: 6 }, cues: { freeze: 1.0, arrive: 0.8 } });
  const st = inner.studio;
  return {
    studio: st,
    update(t) {
      inner.update(Math.max(t, 2.0));
      // frame the hand and the stone in the left two thirds, leave the right for the words
      const c = st.camera;
      c.position.set(-0.11, 0.06, -0.15);
      c.lookAt(0.14, 0.035, 0.02);
      if (c.fov !== 26) { c.fov = 26; c.updateProjectionMatrix(); }
    },
    overlay(g) {
      const grad = g.createLinearGradient(0, 0, 900, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0.55)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 1920, 1080);
      const x = 96;
      text(g, 'AI 下赢了世界冠军', x, 170, { size: 84, font: FONT.sans, weight: 900, color: [244, 246, 250], align: 'left', spacing: 2, shadow: 30 });
      text(g, '却拿不起', x, 300, { size: 112, font: FONT.sans, weight: 900, color: [244, 246, 250], align: 'left', spacing: 4, shadow: 30 });
      text(g, '一颗棋子', x, 430, { size: 112, font: FONT.sans, weight: 900, color: [236, 196, 112], align: 'left', spacing: 4, shadow: 30 });
      const w = measure(g, '棋盘之外 · 第 1 集', { size: 30, font: FONT.serif, weight: 600, spacing: 8 });
      g.fillStyle = 'rgba(236,196,112,0.9)';
      g.fillRect(x, 520, w, 2);
      text(g, '棋盘之外 · 第 1 集', x, 560, { size: 30, font: FONT.serif, weight: 600, color: [226, 220, 210], align: 'left', spacing: 8, shadow: 14 });
    },
  };
}
