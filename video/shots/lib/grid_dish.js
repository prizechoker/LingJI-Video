// A built-in dishwasher (60 cm): stainless tub, a door hinged at the bottom, a lower rack of coated wire with rows
// of tines (the grid the dishes slot into) on wheels, an upper rack, two rotating spray arms, and slow-motion water
// jets from the arms' nozzles that break into droplets and splash off the dishes.
// Dishwasher space: floor y = 0, front face at z = 0 (body toward -z), centred on x = 0.
import { THREE } from '../../engine2/core.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildBowl, porcelainMaterial, waterMaterial } from '../../engine2/dishes.js';
import { hash } from './grid_fx.js';

export const DW = {
  w: 0.598, h: 0.815, d: 0.57,
  tub: { x: 0.272, y0: 0.1, y1: 0.775, z0: -0.545, z1: -0.035 },
  hinge: { y: 0.09, z: 0.005 },
  lower: { y: 0.165, w: 0.51, d: 0.48, h: 0.13, zc: -0.29 },
  upper: { y: 0.47, w: 0.5, d: 0.47, h: 0.15, zc: -0.29 },
  armL: { y: 0.128, zc: -0.29 }, armM: { y: 0.445, zc: -0.29 },
};

const flat = (g) => {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  return n;
};
const merge = (list) => mergeGeometries(list.map(flat));
const rb = (w, h, d, r, x, y, z, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, r).translate(x, y, z);
const bx = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

// a straight wire from a to b ([x, y, z]); r = radius
const UP = new THREE.Vector3(0, 1, 0);
export function wire(a, b, r = 0.0016, seg = 6) { return wireG(a, b, r, seg); }
function wireG(a, b, r = 0.0016, seg = 6) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const L = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(r, r, L, seg, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, B.clone().sub(A).normalize()));
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return g;
}

// a dishwasher rack: coated wire basket with a base grid, walls of vertical wires, a rim, tines.
// tines: [{ x, z0, z1, n, h, lean }] rows of n tines along z at x (lean: tilt toward -z, rad). Local: centre of the
// base at the origin.
export function rackGeometry({ w = 0.51, d = 0.48, h = 0.13, pitch = 0.024, tines = [], wheels = true, rs = 1, wallPitch = 0.026 } = {}) {
  const L = [];
  const wire = (a, b, r = 0.0016) => wireG(a, b, r * rs, rs > 2 ? 10 : 6);
  const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
  // base: wires along x every pitch, two heavier wires along z per bay
  for (let z = z0 + pitch / 2; z < z1; z += pitch) L.push(wire([x0, 0.004, z], [x1, 0.004, z]));
  for (let x = x0 + 0.04 * rs; x < x1 - 0.02; x += 0.085 * Math.max(1, rs * 0.5)) L.push(wire([x, 0, z0], [x, 0, z1], 0.0022));
  // frame: bottom rectangle, rim
  for (const y of [0, h]) {
    const r = y ? 0.0028 : 0.0026;
    L.push(wire([x0, y, z0], [x1, y, z0], r), wire([x0, y, z1], [x1, y, z1], r), wire([x0, y, z0], [x0, y, z1], r), wire([x1, y, z0], [x1, y, z1], r));
  }
  L.push(wire([x0, h * 0.55, z0], [x1, h * 0.55, z0], 0.002), wire([x0, h * 0.55, z0], [x0, h * 0.55, z1], 0.002), wire([x1, h * 0.55, z0], [x1, h * 0.55, z1], 0.002));
  // walls: vertical wires every 2.6 cm (the front wall lower, for loading)
  for (let x = x0; x <= x1 + 1e-6; x += wallPitch) { L.push(wire([x, 0, z0], [x, h, z0])); L.push(wire([x, 0, z1], [x, h * 0.6, z1])); }
  for (let z = z0; z <= z1 + 1e-6; z += wallPitch) { L.push(wire([x0, 0, z], [x0, h, z])); L.push(wire([x1, 0, z], [x1, h, z])); }
  // tines
  for (const T of tines) {
    for (let k = 0; k < T.n; k++) {
      const z = T.z0 + ((T.z1 - T.z0) * k) / Math.max(1, T.n - 1);
      L.push(wire([T.x, 0.004, z], [T.x, T.h, z - Math.sin(T.lean || 0) * T.h], 0.0019));
    }
    L.push(wire([T.x, 0.006, T.z0], [T.x, 0.006, T.z1], 0.0024));
  }
  const wires = merge(L);
  const parts = [wires];
  const wheelG = [];
  if (wheels) for (const x of [x0 - 0.008, x1 + 0.008]) for (const z of [z0 + 0.06, z1 - 0.06]) wheelG.push(new THREE.CylinderGeometry(0.018, 0.018, 0.012, 20).rotateZ(Math.PI / 2).translate(x, 0.005, z));
  const out = mergeGeometries([parts[0], ...(wheelG.length ? [merge(wheelG)] : [])].map(flat), true);
  return out;
}

export function rackMaterials() {
  return [
    new THREE.MeshPhysicalMaterial({ color: 0x9aa2aa, roughness: 0.38, metalness: 0.1, clearcoat: 0.5, clearcoatRoughness: 0.3 }),
    new THREE.MeshStandardMaterial({ color: 0x3d4248, roughness: 0.45 }),
  ];
}

// a dinner plate: 26 cm, a foot ring, a shallow well, a broad rim (lathe, axis +y, foot on y = 0)
export function plateGeometry() {
  const prof = [[0, 0.004], [0.06, 0.004], [0.062, 0.0], [0.066, 0.0], [0.068, 0.004], [0.09, 0.009], [0.105, 0.013], [0.122, 0.019], [0.13, 0.022],
    [0.129, 0.0245], [0.12, 0.023], [0.103, 0.0175], [0.088, 0.0122], [0.06, 0.0095], [0, 0.0085]];
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 72);
  g.computeVertexNormals();
  return g;
}
export function plateMaterial() {
  return new THREE.MeshPhysicalMaterial({ color: 0xf6f5f1, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.04, ior: 1.5, specularIntensity: 0.6 });
}

// ------------------------------------------------------------------------------------------------ the machine
export function buildDishwasher(st) {
  const group = new THREE.Group();
  const T = DW.tub;
  const steelMaps = st.pbr('Metal032', { repeat: [2, 2] });
  const steel = new THREE.MeshPhysicalMaterial({ color: 0xd2d7dc, metalness: 1, roughness: 0.32, roughnessMap: steelMaps.roughnessMap, anisotropy: 0.7, anisotropyRotation: Math.PI / 2 });
  const tubSteel = new THREE.MeshPhysicalMaterial({ color: 0xc9cfd6, metalness: 1, roughness: 0.42, roughnessMap: steelMaps.roughnessMap, side: THREE.DoubleSide });
  const black = new THREE.MeshPhysicalMaterial({ color: 0x0b0c0d, roughness: 0.08, clearcoat: 1 });
  const grey = new THREE.MeshPhysicalMaterial({ color: 0x8e959c, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2f34, roughness: 0.6 });
  const mats = { steel, tubSteel, black, grey, dark };
  const add = (geo, mat, parent = group) => { const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  // tub: back, sides, floor, roof (seen from inside); horizontal ribs pressed into the side walls
  const tw = T.x * 2, th = T.y1 - T.y0, td = T.z1 - T.z0, zc = (T.z0 + T.z1) / 2, yc = (T.y0 + T.y1) / 2;
  const tub = new THREE.Group();
  group.add(tub);
  const back = add(bx(tw + 0.02, th, 0.01, 0, yc, T.z0 - 0.005), tubSteel, tub);
  const left = add(bx(0.01, th, td, -T.x - 0.005, yc, zc), tubSteel, tub);
  const right = add(bx(0.01, th, td, T.x + 0.005, yc, zc), tubSteel, tub);
  add(bx(tw + 0.02, 0.01, td, 0, T.y0 - 0.005, zc), tubSteel, tub);
  add(bx(tw + 0.02, 0.01, td, 0, T.y1 + 0.005, zc), tubSteel, tub);
  const ribs = [];
  for (const sx of [-1, 1]) for (let k = 0; k < 7; k++) ribs.push(rb(0.006, 0.012, td - 0.04, 0.003, sx * (T.x - 0.001), T.y0 + 0.08 + k * 0.085, zc, 1));
  add(merge(ribs), tubSteel, tub);
  // sump and filter in the floor, rails for the racks
  add(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 40).translate(0, T.y0 + 0.006, zc - 0.03), grey, tub);
  add(new THREE.CylinderGeometry(0.035, 0.035, 0.06, 32).translate(0, T.y0 + 0.03, zc - 0.03), dark, tub);
  for (const sx of [-1, 1]) {
    add(bx(0.014, 0.02, td - 0.02, sx * (T.x - 0.007), DW.lower.y - 0.012, zc), grey, tub);
    add(bx(0.014, 0.02, td - 0.02, sx * (T.x - 0.007), DW.upper.y - 0.012, zc), grey, tub);
  }
  // the outer cabinet sides (thin), the toe kick
  const shell = new THREE.Group();
  group.add(shell);
  add(bx(0.008, DW.h, DW.d, -DW.w / 2 + 0.004, DW.h / 2, -DW.d / 2), dark, shell);
  add(bx(0.008, DW.h, DW.d, DW.w / 2 - 0.004, DW.h / 2, -DW.d / 2), dark, shell);
  add(bx(DW.w, 0.09, 0.02, 0, 0.045, -0.04), dark, shell);

  // door: pivot at the hinge; the panel built standing (closed), rotated about x to open
  const door = new THREE.Group();
  door.position.set(0, DW.hinge.y, DW.hinge.z);
  group.add(door);
  const dh = DW.h - DW.hinge.y - 0.005;
  add(rb(DW.w - 0.004, dh, 0.022, 0.004, 0, dh / 2, 0.011), steel, door); // outer stainless panel
  add(rb(DW.w - 0.03, dh - 0.03, 0.03, 0.006, 0, dh / 2, -0.015), tubSteel, door); // inner liner
  add(bx(DW.w - 0.004, 0.055, 0.004, 0, dh - 0.03, 0.0235), black, door); // control strip glass
  add(rb(0.38, 0.018, 0.028, 0.008, 0, dh - 0.085, 0.034), steel, door); // handle bar
  for (const x of [-0.17, 0.17]) add(rb(0.02, 0.022, 0.026, 0.004, x, dh - 0.085, 0.022), steel, door);
  add(rb(0.16, 0.1, 0.02, 0.008, 0.05, dh * 0.62, -0.035), grey, door); // detergent dispenser
  add(rb(0.12, 0.07, 0.006, 0.006, 0.05, dh * 0.62, -0.046), dark, door);
  const leds = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8fd6ff).multiplyScalar(2.2), toneMapped: false });
  for (let k = 0; k < 4; k++) add(bx(0.012, 0.004, 0.002, 0.12 + k * 0.03, dh - 0.03, 0.0262), leds, door);

  // racks
  const rMats = rackMaterials();
  const lowerG = rackGeometry({
    w: DW.lower.w, d: DW.lower.d, h: DW.lower.h,
    tines: [
      { x: -0.205, z0: -0.2, z1: 0.2, n: 11, h: 0.11, lean: 0.12 }, { x: -0.035, z0: -0.2, z1: 0.2, n: 11, h: 0.11, lean: 0.12 },
      { x: 0.035, z0: -0.2, z1: 0.2, n: 11, h: 0.09, lean: 0.3 }, { x: 0.135, z0: -0.2, z1: 0.2, n: 11, h: 0.09, lean: 0.3 }, { x: 0.215, z0: -0.2, z1: 0.2, n: 11, h: 0.08, lean: 0.3 },
    ],
  });
  const lower = new THREE.Group();
  lower.add(Object.assign(new THREE.Mesh(lowerG, rMats), { castShadow: true, receiveShadow: true }));
  group.add(lower);
  const upperG = rackGeometry({
    w: DW.upper.w, d: DW.upper.d, h: DW.upper.h, pitch: 0.02,
    tines: [{ x: -0.1, z0: -0.2, z1: 0.2, n: 9, h: 0.07, lean: -0.2 }, { x: 0.1, z0: -0.2, z1: 0.2, n: 9, h: 0.07, lean: -0.2 }],
  });
  const upper = new THREE.Group();
  upper.add(Object.assign(new THREE.Mesh(upperG, rMats), { castShadow: true, receiveShadow: true }));
  upper.position.set(0, DW.upper.y, DW.upper.zc);
  group.add(upper);

  // spray arms: a hub and two flattened arms with nozzle bumps on top (local: hub at the origin)
  const armGeo = (len1, len2) => {
    const L = [new THREE.CylinderGeometry(0.03, 0.034, 0.03, 32)];
    L.push(rb(len1, 0.016, 0.04, 0.008, len1 / 2, 0.004, 0, 2), rb(len2, 0.016, 0.04, 0.008, -len2 / 2, 0.004, 0, 2));
    for (const s of [0.05, 0.09, 0.13, 0.17, 0.2]) {
      if (s < len1 - 0.01) L.push(new THREE.CylinderGeometry(0.005, 0.006, 0.008, 12).translate(s, 0.015, (s * 37 % 1 - 0.5) * 0.012));
      if (s < len2 - 0.01) L.push(new THREE.CylinderGeometry(0.005, 0.006, 0.008, 12).translate(-s, 0.015, (s * 53 % 1 - 0.5) * 0.012));
    }
    return merge(L);
  };
  const armMat = new THREE.MeshPhysicalMaterial({ color: 0xa3aab1, roughness: 0.4, clearcoat: 0.4 });
  const armL = add(armGeo(0.22, 0.2), armMat);
  armL.position.set(0, DW.armL.y, DW.armL.zc);
  const armM = add(armGeo(0.19, 0.17), armMat);
  armM.position.set(0, DW.armM.y, DW.armM.zc);

  return { group, door, lower, upper, armL, armM, tub, shell, mats, walls: { back, left, right } };
}

// ------------------------------------------------------------------------------------------------ dishes in the racks
// slots in the lower rack (rack space): plates on the left (standing, faces toward +z), bowls on the right (tilted)
export function lowerLoad() {
  const plates = [], bowls = [];
  for (let k = 0; k < 5; k++) plates.push({ x: -0.12, z: -0.16 + k * 0.08, lean: 0.12 });
  for (let r = 0; r < 3; r++) for (const x of [0.085, 0.175]) bowls.push({ x, z: -0.13 + r * 0.13, tilt: 0.95 });
  return { plates, bowls };
}

// world-free poses (rack space): a plate standing in its slot, a bowl leaning in the tines, rim to the front
export function platePose(s, out = new THREE.Object3D()) {
  out.position.set(s.x, 0.135, s.z);
  out.rotation.set(Math.PI / 2 - s.lean, 0, 0);
  // the plate's foot sits in the slot: its axis lies along z, centre at radius height
  out.rotation.order = 'XYZ';
  return out;
}
export function bowlPose(s, out = new THREE.Object3D()) {
  out.position.set(s.x, 0.012, s.z);
  out.rotation.set(s.tilt, 0, 0);
  return out;
}

// ------------------------------------------------------------------------------------------------ water
// jets from rotating spray arms: nozzles (in arm space: [x along the arm, direction]) emit droplets that fly up
// ballistically (physical time = slow * screen time), hit the load at a jet-dependent height and splash.
export function sprayField({ max = 4000, slow = 0.1, mat = waterMaterial() } = {}) {
  const geo = new THREE.SphereGeometry(1, 12, 8);
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.castShadow = false;
  const G = 9.81;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), v = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1);
  // arms: [{ pos: Vector3 (hub, world), omega (rad/s physical), phase, nozzles: [{ r, up, tan, out, rate, hit }] }]
  const update = (t, arms, gain = 1) => {
    let n = 0;
    const tp = t * slow;
    for (let ai = 0; ai < arms.length; ai++) {
      const A = arms[ai];
      A.nozzles.forEach((N, ni) => {
        const rate = N.rate ?? 260;
        const life = 0.11;
        const k0 = Math.floor((tp - life) * rate), k1 = Math.floor(tp * rate);
        for (let k = k0; k <= k1 && n < max - 3; k++) {
          const seed = ai * 1000 + ni;
          const b = (k + 0.3 * hash(k, seed, 1)) / rate;
          if (b > tp) continue;
          const tau = tp - b;
          // nozzle position + direction at birth (the arm turns)
          const th = A.phase + A.omega * b;
          const c = Math.cos(th), sn = Math.sin(th);
          const nx = N.r * c, nz = -N.r * sn;
          const speed = N.speed * (0.94 + 0.12 * hash(k, seed, 2));
          // direction: up, plus a tangential lean (the reaction that spins the arm), a little spread
          const ux = -sn * N.tan + c * N.out + (hash(k, seed, 3) - 0.5) * 0.14;
          const uz = -c * N.tan - sn * N.out + (hash(k, seed, 4) - 0.5) * 0.14;
          const dir = v.set(ux, 1, uz).normalize();
          const vx = dir.x * speed, vy = dir.y * speed, vz = dir.z * speed;
          const hitH = N.hit * (0.85 + 0.3 * hash(k, seed, 5));
          // time to reach hitH: vy T - G T^2 / 2 = hitH
          const disc = vy * vy - 2 * G * hitH;
          const T = disc > 0 ? (vy - Math.sqrt(disc)) / G : Infinity;
          const x0 = A.pos.x + nx, y0 = A.pos.y + 0.02, z0 = A.pos.z + nz;
          if (tau < T) {
            p.set(x0 + vx * tau, y0 + vy * tau - 0.5 * G * tau * tau, z0 + vz * tau);
            v.set(vx, vy - G * tau, vz);
            const sp = v.length();
            // a thread near the nozzle, breaking into drops further out
            const r = (N.size ?? 0.0022) * (0.75 + 0.5 * hash(k, seed, 6));
            const stretch = 1.4 + Math.max(0, 5 - tau * 70) + sp * 0.4;
            q.setFromUnitVectors(Z, v.normalize());
            s.set(r, r, r * stretch);
            mesh.setMatrixAt(n++, m4.compose(p, q, s));
          } else {
            // splash: two small drops thrown off the dish, falling
            const hx = x0 + vx * T, hy = y0 + vy * T - 0.5 * G * T * T, hz = z0 + vz * T;
            const ts = tau - T;
            if (ts > 0.07) continue;
            for (let j = 0; j < 2; j++) {
              const a = hash(k, seed, 10 + j) * Math.PI * 2, el = -0.2 - hash(k, seed, 12 + j) * 1.0;
              const sp2 = 0.4 + 1.3 * hash(k, seed, 14 + j);
              const sx = Math.cos(a) * Math.cos(el) * sp2, sy = Math.sin(el) * sp2, sz = Math.sin(a) * Math.cos(el) * sp2;
              p.set(hx + sx * ts, hy + sy * ts - 0.5 * G * ts * ts, hz + sz * ts);
              const r = 0.0011 + 0.0012 * hash(k, seed, 16 + j);
              q.setFromUnitVectors(Z, v.set(sx, sy - G * ts, sz).normalize());
              s.set(r, r, r * 1.6);
              mesh.setMatrixAt(n++, m4.compose(p, q, s));
            }
          }
        }
      });
    }
    mesh.count = Math.round(n * gain);
    mesh.instanceMatrix.needsUpdate = true;
  };
  return { mesh, update };
}
