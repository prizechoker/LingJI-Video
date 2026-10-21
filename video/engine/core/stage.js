// Frame compositor: background, line layer, bloom layer, UI layer, vignette and film grain.
import { rng } from './math.js';

export const W = 1920;
export const H = 1080;

export const PAL = {
  bg0: '#04060a',
  bg1: '#0b1119',
  cool: [214, 232, 255], // machine line colour
  cyan: [108, 198, 255], // machine highlight / glow
  warm: [255, 190, 115], // human light
  warmHi: [255, 233, 207],
  gold: [243, 196, 107], // key-insight accent
  dim: [143, 163, 184],
  red: [255, 107, 94],
};
export const rgba = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export class Stage {
  constructor(out, scale = 1) {
    this.scale = scale;
    this.out = out;
    out.width = W * scale;
    out.height = H * scale;
    this.octx = out.getContext('2d');
    this.mainC = mk(W * scale, H * scale);
    this.uiC = mk(W * scale, H * scale);
    // bloom works at reduced resolution: cheaper and softer
    this.gs = 0.5 * scale;
    this.glowC = mk(Math.round(W * this.gs), Math.round(H * this.gs));
    this.blurC = mk(Math.round(W * this.gs), Math.round(H * this.gs));
    this.main = this.mainC.getContext('2d');
    this.ui = this.uiC.getContext('2d');
    this.glow = this.glowC.getContext('2d');
    this.blurX = this.blurC.getContext('2d');
    this._grain = this._makeGrain();
    this.vignette = 0.62;
    this.grainAmt = 0.055;
    this.bloom = 1.0;
    this.bgTint = null;
  }

  _makeGrain() {
    // a few pre-baked noise tiles cycled per frame (deterministic)
    const tiles = [];
    const size = 256;
    for (let k = 0; k < 6; k++) {
      const c = mk(size, size);
      const x = c.getContext('2d');
      const img = x.createImageData(size, size);
      const r = rng(9000 + k);
      for (let i = 0; i < size * size; i++) {
        const v = Math.floor(128 + (r() + r() + r() - 1.5) * 120);
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
        img.data[i * 4 + 3] = 255;
      }
      x.putImageData(img, 0, 0);
      tiles.push(c);
    }
    return tiles;
  }

  begin() {
    const s = this.scale;
    for (const [ctx, sc] of [[this.main, s], [this.ui, s], [this.glow, this.gs]]) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.filter = 'none';
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.setTransform(sc, 0, 0, sc, 0, 0);
    }
    // pen = both contexts; glow drawn in logical coordinates too
    return { main: this.main, glow: this.glow, ui: this.ui, stage: this };
  }

  end(frameIndex, opts = {}) {
    const o = this.octx;
    const s = this.scale;
    const w = W * s, h = H * s;
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.globalCompositeOperation = 'source-over';
    o.globalAlpha = 1;
    o.filter = 'none';
    // background: deep radial gradient
    const g = o.createRadialGradient(w * 0.5, h * 0.46, h * 0.05, w * 0.5, h * 0.5, h * 1.05);
    g.addColorStop(0, this.bgTint || PAL.bg1);
    g.addColorStop(1, PAL.bg0);
    o.fillStyle = g;
    o.fillRect(0, 0, w, h);
    // bloom: blur the glow layer twice (wide + tight) and add
    if (this.bloom > 0) {
      const bx = this.blurX;
      const gw = this.glowC.width, gh = this.glowC.height;
      o.globalCompositeOperation = 'lighter';
      bx.setTransform(1, 0, 0, 1, 0, 0);
      bx.clearRect(0, 0, gw, gh);
      bx.filter = `blur(${Math.round(22 * this.gs)}px)`;
      bx.drawImage(this.glowC, 0, 0);
      bx.filter = 'none';
      o.globalAlpha = 0.85 * this.bloom;
      o.drawImage(this.blurC, 0, 0, w, h);
      bx.clearRect(0, 0, gw, gh);
      bx.filter = `blur(${Math.round(6 * this.gs)}px)`;
      bx.drawImage(this.glowC, 0, 0);
      bx.filter = 'none';
      o.globalAlpha = 0.9 * this.bloom;
      o.drawImage(this.blurC, 0, 0, w, h);
      o.globalAlpha = 1;
      o.globalCompositeOperation = 'source-over';
    }
    o.drawImage(this.mainC, 0, 0);
    // vignette
    if (this.vignette > 0) {
      const vg = o.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.95);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, `rgba(0,0,0,${this.vignette})`);
      o.fillStyle = vg;
      o.fillRect(0, 0, w, h);
    }
    o.drawImage(this.uiC, 0, 0);
    // fade to black (global), used for hard cuts / ending
    if (opts.black > 0) {
      o.fillStyle = `rgba(0,0,0,${opts.black})`;
      o.fillRect(0, 0, w, h);
    }
    // film grain, overlay blend, tiles cycled by frame
    if (this.grainAmt > 0) {
      const tile = this._grain[frameIndex % this._grain.length];
      o.globalCompositeOperation = 'overlay';
      o.globalAlpha = this.grainAmt * 2.2;
      const pat = o.createPattern(tile, 'repeat');
      const r = rng(frameIndex * 7 + 3);
      o.setTransform(s, 0, 0, s, -Math.floor(r() * 256), -Math.floor(r() * 256));
      o.fillStyle = pat;
      o.fillRect(0, 0, w + 512, h + 512);
      o.setTransform(1, 0, 0, 1, 0, 0);
      o.globalAlpha = 1;
      o.globalCompositeOperation = 'source-over';
    }
  }
}
