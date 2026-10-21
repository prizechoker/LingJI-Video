// U26–U27 + end card: sixty years of people accommodating machines; next, machines must accommodate us.
import { THREE, projector, render3 } from '../core/three.js';
import { W, H, PAL, rgba } from '../core/stage.js';
import { line, text, glowText, FONT, lightDot } from '../core/draw.js';
import { clamp, lerp, smoothstep, ease, rng } from '../core/math.js';
import { createHand, setPose, orient, POSE, mixPose } from './lib/hand3d.js';
import { warmMat, makeVessel, chopsticks } from './lib/props.js';

let S = null;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function setup() {
  // A: warm hand arranging parts on a cool grid
  const a = new THREE.Scene();
  a.add(new THREE.AmbientLight(0xfff0e0, 0.16));
  const k = new THREE.DirectionalLight(0xffd6a8, 1.1);
  k.position.set(-0.4, 1.0, 0.6);
  a.add(k);
  const human = createHand({ rimStrength: 2.2, rimPower: 2.6 });
  a.add(human.holder);
  const parts = [];
  const pm = new THREE.MeshStandardMaterial({ color: 0x0b1118, emissive: 0x3d8fd0, emissiveIntensity: 1.4, roughness: 0.5 });
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.03), pm);
    a.add(m);
    parts.push(m);
  }
  // B: cool robot hand reaching into a warm, unarranged home table
  const b = new THREE.Scene();
  b.add(new THREE.AmbientLight(0xe0f0ff, 0.14));
  const k2 = new THREE.DirectionalLight(0xbfe0ff, 1.0);
  k2.position.set(-0.4, 1.0, 0.6);
  b.add(k2);
  const robo = createHand({ rim: 0x86ccff, base: 0x05080c, rimStrength: 2.4, rimPower: 2.4 });
  b.add(robo.holder);
  const warm = warmMat();
  const props = [makeVessel('soupBowl', warm), makeVessel('riceBowl', warm), makeVessel('mug', warm), chopsticks(warm)];
  props.forEach((m) => b.add(m));
  const cam = new THREE.PerspectiveCamera(28, W / H, 0.005, 10);
  S = { a, human, parts, b, robo, props, cam };
}

export function draw(pen, t, p) {
  if (!S) setup();
  const c = p.cue || {};
  const dur = p.dur || 11;
  const tNext = c.next ?? 3.4; // "接下来，轮到机器人来迁就我们了"
  const tCard = c.card ?? 6.8; // end card
  const { cam } = S;
  const G = 0.024;

  // ===== A: people arranging the world for robots
  const aA = 1 - smoothstep(tNext - 0.4, tNext + 0.2, t);
  if (aA > 0) {
    cam.position.set(0.05, 0.42, 0.5);
    cam.lookAt(0.02, 0, 0);
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    const P = projector(cam);
    for (let i = -7; i <= 7; i++) {
      const a0 = P(i * G, 0, -7 * G), a1 = P(i * G, 0, 7 * G), b0 = P(-7 * G, 0, i * G), b1 = P(7 * G, 0, i * G);
      line(pen, a0.x, a0.y, a1.x, a1.y, { color: PAL.cool, a: 0.45 * aA, w: 1.1, glow: 0.5, glowColor: PAL.cyan });
      line(pen, b0.x, b0.y, b1.x, b1.y, { color: PAL.cool, a: 0.45 * aA, w: 1.1, glow: 0.5, glowColor: PAL.cyan });
    }
    // the hand sets parts down, one grid point after another
    const slots = [[-3, -2], [-1, -2], [1, -2], [3, -2], [-2, 1], [2, 1]];
    const per = Math.max(0.5, (tNext - 0.4) / slots.length);
    const k = Math.min(slots.length - 1, Math.floor(t / per));
    const f = (t - k * per) / per;
    S.parts.forEach((m, i) => {
      const [gx, gz] = slots[i];
      if (i < k || (i === k && f > 0.6)) { m.visible = true; m.position.set(gx * G, 0.006, gz * G); }
      else m.visible = false;
    });
    const [gx, gz] = slots[k];
    const target = V(gx * G, 0.012, gz * G);
    const lift = Math.sin(Math.PI * clamp(f / 0.6)) * 0.05 + (f > 0.6 ? (f - 0.6) * 0.15 : 0);
    const tip = target.clone().add(V(0.01, lift + 0.01, 0.0));
    const dir = V(-0.55, -0.7, 0.3).normalize();
    setPose(S.human, mixPose(POSE.pinch, POSE.relaxed, smoothstep(0.55, 0.75, f)));
    orient(S.human, tip.clone().sub(dir.clone().multiplyScalar(0.165)), dir, V(0, -1, 0));
    render3(pen, S.a, cam, { glow: 0.55, a: aA });
    const ta = smoothstep(0.3, 0.9, t) * aA;
    text(pen.ui, '过去六十年', 640, 200, { size: 28, font: FONT.serif, weight: 500, color: [200, 206, 214], a: ta, spacing: 8 });
    text(pen.ui, '人，迁就机器', 640, 262, { size: 56, font: FONT.serif, weight: 700, color: [150, 214, 255], a: ta, spacing: 12 });
  }

  // ===== B: the robot hand enters our world
  const bA = smoothstep(tNext - 0.4, tNext + 0.3, t) * (1 - smoothstep(tCard - 0.5, tCard + 0.2, t));
  if (bA > 0) {
    const lt = t - tNext;
    cam.position.set(lerp(0.12, 0.05, clamp(lt / 3)), 0.3, lerp(0.62, 0.55, clamp(lt / 3)));
    cam.lookAt(0.0, 0.03, 0);
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    const R = rng(9);
    const spots = [[-0.06, 0.0, 0.02, 0.3], [0.09, 0.0, -0.05, 1.2], [-0.15, 0.0, -0.08, 2.0], [0.05, 0.06, 0.06, 0.5]];
    S.props.forEach((m, i) => {
      const [x, y, z, ry] = spots[i];
      m.position.set(x, y, z);
      m.rotation.set(i === 2 ? 1.5 : 0.05 * (R() - 0.5), ry, i === 3 ? 0.1 : 0.06 * (R() - 0.5));
    });
    // the robot hand carefully approaches the bowl and closes around its rim
    const u = ease.inOutCubic(clamp(lt / 2.6));
    const tip = V(lerp(0.2, 0.0, u), lerp(0.18, 0.075, u), lerp(-0.12, -0.0, u));
    const dir = V(-0.6, -0.55, 0.45).normalize();
    setPose(S.robo, mixPose(POSE.relaxed, POSE.cup, smoothstep(0.75, 1.0, u)));
    orient(S.robo, tip.clone().sub(dir.clone().multiplyScalar(0.165)), dir, V(0.2, -1, 0).normalize());
    render3(pen, S.b, cam, { glow: 0.55, a: bA });
    const ta = smoothstep(tNext + 0.2, tNext + 0.8, t) * bA;
    text(pen.ui, '接下来', 640, 200, { size: 28, font: FONT.serif, weight: 500, color: [200, 206, 214], a: ta, spacing: 8 });
    text(pen.ui, '机器，迁就人', 640, 262, { size: 56, font: FONT.serif, weight: 700, color: [255, 214, 160], a: ta, spacing: 12 });
  }

  // ===== end card
  const eA = smoothstep(tCard - 0.2, tCard + 0.8, t) * (1 - smoothstep(dur - 0.6, dur, t));
  if (eA > 0) {
    glowText(pen, '棋盘之外', 960, 430, { size: 96, font: FONT.serif, weight: 800, color: [246, 240, 230], glowColor: PAL.warm, glow: 0.4, a: eA, spacing: 22 });
    text(pen.ui, '机器人发展史 · 第 1 集', 960, 520, { size: 26, font: FONT.serif, weight: 500, color: [214, 206, 194], a: eA, spacing: 6 });
    const na = smoothstep(tCard + 0.8, tCard + 1.6, t) * (1 - smoothstep(dur - 0.6, dur, t));
    line(pen, 860, 610, 1060, 610, { color: PAL.gold, a: 0.6 * na, w: 1.2, glow: 0.4 });
    text(pen.ui, '下一集', 960, 652, { size: 20, font: FONT.sans, weight: 500, color: PAL.gold, a: na, spacing: 8 });
    text(pen.ui, '一只手，到底有多难？', 960, 706, { size: 40, font: FONT.serif, weight: 700, color: [255, 220, 178], a: na, spacing: 6 });
    text(pen.ui, '旁白为 AI 合成 · 画面为原创三维动画与示意 · 参考资料见简介', 960, 1000, { size: 15, font: FONT.sans, weight: 400, color: [160, 168, 178], a: na * 0.75, spacing: 1 });
  }
}
