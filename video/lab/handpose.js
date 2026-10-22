// Pose test for the robot hand rig: fingers, pad markers, several views.
import { Studio, THREE, spot } from '../engine2/core.js';
import { loadRobot } from '../engine2/robot.js';
import { handRig, poseHand, padPoint } from '../engine2/robothand.js';

export async function setup({ scale, params }) {
  const st = new Studio({ scale });
  await st.hdri('../assets/hdri/studio_small_09_2k.hdr', { intensity: 0.8, rotation: 0.6 });
  st.scene.background = new THREE.Color(0x8a8d92);
  const r = await loadRobot(st);
  const h = handRig(r, 'R');
  st.scene.add(h.rig);
  poseHand(h, params.pose || {});
  const mk = (p, c) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.003, 12, 8), new THREE.MeshBasicMaterial({ color: c })); m.position.copy(p); st.scene.add(m); };
  mk(padPoint(h, 'thumb'), 0xff2020);
  mk(padPoint(h, 'index'), 0x20ff20);
  mk(padPoint(h, 'middle'), 0x2040ff);
  const key = spot(0xffffff, 6, { pos: [0.6, 0.6, 1.2], target: [0, -0.3, 0], angle: 0.5, penumbra: 1 });
  st.scene.add(key, key.target);
  const wrist = h.wrist.getWorldPosition(new THREE.Vector3());
  const c = wrist.clone().add(new THREE.Vector3(0.02, -0.08, 0.02));
  const views = { palm: [0.45, 0, 0.0], back: [-0.45, 0, 0.0], front: [0.0, 0.0, 0.45], side: [0.0, 0.0, -0.45], top: [0.05, 0.45, 0.02] };
  const v = views[params.view || 'palm'];
  st.camera.position.copy(c).add(new THREE.Vector3(...v));
  st.camera.lookAt(c);
  st.camera.fov = 28;
  st.camera.updateProjectionMatrix();
  st.post({ ao: { radius: 0.01, intensity: 1.5 }, bloom: null, vignette: 0.2 });
  return { canvas: st.canvas, frame: () => st.render() };
}
