// The home that cannot become a chessboard (E34, E35).
import { Studio, THREE, spot } from '../engine2/core.js';
import { buildHome, homeLights, ROOM, TABLE } from './lib/home_room.js';
import { bowl, tumbler, mug } from './lib/home_props.js';
import { ss, sstep, clamp, lerp, breathe, grade, caption, text, FONT, V3, rng } from './lib/kit.js';

const CAMS = {
  grid: { pos: [2.35, 1.62, 3.05], look: [-0.25, 0.78, -0.55], fov: 40, to: { pos: [2.1, 1.55, 2.75], look: [-0.25, 0.8, -0.55] } },
  days: { pos: [0.95, 1.32, 2.15], look: [0.25, 0.92, -0.7], fov: 36, to: { pos: [0.9, 1.3, 2.0], look: [0.25, 0.92, -0.7] } },
};

export async function create({ renderer, scale, p, dur, cues }) {
  const st = new Studio({ scale, renderer });
  const env = await st.hdri('../assets/hdri/comfy_cafe_2k.hdr', { intensity: p.env ?? 0.12, rotation: p.rot ?? 0 });
  st.scene.background = new THREE.Color(0x000000);
  const H = await buildHome(st, env);
  st.scene.add(H.group);
  const L = homeLights(st, H, p.light || {});

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

  const mode = p.mode || 'days';
  const cam = CAMS[mode];
  grade(st, {
    ao: { radius: 0.12, intensity: 1.6, falloff: 0.8 },
    dof: { distance: 2.4, range: p.range ?? 1.2, bokeh: p.bokeh ?? 2.5 },
    bloom: { intensity: 0.35, threshold: 0.95 }, vignette: 0.6, contrast: 0.1, saturation: 0.0, exposure: p.exposure ?? 1.0,
  });
  if (st.dof) st.dof.target = V3(0.2, T, -0.1);

  return {
    studio: st,
    update(t) {
      const u = ss(clamp(t / dur));
      const to = cam.to || cam;
      const b = breathe(t, 0.004, 3);
      st.camera.position.set(...cam.pos.map((v, i) => lerp(v, to.pos[i], u) + b[i]));
      st.camera.lookAt(...cam.look.map((v, i) => lerp(v, to.look[i], u)));
      if (st.camera.fov !== cam.fov) { st.camera.fov = cam.fov; st.camera.updateProjectionMatrix(); }
    },
  };
}
