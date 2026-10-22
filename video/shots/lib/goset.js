// The game-2 set: table, board, the real position after any move (captures removed), bowls; and the classic
// placing hand (stone on the index nail, middle finger on top). Board space as in engine2/goban.js: top at y = 0,
// Black (AlphaGo, played by the engineer) sits at +z facing -z, White (Lee Sedol) at -z.
import { THREE } from '../../engine2/core.js';
import { buildBoard, buildBowl, at, BOARD } from '../../engine2/goban.js';
import { stoneGeometry, stoneMaterials } from '../../engine2/materials.js';
import { loadHand, setPose } from '../../engine2/hand.js';

let MOVES = null;
export async function gameMoves() {
  if (!MOVES) MOVES = (await (await fetch('../data/go_game2.json')).json()).moves;
  return MOVES;
}

// the stones on the board after n moves: [{ c, i, j, n }] (captured groups removed, as in the game)
export function position(moves, n) {
  const grid = new Map();
  const key = (i, j) => i * 19 + j;
  const nb = (i, j) => [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]].filter(([a, b]) => a >= 0 && a < 19 && b >= 0 && b < 19);
  const group = (i, j) => {
    const c = grid.get(key(i, j)).c;
    const seen = new Set([key(i, j)]), st = [[i, j]];
    let libs = 0;
    while (st.length) {
      const [a, b] = st.pop();
      for (const [x, y] of nb(a, b)) {
        const k = key(x, y), s = grid.get(k);
        if (!s) libs++;
        else if (s.c === c && !seen.has(k)) { seen.add(k); st.push([x, y]); }
      }
    }
    return { seen, libs };
  };
  for (let m = 0; m < Math.min(n, moves.length); m++) {
    const [c, i, j] = moves[m];
    grid.set(key(i, j), { c, i, j, n: m + 1 });
    for (const [x, y] of nb(i, j)) {
      const s = grid.get(key(x, y));
      if (s && s.c !== c) {
        const g = group(x, y);
        if (g.libs === 0) for (const k of g.seen) grid.delete(k);
      }
    }
  }
  return [...grid.values()];
}

// one stone's resting place: the grid point plus the small random offset a hand leaves
export function restPose(st, seed = 5) {
  let s = (seed * 7919 + st.n * 104729) % 2147483647 || 1;
  const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const p = at(st.i, st.j, 0.0046);
  return { p: new THREE.Vector3(p.x + (R() - 0.5) * 0.0016, p.y, p.z + (R() - 0.5) * 0.0016), rot: R() * Math.PI * 2 };
}

export async function buildGoSet(studio, { table = true, bowls = true, wood = 'Wood027' } = {}) {
  const g = new THREE.Group();
  if (table) {
    const t = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshPhysicalMaterial({
      ...studio.pbr(wood, { repeat: [4, 4] }), roughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.3,
    }));
    t.rotation.x = -Math.PI / 2;
    t.position.y = -BOARD.h;
    t.receiveShadow = true;
    g.add(t);
  }
  g.add(await buildBoard(studio));
  const geo = stoneGeometry();
  const mats = stoneMaterials();
  if (bowls) {
    const bb = buildBowl(studio, 'B');
    bb.position.set(0.31, -BOARD.h, 0.2);
    const bw = buildBowl(studio, 'W', { seed: 21 });
    bw.position.set(-0.31, -BOARD.h, -0.2);
    g.add(bb, bw);
  }
  // the stones: a pool of meshes posed for any move count
  const stones = new THREE.Group();
  g.add(stones);
  const moves = await gameMoves();
  const pool = { B: [], W: [] };
  const get = (c, k) => {
    const list = pool[c];
    while (list.length <= k) {
      const m = new THREE.Mesh(geo, c === 'B' ? mats.black : mats.white);
      m.castShadow = m.receiveShadow = true;
      stones.add(m);
      list.push(m);
    }
    return list[k];
  };
  // show the position after n moves; skip: move numbers to leave off the board (a stone in flight);
  // fade(st) -> scale, drop(st) -> height above its rest (m), for stones arriving in a time-lapse
  const show = (n, { skip = [], fade = null, drop = null } = {}) => {
    const used = { B: 0, W: 0 };
    for (const st of position(moves, n)) {
      if (skip.includes(st.n)) continue;
      const m = get(st.c, used[st.c]++);
      const r = restPose(st);
      m.position.copy(r.p);
      if (drop) m.position.y += drop(st);
      m.rotation.set(0, r.rot, 0);
      m.visible = true;
      m.scale.setScalar(fade ? fade(st) : 1);
      m.userData.move = st;
    }
    for (const c of ['B', 'W']) for (let k = used[c]; k < pool[c].length; k++) pool[c][k].visible = false;
  };
  return { group: g, moves, show, geo, mats, at };
}

// ---------------------------------------------------------------- the placing hand
const tip = (h, f) => {
  const b = h.bones[f];
  const leaf = b.getObjectByName(`${f}_leaf`);
  return (leaf || b).getWorldPosition(new THREE.Vector3());
};
const LAT = new THREE.Vector3(1, 0, 0);
// points on the distal phalanx: the nail (dorsal, side = 1) or the pad (palmar, side = -1)
export function fingerPoint(h, f, side, out = 0.0046) {
  h.holder.updateMatrixWorld(true);
  const a = h.bones[f].getWorldPosition(new THREE.Vector3());
  const b = tip(h, f);
  const dir = b.clone().sub(a).normalize();
  const lat = LAT.clone().applyQuaternion(h.holder.quaternion);
  const dorsal = new THREE.Vector3().crossVectors(lat, dir).normalize();
  return { p: a.lerp(b, 0.62).addScaledVector(dorsal, side * out), dorsal };
}

// the grip solved once for the go frames (stone on the index nail, middle pad pressing it, fingertips ~30 degrees
// down, wrist well above): pose and the holder's pitch / yaw
export const GRIP = {
  pose: {
    ring: [1.05, 1.3, 0.8], little: [1.1, 1.3, 0.8], thumb: [0.55, 0.5, 0.45], thumbRoll: 0.35,
    spread: { ring: 0.05, little: 0.12, index: 0.1, middle: -0.5 }, index: [-0.035, -0.05, -0.0225], middle: [-0.35, 0.05, 0.1],
  },
  pitch: -0.45, yaw: 0.25,
};

export async function placingHand(studio, material) {
  const h = await loadHand(studio, material ? { material } : {});
  setPose(h, GRIP.pose);
  h.holder.rotation.set(GRIP.pitch, GRIP.yaw, 0, 'YXZ');
  return h;
}
