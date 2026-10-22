// A cool grid of light that tries to lay itself over a room (shots/home.js, mode 'grid'): a perfect chessboard grid
// hovers, sinks and drapes over whatever is there (it follows a height field of the room rendered from above),
// strains and buckles, then breaks into fragments that drift up and go out.
import { THREE } from '../../engine2/core.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { rng, clamp, sstep, lerp } from './kit.js';

// the room's top surface, seen straight down: y of the highest surface at (x, z), sampled bilinearly
export function heightField(renderer, scene, { x0, x1, z0, z1, res = 512, hide = [] }) {
  const cam = new THREE.OrthographicCamera(x0, x1, -z0, -z1, 0.1, 20);
  // looking down -y with +x right and +z down the image
  cam.position.set(0, 10, 0);
  cam.up.set(0, 0, -1);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  // with up = -z, screen-up is -z: top of the image is z0 ... left/right/top/bottom in camera space
  cam.left = x0; cam.right = x1; cam.top = -z0; cam.bottom = -z1;
  cam.updateProjectionMatrix();
  const rt = new THREE.WebGLRenderTarget(res, res, { type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: true });
  const mat = new THREE.ShaderMaterial({
    vertexShader: `
      #include <common>
      varying float vY;
      void main() {
        vec4 wp = vec4( position, 1.0 );
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
        #endif
        wp = modelMatrix * wp;
        vY = wp.y;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `varying float vY; void main() { gl_FragColor = vec4( vY, vY, vY, 1.0 ); }`,
    side: THREE.DoubleSide,
  });
  const prevO = scene.overrideMaterial, prevB = scene.background, prevT = renderer.getRenderTarget();
  const prevC = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha();
  const prevS = renderer.shadowMap.autoUpdate;
  renderer.shadowMap.autoUpdate = false;
  const vis = hide.map((o) => o.visible);
  hide.forEach((o) => { o.visible = false; });
  scene.overrideMaterial = mat;
  scene.background = null;
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 1);
  renderer.clear();
  renderer.render(scene, cam);
  const buf = new Float32Array(res * res * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, res, res, buf);
  renderer.setRenderTarget(prevT);
  renderer.setClearColor(prevC, prevA);
  renderer.shadowMap.autoUpdate = prevS;
  scene.overrideMaterial = prevO;
  scene.background = prevB;
  hide.forEach((o, i) => { o.visible = vis[i]; });
  rt.dispose();
  mat.dispose();
  // row 0 of the read-back is the bottom of the image (z1)
  const Hm = new Float32Array(res * res);
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) Hm[j * res + i] = buf[(j * res + i) * 4];
  const sample = (x, z) => {
    const fx = clamp((x - x0) / (x1 - x0), 0, 0.99999) * (res - 1);
    const fz = clamp((z1 - z) / (z1 - z0), 0, 0.99999) * (res - 1);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const a = Hm[j * res + i], b = Hm[j * res + i + 1], c = Hm[(j + 1) * res + i], d = Hm[(j + 1) * res + i + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };
  // a max over a small footprint, so thin edges (a chair's rail) still lift the grid
  const sampleMax = (x, z, r = 0.012) => Math.max(sample(x, z), sample(x + r, z), sample(x - r, z), sample(x, z + r), sample(x, z - r));
  return { sample, sampleMax };
}

// the grid: lines every `step` m over [x0, x1] x [z0, z1], each sampled every `ds` m
export function lightGrid(hf, { x0, x1, z0, z1, step = 0.25, ds = 0.02, scale = 1, color = [0.55, 1.35, 2.1], width = 2.2, seed = 3 } = {}) {
  const pts = [];  // per sample: [x, z, line id, along (0..1)]
  const lines = [];
  const addLine = (ax, az, bx, bz) => {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.round(L / ds));
    const id = lines.length;
    const first = pts.length;
    for (let k = 0; k <= n; k++) pts.push([lerp(ax, bx, k / n), lerp(az, bz, k / n), id, k / n]);
    lines.push({ first, n, L });
  };
  for (let z = z0; z <= z1 + 1e-6; z += step) addLine(x0, z, x1, z);
  for (let x = x0; x <= x1 + 1e-6; x += step) addLine(x, z0, x, z1);
  const R = rng(seed);
  // the height of the clutter under each sample (precomputed)
  const base = pts.map(([x, z]) => hf.sampleMax(x, z) + 0.01);
  // fragments: each line is cut into pieces 0.15 - 0.6 m long; each piece drifts and fades on its own
  const segs = [];
  const frags = [];
  for (const ln of lines) {
    let k = 0;
    while (k < ln.n) {
      const len = Math.max(3, Math.round((0.15 + R() * 0.45) / ds));
      const f = { a: k, b: Math.min(ln.n, k + len), line: ln, v: [(R() - 0.5) * 0.5, 0.15 + R() * 0.55, (R() - 0.5) * 0.5], spin: (R() - 0.5) * 2.5, delay: R() * 0.35, life: 0.45 + R() * 0.5, flick: R() * 6.28 };
      frags.push(f);
      for (let q = f.a; q < f.b; q++) segs.push({ i: ln.first + q, j: ln.first + q + 1, frag: f });
      k = f.b;
    }
  }
  const geo = new LineSegmentsGeometry();
  const P = new Float32Array(segs.length * 6), C = new Float32Array(segs.length * 6);
  geo.setPositions(P);
  geo.setColors(C);
  const mat = new LineMaterial({
    color: 0xffffff, linewidth: width * scale, vertexColors: true, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
  });
  mat.resolution.set(1920 * scale, 1080 * scale);
  const obj = new LineSegments2(geo, mat);
  obj.frustumCulled = false;
  obj.renderOrder = 5;
  const Y = new Float32Array(pts.length);
  const X = new Float32Array(pts.length), Z = new Float32Array(pts.length);

  // s = { level (the sheet's height), strain 0..1 (buckling), brk (time since the break, s; < 0 before), a (opacity), draw 0..1 }
  function update(t, s) {
    const strain = s.strain || 0;
    for (let k = 0; k < pts.length; k++) {
      const [x, z, id, u] = pts[k];
      // buckling: the lines wander and kink where they ride over clutter
      const over = clamp((base[k] - 0.03) / 0.3);
      const w1 = Math.sin(u * 37 + id * 1.7 + t * 5.3) * 0.5 + Math.sin(u * 91 + id * 0.6 - t * 7.1) * 0.5;
      const kink = strain * (0.012 + 0.05 * over);
      X[k] = x + (id % 2 ? 1 : 0.3) * kink * w1;
      Z[k] = z + (id % 2 ? 0.3 : 1) * kink * Math.sin(u * 53 + id * 2.3 + t * 6.1);
      Y[k] = Math.max(s.level, base[k]) + strain * 0.02 * over * Math.sin(u * 61 + id + t * 9);
    }
    const brk = s.brk ?? -1;
    const flick = (f) => (strain > 0.2 ? 0.75 + 0.25 * Math.sin(t * 31 + f.flick * 5) : 1);
    let o = 0;
    for (const sg of segs) {
      const f = sg.frag;
      let ax = X[sg.i], ay = Y[sg.i], az = Z[sg.i], bx = X[sg.j], by = Y[sg.j], bz = Z[sg.j];
      let a = s.a;
      // the sheet draws out from the middle at first
      const ln = f.line;
      const along = (sg.i - ln.first) / ln.n;
      a *= sstep(0, 0.12, s.draw - Math.abs(along - 0.5) * 2 * 0.9);
      if (brk > 0) {
        const tt = Math.max(0, brk - f.delay * 0.6);
        const life = clamp(tt / f.life);
        // drift: the piece lifts off and turns a little about its middle
        const m = ln.first + ((f.a + f.b) >> 1);
        const cx = X[m], cy = Y[m], cz = Z[m];
        const ang = f.spin * tt * 0.6;
        const rot = (px, py, pz) => {
          const dx = px - cx, dz = pz - cz;
          return [cx + dx * Math.cos(ang) - dz * Math.sin(ang) + f.v[0] * tt, py + f.v[1] * tt + 0.15 * tt * tt + (py - cy) * 0.2 * tt, cz + dx * Math.sin(ang) + dz * Math.cos(ang) + f.v[2] * tt];
        };
        [ax, ay, az] = rot(ax, ay, az);
        [bx, by, bz] = rot(bx, by, bz);
        a *= (1 - life) ** 1.5 * (0.6 + 0.4 * Math.sin(tt * 40 + f.flick * 9) ** 2) * (1 + 1.5 * Math.exp(-tt * 12));
      } else {
        a *= flick(f);
      }
      P[o] = ax; P[o + 1] = ay; P[o + 2] = az; P[o + 3] = bx; P[o + 4] = by; P[o + 5] = bz;
      for (let q = 0; q < 2; q++) {
        C[o + q * 3] = color[0] * a; C[o + q * 3 + 1] = color[1] * a; C[o + q * 3 + 2] = color[2] * a;
      }
      o += 6;
    }
    geo.attributes.instanceStart.data.needsUpdate = true;
    geo.attributes.instanceColorStart.data.needsUpdate = true;
    obj.visible = s.a > 0.002;
  }
  return { obj, update, mat };
}
