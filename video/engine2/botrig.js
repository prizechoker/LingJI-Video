// The home robot, rigged (assets/models/bot_rig.glb, made by blender/rig_bot.py from the static bot.glb): the same
// meshes and materials as engine2/bot.js, on one skeleton, posed from plain data. Every function here is a pure
// function of its inputs (no clocks, no randomness, no state carried between frames).
//
//   const rig = await loadBotRig(studio, { mats: botMaterials({...}) });
//   scene.add(rig.holder);
//   rig.setPose(walkPose(phase));                 // any pose object (below); what a pose leaves out stays at rest
//   const arm = reachIK(rig, 'R', target, pole);  // after setPose: the right palm to a world point (pose fragment)
//   handPoint(rig, 'R', 'grip')                   // world position of a point on a hand (THREE.Vector3)
//
// Space: the holder's local space is the model's: metres, y up, the robot faces +z, its left is +x; the soles rest on
// y = 0 in the rest pose (standing, arms hanging close to the body, palms toward the thighs, feet turned out ~23 deg).
// Bones: hips (the root), spine, chest, neck, head; per side (_L at +x, _R at -x): clavicle, upperarm, forearm, hand,
// thigh, shin, foot, toe; the fingers index/middle/ring/pinky 1..3 and thumb 1..3 (proximal to distal). Helper bones
// (x_...: half-way bones at shoulder, elbow, hip and knee, twist bones along the upper arm and forearm) are driven by
// setPose. B_head rides rigidly on the head bone; B_shoes on foot and toe (the shoe flexes at the ball of the foot).
//
// Pose (angles in radians; left and right take the same meaning, mirrored, so equal values make a symmetric pose;
// every field is optional):
//   root:  { pos: [x, y, z] offset of the hips in metres, rot: [pitch +forward, turn +to its left, lean +to its left] }
//   spine, chest, neck, head: [flex +forward, turn +to its left, lean +to its left]
//   armL / armR: {
//     shoulder: [flex (+ raises the arm forward), inward rotation (+ turns the arm's front toward the body),
//                abduct (+ raises the arm out to the side)]  — the arm's direction relative to the chest; the shoulder
//                girdle (clavicle) follows on its own as the arm rises or reaches (see shoulderRhythm)
//     elbow: flexion (0 = as modelled, slightly bent; about 2.4 at most)
//     wrist: [flex (+ toward the palm), pronate (+ turns the palm down / back), deviate (+ toward the thumb)]
//     clavicle: [protract (+ the shoulder forward), 0, elevate (+ up)]  added to the automatic rhythm;
//     rhythm: false switches the automatic part off
//     fingers: curl, 0 = relaxed as modelled, 1 = a loose fist, negative straightens (to about -0.3);
//              a number for all four or [index, middle, ring, pinky]
//     thumb: 0..1 curls the thumb across the palm; spread: -1..1 fans the fingers apart (+) or together (-)
//   }
//   legL / legR: {
//     hip: [flex (+ thigh forward), inward rotation (+), abduct (+ out to the side)]
//     knee: flexion (+ bends; 0 = straight as modelled)
//     ankle: [dorsiflex (+ toes up), toe in (+), evert (+ sole turned outward)]
//     toe: extension at the ball of the foot (+ toes up, as in push-off)
//   }
// Euler orders (three.js): trunk 'YXZ' (turn, then flex, then lean); shoulder and hip 'XZY' (the twist about the bone
// first, then abduction, then flexion about the body's side-to-side axis: a raised arm keeps its outward angle);
// wrist and ankle 'ZXY'. The hip flexes in the sagittal plane; the knee's hinge is square to the foot's toe-out, so
// a bent knee tracks over the toes.
//
// Generators: idlePose(t) (seconds: breathing and a slow weight shift, the feet planted), walkPose(phase) and
// runPose(phase) (phase in cycles, 0 = the left foot's contact; the soles stay on the floor and, when the holder moves
// forward along its +z at gait(name).speed (m/s) with phase = t / gait(name).cycle, the stance foot stays planted:
// a walk of ~1.3 m/s, a run of ~3.1 m/s; on a treadmill keep the holder still and run the belt at that speed).
// runPose(0.38 .. 0.44) is the flight of a stride (both feet off the ground: the left leg trailing after its push-off,
// the right knee driven forward; 0.42 is mid-flight). legIK(pose, side, ankleTarget) plants a foot;
// reachIK(rig, side, target, pole) reaches a hand.
//
// Limits: linear blend skinning with helper bones; at load the shoulders' weights are corrected (engine2/botjoint.js:
// the flank no longer follows a raised arm, the shoulder cap blends over its whole width). Arms raised up to ~120 deg
// (a wave, the hand above the head) stay clean; beyond that the top of the shoulder starts to crease beside the neck. The fingers are fused at their bases (as modelled), so a
// wide spread stretches the webs. Elbows past ~2.3 and knees past ~2.2 start to press into themselves.
import { THREE } from './core.js';
import { botMaterials } from './bot.js';
import { freeFlanks } from './botjoint.js';

const V3 = THREE.Vector3;
const SIDES = { L: 1, R: -1 };
const FING = ['index', 'middle', 'ring', 'pinky'];
const TRUNK = ['spine', 'chest', 'neck', 'head'];
const X = new V3(1, 0, 0);
const Y = new V3(0, 1, 0);
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _qc = new THREE.Quaternion();
const _sw = new THREE.Quaternion();
const _tw = new THREE.Quaternion();
const _I = new THREE.Quaternion();
const _v = new V3();

// ---------------------------------------------------------------- semantic angles <-> a bone's local rotation
// [x, y, z] -> local Euler angles (left side; the right side mirrors: y and z change sign)
const SIGN = { trunk: [1, 1, -1], limb: [1, -1, -1] };

function localQuat(out, a, kind, side, order) {
  const s = SIGN[kind];
  const m = kind === 'trunk' ? 1 : side;
  _e.set(s[0] * (a[0] || 0), s[1] * m * (a[1] || 0), s[2] * m * (a[2] || 0), order);
  return out.setFromEuler(_e);
}

function semantic(q, kind, side, order) {
  const s = SIGN[kind];
  const m = kind === 'trunk' ? 1 : side;
  const e = new THREE.Euler().setFromQuaternion(q, order);
  return [e.x / s[0], e.y / (s[1] * m), e.z / (s[2] * m)];
}

// ---------------------------------------------------------------- loading
// shoulders: false keeps the skin weights as exported (the armpit and shoulder-cap corrections of engine2/botjoint.js
// off; for comparing)
export async function loadBotRig(studio, { url = '../assets/models/bot_rig.glb', mats = botMaterials(), shadows = true, shoulders = true } = {}) {
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
  if (shoulders && parts.B_body && parts.B_body.isSkinnedMesh) freeFlanks(parts.B_body);
  const extras = g.parser.json.extras || {};
  for (const [k, v] of Object.entries(extras.legrest || {})) {
    if (v.some((x, i) => Math.abs(x - LEGREST[k][i]) > 2e-4)) console.warn(`botrig: ${k} differs from LEGREST (copy it again from blender/rig_bot.py's output)`);
  }
  const holder = new THREE.Group();
  holder.add(g.scene);
  const rig = { holder, bones, parts, mats, points: extras.points || {}, rest: restPose(), pose: restPose() };
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

// ---------------------------------------------------------------- posing
function setBone(b, q) {
  if (b) b.quaternion.copy(b.userData.restQ).multiply(q);
}

function applyRoot(B, root = {}) {
  if (root.pos) B.hips.position.add(_v.fromArray(root.pos));
  if (root.rot) setBone(B.hips, localQuat(_q, root.rot, 'trunk', 1, 'YXZ'));
}

export function setPose(rig, pose = {}) {
  const B = rig.bones;
  rig.pose = pose;
  for (const b of Object.values(B)) {
    b.quaternion.copy(b.userData.restQ);
    b.position.copy(b.userData.restP);
  }
  applyRoot(B, pose.root);
  for (const k of TRUNK) if (pose[k]) setBone(B[k], localQuat(_q, pose[k], 'trunk', 1, 'YXZ'));
  for (const [sd, s] of Object.entries(SIDES)) {
    poseArm(B, sd, s, pose['arm' + sd] || {});
    poseLeg(B, sd, s, pose['leg' + sd] || {});
  }
  rig.holder.updateMatrixWorld(true);
}

// q = swing * twist, the twist about the unit axis: returns the twist's angle (and fills swing, twist)
function swingTwist(q, axis, swing, twist) {
  const d = q.x * axis.x + q.y * axis.y + q.z * axis.z;
  twist.set(axis.x * d, axis.y * d, axis.z * d, q.w);
  const n = twist.length();
  if (n < 1e-9) twist.identity(); else twist.set(twist.x / n, twist.y / n, twist.z / n, twist.w / n);
  swing.copy(q).multiply(_q3.copy(twist).invert());
  return 2 * Math.atan2(d, q.w);
}

const softplus = (v, k) => k * Math.log1p(Math.exp(v / k));
const smooth01 = (u) => { const t = Math.max(0, Math.min(1, u)); return t * t * (3 - 2 * t); };

// The shoulder girdle's share of an arm movement (the scapulohumeral rhythm): the clavicle lifts as the arm rises past
// ~30 degrees and draws forward as the arm reaches forward; overhead, the arm's root also rides up and out (lift, in
// metres: the shoulder blade's upward turn), so the shoulder cap rolls up over the yoke rather than into it. dir: the
// arm's direction (shoulder to elbow) in the chest's frame. The arm keeps the direction the pose asks for; only the
// shoulder moves. (armX.rhythm = false switches this off; armX.lift scales the lift.)
export function shoulderRhythm(dir) {
  const elev = Math.acos(Math.max(-1, Math.min(1, -dir.y)));
  return {
    elevate: Math.min(0.24 * softplus(elev - 0.6, 0.12), 0.3),
    lift: 0.055 * smooth01((elev - 1.3) / 1.4), // metres
    protract: 0.16 * Math.max(0, dir.z) * Math.min(1, elev / 0.8) - 0.06 * Math.max(0, -dir.z),
  };
}

function poseArm(B, sd, s, a) {
  const ua = B['upperarm_' + sd];
  const Rua = ua.userData.restQ;
  const qSh = localQuat(new THREE.Quaternion(), a.shoulder || [0, 0, 0], 'limb', s, 'XZY');
  // the clavicle: the rhythm and any explicit offset
  const dir = _v.set(0, -1, 0).applyQuaternion(_q.copy(Rua).multiply(qSh));
  const r = a.rhythm === false ? { elevate: 0, protract: 0 } : shoulderRhythm(dir);
  const c = a.clavicle || [0, 0, 0];
  _e.set(0, -s * (r.protract + (c[0] || 0)), s * (r.elevate + (c[2] || 0)), 'ZXY');
  _qc.setFromEuler(_e);
  setBone(B['clavicle_' + sd], _qc);
  // the upper arm, compensated for the clavicle (Rua^-1 qc^-1 Rua qSh): it points where the pose says
  const qua = _q.copy(Rua).invert().multiply(_q2.copy(_qc).invert()).multiply(Rua).multiply(qSh);
  setBone(ua, qua);
  const tw = swingTwist(qua, Y, _sw, _tw);
  setBone(B['x_shoulder_' + sd], _q2.copy(_I).slerp(_sw, 1 / 3));
  setBone(B['x_shoulder2_' + sd], _q2.copy(_I).slerp(_sw, 2 / 3));
  // overhead, the arm's root rides up and out (the shoulder blade's upward turn), so the shoulder cap rolls up over the
  // yoke instead of into it; the in-between bones take a third and two thirds of the lift
  const lift = (r.lift ?? 0) * (a.lift ?? 1);
  if (lift > 0) {
    _v.set(s * 0.3, 1, 0).multiplyScalar(lift);
    ua.position.addScaledVector(_v, 1);
    B['x_shoulder_' + sd].position.addScaledVector(_v, 1 / 3);
    B['x_shoulder2_' + sd].position.addScaledVector(_v, 2 / 3);
  }
  setBone(B['x_uatwist_' + sd], _q2.setFromAxisAngle(Y, -tw));
  setBone(B['x_uatwist2_' + sd], _q2.setFromAxisAngle(Y, -tw / 2));
  const el = a.elbow || 0;
  setBone(B['forearm_' + sd], _q2.setFromAxisAngle(X, el));
  setBone(B['x_elbow_' + sd], _q2.setFromAxisAngle(X, el / 2));
  // the wrist; its twist about the forearm spreads along the forearm
  const hand = B['hand_' + sd];
  const qw = localQuat(new THREE.Quaternion(), a.wrist || [0, 0, 0], 'limb', s, 'ZXY');
  setBone(hand, qw);
  const delta = _q.copy(hand.userData.restQ).multiply(qw).multiply(_q2.copy(hand.userData.restQ).invert());
  const pr = swingTwist(delta, Y, _sw, _tw);
  setBone(B['x_fatwist1_' + sd], _q2.setFromAxisAngle(Y, pr * 0.37));
  setBone(B['x_fatwist2_' + sd], _q2.setFromAxisAngle(Y, pr * 0.75));
  // the fingers
  const cu = Array.isArray(a.fingers) ? a.fingers : FING.map(() => a.fingers || 0);
  const sp = a.spread || 0;
  const SPREAD = { index: -0.17, middle: -0.02, ring: 0.1, pinky: 0.22 };
  FING.forEach((f, i) => {
    const k = cu[i] || 0;
    _e.set(k * 1.3, 0, s * sp * SPREAD[f], 'ZXY');
    setBone(B[f + '1_' + sd], _q2.setFromEuler(_e));
    setBone(B[f + '2_' + sd], _q2.setFromAxisAngle(X, k * 1.6));
    setBone(B[f + '3_' + sd], _q2.setFromAxisAngle(X, k * 1.0));
  });
  const t = a.thumb || 0;
  setBone(B['thumb1_' + sd], _q2.setFromAxisAngle(X, t * 0.45));
  setBone(B['thumb2_' + sd], _q2.setFromAxisAngle(X, t * 0.55));
  setBone(B['thumb3_' + sd], _q2.setFromAxisAngle(X, t * 0.75));
}

function poseLeg(B, sd, s, l) {
  const qh = localQuat(new THREE.Quaternion(), l.hip || [0, 0, 0], 'limb', s, 'XZY');
  setBone(B['thigh_' + sd], qh);
  setBone(B['x_hip_' + sd], _q2.copy(_I).slerp(qh, 0.5));
  const k = l.knee || 0;
  setBone(B['shin_' + sd], _q2.setFromAxisAngle(X, k));
  setBone(B['x_knee_' + sd], _q2.setFromAxisAngle(X, k / 2));
  setBone(B['foot_' + sd], localQuat(_q, l.ankle || [0, 0, 0], 'limb', s, 'ZXY'));
  setBone(B['toe_' + sd], _q.setFromAxisAngle(X, l.toe || 0));
}

// ---------------------------------------------------------------- points on the hands
// which: 'wrist' | 'palm' (the palm's centre, on its surface) | 'grip' (the centre of what a curled hand holds) |
// '<finger>_tip' (thumb, index, middle, ring, pinky)
export function handPoint(rig, sd, which = 'palm', out = new V3()) {
  if (which === 'wrist') return rig.bones['hand_' + sd].getWorldPosition(out);
  const [bone, p] = rig.points[`${which}_${sd}`];
  return out.fromArray(p).applyMatrix4(rig.bones[bone].matrixWorld);
}

// ---------------------------------------------------------------- two-bone IK
// The hinge angle at which the far joint lies at distance D from the near one. v1: the middle joint in the upper bone's
// frame; v2: the far joint relative to the middle one, in the upper bone's frame, at hinge angle 0; a: the hinge axis
// in the upper bone's frame. Of the two solutions, the bending one (flexion: the larger angle).
function hingeFor(D, v1, v2, a) {
  const par = a.clone().multiplyScalar(a.dot(v2));
  const perp = v2.clone().sub(par);
  const c0 = v1.dot(par), c1 = v1.dot(perp), c2 = v1.dot(a.clone().cross(perp));
  const K = (D * D - v1.lengthSq() - v2.lengthSq()) / 2 - c0;
  const R = Math.hypot(c1, c2);
  return Math.atan2(c2, c1) + Math.acos(Math.max(-1, Math.min(1, K / R)));
}

// the upper bone's local rotation (after its rest) that takes u (the far joint, in the bone's rest frame) along t,
// turned about t so that the middle joint m leans toward the pole p (all in the rest frame)
function aimWithPole(u, t, m, p) {
  const q = new THREE.Quaternion().setFromUnitVectors(u.clone().normalize(), t.clone().normalize());
  if (!p) return q;
  const n = t.clone().normalize();
  const mm = m.clone().applyQuaternion(q);
  const a = mm.sub(n.clone().multiplyScalar(mm.dot(n)));
  const b = p.clone().sub(n.clone().multiplyScalar(p.dot(n)));
  if (a.lengthSq() < 1e-12 || b.lengthSq() < 1e-12) return q;
  const ang = Math.atan2(n.dot(a.clone().cross(b)), a.dot(b));
  return new THREE.Quaternion().setFromAxisAngle(n, ang).multiply(q);
}

// Reach: after rig.setPose(pose), bend the arm of side ('L' | 'R') so that a point of its hand (opts.point: 'palm' by
// default, or 'grip', 'wrist', 'index_tip', ...) reaches target (a world point). pole: a world point the elbow should
// lean toward (default: down, out and back from the shoulder). Keeps the pose's wrist (or opts.wrist), fingers and
// everything else; applies the result to the rig and returns the arm's pose (rig.setPose({ ...pose, armR: result })
// reproduces the frame). The shoulder girdle's rhythm is included (solved by a few rounds). The elbow straightens no
// further than opts.minElbow (the arm is modelled slightly bent): a target out of reach is pointed at, not reached.
export function reachIK(rig, sd, target, pole = null, { point = 'palm', wrist, iterations = 5, minElbow = -0.15 } = {}) {
  const s = SIDES[sd];
  const B = rig.bones;
  const ua = B['upperarm_' + sd], fa = B['forearm_' + sd], hand = B['hand_' + sd], cl = B['clavicle_' + sd];
  const base = rig.pose;
  const arm = { ...(base['arm' + sd] || {}) };
  if (wrist) arm.wrist = wrist;
  const Rua = ua.userData.restQ;
  const toRest = Rua.clone().invert();
  const v1 = fa.userData.restP.clone();
  const v2 = hand.userData.restP.clone().applyQuaternion(fa.userData.restQ);
  const a = X.clone().applyQuaternion(fa.userData.restQ);
  for (let it = 0; it < iterations; it++) {
    rig.setPose({ ...base, ['arm' + sd]: arm });
    const off = handPoint(rig, sd, point).sub(hand.getWorldPosition(new V3()));
    const wt = target.clone().sub(off); // where the wrist must go (world)
    const inv = cl.matrixWorld.clone().invert();
    const gh = ua.position; // (the shoulder joint, in the clavicle's frame)
    const t = wt.clone().applyMatrix4(inv).sub(gh).applyQuaternion(toRest);
    const el = Math.max(minElbow, hingeFor(Math.min(t.length(), v1.length() + v2.length() - 1e-4), v1, v2, a));
    const u = v1.clone().add(v2.clone().applyAxisAngle(a, el));
    const pw = pole ? pole.clone() : ua.getWorldPosition(new V3()).add(new V3(s * 0.35, -0.6, -0.3).transformDirection(rig.holder.matrixWorld));
    const p = pw.applyMatrix4(inv).sub(gh).applyQuaternion(toRest);
    const qua = aimWithPole(u, t, v1, p);
    // back to the pose's terms: qSh = Rua^-1 qc Rua qua (qc: the clavicle's posed rotation)
    const qc = cl.userData.restQ.clone().invert().multiply(cl.quaternion);
    const qSh = toRest.clone().multiply(qc).multiply(Rua).multiply(qua);
    arm.shoulder = semantic(qSh, 'limb', s, 'XZY');
    arm.elbow = el;
  }
  rig.setPose({ ...base, ['arm' + sd]: arm });
  rig.pose = base;
  return arm;
}

// ---------------------------------------------------------------- the legs, without the model
// The left leg's rest transforms and its sole's contact points (blender/rig_bot.py prints them and writes them into
// the file's extras; loadBotRig checks they match). The right leg is the mirror image.
const LEGREST = {
  hips: [0.0, 0.935, 0.00585, 0, 0, 0, 1],
  thigh_L: [0.09407, -0.0497, 0.00267, -0.03789, 0.998796, 0.031147, -0.001182],
  shin_L: [-0.0, -0.41229, 0.0, -0.004196, 0.980142, -0.008602, -0.198067],
  foot_L: [-0.0, -0.40505, 0.0, 0.044606, 0.998734, -0.023211, 0.001037],
  toe_L: [0.00275, -0.054, -0.10341, 0, 0, 0, 1],
};
// [x, y, z] in the foot's / toe's frame (left): the sole's outline every 12 mm and the rounded heel's and toe's profiles
const SOLE = {
  foot: [[0.019, -0.0486, 0.0556], [-0.0133, -0.0496, 0.0557], [0.0193, -0.0715, 0.0438], [-0.0141, -0.071, 0.0455],
    [-0.0006, -0.072, 0.0326], [0.0306, -0.072, 0.0199], [-0.0225, -0.072, 0.0256], [0.0216, -0.072, 0.0096],
    [-0.0195, -0.072, 0.014], [0.0245, -0.072, -0.0027], [-0.0173, -0.072, -0.0033], [0.0204, -0.072, -0.0262],
    [-0.0183, -0.072, -0.0261], [0.0246, -0.072, -0.0457], [-0.0139, -0.072, -0.0482], [0.0189, -0.0709, -0.0699],
    [-0.0135, -0.071, -0.0698], [0.0189, -0.0708, -0.087], [-0.0133, -0.071, -0.0867], [0.019, -0.0711, -0.0974],
    [-0.0138, -0.0713, -0.0998], [0.0031, -0.0652, 0.0553], [0.0036, -0.0564, 0.0579], [0.002, -0.0475, 0.0599]],
  toe: [[0.0166, -0.0173, -0.0072], [-0.016, -0.0174, -0.0055], [0.016, -0.0169, -0.0253], [-0.0178, -0.0168, -0.0259],
    [0.0163, -0.0121, -0.0508], [-0.0161, -0.0125, -0.0513], [0.017, -0.0038, -0.062], [-0.0168, -0.005, -0.062],
    [-0.0006, -0.0099, -0.0613], [0.0013, -0.0028, -0.0684], [-0.0016, 0.0056, -0.0705]],
};
const LEG_BONES = ['hips', 'thigh_L', 'shin_L', 'foot_L', 'toe_L', 'thigh_R', 'shin_R', 'foot_R', 'toe_R'];

let LEGS = null;
function legs() { // a stand-in skeleton (hips and legs only), posed exactly as the model's
  if (LEGS) return LEGS;
  const root = new THREE.Object3D();
  const B = {};
  const mk = (name, parent, r) => {
    const o = new THREE.Object3D();
    o.position.set(r[0], r[1], r[2]);
    o.quaternion.set(r[3], r[4], r[5], r[6]);
    o.userData.restQ = o.quaternion.clone();
    o.userData.restP = o.position.clone();
    parent.add(o);
    B[name] = o;
  };
  mk('hips', root, LEGREST.hips);
  for (const [sd, s] of Object.entries(SIDES)) {
    const m = (r) => (s > 0 ? r : [-r[0], r[1], r[2], r[3], -r[4], -r[5], r[6]]);
    mk('thigh_' + sd, B.hips, m(LEGREST.thigh_L));
    mk('shin_' + sd, B['thigh_' + sd], m(LEGREST.shin_L));
    mk('foot_' + sd, B['shin_' + sd], m(LEGREST.foot_L));
    mk('toe_' + sd, B['foot_' + sd], m(LEGREST.toe_L));
    B['sole_' + sd] = [...SOLE.foot.map((p) => ['foot_' + sd, new V3(s * p[0], p[1], p[2])]),
      ...SOLE.toe.map((p) => ['toe_' + sd, new V3(s * p[0], p[1], p[2])])];
    // fixed points of the sole the foot pivots on: the heel's corner, the ball, the toe's tip
    B['pivot_' + sd] = [['foot_' + sd, new V3(0, -0.0712, 0.044)], ['foot_' + sd, new V3(0, -0.072, -0.1)], ['toe_' + sd, new V3(0, -0.012, -0.05)]];
  }
  LEGS = { root, bones: B };
  return LEGS;
}

function poseLegs(pose) {
  const { root, bones: B } = legs();
  for (const k of LEG_BONES) {
    B[k].quaternion.copy(B[k].userData.restQ);
    B[k].position.copy(B[k].userData.restP);
  }
  applyRoot(B, pose.root);
  for (const [sd, s] of Object.entries(SIDES)) poseLeg(B, sd, s, pose['leg' + sd] || {});
  root.updateMatrixWorld(true);
  return B;
}

// the soles in a pose (holder space): per side the lowest point's height and the fixed points the foot pivots on (the
// heel's corner, the ball, the toe's tip) with weights by how close each is to the floor
export function soles(pose) {
  const B = poseLegs(pose);
  const out = {};
  const p = new V3();
  for (const sd of Object.keys(SIDES)) {
    const pts = B['sole_' + sd].map(([b, q]) => p.copy(q).applyMatrix4(B[b].matrixWorld).y);
    const minY = Math.min(...pts);
    const piv = B['pivot_' + sd].map(([b, q]) => p.copy(q).applyMatrix4(B[b].matrixWorld).toArray());
    const w = piv.map((c) => Math.exp(-(c[1] - minY) / 0.004));
    const ws = w.reduce((a, b) => a + b, 0);
    out[sd] = { minY, piv, w: w.map((v) => v / ws) };
  }
  return out;
}

let ANKLES = null; // the ankles' rest positions (holder space)
function restAnkle(sd) {
  if (!ANKLES) {
    const B = poseLegs({});
    ANKLES = { L: B.foot_L.getWorldPosition(new V3()), R: B.foot_R.getWorldPosition(new V3()) };
  }
  return ANKLES[sd].clone();
}

// Two-bone leg IK: the hip and knee that put the ankle at target (holder space; default: where it is at rest), and the
// ankle that keeps the foot as at rest (flat, turned out as modelled). Keeps the leg's inward rotation from the pose.
// Returns the leg's pose (for pose.legL / legR).
export function legIK(pose, sd, target = restAnkle(sd), { toe = 0 } = {}) {
  const s = SIDES[sd];
  const leg = { ...(pose['leg' + sd] || {}) };
  const B = poseLegs(pose);
  const th = B['thigh_' + sd], sh = B['shin_' + sd], ft = B['foot_' + sd];
  const inv = B.hips.matrixWorld.clone().invert();
  const t = target.clone().applyMatrix4(inv).sub(th.position).applyQuaternion(th.userData.restQ.clone().invert());
  const v1 = sh.userData.restP.clone();
  const v2 = ft.userData.restP.clone().applyQuaternion(sh.userData.restQ);
  const a = X.clone().applyQuaternion(sh.userData.restQ);
  const knee = Math.max(0, hingeFor(Math.min(t.length(), v1.length() + v2.length() - 1e-5), v1, v2, a));
  const u = v1.clone().add(v2.clone().applyAxisAngle(a, knee));
  const twist = localQuat(new THREE.Quaternion(), [0, (leg.hip || [0, 0, 0])[1], 0], 'limb', s, 'XZY');
  const q = new THREE.Quaternion().setFromUnitVectors(u.clone().applyQuaternion(twist).normalize(), t.clone().normalize()).multiply(twist);
  leg.hip = semantic(q, 'limb', s, 'XZY');
  leg.knee = knee;
  // the foot as at rest: foot world = shinW * restQ_foot * qf = the rest chain's product
  const B2 = poseLegs({ ...pose, ['leg' + sd]: { ...leg, ankle: [0, 0, 0], toe: 0 } });
  const shinW = B2['shin_' + sd].getWorldQuaternion(new THREE.Quaternion());
  const restW = B2.hips.userData.restQ.clone().multiply(B2['thigh_' + sd].userData.restQ)
    .multiply(B2['shin_' + sd].userData.restQ).multiply(B2['foot_' + sd].userData.restQ);
  const qf = shinW.multiply(B2['foot_' + sd].userData.restQ).invert().multiply(restW);
  leg.ankle = semantic(qf, 'limb', s, 'ZXY');
  leg.toe = toe;
  return leg;
}

// ---------------------------------------------------------------- gait curves
const DEG = Math.PI / 180;
// a smooth periodic curve through [phase, value] keys (non-uniform Catmull-Rom; phase in cycles; keys from phase 0)
function cyc(keys, p) {
  p -= Math.floor(p);
  const n = keys.length;
  let i = 0;
  for (let k = 0; k < n; k++) if (keys[k][0] <= p) i = k;
  const T = (j) => keys[((j % n) + n) % n][0] + Math.floor(j / n);
  const Vv = (j) => keys[((j % n) + n) % n][1];
  const t0 = T(i - 1), t1 = T(i), t2 = T(i + 1), t3 = T(i + 2);
  const v0 = Vv(i - 1), v1 = Vv(i), v2 = Vv(i + 1), v3 = Vv(i + 2);
  const m1 = ((v2 - v1) / (t2 - t1) * (t1 - t0) + (v1 - v0) / (t1 - t0) * (t2 - t1)) / (t2 - t0);
  const m2 = ((v3 - v2) / (t3 - t2) * (t2 - t1) + (v2 - v1) / (t2 - t1) * (t3 - t2)) / (t3 - t1);
  const h = t2 - t1, u = (p - t1) / h, u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * v1 + (u3 - 2 * u2 + u) * h * m1 + (-2 * u3 + 3 * u2) * v2 + (u3 - u2) * h * m2;
}
const C = (p) => Math.cos(2 * Math.PI * p);
const S = (p) => Math.sin(2 * Math.PI * p);

const WALK_KEYS = { // degrees over the leg's own cycle (0 = its heel strike; toe-off at 0.62)
  hip: [[0, 27], [0.12, 23], [0.3, 6], [0.5, -12], [0.6, -6], [0.72, 14], [0.86, 30], [0.95, 29]],
  knee: [[0, 4], [0.13, 17], [0.3, 7], [0.42, 6], [0.53, 24], [0.62, 42], [0.72, 62], [0.82, 44], [0.92, 12]],
  ankle: [[0, 0], [0.07, -6], [0.25, 4], [0.41, 9], [0.49, 1], [0.57, -11], [0.63, -16], [0.71, -6], [0.8, 1], [0.9, 2]],
  toe: [[0, 0], [0.4, 0], [0.5, 14], [0.58, 24], [0.65, 8], [0.73, 0]],
};

function walkAngles(phase, o = {}) {
  const leg = (p) => ({
    hip: [cyc(WALK_KEYS.hip, p) * DEG, 0.22, -0.075 + 0.02 * C(p - 0.25)],
    knee: cyc(WALK_KEYS.knee, p) * DEG,
    ankle: [cyc(WALK_KEYS.ankle, p) * DEG, 0, 0.02],
    toe: Math.max(0, cyc(WALK_KEYS.toe, p)) * DEG,
  });
  const g = o.arms ?? 1;
  const arm = (p) => { // p: the arm's phase (in step with the other side's leg)
    const fwd = 0.5 + 0.5 * C(p);
    return { shoulder: [(-0.06 + 0.42 * fwd) * g, 0.08, 0.07], elbow: (0.18 + 0.32 * fwd) * g, wrist: [0.12, 0.05, 0], fingers: 0.32, thumb: 0.2, spread: -0.1 };
  };
  return {
    root: { pos: [0, 0, 0], rot: [0.035, -0.07 * C(phase), -0.05 * S(phase)] },
    spine: [0.02, 0.04 * C(phase), 0.03 * S(phase)],
    chest: [0.01, 0.05 * C(phase), 0.02 * S(phase)],
    neck: [-0.02, -0.02 * C(phase), 0],
    head: [-0.03, -0.015 * C(phase), 0],
    legL: leg(phase), legR: leg(phase + 0.5),
    armL: arm(phase + 0.5), armR: arm(phase),
  };
}

const RUN_KEYS = { // degrees over the leg's cycle (0 = contact; toe-off at 0.34; the other foot lands at 0.5)
  hip: [[0, 30], [0.08, 22], [0.2, 2], [0.3, -14], [0.37, -19], [0.46, -10], [0.58, 16], [0.7, 42], [0.82, 55], [0.9, 52], [0.96, 40]],
  knee: [[0, 24], [0.08, 38], [0.15, 40], [0.26, 26], [0.34, 18], [0.42, 36], [0.52, 74], [0.63, 104], [0.74, 102], [0.84, 84], [0.91, 60], [0.96, 38]],
  ankle: [[0, 4], [0.08, 15], [0.16, 20], [0.26, 6], [0.33, -16], [0.39, -27], [0.5, -16], [0.62, 0], [0.76, 10], [0.9, 10]],
  toe: [[0, 0], [0.2, 0], [0.28, 18], [0.34, 28], [0.4, 10], [0.48, 0]],
};

const RUN_OFF = 0.34; // toe-off
const RUN_LEAN = 0.13; // the pelvis pitched forward (the body leans from the ankles)

function runAngles(phase) {
  const leg = (p) => ({
    hip: [cyc(RUN_KEYS.hip, p) * DEG + RUN_LEAN - 0.08, 0.26, -0.11 + 0.03 * C(p - 0.2)], // (the keys are for a pelvis pitched 0.08)
    knee: cyc(RUN_KEYS.knee, p) * DEG,
    ankle: [cyc(RUN_KEYS.ankle, p) * DEG, 0, 0.03],
    toe: Math.max(0, cyc(RUN_KEYS.toe, p)) * DEG,
  });
  const arm = (p) => { // forward when the other side's leg is forward
    const fwd = 0.5 + 0.5 * C(p - 0.05);
    return { shoulder: [-0.66 + 1.12 * fwd, 0.16 + 0.14 * fwd, 0.3 - 0.2 * fwd], elbow: 1.42 + 0.14 * fwd, wrist: [0.12, 0.25, 0.05], fingers: 0.62, thumb: 0.55, spread: -0.2 };
  };
  return {
    root: { pos: [0, 0, 0], rot: [RUN_LEAN, -0.11 * C(phase), -0.06 * S(phase)] },
    spine: [0.05, 0.07 * C(phase), 0.03 * S(phase)],
    chest: [0.04, 0.1 * C(phase), 0.02 * S(phase)],
    neck: [-0.11, -0.06 * C(phase), 0],
    head: [-0.1, -0.05 * C(phase), 0],
    legL: leg(phase), legR: leg(phase + 0.5),
    armL: arm(phase + 0.5), armR: arm(phase),
  };
}

// Per gait, tables over the cycle (built once, deterministically): the hips' height that keeps the lower sole on the
// floor (in flight, a smooth arc), and the fore-aft offset that holds the stance foot still while the holder moves at
// constant speed.
const GAITS = {};
const N = 240;
function table(name) {
  if (GAITS[name]) return GAITS[name];
  const ang = name === 'walk' ? walkAngles : runAngles;
  const sol = [];
  for (let i = 0; i < N; i++) sol.push(soles(ang(i / N)));
  const smax = (a, b, k) => Math.max(a, b) + k * Math.log1p(Math.exp(-Math.abs(a - b) / k));
  const yy = sol.map((q) => smax(-q.L.minY, -q.R.minY, 0.0015));
  let w; // stance weights (left, right)
  if (name === 'walk') {
    // the lower foot carries the weight, but never one still in its swing (a heel coming down only grazes)
    const swing = (p) => { p -= Math.floor(p); return p > 0.64 && p < 0.995; };
    w = sol.map((q, i) => {
      const ph = i / N;
      let l = 1 / (1 + Math.exp((q.L.minY - q.R.minY) / 0.003));
      if (swing(ph)) l = 0;
      if (swing(ph + 0.5)) l = 1;
      return [l, 1 - l];
    });
  } else {
    // stance: the left foot 0 .. 0.34, the right 0.5 .. 0.84; in flight the hips follow a smooth arc
    const win = (p, a, b) => (p >= a - 1e-9 && p <= b + 1e-9 ? 1 : 0);
    w = sol.map((q, i) => [win(i / N, 0, RUN_OFF), win(i / N, 0.5, 0.5 + RUN_OFF)]);
    const arc = (a, b) => { // Hermite from take-off (a) to landing (b), with the stance curves' slopes
      const ia = Math.round(a * N), ib = Math.round(b * N);
      const y0 = yy[ia % N], y1 = yy[ib % N];
      const m0 = (yy[ia % N] - yy[(ia - 2 + N) % N]) / 2, m1 = (yy[(ib + 2) % N] - yy[ib % N]) / 2;
      const n = ib - ia;
      for (let k = 1; k < n; k++) {
        const u = k / n, u2 = u * u, u3 = u2 * u;
        const h = (2 * u3 - 3 * u2 + 1) * y0 + (u3 - 2 * u2 + u) * m0 * n + (-2 * u3 + 3 * u2) * y1 + (u3 - u2) * m1 * n;
        const j = (ia + k) % N;
        yy[j] = Math.max(h, -sol[j].L.minY + 0.004, -sol[j].R.minY + 0.004);
      }
    };
    arc(RUN_OFF, 0.5);
    arc(0.5 + RUN_OFF, 1.0);
  }
  // fore-aft: the stance foot's contact must not move: dz_root = -(w . dz_contact) - (the holder's advance)
  // (each pivot's own velocity, weighted: a blend of fixed points of the foot, not a point sliding along it)
  const dz = sol.map((q, i) => {
    const n = sol[(i + 1) % N], p = sol[(i - 1 + N) % N];
    return ['L', 'R'].map((sd) => q[sd].w.reduce((a, wk, k) => a + wk * (n[sd].piv[k][2] - p[sd].piv[k][2]) / 2, 0));
  });
  let num = 0, den = 0;
  for (let i = 0; i < N; i++) { num -= w[i][0] * dz[i][0] + w[i][1] * dz[i][1]; den += w[i][0] + w[i][1]; }
  const adv = num / den; // the holder's advance per sample
  const zz = [0];
  for (let i = 1; i < N; i++) {
    const j = i - 1, wj = w[j][0] + w[j][1];
    zz.push(zz[j] + (wj > 0 ? -(w[j][0] * dz[j][0] + w[j][1] * dz[j][1]) / wj - adv : 0));
  }
  const mz = zz.reduce((a, b) => a + b, 0) / N;
  GAITS[name] = { y: yy, z: zz.map((v) => v - mz), stride: adv * N };
  return GAITS[name];
}

function lookup(arr, p) {
  p -= Math.floor(p);
  const f = p * N, i = Math.floor(f), u = f - i;
  return arr[i % N] * (1 - u) + arr[(i + 1) % N] * u;
}

// Gait facts: stride (metres the holder moves per cycle), cycle (seconds per cycle at a natural cadence) and speed
// (m/s). To travel: holder.position.z += speed * t (along the holder's facing) and phase = t / cycle.
export function gait(name) {
  const t = table(name);
  const cycle = name === 'walk' ? 1.08 : 0.68;
  return { stride: t.stride, cycle, speed: t.stride / cycle };
}

export function walkPose(phase, opts = {}) {
  const p = walkAngles(phase, opts);
  const t = table('walk');
  p.root.pos = [0.018 * S(phase), lookup(t.y, phase), lookup(t.z, phase)];
  return p;
}

export function runPose(phase) {
  const p = runAngles(phase);
  const t = table('run');
  p.root.pos = [0.02 * S(phase), lookup(t.y, phase), lookup(t.z, phase)];
  return p;
}

// Standing at ease: breathing (a 4.3 s cycle), a slow shift of weight from foot to foot (11 s) and the head drifting
// a little; the feet stay planted (leg IK) and the knee softens on the unweighted side.
export function idlePose(t) {
  const b = S(t / 4.3), w = S(t / 11 + 0.15), h = S(t / 13 + 0.4), h2 = S(t / 7.7 + 1.1), r = S(t / 17);
  const arm = (k) => ({ shoulder: [0.02 + 0.006 * b, 0.02, 0.035 + 0.008 * b], elbow: 0.12 + 0.02 * k * h, wrist: [0.06, 0, 0],
    fingers: 0.22, thumb: 0.15, clavicle: [0, 0, 0.01 * b] });
  const pose = {
    root: { pos: [0.012 * w, -0.008 - 0.004 * Math.abs(w), 0.002 * b], rot: [0.012 + 0.004 * b, 0.015 * r, -0.012 * w] },
    spine: [0.01 - 0.004 * b, -0.008 * r, 0.008 * w],
    chest: [-0.008 * b, -0.006 * r, 0.006 * w],
    neck: [0.03 + 0.01 * h2, 0.035 * h, 0],
    head: [0.03 + 0.012 * b, 0.05 * h, 0.012 * h2],
    armL: arm(1), armR: arm(-1),
  };
  pose.legL = legIK(pose, 'L');
  pose.legR = legIK(pose, 'R');
  return pose;
}
