// The gridded factory (D24, D28, F43).
// p.mode: 'match' — (D24) opens on a straight top-down of the go board (the game-2 position after move 37), rising;
//                   the board dissolves into the factory floor's painted grid, the lines locked in register (the
//                   floor's 1 m grid has the board's aspect), then the camera keeps rising, pulls back and tilts up to
//                   reveal rows of fenced robot cells welding, sparks falling, haze, cold overhead light.
//                   cues: `factory` (工厂里的机器人) — the tilt-up lands on the rows (default dur * 0.42).
//         'board' — (D28) top-down on an open patch of the floor ringed by robot cells: the 1 m layout grid tightens
//                   into a 19 x 19 go grid (the in-between lines draw out from the centre) and machined flanges drop
//                   onto its intersections like stones (black oxide = black, bright steel = white: the game-2 position
//                   after p.n moves, default 37). cues: `grid` — the go lines start drawing (default dur * 0.18);
//                   `parts` — the first flange lands (default dur * 0.36); `board` (一张棋盘) — the board is complete:
//                   border and star points in, the last flanges down (default dur * 0.8).
//         'cold'  — (F43) a cold, wide, slow high-angle slide down the main aisle, robots welding in their cells.
// p.h0: (match) start height above the board, m (default 0.3: the lines fill the frame)
// p.exposure, p.env, p.key, p.pools, p.fog, p.arc (arc light strength), p.haze (0 = off)
import { Studio, THREE, spot } from '../engine2/core.js';
import { BOARD } from '../engine2/goban.js';
import { buildGoSet, position } from './lib/goset.js';
import { buildFactory, G } from './lib/grid_factory.js';
import { flangeSet } from './lib/grid_parts.js';
import { ss, sstep, clamp, lerp, breathe, grade, V3 } from './lib/kit.js';

const DEG = Math.PI / 180;

export async function create({ renderer, scale, p, dur, cues }) {
  const mode = p.mode || 'match';
  const st = new Studio({ scale, renderer });
  st.camera.far = 400;
  st.camera.near = 0.05;
  st.camera.userData.pxH = st.h;
  st.camera.rotation.order = 'YXZ';
  await st.hdri('../assets/hdri/empty_warehouse_01_2k.hdr', { intensity: p.env ?? 0.25, rotation: 0.4 });
  const fogCol = new THREE.Color(p.fogCol ?? 0x1a232d);
  st.scene.background = fogCol.clone();
  st.scene.fog = new THREE.FogExp2(fogCol, p.fog ?? (mode === 'board' ? 0.012 : 0.024));

  // the board patch (D28): the two inner blocks either side of the main aisle at j = -1, 0 are left open
  const BOARD_C = new THREE.Vector2(0, -4 * G[1]);
  const GO_CELL = [G[0] / 2, G[1] / 2];
  const openBlock = (r, j) => mode === 'board' && (r === 3 || r === 4) && (j === -1 || j === 0);
  const fac = await buildFactory(st, {
    block: (r, j) => (openBlock(r, j) ? null : ((j + r * 2) % 4 === 3 ? 'handle' : 'weld')),
    hazeI: p.haze ?? (mode === 'board' ? 0 : 0.01),
    fixtures: mode !== 'board',
  });
  st.scene.add(fac.group);

  // light: a cold key from high above (the roof lights as one soft source) + pools under every fixture on the floor
  const sun = new THREE.DirectionalLight(0xe6efff, p.key ?? 0.7);
  sun.position.set(4, 30, 7);
  sun.target.position.set(0, 0, -6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -18; sc.right = 18; sc.top = 24; sc.bottom = -24; sc.near = 5; sc.far = 70;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  st.scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xbcd2ec, 0x20262d, p.hemi ?? 0.18);
  st.scene.add(hemi);
  fac.floorMat.userData.u.uPoolCol.value.set(0xdde9ff).multiplyScalar(p.pools ?? 1.8);
  fac.floorMat.userData.u.uRefCol.value.set(0xeaf3ff).multiplyScalar(p.refl ?? (mode === 'board' ? 0 : 1.2));
  // the arcs light their cells: two flickering blue-white point lights ride the nearest torches
  const arcLights = [0, 1].map(() => {
    const l = new THREE.PointLight(0xc4dcff, 0, 7, 2);
    st.scene.add(l);
    return l;
  });

  // D28: the go grid on the floor, the flanges
  let flanges = null, drops = null;
  const tGrid = cues.grid ?? dur * 0.18, tParts = cues.parts ?? dur * 0.36, tBoard = cues.board ?? dur * 0.8;
  if (mode === 'board') {
    const U = fac.floorMat.userData.u;
    U.uGoC.value.copy(BOARD_C);
    U.uGoCell.value.set(...GO_CELL);
    U.uGoW.value = 0.045;
    U.uGoA.value = 1;
    const moves = (await (await fetch('../data/go_game2.json')).json()).moves;
    const pos = position(moves, p.n ?? 37);
    flanges = flangeSet(pos.length);
    st.scene.add(flanges.group);
    // drop order = move order; they land between tParts and tBoard
    const order = pos.slice().sort((a, b) => a.n - b.n);
    const span = Math.max(0.6, tBoard - 0.15 - tParts);
    drops = order.map((s, k) => ({
      ...s, x: BOARD_C.x + (s.i - 9) * GO_CELL[0], z: BOARD_C.y + (s.j - 9) * GO_CELL[1],
      land: tParts + span * (k / Math.max(1, order.length - 1)) ** 0.85, rot: (s.n * 2.399) % (Math.PI * 2),
    }));
  }

  grade(st, {
    ao: p.ao === 0 ? null : { radius: 0.6, intensity: 1.6, falloff: 0.8, samples: 10 },
    bloom: { intensity: 0.6, threshold: 0.85, radius: 0.7 },
    vignette: 0.62, contrast: 0.12, saturation: mode === 'cold' ? -0.22 : -0.12, exposure: p.exposure ?? 1.0,
  });

  // ---------------------------------------------------------------- the go board (match mode only)
  let board = null;
  const tD0 = 0.22, tD1 = cues.dissolve ?? 1.15; // the dissolve
  const tFac = cues.factory ?? dur * 0.42;
  if (mode === 'match') {
    const bs = new Studio({ scale, renderer });
    await bs.hdri('../assets/hdri/studio_small_09_2k.hdr', { intensity: 0.09, rotation: 1.2 });
    bs.scene.background = new THREE.Color(0x030405);
    const set = await buildGoSet(bs);
    bs.scene.add(set.group);
    set.show(p.n ?? 37);
    const key1 = spot(0xffd9b0, 5, { pos: [-0.15, 1.3, -0.05], target: [0.02, 0, 0], angle: 0.42, penumbra: 1.0, radius: 6 });
    bs.scene.add(key1, key1.target);
    bs.camera.rotation.order = 'YXZ';
    bs.camera.near = 0.01;
    bs.post({ ao: { radius: 0.02, intensity: 1.6 }, bloom: { intensity: 0.3, threshold: 0.75 }, vignette: 0.68, contrast: 0.12, saturation: -0.04, exposure: 0.9 });
    await bs.ready();
    board = bs;
  }
  const h0 = p.h0 ?? 0.3, K = 0.2; // the board camera's height: h0 * exp(K t)
  const FOV_B = 30, FOV_F = 60;
  const RATIO = (G[0] / BOARD.dx) * Math.tan((FOV_B / 2) * DEG) / Math.tan((FOV_F / 2) * DEG);
  const mixAt = (t) => ss(clamp((t - tD0) / (tD1 - tD0)));

  // camera rigs
  const setCam = (cam, pos, pitch, fov, yaw = 0, roll = 0) => {
    cam.position.set(...pos);
    cam.rotation.set(pitch, yaw, roll, 'YXZ');
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
  };
  const matchCam = (t) => {
    // the rise: exponential (constant screen-space rate) while top-down, then a crane back and up while tilting
    const hb = h0 * Math.exp(K * t);
    const hf = hb * RATIO;
    const tilt = ss(clamp((t - 0.75) / Math.max(1.2, tFac + 0.9 - 0.75)));
    const tail = clamp((t - tFac - 0.9) / Math.max(0.5, dur - tFac - 0.9));
    const y = lerp(hf, 8.6, tilt) + 0.25 * tail;
    const z = lerp(0, 9.5, ss(clamp((t - 0.6) / Math.max(1.2, tFac + 1.0 - 0.6)))) + 0.9 * tail;
    const pitch = lerp(-90, -27, tilt) * DEG + 1.2 * DEG * tail;
    const fov = lerp(FOV_F, 46, ss(clamp((t - 0.8) / Math.max(1.2, tFac + 1.0 - 0.8))));
    const b = breathe(t, 0.012 * tilt, 4);
    setCam(st.camera, [b[0], y + b[1], z + b[2]], pitch, fov);
    if (board) setCam(board.camera, [0, hb, 0], -90 * DEG, FOV_B);
  };
  const boardCam = (t) => {
    const r = ss(clamp(t / dur));
    const h = lerp(16.2, 14.6, r);
    const b = breathe(t, 0.01, 2);
    setCam(st.camera, [BOARD_C.x + b[0], h, BOARD_C.y + b[1]], -90 * DEG, 40, 0, lerp(-1.2, 0.6, r) * DEG);
  };
  const coldCam = (t) => {
    const r = clamp(t / dur);
    const e = r * 0.85 + ss(r) * 0.15;
    const b = breathe(t, 0.02, 9);
    setCam(st.camera, [lerp(-1.6, 1.2, e) + b[0], 8.2 + b[1], lerp(14.5, 12.5, e) + b[2]], -23 * DEG, 36, lerp(-3.5, 2.5, e) * DEG);
  };

  // render: before the dissolve only the board; during it the factory (+ the board over it in overlay())
  const factoryRender = st.render.bind(st);
  let mixNow = 1;
  st.render = () => (board && mixNow <= 0 ? board.render() : factoryRender());

  return {
    studio: st,
    update(t) {
      if (p.cam) setCam(st.camera, p.cam.pos, p.cam.pitch * DEG, p.cam.fov, (p.cam.yaw || 0) * DEG);
      else if (mode === 'match') matchCam(t);
      else if (mode === 'board') boardCam(t);
      else coldCam(t);
      mixNow = board ? mixAt(t) : 1;
      if (board && mixNow <= 0) return; // the factory is not on screen yet
      st.camera.updateMatrixWorld();
      const look = new THREE.Vector3(0, 0, -1).applyQuaternion(st.camera.quaternion);
      const focus = mode === 'board' ? V3(BOARD_C.x, 0, BOARD_C.y) : st.camera.position.clone().addScaledVector(look, 13);
      const { welding, tips } = fac.update(t, st.camera, { focus });
      arcLights.forEach((l, k) => {
        const w = welding[k];
        if (!w) { l.intensity = 0; return; }
        l.position.copy(tips[w.i]).add(new THREE.Vector3(0, 0.12, 0));
        l.intensity = (p.arc ?? 6) * w.w * (0.5 + 0.5 * Math.sin(t * 61 + k * 2.1) ** 2) * (0.7 + 0.3 * Math.sin(t * 23 + k));
      });
      if (mode === 'board') {
        const U = fac.floorMat.userData.u;
        U.uGoDraw.value = ss(clamp((t - tGrid) / Math.max(0.5, tBoard - 0.25 - tGrid)));
        U.uGoOut.value = ss(clamp((t - tGrid - 0.3) / Math.max(0.5, tBoard - tGrid)));
        U.uGoStar.value = sstep(tBoard - 0.25, tBoard + 0.1, t);
        flanges.pose(drops, t);
      }
    },
    overlay(g, t) {
      if (!board || mixNow <= 0 || mixNow >= 1) return;
      board.render();
      g.save();
      g.globalAlpha *= 1 - mixNow;
      g.drawImage(renderer.domElement, 0, 0, 1920, 1080);
      g.restore();
    },
    dispose() { if (board) board.dispose(); },
  };
}
