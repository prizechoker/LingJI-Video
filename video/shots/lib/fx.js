// Atmosphere: a fake volumetric light cone (haze lit by a spot light) and slowly drifting dust motes in it.
import { THREE } from '../../engine2/core.js';
import { rng } from './kit.js';

// a cone of lit haze from `apex` down to `target`, spreading to `radius` there. Additive, no depth write.
export function lightCone({ apex, target, radius, color = 0xffd2a0, intensity = 0.08, noise = 0.35 }) {
  const a = new THREE.Vector3(...apex), b = new THREE.Vector3(...target);
  const h = a.distanceTo(b);
  const geo = new THREE.ConeGeometry(radius, h, 64, 24, true);
  geo.translate(0, -h / 2, 0); // apex at the origin, opening toward -y
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uI: { value: intensity }, uR: { value: radius }, uH: { value: h }, uNoise: { value: noise }, uT: { value: 0 } },
    vertexShader: `
      varying vec3 vL; varying vec3 vN; varying vec3 vV;
      void main() {
        vL = position;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uI; uniform float uR; uniform float uH; uniform float uNoise; uniform float uT;
      varying vec3 vL; varying vec3 vN; varying vec3 vV;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        float along = clamp(-vL.y / uH, 0.0, 1.0);
        // edge-on parts of the surface are where the line of sight crosses most of the cone: soft rim falloff
        float facing = abs(dot(normalize(vN), normalize(vV)));
        float body = pow(facing, 1.6);
        float fade = smoothstep(0.0, 0.18, along) * (1.0 - smoothstep(0.75, 1.0, along));
        float ang = atan(vL.z, vL.x);
        float n = vnoise(vec2(ang * 3.0, along * 6.0 - uT * 0.05)) * 0.6 + vnoise(vec2(ang * 9.0, along * 17.0 + uT * 0.03)) * 0.4;
        float k = body * fade * (1.0 - uNoise + uNoise * n);
        gl_FragColor = vec4(uColor * uI * k, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(a);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), b.clone().sub(a).normalize());
  m.renderOrder = 5;
  m.frustumCulled = false;
  m.userData.tick = (t) => { mat.uniforms.uT.value = t; };
  return m;
}

// dust motes drifting slowly inside a cone (only those in the light are bright)
export function dustMotes({ apex, target, radius, n = 400, size = 0.0016, color = 0xffe2c0, intensity = 1.2, seed = 3 }) {
  const a = new THREE.Vector3(...apex), b = new THREE.Vector3(...target);
  const R = rng(seed);
  const axis = b.clone().sub(a);
  const h = axis.length();
  axis.normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), axis);
  const base = [], vel = [];
  for (let k = 0; k < n; k++) {
    const u = 0.25 + R() * 0.7;
    const rr = Math.sqrt(R()) * radius * u;
    const th = R() * Math.PI * 2;
    base.push(new THREE.Vector3(Math.cos(th) * rr, -u * h, Math.sin(th) * rr).applyQuaternion(q).add(a));
    vel.push(new THREE.Vector3((R() - 0.5) * 0.01, (R() - 0.6) * 0.006, (R() - 0.5) * 0.01));
  }
  const geo = new THREE.SphereGeometry(1, 6, 4);
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.frustumCulled = false;
  const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), s = new THREE.Vector3(), qq = new THREE.Quaternion();
  const sizes = base.map(() => size * (0.4 + R() * 1.2));
  mesh.userData.tick = (t) => {
    for (let k = 0; k < n; k++) {
      p.copy(base[k]).addScaledVector(vel[k], t);
      p.x += 0.004 * Math.sin(t * 0.3 + k);
      p.z += 0.004 * Math.cos(t * 0.27 + k * 1.3);
      s.setScalar(sizes[k]);
      m4.compose(p, qq, s);
      mesh.setMatrixAt(k, m4);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  mesh.userData.tick(0);
  return mesh;
}
