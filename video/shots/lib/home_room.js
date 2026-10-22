// The family home of episode 1 (shots/home.js, shots/design.js): a dining room on a winter evening. Oak table under
// a low pendant, four wooden chairs, a sideboard with a lamp, books and a vase, a bookcase, a fiddle-leaf fig by
// the window, a wool rug, linen curtains, dusk outside; a doorway (door open) to a dim hallway.
// Room space: floor y = 0; the back wall at z = ROOM.z0 (the doorway in it, right), the window in the left wall
// (x = ROOM.x0); the table centred on the origin, long side along x. Units: metres.
import { THREE } from '../../engine2/core.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { spot } from '../../engine2/core.js';
import { rng } from './kit.js';

export const ROOM = {
  x0: -2.6, x1: 2.8, z0: -1.7, z1: 3.8, h: 2.7,
  door: { x0: 1.3, x1: 2.2, h: 2.1 },          // in the back wall
  win: { z0: -1.15, z1: 0.45, y0: 0.82, y1: 2.32 }, // in the left wall
  hall: { z0: -4.2 },
};
export const TABLE = { w: 1.8, d: 0.95, top: 0.75, t: 0.035 };

const cnv = (w, h = w) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};
const tex = (c, srgb = true) => {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
};
const mesh = (geo, mat, { cast = true, receive = true } = {}) => {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
};
function lathe(pts, segs = 64, n = 6) {
  const c = new THREE.CatmullRomCurve3(pts.map(([r, y]) => new THREE.Vector3(r, y, 0)), false, 'centripetal');
  const p = c.getSpacedPoints(pts.length * n).map((v) => new THREE.Vector2(Math.max(v.x, 1e-5), v.y));
  const g = new THREE.LatheGeometry(p, segs);
  g.computeVertexNormals();
  return g;
}
// planar UVs in metres (so a texture's repeat is "per metre"), for a geometry lying in a given plane
function uvMetres(geo, axes = 'xy') {
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  const [a, b] = axes.split('');
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos[`get${a.toUpperCase()}`](i);
    uv[i * 2 + 1] = pos[`get${b.toUpperCase()}`](i);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
// box with UVs in metres on every face (wood grain along the box's longest side)
function woodBox(w, h, d, r = 0.002, seg = 2) {
  const g = new RoundedBoxGeometry(w, h, d, seg, r);
  const pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv;
  const long = w >= d ? 'x' : 'z';
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i)), nz = Math.abs(nrm.getZ(i));
    let u, v;
    if (ny >= nx && ny >= nz) [u, v] = long === 'x' ? [x, z] : [z, x];
    else if (nz >= nx) [u, v] = h > w ? [y, x] : [x, y];
    else [u, v] = h > d ? [y, z] : [z, y];
    uv.setXY(i, u, v);
  }
  return g;
}

// ---------------------------------------------------------------- materials
export function homeMaterials(st, env) {
  const M = {};
  const wall = st.pbr('PaintedPlaster017', { repeat: [0.45, 0.45] });
  M.wall = new THREE.MeshStandardMaterial({ ...wall, color: 0xe6ddcd, roughness: 0.92, normalScale: new THREE.Vector2(0.5, 0.5) });
  M.wallBack = new THREE.MeshStandardMaterial({ ...wall, color: 0xd8cbb6, roughness: 0.92, normalScale: new THREE.Vector2(0.5, 0.5) });
  M.ceiling = new THREE.MeshStandardMaterial({ color: 0xe9e4da, roughness: 0.95 });
  const fl = st.pbr('WoodFloor051', { repeat: [0.42, 0.42] });
  M.floor = new THREE.MeshPhysicalMaterial({ ...fl, color: 0xc89a76, roughness: 0.75, clearcoat: 0.25, clearcoatRoughness: 0.35 });
  const oak = st.pbr('Wood022', { repeat: [0.7, 0.7] });
  M.oak = new THREE.MeshPhysicalMaterial({ ...oak, color: 0xe2c49c, roughness: 0.55, clearcoat: 0.2, clearcoatRoughness: 0.4 });
  const wal = st.pbr('Wood026', { repeat: [0.8, 0.8] });
  M.walnut = new THREE.MeshPhysicalMaterial({ ...wal, color: 0xb28a6c, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.3 });
  M.chair = new THREE.MeshPhysicalMaterial({ ...st.pbr('Wood026', { repeat: [1.6, 1.6] }), color: 0xa27a5a, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.35 });
  M.paint = new THREE.MeshStandardMaterial({ color: 0xf0ebe2, roughness: 0.45 });  // trim: skirting, casing, frames
  const rug = st.pbr('Carpet016', { repeat: [1.3, 1.3] });
  M.rug = new THREE.MeshStandardMaterial({ ...rug, color: 0xc9b29a, roughness: 1, normalScale: new THREE.Vector2(0.8, 0.8) });
  const lin = st.pbr('Fabric082A', { repeat: [3, 3] });
  M.linen = new THREE.MeshPhysicalMaterial({ ...lin, color: 0xeae2d3, roughness: 0.95, sheen: 0.6, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xfff2e0), side: THREE.DoubleSide });
  M.seat = new THREE.MeshPhysicalMaterial({ ...st.pbr('Fabric030', { repeat: [4, 4] }), color: 0x8a7a68, roughness: 1, sheen: 0.5, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xd8c8b0) });
  M.brass = new THREE.MeshPhysicalMaterial({ color: 0xcfa968, metalness: 1, roughness: 0.32, envMap: env, envMapIntensity: 1.2 });
  M.black = new THREE.MeshPhysicalMaterial({ color: 0x1a1a1a, metalness: 0.6, roughness: 0.45 });
  M.glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.1, envMap: env, envMapIntensity: 1.5, depthWrite: false });
  return M;
}

// ---------------------------------------------------------------- the shell
function wallWithHoles(w, h, holes, mat) {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(w, 0); s.lineTo(w, h); s.lineTo(0, h); s.closePath();
  for (const [x0, y0, x1, y1] of holes) {
    const p = new THREE.Path();
    p.moveTo(x0, y0); p.lineTo(x0, y1); p.lineTo(x1, y1); p.lineTo(x1, y0); p.closePath();
    s.holes.push(p);
  }
  const g = new THREE.ShapeGeometry(s);
  uvMetres(g, 'xy');
  return mesh(g, mat, { cast: true, receive: true });
}

function skirting(len, M) {
  const g = new THREE.Group();
  const b = mesh(woodBox(len, 0.1, 0.016, 0.003), M.paint);
  b.position.y = 0.05;
  g.add(b);
  const cap = mesh(new THREE.CylinderGeometry(0.006, 0.006, len, 8), M.paint);
  cap.rotation.z = Math.PI / 2;
  cap.position.set(0, 0.1, 0.004);
  g.add(cap);
  return g;
}

// the dusk outside the window: a sky gradient, a city of low blocks with lit windows, bare trees
function duskBackdrop(seed = 5) {
  const W = 2048, H = 1024;
  const c = cnv(W, H), g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#1b2a4a');
  sky.addColorStop(0.35, '#3c4f78');
  sky.addColorStop(0.58, '#8a7c92');
  sky.addColorStop(0.7, '#d9957a');
  sky.addColorStop(0.78, '#f1b07a');
  sky.addColorStop(1, '#f6c48e');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  const R = rng(seed);
  // far blocks
  for (let k = 0; k < 40; k++) {
    const x = R() * W, w = 60 + R() * 180, h = 120 + R() * 260;
    g.fillStyle = `rgb(${38 + R() * 14 | 0},${36 + R() * 12 | 0},${52 + R() * 14 | 0})`;
    g.fillRect(x, H * 0.78 - h, w, h + H);
    for (let i = 0; i < w / 14; i++) for (let j = 0; j < h / 18; j++) {
      if (R() < 0.18) {
        g.fillStyle = `rgba(255,${190 + R() * 50 | 0},${110 + R() * 60 | 0},${0.6 + R() * 0.4})`;
        g.fillRect(x + 4 + i * 14, H * 0.78 - h + 6 + j * 18, 7, 9);
      }
    }
  }
  // near trees: dark branching silhouettes
  g.strokeStyle = '#141318';
  g.lineCap = 'round';
  const branch = (x, y, a, len, w, d) => {
    if (d > 7 || len < 6) return;
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    g.lineWidth = w;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
    const n = 2 + (R() < 0.4 ? 1 : 0);
    for (let i = 0; i < n; i++) branch(x2, y2, a + (R() - 0.5) * 1.1, len * (0.62 + R() * 0.2), w * 0.66, d + 1);
  };
  for (const x of [300, 1450, 1900]) branch(x, H, -Math.PI / 2 + (R() - 0.5) * 0.2, 220, 26, 0);
  g.fillStyle = '#121116';
  g.fillRect(0, H * 0.9, W, H * 0.1);
  return tex(c);
}

function windowUnit(M, env) {
  const { z0, z1, y0, y1 } = ROOM.win;
  const g = new THREE.Group();
  const w = z1 - z0, h = y1 - y0, fw = 0.06;
  const frame = (len, horiz) => mesh(woodBox(horiz ? len : fw, horiz ? fw : len, 0.08, 0.004), M.paint);
  // outer frame + a mullion and a transom (casement windows)
  const parts = [
    [frame(w, true), [0, y0 + fw / 2]], [frame(w, true), [0, y1 - fw / 2]],
    [frame(h, false), [-w / 2 + fw / 2, (y0 + y1) / 2]], [frame(h, false), [w / 2 - fw / 2, (y0 + y1) / 2]],
    [frame(h, false), [0, (y0 + y1) / 2]],
  ];
  for (const [m, [u, v]] of parts) {
    m.position.set(0, v, u);
    m.rotation.y = Math.PI / 2;
    g.add(m);
  }
  const tr = frame(w, true);
  tr.position.set(0, y1 - 0.42, 0);
  tr.rotation.y = Math.PI / 2;
  g.add(tr);
  // the sill
  const sill = mesh(woodBox(0.26, 0.035, w + 0.16, 0.006), M.paint);
  sill.position.set(0.09, y0 - 0.0175, 0);
  g.add(sill);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), M.glass);
  glass.rotation.y = Math.PI / 2;
  glass.position.set(-0.01, (y0 + y1) / 2, 0);
  g.add(glass);
  g.position.set(ROOM.x0, 0, (z0 + z1) / 2);
  // the view: a big unlit backdrop some metres out
  const back = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), new THREE.MeshBasicMaterial({ map: duskBackdrop(), color: new THREE.Color(1.0, 1.0, 1.0), toneMapped: true }));
  back.rotation.y = Math.PI / 2;
  back.position.set(ROOM.x0 - 5, 1.2, (z0 + z1) / 2 - 0.6);
  g.userData.backdrop = back;
  void env;
  return g;
}

// a pleated linen curtain hanging from y = top, `width` wide when drawn to this size, folds along its length
function curtain(M, { width = 0.55, top = 2.45, drop = 2.43, folds = 7, seed = 2 } = {}) {
  const nx = 80, ny = 40;
  const g = new THREE.PlaneGeometry(width, drop, nx, ny);
  const pos = g.attributes.position;
  const R = rng(seed);
  const ph = R() * 6;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const u = (x / width + 0.5), v = (y / drop + 0.5); // v = 1 at the top
    const amp = 0.035 + 0.012 * (1 - v);
    const z = amp * Math.sin(u * folds * Math.PI * 2 + ph + 0.4 * Math.sin(v * 3 + u * 5)) + 0.01 * Math.sin(u * 31 + v * 2);
    pos.setZ(i, z);
    pos.setY(i, y + 0.006 * Math.sin(u * folds * Math.PI * 2));
  }
  g.computeVertexNormals();
  const m = mesh(g, M.linen);
  m.position.y = top - drop / 2;
  return m;
}

// ---------------------------------------------------------------- furniture
export function diningTable(M) {
  const g = new THREE.Group();
  const { w, d, top, t } = TABLE;
  const slab = mesh(woodBox(w, t, d, 0.008, 3), M.oak);
  slab.position.y = top - t / 2;
  g.add(slab);
  // apron and four tapered legs
  const ah = 0.08, inset = 0.09;
  for (const [aw, ax, az, rot] of [[w - 2 * inset, 0, d / 2 - inset, 0], [w - 2 * inset, 0, -d / 2 + inset, 0], [d - 2 * inset, w / 2 - inset, 0, 1], [d - 2 * inset, -w / 2 + inset, 0, 1]]) {
    const a = mesh(woodBox(aw, ah, 0.022, 0.003), M.oak);
    a.position.set(ax, top - t - ah / 2, az);
    if (rot) a.rotation.y = Math.PI / 2;
    g.add(a);
  }
  const lg = new THREE.CylinderGeometry(0.028, 0.019, top - t, 4, 1).toNonIndexed();
  lg.rotateY(Math.PI / 4);
  const lgeo = woodBoxFrom(lg);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const l = mesh(lgeo, M.oak);
    l.position.set(sx * (w / 2 - inset), (top - t) / 2, sz * (d / 2 - inset));
    g.add(l);
  }
  return g;
}
function woodBoxFrom(geo) {
  // uv along y for long thin parts
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getY(i), pos.getX(i) + pos.getZ(i));
  geo.computeVertexNormals();
  return geo;
}

// a solid-wood dining chair, seat front toward +z, its back at -z; seat 0.46 high
export function chair(M, { cushion = true } = {}) {
  const g = new THREE.Group();
  const sw = 0.44, sd = 0.42, sh = 0.46;
  const seat = mesh(woodBox(sw, 0.03, sd, 0.008, 3), M.chair);
  seat.position.set(0, sh - 0.015, 0);
  g.add(seat);
  if (cushion) {
    const c = mesh(new RoundedBoxGeometry(sw - 0.05, 0.035, sd - 0.05, 4, 0.016), M.seat);
    c.position.set(0, sh + 0.016, 0.01);
    g.add(c);
  }
  const legGeo = woodBoxFrom(new THREE.CylinderGeometry(0.016, 0.013, sh - 0.03, 16));
  for (const [sx, sz] of [[-1, 1], [1, 1]]) {
    const l = mesh(legGeo, M.chair);
    l.position.set(sx * (sw / 2 - 0.03), (sh - 0.03) / 2, sz * (sd / 2 - 0.03));
    l.rotation.x = 0.03;
    g.add(l);
  }
  // back legs run up into the back posts, raked back
  const bh = 0.92;
  const postCurve = (sx) => new THREE.CatmullRomCurve3([
    new THREE.Vector3(sx * (sw / 2 - 0.03), 0, -sd / 2 + 0.035), new THREE.Vector3(sx * (sw / 2 - 0.03), sh - 0.02, -sd / 2 + 0.03),
    new THREE.Vector3(sx * (sw / 2 - 0.035), 0.7, -sd / 2 + 0.0), new THREE.Vector3(sx * (sw / 2 - 0.04), bh, -sd / 2 - 0.045),
  ]);
  for (const sx of [-1, 1]) {
    const p = mesh(new THREE.TubeGeometry(postCurve(sx), 40, 0.0155, 12, false), M.chair);
    g.add(p);
  }
  // a curved top rail (where a sweater gets thrown) and a mid rail
  const rail = (y, zc, h, bow) => {
    const c = new THREE.CatmullRomCurve3([-1, -0.5, 0, 0.5, 1].map((u) => new THREE.Vector3(u * (sw / 2 - 0.035), y, zc - bow * (1 - u * u))));
    const tube = new THREE.TubeGeometry(c, 40, 1, 12, false);
    const ps = tube.attributes.position;
    // flatten into a slat h tall, 0.022 thick
    const cen = new THREE.Vector3();
    for (let i = 0; i < ps.count; i++) {
      const k = Math.floor(i / 13);
      c.getPointAt(k / 40, cen);
      const dy = ps.getY(i) - cen.y, dz = ps.getZ(i) - cen.z;
      const L = Math.hypot(dy, dz) || 1;
      ps.setY(i, cen.y + (dy / L) * h * 0.5);
      ps.setZ(i, cen.z + (dz / L) * 0.011);
    }
    tube.computeVertexNormals();
    return mesh(tube, M.chair);
  };
  g.add(rail(bh - 0.045, -sd / 2 - 0.04, 0.075, 0.035));
  g.add(rail(0.66, -sd / 2 + 0.003, 0.035, 0.025));
  // stretchers
  const st = woodBoxFrom(new THREE.CylinderGeometry(0.008, 0.008, sw - 0.06, 10));
  for (const z of [-sd / 2 + 0.035, sd / 2 - 0.035]) {
    const s = mesh(st, M.chair);
    s.rotation.z = Math.PI / 2;
    s.position.set(0, 0.16, z);
    g.add(s);
  }
  g.userData.topRail = { y: bh - 0.01, z: -sd / 2 - 0.04 - 0.035, w: sw - 0.07, r: 0.016 };
  g.userData.seat = { y: sh + 0.03, w: sw, d: sd };
  return g;
}

// a low sideboard: walnut carcass, four doors with shadow gaps, tapered legs
export function sideboard(M, { w = 1.5, h = 0.72, d = 0.44 } = {}) {
  const g = new THREE.Group();
  const leg = 0.14;
  const body = mesh(woodBox(w, h - leg, d, 0.006, 3), M.walnut);
  body.position.y = leg + (h - leg) / 2;
  g.add(body);
  const top = mesh(woodBox(w + 0.02, 0.025, d + 0.02, 0.006, 3), M.walnut);
  top.position.y = h + 0.0125;
  g.add(top);
  const nd = 4, gap = 0.004;
  const dw = (w - 0.04) / nd;
  for (let i = 0; i < nd; i++) {
    const door = mesh(woodBox(dw - gap, h - leg - 0.06, 0.018, 0.003), M.walnut);
    door.position.set(-w / 2 + 0.02 + dw * (i + 0.5), leg + (h - leg) / 2, d / 2 + 0.006);
    g.add(door);
    const pull = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.09, 12), M.brass);
    pull.position.set(-w / 2 + 0.02 + dw * (i + 0.5) + (i % 2 ? -1 : 1) * (dw / 2 - 0.04), leg + (h - leg) / 2 + 0.05, d / 2 + 0.022);
    g.add(pull);
  }
  const lg = woodBoxFrom(new THREE.CylinderGeometry(0.02, 0.012, leg, 12));
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const l = mesh(lg, M.walnut);
    l.position.set(sx * (w / 2 - 0.06), leg / 2, sz * (d / 2 - 0.06));
    g.add(l);
  }
  g.userData.top = h + 0.025;
  return g;
}

// books: spines painted into one atlas; returns a group of n books standing in a row along +x from x = 0
let SPINES = null;
function spineAtlas() {
  if (SPINES) return SPINES;
  const n = 24, W = 64 * n, H = 512;
  const c = cnv(W, H), g = c.getContext('2d');
  const R = rng(77);
  const cols = ['#7a2e26', '#2c3e57', '#4b5a3a', '#b8925a', '#e4d9c3', '#1f2b2f', '#8c5a3c', '#5a3d5c', '#c7b48a', '#33463f', '#9c3f2f', '#d8cdb7',
    '#283447', '#6a6f4c', '#a05f3a', '#3a2f2a', '#c96b4a', '#e7dfcf', '#56667a', '#7e6a4f', '#2f2f2f', '#b9a27e', '#45342e', '#8f9a8a'];
  for (let i = 0; i < n; i++) {
    const x = i * 64;
    g.fillStyle = cols[i];
    g.fillRect(x, 0, 64, H);
    // cloth / paper variation
    for (let k = 0; k < 60; k++) {
      g.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,255,255'},${R() * 0.05})`;
      g.fillRect(x + R() * 64, R() * H, 1 + R() * 3, 4 + R() * 30);
    }
    const light = parseInt(cols[i].slice(1, 3), 16) > 160;
    const ink = light ? 'rgba(40,30,25,0.85)' : (R() < 0.5 ? 'rgba(226,196,120,0.9)' : 'rgba(240,232,215,0.85)');
    g.fillStyle = ink;
    // bands top and bottom, a title block, an author line
    if (R() < 0.6) { g.fillRect(x + 4, 30, 56, 4); g.fillRect(x + 4, H - 36, 56, 4); }
    const ty = 90 + R() * 120;
    for (let l = 0; l < 2 + (R() * 3 | 0); l++) g.fillRect(x + 16 + R() * 6, ty + l * 26, 30 - R() * 10, 12);
    g.fillRect(x + 22, H - 120, 20, 30);
  }
  SPINES = { tex: tex(c), n };
  return SPINES;
}
export function bookRow(len, { seed = 1, hmin = 0.19, hmax = 0.29, lean = 0 } = {}) {
  const A = spineAtlas();
  const mat = new THREE.MeshPhysicalMaterial({ map: A.tex, roughness: 0.75, sheen: 0.2, sheenColor: new THREE.Color(0xffffff) });
  const page = new THREE.MeshStandardMaterial({ color: 0xe8dfcc, roughness: 0.9 });
  const g = new THREE.Group();
  const R = rng(seed);
  let x = 0;
  while (x < len) {
    const tk = 0.018 + R() * 0.03, h = hmin + R() * (hmax - hmin), d = 0.13 + R() * 0.07;
    if (x + tk > len) break;
    const geo = new THREE.BoxGeometry(tk, h, d);
    // the spine is the +z face (group 4): map it to one atlas cell
    const cell = Math.floor(R() * A.n);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const face = Math.floor(i / 4);
      const u = uv.getX(i), v = uv.getY(i);
      if (face === 4) uv.setXY(i, (cell + 0.04 + u * 0.92) / A.n, v);
      else uv.setXY(i, (cell + 0.5) / A.n, 0.5);
    }
    const b = mesh(geo, [mat, mat, page, mat, mat, mat]);
    b.position.set(x + tk / 2, h / 2, d / 2);
    g.add(b);
    x += tk + 0.001;
  }
  void lean;
  return g;
}

// a lamp: turned ceramic base, linen drum shade lit from within
export function tableLamp(M, { h = 0.52, color = 0x9aa58c } = {}) {
  const g = new THREE.Group();
  const cer = new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.1 });
  const base = mesh(lathe([[0, 0], [0.05, 0], [0.07, 0.03], [0.085, 0.1], [0.08, 0.17], [0.05, 0.22], [0.022, 0.25], [0.014, 0.27], [0, 0.27]], 48), cer);
  g.add(base);
  const stem = mesh(new THREE.CylinderGeometry(0.006, 0.006, h - 0.27, 8), M.brass);
  stem.position.y = 0.27 + (h - 0.27) / 2;
  g.add(stem);
  const shadeMat = new THREE.MeshPhysicalMaterial({ ...M.linen, color: 0xf3e6cc, emissive: 0xffb466, emissiveIntensity: 1.2, side: THREE.DoubleSide, sheen: 0 });
  shadeMat.map = M.linen.map;
  const shade = mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.2, 48, 1, true), shadeMat, { cast: false });
  shade.position.y = h + 0.02;
  g.add(shade);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.155, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.75, 0.45).multiplyScalar(2.2) }));
  glow.rotation.x = Math.PI / 2;
  glow.position.y = h - 0.075;
  g.add(glow);
  g.userData.bulb = new THREE.Vector3(0, h, 0);
  return g;
}

// the pendant over the table: a spun steel dome (deep green outside, white inside), cord to the ceiling
export function pendant(M, { y = 1.52 } = {}) {
  const g = new THREE.Group();
  const outer = new THREE.MeshPhysicalMaterial({ color: 0x2d3d33, metalness: 0.3, roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.15 });
  const inner = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffc98a, emissiveIntensity: 0.9, roughness: 0.6, side: THREE.BackSide });
  const prof = [[0.215, 0.0], [0.2, 0.04], [0.15, 0.1], [0.08, 0.16], [0.05, 0.19], [0.04, 0.2], [0.02, 0.2]];
  const dome = mesh(lathe(prof, 64), outer, { cast: true, receive: false });
  const dIn = mesh(lathe(prof.map(([r, yy]) => [r - 0.002, yy]), 64), inner, { cast: false, receive: false });
  g.add(dome, dIn);
  const rim = mesh(new THREE.TorusGeometry(0.215, 0.003, 8, 64), M.brass, { cast: false });
  rim.rotation.x = Math.PI / 2;
  g.add(rim);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.82, 0.6).multiplyScalar(4) }));
  bulb.position.y = 0.09;
  g.add(bulb);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, ROOM.h - y - 0.2, 6), M.black);
  cord.position.y = 0.2 + (ROOM.h - y - 0.2) / 2;
  g.add(cord);
  const rose = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.025, 32), outer);
  rose.position.y = ROOM.h - y - 0.0125;
  g.add(rose);
  g.position.y = y;
  return g;
}

// a fiddle-leaf fig in a terracotta pot: a trunk, a few branches, big glossy violin-shaped leaves
let LEAF = null;
function leafTexture() {
  if (LEAF) return LEAF;
  const n = 256;
  const c = cnv(n), g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0)';
  g.clearRect(0, 0, n, n);
  g.beginPath();
  // violin outline, tip at the top
  g.moveTo(n / 2, n * 0.98);
  g.bezierCurveTo(n * 0.2, n * 0.88, n * 0.28, n * 0.6, n * 0.14, n * 0.42);
  g.bezierCurveTo(n * 0.02, n * 0.22, n * 0.3, n * 0.02, n / 2, n * 0.04);
  g.bezierCurveTo(n * 0.7, n * 0.02, n * 0.98, n * 0.22, n * 0.86, n * 0.42);
  g.bezierCurveTo(n * 0.72, n * 0.6, n * 0.8, n * 0.88, n / 2, n * 0.98);
  const gr = g.createLinearGradient(0, 0, n, n);
  gr.addColorStop(0, '#3f6a2c');
  gr.addColorStop(1, '#2a4d1f');
  g.fillStyle = gr;
  g.fill();
  g.strokeStyle = 'rgba(170,200,120,0.55)';
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(n / 2, n * 0.97); g.lineTo(n / 2, n * 0.08); g.stroke();
  g.lineWidth = 1.5;
  for (let k = 0; k < 7; k++) {
    const y = n * (0.85 - k * 0.1);
    g.beginPath(); g.moveTo(n / 2, y); g.quadraticCurveTo(n * 0.36, y - 12, n * 0.22, y - 30); g.stroke();
    g.beginPath(); g.moveTo(n / 2, y); g.quadraticCurveTo(n * 0.64, y - 12, n * 0.78, y - 30); g.stroke();
  }
  LEAF = tex(c);
  return LEAF;
}
export function fig(M, { h = 1.75, seed = 4 } = {}) {
  const g = new THREE.Group();
  const terra = new THREE.MeshPhysicalMaterial({ color: 0xb86a48, roughness: 0.85 });
  const pot = mesh(lathe([[0, 0], [0.16, 0], [0.17, 0.02], [0.2, 0.34], [0.215, 0.36], [0.215, 0.38], [0.195, 0.38], [0.19, 0.34], [0, 0.34]], 48), terra);
  g.add(pot);
  const soil = mesh(new THREE.CircleGeometry(0.19, 32), new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 1 }));
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = 0.35;
  g.add(soil);
  const bark = new THREE.MeshStandardMaterial({ color: 0x6b5a48, roughness: 0.9 });
  const R = rng(seed);
  const leafMat = new THREE.MeshPhysicalMaterial({ map: leafTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.25 });
  const lg = new THREE.PlaneGeometry(0.2, 0.27, 4, 6);
  // cup the leaf a little
  const lp = lg.attributes.position;
  for (let i = 0; i < lp.count; i++) lp.setZ(i, 0.02 * (lp.getX(i) / 0.1) ** 2 - 0.012 * (lp.getY(i) / 0.135) ** 2);
  lg.translate(0, 0.135, 0);
  lg.computeVertexNormals();
  const leaves = [];
  const trunk = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.35, 0), new THREE.Vector3(0.02, 0.8, 0.01), new THREE.Vector3(-0.01, 1.25, 0.0), new THREE.Vector3(0.01, h, 0.02)]);
  g.add(mesh(new THREE.TubeGeometry(trunk, 30, 0.018, 8, false), bark));
  const stems = [trunk];
  for (let b = 0; b < 3; b++) {
    const t0 = 0.45 + b * 0.15, p0 = trunk.getPointAt(t0);
    const a = R() * 6.28;
    const p1 = p0.clone().add(new THREE.Vector3(Math.cos(a) * 0.25, 0.3 + R() * 0.2, Math.sin(a) * 0.25));
    const p2 = p1.clone().add(new THREE.Vector3(Math.cos(a) * 0.12, 0.2, Math.sin(a) * 0.12));
    const c = new THREE.CatmullRomCurve3([p0, p0.clone().lerp(p1, 0.5).add(new THREE.Vector3(0, 0.05, 0)), p1, p2]);
    g.add(mesh(new THREE.TubeGeometry(c, 20, 0.01, 6, false), bark));
    stems.push(c);
  }
  stems.forEach((c, si) => {
    const nL = si === 0 ? 16 : 9;
    for (let k = 0; k < nL; k++) {
      const u = (si === 0 ? 0.35 : 0.15) + (k / nL) * (si === 0 ? 0.65 : 0.85);
      const p = c.getPointAt(Math.min(1, u));
      const a = k * 2.4 + si;
      const q = new THREE.Object3D();
      q.position.copy(p);
      q.rotation.set(0, a, 0);
      q.rotateX(-0.5 - R() * 0.6);  // tilt outward / up
      q.rotateZ((R() - 0.5) * 0.5);
      const s = 0.75 + R() * 0.5 + (u > 0.85 ? -0.25 : 0);
      q.scale.setScalar(s);
      q.updateMatrix();
      leaves.push(q.matrix.clone());
    }
  });
  const im = new THREE.InstancedMesh(lg, leafMat, leaves.length);
  leaves.forEach((m, i) => im.setMatrixAt(i, m));
  im.castShadow = im.receiveShadow = true;
  g.add(im);
  return g;
}

// a small potted plant (pothos trailing over the pot's lip)
export function smallPlant(M, { seed = 9 } = {}) {
  const g = new THREE.Group();
  const potM = new THREE.MeshPhysicalMaterial({ color: 0xe9e4d8, roughness: 0.3, clearcoat: 0.7 });
  g.add(mesh(lathe([[0, 0], [0.06, 0], [0.07, 0.11], [0.072, 0.115], [0.066, 0.115], [0.062, 0.1], [0, 0.1]], 32), potM));
  const R = rng(seed);
  const leafMat = new THREE.MeshPhysicalMaterial({ color: 0x4f7a34, roughness: 0.4, clearcoat: 0.4, side: THREE.DoubleSide });
  const lg = new THREE.CircleGeometry(0.03, 12);
  lg.scale(0.8, 1.2, 1);
  const vines = new THREE.Group();
  for (let v = 0; v < 6; v++) {
    const a = v * 1.05 + R() * 0.4;
    const pts = [];
    for (let k = 0; k <= 6; k++) {
      const r = 0.03 + k * 0.022, y = 0.12 + 0.07 * Math.sin(Math.min(1, k / 2) * 1.5) - (k > 2 ? (k - 2) * 0.045 : 0);
      pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
    }
    const c = new THREE.CatmullRomCurve3(pts);
    vines.add(mesh(new THREE.TubeGeometry(c, 20, 0.002, 4, false), leafMat));
    for (let k = 1; k < 9; k++) {
      const p = c.getPointAt(k / 9);
      const l = mesh(lg, leafMat);
      l.position.copy(p);
      l.rotation.set(-1.2 + R() * 0.8, a + R(), R() * 0.8);
      vines.add(l);
    }
  }
  g.add(vines);
  return g;
}

// a picture frame with a painting (abstract, warm), hung or leaning
function paintingTexture(seed, palette) {
  const W = 512, H = 640;
  const c = cnv(W, H), g = c.getContext('2d');
  const R = rng(seed);
  g.fillStyle = palette[0];
  g.fillRect(0, 0, W, H);
  for (let k = 0; k < 9; k++) {
    g.fillStyle = palette[1 + (k % (palette.length - 1))];
    g.globalAlpha = 0.5 + R() * 0.4;
    g.beginPath();
    const x = R() * W, y = R() * H, r = 60 + R() * 200;
    g.ellipse(x, y, r, r * (0.4 + R()), R() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  g.filter = 'blur(6px)';
  g.drawImage(c, 0, 0);
  g.filter = 'none';
  // canvas texture: fine brush noise
  for (let k = 0; k < 5000; k++) {
    g.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,255,255'},0.05)`;
    g.fillRect(R() * W, R() * H, 2 + R() * 6, 1);
  }
  return tex(c);
}
export function framedPicture(M, { w = 0.6, h = 0.75, seed = 3, palette = ['#d9cbb0', '#c46a3c', '#2f4a5a', '#e8b05a', '#7b8a6a'], mat = 0.06 } = {}) {
  const g = new THREE.Group();
  const frameM = new THREE.MeshPhysicalMaterial({ color: 0x2a2420, roughness: 0.45, clearcoat: 0.4 });
  const fw = 0.025, fd = 0.03;
  for (const [ww, hh, x, y] of [[w, fw, 0, h / 2 - fw / 2], [w, fw, 0, -h / 2 + fw / 2], [fw, h, -w / 2 + fw / 2, 0], [fw, h, w / 2 - fw / 2, 0]]) {
    const b = mesh(new RoundedBoxGeometry(ww, hh, fd, 2, 0.004), frameM);
    b.position.set(x, y, fd / 2);
    g.add(b);
  }
  const passe = mesh(new THREE.PlaneGeometry(w - 2 * fw, h - 2 * fw), new THREE.MeshStandardMaterial({ color: 0xf2ede2, roughness: 0.9 }));
  passe.position.z = 0.008;
  g.add(passe);
  const art = mesh(new THREE.PlaneGeometry(w - 2 * fw - 2 * mat, h - 2 * fw - 2 * mat), new THREE.MeshStandardMaterial({ map: paintingTexture(seed, palette), roughness: 0.8 }));
  art.position.z = 0.009;
  g.add(art);
  const gl = new THREE.Mesh(new THREE.PlaneGeometry(w - 2 * fw, h - 2 * fw), M.glass);
  gl.position.z = 0.02;
  g.add(gl);
  return g;
}

// a vase of dried branches (eucalyptus-like): a stoneware bottle and thin stems with small leaves
export function branchVase(M, { seed = 6 } = {}) {
  const g = new THREE.Group();
  const stone = new THREE.MeshPhysicalMaterial({ color: 0x5b5048, roughness: 0.55, clearcoat: 0.3 });
  g.add(mesh(lathe([[0, 0], [0.06, 0], [0.075, 0.08], [0.07, 0.16], [0.035, 0.22], [0.024, 0.26], [0.028, 0.28], [0, 0.28]], 40), stone));
  const R = rng(seed);
  const stemM = new THREE.MeshStandardMaterial({ color: 0x6b5a45, roughness: 0.8 });
  const leafM = new THREE.MeshPhysicalMaterial({ color: 0x8a9a80, roughness: 0.6, side: THREE.DoubleSide, sheen: 0.4, sheenColor: new THREE.Color(0xd8e0d0) });
  const lg = new THREE.CircleGeometry(0.016, 10);
  for (let s = 0; s < 7; s++) {
    const a = s * 0.9 + R(), lean = 0.15 + R() * 0.35;
    const top = new THREE.Vector3(Math.cos(a) * lean * 0.8, 0.75 + R() * 0.3, Math.sin(a) * lean * 0.5);
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.12, 0), new THREE.Vector3(0, 0.3, 0), top.clone().multiplyScalar(0.6).setY(top.y * 0.7), top]);
    g.add(mesh(new THREE.TubeGeometry(c, 20, 0.0022, 4, false), stemM));
    for (let k = 0; k < 10; k++) {
      const p = c.getPointAt(0.4 + k * 0.06);
      const l = mesh(lg, leafM);
      l.position.copy(p);
      l.rotation.set(R() * 3, R() * 3, R() * 3);
      g.add(l);
    }
  }
  return g;
}

// ---------------------------------------------------------------- doors (the door is also the handle close-up)
// a four-panel oak door, w x h, hinge side at x = 0, latch side at x = w; the face toward +z; lever handle both sides
export function door(M, { w = 0.84, h = 2.04, t = 0.04, handle = 'brass' } = {}) {
  const g = new THREE.Group();
  const wood = M.oak.clone();
  wood.color = new THREE.Color(0xd2a87e);
  const st = 0.12, rail = 0.12, mid = 0.2;
  const pieces = [
    [st, h, 0, h / 2, 0], [st, h, w - st, h / 2, 0],                  // stiles
    [w - 2 * st, rail, st, h - rail / 2, 1], [w - 2 * st, 0.22, st, 0.11, 1], [w - 2 * st, mid, st, h * 0.45, 1], // rails
  ];
  for (const [pw, ph, x, y, horiz] of pieces) {
    const b = mesh(woodBox(pw, ph, t, 0.004), wood);
    b.position.set(horiz ? x + pw / 2 : x + pw / 2, y, 0);
    g.add(b);
  }
  // panels (thinner, with a raised field)
  const pt = t * 0.55;
  const ph1 = h - rail - (h * 0.45 + mid / 2), ph2 = h * 0.45 - mid / 2 - 0.22;
  for (const [y, ph] of [[h * 0.45 + mid / 2 + ph1 / 2, ph1], [0.22 + ph2 / 2, ph2]]) {
    for (const xs of [0, 1]) {
      const pw = (w - 2 * st - 0.08) / 2;
      const x = st + 0.04 * 0 + pw / 2 + xs * (pw + 0.08);
      const p = mesh(woodBox(pw + 0.02, ph + 0.02, pt, 0.01, 3), wood);
      p.position.set(x + 0.0, y, 0);
      g.add(p);
    }
  }
  // the mullion between the panels
  const mul = mesh(woodBox(0.08, h - rail - 0.22, t * 0.9, 0.004), wood);
  mul.position.set(w / 2, (h - rail + 0.22) / 2, 0);
  g.add(mul);
  // lever handles on both faces
  const hz = t / 2;
  for (const side of [1, -1]) {
    const lev = leverHandle(handle === 'brass' ? M.brass : M.black);
    lev.position.set(w - 0.065, 1.0, side * hz);
    lev.scale.z = side;  // mirrored on the far face: the lever still points away from the latch edge
    g.add(lev);
  }
  g.userData.handle = new THREE.Vector3(w - 0.065, 1.0, hz);
  return g;
}

// a lever handle on a round rose with a keyhole escutcheon below; the lever points toward -x (away from the latch
// edge), the rose against z = 0, sticking out to +z
export function leverHandle(mat) {
  const g = new THREE.Group();
  const rose = mesh(lathe([[0, 0], [0.026, 0], [0.026, 0.003], [0.023, 0.007], [0.012, 0.009], [0.011, 0.012], [0, 0.012]], 48), mat);
  rose.rotation.x = Math.PI / 2;
  g.add(rose);
  const neck = mesh(lathe([[0, 0], [0.011, 0], [0.0095, 0.02], [0.0105, 0.04], [0.012, 0.05], [0, 0.052]], 32), mat);
  neck.rotation.x = Math.PI / 2;
  g.add(neck);
  // the lever: a swept, slightly drooping bar ending in a rounded tip
  const c = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0.046), new THREE.Vector3(-0.03, -0.002, 0.052), new THREE.Vector3(-0.08, -0.006, 0.054), new THREE.Vector3(-0.118, -0.004, 0.05),
  ]);
  const lev = new THREE.TubeGeometry(c, 40, 1, 16, false);
  const ps = lev.attributes.position;
  const cen = new THREE.Vector3();
  for (let i = 0; i < ps.count; i++) {
    const k = Math.floor(i / 17), u = k / 40;
    c.getPointAt(u, cen);
    const dy = ps.getY(i) - cen.y, dz = ps.getZ(i) - cen.z, dx = ps.getX(i) - cen.x;
    const L = Math.hypot(dx, dy, dz) || 1;
    const r = 0.0085 - 0.0015 * u + (u > 0.92 ? 0.001 : 0);
    ps.setXYZ(i, cen.x + (dx / L) * r, cen.y + (dy / L) * r * 1.0, cen.z + (dz / L) * r * 0.62);
  }
  lev.computeVertexNormals();
  g.add(mesh(lev, mat));
  const tip = mesh(new THREE.SphereGeometry(0.0085, 20, 14), mat);
  tip.scale.set(1, 1, 0.62);
  tip.position.set(-0.118, -0.004, 0.05);
  g.add(tip);
  const esc = mesh(lathe([[0, 0], [0.016, 0], [0.016, 0.002], [0.013, 0.005], [0, 0.0055]], 32), mat);
  esc.rotation.x = Math.PI / 2;
  esc.position.y = -0.085;
  g.add(esc);
  const hole = mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.002, 16), new THREE.MeshBasicMaterial({ color: 0x050403 }), { cast: false });
  hole.rotation.x = Math.PI / 2;
  hole.position.set(0, -0.083, 0.0058);
  g.add(hole);
  const slot = mesh(new THREE.BoxGeometry(0.0034, 0.008, 0.002), new THREE.MeshBasicMaterial({ color: 0x050403 }), { cast: false });
  slot.position.set(0, -0.089, 0.0058);
  g.add(slot);
  return g;
}

// ---------------------------------------------------------------- the whole room
export async function buildHome(st, env, { hall = true } = {}) {
  const M = homeMaterials(st, env);
  const g = new THREE.Group();
  const { x0, x1, z0, z1, h, door: dr, win } = ROOM;
  const W = x1 - x0, D = z1 - z0;
  // floor and ceiling
  const floor = mesh(uvMetres(new THREE.PlaneGeometry(W, D + 3).rotateX(-Math.PI / 2), 'xz'), M.floor, { cast: false });
  floor.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2 - 1.5);
  g.add(floor);
  const ceil = mesh(new THREE.PlaneGeometry(W, D).rotateX(Math.PI / 2), M.ceiling, { cast: false });
  ceil.position.set((x0 + x1) / 2, h, (z0 + z1) / 2);
  g.add(ceil);
  // back wall with the doorway
  const back = wallWithHoles(W, h, [[dr.x0 - x0, 0, dr.x1 - x0, dr.h]], M.wallBack);
  back.position.set(x0, 0, z0);
  g.add(back);
  // left wall with the window: the shape's x runs along -z from z1 once the wall is turned to face +x
  const left = wallWithHoles(D, h, [[z1 - win.z1, win.y0, z1 - win.z0, win.y1]], M.wall);
  left.rotation.y = Math.PI / 2;
  left.position.set(x0, 0, z1);
  g.add(left);
  const right = mesh(uvMetres(new THREE.PlaneGeometry(D, h), 'xy'), M.wall);
  right.rotation.y = -Math.PI / 2;
  right.position.set(x1, h / 2, (z0 + z1) / 2);
  g.add(right);
  const front = mesh(new THREE.PlaneGeometry(W, h), M.wall);
  front.rotation.y = Math.PI;
  front.position.set((x0 + x1) / 2, h / 2, z1);
  g.add(front);
  // window reveal (the wall's thickness around the opening)
  const rev = 0.16;
  for (const [w2, h2, x, y, z, ry] of [
    [rev, win.y1 - win.y0, x0 - rev / 2, (win.y0 + win.y1) / 2, win.z0, 0], [rev, win.y1 - win.y0, x0 - rev / 2, (win.y0 + win.y1) / 2, win.z1, Math.PI],
  ]) {
    const p = mesh(new THREE.PlaneGeometry(w2, h2), M.wall);
    p.position.set(x, y, z);
    p.rotation.y = ry;
    g.add(p);
  }
  const revTop = mesh(new THREE.PlaneGeometry(rev, win.z1 - win.z0).rotateX(Math.PI / 2).rotateY(0), M.wall);
  revTop.position.set(x0 - rev / 2, win.y1, (win.z0 + win.z1) / 2);
  g.add(revTop);
  // skirting
  const sk = (len, x, z, ry) => { const s = skirting(len, M); s.position.set(x, 0, z); s.rotation.y = ry; g.add(s); };
  sk(dr.x0 - x0, (x0 + dr.x0) / 2, z0 + 0.008, 0);
  sk(x1 - dr.x1, (dr.x1 + x1) / 2, z0 + 0.008, 0);
  sk(D, x0 + 0.008, (z0 + z1) / 2, Math.PI / 2);
  sk(D, x1 - 0.008, (z0 + z1) / 2, -Math.PI / 2);
  // window
  const wu = windowUnit(M, env);
  wu.position.x = x0 - rev + 0.04;
  g.add(wu);
  g.add(wu.userData.backdrop);
  // curtains on a rod
  const rod = mesh(new THREE.CylinderGeometry(0.012, 0.012, win.z1 - win.z0 + 1.0, 12), M.brass);
  rod.rotation.x = Math.PI / 2;
  rod.position.set(x0 + 0.1, win.y1 + 0.15, (win.z0 + win.z1) / 2);
  g.add(rod);
  for (const [zc, wdt, seed] of [[win.z0 - 0.12, 0.5, 2], [win.z1 + 0.14, 0.55, 5]]) {
    const c = curtain(M, { width: wdt, top: win.y1 + 0.13, drop: win.y1 + 0.13 - 0.01, seed });
    c.rotation.y = Math.PI / 2;
    c.position.x = x0 + 0.1;
    c.position.z = zc;
    g.add(c);
  }
  // doorway casing
  const cw = 0.07;
  for (const [ww, hh, x, y] of [[cw, dr.h + cw, dr.x0 - cw / 2, (dr.h + cw) / 2], [cw, dr.h + cw, dr.x1 + cw / 2, (dr.h + cw) / 2], [dr.x1 - dr.x0 + 2 * cw, cw, (dr.x0 + dr.x1) / 2, dr.h + cw / 2]]) {
    const b = mesh(woodBox(ww, hh, 0.02, 0.004), M.paint);
    b.position.set(x, y, z0 + 0.01);
    g.add(b);
  }
  // the jamb (the opening's depth)
  const jd = 0.14;
  for (const x of [dr.x0, dr.x1]) {
    const j = mesh(new THREE.PlaneGeometry(jd, dr.h), M.paint);
    j.rotation.y = x === dr.x0 ? Math.PI / 2 : -Math.PI / 2;
    j.position.set(x, dr.h / 2, z0 - jd / 2);
    g.add(j);
  }
  const jt = mesh(new THREE.PlaneGeometry(dr.x1 - dr.x0, jd).rotateX(Math.PI / 2), M.paint);
  jt.position.set((dr.x0 + dr.x1) / 2, dr.h, z0 - jd / 2);
  g.add(jt);
  const threshold = mesh(woodBox(dr.x1 - dr.x0, 0.012, jd, 0.003), M.oak);
  threshold.position.set((dr.x0 + dr.x1) / 2, 0.006, z0 - jd / 2);
  g.add(threshold);
  // the hallway beyond: walls, a runner, the open door against its wall, a coat on a hook
  const parts = {};
  if (hall) {
    const hz0 = ROOM.hall.z0, hx0 = dr.x0 - 0.25, hx1 = dr.x1 + 0.9;
    const hw = mesh(uvMetres(new THREE.PlaneGeometry(z0 - jd - hz0, h), 'xy'), M.wall);
    hw.rotation.y = Math.PI / 2;
    hw.position.set(hx0, h / 2, (z0 - jd + hz0) / 2);
    g.add(hw);
    const hw2 = hw.clone();
    hw2.rotation.y = -Math.PI / 2;
    hw2.position.x = hx1;
    g.add(hw2);
    const hb = mesh(uvMetres(new THREE.PlaneGeometry(hx1 - hx0, h), 'xy'), M.wallBack);
    hb.position.set((hx0 + hx1) / 2, h / 2, hz0);
    g.add(hb);
    const hc = mesh(new THREE.PlaneGeometry(hx1 - hx0, z0 - hz0).rotateX(Math.PI / 2), M.ceiling, { cast: false });
    hc.position.set((hx0 + hx1) / 2, h, (z0 + hz0) / 2);
    g.add(hc);
    // the back of the doorway wall, seen from the hall
    const hbw = mesh(new THREE.PlaneGeometry(hx1 - hx0, h), M.wall);
    hbw.rotation.y = Math.PI;
    hbw.position.set((hx0 + hx1) / 2, h / 2, z0 - jd);
    void hbw;
    const runner = mesh(new RoundedBoxGeometry(0.8, 0.008, 2.2, 2, 0.003), M.rug);
    runner.position.set((dr.x0 + dr.x1) / 2 + 0.25, 0.004, (z0 + hz0) / 2 - 0.2);
    g.add(runner);
    // the door, swung open into the hall against its right wall
    const d = door(M, { w: dr.x1 - dr.x0 - 0.01, h: dr.h - 0.01 });
    d.rotation.y = Math.PI / 2 + 0.12;
    d.position.set(dr.x1 - 0.02, 0.005, z0 - jd + 0.005);
    g.add(d);
    parts.door = d;
    // a faint cool window light at the hall's end (a glazed door to a balcony)
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.9), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.32, 0.45) }));
    glow.position.set((hx0 + hx1) / 2 + 0.2, 1.05, hz0 + 0.01);
    g.add(glow);
  }

  // the dining table and chairs
  const table = diningTable(M);
  g.add(table);
  const rug = mesh(new RoundedBoxGeometry(2.9, 0.012, 2.1, 2, 0.004), M.rug, { cast: false });
  rug.position.set(0, 0.006, 0.05);
  g.add(rug);
  const chairs = [];
  const cpos = [[-0.42, -0.62, 0.0], [0.42, -0.6, -0.05], [-0.45, 0.66, Math.PI + 0.06], [1.12, 0.05, -Math.PI / 2 + 0.1]];
  for (const [x, z, ry] of cpos) {
    const c = chair(M);
    c.position.set(x, 0, z);
    c.rotation.y = ry;
    g.add(c);
    chairs.push(c);
  }
  // sideboard on the back wall, left: a lamp, books, the vase, a plant; a painting above
  const sb = sideboard(M);
  sb.position.set(-1.25, 0, z0 + 0.24);
  g.add(sb);
  const lamp = tableLamp(M);
  lamp.position.set(-1.78, sb.userData.top, z0 + 0.26);
  g.add(lamp);
  const books = bookRow(0.3, { seed: 4, hmin: 0.17, hmax: 0.25 });
  books.rotation.y = 0;
  books.position.set(-1.05, sb.userData.top, z0 + 0.08);
  g.add(books);
  const stack = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const bk = bookRow(0.03, { seed: 30 + k, hmin: 0.24, hmax: 0.26 });
    bk.rotation.z = Math.PI / 2;
    bk.position.set(0.12 - k * 0.006, k * 0.032 + 0.0, 0);
    stack.add(bk);
  }
  stack.position.set(-0.68, sb.userData.top, z0 + 0.16);
  g.add(stack);
  const vase = branchVase(M);
  vase.position.set(-1.38, sb.userData.top, z0 + 0.22);
  g.add(vase);
  const sp = smallPlant(M);
  sp.position.set(-0.6, sb.userData.top + 0.1, z0 + 0.3);
  g.add(sp);
  const pic = framedPicture(M, { w: 0.62, h: 0.8, seed: 12 });
  pic.position.set(-1.25, 1.62, z0 + 0.002);
  g.add(pic);
  const pic2 = framedPicture(M, { w: 0.34, h: 0.44, seed: 21, palette: ['#e5dccb', '#3d5566', '#b9573a', '#d6a74e'] });
  pic2.position.set(0.25, 1.68, z0 + 0.002);
  g.add(pic2);
  // a bookcase on the right wall, by the doorway
  const bc = new THREE.Group();
  const bw = 0.9, bh2 = 2.0, bd = 0.32;
  for (const [ww, hh, dd, x, y] of [[0.022, bh2, bd, -bw / 2, bh2 / 2], [0.022, bh2, bd, bw / 2, bh2 / 2], [bw, 0.022, bd, 0, bh2], [bw, 0.08, bd, 0, 0.04]]) {
    const b = mesh(woodBox(ww, hh, dd, 0.003), M.paint);
    b.position.set(x, y, 0);
    bc.add(b);
  }
  for (let k = 0; k < 5; k++) {
    const y = 0.08 + k * 0.38;
    const s = mesh(woodBox(bw - 0.02, 0.022, bd - 0.01, 0.003), M.paint);
    s.position.set(0, y + 0.011, 0);
    bc.add(s);
    if (k < 5) {
      const row = bookRow(bw - 0.12 - (k % 2) * 0.2, { seed: 50 + k * 7 });
      row.position.set(-bw / 2 + 0.03 + (k % 2) * 0.12, y + 0.022, -bd / 2 + 0.02);
      bc.add(row);
    }
  }
  bc.rotation.y = -Math.PI / 2;
  bc.position.set(x1 - bd / 2, 0, 0.9);
  g.add(bc);
  // the fig in the corner by the window
  const fg = fig(M);
  fg.position.set(x0 + 0.42, 0, z0 + 0.4);
  g.add(fg);
  // the pendant
  const pd = pendant(M, { y: 1.5 });
  g.add(pd);

  return {
    group: g, M, table, chairs, sideboard: sb, lamp, pendant: pd, parts,
    anchors: { lampBulb: lamp.position.clone().add(lamp.userData.bulb), pendant: new THREE.Vector3(0, 1.5 + 0.09, 0) },
  };
}

// ---------------------------------------------------------------- the evening light
// the pendant (a warm cone onto the table, shadowed), the sideboard lamp, dusk through the window (a cool area
// light), a dim hallway; k scales each
let RAL = false;
export function homeLights(st, H, k = {}) {
  if (!RAL) { RectAreaLightUniformsLib.init(); RAL = true; }
  const L = {};
  const pp = H.anchors.pendant;
  L.pendant = spot(0xffc68e, 16 * (k.pendant ?? 1), { pos: [pp.x, pp.y, pp.z], target: [pp.x, 0, pp.z], angle: 1.05, penumbra: 0.75, shadow: 2048, near: 0.05, far: 3, bias: -0.0004 });
  L.pendant.shadow.normalBias = 0.01;
  L.lamp = new THREE.PointLight(0xffb870, 1.6 * (k.lamp ?? 1), 0, 2);
  L.lamp.position.copy(H.anchors.lampBulb);
  L.ceiling = new THREE.PointLight(0xffd2a0, 0.5 * (k.pendant ?? 1), 0, 2);
  L.ceiling.position.set(pp.x, pp.y + 0.5, pp.z);
  const { win, x0 } = ROOM;
  L.window = new THREE.RectAreaLight(0x8ea4d8, 2.2 * (k.window ?? 1), win.z1 - win.z0, win.y1 - win.y0);
  L.window.position.set(x0 - 0.05, (win.y0 + win.y1) / 2, (win.z0 + win.z1) / 2);
  L.window.lookAt(x0 + 1, (win.y0 + win.y1) / 2, (win.z0 + win.z1) / 2);
  L.hall = new THREE.PointLight(0x9fb4e0, 0.8 * (k.hall ?? 1), 0, 2);
  L.hall.position.set((ROOM.door.x0 + ROOM.door.x1) / 2 + 0.2, 2.2, ROOM.hall.z0 + 0.8);
  st.scene.add(L.pendant, L.pendant.target, L.lamp, L.ceiling, L.window, L.hall);
  return L;
}
