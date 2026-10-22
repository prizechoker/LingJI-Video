// The realistic right hand (MakeHuman CC0 mesh, rigged by blender/build_hand.py) and its poses.
// Model space: wrist at the origin, fingers along -Z, palm facing -Y. Each finger bone flexes about its
// local X axis (positive = toward the palm); the first segment can also spread about its local Z.
import { THREE } from './core.js';
import { skinMaterial } from './materials.js';

const FINGERS = ['thumb', 'index', 'middle', 'ring', 'little'];

export async function loadHand(studio, { url = '../assets/models/hand_mh_r.glb', material } = {}) {
  const g = await studio.gltf.loadAsync(url);
  let mesh = null;
  g.scene.traverse((o) => { if (o.isSkinnedMesh) mesh = o; });
  // vertex colour R = fingernail mask, G = baked ambient occlusion -> own attributes, so they don't tint the skin
  const col = mesh.geometry.getAttribute('color');
  const n = mesh.geometry.getAttribute('position').count;
  const nail = new Float32Array(n), ao = new Float32Array(n).fill(1);
  if (col) for (let i = 0; i < n; i++) { nail[i] = col.getX(i); ao[i] = col.getY(i); }
  mesh.geometry.setAttribute('nailMask', new THREE.BufferAttribute(nail, 1));
  mesh.geometry.setAttribute('skinAO', new THREE.BufferAttribute(ao, 1)); // baked by blender/build_hand.py
  mesh.geometry.deleteAttribute('color');
  mesh.material = material || skinMaterial();
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  const bones = {};
  for (const b of mesh.skeleton.bones) bones[b.name] = b;
  const rest = {};
  for (const [k, b] of Object.entries(bones)) rest[k] = b.quaternion.clone();
  const holder = new THREE.Group();
  holder.add(g.scene);
  return { holder, mesh, bones, rest };
}

const _q = new THREE.Quaternion(), _qs = new THREE.Quaternion();
const AX = new THREE.Vector3(1, 0, 0), AZ = new THREE.Vector3(0, 0, 1), AY = new THREE.Vector3(0, 1, 0);

// pose: { index: [mcp, pip, dip], ..., spread: {index: a, ...}, thumb: [cmc, mcp, ip], thumbRoll, thumbSpread }
export function setPose(h, pose) {
  for (let f = 0; f < 5; f++) {
    const name = FINGERS[f];
    const a = pose[name] || [0, 0, 0];
    for (let s = 0; s < 3; s++) {
      const b = h.bones[`f${f + 1}_${s + 1}`];
      if (!b) continue;
      b.quaternion.copy(h.rest[b.name]);
      if (s === 0) {
        const sp = (pose.spread && pose.spread[name]) || 0;
        if (sp) b.quaternion.multiply(_qs.setFromAxisAngle(AZ, sp));
        if (f === 0 && pose.thumbRoll) b.quaternion.multiply(_qs.setFromAxisAngle(AY, pose.thumbRoll));
      }
      b.quaternion.multiply(_q.setFromAxisAngle(AX, a[s] || 0));
    }
  }
  if (pose.wrist) {
    const b = h.bones.hand;
    b.quaternion.copy(h.rest.hand).multiply(_q.setFromAxisAngle(AX, pose.wrist[0] || 0)).multiply(_qs.setFromAxisAngle(AZ, pose.wrist[1] || 0));
  }
}

export function mixPose(a, b, t) {
  const out = { spread: {} };
  for (const k of FINGERS) out[k] = [0, 1, 2].map((i) => ((a[k] || [])[i] || 0) * (1 - t) + ((b[k] || [])[i] || 0) * t);
  for (const k of FINGERS) out.spread[k] = ((a.spread || {})[k] || 0) * (1 - t) + ((b.spread || {})[k] || 0) * t;
  out.thumbRoll = (a.thumbRoll || 0) * (1 - t) + (b.thumbRoll || 0) * t;
  out.wrist = [0, 1].map((i) => ((a.wrist || [])[i] || 0) * (1 - t) + ((b.wrist || [])[i] || 0) * t);
  return out;
}

// world position of a bone tip / joint (after posing)
export function jointWorld(h, bone, tail = false) {
  h.holder.updateMatrixWorld(true);
  const b = h.bones[bone];
  const v = new THREE.Vector3();
  if (!tail) return b.getWorldPosition(v);
  const child = b.children.find((c) => c.isBone);
  if (child) return child.getWorldPosition(v);
  return b.localToWorld(v.set(0, 0.022, 0));
}

export const POSES = {
  rest: {},
  relaxed: { index: [0.2, 0.3, 0.15], middle: [0.22, 0.35, 0.18], ring: [0.28, 0.42, 0.2], little: [0.32, 0.45, 0.22], thumb: [0.05, 0.1, 0.1] },
};
