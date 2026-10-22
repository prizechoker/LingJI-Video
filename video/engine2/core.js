// Realistic renderer: physically based materials, HDRI image-based lighting, soft shadows, ambient occlusion,
// depth of field, bloom and a filmic grade. Every frame is a pure function of time, like engine v1.
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  EffectComposer, RenderPass, EffectPass, BloomEffect, DepthOfFieldEffect, VignetteEffect, ToneMappingEffect,
  ToneMappingMode, SMAAEffect, SMAAPreset, HueSaturationEffect, BrightnessContrastEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';

export { THREE };
export const W = 1920;
export const H = 1080;

export class Studio {
  constructor({ scale = 1, shadows = 'pcfsoft' } = {}) {
    this.scale = scale;
    this.w = Math.round(W * scale);
    this.h = Math.round(H * scale);
    const r = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, stencil: false, powerPreference: 'high-performance' });
    r.setPixelRatio(1);
    r.setSize(this.w, this.h, false);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping; // tone mapping happens in the post chain (AgX)
    r.toneMappingExposure = 1;
    r.shadowMap.enabled = true;
    r.shadowMap.type = shadows === 'vsm' ? THREE.VSMShadowMap : THREE.PCFSoftShadowMap;
    this.renderer = r;
    this.canvas = r.domElement;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, W / H, 0.01, 80);
    this.textures = new THREE.TextureLoader();
    this.gltf = new GLTFLoader();
  }

  async hdri(url, { intensity = 1, rotation = 0, background = null } = {}) {
    const tex = await new RGBELoader().loadAsync(url);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    const pm = new THREE.PMREMGenerator(this.renderer);
    const env = pm.fromEquirectangular(tex).texture;
    pm.dispose();
    this.scene.environment = env;
    this.scene.environmentIntensity = intensity;
    this.scene.environmentRotation.set(0, rotation, 0);
    if (background) {
      // a blurred, dimmed photo background (reads as an out-of-focus real room)
      this.scene.background = tex;
      this.scene.backgroundBlurriness = background.blur ?? 0.3;
      this.scene.backgroundIntensity = background.intensity ?? 0.6;
      this.scene.backgroundRotation.set(0, rotation, 0);
    }
    return env;
  }

  // PBR texture set from assets/textures/<name>_{Color,NormalGL,Roughness}.jpg
  pbr(name, { repeat = [1, 1], rotation = 0 } = {}) {
    const base = `../assets/textures/${name}_`;
    const load = (k, srgb) => {
      const t = this.textures.load(`${base}${k}.jpg`);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat[0], repeat[1]);
      t.rotation = rotation;
      t.anisotropy = 8;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    return { map: load('Color', true), normalMap: load('NormalGL', false), roughnessMap: load('Roughness', false) };
  }

  post({ ao = { radius: 0.04, intensity: 2.2 }, dof = null, bloom = { intensity: 0.3, threshold: 0.9 }, vignette = 0.5,
    saturation = -0.02, contrast = 0.05, exposure = 1 } = {}) {
    this.renderer.toneMappingExposure = exposure;
    const c = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType });
    c.setSize(this.w, this.h, false);
    c.addPass(new RenderPass(this.scene, this.camera));
    if (ao) {
      const p = new N8AOPostPass(this.scene, this.camera, this.w, this.h);
      Object.assign(p.configuration, {
        aoRadius: ao.radius, distanceFalloff: ao.falloff ?? 0.6, intensity: ao.intensity, aoSamples: ao.samples ?? 16,
        denoiseSamples: 8, denoiseRadius: 10, halfRes: ao.halfRes ?? true, gammaCorrection: false,
      });
      c.addPass(p);
      this.aoPass = p;
    }
    if (dof) {
      this.dof = new DepthOfFieldEffect(this.camera, {
        worldFocusDistance: dof.distance, worldFocusRange: dof.range, bokehScale: dof.bokeh ?? 3, resolutionScale: dof.res ?? 0.5,
      });
      c.addPass(new EffectPass(this.camera, this.dof));
    }
    const fx = [];
    if (bloom) fx.push((this.bloom = new BloomEffect({ intensity: bloom.intensity, luminanceThreshold: bloom.threshold, luminanceSmoothing: 0.25, mipmapBlur: true, radius: bloom.radius ?? 0.75 })));
    fx.push(new ToneMappingEffect({ mode: ToneMappingMode.AGX }));
    fx.push(new HueSaturationEffect({ saturation }));
    fx.push(new BrightnessContrastEffect({ contrast }));
    if (vignette) fx.push(new VignetteEffect({ offset: 0.32, darkness: vignette }));
    c.addPass(new EffectPass(this.camera, ...fx));
    c.addPass(new EffectPass(this.camera, new SMAAEffect({ preset: SMAAPreset.HIGH })));
    this.composer = c;
    return c;
  }

  render() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}

// soft-edged pool of light on a surface, for "spotlight on the board" moods without a hard cutoff
export function spot(color, intensity, { pos, target, angle = 0.5, penumbra = 0.8, shadow = 2048, radius = 4, bias = -0.0002, near = 0.1, far = 6 }) {
  const l = new THREE.SpotLight(color, intensity, 0, angle, penumbra, 2);
  l.position.set(...pos);
  l.target.position.set(...target);
  if (shadow) {
    l.castShadow = true;
    l.shadow.mapSize.set(shadow, shadow);
    l.shadow.radius = radius;
    l.shadow.bias = bias;
    l.shadow.normalBias = 0.002;
    l.shadow.camera.near = near;
    l.shadow.camera.far = far;
  }
  return l;
}
