// Wrapping the human hand (engine2/hand.js) around an object: each finger curls (its three joints coupled like a real
// finger) until its pad or a knuckle meets the object's surface, given as a signed distance function in world space.
// Call after the holder is posed; the result is a pose for setPose().
import { THREE } from '../../engine2/core.js';
import { setPose } from '../../engine2/hand.js';

const FINGERS = ['thumb', 'index', 'middle', 'ring', 'little'];
const V = () => new THREE.Vector3();

// signed distance helpers (world space)
export const sdf = {
  cylinder: (a, u, r, len = 1e9) => (p) => {
    const d = p.clone().sub(a);
    const h = d.dot(u);
    const radial = d.addScaledVector(u, -h).length() - r;
    const axial = Math.max(-h, h - len);
    return axial > 0 ? Math.hypot(Math.max(radial, 0), axial) : radial;
  },
  sphere: (c, r) => (p) => p.distanceTo(c) - r,
  union: (...fs) => (p) => Math.min(...fs.map((f) => f(p))),
};

// points along a finger (world): its joints and the midpoints between them, and the pad on the tip
function fingerPoints(h, n) {
  const out = [];
  const names = [`f${n}_1`, `f${n}_2`, `f${n}_3`, `f${n}_3_leaf`];
  const P = names.map((k) => {
    const b = h.bones[k] || h.bones[`f${n}_3`].getObjectByName(k);
    return b.getWorldPosition(V());
  });
  for (let i = 1; i < P.length; i++) {
    out.push(P[i - 1].clone().lerp(P[i], 0.5), P[i].clone());
  }
  // the pad, ~1/3 of the way back from the tip, toward the palm
  out.push(P[2].clone().lerp(P[3], 0.65));
  return out;
}

// curl each finger until it touches: thick = finger half-thickness (m); limit = max curl; base = pose to start from
export function wrap(h, f, { base = {}, thick = 0.0085, limit = 1.7, step = 0.02, only = FINGERS, couple = [1, 1.15, 0.7], thumbCouple = [0.6, 0.55, 0.65] } = {}) {
  const pose = JSON.parse(JSON.stringify(base));
  pose.spread = pose.spread || {};
  for (const name of only) {
    const n = FINGERS.indexOf(name) + 1;
    const cpl = name === 'thumb' ? thumbCouple : couple;
    const b0 = (base[name] || [0, 0, 0]).slice();
    let best = b0;
    for (let c = 0; c <= limit; c += step) {
      const tryP = b0.map((v, i) => v + c * cpl[i]);
      pose[name] = tryP;
      setPose(h, pose);
      h.holder.updateMatrixWorld(true);
      const pts = fingerPoints(h, n);
      let m = Infinity;
      for (const p of pts) m = Math.min(m, f(p));
      if (m < thick) break;
      best = tryP;
    }
    pose[name] = best;
  }
  setPose(h, pose);
  return pose;
}
