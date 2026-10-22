// E40 "今天，有的家务机器人碰到复杂的活儿，背后还要靠一个戴着VR眼镜的真人，在远处替它操作。"
// The robot at the counter reaching for a bowl — then (cue "human": 背后还要靠) a match cut on the same reach to a dark
// room far away: a person in a VR headset, back-lit, making exactly that movement with a controller in hand. At cue
// "far" a small tag: 远程操作.
import { Studio, THREE, spot } from '../engine2/core.js';
import { botMaterials, botMaterial } from '../engine2/bot.js';
import { loadBotRig, idlePose, reachIK, handPoint } from '../engine2/botrig.js';
import { buildKitchen, COUNTER } from '../engine2/kitchen.js';
import { buildBowl, porcelainMaterial } from '../engine2/dishes.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ss, sstep, clamp, lerp, breathe, grade, caption, V3 } from './lib/kit.js';

// the shared performance: reach for the bowl, close the hand, lift (t in seconds of the movement)
function reachPath(t, bowlAt) {
  const k = ss(clamp((t - 0.4) / 1.6));
  const lift = ss(clamp((t - 2.6) / 1.0)) * 0.12;
  const start = V3(-0.05, 1.0, 0.25);
  const grip = bowlAt.clone().add(V3(0.07, 0.065, 0.0));
  return { target: start.lerp(grip, k).add(V3(0, lift + 0.05 * Math.sin(Math.PI * k), 0)), close: sstep(2.0, 2.5, t), lift };
}

async function kitchenSet(renderer, scale) {
  const st = new Studio({ scale, renderer });
  await st.hdri('../assets/hdri/blinds_2k.hdr', { intensity: 0.26, rotation: 2.1, background: { blur: 0.08, intensity: 0.32 } });
  const kitchen = buildKitchen(st, { width: 2.4 });
  kitchen.position.set(-0.6, 0, 0);
  st.scene.add(kitchen);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshPhysicalMaterial({ ...st.pbr('Wood026', { repeat: [6, 6] }), color: 0xb08a68, roughness: 0.45, clearcoat: 0.3 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  st.scene.add(floor);
  const bowlAt = V3(0.35, COUNTER.top, -0.2);
  const bowl = buildBowl(porcelainMaterial());
  bowl.position.copy(bowlAt);
  st.scene.add(bowl);
  const rig = await loadBotRig(st, { mats: botMaterials({ envDiffuse: 0.5, white: 0xdcdfe2 }) });
  rig.holder.position.set(0.25, 0, 0.42);
  rig.holder.rotation.y = Math.PI; // facing the counter (-z)
  st.scene.add(rig.holder);
  const key = spot(0xf2f5fa, 9, { pos: [1.8, 2.6, 1.8], target: [0.3, 1.0, 0], angle: 0.45, penumbra: 1, radius: 6, near: 0.5, far: 6 });
  st.scene.add(key, key.target);
  grade(st, { ao: { radius: 0.05, intensity: 1.2 }, dof: { distance: 1.5, range: 0.8, bokeh: 2.5 }, bloom: { intensity: 0.3, threshold: 0.9 }, vignette: 0.6, contrast: 0.08, saturation: -0.22, exposure: 1.0 });
  let held = null;
  // the robot's own view (rendered for the operator's screen): from its head toward its hands
  const pov = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 20);
  const rt = new THREE.WebGLRenderTarget(640, 360, { colorSpace: THREE.SRGBColorSpace });
  return {
    st,
    rt,
    renderPov() {
      const hp = rig.bones.head.getWorldPosition(V3());
      pov.position.copy(hp).add(V3(0, 0.02, -0.08));
      pov.lookAt(handPoint(rig, 'R', 'grip').add(V3(0, -0.05, -0.05)));
      const r = st.renderer;
      r.setRenderTarget(rt);
      r.render(st.scene, pov);
      r.setRenderTarget(null);
    },
    pose(t) {
      const pose = idlePose(t);
      pose.spine = [0.08, 0, 0];
      pose.chest = [0.05, 0, 0];
      pose.head = [0.25, -0.1, 0];
      const r = reachPath(t, bowlAt);
      pose.armR = { ...pose.armR, wrist: [0.2, 0.4, 0], fingers: lerp(0.1, 0.75, r.close), thumb: lerp(0.1, 0.6, r.close) };
      rig.setPose(pose);
      rig.holder.updateMatrixWorld(true);
      reachIK(rig, 'R', r.target, null, { point: 'grip' });
      // after the grasp the bowl rides in the hand
      if (r.close > 0.95) {
        if (!held) held = bowl.position.clone().sub(handPoint(rig, 'R', 'grip'));
        bowl.position.copy(handPoint(rig, 'R', 'grip')).add(held);
      } else {
        held = null;
        bowl.position.copy(bowlAt);
      }
      const k = ss(clamp(t / 3.5));
      st.camera.position.set(lerp(2.0, 1.8, k), 1.42, lerp(1.25, 1.1, k));
      st.camera.lookAt(0.18, 1.12, 0.0);
      if (st.camera.fov !== 32) { st.camera.fov = 32; st.camera.updateProjectionMatrix(); }
      if (st.dof) st.dof.target = handPoint(rig, 'R', 'grip');
    },
  };
}

async function operatorSet(renderer, scale, feed) {
  const st = new Studio({ scale, renderer });
  await st.hdri('../assets/hdri/studio_small_09_2k.hdr', { intensity: 0.02, rotation: 0.6 });
  st.scene.background = new THREE.Color(0x010204);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.6 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  st.scene.add(floor);
  // the person: a dark figure (the same human proportions), a VR headset and a controller
  const skin = botMaterial({ white: 0x15161a, black: 0x0c0d10, roughWhite: 0.7, envDiffuse: 0.2, seam: 0.0, dark: 1.0 });
  const rig = await loadBotRig(st, { mats: { body: skin, head: botMaterial({ white: 0x111215, black: 0x0d0e11, roughBlack: 0.6, head: true, seam: 0.0 }) } });
  rig.holder.rotation.y = Math.PI * 0.9;
  st.scene.add(rig.holder);
  const hmd = new THREE.Mesh(new RoundedBoxGeometry(0.19, 0.1, 0.11, 4, 0.03), new THREE.MeshPhysicalMaterial({ color: 0x1a1c20, roughness: 0.35, clearcoat: 0.6 }));
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 8, 48), new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.8 }));
  strap.rotation.x = Math.PI / 2;
  const ctrl = new THREE.Mesh(new RoundedBoxGeometry(0.04, 0.12, 0.05, 3, 0.015), new THREE.MeshPhysicalMaterial({ color: 0x1d1f23, roughness: 0.4 }));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.006, 8, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 0.9, 1.6), toneMapped: false }));
  st.scene.add(hmd, strap, ctrl, ring);
  // the glow of a big screen behind and to the side (the robot's view), the rim it throws, a faint floor bounce
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.46), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 0.9, 1.1), toneMapped: false }));
  screen.position.set(-1.6, 1.4, -2.2);
  screen.lookAt(0, 1.2, 0);
  if (feed) screen.material.map = feed.texture;
  st.scene.add(screen);
  const rim = spot(0x9cc4ff, 45, { pos: [-1.6, 1.6, -2.0], target: [0, 1.3, 0], angle: 0.5, penumbra: 1, radius: 4, near: 0.5, far: 8, shadow: 2048 });
  const rim2 = spot(0xc8dcff, 20, { pos: [1.8, 2.2, -1.8], target: [0, 1.4, 0], angle: 0.4, penumbra: 1, shadow: 0 });
  st.scene.add(rim, rim.target, rim2, rim2.target);
  grade(st, { ao: { radius: 0.05, intensity: 1.0 }, bloom: { intensity: 0.5, threshold: 0.7 }, vignette: 0.7, contrast: 0.14, saturation: -0.1, exposure: 1.0 });
  const kBowl = V3(0.35, COUNTER.top, -0.2); // the kitchen's bowl: the reach is replayed in the robot's own frame
  return {
    st,
    pose(t, tl) {
      const pose = idlePose(t);
      pose.spine = [0.06, 0, 0];
      pose.head = [0.2, -0.1, 0];
      const r = reachPath(t, kBowl);
      pose.armR = { ...pose.armR, wrist: [0.2, 0.4, 0], fingers: 0.6, thumb: 0.5 };
      rig.setPose(pose);
      rig.holder.updateMatrixWorld(true);
      const tgt = r.target.clone().sub(V3(0.25, 0, 0.42)).applyAxisAngle(V3(0, 1, 0), Math.PI * 0.9 - Math.PI);
      reachIK(rig, 'R', tgt, null, { point: 'grip' });
      // headset on the head, controller in the hand
      const head = rig.bones.head;
      head.updateMatrixWorld(true);
      const hq = head.getWorldQuaternion(new THREE.Quaternion());
      hmd.position.copy(V3(0, 0.1, 0.09).applyQuaternion(hq).add(head.getWorldPosition(V3())));
      hmd.quaternion.copy(hq);
      strap.position.copy(V3(0, 0.1, -0.01).applyQuaternion(hq).add(head.getWorldPosition(V3())));
      strap.quaternion.copy(hq).multiply(new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), Math.PI / 2));
      const g = handPoint(rig, 'R', 'grip');
      ctrl.position.copy(g);
      ctrl.quaternion.copy(rig.bones.hand_R.getWorldQuaternion(new THREE.Quaternion()));
      ring.position.copy(g).add(V3(0, 0.07, 0));
      ring.quaternion.copy(ctrl.quaternion);
      // pulling back from the figure
      const k = ss(clamp(tl / 3.0));
      st.camera.position.set(lerp(1.1, 2.2, k), lerp(1.45, 1.6, k), lerp(1.4, 3.1, k));
      st.camera.lookAt(0, 1.25, 0);
      if (st.camera.fov !== 32) { st.camera.fov = 32; st.camera.updateProjectionMatrix(); }
    },
  };
}

export async function create({ renderer, scale, p, cues, dur }) {
  const K = await kitchenSet(renderer, scale);
  const O = await operatorSet(renderer, scale, K.rt);
  await K.st.ready();
  await O.st.ready();
  const tH = cues.human ?? dur * 0.4, tF = cues.far ?? dur * 0.7;
  // the movement's clock: the reach plays through the cut (the grasp lands just after it)
  const m0 = 2.3 - tH;
  const obj = {
    studio: K.st,
    update(t) {
      const tm = t + m0;
      if (t < tH) { obj.studio = K.st; K.pose(Math.max(0, tm)); } else {
        K.pose(tm);
        K.renderPov();
        obj.studio = O.st;
        O.pose(tm, t - tH);
      }
    },
    overlay(g, t) {
      const a = sstep(tF, tF + 0.6, t) * (1 - sstep(dur - 0.4, dur, t));
      caption(g, 150, 820, { en: 'TELEOPERATION', zh: '远程操作', a, color: [200, 222, 248], zhSize: 28, rule: 110 });
    },
    dispose() { (obj.studio === K.st ? O.st : K.st).dispose(); K.rt.dispose(); },
  };
  return obj;
}
