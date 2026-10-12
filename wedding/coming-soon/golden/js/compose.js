/* compose.js — the art direction of the frame: which plant goes where. ("Golden Centre")
 *
 * THE SHOT. We look down a jungle tunnel at a sunlit clearing. The light source is the GOLDEN
 * CENTRE: it sits where the copy sits, it is the point the camera flies straight at, and at rest the
 * frame is rings of foliage around it:
 *
 *   near    the outer ring, at the frame edges and corners: big, crisp, deep leaves. Banana paddles
 *           rising from the bottom corners, palm fronds arching in from the top corners.
 *   focal   the sharp plane: the canopy across the top, slim lush sides, the thicket along the bottom
 *           with the two birds of paradise and the heliconia.
 *   mid     a little farther: lighter and warmer, overlapping the edge of the glow.
 *   back    farther again, warmer again.
 *   inner   far leaves ringing the light: pale warm silhouettes that dissolve into it.
 *   (the golden centre itself is drawn by the shaders: see backdrop / ATMOS in shaders.js)
 *
 * Papel picado is strung across the upper part of the opening, in front of the glow, its two ends
 * running up into the canopy at the top corners. The copy lives inside the light; NO leaf of any
 * ring ever crosses it (`lines` below), and nothing but pale far leaves stands behind the flags.
 *
 * NOTHING FLOATS: every plant is rooted outside the frame (below it, beyond a side, or above the
 * top for the hanging canopy), or its base is hidden behind a nearer ring. There are no palm trees
 * standing in the light.
 *
 * Everything is laid out in plain screen pixels as the frame looks AT REST (x right, y down), one
 * list per depth layer. scene.js then pushes each layer back to its real distance, so when the
 * camera sits in the clearing every leaf lands exactly where it was composed here.
 * The "pass" layers are the exception: they are composed for the FIRST frame, as a tunnel of shells
 * around the same golden centre, and the camera flies through them.
 *
 * Because it works from the frame size and the measured rectangles of the copy, the same rules
 * compose a tall phone (the frame this was designed on: 390 × 844), a phone on its side and a wide
 * desktop. All randomness is seeded.
 */
import { rng, clamp, lerp, smoothstep, hexToVec, PALETTE } from './kit.js';

const PI = Math.PI, DEG = PI / 180;

/* how each kind of plant moves: bend at full gust (radians at the tip) and how late the tip reacts (s) */
const KIND = {
  banana:    { ids: ['bananaA', 'bananaB', 'bananaC'], wind: 0.075, lag: 0.36 },
  bopLeaf:   { ids: ['bopLeafA', 'bopLeafB'], wind: 0.04, lag: 0.2 },
  fan:       { ids: ['fanA', 'fanB'], wind: 0.05, lag: 0.26 },
  monstera:  { ids: ['monsteraA', 'monsteraB'], wind: 0.065, lag: 0.3 },
  frond:     { ids: ['frondA', 'frondB', 'frondC', 'frondD'], wind: 0.11, lag: 0.46 },
  heliconia: { ids: ['heliconia'], wind: 0.04, lag: 0.24 },
};

/* colour grade per ring: rgb multiplier, how strongly the light comes through the leaf, variety.
 * (How much each ring melts into the gold of the air is set per layer in scene.js: LOOK.) */
const GRADE = {
  inner: { mul: [0.86, 0.92, 0.6], sun: 0.5, vary: 0.08 },
  back:  { mul: [0.92, 0.98, 0.62], sun: 0.85, vary: 0.12 },
  mid:   { mul: [0.84, 0.94, 0.66], sun: 1.0, vary: 0.16 },
  focal: { mul: [1.0, 1.0, 0.95], sun: 1.0, vary: 0.13 },
  near:  { mul: [0.56, 0.7, 0.54], sun: 0.6, vary: 0.12 },
  pass:  [                                                   // shells the camera flies through, nearest first
    { mul: [0.3, 0.42, 0.33], sun: 0.6, vary: 0.1 },         // against the lens at the start: deep, rim-lit
    { mul: [0.42, 0.56, 0.42], sun: 0.75, vary: 0.12 },
    { mul: [0.56, 0.72, 0.5], sun: 0.9, vary: 0.14 },
    { mul: [0.7, 0.86, 0.58], sun: 1.0, vary: 0.16 },
    { mul: [0.8, 0.94, 0.62], sun: 1.0, vary: 0.16 },
    { mul: [0.86, 0.98, 0.64], sun: 1.0, vary: 0.16 },
  ],
};
export const SHELLS = GRADE.pass.length;

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
 * @param F       frame: { W, H, S (= √(W·H), the size unit), safe: {l,t,r,b} rectangle round all of the copy (px),
 *                         lines: [{l,t,r,b}…] one rectangle per line of copy, replay: rectangle of the Replay control (or null) }
 * @param sprites sprite table from plants.js
 * @param TL      timeline cues (seconds) from main.js
 * @param view    { aim(x, y): tell the camera where the golden centre is (px), before anything asks hiddenAfter;
 *                  hiddenAfter(x, y, layer): the last moment of the camera move at which a point of the
 *                  resting frame (px) on that layer is still inside the picture }
 */
export function compose(F, sprites, TL, view, seed = 2027) {
  const { W, H, S, safe } = F;
  const L = { inner: [], back: [], mid: [], focal: [], near: [] };
  for (let i = 0; i < SHELLS; i++) L['pass' + i] = [];
  const cx = (safe.l + safe.r) / 2;
  const portrait = W / H < 0.75;
  /* The copy, line by line. Leaves keep clear of every line, but may come into the shoulders beside the
   * short ones: that is what makes the edge of the opening the shape of leaves and not of a box. */
  const lines = F.lines && F.lines.length ? F.lines : [safe];

  /* ---------------------------------------------------------------------------------------------
   * THE FESTOON: papel picado in the six house colours, strung across the upper part of the opening
   * so its lowest flags hang just clear of the copy. The string runs up and out through the canopy
   * at the two top corners, so its ends are lost in the leaves. (Worked out first: the canopy is
   * composed around it.)
   * ------------------------------------------------------------------------------------------- */
  const clear = 0.024 * S;                                                       // air between the lowest flags and the copy
  let flagH = clamp(0.061 * S, 30, Math.max(60, 0.03 * S)) * (portrait ? 1.1 : 1) * 1.3;
  flagH = Math.max(18, Math.min(flagH, safe.t - clear - 0.035 * H));             // a short screen gets smaller flags
  const flagW = flagH / 1.3;
  const flagTop = Math.max(0.02 * H, safe.t - clear - flagH);                    // the string at its lowest, mid-frame
  const swag = Math.min(flagTop - 0.012 * H, clamp(0.075 * H, 0.05 * S, 0.13 * S));
  const tiltY = Math.min(0.012 * H, swag * 0.25);
  const a1 = { ax: -0.08 * W, ay: flagTop - swag - tiltY, bx: 1.08 * W, by: flagTop - swag + tiltY, sag: swag, depth: 10.6 };
  const stringY = (x) => { const s = clamp((x - a1.ax) / (a1.bx - a1.ax)); return lerp(a1.ay, a1.by, s) + a1.sag * 4 * s * (1 - s); };
  const nFlags = Math.max(6, Math.floor((a1.bx - a1.ax) / (flagW * 1.13)));
  const RF = rng(seed + 40);
  const flags = Array.from({ length: nFlags }, (_, i) => ({ s: (i + 0.5) / nFlags, seed: RF.f(), design: (i * 2 + (i % 3 === 2 ? 1 : 0)) % 3, dye: FLAG_DYES[i % 6] }));
  /* where the flags hang, as a run of boxes along the string: every ring but the palest keeps out, so
   * the tissue has the light behind it. The outer eighth at each end is left to the leaves. */
  const flagBand = [];
  for (let i = 0, n = 7; i < n; i++) {
    const xa = lerp(0.13 * W, 0.87 * W, i / n), xb = lerp(0.13 * W, 0.87 * W, (i + 1) / n);
    flagBand.push({ l: xa, r: xb, t: Math.min(stringY(xa), stringY(xb)) - 0.004 * S, b: Math.max(stringY(xa), stringY(xb)) + flagH });
  }
  /* a string of small warm bulbs, threaded through the dark canopy above the flags (bulbs only read
   * against dark leaves, never against the gold) */
  const bulbY = clamp(0.3 * flagTop, 0.02 * H, 0.06 * H), bulbSag = Math.min(0.2 * flagTop, 0.05 * S);
  const a2 = { ax: -0.1 * W, ay: bulbY, bx: 1.1 * W, by: bulbY + 0.012 * H, sag: bulbSag, depth: 9.4 };
  const strings = [a1, a2];
  const bulbs = { n: flagTop < 0.12 * H ? 0 : Math.round((a2.bx - a2.ax) / (flagW * 0.62)), size: clamp(0.0036 * S, 1.9, 3.6) };   // size = radius of the lit filament, CSS px; none where the canopy is too thin to hold them

  /* ---------------------------------------------------------------------------------------------
   * THE OPENING and the golden centre in it. Top: where the canopy stops, just above the string.
   * Bottom: where the thicket starts, just under the copy. The centre of that is where the light is,
   * where the camera is heading, and where every leaf's backlight comes from.
   * ------------------------------------------------------------------------------------------- */
  const openT = flagTop - 0.02 * S, openB = Math.min(H - 0.08 * S, safe.b + 0.07 * S);
  const glow = { x: cx, y: (openT + openB) / 2, ry: (openB - openT) / 2,
                 rx: Math.min((safe.r - safe.l) / 2 + 0.075 * S, Math.max(cx, W - cx) - 0.015 * S) };
  view.aim(glow.x, glow.y);

  /** build one placement. p: {x,y (root, px), len (px), a (heading), avoid (px margin or undefined), min (px), rects} */
  const make = (kind, R, g, p) => {
    let id, flip;
    if (kind === 'frond') ({ id, flip } = frondFor(p.a, R));
    else { id = p.id || R.pick(KIND[kind].ids); flip = p.flip || R.sign(); }
    const sp = sprites[id];
    let len = p.len, a = p.a;
    if (p.avoid !== undefined) {
      let ok = false;
      const rects = p.rects || lines;
      for (let i = 0; i < 10 && len >= p.min; i++) {
        if (!touches(sp, p.x, p.y, len, a, flip, rects, p.avoid)) { ok = true; break; }
        len *= 0.88;
      }
      if (!ok) return null;
    }
    return { id, x: p.x, y: p.y, len, a, flip, tint: p.tint || tintOf(g, R), sun: p.sun ?? g.sun,
             wind: KIND[kind].wind * (p.wind ?? 1), lag: KIND[kind].lag, seed: R.f(), z: p.z ?? 0 };
  };

  /** which way a leaf has to turn for its tip to move toward the golden centre (+1 / -1) */
  const inward = (pl) => {
    const tipX = pl.x + Math.sin(pl.a) * pl.len * 0.8, tipY = pl.y - Math.cos(pl.a) * pl.len * 0.8;
    return { s: Math.sign(Math.cos(pl.a) * (glow.x - tipX) + Math.sin(pl.a) * (glow.y - tipY)) || 1, d: Math.hypot(glow.x - tipX, glow.y - tipY) / S };
  };
  /** leaves framing the opening start swung in over it and spring open as the camera arrives */
  const parting = (pl, R, t0, mag) => {
    const { s, d } = inward(pl);
    pl.part = [s * mag * R.range(0.7, 1.2), t0 + d * 0.4 + R.range(0, 0.09)];   // nearest the centre goes first
    return pl;
  };

  /* ---------------------------------------------------------------------------------------------
   * HEROES: two bird of paradise plants at the focal plane, flowers facing in toward the names.
   * Each rises on its stalk as the names land, then opens (the sepals are separate parts). A few
   * deep leaves stand right behind each flower, so the orange and the cobalt sit on dark green and
   * never on the gold.
   * ------------------------------------------------------------------------------------------- */
  const crests = [];                                        // the box each open flower fills, for shading what is behind it
  const flowerKeep = [];                                    // the nearest ring stays off the flowers
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
        return { x: side < 0 ? room * 0.4 : W - room * 0.4, y: Math.max(lerp(safe.t, safe.b, side < 0 ? 0.92 : 1.08), H - 0.3 * S), face: -side, sp, lean: R.range(0.05, 0.14) };
      }
      // under the copy (phones): big, the left one lower, the right one higher so its stalk passes
      // to the left of the Replay control in the bottom corner
      const sp = Math.min(clamp(below * 0.56, 0.1 * S, 0.165 * S), below / 1.9) * k;   // (a short phone has little room under the copy: the whole flower must still fit)
      let x = side < 0 ? W * 0.175 : W * 0.79, lean = R.range(0.05, 0.12);
      const spare = Math.max(0, below - sp * 1.75);            // what is left below the flower once crest and spathe are in
      const y = safe.b + sp * 1.38 + Math.min(spare * (side < 0 ? 0.8 : 0.3), below * (side < 0 ? 0.16 : 0.06));
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
      crests.push({ l: fx - sp * 0.62, r: fx + sp * 0.62, t: fy - sp * 0.7, b: fy + sp * 0.45 });
      flowerKeep.push({ l: h.x - sp * 0.9, r: h.x + sp * 0.9, t: h.y - sp * 1.5, b: h.y + sp * 0.25 });
      // the dark it blooms against: deep paddles standing right behind the crest, rooted below the frame
      const rootB = H + 0.14 * S;
      [[-0.62, 'bananaC', 0.06], [0.08, 'monsteraA', 0.3], [0.66, 'bananaC', 0.0], [0.3, 'bananaA', -0.16]].forEach(([u, id, up], i) => {
        const tipX = fx + u * sp * 1.15 + R.range(-0.015, 0.015) * S, tipY = fy - sp * (0.78 + up) - R.range(0, 0.025) * S;
        const la = u * 0.26 + R.range(-0.08, 0.08);
        const pl = make(id.startsWith('mon') ? 'monstera' : 'banana', R, g, { id, x: tipX - Math.tan(la) * (rootB - tipY), y: rootB, a: la, len: (rootB - tipY) / Math.cos(la),
                        avoid: 0.03 * S, min: 0.3 * S, tint: tintOf(g, R).map((v) => v * (i === 3 ? 0.62 : 0.5)), sun: 0.25, z: -0.7 - i * 0.04 });
        if (pl) L.focal.push(parting(pl, R, TL.part + 0.3, 0.16));
      });
      // its own leaves: upright grey-green paddles, a couple behind the flower and a couple in front, lower
      const leaves = 4;
      for (let i = 0; i < leaves; i++) {
        const front = i >= 2;
        const la = a + (i - (leaves - 1) / 2) * R.range(0.2, 0.3) - h.face * 0.12 + R.range(-0.06, 0.06);
        const ll = len * (front ? R.range(0.5, 0.68) : R.range(0.82, 1.12));
        const pl = make('bopLeaf', R, g, { x: rootX + R.range(-0.02, 0.02) * S, y: rootY + R.range(0, 0.03) * S, len: ll, a: la, avoid: 0.03 * S, min: len * 0.35,
                                           rects: [...lines, { l: fx - sp * 0.5, r: fx + sp * 0.5, t: fy - sp * 0.55, b: fy + sp * 0.3 }], z: front ? 0.5 : 0.1 + i * 0.01 });
        if (pl) L.focal.push(parting(pl, R, TL.part + 0.25, 0.22));
      }
    });

    /* HELICONIA: a few pink lobster-claws standing in the foliage, clear of the copy and the flowers */
    const Rh = rng(seed + 11), rootY = H + 0.1 * S;
    const spots = beside
      ? [[0.045, 0.74, 0.1], [0.3, 0.9, -0.07], [0.965, 0.6, -0.1], [0.72, 0.9, 0.06]]
      : [[0.05, lerp(safe.t, safe.b, 0.74) / H, 0.05], [0.955, lerp(safe.t, safe.b, 0.55) / H, -0.045], [0.52, (safe.b + 0.42 * below) / H, 0.03]];
    spots.forEach(([fx, fy, lean], i) => {
      const topY = fy * H, x = fx * W;
      const pl = make('heliconia', Rh, g, { id: 'heliconia', flip: lean > 0 ? 1 : -1, x: x - Math.tan(lean) * (rootY - topY), y: rootY, a: lean,
                                            len: (rootY - topY) / Math.cos(lean), avoid: 0.03 * S, min: 0.22 * S, rects: [...lines, ...flowerKeep], tint: [1, 1, 1], sun: 0, z: 0.26 + i * 0.01 });
      if (!pl) return;
      pl.flower = 1;
      pl.grow = [TL.stalks + 0.3 + i * 0.14, 0.82, 0.35];
      L.focal.push(pl);
    });
  }

  /* ---------------------------------------------------------------------------------------------
   * THE RINGS: plants growing in from every edge, ring behind ring, never across the copy.
   *   bottom  plants standing up into frame; `tip(x)` says how high that ring's thicket stands there
   *   side    plants leaning in and up from beyond the left and right edges
   *   top     the canopy: palm crowns just out of shot (above the top edge, or outside the two top
   *           corners), their fronds arching and hanging into frame
   * A leaf that would touch a keep-out is shortened until it clears; if it cannot, it is dropped.
   * ------------------------------------------------------------------------------------------- */
  /** how far along its heading a plant rooted outside the frame travels before it comes into the picture */
  const enter = (x, y, a) => {
    const dx = Math.sin(a), dy = -Math.cos(a);
    let t = 0;
    if (x < 0) t = Math.max(t, dx > 0.05 ? -x / dx : 1e9); else if (x > W) t = Math.max(t, dx < -0.05 ? (W - x) / dx : 1e9);
    if (y < 0) t = Math.max(t, dy > 0.05 ? -y / dy : 1e9); else if (y > H) t = Math.max(t, dy < -0.05 ? (H - y) / dy : 1e9);
    return Math.min(t, 0.7 * S);
  };
  /** the free width beside the copy at height y, from the left (sgn -1) or right (+1) edge of the frame */
  const room = (y, sgn, rects) => {
    let w = W / 2;
    for (const q of rects) if (y > q.t - 0.02 * S && y < q.b + 0.02 * S) w = Math.min(w, sgn < 0 ? q.l : W - q.r);
    return Math.max(0, w);
  };
  const ring = (name, R, g, o) => {
    const list = L[name];
    // `out` = length hidden outside the frame; `reach` = how far it comes in, on top of that.
    const add = (kind, x, y, a, out, reach, enters = false, margin = o.margin) => {
      const pl = make(kind, R, g, { x, y, a, len: out + reach, avoid: margin * S, min: out + Math.min(o.min * S, reach * 0.55), rects: o.rects, z: R.range(o.z[0], o.z[1]) });
      if (!pl) return;
      // a leaf that ends up behind a flower drops into shade, so the orange and cobalt sit on deep green
      if (o.shade && touches(sprites[pl.id], pl.x, pl.y, pl.len, pl.a, pl.flip, crests, 0)) { pl.tint = pl.tint.map((v) => v * o.shade); pl.sun *= 0.4; }
      // While the camera is still far back, the roots of the side leaves and of the canopy are in shot:
      // a leaf standing against the glow with its cut stalk showing would float. So each stays away
      // until its root has left the picture, then reaches in from the edge: growing, and swinging in
      // from outside. (Plants along the bottom rise out of the dark instead, and need no such care.)
      const tIn = enters ? view.hiddenAfter(pl.x, pl.y, name) : 0;
      if (tIn > 0.6) {
        const t0 = tIn + R.range(0.03, 0.22);
        pl.grow = [t0, 0.5, 0.2];
        pl.part = [-inward(pl).s * R.range(0.35, 0.55), t0 + 0.02];
      } else if (o.part) parting(pl, R, o.part[0], o.part[1]);
      list.push(pl);
    };
    const b = o.bottom, s = o.side, tp = o.top;
    if (b) for (let x = -0.12 * W + R.range(0, b.gap * S); x < 1.12 * W; x += b.gap * S * R.range(0.7, 1.3)) {
      const side = (x / W - 0.5) * 2, kind = R.pick(b.kinds);
      const a = clamp(kind === 'frond' ? side * 0.5 + R.range(-0.7, 0.7) : side * 0.3 + R.range(-0.42, 0.42), -1.1, 1.1) * (b.lean ?? 1);
      const depth = b.off * H * R.range(1, 1.5);
      const tipY = Math.min(H - 0.03 * S, b.tip(x + Math.tan(a) * (H - b.tip(x))) + R.range(-b.jit, b.jit) * S);   // (x is where it crosses the bottom edge; its tip lands further along its lean)
      add(kind, x - Math.tan(a) * depth, H + depth, a, depth / Math.cos(a), (H - tipY) / Math.cos(a));
    }
    if (s) {
      const sideOff = s.off * Math.max(W, 0.6 * H);            // (a tall phone is narrow: root its side leaves as deep as a square frame would)
      for (const sgn of [-1, 1]) for (let ty = H * (s.to ?? 1) - R.range(0, s.gap * S); ty > H * (s.from ?? 0.1); ty -= s.gap * S * R.range(0.8, 1.4)) {
        const kind = R.pick(s.kinds), lean = R.range(s.lean[0], s.lean[1]) * DEG;
        // How far in may its tip come at that height? As far as the copy leaves room there, so the sides
        // swell into the shoulders beside the short lines and draw back beside the long ones; and never
        // the same on the left as on the right.
        const lop = 1 + 0.3 * sgn * Math.sin((ty / H) * 5.5 + 0.9);
        const inX = clamp((room(ty, sgn, o.rects) - o.margin * S) * R.range(s.fill[0], s.fill[1]) * lop, 0.02 * S, s.max * S * lop);
        const depth = sideOff * R.range(1, 1.5), out = depth / Math.sin(lean), reach = inX / Math.sin(lean);
        add(kind, sgn < 0 ? -depth : W + depth, ty + Math.cos(lean) * (out + reach), -sgn * lean, out, reach, true);   // from the left lean right, and vice versa
      }
    }
    // … leaves reaching almost straight in from the sides, into the shoulders the copy leaves beside
    // its short lines: these are what make the edge of the opening wander, the way the copy does
    const ri = o.reachIn;
    if (ri) for (const sgn of [-1, 1]) {
      const pockets = [];                                                         // stretches of this edge where the copy leaves real room
      for (let y = H * ri.from, cur = null; y < H * ri.to; y += 0.012 * S) {
        const free = room(y, sgn, o.rects) - ri.margin * S;
        if (free < 0.1 * S) { cur = null; continue; }
        if (!cur) pockets.push(cur = { y0: y, y1: y, free });
        cur.y1 = y; cur.free = Math.min(cur.free, free);
      }
      for (const pk of pockets) for (let i = 0, n = Math.max(1, Math.round((pk.y1 - pk.y0) / (ri.gap * S))); i < n; i++) {
        const ty = lerp(pk.y0, pk.y1, 0.5 + ((i + R.range(0.3, 0.7)) / n - 0.5) * 0.56), lop = 1 + 0.3 * sgn * Math.sin((ty / H) * 5.5 + 0.9);   // (toward the middle of the shoulder, where a whole blade fits)
        const kind = R.pick(ri.kinds), lean = R.range(ri.lean[0], ri.lean[1]) * DEG;
        const inX = Math.min((room(ty, sgn, o.rects) - ri.margin * S) * R.range(ri.fill[0], ri.fill[1]), ri.max * S) * lop;
        const depth = ri.off * Math.max(W, 0.6 * H) * R.range(0.7, 1.2), out = depth / Math.sin(lean), reach = inX / Math.sin(lean);
        add(kind, sgn < 0 ? -depth : W + depth, ty + Math.cos(lean) * (out + reach), -sgn * lean, out, reach, true, ri.margin);
      }
    }
    // … and plants standing up along the two edges: big leaves rooted just beyond the side, their midribs
    // running up the edge of the frame so half a blade comes into the picture. This is what keeps a
    // narrow phone's sides lush where the copy leaves only a slim strip.
    const st = o.stand;
    if (st) for (const sgn of [-1, 1]) for (let ty = H * (st.to ?? 0.95) - R.range(0, st.gap * S); ty > H * (st.from ?? 0.08); ty -= st.gap * S * R.range(0.75, 1.35)) {
      const kind = R.pick(st.kinds), lean = R.range(st.lean[0], st.lean[1]) * DEG, len = R.range(st.len[0], st.len[1]) * S;
      const tipIn = R.range(st.inset[0], st.inset[1]) * Math.max(W, 0.6 * H);     // where its tip is, measured in from the edge (negative = just outside it)
      const a = -sgn * lean, x = (sgn < 0 ? tipIn : W - tipIn) - Math.sin(a) * len, y = ty + Math.cos(a) * len;
      if (sgn < 0 ? x > -0.012 * S : x < W + 0.012 * S) continue;                 // rooted beyond the edge, or not at all
      const out = Math.min(enter(x, y, a), len * 0.8);
      add(kind, x, y, a, out, len - out, true);
    }
    // the canopy: as many crowns across the top as the frame is wide, each a fan of hanging fronds
    // tilted a little toward the middle, plus whatever corner crowns the ring asks for
    const crowns = tp ? [...(tp.crowns || [])] : [];
    if (tp && tp.across) for (let i = 0, n = clamp(Math.round(W / (tp.across * S)), 2, 9); i < n; i++) {
      const fx = (i + 0.5 + R.range(-0.22, 0.22)) / n, a0 = 150 + (fx - 0.5) * 44 + R.range(-8, 8);
      crowns.push([fx, -1, a0, a0 + R.range(58, 72), 3 + (i % 2)]);
    }
    if (tp) for (const [fx, fy, a0, a1x, n] of crowns) {
      const x = fx * W + R.range(-0.03, 0.03) * S, y = fy < 0 ? fy * H * tp.off * R.range(1, 1.4) : fy * H;
      for (let i = 0; i < n; i++) {
        const a = lerp(a0, a1x, (i + R.range(0.15, 0.85)) / n) * DEG;
        const kind = Math.abs(Math.sin(a)) < 0.45 ? 'frond' : R.pick(tp.kinds);          // nothing but fronds hangs straight down
        // over the flags the canopy may only hang as far as the string: size the frond to the room there
        const out = enter(x, y, a), want = R.range(tp.reach[0], tp.reach[1]) * S, tipX = x + Math.sin(a) * (out + want * 0.7);
        const over = o.rects !== lines && tipX > 0.13 * W && tipX < 0.87 * W;
        const reach = over ? Math.min(want, Math.max(0.05 * S, stringY(tipX) - (o.margin + 0.03) * S) / Math.max(0.4, Math.abs(Math.cos(a)))) : want;
        add(kind, x, y, a, out, reach, true);
      }
    }
  };

  /* how high each ring's thicket stands along the bottom: never level, never symmetrical. The far
   * rings stand highest (their tips are the lower edge of the opening); nearer rings sit lower, so
   * every ring shows as a band of its own. */
  const wave = (x, k) => S * (0.022 * Math.sin((x / S) * 9 + 1.1 + k) + 0.014 * Math.sin((x / S) * 21 + 4.0 + k * 2.3));
  const edgeLift = (x) => smoothstep(0.24, 0.5, Math.abs(x / W - 0.5));           // 0 mid-frame → 1 at the left and right edges
  const corner = (x) => smoothstep(0.3, 0.52, Math.abs(x / W - 0.47));
  const copyAndFlags = [...lines, ...flagBand];
  const cornerCrowns = (lo, hi, n, yTop = 0.03, out = 0.07) => [[-out, yTop, lo, hi, n], [1 + out, yTop + 0.02, -hi, -lo, n]];

  /* INNER: far leaves ringing the light. Pale, warm, half dissolved (see LOOK in scene.js). From above
   * and from the sides they are rooted outside the frame like everything else; from below their feet
   * are behind the thicket. They may stand behind the flags. */
  {
    const R = rng(seed + 2), g = GRADE.inner, n = Math.round(clamp((2 * (glow.rx + glow.ry)) / (0.058 * S), 22, 48));
    for (let i = 0; i < n; i++) {
      const th = ((i + R.range(0.1, 0.9)) / n) * 2 * PI, c = Math.cos(th), s = Math.sin(th);   // direction from the centre to this leaf's tip (π/2 = straight down)
      const wob = 1 + 0.1 * Math.sin(th * 3 + 0.7) + 0.07 * Math.sin(th * 5 + 2.4) + R.range(-0.07, 0.07);
      const tipX = glow.x + c * glow.rx * 0.93 * wob, tipY = glow.y + s * glow.ry * (s > 0 ? 0.93 : 0.84) * wob;
      let kind, a, len, enters = true;
      if (s > 0.42) {                                                                        // from below: standing
        kind = R.pick(['banana', 'banana', 'fan', 'monstera', 'frond', 'bopLeaf']); a = -c * 0.55 + R.range(-0.3, 0.3); len = S * R.range(0.2, 0.34); enters = false;
      } else if (s < -0.42) {                                                                // from above: hanging
        kind = 'frond'; a = PI + c * 0.7 + R.range(-0.35, 0.35); len = (tipY + 0.11 * H * R.range(1, 1.7)) / Math.abs(Math.cos(a));
      } else {                                                                               // from the sides: leaning in and up
        kind = R.pick(['banana', 'frond', 'frond', 'monstera']); a = -Math.sign(c) * R.range(0.45, 1.15);
        len = ((c < 0 ? tipX : W - tipX) + Math.max(W, 0.6 * H) * R.range(0.1, 0.2)) / Math.sin(Math.abs(a));
      }
      const pl = make(kind, R, g, { x: tipX - Math.sin(a) * len, y: tipY + Math.cos(a) * len, a, len, avoid: 0.03 * S, min: 0.1 * S, z: R.range(-1, 1) });
      if (!pl) continue;
      const tIn = enters ? view.hiddenAfter(pl.x, pl.y, 'inner') : 0;
      if (tIn > 0.6) { const t0 = tIn + R.range(0.03, 0.3); pl.grow = [t0, 0.5, 0.3]; pl.part = [-inward(pl).s * R.range(0.2, 0.4), t0 + 0.02]; }
      L.inner.push(pl);
    }
  }
  /* BACK: the next ring out: warmer and lighter than the leaves in front of it */
  ring('back', rng(seed + 3), GRADE.back, {
    rects: copyAndFlags, margin: 0.03, min: 0.07, z: [-1, 1],
    bottom: { kinds: ['banana', 'banana', 'fan', 'monstera', 'frond', 'bopLeaf'], gap: 0.085, off: 0.1, jit: 0.02, tip: (x) => openB - 0.012 * S + wave(x, 0.6) - edgeLift(x) * 0.1 * S },
    side: { kinds: ['banana', 'frond', 'frond', 'monstera'], gap: 0.11, off: 0.2, lean: [24, 68], fill: [0.6, 1.05], max: 0.26, from: 0.1, to: 0.84 },
    top: { kinds: ['frond'], off: 0.2, reach: [0.2, 0.3], across: 0.17 } });
  /* MID: lighter and warmer than the sharp plane, overlapping the edge of the glow */
  ring('mid', rng(seed + 20), GRADE.mid, {
    rects: copyAndFlags, margin: 0.032, min: 0.06, z: [-1, 0.6], shade: 0.5, part: [TL.part + 0.45, 0.24],
    bottom: { kinds: ['banana', 'fan', 'monstera', 'frond', 'banana', 'fan'], gap: 0.095, off: 0.11, jit: 0.025, tip: (x) => openB + 0.012 * S + wave(x, 2.1) - edgeLift(x) * 0.13 * S },
    side: { kinds: ['banana', 'frond', 'banana', 'frond', 'monstera', 'banana'], gap: 0.1, off: 0.19, lean: [20, 62], fill: [0.5, 1.0], max: 0.23, from: 0.07, to: 0.9 },
    reachIn: { kinds: ['banana', 'frond', 'banana', 'monstera'], gap: 0.1, off: 0.16, lean: [56, 92], fill: [0.85, 1.1], max: 0.24, margin: 0.02, from: 0.12, to: 0.86 },
    stand: { kinds: ['banana', 'banana', 'frond', 'bopLeaf', 'monstera'], gap: 0.14, lean: [5, 16], len: [0.36, 0.62], inset: [-0.04, 0.035], from: 0.1, to: 0.9 },
    top: { kinds: ['frond', 'frond', 'banana'], off: 0.2, reach: [0.17, 0.27],
           across: 0.2, crowns: cornerCrowns(84, 150, 4, 0.02, 0.2) } });
  /* FOCAL: the sharp plane (the heroes above are part of it): thicket, slim sides, canopy */
  ring('focal', rng(seed + 21), GRADE.focal, {
    rects: copyAndFlags, margin: 0.032, min: 0.07, z: [-1, 0.2], shade: 0.55, part: [TL.part + 0.25, 0.28],
    bottom: { kinds: ['banana', 'monstera', 'banana', 'fan', 'frond', 'fan'], gap: 0.1, off: 0.15, jit: 0.03, tip: (x) => openB + 0.05 * S + wave(x, 3.7) - edgeLift(x) * 0.16 * S },
    side: { kinds: ['banana', 'frond', 'frond', 'monstera', 'banana'], gap: 0.085, off: 0.15, lean: [12, 56], fill: [0.45, 1.0], max: 0.2, from: 0.05, to: 0.94 },
    reachIn: { kinds: ['banana', 'frond', 'banana', 'monstera', 'banana'], gap: 0.075, off: 0.13, lean: [54, 92], fill: [0.6, 0.95], max: 0.2, margin: 0.02, from: 0.14, to: 0.9 },
    stand: { kinds: ['banana', 'banana', 'banana', 'frond', 'monstera', 'bopLeaf'], gap: 0.1, lean: [4, 15], len: [0.34, 0.7], inset: [-0.05, 0.03], from: 0.08, to: 0.94 },
    top: { kinds: ['frond', 'frond', 'banana'], off: 0.13, reach: [0.16, 0.26],
           across: 0.235, crowns: cornerCrowns(78, 156, 5, 0.035, 0.09) } });
  /* NEAR: the outer ring. Big leaves at the edges and corners only: banana paddles rising from the
   * bottom corners, fronds arching in from the top corners, fans and monstera low along the bottom. */
  ring('near', rng(seed + 22), GRADE.near, {
    rects: [...lines, ...flagBand.slice(1, -1), ...flowerKeep], margin: 0.03, min: 0.07, z: [-1, 1], part: [TL.part + 0.08, 0.3],   // (the first and last flags are left to it: the string's ends are lost in these leaves)
    bottom: { kinds: ['banana', 'fan', 'monstera', 'banana', 'frond'], gap: 0.2, off: 0.24, lean: 0.8,
              jit: 0.05, tip: (x) => lerp(H - 0.1 * S, Math.max(glow.y + 0.12 * S, H - 0.5 * S), corner(x)) },
    side: { kinds: ['banana', 'frond', 'banana'], gap: 0.22, off: 0.24, lean: [8, 36], fill: [0.4, 0.9], max: 0.13, from: 0.3, to: 1 },
    stand: { kinds: ['banana', 'banana', 'frond'], gap: 0.19, lean: [4, 13], len: [0.6, 0.9], inset: [-0.09, -0.01], from: 0.16, to: 1 },
    top: { kinds: ['frond'], off: 0.2, reach: [0.3, 0.5], crowns: [[-0.16, -0.01, 98, 148, 3], [1.14, 0.03, -168, -104, 4]] } });   // the right-hand crown is the bigger: the frame is never a mirror

  /* ---------------------------------------------------------------------------------------------
   * PASS-THROUGH: the jungle the camera starts inside and flies out of. A tunnel of shells, each
   * composed for the FIRST frame around the golden centre: leaves rooted just outside the frame, tips
   * reaching in around the light. The nearest shells leave a wide hole; the last ones close in
   * round the glow, so the opening grows as shell after shell sweeps past the lens. A second tier of
   * shorter leaves in every shell fills in behind the long ones, so it reads as layered jungle.
   * ------------------------------------------------------------------------------------------- */
  [[6, 0.5], [7, 0.4], [8, 0.31], [9, 0.235], [10, 0.185], [10, 0.15]].forEach(([count, hole], i) => {
    const R = rng(seed + 30 + i), g = GRADE.pass[i], list = L['pass' + i];
    const leaf = (th, tipR, spread, tier) => {
      const c = Math.cos(th), s = Math.sin(th);
      // just outside the frame in that direction (not on a far-off circle: the whole leaf should be in the picture)
      const edge = Math.min(c > 0 ? (W - glow.x) / Math.max(c, 1e-3) : glow.x / Math.max(-c, 1e-3), s > 0 ? (H - glow.y) / Math.max(s, 1e-3) : glow.y / Math.max(-s, 1e-3));
      const rr = edge * R.range(1.16, 1.4) + 0.06 * S, rx = glow.x + c * rr, ry = glow.y + s * rr;
      const th2 = th + R.range(-spread, spread), tr = tipR * S * R.range(0.8, 1.4);                 // aim beside the centre, not at it
      const tx = glow.x + Math.cos(th2) * tr, ty = glow.y + Math.sin(th2) * tr;
      if (Math.hypot(tx - rx, ty - ry) < 0.16 * S) return;
      const a = Math.atan2(tx - rx, -(ty - ry));
      const kind = s < -0.4 ? R.pick(['frond', 'frond', 'frond', 'banana']) : s > 0.4 ? R.pick(['banana', 'banana', 'monstera', 'fan', 'frond']) : R.pick(['banana', 'frond', 'monstera', 'banana', 'fan']);
      const pl = make(kind, R, g, { x: rx, y: ry, a, len: Math.hypot(tx - rx, ty - ry) * R.range(0.95, 1.08), wind: 1.4, z: R.range(-0.5, 0.5) + tier * 0.4 });
      if (tier) pl.tint = pl.tint.map((v) => v * 0.86);
      list.push(pl);
    };
    for (let j = 0; j < count; j++) leaf(((j + R.range(0.1, 0.9)) / count) * 2 * PI, hole, 0.8, 0);
    const fill = Math.round(count * 0.5);
    for (let j = 0; j < fill; j++) leaf(((j + R.range(0.1, 0.9)) / fill) * 2 * PI, hole * 1.9, 0.5, 1);
  });

  for (const k of Object.keys(L)) L[k] = L[k].filter(Boolean);
  return { layers: L, glow, strings, flags: { w: flagW, h: flagH, list: flags }, bulbs };
}
