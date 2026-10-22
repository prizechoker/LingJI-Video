// Effects for the grid chapter: welding sparks (ballistic, bouncing, cooling from white to deep orange, drawn as
// motion-blurred streaks that stay at least ~1 px wide), the arc's blue-white flicker, a cheap haze cone, and a
// shader hook that drains the colour out of a material (for "everything but the floor goes grey").
// Everything is a pure function of time: sparks are born on a fixed schedule and integrated analytically.
import { THREE } from '../../engine2/core.js';

// integer hash -> [0, 1)
export function hash(...k) {
  let h = 2166136261 >>> 0;
  for (const v of k) {
    h ^= (v * 2654435761) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
    h ^= h >>> 16;
  }
  return (h >>> 0) / 4294967296;
}
// smooth 1-D value noise in [0, 1]
export function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return hash(i, seed) * (1 - u) + hash(i + 1, seed) * u;
}
// the arc's brightness: a fast, uneven flutter (per frame at 30-60 fps) with brief dropouts
export function arcFlicker(t, seed = 0) {
  const a = noise1(t * 37, seed) * 0.5 + noise1(t * 91, seed + 7) * 0.35 + noise1(t * 7, seed + 3) * 0.15;
  return 0.55 + 0.75 * a * a;
}

// blackbody-ish ramp for a cooling spark (0 = just born, 1 = dead): white -> yellow -> orange -> dull red
function sparkColor(u, out) {
  const k = [[0, [1.0, 0.97, 0.9]], [0.3, [1.0, 0.86, 0.55]], [0.55, [1.0, 0.56, 0.18]], [0.8, [0.85, 0.26, 0.05]], [1, [0.4, 0.06, 0.01]]];
  for (let i = 0; i < k.length - 1; i++) {
    if (u <= k[i + 1][0]) {
      const s = (u - k[i][0]) / (k[i + 1][0] - k[i][0]);
      for (let c = 0; c < 3; c++) out[c] = k[i][1][c] + (k[i + 1][1][c] - k[i][1][c]) * s;
      return out;
    }
  }
  return k[k.length - 1][1].slice();
}

// a spark field. emitters: [{ tip(b) -> Vector3 (where the spark is born at time b), on(b) -> 0..1 (welding?),
//   rate (sparks/s), seed, ground(x, z) -> y (optional), spread (0..1), dir: Vector3 (bias, optional) }]
export function sparkField({ max = 2400, gain = 30, shutter = 1 / 36, minPx = 1.3, scale = 1 } = {}) {
  const geo = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true).translate(0, -0.5, 0); // unit streak from 0 to -y
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  mesh.count = 0;
  const G = 9.81;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), v = new THREE.Vector3(), Yn = new THREE.Vector3(0, -1, 0), col = [0, 0, 0];
  const camP = new THREE.Vector3();
  // position + velocity of a spark tau seconds after birth, with up to two bounces
  // position + velocity of a spark tau seconds after birth, one lively bounce, then it skids and dies;
  // returns the time since its first touch-down (0 while still in the air)
  function flight(p0, v0, tau, ground, out, vout) {
    let x = p0.x, y = p0.y, z = p0.z, vx = v0.x, vy = v0.y, vz = v0.z, t = tau, landed = 0;
    for (let b = 0; b < 2; b++) {
      const gy = ground ? ground(x, z) : 0;
      const disc = vy * vy + 2 * G * (y - gy);
      const s = disc >= 0 ? (vy + Math.sqrt(disc)) / G : Infinity;
      if (t <= s) {
        out.set(x + vx * t, y + vy * t - 0.5 * G * t * t, z + vz * t);
        vout.set(vx, vy - G * t, vz);
        return landed;
      }
      x += vx * s; z += vz * s; y = gy + 0.001;
      const vyh = vy - G * s;
      vy = -0.28 * vyh; vx *= 0.5; vz *= 0.5;
      t -= s;
      landed += s;
      if (b === 1) break;
    }
    // skidding to a stop
    const k = Math.min(t, 0.25);
    out.set(x + vx * k * 0.5, (ground ? ground(x, z) : 0) + 0.002, z + vz * k * 0.5);
    vout.set(vx * (1 - k * 4), 0, vz * (1 - k * 4));
    return tau - t + 1e-3;
  }
  const p0 = new THREE.Vector3(), v0 = new THREE.Vector3();
  mesh.userData.update = (t, emitters, camera) => {
    camera.getWorldPosition(camP);
    const pxAngle = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / (camera.userData.pxH || 540);
    let n = 0;
    for (const e of emitters) {
      const rate = e.rate ?? 160, LIFE = 1.3;
      const k0 = Math.floor((t - LIFE) * rate), k1 = Math.floor(t * rate);
      for (let k = k0; k <= k1 && n < max; k++) {
        const b = (k + hash(k, e.seed, 1) * 0.9) / rate; // birth time
        if (b > t) continue;
        const tau = t - b;
        const life = 0.25 + 1.0 * hash(k, e.seed, 2) ** 1.5;
        if (tau > life) continue;
        const on = e.on(b);
        if (on <= 0.02 || hash(k, e.seed, 3) > on) continue;
        // launch: a hot spray, mostly sideways and up, some straight down
        const th = hash(k, e.seed, 4) * Math.PI * 2;
        const el = (hash(k, e.seed, 5) - 0.35) * Math.PI * 0.62 * (e.spread ?? 1);
        const sp = (0.8 + 4.2 * hash(k, e.seed, 6) ** 1.7) * (e.speed ?? 1);
        v0.set(Math.cos(th) * Math.cos(el), Math.sin(el), Math.sin(th) * Math.cos(el)).multiplyScalar(sp);
        if (e.dir) v0.addScaledVector(e.dir, sp * 0.5);
        p0.copy(e.tip(b));
        const touch = flight(p0, v0, tau * (e.slow ?? 1), e.ground, p, v);
        const speed = v.length();
        // once down a spark cools fast
        const u = Math.min(1, tau / life + (touch > 0 ? (tau - touch) * 2.5 : 0));
        if (u >= 1) continue;
        sparkColor(u, col);
        // streak length: the distance covered while the shutter is open (min a couple of mm)
        const len = Math.max(0.004 * scale, speed * shutter * (e.slow ?? 1));
        // keep at least ~minPx wide on screen, conserving energy
        const dist = p.distanceTo(camP);
        const wWorld = 0.0012 * scale;
        const wMin = dist * pxAngle * minPx;
        const w = Math.max(wWorld, wMin);
        const fade = (1 - u) ** 1.4 * (0.6 + 0.4 * hash(k, e.seed, 7));
        const energy = gain * fade * (wWorld / w) * (e.gain ?? 1);
        if (speed > 1e-4) q.setFromUnitVectors(Yn, v.clone().normalize());
        else q.identity();
        // the streak trails behind the spark: anchor its head at p, extending back along -v
        sc.set(w, len, w);
        m4.compose(p.clone().addScaledVector(v, speed > 1e-4 ? -len / speed : 0), q, sc);
        mesh.setMatrixAt(n, m4);
        mesh.instanceColor.setXYZ(n, col[0] * energy, col[1] * energy, col[2] * energy);
        n++;
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  };
  return mesh;
}

// bright little cores for the arcs (instanced spheres; colour set per frame)
export function arcCores(n, { radius = 0.012 } = {}) {
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false }), Math.max(1, n));
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * 3), 3);
  mesh.frustumCulled = false;
  mesh.count = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  mesh.userData.set = (list) => {
    // list: [{ p, k (0..), size }]
    let i = 0;
    for (const a of list) {
      if (a.k <= 0.01) continue;
      s.setScalar(radius * (a.size ?? 1) * (0.7 + 0.3 * a.k));
      m4.compose(a.p, q, s);
      mesh.setMatrixAt(i, m4);
      const c = a.color || [0.75, 0.88, 1.0];
      mesh.instanceColor.setXYZ(i, c[0] * a.k * 40, c[1] * a.k * 40, c[2] * a.k * 40);
      i++;
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  };
  return mesh;
}

// drain colour (and some light) out of a material on demand: mat.userData.grey.value = 0..1
export function greyable(mat, { dark = 0.55, tint = [0.62, 0.66, 0.72] } = {}) {
  const u = { uGrey: { value: 0 }, uGreyDark: { value: dark }, uGreyTint: { value: new THREE.Vector3(...tint) } };
  mat.userData.grey = u.uGrey;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (s, r) => {
    if (prev) prev(s, r);
    Object.assign(s.uniforms, u);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGrey; uniform float uGreyDark; uniform vec3 uGreyTint;')
      .replace('#include <opaque_fragment>', `
{
  float lum = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
  vec3 grey = vec3(lum) * uGreyTint * uGreyDark;
  outgoingLight = mix(outgoingLight, grey, uGrey);
}
#include <opaque_fragment>`);
  };
  const key = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  mat.customProgramCacheKey = () => `${key()}|greyable`;
  return mat;
}

// a cone of lit haze hanging under a fixture (additive, soft at the rim, fading toward the floor)
export function hazeCone({ apex, target, radius, color = 0xbcd6ff, intensity = 0.05 }) {
  const a = new THREE.Vector3(...apex), b = new THREE.Vector3(...target);
  const h = a.distanceTo(b);
  const geo = new THREE.ConeGeometry(radius, h, 48, 1, true).translate(0, -h / 2, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uI: { value: intensity }, uH: { value: h } },
    vertexShader: `varying vec3 vL; varying vec3 vN; varying vec3 vV;
      void main() { vL = position; vec4 w = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uI; uniform float uH; varying vec3 vL; varying vec3 vN; varying vec3 vV;
      void main() { float along = clamp(-vL.y / uH, 0.0, 1.0); float facing = abs(dot(normalize(vN), normalize(vV)));
        float k = pow(facing, 2.0) * smoothstep(0.0, 0.12, along) * (1.0 - smoothstep(0.55, 1.0, along));
        gl_FragColor = vec4(uColor * uI * k, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(a);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), b.clone().sub(a).normalize());
  m.renderOrder = 5;
  return m;
}

// many haze cones at once (one draw call): positions [[x, y, z], ...] of the apexes, all pointing straight down
export function hazeCones(apexes, { height = 9, radius = 2.2, color = 0xbcd6ff, intensity = 0.04 } = {}) {
  const geo = new THREE.ConeGeometry(radius, height, 32, 1, true).translate(0, -height / 2, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uI: { value: intensity }, uH: { value: height } },
    vertexShader: `varying vec3 vL; varying vec3 vN; varying vec3 vV; varying float vD;
      void main() { vL = position; mat4 M = modelMatrix;
        #ifdef USE_INSTANCING
          M = modelMatrix * instanceMatrix;
        #endif
        vec4 w = M * vec4(position, 1.0);
        vN = normalize(mat3(M) * normal); vV = normalize(cameraPosition - w.xyz); vD = length(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uI; uniform float uH; varying vec3 vL; varying vec3 vN; varying vec3 vV; varying float vD;
      void main() { float along = clamp(-vL.y / uH, 0.0, 1.0); float facing = abs(dot(normalize(vN), normalize(vV)));
        float k = pow(facing, 2.5) * smoothstep(0.0, 0.1, along) * (1.0 - smoothstep(0.35, 1.0, along)) * exp(-vD * 0.02);
        gl_FragColor = vec4(uColor * uI * k, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, apexes.length));
  m.count = apexes.length;
  const m4 = new THREE.Matrix4();
  apexes.forEach(([x, y, z], i) => m.setMatrixAt(i, m4.makeTranslation(x, y, z)));
  m.renderOrder = 5;
  m.frustumCulled = false;
  return m;
}

// light from many small sources (welding arcs) without real lights: a shader hook that adds a soft inverse-square
// diffuse term from up to N points to a material. Returns { add(material), set([{ p, k }]) }.
export function arcGlow(N = 12, { color = 0xc8dcff, power = 1.0, core = 0.25 } = {}) {
  const U = {
    uArcP: { value: Array.from({ length: N }, () => new THREE.Vector4(0, -100, 0, 0)) },
    uArcCol: { value: new THREE.Color(color).multiplyScalar(power) },
    uArcCore: { value: core },
  };
  const add = (mat) => {
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (s, r) => {
      if (prev) prev(s, r);
      Object.assign(s.uniforms, U);
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vArcW;')
        .replace('#include <project_vertex>', `#include <project_vertex>
{
  vec4 aw = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    aw = instanceMatrix * aw;
  #endif
  vArcW = (modelMatrix * aw).xyz;
}`);
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vArcW;\nuniform vec4 uArcP[${N}];\nuniform vec3 uArcCol;\nuniform float uArcCore;`)
        .replace('#include <opaque_fragment>', `
{
  vec3 nW = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
  vec3 acc = vec3(0.0);
  for (int k = 0; k < ${N}; k++) {
    vec4 A = uArcP[k];
    if (A.w <= 0.0) continue;
    vec3 L = A.xyz - vArcW;
    float d2 = dot(L, L);
    float lam = max(dot(nW, L * inversesqrt(max(d2, 1e-6))), 0.0);
    acc += A.w * lam / (d2 + uArcCore * uArcCore);
  }
  outgoingLight += diffuseColor.rgb * uArcCol * acc;
}
#include <opaque_fragment>`);
    };
    const key = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
    mat.customProgramCacheKey = () => `${key()}|arcglow${N}`;
    mat.needsUpdate = true;
    return mat;
  };
  const set = (list) => {
    for (let k = 0; k < N; k++) {
      const a = list[k];
      if (a && a.k > 0) U.uArcP.value[k].set(a.p.x, a.p.y, a.p.z, a.k);
      else U.uArcP.value[k].w = 0;
    }
  };
  return { add, set, uniforms: U };
}
