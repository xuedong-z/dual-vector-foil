// The soundtrack is synthesised too: near-silence and glass tones for the foil, a swell and a sub-bass drop as the
// plane opens, a slow dark chord while the giant sinks, and a held, cold major chord over Pluto.
import { DUR, CUT1, CUT2 } from './timeline.js';

export async function renderAudio() {
  const SR = 48000, ctx = new OfflineAudioContext(2, SR * DUR, SR);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const nb = ctx.createBuffer(2, SR * 4, SR);
  for (let ch = 0; ch < 2; ch++) { const d = nb.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1; }
  const master = ctx.createGain(); master.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.01; comp.release.value = 0.3;
  master.connect(comp).connect(ctx.destination);
  // a long, dark hall
  const ir = ctx.createBuffer(2, SR * 5, SR);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] = (rnd() * 2 - 1) * Math.exp(-i / SR / 1.3) * (1 - Math.exp(-i / 400)); }
  const hall = ctx.createConvolver(); hall.buffer = ir;
  const hallLP = ctx.createBiquadFilter(); hallLP.type = 'lowpass'; hallLP.frequency.value = 5200;
  const wet = ctx.createGain(); wet.gain.value = 0.5;
  hall.connect(hallLP).connect(wet).connect(master);
  const out = (node, dry = 1, send = 0.5, pan = 0) => {
    const p = ctx.createStereoPanner(); p.pan.value = pan; node.connect(p);
    const d = ctx.createGain(); d.gain.value = dry; p.connect(d).connect(master);
    const s = ctx.createGain(); s.gain.value = send; p.connect(s).connect(hall);
  };
  const keys = (param, ks) => { param.setValueAtTime(ks[0][1], 0); for (const [t, v] of ks) param.linearRampToValueAtTime(v, Math.max(0.001, t)); };
  const tone = (f, type, ks, dry, send, pan = 0, det = 0) => {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det;
    const g = ctx.createGain(); keys(g.gain, ks); o.connect(g); o.start(0); o.stop(DUR); out(g, dry, send, pan); return o;
  };
  const noise = (type, f, q, ks, dry, send, pan = 0) => {
    const s = ctx.createBufferSource(); s.buffer = nb; s.loop = true; s.start(0, rnd() * 3);
    const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q;
    const g = ctx.createGain(); keys(g.gain, ks); s.connect(b).connect(g); out(g, dry, send, pan); return b;
  };
  const ping = (t, f, peak, pan) => {
    for (const [m, a] of [[1, 1], [2.76, 0.35], [5.4, 0.12]]) {
      const o = ctx.createOscillator(); o.frequency.value = f * m; const g = ctx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak * a, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5 / m);
      o.connect(g); o.start(t); o.stop(Math.min(DUR, t + 4)); out(g, 0.5, 1.2, pan);
    }
  };
  const A = 55;
  // --- the foil: a breath of air, a very low hum, glass
  noise('bandpass', 2400, 0.4, [[0, 0], [2, 0.006], [7, 0.006], [CUT1, 0.0]], 1, 1.5);
  tone(A, 'sine', [[0, 0], [2.5, 0.10], [6.5, 0.10], [7.6, 0.02], [CUT1 - 0.05, 0.30], [CUT1 + 0.1, 0.0]], 1, 0.2);
  tone(A * 12, 'sine', [[0, 0], [1.5, 0.010], [6.3, 0.012], [7.6, 0.0]], 0.6, 1.5, -0.2);      // the slip's own tone
  tone(A * 12.03, 'sine', [[0, 0], [1.5, 0.008], [6.3, 0.010], [7.6, 0.0]], 0.6, 1.5, 0.2);
  ping(1.6, 1318.5, 0.05, -0.4); ping(3.4, 1760, 0.04, 0.35); ping(5.0, 987.8, 0.045, 0.1); ping(6.4, 1318.5, 0.03, -0.2);
  // the light goes out; the plane opens
  const sw = noise('bandpass', 300, 1.2, [[0, 0], [7.8, 0.0], [CUT1 - 0.05, 0.20], [CUT1, 0.0]], 1, 0.8);
  keys(sw.frequency, [[0, 300], [7.8, 300], [CUT1, 5000]]);
  // --- the drop
  const sub = tone(60, 'sine', [[0, 0], [CUT1 - 0.01, 0.0], [CUT1 + 0.03, 0.85], [CUT1 + 2.5, 0.25], [CUT2 - 2.4, 0.22], [CUT2 - 2.0, 0.6], [CUT2, 0.0]], 1, 0.15);
  keys(sub.frequency, [[0, 60], [CUT1, 62], [CUT1 + 1.2, 34], [CUT2 - 2.05, 34], [CUT2 - 2.0, 50], [CUT2 - 0.5, 27]]);
  noise('lowpass', 900, 0.5, [[0, 0], [CUT1 - 0.01, 0.0], [CUT1 + 0.02, 0.5], [CUT1 + 1.6, 0.0]], 1, 1.0);
  // --- Saturn: a dark chord opening up, air rushing past the lens, grinding where the globe meets the plane
  for (const [f, pan, det] of [[A, -0.3, -6], [A, 0.3, 7], [A * 1.5, -0.5, 4], [A * 2 * 1.2, 0.5, -5], [A * 4 * 0.9375, 0.0, 3]]) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.8;
    keys(lp.frequency, [[0, 120], [CUT1, 140], [CUT1 + 7, 900], [CUT2 - 1.5, 2200], [CUT2, 300]]);
    const g = ctx.createGain(); keys(g.gain, [[0, 0], [CUT1 - 0.2, 0.0], [CUT1 + 0.6, 0.07], [CUT2 - 1.0, 0.11], [CUT2, 0.0]]);
    o.connect(lp).connect(g); o.start(0); o.stop(DUR); out(g, 0.8, 0.8, pan);
  }
  const wind = noise('bandpass', 500, 0.7, [[0, 0], [CUT1, 0.0], [CUT1 + 0.3, 0.10], [CUT1 + 4.5, 0.22], [CUT1 + 7, 0.08], [CUT2 - 0.1, 0.03], [CUT2, 0.0]], 1, 0.5);
  keys(wind.frequency, [[0, 400], [CUT1, 400], [CUT1 + 4.5, 1500], [CUT1 + 8, 500]]);
  const grind = noise('bandpass', 90, 3, [[0, 0], [CUT1, 0.0], [CUT1 + 1, 0.5], [CUT2 - 2.2, 0.7], [CUT2 - 1.9, 0.0]], 1, 0.5);
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.9; const lg = ctx.createGain(); lg.gain.value = 40; lfo.connect(lg).connect(grind.frequency); lfo.start(0);
  // the last of the globe goes under
  noise('highpass', 3000, 0.5, [[0, 0], [CUT2 - 2.05, 0.0], [CUT2 - 2.0, 0.10], [CUT2 - 0.3, 0.0]], 0.4, 2.0);
  for (const [f, pan] of [[1760, -0.5], [2217.5, 0.5], [2637, 0.0], [3520, -0.2]]) ping(CUT2 - 2.0 + rnd() * 0.12, f, 0.03, pan);
  // --- Pluto: stillness. A cold open chord, held; glass again
  for (const [f, pan, a] of [[A * 2, -0.2, 0.05], [A * 3, 0.3, 0.04], [A * 4, -0.4, 0.035], [A * 5, 0.4, 0.022], [A * 6, 0.0, 0.016], [A * 9, 0.2, 0.008]]) {
    tone(f, 'sine', [[0, 0], [CUT2 - 0.05, 0.0], [CUT2 + 1.8, a], [DUR - 2.5, a], [DUR - 0.2, 0.0]], 0.7, 1.4, pan, 4);
    tone(f, 'triangle', [[0, 0], [CUT2 - 0.05, 0.0], [CUT2 + 2.5, a * 0.4], [DUR - 2.5, a * 0.4], [DUR - 0.2, 0.0]], 0.7, 1.4, -pan, -5);
  }
  tone(A / 2, 'sine', [[0, 0], [CUT2, 0.0], [CUT2 + 1.0, 0.16], [DUR - 2, 0.12], [DUR - 0.2, 0.0]], 1, 0.1);
  noise('bandpass', 1800, 0.4, [[0, 0], [CUT2, 0.0], [CUT2 + 1, 0.005], [DUR - 1, 0.004], [DUR, 0.0]], 1, 1.5);
  ping(CUT2 + 2.2, 1318.5, 0.04, 0.3); ping(CUT2 + 4.6, 1975.5, 0.03, -0.35); ping(CUT2 + 6.6, 1760, 0.028, 0.1);
  return ctx.startRendering();
}
