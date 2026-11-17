// Boot, frame rendering and live playback.
//   ?t=12.3   hold one moment (look-dev)      ?start=9   start playback there
//   ?hq=1     1920x1080, 4 samples per pixel  ?ev=1.5    exposure
import * as THREE from 'three';
import { makeShots } from './shots.js';
import { Post } from './post.js';
import { DUR, frame } from './timeline.js';
import { renderAudio } from './audio.js';

const Q = new URLSearchParams(location.search);
const HOLD = Q.has('t') ? parseFloat(Q.get('t')) : null;
const HQ = Q.has('hq');
const W = +(Q.get('w') || (HQ ? 1920 : 1280)), H = +(Q.get('h') || (HQ ? 1080 : 720));
const SPP = +(Q.get('spp') || (HQ || HOLD !== null ? 4 : 1));
const EV = +(Q.get('ev') || 1.0);
const msg = document.getElementById('msg');

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.autoClear = false;
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

const post = new Post(renderer, W, H);
const hdrRT = post.rt(W, H), accumRT = SPP > 1 ? post.rt(W, H) : null;
const shots = makeShots();
post.final.uniforms.uGrain.value = 0.006;
post.final.uniforms.uBloom.value = +(Q.get('bloom') || 0.5);

const V = (x, y, z) => new THREE.Vector3(x, y, z);
function renderHDR(t, jx, jy, target) {
  const f = frame(t), m = shots[f.shot], u = m.uniforms;
  const pos = V(...f.pos), fwd = V(...f.tgt).sub(pos).normalize();
  const r0 = V().crossVectors(fwd, V(0, 1, 0)).normalize(), u0 = V().crossVectors(r0, fwd);
  const c = Math.cos(f.roll), s = Math.sin(f.roll);
  u.uCam.value.copy(pos); u.uFwd.value.copy(fwd);
  u.uRight.value.copy(r0).multiplyScalar(c).addScaledVector(u0, s);
  u.uUp.value.copy(u0).multiplyScalar(c).addScaledVector(r0, -s);
  u.uRes.value.set(W, H); u.uJit.value.set(jx, jy);
  u.uTanY.value = Math.tan(f.fov * Math.PI / 360); u.uTime.value = t; u.uT.value = f.tau;
  for (const k in f.u) { const v = f.u[k]; if (Array.isArray(v)) u[k].value.set(...v); else u[k].value = v; }
  post.final.uniforms.uExposure.value = EV * f.exposure;
  post.pass(m, target);
}
let frameNo = 0;
function renderFrame(t) {
  frameNo++;
  if (SPP > 1) {
    renderer.setRenderTarget(accumRT); renderer.clear();
    for (let k = 0; k < SPP; k++) {
      renderHDR(t, ((k * 0.5 + 0.25) % 1) - 0.5, ((k * 0.3333 + 0.4) % 1) - 0.5 + (k > 1 ? 0.25 : 0), hdrRT);
      post.blit(hdrRT.texture, accumRT, 1 / SPP, true);
    }
    post.finish(accumRT, frameNo);
  } else {
    renderHDR(t, 0, 0, hdrRT);
    post.finish(hdrRT, frameNo);
  }
}
window.__seek = t => { renderFrame(t); return t; };

const START = +(Q.get('start') || 0);
let t0 = performance.now() - START * 1000, audioCtx = null, buf = null, src = null;
const restartAudio = () => {
  if (!audioCtx || !buf) return;
  if (src) src.stop();
  src = audioCtx.createBufferSource(); src.buffer = buf; src.connect(audioCtx.destination); src.start();
};
msg.textContent = HOLD === null ? 'click for sound' : `t = ${HOLD}`;
const audioReady = HOLD === null ? renderAudio() : null;
addEventListener('click', async () => {
  if (audioCtx || !audioReady) return;
  audioCtx = new AudioContext({ sampleRate: 48000 });
  msg.textContent = 'preparing sound';
  buf = await audioReady; t0 = performance.now(); restartAudio(); msg.textContent = '';
});
let acc = 0, cnt = 0, prev = performance.now();
function loop() {
  const now = performance.now(); acc += now - prev; prev = now;
  if (++cnt >= 40) { window.__ms = acc / cnt; acc = 0; cnt = 0; }
  let t = HOLD !== null ? HOLD : (now - t0) / 1000;
  if (t >= DUR) { t0 = now; t = 0; restartAudio(); }
  renderFrame(t);
  if (HOLD === null) requestAnimationFrame(loop);
}
loop();
