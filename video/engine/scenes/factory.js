// U08–U11: factory robots for 60+ years. Unimate (1961) had no eyes: the world was arranged so it never needed to look.
import { THREE, projector, render3, propMaterial } from '../core/three.js';
import { W, H, PAL, rgba } from '../core/stage.js';
import { line, text, label, FONT, lightDot, circle } from '../core/draw.js';
import { clamp, lerp, smoothstep, ease, prog, rng, noise2 } from '../core/math.js';
import { sixAxis, unimate, carLines } from './lib/arms.js';
import { wire, boxLines } from './lib/wire.js';
import { G as GO_G } from './lib/goboard.js';

let S = null;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function setup() {
  const cool = propMaterial({ base: 0x020304, rim: 0x86ccff, rimPower: 3.0, rimStrength: 0.55 });
  const dark = propMaterial({ base: 0x030507, rim: 0x86ccff, rimPower: 4.0, rimStrength: 0.8 });
  const warm = propMaterial({ base: 0x2a1404, rim: 0xffb36b, rimPower: 1.6, rimStrength: 2.6, emissive: 0x6a2a00 });
  // line of welders
  const line1 = new THREE.Scene();
  line1.add(new THREE.AmbientLight(0xffffff, 0.1));
  const k1 = new THREE.DirectionalLight(0xbfe0ff, 0.3);
  k1.position.set(-2, 4, 3);
  line1.add(k1);
  const welders = [];
  for (let i = 0; i < 6; i++) {
    for (const side of [-1, 1]) {
      const a = sixAxis(cool);
      a.root.position.set(-6 + i * 2.6, 0, side * 1.9);
      a.J.yaw.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      line1.add(a.root);
      welders.push({ a, i, side });
    }
  }
  // Unimate cell
  const cell = new THREE.Scene();
  cell.add(new THREE.AmbientLight(0xffffff, 0.1));
  const k2 = new THREE.DirectionalLight(0xbfe0ff, 0.3);
  k2.position.set(-2, 4, 3);
  cell.add(k2);
  const u = unimate(cool, dark);
  cell.add(u.root);
  const part = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.16), warm);
  cell.add(part);
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.05, 200);
  S = { line1, welders, cell, u, part, cam };
}

const sparks = (pen, P, x, y, z, t, seed, a = 1) => {
  const R = rng(seed + Math.floor(t * 30));
  for (let k = 0; k < 14; k++) {
    const vx = (R() - 0.5) * 1.2, vy = R() * 0.9, vz = (R() - 0.5) * 1.2;
    const life = R();
    const p0 = P(x, y, z), p1 = P(x + vx * life * 0.5, y + vy * life * 0.4 - life * life * 0.3, z + vz * life * 0.5);
    line(pen, p0.x, p0.y, p1.x, p1.y, { color: PAL.warmHi, a: a * (1 - life) * 0.9, w: 1.4, glow: 1.2, glowColor: PAL.warm });
  }
  const c = P(x, y, z);
  lightDot(pen, c.x, c.y, 26, PAL.warm, 0.9 * a);
};

export function draw(pen, t, p) {
  if (!S) setup();
  const c = p.cue || {};
  const dur = p.dur || 22;
  const tUni = c.unimate ?? 5.0; // "1961年"
  const tBlind = c.blind ?? 8.4; // "它没有眼睛"
  const tSame = c.same ?? 11.2; // "但工厂替它安排好了一切"
  const tBoard = c.board ?? 16.6; // "它不用看。因为…棋盘"
  const tBoardWord = c.boardWord ?? 19.0; // "一张棋盘"
  const { cam } = S;

  // ===== A: the welding line (60 years of factory robots)
  if (t < tUni + 0.4) {
    const aA = 1 - smoothstep(tUni - 0.3, tUni + 0.4, t);
    const k = clamp(t / tUni);
    cam.position.set(lerp(-9, -6.5, k), lerp(3.4, 3.0, k), lerp(5.8, 5.2, k));
    cam.lookAt(lerp(-2, 1, k), 0.9, 0);
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    const P = projector(cam);
    // floor
    const fl = [];
    for (let x = -10; x <= 12; x += 1) fl.push([[x, 0, -4], [x, 0, 4]]);
    for (let z = -4; z <= 4; z += 1) fl.push([[-10, 0, z], [12, 0, z]]);
    wire(pen, P, fl, { color: PAL.cool, a: 0.12 * aA, w: 1, glow: 0.15, fog: [8, 24] });
    // car bodies moving along the line
    const shift = (t * 0.35) % 2.6;
    for (let i = -1; i < 6; i++) wire(pen, P, carLines(), { color: PAL.cool, a: 0.5 * aA, w: 1.3, glow: 0.4, T: { pos: [-6 + i * 2.6 + shift, 0, 0], ry: 0, s: 0.52 }, fog: [6, 24] });
    for (const { a, i, side } of S.welders) {
      const ph = t * 2.2 + i * 1.3 + (side > 0 ? 0.7 : 0);
      a.J.shoulder.rotation.z = -0.45 + 0.08 * Math.sin(ph);
      a.J.elbow.rotation.z = -0.9 + 0.1 * Math.sin(ph * 1.3);
      a.J.wrist.rotation.z = 0.5 + 0.15 * Math.sin(ph * 0.7);
    }
    S.line1.updateMatrixWorld(true);
    render3(pen, S.line1, cam, { glow: 0.55, a: aA });
    for (const { a, i, side } of S.welders) {
      if ((i + (side > 0 ? 1 : 0)) % 2) continue;
      const w = new THREE.Vector3();
      a.J.tip.getWorldPosition(w);
      sparks(pen, P, w.x, w.y, w.z, t, i * 31 + side, aA * (0.6 + 0.4 * Math.sin(t * 9 + i)));
    }
    const la = smoothstep(0.3, 0.9, t) * aA;
    text(pen.ui, '1961  →  2026', 1780, 160, { size: 46, font: FONT.mono, weight: 500, color: [236, 230, 220], a: la, align: 'right', spacing: 4 });
    text(pen.ui, '工业机器人 · 六十多年', 1780, 210, { size: 20, font: FONT.sans, weight: 500, color: PAL.dim, a: la, align: 'right', spacing: 3 });
  }

  // ===== B/C/D: the Unimate cell
  if (t > tUni - 0.4) {
    const bA = smoothstep(tUni - 0.4, tUni + 0.3, t);
    const lt = t - tUni;
    const { u, part } = S;
    // camera: 3/4 view, later cranes up to top-down for the "board" reveal
    const up = ease.inOutCubic(clamp((t - tBoard) / 2.2));
    const orbit = lerp(0.75, 0.55, ease.inOutSine(clamp(lt / (tBoard - tUni))));
    const r = lerp(5.2, 4.4, up);
    const ex = Math.sin(orbit) * r, ez = Math.cos(orbit) * r;
    cam.position.set(lerp(ex + 0.4, 0.55, up), lerp(2.6, 7.6, up), lerp(ez, 0.02, up));
    cam.lookAt(lerp(0.5, 0.55, up), lerp(0.75, 0.0, up), 0);
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    const P = projector(cam);
    // the cell: fixture grid on the floor (positions everything lands on)
    const gridA = lerp(0.14, 0.75, up);
    const gl = [];
    const n = 9, step = 0.42, x0 = 0.55 - (n - 1) / 2 * step, z0 = -(n - 1) / 2 * step;
    for (let i = 0; i < n; i++) {
      gl.push([[x0 + i * step, 0.002, z0], [x0 + i * step, 0.002, z0 + (n - 1) * step]]);
      gl.push([[x0, 0.002, z0 + i * step], [x0 + (n - 1) * step, 0.002, z0 + i * step]]);
    }
    wire(pen, P, gl, { color: up > 0.5 ? PAL.cool : PAL.cool, a: gridA * bA, w: 1.2, glow: 0.5 + up, glowColor: PAL.cyan });
    // die-casting machine (source) + conveyor (destination)
    const src = [2.25, 0, -0.85], dst = [2.25, 0, 0.85];
    wire(pen, P, boxLines(0.9, 1.0, 0.8), { color: PAL.cool, a: 0.45 * bA, w: 1.4, glow: 0.4, T: { pos: [src[0] + 0.4, 0, src[2] - 0.35] } });
    wire(pen, P, boxLines(0.7, 0.55, 1.2), { color: PAL.cool, a: 0.4 * bA, w: 1.4, glow: 0.4, T: { pos: [dst[0] + 0.2, 0, dst[2] + 0.3] } });
    // arm cycle: reach to source, grab, swing to destination, release; repeats 3x after tSame
    const cyc = Math.max(0, t - tUni - 0.6) / 2.4;
    const ph = cyc % 1;
    const swing = ph < 0.2 ? 0 : ph < 0.5 ? ease.inOutCubic((ph - 0.2) / 0.3) : ph < 0.7 ? 1 : 1 - ease.inOutCubic((ph - 0.7) / 0.3);
    u.J.yaw.rotation.y = lerp(0.58, -0.58, swing);
    u.J.pitch.rotation.z = -0.25 + 0.06 * Math.sin(ph * Math.PI * 2);
    u.J.ext.position.x = 0.9 + 0.22 * Math.sin(ph * Math.PI);
    const grip = ph < 0.18 ? 0 : ph < 0.65 ? 1 : 0;
    u.J.jaws[0].position.z = -0.06 + 0.025 * grip;
    u.J.jaws[1].position.z = 0.06 - 0.025 * grip;
    S.cell.updateMatrixWorld(true);
    const tipW = new THREE.Vector3();
    u.J.tip.getWorldPosition(tipW);
    // the hot part: appears at the exact same spot each cycle, rides in the jaws, dropped at the conveyor
    const spot = V(1.95, 0.62, -0.62);
    if (ph < 0.18) part.position.copy(spot);
    else if (ph < 0.65) part.position.copy(tipW).add(V(0, -0.02, 0));
    else part.position.set(1.95, 0.58 + 0.0, 0.62);
    part.rotation.y = u.J.yaw.rotation.y;
    render3(pen, S.cell, cam, { glow: 0.55, a: bA * (1 - up * 0.85) });
    const sp = P(spot.x, spot.y, spot.z);
    // ghosts of previous parts at the identical spot + coordinate readout
    const sameA = smoothstep(tSame + 0.8, tSame + 1.4, t) * (1 - up);
    if (sameA > 0) {
      for (let g = 0; g < 3; g++) lightDot(pen, sp.x + g * 0.0, sp.y, 30, PAL.warm, 0.12 * sameA);
      const cr = 26;
      line(pen, sp.x - cr * 1.6, sp.y, sp.x + cr * 1.6, sp.y, { color: PAL.gold, a: sameA, w: 1.4, glow: 0.7 });
      line(pen, sp.x, sp.y - cr * 1.6, sp.x, sp.y + cr * 1.6, { color: PAL.gold, a: sameA, w: 1.4, glow: 0.7 });
      circle(pen, sp.x, sp.y, cr, { color: PAL.gold, a: sameA, w: 1.4, glow: 0.7 });
      const rows = Math.min(3, 1 + Math.floor(Math.max(0, t - tSame - 0.8) / 1.2));
      for (let r = 0; r < rows; r++) text(pen.ui, `第${r + 1}次   X 1950.0   Y 620.0   Z -620.0`, sp.x + 60, sp.y + 70 + r * 30, { size: 18, font: FONT.mono, weight: 500, color: PAL.gold, a: sameA, align: 'left', spacing: 1 });
    }
    // term chip for experts (on screen only)
    const termA = smoothstep(tSame + 1.6, tSame + 2.2, t) * (1 - smoothstep(tBoardWord + 1.2, tBoardWord + 1.8, t));
    label(pen, 140, 268, { en: 'STRUCTURED ENVIRONMENT', zh: '结构化环境', a: termA, color: PAL.gold, rule: 200 });
    // caption: Unimate
    const capA = smoothstep(tUni + 0.3, tUni + 0.9, t) * (1 - smoothstep(tBoard - 0.3, tBoard + 0.3, t));
    label(pen, 140, 170, { en: 'UNIMATE · 1961 · GENERAL MOTORS', zh: '第一台投入生产的工业机器人', a: capA, color: PAL.cool, rule: 220 });
    // "no eyes": the robot's own camera feed is empty
    const blindA = smoothstep(tBlind - 0.1, tBlind + 0.4, t) * (1 - smoothstep(tSame + 0.4, tSame + 1.0, t));
    if (blindA > 0) {
      const bx = 1330, by = 330, bw = 380, bh = 230;
      const ui = pen.ui;
      ui.save();
      ui.globalAlpha = blindA;
      ui.fillStyle = 'rgba(2,3,5,0.92)';
      ui.fillRect(bx, by, bw, bh);
      ui.strokeStyle = rgba(PAL.cool, 0.6);
      ui.lineWidth = 1.5;
      ui.strokeRect(bx, by, bw, bh);
      ui.restore();
      text(ui, 'UNIMATE · 视觉输入', bx + 16, by + 26, { size: 14, font: FONT.mono, weight: 500, color: PAL.dim, a: blindA, align: 'left', spacing: 2 });
      text(ui, '无', bx + bw / 2, by + bh / 2 + 8, { size: 64, font: FONT.serif, weight: 700, color: [236, 230, 220], a: blindA * 0.9 });
      text(ui, 'NO CAMERA · NO SENSOR', bx + bw / 2, by + bh - 28, { size: 13, font: FONT.mono, weight: 500, color: PAL.red, a: blindA * 0.9, spacing: 3 });
    }
    // board reveal: fixture grid becomes a go board (stones at the fixture points)
    const ba = smoothstep(tBoardWord - 0.6, tBoardWord + 0.4, t);
    if (ba > 0) {
      for (let i = 0; i < n; i += 2) for (let j = 0; j < n; j += 2) {
        const q = P(x0 + i * step, 0.002, z0 + j * step);
        lightDot(pen, q.x, q.y, 9, PAL.cyan, 0.7 * ba);
      }
      const ui = pen.ui;
      const g = ui.createRadialGradient(960, 540, 0, 960, 540, 380);
      g.addColorStop(0, `rgba(3,5,8,${0.75 * ba})`);
      g.addColorStop(1, 'rgba(3,5,8,0)');
      ui.fillStyle = g;
      ui.fillRect(560, 300, 800, 480);
      text(ui, '一张棋盘', 960, 540, { size: 96, font: FONT.serif, weight: 800, color: [246, 240, 230], a: ba * 0.95, spacing: 24 });
    }
  }
}
