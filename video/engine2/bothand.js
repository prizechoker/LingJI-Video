// The robot's hand for close-ups: the posable hand of engine2/hand.js dressed as the robot (engine2/bot.js): white
// satin, seams round the knuckles and finger joints, on a white forearm shell with a seam ring near the wrist.
// Hand space as in hand.js: wrist at the origin, fingers along -Z, palm facing -Y, the forearm toward +Z.
import { THREE } from './core.js';
import { loadHand, setPose } from './hand.js';
import { botMaterial } from './bot.js';

const FAR = 0.05;
const enc = (d) => 0.5 + Math.max(-FAR, Math.min(FAR, d)) / (2 * FAR);
export const FOREARM = new THREE.Vector3(-0.051, -0.244, 0.968).normalize(); // wrist -> elbow

// Signed distances to the joint planes (MCP, PIP, DIP; the thumb's MCP and IP), each plane across its bone, oriented
// in turn so that the two joints bounding a segment give it the same sign: the palm and the middle phalanges come out
// negative, the proximal and distal ones positive, and only the joints themselves cross zero.
function jointSeams(mesh) {
  const skel = mesh.skeleton;
  const head = {};
  skel.bones.forEach((b, i) => {
    head[b.name] = new THREE.Vector3().setFromMatrixPosition(skel.boneInverses[i].clone().invert()).applyMatrix4(mesh.bindMatrixInverse);
  });
  const J = {};
  for (let f = 1; f <= 5; f++) {
    const [h1, h2, h3, tip] = ['1', '2', '3', '3_leaf'].map((k) => head[`f${f}_${k}`]);
    const d = (a, b) => b.clone().sub(a).normalize();
    J[f] = f === 1 ? [[h2, d(h2, h3), 1], [h3, d(h3, tip), -1]] : [[h1, d(h1, h2), 1], [h2, d(h2, h3), -1], [h3, d(h3, tip), 1]];
  }
  const knuckles = [2, 3, 4, 5].map((g) => J[g][0]);
  const finger = skel.bones.map((b) => +((/^f(\d)_/.exec(b.name) || [0, 0])[1]));
  const geo = mesh.geometry;
  const pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const out = new Float32Array(pos.count * 4);
  const p = new THREE.Vector3(), t = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    let bi = si.getX(i), bw = sw.getX(i);
    for (let k = 1; k < 4; k++) if (sw.getComponent(i, k) > bw) { bw = sw.getComponent(i, k); bi = si.getComponent(i, k); }
    let best = FAR;
    for (const [c, d, o] of finger[bi] ? J[finger[bi]] : knuckles) {
      const s = t.copy(p).sub(c).dot(d) * o;
      if (Math.abs(s) < Math.abs(best)) best = s;
    }
    out.set([enc(-FAR), enc(best), enc(FAR), enc(FAR)], i * 4);
  }
  return new THREE.BufferAttribute(out, 4);
}

// The forearm: an elliptical shell a little wider than the hand mesh's forearm stub (which it hides), widening toward
// the elbow, its open end rolled into a thick lip at the wrist.
function forearmShell(hand, material, { length = 0.42 } = {}) {
  const pos = hand.mesh.geometry.attributes.position;
  const ax = FOREARM;
  const u = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), ax).normalize();
  const v = new THREE.Vector3().crossVectors(ax, u).normalize();
  // the stub's cross-section 4-5 cm up the forearm: centre and half-extents
  const p = new THREE.Vector3();
  let n = 0, cu = 0, cv = 0, umin = 1, umax = -1, vmin = 1, vmax = -1;
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const t = p.dot(ax);
    if (t < 0.04 || t > 0.05) continue;
    const a = p.dot(u), b = p.dot(v);
    cu += a; cv += b; n++;
    umin = Math.min(umin, a); umax = Math.max(umax, a); vmin = Math.min(vmin, b); vmax = Math.max(vmax, b);
  }
  const c0 = new THREE.Vector2((umin + umax) / 2, (vmin + vmax) / 2);
  const r0 = new THREE.Vector2((umax - umin) / 2 + 0.0028, (vmax - vmin) / 2 + 0.0028);
  const t0 = 0.034;
  // rings: (t, scale of r): the lip rolls in from inside, then the shell widens toward the elbow
  const prof = [[t0 + 0.006, 0.86], [t0 + 0.0012, 0.9], [t0, 0.96], [t0 + 0.0015, 1.0]];
  for (let k = 1; k <= 48; k++) prof.push([t0 + 0.0015 + (length - 0.0015) * (k / 48) ** 1.15, 1.0]);
  const seg = 72;
  const verts = [], data = [], idx = [];
  const rEnd = new THREE.Vector2(0.034, 0.029);
  for (const [t, k] of prof) {
    const w = THREE.MathUtils.smoothstep(t, t0 + 0.02, 0.3);
    const ru = THREE.MathUtils.lerp(r0.x, Math.max(r0.x, rEnd.x), w) * k;
    const rv = THREE.MathUtils.lerp(r0.y, Math.max(r0.y, rEnd.y), w) * k;
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const q = ax.clone().multiplyScalar(t).addScaledVector(u, c0.x + Math.cos(a) * ru).addScaledVector(v, c0.y + Math.sin(a) * rv);
      verts.push(q.x, q.y, q.z);
      data.push(enc(-FAR), enc(t - (t0 + 0.03)), enc(FAR), enc(FAR)); // a seam ring 3 cm up from the lip
    }
  }
  for (let r = 0; r < prof.length - 1; r++) {
    for (let j = 0; j < seg; j++) {
      const a = r * seg + j, b = r * seg + ((j + 1) % seg), c = a + seg, d = b + seg;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('botData', new THREE.Float32BufferAttribute(data, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, material);
  m.castShadow = m.receiveShadow = true;
  return m;
}

export async function loadBotHand(studio, { material = botMaterial() } = {}) {
  const h = await loadHand(studio, { material });
  h.mesh.geometry.setAttribute('botData', jointSeams(h.mesh));
  h.forearm = forearmShell(h, material);
  h.holder.add(h.forearm);
  return h;
}

// a point on a fingertip's pad (world space): along the distal phalanx, out on its palm side (local +z)
export function padPoint(h, f, along = 0.62, out = 0.0052) {
  h.holder.updateMatrixWorld(true);
  const len = h.bones[`f${f}_3_leaf`].position.length();
  return h.bones[`f${f}_3`].localToWorld(new THREE.Vector3(0, len * along, out));
}

// the pad's outward normal (world space)
export function padNormal(h, f) {
  h.holder.updateMatrixWorld(true);
  const b = h.bones[`f${f}_3`];
  return new THREE.Vector3(0, 0, 1).transformDirection(b.matrixWorld);
}

export { setPose };

// A rim pinch: the thumb's pad against the index and middle fingers' pads, `gap` apart (the rim's thickness), the
// pads facing each other; the ring and little fingers curled out of the way. Searched coarse, then fine.
export function solvePinch(h, gap = 0.004) {
  const curl = { ring: [0.95, 1.15, 0.6], little: [1.05, 1.2, 0.6] };
  const make = ([fi, tc, tm, ti, tr, ts]) => ({
    ...curl, index: [fi * 0.8, fi, fi * 0.55], middle: [fi * 0.85 + 0.04, fi + 0.06, fi * 0.55], thumb: [tc, tm, ti],
    thumbRoll: tr, spread: { thumb: ts, index: -0.04, middle: 0.03, ring: 0.06, little: 0.1 },
  });
  const cost = (x) => {
    setPose(h, make(x));
    const tP = padPoint(h, 1), fP = padPoint(h, 2).lerp(padPoint(h, 3), 0.5);
    const d = fP.clone().sub(tP);
    const len = d.length();
    d.divideScalar(len);
    const fN = padNormal(h, 2).add(padNormal(h, 3)).normalize();
    return (len - gap) ** 2 + 0.0002 * (1 - padNormal(h, 1).dot(d)) ** 2 + 0.0002 * (1 + fN.dot(d)) ** 2 + 0.0004 * padPoint(h, 2).distanceToSquared(padPoint(h, 3));
  };
  let best = null;
  for (let fi = 0.2; fi <= 1.01; fi += 0.1)
    for (let tc = 0; tc <= 1.01; tc += 0.2)
      for (let tm = 0; tm <= 0.81; tm += 0.2)
        for (let ti = 0; ti <= 0.61; ti += 0.3)
          for (let tr = 0; tr <= 1.41; tr += 0.2)
            for (let ts = -0.3; ts <= 0.31; ts += 0.3) {
              const x = [fi, tc, tm, ti, tr, ts], c = cost(x);
              if (!best || c < best.c) best = { x, c };
            }
  for (let step = 0.08; step > 0.004; step *= 0.5) { // coordinate descent
    for (let it = 0; it < 4; it++) {
      for (let k = 0; k < 6; k++) {
        for (const s of [-step, step]) {
          const x = best.x.slice();
          x[k] += s;
          const c = cost(x);
          if (c < best.c) best = { x, c };
        }
      }
    }
  }
  const pose = make(best.x);
  setPose(h, pose);
  return { pose, err: Math.sqrt(best.c), gap: padPoint(h, 1).distanceTo(padPoint(h, 2).lerp(padPoint(h, 3), 0.5)) };
}
