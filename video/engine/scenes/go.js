// Cold open / callback: AlphaGo vs Lee Sedol game 2. The AI "thinks" (heatmap), a human hand places move 37.
import { THREE, three, projector } from '../core/three.js';
import { W, H, PAL, rgba } from '../core/stage.js';
import { label, text, FONT, lightDot } from '../core/draw.js';
import { clamp, lerp, smoothstep, ease, prog, noise2 } from '../core/math.js';
import { DATA } from '../core/data.js';
import { G, toWorld, replay, drawGrid, stoneAt, stoneAtWorld, planeCircle, heatBlob } from './lib/goboard.js';
import { createHand, setPose, orient, POSE, mixPose, tipWorld } from './lib/hand3d.js';

let S = null;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function setup() {
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xfff0e0, 0.18));
  const key = new THREE.DirectionalLight(0xffd6a8, 1.4);
  key.position.set(-0.4, 1.0, 0.6);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x8fbfff, 0.25);
  fill.position.set(0.6, 0.3, -0.5);
  scene.add(fill);
  const hand = createHand({ rimStrength: 2.2, rimPower: 2.6 });
  scene.add(hand.holder);
  const cam = new THREE.PerspectiveCamera(34, W / H, 0.005, 10);
  const moves = DATA.go.moves;
  S = { scene, hand, cam, moves, b36: replay(moves, 36), b37: replay(moves, 37) };
}

// Bezier-ish path helper
const path3 = (pts, t) => {
  // Catmull-Rom over 4+ control points
  const n = pts.length - 1;
  const f = clamp(t) * n;
  const i = Math.min(n - 1, Math.floor(f));
  const u = f - i;
  const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n, i + 2)];
  const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
  return V(cr(p0.x, p1.x, p2.x, p3.x), cr(p0.y, p1.y, p2.y, p3.y), cr(p0.z, p1.z, p2.z, p3.z));
};

export function draw(pen, t, p, env) {
  if (!S) setup();
  const { scene, hand, cam } = S;
  const c = p.cue || {};
  // cue times (seconds, local to the shot); defaults allow standalone preview
  const tHeat = c.heat ?? 0.2, tGhost = c.ghost ?? 2.6, tHandIn = c.handIn ?? 6.0, tPlace = c.place ?? 10.6, tRetreat = tPlace + 0.9;
  const mode = p.mode || 'open';
  const target = toWorld(14, 9); // move 37, P10

  // ---- camera: telephoto orbit around move 37, rising slowly (less perspective distortion)
  const k = ease.inOutSine(clamp(t / (p.dur || 14)));
  const tgt = V(target[0] - 0.012, 0, target[2] + 0.004);
  const orbit = (d, el, az) => V(tgt.x + d * Math.cos(el) * Math.sin(az), d * Math.sin(el), tgt.z + d * Math.cos(el) * Math.cos(az));
  const A = mode === 'open' ? [0.5, 0.42, 0.42] : [0.66, 0.78, 0.30];
  const B = mode === 'open' ? [0.66, 0.74, 0.30] : [0.6, 0.86, 0.26];
  cam.fov = 24;
  cam.position.copy(orbit(lerp(A[0], B[0], k), lerp(A[1], B[1], k), lerp(A[2], B[2], k)));
  cam.lookAt(tgt.clone().add(V(-0.01 * k, 0, 0.012 * (1 - k))));
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  const P = projector(cam);
  // fixed approach frame for the hand (camera basis at the moment of placement)
  if (!S.approach) {
    const az = B[2] * 0.6 + A[2] * 0.4;
    const right = V(Math.cos(az), 0, -Math.sin(az));
    const back = V(-Math.sin(az), 0, -Math.cos(az));
    S.approach = { right, back };
  }

  // ---- board
  const reveal = mode === 'open' ? prog(t, -0.6, 1.0, ease.outCubic) : 1;
  const placed = t >= tPlace;
  const rippleT = t - tPlace;
  drawGrid(pen, P, { a: 1, fogNear: 0.45, fogFar: 1.25, reveal, glowAt: target, glowAmt: placed ? 0.9 * Math.exp(-rippleT * 1.2) : 0 });
  const board = S.b36;
  const stoneIn = (i, j) => {
    if (mode !== 'open') return 1;
    // stones fade in after the grid, rippling outward from the centre of interest
    const d = Math.hypot(i - 14, j - 9);
    return smoothstep(-0.3 + d * 0.03, 0.4 + d * 0.03, t);
  };
  for (let i = 0; i < 19; i++) for (let j = 0; j < 19; j++) {
    const col = board[i][j];
    if (!col) continue;
    stoneAt(pen, P, i, j, col === 'B' ? 'black' : 'white', { a: stoneIn(i, j), focusZ: P(target[0], 0, target[2]).z, dof: 26 });
  }

  // ---- AI thinking: policy heatmap over candidate points, converging on P10
  const cands = [[14, 9, 1.0], [15, 10, 0.55], [13, 12, 0.5], [12, 7, 0.45], [16, 7, 0.35], [9, 15, 0.3], [5, 9, 0.28], [10, 10, 0.4]];
  const heatOn = smoothstep(tHeat, tHeat + 0.8, t) * (1 - smoothstep(tPlace - 0.2, tPlace + 0.4, t));
  if (heatOn > 0.001 && mode === 'open') {
    const conv = smoothstep(tGhost - 1.0, tGhost + 0.6, t); // others fade as AI decides
    cands.forEach(([i, j, wgt], n) => {
      const flick = 0.75 + 0.25 * noise2(n * 3.1, t * 2.2);
      const w = n === 0 ? lerp(wgt, 1.25, conv) : wgt * (1 - conv * 0.92);
      const [x, , z] = toWorld(i, j);
      heatBlob(pen, P, x, z, G * (0.9 + 0.7 * w), heatOn * w * flick * 0.55);
    });
  }
  // ghost stone: the decided move, waiting for a hand
  const ghost = smoothstep(tGhost, tGhost + 0.5, t) * (1 - smoothstep(tPlace - 0.05, tPlace + 0.1, t));
  if (ghost > 0.001) {
    const pulse = 0.65 + 0.35 * Math.sin(t * 5.0);
    planeCircle(pen, P, target[0], target[2], G * 0.47, { color: PAL.cyan, a: ghost * pulse * (mode === 'open' ? 1 : 0.45), w: 1.6, dash: [4, 5] });
    const s = P(target[0], 0, target[2]);
    if (mode === 'open') label(pen, s.x + 70, s.y + 70, { en: 'MOVE 37 · P10', zh: 'AlphaGo 的选择', a: ghost * 0.95, color: [150, 214, 255], rule: 110 });
  }

  // ---- hand
  let handA = 0;
  if (t > tHandIn - 0.2) {
    const tin = clamp((t - tHandIn) / (tPlace - tHandIn));
    const tout = clamp((t - tRetreat) / 1.6);
    const { right, back } = S.approach;
    const at = (r, up, b) => V(target[0], 0, target[2]).add(right.clone().multiplyScalar(r)).add(V(0, up, 0)).add(back.clone().multiplyScalar(b));
    const above = at(0.02, 0.035, 0.02);
    const contact = at(0.012, 0.016, 0.012);
    const pts = [at(0.34, 0.2, 0.2), at(0.2, 0.12, 0.12), at(0.09, 0.07, 0.06), above, contact];
    let fingerTip;
    if (mode === 'callback') {
      // memory of the hand: it drifts in and hovers above the board, stone in its fingers
      const k = ease.outCubic(clamp(t / 2.2));
      fingerTip = at(0.12, 0.09, 0.08).lerp(above, k).add(new THREE.Vector3(0, 0.004 * Math.sin(t * 1.7), 0));
    } else if (t < tRetreat) fingerTip = path3(pts, ease.inOutCubic(tin));
    else fingerTip = contact.clone().lerp(at(0.3, 0.17, 0.2), ease.inOutCubic(tout));
    // wrist sits back along the approach direction
    const dir = right.clone().multiplyScalar(-0.62).add(back.clone().multiplyScalar(-0.42)).add(V(0, -0.66, 0)).normalize();
    const wrist = fingerTip.clone().sub(dir.clone().multiplyScalar(0.165));
    const relax = smoothstep(tPlace + 0.05, tPlace + 0.5, t);
    setPose(hand, mixPose(POSE.pinch, POSE.relaxed, relax));
    orient(hand, wrist, dir, V(0, -1, 0).add(right.clone().multiplyScalar(-0.25)));
    handA = mode === 'callback' ? smoothstep(0.0, 1.0, t) : smoothstep(tHandIn - 0.2, tHandIn + 0.6, t) * (1 - smoothstep(tRetreat + 0.8, tRetreat + 1.6, t) * (p.handStays ? 0 : 1));
    // soft shadow of the hand on the board
    const sh = P(fingerTip.x + 0.03, 0, fingerTip.z - 0.02);
    const shA = handA * clamp(1 - (fingerTip.y - 0.01) / 0.18) * 0.55;
    const ctx = pen.main;
    const rg = ctx.createRadialGradient(sh.x, sh.y, 0, sh.x, sh.y, 160);
    rg.addColorStop(0, `rgba(0,0,0,${shA})`);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.ellipse(sh.x, sh.y, 200, 110, -0.3, 0, Math.PI * 2);
    ctx.fill();
    S.dir = dir;
  }
  if (placed) {
    stoneAt(pen, P, 14, 9, 'black', { a: 1, glow: 0.25 * Math.exp(-rippleT * 2) });
    for (let r = 0; r < 3; r++) {
      const rt = rippleT - r * 0.18;
      if (rt < 0 || rt > 1.6) continue;
      planeCircle(pen, P, target[0], target[2], G * (0.5 + rt * 2.4), { color: PAL.warm, a: (1 - rt / 1.6) * 0.7, w: 1.4 });
    }
  }
  if (handA > 0.001) {
    hand.u.opacity2.value = handA;
    const cv = three().render(scene, cam);
    pen.main.drawImage(cv, 0, 0, W, H);
    pen.glow.save();
    pen.glow.globalAlpha *= 0.55;
    pen.glow.drawImage(cv, 0, 0, W, H);
    pen.glow.restore();
    // the held stone protrudes beyond the index/middle fingertips (go grip) -> draw on top of the hand
    if (!placed) {
      hand.holder.updateMatrixWorld(true);
      const ti = tipWorld(hand, 'index-finger-tip'), tm = tipWorld(hand, 'middle-finger-tip');
      const sp = ti.clone().lerp(tm, 0.5).add(S.dir.clone().multiplyScalar(0.006));
      stoneAtWorld(pen, P, sp.x, sp.y, sp.z, 'black', { a: handA });
    }
  }

  // ---- captions (UI)
  const capA = mode === 'open' ? smoothstep(c.dateIn ?? 4.4, (c.dateIn ?? 4.4) + 0.6, t) : 0;
  if (capA > 0) {
    text(pen.ui, '2016 · 首尔', 132, 168, { size: 30, font: FONT.serif, weight: 600, color: [236, 230, 220], a: capA, align: 'left', spacing: 4 });
    text(pen.ui, 'GOOGLE DEEPMIND CHALLENGE MATCH · GAME 2', 134, 206, { size: 13, font: FONT.mono, weight: 500, color: PAL.dim, a: capA * 0.9, align: 'left', spacing: 3 });
    text(pen.ui, 'AlphaGo  4 : 1  李世石', 134, 240, { size: 20, font: FONT.sans, weight: 500, color: [200, 210, 222], a: capA * 0.9, align: 'left', spacing: 2 });
  }
  const who = smoothstep(c.whoIn ?? tPlace - 1.6, (c.whoIn ?? tPlace - 1.6) + 0.5, t) * (1 - smoothstep(tRetreat + 1.0, tRetreat + 1.6, t));
  if (who > 0 && mode === 'open') {
    const hp = P(0.2, 0.08, -0.03);
    label(pen, Math.min(hp.x + 60, 1500), Math.max(hp.y - 120, 300), { en: 'AJA HUANG · DEEPMIND', zh: '黄士杰 · 代 AlphaGo 落子', a: who, color: PAL.warmHi, rule: 150 });
  }
}
