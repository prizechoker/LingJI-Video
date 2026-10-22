// Floors for the grid chapter: an industrial concrete floor whose painted grid is computed in the shader (crisp at
// any distance, animatable: the 1 m layout grid, a go grid that draws itself in, star points), soft pools of light
// under the overhead fixtures, and a value-noise wear mask so the paint is chipped where forklifts run.
import { THREE } from '../../engine2/core.js';

// tileable fbm noise baked into a small texture (cheap to sample; the shader used to compute it per pixel)
let NOISE_TEX = null;
export function noiseTexture() {
  if (NOISE_TEX) return NOISE_TEX;
  const N = 256;
  let s = 99991;
  const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const layer = (cells0) => {
    const out = new Float32Array(N * N);
    let amp = 0.5, tot = 0;
    for (let o = 0, cells = cells0; o < 5; o++, cells *= 2, amp *= 0.5) {
      const g = new Float32Array(cells * cells).map(() => R());
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const fx = (x / N) * cells, fy = (y / N) * cells, x0 = Math.floor(fx), y0 = Math.floor(fy);
        let tx = fx - x0, ty = fy - y0;
        tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
        const v = (i, j) => g[(j % cells) * cells + (i % cells)];
        const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * tx, b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * tx;
        out[y * N + x] += (a + (b - a) * ty) * amp;
      }
      tot += amp;
    }
    for (let i = 0; i < out.length; i++) out[i] /= tot;
    return out;
  };
  const A = layer(4), B = layer(16), C = layer(2);
  const d = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) { d[i * 4] = A[i] * 255; d[i * 4 + 1] = B[i] * 255; d[i * 4 + 2] = C[i] * 255; d[i * 4 + 3] = R() * 255; }
  const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  NOISE_TEX = t;
  return t;
}

const NOISE = /* glsl */`
uniform sampler2D uNoise;
// fbm-like value in [0, 1] at world point p (metres), feature size ~ 1 / f
float gfFbm(vec2 p) { return texture2D(uNoise, p * 0.25).r; }
// anti-aliased line of width w (metres) at distance d from its centre; fw = metres per pixel
float gfLine(float d, float w, float fw) {
  float c = 1.0 - smoothstep(w * 0.5 - fw * 0.75, w * 0.5 + fw * 0.75, d);
  return c;
}
`;

// opts: texture (ambientCG set), repeat (metres per tile), tint, cell [x, z], origin [x, z], line width, paint colour
export function gridFloorMaterial(studio, {
  texture = 'Concrete047A', tile = 4, tint = 0x9aa3ab, roughness = 1.0, normalScale = 0.6,
  cell = [1, 1], origin = [0, 0], lineW = 0.03, paint = 0xdfe6ec, paintA = 0.85, wear = 0.55,
  pools = null, // { pitch: [x, z], offset: [x, z], radius: [x, z], color, intensity }
  clearcoat = 0.3, clearcoatRoughness = 0.25, texMean = 0x9c9a94, texMix = 1, blotch = 0.3, refl = null, local = 0,
} = {}) {
  const maps = studio.pbr(texture, { repeat: [1, 1] });
  const mat = new THREE.MeshPhysicalMaterial({
    ...maps, color: tint, roughness, normalScale: new THREE.Vector2(normalScale, normalScale), clearcoat, clearcoatRoughness,
  });
  const U = {
    uTile: { value: 1 / tile },
    uCell: { value: new THREE.Vector2(...cell) },
    uOrigin: { value: new THREE.Vector2(...origin) },
    uLineW: { value: lineW },
    uPaint: { value: new THREE.Color(paint) },
    uPaintA: { value: paintA },
    uWear: { value: wear },
    // extra lanes (thicker solid lines), up to 8: (x0, z0, x1, z1) segments in world xz, width in .w of uLaneW
    uLanes: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uLaneW: { value: 0.1 },
    uLaneA: { value: 0 },
    // the go grid: centre, spacing, n lines, how far drawn (0..1), opacity, star points
    uGoC: { value: new THREE.Vector2(0, 0) },
    uGoCell: { value: new THREE.Vector2(0.5, 0.5) },
    uGoN: { value: 19 },
    uGoDraw: { value: 0 },
    uGoA: { value: 0 },
    uGoW: { value: 0.03 },
    uGoStar: { value: 0 },
    uBaseA: { value: 1 }, // the layout grid's opacity (fades as the go grid takes over)
    uGoOut: { value: 0 }, // dims the layout grid outside the go board
    // light pools under the fixtures
    uPoolPitch: { value: new THREE.Vector2(...(pools?.pitch || [1, 1])) },
    uPoolOff: { value: new THREE.Vector2(...(pools?.offset || [0, 0])) },
    uPoolRad: { value: new THREE.Vector2(...(pools?.radius || [1, 1])) },
    uPoolCol: { value: new THREE.Color(pools?.color ?? 0xffffff).multiplyScalar(pools?.intensity ?? 0) },
    uPoolRect: { value: new THREE.Vector4(...(pools?.rect || [-1e4, -1e4, 1e4, 1e4])) },
    uGlow: { value: 0 }, // painted lines glowing (graphic emphasis)
    uGlowCol: { value: new THREE.Color(0x8fd0ff) },
    uTexMean: { value: new THREE.Color(texMean) },
    uTexMix: { value: texMix },
    uBlotch: { value: blotch },
    uNoise: { value: noiseTexture() },
    // glossy reflections of the overhead fixtures (a lattice of bright rectangles at height uFixH)
    uRefCol: { value: new THREE.Color(0xeaf3ff).multiplyScalar(refl?.intensity ?? 0) },
    uFixH: { value: refl?.height ?? 12 },
    uFixPitch: { value: new THREE.Vector2(...(refl?.pitch || [1, 1])) },
    uFixOff: { value: new THREE.Vector2(...(refl?.offset || [0, 0])) },
    uFixHalf: { value: new THREE.Vector2(...(refl?.half || [0.11, 0.69])) },
    uRefBlur: { value: refl?.blur ?? 0.08 },
  };
  mat.userData.u = U;
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, U);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <project_vertex>', local ? `#include <project_vertex>\nvGW = transformed * ${local.toFixed(6)};` : '#include <project_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vGW;
uniform float uTile; uniform vec2 uCell; uniform vec2 uOrigin; uniform float uLineW; uniform vec3 uPaint; uniform float uPaintA; uniform float uWear;
uniform vec4 uLanes[8]; uniform float uLaneW; uniform float uLaneA;
uniform vec2 uGoC; uniform vec2 uGoCell; uniform float uGoN; uniform float uGoDraw; uniform float uGoA; uniform float uGoW; uniform float uGoStar;
uniform float uBaseA; uniform float uGoOut;
uniform vec2 uPoolPitch; uniform vec2 uPoolOff; uniform vec2 uPoolRad; uniform vec3 uPoolCol; uniform vec4 uPoolRect;
uniform float uGlow; uniform vec3 uGlowCol; uniform vec3 uTexMean; uniform float uTexMix; uniform float uBlotch;
uniform vec3 uRefCol; uniform float uFixH; uniform vec2 uFixPitch; uniform vec2 uFixOff; uniform vec2 uFixHalf; uniform float uRefBlur;
${NOISE}
float gfPaint;
`)
      // world-space texture coordinates for every map (the floor is one big plane)
      .replace('#include <map_fragment>', `
vec2 gUV = vGW.xz * uTile;
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, gUV );
  sampledDiffuseColor.rgb = mix(uTexMean, sampledDiffuseColor.rgb, uTexMix);
  diffuseColor *= sampledDiffuseColor;
#endif
// slow, large-scale variation so the texture tiling never shows
diffuseColor.rgb *= 1.0 + uBlotch * (gfFbm(vGW.xz * 0.11 + 3.7) - 0.47);
{
  vec2 p = vGW.xz;
  vec2 fw = max(fwidth(p), vec2(1e-5));
  float f1 = max(fw.x, fw.y);
  // the layout grid
  vec2 q = (p - uOrigin) / uCell;
  vec2 d = abs(fract(q + 0.5) - 0.5) * uCell;
  float lx = gfLine(d.x, uLineW, fw.x), lz = gfLine(d.y, uLineW, fw.y);
  // far away the lines are sub-pixel: settle on their average coverage (per axis: grazing views squash one only)
  lx = mix(lx, clamp(uLineW / uCell.x * 1.3, 0.0, 1.0), smoothstep(0.6, 2.0, fw.x / uLineW));
  lz = mix(lz, clamp(uLineW / uCell.y * 1.3, 0.0, 1.0), smoothstep(0.6, 2.0, fw.y / uLineW));
  float base = max(lx, lz);
  // the go board: n lines each way, drawn out from the centre
  vec2 g = (p - uGoC) / uGoCell;
  float gHalf = (uGoN - 1.0) * 0.5;
  vec2 gd = abs(fract(g + 0.5) - 0.5) * uGoCell;
  vec2 inside = step(abs(g), vec2(gHalf + 0.5));
  // the fine grid spreads out from the centre as an expanding square with a soft front
  float reach = uGoDraw * (gHalf + 1.5);
  float rev = 1.0 - smoothstep(reach - 1.2, reach, max(abs(g.x), abs(g.y)));
  float inB = step(abs(g.x), gHalf + 0.02) * step(abs(g.y), gHalf + 0.02);
  float gx = gfLine(gd.x, uGoW, fw.x) * inB * rev;
  float gz = gfLine(gd.y, uGoW, fw.y) * inB * rev;
  // the border lines a little heavier
  float bx = gfLine(abs(abs(g.x) - gHalf) * uGoCell.x, uGoW * 1.6, fw.x) * step(abs(g.y), gHalf + 0.02) * rev;
  float bz = gfLine(abs(abs(g.y) - gHalf) * uGoCell.y, uGoW * 1.6, fw.y) * step(abs(g.x), gHalf + 0.02) * rev;
  float go = max(max(gx, gz), max(bx, bz));
  // star points (hoshi) at 3, 9, 15 for a 19 board
  vec2 sp = g + gHalf;
  vec2 sn = vec2(floor(sp.x + 0.5), floor(sp.y + 0.5));
  float isStar = (mod(sn.x - 3.0, 6.0) < 0.5 && sn.x > 2.5 && sn.x < uGoN - 3.5 ? 1.0 : 0.0) * (mod(sn.y - 3.0, 6.0) < 0.5 && sn.y > 2.5 && sn.y < uGoN - 3.5 ? 1.0 : 0.0);
  float sr = length((sp - sn) * uGoCell);
  go = max(go, isStar * uGoStar * (1.0 - smoothstep(uGoW * 2.2 - f1, uGoW * 2.2 + f1, sr)));
  go = mix(go, clamp(uGoW / min(uGoCell.x, uGoCell.y) * 1.6, 0.0, 1.0) * step(abs(g.x), gHalf) * step(abs(g.y), gHalf) * uGoDraw, smoothstep(0.35, 1.2, f1 / uGoW));
  float inBoard = inside.x * inside.y;
  base *= uBaseA * (1.0 - uGoOut * (1.0 - inBoard) * 0.55);
  // lanes
  float lane = 0.0;
  for (int k = 0; k < 8; k++) {
    vec4 L = uLanes[k];
    vec2 a = L.xy, b = L.zw;
    vec2 ab = b - a;
    float ll = dot(ab, ab);
    if (ll < 1e-6) continue;
    float h = clamp(dot(p - a, ab) / ll, 0.0, 1.0);
    lane = max(lane, gfLine(length(p - a - ab * h), uLaneW, f1));
  }
  lane *= uLaneA;
  // chipped, scuffed paint
  float w = gfFbm(p * 3.1) * 0.65 + gfFbm(p * 17.0) * 0.35;
  float keep = smoothstep(uWear * 0.55, uWear * 0.55 + 0.18, w);
  gfPaint = clamp(max(max(base, lane), go * uGoA) * uPaintA * keep, 0.0, 1.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, uPaint, gfPaint);
}
`)
      .replace('#include <roughnessmap_fragment>', `
float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
  vec4 texelRoughness = texture2D( roughnessMap, gUV );
  roughnessFactor *= texelRoughness.g;
#endif
roughnessFactor = mix(roughnessFactor, 0.42, gfPaint);
`)
      .replace('#include <normal_fragment_maps>', `
#ifdef USE_NORMALMAP_TANGENTSPACE
  vec3 mapN = texture2D( normalMap, gUV ).xyz * 2.0 - 1.0;
  mapN.xy *= normalScale * (1.0 - 0.7 * gfPaint);
  normal = normalize( tbn * mapN );
#endif
`)
      .replace('#include <opaque_fragment>', `
{
  vec2 p = vGW.xz;
  vec2 dd = (fract((p - uPoolOff) / uPoolPitch + 0.5) - 0.5) * uPoolPitch / uPoolRad;
  float inR = step(uPoolRect.x, p.x) * step(p.x, uPoolRect.z) * step(uPoolRect.y, p.y) * step(p.y, uPoolRect.w);
  float pool = exp(-dot(dd, dd)) * inR;
  outgoingLight += diffuseColor.rgb * uPoolCol * pool;
  // the fixtures seen in the floor's sheen: blurred, stretched toward the viewer like real glossy reflections
  if (uRefCol.r > 0.0) {
    vec3 Vd = normalize(vGW - cameraPosition);
    vec3 Rd = reflect(Vd, vec3(0.0, 1.0, 0.0));
    float tH = (uFixH - vGW.y) / max(Rd.y, 0.02);
    vec2 hit = vGW.xz + Rd.xz * tH;
    vec2 dd2 = (fract((hit - uFixOff) / uFixPitch + 0.5) - 0.5) * uFixPitch;
    vec2 q2 = max(abs(dd2) - uFixHalf, 0.0);
    vec2 dir = normalize(Rd.xz + vec2(1e-5));
    float blur = 0.12 + tH * uRefBlur * (0.6 + gfFbm(p * 0.9));
    float along = abs(dot(q2, dir)), across = abs(dot(q2, vec2(-dir.y, dir.x)));
    float k = exp(-pow(along / (blur * (1.0 + 1.6 / max(Rd.y, 0.15))), 2.0) - pow(across / blur, 2.0));
    float inR = step(uPoolRect.x - 2.0, hit.x) * step(hit.x, uPoolRect.z + 2.0) * step(uPoolRect.y - 2.0, hit.y) * step(hit.y, uPoolRect.w + 2.0);
    float fres = 0.05 + 0.95 * pow(1.0 - max(Rd.y, 0.0), 5.0);
    outgoingLight += uRefCol * k * inR * fres * (1.0 - 0.6 * gfPaint);
  }
  outgoingLight += uGlowCol * uGlow * gfPaint;
}
#include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => `gridfloor${local}`;
  return mat;
}

// a horizontal plane at y = 0 whose uv are its world xz (so normal maps sampled in world space shade correctly)
export function floorPlane(w, d, cx = 0, cz = 0, seg = 1) {
  const g = new THREE.PlaneGeometry(w, d, seg, seg);
  g.rotateX(-Math.PI / 2);
  g.translate(cx, 0, cz);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), p.getZ(i));
  return g;
}
