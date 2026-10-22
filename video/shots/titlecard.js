// The title (B19): an empty board in the dark, only the stone of move 37 on it; a low raking light slides across
// the grain, the title comes up (cue "title"), and the board sinks away behind it — what lies beyond the board.
import { Studio, THREE, spot } from '../engine2/core.js';
import { buildGoSet, restPose } from './lib/goset.js';
import { ss, sstep, clamp, lerp, grade, title, text, FONT, V3 } from './lib/kit.js';

export async function create({ renderer, scale, p, cues, dur }) {
  const st = new Studio({ scale, renderer });
  await st.hdri('../assets/hdri/studio_small_09_2k.hdr', { intensity: 0.02, rotation: 1.2 });
  st.scene.background = new THREE.Color(0x010102);
  const set = await buildGoSet(st, { bowls: false });
  st.scene.add(set.group);
  set.show(37, { skip: Array.from({ length: 36 }, (_, k) => k + 1) });
  const sp = restPose({ i: 14, j: 9, n: 37 }).p;
  const rake = spot(0xffe2bf, 0, { pos: [-1.2, 0.18, 0.2], target: [0.3, 0, 0], angle: 0.5, penumbra: 1, radius: 4, shadow: 2048 });
  const pin = spot(0xdfe9ff, 0, { pos: [sp.x + 0.1, 1.0, sp.z + 0.2], target: [sp.x, 0, sp.z], angle: 0.09, penumbra: 1, radius: 3, shadow: 1024 });
  st.scene.add(rake, rake.target, pin, pin.target);
  grade(st, { ao: { radius: 0.02, intensity: 1.5 }, bloom: { intensity: 0.3, threshold: 0.9 }, vignette: 0.8, contrast: 0.12, exposure: 0.9 });
  st.camera.up.set(0, 0, -1);
  const tT = cues.title ?? 0.8;
  return {
    studio: st,
    update(t) {
      const k = clamp(t / dur);
      // the rake slides across; the board fades into darkness after the title lands, the stone keeps its pin light
      const fade = 1 - sstep(tT + 0.8, dur - 0.2, t);
      rake.position.set(lerp(-1.1, -0.6, k), 0.42, lerp(0.4, -0.25, k));
      rake.intensity = (p.rake ?? 9) * sstep(0, 0.8, t) * fade;
      pin.intensity = (p.pin ?? 5) * sstep(0.2, 1.2, t) * (1 - 0.4 * sstep(dur - 1, dur, t));
      const h = lerp(0.9, 0.78, ss(k));
      const lx = sp.x + 0.15, lz = sp.z + 0.08;
      st.camera.position.set(lx, h, lz + 0.001);
      st.camera.lookAt(lx, 0, lz);
      if (st.camera.fov !== 30) { st.camera.fov = 30; st.camera.updateProjectionMatrix(); }
    },
    overlay(g, t) {
      const a = sstep(tT, tT + 1.2, t) * (1 - sstep(dur - 0.45, dur, t));
      title(g, '棋盘之外', 1270, 560, { size: 150, a, weight: 600, spacing: 40, track: 24, color: [244, 239, 230], shadow: 40 });
      text(g, 'BEYOND  THE  BOARD', 1270, 680, { size: 22, font: FONT.mono, weight: 500, color: [190, 196, 204], a: a * 0.85, spacing: 10, shadow: 12 });
      const a2 = sstep(tT + 0.5, tT + 1.5, t) * (1 - sstep(dur - 0.45, dur, t));
      text(g, '第 1 集', 1270, 435, { size: 26, font: FONT.serif, weight: 500, color: [214, 200, 176], a: a2, spacing: 12, shadow: 10 });
    },
  };
}
