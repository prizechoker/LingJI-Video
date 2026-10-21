// WebGL layer (three.js) for the few true-3D elements: the hand and go stones.
// Rendered to its own transparent canvas, then composited into the 2D stage.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { W, H } from './stage.js';

export { THREE };

let layer = null;

export class ThreeLayer {
  constructor(scale) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(W * scale);
    this.canvas.height = Math.round(H * scale);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, preserveDrawingBuffer: true, premultipliedAlpha: false });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(this.canvas.width, this.canvas.height, false);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.assets = {};
  }

  async load() {
    const loader = new GLTFLoader();
    const g = await loader.loadAsync('../assets/models/hand_right.glb');
    this.assets.handRight = g.scene;
  }

  cloneHand() {
    return SkeletonUtils.clone(this.assets.handRight);
  }

  render(scene, camera) {
    this.renderer.clear();
    this.renderer.render(scene, camera);
    return this.canvas;
  }
}

export async function getThree(scale) {
  if (!layer) {
    layer = new ThreeLayer(scale);
    await layer.load();
  }
  return layer;
}
export const three = () => layer;

// Dark body with a warm fresnel rim: reads as a hand "drawn with light".
export function rimMaterial({ base = 0x0d0907, rim = 0xffb36b, rimPower = 2.2, rimStrength = 1.6, key = 0.35 } = {}) {
  const m = new THREE.MeshStandardMaterial({ color: base, roughness: 0.55, metalness: 0.0 });
  m.userData.uniforms = { rimColor: { value: new THREE.Color(rim) }, rimPower: { value: rimPower }, rimStrength: { value: rimStrength }, opacityMul: { value: 1 } };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, m.userData.uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 rimColor; uniform float rimPower; uniform float rimStrength; uniform float opacityMul;`)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec3 Vv = normalize(vViewPosition);
          float fr = pow(1.0 - clamp(abs(dot(normal, Vv)), 0.0, 1.0), rimPower);
          totalEmissiveRadiance += rimColor * fr * rimStrength;
        }`,
      )
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n gl_FragColor.a *= opacityMul;');
  };
  m.transparent = true;
  return m;
}

// Projector from a three camera into 1920x1080 stage coordinates (for 2D lines that live in the 3D scene).
export function projector(camera) {
  const v = new THREE.Vector3();
  return (x, y, z) => {
    v.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    const depth = -v.z;
    v.applyMatrix4(camera.projectionMatrix);
    return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H, z: depth, visible: depth > 0 };
  };
}

// Render a three scene and composite it into the 2D stage (with a share sent to the bloom layer).
export function render3(pen, scene, camera, { glow = 0.5, a = 1 } = {}) {
  const cv = layer.render(scene, camera);
  pen.main.save();
  pen.main.globalAlpha *= a;
  pen.main.drawImage(cv, 0, 0, W, H);
  pen.main.restore();
  if (glow > 0) {
    pen.glow.save();
    pen.glow.globalAlpha *= glow * a;
    pen.glow.drawImage(cv, 0, 0, W, H);
    pen.glow.restore();
  }
}

// Generic rim-lit material for props: dark body, coloured fresnel edge.
export function propMaterial({ base = 0x0a0f16, rim = 0x7cc8ff, rimPower = 2.2, rimStrength = 2.0, emissive = 0x000000, opacity = 1 } = {}) {
  // flat faces get uniform fresnel, so keep the body dark and let edge lines carry the form
  const m = new THREE.MeshStandardMaterial({ color: base, roughness: 0.55, metalness: 0.1, emissive, transparent: opacity < 1, opacity });
  const u = { rimColor: { value: new THREE.Color(rim) }, rimPower: { value: rimPower }, rimStrength: { value: rimStrength } };
  m.userData.u = u;
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 rimColor; uniform float rimPower, rimStrength;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        { vec3 Vv = normalize(vViewPosition);
          float fr = pow(1.0 - clamp(abs(dot(normal, Vv)), 0.0, 1.0), rimPower);
          totalEmissiveRadiance += rimColor * fr * rimStrength; }`,
      );
  };
  return m;
}

// Thin edge lines for a mesh (technical drawing look)
export function edges(mesh, color = 0x9fd6ff, opacity = 0.35, threshold = 25) {
  const g = new THREE.EdgesGeometry(mesh.geometry, threshold);
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
  mesh.add(l);
  return l;
}
