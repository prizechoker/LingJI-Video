// The realistic film: a timeline of shots, each its own three.js scene (video/shots/<scene>.js) rendered on one shared
// WebGL context and composited onto the 2D output canvas, with the burned-in subtitles, chapter tags, dips to black
// and a fine film grain on top. Every frame is a pure function of time; shots are built when first needed and freed
// once they are over (each render worker walks its frames in order).
//
// A shot module exports:  async create(ctx) -> { studio, update(t, env), overlay?(g, t, env), dispose?() }
//   ctx = { renderer, scale, p (shot params), dur, cues (seconds from the shot's start) }
//   update() poses the scene for local time t; overlay() draws on the output canvas in 1920 x 1080 units.
import { THREE, makeRenderer, W, H } from './core.js';
import { drawSubtitles } from '../engine/core/subtitles.js';
import { drawChrome } from '../engine/core/chrome.js';

const sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// a tileable grain texture (deterministic), drawn at a different offset every frame
function grainCanvas(n = 512, seed = 9) {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  const img = g.createImageData(n, n);
  let s = seed;
  const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n * n; i++) {
    const v = 128 + (R() + R() + R() - 1.5) * 90;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

export class Film2 {
  constructor(out, scale = 1) {
    this.out = out;
    this.scale = scale;
    out.width = Math.round(W * scale);
    out.height = Math.round(H * scale);
    this.g = out.getContext('2d');
    this.renderer = makeRenderer(scale);
    this.live = new Map(); // shot id -> instance
    this.grain = grainCanvas();
  }

  async load(timeline) {
    const tl = typeof timeline === 'string' ? await (await fetch(`../data/${timeline}`)).json() : timeline;
    this.tl = tl;
    this.fps = tl.fps || 30;
    this.duration = tl.duration;
    this.shots = tl.shots.map((s, i) => ({ id: s.id || `s${i}`, fadeIn: 0, fadeOut: 0, ...s }));
    return { duration: this.duration, fps: this.fps };
  }

  // shots on screen at t, with their opacity (a shot's fade-in is a cross-dissolve over the one before)
  onScreen(t) {
    const out = [];
    for (const s of this.shots) {
      const t0 = s.start - (s.fadeIn || 0);
      if (t < t0 || t >= s.end + (s.fadeOut || 0)) continue;
      let a = 1;
      if (s.fadeIn) a *= sstep(t0, s.start, t);
      if (s.fadeOut && t > s.end) a *= 1 - sstep(s.end, s.end + s.fadeOut, t);
      out.push({ s, a });
    }
    // a shot fading in sits on top of the one it replaces
    out.sort((x, y) => x.s.start - y.s.start);
    return out;
  }

  async instance(s) {
    let inst = this.live.get(s.id);
    if (inst) return inst;
    const mod = await import(`../shots/${s.scene}.js`);
    const cues = {};
    for (const [k, v] of Object.entries(s.cues || {})) cues[k] = v - s.start;
    inst = await mod.create({ renderer: this.renderer, scale: this.scale, p: s.p || {}, dur: s.end - s.start, cues, id: s.id });
    if (inst.studio) await inst.studio.ready();
    this.live.set(s.id, inst);
    return inst;
  }

  release(t) {
    for (const s of this.shots) {
      if (!this.live.has(s.id) || t < s.end + (s.fadeOut || 0) + 0.5) continue;
      const inst = this.live.get(s.id);
      if (inst.dispose) inst.dispose();
      if (inst.studio) inst.studio.dispose();
      this.live.delete(s.id);
    }
  }

  async frame(t, fi = Math.round(t * this.fps)) {
    const g = this.g;
    const env = { t, frame: fi, fps: this.fps, film: this };
    this.release(t);
    const layers = this.onScreen(t);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#000';
    g.fillRect(0, 0, this.out.width, this.out.height);
    for (const { s, a } of layers) {
      const inst = await this.instance(s);
      const tl = t - s.start;
      inst.update(tl, { ...env, shot: s, alpha: a });
      if (inst.studio) {
        inst.studio.render();
        g.globalAlpha = a;
        g.drawImage(this.renderer.domElement, 0, 0, this.out.width, this.out.height);
      }
    }
    g.globalAlpha = 1;
    g.setTransform(this.scale, 0, 0, this.scale, 0, 0); // overlays are drawn in 1920 x 1080 units
    for (const { s, a } of layers) {
      const inst = this.live.get(s.id);
      if (!inst.overlay) continue;
      g.save();
      g.globalAlpha = a;
      // a glitch in one overlay costs that overlay on that frame, not an hours-long render
      try { inst.overlay(g, t - s.start, { ...env, shot: s, alpha: a }); } catch (e) { console.error(`overlay ${s.id} @${t.toFixed(3)}: ${e.message}`); }
      g.restore();
    }
    this.blacks(t);
    const pen = { ui: g };
    drawChrome(pen, t, this.tl.chapters || [], env);
    drawSubtitles(pen, t, this.tl.subtitles || []);
    this.grainPass(fi);
    return true;
  }

  blacks(t) {
    let black = 0;
    for (const b of this.tl.blacks || []) {
      const t0 = b.at, t1 = b.at + (b.in ?? 0.2), t2 = t1 + (b.hold ?? 0), t3 = t2 + (b.out ?? 0.2);
      if (t >= t0 && t <= t3) black = Math.max(black, t < t1 ? sstep(t0, t1, t) : t < t2 ? 1 : 1 - sstep(t2, t3, t));
    }
    if (black <= 0) return;
    const g = this.g;
    g.save();
    g.globalAlpha = Math.min(1, black);
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    g.restore();
  }

  grainPass(fi) {
    const g = this.g;
    const n = this.grain.width;
    let s = (fi * 7919 + 13) % 2147483647;
    const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const ox = Math.floor(R() * n), oy = Math.floor(R() * n);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'overlay';
    g.globalAlpha = this.tl.grain ?? 0.07;
    for (let y = -oy; y < this.out.height; y += n) for (let x = -ox; x < this.out.width; x += n) g.drawImage(this.grain, x, y);
    g.restore();
  }
}

export { THREE };
