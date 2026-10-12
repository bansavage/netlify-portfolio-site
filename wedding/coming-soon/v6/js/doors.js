/* doors.js — THE DOORS the page opens on.
 *
 * A pair of slatted walnut doors, painted in the same hand as the foliage (gouache: a flat base coat,
 * then brush strokes laid along the grain, dark to light), so they belong to the wallpaper. They fill
 * the screen, shut, until the guest taps Open (main.js). Then each leaf swings back on its hinge at
 * the edge of the screen and stands open, and the camera travels in between them, past them, into the
 * wallpaper behind: one move, the same one that parts the leaves.
 *
 * They are two <canvas> elements turned with CSS 3D transforms. They sit over the foliage and under
 * the linen finish, so the weave lies over the wood as it does over everything else.
 *
 * To change them:
 *   colours of the wood, the light between slats .. WALNUT, SLIT
 *   proportions (stiles, rails, slats) ............ the numbers at the top of paintLeaf
 *   gaps between slats: open or cream, how wide ... DOOR.slits and DOOR.slit in main.js
 *   how they open (speed, angle, bounce) .......... DOOR in main.js
 */
import { rng, clamp, mix, rgba, easeInOutCubic } from './kit.js';
import { lay } from './plants.js';

const WALNUT = ['#2A1910', '#44291A', '#623E28', '#845638', '#A97A52'];   // shadow, body, mid, light, highlight
const SLIT = '#EFE5CC';                                                    // the light between two slats: the cream of the sheet

/** grain: `n` long thin strokes running the length of a board, wandering a little as grain does.
 *  along = true for a board that lies across (slat, rail), false for one that stands (stile). */
function grain(R, x, y, w, h, along, n, hw, dry, span = [0.3, 0.95]) {
  const L = along ? w : h, T = along ? h : w, out = [];
  for (let i = 0; i < n; i++) {
    const len = R.range(span[0], span[1]) * L, s0 = R.range(-0.08, 1.02) * L - len * R.range(0.2, 0.5);
    const o = R.range(0.06, 0.94) * T, ph = R.range(0, 6.3), amp = R.range(0.2, 1) * Math.min(2.2, T * 0.05), k = (R.range(0.7, 2.2) * 6.28) / L;
    const p = [];
    for (let j = 0; j <= 10; j++) {
      const s = s0 + (len * j) / 10, q = o + amp * Math.sin(ph + s * k);
      p.push(along ? [x + s, y + q] : [x + q, y + s]);
    }
    out.push({ p, w: R.range(hw[0], hw[1]), c: R.int(0, 1), d: clamp(dry * R.range(0.7, 1.25)), l: R.range(0.3, 0.6), g: 0.45 });
  }
  return out;
}

/** figure: the nested arches where a board was cut through the growth rings */
function figure(R, x, y, w, h, along) {
  const L = along ? w : h, T = along ? h : w, out = [];
  const c = R.range(0.2, 0.8) * L, o = R.range(0.38, 0.62) * T, rings = R.int(3, 5), way = R.sign(), reach = Math.min(L * 0.07, T * 1.3);
  for (let r = 1; r <= rings; r++) {
    const half = (T * 0.44 * r) / rings, far = reach * r * R.range(0.85, 1.15), p = [];
    for (let j = 0; j <= 12; j++) {
      const v = -1 + (2 * j) / 12, s = c + way * far * (1 - v * v), q = o + v * half;
      p.push(along ? [x + s, y + q] : [x + q, y + s]);
    }
    out.push({ p, w: R.range(0.7, 1.5), c: 0, d: 0.35, l: 0.2, g: 0.2 });
  }
  return out;
}

/** one board: its own tone of walnut, then grain in three passes, dark to light */
function board(ctx, R, x, y, w, h, along, tone) {
  if (w < 1 || h < 1) return;
  const base = mix(WALNUT[1], WALNUT[2], tone), area = w * h, n = (per) => Math.max(2, Math.round(area / per));
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = base; ctx.fillRect(x, y, w, h);
  lay(ctx, R, [mix(base, WALNUT[0], 0.75), mix(base, WALNUT[0], 0.4)], grain(R, x, y, w, h, along, n(900), [0.9, 2.6], 0.35), 1, 0.3);
  if (R.chance(along ? 0.14 : 0.9)) lay(ctx, R, [mix(base, WALNUT[0], 0.6)], figure(R, x, y, w, h, along), 0.7);
  lay(ctx, R, [mix(base, WALNUT[3], 0.55), mix(base, WALNUT[3], 0.85)], grain(R, x, y, w, h, along, n(1100), [0.8, 2.3], 0.6), 1, 0.25);
  lay(ctx, R, [WALNUT[4]], grain(R, x, y, w, h, along, n(3600), [0.5, 1.2], 0.85, [0.15, 0.45]), 0.6);
  ctx.restore();
}

/** one leaf of the pair, w × h CSS px. A wide leaf (desktop, a phone on its side) gets two or three
 *  panels of slats with a stile between them, so a slat never becomes a plank. */
function paintLeaf(canvas, w, h, dpr, side, seed, look) {
  canvas.width = Math.max(1, Math.round(w * dpr)); canvas.height = Math.max(1, Math.round(h * dpr));
  const ctx = canvas.getContext('2d'), R = rng(seed);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const panels = Math.max(1, Math.round(w / (0.44 * h)));
  const sw = clamp((w / panels) * 0.16, 22, 64);                 // stile: the upright boards
  const inner = (w - (panels + 1) * sw) / panels;                // a panel of slats, between two stiles
  const rail = clamp(h * 0.07, 30, 90);                          // top and bottom rail
  const ns = Math.max(3, Math.round((h - 2 * rail) / clamp(inner * 0.36, 34, h * 0.075)));
  const pitch = (h - 2 * rail) / ns, slit = clamp(pitch * look.slit, 2, 9);
  const dark = rgba(WALNUT[0], 0.55);

  ctx.fillStyle = WALNUT[0]; ctx.fillRect(0, 0, w, h);
  for (let p = 0; p < panels; p++) {
    const x = sw + p * (inner + sw);
    board(ctx, R, x, 0, inner, rail - slit / 2, true, R.range(0.25, 0.7));
    board(ctx, R, x, h - rail + slit / 2, inner, rail - slit / 2, true, R.range(0.25, 0.7));
    for (let i = 0; i < ns; i++) board(ctx, R, x, rail + i * pitch + slit / 2, inner, pitch - slit, true, R.range(0.05, 1));
    for (let i = 0; i <= ns; i++) {
      const y = rail + i * pitch - slit / 2;
      if (look.slits === 'leaves') ctx.clearRect(x, y, inner, slit);         // the gap between two slats: open, so the wallpaper behind shows through it …
      else { ctx.fillStyle = SLIT; ctx.fillRect(x, y, inner, slit); }        // … or closed with the cream of the sheet
      ctx.fillStyle = dark; ctx.fillRect(x, y + slit, inner, 1.2);           // … and the shadow of the edge above, on the slat below
    }
  }
  for (let s = 0; s <= panels; s++) {
    const x = s * (inner + sw);
    board(ctx, R, x, 0, sw, h, false, R.range(0.3, 0.75));
    ctx.fillStyle = rgba(WALNUT[0], 0.4);
    if (s > 0) ctx.fillRect(x - 1, 0, 1, h);
    if (s < panels) ctx.fillRect(x + sw, 0, 1, h);
  }
  ctx.fillStyle = rgba(WALNUT[0], 0.8);                                      // where the two leaves meet
  ctx.fillRect(side === 'l' ? w - 1.25 : 0, 0, 1.25, h);
}

/**
 * @param el    the .doors element (holds canvas.door.l and canvas.door.r)
 * @param DOOR  from main.js: timing { len, swing: [start, length], lag, angle, rebound, gone } and look { slits, slit }
 */
export function createDoors(el, DOOR) {
  const left = el.querySelector('.door.l'), right = el.querySelector('.door.r');
  const size = { W: 0, H: 0 }, was = { l: '', r: '', hidden: null };
  let leafW = 0, persp = 1000;

  /** paint both leaves for a W × H page (does nothing if the page is the size it was painted for) */
  function paint(W, H) {
    if (!W || !H || (W === size.W && H === size.H)) return;
    size.W = W; size.H = H; leafW = W / 2;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    paintLeaf(left, leafW, H, dpr, 'l', 7411, DOOR);
    paintLeaf(right, leafW, H, dpr, 'r', 7523, DOOR);
    left.style.background = right.style.background = 'none';   // (the plain walnut that stood in for them until now would show through the gaps)
    persp = clamp(1.25 * W, 900, 2400);
    el.style.perspective = `${persp.toFixed(0)}px`;
  }

  /** how far a leaf has swung at `u` seconds after the tap: a heavy door, slow to start, and it knocks
   *  back a little off its stop before it stays */
  const angle = (u) => {
    const tau = u - DOOR.swing[0], after = tau - DOOR.swing[1];
    return DOOR.angle * easeInOutCubic(clamp(tau / DOOR.swing[1])) - (after > 0 ? DOOR.rebound * Math.exp(-5.5 * after) * Math.sin(10 * after) : 0);
  };

  /** Put the doors where they are at time t (t = -DOOR.len: shut; a pure function of t, like the rest).
   *  `travel` is how much of its move the camera has made (0 … 1). The doors do not move toward us by
   *  themselves: they stand open, and it is the CAMERA that travels in past them. So how near they are is
   *  simply the camera's own travel, the same move that is parting the leaves behind them. */
  function apply(t, travel = 0) {
    const th = (DOOR.angle * Math.PI) / 180;
    const zOut = persp * Math.cos(th) + leafW * Math.sin(th);  // how far the camera must come before an open leaf has left past the edge of the screen
    const z = (zOut * travel) / DOOR.gone;
    const gone = z >= zOut * 1.12;                             // the camera is through the doorway
    if (gone !== was.hidden) { was.hidden = gone; el.hidden = gone; }
    if (gone) return;
    const u = t + DOOR.len;
    const set = (node, key, a, turn) => {
      const lit = (1 - 0.3 * Math.sin((clamp(a, 0, 90) * Math.PI) / 180)).toFixed(3);   // a leaf turned from the light is darker (paint, not opacity)
      const css = a < 0.01 && z < 0.01 ? '' : `translateZ(${z.toFixed(1)}px) rotateY(${(turn * a).toFixed(2)}deg)|brightness(${lit})`;
      if (css === was[key]) return;
      was[key] = css;
      const [tf, fl] = css ? css.split('|') : ['', ''];
      node.style.transform = tf; node.style.filter = fl;
    };
    set(left, 'l', angle(u), 1);
    set(right, 'r', angle(u - DOOR.lag), -1);
  }

  return { paint, apply };
}
