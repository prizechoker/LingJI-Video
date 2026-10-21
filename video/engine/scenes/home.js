// U17–U18: one place cannot become a board — your home. Bowls differ, clothes get tossed, the cat jumps on the table.
import { THREE, projector, render3 } from '../core/three.js';
import { W, H, PAL, rgba } from '../core/stage.js';
import { line, text, glowText, FONT, lightDot, polyline } from '../core/draw.js';
import { clamp, lerp, smoothstep, ease, rng, noise2 } from '../core/math.js';
import { wire, boxLines, chairLines } from './lib/wire.js';
import { warmMat, makeVessel, chopsticks } from './lib/props.js';

let S = null;
function setup() {
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.12));
  const k = new THREE.DirectionalLight(0xffd9b0, 0.35);
  k.position.set(-2, 5, 3);
  scene.add(k);
  const warm = warmMat();
  const items = [
    makeVessel('soupBowl', warm), makeVessel('riceBowl', warm), makeVessel('deepBowl', warm),
    makeVessel('plate', warm), makeVessel('mug', warm), chopsticks(warm),
  ];
  items.forEach((m) => scene.add(m));
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.02, 50);
  S = { scene, items, cam };
}

// arrangement of items on the table for "day" d (deterministic, different every day)
function layout(d) {
  const R = rng(1000 + d * 17);
  return S.items.map((_, i) => ({
    x: (R() - 0.5) * 0.9, z: (R() - 0.5) * 0.45, ry: R() * 6.28,
    tilt: i === 4 && R() > 0.5 ? 1.57 : (R() - 0.5) * 0.25,
  }));
}

// leaping cat silhouette (side view, facing right), local units ~1 = 1px at scale 1
const CAT_LEAP = [[-120, 8], [-150, -14], [-176, -30], [-160, -22], [-120, 0], [-90, -12], [-40, -18], [10, -16], [40, -22], [52, -40], [60, -28], [72, -44], [78, -24], [92, -14], [96, -2], [82, 6], [62, 8], [80, 22], [104, 30], [96, 36], [60, 20], [20, 14], [-30, 14], [-70, 22], [-104, 40], [-112, 34], [-96, 16], [-120, 8]];
const CAT_SIT = [[-40, 40], [-46, 10], [-38, -24], [-20, -44], [0, -50], [10, -64], [6, -86], [16, -72], [30, -76], [40, -90], [42, -66], [50, -52], [46, -36], [34, -28], [30, 0], [36, 30], [40, 40], [10, 40], [-40, 40], [-60, 36], [-80, 20], [-86, 0]];

export function draw(pen, t, p) {
  if (!S) setup();
  const c = p.cue || {};
  const dur = p.dur || 11;
  const tHome = c.home ?? 2.0; // "你家"
  const tBowls = c.bowls ?? 3.6; // "碗的形状各不一样"
  const tShirt = c.shirt ?? 5.2; // "衣服随手一扔"
  const tCat = c.cat ?? 6.4; // "猫还会跳上桌子"
  const tDays = c.days ?? 8.2; // "每一天，都不一样"

  // ===== part A: the board reaches the home and breaks
  const aA = 1 - smoothstep(tBowls - 0.6, tBowls, t);
  if (aA > 0) {
    const n = 19, st = 34;
    const ox = 330, oy = 540 - (n - 1) * st / 2;
    const breakX = 1060; // where the home begins
    for (let i = 0; i < n; i++) {
      // horizontal lines run right; past the wall they wobble, fragment and fade
      const y = oy + i * st;
      const reach = lerp(ox, 1700, ease.outCubic(clamp(t / 1.6)));
      const pts = [];
      for (let x = ox; x <= reach; x += 12) {
        const over = Math.max(0, x - breakX) / 300;
        const wob = over * over * 28 * noise2(x * 0.02, i * 0.7 + t * 0.6);
        pts.push([x, y + wob]);
      }
      for (let k = 1; k < pts.length; k++) {
        const over = Math.max(0, pts[k][0] - breakX) / 300;
        if (over > 0.3 && ((k + i) % 3 === 0)) continue; // fragments
        const col = over > 0 ? PAL.warm : PAL.cool;
        line(pen, pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], { color: col, a: aA * 0.5 * (1 - clamp(over * 0.55)), w: 1.2, glow: 0.5 });
      }
      const x = ox + i * st;
      line(pen, x, oy, x, oy + (n - 1) * st, { color: PAL.cool, a: aA * 0.5, w: 1.2, glow: 0.5, glowColor: PAL.cyan });
    }
    // house outline on the right, warm
    const hA = smoothstep(tHome - 0.6, tHome + 0.2, t) * aA;
    const hx = 1390, hy = 600;
    polyline(pen, [[hx - 230, hy + 170], [hx - 230, hy - 40], [hx, hy - 230], [hx + 230, hy - 40], [hx + 230, hy + 170], [hx - 230, hy + 170]], hA, { color: PAL.warm, a: hA * 0.9, w: 2.4, glow: 1 });
    polyline(pen, [[hx - 50, hy + 170], [hx - 50, hy + 40], [hx + 50, hy + 40], [hx + 50, hy + 170]], hA, { color: PAL.warm, a: hA * 0.8, w: 2, glow: 0.8 });
    lightDot(pen, hx, hy - 60, 120, PAL.warm, 0.18 * hA);
    if (hA > 0) {
      glowText(pen, '你家', hx, hy - 330, { size: 64, font: FONT.serif, weight: 700, color: [255, 226, 186], glowColor: PAL.warm, glow: 0.5, a: hA, spacing: 14 });
      text(pen.ui, '变不成棋盘的地方', hx, hy - 268, { size: 20, font: FONT.sans, weight: 400, color: PAL.dim, a: hA, spacing: 4 });
    }
  }

  // ===== part B: the table, every day different
  const bA = smoothstep(tBowls - 0.5, tBowls + 0.2, t);
  if (bA <= 0) return;
  const { cam, scene, items } = S;
  const lt = t - tBowls;
  cam.position.set(lerp(0.12, -0.08, clamp(lt / 8)), 1.32, 1.38);
  cam.lookAt(0, 0.7, 0);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  const P = projector(cam);
  // table + chairs, warm hairlines
  const table = [...boxLines(1.2, 0.04, 0.7, 0.72)];
  for (const [x, z] of [[-0.55, -0.3], [0.55, -0.3], [0.55, 0.3], [-0.55, 0.3]]) table.push([[x, 0, z], [x, 0.72, z]]);
  wire(pen, P, table, { color: PAL.warm, a: 0.6 * bA, w: 1.5, glow: 0.6 });
  wire(pen, P, chairLines(), { color: PAL.warm, a: 0.4 * bA, w: 1.3, glow: 0.4, T: { pos: [-0.85, 0, 0.1], ry: 1.4 } });
  wire(pen, P, chairLines(), { color: PAL.warm, a: 0.4 * bA, w: 1.3, glow: 0.4, T: { pos: [0.85, 0, -0.05], ry: -1.7 } });
  // which "day" are we on: shuffle arrangements after tDays
  const day = t < tDays ? 0 : Math.min(3, 1 + Math.floor((t - tDays) / 0.75));
  const fromL = layout(Math.max(0, day - 1)), toL = layout(day);
  const mix = day === 0 ? 1 : ease.inOutCubic(clamp(((t - tDays) % 0.75) / 0.35));
  items.forEach((m, i) => {
    const a = fromL[i], b = toL[i];
    const x = lerp(a.x, b.x, mix), z = lerp(a.z, b.z, mix);
    m.position.set(x, 0.745 + (i === 3 ? 0 : 0.0), z);
    m.rotation.set(lerp(a.tilt, b.tilt, mix), lerp(a.ry, b.ry, mix), 0);
    // items appear one by one as the narration lists differences
    const show = smoothstep(i * 0.15, i * 0.15 + 0.3, lt);
    m.scale.setScalar(Math.max(0.001, show) * (i === 3 ? 0.9 : 1));
  });
  render3(pen, scene, cam, { glow: 0.55, a: bA });
  // shirt tossed over the left chair (warm line art)
  const sA = smoothstep(tShirt - 0.2, tShirt + 0.3, t);
  if (sA > 0) {
    const anchor = P(-0.95, 0.92, 0.1);
    const drop = 1 - ease.outCubic(clamp((t - tShirt + 0.2) / 0.5));
    const ax = anchor.x, ay = anchor.y - drop * 160;
    const shirt = [[-70, 0], [-30, -10], [-10, 4], [10, -6], [44, -2], [80, 16], [60, 36], [70, 90], [40, 120], [10, 104], [-24, 128], [-50, 96], [-46, 50], [-80, 30], [-70, 0]];
    polyline(pen, shirt.map(([x, y]) => [ax + x * 0.9, ay + y * 0.9]), 1, { color: PAL.warm, a: sA * 0.85, w: 2, glow: 0.8 });
    polyline(pen, [[ax - 20, ay + 40], [ax + 4, ay + 70], [ax - 10, ay + 100]], 1, { color: PAL.warm, a: sA * 0.5, w: 1.4, glow: 0.4 });
  }
  // cat leaps onto the table, then sits among the bowls
  const cA = smoothstep(tCat - 0.3, tCat, t);
  if (cA > 0) {
    const leapU = clamp((t - tCat + 0.2) / 0.9);
    const start = P(1.4, 0.0, 0.3), end = P(0.32, 0.76, 0.08);
    const x = lerp(start.x, end.x, leapU);
    const y = lerp(start.y, end.y, leapU) - Math.sin(Math.PI * leapU) * 220;
    const sitMix = smoothstep(0.85, 1.0, leapU);
    const sc = 1.15;
    if (sitMix < 1) polyline(pen, CAT_LEAP.map(([px, py]) => [x - px * sc, y + py * sc]), 1, { color: PAL.warmHi, a: cA * (1 - sitMix), w: 2.2, glow: 1 });
    if (sitMix > 0) polyline(pen, CAT_SIT.map(([px, py]) => [end.x - px * sc, end.y - 40 * sc + py * sc]), 1, { color: PAL.warmHi, a: cA * sitMix, w: 2.2, glow: 1 });
  }
  // day counter
  if (t > tDays - 0.2) {
    const dA = smoothstep(tDays - 0.2, tDays + 0.2, t);
    const names = ['', '周一', '周二', '周三'];
    text(pen.ui, names[Math.max(1, day)], 1700, 170, { size: 56, font: FONT.serif, weight: 700, color: [255, 226, 186], a: dA, align: 'right', spacing: 6 });
    text(pen.ui, `DAY ${Math.max(1, day)}`, 1700, 225, { size: 16, font: FONT.mono, weight: 500, color: PAL.dim, a: dA, align: 'right', spacing: 6 });
  }
}
