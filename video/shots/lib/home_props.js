// Small things from a lived-in home, shared by shots/balance.js, shots/home.js and shots/design.js: a toddler's
// wooden ABC blocks and cup, bowls of many shapes, cups, books, fruit, a potted plant. Units are metres; every
// object sits on y = 0 (its foot or base) and is centred on its own axis unless noted.
import { THREE } from '../../engine2/core.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { porcelainMaterial, bowlGeometry } from '../../engine2/dishes.js';
import { rng } from './kit.js';

const canvas = (w, h = w) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

// ---------------------------------------------------------------- wooden ABC blocks
// beech with a painted frame and a raised letter on each face (a bump map lifts the paint a hair)
const PAINT = {
  red: '#b8392c', blue: '#2f5f9e', yellow: '#e0a92a', green: '#4d8a4a', orange: '#d4682a', teal: '#2f8582',
};
function beech(g, n, R) {
  g.fillStyle = '#d9b98c';
  g.fillRect(0, 0, n, n);
  // grain: long soft streaks with a few darker lines
  for (let k = 0; k < 70; k++) {
    const y = R() * n, w = 1 + R() * 3;
    g.fillStyle = `rgba(${150 + R() * 40 | 0},${100 + R() * 30 | 0},${55 + R() * 20 | 0},${0.05 + R() * 0.12})`;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= n; x += n / 8) g.lineTo(x, y + Math.sin(x / n * 6 + k) * 4 + (R() - 0.5) * 2);
    g.lineTo(n, y + w);
    for (let x = n; x >= 0; x -= n / 8) g.lineTo(x, y + w + Math.sin(x / n * 6 + k) * 4);
    g.fill();
  }
  // pores
  g.fillStyle = 'rgba(120,80,40,0.18)';
  for (let k = 0; k < 500; k++) g.fillRect(R() * n, R() * n, 2 + R() * 4, 1);
}

// faces: [{ ch, color }] x 6 (+x, -x, +y, -y, +z, -z)
function blockFaceTextures(faces, seed) {
  const n = 256;
  const maps = [], bumps = [];
  faces.forEach((f, i) => {
    const R = rng(seed * 31 + i * 7 + 1);
    const c = canvas(n), g = c.getContext('2d');
    const b = canvas(n), h = b.getContext('2d');
    beech(g, n, R);
    h.fillStyle = '#000';
    h.fillRect(0, 0, n, n);
    const col = PAINT[f.color] || f.color;
    // a painted frame, worn on the corners
    const m = n * 0.07, wdt = n * 0.075;
    g.strokeStyle = col;
    g.lineWidth = wdt;
    g.strokeRect(m + wdt / 2, m + wdt / 2, n - 2 * m - wdt, n - 2 * m - wdt);
    h.strokeStyle = '#fff';
    h.lineWidth = wdt;
    h.strokeRect(m + wdt / 2, m + wdt / 2, n - 2 * m - wdt, n - 2 * m - wdt);
    if (f.ch) {
      const fs = n * (f.ch.length > 1 ? 0.42 : 0.56);
      g.font = `700 ${fs}px Georgia, "Noto Serif SC Variable", serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = col;
      g.fillText(f.ch, n / 2, n * 0.53);
      h.font = g.font;
      h.textAlign = 'center';
      h.textBaseline = 'middle';
      h.fillStyle = '#fff';
      h.fillText(f.ch, n / 2, n * 0.53);
    }
    // wear: paint rubbed off in a few spots, a few dents
    for (let k = 0; k < 26; k++) {
      const x = R() < 0.5 ? m + R() * wdt * 1.4 : n - m - R() * wdt * 1.4, y = R() * n;
      const [xx, yy] = R() < 0.5 ? [x, y] : [y, x];
      g.fillStyle = `rgba(217,185,140,${0.4 + R() * 0.5})`;
      g.beginPath();
      g.ellipse(xx, yy, 1 + R() * 5, 1 + R() * 3, R() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(60,40,20,0.08)';
    for (let k = 0; k < 8; k++) {
      g.beginPath();
      g.arc(R() * n, R() * n, 1 + R() * 2, 0, Math.PI * 2);
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    maps.push(t);
    const bt = new THREE.CanvasTexture(b);
    bt.anisotropy = 4;
    bumps.push(bt);
  });
  return { maps, bumps };
}

export function toyBlock({ size = 0.032, faces, seed = 1 } = {}) {
  const fc = faces || [
    { ch: 'A', color: 'red' }, { ch: 'B', color: 'blue' }, { ch: 'C', color: 'green' },
    { ch: 'D', color: 'yellow' }, { ch: 'E', color: 'orange' }, { ch: 'F', color: 'teal' },
  ];
  const { maps, bumps } = blockFaceTextures(fc, seed);
  const mats = maps.map((m, i) => new THREE.MeshPhysicalMaterial({
    map: m, bumpMap: bumps[i], bumpScale: 0.6, roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.5,
  }));
  const geo = new RoundedBoxGeometry(size, size, size, 3, size * 0.07);
  const mesh = new THREE.Mesh(geo, mats);
  mesh.position.y = size / 2;
  mesh.castShadow = mesh.receiveShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  g.userData.size = size;
  return g;
}

// ---------------------------------------------------------------- a toddler's cup: glazed, soft blue, a cream rim, one or two loop handles
function lathe(points, segs = 96) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-5), y)), segs);
}
function smoothProfile(pts, n = 120) {
  const c = new THREE.CatmullRomCurve3(pts.map(([r, y]) => new THREE.Vector3(r, y, 0)), false, 'centripetal');
  return c.getSpacedPoints(n).map((p) => [p.x, p.y]);
}

function rimBandTexture(bands, base = '#f5f2ea') {
  // bands: [[v0, v1, css colour]] along the profile's v (0 = outside bottom centre .. 1 = inside centre)
  const H = 1024;
  const c = canvas(8, H), g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 8, H);
  for (const [v0, v1, col] of bands) {
    g.fillStyle = col;
    g.fillRect(0, (1 - v1) * H, 8, (v1 - v0) * H);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// a lathe whose uv.y is the arc length along the profile (0..1), so bands can be painted by height
function arcLathe(pts, segs = 96) {
  const g = lathe(pts, segs);
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const uv = g.attributes.uv, n = pts.length;
  for (let i = 0; i < uv.count; i++) uv.setY(i, L[i % n] / L[n - 1]);
  uv.needsUpdate = true;
  let top = 0;
  pts.forEach((p, i) => { if (p[1] > pts[top][1]) top = i; });
  g.userData.rimV = L[top] / L[n - 1];
  g.userData.L = L[n - 1];
  g.computeVertexNormals();
  return g;
}

export function kidsCup({ r = 0.03, h = 0.056, body = '#a9cbd8', rim = '#f4efe4', handles = 1 } = {}) {
  const t = 0.0012;
  const prof = smoothProfile([
    [0, 0.0006], [r * 0.82, 0.0006], [r * 0.86, 0.0], [r * 0.9, 0.002], [r * 0.93, h * 0.35], [r, h - 0.002], [r + 0.0004, h],
    [r - t * 0.5, h + 0.0006], [r - t, h - 0.002], [r * 0.93 - t, h * 0.35], [r * 0.86 - t, 0.004], [0, 0.0035],
  ], 140);
  const geo = arcLathe(prof);
  const rv = geo.userData.rimV;
  const map = rimBandTexture([[rv - 0.012, rv + 0.012, rim], [0.012, 0.03, rim]], body);
  const mat = new THREE.MeshPhysicalMaterial({ map, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.06, ior: 1.5, specularIntensity: 0.7 });
  const g = new THREE.Group();
  const cup = new THREE.Mesh(geo, mat);
  cup.castShadow = cup.receiveShadow = true;
  g.add(cup);
  // a loop handle with a navy edge
  const hc = new THREE.CatmullRomCurve3([
    new THREE.Vector3(r * 0.97, h * 0.8, 0), new THREE.Vector3(r + 0.016, h * 0.78, 0), new THREE.Vector3(r + 0.02, h * 0.5, 0),
    new THREE.Vector3(r + 0.013, h * 0.26, 0), new THREE.Vector3(r * 0.93, h * 0.24, 0),
  ]);
  const hgeo = new THREE.TubeGeometry(hc, 48, 0.0032, 14, false);
  const hmat = new THREE.MeshPhysicalMaterial({ color: body, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.06 });
  for (let k = 0; k < handles; k++) {
    const handle = new THREE.Mesh(hgeo, hmat);
    handle.scale.z = 0.75;
    handle.rotation.y = k * Math.PI;
    handle.castShadow = true;
    g.add(handle);
  }
  return g;
}

// a toddler's sippy cup: a soft-coloured body with two loop handles, a screw-on lid with a spout
export function sippyCup({ r = 0.031, h = 0.06, body = '#f2ede2', lid = '#e0735a' } = {}) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshPhysicalMaterial({ color: body, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.2, sheen: 0.2, sheenColor: new THREE.Color(0xffffff) });
  const lidMat = new THREE.MeshPhysicalMaterial({ color: lid, roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.25 });
  const bp = smoothProfile([[0, 0.0015], [r * 0.84, 0.0015], [r * 0.9, 0.0], [r * 0.97, 0.004], [r, h * 0.3], [r * 0.98, h * 0.75], [r * 0.95, h], [0, h]], 90);
  const b = new THREE.Mesh(lathe(bp, 72), bodyMat);
  b.castShadow = b.receiveShadow = true;
  g.add(b);
  // the lid: a ribbed collar, a low dome, a flattened spout
  const lp = smoothProfile([[0, h - 0.002], [r * 0.97, h - 0.002], [r * 1.0, h + 0.002], [r * 1.0, h + 0.009], [r * 0.93, h + 0.012],
    [r * 0.75, h + 0.016], [r * 0.4, h + 0.019], [0, h + 0.02]], 60);
  const l = new THREE.Mesh(lathe(lp, 72), lidMat);
  l.castShadow = l.receiveShadow = true;
  g.add(l);
  const sp = smoothProfile([[0, 0], [0.011, 0], [0.0105, 0.01], [0.008, 0.019], [0.0055, 0.024], [0, 0.0245]], 40);
  const spout = new THREE.Mesh(lathe(sp, 40), lidMat);
  spout.scale.set(1, 1, 0.55);
  spout.position.set(r * 0.42, h + 0.014, 0);
  spout.rotation.z = -0.3;
  spout.castShadow = true;
  g.add(spout);
  // handles, matching the lid
  const hc = new THREE.CatmullRomCurve3([
    new THREE.Vector3(r * 0.96, h * 0.72, 0), new THREE.Vector3(r + 0.014, h * 0.7, 0), new THREE.Vector3(r + 0.018, h * 0.48, 0),
    new THREE.Vector3(r + 0.012, h * 0.28, 0), new THREE.Vector3(r * 0.99, h * 0.27, 0),
  ]);
  const hg = new THREE.TubeGeometry(hc, 40, 0.0036, 12, false);
  for (const a of [Math.PI / 2, -Math.PI / 2]) {
    const hh = new THREE.Mesh(hg, lidMat);
    hh.scale.z = 0.7;
    hh.rotation.y = a;
    hh.castShadow = true;
    g.add(hh);
  }
  return g;
}

// ---------------------------------------------------------------- bowls of many shapes
// each: { prof: outside-then-inside profile [[r, y]], glaze } ; foot on y = 0
export const BOWLS = {
  // a deep, wide noodle bowl: dark tenmoku glaze breaking to rust at the rim
  noodle: {
    prof: [[0, 0.004], [0.03, 0.004], [0.032, 0], [0.036, 0], [0.037, 0.006], [0.06, 0.02], [0.08, 0.045], [0.09, 0.07], [0.092, 0.08],
      [0.0905, 0.0815], [0.088, 0.078], [0.078, 0.046], [0.058, 0.022], [0.03, 0.01], [0, 0.009]],
    glaze: { color: 0x2a1a12, roughness: 0.14, rim: 0x8a4a22 },
  },
  // a low, wide serving dish in pale celadon
  shallow: {
    prof: [[0, 0.003], [0.05, 0.003], [0.052, 0], [0.056, 0], [0.058, 0.004], [0.09, 0.014], [0.11, 0.026], [0.116, 0.03],
      [0.114, 0.0315], [0.108, 0.027], [0.088, 0.016], [0.05, 0.008], [0, 0.007]],
    glaze: { color: 0xb9cbb4, roughness: 0.12 },
  },
  // a small dipping dish
  sauce: {
    prof: [[0, 0.002], [0.022, 0.002], [0.024, 0], [0.027, 0], [0.028, 0.004], [0.04, 0.012], [0.046, 0.019], [0.045, 0.0205],
      [0.0435, 0.018], [0.038, 0.012], [0.026, 0.006], [0, 0.005]],
    glaze: { color: 0xeeeae0, roughness: 0.1, rim: 0x2c4a8c },
  },
  // a speckled stoneware cereal bowl, oatmeal glaze over a bare foot
  cereal: {
    prof: [[0, 0.004], [0.026, 0.004], [0.028, 0], [0.033, 0], [0.034, 0.006], [0.05, 0.016], [0.066, 0.036], [0.072, 0.056], [0.0735, 0.064],
      [0.072, 0.065], [0.0695, 0.056], [0.0635, 0.037], [0.048, 0.019], [0.028, 0.011], [0, 0.01]],
    glaze: { color: 0xd8cdb8, roughness: 0.35, speckle: true, foot: 0xa9876a },
  },
  // a turned wooden salad bowl
  wood: {
    prof: [[0, 0.004], [0.04, 0.004], [0.042, 0], [0.048, 0], [0.05, 0.006], [0.08, 0.025], [0.1, 0.052], [0.106, 0.075], [0.1045, 0.078],
      [0.1, 0.075], [0.094, 0.053], [0.076, 0.029], [0.046, 0.013], [0, 0.011]],
    glaze: { wood: true },
  },
};

function glazeTexture(glaze, rimV, seed) {
  const H = 1024, Wd = 512;
  const c = canvas(Wd, H), g = c.getContext('2d');
  // the hex is sRGB, and so is the texture
  const sc = new THREE.Color(glaze.color).convertLinearToSRGB();
  const base = `rgb(${sc.r * 255 | 0},${sc.g * 255 | 0},${sc.b * 255 | 0})`;
  g.fillStyle = base;
  g.fillRect(0, 0, Wd, H);
  const R = rng(seed);
  if (glaze.foot != null) {
    const fc = new THREE.Color(glaze.foot).convertLinearToSRGB();
    g.fillStyle = `rgb(${fc.r * 255 | 0},${fc.g * 255 | 0},${fc.b * 255 | 0})`;
    g.fillRect(0, H * (1 - 0.06), Wd, H * 0.06);
  }
  if (glaze.rim != null) {
    const rc = new THREE.Color(glaze.rim).convertLinearToSRGB();
    const gr = g.createLinearGradient(0, (1 - rimV - 0.03) * H, 0, (1 - rimV + 0.08) * H);
    gr.addColorStop(0, `rgba(${rc.r * 255 | 0},${rc.g * 255 | 0},${rc.b * 255 | 0},0.0)`);
    gr.addColorStop(0.3, `rgba(${rc.r * 255 | 0},${rc.g * 255 | 0},${rc.b * 255 | 0},1)`);
    gr.addColorStop(0.7, `rgba(${rc.r * 255 | 0},${rc.g * 255 | 0},${rc.b * 255 | 0},0.9)`);
    gr.addColorStop(1, `rgba(${rc.r * 255 | 0},${rc.g * 255 | 0},${rc.b * 255 | 0},0)`);
    g.fillStyle = gr;
    g.fillRect(0, (1 - rimV - 0.03) * H, Wd, 0.11 * H);
  }
  if (glaze.speckle) {
    for (let k = 0; k < 2600; k++) {
      g.fillStyle = `rgba(${60 + R() * 40 | 0},${45 + R() * 30 | 0},${30 + R() * 20 | 0},${0.3 + R() * 0.6})`;
      g.beginPath();
      g.arc(R() * Wd, R() * H, 0.4 + R() * R() * 2.2, 0, Math.PI * 2);
      g.fill();
    }
  }
  // a faint unevenness in the glaze
  for (let k = 0; k < 30; k++) {
    const x = R() * Wd, y = R() * H, r = 20 + R() * 80;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${R() < 0.5 ? '0,0,0' : '255,255,255'},0.05)`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

const BOWL_CACHE = new Map();
export function bowl(studio, kind = 'rice', { seed = 3 } = {}) {
  if (kind === 'rice') {
    // the film's rice bowl, re-turned with a lighter mesh (the same profile, every third point, 80 segments)
    let e = BOWL_CACHE.get('rice');
    if (!e || e.studio !== studio) {
      const full = bowlGeometry();
      const pos = full.attributes.position;
      const n = full.userData.inner ? Math.round(pos.count / 161) : 221;
      const prof = [];
      for (let i = 0; i < n; i += 3) prof.push([Math.hypot(pos.getX(i), pos.getZ(i)), pos.getY(i)]);
      if ((n - 1) % 3) prof.push([Math.hypot(pos.getX(n - 1), pos.getZ(n - 1)), pos.getY(n - 1)]);
      const geo = arcLathe(prof, 80);
      e = { studio, geo, mat: porcelainMaterial() };
      BOWL_CACHE.set('rice', e);
    }
    const m = new THREE.Mesh(e.geo, e.mat);
    m.castShadow = m.receiveShadow = true;
    return m;
  }
  const B = BOWLS[kind];
  let entry = BOWL_CACHE.get(kind);
  if (!entry || entry.studio !== studio) {
    const geo = arcLathe(smoothProfile(B.prof, 90), 72);
    let mat;
    if (B.glaze.wood) {
      const w = studio.pbr('Wood026', { repeat: [2, 1] });
      mat = new THREE.MeshPhysicalMaterial({ ...w, color: 0xd8b088, roughness: 0.5, clearcoat: 0.5, clearcoatRoughness: 0.25 });
    } else {
      mat = new THREE.MeshPhysicalMaterial({
        map: glazeTexture(B.glaze, geo.userData.rimV, seed), roughness: B.glaze.roughness, clearcoat: 1, clearcoatRoughness: 0.05, ior: 1.5,
      });
    }
    entry = { studio, geo, mat };
    BOWL_CACHE.set(kind, entry);
  }
  const m = new THREE.Mesh(entry.geo, entry.mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------- a glass tumbler and a mug
export function tumbler({ r = 0.034, h = 0.095 } = {}) {
  const t = 0.0018;
  const prof = [[0, 0.0], [r * 0.92, 0.0], [r * 0.95, 0.003], [r, h], [r - t, h], [r * 0.95 - t, 0.008], [0, 0.007]];
  const geo = lathe(smoothProfile(prof, 80), 64);
  geo.computeVertexNormals();
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, transmission: 1, thickness: 0.003, ior: 1.5, transparent: true, opacity: 1 });
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = false;
  return m;
}

export function mug({ r = 0.041, h = 0.092, color = 0x7d8f86 } = {}) {
  const t = 0.004;
  const prof = smoothProfile([[0, 0.003], [r - 0.006, 0.003], [r - 0.004, 0], [r, 0.006], [r, h - 0.003], [r - 0.001, h], [r - t, h - 0.002], [r - t, 0.012], [0, 0.011]], 100);
  const g = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15 });
  const body = new THREE.Mesh(lathe(prof, 72), mat);
  body.geometry.computeVertexNormals();
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  const hc = new THREE.CatmullRomCurve3([
    new THREE.Vector3(r - 0.002, h * 0.78, 0), new THREE.Vector3(r + 0.022, h * 0.74, 0), new THREE.Vector3(r + 0.026, h * 0.45, 0),
    new THREE.Vector3(r + 0.016, h * 0.25, 0), new THREE.Vector3(r - 0.002, h * 0.22, 0),
  ]);
  const handle = new THREE.Mesh(new THREE.TubeGeometry(hc, 40, 0.006, 12, false), mat);
  handle.scale.z = 0.6;
  handle.castShadow = true;
  g.add(handle);
  return g;
}
