// Design check for the home robot: neutral studio, several angles.
import { Studio, THREE, spot } from '../engine2/core.js';
import { loadRobot, setRobotPose } from '../engine2/robot.js';

export async function setup({ scale, params }) {
  const st = new Studio({ scale });
  await st.hdri('../assets/hdri/studio_small_09_2k.hdr', { intensity: params.env ?? 0.8, rotation: params.rot ?? 0.6 });
  st.scene.background = new THREE.Color(0x8a8d92);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ color: 0x8a8d92, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  st.scene.add(floor);
  const r = await loadRobot(st);
  st.scene.add(r.holder);
  setRobotPose(r, params.pose || {});
  const key = spot(0xfff1e0, params.key ?? 30, { pos: [1.5, 3, 2.5], target: [0, 1, 0], angle: 0.5, penumbra: 0.9, radius: 6, near: 0.5, far: 10 });
  st.scene.add(key, key.target);
  const cams = {
    front: { pos: [0.0, 1.0, 3.6], look: [0, 0.82, 0], fov: 30 },
    f34: { pos: [1.7, 1.15, 3.0], look: [0, 0.82, 0], fov: 30 },
    side: { pos: [3.6, 1.0, 0.0], look: [0, 0.82, 0], fov: 30 },
    back: { pos: [-1.6, 1.2, -3.1], look: [0, 0.82, 0], fov: 30 },
    face: { pos: [0.35, 1.55, 0.75], look: [0, 1.45, 0], fov: 28 },
    hand: { pos: [0.5, 0.82, 0.42], look: [0.2, 0.74, 0.0], fov: 22 },
    handin: { pos: [-0.05, 0.78, 0.35], look: [0.2, 0.74, 0.0], fov: 22 },
    feet: { pos: [0.4, 0.3, 1.0], look: [0.0, 0.08, 0.0], fov: 26 },
    torso: { pos: [0.6, 1.3, 1.3], look: [0, 1.2, 0], fov: 32 },
  };
  const cam = cams[params.cam || 'f34'];
  st.camera.position.set(...cam.pos);
  st.camera.lookAt(...cam.look);
  st.camera.fov = cam.fov;
  st.camera.updateProjectionMatrix();
  st.post({ ao: { radius: 0.05, intensity: 1.6 }, bloom: { intensity: 0.4, threshold: 1.0 }, vignette: 0.3, contrast: 0.05 });
  return { canvas: st.canvas, frame: () => st.render() };
}
