// U23: for hard chores, some home robots still rely on a person in a VR headset, operating them from far away.
import { THREE, projector, render3 } from '../core/three.js';
import { W, H, PAL, rgba } from '../core/stage.js';
import { line, text, label, FONT, lightDot } from '../core/draw.js';
import { clamp, lerp, smoothstep, ease } from '../core/math.js';
import { wire, boxLines } from './lib/wire.js';
import { createRobot, poseStand } from './lib/robot.js';
import { warmMat, makeVessel } from './lib/props.js';

let S = null;
function setup() {
  const sc = new THREE.Scene();
  sc.add(new THREE.AmbientLight(0xffffff, 0.1));
  const k = new THREE.DirectionalLight(0xffe2c0, 0.3);
  k.position.set(0, 5, 4);
  sc.add(k);
  const robot = createRobot();
  robot.holder.position.set(-2.2, 0, 0);
  robot.holder.rotation.y = 0.5;
  sc.add(robot.holder);
  const human = createRobot({ human: true, headset: true, rim: 0xffb36b, base: 0x0d0805, rimStrength: 1.7 });
  human.holder.position.set(2.4, 0, -0.4);
  human.holder.rotation.y = -0.5;
  sc.add(human.holder);
  const bowl = makeVessel('soupBowl', warmMat());
  bowl.scale.setScalar(1.6);
  sc.add(bowl);
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.05, 80);
  S = { sc, robot, human, bowl, cam };
}

function armsUp(F, ph, mirror = 1) {
  poseStand(F, 0);
  const J = F.J;
  J.shoulderL.rotation.x = -1.0 + 0.25 * Math.sin(ph);
  J.shoulderR.rotation.x = -1.0 + 0.25 * Math.sin(ph + 0.4);
  J.elbowL.rotation.x = -0.7 + 0.2 * Math.sin(ph * 1.3);
  J.elbowR.rotation.x = -0.7 + 0.2 * Math.sin(ph * 1.3 + 0.4);
  J.shoulderL.rotation.z = -0.25 * mirror;
  J.shoulderR.rotation.z = 0.25 * mirror;
}

export function draw(pen, t, p) {
  if (!S) setup();
  const c = p.cue || {};
  const dur = p.dur || 8;
  const tHuman = c.human ?? 3.0; // "背后还要靠一个戴着VR眼镜的真人"
  const tFar = c.far ?? 5.6; // "在远处替它操作"
  const { sc, robot, human, bowl, cam } = S;
  const fade = 1 - smoothstep(dur - 0.4, dur, t);
  const reveal = ease.inOutCubic(clamp((t - tHuman + 0.6) / 1.6));
  cam.position.set(lerp(-2.0, 0.0, reveal), 1.6, lerp(4.2, 7.6, reveal));
  cam.lookAt(lerp(-2.0, 0.1, reveal), 1.0, 0);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  const P = projector(cam);
  const ph = t * 1.6;
  armsUp(robot, ph, 1);
  armsUp(human, ph, 1); // the operator's motion is mirrored 1:1 by the robot
  human.holder.visible = t > tHuman - 0.7;
  sc.updateMatrixWorld(true);
  const hl = new THREE.Vector3(), hr = new THREE.Vector3();
  robot.J.handL.getWorldPosition(hl);
  robot.J.handR.getWorldPosition(hr);
  bowl.position.copy(hl.clone().lerp(hr, 0.5)).add(new THREE.Vector3(0, -0.04, 0));
  // sink counter in front of the robot
  wire(pen, P, boxLines(1.2, 0.9, 0.6), { color: PAL.warm, a: 0.45 * fade, w: 1.4, glow: 0.4, T: { pos: [-2.0, 0, 0.75], ry: 0.5 } });
  wire(pen, P, [[[-4, 0, 0], [4.5, 0, 0]]], { color: PAL.cool, a: 0.25 * fade, w: 1.2, glow: 0.3 });
  render3(pen, sc, cam, { glow: 0.6, a: fade });
  // the link: a dotted arc from the operator's headset to the robot's head
  const lk = smoothstep(tHuman, tHuman + 0.8, t) * fade;
  if (lk > 0) {
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    human.J.neck.getWorldPosition(a);
    robot.J.neck.getWorldPosition(b);
    a.y += 0.15;
    b.y += 0.15;
    const n = 40;
    for (let i = 0; i < n; i++) {
      const u = i / n;
      if ((i + Math.floor(t * 12)) % 3 === 0) continue;
      const pA = a.clone().lerp(b, u), pB = a.clone().lerp(b, u + 1 / n);
      pA.y += Math.sin(Math.PI * u) * 1.0;
      pB.y += Math.sin(Math.PI * (u + 1 / n)) * 1.0;
      const qa = P(pA.x, pA.y, pA.z), qb = P(pB.x, pB.y, pB.z);
      line(pen, qa.x, qa.y, qb.x, qb.y, { color: PAL.gold, a: lk * 0.9, w: 2, glow: 1 });
    }
    const hp = P(a.x, a.y, a.z);
    label(pen, Math.min(hp.x + 60, 1500), hp.y - 80, { en: 'TELEOPERATION', zh: '远处的真人 · 戴着VR眼镜', a: lk, color: PAL.warm, rule: 160 });
  }
  const rp = P(-2.2, 2.0, 0);
  label(pen, Math.max(140, rp.x - 600), 170, { en: 'HOME ROBOT · HARD CHORE', zh: '家务机器人：遇到复杂的活儿', a: smoothstep(0.2, 0.7, t) * fade, color: PAL.cool, rule: 220 });
  const na = smoothstep(tFar + 0.4, tFar + 1.0, t) * fade;
  text(pen.ui, '遥操作也是采集机器人训练数据的主要方式之一', 960, 880, { size: 17, font: FONT.sans, weight: 400, color: PAL.dim, a: na * 0.9, spacing: 1 });
}
