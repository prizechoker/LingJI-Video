// Geometry and texture helpers shared by the archive shots (cart.js, unimate.js): merging many small parts into one
// mesh per material, rods between two points, bent tubes, box-projected UVs, procedural canvas textures, smoke sprites.
// Everything is deterministic (rng from kit.js).
import { THREE } from '../../engine2/core.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { rng } from './kit.js';

export { RoundedBoxGeometry };
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// normalise a geometry for merging: non-indexed, only position / normal / uv
function clean(g) {
  let h = g.index ? g.toNonIndexed() : g.clone();
  for (const k of Object.keys(h.attributes)) if (!['position', 'normal', 'uv'].includes(k)) h.deleteAttribute(k);
  if (!h.attributes.normal) h.computeVertexNormals();
  if (!h.attributes.uv) h.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((h.attributes.position.count) * 2), 2));
  h.morphAttributes = {};
  return h;
}

// collects parts by material key, then builds one mesh per key
export class Parts {
  constructor() { this.map = new Map(); }
  add(key, geo, m = null) {
    const g = clean(geo);
    if (m) g.applyMatrix4(m);
    if (!this.map.has(key)) this.map.set(key, []);
    this.map.get(key).push(g);
    return this;
  }
  // a box of size (w, h, d) at position p with an optional euler rotation; bevel > 0 for a rounded box
  box(key, [w, h, d], p, { rot = null, bevel = 0, uv = 0 } = {}) {
    const g = bevel > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(bevel, w / 2.01, h / 2.01, d / 2.01)) : new THREE.BoxGeometry(w, h, d);
    if (uv) boxUV(g, uv);
    return this.add(key, g, mat4(p, rot));
  }
  cyl(key, r0, r1, h, p, { rot = null, seg = 24, open = false, uv = 0 } = {}) {
    const g = new THREE.CylinderGeometry(r0, r1, h, seg, 1, open);
    if (uv) scaleUV(g, 2 * Math.PI * Math.max(r0, r1) * uv, h * uv);
    return this.add(key, g, mat4(p, rot));
  }
  rod(key, a, b, r, { seg = 10, r1 = null } = {}) {
    return this.add(key, rod(a, b, r, seg, r1));
  }
  tube(key, pts, r, { seg = 64, rseg = 10, closed = false, tension = 0.5, curve = null } = {}) {
    const c = curve || new THREE.CatmullRomCurve3(pts.map((p) => (p.isVector3 ? p : V(...p))), closed, 'catmullrom', tension);
    return this.add(key, new THREE.TubeGeometry(c, seg, r, rseg, closed));
  }
  build(mats, { cast = true, receive = true } = {}) {
    const grp = new THREE.Group();
    for (const [k, list] of this.map) {
      const g = mergeGeometries(list, false);
      const mesh = new THREE.Mesh(g, mats[k]);
      if (!mats[k]) console.log('missing material', k);
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      mesh.name = k;
      grp.add(mesh);
    }
    return grp;
  }
}

export function mat4(p = [0, 0, 0], rot = null, s = null) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  if (rot) q.setFromEuler(rot.isEuler ? rot : new THREE.Euler(rot[0] || 0, rot[1] || 0, rot[2] || 0, rot[3] || 'XYZ'));
  m.compose(p.isVector3 ? p : V(...p), q, s ? V(...s) : V(1, 1, 1));
  return m;
}

// a cylinder from a to b (Vector3 or arrays)
export function rod(a, b, r, seg = 10, r1 = null) {
  a = a.isVector3 ? a : V(...a);
  b = b.isVector3 ? b : V(...b);
  const d = b.clone().sub(a);
  const L = d.length();
  const g = new THREE.CylinderGeometry(r1 ?? r, r, L, seg, 1, false);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V(1, 1, 1)));
  return g;
}

// a polyline with rounded corners (radius rr) as a curve path, for bent steel tube
export function bentPath(pts, rr) {
  const P = pts.map((p) => (p.isVector3 ? p : V(...p)));
  const path = new THREE.CurvePath();
  let cur = P[0].clone();
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1], b = P[i];
    if (i < P.length - 1) {
      const c = P[i + 1];
      const d0 = b.clone().sub(a), d1 = c.clone().sub(b);
      const r = Math.min(rr, d0.length() * 0.45, d1.length() * 0.45);
      const p0 = b.clone().addScaledVector(d0.normalize(), -r);
      const p1 = b.clone().addScaledVector(d1.normalize(), r);
      if (cur.distanceTo(p0) > 1e-5) path.add(new THREE.LineCurve3(cur.clone(), p0));
      path.add(new THREE.QuadraticBezierCurve3(p0, b.clone(), p1));
      cur = p1;
    } else {
      path.add(new THREE.LineCurve3(cur.clone(), b.clone()));
    }
  }
  return path;
}

// planar box-projected UVs in the geometry's own space (metres * scale), grain along the longest axis
export function boxUV(g, scale = 1) {
  g.computeBoundingBox();
  const s = g.boundingBox.getSize(V());
  const long = s.x >= s.y && s.x >= s.z ? 0 : s.y >= s.z ? 1 : 2;
  const pos = g.attributes.position, nor = g.attributes.normal;
  const uv = g.attributes.uv || new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2);
  for (let i = 0; i < pos.count; i++) {
    const p = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const n = [Math.abs(nor.getX(i)), Math.abs(nor.getY(i)), Math.abs(nor.getZ(i))];
    const ax = n[0] >= n[1] && n[0] >= n[2] ? 0 : n[1] >= n[2] ? 1 : 2;
    const others = [0, 1, 2].filter((k) => k !== ax);
    // put the long axis on v (texture grain runs along v in the wood maps)
    let [ua, va] = others;
    if (ua === long) [ua, va] = [va, ua];
    uv.setXY(i, p[ua] * scale, p[va] * scale);
  }
  g.setAttribute('uv', uv);
  return g;
}

export function scaleUV(g, su, sv) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return g;
}

// ---------------------------------------------------------------- procedural canvas textures

export function canvas(n, m = n) {
  const c = document.createElement('canvas');
  c.width = n;
  c.height = m;
  return c;
}

export function canvasTex(c, { srgb = true, repeat = [1, 1], aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// tileable value noise, octaves, on [0,1]
export function noise2(seed = 1) {
  const N = 256;
  const R = rng(seed);
  const p = new Float32Array(N * N).map(() => R());
  const at = (x, y) => p[((y % N + N) % N) * N + ((x % N + N) % N)];
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y, period = N) => {
    // period: the noise repeats every `period` lattice cells (period must divide N)
    const xi = Math.floor(x), yi = Math.floor(y), fx = sm(x - xi), fy = sm(y - yi);
    const w = (a) => ((a % period) + period) % period;
    const a = at(w(xi), w(yi)), b = at(w(xi + 1), w(yi)), c = at(w(xi), w(yi + 1)), d = at(w(xi + 1), w(yi + 1));
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

export function fbm(nz, x, y, oct = 4, period = 256) {
  let v = 0, a = 0.5, f = 1, tot = 0;
  for (let i = 0; i < oct; i++) {
    v += a * nz(x * f, y * f, period * f);
    tot += a;
    a *= 0.5;
    f *= 2;
  }
  return v / tot;
}

// a normal map (canvas) from a height field h[y*n+x] in [0,1]; strength in "pixels of slope"
export function normalFromHeight(h, n, m, strength = 2) {
  const c = canvas(n, m);
  const g = c.getContext('2d');
  const img = g.createImageData(n, m);
  const H = (x, y) => h[((y + m) % m) * n + ((x + n) % n)];
  for (let y = 0; y < m; y++) for (let x = 0; x < n; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
    const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1);
    const i = (y * n + x) * 4;
    img.data[i] = 128 + 127 * (-dx / l);
    img.data[i + 1] = 128 + 127 * (dy / l); // GL convention: +y up in texture space (canvas y runs down)
    img.data[i + 2] = 128 + 127 * (1 / l);
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// a grey canvas from a scalar field in [0,1]
export function greyCanvas(f, n, m) {
  const c = canvas(n, m);
  const g = c.getContext('2d');
  const img = g.createImageData(n, m);
  for (let i = 0; i < n * m; i++) {
    const v = Math.max(0, Math.min(255, f[i] * 255));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// ---------------------------------------------------------------- smoke / steam

// a soft, wispy puff (canvas, white with alpha), tileable-free; several variants by seed
export function puffTexture(seed = 1, n = 256) {
  const nz = noise2(seed);
  const c = canvas(n, n);
  const g = c.getContext('2d');
  const img = g.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n - 0.5, v = y / n - 0.5;
    const r = Math.hypot(u * 1.0, v * 0.85) * 2;
    const f = fbm(nz, x / 28, y / 28, 5);
    const w = fbm(nz, x / 9 + 40, y / 9 + 17, 3);
    let a = Math.max(0, 1 - r) ** 1.6 * Math.max(0, f * 1.6 - 0.45) * (0.75 + 0.5 * w);
    a = Math.min(1, a * 1.6);
    const i = (y * n + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    img.data[i + 3] = a * 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export { V };

// an environment map of the set itself (one bounce of the modelled room instead of a mismatched HDRI): renders the
// scene into a PMREM cube from point `at`, with `hide` objects hidden. Call after the lights are posed. Returns the
// render target (dispose it in the shot's dispose()).
export async function captureEnv(st, at, { near = 0.05, far = 40, hide = [] } = {}) {
  await st.ready();
  const kids = [...st.scene.children];
  for (const k of kids) k.position.sub(at);
  for (const h of hide) h.visible = false;
  st.scene.updateMatrixWorld(true);
  st.scene.environment = null;
  const pm = new THREE.PMREMGenerator(st.renderer);
  const rt = pm.fromScene(st.scene, 0, near, far);
  pm.dispose();
  for (const k of kids) k.position.add(at);
  for (const h of hide) h.visible = true;
  st.scene.updateMatrixWorld(true);
  st.scene.environment = rt.texture;
  return rt;
}
