// Materials for the realistic look: skin (wrapped, reddened diffuse + glossy nails), go stones, wood, porcelain.
import { THREE } from './core.js';

// ---------------------------------------------------------------- procedural detail maps
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// tileable value noise on an n x n grid (several octaves), returned as Float32Array
function noiseField(n, octaves, seed) {
  const out = new Float32Array(n * n);
  const R = rng(seed);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const cells = 4 << o;
    const g = new Float32Array(cells * cells).map(() => R());
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const fx = (x / n) * cells, fy = (y / n) * cells;
        const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
        const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        const v = (i, j) => g[((j % cells) * cells) + (i % cells)];
        const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * sx;
        const b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * sx;
        out[y * n + x] += (a + (b - a) * sy) * amp;
      }
    }
    total += amp;
    amp *= 0.55;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

// normal map from a height field (tileable), as a DataTexture
function normalFromHeight(h, n, strength) {
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const hx = h[y * n + ((x + 1) % n)] - h[y * n + ((x - 1 + n) % n)];
      const hy = h[((y + 1) % n) * n + x] - h[((y - 1 + n) % n) * n + x];
      let nx = -hx * strength, ny = -hy * strength, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = (y * n + x) * 4;
      data[i] = (nx * 0.5 + 0.5) * 255;
      data[i + 1] = (ny * 0.5 + 0.5) * 255;
      data[i + 2] = (nz * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

let PORES = null;
export function poreNormal() {
  if (!PORES) {
    // fine pores + a few creases
    const n = 256;
    const h = noiseField(n, 5, 7);
    const pores = rng(11);
    for (let k = 0; k < 900; k++) {
      const cx = pores() * n, cy = pores() * n, r = 0.8 + pores() * 1.2;
      for (let y = Math.floor(cy - 3); y <= cy + 3; y++) {
        for (let x = Math.floor(cx - 3); x <= cx + 3; x++) {
          const d = Math.hypot(x - cx, y - cy);
          if (d < r * 2) h[((y + n) % n) * n + ((x + n) % n)] -= 0.25 * Math.exp(-(d * d) / (r * r));
        }
      }
    }
    PORES = normalFromHeight(h, n, 6.0);
  }
  return PORES;
}

// ---------------------------------------------------------------- skin
// Wrap lighting with a per-channel wrap (red light reaches further past the terminator) is the classic cheap
// stand-in for subsurface scattering; nails come from a per-vertex mask baked by blender/build_hand.py.
const WRAP_DIFFUSE = `
	#ifdef SKIN_WRAP
		float nlw = dot( geometryNormal, directLight.direction );
		vec3 wrapW = vec3( 0.50, 0.22, 0.14 ) * skinWrap;
		vec3 wrapped = clamp( ( vec3( nlw ) + wrapW ) / ( 1.0 + wrapW ), 0.0, 1.0 );
		reflectedLight.directDiffuse += wrapped * directLight.color * BRDF_Lambert( material.diffuseColor );
		// light passing through thin edges (fingers against a back light)
		float back = pow( saturate( dot( geometryViewDir, -directLight.direction ) ), 6.0 ) * ( 1.0 - saturate( abs( nlw ) ) );
		reflectedLight.directDiffuse += directLight.color * back * skinBacklight * vec3( 1.0, 0.32, 0.18 ) * material.diffuseColor;
	#else
		reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	#endif`;

export function skinMaterial({ color = 0xd29a7c, roughness = 0.58, wrap = 1, backlight = 0.6, nail = 0xe4b4a4, poreScale = 70, poreStrength = 0.07 } = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color, roughness, ior: 1.4, specularIntensity: 0.42,
    sheen: 0.18, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xffb69a),
    clearcoat: 0.12, clearcoatRoughness: 0.4,
    normalMap: poreNormal(), normalScale: new THREE.Vector2(poreStrength, poreStrength),
  });
  m.normalMap.repeat.set(poreScale, poreScale);
  const u = { skinWrap: { value: wrap }, skinBacklight: { value: backlight }, nailColor: { value: new THREE.Color(nail) } };
  m.userData.u = u;
  m.defines = { SKIN_WRAP: '' };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float nailMask;\nattribute float skinAO;\nvarying float vNail;\nvarying float vAO;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvNail = nailMask;\nvAO = skinAO;');
    const chunk = THREE.ShaderChunk.lights_physical_pars_fragment.replace(
      'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );', WRAP_DIFFUSE);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vNail;\nvarying float vAO;\nuniform float skinWrap;\nuniform float skinBacklight;\nuniform vec3 nailColor;')
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat nailK = smoothstep( 0.3, 0.8, vNail );\nfloat crease = smoothstep( 0.25, 0.95, vAO );\ndiffuseColor.rgb *= mix( vec3( 0.62, 0.42, 0.38 ), vec3( 1.0 ), crease );\ndiffuseColor.rgb = mix( diffuseColor.rgb, nailColor, nailK );')
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= mix( 1.0, vAO, 0.85 );\nreflectedLight.indirectSpecular *= mix( 1.0, vAO, 0.6 );')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix( roughnessFactor, 0.22, nailK );')
      .replace('#include <lights_physical_pars_fragment>', chunk);
  };
  return m;
}

// ---------------------------------------------------------------- go stones
export function stoneMaterials() {
  const black = new THREE.MeshPhysicalMaterial({ color: 0x0c0d0f, roughness: 0.38, ior: 1.5, specularIntensity: 0.75, clearcoat: 0.25, clearcoatRoughness: 0.35 });
  const white = new THREE.MeshPhysicalMaterial({
    color: 0xf0ebe0, roughness: 0.3, ior: 1.5, clearcoat: 0.3, clearcoatRoughness: 0.2,
    sheen: 0.25, sheenColor: new THREE.Color(0xf4efe4), sheenRoughness: 0.4,
  });
  return { black, white };
}

// double-convex stone, 22 mm across, ~9 mm thick
export function stoneGeometry({ r = 0.011, h = 0.0092, segs = 64 } = {}) {
  const pts = [];
  const N = 28;
  for (let i = 0; i <= N; i++) {
    const t = i / N; // 0 = top centre -> 1 = rim
    const x = r * Math.sin((t * Math.PI) / 2);
    const y = (h / 2) * Math.pow(Math.cos((t * Math.PI) / 2), 0.78);
    pts.push(new THREE.Vector2(x, y));
  }
  // bottom pole -> rim -> top pole: LatheGeometry faces point outward only for an upward profile
  const prof = [...pts, ...pts.slice(0, -1).reverse().map((p) => new THREE.Vector2(p.x, -p.y))].reverse();
  const g = new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(Math.max(p.x, 1e-5), p.y)), segs);
  // analytic normals of the lens surface (the lathe's averaged normals break down at the poles)
  const pos = g.attributes.position, nrm = g.attributes.normal;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const rr = Math.min(Math.hypot(v.x, v.z), r * 0.99999);
    const t = (2 / Math.PI) * Math.asin(rr / r); // inverse of x(t)
    const dxdt = r * (Math.PI / 2) * Math.cos((t * Math.PI) / 2);
    const c = Math.max(1e-6, Math.cos((t * Math.PI) / 2));
    const dydt = -(h / 2) * 0.78 * Math.pow(c, -0.22) * Math.sin((t * Math.PI) / 2) * (Math.PI / 2);
    // outward normal in the (radial, y) plane: perpendicular to (dxdt, dydt)
    let nr = -dydt, ny = dxdt;
    const L = Math.hypot(nr, ny);
    nr /= L; ny /= L;
    const s = Math.sign(v.y) || 1;
    const ux = rr > 1e-7 ? v.x / Math.hypot(v.x, v.z) : 0, uz = rr > 1e-7 ? v.z / Math.hypot(v.x, v.z) : 0;
    nrm.setXYZ(i, ux * nr, ny * s, uz * nr);
  }
  nrm.needsUpdate = true;
  return g;
}
