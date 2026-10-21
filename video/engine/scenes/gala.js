// U21: humanoids on the Spring Festival Gala stage, then a half-marathon finish faster than the human world record.
import { THREE, projector, render3 } from '../core/three.js';
import { W, H, PAL } from '../core/stage.js';
import { line, text, glowText, label, FONT, lightDot } from '../core/draw.js';
import { clamp, lerp, smoothstep, ease } from '../core/math.js';
import { wire } from './lib/wire.js';
import { createRobot, poseDance, poseRun } from './lib/robot.js';

let S = null;
function setup() {
  const stage = new THREE.Scene();
  stage.add(new THREE.AmbientLight(0xffffff, 0.1));
  const k = new THREE.DirectionalLight(0xbfe0ff, 0.3);
  k.position.set(0, 5, 4);
  stage.add(k);
  const dancers = [];
  for (let i = 0; i < 5; i++) {
    const r = createRobot();
    r.holder.position.set((i - 2) * 1.15, 0, -Math.abs(i - 2) * 0.45);
    r.holder.rotation.y = (i - 2) * -0.12;
    stage.add(r.holder);
    dancers.push(r);
  }
  const race = new THREE.Scene();
  race.add(new THREE.AmbientLight(0xffffff, 0.1));
  const k2 = new THREE.DirectionalLight(0xbfe0ff, 0.3);
  k2.position.set(-2, 5, 4);
  race.add(k2);
  const runner = createRobot();
  runner.holder.rotation.y = Math.PI / 2;
  race.add(runner.holder);
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.05, 80);
  S = { stage, dancers, race, runner, cam };
}

export function draw(pen, t, p) {
  if (!S) setup();
  const c = p.cue || {};
  const dur = p.dur || 6;
  const tRace = c.race ?? 2.4; // "还在半马比赛里"
  const tWin = c.win ?? tRace + 1.8; // "跑赢了人类的世界纪录": the tape breaks just after this
  const { cam } = S;
  // --- the stage
  const sA = 1 - smoothstep(tRace - 0.3, tRace + 0.2, t);
  if (sA > 0) {
    cam.position.set(lerp(0.4, -0.3, t / tRace), 1.7, 6.2);
    cam.lookAt(0, 1.1, -0.4);
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    const P = projector(cam);
    // spotlight cones
    for (let i = 0; i < 5; i++) {
      const top = P((i - 2) * 1.15, 4.2, -Math.abs(i - 2) * 0.45);
      const b0 = P((i - 2) * 1.15 - 0.5, 0, -Math.abs(i - 2) * 0.45), b1 = P((i - 2) * 1.15 + 0.5, 0, -Math.abs(i - 2) * 0.45);
      const g = pen.main.createLinearGradient(top.x, top.y, top.x, b0.y);
      g.addColorStop(0, `rgba(255,214,150,${0.16 * sA})`);
      g.addColorStop(1, 'rgba(255,214,150,0)');
      pen.main.fillStyle = g;
      pen.main.beginPath();
      pen.main.moveTo(top.x, top.y);
      pen.main.lineTo(b0.x, b0.y);
      pen.main.lineTo(b1.x, b1.y);
      pen.main.closePath();
      pen.main.fill();
    }
    const fl = [];
    for (let x = -4; x <= 4; x += 0.5) fl.push([[x, 0, -2.5], [x, 0, 1.5]]);
    wire(pen, P, fl, { color: PAL.warm, a: 0.15 * sA, w: 1, glow: 0.2 });
    S.dancers.forEach((r, i) => {
      poseDance(r, t * 3.2 + i * 0.6);
      // handkerchief spin at the raised hand
    });
    S.stage.updateMatrixWorld(true);
    render3(pen, S.stage, cam, { glow: 0.6, a: sA });
    S.dancers.forEach((r, i) => {
      const w = new THREE.Vector3();
      r.J.handL.getWorldPosition(w);
      const q = P(w.x, w.y + 0.08, w.z);
      const ang = t * 14 + i;
      for (let k = 0; k < 6; k++) {
        const a = ang + (k / 6) * Math.PI * 2;
        line(pen, q.x, q.y, q.x + Math.cos(a) * 26, q.y + Math.sin(a) * 9, { color: PAL.gold, a: 0.7 * sA, w: 2, glow: 0.9 });
      }
    });
    label(pen, 140, 170, { en: 'SPRING FESTIVAL GALA · 2025 / 2026', zh: '人形机器人登上春晚', a: smoothstep(0.2, 0.7, t) * sA, color: PAL.gold, rule: 220 });
  }
  // --- the finish line
  const rA = smoothstep(tRace - 0.3, tRace + 0.2, t) * (1 - smoothstep(dur - 0.3, dur, t));
  if (rA > 0) {
    const lt = t - tRace;
    const { runner, race } = S;
    poseRun(runner, lt * 9.5, 1);
    // constant pace, timed so the runner breaks the tape (x = 0.55) at tWin + 0.3
    const lCross = Math.max(0.8, tWin + 0.3 - tRace);
    const xr = -2.4 + (2.95 / lCross) * lt;
    runner.holder.position.x = xr;
    cam.position.set(0.3, 1.2, 6.0);
    cam.lookAt(0.0, 1.0, 0);
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    const P = projector(cam);
    wire(pen, P, [[[-6, 0, 0], [6, 0, 0]]], { color: PAL.cool, a: 0.45 * rA, w: 1.4, glow: 0.5 });
    // finish arch + tape
    const arch = [[[0.6, 0, -0.9], [0.6, 2.6, -0.9], [0.6, 2.6, 0.9], [0.6, 0, 0.9]]];
    wire(pen, P, arch, { color: PAL.cool, a: 0.6 * rA, w: 2, glow: 0.6 });
    const broke = xr > 0.55;
    const tape = broke ? [[[0.6, 1.1, -0.9], [0.75, 0.9, -0.4]], [[0.6, 1.1, 0.9], [0.75, 0.9, 0.4]]] : [[[0.6, 1.1, -0.9], [0.6, 1.1, 0.9]]];
    wire(pen, P, tape, { color: PAL.gold, a: 0.9 * rA, w: 2.4, glow: 1 });
    render3(pen, race, cam, { glow: 0.6, a: rA });
    // clock: runs fast, stops at 50:26 the moment the tape breaks, with a short flash
    const sec = 50 * 60 + 26 - Math.min(11, Math.max(0, lCross - lt) * 6);
    const mm = Math.floor(sec / 60), ss = Math.floor(sec % 60);
    const flash = lt > lCross ? Math.exp(-(lt - lCross) * 3) : 0;
    const clock = `00:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    if (flash > 0.01) glowText(pen, clock, 1780, 160, { size: 64, font: FONT.mono, weight: 500, color: [190, 230, 255], glowColor: PAL.cyan, glow: 0.9 * flash, a: rA, align: 'right', spacing: 3 });
    text(pen.ui, clock, 1780, 160, { size: 64, font: FONT.mono, weight: 500, color: [150, 214, 255], a: rA, align: 'right', spacing: 3 });
    text(pen.ui, '北京亦庄 · 人形机器人半程马拉松 · 2026', 1780, 212, { size: 18, font: FONT.sans, weight: 500, color: PAL.dim, a: rA, align: 'right', spacing: 2 });
    const wr = smoothstep(lCross + 0.05, lCross + 0.45, lt) * rA;
    if (wr > 0) text(pen.ui, '快于人类男子半马世界纪录', 1780, 252, { size: 22, font: FONT.serif, weight: 600, color: PAL.gold, a: wr, align: 'right', spacing: 3 });
  }
}
