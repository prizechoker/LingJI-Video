// Deterministic math helpers shared by all scenes.

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, x) => clamp((x - a) / (b - a));
export const remap = (x, a0, a1, b0, b1) => lerp(b0, b1, invLerp(a0, a1, x));
export const smoothstep = (a, b, x) => {
  const t = invLerp(a, b, x);
  return t * t * (3 - 2 * t);
};
export const fract = (x) => x - Math.floor(x);
export const TAU = Math.PI * 2;

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  inOutQuart: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  inOutExpo: (t) =>
    t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outSine: (t) => Math.sin((t * Math.PI) / 2),
  outBack: (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  // critically damped spring settle, t in [0,1]
  outSpring: (t, k = 6) => 1 - Math.exp(-k * t) * (1 + k * t),
};

// Progress of a local animation window [a,b] in seconds, eased.
export const prog = (t, a, b, fn = ease.inOutCubic) => fn(clamp((t - a) / (b - a)));

// Fade in over [a, a+din], hold, fade out over [b-dout, b].
export const window01 = (t, a, b, din = 0.4, dout = 0.4) => {
  if (t < a || t > b) return 0;
  const i = din > 0 ? smoothstep(a, a + din, t) : 1;
  const o = dout > 0 ? 1 - smoothstep(b - dout, b, t) : 1;
  return Math.min(i, o);
};

// Seeded PRNG (mulberry32) so every frame is reproducible.
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash1(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

// 2D/3D value-gradient noise (compact simplex-like), deterministic.
const P = new Uint8Array(512);
{
  const r = rng(1337);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) P[i] = p[i & 255];
}
const grad3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1],
  [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
export function noise3(x, y, z) {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
  x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
  const u = fade(x), v = fade(y), w = fade(z);
  const g = (h, a, b, c) => {
    const gg = grad3[h % 12];
    return gg[0] * a + gg[1] * b + gg[2] * c;
  };
  const A = P[X] + Y, AA = P[A] + Z, AB = P[A + 1] + Z;
  const B = P[X + 1] + Y, BA = P[B] + Z, BB = P[B + 1] + Z;
  return lerp(
    lerp(lerp(g(P[AA], x, y, z), g(P[BA], x - 1, y, z), u), lerp(g(P[AB], x, y - 1, z), g(P[BB], x - 1, y - 1, z), u), v),
    lerp(
      lerp(g(P[AA + 1], x, y, z - 1), g(P[BA + 1], x - 1, y, z - 1), u),
      lerp(g(P[AB + 1], x, y - 1, z - 1), g(P[BB + 1], x - 1, y - 1, z - 1), u),
      v,
    ),
    w,
  );
}
export const noise2 = (x, y) => noise3(x, y, 0.5);

// ---------- tiny 3D for wireframe line art ----------
export const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const add3 = (a, b) => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub3 = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const mul3 = (a, s) => v3(a.x * s, a.y * s, a.z * s);
export const dot3 = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross3 = (a, b) => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const len3 = (a) => Math.hypot(a.x, a.y, a.z);
export const norm3 = (a) => mul3(a, 1 / (len3(a) || 1));
export const lerp3 = (a, b, t) => v3(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t));
export const rotY = (p, a) => v3(p.x * Math.cos(a) + p.z * Math.sin(a), p.y, -p.x * Math.sin(a) + p.z * Math.cos(a));
export const rotX = (p, a) => v3(p.x, p.y * Math.cos(a) - p.z * Math.sin(a), p.y * Math.sin(a) + p.z * Math.cos(a));
export const rotZ = (p, a) => v3(p.x * Math.cos(a) - p.y * Math.sin(a), p.x * Math.sin(a) + p.y * Math.cos(a), p.z);

// Pinhole camera looking from `eye` to `target`; y is up. Returns projector into 1920x1080 space.
export function camera(eye, target, fovDeg = 40, W = 1920, H = 1080, roll = 0) {
  const fwd = norm3(sub3(target, eye));
  let right = norm3(cross3(fwd, v3(0, 1, 0)));
  let up = cross3(right, fwd);
  if (roll) {
    const c = Math.cos(roll), s = Math.sin(roll);
    const r2 = add3(mul3(right, c), mul3(up, s));
    const u2 = add3(mul3(up, c), mul3(right, -s));
    right = r2; up = u2;
  }
  const f = (H / 2) / Math.tan((fovDeg * Math.PI) / 360);
  return {
    eye, fwd, right, up, f,
    project(p) {
      const d = sub3(p, eye);
      const z = dot3(d, fwd);
      const x = dot3(d, right), y = dot3(d, up);
      const s = f / Math.max(z, 1e-3);
      return { x: W / 2 + x * s, y: H / 2 - y * s, z, s, visible: z > 0.05 };
    },
  };
}
