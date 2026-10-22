// The robot drops a wet rice bowl (H1, B18): its white hand holds the bowl by the rim over the counter; the bowl
// slips (cue "slip"), pivots off the fingertips, falls in slow motion, and breaks on the stone counter (it lands at
// cue "impact" if given — the slow-motion factor is then fitted), shards and water flying.
// p: slow (slow-motion factor, default 7), cam ('side' | 'low' | 'high'), seed
import { Studio, THREE, spot } from '../engine2/core.js';
import { botMaterial } from '../engine2/bot.js';
import { loadBotHand, solvePinch, padPoint, FOREARM, setPose } from '../engine2/bothand.js';
import { buildKitchen, COUNTER } from '../engine2/kitchen.js';
import { bowlGeometry, porcelainMaterial, surfaceDroplets, waterMaterial } from '../engine2/dishes.js';
import { shardGeometry, simulateShards, poseShards } from './lib/shatter.js';
import { ss, sstep, clamp, lerp, breathe, grade, V3, rng } from './lib/kit.js';

const G = new THREE.Vector3(0, -9.81, 0);

export async function create({ renderer, scale, p, cues, dur }) {
  const st = new Studio({ scale, renderer });
  await st.hdri('../assets/hdri/blinds_2k.hdr', { intensity: p.env ?? 0.42, rotation: p.rot ?? 2.1, background: { blur: 0.08, intensity: p.bg ?? 0.5 } });
  const kitchen = buildKitchen(st, { width: 2.4 });
  kitchen.position.x = -0.55; // the sink off to the left; the bowl breaks on the open counter
  st.scene.add(kitchen);
  const top = COUNTER.top;
  const water = waterMaterial();

  // ---- the hand in a rim pinch, the bowl hanging from it upright (as in lab/sf_dish.js)
  const h = await loadBotHand(st, { material: botMaterial({ white: 0xdfe2e6, envDiffuse: 0.9, seam: 0.0005, dark: 0.7 }) });
  st.scene.add(h.holder);
  const pinch = solvePinch(h, 0.0045);
  const basis = (x, y) => new THREE.Matrix4().makeBasis(x, y, V3().crossVectors(x, y));
  const tP = padPoint(h, 1), fP = padPoint(h, 2).lerp(padPoint(h, 3), 0.5);
  const R0 = tP.clone().lerp(fP, 0.5);
  const nW = fP.clone().sub(tP).normalize();
  const wristP = h.bones.hand.getWorldPosition(V3());
  const uH = wristP.clone().sub(R0);
  uH.addScaledVector(nW, -uH.dot(nW)).normalize();
  const handF = basis(nW, uH).transpose();
  const fRest = FOREARM.clone().negate();
  const g = bowlGeometry();
  const base = V3(0.12, top + 0.2, -0.28); // the bowl's foot while held
  const want = V3(-0.3, -0.55, -0.75).normalize(); // forearm direction: from the robot (behind, to the right), above
  const camPos = V3(-0.42, top + 0.1, 0.12);
  const toCam = camPos.clone().sub(base).normalize();
  let best = null;
  const rad = THREE.MathUtils.degToRad;
  for (let phi = 0; phi < 360; phi += 4) {
    for (let tilt = 0; tilt <= 50; tilt += 5) {
      const nb = V3(Math.cos(rad(phi)), 0, Math.sin(rad(phi)));
      const tang = V3().crossVectors(V3(0, 1, 0), nb);
      const q = new THREE.Quaternion().setFromAxisAngle(tang, rad(tilt));
      const M = basis(nb.clone().applyQuaternion(q), V3(0, 1, 0).applyQuaternion(q)).multiply(handF);
      const fore = fRest.clone().transformDirection(M), palm = V3(0, -1, 0).transformDirection(M);
      const score = fore.dot(want) - 0.3 * palm.dot(toCam) - 0.002 * tilt;
      if (!best || score > best.score) best = { score, M, nb };
    }
  }
  const rimP = base.clone().add(V3(0, g.userData.rimY, 0)).addScaledVector(best.nb, g.userData.rimR);
  h.holder.quaternion.setFromRotationMatrix(best.M);
  h.holder.position.copy(rimP).sub(R0.clone().applyMatrix4(best.M));
  h.holder.updateMatrixWorld(true);
  const holdPose = pinch.pose;

  // ---- the bowl's fall: pivot off the fingertips about the rim tangent, then free flight (real seconds u)
  const mat = porcelainMaterial();
  const bowl = new THREE.Mesh(g, mat);
  bowl.castShadow = bowl.receiveShadow = true;
  st.scene.add(bowl);
  const tang = V3().crossVectors(V3(0, 1, 0), best.nb).normalize(); // positive rotation swings the far side down
  const com0 = base.clone().add(V3(0, 0.03, 0)); // centre of mass, ~3 cm above the foot
  const ALPHA = 55, PIV = 0.09; // angular acceleration while pivoting, and how long it pivots (s)
  const spinY = 2.2;
  const state = (u) => {
    // returns { q, com } of the bowl at real time u >= 0 after the slip
    if (u <= PIV) {
      const th = -0.5 * ALPHA * u * u;
      const q = new THREE.Quaternion().setFromAxisAngle(tang, th);
      const com = com0.clone().sub(rimP).applyQuaternion(q).add(rimP).add(V3(0, -0.4 * u * u, 0));
      return { q, com };
    }
    const w0 = -ALPHA * PIV;
    const a = state(PIV);
    const r = a.com.clone().sub(rimP);
    const v0 = V3().crossVectors(tang.clone().multiplyScalar(w0), r).add(V3(0, -0.8 * PIV, 0));
    const du = u - PIV;
    const com = a.com.clone().addScaledVector(v0, du).addScaledVector(G, 0.5 * du * du);
    const q = new THREE.Quaternion().setFromAxisAngle(tang, w0 * du).multiply(a.q);
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), spinY * du));
    return { q, com, vel: v0.clone().addScaledVector(G, du) };
  };
  const bowlMatrix = (s) => {
    // the mesh's origin is the foot: place it so its centre of mass (0, 0.03, 0) lands at s.com
    const off = V3(0, 0.03, 0).applyQuaternion(s.q);
    return new THREE.Matrix4().compose(s.com.clone().sub(off), s.q, V3(1, 1, 1));
  };
  // when does the lowest point of the bowl reach the counter?
  const ring = [];
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * Math.PI * 2;
    ring.push(V3(Math.cos(a) * g.userData.rimR, g.userData.rimY, Math.sin(a) * g.userData.rimR), V3(Math.cos(a) * 0.0236, 0, Math.sin(a) * 0.0236), V3(Math.cos(a) * 0.05, 0.022, Math.sin(a) * 0.05));
  }
  let uHit = 0, hitP = null;
  for (let u = 0; u < 1.5; u += 0.0005) {
    const m = bowlMatrix(state(u));
    let low = Infinity, lp = null;
    for (const v of ring) {
      const w = v.clone().applyMatrix4(m);
      if (w.y < low) { low = w.y; lp = w; }
    }
    if (low <= top) { uHit = u; hitP = lp; break; }
  }
  const atHit = state(uHit);
  // shards, in the bowl's local frame, then flown from the impact
  const localImpact = hitP.clone().applyMatrix4(bowlMatrix(atHit).invert());
  const shards = shardGeometry(g, { n: p.shards ?? 15, impact: localImpact, seed: p.seed ?? 7, rough: 0.007, focus: 0.45 });
  const bodyPos = bowlMatrix(atHit);
  const bp = V3(), bq = new THREE.Quaternion(), bs = V3();
  bodyPos.decompose(bp, bq, bs);
  const sim = simulateShards(shards, { pos: bp, quat: bq, vel: atHit.vel }, hitP, { floor: () => top, T: 1.6, seed: (p.seed ?? 7) + 4 });
  const shardMat = mat.clone();
  shardMat.side = THREE.DoubleSide;
  const shardMeshes = shards.map((s) => {
    const m = new THREE.Mesh(s.geo, shardMat);
    m.castShadow = m.receiveShadow = true;
    m.visible = false;
    st.scene.add(m);
    return m;
  });
  // wet surface droplets ride on the intact bowl
  bowl.updateMatrixWorld(true);
  const onBowl = surfaceDroplets(bowl, { n: 70, mat: water });
  bowl.add(onBowl);

  // ---- loose water: drops leaving the rim during the fall, and the splash at the impact (ballistic, instanced)
  const R = rng(p.seed ?? 7);
  const drops = [];
  for (let k = 0; k < 60; k++) {
    const u0 = PIV * 0.5 + R() * Math.max(0.01, uHit - PIV * 0.5);
    const s0 = state(u0);
    const a = R() * Math.PI * 2;
    const lip = V3(Math.cos(a) * g.userData.rimR, g.userData.rimY, Math.sin(a) * g.userData.rimR).applyMatrix4(bowlMatrix(s0));
    const v = (s0.vel || V3(0, -0.2, 0)).clone().add(V3((R() - 0.5) * 0.4, R() * 0.2, (R() - 0.5) * 0.4));
    drops.push({ u0, p0: lip, v, r: 0.0007 + R() ** 2 * 0.0022 });
  }
  for (let k = 0; k < 140; k++) {
    const a = R() * Math.PI * 2, sp = 0.4 + R() * 1.6;
    drops.push({ u0: uHit, p0: hitP.clone().add(V3((R() - 0.5) * 0.06, 0.004, (R() - 0.5) * 0.06)), v: V3(Math.cos(a) * sp, 0.3 + R() * 1.4, Math.sin(a) * sp), r: 0.0005 + R() ** 2.5 * 0.0025 });
  }
  const dropMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), water, drops.length);
  dropMesh.frustumCulled = false;
  st.scene.add(dropMesh);
  // fine porcelain chips at the impact
  const chips = [];
  for (let k = 0; k < 70; k++) {
    const a = R() * Math.PI * 2, sp = 0.3 + R() * 1.2;
    chips.push({ v: V3(Math.cos(a) * sp, 0.2 + R() * 1.0, Math.sin(a) * sp), r: 0.0008 + R() * 0.0018, s: R() * 10 });
  }
  const chipMesh = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(1, 0), shardMat, chips.length);
  chipMesh.castShadow = true;
  chipMesh.frustumCulled = false;
  st.scene.add(chipMesh);

  // ---- light: warm sun through the blinds behind, a soft cool key from the camera side
  const sun = new THREE.DirectionalLight(0xffc48a, p.sun ?? 4.5);
  sun.position.set(0.6, 2.4, -2.6);
  sun.target.position.set(0.1, top, -0.25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -0.7, right: 0.7, top: 0.7, bottom: -0.7, near: 1, far: 6 });
  sun.shadow.radius = 3;
  sun.shadow.bias = -0.0002;
  st.scene.add(sun, sun.target);
  const key = spot(0xeef2f8, p.key ?? 3.2, { pos: [-0.9, 1.6, 0.9], target: [0.1, top + 0.1, -0.25], angle: 0.4, penumbra: 1, radius: 6, near: 0.5, far: 5 });
  st.scene.add(key, key.target);

  st.camera.near = 0.02;
  grade(st, { ao: { radius: 0.02, intensity: 1.6, falloff: 0.5 }, dof: { distance: 0.5, range: p.range ?? 0.16, bokeh: 3.5 }, bloom: { intensity: 0.4, threshold: 0.9 }, vignette: 0.6, contrast: 0.09, saturation: -0.12, exposure: p.exposure ?? 1.0 });

  const tSlip = cues.slip ?? 0.5;
  const slow = cues.impact != null ? Math.max(2, (cues.impact - tSlip) / uHit) : p.slow ?? 7;
  const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), pp = V3(), sc = V3();
  const camA = { pos: V3(-0.34, top + 0.1, 0.26), look: V3(0.1, top + 0.2, -0.28) };
  const camB = { pos: V3(-0.3, top + 0.05, 0.2), look: hitP.clone().add(V3(0, 0.045, 0)) };
  const focusA = rimP.clone(), focusB = hitP.clone();

  return {
    studio: st,
    update(t) {
      const u = (t - tSlip) / slow; // real seconds since the slip
      // the hand: a slight tremor while holding; the fingers spring open a little as the rim leaves them
      const open = sstep(0.0, 0.08, u);
      const pose = { ...holdPose };
      for (const f of ['index', 'middle', 'thumb']) pose[f] = holdPose[f].map((v) => v - 0.18 * open);
      setPose(h, pose);
      h.holder.position.copy(rimP).sub(R0.clone().applyMatrix4(best.M)).add(V3(0, 0.002 * Math.sin(t * 7) * (1 - open), 0));
      // the bowl, then the shards
      if (u < uHit) {
        const s = u <= 0 ? { q: new THREE.Quaternion(), com: com0.clone() } : state(u);
        bowlMatrix(s).decompose(bowl.position, bowl.quaternion, bowl.scale);
        bowl.visible = true;
        for (const m of shardMeshes) m.visible = false;
      } else {
        bowl.visible = false;
        poseShards(shardMeshes, sim, u - uHit);
        for (const m of shardMeshes) m.visible = true;
      }
      // loose water and chips
      let k = 0;
      for (const d of drops) {
        const du = u - d.u0;
        const pos = d.p0.clone().addScaledVector(d.v, Math.max(0, du)).addScaledVector(G, 0.5 * Math.max(0, du) ** 2);
        const vis = du > 0 && pos.y > top - 0.001;
        const vel = d.v.clone().addScaledVector(G, Math.max(0, du));
        qq.setFromUnitVectors(V3(0, 0, 1), vel.clone().normalize());
        const stretch = 1 + Math.min(1.5, vel.length() * 0.6);
        m4.compose(pos, qq, sc.set(d.r, d.r, d.r * stretch).multiplyScalar(vis ? 1 : 0));
        dropMesh.setMatrixAt(k++, m4);
      }
      dropMesh.instanceMatrix.needsUpdate = true;
      chips.forEach((c, i) => {
        const du = u - uHit;
        const pos = hitP.clone().addScaledVector(c.v, Math.max(0, du)).addScaledVector(G, 0.5 * Math.max(0, du) ** 2);
        pos.y = Math.max(top + c.r * 0.6, pos.y);
        qq.setFromEuler(new THREE.Euler(c.s + du * 30, c.s * 2 + du * 20, 0));
        m4.compose(pos, qq, sc.setScalar(du > 0 ? c.r : 0));
        chipMesh.setMatrixAt(i, m4);
      });
      chipMesh.instanceMatrix.needsUpdate = true;
      // the camera: from the hand and the bowl down to the counter, following the fall
      const f = ss(clamp(u / Math.max(0.01, uHit)));
      const pos = camA.pos.clone().lerp(camB.pos, f);
      const look = camA.look.clone().lerp(camB.look, f);
      const b = breathe(t, 0.0015, 9);
      st.camera.position.set(pos.x + b[0], pos.y + b[1], pos.z + b[2]);
      st.camera.lookAt(look);
      if (st.camera.fov !== 30) { st.camera.fov = 30; st.camera.updateProjectionMatrix(); }
      if (st.dof) st.dof.target = focusA.clone().lerp(focusB, f);
    },
  };
}
