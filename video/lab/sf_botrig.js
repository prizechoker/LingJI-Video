// Check the rigged robot (engine2/botrig.js) on the dark stage of lab/sf_bot.js.
// params: poses: a list of pose specs, frame t renders poses[t] (rest | idle:<t> | walk:<phase> | run:<phase> |
//           test:<name> | a pose object)
//         shots: instead of poses, a list of { pose, cam | camera, yaw, reach, counter } (frame t renders shots[t])
//         cam: full | side | back | f34 | mid | top | close (with look/fov) or camera: {pos, look, fov}
//         yaw, markers (joint dots), wbone (paint the weight of one bone), xray (the body see-through)
import { Studio, THREE, spot } from '../engine2/core.js';
import { botMaterials } from '../engine2/bot.js';
import { loadBotRig, restPose, idlePose, walkPose, runPose, reachIK, handPoint, gait, soles } from '../engine2/botrig.js';

const TESTS = {
  // a deep bend at each joint, for checking the skin
  bend: { armL: { shoulder: [0.3, 0, 0.2], elbow: 2.0 }, armR: { shoulder: [1.2, 0, 0.1], elbow: 1.2 },
    legL: { hip: [1.4, 0, 0.05], knee: 2.0 }, legR: { hip: [-0.3, 0, 0], knee: 0.6, ankle: [-0.4, 0, 0], toe: 0.5 } },
  raise: { armL: { shoulder: [0, 0, 2.7], elbow: 0.2 }, armR: { shoulder: [2.9, 0, 0.1], elbow: 0.2 } },
  tpose: { armL: { shoulder: [0, 0, 1.5] }, armR: { shoulder: [0, 0, 1.5] } },
  twist: { armL: { shoulder: [0.4, 0.8, 0.3], elbow: 1.4, wrist: [0.4, 1.2, 0.2] }, armR: { shoulder: [0.2, -0.6, 0.2], elbow: 0.6, wrist: [-0.5, -1.0, -0.2] } },
  fist: { armL: { shoulder: [0.9, 0, 0.1], elbow: 1.5, fingers: 1, thumb: 1 }, armR: { shoulder: [0.9, 0, 0.1], elbow: 1.5, fingers: 0.5, thumb: 0.5, spread: 0.6 } },
  trunk: { spine: [0.35, 0.3, 0.1], chest: [0.25, 0.3, 0.1], neck: [0.3, 0.4, 0.15], head: [0.25, 0.5, 0.1] },
  look: { neck: [-0.25, -0.5, 0.0], head: [-0.3, -0.6, -0.2] },
  squat: { root: { pos: [0, -0.35, -0.05], rot: [0.5, 0, 0] }, spine: [0.15, 0, 0], legL: { hip: [1.9, 0.1, 0.25], knee: 2.1, ankle: [0.45, 0, 0] },
    legR: { hip: [1.9, 0.1, 0.25], knee: 2.1, ankle: [0.45, 0, 0] }, armL: { shoulder: [1.2, 0, 0.1], elbow: 0.6 }, armR: { shoulder: [1.2, 0, 0.1], elbow: 0.6 } },
};

function poseOf(spec) {
  if (typeof spec === 'object') return spec;
  const [k, a = '0'] = String(spec).split(':');
  const v = parseFloat(a);
  if (k === 'rest') return restPose();
  if (k === 'idle') return idlePose(v);
  if (k === 'walk') return walkPose(v);
  if (k === 'run') return runPose(v);
  if (k === 'test') return TESTS[a];
  return restPose();
}

export async function setup({ scale, params }) {
  const st = new Studio({ scale });
  const env = await st.hdri('../assets/hdri/studio_small_09_2k.hdr', { intensity: params.env ?? 0.32, rotation: params.rot ?? 0.6 });
  st.scene.background = new THREE.Color(params.bgc ?? 0x030406);
  const tex = st.pbr('Concrete034', { repeat: [24, 24] });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 96), new THREE.MeshStandardMaterial({
    ...tex, color: new THREE.Color(params.floor ?? 0x4a5058), roughness: 0.8, normalScale: new THREE.Vector2(0.25, 0.25),
    envMap: env, envMapIntensity: params.floorEnv ?? 0.02,
  }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  st.scene.add(floor);

  const rig = await loadBotRig(st, { mats: botMaterials({ envDiffuse: params.envDiffuse ?? 0.35, white: params.white ?? 0xd9dce0 }) });
  rig.holder.rotation.y = params.yaw ?? 0.22;
  st.scene.add(rig.holder);
  if (params.wbone) paintWeights(rig, params.wbone);
  if (params.xray) for (const m of Object.values(rig.parts)) { m.material = m.material.clone(); m.material.transparent = true; m.material.opacity = 0.35; m.material.depthWrite = false; }
  const dots = [];
  if (params.markers) {
    for (const b of Object.values(rig.bones)) {
      if (b.name.startsWith('x_')) continue;
      const m = new THREE.Mesh(new THREE.SphereGeometry(params.dot ?? 0.008, 12, 8), new THREE.MeshBasicMaterial({ color: /_L$/.test(b.name) ? 0xff4040 : /_R$/.test(b.name) ? 0x40a0ff : 0x40ff60, depthTest: false }));
      m.renderOrder = 10;
      st.scene.add(m);
      dots.push([m, b]);
    }
  }
  // a counter top, for reach tests
  let counter = null;
  const shots = params.shots || null;
  const counterSpec = params.counter || (shots && shots.find((x) => x.counter) || {}).counter;
  if (counterSpec) {
    const c = counterSpec;
    counter = new THREE.Mesh(new THREE.BoxGeometry(c.w ?? 1.2, 0.04, c.d ?? 0.6), new THREE.MeshStandardMaterial({ color: 0x777b80, roughness: 0.4 }));
    counter.position.set(...(c.pos ?? [0, 0.88, 0.55]));
    counter.castShadow = counter.receiveShadow = true;
    st.scene.add(counter);
  }
  const target = new THREE.Mesh(new THREE.SphereGeometry(0.012, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffc040 }));
  target.visible = false;
  st.scene.add(target);

  const top = spot(0xf3f6ff, params.top ?? 70, { pos: [0.25, 4.8, 1.0], target: [0, 0.85, 0], angle: 0.3, penumbra: 0.9, radius: 10, near: 2, far: 9, shadow: 2048 });
  const rimL = spot(0xd4e2ff, params.rim ?? 26, { pos: [-1.7, 2.7, -2.4], target: [0, 1.15, 0], angle: 0.42, penumbra: 1, shadow: 0 });
  const rimR = spot(0xffffff, (params.rim ?? 26) * 0.7, { pos: [1.9, 2.3, -2.3], target: [0, 1.05, 0], angle: 0.42, penumbra: 1, shadow: 0 });
  const fill = spot(0xffffff, params.fill ?? 4, { pos: [-1.4, 1.5, 3.2], target: [0, 1.0, 0], angle: 0.55, penumbra: 1, shadow: 0 });
  const sideL = spot(0xf4f6fa, params.side ?? 3, { pos: [-2.4, 1.0, 1.4], target: [0, 0.85, 0], angle: 0.5, penumbra: 1, shadow: 0 });
  const sideR = spot(0xf4f6fa, (params.side ?? 3) * 0.8, { pos: [2.4, 0.9, 1.6], target: [0, 0.8, 0], angle: 0.5, penumbra: 1, shadow: 0 });
  for (const l of [top, rimL, rimR, fill, sideL, sideR]) st.scene.add(l, l.target);
  if (params.noshadow) top.castShadow = false;
  if (params.key) { // an extra key from the camera's side, for close-ups of the surfaces
    const k = spot(0xffffff, params.key, { pos: params.keyPos ?? [2.5, 2.2, 3.0], target: [0, 1.0, 0], angle: 0.5, penumbra: 1, shadow: 0 });
    st.scene.add(k, k.target);
  }

  const cams = {
    full: { pos: [0.5, 0.92, 5.4], look: [0, 0.87, 0], fov: 23 },
    side: { pos: [5.4, 0.92, 0.2], look: [0, 0.87, 0], fov: 23 },
    back: { pos: [-1.6, 1.2, -4.6], look: [0, 0.95, 0], fov: 24 },
    f34: { pos: [3.6, 1.2, 3.9], look: [0, 0.9, 0], fov: 23 },
    mid: { pos: [0.42, 1.36, 2.3], look: [0, 1.27, 0], fov: 25 },
    top: { pos: [1.2, 3.2, 2.6], look: [0, 1.0, 0], fov: 25 },
  };
  const aim = (cam) => {
    st.camera.position.set(...cam.pos);
    st.camera.lookAt(...cam.look);
    st.camera.fov = cam.fov;
    st.camera.updateProjectionMatrix();
  };
  aim(params.camera || cams[params.cam || 'full']);
  st.post({
    ao: params.ao === 0 ? null : { radius: 0.05, intensity: params.ao ?? 0.7 }, dof: null,
    bloom: { intensity: 0.22, threshold: 0.85, radius: 0.7 },
    vignette: params.vignette ?? 0.55, exposure: params.exposure ?? 1.0, contrast: 0.08, saturation: -0.08,
  });
  const poses = params.poses || ['rest'];
  if (params.info) {
    console.warn('gait walk', JSON.stringify(gait('walk')), 'run', JSON.stringify(gait('run')));
    for (const sp of poses) { const so = soles(poseOf(sp)); console.warn(sp, JSON.stringify(poseOf(sp).root), 'soles', JSON.stringify(so)); }
  }
  return {
    canvas: st.canvas,
    frame: (t) => {
      const shot = shots ? shots[Math.round(t)] : null;
      const spec = shot ? shot.pose : (poses[Math.round(t)] ?? poses[0]);
      if (shot) {
        aim(shot.camera || cams[shot.cam || 'full']);
        rig.holder.rotation.y = shot.yaw ?? params.yaw ?? 0.22;
        if (counter) counter.visible = !!shot.counter;
      }
      rig.setPose(poseOf(spec));
      const reach = shot ? shot.reach : params.reach;
      target.visible = false;
      if (reach) { // { side, target (holder space), pole, point, wrist }
        const r = reach;
        const tw = rig.holder.localToWorld(new THREE.Vector3(...r.target));
        const sol = reachIK(rig, r.side, tw, r.pole ? new THREE.Vector3(...r.pole) : null, r);
        target.position.copy(tw);
        target.visible = true;
        const got = handPoint(rig, r.side, r.point || 'palm');
        console.warn('reach', JSON.stringify(sol), 'err', got.distanceTo(tw).toFixed(4));
      }
      for (const [m, b] of dots) b.getWorldPosition(m.position);
      st.render();
    },
  };
}

function paintWeights(rig, name) {
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
  for (const m of Object.values(rig.parts)) {
    if (!m.isSkinnedMesh) { m.material = new THREE.MeshBasicMaterial({ color: 0x202020 }); continue; }
    const names = name.split(',');
    const bis = new Set(m.skeleton.bones.map((b, i) => (names.includes(b.name) ? i : -1)).filter((i) => i >= 0));
    const g = m.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    const c = new Float32Array(si.count * 3);
    for (let i = 0; i < si.count; i++) {
      let w = 0;
      for (let k = 0; k < 4; k++) if (bis.has(si.getComponent(i, k))) w += sw.getComponent(i, k);
      if (names.includes('#stripes')) w = (Math.floor(w * 10) % 2) * 0.5 + w * 0.5;
      const col = new THREE.Color().setHSL(0.66 * (1 - w), 0.9, 0.18 + 0.4 * w);
      c.set([col.r, col.g, col.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    m.material = mat;
  }
}
