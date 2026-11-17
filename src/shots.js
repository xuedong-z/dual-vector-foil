// The three shots, each one full-screen ray-traced fragment shader.
//   FOIL    a slip of light drifting between the stars; its glow goes out and the plane opens
//   SATURN  a ringed giant sinking into the plane and spreading out as growth rings
//   PLUTO   looking back from the ice: the Solar System as a painting in the sky
import * as THREE from 'three';
import { FS_VERT, COMMON } from './glsl.js';

const FOIL = COMMON + /* glsl */`
uniform vec3 uFR, uFU, uFN, uSun;
uniform float uGlow, uPlaneR;
void main(){
  vec3 rd = rayDir(), ro = uCam;
  float tn = dot(rd, uFN), t = -dot(ro, uFN) / tn;
  vec3 q = ro + rd * t;
  float a = dot(q, uFR), b = dot(q, uFU), rho = length(vec2(a, b));
  float pxm = PX * abs(t) / max(abs(tn), 0.04);
  vec2 e = vec2(abs(a) - 0.0428, abs(b) - 0.0270);
  float sd = length(max(e, 0.0)) + min(max(e.x, e.y), 0.0);
  float cov = t > 0.0 ? clamp(0.5 - sd / pxm, 0.0, 1.0) : 0.0;
  // the stars behind the slip are bent a little
  vec3 rb = normalize(rd + cov * (uFR * a + uFU * b) * 0.9 * (0.3 + 0.7 * uGlow));
  vec3 col = sky(rb);
  float ds = length(rb - uSun) / PX;
  col += vec3(1.0, 0.95, 0.86) * (60.0 * exp(-ds * ds / 1.6) + 0.5 / (1.0 + ds * ds * 0.02));
  // the plane, once it lets go: a film opening at the speed of light
  if (uPlaneR > 0.0 && t > 0.0){
    float w = pxm * 1.2 + 0.004 * uPlaneR;
    float inside = smoothstep(uPlaneR, uPlaneR - w, rho), mu = abs(tn);
    vec3 sheen = (0.5 + 0.5 * cos(vec3(0.0, 2.1, 4.2) + 14.0 * mu + 3.0 * log(rho + 1e-3))) * pow(1.0 - mu, 3.0) * 0.022;
    col = mix(col, col * 0.45 + sheen, inside);
    col += vec3(0.75, 0.88, 1.0) * 7.0 * exp(-abs(rho - uPlaneR) / w);
  }
  // the slip itself
  float edge = exp(min(sd, 0.0) / 0.0022), mu = abs(tn);
  vec3 fc = vec3(0.78, 0.89, 1.0) * (0.075 + 0.40 * edge + 0.10 * pow(1.0 - mu, 2.0));
  fc *= 1.0 + 0.07 * cos(vec3(0.0, 2.1, 4.2) + mu * 16.0 + a * 80.0 - b * 50.0);
  col = mix(col, col * mix(0.9, 0.75, uGlow) + fc * uGlow + vec3(0.6, 0.75, 1.0) * edge * 0.035, cov);
  // the field wrapped around it
  float d0 = length(cross(ro, rd));
  col += vec3(0.62, 0.80, 1.0) * uGlow * 0.000022 / (d0 * d0 + 0.0006);
  gl_FragColor = vec4(col, 1.0);
}`;

const SATURN = COMMON + /* glsl */`
uniform vec3 uSun;
uniform float uYc, uR2, uH, uEm, uDeb;
const vec3 RN = vec3(0.3793, 0.8984, 0.2196);      // the planet's axis; the rings lie across it
const float SUNI = 1.55;
const vec3 GLOWC = vec3(1.0, 0.78, 0.50);
float ringDens(float r){
  if (r < 1.24 || r > 2.27) return 0.0;
  float d = smoothstep(1.24, 1.32, r) * 0.16;                               // C ring
  d = mix(d, 0.95, smoothstep(1.52, 1.545, r));                             // B ring
  d *= 1.0 - 0.97 * smoothstep(1.945, 1.955, r) * smoothstep(2.03, 2.02, r); // Cassini division
  d = mix(d, 0.55, smoothstep(2.02, 2.035, r));                             // A ring
  d *= 1.0 - 0.9 * smoothstep(2.207, 2.211, r) * smoothstep(2.223, 2.219, r); // Encke gap
  d *= smoothstep(2.27, 2.262, r);
  return clamp(d * (0.72 + 0.30 * vnoise1(r * 85.0) + 0.22 * (vnoise1(r * 310.0) - 0.5)), 0.0, 1.0);
}
vec3 saturnCol(vec3 n){
  float lat = dot(n, RN);
  float l2 = lat + 0.020 * (fbm3(n * 4.0 + RN * lat * 13.0) - 0.5) + 0.004 * (fbm3(n * 17.0 + RN * lat * 50.0) - 0.5);
  float b = vnoise1(l2 * 10.0 + 3.0) * 0.55 + vnoise1(l2 * 26.0) * 0.30 + vnoise1(l2 * 61.0) * 0.15;
  vec3 c = mix(vec3(0.74, 0.57, 0.36), vec3(0.97, 0.87, 0.66), smoothstep(0.25, 0.75, b));
  c = mix(c, vec3(0.86, 0.72, 0.50), 0.35 * smoothstep(0.1, 0.0, abs(lat)));
  return 0.85 * mix(c, vec3(0.58, 0.60, 0.56), smoothstep(0.70, 0.96, abs(lat)) * 0.75);
}
vec3 layerCol(float d, out float em){             // what the giant is made of, from cloud tops (0) to core (1)
  vec3 c = mix(vec3(0.92, 0.72, 0.42), vec3(0.66, 0.36, 0.13), smoothstep(0.0, 0.13, d));
  c = mix(c, vec3(0.21, 0.12, 0.10), smoothstep(0.12, 0.30, d));
  c = mix(c, vec3(0.06, 0.17, 0.34), smoothstep(0.27, 0.48, d));
  c = mix(c, vec3(0.34, 0.60, 0.98), smoothstep(0.48, 0.72, d));
  c = mix(c, vec3(1.0, 0.80, 0.46), smoothstep(0.72, 0.85, d));
  c = mix(c, vec3(1.0, 0.97, 0.90), smoothstep(0.90, 1.0, d));
  c *= 0.55;
  em = 0.02 + 0.08 * smoothstep(0.50, 0.70, d) + 1.1 * smoothstep(0.84, 0.98, d);
  return c;
}
float sunShadow(vec3 p, vec3 C){
  float dm, sh = 1.0, ts = sph(p, uSun, C, 1.0, dm);
  if (ts > 0.0 && (p + uSun * ts).y > 0.0) sh = 0.06;
  float tr = dot(C - p, RN) / dot(uSun, RN);
  if (tr > 0.0){ vec3 pr = p + uSun * tr; if (pr.y > 0.0) sh *= 1.0 - 0.8 * ringDens(length(pr - C)); }
  return sh;
}
vec4 disc(vec3 P, float tP, vec3 rd, vec3 C){
  vec2 x = P.xz; float r = length(x);
  if (r > uR2 * 1.8 + 0.5) return vec4(0.0);
  float foot = PX * tP / max(abs(rd.y), 0.03);
  float rc = sqrt(max(1.0 - uYc * uYc, 0.0));
  float sw = 0.9 * log(r + 0.5) + 0.03 * uT, cs = cos(sw), sn = sin(sw);
  vec2 w = mat2(cs, -sn, sn, cs) * x;
  float n1 = fbm2(w * 0.9, foot * 0.9), n2 = fbm2(w * 3.7 + 7.0, foot * 3.7), n3 = fbm2(w * 15.0 + 3.0, foot * 15.0);
  float g = r + (0.26 * (n1 - 0.5) + 0.11 * (n2 - 0.5)) * smoothstep(0.0, 1.2, r - rc) + 0.022 * (n3 - 0.5);
  float u = clamp((g - rc) / max(uR2 - rc, 1e-3), 0.0, 1.0);
  float d = min(uH, 1.0) * (0.62 + 0.38 * smoothstep(1.0, 2.0, uH)) * pow(1.0 - u, 1.25);
  float em; vec3 c = layerCol(d + 0.035 * (n2 - 0.5), em);
  float k1 = clamp(1.0 - foot * 80.0, 0.0, 1.0), k2 = clamp(1.0 - foot * 20.0, 0.0, 1.0), k3 = clamp(1.0 - foot * 6.0, 0.0, 1.0);
  float s1 = sin(g * 160.0 + n1 * 20.0), s2 = sin(g * 41.0 + n2 * 6.0), s3 = sin(g * 11.0 + n1 * 9.0);
  float tone = 1.0 + 0.30 * k1 * smoothstep(-0.4, 0.4, s1) - 0.15 * k1 + 0.36 * k2 * smoothstep(-0.25, 0.25, s2) - 0.18 * k2 + 0.30 * k3 * s3;
  tone *= 1.0 - 0.55 * k2 * pow(abs(s2), 24.0) - 0.35 * k1 * pow(abs(s1), 10.0);        // dark hairlines between the rings
  c = pow(c, vec3(1.25)) * 1.5 * tone * (0.75 + 0.9 * (n3 - 0.5) + 0.5 * n2);
  float sh = sunShadow(P + vec3(0.0, 1e-4, 0.0), C);
  vec3 lit = c * (SUNI * 0.50 * uSun.y * sh + 0.01) + c * em * uEm;
  if (uYc > -1.0) lit += vec3(1.0, 0.74, 0.44) * 1.3 * exp(-max(r - rc, 0.0) / 0.035) * (0.6 + 0.8 * n3);   // matter pouring in
  lit += vec3(0.55, 0.78, 1.0) * 1.6 * exp(-abs(g - uR2) / (0.02 + foot));                                 // the leading edge
  float a = smoothstep(uR2, uR2 - 0.02 - foot, g);
  // the rings come down as thin bands of ice beyond the edge
  float deb = smoothstep(uR2 * 1.75, uR2 * 1.08, g) * step(uR2 - 0.03, g) * uDeb
            * (0.2 + 0.8 * vnoise1(g * 23.0)) * (0.6 + 0.4 * sin(g * 95.0) * clamp(1.0 - foot * 48.0, 0.0, 1.0));
  vec3 dc = vec3(0.80, 0.86, 0.96) * (SUNI * uSun.y * 1.0 * sh + 0.04);
  float da = (1.0 - a) * deb * 0.7;
  return vec4(lit * a + dc * da, a + da);
}
void main(){
  vec3 rd = rayDir(), ro = uCam, C = vec3(0.0, uYc, 0.0);
  vec3 col = sky(rd);
  float ds = length(rd - uSun) / PX;
  col += vec3(1.0, 0.95, 0.86) * (300.0 * exp(-ds * ds / 2.0) + 0.6 / (1.0 + ds * ds * 0.02));
  float glowI = uEm * smoothstep(0.0, 0.8, uH);
  // the plane
  float tP = rd.y < 0.0 ? -ro.y / rd.y : -1.0;
  if (tP > 0.0){ vec4 dd = disc(ro + rd * tP, tP, rd, C); col = col * (1.0 - dd.a) + dd.rgb; }
  float front = 1.0 - 0.62 * smoothstep(0.0, 0.8, dot(-rd, uSun));   // the eye stops down when the Sun is behind it
  // what is left of the globe
  float dm, tS = sph(ro, rd, C, 1.0, dm);
  bool globe = false;
  if (tS > 0.0){
    vec3 p = ro + rd * tS;
    if (p.y > 0.0){
      globe = true;
      vec3 n = normalize(p - C), alb = saturnCol(n);
      float nl = dot(n, uSun), diff = pow(max(nl, 0.0), 0.8) * smoothstep(-0.02, 0.12, nl);
      diff *= mix(0.55, 1.0, pow(max(dot(n, -rd), 0.0), 0.4));
      float tr = dot(C - p, RN) / dot(uSun, RN);
      if (tr > 0.0){ vec3 pr = p + uSun * tr; if (pr.y > 0.0) diff *= 1.0 - 0.82 * ringDens(length(pr - C)); }
      vec3 up = GLOWC * glowI * 0.55 * pow(0.5 - 0.5 * n.y, 1.6) * exp(-p.y * 0.9);
      vec3 sc = alb * (SUNI * diff * front + up + 0.006);
      sc += vec3(1.0, 0.76, 0.46) * 0.7 * exp(-p.y / 0.03);
      col = mix(col, sc, clamp(0.5 + (1.0 - dm) / (PX * tS), 0.0, 1.0));
    }
  }
  // the rings still above the plane
  float tR = dot(C - ro, RN) / dot(rd, RN);
  if (tR > 0.0 && (!globe || tR < tS)){
    vec3 pr = ro + rd * tR;
    if (pr.y > 0.0){
      float tau = ringDens(length(pr - C));
      if (tau > 0.0){
        bool litSide = dot(uSun, RN) * dot(-rd, RN) > 0.0;
        float bq = litSide ? pow(tau, 0.6) : 3.5 * tau * exp(-3.5 * tau);
        float dm2, sh = sph(pr, uSun, C, 1.0, dm2) > 0.0 ? 0.03 : 1.0;
        vec3 rc = vec3(0.88, 0.80, 0.66) * (SUNI * 0.50 * bq * sh * front + 0.004) + GLOWC * glowI * 0.08 * tau * exp(-pr.y * 0.7);
        rc += vec3(1.0, 0.78, 0.50) * 0.5 * tau * exp(-pr.y / 0.02);
        float al = 1.0 - exp(-3.0 * tau / max(abs(dot(rd, RN)), 0.05));
        col = col * (1.0 - al) + rc * al;
      }
    }
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const PLUTO = COMMON + /* glsl */`
uniform vec3 uLd, uPn, uPa, uPb, uChar;
uniform float uGrow;
const vec3 LC = vec3(1.0, 0.86, 0.68) * 0.50;
const float PS = 0.032;
vec2 voro(vec2 p){
  vec2 i = floor(p), f = fract(p); float f1 = 8.0, f2 = 8.0;
  for (int j = -1; j <= 1; j++) for (int k = -1; k <= 1; k++){
    vec2 g = vec2(float(k), float(j)); float d = length(g + hash22(i + g) - f);
    if (d < f1){ f2 = f1; f1 = d; } else if (d < f2) f2 = d;
  }
  return vec2(f2 - f1, f1);
}
float gM;
float terr(vec2 p, int oct, bool fine){
  float m = smoothstep(2.5, 8.5, length(p - vec2(0.0, -1.0)) + 3.5 * (vnoise(p * 0.13 + 5.0) - 0.5));
  gM = m;
  float s = 0.0, a = 0.5, f = 0.16; vec2 q = p;
  for (int i = 0; i < oct; i++){ float n = 1.0 - abs(2.0 * vnoise(q * f) - 1.0); s += a * n * n; a *= 0.48; f *= 2.07; q = ROT * q; }
  float h = m * (2.7 * s - 0.2) + 0.05 * vnoise(p * 0.5);
  if (fine){
    h -= (1.0 - m) * 0.012 * (1.0 - smoothstep(0.0, 0.05, voro(p * 0.45).x));
    h -= (1.0 - m) * 0.0045 * smoothstep(0.42, 0.10, voro(p * 11.0).y);
    h += (1.0 - m) * 0.003 * vnoise(p * 9.0) + m * 0.02 * vnoise(p * 7.0);
  }
  return h;
}
float ground(vec3 p, float t){ vec2 dx = p.xz - uCam.xz; return terr(p.xz, t < 25.0 ? 8 : 6, t < 9.0) - dot(dx, dx) / 2376.0; }

// the Solar System, flattened: q in units of the Sun's old radius
vec3 eye(vec2 q, vec2 c, float rad, vec3 c0, vec3 c1, vec3 c2, float fw){
  float d = length(q - c) / rad;
  if (d > 1.0) return vec3(0.0);
  float n = vnoise((q - c) / rad * 3.0 + c);
  float ph = d * 26.0 + n * 5.0, r = 0.5 + 0.5 * sin(ph) * clamp(1.0 - fw / rad * 6.0, 0.0, 1.0);
  vec3 col = mix(mix(c0, c1, smoothstep(0.15, 0.55, d)), c2, smoothstep(0.55, 0.95, d)) * (0.55 + 0.9 * r);
  return col * 0.09 * smoothstep(1.0, 0.9, d);
}
vec4 painting(vec3 rd){
  float dn = dot(rd, uPn); if (abs(dn) < 1e-4) return vec4(0.0);
  float t = dot(uLd, uPn) / dn; if (t < 0.0) return vec4(0.0);
  vec3 Q = rd * t - uLd;
  vec2 q = vec2(dot(Q, uPa), dot(Q, uPb)) / (PS * uGrow);
  float r = length(q); if (r > 13.5) return vec4(0.0);
  float fw = PX * t / (PS * uGrow) / max(abs(dn), 0.05);          // pixel size in q
  float sw = 2.0 * log(r + 0.45) - 0.05 * uT, cs = cos(sw), sn = sin(sw);
  vec2 w = mat2(cs, -sn, sn, cs) * q;
  float n = fbm2(w * 1.1, fw * 1.1), n2 = fbm2(w * 3.6 + n * 2.0, fw * 3.6);
  float rr = r + 0.35 * (n - 0.5);
  float core = smoothstep(1.2, 0.85, rr);
  float gran = vnoise(w * 9.0) * 0.6 + vnoise(w * 21.0) * 0.4;
  vec3 c = core * vec3(1.0, 0.90, 0.72) * (9.0 + 7.0 * gran);
  float fl = exp(-max(rr - 1.0, 0.0) / 1.05);
  float fil = pow(0.5 + 0.5 * sin(rr * 14.0 + 7.0 * n2) * clamp(1.0 - fw * 5.0, 0.0, 1.0), 2.5);
  c += (1.0 - core) * fl * mix(vec3(1.0, 0.30, 0.05), vec3(1.0, 0.78, 0.34), fil) * (0.8 + 4.5 * fil) * smoothstep(0.15, 0.6, n + 0.25 * fl);
  // thin films where the dust of the orbits came down
  float film = (0.5 + 0.5 * sin(rr * 6.5 + 4.0 * n) * clamp(1.0 - fw * 2.5, 0.0, 1.0)) * smoothstep(13.0, 10.5, rr) * smoothstep(1.5, 3.5, rr);
  c += mix(vec3(0.22, 0.33, 0.62), vec3(0.55, 0.36, 0.22), n2) * 0.10 * film * (0.3 + n2);
  // the worlds
  c += eye(q, vec2(2.0, 0.9), 0.14, vec3(1.0, 0.8, 0.5), vec3(0.6, 0.5, 0.4), vec3(0.4, 0.36, 0.33), fw) * 1.2;
  c += eye(q, vec2(-2.6, 1.6), 0.26, vec3(1.0, 0.75, 0.35), vec3(0.95, 0.85, 0.6), vec3(1.0, 0.95, 0.8), fw) * 1.6;
  c += eye(q, vec2(-1.6, -3.4), 0.30, vec3(1.0, 0.7, 0.3), vec3(0.2, 0.42, 0.9), vec3(0.75, 0.9, 1.0), fw) * 2.0;
  c += eye(q, vec2(4.4, -1.8), 0.20, vec3(1.0, 0.6, 0.3), vec3(0.8, 0.36, 0.2), vec3(0.6, 0.3, 0.2), fw) * 1.3;
  c += eye(q, vec2(3.4, 5.6), 0.95, vec3(1.0, 0.9, 0.7), vec3(0.85, 0.55, 0.30), vec3(0.95, 0.85, 0.68), fw) * 1.7;
  c += eye(q, vec2(-7.6, 2.6), 0.85, vec3(1.0, 0.92, 0.75), vec3(0.45, 0.60, 0.85), vec3(0.95, 0.84, 0.60), fw) * 1.5;
  c += eye(q, vec2(-5.0, -8.2), 0.50, vec3(0.9, 0.95, 1.0), vec3(0.45, 0.85, 0.90), vec3(0.6, 0.9, 0.95), fw) * 1.3;
  c += eye(q, vec2(8.6, -6.4), 0.48, vec3(0.8, 0.9, 1.0), vec3(0.20, 0.38, 0.95), vec3(0.3, 0.5, 1.0), fw) * 1.3;
  float edge = exp(-abs(rr - 12.6) / 0.08);
  c += vec3(0.5, 0.7, 1.0) * 0.35 * edge;
  return vec4(c, smoothstep(13.0, 12.6, rr));
}
vec3 heavens(vec3 rd){
  vec4 pt = painting(rd);
  vec3 col = sky(rd) * (1.0 - 0.55 * pt.a) + pt.rgb;
  // Charon
  float dm, tc = sph(vec3(0.0), rd, uChar, 0.034, dm);
  if (tc > 0.0){
    vec3 n = normalize(rd * tc - uChar);
    float mot = fbm3(n * 3.0 + 4.0), cr = smoothstep(0.52, 0.60, fbm3(n * 9.0));
    vec3 alb = mix(vec3(0.36, 0.35, 0.34), vec3(0.50, 0.48, 0.46), mot) * (1.0 - 0.25 * cr);
    alb = mix(alb, vec3(0.30, 0.17, 0.12), smoothstep(0.55, 0.9, n.y + 0.3 * (mot - 0.5)));
    vec3 sc = alb * (LC * 0.8 * max(dot(n, uLd), 0.0) + vec3(0.004, 0.005, 0.007));
    col = mix(col, sc, clamp(0.5 + (0.034 - dm) / PX, 0.0, 1.0));
  }
  // Pluto's thin blue haze, in layers
  float hz = exp(-max(rd.y + 0.03, 0.0) * 20.0) * (0.75 + 0.25 * sin(rd.y * 230.0 + 2.0 * vnoise1(rd.x * 3.0)));
  col += vec3(0.035, 0.07, 0.17) * hz * (0.5 + 3.0 * pow(max(dot(rd, uLd), 0.0), 6.0));
  return col;
}
void main(){
  vec3 rd = rayDir(), ro = uCam;
  float t = 0.02; bool hit = false;
  for (int i = 0; i < 150; i++){
    vec3 p = ro + rd * t;
    float dh = p.y - ground(p, t);
    if (dh < 0.0012 * t){ hit = true; break; }
    t += min(max(dh / (mix(0.07, 1.5, gM) + abs(rd.y)) * 0.8, 0.002 * t + 0.002), 0.6 + 0.02 * t);
    if (t > 130.0) break;
  }
  vec3 col;
  if (hit){
    vec3 p = ro + rd * t;
    float e = max(0.0015 * t, 0.004);
    float hx = ground(p + vec3(e, 0, 0), t) - ground(p - vec3(e, 0, 0), t), hz = ground(p + vec3(0, 0, e), t) - ground(p - vec3(0, 0, e), t);
    vec3 n = normalize(vec3(-hx, 2.0 * e, -hz));
    float m = gM;
    float near = smoothstep(8.0, 1.0, t);
    n = normalize(n + near * 0.10 * vec3(vnoise(p.xz * 45.0) - 0.5, 0.0, vnoise(p.xz * 45.0 + 9.0) - 0.5)
                  + near * 0.07 * vec3(vnoise(p.xz * 150.0) - 0.5, 0.0, vnoise(p.xz * 150.0 + 9.0) - 0.5));
    // shadow toward the painting
    float sh = 1.0, s = 0.03;
    for (int i = 0; i < 36; i++){
      vec3 ps = p + n * 0.004 + uLd * s;
      float dh = ps.y - ground(ps, 30.0);
      sh = min(sh, 14.0 * dh / s);
      if (sh < 0.0) break;
      s += max(dh * 0.6, 0.04);
      if (s > 14.0) break;
    }
    sh = clamp(sh, 0.0, 1.0);
    vec3 alb = mix(vec3(0.52, 0.54, 0.56), vec3(0.42, 0.42, 0.42), m);
    alb *= 0.80 + 0.40 * smoothstep(0.3, 0.7, vnoise(p.xz * 0.9 + 3.0)) * (1.0 - m);
    alb = mix(alb, vec3(0.40, 0.23, 0.15), smoothstep(0.42, 0.68, vnoise(p.xz * 0.33 + 9.0)) * (0.25 + 0.6 * m));
    if (t < 6.0) alb *= 1.0 - 0.22 * (1.0 - m) * (1.0 - smoothstep(0.0, 0.03, voro(p.xz * 0.45).x));
    alb *= 0.88 + 0.24 * vnoise(p.xz * 3.0) * vnoise(p.xz * 17.0);
    float nl = clamp((dot(n, uLd) + 0.06) / 1.06, 0.0, 1.0);
    vec3 hv = normalize(uLd - rd);
    float fr = 0.04 + 0.96 * pow(1.0 - max(dot(hv, -rd), 0.0), 5.0);
    float spec = pow(max(dot(n, hv), 0.0), 400.0) * min(fr, 0.35) * 0.45 * mix(1.0, 0.3, m);
    col = alb * (LC * nl * (0.02 + 0.98 * sh) + LC * 0.03 * n.y * n.y + vec3(0.010, 0.014, 0.024) * (0.5 + 0.5 * n.y)) + LC * spec * sh;
    vec3 hazeC = vec3(0.035, 0.07, 0.17) * (0.5 + 3.0 * pow(max(dot(rd, uLd), 0.0), 6.0));
    col = mix(col, hazeC, 1.0 - exp(-t * 0.006));
  } else col = heavens(rd);
  gl_FragColor = vec4(col, 1.0);
}`;

const v3 = () => new THREE.Vector3();
const base = () => ({ uCam: { value: v3() }, uRight: { value: v3() }, uUp: { value: v3() }, uFwd: { value: v3() },
  uRes: { value: new THREE.Vector2() }, uJit: { value: new THREE.Vector2() }, uTanY: { value: 1 }, uTime: { value: 0 }, uT: { value: 0 } });
const make = (frag, extra) => new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, depthTest: false, depthWrite: false,
  uniforms: { ...base(), ...extra } });

export const makeShots = () => [
  make(FOIL, { uFR: { value: v3() }, uFU: { value: v3() }, uFN: { value: v3() }, uSun: { value: v3() }, uGlow: { value: 1 }, uPlaneR: { value: 0 } }),
  make(SATURN, { uSun: { value: v3() }, uYc: { value: 0 }, uR2: { value: 1 }, uH: { value: 0 }, uEm: { value: 1 }, uDeb: { value: 0 } }),
  make(PLUTO, { uLd: { value: v3() }, uPn: { value: v3() }, uPa: { value: v3() }, uPb: { value: v3() }, uChar: { value: v3() }, uGrow: { value: 1 } }),
];
