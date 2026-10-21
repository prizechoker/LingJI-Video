// Film = timeline of shots + subtitle track + global overlays.
import { SCENES } from './scenes/registry.js';
import { drawSubtitles } from './core/subtitles.js';
import { drawChrome } from './core/chrome.js';
import { drawAtmos } from './core/atmos.js';
import { clamp, smoothstep } from './core/math.js';

export class Film {
  constructor(stage, opts) {
    this.stage = stage;
    this.opts = opts;
    this.fps = opts.fps || 30;
    this.duration = 10;
  }

  async load() {
    const o = this.opts;
    if (o.proto) {
      // single scene preview
      this.shots = [{ scene: o.proto, start: 0, end: o.protoDur || 10, p: o.protoParams || {} }];
      this.subs = [];
      this.chapters = [];
      this.duration = o.protoDur || 10;
      return;
    }
    const tl = await (await fetch(`../data/${o.timeline || 'timeline.json'}`)).json();
    this.tl = tl;
    this.shots = tl.shots;
    this.subs = tl.subtitles || [];
    this.chapters = tl.chapters || [];
    this.cues = tl.cues || {};
    this.duration = tl.duration;
    this.fps = tl.fps || this.fps;
  }

  render(t, frame) {
    const st = this.stage;
    const pen = st.begin();
    const env = { t, frame, fps: this.fps, cues: this.cues || {}, film: this };
    st.bgTint = null;
    st.bloom = 1;
    // atmosphere follows the tint of the shot that is fully on screen
    let tint = 'cool', amt = 1;
    for (const s of this.shots) if (t >= s.start && t < s.end) { tint = (s.p && s.p.tint) || 'cool'; amt = s.p && s.p.atmos != null ? s.p.atmos : 1; }
    drawAtmos(pen, t, tint, amt);
    for (const s of this.shots) {
      const fi = s.fadeIn ?? 0.0;
      const fo = s.fadeOut ?? 0.0;
      if (t < s.start - 1e-6 || t >= s.end + fo) continue;
      // shot opacity: fade in at start, optional fade out after end (cross-dissolve)
      let a = 1;
      if (fi > 0) a *= smoothstep(s.start, s.start + fi, t);
      if (fo > 0 && t > s.end) a *= 1 - smoothstep(s.end, s.end + fo, t);
      if (a <= 0.001) continue;
      const scene = SCENES[s.scene];
      if (!scene) continue;
      for (const c of [pen.main, pen.glow, pen.ui]) {
        c.save();
        c.globalAlpha = a;
      }
      scene.draw(pen, t - s.start, { ...(s.p || {}), dur: s.end - s.start, alpha: a }, env);
      for (const c of [pen.main, pen.glow, pen.ui]) c.restore();
    }
    drawChrome(pen, t, this.chapters, env);
    drawSubtitles(pen, t, this.subs);
    let black = 0;
    const tl = this.tl || {};
    for (const b of tl.blacks || []) {
      // {at, in, hold, out}: dip to black
      const t0 = b.at, t1 = b.at + (b.in ?? 0.2), t2 = t1 + (b.hold ?? 0), t3 = t2 + (b.out ?? 0.2);
      if (t >= t0 && t <= t3) black = Math.max(black, t < t1 ? smoothstep(t0, t1, t) : t < t2 ? 1 : 1 - smoothstep(t2, t3, t));
    }
    st.end(frame, { black: clamp(black) });
  }
}
