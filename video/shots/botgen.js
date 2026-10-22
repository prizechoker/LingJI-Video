// E36: "改不了世界，那就改机器人" — the robot first as a drawing in light (glowing contour lines around its form, a
// design being worked out), then a scan plane rises through it (from cue "robot") and leaves the real machine behind.
import { Studio, THREE, spot } from '../engine2/core.js';
import { loadBot, botMaterials } from '../engine2/bot.js';
import { ss, sstep, clamp, lerp, breathe, grade, V3 } from './lib/kit.js';

function contourMaterial(clip) {
  return new THREE.ShaderMaterial({
    uniforms: { uSpacing: { value: 0.014 }, uColor: { value: new THREE.Color(0x7fd2ff) }, uA: { value: 1 } },
    vertexShader: `
      #include <clipping_planes_pars_vertex>
      varying vec3 vW; varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - w.xyz);
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <clipping_planes_vertex>
      }`,
    fragmentShader: `
      #include <clipping_planes_pars_fragment>
      uniform float uSpacing; uniform vec3 uColor; uniform float uA;
      varying vec3 vW; varying vec3 vN; varying vec3 vV;
      void main() {
        #include <clipping_planes_fragment>
        float f = vW.y / uSpacing;
        float d = abs(fract(f) - 0.5);
        float w = fwidth(f);
        float line = 1.0 - smoothstep(w * 0.6, w * 1.6, 0.5 - d);
        float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
        float a = (line * 0.95 + rim * 0.22) * uA;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor * a * 1.4, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide, clipping: true, clippingPlanes: [clip],
  });
}

export async function create({ renderer, scale, p, cues, dur }) {
  renderer.localClippingEnabled = true;
  const st = new Studio({ scale, renderer });
  const env = await st.hdri('../assets/hdri/studio_small_09_2k.hdr', { intensity: 0.3, rotation: 0.6 });
  st.scene.background = new THREE.Color(0x020306);
  const tex = st.pbr('Concrete034', { repeat: [24, 24] });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 96), new THREE.MeshStandardMaterial({ ...tex, color: 0x4a5058, roughness: 0.8, normalScale: new THREE.Vector2(0.25, 0.25), envMap: env, envMapIntensity: 0.02 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  st.scene.add(floor);
  // the solid robot shows below the scan plane, the drawing above it
  const below = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  const above = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const mats = botMaterials({ envDiffuse: 0.35, white: 0xd9dce0 });
  for (const m of [mats.body, mats.head]) m.clippingPlanes = [below];
  const r = await loadBot(st, { mats });
  r.holder.rotation.y = 0.35;
  st.scene.add(r.holder);
  const lines = [];
  const cmat = contourMaterial(above);
  r.holder.traverse((o) => {
    if (!o.isMesh) return;
    const m = new THREE.Mesh(o.geometry, cmat);
    m.matrixAutoUpdate = false;
    lines.push([o, m]);
  });
  for (const [, m] of lines) st.scene.add(m);
  // the scan plane: a soft disc of light at the cut
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.55, 96), new THREE.ShaderMaterial({
    uniforms: { uA: { value: 0 } },
    vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform float uA; varying vec2 vU; void main(){ float r = length(vU - 0.5) * 2.0; float a = (1.0 - smoothstep(0.0, 1.0, r)) * uA; gl_FragColor = vec4(vec3(0.5,0.8,1.0) * a, 1.0); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  disc.rotation.x = -Math.PI / 2;
  st.scene.add(disc);

  const top = spot(0xf3f6ff, 70, { pos: [0.25, 4.8, 1.0], target: [0, 0.85, 0], angle: 0.3, penumbra: 0.9, radius: 10, near: 2, far: 9, shadow: 2048 });
  const rimL = spot(0xd4e2ff, 26, { pos: [-1.7, 2.7, -2.4], target: [0, 1.15, 0], angle: 0.42, penumbra: 1, shadow: 0 });
  const rimR = spot(0xffffff, 18, { pos: [1.9, 2.3, -2.3], target: [0, 1.05, 0], angle: 0.42, penumbra: 1, shadow: 0 });
  const fill = spot(0xffffff, 4, { pos: [-1.4, 1.5, 3.2], target: [0, 1.0, 0], angle: 0.55, penumbra: 1, shadow: 0 });
  for (const l of [top, rimL, rimR, fill]) st.scene.add(l, l.target);
  grade(st, { ao: { radius: 0.05, intensity: 0.7 }, bloom: { intensity: 0.5, threshold: 0.6, radius: 0.8 }, vignette: 0.62, contrast: 0.1, saturation: -0.06, exposure: 1.0 });

  const tR = cues.robot ?? dur * 0.45;
  const H = 1.82;
  return {
    studio: st,
    update(t) {
      // the scan rises from the floor to above the head over ~2 s from the cue
      const k = clamp((t - tR) / 2.0);
      const h = lerp(-0.02, H, ss(k));
      below.constant = h;
      above.constant = -h;
      disc.position.y = h;
      disc.material.uniforms.uA.value = 0.55 * sstep(-0.05, 0.05, k) * (1 - sstep(0.85, 1, k));
      // the drawing: lines appear upward at the start, glow steadily, fade once solid
      cmat.uniforms.uA.value = sstep(0, 1.0, t) * (1 - 0.4 * sstep(0.9, 1, k));
      for (const [o, m] of lines) { o.updateMatrixWorld(); m.matrix.copy(o.matrixWorld); }
      const lit = sstep(tR - 0.2, tR + 1.6, t);
      top.intensity = 70 * lit;
      fill.intensity = 4 * lit;
      rimL.intensity = 26 * (0.3 + 0.7 * lit);
      st.scene.environmentIntensity = lerp(0.05, 0.3, lit);
      // a slow orbit
      const a = lerp(-0.5, 0.35, ss(clamp(t / dur)));
      const dist = lerp(4.4, 3.9, ss(clamp(t / dur)));
      const b = breathe(t, 0.004, 3);
      st.camera.position.set(Math.sin(a) * dist + b[0], 1.05 + b[1], Math.cos(a) * dist + b[2]);
      st.camera.lookAt(0, 0.9, 0);
      if (st.camera.fov !== 26) { st.camera.fov = 26; st.camera.updateProjectionMatrix(); }
    },
    dispose() { renderer.localClippingEnabled = false; },
  };
}
