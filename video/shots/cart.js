// The Stanford Cart, 1979 (archive look): Moravec's cart crossing a room full of chairs, one lurch at a time.
// p.mode: 'room'  (C20) — a slow, low dolly through the chair legs reveals the cart waiting at the start of its course
//                  (masking-tape cross on the floor, tally lamp on). Caption "1979 · 斯坦福大学" from cue `title`.
//         'crawl' (C21) — a locked-off time-lapse down the room: the cart scoots forward in one-metre lurches, its camera
//                  zipping along the slider, the sun's window patches and the wall clock racing; a large elapsed-time
//                  readout races 00:00:00 -> 05:00:00 and lands at cue `five`(+~1 s). Then one cycle at a readable
//                  pace: the last metre (cue `stop`), nine pictures along the slider with a flash each (cue `photo`),
//                  and the long stillness while the readout races through twelve minutes (cue `think`).
// p: mode, cam (optional override { pos, look, fov } for tests), exposure, dof (bool, room default true)
// cues (seconds from the shot start): room: title; crawl: five, stop, photo, think
import { Studio, THREE } from '../engine2/core.js';
import { ss, sstep, clamp, lerp, easeOut, breathe, grade, caption, text, FONT, measure, rng, archive, weave, V3 } from './lib/kit.js';
import { buildCart, CART, chairMaterials, buildChair } from './lib/archive_cart.js';
import { buildLab } from './lib/archive_lab.js';
import { captureEnv } from './lib/archive_util.js';

// the course, on the floor (x, z): from the start cross near the far wall toward the near end of the room
const COURSE = [[1.2, -5.9], [0.75, -4.9], [0.05, -3.9], [-0.2, -2.9], [0.15, -1.9], [0.6, -0.9]];

// the chairs: [type, x, z, rotY, options]
const CHAIRS = [
  ['steel', 2.35, -6.35, 2.4, { pad: 'vinylOrange', tube: 'chrome' }],
  ['wood', -0.75, -6.75, -0.6, {}],
  ['folding', 1.95, -4.75, 1.1, { paint: 'tan' }],
  ['shell', -1.55, -5.4, 0.4, { shell: 'shellBlue', tube: 'chrome' }],
  ['steel', 1.05, -3.35, -2.2, { pad: 'vinylBrown', tube: 'tubeBlack' }],
  ['folding', -2.35, -2.95, 2.9, { paint: 'greyPaint' }],
  ['steel', -0.45, -4.85, 0.9, { pad: 'vinylOrange', tube: 'chrome' }],
  ['wood', 1.65, -2.05, -0.9, {}],
  ['steel', -0.95, -1.25, 0.8, { pad: 'vinylOlive', tube: 'chrome' }],
  ['shell', 2.55, -0.55, 3.6, { shell: 'shellBeige', tube: 'tubeBlack' }],
  ['wood', -2.65, -4.05, 1.9, {}],
  ['steel', 3.15, -3.4, -0.3, { pad: 'vinylOrange', tube: 'chrome' }],
  ['folding', -2.85, -7.35, -1.2, { paint: 'tan' }],
  ['steel', 0.25, -8.25, 0.2, { pad: 'vinylBrown', tube: 'tubeBlack' }],
  ['folding', 1.95, 0.75, 2.2, { paint: 'tan' }],
  ['wood', 3.45, -5.85, 0.9, {}],
  ['shell', -2.2, -1.9, -2.6, { shell: 'shellBlue', tube: 'chrome' }],
  ['wood', 3.2, -7.6, 2.6, {}],
  ['steel', 1.7, -8.2, -0.4, { pad: 'vinylOlive', tube: 'chrome' }],
  ['folding', 3.95, -6.55, -1.9, { paint: 'greyPaint' }],
  ['shell', 0.35, -7.45, 1.3, { shell: 'shellBeige', tube: 'chrome' }],
];

const CAMS = {
  room: { pos: [-0.72, 0.34, -4.0], to: [-0.3, 0.38, -3.57], look: [1.15, 0.44, -5.85], lookTo: [1.2, 0.47, -5.9], fov: 32 },
  crawl: { pos: [-1.35, 1.38, 1.9], to: [-1.1, 1.3, 1.45], look: [0.3, 0.4, -3.0], lookTo: [0.55, 0.42, -1.2], fov: 36 },
};

const HMS = (sec) => {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export async function create({ renderer, scale, p, dur, cues }) {
  const st = new Studio({ scale, renderer });
  const mode = p.mode || 'room';
  st.scene.background = new THREE.Color(0x0b0a09);

  const lab = buildLab(st);
  st.scene.add(lab.group);
  const hemi = new THREE.HemisphereLight(0xe9efe4, 0x5c544a, p.fill ?? 0.13);
  st.scene.add(hemi);

  // chairs
  const cm = chairMaterials(st);
  for (const [type, x, z, ry, o] of CHAIRS) {
    const c = buildChair(type, cm, o);
    c.position.set(x, 0, z);
    c.rotation.y = ry;
    st.scene.add(c);
  }

  // the course and the start cross in masking tape
  const curve = new THREE.CatmullRomCurve3(COURSE.map(([x, z]) => V3(x, 0, z)), false, 'centripetal');
  const L = curve.getLength();
  const tapeMat = new THREE.MeshPhysicalMaterial({ color: 0xd2c6a2, roughness: 0.8 });
  const start = curve.getPointAt(0), t0 = curve.getTangentAt(0);
  for (const a of [0, Math.PI / 2]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.0012, 0.32), tapeMat);
    m.position.set(start.x, 0.0006, start.z);
    m.rotation.y = Math.atan2(t0.x, t0.z) + a;
    m.receiveShadow = true;
    st.scene.add(m);
  }

  const cart = buildCart(st);
  st.scene.add(cart.group);
  cart.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  // the picture flash: a small light at the lens, plus a glint sprite
  const flash = new THREE.PointLight(0xf4f6ff, 0, 4, 2);
  st.scene.add(flash);
  const glintTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.15, 'rgba(255,250,240,0.6)');
    gr.addColorStop(1, 'rgba(255,240,220,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTex, color: new THREE.Color(4, 4, 4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  glint.scale.set(0.05, 0.05, 0.05);
  st.scene.add(glint);

  // the room's own light as the environment (captured once, mid-room, cart and flash hidden)
  {
    const s0 = mode === 'room' ? { az: -0.2, el: 0.33, I: 6, ...(p.sun || {}) } : { az: -0.1, el: 0.48, I: 5.6 };
    lab.setSun(s0.az, s0.el, s0.I);
  }
  const envRT = await captureEnv(st, V3(0.3, 1.1, -3.2), { hide: [cart.group, glint] });
  st.scene.environmentIntensity = p.env ?? 0.55;

  const dofOn = p.dof ?? mode === 'room';
  grade(st, {
    ao: { radius: 0.12, intensity: 1.6, falloff: 0.8 },
    dof: dofOn ? { distance: 2.7, range: 1.5, bokeh: 5 } : null,
    bloom: { intensity: 0.35, threshold: 0.85, radius: 0.8 },
    vignette: 0.45, contrast: 0.06, saturation: -0.08, exposure: p.exposure ?? 0.95,
  });

  // ---------------------------------------------------------------- timing
  const tFive = cues.five ?? 0.45;
  const tStop = cues.stop ?? Math.max(tFive + 1.0, dur * 0.36);
  const tPhoto = cues.photo ?? Math.max(tStop + 0.7, dur * 0.56);
  const tThink = cues.think ?? Math.max(tPhoto + 0.8, dur * 0.76);
  const tLock = Math.max(tFive + 0.35, Math.min(tFive + 0.7, tStop - 0.6));
  // beat 1 (time-lapse): N1 lurches over s in [0, L - 1], driven by the racing clock; beat 2: the last metre
  const N1 = 4;
  const run = (t) => easeOut(clamp(t / tLock), 1.6); // fraction of the five hours shown
  const m0 = tStop - 0.75, m1 = tStop + 0.35; // the last metre
  const PH = { a: tPhoto - 0.05, b: Math.min(tThink + 0.15, tPhoto + 1.25) }; // nine pictures
  const shots9 = Array.from({ length: 9 }, (_, k) => PH.a + ((k + 0.6) / 9.2) * (PH.b - PH.a));
  // lurch events (start, end of each move) for the antenna and body dynamics
  const events = [];
  for (let k = 0; k < N1; k++) {
    // invert run(): the time at which run(t) = u
    const tAt = (u) => tLock * (1 - (1 - u) ** (1 / 1.6));
    const a = tAt(k / N1), b = tAt((k + 0.42) / N1);
    events.push([a, b, (L - 1.0) / N1]);
  }
  events.push([m0, m1, 1.0]);
  const sAt = (t) => {
    if (mode === 'room') return 0;
    let s = 0;
    for (const [a, b, d] of events) s += d * ss(clamp((t - a) / (b - a)));
    return s;
  };
  // damped responses to each start (lean back) and stop (lean forward)
  const response = (t, f, zeta, gain) => {
    let v = 0;
    for (const [a, b, d] of events) {
      const vel = d / Math.max(0.05, b - a);
      for (const [te, sg] of [[a + (b - a) * 0.3, -1], [b, 1]]) {
        const tau = t - te;
        if (tau < 0) continue;
        const w = 2 * Math.PI * f;
        v += sg * gain * Math.min(1.5, vel) * Math.exp(-zeta * w * tau) * Math.sin(w * tau);
      }
    }
    return v;
  };
  // the slider during the time-lapse: a zip across in each hold, flashes along the way
  const holdSweeps = [];
  for (let k = 0; k < N1; k++) {
    const b = events[k][1], next = k + 1 < N1 ? events[k + 1][0] : m0;
    holdSweeps.push([b + 0.02, next - 0.02, k % 2 === 0 ? 1 : -1]);
  }
  const slideAt = (t) => {
    if (mode === 'room') return -CART.slide;
    let x = -CART.slide;
    for (const [a, b, dir] of holdSweeps) {
      if (t >= a) x = dir > 0 ? lerp(-CART.slide, CART.slide, ss(clamp((t - a) / (b - a)))) : lerp(CART.slide, -CART.slide, ss(clamp((t - a) / (b - a))));
    }
    // the last sweep left it at -slide (N1 odd) — the nine pictures go from -slide to +slide in 6.5 cm steps
    if (t >= PH.a) {
      x = -CART.slide;
      for (let k = 0; k < 9; k++) {
        if (t >= shots9[k] + 0.03 && k < 8) {
          const nextT = k + 1 < 9 ? shots9[k + 1] : PH.b;
          const st0 = shots9[k] + 0.03, st1 = st0 + Math.min(0.09, (nextT - st0) * 0.7);
          x = -CART.slide + 0.065 * (k + ss(clamp((t - st0) / (st1 - st0))));
        }
      }
    }
    return x;
  };
  const flashAt = (t) => {
    let f = 0;
    const pulse = (tp) => (t >= tp ? Math.exp(-(t - tp) / 0.045) : 0);
    if (mode === 'crawl') {
      for (const tp of shots9) f = Math.max(f, pulse(tp));
      for (const [a, b] of holdSweeps) for (let q = 0; q < 3; q++) f = Math.max(f, 0.8 * pulse(a + ((q + 0.5) / 3) * (b - a)));
    }
    return f;
  };
  // elapsed time in the run (seconds) and in the shown metre
  const totalAt = (t) => 5 * 3600 * run(t);
  const cycleAt = (t) => {
    // rolling ~25 s, nine pictures ~1.5 min, thinking ~11 min (time races)
    const roll = 25 * ss(clamp((t - m0) / (m1 - m0)));
    const pics = 70 * clamp((t - PH.a) / (PH.b - PH.a));
    const think = 690 * easeOut(clamp((t - tThink) / Math.max(0.6, dur - tThink - 0.25)), 1.7);
    return roll + pics + think;
  };

  // clock on the wall (hours), the sun (afternoon -> evening over the run; the think adds its twelve minutes x3)
  const hourAt = (t) => (mode === 'room' ? 12 + 9 / 60 : 12 + 9 / 60 + totalAt(t) / 3600 + cycleAt(t) / 3600 * (t > tStop - 0.35 ? 1 : 0) * 3);
  const sunAt = (t) => {
    if (mode === 'room') return { az: -0.2, el: 0.33, I: 6, warm: 0.4, ...(p.sun || {}) };
    const hr = hourAt(t);
    const k = clamp((hr - 12) / 5.4);
    return { az: lerp(-0.55, 0.42, k), el: lerp(0.62, 0.3, k), I: lerp(6, 5, k), warm: k, ...(p.sun || {}) };
  };

  const pathPose = (s) => {
    const u = clamp(s / L);
    const pos = curve.getPointAt(u), tan = curve.getTangentAt(u);
    const u2 = clamp((s + 0.08) / L), u1 = clamp((s - 0.08) / L);
    const ta = curve.getTangentAt(u1), tb = curve.getTangentAt(u2);
    const dth = Math.atan2(tb.x, tb.z) - Math.atan2(ta.x, ta.z);
    const kappa = dth / Math.max(0.01, (u2 - u1) * L);
    return { pos, yaw: Math.atan2(tan.x, tan.z), steer: Math.atan(CART.base * 2 * kappa) };
  };

  const cam = p.cam || CAMS[mode];
  const sunCol = new THREE.Color();

  return {
    studio: st,
    dispose() {
      envRT.dispose();
    },
    update(t) {
      // ---- cart
      const s = sAt(t);
      const pp = pathPose(s);
      cart.group.position.copy(pp.pos);
      cart.group.rotation.y = pp.yaw;
      const sway0 = mode === 'crawl' ? response(t, 1.3, 0.08, 0.05) : 0;
      const sway1 = mode === 'crawl' ? response(t, 2.6, 0.1, 0.03) : 0;
      const pitch = mode === 'crawl' ? response(t, 3.2, 0.35, 0.006) : 0;
      const fl = flashAt(t);
      cart.pose({ roll: s, steerA: clamp(pp.steer, -0.45, 0.45), slide: slideAt(t), pitch, sway: [sway0, sway1], lamp: mode === 'room' ? 0.7 : 0.35 + 0.65 * fl });
      cart.group.updateMatrixWorld(true);
      const lens = cart.lensWorld();
      flash.position.copy(lens);
      flash.intensity = 2.5 * fl;
      glint.position.copy(lens);
      glint.material.opacity = Math.min(1, fl * 1.2);
      glint.visible = fl > 0.01;
      // ---- light and time
      const sun = sunAt(t);
      lab.setSun(sun.az, sun.el, sun.I);
      sunCol.setRGB(1, lerp(0.93, 0.82, sun.warm), lerp(0.84, 0.66, sun.warm));
      lab.sun.color.copy(sunCol);
      lab.setClock(hourAt(t));
      // ---- camera
      const r = mode === 'room' ? ss(clamp(t / dur)) : ss(clamp((t - tStop + 0.8) / Math.max(1, dur - tStop + 0.8)));
      const pos = cam.pos.map((v, i) => lerp(v, (cam.to || cam.pos)[i], r));
      const look = cam.look.map((v, i) => lerp(v, (cam.lookTo || cam.look)[i], r));
      const b = breathe(t, mode === 'room' ? 0.004 : 0.0015, 11);
      st.camera.position.set(pos[0] + b[0], pos[1] + b[1], pos[2] + b[2]);
      st.camera.lookAt(...look);
      const w = weave(t, 0.0011, 5);
      st.camera.rotation.y += w[0];
      st.camera.rotation.x += w[1];
      if (st.camera.fov !== cam.fov) {
        st.camera.fov = cam.fov;
        st.camera.updateProjectionMatrix();
      }
      if (st.dof) st.dof.target = mode === 'room' ? V3(1.2, 0.45, -5.9) : lens;
    },
    overlay(g, t) {
      archive(g, t, { amount: p.archive ?? 0.8, seed: 79, tint: [255, 230, 200] });
      if (mode === 'room') {
        const tT = cues.title ?? 0.6;
        const a = sstep(tT, tT + 0.9, t) * (1 - sstep(dur - 0.5, dur, t));
        caption(g, 120, 172, { en: 'STANFORD ARTIFICIAL INTELLIGENCE LAB', zh: '1979 · 斯坦福大学', a, color: [236, 228, 212], zhSize: 30, rule: 120 });
        return;
      }
      // ---- crawl: the readouts (top left, under the chapter tag; p.readout = 'right' for the top right)
      const R = p.readout === 'right';
      const X = R ? 1800 : 120, al = R ? 'right' : 'left', dir = R ? -1 : 1;
      const aIn = sstep(0.0, 0.25, t);
      const sw = sstep(tStop - 0.3, tStop + 0.05, t); // switch from the total to the metre
      const sh = { shadow: 18, shadowColor: 'rgba(0,0,0,0.85)' };
      // the total: races, lands gold, then shrinks into a small tag above the metre clock
      {
        const tot = totalAt(t);
        const landed = sstep(tLock - 0.08, tLock + 0.12, t);
        const size = lerp(92, 24, sw);
        const y = lerp(232, 168, sw);
        const col = [lerp(238, 236, landed), lerp(234, 200, landed), lerp(226, 128, landed)];
        caption(g, X, 172, { en: 'ELAPSED', a: aIn * (1 - sw), align: al, rule: 110, color: [226, 222, 212] });
        let x = X;
        if (sw > 0.001) {
          const ta = sstep(0.5, 1, sw);
          const w = text(g, '全程 ', X, y, { size: 22, font: FONT.sans, weight: 500, color: [214, 200, 172], a: ta, align: al, spacing: 2, ...sh });
          x = X + dir * w;
        }
        text(g, HMS(tot), x, y, { size, font: FONT.mono, weight: 500, color: col, a: aIn, align: al, spacing: lerp(3, 2, sw), ...sh });
        const la = landed * (1 - sw);
        if (la > 0.001) text(g, '五小时 · 穿过一个房间', X, 306, { size: 30, font: FONT.sans, weight: 500, color: [236, 216, 176], a: la, align: al, spacing: 3, shadow: 14 });
      }
      // the metre: a + clock and its stage
      if (sw > 0.001) {
        const c = cycleAt(t);
        const thinking = sstep(tThink - 0.05, tThink + 0.2, t);
        const col = [lerp(222, 150, thinking), lerp(232, 214, thinking), lerp(238, 255, thinking)];
        text(g, '+' + HMS(c), X - dir * 4, 232, { size: 84, font: FONT.mono, weight: 500, color: col, a: sw, align: al, spacing: 3, ...sh });
        const stage = t < PH.a - 0.02 ? 0 : t < tThink - 0.05 ? 1 : 2;
        const labels = [['LURCH · 1 m', '前进一米'], ['SLIDER STEREO · 9 FRAMES', '停下拍照'], ['THINKING · KL-10', '计算 · 十几分钟']];
        const [en, zh] = labels[stage];
        const st0 = [m0 - 0.2, PH.a - 0.02, tThink - 0.05][stage];
        const la = sw * sstep(st0, st0 + 0.25, t);
        caption(g, X, 296, { en, zh, a: la, align: al, color: [228, 232, 236], zhSize: 26, rule: 150 });
        if (stage >= 1) {
          // nine pictures: a dot per frame, filled as each is taken
          const n = shots9.filter((tp) => t >= tp).length;
          const zw = measure(g, zh, { size: 26, font: FONT.sans, weight: 500, spacing: 1 });
          for (let k = 0; k < 9; k++) {
            const x = R ? X - zw - 30 - (8 - k) * 17 : X + zw + 26 + k * 17, y = 296 + 10 + 26 * 0.55;
            g.save();
            g.globalAlpha *= la * (stage === 2 ? 0.6 : 1);
            g.beginPath();
            g.arc(x, y, 5, 0, Math.PI * 2);
            if (k < n) {
              g.fillStyle = 'rgba(240,236,224,0.95)';
              g.fill();
            } else {
              g.strokeStyle = 'rgba(240,236,224,0.6)';
              g.lineWidth = 1.2;
              g.stroke();
            }
            g.restore();
          }
        }
      }
    },
  };
}
