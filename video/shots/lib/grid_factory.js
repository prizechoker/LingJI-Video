// The gridded factory: a light concrete floor with a dark painted 1 m grid, rows of fenced robot work cells along
// a main aisle (z axis), welding arms working on steel frames, handling arms moving parts, building columns,
// overhead LED fixtures. Every robot runs a deterministic program (a function of time), so its torch tip at any
// moment is known: the sparks are born there.
//
// Layout (metres): grid cells G = [1.0, 1.068] (the go board's aspect), lines on x = i * G[0], z = j * G[1].
// Rows of 6 x 6-cell blocks at x cells [-17,-11], [-8,-2], [2,8], [11,17]; the main aisle x in [-2, 2] runs along z.
// Blocks repeat along z every 7 cells; block j's centre is at z cell 7 j.
import { THREE } from '../../engine2/core.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { armFleet, armMaterials, solveArm } from './grid_arm.js';
import { gridFloorMaterial, floorPlane } from './grid_floor.js';
import { sparkField, arcCores, arcFlicker, hash, hazeCones } from './grid_fx.js';
import { ss, clamp, lerp } from './kit.js';

export const G = [1.0, 1.068];
export const ROWS = [[-35, -29], [-26, -20], [-17, -11], [-8, -2], [2, 8], [11, 17], [20, 26], [29, 35]];
export const TABLE_H = 0.82;

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const flat = (g) => {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
  return n;
};
const merge = (list) => mergeGeometries(list.map(flat));
const box = (w, h, d, x, y, z, r = 0) => (r ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d)).translate(x, y, z);

// wire mesh for the fence panels: thin dark wires on a 50 mm grid, alpha-tested
function meshTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 64, 7);
  g.fillRect(0, 0, 7, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// the steel frame assembly on a welding table (local: table centre, top at y = 0)
function frameGeometry() {
  const tube = 0.06, L = 1.1, Wd = 0.66;
  const parts = [
    box(L, tube, tube, 0, tube / 2, -Wd / 2), box(L, tube, tube, 0, tube / 2, Wd / 2),
    box(tube, tube, Wd - tube, -L / 2 + tube / 2, tube / 2, 0), box(tube, tube, Wd - tube, L / 2 - tube / 2, tube / 2, 0),
    box(tube, tube, Wd - tube, -0.18, tube / 2, 0), box(tube, tube, Wd - tube, 0.2, tube / 2, 0),
    box(0.16, 0.012, 0.16, -0.38, tube + 0.006, -0.18), box(0.16, 0.012, 0.16, 0.38, tube + 0.006, 0.18),
    box(0.08, 0.16, 0.012, -0.5, tube + 0.08, Wd / 2 - 0.02), box(0.08, 0.16, 0.012, 0.5, tube + 0.08, -Wd / 2 + 0.02),
  ];
  return merge(parts);
}

// a welding table with fixture clamps (local: centre of the top, top at y = TABLE_H)
function tableGeometry() {
  const top = 1.5, d = 1.0, h = TABLE_H;
  const parts = [box(top, 0.05, d, 0, h - 0.025, 0, 0.004)];
  for (const [x, z] of [[-0.65, -0.4], [0.65, -0.4], [-0.65, 0.4], [0.65, 0.4]]) parts.push(box(0.08, h - 0.05, 0.08, x, (h - 0.05) / 2, z));
  parts.push(box(1.3, 0.05, 0.05, 0, 0.18, -0.4), box(1.3, 0.05, 0.05, 0, 0.18, 0.4));
  for (const [x, z] of [[-0.62, -0.36], [0.62, 0.36], [-0.62, 0.36], [0.62, -0.36]]) parts.push(box(0.05, 0.12, 0.05, x, h + 0.06, z), box(0.12, 0.03, 0.04, x * 0.92, h + 0.11, z));
  return merge(parts);
}

function postGeometry() { return merge([box(0.06, 2.0, 0.06, 0, 1.0, 0), box(0.12, 0.01, 0.12, 0, 0.005, 0)]); }
// one fence panel spanning 1 unit along local x (scaled per instance), between posts
function panelFrameGeometry() { return merge([box(1, 0.035, 0.03, 0, 1.92, 0), box(1, 0.035, 0.03, 0, 0.17, 0), box(1, 0.02, 0.02, 0, 1.05, 0)]); }
function panelMeshGeometry() { return new THREE.PlaneGeometry(1, 1.73).translate(0, 1.045, 0); }

function columnGeometry() {
  const H = 12, f = 0.4, tw = 0.025;
  return merge([
    box(f, H, tw * 1.6, 0, H / 2, -f / 2 + tw), box(f, H, tw * 1.6, 0, H / 2, f / 2 - tw), box(tw, H, f - 2 * tw, 0, H / 2, 0),
    box(0.7, 0.03, 0.7, 0, 0.015, 0), box(0.5, 0.25, 0.5, 0, 0.125, 0, 0.01),
  ]);
}
function fixtureGeometry() { return merge([box(0.3, 0.09, 1.5, 0, 0.045, 0), box(0.01, 1.4, 0.01, 0, 0.75, -0.6), box(0.01, 1.4, 0.01, 0, 0.75, 0.6)]); }
function cabinetGeometry() { return merge([box(0.8, 1.6, 0.45, 0, 0.8 + 0.1, 0, 0.01), box(0.75, 0.1, 0.4, 0, 0.05, 0), box(0.02, 0.2, 0.02, 0.3, 1.0, 0.235)]); }
function drumGeometry() {
  const g = new THREE.CylinderGeometry(0.29, 0.29, 0.85, 32).translate(0, 0.425, 0);
  const lid = new THREE.CylinderGeometry(0.2, 0.3, 0.12, 32).translate(0, 0.91, 0);
  return merge([g, lid]);
}

// ------------------------------------------------------------------------------------------------ programs
// a welding program: two seams, tip moving along each, with an arcing retract-and-reach between. Returns
// { S: tip (world), pitch, weld: 0..1 }
function weldProgram(seams, period, phase) {
  return (t) => {
    const u = ((t + phase) % period + period) % period;
    const W1 = period * 0.36, M1 = period * 0.14, W2 = period * 0.36;
    const [a0, a1] = seams[0], [b0, b1] = seams[1];
    let S, weld = 0;
    if (u < W1) { S = a0.clone().lerp(a1, u / W1); weld = sideRamp(u, W1); }
    else if (u < W1 + M1) { S = hop(a1, b0, (u - W1) / M1); }
    else if (u < W1 + M1 + W2) { const k = (u - W1 - M1) / W2; S = b0.clone().lerp(b1, k); weld = sideRamp(u - W1 - M1, W2); }
    else S = hop(b1, a0, (u - W1 - M1 - W2) / (period - W1 - M1 - W2));
    return { S, weld };
  };
}
const sideRamp = (u, W) => clamp(u / 0.12) * clamp((W - u) / 0.08);
function hop(a, b, k) {
  const e = ss(k);
  const p = a.clone().lerp(b, e);
  p.y += 0.22 * Math.sin(Math.PI * clamp(k)) ;
  return p;
}
// pick-and-place: down, grip, up, across, down, release, up; the next cycle carries the part back the other way
function handleProgram(A0, B0, period, phase) {
  const up = 0.35;
  return (t) => {
    const cyc = Math.floor((t + phase) / period);
    const [A, B] = cyc % 2 ? [B0, A0] : [A0, B0];
    const u = (t + phase) / period - cyc;
    const keys = [[0, A, up], [0.1, A, 0], [0.18, A, 0], [0.28, A, up], [0.52, B, up], [0.62, B, 0], [0.7, B, 0], [0.8, B, up], [1.0, B, up]];
    let S = B.clone();
    for (let i = 0; i < keys.length - 1; i++) {
      const [u0, P0, h0] = keys[i], [u1, P1, h1] = keys[i + 1];
      if (u <= u1) {
        const k = ss((u - u0) / (u1 - u0));
        S = P0.clone().lerp(P1, k);
        S.y += lerp(h0, h1, k);
        break;
      }
    }
    const held = u >= 0.17 && u < 0.66;
    return { S, weld: 0, held, rest: u < 0.17 ? A : B };
  };
}

// ------------------------------------------------------------------------------------------------ the set
// opts: blocks: (row, j) -> 'weld' | 'handle' | null ; zRange: [jMin, jMax] ; floor overrides
export async function buildFactory(st, {
  jRange = [-9, 2], rows = ROWS, block = (r, j) => ((j + r * 2) % 4 === 3 ? 'handle' : 'weld'),
  floor: floorOpts = {}, fixtures = true, sparksMax = 2600, maxSparkArms = 14, armPaint = 0xd3d8de, hazeI = 0.035, lodDist = 22,
} = {}) {
  const group = new THREE.Group();
  // floor
  const fl = gridFloorMaterial(st, {
    texture: 'Concrete047A', tile: 5, tint: 0xb4bec7, cell: G, lineW: 0.05, paint: 0x22262b, paintA: 0.9, wear: 0.3, texMix: 0.5, texMean: 0xa4a197,
    pools: { pitch: [4.75, 4.272], offset: [0, 0], radius: [1.5, 1.9], color: 0xe4efff, intensity: 0.0, rect: [-34, -76, 34, 20] },
    refl: { intensity: 0.0, height: 12, pitch: [4.75, 4.272], offset: [0, 0], half: [0.11, 0.69], blur: 0.022 },
    clearcoat: 0, roughness: 0.8, normalScale: 0.5, ...floorOpts,
  });
  const floor = new THREE.Mesh(floorPlane(160, 200, 0, -50), fl);
  floor.receiveShadow = true;
  group.add(floor);

  // the cells
  const cells = [];
  for (let r = 0; r < rows.length; r++) {
    for (let j = jRange[0]; j <= jRange[1]; j++) {
      const type = block(r, j);
      if (!type) continue;
      const [a, b] = rows[r];
      const cx = ((a + b) / 2) * G[0], cz = 7 * j * G[1];
      cells.push({ r, j, type, cx, cz, x0: a, x1: b, z0: 7 * j - 3, z1: 7 * j + 3, aisleSide: (a + b) / 2 > 0 ? -1 : 1 });
    }
  }
  const steel = new THREE.MeshStandardMaterial({ color: 0x5d636b, metalness: 0.6, roughness: 0.45 });
  const darkPaint = new THREE.MeshStandardMaterial({ color: 0x2b3036, roughness: 0.55, metalness: 0.2 });
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0x6b737c, roughness: 0.5, metalness: 0.4 });
  const meshMat = new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.5, metalness: 0.5, alphaMap: meshTexture(), transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
  meshMat.alphaMap.repeat.set(20, 34);
  const partMat = new THREE.MeshStandardMaterial({ color: 0x8a9097, metalness: 0.85, roughness: 0.38 });
  const cabMat = new THREE.MeshStandardMaterial({ color: 0x3b434c, roughness: 0.45 });
  const drumMat = new THREE.MeshStandardMaterial({ color: 0x3d5a78, roughness: 0.4 });
  const colMat = new THREE.MeshStandardMaterial({ color: 0x56636f, roughness: 0.55, metalness: 0.3 });

  const inst = (geo, mat, n, shadow = true) => {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
    m.count = n;
    m.castShadow = shadow;
    m.receiveShadow = true;
    m.frustumCulled = false;
    group.add(m);
    return m;
  };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), pp = new THREE.Vector3();
  const place = (m, i, x, y, z, yaw = 0, s = [1, 1, 1]) => {
    q.setFromAxisAngle(V(0, 1, 0), yaw);
    m.setMatrixAt(i, m4.compose(pp.set(x, y, z), q, sc.set(...s)));
  };

  // tables + frames (weld cells: one table; handle cells: two pallets)
  const weldCells = cells.filter((c) => c.type === 'weld');
  const handleCells = cells.filter((c) => c.type === 'handle');
  const tables = inst(tableGeometry(), steel, weldCells.length + 2 * handleCells.length);
  const frames = inst(frameGeometry(), partMat, weldCells.length);
  let ti = 0;
  weldCells.forEach((c, i) => {
    place(tables, ti++, c.cx, 0, c.cz);
    place(frames, i, c.cx, TABLE_H, c.cz, 0);
  });
  handleCells.forEach((c) => {
    place(tables, ti++, c.cx, 0, c.cz - 1.6 * G[1], Math.PI / 2, [0.6, 1, 0.8]);
    place(tables, ti++, c.cx, 0, c.cz + 1.6 * G[1], Math.PI / 2, [0.6, 1, 0.8]);
  });

  // fences: posts on the block outline's grid points, panels between, a 2-cell gate on the aisle side
  const posts = [], panels = [];
  for (const c of cells) {
    const xs = [c.x0, c.x1], zs = [c.z0, c.z1];
    const gateX = c.aisleSide < 0 ? c.x0 : c.x1;
    // along x (constant z)
    for (const zc of zs) for (let i = c.x0; i < c.x1; i++) panels.push([(i + 0.5) * G[0], zc * G[1], 0, G[0]]);
    for (const xc of xs) for (let j = c.z0; j < c.z1; j++) {
      if (xc === gateX && (j === c.z0 + 2 || j === c.z0 + 3)) continue;
      panels.push([xc * G[0], (j + 0.5) * G[1], Math.PI / 2, G[1]]);
    }
    for (let i = c.x0; i <= c.x1; i++) for (const zc of zs) posts.push([i * G[0], zc * G[1]]);
    for (let j = c.z0 + 1; j < c.z1; j++) for (const xc of xs) posts.push([xc * G[0], j * G[1]]);
  }
  const postM = inst(postGeometry(), fenceMat, posts.length);
  posts.forEach(([x, z], i) => place(postM, i, x, 0, z));
  const frameM = inst(panelFrameGeometry(), fenceMat, panels.length);
  const meshM = inst(panelMeshGeometry(), meshMat, panels.length, false);
  panels.forEach(([x, z, yaw, L], i) => { place(frameM, i, x, 0, z, yaw, [L - 0.06, 1, 1]); place(meshM, i, x, 0, z, yaw, [L - 0.06, 1, 1]); });

  // cabinets (one per cell, outside the fence on the aisle side) and wire drums (one per welding robot)
  const cab = inst(cabinetGeometry(), cabMat, cells.length);
  cells.forEach((c, i) => {
    const x = (c.aisleSide < 0 ? c.x0 : c.x1) * G[0] + c.aisleSide * 0.32;
    place(cab, i, x, 0, (c.z0 + 0.8) * G[1], c.aisleSide < 0 ? -Math.PI / 2 : Math.PI / 2);
  });

  // robots
  const arms = [], programs = [];
  const R = (k) => hash(k, 77);
  weldCells.forEach((c, i) => {
    for (const side of [-1, 1]) {
      const x = c.cx + side * 2 * G[0];
      const yaw = side < 0 ? 0 : Math.PI;
      arms.push({ x, z: c.cz, yaw, tool: 'torch', cell: c });
      // seams on the frame near this robot: across the end cross-member, and along a side rail
      const yT = TABLE_H + 0.065;
      const ex = c.cx + side * 0.48;
      const s1 = [V(ex, yT, c.cz - 0.28), V(ex, yT, c.cz + 0.26)];
      const s2 = [V(c.cx + side * 0.42, yT, c.cz + 0.3), V(c.cx + side * 0.05, yT, c.cz + 0.3)];
      const period = 6.2 + 1.6 * R(i * 2 + side);
      programs.push({ kind: 'weld', f: weldProgram(side < 0 ? [s1, s2] : [s2, s1], period, period * R(i * 7 + side + 3)) });
    }
  });
  handleCells.forEach((c, i) => {
    arms.push({ x: c.cx, z: c.cz, yaw: Math.PI / 2 * (c.aisleSide < 0 ? 1 : -1), tool: 'gripper', cell: c });
    const A = V(c.cx, TABLE_H + 0.24, c.cz - 1.6 * G[1]), B = V(c.cx, TABLE_H + 0.24, c.cz + 1.6 * G[1]);
    programs.push({ kind: 'handle', f: handleProgram(A, B, 4.2 + R(i + 50), 4 * R(i + 90)) });
  });
  // the welding wire drums
  const torches = arms.map((a, i) => i).filter((i) => arms[i].tool === 'torch');
  const drum = inst(drumGeometry(), drumMat, torches.length);
  torches.forEach((ai, k) => { const a = arms[ai]; place(drum, k, a.x - Math.cos(a.yaw) * 0.75, 0, a.z + 0.75); });
  // a part in each handling robot's gripper (or on a pallet)
  const boxes = inst(new RoundedBoxGeometry(0.4, 0.22, 0.3, 2, 0.01), partMat, handleCells.length);

  const fleet = armFleet(arms, { mats: armMaterials({ paint: armPaint }) });
  group.add(fleet.group);
  const pitchW = 0.28; // torch flange pitch while welding (nozzle ~ 70 deg down)

  // building columns between blocks, every third gap
  const cols = [];
  for (const [a, b] of rows) for (let j = jRange[0] - 1; j <= Math.min(-1, jRange[1] + 1); j++) if (((j % 3) + 3) % 3 === 0) cols.push([((a + b) / 2) * G[0], (7 * j + 3.5) * G[1]]);
  for (const x of [-27.5, -18.5, -9.5, 9.5, 18.5, 27.5]) for (let j = jRange[0] - 1; j <= Math.min(-1, jRange[1] + 1); j++) if (((j % 3) + 3) % 3 === 1) cols.push([x * G[0], (7 * j + 3.5) * G[1]]);
  const colM = inst(columnGeometry(), colMat, cols.length);
  cols.forEach(([x, z], i) => place(colM, i, x, 0, z));

  // overhead fixtures (emissive diffusers + dark housings), rows along z
  const fixtureXs = [-33.25, -28.5, -23.75, -19, -14.25, -9.5, -4.75, 0, 4.75, 9.5, 14.25, 19, 23.75, 28.5, 33.25];
  const fxPos = [];
  if (fixtures) for (const x of fixtureXs) for (let j = Math.floor((jRange[0] * 7 - 6) / 4); j <= Math.ceil((jRange[1] * 7 + 6) / 4); j++) fxPos.push([x, j * 4 * G[1]]);
  const FIX_H = 12;
  const housing = inst(fixtureGeometry(), darkPaint, fxPos.length, false);
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xeaf3ff).multiplyScalar(6), toneMapped: false });
  const glow = inst(new THREE.BoxGeometry(0.22, 0.01, 1.38).translate(0, -0.002, 0), glowMat, fxPos.length, false);
  fxPos.forEach(([x, z], i) => { place(housing, i, x, FIX_H, z); place(glow, i, x, FIX_H, z); });
  const haze = hazeCones(fxPos.map(([x, z]) => [x, FIX_H - 0.05, z]), { height: FIX_H, radius: 2.6, intensity: hazeI });
  if (hazeI > 0) group.add(haze);

  // sparks + arc cores
  const sparks = sparkField({ max: sparksMax });
  group.add(sparks);
  const cores = arcCores(arms.length, { radius: 0.014 });
  group.add(cores);

  const ground = (c) => (x, z) => (Math.abs(x - c.cx) < 0.75 && Math.abs(z - c.cz) < 0.5 ? TABLE_H : 0);
  const tipPos = (i, t) => programs[i].f(t).S;
  const state = { t: 0 };

  return {
    group, floor, floorMat: fl, haze, fleet, arms, cells, sparks, cores, fixtures: fxPos, FIX_H, glowMat,
    // pose every robot for time t; sparks for the welding arms nearest `focus` (a world point)
    update(t, camera, { focus = null, sparkGain = 1, arcGain = 1, weldBoost = null } = {}) {
      state.t = t;
      const tipList = [];
      let bi = 0;
      fleet.begin();
      const cp = camera.position;
      for (let i = 0; i < arms.length; i++) {
        const pr = programs[i].f(t);
        const a = arms[i];
        const local = fleet.toArm(i, pr.S);
        const tool = a.tool;
        const far = (a.x - cp.x) ** 2 + (a.z - cp.z) ** 2 + cp.y * cp.y > lodDist * lodDist;
        fleet.pose(i, solveArm(local, tool === 'torch' ? pitchW : Math.PI / 2, tool), far);
        if (tool === 'torch') tipList.push({ i, w: pr.weld });
        else {
          // the carried box: in the gripper while held, else on the pallet it was last put on
          const tip = fleet.tips[i];
          if (pr.held) place(boxes, bi++, tip.x, tip.y - 0.13, tip.z, 0);
          else place(boxes, bi++, pr.rest.x, TABLE_H + 0.11, pr.rest.z, 0);
        }
      }
      boxes.count = bi;
      boxes.instanceMatrix.needsUpdate = true;
      fleet.commit();
      // arcs + sparks: nearest welding arms to the focus get sparks; all welding arms get an arc core
      const f = focus || camera.position;
      const welding = tipList.filter((x) => x.w > 0.01);
      welding.sort((A, B) => fleet.tips[A.i].distanceToSquared(f) - fleet.tips[B.i].distanceToSquared(f));
      const coreList = welding.map(({ i, w }) => ({ p: fleet.tips[i], k: w * arcFlicker(t, i) * arcGain, size: 1 }));
      cores.userData.set(coreList);
      const emitters = [];
      for (const { i } of tipList.slice().sort((A, B) => fleet.tips[A.i].distanceToSquared(f) - fleet.tips[B.i].distanceToSquared(f)).slice(0, maxSparkArms)) {
        const prog = programs[i].f;
        emitters.push({
          seed: i * 13 + 5, rate: 300, gain: sparkGain,
          tip: (b) => prog(b).S, on: (b) => (weldBoost ? weldBoost(b) : 1) * prog(b).weld, ground: ground(arms[i].cell),
        });
      }
      sparks.userData.update(t, emitters, camera);
      return { welding, tips: fleet.tips };
    },
    tipPos,
  };
}
