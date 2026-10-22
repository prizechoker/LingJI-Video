// The robot on a dark stage (B18, and later reveals).
// p.mode: 'years'  — the year rolls from 2016 to 2026 (cue "roll" .. cue "land") while the robot rises out of the
//                    dark behind it as a rim-lit silhouette; then the stage light comes up (cue "light").
//         'labels' — the lit robot, slow orbit; "翻跟头" (cue "flip") and "跑半马" (cue "run") pinned beside it.
//         'reveal' — just the lit robot, a slow push (for other moments).
// A rigged robot (engine2/botrig.js) is used when p.pose is given and the rig exists.
import { Studio, THREE, spot } from '../engine2/core.js';
import { loadBot, botMaterials } from '../engine2/bot.js';
import { ss, sstep, clamp, lerp, breathe, grade, title, callout, text, FONT, V3, measure } from './lib/kit.js';
import { lightCone } from './lib/fx.js';

export async function create({ renderer, scale, p, cues, dur }) {
  const st = new Studio({ scale, renderer });
  const env = await st.hdri('../assets/hdri/studio_small_09_2k.hdr', { intensity: p.env ?? 0.3, rotation: 0.6 });
  st.scene.background = new THREE.Color(0x020306);
  const mode = p.mode || 'reveal';
  const tex = st.pbr('Concrete034', { repeat: [24, 24] });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 96), new THREE.MeshStandardMaterial({
    ...tex, color: 0x4a5058, roughness: 0.8, normalScale: new THREE.Vector2(0.25, 0.25), envMap: env, envMapIntensity: 0.02,
  }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  st.scene.add(floor);
  const r = await loadBot(st, { mats: botMaterials({ envDiffuse: 0.35, white: 0xd9dce0 }) });
  r.holder.rotation.y = p.yaw ?? 0.22;
  st.scene.add(r.holder);

  const topI = p.top ?? 70, rimI = p.rim ?? 26;
  const top = spot(0xf3f6ff, topI, { pos: [0.25, 4.8, 1.0], target: [0, 0.85, 0], angle: 0.3, penumbra: 0.9, radius: 10, near: 2, far: 9, shadow: 2048 });
  const rimL = spot(0xd4e2ff, rimI, { pos: [-1.7, 2.7, -2.4], target: [0, 1.15, 0], angle: 0.42, penumbra: 1, shadow: 0 });
  const rimR = spot(0xffffff, rimI * 0.7, { pos: [1.9, 2.3, -2.3], target: [0, 1.05, 0], angle: 0.42, penumbra: 1, shadow: 0 });
  const fill = spot(0xffffff, 4, { pos: [-1.4, 1.5, 3.2], target: [0, 1.0, 0], angle: 0.55, penumbra: 1, shadow: 0 });
  const sideL = spot(0xf4f6fa, 3, { pos: [-2.4, 1.0, 1.4], target: [0, 0.85, 0], angle: 0.5, penumbra: 1, shadow: 0 });
  const sideR = spot(0xf4f6fa, 2.4, { pos: [2.4, 0.9, 1.6], target: [0, 0.8, 0], angle: 0.5, penumbra: 1, shadow: 0 });
  for (const l of [top, rimL, rimR, fill, sideL, sideR]) st.scene.add(l, l.target);
  const cone = lightCone({ apex: [0.25, 4.8, 1.0], target: [0, 0, 0], radius: 1.45, color: 0xdfe8ff, intensity: 0.035 });
  st.scene.add(cone);

  grade(st, { ao: { radius: 0.05, intensity: 0.7 }, bloom: { intensity: 0.25, threshold: 0.85 }, vignette: 0.6, contrast: 0.1, saturation: -0.08, exposure: p.exposure ?? 1.0 });
  const tRoll = cues.roll ?? 0.3, tLand = cues.land ?? dur * 0.55, tLight = cues.light ?? tLand + 0.2;
  const CAM = mode === 'years'
    ? { from: { pos: [0.1, 1.0, 6.4], look: [-0.62, 1.0, 0], fov: 22 }, to: { pos: [0.2, 0.95, 5.3], look: [-0.5, 0.92, 0], fov: 23 } }
    : mode === 'labels'
      ? { from: { pos: [-1.1, 1.05, 4.6], look: [0, 0.9, 0], fov: 24 }, to: { pos: [0.9, 1.0, 4.4], look: [0, 0.9, 0], fov: 24 } }
      : { from: { pos: [0.5, 0.95, 5.4], look: [0, 0.87, 0], fov: 23 }, to: { pos: [0.45, 1.0, 4.6], look: [0, 0.9, 0], fov: 23 } };

  return {
    studio: st,
    update(t) {
      if (mode === 'years') {
        // dark first: only the rims draw the outline; then the top light comes up
        const l = sstep(tLight, tLight + 1.0, t);
        top.intensity = topI * l;
        fill.intensity = 4 * l;
        sideL.intensity = 3 * l;
        sideR.intensity = 2.4 * l;
        rimL.intensity = rimI * (0.25 + 0.75 * sstep(tRoll, tLand, t));
        rimR.intensity = rimI * 0.7 * (0.25 + 0.75 * sstep(tRoll, tLand, t));
        cone.material.uniforms.uI.value = 0.035 * l;
        st.scene.environmentIntensity = lerp(0.03, p.env ?? 0.3, l);
      }
      cone.userData.tick(t);
      const k = ss(clamp(t / dur));
      const pos = CAM.from.pos.map((v, i) => lerp(v, CAM.to.pos[i], k));
      const look = CAM.from.look.map((v, i) => lerp(v, CAM.to.look[i], k));
      const b = breathe(t, 0.006, 8);
      st.camera.position.set(pos[0] + b[0], pos[1] + b[1], pos[2] + b[2]);
      st.camera.lookAt(...look);
      const fov = lerp(CAM.from.fov, CAM.to.fov, k);
      if (st.camera.fov !== fov) { st.camera.fov = fov; st.camera.updateProjectionMatrix(); }
    },
    overlay(g, t) {
      if (mode === 'years') {
        // an odometer: each digit column scrolls; only the last two digits change
        const a = sstep(tRoll - 0.4, tRoll, t) * (1 - sstep(dur - 0.5, dur, t));
        if (a <= 0.001) return;
        const u = ss(clamp((t - tRoll) / Math.max(0.5, tLand - tRoll)));
        const year = 2016 + 10 * u;
        const size = 170, x0 = 600, y0 = 500;
        const digits = ['2', '0'];
        const w = measure(g, '0', { size, font: FONT.serif, weight: 500 }) + 6;
        const tens = 1 + (year - 2010) / 10; // 1.6 -> 2.6 as a continuous tens digit
        const ones = year - Math.floor(year / 10) * 10;
        const cols = [[2, 0], [0, 0], [Math.floor(tens), tens - Math.floor(tens)], [Math.floor(ones), ones - Math.floor(ones)]];
        g.save();
        g.beginPath();
        g.rect(0, y0 - size * 0.62, 1920, size * 1.24);
        g.clip();
        cols.forEach(([d, f], i) => {
          const x = x0 + (i - 1.5) * w;
          // the digit rolls up into the next one in the last part of each step
          const roll = sstep(i === 2 ? 0.93 : 0.72, 1, f);
          for (const [dd, dy] of [[d % 10, -roll], [(d + 1) % 10, 1 - roll]]) {
            const aa = a * Math.max(0, 1 - Math.abs(dy) * 1.6);
            text(g, String(dd), x, y0 + dy * size * 1.1, { size, font: FONT.serif, weight: 500, color: [238, 240, 244], a: aa, align: 'center', shadow: 30 });
          }
        });
        g.restore();
        const aT = sstep(tLand, tLand + 0.6, t) * a;
        text(g, '十 年', x0, y0 + 150, { size: 34, font: FONT.serif, weight: 500, color: [200, 210, 222], a: aT, spacing: 14, shadow: 12 });
      }
      if (mode === 'labels') {
        st.camera.updateMatrixWorld();
        const tf = cues.flip ?? 0.6, tr = cues.run ?? 1.6;
        callout(g, st.camera, V3(-0.12, 1.45, 0.05), { text: '翻跟头', sub: 'BACKFLIP', a: sstep(tf, tf + 0.5, t), side: -1, dx: 190, dy: -60, size: 40, subSize: 18 });
        callout(g, st.camera, V3(0.1, 0.55, 0.05), { text: '跑半马', sub: 'HALF MARATHON · 21.0975 KM', a: sstep(tr, tr + 0.5, t), side: 1, dx: 200, dy: 40, size: 40, subSize: 18 });
      }
    },
  };
}
