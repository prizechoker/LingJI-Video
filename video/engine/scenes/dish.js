// U15: we never built a dish-washing "person"; we built a box with a grid. Bowls slot in, door closes, water sprays.
import { THREE, projector, render3 } from '../core/three.js';
import { W, H, PAL } from '../core/stage.js';
import { line, text, label, FONT, lightDot } from '../core/draw.js';
import { clamp, lerp, smoothstep, ease, rng } from '../core/math.js';
import { wire, boxLines } from './lib/wire.js';
import { createRobot, poseStand } from './lib/robot.js';
import { warmMat, makeVessel } from './lib/props.js';

let S = null;
const SLOTS = [];
for (let i = 0; i < 5; i++) SLOTS.push([-0.2 + i * 0.1, 0.1]);
for (let i = 0; i < 4; i++) SLOTS.push([-0.15 + i * 0.1, -0.12]);

function setup() {
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.1));
  const k = new THREE.DirectionalLight(0xffd9b0, 0.3);
  k.position.set(-2, 5, 3);
  scene.add(k);
  const warm = warmMat();
  const plates = SLOTS.map((s, i) => {
    const m = makeVessel(i % 3 === 2 ? 'soupBowl' : 'plate', warm);
    m.scale.setScalar(i % 3 === 2 ? 0.75 : 0.85);
    m.rotation.x = Math.PI / 2; // stand on edge in the rack
    scene.add(m);
    return m;
  });
  // the "person" we did not build
  const ghost = new THREE.Scene();
  ghost.add(new THREE.AmbientLight(0xffffff, 0.1));
  const robot = createRobot({ rimStrength: 1.2 });
  ghost.add(robot.holder);
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.02, 50);
  S = { scene, plates, ghost, robot, cam };
}

export function draw(pen, t, p) {
  if (!S) setup();
  const c = p.cue || {};
  const dur = p.dur || 7;
  const tPerson = c.person ?? 1.2; // 会洗碗的"人"
  const tBox = c.box ?? 2.6; // 造了个盒子
  const tSlot = c.slot ?? 4.0; // 碗插进格子
  const tClose = c.close ?? 5.3; // 关门
  const tSpray = c.spray ?? 6.0; // 喷水
  const { cam, plates, scene, ghost, robot } = S;

  // --- the crossed-out "person" (before the box)
  const gA = smoothstep(tPerson - 0.4, tPerson + 0.2, t) * (1 - smoothstep(tBox - 0.2, tBox + 0.4, t));
  if (gA > 0.001) {
    poseStand(robot, t);
    robot.J.shoulderL.rotation.x = -0.9;
    robot.J.shoulderR.rotation.x = -0.9;
    robot.J.elbowL.rotation.x = -0.6;
    robot.J.elbowR.rotation.x = -0.6;
    robot.holder.rotation.y = -0.5;
    cam.position.set(1.6, 1.4, 3.4);
    cam.lookAt(0, 0.95, 0);
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    render3(pen, ghost, cam, { glow: 0.4, a: gA * 0.75 });
    const strike = smoothstep(tPerson + 0.2, tPerson + 0.6, t);
    if (strike > 0) line(pen, 760, 260, 760 + 420 * strike, 260 + 600 * strike, { color: PAL.gold, a: gA, w: 4, glow: 1 });
    text(pen.ui, '会洗碗的“人”', 1240, 520, { size: 40, font: FONT.serif, weight: 600, color: [214, 206, 194], a: gA, align: 'left', spacing: 3 });
    text(pen.ui, '没造', 1240, 580, { size: 22, font: FONT.sans, weight: 500, color: PAL.gold, a: gA * strike, align: 'left', spacing: 3 });
  }

  // --- the box
  const bA = smoothstep(tBox - 0.3, tBox + 0.4, t);
  if (bA <= 0.001) return;
  const k = ease.inOutSine(clamp((t - tBox) / (dur - tBox)));
  cam.position.set(lerp(1.15, 0.85, k), lerp(1.25, 1.1, k), lerp(1.45, 1.3, k));
  cam.lookAt(0, 0.2, 0);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  const P = projector(cam);
  // cabinet
  wire(pen, P, boxLines(0.6, 0.62, 0.6), { color: PAL.cool, a: 0.7 * bA, w: 1.6, glow: 0.6, reveal: clamp((t - tBox) / 0.8) });
  // rack: tines on a grid
  const rack = [];
  for (let i = 0; i < 9; i++) rack.push([[-0.26 + i * 0.065, 0.08, -0.26], [-0.26 + i * 0.065, 0.08, 0.26]]);
  for (let j = 0; j < 9; j++) rack.push([[-0.26, 0.08, -0.26 + j * 0.065], [0.26, 0.08, -0.26 + j * 0.065]]);
  for (let i = 0; i < 9; i++) for (let j = 0; j < 4; j++) rack.push([[-0.26 + i * 0.065, 0.08, -0.2 + j * 0.13], [-0.26 + i * 0.065, 0.16, -0.2 + j * 0.13]]);
  wire(pen, P, rack, { color: PAL.cyan, a: 0.55 * bA, w: 1.1, glow: 0.7, reveal: clamp((t - tBox - 0.2) / 0.8) });
  // plates drop into slots one after another
  plates.forEach((m, i) => {
    const t0 = tSlot - 0.3 + i * 0.12;
    const u = ease.outCubic(clamp((t - t0) / 0.45));
    const [x, z] = SLOTS[i];
    m.position.set(x, lerp(0.75, 0.16, u), z);
    m.visible = t > t0 - 0.05;
  });
  // door: hinged at the bottom front edge, swings up to close
  const close = ease.inOutCubic(clamp((t - tClose) / 0.6));
  const ang = lerp(-Math.PI / 2 + 0.05, 0, close);
  const hinge = (x, y) => [x, 0.0 + Math.cos(ang) * y, 0.3 + Math.sin(-ang) * y];
  const door = [[hinge(-0.3, 0), hinge(0.3, 0), hinge(0.3, 0.62), hinge(-0.3, 0.62), hinge(-0.3, 0)], [hinge(-0.2, 0.52), hinge(0.2, 0.52)]];
  wire(pen, P, door, { color: PAL.cool, a: 0.8 * bA, w: 1.8, glow: 0.7 });
  render3(pen, scene, cam, { glow: 0.5, a: bA * (1 - 0.65 * close) });
  // spray: particles inside the closed box
  const sA = smoothstep(tSpray - 0.1, tSpray + 0.3, t);
  if (sA > 0) {
    const R = rng(Math.floor(t * 24));
    for (let n = 0; n < 60; n++) {
      const x = (R() - 0.5) * 0.5, z = (R() - 0.5) * 0.5, y = 0.05 + R() * 0.5;
      const q = P(x, y, z);
      lightDot(pen, q.x, q.y, 6 + R() * 6, [180, 225, 255], sA * 0.5 * R());
    }
  }
  label(pen, 140, 170, { en: 'DISHWASHER · A BOX WITH A GRID', zh: '洗碗机：把碗放进格子', a: smoothstep(tBox, tBox + 0.5, t), color: PAL.cool, rule: 220 });
}
