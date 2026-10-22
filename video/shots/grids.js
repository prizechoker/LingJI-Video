// Three grids become one (D33): a slab of factory floor (painted 1 m grid, two machined flanges on it), a slab of
// warehouse floor (a fiducial code on every node, a drive unit), and a dishwasher rack's wire grid float in the dark
// as specimens, each scaled so its cell is the go board's. They turn into register, the stack closes up, and each
// layer dissolves into the one beneath until only the go board's grid is left, seen straight down.
// cues: `not` (靠的大多不是) — the layers start turning into register (default dur * 0.3);
//       `but` (而是我们) — aligned, the stack closes up and the camera comes round to straight down (default dur * 0.58);
//       `simple` (变简单了) — the last layer dissolves: the clean board grid (default dur * 0.82).
// p.labels (true: small captions naming the layers early on), p.exposure
import { Studio, THREE, spot } from '../engine2/core.js';
import { buildBoard, BOARD } from '../engine2/goban.js';
import { gridFloorMaterial, floorPlane } from './lib/grid_floor.js';
import { codeField } from './lib/grid_codes.js';
import { rackGeometry, rackMaterials } from './lib/grid_dish.js';
import { flangeGeometry, flangeMaterials } from './lib/grid_parts.js';
import { armFleet, armMaterials, solveArm } from './lib/grid_arm.js';
import { buildBowl, porcelainMaterial } from '../engine2/dishes.js';
import { unitGeometry, warehouseMaterials } from './lib/grid_warehouse.js';
import { ss, sstep, clamp, lerp, breathe, grade, V3, caption, toScreen, callout } from './lib/kit.js';

const DEG = Math.PI / 180;
const D = 0.1; // the shared display cell
const S = 18 * D; // a layer is 18 cells across (the board's 19 lines)

// set the opacity of everything in a group (materials are per-layer clones)
function fader(group) {
  const mats = new Set();
  group.traverse((o) => {
    if (!o.isMesh) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    const cl = list.map((m) => { const c = m.clone(); c.onBeforeCompile = m.onBeforeCompile; c.customProgramCacheKey = m.customProgramCacheKey; c.transparent = true; mats.add(c); return c; });
    o.material = Array.isArray(o.material) ? cl : cl[0];
  });
  return (a) => {
    for (const m of mats) { m.opacity = a; m.depthWrite = a > 0.98; m.visible = a > 0.003; }
  };
}

export async function create({ renderer, scale, p, dur, cues }) {
  const st = new Studio({ scale, renderer });
  st.camera.near = 0.05;
  st.camera.far = 50;
  st.camera.rotation.order = 'YXZ';
  await st.hdri('../assets/hdri/studio_small_09_2k.hdr', { intensity: p.env ?? 0.4, rotation: 0.8 });
  st.scene.background = new THREE.Color(0x040506);

  // ---------------------------------------------------------------- the factory slab (1 m grid -> D)
  const factory = new THREE.Group();
  {
    const top = gridFloorMaterial(st, {
      texture: 'Concrete047A', tile: 5, tint: 0xe2e8ee, cell: [1, 1], lineW: 0.13, paint: 0x1d2024, paintA: 0.92, wear: 0.25,
      texMix: 0.5, texMean: 0xa4a197, roughness: 0.62, clearcoat: 0, local: 1 / D * 1.0,
    });
    const m = new THREE.Mesh(floorPlane(S, S), top);
    m.receiveShadow = true;
    factory.add(m);
    const side = new THREE.MeshStandardMaterial({ ...st.pbr('Concrete047A', { repeat: [3, 0.15] }), color: 0x8d949b, roughness: 0.9 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(S, 0.07, S).translate(0, -0.0352, 0), side);
    body.receiveShadow = true;
    factory.add(body);
    // a welding robot on its riser at a grid point (the slab is the factory at 1:10), working on a flange
    const arm = new THREE.Group();
    arm.scale.setScalar(D);
    const fleet = armFleet([{ x: 6, z: 5, yaw: 0.6, tool: 'torch' }], { mats: armMaterials({ paint: 0xd3d8de }) });
    arm.add(fleet.group);
    factory.add(arm);
    factory.userData.fleet = fleet;
    // two machined flanges on intersections (scaled with the floor)
    const fm = flangeMaterials();
    for (const [i, j, c] of [[7, 3, 'B'], [5, 2, 'W'], [-5, 3, 'W']]) {
      const f = new THREE.Mesh(flangeGeometry(), fm[c]);
      f.scale.setScalar(D);
      f.position.set(i * D, 0, j * D);
      f.rotation.y = i * 1.3;
      f.castShadow = f.receiveShadow = true;
      factory.add(f);
    }
  }
  // ---------------------------------------------------------------- the warehouse slab (1.2 m grid -> D)
  const warehouse = new THREE.Group();
  {
    const top = gridFloorMaterial(st, {
      texture: 'Concrete047A', tile: 6, tint: 0x8a939c, cell: [1.2, 1.2], lineW: 0.09, paint: 0xaab4bd, paintA: 0.55, wear: 0.2,
      texMix: 0.45, texMean: 0xa4a197, roughness: 0.5, clearcoat: 0, local: 1.2 / D,
    });
    const m = new THREE.Mesh(floorPlane(S, S), top);
    m.receiveShadow = true;
    warehouse.add(m);
    const side = new THREE.MeshStandardMaterial({ ...st.pbr('Concrete047A', { repeat: [3, 0.15] }), color: 0x6f777f, roughness: 0.9 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(S, 0.05, S).translate(0, -0.0252, 0), side);
    body.receiveShadow = true;
    warehouse.add(body);
    const nodes = [];
    for (let i = -9; i <= 9; i++) for (let j = -9; j <= 9; j++) nodes.push([i * D, j * D]);
    const codes = codeField(nodes, { size: 0.28 / 12 * 1.0 });
    warehouse.add(codes.mesh);
    const M = warehouseMaterials(st);
    const u = new THREE.Mesh(unitGeometry(), M.unit);
    u.scale.setScalar(D / 1.2);
    u.position.set(-3 * D, 0, 2 * D);
    u.rotation.y = Math.PI / 2;
    u.castShadow = true;
    warehouse.add(u);
  }
  // ---------------------------------------------------------------- the rack layer (its wires on D)
  const rack = new THREE.Group();
  {
    const tines = [];
    for (const x of [-0.6, -0.3, 0.3, 0.6]) tines.push({ x, z0: -0.8, z1: 0.8, n: 17, h: 0.16, lean: 0.1 });
    const g = rackGeometry({ w: S, d: S, h: 0.22, pitch: D, tines, wheels: false, rs: 2.6, wallPitch: D });
    const m = new THREE.Mesh(g, rackMaterials());
    m.castShadow = m.receiveShadow = true;
    rack.add(m);
    // two rice bowls slotted in the tines (at the rack's scale a bowl spans five cells)
    const k = D / 0.024;
    for (const [x, z] of [[0.45, 0.42], [0.45, -0.2]]) {
      const b = buildBowl(porcelainMaterial());
      b.scale.setScalar(k * 0.9);
      b.rotation.set(Math.PI - 0.95, 0, 0);
      b.position.set(x, 0.28, z);
      rack.add(b);
    }
  }
  // ---------------------------------------------------------------- the board (cells scaled to D)
  const board = new THREE.Group();
  {
    const b = await buildBoard(st);
    b.scale.set(D / BOARD.dx, D / BOARD.dx, D / BOARD.dz);
    board.add(b);
  }
  st.scene.add(factory, warehouse, rack, board);
  const fades = { factory: fader(factory), warehouse: fader(warehouse), rack: fader(rack) };

  // ---------------------------------------------------------------- light
  const key = spot(0xe9f1ff, p.key ?? 110, { pos: [-2.6, 6.2, 5.0], target: [0, 0.1, 0], angle: 0.42, penumbra: 0.85, shadow: 2048, radius: 4, near: 2, far: 16 });
  const rim = spot(0x9fc6ff, p.rim ?? 30, { pos: [2.6, 2.2, -4.2], target: [0, 0.3, 0], angle: 0.5, penumbra: 0.9, shadow: 0 });
  st.scene.add(key, key.target, rim, rim.target);

  grade(st, {
    ao: { radius: 0.05, intensity: 1.4, falloff: 0.6 },
    dof: { distance: 5, range: p.range ?? 3.5, bokeh: p.bokeh ?? 1.2 },
    bloom: { intensity: 0.35, threshold: 0.85, radius: 0.6 },
    vignette: 0.6, contrast: 0.12, saturation: -0.06, exposure: p.exposure ?? 1.0,
  });

  const tNot = cues.not ?? dur * 0.3, tBut = cues.but ?? dur * 0.58, tSimple = cues.simple ?? dur * 0.82;
  // layer layout before alignment: stacked high to low (rack, warehouse, factory, board at the bottom), offset, turned
  const L = [
    { g: rack, y0: 1.25, off: [0.55, -0.35], yaw: 24 * DEG, f: fades.rack },
    { g: warehouse, y0: 0.62, off: [-0.5, 0.25], yaw: -17 * DEG, f: fades.warehouse },
    { g: factory, y0: 0.0, off: [0.35, 0.45], yaw: 9 * DEG, f: fades.factory },
  ];
  const BOARD_Y = -0.62; // the board waits beneath the stack (its top surface)

  return {
    studio: st,
    update(t) {
      // alignment and closing
      const al = ss(clamp((t - tNot) / Math.max(0.6, tBut - tNot)));
      const cl = ss(clamp((t - tBut) / Math.max(0.6, tSimple - tBut)));
      const drift = (k) => [0.04 * Math.sin(t * 0.4 + k * 2), 0.02 * Math.sin(t * 0.55 + k)];
      L.forEach((l, k) => {
        const d = drift(k);
        const y = lerp(l.y0 - BOARD_Y, 0.0, cl) * 1 + BOARD_Y + 0.004 * (3 - k) * (1 - cl) + 0.0015 * (3 - k);
        l.g.position.set(lerp(l.off[0], 0, al) + d[0] * (1 - al), y + d[1] * (1 - al), lerp(l.off[1], 0, al));
        l.g.rotation.y = lerp(l.yaw + 0.05 * Math.sin(t * 0.3 + k), 0, al);
        // each layer dissolves into the next as the stack lands, top first
        const t0 = lerp(tBut, tSimple, [0.55, 0.8, 0.98][k]);
        l.f(1 - ss(clamp((t - t0) / 0.6)));
      });
      board.position.set(0, BOARD_Y, 0);
      {
        const fl = factory.userData.fleet;
        const w = 0.5 * Math.sin(t * 0.9);
        const tgt = fl.toArm(0, V3(7.0 + 0.12 * w, 0.09, 3.0 + 0.1 * w));
        fl.begin();
        fl.pose(0, solveArm(tgt, 0.3, 'torch'));
        fl.commit();
      }
      // camera: a three-quarter view of the stack, coming round to straight down over the board
      const top = ss(clamp((t - tNot - 0.3) / Math.max(1.2, tSimple + 0.3 - tNot)));
      const el = lerp(32, 90, top) * DEG;
      const az = lerp(-28, 0, top) * DEG + 0.04 * Math.sin(t * 0.2) * (1 - top);
      const dist = lerp(6.8, 4.0, top) - 0.25 * ss(clamp((t - tSimple) / Math.max(0.5, dur - tSimple)));
      const look = V3(0, lerp(0.25, BOARD_Y, top), 0);
      const b = breathe(t, 0.004 * (1 - top), 2);
      const pos = V3(look.x + dist * Math.cos(el) * Math.sin(az) + b[0], look.y + dist * Math.sin(el) + b[1], look.z + dist * Math.cos(el) * Math.cos(az) + b[2]);
      st.camera.position.copy(pos);
      const dx = look.x - pos.x, dy = look.y - pos.y, dz = look.z - pos.z;
      st.camera.rotation.set(Math.atan2(dy, Math.hypot(dx, dz)), top > 0.999 ? 0 : Math.atan2(-dx, -dz), 0, 'YXZ');
      if (st.camera.fov !== 34) { st.camera.fov = 34; st.camera.updateProjectionMatrix(); }
      if (st.dof) { st.dof.target = look.clone(); }
    },
    overlay(g, t) {
      if (p.labels === false) return;
      const a0 = sstep(0.5, 1.1, t) * (1 - sstep(tNot + 0.2, tNot + 0.9, t));
      if (a0 <= 0.001) return;
      st.camera.updateMatrixWorld();
      const names = [['洗碗机', 'DISHWASHER'], ['仓库', 'WAREHOUSE'], ['工厂', 'FACTORY']];
      L.forEach((l, k) => {
        // each layer is named at a free corner, the text running outward
        const right = k === 2;
        const corner = new THREE.Vector3(right ? S / 2 : -S / 2, 0.01, S / 2).applyEuler(l.g.rotation).add(l.g.position);
        const [x, y] = toScreen(st.camera, corner);
        caption(g, x + (right ? 24 : -24), y + 4, { zh: names[k][0], en: names[k][1], a: a0 * sstep(0.5 + k * 0.25, 1.2 + k * 0.25, t), color: [220, 232, 244], align: right ? 'left' : 'right', rule: 70, zhSize: 28, enSize: 14 });
      });
    },
  };
}
