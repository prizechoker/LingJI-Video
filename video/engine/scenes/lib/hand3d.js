// Posable 3D hand (MIT-licensed WebXR generic hand) rendered as warm light on a dark body.
import { THREE, three } from '../../core/three.js';

const FINGERS = ['index', 'middle', 'ring', 'pinky'];
const SEG = ['phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal'];

export const POSE = {
  rest: { index: [0, 0, 0], middle: [0, 0, 0], ring: [0, 0, 0], pinky: [0, 0, 0], thumb: [0, 0, 0], spread: [0, 0, 0, 0] },
  // go grip: index + middle extended and slightly curved, ring/pinky tucked
  pinch: { index: [0.22, 0.32, 0.18], middle: [0.3, 0.38, 0.2], ring: [1.05, 1.35, 0.7], pinky: [1.1, 1.3, 0.7], thumb: [0.25, 0.3, 0.2], spread: [0.06, 0.0, -0.05, -0.1] },
  relaxed: { index: [0.25, 0.35, 0.2], middle: [0.3, 0.42, 0.22], ring: [0.38, 0.5, 0.26], pinky: [0.45, 0.55, 0.3], thumb: [0.15, 0.2, 0.15], spread: [0.04, 0, -0.04, -0.08] },
  open: { index: [0.02, 0.04, 0.02], middle: [0.02, 0.04, 0.02], ring: [0.02, 0.04, 0.02], pinky: [0.02, 0.04, 0.02], thumb: [-0.1, 0, 0], spread: [0.14, 0.02, -0.12, -0.24] },
  cup: { index: [0.55, 0.65, 0.35], middle: [0.6, 0.7, 0.38], ring: [0.62, 0.72, 0.4], pinky: [0.65, 0.75, 0.42], thumb: [0.45, 0.35, 0.25], spread: [0.05, 0, -0.05, -0.1] },
  grab: { index: [0.9, 1.1, 0.6], middle: [0.95, 1.15, 0.6], ring: [1.0, 1.2, 0.6], pinky: [1.05, 1.2, 0.6], thumb: [0.7, 0.5, 0.4], spread: [0.02, 0, -0.02, -0.05] },
};

export function mixPose(a, b, t) {
  const r = {};
  for (const k of Object.keys(a)) r[k] = a[k].map((v, i) => v + (b[k][i] - v) * t);
  return r;
}

function handMaterial(o = {}) {
  const u = {
    rimColor: { value: new THREE.Color(o.rim ?? 0xffb36b) },
    rimPower: { value: o.rimPower ?? 2.8 },
    rimStrength: { value: o.rimStrength ?? 2.4 },
    fadeA: { value: o.fadeA ?? 0.012 },
    fadeB: { value: o.fadeB ?? 0.05 },
    opacity2: { value: 1 },
  };
  const m = new THREE.MeshStandardMaterial({ color: o.base ?? 0x140d08, roughness: 0.6, metalness: 0, transparent: true });
  m.userData.u = u;
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRest;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = position;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRest; uniform vec3 rimColor; uniform float rimPower, rimStrength, fadeA, fadeB, opacity2;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec3 Vv = normalize(vViewPosition);
          float fr = pow(1.0 - clamp(abs(dot(normal, Vv)), 0.0, 1.0), rimPower);
          totalEmissiveRadiance += rimColor * fr * rimStrength;
        }`,
      )
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n gl_FragColor.a *= opacity2 * (1.0 - smoothstep(fadeA, fadeB, vRest.y));');
  };
  return m;
}

export function createHand(opts = {}) {
  const root = three().cloneHand();
  const mat = handMaterial(opts);
  const bones = {};
  root.traverse((o) => {
    if (o.isMesh || o.isSkinnedMesh) { o.material = mat; o.frustumCulled = false; }
    if (o.isBone) bones[o.name] = o;
  });
  const rest = {};
  for (const [n, b] of Object.entries(bones)) rest[n] = b.quaternion.clone();
  const holder = new THREE.Group();
  holder.add(root);
  // wrist bone sits at the origin of the holder
  const w = new THREE.Vector3().setFromMatrixPosition(bones.wrist.matrixWorld);
  root.updateMatrixWorld(true);
  const wp = new THREE.Vector3();
  bones.wrist.getWorldPosition(wp);
  root.position.sub(wp);
  return { holder, root, bones, rest, mat, u: mat.userData.u };
}

const AX = new THREE.Vector3(1, 0, 0);
const AY = new THREE.Vector3(0, 1, 0);
const CHAINS = {
  index: ['index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip'],
  middle: ['middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip'],
  ring: ['ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip'],
  pinky: ['pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip'],
  thumb: ['wrist', 'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'],
};
const _m = new THREE.Matrix4(), _r = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();

// The model's joints are flat siblings (WebXR style), so we run forward kinematics ourselves:
// T'_j = T'_{j-1} * rel_j * R_j(flex, spread), with rel_j taken from the rest pose.
function restRel(h) {
  if (h.rel) return h.rel;
  h.rel = {};
  h.restM = {};
  for (const [n, b] of Object.entries(h.bones)) h.restM[n] = new THREE.Matrix4().compose(b.position.clone(), b.quaternion.clone(), b.scale.clone());
  for (const chain of Object.values(CHAINS)) {
    for (let j = 1; j < chain.length; j++) {
      h.rel[chain[j]] = new THREE.Matrix4().copy(h.restM[chain[j - 1]]).invert().multiply(h.restM[chain[j]]);
    }
  }
  return h.rel;
}

// flexion sign: positive curls fingers toward the palm
export function setPose(h, pose, flexSign = FLEX_SIGN) {
  const rel = restRel(h);
  for (const [f, chain] of Object.entries(CHAINS)) {
    const angles = pose[f] || [0, 0, 0];
    const fi = ['index', 'middle', 'ring', 'pinky'].indexOf(f);
    let T = new THREE.Matrix4().copy(h.restM[chain[0]]);
    // thumb chain starts at the wrist: joint 1 (metacarpal) gets the first angle
    const first = f === 'thumb' ? 1 : 1;
    for (let j = 1; j < chain.length; j++) {
      T = T.clone().multiply(rel[chain[j]]);
      const k = j - first; // 0..2 rotate, tip (k=3) none
      if (k >= 0 && k < 3) {
        const axis = f === 'thumb' ? THUMB_AXIS : AX;
        _r.makeRotationAxis(axis, flexSign * (f === 'thumb' ? THUMB_SIGN : 1) * angles[k]);
        T.multiply(_r);
        if (k === 0 && fi >= 0 && pose.spread) {
          _r.makeRotationAxis(AY, pose.spread[fi]);
          T.multiply(_r);
        }
      }
      const b = h.bones[chain[j]];
      T.decompose(b.position, b.quaternion, _s);
    }
  }
}
export let FLEX_SIGN = -1;
export let THUMB_SIGN = 1;
export const THUMB_AXIS = new THREE.Vector3(1, 0, 0);
export function setSigns(f, t) { FLEX_SIGN = f; THUMB_SIGN = t; }

// Orient: rest pose has fingers along -Y and palm facing -X (in model space).
// dir = where the fingers point, palm = where the palm faces (world vectors).
export function orient(h, pos, dir, palm) {
  const d = dir.clone().normalize();
  const n = palm.clone().sub(d.clone().multiplyScalar(palm.dot(d))).normalize();
  const xAxis = n.clone().negate(); // model +X -> -palm
  const yAxis = d.clone().negate(); // model +Y -> -dir
  const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis);
  const m = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
  h.holder.quaternion.setFromRotationMatrix(m);
  h.holder.position.copy(pos);
}

export function tipWorld(h, name) {
  const v = new THREE.Vector3();
  h.holder.updateMatrixWorld(true);
  h.bones[name].getWorldPosition(v);
  return v;
}
