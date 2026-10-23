// E39 "可在赛道上把同一个动作重复几万次，和面对一摞每次都不一样的碗，是两回事。" — a split frame.
// Left (cool): the robot running on a treadmill, the path of its foot traced in light: the same loop, again and again,
// a repeat counter racing up. Right (warm, from cue "bowls"): a sink piled with dishes — a different pile every time.
// Two scenes rendered each frame and composited side by side in the overlay.
import { Studio, THREE, spot } from '../engine2/core.js';
import { botMaterials } from '../engine2/bot.js';
import { loadBotRig, runPose, gait } from '../engine2/botrig.js';
import { buildKitchen, COUNTER } from '../engine2/kitchen.js';
import { bowlGeometry, porcelainMaterial, waterMaterial } from '../engine2/dishes.js';
import { ss, sstep, clamp, lerp, breathe, grade, text, caption, FONT, V3, rng } from './lib/kit.js';

async function runner(renderer, scale) {
  const st = new Studio({ scale, renderer });
  const env = await st.hdri('../assets/hdri/studio_small_09_2k.hdr', { intensity: 0.22, rotation: 0.6 });
  st.scene.background = new THREE.Color(0x03060a);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0x0c1016, roughness: 0.4, envMap: env, envMapIntensity: 0.05 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  st.scene.add(floor);
  // treadmill: a dark deck with a belt and side rails
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 1.9), new THREE.MeshPhysicalMaterial({ color: 0x15181d, roughness: 0.5, clearcoat: 0.3 }));
  deck.position.set(0, 0.06, 0);
  deck.castShadow = deck.receiveShadow = true;
  st.scene.add(deck);
  const beltTex = (() => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#1c1f24'; g.fillRect(0, 0, 64, 512);
    g.fillStyle = 'rgba(255,255,255,0.06)';
    for (let y = 0; y < 512; y += 16) g.fillRect(0, y, 64, 3);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, 4);
    return t;
  })();
  const belt = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 1.8), new THREE.MeshStandardMaterial({ map: beltTex, roughness: 0.85 }));
  belt.rotation.x = -Math.PI / 2;
  belt.position.set(0, 0.121, 0);
  st.scene.add(belt);
  const rig = await loadBotRig(st, { mats: botMaterials({ envDiffuse: 0.4, white: 0xd8dde3 }) });
  rig.holder.position.y = 0.122;
  st.scene.add(rig.holder);
  // the foot's path over one stride, traced as a glowing loop (in the holder's space, so it rides along)
  const G = gait('run');
  const pts = [];
  for (let k = 0; k <= 96; k++) {
    rig.setPose(runPose(k / 96));
    rig.holder.updateMatrixWorld(true);
    const f = rig.bones.toe_R || rig.bones.foot_R;
    pts.push(f.getWorldPosition(V3()));
  }
  const curve = new THREE.CatmullRomCurve3(pts, true);
  const loop = new THREE.Mesh(new THREE.TubeGeometry(curve, 240, 0.004, 8, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.4, 2.4), toneMapped: false }));
  st.scene.add(loop);
  const key = spot(0xd8e6ff, 40, { pos: [1.5, 4, 2.5], target: [0, 0.9, 0], angle: 0.35, penumbra: 0.9, radius: 6, near: 1, far: 9 });
  const rim = spot(0x8fb4ff, 30, { pos: [-2.5, 2.5, -2], target: [0, 1.0, 0], angle: 0.4, penumbra: 1, shadow: 0 });
  st.scene.add(key, key.target, rim, rim.target);
  grade(st, { ao: { radius: 0.06, intensity: 0.8 }, bloom: { intensity: 0.5, threshold: 0.7 }, vignette: 0.55, contrast: 0.1, saturation: -0.1, exposure: 1.0 });
  return {
    st,
    pose(t) {
      rig.setPose(runPose(t / G.cycle));
      beltTex.offset.y = -(t * G.speed) / 1.8 * 4;
      st.camera.position.set(-4.3, 1.0, 0.3);
      st.camera.lookAt(0, 0.88, 0.1);
      if (st.camera.fov !== 30) { st.camera.fov = 30; st.camera.updateProjectionMatrix(); }
    },
    cycle: G.cycle,
  };
}

async function sink(renderer, scale) {
  const st = new Studio({ scale, renderer });
  await st.hdri('../assets/hdri/blinds_2k.hdr', { intensity: 0.42, rotation: 2.1, background: { blur: 0.09, intensity: 0.45 } });
  const kitchen = buildKitchen(st, { width: 2.4 });
  st.scene.add(kitchen);
  // brushed steel picks up the warm room and reads pink: cool it a touch, as in the hands' wash shot
  kitchen.traverse((o) => {
    if (o.isMesh && o.material && o.material.metalness === 1) { o.material = o.material.clone(); o.material.color.set(0xa1b4c0); o.material.roughness = Math.max(o.material.roughness, 0.36); }
  });
  const pm = porcelainMaterial();
  const glazes = [pm, pm, new THREE.MeshPhysicalMaterial({ color: 0xbfd2c4, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05 }), new THREE.MeshPhysicalMaterial({ color: 0xece6da, roughness: 0.25, clearcoat: 0.8 }), new THREE.MeshPhysicalMaterial({ color: 0x2f4a66, roughness: 0.2, clearcoat: 1 })];
  const bowlG = bowlGeometry();
  const plateG = new THREE.LatheGeometry([[0, 0.004], [0.06, 0.004], [0.09, 0.012], [0.11, 0.022], [0.107, 0.023], [0.088, 0.014], [0.06, 0.007], [0, 0.007]].map(([r, y]) => new THREE.Vector2(r, y)), 64);
  const cupG = new THREE.LatheGeometry([[0, 0.002], [0.032, 0], [0.036, 0.04], [0.04, 0.085], [0.037, 0.086], [0.033, 0.042], [0.029, 0.006], [0, 0.006]].map(([r, y]) => new THREE.Vector2(r, y)), 48);
  const deepG = new THREE.LatheGeometry([[0, 0.003], [0.05, 0], [0.085, 0.03], [0.095, 0.07], [0.092, 0.071], [0.081, 0.032], [0.048, 0.006], [0, 0.005]].map(([r, y]) => new THREE.Vector2(r, y)), 64);
  const piles = [];
  const sinkTop = COUNTER.top - COUNTER.t - COUNTER.sink.depth;
  // four different piles: plates laid in, bowls nested at odd angles, a cup on its side, a deep dish — never twice
  // the same; each piece rests on the one below (stacking heights accumulate)
  for (let v = 0; v < 4; v++) {
    const g = new THREE.Group();
    const R = rng(31 + v * 17);
    const cx = COUNTER.sink.z;
    const put = (geo, mat, x, y, z, rx, ry, rz, sc = 1) => {
      const m = new THREE.Mesh(geo, mat);
      m.scale.setScalar(sc);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    };
    let y = sinkTop + 0.002;
    const nPlates = 1 + Math.floor(R() * 3);
    const px = (R() - 0.5) * 0.08, pz = cx + (R() - 0.5) * 0.06;
    for (let k = 0; k < nPlates; k++) { put(plateG, glazes[Math.floor(R() * glazes.length)], px + (R() - 0.5) * 0.02, y, pz + (R() - 0.5) * 0.02, (R() - 0.5) * 0.08, R() * 6, (R() - 0.5) * 0.08, 0.85 + R() * 0.2); y += 0.008; }
    const nBowls = 1 + Math.floor(R() * 3);
    const bx = (R() - 0.5) * 0.14, bz = cx + (R() - 0.5) * 0.08;
    for (let k = 0; k < nBowls; k++) { put(bowlG, glazes[Math.floor(R() * glazes.length)], bx + (R() - 0.5) * 0.015, y + k * 0.012, bz, (R() - 0.5) * 0.35, R() * 6, (R() - 0.5) * 0.35, 1 - k * 0.06); }
    if (R() < 0.7) put(cupG, glazes[Math.floor(R() * glazes.length)], (R() - 0.5) * 0.2, sinkTop + 0.04, cx + 0.12 * (R() - 0.5), Math.PI / 2, R() * 6, 0, 1);
    if (R() < 0.6) put(deepG, glazes[Math.floor(R() * glazes.length)], (R() < 0.5 ? -1 : 1) * 0.15, sinkTop + 0.002, cx + (R() - 0.5) * 0.08, (R() - 0.5) * 0.5, 0, (R() - 0.5) * 0.5, 0.9);
    g.visible = false;
    st.scene.add(g);
    piles.push(g);
  }
  const key = spot(0xffd9b4, 4, { pos: [-0.6, 1.8, 0.6], target: [0, COUNTER.top - 0.15, COUNTER.sink.z], angle: 0.45, penumbra: 1, radius: 6, near: 0.5, far: 5 });
  st.scene.add(key, key.target);
  grade(st, { ao: { radius: 0.03, intensity: 1.5 }, bloom: { intensity: 0.3, threshold: 0.9 }, vignette: 0.55, contrast: 0.08, saturation: -0.14, exposure: 1.0 });
  return {
    st,
    pose(t, k) {
      piles.forEach((g, i) => { g.visible = i === k % piles.length; });
      st.camera.position.set(-0.12 + 0.01 * t, COUNTER.top + 0.55, 0.36);
      st.camera.lookAt(0, COUNTER.top - 0.12, COUNTER.sink.z);
      if (st.camera.fov !== 34) { st.camera.fov = 34; st.camera.updateProjectionMatrix(); }
    },
  };
}

export async function create({ renderer, scale, p, cues, dur }) {
  const L = await runner(renderer, scale);
  const R = await sink(renderer, scale);
  await L.st.ready();
  await R.st.ready();
  const tB = cues.bowls ?? dur * 0.4, tTwo = cues.two ?? dur * 0.75;
  const W = Math.round(1920 * scale), H = Math.round(1080 * scale);
  return {
    studio: null,
    update() {},
    overlay(g, t, env) {
      // how far the frame has split: the runner alone at first, the sink sliding in from the right at "bowls"
      const split = ss(clamp((t - tB + 0.3) / 0.8));
      const xs = lerp(1920, 960, split); // the divider, in 1920 units
      L.pose(t);
      L.st.render();
      // the left image: centred crop of the runner scene, shifted as the divider moves in
      const lw = xs, srcX = ((1920 - lw) / 2 + (1920 - xs) * 0.25) * scale;
      g.drawImage(renderer.domElement, srcX, 0, lw * scale, H, 0, 0, lw, 1080);
      if (split > 0.001) {
        const k = Math.max(0, Math.floor((t - tB) / 0.85));
        R.pose(t, k);
        R.st.render();
        const rw = 1920 - xs;
        g.drawImage(renderer.domElement, (1920 - 960) / 2 * scale, 0, rw * scale, H, xs, 0, rw, 1080);
        g.fillStyle = 'rgba(0,0,0,0.9)';
        g.fillRect(xs - 2, 0, 4, 1080);
      }
      // the repeat counter on the runner's side
      const reps = Math.floor(1 + (t / L.cycle) * 1 + 30000 * ss(clamp(t / (tTwo + 0.5))) ** 1.6);
      const a = sstep(0.3, 0.8, t);
      text(g, `× ${reps.toLocaleString('en-US')}`, Math.min(xs, 1920) - 70, 150, { size: 56, font: FONT.mono, weight: 600, color: [170, 220, 255], a, align: 'right', shadow: 18 });
      text(g, '同一个动作', Math.min(xs, 1920) - 70, 205, { size: 24, font: FONT.sans, weight: 500, color: [190, 210, 228], a, align: 'right', spacing: 3, shadow: 10 });
      if (split > 0.3) {
        const k = Math.max(0, Math.floor((t - tB) / 0.85));
        const days = ['第 1 次', '第 2 次', '第 3 次', '第 4 次', '第 5 次', '第 6 次', '第 7 次', '第 8 次'];
        text(g, days[k % days.length], xs + 70, 150, { size: 40, font: FONT.serif, weight: 600, color: [255, 226, 190], a: sstep(0.3, 0.8, split), align: 'left', shadow: 16 });
        text(g, '每一摞都不一样', xs + 70, 205, { size: 24, font: FONT.sans, weight: 500, color: [236, 214, 190], a: sstep(0.3, 0.8, split), align: 'left', spacing: 3, shadow: 10 });
      }
    },
    dispose() { L.st.dispose(); R.st.dispose(); },
  };
}
