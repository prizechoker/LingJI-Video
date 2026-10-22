// Fiducial floor codes (QR-like stickers, one per grid node): an atlas of 16 distinct codes drawn once, an
// instanced field of stickers, and a shader pulse that lights the codes' white modules (a scan sweeping the floor).
import { THREE } from '../../engine2/core.js';
import { rng } from './kit.js';

// a 4 x 4 atlas of 25-module stickers (21 x 21 QR-style code + 2-module quiet zone), 256 px each
let ATLAS = null;
export function codeAtlas() {
  if (ATLAS) return ATLAS;
  const S = 256, N = 4, M = 25, px = S / M;
  const c = document.createElement('canvas');
  c.width = c.height = S * N;
  const g = c.getContext('2d');
  const R = rng(4242);
  for (let k = 0; k < N * N; k++) {
    const ox = (k % N) * S, oy = Math.floor(k / N) * S;
    // sticker stock: warm-free white, faint grime toward the edges
    g.fillStyle = '#eef0f0';
    g.fillRect(ox, oy, S, S);
    const mods = [];
    for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) mods.push([x, y, R() < 0.48]);
    const finder = (fx, fy, x, y) => {
      const dx = x - fx, dy = y - fy;
      if (dx < 0 || dy < 0 || dx > 6 || dy > 6) return null;
      const r = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
      return r === 3 || r <= 1;
    };
    g.fillStyle = '#121416';
    for (const [x, y, on] of mods) {
      let v = on;
      for (const [fx, fy] of [[0, 0], [14, 0], [0, 14]]) {
        const f = finder(fx, fy, x, y);
        if (f !== null) v = f;
        // separators around the finders
        if (x >= fx - 1 && x <= fx + 7 && y >= fy - 1 && y <= fy + 7 && f === null) v = false;
      }
      if ((x === 6 && y > 7 && y < 13) || (y === 6 && x > 7 && x < 13)) v = (x + y) % 2 === 0;
      if (v) g.fillRect(ox + (x + 2) * px, oy + (y + 2) * px, Math.ceil(px), Math.ceil(px));
    }
    // a thin printed border and an orientation tick
    g.strokeStyle = 'rgba(20,22,24,0.55)';
    g.lineWidth = 2;
    g.strokeRect(ox + 3, oy + 3, S - 6, S - 6);
    // wear: scuffs and a few scratches
    for (let s = 0; s < 18; s++) {
      g.fillStyle = `rgba(90,92,92,${0.03 + R() * 0.06})`;
      const r = 6 + R() * 40;
      g.beginPath();
      g.ellipse(ox + R() * S, oy + R() * S, r, r * (0.3 + R() * 0.5), R() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 1;
    for (let s = 0; s < 4; s++) {
      g.beginPath();
      const x = ox + R() * S, y = oy + R() * S;
      g.moveTo(x, y);
      g.lineTo(x + (R() - 0.5) * 120, y + (R() - 0.5) * 30);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  ATLAS = t;
  return t;
}

// stickers at nodes [[x, z], ...]; size in metres. The material lights the white modules where a pulse passes:
// set({ origin: [x, z], radius, width, gain, after }) per frame; glow(x) for a per-node boost (e.g. under a robot).
export function codeField(nodes, { size = 0.2, seed = 7, gain = 6 } = {}) {
  const atlas = codeAtlas();
  const geo = new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2);
  const n = nodes.length;
  const R = rng(seed);
  const cell = new Float32Array(n * 2), boost = new Float32Array(n);
  for (let i = 0; i < n; i++) { const k = Math.floor(R() * 16); cell[i * 2] = k % 4; cell[i * 2 + 1] = 3 - Math.floor(k / 4); }
  geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cell, 2));
  const boostAttr = new THREE.InstancedBufferAttribute(boost, 1);
  geo.setAttribute('aBoost', boostAttr);
  const mat = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.45, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const U = {
    uPO: { value: new THREE.Vector2(0, 0) }, uPR: { value: -100 }, uPW: { value: 0.8 }, uPG: { value: 0 }, uPA: { value: 0 },
    uPCol: { value: new THREE.Color(0x7fd2ff) }, uBoostG: { value: gain },
  };
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, U);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aCell; attribute float aBoost; varying vec3 vCW; varying float vBoost;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = (uv + aCell) * 0.25;\n#endif')
      .replace('#include <project_vertex>', `#include <project_vertex>
{ vec4 w = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    w = instanceMatrix * w;
  #endif
  vCW = (modelMatrix * w).xyz; vBoost = aBoost; }`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCW; varying float vBoost;\nuniform vec2 uPO; uniform float uPR; uniform float uPW; uniform float uPG; uniform float uPA; uniform vec3 uPCol; uniform float uBoostG;')
      .replace('#include <opaque_fragment>', `
{
  float d = length(vCW.xz - uPO);
  float front = exp(-pow((d - uPR) / uPW, 2.0));
  float behind = smoothstep(uPR + 0.3, uPR - 0.6, d) * uPA;   // the wake: codes the pulse has passed stay faintly lit
  float white = smoothstep(0.35, 0.7, dot(diffuseColor.rgb, vec3(0.333)));
  outgoingLight += uPCol * white * (uPG * front + behind + uBoostG * vBoost);
}
#include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'codefield';
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
  nodes.forEach(([x, z], i) => {
    q.setFromAxisAngle(Y, Math.floor(R() * 4) * Math.PI / 2 + (R() - 0.5) * 0.04);
    p.set(x + (R() - 0.5) * 0.008, 0.0012, z + (R() - 0.5) * 0.008);
    mesh.setMatrixAt(i, m4.compose(p, q, sc));
  });
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  const set = ({ origin = [0, 0], radius = -100, width = 0.8, gain: g = 0, after = 0 } = {}) => {
    U.uPO.value.set(...origin);
    U.uPR.value = radius;
    U.uPW.value = width;
    U.uPG.value = g;
    U.uPA.value = after;
  };
  const glow = (f) => {
    for (let i = 0; i < n; i++) boost[i] = f(nodes[i][0], nodes[i][1], i);
    boostAttr.needsUpdate = true;
  };
  return { mesh, set, glow, uniforms: U };
}
