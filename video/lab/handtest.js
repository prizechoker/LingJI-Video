import { Studio, THREE, spot } from '../engine2/core.js';
import { loadHand, setPose, POSES } from '../engine2/hand.js';

export async function setup({ scale }) {
  const st = new Studio({ scale });
  await st.hdri('../assets/hdri/studio_small_09_2k.hdr', { intensity: 0.6 });
  st.scene.background = new THREE.Color(0x0a0c10);
  const key = spot(0xfff0e0, 40, { pos: [0.4, 0.9, 0.5], target: [0, 0, -0.08], angle: 0.6, penumbra: 0.7 });
  st.scene.add(key, key.target);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.8 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.06; floor.receiveShadow = true;
  st.scene.add(floor);
  const hands = [];
  const poses = [
    POSES.rest,
    { index: [1.2, 0, 0] },
    { index: [0, 1.2, 0.6], middle: [0.3, 0.3, 0.3] },
    { index: [1.1, 1.3, 0.8], middle: [1.1, 1.3, 0.8], ring: [1.1, 1.3, 0.8], little: [1.1, 1.3, 0.8], thumb: [0.4, 0.5, 0.5] },
  ];
  for (let i = 0; i < 4; i++) {
    const h = await loadHand(st);
    h.holder.position.set(-0.36 + i * 0.24, 0, 0.05);
    setPose(h, poses[i]);
    st.scene.add(h.holder);
    hands.push(h);
  }
  st.camera.fov = 32;
  st.camera.position.set(0, 0.42, 0.42);
  st.camera.lookAt(0, -0.02, -0.07);
  st.camera.updateProjectionMatrix();
  st.post({ dof: null, bloom: { intensity: 0.2, threshold: 0.95 }, ao: { radius: 0.03, intensity: 2 } });
  return { canvas: st.canvas, frame: () => st.render() };
}
