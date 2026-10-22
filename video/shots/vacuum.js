// The robot vacuum (D31): a lived-in living room seen from straight above, afternoon sun through two windows; a
// robot vacuum works the open floor in a boustrophedon (back-and-forth) path, its swath and centre line traced on
// the floor behind it (a few lanes already done when the shot opens; the motion is time-lapsed).
// cue `floor` (地板): everything that is not floor drains to a dark grey, the floor stays lit and the whole planned
//   path draws itself out over it in cool light (default dur * 0.78).
// p.speed (m/s along the path, default 1.0), p.s0 (metres already cleaned at t = 0), p.exposure
import { Studio, THREE } from '../engine2/core.js';
import { buildRoom, buildVacuum, ROOM } from './lib/grid_room.js';
import { greyable } from './lib/grid_fx.js';
import { ss, sstep, clamp, lerp, breathe, grade, V3 } from './lib/kit.js';

const DEG = Math.PI / 180;

// the cleaning route: back and forth along x over the open floor in front of the sofa, then over the patch between
// the plant and the dining table; 90 degree turns rounded to the vacuum's own radius
function route() {
  const pts = [];
  // patch A: between the rug and the TV console, right of the bookshelf
  const lanesA = [1.32, 1.06, 0.8];
  lanesA.forEach((z, k) => {
    const [xa, xb] = k % 2 === 0 ? [-2.95, 0.55] : [0.55, -2.95];
    pts.push([xa, z], [xb, z]);
  });
  // up the gap right of the rug, then patch B: between the side table and plant and the dining chairs
  pts.push([0.55, 0.8], [0.62, 0.8], [0.62, -0.62]);
  const lanesB = [-0.62, -0.88, -1.14, -1.4];
  lanesB.forEach((z, k) => {
    const [xa, xb] = k % 2 === 0 ? [0.62, 2.7] : [2.7, 0.95];
    pts.push([xa, z], [xb, z]);
  });
  // a polyline with rounded corners, sampled every 2 cm: [{ x, z, s, yaw }]
  const out = [];
  const r = 0.14;
  const P = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
  let s = 0, prev = null;
  const push = (x, z) => {
    if (prev) s += Math.hypot(x - prev.x, z - prev.z);
    const o = { x, z, s };
    out.push(o);
    prev = o;
  };
  for (let i = 0; i < P.length - 1; i++) {
    const [ax, az] = P[i], [bx, bz] = P[i + 1];
    const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
    const cut0 = i > 0 ? Math.min(r, L / 2) : 0, cut1 = i < P.length - 2 ? Math.min(r, L / 2) : 0;
    for (let d = cut0; d <= L - cut1 + 1e-6; d += 0.02) push(ax + ux * d, az + uz * d);
    if (i < P.length - 2) {
      // quadratic corner from (b - u cut1) through b to (b + v cut)
      const [cx, cz] = P[i + 2];
      const L2 = Math.hypot(cx - bx, cz - bz), vx = (cx - bx) / L2, vz = (cz - bz) / L2;
      const c2 = Math.min(r, L2 / 2);
      const p0 = [bx - ux * cut1, bz - uz * cut1], p2 = [bx + vx * c2, bz + vz * c2];
      for (let k = 1; k < 10; k++) {
        const t = k / 10;
        push((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * bx + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * bz + t * t * p2[1]);
      }
    }
  }
  for (let i = 0; i < out.length; i++) {
    const a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)];
    out[i].yaw = Math.atan2(-(b.z - a.z), b.x - a.x);
  }
  return out;
}

// the trace: a ribbon along the route (s = arc length per vertex, v = -1..1 across); drawn up to uS, the plan up to uP
function traceMesh(path, width = 0.3) {
  const pos = [], sv = [], idx = [];
  path.forEach((p, i) => {
    const nx = -Math.sin(p.yaw + Math.PI / 2) * 0, c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
    // the yaw is about +y: forward = (cos, -sin) in xz; left normal = (-sin, -cos)
    const lx = -sn, lz = -c;
    void nx;
    pos.push(p.x + lx * width / 2, 0.004, p.z + lz * width / 2, p.x - lx * width / 2, 0.004, p.z - lz * width / 2);
    sv.push(p.s, -1, p.s, 1);
    if (i < path.length - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('sv', new THREE.Float32BufferAttribute(sv, 2));
  g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uS: { value: 0 }, uP: { value: 0 }, uCol: { value: new THREE.Color(0x8fd8ff) }, uSwath: { value: 0.12 }, uLine: { value: 1.0 }, uPlan: { value: 0 }, uCut: { value: 0 } },
    vertexShader: `attribute vec2 sv; varying vec2 vSV; void main() { vSV = sv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uS; uniform float uP; uniform vec3 uCol; uniform float uSwath; uniform float uLine; uniform float uPlan; uniform float uCut;
      varying vec2 vSV;
      void main() {
        float s = vSV.x, v = abs(vSV.y);
        float done = step(s, uS) * smoothstep(uCut, uCut + 0.4, s);
        float swath = (1.0 - smoothstep(0.75, 1.0, v)) * uSwath;
        float line = exp(-pow(v / 0.07, 2.0)) * uLine;
        // fresh trace is brighter right behind the robot
        float fresh = 1.0 + 1.5 * exp(-(uS - s) * 1.2);
        float plan = step(uS, s) * step(s, uP) * uPlan * exp(-pow(v / 0.06, 2.0)) * (0.55 + 0.45 * step(0.5, fract(s * 4.0)));
        vec3 c = uCol * ((swath + line) * done * fresh + plan);
        gl_FragColor = vec4(c, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  });
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 4;
  return m;
}

export async function create({ renderer, scale, p, dur, cues }) {
  const st = new Studio({ scale, renderer });
  st.camera.near = 0.1;
  st.camera.far = 60;
  st.camera.rotation.order = 'YXZ';
  await st.hdri('../assets/hdri/kiara_interior_2k.hdr', { intensity: p.env ?? 0.55, rotation: 2.2 });
  st.scene.background = new THREE.Color(0x0d0e10);
  const room = await buildRoom(st);
  st.scene.add(room.group);
  // everything but the floor and the rug can drain to grey
  const keep = new Set([room.mats.floorMat, room.mats.rugMat]);
  const greys = [];
  room.group.traverse((o) => {
    if (!o.isMesh || keep.has(o.material)) return;
    if (!o.material.userData.grey) { greyable(o.material, { dark: 0.42, tint: [0.78, 0.82, 0.88] }); greys.push(o.material); }
  });
  const floorGlow = { value: 0 };
  // the floor itself cools a little and lifts when it becomes the subject
  for (const m of keep) {
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (s, r) => {
      if (prev) prev(s, r);
      s.uniforms.uFloorK = floorGlow;
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uFloorK;')
        .replace('#include <opaque_fragment>', `
{
  float lum = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
  vec3 cool = mix(outgoingLight, vec3(lum) * vec3(0.86, 0.95, 1.08) * 1.08, 0.55);
  outgoingLight = mix(outgoingLight, cool, uFloorK);
}
#include <opaque_fragment>`);
    };
  }

  const vac = buildVacuum();
  st.scene.add(vac);
  const path = route();
  const total = path[path.length - 1].s;
  const trace = traceMesh(path);
  st.scene.add(trace);

  // light: the sun through the windows in the +x wall, a soft interior fill, a lamp-warm bounce
  const sun = new THREE.DirectionalLight(0xffe2bd, p.sun ?? 3.2);
  sun.position.set(9, 6.5, 2.2);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 25 });
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.015;
  sun.shadow.radius = 3;
  st.scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xe8eef6, p.fill ?? 0.6);
  fill.position.set(-2, 10, 3);
  st.scene.add(fill);

  grade(st, {
    ao: { radius: 0.12, intensity: 1.8, falloff: 0.7 },
    bloom: { intensity: 0.45, threshold: 0.9, radius: 0.6 },
    vignette: 0.5, contrast: 0.1, saturation: -0.04, exposure: p.exposure ?? 1.0,
  });
  st.camera.userData.pxH = st.h;

  const tFloor = cues.floor ?? dur * 0.78;
  const speed = p.speed ?? 1.0, s0 = p.s0 ?? 6.2;
  const at = (s) => {
    s = clamp(s, 0, total);
    let lo = 0, hi = path.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (path[m].s < s) lo = m; else hi = m; }
    const a = path[lo], b = path[hi], u = (s - a.s) / Math.max(1e-6, b.s - a.s);
    let dy = b.yaw - a.yaw;
    if (dy > Math.PI) dy -= 2 * Math.PI;
    if (dy < -Math.PI) dy += 2 * Math.PI;
    return { x: lerp(a.x, b.x, u), z: lerp(a.z, b.z, u), yaw: a.yaw + dy * u };
  };

  return {
    studio: st,
    update(t) {
      // camera: straight down, a slow push and a degree or two of turn
      const r = ss(clamp(t / dur));
      const b = breathe(t, 0.006, 3);
      st.camera.position.set(0.0 + b[0], lerp(11.9, 11.2, r) + b[1], 0.0 + b[2]);
      st.camera.rotation.set(-90 * DEG, 0, lerp(-1.0, 0.6, r) * DEG, 'YXZ');
      if (st.camera.fov !== 21) { st.camera.fov = 21; st.camera.updateProjectionMatrix(); }
      // the vacuum along its route (a little rocking as it turns)
      const s = s0 + speed * t;
      const q = at(s);
      vac.position.set(q.x, 0, q.z);
      vac.rotation.y = q.yaw;
      const U = trace.material.uniforms;
      U.uS.value = s - 0.12;
      // at `floor`: the furniture drains to grey, the floor cools, the rest of the plan draws out
      const k = sstep(tFloor - 0.15, tFloor + 0.75, t);
      for (const m of greys) m.userData.grey.value = k;
      floorGlow.value = 0.6 * k;
      U.uPlan.value = (p.plan ?? 1.4) * k;
      U.uP.value = s + (total - s) * ss(clamp((t - tFloor) / 1.2));
      U.uLine.value = 0.9 + 0.8 * k;
      U.uSwath.value = 0.1 + 0.08 * k;
      sun.intensity = (p.sun ?? 3.2) * (1 - 0.35 * k);
    },
  };
}
