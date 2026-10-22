// F42: what a human hand does without thinking, warm and slowed down.
// p.mode: 'catch' — a mug tips off the edge of the counter; a hand sweeps in and closes round it in mid-air (cue "catch").
//         'wash'  — a hand holds a rice bowl by its rim under the running tap, turning it (rinse).
//         'cap'   — fingers grip a bottle cap and twist it loose (cue "twist").
import { Studio, THREE, spot } from '../engine2/core.js';
import { loadHand, setPose, mixPose } from '../engine2/hand.js';
import { buildSleeve } from '../engine2/sleeve.js';
import { buildKitchen, COUNTER } from '../engine2/kitchen.js';
import { buildBowl, porcelainMaterial, surfaceDroplets, waterMaterial, waterInBowl } from '../engine2/dishes.js';
import { wrap, wrapSeq, sdf } from './lib/grasp.js';
import { solvePinch, padPoint } from '../engine2/bothand.js';
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
  const wash = p.mode === 'wash';
  await st.hdri('../assets/hdri/blinds_2k.hdr', { intensity: p.env ?? (wash ? 0.25 : 0.4), rotation: p.rot ?? (wash ? 0.9 : 2.1), background: { blur: 0.09, intensity: p.bg ?? 0.45 } });
  const kitchen = buildKitchen(st, { width: 2.4 });
  kitchen.position.x = -0.55;
  st.scene.add(kitchen);
  const top = COUNTER.top;
  const mode = p.mode || 'catch';
  const lights = hamper(st);
  st.camera.near = 0.02;
  grade(st, { ao: { radius: 0.02, intensity: 1.6, falloff: 0.5 }, dof: { distance: 0.4, range: p.range ?? 0.1, bokeh: 3.5 }, bloom: { intensity: 0.35, threshold: 0.9 }, vignette: 0.62, contrast: 0.09, saturation: p.sat ?? (mode === 'wash' ? -0.16 : -0.08), exposure: p.exposure ?? 1.0 });

  if (mode === 'catch') return catchShot(st, { p, cues, dur, top });
  if (mode === 'wash') return washShot(st, { p, cues, dur, top, kitchen, lights });
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
  // forearm from the person standing to the right (+x), palm up, fingers across the falling mug's body so they can
  // close round it (the mug's axis lies in the y-z plane as it tips over the edge)
  const Zm = V3(...(p.fore ?? [1, 0.3, 0.12])).normalize();
  const up = V3(0, 1, 0);
  const Ym = up.clone().addScaledVector(Zm, -up.dot(Zm)).normalize().negate();
  const Xm = V3().crossVectors(Ym, Zm);
  const qHand = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(Xm, Ym, Zm));
  const comC = COM.clone().applyMatrix4(Mc);
  const axis = V3(0, 1, 0).applyQuaternion(atC.q);
  const mugSdf = sdf.cylinder(V3(0, 0, 0).applyMatrix4(Mc), axis, R, H);
  // the palm meets the mug's underside: drop straight down from its centre until clear of the surface
  let d = 0;
  while (d < 0.15 && mugSdf(comC.clone().add(V3(0, -d, 0))) < 0.002) d += 0.001;
  const palmTarget = comC.clone().add(V3(p.palmX ?? -0.006, -d, 0));
  const posC = palmTarget.clone().sub(palmLocal.clone().applyQuaternion(qHand));
  h.holder.quaternion.copy(qHand);
  h.holder.position.copy(posC);
  h.holder.updateMatrixWorld(true);
  // fingers close joint by joint round the body, the thumb over the top
  const closed = wrapSeq(h, mugSdf, { base: OPEN, thick: 0.0085 });
  setPose(h, closed);
  Object.assign(closed, wrap(h, mugSdf, { base: closed, thick: 0.0085, only: ['thumb'] }));
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
        const k = clamp(1 - (UC - u) / 0.16); // a reflex: the hand only starts once the mug is going
        const e = 1 - (1 - k) ** 2;
        hp = posC.clone().add(V3(0.36, -0.12, 0.05).multiplyScalar(1 - e));
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
      // camera: low in front of the counter's edge, the mug tipping toward it, the hand coming in from the right
      const k = ss(clamp(t / dur));
      const cl = p.look ?? [0.05, -0.045, 0.1], cp = p.cam ?? [-0.16, -0.035, 0.55];
      const look = V3(cl[0], top + cl[1] - 0.085 * sstep(tC - 1.0, tC + 0.3, t), cl[2]);
      const b = breathe(t, 0.0012, 2);
      st.camera.position.set(cp[0] + 0.03 * k + b[0], top + cp[1] + b[1], cp[2] - 0.05 * k + b[2]);
      st.camera.lookAt(look);
      if (st.camera.fov !== 30) { st.camera.fov = 30; st.camera.updateProjectionMatrix(); }
      if (st.dof) st.dof.target = mug.position.clone().add(V3(0, 0.04, 0));
    },
  };
}

// ---------------------------------------------------------------- wash
// distance from a point to a polyline in the (r, y) half-plane of a lathe section
function sectionSdf(pts, inv) {
  return (pw) => {
    const q = pw.clone().applyMatrix4(inv);
    const r = Math.hypot(q.x, q.z), y = q.y;
    let m = Infinity;
    for (let i = 1; i < pts.length; i++) {
      const ax = pts[i - 1].x, ay = pts[i - 1].y, bx = pts[i].x - ax, by = pts[i].y - ay;
      const k = Math.max(0, Math.min(1, ((r - ax) * bx + (y - ay) * by) / (bx * bx + by * by || 1)));
      m = Math.min(m, Math.hypot(r - ax - k * bx, y - ay - k * by));
    }
    return m;
  };
}

// the rice bowl cradled in the palm (foot in the palm, fingers up its far wall, thumb along the near one), tipped
// toward the camera under the running tap: the stream lands inside, pools, and the bowl turns slowly in it
async function washShot(st, { p, dur, top, kitchen, lights }) {
  const water = waterMaterial();
  // a cooler, plainer daylight than the other two: water and white porcelain over steel
  lights.key.color.set(0xfff2e6);
  lights.fill.color.set(0xe4ecf6);
  // brushed steel picks up the warm room and reads pink here: cool it a touch and soften the reflection
  kitchen.traverse((o) => {
    if (o.isMesh && o.material && o.material.metalness === 1) {
      o.material = o.material.clone();
      o.material.color.set(p.steel ?? 0xa1b4c0);
      o.material.roughness = Math.max(o.material.roughness, 0.36);
    }
  });
  const spout = kitchen.userData.spout.clone().add(kitchen.position);
  const rig = new THREE.Group();
  st.scene.add(rig);
  const bowl = buildBowl(porcelainMaterial());
  rig.add(bowl);
  bowl.add(surfaceDroplets(bowl, { n: 70, mat: water }));
  const h = await loadHand(st);
  h.holder.add(buildSleeve(st, { suit: 0x6b5a4a, dir: V3(...(p.sleeve ?? [0, 0.3, 1])) }));
  rig.add(h.holder);
  // hand in bowl space: palm up (palm normal is the holder's -y), fingers toward -z, forearm toward +z (the person)
  const yaw = p.yaw ?? 0;
  h.holder.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V3(-1, 0, 0), V3(0, -1, 0), V3(0, 0, 1)))
    .premultiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), yaw))
    .multiply(new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), p.pitch ?? -0.12));
  const CRADLE = { index: [0.25, 0.15, 0.1], middle: [0.25, 0.15, 0.1], ring: [0.28, 0.15, 0.1], little: [0.3, 0.15, 0.1], thumb: [-0.4, 0.1, 0], spread: { index: 0.06, middle: 0, ring: -0.06, little: -0.14 }, thumbRoll: 0, ...(p.cradle || {}) };
  setPose(h, CRADLE);
  h.holder.position.set(0, 0, 0);
  rig.updateMatrixWorld(true);
  const palmLocal = h.bones.f3_1.getWorldPosition(V3()).multiplyScalar(0.55);
  const palmDown = V3(0, 0.012, 0).applyQuaternion(h.holder.quaternion); // palm surface: 12 mm off the bones, palm side
  const seat = V3(...(p.seat ?? [0, -0.002, 0.008]));
  h.holder.position.copy(seat).sub(palmLocal).add(palmDown);
  rig.updateMatrixWorld(true);
  const inv = bowl.matrixWorld.clone().invert();
  const grip = wrap(h, sectionSdf(bowl.geometry.userData.profile, inv), { base: CRADLE, thick: p.thick ?? 0.0085, limit: 1.9 });
  setPose(h, grip);

  // the rig in the sink: tipped toward the camera, the rim's centre under the spout
  const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.tilt ?? [0.32, 0, -0.18]), 'YXZ'));
  const camPos = V3(...(p.cam ?? [spout.x + 0.16, top + 0.035, spout.z + 0.32]));
  const aimAt = V3(spout.x + (p.aim?.[0] ?? 0.0), top - 0.06 + (p.aim?.[1] ?? 0), spout.z + (p.aim?.[2] ?? 0.02));
  const inside = V3(0, 0.03, 0); // where the stream should land, bowl space
  const bottom = top - COUNTER.t - COUNTER.sink.depth;
  const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0046, 1, 24, 1, true), water);
  st.scene.add(stream);
  const R = rng(5);
  const splash = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), water, 60);
  splash.frustumCulled = false;
  st.scene.add(splash);
  const drops = Array.from({ length: 60 }, () => ({ ph: R(), a: R() * Math.PI * 2, sp: 0.15 + R() * 0.45, up: 0.3 + R() * 0.5, r: 0.0005 + R() ** 2 * 0.0014 }));
  // the pooled water by reflection alone: a transmissive surface here refracts the hand under the bowl and goes pink
  const poolMat = new THREE.MeshPhysicalMaterial({ color: 0xdde8f0, transparent: true, opacity: 0.26, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.1, depthWrite: false });
  let pool = null;
  const ray = new THREE.Raycaster();
  const m4 = new THREE.Matrix4(), sc = V3(), qI = new THREE.Quaternion();
  return {
    studio: st,
    update(t) {
      // the slow rinse: the bowl turns in the stream and rocks a little on the wrist
      const turn = new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), (p.turn ?? 0.35) * Math.sin(t * 1.1 - 0.4))
        .multiply(new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), 0.05 * Math.sin(t * 0.8 + 1)));
      rig.quaternion.copy(turn).multiply(tilt);
      // place the rig so the landing point sits under the spout
      rig.position.set(0, 0, 0);
      rig.updateMatrixWorld(true);
      const land = inside.clone().applyMatrix4(bowl.matrixWorld);
      rig.position.set(spout.x + (p.off?.[0] ?? 0), top - (p.depth ?? 0.045), spout.z + (p.off?.[2] ?? 0)).sub(land);
      rig.updateMatrixWorld(true);
      land.copy(inside).applyMatrix4(bowl.matrixWorld);
      // the stream: from the spout straight down to whatever it meets in the bowl
      ray.set(spout, V3(0, -1, 0));
      ray.far = 1;
      const hit = ray.intersectObject(bowl, false)[0];
      const endY = hit ? hit.point.y : bottom;
      stream.scale.set(1, spout.y - endY, 1);
      stream.position.set(spout.x, (spout.y + endY) / 2, spout.z);
      // the water pooled in the bowl, level, rebuilt as the bowl turns
      if (pool) { st.scene.remove(pool); pool.geometry.dispose(); }
      pool = waterInBowl(bowl, { belowLip: p.fill ?? 0.015, mat: poolMat });
      st.scene.add(pool);
      // splashes where the stream lands (looping, deterministic)
      const at = V3(spout.x, Math.max(endY, pool.geometry.attributes.position.getY(0)), spout.z);
      drops.forEach((d, i) => {
        const u = ((t * 1.9 + d.ph) % 1) * 0.1;
        const v = V3(Math.cos(d.a) * d.sp, d.up, Math.sin(d.a) * d.sp);
        const pos = at.clone().addScaledVector(v, u).addScaledVector(G, 0.5 * u * u);
        m4.compose(pos, qI, sc.setScalar(d.r * (1 - u / 0.1)));
        splash.setMatrixAt(i, m4);
      });
      splash.instanceMatrix.needsUpdate = true;
      const k = ss(clamp(t / dur));
      const b = breathe(t, 0.0012, 5);
      st.camera.position.set(camPos.x - 0.03 * k + b[0], camPos.y + b[1], camPos.z - 0.05 * k + b[2]);
      st.camera.lookAt(aimAt);
      const fov = p.fov ?? 28;
      if (st.camera.fov !== fov) { st.camera.fov = fov; st.camera.updateProjectionMatrix(); }
      if (st.dof) st.dof.target = land;
    },
  };
}

// ---------------------------------------------------------------- cap
// a water bottle's cap pinched between the thumb and the index and middle fingertips, twisted counter-clockwise
// (cue "twist") until it gives; tight on the cap, the bottle running out of frame (held below by the other hand)
async function capShot(st, { p, cues, dur, top }) {
  const bx = 0.05, bz = -0.22, by = top + 0.04;
  const CR = 0.0148, CH = 0.013; // the cap
  // the bottle: shoulder, neck with its ring, a thread under the cap
  const prof = [[0, 0], [0.033, 0], [0.034, 0.12], [0.03, 0.15], [0.02, 0.175], [0.0135, 0.188], [0.0135, 0.192], [0.0175, 0.193], [0.0175, 0.196], [0.0135, 0.197], [0.0135, 0.205]];
  const pet = new THREE.MeshPhysicalMaterial({ color: 0xf4f8fa, roughness: 0.06, transparent: true, opacity: 0.1, clearcoat: 1, clearcoatRoughness: 0.03, specularIntensity: 1, side: THREE.DoubleSide, depthWrite: false });
  const bottle = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 96), pet);
  bottle.position.set(bx, by, bz);
  st.scene.add(bottle);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(0.0315, 0.0325, 0.13, 64), new THREE.MeshPhysicalMaterial({ color: 0xcfe0ea, roughness: 0.04, transparent: true, opacity: 0.09, clearcoat: 1, depthWrite: false }));
  water.position.set(bx, by + 0.066, bz);
  st.scene.add(water);
  // ribbed cap
  const capG = new THREE.CylinderGeometry(CR, CR, CH, 120, 1);
  const cp0 = capG.attributes.position;
  for (let i = 0; i < cp0.count; i++) {
    const x = cp0.getX(i), z = cp0.getZ(i), a = Math.atan2(z, x), r = Math.hypot(x, z);
    if (r > CR * 0.9) { const k = 1 + 0.035 * Math.max(0, Math.cos(a * 40)) ** 2; cp0.setX(i, x * k); cp0.setZ(i, z * k); }
  }
  capG.computeVertexNormals();
  const cap = new THREE.Mesh(capG, new THREE.MeshPhysicalMaterial({ color: p.capColor ?? 0x2f6fb0, roughness: 0.38, clearcoat: 0.3 }));
  cap.castShadow = true;
  st.scene.add(cap);
  const capY = by + 0.197 + CH / 2;
  // the pinch: thumb pad and the index/middle pads a cap's width apart, facing
  const h = await loadHand(st);
  h.holder.add(buildSleeve(st, { suit: 0x6b5a4a }));
  st.scene.add(h.holder);
  const pinch = solvePinch(h, 2 * CR + 0.006);
  const tP = padPoint(h, 1), fP = padPoint(h, 2).lerp(padPoint(h, 3), 0.5);
  const R0 = tP.clone().lerp(fP, 0.5);
  const nW = fP.clone().sub(tP).normalize();
  const uH = h.bones.hand.getWorldPosition(V3()).sub(R0);
  uH.addScaledVector(nW, -uH.dot(nW)).normalize();
  const basis = (x, y) => new THREE.Matrix4().makeBasis(x, y, V3().crossVectors(x, y));
  const handF = basis(nW, uH).transpose();
  // in the world: the pinch axis level across the cap; the wrist up and back toward the person, off to the right
  const ax = p.axis ?? 2.2, el = p.elev ?? 0.75;
  const nWw = V3(Math.cos(ax), 0, Math.sin(ax));
  const away = V3(-Math.sin(ax), 0, Math.cos(ax)); // horizontal, perpendicular to the pinch axis
  const uHw = away.multiplyScalar(Math.cos(el)).add(V3(0, Math.sin(el), 0)).normalize();
  const M = basis(nWw, uHw).multiply(handF);
  const q0 = new THREE.Quaternion().setFromRotationMatrix(M);
  const off0 = R0.clone().applyQuaternion(q0);
  const centre = V3(bx, capY, bz);
  const tTw = cues.twist ?? 0.5;
  const TW = p.twistAngle ?? 1.1;
  return {
    studio: st,
    update(t) {
      // closing on the cap, one twist (counter-clockwise from above), and it gives
      const u = t - tTw;
      const turn = ss(clamp(u / 0.5));
      const close = sstep(-0.35, -0.05, u);
      const q = new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), TW * turn);
      const open = mixPose(OPEN, pinch.pose, 0.75 + 0.25 * close);
      setPose(h, open);
      h.holder.quaternion.copy(q).multiply(q0);
      h.holder.position.copy(centre).sub(off0.clone().applyQuaternion(q)).add(V3(0, 0.002 * (1 - close) + 0.0008 * sstep(0.35, 0.5, u), 0));
      cap.position.set(bx, capY + 0.0008 * sstep(0.35, 0.5, u), bz);
      cap.rotation.y = TW * turn;
      const k = ss(clamp(t / dur));
      const b = breathe(t, 0.0008, 7);
      const cp = p.cam ?? [-0.16, 0.035, 0.15];
      st.camera.position.set(bx + cp[0] + 0.015 * k + b[0], capY + cp[1] + b[1], bz + cp[2] - 0.015 * k + b[2]);
      st.camera.lookAt(bx + (p.aim?.[0] ?? 0.01), capY - (p.aim?.[1] ?? 0.012), bz);
      const fov = p.fov ?? 26;
      if (st.camera.fov !== fov) { st.camera.fov = fov; st.camera.updateProjectionMatrix(); }
      if (st.dof) st.dof.target = centre;
    },
  };
}
