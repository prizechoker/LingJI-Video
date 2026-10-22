// A six-axis industrial robot arm (original design, ~1.6 m reach) on a steel riser, built from cast-looking parts and
// drawn as instanced meshes so a whole factory of them costs a dozen draw calls. Posed analytically: a planar IK for
// the first three joints (the tool stays in the arm's vertical plane) and a pitch at the wrist.
//
// Arm space: the riser stands on y = 0 at the arm's origin, J1 turns about +y, the arm reaches along local +x.
// Tools: 'torch' (MIG welding torch, nozzle 45 deg below the flange axis) or 'gripper' (a parallel gripper).
import { THREE } from '../../engine2/core.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// kinematics (metres)
export const ARM = {
  j1: 0.68, // J1 (turret) height above the floor
  a1: 0.15, h2: 0.32, // J2 axis from the J1 frame: forward, up
  a2: 0.78, // lower arm, J2 -> J3
  d4: 0.8, a3: 0.12, // J3 -> wrist centre (J5): along the forearm, up
  flange: 0.1, // J5 -> tool flange
};
export const TOOLS = {
  // tip offset from the wrist centre in the J5 frame (x along the flange, y up), and the tip direction relative to it
  torch: { tip: [ARM.flange + 0.12 + 0.2 * Math.SQRT1_2, -0.2 * Math.SQRT1_2], bend: Math.PI / 4 },
  gripper: { tip: [ARM.flange + 0.23, 0], bend: 0 },
};

// ------------------------------------------------------------------------------------------------ materials
export function armMaterials({ paint = 0xd5d9de } = {}) {
  return [
    // 0 satin industrial paint (warm-free light grey), lacquered
    new THREE.MeshPhysicalMaterial({ color: paint, roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.28 }),
    // 1 graphite castings, motor bodies
    new THREE.MeshPhysicalMaterial({ color: 0x2a2d31, roughness: 0.48, metalness: 0.35, clearcoat: 0.2, clearcoatRoughness: 0.4 }),
    // 2 machined steel (flanges, shafts, bolts)
    new THREE.MeshPhysicalMaterial({ color: 0xb9bec4, metalness: 1, roughness: 0.3 }),
    // 3 black rubber / cable sheath
    new THREE.MeshPhysicalMaterial({ color: 0x111214, roughness: 0.72, sheen: 0.3, sheenRoughness: 0.6, sheenColor: new THREE.Color(0x3a3d42) }),
    // 4 copper (torch nozzle tip)
    new THREE.MeshPhysicalMaterial({ color: 0xb87a52, metalness: 1, roughness: 0.32 }),
    // 5 dark riser steel
    new THREE.MeshPhysicalMaterial({ color: 0x3a3f46, roughness: 0.6, metalness: 0.4 }),
  ];
}

// ------------------------------------------------------------------------------------------------ geometry helpers
const flat = (g) => {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  return n;
};
function part(list) {
  // list: [[geometry, materialIndex], ...] -> one geometry with a group per material
  const byMat = new Map();
  for (const [g, m] of list) {
    if (!byMat.has(m)) byMat.set(m, []);
    byMat.get(m).push(flat(g));
  }
  const geos = [], mats = [];
  for (const [m, gs] of [...byMat.entries()].sort((a, b) => a[0] - b[0])) {
    geos.push(gs.length > 1 ? mergeGeometries(gs) : gs[0]);
    mats.push(m);
  }
  const out = mergeGeometries(geos, true);
  out.groups.forEach((gr, i) => { gr.materialIndex = mats[i]; });
  out.computeBoundingSphere();
  return out;
}
const T = (g, x = 0, y = 0, z = 0) => g.translate(x, y, z);
let HI = true; // detail level while building parts
const SEG = (n) => (HI ? n : Math.max(6, Math.round(n / 3)));
// a cylinder along an axis: 'x' | 'y' | 'z'
function cyl(r0, r1, len, axis = 'y', seg = 20, x = 0, y = 0, z = 0) {
  const g = new THREE.CylinderGeometry(r1, r0, len, SEG(seg), 1);
  if (axis === 'x') g.rotateZ(-Math.PI / 2);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  return T(g, x, y, z);
}
// a lathe from [[r, y], ...] about y
const lathe = (prof, seg = 28) => new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), SEG(seg));
// a hub: a short cylinder along z with chamfered edges
function hub(r, w, axis = 'z', x = 0, y = 0, z = 0, ch = 0.012) {
  const g = lathe([[0, -w / 2], [r - ch, -w / 2], [r, -w / 2 + ch], [r, w / 2 - ch], [r - ch, w / 2], [0, w / 2]], 28);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  if (axis === 'x') g.rotateZ(-Math.PI / 2);
  return T(g, x, y, z);
}
const rbox = (w, h, d, r, x = 0, y = 0, z = 0, seg = 2) => T(new RoundedBoxGeometry(w, h, d, HI ? seg : 1, r), x, y, z);
// a link: the tangent hull of two circles (radii r0 at y=0, r1 at y=L) in the xy plane, extruded along z, bevelled
function link(r0, r1, L, w, bevel = 0.018) {
  const s = new THREE.Shape();
  const a = Math.asin((r0 - r1) / L);
  s.absarc(0, 0, r0, Math.PI - a, 2 * Math.PI + a, false);
  s.absarc(0, L, r1, a, Math.PI - a, false);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: w - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: HI ? 2 : 1, curveSegments: HI ? 18 : 7 });
  g.translate(0, 0, -(w - 2 * bevel) / 2);
  return g;
}
function boltCircle(n, R, y, r = 0.009, h = 0.008, axis = 'y') {
  const out = [];
  if (!HI) return out;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const g = new THREE.CylinderGeometry(r, r, h, 6);
    if (axis === 'y') out.push(T(g, Math.cos(a) * R, y, Math.sin(a) * R));
    if (axis === 'z') { g.rotateX(Math.PI / 2); out.push(T(g, Math.cos(a) * R, Math.sin(a) * R, y)); }
    if (axis === 'x') { g.rotateZ(Math.PI / 2); out.push(T(g, y, Math.cos(a) * R, Math.sin(a) * R)); }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ the parts
function buildParts(hi = true) {
  HI = hi;
  const P = {};
  // riser + base plate (static), dark steel; the arm's fixed base casting on top (paint)
  P.riser = part([
    [rbox(0.72, 0.035, 0.72, 0.01, 0, 0.0175, 0), 5],
    [rbox(0.4, 0.42, 0.4, 0.02, 0, 0.245, 0), 5],
    [rbox(0.56, 0.03, 0.56, 0.008, 0, 0.47, 0), 5],
    ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, b]) => [cyl(0.018, 0.018, 0.016, 'y', 6, a * 0.31, 0.043, b * 0.31), 2]),
    ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, b]) => [cyl(0.014, 0.014, 0.014, 'y', 6, a * 0.24, 0.492, b * 0.24), 2]),
    [lathe([[0.25, 0.485], [0.262, 0.495], [0.262, 0.53], [0.25, 0.545], [0.232, 0.56], [0.226, 0.64], [0.235, 0.655], [0.235, 0.678], [0, 0.678]]), 0],
    ...boltCircle(12, 0.245, 0.55, 0.008, 0.012).map((g) => [g, 2]),
  ]);
  // turret (J1): a carousel ring, the shoulder casting, the J2 motor on its side, the J1 motor at the back
  P.turret = part([
    [lathe([[0.232, 0.0], [0.232, 0.04], [0.222, 0.05], [0.2, 0.06], [0, 0.06]]), 1],
    [rbox(0.44, 0.3, 0.36, 0.07, 0.03, 0.2, 0, 3), 0],
    [hub(0.17, 0.4, 'z', ARM.a1, ARM.h2, 0, 0.02), 0],
    [hub(0.1, 0.06, 'z', ARM.a1, ARM.h2, 0.215, 0.01), 2],
    [cyl(0.085, 0.085, 0.2, 'z', 36, ARM.a1, ARM.h2, -0.3), 1],
    [hub(0.088, 0.03, 'z', ARM.a1, ARM.h2, -0.41, 0.008), 0],
    [cyl(0.06, 0.06, 0.18, 'y', 32, -0.17, 0.22, 0.09), 1],
    [hub(0.062, 0.025, 'y', -0.17, 0.32, 0.09, 0.006), 0],
    [rbox(0.12, 0.08, 0.1, 0.02, -0.2, 0.1, -0.1), 1],
  ]);
  // lower arm (J2 -> J3) along +y, with a cable conduit down its back
  const la = link(0.17, 0.125, ARM.a2, 0.24, 0.022);
  P.lower = part([
    [la, 0],
    [hub(0.12, 0.27, 'z', 0, 0, 0, 0.012), 2],
    [hub(0.095, 0.26, 'z', 0, ARM.a2, 0, 0.012), 2],
    [rbox(0.05, 0.42, 0.12, 0.02, -0.14, 0.38, 0), 1],
    [new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[-0.2, 0.05, -0.08], [-0.17, 0.3, -0.13], [-0.14, 0.62, -0.13], [-0.1, ARM.a2 + 0.05, -0.12]].map((p) => new THREE.Vector3(...p))), SEG(24), 0.022, SEG(10)), 3],
  ]);
  // elbow (J3): hub, the rear housing with the three wrist motors; the forearm starts here
  P.elbow = part([
    [hub(0.135, 0.28, 'z', 0, 0, 0, 0.015), 0],
    [rbox(0.38, 0.27, 0.26, 0.06, 0.0, ARM.a3 * 0.6, 0, 3), 0],
    [cyl(0.105, 0.095, 0.08, 'x', 40, 0.2, ARM.a3, 0), 0],
    ...[-0.06, 0, 0.06].map((z, k) => [cyl(0.034, 0.034, 0.13, 'x', 24, -0.24, ARM.a3 + (k === 1 ? 0.05 : -0.02), z), 1]),
    ...[-0.06, 0, 0.06].map((z, k) => [hub(0.036, 0.02, 'x', -0.31, ARM.a3 + (k === 1 ? 0.05 : -0.02), z, 0.005), 0]),
    [hub(0.07, 0.03, 'z', 0, 0, 0.15, 0.008), 2],
  ]);
  // forearm (J4 roll): a tapered tube to the wrist
  P.forearm = part([
    [lathe([[0, 0], [0.088, 0], [0.09, 0.02], [0.074, 0.5], [0.068, 0.6], [0, 0.6]], 40).rotateZ(-Math.PI / 2), 0],
    [hub(0.09, 0.02, 'x', 0.005, 0, 0, 0.004), 1],
  ]);
  // wrist (J5): a fork round the pitch hub
  const fork = (z) => [rbox(0.13, 0.11, 0.022, 0.01, -0.02, 0, z), 0];
  P.wrist = part([
    [cyl(0.068, 0.062, 0.05, 'x', 32, -0.09, 0, 0), 0],
    fork(0.058), fork(-0.058),
    [hub(0.056, 0.094, 'z', 0, 0, 0, 0.008), 1],
    [hub(0.03, 0.14, 'z', 0, 0, 0, 0.004), 2],
  ]);
  // tool flange + MIG torch: mount, swan neck bending 45 deg down, nozzle, and the hose back over the wrist
  const neck = new THREE.CatmullRomCurve3([[0.0, 0, 0], [0.12, 0, 0], [0.2, -0.04, 0], [ARM.flange - 0.1 + 0.12 + 0.2 * Math.SQRT1_2 - 0.03, -0.2 * Math.SQRT1_2 + 0.03, 0]].map((p) => new THREE.Vector3(...p)));
  const neckG = new THREE.TubeGeometry(neck, SEG(32), 0.016, SEG(16)).translate(ARM.flange - 0.02, 0, 0);
  const tipX = TOOLS.torch.tip[0], tipY = TOOLS.torch.tip[1];
  const nozzle = lathe([[0.0, 0], [0.012, 0], [0.019, 0.02], [0.021, 0.07], [0.017, 0.09], [0.0, 0.09]], 20);
  // nozzle axis along the tip direction (-45 deg), ending at the tip
  nozzle.rotateZ(-Math.PI / 2 - Math.PI / 4);
  nozzle.translate(tipX - 0.09 * Math.SQRT1_2, tipY + 0.09 * Math.SQRT1_2, 0);
  const cTip = lathe([[0, 0], [0.006, 0], [0.004, 0.012], [0, 0.012]], 16).rotateZ(-Math.PI / 2 - Math.PI / 4).translate(tipX - 0.006, tipY + 0.006, 0);
  P.torch = part([
    [cyl(0.046, 0.046, 0.022, 'x', 36, ARM.flange - 0.01, 0, 0), 2],
    [rbox(0.06, 0.09, 0.08, 0.012, ARM.flange + 0.03, 0, 0), 1],
    [neckG, 1],
    [nozzle, 4],
    [cTip, 4],
    [new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[ARM.flange + 0.04, 0.05, 0], [0.02, 0.13, 0.0], [-0.2, 0.14, 0.02], [-0.42, 0.1, 0.03]].map((p) => new THREE.Vector3(...p))), SEG(24), 0.019, SEG(10)), 3],
  ]);
  // parallel gripper: flange, body, two fingers
  P.gripper = part([
    [cyl(0.046, 0.046, 0.022, 'x', 36, ARM.flange - 0.01, 0, 0), 2],
    [rbox(0.08, 0.1, 0.16, 0.012, ARM.flange + 0.05, 0, 0), 1],
    [rbox(0.1, 0.03, 0.022, 0.005, ARM.flange + 0.14, 0, 0.05), 2],
    [rbox(0.1, 0.03, 0.022, 0.005, ARM.flange + 0.14, 0, -0.05), 2],
  ]);
  HI = true;
  return P;
}
let PARTS = null;

// ------------------------------------------------------------------------------------------------ kinematics
// planar IK: tool tip at S (arm space), tool flange pitched `pitch` rad below horizontal -> joint angles
export function solveArm(S, pitch, tool = 'torch', elbowUp = true) {
  const q1 = Math.atan2(-S.z, S.x);
  const rS = Math.hypot(S.x, S.z), hS = S.y;
  const [tx, ty] = TOOLS[tool].tip;
  const c = Math.cos(pitch), s = Math.sin(pitch);
  // tip = W + tx * (c, -s) + ty * (s, c)
  const Wr = rS - (tx * c + ty * s), Wh = hS - (-tx * s + ty * c);
  const x = Wr - ARM.a1, y = Wh - (ARM.j1 + ARM.h2);
  const L1 = ARM.a2, L2 = Math.hypot(ARM.d4, ARM.a3);
  let D = Math.hypot(x, y);
  D = Math.min(D, L1 + L2 - 1e-4);
  // J3 on both circles
  const a = (L1 * L1 - L2 * L2 + D * D) / (2 * D);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const ux = x / D, uy = y / D;
  const sgn = elbowUp ? 1 : -1;
  const jx = a * ux - sgn * h * uy, jy = a * uy + sgn * h * ux;
  const q2 = Math.atan2(jx, jy); // from vertical, forward positive
  const psi = Math.atan2(-(y - jy), x - jx); // J3 -> W below horizontal
  const phi = psi + Math.atan2(ARM.a3, ARM.d4);
  const q3 = phi - q2;
  const q5 = pitch - phi;
  return [q1, q2, q3, 0, q5, 0];
}

// ------------------------------------------------------------------------------------------------ the fleet
// arms: [{ x, z, yaw, tool }]. Each frame: begin(), pose(i, q, far) for every arm (far = low-detail copy), commit().
// tips[i] is the tool tip after pose().
export function armFleet(arms, { mats = armMaterials(), shadows = true } = {}) {
  PARTS = PARTS || { hi: buildParts(true), lo: buildParts(false) };
  const n = arms.length;
  const group = new THREE.Group();
  const KEYS = ['riser', 'turret', 'lower', 'elbow', 'forearm', 'wrist', 'torch', 'gripper'];
  const mkSet = (P, lod) => {
    const set = {};
    for (const k of KEYS) {
      const m = new THREE.InstancedMesh(P[k], mats, Math.max(1, n));
      m.name = `arm_${k}_${lod}`;
      m.count = 0;
      m.castShadow = m.receiveShadow = shadows;
      m.frustumCulled = false;
      group.add(m);
      set[k] = m;
    }
    return set;
  };
  const I = { hi: mkSet(PARTS.hi, 'hi'), lo: mkSet(PARTS.lo, 'lo') };
  const cnt = { hi: {}, lo: {} };
  // a scratch rig
  const root = new THREE.Object3D(), j1 = new THREE.Object3D(), j2 = new THREE.Object3D(), j3 = new THREE.Object3D(),
    j4 = new THREE.Object3D(), j5 = new THREE.Object3D(), j6 = new THREE.Object3D();
  root.add(j1); j1.add(j2); j2.add(j3); j3.add(j4); j4.add(j5); j5.add(j6);
  j1.position.y = ARM.j1;
  j2.position.set(ARM.a1, ARM.h2, 0);
  j3.position.set(0, ARM.a2, 0);
  j4.position.set(0.2, ARM.a3, 0);
  j5.position.set(ARM.d4 - 0.2, 0, 0);
  const tips = arms.map(() => new THREE.Vector3());
  const begin = () => { for (const l of ['hi', 'lo']) for (const k of KEYS) cnt[l][k] = 0; };
  const put = (lod, k, m) => { I[lod][k].setMatrixAt(cnt[lod][k]++, m); };
  begin();
  const pose = (i, q, far = false) => {
    const a = arms[i];
    const lod = far ? 'lo' : 'hi';
    root.position.set(a.x, a.y || 0, a.z);
    root.rotation.set(0, a.yaw || 0, 0);
    j1.rotation.set(0, q[0], 0);
    j2.rotation.set(0, 0, -q[1]);
    j3.rotation.set(0, 0, -q[2]);
    j4.rotation.set(q[3], 0, 0);
    j5.rotation.set(0, 0, -q[4]);
    j6.rotation.set(q[5], 0, 0);
    root.updateMatrixWorld(true);
    put(lod, 'riser', root.matrixWorld);
    put(lod, 'turret', j1.matrixWorld);
    put(lod, 'lower', j2.matrixWorld);
    put(lod, 'elbow', j3.matrixWorld);
    put(lod, 'forearm', j4.matrixWorld);
    put(lod, 'wrist', j5.matrixWorld);
    const torch = (a.tool || 'torch') === 'torch';
    put(lod, torch ? 'torch' : 'gripper', j6.matrixWorld);
    const [tx, ty] = TOOLS[torch ? 'torch' : 'gripper'].tip;
    tips[i].set(tx, ty, 0).applyMatrix4(j5.matrixWorld);
  };
  const commit = () => {
    for (const l of ['hi', 'lo']) for (const k of KEYS) { I[l][k].count = cnt[l][k]; I[l][k].instanceMatrix.needsUpdate = true; }
  };
  // a world point in an arm's base frame
  const Y = new THREE.Vector3(0, 1, 0);
  const toArm = (i, p) => {
    const a = arms[i];
    return p.clone().sub(new THREE.Vector3(a.x, a.y || 0, a.z)).applyAxisAngle(Y, -(a.yaw || 0));
  };
  return { group, begin, pose, commit, tips, toArm, meshes: I, mats };
}
