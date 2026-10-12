/* shaders.js — the GLSL for the scene. Each block is a small program that runs on the GPU.
 *
 * Colour note: everything here works directly in the same sRGB numbers as the CSS palette
 * (no linear-light conversion), so a hex value in kit.js looks the same on a leaf as in the HTML.
 * All blending is "premultiplied over": output = vec4(colour * alpha, alpha). Writing alpha = 0
 * with a non-zero colour therefore ADDS light (used for sun shafts, dust and the bulbs).
 *
 * Time note: there are two clocks. uTime is seconds since the start and drives the one-off cues of
 * the intro. uLoop is the same clock wrapped every LOOP seconds and drives everything that repeats
 * (wind, sway, twinkle, drifting dust). Every repeating motion completes a WHOLE number of cycles
 * per loop — that is what CYC(n) means — so the ambient scene has no seam and stays exact however
 * long the page is left open.
 */
import { CARD_ROWS } from './plants.js';

export const LOOP = 600;          // seconds in the ambient loop (CYC below assumes this number)

/* ---- shared by every program: time, screen, the sun, and the sky/jungle gradient ------------ */
export const COMMON = /* glsl */ `
precision highp float;
uniform float uTime;      // seconds since the piece started (intro cues)
uniform float uLoop;      // the same clock, wrapped to the ambient loop (everything that repeats)
uniform vec2  uRes;       // drawing-buffer size in px
uniform float uAspect;    // width / height
uniform vec2  uSun;       // where the sun sits, in screen coords (0..1, y up) - just off the top-left corner
uniform float uSkyLine;   // screen height (0..1) of the top of the jungle wall behind the names
uniform float uPortal;    // 1 = still inside the dark jungle looking at a blown-out clearing, 0 = arrived
uniform float uRayT;      // slow clock that drifts the sun shafts
uniform vec4  uPoolRect;  // the shaded area behind the copy: centre.xy, radius.xy (screen 0..1)
uniform float uPool;      // 0..1 strength of that shade
uniform vec3  cDeep, cMid, cHazeGreen, cHaze, cSkyFar, cSun;

#define CYC(n) ((n) * 0.010471975512)   /* n whole cycles per 600 s loop, as radians per second */

float hash21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float springStep(float tau, float freq, float damp){ return tau <= 0.0 ? 0.0 : 1.0 - exp(-damp * tau) * cos(freq * tau); }

/* soft stripes fanning out from the sun: the shafts of light between the leaves */
float shafts(vec2 sp){
  vec2 d = (sp - uSun) * vec2(uAspect, 1.0);
  float a = atan(d.y, d.x);
  float s = 0.55 * sin(a * 19.0 + uRayT) + 0.30 * sin(a * 37.0 - uRayT * 0.7 + 1.7) + 0.15 * sin(a * 71.0 + uRayT * 1.3 + 0.4);
  return smoothstep(-0.15, 0.85, s);
}
float sunGlow(vec2 sp, float k){ vec2 d = (sp - uSun) * vec2(uAspect, 1.0); return exp(-dot(d, d) * k); }

/* how far a screen point is from the block of copy (0 centre, 1 its edge): a soft ellipse whose
 * edge wanders, so it reads as dappled shade rather than a shape */
float poolDist(vec2 sp){
  vec2 d = abs((sp - uPoolRect.xy) / uPoolRect.zw);
  float r = pow(pow(d.x, 2.4) + pow(d.y, 2.4), 1.0 / 2.4);
  return r + 0.06 * sin(sp.x * 9.0 * uAspect + 1.3) * sin(sp.y * 7.0 + 0.6) + 0.035 * sin(sp.x * 23.0 * uAspect - sp.y * 17.0);
}

/* 0..1: how deep inside that shade a screen point is */
float poolIn(vec2 sp){ return (1.0 - smoothstep(0.78, 1.5, poolDist(sp))) * uPool; }
/* Shade as the eye sees it: whatever stands behind the copy is held under a brightness ceiling
 * (hue kept), so pale midribs and sunlit haze can never come up behind the type. This, not a dark
 * box, is what guarantees the text contrast. */
vec3 shadeCap(vec3 c, float amount, float ceiling){
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  return mix(c, c * min(1.0, ceiling / max(l, 0.001)), amount);
}
const float SHADE_CEILING = 0.23;

/* the far background: deep jungle floor, up through warm haze, into golden sky */
vec3 backdrop(vec2 sp){
  float y = sp.y - uSkyLine;
  vec3 c = mix(cDeep, cMid, smoothstep(-0.95, -0.12, y));
  c = mix(c, cHazeGreen, smoothstep(-0.22, 0.0, y));
  vec3 sky = mix(cHaze, cSkyFar, smoothstep(0.15, 1.05, length(sp - uSun)));   // gold by the sun, deeper marigold across the frame from it
  c = mix(c, sky, smoothstep(-0.06, 0.07, y));
  c += cSun * (sunGlow(sp, 1.6) * 0.26 + exp(-y * y * 60.0) * 0.12);    // sun bloom + light pooling along the tree line
  return c;
}
`;

/* ---- wind (leaves and paper flags share it, so one breeze moves both) ---------------------------
 * Wind is a field, not a wiggle: a gust front travels left to right across the frame, its heading
 * wandering a little; gusts arrive in sets with lulls between them (a second, slower field gates
 * them); underneath, every leaf has its own gentle sway. p = position in frame, -1..1. */
export const WIND = /* glsl */ `
uniform float uWindBase;  // strength of the per-leaf sway
uniform float uWindGust;  // strength of the travelling gusts (higher while the camera pushes through, and for the arrival gust)
uniform float uGate;      // 1 during the intro = gusts always on; 0 = they come and go in sets
float windAt(vec2 p, float seed, float t){
  float heading = 0.5 + 0.35 * sin(t * CYC(5.0) + 0.8);
  float crest = sin(p.x * 1.7 - t * CYC(110.0) + p.y * heading + 0.7 * sin(t * CYC(16.0) + p.y));
  float gust = smoothstep(-0.1, 1.0, crest); gust *= gust;
  gust *= 0.62 + 0.38 * sin(t * CYC(22.0) + 1.3);
  float sets = smoothstep(0.05, 0.7, sin(p.x * 0.6 - t * CYC(30.0) + 2.0) * sin(t * CYC(7.0) + p.y * 0.8 + 1.1));
  gust *= mix(0.2 + 0.8 * sets, 1.0, uGate);
  float sway = 0.6 * sin(t * CYC(79.0) + seed * 6.283) + 0.4 * sin(t * CYC(140.0) + seed * 17.0);
  float flutter = sin(t * CYC(668.0) + seed * 40.0) * gust;
  return uWindBase * sway * 0.5 + uWindGust * (gust + 0.22 * flutter);
}
`;

/* ---- full-screen passes ---------------------------------------------------------------------- */
export const SCREEN_VERT = /* glsl */ `
void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export const BACKDROP_FRAG = COMMON + /* glsl */ `
void main(){
  vec2 sp = gl_FragCoord.xy / uRes;
  gl_FragColor = vec4(shadeCap(backdrop(sp), poolIn(sp), SHADE_CEILING), 1.0);
}
`;

/* drawn after the jungle wall and the bed of leaves, before the leaves that frame the names:
 * sun shafts, the golden mist along the tree line, the "portal" glow of the clearing during the
 * push, and the soft shade the copy sits on */
export const ATMOS_FRAG = COMMON + /* glsl */ `
uniform float uRays, uGold;
uniform vec3 cPool;
void main(){
  vec2 sp = gl_FragCoord.xy / uRes;
  float y = sp.y - uSkyLine;
  float inAir = 1.0 - 0.75 * smoothstep(-0.02, 0.12, y);      // shafts show in the haze among the leaves, much less against open sky
  vec3 add = cSun * shafts(sp) * sunGlow(sp, 2.0) * uRays * 0.58 * inAir;
  // from inside the dark jungle the clearing is a blown-out golden fog; it thins as we arrive
  vec2 pc = (sp - 0.5) * vec2(uAspect, 1.0);
  float core = exp(-dot(pc, pc) * 3.0);
  float fog = uPortal * core * 0.9;
  vec3 fogCol = mix(cHaze, cSun * 1.08, core * core) * (0.9 + 0.1 * shafts(sp));
  // what is left of it once we are there: gold hanging in the air along the tree line, above the names
  float band = exp(-y * y / (y > 0.0 ? 0.012 : 0.0075)) * uGold * (0.82 + 0.18 * shafts(sp));
  vec3 mist = fogCol * fog + cHaze * band * (1.0 - fog);
  float mistA = fog + band * (1.0 - fog);
  // the shade the copy sits on
  float pd = poolDist(sp);
  float m = (1.0 - smoothstep(0.6, 1.5, pd)) * uPool;
  float a = m * 0.46;
  float clear = mix(1.0, smoothstep(0.95, 1.6, pd), uPool);   // no mist or shafts between the reader and the leaves the copy sits on
  gl_FragColor = vec4(cPool * a + (mist + add) * clear, a + mistA * clear * (1.0 - a));
}
`;

/* the very last thing drawn: light in the air in front of everything, vignette, film grain,
 * and the fade-up from deep green in the first half second */
export const LENS_FRAG = COMMON + /* glsl */ `
uniform float uFade, uGrain, uFrontRays, uFrame;
void main(){
  vec2 sp = gl_FragCoord.xy / uRes;
  float keep = mix(1.0, smoothstep(0.95, 1.6, poolDist(sp)), uPool);
  vec3 add = cSun * shafts(sp) * sunGlow(sp, 2.6) * uFrontRays * keep * 0.3 * (1.0 - 0.72 * smoothstep(-0.02, 0.12, sp.y - uSkyLine));
  float vig = smoothstep(0.45, 1.05, length((sp - 0.5) * vec2(1.1, 1.0)) * 1.22);
  float a = vig * 0.46;
  vec3 col = vec3(0.03, 0.085, 0.05) * a;
  float n = hash21(gl_FragCoord.xy + uFrame * vec2(37.0, 17.0)) - 0.5;      // uFrame: 24 grain frames a second, wrapped
  add += max(n, 0.0) * uGrain;
  a += max(-n, 0.0) * uGrain * 1.5;
  a = mix(a, 1.0, uFade);
  col = mix(col + add, cDeep, uFade);
  gl_FragColor = vec4(col, a);
}
`;

/* ---- leaves ------------------------------------------------------------------------------------
 * One card per leaf. Per-instance attributes say where its root is, how big the card is, which
 * atlas cell to show, its colour grade, and how it moves. The vertex shader bends the card:
 * rotation grows from the root (v = 0) to the tip (v = 1), and the tip reads the wind a moment
 * later than the root, so leaves whip instead of swinging like signs.
 * The card is not a plain rectangle: each of its rows only spans as far as the drawing reaches at
 * that height (looked up in the outline table), so the GPU does not shade empty texture. */
export const LEAF_VERT = COMMON + WIND + /* glsl */ `
attribute vec4 iRoot;   // xyz = root position (world), w = length of the whole plant (world)
attribute vec4 iQuad;   // xy = size of the sprite's whole atlas cell (world), zw = pivot inside the cell (0..1)
attribute vec4 iUV;     // atlas cell: u0, v0, du, dv
attribute vec4 iWind;   // x = bend at full gust (radians), y = random seed, zw = position in frame (-1..1)
attribute vec4 iTint;   // rgb = colour multiplier, a = how much it glows when the sun is behind it
attribute vec4 iPose;   // x = rest angle (clockwise from up), y = mirror (+1/-1), z = "parting" angle, w = parting time
attribute vec4 iHead;   // xy = offset of this part within its plant (flower parts ride on their stalk), z = tip lag (s), w = sprite number
attribute vec4 iBloom;  // flower parts: x = open angle, y = closed angle, z = time it opens, w = closed scale
attribute vec4 iGrow;   // x = time it grows in (-1000 = always there), y = size it starts at, z = fade-in (s), w = 1 for flower parts
uniform sampler2D uHull;  // the outline table (plants.js: outlineOf)
uniform vec2  uHullSize;
uniform float uFocus, uCocPx, uCocMax, uBackBlur;
uniform vec4  uLayer;     // per layer: x = blur multiplier, y = haze multiplier, z = cap on blur (fraction of uCocMax), w = 1 if it stands behind the copy
uniform vec2  uNearFade;
uniform float uFogStart, uFogDensity;
uniform vec2  uFarFade;   // layers close to the resting camera fade in as it approaches (x = fully there, y = gone)
varying vec2 vUv;
varying vec2 vCard;     // position on the card, 0..1 both ways
varying vec4 vTint;
varying vec3 vFx;       // x = blur diameter (px), y = fade, z = haze amount
varying vec4 vLit;      // rgb = colour of the haze behind this point, a = how much direct sun reaches it
varying vec3 vSh;       // x = broad warm wash of late sun across the frame, y = 1 for flower parts, z = how deep in the shade behind the copy

const float ROWS = ${CARD_ROWS}.0;

void main(){
  // where this corner sits in the sprite's atlas cell (0..1): the card hugs the drawing row by row
  float row = floor(position.y * ROWS + 0.5);
  vec4 hx = texture2D(uHull, vec2(row + 0.5, iHead.w + 0.5) / uHullSize);
  vec4 hy = texture2D(uHull, vec2(ROWS + 1.5, iHead.w + 0.5) / uHullSize);
  vec2 cell = vec2(mix(hx.x, hx.y, position.x), mix(hy.x, hy.y, position.y));
  vec2 q = (cell - iQuad.zw) * iQuad.xy;                     // measured from the pivot, in world units
  float vq = clamp((cell.y - iQuad.w) / max(1.0 - iQuad.w, 0.001), 0.0, 1.0);

  // flower parts swing open on a spring (everything else has iBloom = 0,0,-1000,1 → no-op)
  float sB = springStep(uTime - iBloom.z - vq * 0.07, 9.5, 5.0);
  float pa = mix(iBloom.y, iBloom.x, sB);
  float cp = cos(pa), sn = sin(pa);
  q = vec2(q.x * cp + q.y * sn, -q.x * sn + q.y * cp) * mix(iBloom.w, 1.0, min(sB, 1.12));

  vec2 local = q + iHead.xy;
  local.x *= iPose.y;
  float vp = clamp(local.y / iRoot.w, 0.0, 1.0);          // 0 at the root … 1 at the tip of the plant

  // growing in: the plant swells up from its root on a soft spring, the tip arriving a beat after the base
  float sG = springStep(uTime - iGrow.x - vp * 0.24, 5.6, 4.6);
  local *= mix(iGrow.y, 1.0, sG);
  float shown = iGrow.z > 0.0 ? smoothstep(0.0, iGrow.z, uTime - iGrow.x) : 1.0;

  // wind: the tip hears about it late, and bends further
  float w = windAt(iWind.zw, iWind.y, uLoop - vp * iHead.z) * iWind.x;
  float a0 = iPose.x;
  float a = a0 + w * (cos(a0) + 0.3 * sin(a0) * sin(uLoop * CYC(124.0) + iWind.y * 20.0)) * (0.2 + 0.8 * vp);
  // parting: starts swung in over the clearing, springs open as the camera arrives
  float sP = springStep(uTime - iPose.w - vp * 0.25, 5.2, 3.4);
  a += iPose.z * (1.0 - sP) * (0.3 + 0.7 * vp);

  float ca = cos(a), sa = sin(a);
  vec3 world = iRoot.xyz + vec3(local.x * ca + local.y * sa, -local.x * sa + local.y * ca, 0.0);
  vec4 mv = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mv;

  // depth of field: blur grows with distance from the focal plane (less so behind it)
  float dist = max(-mv.z, 0.05);
  float coc = 1.0 / dist - 1.0 / uFocus;
  coc = (coc > 0.0 ? coc : -coc * uBackBlur) * uCocPx * uLayer.x;
  vFx = vec3(min(coc, uCocMax * uLayer.z),
             smoothstep(uNearFade.x, uNearFade.y, dist) * (1.0 - smoothstep(uFarFade.x, uFarFade.y, dist)) * shown,
             (1.0 - exp(-max(dist - uFogStart, 0.0) * uFogDensity)) * uLayer.y);
  vUv = iUV.xy + cell * iUV.zw;
  vCard = position.xy;
  vTint = iTint;

  // light, worked out per corner (cheap) and blended across the leaf: strongest near the sun and
  // inside a shaft; early on, the glow of the clearing ahead rims the leaves around the opening
  vec2 sp = gl_Position.xy / gl_Position.w * 0.5 + 0.5;
  float light = sunGlow(sp, 1.7) * (0.5 + 0.9 * shafts(sp));
  vec2 pc = (sp - 0.5) * vec2(uAspect, 1.0);
  light = max(light, uPortal * exp(-dot(pc, pc) * 5.0) * 1.3);
  vLit = vec4(backdrop(sp), clamp(light, 0.0, 1.0));
  vSh = vec3(sunGlow(sp, 0.55), iGrow.w, uLayer.w * poolIn(sp));
}
`;

export const LEAF_FRAG = COMMON + /* glsl */ `
uniform sampler2D uAtlas;     // the sharp drawings
uniform sampler2D uBlur;      // the same atlas, small and pre-blurred
uniform vec2  uAtlasSize;
uniform float uBlurDiv;
uniform float uExposure;
varying vec2 vUv;
varying vec2 vCard;
varying vec4 vTint;
varying vec3 vFx;
varying vec4 vLit;
varying vec3 vSh;

void main(){
  vec2 tx = vUv * uAtlasSize;
  float tpp = max(length(dFdx(tx)), length(dFdy(tx)));      // atlas texels per screen pixel
  float coc = vFx.x, cocTex = coc * tpp;
  // a little blur comes free from mip-maps; a lot cross-fades to the pre-blurred atlas
  vec4 tex = texture2D(uAtlas, vUv, max(0.0, log2(max(coc, 1.0)) - 1.0));
  float k = smoothstep(7.0, 30.0, cocTex);
  if (k > 0.0) {
    float lod = max(log2(max(tpp / uBlurDiv, 0.0001)), log2(max(cocTex / 44.0, 0.0001)));
    tex = mix(tex, textureLod(uBlur, vUv, clamp(lod, 0.0, 2.6)), k);
    // an out-of-focus leaf has no hard edge anywhere - including where its card ends
    vec2 e = smoothstep(vec2(0.0), vec2(0.2, 0.06), vCard) * smoothstep(vec2(0.0), vec2(0.2, 0.06), 1.0 - vCard);
    tex *= mix(1.0, e.x * e.y, k);
  }
  float alpha = tex.a * vFx.y;
  vec3 c = tex.rgb / max(tex.a, 0.001);

  float light = vLit.a;
  c *= vTint.rgb * uExposure;
  // golden hour: warm where the low sun still reaches across the frame, cooler and deeper away from it
  vec3 grade = mix(vec3(0.66, 0.80, 0.80), vec3(1.05, 1.0, 0.88), vSh.x);
  grade = mix(grade, vec3(1.0), smoothstep(0.02, 0.5, light));
  vec3 leaf = c * grade;
  leaf = mix(leaf, leaf * vec3(1.40, 1.32, 0.70) + vec3(0.07, 0.09, 0.0), clamp(light * vTint.a * 1.25, 0.0, 1.0));  // sun through the leaf: acid lime
  // flower parts keep their own colour whatever the shade (orange stays orange, cobalt stays cobalt)
  vec3 bloom = c * mix(vec3(1.0, 0.98, 0.96), vec3(1.08), smoothstep(0.02, 0.5, light));
  c = mix(leaf, bloom, vSh.y);
  c = mix(c, vLit.rgb, vFx.z);                                                                     // distance melts into the haze
  c = shadeCap(c, vSh.z, SHADE_CEILING);                                                           // behind the copy: in shade
  gl_FragColor = vec4(c * alpha, alpha);
}
`;

/* ---- dust / pollen motes ---------------------------------------------------------------------- */
export const MOTE_VERT = COMMON + /* glsl */ `
attribute vec4 aSeed;    // xyz = home position inside the box (0..1), w = random
attribute vec4 aParam;   // x = rises per loop (whole number), y = wobble radius (world), z = size, w = sideways drifts per loop (whole number)
uniform vec3  uBoxMin, uBoxSize;
uniform float uFocus, uCocPx, uPxScale, uMotes;
uniform vec2  uNearFade;
varying float vA;
varying float vSoft;
void main(){
  float turn = uLoop / 600.0;                                   // 0..1 through the ambient loop
  vec3 p = aSeed.xyz;
  p.y = fract(p.y + turn * aParam.x);
  p.x = fract(p.x + turn * aParam.w + 0.02 * sin(uLoop * CYC(30.0) + aSeed.w * 6.283));
  float edge = smoothstep(0.0, 0.1, p.y) * smoothstep(1.0, 0.9, p.y) * smoothstep(0.0, 0.08, p.x) * smoothstep(1.0, 0.92, p.x);
  vec3 world = uBoxMin + p * uBoxSize;
  world.x += sin(uLoop * CYC(48.0) + aSeed.w * 17.0) * aParam.y;
  world.y += cos(uLoop * CYC(35.0) + aSeed.w * 9.0) * aParam.y * 0.6;
  vec4 mv = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = max(-mv.z, 0.1);
  float coc = abs(1.0 / dist - 1.0 / uFocus) * uCocPx;
  float sharp = aParam.z * uPxScale * (uFocus / dist);
  float size = sharp + coc * 0.55;
  gl_PointSize = clamp(size, 1.5, 96.0);
  vec2 sp = gl_Position.xy / gl_Position.w * 0.5 + 0.5;
  float lit = 0.3 + 1.9 * sunGlow(sp, 1.0) * (0.3 + 0.7 * shafts(sp));
  float tw = 0.6 + 0.4 * sin(uLoop * CYC(floor(96.0 + aSeed.w * 190.0)) + aSeed.w * 50.0);
  float keep = mix(1.0, smoothstep(0.92, 1.4, poolDist(sp)), uPool);              // no dust in front of the copy: a bright speck behind a letter is noise
  vec2 ne = abs(gl_Position.xy / gl_Position.w);                                  // a point sprite vanishes whole when its centre leaves the frame: fade it out first
  float inFrame = 1.0 - smoothstep(0.9, 1.0, max(ne.x, ne.y));
  vA = edge * lit * tw * keep * inFrame * uMotes * clamp(sharp * sharp / (size * size), 0.06, 1.0) * smoothstep(uNearFade.x, uNearFade.y, dist);
  vSoft = clamp(coc / size, 0.0, 1.0);
}
`;
export const MOTE_FRAG = /* glsl */ `
precision highp float;
uniform vec3 cMote;
varying float vA;
varying float vSoft;
void main(){
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float disc = smoothstep(1.0, mix(0.15, 0.78, vSoft), r);      // out-of-focus motes become flat bokeh discs
  gl_FragColor = vec4(cMote * disc * vA, 0.0);
}
`;

/* ---- the strings: papel picado on the near one, warm bulbs on the far one ------------------------
 * Each string hangs between two points with a sag; flags, bulbs and wire all use the same curve. */
const STRING_FN = /* glsl */ `
uniform vec4 uStrA[2];   // xyz = left end (world), w = sag (world)        [0] = papel picado, [1] = bulbs
uniform vec4 uStrB[2];   // xyz = right end, w = how far it swings
vec3 onString(float s, float which){
  vec4 A = which < 0.5 ? uStrA[0] : uStrA[1];
  vec4 B = which < 0.5 ? uStrB[0] : uStrB[1];
  float k = 4.0 * s * (1.0 - s);
  vec3 p = mix(A.xyz, B.xyz, s);
  p.y -= A.w * k * (1.0 + 0.03 * sin(uLoop * CYC(67.0) + which * 2.0));
  p.x += sin(uLoop * CYC(53.0) + which * 2.3) * B.w * k;
  return p;
}
`;

/* papel picado: each flag hangs from the string by its top edge, unrolls on a spring when its cue
 * comes, and lifts and ripples in the same wind as the leaves */
export const FLAG_VERT = COMMON + WIND + STRING_FN + /* glsl */ `
attribute vec4 aFlag;    // x = position along the string 0..1, y = which string, z = random seed, w = which design (0, 1, 2)
attribute vec3 aDye;     // its colour
uniform vec4  uFlag;     // x = width, y = height (world), z = width as a fraction of the string, w = time the first flag drops
uniform vec4  uPaperCell; // design cell in the paper texture: x = cell width, y = pad.x, z = pad.y (all 0..1 of the texture), w = number of designs
uniform float uFocus, uCocPx;
varying vec2 vUv;
varying vec3 vDye;
varying vec2 vFl;        // x = light, y = mip bias (a touch out of focus)
void main(){
  float v = -position.y;                                          // 0 at the string … 1 at the bottom edge
  vec3 top = onString(aFlag.x + position.x * uFlag.z, aFlag.y);
  vec4 c0 = projectionMatrix * viewMatrix * vec4(onString(aFlag.x, aFlag.y), 1.0);
  vec2 fp = c0.xy / c0.w;                                         // where the flag is in frame, -1..1
  // unrolls from the string, left to right, overshooting and settling
  float open = springStep(uTime - (uFlag.w + (fp.x * 0.5 + 0.5) * 1.5 + aFlag.z * 0.14), 10.0, 3.4);
  float w = windAt(fp, aFlag.z, uLoop - v * 0.16);
  float swing = w * 0.3 + 0.04 * sin(uLoop * CYC(97.0) + aFlag.z * 31.0) + (1.0 - min(open, 1.0)) * 0.4;
  float lift = clamp(abs(w) * 0.5, 0.0, 0.6);                     // blown toward the lens it looks shorter
  float len = uFlag.y * open * (1.0 - 0.2 * lift);
  vec3 p = top + vec3(sin(swing), -cos(swing), 0.0) * (v * len);
  p.x += sin(v * 5.0 + position.x * 3.0 + uLoop * CYC(286.0) + aFlag.z * 19.0) * 0.045 * uFlag.x * v * (0.35 + abs(w));   // ripple down the paper
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  vUv = vec2((aFlag.w + uPaperCell.y + (position.x + 0.5) * (1.0 - 2.0 * uPaperCell.y)) * uPaperCell.x,
             1.0 - (uPaperCell.z + v * (1.0 - 2.0 * uPaperCell.z)));
  vDye = aDye;
  vec2 sp = gl_Position.xy / gl_Position.w * 0.5 + 0.5;
  float dist = max(-mv.z, 0.1);
  vFl = vec2(clamp(sunGlow(sp, 0.9) * (0.75 + 0.5 * shafts(sp)), 0.0, 1.0) + 0.25 * lift,
             log2(1.0 + abs(1.0 / dist - 1.0 / uFocus) * uCocPx * 0.5));
}
`;
export const FLAG_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uPaper;
varying vec2 vUv;
varying vec3 vDye;
varying vec2 vFl;
void main(){
  vec4 tex = texture2D(uPaper, vUv, vFl.y);
  vec3 c = vDye * (tex.rgb / max(tex.a, 0.001));
  c *= mix(0.84, 1.16, vFl.x);                                    // tissue paper glows when the light is behind it
  float a = tex.a * 0.95;
  gl_FragColor = vec4(c * a, a);
}
`;

export const BULB_VERT = COMMON + STRING_FN + /* glsl */ `
attribute vec4 aBulb;    // x = position along the string 0..1, y = which string, z = random seed, w = radius of the lit core (px)
uniform float uFocus, uCocPx, uLightsOn, uLights;
uniform vec2  uBulb;     // x = device px per CSS px, y = the distance the sizes were worked out for
varying float vOn;
varying float vCore;
void main(){
  vec4 mv = viewMatrix * vec4(onString(aBulb.x, aBulb.y), 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = max(-mv.z, 0.1);
  float coc = abs(1.0 / dist - 1.0 / uFocus) * uCocPx;           // a touch out of focus: soft amber discs
  float core = aBulb.w * uBulb.x * (uBulb.y / dist) + coc * 0.3;
  float halo = core * 4.6;
  gl_PointSize = clamp(2.0 * halo, 2.0, 256.0);
  vCore = core / halo;
  // switch on left to right, each bulb flaring past full brightness and settling
  vec2 fp = gl_Position.xy / gl_Position.w;
  float on = springStep(uTime - (uLightsOn + (fp.x * 0.5 + 0.5) * 1.3 + aBulb.z * 0.2), 13.0, 4.5);
  float tw = 0.86 + 0.14 * sin(uLoop * CYC(floor(115.0 + aBulb.z * 172.0)) + aBulb.z * 40.0);
  tw *= 1.0 - 0.3 * smoothstep(0.97, 1.0, sin(uLoop * CYC(86.0) + aBulb.z * 90.0));          // the odd flicker
  vec2 ne = abs(fp);                                              // a point sprite vanishes whole when its centre leaves the frame: fade it out first
  vOn = on * tw * uLights * (0.7 + 0.3 * fract(aBulb.z * 7.31)) * (1.0 - smoothstep(0.93, 1.0, max(ne.x, ne.y)));
}
`;
export const BULB_FRAG = /* glsl */ `
precision highp float;
uniform vec3 cBulbCore, cBulbGlow;
varying float vOn;
varying float vCore;
void main(){
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float core = smoothstep(vCore * 1.25, vCore * 0.6, r);
  float halo = exp(-r * r * 4.0) * (1.0 - smoothstep(0.7, 1.0, r));
  gl_FragColor = vec4((cBulbCore * core + cBulbGlow * halo * 0.7) * vOn, 0.0);
}
`;
export const WIRE_VERT = COMMON + STRING_FN + /* glsl */ `
attribute vec3 aWire;    // x = position along the string, y = side (-1/+1), z = which string
uniform float uWirePx;
varying vec3 vSide;      // x = across the wire (-1..1), y = which string, z = position along it
void main(){
  vSide = vec3(aWire.y, aWire.z, aWire.x);
  vec4 a = projectionMatrix * viewMatrix * vec4(onString(aWire.x, aWire.z), 1.0);
  vec4 b = projectionMatrix * viewMatrix * vec4(onString(aWire.x + 0.01, aWire.z), 1.0);
  vec2 dir = normalize((b.xy / b.w - a.xy / a.w) * uRes);
  a.xy += vec2(-dir.y, dir.x) * aWire.y * uWirePx * (aWire.z < 0.5 ? 1.0 : 0.7) / uRes * 2.0 * a.w;
  gl_Position = a;
}
`;
export const WIRE_FRAG = /* glsl */ `
precision highp float;
uniform vec2 uWireA;      // how far along each string has been strung so far (0 = nothing yet, 1 = all of it): flags' string, bulbs' flex
varying vec3 vSide;
void main(){
  float front = vSide.y < 0.5 ? uWireA.x : uWireA.y;         // the string is thrown across from the left just ahead of what hangs on it
  float a = (vSide.y < 0.5 ? 0.62 : 0.45) * (1.0 - vSide.x * vSide.x) * (1.0 - smoothstep(front - 0.06, front, vSide.z));   // soft edges, so the thin line does not stair-step
  gl_FragColor = vec4(vec3(0.07, 0.08, 0.05) * a, a);
}
`;
