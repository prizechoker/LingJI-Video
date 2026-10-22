// Breaking porcelain: split a (thin-walled) mesh into shards along irregular cracks, and precompute how the shards
// fly and settle on a surface. Deterministic: everything is computed once from a seed; play() poses the shards for
// any time.
import { THREE } from '../../engine2/core.js';
import { rng } from './kit.js';

// Split `geometry` (non-indexed or indexed) into shards: each triangle goes to its nearest seed (distance measured
// between triangle centroids and seeds, roughened with noise so the cracks wander). Seeds are denser near `impact`
// (local space). Returns [{ geo, centre, samples }] with geometry re-centred on each shard's centroid.
export function shardGeometry(geometry, { n = 36, impact, seed = 7, focus = 0.6, rough = 0.004 } = {}) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = g.attributes.position, uv = g.attributes.uv, nrm = g.attributes.normal;
  const R = rng(seed);
  const box = new THREE.Box3().setFromBufferAttribute(pos);
  const size = box.getSize(new THREE.Vector3()).length();
  // seeds: sample triangle centroids, preferring those near the impact point
  const tris = pos.count / 3;
  const cen = new Float32Array(tris * 3);
  for (let t = 0; t < tris; t++) {
    for (let k = 0; k < 3; k++) cen[t * 3 + k] = (pos.getComponent(t * 3, k) + pos.getComponent(t * 3 + 1, k) + pos.getComponent(t * 3 + 2, k)) / 3;
  }
  const seeds = [];
  let guard = 0;
  while (seeds.length < n && guard++ < 100000) {
    const t = Math.floor(R() * tris);
    const p = new THREE.Vector3(cen[t * 3], cen[t * 3 + 1], cen[t * 3 + 2]);
    const d = impact ? p.distanceTo(impact) / size : 0.5;
    if (R() < Math.exp(-d / (0.12 + (1 - focus) * 0.5)) + 0.05) seeds.push(p);
  }
  // cheap value noise for crack wander
  const noise = (x, y, z) => Math.sin(x * 731.1 + y * 113.7) * Math.sin(y * 517.3 + z * 271.9) * Math.sin(z * 389.1 + x * 197.3);
  const owner = new Int32Array(tris);
  for (let t = 0; t < tris; t++) {
    const x = cen[t * 3], y = cen[t * 3 + 1], z = cen[t * 3 + 2];
    let best = -1, bd = Infinity;
    for (let s = 0; s < seeds.length; s++) {
      const q = seeds[s];
      const d = Math.hypot(x - q.x, y - q.y, z - q.z) + rough * noise(x + s, y - s, z + s * 0.5);
      if (d < bd) { bd = d; best = s; }
    }
    owner[t] = best;
  }
  const out = [];
  for (let s = 0; s < seeds.length; s++) {
    const idx = [];
    for (let t = 0; t < tris; t++) if (owner[t] === s) idx.push(t);
    if (idx.length < 4) continue;
    const P = new Float32Array(idx.length * 9), N = new Float32Array(idx.length * 9), U = uv ? new Float32Array(idx.length * 6) : null;
    const c = new THREE.Vector3();
    idx.forEach((t, k) => {
      for (let v = 0; v < 3; v++) {
        const i = t * 3 + v;
        P.set([pos.getX(i), pos.getY(i), pos.getZ(i)], k * 9 + v * 3);
        N.set([nrm.getX(i), nrm.getY(i), nrm.getZ(i)], k * 9 + v * 3);
        if (U) U.set([uv.getX(i), uv.getY(i)], k * 6 + v * 2);
        c.x += pos.getX(i); c.y += pos.getY(i); c.z += pos.getZ(i);
      }
    });
    c.multiplyScalar(1 / (idx.length * 3));
    for (let i = 0; i < P.length; i += 3) { P[i] -= c.x; P[i + 1] -= c.y; P[i + 2] -= c.z; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    if (U) geo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    // collision samples: the points farthest out in several directions
    const samples = [];
    const dirs = [];
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2, b = Math.acos(1 - 2 * ((k + 0.5) / 14));
      dirs.push(new THREE.Vector3(Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a)));
    }
    for (const d of dirs) {
      let bi = 0, bv = -Infinity;
      for (let i = 0; i < P.length; i += 3) {
        const v = P[i] * d.x + P[i + 1] * d.y + P[i + 2] * d.z;
        if (v > bv) { bv = v; bi = i; }
      }
      samples.push(new THREE.Vector3(P[bi], P[bi + 1], P[bi + 2]));
    }
    // the shard's thin axis: its shell normal (inner-face normals flipped to agree with the outer ones)
    const axis = new THREE.Vector3(), n0 = new THREE.Vector3(N[0], N[1], N[2]), nn = new THREE.Vector3();
    for (let i = 0; i < N.length; i += 3) {
      nn.set(N[i], N[i + 1], N[i + 2]);
      axis.addScaledVector(nn, Math.sign(nn.dot(n0)) || 1);
    }
    axis.normalize();
    out.push({ geo, centre: c, samples, axis, size: Math.cbrt(idx.length) });
  }
  return out;
}

// Simulate shards leaving a body at the moment of impact. body: { pos, quat, vel (m/s) } of the intact object at
// impact (world), impactPoint (world). floor(x, z) -> surface height. Returns a track per shard sampled every
// `step` seconds of real time over `T` seconds.
export function simulateShards(shards, body, impactPoint, { floor, T = 1.2, step = 1 / 480, seed = 11, burst = 1.1, up = 0.8, spin = 22, rest = 0.28, fric = 0.55, topple = 900 } = {}) {
  const R = rng(seed);
  const g = new THREE.Vector3(0, -9.81, 0);
  const tracks = [];
  const dt = 0.00025;
  const q = new THREE.Quaternion(), dq = new THREE.Quaternion(), w = new THREE.Vector3(), tmp = new THREE.Vector3();
  for (const s of shards) {
    const p = s.centre.clone().applyQuaternion(body.quat).add(body.pos);
    q.copy(body.quat);
    const away = p.clone().sub(impactPoint);
    const dist = away.length();
    away.y = 0;
    if (away.lengthSq() < 1e-8) away.set(R() - 0.5, 0, R() - 0.5);
    away.normalize();
    const near = Math.exp(-dist / 0.04);
    const v = body.vel.clone().multiplyScalar(0.12 * (1 - near))
      .addScaledVector(away, burst * (0.35 + 0.9 * R()) * (0.4 + near))
      .add(new THREE.Vector3((R() - 0.5) * 0.3, up * (0.25 + R() * 0.9) * (0.5 + near), (R() - 0.5) * 0.3));
    w.set(R() - 0.5, R() - 0.5, R() - 0.5).normalize().multiplyScalar(spin * (0.3 + R()) * (0.5 + near));
    const frames = [];
    let next = 0;
    const steps = Math.ceil(T / dt);
    let settled = false;
    for (let i = 0; i <= steps; i++) {
      const t = i * dt;
      if (t >= next - 1e-9) {
        frames.push([p.x, p.y, p.z, q.x, q.y, q.z, q.w]);
        next += step;
      }
      if (settled) continue;
      v.addScaledVector(g, dt);
      p.addScaledVector(v, dt);
      const ang = w.length() * dt;
      if (ang > 0) {
        dq.setFromAxisAngle(tmp.copy(w).normalize(), ang);
        q.premultiply(dq).normalize();
      }
      // contact: the lowest sample point against the surface
      let low = Infinity, lowP = null;
      for (const sp of s.samples) {
        const wp = tmp.copy(sp).applyQuaternion(q).add(p);
        const f = floor(wp.x, wp.z);
        if (wp.y - f < low) { low = wp.y - f; lowP = wp.clone(); }
      }
      if (low < 0) {
        p.y -= low;
        if (v.y < 0) {
          v.y = -v.y * rest;
          v.x *= fric;
          v.z *= fric;
          w.multiplyScalar(0.55);
          // a little tumble from the hit, off-centre
          const lever = lowP.sub(p);
          w.add(new THREE.Vector3(lever.z, 0, -lever.x).multiplyScalar(30 * Math.abs(v.y)));
        }
        // toppling: gravity tips a shard standing on its edge over until it lies on a face
        const nw = tmp.copy(s.axis).applyQuaternion(q);
        const up = new THREE.Vector3(0, 1, 0);
        const side = Math.sign(nw.y) || 1;
        const tq = new THREE.Vector3().crossVectors(nw.multiplyScalar(side), up);
        w.addScaledVector(tq, topple * dt);
        w.multiplyScalar(0.992);
        if (v.length() < 0.02 && w.length() < 0.5 && tq.length() < 0.05) settled = true;
        v.multiplyScalar(0.995);
        w.multiplyScalar(0.985);
      }
    }
    tracks.push(frames);
  }
  return { tracks, step };
}

// pose shard meshes at time u (seconds of real time since impact)
export function poseShards(meshes, sim, u) {
  const f = Math.max(0, u) / sim.step;
  const i = Math.floor(f), a = f - i;
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  meshes.forEach((m, k) => {
    const tr = sim.tracks[k];
    const A = tr[Math.min(i, tr.length - 1)], B = tr[Math.min(i + 1, tr.length - 1)];
    m.position.set(A[0] + (B[0] - A[0]) * a, A[1] + (B[1] - A[1]) * a, A[2] + (B[2] - A[2]) * a);
    qa.set(A[3], A[4], A[5], A[6]);
    qb.set(B[3], B[4], B[5], B[6]);
    m.quaternion.copy(qa.slerp(qb, a));
  });
}
