// The dishwasher (D32): not a machine that washes like a person, a box. A built-in dishwasher in a kitchen run, door
// down, the lower rack pulled out: its coated-wire grid of tines already holds plates and two bowls.
// cues: `slot` (碗插进格子) — four rice bowls drop into the rack's tines one after another (default dur * 0.62);
//       `close` (关门) — the rack rolls in and the door swings shut, the camera settling in front (default dur * 0.8);
//       `spray` (喷水) — the front is cut away top to bottom (a section), the kitchen light falls off, the tub lights
//       up inside and the spray arms throw slow-motion water jets up into the dishes (default dur * 0.88).
// Works from ~6.5 s; give the spray at least ~1.2 s after `spray` (the section cut takes 0.55 s, the camera then
// eases down to the spray arm over max(0.8, dur - spray + 0.4) s).
// p.slow (slow-motion factor for the water, default 0.1), p.exposure
import { Studio, THREE, spot } from '../engine2/core.js';
import { buildKitchen } from '../engine2/kitchen.js';
import { buildBowl, porcelainMaterial, bowlGeometry } from '../engine2/dishes.js';
import { buildDishwasher, DW, lowerLoad, plateGeometry, plateMaterial, sprayField } from './lib/grid_dish.js';
import { ss, sstep, clamp, lerp, breathe, grade, V3, easeOut } from './lib/kit.js';

const DEG = Math.PI / 180;
const X0 = 0.64; // the dishwasher's place in the kitchen run

export async function create({ renderer, scale, p, dur, cues }) {
  const st = new Studio({ scale, renderer });
  st.camera.near = 0.02;
  st.camera.far = 30;
  st.camera.rotation.order = 'YXZ';
  await st.hdri(`../assets/hdri/${p.hdri ?? 'glasshouse_interior'}_2k.hdr`, { intensity: p.env ?? 0.45, rotation: p.rot ?? 1.2, background: { blur: 0.5, intensity: 0.2 } });
  const kitchen = buildKitchen(st, { width: 3.2 });
  // take out the cabinet door where the dishwasher goes
  kitchen.children.filter((o) => o.isMesh && Math.abs(o.position.x - X0) < 0.05 && Math.abs(o.position.z + 0.035) < 0.01).forEach((o) => kitchen.remove(o));
  st.scene.add(kitchen);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshPhysicalMaterial({ ...st.pbr('Marble021', { repeat: [4, 4] }), color: 0x9ea4aa, roughness: 0.4, clearcoat: 0.3 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  st.scene.add(floor);

  const dw = buildDishwasher(st);
  dw.group.position.set(X0, 0, -0.05);
  st.scene.add(dw.group);

  // ---------------------------------------------------------------- the load
  const pMat = plateMaterial(), bMat = porcelainMaterial();
  const plateG = plateGeometry();
  const load = lowerLoad();
  for (const s of load.plates) {
    const m = new THREE.Mesh(plateG, pMat);
    m.position.set(s.x, 0.135, s.z);
    m.rotation.set(Math.PI / 2 - s.lean, 0, 0);
    m.castShadow = m.receiveShadow = true;
    dw.lower.add(m);
  }
  // bowls lean in the tines rim-down toward the front; find the height that rests the rim on the base wires
  const bowlRot = new THREE.Euler(Math.PI - 0.95, 0, 0);
  const bg = bowlGeometry().clone().applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(bowlRot));
  bg.computeBoundingBox();
  const bowlY = 0.006 - bg.boundingBox.min.y;
  const bowls = load.bowls.map((s, k) => {
    const m = buildBowl(bMat);
    m.rotation.copy(bowlRot);
    m.userData.rest = new THREE.Vector3(s.x, bowlY, s.z);
    m.position.copy(m.userData.rest);
    dw.lower.add(m);
    return m;
  });
  // the upper rack: cups upside down, two small bowls
  const cupG = new THREE.LatheGeometry([[0, 0], [0.038, 0], [0.04, 0.004], [0.042, 0.085], [0.039, 0.088], [0.036, 0.084], [0.034, 0.006], [0, 0.006]].map(([r, y]) => new THREE.Vector2(r, y)), 40);
  for (const [x, z] of [[-0.16, -0.12], [-0.16, 0.02], [-0.16, 0.16], [-0.06, -0.12], [-0.06, 0.04]]) {
    const c = new THREE.Mesh(cupG, pMat);
    c.rotation.set(Math.PI + 0.2, 0, 0);
    c.position.set(x, 0.095, z);
    c.castShadow = c.receiveShadow = true;
    dw.upper.add(c);
  }
  for (const [x, z] of [[0.12, -0.1], [0.12, 0.08]]) {
    const b = buildBowl(bMat);
    b.rotation.set(Math.PI - 0.5, 0, 0);
    b.position.set(x, 0.07, z);
    dw.upper.add(b);
  }

  // ---------------------------------------------------------------- light
  const key = spot(0xeef3ff, p.key ?? 26, { pos: [X0 - 0.6, 2.4, 1.6], target: [X0, 0.3, -0.1], angle: 0.42, penumbra: 0.9, shadow: 2048, radius: 5, near: 0.5, far: 6 });
  st.scene.add(key, key.target);
  // inside the tub, for the section: a cool light from the top front, a backlight low behind the arms
  const inner = spot(0xcfe4ff, 0, { pos: [X0, 0.76, -0.08], target: [X0, 0.1, -0.35], angle: 0.9, penumbra: 0.8, shadow: 1024, radius: 3, near: 0.05, far: 2 });
  st.scene.add(inner, inner.target);
  const back = new THREE.PointLight(0xa8ccff, 0, 1.2, 2);
  back.position.set(X0 + 0.05, 0.62, -0.5);
  st.scene.add(back);

  grade(st, {
    ao: { radius: 0.03, intensity: 1.6, falloff: 0.6 },
    dof: { distance: 1.4, range: p.range ?? 0.35, bokeh: p.bokeh ?? 3 },
    bloom: { intensity: 0.4, threshold: 0.85, radius: 0.6 },
    vignette: 0.6, contrast: 0.12, saturation: -0.08, exposure: p.exposure ?? 1.0,
  });

  // ---------------------------------------------------------------- water
  const slow = p.slow ?? 0.1;
  // jet water: clear (it shows the dishes behind it, bent, with dark rims and sharp highlights)
  const jetMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.0, metalness: 0, transmission: p.trans ?? 1, thickness: 0.004, ior: 1.33, specularIntensity: 1,
    attenuationColor: new THREE.Color(0xd6e4ee), attenuationDistance: 0.05,
  });
  const spray = sprayField({ slow, mat: jetMat });
  // the water keeps its own reflections when the kitchen light falls away
  spray.mesh.material.envMap = st.scene.environment;
  spray.mesh.material.envMapIntensity = p.waterEnv ?? 3.0;
  st.scene.add(spray.mesh);
  const lowerNoz = [];
  for (const [r, hit] of [[0.05, 0.12], [0.09, 0.16], [0.13, 0.1], [0.17, 0.14], [0.205, 0.09], [-0.05, 0.13], [-0.09, 0.11], [-0.13, 0.17], [-0.17, 0.1]]) {
    lowerNoz.push({ r, speed: 2.6 + Math.abs(r) * 2, tan: r > 0 ? 0.22 : -0.22, out: Math.sign(r) * 0.06, hit, rate: 800, size: 0.0026 });
  }
  const midNoz = [];
  for (const [r, hit] of [[0.05, 0.07], [0.09, 0.09], [0.13, 0.06], [0.17, 0.08], [-0.05, 0.08], [-0.09, 0.06], [-0.13, 0.09]]) midNoz.push({ r, speed: 2.0, tan: r > 0 ? 0.25 : -0.25, out: 0, hit, rate: 500, size: 0.0021 });
  const hubL = new THREE.Vector3(), hubM = new THREE.Vector3();

  // the front cut: a clipping plane that sweeps down through the door and the shell
  renderer.localClippingEnabled = true;
  const cut = new THREE.Plane(new THREE.Vector3(0, 1, 0), -10);
  const doorMats = new Set();
  dw.door.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.clippingPlanes = [cut]; o.material.clipShadows = true; doorMats.add(o.material); } });

  const tSlot = cues.slot ?? dur * 0.62, tClose = cues.close ?? dur * 0.8, tSpray = cues.spray ?? dur * 0.88;
  const tIn0 = tClose - 0.62, tIn1 = tClose - 0.2; // the rack rolls in
  const tD0 = tClose - 0.3, tD1 = tClose + 0.32; // the door swings up

  return {
    studio: st,
    update(t) {
      // ---- dishes: the front four bowls drop into their slots
      bowls.forEach((b, k) => {
        const order = [5, 4, 3, 2, -1, -1][k];
        const rest = b.userData.rest;
        if (order < 0) { b.position.copy(rest); b.visible = true; return; }
        // time-lapse loading: each bowl appears in its slot and settles the last couple of centimetres
        const tk = tSlot - 0.2 + order * 0.17;
        const u = clamp((t - tk) / 0.14);
        b.visible = t >= tk;
        const e = easeOut(u, 2.5);
        b.position.set(rest.x, rest.y + 0.022 * (1 - e), rest.z + 0.004 * (1 - e));
        b.rotation.set(Math.PI - 0.95 - 0.06 * (1 - e), 0, 0);
      });
      // ---- rack and door
      const rackOut = 1 - ss(clamp((t - tIn0) / (tIn1 - tIn0)));
      dw.lower.position.set(0, DW.lower.y + 0.012 * rackOut, DW.lower.zc + 0.43 * rackOut);
      const open = 1 - ss(clamp((t - tD0) / (tD1 - tD0)));
      dw.door.rotation.x = open * Math.PI / 2;
      // ---- the cut: sweep the front away top to bottom
      // (a plane keeps what lies on its positive side: y below the sweep line)
      const c = ss(clamp((t - tSpray + 0.1) / 0.55));
      cut.normal.set(0, -1, 0);
      cut.constant = c > 0 ? lerp(DW.h + 0.02, 0.0, c) : 10;
      // ---- light: kitchen falls away, the tub lights up
      const sec = sstep(tSpray - 0.1, tSpray + 0.6, t);
      key.intensity = (p.key ?? 26) * (1 - 0.82 * sec);
      st.scene.environmentIntensity = (p.env ?? 0.5) * (1 - 0.8 * sec);
      st.scene.backgroundIntensity = 0.2 * (1 - 0.9 * sec);
      inner.intensity = (p.inner ?? 3) * sec;
      back.intensity = (p.back ?? 0) * sec;
      // ---- spray arms + water
      const om = 2 * Math.PI * 1.15;
      dw.armL.rotation.y = om * slow * t;
      dw.armM.rotation.y = -om * slow * t * 1.2 + 1;
      dw.group.updateMatrixWorld(true);
      dw.armL.getWorldPosition(hubL);
      dw.armM.getWorldPosition(hubM);
      const on = sstep(tSpray - 0.25, tSpray + 0.25, t);
      if (on > 0.001) {
        spray.mesh.visible = true;
        spray.update(t, [
          { pos: hubL, omega: om, phase: 0, nozzles: lowerNoz },
          { pos: hubM, omega: -om * 1.2, phase: 1, nozzles: midNoz },
        ], on);
      } else spray.mesh.visible = false;
      // ---- camera: above the open rack -> down to the front as the door shuts -> a slow push into the section
      const a = ss(clamp((t - (tClose - 0.75)) / 1.0));
            const r0 = ss(clamp(t / Math.max(1, tClose - 0.75)));
      const b = breathe(t, 0.0025, 6);
      // after the cut, the camera eases round to a low three-quarter view under the upper rack
      const q = ss(clamp((t - tSpray) / Math.max(0.8, dur - tSpray + 0.4)));
      const pos = [
        lerp(lerp(lerp(X0 + 0.34, X0 + 0.26, r0), X0 + 0.08, a), X0 + (p.cx ?? 0.12), q),
        lerp(lerp(lerp(1.42, 1.3, r0), 0.52, a), p.cy ?? 0.22, q),
        lerp(lerp(lerp(1.02, 0.9, r0), 1.3, a), p.cz ?? 0.32, q),
      ];
      const look = [lerp(lerp(X0 + 0.02, X0, a), X0 - 0.03, q), lerp(lerp(0.2, 0.42, a), p.ly ?? 0.21, q), lerp(lerp(0.12, -0.25, a), -0.3, q)];
      const dx = look[0] - pos[0], dy = look[1] - pos[1], dz = look[2] - pos[2];
      st.camera.position.set(pos[0] + b[0], pos[1] + b[1], pos[2] + b[2]);
      st.camera.rotation.set(Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0, 'YXZ');
      const fov = lerp(lerp(34, 32, a), p.fov ?? 40, q);
      if (st.camera.fov !== fov) { st.camera.fov = fov; st.camera.updateProjectionMatrix(); }
      if (st.dof) {
        st.dof.target = V3(X0, lerp(lerp(0.22, 0.4, a), 0.2, q), lerp(lerp(0.12, -0.2, a), -0.26, q));
      }
    },
  };
}
