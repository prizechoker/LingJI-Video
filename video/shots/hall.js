// The game-2 hall (Four Seasons, Seoul, 10 March 2016).
// p.mode: 'wide'    (A01) — out of the dark, the table in a shaft of warm light, the two chairs facing each other,
//                     AlphaGo's monitor glowing; the date card (cue "date").
//         'lee'     (A02a) — Lee Sedol's side: his right hand idly stirring the white stones in his bowl, warm;
//                     label at cue "lee".
//         'machine' (A02b) — the other side: across the board, the monitor's cold light where an opponent should
//                     sit; label at cue "alphago".
//         'empty'   (A05) — Lee's chair from across the board, the clock running; at cue "rise" the chair rolls back
//                     and swivels as he gets up and leaves.
//         'pov'     (A08) — from Lee's seat: move 37 on the board, his clock racing through ten-odd minutes.
//         'watch'   (B16) — AlphaGo's screen: the position and the next move marked (cue "screen").
import { Studio, THREE, spot } from '../engine2/core.js';
import { loadHand, setPose, mixPose } from '../engine2/hand.js';
import { buildSleeve } from '../engine2/sleeve.js';
import { buildHall, TABLE, FLOOR, SEAT } from './lib/hallset.js';
import { lightCone, dustMotes } from './lib/fx.js';
import { ss, sstep, clamp, lerp, breathe, grade, title, caption, callout, FONT, V3 } from './lib/kit.js';

const P10 = [0.111, 0.0046, 0.0];
const BOWL_W = [-0.31, TABLE.top, -0.2];
const CAMS = {
  wide: { from: { pos: [-1.0, 3.0, 0.75], look: [0.05, -0.45, 0.0], fov: 28 }, to: { pos: [-2.15, 1.95, 1.55], look: [0.05, -0.42, 0.0], fov: 26 } },
  lee: { from: { pos: [-0.6, 0.17, -0.68], look: [-0.3, -0.04, -0.22], fov: 23 }, to: { pos: [-0.56, 0.15, -0.63], look: [-0.3, -0.045, -0.22], fov: 22 } },
  machine: { from: { pos: [-0.02, 0.2, 1.12], look: [0.42, 0.13, 0.28], fov: 30 }, to: { pos: [0.04, 0.19, 1.02], look: [0.43, 0.13, 0.28], fov: 29 } },
  empty: { from: { pos: [0.1, 2.05, -0.36], look: [0.0, -0.5, -0.38], fov: 30, up: [0.12, 0, 1] }, to: { pos: [0.06, 1.8, -0.4], look: [0.0, -0.5, -0.4], fov: 30, up: [0.0, 0, 1] } },
  pov: { from: { pos: [-0.04, 0.42, -0.7], look: [0.06, -0.06, 0.02], fov: 36 }, to: { pos: [0.0, 0.32, -0.52], look: [0.1, -0.02, 0.01], fov: 32 } },
  watch: { from: { pos: [0.24, 0.26, 0.86], look: [0.5, 0.17, 0.32], fov: 24 }, to: { pos: [0.3, 0.24, 0.76], look: [0.5, 0.17, 0.32], fov: 22 } },
};

// a right hand dipped into the bowl, fingers among the stones
const STIR = { index: [0.42, 0.42, 0.25], middle: [0.45, 0.45, 0.25], ring: [0.55, 0.5, 0.25], little: [0.62, 0.55, 0.25], thumb: [0.35, 0.25, 0.25], spread: { index: 0.08, middle: 0, ring: -0.06, little: -0.14 }, thumbRoll: 0.2 };
const STIR2 = { index: [0.52, 0.5, 0.3], middle: [0.5, 0.5, 0.28], ring: [0.6, 0.55, 0.28], little: [0.66, 0.6, 0.28], thumb: [0.45, 0.3, 0.3], spread: { index: 0.04, middle: 0, ring: -0.04, little: -0.1 }, thumbRoll: 0.25 };

export async function create({ renderer, scale, p, cues, dur }) {
  const st = new Studio({ scale, renderer });
  await st.hdri('../assets/hdri/studio_small_09_2k.hdr', { intensity: p.env ?? 0.05, rotation: 1.2 });
  st.scene.background = new THREE.Color(0x020304);
  const mode = p.mode || 'wide';
  const hall = await buildHall(st, { cameras: mode === 'wide' });
  st.scene.add(hall.group);
  const n = p.n ?? (mode === 'pov' ? 37 : 36);
  hall.set.show(n);
  hall.screen.draw(n);

  // light: a warm shaft from above the table, a low warm wash on the chairs, the monitor's own cool glow
  const apex = [0.05, 2.8, -0.05];
  const keyL = spot(0xffd2a0, p.key ?? 30, { pos: apex, target: [0, TABLE.top, 0], angle: 0.36, penumbra: 0.7, radius: 6, near: 1, far: 5, shadow: 2048 });
  const chairs = spot(0xffc28a, p.chairI ?? 4, { pos: [0, 2.2, 0], target: [0, FLOOR + 0.6, 0], angle: 0.75, penumbra: 1, shadow: 0 });
  st.scene.add(keyL, keyL.target, chairs, chairs.target);
  hall.glow.intensity = p.glow ?? 7;
  if (mode === 'machine') hall.chairs.B.visible = false;
  if (mode === 'empty') {
    const seatL = spot(0xffc896, p.seatI ?? 7, { pos: [0.4, 1.6, -0.1], target: [0, FLOOR + 0.7, SEAT.W[1] - 0.1], angle: 0.4, penumbra: 1, shadow: 1024, radius: 5, near: 0.5, far: 4 });
    st.scene.add(seatL, seatL.target);
  }
  const atmos = [];
  if (mode === 'wide' || mode === 'empty') {
    const cone = lightCone({ apex, target: [0, FLOOR, 0], radius: 1.25, intensity: p.haze ?? (mode === 'wide' ? 0.055 : 0.03) });
    st.scene.add(cone);
    atmos.push(cone);
    if (mode === 'wide') {
      const dust = dustMotes({ apex, target: [0, FLOOR, 0], radius: 1.1, n: 220, size: 0.0007, intensity: 0.35 });
      st.scene.add(dust);
      atmos.push(dust);
    }
  }

  // Lee's right hand in his bowl
  let hand = null, rest = null;
  if (mode === 'lee') {
    hand = await loadHand(st);
    hand.holder.add(buildSleeve(st, { dir: new THREE.Vector3(0.02, 0.28, 1), suit: 0x25272d }));
    st.scene.add(hand.holder);
    setPose(hand, STIR);
    // place the hand so its fingertips sit among the stones near the bowl's centre
    const rot = [-0.62, Math.PI - 0.3, -0.12];
    hand.holder.position.set(0, 0, 0);
    hand.holder.rotation.set(...rot, 'YXZ');
    hand.holder.updateMatrixWorld(true);
    const c = V3();
    for (const f of ['f2_3', 'f3_3', 'f4_3']) c.add((hand.bones[f].getObjectByName(`${f}_leaf`) || hand.bones[f]).getWorldPosition(V3()));
    c.multiplyScalar(1 / 3);
    rest = { pos: V3(BOWL_W[0] + 0.004, TABLE.top + 0.05, BOWL_W[2] - 0.006).sub(c), rot };
  }
  // the clock face, turned toward the camera of each setup
  if (mode === 'empty') { hall.clockGroup.position.set(-0.4, TABLE.top, 0.16); hall.clockGroup.rotation.y = 0.45; }
  if (mode === 'pov') { hall.clockGroup.position.set(-0.36, TABLE.top, -0.1); hall.clockGroup.rotation.y = Math.PI + 0.55; }

  const cam = p.camera ? { from: p.camera, to: p.camera2 || p.camera } : CAMS[mode];
  st.camera.near = 0.02;
  grade(st, {
    ao: { radius: mode === 'wide' ? 0.2 : 0.05, intensity: 1.6, falloff: 0.6 },
    dof: mode === 'wide' || mode === 'empty' ? null : { distance: 1, range: p.range ?? { lee: 0.05, pov: 0.12, machine: 0.25, empty: 0.35, watch: 0.15 }[mode], bokeh: p.bokeh ?? 4 },
    bloom: { intensity: 0.4, threshold: 0.75 }, vignette: 0.72, contrast: 0.13, exposure: p.exposure ?? 0.95, saturation: -0.03,
  });
  const focus = {
    lee: () => V3(BOWL_W[0], TABLE.top + 0.06, BOWL_W[2] - 0.03),
    machine: () => V3(0.5, 0.18, 0.32),
    empty: () => V3(0, FLOOR + 0.75, SEAT.W[1] - 0.05),
    pov: () => V3(...P10),
    watch: () => V3(0.5, 0.17, 0.32),
  }[mode];

  const tRise = cues.rise ?? dur * 0.5;
  const tThink = cues.think ?? 0.3;
  const leeClock = p.leeClock ?? 1 * 3600 + 27 * 60 + 42, aiClock = p.aiClock ?? 1 * 3600 + 34 * 60 + 9;

  return {
    studio: st,
    update(t) {
      const r = ss(clamp(t / dur));
      const pos = cam.from.pos.map((v, i) => lerp(v, cam.to.pos[i], r));
      const look = cam.from.look.map((v, i) => lerp(v, cam.to.look[i], r));
      const b = breathe(t, mode === 'wide' ? 0.004 : mode === 'lee' ? 0.0008 : 0.0016, 5);
      if (cam.from.up) st.camera.up.set(...cam.from.up.map((v, i) => lerp(v, cam.to.up[i], r))).normalize();
      st.camera.position.set(pos[0] + b[0], pos[1] + b[1], pos[2] + b[2]);
      st.camera.lookAt(...look);
      const fov = lerp(cam.from.fov, cam.to.fov, r);
      if (st.camera.fov !== fov) { st.camera.fov = fov; st.camera.updateProjectionMatrix(); }
      if (st.dof && focus) st.dof.target = focus(t);
      for (const a of atmos) a.userData.tick(t);
      if (mode === 'empty') {
        hall.clock.draw(leeClock - t * (p.clockRate ?? 1), aiClock, 1);
        // the chair: as he stands it rolls back and swivels, then settles
        const u = clamp((t - tRise) / 1.8);
        const e = 1 - (1 - u) ** 3;
        const ch = hall.chairs.W;
        ch.position.set(SEAT.W[0] - 0.06 * e, FLOOR, SEAT.W[1] - 0.17 * e);
        ch.rotation.y = 0.34 * e + (u > 0 ? 0.02 * Math.sin(u * 10) * (1 - u) : 0);
      } else if (mode === 'pov') {
        const k = clamp((t - tThink) / Math.max(1, dur - tThink - 0.3));
        hall.clock.draw(leeClock - 60 * (p.minutes ?? 12) * ss(k) - t, aiClock, 1);
      } else {
        hall.clock.draw(leeClock, aiClock, 0);
      }
      if (mode === 'watch') hall.screen.draw(36, { next: t > (cues.screen ?? 0.6), pulse: 0.5 + 0.5 * Math.sin(t * 6) });
      if (hand) {
        // a slow idle stir: a small circle of the hand, the fingers working the stones
        const w = t * 1.1;
        hand.holder.position.copy(rest.pos).add(V3(0.004 * Math.sin(w), 0.0015 * Math.sin(w * 2 + 1), 0.003 * Math.cos(w)));
        hand.holder.rotation.set(rest.rot[0] + 0.02 * Math.sin(w + 0.5), rest.rot[1] + 0.05 * Math.sin(w * 0.7), rest.rot[2], 'YXZ');
        setPose(hand, mixPose(STIR, STIR2, 0.5 + 0.5 * Math.sin(w * 1.3)));
      }
    },
    overlay(g, t) {
      if (mode === 'wide') {
        const t0 = cues.date ?? 0.6;
        const a = sstep(t0, t0 + 0.9, t) * (1 - sstep(dur - 0.6, dur - 0.05, t));
        title(g, '2016 年 3 月 10 日', 150, 740, { size: 66, a, spacing: 6, weight: 600, align: 'left' });
        caption(g, 154, 812, { en: 'SEOUL · ALPHAGO VS LEE SEDOL · GAME 2', zh: '首尔 · 人机大战第二局', a: a * 0.95, color: [224, 214, 198], zhSize: 26, rule: 130 });
      }
      if (mode === 'lee') {
        const t0 = cues.lee ?? 0.5;
        callout(g, st.camera, V3(BOWL_W[0] - 0.01, TABLE.top + 0.12, BOWL_W[2] - 0.1), { text: '李世石', sub: '18 个世界冠军', a: sstep(t0, t0 + 0.7, t), side: -1, dx: 140, dy: -160, size: 42, color: [248, 234, 212], line: [236, 205, 160], subSize: 24 });
      }
      if (mode === 'watch' && p.caption) {
        const t0 = cues.aja ?? 0.8;
        const a = sstep(t0, t0 + 0.7, t) * (1 - sstep(dur - 0.5, dur, t));
        title(g, p.caption.name, 150, 700, { size: 58, a, spacing: 8, weight: 600, align: 'left' });
        caption(g, 154, 770, { en: p.caption.en, zh: p.caption.role, a: a * 0.95, color: [214, 228, 244], zhSize: 26, rule: 120 });
      }
      if (mode === 'machine') {
        const t0 = cues.alphago ?? 0.6;
        callout(g, st.camera, V3(0.46, 0.36, 0.32), { text: 'AlphaGo', sub: 'Google DeepMind', a: sstep(t0, t0 + 0.7, t), side: 1, dx: 160, dy: -130, size: 42, color: [216, 236, 255], line: [150, 200, 255], subSize: 22 });
      }
    },
  };
}
