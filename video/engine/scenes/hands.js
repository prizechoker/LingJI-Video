// U25: the same human hand washes a bowl, twists a bottle cap, catches a falling cup — and never needs a board.
import { THREE, three, projector, render3 } from '../core/three.js';
import { W, H, PAL, rgba } from '../core/stage.js';
import { line, text, FONT, lightDot, arc } from '../core/draw.js';
import { clamp, lerp, smoothstep, ease, rng } from '../core/math.js';
import { createHand, setPose, orient, POSE, mixPose } from './lib/hand3d.js';
import { warmMat, makeVessel } from './lib/props.js';

let S = null;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function setup() {
  const sc = new THREE.Scene();
  sc.add(new THREE.AmbientLight(0xfff0e0, 0.16));
  const key = new THREE.DirectionalLight(0xffd6a8, 1.2);
  key.position.set(-0.4, 1.0, 0.6);
  sc.add(key);
  const hand = createHand({ rimStrength: 2.2, rimPower: 2.6 });
  sc.add(hand.holder);
  const warm = warmMat();
  const bowl = makeVessel('soupBowl', warm);
  const cup = makeVessel('mug', warm);
  const bottle = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.032, 0], [0.034, 0.01], [0.034, 0.14], [0.02, 0.18], [0.014, 0.2], [0.0, 0.2]].map(([r, y]) => new THREE.Vector2(r, y)), 48), warm);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.022, 32), warm);
  for (const o of [bowl, cup, bottle, cap]) sc.add(o);
  const cam = new THREE.PerspectiveCamera(28, W / H, 0.005, 10);
  S = { sc, hand, bowl, cup, bottle, cap, cam };
}

export function draw(pen, t, p) {
  if (!S) setup();
  const c = p.cue || {};
  const dur = p.dur || 9.5;
  const tWash = c.wash ?? 1.6, tCap = c.cap ?? 2.6, tCatch = c.catch ?? 3.6, tFree = c.free ?? 5.6;
  const { sc, hand, bowl, cup, bottle, cap, cam } = S;
  const fade = 1 - smoothstep(dur - 0.5, dur, t);
  for (const o of [bowl, cup, bottle, cap]) o.visible = false;
  let label2 = '';
  // which vignette
  const seg = t < tWash ? 0 : t < tCap ? 1 : t < tCatch ? 2 : t < tFree ? 3 : 4;
  cam.position.set(0.0, 0.16, 0.62);
  cam.lookAt(0, 0.05, 0);
  if (seg === 0) {
    // release of the stone: hand hovering, stone left behind on a faint grid
    setPose(hand, mixPose(POSE.pinch, POSE.relaxed, smoothstep(0.2, 0.8, t)));
    orient(hand, V(0.07, 0.17, -0.05), V(-0.5, -0.7, 0.2).normalize(), V(0, -1, 0));
    label2 = '放下一颗棋子';
  } else if (seg === 1) {
    // holding a bowl under running water
    const u = t - tWash;
    setPose(hand, POSE.cup);
    orient(hand, V(-0.13, 0.0, 0.0), V(1, 0.05, 0), V(0, 1, 0));
    bowl.visible = true;
    bowl.position.set(0.0, 0.03, 0.0);
    bowl.rotation.set(0.25 * Math.sin(u * 2.4), 0, 0.2 + 0.1 * Math.sin(u * 1.8));
    label2 = '洗碗';
  } else if (seg === 2) {
    // twisting a bottle cap
    const u = t - tCap;
    setPose(hand, mixPose(POSE.grab, POSE.cup, 0.35));
    const tw = Math.sin(u * 5) * 0.35;
    orient(hand, V(0.0, 0.2, -0.02), V(0, -0.35, -1).normalize(), V(Math.sin(tw), -1, 0).normalize());
    bottle.visible = cap.visible = true;
    bottle.position.set(0.0, -0.13, 0.03);
    cap.position.set(0.0, 0.08, 0.03);
    cap.rotation.y = u * 6;
    label2 = '拧开瓶盖';
  } else if (seg === 3) {
    // catching a falling cup
    const u = clamp((t - tCatch) / (tFree - tCatch));
    const fallU = clamp(u / 0.45);
    const caught = u > 0.45;
    setPose(hand, mixPose(POSE.open, POSE.cup, smoothstep(0.4, 0.55, u)));
    orient(hand, V(-0.13, lerp(-0.08, -0.03, smoothstep(0.3, 0.5, u)), 0.0), V(1, 0.1, 0), V(0, 1, 0));
    cup.visible = true;
    cup.position.set(0.0, caught ? -0.0 + Math.sin((u - 0.45) * 20) * 0.004 * (1 - u) : lerp(0.3, -0.0, fallU * fallU), 0.0);
    cup.rotation.set(0, 0, caught ? 0.3 : lerp(1.2, 0.3, fallU) + fallU * 2.4);
    label2 = '接住一只快掉下去的杯子';
  } else {
    // free: the hand alone in warm light, nothing underneath
    const u = t - tFree;
    setPose(hand, mixPose(POSE.relaxed, POSE.open, 0.3 + 0.1 * Math.sin(u)));
    orient(hand, V(-0.02, 0.14 + 0.005 * Math.sin(u * 1.3), -0.02), V(-0.4, -0.8, 0.3).normalize(), V(0, -1, 0.2).normalize());
    cam.position.set(0.0, lerp(0.16, 0.12, clamp(u / 3)), lerp(0.62, 0.5, clamp(u / 3)));
  }
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  const P = projector(cam);
  // water for washing
  if (seg === 1) {
    const R = rng(Math.floor(t * 30));
    for (let k = 0; k < 40; k++) {
      const y = 0.4 - ((t * 1.2 + k / 40) % 1) * 0.36;
      const q = P(0.01 + (R() - 0.5) * 0.01, y, 0.0);
      lightDot(pen, q.x, q.y, 5, [255, 236, 210], 0.4 * fade);
    }
  }
  // the board fading out beneath (only in the last vignette): "never needs a board"
  if (seg === 4 || seg === 0) {
    const gA = seg === 0 ? 0.6 : 0.6 * (1 - smoothstep(tFree, tFree + 1.6, t));
    const G = 0.022;
    for (let i = -6; i <= 6; i++) {
      const a0 = P(i * G, -0.02, -6 * G), a1 = P(i * G, -0.02, 6 * G);
      const b0 = P(-6 * G, -0.02, i * G), b1 = P(6 * G, -0.02, i * G);
      line(pen, a0.x, a0.y, a1.x, a1.y, { color: PAL.cool, a: gA * fade * 0.6, w: 1.1, glow: 0.4, glowColor: PAL.cyan });
      line(pen, b0.x, b0.y, b1.x, b1.y, { color: PAL.cool, a: gA * fade * 0.6, w: 1.1, glow: 0.4, glowColor: PAL.cyan });
    }
  }
  if (seg === 4) {
    const q = P(0.0, 0.08, 0.0);
    lightDot(pen, q.x, q.y, 420, PAL.warm, 0.12 * fade);
  }
  hand.u.opacity2.value = fade;
  render3(pen, sc, cam, { glow: 0.55, a: fade });
  // small caption per vignette
  if (label2) {
    const segStart = [0, tWash, tCap, tCatch][seg];
    const la = smoothstep(segStart + 0.05, segStart + 0.35, t) * fade;
    text(pen.ui, label2, 1700, 170, { size: 30, font: FONT.serif, weight: 600, color: [255, 220, 178], a: la, align: 'right', spacing: 4 });
  }
}
