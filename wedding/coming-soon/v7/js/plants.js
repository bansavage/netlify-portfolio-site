/* plants.js — every plant in the scene is painted here, procedurally, with the 2D canvas API.
 *
 * Nothing is an image file. Each plant part ("sprite") is painted once at start-up, upright, into
 * its own cell of a big texture atlas; the WebGL scene then places hundreds of copies of those
 * cells on bendable cards. So if a leaf looks wrong, this is the file to edit. To look at the
 * paintings on their own, open ../sheet.html (add ?id=bananaA to see one sprite at 2x, or
 * ?swatch=1 to see the set hung together as a piece of wallpaper).
 *
 * Conventions used by every draw function:
 *   - the origin (0,0) is the point the part grows from (its pivot); it is drawn growing UP (-y).
 *     Things that hang (banana bunch, banana blossom, lianas) are drawn the same way: the scene
 *     hangs them by turning them upside down.
 *   - angles are radians, 0 = straight up, positive = leaning to the right
 *   - R is a seeded random source (kit.js), so a given seed always paints the same leaf
 *   - it returns { len, hull, ... }: `len` = nominal length in px, `hull` = circles [x, y(up), r]
 *     (px, relative to the pivot) that roughly cover the shape; the layout uses them to keep
 *     foliage off the names.
 *
 * THE LOOK: hand-painted gouache wallpaper (the title cards of The White Lotus). Opaque, matte,
 * earthy colour. Every leaf is a flat base coat inside a crisp cut silhouette, then brush strokes
 * laid along its veins in passes from dark to light: shadow strokes, body strokes, dry-brushed
 * sage and yellow-green lights with the bristle streaks showing, and a loose cream midrib. Three
 * or four clear values per leaf, one half usually a step darker than the other. No gradients, no
 * glow, no rim light, no gloss, no outlines. The strokes are built by dab() below.
 */
import { rng, clamp, lerp, smoothstep, mix, rgba } from './kit.js';

const PI = Math.PI, DEG = PI / 180;

/* ============================================================================================
 * The paint box. Muted gouache, anchored on the house olivo (#6E7A3A). A RAMP is five values of
 * one green, darkest first: [shadow, body, mid, light, highlight]. A leaf picks one ramp and uses
 * all five, which is what gives it a dark body, mid strokes and light strokes.
 * ========================================================================================== */
const NIGHT = '#141F18';                       // what the darkest shadow of any green goes toward
const CREAM = '#D0C89E', CREAM_HI = '#E9E3C4', BONE = '#B6AE82';   // midribs: pale, warm, never white
const RAMP = {
  olive:  ['#222B1B', '#3A4526', '#56622E', '#7E8739', '#A6A656'],   // the classic banana leaf of the reference
  young:  ['#3B4826', '#566433', '#77823F', '#9DA158', '#C2BE86'],   // a new leaf: yellow-green going to straw
  forest: ['#131F18', '#1E321F', '#2F482B', '#4B6339', '#768652'],   // old, deep, shadowy
  moss:   ['#29341C', '#404C24', '#5C672F', '#838A40', '#ABAA61'],   // warm olive, the house olivo in the middle
  teal:   ['#142A27', '#1E3F38', '#2F574C', '#4F7768', '#829F8E'],   // the blue-green of bird of paradise leaves
  pine:   ['#14241C', '#1C3427', '#294A34', '#426548', '#6E8C64'],   // deep green with a little blue in it
  sage:   ['#475742', '#617257', '#7F8F72', '#A0AC8E', '#C2C9AC'],   // pale grey-green, the fan palms of the wallpaper
  khaki:  ['#474E2E', '#626B3D', '#80894F', '#A2A86B', '#C5C792'],   // light olive, the pale fronds of the wallpaper
};
/** the same ramp for the half of a leaf that is turned from the light: every value k of a step darker */
const dim = (t, k) => t.map((c, i) => mix(c, i ? t[i - 1] : NIGHT, k));
const OCHRE = ['#876228', '#B38C33', '#D0A946', '#DFC066', '#EBD698'];      // cempasúchil, muted to ochre: bananas
const AMBER = ['#8E4420', '#BF7228', '#DE9634', '#ECB454', '#F3D28C'];      // cempasúchil, only a little muted: bird of paradise sepals
const RUST = ['#451A1C', '#662728', '#8A3A2E', '#B25A3E', '#CF8A66'];       // maroon → barro → clay: banana blossom
const BLUE = ['#172B6E', '#22409F', '#2B4FC4', '#5271D2', '#93A8E6'];       // the house cobalto (#2B4FC4) in the middle: the bird of paradise petal
const UMBER = '#4E3420', BLUSH = '#E6C3A0';

/* ============================================================================================
 * Brushwork
 * ========================================================================================== */

/** a smooth wobble in -1..1 (two sines; a and b are phases, different for every leaf) */
const wob = (x, a, b) => 0.6 * Math.sin(x + a) + 0.4 * Math.sin(x * 2.27 + b);

const _nx = new Float32Array(96), _ny = new Float32Array(96), _w = new Float32Array(96);
/**
 * ONE BRUSH STROKE, added to the current path (the caller fills, so a whole pass of strokes in
 * one colour is a single fill: flat and opaque, like gouache, and cheap).
 * The stroke is a bundle of bristle bands running side by side down `pts`. A loaded brush lays
 * them shoulder to shoulder; a dry one leaves gaps between them, drops some, and lets them stop
 * at different lengths - that is the broken, streaky look of dry-brush.
 *   pts   the stroke's centre line, [[x, y] …] (3 points or more), in the direction of travel
 *   hw    half its width (px) where the brush is pressed hardest
 *   dry   0 = loaded brush … 1 = nearly dry
 *   lift  how much the stroke thins as the brush leaves the paper (0 = not at all … 1 = to a point)
 *   rag   how unevenly the bristles stop (share of the stroke's length)
 */
function dab(ctx, R, pts, hw, dry = 0.25, lift = 0.6, rag = 0.3) {
  const n = pts.length - 1;
  if (n < 2 || hw < 0.25) return;
  press(pts, hw, lift);
  const nb = clamp(Math.round(hw / 2.7), 1, 6), bw = 2 / nb;
  for (let k = 0; k < nb; k++) {
    const g0 = R.f(), g1 = R.f(), e0 = R.f(), e1 = R.f(), sk = R.f();           // (always the same five numbers per band, so the stream stays in step)
    if (nb > 1 && sk < dry * 0.4) continue;                                    // this bundle of bristles carried no paint
    const lo = -1 + k * bw + (k ? g0 * dry * 0.8 * bw : 0);
    const hi = -1 + (k + 1) * bw - (k < nb - 1 ? g1 * dry * 0.8 * bw : 0) + (dry < 0.3 && k < nb - 1 ? 0.06 : 0);
    const i0 = e0 < 0.7 ? 0 : 1 + Math.floor((e0 - 0.7) * 3.3 * rag * 0.6 * n);
    const i1 = n - Math.floor(e1 * e1 * rag * 1.5 * n);
    if (i1 - i0 < 2) continue;
    const brk = dry > 0.45 && sk > 1 - dry * 0.25 && i1 - i0 > 5 ? i0 + 2 + Math.floor(g0 * (i1 - i0 - 3)) : -1;   // the brush skipped
    if (brk > 0) { band(ctx, pts, i0, brk, lo, hi); band(ctx, pts, brk + 1, i1, lo, hi); }
    else band(ctx, pts, i0, i1, lo, hi);
  }
}
/** the normals and the width of a stroke at each of its points: pressed in, then lifted off */
function press(pts, hw, lift) {
  const n = pts.length - 1;
  for (let i = 0; i <= n; i++) {
    const a = pts[i > 0 ? i - 1 : 0], b = pts[i < n ? i + 1 : n];
    const dx = b[0] - a[0], dy = b[1] - a[1], m = Math.hypot(dx, dy) || 1, t = i / n;
    _nx[i] = -dy / m; _ny[i] = dx / m;
    _w[i] = hw * (0.7 + 0.3 * Math.min(1, t * 4)) * (1 - lift * t * t);
  }
}
/** the same stroke as one plain ribbon: the wet body of the stroke, laid thinly under its bristle bands */
function wash(ctx, pts, hw, lift = 0.6) {
  const n = pts.length - 1;
  if (n < 2 || hw < 0.6) return;
  press(pts, hw, lift);
  band(ctx, pts, 0, n, -1, 1);
}
function band(ctx, pts, i0, i1, lo, hi) {
  if (i1 - i0 < 1) return;
  const mid = (lo + hi) / 2;
  ctx.moveTo(pts[i0][0] + _nx[i0] * _w[i0] * mid, pts[i0][1] + _ny[i0] * _w[i0] * mid);       // every band starts from a point (the brush landing) …
  for (let i = i0 + 1; i < i1; i++) ctx.lineTo(pts[i][0] + _nx[i] * _w[i] * lo, pts[i][1] + _ny[i] * _w[i] * lo);
  ctx.lineTo(pts[i1][0] + _nx[i1] * _w[i1] * mid, pts[i1][1] + _ny[i1] * _w[i1] * mid);       // … and ends in one (the brush leaving)
  for (let i = i1 - 1; i > i0; i--) ctx.lineTo(pts[i][0] + _nx[i] * _w[i] * hi, pts[i][1] + _ny[i] * _w[i] * hi);
  ctx.closePath();
}

/** (exported: js/doors.js paints the wooden doors with the same brush)
 * One PASS of strokes: every stroke in `strokes` is { p: points, w: half-width, c: which of `cols`,
 * d: dry, l: lift, g: rag }. Strokes of the same colour go down in a single fill. `soft` (0..1) lays
 * a thin wash of each colour under its strokes first.
 */
export function lay(ctx, R, cols, strokes, alpha = 1, soft = 0) {
  for (let c = 0; c < cols.length; c++) {
    let open = false;
    if (soft > 0) {                                     // a thin wash of the same colour first, a touch wider: it softens the edge of every stroke
      for (const s of strokes) if ((s.c || 0) === c) { if (!open) { ctx.beginPath(); open = true; } wash(ctx, s.p, s.w * 1.14, s.l); }
      if (open) { ctx.fillStyle = rgba(cols[c], soft); ctx.fill(); }
      open = false;
    }
    for (const s of strokes) if ((s.c || 0) === c) {
      if (!open) { ctx.beginPath(); open = true; }
      dab(ctx, R, s.p, s.w, s.d, s.l, s.g);
    }
    if (open) { ctx.fillStyle = alpha < 1 ? rgba(cols[c], alpha) : cols[c]; ctx.fill(); }
  }
}

/** points along a spine from s0 to s1, pushed `off` px to its right (a number, or a function of 0..1) */
const trail = (at, s0, s1, n = 8, off = 0) => Array.from({ length: n + 1 }, (_, i) => {
  const k = i / n, p = at(lerp(s0, s1, k)), o = typeof off === 'function' ? off(k) : off;
  return [p.x + p.nx * o, p.y + p.ny * o];
});

/** Path of a hand-painted line along a spine: its weight swells and thins and it wanders a little.
 *  w0 → w1 half-widths;  ph = phase of the wobble;  off0 → off1 shifts it sideways. */
function rope(ctx, at, s0, s1, w0, w1, ph, n = 40, ease = 1, wander = 0.2, swell = 0.18, off0 = 0, off1 = 0) {
  const a = [], b = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n, p = at(lerp(s0, s1, k)), e = Math.pow(k, ease), wb = lerp(w0, w1, e);
    const w = wb * (1 + swell * wob(k * 19, ph, ph * 1.7)), o = lerp(off0, off1, e) + wb * wander * wob(k * 11, ph * 2.3, ph * 0.7);
    a.push([p.x + p.nx * (o - w), p.y + p.ny * (o - w)]); b.push([p.x + p.nx * (o + w), p.y + p.ny * (o + w)]);
  }
  poly(ctx, [...a, ...b.reverse()]);
}

/** A painted stalk: a flat body, a darker stroke or two down its right side, a dry lighter one
 *  down its left (flip = -1 swaps the two, for things that will hang). cols = [shade, body, light]. */
function stem(ctx, R, at, s0, s1, w0, w1, cols, ph = 1, flip = 1) {
  rope(ctx, at, s0, s1, w0, w1, ph, 40, 1, 0.035, 0.035); ctx.fillStyle = cols[1]; ctx.fill();
  const wAt = (k) => lerp(w0, w1, k), n = Math.max(1, Math.round((s1 - s0) * 2.4));
  const side = (f, hwK, dry) => {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = lerp(s0, s1, (i + R.range(0, 0.2)) / n), b = lerp(s0, s1, Math.min(1, (i + R.range(0.9, 1.3)) / n));
      const k0 = (a - s0) / (s1 - s0), k1 = (b - s0) / (s1 - s0);
      dab(ctx, R, trail(at, a, b, 8, (k) => wAt(lerp(k0, k1, k)) * f), wAt((k0 + k1) / 2) * hwK, dry, 0.5, 0.25);
    }
  };
  side(0.58 * flip, 0.42, 0.2); ctx.fillStyle = cols[0]; ctx.fill();
  side(-0.42 * flip, 0.3, 0.6); ctx.fillStyle = cols[2]; ctx.fill();
}

/* ============================================================================================
 * Geometry helpers
 * ========================================================================================== */

/** A curved centre line, built by walking forward while the heading changes. */
function makeSpine(len, n, angleAt, x0 = 0, y0 = 0) {
  const xs = new Float32Array(n + 1), ys = new Float32Array(n + 1), as = new Float32Array(n + 1);
  let px = x0, py = y0;
  const ds = len / n;
  for (let i = 0; i <= n; i++) {
    const a = angleAt(i / n);
    as[i] = a; xs[i] = px; ys[i] = py;
    px += Math.sin(a) * ds; py -= Math.cos(a) * ds;
  }
  return {
    len,
    /** point + tangent (tx,ty) + right-hand normal (nx,ny) at s = 0..1 */
    at(s) {
      const f = clamp(s) * n, i = Math.min(n - 1, Math.floor(f)), k = f - i;
      const a = lerp(as[i], as[i + 1], k);
      return { x: lerp(xs[i], xs[i + 1], k), y: lerp(ys[i], ys[i + 1], k), ang: a,
               tx: Math.sin(a), ty: -Math.cos(a), nx: Math.cos(a), ny: Math.sin(a) };
    },
  };
}

/** Path through a list of [x, y] points. */
function poly(ctx, pts, close = true) {
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  if (close) ctx.closePath();
}

/** Path of a tapered strip that follows a spine from s0 to s1 (half-widths w0 → w1).
 *  off0 → off1 shifts its centre sideways (+ = to the right of the direction of growth). */
function ribbon(ctx, sp, s0, s1, w0, w1, steps = 28, ease = 1, off0 = 0, off1 = 0) {
  const left = [], right = [];
  for (let i = 0; i <= steps; i++) {
    const k = i / steps, p = sp.at(lerp(s0, s1, k)), e = Math.pow(k, ease), w = lerp(w0, w1, e), o = lerp(off0, off1, e);
    left.push([p.x + p.nx * (o - w), p.y + p.ny * (o - w)]);
    right.push([p.x + p.nx * (o + w), p.y + p.ny * (o + w)]);
  }
  poly(ctx, [...left, ...right.reverse()]);
}

/** Points along a smooth curve through the given control points (Catmull-Rom), `per` samples per span. */
function smoothPts(ctrl, per = 10) {
  const out = [], n = ctrl.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(n - 1, i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((d) => 0.5 * (2 * p1[d] + (p2[d] - p0[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (3 * p1[d] - p0[d] - 3 * p2[d] + p3[d]) * t3)));
    }
  }
  out.push(ctrl[n - 1].slice());
  return out;
}

/** Points along a quadratic Bézier from a to b, pulled toward c. */
const quadPts = (a, c, b, n = 10) => Array.from({ length: n + 1 }, (_, i) => {
  const t = i / n, m = 1 - t;
  return [m * m * a[0] + 2 * m * t * c[0] + t * t * b[0], m * m * a[1] + 2 * m * t * c[1] + t * t * b[1]];
});

/** Path of a line that tapers from w0 wide to w1 wide along the given points (filled, not stroked).
 *  `shift` moves it sideways by that many widths (used for the lit and shaded flank of a vein). */
function taper(ctx, pts, w0, w1, shift = 0) {
  const a = [], b = [], n = pts.length - 1;
  for (let i = 0; i <= n; i++) {
    const p = pts[Math.max(0, i - 1)], q = pts[Math.min(n, i + 1)];
    let nx = -(q[1] - p[1]), ny = q[0] - p[0]; const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
    const w = lerp(w0, w1, i / n) * 0.5, o = w * 2 * shift;
    a.push([pts[i][0] + nx * (o + w), pts[i][1] + ny * (o + w)]); b.push([pts[i][0] + nx * (o - w), pts[i][1] + ny * (o - w)]);
  }
  poly(ctx, [...a, ...b.reverse()]);
}

const dir = (a) => [Math.sin(a), -Math.cos(a)];

/* ============================================================================================
 * THE BLADE: banana, bird-of-paradise leaf, monstera and calathea are all built from this.
 *
 * A midrib (spine) with a width envelope on both sides. Side veins leave the midrib squarely and
 * bend forward to the margin; they are never ruled as lines - the brush strokes run along them,
 * and that is what draws them. "Cuts" open the margin along a vein: a sharp wedge is a wind tear
 * (banana), a round-bottomed slot is a monstera slit.
 *
 * How it is painted, in order:
 *   1. a flat base coat inside the cut silhouette (the ramp's body colour), the half turned from
 *      the light a step darker
 *   2. shadow strokes: out of the furrow beside the midrib, in from the margin, down every tear
 *   3. body strokes over most of the blade, in two or three close mid greens
 *   4. dry-brushed lights where the light falls (in patches a few veins wide, and segment by
 *      segment between the tears), then a few short highlights inside those
 *   5. a few thin dark strokes between them, a broken darker edge, the loose cream midrib
 *
 *   o.stalk / o.blade   length of the bare stalk and of the leaf blade (px)
 *   o.halfW             half the width of the blade at its widest (px);  o.sideW = [left, right] scale
 *   o.env(u)            width profile 0..1 along the midrib (u = 0 base … 1 tip)
 *   o.sweep(u), o.bow   how far the veins lean toward the tip, and how much they curve doing it
 *   o.margin(u, side)   optional wave / bulge of the margin (1 = on the envelope)
 *   o.pal               { t: a RAMP, rib, stalk: [shade, body, light] }
 *   o.fold              which half sits in shade and by how much: < 0 the left, > 0 the right
 *   o.brush             width of one stroke (px);  o.body / o.light / o.shadow scale how much of each pass goes down
 * ========================================================================================== */
function blade(ctx, R, o) {
  const total = o.stalk + o.blade;
  const sp = makeSpine(total, 160, o.angle);
  const sb = o.stalk / total, at = (s) => sp.at(s);
  const M = (u) => sp.at(sb + clamp(u) * (1 - sb));
  const sideW = o.sideW || [1, 1], sweep = o.sweep || (() => 0.35), bow = o.bow ?? 1.5;
  const ph = [R.range(0, 20), R.range(0, 20), R.range(0, 20), R.range(0, 20), R.range(0, 20)];
  const hand = o.hand ?? 0.011;                                   // the tiny irregularities of an edge cut by hand
  const margin = (u, sg) => (o.margin ? o.margin(u, sg) : 1) * (1 + hand * wob(u * 47, ph[sg < 0 ? 0 : 1], ph[2]));
  const hw = (u, sg) => o.halfW * o.env(clamp(u)) * (sg < 0 ? sideW[0] : sideW[1]);
  /** a point on the blade: u along the midrib, sg = side (-1 left, +1 right), r = 0 midrib … 1 margin */
  const E = (u, sg, r) => {
    const p = M(u), w = hw(u, sg), f = sweep(clamp(u)) * w * Math.pow(Math.max(0, r), bow);
    return [p.x + sg * p.nx * w * r + p.tx * f, p.y + sg * p.ny * w * r + p.ty * f];
  };
  /** one side vein, as points from the midrib out to r1 */
  const vein = (u, sg, r1 = 1.08, r0 = 0) => Array.from({ length: 8 }, (_, k) => E(u, sg, lerp(r0, r1, k / 7)));
  /** the centre line of a brush stroke that follows the vein at u from r0 to r1, drifting du as it goes */
  const run = (u, sg, r0, r1, du = 0) => { const p = []; for (let k = 0; k <= 12; k++) p.push(E(u + du * k / 12, sg, lerp(r0, r1, k / 12))); return p; };

  /* --- outline of one side, base to tip, with its cuts ---------------------------------------- */
  const side = (sg, withCuts = true) => {
    const cuts = withCuts ? [...((sg < 0 ? o.cutsL : o.cutsR) || [])].sort((a, b) => a.u - b.u) : [];
    const lead = (c) => (c.round ? (c.gap / 2) * (1 + (c.flare ?? 0.5)) + (c.corner ?? c.gap * 0.6) : 0);
    const pts = [], N = o.outlineN || 120, push = (u, r) => pts.push(E(u, sg, r));
    let ci = 0, skip = -1;
    for (let i = 0; i <= N; i++) {
      const u = 0.5 - 0.5 * Math.cos(PI * i / N);                 // (samples crowd toward both ends, where the outline turns fastest)
      while (ci < cuts.length && cuts[ci].u - lead(cuts[ci]) <= u) {
        const c = cuts[ci++], d = 1 - c.depth;
        if (!c.round) {
          // a tear: in along one vein, back out along a line that opens to `gap` at the margin
          const m0 = margin(c.u, sg), m1 = margin(c.u + c.gap, sg);
          for (let k = 0; k <= 5; k++) push(c.u, lerp(m0, d, k / 5));
          for (let k = 1; k <= 5; k++) push(c.u + c.gap * k / 5, lerp(d, m1, k / 5));
          skip = c.u + c.gap;
        } else {
          // a slit: rounded lobe corner, down the wall, round the bottom, up the wall, rounded corner
          const h = c.gap / 2, hF = h * (1 + (c.flare ?? 0.5)), e = c.corner ?? c.gap * 0.6;
          const iso = o.blade / Math.max(1, hw(c.u, sg));          // one unit of u measured in units of r, at this place
          const rb = Math.min(h * iso, (1 - d) * 0.45), eR = Math.min(e * iso, (1 - d) * 0.3);
          const wall = (r) => lerp(h, hF, clamp((r - d - rb) / Math.max(1e-3, 1 - eR - d - rb)));
          const mA = margin(c.u - hF - e, sg), mB = margin(c.u + hF + e, sg);
          for (let k = 0; k <= 4; k++) { const f = (k / 4) * PI / 2; push(c.u - hF - e + e * Math.sin(f), mA * (1 - eR + eR * Math.cos(f))); }
          for (let k = 1; k <= 5; k++) { const r = lerp(1 - eR, d + rb, k / 5); push(c.u - wall(r), r * lerp(mA, 1, k / 5)); }
          for (let k = 1; k <= 8; k++) { const f = (k / 8) * PI; push(c.u - h * Math.cos(f), d + rb * (1 - Math.sin(f))); }
          for (let k = 1; k <= 5; k++) { const r = lerp(d + rb, 1 - eR, k / 5); push(c.u + wall(r), r * lerp(1, mB, k / 5)); }
          for (let k = 3; k >= 0; k--) { const f = (k / 4) * PI / 2; push(c.u + hF + e - e * Math.sin(f), mB * (1 - eR + eR * Math.cos(f))); }
          skip = c.u + hF + e;
        }
      }
      if (u > skip) push(u, margin(u, sg));
    }
    return pts;
  };
  const ring = [...side(1), ...side(-1).reverse()];

  /* --- the colours: one ramp, and the same ramp a step darker for the half in shade ------------- */
  const pal = o.pal, t = pal.t, fold = o.fold ?? -0.5, dk = fold < 0 ? -1 : 1, tS = dim(t, Math.abs(fold));
  const ramp = (sg) => (sg === dk ? tS : t);

  /* --- stalk (petiole) -------------------------------------------------------------------------- */
  const [w0, w1s] = o.stalk > 0 ? o.stalkW : [o.ribW[0], o.ribW[0]], [r0, r1] = o.ribW;
  if (o.stalk > 0) stem(ctx, R, at, 0, sb + 0.012, w0, w1s, pal.stalk, ph[4]);

  /* --- 1. base coat, cut to the silhouette -------------------------------------------------------- */
  poly(ctx, ring); ctx.fillStyle = t[1]; ctx.fill();
  ctx.save();
  poly(ctx, ring); ctx.clip();
  const spinePts = Array.from({ length: 41 }, (_, i) => { const p = M(i / 40); return [p.x, p.y]; });
  poly(ctx, [...spinePts, ...Array.from({ length: 41 }, (_, i) => E(1 - i / 40, dk, 1.25))]); ctx.fillStyle = tS[1]; ctx.fill();

  /* --- 2-4. the strokes --------------------------------------------------------------------------- */
  const sw = o.brush ?? clamp(o.blade * 0.034, 9, 30), nS = Math.max(6, Math.round(o.blade / sw));
  const kBody = o.body ?? 1, kLight = o.light ?? 1, kShadow = o.shadow ?? 1;
  for (const sg of [-1, 1]) {
    const c = ramp(sg), cuts = ((sg < 0 ? o.cutsL : o.cutsR) || []).filter((q) => !q.round).map((q) => q.u).sort((a, b) => a - b);
    const segTone = Array.from({ length: cuts.length + 1 }, () => R.range(-0.3, 0.3));        // each panel between two tears catches the light differently
    const lit = (u) => { let i = 0; while (i < cuts.length && cuts[i] < u) i++; return 0.5 + 0.4 * wob(u * 11, ph[sg < 0 ? 2 : 3], ph[0] + sg) + segTone[i] + (sg === dk ? -0.14 : 0.14); };
    const shadow = [], body = [], light = [], high = [], fine = [], fleck = [];
    for (let i = 0; i < nS; i++) {
      const u = (i + R.range(0.15, 0.85)) / nS, wk = sw * clamp(o.env(u) * 1.6, 0.35, 1), L = lit(u), dr = () => R.range(-0.45, 0.45) / nS;
      if (R.chance(0.62 * kShadow)) shadow.push({ p: run(u, sg, -0.03, R.range(0.16, 0.5), dr()), w: wk * R.range(0.35, 0.6), d: 0.15, l: 0.85, g: 0.25 });
      if (R.chance(0.3 * kShadow)) shadow.push({ p: run(u, sg, 1.08, R.range(0.6, 0.88), dr()), w: wk * R.range(0.25, 0.5), d: 0.2, l: 0.85, g: 0.25 });
      // the body stroke: darker greens in the panels that are turned away, lighter where the light falls
      if (R.chance(0.8 * kBody)) body.push({ p: run(u, sg, R.range(0.02, 0.2), R.range(0.8, 1.1), dr()), w: wk * R.range(0.42, 0.66), c: clamp(Math.floor(L * 3 + R.range(-0.3, 0.3)), 0, 2), d: 0.1, l: 0.4, g: 0.2 });
      // a light stroke, nearly the whole way from midrib to margin; some veins are left dark between them (the ribbing)
      if (R.f() < smoothstep(0.28, 0.7, L) * 0.78 * kLight) {
        const a = R.range(0.06, 0.24), b = R.range(0.8, 1.04), d = dr(), w = wk * R.range(0.34, 0.6);
        light.push({ p: run(u, sg, a, b, d), w, c: R.int(0, 1), d: 0.32, l: 0.5, g: 0.3 });
        // … and, on some, a drier, paler touch down its middle
        if (R.f() < smoothstep(0.45, 0.9, L) * 0.6) { const a2 = a + R.range(0.08, 0.25); high.push({ p: run(u + R.range(-0.15, 0.15) / nS, sg, a2, Math.min(b - 0.05, a2 + R.range(0.25, 0.5)), d), w: w * R.range(0.4, 0.7), d: 0.6, l: 0.7, g: 0.4 }); }
      }
      if (R.chance(0.22)) fine.push({ p: run(u, sg, R.range(0, 0.3), R.range(0.5, 1.04), dr()), w: R.range(0.8, 1.9), d: 0, l: 0.75, g: 0 });
      if (R.f() < smoothstep(0.3, 0.75, L) * 0.3 * kLight) { const a = R.range(0.66, 0.9); fleck.push({ p: run(u, sg, a, Math.min(1.03, a + R.range(0.1, 0.24)), dr()), w: wk * R.range(0.2, 0.4), d: 0.75, l: 0.3, g: 0.5 }); }
    }
    for (const q of (sg < 0 ? o.cutsL : o.cutsR) || []) if (!q.round) {                       // the far lip of every tear sits in its own shadow
      shadow.push({ p: run(q.u + q.gap + 0.5 / nS, sg, 1 - q.depth - 0.03, 1.08), w: sw * R.range(0.3, 0.5), d: 0.2, l: 0.4, g: 0.2 });
      if (R.chance(0.6)) light.push({ p: run(q.u - 0.55 / nS, sg, 1 - q.depth * R.range(0.5, 0.9), 1.02), w: sw * R.range(0.22, 0.36), c: 0, d: 0.5, l: 0.6, g: 0.4 });
    }
    lay(ctx, R, [c[0]], shadow, 1, 0.4);
    lay(ctx, R, [mix(c[2], c[1], 0.45), c[2], mix(c[2], c[3], 0.3)], body, 1, 0.5);
    lay(ctx, R, [c[3], mix(c[3], c[2], 0.4)], light, 1, 0.45);
    lay(ctx, R, [c[4]], high, 1, 0.3);
    lay(ctx, R, [mix(c[4], '#D8DAC6', 0.55)], fleck);                    // a few touches of nearly dry, chalky paint out toward the margin
    if (o.paint) o.paint({ M, E, hw, vein, run, sg, c, nS, sw });       // pattern (calathea feathers and spots)
    lay(ctx, R, [c[0]], fine, 0.85);
    // a few stronger veins, each one loose stroke (monstera lobes)
    const mv = (o.mainVeins || []).filter((q) => q.sg === sg).map((q) => ({ p: run(q.u, sg, 0.02, q.r1 ?? 0.95), w: q.w ?? 2, d: 0.3, l: 0.8, g: 0.2 }));
    if (mv.length) lay(ctx, R, [pal.vein || c[3]], mv);
    // the furrow beside the midrib: a broken dark line on the shaded side
    if (sg === dk) {
      const f = [];
      for (let i = 0; i < 5; i++) { const a = (i + R.range(0, 0.35)) / 5, b = Math.min(0.97, a + R.range(0.1, 0.2)); f.push({ p: trail(M, a, b, 8, (k) => sg * (lerp(r0, r1, Math.pow(lerp(a, b, k), 0.85)) + 1.2)), w: lerp(r0, r1, a) * 0.55 + 0.8, d: 0.1, l: 0.6, g: 0.1 }); }
      lay(ctx, R, [mix(c[0], NIGHT, 0.35)], f);
    }
  }

  /* --- 5. a broken darker edge, as a loaded brush leaves when it cuts in a silhouette ------------- */
  ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
  const edge = mix(tS[0], NIGHT, 0.25), eA = o.edge ?? 1;
  poly(ctx, ring); ctx.setLineDash([R.range(40, 90), R.range(14, 30), R.range(90, 170), R.range(20, 44), R.range(20, 40), R.range(10, 22)]);
  ctx.strokeStyle = rgba(edge, 0.75 * eA); ctx.lineWidth = 3.4; ctx.stroke();
  poly(ctx, ring); ctx.setLineDash([R.range(40, 100), R.range(60, 150)]); ctx.lineDashOffset = R.range(0, 200);
  ctx.strokeStyle = rgba(edge, 0.55 * eA); ctx.lineWidth = 6.4; ctx.stroke();
  ctx.setLineDash([]); ctx.lineDashOffset = 0;
  ctx.restore();

  /* --- holes (monstera) ------------------------------------------------------------------------ */
  for (const h of o.holes || []) {
    const c = E(h.u, h.sg, h.r), p0 = E(h.u, h.sg, h.r - 0.05), p1 = E(h.u, h.sg, h.r + 0.05);
    const ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
    ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(c[0], c[1], h.len, h.len * h.fat, ang, 0, PI * 2); ctx.fill();
    ctx.restore();
  }

  /* --- the midrib: loosely painted, pale cream, its weight swelling and thinning ------------------ */
  rope(ctx, at, sb, 0.992, r0, r1, ph[1], 60, 0.8, 0.22, 0.2); ctx.fillStyle = pal.rib; ctx.fill();
  if (o.stalk > 0) {                                              // the stalk runs a little way up into the blade and thins into the rib
    const e = sb + 0.17 * (1 - sb);
    rope(ctx, at, sb - 0.01, e, w1s, r0 * 0.5, ph[4], 16, 0.7, 0.05, 0.05); ctx.fillStyle = pal.stalk[1]; ctx.fill();
    ctx.beginPath(); dab(ctx, R, trail(at, sb - 0.01, e + 0.05 * (1 - sb), 8), w1s * 0.8, 0.55, 0.9, 0.5); ctx.fillStyle = pal.stalk[1]; ctx.fill();
    ctx.beginPath(); dab(ctx, R, trail(at, sb - 0.02, sb + 0.13 * (1 - sb), 8, w1s * 0.45), w1s * 0.4, 0.25, 0.8, 0.3); ctx.fillStyle = pal.stalk[0]; ctx.fill();
  }
  ctx.beginPath();                                                // a lighter touch along its lit edge
  for (let i = 0; i < 4; i++) { const a = sb + (1 - sb) * (0.06 + (i + R.range(0, 0.4)) / 4.6), b = Math.min(0.97, a + (1 - sb) * R.range(0.1, 0.2)); dab(ctx, R, trail(at, a, b, 8, (k) => -dk * lerp(r0, r1, (lerp(a, b, k) - sb) / (1 - sb)) * 0.35), Math.max(0.7, lerp(r0, r1, (a - sb) / (1 - sb)) * 0.4), 0.3, 0.7, 0.3); }
  ctx.fillStyle = pal.ribHi || CREAM_HI; ctx.fill();

  const hull = [];
  for (const u of [0.08, 0.26, 0.44, 0.62, 0.8, 0.95]) {
    const p = M(u), w = o.halfW * o.env(u), k = sweep(u) * w * 0.5;
    hull.push([p.x + p.tx * k, -(p.y + p.ty * k), Math.max(w * 0.92, o.stalkW ? o.stalkW[1] * 2 : 4)]);
  }
  for (const s of [0.3, 0.7]) { const p = sp.at(sb * s); hull.push([p.x, -p.y, (o.stalkW ? o.stalkW[0] : 4) * 1.5]); }
  return { len: total, hull };
}

/** wind tears down one side of a leaf: mostly short, about one in three splits almost to the midrib */
const makeTears = (R, n, from = 0.16, to = 0.92) => Array.from({ length: n }, (_, i) => {
  const deep = R.chance(0.36);
  return { u: lerp(from, to, (i + R.range(0.2, 0.8)) / Math.max(1, n)), depth: deep ? R.range(0.8, 0.95) : R.range(0.3, 0.64), gap: deep ? R.range(0.016, 0.032) : R.range(0.007, 0.015) };
});

/** stalk colours [shade, body, light] that belong to a ramp */
const stalkOf = (t) => [t[0], mix(t[2], t[3], 0.25), mix(t[3], t[4], 0.5)];

/* ============================================================================================
 * BANANA LEAF — a huge oblong paddle on a thick stalk: blunt tip, pale midrib, split by the wind
 * along its veins. The star of the wallpaper: you should be able to count its brush strokes.
 *   v.len    whole length;  v.stalk = share of it that is bare stalk;  v.wide = half-width ÷ blade length
 *   v.lean / v.curl   how far it leans, and how much more the tip curls over (radians)
 *   v.sideW  [left, right] width of the two halves (0.25 = seen almost side-on)
 *   v.fold   which half is in shade, and how deep: < 0 the left, > 0 the right
 *   v.tears  [left, right] number of wind tears;  v.ramp = its greens (a RAMP)
 * ========================================================================================== */
function banana(ctx, R, v) {
  const L = v.len, stalk = L * v.stalk, len = L - stalk;
  return blade(ctx, R, {
    stalk, blade: len, halfW: len * v.wide,
    angle: (s) => v.lean * s + v.curl * s * s * s,
    env: (u) => Math.pow(1 - Math.pow(Math.abs(2 * u - 1), 2.5), 0.62) * (1.04 - 0.12 * u),
    sweep: (u) => 0.4 * (1 - Math.pow(u, 6)), bow: 1.6,
    sideW: v.sideW, fold: v.fold,
    cutsL: makeTears(R, v.tears[0]), cutsR: makeTears(R, v.tears[1]),
    stalkW: [L * 0.021, L * 0.0125], ribW: [L * 0.0066, L * 0.0013],
    pal: { t: v.ramp, rib: v.rib || CREAM, stalk: stalkOf(v.ramp) },
    body: v.body, light: v.light, shadow: v.shadow,
  });
}

/* ============================================================================================
 * FURLED BANANA LEAF — the new leaf before it opens: a tight pale cigar on a stalk, wound in a
 * spiral. Painted with long strokes down its length; the seams are single dark strokes.
 *   v.stalk  share of the length that is stalk;  v.wide = half-width of the roll ÷ length
 *   v.turns  how many seams wind round it;  v.lean / v.curl = how it leans and bends
 * ========================================================================================== */
function bananaFurl(ctx, R, v) {
  const L = v.len, sb = v.stalk, W = L * v.wide, w0 = L * 0.02, w1 = L * 0.013, t = RAMP.young;
  const sp = makeSpine(L, 90, (s) => v.lean * s + v.curl * s * s), at = (s) => sp.at(s);
  const hw = (s) => {                                              // half-width: stalk, then the swelling roll, then a fine point
    if (s < sb) return lerp(w0, w1, s / sb);
    const u = (s - sb) / (1 - sb);
    return W * Math.pow(Math.sin(PI * Math.pow(u, 0.6)), 1.5) + w1 * Math.pow(1 - u, 2.5);
  };
  const edge = (f, s0 = 0, s1 = 1, n = 80) => Array.from({ length: n + 1 }, (_, i) => { const s = lerp(s0, s1, i / n), p = sp.at(s), w = hw(s) * f; return [p.x + p.nx * w, p.y + p.ny * w]; });
  stem(ctx, R, at, 0, sb + 0.03, w0, w1, stalkOf(RAMP.olive), 3);
  const shape = () => poly(ctx, [...edge(-1, sb), ...edge(1, sb).reverse()]);
  shape(); ctx.fillStyle = t[2]; ctx.fill();
  ctx.save(); shape(); ctx.clip();
  const long = (f, n, wK, dry, len = [0.14, 0.3]) => Array.from({ length: n }, (_, i) => {
    const a = lerp(sb, 0.97, (i + R.range(0, 0.6)) / n), b = Math.min(1, a + R.range(len[0], len[1])), ff = f + R.range(-0.1, 0.1);
    return { p: trail(at, a, b, 8, (k) => hw(lerp(a, b, k)) * ff), w: W * wK * R.range(0.7, 1.2), c: R.int(0, 1), d: dry, l: 0.7, g: 0.4 };
  });
  lay(ctx, R, [t[1], mix(t[1], t[2], 0.5)], [...long(0.72, 7, 0.3, 0.25), ...long(0.38, 5, 0.2, 0.4)], 1, 0.45);      // it is round: shade down the right …
  lay(ctx, R, [t[3], mix(t[3], t[4], 0.5)], [...long(-0.4, 7, 0.26, 0.5), ...long(-0.1, 4, 0.16, 0.6)], 1, 0.4);       // … light down the left
  lay(ctx, R, [t[4]], long(-0.55, 4, 0.12, 0.7, [0.08, 0.16]));
  // the rolled-up blade shows as seams winding round it
  const seams = [];
  for (let i = 0; i < v.turns; i++) {
    const sa = lerp(sb + 0.06, 0.8, i / v.turns), sz = Math.min(0.99, sa + 0.3);
    seams.push({ p: Array.from({ length: 13 }, (_, k) => { const f = k / 12, s = lerp(sa, sz, f), p = sp.at(s), w = hw(s) * lerp(-1.05, 1.05, f * f * (3 - 2 * f)); return [p.x + p.nx * w, p.y + p.ny * w]; }), w: 2.2, d: 0, l: 0.4, g: 0 });
  }
  lay(ctx, R, [t[0]], seams);
  ctx.lineJoin = 'round'; shape(); ctx.setLineDash([60, 18, 110, 30]); ctx.strokeStyle = rgba(t[0], 0.5); ctx.lineWidth = 2.6; ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();
  const hull = [0.15, 0.4, 0.62, 0.84].map((s) => { const p = sp.at(s); return [p.x, -p.y, Math.max(hw(s) * 1.2, L * 0.03)]; });
  return { len: L, hull };
}

/* ============================================================================================
 * BIRD OF PARADISE LEAF — an upright blue-green paddle on a long stiff stalk, folded like a canoe,
 * with a point. Calmer than banana: longer, more even strokes, one or two clean splits at most.
 *   v.stalk  share of the length that is bare stalk (about half);  v.wide = half-width ÷ blade length
 *   v.sideW  [left, right] width of the two halves;  v.fold = the half in shade;  v.tears = splits
 * ========================================================================================== */
function bopLeaf(ctx, R, v) {
  const L = v.len, stalk = L * v.stalk, len = L - stalk, t = v.ramp || RAMP.teal;
  return blade(ctx, R, {
    stalk, blade: len, halfW: len * v.wide,
    angle: (s) => v.lean * s + v.curl * s * s,
    env: (u) => Math.pow(Math.sin(PI * Math.pow(u, 0.84)), 0.78),
    sweep: (u) => 0.55 * (1 - Math.pow(u, 6)), bow: 1.5,
    sideW: v.sideW, fold: v.fold,
    cutsR: makeTears(R, v.tears, 0.45, 0.85).map((q) => ({ ...q, depth: Math.min(q.depth, 0.6), gap: q.gap * 0.7 })),
    stalkW: [L * 0.013, L * 0.009], ribW: [L * 0.0058, L * 0.0013],
    pal: { t, rib: CREAM, stalk: stalkOf(t) },
    brush: len * 0.034, light: v.light ?? 0.85, shadow: 0.8,
  });
}

/* ============================================================================================
 * MONSTERA — a leathery heart, split from the margin toward the midrib into round-ended lobes,
 * with a few oval holes near the midrib in line with the slits.
 *   v.slits  slits per side;  v.fold = the half in shade;  v.ramp = its greens
 * ========================================================================================== */
function monstera(ctx, R, v) {
  const L = v.len, stalk = L * v.stalk, len = L - stalk, t = v.ramp;
  const slits = (n) => Array.from({ length: n }, (_, i) => {
    const u = lerp(0.2, 0.86, (i + 0.5) / n) + R.range(-0.01, 0.01);
    return { u, round: true, depth: R.range(0.58, 0.76) * (1 - 0.3 * Math.abs(u - 0.45)), gap: R.range(0.026, 0.034), flare: 0.7 };
  });
  const cutsR = slits(v.slits), cutsL = slits(v.slits);
  // each lobe swells a little past the heart outline, so the margin is a row of soft scallops
  const lobes = (cuts) => { const us = [0.03, ...cuts.map((c) => c.u), 0.99]; return us.slice(0, -1).map((u, i) => [u, us[i + 1]]); };
  const swell = (cuts) => { const ls = lobes(cuts); return (u) => { const l = ls.find(([a, b]) => u >= a && u <= b); return l ? 1 + 0.045 * Math.sin(PI * (u - l[0]) / (l[1] - l[0])) : 1; }; };
  const sR = swell(cutsR), sL = swell(cutsL);
  const mainVeins = [], holes = [];
  for (const [sg, cuts] of [[1, cutsR], [-1, cutsL]]) {
    lobes(cuts).forEach(([a, b]) => mainVeins.push({ u: lerp(a, b, 0.46), sg, w: len * 0.0036, r1: 0.93 }));
    cuts.forEach((c, i) => {
      const d = 1 - c.depth;
      if (d > 0.3 && i > 0 && R.chance(0.85)) holes.push({ u: c.u, sg, r: d * R.range(0.44, 0.54), len: len * 0.5 * d * R.range(0.17, 0.23), fat: R.range(0.4, 0.5) });
    });
  }
  return blade(ctx, R, {
    stalk, blade: len, halfW: len * 0.5,
    angle: (s) => v.lean * s + v.curl * s * s,
    env: (u) => Math.pow(Math.sin(PI * Math.pow(u, 0.62)), 0.8) * (1 - 0.3 * u),
    sweep: (u) => lerp(-0.8, 0.95, Math.pow(u, 0.8)), bow: 1.25,
    margin: (u, sg) => (sg < 0 ? sL(u) : sR(u)), hand: 0.006,
    sideW: v.sideW, fold: v.fold, cutsL, cutsR, outlineN: 150,
    stalkW: [L * 0.0115, L * 0.0085], ribW: [L * 0.006, L * 0.0014],
    pal: { t, rib: v.rib || BONE, stalk: stalkOf(t), vein: mix(t[4], CREAM, 0.35) },
    brush: len * 0.036, body: 0.9, light: v.light ?? 0.8, shadow: 0.9,
    mainVeins, holes,
  });
}

/* ============================================================================================
 * CALATHEA — a broad oval leaf with a painted pattern, the "prayer plant" of the forest floor.
 *   v.pattern 'stripes' = pale feathers along the veins on deep green (alternately long and short)
 *             'spots'   = dark ovals either side of the midrib on a light leaf, wavy margin (rattlesnake)
 * ========================================================================================== */
function calathea(ctx, R, v) {
  const L = v.len, stalk = L * v.stalk, len = L - stalk, t = v.ramp, n = v.marks, spots = v.pattern === 'spots';
  return blade(ctx, R, {
    stalk, blade: len, halfW: len * v.wide,
    angle: (s) => v.lean * s + v.curl * s * s,
    env: (u) => Math.pow(Math.sin(PI * Math.pow(u, spots ? 0.8 : 0.9)), spots ? 0.62 : 0.7) * (spots ? 1 : 1 - 0.08 * u),
    sweep: (u) => 0.62 * (1 - Math.pow(u, 5)), bow: 1.7,
    margin: spots ? (u) => 1 + 0.03 * Math.sin(u * PI * 2 * 5.5) * smoothstep(0.03, 0.25, u) * smoothstep(1, 0.8, u) : undefined,
    sideW: v.sideW, fold: v.fold,
    stalkW: [L * 0.011, L * 0.0075], ribW: [L * 0.0055, L * 0.0013],
    pal: { t, rib: CREAM, stalk: stalkOf(t) },
    brush: len * 0.03, light: spots ? 0.7 : 0.35, shadow: spots ? 0.5 : 0.9,
    // the pattern: one fat stroke per mark, pressed in beside the midrib and lifted off toward the margin
    paint: ({ E, sg }) => {
      const marks = [], dry = [];
      for (let i = 0; i < n; i++) {
        const u = lerp(0.07, 0.9, (i + 0.5) / n), big = i % 2 === 0;
        const r0 = spots ? 0.1 : 0.07, r1 = spots ? (big ? 0.76 : 0.46) : (big ? 0.9 : 0.6);
        const du = (0.83 / n) * (spots ? (big ? 0.4 : 0.27) : (big ? 0.27 : 0.2));
        const a = [], b = [], mid = [];
        for (let k = 0; k <= 12; k++) {
          const f = k / 12, w = du * Math.pow(Math.sin(PI * Math.pow(f, spots ? 0.85 : 0.7)), spots ? 0.6 : 0.85) * (1 + 0.1 * Math.sin(f * 9 + i));
          a.push(E(u - w, sg, lerp(r0, r1, f))); b.push(E(u + w, sg, lerp(r0, r1, f))); mid.push(E(u, sg, lerp(r0 + 0.04, r1 * 0.92, f)));
        }
        marks.push([...a, ...b.reverse()]);
        if (R.chance(0.7)) dry.push({ p: mid, w: du * len * R.range(0.25, 0.45), d: 0.6, l: 0.8, g: 0.5 });
      }
      ctx.beginPath();
      for (const m of marks) { ctx.moveTo(m[0][0], m[0][1]); for (let k = 1; k < m.length; k++) ctx.lineTo(m[k][0], m[k][1]); ctx.closePath(); }
      ctx.fillStyle = v.mark[0]; ctx.fill();
      lay(ctx, R, [v.mark[1]], dry);
    },
  });
}

/* ============================================================================================
 * ELEPHANT EAR (alocasia) — a big arrow-shaped leaf hung on the end of its stalk: two lobes
 * pointing back past the stalk, a long drip tip, bold pale veins. Drawn flat (no curl), since the
 * leaf is stiff. The outline is a smooth curve through the control points in `half`. The brush
 * strokes run out from the midrib and the two back ribs to the margin, alongside the veins; the
 * veins themselves are single loose cream strokes.
 *   v.wide     half-width ÷ blade size;  v.lobe 0..1 = how far out the two back lobes point
 *   v.scallop  depth of the scallops between vein ends (0 = smooth margin)
 *   v.tilt     the blade's own lean, added to the stalk's
 *   v.ramp     its greens;  v.vein = colour of the veins;  v.fold = the half in shade (< 0 left, > 0 right)
 * ========================================================================================== */
function alocasia(ctx, R, v) {
  const L = v.len, S = L * (1 - v.stalk), Lt = S * 0.7, Lb = S * 0.3, W = S * v.wide, t = v.ramp;
  const sp = makeSpine(L - Lt, 60, (s) => v.lean * s + v.curl * s * s), at = (s) => sp.at(s);
  const A = sp.at(1), tilt = A.ang + v.tilt;                       // A = where the stalk meets the blade
  const f = dir(tilt), r = [Math.cos(tilt), Math.sin(tilt)];
  /** leaf coordinates → canvas: y = toward the tip, x = across (already signed) */
  const P = ([y, x]) => [A.x + f[0] * y + r[0] * x, A.y + f[1] * y + r[1] * x];
  const per = 12, lobeTip = 8 * per, ph = [R.range(0, 20), R.range(0, 20), R.range(0, 20)];
  const half = (k) => smoothPts([
    [Lt, 0], [Lt * 0.9, k * 0.05], [Lt * 0.74, k * 0.22], [Lt * 0.46, k * 0.63], [Lt * 0.16, k * 0.93],          // drip tip, shoulder
    [-Lb * 0.12, k], [-Lb * 0.52, k * 0.95], [-Lb * 0.84, k * lerp(0.7, 0.86, v.lobe)],                          // widest, down the outside of the back lobe
    [-Lb, k * lerp(0.44, 0.66, v.lobe)],                                                                         // the back lobe's tip
    [-Lb * 0.9, k * lerp(0.3, 0.46, v.lobe)], [-Lb * 0.56, k * 0.17], [-Lb * 0.24, k * 0.05], [-Lb * 0.1, 0],    // and back up into the notch
  ], per);

  // veins: where each one starts (leaf coordinates) and which point of the outline it runs to
  const base = half(W);
  const endAt = (y0, deg) => { let i = 1; while (i < lobeTip && Math.atan2(base[i][1], base[i][0] - y0) < deg * DEG) i++; return i; };
  const LAT = [[0.66, 36], [0.52, 41], [0.37, 47], [0.21, 53], [0.05, 60]];
  const laterals = LAT.map(([y, deg]) => ({ from: [Lt * y, 0], end: endAt(Lt * y, deg), w: 1 - y * 0.5 }));
  const backRib = { from: [0, 0], end: lobeTip, w: 0.95 };
  const branches = [[0.36, 5.75], [0.68, 6.95]].map(([k, at2]) => ({ along: k, end: Math.round(at2 * per), w: 0.6 }));      // these two leave the back rib part-way along it
  const veins = [...laterals, ...branches, backRib];
  // scallops: the margin dips between one vein end and the next
  const ends = veins.map((q) => q.end).sort((a, b) => a - b);
  const outline = (sg) => {
    const pts = half(W * (sg < 0 ? v.sideW[0] : v.sideW[1]));
    const out = pts.map((p) => p.slice());
    for (let j = 0; j < ends.length - 1; j++) for (let i = ends[j] + 1; i < ends[j + 1]; i++) {
      const a = pts[i - 1], b = pts[i + 1], m = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const dip = W * v.scallop * 0.5 * (1 - Math.cos(2 * PI * (i - ends[j]) / (ends[j + 1] - ends[j])));
      out[i][0] += (b[1] - a[1]) / m * dip; out[i][1] -= (b[0] - a[0]) / m * dip;      // straight in, whichever way the margin runs
    }
    for (let i = 2; i < out.length - 2; i++) {                                         // the hand that cut it out was not a machine
      const a = pts[i - 1], b = pts[i + 1], m = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, d = W * 0.008 * wob(i * 0.5, ph[sg < 0 ? 0 : 1], ph[2]);
      out[i][0] += (b[1] - a[1]) / m * d; out[i][1] -= (b[0] - a[0]) / m * d;
    }
    return out.map(([y, x]) => [y, x * sg]);
  };
  const oR = outline(1), oL = outline(-1), ring = [...oR, ...oL.slice().reverse()].map(P);
  const veinPts = (q, o, sg) => {
    const b = o[q.end], a = q.along ? [o[lobeTip][0] * q.along, o[lobeTip][1] * q.along] : q.from;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), bend = len * 0.1, inset = q.along ? (S * v.veinW * 0.9) / len : 0;   // (a branch starts just clear of the rib it leaves, so its blunt end does not poke out the far side)
    const a2 = [lerp(a[0], b[0], inset), lerp(a[1], b[1], inset)];
    return quadPts(a2, [(a[0] + b[0]) / 2 + bend, (a[1] + b[1]) / 2], b, 12).map(P);                 // bowed toward the tip
  };

  // stalk
  const w0 = L * 0.013, w1 = L * 0.008;
  stem(ctx, R, at, 0, 1, w0, w1, stalkOf(t), ph[0]);

  // blade: base coat, the half in shade a step darker
  const dk = (v.fold ?? -0.5) < 0 ? -1 : 1, tS = dim(t, Math.abs(v.fold ?? -0.5));
  poly(ctx, ring); ctx.fillStyle = t[1]; ctx.fill();
  ctx.save(); poly(ctx, ring); ctx.clip();
  poly(ctx, [P([Lt, 0]), ...(dk < 0 ? oL : oR).map(P), P([-Lb * 0.1, 0])]); ctx.fillStyle = tS[1]; ctx.fill();

  // strokes: every one starts on the midrib (or on the back rib) and runs out to a point of the margin
  const E0 = laterals[0].end, E4 = laterals[4].end, nO = base.length - 1, kLight = v.light ?? 1;
  for (const [sg, o] of [[1, oR], [-1, oL]]) {
    const c = sg === dk ? tS : t, rib = o[lobeTip];
    const start = (i) => {
      if (i <= E0) return [Lt * lerp(0.97, LAT[0][0], i / E0), 0];
      if (i <= E4) { let j = 0; while (j < 3 && i > laterals[j + 1].end) j++; return [Lt * lerp(LAT[j][0], LAT[j + 1][0], (i - laterals[j].end) / Math.max(1, laterals[j + 1].end - laterals[j].end)), 0]; }
      const q = i <= lobeTip ? 0.6 * (i - E4) / (lobeTip - E4) : 0.6 * (1 - (i - lobeTip) / (nO - lobeTip)) + 0.05;
      return [rib[0] * q, rib[1] * q];
    };
    const run = (i, f0, f1) => {
      const a = start(i), b = o[Math.round(clamp(i, 1, nO - 1))], len = Math.hypot(b[0] - a[0], b[1] - a[1]), cx = (a[0] + b[0]) / 2 + len * 0.1, cy = (a[1] + b[1]) / 2, p = [];
      for (let k = 0; k <= 10; k++) { const g = lerp(f0, f1, k / 10), m = 1 - g; p.push(P([m * m * a[0] + 2 * m * g * cx + g * g * b[0], m * m * a[1] + 2 * m * g * cy + g * g * b[1]])); }
      return p;
    };
    const shadow = [], body = [], light = [], high = [], fine = [], step = 2, sw = S * 0.02;
    for (let i = 2; i < nO - 2; i += step) {
      const ii = i + R.range(-0.8, 0.8), L2 = 0.5 + 0.45 * wob(i * 0.13, ph[sg < 0 ? 1 : 2], ph[0]) + (sg === dk ? -0.12 : 0.12);
      if (R.chance(0.6)) shadow.push({ p: run(ii, -0.02, R.range(0.18, 0.5)), w: sw * R.range(0.4, 0.65), d: 0.15, l: 0.85, g: 0.25 });
      if (R.chance(0.3)) shadow.push({ p: run(ii, 1.06, R.range(0.6, 0.86)), w: sw * R.range(0.3, 0.5), d: 0.2, l: 0.85, g: 0.25 });
      if (R.chance(0.8)) body.push({ p: run(ii, R.range(0.03, 0.2), R.range(0.8, 1.08)), w: sw * R.range(0.45, 0.7), c: clamp(Math.floor(L2 * 3 + R.range(-0.3, 0.3)), 0, 2), d: 0.1, l: 0.4, g: 0.2 });
      if (R.f() < smoothstep(0.3, 0.72, L2) * 0.75 * kLight) {
        const a = R.range(0.08, 0.26), b = R.range(0.78, 1.02), w = sw * R.range(0.36, 0.6);
        light.push({ p: run(ii, a, b), w, c: R.int(0, 1), d: 0.35, l: 0.5, g: 0.3 });
        if (R.f() < smoothstep(0.5, 0.9, L2) * 0.55) { const a2 = a + R.range(0.08, 0.25); high.push({ p: run(ii + R.range(-0.3, 0.3), a2, Math.min(b - 0.05, a2 + R.range(0.25, 0.45))), w: w * R.range(0.4, 0.65), d: 0.6, l: 0.7, g: 0.4 }); }
      }
      if (R.chance(0.3)) fine.push({ p: run(ii, R.range(0, 0.3), R.range(0.5, 1.02)), w: R.range(0.8, 1.8), d: 0, l: 0.75, g: 0 });
    }
    lay(ctx, R, [c[0]], shadow, 1, 0.4);
    lay(ctx, R, [mix(c[2], c[1], 0.45), c[2], mix(c[2], c[3], 0.3)], body, 1, 0.5);
    lay(ctx, R, [c[3], mix(c[3], c[2], 0.4)], light, 1, 0.45);
    lay(ctx, R, [c[4]], high, 1, 0.3);
    lay(ctx, R, [c[0]], fine, 0.85);
  }
  // the veins: a dark touch along the shaded flank of each, then the vein itself, one loose pale stroke
  const vw = S * v.veinW, pale = [];
  for (const [sg, o] of [[1, oR], [-1, oL]]) for (const q of veins) {
    const pts = veinPts(q, o, sg);
    ctx.beginPath(); taper(ctx, pts, vw * 2.2 * q.w, vw * 0.5, sg * 0.75); ctx.fillStyle = rgba(mix(tS[0], NIGHT, 0.3), 0.8); ctx.fill();
    pale.push({ p: pts, w: vw * q.w * 0.62, d: 0.12, l: 0.72, g: 0.12 });
  }
  lay(ctx, R, [v.vein], pale);
  ctx.lineJoin = 'round';
  const edge = mix(tS[0], NIGHT, 0.25);
  poly(ctx, ring); ctx.setLineDash([R.range(40, 90), R.range(14, 30), R.range(90, 170), R.range(20, 44)]); ctx.strokeStyle = rgba(edge, 0.75); ctx.lineWidth = 3.4; ctx.stroke();
  poly(ctx, ring); ctx.setLineDash([R.range(40, 100), R.range(60, 150)]); ctx.lineDashOffset = R.range(0, 200); ctx.strokeStyle = rgba(edge, 0.55); ctx.lineWidth = 6.4; ctx.stroke();
  ctx.setLineDash([]); ctx.lineDashOffset = 0;
  ctx.restore();
  const ribPts = smoothPts([P([-Lb * 0.1, 0]), P([Lt * 0.3, 0]), P([Lt * 0.7, 0]), P([Lt * 0.985, 0])], 8);
  ctx.beginPath(); dab(ctx, R, ribPts, vw * 0.95, 0.1, 0.8, 0.1); ctx.fillStyle = v.vein; ctx.fill();

  const hull = [[...P([Lt * 0.3, 0]), W * 0.88], [...P([-Lb * 0.45, 0]), W * 0.95], [...P([Lt * 0.74, 0]), W * 0.38]].map(([x, y, rr]) => [x, -y, rr]);
  for (const s of [0.3, 0.7]) { const p = sp.at(s); hull.push([p.x, -p.y, w0 * 1.5]); }
  return { len: L, hull };
}

/* ============================================================================================
 * PINNATE FROND (coconut palm; with other numbers, a cycad) — a curved rachis with two combed
 * rows of leaflets. Each leaflet is one flat cut shape in a single green, folded along its length
 * (one half a step darker), some with a dry lighter stroke down the lit half. The greens step up
 * and down from leaflet to leaflet, as they do when each one is a separate stroke of the brush.
 *   v.n       leaflets per side;  v.maxLeaf = longest leaflet (px);  v.leafW = half-width ÷ length
 *   v.splay   [at the base, at the tip] angle of the leaflets off the rachis, degrees
 *   v.droop   0 = stiff … 1 = leaflets hang straight along gravity
 *   v.grav    which way gravity pulls inside the sprite, so one drawing can be used pointing up,
 *             sideways or hanging and its leaflets still droop the right way
 *   v.arc / v.arcPow  how far the rachis bends over, and how late in its length
 *   v.ramp    its greens;  v.back = how much darker the far row of leaflets is (0..1 of a step)
 *   (x0, y0)  where it grows from: palm trees draw their crown with this
 * ========================================================================================== */
function frond(ctx, R, v, x0 = 0, y0 = 0) {
  const sp = makeSpine(v.len, 110, (s) => v.lean0 + v.arc * Math.pow(s, v.arcPow), x0, y0), at = (s) => sp.at(s);
  const from = v.from ?? 0.1, t = v.ramp, tB = dim(t, v.back ?? 0.75);
  const steps = (c) => [c[0], mix(c[0], c[1], 0.55), c[1], mix(c[1], c[2], 0.5), c[2], mix(c[2], c[3], 0.5), c[3]];
  const sF = steps(t), sB = steps(tB);
  const env = v.env || ((s) => lerp(0.45, 1, smoothstep(0, 0.3, s)) * lerp(1, 0.2, Math.pow(smoothstep(0.3, 1, s), 1.25)));
  const leaflets = [];
  for (let i = 0; i < v.n; i++) for (const sg of [-1, 1]) {
    const s = from + (0.985 - from) * (i + (sg > 0 ? 0.5 : 0)) / v.n;            // left and right alternate up the rachis
    const p = sp.at(s);
    const ell = v.maxLeaf * env(s) * (1 + 0.04 * Math.sin(i * 1.7 + sg)) * (sg < 0 ? v.backScale : 1);
    const off = lerp(v.splay[0], v.splay[1], Math.pow((s - from) / (1 - from), 0.8)) * DEG * R.range(0.96, 1.04);
    const [dx, dy] = dir(p.ang + sg * off);
    const k = clamp(v.droop * (0.85 + 0.3 * s) * R.range(0.9, 1.1));
    let ex = dx * (1 - k) + v.grav[0] * k, ey = dy * (1 - k) + v.grav[1] * k;
    const m = Math.hypot(ex, ey) || 1; ex /= m; ey /= m;
    const c = [p.x + dx * ell * 0.46, p.y + dy * ell * 0.46];
    leaflets.push({ sg, s, a: [p.x, p.y], c, e: [c[0] + ex * ell * 0.58, c[1] + ey * ell * 0.58], w: Math.max(v.minW ?? 2.6, ell * v.leafW) * R.range(0.88, 1.12), tx: p.tx, ty: p.ty, tone: R.range(-1, 1), touch: R.f() });
  }
  const leaflet = (lf) => {
    const mid = quadPts(lf.a, lf.c, lf.e, 10), up = [], dn = [];
    let lit = 1;
    mid.forEach((c, i) => {
      const f = i / 10, a = mid[Math.max(0, i - 1)], b = mid[Math.min(10, i + 1)];
      let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
      if (i === 3) lit = nx * lf.tx + ny * lf.ty > 0 ? 1 : -1;                    // which edge faces the tip of the frond
      const w = lf.w * (2.6 * Math.pow(f, 0.45) * Math.pow(1 - f, 1.15) + 0.4 * Math.pow(1 - f, 4));   // widest a quarter of the way out, long clean point
      up.push([c[0] + nx * w, c[1] + ny * w]); dn.push([c[0] - nx * w, c[1] - ny * w]);
    });
    const back = lf.sg < 0, st = back ? sB : sF;
    const idx = clamp(Math.round(3 + 1.3 * lf.s + lf.tone * 1.7 + (v.lift ?? 0)), 1, 6);     // a little lighter toward the tip of the frond, and never the same twice running
    poly(ctx, [...up, ...dn.slice().reverse()]); ctx.fillStyle = st[idx]; ctx.fill();
    const far = lit > 0 ? dn : up, near = lit > 0 ? up : dn;
    poly(ctx, [...mid, ...far.slice().reverse()]); ctx.fillStyle = st[idx - 1]; ctx.fill();                // the half folded away from the light
    if (lf.w > 3 && lf.touch < (v.touch ?? 0.5)) {                                                           // a dry lighter stroke down the lit half
      const a = 1 + Math.floor(lf.touch * 4), pts = [];
      for (let i = a; i <= 9; i++) pts.push([lerp(mid[i][0], near[i][0], 0.5), lerp(mid[i][1], near[i][1], 0.5)]);
      ctx.beginPath(); dab(ctx, R, pts, lf.w * 0.34, 0.5, 0.7, 0.3);
      ctx.fillStyle = idx >= 5 ? (back ? tB : t)[4] : st[idx + 2]; ctx.fill();
    }
  };
  const w0 = v.len * (v.rachisW ?? 0.0105), w1 = v.len * 0.0016, rc = v.rachis || [mix(t[1], UMBER, 0.2), mix(t[3], BONE, 0.55), mix(CREAM, t[4], 0.3)];
  for (const lf of leaflets) if (lf.sg < 0) leaflet(lf);
  rope(ctx, at, 0, 1, w0, w1, v.len * 0.01, 60, 0.9, 0.1, 0.1); ctx.fillStyle = rc[1]; ctx.fill();
  ctx.beginPath();
  for (let i = 0; i < 4; i++) { const a = (i + R.range(0, 0.3)) / 4, b = Math.min(0.98, a + R.range(0.18, 0.3)); dab(ctx, R, trail(at, a, b, 8, (k) => lerp(w0, w1, Math.pow(lerp(a, b, k), 0.9)) * 0.6), Math.max(0.6, lerp(w0, w1, a) * 0.42), 0.15, 0.6, 0.2); }
  ctx.fillStyle = rc[0]; ctx.fill();
  for (const lf of leaflets) if (lf.sg > 0) leaflet(lf);
  ctx.beginPath();
  for (let i = 0; i < 3; i++) { const a = (i + R.range(0, 0.4)) / 3.4, b = Math.min(0.9, a + R.range(0.12, 0.24)); dab(ctx, R, trail(at, a, b, 8, (k) => -lerp(w0, w1, Math.pow(lerp(a, b, k), 0.9)) * 0.35), Math.max(0.6, lerp(w0, w1, a) * 0.36), 0.5, 0.7, 0.4); }
  ctx.fillStyle = rc[2]; ctx.fill();

  const hull = [];
  for (const s of [0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 0.97]) {
    const p = sp.at(s), e = env(s);
    hull.push([p.x + v.grav[0] * v.maxLeaf * e * 0.25 * v.droop * 2, -(p.y + v.grav[1] * v.maxLeaf * e * 0.25 * v.droop * 2), v.maxLeaf * e * 0.7]);
  }
  return { len: v.len, hull };
}

/* ============================================================================================
 * FAN PALM (chit / sabal) — pleated blades radiating from the top of a stalk: fused into one
 * disc near the hub, then separating into points. Every blade is two flat faces of a pleat, one
 * lit and one a step darker; over them, fine strokes fan out from the hub - dark where the pleats
 * close up toward the centre, dry and pale out along the blades. That is the fan palm of the
 * wallpaper reference.
 *   v.n      number of blades;  v.span = angle the fan opens to;  v.fused = share of the radius that is one piece
 *   v.round  1 = a perfect disc, lower = side blades shorter;  v.sag = how far the outer blades hang
 *   v.ramp   its greens
 * ========================================================================================== */
function fanPalm(ctx, R, v) {
  const sp = makeSpine(v.stalk, 30, (s) => v.lean * s), at = (s) => sp.at(s);
  const hub = sp.at(1), H = [hub.x, hub.y], N = v.n, base = hub.ang, t = v.ramp, Rad = v.radius;
  const reach = (rel) => Rad * (v.round + (1 - v.round) * Math.cos(rel * PI * 0.5));
  const pt = (a, rr, sag = 0) => { const d = dir(a); return [H[0] + d[0] * rr, H[1] + d[1] * rr + sag]; };
  const da = v.span / N / 2;
  const notch = Array.from({ length: N + 1 }, (_, k) => { const rel = (k / N) * 2 - 1; return pt(base + rel * v.span * 0.5, reach(rel) * v.fused * R.range(0.92, 1.08), reach(rel) * v.sag * rel * rel * 0.3); });
  const blades = Array.from({ length: N }, (_, k) => {
    const rel = ((k + 0.5) / N) * 2 - 1, a = base + rel * v.span * 0.5, rr = reach(rel) * R.range(0.93, 1.03), sag = rr * v.sag * rel * rel;
    const out = lerp(reach(rel) * v.fused, rr, 0.5);
    return { rel, k, a, rr, sag, tip: pt(a, rr, sag), mid: pt(a, rr * 0.62, sag * 0.2), cl: pt(a - da * 0.86, out, sag * 0.45), cr: pt(a + da * 0.86, out, sag * 0.45), tone: R.range(-1, 1) };
  });
  stem(ctx, R, at, 0, 1, v.stalk * 0.017, v.stalk * 0.0115, stalkOf(t), 2);
  // blades, outermost first so the upright ones lie on top
  const steps = [t[0], mix(t[0], t[1], 0.5), t[1], mix(t[1], t[2], 0.5), t[2], mix(t[2], t[3], 0.5), t[3]];
  const face = (b, n, c) => { ctx.moveTo(H[0], H[1]); ctx.lineTo(n[0], n[1]); ctx.quadraticCurveTo(c[0], c[1], b.tip[0], b.tip[1]); ctx.quadraticCurveTo(b.mid[0], b.mid[1], H[0], H[1]); ctx.closePath(); };
  const order = [...blades].sort((a, b) => Math.abs(b.rel) - Math.abs(a.rel));
  ctx.lineJoin = 'round';
  for (const b of order) {
    const idx = clamp(Math.round(4.3 - 1.5 * b.rel * b.rel + b.tone * 1.1), 2, 6);        // the side blades hang in a little more shade
    ctx.beginPath(); face(b, notch[b.k], b.cl); ctx.fillStyle = ctx.strokeStyle = steps[idx]; ctx.fill(); ctx.lineWidth = 0.7; ctx.stroke();        // (the hairline stroke hides the seams)
    ctx.beginPath(); face(b, notch[b.k + 1], b.cr); ctx.fillStyle = ctx.strokeStyle = steps[idx - 2]; ctx.fill(); ctx.stroke();
  }
  ctx.save();
  ctx.beginPath(); for (const b of blades) { face(b, notch[b.k], b.cl); face(b, notch[b.k + 1], b.cr); }
  ctx.clip();
  // a stroke that runs out from the hub along a blade: f0 → f1 of its length, `off` of a half-blade to one side
  const ray = (b, f0, f1, off) => Array.from({ length: 9 }, (_, i) => { const f = lerp(f0, f1, i / 8); return pt(b.a + da * off * (1 - 0.6 * smoothstep(0.5, 1, f)), b.rr * f, b.sag * f * f); });
  const dark = [], deep = [], light = [], high = [], rib = [], hair = [];
  for (const b of blades) {
    const w = Rad * da * 0.5;                                              // about a quarter of a blade's width, half-way out
    dark.push({ p: ray(b, 0.03, R.range(0.42, 0.7), R.range(0.3, 0.8)), w: w * R.range(0.5, 0.8), d: 0.3, l: 0.9, g: 0.4 });
    if (R.chance(0.7)) dark.push({ p: ray(b, 0.03, R.range(0.3, 0.55), R.range(-0.7, -0.1)), w: w * R.range(0.35, 0.6), d: 0.35, l: 0.9, g: 0.4 });
    deep.push({ p: ray(b, 0.02, R.range(0.2, 0.4), R.range(-0.5, 0.5)), w: w * R.range(0.4, 0.7), d: 0.2, l: 0.9, g: 0.3 });
    if (R.chance(0.8)) light.push({ p: ray(b, R.range(0.38, 0.55), R.range(0.82, 0.97), R.range(-0.6, -0.25)), w: w * R.range(0.4, 0.62), c: R.int(0, 1), d: 0.5, l: 0.75, g: 0.4 });
    if (R.chance(0.35)) high.push({ p: ray(b, R.range(0.5, 0.62), R.range(0.75, 0.9), R.range(-0.5, -0.3)), w: w * R.range(0.22, 0.34), d: 0.65, l: 0.8, g: 0.4 });
    if (R.chance(0.6)) dark.push({ p: ray(b, R.range(0.55, 0.7), R.range(0.85, 1), R.range(0.35, 0.6)), w: w * R.range(0.2, 0.4), d: 0.4, l: 0.85, g: 0.4 });
    rib.push({ p: ray(b, 0.06, R.range(0.8, 0.94), 0), w: Math.max(0.9, Rad * 0.0036), d: 0.2, l: 0.8, g: 0.2 });
    // the pleats themselves: fine lines, some dark, some pale, that never quite reach the tip
    for (let i = 0; i < 3; i++) hair.push({ p: ray(b, R.range(0.04, 0.2), R.range(0.6, 0.93), R.range(-0.85, 0.85)), w: R.range(0.7, 1.4), c: R.int(0, 2), d: 0, l: 0.7, g: 0 });
  }
  lay(ctx, R, [t[1]], dark, 1, 0.4);
  lay(ctx, R, [t[0]], deep, 1, 0.4);
  lay(ctx, R, [t[3], mix(t[3], t[4], 0.5)], light, 1, 0.4);
  lay(ctx, R, [t[4]], high);
  lay(ctx, R, [t[0], t[1], t[4]], hair, 0.9);
  // the crease where two blades join: one thin dark stroke each, not a ruled line
  const crease = [];
  for (let k = 1; k < N; k++) crease.push({ p: Array.from({ length: 7 }, (_, i) => [lerp(H[0], notch[k][0], i / 6), lerp(H[1], notch[k][1], i / 6)]), w: Math.max(0.9, Rad * 0.0034) * R.range(0.7, 1.3), d: 0, l: 0.3, g: 0.25 });
  lay(ctx, R, [mix(t[0], NIGHT, 0.4)], crease);
  lay(ctx, R, [mix(t[4], CREAM, 0.45)], rib);                                        // pale rib up the fold of each blade
  ctx.restore();
  ctx.fillStyle = mix(CREAM, t[4], 0.25);
  ctx.beginPath(); ctx.ellipse(H[0], H[1] - Rad * 0.016, Rad * 0.026, Rad * 0.046, base, 0, PI * 2); ctx.fill();

  const hull = [[hub.x + hub.tx * Rad * 0.3, -(hub.y + hub.ty * Rad * 0.3), Rad * 0.74]];
  for (const s of [0.25, 0.6]) { const p = sp.at(s); hull.push([p.x, -p.y, v.stalk * 0.03]); }
  return { len: v.stalk + Rad, hull };
}

/* ============================================================================================
 * PALM TREE — a slender ringed trunk with a slight curve and a flared foot, a full crown of
 * fronds (the same frond as above, small) and a few coconuts. `trunk` alone is the same trunk
 * with no crown, for when a palm runs up the side of the frame with its head out of shot (its cut
 * top must leave the frame or sit behind foliage - nothing floats).
 * The trunk is khaki bark laid in long strokes, darker down the right, dry and pale down the
 * left, with the leaf scars as short curved strokes across it.
 *   v.height  trunk length (px);  v.lean / v.curve = lean of the whole trunk, and the bow in it
 *   v.fronds  how many in the crown;  v.frond = their length (px);  v.nuts = coconuts
 *   trunk thickness: the two numbers passed to drawTrunk (half-width at the foot and at the top)
 * ========================================================================================== */
const BARK = ['#3B3524', '#5F5739', '#7C7450', '#A39A6E', '#C6BE94'];
function drawTrunk(ctx, R, sp, H, w0, w1) {
  const N = 80, W = (s) => lerp(w0, w1, Math.pow(s, 0.7)) + w0 * 0.8 * Math.pow(Math.max(0, 1 - s / 0.075), 2);   // (the last term is the flared foot)
  const edge = (f) => Array.from({ length: N + 1 }, (_, i) => { const p = sp.at(i / N), w = W(i / N) * f * (1 + 0.03 * Math.sin(i * 1.9 + f * 3)); return [p.x + p.nx * w, p.y + p.ny * w]; });
  const at = (s) => sp.at(s);
  poly(ctx, [...edge(-1), ...edge(1).reverse()]); ctx.fillStyle = BARK[2]; ctx.fill();
  ctx.save(); poly(ctx, [...edge(-1), ...edge(1).reverse()]); ctx.clip();
  const long = (f0, f1, n, wK, dry) => Array.from({ length: n }, (_, i) => {
    const a = (i + R.range(0, 0.5)) / n, b = Math.min(1, a + R.range(0.1, 0.22)), f = R.range(f0, f1);
    return { p: trail(at, a, b, 8, (k) => W(lerp(a, b, k)) * f), w: W(a) * wK * R.range(0.7, 1.2), c: R.int(0, 1), d: dry, l: 0.6, g: 0.4 };
  });
  lay(ctx, R, [BARK[1], mix(BARK[1], BARK[2], 0.5)], long(0.25, 0.95, 16, 0.26, 0.3), 1, 0.4);          // round: shade to the right …
  lay(ctx, R, [BARK[0], mix(BARK[0], BARK[1], 0.5)], long(0.68, 1, 9, 0.2, 0.25));
  lay(ctx, R, [BARK[3], mix(BARK[3], BARK[2], 0.5)], long(-0.9, -0.2, 14, 0.22, 0.5), 1, 0.35);             // … light to the left
  lay(ctx, R, [BARK[4]], long(-0.85, -0.5, 7, 0.12, 0.7));
  const rings = Math.round(H / 21), scars = [];                                 // leaf scars: evenly spaced, arching up as the trunk rises overhead
  for (let i = 2; i < rings; i++) {
    const s = (i + R.range(-0.15, 0.15)) / rings, p = sp.at(s), w = W(s) * 1.08, bend = lerp(-0.1, 0.5, s) * w;
    const a = [p.x - p.nx * w, p.y - p.ny * w], b = [p.x + p.nx * w, p.y + p.ny * w], c = [p.x + p.tx * bend * 2, p.y + p.ty * bend * 2];
    if (R.chance(0.88)) scars.push({ p: quadPts(a, c, b, 8), w: Math.max(1, w0 * 0.045) * R.range(0.6, 1.3), d: 0.3, l: 0.5, g: 0.5 });
  }
  lay(ctx, R, [BARK[0]], scars, 0.7);
  ctx.restore();
  return W;
}

function trunk(ctx, R, v) {
  const H = v.height, sp = makeSpine(H, 80, (s) => v.lean * s + v.curve * Math.sin(s * PI * 0.9));
  drawTrunk(ctx, R, sp, H, H * 0.03, H * 0.019);
  return { len: H, hull: [0.1, 0.3, 0.5, 0.7, 0.9].map((s) => { const p = sp.at(s); return [p.x, -p.y, H * 0.05]; }) };
}

function palmTree(ctx, R, v) {
  const H = v.height, sp = makeSpine(H, 80, (s) => v.lean * s + v.curve * Math.sin(s * PI * 0.9));
  const top = sp.at(1), n = v.fronds;
  const crown = Array.from({ length: n }, (_, i) => {
    const rel = (i / (n - 1)) * 2 - 1, out = Math.abs(rel);                 // -1 … 1 round the crown; 0 = the upright ones
    return { i, out, lean0: top.ang * 0.5 + rel * 152 * DEG + R.range(-0.09, 0.09), arc: Math.sign(rel || 1) * lerp(1.3, 0.3, Math.pow(out, 1.4)) * R.range(0.88, 1.12),
             len: v.frond * R.range(0.9, 1.04) * (0.9 + 0.1 * out), back: i % 2 === 1 };
  });
  const drawFrond = (f) => frond(ctx, R, {
    len: f.len, lean0: f.lean0, arc: f.arc, arcPow: 1.5, n: 15, from: 0.14, maxLeaf: f.len * 0.3, leafW: 0.085, minW: 2.2, splay: [58, 24], droop: 0.42, grav: [0, 1],
    backScale: 0.9, rachisW: 0.015, touch: 0.3, ramp: f.back ? v.ramps[1] : v.ramps[0], lift: f.back ? -1 : 0,
  }, top.x, top.y);
  crown.filter((f) => f.back).forEach(drawFrond);                              // the far side of the crown, darker
  drawTrunk(ctx, R, sp, H, H * 0.026, H * 0.0165);
  for (let i = 0; i < v.nuts; i++) {                                           // coconuts, tucked under the crown
    const a = lerp(-1, 1, (i + 0.5) / v.nuts) * 1.1, rr = H * 0.021, x = top.x + Math.sin(a) * rr * 1.5, y = top.y + rr * (1.1 + 0.5 * Math.cos(a * 1.4));
    ctx.fillStyle = i % 2 ? OCHRE[0] : mix(OCHRE[0], BARK[1], 0.5); ctx.beginPath(); ctx.ellipse(x, y, rr * 0.82, rr, a * 0.3, 0, PI * 2); ctx.fill();
    ctx.fillStyle = mix(OCHRE[0], UMBER, 0.6); ctx.beginPath(); ctx.ellipse(x + rr * 0.24, y + rr * 0.2, rr * 0.5, rr * 0.72, a * 0.3 - 0.4, -0.6, 1.9); ctx.fill();
    ctx.fillStyle = OCHRE[2]; ctx.beginPath(); ctx.ellipse(x - rr * 0.3, y - rr * 0.32, rr * 0.2, rr * 0.36, -0.5, 0, PI * 2); ctx.fill();
  }
  crown.filter((f) => !f.back).sort((a, b) => b.out - a.out).forEach(drawFrond);   // near side: hanging ones first, upright ones on top
  return { len: H + v.frond * 0.9, hull: [[top.x, -top.y, v.frond * 0.8]], crown: [top.x, -top.y], crownR: v.frond };
}

/* ============================================================================================
 * LIANA — a vine with small heart-shaped leaves, a thinner strand winding round the main stem.
 * Drawn growing up like everything else; the scene hangs it upside down from the canopy, so the
 * leaves point toward the vine's own tip (they will hang the right way once it is flipped).
 * Each leaf is three or four touches of the brush: a flat heart, its right half a step darker, a
 * dry light stroke on the left, a thin cream rib.
 *   v.leaves  how many;  v.leaf = size of the largest (px);  v.sway / v.waves = how the stem snakes
 * ========================================================================================== */
function heartLeaf(ctx, R, x, y, a, len, t, tone) {
  const w = len * 0.56, st = [t[1], mix(t[1], t[2], 0.5), t[2], mix(t[2], t[3], 0.5)], idx = clamp(Math.round(1.5 + tone * 1.4), 1, 3);
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);                    // now the leaf grows to (0, -len)
  ctx.beginPath(); ctx.moveTo(0, len * 0.06);
  ctx.bezierCurveTo(-w * 0.95, len * 0.34, -w * 1.2, -len * 0.5, 0, -len); ctx.bezierCurveTo(w * 1.2, -len * 0.5, w * 0.95, len * 0.34, 0, len * 0.06); ctx.closePath();
  ctx.fillStyle = st[idx]; ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, len * 0.06); ctx.bezierCurveTo(w * 0.95, len * 0.34, w * 1.2, -len * 0.5, 0, -len); ctx.closePath();       // right half in shade
  ctx.fillStyle = st[idx - 1]; ctx.fill();
  ctx.beginPath();
  dab(ctx, R, quadPts([-w * 0.3, len * 0.02], [-w * 0.62, -len * 0.42], [-w * 0.1, -len * 0.84], 8), len * 0.09, 0.5, 0.7, 0.35);
  if (tone > 0) dab(ctx, R, quadPts([-w * 0.5, -len * 0.05], [-w * 0.8, -len * 0.36], [-w * 0.34, -len * 0.66], 8), len * 0.05, 0.55, 0.7, 0.35);
  ctx.fillStyle = t[Math.min(4, idx + 1)]; ctx.fill();
  ctx.beginPath(); dab(ctx, R, quadPts([w * 0.28, len * 0.0], [w * 0.6, -len * 0.4], [w * 0.14, -len * 0.8], 8), len * 0.06, 0.4, 0.7, 0.35); ctx.fillStyle = t[0]; ctx.fill();
  ctx.beginPath(); dab(ctx, R, [[0, len * 0.04], [len * 0.012, -len * 0.3], [-len * 0.008, -len * 0.62], [0, -len * 0.93]], Math.max(0.8, len * 0.017), 0, 0.7, 0); ctx.fillStyle = BONE; ctx.fill();
  ctx.restore();
}

function liana(ctx, R, v) {
  const L = v.len, t = v.ramp, tB = dim(t, 0.8);
  // how thick it is: by default a share of its length (thick where it is rooted, thin at its tip); v.wpx = [root, tip] gives the two half-widths in px instead
  const U = v.wpx ? v.wpx[0] / 0.0085 : L, tipW = v.wpx ? v.wpx[1] : L * 0.0028;
  const sp = makeSpine(L, 150, (s) => v.sway * Math.sin(s * PI * 2 * v.waves + 0.5) * (0.55 + 0.45 * s)), at = (s) => sp.at(s);
  const WOOD = [mix(BARK[0], t[0], 0.4), mix(BARK[2], t[2], 0.5), mix(BARK[3], t[3], 0.5)];
  const leaves = Array.from({ length: v.leaves }, (_, i) => {
    const s = 0.06 + 0.9 * (i + 0.5) / v.leaves, p = sp.at(s), sg = i % 2 ? 1 : -1;
    const size = v.leaf * lerp(1, 0.52, Math.pow(s, 1.5)) * R.range(0.9, 1.08);
    const [dx, dy] = dir(p.ang + sg * R.range(52, 68) * DEG), st = size * 0.4;      // a short stalk sets off sideways …
    return { p, sg, size, root: [p.x + dx * st, p.y + dy * st], head: sg * R.range(16, 40) * DEG, tone: R.range(-1, 1), back: i % 3 === 1 };   // … and the leaf points on up the vine
  });
  const drawLeaf = (lf) => {
    taper(ctx, quadPts([lf.p.x, lf.p.y], [lerp(lf.p.x, lf.root[0], 0.6), lf.p.y], lf.root, 6), U * 0.0045, U * 0.003); ctx.fillStyle = WOOD[1]; ctx.fill();
    heartLeaf(ctx, R, lf.root[0], lf.root[1], lf.head, lf.size, lf.back ? tB : t, lf.tone);
  };
  leaves.filter((l) => l.back).forEach(drawLeaf);
  // the thin strand that winds round the stem
  const twine = Array.from({ length: 121 }, (_, i) => { const s = 0.02 + 0.9 * i / 120, p = sp.at(s), o = Math.sin(s * PI * 2 * (v.twists ?? v.waves * 2.6)) * U * 0.014; return [p.x + p.nx * o, p.y + p.ny * o]; });
  taper(ctx, twine, U * 0.004, U * 0.0022); ctx.fillStyle = WOOD[2]; ctx.fill();
  stem(ctx, R, at, 0, 1, U * 0.0085, tipW, WOOD, 4);
  leaves.filter((l) => !l.back).forEach(drawLeaf);
  return { len: L, hull: [0.12, 0.3, 0.5, 0.7, 0.9].map((s) => { const p = sp.at(s); return [p.x, -p.y, v.leaf * 1.15 * lerp(1, 0.6, s)]; }) };
}

/* ============================================================================================
 * HELICONIA ("lobster claw") — fat boat-shaped bracts stacked zig-zag up the top of a stem, each
 * one cupped upward. In the wallpaper it is one of the terracotta accents: barro and maroon
 * bracts with an ochre lip, each a flat shape with a darker belly and a dry lighter stroke.
 *   v.bracts  how many claws;  v.lean = lean of the stem
 * ========================================================================================== */
function heliconia(ctx, R, v) {
  const L = v.len;
  const sp = makeSpine(L, 60, (s) => v.lean * s + 0.07 * Math.sin(s * 11) * smoothstep(0.35, 0.55, s)), at = (s) => sp.at(s);
  stem(ctx, R, at, 0, 1, L * 0.012, L * 0.002, stalkOf(RAMP.olive), 6);
  const n = v.bracts;
  for (let i = 0; i < n; i++) {                                                         // bottom bract first; each tucks behind the one above
    const k = i / (n - 1), s = lerp(0.44, 0.965, Math.pow(k, 0.92)), p = sp.at(s), sg = i % 2 ? 1 : -1;
    const len = L * lerp(0.135, 0.062, Math.pow(k, 0.85)) * R.range(0.94, 1.06);
    const a = p.ang + sg * lerp(58, 30, k) * DEG;
    const [dx, dy] = dir(a), nx = -dy * sg, ny = dx * sg;                               // n = the belly (outer, lower) side
    const tip = [p.x + dx * len, p.y + dy * len - len * 0.06];
    const P = (f, b) => [p.x + dx * len * f + nx * len * b, p.y + dy * len * f + ny * len * b];
    const b1 = P(0.12, 0.42), b2 = P(0.72, 0.36), l1 = P(0.45, -0.035), root = [p.x - dx * len * 0.04, p.y - dy * len * 0.04];
    const body = () => { ctx.beginPath(); ctx.moveTo(root[0], root[1]);
      ctx.bezierCurveTo(b1[0], b1[1], b2[0], b2[1], tip[0], tip[1]); ctx.quadraticCurveTo(l1[0], l1[1], root[0], root[1]); ctx.closePath(); };
    body(); ctx.fillStyle = i % 3 === 1 ? mix(RUST[3], RUST[2], 0.4) : RUST[3]; ctx.fill();
    ctx.save(); body(); ctx.clip();                                                     // the belly rounds away into shade
    ctx.beginPath(); dab(ctx, R, [P(0.0, 0.16), P(0.25, 0.33), P(0.55, 0.36), P(0.82, 0.22), P(1, 0.03)], len * 0.11, 0.25, 0.6, 0.3); ctx.fillStyle = RUST[1]; ctx.fill();
    ctx.beginPath(); dab(ctx, R, [P(0.05, 0.1), P(0.3, 0.2), P(0.6, 0.2), P(0.9, 0.08)], len * 0.045, 0.3, 0.6, 0.3); ctx.fillStyle = RUST[2]; ctx.fill();
    ctx.beginPath(); dab(ctx, R, [P(0.12, 0.03), P(0.4, 0.05), P(0.68, 0.06), P(0.9, 0.035)], len * 0.04, 0.55, 0.7, 0.4); ctx.fillStyle = RUST[4]; ctx.fill();
    ctx.beginPath(); dab(ctx, R, [P(0.0, -0.01), P(0.25, -0.02), P(0.5, -0.02), P(0.78, -0.005), P(1, 0.01)], Math.max(1.6, len * 0.035), 0.1, 0.5, 0.1); ctx.fillStyle = OCHRE[3]; ctx.fill();      // the ochre lip along the open top edge
    ctx.restore();
  }
  return { len: L, hull: [[0, L * 0.92, L * 0.12], [0, L * 0.72, L * 0.17], [0, L * 0.52, L * 0.18], [0, L * 0.25, L * 0.03]] };
}

/* ============================================================================================
 * BIRD OF PARADISE FLOWER (Strelitzia reginae), drawn as three kinds of part so it can open:
 *   bopStalk  the tall bare stalk bending over into the horizontal, beak-like green spathe
 *             (v.nod = how far it bends over, v.beak = direction of the beak in degrees,
 *             v.spathe = length of the beak ÷ stalk length)
 *   bopSepal  one long pointed orange sepal (the scene fans 4-5 of them up out of the spathe)
 *   bopPetal  the cobalt, arrow-shaped petal that sits among them
 * The scene reads `head`, `beak` and `spathe` from bopStalk to know where to plant the petals.
 * All in the same gouache hand as the leaves: flat shapes, a darker face, dry lighter strokes.
 * ========================================================================================== */
const cubicPts = (a, c1, c2, b, n = 10) => Array.from({ length: n + 1 }, (_, i) => {
  const t = i / n, m = 1 - t, k0 = m * m * m, k1 = 3 * m * m * t, k2 = 3 * m * t * t, k3 = t * t * t;
  return [k0 * a[0] + k1 * c1[0] + k2 * c2[0] + k3 * b[0], k0 * a[1] + k1 * c1[1] + k2 * c2[1] + k3 * b[1]];
});

function bopStalk(ctx, R, v) {
  const L = v.len, G = RAMP.moss;
  // the bare stalk rises almost straight, nods over in its last fifth and swells into the spathe
  const sp = makeSpine(L, 120, (s) => v.lean * s + v.curl * s * s + smoothstep(0.76, 1.0, s) * v.nod), at = (s) => sp.at(s);
  const w0 = L * 0.0105, w1 = L * 0.0082, w2 = L * 0.0125;
  const stalkW = (s) => (s < 0.84 ? lerp(w0, w1, s / 0.84) : lerp(w1, w2, Math.pow((s - 0.84) / 0.16, 1.5)));
  stem(ctx, R, at, 0, 0.845, w0, w1, [G[0], G[2], G[4]], 7);
  ribbon(ctx, sp, 0.835, 1, w1, w2, 26, 1.5); ctx.fillStyle = G[2]; ctx.fill();                       // the neck
  ctx.beginPath(); dab(ctx, R, trail(at, 0.8, 0.99, 8, (k) => stalkW(lerp(0.8, 0.99, k)) * 0.55), w1 * 0.42, 0.2, 0.3, 0.2); ctx.fillStyle = G[0]; ctx.fill();
  ctx.beginPath(); dab(ctx, R, trail(at, 0.82, 0.97, 8, (k) => -stalkW(lerp(0.82, 0.97, k)) * 0.4), w1 * 0.3, 0.55, 0.5, 0.3); ctx.fillStyle = G[4]; ctx.fill();

  const J = sp.at(1);
  const sa = v.beak * DEG;                                 // beak direction (≈ 77° = pointing right, a touch upward)
  const [ax, ay] = dir(sa), nx = Math.cos(sa), ny = Math.sin(sa);   // n = the keel (under) side
  const S = L * v.spathe, D = S * 0.25;
  const tip = [J.x + ax * S, J.y + ay * S];
  const P = (f, k) => [J.x + ax * S * f + nx * D * k, J.y + ay * S * f + ny * D * k];
  // where the spathe grows out of the neck: the two edges of the stalk, a little way back from the joint
  const bt = sp.at(0.955), bk = sp.at(0.9);
  const BT = [bt.x - bt.nx * stalkW(0.955), bt.y - bt.ny * stalkW(0.955)], BK = [bk.x + bk.nx * stalkW(0.9), bk.y + bk.ny * stalkW(0.9)];
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(BT[0], BT[1]);
    // top edge: a low shoulder, then nearly straight to the tip - this is the slit the flowers come out of
    ctx.bezierCurveTo(...P(0.1, -0.5), ...P(0.5, -0.36), tip[0], tip[1]);
    // keel: sweeps back from the sharp beak into a deep belly a third of the way along …
    ctx.bezierCurveTo(...P(0.72, 0.52), ...P(0.36, 1.22), ...P(0.07, 0.86));
    // … and tapers into the underside of the neck
    ctx.quadraticCurveTo(...P(-0.07, 0.58), BK[0], BK[1]);
    ctx.closePath();
  };
  body(); ctx.fillStyle = G[2]; ctx.fill();
  ctx.save(); body(); ctx.clip();
  const line = (pts) => smoothPts(pts.map(([f, k]) => P(f, k)), 3);
  const go = (col, pts, hw, dry = 0.3, lift = 0.6) => { ctx.beginPath(); dab(ctx, R, line(pts), hw, dry, lift, 0.3); ctx.fillStyle = col; ctx.fill(); };
  go(G[1], [[-0.05, 0.5], [0.2, 0.95], [0.45, 0.9], [0.7, 0.5], [0.95, 0.1]], D * 0.42, 0.2);                 // the keel sits in shade
  go(G[0], [[-0.02, 0.7], [0.2, 1.08], [0.42, 1.02], [0.62, 0.7]], D * 0.16, 0.25);
  go(OCHRE[1], [[0.4, 0.34], [0.58, 0.3], [0.78, 0.18], [1, 0.0]], D * 0.36, 0.4, 0.75);                      // the beak warms toward its tip: ochre, then barro
  go(RUST[3], [[0.62, 0.2], [0.76, 0.14], [0.9, 0.06], [1.02, 0.0]], D * 0.24, 0.35, 0.8);
  go(G[3], [[0.04, -0.02], [0.2, -0.1], [0.4, -0.1], [0.6, -0.03]], D * 0.2, 0.5, 0.7);                      // light along the shoulder
  go(G[4], [[0.1, -0.12], [0.24, -0.17], [0.4, -0.16], [0.52, -0.1]], D * 0.09, 0.6, 0.7);
  go(mix(G[0], NIGHT, 0.3), [[0.02, 0.24], [0.3, 0.3], [0.6, 0.2], [0.98, 0.01]], Math.max(0.8, L * 0.0013), 0, 0.5);   // one long crease, as on the real bract
  // the slit: the dusky red edge the real flower has, along the top lip
  ctx.beginPath(); dab(ctx, R, cubicPts(BT, P(0.1, -0.5), P(0.5, -0.36), tip, 10), Math.max(1.6, L * 0.0034), 0.1, 0.4, 0.1); ctx.fillStyle = RUST[3]; ctx.fill();
  ctx.restore();

  return { len: L, hull: [[J.x + ax * S * 0.5, -(J.y + ay * S * 0.5), S * 0.6], [sp.at(0.5).x, -sp.at(0.5).y, L * 0.02]],
           head: [J.x, -J.y], beak: sa, spathe: S };
}

/* One sepal: a narrow claw at the base, widest two-fifths of the way up, a long point. Folded down
 * its centre: the left face lit ochre, the right face a step deeper, barro brushed up from the
 * claw. v.wide = half-width ÷ length. */
function bopSepal(ctx, R, v) {
  const L = v.len, W = L * v.wide;
  const sp = makeSpine(L, 40, (s) => v.curl * s * s);
  const hw = (u) => W * (0.2 * Math.pow(1 - u, 2) + Math.pow(Math.sin(PI * Math.pow(u, 0.72)), 1.12));
  const pts = (f) => Array.from({ length: 41 }, (_, i) => { const u = i / 40, p = sp.at(u), w = hw(u) * f; return [p.x + p.nx * w, p.y + p.ny * w]; });
  const r = pts(1), l = pts(-1), mid = pts(0);
  const whole = [...r, ...l.slice().reverse()], every = (a, i0, i1) => a.slice(i0, i1 + 1).filter((_, i) => i % 3 === 0);
  poly(ctx, whole); ctx.fillStyle = AMBER[2]; ctx.fill();
  ctx.save(); poly(ctx, whole); ctx.clip();
  poly(ctx, [...mid, ...r.slice().reverse()]); ctx.fillStyle = AMBER[1]; ctx.fill();                          // the face turned from the light
  const go = (col, p, hw2, dry, lift = 0.7) => { ctx.beginPath(); dab(ctx, R, p, hw2, dry, lift, 0.35); ctx.fillStyle = col; ctx.fill(); };
  go(RUST[3], every(mid, 0, 20), W * 0.95, 0.3, 0.9);                                                           // barro at the claw, brushed up into the ochre and running out
  go(RUST[2], every(pts(0.55), 0, 14), W * 0.4, 0.25, 0.85);
  go(mix(AMBER[1], RUST[3], 0.5), every(pts(0.6), 12, 30), W * 0.26, 0.5);
  go(AMBER[3], every(pts(-0.5), 9, 36), W * 0.34, 0.5);                                                          // dry light up the lit face
  go(AMBER[4], every(pts(-0.55), 16, 31), W * 0.15, 0.6);
  go(mix(RUST[1], AMBER[0], 0.45), every(mid, 2, 38), Math.max(0.8, W * 0.07), 0, 0.6);                          // centre crease
  ctx.restore();
  return { len: L, hull: [[0, L * 0.5, W]] };
}

/* The cobalt petal: a thin shaft, two back-swept barbs, a long point (an arrowhead). */
function bopPetal(ctx, R, v) {
  const L = v.len;
  const prof = [[0, 0.02], [0.2, 0.025], [0.34, 0.032], [0.4, 0.108], [0.455, 0.124], [0.56, 0.1], [0.75, 0.052], [0.9, 0.02], [1, 0]];   // [along, half-width] ÷ length
  const side = (sg) => prof.map(([u, w]) => [sg * w * L + v.curl * L * u * u, -u * L + (u > 0.37 && u < 0.43 ? L * 0.04 : 0)]);
  const r = side(1), l = side(-1).reverse(), whole = [...r, ...l];
  const C = (u, f) => [f * L + v.curl * L * u * u, -u * L];                                                    // a point at u along it, f (÷ length) off its centre line
  const go = (col, p, hw, dry, lift = 0.7) => { ctx.beginPath(); dab(ctx, R, p, hw, dry, lift, 0.3); ctx.fillStyle = col; ctx.fill(); };
  poly(ctx, whole); ctx.fillStyle = BLUE[2]; ctx.lineJoin = 'round'; ctx.fill();
  ctx.save(); poly(ctx, whole); ctx.clip();
  poly(ctx, [[0, 0], ...side(0), ...r.slice().reverse()]); ctx.fillStyle = BLUE[1]; ctx.fill();                  // right face a step deeper
  go(BLUE[0], [C(0.42, 0.075), C(0.52, 0.07), C(0.66, 0.05), C(0.82, 0.024)], L * 0.02, 0.35);
  go(BLUE[3], [C(0.43, -0.07), C(0.52, -0.062), C(0.64, -0.045), C(0.8, -0.022), C(0.92, -0.008)], L * 0.022, 0.5);   // dry light on the lit face
  go(BLUE[4], [C(0.0, -0.004), C(0.12, -0.004), C(0.24, -0.006), C(0.36, -0.008)], L * 0.016, 0.3, 0.5);              // the pale claw
  go(BLUE[4], [C(0.46, -0.085), C(0.54, -0.07), C(0.62, -0.055)], L * 0.008, 0.5);
  go(BLUE[0], [C(0.3, 0), C(0.5, 0), C(0.7, 0), C(0.93, 0)], Math.max(0.8, L * 0.004), 0, 0.6);                       // centre line
  ctx.restore();
  return { len: L, hull: [[0, L * 0.5, L * 0.1]] };
}

/* ============================================================================================
 * BANANA BUNCH and BANANA BLOSSOM — the accents of the White Lotus titles. Both HANG: they are
 * drawn growing up from the pivot like everything else, and the scene turns them upside down. So
 * they are lit for hanging: light falls on what is the lower right here.
 * ========================================================================================== */

/** one banana: a plump, slightly angular finger - green at the stem end, a dark nub at the tip */
function finger(ctx, R, x, y, ang, len, bend, tone) {
  const sp = makeSpine(len, 14, (s) => ang + bend * s, x, y), W = len * 0.138;
  const hw = (u) => W * (0.3 + 0.7 * smoothstep(0, 0.22, u)) * (1 - 0.8 * Math.pow(smoothstep(0.68, 1, u), 1.5)) * (1 + 0.04 * Math.sin(u * 13 + tone * 9));
  const edge = (f, i0 = 0, i1 = 14) => { const o = []; for (let i = i0; i <= i1; i++) { const u = i / 14, p = sp.at(u), w = hw(u) * f; o.push([p.x + p.nx * w, p.y + p.ny * w]); } return o; };
  const m = sp.at(0.5), sh = m.nx * -0.5 + m.ny * -0.85 > 0 ? 1 : -1;       // the flank that will be underneath once it hangs
  const l = edge(-1), r = edge(1), body = [...l, ...r.slice().reverse()];
  const go = (col, p, w, dry, lift = 0.6, rag = 0.3) => { ctx.beginPath(); dab(ctx, R, p, w, dry, lift, rag); ctx.fillStyle = col; ctx.fill(); };
  const soft = (col, p, w, lift = 0.6) => { ctx.beginPath(); wash(ctx, p, w, lift); ctx.fillStyle = rgba(col, 0.5); ctx.fill(); };
  poly(ctx, body); ctx.fillStyle = tone > 0.35 ? mix(OCHRE[2], OCHRE[3], 0.6) : tone < -0.45 ? mix(OCHRE[2], OCHRE[1], 0.4) : OCHRE[2]; ctx.fill();
  ctx.save(); poly(ctx, body); ctx.clip();
  poly(ctx, [...edge(sh * 0.3), ...(sh > 0 ? r : l).slice().reverse()]); ctx.fillStyle = mix(OCHRE[1], OCHRE[2], 0.25); ctx.fill();   // the shaded flank, one flat step down
  soft(OCHRE[1], edge(sh * 0.62, 0, 14), W * 0.42, 0.3);
  go(OCHRE[1], edge(sh * 0.7, 1, 13), W * 0.3, 0.3, 0.4);
  go(OCHRE[0], edge(sh * 0.9, 1, 13), W * 0.13, 0.35, 0.5);
  soft(OCHRE[3], edge(-sh * 0.4, 1, 13), W * 0.44, 0.5);
  go(OCHRE[3], edge(-sh * 0.42, 2, 12), W * 0.3, 0.4, 0.6);                                                            // the lit ridge, dry
  go(OCHRE[4], edge(-sh * 0.5, 3, 9), W * 0.13, 0.6, 0.7);
  go(mix(RAMP.moss[3], OCHRE[2], 0.5), edge(0, 0, 3), W * 0.7, 0.3, 0.95, 0.4);                                         // a little green at the stem
  go(mix(RAMP.moss[2], OCHRE[1], 0.3), edge(sh * 0.3, 0, 2), W * 0.3, 0.2, 0.9);
  go(mix(UMBER, OCHRE[0], 0.6), edge(sh * 0.55, 12, 14), W * 0.12, 0.3, 0.3);
  ctx.lineJoin = 'round'; poly(ctx, sh > 0 ? r : l, false); ctx.strokeStyle = rgba(mix(OCHRE[0], UMBER, 0.6), 0.8); ctx.lineWidth = 3; ctx.stroke();   // (clipped: a thin dark edge under it)
  ctx.beginPath();                                                                                                       // a few ripe flecks
  for (let i = 0, n = R.int(2, 5); i < n; i++) {
    const p = sp.at(R.range(0.22, 0.86)), o = hw(0.5) * R.range(-0.7, 0.7), a = len * R.range(0.008, 0.02), b = a * R.range(0.35, 0.6), cx = p.x + p.nx * o, cy = p.y + p.ny * o;
    ctx.moveTo(cx - p.tx * a, cy - p.ty * a); ctx.lineTo(cx + p.nx * b, cy + p.ny * b); ctx.lineTo(cx + p.tx * a, cy + p.ty * a); ctx.lineTo(cx - p.nx * b, cy - p.ny * b); ctx.closePath();
  }
  ctx.fillStyle = rgba(UMBER, 0.72); ctx.fill();
  ctx.restore();
  const e = sp.at(1), q = sp.at(0.95), w = hw(0.95) * 1.1, k = W * 0.3;                                                  // the dark nub at the tip
  poly(ctx, [[q.x - q.nx * w, q.y - q.ny * w], [e.x - e.nx * w * 0.7 + e.tx * k * 0.3, e.y - e.ny * w * 0.7 + e.ty * k * 0.3], [e.x + e.tx * k, e.y + e.ty * k], [e.x + e.nx * w * 0.7 + e.tx * k * 0.3, e.y + e.ny * w * 0.7 + e.ty * k * 0.3], [q.x + q.nx * w, q.y + q.ny * w]]);
  ctx.fillStyle = mix(UMBER, NIGHT, 0.25); ctx.fill();
}

/* BANANA BUNCH — several hands of plump ochre bananas round a thick stalk. The stalk is bare for
 * the first part of its length (that is what it hangs by: tuck its end behind a leaf or off the
 * top of the frame), then come the hands, each a fan of fingers pointing away from the pivot, the
 * hands nearer the pivot lying over the ones beyond, each hand turned a different way.
 *   v.hands   how many;  v.from … v.to = where along the length they sit;  v.finger = finger length ÷ length
 *   v.spread  half-angle of one hand's fan, degrees;  v.turn = how far each hand is turned off the stalk (radians)
 * Returns `tail`: where the stalk ends, hidden among the last fingers. To carry it on down to a
 * banana blossom, plant the blossom's pivot there and draw the blossom BEHIND the bunch. */
function bananaBunch(ctx, R, v) {
  const L = v.len, SL = L * (v.to + v.finger * 0.45), sp = makeSpine(SL, 60, (s) => v.lean * s + v.curl * s * s), at0 = (s) => sp.at(s), at = (s) => sp.at(s * L / SL);   // (the stalk stops out of sight among the last fingers)
  const w0 = L * 0.024, w1 = L * 0.016, fl = L * v.finger, G = RAMP.olive;
  stem(ctx, R, at0, 0, 1, w0, w1, [G[0], mix(G[2], BARK[2], 0.3), mix(G[4], BARK[4], 0.3)], 8, -1);
  ctx.beginPath();                                                                      // the scars of the leaf sheaths it grew through
  for (let i = 0; i < 4; i++) { const s = v.from * (0.2 + 0.2 * i) + R.range(-0.01, 0.01), p = at(s), w = lerp(w0, w1, s) * 1.05; dab(ctx, R, quadPts([p.x - p.nx * w, p.y - p.ny * w], [p.x + p.tx * w * 0.7, p.y + p.ty * w * 0.7], [p.x + p.nx * w, p.y + p.ny * w], 6), 1.4, 0, 0.3, 0.2); }
  ctx.fillStyle = G[0]; ctx.fill();
  for (let j = v.hands - 1; j >= 0; j--) {                                              // the far hand first
    const k = j / (v.hands - 1), s = lerp(v.from, v.to, k), p = at(s);
    const n = j === v.hands - 1 ? 4 : R.int(5, 6), lean = (j % 2 ? 1 : -1) * R.range(0.4, 1) * (v.turn ?? 0.3), size = fl * lerp(1, 0.84, k);
    const list = [];
    for (let i = 0; i < n; i++) {
      const rel = ((i + 0.5) / n) * 2 - 1 + R.range(-0.08, 0.08);
      list.push({ rel, ang: p.ang + lean + rel * v.spread * DEG, len: size * R.range(0.88, 1.06) * (1 - 0.14 * rel * rel), bend: -rel * R.range(0.25, 0.6) - lean * R.range(0.2, 0.6) + R.range(-0.08, 0.08),
                  x: p.x + p.nx * rel * w0 * 1.3 + p.tx * Math.abs(rel) * -w0, y: p.y + p.ny * rel * w0 * 1.3 + p.ty * Math.abs(rel) * -w0, tone: R.range(-1, 1) });
    }
    list.sort((a, b) => Math.abs(b.rel - lean) - Math.abs(a.rel - lean));                // the outer fingers first, the middle ones on top
    for (const f of list) finger(ctx, R, f.x, f.y, f.ang, f.len, f.bend, f.tone);
    // the cushion the fingers grow from
    ctx.beginPath(); ctx.ellipse(p.x, p.y, w0 * 1.7, w0 * 0.95, p.ang, 0, PI * 2); ctx.fillStyle = mix(G[2], BARK[2], 0.35); ctx.fill();
    ctx.beginPath(); dab(ctx, R, [[p.x - p.nx * w0 * 1.4, p.y - p.ny * w0 * 1.4 - 1], [p.x - p.tx * w0 * 0.5, p.y - p.ty * w0 * 0.5], [p.x + p.nx * w0 * 1.4, p.y + p.ny * w0 * 1.4 - 1]], w0 * 0.3, 0.3, 0.3, 0.2); ctx.fillStyle = G[0]; ctx.fill();
  }
  const end = sp.at(1), top = at(v.to), mid = at((v.from + v.to) / 2), wide = fl * Math.sin(v.spread * DEG) * 0.95;
  return { len: L, tail: [end.x, -end.y],
           hull: [[mid.x, -mid.y, wide], [top.x + top.tx * fl * 0.45, -(top.y + top.ty * fl * 0.45), wide * 0.9], [at(v.from).x, -at(v.from).y, wide * 0.8], ...[0.3, 0.7].map((q) => { const p = at(v.from * q); return [p.x, -p.y, w0 * 1.6]; })] };
}

/* BANANA BLOSSOM — the "banana heart" that hangs below the bunch on the end of the stalk: a heavy
 * maroon teardrop bud, with two bracts peeled back and drooping either side of it, showing their
 * paler terracotta inside and the row of cream flowers that was under each.
 *   v.stalk  share of the length that is bare stalk;  v.wide = half-width of the bud ÷ its length
 *   v.open   how many bracts have lifted (0-2);  v.lean / v.curl = how the stalk hangs */
function bananaBlossom(ctx, R, v) {
  const L = v.len, sb = v.stalk, sp = makeSpine(L, 90, (s) => v.lean * s + v.curl * s * s), at = (s) => sp.at(s);
  const bl = L * (1 - sb), Wb = bl * v.wide, G = RAMP.olive;
  const B = (u) => sp.at(sb + clamp(u) * (1 - sb));
  const hw = (u) => Wb * Math.pow(Math.sin(PI * Math.pow(clamp(u, 0, 1), 0.58)), 0.8) * (1 - 0.18 * u);     // widest a third of the way down, then a long point
  const go = (col, p, w, dry = 0.3, lift = 0.6, rag = 0.3) => { ctx.beginPath(); dab(ctx, R, p, w, dry, lift, rag); ctx.fillStyle = col; ctx.fill(); };
  const soft = (col, p, w, lift = 0.6) => { ctx.beginPath(); wash(ctx, p, w, lift); ctx.fillStyle = rgba(col, 0.5); ctx.fill(); };
  const sw0 = L * 0.0125, sw1 = L * 0.0105;
  stem(ctx, R, at, 0, sb + 0.03, sw0, sw1, [G[0], mix(G[2], BARK[1], 0.25), mix(G[3], BARK[3], 0.3)], 9, -1);
  ctx.beginPath();                                                                      // the knuckles where the hands of fruit were
  for (let i = 0; i < 5; i++) { const s = sb * (0.1 + 0.18 * i) + R.range(-0.025, 0.025), p = sp.at(s), w = lerp(sw0, sw1, s / sb) * 1.18; ctx.moveTo(p.x + w, p.y); ctx.ellipse(p.x, p.y, w, w * 0.42, p.ang, 0, PI * 2); }
  ctx.fillStyle = mix(G[1], BARK[1], 0.3); ctx.fill();

  // --- a lifted bract (behind the bud): a boat-shaped scale, seen from its paler inner face ---
  const bract = (sg, a0, len, wide, curl, deep) => {
    const p0 = B(0.02), bs = makeSpine(len, 20, (s) => p0.ang + sg * (a0 + curl * s * s), p0.x + sg * p0.nx * Wb * 0.18, p0.y + sg * p0.ny * Wb * 0.18);
    const w = (u) => wide * Math.pow(Math.sin(PI * Math.pow(u, 0.6)), 0.72) * (1 + 0.05 * Math.sin(u * 11 + a0 * 7));
    const e = (f, i0 = 0, i1 = 16) => { const o = []; for (let i = i0; i <= i1; i++) { const u = i / 16, p = bs.at(u), ww = w(u) * f; o.push([p.x + p.nx * ww, p.y + p.ny * ww]); } return o; };
    const shape = [...e(-1), ...e(1).reverse()], under = -sg;                   // `under` = the outer edge, away from the bud: the darker outside of the bract shows along it
    const base = deep ? mix(RUST[3], RUST[2], 0.35) : RUST[3], lightC = deep ? mix(RUST[3], RUST[4], 0.6) : RUST[4];
    poly(ctx, shape); ctx.fillStyle = base; ctx.fill();
    ctx.save(); poly(ctx, shape); ctx.clip();
    soft(RUST[2], e(under * 0.62, 0, 16), wide * 0.4, 0.5);
    go(RUST[2], e(under * 0.7, 0, 15), wide * 0.26, 0.3, 0.6);                                          // the boat curves away into shade along its outer side
    go(RUST[1], e(under * 0.95, 1, 14), wide * 0.1, 0.2, 0.5);
    soft(lightC, e(-under * 0.25, 1, 15), wide * 0.42, 0.6);
    for (const f of [0.15, -0.2, -0.55]) go(lightC, e(under * f + R.range(-0.08, 0.08), 2, R.int(11, 15)), wide * R.range(0.1, 0.17), 0.45, 0.75, 0.4);   // ribs of drier, paler paint
    go(mix(RUST[4], BLUSH, 0.6), e(-under * 0.5, 3, 11), wide * 0.1, 0.55, 0.7);
    go(BLUSH, e(-under * 0.62, 5, 9), wide * 0.05, 0.5, 0.7);
    go(RUST[2], e(0, 0, 5), wide * 0.3, 0.45, 0.95, 0.5);                                                // darker where it is hinged
    ctx.lineJoin = 'round'; poly(ctx, e(under), false); ctx.strokeStyle = RUST[1]; ctx.lineWidth = Math.max(2.6, wide * 0.1); ctx.stroke();        // the rolled rim: the maroon outside, glimpsed
    poly(ctx, e(-under), false); ctx.strokeStyle = rgba(RUST[1], 0.6); ctx.lineWidth = 2.6; ctx.stroke();
    ctx.restore();
  };
  // --- the row of cream flowers that was under a lifted bract ---
  const flowers = (sg, a0, n, len) => {
    const p0 = B(0.05), list = [];
    for (let i = 0; i < n; i++) {
      const a = p0.ang + sg * (a0 + (i - (n - 1) / 2) * 0.13), d = dir(a), x = p0.x + sg * p0.nx * Wb * (0.3 + 0.09 * i), y = p0.y + sg * p0.ny * Wb * (0.3 + 0.09 * i) + p0.ty * i * 2, ll = len * R.range(0.8, 1.1);
      list.push({ p: quadPts([x, y], [x + d[0] * ll * 0.5 + p0.tx * ll * 0.12, y + d[1] * ll * 0.5 + p0.ty * ll * 0.12], [x + d[0] * ll, y + d[1] * ll], 6), w: len * 0.085, c: i % 2, d: 0.15, l: 0.35, g: 0.2 });
    }
    lay(ctx, R, [CREAM_HI, OCHRE[4]], list);
    ctx.beginPath(); for (const q of list) { const e = q.p[q.p.length - 1]; ctx.moveTo(e[0] + 2.4, e[1]); ctx.arc(e[0], e[1], Math.max(1.6, len * 0.05), 0, PI * 2); }
    ctx.fillStyle = OCHRE[2]; ctx.fill();
  };
  const open = v.open ?? 2;
  if (open > 0) { bract(-1, 0.62, bl * 0.7, Wb * 0.62, 0.42, true); flowers(-1, 0.4, 5, bl * 0.2); }
  if (open > 1) { bract(1, 0.5, bl * 0.8, Wb * 0.66, 0.36, false); flowers(1, 0.32, 6, bl * 0.22); }

  // --- the bud: overlapping maroon bracts, wound to a point ---
  const edge = (f, i0 = 0, i1 = 24) => { const o = []; for (let i = i0; i <= i1; i++) { const u = i / 24, p = B(u), w = hw(u) * (typeof f === 'function' ? f(u) : f); o.push([p.x + p.nx * w, p.y + p.ny * w]); } return o; };
  const bud = [...edge(-1), ...edge(1).reverse()], DEEP = mix(RUST[0], NIGHT, 0.45);
  poly(ctx, bud); ctx.fillStyle = mix(RUST[0], RUST[1], 0.6); ctx.fill();
  ctx.save(); poly(ctx, bud); ctx.clip();
  poly(ctx, [...edge(-0.1), ...edge(-1.2).reverse()]); ctx.fillStyle = mix(RUST[0], NIGHT, 0.2); ctx.fill();   // the side that will be turned from the light
  const strokes = (n, f0, f1, wK, dry, len = [8, 16]) => Array.from({ length: n }, () => { const i0 = R.int(0, 10), f = R.range(f0, f1), tw = R.range(-0.25, 0.25); return { p: edge((u) => f + tw * (u - 0.3), i0, Math.min(24, i0 + R.int(len[0], len[1]))), w: Wb * wK * R.range(0.7, 1.25), c: R.int(0, 1), d: dry, l: 0.75, g: 0.4 }; });
  lay(ctx, R, [DEEP, mix(RUST[0], NIGHT, 0.3)], strokes(6, -0.95, -0.35, 0.12, 0.25), 1, 0.4);
  lay(ctx, R, [RUST[0], mix(RUST[0], RUST[1], 0.5)], strokes(5, -0.85, -0.25, 0.1, 0.45, [6, 13]));
  lay(ctx, R, [RUST[1], mix(RUST[1], RUST[2], 0.5)], strokes(9, -0.2, 0.9, 0.15, 0.3), 1, 0.45);
  lay(ctx, R, [RUST[2], mix(RUST[2], RUST[3], 0.4)], strokes(5, 0.2, 0.8, 0.09, 0.5, [6, 12]), 1, 0.35);
  lay(ctx, R, [mix(RUST[4], BLUSH, 0.5)], [{ p: edge(0.42, 5, 13), w: Wb * 0.035, d: 0.5, l: 0.6, g: 0.4 }, { p: edge(0.55, 7, 10), w: Wb * 0.02, d: 0.3, l: 0.6, g: 0.3 }]);   // one pale touch: it has a waxy bloom
  // the seams where one bract laps over the next
  const seam = (u0, sg, u1) => { const a = B(u0), b = B(u1), c = B((u0 + u1) / 2), w = hw(u0) * sg, wc = hw((u0 + u1) / 2) * sg * -0.55; return quadPts([a.x + a.nx * w, a.y + a.ny * w], [c.x + c.nx * wc, c.y + c.ny * wc], [b.x, b.y], 10); };
  lay(ctx, R, [DEEP], [{ p: seam(0.1, -1, 0.9), w: 1.7, d: 0, l: 0.5, g: 0 }, { p: seam(0.28, 1, 0.97), w: 1.5, d: 0, l: 0.5, g: 0 }, { p: seam(0.5, -1, 1), w: 1.3, d: 0, l: 0.5, g: 0 }]);
  lay(ctx, R, [RUST[2]], [{ p: seam(0.13, -1, 0.9).slice(2), w: 1.6, d: 0.3, l: 0.8, g: 0.3 }, { p: seam(0.31, 1, 0.97).slice(1, 8), w: 1.5, d: 0.3, l: 0.8, g: 0.3 }]);
  ctx.lineJoin = 'round'; poly(ctx, bud); ctx.setLineDash([70, 20, 120, 34]); ctx.strokeStyle = rgba(DEEP, 0.7); ctx.lineWidth = 3; ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();
  // the collar where the bud meets the stalk
  const c0 = B(0.0); ctx.beginPath(); ctx.ellipse(c0.x, c0.y, sw1 * 1.9, sw1 * 0.95, c0.ang, 0, PI * 2); ctx.fillStyle = mix(G[1], BARK[1], 0.3); ctx.fill();

  const hull = [0.3, 0.7].map((u) => { const p = B(u); return [p.x, -p.y, Math.max(hw(u) * 1.15, Wb * 0.5) * (open > 0 ? 1.9 : 1)]; });
  for (const q of [0.25, 0.6, 0.9]) { const p = sp.at(sb * q); hull.push([p.x, -p.y, sw0 * 2]); }
  return { len: L, hull };
}

/* ============================================================================================
 * MONKEY — a small tan monkey hanging by one arm, after the monkeys of the wallpaper reference: warm
 * brown fur laid in short strokes, a pale face, a long tail curled at its end, a banana held up in
 * its free hand. It HANGS (from the banana bunch, upper left of the resting picture): like the bunch
 * it is drawn growing up from the pivot, which is its gripping hand, and the scene turns it upside
 * down. Inside this function it is painted the right way up, hanging down the page from (0, 0):
 * x to the right, y DOWN, everything in units of its length (hand to the bottom of the tail).
 * To change it: FUR and FACE are its colours; the lists of points below are its pose.
 * ========================================================================================== */
const FUR = ['#38231A', '#5A3923', '#7E5230', '#A7754A', '#CEA475'];      // shadow, body, mid, light, highlight
const FACE = ['#A97F5C', '#DAB790', '#EED8BA'];                            // the bare skin of face, ear, hand and foot

function monkey(ctx, R, v) {
  const L = v.len;
  ctx.save();
  ctx.rotate(PI);                                           // from here on it is drawn as it will hang
  const S = (pts, per = 8) => smoothPts(pts.map(([x, y]) => [x * L, y * L]), per);
  const fill = (col) => { ctx.fillStyle = col; ctx.fill(); };
  const normal = (mid, i) => { const N = mid.length - 1, a = mid[Math.max(0, i - 1)], b = mid[Math.min(N, i + 1)], nx = -(b[1] - a[1]), ny = b[0] - a[0], m = Math.hypot(nx, ny) || 1; return [nx / m, ny / m]; };

  /** fur: n short strokes running along a centre line `mid` (px), between f0 and f1 of the way across
   *  it (-1 … 1), `hw(u)` being its half-width there */
  const fur = (mid, hw, n, cols, f0, f1, wK, dry, span = [0.14, 0.34]) => {
    const N = mid.length - 1, strokes = [];
    for (let i = 0; i < n; i++) {
      const u0 = R.range(0, 1 - span[0]), u1 = Math.min(1, u0 + R.range(span[0], span[1])), f = R.range(f0, f1), p = [];
      for (let j = 0; j <= 6; j++) {
        const u = lerp(u0, u1, j / 6), k = Math.round(u * N), [nx, ny] = normal(mid, k), o = hw(u) * f;
        p.push([mid[k][0] + nx * o, mid[k][1] + ny * o]);
      }
      strokes.push({ p, w: Math.max(0.6, hw((u0 + u1) / 2) * wK * R.range(0.7, 1.3)), c: R.int(0, cols.length - 1), d: dry, l: 0.7, g: 0.4 });
    }
    lay(ctx, R, cols, strokes, 1, 0.3);
  };
  /** a limb: a tapering strip through `ctrl`, w0 → w1 wide; its shaded side is `sh` (+1 / -1) */
  const limb = (ctrl, w0, w1, sh = 1, dark = 0) => {
    const mid = S(ctrl), hw = (u) => lerp(w0, w1, u) * L * 0.5, base = mix(FUR[2], FUR[1], dark);
    taper(ctx, mid, w0 * L, w1 * L); fill(base);
    ctx.save(); taper(ctx, mid, w0 * L, w1 * L); ctx.clip();
    fur(mid, hw, 8, [mix(FUR[1], FUR[0], 0.35 + dark * 0.3), FUR[1]], sh * 0.2, sh * 0.95, 0.4, 0.3);
    fur(mid, hw, 6, [mix(FUR[3], FUR[2], 0.4 + dark * 0.4), FUR[3]], -sh * 0.9, -sh * 0.1, 0.32, 0.55);
    if (!dark) fur(mid, hw, 3, [FUR[4]], -sh * 0.85, -sh * 0.45, 0.16, 0.75, [0.1, 0.22]);
    ctx.restore();
    return mid;
  };
  /** a rounded blob round a centre line: the body, a hand, a foot */
  const blob = (mid, hw) => {
    const N = mid.length - 1, l = [], r = [];
    for (let i = 0; i <= N; i++) { const [nx, ny] = normal(mid, i), w = hw(i / N); l.push([mid[i][0] + nx * w, mid[i][1] + ny * w]); r.push([mid[i][0] - nx * w, mid[i][1] - ny * w]); }
    return [...l, ...r.reverse()];
  };
  const oval = (x, y, rx, ry, rot = 0) => { ctx.beginPath(); ctx.ellipse(x * L, y * L, rx * L, ry * L, rot, 0, PI * 2); };

  // ---- the tail, behind everything: down from the hips, out to the left, and curled up at its end ----
  const tail = limb([[0.04, 0.555], [-0.02, 0.6], [-0.08, 0.69], [-0.095, 0.8], [-0.06, 0.9], [0.005, 0.935], [0.05, 0.895], [0.04, 0.84], [0.0, 0.835], [-0.012, 0.865]], 0.04, 0.016, 1, 0.35);

  // ---- the far leg, tucked up ----
  limb([[0.075, 0.53], [0.15, 0.545], [0.2, 0.59], [0.185, 0.655], [0.165, 0.69]], 0.052, 0.03, -1, 0.6);
  oval(0.156, 0.697, 0.03, 0.014, 0.5); fill(mix(FACE[0], FUR[1], 0.35));

  // ---- the arm it hangs by: straight up to the hand (the pivot), drawn before the head so the cheek lies against it ----
  const arm = limb([[0.0, 0.025], [-0.012, 0.1], [-0.02, 0.19], [0.0, 0.27], [0.03, 0.315]], 0.036, 0.056, 1);

  // ---- the body: a bean, shoulders to hips, belly forward ----
  const bodyMid = S([[0.035, 0.285], [0.066, 0.35], [0.084, 0.43], [0.074, 0.51], [0.05, 0.575]]);
  const bodyHw = (u) => L * 0.078 * Math.pow(Math.sin(PI * (0.06 + 0.88 * u)), 0.55) * (1 + 0.12 * Math.sin(PI * u));
  const body = blob(bodyMid, bodyHw);
  poly(ctx, body); fill(FUR[2]);
  ctx.save(); poly(ctx, body); ctx.clip();
  fur(bodyMid, bodyHw, 12, [mix(FUR[1], FUR[0], 0.3), FUR[1]], 0.25, 1, 0.3, 0.3);                  // its back, in shade
  fur(bodyMid, bodyHw, 9, [mix(FUR[2], FUR[3], 0.5), FUR[3]], -0.5, 0.2, 0.26, 0.5);
  { const belly = S([[0.085, 0.33], [0.118, 0.4], [0.128, 0.46], [0.11, 0.53]]);                      // the pale front
    fur(belly, () => L * 0.03, 9, [mix(FUR[3], FACE[1], 0.45), mix(FUR[4], FACE[1], 0.5)], -0.9, 0.9, 0.42, 0.45, [0.2, 0.45]); }
  ctx.restore();

  // ---- the near leg, tucked up in front of the body, and its foot ----
  limb([[0.045, 0.535], [0.115, 0.57], [0.155, 0.625], [0.128, 0.685], [0.092, 0.72]], 0.06, 0.032, -1);
  oval(0.072, 0.729, 0.036, 0.016, -0.12); fill(mix(FACE[0], FUR[1], 0.2));

  // ---- the free arm, bent up with a banana in its hand ----
  limb([[0.095, 0.325], [0.15, 0.36], [0.196, 0.4], [0.215, 0.36], [0.212, 0.318]], 0.046, 0.03, -1);
  finger(ctx, R, 0.214 * L, 0.335 * L, 0.42, 0.125 * L, 0.5, 0.2);                                   // the banana
  oval(0.212, 0.318, 0.021, 0.017, 0.3); fill(mix(FACE[0], FUR[1], 0.25));                           // the hand round it

  // ---- the head: round, an ear, a pale face ----
  const hx = 0.096, hy = 0.232, hr = 0.079;
  oval(hx + hr * 0.93, hy - hr * 0.1, 0.027, 0.03); fill(FUR[1]);                                    // the ear
  oval(hx + hr * 0.95, hy - hr * 0.1, 0.015, 0.018); fill(mix(FACE[0], FACE[1], 0.4));
  oval(hx, hy, hr * 1.03, hr * 0.96); fill(FUR[2]);
  ctx.save(); oval(hx, hy, hr * 1.03, hr * 0.96); ctx.clip();
  { const cap = S([[hx - hr * 0.95, hy + hr * 0.2], [hx - hr * 0.7, hy - hr * 0.62], [hx, hy - hr * 0.92], [hx + hr * 0.7, hy - hr * 0.62], [hx + hr * 0.95, hy + hr * 0.15]]);
    fur(cap, () => L * hr * 0.3, 14, [FUR[1], mix(FUR[1], FUR[0], 0.4)], -0.9, 0.5, 0.42, 0.3, [0.12, 0.3]);   // the dark cap of the head
    fur(cap, () => L * hr * 0.3, 6, [FUR[3]], -0.2, 0.9, 0.22, 0.6, [0.1, 0.2]); }
  ctx.restore();
  // the face: two rounds for the eyes and one for the muzzle, in one pale shape
  ctx.beginPath();
  ctx.ellipse((hx - hr * 0.3) * L, (hy - hr * 0.02) * L, hr * 0.37 * L, hr * 0.4 * L, 0, 0, PI * 2);
  ctx.ellipse((hx + hr * 0.36) * L, (hy - hr * 0.04) * L, hr * 0.37 * L, hr * 0.4 * L, 0, 0, PI * 2);
  ctx.ellipse((hx + hr * 0.05) * L, (hy + hr * 0.42) * L, hr * 0.47 * L, hr * 0.38 * L, 0, 0, PI * 2);
  fill(FACE[1]);
  oval(hx + hr * 0.07, hy + hr * 0.36, hr * 0.3, hr * 0.2); fill(FACE[2]);                           // the light on the muzzle
  for (const ex of [-0.28, 0.36]) {                                                                  // eyes
    oval(hx + hr * ex, hy - hr * 0.03, hr * 0.105, hr * 0.125); fill(FUR[0]);
    oval(hx + hr * (ex + 0.04), hy - hr * 0.075, hr * 0.03, hr * 0.03); fill(FACE[2]);
  }
  oval(hx + hr * 0.0, hy + hr * 0.3, hr * 0.035, hr * 0.03); fill(FUR[0]);                           // nostrils
  oval(hx + hr * 0.13, hy + hr * 0.3, hr * 0.035, hr * 0.03); fill(FUR[0]);
  ctx.beginPath(); dab(ctx, R, S([[hx - hr * 0.2, hy + hr * 0.5], [hx + hr * 0.06, hy + hr * 0.6], [hx + hr * 0.34, hy + hr * 0.49]], 5), Math.max(0.7, L * hr * 0.022), 0, 0.5, 0.1); fill(mix(FUR[0], FACE[0], 0.25));   // the mouth
  ctx.beginPath(); dab(ctx, R, S([[hx - hr * 0.52, hy - hr * 0.42], [hx - hr * 0.3, hy - hr * 0.5], [hx - hr * 0.06, hy - hr * 0.4]], 5), Math.max(0.7, L * hr * 0.03), 0.1, 0.5, 0.1);                                  // brows
  dab(ctx, R, S([[hx + hr * 0.12, hy - hr * 0.42], [hx + hr * 0.38, hy - hr * 0.52], [hx + hr * 0.62, hy - hr * 0.4]], 5), Math.max(0.7, L * hr * 0.03), 0.1, 0.5, 0.1); fill(FUR[0]);

  // ---- the hand it hangs by, closed round whatever it holds ----
  oval(0.001, 0.014, 0.025, 0.021, 0.2); fill(mix(FACE[0], FUR[1], 0.3));
  ctx.beginPath(); dab(ctx, R, S([[-0.016, 0.008], [0.002, 0.016], [0.02, 0.01]], 5), Math.max(0.7, L * 0.0035), 0, 0.4, 0.1);          // the fingers, folded over
  dab(ctx, R, S([[-0.014, 0.019], [0.003, 0.027], [0.019, 0.021]], 5), Math.max(0.7, L * 0.003), 0, 0.4, 0.1); fill(mix(FUR[0], FACE[0], 0.3));

  ctx.restore();
  // (in the sprite it is the other way up and round: x → -x, y is up)
  return { len: L, hull: [[-0.096 * L, 0.232 * L, 0.095 * L], [-0.075 * L, 0.43 * L, 0.105 * L], [-0.13 * L, 0.63 * L, 0.09 * L], [-0.222 * L, 0.27 * L, 0.05 * L],
                           [0.04 * L, 0.72 * L, 0.075 * L], [0.01 * L, 0.88 * L, 0.075 * L], [0.01 * L, 0.13 * L, 0.035 * L]] };
}

/* ---- for js/swing.js (version 7): the monkey that swings across the screen on a liana ---------- */
const MONKEY_SEED = 263;                                   // (the seed of the 'monkey' sprite below: the one that swings across is the one that hangs from the bananas)
/** The monkey, the right way up, hanging by its hand from (x, y); `len` px from its hand to the end of its tail. */
export function paintMonkey(ctx, x, y, len) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(PI);          // (monkey() paints it as a sprite, upside down, and turns it over itself)
  monkey(ctx, rng(MONKEY_SEED), { len });
  ctx.restore();
}
/** A liana hanging from (x, y), `len` px long, `w` = [half-width where it comes down from, half-width at its end] px,
 *  with small leaves `leaf` px long. Nearly taut: something is swinging on the end of it. Returns where its end is, [x, y]. */
export function paintVine(ctx, x, y, len, w, leaf) {
  const v = { len, ramp: RAMP.moss, sway: 0.03, waves: 1.3, twists: len / (w[0] * 22), leaves: Math.max(4, Math.round(len / (leaf * 2.6))), leaf, wpx: w };
  ctx.save(); ctx.translate(x, y); ctx.rotate(PI);          // (liana() grows up from its root: turned over, it hangs)
  liana(ctx, rng(271), v);
  ctx.restore();
  const tip = makeSpine(len, 150, (s) => v.sway * Math.sin(s * PI * 2 * v.waves + 0.5) * (0.55 + 0.45 * s)).at(1);   // (the same line liana() draws along)
  return [x - tip.x, y - tip.y];
}

/* ============================================================================================
 * BAMBOO — one ochre cane, jointed, with sprays of narrow grey-green leaves at its upper joints.
 * After the printed bamboo fabric in the references: dry, layered, a little dusty. The cane is
 * laid in long strokes between the joints (darker down the right, pale and dry down the left);
 * every leaf is a single cut shape with one half a step darker.
 *   v.joints  how many;  v.sprays = how many of the upper joints carry leaves
 *   v.lean / v.curve = lean of the cane and the bow in it;  v.ramps = greens of the leaves (two RAMPs)
 * The cane thins to a leafy tip, so it can stand whole inside the frame.
 * ========================================================================================== */
const CANE = ['#5E4A24', '#8C7436', '#B59A50', '#D2BC78', '#E6D7A4'];
function bamboo(ctx, R, v) {
  const L = v.len, sp = makeSpine(L, 80, (s) => v.lean * s + v.curve * Math.sin(s * PI)), at = (s) => sp.at(s);
  const w0 = L * 0.0185, w1 = L * 0.011, W = (s) => lerp(w0, w1, s) * (1 - 0.86 * smoothstep(0.8, 1, s));        // it thins to a growing tip: nothing is cut off in mid-air
  const cane = (f) => { const a = [], b = []; for (let i = 0; i <= 60; i++) { const p = sp.at(i / 60), w = W(i / 60) * f * (1 + 0.025 * Math.sin(i * 1.7)); a.push([p.x - p.nx * w, p.y - p.ny * w]); b.push([p.x + p.nx * w, p.y + p.ny * w]); } poly(ctx, [...a, ...b.reverse()]); };
  const joints = Array.from({ length: v.joints }, (_, i) => Math.pow((i + 0.6) / (v.joints + 0.75), 0.9));
  // --- the leaf sprays that sit behind the cane go down first ---
  const leaf = (x, y, a, len, t, tone) => {
    const bend = R.range(-0.25, 0.25), tip = [x + Math.sin(a + bend) * len, y - Math.cos(a + bend) * len], c = [x + Math.sin(a) * len * 0.5, y - Math.cos(a) * len * 0.5];
    const mid = quadPts([x, y], c, tip, 10), up = [], dn = [], w = len * R.range(0.062, 0.085);
    mid.forEach((p, i) => {
      const f = i / 10, p0 = mid[Math.max(0, i - 1)], p1 = mid[Math.min(10, i + 1)];
      let nx = -(p1[1] - p0[1]), ny = p1[0] - p0[0]; const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
      const ww = w * (2.6 * Math.pow(f, 0.45) * Math.pow(1 - f, 1.15) + 0.25 * Math.pow(1 - f, 4));
      up.push([p[0] + nx * ww, p[1] + ny * ww]); dn.push([p[0] - nx * ww, p[1] - ny * ww]);
    });
    const st = [t[0], mix(t[0], t[1], 0.5), t[1], mix(t[1], t[2], 0.5), t[2], mix(t[2], t[3], 0.5), t[3], t[4]], idx = clamp(Math.round(3.4 + tone * 2.2), 1, 6);
    poly(ctx, [...up, ...dn.slice().reverse()]); ctx.fillStyle = st[idx]; ctx.fill();
    poly(ctx, [...mid, ...dn.slice().reverse()]); ctx.fillStyle = st[idx - 1]; ctx.fill();
    if (R.chance(0.55)) { ctx.beginPath(); dab(ctx, R, mid.slice(1, 10).map((p, i) => [lerp(p[0], up[i + 1][0], 0.5), lerp(p[1], up[i + 1][1], 0.5)]), w * 0.36, 0.5, 0.7, 0.3); ctx.fillStyle = st[Math.min(7, idx + 2)]; ctx.fill(); }
  };
  const spray = (s, sg, back, up = 0) => {
    const p = sp.at(s), a = p.ang + (up ? up : sg * R.range(0.5, 0.78)), tw = L * R.range(0.045, 0.065), x0 = p.x + sg * p.nx * W(s) * 0.6, y0 = p.y + sg * p.ny * W(s) * 0.6;
    const e = [x0 + Math.sin(a) * tw, y0 - Math.cos(a) * tw];
    taper(ctx, quadPts([x0, y0], [x0 + Math.sin(a - sg * 0.3) * tw * 0.5, y0 - Math.cos(a - sg * 0.3) * tw * 0.5], e, 6), L * 0.0045, L * 0.0025); ctx.fillStyle = CANE[1]; ctx.fill();
    const n = R.int(6, 8), t = back ? v.ramps[1] : v.ramps[0];
    Array.from({ length: n }, (_, i) => ({ a: a + ((i + 0.5) / n - 0.5) * 1.35 - sg * 0.1 + R.range(-0.1, 0.1), len: L * R.range(0.095, 0.135) * (1 - 0.35 * Math.abs((i + 0.5) / n - 0.5)), q: R.range(0.4, 1), tone: R.range(-1, 1) }))
      .sort((m, o) => m.len - o.len).forEach((lf) => leaf(lerp(x0, e[0], lf.q), lerp(y0, e[1], lf.q), lf.a, lf.len, t, lf.tone + (back ? -0.2 : 0.15)));
  };
  const first = v.joints - v.sprays;
  joints.forEach((s, i) => { if (i >= first && i % 3 === 1) spray(s, i % 2 ? 1 : -1, true); });
  // --- the cane ---
  spray(0.965, 1, true, -0.16);                                           // the tip ends in leaves
  cane(1); ctx.fillStyle = CANE[2]; ctx.fill();
  ctx.save(); cane(1.05); ctx.clip();
  const shade = [], deep = [], light = [], high = [], rings = [], lips = [];
  const ends = [0, ...joints, 1];
  for (let i = 0; i < ends.length - 1; i++) {                              // between two joints: long strokes that stop short of both
    const a = ends[i] + 0.006, b = ends[i + 1] - 0.006, run = (f, k0 = 0, k1 = 1) => trail(at, lerp(a, b, k0), lerp(a, b, k1), 8, (k) => W(lerp(a, b, lerp(k0, k1, k))) * f);
    shade.push({ p: run(R.range(0.45, 0.6), R.range(0, 0.1), 1), w: W(a) * 0.5, d: 0.25, l: 0.2, g: 0.2 });
    deep.push({ p: run(R.range(0.8, 0.9), 0, R.range(0.85, 1)), w: W(a) * 0.2, d: 0.3, l: 0.2, g: 0.25 });
    light.push({ p: run(R.range(-0.5, -0.3), R.range(0, 0.15), R.range(0.8, 1)), w: W(a) * 0.34, d: 0.5, l: 0.3, g: 0.35 });
    if (R.chance(0.7)) high.push({ p: run(R.range(-0.6, -0.45), R.range(0.1, 0.3), R.range(0.6, 0.9)), w: W(a) * 0.13, d: 0.6, l: 0.4, g: 0.4 });
  }
  for (const s of joints) {                                                // the joints: a dark ring, a pale lip just above it
    const p = sp.at(s), w = W(s) * 1.1, q = sp.at(s + 0.006);
    rings.push({ p: quadPts([p.x - p.nx * w, p.y - p.ny * w], [p.x + p.tx * w * 0.35, p.y + p.ty * w * 0.35], [p.x + p.nx * w, p.y + p.ny * w], 6), w: Math.max(1.2, w0 * 0.13), d: 0.1, l: 0.2, g: 0.2 });
    lips.push({ p: quadPts([q.x - q.nx * w, q.y - q.ny * w], [q.x + q.tx * w * 0.35, q.y + q.ty * w * 0.35], [q.x + q.nx * w * 0.2, q.y + q.ny * w * 0.2], 6), w: Math.max(1, w0 * 0.1), d: 0.3, l: 0.5, g: 0.3 });
  }
  lay(ctx, R, [CANE[1]], shade, 1, 0.4); lay(ctx, R, [CANE[0]], deep, 0.9);
  lay(ctx, R, [CANE[3]], light, 1, 0.35); lay(ctx, R, [CANE[4]], high);
  lay(ctx, R, [mix(CANE[0], NIGHT, 0.3)], rings); lay(ctx, R, [CANE[4]], lips);
  ctx.restore();
  joints.forEach((s, i) => { if (i >= first && i % 3 !== 1) spray(s, i % 2 ? 1 : -1, false); });
  spray(0.985, -1, false, 0.2);
  const hull = [0.1, 0.3, 0.5].map((s) => { const p = sp.at(s); return [p.x, -p.y, w0 * 2]; });
  joints.forEach((s, i) => { if (i >= first) { const p = sp.at(s); hull.push([p.x + (i % 2 ? 1 : -1) * L * 0.07, -(p.y - L * 0.06), L * 0.1]); } });
  return { len: L, hull };
}

/* ============================================================================================
 * The atlas: where every sprite lives. `x,y,w,h` is its cell (px), `pu` the pivot's position
 * across the cell (0..1). Cells are padded so blurred copies do not bleed into their neighbours.
 * In a draw call, `s.up` is the room above the pivot (px): lengths are given as a share of it.
 *
 * The set is cast for range, so that a dense overlap reads as layers: deep and shadowy (bananaC,
 * monsteraA, alocasiaA, frondC, cycadA), mid olive (bananaA, bananaD, monsteraB, frondD), light
 * (bananaB, fanA, frondB, calatheaB, the furled leaf) and a few teals (the bird of paradise
 * leaves, frondA, calatheaA).
 * ========================================================================================== */
const PAD = 36;

export const SPRITES = [
  /* ---- foliage atlas, row 1: banana, bird-of-paradise leaves, palm fronds, the banana bunch ---- */
  { id: 'bananaA', atlas: 'foliage', x: 0, y: 0, w: 448, h: 1024, pu: 0.46, seed: 11,
    draw: (c, R, s) => banana(c, R, { len: s.up, stalk: 0.14, wide: 0.2, lean: 0.1, curl: 0.16, sideW: [0.92, 1], fold: -0.55, tears: [5, 4], ramp: RAMP.olive }) },
  { id: 'bananaB', atlas: 'foliage', x: 448, y: 0, w: 448, h: 1024, pu: 0.55, seed: 23,
    draw: (c, R, s) => banana(c, R, { len: s.up, stalk: 0.12, wide: 0.205, lean: -0.16, curl: -0.1, sideW: [1, 0.88], fold: 0.45, tears: [3, 3], ramp: RAMP.young, light: 1.1 }) },
  { id: 'bananaC', atlas: 'foliage', x: 896, y: 0, w: 448, h: 1024, pu: 0.4, seed: 37,
    draw: (c, R, s) => banana(c, R, { len: s.up * 0.98, stalk: 0.16, wide: 0.19, lean: 0.05, curl: 0.42, sideW: [0.8, 1], fold: -0.6, tears: [6, 5], ramp: RAMP.forest, light: 0.8, rib: BONE }) },
  { id: 'bopLeafA', atlas: 'foliage', x: 1344, y: 0, w: 352, h: 1024, pu: 0.47, seed: 41,
    draw: (c, R, s) => bopLeaf(c, R, { len: s.up, stalk: 0.5, wide: 0.235, lean: 0.06, curl: 0.12, sideW: [0.74, 1], fold: -0.6, tears: 1, ramp: RAMP.teal }) },
  { id: 'bopLeafB', atlas: 'foliage', x: 1696, y: 0, w: 352, h: 1024, pu: 0.55, seed: 53,
    draw: (c, R, s) => bopLeaf(c, R, { len: s.up * 0.97, stalk: 0.56, wide: 0.25, lean: -0.1, curl: -0.1, sideW: [1, 0.7], fold: 0.5, tears: 2, ramp: RAMP.pine, light: 1 }) },
  { id: 'frondA', atlas: 'foliage', x: 2048, y: 0, w: 480, h: 1024, pu: 0.5333, seed: 61,   // upright: the deep teal-green frond of the wallpaper
    draw: (c, R, s) => frond(c, R, { len: s.up * 0.99, lean0: -0.12, arc: 0.5, arcPow: 1.7, n: 31, maxLeaf: 228, leafW: 0.05, splay: [64, 20], droop: 0.32, grav: [0, 1], backScale: 0.92, ramp: RAMP.pine }) },
  { id: 'frondB', atlas: 'foliage', x: 2528, y: 0, w: 448, h: 1024, pu: 0.4714, seed: 73,   // reaching sideways (gravity = sprite's right): the light olive one
    draw: (c, R, s) => frond(c, R, { len: s.up * 1.02, lean0: -0.26, arc: 1.25, arcPow: 1.7, n: 32, maxLeaf: 222, leafW: 0.05, splay: [66, 22], droop: 0.42, grav: [1, 0], backScale: 0.8, ramp: RAMP.khaki, back: 0.6, lift: 0.4 }) },
  { id: 'frondD', atlas: 'foliage', x: 2976, y: 0, w: 448, h: 1024, pu: 0.66, seed: 89,     // hanging: gravity = toward its own tip
    draw: (c, R, s) => frond(c, R, { len: s.up * 0.93, lean0: -0.2, arc: 0.62, arcPow: 1.4, n: 31, maxLeaf: 250, leafW: 0.046, splay: [56, 15], droop: 0.5, grav: [0.25, -0.97], backScale: 0.94, ramp: RAMP.moss }) },
  { id: 'bananaBunch', atlas: 'foliage', x: 3424, y: 0, w: 576, h: 1024, pu: 0.5, seed: 241,   // HANGS (turn it upside down)
    draw: (c, R, s) => bananaBunch(c, R, { len: s.up * 0.96, lean: 0.03, curl: -0.07, hands: 4, from: 0.24, to: 0.64, finger: 0.37, spread: 56, turn: 0.4 }) },
  { id: 'bopSepalA', atlas: 'foliage', x: 4000, y: 0, w: 96, h: 340, pu: 0.5, pad: 12, seed: 151,
    draw: (c, R, s) => bopSepal(c, R, { len: s.up, wide: 0.07, curl: 0.12 }) },
  { id: 'bopSepalB', atlas: 'foliage', x: 4000, y: 340, w: 96, h: 340, pu: 0.5, pad: 12, seed: 157,
    draw: (c, R, s) => bopSepal(c, R, { len: s.up * 0.96, wide: 0.062, curl: -0.16 }) },
  { id: 'bopPetal', atlas: 'foliage', x: 4000, y: 680, w: 96, h: 344, pu: 0.5, pad: 12, seed: 163,
    draw: (c, R, s) => bopPetal(c, R, { len: s.up, curl: 0.05 }) },
  /* ---- foliage atlas, row 2: more palm, monstera, the flowers, the banana blossom ---- */
  { id: 'frondC', atlas: 'foliage', x: 0, y: 1024, w: 576, h: 1024, pu: 0.33, seed: 97,  // strongly arched over
    draw: (c, R, s) => frond(c, R, { len: s.up * 1.06, lean0: -0.3, arc: 1.75, arcPow: 1.5, n: 33, maxLeaf: 208, leafW: 0.05, splay: [64, 22], droop: 0.5, grav: [0.94, 0.34], backScale: 0.74, ramp: RAMP.forest }) },
  { id: 'fanA', atlas: 'foliage', x: 576, y: 1024, w: 720, h: 1024, pu: 0.4667, seed: 103,   // the pale sage fan of the wallpaper
    draw: (c, R, s) => fanPalm(c, R, { stalk: s.up - 348, radius: 344, lean: 0.06, n: 22, span: 262 * DEG, fused: 0.56, round: 0.74, sag: 0.1, ramp: RAMP.sage }) },
  { id: 'fanB', atlas: 'foliage', x: 1296, y: 1024, w: 656, h: 1024, pu: 0.5854, seed: 113,
    draw: (c, R, s) => fanPalm(c, R, { stalk: s.up - 340, radius: 338, lean: -0.1, n: 17, span: 218 * DEG, fused: 0.4, round: 0.68, sag: 0.2, ramp: RAMP.olive }) },
  { id: 'monsteraA', atlas: 'foliage', x: 1952, y: 1024, w: 640, h: 1024, pu: 0.5, seed: 127,
    draw: (c, R, s) => monstera(c, R, { len: s.up, stalk: 0.4, lean: 0.05, curl: 0.1, slits: 5, sideW: [0.95, 1], fold: -0.5, ramp: RAMP.forest, light: 1.15 }) },
  { id: 'monsteraB', atlas: 'foliage', x: 2592, y: 1024, w: 576, h: 1024, pu: 0.5556, seed: 131,
    draw: (c, R, s) => monstera(c, R, { len: s.up * 0.97, stalk: 0.42, lean: -0.08, curl: -0.12, slits: 4, sideW: [1, 0.9], fold: 0.45, ramp: RAMP.moss, light: 1 }) },
  { id: 'heliconia', atlas: 'foliage', x: 3168, y: 1024, w: 208, h: 1024, pu: 0.5, pad: 14, seed: 139,
    draw: (c, R, s) => heliconia(c, R, { len: s.up * 0.8, lean: 0.05, bracts: 8 }) },
  { id: 'bopStalk', atlas: 'foliage', x: 3376, y: 1024, w: 272, h: 1024, pu: 0.13, pad: 14, seed: 149,
    draw: (c, R, s) => bopStalk(c, R, { len: s.up * 0.97, lean: 0.03, curl: -0.09, nod: 0.8, beak: 77, spathe: 0.172 }) },
  { id: 'bananaBlossom', atlas: 'foliage', x: 3648, y: 1024, w: 448, h: 1024, pu: 0.516, seed: 251,   // HANGS (turn it upside down)
    draw: (c, R, s) => bananaBlossom(c, R, { len: s.up, stalk: 0.6, wide: 0.22, lean: -0.16, curl: 0.3, open: 2 }) },
  /* ---- foliage atlas, row 3: the rest of the cast ---- */
  { id: 'bananaD', atlas: 'foliage', x: 0, y: 2048, w: 576, h: 1024, pu: 0.1956, seed: 167,          // seen from the side, arching right over, the near half hanging
    draw: (c, R, s) => banana(c, R, { len: s.up * 1.17, stalk: 0.15, wide: 0.225, lean: 0.3, curl: 1.15, sideW: [0.26, 1], fold: -0.7, tears: [2, 9], ramp: RAMP.moss }) },
  { id: 'alocasiaA', atlas: 'foliage', x: 576, y: 2048, w: 640, h: 1024, pu: 0.45, seed: 173,     // dark, scalloped, cream-veined
    draw: (c, R, s) => alocasia(c, R, { len: s.up, stalk: 0.25, wide: 0.37, lobe: 1, scallop: 0.075, lean: 0.1, curl: 0.06, tilt: 0.08, sideW: [0.95, 1], fold: -0.55, veinW: 0.011,
                                        ramp: RAMP.forest, vein: CREAM, light: 0.85 }) },
  { id: 'alocasiaB', atlas: 'foliage', x: 1216, y: 2048, w: 640, h: 1024, pu: 0.55, seed: 179,    // giant taro: big, soft, mid green
    draw: (c, R, s) => alocasia(c, R, { len: s.up * 0.98, stalk: 0.22, wide: 0.385, lobe: 0.25, scallop: 0.02, lean: -0.12, curl: -0.05, tilt: -0.1, sideW: [1, 0.93], fold: 0.45, veinW: 0.0085,
                                        ramp: RAMP.olive, vein: mix(CREAM, RAMP.olive[4], 0.35) }) },
  { id: 'calatheaA', atlas: 'foliage', x: 1856, y: 2048, w: 400, h: 1024, pu: 0.445, seed: 181,    // pale feather stripes on deep blue-green
    draw: (c, R, s) => calathea(c, R, { len: s.up, stalk: 0.36, wide: 0.265, lean: 0.07, curl: 0.1, sideW: [0.95, 1], fold: -0.5, marks: 12, pattern: 'stripes',
                                        ramp: RAMP.teal, mark: [RAMP.sage[3], RAMP.sage[4]] }) },
  { id: 'calatheaB', atlas: 'foliage', x: 2256, y: 2048, w: 352, h: 1024, pu: 0.6136, seed: 191,    // rattlesnake: dark ovals on a pale leaf, wavy edge
    draw: (c, R, s) => calathea(c, R, { len: s.up * 0.97, stalk: 0.3, wide: 0.19, lean: -0.08, curl: -0.14, sideW: [1, 0.94], fold: -0.35, marks: 13, pattern: 'spots',
                                        ramp: RAMP.khaki, mark: [RAMP.forest[1], RAMP.forest[3]] }) },
  { id: 'bananaFurl', atlas: 'foliage', x: 2608, y: 2048, w: 224, h: 1024, pu: 0.5, seed: 193,
    draw: (c, R, s) => bananaFurl(c, R, { len: s.up, stalk: 0.3, wide: 0.058, lean: 0.03, curl: 0.09, turns: 3 }) },
  { id: 'cycadA', atlas: 'foliage', x: 2832, y: 2048, w: 368, h: 1024, pu: 0.5478, seed: 197,       // stiff, fine, dark
    draw: (c, R, s) => frond(c, R, { len: s.up, lean0: -0.1, arc: 0.42, arcPow: 1.8, n: 36, from: 0.13, maxLeaf: 140, leafW: 0.058, minW: 3, splay: [72, 40], droop: 0.06, grav: [0, 1], backScale: 0.94, ramp: RAMP.forest, touch: 0.35,
                                     env: (t) => lerp(0.5, 1, smoothstep(0, 0.18, t)) * lerp(1, 0.22, Math.pow(smoothstep(0.5, 1, t), 1.6)) }) },
  { id: 'lianaA', atlas: 'foliage', x: 3200, y: 2048, w: 320, h: 1024, pu: 0.422, seed: 199,       // HANGS
    draw: (c, R, s) => liana(c, R, { len: s.up, leaves: 13, leaf: 104, sway: 0.5, waves: 2.4, ramp: RAMP.olive }) },
  { id: 'trunkA', atlas: 'foliage', x: 3520, y: 2048, w: 224, h: 1024, pu: 0.45, pad: 14, seed: 233,   // a palm trunk with its crown out of shot
    draw: (c, R, s) => trunk(c, R, { height: s.up, lean: 0.035, curve: 0.05 }) },
  { id: 'monkey', atlas: 'foliage', x: 3744, y: 2048, w: 352, h: 1024, pu: 0.64, seed: MONKEY_SEED,        // HANGS by one hand (turn it upside down). (This cell held the bamboo cane, which no picture used: bamboo() above still paints one)
    draw: (c, R, s) => monkey(c, R, { len: Math.min(s.up * 0.97, s.left / 0.275, s.right / 0.125) }) },
  /* ---- tree atlas: whole palms ---- */
  { id: 'treeA', atlas: 'trees', x: 0, y: 0, w: 512, h: 1024, pu: 0.39, seed: 211,
    draw: (c, R, s) => palmTree(c, R, { height: s.up - 190, lean: 0.12, curve: 0.08, fronds: 13, frond: 205, nuts: 4, ramps: [RAMP.olive, RAMP.forest] }) },
  { id: 'treeB', atlas: 'trees', x: 512, y: 0, w: 512, h: 1024, pu: 0.67, seed: 223,
    draw: (c, R, s) => palmTree(c, R, { height: s.up - 215, lean: -0.15, curve: -0.1, fronds: 12, frond: 210, nuts: 3, ramps: [RAMP.pine, RAMP.forest] }) },
  { id: 'treeC', atlas: 'trees', x: 1024, y: 0, w: 512, h: 1024, pu: 0.4, seed: 227,
    draw: (c, R, s) => palmTree(c, R, { height: s.up - 180, lean: 0.03, curve: 0.17, fronds: 11, frond: 195, nuts: 5, ramps: [RAMP.moss, RAMP.olive] }) },
];

export const ATLAS_SIZE = { foliage: [4096, 3072], trees: [1536, 1024] };
export const BLUR_DIV = 8;        // the pre-blurred copy of each atlas is this many times smaller
export const CARD_ROWS = 12;      // each leaf card is this many rows of quads, root to tip


/**
 * Draw every sprite and pack them into the atlases.
 * @param {number} scale  1 = full size (4096px wide); 0.5 halves every dimension for small GPUs
 * @returns {{ canvases, blurs, sprites, outline }}
 *   canvases.foliage / .trees   the sharp atlases (2D canvases)
 *   blurs.foliage / .trees      { data, width, height }: small pre-blurred copies (see softCopy)
 *   sprites[id] = { index, atlas, uv:[u0,v0,du,dv], aspect (w/h of the cell), pivot:[u,v], len (fraction
 *                   of cell height), hull:[[x,y,r]…] in units of `len`, …extras from the draw function }
 *   outline     { data, width, height }: for every sprite, how far the drawing reaches left and right
 *               at each row of its card, so the GPU only shades where there is actually leaf
 */
export function buildAtlases(scale = 1) {
  const canvases = {}, ctxs = {}, sprites = {}, blurs = {};
  for (const [name, [w, h]] of Object.entries(ATLAS_SIZE)) {
    const c = document.createElement('canvas');
    c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    canvases[name] = c; ctxs[name] = c.getContext('2d');
  }
  const scratch = document.createElement('canvas');
  const sctx = scratch.getContext('2d');
  SPRITES.forEach((s, index) => {
    const pad = s.pad ?? PAD;
    scratch.width = Math.round(s.w * scale); scratch.height = Math.round(s.h * scale);
    const px = s.w * s.pu, py = s.h - pad;                      // pivot inside the cell
    sctx.setTransform(scale, 0, 0, scale, px * scale, py * scale);
    const space = { up: s.h - pad * 2, left: px - pad, right: s.w - px - pad };
    const info = s.draw(sctx, rng(s.seed), space);
    const [aw, ah] = ATLAS_SIZE[s.atlas];
    ctxs[s.atlas].drawImage(scratch, Math.round(s.x * scale), Math.round(s.y * scale));
    const { len, hull, ...extra } = info;
    sprites[s.id] = {
      id: s.id, index, atlas: s.atlas,
      uv: [s.x / aw, 1 - (s.y + s.h) / ah, s.w / aw, s.h / ah],
      aspect: s.w / s.h, pivot: [s.pu, pad / s.h], len: len / s.h,
      hull: hull.map(([x, y, r]) => [x / len, y / len, r / len]),
      ...normaliseExtras(extra, len),
    };
  });
  scratch.width = scratch.height = 0;

  // one small copy of each atlas does two jobs: it tells us where each drawing actually is
  // (the outline table), and, blurred, it is what out-of-focus leaves are painted with
  const W = CARD_ROWS + 2, outline = { data: new Uint8Array(W * SPRITES.length * 4), width: W, height: SPRITES.length };
  for (const name of Object.keys(canvases)) {
    const small = shrink(canvases[name], BLUR_DIV);
    SPRITES.forEach((s, i) => { if (s.atlas === name) outline.data.set(outlineOf(small, s, scale / BLUR_DIV), i * W * 4); });
    blurs[name] = softCopy(small);
  }
  return { canvases, blurs, sprites, outline };
}

/* positions returned by a draw function (px) → units of that sprite's own length */
function normaliseExtras(extra, len) {
  const out = { ...extra };
  if (extra.head) out.head = extra.head.map((v) => v / len);
  if (extra.crown) out.crown = extra.crown.map((v) => v / len);
  if (extra.tail) out.tail = extra.tail.map((v) => v / len);
  if (extra.crownR) out.crownR = extra.crownR / len;
  if (extra.spathe) out.spathe = extra.spathe / len;
  return out;
}

/** a clean 1/div copy of a canvas (halved repeatedly), as RGBA bytes, top row first */
function shrink(canvas, div) {
  let src = canvas, w = canvas.width, h = canvas.height;
  for (let d = div; d > 1; d /= 2) {
    const c = document.createElement('canvas');
    w = Math.max(1, w >> 1); h = Math.max(1, h >> 1);
    c.width = w; c.height = h;
    const cx = c.getContext('2d', { willReadFrequently: d <= 2 });
    cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
    cx.drawImage(src, 0, 0, w, h);
    src = c;
  }
  return { data: src.getContext('2d').getImageData(0, 0, w, h).data, width: w, height: h };
}

/**
 * Where one sprite's drawing sits inside its cell, as one row of the outline table:
 * CARD_ROWS + 1 texels of [left, right] (0..255 across the cell) from the bottom of the drawing to
 * its top, then one texel of [bottom, top]. A margin is left all round for anti-aliasing and blur.
 */
function outlineOf(small, s, k) {
  const x0 = Math.floor(s.x * k), x1 = Math.ceil((s.x + s.w) * k), y0 = Math.floor(s.y * k), y1 = Math.ceil((s.y + s.h) * k);
  const cw = x1 - x0, ch = y1 - y0, lo = new Int32Array(ch).fill(1e6), hi = new Int32Array(ch).fill(-1);
  let top = -1, bottom = -1;                                     // rows (from the top of the cell) that hold any ink
  for (let y = 0; y < ch; y++) {
    const row = ((y0 + y) * small.width + x0) * 4 + 3;
    for (let x = 0; x < cw; x++) if (small.data[row + x * 4] > 0) { if (x < lo[y]) lo[y] = x; hi[y] = x + 1; }
    if (hi[y] >= 0) { if (top < 0) top = y; bottom = y + 1; }
  }
  const out = new Uint8Array((CARD_ROWS + 2) * 4);
  if (top < 0) return out;
  const mx = 26 * k, my = 22 * k;                                // margins: 26 and 22 px of the full-size drawing, in small-copy px
  const vb = Math.max(0, ch - bottom - my), vt = Math.min(ch, ch - top + my);     // crop, measured up from the cell's bottom edge
  const band = (a, b) => {                                       // widest reach of the drawing between two heights
    let l = 1e6, r = -1;
    for (let y = Math.max(0, Math.floor(ch - b)); y < Math.min(ch, Math.ceil(ch - a)); y++) if (hi[y] >= 0) { l = Math.min(l, lo[y]); r = Math.max(r, hi[y]); }
    return [l, r];
  };
  const bands = [];
  for (let j = 0; j < CARD_ROWS; j++) bands.push(band(lerp(vb, vt, j / CARD_ROWS) - my * 0.5, lerp(vb, vt, (j + 1) / CARD_ROWS) + my * 0.5));
  for (let j = 0; j <= CARD_ROWS; j++) {
    const a = bands[Math.max(0, j - 1)], b = bands[Math.min(CARD_ROWS - 1, j)];
    let l = Math.min(a[0], b[0]), r = Math.max(a[1], b[1]);
    if (r < 0) { l = cw * s.pu; r = l; }                         // nothing drawn at this height: collapse onto the pivot line
    out[j * 4] = Math.floor(clamp((l - mx) / cw) * 255); out[j * 4 + 1] = Math.ceil(clamp((r + mx) / cw) * 255); out[j * 4 + 3] = 255;
  }
  out[(CARD_ROWS + 1) * 4] = Math.floor((vb / ch) * 255); out[(CARD_ROWS + 1) * 4 + 1] = Math.ceil((vt / ch) * 255); out[(CARD_ROWS + 1) * 4 + 3] = 255;
  return out;
}

/**
 * Blur a small copy (soft Gaussian, done in premultiplied alpha so edges do not pick up dark halos).
 * Returns raw RGBA bytes, bottom row first, ready to be a GL texture.
 */
function softCopy(small) {
  const w = small.width, h = small.height, img = small.data;
  let a = new Float32Array(w * h * 4), b = new Float32Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const al = img[i * 4 + 3] / 255;
    a[i * 4] = img[i * 4] * al; a[i * 4 + 1] = img[i * 4 + 1] * al; a[i * 4 + 2] = img[i * 4 + 2] * al; a[i * 4 + 3] = img[i * 4 + 3];
  }
  const r = 2, win = r * 2 + 1;
  const pass = (src2, dst, horizontal) => {
    const outer = horizontal ? h : w, inner = horizontal ? w : h, step = horizontal ? 4 : w * 4;
    for (let o = 0; o < outer; o++) {
      const base = horizontal ? o * w * 4 : o * 4;
      for (let ch = 0; ch < 4; ch++) {
        let sum = 0;
        for (let k = -r; k <= r; k++) sum += src2[base + clamp(k, 0, inner - 1) * step + ch];
        for (let i = 0; i < inner; i++) {
          dst[base + i * step + ch] = sum / win;
          sum += src2[base + Math.min(inner - 1, i + r + 1) * step + ch] - src2[base + Math.max(0, i - r) * step + ch];
        }
      }
    }
  };
  for (let n = 0; n < 3; n++) { pass(a, b, true); pass(b, a, false); }   // 3 box blurs ≈ Gaussian
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const srcRow = (h - 1 - y) * w * 4, dstRow = y * w * 4;                // flip: GL wants the bottom row first
    for (let i = 0; i < w * 4; i++) out[dstRow + i] = Math.round(a[srcRow + i]);
  }
  return { data: out, width: w, height: h };
}

/* ============================================================================================
 * PAPEL PICADO — the cut tissue-paper flags strung over a Mexican party. Three designs, drawn in
 * plain white so the scene can dye each flag one of the six palette colours. Only geometric
 * cut-outs (flowers, suns, diamonds): no hearts, doves or bells.
 * In the wallpaper they are PAINTED paper: one flat matte coat, a little uneven where the brush
 * went over it twice or ran dry (never a gradient), a folded hem one flat step darker.
 * ========================================================================================== */
export const PAPER = { cell: [256, 352], count: 3, pad: 10 };

export function buildPaper(scale = 1) {
  const [cw, ch] = PAPER.cell, pad = PAPER.pad;
  const c = document.createElement('canvas');
  c.width = Math.round(cw * PAPER.count * scale); c.height = Math.round(ch * scale);
  const ctx = c.getContext('2d');
  const w = cw - pad * 2, h = ch - pad * 2;
  const punch = (fn) => { ctx.beginPath(); fn(); ctx.fill(); };
  const diamond = (x, y, rx, ry) => { ctx.moveTo(x, y - ry); ctx.lineTo(x + rx, y); ctx.lineTo(x, y + ry); ctx.lineTo(x - rx, y); ctx.closePath(); };
  const dot = (x, y, r) => { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, PI * 2); };
  const petal = (x, y, a, r0, r1, wd) => {                       // a pointed oval radiating from (x, y)
    const [dx, dy] = dir(a), nx = -dy, ny = dx, m = (r0 + r1) / 2;
    ctx.moveTo(x + dx * r0, y + dy * r0);
    ctx.quadraticCurveTo(x + dx * m + nx * wd, y + dy * m + ny * wd, x + dx * r1, y + dy * r1);
    ctx.quadraticCurveTo(x + dx * m - nx * wd, y + dy * m - ny * wd, x + dx * r0, y + dy * r0);
  };
  for (let d = 0; d < PAPER.count; d++) {
    ctx.setTransform(scale, 0, 0, scale, (d * cw + pad) * scale, pad * scale);
    ctx.globalCompositeOperation = 'source-over';
    // the sheet: straight top (folded over the string), shaped bottom edge
    const n = d === 1 ? 6 : 5, sw = w / n, drop = d === 1 ? 30 : 26, R = rng(881 + d * 7);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, 0); ctx.lineTo(w, h - drop);
    for (let i = n - 1; i >= 0; i--) {
      if (d === 1) { ctx.lineTo((i + 0.5) * sw, h); ctx.lineTo(i * sw, h - drop); }      // zig-zag
      else ctx.quadraticCurveTo((i + 0.5) * sw, h + drop * 0.9, i * sw, h - drop);      // scallops
    }
    ctx.closePath();
    ctx.fillStyle = '#F1F1F1'; ctx.fill();                        // one flat coat …
    ctx.save(); ctx.clip();
    // … and the hand in it: broad strokes across the sheet, some a touch fuller, some a touch thinner
    const rows = 9, full = [], thin = [];
    for (let i = 0; i < rows; i++) for (const list of [full, thin]) if (R.chance(list === full ? 0.75 : 0.55)) {
      const y0 = h * (i + R.range(0.1, 0.9)) / rows, tilt = R.range(-5, 5), x0 = R.range(-30, w * 0.35), x1 = R.range(w * 0.6, w + 30);
      list.push({ p: Array.from({ length: 9 }, (_, k) => [lerp(x0, x1, k / 8), y0 + tilt * (k / 8) + 2 * Math.sin(k * 1.3 + i)]), w: (h / rows) * R.range(0.32, 0.6), d: list === full ? 0.3 : 0.5, l: 0.35, g: 0.4 });
    }
    lay(ctx, R, ['#FFFFFF'], full, 1, 0.4);
    lay(ctx, R, ['#E2E2E2'], thin, 0.8, 0.3);
    ctx.fillStyle = 'rgba(0,0,0,0.035)';                          // the faintest crease where the stack of tissue was folded for cutting
    ctx.fillRect(w / 2 - 1, 0, 2, h); ctx.fillRect(0, h * 0.5 - 1, w, 2);
    ctx.fillStyle = '#D6D6D6'; ctx.fillRect(0, 0, w, 7);          // the glued hem: two layers of paper, one flat step darker
    ctx.restore();
    // cut-outs
    ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#000';
    const cx = w / 2, cy = h * 0.47;
    for (let i = 0; i < n; i++) punch(() => dot((i + 0.5) * sw, h - drop * (d === 1 ? 0.95 : 0.55), d === 1 ? 6 : 7));
    for (let i = 0; i < 7; i++) punch(() => diamond(w * (i + 0.5) / 7, 26, 9, 9));
    if (d === 0) {                                                // FLOR: an eight-petalled flower in a ring of dots
      for (let i = 0; i < 8; i++) punch(() => petal(cx, cy, i * PI / 4, 22, 84, 21));
      punch(() => dot(cx, cy, 13));
      for (let i = 0; i < 16; i++) { const a = (i + 0.5) * PI / 8; punch(() => dot(cx + Math.sin(a) * 102, cy - Math.cos(a) * 102, 6)); }
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) punch(() => petal(cx + sx * 96, cy + sy * 122, Math.atan2(-sx, sy) , 4, 44, 13));
    } else if (d === 1) {                                         // ROMBOS: a lattice of diamonds
      for (let r = 0; r < 5; r++) for (let q = 0; q < (r % 2 ? 3 : 4); q++) {
        const x = w * ((q + (r % 2 ? 1 : 0.5)) / 4), y = 72 + r * 48;
        punch(() => diamond(x, y, r === 2 ? 25 : 20, r === 2 ? 22 : 18));
      }
      for (let r = 0; r < 4; r++) for (const x of [9, w - 9]) punch(() => diamond(x, 96 + r * 48, 5, 12));
    } else {                                                      // SOL: a sun with long and short rays
      punch(() => dot(cx, cy, 26));
      for (let i = 0; i < 16; i++) punch(() => petal(cx, cy, i * PI / 8, 38, i % 2 ? 74 : 104, i % 2 ? 7 : 10));
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { punch(() => dot(cx + sx * 92, cy + sy * 112, 9)); punch(() => dot(cx + sx * 66, cy + sy * 124, 5)); punch(() => dot(cx + sx * 104, cy + sy * 86, 5)); }
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over';
  return c;
}
