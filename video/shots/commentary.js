// The commentary studio (A07): a big magnetic demonstration board on a stand, the position after move 36. A
// commentator's hand brings AlphaGo's black stone to P10, stops short, hesitates (cue "strange": 很奇怪), then
// presses it on with a click (cue "place"); the hand withdraws and the camera holds on the stone through a long
// silence, drifting in (cue "mistake": 我以为，它下错了). The quotes themselves are set by the subtitles.
import { Studio, THREE, spot } from '../engine2/core.js';
import { loadHand, setPose } from '../engine2/hand.js';
import { buildSleeve } from '../engine2/sleeve.js';
import { gameMoves, position, fingerPoint } from './lib/goset.js';
import { ss, sstep, clamp, lerp, key, breathe, grade, V3, rng } from './lib/kit.js';

const CELL = 0.048, R = 0.0195, TH = 0.007; // demo board pitch, magnet stone radius / thickness
const C = new THREE.Vector3(0, 1.45, 0); // board centre (the face at z = 0)
const pt = (i, j, z = 0) => new THREE.Vector3(C.x + (i - 9) * CELL, C.y + (9 - j) * CELL, z);

function boardTexture() {
  const N = 2048, cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, N, N);
  g.addColorStop(0, '#e2c48e');
  g.addColorStop(1, '#d6b47c');
  c.fillStyle = g;
  c.fillRect(0, 0, N, N);
  // a faint printed wood figure
  const Rn = rng(5);
  for (let k = 0; k < 260; k++) {
    c.strokeStyle = `rgba(150,100,50,${0.03 + Rn() * 0.05})`;
    c.lineWidth = 1 + Rn() * 3;
    const x = Rn() * N;
    c.beginPath();
    c.moveTo(x, 0);
    c.bezierCurveTo(x + (Rn() - 0.5) * 60, N * 0.33, x + (Rn() - 0.5) * 60, N * 0.66, x + (Rn() - 0.5) * 40, N);
    c.stroke();
  }
  const S = 1.0; // board face size (m)
  const u = (x) => (x / S + 0.5) * N;
  c.strokeStyle = 'rgba(25,18,10,0.9)';
  for (let k = 0; k < 19; k++) {
    c.lineWidth = k === 0 || k === 18 ? 5 : 3;
    const a = u((k - 9) * CELL), b0 = u(-9 * CELL), b1 = u(9 * CELL);
    c.beginPath(); c.moveTo(a, b0); c.lineTo(a, b1); c.stroke();
    c.beginPath(); c.moveTo(b0, a); c.lineTo(b1, a); c.stroke();
  }
  c.fillStyle = 'rgba(25,18,10,0.95)';
  for (const i of [3, 9, 15]) for (const j of [3, 9, 15]) { c.beginPath(); c.arc(u((i - 9) * CELL), u((j - 9) * CELL), 9, 0, Math.PI * 2); c.fill(); }
  // coordinates along the edges
  c.fillStyle = 'rgba(40,28,16,0.85)';
  c.font = '600 30px "JetBrains Mono", monospace';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const L = 'ABCDEFGHJKLMNOPQRST';
  for (let k = 0; k < 19; k++) {
    c.fillText(L[k], u((k - 9) * CELL), u(-9.75 * CELL));
    c.fillText(L[k], u((k - 9) * CELL), u(9.75 * CELL));
    c.fillText(String(19 - k), u(-9.8 * CELL), u((k - 9) * CELL));
    c.fillText(String(19 - k), u(9.8 * CELL), u((k - 9) * CELL));
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// thumb pad against the index and middle pads across the stone's rim
function solveRim(h, gap) {
  const make = ([fi, tc, tm, ti, tr]) => ({
    ring: [0.9, 1.1, 0.6], little: [1.0, 1.15, 0.6], index: [fi * 0.8, fi * 0.9, fi * 0.5], middle: [fi * 0.85 + 0.05, fi + 0.05, fi * 0.5],
    thumb: [tc, tm, ti], thumbRoll: tr, spread: { index: -0.03, middle: 0.03, ring: 0.06, little: 0.1 },
  });
  const cost = (x) => {
    setPose(h, make(x));
    const tP = fingerPoint(h, 'f1_3', -1, 0.006).p;
    const fP = fingerPoint(h, 'f2_3', -1, 0.0055).p.lerp(fingerPoint(h, 'f3_3', -1, 0.0055).p, 0.5);
    return (tP.distanceTo(fP) - gap) ** 2;
  };
  let best = null;
  for (let fi = 0.1; fi <= 0.91; fi += 0.1)
    for (let tc = 0; tc <= 0.81; tc += 0.2)
      for (let tm = 0; tm <= 0.61; tm += 0.2)
        for (let ti = 0; ti <= 0.41; ti += 0.2)
          for (let tr = 0.2; tr <= 1.21; tr += 0.25) {
            const x = [fi, tc, tm, ti, tr], c = cost(x);
            if (!best || c < best.c) best = { x, c };
          }
  setPose(h, make(best.x));
  return make(best.x);
}

export async function create({ renderer, scale, p, cues, dur }) {
  const st = new Studio({ scale, renderer });
  await st.hdri('../assets/hdri/studio_small_09_2k.hdr', { intensity: p.env ?? 0.12, rotation: 2.2 });
  st.scene.background = new THREE.Color(0x05070b);
  // the board on its frame
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 0.02), [
    ...Array(4).fill(new THREE.MeshPhysicalMaterial({ color: 0x2a2420, roughness: 0.5 })),
    new THREE.MeshPhysicalMaterial({ map: boardTexture(), roughness: 0.55, clearcoat: 0.15, clearcoatRoughness: 0.5 }),
    new THREE.MeshPhysicalMaterial({ color: 0x2a2420, roughness: 0.5 }),
  ]);
  board.position.set(C.x, C.y, -0.01);
  board.receiveShadow = true;
  st.scene.add(board);
  const frameMat = new THREE.MeshPhysicalMaterial({ color: 0x15171b, roughness: 0.35, metalness: 0.6 });
  for (const [w, h, x, y] of [[1.06, 0.03, 0, 0.515], [1.06, 0.03, 0, -0.515], [0.03, 1.06, 0.515, 0], [0.03, 1.06, -0.515, 0]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), frameMat);
    m.position.set(C.x + x, C.y + y, -0.01);
    m.castShadow = m.receiveShadow = true;
    st.scene.add(m);
  }
  // magnet stones: flat discs with a rounded rim
  const prof = [[0, -TH / 2], [R - 0.002, -TH / 2], [R, -TH / 2 + 0.002], [R, TH / 2 - 0.0015], [R - 0.0025, TH / 2], [0, TH / 2 + 0.0004]];
  const sGeo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 48);
  sGeo.rotateX(Math.PI / 2); // axis along z, face toward +z
  const black = new THREE.MeshPhysicalMaterial({ color: 0x111214, roughness: 0.28, clearcoat: 0.5, clearcoatRoughness: 0.2 });
  const white = new THREE.MeshPhysicalMaterial({ color: 0xf1eee8, roughness: 0.3, clearcoat: 0.4, clearcoatRoughness: 0.2 });
  const moves = await gameMoves();
  for (const s of position(moves, 36)) {
    const m = new THREE.Mesh(sGeo, s.c === 'B' ? black : white);
    m.position.copy(pt(s.i, s.j, TH / 2));
    m.castShadow = m.receiveShadow = true;
    st.scene.add(m);
  }
  const stone = new THREE.Mesh(sGeo, black);
  stone.castShadow = stone.receiveShadow = true;
  st.scene.add(stone);

  // the commentator's hand: rim grip; palm toward the board, fingers up and to the left, arm from lower right
  const h = await loadHand(st);
  h.holder.add(buildSleeve(st, { suit: 0x1b2433, dir: new THREE.Vector3(0.0, 0.1, 1) }));
  st.scene.add(h.holder);
  const qBase = new THREE.Quaternion().setFromAxisAngle(V3(0, 0, 1), 0.75).multiply(new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), Math.PI / 2 - 0.25));
  h.holder.quaternion.copy(qBase);
  h.holder.position.set(0, 0, 0);
  const grip = solveRim(h, 2 * R + 0.002);
  h.holder.updateMatrixWorld(true);
  const tP = fingerPoint(h, 'f1_3', -1, 0.006).p, fP = fingerPoint(h, 'f2_3', -1, 0.0055).p.lerp(fingerPoint(h, 'f3_3', -1, 0.0055).p, 0.5);
  const mid = tP.clone().lerp(fP, 0.5);
  const palmN = V3(0, -1, 0).applyQuaternion(qBase); // the stone's face is parallel to the palm
  const target = pt(14, 9, TH / 2);
  // stone pose relative to the hand (fixed for the shot)
  const offsetLocal = mid.clone(); // in holder space at the origin
  const stoneQ = new THREE.Quaternion().setFromUnitVectors(V3(0, 0, -1), palmN);

  const keyL = spot(0xeef3ff, p.key ?? 12, { pos: [-1.2, 2.6, 2.2], target: [0.2, 1.4, 0], angle: 0.35, penumbra: 0.8, radius: 5, near: 1, far: 6 });
  const warm = spot(0xffd2a8, p.warm ?? 6, { pos: [1.6, 1.6, 1.6], target: [0.4, 1.4, 0], angle: 0.4, penumbra: 1, shadow: 0 });
  st.scene.add(keyL, keyL.target, warm, warm.target);
  // the studio beyond: out-of-focus practicals
  const Rn = rng(9);
  for (let k = 0; k < 14; k++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.02 + Rn() * 0.03, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(0.58 + Rn() * 0.08, 0.6, 0.55 + Rn() * 0.2) }));
    m.position.set((Rn() - 0.5) * 6, 0.6 + Rn() * 2.2, -1.5 - Rn() * 3);
    st.scene.add(m);
  }

  grade(st, { ao: { radius: 0.03, intensity: 1.5 }, dof: { distance: 1, range: p.range ?? 0.12, bokeh: 4 }, bloom: { intensity: 0.35, threshold: 0.85 }, vignette: 0.7, contrast: 0.16, exposure: p.exposure ?? 0.9 });

  const tStrange = cues.strange ?? 1.8, tPlace = cues.place ?? tStrange + 1.6, tMistake = cues.mistake ?? dur * 0.75;
  const away = V3(0.24, -0.16, 0.26), hover = V3(0.03, -0.012, 0.045);
  return {
    studio: st,
    update(t) {
      // the hand's path: in from the lower right, a stop just short of the board, small hesitant drifts, then on
      let off;
      if (t < tPlace) {
        const a = ss(clamp(t / Math.max(0.8, tStrange - 0.2)));
        const hes = sstep(tStrange - 0.4, tStrange + 0.4, t) * (1 - sstep(tPlace - 0.5, tPlace - 0.05, t));
        off = away.clone().lerp(hover, a).add(V3(0.006 * Math.sin(t * 2.1), 0.004 * Math.sin(t * 1.4 + 1), 0.01 * hes * Math.sin(t * 1.7)));
        off.lerp(V3(0, 0, 0.0), sstep(tPlace - 0.45, tPlace, t));
      } else {
        const r = ss(clamp((t - tPlace - 0.35) / 1.2));
        off = V3(0, 0, 0).lerp(away.clone().multiplyScalar(1.3), r);
      }
      const holding = t < tPlace + 0.3;
      // place the holder so the grip's centre is at target + off
      h.holder.position.copy(target).add(off).sub(offsetLocal);
      const open = sstep(tPlace + 0.05, tPlace + 0.3, t);
      if (open > 0) setPose(h, { ...grip, thumb: grip.thumb.map((v) => v - 0.25 * open), index: grip.index.map((v) => v - 0.15 * open), middle: grip.middle.map((v) => v - 0.15 * open) });
      else setPose(h, grip);
      h.holder.updateMatrixWorld(true);
      stone.position.copy(holding ? target.clone().add(off) : target);
      if (!holding || t >= tPlace) stone.position.copy(target);
      stone.quaternion.copy(t >= tPlace ? new THREE.Quaternion() : stoneQ.clone().slerp(new THREE.Quaternion(), sstep(tPlace - 0.5, tPlace, t)));
      // camera: medium on the stone's corner of the board, pushing in through the silence
      const r = ss(clamp(t / dur));
      const k2 = sstep(tPlace + 0.5, dur, t);
      const kk = k2 * 0.6 + r * 0.4;
      const pos = V3(lerp(-0.22, 0.02, kk), lerp(1.36, 1.42, kk), lerp(1.0, 0.6, kk));
      const look = V3(lerp(0.3, 0.25, kk), lerp(1.43, 1.45, kk), 0);
      const b = breathe(t, 0.0025, 4);
      st.camera.position.set(pos.x + b[0], pos.y + b[1], pos.z + b[2]);
      st.camera.lookAt(look);
      if (st.camera.fov !== 30) { st.camera.fov = 30; st.camera.updateProjectionMatrix(); }
      if (st.dof) st.dof.target = stone.position.clone();
    },
  };
}
