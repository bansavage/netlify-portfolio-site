// make-sounds.mjs — synthesises the two sounds of v6 from nothing (no recordings):
//   door-open.wav    a pair of light slatted doors swung open: a swish of air, the slats ticking, a soft knock as each leaf comes to rest (2.1 s)
//   jungle.wav       a bed of jungle ambience, 72 s, fading in and out at its ends so it can loop
// usage: node make-sounds.mjs <out-dir>     (then encode to mp3 with ffmpeg)
import { writeFileSync } from 'node:fs';

const SR = 44100, TAU = Math.PI * 2;
const out = process.argv[2] || '.';

function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const x = clamp((v - a) / (b - a)); return x * x * (3 - 2 * x); };
const db = (d) => Math.pow(10, d / 20);

/** RBJ biquad; returns a function(sample) → sample */
function biquad(type, f, Q, gainDb = 0) {
  const w = TAU * f / SR, c = Math.cos(w), s = Math.sin(w), al = s / (2 * Q), A = Math.pow(10, gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else { b0 = 1 + al * A; b1 = -2 * c; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * c; a2 = 1 - al / A; }   // peak
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => { const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
}
/** smooth random wander in -1..1, changing about `rate` times a second */
function wander(R, rate) { let a = R() * 2 - 1, b = R() * 2 - 1, ph = 0; const inc = rate / SR; return () => { ph += inc; if (ph >= 1) { ph -= 1; a = b; b = R() * 2 - 1; } const k = ph * ph * (3 - 2 * ph); return a + (b - a) * k; }; }
function pinkNoise(R) { let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0; return () => { const w = R() * 2 - 1; b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; const o = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926; return o * 0.11; }; }

function writeWav(path, L, Rr) {
  const n = L.length, buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { buf.writeInt16LE(Math.round(clamp(L[i], -1, 1) * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(clamp(Rr[i], -1, 1) * 32767), 46 + i * 4); }
  writeFileSync(path, buf);
}
const peakOf = (...chs) => { let p = 0; for (const c of chs) for (let i = 0; i < c.length; i++) { const v = Math.abs(c[i]); if (v > p) p = v; } return p; };
const rmsOf = (...chs) => { let s = 0, n = 0; for (const c of chs) { for (let i = 0; i < c.length; i++) s += c[i] * c[i]; n += c.length; } return Math.sqrt(s / n); };
const scale = (k, ...chs) => { for (const c of chs) for (let i = 0; i < c.length; i++) c[i] *= k; };

/* =============================================================================================
 * THE DOORS. Not a creak (a synthesised creak is a buzz, and sounded like one). What a pair of light
 * slatted doors does when it is swung open gently:
 *   a small soft "tk" as the latch lets go;
 *   a swish of air as each leaf swings, loudest when it is moving fastest (the left leaf a moment before the right);
 *   a few very light wooden ticks, the slats shifting;
 *   a soft wooden knock as each leaf comes to rest against its stop, and a softer one as it settles.
 * The timing follows DOOR in ../js/main.js: the swing starts 0.06 s after the tap and takes 1.15 s, the
 * right-hand leaf 0.09 s behind the left; each knocks back off its stop and settles about 0.31 s later.
 * ============================================================================================= */
{
  const LEN = 2.1, n = Math.round(SR * LEN), L = new Float32Array(n), Rr = new Float32Array(n);
  const SWING0 = 0.06, SWING = 1.15, LAG = 0.09, SETTLE = 0.31;
  const bell = (u) => (u <= 0 || u >= 1 ? 0 : Math.pow(Math.sin(Math.PI * u), 1.7));
  /** add a mono sound at time t0, panned (-1 left … +1 right) */
  const put = (snd, t0, pan, gain) => { const gl = Math.cos((pan + 1) * Math.PI / 4) * gain, gr = Math.sin((pan + 1) * Math.PI / 4) * gain, i0 = Math.round(t0 * SR); for (let i = 0; i < snd.length && i0 + i < n; i++) { L[i0 + i] += snd[i] * gl; Rr[i0 + i] += snd[i] * gr; } };
  /** something wooden struck softly: a few partials that die away quickly, and the small click of the touch itself */
  function struck(R, partials, click, len) {
    const N = Math.round(len * SR), o = new Float32Array(N), bp = biquad('bp', click[0], 1.4), cN = Math.round(click[2] * SR);
    for (let i = 0; i < N; i++) {
      const t = i / SR;
      let s = 0;
      for (const [f, g, d] of partials) s += Math.sin(TAU * f * t) * g * Math.exp(-t / d);
      s += bp(i < cN ? (R() * 2 - 1) * (1 - i / cN) : 0) * click[1];
      o[i] = s * Math.min(1, t / 0.0018);                                    // (a soft landing: no hard edge)
    }
    return o;
  }

  // ---- the swish of air: one for each leaf ----
  for (const [side, delay, seed] of [[-1, 0, 41], [1, LAG, 43]]) {
    const N = mulberry32(seed), N2 = mulberry32(seed + 1), hi = biquad('bp', 4600, 0.8), lo = biquad('lp', 5200, 0.7);
    let low = 0, band = 0;                                                    // a band-pass whose centre can move (state-variable filter)
    const o = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = (i / SR - SWING0 - delay) / (SWING + 0.1), e = bell(u);
      if (e <= 0) { low *= 0.999; band *= 0.999; continue; }
      const fc = 320 + 980 * Math.pow(e, 0.8), f = 2 * Math.sin(Math.PI * fc / SR), q = 1.15;   // the faster it moves, the higher the air sounds
      const x = N() * 2 - 1;
      low += f * band; const high = x - low - q * band; band += f * high;
      o[i] = lo(band * 0.9 * e + hi(N2() * 2 - 1) * 0.1 * e * e);
    }
    for (let i = 0; i < n; i++) { L[i] += o[i] * (side < 0 ? 0.92 : 0.38); Rr[i] += o[i] * (side < 0 ? 0.38 : 0.92); }
  }
  scale(0.27 / Math.max(peakOf(L, Rr), 1e-6), L, Rr);                         // the air: present, but under the knocks

  const R = mulberry32(77), rr = (a, b) => a + (b - a) * R();
  // ---- the latch lets go ----
  put(struck(R, [[190, 0.6, 0.03], [520, 0.5, 0.016]], [1500, 0.5, 0.003], 0.2), 0.02, 0, 0.16);
  // ---- the slats shift: a few very light ticks, each a little block of wood of its own size ----
  for (const [u, side] of [[0.2, -1], [0.34, 1], [0.47, -1], [0.58, 1], [0.74, -1]]) {
    const f = rr(820, 1500);
    put(struck(R, [[f, 1, 0.014], [f * 2.14, 0.45, 0.008], [f * 3.4, 0.2, 0.005]], [f * 2.5, 0.25, 0.0015], 0.12), SWING0 + (u + rr(-0.03, 0.03)) * SWING + (side > 0 ? LAG : 0), side * rr(0.3, 0.7), rr(0.035, 0.07));
  }
  // ---- each leaf comes to rest against its stop, and settles ----
  for (const [side, delay, f] of [[-1, 0, 148], [1, LAG, 131]]) {
    const knock = (g) => struck(R, [[f, 1, 0.06], [f * 2.3, 0.75, 0.04], [f * 4.9, 0.5, 0.02], [f * 8.2, 0.2, 0.011]], [f * 7, 0.6, 0.003], 0.5);
    put(knock(), SWING0 + SWING + delay, side * 0.55, 0.36);
    put(knock(), SWING0 + SWING + delay + SETTLE, side * 0.55, 0.13);
  }

  // ---- a small room round it, and the level ----
  for (const [ms, g] of [[19, 0.22], [31, 0.17], [47, 0.12], [71, 0.08]]) { const d = Math.round(ms * SR / 1000), lpL = biquad('lp', 3200, 0.7), lpR = biquad('lp', 3200, 0.7); for (let i = n - 1; i >= d; i--) { const l = L[i - d], r = Rr[i - d]; L[i] += lpL(r) * g; Rr[i] += lpR(l) * g; } }
  const hpL = biquad('hp', 80, 0.7), hpR = biquad('hp', 80, 0.7), tail = Math.round(0.15 * SR);
  for (let i = 0; i < n; i++) { L[i] = hpL(L[i]); Rr[i] = hpR(Rr[i]); }
  for (let i = 0; i < tail; i++) { const k = i / tail; L[n - 1 - i] *= k; Rr[n - 1 - i] *= k; }
  scale(db(-7) / peakOf(L, Rr), L, Rr);
  writeWav(`${out}/door-open.wav`, L, Rr);
  console.log('door-open.wav', (n / SR).toFixed(2) + 's', 'peak', peakOf(L, Rr).toFixed(3), 'rms dB', (20 * Math.log10(rmsOf(L, Rr))).toFixed(1));
}

/* =============================================================================================
 * THE JUNGLE. A quiet bed, built in layers: the air; leaves stirring; a cicada chorus that swells
 * and dies away; a few crickets; and birds, each kind with its own call, scattered left and right
 * at their own distances with a short echo off the trees. It fades up over its first 2.5 s and
 * down over its last 2.5 s, so it can simply be looped.
 * ============================================================================================= */
{
  const DUR = 72, n = Math.round(SR * DUR), L = new Float32Array(n), Rr = new Float32Array(n);
  const R = mulberry32(2027);
  const rr = (a, b) => a + (b - a) * R();

  // ---- the air, and leaves stirring ----
  {
    const pL = pinkNoise(mulberry32(1)), pR = pinkNoise(mulberry32(2)), lpL = biquad('lp', 850, 0.7), lpR = biquad('lp', 850, 0.7);
    const wL = mulberry32(3), wR = mulberry32(4), bpL = biquad('bp', 3400, 0.7), bpR = biquad('bp', 3900, 0.7), gust = wander(mulberry32(5), 0.22), gust2 = wander(mulberry32(6), 0.17);
    for (let i = 0; i < n; i++) {
      const t = i / SR, air = 0.75 + 0.25 * Math.sin(TAU * t / 11.3);
      const g1 = Math.pow(0.5 + 0.5 * gust(), 2), g2 = Math.pow(0.5 + 0.5 * gust2(), 2);
      L[i] += lpL(pL()) * 0.06 * air + bpL(wL() * 2 - 1) * (0.005 + 0.028 * g1);
      Rr[i] += lpR(pR()) * 0.06 * air + bpR(wR() * 2 - 1) * (0.005 + 0.028 * g2);
    }
  }

  // ---- cicadas: a hiss chopped into fast pulses, in long swells; and a thinner one that never quite stops ----
  {
    const phrases = [[4, 10, -0.5, 6100, 57], [19, 9, 0.6, 6600, 63], [33, 12, -0.2, 5900, 54], [50, 10, 0.5, 6300, 60], [61, 8, -0.6, 6800, 66]];
    for (const [t0, len, pan, fc, rate] of phrases) {
      const N = mulberry32(100 + t0), bp = biquad('bp', fc, 7), bp2 = biquad('bp', fc * 1.31, 9), gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
      const i0 = Math.round(t0 * SR), i1 = Math.min(n, Math.round((t0 + len) * SR));
      for (let i = i0; i < i1; i++) {
        const t = (i - i0) / SR, env = smooth(0, 2.6, t) * (1 - smooth(len - 3.4, len, t)), ph = (t * rate * (1 + 0.03 * Math.sin(TAU * t / 3.1))) % 1;
        const chop = Math.pow(0.5 - 0.5 * Math.cos(TAU * ph), 1.6), w = N() * 2 - 1;
        const s = (bp(w) + bp2(w) * 0.5) * chop * env * 0.085;
        L[i] += s * gl; Rr[i] += s * gr;
      }
    }
    const N = mulberry32(7), bp = biquad('bp', 4800, 10), sw = wander(mulberry32(8), 0.13);
    for (let i = 0; i < n; i++) { const t = i / SR, chop = 0.5 - 0.5 * Math.cos(TAU * ((t * 112) % 1)), s = bp(N() * 2 - 1) * chop * (0.012 + 0.012 * sw()); L[i] += s * 0.8; Rr[i] += s * 1.1; }
  }

  // ---- crickets: three of them, each chirping in threes for a while, then resting ----
  for (const [f, pan, period, seed] of [[3950, -0.75, 0.47, 31], [4420, 0.8, 0.56, 32], [5080, 0.15, 0.41, 33]]) {
    const C = mulberry32(seed), gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
    let t = 1 + C() * 5;
    while (t < DUR - 4) {
      const bout = 5 + C() * 9, end = Math.min(DUR - 3, t + bout), per = period * (0.94 + 0.12 * C());
      for (let c = t; c < end; c += per) {
        for (let p = 0; p < 3; p++) {
          const i0 = Math.round((c + p * 0.017) * SR), len = Math.round(0.0095 * SR);
          for (let i = 0; i < len && i0 + i < n; i++) { const k = i / len, s = Math.sin(TAU * f * i / SR) * Math.sin(Math.PI * k) * 0.026 * smooth(t, t + 1.2, c) * (1 - smooth(end - 1.2, end, c)); L[i0 + i] += s * gl; Rr[i0 + i] += s * gr; }
        }
      }
      t = end + 3 + C() * 6;
    }
  }

  // ---- birds ----
  /** put a mono call into the stereo bed at time t0: panned, with distance (softer, duller) and an echo off the trees */
  function place(call, t0, pan, gain, far = 0) {
    const lp = biquad('lp', lerp(9000, 2600, far), 0.7), gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
    const i0 = Math.round(t0 * SR), e1 = Math.round(0.137 * SR), e2 = Math.round(0.263 * SR), elp = biquad('lp', 2800, 0.7);
    for (let i = 0; i < call.length; i++) {
      const j = i0 + i; if (j >= n) break;
      const s = lp(call[i]) * gain, e = elp(s);
      L[j] += s * gl; Rr[j] += s * gr;
      if (j + e1 < n) { L[j + e1] += e * gr * 0.24; Rr[j + e1] += e * gl * 0.24; }
      if (j + e2 < n) { L[j + e2] += e * gl * 0.11; Rr[j + e2] += e * gr * 0.11; }
    }
  }
  /** one note: frequency f(k) and loudness a(k) over its length (k = 0..1), with a soft second harmonic */
  function note(len, f, a, h2 = 0.16) {
    const N = Math.round(len * SR), o = new Float32Array(N); let ph = 0;
    for (let i = 0; i < N; i++) { const k = i / N; ph += f(k, i / SR) / SR; o[i] = (Math.sin(TAU * ph) + h2 * Math.sin(TAU * 2 * ph)) * a(k); }
    return o;
  }
  const join = (parts) => { let N = 0; for (const [at, p] of parts) N = Math.max(N, Math.round(at * SR) + p.length); const o = new Float32Array(N); for (const [at, p] of parts) { const i0 = Math.round(at * SR); for (let i = 0; i < p.length; i++) o[i0 + i] += p[i]; } return o; };
  const bell = (k) => Math.pow(Math.sin(Math.PI * k), 1.3), soft = (k) => smooth(0, 0.12, k) * (1 - smooth(0.7, 1, k));

  const calls = {
    // the liquid falling "bloop" of an oropendola, after two quick ticks
    dropper: (v) => join([[0, note(0.022, () => 2900 * v, bell)], [0.07, note(0.022, () => 3100 * v, bell)], [0.16, note(0.36, (k) => 3300 * v * Math.pow(0.27, k), (k) => bell(Math.pow(k, 0.7)) * (0.7 + 0.3 * Math.sin(k * 40)))]]),
    // a clear two-note whistle, said twice
    whistler: (v) => { const a = note(0.24, (k, t) => 2380 * v * (1 + 0.012 * Math.sin(TAU * 6 * t)), soft), b = note(0.34, (k, t) => 1960 * v * (1 - 0.03 * k) * (1 + 0.012 * Math.sin(TAU * 6 * t)), soft); return join([[0, a], [0.3, b], [1.0, a], [1.3, b]]); },
    // a fast rising trill that tails off
    triller: (v) => { const m = 9 + Math.floor(R() * 5), parts = []; for (let i = 0; i < m; i++) parts.push([i * 0.066, note(0.04, (k) => (3500 + 900 * k) * v, (k) => bell(k) * (1 - 0.6 * i / m))]); return join(parts); },
    // thin high "tseep"s
    tseep: (v) => { const m = 2 + Math.floor(R() * 2), parts = []; for (let i = 0; i < m; i++) parts.push([i * 0.36, note(0.13, (k) => (6900 - 650 * k) * v, bell, 0.05)]); return join(parts); },
    // a dove somewhere far off: hoo-hoo … hoo
    hooter: (v) => { const h = (len) => note(len, (k) => 525 * v * (1 - 0.05 * k), soft, 0.3); return join([[0, h(0.26)], [0.42, h(0.3)], [1.05, h(0.42)]]); },
    // parrots: a short burst of harsh chatter
    chatter: (v) => { const m = 4 + Math.floor(R() * 3), parts = []; let at = 0; for (let i = 0; i < m; i++) { parts.push([at, note(0.065, (k, t) => 1900 * v * (1 + 0.35 * Math.sin(TAU * 300 * t)) * (1 - 0.1 * k), bell, 0.3)]); at += 0.11 + R() * 0.07; } return join(parts); },
  };
  // who sings, how often, from where: [call, first at (s), every (s, a range), pan, loudness, distance, voice]
  const cast = [
    ['dropper', 6.5, [10, 15], -0.55, 0.115, 0.15, 1.0],
    ['whistler', 3.2, [12, 17], 0.45, 0.085, 0.3, 1.0],
    ['triller', 9.0, [8, 13], 0.1, 0.06, 0.2, 1.0],
    ['triller', 15.5, [11, 16], -0.8, 0.04, 0.55, 1.12],
    ['tseep', 5.0, [5, 9], 0.75, 0.035, 0.1, 1.0],
    ['tseep', 12.0, [7, 12], -0.3, 0.028, 0.3, 0.93],
    ['hooter', 13.0, [15, 21], 0.7, 0.085, 0.75, 1.0],
    ['chatter', 24.0, [20, 26], -0.85, 0.045, 0.45, 1.0],
    ['dropper', 30.0, [17, 24], 0.85, 0.05, 0.7, 0.9],
  ];
  let birds = 0;
  for (const [name, first, every, pan, gain, far, voice] of cast) {
    for (let t = first; t < DUR - 4; t += rr(every[0], every[1])) { place(calls[name](voice * rr(0.985, 1.015)), t + rr(-0.6, 0.6), clamp(pan + rr(-0.12, 0.12), -1, 1), gain * rr(0.75, 1.1), far); birds++; }
  }

  // ---- level, and the fade at each end ----
  const hpL = biquad('hp', 60, 0.7), hpR = biquad('hp', 60, 0.7), fade = Math.round(2.5 * SR);
  for (let i = 0; i < n; i++) { const k = Math.min(1, i / fade, (n - 1 - i) / fade), g = k * k * (3 - 2 * k); L[i] = Math.tanh(hpL(L[i]) * 1.6) / 1.6 * g; Rr[i] = Math.tanh(hpR(Rr[i]) * 1.6) / 1.6 * g; }
  scale(db(-8) / peakOf(L, Rr), L, Rr);
  writeWav(`${out}/jungle.wav`, L, Rr);
  console.log('jungle.wav', DUR + 's', birds, 'bird calls', 'peak', peakOf(L, Rr).toFixed(3), 'rms dB', (20 * Math.log10(rmsOf(L, Rr))).toFixed(1));
}
