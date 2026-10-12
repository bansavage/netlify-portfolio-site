/* ground.js — THE GROUND: the sheet itself. Cream linen with the pale-gold field in the middle of it.
 * ("Wallpaper")
 *
 * It is the bottom layer of the page (canvas.ground in index.html), UNDER the HTML copy, which is in
 * turn under the foliage (the WebGL canvas, transparent wherever there is no leaf). So the gold is
 * simply there from the first frame on, behind everything, and the only way to see it is for the
 * leaves in front of it to move out of the way. Nothing in the piece fades the gold in or out.
 *
 * The picture is worked out once per layout, point by point, small (it is all soft gradient) and
 * stretched smooth to the page by the browser:
 *   - palest at the very heart of the field (`core`), pale gold through its body (`gold`), a tinge of
 *     marigold toward its edge (`mari`), and back to the cream linen with no line anywhere;
 *   - its edge wanders (three slow sine terms), so it is never a clean oval.
 * The canvas holds only the gold, at the strength it has at each point; the cream is the stage behind
 * it (--ground in canopy.css). main.js lets the whole field breathe very slowly in the ambient loop
 * by a few per cent (opacity and size of this one layer), and shows it a little smaller while the
 * camera is still on its way to it (the same few per cent as the copy printed on it).
 *
 * WHERE THE GOLD IS: compose.js works out `glow` (its middle and the half-size of the opening the
 * foliage leaves round the copy) and scene.layout() hands it back to main.js, which calls paintGround.
 * THE COLOURS are GOLD, just below (scene.js: LOOK.glow and LOOK.ground point here).
 *
 * No three.js in here. If the scene cannot start at all, canopy.css paints a plain version of the
 * same thing (--still) and this canvas stays empty.
 */
import { hexToVec, smoothstep, lerp } from './kit.js';

export const GOLD = { ground: '#F4EDDA', core: '#FEF4D8', gold: '#F7DFA0', mari: '#F2A33C' };
/* the canvas is bigger than the page on every side (see .ground in canopy.css), so that neither the
 * slow breathing of its size nor its being seen a little smaller while the camera is still on its way
 * (main.js: THE SHEET COMES NEARER) ever brings an edge of it into the picture */
export const BLEED = 0.11;

/** how far a point of the page (0..1 both ways, y up) is from the middle of the field, in openings:
 *  0 = its heart, 1 = about where the frame of foliage begins. (The same measure the leaf shader uses
 *  for the warmth of the leaves beside the opening: shaders.js, glowR.) */
export function glowR(sx, sy, g, aspect) {
  const dx = (sx - g.cx) / g.hx, dy = (sy - g.cy) / g.hy;
  return Math.hypot(dx, dy) * (1 + 0.085 * Math.sin(sx * 9 * aspect + 1.3) * Math.sin(sy * 7 + 0.6)
                                 + 0.055 * Math.sin(sx * 5 * aspect - sy * 11 + 2.0)
                                 + 0.03 * Math.sin(sx * 17 * aspect + sy * 13 + 0.4));
}

/**
 * @param canvas  canvas.ground
 * @param glow    { x, y: the middle of the field (CSS px, y down), rx, ry: half-size of the opening (px) }
 * @param W,H     size of the stage in CSS px
 */
export function paintGround(canvas, glow, W, H) {
  const key = [W, H, glow.x, glow.y, glow.rx, glow.ry].map((v) => v.toFixed(2)).join(' ');
  if (canvas.dataset.ground === key) return;                      // same field as is already painted
  canvas.dataset.ground = key;
  const span = 1 + 2 * BLEED;
  const sc = Math.min(1, Math.sqrt(42000 / (W * H)));           // it is all soft gradient: about 40k points for the page itself (60k with the bleed), stretched smooth by the browser, is plenty at any screen size
  const w = Math.max(8, Math.round(W * span * sc)), h = Math.max(8, Math.round(H * span * sc));
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d'), img = ctx.createImageData(w, h), d = img.data;
  const core = hexToVec(GOLD.core), gold = hexToVec(GOLD.gold), mari = hexToVec(GOLD.mari);
  const g = { cx: glow.x / W, cy: 1 - glow.y / H, hx: glow.rx / W, hy: glow.ry / H }, aspect = W / H;
  for (let j = 0; j < h; j++) {
    const sy = 1 - (((j + 0.5) / h) * span - BLEED);
    for (let i = 0; i < w; i++) {
      const sx = ((i + 0.5) / w) * span - BLEED;
      const r = glowR(sx, sy, g, aspect);
      const a = smoothstep(0.1, 0.95, r), m = 0.34 * smoothstep(0.66, 1.2, r), k = 1 - smoothstep(0.82, 1.62, r);
      const o = (j * w + i) * 4;
      for (let c = 0; c < 3; c++) d[o + c] = Math.round(255 * lerp(lerp(core[c], gold[c], a), mari[c], m));
      d[o + 3] = Math.round(255 * k);
    }
  }
  ctx.putImageData(img, 0, 0);
  canvas.style.transformOrigin = `${(((glow.x / W + BLEED) / span) * 100).toFixed(3)}% ${(((glow.y / H + BLEED) / span) * 100).toFixed(3)}%`;
}
