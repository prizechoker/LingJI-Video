// Suit sleeve with a white shirt cuff, in hand space (wrist at origin, forearm toward +z). Hides the forearm cut.
import { THREE } from './core.js';

export function buildSleeve(studio, { dir = new THREE.Vector3(-0.051, -0.244, 0.968), suit = 0x1c2029 } = {}) {
  const g = new THREE.Group();
  const fab = studio.pbr('Fabric030', { repeat: [6, 10] });
  const align = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  // shirt cuff
  const cuffGeo = new THREE.CylinderGeometry(0.0372, 0.0378, 0.034, 64, 1, true);
  const cuff = new THREE.Mesh(cuffGeo, new THREE.MeshPhysicalMaterial({
    color: 0xcfcfca, roughness: 0.75, sheen: 0.35, sheenColor: new THREE.Color(0xffffff), sheenRoughness: 0.6,
    normalMap: fab.normalMap, normalScale: new THREE.Vector2(0.15, 0.15), side: THREE.DoubleSide,
  }));
  cuff.position.copy(dir).multiplyScalar(0.05);
  cuff.quaternion.copy(align);
  // suit sleeve: a slightly flared tube with soft folds
  const L = 0.42;
  const sg = new THREE.CylinderGeometry(0.06, 0.0445, L, 96, 48, true);
  const p = sg.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    const u = (y + L / 2) / L; // 0 at the cuff end ... 1 far up the arm
    const fold = 0.0022 * Math.sin(a * 3 + u * 9) * Math.sin(u * 14 + a) + 0.0016 * Math.sin(a * 7 - u * 5);
    const k = 1 + fold / Math.hypot(x, z);
    p.setX(i, x * k);
    p.setZ(i, z * k);
  }
  sg.computeVertexNormals();
  const sleeve = new THREE.Mesh(sg, new THREE.MeshPhysicalMaterial({
    color: suit, roughness: 0.82, sheen: 0.7, sheenColor: new THREE.Color(0x5a6070), sheenRoughness: 0.5,
    normalMap: fab.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughnessMap: fab.roughnessMap, side: THREE.DoubleSide,
  }));
  sleeve.position.copy(dir).multiplyScalar(0.062 + L / 2);
  sleeve.quaternion.copy(align);
  for (const m of [cuff, sleeve]) { m.castShadow = m.receiveShadow = true; g.add(m); }
  return g;
}
