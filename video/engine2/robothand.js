// The robot's forearm + hand as a stand-alone rig for close-ups (the elbow chain lifted out of the full robot).
// Rig space: elbow at the origin, rest pose as on the robot (right forearm hanging, palm facing the body, +x).
// Finger joints flex about their local x (+ curls toward the palm); a phalanx points along its local -z and its
// pad faces local +y.
import { THREE } from './core.js';

const FINGERS = { thumb: 1, index: 2, middle: 3, ring: 4, little: 5 };

export function handRig(robot, side = 'R') {
  const elbow = robot.joints[`elbow_${side}`];
  elbow.removeFromParent();
  elbow.position.set(0, 0, 0);
  elbow.quaternion.identity();
  const rig = new THREE.Group();
  rig.add(elbow);
  rig.updateMatrixWorld(true);
  const j = (n) => robot.joints[`${n}_${side}`];
  // distal phalanx lengths, measured from the meshes
  const tipLen = {};
  for (let f = 1; f <= 5; f++) {
    const joint = j(`f${f}3`);
    const seg = joint.children.find((o) => o.isMesh && o.name.startsWith('W_'));
    const inv = joint.matrixWorld.clone().invert();
    const pos = seg.geometry.attributes.position, v = new THREE.Vector3();
    let zmin = 0;
    for (let i = 0; i < pos.count; i += 3) {
      v.fromBufferAttribute(pos, i).applyMatrix4(seg.matrixWorld).applyMatrix4(inv);
      zmin = Math.min(zmin, v.z);
    }
    tipLen[f] = -zmin;
  }
  return { rig, elbow, wrist: j('wrist'), joint: j, side, tipLen, rest: robot.rest };
}

// pose: { wrist: [x, y, z], thumb: [a, b, c], thumbBase: [y, z], index: [...], ... } radians (finger flexion per joint)
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), AX = new THREE.Vector3(1, 0, 0);
export function poseHand(h, pose) {
  const w = h.wrist;
  w.quaternion.copy(h.rest[`wrist_${h.side}`]);
  if (pose.wrist) w.quaternion.multiply(_q.setFromEuler(_e.set(...pose.wrist, 'XYZ')));
  for (const [name, f] of Object.entries(FINGERS)) {
    const a = pose[name] || [0, 0, 0];
    for (let k = 1; k <= 3; k++) {
      const jt = h.joint(`f${f}${k}`);
      jt.quaternion.copy(h.rest[`f${f}${k}_${h.side}`]);
      // the thumb's base also swings across the palm (opposition): thumbBase = [about pad normal, about the bone]
      if (f === 1 && k === 1 && pose.thumbBase) jt.quaternion.multiply(_q.setFromEuler(_e.set(0, pose.thumbBase[0] || 0, pose.thumbBase[1] || 0, 'XYZ')));
      jt.quaternion.multiply(_q.setFromAxisAngle(AX, a[k - 1] || 0));
    }
  }
  h.rig.updateMatrixWorld(true);
}

// a point on the pad of a fingertip (world space), ~60% along the distal phalanx
export function padPoint(h, finger, along = 0.62, out = 0.0058) {
  const f = FINGERS[finger];
  return h.joint(`f${f}3`).localToWorld(new THREE.Vector3(0, out, -h.tipLen[f] * along));
}
