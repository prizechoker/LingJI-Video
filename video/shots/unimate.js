// The first industrial robot, 1961 (archive look): a Unimate tending a die-casting machine at General Motors.
// p.mode: 'work'   (D25) — the arm waits by the closed die; the die opens in a breath of steam (cue `open`), the arm
//                   swings in and reaches between the tie bars, the fingers close on the glowing casting (cue `grip`),
//                   it draws the part out and swings it toward us, orange-hot and smoking (cue `hot`).
//                   Caption "1961 · 通用汽车" from cue `title`.
//         'blind'  (D26) — close on the wrist and the bare gripper waiting at the open die: no camera, no sensor,
//                   nothing to see with; the light falls away (cue `dark`), leaving the steel edged by the hot part's glow.
//         'repeat' (D27) — locked off on the die: cycle after cycle, faster and faster, the part appears at exactly the
//                   same place and the gripper meets it there; earlier cycles stay on the frame like a multiple
//                   exposure (ghost arms trail in motion, but at the pickup every copy falls in perfect register).
//                   A machine readout (X Y Z, never changing) and a cycle counter climbing to 第 1,000 次.
//                   Cues: `each` (the cycles start racing, 每个零件), `same` (registration marks lock on, 同一个位置).
// p: mode, exposure, cam ({ pos, look, fov } override for tests), archive (amount, default 1)
import { Studio, THREE, spot } from '../engine2/core.js';
import { ss, sstep, clamp, lerp, easeOut, easeIn, breathe, grade, caption, text, FONT, measure, toScreen, rng, archive, weave, V3 } from './lib/kit.js';
import { factoryMaterials, buildUnimate, buildDieCaster, buildQuench, buildHall, castingGeometry, smokeSystem, reach, DIE, UNI } from './lib/archive_factory.js';

const CAMS = {
  work: { pos: [-2.4, 1.95, 4.6], to: [-1.8, 1.72, 3.6], look: [0.3, 1.1, 0.7], lookTo: [-0.05, 1.3, 1.2], fov: 34 },
  blind: { pos: [1.42, 1.36, 1.02], to: [1.3, 1.32, 0.94], look: [0.66, 1.22, 0.62], lookTo: [0.66, 1.22, 0.6], fov: 30 },
  repeat: { pos: [2.05, 1.85, 1.75], to: [1.95, 1.8, 1.62], look: [0.6, 1.2, 0.25], lookTo: [0.6, 1.2, 0.22], fov: 32 },
};

// the casting's grasp point (on the moving die, ejected) — the one place every part appears
const PICK = V3(UNI.at.x, DIE.y - 0.03, 0.15);

export async function create({ renderer, scale, p, dur, cues }) {
  const st = new Studio({ scale, renderer });
  const mode = p.mode || 'work';
  await st.hdri('../assets/hdri/machine_shop_02_2k.hdr', { intensity: p.env ?? 0.12, rotation: 2.2 });
  st.scene.background = new THREE.Color(0x0d1013);
  st.scene.fog = new THREE.FogExp2(0x10141a, p.fog ?? 0.06);

  const mats = factoryMaterials(st);
  const hall = buildHall(st, mats);
  st.scene.add(hall.group);
  const dc = buildDieCaster(st, mats);
  st.scene.add(dc.group);
  // more machines down the line, in the haze
  for (const [x, z, ry] of [[-1.5, -6.2, 0], [5.2, -6.0, 0], [8.5, 0.3, Math.PI]]) {
    const m = buildDieCaster(st, mats, { detail: false });
    m.group.position.set(x, 0, z);
    m.group.rotation.y = ry;
    m.setOpen(0.2);
    st.scene.add(m.group);
  }
  const uni = buildUnimate(st, mats);
  uni.group.position.copy(UNI.at);
  st.scene.add(uni.group);
  const quench = buildQuench(mats).build(mats);
  quench.position.set(-0.62, 0, 1.42);
  st.scene.add(quench);

  // the casting (and, for 'repeat', copies of it from earlier cycles)
  const castP = castingGeometry();
  const castMats = { hot: mats.hot };
  const casting = castP.build(castMats);
  casting.matrixAutoUpdate = false;
  st.scene.add(casting);

  // lights: a cool overhead key on the cell, a cold back light from the high windows, the hot part's glow
  const keyI = p.key ?? 230;
  const key = spot(0xc6d6ff, keyI, { pos: [1.2, 6.8, 2.2], target: [0.8, 1.0, 1.0], angle: 0.42, penumbra: 0.9, shadow: 2048, radius: 5, far: 14, bias: -0.0004 });
  const rimI = p.rim ?? 160;
  const rim = spot(0xaec6e8, rimI, { pos: [-2.5, 7.2, -8.0], target: [0.8, 1.2, 1.2], angle: 0.2, penumbra: 0.8, shadow: 1024, radius: 3, far: 20, near: 2 });
  const glow = new THREE.PointLight(0xff7a2a, 0, 5, 2);
  const glow2 = new THREE.PointLight(0xff6a20, 0, 3, 2); // the shot sleeve's pour hole
  glow2.position.set(-0.6, DIE.y - 0.05, 0.3);
  const hemi = new THREE.HemisphereLight(0x6f8090, 0x1c1a18, p.fill ?? 0.12);
  st.scene.add(key, key.target, rim, rim.target, glow, glow2, hemi);

  // smoke and steam
  const smoke = smokeSystem(70, 11);
  st.scene.add(smoke.group);

  grade(st, {
    ao: { radius: 0.25, intensity: 1.5, falloff: 1.0 },
    dof: mode === 'blind' ? { distance: 0.9, range: 0.35, bokeh: 5 } : mode === 'work' ? { distance: 3.5, range: 3.0, bokeh: 3 } : { distance: 2.0, range: 1.6, bokeh: 3 },
    bloom: { intensity: 0.6, threshold: 0.8, radius: 0.8 },
    vignette: 0.5, contrast: 0.1, saturation: -0.05, exposure: p.exposure ?? 1.0,
  });

  // ---------------------------------------------------------------- one machine cycle, as a function of time
  // ev: { open, grip, hot } (absolute times); returns poses for the arm, the die, the casting
  const HOME = { swing: 0.55, pitch: 0.1, ext: 0.02, bend: -0.1, swivel: 0, grip: 0 };
  const AWAY = { swing: 0.95, pitch: 0.18, ext: 0.15, bend: -0.05, swivel: -0.12, grip: 1 };
  const AT = reach(PICK);
  const OUT = { ...AT, ext: 0.02 };
  const mix = (a, b, u) => {
    const o = {};
    for (const k of Object.keys(a)) o[k] = lerp(a[k], b[k] ?? a[k], u);
    return o;
  };
  // a full cycle with its own clock: times relative to the cycle's start, scaled by k (1 = the 'work' pace)
  const cycle = (t, c) => {
    // c: { open, swingIn, extIn, grip, pull, swingOut, close, end }
    let pose = HOME;
    const u1 = ss(clamp((t - c.swingIn[0]) / (c.swingIn[1] - c.swingIn[0])));
    pose = mix(HOME, OUT, u1);
    const u2 = easeOut(clamp((t - c.extIn[0]) / (c.extIn[1] - c.extIn[0])), 2.2);
    pose = mix(pose, AT, u2);
    pose.grip = ss(clamp((t - c.grip) / c.gripDur));
    const u3 = ss(clamp((t - c.pull[0]) / (c.pull[1] - c.pull[0])));
    pose = mix(pose, { ...OUT, grip: 1 }, u3);
    const u4 = ss(clamp((t - c.swingOut[0]) / (c.swingOut[1] - c.swingOut[0])));
    pose = mix(pose, AWAY, u4);
    pose.grip = clamp(pose.grip);
    const open = DIE.open * ss(clamp((t - c.open) / c.openDur)) * (1 - ss(clamp((t - c.close) / c.openDur)));
    const eject = DIE.eject * ss(clamp((t - c.open - c.openDur) / (c.openDur * 0.3)));
    const held = t >= c.grip + c.gripDur * 0.5;
    const shown = t >= c.open - 0.01 || true;
    return { pose, open, eject, held, shown, heat: clamp(1 - Math.max(0, t - c.open) / 14) };
  };
  const castInDie = (open, eject) => new THREE.Matrix4().makeTranslation(open - DIE.open + PICK.x + DIE.eject - eject, PICK.y, PICK.z);

  // the hot look of a casting at "heat" (1 = fresh from the die)
  const hotColor = new THREE.Color();
  const setHeat = (m, h) => {
    const k = clamp(h);
    hotColor.setRGB(1, lerp(0.1, 0.3, k ** 1.5), lerp(0.005, 0.04, k ** 2));
    m.emissive.copy(hotColor);
    m.emissiveIntensity = (p.heat ?? 9) * k ** 1.6;
  };

  // ---------------------------------------------------------------- per-mode timing
  const tOpen = cues.open ?? dur * 0.22;
  const tGrip = cues.grip ?? Math.max(tOpen + 2.2, dur * 0.56);
  const tHot = cues.hot ?? Math.max(tGrip + 1.4, dur * 0.8);
  const workCycle = {
    open: tOpen, openDur: 1.0,
    swingIn: [Math.max(tOpen + 0.2, tGrip - 2.6), tGrip - 1.25], extIn: [tGrip - 1.2, tGrip - 0.12],
    grip: tGrip - 0.05, gripDur: 0.25, pull: [tGrip + 0.35, tGrip + 1.0], swingOut: [tGrip + 0.85, Math.max(tHot + 0.4, tGrip + 2.2)],
    close: tGrip + 1.4,
  };
  const tDark = cues.dark ?? dur * 0.45;
  // repeat: cycle n starts at T(n); durations shrink geometrically after cue "each"
  const tEach = cues.each ?? dur * 0.3;
  const tSame = cues.same ?? dur * 0.62;
  const C0 = Math.max(1.2, tEach); // the first cycle, at a readable pace, fills the time before "each"
  const ratio = 0.62;
  const nCycles = 14;
  const starts = [0];
  {
    let d = C0;
    for (let n = 1; n < nCycles; n++) {
      starts.push(starts[n - 1] + d);
      d = Math.max(0.16, d * ratio);
    }
  }
  const cycleAt = (n) => {
    const t0 = starts[n] - (n === 0 ? 0.35 : 0), d = (n + 1 < starts.length ? starts[n + 1] : starts[n] + 0.16) - starts[n];
    const s = (x) => t0 + x * d;
    // the die is open at the cycle start: the part is there; the arm comes in, takes it, goes; the die cycles
    return {
      open: s(-0.25), openDur: d * 0.18,
      swingIn: [s(0.0), s(0.22)], extIn: [s(0.2), s(0.4)], grip: s(0.42), gripDur: d * 0.06,
      pull: [s(0.5), s(0.64)], swingOut: [s(0.62), s(0.86)], close: s(0.7),
    };
  };
  const cycleIndex = (t) => {
    let n = 0;
    while (n + 1 < starts.length && t >= starts[n + 1]) n++;
    return n;
  };

  // ghosts for 'repeat': additive copies of the moving arm and of the casting
  const ghosts = [];
  const ghostCasts = [];
  if (mode === 'repeat') {
    const ghostMat = (m) => {
      const g = m.clone();
      g.transparent = true;
      g.depthWrite = false;
      g.blending = THREE.AdditiveBlending;
      g.opacity = 0.25;
      return g;
    };
    const cache = new Map();
    for (let k = 0; k < 7; k++) {
      const arm = buildUnimate(st, mats);
      arm.group.position.copy(UNI.at);
      arm.group.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = false;
        o.receiveShadow = false;
        if (!cache.has(o.material)) cache.set(o.material, ghostMat(o.material));
        o.material = cache.get(o.material);
      });
      // only the moving arm shows as a ghost: hide the cabinet
      arm.group.children[0].visible = false;
      st.scene.add(arm.group);
      ghosts.push(arm);
      const gc = castP.build({ hot: ghostMat(mats.hot) });
      gc.matrixAutoUpdate = false;
      st.scene.add(gc);
      ghostCasts.push(gc);
    }
  }

  const cam = p.cam || CAMS[mode];
  const tmpM = new THREE.Matrix4();
  const pickScreen = { x: 0, y: 0 };

  const puffs = [];
  {
    // steam from the parting line as the die opens, and wisps off the hot casting (built per mode, deterministic)
    const R = rng(23);
    const burst = (t0, n, at, spread, col, a = 0.35, up = 0.35) => {
      for (let i = 0; i < n; i++) {
        puffs.push({
          t0: t0 + R() * 0.5, life: 2.2 + R() * 1.8, p: [at[0] + (R() - 0.5) * spread[0], at[1] + (R() - 0.5) * spread[1], at[2] + (R() - 0.5) * spread[2]],
          v: [(R() - 0.5) * 0.3, up * (0.6 + R()), 0.15 + R() * 0.35], s0: 0.15 + R() * 0.15, s1: 0.7 + R() * 0.8, rot: R() * 6, a: a * (0.6 + 0.4 * R()), col,
        });
      }
    };
    if (mode === 'work') {
      burst(tOpen + 0.1, 16, [0.35, DIE.y + 0.1, 0.25], [0.5, 0.5, 0.5], [0.62, 0.66, 0.7], 0.32);
      burst(tOpen - 3.5, 8, [0.35, DIE.y + 0.4, 0.3], [0.5, 0.2, 0.4], [0.55, 0.6, 0.65], 0.18, 0.2);
    } else if (mode === 'blind') {
      burst(-2, 14, [0.4, DIE.y + 0.1, 0.2], [0.5, 0.4, 0.4], [0.5, 0.55, 0.6], 0.2, 0.25);
    } else {
      for (let n = 0; n < nCycles; n++) {
        const c = cycleAt(n);
        burst(c.open + 0.05, n < 3 ? 4 : 1, [0.35, DIE.y + 0.1, 0.25], [0.5, 0.4, 0.4], [0.6, 0.64, 0.68], 0.22);
      }
    }
  }
  const wisp = (t, pos, heat) => {
    // thin smoke rising from the hot part: a ring buffer of puffs keyed to absolute time, spawned at the part's
    // position at their birth (computed by the caller through posAt)
    void t; void pos; void heat;
  };
  void wisp;

  return {
    studio: st,
    update(t) {
      let state;
      if (mode === 'work') {
        state = cycle(t, workCycle);
      } else if (mode === 'blind') {
        // waiting at the open die, empty-handed, the casting glowing behind (a slow breath of the hydraulics)
        const pose = mix(OUT, AT, 0.18);
        pose.ext += 0.004 * Math.sin(t * 1.3);
        pose.grip = 0;
        state = { pose, open: DIE.open, eject: DIE.eject, held: false, heat: 0.9 };
      } else {
        const n = cycleIndex(t);
        state = cycle(t, cycleAt(n));
      }
      uni.pose(state.pose);
      dc.setOpen(state.open);
      uni.group.updateMatrixWorld(true);
      // the casting: in the die until the fingers close, then in the hand
      if (state.held) casting.matrix.copy(uni.graspMatrix());
      else casting.matrix.copy(castInDie(state.open, state.eject));
      casting.matrixWorldNeedsUpdate = true;
      setHeat(mats.hot, state.heat);
      glow.position.setFromMatrixPosition(casting.matrix);
      glow.position.y += 0.05;
      glow.intensity = (p.glow ?? 2.2) * state.heat ** 1.6 * (state.open > 0.05 || state.held ? 1 : 0.15);
      glow2.intensity = 0.4 + 0.1 * Math.sin(t * 7.3) * Math.sin(t * 3.1);

      // ghosts: earlier cycles (repeat), each a fixed fraction of its own cycle behind the live one
      if (mode === 'repeat') {
        const n = cycleIndex(t);
        const amt = sstep(tEach - 0.2, tEach + 0.6, t);
        for (let k = 0; k < ghosts.length; k++) {
          const lag = (k + 1) * 0.11;
          const nn = n, c = cycleAt(nn);
          const d = (nn + 1 < starts.length ? starts[nn + 1] : starts[nn] + 0.16) - starts[nn];
          const tg = t - lag * d;
          const cg = tg < starts[nn] && nn > 0 ? cycleAt(nn - 1) : c;
          const sg = cycle(tg, cg);
          ghosts[k].pose(sg.pose);
          ghosts[k].group.visible = amt > 0.01;
          ghosts[k].group.updateMatrixWorld(true);
          const op = 0.22 * amt * (1 - k / ghosts.length);
          ghosts[k].group.traverse((o) => { if (o.isMesh) o.material.opacity = 0.16 * amt; });
          // the part copies: every cycle's casting, held where it was taken, in register
          const gc = ghostCasts[k];
          gc.visible = amt > 0.01 && n - k - 1 >= 0;
          gc.matrix.copy(castInDie(DIE.open, DIE.eject));
          gc.matrixWorldNeedsUpdate = true;
          void op;
        }
      }

      // smoke
      smoke.draw(t, puffs);

      // light: the blind shot dims
      if (mode === 'blind') {
        const dk = ss(clamp((t - tDark) / 1.1));
        key.intensity = keyI * (1 - 0.82 * dk);
        rim.intensity = rimI * (1 - 0.6 * dk);
        hemi.intensity = (p.fill ?? 0.25) * (1 - 0.7 * dk);
        st.scene.environmentIntensity = (p.env ?? 0.12) * (1 - 0.7 * dk);
      }

      // camera
      const r = ss(clamp(t / dur));
      const pos = cam.pos.map((v, i) => lerp(v, (cam.to || cam.pos)[i], r));
      const look = cam.look.map((v, i) => lerp(v, (cam.lookTo || cam.look)[i], r));
      const b = breathe(t, mode === 'repeat' ? 0.0006 : 0.003, 4);
      st.camera.position.set(pos[0] + b[0], pos[1] + b[1], pos[2] + b[2]);
      st.camera.lookAt(...look);
      const w = weave(t, 0.0013, 9);
      st.camera.rotation.y += w[0];
      st.camera.rotation.x += w[1];
      if (st.camera.fov !== cam.fov) {
        st.camera.fov = cam.fov;
        st.camera.updateProjectionMatrix();
      }
      if (st.dof) st.dof.target = mode === 'blind' ? uni.graspWorld() : mode === 'work' ? V3(...look) : PICK.clone();
      st.camera.updateMatrixWorld();
      const sp = toScreen(st.camera, PICK);
      pickScreen.x = sp[0];
      pickScreen.y = sp[1];
    },
    overlay(g, t) {
      archive(g, t, { amount: p.archive ?? 1, seed: 61, tint: [255, 228, 192] });
      // an extra fade toward monochrome for 1961
      g.save();
      g.globalCompositeOperation = 'saturation';
      g.fillStyle = `rgba(128,128,128,${0.25 * (p.archive ?? 1)})`;
      g.fillRect(0, 0, 1920, 1080);
      g.restore();
      if (mode === 'work') {
        const tT = cues.title ?? 0.5;
        const a = sstep(tT, tT + 0.9, t) * (1 - sstep(Math.min(dur - 0.6, tT + 4.5), Math.min(dur, tT + 5.3), t));
        caption(g, 120, 172, { en: 'UNIMATE · GENERAL MOTORS', zh: '1961 · 通用汽车', a, color: [236, 228, 212], zhSize: 30, rule: 120 });
      }
      if (mode === 'repeat') {
        const n = cycleIndex(t);
        // the counter: real cycles first, then it runs away to a thousand
        const run = sstep(tEach, dur - 0.3, t);
        const shown = Math.max(n + 1, Math.round(1 + 999 * easeIn(clamp((t - tEach) / Math.max(0.5, dur - 0.35 - tEach)), 2.4)));
        const count = t >= dur - 0.35 ? 1000 : shown;
        void run;
        const a = sstep(0.2, 0.6, t);
        const X = 120, Y = 196;
        caption(g, X, 172, { en: 'CYCLE', a, rule: 110, color: [226, 222, 212] });
        const label = `第 ${count.toLocaleString('en-US')} 次`;
        text(g, label, X, Y + 40, { size: 64, font: FONT.sans, weight: 500, color: [238, 232, 220], a, align: 'left', spacing: 2, shadow: 18, shadowColor: 'rgba(0,0,0,0.85)' });
        // machine readout: the pick position, the same every time
        const ra = sstep(tEach - 0.3, tEach + 0.3, t);
        const lock = sstep(tSame - 0.1, tSame + 0.35, t);
        const col = [lerp(214, 240, lock), lerp(222, 206, lock), lerp(230, 140, lock)];
        text(g, 'X 412.0   Y 118.0   Z 236.0', X, Y + 112, { size: 30, font: FONT.mono, weight: 500, color: col, a: ra, align: 'left', spacing: 1, shadow: 14 });
        text(g, 'PICK POSITION · mm', X, Y + 150, { size: 14, font: FONT.mono, weight: 500, color: [170, 176, 184], a: ra * 0.9, align: 'left', spacing: 3 });
        // registration marks on the pick point
        if (lock > 0.001) {
          const { x, y } = pickScreen;
          const r0 = lerp(120, 46, ss(lock));
          g.save();
          g.globalAlpha *= lock;
          g.strokeStyle = 'rgba(240,206,140,0.95)';
          g.lineWidth = 1.6;
          for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            g.beginPath();
            g.moveTo(x + sx * r0, y + sy * (r0 - 16));
            g.lineTo(x + sx * r0, y + sy * r0);
            g.lineTo(x + sx * (r0 - 16), y + sy * r0);
            g.stroke();
          }
          g.beginPath();
          g.moveTo(x - 10, y);
          g.lineTo(x + 10, y);
          g.moveTo(x, y - 10);
          g.lineTo(x, y + 10);
          g.stroke();
          g.restore();
        }
      }
    },
  };
}
