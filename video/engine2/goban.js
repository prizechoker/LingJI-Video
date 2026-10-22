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

// top face: wood photo + ink grid, drawn once into a 4K canvas
async function topTexture(studio) {
  const N = 4096;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const c = cv.getContext('2d');
  const wood = await loadImage('../assets/textures/Wood022_Color.jpg');
  // grain runs along the board's long side (canvas y); the photo's grain is horizontal, so rotate it
  c.save();
  c.translate(N / 2, N / 2);
  c.rotate(Math.PI / 2);
  c.drawImage(wood, -N / 2, -N / 2, N, N);
  c.restore();
  // a slightly warmer, less contrasty finish (oiled kaya)
  c.globalCompositeOperation = 'multiply';
  c.fillStyle = 'rgba(232,190,128,0.55)';
  c.fillRect(0, 0, N, N);
  c.globalCompositeOperation = 'source-over';
  const u = (x) => (x / BOARD.w + 0.5) * N;
  const v = (z) => (z / BOARD.d + 0.5) * N; // canvas y grows toward +z (Black's side)
  c.strokeStyle = 'rgba(22,16,10,0.92)';
  c.lineCap = 'butt';
  for (let k = 0; k < 19; k++) {
    const lw = k === 0 || k === 18 ? 1.6 : 1.05; // mm
    c.lineWidth = (lw / 1000 / BOARD.w) * N;
    const p0 = at(k, 0), p1 = at(k, 18), q0 = at(0, k), q1 = at(18, k);
    c.beginPath(); c.moveTo(u(p0.x), v(p0.z)); c.lineTo(u(p1.x), v(p1.z)); c.stroke();
    c.beginPath(); c.moveTo(u(q0.x), v(q0.z)); c.lineTo(u(q1.x), v(q1.z)); c.stroke();
  }
  c.fillStyle = 'rgba(22,16,10,0.95)';
  for (const i of [3, 9, 15]) for (const j of [3, 9, 15]) {
    const p = at(i, j);
    c.beginPath(); c.arc(u(p.x), v(p.z), (0.0021 / BOARD.w) * N, 0, Math.PI * 2); c.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  return t;
}

export async function buildBoard(studio) {
  const g = new THREE.Group();
  const side = studio.pbr('Wood022', { repeat: [1, 0.3] });
  const sideMat = new THREE.MeshPhysicalMaterial({ ...side, color: 0xf0d2a0, roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.35 });
  const body = new THREE.Mesh(new RoundedBoxGeometry(BOARD.w, BOARD.h, BOARD.d, 4, 0.003), sideMat);
  body.position.y = -BOARD.h / 2;
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  const topMap = await topTexture(studio);
  const nrm = studio.pbr('Wood022', { repeat: [1, 1], rotation: Math.PI / 2 });
  const top = new THREE.Mesh(
    new THREE.PlaneGeometry(BOARD.w - 0.004, BOARD.d - 0.004),
    new THREE.MeshPhysicalMaterial({ map: topMap, normalMap: nrm.normalMap, normalScale: new THREE.Vector2(0.25, 0.25), roughness: 0.5, clearcoat: 0.12, clearcoatRoughness: 0.45 }),
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
