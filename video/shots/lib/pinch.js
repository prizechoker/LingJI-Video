// The robot's hand holding a rice bowl by its rim (thumb inside, two fingers outside), as in lab/sf_dish.js: the grip
// is solved in hand space, then a grip orientation is searched so the forearm comes from a wanted direction and the
// palm faces away from the camera. Returns the hand, its pose, and where the holder goes for the bowl at `base`.
import { THREE } from '../../engine2/core.js';
import { botMaterial } from '../../engine2/bot.js';
import { loadBotHand, solvePinch, padPoint, FOREARM } from '../../engine2/bothand.js';
import { loadHand } from '../../engine2/hand.js';
import { bowlGeometry } from '../../engine2/dishes.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export async function rimGrip(st, { base, want = V3(-0.3, -0.55, -0.75), camPos, gap = 0.0045, material, human = false } = {}) {
  const h = human ? await loadHand(st, material ? { material } : {}) : await loadBotHand(st, { material: material || botMaterial({ white: 0xdfe2e6, envDiffuse: 0.9, seam: 0.0005, dark: 0.7 }) });
  const pinch = solvePinch(h, gap);
  const basis = (x, y) => new THREE.Matrix4().makeBasis(x, y, V3().crossVectors(x, y));
  const tP = padPoint(h, 1), fP = padPoint(h, 2).lerp(padPoint(h, 3), 0.5);
  const R0 = tP.clone().lerp(fP, 0.5);
  const nW = fP.clone().sub(tP).normalize();
  const wristP = h.bones.hand.getWorldPosition(V3());
  const uH = wristP.clone().sub(R0);
  uH.addScaledVector(nW, -uH.dot(nW)).normalize();
  const handF = basis(nW, uH).transpose();
  const fRest = FOREARM.clone().negate();
  const g = bowlGeometry();
  want = want.clone().normalize();
  const toCam = camPos.clone().sub(base).normalize();
  let best = null;
  const rad = THREE.MathUtils.degToRad;
  for (let phi = 0; phi < 360; phi += 4) {
    for (let tilt = 0; tilt <= 50; tilt += 5) {
      const nb = V3(Math.cos(rad(phi)), 0, Math.sin(rad(phi)));
      const tang = V3().crossVectors(V3(0, 1, 0), nb);
      const q = new THREE.Quaternion().setFromAxisAngle(tang, rad(tilt));
      const M = basis(nb.clone().applyQuaternion(q), V3(0, 1, 0).applyQuaternion(q)).multiply(handF);
      const fore = fRest.clone().transformDirection(M), palm = V3(0, -1, 0).transformDirection(M);
      const score = fore.dot(want) - 0.3 * palm.dot(toCam) - 0.002 * tilt;
      if (!best || score > best.score) best = { score, M, nb };
    }
  }
  const rimLocal = V3(0, g.userData.rimY, 0).addScaledVector(best.nb, g.userData.rimR); // rim grip point, bowl space
  const quat = new THREE.Quaternion().setFromRotationMatrix(best.M);
  const gripOffset = R0.clone().applyMatrix4(best.M); // the grip centre relative to the holder (rotated)
  // place the holder so the grip centre sits at a world point
  const placeAt = (p) => { h.holder.quaternion.copy(quat); h.holder.position.copy(p).sub(gripOffset); h.holder.updateMatrixWorld(true); };
  placeAt(base.clone().add(rimLocal));
  return { h, pose: pinch.pose, nb: best.nb, rimLocal, quat, gripOffset, placeAt, g };
}
