import { THREE, three } from '../core/three.js';
import { W, H } from '../core/stage.js';
import { createHand, setPose, orient, POSE } from './lib/hand3d.js';

let S = null;
function setup() {
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.12));
  const dl = new THREE.DirectionalLight(0xffd2a0, 1.0);
  dl.position.set(-0.5, 2, 1);
  scene.add(dl);
  // numeric check: which flex sign moves the index tip toward the palm (-X model space)?
  for (const sign of [-1, 1]) {
    const h = createHand();
    const pose = JSON.parse(JSON.stringify(POSE.rest));
    pose.index = [0.6, 0.6, 0.6];
    setPose(h, pose, sign);
    h.root.updateMatrixWorld(true);
    const tip = new THREE.Vector3();
    h.bones['index-finger-tip'].getWorldPosition(tip);
    const inter = new THREE.Vector3();
    h.bones['index-finger-phalanx-intermediate'].getWorldPosition(inter);
    console.warn('sign', sign, 'tip', tip.x.toFixed(3), tip.y.toFixed(3), tip.z.toFixed(3), 'inter', inter.x.toFixed(3), inter.y.toFixed(3), inter.z.toFixed(3));
  }
  const hands = [];
  const poses = ['pinch', 'relaxed', 'open', 'cup', 'grab', 'rest'];
  poses.forEach((p, i) => {
    const h = createHand();
    setPose(h, POSE[p], S_SIGN);
    const xx = (i % 3 - 1) * 0.28, y = i < 3 ? 0.16 : -0.12;
    // palm faces the camera-left (-Z), fingers down; camera on +X sees the thumb side
    orient(h, new THREE.Vector3(xx, y + 0.08, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(-1, 0, 0));
    scene.add(h.holder);
    hands.push(h);
  });
  const cam = new THREE.PerspectiveCamera(35, W / H, 0.01, 50);
  cam.position.set(0, 0.02, 1.25);
  cam.lookAt(0, 0, 0);
  S = { scene, cam };
}
const S_SIGN = parseFloat(new URLSearchParams(location.search).get('sign') || '-1');

export function draw(pen, t) {
  if (!S) setup();
  S.cam.updateMatrixWorld();
  const cv = three().render(S.scene, S.cam);
  pen.main.drawImage(cv, 0, 0, W, H);
  pen.glow.drawImage(cv, 0, 0, W, H);
}
