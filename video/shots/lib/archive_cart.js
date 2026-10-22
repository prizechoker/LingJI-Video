// The Stanford Cart as it was in 1979 (Hans Moravec's thesis runs), and the chairs of its obstacle course.
// Cart: a low aluminium-angle chassis on four 18" spoked bicycle wheels (front pair steered), an open deck crowded with
// a car battery, a gel cell, a card cage, the TV transmitter, the camera control unit, the motor controller, cables;
// on top at the front the "slider" (Moravec & Scheinman, 1977): a 52 cm track on which a stepper motor moves the TV
// camera sideways to take nine pictures 6.5 cm apart; at the back a tall whip antenna for the radio / TV link.
// Local frame: origin on the floor under the cart's centre, forward = +z, y up. Units: metres.
import { THREE } from '../../engine2/core.js';
import { Parts, mat4, rod, bentPath, boxUV, scaleUV, RoundedBoxGeometry, V } from './archive_util.js';
import { rng } from './kit.js';

export const CART = {
  wheelR: 0.23, track: 0.33, base: 0.36, deck: 0.238,
  top: 0.58, // top plate surface
  rail: { y: 0.615, z: 0.40, half: 0.37 },
  slide: 0.26, // camera travel: +-26 cm (52 cm track)
};

// ---------------------------------------------------------------- materials

export function cartMaterials(st) {
  const brushed = st.pbr('Metal032', { repeat: [3, 3] });
  const M = (o) => new THREE.MeshPhysicalMaterial(o);
  return {
    alu: M({ color: 0xc3c6c9, metalness: 1, roughness: 0.42, roughnessMap: brushed.roughnessMap, normalMap: brushed.normalMap, normalScale: new THREE.Vector2(0.3, 0.3) }),
    aluDull: M({ color: 0xa9adb0, metalness: 0.9, roughness: 0.55 }),
    steel: M({ color: 0xcfd2d4, metalness: 1, roughness: 0.25 }),
    spoke: M({ color: 0xd8dadc, metalness: 1, roughness: 0.3 }),
    black: M({ color: 0x141517, roughness: 0.62 }),
    blackGloss: M({ color: 0x0e0f10, roughness: 0.3, clearcoat: 0.4, clearcoatRoughness: 0.3 }),
    grey: M({ color: 0x6f7579, metalness: 0.35, roughness: 0.48 }),
    blueGrey: M({ color: 0x46535f, metalness: 0.2, roughness: 0.5 }),
    beige: M({ color: 0xb7aa8c, roughness: 0.5, clearcoat: 0.15 }),
    rubber: M({ color: 0x1b1b1b, roughness: 0.88 }),
    pcb: M({ color: 0x2c5a3a, roughness: 0.42, clearcoat: 0.3 }),
    chip: M({ color: 0x1a1a1c, roughness: 0.55 }),
    gold: M({ color: 0xd9b25a, metalness: 1, roughness: 0.3 }),
    battery: M({ color: 0x151515, roughness: 0.32, clearcoat: 0.2 }),
    gel: M({ color: 0x2e3236, roughness: 0.45 }),
    red: M({ color: 0x9c1d16, roughness: 0.45 }),
    wireBlack: M({ color: 0x101010, roughness: 0.45 }),
    wireGrey: M({ color: 0x8d8b86, roughness: 0.5 }),
    wireYellow: M({ color: 0xc19a2e, roughness: 0.5 }),
    wireWhite: M({ color: 0xd8d4c8, roughness: 0.5 }),
    wireOrange: M({ color: 0xb35a22, roughness: 0.5 }),
    tape: M({ color: 0xd6cba8, roughness: 0.85 }),
    glass: M({ color: 0x05070a, roughness: 0.04, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.02 }),
    meter: M({ color: 0xe8e2d0, roughness: 0.4 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff2010, emissiveIntensity: 0, roughness: 0.3 }),
  };
}

// ---------------------------------------------------------------- the wheel (axle along x, centred at the origin)

function wheelParts(R = CART.wheelR) {
  const P = new Parts();
  const tube = 0.021;
  const tire = new THREE.TorusGeometry(R - tube, tube, 14, 72);
  tire.scale(1, 1, 1.05);
  P.add('rubber', tire, mat4([0, 0, 0], [0, Math.PI / 2, 0]));
  const rr = R - 2 * tube + 0.002; // rim radius
  P.cyl('steel', rr, rr, 0.022, [0, 0, 0], { rot: [0, 0, Math.PI / 2], seg: 72, open: true });
  for (const s of [-1, 1]) P.add('steel', new THREE.TorusGeometry(rr + 0.002, 0.0032, 8, 72), mat4([s * 0.011, 0, 0], [0, Math.PI / 2, 0]));
  // hub, flanges, axle nuts
  P.cyl('steel', 0.016, 0.016, 0.075, [0, 0, 0], { rot: [0, 0, Math.PI / 2], seg: 24 });
  for (const s of [-1, 1]) {
    P.cyl('steel', 0.03, 0.03, 0.003, [s * 0.028, 0, 0], { rot: [0, 0, Math.PI / 2], seg: 32 });
    P.cyl('aluDull', 0.009, 0.009, 0.012, [s * 0.044, 0, 0], { rot: [0, 0, Math.PI / 2], seg: 6 });
  }
  // 32 spokes, three-cross
  const n = 32;
  for (let k = 0; k < n; k++) {
    const side = k % 2 ? 1 : -1;
    const ar = (k / n) * Math.PI * 2;
    const ah = ar + (k % 4 < 2 ? 1 : -1) * 3 * (Math.PI * 2 / 16) * 0.5;
    P.rod('spoke', [side * 0.027, Math.cos(ah) * 0.027, Math.sin(ah) * 0.027], [side * 0.003, Math.cos(ar) * (rr - 0.002), Math.sin(ar) * (rr - 0.002)], 0.0011, { seg: 5 });
  }
  // valve stem
  P.cyl('steel', 0.003, 0.003, 0.03, [0, rr - 0.012, 0], { seg: 6 });
  return P;
}

// a gentle catenary between two points (a hanging cable), n points
function sag(a, b, drop, n = 10) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    pts.push(V(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - drop * 4 * u * (1 - u), a[2] + (b[2] - a[2]) * u));
  }
  return pts;
}

// ---------------------------------------------------------------- the cart

export function buildCart(st, mats = cartMaterials(st)) {
  const root = new THREE.Group(); // placed and headed in the room
  const body = new THREE.Group(); // pitches a little on stops
  root.add(body);
  const R = CART.wheelR, D = CART.deck;
  const P = new Parts();

  // chassis: aluminium angle frame and deck plate
  for (const s of [-1, 1]) {
    P.box('alu', [0.004, 0.05, 0.95], [s * 0.248, 0.207, 0]);
    P.box('alu', [0.04, 0.004, 0.95], [s * 0.23, 0.233, 0]);
    P.box('alu', [0.5, 0.05, 0.004], [0, 0.207, s * 0.473]);
    P.box('alu', [0.5, 0.004, 0.04], [0, 0.233, s * 0.455]);
  }
  P.box('alu', [0.5, 0.004, 0.035], [0, 0.233, 0]);
  P.box('aluDull', [0.49, 0.005, 0.94], [0, D - 0.0025, 0]);
  // bolts along the deck edge
  for (let k = 0; k < 9; k++) for (const s of [-1, 1]) P.cyl('steel', 0.004, 0.004, 0.003, [s * 0.235, D + 0.0015, -0.44 + k * 0.11], { seg: 8 });

  // under the deck: rear drive motors and gearboxes, front steering servo and tie rod
  for (const s of [-1, 1]) {
    P.cyl('black', 0.04, 0.04, 0.12, [s * 0.16, 0.165, -CART.base], { rot: [0, 0, Math.PI / 2], seg: 28 });
    P.cyl('aluDull', 0.042, 0.042, 0.012, [s * 0.1, 0.165, -CART.base], { rot: [0, 0, Math.PI / 2], seg: 28 });
    P.box('aluDull', [0.05, 0.09, 0.08], [s * 0.245, 0.19, -CART.base], { bevel: 0.006 });
    // rear axle brackets (fixed)
    P.box('alu', [0.006, 0.1, 0.07], [s * 0.287, 0.215, -CART.base]);
    P.box('alu', [0.04, 0.03, 0.07], [s * 0.268, 0.25, -CART.base]);
  }
  P.box('black', [0.12, 0.07, 0.09], [0, 0.185, 0.31], { bevel: 0.005 });
  P.rod('steel', [-0.26, 0.17, 0.30], [0.26, 0.17, 0.30], 0.005);
  P.rod('steel', [0, 0.17, 0.30], [0, 0.185, 0.31], 0.006);

  // ---- deck load: the rear third is open (batteries, power); the front two thirds sit under a top plate that
  // carries the slider
  const TP = CART.top;
  // car battery, rear left, with its hold-down strap
  const bx = -0.13, bz = -0.335;
  P.add('battery', new RoundedBoxGeometry(0.175, 0.19, 0.235, 2, 0.008), mat4([bx, D + 0.095, bz]));
  P.box('battery', [0.18, 0.012, 0.24], [bx, D + 0.19, bz], { bevel: 0.004 });
  for (let k = 0; k < 6; k++) P.cyl('blackGloss', 0.011, 0.011, 0.008, [bx - 0.035, D + 0.199, bz - 0.09 + k * 0.036], { seg: 16 });
  P.cyl('steel', 0.008, 0.009, 0.02, [bx + 0.05, D + 0.206, bz + 0.09], { seg: 12 });
  P.cyl('red', 0.015, 0.012, 0.03, [bx + 0.05, D + 0.21, bz + 0.09], { seg: 16 });
  P.cyl('steel', 0.008, 0.009, 0.02, [bx + 0.05, D + 0.206, bz - 0.09], { seg: 12 });
  P.box('alu', [0.2, 0.004, 0.025], [bx, D + 0.198, bz]);
  for (const s of [-1, 1]) P.rod('steel', [bx + s * 0.098, D + 0.198, bz], [bx + s * 0.098, D, bz], 0.003);
  P.box('tape', [0.07, 0.001, 0.025], [bx - 0.035, D + 0.1965, bz + 0.06]);
  // gel cell and the motor controller, rear right
  P.box('gel', [0.15, 0.1, 0.14], [0.13, D + 0.05, -0.385], { bevel: 0.004 });
  P.box('tape', [0.07, 0.03, 0.001], [0.13, D + 0.06, -0.456]);
  for (const s of [-1, 1]) P.box('steel', [0.012, 0.012, 0.006], [0.13 + s * 0.05, D + 0.104, -0.36]);
  P.box('blueGrey', [0.17, 0.11, 0.1], [0.13, D + 0.055, -0.25], { bevel: 0.004 });
  for (let i = 0; i < 7; i++) for (let j = 0; j < 3; j++) P.cyl('black', 0.004, 0.004, 0.002, [0.07 + i * 0.02, D + 0.1105, -0.28 + j * 0.03], { seg: 6 });
  // fuse / switch box between the batteries
  P.box('beige', [0.085, 0.075, 0.1], [0.0, D + 0.0375, -0.405], { bevel: 0.003 });
  for (let k = 0; k < 3; k++) {
    P.cyl('steel', 0.0035, 0.0035, 0.016, [-0.025 + k * 0.025, D + 0.045, -0.462], { rot: [Math.PI / 2 - 0.4, 0, 0], seg: 8 });
    P.cyl('steel', 0.007, 0.007, 0.004, [-0.025 + k * 0.025, D + 0.045, -0.456], { rot: [Math.PI / 2, 0, 0], seg: 6 });
  }
  // corner posts and the top plate, with a carrying handle at its back edge
  for (const s of [-1, 1]) for (const z of [-0.17, 0.455]) {
    P.box('alu', [0.025, TP - D, 0.003], [s * 0.236, (TP + D) / 2, z + (z < 0 ? 0.011 : -0.011)]);
    P.box('alu', [0.003, TP - D, 0.025], [s * 0.247, (TP + D) / 2, z]);
  }
  P.box('aluDull', [0.5, 0.006, 0.655], [0, TP - 0.003, 0.143]);
  for (const s of [-1, 1]) P.box('alu', [0.004, 0.028, 0.655], [s * 0.249, TP - 0.017, 0.143]);
  P.box('alu', [0.5, 0.028, 0.004], [0, TP - 0.017, -0.183]);
  P.tube('alu', null, 0.008, { seg: 40, rseg: 10, curve: bentPath([[-0.15, TP, -0.16], [-0.15, TP + 0.07, -0.16], [0.15, TP + 0.07, -0.16], [0.15, TP, -0.16]], 0.025) });
  for (let k = 0; k < 6; k++) for (const s of [-1, 1]) P.cyl('steel', 0.004, 0.004, 0.003, [s * 0.235, TP + 0.0015, -0.16 + k * 0.12], { seg: 8 });
  // card cage, left, under the plate: an aluminium frame holding ten boards
  const cx0 = -0.225, cx1 = -0.025, cz0 = -0.125, cz1 = 0.16, ch = 0.27;
  for (const x of [cx0, cx1]) for (const z of [cz0, cz1]) P.box('alu', [0.012, ch, 0.012], [x, D + ch / 2, z]);
  for (const x of [cx0, cx1]) for (const y of [0.012, ch]) P.box('alu', [0.012, 0.012, cz1 - cz0], [x, D + y, (cz0 + cz1) / 2]);
  for (const z of [cz0, cz1]) P.box('alu', [cx1 - cx0, 0.012, 0.012], [(cx0 + cx1) / 2, D + ch, z]);
  P.box('black', [cx1 - cx0, 0.01, cz1 - cz0], [(cx0 + cx1) / 2, D + 0.012, (cz0 + cz1) / 2]);
  const RC = rng(7);
  for (let i = 0; i < 10; i++) {
    const x = cx0 + 0.016 + i * 0.0185;
    P.box('pcb', [0.0016, 0.235, 0.26], [x, D + 0.135, (cz0 + cz1) / 2]);
    P.box('gold', [0.0018, 0.008, 0.2], [x, D + 0.022, (cz0 + cz1) / 2]);
    P.box(i % 3 ? 'wireWhite' : 'red', [0.006, 0.012, 0.016], [x, D + 0.25, cz1 - 0.012]);
    const nch = 8 + Math.floor(RC() * 5);
    for (let k = 0; k < nch; k++) {
      const long = RC() < 0.5;
      P.box('chip', [0.004, 0.014, long ? 0.05 : 0.025], [x + 0.0028, D + 0.05 + (k % 4) * 0.045 + RC() * 0.008, cz0 + 0.045 + Math.floor(k / 4) * 0.08 + RC() * 0.015]);
    }
  }
  // video transmitter on the deck (grey, finned) and the camera power supply above it on brackets
  P.box('grey', [0.18, 0.09, 0.22], [0.13, D + 0.045, 0.0], { bevel: 0.004 });
  for (let k = 0; k < 9; k++) P.box('grey', [0.003, 0.025, 0.19], [0.054 + k * 0.019, D + 0.102, 0.0]);
  for (let k = 0; k < 2; k++) P.cyl('steel', 0.006, 0.006, 0.018, [0.09 + k * 0.05, D + 0.05, -0.115], { rot: [Math.PI / 2, 0, 0], seg: 12 });
  P.box('tape', [0.06, 0.022, 0.001], [0.1, D + 0.06, 0.1105]);
  P.box('beige', [0.17, 0.1, 0.2], [0.13, D + 0.215, 0.02], { bevel: 0.004 });
  for (const s of [-1, 1]) P.box('alu', [0.004, 0.06, 0.2], [0.13 + s * 0.087, D + 0.16, 0.02]);
  P.cyl('grey', 0.03, 0.03, 0.002, [0.13, D + 0.215, 0.121], { rot: [Math.PI / 2, 0, 0], seg: 24 });
  for (let k = 0; k < 4; k++) P.box('black', [0.05, 0.003, 0.001], [0.13, D + 0.2 + k * 0.01, 0.1225]);
  // camera control unit across the front (meter, knobs), radio receiver beside it
  P.box('beige', [0.29, 0.12, 0.17], [-0.065, D + 0.06, 0.345], { bevel: 0.004 });
  P.box('meter', [0.06, 0.04, 0.002], [-0.14, D + 0.07, 0.431]);
  P.box('black', [0.064, 0.044, 0.001], [-0.14, D + 0.07, 0.4302]);
  for (let k = 0; k < 3; k++) P.cyl('black', 0.01, 0.01, 0.014, [-0.06 + k * 0.04, D + 0.065, 0.437], { rot: [Math.PI / 2, 0, 0], seg: 16 });
  P.box('tape', [0.08, 0.018, 0.001], [-0.02, D + 0.1, 0.4305]);
  P.box('black', [0.12, 0.085, 0.16], [0.165, D + 0.0425, 0.345], { bevel: 0.004 });
  P.box('wireGrey', [0.05, 0.02, 0.002], [0.165, D + 0.06, 0.426]);

  // ---- cables
  P.tube('red', sag([bx + 0.05, D + 0.215, bz + 0.09], [0.0, D + 0.07, -0.36], -0.03, 10), 0.006, { seg: 30, rseg: 8 });
  P.tube('wireBlack', [V(bx + 0.05, D + 0.21, bz - 0.09), V(bx + 0.09, D + 0.23, bz - 0.11), V(-0.03, D + 0.09, -0.43), V(-0.02, D + 0.06, -0.455)], 0.006, { seg: 30, rseg: 8 });
  P.tube('wireBlack', [V(0.035, D + 0.06, -0.38), V(0.06, D + 0.12, -0.3), V(0.08, D + 0.11, -0.25)], 0.005, { seg: 24, rseg: 8 });
  // the harness along the left rail, bundled with tape
  const harness = [V(-0.236, D + 0.012, -0.2), V(-0.235, D + 0.02, -0.02), V(-0.236, D + 0.015, 0.12), V(-0.225, D + 0.02, 0.22), V(-0.2, D + 0.05, 0.26)];
  P.tube('wireYellow', harness.map((q) => q.clone().add(V(0.004, 0.004, 0))), 0.0035, { seg: 40, rseg: 6 });
  P.tube('wireBlack', harness.map((q) => q.clone().add(V(-0.004, 0.002, 0))), 0.0035, { seg: 40, rseg: 6 });
  P.tube('wireWhite', harness.map((q) => q.clone().add(V(0, 0.009, 0))), 0.0035, { seg: 40, rseg: 6 });
  for (let k = 0; k < 4; k++) P.cyl('tape', 0.011, 0.011, 0.012, [-0.235, D + 0.017, -0.16 + k * 0.09], { rot: [Math.PI / 2, 0, 0], seg: 12 });
  // between the boards, the supplies and the camera unit: loops of hook-up wire
  P.tube('wireGrey', [V(-0.03, D + 0.22, 0.05), V(0.0, D + 0.26, 0.06), V(0.03, D + 0.25, 0.04), V(0.045, D + 0.22, 0.03)], 0.004, { seg: 24, rseg: 6 });
  P.tube('wireOrange', [V(-0.1, D + 0.27, 0.16), V(-0.09, D + 0.22, 0.21), V(-0.07, D + 0.125, 0.26)], 0.003, { seg: 20, rseg: 6 });
  P.tube('wireBlack', [V(0.05, D + 0.2, 0.12), V(0.06, D + 0.15, 0.2), V(0.1, D + 0.09, 0.265)], 0.004, { seg: 20, rseg: 6 });
  P.tube('wireWhite', [V(-0.02, D + 0.27, -0.08), V(0.02, D + 0.3, -0.05), V(0.06, D + 0.27, -0.02), V(0.06, D + 0.18, 0.0)], 0.003, { seg: 24, rseg: 6 });
  P.tube('wireYellow', [V(-0.12, D + 0.27, -0.125), V(-0.1, D + 0.2, -0.16), V(-0.05, D + 0.15, -0.2), V(0.05, D + 0.12, -0.21)], 0.003, { seg: 24, rseg: 6 });
  // coax from the transmitter back to the antenna mount
  P.tube('wireBlack', [V(0.14, D + 0.05, -0.115), V(0.17, D + 0.14, -0.17), V(0.215, D + 0.16, -0.25), V(0.23, D + 0.15, -0.35), V(0.225, D + 0.16, -0.44)], 0.0045, { seg: 40, rseg: 8 });

  // ---- slider on the top plate: risers, a beam with two guide rods and a lead screw, a stepper motor at +x
  const { y: ry, z: rz, half } = CART.rail;
  for (const s of [-1, 1]) P.box('alu', [0.03, ry - TP - 0.015, 0.04], [s * 0.2, (ry - 0.015 + TP) / 2, rz]);
  P.box('alu', [half * 2, 0.03, 0.045], [0, ry, rz], { bevel: 0.002 });
  for (const s of [-1, 1]) P.box('aluDull', [0.03, 0.045, 0.06], [s * (half - 0.015), ry + 0.03, rz], { bevel: 0.003 });
  for (const s of [-1, 1]) P.rod('steel', [-half + 0.03, ry + 0.034, rz + s * 0.018], [half - 0.03, ry + 0.034, rz + s * 0.018], 0.005, { seg: 12 });
  P.rod('steel', [-half + 0.03, ry + 0.03, rz], [half - 0.03, ry + 0.03, rz], 0.0035, { seg: 8 });
  P.box('black', [0.05, 0.056, 0.056], [half + 0.025, ry + 0.03, rz], { bevel: 0.004 });
  P.box('aluDull', [0.006, 0.058, 0.058], [half + 0.052, ry + 0.03, rz]);
  // stepper driver and terminal strip on the plate
  P.box('black', [0.17, 0.06, 0.12], [-0.11, TP + 0.03, 0.02], { bevel: 0.004 });
  for (let k = 0; k < 8; k++) P.box('black', [0.003, 0.02, 0.11], [-0.185 + k * 0.021, TP + 0.07, 0.02]);
  P.box('black', [0.13, 0.018, 0.03], [0.12, TP + 0.009, 0.06]);
  for (let k = 0; k < 8; k++) P.cyl('steel', 0.004, 0.004, 0.004, [0.065 + k * 0.016, TP + 0.02, 0.06], { seg: 8 });
  P.tube('wireGrey', [V(half + 0.05, ry + 0.01, rz - 0.02), V(half - 0.02, ry - 0.01, rz - 0.07), V(0.2, TP + 0.03, rz - 0.15), V(0.12, TP + 0.02, 0.08)], 0.003, { seg: 30, rseg: 6 });
  P.tube('wireBlack', [V(0.06, TP + 0.018, 0.06), V(0.0, TP + 0.04, 0.05), V(-0.03, TP + 0.035, 0.03)], 0.003, { seg: 20, rseg: 6 });
  P.tube('wireYellow', [V(0.1, TP + 0.018, 0.045), V(0.12, TP + 0.03, -0.05), V(0.2, TP + 0.01, -0.15), V(0.24, TP - 0.06, -0.17)], 0.0025, { seg: 24, rseg: 6 });

  body.add(P.build(mats));

  // the camera carriage, slides along x
  const car = new THREE.Group();
  const C = new Parts();
  C.box('aluDull', [0.12, 0.008, 0.1], [0, ry + 0.052, rz]);
  for (const s of [-1, 1]) for (const z of [-1, 1]) C.box('alu', [0.03, 0.018, 0.022], [s * 0.04, ry + 0.04, rz + z * 0.018], { bevel: 0.003 });
  // the TV camera (a 1970s CCTV box with a C-mount lens), tilted down a little
  const cam = new Parts();
  const bw = 0.1, bh = 0.11, bl = 0.26, f = bl / 2;
  cam.box('black', [bw, bh, bl], [0, 0, 0], { bevel: 0.006 });
  for (let k = 0; k < 7; k++) for (const s of [-1, 1]) cam.box('blackGloss', [0.0015, 0.055, 0.005], [s * (bw / 2 + 0.0004), 0.005, -0.09 + k * 0.014]);
  cam.box('aluDull', [0.076, 0.076, 0.003], [0, 0, -f - 0.0015]);
  cam.cyl('steel', 0.007, 0.007, 0.015, [-0.016, 0.012, -f - 0.008], { rot: [Math.PI / 2, 0, 0], seg: 12 });
  cam.cyl('black', 0.009, 0.009, 0.012, [0.018, -0.012, -f - 0.007], { rot: [Math.PI / 2, 0, 0], seg: 12 });
  cam.box('meter', [0.001, 0.016, 0.05], [bw / 2 + 0.0012, 0.036, 0.055]);
  cam.box('aluDull', [0.012, 0.03, 0.012], [0, bh / 2 + 0.015, -0.07]);
  cam.box('aluDull', [0.012, 0.03, 0.012], [0, bh / 2 + 0.015, 0.05]);
  cam.box('aluDull', [0.014, 0.012, 0.14], [0, bh / 2 + 0.032, -0.01], { bevel: 0.004 });
  cam.cyl('aluDull', 0.027, 0.027, 0.008, [0, -0.008, f + 0.004], { rot: [Math.PI / 2, 0, 0], seg: 32 });
  cam.cyl('black', 0.024, 0.024, 0.028, [0, -0.008, f + 0.022], { rot: [Math.PI / 2, 0, 0], seg: 32 });
  for (let k = 0; k < 20; k++) {
    const a = (k / 20) * Math.PI * 2;
    cam.box('black', [0.004, 0.003, 0.016], [Math.cos(a) * 0.0255, -0.008 + Math.sin(a) * 0.0255, f + 0.03], { rot: [0, 0, a] });
  }
  cam.cyl('black', 0.028, 0.025, 0.026, [0, -0.008, f + 0.05], { rot: [Math.PI / 2, 0, 0], seg: 32 });
  cam.cyl('aluDull', 0.0285, 0.0285, 0.004, [0, -0.008, f + 0.064], { rot: [Math.PI / 2, 0, 0], seg: 32 });
  cam.cyl('glass', 0.021, 0.021, 0.002, [0, -0.008, f + 0.065], { rot: [Math.PI / 2, 0, 0], seg: 32 });
  const camG = cam.build(mats);
  camG.position.set(0, ry + 0.056 + bh / 2, rz + 0.04);
  camG.rotation.x = 0.06;
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 12, 8), mats.lamp);
  lamp.position.set(0.035, bh / 2 + 0.003, f - 0.025);
  camG.add(lamp);
  car.add(C.build(mats), camG);
  body.add(car);
  const lensPos = V(0, -0.008, f + 0.068);

  // ---- antennas (pivot at the base for sway)
  const ant = new THREE.Group();
  ant.position.set(0.225, D + 0.15, -0.445);
  const A = new Parts();
  A.cyl('black', 0.012, 0.014, 0.05, [0, -0.025, 0], { seg: 16 });
  const coil = new THREE.CatmullRomCurve3(Array.from({ length: 60 }, (_, i) => V(Math.cos(i * 0.9) * 0.008, i * 0.0011, Math.sin(i * 0.9) * 0.008)));
  A.add('steel', new THREE.TubeGeometry(coil, 120, 0.0016, 5));
  A.rod('steel', [0, 0.065, 0], [0, 1.42, 0], 0.0019, { seg: 6, r1: 0.0011 });
  A.add('black', new THREE.SphereGeometry(0.004, 8, 6), mat4([0, 1.42, 0]));
  ant.add(A.build(mats, { receive: false }));
  body.add(ant);
  const P2 = new Parts();
  P2.box('alu', [0.04, 0.15, 0.004], [0.225, D + 0.075, -0.466]);
  body.add(P2.build(mats));
  const ant2 = new THREE.Group();
  ant2.position.set(0.225, CART.top, 0.44);
  const A2 = new Parts();
  A2.rod('steel', [0, 0, 0], [0, 0.42, 0], 0.0014, { seg: 5, r1: 0.001 });
  ant2.add(A2.build(mats, { receive: false }));
  body.add(ant2);

  // ---- wheels
  const WP = wheelParts();
  const wheelMesh = WP.build(mats);
  const wheels = [];
  const steer = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const w = wheelMesh.clone();
    const holder = new THREE.Group(); // steering pivot for the front pair
    holder.position.set(sx * 0.27, R, sz * CART.base);
    w.position.set(sx * (CART.track - 0.27), 0, 0);
    holder.add(w);
    if (sz > 0) {
      // front: kingpin, bracket and steering arm move with the wheel
      const F = new Parts();
      F.cyl('steel', 0.012, 0.012, 0.13, [0, 0.02, 0], { seg: 16 });
      F.box('alu', [0.006, 0.09, 0.07], [sx * 0.017, -0.005, 0]);
      F.box('alu', [0.03, 0.02, 0.05], [sx * 0.005, 0.03, 0]);
      F.rod('steel', [sx * 0.012, -0.06, 0], [sx * 0.012, -0.06, -0.06], 0.005);
      holder.add(F.build(mats));
      steer.push(holder);
    }
    body.add(holder);
    wheels.push(w);
  }

  // camera cable: rebuilt only when the slide changes (cheap: a short tube)
  let cable = null, cableAt = null;
  const cableMesh = (slide) => {
    const x = slide, cy = ry + 0.056 + 0.055, TPc = CART.top;
    const pts = [V(x - 0.016, cy + 0.012, rz + 0.04 - 0.138), V(x * 0.95 - 0.02, cy, rz - 0.15), V(x * 0.75 - 0.03, TPc + 0.05, rz - 0.22), V(x * 0.4 - 0.06, TPc + 0.012, rz - 0.27), V(-0.1, TPc + 0.03, 0.08)];
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.0042, 6);
    const m = new THREE.Mesh(g, mats.wireBlack);
    m.castShadow = true;
    return m;
  };

  return {
    group: root,
    body,
    mats,
    camera: camG,
    carriage: car,
    lamp,
    // world position of the lens front
    lensWorld(out = V()) {
      camG.updateWorldMatrix(true, false);
      return out.copy(lensPos).applyMatrix4(camG.matrixWorld);
    },
    // roll: distance travelled (m, wheels turn), steerA: front wheel angle (rad), slide: camera x (m, -0.26..0.26),
    // pitch: body pitch (rad, + = nose down), sway: [main antenna, small antenna] bend (rad, along the motion)
    pose({ roll = 0, steerA = 0, slide = 0, pitch = 0, sway = [0, 0], lamp: lampOn = 0 } = {}) {
      for (const w of wheels) w.rotation.x = roll / R;
      for (const h of steer) h.rotation.y = steerA;
      car.position.x = slide;
      body.position.y = 0;
      body.rotation.x = pitch;
      ant.rotation.x = sway[0];
      ant2.rotation.x = sway[1];
      mats.lamp.emissiveIntensity = lampOn * 6;
      const key = Math.round(slide * 1000);
      if (key !== cableAt) {
        if (cable) {
          body.remove(cable);
          cable.geometry.dispose();
        }
        cable = cableMesh(slide);
        body.add(cable);
        cableAt = key;
      }
    },
  };
}

// ---------------------------------------------------------------- chairs

export function chairMaterials(st) {
  const M = (o) => new THREE.MeshPhysicalMaterial(o);
  const wood = st.pbr('Wood026', { repeat: [1, 1] });
  const fab = st.pbr('Fabric030', { repeat: [6, 6] });
  return {
    chrome: M({ color: 0xd4d6d8, metalness: 1, roughness: 0.16 }),
    tubeBlack: M({ color: 0x1d1e20, metalness: 0.4, roughness: 0.42 }),
    tan: M({ color: 0x9a8b70, metalness: 0.35, roughness: 0.48, clearcoat: 0.2 }),
    greyPaint: M({ color: 0x7b7e7c, metalness: 0.35, roughness: 0.5, clearcoat: 0.15 }),
    wood: M({ ...wood, color: 0xb08a66, roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.35 }),
    woodDark: M({ ...wood, color: 0x7a5a40, roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.35 }),
    vinylOrange: M({ color: 0x9e4a1e, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.35, normalMap: fab.normalMap, normalScale: new THREE.Vector2(0.15, 0.15) }),
    vinylBrown: M({ color: 0x4f3424, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.35, normalMap: fab.normalMap, normalScale: new THREE.Vector2(0.15, 0.15) }),
    vinylOlive: M({ color: 0x5d5c34, roughness: 0.45, clearcoat: 0.3, clearcoatRoughness: 0.4, normalMap: fab.normalMap, normalScale: new THREE.Vector2(0.15, 0.15) }),
    plyBlack: M({ color: 0x232220, roughness: 0.7 }),
    foot: M({ color: 0x111111, roughness: 0.6 }),
    shellBlue: M({ color: 0x3b5466, roughness: 0.4, clearcoat: 0.4, clearcoatRoughness: 0.3 }),
    shellBeige: M({ color: 0xb3a27e, roughness: 0.42, clearcoat: 0.4, clearcoatRoughness: 0.3 }),
  };
}

// bend a geometry around the y axis: z -= x^2 / (2 R) (a curved back slat, concave toward +z)
function bendX(g, R) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) - (p.getX(i) ** 2) / (2 * R));
  g.computeVertexNormals();
  return g;
}

// type: 'steel' (tubular stacking chair, vinyl pads), 'folding' (painted steel), 'wood' (classroom chair), 'shell'
// (moulded fibreglass shell on rod legs). Built facing +z, seat centre over the origin.
export function buildChair(type, mats, { pad = 'vinylOrange', paint = 'tan', tube = 'chrome', shell = 'shellBlue' } = {}) {
  const P = new Parts();
  if (type === 'steel') {
    const r = 0.0105;
    for (const s of [-1, 1]) {
      const x = s * 0.205;
      P.add(tube, new THREE.TubeGeometry(bentPath([[x, 0.012, 0.235], [x, 0.415, 0.2], [x, 0.415, -0.17], [x, 0.012, -0.235]], 0.045), 64, r, 10));
      P.add(tube, new THREE.TubeGeometry(bentPath([[x, 0.415, -0.12], [x, 0.43, -0.18], [x, 0.84, -0.27]], 0.04), 40, r * 0.95, 10));
      P.cyl('foot', 0.013, 0.012, 0.014, [x, 0.007, 0.235], { seg: 12 });
      P.cyl('foot', 0.013, 0.012, 0.014, [x, 0.007, -0.235], { seg: 12 });
    }
    P.rod(tube, [-0.205, 0.405, 0.15], [0.205, 0.405, 0.15], 0.008);
    P.rod(tube, [-0.205, 0.405, -0.12], [0.205, 0.405, -0.12], 0.008);
    P.box('plyBlack', [0.43, 0.012, 0.4], [0, 0.428, 0.01]);
    P.add(pad, new RoundedBoxGeometry(0.445, 0.055, 0.42, 3, 0.024), mat4([0, 0.46, 0.015]));
    const back = new RoundedBoxGeometry(0.43, 0.19, 0.05, 3, 0.022);
    bendX(back, 0.9);
    P.add(pad, back, mat4([0, 0.715, -0.235], [-0.2, 0, 0]));
  } else if (type === 'folding') {
    const r = 0.0105;
    for (const s of [-1, 1]) {
      const x = s * 0.2;
      // back post: from the rear foot up to the top of the back
      P.add(paint, new THREE.TubeGeometry(bentPath([[x, 0.01, -0.215], [x, 0.45, -0.19], [x, 0.81, -0.255]], 0.12), 40, r, 10));
      // front leg: from the front foot up and back to the pivot on the back post
      P.add(paint, new THREE.TubeGeometry(bentPath([[x, 0.01, 0.235], [x, 0.43, 0.06], [x * 0.98, 0.47, -0.17]], 0.1), 40, r, 10));
      P.cyl('foot', 0.012, 0.012, 0.02, [x, 0.01, 0.235], { seg: 10 });
      P.cyl('foot', 0.012, 0.012, 0.02, [x, 0.01, -0.215], { seg: 10 });
      P.cyl('chrome', 0.007, 0.007, 0.03, [x, 0.468, -0.187], { rot: [0, 0, Math.PI / 2], seg: 10 });
    }
    P.rod(paint, [-0.2, 0.09, 0.2], [0.2, 0.09, 0.2], 0.008);
    P.rod(paint, [-0.2, 0.12, -0.21], [0.2, 0.12, -0.21], 0.008);
    // pressed steel seat pan, slightly dished, and the curved back band
    P.add(paint, new RoundedBoxGeometry(0.4, 0.032, 0.39, 3, 0.014), mat4([0, 0.452, 0.02], [-0.04, 0, 0]));
    const band = new RoundedBoxGeometry(0.4, 0.14, 0.016, 3, 0.007);
    bendX(band, 0.55);
    P.add(paint, band, mat4([0, 0.72, -0.235], [-0.17, 0, 0]));
  } else if (type === 'wood') {
    const leg = (a, b, r0, r1) => {
      const g = rod(a, b, r0, 12, r1);
      scaleUV(g, 0.15, 1.2);
      P.add('wood', g);
    };
    for (const s of [-1, 1]) {
      const x = s * 0.19;
      leg([x, 0, 0.19], [x, 0.44, 0.18], 0.0145, 0.017);
      leg([x, 0, -0.215], [x, 0.44, -0.19], 0.0145, 0.018);
      leg([x, 0.44, -0.19], [x, 0.86, -0.265], 0.017, 0.015);
      leg([x, 0.17, 0.185], [x, 0.17, -0.205], 0.009, 0.009); // side stretcher
      P.box('wood', [0.022, 0.06, 0.37], [x * 0.94, 0.405, -0.005], { uv: 3 });
    }
    leg([-0.19, 0.21, -0.006], [0.19, 0.21, -0.006], 0.009, 0.009);
    P.box('wood', [0.36, 0.06, 0.022], [0, 0.405, 0.175], { uv: 3 });
    P.box('wood', [0.36, 0.06, 0.022], [0, 0.405, -0.195], { uv: 3 });
    P.add('wood', boxUV(new RoundedBoxGeometry(0.44, 0.024, 0.42, 2, 0.008), 2.2), mat4([0, 0.447, 0.0]));
    const top = new RoundedBoxGeometry(0.42, 0.085, 0.02, 2, 0.006);
    boxUV(top, 2.2);
    bendX(top, 0.5);
    P.add('wood', top, mat4([0, 0.79, -0.25], [-0.17, 0, 0]));
    const mid = new RoundedBoxGeometry(0.38, 0.045, 0.016, 2, 0.005);
    boxUV(mid, 2.2);
    bendX(mid, 0.5);
    P.add('wood', mid, mat4([0, 0.625, -0.222], [-0.17, 0, 0]));
  } else if (type === 'shell') {
    // a moulded side shell (seat + back in one piece) on four splayed rod legs with a cross brace
    const prof = [];
    // profile in (z, y): seat front lip -> seat -> curve up into the back
    const pts = [[0.215, 0.43], [0.2, 0.455], [0.1, 0.445], [-0.05, 0.44], [-0.15, 0.455], [-0.2, 0.5], [-0.23, 0.6], [-0.25, 0.72], [-0.255, 0.8]];
    for (const [z, y] of pts) prof.push(V(0, y, z));
    const curve = new THREE.CatmullRomCurve3(prof);
    const N = 40, M = 18;
    const pos = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const p = curve.getPointAt(i / N);
      const halfW = 0.2 + 0.03 * Math.sin((i / N) * Math.PI) - (i / N > 0.75 ? 0.02 * (i / N - 0.75) / 0.25 : 0);
      for (let j = 0; j <= M; j++) {
        const u = j / M * 2 - 1;
        const x = u * halfW;
        // dish: raise the sides
        const lift = 0.035 * u * u * (i / N < 0.55 ? 1 : 0.6);
        const tz = (i / N > 0.55 ? 0.03 * u * u : 0);
        pos.push(x, p.y + lift, p.z + tz);
      }
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
      const a = i * (M + 1) + j, b = a + 1, c = a + M + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const top = g;
    const bot = g.clone();
    bot.translate(0, -0.006, 0);
    const bi = bot.index.array;
    for (let k = 0; k < bi.length; k += 3) [bi[k + 1], bi[k + 2]] = [bi[k + 2], bi[k + 1]];
    bot.computeVertexNormals();
    P.add(shell, top);
    P.add(shell, bot);
    // rim edge
    const rim = [];
    for (let i = 0; i <= N; i++) rim.push(V(pos[(i * (M + 1)) * 3], pos[(i * (M + 1)) * 3 + 1] - 0.003, pos[(i * (M + 1)) * 3 + 2]));
    P.tube(shell, rim, 0.0035, { seg: 60, rseg: 6 });
    const rim2 = [];
    for (let i = 0; i <= N; i++) rim2.push(V(pos[(i * (M + 1) + M) * 3], pos[(i * (M + 1) + M) * 3 + 1] - 0.003, pos[(i * (M + 1) + M) * 3 + 2]));
    P.tube(shell, rim2, 0.0035, { seg: 60, rseg: 6 });
    for (const s of [-1, 1]) for (const z of [-1, 1]) {
      P.rod(tube, [s * 0.13, 0.43, z * 0.1], [s * 0.21, 0.01, z * 0.21], 0.0055);
      P.cyl('foot', 0.01, 0.009, 0.016, [s * 0.21, 0.008, z * 0.21], { seg: 10 });
    }
    P.rod(tube, [-0.17, 0.2, 0.155], [0.17, 0.2, -0.155], 0.004);
    P.rod(tube, [0.17, 0.2, 0.155], [-0.17, 0.2, -0.155], 0.004);
    P.box('plyBlack', [0.3, 0.012, 0.24], [0, 0.428, 0]);
  }
  return P.build(mats);
}
