// Style frame: the home robot in a kitchen at golden hour, turning a porcelain bowl over in its hand.
import { Studio, THREE, spot } from '../engine2/core.js';
import { loadRobot, setRobotPose } from '../engine2/robot.js';
import { buildKitchen } from '../engine2/kitchen.js';
import { buildBowl, surfaceDroplets } from '../engine2/dishes.js';

const curl = (side, k, f = [1, 1.15, 0.8]) => {
  const o = {};
  for (const n of [2, 3, 4, 5]) for (let s = 1; s <= 3; s++) o[`f${n}${s}_${side}`] = [k * f[s - 1] * (1 + (n - 2) * 0.12), 0, 0];
  return o;
};

export async function setup({ scale, params }) {
  const st = new Studio({ scale });
  const rot = params.rot ?? 2.2;
  await st.hdri('../assets/hdri/blinds_2k.hdr', { intensity: params.env ?? 0.55, rotation: rot, background: { blur: params.blur ?? 0.12, intensity: params.bg ?? 0.55 } });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshPhysicalMaterial({ ...st.pbr('Wood027', { repeat: [6, 6] }), roughness: 0.45, clearcoat: 0.3 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  st.scene.add(floor);
  const kitchen = buildKitchen(st, { width: 3.0 });
  kitchen.position.set(params.kx ?? -0.35, 0, params.kz ?? -0.55);
  st.scene.add(kitchen);

  const r = await loadRobot(st);
  st.scene.add(r.holder);
  r.holder.rotation.y = params.yaw ?? 0.32;
  const pose = {
    spine: [0.05, -0.08, 0], neck: [0.12, -0.05, 0], head: [0.2, -0.12, 0.04],
    shoulder_R: [-0.22, 0, -0.08], elbow_R: [-1.42, 0, 0], wrist_R: [0.1, -Math.PI / 2, 0],
    shoulder_L: [-0.05, 0, 0.04], elbow_L: [-0.3, 0, 0],
    ...curl('R', 0.22), f11_R: [0.25, 0, 0], f12_R: [0.2, 0, 0], f13_R: [0.15, 0, 0],
    ...curl('L', 0.35),
  };
  setRobotPose(r, pose);

  // the bowl rests on the right palm
  const J = (n) => r.joints[n].getWorldPosition(new THREE.Vector3());
  const wrist = J('wrist_R'), i1 = J('f21_R'), l1 = J('f51_R'), m1 = J('f31_R');
  const across = i1.clone().sub(l1), alongH = m1.clone().sub(wrist);
  let up = new THREE.Vector3().crossVectors(across, alongH).normalize();
  if (up.y < 0) up.negate();
  const centre = wrist.clone().lerp(m1, 0.62).addScaledVector(up, 0.016);
  const bowl = buildBowl();
  bowl.position.copy(centre);
  bowl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
  st.scene.add(bowl);
  bowl.updateMatrixWorld(true);
  const wet = surfaceDroplets(bowl, { n: 70 });
  bowl.add(wet);

  // light: warm low sun through the window behind (rim), soft cool-neutral key from the front left, a little fill
  const sun = new THREE.DirectionalLight(0xffc98f, params.sun ?? 3.2);
  sun.position.set(-1.6, 2.4, -3.0);
  sun.target.position.set(0, 1.1, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -1.5, right: 1.5, top: 2, bottom: -0.2, near: 0.5, far: 8 });
  sun.shadow.radius = 4;
  sun.shadow.bias = -0.0003;
  st.scene.add(sun, sun.target);
  const key = spot(0xf3f0ea, params.key ?? 9, { pos: [1.8, 2.0, 2.4], target: [0, 1.25, 0], angle: 0.45, penumbra: 1, radius: 8, near: 0.5, far: 8 });
  st.scene.add(key, key.target);

  const cam = { pos: params.cpos || [0.95, 1.36, 2.15], look: params.look || [0.02, 1.22, 0], fov: params.fov ?? 25 };
  st.camera.position.set(...cam.pos);
  st.camera.lookAt(...cam.look);
  st.camera.fov = cam.fov;
  st.camera.updateProjectionMatrix();
  const focus = st.camera.position.distanceTo(J('head'));
  st.post({
    ao: { radius: 0.06, intensity: 1.6 },
    dof: params.dof === false ? null : { distance: focus, range: params.range ?? 0.35, bokeh: params.bokeh ?? 3.5 },
    bloom: { intensity: 0.35, threshold: 0.95, radius: 0.7 },
    vignette: 0.55, exposure: params.exposure ?? 1.0, contrast: 0.08, saturation: 0.0,
  });
  return { canvas: st.canvas, frame: () => st.render() };
}
