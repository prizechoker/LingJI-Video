// The last shot (F45): the same kitchen, the same wet bowl slipping out of the robot's fingers (cue "slip") — and this
// time the hand follows it down and catches it by the rim, then carries it over and stands it in the dish rack (by cue
// "place"), lets go and withdraws. Then the end card (cue "card"): 下一集：一只手，到底有多难？
import { Studio, THREE, spot } from '../engine2/core.js';
import { setPose } from '../engine2/bothand.js';
import { buildKitchen, COUNTER, steelMaterial } from '../engine2/kitchen.js';
import { buildBowl, porcelainMaterial, surfaceDroplets, waterMaterial } from '../engine2/dishes.js';
import { rimGrip } from './lib/pinch.js';
import { ss, sstep, clamp, lerp, breathe, grade, title, text, FONT, V3, rng } from './lib/kit.js';

const G = 9.81;

function buildRack(st) {
  const g = new THREE.Group();
  const steel = steelMaterial({ roughness: 0.22 });
  const tube = (pts, r = 0.0022) => {
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => V3(...p))), 24, r, 8, false), steel);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  };
  const W = 0.42, D = 0.3, h0 = 0.03;
  // the base frame and its cross wires
  tube([[-W / 2, h0, -D / 2], [W / 2, h0, -D / 2], [W / 2, h0, D / 2], [-W / 2, h0, D / 2], [-W / 2, h0, -D / 2]], 0.003);
  for (let k = 1; k < 10; k++) tube([[-W / 2 + (k * W) / 10, h0, -D / 2], [-W / 2 + (k * W) / 10, h0, D / 2]], 0.0018);
  // upright tines in two rows (U loops)
  for (const z of [-0.06, 0.06]) for (let k = 0; k < 11; k++) {
    const x = -W / 2 + 0.03 + k * 0.036;
    tube([[x - 0.006, h0, z], [x - 0.006, h0 + 0.09, z], [x + 0.006, h0 + 0.09, z], [x + 0.006, h0, z]], 0.0016);
  }
  for (const [x, z] of [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]]) tube([[x, 0.0, z], [x, h0, z]], 0.003);
  // the drip tray
  const tray = new THREE.Mesh(new THREE.BoxGeometry(W + 0.03, 0.012, D + 0.03), new THREE.MeshPhysicalMaterial({ color: 0xe9ebec, roughness: 0.35, clearcoat: 0.3 }));
  tray.position.y = 0.006;
  tray.receiveShadow = tray.castShadow = true;
  g.add(tray);
  return g;
}

export async function create({ renderer, scale, p, cues, dur }) {
  const st = new Studio({ scale, renderer });
  await st.hdri('../assets/hdri/blinds_2k.hdr', { intensity: p.env ?? 0.42, rotation: p.rot ?? 2.1, background: { blur: 0.08, intensity: p.bg ?? 0.5 } });
  const kitchen = buildKitchen(st, { width: 2.4 });
  kitchen.position.x = -0.55;
  st.scene.add(kitchen);
  const top = COUNTER.top;
  const rack = buildRack(st);
  rack.position.set(0.5, top, -0.3);
  st.scene.add(rack);
  // two plates and a bowl already drying
  const pmat = porcelainMaterial();
  for (const [x, ang] of [[0.61, 1.15], [0.65, 1.12]]) {
    const prof = [[0, 0.004], [0.05, 0.004], [0.08, 0.01], [0.098, 0.018], [0.095, 0.019], [0.077, 0.012], [0.05, 0.007], [0, 0.007]];
    const plate = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 96), pmat);
    plate.position.set(x, top + 0.105, -0.3);
    plate.rotation.z = ang;
    plate.castShadow = plate.receiveShadow = true;
    st.scene.add(plate);
  }
  const water = waterMaterial();

  // ---- the hand and the bowl
  const base = V3(0.12, top + 0.2, -0.28);
  const camPos = V3(-0.32, top + 0.17, 0.36);
  const grip = await rimGrip(st, { base, camPos });
  const { h, pose: holdPose, rimLocal, quat, gripOffset } = grip;
  st.scene.add(h.holder);
  const bowl = buildBowl(pmat);
  st.scene.add(bowl);
  bowl.updateMatrixWorld(true);
  bowl.add(surfaceDroplets(bowl, { n: 60, mat: water }));
  const grip0 = base.clone().add(rimLocal);

  // where the bowl ends up: standing in the rack's back row, leaning toward the camera
  const Qend = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.2, 0.0, 0.08));
  const bowlEnd = V3(0.43, top + 0.07, -0.33);
  const gripEnd = bowlEnd.clone().add(rimLocal.clone().applyQuaternion(Qend));

  const tSlip = cues.slip ?? 0.8;
  const S = p.slow ?? 6; // slow motion through the catch
  const UC = 0.075; // real seconds of free fall before the fingers close
  const tCatch = tSlip + UC * S;
  const tPlace = cues.place ?? Math.max(tCatch + 2.4, dur * 0.6);
  const tCarry = Math.max(tCatch + 0.8, tPlace - 1.9);
  const tCard = cues.card ?? dur - 3.6;
  const dropC = 0.5 * G * UC * UC;
  const tilt = V3().crossVectors(V3(0, 1, 0), grip.nb).normalize();

  const keyL = spot(0xeef2f8, p.key ?? 3.0, { pos: [-0.9, 1.6, 0.9], target: [0.3, top + 0.1, -0.28], angle: 0.42, penumbra: 1, radius: 6, near: 0.5, far: 5 });
  const sun = new THREE.DirectionalLight(0xffc48a, p.sun ?? 4.5);
  sun.position.set(0.8, 2.4, -2.6);
  sun.target.position.set(0.3, top, -0.25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -0.7, right: 0.7, top: 0.7, bottom: -0.7, near: 1, far: 6 });
  sun.shadow.radius = 3;
  sun.shadow.bias = -0.0002;
  st.scene.add(keyL, keyL.target, sun, sun.target);
  st.camera.near = 0.02;
  grade(st, { ao: { radius: 0.02, intensity: 1.6, falloff: 0.5 }, dof: { distance: 0.5, range: p.range ?? 0.2, bokeh: 3.5 }, bloom: { intensity: 0.4, threshold: 0.9 }, vignette: 0.62, contrast: 0.09, exposure: p.exposure ?? 1.0 });

  const qc = new THREE.Quaternion(), qa = new THREE.Quaternion();
  return {
    studio: st,
    update(t) {
      // real time since the slip, slowed through the catch
      const u = t < tCatch ? (t - tSlip) / S : UC + (t - tCatch);
      // bowl relative to the grip: sliding down out of the fingers, then caught with a small damped bounce
      let drop = 0, rot = 0;
      if (u > 0 && u < UC) { drop = 0.5 * G * u * u; rot = -2.5 * u * u; }
      else if (u >= UC) { const v = u - UC; drop = dropC + 0.003 * Math.exp(-v / 0.05) * Math.sin(v * 70); rot = -2.5 * UC * UC * (1 - 0.6 * ss(clamp(v / 0.4))); }
      // the hand: notices the slip after ~20 ms and drops to meet the rim exactly at the catch
      const follow = u <= 0.02 ? 0 : u >= UC ? 1 : ss((u - 0.02) / (UC - 0.02));
      const handDrop = dropC * follow + (u >= UC ? 0.003 * Math.exp(-(u - UC) / 0.05) * Math.sin((u - UC) * 70) : 0);
      // the carry to the rack: an arc up and over, the bowl turning to stand on edge
      const c = ss(clamp((t - tCarry) / (tPlace - tCarry)));
      const lift = Math.sin(Math.PI * c) * 0.06;
      qc.identity().slerp(Qend, c);
      const gripNow = grip0.clone().add(V3(0, -handDrop, 0)).lerp(gripEnd, c).add(V3(0, lift, 0));
      // release and withdraw after placing
      const rel = sstep(tPlace + 0.1, tPlace + 0.5, t);
      const away = ss(clamp((t - tPlace - 0.45) / 1.2));
      // pose the hand
      const open = u > 0 && u < UC ? sstep(0, 0.015, u) : rel;
      const pz = { ...holdPose };
      for (const f of ['index', 'middle', 'thumb']) pz[f] = holdPose[f].map((v) => v - 0.22 * open);
      setPose(h, pz);
      qa.copy(qc).multiply(quat);
      h.holder.quaternion.copy(qa);
      h.holder.position.copy(gripNow).sub(gripOffset.clone().applyQuaternion(qc)).add(V3(0.02 * away, 0.12 * away, 0.06 * away));
      // the bowl
      const relDrop = drop - handDrop; // how far the bowl has slid within the grip
      const q = new THREE.Quaternion().setFromAxisAngle(tilt, rot * (1 - c));
      bowl.quaternion.copy(qc).multiply(q);
      bowl.position.copy(gripNow).sub(rimLocal.clone().applyQuaternion(bowl.quaternion)).add(V3(0, -relDrop * (1 - c), 0));
      // camera: a slow push toward the rack as the bowl is put away
      // tight on the catch, then easing back to see the bowl put away
      const k = ss(clamp((t - tCatch - 0.4) / (tPlace - tCatch + 0.2)));
      const near = { pos: V3(-0.1, top + 0.2, 0.1), look: grip0.clone().add(V3(0, -0.045, 0)) };
      const far = { pos: V3(-0.26, top + 0.19, 0.3), look: V3(0.32, top + 0.1, -0.3) };
      const pos = near.pos.clone().lerp(far.pos, k).add(V3(0.0, 0.0, -0.03 * ss(clamp(t / dur))));
      const look = near.look.clone().lerp(far.look, k);
      const b = breathe(t, 0.0015, 4);
      st.camera.position.set(pos.x + b[0], pos.y + b[1], pos.z + b[2]);
      st.camera.lookAt(look);
      if (st.camera.fov !== 32) { st.camera.fov = 32; st.camera.updateProjectionMatrix(); }
      if (st.dof) st.dof.target = bowl.position.clone().add(V3(0, 0.03, 0));
      // the light warms a little at the end
      sun.intensity = (p.sun ?? 4.5) * (1 + 0.25 * sstep(tPlace, tCard, t));
    },
    overlay(g, t) {
      const a = sstep(tCard, tCard + 1.2, t);
      if (a <= 0.001) return;
      g.save();
      g.fillStyle = `rgba(4,4,6,${0.62 * a})`;
      g.fillRect(0, 0, 1920, 1080);
      g.restore();
      text(g, '下一集', 960, 440, { size: 30, font: FONT.serif, weight: 500, color: [214, 200, 176], a, spacing: 14, shadow: 12 });
      title(g, '一只手，到底有多难？', 960, 540, { size: 84, a, weight: 600, spacing: 10, track: 10 });
      text(g, 'NEXT · HOW HARD IS A HAND?', 960, 628, { size: 20, font: FONT.mono, weight: 500, color: [180, 188, 198], a: a * 0.85, spacing: 6 });
    },
  };
}
