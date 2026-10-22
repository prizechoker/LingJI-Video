// Machined parts for the grid chapter: turned steel flanges (34 cm, bored, six bolt holes) in black oxide and bright
// steel, the factory's go stones; they drop onto grid intersections and settle with a small bounce.
import { THREE } from '../../engine2/core.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const flat = (g) => {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
  return n;
};

export const FLANGE = { r: 0.17, h: 0.075 };

export function flangeGeometry() {
  const prof = [[0.04, 0.0], [0.166, 0.0], [0.17, 0.004], [0.17, 0.031], [0.166, 0.035], [0.089, 0.035], [0.085, 0.039], [0.085, 0.071],
    [0.081, 0.075], [0.044, 0.075], [0.04, 0.071], [0.04, 0.0]];
  const body = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 64);
  body.computeVertexNormals();
  const holes = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    holes.push(new THREE.CircleGeometry(0.012, 16).rotateX(-Math.PI / 2).translate(Math.cos(a) * 0.128, 0.0353, Math.sin(a) * 0.128));
  }
  const g = mergeGeometries([flat(body), mergeGeometries(holes.map(flat))], true);
  return g;
}

export function flangeMaterials() {
  const hole = new THREE.MeshBasicMaterial({ color: 0x050607 });
  return {
    B: [new THREE.MeshPhysicalMaterial({ color: 0x1b1d21, metalness: 0.65, roughness: 0.34, clearcoat: 0.35, clearcoatRoughness: 0.3 }), hole],
    W: [new THREE.MeshPhysicalMaterial({ color: 0xe6eaee, metalness: 1, roughness: 0.42, envMapIntensity: 2.2 }), hole],
  };
}

// n flanges per colour at most. pose(drops, t): drops = [{ c: 'B'|'W', x, z, land, rot }]
export function flangeSet(n, { fall = 0.9, y0 = 0 } = {}) {
  const geo = flangeGeometry();
  const mats = flangeMaterials();
  const group = new THREE.Group();
  const M = {};
  for (const c of ['B', 'W']) {
    const m = new THREE.InstancedMesh(geo, mats[c], Math.max(1, n));
    m.castShadow = m.receiveShadow = true;
    m.frustumCulled = false;
    m.count = 0;
    group.add(m);
    M[c] = m;
  }
  const G = 9.81, tf = Math.sqrt((2 * fall) / G), vLand = G * tf, e = 0.14;
  const vb = vLand * e, tb = (2 * vb) / G;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const pose = (drops, t) => {
    const cnt = { B: 0, W: 0 };
    for (const d of drops) {
      const tau = t - (d.land - tf);
      if (tau < 0) continue;
      let y, k = 1;
      if (tau < tf) { y = fall - 0.5 * G * tau * tau; k = Math.min(1, tau / 0.1); }
      else if (tau < tf + tb) { const u = tau - tf; y = vb * u - 0.5 * G * u * u; }
      else y = 0;
      p.set(d.x, y0 + y, d.z);
      q.setFromAxisAngle(Y, d.rot);
      s.set(k, k, k);
      M[d.c].setMatrixAt(cnt[d.c]++, m4.compose(p, q, s));
    }
    for (const c of ['B', 'W']) { M[c].count = cnt[c]; M[c].instanceMatrix.needsUpdate = true; }
  };
  return { group, pose, meshes: M, fallTime: tf };
}
