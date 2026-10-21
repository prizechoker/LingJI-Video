// U20: our world is sized for human bodies (door handle, stairs, spatula) — so build the robot in our shape.
import { THREE, projector, render3 } from '../core/three.js';
import { W, H, PAL } from '../core/stage.js';
import { line, text, FONT, label } from '../core/draw.js';
import { clamp, lerp, smoothstep, ease } from '../core/math.js';
import { wire, boxLines } from './lib/wire.js';
import { createRobot, poseStand } from './lib/robot.js';

let S = null;
function setup() {
  const mk = (human) => {
    const sc = new THREE.Scene();
    sc.add(new THREE.AmbientLight(0xffffff, 0.1));
    const k = new THREE.DirectionalLight(human ? 0xffd9b0 : 0xbfe0ff, 0.3);
    k.position.set(-2, 4, 3);
    sc.add(k);
    const fig = createRobot(human ? { human: true, rim: 0xffb36b, base: 0x0d0805, rimStrength: 1.7 } : {});
    sc.add(fig.holder);
    return { sc, fig };
  };
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.05, 60);
  S = { human: mk(true), robot: mk(false), cam };
}

function dim(pen, P, a3, b3, txt, a, side = 1) {
  const A = P(...a3), B = P(...b3);
  line(pen, A.x, A.y, B.x, B.y, { color: PAL.gold, a, w: 1.6, glow: 0.7 });
  for (const q of [A, B]) line(pen, q.x - 10, q.y, q.x + 10, q.y, { color: PAL.gold, a, w: 1.6, glow: 0.7 });
  text(pen.ui, txt, (A.x + B.x) / 2 + side * 18, (A.y + B.y) / 2, { size: 22, font: FONT.mono, weight: 500, color: PAL.gold, a, align: side > 0 ? 'left' : 'right', spacing: 1 });
}

export function draw(pen, t, p) {
  if (!S) setup();
  const c = p.cue || {};
  const dur = p.dur || 9;
  const tDoor = c.door ?? 2.6, tStairs = c.stairs ?? 3.4, tPan = c.pan ?? 4.2, tMorph = c.morph ?? 5.6;
  const { cam, human, robot } = S;
  const k = ease.inOutSine(clamp(t / dur));
  cam.position.set(lerp(0.6, 0.2, k), 1.35, lerp(5.6, 5.1, k));
  cam.lookAt(0, 0.95, 0);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  const P = projector(cam);
  const fade = 1 - smoothstep(dur - 0.4, dur, t);
  // floor
  wire(pen, P, [[[-3, 0, 0], [3, 0, 0]]], { color: PAL.cool, a: 0.4 * fade, w: 1.2, glow: 0.4 });
  // door (left)
  const dA = smoothstep(0.2, 0.8, t) * fade;
  const door = [[[-2.15, 0, 0], [-2.15, 2.05, 0], [-1.25, 2.05, 0], [-1.25, 0, 0]], [[-1.38, 0.98, 0.02], [-1.55, 0.98, 0.02]]];
  wire(pen, P, door, { color: PAL.warm, a: 0.75 * dA, w: 1.8, glow: 0.6 });
  // stairs (right)
  const stairs = [];
  let x = 1.15, y = 0;
  const run = 0.27, rise = 0.165;
  const pts = [[x, 0, 0]];
  for (let i = 0; i < 6; i++) { y += rise; pts.push([x, y, 0]); x += run; pts.push([x, y, 0]); }
  stairs.push(pts);
  wire(pen, P, stairs, { color: PAL.warm, a: 0.75 * dA, w: 1.8, glow: 0.6 });
  // counter with pan + spatula (behind right)
  const ctr = [[[0.5, 0.85, -0.6], [1.0, 0.85, -0.6]], [[0.62, 0.9, -0.6], [0.9, 0.9, -0.6]], [[0.86, 0.92, -0.6], [1.1, 1.1, -0.6]]];
  wire(pen, P, ctr, { color: PAL.warm, a: 0.6 * dA, w: 1.6, glow: 0.5 });
  // dimension call-outs, one per word
  const a1 = smoothstep(tDoor - 0.1, tDoor + 0.3, t) * fade;
  if (a1 > 0) dim(pen, P, [-1.05, 0, 0.05], [-1.05, 0.98, 0.05], '门把手 ≈ 1 米', a1, 1);
  const a2 = smoothstep(tStairs - 0.1, tStairs + 0.3, t) * fade;
  if (a2 > 0) dim(pen, P, [1.1, 0, 0.1], [1.1, 0.165, 0.1], '台阶 ≈ 16 厘米', a2, -1);
  const a3 = smoothstep(tPan - 0.1, tPan + 0.3, t) * fade;
  if (a3 > 0) dim(pen, P, [1.25, 0, -0.6], [1.25, 0.85, -0.6], '灶台 ≈ 85 厘米', a3, 1);
  // the figure: human first, then the robot takes the same shape and place
  const morph = smoothstep(tMorph, tMorph + 1.0, t);
  for (const [F, a] of [[human, (1 - morph) * dA], [robot, morph * fade]]) {
    if (a <= 0.001) continue;
    poseStand(F.fig, t * 0.8);
    F.fig.holder.rotation.y = -0.25;
    F.fig.J.shoulderR.rotation.x = -0.25;
    render3(pen, F.sc, cam, { glow: 0.55, a });
  }
  const la = smoothstep(0.3, 0.8, t) * fade;
  label(pen, 140, 170, { en: 'A WORLD SIZED FOR HUMANS', zh: '照着人的身体设计的世界', a: la, color: PAL.warm, rule: 220 });
}
