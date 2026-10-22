// Numeric checks of engine2/botrig.js (no rendering): the leg stand-in against the model, gait tables, IK errors.
import { Studio, THREE } from '../engine2/core.js';
import { loadBotRig, restPose, walkPose, runPose, idlePose, soles, gait, legIK } from '../engine2/botrig.js';

export async function setup({ scale, params }) {
  const st = new Studio({ scale });
  const rig = await loadBotRig(st);
  const out = [];
  const log = (...a) => out.push(a.map((v) => (typeof v === 'string' ? v : JSON.stringify(v, (k, x) => (typeof x === 'number' ? +x.toFixed(4) : x)))).join(' '));
  // the model's feet vs the stand-in's, over a few poses
  const tests = { rest: restPose(), walk0: walkPose(0), walk25: walkPose(0.25), run45: runPose(0.45), idle3: idlePose(3),
    abd: { legL: { hip: [0, 0.2, 0.15], knee: 0.3 }, legR: { hip: [0, 0.2, 0.15], knee: 0.3 } } };
  for (const [k, p] of Object.entries(tests)) {
    rig.setPose(p);
    const a = rig.bones.foot_L.getWorldPosition(new THREE.Vector3()), b = rig.bones.foot_R.getWorldPosition(new THREE.Vector3());
    const so = soles(p);
    log(k, 'model ankles', a.toArray(), b.toArray(), 'stand-in minY', so.L.minY, so.R.minY);
  }
  for (const g of ['walk', 'run']) log(g, gait(g));
  const P = (b) => rig.bones[b].getWorldPosition(new THREE.Vector3()).toArray();
  for (const [k, p] of Object.entries({ bend: { armL: { shoulder: [0.5, 0.2, 0.15], elbow: 2.1 } }, fist: { armL: { shoulder: [0.9, 0.3, 0.15], elbow: 1.45, wrist: [0, 0.3, 0] } },
    twist: { armL: { shoulder: [0.25, 0, 0.1], elbow: 1.57, wrist: [0, -1.4, 0] } },
    hand: { armL: { shoulder: [0.5, 0, 0.1], elbow: 1.0, wrist: [0, -1.0, 0], fingers: 1, thumb: 1 } } })) {
    rig.setPose(p);
    log(k, 'elbow', P('forearm_L'), 'wrist', P('hand_L'), 'knuckle', P('middle1_L'), 'shoulder', P('upperarm_L'));
  }
  rig.setPose({ armL: { shoulder: [2.7, 0.1, 0.35], elbow: 0.2 } });
  log('raise upperarm_L pos', rig.bones.upperarm_L.position.toArray(), 'rest', rig.bones.upperarm_L.userData.restP.toArray(), 'clav q', rig.bones.clavicle_L.quaternion.toArray());
  // foot slip: with the holder moving at the gait's speed, how far does each planted pivot move during its stance?
  for (const g of ['walk', 'run']) {
    const info = gait(g), f = g === 'walk' ? walkPose : runPose;
    let worst = 0, worstY = 0;
    const prev = {}, total = { L: 0, R: 0 }, slips = [];
    for (let i = 0; i <= 400; i++) {
      const ph = i / 400, p = f(ph), so = soles(p);
      const hz = info.stride * ph; // the holder's advance
      for (const sd of ['L', 'R']) {
        const q = so[sd];
        const down = q.minY < 0.002; // (soles() includes the root offset)
        const k = q.w.indexOf(Math.max(...q.w));
        const z = q.piv[k][2] + hz;
        if (down && prev[sd] && prev[sd].k === k) { worst = Math.max(worst, Math.abs(z - prev[sd].z)); total[sd] += Math.abs(z - prev[sd].z); if (Math.abs(z - prev[sd].z) > 0.001) slips.push([sd, ph.toFixed(3), k, +(z - prev[sd].z).toFixed(4)]); }
        prev[sd] = down ? { k, z } : null;
        if (down) worstY = Math.min(worstY, q.minY);
      }
    }
    log(g, 'max slip per 1/400 cycle (m)', worst, 'total per cycle', total, 'deepest sole (m)', worstY, 'speed', info.speed);
    log(g, 'slips > 1 mm', slips.slice(0, 30));
  }
  for (let i = 0; i < 24; i++) {
    const ph = i / 24, p = walkPose(ph);
    p.root.pos = [0, 0, 0];
    const so = soles(p);
    log('walk', ph.toFixed(3), 'L', so.L.minY, so.L.piv.map((c) => c[2]), so.L.w, 'R', so.R.minY);
  }
  for (const l of out) console.warn(l);
  return { canvas: st.canvas, frame: () => {} };
}
