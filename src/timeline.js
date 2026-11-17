// What happens when: three shots, their cameras and the numbers the shaders need.
export const DUR = 31, FPS = 30;
export const CUT1 = 9.0, CUT2 = 21.5;                      // foil | saturn | pluto

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const cr = (a, b, c, d, u) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
const track = keys => t => {
  let i = 0; while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const a = keys[Math.max(i - 1, 0)], b = keys[i], c = keys[i + 1], d = keys[Math.min(i + 2, keys.length - 1)];
  const u = clamp((t - b[0]) / (c[0] - b[0]));
  return b.slice(1).map((_, k) => cr(a[k + 1], b[k + 1], c[k + 1], d[k + 1], u));
};
const norm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const add = (a, b, k = 1) => a.map((x, i) => x + k * b[i]);

// ---- shot 1: the foil (metres; the slip is 86 x 54 mm at the origin) ---------------------------------
const F_CAM = track([   // t, pos, target
  [0.0, 0.95, 0.20, 1.15, 0.04, 0.00, 0.0],
  [3.0, 0.42, 0.10, 0.60, 0.02, 0.00, 0.0],
  [6.0, 0.02, 0.05, 0.25, 0.00, 0.00, 0.0],
  [9.0, -0.20, 0.07, 0.22, -0.01, 0.00, 0.0]]);
const rotY = (v, a) => [v[0] * Math.cos(a) + v[2] * Math.sin(a), v[1], -v[0] * Math.sin(a) + v[2] * Math.cos(a)];
const rotX = (v, a) => [v[0], v[1] * Math.cos(a) - v[2] * Math.sin(a), v[1] * Math.sin(a) + v[2] * Math.cos(a)];
export const SUN1 = norm([-0.52, 0.16, -0.84]);
function foil(t) {
  const k = F_CAM(t), ay = 0.55 + 0.20 * t, ax = 0.35 + 0.085 * t;
  const R = rotX(rotY([1, 0, 0], ay), ax), U = rotX(rotY([0, 1, 0], ay), ax);
  const dim = 1 - 0.97 * smooth((t - 6.3) / 1.3);
  const glow = smooth(t / 1.6) * dim * (1 + 0.05 * Math.sin(t * 2.1));
  const planeR = t > 7.85 ? 0.012 * (Math.exp((t - 7.85) * 9) - 1) : 0;
  return { shot: 0, tau: t, pos: k.slice(0, 3), tgt: k.slice(3), roll: 0.10 - 0.02 * t, fov: 34 - 0.6 * t, exposure: 1.0,
    u: { uFR: R, uFU: U, uFN: cross(R, U), uSun: SUN1, uGlow: glow, uPlaneR: planeR } };
}

// ---- shot 2: Saturn (units of its radius; the plane is y = 0) -----------------------------------------
const S_CAM = track([
  [0.0, -9.5, 0.22, 5.4, 0.0, 0.75, 0.0],
  [2.6, -4.4, 0.10, 2.9, 0.0, 0.62, 0.0],
  [4.6, -2.0, 0.16, 0.2, 0.1, 0.42, 0.0],
  [6.4, -0.6, 0.60, -2.5, 0.0, 0.22, 0.0],
  [8.4, 2.8, 2.30, -3.2, 0.0, 0.00, 0.0],
  [10.4, 4.2, 7.20, 0.6, 0.0, 0.00, 0.0],
  [12.5, 1.6, 17.0, 0.9, 0.0, 0.00, 0.0]]);
export const SUN2 = norm([0.72, 0.40, -0.56]);
export function saturn(tau) {
  const yc = 0.86 - 0.172 * tau, h = clamp(1 - yc, 0, 2), f = h * h * (3 - h) / 4;
  return { yc, h, R2: 0.45 + 7.2 * Math.sqrt(f) };
}
function saturnShot(t) {
  const tau = t - CUT1, k = S_CAM(tau), s = saturn(tau);
  const sh = 0.004 * smooth((6.5 - tau) / 3);                      // a little buffeting while skimming
  const pos = [k[0] + sh * Math.sin(tau * 31), Math.max(0.03, k[1] + sh * Math.sin(tau * 43 + 1)), k[2]];
  return { shot: 1, tau, pos, tgt: k.slice(3), roll: 0.18 * smooth((6.5 - tau) / 4) - 0.25 * smooth((tau - 8) / 4), fov: 58 - 12 * smooth((tau - 7) / 5),
    exposure: 0.75,
    u: { uSun: SUN2, uYc: s.yc, uR2: s.R2, uH: s.h, uEm: 0.5, uDeb: smooth((tau - 1.0) / 6) } };
}

// ---- shot 3: Pluto (kilometres) -----------------------------------------------------------------------
const LD = norm([0.10, 0.36, 0.93]);
const P_R = norm(cross(LD, [0, 1, 0])), P_U = cross(P_R, LD);
const P_V = add(P_U.map(x => x * Math.cos(0.22)), P_R, Math.sin(0.22));
const PN = norm(add(LD.map(x => x * 0.42), P_V, 0.907));
const PA = norm(cross(PN, LD)), PB = cross(PN, PA);
const CHARON = norm([-0.52, 0.50, 0.69]);
function pluto(t) {
  const tau = t - CUT2, e = smooth(tau / 9.5);
  const pos = [0.05 * tau, 0.11 + 0.012 * tau, 0.075 * tau];
  const el = 0.05 + 0.15 * e, az = -0.10 + 0.14 * e;
  const tgt = add(pos, [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)]);
  return { shot: 2, tau, pos, tgt, roll: 0, fov: 56 - 5 * e, exposure: 1.0,
    u: { uLd: LD, uPn: PN, uPa: PA, uPb: PB, uChar: CHARON, uGrow: 1 + 0.012 * tau } };
}

export function frame(t) {
  const f = t < CUT1 ? foil(t) : t < CUT2 ? saturnShot(t) : pluto(t);
  f.exposure *= smooth(t / 1.4) * smooth((DUR - 0.15 - t) / 1.5);
  return f;
}
