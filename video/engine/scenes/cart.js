// 1979, Stanford Cart: crossing a chair-filled room took about five hours (stop, nine photos, think, move a metre).
import { THREE, projector } from '../core/three.js';
import { W, H, PAL, rgba } from '../core/stage.js';
import { line, text, label, FONT, lightDot, arc } from '../core/draw.js';
import { clamp, lerp, smoothstep, ease, prog, rng } from '../core/math.js';
import { wire, boxLines, circleLines, chairLines } from './lib/wire.js';

let S = null;
const CHAIRS = [[-2.0, 1.1, 0.4], [-1.2, -0.6, 2.2], [-0.2, 0.9, 1.1], [0.6, -1.3, -0.5], [1.0, 0.3, 2.8], [1.9, -0.2, 0.9], [2.4, 1.4, -1.0], [-2.6, -1.4, 1.6], [0.1, -0.2, 0.3]];
// waypoints around the chairs (metres, floor plane x,z)
const PATH = [[-3.4, 0.4], [-2.6, 0.1], [-1.7, 0.2], [-0.95, 0.35], [-0.55, -0.6], [0.2, -0.9], [0.75, -0.55], [1.35, -0.95], [2.15, -1.0], [2.85, -0.45], [3.4, -0.3]];

function setup() {
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 100);
  // cumulative length along path
  const cum = [0];
  for (let i = 1; i < PATH.length; i++) cum.push(cum[i - 1] + Math.hypot(PATH[i][0] - PATH[i - 1][0], PATH[i][1] - PATH[i - 1][1]));
  S = { cam, cum, total: cum[cum.length - 1] };
}
function along(dist) {
  const { cum } = S;
  for (let i = 1; i < PATH.length; i++) {
    if (dist <= cum[i]) {
      const f = (dist - cum[i - 1]) / (cum[i] - cum[i - 1]);
      return { x: lerp(PATH[i - 1][0], PATH[i][0], f), z: lerp(PATH[i - 1][1], PATH[i][1], f), ang: Math.atan2(PATH[i][1] - PATH[i - 1][1], PATH[i][0] - PATH[i - 1][0]) };
    }
  }
  const n = PATH.length - 1;
  return { x: PATH[n][0], z: PATH[n][1], ang: 0 };
}

function cartModel() {
  const L = [];
  L.push(...boxLines(0.9, 0.18, 0.56, 0.32));
  for (const [x, z] of [[-0.36, -0.32], [0.36, -0.32], [-0.36, 0.32], [0.36, 0.32]]) {
    const wheel = [];
    for (let k = 0; k <= 32; k++) { const a = (k / 32) * Math.PI * 2; wheel.push([x + Math.cos(a) * 0.24, 0.24 + Math.sin(a) * 0.24, z]); }
    L.push(wheel);
    L.push([[x - 0.24, 0.24, z], [x + 0.24, 0.24, z]], [[x, 0.0, z], [x, 0.48, z]]);
  }
  // mast + slider rail + antenna
  L.push([[0.38, 0.5, 0], [0.38, 0.95, 0]], [[0.38, 0.95, -0.32], [0.38, 0.95, 0.32]], [[-0.3, 0.5, 0.1], [-0.42, 1.25, 0.1]]);
  return L;
}
function camBox(u) {
  // the TV camera that slides along the rail (u in 0..1)
  const z = -0.32 + 0.64 * u;
  return boxLines(0.2, 0.14, 0.12, 0.96).map((pl) => pl.map(([x, y, zz]) => [x + 0.44, y, zz + z]));
}

export function draw(pen, t, p) {
  if (!S) setup();
  const c = p.cue || {};
  const dur = p.dur || 13;
  const tFive = c.five ?? 6.0; // "它花了五个小时"
  const tStop = c.stop ?? 7.6; // "每走一米，就停下来拍照"
  const tThink = c.think ?? 9.4; // "再想十几分钟"
  const { cam } = S;
  // camera: high three-quarter view, slow push
  const k = ease.inOutSine(clamp(t / dur));
  cam.position.set(lerp(-2.6, -0.8, k), lerp(5.2, 6.6, k), lerp(5.4, 6.6, k));
  cam.lookAt(lerp(-1.6, 0.2, k), 0, lerp(0.2, 0, k));
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  const P = projector(cam);
  const fog = [6, 14];
  const reveal = prog(t, -0.2, 0.9, ease.outCubic);
  // floor tiles + walls
  const tiles = [];
  for (let x = -4; x <= 4; x += 0.5) tiles.push([[x, 0, -2.2], [x, 0, 2.2]]);
  for (let z = -2.2; z <= 2.2; z += 0.55) tiles.push([[-4, 0, z], [4, 0, z]]);
  wire(pen, P, tiles, { color: PAL.cool, a: 0.13, w: 1, glow: 0.15, reveal, fog });
  const walls = [[[-4, 0, -2.2], [4, 0, -2.2], [4, 0, 2.2], [-4, 0, 2.2], [-4, 0, -2.2]], [[-4, 0.6, -2.2], [4, 0.6, -2.2], [4, 0.6, 2.2]], [[-4, 0.6, -2.2], [-4, 0.6, 2.2]], [[-4, 0, -2.2], [-4, 0.6, -2.2]], [[4, 0, -2.2], [4, 0.6, -2.2]], [[4, 0, 2.2], [4, 0.6, 2.2]], [[-4, 0, 2.2], [-4, 0.6, 2.2]]];
  wire(pen, P, walls, { color: PAL.cool, a: 0.38, w: 1.3, glow: 0.35, reveal, fog });
  // chairs pop in
  CHAIRS.forEach(([x, z, ry], i) => {
    const ca = smoothstep(0.1 + i * 0.06, 0.45 + i * 0.06, t);
    wire(pen, P, chairLines(), { color: PAL.cool, a: 0.55 * ca, w: 1.4, glow: 0.4, T: { pos: [x, 0, z], ry }, fog });
  });
  // goal marker
  const gp = P(3.6, 0, -0.3);
  const goalA = smoothstep(1.2, 1.8, t);
  lightDot(pen, gp.x, gp.y, 26, PAL.gold, 0.55 * goalA);
  text(pen.ui, '终点', gp.x, gp.y - 34, { size: 18, font: FONT.sans, weight: 500, color: PAL.gold, a: goalA * 0.9 });

  // ---- cart progress: hop one metre at a time; between hops: photos then thinking
  // before "five hours" the cart waits at the start; after, hops accelerate in narrative time
  const hops = 7;
  const tA = tFive - 0.3, tB = dur - 0.6;
  const phase = clamp((t - tA) / (tB - tA)) * hops;
  const hop = Math.floor(phase), f = phase - hop;
  // each hop: 0-0.25 move, 0.25-0.55 photos, 0.55-1 thinking
  const moveF = ease.inOutCubic(clamp(f / 0.25));
  const dist = Math.min(S.total, (hop + (t > tA ? moveF : 0)) * (S.total / hops));
  const pos = along(dist);
  const cart = cartModel();
  wire(pen, P, cart, { color: PAL.cyan, a: 0.85, w: 1.5, glow: 0.7, T: { pos: [pos.x, 0, pos.z], ry: -pos.ang }, fog });
  const slideU = t > tA && f > 0.25 && f < 0.55 ? clamp((f - 0.25) / 0.3) : 0.5;
  wire(pen, P, camBox(slideU), { color: PAL.warmHi, a: 0.95, w: 1.8, glow: 1.0, T: { pos: [pos.x, 0, pos.z], ry: -pos.ang } });
  // path planned (dashed ahead, solid behind)
  const pathPts = PATH.map(([x, z]) => [x, 0.02, z]);
  wire(pen, P, [pathPts], { color: PAL.cyan, a: 0.35 * smoothstep(1.4, 2.2, t), w: 1.4, glow: 0.4, dash: [8, 8] });
  // traversed trail
  const trail = [];
  for (let d = 0; d <= dist; d += 0.08) { const q = along(d); trail.push([q.x, 0.02, q.z]); }
  if (trail.length > 1) wire(pen, P, [trail], { color: PAL.cyan, a: 0.85, w: 2.4, glow: 1 });
  // photos: the camera slides along its rail taking nine frames (frustum flashes)
  const inPhoto = t > tA && f > 0.25 && f < 0.55 && hop < hops;
  const camWorld = (u) => {
    const ca = Math.cos(-pos.ang), sa = Math.sin(-pos.ang);
    const lx = 0.38, lz = lerp(-0.32, 0.32, u);
    return [pos.x + lx * ca + lz * sa, 0.95, pos.z - lx * sa + lz * ca];
  };
  if (inPhoto || (t > tStop - 0.2 && t < tStop + 1.4 && f > 0.2)) {
    const u = clamp((f - 0.25) / 0.3);
    const shot = Math.floor(u * 9);
    const cp = camWorld(u);
    const fl = 1 - ((u * 9) % 1);
    const fwd = [Math.cos(pos.ang), 0, Math.sin(pos.ang)];
    const far = [cp[0] + fwd[0] * 1.6, 0.25, cp[2] + fwd[2] * 1.6];
    const side = [-fwd[2] * 0.7, 0, fwd[0] * 0.7];
    const fr = [[cp, [far[0] + side[0], far[1], far[2] + side[2]]], [cp, [far[0] - side[0], far[1], far[2] - side[2]]], [[far[0] + side[0], far[1], far[2] + side[2]], [far[0] - side[0], far[1], far[2] - side[2]]]];
    wire(pen, P, fr, { color: PAL.warmHi, a: 0.75 * fl, w: 1.2, glow: 1 });
    const cs = P(...cp);
    lightDot(pen, cs.x, cs.y, 34, PAL.warmHi, 0.8 * fl);
    text(pen.ui, `拍照 ${Math.min(9, shot + 1)}/9`, cs.x + 26, cs.y - 46, { size: 17, font: FONT.mono, weight: 500, color: PAL.warmHi, a: 0.9, align: 'left' });
  }
  // thinking spinner
  const thinking = t > tA && f >= 0.55 && hop < hops;
  if (thinking) {
    const cs = P(pos.x, 1.5, pos.z);
    const u = clamp((f - 0.55) / 0.45);
    arc(pen, cs.x, cs.y, 22, -Math.PI / 2, -Math.PI / 2 + u * Math.PI * 2, { color: PAL.cyan, a: 0.95, w: 3, glow: 1 });
    arc(pen, cs.x, cs.y, 22, 0, Math.PI * 2, { color: PAL.cyan, a: 0.2, w: 3, glow: 0 });
    text(pen.ui, '思考中 · 约十几分钟', cs.x + 36, cs.y, { size: 17, font: FONT.sans, weight: 500, color: [150, 214, 255], a: 0.95, align: 'left' });
  }
  // clock: real elapsed time in the room, 0 -> 5:00:00 (thinking dominates)
  const clockA = smoothstep(tFive - 0.4, tFive, t);
  if (clockA > 0) {
    const hrs = clamp((t - tA) / (tB - tA)) * 5;
    const hh = Math.floor(hrs), mm = Math.floor((hrs * 60) % 60), ss = Math.floor((hrs * 3600) % 60);
    const str = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    text(pen.ui, str, 1780, 150, { size: 72, font: FONT.mono, weight: 500, color: [236, 230, 220], a: clockA, align: 'right', spacing: 3 });
    text(pen.ui, '耗时', 1780, 205, { size: 18, font: FONT.sans, weight: 500, color: PAL.dim, a: clockA, align: 'right', spacing: 4 });
  }
  // caption
  const capA = smoothstep(0.3, 0.9, t);
  label(pen, 140, 170, { en: 'STANFORD CART · 1979', zh: '斯坦福人工智能实验室', a: capA, color: PAL.cool, rule: 170 });
}
