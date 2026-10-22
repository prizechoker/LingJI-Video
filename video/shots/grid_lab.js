// TEMP lab stage for the grid chapter parts (deleted when done)
import { Studio, THREE, spot } from '../engine2/core.js';
import { grade, V3 } from './lib/kit.js';
import { armFleet, solveArm } from './lib/grid_arm.js';

export async function create({ renderer, scale, p }) {
  const st = new Studio({ scale, renderer });
  await st.hdri('../assets/hdri/empty_warehouse_01_2k.hdr', { intensity: 0.5, rotation: 0.5 });
  st.scene.background = new THREE.Color(0x0b0d10);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshPhysicalMaterial({ color: 0x5a5f66, roughness: 0.6 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  st.scene.add(floor);
  const arms = [{ x: 0, z: 0, yaw: 0, tool: 'torch' }, { x: 0, z: 2.2, yaw: 0, tool: 'gripper' }];
  const fleet = armFleet(arms);
  st.scene.add(fleet.group);
  const key = spot(0xdfe9ff, 60, { pos: [3, 7, 4], target: [0.5, 0.8, 1], angle: 0.5, penumbra: 0.8, far: 20, radius: 3 });
  st.scene.add(key, key.target);
  const tgt = new THREE.Mesh(new THREE.SphereGeometry(0.015), new THREE.MeshBasicMaterial({ color: 0xff3300 }));
  st.scene.add(tgt);
  grade(st, { ao: { radius: 0.15, intensity: 1.5 }, exposure: 1.0 });
  const cam = p.cam || [3.2, 1.8, 3.4];
  return {
    studio: st,
    update(t) {
      const S = V3(1.25 + 0.2 * Math.sin(t), 0.9, 0.2 * Math.cos(t));
      fleet.pose(0, solveArm(S, p.pitch ?? 0.5, 'torch'));
      const S2 = V3(1.2, 0.8 + 0.2 * Math.sin(t), 0.3);
      fleet.pose(1, solveArm(S2, Math.PI / 2, 'gripper'));
      fleet.commit();
      tgt.position.copy(S);
      st.camera.position.set(...cam);
      st.camera.lookAt(...(p.look || [0.6, 0.9, 1.0]));
      st.camera.fov = p.fov || 40;
      st.camera.updateProjectionMatrix();
    },
  };
}
