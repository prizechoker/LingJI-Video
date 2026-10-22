// Style frame: the home robot as a product "press photo" — dark studio, soft key, two rim lights.
import { Studio, THREE, spot } from '../engine2/core.js';
import { loadRobot, setRobotPose } from '../engine2/robot.js';

const curl = (side, k) => {
  const o = {};
  for (const n of [2, 3, 4, 5]) for (let s = 1; s <= 3; s++) o[`f${n}${s}_${side}`] = [k * [1, 1.15, 0.8][s - 1] * (1 + (n - 2) * 0.15), 0, 0];
  return o;
};

export async function setup({ scale, params }) {
  const st = new Studio({ scale });
  await st.hdri('../assets/hdri/studio_small_09_2k.hdr', { intensity: params.env ?? 0.28, rotation: params.rot ?? 0.9 });
  st.scene.background = new THREE.Color(params.bgc ?? 0x15171b);
  // seamless backdrop: floor curving up into a wall
  const W = 14, R = 2.2, D = 6;
  const shape = new THREE.Shape();
  shape.moveTo(-D, 0);
  shape.lineTo(-R, 0);
  shape.absarc(-R, R, R, -Math.PI / 2, 0, false);
  shape.lineTo(0, 7);
  const pts = shape.getPoints(64);
  const geo = new THREE.BufferGeometry();
  const verts = [], idx = [];
  for (let i = 0; i < pts.length; i++) {
    verts.push(-W / 2, pts[i].y, -pts[i].x - 2.6, W / 2, pts[i].y, -pts[i].x - 2.6);
    if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const cyc = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: params.cyc ?? 0x2a2d33, roughness: 0.85, side: THREE.DoubleSide }));
  cyc.receiveShadow = true;
  st.scene.add(cyc);

  const r = await loadRobot(st);
  st.scene.add(r.holder);
  r.holder.rotation.y = params.yaw ?? 0.42;
  setRobotPose(r, {
    spine: [0.0, 0.06, 0], neck: [0.02, 0.12, 0], head: [0.04, 0.22, -0.03],
    shoulder_R: [-0.06, 0, -0.05], elbow_R: [-0.32, 0, 0], wrist_R: [0, -0.2, 0],
    shoulder_L: [0.04, 0, 0.06], elbow_L: [-0.18, 0, 0], wrist_L: [0, 0.15, 0],
    ...curl('R', 0.32), ...curl('L', 0.42), f11_R: [0.2, 0, 0], f11_L: [0.2, 0, 0],
    hip_R: [-0.03, 0, -0.02], knee_R: [0.06, 0, 0], ankle_R: [-0.03, 0, 0],
  });

  // key: big soft warm-white from front left; rims: cool from back left, warm from back right; a glow on the wall
  const key = spot(0xfff2e6, params.key ?? 28, { pos: [-2.2, 3.0, 2.6], target: [0, 1.1, 0], angle: 0.42, penumbra: 1, radius: 10, near: 1, far: 10, shadow: 2048 });
  const fill = spot(0xdfe7f2, params.fill ?? 5, { pos: [2.6, 1.2, 2.4], target: [0, 1.0, 0], angle: 0.5, penumbra: 1, shadow: 0 });
  const rimL = spot(0xcfe2ff, params.rim ?? 40, { pos: [-1.8, 2.4, -2.0], target: [0, 1.2, 0], angle: 0.32, penumbra: 0.8, shadow: 0 });
  const rimR = spot(0xffe0c4, params.rim2 ?? 30, { pos: [2.0, 2.2, -1.8], target: [0, 1.1, 0], angle: 0.32, penumbra: 0.8, shadow: 0 });
  const wall = spot(0x9fb6d6, params.wall ?? 14, { pos: [0.3, 0.4, 1.0], target: [0.2, 1.6, -3.5], angle: 0.5, penumbra: 1, shadow: 0 });
  for (const l of [key, fill, rimL, rimR, wall]) st.scene.add(l, l.target);

  const cams = {
    full: { pos: [1.35, 0.95, 3.4], look: [0.02, 0.86, 0], fov: 32 },
    mid: { pos: [0.95, 1.38, 2.05], look: [0.0, 1.2, 0], fov: 26 },
    face: { pos: [0.45, 1.6, 0.95], look: [0.02, 1.55, 0], fov: 24 },
  };
  const cam = cams[params.cam || 'full'];
  st.camera.position.set(...cam.pos);
  st.camera.lookAt(...cam.look);
  st.camera.fov = cam.fov;
  st.camera.updateProjectionMatrix();
  const head = r.joints.head.getWorldPosition(new THREE.Vector3());
  st.post({
    ao: { radius: 0.06, intensity: 1.5 },
    dof: params.dof ? { distance: st.camera.position.distanceTo(head), range: params.range ?? 0.6, bokeh: params.bokeh ?? 2.5 } : null,
    bloom: { intensity: 0.45, threshold: 0.9, radius: 0.7 },
    vignette: 0.6, exposure: params.exposure ?? 1.0, contrast: 0.1, saturation: 0.02,
  });
  return { canvas: st.canvas, frame: () => st.render() };
}
