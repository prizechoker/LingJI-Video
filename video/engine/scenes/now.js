// U03: ten years later — robots flip and run marathons, yet the dishes defeat them.
import { THREE, three, projector, render3, propMaterial, edges } from '../core/three.js';
import { W, H, PAL, rgba } from '../core/stage.js';
import { line, text, label, FONT, lightDot } from '../core/draw.js';
import { clamp, lerp, smoothstep, ease, prog, rng } from '../core/math.js';
import { createRobot, poseRun, poseFlip, poseStand } from './lib/robot.js';
import { warmMat, coolMat, makeVessel, chopsticks, gripper, screenBox } from './lib/props.js';

let S = null;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function bowlGeo(profile) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, 48);
  return g;
}

function setup() {
  // --- robot stage
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.12));
  const k = new THREE.DirectionalLight(0xbfe0ff, 0.35);
  k.position.set(-1, 2, 2);
  scene.add(k);
  const robot = createRobot();
  scene.add(robot.holder);
  robot.holder.rotation.y = Math.PI / 2; // side-on to camera
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.05, 60);
  // --- sink stage: a messy, ordinary pile of dishes
  const sink = new THREE.Scene();
  sink.add(new THREE.AmbientLight(0xffffff, 0.12));
  const sk = new THREE.DirectionalLight(0xffd9b0, 0.35);
  sk.position.set(-1, 3, 1.5);
  sink.add(sk);
  const warm = warmMat();
  const items = {};
  const add = (name, obj, pos, rot = [0, 0, 0]) => { obj.position.set(...pos); obj.rotation.set(...rot); sink.add(obj); items[name] = obj; return obj; };
  add('plate', makeVessel('plate', warm), [-0.05, 0.03, -0.11], [1.05, 0.2, 0.0]);
  add('soup', makeVessel('soupBowl', warm), [0.0, 0.0, 0.0], [0.0, 0, 0.06]);
  add('rice', makeVessel('riceBowl', warm), [0.012, 0.02, 0.006], [0.18, 0, -0.22]);
  add('deep', makeVessel('deepBowl', warm), [0.15, 0.0, 0.07], [0, 0, 0]);
  add('mug', makeVessel('mug', warm), [-0.14, 0.0, 0.08], [0.12, 2.2, 0.08]);
  add('sticks', chopsticks(warm), [0.03, 0.075, 0.02], [0.0, 0.7, 0.15]);
  const cool = coolMat();
  const g = gripper(cool);
  sink.add(g.group);
  const grip = g.group, fingers = g.fingers, bowls = [items.rice];
  const scam = new THREE.PerspectiveCamera(26, W / H, 0.01, 10);
  S = { scene, robot, cam, sink, bowls, grip, fingers, scam, items };
}

export function draw(pen, t, p, env) {
  if (!S) setup();
  const c = p.cue || {};
  const tFlip = c.flip ?? 1.2, tRun = c.run ?? 2.6, tSink = c.sink ?? 4.4;
  const dur = p.dur || 7;

  // ---------- part A: 2016 -> 2026 ticker + flip + run ----------
  if (t < tSink + 0.3) {
    const aA = 1 - smoothstep(tSink - 0.1, tSink + 0.3, t);
    // year ticker
    const yrA = smoothstep(0, 0.35, t) * (1 - smoothstep(tFlip - 0.45, tFlip - 0.05, t));
    if (yrA > 0) {
      const u = prog(t, 0.15, Math.max(0.6, tFlip - 0.2), ease.inOutCubic);
      const yr = Math.round(lerp(2016, 2026, u));
      text(pen.ui, String(yr), 960, 520, { size: 150, font: FONT.mono, weight: 500, color: [232, 228, 220], a: yrA * aA, spacing: 10 });
      text(pen.ui, 'TEN YEARS LATER · 十年后', 960, 630, { size: 18, font: FONT.mono, weight: 500, color: PAL.dim, a: yrA * aA, spacing: 6 });
    }
    // robot
    const rA = smoothstep(tFlip - 0.25, tFlip + 0.15, t) * aA;
    if (rA > 0.001) {
      const { robot, cam, scene } = S;
      let x = 0;
      if (t < tRun) {
        const u = clamp((t - tFlip) / Math.max(1.1, tRun - tFlip));
        poseFlip(robot, u);
        x = 0;
      } else {
        poseRun(robot, (t - tRun) * 9.5, 1);
        x = (t - tRun) * 3.2;
      }
      // ground scrolls under the runner instead of moving the robot
      cam.position.set(0.0, 1.15, 6.4);
      cam.lookAt(0, 1.05, 0);
      cam.updateMatrixWorld();
      cam.updateProjectionMatrix();
      const P = projector(cam);
      // ground line + lane ticks
      const g0 = P(-6, 0, 0), g1 = P(6, 0, 0);
      line(pen, g0.x, g0.y, g1.x, g1.y, { color: PAL.cool, a: 0.55 * rA, w: 1.4, glow: 0.6, glowColor: PAL.cyan });
      for (let k = -14; k <= 14; k++) {
        const gx = k * 0.5 - (x % 0.5);
        const a1 = P(gx, 0, 0), a2 = P(gx - 0.08, 0, 0.6);
        line(pen, a1.x, a1.y + 2, a2.x, a2.y + 10, { color: PAL.cool, a: 0.25 * rA * (1 - Math.abs(k) / 14), w: 1, glow: 0.2 });
      }
      // flip arc trail (pelvis path)
      if (t < tRun + 0.4) {
        const pts = [];
        for (let k = 0; k <= 30; k++) {
          const u = (k / 30) * clamp((t - tFlip) / Math.max(1.1, tRun - tFlip));
          const air = clamp((u - 0.28) / 0.54);
          const y = 0.92 + 0.55 * Math.sin(Math.PI * air);
          const pp = P(0, y, 0);
          pts.push([pp.x, pp.y]);
        }
        const trA = rA * (1 - smoothstep(tRun, tRun + 0.4, t));
        for (let k = 1; k < pts.length; k++) line(pen, pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], { color: PAL.cyan, a: trA * 0.5 * (k / pts.length), w: 2, glow: 1 });
      }
      render3(pen, scene, cam, { glow: 0.7, a: rA });
      // HUD
      const hudA = smoothstep(tRun + 0.2, tRun + 0.6, t) * aA;
      if (hudA > 0) {
        label(pen, 1310, 330, { en: 'HALF MARATHON · 21.0975 KM', zh: '人形机器人半程马拉松 · 2026', a: hudA, color: PAL.cool, rule: 200 });
        text(pen.ui, '50:26', 1312, 420, { size: 64, font: FONT.mono, weight: 500, color: [150, 214, 255], a: hudA, align: 'left', spacing: 4 });
        text(pen.ui, '快于人类男子半马世界纪录', 1314, 470, { size: 18, font: FONT.sans, weight: 400, color: PAL.dim, a: hudA * 0.9, align: 'left', spacing: 2 });
      }
      const flA = smoothstep(tFlip, tFlip + 0.3, t) * (1 - smoothstep(tRun, tRun + 0.3, t)) * aA;
      if (flA > 0) label(pen, 1310, 330, { en: 'BACKFLIP', zh: '后空翻', a: flA, color: PAL.cool, rule: 120 });
    }
  }

  // ---------- part B: the sink ----------
  if (t > tSink - 0.2) {
    const bA = smoothstep(tSink - 0.2, tSink + 0.3, t);
    const lt = t - tSink;
    const { sink, bowls, grip, fingers, scam, items } = S;
    const orbit = lerp(0.7, 0.52, ease.inOutSine(clamp(lt / 3.5)));
    const dist = lerp(0.92, 0.8, ease.inOutSine(clamp(lt / 3.5)));
    scam.position.set(Math.sin(orbit) * dist, 0.66, Math.cos(orbit) * dist);
    scam.lookAt(0.0, 0.03, 0.0);
    scam.updateMatrixWorld();
    scam.updateProjectionMatrix();
    const P = projector(scam);
    // sink basin: rim + floor, drawn as warm hairlines
    const rect = (w, d, y) => [[-w, -d], [w, -d], [w, d], [-w, d]].map(([x, z]) => P(x, y, z));
    const fl = rect(0.27, 0.21, -0.01), rim = rect(0.31, 0.25, 0.09);
    for (let k = 0; k < 4; k++) {
      line(pen, fl[k].x, fl[k].y, fl[(k + 1) % 4].x, fl[(k + 1) % 4].y, { color: PAL.warm, a: 0.3 * bA, w: 1.1, glow: 0.35 });
      line(pen, rim[k].x, rim[k].y, rim[(k + 1) % 4].x, rim[(k + 1) % 4].y, { color: PAL.warm, a: 0.45 * bA, w: 1.3, glow: 0.4 });
      line(pen, fl[k].x, fl[k].y, rim[k].x, rim[k].y, { color: PAL.warm, a: 0.22 * bA, w: 1, glow: 0.25 });
    }
    // drain
    const dr = P(0.12, -0.009, -0.09);
    lightDot(pen, dr.x, dr.y, 10, PAL.warm, 0.25 * bA);
    // gripper descends, hesitates, nudges; the rice bowl wobbles
    const d = prog(lt, 0.0, 1.1, ease.outCubic);
    const hes = lt > 1.1 ? Math.sin((lt - 1.1) * 6.5) * 0.008 * Math.exp(-(lt - 1.1) * 0.9) : 0;
    grip.position.set(0.02 + hes, lerp(0.62, 0.2, d), 0.012);
    grip.rotation.z = 0.06 * Math.sin(lt * 1.7) * Math.exp(-lt * 0.4);
    const open = 0.03 + 0.011 * Math.sin(lt * 3.0) * clamp(lt - 0.9);
    fingers[0].position.x = -open;
    fingers[1].position.x = open;
    const wob = lt > 1.4 ? Math.sin((lt - 1.4) * 9) * 0.07 * Math.exp(-(lt - 1.4) * 1.5) : 0;
    bowls[0].rotation.z = -0.22 + wob;
    bowls[0].rotation.x = 0.18 + wob * 0.5;
    // faucet + drip
    const f0 = P(-0.2, 0.32, -0.2), f1 = P(-0.2, 0.32, -0.27), f2 = P(-0.2, 0.09, -0.27);
    line(pen, f2.x, f2.y, f1.x, f1.y, { color: PAL.warm, a: 0.5 * bA, w: 2.2, glow: 0.5 });
    line(pen, f1.x, f1.y, f0.x, f0.y, { color: PAL.warm, a: 0.5 * bA, w: 2.2, glow: 0.5 });
    const dripT = (lt * 1.2) % 1;
    const dp = P(-0.2, lerp(0.31, 0.0, dripT * dripT), -0.2);
    lightDot(pen, dp.x, dp.y, 7, PAL.warmHi, 0.6 * bA * (1 - dripT));
    render3(pen, sink, scam, { glow: 0.6, a: bA });
    // the robot's "perception": hesitant reticles with low, flickering confidence
    const per = smoothstep(0.7, 1.1, lt) * bA;
    if (per > 0) {
      const tags = [['rice', '碗？', 0.58], ['plate', '盘子？', 0.41], ['mug', '杯子？', 0.36], ['sticks', '？', 0.22]];
      tags.forEach(([name, tag, conf], i) => {
        const bx = screenBox(items[name], P);
        const pad = 10, L = 16;
        const fl = 0.5 + 0.5 * Math.sin(lt * (7 + i * 2.3) + i);
        const a = per * (0.55 + 0.35 * fl);
        const cs = [[bx.x0 - pad, bx.y0 - pad, 1, 1], [bx.x1 + pad, bx.y0 - pad, -1, 1], [bx.x0 - pad, bx.y1 + pad, 1, -1], [bx.x1 + pad, bx.y1 + pad, -1, -1]];
        for (const [x, y, sx, sy] of cs) {
          line(pen, x, y, x + sx * L, y, { color: PAL.cyan, a, w: 1.6, glow: 0.6 });
          line(pen, x, y, x, y + sy * L, { color: PAL.cyan, a, w: 1.6, glow: 0.6 });
        }
        const jitter = Math.round((conf + 0.06 * Math.sin(lt * 11 + i * 3)) * 100) / 100;
        text(pen.ui, `${tag} ${jitter.toFixed(2)}`, bx.x0 - pad, bx.y0 - pad - 14, { size: 15, font: FONT.mono, weight: 500, color: [150, 214, 255], a, align: 'left', spacing: 1 });
      });
    }
  }
}
