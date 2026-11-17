// HDR post chain: mip-pyramid bloom, ACES tone map, grain, vignette.
import * as THREE from 'three';
import { FS_VERT } from './glsl.js';

const mat = (frag, uniforms, extra = {}) => new THREE.ShaderMaterial({
  vertexShader: FS_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, ...extra });

const DOWN = /* glsl */`
uniform sampler2D tex; uniform vec2 uTexel; uniform float uClamp; varying vec2 vUv;
vec3 s(vec2 o){ vec3 c = texture2D(tex, vUv + o * uTexel).rgb; return uClamp > 0.0 ? min(c, vec3(uClamp)) : c; }
void main(){
  vec3 c = s(vec2(0.0)) * 4.0 + (s(vec2(-1.0, -1.0)) + s(vec2(1.0, -1.0)) + s(vec2(-1.0, 1.0)) + s(vec2(1.0, 1.0))) * 2.0
         + s(vec2(-2.0, 0.0)) + s(vec2(2.0, 0.0)) + s(vec2(0.0, -2.0)) + s(vec2(0.0, 2.0));
  gl_FragColor = vec4(c / 16.0, 1.0);
}`;
const UP = /* glsl */`
uniform sampler2D tex; uniform vec2 uTexel; uniform float uW; varying vec2 vUv;
void main(){
  vec3 c = texture2D(tex, vUv).rgb * 4.0;
  c += (texture2D(tex, vUv + vec2(uTexel.x, 0.0)).rgb + texture2D(tex, vUv - vec2(uTexel.x, 0.0)).rgb
      + texture2D(tex, vUv + vec2(0.0, uTexel.y)).rgb + texture2D(tex, vUv - vec2(0.0, uTexel.y)).rgb) * 2.0;
  c += texture2D(tex, vUv + uTexel).rgb + texture2D(tex, vUv - uTexel).rgb
     + texture2D(tex, vUv + vec2(uTexel.x, -uTexel.y)).rgb + texture2D(tex, vUv + vec2(-uTexel.x, uTexel.y)).rgb;
  gl_FragColor = vec4(c / 16.0 * uW, 1.0);
}`;
const COPY = /* glsl */`
uniform sampler2D tex; uniform float uW; varying vec2 vUv;
void main(){ gl_FragColor = vec4(texture2D(tex, vUv).rgb * uW, 1.0); }`;
const FINAL = /* glsl */`
uniform sampler2D tex, bloom; uniform float uExposure, uBloom, uSeed, uGrain; uniform vec2 uRes; varying vec2 vUv;
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main(){
  vec3 c = texture2D(tex, vUv).rgb + texture2D(bloom, vUv).rgb * uBloom;
  vec2 q = vUv - 0.5;
  c *= 1.0 - 0.55 * dot(q, q);
  c = aces(c * uExposure);
  c = pow(c, vec3(1.0 / 2.2));
  c += (hash(gl_FragCoord.xy + uSeed * 91.7) - 0.5) * uGrain;
  gl_FragColor = vec4(c, 1.0);
}`;

export class Post {
  constructor(renderer, w, h, levels = 6) {
    this.r = renderer; this.w = w; this.h = h;
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    const rt = (w, h) => new THREE.WebGLRenderTarget(Math.max(1, w | 0), Math.max(1, h | 0), {
      type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    this.rt = rt;
    this.mips = [];
    for (let i = 1; i <= levels; i++) this.mips.push(rt(w >> i, h >> i));
    this.down = mat(DOWN, { tex: { value: null }, uTexel: { value: new THREE.Vector2() }, uClamp: { value: 0 } });
    this.up = mat(UP, { tex: { value: null }, uTexel: { value: new THREE.Vector2() }, uW: { value: 1 } },
      { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, transparent: true });
    this.copy = mat(COPY, { tex: { value: null }, uW: { value: 1 } });
    this.add = mat(COPY, { tex: { value: null }, uW: { value: 1 } },
      { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, transparent: true });
    this.final = mat(FINAL, { tex: { value: null }, bloom: { value: null }, uExposure: { value: 1 }, uBloom: { value: 0.5 },
      uSeed: { value: 0 }, uGrain: { value: 0.016 }, uRes: { value: new THREE.Vector2(w, h) } });
  }
  pass(material, target, clear = true) {
    this.quad.material = material;
    this.r.setRenderTarget(target);
    if (clear) this.r.clear();
    this.r.render(this.scene, this.cam);
  }
  blit(tex, target, weight = 1, additive = false) {
    const m = additive ? this.add : this.copy;
    m.uniforms.tex.value = tex; m.uniforms.uW.value = weight;
    this.pass(m, target, !additive);
  }
  finish(hdr, seed) {
    let src = hdr;
    this.mips.forEach((m, i) => {
      this.down.uniforms.tex.value = src.texture;
      this.down.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
      this.down.uniforms.uClamp.value = i === 0 ? 40 : 0;
      this.pass(this.down, m); src = m;
    });
    for (let i = this.mips.length - 1; i > 0; i--) {
      const s = this.mips[i], d = this.mips[i - 1];
      this.up.uniforms.tex.value = s.texture;
      this.up.uniforms.uTexel.value.set(1 / s.width, 1 / s.height);
      this.up.uniforms.uW.value = 0.9;
      this.pass(this.up, d, false);
    }
    this.final.uniforms.tex.value = hdr.texture;
    this.final.uniforms.bloom.value = this.mips[0].texture;
    this.final.uniforms.uSeed.value = seed;
    this.pass(this.final, null);
  }
}
