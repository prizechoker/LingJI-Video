// E38: humanoid robots in the spotlight.
// p.mode: 'stage' — the Spring Festival Gala: a row of robots dancing in unison on a red-lit stage before an LED wall.
//         'race'  — a half marathon: the robot running for the finish; at cue "win" (跑赢了) the moment freezes.
import { Studio, THREE, spot } from '../engine2/core.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { botMaterials } from '../engine2/bot.js';
import { loadBotRig, setPose, runPose, gait } from '../engine2/botrig.js';
import { ss, sstep, clamp, lerp, breathe, grade, caption, text, title, FONT, V3, rng } from './lib/kit.js';

function rigClone(src) {
  const holder = cloneSkinned(src.holder);
  const bones = {};
  holder.traverse((o) => {
    if (o.isBone) {
      bones[o.name] = o;
      o.userData.restQ = src.bones[o.name].userData.restQ.clone();
      o.userData.restP = src.bones[o.name].userData.restP.clone();
    }
    if (o.isMesh) o.frustumCulled = false;
  });
  const rig = { ...src, holder, bones };
  rig.setPose = (p) => setPose(rig, p);
  return rig;
}

// a dance in unison: arms swing up and out in turn on a 2-beat, knees bounce, the torso turns into the raised arm
function dancePose(t, k) {
  const beat = t * 2.1 + k * 0.0;
  const s = Math.sin(beat * Math.PI), c = Math.cos(beat * Math.PI);
  const up = (x) => Math.max(0, x);
  return {
    root: { pos: [0.02 * s, -0.035 + 0.025 * Math.abs(c), 0], rot: [0.04, 0.18 * s, 0.03 * s] },
    spine: [0.02, 0.1 * s, 0.02 * s], chest: [0.0, 0.08 * s, 0], head: [-0.05, -0.12 * s, 0],
    armL: { shoulder: [0.2 + 2.0 * ss(up(s)), 0.0, 0.18 + 0.5 * ss(up(s))], elbow: 0.35 - 0.2 * up(s), wrist: [0.1, 0, 0], fingers: -0.15, spread: 0.6 },
    armR: { shoulder: [0.2 + 2.0 * ss(up(-s)), 0.0, 0.18 + 0.5 * ss(up(-s))], elbow: 0.35 - 0.2 * up(-s), wrist: [0.1, 0, 0], fingers: -0.15, spread: 0.6 },
    legL: { hip: [0.12 + 0.08 * Math.abs(c), 0.05, 0.06], knee: 0.22 + 0.14 * Math.abs(c), ankle: [0.08, 0, 0] },
    legR: { hip: [0.12 + 0.08 * Math.abs(c), 0.05, 0.06], knee: 0.22 + 0.14 * Math.abs(c), ankle: [0.08, 0, 0] },
  };
}

function ledWall() {
  const cv = document.createElement('canvas');
  cv.width = 2048;
  cv.height = 640;
  const c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, 640);
  g.addColorStop(0, '#5a0606');
  g.addColorStop(0.55, '#c0160c');
  g.addColorStop(1, '#3a0303');
  c.fillStyle = g;
  c.fillRect(0, 0, 2048, 640);
  // gold fireworks / rays, and an LED pixel grid
  const R = rng(4);
  for (let k = 0; k < 9; k++) {
    const x = 120 + k * 230 + R() * 60, y = 140 + R() * 200, r = 60 + R() * 90;
    for (let a = 0; a < 28; a++) {
      const th = (a / 28) * Math.PI * 2;
      const gr = c.createLinearGradient(x, y, x + Math.cos(th) * r, y + Math.sin(th) * r);
      gr.addColorStop(0, 'rgba(255,220,140,0.0)');
      gr.addColorStop(1, 'rgba(255,214,120,0.85)');
      c.strokeStyle = gr;
      c.lineWidth = 3;
      c.beginPath(); c.moveTo(x + Math.cos(th) * r * 0.3, y + Math.sin(th) * r * 0.3); c.lineTo(x + Math.cos(th) * r, y + Math.sin(th) * r); c.stroke();
    }
  }
  c.fillStyle = 'rgba(0,0,0,0.35)';
  for (let x = 0; x < 2048; x += 8) c.fillRect(x, 0, 2, 640);
  for (let y = 0; y < 640; y += 8) c.fillRect(0, y, 2048, 2);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export async function create({ renderer, scale, p, cues, dur }) {
  const st = new Studio({ scale, renderer });
  const mode = p.mode || 'stage';
  const mats = botMaterials({ envDiffuse: 0.45, white: 0xdcdfe3 });
  if (mode === 'stage') {
    const env = await st.hdri('../assets/hdri/studio_small_09_2k.hdr', { intensity: 0.25, rotation: 0.6 });
    st.scene.background = new THREE.Color(0x080202);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshPhysicalMaterial({ color: 0x08080a, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.06, envMap: env, envMapIntensity: 0.04 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    st.scene.add(floor);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(16, 5), new THREE.MeshBasicMaterial({ map: ledWall(), color: new THREE.Color(1.3, 1.3, 1.3), toneMapped: false }));
    wall.position.set(0, 2.5, -4.5);
    st.scene.add(wall);
    const src = await loadBotRig(st, { mats });
    const rigs = [src];
    for (let k = 1; k < 7; k++) rigs.push(rigClone(src));
    rigs.forEach((r, k) => {
      r.holder.position.set((k - 3) * 0.95, 0, -0.18 * (k - 3) ** 2);
      st.scene.add(r.holder);
    });
    const keys = [];
    for (let k = 0; k < 4; k++) {
      const l = spot(k % 2 ? 0xff3a22 : 0xffb070, 60, { pos: [(k - 1.5) * 2.6, 6, 3.5], target: [(k - 1.5) * 1.6, 0.8, 0], angle: 0.32, penumbra: 0.7, radius: 6, near: 2, far: 12, shadow: k === 1 ? 2048 : 0 });
      st.scene.add(l, l.target);
      keys.push(l);
    }
    const front = spot(0xfff0e0, 14, { pos: [0, 3.2, 7], target: [0, 1.0, 0], angle: 0.35, penumbra: 1, shadow: 0 });
    st.scene.add(front, front.target);
    grade(st, { ao: { radius: 0.08, intensity: 0.8 }, bloom: { intensity: 0.6, threshold: 0.75, radius: 0.85 }, vignette: 0.6, contrast: 0.12, saturation: 0.08, exposure: 0.95 });
    return {
      studio: st,
      update(t) {
        rigs.forEach((r, k) => r.setPose(dancePose(t, k)));
        keys.forEach((l, k) => { l.intensity = 60 * (0.75 + 0.25 * Math.sin(t * 3 + k * 1.7)); });
        const k = ss(clamp(t / dur));
        const b = breathe(t, 0.01, 3);
        st.camera.position.set(lerp(-1.1, 0.8, k) + b[0], 1.05 + b[1], lerp(5.6, 5.0, k) + b[2]);
        st.camera.lookAt(0, 1.05, -0.6);
        if (st.camera.fov !== 32) { st.camera.fov = 32; st.camera.updateProjectionMatrix(); }
      },
      overlay(g, t) {
        caption(g, 150, 820, { en: 'SPRING FESTIVAL GALA', zh: '春晚舞台', a: sstep(0.3, 0.9, t) * (1 - sstep(dur - 0.4, dur, t)), color: [255, 222, 190], zhSize: 28, rule: 110 });
      },
    };
  }

  // ---------------------------------------------------------------- race
  await st.hdri('../assets/hdri/potsdamer_platz_2k.hdr', { intensity: 0.9, rotation: p.rot ?? 5.0, background: { blur: 0.05, intensity: 0.7 } });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(14, 80), new THREE.MeshPhysicalMaterial({ ...st.pbr('Concrete034', { repeat: [10, 56] }), color: 0x2c2e31, roughness: 0.92, normalScale: new THREE.Vector2(0.25, 0.25) }));
  road.rotation.x = -Math.PI / 2;
  road.receiveShadow = true;
  st.scene.add(road);
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f2ef, roughness: 0.7 });
  const finishZ = 0;
  const line = new THREE.Mesh(new THREE.PlaneGeometry(8, 0.3), white);
  line.rotation.x = -Math.PI / 2;
  line.position.set(0, 0.002, finishZ);
  st.scene.add(line);
  for (const x of [-4, 4]) {
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 80), white);
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(x, 0.002, 0);
    st.scene.add(edge);
  }
  // the finish gantry: two truss towers and a banner
  const truss = new THREE.MeshPhysicalMaterial({ color: 0xc9ccd1, metalness: 1, roughness: 0.3 });
  for (const x of [-4.4, 4.4]) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.35, 4.2, 0.35), truss);
    col.position.set(x, 2.1, finishZ);
    col.castShadow = true;
    st.scene.add(col);
  }
  const bcv = document.createElement('canvas');
  bcv.width = 2048; bcv.height = 256;
  const bc = bcv.getContext('2d');
  bc.fillStyle = '#0d3a8a'; bc.fillRect(0, 0, 2048, 256);
  bc.fillStyle = '#ffffff'; bc.font = `700 150px ${FONT.sans}`; bc.textAlign = 'center'; bc.textBaseline = 'middle';
  bc.fillText('FINISH  终点', 1024, 132);
  const btex = new THREE.CanvasTexture(bcv);
  btex.colorSpace = THREE.SRGBColorSpace;
  const banner = new THREE.Mesh(new THREE.BoxGeometry(9.0, 1.1, 0.12), [truss, truss, truss, truss, new THREE.MeshStandardMaterial({ map: btex, roughness: 0.6 }), new THREE.MeshStandardMaterial({ map: btex, roughness: 0.6 })]);
  banner.position.set(0, 4.0, finishZ);
  banner.castShadow = true;
  st.scene.add(banner);
  // barriers along the course
  const barMat = new THREE.MeshStandardMaterial({ color: 0x1d4fa8, roughness: 0.6 });
  for (const x of [-4.6, 4.6]) for (let z = -30; z < 12; z += 2.2) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, 2.0), barMat);
    b.position.set(x, 0.5, z);
    b.castShadow = b.receiveShadow = true;
    st.scene.add(b);
  }
  const rig = await loadBotRig(st, { mats });
  st.scene.add(rig.holder);
  const sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
  sun.position.set(-6, 9, 4);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 30 });
  sun.shadow.radius = 3;
  st.scene.add(sun, sun.target);
  grade(st, { ao: { radius: 0.1, intensity: 0.8 }, dof: { distance: 4, range: 2.5, bokeh: 3 }, bloom: { intensity: 0.25, threshold: 0.95 }, vignette: 0.5, contrast: 0.08, exposure: 1.0 });
  const G = gait('run');
  const tWin = cues.win ?? dur * 0.65;
  // phase chosen so the frozen frame is the mid-flight stride exactly at the cue, as the robot breaks the line
  const phase0 = 0.42 - tWin / G.cycle;
  const zAt = (t) => finishZ - 0.15 + (Math.min(t, tWin) - tWin) * G.speed;
  return {
    studio: st,
    update(t) {
      const tt = Math.min(t, tWin);
      rig.setPose(runPose(phase0 + tt / G.cycle));
      rig.holder.position.set(-0.6, 0, zAt(t));
      const frozen = t >= tWin;
      // a tracking camera beside the runner; after the freeze it creeps in
      const z = zAt(t);
      const k = sstep(tWin, dur, t);
      const b = frozen ? [0, 0, 0] : breathe(t, 0.02, 3);
      st.camera.position.set(-4.0 + 0.9 * k + b[0], 1.05 + b[1], z + 1.8 - 0.4 * k + b[2]);
      st.camera.lookAt(-0.6, 0.95, z + 0.3);
      if (st.camera.fov !== 30) { st.camera.fov = 30; st.camera.updateProjectionMatrix(); }
      if (st.dof) st.dof.target = V3(-0.6, 1.0, z);
    },
    overlay(g, t) {
      const a = sstep(tWin, tWin + 0.15, t);
      if (a <= 0.001) return;
      // the freeze: a white flash, then a frame line
      const fl = Math.exp(-(t - tWin) / 0.12) * 0.5;
      g.save();
      g.fillStyle = `rgba(255,255,255,${fl})`;
      g.fillRect(0, 0, 1920, 1080);
      g.strokeStyle = `rgba(255,255,255,${0.5 * a})`;
      g.lineWidth = 2;
      g.strokeRect(60, 60, 1800, 960);
      g.restore();
      caption(g, 150, 820, { en: 'HALF MARATHON · 21.0975 KM', zh: '半程马拉松', a, color: [236, 240, 246], zhSize: 28, rule: 110 });
    },
  };
}
