// E37 — a world shaped around the human body. Three warm close-ups, cut on the words: a lever handle on an oak door
// (cue "door", at 门把手), a flight of stairs with its handrail (cue "stairs", at 楼梯), a spatula in a wok on the gas
// hob (cue "pan", at 锅铲), each with a small label; then (cue "robot", at 那干脆) the home robot standing in the
// doorway of the family's dining room, a slow push in.
// The door close-up opens the shot (from t = 0, a slow push toward the handle) and its label lands at "door"; the
// other cues are cuts. p: { exposure, env }
// cues (s from the shot's start, defaults relative to dur): door 0.34, stairs 0.43, pan 0.51, robot 0.6
import { Studio, THREE } from '../engine2/core.js';
import { buildHome, homeLights, TABLE } from './lib/home_room.js';
import { doorSet, stairSet, stoveSet } from './lib/home_sets.js';
import { bowl, tumbler, mug } from './lib/home_props.js';
import { loadBot, botMaterials } from '../engine2/bot.js';
import { ss, sstep, clamp, lerp, breathe, grade, callout, V3 } from './lib/kit.js';

const SET = { door: new THREE.Vector3(30, 0, 0), stairs: new THREE.Vector3(60, 0, 0), stove: new THREE.Vector3(90, 0, 0) };

export async function create({ renderer, scale, p, dur, cues }) {
  const st = new Studio({ scale, renderer });
  const env = await st.hdri('../assets/hdri/comfy_cafe_2k.hdr', { intensity: p.env ?? 0.16, rotation: p.rot ?? 0 });
  st.scene.background = new THREE.Color(0x000000);

  // the home (for the robot) and its evening light
  const H = await buildHome(st, env);
  st.scene.add(H.group);
  const L = homeLights(st, H, p.light || {});
  const T = TABLE.top;
  for (const [o, x, z, ry] of [[bowl(st, 'rice'), -0.25, 0.12, 0], [bowl(st, 'noodle'), 0.18, -0.15, 0], [bowl(st, 'shallow'), -0.05, -0.2, 0],
    [bowl(st, 'cereal'), 0.52, 0.17, 0], [bowl(st, 'sauce'), 0.05, 0.22, 0], [bowl(st, 'wood'), -0.62, -0.12, 0], [tumbler(), 0.42, -0.25, 0], [mug(), -0.48, 0.28, 0.7]]) {
    o.position.set(x, T, z);
    o.rotation.y = ry;
    st.scene.add(o);
  }
  H.chairs[3].position.set(0.98, 0, 0.05);
  const bot = await loadBot(st, { mats: botMaterials({ envDiffuse: 0.45, white: 0xdcdfe3 }) });
  bot.holder.position.set(1.75, 0.012, -1.74);
  bot.holder.rotation.y = -0.18;
  st.scene.add(bot.holder);

  // the close-up sets, far from the room
  const doorG = doorSet(H.M);
  doorG.position.copy(SET.door);
  st.scene.add(doorG);
  const stairG = stairSet(H.M, st);
  stairG.position.copy(SET.stairs);
  st.scene.add(stairG);
  const stoveG = stoveSet(H.M, st);
  stoveG.position.copy(SET.stove);
  st.scene.add(stoveG);
  st.scene.updateMatrixWorld(true);
  const handle = doorG.localToWorld(doorG.userData.handle.clone());
  const lever = doorG.localToWorld(doorG.userData.handle.clone().add(V3(-0.075, -0.004, 0.05)));
  const rail = stairG.localToWorld(stairG.userData.railAt(2.2));
  const step = stairG.localToWorld(stairG.userData.stepAt(3));
  const blade = stoveG.localToWorld(stoveG.userData.blade.clone());

  // lights for the close-ups: the corner lamp's shadowed spot is borrowed as each set's key; a soft fill; a cool rim
  // from the hall for the robot
  const fill = new THREE.SpotLight(0xffe2c0, 0, 0, 0.6, 1, 2);
  const rim = new THREE.SpotLight(0xbcd2ff, 0, 0, 0.35, 0.9, 2);
  st.scene.add(fill, fill.target, rim, rim.target);
  const corner0 = { pos: L.corner.position.clone(), tgt: L.corner.target.position.clone(), I: L.corner.intensity, angle: L.corner.angle };
  const room0 = { pendant: L.pendant.intensity, lamp: L.lamp.intensity, window: L.window.intensity };

  const tDoor = cues.door ?? dur * 0.34;
  const tStairs = cues.stairs ?? Math.max(tDoor + 0.5, dur * 0.43);
  const tPan = cues.pan ?? Math.max(tStairs + 0.5, dur * 0.51);
  const tRobot = cues.robot ?? Math.max(tPan + 0.5, dur * 0.6);
  const segAt = (t) => (t < tStairs ? 'door' : t < tPan ? 'stairs' : t < tRobot ? 'stove' : 'robot');

  grade(st, {
    ao: { radius: 0.05, intensity: 1.5, falloff: 0.7 },
    dof: { distance: 0.5, range: 0.1, bokeh: 3 },
    bloom: { intensity: 0.3, threshold: 0.95, radius: 0.8 }, vignette: 0.62, contrast: 0.12, saturation: 0.0, exposure: p.exposure ?? 1.0,
  });
  if (st.aoPass) Object.assign(st.aoPass.configuration, { aoSamples: 8, denoiseSamples: 4, denoiseRadius: 8 });
  const focus = V3();
  st.dof.target = focus;

  const setKey = (pos, tgt, I, angle = 0.5) => {
    L.corner.position.copy(pos);
    L.corner.target.position.copy(tgt);
    L.corner.intensity = I;
    L.corner.angle = angle;
    L.corner.target.updateMatrixWorld();
  };
  const room = (on) => {
    L.pendant.intensity = on ? room0.pendant : 0;
    L.lamp.intensity = on ? room0.lamp : 0;
    L.window.intensity = on ? room0.window : 0;
  };
  const cam = st.camera;
  const shoot = (pos, look, fov, range, bokeh, f) => {
    cam.position.copy(pos);
    cam.lookAt(look);
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    focus.copy(f || look);
    st.dof.cocMaterial.focusRange = range;
    st.dof.bokehScale = bokeh;
  };

  return {
    studio: st,
    update(t) {
      const seg = segAt(t);
      const b = breathe(t, 0.0012, 5);
      if (seg === 'door') {
        room(false);
        // a warm lamp down the hall rakes across the door from the left
        setKey(SET.door.clone().add(V3(-1.3, 1.55, 1.1)), handle, 9, 0.45);
        fill.position.copy(SET.door.clone().add(V3(1.5, 1.2, 2.0)));
        fill.target.position.copy(handle);
        fill.intensity = 0.8;
        rim.intensity = 0;
        const u = ss(clamp(t / Math.max(1, tStairs)));
        const pos = handle.clone().add(V3(lerp(0.36, 0.22, u), lerp(0.07, 0.04, u), lerp(0.5, 0.3, u))).add(V3(...b));
        shoot(pos, handle.clone().add(V3(-0.04, -0.005, 0)), 30, 0.07, 3.5, lever);
      } else if (seg === 'stairs') {
        room(false);
        // light from a window on the landing above, falling down the steps through the balusters
        setKey(SET.stairs.clone().add(V3(-0.2, 4.2, -3.6)), SET.stairs.clone().add(V3(-0.3, 0.6, -0.4)), 22, 0.55);
        fill.position.copy(SET.stairs.clone().add(V3(1.8, 1.4, 2.2)));
        fill.target.position.copy(step);
        fill.intensity = 2.0;
        rim.intensity = 0;
        const u = (t - tStairs) / Math.max(0.5, tPan - tStairs);
        const pos = SET.stairs.clone().add(V3(-0.12 - 0.03 * u, 0.5 + 0.03 * u, 1.05 - 0.1 * u)).add(V3(...b));
        shoot(pos, SET.stairs.clone().add(V3(-0.45, 1.25, -1.6)), 44, 0.9, 2.0, rail);
      } else if (seg === 'stove') {
        room(false);
        // the range hood's lamp straight above, and the room's warm spill
        setKey(SET.stove.clone().add(V3(-0.05, 1.7, -0.32)), SET.stove.clone().add(V3(-0.15, 0.9, -0.22)), 13, 0.7);
        fill.position.copy(SET.stove.clone().add(V3(1.2, 1.5, 1.4)));
        fill.target.position.copy(blade);
        fill.intensity = 1.0;
        rim.intensity = 0;
        const u = (t - tPan) / Math.max(0.5, tRobot - tPan);
        const pos = SET.stove.clone().add(V3(0.2 - 0.03 * u, 1.36 - 0.02 * u, 0.36 - 0.04 * u)).add(V3(...b));
        shoot(pos, blade.clone().add(V3(0.01, 0.0, -0.02)), 32, 0.12, 3, blade);
      } else {
        room(true);
        // the pendant's warm spill from high in the room (steep, so the chairs' shadows fall short of the doorway)
        setKey(V3(0.55, 2.5, 0.1), V3(1.75, 0.95, -1.74), 22, 0.42);
        fill.intensity = 0;
        // a cool light from the hall behind: the machine's outline in the warm room
        rim.position.set(2.15, 2.35, -3.9);
        rim.target.position.set(1.72, 1.1, -1.74);
        rim.intensity = 26;
        const u = ss(clamp((t - tRobot) / Math.max(1.5, dur - tRobot)));
        const pos = V3(lerp(1.08, 1.3, u), lerp(1.12, 1.16, u), lerp(2.1, 0.95, u)).add(V3(...breathe(t, 0.004, 9)));
        shoot(pos, V3(lerp(1.62, 1.7, u), lerp(0.92, 0.97, u), -1.74), 38, 1.4, 1.8, V3(1.75, 1.0, -1.74));
      }
    },
    overlay(g, t) {
      const seg = segAt(t);
      const lab = (pt, text, t0, side, dx, dy) => callout(g, cam, pt, { text, a: sstep(t0, t0 + 0.3, t), side, dx, dy, size: 34, color: [246, 226, 196], line: [236, 206, 160] });
      if (seg === 'door') lab(lever, '门把手', tDoor, 1, 150, -160);
      if (seg === 'stairs') lab(rail, '楼梯', tStairs + 0.12, -1, 140, -120);
      if (seg === 'stove') lab(blade, '锅铲', tPan + 0.12, 1, 160, -150);
    },
  };
}
