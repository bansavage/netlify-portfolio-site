/* finish.js — THE WALLPAPER FINISH: one sheet laid over the whole page, artwork AND type, so that it
 * looks like a single printed piece of cloth-backed wallpaper. ("Wallpaper")
 *
 * It is a plain transparent picture on top of everything (canvas.finish in index.html), ordinary
 * alpha blending, nothing clever for the browser to do per frame:
 *   - WOVEN LINEN. A seeded, tileable plain weave: warp and weft threads of slightly uneven width
 *     and tone, the odd slub, a little fibre. Where a thread dips under its neighbour the pixel is a
 *     warm dark at low alpha (which darkens whatever is under it: exactly a multiply); on the crown
 *     of a thread it is a warm white at low alpha (which lightens: exactly a screen). So the weave
 *     reads as shadow on the cream ground and as bare thread showing through the ink of the letters
 *     and the paint of the leaves.
 *   - THE LIGHT OF THE WALL. A broad, soft, uneven wash: lighter toward the upper left, a gentle
 *     vignette, one wide soft shadow. The middle, where the copy is, is left alone.
 *
 * HOW STRONG IT IS is one number: --finish in canopy.css (:root). 1 = as designed, 0 = none, up to 2.
 * (Add ?finish=1.5 to the address to try a value without editing anything.)
 *
 * This file is loaded on its own from index.html, not through main.js, so the finish is there even
 * if the WebGL scene is not (blocked CDN, no WebGL). With no JavaScript at all, canopy.css draws a
 * plain two-gradient weave in its place.
 */
import { mulberry32 } from './kit.js';

const TILE = 384;                 // CSS px: one repeat of the cloth (wider than most phones, so it never visibly repeats across one)
const PITCH = 2.5;                // CSS px from thread to thread
/* the make-up of the cloth: `relief` = the over-and-under of the weave itself, `tone` = how much one thread
 * differs from the next (the streakiness of linen), `fibre` = fine grain; then the alpha of the shadows
 * between threads / of the thread crowns, as authored (the layer is then shown at --finish × 50%) */
const WEAVE = { relief: 0.78, tone: 0.34, fibre: 0.3, dark: 0.56, light: 0.6 };
const SHADE = [44, 34, 14], THREAD = [255, 250, 236];

/** one seamless repeat of the cloth, `px` device pixels square */
function linenTile(px, seed = 1974) {
  const R = mulberry32(seed), rr = (a, b) => a + (b - a) * R();
  const n = 2 * Math.round(TILE / PITCH / 2);                  // threads each way (even, so the over-under pattern wraps)
  const TAU = (Math.PI * 2) / px, unit = px / TILE;            // (unit = device px per CSS px)
  /* thread edges along one axis: uneven widths that still add up to the tile */
  const threads = () => {
    const w = Array.from({ length: n }, () => 1 + rr(-0.45, 0.45)), sum = w.reduce((a, b) => a + b, 0);
    const idx = new Uint16Array(px), u = new Float32Array(px), edges = [0];
    for (let k = 0; k < n; k++) edges.push(edges[k] + (w[k] / sum) * px);
    for (let i = 0, k = 0; i < px; i++) {
      while (k < n - 1 && i + 0.5 >= edges[k + 1]) k++;
      idx[i] = k; u[i] = Math.min(1, Math.max(0, (i + 0.5 - edges[k]) / (edges[k + 1] - edges[k])));
    }
    // per thread: its own tone (linen is spun unevenly: some threads pale, some dark), and maybe a slub
    // (a thicker, paler stretch) somewhere along it
    const tone = Float32Array.from({ length: n }, () => rr(-1, 1) * rr(0.2, 1));
    const slub = Array.from({ length: n }, () => (R() < 0.1 ? { at: R() * px, half: rr(10, 36) * unit, amp: rr(0.5, 1.2) } : null));
    // no thread lies dead straight: each line of the cloth wanders a little (whole waves per tile, so it wraps)
    const wander = new Float32Array(px), p1 = R() * 6.28, p2 = R() * 6.28, p3 = R() * 6.28;
    for (let i = 0; i < px; i++) wander[i] = unit * (0.55 * Math.sin(TAU * 3 * i + p1) + 0.4 * Math.sin(TAU * 7 * i + p2) + 0.25 * Math.sin(TAU * 17 * i + p3));
    return { idx, u, tone, slub, wander };
  };
  const warp = threads(), weft = threads();
  const slubAt = (s, p) => { if (!s) return 0; let d = Math.abs(p - s.at); d = Math.min(d, px - d); return s.amp * Math.exp(-(d * d) / (s.half * s.half)); };
  // the cloth is never quite even: a slow drift of tone across the repeat
  const ph = [R() * 6.28, R() * 6.28, R() * 6.28, R() * 6.28];
  const cloud = (x, y) => 0.5 * Math.sin(TAU * (x + 2 * y) + ph[0]) * Math.sin(TAU * (2 * x - y) + ph[1]) + 0.5 * Math.sin(TAU * (3 * x + y) + ph[2]) * Math.sin(TAU * (x - 3 * y) + ph[3]);

  const c = document.createElement('canvas');
  c.width = c.height = px;
  const ctx = c.getContext('2d'), img = ctx.createImageData(px, px), d = img.data;
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const xs = ((Math.round(x + warp.wander[y]) % px) + px) % px, ys = ((Math.round(y + weft.wander[x]) % px) + px) % px;
      const i = warp.idx[xs], su = Math.sin(Math.PI * warp.u[xs]), j = weft.idx[ys], sv = Math.sin(Math.PI * weft.u[ys]);
      const over = ((i + j) & 1) === 0;                         // plain weave: the warp thread is on top here, the weft on the next crossing
      const relief = over ? Math.pow(su, 0.8) * (0.55 + 0.45 * sv) : Math.pow(sv, 0.8) * (0.55 + 0.45 * su);
      const tone = over ? warp.tone[i] + slubAt(warp.slub[i], y) * 1.5 : weft.tone[j] + slubAt(weft.slub[j], x) * 1.5;
      const val = (relief - 0.58) * WEAVE.relief + tone * WEAVE.tone + (R() - 0.5) * WEAVE.fibre + cloud(x, y) * 0.13;
      const o = (y * px + x) * 4, col = val < 0 ? SHADE : THREAD;
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2];
      d[o + 3] = Math.min(255, Math.abs(val) * (val < 0 ? WEAVE.dark : WEAVE.light) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

const canvas = document.querySelector('canvas.finish');
if (canvas) {
  const root = document.documentElement;
  const q = parseFloat(new URLSearchParams(location.search).get('finish'));
  if (!Number.isNaN(q)) root.style.setProperty('--finish', String(Math.max(0, Math.min(2, q))));
  let tile = null, tileDpr = 0, lastKey = '';

  const paint = () => {
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);     // (a 3× phone shows the 2× cloth a touch softer; a third of the memory)
    const key = W + 'x' + H + '@' + dpr;
    if (key === lastKey) return;
    lastKey = key;
    if (!tile || tileDpr !== dpr) { tile = linenTile(Math.round(TILE * dpr)); tileDpr = dpr; }
    const w = Math.round(W * dpr), h = Math.round(H * dpr);
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = ctx.createPattern(tile, 'repeat');
    ctx.fillRect(0, 0, w, h);

    // the light of the wall, as authored (the layer is shown at --finish × 50%)
    const diag = Math.hypot(w, h), shade = (a) => `rgba(${SHADE[0]},${SHADE[1]},${SHADE[2]},${a})`, lit = (a) => `rgba(${THREAD[0]},${THREAD[1]},${THREAD[2]},${a})`;
    let g = ctx.createLinearGradient(0, 0, w * 0.9, h);        // lit from the upper left, falling away to the lower right
    g.addColorStop(0, lit(0.13)); g.addColorStop(0.34, lit(0)); g.addColorStop(0.62, shade(0)); g.addColorStop(1, shade(0.12));
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    g = ctx.createRadialGradient(w * 0.5, h * 0.42, diag * 0.3, w * 0.5, h * 0.42, diag * 0.66);   // a gentle vignette; the middle is left alone
    g.addColorStop(0, shade(0)); g.addColorStop(0.55, shade(0.06)); g.addColorStop(1, shade(0.22));
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // one wide, very soft shadow lying across the sheet low down, the way something off-frame shades a lit wall
    const nx = -0.34, ny = 0.94, at = w * 0.5 * nx + h * 0.9 * ny, half = diag * 0.13;
    g = ctx.createLinearGradient(nx * (at - half), ny * (at - half), nx * (at + half), ny * (at + half));
    g.addColorStop(0, shade(0)); g.addColorStop(0.5, shade(0.08)); g.addColorStop(1, shade(0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    root.classList.add('linen');                               // the real cloth is down: canopy.css drops its stand-in weave
  };

  try { paint(); } catch (err) { /* the CSS stand-in stays */ }
  let timer = 0;
  window.addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(() => { try { paint(); } catch (err) { /* keep what is there */ } }, 120); });
}
