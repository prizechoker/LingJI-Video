// The home robot, rigged (assets/models/bot_rig.glb, made by blender/rig_bot.py from the static bot.glb): the same
// meshes and materials as engine2/bot.js, on one skeleton, posed from plain data.
//
//   const rig = await loadBotRig(studio, { mats: botMaterials({...}) });
//   scene.add(rig.holder);
//   rig.setPose(walkPose(phase));            // any pose object (below); missing parts stay at rest
//   reachIK(rig, 'R', target, pole);         // after setPose: the right hand's palm to a world point
//   handPoint(rig, 'R', 'palm')              // world position of a hand point (THREE.Vector3)
//
// Space: the holder's local space is the model's: metres, y up, the robot faces +z, its left is +x; the soles rest on
// y = 0 in the rest pose. Bones: hips (the root), spine, chest, neck, head; per side (_L at +x, _R at -x): clavicle,
// upperarm, forearm, hand, thigh, shin, foot, toe; fingers index/middle/ring/pinky 1-3 and thumb 1-3 (proximal to
// distal). Helper bones (x_...) are driven by setPose. B_head rides rigidly on the head bone, B_shoes on foot and toe.
//
// Pose (all angles in radians; left and right take the same meaning, mirrored, so equal values make a symmetric pose;
// every field optional):
//   root:  { pos: [x, y, z] offset of the hips in metres, rot: [pitch +forward, turn +to its left, lean +to its left] }
//   spine, chest, neck, head: [flex +forward, turn +to its left, lean +to its left]
//   armL / armR: {
//     shoulder: [flex (+ raises the arm forward), inward rotation (+ turns the arm's front toward the body),
//                abduct (+ raises the arm out to the side)]  (the shoulder girdle follows on its own: see clavicle)
//     elbow: flexion (0 = as modelled, slightly bent; ~2.4 max)
//     wrist: [flex (+ toward the palm), pronate (+ turns the palm down/back), deviate (+ toward the thumb)]
//     clavicle: [protract (+ shoulder forward), 0, elevate (+ shoulder up)]  added to the automatic shoulder rhythm
//     fingers: curl 0..1 (0 = relaxed as modelled, 1 = a loose fist, < 0 straightens), or [index, middle, ring, pinky]
//     thumb: 0..1 (curls the thumb across the palm), spread: -1..1 (fans the fingers)
//   }
//   legL / legR: {
//     hip: [flex (+ thigh forward), inward rotation, abduct (+ out to the side)]
//     knee: flexion (+ bends; 0 = straight as modelled)
//     ankle: [dorsiflex (+ toes up), toe in (+), evert (+ sole turned outward)]
//     toe: extension at the ball of the foot (+ toes up, as in push-off)
//   }
// Euler orders: trunk 'YXZ' (turn, then flex, then lean); limbs 'ZXY' (abduct, then flex, then the twist about the bone).
import { THREE } from './core.js';
import { botMaterials } from './bot.js';

const V = (a) => new THREE.Vector3(...a);
const TRUNK = ['spine', 'chest', 'neck', 'head'];
const SIDES = { L: 1, R: -1 };
const FING = ['index', 'middle', 'ring', 'pinky'];
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();

// semantic [x, y, z] -> the bone's local Euler angles (left side; the right side mirrors y and z)
const SIGN = { trunk: [1, 1, -1], limb: [1, -1, -1] };

function localQuat(out, a, kind, side, order) {
  const s = SIGN[kind];
  const m = kind === 'trunk' ? 1 : side;
  _e.set(s[0] * (a[0] || 0), s[1] * m * (a[1] || 0), s[2] * m * (a[2] || 0), order);
  return out.setFromEuler(_e);
}

export async function loadBotRig(studio, { url = '../assets/models/bot_rig.glb', mats = botMaterials(), shadows = true } = {}) {
  const g = await studio.gltf.loadAsync(url);
  const parts = {};
  const bones = {};
  g.scene.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
    if (!o.isMesh) return;
    const geo = o.geometry;
    const col = geo.getAttribute('color');
    if (col) {
      geo.setAttribute('botData', col);
      geo.deleteAttribute('color');
    }
    o.material = /head/i.test(o.name) ? mats.head : mats.body;
    o.castShadow = o.receiveShadow = shadows;
    o.frustumCulled = false; // (a skinned mesh's bounds are its bind pose's)
    parts[o.name] = o;
  });
  for (const b of Object.values(bones)) {
    b.userData.restQ = b.quaternion.clone();
    b.userData.restP = b.position.clone();
  }
  const holder = new THREE.Group();
  holder.add(g.scene);
  const rig = { holder, bones, parts, mats, rest: restPose(), pose: restPose() };
  rig.setPose = (p) => setPose(rig, p);
  rig.setPose(rig.rest);
  return rig;
}

export function restPose() {
  const arm = () => ({ shoulder: [0, 0, 0], elbow: 0, wrist: [0, 0, 0], fingers: 0, thumb: 0, spread: 0 });
  const leg = () => ({ hip: [0, 0, 0], knee: 0, ankle: [0, 0, 0], toe: 0 });
  return { root: { pos: [0, 0, 0], rot: [0, 0, 0] }, spine: [0, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0],
    armL: arm(), armR: arm(), legL: leg(), legR: leg() };
}

function setBone(b, q) {
  b.quaternion.copy(b.userData.restQ).multiply(q);
}

export function setPose(rig, pose = {}) {
  const B = rig.bones;
  rig.pose = pose;
  for (const b of Object.values(B)) {
    b.quaternion.copy(b.userData.restQ);
    b.position.copy(b.userData.restP);
  }
  const root = pose.root || {};
  if (root.pos) B.hips.position.add(V(root.pos));
  if (root.rot) setBone(B.hips, localQuat(_q, root.rot, 'trunk', 1, 'YXZ'));
  for (const k of TRUNK) if (pose[k]) setBone(B[k], localQuat(_q, pose[k], 'trunk', 1, 'YXZ'));
  for (const [sd, s] of Object.entries(SIDES)) {
    const arm = pose['arm' + sd];
    if (arm) poseArm(rig, sd, s, arm);
    const leg = pose['leg' + sd];
    if (leg) poseLeg(rig, sd, s, leg);
  }
  rig.holder.updateMatrixWorld(true);
}

function poseArm(rig, sd, s, a) {
  const B = rig.bones;
  const ua = B['upperarm_' + sd];
  if (a.shoulder) setBone(ua, localQuat(_q, a.shoulder, 'limb', s, 'ZXY'));
  if (a.elbow) setBone(B['forearm_' + sd], _q.setFromAxisAngle(V([1, 0, 0]), a.elbow));
  if (a.wrist) setBone(B['hand_' + sd], localQuat(_q, a.wrist, 'limb', s, 'ZXY'));
}

function poseLeg(rig, sd, s, l) {
  const B = rig.bones;
  if (l.hip) setBone(B['thigh_' + sd], localQuat(_q, l.hip, 'limb', s, 'ZXY'));
  if (l.knee) setBone(B['shin_' + sd], _q.setFromAxisAngle(V([1, 0, 0]), l.knee));
  if (l.ankle) setBone(B['foot_' + sd], localQuat(_q, l.ankle, 'limb', s, 'ZXY'));
  if (l.toe) setBone(B['toe_' + sd], _q.setFromAxisAngle(V([1, 0, 0]), l.toe));
}

// ---------------------------------------------------------------- (poses and IK: below)
export function idlePose() { return restPose(); }
export function walkPose() { return restPose(); }
export function runPose() { return restPose(); }
export function reachIK() { return null; }
export function handPoint(rig, sd) { return rig.bones['hand_' + sd].getWorldPosition(new THREE.Vector3()); }
