// The robot's shoulders (engine2/botrig.js), corrected once per geometry at load (clones made from the rig share it).
// The arm hangs close to the body in the rest pose, and the exported bone-heat weights let it claim the side of the rib
// cage beside it: flank vertices from the armpit to the waist carried up to half their weight on the upper arm and its
// half-way shoulder bones, so a raised arm hauled the side of the chest up and out into a bulging web. Only the arm's
// own surface should follow the arm, and the mesh says which that is: outside a ball round the shoulder joint, the arm
// is its own connected piece of skin (the one that holds the hand); inside the ball (the cap and the armpit) a vertex
// goes with the nearest labelled one along the surface. The flank hands its arm weight back to the trunk (to the
// clavicle near the shoulder, so the socket still shrugs), faded in from ~6 cm off the joint and smoothed over the
// surface so the skin parts in a soft fold. Then the shoulder cap's weights are diffused (smoothCaps), so a raised arm
// spreads its swing over the whole cap instead of folding a narrow band beside the yoke.
import { THREE } from './core.js';

const SIDES = { L: 1, R: -1 };
const CHAIN = ['upperarm', 'forearm', 'hand', 'x_shoulder', 'x_shoulder2', 'x_uatwist', 'x_uatwist2', 'x_elbow', 'x_fatwist1', 'x_fatwist2'];

const sstep = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };

export function freeFlanks(mesh) {
  const geo = mesh.geometry;
  if (geo.userData.flanks) return geo.userData.flanks;
  const sk = mesh.skeleton, bi = {};
  sk.bones.forEach((b, i) => { bi[b.name] = i; });
  const A = geo.attributes, pos = A.position, nrm = A.normal, si = A.skinIndex, sw = A.skinWeight;
  const n = pos.count;
  // welded vertices and their neighbours (the mesh is split at uv seams)
  const wid = new Int32Array(n), reps = [], seen = new Map();
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos.getX(i) * 2e4)},${Math.round(pos.getY(i) * 2e4)},${Math.round(pos.getZ(i) * 2e4)}`;
    let w = seen.get(k);
    if (w === undefined) { w = reps.length; seen.set(k, w); reps.push(i); }
    wid[i] = w;
  }
  const W = reps.length, nb = Array.from({ length: W }, () => new Set());
  const ix = geo.index.array;
  for (let f = 0; f < ix.length; f += 3) {
    const a = wid[ix[f]], b = wid[ix[f + 1]], c = wid[ix[f + 2]];
    nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b);
  }
  const m4 = new THREE.Matrix4();
  const at = (name) => new THREE.Vector3().setFromMatrixPosition(m4.copy(sk.boneInverses[bi[name]]).invert());
  const p = new THREE.Vector3(), nv = new THREE.Vector3();
  let moved = 0;
  for (const [sd, sign] of Object.entries(SIDES)) {
    const S = at(`upperarm_${sd}`), E = at(`forearm_${sd}`);
    // label the skin by topology: outside a ball round the shoulder joint the arm is its own piece of the mesh (the
    // one holding the hand); every other piece there is torso. Inside the ball (the shoulder cap and the armpit) a
    // vertex takes the label of the nearest labelled one, measured along the surface
    const R0 = 0.115;
    const roi = new Uint8Array(W), dJ = new Float32Array(W), P = new Float32Array(W * 3);
    for (let w = 0; w < W; w++) {
      const i = reps[w];
      p.fromBufferAttribute(pos, i);
      P[w * 3] = p.x; P[w * 3 + 1] = p.y; P[w * 3 + 2] = p.z;
      dJ[w] = p.distanceTo(S);
      roi[w] = p.x * sign > -0.02 ? 1 : 0;
    }
    // pieces outside the ball (union-find over edges with both ends outside)
    const par = new Int32Array(W).map((_, k) => k);
    const find = (k) => { while (par[k] !== k) { par[k] = par[par[k]]; k = par[k]; } return k; };
    for (let w = 0; w < W; w++) {
      if (!roi[w] || dJ[w] <= R0) continue;
      for (const u of nb[w]) if (roi[u] && dJ[u] > R0) { const a1 = find(w), b1 = find(u); if (a1 !== b1) par[a1] = b1; }
    }
    let handW = -1, best = -1;
    const handB = bi[`hand_${sd}`];
    for (let i = 0; i < n; i++) for (let c = 0; c < 4; c++) if (si.getComponent(i, c) === handB && sw.getComponent(i, c) > best) { best = sw.getComponent(i, c); handW = wid[i]; }
    const armRoot = find(handW);
    const label = new Int8Array(W).fill(-1); // 1 arm, 0 torso
    for (let w = 0; w < W; w++) if (roi[w] && dJ[w] > R0) label[w] = find(w) === armRoot ? 1 : 0;
    // the ball: nearest labelled vertex along the surface
    const dist = new Float32Array(W).fill(Infinity);
    const heap = [];
    const push = (d, w, l) => { heap.push([d, w, l]); let k = heap.length - 1; while (k > 0) { const pk = (k - 1) >> 1; if (heap[pk][0] <= heap[k][0]) break; [heap[pk], heap[k]] = [heap[k], heap[pk]]; k = pk; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    for (let w = 0; w < W; w++) {
      if (label[w] < 0 || dJ[w] > R0 + 0.02) continue;
      // (seed from the labelled rim just outside the ball)
      let rim = false;
      for (const u of nb[w]) if (roi[u] && dJ[u] <= R0) rim = true;
      if (rim) { dist[w] = 0; push(0, w, label[w]); }
    }
    while (heap.length) {
      const [d, w, l] = pop();
      if (d > dist[w]) continue;
      if (label[w] < 0 || dJ[w] <= R0) label[w] = l;
      for (const u of nb[w]) {
        if (!roi[u] || dJ[u] > R0) continue;
        const nd = d + Math.hypot(P[u * 3] - P[w * 3], P[u * 3 + 1] - P[w * 3 + 1], P[u * 3 + 2] - P[w * 3 + 2]);
        if (nd < dist[u]) { dist[u] = nd; push(nd, u, l); }
      }
    }
    // the torso lets go of the arm fully beyond ~10 cm from the joint, and fades back to the old blend near it
    let f = new Float32Array(W);
    for (let w = 0; w < W; w++) if (label[w] === 0) f[w] = sstep(0.055, 0.1, dJ[w]);
    // smoothed over the surface, so arm and torso part through a soft fold rather than along a jagged line
    for (let it = 0; it < 24; it++) {
      const g = new Float32Array(W);
      for (let w = 0; w < W; w++) {
        if (!roi[w] || dJ[w] > 0.3) { g[w] = f[w]; continue; }
        let s1 = f[w], c = 1;
        for (const u of nb[w]) { s1 += f[u]; c++; }
        g[w] = s1 / c;
      }
      f = g;
    }
    const chain = new Set(CHAIN.map((b) => bi[`${b}_${sd}`]).filter((i) => i !== undefined));
    const clav = bi[`clavicle_${sd}`], chest = bi.chest;
    for (let i = 0; i < n; i++) {
      const k = f[wid[i]];
      if (k < 0.01) continue;
      p.fromBufferAttribute(pos, i);
      const to = p.y > S.y - 0.1 ? clav : chest;
      const acc = new Map();
      for (let c = 0; c < 4; c++) {
        const w = sw.getComponent(i, c);
        if (w <= 0) continue;
        const b = si.getComponent(i, c);
        if (chain.has(b)) {
          acc.set(b, (acc.get(b) || 0) + w * (1 - k));
          acc.set(to, (acc.get(to) || 0) + w * k);
        } else acc.set(b, (acc.get(b) || 0) + w);
      }
      const top = [...acc.entries()].filter(([, w]) => w > 1e-5).sort((a, b) => b[1] - a[1]).slice(0, 4);
      const sum = top.reduce((s, [, w]) => s + w, 0) || 1;
      for (let c = 0; c < 4; c++) {
        si.setComponent(i, c, top[c] ? top[c][0] : 0);
        sw.setComponent(i, c, top[c] ? top[c][1] / sum : 0);
      }
      moved++;
    }
  }
  si.needsUpdate = sw.needsUpdate = true;
  geo.userData.flanks = { moved, ...smoothCaps(mesh, wid, reps, nb) };
  return geo.userData.flanks;
}

// The top of the shoulder is the inside of the bend when the arm rises: the skin there passes from the trunk's
// rotation to the arm's over a band only a few cm wide, and a band that narrow folds over itself once the arm is up
// past ~100 deg (the cap's surface turns back on itself in thin shards). Diffusing the weights over the shoulder (a
// ball round the joint, its rim held fixed) widens the band to the whole cap, so the same swing spreads out instead of
// folding. The rest pose doesn't change (weights only matter once a bone turns).
function smoothCaps(mesh, wid, reps, nb, { R1 = 0.15, iterations = 220 } = {}) {
  const geo = mesh.geometry, sk = mesh.skeleton, bi = {};
  sk.bones.forEach((b, i) => { bi[b.name] = i; });
  const A = geo.attributes, pos = A.position, si = A.skinIndex, sw = A.skinWeight;
  const n = pos.count, W = reps.length;
  const m4 = new THREE.Matrix4(), p = new THREE.Vector3();
  const at = (name) => new THREE.Vector3().setFromMatrixPosition(m4.copy(sk.boneInverses[bi[name]]).invert());
  let smoothed = 0;
  for (const [sd, sign] of Object.entries(SIDES)) {
    const S = at(`upperarm_${sd}`);
    const reg = new Int32Array(W).fill(-1), list = [];
    for (let w = 0; w < W; w++) {
      p.fromBufferAttribute(pos, reps[w]);
      if (p.x * sign > 0 && p.distanceTo(S) < R1) { reg[w] = list.length; list.push(w); }
    }
    // the bones in play: those of the region and of its rim
    const cols = new Map();
    const col = (b) => { let c = cols.get(b); if (c === undefined) { c = cols.size; cols.set(b, c); } return c; };
    const touch = new Set(list);
    for (const w of list) for (const u of nb[w]) touch.add(u);
    for (const w of touch) for (let c = 0; c < 4; c++) if (sw.getComponent(reps[w], c) > 0) col(si.getComponent(reps[w], c));
    const B = cols.size, ids = [...touch], loc = new Map(ids.map((w, k) => [w, k]));
    let F = new Float32Array(ids.length * B);
    ids.forEach((w, k) => { for (let c = 0; c < 4; c++) { const x = sw.getComponent(reps[w], c); if (x > 0) F[k * B + cols.get(si.getComponent(reps[w], c))] += x; } });
    const nbl = list.map((w) => [...nb[w]].map((u) => loc.get(u)));
    for (let it = 0; it < iterations; it++) {
      const G = F.slice();
      list.forEach((w, r) => {
        const k = loc.get(w), ns = nbl[r];
        for (let b = 0; b < B; b++) {
          let s1 = F[k * B + b];
          for (const u of ns) s1 += F[u * B + b];
          G[k * B + b] = s1 / (ns.length + 1);
        }
      });
      F = G;
    }
    const bones = [...cols.keys()];
    for (let i = 0; i < n; i++) {
      const w = wid[i];
      if (reg[w] < 0) continue;
      const k = loc.get(w);
      const top = bones.map((b, c) => [b, F[k * B + c]]).filter(([, x]) => x > 1e-5).sort((a, b) => b[1] - a[1]).slice(0, 4);
      const sum = top.reduce((s1, [, x]) => s1 + x, 0) || 1;
      for (let c = 0; c < 4; c++) {
        si.setComponent(i, c, top[c] ? top[c][0] : 0);
        sw.setComponent(i, c, top[c] ? top[c][1] / sum : 0);
      }
      smoothed++;
    }
  }
  si.needsUpdate = sw.needsUpdate = true;
  return { smoothed };
}
