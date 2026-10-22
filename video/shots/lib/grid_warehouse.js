// A robotic warehouse floor: a 1 m grid of fiducial codes, Kiva-style drive units that carry shelving pods along the
// grid lines (driving straight, stopping, turning 90 degrees in place while the pod stays square), storage blocks
// of parked pods, tall pallet racking at the edges, LED light rows. Units move on a precomputed, collision-free
// schedule: pose(t) is a pure function of time.
import { THREE } from '../../engine2/core.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, ss, clamp, lerp } from './kit.js';

const flat = (g) => {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  return n;
};
function part(list) {
  const byMat = new Map();
  for (const [g, m] of list) { if (!byMat.has(m)) byMat.set(m, []); byMat.get(m).push(flat(g)); }
  const geos = [], mats = [];
  for (const [m, gs] of [...byMat.entries()].sort((a, b) => a[0] - b[0])) { geos.push(gs.length > 1 ? mergeGeometries(gs) : gs[0]); mats.push(m); }
  const out = mergeGeometries(geos, true);
  out.groups.forEach((gr, i) => { gr.materialIndex = mats[i]; });
  out.computeBoundingSphere();
  return out;
}
const rb = (w, h, d, r, x, y, z, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, r).translate(x, y, z);
const bx = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

export const UNIT = { L: 0.8, W: 0.68, H: 0.3 };
export const POD = { w: 0.92, h: 2.35, lift: 0.05 };

// materials shared by the warehouse pieces
export function warehouseMaterials(st) {
  const fab = st.pbr('Fabric082A', { repeat: [3, 3] });
  return {
    unit: [
      new THREE.MeshPhysicalMaterial({ color: 0xc9ced4, roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.25 }), // 0 shell
      new THREE.MeshStandardMaterial({ color: 0x24272b, roughness: 0.6, metalness: 0.2 }), // 1 skirt
      new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.35, metalness: 0.8 }), // 2 turntable
      new THREE.MeshStandardMaterial({ color: 0x0e0f10, roughness: 0.75 }), // 3 bumper rubber
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6fd8ff).multiplyScalar(3), toneMapped: false }), // 4 status light
      new THREE.MeshPhysicalMaterial({ color: 0x050607, roughness: 0.05, clearcoat: 1 }), // 5 sensor glass
    ],
    pods: [1, 2, 3].map((k) => podMaterials(k * 17, fab.normalMap)),
    rack: [
      new THREE.MeshStandardMaterial({ color: 0x35506b, roughness: 0.5, metalness: 0.4 }), // 0 uprights
      new THREE.MeshStandardMaterial({ color: 0x8b98a6, roughness: 0.45, metalness: 0.5 }), // 1 beams
      new THREE.MeshStandardMaterial({ color: 0xd2d6da, roughness: 0.35, metalness: 0.0 }), // 2 stretch-wrapped loads
      new THREE.MeshStandardMaterial({ color: 0x8a7a62, roughness: 0.9 }), // 3 pallets
    ],
  };
}

export function unitGeometry() {
  const { L, W, H } = UNIT;
  return part([
    [rb(L, 0.17, W, 0.05, 0, H - 0.085, 0, 4), 0],
    [rb(L - 0.03, 0.1, W - 0.03, 0.03, 0, 0.08, 0), 1],
    [rb(L + 0.012, 0.04, W + 0.012, 0.02, 0, 0.14, 0), 3],
    [new THREE.CylinderGeometry(0.29, 0.3, 0.035, 48).translate(0, H + 0.016, 0), 2],
    [new THREE.CylinderGeometry(0.2, 0.2, 0.038, 48).translate(0, H + 0.018, 0), 1],
    // front (+x): sensor window, two light strips; a hairline seam on the shell
    [bx(0.006, 0.05, 0.22, L / 2 + 0.001, H - 0.09, 0), 5],
    [bx(0.006, 0.012, 0.09, L / 2 + 0.002, H - 0.04, 0.22), 4],
    [bx(0.006, 0.012, 0.09, L / 2 + 0.002, H - 0.04, -0.22), 4],
    [bx(0.006, 0.012, 0.09, -L / 2 - 0.002, H - 0.04, 0.22), 4],
    [bx(0.006, 0.012, 0.09, -L / 2 - 0.002, H - 0.04, -0.22), 4],
    [bx(L - 0.1, 0.004, 0.004, 0, H + 0.001, W / 2 - 0.08), 1],
    [bx(L - 0.1, 0.004, 0.004, 0, H + 0.001, -W / 2 + 0.08), 1],
  ]);
}

// the face of a fabric pod: rows of bin openings (dark, with goods inside), fabric dividers, elastic straps, labels
function podFaceCanvas(seed) {
  const W = 512, H = 1120, k2 = 2;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const R = rng(seed);
  g.fillStyle = '#c9d2da';
  g.fillRect(0, 0, W, H);
  // fabric weave noise
  for (let k = 0; k < 9000; k++) { g.fillStyle = `rgba(${R() < 0.5 ? '255,255,255' : '60,70,80'},${0.04 + R() * 0.05})`; g.fillRect(R() * W, R() * H, 1 + R() * 3, 1); }
  // row heights chosen at random, then scaled to fill the face exactly
  const rows = [];
  let tot = 0;
  while (tot < H * 0.95) { const rh = (52 + Math.floor(R() * 4) * 16) * k2; rows.push(rh); tot += rh; }
  const fit = (H - 24) / tot;
  let y = 12;
  for (const rh0 of rows) {
    const rh = rh0 * fit;
    const cols = R() < 0.3 ? 2 : R() < 0.7 ? 3 : 4;
    const cw = (W - 16) / cols;
    for (let k = 0; k < cols; k++) {
      const x0 = 8 + k * cw + 6, w = cw - 12, h = rh - 24;
      // the opening: dark inside, lighter toward the lip
      const gr = g.createLinearGradient(0, y, 0, y + h);
      gr.addColorStop(0, '#15181c');
      gr.addColorStop(1, '#2a3036');
      g.fillStyle = gr;
      g.fillRect(x0, y, w, h * 0.78);
      // goods inside: boxes and bags in muted colours
      for (let n = 0; n < 2 + Math.floor(R() * 3); n++) {
        const gw = w * (0.2 + R() * 0.35), gh = h * (0.25 + R() * 0.45);
        const gx = x0 + R() * (w - gw), gy = y + h * 0.78 - gh;
        const tones = ['#7d7468', '#5d6a78', '#8d939a', '#3c4652', '#a19c92', '#6d7f8f'];
        g.fillStyle = tones[Math.floor(R() * tones.length)];
        g.fillRect(gx, gy, gw, gh);
        g.fillStyle = 'rgba(255,255,255,0.08)';
        g.fillRect(gx, gy, gw, 2);
      }
      // the bin lip and its label
      g.fillStyle = '#b8c3cd';
      g.fillRect(x0, y + h * 0.78, w, h * 0.22);
      g.fillStyle = '#f2f4f5';
      g.fillRect(x0 + w * 0.1, y + h * 0.83, w * 0.3, h * 0.1);
      // an elastic strap across the opening
      g.fillStyle = 'rgba(30,34,38,0.85)';
      g.fillRect(x0, y + h * 0.42, w, 3);
      // stitching along the lip
      g.fillStyle = 'rgba(80,90,100,0.6)';
      for (let sx = x0 + 4; sx < x0 + w - 4; sx += 9) g.fillRect(sx, y + h * 0.8, 5, 1);
    }
    y += rh;
  }
  // seams between bins
  g.strokeStyle = 'rgba(90,100,110,0.5)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, W - 2, H - 2);
  return c;
}
function podTopCanvas(seed) {
  const N = 256, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const R = rng(seed + 50);
  g.fillStyle = '#aab6c1';
  g.fillRect(0, 0, N, N);
  for (let k = 0; k < 4; k++) {
    const x = (k % 2) * N / 2, y = Math.floor(k / 2) * N / 2;
    g.fillStyle = '#1d2227';
    g.fillRect(x + 8, y + 8, N / 2 - 16, N / 2 - 16);
    for (let n = 0; n < 2; n++) {
      g.fillStyle = ['#8a7f70', '#6a7886', '#9da3a9'][Math.floor(R() * 3)];
      const w = 30 + R() * 50, h = 30 + R() * 50;
      g.fillRect(x + 12 + R() * (N / 2 - 24 - w), y + 12 + R() * (N / 2 - 24 - h), w, h);
    }
  }
  return c;
}
const tex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };

// pod materials for one variant: [frame, side, top]
export function podMaterials(seed, fabricNormal) {
  return [
    new THREE.MeshStandardMaterial({ color: 0x3e4852, roughness: 0.45, metalness: 0.6 }),
    new THREE.MeshStandardMaterial({ map: tex(podFaceCanvas(seed)), roughness: 0.92, normalMap: fabricNormal, normalScale: new THREE.Vector2(0.6, 0.6) }),
    new THREE.MeshStandardMaterial({ map: tex(podTopCanvas(seed)), roughness: 0.9 }),
  ];
}

// a fabric pod on four short legs (the drive unit fits underneath): body from LEG up to POD.h
export const LEG = 0.36;
export function podGeometry() {
  const { w, h } = POD;
  const bh = h - LEG;
  const L = [];
  const t = 0.04;
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) L.push([bx(t, LEG + 0.02, t, x * (w / 2 - t / 2), (LEG + 0.02) / 2, z * (w / 2 - t / 2)), 0]);
  L.push([bx(w, 0.04, w, 0, LEG + 0.02, 0), 0]);
  // four faces (uv 0..1 each), the top
  const face = (yaw) => new THREE.PlaneGeometry(w - 0.01, bh).translate(0, 0, (w - 0.01) / 2).rotateY(yaw).translate(0, LEG + bh / 2, 0);
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) L.push([face(yaw), 1]);
  L.push([new THREE.PlaneGeometry(w - 0.01, w - 0.01).rotateX(-Math.PI / 2).translate(0, h, 0), 2]);
  // corner posts up the full height and a top rim
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) L.push([bx(0.03, bh, 0.03, x * (w / 2 - 0.01), LEG + bh / 2, z * (w / 2 - 0.01)), 0]);
  return part(L);
}

// one bay of pallet racking: two upright frames, three beam levels, loads (local: bay centred at the origin, 2.7 m wide)
export function rackBayGeometry(seed = 3, { levels = [0, 1.75, 3.5, 5.25], height = 7.2 } = {}) {
  const R = rng(seed);
  const L = [];
  const W = 2.7, D = 1.1;
  for (const x of [-W / 2, W / 2]) for (const z of [-D / 2, D / 2]) L.push([bx(0.09, height, 0.07, x, height / 2, z), 0]);
  for (const x of [-W / 2, W / 2]) for (let k = 0; k < 7; k++) L.push([bx(0.03, 0.03, D, x, 0.5 + k * 1.0, 0), 0]);
  for (const y of levels) {
    if (y > 0) for (const z of [-D / 2, D / 2]) L.push([bx(W, 0.12, 0.05, 0, y, z), 1]);
    for (const px of [-0.68, 0.68]) {
      if (R() < 0.12) continue;
      const lh = 0.9 + R() * 0.45;
      L.push([bx(1.15, 0.14, 1.0, px, y + 0.07 + 0.065, 0), 3]);
      L.push([rb(1.12, lh, 0.98, 0.04, px, y + 0.2 + lh / 2, 0, 2), 2]);
    }
  }
  return part(L);
}

// ------------------------------------------------------------------------------------------------ motion
// a unit's schedule from a start node + heading and a list of moves: ['F', n] drive n nodes forward, ['L'|'R'] turn
// 90 degrees in place, ['W', s] wait. Heading 0 = +x, PI/2 = -z (three.js yaw). Returns pose(t) -> { x, z, yaw, podYaw }.
export function schedule({ x, z, heading = 0, t0 = 0, moves, speed = 1.4, acc = 1.6, turn = 1.0, cell = 1 }) {
  const segs = [];
  let t = t0, hx = x, hz = z, hd = heading;
  for (const [k, v] of moves) {
    if (k === 'F') {
      const d = v * cell;
      // trapezoid speed profile
      const ta = speed / acc, da = 0.5 * acc * ta * ta;
      let T;
      if (2 * da >= d) T = 2 * Math.sqrt(d / acc);
      else T = 2 * ta + (d - 2 * da) / speed;
      const dx = Math.cos(hd), dz = -Math.sin(hd);
      segs.push({ k: 'F', t0: t, t1: t + T, x0: hx, z0: hz, dx, dz, d, hd, ta: Math.min(ta, T / 2) });
      hx += dx * d; hz += dz * d; t += T;
    } else if (k === 'L' || k === 'R') {
      const h1 = hd + (k === 'L' ? Math.PI / 2 : -Math.PI / 2);
      segs.push({ k: 'T', t0: t, t1: t + turn, x0: hx, z0: hz, h0: hd, h1 });
      hd = h1; t += turn;
    } else if (k === 'W') {
      segs.push({ k: 'W', t0: t, t1: t + v, x0: hx, z0: hz, hd });
      t += v;
    }
  }
  const end = { x: hx, z: hz, yaw: hd };
  const s0 = { x, z, yaw: heading };
  const pose = (tt) => {
    if (tt <= t0 || !segs.length) return { ...s0, v: 0 };
    for (const s of segs) {
      if (tt > s.t1) continue;
      const u = tt - s.t0;
      if (s.k === 'F') {
        const T = s.t1 - s.t0, a = s.d / (T - s.ta); // cruise speed given ta
        let dist;
        const acc2 = a / s.ta;
        if (u < s.ta) dist = 0.5 * acc2 * u * u;
        else if (u > T - s.ta) { const r = T - u; dist = s.d - 0.5 * acc2 * r * r; }
        else dist = 0.5 * acc2 * s.ta * s.ta + a * (u - s.ta);
        return { x: s.x0 + s.dx * dist, z: s.z0 + s.dz * dist, yaw: s.hd, v: 1 };
      }
      if (s.k === 'T') return { x: s.x0, z: s.z0, yaw: lerp(s.h0, s.h1, ss(u / (s.t1 - s.t0))), v: 0.5 };
      return { x: s.x0, z: s.z0, yaw: s.hd, v: 0 };
    }
    return { ...end, v: 0 };
  };
  return { pose, end: t, segs };
}
