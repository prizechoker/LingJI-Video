// The home that cannot become a chessboard (E34, E35). A dining room on a winter evening: tungsten lamps, dusk in
// the window, an oak table set with bowls of every shape, chairs, books, a fig, an armchair in the corner.
// p.mode: 'grid' (E34) — a cool grid of light hovers over the room, sinks and drapes itself over the clutter, strains
//                        and buckles; at cue "break" (at 你家) it breaks into fragments that drift up and go out.
//         'days' (E35) — one camera on the table. A sweater is tossed over a chair back (cue "shirt", at 衣服随手一扔);
//                        a cat's shadow leaps up the wall onto the table (cue "cat", at 猫还会跳上桌子); then (cue
//                        "days", at 每一天) the table on 周一 / 周二 / 周三, set differently each day, the light shifting a
//                        little (short dissolves between the days).
// p: { mode, exposure, env, light: { pendant, lamp, corner, window } }
// cues (s from the shot's start): grid: break (default 0.68 dur)
//                                 days: shirt (0.27 dur), cat (0.5 dur), days (0.72 dur)
import { Studio, THREE } from '../engine2/core.js';
import { buildHome, homeLights, TABLE, bookRow } from './lib/home_room.js';
import { bowl, tumbler, mug, toyBlock, sippyCup } from './lib/home_props.js';
import { heightField, lightGrid } from './lib/home_grid.js';
import { simulateSweater, sweaterMesh } from './lib/home_cloth.js';
import { catGobo } from './lib/home_cat.js';
import { ss, sstep, clamp, lerp, key, breathe, grade, caption, V3, rng } from './lib/kit.js';

const CAMS = {
  grid: { pos: [2.05, 1.42, 2.75], look: [-0.35, 0.72, -0.6], fov: 42, to: { pos: [1.85, 1.38, 2.45], look: [-0.35, 0.74, -0.6] } },
  days: { pos: [1.22, 1.2, 2.2], look: [0.75, 0.9, -0.6], fov: 36, to: { pos: [1.16, 1.19, 2.06], look: [0.75, 0.9, -0.6] } },
};

// a fruit: a slightly squashed sphere with a little colour variation (apples, mandarins)
function fruit(kind, seed) {
  const R = rng(seed);
  const r = kind === 'mandarin' ? 0.03 : 0.037;
  const geo = new THREE.SphereGeometry(r, 32, 20);
  geo.scale(1, kind === 'mandarin' ? 0.82 : 0.92, 1);
  geo.translate(0, r * 0.85, 0);
  const col = kind === 'mandarin' ? new THREE.Color().setHSL(0.07 + R() * 0.015, 0.85, 0.48) : new THREE.Color().setHSL(0.99 + R() * 0.03, 0.7, 0.36);
  const m = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: col, roughness: kind === 'mandarin' ? 0.55 : 0.32, clearcoat: kind === 'mandarin' ? 0.1 : 0.6, clearcoatRoughness: 0.3 }));
  m.castShadow = m.receiveShadow = true;
  return m;
}

export async function create({ renderer, scale, p, dur, cues }) {
  const st = new Studio({ scale, renderer });
  const env = await st.hdri('../assets/hdri/comfy_cafe_2k.hdr', { intensity: p.env ?? 0.16, rotation: p.rot ?? 0 });
  st.scene.background = new THREE.Color(0x000000);
  const H = await buildHome(st, env);
  st.scene.add(H.group);
  const L = homeLights(st, H, p.light || {});
  const L0 = { pendant: L.pendant.intensity, lamp: L.lamp.intensity, corner: L.corner.intensity, window: L.window.intensity };
  const mode = p.mode || 'days';
  const T = TABLE.top;

  // ---------------------------------------------------------------- the things on the table (and around it)
  const items = {};
  const add = (name, o) => { items[name] = o; st.scene.add(o); return o; };
  add('rice', bowl(st, 'rice'));
  add('rice2', bowl(st, 'rice'));
  add('noodle', bowl(st, 'noodle'));
  add('shallow', bowl(st, 'shallow'));
  add('cereal', bowl(st, 'cereal'));
  add('sauce', bowl(st, 'sauce'));
  add('wood', bowl(st, 'wood'));
  add('glass', tumbler());
  add('mug', mug());
  add('mug2', mug({ color: 0xc9b9a0 }));
  add('sippy', sippyCup());
  ['A', 'B', 'C'].forEach((ch, k) => add(`block${k}`, toyBlock({ size: 0.036, seed: 20 + k * 5, faces: [{ ch, color: ['red', 'blue', 'green'][k] }, { ch: `${k + 1}`, color: 'yellow' }, { ch: 'K', color: 'teal' }, { ch: 'M', color: 'orange' }, { ch: ch.toLowerCase(), color: 'red' }, { ch: 'Z', color: 'blue' }] })));
  const fr = new THREE.Group();
  [['apple', 1, [0, 0.02, 0]], ['apple', 2, [0.06, 0.02, 0.03]], ['mandarin', 3, [-0.05, 0.022, 0.035]], ['mandarin', 4, [0.01, 0.024, -0.055]], ['apple', 5, [0.02, 0.07, 0.0]]]
    .forEach(([k, s, q]) => { const f = fruit(k, s); f.position.set(...q); fr.add(f); });
  add('fruit', fr);
  const bk = bookRow(0.09, { seed: 91, hmin: 0.22, hmax: 0.25 });
  bk.rotation.z = Math.PI / 2;
  const books = new THREE.Group();
  books.add(bk);
  add('books', books);
  const all = Object.values(items);

  // where everything sits on each day ([x, z, rotY, lift] on the table top; missing = put away)
  const DAYS = [
    { // Monday: dinner, as we first see it
      rice: [-0.25, 0.12, 0], noodle: [0.18, -0.15, 0], shallow: [-0.05, -0.2, 0], cereal: [0.52, 0.17, 0], sauce: [0.05, 0.22, 0],
      wood: [-0.62, -0.12, 0], glass: [0.42, -0.25, 0], mug: [-0.48, 0.28, 0.7],
      chairs: null, light: { pendant: 1, lamp: 1, corner: 1, window: 1 },
    },
    { // Tuesday: breakfast things, the toddler's toys, fruit, a chair pulled out
      cereal: [0.3, 0.1, 0], rice: [0.36, -0.18, 0], mug: [0.6, -0.05, 2.2], mug2: [-0.1, -0.22, 1.2], sippy: [0.05, 0.16, 0.4],
      block0: [-0.2, 0.25, 0.3], block1: [-0.15, 0.1, 1.1], block2: [-0.24, 0.17, 0.7, 0.036], wood: [-0.55, -0.05, 0], fruit: [-0.55, -0.05, 0, 0.012],
      chairs: [[-0.42, -0.62, 0.0], [0.62, -0.78, -0.35], [-0.45, 0.66, Math.PI + 0.06], [1.12, 0.05, -Math.PI / 2 + 0.1]],
      light: { pendant: 0.85, lamp: 1.25, corner: 1.1, window: 0.7 },
    },
    { // Wednesday: noodles for one, books, the sweater on another chair
      noodle: [0.4, -0.05, 0], rice: [0.05, 0.12, 0], rice2: [-0.08, 0.0, 0], sauce: [0.25, 0.22, 0], glass: [0.62, 0.2, 0],
      books: [-0.5, 0.1, 0.25], shallow: [-0.2, -0.22, 0], fruit: [-0.2, -0.22, 0, 0.008],
      chairs: [[-0.42, -0.62, 0.0], [0.4, -0.6, -0.12], [-0.45, 0.66, Math.PI + 0.06], [1.14, 0.12, -Math.PI / 2 + 0.25]],
      light: { pendant: 1.1, lamp: 0.9, corner: 0.85, window: 1.25 },
    },
  ];
  const chair0 = H.chairs.map((c) => [c.position.x, c.position.z, c.rotation.y]);

  // ---------------------------------------------------------------- the sweater
  let sweater = null, sweater2 = null;
  const tShirt = cues.shirt ?? dur * 0.27;
  if (mode === 'days') {
    const ch = H.chairs[3];
    ch.updateMatrixWorld(true);
    const W = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(ch.matrixWorld).toArray();
    const cols = [{ type: 'floor', y: 0.012 }];
    for (const y of [0.862, 0.826]) cols.push({ type: 'capsule', a: W(-0.205, y, -0.275), b: W(0.205, y, -0.275), r: 0.017 });
    for (const sx of [-1, 1]) cols.push({ type: 'capsule', a: W(sx * 0.2, 0.45, -0.19), b: W(sx * 0.2, 0.88, -0.262), r: 0.02 });
    const seatC = [W(-0.23, 0.42, -0.22), W(0.23, 0.5, 0.22)];
    cols.push({ type: 'box', min: [Math.min(seatC[0][0], seatC[1][0]), 0.42, Math.min(seatC[0][2], seatC[1][2])], max: [Math.max(seatC[0][0], seatC[1][0]), 0.5, Math.max(seatC[0][2], seatC[1][2])] });
    cols.push({ type: 'box', min: [-TABLE.w / 2, T - TABLE.t, -TABLE.d / 2], max: [TABLE.w / 2, T + 0.004, TABLE.d / 2] });
    const rail = new THREE.Vector3(...W(0, 0.87, -0.275));
    const along = new THREE.Vector3(-1, -0.18, 0.12).normalize();
    const across = new THREE.Vector3(...W(1, 0, 0)).sub(new THREE.Vector3(...W(0, 0, 0))).normalize();
    const normal = across.clone().cross(along).normalize();
    const sim = simulateSweater({
      colliders: cols, T: 2.6,
      start: { origin: rail.clone().add(new THREE.Vector3(0.8, 0.4, 0.04)).toArray(), across: across.toArray(), along: along.toArray(), normal: normal.toArray(), vel: [-2.2, 0.75, -0.08], spin: 1.0 },
    });
    if (p.debug) {
      for (const fi of [0, 15, 30, 45, 60, 90, 119]) {
        const F = sim.frames[Math.min(fi, sim.frames.length - 1)];
        let cx = 0, cy = 0, cz = 0, mn = 9, mx = -9;
        for (let k = 0; k < sim.n; k++) { cx += F[k * 3]; cy += F[k * 3 + 1]; cz += F[k * 3 + 2]; mn = Math.min(mn, F[k * 3 + 1]); mx = Math.max(mx, F[k * 3 + 1]); }
        console.log('sweater', fi, (cx / sim.n).toFixed(3), (cy / sim.n).toFixed(3), (cz / sim.n).toFixed(3), mn.toFixed(3), mx.toFixed(3));
      }
      console.log('rail', JSON.stringify(cols.slice(1, 3)));
    }
    const knit = st.pbr('Fabric068', { repeat: [1, 1] });
    const kmat = new THREE.MeshPhysicalMaterial({ ...knit, color: 0xe2b8a0, roughness: 1, sheen: 0.8, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xffc8a0), side: THREE.DoubleSide, normalScale: new THREE.Vector2(1.2, 1.2) });
    sweater = sweaterMesh(sim, kmat);
    st.scene.add(sweater);
    // Wednesday: the same sweater, as it fell, on the chair across the table
    sweater2 = sweaterMesh(sim, kmat);
    sweater2.userData.pose(10);
    sweater2.matrixAutoUpdate = false;
    st.scene.add(sweater2);
    sweater2.visible = false;
  }

  // ---------------------------------------------------------------- the cat (a shadow on the wall)
  let cat = null;
  const tCat = cues.cat ?? dur * 0.5;
  if (mode === 'days') {
    // from the floor by the table's left end, up onto the table; seen by the corner lamp
    cat = catGobo(L.corner, { size: 1024, start: new THREE.Vector3(-1.2, 0, 0.28), fwd: new THREE.Vector3(1, 0, -0.12).normalize(), blur: 3 });
  }

  let arranged = -1;
  const arrange = (d) => {
    if (d === arranged) return;
    arranged = d;
    const D = DAYS[d];
    for (const o of all) o.visible = false;
    for (const [name, v] of Object.entries(D)) {
      const o = items[name];
      if (!o || !Array.isArray(v)) continue;
      o.visible = true;
      o.position.set(v[0], T + (v[3] ?? 0), v[1]);
      o.rotation.y = v[2] || 0;
    }
    const cs = D.chairs || chair0;
    H.chairs.forEach((c, i) => { c.position.set(cs[i][0], 0, cs[i][1]); c.rotation.y = cs[i][2]; c.updateMatrixWorld(true); });
    if (sweater) {
      sweater.visible = d === 0;
      sweater2.visible = d === 2;
      if (d === 2) {
        // carry the drape from the end chair (as first placed) to the far-right chair
        const from = new THREE.Matrix4().compose(new THREE.Vector3(chair0[3][0], 0, chair0[3][1]), new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), chair0[3][2]), V3(1, 1, 1));
        sweater2.matrix.copy(H.chairs[1].matrixWorld).multiply(from.invert());
        sweater2.matrixWorldNeedsUpdate = true;
      }
    }
    for (const k of Object.keys(L0)) L[k].intensity = L0[k] * (D.light[k] ?? 1);
  };

  // ---------------------------------------------------------------- the days: timing and a two-pass dissolve
  const tDays = cues.days ?? dur * 0.72;
  const span = Math.max(0.45, (dur - tDays) / 3);
  const XF = 0.22;
  const dayAt = (t) => {
    // [day, next day, mix 0..1]
    const b1 = tDays + span, b2 = tDays + 2 * span;
    if (mode !== 'days' || t < b1 - XF / 2) return [0, 0, 0];
    if (t < b1 + XF / 2) return [0, 1, sstep(b1 - XF / 2, b1 + XF / 2, t)];
    if (t < b2 - XF / 2) return [1, 1, 0];
    if (t < b2 + XF / 2) return [1, 2, sstep(b2 - XF / 2, b2 + XF / 2, t)];
    return [2, 2, 0];
  };
  const prev = document.createElement('canvas');
  prev.width = st.w;
  prev.height = st.h;
  const pg = prev.getContext('2d');
  let prevA = 0;
  let cur = [0, 0, 0];
  let curT = 0;
  const render0 = st.render.bind(st);
  const poseDay = (d, t) => {
    arrange(d);
    if (cat) cat.draw(t - (tCat - 0.32), d === 0 && t > tCat - 0.6);
    if (sweater && d === 0) {
      const ts = t - (tShirt - 0.12);
      sweater.visible = ts > 0;
      if (ts > 0) sweater.userData.pose(ts);
    }
  };
  st.render = () => {
    const [d0, d1, u] = cur;
    if (u > 0.001 && u < 0.999 && d0 !== d1) {
      poseDay(d0, curT);
      render0();
      pg.clearRect(0, 0, prev.width, prev.height);
      pg.drawImage(renderer.domElement, 0, 0, prev.width, prev.height);
      poseDay(d1, curT);
      render0();
      prevA = 1 - u;
    } else {
      poseDay(u >= 0.999 ? d1 : d0, curT);
      render0();
      prevA = 0;
    }
  };

  // ---------------------------------------------------------------- E34: the grid
  let grid = null;
  const tBreak = cues.break ?? dur * 0.68;
  if (mode === 'grid') {
    arrange(0);
    st.scene.updateMatrixWorld(true);
    const box = { x0: -2.3, x1: 2.35, z0: -1.42, z1: 2.6 };
    const hf = heightField(renderer, st.scene, { ...box, res: 512, hide: H.overhead });
    grid = lightGrid(hf, { ...box, step: 0.28, ds: 0.02, scale });
    st.scene.add(grid.obj);
  }

  const cam = CAMS[mode];
  grade(st, {
    ao: p.noao ? null : { radius: p.aor ?? 0.12, intensity: 1.6, falloff: 0.8 },
    dof: p.nodof ? null : { distance: 2.6, range: p.range ?? (mode === 'grid' ? 3.5 : 1.8), bokeh: p.bokeh ?? 1.6 },
    bloom: { intensity: mode === 'grid' ? 0.6 : 0.35, threshold: mode === 'grid' ? 0.8 : 0.95, radius: 0.8 },
    vignette: 0.6, contrast: 0.1, saturation: 0.0, exposure: p.exposure ?? 1.0,
  });
  if (st.aoPass) Object.assign(st.aoPass.configuration, { aoSamples: p.aos ?? 8, denoiseSamples: p.dns ?? 4, denoiseRadius: 8 });
  if (st.dof) st.dof.target = mode === 'grid' ? V3(-0.1, T, -0.1) : V3(0.75, T, -0.1);

  return {
    studio: st,
    update(t) {
      const u = ss(clamp(t / dur));
      const to = cam.to || cam;
      const b = breathe(t, 0.004, 3);
      st.camera.position.set(...cam.pos.map((v, i) => lerp(v, to.pos[i], u) + b[i]));
      st.camera.lookAt(...cam.look.map((v, i) => lerp(v, to.look[i], u)));
      if (st.camera.fov !== cam.fov) { st.camera.fov = cam.fov; st.camera.updateProjectionMatrix(); }
      cur = dayAt(t);
      curT = t;
      if (grid) {
        const settle = clamp((tBreak - 0.45 - 0.25) / 1.0);
        grid.update(t, {
          a: sstep(0.0, 0.35, t),
          draw: lerp(0, 1.25, sstep(0.0, 0.9, t)),
          level: key(t, [[0.25, 1.05], [tBreak - 0.45, 0.0]], (x) => x * x * (3 - 2 * x) * 0.6 + x * x * 0.4),
          strain: sstep(tBreak - 0.9 * Math.max(0.5, settle), tBreak, t),
          brk: t - tBreak,
        });
      }
    },
    overlay(g, t) {
      if (prevA > 0.001) {
        g.save();
        g.globalAlpha *= prevA;
        g.drawImage(prev, 0, 0, 1920, 1080);
        g.restore();
      }
      if (mode === 'days') {
        const names = [['周一', 'MON'], ['周二', 'TUE'], ['周三', 'WED']];
        names.forEach(([zh, en], k) => {
          const t0 = tDays + k * span - (k ? XF / 2 : 0), t1 = tDays + (k + 1) * span - XF / 2;
          const a = sstep(t0, t0 + 0.18, t) * (k === 2 ? 1 : 1 - sstep(t1, t1 + 0.18, t));
          caption(g, 1470, 205, { en, zh, a, color: [248, 236, 214], zhSize: 50, enSize: 15, rule: 130 });
        });
      }
    },
  };
}
