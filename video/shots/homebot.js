// F44 "接下来，轮到机器人来迁就我们了": the robot at home, standing by the kitchen counter with the dish rack; a slow
// push in while the light turns from cool to warm (the machine coming into the human's world).
import { Studio, THREE, spot } from '../engine2/core.js';
import { loadBot, botMaterials } from '../engine2/bot.js';
import { buildKitchen, COUNTER } from '../engine2/kitchen.js';
import { buildBowl, porcelainMaterial } from '../engine2/dishes.js';
import { ss, sstep, clamp, lerp, breathe, grade, V3 } from './lib/kit.js';

export async function create({ renderer, scale, p, cues, dur }) {
  const st = new Studio({ scale, renderer });
  await st.hdri('../assets/hdri/blinds_2k.hdr', { intensity: p.env ?? 0.35, rotation: p.rot ?? 2.1, background: { blur: 0.06, intensity: p.bg ?? 0.45 } });
  const kitchen = buildKitchen(st, { width: 3.0 });
  kitchen.position.set(-0.2, 0, -0.1);
  st.scene.add(kitchen);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshPhysicalMaterial({ ...st.pbr('Wood026', { repeat: [6, 6] }), color: 0xb08a68, roughness: 0.45, clearcoat: 0.3, clearcoatRoughness: 0.3 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  st.scene.add(floor);
  const pm = porcelainMaterial();
  for (const [x, z] of [[-0.75, -0.3], [-0.6, -0.36]]) {
    const b = buildBowl(pm);
    b.position.set(x, COUNTER.top, z);
    st.scene.add(b);
  }
  const r = await loadBot(st, { mats: botMaterials({ envDiffuse: 0.5, white: 0xdcdfe2 }) });
  r.holder.position.set(0.45, 0, 0.42);
  r.holder.rotation.y = -0.55;
  st.scene.add(r.holder);
  const sun = new THREE.DirectionalLight(0xffc48a, 0);
  sun.position.set(-1.5, 2.6, -2.2);
  sun.target.position.set(0.3, 0.9, 0.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -1.6, right: 1.6, top: 2.0, bottom: -0.4, near: 0.5, far: 8 });
  sun.shadow.radius = 4;
  sun.shadow.bias = -0.0003;
  const cool = spot(0xbcd2ff, 9, { pos: [1.8, 2.4, 2.4], target: [0.4, 1.0, 0.3], angle: 0.5, penumbra: 1, radius: 6, near: 0.5, far: 8 });
  const lamp = spot(0xffb978, 0, { pos: [0.2, 2.5, 0.6], target: [0.4, 0.9, 0.3], angle: 0.6, penumbra: 1, shadow: 0 });
  st.scene.add(sun, sun.target, cool, cool.target, lamp, lamp.target);
  grade(st, { ao: { radius: 0.06, intensity: 1.2 }, dof: { distance: 2.5, range: 1.2, bokeh: 2.5 }, bloom: { intensity: 0.3, threshold: 0.9 }, vignette: 0.6, contrast: 0.08, exposure: p.exposure ?? 1.0 });
  return {
    studio: st,
    update(t) {
      const w = ss(clamp((t - 0.3) / Math.max(1, dur - 0.8)));
      sun.intensity = lerp(0.6, 4.2, w);
      cool.intensity = lerp(9, 2.5, w);
      lamp.intensity = lerp(0, 12, w);
      st.scene.environmentIntensity = lerp(0.3, 0.42, w);
      const k = ss(clamp(t / dur));
      const b = breathe(t, 0.004, 2);
      st.camera.position.set(lerp(-1.75, -1.4, k) + b[0], lerp(1.12, 1.1, k) + b[1], lerp(3.4, 2.95, k) + b[2]);
      st.camera.lookAt(0.05, 0.92, 0.1);
      if (st.camera.fov !== 30) { st.camera.fov = 30; st.camera.updateProjectionMatrix(); }
      if (st.dof) st.dof.target = V3(0.45, 1.3, 0.42);
    },
  };
}
