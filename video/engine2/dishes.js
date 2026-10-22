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
  g.userData.inner = pts.slice(top);  // lip -> inside centre
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
    color: 0xffffff, roughness: 0.0, metalness: 0, transmission: 1, thickness: 0.004, ior: 1.33, specularIntensity: 1,
    envMapIntensity: 2.4, attenuationColor: new THREE.Color(0xc9d6dc), attenuationDistance: 0.03, transparent: false,
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

// the water left in a (tilted) bowl: a level surface clipped by the bowl's inside, filled to `belowLip` under the
// lowest point of the lip, so it is just spilling there. World space; call after the bowl's matrices are updated.
export function waterInBowl(bowl, { belowLip = 0.0015, segs = 96, mat = waterMaterial() } = {}) {
  const inner = bowl.geometry.userData.inner;
  const m = bowl.matrixWorld;
  const at = (i, th) => new THREE.Vector3(inner[i].x * Math.cos(th), inner[i].y, inner[i].x * Math.sin(th)).applyMatrix4(m);
  let low = null;
  for (let k = 0; k < segs; k++) {
    const p = at(0, (k / segs) * Math.PI * 2);
    if (!low || p.y < low.y) low = p;
  }
  const level = low.y - belowLip;
  const ring = [];
  for (let k = 0; k < segs; k++) {
    const th = (k / segs) * Math.PI * 2;
    let prev = at(inner.length - 1, th);
    let hit = null;
    for (let i = inner.length - 2; i >= 0; i--) {  // climb the inside wall until it rises above the level
      const p = at(i, th);
      if (prev.y <= level && p.y > level) { hit = prev.clone().lerp(p, (level - prev.y) / (p.y - prev.y)); break; }
      prev = p;
    }
    if (hit) ring.push(hit);
  }
  const c = ring.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / ring.length);
  const pos = [c.x, c.y, c.z];
  for (const p of ring) pos.push(p.x, p.y, p.z);
  const idx = [];
  for (let k = 0; k < ring.length; k++) idx.push(0, 1 + ((k + 1) % ring.length), 1 + k);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const surf = new THREE.Mesh(g, mat);
  surf.userData.spillPoint = low;
  return surf;
}

// a tongue of water leaving a point with velocity `v` (m/s), falling for `T` seconds: a flattened, tapering
// stream that breaks into drops at its tip
export function spillStream(start, v, { T = 0.06, width = 0.009, thick = 0.0028, mat = waterMaterial(), seed = 3, drops = 26 } = {}) {
  const grp = new THREE.Group();
  const gvec = new THREE.Vector3(0, -9.81, 0);
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const t = (i / 16) * T;
    pts.push(start.clone().addScaledVector(v, t).addScaledVector(gvec, 0.5 * t * t));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const tube = new THREE.TubeGeometry(curve, 64, 1, 20, false);
  // reshape the unit tube: wide and thin (a sheet), tapering toward the tip
  const pos = tube.attributes.position, frames = curve.computeFrenetFrames(64, false);
  const P = new THREE.Vector3(), C = new THREE.Vector3(), d = new THREE.Vector3();
  for (let i = 0; i <= 64; i++) {
    const u = i / 64;
    curve.getPointAt(u, C);
    const side = new THREE.Vector3().crossVectors(curve.getTangentAt(u), new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(side, curve.getTangentAt(u)).normalize();
    const taper = Math.pow(1 - u, 0.6) * (1 + 0.15 * Math.sin(u * 23));
    for (let j = 0; j <= 20; j++) {
      const k = i * 21 + j;
      P.fromBufferAttribute(pos, k);
      d.copy(P).sub(frames.tangents[i] ? C : C);
      const a = (j / 20) * Math.PI * 2;
      const q = C.clone().addScaledVector(side, Math.cos(a) * width * 0.5 * taper).addScaledVector(up, Math.sin(a) * thick * 0.5 * (0.6 + 0.4 * taper));
      pos.setXYZ(k, q.x, q.y, q.z);
    }
  }
  tube.computeVertexNormals();
  grp.add(new THREE.Mesh(tube, mat));
  let s = seed;
  const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const sph = new THREE.SphereGeometry(1, 16, 12);
  const tip = pts[pts.length - 1];
  for (let k = 0; k < drops; k++) {
    const t = T * (0.75 + R() * 0.7);
    const vv = v.clone().add(new THREE.Vector3((R() - 0.5) * 0.25, (R() - 0.5) * 0.25, (R() - 0.5) * 0.25));
    const p = start.clone().addScaledVector(vv, t).addScaledVector(gvec, 0.5 * t * t);
    const r = 0.0006 + R() ** 2.2 * 0.0022;
    const m = new THREE.Mesh(sph, mat);
    m.position.copy(p);
    const dir = vv.clone().addScaledVector(gvec, t).normalize();
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    m.scale.set(r, r, r * (1 + R() * 1.2));
    grp.add(m);
  }
  grp.userData.tip = tip;
  return grp;
}
