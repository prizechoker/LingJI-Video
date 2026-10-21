// U14: the robot vacuum gets one job only — the floor. Furniture fades to footprints; a coverage path sweeps the plane.
import { THREE, projector, render3, propMaterial, edges } from '../core/three.js';
import { W, H, PAL } from '../core/stage.js';
import { label, text, FONT, lightDot } from '../core/draw.js';
import { clamp, lerp, smoothstep, ease } from '../core/math.js';
import { wire, boxLines } from './lib/wire.js';

let S = null;
function setup() {
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.1));
  const k = new THREE.DirectionalLight(0xbfe0ff, 0.3);
  k.position.set(-2, 5, 3);
  scene.add(k);
  const mat = propMaterial({ base: 0x070b10, rim: 0x86ccff, rimPower: 3.0, rimStrength: 1.8 });
  const bot = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 48), mat);
  body.position.y = 0.05;
  bot.add(body);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 28), mat);
  top.position.set(0.06, 0.1, 0);
  bot.add(top);
  edges(body, 0x9fd6ff, 0.35, 10);
  scene.add(bot);
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.05, 50);
  // boustrophedon coverage path across a 3 x 2 m floor, avoiding nothing (everything is flat now)
  const path = [];
  for (let r = 0; r < 9; r++) {
    const z = -0.9 + r * 0.225;
    const xs = r % 2 ? [1.4, -1.4] : [-1.4, 1.4];
    path.push([xs[0], 0.012, z], [xs[1], 0.012, z]);
  }
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][2] - path[i - 1][2]));
  S = { scene, bot, cam, path, cum };
}

function furniture() {
  const sofa = [...boxLines(1.0, 0.42, 0.42), ...boxLines(1.0, 0.4, 0.12, 0.42).map((pl) => pl.map(([x, y, z]) => [x, y, z - 0.15]))];
  const table = [...boxLines(0.6, 0.04, 0.4, 0.42)];
  for (const [x, z] of [[-0.27, -0.17], [0.27, -0.17], [0.27, 0.17], [-0.27, 0.17]]) table.push([[x, 0, z], [x, 0.42, z]]);
  return [
    { L: sofa, pos: [-0.6, 0, -0.75] },
    { L: table, pos: [0.4, 0, 0.1] },
    { L: boxLines(0.35, 0.9, 0.35), pos: [1.25, 0, -0.75] },
  ];
}

export function draw(pen, t, p) {
  if (!S) setup();
  const c = p.cue || {};
  const dur = p.dur || 5;
  const tOnly = c.only ?? 1.6; // "那就只交给它一件事"
  const tFloor = c.floor ?? 3.2; // "地板"
  const { cam, bot, scene, path, cum } = S;
  const k = ease.inOutSine(clamp(t / dur));
  cam.position.set(lerp(-1.6, -0.9, k), lerp(3.0, 3.6, k), lerp(3.4, 2.9, k));
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  const P = projector(cam);
  // room outline + floor
  const floorA = 0.35 + 0.65 * smoothstep(tFloor - 0.3, tFloor + 0.4, t);
  wire(pen, P, [[[-1.6, 0, -1.1], [1.6, 0, -1.1], [1.6, 0, 1.1], [-1.6, 0, 1.1], [-1.6, 0, -1.1]]], { color: PAL.cyan, a: 0.6 * floorA, w: 1.8, glow: 0.9 });
  const tiles = [];
  for (let x = -1.6; x <= 1.61; x += 0.4) tiles.push([[x, 0, -1.1], [x, 0, 1.1]]);
  for (let z = -1.1; z <= 1.11; z += 0.44) tiles.push([[-1.6, 0, z], [1.6, 0, z]]);
  wire(pen, P, tiles, { color: PAL.cool, a: 0.2 * floorA, w: 1, glow: 0.3 });
  // walls fade away with the furniture
  const flat = smoothstep(tOnly, tOnly + 1.0, t);
  wire(pen, P, [[[-1.6, 0, -1.1], [-1.6, 1.2, -1.1], [1.6, 1.2, -1.1], [1.6, 0, -1.1]], [[-1.6, 1.2, -1.1], [-1.6, 1.2, 1.1], [-1.6, 0, 1.1]]], { color: PAL.cool, a: 0.35 * (1 - flat), w: 1.2, glow: 0.3 });
  for (const f of furniture()) {
    // furniture squashes into its footprint on the floor
    const squash = 1 - flat * 0.98;
    const L = f.L.map((pl) => pl.map(([x, y, z]) => [x, y * squash, z]));
    wire(pen, P, L, { color: PAL.cool, a: 0.55 - 0.35 * flat, w: 1.3, glow: 0.4, T: { pos: f.pos } });
  }
  // robot follows the coverage path, trail drawn behind
  const total = cum[cum.length - 1];
  const d = total * ease.inOutSine(clamp((t - 0.4) / (dur - 0.4))) * 0.85;
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const f = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
  const a = path[i - 1], b = path[i];
  const x = lerp(a[0], b[0], f), z = lerp(a[2], b[2], f);
  bot.position.set(x, 0, z);
  bot.rotation.y = -Math.atan2(b[2] - a[2], b[0] - a[0]);
  const trail = path.slice(0, i).concat([[x, 0.012, z]]);
  wire(pen, P, [trail], { color: PAL.cyan, a: 0.6, w: 6, glow: 0.6, glowColor: PAL.cyan });
  render3(pen, scene, cam, { glow: 0.6 });
  const q = P(x, 0.1, z);
  lightDot(pen, q.x, q.y, 18, PAL.cyan, 0.5);
  label(pen, 140, 170, { en: 'ROBOT VACUUM · ONE JOB', zh: '扫地机器人：只管二维的地板', a: smoothstep(0.3, 0.8, t), color: PAL.cool, rule: 220 });
}
