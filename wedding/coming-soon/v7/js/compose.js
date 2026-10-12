/* compose.js — the art direction of the frame: which plant goes where, and how each one gets out of
 * the way. ("Wallpaper")
 *
 * THE SHOT. It opens on a sheet of tropical wallpaper: painted foliage edge to edge. The camera
 * pushes in and the flat print turns out to be thick jungle, leaf behind leaf. As the camera comes up
 * to each layer its leaves are pushed aside, the way a shoulder parts foliage, and swing out past the
 * edge of the picture: for the first part of the push there is nothing to see but leaves parting to
 * show more leaves. Behind all of it is the pale-gold middle of the sheet with the copy already
 * printed on it (they are layers of the page UNDER the foliage: js/ground.js, index.html), and the
 * last leaves in front of it are the frame of the resting picture itself, swung shut across the
 * middle like a curtain. They spring open, and that is what uncovers the names.
 * NOTHING FADES, grows in or pops: a leaf is in the picture or it has moved out of it.
 *
 * TWO COMPOSITIONS live in here, both in plain screen pixels (x right, y down), one list per layer:
 *
 *   THE WALLPAPER (layers pass0 … pass9, nearest first) is composed for the FIRST frame. Every plant
 *   is rooted just outside the frame and reaches in, plants along the bottom growing up, the top
 *   hanging, the sides leaning in. The four nearest shells are composed together, one plant at a time
 *   into whatever part of the sheet is still empty, until foliage covers it: they are the picture the
 *   shot opens on, with two bunches of bananas hanging in it (WALL_HANG). Each of the six shells behind
 *   lays five broad leaves right across the middle, from different edges, and fills in round them:
 *   each covers the middle of the sheet BY ITSELF, which is the thickness. The camera comes
 *   toward all of these (it never reaches one: scene.js, PASS_DIST). Once the whole sheet is composed,
 *   (version 7: the leaves of the four nearest shells are pushed aside early and slowly, during the push through them that comes first: THE NEAR LEAVES GIVE WAY)
 *   each leaf is given THE SWING that takes it out: about its own root, away from the line of travel
 *   (whichever way round is shorter: left-rooted leaves end up along the left edge, hanging ones swing
 *   up, and so on), far enough to be clear of the picture, at a time of its own: shell after shell, and
 *   inside a shell the leaves nearest the middle first. No two swing alike: each has its own angle, its
 *   own lean before it goes, its own limpness of blade, and a long heavy leaf is slower than a short one.
 *   On any shape of phone the sheet is foliage EDGE TO EDGE: after the shells are composed, what is
 *   really painted over every point of it is counted (from the drawings themselves, not their
 *   outlines), and a broad blade from a deep shell goes behind any place the cream still shows.
 *
 *   THE RESTING FRAME is composed as the picture looks once the camera has landed. scene.js pushes
 *   each layer back to its real distance, so every leaf lands exactly where it was composed here:
 *     back    the frame of foliage, farthest ring: printed faintest.
 *     mid     nearer, stronger.
 *     focal   the main ring: the canopy across the top, slim lush sides, the thicket along the bottom
 *             with the two birds of paradise.
 *     near    big leaves at the edges and corners only; and, in front of everything, the two bunches
 *             of bananas hanging in the upper corners with their blossoms below them.
 *   Papel picado is strung across the upper part of the opening, its two ends running up behind the
 *   foliage and the bananas at the top corners. NO leaf of the frame crosses the copy AT REST (`lines`
 *   below; the bananas are held off the words themselves, `tight`, so a blossom may hang beside the
 *   short name on a phone).
 *
 *   THE LAST CURTAIN is that same frame, shut ("THE LAST CURTAIN" below). Every plant of it starts
 *   swung in over the middle, bent about its root, and springs open to its resting place when its time
 *   comes: the one lying nearest the middle of the names at TL.open, the rest by how far out they lie,
 *   the outer ones more and more spread out (the opening eases out as the camera lands). A few long
 *   broad leaves stand up each side just for this (THE CURTAIN LEAVES): at rest they run up the edges
 *   of the frame, mostly out of it; shut, they lie right across the names. The bananas, their blossoms
 *   and the birds of paradise are part of it: they swing and settle with the leaves round them.
 *
 * NOTHING FLOATS: every plant is rooted outside the frame it was composed for (below it, beyond a
 * side, or above the top for whatever hangs), and a root never moves. The resting frame is seen from
 * further back while the camera is still on its way, which would bring its roots into shot: so each
 * plant of it has a STEM that runs on below its root, as far as the picture ever reaches (`stem`),
 * and the jungle goes on outside the resting picture all the way round (THE CANOPY ABOVE THE FRAME,
 * THE THICKET BELOW IT): more plants, every one ending just outside the picture as it rests, so that
 * from further back the stems go down into leaves and the edges are never bare.
 *
 * Because it works from the frame size and the measured rectangles of the copy, the same rules
 * compose a tall phone (the frame this was designed on: 390 × 844), a phone on its side and a wide
 * desktop. All randomness is seeded.
 */
import { rng, clamp, lerp, smoothstep, hexToVec, PALETTE } from './kit.js';

const PI = Math.PI, DEG = PI / 180;

/* how each kind of plant moves: bend at full stir (radians at the tip) and how late the tip reacts (s).
 * (ids that plants.js does not have are simply left out.) */
const KIND = {
  banana:    { ids: ['bananaA', 'bananaB', 'bananaC'], wind: 0.06, lag: 0.36 },
  deep:      { ids: ['bananaA', 'bananaC', 'bananaA', 'alocasiaA', 'monsteraA', 'monsteraB', 'bananaB'], wind: 0.06, lag: 0.36 },   // big broad leaves for the outer edge of the frame: mostly the deep-toned ones, a lighter one now and then so the edge never closes into one dark mass
  arch:      { ids: ['bananaD'], wind: 0.06, lag: 0.4 },                  // seen side-on, arching over: its `flip` says which way
  bopLeaf:   { ids: ['bopLeafA', 'bopLeafB'], wind: 0.035, lag: 0.2 },
  fan:       { ids: ['fanA', 'fanB'], wind: 0.04, lag: 0.26 },
  monstera:  { ids: ['monsteraA', 'monsteraB'], wind: 0.05, lag: 0.3 },
  alocasia:  { ids: ['alocasiaA', 'alocasiaB'], wind: 0.045, lag: 0.3 },
  calathea:  { ids: ['calatheaA', 'calatheaB'], wind: 0.04, lag: 0.24 },
  frond:     { ids: ['frondA', 'frondB', 'frondC', 'frondD'], wind: 0.09, lag: 0.46 },
  liana:     { ids: ['lianaA'], wind: 0.07, lag: 0.5 },
  curtain:   { ids: ['bananaA', 'bananaC', 'bananaB', 'alocasiaB', 'bananaA', 'monsteraA'], wind: 0.05, lag: 0.4 },   // the long broad blades that lie across the names until the last curtain opens
  hang:      { ids: [], wind: 0.05, lag: 0.55 },                          // the banana bunches and blossoms (ids from HANG)
};
/* THE HANGING BANANAS (the White Lotus accents): a bunch of ochre bananas on a thick stalk that comes
 * down from above the frame, and the maroon blossom hanging below it on the end of the same stalk.
 * Two sprites, one plant: the blossom's pivot sits on the bunch's `tail` (plants.js: where its stalk
 * ends, out of sight among the last fingers) and it is drawn behind the bunch, so the stalk runs on.
 *   blossom   length of the blossom sprite ÷ length of the bunch sprite (its bare stalk is 60% of it) */
const HANG = { bunch: 'bananaBunch', blossom: 'bananaBlossom', ratio: 0.86 };
/* THE MONKEY: one, hanging by a hand from the bottom of the upper-left bunch (plants.js paints it), and
 * swinging there slowly, like a weight on a string. It is a part of that plant: it rides on the bunch,
 * so it also moves with it. Where it hangs, the bunch has no blossom below it (it would be behind it).
 *   size    its length (hand to the bottom of its tail) ÷ the length of the bunch. (On a phone it used to come out at about 0.75,
 *           made smaller until it cleared the flags; Kyle asked for it slightly bigger. Where it hangs now it is not in their way.)
 *   grip    where on the LOWEST BANANA of the bunch its hand closes: 0 = 70% of the way along that banana, 1 = its very tip.
 *           (plants.js says where that banana is: `low`. So the hand is ON a banana in every layout; it used to be put a set
 *           distance down the bunch, which on a phone left it in the air a few pixels below the fruit.)
 *   swing   how far it swings each way (radians: 0.17 is about 10 degrees)
 *   swings  how many whole swings in the 600-second loop (a whole number, so there is no seam): 126 = one every 4.8 s */
const MONKEY = { id: 'monkey', spot: 'upper left', size: 0.88, grip: 0.55, swing: 0.17, swings: 126 };

/* Tint per layer: a colour MULTIPLIER on the painted texture. The sprites are painted at their final
 * gouache values (plants.js), so these all sit close to 1: they only give each leaf its own shade
 * (`vary`: lighter/darker and warmer/cooler by up to that much). Anything much under 0.9 crushes the
 * deep greens to black. How faint each layer is printed is set in scene.js (LOOK.layer). */
const GRADE = {
  back:  { mul: [1.04, 1.03, 0.98], vary: 0.09 },
  mid:   { mul: [1.03, 1.03, 1.0], vary: 0.1 },
  focal: { mul: [1.02, 1.02, 1.0], vary: 0.1 },
  near:  { mul: [0.97, 0.98, 0.94], vary: 0.09 },
  pass:  [                                                   // the wallpaper that parts before the camera, nearest first
    { mul: [0.97, 0.98, 0.95], vary: 0.08 },
    { mul: [0.99, 1.0, 0.97], vary: 0.09 },
    { mul: [1.0, 1.0, 0.98], vary: 0.1 },
    { mul: [1.0, 1.0, 1.0], vary: 0.11 },
    { mul: [1.01, 1.01, 1.0], vary: 0.11 },
    { mul: [1.02, 1.01, 1.0], vary: 0.11 },
    { mul: [1.02, 1.02, 1.0], vary: 0.11 },
    { mul: [1.03, 1.02, 1.0], vary: 0.11 },
    { mul: [1.04, 1.03, 1.0], vary: 0.11 },
    { mul: [1.05, 1.04, 1.0], vary: 0.11 },
  ],
};
export const SHELLS = GRADE.pass.length;
/* THE WALLPAPER, shell by shell (nearest first): how many plants, how many of those are broad leaves
 * laid right across the middle (`across`), how long they may be (× S), and `part`: the moment the first
 * leaf of the shell (the one nearest the middle) is touched (s). It leans the other way for a fifth of
 * a second before it swings, and the middle of a shell is open about half a second after its `part`.
 * The rest of the shell follows within SWING.stagger, outermost last. The shells go one after another,
 * 0.08 s apart at first and 0.045 by the end, quicker as the camera gathers speed: a wave running ahead
 * of it into the jungle.
 * (The first `part` is how long the painted sheet is held; the last decides when the gold is first seen:
 * about half a second after it.)
 * The four nearest are the picture the shot opens on (composed together, big bold leaves); the six
 * behind are the thickness of the jungle: each covers the middle by itself. */
const WALL = [
  { n: 4, across: 0, len: [0.42, 0.7], part: 0.24 },
  { n: 4, across: 0, len: [0.4, 0.66], part: 0.32 },
  { n: 5, across: 0, len: [0.36, 0.6], part: 0.395 },
  { n: 6, across: 0, len: [0.32, 0.54], part: 0.465 },
  { n: 9, across: 5, len: [0.28, 0.46], part: 0.525 },
  { n: 9, across: 5, len: [0.28, 0.46], part: 0.58 },
  { n: 9, across: 5, len: [0.28, 0.46], part: 0.635 },
  { n: 9, across: 5, len: [0.28, 0.46], part: 0.685 },
  { n: 9, across: 5, len: [0.28, 0.46], part: 0.73 },
  { n: 9, across: 5, len: [0.28, 0.46], part: 0.775 },
];
/* the bananas of the first frame: which shell, where the stalk enters (× W), how long the bunch is (× S, and
 * never hanging further than `drop` × H with its blossom), lean off the vertical, which way it is turned */
const WALL_HANG = [
  { shell: 0, fx: 0.29, len: 0.5, drop: 0.56, lean: 0.06, flip: 1 },
  { shell: 0, fx: 0.86, len: 0.31, drop: 0.36, lean: -0.1, flip: -1 },
];
const WALL_FRONT = 4;             // the shells before this one are composed together (the opening picture); from this one on, each covers the sheet by itself
const WALL_BARE = 0.27;           // how much of the sheet the opening picture may leave open (by the coarse count): deeper leaves show there
/* THE SWING of a leaf of the wallpaper (the motion itself is LEAF_VERT in shaders.js; the spring is
 * LOOK.spring.pass in scene.js). Ranges are [least, most]: every leaf draws its own.
 *   clear    the angle is worked out so that the leaf is outside what the camera sees this long after it is touched (s)
 *   mag      no leaf is still in shot once it would be seen at more than this many times its printed size
 *            (a shell that would be is spread over less time, in the same order)
 *   ant      the anticipation: how far it leans the OTHER way first, into the push (radians)
 *   stagger  how much later than the first the outermost leaf of a shell is touched (s)
 *   least    the least any leaf swings, however little it would take to clear (radians)
 *   tipLag   how late the tip is behind the stalk (s): this is what bends the blade and makes the tip trail and overshoot
 *   tempo    how fast the leaf runs its spring: a long heavy one … a short light one (× the layer's) */
const SWING = { clear: 0.7, mag: 2.1, ant: [0.1, 0.16], stagger: 0.3, least: [0.72, 1.15], tipLag: [0.18, 0.3], tempo: [0.88, 1.12] };
/* THE LAST CURTAIN: `most` = the most a leaf of each ring is bent in over the middle (radians at its
 * tip; the far rings, printed fainter, only lean: the leaves that lie across the names are full-strength
 * ones). The first leaf opens at TL.open (main.js): the one lying nearest the middle. `spread` = how
 * much later the outermost opens (s), `ease` = how the ones in between are spaced (1 = evenly by how
 * far out they lie; more = the middle clears briskly and the outer leaves follow more and more spread
 * out, so the opening eases out as the camera lands), `ring` = a ring's own small delay (the nearest
 * ring leads), `tipLag` = how late a leaf's tip is behind its stalk (s). */
const CURTAIN = { most: { near: 1.35, focal: 1.35, mid: 0.75, back: 0.3 }, spread: 1.2, ease: 1.45, ring: { near: 0, focal: 0.04, mid: 0.09, back: 0.14 }, tipLag: [0.18, 0.3] };

/* papel picado: the six house colours, in the same order as the swatches under the names */
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

/** the hull circles of a placement, on screen: calls fn(x, y, r) for each */
function eachHull(sp, x, y, len, a, flip, fn) {
  const ca = Math.cos(a), sa = Math.sin(a);
  for (const [hx, hy, hr] of sp.hull) {
    const lx = hx * flip * len, ly = hy * len;
    fn(x + lx * ca + ly * sa, y - (-lx * sa + ly * ca), hr * len);
  }
}
/* does this placement touch any keep-out rectangle? (uses the sprite's hull circles) */
function touches(sp, x, y, len, a, flip, rects, margin) {
  let hit = false;
  eachHull(sp, x, y, len, a, flip, (px, py, r0) => {
    if (hit) return;
    const r = r0 + margin;
    for (const q of rects) {
      const dx = Math.max(q.l - px, 0, px - q.r), dy = Math.max(q.t - py, 0, py - q.b);
      if (dx * dx + dy * dy < r * r) { hit = true; return; }
    }
  });
  return hit;
}

/**
 * @param F       frame: { W, H, S (= √(W·H), the size unit), safe: {l,t,r,b} rectangle round all of the copy (px),
 *                         lines: [{l,t,r,b}…] one rectangle per line of copy, tight: the same, each line of the names
 *                         only as wide as its words (optional), replay: rectangle of the Replay control (or null) }
 * @param sprites sprite table from plants.js
 * @param TL      timeline cues (seconds) from main.js
 * @param view    what compose needs to know about the camera (scene.js):
 *                  aim(x, y)             tell it where the middle of the gold field is (px), before anything else is asked;
 *                  paintAt(id, u, v)     how solidly drawing `id` is painted at a point of its own cell (0 … 1);
 *                  shellMag(i, t, z)     how many times its printed size a leaf of wallpaper shell i is seen at time t;
 *                  shellWhen(i, mag)     the moment that reaches `mag`;
 *                  ringScale(layer, t)   how big a ring of the resting frame is seen at time t (1 = at rest);
 *                  hiddenAfter(x, y, layer)  the last moment of the camera move at which a point of the resting
 *                                        frame (px) on that layer is still inside the picture;
 *                  landed                when the camera move is over
 * @returns { layers, glow: {x, y, rx, ry} the gold field (px), string, flags, hangSpots, curtain: how the last curtain closed }
 */
export function compose(F, sprites, TL, view, seed = 2027) {
  const { W, H, S, safe } = F;
  const L = { back: [], mid: [], focal: [], near: [] };
  for (let i = 0; i < SHELLS; i++) L['pass' + i] = [];
  const cx = (safe.l + safe.r) / 2;
  const portrait = W / H < 0.75;
  /* The copy, line by line. Leaves keep clear of every line, but may come into the shoulders beside the
   * short ones: that is what makes the edge of the opening the shape of leaves and not of a box. */
  const lines = F.lines && F.lines.length ? F.lines : [safe];
  const ids = {};
  for (const k of Object.keys(KIND)) ids[k] = KIND[k].ids.filter((id) => sprites[id]);
  const has = (kind) => (ids[kind] && ids[kind].length ? kind : 'banana');

  /* ---------------------------------------------------------------------------------------------
   * THE FESTOON: papel picado in the six house colours, strung across the upper part of the opening
   * so its lowest flags hang just clear of the copy. The string runs up and out behind the foliage
   * at the two top corners, so its ends are tucked away. (Worked out first: the canopy is composed
   * around it.)
   * ------------------------------------------------------------------------------------------- */
  const clear = 0.024 * S;                                                       // air between the lowest flags and the copy
  let flagH = clamp(0.061 * S, 30, Math.max(60, 0.03 * S)) * (portrait ? 1.1 : 1) * 1.3;
  flagH = Math.max(18, Math.min(flagH, safe.t - clear - 0.035 * H));             // a short screen gets smaller flags
  const flagW = flagH / 1.3;
  const flagTop = Math.max(0.02 * H, safe.t - clear - flagH);                    // the string at its lowest, mid-frame
  const swag = Math.min(flagTop - 0.012 * H, clamp(0.075 * H, 0.05 * S, 0.13 * S));
  const tiltY = Math.min(0.012 * H, swag * 0.25);
  const string = { ax: -0.08 * W, ay: flagTop - swag - tiltY, bx: 1.08 * W, by: flagTop - swag + tiltY, sag: swag, depth: 10.6 };
  const stringY = (x) => { const s = clamp((x - string.ax) / (string.bx - string.ax)); return lerp(string.ay, string.by, s) + string.sag * 4 * s * (1 - s); };
  const nFlags = Math.max(6, Math.floor((string.bx - string.ax) / (flagW * 1.13)));
  const RF = rng(seed + 40);
  const flags = Array.from({ length: nFlags }, (_, i) => ({ s: (i + 0.5) / nFlags, seed: RF.f(), design: (i * 2 + (i % 3 === 2 ? 1 : 0)) % 3, dye: FLAG_DYES[i % 6] }));
  /* where the flags hang, as a run of boxes along the string: every ring of the frame keeps out, so
   * the tissue hangs against the open sheet. The outer eighth at each end is left to the leaves. */
  const flagBand = [];
  for (let i = 0, n = 7; i < n; i++) {
    const xa = lerp(0.13 * W, 0.87 * W, i / n), xb = lerp(0.13 * W, 0.87 * W, (i + 1) / n);
    flagBand.push({ l: xa, r: xb, t: Math.min(stringY(xa), stringY(xb)) - 0.004 * S, b: Math.max(stringY(xa), stringY(xb)) + flagH });
  }

  /* ---------------------------------------------------------------------------------------------
   * THE OPENING and the gold field in it. Top: where the canopy stops, just above the string. Bottom:
   * where the thicket starts, just under the copy. The gold sits in that, a little above its middle
   * (js/ground.js paints it from `glow`); it is where the camera is heading, so every layer of the
   * wallpaper slides away from this point.
   * ------------------------------------------------------------------------------------------- */
  const openT = flagTop - 0.02 * S, openB = Math.min(H - 0.08 * S, safe.b + 0.07 * S);
  const glow = { x: cx, y: lerp(openT, openB, 0.47), ry: (openB - openT) / 2,
                 rx: Math.min((safe.r - safe.l) / 2 + 0.075 * S, Math.max(cx, W - cx) - 0.015 * S) };
  view.aim(glow.x, glow.y);

  /** build one placement. p: {x,y (root, px), len (px), a (heading), avoid (px margin or undefined), min (px), rects} */
  const make = (kind0, R, g, p) => {
    const kind = p.id ? kind0 : has(kind0);
    let id, flip;
    if (kind === 'frond') ({ id, flip } = frondFor(p.a, R));
    else { id = p.id || R.pick(ids[kind]); flip = p.flip || R.sign(); }
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
    return { id, x: p.x, y: p.y, len, a, flip, tint: p.tint || tintOf(g, R),
             wind: KIND[kind].wind * (p.wind ?? 1), lag: KIND[kind].lag, seed: R.f(), z: p.z ?? 0 };
  };

  /** A BANANA BUNCH hanging from (p.x, p.y) (px: a point above the frame), p.len long, leaning p.lean off
   *  the vertical, with its BLOSSOM below it on the end of the same stalk. Two placements that are one
   *  plant: same root, same heading, same sway (the blossom rides on the bunch's `tail` the way the
   *  bird of paradise's sepals ride on its stalk), the blossom listed first so it is drawn behind.
   *  With p.rects it is shortened until both clear them; null if it cannot.
   *  Returns { parts: [blossom, bunch], tail: [x, y] (px, where the blossom hangs from), total (px) }. */
  const hangPair = (R, p) => {
    const bs = sprites[HANG.bunch], fs = sprites[HANG.blossom];
    if (!bs) return null;
    const joined = !!(fs && bs.tail), a = PI + p.lean, flip = p.flip, ca = Math.cos(a), sa = Math.sin(a);
    const tailAt = (len) => { const lx = bs.tail[0] * flip * len, ly = bs.tail[1] * len; return [p.x + lx * ca + ly * sa, p.y - (-lx * sa + ly * ca)]; };
    let len = p.len;
    if (p.rects) {
      let ok = false;
      for (let i = 0; i < 12 && len >= p.min; i++, len *= 0.92) {
        if (touches(bs, p.x, p.y, len, a, flip, p.rects, p.avoid)) continue;
        if (joined) { const [tx, ty] = tailAt(len); if (touches(fs, tx, ty, len * HANG.ratio, a, flip, p.rects, p.avoid)) continue; }
        ok = true; break;
      }
      if (!ok) return null;
    }
    const total = joined ? len * (bs.tail[1] + HANG.ratio) : len;
    const base = { x: p.x, y: p.y, a, flip, tint: p.tint || [1, 1, 1], wind: KIND.hang.wind * (p.wind ?? 1), lag: KIND.hang.lag, seed: R.f(), plantLen: total, flower: 1 };
    const parts = [];
    if (joined) parts.push({ ...base, id: HANG.blossom, len: len * HANG.ratio, head: [bs.tail[0] * len, bs.tail[1] * len], z: p.z });
    parts.push({ ...base, id: HANG.bunch, len, z: p.z + 0.02 });
    return { parts, tail: joined ? tailAt(len) : [p.x, p.y], total, len };
  };

  /** which way a leaf has to turn for its tip to move toward the middle of the glow (+1 / -1), and how far its tip is from it (× S) */
  const inward = (pl) => {
    const tipX = pl.x + Math.sin(pl.a) * pl.len * 0.8, tipY = pl.y - Math.cos(pl.a) * pl.len * 0.8;
    return { s: Math.sign(Math.cos(pl.a) * (glow.x - tipX) + Math.sin(pl.a) * (glow.y - tipY)) || 1, d: Math.hypot(glow.x - tipX, glow.y - tipY) / S };
  };
  /* THE FRAME, plant by plant, as it is composed: { layer, parts: [placements that are one plant], … }.
   * "THE LAST CURTAIN" below goes through this list and shuts each one over the middle. */
  const FRAME = [];
  let blades = 0;                                             // how many of THE CURTAIN LEAVES found room
  const lastIn = view.landed - 0.65;
  /** one plant of the resting frame is done: note it for the curtain. (A plant whose root is ever in shot
   *  used to draw two numbers from its seeded sequence here, for the way it once grew in. They are still
   *  drawn and thrown away, so that the resting frame stays, leaf for leaf, the one that was approved.) */
  const settle = (pl, layer, R, opt) => {
    if (Math.min(view.hiddenAfter(pl.x, pl.y, layer), lastIn) > 0) { R.range(0.03, 0.22); R.range(0.3, 0.5); }
    FRAME.push({ layer, parts: [pl], ...opt });
    return pl;
  };
  /** the hull circles of a placement in its own plant's frame, px: [across, along, radius] (flower parts ride at `head`) */
  const circlesOf = (pl) => sprites[pl.id].hull.map(([hx, hy, hr]) => [(hx * pl.len + (pl.head ? pl.head[0] : 0)) * pl.flip, hy * pl.len + (pl.head ? pl.head[1] : 0), hr * pl.len]);
  const wrap = (a) => ((a + PI) % (2 * PI) + 2 * PI) % (2 * PI) - PI;

  /* ---------------------------------------------------------------------------------------------
   * HEROES: two bird of paradise plants at the focal plane, flowers facing in toward the names.
   * Each stands in bud in the thicket from the start (it leans and settles with the leaves round it as
   * the last curtain opens), then opens (the sepals are separate parts). A few deep leaves stand right
   * behind each flower, so the orange and the cobalt sit on dark green.
   * ------------------------------------------------------------------------------------------- */
  const crests = [];                                        // the box each open flower fills, for deepening what is behind it
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
      const windSeed = R.f(), wind = 0.03;
      const base = { x: rootX, y: rootY, a, flip: h.face, wind, lag: 0.22, seed: windSeed, plantLen: len };
      const plant = [];                                                                    // stalk and flower parts: one plant, it moves as one
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
        plant.push({ ...base, id: f.id, len: sp * f.len, tint: f.tint, flower: 1, z: 0.3 + j * 0.002, head: [px, py],
                     bloom: [st.beak - f.off * DEG + R.range(-0.04, 0.04), st.beak - 3 * DEG, t0 + order * TL.sepalGap, 0.12] });
      });
      plant.push({ ...base, id: 'bopStalk', len, tint: [1.0, 1.0, 1.0], z: 0.32 });
      L.focal.push(...plant);
      FRAME.push({ layer: 'focal', parts: plant, main: plant[plant.length - 1], most: 0.26 });
      const fx = h.x + h.face * sp * 0.3, fy = h.y - sp * 0.5;                              // middle of the crest
      crests.push({ l: fx - sp * 0.62, r: fx + sp * 0.62, t: fy - sp * 0.7, b: fy + sp * 0.45 });
      flowerKeep.push({ l: h.x - sp * 0.9, r: h.x + sp * 0.9, t: h.y - sp * 1.5, b: h.y + sp * 0.25 });
      // the green it blooms against: paddles standing right behind the crest, rooted below the frame (the
      // deepest-painted sprites, at nearly their own value: multiplied down they closed up into a black hole)
      const rootB = H + 0.14 * S;
      [[-0.62, 'bananaA', 0.06], [0.08, 'monsteraA', 0.3], [0.66, 'bananaC', 0.0], [0.3, 'bananaA', -0.16]].forEach(([u, id, up], i) => {
        const tipX = fx + u * sp * 1.15 + R.range(-0.015, 0.015) * S, tipY = fy - sp * (0.78 + up) - R.range(0, 0.025) * S;
        const la = u * 0.26 + R.range(-0.08, 0.08);
        const pl = make(id.startsWith('mon') ? 'monstera' : 'banana', R, g, { id, x: tipX - Math.tan(la) * (rootB - tipY), y: rootB, a: la, len: (rootB - tipY) / Math.cos(la),
                        avoid: 0.03 * S, min: 0.3 * S, tint: tintOf(g, R).map((v) => v * (i === 3 ? 1.0 : 0.94)), z: -0.7 - i * 0.04 });
        if (pl) L.focal.push(settle(pl, 'focal', R));
      });
      // its own leaves: upright grey-green paddles, a couple behind the flower and a couple in front, lower
      const leaves = 4;
      for (let i = 0; i < leaves; i++) {
        const front = i >= 2;
        const la = a + (i - (leaves - 1) / 2) * R.range(0.2, 0.3) - h.face * 0.12 + R.range(-0.06, 0.06);
        const ll = len * (front ? R.range(0.5, 0.68) : R.range(0.82, 1.12));
        const pl = make('bopLeaf', R, g, { x: rootX + R.range(-0.02, 0.02) * S, y: rootY + R.range(0, 0.03) * S, len: ll, a: la, avoid: 0.03 * S, min: len * 0.35,
                                           rects: [...lines, { l: fx - sp * 0.5, r: fx + sp * 0.5, t: fy - sp * 0.55, b: fy + sp * 0.3 }], z: front ? 0.5 : 0.1 + i * 0.01 });
        if (pl) L.focal.push(settle(pl, 'focal', R));
      }
    });
  }

  /* ---------------------------------------------------------------------------------------------
   * THE FRAME: plants reaching in from every edge, ring behind ring, never across the copy at rest.
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
    const add = (kind, x, y, a, out, reach, margin = o.margin, flip = 0) => {
      const pl = make(kind, R, g, { x, y, a, flip, len: out + reach, avoid: margin * S, min: out + Math.min(o.min * S, reach * 0.55), rects: o.rects, z: R.range(o.z[0], o.z[1]) });
      if (!pl) return;
      // a leaf that ends up behind a flower is printed deeper, so the orange and cobalt sit on dark green
      if (o.shade && touches(sprites[pl.id], pl.x, pl.y, pl.len, pl.a, pl.flip, crests, 0)) pl.tint = pl.tint.map((v) => v * o.shade);
      list.push(settle(pl, name, R));
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
        add(kind, sgn < 0 ? -depth : W + depth, ty + Math.cos(lean) * (out + reach), -sgn * lean, out, reach);   // from the left lean right, and vice versa
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
        add(kind, sgn < 0 ? -depth : W + depth, ty + Math.cos(lean) * (out + reach), -sgn * lean, out, reach, ri.margin);
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
      add(kind, x, y, a, out, len - out, o.margin, kind === 'arch' ? -sgn : 0);   // (an arching leaf arches INTO the picture)
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
        const kind = Math.abs(Math.sin(a)) < 0.45 ? R.pick(tp.hang || ['frond']) : R.pick(tp.kinds);   // only things drawn to hang hang straight down
        // over the flags the canopy may only hang as far as the string: size the frond to the room there
        const out = enter(x, y, a), want = R.range(tp.reach[0], tp.reach[1]) * S, tipX = x + Math.sin(a) * (out + want * 0.7);
        const over = o.rects !== lines && tipX > 0.13 * W && tipX < 0.87 * W;
        const reach = over ? Math.min(want, Math.max(0.05 * S, stringY(tipX) - (o.margin + 0.03) * S) / Math.max(0.4, Math.abs(Math.cos(a)))) : want;
        add(kind, x, y, a, out, reach);
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

  /* BACK: the farthest ring of the frame: printed faintest, standing highest */
  ring('back', rng(seed + 3), GRADE.back, {
    rects: copyAndFlags, margin: 0.03, min: 0.07, z: [-1, 1],
    bottom: { kinds: ['banana', 'banana', 'fan', 'monstera', 'frond', 'bopLeaf', 'alocasia'], gap: 0.085, off: 0.1, jit: 0.02, tip: (x) => openB - 0.012 * S + wave(x, 0.6) - edgeLift(x) * 0.1 * S },
    side: { kinds: ['banana', 'frond', 'frond', 'monstera'], gap: 0.11, off: 0.2, lean: [24, 68], fill: [0.6, 1.05], max: 0.26, from: 0.1, to: 0.84 },
    top: { kinds: ['frond', 'banana'], off: 0.2, reach: [0.2, 0.3], across: 0.17 } });
  /* MID: nearer, stronger, overlapping the edge of the glow */
  ring('mid', rng(seed + 20), GRADE.mid, {
    rects: copyAndFlags, margin: 0.032, min: 0.06, z: [-1, 0.6], shade: 0.93,
    bottom: { kinds: ['banana', 'fan', 'monstera', 'frond', 'banana', 'alocasia', 'calathea'], gap: 0.095, off: 0.11, jit: 0.025, tip: (x) => openB + 0.012 * S + wave(x, 2.1) - edgeLift(x) * 0.13 * S },
    side: { kinds: ['banana', 'frond', 'banana', 'frond', 'monstera', 'banana'], gap: 0.1, off: 0.19, lean: [20, 62], fill: [0.5, 1.0], max: 0.23, from: 0.07, to: 0.9 },
    reachIn: { kinds: ['banana', 'frond', 'banana', 'monstera'], gap: 0.1, off: 0.16, lean: [56, 92], fill: [0.85, 1.1], max: 0.24, margin: 0.02, from: 0.12, to: 0.86 },
    stand: { kinds: ['banana', 'banana', 'frond', 'bopLeaf', 'monstera', 'arch'], gap: 0.14, lean: [5, 16], len: [0.36, 0.62], inset: [-0.04, 0.035], from: 0.1, to: 0.9 },
    top: { kinds: ['frond', 'frond', 'banana'], hang: ['frond', 'frond', 'liana'], off: 0.2, reach: [0.17, 0.27],
           across: 0.2, crowns: cornerCrowns(84, 150, 4, 0.02, 0.2) } });
  /* FOCAL: the main ring (the heroes above are part of it): thicket, slim sides, canopy */
  ring('focal', rng(seed + 21), GRADE.focal, {
    rects: copyAndFlags, margin: 0.032, min: 0.07, z: [-1, 0.2], shade: 0.93,
    bottom: { kinds: ['banana', 'monstera', 'banana', 'fan', 'frond', 'alocasia', 'calathea'], gap: 0.1, off: 0.15, jit: 0.03, tip: (x) => openB + 0.05 * S + wave(x, 3.7) - edgeLift(x) * 0.16 * S },
    side: { kinds: ['banana', 'frond', 'frond', 'monstera', 'banana'], gap: 0.085, off: 0.15, lean: [12, 56], fill: [0.45, 1.0], max: 0.2, from: 0.05, to: 0.94 },
    reachIn: { kinds: ['banana', 'frond', 'banana', 'monstera', 'banana'], gap: 0.075, off: 0.13, lean: [54, 92], fill: [0.6, 0.95], max: 0.2, margin: 0.02, from: 0.14, to: 0.9 },
    stand: { kinds: ['banana', 'banana', 'arch', 'frond', 'monstera', 'bopLeaf'], gap: 0.1, lean: [4, 15], len: [0.34, 0.7], inset: [-0.05, 0.03], from: 0.08, to: 0.94 },
    top: { kinds: ['frond', 'banana', 'banana'], hang: ['frond', 'frond', 'liana'], off: 0.13, reach: [0.17, 0.28],
           across: 0.2, crowns: cornerCrowns(78, 156, 5, 0.035, 0.09) } });
  /* NEAR: the outer ring. Big leaves at the edges and corners only: banana paddles rising from the
   * bottom corners, fronds arching in from the top corners, fans and monstera low along the bottom. */
  ring('near', rng(seed + 22), GRADE.near, {
    rects: [...lines, ...flagBand.slice(1, -1), ...flowerKeep], margin: 0.03, min: 0.07, z: [-1, 1],   // (the first and last flags are left to it: the string's ends are tucked behind these leaves)
    bottom: { kinds: ['deep', 'fan', 'monstera', 'deep', 'alocasia', 'frond'], gap: 0.2, off: 0.24, lean: 0.8,
              jit: 0.05, tip: (x) => lerp(H - 0.1 * S, Math.max(glow.y + 0.12 * S, H - 0.5 * S), corner(x)) },
    side: { kinds: ['deep', 'frond', 'deep'], gap: 0.22, off: 0.24, lean: [8, 36], fill: [0.4, 0.9], max: 0.13, from: 0.3, to: 1 },
    stand: { kinds: ['deep', 'deep', 'frond'], gap: 0.19, lean: [4, 13], len: [0.6, 0.9], inset: [-0.09, -0.01], from: 0.16, to: 1 },
    top: { kinds: ['frond', 'banana'], off: 0.2, reach: [0.3, 0.5], crowns: [[-0.16, -0.01, 98, 148, 3], [1.14, 0.03, -168, -104, 4]] } });   // the right-hand crown is the bigger: the frame is never a mirror

  /* ---------------------------------------------------------------------------------------------
   * THE HANGING BANANAS, in the upper corners, in front of everything (as in the titles, where the
   * bunches hang across the leaves): each a thick stalk coming down from above the frame, a bunch of
   * ochre bananas on it and, below on the end of the same stalk, the maroon blossom.
   *   SPOT "upper left"   the larger: its stalk enters at 16% across, the blossom hangs beside the names
   *   SPOT "upper right"  the smaller: 85% across, hanging less far
   * They hang over the two ends of the string (its first and last flags are tucked behind them) and
   * are kept off the copy and off the middle flags like everything else: shortened until they clear.
   * ------------------------------------------------------------------------------------------- */
  const hangSpots = [];
  {
    const R = rng(seed + 12);
    const keepOff = [...(F.tight && F.tight.length ? F.tight : lines), ...flagBand.slice(3, -3)];   // (the words themselves, and the middle of the string: they hang across its ends, and the blossom may hang beside the short name)
    [{ name: 'upper left', fx: 0.15, k: 1.0, lean: 0.05, flip: 1 }, { name: 'upper right', fx: 0.86, k: 0.8, lean: -0.07, flip: -1 }].forEach((sp) => {
      const top = -0.08 * S, want = Math.min(0.3 * S, (0.42 * H) / 1.67) * sp.k;
      const h = hangPair(R, { x: sp.fx * W, y: top, len: want, lean: sp.lean, flip: sp.flip, rects: keepOff, avoid: 0.02 * S, min: want * 0.45,
                              z: sp.name === MONKEY.spot ? 1.06 : 0.9 });   // (the monkey's bunch hangs in FRONT of every leaf round it: the banana it holds must be in sight, on any screen)
      if (!h) return;
      const ms = sprites[MONKEY.id], bs = sprites[HANG.bunch];
      if (sp.name === MONKEY.spot && ms && bs.tail) {
        const bunch = h.parts[h.parts.length - 1], ca = Math.cos(bunch.a), sa = Math.sin(bunch.a);
        const low = bs.low, g = MONKEY.grip;                                                    // its hand is on the lowest banana of the bunch …
        const hx = (low ? lerp(low[0][0], low[1][0], g) : bs.tail[0]) * h.len, hy = (low ? lerp(low[0][1], low[1][1], g) : 0.97) * h.len, lx = hx * sp.flip;   // … which is here in the bunch's own frame (across, along)
        const gx = bunch.x + lx * ca + hy * sa, gy = bunch.y - (-lx * sa + hy * ca);            // … and on the page
        let ml = h.len * MONKEY.size, fits = false;                                              // kept off the words and the middle flags, like the bunch: smaller until it clears
        const clear = (len) => [-1, 0, 1].every((d) => !touches(ms, gx, gy, len, bunch.a + d * MONKEY.swing, sp.flip, keepOff, 0.012 * S));   // (at both ends of its swing too)
        for (let i = 0; i < 9 && ml >= h.len * MONKEY.size * 0.55; i++, ml *= 0.93) if (clear(ml)) { fits = true; break; }
        if (fits) {
          h.parts = h.parts.filter((q) => q.id !== HANG.blossom);                                 // no blossom behind the monkey
          h.parts.push({ ...bunch, id: MONKEY.id, len: ml, head: [hx, hy], z: bunch.z + 0.02, sway: [MONKEY.swing, MONKEY.swings, 0.6] });
        }
      }
      settle(h.parts[0], 'near', R); FRAME.pop();
      FRAME.push({ layer: 'near', parts: h.parts, main: h.parts.find((q) => q.id === HANG.bunch), most: 0.5 });   // (it swings like the weight on a string that it is: not far)
      L.near.push(...h.parts);
      hangSpots.push({ spot: sp.name, x: Math.round(sp.fx * W), bunchTipY: Math.round(top + h.len * Math.cos(sp.lean)), blossomTipY: Math.round(top + h.total * Math.cos(sp.lean)) });
    });
  }

  /* ---------------------------------------------------------------------------------------------
   * THE CANOPY ABOVE THE FRAME: the jungle does not stop where the resting picture does. While the
   * camera is still on its way the frame is seen from further back, and what is above and beside its
   * top comes into shot. So more plants hang and arch in up there, round the top half of the frame,
   * ring behind ring, every one of them ending just OUTSIDE the resting picture (it never changes
   * that). `far` = how far beyond the edge they are rooted, in half-frames.
   * ------------------------------------------------------------------------------------------- */
  {
    const R = rng(seed + 52), outside = [{ l: 0, t: 0, r: W, b: H }];
    for (const [layer, far, n] of [['near', 1.05, 15], ['near', 0.56, 13], ['focal', 0.36, 13], ['mid', 0.24, 10]]) for (let i = 0; i < n; i++) {
      const u = (i + R.range(0.15, 0.85)) / n * 2 - 1;                                    // round the top half, -1 … 1, a little thicker over the two corners
      const phi = (u * 112 + 14 * Math.sin(u * PI * 2)) * DEG;                             // (0 = straight above the middle)
      const x = W / 2 + Math.sin(phi) * (0.5 + far * R.range(0.8, 1.15)) * W, y = H * 0.42 - Math.cos(phi) * (0.42 + far * R.range(0.8, 1.15) * 0.5) * H;
      // it points in at the picture: whatever is rooted above hangs, whatever is rooted beside leans in and up a little
      const to = Math.atan2(W / 2 + R.range(-0.3, 0.3) * W - x, -(H * R.range(0.1, 0.5) - y));
      const a = to + R.range(-0.3, 0.3), kind = R.pick(Math.abs(Math.sin(a)) < 0.5 ? ['frond', 'frond', 'banana', 'liana'] : ['banana', 'frond', 'banana', 'monstera', 'frond', 'alocasia']);
      const pl = make(kind, R, GRADE[layer], { x, y, a, len: R.range(0.36, 0.62) * S, avoid: 0.004 * S, min: 0.16 * S, rects: outside, z: R.range(-1, -0.3) });
      if (!pl) continue;
      L[layer].push(pl);
      FRAME.push({ layer, parts: [pl] });
    }
  }

  /* THE THICKET BELOW THE FRAME, the same thing round the lower half: plants standing up and leaning in
   * from below the picture and from beyond the lower part of its sides, every one ending just OUTSIDE
   * the resting picture. Seen from further back, the plants of the frame would otherwise stand on bare
   * stalks down there; these are drawn in FRONT of their ring, so the stalks go down into leaves. */
  {
    const R = rng(seed + 54), outside = [{ l: 0, t: 0, r: W, b: H }];
    for (const [layer, far, n] of [['near', 0.95, 10], ['near', 0.5, 10], ['focal', 0.32, 9], ['mid', 0.2, 7]]) for (let i = 0; i < n; i++) {
      const u = (i + R.range(0.15, 0.85)) / n * 2 - 1;                                    // round the lower half, -1 (left side) … 0 (straight below) … 1 (right side)
      const phi = PI + u * 78 * DEG;
      const x = W / 2 + Math.sin(phi) * (0.5 + far * R.range(0.8, 1.15)) * W, y = H * 0.55 - Math.cos(phi) * (0.45 + far * R.range(0.8, 1.15) * 0.5) * H;
      const to = Math.atan2(W / 2 + R.range(-0.3, 0.3) * W - x, -(H * R.range(0.45, 0.9) - y));   // it points in and up at the picture
      const a = to + R.range(-0.28, 0.28), kind = R.pick(['banana', 'banana', 'monstera', 'fan', 'alocasia', 'frond', 'banana', 'calathea', 'bopLeaf']);
      const pl = make(kind, R, GRADE[layer], { x, y, a, len: R.range(0.36, 0.62) * S, avoid: 0.004 * S, min: 0.16 * S, rects: outside, z: R.range(0.3, 1) });
      if (!pl) continue;
      L[layer].push(pl);
      FRAME.push({ layer, parts: [pl] });
    }
  }

  /* … and DRAPES: plants hanging just outside the two top corners, down the outside of the frame's
   * edges, where the corner crowns have nothing behind them. (They may show a finger's width at the
   * very edge of the resting picture, behind everything else there.) */
  {
    const R = rng(seed + 53), inset = 0.035 * S, keepOff = [...lines, ...flagBand, { l: inset, t: inset, r: W - inset, b: H - inset }];
    for (const [layer, n, xr, yr, lr] of [['near', 3, [0.07, 0.36], [0.34, 0.44], [0.52, 0.68]], ['focal', 3, [0.02, 0.2], [0.2, 0.28], [0.4, 0.54]], ['mid', 2, [0.0, 0.14], [0.14, 0.2], [0.34, 0.46]]])
      for (const sgn of [-1, 1]) for (let i = 0; i < n; i++) {
        const off = lerp(xr[0], xr[1], (i + R.range(0.1, 0.9)) / n) * W, a = PI + R.range(-0.2, 0.2);
        const pl = make(R.pick(['frond', 'banana', 'frond', 'liana', 'banana']), R, GRADE[layer],
                        { x: sgn < 0 ? -off : W + off, y: -R.range(yr[0], yr[1]) * H, a, len: R.range(lr[0], lr[1]) * S, avoid: 0, min: 0.2 * S, rects: keepOff, z: R.range(-1, -0.4) });
        if (!pl) continue;
        L[layer].push(pl);
        FRAME.push({ layer, parts: [pl] });
      }
  }

  /* ---------------------------------------------------------------------------------------------
   * THE CURTAIN LEAVES: a few long, broad blades rooted beyond the edges of the frame that are nearest
   * the copy, lying along those edges so that at rest they are mostly out of the picture (and behind
   * the other leaves of their ring). Their job is the last curtain: bent in about their roots they lie
   * right across the names. Like every leaf of the frame they keep off the copy at rest.
   *   a tall frame (a phone)   they stand up each side, their midribs running up the edge;
   *   a wide frame             they lie along the bottom and hang along the top, leaning away from the middle.
   * ------------------------------------------------------------------------------------------- */
  {
    const R = rng(seed + 51), tall = W / H < 0.9;
    const keepOff = [...lines, ...flagBand.slice(1, -1), ...flowerKeep];
    for (const [layer, n, z] of [['near', portrait ? 4 : 3, -0.95], ['focal', portrait ? 3 : 2, -0.9]]) for (const sgn of [-1, 1]) for (let i = 0, m = tall ? n : n + 5; i < m; i++) {   // (a wide frame needs more of them: nothing else in it is long enough to reach the names)
      const out = R.range(0.07, 0.13) * S;
      let x, y, a, len;
      if (tall) {
        x = sgn < 0 ? -out : W + out; y = H * lerp(0.5, 1.06, (i + R.range(0.15, 0.85)) / m);
        a = -sgn * R.range(-5, 8) * DEG; len = R.range(0.76, 1.02) * S;          // (the lean is toward the picture; a negative one leans out of it)
      } else {
        x = glow.x + lerp(-1.4, 1.4, (i + R.range(0.15, 0.85)) / m) * glow.rx; y = sgn < 0 ? -out : H + out;
        const lean = (x < glow.x ? -1 : 1) * R.range(68, 86) * DEG;              // lying right over, away from the middle
        a = sgn < 0 ? PI - lean : lean; len = clamp(Math.abs(y - glow.y) * R.range(1.5, 2.0), 0.4 * S, 0.95 * S);   // (long enough for the broad of the blade to reach the names when it stands up)
      }
      const pl = make('curtain', R, GRADE[layer], { x, y, a, len, avoid: 0.03 * S, min: (tall ? 0.5 : 0.3) * S, rects: keepOff, z });
      if (!pl) continue;
      L[layer].push(pl);
      FRAME.push({ layer, parts: [pl], curtain: true, most: tall ? undefined : 1.55 });
      blades++;
    }
  }

  /* ---------------------------------------------------------------------------------------------
   * THE LAST CURTAIN: the frame, shut. Every plant of the resting frame is given THE SWING it starts
   * with: bent in over the middle about its root (its tip turned furthest, its base least), and the
   * moment it springs open to where it was composed.
   * How far each bends is worked out for the picture as it is just after TL.open, the moment the
   * curtain begins to open (the camera is still some way back, so each ring is seen smaller and nearer
   * the middle than it will rest). Longest plants first, each takes the bend that covers the most of the
   * opening not yet covered, the lines of the copy counting most; a plant with nothing to add just
   * leans in a little. Then they are timed by where they lie when shut: the ones nearest the middle
   * of the gold open first, and that is what uncovers the names.
   * ------------------------------------------------------------------------------------------- */
  const curtain = { plants: FRAME.length, blades, bentFar: 0, copyCells: 0, copyBare: 0, wallStuck: 0 };
  {
    const R = rng(seed + 50);
    const tRef = TL.open + 0.1, scl = {};                      // (the last of the wallpaper is parting in front of it: this is the picture it is first seen in)
    for (const k of Object.keys(CURTAIN.ring)) scl[k] = view.ringScale(k, tRef);
    const G = Math.max(8, S / 36), nx = Math.ceil(W / G), ny = Math.ceil(H / G);
    const cover = new Float32Array(nx * ny), want = new Float32Array(nx * ny), mark = new Uint8Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = (i + 0.5) * G, y = (j + 0.5) * G, k = j * nx + i;
      want[k] = Math.hypot((x - glow.x) / glow.rx, (y - glow.y) / glow.ry) < 1.12 ? 1 : 0;
      for (const q of lines) if (x > q.l - G && x < q.r + G && y > q.t - G && y < q.b + G) want[k] = 4;
      if (want[k] === 4) curtain.copyCells++;
    }
    // how much of what is behind it a leaf hides: a broad blade all of it, a monstera most, a palm or a fan little
    const solid = (id) => (/^(banana[A-D]|alocasia|calathea|bopLeaf)/.test(id) ? 1 : /^monstera/.test(id) ? 0.8 : 0.34);
    /** the hull circles of a plant bent in by Z, as they are on screen at tRef: fn(x, y, r, solid) */
    const bent = (g, Z, fn) => {
      const s = scl[g.layer];
      for (const pl of g.parts) {
        const pLen = pl.plantLen || pl.len, so = solid(pl.id);
        for (const [lx, ly, r] of circlesOf(pl)) {
          const ang = pl.a + Z * (0.3 + 0.7 * clamp(ly / pLen)), ca = Math.cos(ang), sa = Math.sin(ang);
          fn(glow.x + (pl.x + lx * ca + ly * sa - glow.x) * s, glow.y + (pl.y - (-lx * sa + ly * ca) - glow.y) * s, r * s, so);
        }
      }
    };
    const stamp = (g, Z, commit) => {
      const touched = [];
      let gain = 0;
      bent(g, Z, (px, py, r0, so) => {
        const r = r0 * 0.85;
        for (let j = Math.max(0, Math.floor((py - r) / G)); j <= Math.min(ny - 1, Math.floor((py + r) / G)); j++)
          for (let i = Math.max(0, Math.floor((px - r) / G)); i <= Math.min(nx - 1, Math.floor((px + r) / G)); i++) {
            const k = j * nx + i, dx = (i + 0.5) * G - px, dy = (j + 0.5) * G - py;
            if (mark[k] || dx * dx + dy * dy > r * r) continue;
            mark[k] = 1; touched.push(k);
            if (cover[k] < 1) gain += want[k] * so;
            if (commit) cover[k] += so;
          }
      });
      for (const k of touched) mark[k] = 0;
      return gain;
    };
    const lenOf = (g) => { const m = g.main || g.parts[0]; return m.plantLen || m.len; };
    const order = [...FRAME].sort((p, q) => lenOf(q) * scl[q.layer] - lenOf(p) * scl[p.layer]);
    const shut = [];
    for (const g of order) {
      const m = g.main || g.parts[0], sgn = inward(m).s, most = g.curtain && g.most ? g.most : Math.min(g.most ?? 9, CURTAIN.most[g.layer]);
      let Z = 0, best = 0;
      for (let z = 0.15; z <= most + 0.001; z += 0.15) {
        const sc = stamp(g, sgn * z, false) * (1 - 0.1 * z);                  // (of two bends that cover as much, the smaller)
        if (sc > best) { best = sc; Z = z; }
      }
      if (best < 2.5) Z = Math.min(most, R.range(0.12, 0.3));                 // nothing to cover: it only leans in
      else if (Z > 0.6) curtain.bentFar++;
      stamp(g, sgn * Z, true);
      // when it opens: by how near the middle of the gold it lies while shut (in openings: 0 = on it)
      let sx = 0, sy = 0, sw = 0;
      bent(g, sgn * Z, (px, py, r) => { sx += px * r * r; sy += py * r * r; sw += r * r; });
      const rc = Math.hypot((sx / sw - glow.x) / glow.rx, (sy / sw - glow.y) / glow.ry);
      shut.push({ g, bend: sgn * Z, rc, across: best >= 2.5 && Z > 0.6, jit: R.range(0, 0.08), tipLag: R.range(CURTAIN.tipLag[0], CURTAIN.tipLag[1]),
                  tempo: clamp(1.2 - 0.34 * (lenOf(g) / S) + R.range(-0.05, 0.05), 0.84, 1.12) });   // (a long heavy leaf is slower to come round than a short one)
    }
    // TL.open is the moment the FIRST leaf lets go: the one lying nearest the middle of the names. The rest follow by how far out they lie.
    const rc0 = shut.reduce((m, o) => (o.across ? Math.min(m, o.rc) : m), 1.3), first = shut.reduce((m, o) => (o.across && o.rc + o.jit < m.rc + m.jit ? o : m), { rc: 9, jit: 0 });
    for (const o of shut) {
      const t0 = TL.open + (o === first ? 0 : CURTAIN.spread * Math.pow(clamp((o.rc - rc0) / (1.3 - rc0)), CURTAIN.ease) + CURTAIN.ring[o.g.layer] + o.jit);
      for (const pl of o.g.parts) { pl.part = [o.bend, t0]; pl.tipLag = o.tipLag; pl.tempo = o.tempo; }
    }
    curtain.firstOpen = +shut.reduce((m, o) => Math.min(m, o.g.parts[0].part[1]), 99).toFixed(3);
    curtain.lastOpen = +shut.reduce((m, o) => Math.max(m, o.g.parts[0].part[1]), 0).toFixed(3);
    for (let k = 0; k < want.length; k++) if (want[k] === 4 && cover[k] < 0.8) curtain.copyBare++;

    /* THE STEM of each plant: its stalk runs on below its root, straight back the way the plant points
     * (whatever hangs: more or less straight up), until it is out of the picture even from as far back
     * as the camera ever is. It is what a root that is in shot stands on. */
    for (const g of FRAME) {
      const m = g.main || g.parts[0], far = 1.07 / view.ringScale(g.layer, 0);
      const x0 = glow.x - glow.x * far, x1 = glow.x + (W - glow.x) * far, y0 = glow.y - glow.y * far, y1 = glow.y + (H - glow.y) * far;
      const as = m.y < 0 && Math.cos(m.a) < 0 ? PI + wrap(m.a - PI) * 0.35 : m.a;
      const dx = -Math.sin(as), dy = Math.cos(as);
      const ex = dx > 1e-4 ? (x1 - m.x) / dx : dx < -1e-4 ? (x0 - m.x) / dx : 1e9, ey = dy > 1e-4 ? (y1 - m.y) / dy : dy < -1e-4 ? (y0 - m.y) / dy : 1e9;
      m.stem = clamp(Math.min(ex, ey), 0, 4 * S) + 0.03 * S;
      m.stemA = as;
    }
  }

  /* ---------------------------------------------------------------------------------------------
   * THE WALLPAPER: what the shot opens on, and what parts before the camera. SHELLS layers composed
   * for the FIRST frame. Every plant is rooted just outside the frame, so no stalk ever ends in the
   * open, and the roots only move further off as the camera advances. Plants are placed one at a
   * time, each aimed at the emptiest part of the sheet (a coarse grid keeps count of what is covered):
   * the four nearest shells share one count (together they are the opening picture), each deeper
   * shell keeps its own and begins with broad leaves laid right across the middle from different
   * edges, so that when the leaves in front of it part there is a whole wall of leaves behind.
   * Then each leaf is given THE SWING that takes it out of the camera's way.
   * ------------------------------------------------------------------------------------------- */
  {
    const G = Math.max(12, S / 26), nx = Math.ceil(W / G), ny = Math.ceil(H / G);
    const front = new Float32Array(nx * ny), all = new Float32Array(nx * ny), mark = new Uint8Array(nx * ny);
    /* … and a finer count of what is really PAINTED over each point of the sheet (`real`): the outlines above are circles,
     * generous at the edge of a blade and blind to the gaps between a palm's leaflets, so by them alone a short phone was
     * left with cream wedges in its corners. This one asks the drawings themselves (view.paintAt). 1 = covered. */
    const g2 = Math.max(5, S / 72), mx = Math.ceil(W / g2), my = Math.ceil(H / g2), real = new Float32Array(mx * my);
    /** how much of the still-open sheet a plant would paint over (in cells); `commit` → count it in */
    const realPaint = (pl, commit) => {
      if (!view.paintAt) return 0;
      const sp = sprites[pl.id], qh = pl.len / sp.len, qw = qh * sp.aspect, ca = Math.cos(pl.a), sa = Math.sin(pl.a);
      const hx = pl.head ? pl.head[0] : 0, hy = pl.head ? pl.head[1] : 0;
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, gain = 0;
      for (const [lx, ly, r] of circlesOf(pl)) {
        const px = pl.x + lx * ca + ly * sa, py = pl.y - (-lx * sa + ly * ca);
        x0 = Math.min(x0, px - r * 1.3); x1 = Math.max(x1, px + r * 1.3); y0 = Math.min(y0, py - r * 1.3); y1 = Math.max(y1, py + r * 1.3);
      }
      for (let j = Math.max(0, Math.floor(y0 / g2)); j <= Math.min(my - 1, Math.floor(y1 / g2)); j++)
        for (let i = Math.max(0, Math.floor(x0 / g2)); i <= Math.min(mx - 1, Math.floor(x1 / g2)); i++) {
          const dx = (i + 0.5) * g2 - pl.x, dy = pl.y - (j + 0.5) * g2;              // from the root, y up
          const cx = sp.pivot[0] + ((dx * ca - dy * sa) * pl.flip - hx) / qw, cy = sp.pivot[1] + (dx * sa + dy * ca - hy) / qh;   // → where in the drawing's cell
          if (cx <= 0 || cx >= 1 || cy <= 0 || cy >= 1) continue;
          const p = smoothstep(0.3, 0.7, view.paintAt(pl.id, cx, cy)), k = j * mx + i;
          if (p <= 0) continue;
          gain += Math.min(p, Math.max(0, 1 - real[k]));
          if (commit) real[k] += p;
        }
      return gain;
    };
    const SHOWS = 0.75;                                                              // a point with less paint over it than this still shows the sheet
    /** how much of the sheet still shows (0..1), and the middle of the largest such place (px), or null */
    const showing = () => {
      let n = 0, best = -1, at = null;
      for (let j = 0; j < my; j++) for (let i = 0; i < mx; i++) {
        if (real[j * mx + i] >= SHOWS) continue;
        n++;
        let m = 0;
        for (let v = -2; v <= 2; v++) for (let u = -2; u <= 2; u++) { const a = i + u, b = j + v; if (a < 0 || b < 0 || a >= mx || b >= my || real[b * mx + a] < SHOWS) m++; }   // (beyond the edge counts: a hole at the edge of the sheet is the worst kind)
        if (m > best) { best = m; at = { x: (i + 0.5) * g2, y: (j + 0.5) * g2 }; }
      }
      return { share: n / (mx * my), at };
    };
    const own = WALL.map((_, i) => (i < WALL_FRONT ? front : new Float32Array(nx * ny)));
    /** what would this plant add to a grid? (cells it is first to cover, less a little for piling onto crowded ones); `commit` → count it in */
    const stamp = (pl, cover, commit) => {
      const touched = [];
      let gain = 0;
      eachHull(sprites[pl.id], pl.x, pl.y, pl.len, pl.a, pl.flip, (px, py, r0) => {
        const r = r0 * 0.8;
        for (let j = Math.max(0, Math.floor((py - r) / G)); j <= Math.min(ny - 1, Math.floor((py + r) / G)); j++)
          for (let i = Math.max(0, Math.floor((px - r) / G)); i <= Math.min(nx - 1, Math.floor((px + r) / G)); i++) {
            const k = j * nx + i, dx = (i + 0.5) * G - px, dy = (j + 0.5) * G - py;
            if (mark[k] || dx * dx + dy * dy > r * r) continue;
            mark[k] = 1; touched.push(k);
            gain += cover[k] < 1 ? 1 : cover[k] >= 2 ? -0.3 : 0;
          }
      });
      for (const k of touched) { mark[k] = 0; if (commit) { cover[k] += 1; all[k] += 1; } }
      if (commit) realPaint(pl, true);
      return gain;
    };
    const KINDS = {
      b: ['banana', 'banana', 'banana', 'monstera', 'fan', 'bopLeaf', 'frond', 'calathea', 'arch', 'banana'],
      t: ['frond', 'banana', 'banana', 'arch', 'liana', 'frond'],
      s: ['banana', 'banana', 'banana', 'frond', 'frond', 'monstera', 'alocasia', 'arch', 'fan', 'calathea', 'banana'],
    };
    /** one plant for shell i, rooted outside an edge (`edge`, or whichever is handy) and aimed at the point T */
    const candidate = (R, i, T, across = false, edge = null) => {
      const d = { b: H - T.y, t: T.y, l: T.x, r: W - T.x }, soft = 0.2 * S;
      const wgt = { b: 1.5 / (d.b + soft), t: 0.95 / (d.t + soft), l: 1.1 / (d.l + soft), r: 1.1 / (d.r + soft) };   // nearer edges more often; plants mostly grow up from the bottom
      let pick = R.f() * (wgt.b + wgt.t + wgt.l + wgt.r), e = 'r';
      for (const k of ['b', 't', 'l', 'r']) { pick -= wgt[k]; if (pick <= 0) { e = k; break; } }
      if (edge) e = edge;
      const out = R.range(0.06, 0.11) * S;
      let rx, ry;
      if (e === 'b') { rx = T.x + R.range(-0.6, 0.6) * d.b; ry = H + out; }
      else if (e === 't') { rx = T.x + R.range(-0.5, 0.5) * d.t; ry = -out; }
      else { rx = e === 'l' ? -out : W + out; ry = T.y + (R.chance(0.85) ? R.range(0.4, 1.5) : -R.range(0.2, 0.7)) * Math.max(d[e], 0.12 * S); }   // from a side: mostly growing up and in, now and then drooping in from above
      const kind = has(R.pick(across ? ['banana', 'banana', 'monstera', 'banana', 'alocasia', 'banana', 'calathea'] : KINDS[e === 'b' || e === 't' ? e : 's']));   // (across the middle: broad blades only)
      const far = Math.hypot(T.x - rx, T.y - ry);
      let a = Math.atan2(T.x - rx, -(T.y - ry)), flip = 0;
      if (kind === 'arch') { flip = R.sign(); a -= flip * 0.45; }                 // it curls over to one side: start it off the other way
      // (`across`: a leaf laid right across the middle, the broad part of its blade over the point it is aimed at)
      const len = across ? clamp(far * R.range(1.3, 1.6), WALL[i].len[0] * S, (e === 'b' || e === 't' ? 0.76 : 0.6) * S)
                         : clamp(far * R.range(1.02, 1.25), WALL[i].len[0] * S, WALL[i].len[1] * S) * (kind === 'fan' || kind === 'liana' ? 0.85 : 1);
      return make(kind, R, GRADE.pass[i], { x: rx, y: ry, a, flip, len, wind: 1.3, z: R.range(-0.5, 0.5) });
    };
    const emptiest = (R, cover, tries) => {
      let T = null, best = 1e9;
      for (let k = 0; k < tries; k++) {
        const x = R.range(0.03, 0.97) * W, y = R.range(0.02, 0.98) * H;
        const c = cover[Math.min(ny - 1, Math.floor(y / G)) * nx + Math.min(nx - 1, Math.floor(x / G))] + R.range(0, 0.6);
        if (c < best) { best = c; T = { x, y }; }
      }
      return T;
    };

    /* THE SWING of one plant of shell i (parts: the placements that are one plant, sharing a root).
     * Which way: about its root, away from the line of travel, whichever way round takes it out of the
     * picture sooner (so a leaf rooted beyond the left edge ends up lying along that edge, one that
     * hangs from the top swings up and away). How far: until every part of it is outside what the
     * camera will be seeing SWING.clear seconds after it is touched, and a little more. When: worked
     * out for the whole shell together once the sheet is composed (partShell, below). */
    const R2 = rng(seed + 60);                                                    // (its own sequence: the composition does not depend on it)
    const latest = WALL.map((_, i) => view.shellWhen(i, SWING.mag) - SWING.clear);
    const groups = WALL.map(() => []);                                             // per shell: the plants in it (each a list of placements sharing a root), to be given their swings once it is all composed
    /** how near the middle of the gold a plant lies (px): 0 = right across it */
    const nearMiddle = (parts) => {
      const root = parts[0], ca0 = Math.cos(root.a), sa0 = Math.sin(root.a);
      let dc = 1e9;
      for (const [lx, ly, r] of parts.flatMap(circlesOf)) dc = Math.min(dc, Math.max(0, Math.hypot(root.x + lx * ca0 + ly * sa0 - glow.x, root.y - (-lx * sa0 + ly * ca0) - glow.y) - r));
      return dc;
    };
    const swing = (parts, i, t0, early = null) => {              // early: one of THE NEAR LEAVES that give way during the push through them (below): slower, and worked out for what that push sees
      const root = parts[0], cs = parts.flatMap(circlesOf);
      const M = Math.min(early ? view.preMag(i, t0 + early.clear, root.z) : view.shellMag(i, t0 + SWING.clear, root.z), 14);
      const x0 = glow.x - glow.x / M, x1 = glow.x + (W - glow.x) / M, y0 = glow.y - glow.y / M, y1 = glow.y + (H - glow.y) / M;
      const clearAt = (Z) => {
        const ca = Math.cos(root.a + Z), sa = Math.sin(root.a + Z);
        return cs.every(([lx, ly, r0]) => { const px = root.x + lx * ca + ly * sa, py = root.y - (-lx * sa + ly * ca), r = r0 * 1.15 + 0.008 * S; return px + r < x0 || px - r > x1 || py + r < y0 || py - r > y1; });
      };
      const need = (sgn) => { for (let th = 0; th < 3; th += 0.06) if (clearAt(sgn * th)) return th; return 3; };
      const pLen = root.plantLen || root.len;
      const away = -inward({ x: root.x, y: root.y, a: root.a, len: pLen }).s;
      const th1 = need(away), th2 = need(-away), sgn = th2 < th1 - 0.45 ? -away : away;
      if (Math.min(th1, th2) >= 3) curtain.wallStuck++;                              // (a leaf no swing can clear: there should be none)
      // no two leaves swing alike: how far (never less than `least`), how limp the blade is, how heavy the whole leaf (a long one is slower)
      const part = [sgn * clamp(Math.min(th1, th2) + 0.22, R2.range(SWING.least[0], SWING.least[1]), 3.1), t0];
      const lag = early ? early.tipLag : SWING.tipLag, lean = early ? early.ant : SWING.ant;
      const tipLag = R2.range(lag[0], lag[1]), ant = R2.range(lean[0], lean[1]);
      const tempo = early ? lerp(early.tempo[1], early.tempo[0], clamp((pLen / S - 0.3) / 0.4)) + R2.range(-0.02, 0.02)
        : clamp(lerp(SWING.tempo[1], SWING.tempo[0], (pLen / S - 0.3) / 0.4) + R2.range(-0.05, 0.05), SWING.tempo[0], SWING.tempo[1]);
      for (const pl of parts) { pl.part = part; pl.tipLag = tipLag; pl.ant = ant; pl.tempo = tempo; pl.slow = early ? early.clear : 0; }
    };
    /** every plant of shell i gets its moment: the shell's own (WALL.part), then the leaves in order of how
     *  near the middle they lie (those across it in an order of their own), spread over SWING.stagger: but
     *  never so late that a leaf would still be in shot at more than SWING.mag times its printed size (then
     *  the whole shell goes a little quicker, in the same order). */
    const partShell = (i) => {
      const list = groups[i].map((parts) => ({ parts, k: clamp(nearMiddle(parts) / (0.36 * S)) + R2.range(0, 0.2) })).sort((p, q) => p.k - q.k);
      const span = clamp(latest[i] - WALL[i].part, 0.1, SWING.stagger), n = list.length;
      (curtain.shellSpan = curtain.shellSpan || []).push(+span.toFixed(2));          // (for __timeline.stats: under SWING.stagger = that shell had to hurry)
      list.forEach((o, r) => {
        const u = n > 1 ? r / (n - 1) : 0;
        swing(o.parts, i, WALL[i].part + span * (0.8 * u + 0.2 * u * u) + (r ? R2.range(-0.012, 0.012) : 0));
      });
    };

    /** somewhere on the sheet that no shell covers yet (null if there is nowhere) */
    const bareSpot = (R) => {
      const ks = [];
      for (let k = 0; k < all.length; k++) if (all[k] < 1) ks.push(k);
      if (!ks.length) return null;
      const k = ks[Math.floor(R.f() * ks.length)];
      return { x: ((k % nx) + 0.5) * G, y: (Math.floor(k / nx) + 0.5) * G };
    };
    const plant = (R, i, tries, middle = false, edge = null, patch = false) => {      // patch: aim at what NO shell covers, not at what this shell lacks ({x, y}: at that place, with a broad blade, judged by what it really paints over)
      const cover = own[i], seek = patch ? all : cover, spot = patch && patch.x !== undefined ? patch : null;
      let best = null, score = -1e9;
      for (let k = 0; k < tries; k++) {
        const T = middle ? { x: glow.x + R.range(-0.16, 0.16) * W, y: glow.y + R.range(-0.14, 0.14) * H } : spot || (patch && bareSpot(R)) || emptiest(R, cover, 7);
        const pl = candidate(R, i, T, middle || !!spot, edge), s = spot ? realPaint(pl, false) : stamp(pl, seek, false) + R.range(0, 2);
        if (s > score) { score = s; best = pl; }
      }
      stamp(best, cover, true);
      R.range(0, 0.05);                                                            // (a number this plant used to draw for its timing: still drawn, so that the sheet stays, leaf for leaf, the one that was approved)
      groups[i].push([best]);
      L['pass' + i].push(best);
    };
    const Rs = WALL.map((_, i) => rng(seed + 30 + i));
    /* THE ACCENTS of the first frame, as in the titles: bananas hanging in the print with their blossoms
     * below them, both in the nearest shell (so nothing lies across them: they are the first things
     * to swing away). Placed first; the leaves are then composed round them. */
    for (const ac of WALL_HANG) {
      const i = ac.shell, R = Rs[i];
      const h = hangPair(R, { x: ac.fx * W, y: -0.075 * S, len: Math.min(ac.len * S, (ac.drop * H) / 1.67), lean: ac.lean, flip: ac.flip, z: 0.6, wind: 1.3 });
      if (!h) continue;
      const cover = own[i], [bunch] = h.parts.slice(-1);
      stamp(bunch, cover, true); stamp({ ...bunch, id: h.parts[0].id, x: h.tail[0], y: h.tail[1], len: h.parts[0].len }, cover, true);
      R.range(0, 0.05);                                                            // (as above)
      groups[i].push([bunch, ...h.parts.slice(0, -1)]);
      L['pass' + i].push(...h.parts);
    }
    // (a deep shell's first plants are laid across the middle, each from a different edge so that they part in different directions)
    const EDGES = ['l', 'r', 'b', 'r', 'l', 't'];
    WALL.forEach((w, i) => { for (let j = 0; j < w.n; j++) plant(Rs[i], i, 6, j < w.across, j < w.across ? EDGES[(i + j) % EDGES.length] : null); });
    // whatever of the sheet still shows through all the shells together is filled from the deepest two, until it is only glimpsed
    const bare = () => { let n = 0; for (let k = 0; k < all.length; k++) if (all[k] < 1) n++; return n / all.length; };
    for (let j = 0; j < 24 && bare() > WALL_BARE; j++) { const i = SHELLS - 1 - (j % 2); plant(Rs[i], i, 7); }
    // a wide frame has a long top edge, and what hangs there leaves gaps along it: patch what still shows (by the outlines), from the deepest shells
    if (W / H >= 0.9) for (let j = 0; j < 14 && bare() > 0.012; j++) { const i = SHELLS - 1 - (j % 3); plant(Rs[i], i, 7, false, null, true); }
    // … and on any shape of frame (a tall one too): wherever the sheet REALLY still shows through everything painted over it
    // (see `real` above), a broad blade from one of the three deepest shells goes behind the largest such place, until it is only pinpricks.
    curtain.wallOpen0 = +showing().share.toFixed(4);
    for (let j = 0; j < 10; j++) {
      const sh = showing();
      if (sh.share <= 0.003 || !sh.at) break;
      const i = SHELLS - 1 - (j % 3);
      plant(Rs[i], i, 8, false, null, sh.at);
    }
    curtain.wallOpen = +showing().share.toFixed(4);
    curtain.wallBare = +bare().toFixed(3);
    WALL.forEach((_, i) => partShell(i));                                          // … and now that the sheet is composed, THE SWING of every leaf of it

    /* THE NEAR LEAVES GIVE WAY (version 7; F.early = PRO.near in main.js, or null for none).
     * Before t = 0 the camera is pushing in, fast and steadily, THROUGH the leaves of the opening picture:
     * the nearest shells stand in its path (scene.js: THE PUSH THROUGH THE LEAVES). So every leaf of them is
     * pushed out of its way as it comes, slowly, one after another: the nearest shell first, and in each
     * the leaves nearest the line of travel first. Shell k of the `shells` has the k-th share of the time
     * between `from` and `to` to be touched in. Each leaf swings as the others do, about its own root and
     * away from the line of travel, but at `tempo` (a fraction of the usual speed: about `clear` seconds
     * from being touched to having gone), with a limper blade (`tipLag`) and a smaller lean beforehand
     * (`ant`), and far enough to be out of the picture as the push sees it by then.
     * (The deep shells keep the swings they were given above: they part after t = 0, as in version 6.) */
    if (F.early && view.preMag) {
      const E = F.early, n = Math.min(E.shells, SHELLS - 1);
      let count = 0;
      for (let i = 0; i < n; i++) {
        const a = E.from + ((E.to - E.from) * i) / n, b = E.from + ((E.to - E.from) * (i + 1)) / n;
        const list = groups[i].map((parts) => ({ parts, k: clamp(nearMiddle(parts) / (0.36 * S)) + R2.range(0, 0.2) })).sort((p, q) => p.k - q.k);
        list.forEach((o, r) => {
          const u = list.length > 1 ? r / (list.length - 1) : 0;
          swing(o.parts, i, a + (b - a) * 0.94 * u + (r ? R2.range(-0.03, 0.03) : 0), E);
          count++;
        });
      }
      curtain.early = count;                                                       // (for __timeline.stats: how many leaves give way during the push)
    }
  }

  for (const k of Object.keys(L)) L[k] = L[k].filter(Boolean);
  return { layers: L, glow, string, flags: { w: flagW, h: flagH, list: flags }, hangSpots, curtain };
}
