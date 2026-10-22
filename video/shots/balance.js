// C22 — Moravec's paradox on an antique brass balance. One pan holds a small go board with a few stones, the other a
// toddler's things (wooden ABC blocks and a sippy cup). Low-key: one warm key, a cool rim, black beyond.
// The balance starts nearly level (a last breath of sway); at cue "easy" the board's side lifts a little (light,
// trivial); at cue "hard" the toys' side sinks heavily and the beam swings, overshoots and settles. The beam is a
// damped oscillator, each pan a damped pendulum hanging from the beam's end (integrated once, in create()).
// p: { tilt1 (deg, after "easy", default 3.5), tilt2 (deg, after "hard", default 11), labels (default true),
//      exposure, key, rim }
// cues (s from the shot's start, defaults relative to dur):
//   name  — the caption 汉斯·莫拉维克 appears (at 莫拉维克)                       default 0.14 dur
//   easy  — the board's side rises; "下棋" label (at 让电脑下棋并不难)           default 0.42 dur
//   hard  — the toys' side sinks heavily (at 难的是)                              default 0.6 dur
//   look, walk, grab — 看一眼 · 走两步 · 伸手拿个东西 appear one by one          default 0.76 / 0.83 / 0.89 dur
import { Studio, THREE, spot } from '../engine2/core.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { stoneGeometry, stoneMaterials } from '../engine2/materials.js';
import { toyBlock, sippyCup } from './lib/home_props.js';
import { ss, sstep, clamp, lerp, breathe, grade, caption, callout, text, measure, FONT, toScreen, V3, rng } from './lib/kit.js';

const DEG = Math.PI / 180;
const PIVOT = 0.43;   // beam pivot height above the table
const ARM = 0.3;      // pivot to each end's knife edge
const HANG = 0.265;   // knife edge to the pan's rim
const PAN_R = 0.135;

// ---------------------------------------------------------------- materials
function brass(st, env, { repeat = [1, 1], rough = 0.62, tint = 0xd6bc88, envI = 1.0 } = {}) {
  const tx = st.pbr('Metal048C', { repeat });
  return new THREE.MeshPhysicalMaterial({
    ...tx, color: tint, metalness: 1, roughness: rough, normalScale: new THREE.Vector2(0.3, 0.3),
    envMap: env, envMapIntensity: envI,
  });
}

// a photographer's environment for the brass: black studio, a broad warm softbox above and behind the camera, a
// tall strip to the left, a cool strip behind right (the rim), a dim warm floor (the desk). Built once per renderer.
const ENV = new WeakMap();
function softboxEnv(renderer) {
  if (ENV.has(renderer)) return ENV.get(renderer);
  const sc = new THREE.Scene();
  sc.background = new THREE.Color(0x000000);
  const card = (w, h, dir, rgb, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(...rgb).multiplyScalar(k), side: THREE.DoubleSide }));
    const d = new THREE.Vector3(...dir).normalize();
    m.position.copy(d.multiplyScalar(4));
    m.lookAt(0, 0, 0);
    sc.add(m);
  };
  card(5.5, 1.6, [0.1, 0.45, 1], [1, 0.86, 0.7], 2.2);    // broad softbox over the camera
  card(5.0, 2.0, [0.1, 0.65, -1], [1, 0.88, 0.72], 1.6);  // softbox high behind (it lights the pans' insides)
  card(1.0, 4.0, [-1, 0.35, 0.5], [1, 0.88, 0.74], 2.6);  // tall strip, left
  card(0.7, 3.5, [1, 0.25, -0.6], [0.8, 0.88, 1], 2.0);   // cool strip, behind right
  card(4, 4, [0, 1, 0.15], [1, 0.9, 0.8], 0.35);          // a dim ceiling
  // the lit desk in front (a warm, low bounce), dark beyond
  const floor = new THREE.Mesh(new THREE.CircleGeometry(8, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.03, 0.018) }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.6;
  sc.add(floor);
  card(4.5, 1.2, [0, -0.18, 1], [0.55, 0.32, 0.17], 0.9);
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromScene(sc, 0.02).texture;
  pm.dispose();
  ENV.set(renderer, env);
  return env;
}

// ---------------------------------------------------------------- the balance
function lathe(pts, segs = 96) {
  const c = new THREE.CatmullRomCurve3(pts.map(([r, y]) => new THREE.Vector3(r, y, 0)), false, 'centripetal');
  const p = c.getSpacedPoints(pts.length * 8).map((v) => new THREE.Vector2(Math.max(v.x, 1e-5), v.y));
  const g = new THREE.LatheGeometry(p, segs);
  g.computeVertexNormals();
  return g;
}

function column(mat) {
  // a turned brass pillar: stepped foot, bead, tapering shaft with rings, a capital under the fork
  const P = [
    [0.0, 0.0], [0.05, 0.0], [0.05, 0.004], [0.047, 0.007], [0.044, 0.008], [0.04, 0.012], [0.03, 0.016], [0.024, 0.022],
    [0.026, 0.028], [0.022, 0.034], [0.016, 0.038], [0.0135, 0.05], [0.0125, 0.12], [0.016, 0.125], [0.0165, 0.13], [0.0128, 0.136],
    [0.0115, 0.22], [0.0108, 0.31], [0.014, 0.318], [0.018, 0.326], [0.0175, 0.334], [0.013, 0.338], [0.0125, 0.346],
    [0.017, 0.352], [0.02, 0.356], [0.0, 0.357],
  ];
  const m = new THREE.Mesh(lathe(P, 72), mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

function beamGeometry() {
  const s = new THREE.Shape();
  const N = 40;
  const hy = (x) => 0.0042 + 0.0068 * Math.pow(1 - Math.abs(x) / ARM, 1.5);
  s.moveTo(-ARM, hy(-ARM));
  for (let i = 1; i <= N; i++) {
    const x = -ARM + (2 * ARM * i) / N;
    s.lineTo(x, hy(x));
  }
  s.absarc(ARM, 0, 0.0062, Math.PI / 2, -Math.PI / 2, true);
  for (let i = N - 1; i >= 0; i--) {
    const x = -ARM + (2 * ARM * i) / N;
    s.lineTo(x, -hy(x));
  }
  s.absarc(-ARM, 0, 0.0062, -Math.PI / 2, -Math.PI * 1.5, true);
  // pierced holes at the ends (where the stirrups hook on)
  for (const sx of [-1, 1]) {
    const h = new THREE.Path();
    h.absarc(sx * ARM, 0, 0.0024, 0, Math.PI * 2, false);
    s.holes.push(h);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.0032, bevelEnabled: true, bevelThickness: 0.0016, bevelSize: 0.0012, bevelSegments: 4, curveSegments: 24 });
  g.translate(0, 0, -0.0016);
  g.computeVertexNormals();
  return g;
}

// the pan with its stirrup, ring and three chains: a rigid assembly pivoting at the knife edge (local origin)
function panAssembly(mat) {
  const g = new THREE.Group();
  // stirrup: a loop over the knife edge, a short stem, the ring the chains hang from
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.0062, 0.0012, 10, 32), mat);
  loop.rotation.y = Math.PI / 2;
  loop.position.y = -0.002;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0016, 0.022, 12), mat);
  stem.position.y = -0.019;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.003, 16, 12), mat);
  knob.position.y = -0.03;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0055, 0.0011, 10, 32), mat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.034;
  for (const m of [loop, stem, knob, ring]) { m.castShadow = true; g.add(m); }
  // the dish: spun brass, a flat bottom, a shallow wall and a rolled bead at the rim
  const r = PAN_R, d = 0.022;
  const prof = [
    [0, -d - 0.0012], [r * 0.74, -d - 0.0012], [r * 0.86, -d * 0.82], [r * 0.95, -d * 0.4], [r - 0.002, -0.002], [r, 0.0005],
    [r - 0.0016, 0.0021], [r - 0.003, 0.0004], [r * 0.95 - 0.0014, -d * 0.4 + 0.0004], [r * 0.86 - 0.0014, -d * 0.82 + 0.0012],
    [r * 0.74, -d + 0.0002], [0, -d + 0.0002],
  ];
  const dish = new THREE.Mesh(lathe(prof, 128), mat);
  dish.position.y = -HANG;
  dish.castShadow = dish.receiveShadow = true;
  g.add(dish);
  // three chains from the ring to lugs on the rim
  const link = new THREE.TorusGeometry(0.0027, 0.00075, 6, 14);
  link.scale(1, 1.75, 1);
  const lugs = [0, 1, 2].map((k) => (k * 2 * Math.PI) / 3 + Math.PI / 2);
  const pitch = 0.0068;
  const mats4 = [];
  for (const a of lugs) {
    const p0 = V3(Math.cos(a) * 0.0055, -0.034, Math.sin(a) * 0.0055);
    const p1 = V3(Math.cos(a) * (r - 0.004), -HANG + 0.003, Math.sin(a) * (r - 0.004));
    const dir = p1.clone().sub(p0);
    const L = dir.length();
    dir.normalize();
    const n = Math.floor(L / pitch);
    const q0 = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), dir);
    for (let i = 0; i <= n; i++) {
      const p = p0.clone().addScaledVector(dir, (i / n) * L);
      const q = q0.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), (i % 2) * Math.PI / 2 + a));
      mats4.push(new THREE.Matrix4().compose(p, q, V3(1, 1, 1)));
    }
    // a small lug on the rim
    const lug = new THREE.Mesh(new THREE.TorusGeometry(0.0028, 0.0009, 8, 20), mat);
    lug.position.set(Math.cos(a) * (r - 0.003), -HANG + 0.0035, Math.sin(a) * (r - 0.003));
    lug.lookAt(lug.position.clone().add(V3(-Math.sin(a), 0, Math.cos(a))));
    g.add(lug);
  }
  const chains = new THREE.InstancedMesh(link, mat, mats4.length);
  mats4.forEach((m, i) => chains.setMatrixAt(i, m));
  chains.castShadow = true;
  g.add(chains);
  // what sits in the pan is added to `load`, whose origin is the dish's inner floor
  const load = new THREE.Group();
  load.position.y = -HANG - d + 0.0002;
  g.add(load);
  g.userData.load = load;
  return g;
}

// a little scale plate on the column the pointer reads against: brass, engraved ticks
function scalePlate(mat0) {
  const n = 512;
  const c = document.createElement('canvas');
  c.width = n;
  c.height = n / 2;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, n, n / 2);
  g.strokeStyle = '#fff';
  g.lineCap = 'round';
  const cx = n / 2, cy = -n * 0.9, R0 = n * 1.12;
  for (let k = -10; k <= 10; k++) {
    const a = Math.PI / 2 + k * 1.6 * DEG * 2.2;
    const L = k === 0 ? 0.13 : k % 5 === 0 ? 0.1 : 0.06;
    g.lineWidth = k === 0 ? 5 : 3;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * R0, cy + Math.sin(a) * R0);
    g.lineTo(cx + Math.cos(a) * (R0 - L * n), cy + Math.sin(a) * (R0 - L * n));
    g.stroke();
  }
  const engr = new THREE.CanvasTexture(c);
  const m = mat0.clone();
  // engraved lines: darker, rougher
  m.onBeforeCompile = (s) => {
    s.uniforms.engr = { value: engr };
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D engr;')
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat eg = texture2D( engr, vUv ).r;\ndiffuseColor.rgb *= 1.0 - 0.9 * eg;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix( roughnessFactor, 0.85, texture2D( engr, vUv ).r );');
  };
  m.defines = { USE_UV: '' };
  m.customProgramCacheKey = () => 'scaleplate';
  const s = new THREE.Shape();
  s.moveTo(-0.034, 0.0);
  s.quadraticCurveTo(0, -0.008, 0.034, 0.0);
  s.lineTo(0.03, 0.017);
  s.quadraticCurveTo(0, 0.01, -0.03, 0.017);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.0012, bevelEnabled: true, bevelThickness: 0.0003, bevelSize: 0.0003, bevelSegments: 2 });
  // planar uv over the plate's face
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + 0.034) / 0.068, 1 - (pos.getY(i) + 0.008) / 0.025);
  uv.needsUpdate = true;
  const mesh = new THREE.Mesh(geo, m);
  mesh.castShadow = true;
  return mesh;
}

async function buildBalance(st, env) {
  const root = new THREE.Group();
  const benv = softboxEnv(st.renderer);
  const mat = brass(st, benv, { repeat: [1, 1] });
  const matFine = brass(st, benv, { repeat: [0.3, 0.3], rough: 0.6 });
  // the wooden base: a turned mahogany plinth with an ogee edge, on a brass foot ring
  const wood = st.pbr('Wood026', { repeat: [2, 0.5] });
  const wmat = new THREE.MeshPhysicalMaterial({ ...wood, color: 0xa0705a, roughness: 0.45, clearcoat: 0.9, clearcoatRoughness: 0.1, envMap: env, envMapIntensity: 0.5 });
  const baseTop = 0.05;
  const bp = [[0, 0.004], [0.112, 0.004], [0.115, 0.007], [0.115, 0.014], [0.111, 0.018], [0.104, 0.02], [0.1, 0.026], [0.097, 0.034],
    [0.09, 0.04], [0.082, 0.043], [0.078, 0.046], [0.074, 0.049], [0.06, baseTop], [0, baseTop]];
  const base = new THREE.Mesh(lathe(bp, 128), wmat);
  base.castShadow = base.receiveShadow = true;
  root.add(base);
  const foot = new THREE.Mesh(lathe([[0, 0], [0.11, 0], [0.113, 0.0015], [0.113, 0.0035], [0.11, 0.005], [0, 0.005]], 128), mat);
  foot.castShadow = foot.receiveShadow = true;
  root.add(foot);
  const col = column(mat);
  col.position.y = baseTop;
  root.add(col);
  const capTop = baseTop + 0.357;
  // the fork holding the beam's pivot pin, with a ball finial above
  for (const sz of [-1, 1]) {
    const cheek = new THREE.Mesh(new RoundedBoxGeometry(0.022, PIVOT - capTop + 0.028, 0.004, 2, 0.0015), mat);
    cheek.position.set(0, (capTop + PIVOT + 0.028) / 2, sz * 0.0058);
    cheek.castShadow = true;
    root.add(cheek);
  }
  const bridge = new THREE.Mesh(new RoundedBoxGeometry(0.024, 0.006, 0.0166, 2, 0.002), mat);
  bridge.position.y = PIVOT + 0.03;
  root.add(bridge);
  const finial = new THREE.Mesh(lathe([[0, 0], [0.004, 0.0], [0.0065, 0.004], [0.004, 0.009], [0.0075, 0.016], [0.0085, 0.022], [0.006, 0.03], [0.0015, 0.036], [0, 0.0365]], 48), mat);
  finial.position.y = PIVOT + 0.033;
  finial.castShadow = true;
  root.add(finial);
  // the scale plate on the column
  const plate = scalePlate(matFine);
  plate.position.set(0, PIVOT - 0.168, 0.0125);
  root.add(plate);

  // the beam (pivots at PIVOT): body, centre boss, pin, the pointer hanging down in front of the column
  const beam = new THREE.Group();
  beam.position.y = PIVOT;
  root.add(beam);
  const bm = new THREE.Mesh(beamGeometry(), matFine);
  bm.castShadow = bm.receiveShadow = true;
  beam.add(bm);
  const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0125, 0.0068, 40), mat);
  boss.rotation.x = Math.PI / 2;
  beam.add(boss);
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0028, 0.0185, 16), mat);
  pin.rotation.x = Math.PI / 2;
  beam.add(pin);
  const pointer = new THREE.Mesh(new THREE.CylinderGeometry(0.0006, 0.0016, 0.155, 10), matFine);
  pointer.position.set(0, -0.0775 - 0.012, 0.0088);
  pointer.castShadow = true;
  beam.add(pointer);
  const pointerRoot = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.004, 16), mat);
  pointerRoot.rotation.x = Math.PI / 2;
  pointerRoot.position.set(0, -0.006, 0.0062);
  beam.add(pointerRoot);
  // the pans
  const pans = [-1, 1].map((sx) => {
    const p = panAssembly(mat);
    root.add(p);
    return p;
  });
  return { root, beam, pans, mats: { brass: mat, wood: wmat } };
}

// a miniature table goban: kaya top with a 9 x 9 grid, four turned legs, a few stones (top of the board at y = top)
const GB = { w: 0.15, d: 0.16, h: 0.04, leg: 0.022, n: 9 };
function loadImage(url) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
}
async function miniGoban(st, env) {
  const g = new THREE.Group();
  const top = GB.leg + GB.h;
  const N = 1024;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const c = cv.getContext('2d');
  const im = await loadImage('../assets/textures/Wood022_Color.jpg');
  c.filter = 'saturate(1.15) brightness(1.06)';
  c.drawImage(im, 0, 0, im.width * 0.35, im.height, 0, 0, N, N);  // a narrow strip: fine straight grain
  c.filter = 'none';
  c.fillStyle = 'rgba(236,190,118,0.18)';
  c.fillRect(0, 0, N, N);
  const sx = (GB.w - 0.024) / (GB.n - 1), sz = (GB.d - 0.026) / (GB.n - 1);
  const u = (x) => (x / GB.w + 0.5) * N, v = (z) => (z / GB.d + 0.5) * N;
  const X = (i) => (i - (GB.n - 1) / 2) * sx, Z = (j) => (j - (GB.n - 1) / 2) * sz;
  c.strokeStyle = 'rgba(28,18,10,0.92)';
  for (let k = 0; k < GB.n; k++) {
    c.lineWidth = k === 0 || k === GB.n - 1 ? 4 : 2.6;
    c.beginPath(); c.moveTo(u(X(k)), v(Z(0))); c.lineTo(u(X(k)), v(Z(GB.n - 1))); c.stroke();
    c.beginPath(); c.moveTo(u(X(0)), v(Z(k))); c.lineTo(u(X(GB.n - 1)), v(Z(k))); c.stroke();
  }
  c.fillStyle = 'rgba(28,18,10,0.95)';
  for (const [i, j] of [[2, 2], [6, 2], [2, 6], [6, 6], [4, 4]]) {
    c.beginPath(); c.arc(u(X(i)), v(Z(j)), 7, 0, Math.PI * 2); c.fill();
  }
  const tmap = new THREE.CanvasTexture(cv);
  tmap.colorSpace = THREE.SRGBColorSpace;
  tmap.anisotropy = 8;
  const wood = st.pbr('Wood022', { repeat: [0.35, 0.12] });
  const side = new THREE.MeshPhysicalMaterial({ ...wood, color: 0xf2d4a2, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.3, envMap: env, envMapIntensity: 0.4 });
  const topM = new THREE.MeshPhysicalMaterial({ map: tmap, normalMap: wood.normalMap, normalScale: new THREE.Vector2(0.2, 0.2), roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.25, envMap: env, envMapIntensity: 0.4 });
  const body = new THREE.Mesh(new RoundedBoxGeometry(GB.w, GB.h, GB.d, 3, 0.0018), side);
  body.position.y = GB.leg + GB.h / 2;
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(GB.w - 0.002, GB.d - 0.002), topM);
  face.rotation.x = -Math.PI / 2;
  face.position.y = top + 0.0001;
  face.receiveShadow = true;
  g.add(face);
  // gardenia-fruit legs (kuchinashi), turned
  const legM = side.clone();
  legM.color = new THREE.Color(0xd6b080);
  const lp = [[0, 0], [0.006, 0], [0.0095, 0.004], [0.0118, 0.01], [0.0122, 0.015], [0.011, 0.02], [0.0075, 0.024], [0.0062, GB.leg], [0, GB.leg]];
  const lc = new THREE.CatmullRomCurve3(lp.map(([r, y]) => new THREE.Vector3(r, y, 0)));
  const lgeo = new THREE.LatheGeometry(lc.getSpacedPoints(40).map((q) => new THREE.Vector2(Math.max(q.x, 1e-5), q.y)), 32);
  lgeo.computeVertexNormals();
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const l = new THREE.Mesh(lgeo, legM);
    l.position.set(x * (GB.w / 2 - 0.028), 0, z * (GB.d / 2 - 0.03));
    l.castShadow = l.receiveShadow = true;
    g.add(l);
  }
  const sg = stoneGeometry({ r: sx * 0.46, h: sx * 0.37 }), sm = stoneMaterials();
  const R = rng(37);
  for (const [col, i, j] of [['B', 6, 2], ['W', 2, 6], ['B', 2, 2], ['W', 6, 6], ['B', 4, 4], ['W', 5, 4], ['B', 4, 5], ['W', 3, 3], ['B', 5, 5]]) {
    const m = new THREE.Mesh(sg, col === 'B' ? sm.black : sm.white);
    m.position.set(X(i) + (R() - 0.5) * 0.0012, top + sx * 0.185, Z(j) + (R() - 0.5) * 0.0012);
    m.rotation.y = R() * 6.28;
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  }
  g.userData.top = top;
  return g;
}

// ---------------------------------------------------------------- dynamics, integrated once
function simulate({ dur, tEasy, tHard, tilt1, tilt2 }) {
  const dt = 1 / 960, out = 1 / 120;
  const T = dur + 1.5;
  const n = Math.ceil(T / out) + 2;
  const rec = { th: new Float32Array(n), pl: new Float32Array(n), pr: new Float32Array(n) };
  let th = 0.9 * DEG, w = 0; // a last breath of sway from before the shot
  const pend = [{ a: -0.6 * DEG, v: 0 }, { a: 0.4 * DEG, v: 0 }];
  const gacc = 9.81, L = HANG + 0.012;
  const eq = (t) => lerp(0, tilt1 * DEG, sstep(tEasy, tEasy + 0.18, t)) + (tilt2 - tilt1) * DEG * sstep(tHard, tHard + 0.12, t);
  const omega = (t) => (t < tHard ? (2 * Math.PI) / 1.7 : (2 * Math.PI) / 1.45);
  const zeta = (t) => (t < tEasy ? 0.12 : t < tHard ? 0.32 : 0.24);
  let k = 0;
  for (let i = 0; i * dt <= T; i++) {
    const t = i * dt;
    if (t >= k * out - 1e-9 && k < n) {
      rec.th[k] = th; rec.pl[k] = pend[0].a; rec.pr[k] = pend[1].a;
      k++;
    }
    const om = omega(t), z = zeta(t);
    const acc = om * om * (eq(t) - th) - 2 * z * om * w;
    // each pan hangs from an end of the beam; its pivot accelerates with the beam (left end: (-R cos, +R sin))
    for (let s = 0; s < 2; s++) {
      const sx = s === 0 ? -1 : 1;
      const ax = sx * ARM * (-acc * Math.sin(th) - w * w * Math.cos(th));
      const ay = -sx * ARM * (acc * Math.cos(th) - w * w * Math.sin(th));
      const P = pend[s];
      const pa = -((gacc + ay) * Math.sin(P.a) + ax * Math.cos(P.a)) / L - 2 * 0.06 * Math.sqrt(gacc / L) * P.v;
      P.v += pa * dt;
      P.a += P.v * dt;
    }
    w += acc * dt;
    th += w * dt;
  }
  const sample = (arr, t) => {
    const f = clamp(t / out, 0, n - 2);
    const i = Math.floor(f), u = f - i;
    return arr[i] * (1 - u) + arr[i + 1] * u;
  };
  return (t) => ({ th: sample(rec.th, t), pl: sample(rec.pl, t), pr: sample(rec.pr, t) });
}

// ---------------------------------------------------------------- the shot
export async function create({ renderer, scale, p, dur, cues }) {
  const st = new Studio({ scale, renderer });
  const env = await st.hdri('../assets/hdri/studio_small_09_2k.hdr', { intensity: p.env ?? 0.02, rotation: p.rot ?? 2.4 });
  st.scene.background = new THREE.Color(0x020203);

  // the desk: dark walnut, fading to black
  const desk = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshPhysicalMaterial({
    ...st.pbr('Wood027', { repeat: [25, 25], rotation: 0 }), color: 0x8a7464, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.25,
    envMap: env, envMapIntensity: 0.06,
  }));
  desk.rotation.x = -Math.PI / 2;
  desk.receiveShadow = true;
  st.scene.add(desk);

  const B = await buildBalance(st, env);
  B.root.rotation.y = -0.05;
  st.scene.add(B.root);

  // the board's pan (left): a miniature legged go board (9 x 9), a few stones
  const board = await miniGoban(st, env);
  board.rotation.y = 0.14;
  B.pans[0].userData.load.add(board);

  // the toys' pan (right): three ABC blocks (two side by side, one across them) and the cup
  const L = B.pans[1].userData.load;
  const bs = 0.037;
  const blocks = [
    toyBlock({ size: bs, seed: 3, faces: [{ ch: 'B', color: 'blue' }, { ch: '2', color: 'yellow' }, { ch: 'A', color: 'red' }, { ch: 'K', color: 'green' }, { ch: 'A', color: 'red' }, { ch: 'M', color: 'teal' }] }),
    toyBlock({ size: bs, seed: 8, faces: [{ ch: 'C', color: 'green' }, { ch: 'D', color: 'red' }, { ch: 'E', color: 'blue' }, { ch: 'G', color: 'yellow' }, { ch: '3', color: 'orange' }, { ch: 'H', color: 'blue' }] }),
    toyBlock({ size: bs, seed: 13, faces: [{ ch: '1', color: 'red' }, { ch: 'P', color: 'green' }, { ch: 'S', color: 'blue' }, { ch: 'T', color: 'orange' }, { ch: 'O', color: 'yellow' }, { ch: 'R', color: 'red' }] }),
  ];
  blocks[0].position.set(-0.05, 0, 0.012);
  blocks[0].rotation.y = 0.18;
  blocks[1].position.set(-0.011, 0, 0.022);
  blocks[1].rotation.y = -0.1;
  blocks[2].position.set(-0.031, bs, 0.017);
  blocks[2].rotation.y = 0.55;
  const cup = sippyCup();
  cup.position.set(0.05, 0, -0.035);
  cup.rotation.y = 2.3;
  L.add(blocks[0], blocks[1], blocks[2], cup);

  // light: a warm key from high front-left, a cool rim from behind right, a breath of fill
  const keyI = p.key ?? 14;
  const key1 = spot(0xffd4a8, keyI, { pos: [-0.55, 1.75, 0.65], target: [0.02, 0.12, 0], angle: 0.4, penumbra: 1, radius: 5, shadow: 2048, near: 0.5, far: 3.5 });
  const rim = spot(0xffe6cc, p.rim ?? 1.6, { pos: [-0.5, 0.42, -2.2], target: [0.0, 0.3, 0.0], angle: 0.42, penumbra: 1, shadow: 0 });
  const fill = spot(0xffe2c4, p.fill ?? 0.5, { pos: [0.9, 0.5, 1.4], target: [0, 0.25, 0], angle: 0.5, penumbra: 1, shadow: 0 });
  st.scene.add(key1, key1.target, rim, rim.target, fill, fill.target);
  grade(st, {
    ao: { radius: 0.025, intensity: 1.5 },
    dof: { distance: 1.2, range: p.range ?? 0.35, bokeh: p.bokeh ?? 3 },
    bloom: { intensity: 0.18, threshold: 1.3 }, vignette: 0.7, contrast: 0.12, saturation: -0.02, exposure: p.exposure ?? 0.95,
  });
  if (st.dof) st.dof.target = V3(0, 0.22, 0);

  const tName = cues.name ?? dur * 0.14;
  const tEasy = cues.easy ?? dur * 0.42;
  const tHard = cues.hard ?? Math.max(tEasy + 0.8, dur * 0.6);
  const tLook = cues.look ?? dur * 0.76, tWalk = cues.walk ?? dur * 0.83, tGrab = cues.grab ?? dur * 0.89;
  const sim = simulate({ dur, tEasy, tHard, tilt1: p.tilt1 ?? 3.5, tilt2: p.tilt2 ?? 11 });

  const ends = [V3(), V3()];
  const boardTop = V3(), toyTop = V3();
  const pose = (t) => {
    const s = sim(t);
    B.beam.rotation.z = -s.th;
    B.root.updateMatrixWorld(true);
    // knife edges at the ends, a hair under the beam's axis
    [-1, 1].forEach((sx, k) => {
      const e = V3(sx * ARM, -0.0005, 0).applyMatrix4(B.beam.matrix);
      B.pans[k].position.copy(e);
      B.pans[k].rotation.z = k === 0 ? s.pl : s.pr;
      ends[k].copy(e);
    });
    B.root.updateMatrixWorld(true);
    board.localToWorld(boardTop.set(-0.02, board.userData.top + 0.004, 0.0));
    L.localToWorld(toyTop.set(-0.01, 0.066, 0.01));
  };

  return {
    studio: st,
    update(t) {
      pose(t);
      // a slow push in from a little above, drifting toward the toys' side as it sinks
      const u = ss(clamp(t / dur));
      const b = breathe(t, 0.0025, 4);
      const drift = 0.025 * sstep(tHard, tHard + 2.5, t);
      st.camera.position.set(lerp(0.09, 0.05, u) + drift + b[0], lerp(0.8, 0.74, u) + b[1], lerp(1.58, 1.4, u) + b[2]);
      st.camera.lookAt(lerp(0.0, 0.01, u) + drift * 0.8, 0.22, 0);
      const fov = p.fov ?? 28;
      if (st.camera.fov !== fov) { st.camera.fov = fov; st.camera.updateProjectionMatrix(); }
    },
    overlay(g, t) {
      if (p.labels === false) return;
      const cam = st.camera;
      // the name, top left
      const na = sstep(tName, tName + 0.7, t) * (1 - sstep(tEasy - 0.6, tEasy, t));
      caption(g, 140, 170, { en: 'HANS MORAVEC', zh: '汉斯·莫拉维克', a: na, color: [238, 226, 206], zhSize: 30, rule: 110 });
      // the board: easy for a machine (cool)
      const ea = sstep(tEasy + 0.15, tEasy + 0.75, t);
      callout(g, cam, boardTop, { text: '下棋', a: ea, side: -1, dx: 120, dy: -120, size: 38, color: [196, 230, 255], line: [150, 210, 250] });
      // the toys: what a one-year-old does without thinking (warm), one by one, stacked beside the pan
      const la = sstep(tLook - 0.15, tLook + 0.4, t);
      if (la > 0.001) {
        cam.updateMatrixWorld();
        const [x, y, z] = toScreen(cam, toyTop);
        if (z < 1) {
          const k = Math.min(1, la * 1.4);
          const ex = x + 150 * k, ey = y - 110 * k;
          g.save();
          g.globalAlpha *= la;
          g.strokeStyle = 'rgba(240,206,150,0.85)';
          g.fillStyle = 'rgba(240,206,150,1)';
          g.lineWidth = 1.5;
          g.beginPath();
          g.arc(x, y, 4, 0, Math.PI * 2);
          g.fill();
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(ex, ey);
          g.lineTo(ex + 22, ey);
          g.stroke();
          g.restore();
          const items = [['看一眼', tLook], ['走两步', tWalk], ['伸手拿个东西', tGrab]];
          items.forEach(([s1, t0], n) => {
            const a = sstep(t0 - 0.05, t0 + 0.4, t);
            text(g, s1, ex + 34 + (1 - a) * 8, ey + n * 50, { size: 34, font: FONT.sans, weight: 600, spacing: 2, color: [246, 222, 182], a, align: 'left', shadow: 14 });
          });
        }
      }
    },
  };
}
