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
  work: { pos: [-3.2, 2.25, 5.5], to: [-1.65, 1.62, 3.15], look: [0.35, 1.05, 0.7], lookTo: [-0.45, 1.36, 1.5], fov: 34, fovTo: 31 },
  blind: { pos: [0.36, 1.37, -0.06], to: [0.39, 1.35, 0.03], look: [0.7, 1.25, 0.62], lookTo: [0.69, 1.25, 0.6], fov: 36 },
  repeat: { pos: [-0.38, 2.7, 0.24], to: [-0.36, 2.66, 0.22], look: [0.7, 1.12, 0.06], lookTo: [0.7, 1.12, 0.06], fov: 27 },
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
  quench.position.set(2.15, 0, 1.25);
  st.scene.add(quench);

  // the casting (and, for 'repeat', copies of it from earlier cycles)
  const castP = castingGeometry();
  const castMats = { hot: mats.hot };
  const casting = castP.build(castMats);
  casting.matrixAutoUpdate = false;
  st.scene.add(casting);

  // lights: a cool overhead key on the cell, a cold back light from the high windows, the hot part's glow
  const keyI = p.key ?? 230;
  const key = spot(0xc6d6ff, keyI, { pos: [1.2, 6.8, 2.2], target: [0.6, 1.0, 1.2], angle: 0.3, penumbra: 0.9, shadow: 2048, radius: 5, far: 14, bias: -0.0004 });
  const rimI = p.rim ?? 160;
  const rim = spot(0xaec6e8, rimI, { pos: [-2.5, 7.2, -8.0], target: [0.8, 1.2, 1.2], angle: 0.2, penumbra: 0.8, shadow: 1024, radius: 3, far: 20, near: 2 });
  const glow = new THREE.PointLight(0xff7a2a, 0, 5, 2);
  const glow2 = new THREE.PointLight(0xff6a20, 0, 3, 2); // the shot sleeve's pour hole
  glow2.position.set(-0.6, DIE.y - 0.05, 0.3);
  const hemi = new THREE.HemisphereLight(0x6f8090, 0x1c1a18, p.fill ?? 0.12);
  if (mode === 'blind') key.castShadow = false; // too close for its shadow map: let AO do the contact shading
  st.scene.add(key, key.target, rim, rim.target, glow, glow2, hemi);

  // smoke and steam
  const smoke = smokeSystem(70, 11);
  st.scene.add(smoke.group);

  grade(st, {
    ao: { radius: 0.25, intensity: 1.5, falloff: 1.0 },
    dof: mode === 'blind' ? { distance: 0.7, range: 0.3, bokeh: 6 } : mode === 'work' ? { distance: 3.5, range: 3.0, bokeh: 3 } : { distance: 2.0, range: 0.7, bokeh: 4 },
    bloom: { intensity: 0.6, threshold: 0.8, radius: 0.8 },
    vignette: 0.5, contrast: 0.1, saturation: -0.05, exposure: p.exposure ?? 1.0,
  });

  // ---------------------------------------------------------------- one machine cycle, as a function of time
  // ev: { open, grip, hot } (absolute times); returns poses for the arm, the die, the casting
  const HOME = { swing: 0.55, pitch: 0.1, ext: 0.02, bend: -0.1, swivel: 0, grip: 0 };
  const AWAY = { swing: 1.3, pitch: 0.15, ext: 0.22, bend: 0.12, swivel: -0.8, grip: 1 };
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
    return { pose, open, eject, held, heat: clamp(1 - Math.max(0, t - c.open) / 40) };
  };
  const castInDie = (open, eject) => new THREE.Matrix4().makeTranslation(open - DIE.open + PICK.x + DIE.eject - eject, PICK.y, PICK.z);

  // the hot look of a casting at "heat" (1 = fresh from the die)
  const hotColor = new THREE.Color();
  const setHeat = (m, h) => {
    const k = clamp(h);
    hotColor.setRGB(1, lerp(0.1, 0.3, k ** 1.5), lerp(0.005, 0.04, k ** 2));
    m.emissive.copy(hotColor);
    m.emissiveIntensity = (p.heat ?? 2.8) * k ** 1.6;
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
  // the first cycle at a readable pace fills the time before "each"; then they come faster and faster
  const starts = [-0.45];
  {
    let d = Math.max(1.4, tEach + 0.45);
    while (starts[starts.length - 1] < dur + 1) {
      starts.push(starts[starts.length - 1] + d);
      d = Math.max(0.2, d * 0.6);
    }
  }
  const cycleIndex = (t) => {
    let n = 0;
    while (n + 1 < starts.length && t >= starts[n + 1]) n++;
    return n;
  };
  // a repeat cycle by phase: the die stays open; each new casting is pushed out of the die face at the same place
  // (u 0..0.1), the arm comes in and takes it (grip at u 0.47) and carries it away out of frame
  const SIDE = { ...HOME, swing: -0.6, pitch: 0.12 };
  const repeatState = (t) => {
    const n = cycleIndex(t), d = starts[n + 1] - starts[n], u = (t - starts[n]) / d;
    let pose = mix(SIDE, OUT, ss(clamp((u - 0.04) / 0.26)));
    pose = mix(pose, AT, easeOut(clamp((u - 0.28) / 0.17), 2.2));
    pose.grip = ss(clamp((u - 0.45) / 0.05));
    pose = mix(pose, { ...OUT, grip: 1 }, ss(clamp((u - 0.55) / 0.13)));
    pose = mix(pose, { ...SIDE, grip: 1 }, ss(clamp((u - 0.66) / 0.26)));
    pose.grip = clamp(pose.grip) * (1 - ss(clamp((u - 0.93) / 0.05)));
    const held = u >= 0.48 && u < 0.93;
    const present = u < 0.48;
    const eject = DIE.eject * ss(clamp(u / 0.09));
    return { pose, open: DIE.open, eject: n === 0 ? DIE.eject : eject, held, present, gone: u >= 0.93, heat: n === 0 ? 1 : clamp(0.6 + u * 4), n, u, d };
  };

  // ghosts for 'repeat': additive copies of the moving arm and of the casting
  const ghosts = [];
  const ghostCasts = [];
  if (mode === 'repeat') {
    // a ghost is a clean translucent solid: a depth-only pre-pass, then its colour blended once over the frame
    const pre = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, transparent: true });
    var ghostHot = mats.hot.clone();
    ghostHot.emissive.setRGB(1, 0.25, 0.03);
    ghostHot.emissiveIntensity = 3;
    const cache = new Map();
    const ghostMat = (m) => {
      if (cache.has(m)) return cache.get(m);
      const g = m.clone();
      g.transparent = true;
      g.depthWrite = false;
      g.opacity = 0.2;
      cache.set(m, g);
      return g;
    };
    const ghostify = (grp) => {
      const meshes = [];
      grp.traverse((o) => { if (o.isMesh) meshes.push(o); });
      for (const o of meshes) {
        o.castShadow = o.receiveShadow = false;
        o.material = ghostMat(o.material);
        o.renderOrder = 2;
        const d = new THREE.Mesh(o.geometry, pre);
        d.renderOrder = 1;
        o.add(d);
      }
    };
    for (let k = 0; k < 5; k++) {
      const arm = buildUnimate(st, mats);
      arm.group.position.copy(UNI.at);
      arm.group.children[0].visible = false; // the cabinet stays solid; only the moving arm leaves ghosts
      ghostify(arm.group);
      st.scene.add(arm.group);
      ghosts.push(arm);
      const gc = castP.build({ hot: ghostHot });
      ghostify(gc);
      gc.matrixAutoUpdate = false;
      st.scene.add(gc);
      ghostCasts.push(gc);
    }
  }

  const ghostMats = [];
  for (const gh of ghosts) gh.group.traverse((o) => { if (o.isMesh && o.material.transparent && o.material.colorWrite !== false && !ghostMats.includes(o.material)) ghostMats.push(o.material); });
  for (const gc of ghostCasts) gc.traverse((o) => { if (o.isMesh && o.material.colorWrite !== false && !ghostMats.includes(o.material)) ghostMats.push(o.material); });
  const cam = p.cam || CAMS[mode];
  const pickScreen = { x: 0, y: 0 };
  let ghostAmt = 0;
  const halo = { x: 0, y: 0, r: 0, a: 0 };
  const ray = new THREE.Raycaster();
  const occluders = [dc.group, uni.group];

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
      for (let n = 1; n < starts.length; n++) burst(starts[n] + 0.02, n < 4 ? 3 : 1, [PICK.x + 0.05, PICK.y + 0.05, PICK.z - 0.1], [0.1, 0.1, 0.2], [0.6, 0.64, 0.68], 0.16, 0.25);
    }
  }
  return {
    studio: st,
    update(t) {
      let state;
      if (mode === 'work') {
        state = cycle(t, workCycle);
      } else if (mode === 'blind') {
        // waiting at the open die, empty-handed, the casting glowing behind (a slow breath of the hydraulics)
        const pose = { ...AT, ext: AT.ext - lerp(0.42, 0.3, ss(clamp(t / dur))) + 0.003 * Math.sin(t * 1.3), grip: 0 };
        state = { pose, open: DIE.open, eject: DIE.eject, held: false, heat: 0.9 };
      } else {
        state = repeatState(t);
      }
      uni.pose(state.pose);
      dc.setOpen(state.open);
      uni.group.updateMatrixWorld(true);
      // the casting: in the die until the fingers close, then in the hand
      if (state.held) casting.matrix.copy(uni.graspMatrix());
      else casting.matrix.copy(castInDie(state.open, state.eject));
      casting.visible = !state.gone;
      casting.matrixWorldNeedsUpdate = true;
      setHeat(mats.hot, state.heat);
      glow.position.setFromMatrixPosition(casting.matrix).add(V3(-0.04, 0.02, -0.13).applyMatrix4(new THREE.Matrix4().extractRotation(casting.matrix)));
      if (!state.held) glow.position.x -= 0.12;
      glow.intensity = (p.glow ?? 2.2) * state.heat ** 1.6 * (state.open > 0.05 || state.held ? 1 : 0.15);
      glow2.intensity = mode === 'work' ? 0.4 + 0.1 * Math.sin(t * 7.3) * Math.sin(t * 3.1) : 0;
      halo.a = state.heat ** 1.6 * (state.held ? 1 : sstep(0.1, DIE.open, state.open));
      halo.p = V3().setFromMatrixPosition(casting.matrix).add(V3(0, 0.02, -0.13).applyMatrix4(new THREE.Matrix4().extractRotation(casting.matrix)));

      // ghosts: earlier cycles (repeat). Each ghost arm trails the live one by a fraction of a cycle (a strobe of its
      // motion); the ghost parts sit at the pick point, where every cycle's part appeared — in perfect register.
      if (mode === 'repeat') {
        const n = cycleIndex(t);
        const amt = sstep(tEach - 0.1, tEach + 0.5, t);
        ghostAmt = amt;
        const d = starts[n + 1] - starts[n];
        for (let k = 0; k < ghosts.length; k++) {
          const sg = repeatState(t - (k + 1) * 0.075 * d);
          ghosts[k].pose(sg.pose);
          ghosts[k].group.visible = amt > 0.01;
          ghosts[k].pitchG.children.forEach((c) => { if (c.type === 'Group' && c !== ghosts[k].extG && c.children.length && c.children[0].material === mats.hose) c.visible = false; });
          const gc = ghostCasts[k];
          gc.visible = amt > 0.01 && n >= 1;
          gc.matrix.copy(castInDie(DIE.open, DIE.eject));
          gc.matrixWorldNeedsUpdate = true;
        }
        for (const m of ghostMats) m.opacity = (p.ghost ?? 0.28) * amt;
      }

      // smoke
      smoke.draw(t, puffs);

      // light: the blind shot dims
      if (mode === 'blind') {
        const dk = ss(clamp((t - tDark) / 1.1));
        key.intensity = keyI * (1 - 0.82 * dk);
        rim.intensity = rimI * (1 - 0.6 * dk);
        hemi.intensity = (p.fill ?? 0.12) * (1 - 0.7 * dk);
        glow.intensity *= 1 - 0.65 * dk;
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
      const fov = lerp(cam.fov, cam.fovTo ?? cam.fov, r);
      if (st.camera.fov !== fov) {
        st.camera.fov = fov;
        st.camera.updateProjectionMatrix();
      }
      if (st.dof) st.dof.target = mode === 'blind' ? uni.graspWorld() : mode === 'work' ? V3(...look) : PICK.clone();
      st.camera.updateMatrixWorld();
      const sp = toScreen(st.camera, PICK.clone().add(V3(0, 0.02, -0.13)));
      pickScreen.x = sp[0];
      pickScreen.y = sp[1];
      if (halo.p && halo.a > 0.01) {
        // how much of the hot part the camera can see (a few rays against the machine and the robot)
        let vis = 0;
        const dirs = [[0, 0, 0], [0, 0.04, 0.05], [0, -0.04, -0.05], [0, 0.04, -0.05], [0, -0.04, 0.05]];
        for (const d of dirs) {
          const q = halo.p.clone().add(V3(...d));
          const dv = q.clone().sub(st.camera.position);
          const L = dv.length();
          ray.set(st.camera.position, dv.normalize());
          ray.far = L - 0.03;
          const hit = ray.intersectObjects(occluders, true);
          if (!hit.length) vis += 1 / dirs.length;
        }
        halo.a *= vis;
        if (mode === 'blind') halo.a *= 0.35;
        const hp = toScreen(st.camera, halo.p);
        halo.x = hp[0];
        halo.y = hp[1];
        halo.r = (1080 / (2 * Math.tan((st.camera.fov * Math.PI) / 360))) * 0.22 / Math.max(0.3, st.camera.position.distanceTo(halo.p));
      }
    },
    overlay(g, t) {
      archive(g, t, { amount: p.archive ?? 1, seed: 61, tint: [255, 228, 192] });
      // an extra fade toward monochrome for 1961
      g.save();
      g.globalCompositeOperation = 'saturation';
      g.fillStyle = `rgba(128,128,128,${0.25 * (p.archive ?? 1)})`;
      g.fillRect(0, 0, 1920, 1080);
      g.restore();
      // the hot part: warm colour survives the fade (a colour-blend tint), and its glow bleeds into the emulsion
      const hot = (x, y, r, a) => {
        if (a <= 0.01 || r <= 1) return;
        g.save();
        g.globalCompositeOperation = 'color';
        const gt = g.createRadialGradient(x, y, 0, x, y, r * 1.3);
        gt.addColorStop(0, `rgba(255,120,30,${0.8 * Math.min(1, a * 1.5)})`);
        gt.addColorStop(1, 'rgba(255,120,30,0)');
        g.fillStyle = gt;
        g.fillRect(x - r * 1.3, y - r * 1.3, r * 2.6, r * 2.6);
        g.globalCompositeOperation = 'screen';
        const gr = g.createRadialGradient(x, y, 0, x, y, r * 2.4);
        const k = a * (p.halo ?? 1);
        gr.addColorStop(0, `rgba(255,150,60,${0.85 * k})`);
        gr.addColorStop(0.22, `rgba(255,110,30,${0.42 * k})`);
        gr.addColorStop(1, 'rgba(255,80,10,0)');
        g.fillStyle = gr;
        g.fillRect(x - r * 2.4, y - r * 2.4, r * 4.8, r * 4.8);
        g.restore();
      };
      hot(halo.x, halo.y, halo.r, halo.a * (mode === 'repeat' ? 0.6 : 1));
      if (mode === 'repeat' && ghostAmt > 0.01) hot(pickScreen.x, pickScreen.y, halo.r * 0.9, 0.45 * ghostAmt);
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
          const r0 = lerp(170, 78, ss(lock));
          g.save();
          g.globalAlpha *= lock;
          g.strokeStyle = 'rgba(240,206,140,0.95)';
          g.shadowColor = 'rgba(0,0,0,0.8)';
          g.shadowBlur = 6;
          g.lineWidth = 2.6;
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
