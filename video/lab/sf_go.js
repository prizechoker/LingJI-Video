// Style frame: Move 37. Aja Huang's hand places AlphaGo's black stone at P10, beside Lee Sedol's Q11.
import { Studio, THREE, spot } from '../engine2/core.js';
import { loadHand, setPose, jointWorld } from '../engine2/hand.js';
import { buildBoard, buildStones, buildBowl, at } from '../engine2/goban.js';
import { stoneGeometry, stoneMaterials } from '../engine2/materials.js';
import { buildSleeve } from '../engine2/sleeve.js';

const tip = (h, f) => {
  const b = h.bones[f];
  h.holder.updateMatrixWorld(true);
  const leaf = b.getObjectByName(`${f}_leaf`);
  return (leaf || b).getWorldPosition(new THREE.Vector3());
};

// points on the distal phalanx: the nail (dorsal) or the pad (palmar), ~62% of the way to the fingertip
const LAT = new THREE.Vector3(1, 0, 0);
function fingerPoint(h, f, side, out = 0.0046) {
  const a = h.bones[f].getWorldPosition(new THREE.Vector3());
  const b = tip(h, f);
  const dir = b.clone().sub(a).normalize();
  const lat = LAT.clone().applyQuaternion(h.holder.quaternion);
  const dorsal = new THREE.Vector3().crossVectors(lat, dir).normalize();
  return { p: a.lerp(b, 0.62).addScaledVector(dorsal, side * out), dorsal };
}

// classic go grip: the stone rests on the index fingernail, the middle finger's pad presses it from above.
// Searched together with the hand's pitch so the fingertips come in at ~30 degrees, wrist well above.
let PITCH = -0.6;
function solveGrip(h, base, yaw) {
  let best = null;
  const holderP = h.holder.position.clone();
  h.holder.position.set(0, 0, 0);
  const nailWant = 0.6; // index distal segment, radians below horizontal
  for (let pitch = -0.45; pitch <= -0.149; pitch += 0.1) {
    h.holder.rotation.set(pitch, yaw, 0, 'YXZ');
    for (let si = -0.3; si <= 0.401; si += 0.1) {
      for (let sm = -0.6; sm <= 0.301; sm += 0.1) {
        for (let fi = -0.35; fi <= 0.301; fi += 0.05) {
          for (let fm = -0.35; fm <= 0.401; fm += 0.05) {
            const pose = { ...base, index: [fi * 0.7, fi, fi * 0.45], middle: [fm, Math.max(0.05, fm * 0.6), 0.1], spread: { ...base.spread, index: si, middle: sm } };
            setPose(h, pose);
            const nail = fingerPoint(h, 'f2_3', 1);
            const pad = fingerPoint(h, 'f3_3', -1, 0.0048);
            const want = nail.p.clone().addScaledVector(nail.dorsal, 0.0092);
            const a = h.bones.f2_3.getWorldPosition(new THREE.Vector3());
            const dirI = tip(h, 'f2_3').sub(a).normalize();
            const ang = Math.asin(Math.max(-1, Math.min(1, -dirI.y)));
            const wrist = h.bones.hand.getWorldPosition(new THREE.Vector3());
            const lift = wrist.y - nail.p.y;
            const cost = pad.p.distanceToSquared(want) + 0.0001 * (ang - nailWant) ** 2 + 0.01 * Math.max(0, 0.07 - lift) ** 2
              + 0.00001 * (si * si + sm * sm) + 0.000004 * (fi * fi + fm * fm);
            if (!best || cost < best.cost) best = { cost, pose, pitch, err: pad.p.distanceTo(want), ang, lift };
          }
        }
      }
    }
  }
  setPose(h, best.pose);
  h.holder.rotation.set(best.pitch, yaw, 0, 'YXZ');
  h.holder.position.copy(holderP);
  return best;
}

export async function setup({ scale, params }) {
  const st = new Studio({ scale });
  await st.hdri('../assets/hdri/studio_small_09_2k.hdr', { intensity: params.env ?? 0.07, rotation: 1.2 });
  st.scene.background = new THREE.Color(0x040507);

  // table, board, game position after move 36
  const table = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshPhysicalMaterial({ ...st.pbr('Wood027', { repeat: [3, 3] }), roughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.3 }));
  table.rotation.x = -Math.PI / 2;
  table.position.y = -0.12;
  table.receiveShadow = true;
  st.scene.add(table);
  st.scene.add(await buildBoard(st));
  const moves = (await (await fetch('../data/go_game2.json')).json()).moves;
  st.scene.add(buildStones(moves.slice(0, 36)).group);
  const bowl = buildBowl(st, 'B');
  bowl.position.set(0.31, -0.12, 0.2);
  st.scene.add(bowl);

  // the hand, holding move 37
  const h = await loadHand(st);
  h.holder.add(buildSleeve(st));
  st.scene.add(h.holder);
  const base = { ring: [1.05, 1.3, 0.8], little: [1.1, 1.3, 0.8], thumb: [0.55, 0.5, 0.45], spread: { ring: 0.05, little: 0.12 }, thumbRoll: 0.35 };
  PITCH = params.pitch ?? -0.6;
  const g = solveGrip(h, base, params.yaw ?? 0.25);
  console.warn('grip err mm', (g.err * 1000).toFixed(1), 'pitch', g.pitch.toFixed(2), 'angle', g.ang.toFixed(2), 'lift', g.lift.toFixed(3), JSON.stringify(g.pose));

  const target = at(14, 9, 0.0046 + (params.lift ?? 0.006)); // stone centre, just above the board
  h.holder.updateMatrixWorld(true);
  // stone centre: sitting on the index nail (so the middle pad rests on its top)
  h.holder.position.set(0, 0, 0);
  const nail = fingerPoint(h, 'f2_3', 1);
  const centre = nail.p.clone().addScaledVector(nail.dorsal, 0.0046);
  h.holder.position.copy(target).sub(centre);
  const stone = new THREE.Mesh(stoneGeometry(), stoneMaterials().black);
  stone.position.copy(target);
  // the stone lies flat against the nail: its axis along the nail's dorsal direction
  stone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), nail.dorsal);
  stone.castShadow = stone.receiveShadow = true;
  st.scene.add(stone);

  // light: warm overhead key, cool rim from AlphaGo's monitor behind the hand, faint fill
  const key = spot(0xffdcb8, params.key ?? 6, { pos: [-0.2, 1.2, 0.1], target: [0.1, 0, 0.03], angle: 0.38, penumbra: 1.0, radius: 8 });
  const fill = spot(0xffe6d0, params.fill ?? 0.9, { pos: [-0.5, 0.25, -0.5], target: [0.1, 0.04, 0.02], angle: 0.5, penumbra: 1.0, shadow: 0 });
  st.scene.add(fill, fill.target);
  const rim = spot(0x9cc6ff, params.rim ?? 4, { pos: [0.4, 0.45, 0.5], target: [0.1, 0.07, 0.05], angle: 0.22, penumbra: 0.8, shadow: 1024, radius: 3 });
  st.scene.add(key, key.target, rim, rim.target);
  // out-of-focus practicals far behind: the room, the monitor glow
  for (const [x, y, z, c, s] of [[0.9, 0.35, 1.6, 0xffc58a, 0.03], [-0.7, 0.45, 1.9, 0xffd0a0, 0.025], [0.38, 0.16, 0.62, 0x7fb5ff, 0.05]]) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(s, 16, 12), new THREE.MeshBasicMaterial({ color: c }));
    m.position.set(x, y, z);
    st.scene.add(m);
  }

  const cams = {
    hero: { pos: [-0.075, 0.095, -0.115], look: [0.108, 0.016, 0.004], fov: 19 },
    high: { pos: [0.02, 0.36, -0.3], look: [0.1, 0.0, 0.02], fov: 24 },
    side: { pos: [-0.25, 0.05, 0.0], look: [0.1, 0.03, 0.0], fov: 30 },
    front: { pos: [0.11, 0.06, -0.3], look: [0.11, 0.03, 0.02], fov: 24 },
    wide: { pos: [0.0, 0.62, -0.7], look: [0.05, 0, 0.05], fov: 30 },
  };
  const cam = cams[params.cam || 'hero'];
  st.camera.position.set(...cam.pos);
  st.camera.lookAt(...cam.look);
  st.camera.fov = cam.fov;
  st.camera.updateProjectionMatrix();
  const focus = st.camera.position.distanceTo(target);
  st.post({
    ao: { radius: 0.012, intensity: 2.0, falloff: 0.5 },
    dof: params.dof === false ? null : { distance: focus, range: params.range ?? 0.035, bokeh: params.bokeh ?? 4.5 },
    bloom: { intensity: 0.22, threshold: 1.1, radius: 0.75 },
    vignette: 0.6, exposure: params.exposure ?? 1.0, contrast: 0.1, saturation: -0.02,
  });
  return { canvas: st.canvas, frame: () => st.render() };
}
