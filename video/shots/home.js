// The home that cannot become a chessboard (E34, E35). A dining room on a winter evening: tungsten lamps, dusk in
// the window, an oak table set with bowls of every shape, chairs, books, a fig, an armchair in the corner.
// p.mode: 'grid' (E34) — a cool grid of light hovers over the room, sinks and drapes itself over the clutter, strains
//                        and buckles; at cue "break" (at 你家) it breaks into fragments that drift up and go out.
//         'days' (E35) — one camera on the table. A sweater is tossed over a chair back (cue "shirt", at 衣服随手一扔);
//                        a cat's shadow leaps up the wall onto the table (cue "cat", at 猫还会跳上桌子); then (cue
//                        "days", at 每一天) the table is seen on 周一 / 周二 / 周三, set differently each day, the light
//                        shifting a little (dissolves).
// p: { mode, exposure, env, light: { pendant, lamp, corner, window, hall } }
// cues (s from the shot's start): grid: break (default 0.68 dur); days: shirt (0.27 dur), cat (0.5 dur), days (0.72 dur)
import { Studio, THREE } from '../engine2/core.js';
import { buildHome, homeLights, ROOM, TABLE } from './lib/home_room.js';
import { bowl, tumbler, mug } from './lib/home_props.js';
import { heightField, lightGrid } from './lib/home_grid.js';
import { ss, sstep, clamp, lerp, key, breathe, grade, caption, text, FONT, V3 } from './lib/kit.js';

const CAMS = {
  grid: { pos: [2.05, 1.42, 2.75], look: [-0.35, 0.72, -0.6], fov: 42, to: { pos: [1.85, 1.38, 2.45], look: [-0.35, 0.74, -0.6] } },
  days: { pos: [1.35, 1.3, 2.05], look: [0.45, 0.95, -0.8], fov: 36, to: { pos: [1.28, 1.28, 1.9], look: [0.45, 0.95, -0.8] } },
};

export async function create({ renderer, scale, p, dur, cues }) {
  const st = new Studio({ scale, renderer });
  const env = await st.hdri('../assets/hdri/comfy_cafe_2k.hdr', { intensity: p.env ?? 0.22, rotation: p.rot ?? 0 });
  st.scene.background = new THREE.Color(0x000000);
  const H = await buildHome(st, env);
  st.scene.add(H.group);
  const L = homeLights(st, H, p.light || {});
  const mode = p.mode || 'days';

  // the table, set for a meal
  const T = TABLE.top;
  const put = (o, x, z, ry = 0) => { o.position.set(x, T, z); o.rotation.y = ry; st.scene.add(o); return o; };
  put(bowl(st, 'rice'), -0.25, 0.12);
  put(bowl(st, 'noodle'), 0.18, -0.15);
  put(bowl(st, 'shallow'), -0.05, -0.2);
  put(bowl(st, 'cereal'), 0.5, 0.18);
  put(bowl(st, 'sauce'), 0.05, 0.22);
  put(bowl(st, 'wood'), -0.6, -0.12);
  put(tumbler(), 0.42, -0.25);
  put(mug(), -0.48, 0.28, 0.7);

  const cam = CAMS[mode];
  grade(st, {
    ao: { radius: 0.12, intensity: 1.6, falloff: 0.8 },
    dof: { distance: 2.6, range: p.range ?? (mode === 'grid' ? 3.5 : 1.8), bokeh: p.bokeh ?? 1.6 },
    bloom: { intensity: mode === 'grid' ? 0.6 : 0.35, threshold: mode === 'grid' ? 0.8 : 0.95, radius: 0.8 },
    vignette: 0.6, contrast: 0.1, saturation: 0.0, exposure: p.exposure ?? 1.0,
  });
  if (st.dof) st.dof.target = mode === 'grid' ? V3(-0.1, T, -0.1) : V3(0.45, T, -0.2);

  // ---------------------------------------------------------------- E34: the grid
  let grid = null;
  const tBreak = cues.break ?? dur * 0.68;
  if (mode === 'grid') {
    st.scene.updateMatrixWorld(true);
    const box = { x0: ROOM.x0 + 0.02, x1: ROOM.x1 - 0.02, z0: ROOM.z0 + 0.02, z1: 2.6 };
    const hf = heightField(renderer, st.scene, { ...box, res: 512, hide: H.overhead });
    grid = lightGrid(hf, { ...box, step: 0.25, ds: 0.02, scale });
    st.scene.add(grid.obj);
  }

  return {
    studio: st,
    update(t) {
      const u = ss(clamp(t / dur));
      const to = cam.to || cam;
      const b = breathe(t, 0.004, 3);
      st.camera.position.set(...cam.pos.map((v, i) => lerp(v, to.pos[i], u) + b[i]));
      st.camera.lookAt(...cam.look.map((v, i) => lerp(v, to.look[i], u)));
      if (st.camera.fov !== cam.fov) { st.camera.fov = cam.fov; st.camera.updateProjectionMatrix(); }
      if (grid) {
        const settle = clamp((tBreak - 0.45 - 0.25) / 1.0);
        grid.update(t, {
          a: sstep(0.0, 0.35, t),
          draw: lerp(0, 1.25, sstep(0.0, 0.9, t)),
          level: key(t, [[0.25, 1.25], [tBreak - 0.45, 0.0]], (x) => x * x * (3 - 2 * x) * 0.6 + x * x * 0.4),
          strain: sstep(tBreak - 0.9 * Math.max(0.5, settle), tBreak, t),
          brk: t - tBreak,
        });
      }
    },
  };
}
