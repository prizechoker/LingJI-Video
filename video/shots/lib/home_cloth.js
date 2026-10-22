// A knitted sweater tossed over a chair back (shots/home.js, mode 'days'): a cloth simulated once in create()
// (position-based dynamics: stretch, shear and bend links, capsule and box colliders, friction), recorded at 60 Hz
// and played back as a pure function of time. Rendered as a thick knit (two offset layers stitched at the edges).
import { THREE } from '../../engine2/core.js';
import { rng, clamp } from './kit.js';

// the flat pattern (front view, metres, x across, y up from the hem): body, scooped neck, two sleeves at ~40 deg
function inside(x, y) {
  const bw = 0.27, bh = 0.64;
  const body = Math.abs(x) <= bw && y >= 0 && y <= bh - (Math.abs(x) < 0.09 ? 0.06 * Math.sqrt(Math.max(0, 1 - (x / 0.09) ** 2)) : 0);
  if (body) return true;
  // sleeves: from the shoulder (|x| = bw, y ~ bh - 0.02) out and down
  const sx = Math.abs(x) - bw + 0.02, sy = bh - 0.02 - y;
  const a = 0.75, ca = Math.cos(a), sa = Math.sin(a);
  const along = sx * ca + sy * sa, across = -sx * sa + sy * ca;
  const half = 0.095 - 0.03 * clamp(along / 0.56);
  return along >= 0 && along <= 0.56 && Math.abs(across - 0.0) <= half;
}

export function simulateSweater({ colliders, start, seed = 7, T = 1.8, fps = 60, d = 0.024 }) {
  // particles on a grid over the pattern's bounds
  const xs = [], ys = [];
  for (let x = -0.72; x <= 0.72 + 1e-6; x += d) xs.push(x);
  for (let y = 0; y <= 0.66 + 1e-6; y += d) ys.push(y);
  const nx = xs.length, ny = ys.length;
  const idx = new Int32Array(nx * ny).fill(-1);
  const P = [], uv = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!inside(xs[i], ys[j])) continue;
    idx[j * nx + i] = P.length / 3;
    P.push(xs[i], ys[j], 0);
    uv.push(xs[i], ys[j]);
  }
  const n = P.length / 3;
  // links
  const links = [];
  const link = (a, b, k) => {
    if (a < 0 || b < 0) return;
    const L = Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1]);
    links.push([a, b, L, k]);
  };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = idx[j * nx + i];
    if (a < 0) continue;
    if (i + 1 < nx) link(a, idx[j * nx + i + 1], 1);
    if (j + 1 < ny) link(a, idx[(j + 1) * nx + i], 1);
    if (i + 1 < nx && j + 1 < ny) link(a, idx[(j + 1) * nx + i + 1], 0.6);
    if (i > 0 && j + 1 < ny) link(a, idx[(j + 1) * nx + i - 1], 0.6);
    if (i + 2 < nx) link(a, idx[j * nx + i + 2], 0.12);
    if (j + 2 < ny) link(a, idx[(j + 2) * nx + i], 0.12);
  }
  // triangles over the grid cells
  const tris = [];
  for (let j = 0; j + 1 < ny; j++) for (let i = 0; i + 1 < nx; i++) {
    const a = idx[j * nx + i], b = idx[j * nx + i + 1], c = idx[(j + 1) * nx + i], e = idx[(j + 1) * nx + i + 1];
    if (a >= 0 && b >= 0 && e >= 0) tris.push(a, b, e);
    if (a >= 0 && e >= 0 && c >= 0) tris.push(a, e, c);
    if (a >= 0 && b >= 0 && c >= 0 && e < 0) tris.push(a, b, c);
    if (b >= 0 && e >= 0 && c >= 0 && a < 0) tris.push(b, e, c);
  }
  // place the flat sweater in the world: pattern x -> start.across, pattern y -> start.along (hem first)
  const R = rng(seed);
  const X = new Float32Array(n * 3), Xp = new Float32Array(n * 3);
  const { origin, across, along, normal, vel, spin } = start;
  const nv = new THREE.Vector3(...normal), rv = new THREE.Vector3(), wv = new THREE.Vector3();
  for (let k = 0; k < n; k++) {
    // bunched up as it leaves the hand: the sleeves folded in over the body, the hem turned up a little
    let px = P[k * 3], py = P[k * 3 + 1] - 0.33, lift = 0;
    if (Math.abs(px) > 0.24) { px = Math.sign(px) * (0.24 - (Math.abs(px) - 0.24) * 0.9); lift = 0.035; py -= 0.04; }
    if (py < -0.22) { py = -0.22 - (py + 0.22) * 0.8; lift += 0.03; }
    const crumple = 0.02 * Math.sin(px * 9 + 1) * Math.cos(py * 7) + 0.012 * Math.sin(py * 13 + px * 4) + (R() - 0.5) * 0.004;
    rv.set(across[0] * px + along[0] * py, across[1] * px + along[1] * py, across[2] * px + along[2] * py);
    wv.copy(nv).multiplyScalar(spin).cross(rv);  // a little spin about the sweater's normal
    for (let c = 0; c < 3; c++) {
      const w = origin[c] + rv.getComponent(c) + normal[c] * (crumple + lift);
      X[k * 3 + c] = w;
      Xp[k * 3 + c] = w - (vel[c] + wv.getComponent(c)) / 600;
    }
  }
  const dt = 1 / 600, steps = Math.round(T / dt), every = Math.round(600 / fps);
  const g = -9.81;
  const frames = [];
  const contact = new Uint8Array(n);
  const cn = [0, 1, 0];
  const mu = 0.85;
  const solveColliders = () => {
    for (let k = 0; k < n; k++) {
      let x = X[k * 3], y = X[k * 3 + 1], z = X[k * 3 + 2];
      let hit = 0;
      for (const C of colliders) {
        if (C.type === 'floor') {
          if (y < C.y + 0.004) { y = C.y + 0.004; hit = 1; cn[0] = 0; cn[1] = 1; cn[2] = 0; }
        } else if (C.type === 'capsule') {
          // closest point on the segment a..b
          const ax = C.a[0], ay = C.a[1], az = C.a[2];
          const bx = C.b[0] - ax, by = C.b[1] - ay, bz = C.b[2] - az;
          const t = clamp(((x - ax) * bx + (y - ay) * by + (z - az) * bz) / (bx * bx + by * by + bz * bz));
          const cx = ax + bx * t, cy = ay + by * t, cz = az + bz * t;
          const dx = x - cx, dy = y - cy, dz = z - cz;
          const L = Math.hypot(dx, dy, dz), r = C.r + 0.005;
          if (L < r && L > 1e-6) { x = cx + (dx / L) * r; y = cy + (dy / L) * r; z = cz + (dz / L) * r; hit = 1; cn[0] = dx / L; cn[1] = dy / L; cn[2] = dz / L; }
        } else if (C.type === 'box') {
          // world-aligned box (min, max): push out along the shallowest axis
          if (x > C.min[0] && x < C.max[0] && y > C.min[1] && y < C.max[1] && z > C.min[2] && z < C.max[2]) {
            const pen = [[x - C.min[0], 0, -1], [C.max[0] - x, 0, 1], [y - C.min[1], 1, -1], [C.max[1] - y, 1, 1], [z - C.min[2], 2, -1], [C.max[2] - z, 2, 1]];
            pen.sort((p, q) => p[0] - q[0]);
            const [dd, ax, s] = pen[0];
            if (ax === 0) x += s * (dd + 0.004); else if (ax === 1) y += s * (dd + 0.004); else z += s * (dd + 0.004);
            hit = 1;
            cn[0] = ax === 0 ? s : 0; cn[1] = ax === 1 ? s : 0; cn[2] = ax === 2 ? s : 0;
          }
        }
      }
      if (hit) {
        // friction (wool on wood): take away most of the sliding since the last step
        const px = Xp[k * 3], py = Xp[k * 3 + 1], pz = Xp[k * 3 + 2];
        let dx = x - px, dy = y - py, dz = z - pz;
        const [nx, ny, nz] = hit === 1 ? cn : [0, 1, 0];
        const dn = dx * nx + dy * ny + dz * nz;
        dx -= dn * nx; dy -= dn * ny; dz -= dn * nz;
        x -= mu * dx; y -= mu * dy; z -= mu * dz;
      }
      X[k * 3] = x; X[k * 3 + 1] = y; X[k * 3 + 2] = z;
      contact[k] = hit ? 1 : 0;
    }
  };
  for (let s = 0; s <= steps; s++) {
    if (s % every === 0) frames.push(X.slice());
    // integrate (verlet, light air drag)
    for (let k = 0; k < n; k++) {
      for (let c = 0; c < 3; c++) {
        const i = k * 3 + c;
        const v = (X[i] - Xp[i]) * (contact[k] ? 0.55 : 0.9993);  // friction where it touches something
        Xp[i] = X[i];
        X[i] += v + (c === 1 ? g * dt * dt : 0);
      }
    }
    for (let it = 0; it < 6; it++) {
      for (const [a, b, L, k] of links) {
        const dx = X[b * 3] - X[a * 3], dy = X[b * 3 + 1] - X[a * 3 + 1], dz = X[b * 3 + 2] - X[a * 3 + 2];
        const D = Math.hypot(dx, dy, dz);
        if (D < 1e-9) continue;
        // knit: resists stretching, gives a little under compression
        const diff = D > L ? (D - L) / D : 0.35 * (D - L) / D;
        const f = 0.5 * diff * k;
        X[a * 3] += dx * f; X[a * 3 + 1] += dy * f; X[a * 3 + 2] += dz * f;
        X[b * 3] -= dx * f; X[b * 3 + 1] -= dy * f; X[b * 3 + 2] -= dz * f;
      }
      solveColliders();
    }
  }
  return { frames, fps, tris, uv: new Float32Array(uv), n };
}

// the thick knit mesh: an outer and an inner layer (offset along the normals) and a band along the open edges
export function sweaterMesh(sim, mat, { thick = 0.013 } = {}) {
  const { n, tris } = sim;
  // boundary edges (used by one triangle)
  const ec = new Map();
  for (let i = 0; i < tris.length; i += 3) for (let e = 0; e < 3; e++) {
    const a = tris[i + e], b = tris[i + (e + 1) % 3];
    const k = a < b ? `${a},${b}` : `${b},${a}`;
    ec.set(k, ec.has(k) ? null : [a, b]);
  }
  const edges = [...ec.values()].filter(Boolean);
  const N = n * 2;
  const pos = new Float32Array(N * 3), uvs = new Float32Array(N * 2);
  for (let k = 0; k < n; k++) for (let l = 0; l < 2; l++) {
    uvs[(k + l * n) * 2] = sim.uv[k * 2] * 4.5;
    uvs[(k + l * n) * 2 + 1] = sim.uv[k * 2 + 1] * 4.5;
  }
  const index = [];
  for (let i = 0; i < tris.length; i += 3) {
    index.push(tris[i], tris[i + 1], tris[i + 2]);
    index.push(tris[i] + n, tris[i + 2] + n, tris[i + 1] + n);
  }
  for (const [a, b] of edges) index.push(a, a + n, b, b, a + n, b + n);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(index);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = m.receiveShadow = true;
  m.frustumCulled = false;
  const nrm = new Float32Array(n * 3);
  const base = new Float32Array(n * 3);
  // pose at time t (s from the toss)
  m.userData.pose = (t) => {
    const f = clamp(t * sim.fps, 0, sim.frames.length - 1.001);
    const i = Math.floor(f), u = f - i;
    const A = sim.frames[i], B = sim.frames[i + 1];
    for (let k = 0; k < n * 3; k++) base[k] = A[k] * (1 - u) + B[k] * u;
    // smooth normals of the single sheet
    nrm.fill(0);
    for (let q = 0; q < tris.length; q += 3) {
      const a = tris[q] * 3, b = tris[q + 1] * 3, c = tris[q + 2] * 3;
      const ux = base[b] - base[a], uy = base[b + 1] - base[a + 1], uz = base[b + 2] - base[a + 2];
      const vx = base[c] - base[a], vy = base[c + 1] - base[a + 1], vz = base[c + 2] - base[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const p of [a, b, c]) { nrm[p] += nx; nrm[p + 1] += ny; nrm[p + 2] += nz; }
    }
    for (let k = 0; k < n; k++) {
      const L = Math.hypot(nrm[k * 3], nrm[k * 3 + 1], nrm[k * 3 + 2]) || 1;
      for (let c = 0; c < 3; c++) {
        const o = (nrm[k * 3 + c] / L) * thick * 0.5;
        pos[k * 3 + c] = base[k * 3 + c] + o;
        pos[(k + n) * 3 + c] = base[k * 3 + c] - o;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
  };
  return m;
}
