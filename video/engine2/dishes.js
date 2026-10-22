// Porcelain: a Chinese rice bowl (white glaze, cobalt rim lines), water droplets.
// Bowl space: foot on y = 0, axis along +y, rim ~6 cm up, 12 cm across.
import { THREE } from './core.js';

// outside from the recessed underside up over the foot to the lip, then down the inside to the centre
const PROFILE = [
  [0.0, 0.0045], [0.018, 0.0045], [0.0208, 0.0034], [0.0216, 0.0005], [0.0236, 0.0], [0.0255, 0.0006], [0.0262, 0.006],
  [0.028, 0.0088], [0.038, 0.0142], [0.048, 0.0222], [0.0552, 0.0322], [0.0588, 0.0432], [0.0602, 0.0542], [0.0604, 0.0598],
  [0.0596, 0.0619], [0.0582, 0.0612], [0.0576, 0.0552], [0.0562, 0.0442], [0.052, 0.0332], [0.045, 0.0232], [0.035, 0.0156],
  [0.022, 0.0116], [0.0, 0.0104],
];

let GEO = null;
export function bowlGeometry() {
  if (GEO) return GEO;
  const curve = new THREE.CatmullRomCurve3(PROFILE.map(([r, y]) => new THREE.Vector3(r, y, 0)), false, 'centripetal');
  const pts = curve.getSpacedPoints(220).map((p) => new THREE.Vector2(Math.max(p.x, 1e-5), p.y));
  const g = new THREE.LatheGeometry(pts, 160);
  // v = arc length along the profile (0 underside centre .. 1 inside centre); the rim lip is the highest point
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const uv = g.attributes.uv;
  const n = pts.length;
  for (let i = 0; i < uv.count; i++) uv.setY(i, L[i % n] / L[n - 1]);
  uv.needsUpdate = true;
  let top = 0;
  pts.forEach((p, i) => { if (p.y > pts[top].y) top = i; });
  g.userData.rimV = L[top] / L[n - 1];
  g.userData.rimY = pts[top].y;
  g.userData.rimR = pts[top].x;
  g.computeVertexNormals();
  GEO = g;
  return g;
}

// underglaze cobalt lines: a band just under the lip outside, a hairline below it, a hairline inside
function rimTexture(rimV) {
  const H = 2048;
  const cv = document.createElement('canvas');
  cv.width = 8;
  cv.height = H;
  const c = cv.getContext('2d');
  c.fillStyle = '#f7f6f2';
  c.fillRect(0, 0, 8, H);
  c.filter = 'blur(1.2px)';
  const line = (v0, v1, a = 1) => {
    c.fillStyle = `rgba(31, 62, 140, ${a})`;
    c.fillRect(0, (1 - v1) * H, 8, (v1 - v0) * H);
  };
  line(rimV - 0.03, rimV - 0.002);  // broad band under the lip, outside
  line(rimV - 0.06, rimV - 0.052, 0.9);  // hairline
  line(rimV + 0.034, rimV + 0.04, 0.85);  // hairline inside
  line(0.115, 0.122, 0.8);  // ring at the foot
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

export function porcelainMaterial() {
  const g = bowlGeometry();
  return new THREE.MeshPhysicalMaterial({
    map: rimTexture(g.userData.rimV), roughness: 0.22, ior: 1.5, clearcoat: 1, clearcoatRoughness: 0.035, specularIntensity: 0.6,
  });
}

export function buildBowl(mat = porcelainMaterial()) {
  const m = new THREE.Mesh(bowlGeometry(), mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

export function waterMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.02, metalness: 0, transmission: 1, thickness: 0.003, ior: 1.33, specularIntensity: 1,
    envMapIntensity: 1.4, transparent: false,
  });
}

// droplets sitting on the bowl's surface (wet porcelain): flattened spheres along the surface normal
export function surfaceDroplets(bowl, { n = 60, seed = 4, rmin = 0.0008, rmax = 0.0024, mat = waterMaterial() } = {}) {
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(1, 20, 12);
  const pos = bowl.geometry.attributes.position, nrm = bowl.geometry.attributes.normal;
  let s = seed;
  const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const up = new THREE.Vector3(0, 1, 0);
  for (let k = 0; k < n; k++) {
    const i = Math.floor(R() * pos.count);
    const p = new THREE.Vector3().fromBufferAttribute(pos, i);
    const q = new THREE.Vector3().fromBufferAttribute(nrm, i);
    if (p.y < 0.012) continue;
    const r = rmin + (rmax - rmin) * R() ** 2;
    const d = new THREE.Mesh(geo, mat);
    d.position.copy(p).addScaledVector(q, r * 0.25);
    d.quaternion.setFromUnitVectors(up, q);
    d.scale.set(r, r * 0.45, r * (1 + R() * 0.5));
    g.add(d);
  }
  return g;
}
