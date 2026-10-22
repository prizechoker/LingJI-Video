// The game-2 hall: the match table with the board, Lee Sedol's chair (White, -z) and Aja Huang's (Black, +z),
// AlphaGo's monitor at Aja's right, the game clock, a cup, broadcast cameras in the dark. Board space as in goset.js:
// board top at y = 0, the table top at y = -BOARD.h, the floor at y = FLOOR.
import { THREE } from '../../engine2/core.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { BOARD } from '../../engine2/goban.js';
import { poreNormal } from '../../engine2/materials.js';
import { buildGoSet, position } from './goset.js';
import { FONT } from './kit.js';

export const TABLE = { top: -BOARD.h, w: 1.25, d: 0.95, t: 0.045 };
export const FLOOR = TABLE.top - 0.74;
export const SEAT = { W: [0, -0.74], B: [0, 0.74] }; // chair positions (x, z)

const shadowed = (m) => { m.castShadow = m.receiveShadow = true; return m; };

function leather(color = 0x19181a) {
  const n = poreNormal().clone();
  n.repeat.set(26, 26);
  n.needsUpdate = true;
  return new THREE.MeshPhysicalMaterial({
    color, roughness: 0.48, normalMap: n, normalScale: new THREE.Vector2(0.45, 0.45), clearcoat: 0.25, clearcoatRoughness: 0.4,
    sheen: 0.4, sheenRoughness: 0.5, sheenColor: new THREE.Color(0x5a5250),
  });
}
const chrome = () => new THREE.MeshPhysicalMaterial({ color: 0xd8dade, metalness: 1, roughness: 0.16 });

// a high-backed leather executive chair, facing +z, seat centre over the origin, feet on y = 0
// a densely tessellated rounded box (so its faces can be shaped): front face (+z) bulged like a cushion, wrapped
// toward +z at the sides, with horizontal stitched grooves at the given heights (fractions of h from the bottom)
function cushion(w, h, d, r, { bulge = 0, curve = 0, grooves = [], groove = 0.006 } = {}) {
  const g = new THREE.BoxGeometry(w, h, d, 32, 40, 2);
  const p = g.attributes.position;
  const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
  const v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(Math.max(-hw, Math.min(hw, v.x)), Math.max(-hh, Math.min(hh, v.y)), Math.max(-hd, Math.min(hd, v.z)));
    v.sub(c).normalize().multiplyScalar(r).add(c);
    const ux = v.x / (w / 2), uy = v.y / (h / 2);
    const front = Math.max(0, v.z / (d / 2));
    let z = v.z + bulge * front * Math.max(0, 1 - ux * ux) ** 0.7 * Math.max(0, 1 - uy * uy) ** 0.7 + curve * ux * ux;
    for (const f of grooves) z -= groove * front * Math.exp(-(((v.y + h / 2) / h - f) ** 2) / 0.00018);
    p.setXYZ(i, v.x, v.y, z);
  }
  g.computeVertexNormals();
  return g;
}

export function buildChair({ color = 0x19181a } = {}) {
  const g = new THREE.Group();
  const lea = leather(color), metal = chrome();
  const seatY = 0.47;
  // seat: a domed cushion on a thin shell
  const seat = shadowed(new THREE.Mesh(cushion(0.52, 0.5, 0.08, 0.035, { bulge: 0.025, grooves: [0.5], groove: 0.004 }), lea));
  seat.rotation.x = -Math.PI / 2;
  seat.position.set(0, seatY, 0.0);
  g.add(seat);
  const shell = shadowed(new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.03, 0.48, 3, 0.012), new THREE.MeshPhysicalMaterial({ color: 0x0c0c0d, roughness: 0.5 })));
  shell.position.set(0, seatY - 0.05, 0);
  g.add(shell);
  // back: tall, wrapped around the sitter, three padded rolls and a headrest, leaning back
  const backPivot = new THREE.Group();
  backPivot.position.set(0, seatY + 0.03, -0.25);
  backPivot.rotation.x = -0.16;
  const back = shadowed(new THREE.Mesh(cushion(0.5, 0.9, 0.085, 0.035, { bulge: 0.025, curve: 0.06, grooves: [0.3, 0.58, 0.8], groove: 0.007 }), lea));
  back.position.set(0, 0.47, 0);
  backPivot.add(back);
  const backShell = shadowed(new THREE.Mesh(cushion(0.5, 0.9, 0.03, 0.012, { curve: 0.06 }), new THREE.MeshPhysicalMaterial({ color: 0x0c0c0d, roughness: 0.45, clearcoat: 0.2 })));
  backShell.position.set(0, 0.47, -0.05);
  backPivot.add(backShell);
  g.add(backPivot);
  // arms: a chrome loop from under the seat up to a leather pad and down to the back
  for (const s of [-1, 1]) {
    const x = s * 0.285;
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(s * 0.2, seatY - 0.05, 0.12), new THREE.Vector3(x, seatY + 0.02, 0.17), new THREE.Vector3(x, seatY + 0.18, 0.14),
      new THREE.Vector3(x, seatY + 0.2, 0.0), new THREE.Vector3(x, seatY + 0.19, -0.14), new THREE.Vector3(s * 0.25, seatY + 0.06, -0.24),
    ]);
    g.add(shadowed(new THREE.Mesh(new THREE.TubeGeometry(path, 64, 0.011, 16, false), metal)));
    const pad = shadowed(new THREE.Mesh(new RoundedBoxGeometry(0.065, 0.03, 0.27, 3, 0.013), lea));
    pad.position.set(x, seatY + 0.215, 0.0);
    g.add(pad);
  }
  // gas lift, star base, casters
  const lift = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.33, 32), metal));
  lift.position.y = 0.25;
  g.add(lift);
  const boot = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.12, 32), new THREE.MeshPhysicalMaterial({ color: 0x0c0c0d, roughness: 0.4 })));
  boot.position.y = 0.15;
  g.add(boot);
  const hub = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.05, 32), metal));
  hub.position.y = 0.1;
  g.add(hub);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.3;
    const path = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.1, 0), new THREE.Vector3(0.16, 0.085, 0), new THREE.Vector3(0.31, 0.06, 0)]);
    const leg = shadowed(new THREE.Mesh(new THREE.TubeGeometry(path, 24, 0.016, 12, false), metal));
    leg.rotation.y = -a;
    g.add(leg);
    const caster = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.022, 20), new THREE.MeshPhysicalMaterial({ color: 0x0d0d0e, roughness: 0.35 })));
    caster.rotation.z = Math.PI / 2;
    caster.position.set(Math.cos(a) * 0.32, 0.026, Math.sin(a) * 0.32);
    caster.rotation.y = -a;
    g.add(caster);
  }
  return g;
}

// AlphaGo's screen: the position, the last move marked, and (optionally) the next move pulsing
export function screenPainter(moves) {
  const cv = document.createElement('canvas');
  cv.width = 1280;
  cv.height = 720;
  const c = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  let last = '';
  const draw = (n, { next = false, pulse = 0, cursor = null } = {}) => {
    const sig = `${n}|${next}|${pulse.toFixed(2)}|${cursor ? cursor.map((v) => v.toFixed(2)).join(',') : ''}`;
    if (sig === last) return;
    last = sig;
    c.fillStyle = '#0d1117';
    c.fillRect(0, 0, 1280, 720);
    const B = 640, x0 = 60, y0 = 40, s = B / 19;
    c.fillStyle = '#d7b273';
    c.fillRect(x0, y0, B, B);
    c.strokeStyle = 'rgba(30,20,10,0.9)';
    c.lineWidth = 1.4;
    for (let k = 0; k < 19; k++) {
      c.beginPath(); c.moveTo(x0 + s / 2, y0 + s / 2 + k * s); c.lineTo(x0 + B - s / 2, y0 + s / 2 + k * s); c.stroke();
      c.beginPath(); c.moveTo(x0 + s / 2 + k * s, y0 + s / 2); c.lineTo(x0 + s / 2 + k * s, y0 + B - s / 2); c.stroke();
    }
    const P = (i, j) => [x0 + s / 2 + i * s, y0 + s / 2 + j * s];
    const stones = position(moves, n);
    for (const st of stones) {
      const [x, y] = P(st.i, st.j);
      const gr = c.createRadialGradient(x - s * 0.15, y - s * 0.15, 1, x, y, s * 0.5);
      if (st.c === 'B') { gr.addColorStop(0, '#555'); gr.addColorStop(1, '#0a0a0a'); } else { gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#cfcac0'); }
      c.fillStyle = gr;
      c.beginPath(); c.arc(x, y, s * 0.46, 0, Math.PI * 2); c.fill();
      if (st.n === n) {
        c.strokeStyle = st.c === 'B' ? '#fff' : '#000';
        c.lineWidth = 2.5;
        c.beginPath(); c.arc(x, y, s * 0.2, 0, Math.PI * 2); c.stroke();
      }
    }
    if (next && moves[n]) {
      const [, i, j] = moves[n];
      const [x, y] = P(i, j);
      c.shadowColor = 'rgba(255,60,50,0.9)';
      c.shadowBlur = 18 * pulse;
      c.strokeStyle = `rgba(255,70,60,${0.7 + 0.3 * pulse})`;
      c.lineWidth = 6;
      c.strokeRect(x - s * 0.5, y - s * 0.5, s, s);
      c.shadowBlur = 0;
    }
    // the side panel: the program's name and the move number
    c.fillStyle = '#e8edf3';
    c.font = `600 54px ${FONT.sans}`;
    c.fillText('AlphaGo', 760, 110);
    c.fillStyle = '#8a96a6';
    c.font = `500 26px ${FONT.mono}`;
    c.fillText('GOOGLE DEEPMIND', 762, 152);
    c.fillStyle = '#c9d3df';
    c.font = `500 34px ${FONT.mono}`;
    c.fillText(`MOVE ${next ? n + 1 : n}`, 762, 260);
    const [col, i, j] = moves[(next ? n : n - 1)] || ['B', 0, 0];
    const letters = 'ABCDEFGHJKLMNOPQRST';
    c.fillStyle = col === 'B' ? '#0a0a0a' : '#f2f2ee';
    c.strokeStyle = '#e8edf3';
    c.lineWidth = 3;
    c.beginPath(); c.arc(790, 326, 26, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#f2f4f7';
    c.font = `600 72px ${FONT.mono}`;
    c.fillText(`${letters[i]}${19 - j}`, 836, 350);
    c.fillStyle = 'rgba(120,140,160,0.35)';
    c.fillRect(762, 420, 440, 2);
    if (cursor) {
      c.fillStyle = '#ffffff';
      c.beginPath();
      const [cx, cy] = [x0 + cursor[0] * B, y0 + cursor[1] * B];
      c.moveTo(cx, cy); c.lineTo(cx + 18, cy + 30); c.lineTo(cx + 8, cy + 28); c.lineTo(cx + 2, cy + 40); c.closePath(); c.fill();
    }
    tex.needsUpdate = true;
  };
  return { canvas: cv, tex, draw };
}

// the game clock's two displays
export function clockPainter() {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 128;
  const c = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  let last = '';
  const fmt = (s) => {
    s = Math.max(0, Math.floor(s));
    return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  const draw = (left, right, running = 0) => {
    const a = fmt(left), b = fmt(right);
    const sig = `${a}|${b}|${running}`;
    if (sig === last) return;
    last = sig;
    c.fillStyle = '#20251f';
    c.fillRect(0, 0, 512, 128);
    for (const [k, str] of [[0, a], [1, b]]) {
      const x = k * 256;
      c.fillStyle = '#9fae8f';
      c.fillRect(x + 14, 16, 228, 96);
      c.fillStyle = 'rgba(20,26,18,0.92)';
      c.font = `500 60px ${FONT.mono}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(str, x + 128, 66);
      if (running === k + 1) {
        c.fillStyle = 'rgba(20,26,18,0.9)';
        c.beginPath(); c.arc(x + 228, 30, 6, 0, Math.PI * 2); c.fill();
      }
    }
    tex.needsUpdate = true;
  };
  return { tex, draw };
}

export async function buildHall(studio, { cameras = true } = {}) {
  RectAreaLightUniformsLib.init();
  const g = new THREE.Group();
  const set = await buildGoSet(studio, { table: false });
  g.add(set.group);
  // table: dark walnut, thick top with a softened edge, square legs
  const wood = studio.pbr('Wood027', { repeat: [1.5, 1] });
  const tmat = new THREE.MeshPhysicalMaterial({ ...wood, color: 0x8a6a56, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.38 });
  const top = shadowed(new THREE.Mesh(new RoundedBoxGeometry(TABLE.w, TABLE.t, TABLE.d, 4, 0.008), tmat));
  top.position.y = TABLE.top - TABLE.t / 2;
  g.add(top);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = shadowed(new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.7, 0.06, 2, 0.006), tmat));
    leg.position.set(sx * (TABLE.w / 2 - 0.08), TABLE.top - TABLE.t - 0.35, sz * (TABLE.d / 2 - 0.08));
    g.add(leg);
  }
  const apron = shadowed(new THREE.Mesh(new THREE.BoxGeometry(TABLE.w - 0.2, 0.08, TABLE.d - 0.2), tmat));
  apron.position.y = TABLE.top - TABLE.t - 0.04;
  g.add(apron);
  // floor: dark carpet
  const carpet = studio.pbr('Fabric082A', { repeat: [30, 30] });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({
    ...carpet, color: 0x2a2c33, roughness: 1, normalScale: new THREE.Vector2(0.6, 0.6),
  }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR;
  floor.receiveShadow = true;
  g.add(floor);
  // walls far behind each player: dark fabric panels with a soft wash
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.95 });
  for (const z of [-3.2, 3.2]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(12, 4), wallMat);
    w.position.set(0, FLOOR + 2, z);
    w.rotation.y = z > 0 ? Math.PI : 0;
    w.receiveShadow = true;
    g.add(w);
  }
  // chairs
  const chairs = {};
  for (const [c, [x, z]] of Object.entries(SEAT)) {
    const ch = buildChair({ color: c === 'W' ? 0x1d1a19 : 0x17181b });
    ch.position.set(x, FLOOR, z);
    ch.rotation.y = c === 'W' ? 0 : Math.PI; // Lee faces +z, Aja faces -z
    g.add(ch);
    chairs[c] = ch;
  }
  // the monitor at Aja's right (+x), on the table's corner, turned toward him
  const screen = screenPainter(set.moves);
  const mon = new THREE.Group();
  const bezelMat = new THREE.MeshPhysicalMaterial({ color: 0x0b0c0e, roughness: 0.35, clearcoat: 0.3 });
  const W = 0.6, Hh = 0.34;
  const body = shadowed(new THREE.Mesh(new RoundedBoxGeometry(W + 0.02, Hh + 0.02, 0.025, 3, 0.006), bezelMat));
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(W, Hh), new THREE.MeshBasicMaterial({ map: screen.tex, color: new THREE.Color(1.7, 1.7, 1.7), toneMapped: false }));
  panel.position.z = 0.0131;
  const neck = shadowed(new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.22, 0.03, 2, 0.008), bezelMat));
  neck.position.set(0, -Hh / 2 - 0.06, -0.035);
  const foot = shadowed(new THREE.Mesh(new RoundedBoxGeometry(0.24, 0.012, 0.16, 2, 0.005), bezelMat));
  foot.position.set(0, -Hh / 2 - 0.165, -0.02);
  const head = new THREE.Group();
  head.add(body, panel, neck, foot);
  head.position.y = Hh / 2 + 0.17;
  mon.add(head);
  mon.position.set(0.5, TABLE.top, 0.32);
  mon.lookAt(0.0, TABLE.top + 0.3, 1.0);
  g.add(mon);
  const glow = new THREE.RectAreaLight(0x9cc4ff, 6, W, Hh);
  glow.position.set(0, 0, 0.02);
  head.add(glow);
  // the game clock beside the board on Lee's left (-x), its sloped face toward the side and Aja
  const clock = clockPainter();
  const ck = new THREE.Group();
  const caseMat = new THREE.MeshPhysicalMaterial({ color: 0x2b211b, roughness: 0.4, clearcoat: 0.5 });
  const box = shadowed(new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.06, 0.09, 3, 0.01), caseMat));
  box.position.y = 0.03;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.045), new THREE.MeshBasicMaterial({ map: clock.tex }));
  face.position.set(0, 0.035, 0.0455);
  face.rotation.x = -0.25;
  for (const s of [-1, 1]) {
    const btn = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.01, 24), new THREE.MeshPhysicalMaterial({ color: 0x8b8f96, metalness: 0.8, roughness: 0.3 })));
    btn.position.set(s * 0.05, 0.065, 0);
    ck.add(btn);
  }
  ck.add(box, face);
  ck.position.set(-0.4, TABLE.top, 0.05);
  ck.rotation.y = -1.05;
  g.add(ck);
  // Lee's tea cup and saucer (white porcelain), at his right
  const porcelain = new THREE.MeshPhysicalMaterial({ color: 0xf3f1ec, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05 });
  const cupProf = [[0, 0], [0.024, 0], [0.026, 0.004], [0.03, 0.03], [0.036, 0.062], [0.0345, 0.063], [0.0285, 0.032], [0.022, 0.008], [0, 0.007]];
  const cup = shadowed(new THREE.Mesh(new THREE.LatheGeometry(cupProf.map(([r, y]) => new THREE.Vector2(r, y)), 64), porcelain));
  const saucer = shadowed(new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.05, 0.0], [0.07, 0.008], [0.072, 0.012], [0.068, 0.011], [0.05, 0.005], [0, 0.005]].map(([r, y]) => new THREE.Vector2(r, y)), 64), porcelain));
  cup.position.y = 0.005;
  const tea = new THREE.Mesh(new THREE.CircleGeometry(0.0315, 48), new THREE.MeshPhysicalMaterial({ color: 0x5a3a14, roughness: 0.05, clearcoat: 1 }));
  tea.rotation.x = -Math.PI / 2;
  tea.position.y = 0.05;
  const cupG = new THREE.Group();
  cupG.add(cup, saucer, tea);
  cupG.position.set(0.42, TABLE.top, -0.3);
  g.add(cupG);
  // broadcast cameras on tripods, in the dark at the room's edges
  const camsG = new THREE.Group();
  if (cameras) {
    const dark = new THREE.MeshPhysicalMaterial({ color: 0x15171a, roughness: 0.45, clearcoat: 0.2 });
    const tally = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
    for (const [x, z, ry] of [[-2.3, -1.6, 0.9], [2.4, 1.9, -2.4], [-2.1, 2.2, 2.5]]) {
      const c = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        const leg = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 1.45, 10), dark));
        leg.position.set(Math.cos(a) * 0.22, 0.68, Math.sin(a) * 0.22);
        leg.lookAt(0, 1.6, 0);
        leg.rotateX(Math.PI / 2);
        c.add(leg);
      }
      const bodyC = shadowed(new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.2, 0.42, 3, 0.02), dark));
      bodyC.position.y = 1.5;
      const lens = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.3, 24), dark));
      lens.rotation.x = Math.PI / 2;
      lens.position.set(0, 1.48, 0.33);
      const vf = shadowed(new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.08, 0.12, 2, 0.01), dark));
      vf.position.set(-0.1, 1.62, -0.12);
      const tl = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 8), tally);
      tl.position.set(0.05, 1.62, 0.2);
      c.add(bodyC, lens, vf, tl);
      c.position.set(x, FLOOR, z);
      c.rotation.y = ry;
      camsG.add(c);
    }
    g.add(camsG);
  }
  return { group: g, set, chairs, screen, monitor: mon, monitorHead: head, glow, clock, clockGroup: ck, cup: cupG, cams: camsG };
}
