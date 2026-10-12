/* kit.js — small shared helpers: palette, seeded randomness, easing, colour maths.
 * Nothing in here knows about the DOM or three.js. */

/* ---- house palette (wedding/art-direction.html) ------------------------------------------- */
export const PALETTE = {
  lima: '#B8D430', cempasuchil: '#F2A33C', buganvilia: '#E0387E', cobalto: '#2B4FC4',
  olivo: '#6E7A3A', barro: '#C4562F', hueso: '#F6F1E4', tinta: '#20241C', sombra: '#4A4F42',
};

/* Foliage greens: one family, near-black green up to acid lime (anchored on lima + olivo). */
export const GREEN = ['#0F2A1D', '#17402A', '#1F5A36', '#2E7D46', '#4C9A4A', '#7FB23A', '#B8D430'];

/* ---- seeded PRNG: every "random" choice in the piece comes from here ----------------------- */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rng(seed) {
  const r = mulberry32(seed);
  return {
    f: r,                                              // 0..1
    range: (a, b) => a + (b - a) * r(),                // a..b
    int: (a, b) => Math.floor(a + (b - a + 1) * r()),  // inclusive integers
    pick: (arr) => arr[Math.floor(r() * arr.length)],
    sign: () => (r() < 0.5 ? -1 : 1),
    chance: (p) => r() < p,
    jit: (v, amt) => v * (1 + (r() * 2 - 1) * amt),    // v ± amt (fraction)
  };
}

/* ---- maths --------------------------------------------------------------------------------- */
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => { const x = clamp((v - a) / (b - a)); return x * x * (3 - 2 * x); };
/** progress 0..1 of `t` through a window that starts at `start` and lasts `dur` seconds */
export const prog = (t, start, dur) => clamp((t - start) / dur);

/* ---- easing (never linear) ----------------------------------------------------------------- */
export const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
export const easeOutQuint = (x) => 1 - Math.pow(1 - x, 5);
export const easeOutExpo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
export const easeInOutCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const easeOutBack = (x, s = 1.70158) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);
/** damped spring step response: 0 → overshoot → settles on 1. `tau` is seconds since release. */
export const spring = (tau, freq = 9, damp = 5.5) => (tau <= 0 ? 0 : 1 - Math.exp(-damp * tau) * Math.cos(freq * tau));

/* ---- colour -------------------------------------------------------------------------------- */
export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** hex → [r,g,b] in 0..1 (plain sRGB values, exactly as authored; used for shader uniforms) */
export const hexToVec = (hex) => hexToRgb(hex).map((v) => v / 255);
export function mix(hexA, hexB, t) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  const c = a.map((v, i) => Math.round(lerp(v, b[i], t)));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}
export function rgba(hex, alpha = 1) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}
/** lighten (amt > 0, toward a warm white) or darken (amt < 0, toward a deep green-black) */
export const shade = (hex, amt) => (amt >= 0 ? mix(hex, '#FFF6C8', amt) : mix(hex, '#07160F', -amt));
