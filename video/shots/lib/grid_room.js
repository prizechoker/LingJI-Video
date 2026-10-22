// A lived-in living room seen from above (for the robot vacuum): oak plank floor, a rug, a three-seat sofa with
// cushions and a throw, an armchair, a coffee table with a book and a mug, a dining table with four chairs, a TV
// console, a bookshelf, a floor lamp, a big potted plant; walls with window openings. Room space: floor y = 0,
// the room spans x in [-3.6, 3.6], z in [-2, 2]; windows in the +x wall.
import { THREE } from '../../engine2/core.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from './kit.js';

export const ROOM = { x0: -3.6, x1: 3.6, z0: -2.0, z1: 2.0, wall: 0.16, h: 2.6 };

const rb = (w, h, d, r, x, y, z, seg = 4) => new RoundedBoxGeometry(w, h, d, seg, r).translate(x, y, z);
// a cushion: a rounded box whose top and front bulge a little, with a crease along the middle
function cushion(w, h, d, x, y, z, { bulge = 0.03, r = 0.05, yaw = 0 } = {}) {
  const g = new RoundedBoxGeometry(w, h, d, 6, r);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const X = p.getX(i) / (w / 2), Y = p.getY(i) / (h / 2), Z = p.getZ(i) / (d / 2);
    const k = Math.max(0, 1 - X * X) * Math.max(0, 1 - Z * Z);
    if (Y > 0) p.setY(i, p.getY(i) + bulge * k * Y);
    p.setX(i, p.getX(i) * (1 - 0.02 * Math.max(0, Y)));
  }
  g.computeVertexNormals();
  if (yaw) g.rotateY(yaw);
  return g.translate(x, y, z);
}
const flat = (g) => {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
  return n;
};
const merge = (list) => mergeGeometries(list.map(flat));

export async function buildRoom(st, { seed = 3 } = {}) {
  const R = rng(seed);
  const group = new THREE.Group();
  const add = (geo, mat, { cast = true, recv = true, name = '' } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast; m.receiveShadow = recv; m.name = name;
    group.add(m);
    return m;
  };
  // ---------------------------------------------------------------- materials
  const floorTex = st.pbr('WoodFloor051', { repeat: [3, 3] });
  const floorMat = new THREE.MeshPhysicalMaterial({ ...floorTex, roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.35 });
  floorMat.color.setRGB(1.0, 1.0, 1.04);
  const rugTex = st.pbr('Carpet012', { repeat: [3, 2.2] });
  const rugMat = new THREE.MeshStandardMaterial({ ...rugTex, color: 0xffffff, roughness: 1 });
  rugMat.color.setRGB(1.35, 1.38, 1.4);
  const sofaTex = st.pbr('Fabric030', { repeat: [2, 2] });
  const sofaMat = new THREE.MeshPhysicalMaterial({ ...sofaTex, color: 0xa79b8c, roughness: 0.95, sheen: 0.6, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xd8cfc4) });
  const chairFab = st.pbr('Fabric082A', { repeat: [2, 2] });
  const armMat = new THREE.MeshPhysicalMaterial({ ...chairFab, color: 0x5f7464, roughness: 0.95, sheen: 0.5, sheenColor: new THREE.Color(0x9fb3a2) });
  const throwMat = new THREE.MeshPhysicalMaterial({ ...chairFab, color: 0xc9a77c, roughness: 0.95, sheen: 0.6, sheenColor: new THREE.Color(0xf0dcc0) });
  const oak = st.pbr('Wood022', { repeat: [1, 1] });
  const oakMat = new THREE.MeshPhysicalMaterial({ ...oak, color: 0xe8dccb, roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.3 });
  const walnut = st.pbr('Wood026', { repeat: [1, 1] });
  const walnutMat = new THREE.MeshPhysicalMaterial({ ...walnut, color: 0xb5a89c, roughness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.25 });
  const blackMetal = new THREE.MeshStandardMaterial({ color: 0x1c1d1f, roughness: 0.45, metalness: 0.7 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xe9e4dc, roughness: 0.9 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x2b2a28, roughness: 0.9 });
  const ceramic = new THREE.MeshPhysicalMaterial({ color: 0xece8e1, roughness: 0.25, clearcoat: 0.6 });
  const leafMat = new THREE.MeshPhysicalMaterial({ color: 0x3f6b3a, roughness: 0.55, side: THREE.DoubleSide, sheen: 0.3, sheenColor: new THREE.Color(0x9cc28c) });
  const bookMats = [0x8c3b2e, 0x2f4a66, 0xd9cdb5, 0x3c5a43, 0x1d1d1f].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }));
  const shadeMat = new THREE.MeshPhysicalMaterial({ color: 0xf3ead9, roughness: 0.8, transmission: 0, side: THREE.DoubleSide, emissive: 0x000000 });
  const tvMat = new THREE.MeshPhysicalMaterial({ color: 0x0b0c0d, roughness: 0.1, clearcoat: 1 });
  const mats = { floorMat, rugMat, sofaMat, armMat, throwMat, oakMat, walnutMat, blackMetal, wallMat, capMat, ceramic, leafMat, shadeMat, tvMat, ...Object.fromEntries(bookMats.map((m, i) => [`book${i}`, m])) };

  // ---------------------------------------------------------------- floor, walls (windows in the +x wall)
  const { x0, x1, z0, z1, wall, h } = ROOM;
  const fg = new THREE.PlaneGeometry(x1 - x0 + 0.4, z1 - z0 + 0.4).rotateX(-Math.PI / 2);
  // uv in metres / 3 so the planks keep a real size
  const uv = fg.attributes.uv, fp = fg.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, fp.getX(i) / 3.0, fp.getZ(i) / 3.0);
  const floor = add(fg, floorMat, { cast: false, name: 'floor' });
  const wallBox = (w, d, x, z, y0 = 0, y1 = h) => {
    add(new THREE.BoxGeometry(w, y1 - y0, d).translate(x, (y0 + y1) / 2, z), wallMat);
    add(new THREE.BoxGeometry(w + 0.002, 0.01, d + 0.002).translate(x, y1 + 0.005, z), capMat, { cast: false });
  };
  wallBox(x1 - x0 + 2 * wall, wall, 0, z0 - wall / 2); // back
  wallBox(x1 - x0 + 2 * wall, wall, 0, z1 + wall / 2); // front
  wallBox(wall, z1 - z0, x0 - wall / 2, 0); // left
  // right wall with two tall windows: piers between, a sill and a lintel
  const wins = [[-1.45, -0.45], [0.35, 1.35]];
  let zc = z0;
  for (const [a, b] of wins) {
    wallBox(wall, a - zc, x1 + wall / 2, (zc + a) / 2);
    wallBox(wall, b - a, x1 + wall / 2, (a + b) / 2, 0, 0.45);
    wallBox(wall, b - a, x1 + wall / 2, (a + b) / 2, 2.25, h);
    zc = b;
  }
  wallBox(wall, z1 - zc, x1 + wall / 2, (zc + z1) / 2);

  // ---------------------------------------------------------------- rug
  const rug = add(rb(2.6, 0.012, 1.7, 0.004, -1.0, 0.006, -0.42, 1), rugMat, { cast: false, name: 'rug' });

  // ---------------------------------------------------------------- sofa: frame, seat cushions, back cushions, arms
  const sx = -1.0, sz = z0 + 0.5;
  add(rb(2.3, 0.22, 0.92, 0.03, sx, 0.2, sz), sofaMat);
  add(rb(2.3, 0.5, 0.2, 0.06, sx, 0.47, sz - 0.36), sofaMat);
  add(rb(0.2, 0.32, 0.92, 0.06, sx - 1.05, 0.46, sz), sofaMat);
  add(rb(0.2, 0.32, 0.92, 0.06, sx + 1.05, 0.46, sz), sofaMat);
  for (let k = -1; k <= 1; k++) add(cushion(0.62, 0.14, 0.7, sx + k * 0.64, 0.38, sz + 0.06, { bulge: 0.025 }), sofaMat);
  for (let k = -1; k <= 1; k++) add(cushion(0.6, 0.42, 0.18, sx + k * 0.64, 0.64, sz - 0.24, { bulge: 0.03 }).rotateX(0), sofaMat);
  add(cushion(0.4, 0.38, 0.13, sx - 0.78, 0.6, sz - 0.12, { yaw: 0.35 }), throwMat); // a cushion
  add(cushion(0.38, 0.36, 0.12, sx + 0.82, 0.6, sz - 0.12, { yaw: -0.3 }), armMat);
  // a throw draped over the right arm
  add(cushion(0.32, 0.04, 0.95, sx + 1.02, 0.63, sz + 0.02, { bulge: 0.01, r: 0.018 }), throwMat);
  for (const [dx, dz] of [[-1.08, -0.38], [1.08, -0.38], [-1.08, 0.38], [1.08, 0.38]]) add(new THREE.CylinderGeometry(0.02, 0.015, 0.09, 12).translate(sx + dx, 0.045, sz + dz), walnutMat);

  // ---------------------------------------------------------------- coffee table + objects
  const tx = -1.0, tz = -0.45;
  add(rb(1.15, 0.035, 0.6, 0.012, tx, 0.4, tz), oakMat);
  for (const [dx, dz] of [[-0.5, -0.24], [0.5, -0.24], [-0.5, 0.24], [0.5, 0.24]]) add(new THREE.CylinderGeometry(0.018, 0.014, 0.39, 12).translate(tx + dx, 0.195, tz + dz), blackMetal);
  add(rb(0.24, 0.035, 0.17, 0.004, tx - 0.2, 0.435, tz + 0.05, 1).rotateY(0.2), bookMats[0]);
  add(rb(0.22, 0.025, 0.16, 0.004, tx - 0.2, 0.465, tz + 0.04, 1), bookMats[2]);
  add(new THREE.CylinderGeometry(0.042, 0.036, 0.09, 24).translate(tx + 0.22, 0.462, tz - 0.08), ceramic);
  add(new THREE.CylinderGeometry(0.075, 0.06, 0.08, 24).translate(tx + 0.36, 0.458, tz + 0.12), ceramic);

  // ---------------------------------------------------------------- armchair (left, facing +x)
  const ax = x0 + 0.75, az = -0.35;
  const arm = new THREE.Group();
  const armParts = [rb(0.82, 0.24, 0.8, 0.04, 0, 0.2, 0), rb(0.18, 0.55, 0.8, 0.06, -0.33, 0.5, 0), rb(0.8, 0.3, 0.15, 0.05, 0, 0.45, -0.34), rb(0.8, 0.3, 0.15, 0.05, 0, 0.45, 0.34)];
  for (const g of armParts) arm.add(Object.assign(new THREE.Mesh(g, armMat), { castShadow: true, receiveShadow: true }));
  arm.add(Object.assign(new THREE.Mesh(cushion(0.55, 0.12, 0.52, 0.06, 0.37, 0, { bulge: 0.02 }), armMat), { castShadow: true, receiveShadow: true }));
  arm.position.set(ax, 0, az);
  arm.rotation.y = -0.18;
  group.add(arm);

  // ---------------------------------------------------------------- floor lamp (by the sofa's left end) + side table
  add(new THREE.CylinderGeometry(0.15, 0.16, 0.025, 32).translate(sx - 1.45, 0.0125, sz - 0.05), blackMetal);
  add(new THREE.CylinderGeometry(0.012, 0.012, 1.5, 12).translate(sx - 1.45, 0.76, sz - 0.05), blackMetal);
  add(new THREE.CylinderGeometry(0.17, 0.23, 0.3, 32, 1, true).translate(sx - 1.45, 1.55, sz - 0.05), shadeMat);
  add(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 32).translate(sx + 1.5, 0.5, sz - 0.05), walnutMat);
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 12).translate(sx + 1.5, 0.25, sz - 0.05), walnutMat);
  add(new THREE.CylinderGeometry(0.16, 0.16, 0.015, 24).translate(sx + 1.5, 0.008, sz - 0.05), walnutMat);

  // ---------------------------------------------------------------- dining table + four chairs (right half)
  const dx0 = 2.25, dz0 = 0.75;
  add(rb(1.5, 0.04, 0.85, 0.012, dx0, 0.74, dz0), walnutMat);
  for (const [ddx, ddz] of [[-0.66, -0.34], [0.66, -0.34], [-0.66, 0.34], [0.66, 0.34]]) add(rb(0.05, 0.72, 0.05, 0.008, dx0 + ddx, 0.36, dz0 + ddz, 1), walnutMat);
  const chair = (cx, cz, yaw) => {
    const g = new THREE.Group();
    const p = [rb(0.44, 0.04, 0.42, 0.01, 0, 0.45, 0), rb(0.42, 0.34, 0.03, 0.01, 0, 0.72, -0.2), ...[[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]].map(([a, b]) => rb(0.03, 0.45, 0.03, 0.006, a, 0.225, b, 1))];
    for (const geo of p) g.add(Object.assign(new THREE.Mesh(geo, oakMat), { castShadow: true, receiveShadow: true }));
    g.position.set(cx, 0, cz);
    g.rotation.y = yaw;
    group.add(g);
  };
  chair(dx0 - 0.35, dz0 - 0.62, Math.PI + 0.06);
  chair(dx0 + 0.38, dz0 - 0.6, Math.PI - 0.1);
  chair(dx0 - 0.36, dz0 + 0.63, 0.08);
  chair(dx0 + 0.35, dz0 + 0.61, -0.05);
  add(new THREE.CylinderGeometry(0.11, 0.09, 0.05, 32).translate(dx0 + 0.05, 0.785, dz0), ceramic);

  // ---------------------------------------------------------------- TV console + TV (front wall), bookshelf (left wall)
  add(rb(1.8, 0.45, 0.42, 0.01, -1.0, 0.26, z1 - 0.24), walnutMat);
  for (const [dx] of [[-0.85], [0.85]]) add(rb(0.04, 0.04, 0.38, 0.005, -1.0 + dx, 0.02, z1 - 0.24, 1), blackMetal);
  add(rb(1.4, 0.8, 0.04, 0.005, -1.0, 1.15, z1 - 0.03, 1), tvMat);
  add(rb(0.34, 1.9, 1.0, 0.01, x0 + 0.18, 0.95, 1.3), oakMat);
  for (let k = 0; k < 4; k++) for (let b = 0; b < 7; b++) add(rb(0.22, 0.24 + R() * 0.05, 0.03 + R() * 0.02, 0.003, x0 + 0.2, 0.25 + k * 0.45, 0.9 + b * 0.11, 1), bookMats[Math.floor(R() * bookMats.length)], { cast: false });

  // ---------------------------------------------------------------- the plant: a ceramic pot, stems, broad leaves
  const px = x1 - 0.5, pz = z0 + 0.5;
  add(new THREE.CylinderGeometry(0.22, 0.17, 0.42, 32).translate(px, 0.21, pz), ceramic);
  add(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 32).translate(px, 0.4, pz), new THREE.MeshStandardMaterial({ color: 0x3b2c22, roughness: 1 }));
  const leafGeo = (() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.bezierCurveTo(0.1, 0.06, 0.13, 0.22, 0, 0.34);
    s.bezierCurveTo(-0.13, 0.22, -0.1, 0.06, 0, 0);
    const g = new THREE.ShapeGeometry(s, 10);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, -0.25 * x * x - 0.15 * y * y + 0.02 * Math.sin(y * 20)); }
    g.computeVertexNormals();
    return g;
  })();
  const leaves = [];
  for (let k = 0; k < 26; k++) {
    const a = R() * Math.PI * 2, el = 0.5 + R() * 0.9, hgt = 0.6 + R() * 0.9;
    const g = leafGeo.clone();
    g.rotateX(-Math.PI / 2 + el);
    g.rotateY(a);
    g.scale(0.9 + R() * 0.5, 0.9 + R() * 0.5, 0.9 + R() * 0.5);
    g.translate(px + Math.cos(a) * 0.08, hgt, pz - Math.sin(a) * 0.08);
    leaves.push(g);
  }
  add(merge(leaves), leafMat);

  return { group, floor, rug, mats };
}

// the robot vacuum: 34 cm disc, matte white body, glossy dark top, lidar turret, bumper, a cool status light
export function buildVacuum() {
  const g = new THREE.Group();
  const body = new THREE.MeshPhysicalMaterial({ color: 0xe9ecef, roughness: 0.35, clearcoat: 0.6 });
  const top = new THREE.MeshPhysicalMaterial({ color: 0x1a1c1f, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.6 });
  const light = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7fd6ff).multiplyScalar(4), toneMapped: false });
  const prof = [[0, 0.012], [0.16, 0.012], [0.172, 0.022], [0.172, 0.07], [0.165, 0.085], [0, 0.088]].map(([r, y]) => new THREE.Vector2(r, y));
  const m = (geo, mat) => { const o = new THREE.Mesh(geo, mat); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  m(new THREE.LatheGeometry(prof, 64), body);
  m(new THREE.CylinderGeometry(0.15, 0.15, 0.004, 64).translate(0, 0.089, 0), top);
  m(new THREE.CylinderGeometry(0.045, 0.047, 0.026, 40).translate(0.07, 0.102, 0), body);
  m(new THREE.CylinderGeometry(0.038, 0.038, 0.004, 40).translate(0.07, 0.116, 0), dark);
  m(new THREE.TorusGeometry(0.172, 0.006, 8, 64, Math.PI).rotateX(Math.PI / 2).rotateY(-Math.PI / 2).translate(0, 0.045, 0), dark);
  m(new THREE.BoxGeometry(0.03, 0.003, 0.006).translate(-0.02, 0.092, 0), light);
  return g;
}
