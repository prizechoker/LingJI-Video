// Household props (warm, human world) and simple robot parts (cool), all rim-lit.
import { THREE, propMaterial } from '../../core/three.js';

export const warmMat = () => propMaterial({ base: 0x0d0805, rim: 0xffb36b, rimPower: 3.4, rimStrength: 1.8 });
export const coolMat = () => propMaterial({ base: 0x070b10, rim: 0x86ccff, rimPower: 3.2, rimStrength: 1.8 });

const lathe = (pts, seg = 56) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

// thin-walled vessel from an outer silhouette (r, y) list: adds an inner wall so rims read correctly
function vessel(outer, wall = 0.004) {
  const inner = [...outer].reverse().map(([r, y]) => [Math.max(0, r - wall), y + wall * 0.6]);
  return lathe([...outer, ...inner]);
}

export const PROFILES = {
  riceBowl: [[0, 0], [0.028, 0], [0.03, 0.006], [0.05, 0.02], [0.06, 0.04], [0.062, 0.052]],
  soupBowl: [[0, 0], [0.04, 0], [0.045, 0.006], [0.085, 0.03], [0.1, 0.05], [0.102, 0.058]],
  deepBowl: [[0, 0], [0.026, 0], [0.03, 0.01], [0.05, 0.05], [0.056, 0.078], [0.057, 0.082]],
  plate: [[0, 0], [0.07, 0], [0.09, 0.006], [0.12, 0.014], [0.122, 0.016]],
  mug: [[0, 0], [0.038, 0], [0.04, 0.004], [0.041, 0.09], [0.041, 0.095]],
};

export function makeVessel(kind, mat) {
  const m = new THREE.Mesh(vessel(PROFILES[kind]), mat);
  if (kind === 'mug') {
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.006, 10, 28, Math.PI * 1.2), mat);
    h.rotation.z = -Math.PI * 0.6;
    h.position.set(0.045, 0.05, 0);
    m.add(h);
  }
  return m;
}

export function chopsticks(mat) {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0035, 0.23, 10), mat);
    c.rotation.z = Math.PI / 2;
    c.position.z = s * 0.006;
    c.rotation.y = s * 0.04;
    g.add(c);
  }
  return g;
}

// Two-finger parallel gripper on a ringed wrist; returns {group, fingers}
export function gripper(mat) {
  const grip = new THREE.Group();
  const palm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.036, 0.03, 32), mat);
  grip.add(palm);
  const fingers = [];
  for (const s of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.06, 6, 12), mat);
    f.position.set(s * 0.028, -0.045, 0);
    grip.add(f);
    fingers.push(f);
  }
  for (const [y, r] of [[0.04, 0.022], [0.07, 0.024], [0.2, 0.026]]) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.012, 32), mat);
    ring.position.y = y;
    grip.add(ring);
  }
  const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.5, 24), mat);
  wrist.position.y = 0.27;
  grip.add(wrist);
  return { group: grip, fingers };
}

// Screen-space bounding box of an object (for perception reticles)
export function screenBox(obj, P) {
  const box = new THREE.Box3().setFromObject(obj);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const s = P(x, y, z);
    x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y); x1 = Math.max(x1, s.x); y1 = Math.max(y1, s.y);
  }
  return { x0, y0, x1, y1 };
}
