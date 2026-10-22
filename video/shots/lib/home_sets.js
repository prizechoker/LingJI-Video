// Close-up sets for shots/design.js: things in a home shaped around a human body — a lever door handle, a flight of
// stairs with a handrail, a wok on a gas hob with its spatula. Each set is built around its own origin; units: metres.
import { THREE } from '../../engine2/core.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { door, bookRow, bake } from './home_room.js';
import { rng } from './kit.js';

const mesh = (geo, mat, cast = true) => {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
};
function lathe(pts, segs = 64, n = 6) {
  const c = new THREE.CatmullRomCurve3(pts.map(([r, y]) => new THREE.Vector3(r, y, 0)), false, 'centripetal');
  const p = c.getSpacedPoints(pts.length * n).map((v) => new THREE.Vector2(Math.max(v.x, 1e-5), v.y));
  const g = new THREE.LatheGeometry(p, segs);
  g.computeVertexNormals();
  return g;
}
// box with UVs in metres (grain along the longest side)
function box(w, h, d, r = 0.002, seg = 2) {
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

// ---------------------------------------------------------------- the door: a wall, a casing, the oak door closed
// set space: the wall in the plane z = 0 (room side +z), the door's latch edge at x = 0.84, the handle at y = 1.0
export function doorSet(M) {
  const g = new THREE.Group();
  const w = 0.84, h = 2.04;
  const d = door(M, { w, h });
  d.position.set(0, 0, 0.0);
  g.add(d);
  // the wall around the opening and the casing
  const wallM = M.wall;
  const wallG = new THREE.Shape();
  wallG.moveTo(-1.5, 0); wallG.lineTo(2.4, 0); wallG.lineTo(2.4, 2.7); wallG.lineTo(-1.5, 2.7); wallG.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-0.005, 0); hole.lineTo(-0.005, h + 0.005); hole.lineTo(w + 0.005, h + 0.005); hole.lineTo(w + 0.005, 0); hole.closePath();
  wallG.holes.push(hole);
  const wg = new THREE.ShapeGeometry(wallG);
  const wall = mesh(wg, wallM, false);
  wall.position.z = -0.02;
  // uv in metres
  const uv = wg.attributes.uv, pos = wg.attributes.position;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i), pos.getY(i));
  g.add(wall);
  const cw = 0.075;
  for (const [ww, hh, x, y] of [[cw, h + cw, -cw / 2 - 0.006, (h + cw) / 2], [cw, h + cw, w + cw / 2 + 0.006, (h + cw) / 2], [w + 2 * cw + 0.012, cw, w / 2, h + cw / 2 + 0.006]]) {
    const b = mesh(box(ww, hh, 0.022, 0.005, 3), M.paint);
    b.position.set(x, y, 0.0);
    g.add(b);
  }
  // a little of the hallway: a skirting, a coat on a hook, a framed print, out of focus
  const sk = mesh(box(3.9, 0.11, 0.016, 0.003), M.paint);
  sk.position.set(0.45, 0.055, -0.01);
  g.add(sk);
  g.userData.handle = new THREE.Vector3(w - 0.065, 1.0, 0.02);
  return g;
}

// ---------------------------------------------------------------- a flight of stairs
// set space: the first riser at z = 0 rising toward -z; the open side (balusters, handrail) at x = 0, the wall at x = -W
export function stairSet(M, st) {
  const g = new THREE.Group();
  const n = 12, rise = 0.176, go = 0.265, W = 0.95, tt = 0.032, nose = 0.022;
  const oak = M.oak;
  for (let k = 0; k < n; k++) {
    const tr = mesh(box(W + 0.03, tt, go + nose, 0.006, 3), oak);
    tr.position.set(-W / 2 + 0.015, (k + 1) * rise - tt / 2, -k * go - go / 2 + nose / 2);
    g.add(tr);
    const rs = mesh(box(W, rise - tt, 0.018, 0.002), M.paint);
    rs.position.set(-W / 2, k * rise + (rise - tt) / 2, -k * go + 0.0 - 0.009);
    g.add(rs);
  }
  // a runner carpet held by brass rods
  const runM = new THREE.MeshStandardMaterial({ ...st.pbr('Carpet016', { repeat: [2, 2] }), color: 0x6e2f2a, roughness: 1 });
  const runW = 0.62;
  const prof = [];
  for (let k = 0; k < n; k++) {
    prof.push([0.004, k * rise + 0.002], [0.004, (k + 1) * rise + 0.006], [-go, (k + 1) * rise + 0.006]);
  }
  const shape = new THREE.Shape();
  shape.moveTo(-runW / 2, 0); shape.lineTo(runW / 2, 0); shape.lineTo(runW / 2, 0.006); shape.lineTo(-runW / 2, 0.006); shape.closePath();
  const path = new THREE.CurvePath();
  let prev = new THREE.Vector3(-W / 2, 0.002, 0.03);
  for (let k = 0; k < n; k++) {
    const a = new THREE.Vector3(-W / 2, (k + 1) * rise + 0.004, -k * go + nose + 0.008);
    const b = new THREE.Vector3(-W / 2, (k + 1) * rise + 0.004, -(k + 1) * go + nose + 0.008);
    path.add(new THREE.LineCurve3(prev, a));
    path.add(new THREE.LineCurve3(a, b));
    prev = b;
  }
  // the runner as a flat strip following the steps
  const pts = path.getPoints(4);
  const rp = [], ri = [], ru = [];
  let acc = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i) acc += pts[i].distanceTo(pts[i - 1]);
    for (const s of [-1, 1]) { rp.push(pts[i].x + s * runW / 2, pts[i].y, pts[i].z); ru.push((s + 1) / 2 * runW * 2, acc * 2); }
    if (i) { const a = (i - 1) * 2; ri.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
  rg.setAttribute('uv', new THREE.Float32BufferAttribute(ru, 2));
  rg.setIndex(ri);
  rg.computeVertexNormals();
  const runner = mesh(rg, runM, false);
  runner.material.side = THREE.DoubleSide;
  g.add(runner);
  void shape; void prof;
  for (let k = 0; k < n; k++) {
    const rod = mesh(new THREE.CylinderGeometry(0.006, 0.006, runW + 0.06, 12), M.brass);
    rod.rotation.z = Math.PI / 2;
    rod.position.set(-W / 2, (k) * rise + 0.012, -k * go + 0.004);
    g.add(rod);
  }
  // the open side: a stringer, two balusters per tread, the handrail, a newel post
  const pitch = Math.atan2(rise, go);
  const strLen = Math.hypot(n * rise, n * go);
  const str = mesh(box(0.04, 0.26, strLen + 0.1, 0.004), M.paint);
  str.position.set(0.02, n * rise / 2 - 0.02, -n * go / 2 + 0.02);
  str.rotation.x = pitch;
  g.add(str);
  const railH = 0.9;
  const balM = oak;
  for (let k = 0; k < n; k++) {
    for (const f of [0.25, 0.75]) {
      const z = -k * go - f * go + nose;
      const y0 = (k + 1) * rise;
      const y1 = railH + (-z / go) * rise - 0.03;
      const b = mesh(box(0.032, y1 - y0, 0.032, 0.004), balM);
      b.position.set(0.0, (y0 + y1) / 2, z);
      g.add(b);
    }
  }
  const newel = mesh(box(0.09, railH + 0.22, 0.09, 0.008, 3), oak);
  newel.position.set(0.0, (railH + 0.22) / 2, 0.06);
  g.add(newel);
  const cap = mesh(box(0.11, 0.04, 0.11, 0.012, 3), oak);
  cap.position.set(0, railH + 0.24, 0.06);
  g.add(cap);
  // handrail: a rounded oak section along the pitch
  const rs = new THREE.Shape();
  rs.moveTo(-0.028, -0.022); rs.lineTo(0.028, -0.022);
  rs.bezierCurveTo(0.036, 0.0, 0.03, 0.03, 0, 0.032);
  rs.bezierCurveTo(-0.03, 0.03, -0.036, 0.0, -0.028, -0.022);
  const rail = new THREE.ExtrudeGeometry(rs, { depth: strLen + 0.05, bevelEnabled: false, curveSegments: 16 });
  rail.translate(0, 0, -strLen - 0.05);
  const railMesh = mesh(rail, oak);
  railMesh.position.set(0, railH + 0.03, 0.06 - 0.05);
  railMesh.rotation.x = pitch;
  g.add(railMesh);
  // the wall side: plaster, a skirting stringer, a framed print
  const smooth = M.wall.clone();
  smooth.normalScale = new THREE.Vector2(0.12, 0.12);
  const wall = mesh(new THREE.PlaneGeometry(6, 5), smooth, false);
  wall.rotation.y = Math.PI / 2;
  wall.position.set(-W - 0.01, 1.8, -2);
  g.add(wall);
  const wstr = mesh(box(0.025, 0.22, strLen + 0.1, 0.004), M.paint);
  wstr.position.set(-W + 0.01, n * rise / 2 + 0.03, -n * go / 2 + 0.02);
  wstr.rotation.x = pitch;
  g.add(wstr);
  // the floor at the foot of the stairs
  const fl = mesh(new THREE.PlaneGeometry(6, 6).rotateX(-Math.PI / 2), M.floor, false);
  fl.position.set(0, 0, 2.5);
  const uv = fl.geometry.attributes.uv, pos = fl.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i), pos.getZ(i));
  g.add(fl);
  // the landing wall far up, and the back wall
  const back = mesh(new THREE.PlaneGeometry(4, 5), M.wall, false);
  back.position.set(-0.5, 2.5, -n * go - 0.6);
  g.add(back);
  g.userData.railAt = (k) => new THREE.Vector3(0, railH + 0.06 + k * rise, -k * go + 0.06 - 0.02);
  g.userData.stepAt = (k) => new THREE.Vector3(-W / 2, (k + 1) * rise, -k * go - go / 2);
  return g;
}

// ---------------------------------------------------------------- the stove: a gas hob, a wok, the spatula
// set space: counter top at y = 0.9, front edge at z = 0, the wall (tiles) at z = -0.62
function tileTexture() {
  const W = 1024, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#d8d2c6';
  g.fillRect(0, 0, W, H);
  const R = rng(13);
  const tw = 128, th = 64;
  for (let j = 0; j < H / th; j++) for (let i = -1; i < W / tw + 1; i++) {
    const x = i * tw + (j % 2) * tw / 2, y = j * th;
    const v = 236 + R() * 12;
    const gr = g.createLinearGradient(x, y, x, y + th);
    gr.addColorStop(0, `rgb(${v},${v - 4},${v - 10})`);
    gr.addColorStop(1, `rgb(${v - 8},${v - 12},${v - 18})`);
    g.fillStyle = gr;
    g.fillRect(x + 3, y + 3, tw - 6, th - 6);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
export function stoveSet(M, st) {
  const g = new THREE.Group();
  const top = 0.9;
  const stone = st.pbr('Marble021', { repeat: [1.5, 1.5] });
  const counter = mesh(box(2.4, 0.03, 0.64, 0.004, 2), new THREE.MeshPhysicalMaterial({ ...stone, color: 0x8a8580, roughness: 0.3, clearcoat: 0.4, clearcoatRoughness: 0.15 }));
  counter.position.set(0, top - 0.015, -0.32);
  g.add(counter);
  const tiles = new THREE.MeshPhysicalMaterial({ map: tileTexture(), roughness: 0.15, clearcoat: 0.6, clearcoatRoughness: 0.1 });
  tiles.map.repeat.set(2.4 / 0.6, 1.2 / 0.3);
  const wall = mesh(new THREE.PlaneGeometry(2.4, 1.2), tiles, false);
  wall.position.set(0, top + 0.6, -0.62);
  g.add(wall);
  // the hob: black glass with two burners and cast-iron grates
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x050505, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03 });
  const hob = mesh(box(0.74, 0.012, 0.5, 0.004, 2), glass, false);
  hob.position.set(0, top + 0.006, -0.3);
  g.add(hob);
  const iron = new THREE.MeshStandardMaterial({ color: 0x1c1b1a, roughness: 0.7, metalness: 0.5 });
  const brassB = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.4, metalness: 0.9 });
  const burners = [[-0.18, -0.26], [0.18, -0.3]];
  for (const [bx, bz] of burners) {
    const ring = mesh(lathe([[0, 0], [0.06, 0], [0.062, 0.012], [0.05, 0.02], [0.035, 0.02], [0.034, 0.03], [0, 0.03]], 40), iron);
    ring.position.set(bx, top + 0.012, bz);
    g.add(ring);
    const capB = mesh(new THREE.CylinderGeometry(0.03, 0.032, 0.008, 32), brassB);
    capB.position.set(bx, top + 0.046, bz);
    g.add(capB);
    // the grate: a ring and five fingers
    const gr = mesh(new THREE.TorusGeometry(0.115, 0.007, 8, 48), iron);
    gr.rotation.x = Math.PI / 2;
    gr.position.set(bx, top + 0.03, bz);
    g.add(gr);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 0.3;
      const f = mesh(box(0.07, 0.03, 0.012, 0.003), iron);
      f.position.set(bx + Math.cos(a) * 0.09, top + 0.045, bz + Math.sin(a) * 0.09);
      f.rotation.y = -a;
      g.add(f);
    }
  }
  // knobs on the front edge
  for (const kx of [-0.25, -0.15, 0.15, 0.25]) {
    const k = mesh(lathe([[0, 0], [0.02, 0], [0.021, 0.012], [0.016, 0.025], [0, 0.026]], 32), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.35, metalness: 0.7 }));
    k.rotation.x = Math.PI / 2;
    k.position.set(kx, top + 0.006, -0.06);
    k.scale.set(1, 0.4, 1);
    g.add(k);
  }
  // the wok: carbon steel, seasoned dark with a blued, oily sheen; a long handle with a wooden grip and a loop
  const wokM = new THREE.MeshPhysicalMaterial({ color: 0x242020, metalness: 0.75, roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.25, iridescence: 0.25, iridescenceIOR: 1.6 });
  const R0 = 0.17, D = 0.095;
  const wp = [];
  for (let i = 0; i <= 24; i++) { const a = (i / 24) * (Math.PI / 2) * 0.92; wp.push([R0 * Math.sin(a) / Math.sin(Math.PI / 2 * 0.92), D * (1 - Math.cos(a)) / (1 - Math.cos(Math.PI / 2 * 0.92))]); }
  const outer = wp.map(([r, y]) => [r, y]);
  const inner = wp.slice().reverse().map(([r, y]) => [Math.max(0, r - 0.0025), y + 0.0025]);
  const wok = mesh(lathe([...outer, [R0 + 0.003, D + 0.002], ...inner], 96, 2), wokM);
  const [wx, wz] = burners[0];
  wok.position.set(wx, top + 0.052, wz);
  wok.rotation.z = 0.04;
  g.add(wok);
  const hm = new THREE.MeshStandardMaterial({ color: 0x3a3634, metalness: 0.9, roughness: 0.35 });
  const woodM = new THREE.MeshPhysicalMaterial({ ...st.pbr('Wood022', { repeat: [0.3, 1] }), color: 0xd2ae84, roughness: 0.55, clearcoat: 0.2 });
  // the wok's long handle, pointing back and to the left (away from the camera)
  const hRoot = new THREE.Group();
  hRoot.position.set(wx, top + 0.052, wz);
  hRoot.rotation.y = 2.5;
  const hdl = new THREE.Group();
  const shaft = mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.14, 16), hm);
  shaft.rotation.z = Math.PI / 2;
  shaft.position.x = 0.07;
  hdl.add(shaft);
  const grip = mesh(lathe([[0, 0], [0.016, 0], [0.019, 0.04], [0.018, 0.16], [0.014, 0.19], [0, 0.19]], 24), woodM);
  grip.rotation.z = -Math.PI / 2;
  grip.position.x = 0.13;
  hdl.add(grip);
  hdl.position.set(R0 - 0.01, D * 0.82, 0);
  hdl.rotation.z = 0.2;
  hRoot.add(hdl);
  g.add(hRoot);
  // the spatula (锅铲): a steel shovel blade lying on the bottom of the wok, its neck bent up at ~45 deg, the
  // wooden handle resting on the rim and sticking out to the right
  const sp = new THREE.Group();
  const bladeS = new THREE.Shape();
  bladeS.moveTo(-0.048, 0); bladeS.quadraticCurveTo(-0.054, 0.07, -0.036, 0.1); bladeS.lineTo(0.036, 0.1);
  bladeS.quadraticCurveTo(0.054, 0.07, 0.048, 0); bladeS.quadraticCurveTo(0, -0.01, -0.048, 0);
  const bladeG = new THREE.ExtrudeGeometry(bladeS, { depth: 0.0014, bevelEnabled: true, bevelThickness: 0.0004, bevelSize: 0.0006, bevelSegments: 2, curveSegments: 24 });
  // a shallow scoop across the width, the sides turned up
  const bp = bladeG.attributes.position;
  for (let i = 0; i < bp.count; i++) bp.setZ(i, bp.getZ(i) + 2.2 * bp.getX(i) * bp.getX(i));
  bladeG.computeVertexNormals();
  const steel = new THREE.MeshPhysicalMaterial({ color: 0xd0d0d0, metalness: 1, roughness: 0.25, anisotropy: 0.5 });
  const blade = mesh(bladeG, steel);
  blade.rotation.x = -Math.PI / 2;  // flat, the tip toward -z, the sides turned up
  blade.position.y = 0.001;
  sp.add(blade);
  const neckDir = new THREE.Vector3(0, Math.sin(0.8), Math.cos(0.8));
  const neckLen = 0.15;
  const neck = mesh(new THREE.CylinderGeometry(0.0042, 0.0055, neckLen, 12), steel);
  neck.position.copy(neckDir.clone().multiplyScalar(neckLen / 2));
  neck.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), neckDir);
  sp.add(neck);
  const collar = mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.012, 16), steel);
  collar.position.copy(neckDir.clone().multiplyScalar(neckLen + 0.004));
  collar.quaternion.copy(neck.quaternion);
  sp.add(collar);
  const sg = mesh(lathe([[0, 0], [0.011, 0], [0.013, 0.03], [0.0125, 0.13], [0.0095, 0.148], [0, 0.15]], 24), woodM);
  sg.position.copy(neckDir.clone().multiplyScalar(neckLen + 0.01));
  sg.quaternion.copy(neck.quaternion);
  sp.add(sg);
  const yaw = 1.25;  // the handle toward +x, a little toward the camera
  sp.rotation.order = 'YXZ';
  sp.rotation.set(-0.1, yaw, 0);
  const off = 0.075;
  sp.position.set(wx + Math.sin(yaw) * off, top + 0.052 + 0.0025 + 0.012, wz + Math.cos(yaw) * off);
  g.add(sp);
  // a crock of utensils and a bottle at the back, out of focus
  const crock = mesh(lathe([[0, 0], [0.055, 0], [0.06, 0.02], [0.06, 0.15], [0.056, 0.16], [0, 0.155]], 32), new THREE.MeshPhysicalMaterial({ color: 0x6c7a72, roughness: 0.3, clearcoat: 0.6 }));
  crock.position.set(0.48, top, -0.5);
  g.add(crock);
  for (let k = 0; k < 4; k++) {
    const u = mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.32, 10), k % 2 ? woodM : steel);
    u.position.set(0.48 + (k - 1.5) * 0.015, top + 0.27, -0.5 + (k % 2) * 0.01);
    u.rotation.z = (k - 1.5) * 0.12;
    g.add(u);
  }
  const bottle = mesh(lathe([[0, 0], [0.032, 0], [0.033, 0.14], [0.02, 0.18], [0.012, 0.21], [0.012, 0.23], [0, 0.23]], 32), new THREE.MeshPhysicalMaterial({ color: 0x2a1408, roughness: 0.05, transmission: 0, clearcoat: 1 }));
  bottle.position.set(-0.5, top, -0.48);
  g.add(bottle);
  g.userData.spatula = sp;
  g.userData.wok = new THREE.Vector3(wx, top + 0.1, wz);
  g.userData.blade = new THREE.Vector3(wx + Math.sin(yaw) * (off - 0.05), top + 0.07, wz + Math.cos(yaw) * (off - 0.05));
  void bookRow; void bake;
  return g;
}
