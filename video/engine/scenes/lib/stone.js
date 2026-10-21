// Go stones rendered as small glossy lenses (with optional perspective squash).
import { rgba } from '../../core/stage.js';

export function drawStone(pen, x, y, r, color = 'black', { a = 1, squash = 1, glow = 0.0, shadow = 0.6, blur = 0 } = {}) {
  if (a <= 0.001) return;
  const c = pen.main;
  c.save();
  c.globalAlpha *= a;
  if (blur > 0.4) c.filter = `blur(${blur.toFixed(1)}px)`;
  // contact shadow
  if (shadow > 0) {
    const sg = c.createRadialGradient(x + r * 0.15, y + r * 0.35 * squash, r * 0.2, x + r * 0.15, y + r * 0.35 * squash, r * 1.35);
    sg.addColorStop(0, `rgba(0,0,0,${0.55 * shadow})`);
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = sg;
    c.beginPath();
    c.ellipse(x + r * 0.15, y + r * 0.35 * squash, r * 1.35, r * 1.35 * squash, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.beginPath();
  c.ellipse(x, y, r, r * squash, 0, 0, Math.PI * 2);
  if (color === 'black') {
    const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4 * squash, r * 0.05, x, y, r * 1.05);
    g.addColorStop(0, 'rgba(92,98,108,1)');
    g.addColorStop(0.35, 'rgba(32,35,40,1)');
    g.addColorStop(1, 'rgba(6,7,9,1)');
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = 'rgba(160,190,220,0.22)';
    c.lineWidth = 1;
    c.stroke();
    // specular
    const s = c.createRadialGradient(x - r * 0.38, y - r * 0.45 * squash, 0, x - r * 0.38, y - r * 0.45 * squash, r * 0.35);
    s.addColorStop(0, 'rgba(255,255,255,0.55)');
    s.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = s;
    c.beginPath();
    c.ellipse(x - r * 0.38, y - r * 0.45 * squash, r * 0.35, r * 0.35 * squash, 0, 0, Math.PI * 2);
    c.fill();
  } else {
    const g = c.createRadialGradient(x - r * 0.3, y - r * 0.35 * squash, r * 0.1, x, y, r * 1.05);
    g.addColorStop(0, 'rgba(250,247,240,1)');
    g.addColorStop(0.6, 'rgba(214,214,210,1)');
    g.addColorStop(1, 'rgba(150,152,156,1)');
    c.fillStyle = g;
    c.fill();
  }
  c.restore();
  if (glow > 0) {
    const gx = pen.glow;
    gx.save();
    gx.globalAlpha *= a * glow;
    gx.fillStyle = color === 'black' ? rgba([120, 180, 255], 0.6) : rgba([255, 255, 255], 0.6);
    gx.beginPath();
    gx.ellipse(x, y, r * 1.1, r * 1.1 * squash, 0, 0, Math.PI * 2);
    gx.fill();
    gx.restore();
  }
}
