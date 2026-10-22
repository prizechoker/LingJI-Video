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
  rig.setPose({ armL: { shoulder: [2.7, 0.1, 0.35], elbow: 0.2 } });
  log('raise upperarm_L pos', rig.bones.upperarm_L.position.toArray(), 'rest', rig.bones.upperarm_L.userData.restP.toArray(), 'clav q', rig.bones.clavicle_L.quaternion.toArray());
  for (let i = 0; i < 24; i++) {
    const ph = i / 24, p = walkPose(ph);
    p.root.pos = [0, 0, 0];
    const so = soles(p);
    log('walk', ph.toFixed(3), 'L', so.L.minY, so.L.piv.map((c) => c[2]), so.L.w, 'R', so.R.minY);
  }
  for (const l of out) console.warn(l);
  return { canvas: st.canvas, frame: () => {} };
}
