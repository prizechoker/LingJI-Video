// A cat leaping from the floor onto the dining table, seen only as its shadow (shots/home.js, mode 'days'). There is
// no cat in the scene: a side-view silhouette rig is drawn into the corner lamp's projected light map (a gobo), at
// the place and size the real cat would cover as seen from the bulb, so its shadow falls wherever that light goes.
// Cat space: x forward (the direction of the jump), y up, metres; the floor at y = 0, the table top at y = 0.75.
import { THREE } from '../../engine2/core.js';
import { clamp } from './kit.js';

// keyframes: time (s from the crouch), hip position, body pitch, neck & head (relative), front legs (absolute angles of
// upper arm, forearm, paw), hind legs (thigh, shin, foot), tail (base angle, curl per segment); degrees
const K = [
  { t: 0.0, hip: [0.0, 0.1], pitch: 26, neck: 40, head: 10, fl: [-96, -88, -8], hl: [-45, -170, 0], tail: [-168, 7] },
  { t: 0.32, hip: [-0.01, 0.085], pitch: 30, neck: 42, head: 12, fl: [-98, -86, -8], hl: [-42, -172, 0], tail: [-170, 9] },
  { t: 0.46, hip: [0.04, 0.2], pitch: 52, neck: 25, head: 5, fl: [-35, -125, -150], hl: [-112, -100, -95], tail: [-160, 3] },
  { t: 0.58, hip: [0.15, 0.52], pitch: 32, neck: 15, head: -5, fl: [-5, -25, -55], hl: [-150, -168, -172], tail: [-178, 2] },
  { t: 0.7, hip: [0.29, 0.9], pitch: -8, neck: 18, head: -10, fl: [-75, -92, -40], hl: [-70, -140, -110], tail: [-190, 4] },
  { t: 0.82, hip: [0.4, 0.86], pitch: 4, neck: 25, head: 0, fl: [-93, -90, -6], hl: [-48, -168, 0], tail: [-175, 8] },
  { t: 1.15, hip: [0.44, 0.97], pitch: 2, neck: 36, head: 5, fl: [-95, -88, -60], hl: [-55, -130, -92], tail: [95, -11] },
  { t: 1.6, hip: [0.47, 0.97], pitch: 1, neck: 40, head: 8, fl: [-93, -90, -60], hl: [-56, -129, -92], tail: [100, -13] },
];
const KEYS = ['hip', 'pitch', 'neck', 'head', 'fl', 'hl', 'tail'];

// Catmull-Rom through the keys (non-uniform times), per component
function cr(p0, p1, p2, p3, t0, t1, t2, t3, t) {
  const m1 = (p2 - p0) / (t2 - t0 || 1), m2 = (p3 - p1) / (t3 - t1 || 1);
  const h = t2 - t1, u = clamp((t - t1) / h);
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p1 + (u3 - 2 * u2 + u) * h * m1 + (-2 * u3 + 3 * u2) * p2 + (u3 - u2) * h * m2;
}
export function catPose(t) {
  const n = K.length;
  if (t <= K[0].t) return K[0];
  if (t >= K[n - 1].t) {
    const P = JSON.parse(JSON.stringify(K[n - 1]));
    const dt = t - K[n - 1].t;
    P.tail[0] += 6 * Math.sin(dt * 2.2);  // a slow sway of the tail
    P.tail[1] += 2 * Math.sin(dt * 2.2 - 0.8);
    P.neck += 3 * Math.sin(dt * 0.9);
    return P;
  }
  let i = 0;
  while (K[i + 1].t < t) i++;
  const a = K[Math.max(0, i - 1)], b = K[i], c = K[i + 1], d = K[Math.min(n - 1, i + 2)];
  const out = { t };
  for (const k of KEYS) {
    const va = a[k], vb = b[k], vc = c[k], vd = d[k];
    if (Array.isArray(vb)) out[k] = vb.map((_, j) => cr(va[j], vb[j], vc[j], vd[j], a.t, b.t, c.t, d.t, t));
    else out[k] = cr(va, vb, vc, vd, a.t, b.t, c.t, d.t, t);
  }
  return out;
}

const rad = (d) => (d * Math.PI) / 180;
const dir = (d) => [Math.cos(rad(d)), Math.sin(rad(d))];
const add = (p, d, L) => [p[0] + d[0] * L, p[1] + d[1] * L];

// draw the silhouette in cat space (the context is already transformed to it); black on white
export function drawCat(g, P, { far = false } = {}) {
  const H = P.hip;
  const S = add(H, dir(P.pitch), 0.235);
  const limb = (pts, w0, w1) => {
    for (let k = 0; k < pts.length - 1; k++) {
      g.lineWidth = w0 + (w1 - w0) * (k / Math.max(1, pts.length - 2));
      g.beginPath();
      g.moveTo(pts[k][0], pts[k][1]);
      g.lineTo(pts[k + 1][0], pts[k + 1][1]);
      g.stroke();
    }
  };
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // legs: the far pair a little offset in phase
  const legs = (dA, off) => {
    const fl = P.fl.map((v) => v + dA), hl = P.hl.map((v) => v - dA * 0.7);
    const F0 = add(add(S, dir(P.pitch - 90), 0.035), dir(P.pitch), -0.01 + off);
    const f1 = add(F0, dir(fl[0]), 0.095), f2 = add(f1, dir(fl[1]), 0.088), f3 = add(f2, dir(fl[2]), 0.03);
    limb([F0, f1, f2, f3], 0.038, 0.022);
    const H0 = add(add(H, dir(P.pitch - 90), 0.02), dir(P.pitch), off);
    const h1 = add(H0, dir(hl[0]), 0.1), h2 = add(h1, dir(hl[1]), 0.11), h3 = add(h2, dir(hl[2]), 0.065);
    limb([H0, h1], 0.06, 0.06);
    limb([h1, h2, h3], 0.03, 0.02);
  };
  legs(far ? 8 : 0, far ? 0.012 : 0);
  if (!far) legs(9, 0.015);
  // torso: haunch and chest capsules and the back line
  g.lineWidth = 0.115;
  g.beginPath(); g.moveTo(H[0], H[1]); g.lineTo(S[0], S[1]); g.stroke();
  g.lineWidth = 0.1;
  const belly = add(add(H, dir(P.pitch), 0.12), dir(P.pitch - 90), 0.018);
  g.beginPath(); g.moveTo(H[0], H[1]); g.lineTo(belly[0], belly[1]); g.lineTo(S[0], S[1]); g.stroke();
  // neck and head
  const Hd = add(S, dir(P.pitch + P.neck), 0.085);
  g.lineWidth = 0.065;
  g.beginPath(); g.moveTo(S[0], S[1]); g.lineTo(Hd[0], Hd[1]); g.stroke();
  const ha = rad(P.pitch * 0.3 + P.head);
  g.save();
  g.translate(Hd[0], Hd[1]);
  g.rotate(ha);
  g.beginPath(); g.ellipse(0.005, 0, 0.05, 0.042, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(0.045, -0.012, 0.024, 0.017, -0.2, 0, Math.PI * 2); g.fill();  // muzzle
  // ears
  for (const [x0, lean] of [[-0.022, -0.12], [0.012, 0.05]]) {
    g.beginPath();
    g.moveTo(x0 - 0.016, 0.03);
    g.lineTo(x0 + 0.002 + lean * 0.1, 0.075);
    g.lineTo(x0 + 0.02, 0.028);
    g.closePath();
    g.fill();
  }
  g.restore();
  // tail: from just behind the hip
  let p = add(H, dir(P.pitch + 180), 0.045);
  p = add(p, dir(P.pitch + 90), 0.015);
  let a = P.tail[0];
  const tp = [p];
  for (let k = 0; k < 10; k++) {
    p = add(p, dir(a), 0.029);
    tp.push(p);
    a += P.tail[1];
  }
  limb(tp, 0.03, 0.018);
}

// the gobo: a white canvas the size of the light's map; draw(t) paints the cat for time t (s from the crouch) where
// the jump path (start: world point on the floor, fwd: unit vector, the direction of the jump) puts it
export function catGobo(light, { size = 1024, start, fwd, blur = 3 } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const sc = document.createElement('canvas');  // the silhouette, sharp; blurred as it is laid onto the map
  sc.width = sc.height = size;
  const sg = sc.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  light.map = tex;
  const up = new THREE.Vector3(0, 1, 0);
  const proj = (w) => {
    const v = new THREE.Vector4(w.x, w.y, w.z, 1).applyMatrix4(light.shadow.matrix);
    return [(v.x / v.w) * size, (1 - v.y / v.w) * size];
  };
  let last = null;
  const clear = () => { g.setTransform(1, 0, 0, 1, 0, 0); g.filter = 'none'; g.fillStyle = '#fff'; g.fillRect(0, 0, size, size); };
  clear();
  tex.needsUpdate = true;
  function draw(t, on = true) {
    const key = on ? Math.round(t * 240) : -1;
    if (key === last) return;
    last = key;
    clear();
    if (on) {
      light.updateMatrixWorld();
      light.target.updateMatrixWorld();
      light.shadow.updateMatrices(light);
      const P = catPose(t);
      // where the hip is in the world; the 2D frame (cat x, cat y) around it, projected into the map
      const hip = start.clone().addScaledVector(fwd, P.hip[0]).addScaledVector(up, P.hip[1]);
      const o = proj(hip), ex = proj(hip.clone().addScaledVector(fwd, 0.1)), ey = proj(hip.clone().addScaledVector(up, 0.1));
      const a = (ex[0] - o[0]) / 0.1, b = (ex[1] - o[1]) / 0.1, cc = (ey[0] - o[0]) / 0.1, d = (ey[1] - o[1]) / 0.1;
      sg.setTransform(1, 0, 0, 1, 0, 0);
      sg.clearRect(0, 0, size, size);
      sg.setTransform(a, b, cc, d, o[0] - a * P.hip[0] - cc * P.hip[1], o[1] - b * P.hip[0] - d * P.hip[1]);
      sg.fillStyle = '#000';
      sg.strokeStyle = '#000';
      drawCat(sg, P, {});
      g.filter = `blur(${blur}px)`;
      g.drawImage(sc, 0, 0);
      g.filter = 'none';
    }
    tex.needsUpdate = true;
  }
  return { draw, tex, canvas: c };
}
