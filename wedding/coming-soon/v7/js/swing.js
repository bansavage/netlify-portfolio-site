/* swing.js — THE MONKEY THAT SWINGS ACROSS (version 7).
 *
 * After the title card has gone and before the leaves part, the monkey from the end of the piece (the one
 * that hangs from the bananas) swings across the screen on a liana, left to right, in front of the
 * wallpaper. It is painted by the same code as the sprite (js/plants.js), on a canvas of its own, and the
 * liana on another; a soft dark copy of each, a little down and to the right, is its paper shadow on the
 * wallpaper behind. They are turned with CSS transforms about a point above the top of the screen: a
 * pendulum, at rest at each end of its swing (out of the picture) and fastest through the middle.
 * The monkey's own body trails behind its hand a little, the way a weight on a rope does.
 *
 * It sits over the foliage and under the linen finish, like the doors.
 *
 * To change it: SW (from main.js: PRO.monkey) is how long the swing takes, how wide it is and how far the
 * body trails; the proportions (how big the monkey is, how low it passes) are at the top of layout().
 */
import { paintMonkey, paintVine } from './plants.js';
import { clamp } from './kit.js';

/** a soft dark copy of what is painted on `src`, on a canvas `pad` px bigger all round: its paper shadow */
function shadowOf(src, blur, colour) {
  const pad = Math.ceil(blur * 2.6), c = document.createElement('canvas');
  c.width = src.width + pad * 2; c.height = src.height + pad * 2;
  const x = c.getContext('2d'), far = c.width + 16;
  x.shadowColor = colour; x.shadowBlur = blur; x.shadowOffsetX = far;   // (draw the thing itself off the canvas: only its shadow lands on it)
  x.drawImage(src, pad - far, pad);
  return { canvas: c, pad };
}

/**
 * @param el  the .swing element (empty: this fills it)
 * @param SW  { len (s), angle (degrees each way), drag (degrees the body trails at full speed) }
 */
export function createSwing(el, SW) {
  const mk = (cls, parent) => { const n = document.createElement(cls === 'arm' ? 'div' : 'canvas'); n.className = cls; parent.appendChild(n); return n; };
  el.textContent = '';
  const shade = mk('arm', el), arm = mk('arm', el);
  const parts = { vine: mk('vine', arm), ape: mk('ape', arm), vineS: mk('vine', shade), apeS: mk('ape', shade) };
  const size = { W: 0, H: 0 };
  let cast = [0, 0], was = '', shown = null;

  /** paint the monkey and its liana for a W × H page and put the pivot where the swing needs it */
  function layout(W, H) {
    if (!W || !H || (W === size.W && H === size.H)) return;
    size.W = W; size.H = H;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const Lm = Math.max(160, 0.5 * Math.min(H, 1.9 * W));       // the monkey, hand to the end of its tail (px): it is in the foreground, so big (on a phone, over two fifths of the screen's height)
    const low = 0.22 * H;                                       // how far down the screen its hand is at the bottom of the swing
    // The monkey hangs below its hand, so what swings is a pendulum about 0.45 monkeys longer than the liana. It is out
    // of the picture altogether once that pendulum is W/2 + 0.3 monkeys off the middle, and the liana is made the length
    // that puts that at 82% of the full swing: so it starts and ends out of sight, at rest, and is in the picture for a
    // little over three fifths of the time, at its fastest.
    const Lv = (W / 2 + 0.3 * Lm) / Math.sin((0.82 * SW.angle * Math.PI) / 180) - 0.45 * Lm;   // so the liana is this long …
    const px = W / 2, py = low - Lv;                            // … and hangs from here, above the top of the screen

    // the liana: a narrow canvas from the pivot down to the hand
    const vw = Math.max(48, 0.34 * Lm), leaf = 0.1 * Lm;
    const vc = document.createElement('canvas');
    vc.width = Math.round(vw * dpr); vc.height = Math.round((Lv + 8) * dpr);
    let ctx = vc.getContext('2d'); ctx.scale(dpr, dpr);
    const end = paintVine(ctx, vw / 2, 0, Lv, [0.017 * Lm, 0.0105 * Lm], leaf);   // [x, y] of its end, on that canvas
    // the monkey: its hand closes round the end of the liana
    const mw = 0.54 * Lm, mh = 1.04 * Lm, hx = 0.2 * Lm, hy = 0.03 * Lm;
    const mc = document.createElement('canvas');
    mc.width = Math.round(mw * dpr); mc.height = Math.round(mh * dpr);
    ctx = mc.getContext('2d'); ctx.scale(dpr, dpr);
    paintMonkey(ctx, hx, hy, Lm);

    const put = (node, src, left, top, w, h, origin) => {
      node.width = src.width; node.height = src.height;
      node.getContext('2d').drawImage(src, 0, 0);
      Object.assign(node.style, { left: `${left.toFixed(1)}px`, top: `${top.toFixed(1)}px`, width: `${w.toFixed(1)}px`, height: `${h.toFixed(1)}px`, transformOrigin: origin || '' });
    };
    const handX = end[0] - vw / 2, handY = end[1];              // the end of the liana, measured from the pivot
    put(parts.vine, vc, -vw / 2, 0, vw, Lv + 8);
    put(parts.ape, mc, handX - hx, handY - hy, mw, mh, `${hx.toFixed(1)}px ${hy.toFixed(1)}px`);
    // their paper shadow
    const blur = 0.018 * Lm * dpr, ink = 'rgba(20,24,10,0.6)';
    const vs = shadowOf(vc, blur, ink), ms = shadowOf(mc, blur, ink), pv = vs.pad / dpr, pm = ms.pad / dpr;
    put(parts.vineS, vs.canvas, -vw / 2 - pv, -pv, vw + 2 * pv, Lv + 8 + 2 * pv);
    put(parts.apeS, ms.canvas, handX - hx - pm, handY - hy - pm, mw + 2 * pm, mh + 2 * pm, `${(hx + pm).toFixed(1)}px ${(hy + pm).toFixed(1)}px`);
    cast = [0.03 * Lm, 0.05 * Lm];                              // it falls down and a little to the right, as every paper shadow in the picture does

    for (const a of [arm, shade]) { a.style.left = `${px.toFixed(1)}px`; a.style.top = `${py.toFixed(1)}px`; }
    was = '';
  }

  /** where the swing is `p` of the way through (0 = hanging out of the picture on the left … 1 = out on the right) */
  function apply(p) {
    const on = p > 0 && p < 1;
    if (on !== shown) { shown = on; el.hidden = !on; }
    if (!on) return;
    const th = SW.angle * Math.cos(Math.PI * p);                 // a pendulum: at rest at each end, fastest through the middle
    const trail = SW.drag * Math.sin(Math.PI * clamp(p * 1.08 - 0.04)) + 2.2 * Math.sin(Math.PI * 5 * p) * (1 - p);   // the body is left behind a little, and jiggles as it settles into the swing
    const key = `${th.toFixed(2)}|${trail.toFixed(2)}`;
    if (key === was) return;
    was = key;
    arm.style.transform = `rotate(${th.toFixed(2)}deg)`;
    shade.style.transform = `translate(${cast[0].toFixed(1)}px,${cast[1].toFixed(1)}px) rotate(${th.toFixed(2)}deg)`;
    parts.ape.style.transform = parts.apeS.style.transform = `rotate(${trail.toFixed(2)}deg)`;
  }

  return { layout, apply };
}
