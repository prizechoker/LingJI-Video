// A hand places a stone (by default move 37, P10) on the game-2 board: the classic grip, a decelerating arc down to
// the point, the stone snapped flat, the fingers releasing, the hand withdrawing. Real-time or slowed (p.slow).
// p: move, cam (hero | low | top | reveal), slow, contact (s, or cue "contact"), push (dolly-in fraction), env,
//    label: { text, at, size }   cues: contact, label
import { Studio, THREE, spot } from '../engine2/core.js';
import { buildSleeve } from '../engine2/sleeve.js';
import { setPose, mixPose } from '../engine2/hand.js';
import { buildGoSet, placingHand, fingerPoint, GRIP, restPose } from './lib/goset.js';
import { key, ss, sstep, clamp, lerp, breathe, grade, title, V3 } from './lib/kit.js';

const RELEASE = {
  ...GRIP.pose, index: [-0.12, -0.1, -0.05], middle: [-0.62, -0.05, 0.02], spread: { ...GRIP.pose.spread, middle: -0.35 },
};

const CAMS = {
  // low, across the board from White's side; the hand comes in from behind the point
  hero: { pos: [-0.075, 0.095, -0.115], look: [0.108, 0.016, 0.004], fov: 19 },
  low: { pos: [-0.16, 0.05, -0.2], look: [0.1, 0.012, 0.0], fov: 16 },
  top: { pos: [0.11, 0.42, 0.06], look: [0.11, 0.0, 0.0], fov: 22 },
  // starts tight on the point, pulls back and up to show the hand and the engineer's side of the table
  reveal: { pos: [0.03, 0.07, -0.08], look: [0.108, 0.012, 0.0], fov: 18, to: { pos: [-0.25, 0.32, -0.42], look: [0.12, 0.02, 0.12], fov: 30 } },
};

export async function create({ renderer, scale, p, cues }) {
  const st = new Studio({ scale, renderer });
  await st.hdri('../assets/hdri/studio_small_09_2k.hdr', { intensity: p.env ?? 0.07, rotation: 1.2 });
  st.scene.background = new THREE.Color(0x040507);
  const set = await buildGoSet(st);
  st.scene.add(set.group);
  const N = p.move ?? 37;
  const [col, mi, mj] = set.moves[N - 1];
  set.show(N - 1);
  const stone = new THREE.Mesh(set.geo, set.mats[col === 'B' ? 'black' : 'white']);
  stone.castShadow = stone.receiveShadow = true;
  stone.matrixAutoUpdate = false;
  st.scene.add(stone);
  const rest = restPose({ i: mi, j: mj, n: N });
  const restQ = new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), rest.rot);

  // the hand in the grip; where its holder must be for the stone to sit on the point
  const h = await placingHand(st);
  h.holder.add(buildSleeve(st));
  st.scene.add(h.holder);
  const pitch0 = GRIP.pitch, yaw0 = GRIP.yaw;
  h.holder.position.set(0, 0, 0);
  h.holder.updateMatrixWorld(true);
  const nail = fingerPoint(h, 'f2_3', 1);
  const centre = nail.p.clone().addScaledVector(nail.dorsal, 0.0046);
  const contactPos = rest.p.clone().sub(centre);
  h.holder.position.copy(contactPos);
  h.holder.updateMatrixWorld(true);
  const holdQ = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), nail.dorsal);
  const bone = h.bones.f2_3;
  const offset = bone.matrixWorld.clone().invert().multiply(new THREE.Matrix4().compose(rest.p, holdQ, V3(1, 1, 1)));

  // light: warm overhead key, cool rim from AlphaGo's monitor behind the hand, faint fill
  const key1 = spot(0xffdcb8, p.key ?? 6, { pos: [-0.2, 1.2, 0.1], target: [0.1, 0, 0.03], angle: 0.38, penumbra: 1.0, radius: 8 });
  const fill = spot(0xffe6d0, p.fill ?? 0.9, { pos: [-0.5, 0.25, -0.5], target: [0.1, 0.04, 0.02], angle: 0.5, penumbra: 1.0, shadow: 0 });
  const rim = spot(0x9cc6ff, p.rim ?? 4, { pos: [0.3, 0.95, 0.6], target: [0.1, 0.1, 0.06], angle: 0.16, penumbra: 0.8, shadow: 1024, radius: 3 });
  st.scene.add(key1, key1.target, fill, fill.target, rim, rim.target);
  for (const [x, y, z, c, s] of [[0.9, 0.35, 1.6, 0xffc58a, 0.03], [-0.7, 0.45, 1.9, 0xffd0a0, 0.025], [0.38, 0.16, 0.62, 0x7fb5ff, 0.05]]) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(s, 16, 12), new THREE.MeshBasicMaterial({ color: c }));
    m.position.set(x, y, z);
    st.scene.add(m);
  }
  const cam = CAMS[p.cam || 'hero'];
  st.camera.near = p.near ?? 0.01;
  grade(st, {
    ao: { radius: 0.012, intensity: 2.0, falloff: 0.5 },
    dof: p.dof === false ? null : { distance: 0.2, range: p.range ?? 0.035, bokeh: p.bokeh ?? 4.5 },
    bloom: { intensity: 0.22, threshold: 1.1 }, vignette: 0.62, contrast: 0.14, saturation: -0.02, exposure: p.exposure ?? 0.9,
  });
  if (st.dof) st.dof.target = rest.p.clone();

  const tc = cues.contact ?? p.contact ?? 1.6;
  const slow = p.slow ?? 1;
  const APPROACH = 0.85, RETRACT = 0.8; // real seconds
  const hover = V3(0.012, 0.075, 0.11); // where the approach starts, from the contact position (up, toward Black)
  const away = V3(-0.01, 0.06, 0.12);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pp = V3(), sc = V3();
  const qa = new THREE.Quaternion(), pa = V3();

  return {
    studio: st,
    update(t, env) {
      const u = (t - tc) / slow; // real seconds from the moment of contact
      // the hand's path: an arc that decelerates into the point, then a lift away
      if (u < 0) {
        const s = clamp((u + APPROACH) / APPROACH);
        const e = 1 - (1 - s) ** 2.4;
        h.holder.position.copy(contactPos).addScaledVector(hover, 1 - e).add(V3(0, 0.012 * Math.sin(Math.PI * e) * (1 - e), 0));
        h.holder.rotation.set(pitch0 - 0.12 * (1 - e), yaw0 + 0.05 * (1 - e), 0, 'YXZ');
      } else {
        const r = ss(clamp(u / RETRACT));
        h.holder.position.copy(contactPos).addScaledVector(away, r);
        h.holder.rotation.set(pitch0 - 0.18 * r, yaw0 - 0.04 * r, 0, 'YXZ');
      }
      setPose(h, mixPose(GRIP.pose, RELEASE, sstep(0.0, 0.16, u)));
      h.holder.updateMatrixWorld(true);
      // the stone: carried on the nail, laid flat in the last few hundredths of a second, then a tiny settle
      m4.multiplyMatrices(bone.matrixWorld, offset).decompose(pa, qa, sc);
      const lay = sstep(-0.05, 0, u);
      pp.copy(pa).lerp(rest.p, lay);
      q.copy(qa).slerp(restQ, lay);
      if (u > 0) {
        const w = Math.exp(-u / 0.03) * Math.sin(u * 160);
        q.multiply(new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0.4).normalize(), 0.025 * w));
        pp.y += 0.0004 * Math.abs(w);
      }
      stone.matrix.compose(pp, q, V3(1, 1, 1));
      stone.matrixWorldNeedsUpdate = true;
      // camera: preset, slow push, a breath of handheld
      const k = env.shot ? clamp(t / (env.shot.end - env.shot.start)) : 0;
      let pos = cam.pos, look = cam.look, fov = cam.fov;
      if (cam.to) {
        const r = ss(clamp((t - (cues.reveal ?? 0)) / (p.revealDur ?? 4)));
        pos = cam.pos.map((v, i) => lerp(v, cam.to.pos[i], r));
        look = cam.look.map((v, i) => lerp(v, cam.to.look[i], r));
        fov = lerp(cam.fov, cam.to.fov, r);
      }
      const push = (p.push ?? 0.12) * ss(k);
      const b = breathe(t, 0.0012, 3);
      st.camera.position.set(...pos.map((v, i) => lerp(v, look[i], push) + b[i]));
      st.camera.lookAt(...look);
      if (st.camera.fov !== fov) {
        st.camera.fov = fov;
        st.camera.updateProjectionMatrix();
      }
    },
    overlay(g, t) {
      const L = p.label;
      if (!L) return;
      const t0 = cues.label ?? L.at ?? tc;
      const a = sstep(t0, t0 + 0.5, t) * (1 - sstep(t0 + (L.hold ?? 2.6), t0 + (L.hold ?? 2.6) + 0.6, t));
      title(g, L.text, L.x ?? 960, L.y ?? 300, { size: L.size ?? 96, a, spacing: 18, weight: 700 });
      if (L.sub) title(g, L.sub, L.x ?? 960, (L.y ?? 300) + 78, { size: 22, a: a * 0.85, spacing: 10, weight: 500, color: [200, 206, 214] });
    },
  };
}
