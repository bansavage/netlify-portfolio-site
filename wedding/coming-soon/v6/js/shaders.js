/* shaders.js — the GLSL for the scene. Each block is a small program that runs on the GPU.
 * ("Wallpaper": everything here is PRINT, not photography.)
 *
 * Print note: nothing in this file is lit, and NOTHING IN IT FADES. A leaf is its painted texture
 * times a tint, at full strength, from the first frame to the last: there is no glow that bleaches
 * it, no burn-through, no fade at the lens, no growing in. A leaf leaves the picture one way only:
 * by MOVING out of it (THE PARTING, in LEAF_VERT below). There is no backlight, no rim light, no
 * fog, no sun shaft, no dust, no grain and no lens blur either.
 * Depth is told the way a printed, layered sheet tells it:
 *   - TONE      farther layers are printed fainter: their ink is mixed toward the cream ground (uLook.x);
 *   - SHADOW    every leaf casts a soft, slightly offset paper shadow on whatever is behind it: the
 *               next leaf, the gold ground, the letters of the copy (the small pre-blurred copy of the
 *               atlas, read a little up and to the left);
 *   - WARMTH    the leaves of the frame that stand beside the gold take a slight warm tint from it
 *               (uLook.y: colour only, at most red +5% and blue -5%, a fixed function of where on the
 *               page the leaf is. It is light on paint. It never touches alpha or contrast).
 * The foliage canvas is TRANSPARENT wherever there is no leaf: the ground (cream linen, the gold
 * field: js/ground.js) and the HTML copy are separate layers of the page UNDER it, so leaves pass in
 * front of the letters. The woven linen and the uneven light of the wall are one more sheet laid over
 * everything (js/finish.js).
 *
 * Colour note: everything works directly in the same sRGB numbers as the CSS palette (no linear-light
 * conversion), so a hex value in kit.js looks the same on a leaf as in the HTML.
 * All blending is "premultiplied over": output = vec4(colour * alpha, alpha), and that is also how the
 * finished canvas is laid over the page.
 *
 * Time note: there are two clocks. uTime is seconds since the start and drives the one-off cues of
 * the intro. uLoop is the same clock wrapped every LOOP seconds and drives everything that repeats
 * (the stir of the leaves, the flags). Every repeating motion completes a WHOLE number of cycles per
 * loop — that is what CYC(n) means — so the ambient scene has no seam however long the page is open.
 */
import { CARD_ROWS } from './plants.js';

export const LOOP = 600;          // seconds in the ambient loop (CYC below assumes this number)

/* ---- shared by every program: time, screen, where the gold field is ---------------------------- */
export const COMMON = /* glsl */ `
precision highp float;
uniform float uTime;      // seconds since the piece started (intro cues)
uniform float uLoop;      // the same clock, wrapped to the ambient loop (everything that repeats)
uniform vec2  uRes;       // drawing-buffer size in px
uniform float uAspect;    // width / height
uniform vec2  uSun;       // the middle of the gold field in screen coords (0..1, y up): where the copy sits, and where the camera is heading
uniform vec2  uGlow;      // half-size of the opening the foliage leaves around the copy (screen 0..1)
uniform vec3  cGround;    // the cream linen

#define CYC(n) ((n) * 0.010471975512)   /* n whole cycles per 600 s loop, as radians per second */

float springStep(float tau, float freq, float damp){ return tau <= 0.0 ? 0.0 : 1.0 - exp(-damp * tau) * cos(freq * tau); }
/* A leaf on its stalk, PUSHED (or let go): it starts from rest and gathers speed (no jerk: that is the
 * difference from springStep, which leaves at full speed), swings through, overshoots by
 * exp(-damp * PI / freq) and settles on 1. It first reaches 1 at (PI - atan(freq / damp)) / freq seconds. */
float swingStep(float tau, float freq, float damp){
  if (tau <= 0.0) return 0.0;
  return 1.0 - exp(-damp * tau) * (cos(freq * tau) + (damp / freq) * sin(freq * tau));
}

/* How far a screen point is from the middle of the gold field, in openings: 0 = its heart, 1 = about
 * where the frame of foliage begins. The measure wanders, so nothing built on it is ever a clean oval.
 * (js/ground.js paints the field itself with the same measure.) */
float glowR(vec2 sp){
  vec2 d = (sp - uSun) / uGlow;
  return length(d) * (1.0 + 0.085 * sin(sp.x * 9.0 * uAspect + 1.3) * sin(sp.y * 7.0 + 0.6)
                          + 0.055 * sin(sp.x * 5.0 * uAspect - sp.y * 11.0 + 2.0)
                          + 0.03 * sin(sp.x * 17.0 * uAspect + sp.y * 13.0 + 0.4));
}
`;

/* ---- wind (leaves and paper flags share it, so one breath of air moves both) --------------------
 * A wallpaper that is very slightly alive: a slow front of air travels left to right across the
 * sheet and each leaf has its own gentle sway underneath. p = position in frame, -1..1. */
export const WIND = /* glsl */ `
uniform float uWindBase;  // strength of the per-leaf sway
uniform float uWindGust;  // strength of the travelling stir (a little higher while the camera pushes through)
uniform float uGate;      // 1 during the intro = the stir is always on; 0 = it comes and goes
float windAt(vec2 p, float seed, float t){
  float heading = 0.5 + 0.35 * sin(t * CYC(5.0) + 0.8);
  float crest = sin(p.x * 1.7 - t * CYC(74.0) + p.y * heading + 0.7 * sin(t * CYC(16.0) + p.y));
  float gust = smoothstep(-0.1, 1.0, crest); gust *= gust;
  gust *= 0.62 + 0.38 * sin(t * CYC(22.0) + 1.3);
  float sets = smoothstep(0.05, 0.7, sin(p.x * 0.6 - t * CYC(30.0) + 2.0) * sin(t * CYC(7.0) + p.y * 0.8 + 1.1));
  gust *= mix(0.25 + 0.75 * sets, 1.0, uGate);
  float sway = 0.6 * sin(t * CYC(61.0) + seed * 6.283) + 0.4 * sin(t * CYC(107.0) + seed * 17.0);
  return uWindBase * sway * 0.5 + uWindGust * gust;
}
`;

/* ---- full-screen pass ------------------------------------------------------------------------- */
export const SCREEN_VERT = /* glsl */ `
void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/* over everything: the rise of the first frame out of the bare linen before t = 0. The ONLY fade in
 * the piece. Not drawn at all the rest of the time. At full strength it is opaque cream: it hides the
 * gold and the copy too. */
export const VEIL_FRAG = COMMON + /* glsl */ `
uniform float uFade;
void main(){
  gl_FragColor = vec4(cGround * uFade, uFade);
}
`;

/* ---- leaves ------------------------------------------------------------------------------------
 * One card per leaf. Per-instance attributes say where its root is, how big the card is, which
 * atlas cell to show, its tint, and how it moves. The vertex shader bends the card: rotation grows
 * from the root (v = 0) to the tip (v = 1), and the tip reads the wind a moment later than the root.
 * The card is not a plain rectangle: each of its rows only spans as far as the drawing reaches at
 * that height (looked up in the outline table), so the GPU does not shade empty texture.
 *
 * THE PARTING. Every leaf swings about its ROOT, which never moves, at a time of its own (iPose.w),
 * on a damped spring (uSpring, at the plant's own tempo: iGo.x) that starts from rest and gathers
 * speed (swingStep). The blade hears about it later the further along it is, hardly at all near the
 * stalk and most at the tip (iMove.x), so the stem leads, the leaf bends, the tip trails and then
 * overshoots after it. Two kinds, by layer (uLook.w):
 *   0  THE WALLPAPER THAT PARTS BEFORE THE CAMERA. The leaf is at rest, as printed, until the camera comes up to
 *      it; then it is pushed aside like foliage parted by a shoulder. First the anticipation: it
 *      leans a few degrees the OTHER way (iMove.y radians, over ANT seconds), into the push; then it
 *      swings out by iPose.z (compose.js has worked that angle out so that it is clear of the
 *      picture) and stays out. It turns as one piece, so that all of it goes; the lag is what bends
 *      it on the way.
 *   1  THE FRAME (the last curtain). The leaf STARTS swung in across the middle by iPose.z, bent over
 *      (its tip turned furthest, its base least), covering the gold and the copy, and springs OPEN to
 *      its composed resting place when its time comes.
 * Nothing else takes a leaf out of the picture or brings one in: no alpha, no scale.
 *
 * THE STEM. Under each leaf of the frame runs a thin strip that carries its stalk on below the root,
 * out of the picture (iTint.a long, heading iMove.z). The frame is composed for the camera at rest,
 * with every root just outside it; from further back those roots are in shot, and without the strip
 * a leaf would end in a cut stalk in mid-air. The strip is painted with the stalk's own paint (one
 * row of the drawing, just above the cut, drawn out), narrows to under half its width and deepens in
 * tone toward its far end (a stalk going down into the thicket, not a ruled bar), and it does not
 * swing: the leaf turns at the top of it. */
export const LEAF_VERT = COMMON + WIND + /* glsl */ `
attribute vec4 iRoot;   // xyz = root position (world), w = length of the whole plant (world)
attribute vec4 iQuad;   // xy = size of the sprite's whole atlas cell (world), zw = pivot inside the cell (0..1)
attribute vec4 iUV;     // atlas cell: u0, v0, du, dv
attribute vec4 iWind;   // x = bend at full stir (radians), y = random seed, zw = position in frame (-1..1)
attribute vec4 iTint;   // rgb = colour multiplier (the painted texture is the colour; this is only variety), a = length of the stem that runs on below the root (world; 0 = none)
attribute vec4 iPose;   // x = rest angle (clockwise from up), y = mirror (+1/-1), z = THE SWING (radians, see above), w = the time it swings
attribute vec4 iHead;   // xy = offset of this part within its plant (flower parts ride on their stalk), z = tip lag in the wind (s), w = sprite number
attribute vec4 iBloom;  // flower parts: x = open angle, y = closed angle, z = time it opens, w = closed scale
attribute vec4 iMove;   // x = how late the tip is in the swing (s), y = anticipation (radians: it leans this far the other way first; the wallpaper only), z = heading of the stem below the root, w = 1 for flower parts
attribute vec4 iGo;     // x = tempo: this plant's swing runs that much faster (> 1) or slower (< 1) than its layer's spring (a big heavy leaf is slower than a small one);
                        // yzw = A PART THAT HANGS FREE (the monkey) and swings about its own pivot like a weight on a string: y = how far (radians, 0 = it does not),
                        //       z = how many whole swings in the 600 s loop (150 = one every 4 s), w = where in its swing it starts
uniform sampler2D uHull;  // the outline table (plants.js: outlineOf)
uniform vec2  uHullSize;
uniform vec4  uLook;      // per layer: x = how faint its ink is printed (0 = full strength … 1 = gone into the ground), y = how much warmth it takes from the gold beside it (0..1 of WARM in the fragment shader),
                          //            z = strength of its paper shadow, w = which kind of parting: 1 = the frame (starts swung shut, springs open), 0 = the wallpaper that parts before the camera (at rest, then pushed aside)
uniform vec2  uSpring;    // the spring of this layer's swing: x = frequency (rad/s), y = damping
uniform vec2  uPaper;     // paper shadows: x = strength right now, y = how far they fall (fraction of the card height)
varying vec2 vUv;
varying vec2 vCard;     // position on the card, 0..1 both ways
varying vec3 vTint;
varying vec2 vFx;       // x = warmth from the gold (0..1), y = 1 for flower parts
varying vec2 vSh;       // where, in atlas uv, the thing that shades this point is

const float ROWS = ${CARD_ROWS}.0;
const vec2 SHADE = vec2(0.52, -0.855);   // which way paper shadows fall on screen: down and a little to the right (the wall is lit from the upper left)
const float ANT = 0.2;                   // THE PARTING: seconds a leaf of the wallpaper spends leaning the other way before it swings (the anticipation)

void main(){
  float stem = position.z;                                   // 0 = the leaf card, 1 = the top of the stem strip (at the root), 2 = its far end
  // where this corner sits in the sprite's atlas cell (0..1): the card hugs the drawing row by row
  float row = floor(position.y * ROWS + 0.5);
  vec4 hx = texture2D(uHull, vec2(row + 0.5, iHead.w + 0.5) / uHullSize);
  vec4 hy = texture2D(uHull, vec2(ROWS + 1.5, iHead.w + 0.5) / uHullSize);
  vec2 cell = vec2(mix(hx.x, hx.y, position.x), mix(hy.x, hy.y, position.y));
  vec2 shape = cell;                                         // where the corner is (the paint is looked up at cell)
  if (stem > 0.5) {                                          // the stem: the stalk's own paint, one row of it just above the cut end …
    cell = vec2(iQuad.z + (position.x - 0.5) * 0.085, iQuad.w + 0.013);
    shape = vec2(iQuad.z + (position.x - 0.5) * 0.085 * (stem > 1.5 ? 0.42 : 1.0), cell.y);   // … narrowing toward its far end
  }
  vec2 q = (shape - iQuad.zw) * iQuad.xy;                    // measured from the pivot, in world units

  // flower parts swing open on a spring (everything else has iBloom = 0,0,-1000,1 → no-op)
  float vq = clamp((cell.y - iQuad.w) / max(1.0 - iQuad.w, 0.001), 0.0, 1.0);
  float sB = springStep(uTime - iBloom.z - vq * 0.07, 9.5, 5.0);
  float pa = mix(iBloom.y, iBloom.x, sB);
  pa += iGo.y * sin(uLoop * CYC(iGo.z) + iGo.w) * (0.8 + 0.2 * sin(uLoop * CYC(17.0) + iGo.w * 2.0));   // the slow swing of a part that hangs free: never quite the same size twice
  float cp = cos(pa), sn = sin(pa);
  q = vec2(q.x * cp + q.y * sn, -q.x * sn + q.y * cp) * mix(iBloom.w, 1.0, min(sB, 1.12));

  vec2 local = q + iHead.xy;
  local.x *= iPose.y;
  float vp = clamp(local.y / iRoot.w, 0.0, 1.0);          // 0 at the root … 1 at the tip of the plant

  // the stir of the air: the tip hears about it late, and bends further
  float w = windAt(iWind.zw, iWind.y, uLoop - vp * iHead.z) * iWind.x;
  float a0 = iPose.x;
  float a = a0 + w * (cos(a0) + 0.3 * sin(a0) * sin(uLoop * CYC(84.0) + iWind.y * 20.0)) * (0.2 + 0.8 * vp);

  // THE PARTING (see above). tau: how long ago this point of the leaf was told to go, on the plant's own clock.
  float late = iMove.x * vp * (0.45 + 0.55 * vp);                        // stiff at the stalk, limp toward the tip
  float tau0 = (uTime - iPose.w) * iGo.x, tau = tau0 - late * iGo.x;
  float go = swingStep(tau - ANT * 0.72 * (1.0 - uLook.w), uSpring.x, uSpring.y);
  // the wallpaper: a lean into the push, the whole leaf together; each part of it is let go as its own swing gathers speed; then out, all of a piece
  float windUp = smoothstep(0.0, ANT, tau0) * (1.0 - smoothstep(ANT * 0.85, ANT + 0.26, tau));
  float pushed = iPose.z * go - sign(iPose.z) * iMove.y * windUp;
  // the frame: bent over the middle until it springs open
  float shut = iPose.z * (1.0 - go) * (0.3 + 0.7 * vp);
  a += mix(pushed, shut, uLook.w);

  float ca = cos(a), sa = sin(a);
  vec2 off = vec2(local.x * ca + local.y * sa, -local.x * sa + local.y * ca);
  if (stem > 1.5) {                                          // the far end of the stem: straight on below the root, out of the picture; it does not swing
    float cs = cos(iMove.z), ss = sin(iMove.z);
    off = iTint.a > 0.0 ? vec2(local.x * cs - iTint.a * ss, -local.x * ss - iTint.a * cs) : off;
  }
  vec4 mv = viewMatrix * vec4(iRoot.xyz + vec3(off, 0.0), 1.0);
  gl_Position = projectionMatrix * mv;

  // warmth from the gold: only a function of where on the page this point is (never of time)
  vec2 sp = gl_Position.xy / max(gl_Position.w, 0.001) * 0.5 + 0.5;
  vFx = vec2(uLook.y * (1.0 - smoothstep(0.7, 1.45, glowR(sp))), iMove.w);
  vUv = iUV.xy + cell * iUV.zw;
  vCard = stem > 0.5 ? vec2(position.x, 0.5) : position.xy;
  vTint = iTint.rgb * (stem > 1.5 ? 0.66 : 1.0);            // (the stem deepens toward its far end: it goes down into the thicket)

  // The paper shadow falls the same way on screen however the leaf is turned: work out where, on this
  // leaf's own drawing, the bit that shades each point is (a short step back toward the light).
  vec2 ws = -SHADE * uPaper.y * iQuad.y;
  vec2 ls = vec2((ws.x * ca - ws.y * sa) * iPose.y, ws.x * sa + ws.y * ca);
  vSh = ls / iQuad.xy * iUV.zw;
}
`;

export const LEAF_FRAG = COMMON + /* glsl */ `
uniform sampler2D uAtlas;     // the painted drawings
uniform sampler2D uBlur;      // the same atlas, small and pre-blurred: the shape of each paper shadow
uniform vec4  uLook;
uniform vec2  uPaper;
uniform vec3  uPrint;         // x = how far the texture's colour is pulled toward earthy gouache (0 = use the painting exactly as painted), y = matte (lifted darks), z = flat tones (0 with painted sprites)
uniform vec3  cShadow;        // the colour a paper shadow multiplies toward
varying vec2 vUv;
varying vec2 vCard;
varying vec3 vTint;
varying vec2 vFx;
varying vec2 vSh;

/* gouache: matte, earthy, no acid greens and no true black. With sprites that are already painted
 * in muted colour this should be turned right down (LOOK.mute in scene.js). */
vec3 gouache(vec3 c, float flower){
  float m = uPrint.x * (1.0 - 0.6 * flower);
  float l = dot(c, vec3(0.30, 0.56, 0.14));
  // flat paint: smooth airbrushed shading is gathered into a few flat tones with soft joins (uPrint.z; 0 for sprites that are already brushwork)
  float q = l * 6.0, band = (floor(q) + smoothstep(0.3, 0.7, fract(q))) / 6.0;
  c *= mix(1.0, band / max(l, 0.03), uPrint.z * (1.0 - flower));
  l = dot(c, vec3(0.30, 0.56, 0.14));
  c = mix(c, vec3(l), 0.8 * m);
  c *= mix(vec3(1.0), vec3(1.16, 0.97, 0.74), min(1.0, m * 1.6));     // what is left of the green leans to olive
  c *= 1.0 - 0.5 * m * smoothstep(0.42, 0.9, l);                      // and no highlight glares: a lit rim becomes a dry-brushed light
  return mix(c, c * 0.9 + vec3(0.052, 0.054, 0.036), uPrint.y);       // matte paint: the darks never quite close
}

const vec3 WARM = vec3(1.1, 1.035, 0.9);   // the most the gold can warm a leaf: red +10%, blue -10% (times uLook.y, which is at most 0.5)

void main(){
  // the paint, at full strength, always: a leaf is never made lighter, paler or more see-through than it was painted
  vec4 tex = texture2D(uAtlas, vUv);
  vec3 c = gouache(tex.rgb / max(tex.a, 0.001), vFx.y) * vTint;
  c = mix(c, cGround, uLook.x);                                         // farther = printed fainter (fixed per layer)
  c *= mix(vec3(1.0), WARM, vFx.x * (1.0 - 0.5 * vFx.y));              // light, not fade: beside the gold a leaf is a touch warmer (colour only)
  float la = tex.a;

  // the paper shadow: soft, a little down and right of the leaf, and never past the edge of its card
  // (only looked up where it can show: round the edge of the leaf, not under its solid body)
  float sa = 0.0;
  if (la < 0.985 && uLook.z > 0.0) {
    vec2 e = smoothstep(vec2(0.0), vec2(0.07, 0.035), vCard) * smoothstep(vec2(0.0), vec2(0.07, 0.035), 1.0 - vCard);
    float sh = smoothstep(0.16, 0.8, textureLod(uBlur, vUv + vSh, 0.0).a) * e.x * e.y;
    sa = sh * uPaper.x * uLook.z * (1.0 - la);
  }

  gl_FragColor = vec4(c * la + cShadow * sa, la + sa);
}
`;

/* The same leaf card, drawn with no colour at all, into the stencil only: it marks the pixels where the
 * paint of this leaf is solid (see THE MASK in scene.js: what is behind solid paint is not shaded). */
export const MASK_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uAtlas;
varying vec2 vUv;
void main(){
  if (texture2D(uAtlas, vUv).a < 0.997) discard;
  gl_FragColor = vec4(0.0);
}
`;

/* ---- the string and the papel picado on it --------------------------------------------------------
 * The string hangs between two points with a sag; flags and twine use the same curve. */
const STRING_FN = /* glsl */ `
uniform vec4 uStrA;      // xyz = left end (world), w = sag (world)
uniform vec4 uStrB;      // xyz = right end, w = how far it swings
vec3 onString(float s){
  float k = 4.0 * s * (1.0 - s);
  vec3 p = mix(uStrA.xyz, uStrB.xyz, s);
  p.y -= uStrA.w * k * (1.0 + 0.02 * sin(uLoop * CYC(47.0)));
  p.x += sin(uLoop * CYC(37.0)) * uStrB.w * k;
  return p;
}
`;

/* papel picado: each flag hangs from the string by its top edge, unrolls on a spring when its cue
 * comes, and lifts very slightly in the same air as the leaves. Painted paper: flat colour, matte.
 * The same cards are drawn twice: first as their own paper shadow (SHADOW), then as the tissue. */
export const FLAG_VERT = COMMON + WIND + STRING_FN + /* glsl */ `
attribute vec4 aFlag;    // x = position along the string 0..1, y = unused, z = random seed, w = which design (0, 1, 2)
attribute vec3 aDye;     // its colour
uniform vec4  uFlag;     // x = width, y = height (world), z = width as a fraction of the string, w = time the first flag drops
uniform vec4  uPaperCell; // design cell in the paper texture: x = cell width, y = pad.x, z = pad.y (all 0..1 of the texture), w = number of designs
uniform vec2  uPaper;
varying vec2 vUv;
varying vec3 vDye;
varying float vTone;
void main(){
  float v = -position.y;                                          // 0 at the string … 1 at the bottom edge
  vec3 top = onString(aFlag.x + position.x * uFlag.z);
  vec4 c0 = projectionMatrix * viewMatrix * vec4(onString(aFlag.x), 1.0);
  vec2 fp = c0.xy / c0.w;                                         // where the flag is in frame, -1..1
  // unrolls from the string, left to right, overshooting a little and settling
  float open = springStep(uTime - (uFlag.w + (fp.x * 0.5 + 0.5) * 1.5 + aFlag.z * 0.14), 9.0, 4.2);
  float w = windAt(fp, aFlag.z, uLoop - v * 0.16);
  float swing = w * 0.22 + 0.03 * sin(uLoop * CYC(71.0) + aFlag.z * 31.0) + (1.0 - min(open, 1.0)) * 0.35;
  float len = uFlag.y * open * (1.0 - 0.1 * clamp(abs(w) * 0.5, 0.0, 0.6));
  vec3 p = top + vec3(sin(swing), -cos(swing), 0.0) * (v * len);
  p.x += sin(v * 5.0 + position.x * 3.0 + uLoop * CYC(190.0) + aFlag.z * 19.0) * 0.03 * uFlag.x * v * (0.3 + abs(w));   // a ripple down the paper
#ifdef SHADOW
  p.xy += vec2(0.52, -0.855) * uFlag.y * (0.035 + 5.0 * uPaper.y);   // its shadow, on the sheet a little behind it
#endif
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);

  vUv = vec2((aFlag.w + uPaperCell.y + (position.x + 0.5) * (1.0 - 2.0 * uPaperCell.y)) * uPaperCell.x,
             1.0 - (uPaperCell.z + v * (1.0 - 2.0 * uPaperCell.z)));
  vDye = aDye;
  vTone = 0.94 + 0.08 * fract(aFlag.z * 7.31);                    // no two sheets of tissue take the dye quite alike
}
`;
export const FLAG_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uTissue;
uniform vec2 uPaper;
uniform vec3 cShadow;
varying vec2 vUv;
varying vec3 vDye;
varying float vTone;
void main(){
#ifdef SHADOW
  float a = texture2D(uTissue, vUv, 2.2).a * 0.34 * uPaper.x;      // (read from a small mip: soft-edged)
  gl_FragColor = vec4(cShadow * a, a);
#else
  vec4 tex = texture2D(uTissue, vUv);
  vec3 c = pow(vDye, vec3(1.08)) * (tex.rgb / max(tex.a, 0.001)) * vTone;   // dyed tissue, printed flat
  gl_FragColor = vec4(c * tex.a, tex.a);
#endif
}
`;

export const WIRE_VERT = COMMON + STRING_FN + /* glsl */ `
attribute vec3 aWire;    // x = position along the string, y = side (-1/+1), z = unused
uniform float uWirePx;
varying vec2 vSide;      // x = across the string (-1..1), y = position along it
void main(){
  vSide = vec2(aWire.y, aWire.x);
  vec4 a = projectionMatrix * viewMatrix * vec4(onString(aWire.x), 1.0);
  vec4 b = projectionMatrix * viewMatrix * vec4(onString(aWire.x + 0.01), 1.0);
  vec2 dir = normalize((b.xy / b.w - a.xy / a.w) * uRes);
  a.xy += vec2(-dir.y, dir.x) * aWire.y * uWirePx / uRes * 2.0 * a.w;
  gl_Position = a;
}
`;
export const WIRE_FRAG = /* glsl */ `
precision highp float;
uniform float uWireA;     // how far along the string has been strung so far (0 = nothing yet, 1 = all of it)
varying vec2 vSide;
void main(){
  // thrown across from the left just ahead of the flags; soft edges, so the thin line does not stair-step
  float a = 0.78 * (1.0 - vSide.x * vSide.x) * (1.0 - smoothstep(uWireA - 0.06, uWireA, vSide.y));
  gl_FragColor = vec4(vec3(0.2, 0.17, 0.11) * a, a);              // twine
}
`;
