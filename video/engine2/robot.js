// The episode's home humanoid (original design, modelled by blender/build_robot.py). Materials come from the
// mesh-name prefix; posing goes through the J_<joint> nodes (rest pose: standing, arms down, facing +Z).
import { THREE } from './core.js';

export function robotMaterials(studio, { accent = 0x1f9fb0, light = 0xc6f2ff, accentLight = 0x45e3ef } = {}) {
  return {
    // pearl-white shell: a glossy lacquer over a slightly warm, satin base
    W: new THREE.MeshPhysicalMaterial({ color: 0xeceae5, roughness: 0.42, clearcoat: 0.45, clearcoatRoughness: 0.22, sheen: 0.12, sheenColor: new THREE.Color(0xffffff), sheenRoughness: 0.5 }),
    // anodised graphite joints and ribs
    G: new THREE.MeshPhysicalMaterial({ color: 0x2b2e33, metalness: 0.7, roughness: 0.32, clearcoat: 0.25, clearcoatRoughness: 0.25 }),
    // dark matte polymer: the waist core, vents
    D: new THREE.MeshPhysicalMaterial({ color: 0x18191c, roughness: 0.55, clearcoat: 0.15, clearcoatRoughness: 0.4 }),
    // signature teal paint
    A: new THREE.MeshPhysicalMaterial({ color: accent, roughness: 0.36, clearcoat: 0.5, clearcoatRoughness: 0.2 }),
    // brushed silver trim
    S: new THREE.MeshPhysicalMaterial({ color: 0xc4c8ce, metalness: 1, roughness: 0.24 }),
    // black glass face screen
    V: new THREE.MeshPhysicalMaterial({ color: 0x040506, roughness: 0.05, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.02, ior: 1.6, specularIntensity: 1 }),
    // rubber soles
    R: new THREE.MeshPhysicalMaterial({ color: 0x1d1e21, roughness: 0.75, sheen: 0.3, sheenColor: new THREE.Color(0x55585e), sheenRoughness: 0.6 }),
    // eye lights and teal indicator lights
    L: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(light), emissiveIntensity: 3.0, roughness: 0.3 }),
    T: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(accentLight), emissiveIntensity: 2.6, roughness: 0.3 }),
    P: new THREE.MeshPhysicalMaterial({ color: 0x232427, roughness: 0.82, sheen: 0.4, sheenColor: new THREE.Color(0x4d5056), sheenRoughness: 0.7 }),
  };
}

// white shell with dark tactile pads on the palm side, blended by a per-vertex mask (blender/build_robot.py)
function padded(white, { color = 0x26272a, roughness = 0.78 } = {}) {
  const m = white.clone();
  const u = { padColor: { value: new THREE.Color(color) }, padRough: { value: roughness } };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float padMask;\nvarying float vPad;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPad = padMask;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vPad;\nuniform vec3 padColor;\nuniform float padRough;')
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat padK = smoothstep( 0.35, 0.65, vPad );\ndiffuseColor.rgb = mix( diffuseColor.rgb, padColor, padK );')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix( roughnessFactor, padRough, padK );')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\nmaterial.clearcoat *= 1.0 - padK;');
  };
  m.customProgramCacheKey = () => 'padded';
  return m;
}

export async function loadRobot(studio, { url = '../assets/models/robot_home.glb', mats = robotMaterials(studio), shadows = true } = {}) {
  const g = await studio.gltf.loadAsync(url);
  const joints = {};
  const parts = {};
  mats.Wpad = mats.Wpad || padded(mats.W);
  g.scene.traverse((o) => {
    if (o.name.startsWith('J_')) joints[o.name.slice(2)] = o;
    if (o.isMesh) {
      const k = o.name[0];
      const col = o.geometry.getAttribute('color');
      if (k === 'W' && col) {
        const n = col.count, pad = new Float32Array(n);
        for (let i = 0; i < n; i++) pad[i] = col.getX(i);
        o.geometry.setAttribute('padMask', new THREE.BufferAttribute(pad, 1));
        o.geometry.deleteAttribute('color');
        o.material = mats.Wpad;
      } else {
        o.material = mats[k] || mats.W;
      }
      o.castShadow = shadows && k !== 'L' && k !== 'T';
      o.receiveShadow = shadows;
      parts[o.name] = o;
    }
  });
  const rest = {};
  for (const [k, j] of Object.entries(joints)) rest[k] = j.quaternion.clone();
  const holder = new THREE.Group();
  holder.add(g.scene);
  return { holder, joints, parts, rest, mats };
}

// pose: { joint: [x, y, z] euler radians (XYZ, applied on top of rest) }. Axes in three.js space:
// x = robot's left, y = up, z = forward. For limbs hanging down, +x bends forward, z swings sideways.
const _e = new THREE.Euler(), _q = new THREE.Quaternion();
export function setRobotPose(r, pose) {
  for (const [k, j] of Object.entries(r.joints)) {
    j.quaternion.copy(r.rest[k]);
    const a = pose[k];
    if (a) j.quaternion.multiply(_q.setFromEuler(_e.set(a[0] || 0, a[1] || 0, a[2] || 0, a[3] || 'XYZ')));
  }
  r.holder.updateMatrixWorld(true);
}

// curl all fingers of one hand (0 = open, 1 = loose fist); thumb separately
export function handCurl(side, k, thumb = k) {
  const out = {};
  for (const f of ['index', 'middle', 'ring', 'little']) {
    out[`${f}1_${side}`] = [-0.9 * k, 0, 0];
    out[`${f}2_${side}`] = [-1.1 * k, 0, 0];
    out[`${f}3_${side}`] = [-0.7 * k, 0, 0];
  }
  out[`thumb1_${side}`] = [-0.3 * thumb, 0, 0];
  out[`thumb2_${side}`] = [-0.5 * thumb, 0, 0];
  out[`thumb3_${side}`] = [-0.5 * thumb, 0, 0];
  return out;
}
