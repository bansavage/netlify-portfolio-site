/* compose.js — the art direction of the frame: which plant goes where.
 *
 * Everything is laid out in plain screen pixels as the frame looks AT REST (x right, y down), one
 * list per depth layer. scene.js then pushes each layer back to its real distance, so when the
 * camera sits in the clearing every leaf lands exactly where it was composed here.
 * The "pass" layers are the exception: they are composed for the FIRST frame, and the camera flies
 * through them.
 *
 * Because it works from the frame size and the measured rectangle of the copy (`F.safe`), the same
 * rules compose a tall phone, a phone on its side and a wide desktop. All randomness is seeded.
 *
 * The frame, top to bottom:
 *   sky      golden, with palm trees standing in a window the canopy leaves open; papel picado
 *            and a string of warm bulbs hang across it
 *   names    on a bed of dark leaves that grows up behind them (never crossed by foliage)
 *   thicket  the lush bottom: banana, fan palm, monstera, fronds, heliconia, and the two birds of
 *            paradise
 */
import { rng, clamp, lerp, hexToVec, PALETTE } from './kit.js';

const PI = Math.PI, DEG = PI / 180;

/* how each kind of plant moves: bend at full gust (radians at the tip) and how late the tip reacts (s) */
const KIND = {
  banana:    { ids: ['bananaA', 'bananaB', 'bananaC'], wind: 0.075, lag: 0.36 },
  bopLeaf:   { ids: ['bopLeafA', 'bopLeafB'], wind: 0.04, lag: 0.2 },
  fan:       { ids: ['fanA', 'fanB'], wind: 0.05, lag: 0.26 },
  monstera:  { ids: ['monsteraA', 'monsteraB'], wind: 0.065, lag: 0.3 },
  frond:     { ids: ['frondA', 'frondB', 'frondC', 'frondD'], wind: 0.11, lag: 0.46 },
  heliconia: { ids: ['heliconia'], wind: 0.04, lag: 0.24 },
  tree:      { ids: ['treeA', 'treeB', 'treeC'], wind: 0.016, lag: 0.7 },
};

/* colour grade per depth layer: rgb multiplier, how strongly it lights up against the sun, variety */
const GRADE = {
  far:   { mul: [0.25, 0.3, 0.17], sun: 0.1, vary: 0.05 },   // palm trees: dark, warm silhouettes on the gold
  wall2: { mul: [0.42, 0.58, 0.45], sun: 0.55, vary: 0.14 },
  wall1: { mul: [0.4, 0.57, 0.42], sun: 0.7, vary: 0.2 },
  bed:   { mul: [0.31, 0.47, 0.34], sun: 0.2, vary: 0.13 },    // the leaves the names sit on: deep, but still leaves
  mid:   { mul: [0.74, 0.9, 0.72], sun: 0.9, vary: 0.18 },
  focal: { mul: [1.0, 1.0, 0.97], sun: 1.0, vary: 0.13 },
  near:  { mul: [0.4, 0.58, 0.43], sun: 0.6, vary: 0.12 },
  pass:  [                                                   // shells the camera flies through, nearest first
    { mul: [0.16, 0.26, 0.21], sun: 0.55, vary: 0.1 },       // against the lens at the start: almost silhouette
    { mul: [0.24, 0.38, 0.29], sun: 0.7, vary: 0.12 },
    { mul: [0.33, 0.5, 0.38], sun: 0.85, vary: 0.14 },
    { mul: [0.42, 0.6, 0.44], sun: 1.0, vary: 0.16 },
    { mul: [0.48, 0.66, 0.48], sun: 1.0, vary: 0.16 },
    { mul: [0.5, 0.68, 0.5], sun: 1.0, vary: 0.16 },
  ],
};

/* papel picado: the six house colours, in the same order as the colour bar under the names */
const FLAG_DYES = ['lima', 'cempasuchil', 'barro', 'buganvilia', 'cobalto', 'olivo'].map((n) => hexToVec(PALETTE[n]));

function tintOf(g, R) {
  const b = 1 + R.range(-g.vary, g.vary), warm = R.range(-g.vary, g.vary) * 0.9;
  return [g.mul[0] * b * (1 + warm), g.mul[1] * b, g.mul[2] * b * (1 - warm)];
}

/* palm fronds are drawn for a particular pull of gravity, so pick the drawing by heading */
function frondFor(a, R) {
  let d = ((a + PI) % (2 * PI) + 2 * PI) % (2 * PI) - PI;       // wrap to -π..π
  const deg = Math.abs(d) / DEG;
  if (deg < 38) return { id: 'frondA', flip: R.sign() };         // upright
  if (deg < 128) return { id: R.chance(0.55) ? 'frondB' : 'frondC', flip: d > 0 ? 1 : -1 };   // reaching sideways, drooping
  return { id: 'frondD', flip: R.sign() };                        // hanging
}

/* does this placement touch any keep-out rectangle? (uses the sprite's hull circles) */
function touches(sp, x, y, len, a, flip, rects, margin) {
  const ca = Math.cos(a), sa = Math.sin(a);
  for (const [hx, hy, hr] of sp.hull) {
    const lx = hx * flip * len, ly = hy * len, r = hr * len + margin;
    const px = x + lx * ca + ly * sa, py = y - (-lx * sa + ly * ca);
    for (const q of rects) {
      const dx = Math.max(q.l - px, 0, px - q.r), dy = Math.max(q.t - py, 0, py - q.b);
      if (dx * dx + dy * dy < r * r) return true;
    }
  }
  return false;
}

/**
 * @param F       frame: { W, H, S (= √(W·H), the size unit), safe: {l,t,r,b} rectangle of the copy in px,
 *                         replay: {l,t,r,b} rectangle of the Replay control (or null) }
 * @param sprites sprite table from plants.js
 * @param TL      timeline cues (seconds) from main.js
 * @param view    { hiddenAfter(x, y, layer) }: the last moment of the camera move at which a point of the
 *                resting frame (px) on that layer is still inside the picture
 */
export function compose(F, sprites, TL, view, seed = 2027) {
  const { W, H, S, safe } = F;
  const L = { far: [], wall2: [], wall1: [], bed: [], mid: [], focal: [], near: [], pass0: [], pass1: [], pass2: [], pass3: [], pass4: [], pass5: [] };
  const cx = (safe.l + safe.r) / 2, cy = (safe.t + safe.b) / 2;
  const portrait = W / H < 0.75, wide = W / H > 1.3;
  const keepOut = [safe];                                   // flower heads get added below
  /* top of the jungle wall behind the names: just above the copy, golden sky over it */
  const skyY = clamp(safe.t - 0.075 * S, 0.07 * H, 0.38 * H);
  /* the window of open sky above the names. Palm trees stand in it; the canopy keeps out of it. */
  const winHalf = (portrait ? 0.26 : 0.21) * W;
  const skyWin = { l: W / 2 - winHalf, r: W / 2 + winHalf, t: -1e5, b: skyY - 0.02 * S };

  /* ---------------------------------------------------------------------------------------------
   * THE FESTOON across the top: papel picado in the six house colours, swagged so its lowest flags
   * hang just clear of the copy, and a string of small warm bulbs that follows the bottom edge of
   * the flags (bulbs only read against the dark leaves there, never against the bright sky).
   * (Worked out first because the palm trees are placed to stand above the flags.)
   * ------------------------------------------------------------------------------------------- */
  let flagH = clamp(0.061 * S, 30, Math.max(60, 0.03 * S)) * (portrait ? 1.1 : 1) * 1.3;
  flagH = Math.max(18, Math.min(flagH, safe.t - 0.06 * S - 0.012 * H));          // a short screen gets smaller flags
  const flagW = flagH / 1.3;
  const flagTop = Math.max(0.012 * H, safe.t - 0.06 * S - flagH);                // where the string is at its lowest, mid-frame (the bulbs under it stay clear of the copy)
  const swag = Math.min(flagTop - 0.012 * H, clamp(0.11 * H, 0.06 * S, 0.16 * S));
  const tiltY = Math.min(0.018 * H, swag * 0.3);
  const a1 = { ax: -0.08 * W, ay: flagTop - swag - tiltY, bx: 1.08 * W, by: flagTop - swag + tiltY, sag: swag, depth: 8.6 };
  const drop = flagH * 1.2;                                                      // the bulbs hang this far below the flags' string
  const a2 = { ax: a1.ax, ay: a1.ay + drop, bx: a1.bx, by: a1.by + drop, sag: swag, depth: 9.2 };
  const nFlags = Math.max(6, Math.floor((a1.bx - a1.ax) / (flagW * 1.13)));
  const RF = rng(seed + 40);
  const flags = Array.from({ length: nFlags }, (_, i) => ({ s: (i + 0.5) / nFlags, seed: RF.f(), design: (i * 2 + (i % 3 === 2 ? 1 : 0)) % 3, dye: FLAG_DYES[i % 6] }));
  const strings = [a1, a2];
  const bulbs = { n: Math.round((a1.bx - a1.ax) / (flagW * 0.58)), size: clamp(0.0042 * S, 2.2, 4.2) };   // size = radius of the lit filament, CSS px

  /** build one placement. p: {x,y (root, px), len (px), a (heading), avoid (px margin or undefined), min (px), rects} */
  const make = (kind, R, g, p) => {
    let id, flip;
    if (kind === 'frond') ({ id, flip } = frondFor(p.a, R));
    else { id = p.id || R.pick(KIND[kind].ids); flip = p.flip || R.sign(); }
    const sp = sprites[id];
    let len = p.len, a = p.a;
    if (p.avoid !== undefined) {
      let ok = false;
      const rects = p.rects || keepOut;
      for (let i = 0; i < 9 && len >= p.min; i++) {
        if (!touches(sp, p.x, p.y, len, a, flip, rects, p.avoid)) { ok = true; break; }
        len *= 0.87;
      }
      if (!ok) return null;
    }
    return { id, x: p.x, y: p.y, len, a, flip, tint: p.tint || tintOf(g, R), sun: p.sun ?? g.sun,
             wind: KIND[kind].wind * (p.wind ?? 1), lag: KIND[kind].lag, seed: R.f(), z: p.z ?? 0 };
  };

  /** which way a leaf has to turn for its tip to move toward the middle of the copy (+1 / -1) */
  const inward = (pl) => {
    const tipX = pl.x + Math.sin(pl.a) * pl.len * 0.8, tipY = pl.y - Math.cos(pl.a) * pl.len * 0.8;
    return { s: Math.sign(Math.cos(pl.a) * (cx - tipX) + Math.sin(pl.a) * (cy - tipY)) || 1, d: Math.hypot(cx - tipX, cy - tipY) / S };
  };
  /** leaves framing the clearing start swung in over it and spring open as the camera arrives */
  const parting = (pl, R, t0, mag) => {
    const { s, d } = inward(pl);
    pl.part = [s * mag * R.range(0.7, 1.2), t0 + d * 0.4 + R.range(0, 0.09)];   // nearest the centre goes first
    return pl;
  };

  /* ---------------------------------------------------------------------------------------------
   * FAR: palm trees against the golden sky. One stands in the middle of the sky window, the rest
   * are spaced out either side of it (and on beyond the frame, for while the camera is pulled back).
   * Crowns sit high so a good length of ringed trunk shows between crown and tree line.
   * ------------------------------------------------------------------------------------------- */
  {
    const R = rng(seed + 1), g = GRADE.far;
    const r0 = clamp(0.37 * flagTop, 0.06 * S, 0.14 * S);     // crown radius of the hero tree on screen, px
    const step = r0 * (portrait ? 1.9 : 2.5), x0 = W * 0.535, xs = [[x0, 0]];
    for (let k = 1; k < 9; k++) for (const sg of [1, -1]) { const x = x0 + sg * k * step; if (x > -0.34 * W && x < 1.34 * W) xs.push([x, k]); }
    xs.forEach(([xc, k], i) => {
      const id = KIND.tree.ids[(i * 2 + 1) % 3], sp = sprites[id], flip = k === 0 ? 1 : R.sign();
      const big = k === 0 ? 1.2 : R.range(0.6, 1.02);
      const len = (r0 * big) / sp.crownR;
      const x = xc + (k === 0 ? 0 : R.range(-0.22, 0.22) * step);
      const crownY = flagTop * (k === 0 ? 0.4 : k % 2 ? R.range(0.5, 0.7) : R.range(0.3, 0.48));   // crowns in the open sky, trunks running down behind the flags
      const depthTone = lerp(1.5, 0.9, clamp((big - 0.6) / 0.6));      // smaller = further = paler in the haze
      L.far.push({ id, x: x - sp.crown[0] * len * flip, y: crownY + sp.crown[1] * len, len, a: R.range(-0.05, 0.05), flip,
                   tint: tintOf(g, R).map((v) => v * depthTone), sun: g.sun, wind: KIND.tree.wind, lag: KIND.tree.lag, seed: R.f(), z: (big - 1) * 12 });
    });
  }

  /* ---------------------------------------------------------------------------------------------
   * THE JUNGLE WALL behind the names: rows of plants, tips of the top row cut the skyline
   * ------------------------------------------------------------------------------------------- */
  const wall = (list, R, g, o) => {
    for (let r = 0; r < o.rows; r++) {
      const topY = o.top + r * o.rowGap * S, dx = o.dx * S * (1 + 0.25 * r);
      for (let x = -0.55 * W + R.range(0, dx); x < 1.55 * W; x += dx * R.range(0.75, 1.25)) {
        const kind = R.pick(o.kinds);
        const len = S * R.range(o.size[0], o.size[1]) * (1 + 0.1 * r);
        const a = kind === 'frond' ? R.range(-1.35, 1.35) : R.range(-0.55, 0.55);
        const tipY = topY + R.range(-0.05, 0.05) * S;
        list.push(make(kind, R, g, { x: x - Math.sin(a) * len * 0.85, y: tipY + Math.cos(a) * len * 0.85, len, a, z: r * 0.7 + R.range(-0.3, 0.3) }));
      }
    }
  };
  wall(L.wall2, rng(seed + 2), GRADE.wall2, { rows: 2, top: skyY + 0.06 * S, rowGap: 0.13, dx: 0.1, size: [0.3, 0.46],
       kinds: ['banana', 'banana', 'frond', 'frond', 'fan', 'bopLeaf'] });
  // (the lower rows of this wall would sit entirely behind the bed and the thicket, so it stops after four)
  wall(L.wall1, rng(seed + 3), GRADE.wall1, { rows: Math.min(4, Math.ceil((H - skyY) / (0.21 * S)) + 1), top: skyY + 0.07 * S, rowGap: 0.21, dx: 0.115, size: [0.32, 0.5],
       kinds: ['banana', 'banana', 'frond', 'fan', 'monstera', 'monstera', 'bopLeaf'] });

  /* ---------------------------------------------------------------------------------------------
   * THE BED: big dark leaves that grow up behind the copy just before the names arrive, so the
   * text ground deepens as foliage, not as a dimmer. Two rows: a tall one whose tips stand up into
   * the gold above the names, and a shorter one in front that fills in underneath.
   * ------------------------------------------------------------------------------------------- */
  {
    const R = rng(seed + 5), g = GRADE.bed;
    const span = (safe.r - safe.l) + 0.34 * S, rootY = Math.min(H + 0.1 * S, safe.b + 0.24 * S);
    const row = (n, tipAt, z, delay, kinds) => {
      for (let i = 0; i < n; i++) {
        const u = ((i + R.range(0.22, 0.78)) / n) * 2 - 1;        // -1 … 1 across the bed
        const [kind, id] = R.pick(kinds);
        const a = u * 0.44 + R.range(-0.09, 0.09);
        const tipX = cx + u * span * 0.5, tipY = tipAt(u);
        const pl = make(kind, R, g, { id, x: tipX - Math.tan(a) * (rootY - tipY), y: rootY, a, len: (rootY - tipY) / Math.cos(a), z });
        const t0 = TL.bed + Math.abs(u) * 0.34 + delay + R.range(0, 0.07);   // the middle rises first, then outward
        pl.grow = [t0, 0.6, 0.28];
        pl.part = [-Math.sign(u || 1) * R.range(0.1, 0.2), t0 + 0.08];       // and they fan apart as they come up
        L.bed.push(pl);
      }
    };
    const tall = [['banana', 'bananaA'], ['banana', 'bananaC'], ['banana', 'bananaC'], ['monstera', 'monsteraA'], ['monstera', 'monsteraB'], ['fan', 'fanB']];
    const low = [['banana', 'bananaA'], ['banana', 'bananaC'], ['monstera', 'monsteraA'], ['monstera', 'monsteraB']];
    row(Math.max(5, Math.round(span / (0.135 * S))), (u) => safe.t - S * (0.04 + 0.035 * (1 - u * u) + R.range(-0.03, 0.04)), -0.6, 0, tall);
    row(Math.max(3, Math.round(span / (0.2 * S))), (u) => lerp(safe.t, safe.b, 0.42) + S * R.range(-0.04, 0.04), 0.6, 0.1, low);
  }

  /* ---------------------------------------------------------------------------------------------
   * HEROES: two bird of paradise plants at the focal plane, flowers facing in toward the names.
   * Each rises on its stalk as the names land, then opens (the sepals are separate parts).
   * ------------------------------------------------------------------------------------------- */
  const crests = [];                                        // the box each open flower fills, for shading what is behind it
  {
    const R = rng(seed + 10), g = GRADE.focal;
    const st = sprites.bopStalk;
    const roomL = safe.l, roomR = W - safe.r, below = H - safe.b;
    const beside = Math.min(roomL, roomR) > 0.2 * S;          // is there room next to the copy? (landscape / desktop)
    const head = (side, k) => {                               // side: -1 = left of the names, +1 = right
      const room = side < 0 ? roomL : roomR;
      if (beside) {
        let sp = clamp(below * 0.5, 0.085 * S, 0.14 * S) * k;  // length of the spathe (the beak) on screen, px
        sp = Math.min(sp * 1.15, (room * 0.6 - 0.025 * S) / 1.05);
        return { x: side < 0 ? room * 0.4 : W - room * 0.4, y: lerp(safe.t, safe.b, side < 0 ? 0.6 : 0.86), face: -side, sp, lean: R.range(0.05, 0.14) };
      }
      // under the copy (phones): big, the left one lower, the right one higher so its stalk passes
      // to the left of the Replay control in the bottom corner
      const sp = Math.min(clamp(below * 0.56, 0.1 * S, 0.165 * S), below / 1.9) * k;   // (a short phone has little room under the copy: the whole flower must still fit)
      let x = side < 0 ? W * 0.165 : W * 0.8, lean = R.range(0.05, 0.12);
      const spare = Math.max(0, below - sp * 1.75);            // what is left below the flower once crest and spathe are in
      const y = safe.b + sp * 1.38 + Math.min(spare * (side < 0 ? 0.75 : 0.12), below * (side < 0 ? 0.13 : 0.02));
      if (side > 0 && F.replay) {                              // further in if the flower head itself is level with the control (short phones)
        x = Math.min(x, F.replay.l - (y + sp * 0.3 > F.replay.t - 6 ? 0.11 : 0.045) * S); lean = 0.17;
      }
      return { x, y, face: -side, sp, lean };
    };
    [head(-1, 1), head(1, 0.88)].forEach((h, n) => {
      const sp = h.sp;
      const len = sp / st.spathe;                                                          // → stalk length
      // lean the stalk a little away from the names, then solve for where the root must be
      const a = -h.face * h.lean;
      const hx = st.head[0] * h.face * len, hy = st.head[1] * len;
      const rootX = h.x - (hx * Math.cos(a) + hy * Math.sin(a)), rootY = h.y + (-hx * Math.sin(a) + hy * Math.cos(a));
      const windSeed = R.f(), wind = 0.035;
      const rise = [TL.stalks + n * 0.22, 0.87, 0.4];                                      // the whole plant comes up together
      const base = { x: rootX, y: rootY, a, flip: h.face, wind, lag: 0.22, seed: windSeed, sun: 0.3, plantLen: len, grow: rise };
      const t0 = TL.bloom + n * TL.bloomGap;
      // sepals fan up out of the top of the spathe; angles are measured back from the beak direction
      const fan = [
        { id: 'bopSepalA', off: 104, len: 0.98, at: 0.2, tint: [0.97, 0.94, 0.95] },
        { id: 'bopSepalB', off: 86, len: 1.12, at: 0.25, tint: [1, 1, 1] },
        { id: 'bopSepalA', off: 70, len: 1.04, at: 0.31, tint: [1.05, 1.03, 0.95] },
        { id: 'bopSepalB', off: 54, len: 0.9, at: 0.37, tint: [1, 0.98, 0.95] },
        { id: 'bopPetal', off: 36, len: 1.0, at: 0.42, tint: [1, 1, 1] },
        { id: 'bopSepalA', off: 20, len: 0.7, at: 0.47, tint: [1, 0.95, 0.9] },
      ];
      fan.forEach((f, j) => {
        const along = st.spathe * len * f.at;
        const px = st.head[0] * len + Math.sin(st.beak) * along, py = st.head[1] * len + Math.cos(st.beak) * along;
        const order = f.id === 'bopPetal' ? fan.length - 1 : j - (j > 4 ? 1 : 0);          // the blue petal opens last
        L.focal.push({ ...base, id: f.id, len: sp * f.len, tint: f.tint, sun: 0, flower: 1, z: 0.3 + j * 0.002, head: [px, py],
                       bloom: [st.beak - f.off * DEG + R.range(-0.04, 0.04), st.beak - 3 * DEG, t0 + order * TL.sepalGap, 0.12] });
      });
      L.focal.push({ ...base, id: 'bopStalk', len, tint: [1.04, 1.04, 1], z: 0.32 });
      const fx = h.x + h.face * sp * 0.3, fy = h.y - sp * 0.5;                              // middle of the crest
      crests.push({ l: fx - sp * 0.5, r: fx + sp * 0.5, t: fy - sp * 0.55, b: fy + sp * 0.35 });
      keepOut.push({ l: h.x - sp * 0.9, r: h.x + sp * 0.9, t: h.y - sp * 1.5, b: h.y + sp * 0.25 });   // nearer layers stay off the flower
      // its own leaves: upright grey-green paddles, a couple behind the flower and a couple in front, lower
      const leaves = 4;
      for (let i = 0; i < leaves; i++) {
        const front = i >= 2;
        const la = a + (i - (leaves - 1) / 2) * R.range(0.2, 0.3) - h.face * 0.12 + R.range(-0.06, 0.06);
        const ll = len * (front ? R.range(0.5, 0.68) : R.range(0.82, 1.12));
        const pl = make('bopLeaf', R, g, { x: rootX + R.range(-0.02, 0.02) * S, y: rootY + R.range(0, 0.03) * S, len: ll, a: la, avoid: 0.022 * S, min: len * 0.35, z: front ? 0.5 : 0.1 + i * 0.01 });
        if (pl) L.focal.push(parting(pl, R, TL.part + 0.25, 0.22));
      }
    });

    /* HELICONIA: a few pink lobster-claws standing in the thicket, clear of the copy and the flowers */
    const Rh = rng(seed + 11), hs = sprites.heliconia, rootY = H + 0.1 * S;
    const spots = beside
      ? [[0.045, 0.74, 0.1], [0.3, 0.86, -0.07], [0.965, 0.6, -0.1], [0.72, 0.87, 0.06]]
      : [[0.045, lerp(safe.t, safe.b, 0.66) / H, 0.05], [0.955, lerp(safe.t, safe.b, 0.4) / H, -0.045], [0.5, (safe.b + 0.34 * below) / H, 0.03]];
    spots.forEach(([fx, fy, lean], i) => {
      const topY = fy * H, x = fx * W;
      const pl = make('heliconia', Rh, g, { id: 'heliconia', flip: lean > 0 ? 1 : -1, x: x - Math.tan(lean) * (rootY - topY), y: rootY, a: lean,
                                            len: (rootY - topY) / Math.cos(lean), avoid: 0.03 * S, min: 0.22 * S, tint: [1, 1, 1], sun: 0, z: 0.26 + i * 0.01 });
      if (!pl) return;
      pl.flower = 1;
      pl.grow = [TL.stalks + 0.3 + i * 0.14, 0.82, 0.35];
      L.focal.push(pl);
    });
  }

  /* ---------------------------------------------------------------------------------------------
   * FRAMES: plants growing in from every edge, layer over layer, never across the copy
   * ------------------------------------------------------------------------------------------- */
  const ring = (name, R, g, o) => {
    const list = L[name], gap = o.gap * S;
    const flowerBlind = [...(o.behind ? [safe] : keepOut), skyWin];   // only what sits in front of a flower must dodge it; everything leaves the sky window open
    // `out` = length hidden outside the frame; the visible reach is added on top of it.
    const add = (kind, x, y, a, out, reachK = 1, rects = flowerBlind, enters = false) => {
      const reach = R.range(o.size[0], o.size[1]) * S * reachK;
      const pl = make(kind, R, g, { x, y, a, len: out + reach, avoid: o.margin * S, min: out + o.min * S, rects,
                                    z: o.behind ? R.range(-1, 0.2) : R.range(-1, 1) });
      if (!pl) return;
      // a leaf that ends up behind a flower drops into shade, so the orange and cobalt sit on deep green
      if (o.behind && touches(sprites[pl.id], pl.x, pl.y, pl.len, pl.a, pl.flip, crests, 0)) {
        pl.tint = pl.tint.map((v) => v * 0.62); pl.sun *= 0.4;
      }
      // On a narrow frame the side leaves stand alone against the sky, and while the camera is still
      // pulled back their cut stalks would be in shot. So they stay away until their root has left
      // the picture, then reach in from the edge: growing, and swinging in from outside.
      const tIn = enters ? view.hiddenAfter(pl.x, pl.y, name) : 0;
      if (tIn > 0.6) {
        const t0 = tIn + R.range(0.03, 0.22);
        pl.grow = [t0, 0.5, 0.2];
        pl.part = [-inward(pl).s * R.range(0.35, 0.55), t0 + 0.02];
      } else if (o.part) parting(pl, R, o.part[0], o.part[1]);
      list.push(pl);
    };
    // bottom edge: plants growing up into frame
    if (o.bottom) for (let x = -0.1 * W + R.range(0, gap); x < 1.1 * W; x += gap * R.range(0.7, 1.3)) {
      const side = (x / W - 0.5) * 2, kind = R.pick(o.bottom);
      const a = clamp(kind === 'frond' ? side * 0.5 + R.range(-0.7, 0.7) : side * 0.3 + R.range(-0.42, 0.42), -1.1, 1.1);
      const depth = o.off * H * R.range(1, 1.5);
      add(kind, x - Math.tan(a) * depth, H + depth, a, depth / Math.cos(a));
    }
    // left and right edges: reaching in and up
    const sideOff = o.off * Math.max(W, 0.6 * H);              // (a tall phone is narrow: root its side leaves as deep as a square frame would)
    if (o.side) for (const sgn of [-1, 1]) for (let y = H - R.range(0, gap); y > H * (o.sideFrom || 0.1); y -= gap * R.range(0.8, 1.4)) {
      const kind = R.pick(o.side), lean = R.range(18, 78) * DEG;
      const depth = sideOff * R.range(1, 1.5), out = depth / Math.sin(lean);
      add(kind, sgn < 0 ? -depth : W + depth, y + Math.cos(lean) * out, -sgn * lean, out, 1, flowerBlind, W / H < 0.9);   // from the left lean right, and vice versa
    }
    // top edge: palm crowns just out of shot in the two corners, fronds arching and hanging into
    // frame. They keep out of the sky window in the middle: that gap is the golden sky and its palms.
    if (o.top) {
      const flat = portrait ? 126 : 108;                     // on a tall phone keep the fronds to the sides so sky shows between
      const crowns = [[-0.05 * W, flat, 170], [1.05 * W, -170, -flat]];
      for (let i = 0; i < (o.inner || 0); i++) crowns.push([W * (R.chance(0.5) ? R.range(0.2, 0.28) : R.range(0.72, 0.8)), 135, 225]);
      const reachK = clamp((W / S) * 0.95, 0.5, 0.95);                                      // shorter on narrow screens
      for (const [x, a0, a1] of crowns) {
        const n = R.int(o.crown[0], o.crown[1]), depth = o.off * H * R.range(1, 1.4);
        for (let i = 0; i < n; i++) {
          const a = lerp(a0, a1, (i + R.range(0.15, 0.85)) / n) * DEG;
          const kind = Math.abs(Math.sin(a)) < 0.4 ? 'frond' : R.pick(o.top);              // nothing but fronds hangs straight down
          add(kind, x + R.range(-0.03, 0.03) * S, -depth, a, depth / Math.max(0.3, Math.abs(Math.cos(a))), reachK);
        }
      }
    }
  };
  /* One ring per depth layer. What the options mean:
   *   gap     spacing between plants along an edge            (× S)
   *   off     how far outside the frame the roots sit         (× frame width or height)
   *   size    how far a leaf reaches into the frame [min,max] (× S)
   *   margin  clearance kept from the copy                    (× S)
   *   min     reach below which a squeezed leaf is dropped    (× S)
   *   crown   fronds per palm crown [min,max];  inner = extra crowns between the two corners
   *   sideFrom  side plants only below this height (fraction of the frame, from the top)
   *   behind  true = drawn behind the flowers (may overlap them);  part = [start time, swing in radians]
   *   bottom / side / top   which kinds of plant grow from that edge (repeats = more likely)      */
  ring('mid', rng(seed + 20), GRADE.mid, {
    gap: 0.12, off: 0.11, size: [0.3, 0.52], margin: 0.035, min: 0.1, crown: [3, 5], inner: 0, behind: true, part: [TL.part + 0.45, 0.26],
    bottom: ['banana', 'fan', 'monstera', 'frond', 'banana', 'fan'], side: ['banana', 'frond', 'fan', 'frond'], top: ['frond', 'frond', 'banana'] });
  ring('focal', rng(seed + 21), GRADE.focal, {
    gap: 0.15, off: 0.15, size: [0.32, 0.6], margin: 0.03, min: 0.12, crown: [4, 6], inner: wide ? 1 : 0, behind: true, part: [TL.part + 0.25, 0.3],
    bottom: ['banana', 'monstera', 'banana', 'fan', 'frond'], side: ['banana', 'frond', 'frond', 'monstera'], top: ['frond', 'frond', 'banana'] });
  ring('near', rng(seed + 22), GRADE.near, {
    gap: 0.27, off: 0.24, size: [0.38, 0.7], margin: 0.025, min: 0.07, sideFrom: 0.5, part: [TL.part + 0.08, 0.3],
    bottom: ['banana', 'fan', 'monstera', 'frond'], side: ['banana', 'frond'], top: null });   // nothing this close hangs over the festoon
  /* ---------------------------------------------------------------------------------------------
   * PASS-THROUGH: the dense jungle the camera starts inside and flies out of. Six shells, each
   * composed for the FIRST frame: leaves rooted outside the frame, tips reaching in around a hole
   * in the middle. The nearest shells have big holes; the last ones nearly close the view, so the
   * opening grows as shell after shell sweeps past the lens.
   * ------------------------------------------------------------------------------------------- */
  const diag = Math.hypot(W, H) / 2;
  [[6, 0.46], [8, 0.34], [10, 0.24], [11, 0.17], [12, 0.13], [12, 0.105]].forEach(([count, hole], i) => {
    const R = rng(seed + 30 + i), g = GRADE.pass[i], list = L['pass' + i];
    for (let j = 0; j < count; j++) {
      const th = ((j + R.range(0.1, 0.9)) / count) * 2 * PI;                       // where around the frame it is rooted
      const rx = W / 2 + Math.cos(th) * diag * R.range(1.0, 1.25), ry = H / 2 + Math.sin(th) * diag * R.range(1.0, 1.25);
      const th2 = th + R.range(-0.9, 0.9), tr = hole * S * R.range(0.7, 1.5);      // aim beside the centre, not at it
      const tx = W / 2 + Math.cos(th2) * tr, ty = H / 2 + Math.sin(th2) * tr;
      const a = Math.atan2(tx - rx, -(ty - ry));
      const fromAbove = Math.sin(th) < -0.35;
      const kind = fromAbove ? R.pick(['frond', 'frond', 'banana']) : R.pick(['banana', 'banana', 'monstera', 'fan', 'frond']);
      list.push(make(kind, R, g, { x: rx, y: ry, a, len: Math.hypot(tx - rx, ty - ry) * R.range(0.95, 1.1), wind: 1.4, z: R.range(-0.5, 0.5) }));
    }
  });

  for (const k of Object.keys(L)) L[k] = L[k].filter(Boolean);
  return { layers: L, skyY, strings, flags: { w: flagW, h: flagH, list: flags }, bulbs };
}
