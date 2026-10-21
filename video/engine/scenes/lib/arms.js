// Industrial arms built from primitives: a modern 6-axis arm and the 1961 Unimate.
import { THREE, edges } from '../../core/three.js';

function mesh(geo, mat, edgeOp = 0.22) {
  const m = new THREE.Mesh(geo, mat);
  if (edgeOp > 0) edges(m, 0x9fd6ff, edgeOp, 30);
  return m;
}

// Modern 6-axis arm (~2 m reach). Joints: base yaw, shoulder pitch, elbow pitch, wrist pitch.
export function sixAxis(mat) {
  const J = {};
  const root = new THREE.Group();
  root.add(mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.22, 32), mat));
  const yaw = new THREE.Group();
  yaw.position.y = 0.11;
  root.add(yaw);
  J.yaw = yaw;
  const turret = mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.42, 32), mat);
  turret.position.y = 0.21;
  yaw.add(turret);
  const sh = new THREE.Group();
  sh.position.set(0.12, 0.5, 0);
  yaw.add(sh);
  J.shoulder = sh;
  const shc = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.3, 28), mat);
  shc.rotation.x = Math.PI / 2;
  sh.add(shc);
  const upper = mesh(new THREE.BoxGeometry(0.22, 0.95, 0.24), mat);
  upper.position.y = 0.47;
  sh.add(upper);
  const el = new THREE.Group();
  el.position.y = 0.95;
  sh.add(el);
  J.elbow = el;
  const elc = mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.28, 24), mat);
  elc.rotation.x = Math.PI / 2;
  el.add(elc);
  const fore = mesh(new THREE.BoxGeometry(0.85, 0.16, 0.18), mat);
  fore.position.x = 0.42;
  el.add(fore);
  const wr = new THREE.Group();
  wr.position.x = 0.86;
  el.add(wr);
  J.wrist = wr;
  const wrc = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.18, 20), mat);
  wrc.rotation.x = Math.PI / 2;
  wr.add(wrc);
  const tool = mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.32, 16), mat);
  tool.position.set(0.0, -0.18, 0);
  wr.add(tool);
  const tip = new THREE.Object3D();
  tip.position.set(0, -0.34, 0);
  wr.add(tip);
  J.tip = tip;
  return { root, J };
}

// Unimate (1961): hydraulic cabinet, rotating turret, horizontal telescoping boom, two-jaw gripper.
export function unimate(mat, dark) {
  const J = {};
  const root = new THREE.Group();
  const cab = mesh(new THREE.BoxGeometry(1.25, 0.82, 0.86), mat, 0.3);
  cab.position.y = 0.41;
  root.add(cab);
  // panel details
  for (const x of [-0.35, 0.0, 0.35]) {
    const pnl = mesh(new THREE.BoxGeometry(0.28, 0.5, 0.01), dark, 0.25);
    pnl.position.set(x, 0.42, 0.435);
    root.add(pnl);
  }
  const yaw = new THREE.Group();
  yaw.position.set(-0.25, 0.82, 0);
  root.add(yaw);
  J.yaw = yaw;
  const turret = mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.36, 36), mat, 0.3);
  turret.position.y = 0.18;
  yaw.add(turret);
  const pitch = new THREE.Group();
  pitch.position.y = 0.48;
  yaw.add(pitch);
  J.pitch = pitch;
  const hub = mesh(new THREE.BoxGeometry(0.46, 0.34, 0.42), mat, 0.3);
  pitch.add(hub);
  const boom = mesh(new THREE.BoxGeometry(1.05, 0.22, 0.24), mat, 0.3);
  boom.position.x = 0.62;
  pitch.add(boom);
  const ext = new THREE.Group();
  ext.position.x = 0.9;
  pitch.add(ext);
  J.ext = ext;
  const inner = mesh(new THREE.BoxGeometry(0.8, 0.15, 0.16), mat, 0.3);
  inner.position.x = 0.25;
  ext.add(inner);
  const wrist = new THREE.Group();
  wrist.position.x = 0.68;
  ext.add(wrist);
  J.wrist = wrist;
  const wb = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.16, 20), mat, 0.3);
  wb.rotation.z = Math.PI / 2;
  wrist.add(wb);
  const jaws = [];
  for (const s of [-1, 1]) {
    const jw = mesh(new THREE.BoxGeometry(0.05, 0.2, 0.06), mat, 0.3);
    jw.position.set(0.1, -0.12, s * 0.06);
    wrist.add(jw);
    jaws.push(jw);
  }
  J.jaws = jaws;
  const tip = new THREE.Object3D();
  tip.position.set(0.1, -0.24, 0);
  wrist.add(tip);
  J.tip = tip;
  return { root, J };
}

// Line-art car body (metres), for the welding line
export function carLines() {
  const side = (z) => [[-2.2, 0.35, z], [-2.25, 0.62, z], [-1.9, 0.72, z], [-1.0, 0.78, z], [-0.55, 1.22, z], [0.75, 1.24, z], [1.35, 0.82, z], [2.15, 0.72, z], [2.3, 0.45, z], [2.2, 0.35, z]];
  const L = [side(-0.85), side(0.85)];
  for (const i of [0, 1, 3, 4, 5, 6, 8]) L.push([side(-0.85)[i], side(0.85)[i]]);
  // wheel arches
  for (const x of [-1.4, 1.5]) for (const z of [-0.86, 0.86]) {
    const w = [];
    for (let k = 0; k <= 20; k++) { const a = Math.PI * (k / 20); w.push([x + Math.cos(a) * 0.38, 0.35 + Math.sin(a) * 0.38 - 0.1, z]); }
    L.push(w);
  }
  return L;
}
