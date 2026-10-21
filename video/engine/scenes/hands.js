// U25: the same human hand puts down a stone, washes a bowl, twists a bottle cap, catches a falling cup — and never needs a board.
import { THREE, three, projector, render3 } from '../core/three.js';
import { W, H, PAL, rgba } from '../core/stage.js';
import { line, text, FONT, lightDot, stroke } from '../core/draw.js';
import { clamp, lerp, smoothstep, ease, rng } from '../core/math.js';
import { createHand, setPose, orient, POSE, mixPose, tipWorld } from './lib/hand3d.js';
import { warmMat, makeVessel } from './lib/props.js';
import { drawStone } from './lib/stone.js';

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
    // the stone has just been let go: fingers relax and lift a little; the stone stays on its grid point
    if (!S.stone) {
      setPose(hand, POSE.pinch);
      orient(hand, V(0.07, 0.17, -0.05), V(-0.5, -0.7, 0.2).normalize(), V(0, -1, 0));
      const tip = tipWorld(hand, 'index-finger-tip').lerp(tipWorld(hand, 'middle-finger-tip'), 0.5);
      const G = 0.022;
      const sx = Math.round(tip.x / G) * G, sz = Math.round(tip.z / G) * G;
      S.stone = { x: sx, z: sz, dx: sx - tip.x, dz: sz - tip.z, dy: -0.02 + 0.012 - tip.y };
    }
    const st = S.stone;
    setPose(hand, mixPose(POSE.pinch, POSE.relaxed, smoothstep(0.15, 0.7, t)));
    orient(hand, V(0.07 + st.dx, 0.17 + st.dy + 0.03 * ease.inOutCubic(clamp((t - 0.2) / 1.0)), -0.05 + st.dz), V(-0.5, -0.7, 0.2).normalize(), V(0, -1, 0));
    label2 = '放下一颗棋子';
  } else if (seg === 1) {
    // a bowl resting on the palm, tipped toward us under running water
    const u = t - tWash;
    setPose(hand, mixPose(POSE.open, POSE.cup, 0.25));
    orient(hand, V(-0.115, -0.05, 0.03), V(1, 0.12, -0.32).normalize(), V(0, 1, 0.12).normalize());
    const pc = tipWorld(hand, 'wrist').lerp(tipWorld(hand, 'middle-finger-phalanx-proximal'), 0.8);
    bowl.visible = true;
    bowl.position.set(pc.x, pc.y + 0.032, pc.z); // resting on the fingers, clear of the palm
    bowl.rotation.set(0.22 + 0.05 * Math.sin(u * 2.2), 0, -0.08 + 0.05 * Math.sin(u * 1.7));
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
    // a cup tips into frame and falls; the hand sweeps in underneath and closes around it
    const u = clamp((t - tCatch) / Math.max(0.9, tFree - tCatch));
    const fallU = clamp(u / 0.42);
    const caught = u > 0.42;
    const hin = ease.outCubic(clamp(u / 0.4));
    const give = caught ? Math.sin(clamp((u - 0.42) / 0.25) * Math.PI) * 0.008 : 0; // the hand gives a little on impact
    setPose(hand, mixPose(POSE.open, POSE.cup, smoothstep(0.36, 0.5, u)));
    orient(hand, V(lerp(-0.32, -0.13, hin), lerp(-0.14, -0.03, hin) - give, 0.0), V(1, 0.1, 0), V(0, 1, 0));
    cup.visible = true;
    cup.position.set(0.0, caught ? -give : lerp(0.13, 0.0, fallU * fallU), 0.0);
    cup.rotation.set(0, 0, lerp(1.5, 0.3, smoothstep(0, 1, fallU)));
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
  if (seg === 0) {
    // the stone it just put down, and the ripple of the release
    const st = S.stone;
    const c0 = P(st.x, -0.02, st.z), cx = P(st.x + 0.011, -0.02, st.z), cz = P(st.x, -0.02, st.z + 0.011);
    const r = Math.hypot(cx.x - c0.x, cx.y - c0.y);
    const sq = clamp(Math.abs(cz.y - c0.y) / r, 0.2, 1);
    lightDot(pen, c0.x, c0.y, r * 2.6, PAL.warm, 0.22 * fade);
    drawStone(pen, c0.x, c0.y - 0.35 * r, r, 'black', { squash: sq, shadow: 0.7, a: fade });
    stroke(pen, (g) => { g.beginPath(); g.ellipse(c0.x, c0.y - 0.35 * r, r, r * sq, 0, Math.PI * 0.05, Math.PI * 0.95); }, { color: PAL.warm, a: 0.55 * fade, w: 1.4, glow: 0.8 });
    const ru = clamp((t - 0.15) / 1.1);
    if (ru > 0 && ru < 1) {
      const rr = 0.012 + 0.05 * ease.outCubic(ru);
      const pts = [];
      for (let k = 0; k <= 48; k++) {
        const q = P(st.x + Math.cos(k / 48 * Math.PI * 2) * rr, -0.02, st.z + Math.sin(k / 48 * Math.PI * 2) * rr);
        pts.push([q.x, q.y]);
      }
      for (let k = 1; k < pts.length; k++) line(pen, pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], { color: PAL.warm, a: 0.5 * (1 - ru) * fade, w: 1.3, glow: 0.8 });
    }
  }
  if (seg === 4) {
    const q = P(0.0, 0.08, 0.0);
    lightDot(pen, q.x, q.y, 420, PAL.warm, 0.12 * fade);
  }
  hand.u.opacity2.value = fade;
  render3(pen, sc, cam, { glow: 0.55, a: fade });
  if (seg === 1) {
    // running water: a thin glowing stream with beads flowing down it, splashing inside the bowl
    const hit = bowl.localToWorld(V(0.012, 0.03, 0.0));
    const top = P(hit.x + 0.004, 0.36, hit.z), bot = P(hit.x, hit.y, hit.z);
    const sway = Math.sin(t * 7.3) * 0.8;
    line(pen, top.x, top.y, bot.x + sway, bot.y, { color: [255, 236, 214], a: 0.22 * fade, w: 9, glow: 0.8, glowW: 22 });
    line(pen, top.x - 1, top.y, bot.x + sway - 1, bot.y, { color: [255, 248, 236], a: 0.6 * fade, w: 2.6, glow: 0.6 });
    for (let k = 0; k < 7; k++) {
      const f = (t * 2.2 + k / 7) % 1;
      lightDot(pen, lerp(top.x, bot.x + sway, f), lerp(top.y, bot.y, f), 7, [255, 246, 232], 0.55 * fade);
    }
    const R = rng(11);
    for (let k = 0; k < 16; k++) {
      const ph = (t * 1.7 + R()) % 1;
      const ang = R() * Math.PI * 2, sp = 0.025 + 0.03 * R();
      const q = P(hit.x + Math.cos(ang) * sp * ph, hit.y + 0.045 * ph - 0.07 * ph * ph, hit.z + Math.sin(ang) * sp * ph);
      lightDot(pen, q.x, q.y, 5, [255, 238, 214], 0.6 * (1 - ph) * fade);
    }
  }
  // small caption per vignette
  if (label2) {
    const segStart = [0, tWash, tCap, tCatch][seg];
    const la = smoothstep(segStart + 0.05, segStart + 0.35, t) * fade;
    text(pen.ui, label2, 1700, 170, { size: 30, font: FONT.serif, weight: 600, color: [255, 220, 178], a: la, align: 'right', spacing: 4 });
  }
}
