// A real go board: kaya-like wood with printed lines and star points, double-convex stones, a wooden bowl.
// Board space: top surface at y = 0, centred on the origin. Column i (A..T from Black's side) runs along +x,
// row-from-top j (SGF order) along +z, so Black sits at +z looking toward -z.
import { THREE } from './core.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { stoneGeometry, stoneMaterials } from './materials.js';

export const BOARD = { w: 0.424, d: 0.455, h: 0.12, dx: 0.0222, dz: 0.0237 };
export const at = (i, j, y = 0) => new THREE.Vector3((i - 9) * BOARD.dx, y, (j - 9) * BOARD.dz);

function loadImage(url) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
}

// top face: procedural kaya (fine straight "masame" grain running toward the players) + ink grid, in a 4K canvas;
// the grain's height field also gives a normal map. Both are built once and shared by every board.
let TOP = null;
function kayaGrain(N) {
  let s = 20160310;
  const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // 1-D grain profile across the board: latewood lines every ~0.5-1.5 mm, sharp on one side, fading on the other
  const M = N * 2;
  const prof = new Float32Array(M);
  for (let x = 0; x < M; x += 5 + R() * 10) {
    const d = 0.03 + R() * R() * 0.16, w = 0.8 + R() * 2.2;
    for (let u = -8; u < 24; u++) {
      const k = Math.floor(x) + u;
      if (k < 0 || k >= M) continue;
      const v = u < 0 ? Math.exp(-(u * u) / (w * w)) : Math.exp(-u / (2.2 * w));
      prof[k] += d * v;
    }
  }
  // broad bands (growth seasons) and a slow drift of tone
  const band = new Float32Array(M);
  const ph = [R() * 6.28, R() * 6.28, R() * 6.28];
  for (let k = 0; k < M; k++) band[k] = 0.05 * Math.sin(k / 97 + ph[0]) * Math.sin(k / 431 + ph[1]) + 0.035 * Math.sin(k / 1630 + ph[2]);
  return { prof, band, M, R };
}

function buildTop() {
  const N = 4096;
  const { prof, band, M, R } = kayaGrain(N);
  const img = new ImageData(N, N);
  const H = new Float32Array(1024 * 1024);
  const base = [228, 186, 122], dark = [176, 122, 66];
  const wa = R() * 6.28, wb = R() * 6.28;
  for (let y = 0; y < N; y++) {
    const wy = 9 * Math.sin(y / 1300 + wa) + 3.5 * Math.sin(y / 370 + wb);
    for (let x = 0; x < N; x++) {
      // grain lines wander slightly and drift across as they run down the board
      const xx = x + wy + 5 * Math.sin(x / 700 + y / 2100) + y * 0.012 + 600;
      const k0 = Math.floor(xx), f = xx - k0;
      const k = ((k0 % M) + M) % M, k1 = (k + 1) % M;
      const g = prof[k] * (1 - f) + prof[k1] * f;
      const b = band[k];
      const t = Math.min(1, g * 1.6);
      const i = (y * N + x) * 4;
      const lum = 1 + b;
      img.data[i] = (base[0] + (dark[0] - base[0]) * t) * lum;
      img.data[i + 1] = (base[1] + (dark[1] - base[1]) * t) * lum;
      img.data[i + 2] = (base[2] + (dark[2] - base[2]) * t) * lum;
      img.data[i + 3] = 255;
      if ((x & 3) === 0 && (y & 3) === 0) H[(y >> 2) * 1024 + (x >> 2)] = -g;
    }
  }
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const c = cv.getContext('2d');
  c.putImageData(img, 0, 0);
  // fine pores: short dark flecks along the grain
  c.fillStyle = 'rgba(120,76,30,0.18)';
  for (let k = 0; k < 26000; k++) c.fillRect(R() * N, R() * N, 1, 2 + R() * 5);
  // a soft, uneven patina (oiled, handled wood)
  for (let k = 0; k < 14; k++) {
    const x = R() * N, y = R() * N, r = N * (0.15 + R() * 0.3);
    const gr = c.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${R() < 0.5 ? '150,95,40' : '255,230,180'},0.05)`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gr;
    c.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  const u = (x) => (x / BOARD.w + 0.5) * N;
  const v = (z) => (z / BOARD.d + 0.5) * N; // canvas y grows toward +z (Black's side)
  c.strokeStyle = 'rgba(24,16,10,0.9)';
  c.lineCap = 'butt';
  for (let k = 0; k < 19; k++) {
    const lw = k === 0 || k === 18 ? 1.5 : 1.0; // mm
    c.lineWidth = (lw / 1000 / BOARD.w) * N;
    const p0 = at(k, 0), p1 = at(k, 18), q0 = at(0, k), q1 = at(18, k);
    c.beginPath(); c.moveTo(u(p0.x), v(p0.z)); c.lineTo(u(p1.x), v(p1.z)); c.stroke();
    c.beginPath(); c.moveTo(u(q0.x), v(q0.z)); c.lineTo(u(q1.x), v(q1.z)); c.stroke();
  }
  c.fillStyle = 'rgba(24,16,10,0.95)';
  for (const i of [3, 9, 15]) for (const j of [3, 9, 15]) {
    const p = at(i, j);
    c.beginPath(); c.arc(u(p.x), v(p.z), (0.002 / BOARD.w) * N, 0, Math.PI * 2); c.fill();
  }
  // normal map from the grain height (1K is plenty: the grooves are a whisper)
  const n = 1024, nd = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const hx = H[y * n + Math.min(n - 1, x + 1)] - H[y * n + Math.max(0, x - 1)];
    const hy = H[Math.min(n - 1, y + 1) * n + x] - H[Math.max(0, y - 1) * n + x];
    let nx = -hx * 3, ny = hy * 3, nz = 1;
    const l = Math.hypot(nx, ny, nz);
    const i = (y * n + x) * 4;
    nd[i] = (nx / l * 0.5 + 0.5) * 255; nd[i + 1] = (ny / l * 0.5 + 0.5) * 255; nd[i + 2] = (nz / l * 0.5 + 0.5) * 255; nd[i + 3] = 255;
  }
  TOP = { canvas: cv, normal: { data: nd, n } };
  return TOP;
}

async function topTexture() {
  const top = TOP || buildTop();
  const t = new THREE.CanvasTexture(top.canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  const nm = new THREE.DataTexture(top.normal.data, top.normal.n, top.normal.n, THREE.RGBAFormat);
  nm.generateMipmaps = true;
  nm.minFilter = THREE.LinearMipmapLinearFilter;
  nm.magFilter = THREE.LinearFilter;
  nm.anisotropy = 8;
  nm.needsUpdate = true;
  return { map: t, normalMap: nm };
}

export async function buildBoard(studio) {
  const g = new THREE.Group();
  const side = studio.pbr('Wood022', { repeat: [1, 0.3] });
  const sideMat = new THREE.MeshPhysicalMaterial({ ...side, color: 0xf0d2a0, roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.35 });
  const body = new THREE.Mesh(new RoundedBoxGeometry(BOARD.w, BOARD.h, BOARD.d, 4, 0.003), sideMat);
  body.position.y = -BOARD.h / 2;
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  const tex = await topTexture();
  const top = new THREE.Mesh(
    new THREE.PlaneGeometry(BOARD.w - 0.004, BOARD.d - 0.004),
    new THREE.MeshPhysicalMaterial({ ...tex, normalScale: new THREE.Vector2(0.35, 0.35), roughness: 0.46, clearcoat: 0.18, clearcoatRoughness: 0.32 }),
  );
  top.rotation.x = -Math.PI / 2;
  top.position.y = 0.0002;
  top.receiveShadow = true;
  g.add(top);
  return g;
}

// stones from a move list [[colour, i, j], ...]; small random offsets like a real game
export function buildStones(moves, { seed = 5 } = {}) {
  const g = new THREE.Group();
  const geo = stoneGeometry();
  const mats = stoneMaterials();
  let s = seed;
  const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out = [];
  for (const [c, i, j] of moves) {
    const m = new THREE.Mesh(geo, c === 'B' ? mats.black : mats.white);
    const p = at(i, j, 0.0046);
    m.position.set(p.x + (R() - 0.5) * 0.0016, p.y, p.z + (R() - 0.5) * 0.0016);
    m.rotation.y = R() * Math.PI * 2;
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    out.push(m);
  }
  return { group: g, stones: out, geo, mats };
}

// lidless wooden bowl (go-ke) with a heap of stones inside
export function buildBowl(studio, colour = 'B', { n = 40, seed = 9 } = {}) {
  const g = new THREE.Group();
  const prof = [[0.0, 0.0], [0.05, 0.0], [0.062, 0.012], [0.068, 0.035], [0.064, 0.058], [0.056, 0.07], [0.052, 0.066], [0.058, 0.055], [0.06, 0.035], [0.055, 0.016], [0.045, 0.008], [0.0, 0.008]];
  const wood = studio.pbr('Wood026', { repeat: [2, 1] });
  const bowl = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 96),
    new THREE.MeshPhysicalMaterial({ ...wood, color: 0xd8b48a, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.2, side: THREE.DoubleSide }));
  bowl.castShadow = bowl.receiveShadow = true;
  g.add(bowl);
  const geo = stoneGeometry();
  const mat = stoneMaterials()[colour === 'B' ? 'black' : 'white'];
  let s = seed;
  const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < n; k++) {
    const a = R() * Math.PI * 2, rr = Math.sqrt(R()) * 0.045;
    const m = new THREE.Mesh(geo, mat);
    m.position.set(Math.cos(a) * rr, 0.035 + R() * 0.018 - rr * 0.25, Math.sin(a) * rr);
    m.rotation.set((R() - 0.5) * 1.2, R() * 6.28, (R() - 0.5) * 1.2);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  }
  return g;
}
