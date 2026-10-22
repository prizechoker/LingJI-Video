// Style frame: the robot's hand loses a wet porcelain bowl over the sink (high-speed, frozen droplets).
import { Studio, THREE, spot } from '../engine2/core.js';
import { loadRobot } from '../engine2/robot.js';
import { handRig, poseHand, padPoint } from '../engine2/robothand.js';
import { buildKitchen, COUNTER } from '../engine2/kitchen.js';
import { buildBowl, bowlGeometry, surfaceDroplets, waterMaterial, waterInBowl, spillStream } from '../engine2/dishes.js';

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

export async function setup({ scale, params }) {
  const st = new Studio({ scale });
  const rot = params.rot ?? 0.0;
  await st.hdri(`../assets/hdri/${params.hdri || 'blinds'}_2k.hdr`, { intensity: params.env ?? 0.5, rotation: rot, background: { blur: params.blur ?? 0.08, intensity: params.bg ?? 0.6 } });
  const kitchen = buildKitchen(st, { width: 2.4 });
  kitchen.position.x = params.kx ?? 0.2;
  st.scene.add(kitchen);
  const water = waterMaterial();

  // ---- the hand in a pinch pose; the bowl stands upright over the sink and the hand is put on its rim
  const r = await loadRobot(st);
  const h = handRig(r, 'R');
  st.scene.add(h.rig);
  const grip = params.grip || {
    wrist: [0.25, 0, 0], index: [0.55, 0.7, 0.45], middle: [0.6, 0.75, 0.45], ring: [0.7, 0.8, 0.5], little: [0.75, 0.85, 0.5],
    thumb: [0.35, 0.25, 0.2], thumbBase: [0.5, 0.0],
  };
  poseHand(h, grip);
  const V3 = (...a) => new THREE.Vector3(...a);
  const basis = (x, y) => new THREE.Matrix4().makeBasis(x, y, V3().crossVectors(x, y));
  const tP = padPoint(h, 'thumb'), fP = padPoint(h, 'index').lerp(padPoint(h, 'middle'), 0.5);
  const R0 = tP.clone().lerp(fP, 0.5);
  const nW = fP.clone().sub(tP).normalize();  // from the thumb (inside the bowl) to the fingers (outside)
  const wristP = h.wrist.getWorldPosition(V3());
  const uH = wristP.clone().sub(R0);
  uH.addScaledVector(nW, -uH.dot(nW)).normalize();
  const handF = basis(nW, uH).transpose();
  const fRest = wristP.clone().sub(h.elbow.getWorldPosition(V3())).normalize();
  const j31 = h.joint('f31');
  const palmRest = j31.localToWorld(V3(0, 1, 0)).sub(j31.getWorldPosition(V3()));
  console.warn('pinch gap mm', (tP.distanceTo(fP) * 1000).toFixed(1));

  const cam = { pos: params.cpos || [-0.2, 0.97, 0.1], look: params.look || [0.0, 1.0, -0.24], fov: params.fov ?? 26 };
  const g = bowlGeometry();
  const base = V3(...(params.at || [0.02, COUNTER.top + 0.07, -0.27]));  // the bowl as it was held: upright over the sink
  const want = V3(...(params.fore || [-0.25, -0.6, -0.75])).normalize();  // forearm: from the robot, front right, above
  const toCam = V3(...cam.pos).sub(base).normalize();
  let best = null;
  const rad = THREE.MathUtils.degToRad;
  for (let phi = 0; phi < 360; phi += 3) {
    for (let tilt = 0; tilt <= 60; tilt += 3) {
      const nb = V3(Math.cos(rad(phi)), 0, Math.sin(rad(phi)));
      const tang = V3().crossVectors(V3(0, 1, 0), nb);
      const q = new THREE.Quaternion().setFromAxisAngle(tang, rad(tilt));  // lean the hand out over the rim
      const M = basis(nb.clone().applyQuaternion(q), V3(0, 1, 0).applyQuaternion(q)).multiply(handF);
      const fore = fRest.clone().transformDirection(M), palm = palmRest.clone().transformDirection(M);
      const score = fore.dot(want) - (params.palmW ?? 0.35) * palm.dot(toCam) - 0.002 * tilt + (params.nearW ?? 0) * nb.dot(V3(toCam.x, 0, toCam.z).normalize());
      if (!best || score > best.score) best = { score, phi, tilt, M, nb };
    }
  }
  console.warn('grip phi', best.phi, 'tilt', best.tilt, 'score', best.score.toFixed(3));
  const rimP = base.clone().add(V3(0, g.userData.rimY, 0)).addScaledVector(best.nb, g.userData.rimR);
  h.rig.quaternion.setFromRotationMatrix(best.M);
  h.rig.position.copy(rimP).sub(R0.clone().applyMatrix4(best.M));
  h.rig.updateMatrixWorld(true);
  // the bowl now: pivoted off the fingertips (its far side swinging down) and dropping
  const bowl = buildBowl();
  const slip = params.slip ?? 1.0;
  const tangent = V3().crossVectors(V3(0, 1, 0), best.nb);
  const qSlip = new THREE.Quaternion().setFromAxisAngle(tangent, -(params.tilt ?? 0.5) * slip);
  // a little spin about the vertical too: it is tumbling, not being poured
  const qSpin = new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), (params.spin ?? 0.25) * slip);
  qSlip.premultiply(qSpin);
  bowl.quaternion.copy(qSlip);
  bowl.position.copy(base).sub(rimP).applyQuaternion(qSlip).add(rimP).add(V3(0, -(params.drop ?? 0.03) * slip, 0));
  st.scene.add(bowl);
  bowl.updateMatrixWorld(true);
  bowl.add(surfaceDroplets(bowl, { n: 90, mat: water }));
  const rim = rimP;
  // the rinse water still in the bowl, spilling over the low side of the lip
  if (params.water !== false) {
    const pool = waterInBowl(bowl, { mat: water });
    st.scene.add(pool);
    const sp = pool.userData.spillPoint;
    const axisW = new THREE.Vector3().setFromMatrixPosition(bowl.matrixWorld);
    const out = sp.clone().sub(axisW).setY(0).normalize();
    const vel = out.multiplyScalar(params.spillV ?? 0.32).add(V3(0, 0.02, 0));
    st.scene.add(spillStream(sp, vel, { T: params.spillT ?? 0.085, width: params.spillW ?? 0.012, thick: 0.0034, drops: 44, mat: water }));
  }

  // ---- droplets thrown off the rim where it slid out, and a fine trail falling from the fingers
  const R = rng(params.seed ?? 7);
  const drops = new THREE.Group();
  const sph = new THREE.SphereGeometry(1, 20, 14);
  const lip = new THREE.Vector3(), tmp = new THREE.Vector3();
  for (let k = 0; k < (params.ndrops ?? 70); k++) {
    // start on the rim near the fingers, fly out along a fan, stretched along the motion
    const a = (R() - 0.5) * 1.6;
    lip.set(Math.cos(a) * g.userData.rimR, g.userData.rimY, Math.sin(a) * g.userData.rimR);
    const dirLocal = new THREE.Vector3(Math.cos(a), 0.15 + R() * 0.5, Math.sin(a)).normalize();
    bowl.localToWorld(lip);
    const dir = dirLocal.transformDirection(bowl.matrixWorld);
    const dist = 0.004 + R() ** 1.6 * 0.07;
    const p = lip.clone().addScaledVector(dir, dist).add(tmp.set(0, -dist * dist * 6, 0));
    const rr = 0.0005 + R() ** 2.4 * 0.0024;
    const m = new THREE.Mesh(sph, water);
    m.position.copy(p);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    m.scale.set(rr, rr, rr * (1 + R() * 1.8));
    drops.add(m);
  }
  for (let k = 0; k < 14; k++) {  // drips from the fingertips
    const p = padPoint(h, ['index', 'middle', 'ring'][k % 3], 0.95, 0.002);
    const rr = 0.0012 + R() * 0.0012;
    const m = new THREE.Mesh(sph, water);
    m.position.copy(p).add(new THREE.Vector3((R() - 0.5) * 0.004, -0.004 - R() * 0.05 * (k / 14), (R() - 0.5) * 0.004));
    m.scale.set(rr, rr * 1.25, rr);
    drops.add(m);
  }
  st.scene.add(drops);

  // ---- faucet stream behind, out of focus
  const spout = kitchen.userData.spout.clone().add(kitchen.position);
  const bottom = COUNTER.top - COUNTER.t - COUNTER.sink.depth;
  const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0045, spout.y - bottom, 24, 1, true), water);
  stream.position.set(spout.x, (spout.y + bottom) / 2, spout.z);
  st.scene.add(stream);

  // ---- light: warm sun through the blinds behind (rim), soft key from the camera side, cool bounce from the sink
  const sun = new THREE.DirectionalLight(0xffc48a, params.sun ?? 4.5);
  sun.position.set(0.4, 2.2, -2.6);
  sun.target.position.set(0, 1.0, -0.25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -0.6, right: 0.6, top: 0.6, bottom: -0.6, near: 1, far: 6 });
  sun.shadow.radius = 3;
  sun.shadow.bias = -0.0002;
  st.scene.add(sun, sun.target);
  const key = spot(0xeef2f8, params.key ?? 3.5, { pos: [-0.9, 1.6, 0.9], target: [0, 1.0, -0.25], angle: 0.4, penumbra: 1, radius: 6, near: 0.5, far: 5 });
  st.scene.add(key, key.target);

  st.camera.position.set(...cam.pos);
  st.camera.lookAt(...cam.look);
  st.camera.fov = cam.fov;
  st.camera.updateProjectionMatrix();
  st.post({
    ao: { radius: 0.02, intensity: 1.6, falloff: 0.5 },
    dof: params.dof === false ? null : { distance: st.camera.position.distanceTo(rim), range: params.range ?? 0.06, bokeh: params.bokeh ?? 5 },
    bloom: { intensity: 0.4, threshold: 0.9, radius: 0.75 },
    vignette: 0.6, exposure: params.exposure ?? 1.0, contrast: 0.08, saturation: 0.0,
  });
  return { canvas: st.canvas, frame: () => st.render() };
}
