// A small modern kitchen set for the robot shots: stone counter with an undermount steel sink, a faucet,
// lower cabinets. The far room comes from the HDRI background (blurred). Counter top at y = 0.9 m,
// the counter's front edge along z = 0 (the room is toward -z), the sink centred on x = 0.
import { THREE } from './core.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const COUNTER = { top: 0.9, depth: 0.62, t: 0.03, sink: { w: 0.54, d: 0.4, depth: 0.2, z: -0.31 } };

export function steelMaterial({ roughness = 0.28 } = {}) {
  return new THREE.MeshPhysicalMaterial({ color: 0xc9ccd0, metalness: 1, roughness, anisotropy: 0.6, anisotropyRotation: Math.PI / 2 });
}

export function buildKitchen(studio, { width = 3.2 } = {}) {
  const g = new THREE.Group();
  const { top, depth, t, sink } = COUNTER;
  const stone = studio.pbr('Marble021', { repeat: [2, 1] });
  const stoneMat = new THREE.MeshPhysicalMaterial({ ...stone, color: 0xf2efe9, roughness: 0.35, clearcoat: 0.35, clearcoatRoughness: 0.18 });
  const cz = -depth / 2;
  // counter slab in four pieces around the sink cut-out
  const sx0 = -sink.w / 2, sx1 = sink.w / 2, sz0 = sink.z - sink.d / 2, sz1 = sink.z + sink.d / 2;
  const slab = (x0, x1, z0, z1) => {
    const m = new THREE.Mesh(new RoundedBoxGeometry(x1 - x0, t, z1 - z0, 2, 0.003), stoneMat);
    m.position.set((x0 + x1) / 2, top - t / 2, (z0 + z1) / 2);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  };
  slab(-width / 2, sx0, -depth, 0);
  slab(sx1, width / 2, -depth, 0);
  slab(sx0, sx1, -depth, sz0);
  slab(sx0, sx1, sz1, 0);
  // undermount basin: a rounded box seen from inside
  const steel = steelMaterial();
  const basin = new THREE.Mesh(new RoundedBoxGeometry(sink.w - 0.004, sink.depth * 2, sink.d - 0.004, 6, 0.03), steel);
  basin.material = steel.clone();
  basin.material.side = THREE.BackSide;
  basin.position.set(0, top - t, sink.z);
  basin.receiveShadow = true;
  g.add(basin);
  // drain
  const drain = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.002, 48), new THREE.MeshPhysicalMaterial({ color: 0x8c8f94, metalness: 1, roughness: 0.35 }));
  drain.position.set(0, top - t - sink.depth + 0.002, sink.z - 0.04);
  g.add(drain);
  // faucet: brushed steel gooseneck behind the sink
  const fz = sz0 - 0.05;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, top, fz), new THREE.Vector3(0, top + 0.2, fz), new THREE.Vector3(0, top + 0.33, fz + 0.03),
    new THREE.Vector3(0, top + 0.34, fz + 0.12), new THREE.Vector3(0, top + 0.27, fz + 0.19),
  ]);
  const faucet = new THREE.Mesh(new THREE.TubeGeometry(curve, 96, 0.012, 24, false), steelMaterial({ roughness: 0.18 }));
  faucet.castShadow = true;
  g.add(faucet);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.04, 48), steelMaterial({ roughness: 0.18 }));
  base.position.set(0, top + 0.02, fz);
  g.add(base);
  g.userData.spout = new THREE.Vector3(0, top + 0.262, fz + 0.19);
  // lower cabinets: warm grey-green matte doors with shadow gaps
  const doorMat = new THREE.MeshPhysicalMaterial({ color: 0x8d9686, roughness: 0.6, clearcoat: 0.1 });
  const nDoors = Math.round(width / 0.6);
  for (let i = 0; i < nDoors; i++) {
    const w = width / nDoors;
    const d = new THREE.Mesh(new RoundedBoxGeometry(w - 0.004, top - t - 0.1, 0.02, 2, 0.002), doorMat);
    d.position.set(-width / 2 + w * (i + 0.5), (top - t + 0.1) / 2 - 0.0, -0.035);
    d.castShadow = d.receiveShadow = true;
    g.add(d);
  }
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(width, 0.1, 0.02), new THREE.MeshStandardMaterial({ color: 0x2a2b2d, roughness: 0.8 }));
  plinth.position.set(0, 0.05, -0.09);
  g.add(plinth);
  return g;
}
