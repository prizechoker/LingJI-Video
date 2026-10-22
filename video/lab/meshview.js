// Quick look at a model: neutral studio, white clay material. params: { url, cam, yaw }
import { Studio, THREE, spot } from '../engine2/core.js';

export async function setup({ scale, params }) {
  const st = new Studio({ scale });
  await st.hdri('../assets/hdri/studio_small_09_2k.hdr', { intensity: 0.7, rotation: 0.4 });
  st.scene.background = new THREE.Color(0x9a9da2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ color: 0x9a9da2, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  st.scene.add(floor);
  const g = await st.gltf.loadAsync(params.url);
  const clay = params.mat === 'black'
    ? new THREE.MeshPhysicalMaterial({ color: 0x060607, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03 })
    : new THREE.MeshPhysicalMaterial({ color: 0xe8e6e2, roughness: 0.5, clearcoat: 0.2 });
  g.scene.traverse((o) => { if (o.isMesh) { o.material = clay; o.castShadow = o.receiveShadow = true; } });
  g.scene.rotation.y = params.yaw ?? 0;
  if (params.each) g.scene.traverse((o) => { if (o.isMesh) o.rotation.y = params.each; });  // (each part turns about its own origin)  // turn each part in place
  st.scene.add(g.scene);
  const key = spot(0xffffff, 26, { pos: [-1.8, 3.0, 2.6], target: [0, 1.0, 0], angle: 0.5, penumbra: 1, radius: 10, near: 1, far: 10 });
  st.scene.add(key, key.target);
  const cams = {
    full: { pos: [0.0, 1.0, 4.4], look: [0, 0.86, 0], fov: 26 },
    f34: { pos: [1.6, 1.1, 4.0], look: [0, 0.86, 0], fov: 26 },
    side: { pos: [4.4, 1.0, 0.0], look: [0, 0.86, 0], fov: 26 },
    head: { pos: [0.25, 1.62, 0.8], look: [0, 1.56, 0], fov: 22 },
  };
  const c = params.pos ? { pos: params.pos, look: params.look, fov: params.fov ?? 26 } : cams[params.cam || 'full'];
  st.camera.position.set(...c.pos);
  st.camera.lookAt(...c.look);
  st.camera.fov = c.fov;
  st.camera.updateProjectionMatrix();
  st.post({ ao: { radius: 0.04, intensity: 1.4 }, bloom: null, vignette: 0.2 });
  return { canvas: st.canvas, frame: () => st.render() };
}
