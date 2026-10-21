// U13: warehouse robots can't find their way -> cover the floor with QR codes and let them move cell by cell.
import { THREE, projector, render3, propMaterial, edges } from '../core/three.js';
import { W, H, PAL, rgba } from '../core/stage.js';
import { line, text, label, FONT } from '../core/draw.js';
import { clamp, lerp, smoothstep, ease, rng } from '../core/math.js';
import { wire, boxLines } from './lib/wire.js';

let S = null;
const CELL = 1.0;
// robot routes: lists of grid cells (i,j) visited in order (Manhattan moves)
const ROUTES = [
  [[-4, -2], [-3, -2], [-2, -2], [-1, -2], [-1, -1], [-1, 0], [0, 0], [1, 0], [2, 0]],
  [[4, 2], [3, 2], [2, 2], [2, 1], [1, 1], [0, 1], [-1, 1], [-2, 1], [-3, 1]],
  [[-3, 3], [-3, 2], [-3, 1], [-2, 1], [-2, 0], [-2, -1], [-3, -1]],
  [[3, -3], [3, -2], [3, -1], [2, -1], [1, -1], [1, -2], [0, -2]],
  [[0, 3], [0, 2], [1, 2], [1, 3], [2, 3]],
];

function setup() {
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.1));
  const k = new THREE.DirectionalLight(0xbfe0ff, 0.3);
  k.position.set(-2, 5, 3);
  scene.add(k);
  const mat = propMaterial({ base: 0x070b10, rim: 0x86ccff, rimPower: 3.0, rimStrength: 1.7 });
  const bots = ROUTES.map(() => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.28, 0.6), mat);
    edges(body, 0x9fd6ff, 0.3);
    body.position.y = 0.16;
    g.add(body);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 28), mat);
    lid.position.y = 0.33;
    g.add(lid);
    scene.add(g);
    return g;
  });
  const cam = new THREE.PerspectiveCamera(32, W / H, 0.1, 100);
  S = { scene, bots, cam };
}

function routePos(route, u) {
  const n = route.length - 1;
  const f = clamp(u) * n;
  const i = Math.min(n - 1, Math.floor(f));
  const s = ease.inOutSine(f - i);
  const a = route[i], b = route[i + 1];
  return { x: lerp(a[0], b[0], s) * CELL, z: lerp(a[1], b[1], s) * CELL, ry: Math.atan2(b[0] - a[0], b[1] - a[1]) };
}

// QR-like fiducial: deterministic bit pattern inside a cell
function fiducial(pen, P, ci, cj, a) {
  const R = rng((ci + 50) * 131 + (cj + 50) * 17);
  const s = 0.34, n = 5, d = (2 * s) / n;
  const cx = ci * CELL, cz = cj * CELL;
  const polys = [[[cx - s, 0, cz - s], [cx + s, 0, cz - s], [cx + s, 0, cz + s], [cx - s, 0, cz + s], [cx - s, 0, cz - s]]];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (R() < 0.45) continue;
    const x0 = cx - s + i * d + d * 0.2, z0 = cz - s + j * d + d * 0.2, e = d * 0.6;
    polys.push([[x0, 0, z0], [x0 + e, 0, z0], [x0 + e, 0, z0 + e], [x0, 0, z0 + e], [x0, 0, z0]]);
  }
  wire(pen, P, polys, { color: PAL.cool, a, w: 1, glow: 0.25 });
}

export function draw(pen, t, p) {
  if (!S) setup();
  const dur = p.dur || 5.5;
  const { cam, bots, scene } = S;
  const k = ease.inOutSine(clamp(t / dur));
  cam.position.set(lerp(-2.5, -1.0, k), lerp(9.5, 8.2, k), lerp(7.2, 6.0, k));
  cam.lookAt(lerp(-0.5, 0.2, k), 0, lerp(0.4, 0.1, k));
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  const P = projector(cam);
  // floor grid + codes, revealed in a sweep
  const sweep = clamp(t / 1.2);
  const gl = [];
  for (let i = -6; i <= 6; i++) {
    gl.push([[(i - 0.5) * CELL, 0, -4.5 * CELL], [(i - 0.5) * CELL, 0, 4.5 * CELL]]);
  }
  for (let j = -4; j <= 5; j++) gl.push([[-6.5 * CELL, 0, (j - 0.5) * CELL], [5.5 * CELL, 0, (j - 0.5) * CELL]]);
  wire(pen, P, gl, { color: PAL.cool, a: 0.42, w: 1.2, glow: 0.5, glowColor: PAL.cyan, reveal: sweep });
  for (let i = -6; i <= 5; i++) for (let j = -4; j <= 4; j++) {
    const d = Math.hypot(i, j) / 8;
    const a = smoothstep(d * 0.9, d * 0.9 + 0.4, t) * 0.32;
    if (a > 0.01) fiducial(pen, P, i, j, a);
  }
  // shelf pods carried by robots (wire racks) + robots (meshes)
  ROUTES.forEach((route, r) => {
    const u = clamp((t - 0.3 - r * 0.15) / (dur - 0.6));
    const q = routePos(route, u);
    bots[r].position.set(q.x, 0, q.z);
    bots[r].rotation.y = q.ry;
    const pod = boxLines(0.9, 1.6, 0.9, 0.36);
    for (const h of [0.75, 1.15, 1.55]) pod.push([[-0.45, h, -0.45], [0.45, h, -0.45], [0.45, h, 0.45], [-0.45, h, 0.45], [-0.45, h, -0.45]]);
    wire(pen, P, pod, { color: PAL.cool, a: 0.4, w: 1.1, glow: 0.3, T: { pos: [q.x, 0, q.z], ry: q.ry } });
    // path ahead highlighted cell by cell
    const ahead = route.map(([i, j]) => [i * CELL, 0.01, j * CELL]);
    wire(pen, P, [ahead], { color: PAL.cyan, a: 0.35, w: 2, glow: 0.8, dash: [10, 10] });
  });
  render3(pen, scene, cam, { glow: 0.6 });
  const la = smoothstep(0.3, 0.8, t);
  label(pen, 140, 170, { en: 'WAREHOUSE · FIDUCIAL GRID', zh: '仓库机器人：地面贴满二维码', a: la, color: PAL.cool, rule: 220 });
}
