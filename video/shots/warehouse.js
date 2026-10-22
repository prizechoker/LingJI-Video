// The robotic warehouse (D29, D30): a floor covered by a regular grid of fiducial codes (one per 1.2 m cell),
// storage blocks of shelving pods, Kiva-style drive units carrying pods along the grid lines and turning 90 degrees
// in place, tall pallet racking around the field, cool LED light rows.
// p.mode: 'wide' — a high angle over the field, drifting; units cross on the lanes, two of them turn at intersections.
//         'low'  — low down a lane between pod blocks: a unit carrying a pod rolls over the codes toward the camera,
//                  stops, turns 90 degrees in place and leaves along the cross lane.
// cues: `codes` (贴满二维码) — a scan pulse runs over the floor lighting the codes' white modules, leaving them faintly
//         lit (default dur * 0.25); `grid` (格子里走) — the grid lines between the codes light up, the paths of the
//         units with them (default dur * 0.62).
// p.exposure, p.pulse (pulse strength), p.dof
import { Studio, THREE, spot } from '../engine2/core.js';
import { gridFloorMaterial, floorPlane } from './lib/grid_floor.js';
import { codeField } from './lib/grid_codes.js';
import { warehouseMaterials, unitGeometry, podGeometry, rackBayGeometry, schedule, UNIT, POD } from './lib/grid_warehouse.js';
import { ss, sstep, clamp, lerp, breathe, grade, V3, rng } from './lib/kit.js';

const DEG = Math.PI / 180;
const C = 1.2; // grid cell (m)

export async function create({ renderer, scale, p, dur, cues }) {
  const mode = p.mode || 'wide';
  const st = new Studio({ scale, renderer });
  st.camera.far = 300;
  st.camera.near = 0.05;
  st.camera.rotation.order = 'YXZ';
  await st.hdri('../assets/hdri/empty_warehouse_01_2k.hdr', { intensity: p.env ?? 0.3, rotation: 1.1 });
  const fogCol = new THREE.Color(0x1b232b);
  st.scene.background = fogCol.clone();
  st.scene.fog = new THREE.FogExp2(fogCol, p.fog ?? 0.022);
  const M = warehouseMaterials(st);

  // ---------------------------------------------------------------- the floor and its codes
  const NX = 13, NZ = 12; // nodes from -NX..NX, -NZ..NZ
  const fl = gridFloorMaterial(st, {
    texture: 'Concrete047A', tile: 6, tint: 0x8a939c, cell: [C, C], origin: [0, 0], lineW: 0.025, paint: 0xaab4bd, paintA: 0.5, wear: 0.2,
    texMix: 0.45, texMean: 0xa4a197, blotch: 0.3, roughness: 0.5, clearcoat: 0, normalScale: 0.4,
    pools: { pitch: [6 * C, 2.5 * C], offset: [0, 0], radius: [2.2, 2.8], color: 0xdfeaff, intensity: p.pools ?? 1.25, rect: [-20, -20, 20, 20] },
    refl: { intensity: p.refl ?? 0.7, height: 12, pitch: [6 * C, 2.5 * C], offset: [0, 0], half: [0.05, 1.1], blur: 0.02 },
  });
  const floor = new THREE.Mesh(floorPlane(90, 90, 0, -10), fl);
  floor.receiveShadow = true;
  st.scene.add(floor);
  const nodes = [];
  for (let i = -NX; i <= NX; i++) for (let j = -NZ; j <= NZ; j++) nodes.push([i * C, j * C]);
  const codes = codeField(nodes, { size: mode === 'low' ? 0.26 : 0.28 });
  st.scene.add(codes.mesh);

  // ---------------------------------------------------------------- pods: storage blocks between lanes
  const isLaneX = (i) => i % 3 === 0; // lanes run along z at i = 0, +-3, +-6 ...
  const isLaneZ = (j) => j % 5 === 0; // and along x at j = 0, +-5, +-10
  const storage = [];
  // wide: an open highway zone of bare codes in front, storage behind and at the sides; low: blocks line the lane
  const stored = mode === 'low'
    ? (i, j) => !isLaneX(i) && !isLaneZ(j)
    : (i, j) => !isLaneX(i) && !isLaneZ(j) && (j <= -6 || Math.abs(i) >= 10);
  for (let i = -NX + 1; i <= NX - 1; i++) for (let j = -NZ + 1; j <= NZ - 1; j++) if (stored(i, j)) storage.push([i, j]);

  // the moving units: [start i, j, heading, t0, moves, carrying]
  const L = 'L', R = 'R', F = 'F', W = 'W';
  const tCodes = cues.codes ?? dur * 0.25, tGrid = cues.grid ?? dur * 0.62;
  // the hero (low mode) arrives at the cross lane on the `grid` cue, turns there and leaves
  const heroDrive = 5, heroSpeed = 2.0, heroAcc = 1.4;
  const heroT = (() => { const ta = heroSpeed / heroAcc, da = 0.5 * heroAcc * ta * ta, d = heroDrive * C; return 2 * da >= d ? 2 * Math.sqrt(d / heroAcc) : 2 * ta + (d - 2 * da) / heroSpeed; })();
  const runs = mode === 'low'
    ? [
      { i: 0, j: -5, h: -90 * DEG, t0: tGrid - heroT - 0.15, moves: [[F, heroDrive], [W, 0.15], [L], [W, 0.1], [F, 3]], pod: true, hero: true, speed: heroSpeed, acc: heroAcc },
      { i: 3, j: 4, h: 90 * DEG, t0: 0.6, moves: [[F, 9]], pod: true },
      { i: -3, j: -10, h: -90 * DEG, t0: 0.2, moves: [[F, 5], [R], [F, 2]], pod: false },
      { i: -6, j: 5, h: 0, t0: 1.0, moves: [[F, 4]], pod: true },
    ]
    : [
      { i: 0, j: 7, h: 90 * DEG, t0: 0, moves: [[F, 5], [W, 0.3], [R], [F, 4]], pod: true },
      { i: -6, j: -4, h: -90 * DEG, t0: 0.3, moves: [[F, 4], [L], [F, 4]], pod: true },
      { i: -8, j: 4, h: 0, t0: 0.0, moves: [[F, 5], [W, 0.2], [L], [F, 3]], pod: true },
      { i: 6, j: -3, h: -90 * DEG, t0: 0.5, moves: [[F, 3], [R], [F, 2]], pod: true },
      { i: 8, j: 8, h: 180 * DEG, t0: 0.2, moves: [[F, 5]], pod: false },
      { i: 3, j: 9, h: 90 * DEG, t0: 1.0, moves: [[F, 4], [L], [F, 3]], pod: true },
      { i: -3, j: -2, h: -90 * DEG, t0: 0.6, moves: [[F, 4], [R], [F, 2]], pod: false },
      { i: 9, j: 2, h: 180 * DEG, t0: 0.4, moves: [[F, 3], [W, 0.4], [R], [F, 2]], pod: true },
      { i: -9, j: 9, h: 0, t0: 1.4, moves: [[F, 4]], pod: false },
    ];
  const units = runs.map((r) => ({ ...r, sch: schedule({ x: r.i * C, z: r.j * C, heading: r.h, t0: r.t0, moves: r.moves, cell: C, speed: r.speed ?? 1.5, acc: r.acc ?? 1.6 }) }));
  if (p.debug) {
    // collision check: units closer than 1.05 m (centre to centre), pods passing over stored pods
    const occ = new Set(storage.map(([i, j]) => `${i},${j}`));
    for (let t = 0; t <= dur; t += 0.05) {
      const P = units.map((u) => u.sch.pose(t));
      for (let a = 0; a < P.length; a++) {
        for (let b = a + 1; b < P.length; b++) {
          const d = Math.hypot(P[a].x - P[b].x, P[a].z - P[b].z);
          if (d < 1.05) console.log('collide', t.toFixed(2), a, b, d.toFixed(2));
        }
        const ni = Math.round(P[a].x / C), nj = Math.round(P[a].z / C);
        if (occ.has(`${ni},${nj}`) && Math.hypot(P[a].x - ni * C, P[a].z - nj * C) < 0.9) console.log('through storage', t.toFixed(2), a, ni, nj);
      }
    }
  }
  const nPods = storage.length + units.filter((u) => u.pod).length;
  const podGeo = podGeometry();
  const podMeshes = M.pods.map((mats) => {
    const m = new THREE.InstancedMesh(podGeo, mats, nPods);
    m.castShadow = m.receiveShadow = true;
    m.frustumCulled = false;
    m.count = 0;
    st.scene.add(m);
    return m;
  });
  const unitMesh = new THREE.InstancedMesh(unitGeometry(), M.unit, units.length);
  unitMesh.castShadow = unitMesh.receiveShadow = true;
  unitMesh.frustumCulled = false;
  st.scene.add(unitMesh);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = V3(0, 1, 0), pp = V3(), one = V3(1, 1, 1);
  const RR = rng(11);
  const storeRot = storage.map(() => (RR() - 0.5) * 0.03);
  const storeVar = storage.map(() => Math.floor(RR() * 3));
  const unitVar = units.map(() => Math.floor(RR() * 3));
  // a unit's own storage spot stays empty while it is out
  const homes = new Set();
  // static pods
  const podCount = [0, 0, 0];
  storage.forEach(([i, j], k) => {
    const v = storeVar[k];
    q.setFromAxisAngle(Y, storeRot[k]);
    podMeshes[v].setMatrixAt(podCount[v]++, m4.compose(pp.set(i * C, 0, j * C), q, one));
  });
  const staticCount = podCount.slice();

  // ---------------------------------------------------------------- racking around the field
  const bays = [];
  for (let k = -6; k <= 6; k++) bays.push([k * 2.75, (-NZ - 2.2) * C, 0]); // behind (-z)
  for (let k = -5; k <= 5; k++) bays.push([(-NX - 2.4) * C, k * 2.75 - 3, Math.PI / 2], [(NX + 2.4) * C, k * 2.75 - 3, Math.PI / 2]);
  const rackMesh = new THREE.InstancedMesh(rackBayGeometry(5), M.rack, bays.length);
  rackMesh.castShadow = rackMesh.receiveShadow = true;
  rackMesh.frustumCulled = false;
  bays.forEach(([x, z, yaw], k) => { q.setFromAxisAngle(Y, yaw); rackMesh.setMatrixAt(k, m4.compose(pp.set(x, 0, z), q, one)); });
  st.scene.add(rackMesh);

  // ---------------------------------------------------------------- light: LED rows (emissive bars), a soft cool key
  const fx = [];
  for (let i = -2; i <= 2; i++) for (let j = -7; j <= 4; j++) fx.push([i * 6 * C, j * 2.5 * C]);
  const barMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xeef5ff).multiplyScalar(5), toneMapped: false });
  const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.04, 2.2), barMat, fx.length);
  fx.forEach(([x, z], k) => bars.setMatrixAt(k, m4.makeTranslation(x, 12, z)));
  bars.frustumCulled = false;
  st.scene.add(bars);
  const key = new THREE.DirectionalLight(0xe8f0ff, p.key ?? 0.6);
  key.position.set(-6, 22, 9);
  key.target.position.set(0, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 5, far: 60 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 4;
  st.scene.add(key, key.target);
  st.scene.add(new THREE.HemisphereLight(0xc6d8ee, 0x262b31, p.hemi ?? 0.18));

  grade(st, {
    ao: { radius: mode === 'low' ? 0.25 : 0.5, intensity: 1.5, falloff: 0.8 },
    dof: mode === 'low' && p.dof !== false ? { distance: 6, range: p.range ?? 5, bokeh: p.bokeh ?? 2.5 } : null,
    bloom: { intensity: 0.5, threshold: 0.85, radius: 0.7 },
    vignette: 0.6, contrast: 0.1, saturation: -0.14, exposure: p.exposure ?? 1.0,
  });

  // ---------------------------------------------------------------- cues
  const hero = units.find((u) => u.hero);
  const camWide = (t) => {
    const r = ss(clamp(t / dur));
    const b = breathe(t, 0.015, 3);
    const pos = [lerp(-3.2, -1.8, r) + b[0], lerp(9.6, 9.3, r) + b[1], lerp(14.5, 13.6, r) + b[2]];
    const look = [lerp(0.2, 0.9, r), 0, lerp(1.0, 0.4, r)];
    const dx = look[0] - pos[0], dy = look[1] - pos[1], dz = look[2] - pos[2];
    st.camera.position.set(...pos);
    st.camera.rotation.set(Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0, 'YXZ');
    if (st.camera.fov !== 46) { st.camera.fov = 46; st.camera.updateProjectionMatrix(); }
  };
  const camLow = (t) => {
    const r = ss(clamp(t / dur));
    const b = breathe(t, 0.004, 5);
    const pos = [lerp(-0.3, -0.22, r) + b[0], lerp(0.95, 1.0, r) + b[1], lerp(5.4, 5.0, r) + b[2]];
    st.camera.position.set(...pos);
    st.camera.rotation.set(lerp(-13, -14, r) * DEG, lerp(-3, -1, r) * DEG, 0, 'YXZ');
    if (st.camera.fov !== 38) { st.camera.fov = 38; st.camera.updateProjectionMatrix(); }
  };

  return {
    studio: st,
    update(t) {
      if (mode === 'low') camLow(t); else camWide(t);
      // units and the pods they carry (pods do not turn with the unit: the turntable counter-rotates)
      const cnt = staticCount.slice();
      units.forEach((u, k) => {
        const s = u.sch.pose(t);
        q.setFromAxisAngle(Y, s.yaw);
        const lift = u.pod ? POD.lift : 0;
        unitMesh.setMatrixAt(k, m4.compose(pp.set(s.x, 0, s.z), q, one));
        if (u.pod) {
          const v = unitVar[k];
          q.setFromAxisAngle(Y, u.h);
          podMeshes[v].setMatrixAt(cnt[v]++, m4.compose(pp.set(s.x, lift, s.z), q, one));
        }
      });
      unitMesh.instanceMatrix.needsUpdate = true;
      podMeshes.forEach((m, v) => { m.count = cnt[v]; m.instanceMatrix.needsUpdate = true; });
      if (st.dof && hero) {
        const s = hero.sch.pose(t);
        st.dof.target = V3(s.x, 0.5, s.z);
      }
      // the scan pulse over the codes
      const speed = mode === 'low' ? 7 : 8.5;
      const origin = mode === 'low' ? [0, -16] : [0.2, 6];
      const age = t - tCodes;
      codes.set({
        origin, radius: age > 0 ? age * speed : -100, width: mode === 'low' ? 1.1 : 1.3, gain: (p.pulse ?? 5) * (age > 0 ? Math.exp(-age * 0.35) : 0),
        after: age > 0 ? (p.after ?? 0.55) * (0.35 + 0.65 * Math.exp(-age * 0.9)) : 0,
      });
      // under each moving unit, its downward camera reads the code it is crossing (a quick cool flash)
      codes.glow((x, z) => {
        let g = 0;
        for (const u of units) {
          const s = u.sch.pose(t);
          const d2 = (x - s.x) ** 2 + (z - s.z) ** 2;
          if (d2 < 0.36) g = Math.max(g, s.v * Math.exp(-d2 / 0.05) * 0.5);
        }
        return g;
      });
      // the grid lines light up
      const ga = t - tGrid;
      fl.userData.u.uGlow.value = ga > 0 ? (p.glow ?? 1.4) * (0.3 + 0.7 * Math.exp(-ga * 1.6)) * sstep(0, 0.25, ga) : 0;
    },
  };
}
