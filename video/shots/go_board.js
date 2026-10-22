// The game-2 board, with what the machine "saw" laid over it.
// p.mode: 'heat'  — the position after move 36. A scan line sweeps the board (cue "heat") and leaves a glowing map of
//                   where a human would likely play; at P10 the probability rolls down to 1/10,000 (cue "count").
//                   The map drains away (cue "fade"), the stone lands at P10 (cue "stone") and a cool light closes
//                   in on it (cue "close").
//         'lapse' — moves p.from..p.to land one after another between cues "a" and "b"; AlphaGo's confidence
//                   (illustrative) climbs in the corner from cue "curve".
//         'still' — the position after p.n moves (p.n = 211: the final position); p.dim darkens the key over the shot.
// p.cam: 'top' (straight down, pushing toward P10) | 'angle' | 'low' | 'edge' (grazing, very shallow focus)
// p.quote: { lines: [..], by, at } — a quotation set in the frame
import { Studio, THREE, spot } from '../engine2/core.js';
import { BOARD } from '../engine2/goban.js';
import { buildGoSet, position } from './lib/goset.js';
import { ss, sstep, clamp, lerp, breathe, grade, caption, text, FONT, toScreen, V3, rng, measure, quote } from './lib/kit.js';

const P10 = [14, 9];
const CAMS = {
  top: { pos: [0.0, 1.02, 0.0], look: [0, 0, 0], fov: 30, up: [0, 0, -1], to: { pos: [0.05, 0.78, 0.0], look: [0.05, 0, 0] } },
  angle: { pos: [-0.06, 0.4, 0.44], look: [0.03, 0.0, -0.01], fov: 30, to: { pos: [-0.02, 0.34, 0.38], look: [0.05, 0, -0.01] } },
  low: { pos: [-0.33, 0.11, 0.36], look: [0.06, 0.0, -0.02], fov: 26, to: { pos: [-0.26, 0.095, 0.3], look: [0.08, 0.0, -0.02] } },
  edge: { pos: [-0.2, 0.05, 0.2], look: [0.12, 0.0, -0.04], fov: 22, to: { pos: [-0.12, 0.048, 0.24], look: [0.16, 0.0, -0.02] } },
  // a macro of the stone at P10, from Lee's side, Q11's white stone beside it
  macro: { pos: [0.04, 0.03, -0.1], look: [0.111, 0.006, 0.0], fov: 15, to: { pos: [0.055, 0.026, -0.078], look: [0.111, 0.006, 0.0] } },
};

// where a human might play after move 36: a few strong candidates around the fight on the right, a long weak tail
function humanField() {
  const hot = [[15, 10, 1.0], [16, 10, 0.75], [15, 11, 0.55], [13, 8, 0.5], [16, 8, 0.42], [12, 9, 0.35], [16, 12, 0.3], [9, 2, 0.28], [2, 9, 0.22], [9, 16, 0.25], [12, 15, 0.2], [6, 15, 0.16], [5, 2, 0.14]];
  const R = rng(17);
  const pts = [];
  for (let i = 0; i < 19; i++) for (let j = 0; j < 19; j++) {
    let w = 0.03 + 0.05 * R() ** 3;
    for (const [a, b, h] of hot) w += h * Math.exp(-((i - a) ** 2 + (j - b) ** 2) / 1.3);
    pts.push([i, j, w]);
  }
  return pts;
}

// a heat colour ramp: deep ember -> amber -> pale gold
function ramp(v) {
  const c = [[0, [0, 0, 0]], [0.25, [90, 18, 4]], [0.5, [230, 90, 20]], [0.75, [255, 175, 70]], [1, [255, 236, 190]]];
  v = clamp(v);
  for (let k = 0; k < c.length - 1; k++) {
    if (v <= c[k + 1][0]) {
      const u = (v - c[k][0]) / (c[k + 1][0] - c[k][0]);
      return c[k][1].map((x, n) => lerp(x, c[k + 1][1][n], u));
    }
  }
  return c[c.length - 1][1];
}

export async function create({ renderer, scale, p, cues, dur }) {
  const st = new Studio({ scale, renderer });
  await st.hdri('../assets/hdri/studio_small_09_2k.hdr', { intensity: p.env ?? 0.09, rotation: 1.2 });
  st.scene.background = new THREE.Color(0x030405);
  const set = await buildGoSet(st);
  st.scene.add(set.group);
  const mode = p.mode || 'still';

  // light: a warm pool from above; a cool light from AlphaGo's side that can close in on P10
  const keyI = p.key ?? 5;
  const key1 = spot(0xffd9b0, keyI, { pos: [-0.15, 1.3, -0.05], target: [0.02, 0, 0], angle: 0.42, penumbra: 1.0, radius: 6, normalBias: 0.0004 });
  const cool = spot(0x8fbaff, 0, { pos: [0.3, 1.1, 0.35], target: [0.0, 0.0, 0.0], angle: 0.35, penumbra: 1, shadow: 1024, radius: 4, normalBias: 0.0004 });
  st.scene.add(key1, key1.target, cool, cool.target);
  const p10 = set.at(P10[0], P10[1], 0.0046);

  // the machine's view: an additive glow lying on the board
  let hctx = null, htex = null, field = null;
  if (mode === 'heat') {
    const hc = document.createElement('canvas');
    hc.width = hc.height = 1024;
    hctx = hc.getContext('2d');
    htex = new THREE.CanvasTexture(hc);
    htex.colorSpace = THREE.SRGBColorSpace;
    const heat = new THREE.Mesh(new THREE.PlaneGeometry(BOARD.w, BOARD.d), new THREE.MeshBasicMaterial({
      map: htex, color: new THREE.Color(p.heatGain ?? 2.2, p.heatGain ?? 2.2, p.heatGain ?? 2.2), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    heat.rotation.x = -Math.PI / 2;
    heat.position.y = 0.0008;
    heat.renderOrder = 2;
    st.scene.add(heat);
    const taken = new Set(position(set.moves, 36).map((s) => s.i * 19 + s.j));
    field = humanField().filter(([i, j]) => !taken.has(i * 19 + j) && !(i === P10[0] && j === P10[1]));
  }
  const tHeat = cues.heat ?? 0.3, tCount = cues.count ?? 1.6, tFade = cues.fade ?? dur * 0.62, tStone = cues.stone ?? tFade + 0.9;
  const tClose = cues.close ?? tStone + 0.3;
  const SCAN = 1.1;
  const drawHeat = (t) => {
    const g = hctx, n = g.canvas.width;
    g.clearRect(0, 0, n, n);
    const px = (i) => (0.5 + ((i - 9) * BOARD.dx) / BOARD.w) * n;
    const pz = (j) => (0.5 + ((j - 9) * BOARD.dz) / BOARD.d) * n;
    const scanY = lerp(-0.05, 1.08, clamp((t - tHeat) / SCAN)) * n; // the scan runs from White's edge to Black's
    const drain = 1 - sstep(tFade, tFade + 1.4, t);
    if (drain <= 0.001) { htex.needsUpdate = true; return; }
    g.globalCompositeOperation = 'lighter';
    const unit = BOARD.dx / BOARD.w * n;
    for (const [i, j, w] of field) {
      const y = pz(j);
      const reveal = sstep(0, n * 0.06, scanY - y); // lit once the scan has passed
      const k = reveal * drain * (0.92 + 0.08 * Math.sin(t * 2.3 + i * 1.7 + j));
      if (k <= 0.002) continue;
      const v = clamp(w * 0.9);
      // soft bloom of the point
      const r = unit * (0.7 + 1.5 * v);
      const [cr, cg, cb] = ramp(0.25 + 0.75 * v);
      const gr = g.createRadialGradient(px(i), y, 0, px(i), y, r);
      gr.addColorStop(0, `rgba(${cr | 0},${cg | 0},${cb | 0},${0.5 * v * k})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(px(i) - r, y - r, 2 * r, 2 * r);
      // the crisp dot on the intersection
      const d = unit * (0.06 + 0.16 * Math.sqrt(v));
      g.fillStyle = `rgba(${cr | 0},${cg | 0},${cb | 0},${(0.35 + 0.65 * v) * k})`;
      g.beginPath();
      g.arc(px(i), y, d, 0, Math.PI * 2);
      g.fill();
    }
    // the scan line itself
    const sa = sstep(tHeat, tHeat + 0.1, t) * (1 - sstep(tHeat + SCAN - 0.2, tHeat + SCAN, t));
    if (sa > 0.001) {
      const gr = g.createLinearGradient(0, scanY - n * 0.05, 0, scanY + 2);
      gr.addColorStop(0, 'rgba(60,140,255,0)');
      gr.addColorStop(1, `rgba(150,215,255,${0.7 * sa})`);
      g.fillStyle = gr;
      g.fillRect(0, scanY - n * 0.05, n, n * 0.05 + 2);
      g.fillStyle = `rgba(220,245,255,${0.9 * sa})`;
      g.fillRect(0, scanY, n, n * 0.0025);
    }
    // P10: dark in the map; a thin cool ring marks it once the count starts
    const ra = sstep(tCount - 0.4, tCount, t) * (1 - sstep(tStone - 0.2, tStone + 0.3, t));
    if (ra > 0.001) {
      const pulse = 1 + 0.12 * Math.sin((t - tCount) * 5) * Math.exp(-(t - tCount) * 0.8);
      g.strokeStyle = `rgba(120,205,255,${0.95 * ra})`;
      g.lineWidth = n * 0.0028;
      g.beginPath();
      g.arc(px(P10[0]), pz(P10[1]), unit * 0.62 * pulse, 0, Math.PI * 2);
      g.stroke();
    }
    htex.needsUpdate = true;
  };

  const cam = CAMS[p.cam || 'top'];
  if (cam.up) st.camera.up.set(...cam.up);
  const dofOn = p.dof ?? (p.cam === 'edge' || p.cam === 'low' || p.cam === 'macro');
  grade(st, {
    ao: { radius: 0.02, intensity: 1.6 },
    dof: dofOn ? { distance: 0.4, range: p.range ?? (p.cam === 'edge' ? 0.025 : p.cam === 'macro' ? 0.03 : 0.08), bokeh: p.bokeh ?? 4 } : null,
    bloom: { intensity: mode === 'heat' ? 0.55 : 0.3, threshold: 0.75 }, vignette: 0.68, contrast: 0.12, exposure: p.exposure ?? 0.9,
  });
  const focus = V3(...(p.focus || (p.cam === 'edge' ? [0.06, 0, 0.0] : p.cam === 'macro' ? [0.111, 0.004, 0.0] : [0.08, 0, 0])));
  if (st.dof) st.dof.target = focus;

  // the time-lapse: a continuous move count; the newest stone settles in from a few millimetres up
  const lapseN = (t) => {
    const a = cues.a ?? 0.4, b = cues.b ?? dur - 0.6;
    return lerp(p.from ?? 37, p.to ?? 150, ss(clamp((t - a) / (b - a))) * 0.15 + clamp((t - a) / (b - a)) * 0.85);
  };

  return {
    studio: st,
    update(t) {
      let machine = 0;
      if (mode === 'lapse') {
        const nf = lapseN(t);
        const n = Math.floor(nf);
        set.show(n + 1, { drop: (s) => (s.n === n + 1 ? 0.012 * (1 - ss(nf - n)) ** 2 : 0), fade: (s) => (s.n === n + 1 ? (nf - n > 0.02 ? 1 : 0) : 1) });
      } else if (mode === 'heat') {
        const land = clamp((t - tStone) / 0.12);
        set.show(37, land > 0 ? { drop: (s) => (s.n === 37 ? 0.01 * (1 - land) ** 2 : 0) } : { skip: [37] });
        drawHeat(t);
        machine = sstep(tHeat - 0.3, tHeat + 0.5, t) * (1 - sstep(tFade, tFade + 1.4, t));
        // after the stone: the warm light falls away and a cool beam narrows onto P10
        const close = sstep(tClose, tClose + 2.2, t);
        key1.intensity = keyI * (1 - 0.6 * machine) * (1 - 0.72 * close);
        cool.intensity = (p.coolI ?? 9) * close;
        cool.angle = lerp(0.35, 0.05, close);
        cool.target.position.copy(p10);
        cool.position.set(p10.x + 0.18, 1.1, p10.z + 0.25);
      } else {
        set.show(p.n ?? 37);
        if (p.dim) key1.intensity = keyI * (1 - p.dim * ss(clamp(t / dur)));
      }
      st.scene.environmentIntensity = (p.env ?? 0.09) * (1 - 0.5 * machine);
      const r = ss(clamp(t / dur));
      const to = cam.to || cam;
      const b = breathe(t, p.cam === 'top' ? 0.0008 : 0.0015, 7);
      st.camera.position.set(...cam.pos.map((v, i) => lerp(v, to.pos[i], r) + b[i]));
      st.camera.lookAt(...cam.look.map((v, i) => lerp(v, to.look[i], r)));
      if (st.camera.fov !== cam.fov) {
        st.camera.fov = cam.fov;
        st.camera.updateProjectionMatrix();
      }
    },
    overlay(g, t) {
      if (mode === 'heat') {
        // a small tag for the map, top left
        const ma = sstep(tHeat + 0.4, tHeat + 1.0, t) * (1 - sstep(tFade, tFade + 0.8, t));
        caption(g, 120, 150, { en: 'ALPHAGO · POLICY NETWORK', zh: '人类棋手可能落子的位置', a: ma, color: [236, 214, 186], zhSize: 26 });
        // the probability at P10 rolling down to 1 / 10,000
        const a = sstep(tCount - 0.3, tCount + 0.1, t) * (1 - sstep(tFade + 0.4, tFade + 1.2, t));
        if (a > 0.001) {
          st.camera.updateMatrixWorld();
          const [x, y] = toScreen(st.camera, p10);
          const k = clamp((t - tCount) / 1.8);
          const den = Math.round(10 ** (1 + 3 * (1 - (1 - k) ** 2.2)));
          const nice = k >= 1 ? 10000 : den;
          const lx = x + 210, ly = y - 150;
          g.save();
          g.globalAlpha *= a;
          g.strokeStyle = 'rgba(140,210,255,0.8)';
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(x + 24, y - 20);
          g.lineTo(lx - 30, ly + 22);
          g.lineTo(lx - 6, ly + 22);
          g.stroke();
          g.restore();
          text(g, '1 / ', lx, ly - 12, { size: 60, font: FONT.mono, weight: 500, color: [175, 228, 255], a, align: 'left', shadow: 18 });
          const w0 = measure(g, '1 / ', { size: 60, font: FONT.mono, weight: 500 });
          text(g, nice.toLocaleString('en-US'), lx + w0, ly - 12, { size: 60, font: FONT.mono, weight: 700, color: [205, 240, 255], a, align: 'left', shadow: 18 });
          text(g, '人类棋手下出这一手的概率', lx + 2, ly + 52, { size: 28, font: FONT.sans, weight: 500, color: [210, 224, 236], a: a * 0.92, align: 'left', spacing: 2, shadow: 10 });
        }
      }
      if (mode === 'lapse' && cues.curve != null) {
        // AlphaGo's confidence, rising (illustrative: the trend the commentators couldn't see, no numbers)
        const a = sstep(cues.curve, cues.curve + 0.6, t);
        const b = cues.b ?? dur - 0.6;
        const k = clamp((t - cues.curve) / Math.max(0.5, b - cues.curve));
        if (a > 0.001) {
          const x0 = 1330, y0 = 360, w = 460, hh = 190;
          g.save();
          g.globalAlpha *= a;
          g.fillStyle = 'rgba(4,8,14,0.35)';
          g.fillRect(x0 - 30, y0 - hh - 70, w + 60, hh + 100);
          g.strokeStyle = 'rgba(200,210,220,0.3)';
          g.lineWidth = 1;
          g.setLineDash([3, 6]);
          g.beginPath();
          g.moveTo(x0, y0 - hh * 0.5);
          g.lineTo(x0 + w, y0 - hh * 0.5);
          g.stroke();
          g.setLineDash([]);
          g.strokeStyle = 'rgba(200,210,220,0.45)';
          g.beginPath();
          g.moveTo(x0, y0 - hh);
          g.lineTo(x0, y0);
          g.lineTo(x0 + w, y0);
          g.stroke();
          const R = rng(11);
          const pts = [];
          for (let s = 0; s <= 160; s++) {
            const u = s / 160;
            pts.push([x0 + u * w, y0 - hh * (0.5 + 0.4 * ss(clamp((u - 0.08) / 0.85)) + 0.035 * Math.sin(u * 29) * (1 - u) + 0.012 * (R() - 0.5))]);
          }
          const m = Math.max(1, Math.floor(160 * k));
          const fill = g.createLinearGradient(0, y0 - hh, 0, y0);
          fill.addColorStop(0, 'rgba(110,190,255,0.28)');
          fill.addColorStop(1, 'rgba(110,190,255,0)');
          g.fillStyle = fill;
          g.beginPath();
          g.moveTo(pts[0][0], y0);
          for (let s = 0; s <= m; s++) g.lineTo(...pts[s]);
          g.lineTo(pts[m][0], y0);
          g.fill();
          g.strokeStyle = 'rgba(150,215,255,0.98)';
          g.lineWidth = 3;
          g.shadowColor = 'rgba(100,190,255,0.9)';
          g.shadowBlur = 14;
          g.beginPath();
          for (let s = 0; s <= m; s++) (s ? g.lineTo : g.moveTo).call(g, ...pts[s]);
          g.stroke();
          g.fillStyle = 'rgba(225,245,255,1)';
          g.beginPath();
          g.arc(pts[m][0], pts[m][1], 5, 0, Math.PI * 2);
          g.fill();
          g.restore();
          text(g, '50%', x0 - 12, y0 - hh * 0.5, { size: 16, font: FONT.mono, weight: 500, color: [170, 182, 196], a: a * 0.8, align: 'right' });
          caption(g, x0, y0 - hh - 30, { en: 'ALPHAGO · WIN CONFIDENCE', zh: '它对胜利越来越确定（示意）', a, color: [196, 228, 252], zhSize: 24 });
        }
      }
      if (p.quote) quote(g, t, p.quote);
    },
  };
}
