// The episode's home robot (modelled by blender/build_bot.py): white satin body, glossy black head, neck and
// shoulder yoke, fine panel seams. COLOR_0 carries signed distances (metres, stored as 0.5 + d / 0.1): r to the
// yoke's edge (d > 0 is black), g, b, a to panel edges. The shader draws the yoke with a crisp, anti-aliased edge and
// each seam as a thin dark groove; a jump in a distance across a triangle (where one panel's field meets another's)
// is far steeper than any real seam and is ignored.
import { THREE } from './core.js';

const HEADER = `
varying vec4 vBot;
uniform vec3 botBlack;
uniform float botRoughBlack;
uniform vec4 botCoat;  // clearcoat and its roughness: white, then black
uniform float seamWidth;
uniform float seamDark;
uniform float grooveDepth;
uniform float facePlate;
uniform float envDiffuse;
float botDist( float v ) { return ( v - 0.5 ) * 0.1; }
// a line of half-width w along d = 0, anti-aliased; faded where d jumps between panels (not a seam)
float botLine( float d, float w ) {
	float fw = max( fwidth( d ), 1e-6 );
	return ( 1.0 - smoothstep( w - fw, w + fw, abs( d ) ) ) * ( 1.0 - smoothstep( 0.004, 0.012, fw ) );
}
// a groove's profile, only where it is resolved (close up)
float botGroove( float d, float w ) {
	float fw = fwidth( d );
	return ( 1.0 - smoothstep( 0.0, w, abs( d ) ) ) * ( 1.0 - smoothstep( 0.0006, 0.002, fw ) );
}
vec3 botPerturb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
	vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
	vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
	vec3 R1 = cross( vSigmaY, surf_norm );
	vec3 R2 = cross( surf_norm, vSigmaX );
	float fDet = dot( vSigmaX, R1 ) * faceDirection;
	vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
	return normalize( abs( fDet ) * surf_norm - vGrad );
}`;

export function botMaterial({ white = 0xe9eaec, black = 0x07080a, roughWhite = 0.36, roughBlack = 0.1,
  coat = [0.35, 0.24, 1.0, 0.035], seam = 0.0006, dark = 0.72, groove = 0.0005, head = false, plate = 0, envDiffuse = 1 } = {}) {
  const m = new THREE.MeshPhysicalMaterial({ color: white, roughness: roughWhite, clearcoat: 1, clearcoatRoughness: 0.2, specularIntensity: 0.6 });
  const u = {
    botBlack: { value: new THREE.Color(black) }, botRoughBlack: { value: roughBlack }, botCoat: { value: new THREE.Vector4(...coat) },
    seamWidth: { value: seam }, seamDark: { value: dark }, grooveDepth: { value: groove }, facePlate: { value: plate },
    envDiffuse: { value: envDiffuse },
  };
  m.userData.u = u;
  m.defines = { BOT_HEAD: head ? 1 : 0 };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 botData;\nvarying vec4 vBot;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBot = botData;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>${HEADER}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
	float dY = botDist( vBot.r ), dG = botDist( vBot.g ), dB = botDist( vBot.b ), dA = botDist( vBot.a );
	float fY = max( fwidth( dY ), 1e-6 );
	float yoke = smoothstep( -fY, fY, dY );
	#if BOT_HEAD == 1
		float seams = botLine( dG, seamWidth * 0.8 ) * facePlate;
		float groove = botGroove( dG, seamWidth * 2.0 ) * facePlate;
		yoke = 1.0;
	#else
		float seams = max( max( botLine( dG, seamWidth ), botLine( dB, seamWidth ) ), botLine( dA, seamWidth ) ) * ( 1.0 - yoke );
		seams = max( seams, 0.8 * botLine( dY, seamWidth * 0.7 ) );  // the yoke's edge: a fine gap
		float groove = max( max( botGroove( dG, seamWidth * 2.2 ), botGroove( dB, seamWidth * 2.2 ) ), botGroove( dA, seamWidth * 2.2 ) ) * ( 1.0 - yoke );
		groove = max( groove, botGroove( dY, seamWidth * 1.6 ) );
	#endif
	diffuseColor.rgb = mix( diffuseColor.rgb, botBlack, yoke );
	diffuseColor.rgb *= 1.0 - seamDark * seams;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
	roughnessFactor = mix( roughnessFactor, botRoughBlack, yoke );`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
	vec2 botGrad = vec2( dFdx( groove ), dFdy( groove ) ) * -grooveDepth;
	normal = botPerturb( - vViewPosition, normal, botGrad, faceDirection );`)
      .replace('#include <clearcoat_normal_fragment_maps>', `#include <clearcoat_normal_fragment_maps>
	clearcoatNormal = botPerturb( - vViewPosition, clearcoatNormal, botGrad, faceDirection );`)
      .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
	iblIrradiance *= envDiffuse;  // (a stage lit by its lamps: the room's light only in the reflections)`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
	material.clearcoat = mix( botCoat.x, botCoat.z, yoke );
	material.clearcoatRoughness = clamp( mix( botCoat.y, botCoat.w, yoke ), 0.0525, 1.0 );`);
  };
  m.customProgramCacheKey = () => `bot-${head ? 'head' : 'body'}`;
  return m;
}

export function botMaterials(opts = {}) {
  return { body: botMaterial(opts), head: botMaterial({ ...opts, head: true }) };
}

export async function loadBot(studio, { url = '../assets/models/bot.glb', mats = botMaterials(), shadows = true } = {}) {
  const g = await studio.gltf.loadAsync(url);
  const parts = {};
  g.scene.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry;
    const col = geo.getAttribute('color');
    if (col) {
      geo.setAttribute('botData', col);
      geo.deleteAttribute('color');
    }
    o.material = /head/i.test(o.name) ? mats.head : mats.body;
    o.castShadow = o.receiveShadow = shadows;
    parts[o.name] = o;
  });
  const holder = new THREE.Group();
  holder.add(g.scene);
  return { holder, parts, mats };
}
