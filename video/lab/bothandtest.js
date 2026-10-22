// Check the robot hand's pinch pose: the hand on the dark stage, seen from a few sides. params: view (0..3)
import { Studio, THREE, spot } from '../engine2/core.js';
import { loadBotHand, solvePinch, padPoint } from '../engine2/bothand.js';
import { botMaterial } from '../engine2/bot.js';

export async function setup({ scale, params }) {
  const st = new Studio({ scale });
  await st.hdri('../assets/hdri/studio_small_09_2k.hdr', { intensity: 0.5, rotation: 2.2 });
  st.scene.background = new THREE.Color(0x15171a);
  const h = await loadBotHand(st, { material: botMaterial({ envDiffuse: 0.6, white: 0xd9dce0 }) });
  st.scene.add(h.holder);
  const g = solvePinch(h, params.gap ?? 0.004);
  console.warn('pinch', JSON.stringify(g.pose), 'err', g.err.toFixed(4), 'gap', g.gap.toFixed(4));
  for (const f of [1, 2, 3]) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.0015, 12, 8), new THREE.MeshBasicMaterial({ color: [0, 0xff3030, 0x30ff30, 0x3080ff][f] }));
    m.position.copy(padPoint(h, f));
    st.scene.add(m);
  }
  const key = spot(0xffffff, 3, { pos: [0.6, 0.8, 0.6], target: [0, 0, -0.08], angle: 0.5, penumbra: 1, radius: 4, near: 0.2, far: 3 });
  st.scene.add(key, key.target);
  const views = [[0.25, 0.05, -0.1], [-0.25, 0.0, -0.1], [0.0, -0.25, -0.12], [0.02, 0.1, -0.35]];
  const v = views[params.view ?? 0];
  st.camera.position.set(...v);
  st.camera.lookAt(0, 0, -0.1);
  st.camera.fov = 40;
  st.camera.updateProjectionMatrix();
  st.post({ ao: { radius: 0.01, intensity: 1.5 }, bloom: null, vignette: 0.2 });
  return { canvas: st.canvas, frame: () => st.render() };
}
