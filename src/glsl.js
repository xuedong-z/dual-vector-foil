// Shared GLSL: camera rays, hashes, value noise, and the sky every shot looks at.
export const FS_VERT = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export const COMMON = /* glsl */`
precision highp float;
uniform vec3 uCam, uRight, uUp, uFwd;
uniform vec2 uRes, uJit;
uniform float uTanY, uTime, uT;
varying vec2 vUv;
#define PX (2.0 * uTanY / uRes.y)
vec3 rayDir(){
  vec2 n = ((gl_FragCoord.xy + uJit) / uRes * 2.0 - 1.0) * vec2(uRes.x / uRes.y, 1.0) * uTanY;
  return normalize(uFwd + n.x * uRight + n.y * uUp);
}
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec3 hash33(vec3 p3){ p3 = fract(p3 * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yxx) * p3.zyx); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y);
}
float vnoise1(float x){ return vnoise(vec2(x, 0.37)); }
float vnoise3(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
const mat2 ROT = mat2(0.8, -0.6, 0.6, 0.8);
// fbm whose octaves fade out once they are smaller than the pixel (foot = pixel size in units of p)
float fbm2(vec2 p, float foot){
  float s = 0.5, a = 0.5;
  for (int i = 0; i < 6; i++){
    s += a * (vnoise(p) - 0.5) * clamp(1.6 - foot * 1.6, 0.0, 1.0);
    p = ROT * p * 2.03 + 11.7; foot *= 2.03; a *= 0.5;
  }
  return s;
}
float fbm3(vec3 p){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++){ s += a * vnoise3(p); p = p.yzx * 2.02 + 3.1; a *= 0.5; }
  return s;
}
float sph(vec3 ro, vec3 rd, vec3 c, float r, out float dmin){
  vec3 oc = ro - c; float b = dot(oc, rd), h = b * b - dot(oc, oc) + r * r;
  dmin = sqrt(max(dot(oc, oc) - b * b, 0.0));
  return h < 0.0 ? -1.0 : -b - sqrt(h);
}

// ---- the sky: three layers of stars, each star about a pixel wide, and the Milky Way -----------------
vec3 starTint(float h){
  return h < 0.5 ? mix(vec3(1.0, 0.60, 0.36), vec3(1.0, 0.93, 0.84), h * 2.0) : mix(vec3(1.0, 0.96, 0.92), vec3(0.62, 0.76, 1.0), h * 2.0 - 1.0);
}
vec3 starLayer(vec3 rd, float s, float gain, float dens){
  vec3 id = floor(rd * s), h = hash33(id);
  vec3 sd = normalize(id + 0.5 + (h - 0.5) * 0.7);
  float d = length(rd - sd) / PX;
  float mag = pow(hash13(id + 3.1), 14.0);
  return step(1.0 - dens, hash13(id + 19.7)) * starTint(h.x) * gain * (0.004 + mag) * exp(-d * d / 1.1);
}
const vec3 GAL = vec3(0.342, 0.885, -0.316);       // pole of the galaxy
const vec3 GALC = vec3(0.60, -0.48, -0.64);        // roughly toward its centre
vec3 sky(vec3 rd){
  float lat = dot(rd, GAL), band = exp(-lat * lat / 0.035);
  float core = exp(-pow(max(1.0 - dot(rd, normalize(GALC - GAL * dot(GALC, GAL))), 0.0), 1.0) / 0.35);
  float n = fbm3(rd * 3.2 + 1.7), n2 = fbm3(rd * 8.0 + GAL * lat * 18.0);
  float dust = smoothstep(0.40, 0.68, n2) * exp(-lat * lat / 0.006);
  float lum = band * (0.25 + 1.1 * core) * (0.35 + 1.1 * n) * (1.0 - 0.8 * dust);
  vec3 c = lum * mix(vec3(0.50, 0.62, 1.0), vec3(1.0, 0.80, 0.58), core) * 0.030;
  float g = 1.0 + 2.5 * band * (1.0 - 0.7 * dust);
  c += starLayer(rd, 46.0, 6.0 * g, 0.14);
  c += starLayer(rd, 115.0, 1.4 * g, 0.20);
  c += starLayer(rd, 260.0, 0.35 * g, 0.30);
  return c;
}
`;
