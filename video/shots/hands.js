// F42: what a human hand does without thinking, warm and slowed down.
// p.mode: 'catch' — a mug tips off the edge of the counter; a hand sweeps in and closes round it in mid-air (cue "catch").
//         'wash'  — a hand holds a rice bowl by its rim under the running tap, turning it (rinse).
//         'cap'   — fingers grip a bottle cap and twist it loose (cue "twist").
import { Studio, THREE, spot } from '../engine2/core.js';
import { loadHand, setPose, mixPose } from '../engine2/hand.js';
import { buildSleeve } from '../engine2/sleeve.js';
import { buildKitchen, COUNTER } from '../engine2/kitchen.js';
import { buildBowl, porcelainMaterial, surfaceDroplets, waterMaterial } from '../engine2/dishes.js';
import { wrap, sdf } from './lib/grasp.js';
import { rimGrip } from './lib/pinch.js';
import { ss, sstep, clamp, lerp, breathe, grade, V3, rng } from './lib/kit.js';

const G = new THREE.Vector3(0, -9.81, 0);
const OPEN = { index: [-0.05, 0.05, 0.05], middle: [-0.05, 0.05, 0.05], ring: [0, 0.08, 0.05], little: [0.05, 0.1, 0.05], thumb: [0.1, 0.05, 0.05], spread: { index: 0.12, middle: 0.0, ring: -0.1, little: -0.22 }, thumbRoll: 0.5 };

function mugGeometry() {
  const R = 0.041, H = 0.096, T = 0.0035;
  const prof = [[0, 0.002], [R - 0.006, 0], [R - 0.002, 0.002], [R, 0.008], [R, H - 0.002], [R - 0.0012, H], [R - T + 0.0012, H], [R - T, H - 0.002], [R - T, 0.012], [R - T - 0.004, 0.0075], [0, 0.0075]];
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 96);
  return { g, R, H };
}

function hamper(st) {
  // warm, homely light shared by the setups: a soft key from the window side, a warm fill, the HDRI
  const key = spot(0xffe2c4, 4.5, { pos: [-0.9, 1.9, 0.6], target: [0, COUNTER.top, -0.1], angle: 0.45, penumbra: 1, radius: 6, near: 0.5, far: 5 });
  const fill = spot(0xffc79a, 1.6, { pos: [0.9, 1.3, 1.0], target: [0, COUNTER.top, 0], angle: 0.6, penumbra: 1, shadow: 0 });
  st.scene.add(key, key.target, fill, fill.target);
  return { key, fill };
}

export async function create({ renderer, scale, p, cues, dur }) {
  const st = new Studio({ scale, renderer });
  await st.hdri('../assets/hdri/blinds_2k.hdr', { intensity: p.env ?? 0.4, rotation: p.rot ?? 2.1, background: { blur: 0.09, intensity: p.bg ?? 0.45 } });
  const kitchen = buildKitchen(st, { width: 2.4 });
  kitchen.position.x = -0.55;
  st.scene.add(kitchen);
  const top = COUNTER.top;
  const mode = p.mode || 'catch';
  hamper(st);
  st.camera.near = 0.02;
  grade(st, { ao: { radius: 0.02, intensity: 1.6, falloff: 0.5 }, dof: { distance: 0.4, range: p.range ?? 0.1, bokeh: 3.5 }, bloom: { intensity: 0.35, threshold: 0.9 }, vignette: 0.62, contrast: 0.09, saturation: -0.08, exposure: p.exposure ?? 1.0 });

  if (mode === 'catch') return catchShot(st, { p, cues, dur, top });
  if (mode === 'wash') return washShot(st, { p, cues, dur, top, kitchen });
  return capShot(st, { p, cues, dur, top });
}

// ---------------------------------------------------------------- catch
async function catchShot(st, { p, cues, dur, top }) {
  const { g, R, H } = mugGeometry();
  const glaze = new THREE.MeshPhysicalMaterial({ color: 0x2c5a70, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 });
  const mug = new THREE.Group();
  const body = new THREE.Mesh(g, glaze);
  body.castShadow = body.receiveShadow = true;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.0065, 16, 48, Math.PI * 1.1), glaze);
  handle.rotation.z = Math.PI / 2 + 0.15;
  handle.position.set(-R - 0.004, H * 0.52, 0);
  handle.castShadow = true;
  mug.add(body);
  st.scene.add(mug);
  // the fall: knocked over the front edge (+z), tipping toward it
  const p0 = V3(0.05, top, -0.02), v0 = V3(0.0, 0.0, 0.32), w0 = 6.5;
  const COM = V3(0, H * 0.45, 0);
  const at = (u) => {
    const q = new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), w0 * Math.max(0, u) + 0.25 * Math.min(1, Math.max(0, u) / 0.04) * 0);
    const com = p0.clone().add(COM).addScaledVector(v0, Math.max(0, u)).addScaledVector(G, 0.5 * Math.max(0, u) ** 2);
    return { q, pos: com.clone().sub(COM.clone().applyQuaternion(q)) };
  };
  const UC = p.uc ?? 0.17;
  const atC = at(UC);
  const Mc = new THREE.Matrix4().compose(atC.pos, atC.q, V3(1, 1, 1));
  // the hand at the catch: palm against the side facing +z (local), fingers round toward +x, thumb up the axis
  const h = await loadHand(st);
  h.holder.add(buildSleeve(st, { suit: 0x6b5a4a, dir: new THREE.Vector3(0.02, 0.12, 1) }));
  st.scene.add(h.holder);
  setPose(h, OPEN);
  h.holder.position.set(0, 0, 0);
  h.holder.quaternion.identity();
  h.holder.updateMatrixWorld(true);
  const palmLocal = h.bones.f3_1.getWorldPosition(V3()).multiplyScalar(0.55).add(V3(0, -0.012, 0));
  // forearm from the person in front (+z), a little up and to the right; palm turned up under the falling mug
  const Zm = V3(0.18, 0.3, 1).normalize();
  const up = V3(0, 1, 0);
  const Ym = up.clone().addScaledVector(Zm, -up.dot(Zm)).normalize().negate();
  const Xm = V3().crossVectors(Ym, Zm);
  const qHand = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(Xm, Ym, Zm));
  const comC = COM.clone().applyMatrix4(Mc);
  const palmTarget = comC.clone().add(V3(0.0, -(R + 0.016), 0.012));
  const posC = palmTarget.clone().sub(palmLocal.clone().applyQuaternion(qHand));
  h.holder.quaternion.copy(qHand);
  h.holder.position.copy(posC);
  h.holder.updateMatrixWorld(true);
  const axis = V3(0, 1, 0).applyQuaternion(atC.q);
  const closed = wrap(h, sdf.cylinder(V3(0, 0, 0).applyMatrix4(Mc), axis, R, H), { base: OPEN, thick: 0.0085 });
  // the mug's place relative to the hand after the catch
  const rel = new THREE.Matrix4().copy(h.holder.matrixWorld).invert().multiply(Mc);
  const vC = v0.clone().addScaledVector(G, UC);

  const tC = cues.catch ?? dur * 0.45;
  const S = p.slow ?? 6;
  const m4 = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpP = V3(), tmpS = V3();
  return {
    studio: st,
    update(t) {
      const u = UC + (t - tC) / S; // real seconds of the fall
      // the hand: sweeping in along a curve that matches the mug's fall at the catch, then braking
      let hp, close;
      if (u < UC) {
        const k = clamp(1 - (UC - u) / 0.22);
        const e = 1 - (1 - k) ** 2;
        hp = posC.clone().add(V3(0.04, -0.06, 0.26).multiplyScalar(1 - e)).addScaledVector(vC, -(UC - u) * 0.5 * (1 - e) * 0);
        close = sstep(UC - 0.03, UC, u);
      } else {
        const v = u - UC, T = 0.085;
        const s = v < T ? v - (v * v) / (2 * T) : T / 2; // decelerating to rest
        hp = posC.clone().addScaledVector(vC, s);
        close = 1;
      }
      setPose(h, mixPose(OPEN, closed, close));
      h.holder.position.copy(hp);
      h.holder.quaternion.copy(qHand);
      h.holder.updateMatrixWorld(true);
      if (u <= UC) {
        const s = at(u);
        mug.position.copy(s.pos);
        mug.quaternion.copy(s.q);
      } else {
        m4.multiplyMatrices(h.holder.matrixWorld, rel).decompose(tmpP, tmpQ, tmpS);
        mug.position.copy(tmpP);
        mug.quaternion.copy(tmpQ);
      }
      // camera: low, beside the counter's edge, on the falling mug
      const k = ss(clamp(t / dur));
      const look = V3(0.04, top - 0.1 - 0.04 * sstep(tC - 0.2, tC + 0.8, t), 0.09);
      const b = breathe(t, 0.0012, 2);
      st.camera.position.set(-0.52 + 0.05 * k + b[0], top - 0.05 + b[1], 0.3 - 0.04 * k + b[2]);
      st.camera.lookAt(look);
      if (st.camera.fov !== 30) { st.camera.fov = 30; st.camera.updateProjectionMatrix(); }
      if (st.dof) st.dof.target = mug.position.clone().add(V3(0, 0.04, 0));
    },
  };
}

// ---------------------------------------------------------------- wash
async function washShot(st, { p, cues, dur, top, kitchen }) {
  const water = waterMaterial();
  const spout = kitchen.userData.spout.clone().add(kitchen.position);
  const base = V3(spout.x + 0.012, top - 0.075, spout.z + 0.018); // the foot, down in the sink under the tap
  const camPos = V3(spout.x - 0.3, top + 0.2, spout.z + 0.42);
  const grip = await rimGrip(st, { base, camPos, human: true, want: V3(0.25, -0.45, -0.85), gap: 0.0045 });
  const { h, pose, rimLocal, quat, gripOffset } = grip;
  h.holder.add(buildSleeve(st, { suit: 0x6b5a4a }));
  st.scene.add(h.holder);
  setPose(h, pose);
  const bowl = buildBowl(porcelainMaterial());
  st.scene.add(bowl);
  bowl.updateMatrixWorld(true);
  bowl.add(surfaceDroplets(bowl, { n: 80, mat: water }));
  const grip0 = base.clone().add(rimLocal);
  // the tap running
  const bottom = top - COUNTER.t - COUNTER.sink.depth;
  const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0052, spout.y - bottom, 24, 1, true), water);
  stream.position.set(spout.x, (spout.y + bottom) / 2, spout.z);
  st.scene.add(stream);
  const R = rng(5);
  const splash = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), water, 70);
  splash.frustumCulled = false;
  st.scene.add(splash);
  const drops = Array.from({ length: 70 }, () => ({ ph: R(), a: R() * Math.PI * 2, sp: 0.2 + R() * 0.5, up: 0.4 + R() * 0.6, r: 0.0006 + R() ** 2 * 0.0016 }));
  const qr = new THREE.Quaternion(), m4 = new THREE.Matrix4(), sc = V3();
  return {
    studio: st,
    update(t) {
      // a slow turn of the bowl in the stream, the wrist rolling
      const ang = 0.5 * Math.sin(t * 0.9) + 0.25 * t / dur;
      qr.setFromAxisAngle(V3(0, 1, 0), 0.25 * Math.sin(t * 0.9)).multiply(new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), 0.12 * Math.sin(t * 0.7 + 1)));
      const gp = grip0.clone().add(V3(0.006 * Math.sin(t * 1.3), 0.004 * Math.sin(t * 0.9), 0));
      h.holder.quaternion.copy(qr).multiply(quat);
      h.holder.position.copy(gp).sub(gripOffset.clone().applyQuaternion(qr));
      bowl.quaternion.copy(qr);
      bowl.position.copy(gp).sub(rimLocal.clone().applyQuaternion(qr));
      // splashes off the bowl where the stream lands (looping, deterministic)
      const hit = V3(spout.x, bowl.position.y + 0.03, spout.z);
      drops.forEach((d, i) => {
        const u = ((t * 1.7 + d.ph) % 1) * 0.12;
        const v = V3(Math.cos(d.a) * d.sp, d.up, Math.sin(d.a) * d.sp);
        const pos = hit.clone().addScaledVector(v, u).addScaledVector(G, 0.5 * u * u);
        m4.compose(pos, qr.clone().identity(), sc.setScalar(d.r));
        splash.setMatrixAt(i, m4);
      });
      splash.instanceMatrix.needsUpdate = true;
      const k = ss(clamp(t / dur));
      const b = breathe(t, 0.0012, 5);
      st.camera.position.set(camPos.x + 0.05 * k + b[0], camPos.y + b[1], camPos.z - 0.06 * k + b[2]);
      st.camera.lookAt(base.x, base.y + 0.07, base.z);
      if (st.camera.fov !== 28) { st.camera.fov = 28; st.camera.updateProjectionMatrix(); }
      if (st.dof) st.dof.target = gp;
    },
  };
}

// ---------------------------------------------------------------- cap
async function capShot(st, { p, cues, dur, top }) {
  // a glass jar of honey on the counter, a gold metal lid; the hand palms the lid and twists it loose
  const bx = 0.05, bz = -0.22, R = 0.041;
  const prof = [[0, 0], [R - 0.004, 0], [R, 0.004], [R, 0.085], [R - 0.004, 0.092], [R - 0.006, 0.098]];
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.06, transparent: true, opacity: 0.3, clearcoat: 1, clearcoatRoughness: 0.03, specularIntensity: 1 });
  const jar = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 96), glass);
  jar.position.set(bx, top, bz);
  st.scene.add(jar);
  const honey = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.003, R - 0.003, 0.07, 64), new THREE.MeshPhysicalMaterial({ color: 0xd88a1e, roughness: 0.15, transmission: 0.3, thickness: 0.05, clearcoat: 1 }));
  honey.position.set(bx, top + 0.037, bz);
  st.scene.add(honey);
  const lidG = new THREE.CylinderGeometry(R + 0.0015, R + 0.0015, 0.018, 96, 1);
  const lp = lidG.attributes.position;
  for (let i = 0; i < lp.count; i++) {
    const x = lp.getX(i), z = lp.getZ(i), a = Math.atan2(z, x), r = Math.hypot(x, z);
    if (r > R * 0.9) { const k = 1 + 0.012 * Math.max(0, Math.cos(a * 60)); lp.setX(i, x * k); lp.setZ(i, z * k); }
  }
  lidG.computeVertexNormals();
  const lid = new THREE.Mesh(lidG, new THREE.MeshPhysicalMaterial({ color: 0xd4a94e, metalness: 1, roughness: 0.28, clearcoat: 0.6 }));
  lid.castShadow = true;
  st.scene.add(lid);
  const lidY = top + 0.098 + 0.009;
  // the hand palm-down on the lid, fingers spread round its edge
  const h = await loadHand(st);
  h.holder.add(buildSleeve(st, { suit: 0x6b5a4a, dir: new THREE.Vector3(0.02, 0.35, 1) }));
  st.scene.add(h.holder);
  const base = { index: [0.25, 0.2, 0.1], middle: [0.25, 0.2, 0.1], ring: [0.3, 0.2, 0.1], little: [0.35, 0.2, 0.1], thumb: [0.4, 0.2, 0.1], spread: { index: 0.16, middle: 0.0, ring: -0.14, little: -0.3 }, thumbRoll: 0.7 };
  setPose(h, base);
  h.holder.position.set(0, 0, 0);
  h.holder.rotation.set(-0.12, 0.35, 0, 'YXZ');
  h.holder.updateMatrixWorld(true);
  const palm = h.bones.f3_1.getWorldPosition(V3()).multiplyScalar(0.62).add(V3(0, -0.018, 0));
  const hold = V3(bx, lidY + 0.009, bz).sub(palm);
  h.holder.position.copy(hold);
  h.holder.updateMatrixWorld(true);
  const grip = wrap(h, sdf.union(sdf.cylinder(V3(bx, lidY - 0.009, bz), V3(0, 1, 0), R + 0.002, 0.018), sdf.cylinder(V3(bx, top, bz), V3(0, 1, 0), R, 0.1)), { base, thick: 0.0082 });
  const tTw = cues.twist ?? 0.5;
  const rot0 = h.holder.quaternion.clone();
  return {
    studio: st,
    update(t) {
      // twist ~100 degrees, regrip, twist again: the lid comes loose and lifts a few millimetres
      const u = t - tTw;
      const cycle = 1.0;
      const n = Math.max(0, Math.floor(u / cycle)), f = u > 0 ? (u - n * cycle) / cycle : 0;
      const turn = ss(clamp(f / 0.55)), back = ss(clamp((f - 0.62) / 0.33));
      const on = u < 0 ? sstep(-0.35, 0, u) : n >= 2 ? 1 : 1 - sstep(0.55, 0.62, f) * (1 - sstep(0.93, 1.0, f));
      const done = Math.min(n, 2) * 1.6 + (n < 2 && u > 0 ? turn * 1.6 : 0);
      const handTurn = u <= 0 ? 0 : n < 2 ? -1.6 * (turn - back) : 0;
      const lift = n >= 2 ? 0.012 * ss(clamp((u - 2 * cycle) / 0.5)) : 0;
      setPose(h, mixPose(base, grip, on));
      const q = new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), handTurn);
      const c = V3(bx, 0, bz);
      h.holder.position.copy(hold).sub(c).applyQuaternion(q).add(c).add(V3(0, 0.003 * (1 - on) + lift, 0));
      h.holder.quaternion.copy(q).multiply(rot0);
      lid.position.set(bx, lidY + lift + 0.0004 * done, bz);
      lid.rotation.y = -done;
      const k = ss(clamp(t / dur));
      const b = breathe(t, 0.001, 7);
      st.camera.position.set(bx - 0.26 + 0.03 * k + b[0], lidY + 0.02 + b[1], bz + 0.24 - 0.03 * k + b[2]);
      st.camera.lookAt(bx, lidY - 0.015, bz);
      if (st.camera.fov !== 30) { st.camera.fov = 30; st.camera.updateProjectionMatrix(); }
      if (st.dof) st.dof.target = V3(bx, lidY, bz);
    },
  };
}
