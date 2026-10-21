// A generic humanoid robot built from primitives, rim-lit in cool light, with simple procedural motions.
import { THREE, propMaterial, edges } from '../../core/three.js';

let EDGE_COLOR = 0x9fd6ff;
function part(geo, mat, edgeOp = 0.42) {
  const m = new THREE.Mesh(geo, mat);
  if (edgeOp > 0) edges(m, EDGE_COLOR, edgeOp, 30);
  return m;
}
const rbox = (w, h, d, r = 0.02) => {
  // rounded-ish box via capsule-like bevel: use BoxGeometry with segments, then spherify corners slightly
  const g = new THREE.BoxGeometry(w, h, d, 2, 2, 2);
  return g;
};

export function createRobot(opts = {}) {
  EDGE_COLOR = opts.human ? 0xffc890 : 0x9fd6ff;
  const mat = propMaterial({ base: opts.base ?? 0x05080c, rim: opts.rim ?? 0x86ccff, rimPower: opts.human ? 2.6 : 3.8, rimStrength: opts.rimStrength ?? 1.4 });
  const dark = propMaterial({ base: 0x020305, rim: opts.rim ?? 0x86ccff, rimPower: 4.0, rimStrength: 0.9 });
  const J = {};
  const root = new THREE.Group(); // at pelvis
  J.root = root;
  const H = !!opts.human;
  const eo = H ? 0 : 0.42; // humans: smooth silhouettes, no technical edges
  const pelvis = H ? part(new THREE.SphereGeometry(0.16, 24, 16), mat, 0) : part(rbox(0.32, 0.14, 0.2), mat);
  if (H) pelvis.scale.set(1.05, 0.62, 0.68);
  root.add(pelvis);
  // spine/torso
  const spine = new THREE.Group();
  spine.position.y = 0.06;
  root.add(spine);
  J.spine = spine;
  let torso;
  if (H) {
    // tapered torso: waist -> ribcage -> shoulders, flattened front-to-back
    const prof = [[0.0, 0.0], [0.13, 0.0], [0.14, 0.08], [0.16, 0.2], [0.185, 0.33], [0.19, 0.42], [0.16, 0.48], [0.06, 0.52], [0.0, 0.52]];
    torso = part(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 40), mat, 0);
    torso.scale.set(1.0, 1.0, 0.62);
    torso.position.y = 0.0;
  } else {
    torso = part(rbox(0.4, 0.48, 0.24), mat);
    torso.position.y = 0.25;
  }
  spine.add(torso);
  if (H) {
    const nk = part(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 20), mat, 0);
    nk.position.y = 0.55;
    spine.add(nk);
  }
  if (!opts.human) {
    const chest = part(rbox(0.26, 0.16, 0.03), dark, 0.2);
    chest.position.set(0, 0.32, 0.105);
    spine.add(chest);
  }
  if (!opts.human) {
    const pack = part(rbox(0.28, 0.3, 0.07), dark, 0.25);
    pack.position.set(0, 0.27, -0.15);
    spine.add(pack);
  }
  const neck = new THREE.Group();
  neck.position.y = 0.5;
  spine.add(neck);
  J.neck = neck;
  const head = part(new THREE.SphereGeometry(H ? 0.095 : 0.105, 28, 20), mat, 0.0);
  head.scale.set(H ? 0.9 : 1, H ? 1.18 : 1.08, H ? 1.0 : 1.05);
  head.position.y = 0.12;
  neck.add(head);
  if (!opts.human) {
    const visor = part(new THREE.SphereGeometry(0.1, 24, 12, -1.0, 2.0, 1.1, 0.6), dark, 0);
    visor.position.set(0, 0.125, 0.012);
    neck.add(visor);
  } else if (opts.headset) {
    const hs = part(rbox(0.19, 0.09, 0.12), dark, 0.4);
    hs.position.set(0, 0.13, 0.07);
    neck.add(hs);
  }
  // limbs
  const limb = (len, r) => {
    const g = new THREE.CapsuleGeometry(r, len - 2 * r, 6, 14);
    g.translate(0, -len / 2, 0);
    return g;
  };
  for (const side of [-1, 1]) {
    const s = side < 0 ? 'L' : 'R';
    // arm
    const sh = new THREE.Group();
    sh.position.set(side * (H ? 0.2 : 0.25), H ? 0.46 : 0.45, 0);
    spine.add(sh);
    J['shoulder' + s] = sh;
    const shBall = part(new THREE.SphereGeometry(H ? 0.06 : 0.07, 16, 12), mat, 0);
    sh.add(shBall);
    sh.add(part(limb(0.29, H ? 0.046 : 0.058), mat, H ? 0 : 0.18));
    const el = new THREE.Group();
    el.position.y = -0.29;
    sh.add(el);
    J['elbow' + s] = el;
    if (!opts.human) {
      const elDisc = part(new THREE.CylinderGeometry(0.062, 0.062, 0.07, 20), mat, 0.25);
      elDisc.rotation.z = Math.PI / 2;
      el.add(elDisc);
    }
    el.add(part(limb(0.27, H ? 0.038 : 0.05), mat, H ? 0 : 0.18));
    const hand = H ? part(new THREE.CapsuleGeometry(0.03, 0.06, 6, 12), mat, 0) : part(rbox(0.07, 0.11, 0.04), mat, 0.2);
    hand.position.y = -0.31;
    el.add(hand);
    J['hand' + s] = hand;
    // leg
    const hip = new THREE.Group();
    hip.position.set(side * 0.1, -0.04, 0);
    root.add(hip);
    J['hip' + s] = hip;
    hip.add(part(limb(0.42, H ? 0.07 : 0.08), mat, H ? 0 : 0.18));
    const kn = new THREE.Group();
    kn.position.y = -0.42;
    hip.add(kn);
    J['knee' + s] = kn;
    if (!opts.human) {
      const knDisc = part(new THREE.CylinderGeometry(0.085, 0.085, 0.1, 20), mat, 0.25);
      knDisc.rotation.z = Math.PI / 2;
      kn.add(knDisc);
      const hipDisc = part(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 20), mat, 0.25);
      hipDisc.rotation.z = Math.PI / 2;
      hip.add(hipDisc);
    }
    kn.add(part(limb(0.42, H ? 0.052 : 0.065), mat, H ? 0 : 0.18));
    const an = new THREE.Group();
    an.position.y = -0.42;
    kn.add(an);
    J['ankle' + s] = an;
    const foot = H ? part(new THREE.CapsuleGeometry(0.04, 0.16, 6, 12), mat, 0) : part(rbox(0.11, 0.06, 0.24), mat, 0.2);
    if (H) foot.rotation.x = Math.PI / 2;
    foot.position.set(0, -0.03, 0.05);
    an.add(foot);
  }
  root.position.y = 0.92;
  const holder = new THREE.Group();
  holder.add(root);
  return { root, holder, J, mat };
}

const clampv = (x, a, b) => Math.min(b, Math.max(a, x));

export function poseStand(R, breathe = 0) {
  const { J } = R;
  for (const k of Object.keys(J)) if (J[k].isGroup && k !== 'root') J[k].rotation.set(0, 0, 0);
  J.shoulderL.rotation.z = -0.08;
  J.shoulderR.rotation.z = 0.08;
  J.elbowL.rotation.x = -0.15;
  J.elbowR.rotation.x = -0.15;
  J.spine.rotation.x = 0.02 * Math.sin(breathe);
  R.root.position.y = 0.92;
  R.root.rotation.set(0, R.root.rotation.y, 0);
}

// running gait, phase in radians; speed scales stride
export function poseRun(R, ph, amp = 1) {
  const { J } = R;
  const s = Math.sin(ph), c = Math.cos(ph);
  J.hipL.rotation.x = -0.75 * amp * s;
  J.hipR.rotation.x = 0.75 * amp * s;
  J.kneeL.rotation.x = 0.25 + 1.1 * amp * Math.max(0, Math.sin(ph - 0.9));
  J.kneeR.rotation.x = 0.25 + 1.1 * amp * Math.max(0, Math.sin(ph + Math.PI - 0.9));
  J.ankleL.rotation.x = -0.2 * s;
  J.ankleR.rotation.x = 0.2 * s;
  J.shoulderL.rotation.x = 0.7 * amp * s;
  J.shoulderR.rotation.x = -0.7 * amp * s;
  J.shoulderL.rotation.z = -0.12;
  J.shoulderR.rotation.z = 0.12;
  J.elbowL.rotation.x = -1.2;
  J.elbowR.rotation.x = -1.2;
  J.spine.rotation.x = 0.16;
  R.root.position.y = 0.88 + 0.04 * Math.abs(c);
  R.root.rotation.x = 0;
}

// backflip, u in [0,1]: crouch -> launch -> tucked rotation -> land
export function poseFlip(R, u) {
  const { J } = R;
  const crouch = u < 0.2 ? u / 0.2 : u < 0.3 ? 1 - (u - 0.2) / 0.1 : u > 0.82 ? Math.min(1, (u - 0.82) / 0.08) * (1 - Math.max(0, (u - 0.92) / 0.08)) : 0;
  const air = clampv((u - 0.28) / 0.54, 0, 1);
  const tuck = Math.sin(Math.PI * air);
  const ease = air < 0.5 ? 2 * air * air : 1 - Math.pow(-2 * air + 2, 2) / 2;
  R.root.rotation.x = -Math.PI * 2 * ease;
  R.root.position.y = 0.92 - 0.28 * crouch + 0.55 * Math.sin(Math.PI * air);
  const hipF = 0.9 * crouch + 1.6 * tuck;
  const knF = 1.4 * crouch + 2.0 * tuck;
  for (const s of ['L', 'R']) {
    J['hip' + s].rotation.x = -hipF;
    J['knee' + s].rotation.x = knF;
    J['ankle' + s].rotation.x = -0.4 * crouch;
  }
  // arms swing up for momentum, then hug the knees in the tuck
  const armUp = u < 0.3 ? -0.8 * crouch + (u > 0.2 ? -2.6 * (u - 0.2) / 0.1 : 0) : -2.6 * (1 - tuck) - 0.9 * tuck;
  J.shoulderL.rotation.x = armUp;
  J.shoulderR.rotation.x = armUp;
  J.elbowL.rotation.x = -0.4 - 0.8 * tuck;
  J.elbowR.rotation.x = -0.4 - 0.8 * tuck;
  J.spine.rotation.x = 0.35 * crouch + 0.3 * tuck;
}

// festive dance: arms raised, hip sway, handkerchief hand spin handled by caller
export function poseDance(R, ph) {
  poseStand(R, 0);
  const { J } = R;
  J.shoulderL.rotation.z = -2.4 - 0.18 * Math.sin(ph);
  J.shoulderL.rotation.x = -0.3;
  J.elbowL.rotation.x = -0.35 - 0.25 * Math.sin(ph * 2);
  J.shoulderR.rotation.z = 0.35 + 0.25 * Math.sin(ph + 1.2);
  J.shoulderR.rotation.x = -0.45;
  J.elbowR.rotation.x = -1.1 + 0.25 * Math.sin(ph * 2);
  J.spine.rotation.z = 0.08 * Math.sin(ph);
  J.hipL.rotation.x = -0.35 * Math.max(0, Math.sin(ph));
  J.kneeL.rotation.x = 0.6 * Math.max(0, Math.sin(ph));
  J.hipR.rotation.x = -0.35 * Math.max(0, -Math.sin(ph));
  J.kneeR.rotation.x = 0.6 * Math.max(0, -Math.sin(ph));
  R.root.position.y = 0.92 - 0.03 * Math.abs(Math.sin(ph));
}
