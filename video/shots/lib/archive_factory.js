// The first industrial robot at work, 1961: a Unimate (hydraulic "polar" arm: a boxy base cabinet, a turret that
// swings, an arm housing that pitches, a square steel boom that telescopes out of it, a wrist and a two-finger
// gripper) tending a horizontal cold-chamber die-casting machine (bed, stationary and moving platens, four tie bars,
// the die halves, the shot end), with a glowing casting, a quench tank and a dim, hazy factory around it.
// World: machine axis along x, die parting plane at x = 0, die centre at y = DIE.y, operator side toward +z.
import { THREE } from '../../engine2/core.js';
import { Parts, mat4, rod, bentPath, boxUV, scaleUV, RoundedBoxGeometry, canvas, canvasTex, noise2, fbm, puffTexture, V } from './archive_util.js';
import { rng, clamp, lerp, ss } from './kit.js';

export const DIE = { y: 1.25, open: 0.75, eject: 0.08 };
// the Unimate stands on the operator side; at swing 0 its arm points along -z, into the open die
export const UNI = { at: V(DIE.open - DIE.eject - 0.012, 0, 2.25), BH: 0.9, pivot: 0.3, house: 0.95, wrist: 0.08, hand: 0.31 };

// ---------------------------------------------------------------- materials

// a pressure gauge dial: ticks, numerals, a needle (seen at an angle, never read)
function gaugeTexture() {
  const n = 256;
  const c = canvas(n, n);
  const g = c.getContext('2d');
  g.fillStyle = '#e8e2d2';
  g.fillRect(0, 0, n, n);
  g.translate(n / 2, n / 2);
  g.strokeStyle = '#1c1c1c';
  for (let k = 0; k <= 40; k++) {
    const a = -Math.PI * 1.25 + (k / 40) * Math.PI * 1.5;
    g.lineWidth = k % 5 ? 2 : 4;
    g.beginPath();
    g.moveTo(Math.cos(a) * 100, Math.sin(a) * 100);
    g.lineTo(Math.cos(a) * (k % 5 ? 88 : 80), Math.sin(a) * (k % 5 ? 88 : 80));
    g.stroke();
  }
  g.fillStyle = '#1c1c1c';
  g.font = '600 22px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let k = 0; k <= 8; k++) {
    const a = -Math.PI * 1.25 + (k / 8) * Math.PI * 1.5;
    g.fillText(String(k * 250), Math.cos(a) * 62, Math.sin(a) * 62);
  }
  g.strokeStyle = '#7a1a12';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(Math.cos(-0.3) * 92, Math.sin(-0.3) * 92);
  g.stroke();
  g.fillStyle = '#222';
  g.beginPath();
  g.arc(0, 0, 10, 0, Math.PI * 2);
  g.fill();
  return canvasTex(c);
}

// a grime multiplier: soft dark blotches and fine speckle, darker toward the texture's bottom edge
function grimeTexture(seed = 8) {
  const n = 512;
  const nz = noise2(seed);
  const c = canvas(n, n);
  const g = c.getContext('2d');
  const img = g.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const f = fbm(nz, x / 70, y / 70, 4, 16);
    const sp = fbm(nz, x / 3 + 11, y / 3, 2, 64);
    const v = 255 * Math.min(1, 0.8 + 0.28 * f - 0.08 * Math.max(0, sp - 0.6) * 4 - 0.1 * (y / n) ** 3);
    const i = (y * n + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return canvasTex(c);
}

export function factoryMaterials(st) {
  const M = (o) => new THREE.MeshPhysicalMaterial(o);
  const grime = grimeTexture();
  const worn = st.pbr('Metal055A', { repeat: [2, 2] });
  const brushed = st.pbr('Metal032', { repeat: [2, 6] });
  return {
    // Unimate: dark blue-grey enamel, bare steel boom, black hoses
    paint: M({ map: grime, color: 0x4f5f70, metalness: 0.3, roughness: 0.42, roughnessMap: worn.roughnessMap, clearcoat: 0.3, clearcoatRoughness: 0.45 }),
    paintDark: M({ color: 0x2c343c, metalness: 0.3, roughness: 0.5 }),
    trim: M({ color: 0x8c949a, metalness: 0.9, roughness: 0.35 }),
    boom: M({ color: 0xc9ced2, metalness: 1, roughness: 0.2, roughnessMap: brushed.roughnessMap, normalMap: brushed.normalMap, normalScale: new THREE.Vector2(0.25, 0.25) }),
    steel: M({ color: 0xaab0b5, metalness: 1, roughness: 0.32 }),
    darkSteel: M({ color: 0x5a6066, metalness: 1, roughness: 0.42, roughnessMap: worn.roughnessMap }),
    hose: M({ color: 0x141414, roughness: 0.55 }),
    rubber: M({ color: 0x0f0f10, roughness: 0.8 }),
    button: M({ color: 0x1b1b1b, roughness: 0.4 }),
    lampR: M({ color: 0x6a1410, emissive: 0xff2a10, emissiveIntensity: 0.6, roughness: 0.3 }),
    lampG: M({ color: 0x14401c, emissive: 0x30ff60, emissiveIntensity: 0.3, roughness: 0.3 }),
    lampW: M({ color: 0x8a8a7a, emissive: 0xfff2c0, emissiveIntensity: 0.4, roughness: 0.3 }),
    plate: M({ color: 0xb8b29a, metalness: 0.6, roughness: 0.35 }),
    // die-casting machine: machine green-grey, chrome tie bars, tool steel dies
    machine: M({ map: grime, color: 0x58655d, metalness: 0.35, roughness: 0.5, roughnessMap: worn.roughnessMap, clearcoat: 0.2, clearcoatRoughness: 0.5 }),
    machineDark: M({ color: 0x2e3532, metalness: 0.35, roughness: 0.55 }),
    chrome: M({ color: 0xd8dde0, metalness: 1, roughness: 0.12 }),
    die: M({ ...worn, color: 0x8a8c8c, metalness: 0.7, roughness: 0.78 }),
    dieFace: M({ color: 0x4c4945, metalness: 0.6, roughness: 0.8 }),
    oily: M({ color: 0x1a1816, metalness: 0.2, roughness: 0.25, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    gauge: M({ map: gaugeTexture(), color: 0xd8d2c2, roughness: 0.35 }),
    glass: M({ color: 0x111316, roughness: 0.05, metalness: 0.1, clearcoat: 1, transparent: true, opacity: 0.35 }),
    yellow: M({ color: 0xa88a2a, roughness: 0.55 }),
    tank: M({ color: 0x3a3f3c, metalness: 0.4, roughness: 0.55, roughnessMap: worn.roughnessMap }),
    water: M({ color: 0x1c2122, roughness: 0.12, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.08 }),
    // the glowing casting: emissive set per frame from its temperature
    hot: glowShading(new THREE.MeshStandardMaterial({ ...hotTextures(), color: 0xffffff, metalness: 0.4, roughness: 0.55, emissive: 0xff5a14, emissiveIntensity: 2 })),
  };
}

// ---------------------------------------------------------------- the casting (door handle + runner + biscuit)

// local frame: lies in the y/z plane (the die's parting plane), its cavity side toward +x; origin at the gripper's
// grasp point (the sprue stub at its near end). A small cast housing: a walled cup with a flange, corner bosses and
// ribs, as it comes out of the die.
export function castingGeometry() {
  const P = new Parts();
  const zc = -0.13, yc = 0.02; // centre of the housing
  const L = 0.17, Hh = 0.11, D = 0.055, t = 0.012;
  // floor (toward -x) and four walls rising toward +x
  P.add('hot', new RoundedBoxGeometry(t, Hh, L, 2, 0.004), mat4([-D / 2 + t / 2, yc, zc]));
  P.add('hot', new RoundedBoxGeometry(D, t, L, 2, 0.004), mat4([0, yc + Hh / 2 - t / 2, zc]));
  P.add('hot', new RoundedBoxGeometry(D, t, L, 2, 0.004), mat4([0, yc - Hh / 2 + t / 2, zc]));
  P.add('hot', new RoundedBoxGeometry(D, Hh, t, 2, 0.004), mat4([0, yc, zc + L / 2 - t / 2]));
  P.add('hot', new RoundedBoxGeometry(D, Hh, t, 2, 0.004), mat4([0, yc, zc - L / 2 + t / 2]));
  // flange around the open rim, with four bosses
  P.add('hot', new RoundedBoxGeometry(0.01, Hh + 0.04, L + 0.04, 2, 0.004), mat4([D / 2 - 0.005, yc, zc]));
  for (const sy of [-1, 1]) for (const sz of [-1, 1]) P.cyl('hot', 0.012, 0.013, 0.03, [D / 2 - 0.012, yc + sy * (Hh / 2 + 0.01), zc + sz * (L / 2 + 0.01)], { rot: [0, 0, Math.PI / 2], seg: 16 });
  // ribs on the outside of the floor, and a boss in the middle
  for (const z of [-0.05, 0, 0.05]) P.box('hot', [0.012, Hh - 0.02, 0.008], [-D / 2 - 0.005, yc, zc + z]);
  P.cyl('hot', 0.02, 0.022, 0.02, [-D / 2 - 0.01, yc, zc], { rot: [0, 0, Math.PI / 2], seg: 20 });
  // the sprue stub the gripper holds, broken off its runner
  P.add('hot', new RoundedBoxGeometry(0.022, 0.032, 0.07, 2, 0.005), mat4([0, 0, -0.01]));
  P.add('hot', new RoundedBoxGeometry(0.03, 0.04, 0.025, 2, 0.006), mat4([0, 0.005, -0.045]));
  return P;
}

// make an emissive material cooler at grazing angles (thin edges radiate faster): gives a hot part its volume
export function glowShading(m, edge = 0.3) {
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance *= mix(${edge.toFixed(3)}, 1.0, pow(clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 0.8));`);
  };
  m.customProgramCacheKey = () => `glow${edge}`;
  return m;
}

// the glow of hot metal: an orange field broken by darker oxide scale (emissive map), and a dark crust albedo
export function hotTextures(seed = 3) {
  const n = 256;
  const nz = noise2(seed);
  const e = canvas(n, n), c = canvas(n, n);
  const ge = e.getContext('2d'), gc = c.getContext('2d');
  const ie = ge.createImageData(n, n), ic = gc.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const f = fbm(nz, x / 12, y / 12, 4, 64);
    const g = fbm(nz, x / 6 + 30, y / 6, 2, 64);
    const scale = clamp((f - 0.5) * 3); // oxide patches
    const k = (1 - 0.28 * scale) * (0.94 + 0.12 * g);
    const i = (y * n + x) * 4;
    ie.data[i] = 255 * Math.min(1, k);
    ie.data[i + 1] = 255 * Math.min(1, k * 0.95);
    ie.data[i + 2] = 255 * Math.min(1, k * 0.9);
    ie.data[i + 3] = 255;
    const a = 40 + 30 * scale + 20 * g;
    ic.data[i] = a;
    ic.data[i + 1] = a * 0.92;
    ic.data[i + 2] = a * 0.85;
    ic.data[i + 3] = 255;
  }
  ge.putImageData(ie, 0, 0);
  gc.putImageData(ic, 0, 0);
  return { emissiveMap: canvasTex(e, { repeat: [3, 1] }), map: canvasTex(c, { repeat: [3, 1] }) };
}

// ---------------------------------------------------------------- Unimate

function hoseCurve(a, b, sagD, n = 16) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    pts.push(new THREE.Vector3(lerp(a.x, b.x, u), lerp(a.y, b.y, u) - sagD * 4 * u * (1 - u), lerp(a.z, b.z, u)));
  }
  return new THREE.CatmullRomCurve3(pts);
}

export function buildUnimate(st, mats) {
  const root = new THREE.Group();
  const { BH } = UNI;
  // ---- base cabinet (behind the turret, along +z)
  const B = new Parts();
  const bw = 1.05, bl = 1.6, bz0 = -0.45; // turret axis 0.45 from the cabinet's front edge
  B.box('paint', [bw, BH - 0.08, bl], [0, 0.08 + (BH - 0.08) / 2, bz0 + bl / 2], { bevel: 0.02 });
  B.box('paintDark', [bw - 0.06, 0.08, bl - 0.06], [0, 0.04, bz0 + bl / 2]);
  // panel seams and access doors
  for (const s of [-1, 1]) {
    for (const [zc, L] of [[bz0 + 0.42, 0.66], [bz0 + 1.18, 0.7]]) {
      B.box('paintDark', [0.004, 0.58, 0.006], [s * (bw / 2 + 0.001), 0.48, zc - L / 2]);
      B.box('paintDark', [0.004, 0.58, 0.006], [s * (bw / 2 + 0.001), 0.48, zc + L / 2]);
      B.box('paintDark', [0.004, 0.006, L], [s * (bw / 2 + 0.001), 0.77, zc]);
      B.box('paintDark', [0.004, 0.006, L], [s * (bw / 2 + 0.001), 0.19, zc]);
      B.box('trim', [0.012, 0.09, 0.025], [s * (bw / 2 + 0.006), 0.5, zc + L / 2 - 0.06], { bevel: 0.004 });
    }
    // louvres
    for (let k = 0; k < 9; k++) B.box('paintDark', [0.012, 0.012, 0.42], [s * (bw / 2 + 0.004), 0.27 + k * 0.045, bz0 + 1.18], { rot: [0, 0, s * 0.5] });
  }
  // the control panel on the +x side: lamps and push buttons in rows, a key switch, a nameplate
  const cpz = bz0 + 0.42;
  B.box('paintDark', [0.03, 0.34, 0.5], [bw / 2 + 0.015, 0.62, cpz], { bevel: 0.006 });
  const RB = rng(19);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 7; c++) {
    const lamp = r === 0;
    const key = lamp ? (RB() < 0.3 ? 'lampR' : RB() < 0.5 ? 'lampG' : 'lampW') : 'button';
    B.cyl(key, 0.014, 0.014, 0.02, [bw / 2 + 0.035, 0.74 - r * 0.07, cpz - 0.18 + c * 0.06], { rot: [0, 0, Math.PI / 2], seg: 16 });
    if (!lamp) B.cyl('trim', 0.018, 0.018, 0.008, [bw / 2 + 0.028, 0.74 - r * 0.07, cpz - 0.18 + c * 0.06], { rot: [0, 0, Math.PI / 2], seg: 16 });
  }
  B.box('plate', [0.004, 0.06, 0.26], [bw / 2 + 0.002, 0.84, bz0 + 1.12]);
  // hydraulic lines from the cabinet up to the turret, at the back
  B.tube('hose', [V(0.25, BH - 0.02, 0.4), V(0.27, BH + 0.08, 0.25), V(0.2, BH + 0.12, 0.12)], 0.016, { seg: 20, rseg: 10 });
  B.tube('hose', [V(0.32, BH - 0.02, 0.45), V(0.33, BH + 0.09, 0.3), V(0.25, BH + 0.1, 0.16)], 0.016, { seg: 20, rseg: 10 });
  // the turret ring on top of the cabinet
  B.cyl('paintDark', 0.4, 0.42, 0.06, [0, BH + 0.03, 0], { seg: 64 });
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    B.cyl('trim', 0.012, 0.012, 0.012, [Math.cos(a) * 0.38, BH + 0.066, Math.sin(a) * 0.38], { seg: 6 });
  }
  root.add(B.build(mats));

  // ---- swing: the shoulder housing (rotates about y)
  const swingG = new THREE.Group();
  swingG.position.set(0, BH + 0.06, 0);
  root.add(swingG);
  const S = new Parts();
  S.cyl('paint', 0.37, 0.37, 0.1, [0, 0.05, 0], { seg: 64 });
  S.add('paint', new RoundedBoxGeometry(0.42, 0.2, 0.58, 3, 0.05), mat4([0, 0.15, 0.08]));
  // the yoke: two rounded arms carrying the pitch bearings
  for (const s of [-1, 1]) {
    S.add('paint', new RoundedBoxGeometry(0.06, 0.34, 0.26, 3, 0.025), mat4([s * 0.17, 0.3, -0.05]));
    S.cyl('paint', 0.13, 0.13, 0.06, [s * 0.17, UNI.pivot, -0.05], { rot: [0, 0, Math.PI / 2], seg: 40 });
    S.cyl('trim', 0.075, 0.075, 0.075, [s * 0.172, UNI.pivot, -0.05], { rot: [0, 0, Math.PI / 2], seg: 32 });
    S.cyl('paintDark', 0.045, 0.045, 0.085, [s * 0.172, UNI.pivot, -0.05], { rot: [0, 0, Math.PI / 2], seg: 24 });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      S.cyl('steel', 0.008, 0.008, 0.01, [s * 0.205, UNI.pivot + Math.cos(a) * 0.1, -0.05 + Math.sin(a) * 0.1], { rot: [0, 0, Math.PI / 2], seg: 6 });
    }
  }
  // the pitch cylinder (a hydraulic ram from the shoulder to the arm's tail)
  S.cyl('darkSteel', 0.05, 0.05, 0.22, [0, 0.16, 0.3], { rot: [0.5, 0, 0], seg: 24 });
  swingG.add(S.build(mats));

  // ---- pitch: the arm housing
  const pitchG = new THREE.Group();
  pitchG.position.set(0, UNI.pivot, -0.05);
  swingG.add(pitchG);
  const A = new Parts();
  const hw = 0.27, hh = 0.3, hz0 = 0.55, hz1 = -UNI.house;
  A.box('paint', [hw, hh, hz0 - hz1], [0, 0, (hz0 + hz1) / 2], { bevel: 0.018 });
  A.box('paintDark', [hw + 0.006, hh + 0.006, 0.02], [0, 0, hz1 + 0.04], { bevel: 0.004 }); // front collar
  A.box('trim', [0.2, 0.004, 0.6], [0, hh / 2 + 0.002, -0.3]); // top cover
  for (let k = 0; k < 8; k++) for (const s of [-1, 1]) A.cyl('steel', 0.008, 0.008, 0.006, [s * 0.088, hh / 2 + 0.005, -0.58 + k * 0.08], { seg: 6 });
  // tail: the hydraulic manifold block with fittings
  A.box('darkSteel', [0.24, 0.24, 0.14], [0, 0, hz0 + 0.07], { bevel: 0.01 });
  for (let k = 0; k < 4; k++) A.cyl('steel', 0.016, 0.016, 0.05, [-0.07 + k * 0.047, 0.08, hz0 + 0.16], { rot: [Math.PI / 2, 0, 0], seg: 6 });
  // hoses running forward along the housing's side in clips
  for (const s of [0.07, 0.11]) A.tube('hose', [V(hw / 2 + 0.02, s - 0.05, hz0 + 0.12), V(hw / 2 + 0.03, s - 0.04, 0.2), V(hw / 2 + 0.03, s - 0.04, -0.5), V(hw / 2 + 0.03, s - 0.03, hz1 + 0.08)], 0.014, { seg: 40, rseg: 10 });
  for (let k = 0; k < 4; k++) A.box('trim', [0.03, 0.09, 0.025], [hw / 2 + 0.018, 0.04, 0.3 - k * 0.32]);
  // a label plate
  A.box('plate', [0.004, 0.08, 0.3], [-hw / 2 - 0.002, 0, -0.2]);
  pitchG.add(A.build(mats));

  // ---- the telescoping boom
  const extG = new THREE.Group();
  pitchG.add(extG);
  const E = new Parts();
  const bs = 0.15, blen = 1.2;
  E.box('boom', [bs, bs, blen], [0, 0, blen / 2], { bevel: 0.008 }); // its front end at z = 0 (in extG)
  E.box('darkSteel', [bs + 0.01, bs + 0.01, 0.06], [0, 0, 0.03], { bevel: 0.006 });
  extG.add(E.build(mats));

  // ---- wrist: bend (about x), swivel (about z), hand with two fingers that close along x
  const bendG = new THREE.Group();
  bendG.position.set(0, 0, -0.08);
  extG.add(bendG);
  const W = new Parts();
  W.box('darkSteel', [0.17, 0.17, 0.06], [0, 0, 0.05], { bevel: 0.01 });
  W.cyl('steel', 0.085, 0.085, 0.2, [0, 0, 0], { rot: [0, 0, Math.PI / 2], seg: 40 });
  W.cyl('darkSteel', 0.06, 0.06, 0.22, [0, 0, 0], { rot: [0, 0, Math.PI / 2], seg: 32 });
  for (const s of [-1, 1]) for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    W.cyl('steel', 0.007, 0.007, 0.01, [s * 0.105, Math.cos(a) * 0.065, Math.sin(a) * 0.065], { rot: [0, 0, Math.PI / 2], seg: 6 });
  }
  bendG.add(W.build(mats));
  const swivelG = new THREE.Group();
  bendG.add(swivelG);
  const H = new Parts();
  const ZX = [Math.PI / 2, 0, 0];
  // the swivel drum: turned steel with grooves, a flange and its bolt circle
  H.cyl('steel', 0.07, 0.07, 0.07, [0, 0, -0.1], { rot: ZX, seg: 40 });
  for (let k = 0; k < 3; k++) H.cyl('darkSteel', 0.0712, 0.0712, 0.004, [0, 0, -0.08 - k * 0.016], { rot: ZX, seg: 40 });
  H.cyl('darkSteel', 0.08, 0.08, 0.012, [0, 0, -0.066], { rot: ZX, seg: 40 });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    H.cyl('steel', 0.0055, 0.0055, 0.008, [Math.cos(a) * 0.064, Math.sin(a) * 0.064, -0.058], { rot: ZX, seg: 6 });
  }
  // the palm: a machined block, cap screws on its face, a T-rail the jaws ride on
  H.add('darkSteel', new RoundedBoxGeometry(0.22, 0.13, 0.06, 2, 0.008), mat4([0, 0, -0.165]));
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    H.cyl('steel', 0.007, 0.007, 0.006, [sx * 0.088, sy * 0.048, -0.197], { rot: ZX, seg: 16 });
    H.cyl('rubber', 0.003, 0.003, 0.0065, [sx * 0.088, sy * 0.048, -0.197], { rot: ZX, seg: 6 });
  }
  H.box('steel', [0.24, 0.045, 0.018], [0, 0, -0.204], { bevel: 0.003 });
  // the grip cylinder across the top, its end caps, fittings and hoses
  H.cyl('darkSteel', 0.026, 0.026, 0.16, [0, 0.088, -0.16], { rot: [0, 0, Math.PI / 2], seg: 24 });
  for (const sx of [-1, 1]) {
    H.cyl('steel', 0.031, 0.031, 0.014, [sx * 0.082, 0.088, -0.16], { rot: [0, 0, Math.PI / 2], seg: 24 });
    H.cyl('steel', 0.009, 0.009, 0.022, [sx * 0.055, 0.118, -0.16], { seg: 6 });
    H.tube('hose', [V(sx * 0.055, 0.128, -0.16), V(sx * 0.06, 0.15, -0.11), V(sx * 0.07, 0.13, -0.03), V(sx * 0.07, 0.1, 0.02)], 0.007, { seg: 20, rseg: 8 });
  }
  swivelG.add(H.build(mats));
  const fingers = [];
  for (const s of [-1, 1]) {
    const f = new THREE.Group();
    const F = new Parts();
    F.add('steel', new RoundedBoxGeometry(0.046, 0.075, 0.034, 2, 0.005), mat4([0, 0, -0.23]));
    for (const sy of [-1, 1]) F.cyl('darkSteel', 0.0055, 0.0055, 0.005, [0, sy * 0.022, -0.2485], { rot: ZX, seg: 12 });
    // the jaw: a tapered steel finger
    const jaw = new THREE.BoxGeometry(0.026, 0.06, 0.13, 1, 1, 6);
    const jp = jaw.attributes.position;
    for (let i = 0; i < jp.count; i++) {
      const u = (0.065 - jp.getZ(i)) / 0.13; // 0 at the root, 1 at the tip
      jp.setY(i, jp.getY(i) * lerp(1, 0.55, u));
    }
    jaw.computeVertexNormals();
    F.add('steel', jaw, mat4([s * 0.004, 0, -0.31]));
    // hardened jaw insert, serrated, facing the other finger
    F.box('darkSteel', [0.006, 0.036, 0.08], [-s * 0.0115, 0, -0.33]);
    for (let k = 0; k < 9; k++) F.box('darkSteel', [0.004, 0.034, 0.003], [-s * 0.0155, 0, -0.296 - k * 0.0085]);
    F.cyl('steel', 0.005, 0.005, 0.03, [s * 0.004, 0, -0.33], { rot: [0, 0, Math.PI / 2], seg: 12 });
    f.add(F.build(mats));
    swivelG.add(f);
    fingers.push([f, s]);
  }

  // hydraulic hoses from the housing front to the wrist: rebuilt when the boom moves
  let hoses = null, hoseKey = null;
  const buildHoses = (ext) => {
    if (hoses) {
      pitchG.remove(hoses);
      hoses.traverse((o) => o.geometry && o.geometry.dispose());
    }
    hoses = new THREE.Group();
    for (const [dx, dy] of [[0.11, 0.0], [0.13, -0.05]]) {
      const a = V(dx + 0.04, dy + 0.03, -UNI.house + 0.06);
      const b = V(0.07, dy + 0.06, -UNI.house - ext - 0.08);
      const c = hoseCurve(a, b, 0.05 + 0.12 * clamp(1 - ext / 0.9), 18);
      const m = new THREE.Mesh(new THREE.TubeGeometry(c, 30, 0.012, 8), mats.hose);
      m.castShadow = true;
      hoses.add(m);
    }
    pitchG.add(hoses);
  };

  const grasp = V(0, 0, -0.31); // in swivelG: between the jaws
  return {
    group: root,
    swingG, pitchG, extG, bendG, swivelG, fingers,
    // the arm's moving parts, for ghost copies
    armRoot: swingG,
    // swing (rad, about y; 0 = arm along -z), pitch (rad, + = nose up), ext (m, boom out of the housing),
    // bend (rad, wrist pitch, + = up), swivel (rad), grip (0 = open 0.11 m, 1 = closed on a 0.02 m bar)
    pose({ swing = 0, pitch = 0, ext = 0.2, bend = 0, swivel = 0, grip = 0 } = {}) {
      swingG.rotation.y = swing;
      pitchG.rotation.x = pitch;
      extG.position.z = -UNI.house - ext;
      bendG.rotation.x = bend;
      swivelG.rotation.z = swivel;
      const half = lerp(0.07, 0.011 + 0.0175, clamp(grip));
      for (const [f, s] of fingers) f.position.x = s * half;
      const k = Math.round(ext * 400);
      if (k !== hoseKey) {
        buildHoses(ext);
        hoseKey = k;
      }
    },
    graspWorld(out = V()) {
      swivelG.updateWorldMatrix(true, false);
      return out.copy(grasp).applyMatrix4(swivelG.matrixWorld);
    },
    graspMatrix() {
      swivelG.updateWorldMatrix(true, false);
      return swivelG.matrixWorld.clone().multiply(new THREE.Matrix4().makeTranslation(grasp.x, grasp.y, grasp.z));
    },
  };
}

// solve swing / pitch / ext so the grasp point reaches world point g with the hand level (bend = -pitch)
export function reach(g, { base = UNI.at } = {}) {
  const py = UNI.BH + 0.06 + UNI.pivot;
  let swing = 0, pitch = 0, ext = 0.3;
  for (let it = 0; it < 6; it++) {
    const piv = V(base.x - Math.sin(swing) * 0.05, py, base.z - Math.cos(swing) * 0.05);
    const d0 = g.clone().sub(piv);
    swing = Math.atan2(-d0.x, -d0.z);
    const hz = V(-Math.sin(swing), 0, -Math.cos(swing));
    const bp = g.clone().addScaledVector(hz, -UNI.hand); // the bend axis
    const d = bp.sub(piv);
    const hd = Math.hypot(d.x, d.z);
    pitch = Math.atan2(d.y, hd);
    ext = Math.hypot(hd, d.y) - UNI.house - UNI.wrist;
  }
  return { swing, pitch, ext, bend: -pitch };
}

// ---------------------------------------------------------------- die-casting machine

export function buildDieCaster(st, mats, { detail = true } = {}) {
  const root = new THREE.Group();
  const P = new Parts();
  const Y = DIE.y;
  // bed
  P.box('machine', [4.7, 0.72, 1.3], [0.25, 0.36, 0], { bevel: 0.02 });
  P.box('machineDark', [4.6, 0.08, 1.2], [0.25, 0.04, 0]);
  for (const s of [-1, 1]) P.box('chrome', [3.0, 0.03, 0.08], [1.0, 0.735, s * 0.45]); // ways for the moving platen
  // bed doors and drip tray
  for (let k = 0; k < 4; k++) {
    P.box('machineDark', [0.004, 0.5, 0.004], [-1.6 + k * 1.1, 0.4, 0.651]);
    P.box('trim', [0.12, 0.025, 0.02], [-1.3 + k * 1.1, 0.5, 0.66]);
  }
  P.box('oily', [1.2, 0.02, 1.0], [0.05, 0.725, 0]);
  // stationary platen (x -0.45..-0.15) with its die (cover half) x -0.15..0
  P.box('machine', [0.38, 1.45, 1.55], [-0.34, Y - 0.05, 0], { bevel: 0.02 });
  for (const zz of [-0.4, 0, 0.4]) P.box('machine', [0.2, 1.3, 0.06], [-0.6, Y - 0.05, zz]);
  P.box('die', [0.15, 0.72, 0.82], [-0.075, Y, 0], { bevel: 0.006 });
  P.box('dieFace', [0.004, 0.5, 0.62], [-0.002, Y, 0]);
  // rear platen (x 2.1..2.4) and the clamping cylinder behind it
  P.box('machine', [0.3, 1.45, 1.55], [2.25, Y - 0.05, 0], { bevel: 0.02 });
  P.cyl('machine', 0.32, 0.32, 0.9, [2.85, Y, 0], { rot: [0, 0, Math.PI / 2], seg: 48 });
  P.cyl('machineDark', 0.34, 0.34, 0.06, [2.42, Y, 0], { rot: [0, 0, Math.PI / 2], seg: 48 });
  P.cyl('machineDark', 0.34, 0.34, 0.06, [3.28, Y, 0], { rot: [0, 0, Math.PI / 2], seg: 48 });
  // tie bars and nuts
  for (const yy of [-0.52, 0.52]) for (const zz of [-0.6, 0.6]) {
    P.cyl('chrome', 0.068, 0.068, 3.35, [0.95, Y + yy, zz], { rot: [0, 0, Math.PI / 2], seg: 32 });
    for (const x of [-0.52, 2.47]) P.cyl('darkSteel', 0.12, 0.12, 0.14, [x, Y + yy, zz], { rot: [0, 0, Math.PI / 2], seg: 6 });
  }
  // the shot end: injection cylinder, shot sleeve with its pour hole, an accumulator bottle
  P.cyl('machine', 0.17, 0.17, 1.5, [-1.3, Y - 0.2, 0], { rot: [0, 0, Math.PI / 2], seg: 40 });
  P.cyl('chrome', 0.07, 0.07, 0.5, [-0.6, Y - 0.2, 0], { rot: [0, 0, Math.PI / 2], seg: 24 });
  P.cyl('darkSteel', 0.09, 0.09, 0.3, [-0.55, Y - 0.2, 0], { rot: [0, 0, Math.PI / 2], seg: 24 });
  P.cyl('machine', 0.2, 0.2, 1.1, [-1.5, 1.27, -0.35], { seg: 40 });
  P.add('machine', new THREE.SphereGeometry(0.2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat4([-1.5, 1.82, -0.35]));
  if (detail) {
    // valves, gauges, pipes
    P.box('machineDark', [0.4, 0.3, 0.25], [-1.0, 0.95, 0.45], { bevel: 0.01 });
    P.cyl('trim', 0.07, 0.07, 0.03, [-1.0, 1.0, 0.585], { rot: [Math.PI / 2, 0, 0], seg: 32 });
    P.cyl('gauge', 0.06, 0.06, 0.004, [-1.0, 1.0, 0.6], { rot: [Math.PI / 2, 0, 0], seg: 32 });
    P.tube('darkSteel', [V(-1.5, 0.9, -0.15), V(-1.3, 0.9, 0.2), V(-1.0, 0.85, 0.35)], 0.025, { seg: 20, rseg: 8 });
    P.tube('darkSteel', [V(-1.0, 0.8, 0.4), V(-0.7, 0.78, 0.55), V(-0.42, 0.9, 0.62)], 0.022, { seg: 20, rseg: 8 });
    // the electrical cabinet at the far side
    P.box('machine', [0.9, 1.6, 0.4], [1.3, 0.8, -1.1], { bevel: 0.015 });
    P.box('machineDark', [0.004, 1.4, 0.004], [1.3, 0.8, -0.899]);
  }
  root.add(P.build(mats));

  // the moving platen and its die (ejector half), slide along x
  const mov = new THREE.Group();
  const Mv = new Parts();
  Mv.box('machine', [0.38, 1.45, 1.55], [0.34, Y - 0.05, 0], { bevel: 0.02 });
  Mv.box('die', [0.15, 0.72, 0.82], [0.075, Y, 0], { bevel: 0.006 });
  Mv.box('dieFace', [0.004, 0.5, 0.62], [0.002, Y, 0]);
  // the cavity's runner groove and impression (dark, recessed look)
  Mv.box('oily', [0.004, 0.02, 0.2], [-0.001, Y - 0.03, -0.14]);
  // clamp ram from the rear platen
  Mv.cyl('chrome', 0.1, 0.1, 1.7, [1.3, Y, 0], { rot: [0, 0, Math.PI / 2], seg: 32 });
  Mv.box('darkSteel', [0.25, 0.4, 0.4], [0.5, Y, 0], { bevel: 0.01 });
  // toggle links (a pair above and below the ram)
  for (const s of [-1, 1]) {
    Mv.box('darkSteel', [0.9, 0.08, 0.12], [0.9, Y + s * 0.3, 0]);
    Mv.cyl('steel', 0.05, 0.05, 0.16, [0.45, Y + s * 0.3, 0], { rot: [Math.PI / 2, 0, 0], seg: 20 });
  }
  mov.add(Mv.build(mats));
  root.add(mov);
  return {
    group: root,
    // open: 0..DIE.open (m) — the moving platen's travel
    setOpen(o) {
      mov.position.x = o;
    },
  };
}

// ---------------------------------------------------------------- quench tank

export function buildQuench(mats) {
  const P = new Parts();
  const w = 0.9, d = 0.7, h = 0.62, t = 0.025;
  P.box('tank', [w, 0.04, d], [0, 0.02, 0]);
  P.box('tank', [w, h, t], [0, h / 2, -d / 2 + t / 2]);
  P.box('tank', [w, h, t], [0, h / 2, d / 2 - t / 2]);
  P.box('tank', [t, h, d], [-w / 2 + t / 2, h / 2, 0]);
  P.box('tank', [t, h, d], [w / 2 - t / 2, h / 2, 0]);
  for (const s of [-1, 1]) {
    P.box('tank', [w + 0.04, 0.05, 0.04], [0, h, s * (d / 2)]);
    P.box('tank', [0.04, 0.05, d + 0.04], [s * (w / 2), h, 0]);
  }
  P.box('water', [w - 2 * t, 0.01, d - 2 * t], [0, h - 0.08, 0]);
  return P;
}

// ---------------------------------------------------------------- factory hall

function stainTexture(seed = 21) {
  const n = 1024;
  const c = canvas(n, n);
  const g = c.getContext('2d');
  const R = rng(seed);
  g.clearRect(0, 0, n, n);
  for (let k = 0; k < 60; k++) {
    const x = n / 2 + (R() - 0.5) * n * 0.8, y = n / 2 + (R() - 0.5) * n * 0.8, r = 20 + R() ** 2 * 160;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.12 + 0.3 * R();
    gr.addColorStop(0, `rgba(10,8,6,${a})`);
    gr.addColorStop(0.6, `rgba(14,11,8,${a * 0.6})`);
    gr.addColorStop(1, 'rgba(14,11,8,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(x, y, r, r * (0.5 + R() * 0.5), R() * 3, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildHall(st, mats) {
  const grp = new THREE.Group();
  const conc = st.pbr('Concrete048', { repeat: [10, 10] });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshPhysicalMaterial({ ...conc, color: 0x8a8580, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  grp.add(floor);
  // oil and scale stains around the machines
  const stains = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshStandardMaterial({ map: stainTexture(), transparent: true, roughness: 0.3, metalness: 0, depthWrite: false, color: 0xffffff }));
  stains.rotation.x = -Math.PI / 2;
  stains.position.set(0.6, 0.002, 0.8);
  stains.receiveShadow = true;
  grp.add(stains);
  // faded yellow aisle lines
  const P = new Parts();
  P.box('yellow', [14, 0.002, 0.08], [1, 0.001, 3.4]);
  P.box('yellow', [14, 0.002, 0.08], [1, 0.001, -2.6]);
  // steel columns (I-beams) on a 6 m grid, roof trusses, crane rail
  const I = (x, z, h = 9) => {
    P.box('machineDark', [0.3, h, 0.02], [x, h / 2, z]);
    P.box('machineDark', [0.02, h, 0.3], [x, h / 2, z - 0.15]);
    P.box('machineDark', [0.02, h, 0.3], [x, h / 2, z + 0.15]);
    P.box('machineDark', [0.4, 0.3, 0.4], [x, 0.15, z]);
  };
  for (const x of [-6, 0, 6, 12]) for (const z of [-5, 7]) I(x, z);
  for (const x of [-6, 0, 6, 12]) {
    P.box('machineDark', [0.2, 0.5, 12.4], [x, 8.8, 1]);
    for (let k = 0; k < 6; k++) P.rod('machineDark', [x, 8.6, -5 + k * 2], [x, 7.6, -4 + k * 2], 0.04);
  }
  for (const z of [-5, 7]) P.box('machineDark', [20, 0.35, 0.3], [3, 6.2, z]);
  // the far wall with a band of high windows (bright panes, mullions)
  P.box('machineDark', [24, 9, 0.3], [3, 4.5, -9.5]);
  grp.add(P.build(mats));
  const paneMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 1.25, 1.4), fog: true });
  const panes = new Parts();
  for (let k = 0; k < 8; k++) panes.box('pane', [2.2, 1.8, 0.02], [-6.5 + k * 2.6, 6.6, -9.33]);
  grp.add(panes.build({ pane: paneMat }, { cast: false, receive: false }));
  const mull = new Parts();
  for (let k = 0; k < 8; k++) {
    for (let j = 1; j < 4; j++) mull.box('machineDark', [0.04, 1.8, 0.04], [-6.5 + k * 2.6 - 1.1 + j * 0.55, 6.6, -9.3]);
    mull.box('machineDark', [2.2, 0.04, 0.04], [-6.5 + k * 2.6, 6.6, -9.3]);
  }
  grp.add(mull.build(mats, { cast: false }));
  // hanging lamps: enamel shades with glowing bulbs (practicals in the haze)
  const shade = new THREE.MeshStandardMaterial({ color: 0x2c3236, metalness: 0.4, roughness: 0.5, side: THREE.DoubleSide, emissive: 0x3a3020, emissiveIntensity: 0.2 });
  const bulb = new THREE.MeshBasicMaterial({ color: new THREE.Color(4.0, 3.4, 2.6) });
  const L = new Parts();
  const B2 = new Parts();
  const lamps = [];
  for (const x of [-4.5, -1, 2.5, 6, 9.5]) for (const z of [-3.5]) {
    if (Math.abs(x - 0.6) < 1.2 && Math.abs(z - 0.5) < 1.2) continue;
    L.add('shade', new THREE.ConeGeometry(0.32, 0.22, 32, 1, true), mat4([x, 5.4, z]));
    L.rod('shade', [x, 5.5, z], [x, 8.4, z], 0.008);
    B2.add('bulb', new THREE.SphereGeometry(0.04, 16, 8), mat4([x, 5.35, z]));
    lamps.push(V(x, 5.3, z));
  }
  grp.add(L.build({ shade }, { cast: false }));
  grp.add(B2.build({ bulb }, { cast: false, receive: false }));
  // shafts of daylight from the high windows through the haze (additive, soft-edged)
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uC: { value: new THREE.Color(0.75, 0.85, 1.0) }, uI: { value: 0.05 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vL;
      void main() { vL = uv.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; vN = normalMatrix * normal; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uC; uniform float uI; varying vec3 vN; varying vec3 vV; varying float vL;
      void main() { float f = pow(abs(dot(normalize(vN), normalize(vV))), 2.5);
        float a = f * smoothstep(1.0, 0.82, vL) * smoothstep(0.0, 0.5, vL) * uI; gl_FragColor = vec4(uC * a, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const beams = new THREE.Group();
  for (const [x0, x1, z1] of [[-3.9, -2.6, -1.2], [-1.3, -0.4, 0.2], [1.3, 1.6, -0.6], [3.9, 3.6, 0.8]]) {
    const a = V(x0, 6.6, -9.3), b = V(x1, 0.0, z1);
    const g = new THREE.CylinderGeometry(1.1, 0.75, a.distanceTo(b), 24, 1, true);
    const m = new THREE.Mesh(g, beamMat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(V(0, 1, 0), a.clone().sub(b).normalize());
    m.renderOrder = 3;
    beams.add(m);
  }
  grp.add(beams);
  return { group: grp, lamps, beamMat };
}

// ---------------------------------------------------------------- smoke / steam

// deterministic puffs: each [t0, life, x, y, z, vx, vy, vz, size0, size1, rot, tex]; drawn as sprites
export function smokeSystem(n, seed = 5) {
  const texs = [puffTexture(seed), puffTexture(seed + 7), puffTexture(seed + 13)];
  const group = new THREE.Group();
  const sprites = [];
  for (let i = 0; i < n; i++) {
    const m = new THREE.SpriteMaterial({ map: texs[i % 3], transparent: true, depthWrite: false, opacity: 0, color: 0xffffff, fog: true });
    const s = new THREE.Sprite(m);
    s.visible = false;
    group.add(s);
    sprites.push(s);
  }
  return {
    group,
    // puffs: list of { t0, life, p: [x,y,z], v: [vx,vy,vz], s0, s1, rot, a, col: [r,g,b] }
    draw(t, puffs) {
      let k = 0;
      for (const q of puffs) {
        if (k >= sprites.length) break;
        const u = (t - q.t0) / q.life;
        if (u < 0 || u > 1) continue;
        const s = sprites[k++];
        const drag = 1 - Math.exp(-u * q.life * 1.5);
        const dt = drag / 1.5;
        s.position.set(q.p[0] + q.v[0] * dt + 0.08 * Math.sin(u * 5 + q.rot) * u, q.p[1] + q.v[1] * dt + 0.25 * u * u * q.life, q.p[2] + q.v[2] * dt);
        const sc = lerp(q.s0, q.s1, 1 - (1 - u) ** 2);
        s.scale.set(sc, sc, sc);
        s.material.rotation = q.rot + u * 0.6;
        s.material.opacity = q.a * Math.min(1, u * 6) * (1 - u) ** 1.5;
        s.material.color.setRGB(...q.col);
        s.visible = true;
      }
      for (; k < sprites.length; k++) sprites[k].visible = false;
    },
  };
}
