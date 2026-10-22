// Style frame: the home robot on a dark stage under a top light (a product reveal).
// params: cam (full | mid | head | back), yaw, top, rim, fill, env, exposure
import { Studio, THREE, spot } from '../engine2/core.js';
import { loadBot, botMaterials } from '../engine2/bot.js';

export async function setup({ scale, params }) {
  const st = new Studio({ scale });
  const env = await st.hdri('../assets/hdri/studio_small_09_2k.hdr', { intensity: params.env ?? 0.32, rotation: params.rot ?? 0.6 });
  st.scene.background = new THREE.Color(params.bgc ?? 0x030406);
  // floor: dark polished concrete, fading into the dark
  const tex = st.pbr('Concrete034', { repeat: [24, 24] });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 96), new THREE.MeshStandardMaterial({
    ...tex, color: new THREE.Color(params.floor ?? 0x4a5058), roughness: 0.8, normalScale: new THREE.Vector2(0.25, 0.25),
    envMap: env, envMapIntensity: params.floorEnv ?? 0.02,  // (its own envMap, so its own intensity: the stage is dark)
  }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  st.scene.add(floor);

  const r = await loadBot(st, { mats: botMaterials({ envDiffuse: params.envDiffuse ?? 0.15, white: params.white ?? 0xd9dce0 }) });
  r.holder.rotation.y = params.yaw ?? 0.22;
  st.scene.add(r.holder);

  // a top light (the pool on the floor, the light on the head and shoulders), two rims from behind, a faint fill
  const top = spot(0xf3f6ff, params.top ?? 70, { pos: [0.25, 4.8, 1.0], target: [0, 0.85, 0], angle: 0.3, penumbra: 0.9, radius: 10, near: 2, far: 9, shadow: 2048 });
  const rimL = spot(0xd4e2ff, params.rim ?? 26, { pos: [-1.7, 2.7, -2.4], target: [0, 1.15, 0], angle: 0.42, penumbra: 1, shadow: 0 });
  const rimR = spot(0xffffff, (params.rim ?? 26) * 0.7, { pos: [1.9, 2.3, -2.3], target: [0, 1.05, 0], angle: 0.42, penumbra: 1, shadow: 0 });
  const fill = spot(0xffffff, params.fill ?? 2, { pos: [-1.4, 1.5, 3.2], target: [0, 1.0, 0], angle: 0.55, penumbra: 1, shadow: 0 });
  for (const l of [top, rimL, rimR, fill]) st.scene.add(l, l.target);

  const cams = {
    full: { pos: [0.5, 0.92, 5.4], look: [0, 0.87, 0], fov: 23 },
    mid: { pos: [0.42, 1.36, 2.3], look: [0, 1.27, 0], fov: 25 },
    head: { pos: [0.3, 1.6, 1.0], look: [0, 1.57, 0], fov: 24 },
    back: { pos: [-1.6, 1.2, -4.6], look: [0, 0.95, 0], fov: 24 },
  };
  const cam = params.camera || cams[params.cam || 'full'];
  st.camera.position.set(...cam.pos);
  st.camera.lookAt(...cam.look);
  st.camera.fov = cam.fov;
  st.camera.updateProjectionMatrix();
  st.post({
    ao: { radius: 0.05, intensity: 1.2 }, dof: null,
    bloom: { intensity: 0.22, threshold: 0.85, radius: 0.7 },
    vignette: params.vignette ?? 0.55, exposure: params.exposure ?? 1.0, contrast: 0.08, saturation: -0.08,
  });
  return { canvas: st.canvas, frame: () => st.render() };
}
