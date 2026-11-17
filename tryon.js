import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const $ = id => document.getElementById(id);
const video = $('video'), still = $('still'), canvas = $('gl'), msg = $('msg');
const say = t => { msg.textContent = t; msg.hidden = !t; };
window.__tryon = { stage: 'init', faces: 0 };

// ---------- three.js scene ----------
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -5000, 5000);

const rig = new THREE.Group();     // positioned on the face each frame
rig.visible = false;
scene.add(rig);
let glassesWidth = 0.14;           // metres, measured from the model

// Head occluder: invisible ellipsoid that hides the far temple arm behind the head.
const occ = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), new THREE.MeshBasicMaterial({ colorWrite: false }));
occ.renderOrder = -1;
rig.add(occ);

const glassesReady = new GLTFLoader().loadAsync('models/SunglassesKhronos.glb').then(g => {
  const m = g.scene;
  // The lenses use glass transmission, which renders black over a camera feed
  // (nothing behind them in the 3D scene). Swap to a tinted see-through lens
  // that keeps the iridescent colour shift.
  m.traverse(o => { if (o.isMesh && o.material && o.material.transmission > 0) {
    const mt = o.material; mt.transmission = 0; mt.transparent = true; mt.opacity = 0.78;
    mt.color = new THREE.Color(0x1b2a3a); mt.roughness = 0.05; mt.metalness = 0.2; mt.depthWrite = false;
    mt.iridescence = Math.max(mt.iridescence || 0, 1); mt.envMapIntensity = 2.5; o.renderOrder = 2; } });
  const box = new THREE.Box3().setFromObject(m);
  const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  // Model faces +Z. Put the front frame (max z) at the origin, horizontally centred,
  // vertically centred on the lenses.
  const front = m.getObjectByName('Frames');
  const fb = front ? new THREE.Box3().setFromObject(front) : box;
  const fc = fb.getCenter(new THREE.Vector3());
  m.position.set(-fc.x, -fc.y, -fb.max.z);
  glassesWidth = fb.getSize(new THREE.Vector3()).x || size.x;
  const holder = new THREE.Group(); holder.add(m); rig.add(holder);
  // head ellipsoid in glasses space (metres)
  const w = glassesWidth;
  occ.scale.set(w * 0.47, w * 0.75, w * 0.62);
  occ.position.set(0, -w * 0.1, -w * 0.66);
  window.__tryon.glasses = { w: glassesWidth, size: size.toArray(), depth: size.z };
});

// ---------- face tracking ----------
let landmarker = null, running = false, mode = 'VIDEO';
async function initLandmarker() {
  if (landmarker) return landmarker;
  say('Loading face tracking…');
  const fileset = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
  const opts = (delegate) => ({
    baseOptions: { modelAssetPath: 'models/face_landmarker.task', delegate },
    runningMode: 'VIDEO', numFaces: 1, outputFacialTransformationMatrixes: true,
    minFaceDetectionConfidence: 0.5, minTrackingConfidence: 0.5,
  });
  try { landmarker = await FaceLandmarker.createFromOptions(fileset, opts('GPU')); }
  catch (e) { landmarker = await FaceLandmarker.createFromOptions(fileset, opts('CPU')); }
  window.__tryon.stage = 'landmarker';
  return landmarker;
}

function resize(w, h) {
  if (canvas.width !== w || canvas.height !== h) {
    renderer.setSize(w, h, false);
    cam.left = -w / 2; cam.right = w / 2; cam.top = h / 2; cam.bottom = -h / 2; cam.updateProjectionMatrix();
  }
}

const sm = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 0, init: false };
const tmpM = new THREE.Matrix4(), tq = new THREE.Quaternion(), tp = new THREE.Vector3(), tsc = new THREE.Vector3();

function place(res, W, H, smooth) {
  if (!res || !res.faceLandmarks || !res.faceLandmarks.length) { rig.visible = false; window.__tryon.faces = 0; return false; }
  window.__tryon.faces = res.faceLandmarks.length;
  const L = res.faceLandmarks[0];
  const P = i => new THREE.Vector3((L[i].x - 0.5) * W, (0.5 - L[i].y) * H, -L[i].z * W);
  const le = P(33), re = P(263);               // outer eye corners
  const bridge = P(168);                        // between the eyes
  const eyeMid = le.clone().add(re).multiplyScalar(0.5);
  const anchor = bridge.clone().lerp(eyeMid, 0.55); // lens centre sits slightly below 168
  const eyeDist = le.distanceTo(re);
  const scale = (eyeDist * 1.52 * parseFloat($('size').value)) / glassesWidth;

  // rotation from MediaPipe's facial transformation matrix (column-major)
  if (res.facialTransformationMatrixes && res.facialTransformationMatrixes.length) {
    tmpM.fromArray(res.facialTransformationMatrixes[0].data);
    tmpM.decompose(tp, tq, tsc);
  } else {
    const roll = Math.atan2(re.y - le.y, re.x - le.x);
    tq.setFromEuler(new THREE.Euler(0, 0, roll));
  }
  const a = smooth && sm.init ? 0.55 : 1;
  sm.p.lerp(anchor, a); sm.q.slerp(tq, a); sm.s = sm.init && smooth ? sm.s + (scale - sm.s) * a : scale; sm.init = true;
  rig.position.copy(sm.p); rig.quaternion.copy(sm.q); rig.scale.setScalar(sm.s);
  rig.visible = true;
  return true;
}

async function loop() {
  if (!running) return;
  if (video.readyState >= 2) {
    const W = video.videoWidth, H = video.videoHeight; resize(W, H);
    const res = landmarker.detectForVideo(video, performance.now());
    const ok = place(res, W, H, true);
    say(ok ? '' : 'Looking for your face… face the camera in good light.');
    renderer.render(scene, cam);
    window.__tryon.frames = (window.__tryon.frames || 0) + 1;
  }
  requestAnimationFrame(loop);
}

$('start').onclick = async () => {
  try {
    if (!window.isSecureContext) throw new Error('This page must be opened over HTTPS for the camera to work.');
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot open the camera.');
    say('Asking for camera permission…');
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 } }, audio: false });
    video.srcObject = stream; still.hidden = true; video.hidden = false;
    await video.play();
    await Promise.all([initLandmarker(), glassesReady]);
    if (mode !== 'VIDEO') { await landmarker.setOptions({ runningMode: 'VIDEO' }); mode = 'VIDEO'; }
    running = true; window.__tryon.stage = 'running'; $('start').textContent = '📷 Camera on';
    loop();
  } catch (e) {
    console.error(e); window.__tryon.stage = 'error: ' + e.message;
    say(e.name === 'NotAllowedError' ? 'Camera permission was blocked. Allow camera access in your browser settings, or use a photo instead.' : (e.message || 'Could not start the camera.'));
  }
};

$('file').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  running = false; if (video.srcObject) { video.srcObject.getTracks().forEach(t => t.stop()); video.srcObject = null; }
  still.src = URL.createObjectURL(f); still.hidden = false; video.hidden = true;
  await still.decode(); await Promise.all([initLandmarker(), glassesReady]);
  if (mode !== 'IMAGE') { await landmarker.setOptions({ runningMode: 'IMAGE' }); mode = 'IMAGE'; }
  const W = still.naturalWidth, H = still.naturalHeight; resize(W, H); sm.init = false;
  const ok = place(landmarker.detect(still), W, H, false);
  renderer.render(scene, cam);
  say(ok ? '' : 'No face found in that photo. Try a clear, front-facing selfie.');
  window.__tryon.stage = 'photo';
};
$('size').oninput = () => { if (!running && !still.hidden) $('file').onchange({ target: $('file') }); };
glassesReady.catch(e => say('Could not load the sunglasses model: ' + e.message));
