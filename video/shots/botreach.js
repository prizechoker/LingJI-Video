// B17: the stone of move 37 on the board in a cold light; the robot's white hand reaches in from above and stops a
// finger's breadth short of it — and the frame holds (cue "freeze": 拿不起一颗棋子), a slow push in on the gap.
import { Studio, THREE, spot } from '../engine2/core.js';
import { botMaterial } from '../engine2/bot.js';
import { loadBotHand, setPose } from '../engine2/bothand.js';
import { buildGoSet, restPose } from './lib/goset.js';
import { ss, sstep, clamp, lerp, breathe, grade, V3 } from './lib/kit.js';

const OPEN = { index: [0.25, 0.35, 0.2], middle: [0.28, 0.38, 0.22], ring: [0.32, 0.42, 0.24], little: [0.36, 0.46, 0.26], thumb: [0.35, 0.25, 0.15], spread: { index: 0.06, ring: -0.04, little: -0.1 }, thumbRoll: 0.35 };
const REACH = { index: [0.12, 0.2, 0.12], middle: [0.14, 0.22, 0.14], ring: [0.18, 0.26, 0.15], little: [0.22, 0.3, 0.16], thumb: [0.25, 0.15, 0.1], spread: { index: 0.1, ring: -0.06, little: -0.14 }, thumbRoll: 0.45 };

export async function create({ renderer, scale, p, cues, dur }) {
  const st = new Studio({ scale, renderer });
  await st.hdri('../assets/hdri/studio_small_09_2k.hdr', { intensity: p.env ?? 0.05, rotation: 2.4 });
  st.scene.background = new THREE.Color(0x020306);
  const set = await buildGoSet(st);
  st.scene.add(set.group);
  set.show(37);
  const stoneP = restPose({ i: 14, j: 9, n: 37 }).p;

  const h = await loadBotHand(st, { material: botMaterial({ white: 0xdfe3e8, envDiffuse: 0.6, seam: 0.0005, dark: 0.7 }) });
  st.scene.add(h.holder);
  const yaw = 0.3, pitch = -0.55;
  h.holder.rotation.set(pitch, yaw, 0, 'YXZ');
  setPose(h, REACH);
  // where the holder must be for the fingertips' centre to hang 2.6 cm over the stone
  h.holder.position.set(0, 0, 0);
  h.holder.updateMatrixWorld(true);
  const c = V3();
  for (const f of ['f2_3', 'f3_3', 'f4_3']) c.add((h.bones[f].getObjectByName(`${f}_leaf`) || h.bones[f]).getWorldPosition(V3()));
  c.multiplyScalar(1 / 3);
  const stop = stoneP.clone().add(V3(-0.004, 0.026, 0.012)).sub(c);
  const from = stop.clone().add(V3(0.03, 0.16, 0.22));

  // cold light: a narrow top light on the stone, a cool rim from behind the hand, nothing warm
  const keyL = spot(0xcfe0ff, p.key ?? 7, { pos: [0.05, 1.3, -0.25], target: [stoneP.x, 0, stoneP.z], angle: 0.16, penumbra: 0.9, radius: 6 });
  const rim = spot(0x8fb8ff, p.rim ?? 5, { pos: [0.35, 0.5, 0.7], target: [stoneP.x, 0.05, stoneP.z], angle: 0.25, penumbra: 1, shadow: 1024, radius: 3 });
  st.scene.add(keyL, keyL.target, rim, rim.target);
  grade(st, { ao: { radius: 0.015, intensity: 1.8 }, dof: { distance: 0.25, range: p.range ?? 0.05, bokeh: 4 }, bloom: { intensity: 0.3, threshold: 0.9 }, vignette: 0.75, contrast: 0.14, saturation: -0.15, exposure: p.exposure ?? 0.9 });
  if (st.dof) st.dof.target = stoneP.clone().add(V3(0, 0.012, 0.004));

  const tFreeze = cues.freeze ?? dur * 0.55;
  const tArrive = Math.min(tFreeze - 0.1, cues.arrive ?? tFreeze - 0.3);
  return {
    studio: st,
    update(t) {
      // the reach: a long, decelerating move that ends dead still; the fingers open on the way in
      const u = clamp(t / Math.max(0.5, tArrive));
      const e = 1 - (1 - u) ** 3;
      h.holder.position.copy(from).lerp(stop, e);
      h.holder.rotation.set(pitch - 0.15 * (1 - e), yaw + 0.08 * (1 - e), 0, 'YXZ');
      const k = sstep(0, 1, e);
      const pose = {};
      for (const f of ['index', 'middle', 'ring', 'little', 'thumb']) pose[f] = OPEN[f].map((v, i) => lerp(v, REACH[f][i], k));
      pose.spread = { index: lerp(0.06, 0.1, k), ring: lerp(-0.04, -0.06, k), little: lerp(-0.1, -0.14, k) };
      pose.thumbRoll = lerp(0.35, 0.45, k);
      setPose(h, pose);
      // the camera: low across the board at the gap; after the freeze it creeps in
      const r = ss(clamp((t - tFreeze) / Math.max(0.5, dur - tFreeze)));
      const pos = V3(lerp(-0.13, -0.085, r), lerp(0.05, 0.042, r), lerp(-0.13, -0.09, r));
      const look = V3(stoneP.x, 0.022, stoneP.z + 0.01);
      const b = t < tFreeze ? breathe(t, 0.0008, 6) : [0, 0, 0];
      st.camera.position.set(pos.x + b[0], pos.y + b[1], pos.z + b[2]);
      st.camera.lookAt(look);
      if (st.camera.fov !== 24) { st.camera.fov = 24; st.camera.updateProjectionMatrix(); }
    },
  };
}
