// A 1970s university lab room for the Stanford Cart: vinyl-composition floor tiles, painted concrete-block walls,
// a band of steel windows with venetian blinds on the +x wall (the sun comes in through them), an acoustic tile
// ceiling with fluorescent troffers, a chalkboard, a door and a wall clock on the far (-z) wall, a steel desk with a
// terminal and cabinets along the -x wall, cardboard obstacles. Floor at y = 0.
import { THREE } from '../../engine2/core.js';
import { Parts, mat4, rod, boxUV, canvas, canvasTex, noise2, fbm, normalFromHeight, greyCanvas, RoundedBoxGeometry, V } from './archive_util.js';
import { rng } from './kit.js';

export const LAB = { x0: -5, x1: 5, z0: -9, z1: 5, h: 3.0, sill: 0.95, head: 2.35 };

// ---------------------------------------------------------------- textures

// vinyl-composition tile, 4 x 4 tiles of 12" (1.219 m per repeat): colour, roughness, normal
function vctTextures(seed = 5) {
  const n = 1024, T = 256;
  const R = rng(seed);
  const nz = noise2(seed + 1);
  const col = canvas(n, n);
  const g = col.getContext('2d');
  const img = g.createImageData(n, n);
  const tileTone = [];
  for (let i = 0; i < 16; i++) {
    let k = 1 + 0.05 * (R() - 0.5);
    if (R() < 0.12) k *= R() < 0.5 ? 0.93 : 1.05;
    tileTone.push(k);
  }
  const rough = new Float32Array(n * n);
  const hgt = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const ti = Math.floor(x / T), tj = Math.floor(y / T);
    const tid = tj * 4 + ti;
    const horiz = (ti + tj) % 2 === 0; // quarter-turned tiles
    const m = horiz ? fbm(nz, x / 48, y / 7, 3, 64) : fbm(nz, x / 7 + 50, y / 48, 3, 64);
    const big = fbm(nz, x / 160 + 9, y / 160 + 3, 3, 16);
    const k = tileTone[tid] * (0.9 + 0.16 * m) * (0.97 + 0.06 * big);
    const i = (y * n + x) * 4;
    img.data[i] = 128 * k;
    img.data[i + 1] = 119 * k;
    img.data[i + 2] = 102 * k;
    img.data[i + 3] = 255;
    rough[y * n + x] = 0.3 + 0.18 * fbm(nz, x / 90 + 30, y / 90, 3, 16) + 0.05 * m;
    hgt[y * n + x] = 0.02 * m;
  }
  g.putImageData(img, 0, 0);
  // chips: small flecks elongated along each tile's streak direction
  for (let tid = 0; tid < 16; tid++) {
    const ti = tid % 4, tj = Math.floor(tid / 4);
    const horiz = (ti + tj) % 2 === 0;
    for (let k = 0; k < 1600; k++) {
      const x = ti * T + R() * T, y = tj * T + R() * T;
      const L = 1 + R() * 4, w = 0.6 + R() * 1.2;
      const c = R();
      g.fillStyle = c < 0.45 ? `rgba(78,70,60,${0.35 + 0.4 * R()})` : c < 0.9 ? `rgba(196,188,170,${0.3 + 0.4 * R()})` : `rgba(140,98,70,${0.4})`;
      g.beginPath();
      g.ellipse(x, y, horiz ? L : w, horiz ? w : L, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  // scuffs and heel marks
  for (let k = 0; k < 40; k++) {
    const x = R() * n, y = R() * n, a = R() * Math.PI;
    g.strokeStyle = `rgba(30,26,22,${0.06 + 0.12 * R()})`;
    g.lineWidth = 1 + R() * 2.5;
    g.beginPath();
    g.arc(x, y, 8 + R() * 30, a, a + 0.3 + R() * 0.8);
    g.stroke();
    for (let yy = -4; yy < 4; yy++) for (let xx = -20; xx < 20; xx++) {
      const px = ((Math.round(x + xx) % n) + n) % n, py = ((Math.round(y + yy) % n) + n) % n;
      rough[py * n + px] = Math.min(0.7, rough[py * n + px] + 0.04);
    }
  }
  // seams (grime in the joints) and their grooves
  for (let s = 0; s <= 4; s++) {
    const p = s * T;
    g.fillStyle = 'rgba(78,70,60,0.32)';
    g.fillRect(p - 1, 0, 2, n);
    g.fillRect(0, p - 1, n, 2);
    g.fillStyle = 'rgba(90,82,70,0.06)';
    g.fillRect(p - 4, 0, 8, n);
    g.fillRect(0, p - 4, n, 8);
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = Math.min(x % T, T - (x % T)), dy = Math.min(y % T, T - (y % T));
    const d = Math.min(dx, dy);
    if (d < 3) {
      hgt[y * n + x] -= 0.25 * (1 - d / 3) ** 2;
      rough[y * n + x] = Math.min(0.8, rough[y * n + x] + 0.3 * (1 - d / 3));
    }
  }
  return {
    map: canvasTex(col),
    roughnessMap: canvasTex(greyCanvas(rough, n, n), { srgb: false }),
    normalMap: canvasTex(normalFromHeight(hgt, n, n, 1.6), { srgb: false }),
    size: 4 * 0.3048,
  };
}

// painted concrete block: 3 blocks x 6 courses = 1.2 m square; colour (paint), roughness, normal
function blockTextures(seed = 9, paint = [196, 198, 178]) {
  const n = 1024;
  const R = rng(seed);
  const nz = noise2(seed + 3);
  const px = n / 1.2; // pixels per metre
  const joint = 0.0095 * px;
  const hgt = new Float32Array(n * n);
  const rough = new Float32Array(n * n);
  const shade = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    const course = Math.floor(y / (0.2 * px));
    const off = course % 2 ? 0.2 * px : 0;
    const yy = y - course * 0.2 * px;
    for (let x = 0; x < n; x++) {
      const xx = ((x + off) % (0.4 * px));
      const d = Math.min(yy, 0.2 * px - yy, xx, 0.4 * px - xx);
      let h = 1;
      if (d < joint) {
        const u = d / joint; // 0 at the joint centre
        h = 0.78 + 0.22 * Math.sin((u * Math.PI) / 2) ** 2;
      }
      const f = fbm(nz, x / 16, y / 16, 3, 64);
      h += 0.025 * f;
      hgt[y * n + x] = h;
      rough[y * n + x] = 0.55 + 0.1 * f;
      shade[y * n + x] = d < joint ? 0.95 + 0.05 * (d / joint) : 1;
    }
  }
  // the pores of the block, softened by paint
  for (let k = 0; k < 26000; k++) {
    const cx = Math.floor(R() * n), cy = Math.floor(R() * n), r = 0.8 + R() * R() * 3.2, dep = 0.06 + 0.12 * R();
    for (let yy = -4; yy <= 4; yy++) for (let xx = -4; xx <= 4; xx++) {
      const q = Math.hypot(xx, yy) / r;
      if (q > 1) continue;
      const i = (((cy + yy) % n + n) % n) * n + (((cx + xx) % n + n) % n);
      hgt[i] -= dep * (1 - q * q);
      rough[i] = Math.min(0.85, rough[i] + 0.12 * (1 - q));
      shade[i] *= 1 - 0.1 * (1 - q);
    }
  }
  const col = canvas(n, n);
  const g = col.getContext('2d');
  const img = g.createImageData(n, n);
  for (let i = 0; i < n * n; i++) {
    const v = shade[i] * (0.97 + 0.05 * fbm(nz, (i % n) / 200 + 7, Math.floor(i / n) / 200, 2, 8));
    img.data[i * 4] = paint[0] * v;
    img.data[i * 4 + 1] = paint[1] * v;
    img.data[i * 4 + 2] = paint[2] * v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return {
    map: canvasTex(col),
    roughnessMap: canvasTex(greyCanvas(rough, n, n), { srgb: false }),
    normalMap: canvasTex(normalFromHeight(hgt, n, n, 3.0), { srgb: false }),
  };
}

// fissured acoustic ceiling tile (one 2' x 4' tile)
function ceilingTexture(seed = 4) {
  const c = canvas(256, 512);
  const g = c.getContext('2d');
  const R = rng(seed);
  g.fillStyle = '#d9d5ca';
  g.fillRect(0, 0, 256, 512);
  for (let k = 0; k < 700; k++) {
    g.strokeStyle = `rgba(120,112,100,${0.2 + 0.3 * R()})`;
    g.lineWidth = 0.6 + R();
    const x = R() * 256, y = R() * 512;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + (R() - 0.5) * 8, y + (R() - 0.5) * 8, x + (R() - 0.5) * 10, y + (R() - 0.5) * 10);
    g.stroke();
  }
  return canvasTex(c);
}

// the outside, seen through the windows: bright overcast-to-sun sky over trees and a low building
function exteriorTexture(seed = 3) {
  const w = 1024, h = 512;
  const c = canvas(w, h);
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#c9d6e2');
  sky.addColorStop(0.55, '#eef1ee');
  sky.addColorStop(1, '#f4f1e6');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  const nz = noise2(seed);
  const img = g.getImageData(0, 0, w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const top = 0.5 + 0.2 * fbm(nz, x / 90, 3, 4, 64) + 0.08 * Math.sin(x / 70);
    const f = fbm(nz, x / 18, y / 18, 4, 64);
    const yy = y / h;
    if (yy > top - 0.12 * f) {
      const k = 0.55 + 0.35 * f;
      const i = (y * w + x) * 4;
      const a = Math.min(1, (yy - (top - 0.12 * f)) * 30) * 0.9;
      img.data[i] = img.data[i] * (1 - a) + 88 * k * a;
      img.data[i + 1] = img.data[i + 1] * (1 - a) + 104 * k * a;
      img.data[i + 2] = img.data[i + 2] * (1 - a) + 74 * k * a;
    }
  }
  g.putImageData(img, 0, 0);
  g.fillStyle = 'rgba(200,190,170,0.9)';
  g.fillRect(560, 330, 300, 130);
  g.fillStyle = 'rgba(150,140,125,0.9)';
  g.fillRect(560, 325, 300, 8);
  return canvasTex(c, { repeat: [1, 1] });
}

// a chalkboard: dark slate, smudges of erased chalk, faint diagrams and lines of maths
function chalkTexture(seed = 12) {
  const w = 1024, h = 400;
  const c = canvas(w, h);
  const g = c.getContext('2d');
  const R = rng(seed);
  g.fillStyle = '#26302b';
  g.fillRect(0, 0, w, h);
  for (let k = 0; k < 30; k++) {
    const x = R() * w, y = R() * h;
    const gr = g.createRadialGradient(x, y, 0, x, y, 60 + R() * 140);
    gr.addColorStop(0, `rgba(190,196,188,${0.05 + 0.06 * R()})`);
    gr.addColorStop(1, 'rgba(190,196,188,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  }
  // erasing strokes
  g.strokeStyle = 'rgba(200,205,198,0.05)';
  for (let k = 0; k < 40; k++) {
    g.lineWidth = 20 + R() * 30;
    g.beginPath();
    const y = R() * h;
    g.moveTo(R() * w * 0.3, y);
    g.lineTo(w * 0.5 + R() * w * 0.5, y + (R() - 0.5) * 60);
    g.stroke();
  }
  // chalk writing: wobbly glyph-like strokes in rows, a diagram of the cart's view
  g.strokeStyle = 'rgba(232,234,226,0.75)';
  g.lineCap = 'round';
  for (let row = 0; row < 5; row++) {
    let x = 40 + R() * 30;
    const y = 50 + row * 62;
    const end = 420 + R() * 120;
    while (x < end) {
      g.lineWidth = 1.6 + R() * 0.8;
      g.beginPath();
      const s = 8 + R() * 10;
      g.moveTo(x, y + (R() - 0.5) * s);
      for (let q = 0; q < 3; q++) g.lineTo(x + R() * s, y + (R() - 0.5) * s * 1.6);
      g.stroke();
      x += s + 4 + (R() < 0.15 ? 18 : 0);
    }
  }
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(620, 80);
  g.lineTo(620, 330);
  g.lineTo(960, 330);
  g.stroke();
  g.beginPath();
  for (let k = 0; k <= 40; k++) {
    const x = 630 + k * 8, y = 320 - 210 * (1 - Math.exp(-k / 11)) + Math.sin(k * 1.7) * 4;
    if (k) g.lineTo(x, y);
    else g.moveTo(x, y);
  }
  g.stroke();
  for (let k = 0; k < 9; k++) {
    g.beginPath();
    g.arc(650 + k * 30, 360, 3.5, 0, Math.PI * 2);
    g.stroke();
  }
  return canvasTex(c);
}

function clockFace() {
  const n = 512;
  const c = canvas(n, n);
  const g = c.getContext('2d');
  g.fillStyle = '#efece2';
  g.fillRect(0, 0, n, n);
  g.translate(n / 2, n / 2);
  g.fillStyle = '#1a1a1a';
  for (let k = 0; k < 60; k++) {
    g.save();
    g.rotate((k / 60) * Math.PI * 2);
    if (k % 5 === 0) g.fillRect(-5, -236, 10, 34);
    else g.fillRect(-2, -236, 4, 14);
    g.restore();
  }
  g.font = '600 58px "Noto Sans SC Variable", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let k = 1; k <= 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    g.fillText(String(k), Math.sin(a) * 168, -Math.cos(a) * 168);
  }
  return canvasTex(c);
}

// ---------------------------------------------------------------- the room

export function buildLab(st, { paint = [204, 203, 184] } = {}) {
  const grp = new THREE.Group();
  const { x0, x1, z0, z1, h, sill, head } = LAB;
  const M = (o) => new THREE.MeshPhysicalMaterial(o);
  const vct = vctTextures();
  const fw = x1 - x0, fd = z1 - z0;
  for (const k of ['map', 'roughnessMap', 'normalMap']) vct[k].repeat.set(fw / vct.size, fd / vct.size);
  const floorMat = M({ map: vct.map, roughnessMap: vct.roughnessMap, normalMap: vct.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 1, clearcoat: 0.18, clearcoatRoughness: 0.4 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(fw, fd), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
  floor.receiveShadow = true;
  grp.add(floor);

  const blk = blockTextures(9, paint);
  const wallMat = (len, hh) => {
    const m = M({ map: blk.map.clone(), roughnessMap: blk.roughnessMap.clone(), normalMap: blk.normalMap.clone(), roughness: 1, normalScale: new THREE.Vector2(0.8, 0.8) });
    for (const k of ['map', 'roughnessMap', 'normalMap']) {
      m[k].needsUpdate = true;
      m[k].repeat.set(len / 1.2, hh / 1.2);
    }
    return m;
  };
  const W = new Parts();
  const mats = {
    base: M({ color: 0x2b211b, roughness: 0.45 }),
    frame: M({ color: 0x8b8f8c, metalness: 0.5, roughness: 0.42 }),
    sillM: M({ color: 0xb9b5a8, roughness: 0.6 }),
    tbar: M({ color: 0xe2ded2, metalness: 0.3, roughness: 0.4 }),
    slat: M({ color: 0xd8d2c0, metalness: 0.3, roughness: 0.38, side: THREE.DoubleSide }),
    cord: M({ color: 0xcfc8b6, roughness: 0.7 }),
    door: M({ ...st.pbr('Wood022', { repeat: [1, 2] }), color: 0x9a7650, roughness: 0.5, clearcoat: 0.3 }),
    doorFrame: M({ color: 0x55605a, metalness: 0.4, roughness: 0.45 }),
    knob: M({ color: 0xc8c2b0, metalness: 1, roughness: 0.25 }),
    chalk: M({ map: chalkTexture(), roughness: 0.92 }),
    alu: M({ color: 0xb6b9bb, metalness: 1, roughness: 0.35 }),
    desk: M({ color: 0x737b72, metalness: 0.4, roughness: 0.45, clearcoat: 0.2 }),
    deskTop: M({ color: 0x5c5a50, roughness: 0.55 }),
    cab: M({ color: 0x8e918b, metalness: 0.4, roughness: 0.42, clearcoat: 0.2 }),
    beige: M({ color: 0xc4b896, roughness: 0.42, clearcoat: 0.2 }),
    screen: M({ color: 0x050806, roughness: 0.08, clearcoat: 1, emissive: 0x0b2a12, emissiveIntensity: 0.6 }),
    key: M({ color: 0x3a3632, roughness: 0.5 }),
    conduit: M({ color: 0x9a9c98, metalness: 0.7, roughness: 0.4 }),
    unit: M({ color: 0xa79f86, metalness: 0.3, roughness: 0.48 }),
    grille: M({ color: 0x3a3a36, metalness: 0.5, roughness: 0.5 }),
    clock: M({ color: 0x2a2a2a, metalness: 0.6, roughness: 0.35 }),
    face: M({ map: clockFace(), roughness: 0.5 }),
    clockGlass: M({ color: 0xffffff, roughness: 0.02, transmission: 0, transparent: true, opacity: 0.12, metalness: 0 }),
    hand: M({ color: 0x111111, roughness: 0.5 }),
    redHand: M({ color: 0x9a1a12, roughness: 0.5 }),
    paper: M({ color: 0xd9d3c0, roughness: 0.85 }),
    cork: M({ color: 0x8c6a48, roughness: 0.9 }),
    card: M({ color: 0x9b7a52, roughness: 0.85 }),
    cardLight: M({ color: 0xa98a60, roughness: 0.85 }),
    tape: M({ color: 0xd6cba8, roughness: 0.8 }),
  };
  // --- walls (boxes, 0.2 m thick, outside the room box)
  const wall = (w, hh, p, rotY = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, 0.2), wallMat(w, hh));
    m.position.set(...p);
    m.rotation.y = rotY;
    m.castShadow = m.receiveShadow = true;
    grp.add(m);
    return m;
  };
  wall(fw + 0.4, h, [(x0 + x1) / 2, h / 2, z0 - 0.1]); // far
  wall(fw + 0.4, h, [(x0 + x1) / 2, h / 2, z1 + 0.1]); // near
  wall(fd, h, [x0 - 0.1, h / 2, (z0 + z1) / 2], Math.PI / 2); // left, solid
  // right wall: windows between z = -7.4 .. 3.4 in 4 bays of 2.4 m, piers of 0.4 m
  const bays = [];
  const piers = [z0, -7.4];
  for (let k = 0; k < 4; k++) bays.push([-7.0 + k * 2.6, -7.0 + k * 2.6 + 2.2]);
  {
    let z = z0;
    const segs = [];
    for (const [a, b] of bays) {
      segs.push([z, a]);
      z = b;
    }
    segs.push([z, z1]);
    for (const [a, b] of segs) wall(b - a, h, [x1 + 0.1, h / 2, (a + b) / 2], Math.PI / 2);
    for (const [a, b] of bays) {
      wall(b - a, sill, [x1 + 0.1, sill / 2, (a + b) / 2], Math.PI / 2);
      wall(b - a, h - head, [x1 + 0.1, (h + head) / 2, (a + b) / 2], Math.PI / 2);
    }
  }
  void piers;
  // cove base along the walls
  W.box('base', [fw, 0.1, 0.006], [(x0 + x1) / 2, 0.05, z0 + 0.003]);
  W.box('base', [fw, 0.1, 0.006], [(x0 + x1) / 2, 0.05, z1 - 0.003]);
  W.box('base', [0.006, 0.1, fd], [x0 + 0.003, 0.05, (z0 + z1) / 2]);
  W.box('base', [0.006, 0.1, fd], [x1 - 0.003, 0.05, (z0 + z1) / 2]);
  // window frames, mullions, sills and venetian blinds
  for (const [a, b] of bays) {
    const zc = (a + b) / 2, L = b - a;
    W.box('sillM', [0.24, 0.03, L + 0.06], [x1 - 0.02, sill + 0.015, zc]);
    for (const z of [a + 0.03, zc, b - 0.03]) W.box('frame', [0.08, head - sill, 0.05], [x1 + 0.06, (sill + head) / 2, z]);
    W.box('frame', [0.08, 0.05, L], [x1 + 0.06, head - 0.025, zc]);
    W.box('frame', [0.08, 0.04, L], [x1 + 0.06, sill + 0.02, zc]);
    W.box('frame', [0.06, 0.03, L], [x1 + 0.06, sill + 0.62, zc]);
    // blinds: lowered to different heights, slats tilted
    const low = [1.55, 1.35, 1.7, 1.45][bays.indexOf(bays.find((q) => q[0] === a))];
    W.box('slat', [0.06, 0.05, L - 0.08], [x1 - 0.04, head - 0.06, zc]);
    for (let y = head - 0.1; y > low; y -= 0.024) W.box('slat', [0.025, 0.0015, L - 0.1], [x1 - 0.045, y, zc], { rot: [0, 0, -0.55] });
    W.box('slat', [0.03, 0.012, L - 0.1], [x1 - 0.045, low - 0.01, zc]);
    for (const dz of [-L / 3, 0, L / 3]) W.rod('cord', [x1 - 0.045, head - 0.08, zc + dz], [x1 - 0.045, low, zc + dz], 0.0012);
  }
  // unit ventilator under the windows
  W.box('unit', [0.4, 0.72, 10.6], [x1 - 0.2, 0.36, -1.9], { bevel: 0.01 });
  W.box('grille', [0.3, 0.004, 10.4], [x1 - 0.2, 0.722, -1.9]);
  for (let k = 0; k < 60; k++) W.box('unit', [0.3, 0.006, 0.012], [x1 - 0.2, 0.726, -7.0 + k * 0.175]);
  // ceiling grid and troffers
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(fw, fd), M({ map: (() => { const t = ceilingTexture(); t.repeat.set(fw / 0.61, fd / 1.22); return t; })(), roughness: 0.95 }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set((x0 + x1) / 2, h, (z0 + z1) / 2);
  ceil.castShadow = ceil.receiveShadow = true;
  grp.add(ceil);
  for (let x = x0; x <= x1 + 1e-6; x += 0.61) W.box('tbar', [0.024, 0.012, fd], [x, h - 0.006, (z0 + z1) / 2]);
  for (let z = z0; z <= z1 + 1e-6; z += 1.22) W.box('tbar', [fw, 0.012, 0.024], [(x0 + x1) / 2, h - 0.006, z]);
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xb8b8b0, roughness: 0.3, emissive: 0xd8e0d8, emissiveIntensity: 0.08 }); // lights off: daylight only
  const lights = new Parts();
  for (const x of [-3.2, -0.15, 2.9]) for (let z = -7.5; z < 4; z += 2.44) {
    lights.box('lens', [0.58, 0.01, 1.19], [x, h - 0.012, z + 0.61]);
    for (let k = 1; k < 8; k++) W.box('tbar', [0.004, 0.004, 1.19], [x - 0.29 + k * 0.0725, h - 0.019, z + 0.61]);
  }
  grp.add(lights.build({ lens: lightMat }, { cast: false, receive: false }));
  // far wall: a door (right), a chalkboard (centre-left), a clock above
  W.box('doorFrame', [1.02, 2.16, 0.06], [3.3, 1.08, z0 + 0.02]);
  W.box('door', [0.9, 2.08, 0.045], [3.3, 1.04, z0 + 0.04], { uv: 1 });
  W.box('screen', [0.14, 0.6, 0.01], [3.3 - 0.25, 1.45, z0 + 0.065]);
  W.cyl('knob', 0.028, 0.028, 0.05, [3.3 + 0.36, 0.98, z0 + 0.08], { rot: [Math.PI / 2, 0, 0], seg: 20 });
  W.box('alu', [3.2, 1.25, 0.03], [-0.6, 1.55, z0 + 0.015]);
  W.box('chalk', [3.1, 1.15, 0.01], [-0.6, 1.55, z0 + 0.034]);
  W.box('alu', [3.1, 0.02, 0.07], [-0.6, 0.965, z0 + 0.05]);
  // the clock (hands returned for time-lapses)
  const clock = new THREE.Group();
  clock.position.set(1.6, 2.42, z0 + 0.02);
  const CK = new Parts();
  CK.add('clock', new THREE.TorusGeometry(0.17, 0.022, 12, 48), mat4([0, 0, 0.02]));
  CK.cyl('clock', 0.17, 0.17, 0.02, [0, 0, 0.01], { rot: [Math.PI / 2, 0, 0], seg: 48 });
  CK.add('face', new THREE.CircleGeometry(0.165, 48), mat4([0, 0, 0.0205]));
  clock.add(CK.build(mats));
  // the face texture maps through the cylinder cap: rotate so 12 is up
  const handH = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.1, 0.003).translate(0, 0.04, 0), mats.hand);
  const handM = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.145, 0.003).translate(0, 0.06, 0), mats.hand);
  const handS = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.15, 0.002).translate(0, 0.055, 0), mats.redHand);
  handH.position.z = 0.025;
  handM.position.z = 0.028;
  handS.position.z = 0.031;
  clock.add(handH, handM, handS);
  grp.add(clock);
  // conduit along the far and left walls, a junction box and switch
  W.rod('conduit', [x0, 2.72, z0 + 0.04], [x1, 2.72, z0 + 0.04], 0.012);
  W.rod('conduit', [x0 + 0.04, 2.72, z0], [x0 + 0.04, 2.72, z1], 0.012);
  W.rod('conduit', [2.6, 2.72, z0 + 0.04], [2.6, 1.3, z0 + 0.04], 0.01);
  W.box('conduit', [0.1, 0.12, 0.05], [2.6, 1.25, z0 + 0.03]);
  W.box('beige', [0.07, 0.11, 0.008], [2.6, 1.25, z0 + 0.058]);
  // a cork board with papers on the left wall
  W.box('cork', [0.02, 0.9, 1.4], [x0 + 0.01, 1.6, -5.2]);
  const RP = rng(31);
  for (let k = 0; k < 7; k++) W.box('paper', [0.003, 0.28, 0.215], [x0 + 0.022, 1.35 + RP() * 0.5, -5.75 + k * 0.17 + RP() * 0.05], { rot: [(RP() - 0.5) * 0.08, 0, 0] });
  // steel desk with a terminal, against the left wall
  const dx = x0 + 0.42, dz = -2.8;
  W.box('deskTop', [0.78, 0.035, 1.5], [dx, 0.745, dz], { bevel: 0.004 });
  W.box('desk', [0.74, 0.71, 0.42], [dx, 0.355, dz - 0.52], { bevel: 0.006 });
  W.box('desk', [0.74, 0.71, 0.02], [dx + 0.02, 0.355, dz + 0.73]);
  for (let k = 0; k < 3; k++) W.box('alu', [0.01, 0.015, 0.12], [dx + 0.375, 0.6 - k * 0.22, dz - 0.52]);
  // terminal: a beige CRT case and a detached keyboard
  W.box('beige', [0.42, 0.36, 0.46], [dx - 0.04, 0.945, dz], { bevel: 0.02 });
  W.box('beige', [0.3, 0.25, 0.3], [dx - 0.12, 0.92, dz], { bevel: 0.03 });
  W.box('screen', [0.012, 0.24, 0.3], [dx + 0.18, 0.96, dz]);
  W.box('beige', [0.2, 0.04, 0.46], [dx + 0.3, 0.785, dz], { bevel: 0.01 });
  for (let r = 0; r < 4; r++) for (let k = 0; k < 13; k++) W.box('key', [0.016, 0.01, 0.016], [dx + 0.25 + r * 0.022, 0.81, dz - 0.15 + k * 0.024 + r * 0.004]);
  // a steel cabinet and a filing cabinet
  W.box('cab', [0.46, 1.95, 0.92], [x0 + 0.24, 0.975, -6.4], { bevel: 0.006 });
  W.box('grille', [0.004, 1.9, 0.004], [x0 + 0.472, 0.975, -6.4]);
  W.box('alu', [0.02, 0.12, 0.02], [x0 + 0.48, 1.05, -6.43]);
  W.box('cab', [0.7, 1.33, 0.46], [x0 + 0.36, 0.665, 0.6], { bevel: 0.006 });
  for (let k = 0; k < 4; k++) {
    W.box('grille', [0.004, 0.004, 0.44], [x0 + 0.712, 0.33 + k * 0.33, 0.6]);
    W.box('alu', [0.02, 0.02, 0.12], [x0 + 0.72, 0.5 + k * 0.33 - 0.33 + 0.33, 0.6]);
  }
  // cardboard: a stack of boxes in the far corner, and one of Moravec's polygonal cardboard obstacles
  W.box('card', [0.5, 0.4, 0.42], [-4.4, 0.2, -8.5], { bevel: 0.005 });
  W.box('cardLight', [0.42, 0.32, 0.36], [-4.35, 0.56, -8.48], { rot: [0, 0.2, 0], bevel: 0.005 });
  W.box('tape', [0.06, 0.002, 0.43], [-4.4, 0.401, -8.5]);
  grp.add(W.build(mats));
  const ico = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), mats.cardLight);
  ico.material = mats.cardLight.clone();
  ico.material.flatShading = true;
  ico.position.set(-3.2, 0.34, -6.2);
  ico.rotation.set(0.3, 0.5, 0.1);
  ico.castShadow = ico.receiveShadow = true;
  grp.add(ico);

  // the outside: bright, seen only through the windows (never casts shadows)
  const ext = new THREE.Mesh(new THREE.PlaneGeometry(18, 7), new THREE.MeshBasicMaterial({ map: exteriorTexture(), color: new THREE.Color(4, 4, 4), fog: false }));
  ext.position.set(x1 + 4, 1.6, -2);
  ext.rotation.y = -Math.PI / 2;
  grp.add(ext);

  // the sun through the windows (direction set by the shot), and a soft overhead fill
  const sun = new THREE.DirectionalLight(0xfff1dc, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -8;
  sc.right = 8;
  sc.top = 8;
  sc.bottom = -8;
  sc.near = 0.5;
  sc.far = 30;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  grp.add(sun, sun.target);

  return {
    group: grp,
    sun,
    // the sun from azimuth/elevation (radians; azimuth 0 = from +x straight across the room, + toward +z)
    setSun(az, el, intensity, centre = V(0, 0, -2)) {
      const d = V(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
      sun.target.position.copy(centre);
      sun.position.copy(centre).addScaledVector(d, 14);
      sun.intensity = intensity;
      sun.target.updateMatrixWorld();
    },
    // wall clock: hours as a float (e.g. 14.5 = 2:30)
    setClock(hours) {
      const hh = hours % 12, mm = (hours * 60) % 60, ss = (hours * 3600) % 60;
      handH.rotation.z = -(hh / 12) * Math.PI * 2;
      handM.rotation.z = -(mm / 60) * Math.PI * 2;
      handS.rotation.z = -(ss / 60) * Math.PI * 2;
    },
  };
}
