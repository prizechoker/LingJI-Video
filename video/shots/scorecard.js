// Five games as five upturned bowl lids in a row on the table (A03–A04).
// Lee Sedol's prediction appears as ghost stones: five white (cue "five", 五比零), then the fifth turns black
// (cue "four", 四比一). Then reality: a solid black stone drops into game one's lid with a cold flash (cue "lose").
import { Studio, THREE, spot } from '../engine2/core.js';
import { stoneGeometry, stoneMaterials } from '../engine2/materials.js';
import { ss, sstep, clamp, lerp, breathe, grade, title, caption, text, FONT, toScreen, V3, rng } from './lib/kit.js';

const N = 5, GAP = 0.16;
const LID = [[0, 0], [0.058, 0], [0.066, 0.004], [0.069, 0.016], [0.066, 0.022], [0.06, 0.02], [0.056, 0.012], [0.04, 0.007], [0, 0.006]];
const lidX = (k) => (k - (N - 1) / 2) * GAP;
const NAMES = ['第一局', '第二局', '第三局', '第四局', '第五局'];

export async function create({ renderer, scale, p, cues, dur }) {
  const st = new Studio({ scale, renderer });
  await st.hdri('../assets/hdri/studio_small_09_2k.hdr', { intensity: p.env ?? 0.05, rotation: 0.4 });
  st.scene.background = new THREE.Color(0x030304);
  const table = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshPhysicalMaterial({
    ...st.pbr('Wood027', { repeat: [3, 3] }), color: 0x8a6a56, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.38,
  }));
  table.rotation.x = -Math.PI / 2;
  table.receiveShadow = true;
  st.scene.add(table);
  const wood = st.pbr('Wood022', { repeat: [0.6, 0.6] });
  const lidMat = new THREE.MeshPhysicalMaterial({ ...wood, color: 0xe2c49a, roughness: 0.45, clearcoat: 0.45, clearcoatRoughness: 0.25 });
  const lidGeo = new THREE.LatheGeometry(LID.map(([r, y]) => new THREE.Vector2(r, y)), 96);
  const geo = stoneGeometry();
  const mats = stoneMaterials();
  const ghost = (c) => new THREE.MeshPhysicalMaterial({
    color: c === 'W' ? 0xf4efe6 : 0x202428, roughness: 0.3, transparent: true, opacity: 0, depthWrite: false,
    emissive: c === 'W' ? 0xffd9a8 : 0x5a6a80, emissiveIntensity: 0.0,
  });
  const lids = [], ghosts = [];
  for (let k = 0; k < N; k++) {
    const l = new THREE.Mesh(lidGeo, lidMat);
    l.position.set(lidX(k), 0, 0);
    l.rotation.y = k * 1.3;
    l.castShadow = l.receiveShadow = true;
    st.scene.add(l);
    lids.push(l);
    const gw = new THREE.Mesh(geo, ghost('W'));
    gw.position.set(lidX(k), 0.0105, 0);
    const gb = new THREE.Mesh(geo, ghost('B'));
    gb.position.copy(gw.position);
    st.scene.add(gw, gb);
    ghosts.push({ w: gw, b: gb });
  }
  const real = new THREE.Mesh(geo, mats.black);
  real.castShadow = real.receiveShadow = true;
  st.scene.add(real);

  const keyL = spot(0xffd6a8, p.key ?? 9, { pos: [-0.2, 1.4, 0.35], target: [0, 0, 0], angle: 0.32, penumbra: 0.9, radius: 6, near: 0.5, far: 4 });
  const flash = spot(0x9cc8ff, 0, { pos: [lidX(0) + 0.1, 0.8, -0.3], target: [lidX(0), 0, 0], angle: 0.18, penumbra: 0.8, radius: 3, near: 0.3, far: 3, shadow: 1024 });
  st.scene.add(keyL, keyL.target, flash, flash.target);

  grade(st, { ao: { radius: 0.02, intensity: 1.8 }, dof: { distance: 0.5, range: p.range ?? 0.12, bokeh: 3.5 }, bloom: { intensity: 0.4, threshold: 0.8 }, vignette: 0.7, contrast: 0.12, exposure: p.exposure ?? 0.95 });
  const tFive = cues.five ?? 0.6, tFour = cues.four ?? dur * 0.45, tLose = cues.lose ?? dur * 0.75;
  const focus0 = V3(0, 0.01, 0), focus1 = V3(lidX(0), 0.01, 0);

  return {
    studio: st,
    update(t) {
      for (let k = 0; k < N; k++) {
        // prediction: the ghosts arrive one by one; the fifth flips to black at "four"; game one's ghost yields
        // to the real stone
        const inW = sstep(tFive + k * 0.12, tFive + k * 0.12 + 0.5, t);
        const flip = k === 4 ? sstep(tFour, tFour + 0.6, t) : 0;
        const gone = k === 0 ? sstep(tLose - 0.05, tLose + 0.3, t) : 0;
        const fade = 1 - 0.45 * sstep(tLose + 0.2, tLose + 1.2, t) * (k > 0 ? 1 : 0);
        const w = inW * (1 - flip) * (1 - gone) * fade, b = inW * flip * fade;
        ghosts[k].w.material.opacity = 0.62 * w;
        ghosts[k].w.material.emissiveIntensity = 0.55 * w;
        ghosts[k].w.visible = w > 0.002;
        ghosts[k].b.material.opacity = 0.9 * b;
        ghosts[k].b.material.emissiveIntensity = 0.25 * b;
        ghosts[k].b.visible = b > 0.002;
        ghosts[k].w.position.y = ghosts[k].b.position.y = 0.0105 + 0.004 * (1 - inW);
      }
      // the real stone: falls the last few centimetres and settles with a small rock
      const u = t - tLose;
      const fall = 0.12;
      const y = u < 0 ? 0.3 : u < fall ? 0.0105 + 0.06 * (1 - (u / fall) ** 2) : 0.0105;
      real.visible = u > -0.02;
      real.position.set(lidX(0) + 0.002, y, 0.001);
      const rock = u > fall ? Math.exp(-(u - fall) / 0.08) * Math.sin((u - fall) * 70) * 0.06 : 0;
      real.rotation.set(rock, 0.7, rock * 0.4);
      flash.intensity = u > fall - 0.02 ? (p.flash ?? 26) * (0.35 + 0.65 * Math.exp(-(u - fall) / 0.25)) : 0;
      keyL.intensity = (p.key ?? 9) * (1 - 0.35 * sstep(tLose, tLose + 0.6, t));
      // camera: a high three-quarter view of the row, drifting in; after "lose" it settles toward game one
      const r = ss(clamp(t / dur));
      const g = sstep(tLose - 0.4, tLose + 1.8, t);
      const pos = V3(lerp(0.0, lidX(0) * 0.7, g), lerp(0.72, 0.58, r) - 0.22 * g, lerp(0.62, 0.52, r) - 0.18 * g);
      const look = V3(lerp(0.0, lidX(0) * 0.92, g), 0, lerp(-0.03, -0.02, r));
      const b = breathe(t, 0.0012, 2);
      st.camera.position.set(pos.x + b[0], pos.y + b[1], pos.z + b[2]);
      st.camera.lookAt(look);
      if (st.camera.fov !== 32) { st.camera.fov = 32; st.camera.updateProjectionMatrix(); }
      if (st.dof) st.dof.target = focus0.clone().lerp(focus1, g);
    },
    overlay(g, t) {
      st.camera.updateMatrixWorld();
      // game names under the lids
      const aN = sstep(0.1, 0.8, t);
      for (let k = 0; k < N; k++) {
        const [x, y] = toScreen(st.camera, V3(lidX(k), 0, 0.085));
        text(g, NAMES[k], x, y + 22, { size: 28, font: FONT.serif, weight: 500, color: [214, 204, 188], a: aN * 0.85, spacing: 4, shadow: 10 });
      }
      // the prediction
      const a5 = sstep(tFive, tFive + 0.5, t) * (1 - sstep(tFour - 0.1, tFour + 0.3, t));
      const a4 = sstep(tFour, tFour + 0.5, t) * (1 - sstep(tLose + 0.1, tLose + 0.9, t));
      title(g, '5 : 0', 960, 220, { size: 132, a: a5, color: [240, 214, 160], weight: 600, spacing: 10 });
      title(g, '4 : 1', 960, 220, { size: 132, a: a4, color: [240, 214, 160], weight: 600, spacing: 10 });
      caption(g, 960, 315, { en: 'LEE SEDOL · BEFORE THE MATCH', zh: '李世石的赛前预测', a: Math.max(a5, a4) * 0.95, color: [226, 214, 196], align: 'center', rule: 0, zhSize: 26 });
      // reality
      const aL = sstep(tLose + 0.15, tLose + 0.7, t);
      if (aL > 0.001) {
        const [x, y] = toScreen(st.camera, V3(lidX(0), 0.02, 0));
        text(g, 'AlphaGo 胜', x, y - 118, { size: 40, font: FONT.sans, weight: 600, color: [170, 220, 255], a: aL, spacing: 3, shadow: 18 });
      }
    },
  };
}
