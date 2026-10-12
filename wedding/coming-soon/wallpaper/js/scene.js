/* scene.js — the WebGL scene (three.js): camera, layers of painted foliage, paper shadows, papel
 * picado. ("Wallpaper": a sheet of tropical wallpaper that turns out to be thick jungle; the camera
 * pushes in, the leaves get out of its way, and the last of them part in front of the names.)
 * The numbers of the shot are at the top: DEPTH and PASS_DIST (how far away each layer is), CAM (the
 * camera move and how long the first frame is held), LOOK (the print look, and LOOK.spring: how fast
 * and how springy a leaf swings).
 *
 * It draws exactly one picture for a given time `t`: render(t) is a pure function of t (plus the
 * optional pointer offset), which is what makes "?t=3.5" frames repeatable.
 *
 * THE CANVAS IS TRANSPARENT wherever there is no leaf. The page is layered, bottom to top:
 *   the ground (cream linen + the gold field: js/ground.js) → the HTML copy → THIS CANVAS (foliage)
 *   → the linen finish (js/finish.js) → the Replay control.
 * So the gold and the copy are simply there, behind the foliage, from the first frame on, and leaves
 * pass in FRONT of the letters. Nothing in here draws the ground, and nothing fades: the only way a
 * leaf leaves the picture is by moving out of it (THE PARTING, shaders.js).
 *
 * Draw order inside the canvas, back to front (no depth buffer; everything is painted over what is
 * behind it):
 *   back → mid → string + papel picado (shadow, then tissue) → focal (thicket, flowers, canopy)
 *   → near (corner and curtain leaves, then the hanging bananas)        … THE FRAME, the last curtain
 *   → the wallpaper that parts before the camera, far shell first                      … pass9 … pass0
 *   → [the rise of the first frame out of bare linen, only before t = 0]
 *
 * THE MASK (fill, not looks). The opening is the heaviest moment: ten shells of big leaves in front of
 * a whole frame of foliage that cannot be seen yet. So before any colour is drawn, each shell of the
 * wallpaper is drawn once into the stencil, nearest first, marking the pixels where its paint is
 * solid with the shell's number. Then nothing behind solid paint is shaded: a shell is drawn only
 * where no nearer shell is solid, and the frame only where no shell is. The picture is exactly the
 * one that painting everything back to front would give (to within a rounding step); only the work is
 * less. A shell stops being masked when its leaves have swung clear. Whether the mask pays depends on
 * the GPU (it saves fill and costs a few draw calls), so main.js times the heaviest frame both ways
 * at start-up and keeps whichever is faster on this device (`scene.mask`). The same timing decides how
 * many pixels the device is given for the push and how many for the resting picture (main.js: QUALITY).
 */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js';   // the one external library, version-pinned
import { buildAtlases, buildPaper, CARD_ROWS, PAPER } from './plants.js';
import { compose, SHELLS } from './compose.js';
import { GOLD } from './ground.js';
import * as GL from './shaders.js';
import { clamp, lerp, smoothstep, hexToVec } from './kit.js';

/* Distances along the camera's line of sight, in world units. The camera rests at z = 0 looking
 * down -z. These are the layers of the picture it settles on: THE FRAME. */
const DEPTH = { back: 23, mid: 15, focal: 10, near: 5.6 };
/* The wallpaper the shot opens on is itself SHELLS layers (WALL in compose.js: one entry here per entry
 * there), composed for the FIRST frame so that together they cover it edge to edge, and each of the
 * deeper ones covers the middle by itself: that is the thickness of the jungle. This is how far each
 * is from where the camera STARTS (it travels CAM.startZ in all). All of them stand beyond where the
 * camera comes to rest, one behind another: the camera never reaches a leaf, let alone passes through
 * one. Each leaf simply grows as the camera comes on (the nearer shells faster: that is the depth) and
 * has swung clear of the picture by the time it would be seen at about twice its printed size
 * (compose.js sees to that: SWING.mag). Nearer = it grows faster and must go sooner. */
const PASS_DIST = [9.5, 10.0, 10.5, 11.0, 11.6, 12.2, 12.8, 13.4, 14.0, 14.6];
/* The camera move: a straight line at the middle of the gold field. It holds for `hold` seconds (the
 * flat wallpaper: the beat on the painted sheet), then travels `startZ` on a soft start and a long
 * ease-out lasting TL.dolly: it is fastest about a second in, as the last of the wallpaper parts, and
 * slows all the way into the gold while the last curtain opens. `creep` is the share of the push that
 * is not over when the dolly lands but keeps easing in (time constant `creepTau`), so the shot never
 * comes to a dead stop; after that `drift` is the endless, almost imperceptible push. */
const CAM = { startZ: 9, startRoll: 0.018, wideStart: 0.05, hold: 0.26, creep: 0.05, creepTau: 2.6, drift: 0.24 };
const WIND = { back: 0.4, mid: 0.55, focal: 0.65, near: 0.75 };
const PASS = Array.from({ length: SHELLS }, (_, i) => 'pass' + i);
PASS.forEach((n, i) => { WIND[n] = 1.0 - 0.04 * i; });
const LEAF_LAYERS = ['back', 'mid', 'focal', 'near', ...[...PASS].reverse()];

/* THE PRINT LOOK. Nothing is lit and nothing fades; these numbers are all there is.
 * The sprites (plants.js) are already PAINTED: stroke-built gouache in muted colour at its final value.
 * So the shader leaves them almost alone:
 *   mute     how far the sprites' own colour is pulled further toward earthy olive (0 = exactly as painted;
 *            0.15 takes the painted greens the last step to the khaki-olive of the White Lotus titles)
 *   matte    lifted darks (1 = fully matte, 0 = as painted): keeps the deep forest greens from closing up
 *   flatten  0. (It gathers smooth shading into flat tones; on real brushwork it would eat the strokes.)
 *   ground   the cream linen (hueso, a touch warmer)                      } both live in js/ground.js (GOLD), which
 *   glow     the three golds of the field in the middle of the sheet      } paints them: the bottom layer of the page
 *   shadow   paper shadows: `flat` = their strength while the print is still flat (t = 0), `full` = once
 *            it has come apart into layers (well under 1: a shadow may darken what it falls on, never
 *            fill the slits of a monstera with brown), `reach` = how far they fall (fraction of a
 *            sprite's cell height) flat → apart, `ink` = the colour they multiply toward
 *   spring   the swing of THE PARTING, [frequency rad/s, damping]: `pass` = a leaf of the wallpaper pushed
 *            aside, `frame` = a leaf of the last curtain springing open (lower frequency = slower, lower
 *            damping = more overshoot). A leaf starts from rest, reaches the end of its swing after
 *            (π - atan(f / d)) / f seconds (0.49 s for `pass`, 0.53 s for `frame`), overshoots by
 *            e^(-d·π/f) (12% and 9%) and settles. Each plant runs it at its own tempo (compose.js).
 * Per layer:  faint  = how faint its ink is printed (farther = fainter, toward the ground). Fixed: it never changes.
 *                      (The wallpaper is printed at very nearly full strength all the way back: its last leaves
 *                      leave right in front of the full-strength frame and must not look washed beside it.)
 *             warm   = how much warmth the leaves beside the gold take from it (1 would be red +10%, blue -10%;
 *                      0.5 = +5% / -5% at most, right at the opening; colour only, and only a matter of where
 *                      on the page the leaf is, never of time)
 *             shadow = strength of its paper shadow (0 = none, and none is looked up: shells 4 to 7 of the wallpaper. The
 *                      opening picture keeps its shadows, and so do the last two shells, whose leaves leave in front of the
 *                      frame, the gold and the names) */
export const LOOK = {
  mute: 0.15, matte: 0.7, flatten: 0,
  ground: GOLD.ground,
  glow: GOLD,
  shadow: { flat: 0.2, full: 0.58, reach: [0.006, 0.0125], ink: '#3A3320' },
  spring: { pass: [4.4, 3.0], frame: [4.2, 3.2] },
  layer: {
    back:  { faint: 0.2, warm: 0.3, shadow: 0.7 },
    mid:   { faint: 0.08, warm: 0.4, shadow: 0.85 },
    focal: { faint: 0, warm: 0.5, shadow: 1 },
    near:  { faint: 0, warm: 0.5, shadow: 1 },
    pass:  [0, 0, 0.01, 0.015, 0.02, 0.025, 0.03, 0.03, 0.03, 0.03].map((faint, i) => ({ faint, warm: 0, shadow: i >= 4 && i <= 7 ? 0 : 1 })),   // nearest shell first (the four in the middle of the wall cast none: they are only ever seen against more dark leaves, where it does not show, and it is fill a phone can do without)
  },
};

const v3 = (hex) => ({ value: new THREE.Vector3(...hexToVec(hex)) });
const f = (value) => ({ value });
/* premultiplied 'over' blending, no depth buffer, both faces drawn (mirrored leaves face away from us) */
const BLEND = { transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
                blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
                blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor };

/** the dolly: a soft start out of the hold, then a long, long ease-out */
const dollyEase = (x) => 1 - Math.pow(1 - Math.pow(clamp(x), 1.6), 3.4);
const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);

export function createScene(canvas, TL, only = null, mask = true) {
  THREE.ColorManagement.enabled = false;                       // palette hex values are used as-is
  // alpha: the canvas is see-through wherever there is no leaf (premultiplied, which is what every shader here writes)
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, premultipliedAlpha: true, depth: false, stencil: true, powerPreference: 'high-performance' });   // (stencil: THE MASK, above)
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.sortObjects = false;                                // we add things in paint order
  renderer.setClearColor(0x000000, 0);                         // cleared to nothing: the ground and the copy are the layers under this one
  const gl = renderer.getContext();
  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200);

  /* ---- textures: every plant painted once (plants.js), plus a small pre-blurred copy (its shadow) ---- */
  // full size wherever the screen is dense enough to show it; 3/4 on small low-density screens, a third less memory
  const atlasScale = maxTex < 4096 ? 0.5 : Math.min(window.innerWidth, window.innerHeight) < 520 && (window.devicePixelRatio || 1) < 1.75 ? 0.75 : 1;
  const { canvases, blurs, sprites, outline } = buildAtlases(atlasScale);
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };
  const canvasTexture = (cv) => {
    const t = keep(new THREE.CanvasTexture(cv));
    t.premultiplyAlpha = true; t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    renderer.initTexture(t);                                   // upload now, not on the first frame
    return t;
  };
  const tex = {};
  for (const name of Object.keys(canvases)) {
    if (name !== 'foliage') { canvases[name].width = canvases[name].height = 0; continue; }   // (only the 'foliage' atlas is used: any other is never sent to the GPU)
    const sharp = canvasTexture(canvases[name]);
    const b = blurs[name];
    const soft = keep(new THREE.DataTexture(b.data, b.width, b.height, THREE.RGBAFormat, THREE.UnsignedByteType));
    soft.generateMipmaps = true; soft.minFilter = THREE.LinearMipmapLinearFilter; soft.magFilter = THREE.LinearFilter;
    soft.needsUpdate = true;
    renderer.initTexture(soft);
    tex[name] = { sharp, soft };
    canvases[name].width = canvases[name].height = 0;          // the GPU has it; free the 2D canvas memory
  }
  /** how solidly a drawing is painted at a point of its own cell (0..1 both ways, v up): 0 = nothing there … 1 = solid paint.
   *  (Read from the small soft copy of the atlas, so it is a little generous to gaps and a little mean at edges. compose.js
   *  uses it to see what the first sheet really covers.) */
  const softA = blurs.foliage;
  const paintAt = (id, cx, cy) => {
    const sp = sprites[id];
    const X = clamp(Math.floor((sp.uv[0] + cx * sp.uv[2]) * softA.width), 0, softA.width - 1), Y = clamp(Math.floor((sp.uv[1] + cy * sp.uv[3]) * softA.height), 0, softA.height - 1);
    return softA.data[(Y * softA.width + X) * 4 + 3] / 255;
  };
  // where each drawing sits inside its atlas cell, row by row: lets every leaf card hug its leaf
  const hull = keep(new THREE.DataTexture(outline.data, outline.width, outline.height, THREE.RGBAFormat, THREE.UnsignedByteType));
  hull.minFilter = hull.magFilter = THREE.NearestFilter; hull.generateMipmaps = false; hull.needsUpdate = true;
  renderer.initTexture(hull);
  const paperCanvas = buildPaper(atlasScale);
  const paper = canvasTexture(paperCanvas);
  paperCanvas.width = paperCanvas.height = 0;

  /* ---- uniforms shared by all programs ----------------------------------------------------------- */
  const U = {
    uTime: f(0), uLoop: f(0), uRes: f(new THREE.Vector2(1, 1)), uAspect: f(1),
    uSun: f(new THREE.Vector2(0.5, 0.58)), uGlow: f(new THREE.Vector2(0.4, 0.3)),
    cGround: v3(LOOK.ground), cShadow: v3(LOOK.shadow.ink),
    uPrint: f(new THREE.Vector3(LOOK.mute, LOOK.matte, LOOK.flatten)), uPaper: f(new THREE.Vector2(LOOK.shadow.flat, LOOK.shadow.reach[0])),
    uWindBase: f(1), uWindGust: f(1), uGate: f(1), uFade: f(1),
    uStrA: f(new THREE.Vector4()), uStrB: f(new THREE.Vector4()), uWirePx: f(1), uWireA: f(0),
    uHull: f(hull), uHullSize: f(new THREE.Vector2(outline.width, outline.height)),
    uTissue: f(paper), uFlag: f(new THREE.Vector4(1, 1, 0.05, TL.flags)),
    uPaperCell: f(new THREE.Vector4(1 / PAPER.count, PAPER.pad / PAPER.cell[0], PAPER.pad / PAPER.cell[1], PAPER.count)),
  };
  /* THE MASK: `behind(n)` = drawn only where no wallpaper shell nearer than number n is solid (n = SHELLS … 1 for
   * the shells, nearest first; 0 for everything behind them all); `mark(n)` = the stencil-only pass that writes n. */
  const KEEP3 = { stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilFuncMask: 0xff };
  const behind = (n) => ({ stencilWrite: true, stencilRef: n, stencilFunc: THREE.GreaterEqualStencilFunc, stencilZPass: THREE.KeepStencilOp, stencilWriteMask: 0, ...KEEP3 });
  const mark = (n) => ({ stencilWrite: true, stencilRef: n, stencilFunc: THREE.GreaterStencilFunc, stencilZPass: THREE.ReplaceStencilOp, stencilWriteMask: 0xff, ...KEEP3,
                         transparent: false, blending: THREE.NoBlending, colorWrite: false });
  const material = (vertexShader, fragmentShader, extra = {}, defines = {}, opts = behind(0)) =>
    keep(new THREE.ShaderMaterial({ uniforms: { ...U, ...extra }, defines, vertexShader, fragmentShader, ...BLEND, ...opts }));

  /* ---- geometry ------------------------------------------------------------------------------- */
  // a grid of quads, x across and y along: vertex positions + triangle indices
  const grid = (nx, ny, x0, x1, y0, y1) => {
    const pos = [], idx = [];
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) pos.push(lerp(x0, x1, i / nx), lerp(y0, y1, j / ny), 0);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
    return { pos, idx };
  };
  /* one bendable leaf card (x and y both 0..1) and, under it, a thin strip for the stem that runs on
   * below the root (position.z: 1 = its top, at the root; 2 = its far end). The strip is drawn first,
   * so the leaf's own base lies over the join. */
  const leafCard = (() => {
    const g = grid(2, CARD_ROWS, 0, 1, 0, 1), n = g.pos.length / 3;
    return { pos: new THREE.Float32BufferAttribute([...g.pos, 0, 0, 1, 1, 0, 1, 0, 0, 2, 1, 0, 2], 3),
             idx: new THREE.Uint16BufferAttribute([n, n + 1, n + 3, n, n + 3, n + 2, ...g.idx], 1) };
  })();
  const flagGrid = grid(4, 5, -0.5, 0.5, 0, -1);               // one paper flag: hangs down from y = 0
  const flagCard = { pos: new THREE.Float32BufferAttribute(flagGrid.pos, 3), idx: new THREE.Uint16BufferAttribute(flagGrid.idx, 1) };
  const screenTri = keep(new THREE.BufferGeometry());
  screenTri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const fullscreen = (frag) => { const m = new THREE.Mesh(screenTri, material(GL.SCREEN_VERT, frag, {}, {}, {})); m.frustumCulled = false; return m; };

  const ATTRS = ['iRoot', 'iQuad', 'iUV', 'iWind', 'iTint', 'iPose', 'iHead', 'iBloom', 'iMove', 'iGo'];
  const layers = {};
  for (const name of LEAF_LAYERS) {
    const pi = name.startsWith('pass') ? +name.slice(4) : -1;
    const k = pi >= 0 ? LOOK.layer.pass[pi] : LOOK.layer[name];
    const own = { uAtlas: f(tex.foliage.sharp), uBlur: f(tex.foliage.soft),
                  uLook: f(new THREE.Vector4(k.faint, k.warm, k.shadow, pi >= 0 ? 0 : 1)),
                  uSpring: f(new THREE.Vector2(...(pi >= 0 ? LOOK.spring.pass : LOOK.spring.frame))) };
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material(GL.LEAF_VERT, GL.LEAF_FRAG, own, {}, behind(pi >= 0 ? SHELLS - pi : 0)));
    mesh.frustumCulled = false;
    // a shell of the wallpaper is also drawn into the stencil alone (same cards, same motion), before any colour
    const mask = pi >= 0 ? new THREE.Mesh(mesh.geometry, material(GL.LEAF_VERT, GL.MASK_FRAG, own, {}, mark(SHELLS - pi))) : null;
    if (mask) mask.frustumCulled = false;
    layers[name] = { name, mesh, mask, capacity: 0, arrays: null };
  }
  function allocate(layer, capacity) {
    layer.mesh.geometry.dispose();
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', leafCard.pos.clone()); geo.setIndex(leafCard.idx.clone());   // own copies: safe to dispose later
    layer.arrays = {};
    for (const a of ATTRS) {
      layer.arrays[a] = new Float32Array(capacity * 4);
      geo.setAttribute(a, new THREE.InstancedBufferAttribute(layer.arrays[a], 4));
    }
    layer.mesh.geometry = geo; layer.capacity = capacity;
    if (layer.mask) layer.mask.geometry = geo;
  }

  const veilPass = fullscreen(GL.VEIL_FRAG);

  // the string, its papel picado (instanced cards, drawn twice: shadow, then tissue) and the twine (a thin ribbon); rebuilt in layout()
  const flagShadows = new THREE.Mesh(new THREE.BufferGeometry(), material(GL.FLAG_VERT, GL.FLAG_FRAG, {}, { SHADOW: 1 }));
  const flags = new THREE.Mesh(flagShadows.geometry, material(GL.FLAG_VERT, GL.FLAG_FRAG));
  const wire = new THREE.Mesh(new THREE.BufferGeometry(), material(GL.WIRE_VERT, GL.WIRE_FRAG));
  flags.frustumCulled = flagShadows.frustumCulled = wire.frustumCulled = false;

  // paint order. The papel picado hangs just behind the sharp plane: in front of the gold, the copy
  // and the far rings, its two ends running up behind the canopy and the side leaves (anchored, not floating).
  scene.add(...PASS.map((n) => layers[n].mask),              // THE MASK first, nearest shell first (these are the only opaque materials, so three.js draws them before the rest)
            layers.back.mesh, layers.mid.mesh, wire, flagShadows, flags, layers.focal.mesh, layers.near.mesh,
            ...[...PASS].reverse().map((n) => layers[n].mesh), veilPass);

  /* ---- the camera at time t (also used by the layout to know what the lens can see when) ------- */
  let frame = { W: 1, H: 1, S: 1, tanHalf: 0.5, aspect: 1, aimX: 0, aimY: 0 };
  /** The middle of the gold field is at (x, y) px in the resting frame: the camera travels the straight line that
   *  ends looking at it, so it is the vanishing point of the whole move and every layer slides away from it. */
  function aim(x, y) {
    frame.aimX = ((x / frame.W) * 2 - 1) * frame.tanHalf * frame.aspect;   // sideways / upward travel per unit of forward travel
    frame.aimY = (1 - (y / frame.H) * 2) * frame.tanHalf;
  }
  function cameraAt(t) {
    const m = Math.max(t - CAM.hold, 0);                       // seconds since the push began
    const q = (1 - CAM.creep) * (1 - dollyEase(m / TL.dolly)) + CAM.creep * Math.exp(-m / CAM.creepTau);   // 1 → 0: how far back it still is
    const z = CAM.startZ * q;
    return { q, x: -frame.aimX * z, y: -frame.aimY * z, z, roll: CAM.startRoll * Math.pow(q, 1.2), tanHalf: frame.tanHalf * (1 + CAM.wideStart * q) };
  }
  /** how much of the dolly is still to come at time t: 1 while the camera holds … exactly 0 from the moment it lands
   *  (the creep that follows is left out: main.js moves the page's own layers by this, and they must come to rest) */
  const still = (t) => 1 - dollyEase(Math.max(t - CAM.hold, 0) / TL.dolly);
  const shellDist = (i, z = 0) => PASS_DIST[i] * (1 - 0.05 * z);            // (z: a leaf's own small offset inside its shell)
  /** How many times its printed (first-frame) size a leaf of shell i is seen at time t: everything on that
   *  shell has slid that much further from the middle of the gold. Infinity once the camera is past it. */
  function shellMag(i, t, z = 0) {
    const c = cameraAt(t), d = shellDist(i, z), left = d - (CAM.startZ - c.z);
    return left <= 0.02 ? Infinity : (d / left) * ((1 + CAM.wideStart) / (1 + CAM.wideStart * c.q));
  }
  /** the moment a leaf of shell i is first seen at `mag` times its printed size */
  function shellWhen(i, mag) {
    for (let t = 0; t < CAM.hold + TL.dolly + 4; t += 0.01) if (shellMag(i, t) >= mag) return t;
    return Infinity;
  }
  /** How big a ring of the frame is seen at time t, against how it will rest (1): the camera is still that
   *  far back. Everything on the ring is that much nearer the middle of the gold than where it will rest. */
  function ringScale(layer, t) {
    const c = cameraAt(t);
    return DEPTH[layer] / (DEPTH[layer] + c.z) / (1 + CAM.wideStart * c.q);
  }

  /** the last moment of the camera move at which a point of the resting frame (px) on a ring is still in shot */
  function hiddenAfter(x, y, layer) {
    const D = DEPTH[layer], k = (2 * D * frame.tanHalf) / frame.H;
    const X = (x - frame.W / 2) * k, Y = (frame.H / 2 - y) * k;
    for (let t = CAM.hold + TL.dolly; t > 0; t -= 0.05) {
      const c = cameraAt(t), dx = X - c.x, dy = Y - c.y, cr = Math.cos(c.roll), sr = Math.sin(c.roll);
      const vx = dx * cr + dy * sr, vy = -dx * sr + dy * cr, h = (D + c.z) * c.tanHalf;
      if (Math.abs(vx) < h * frame.aspect * 1.03 && Math.abs(vy) < h * 1.03) return t + 0.05;
    }
    return 0;
  }

  /* ---- layout: turn the composition (screen px at rest) into instances in the world ------------- */
  let stats = {};
  let gone = [];                                              // per shell: the moment nothing of it can be in the picture any more
  let emptied = [];                                           // per shell: the moment its last leaf has swung clear (it is not worth masking after that)

  function fill(layer, list, toWorld) {
    if (!layer.arrays || list.length > layer.capacity) allocate(layer, Math.ceil(list.length * 1.25) + 8);
    const items = list.map((pl) => ({ pl, w: toWorld(pl) })).sort((a, b) => a.w.z - b.w.z);     // far first
    const A = layer.arrays;
    items.forEach(({ pl, w }, i) => {
      const sp = sprites[pl.id], o = i * 4, k = w.k;
      const quadH = (pl.len / sp.len) * k;
      A.iRoot.set([w.x, w.y, w.z, (pl.plantLen || pl.len) * k], o);
      A.iQuad.set([quadH * sp.aspect, quadH, sp.pivot[0], sp.pivot[1]], o);
      A.iUV.set(sp.uv, o);
      A.iWind.set([pl.wind * WIND[layer.name], pl.seed, (pl.x / frame.W) * 2 - 1, 1 - (pl.y / frame.H) * 2], o);
      A.iTint.set([pl.tint[0], pl.tint[1], pl.tint[2], (pl.stem || 0) * k], o);
      A.iPose.set([pl.a, pl.flip, pl.part ? pl.part[0] : 0, pl.part ? pl.part[1] : -1000], o);
      A.iHead.set([pl.head ? pl.head[0] * k : 0, pl.head ? pl.head[1] * k : 0, pl.lag, sp.index], o);
      A.iBloom.set(pl.bloom || [0, 0, -1000, 1], o);
      A.iMove.set([pl.tipLag ?? 0.15, pl.ant ?? 0, pl.stemA ?? pl.a, pl.flower ? 1 : 0], o);
      A.iGo.set([pl.tempo ?? 1, 0, 0, 0], o);
    });
    const geo = layer.mesh.geometry;
    for (const a of ATTRS) geo.attributes[a].needsUpdate = true;
    geo.instanceCount = list.length;
  }

  /**
   * @param fr { W, H (CSS px), safe: {l,t,r,b} rectangle round all of the copy, lines: [{l,t,r,b}…] one per line of it, tight: the same hugging the words,
   *             replay: {l,t,r,b} rectangle of the Replay control or null }
   * @returns { glow: { x, y, rx, ry } } where the gold field is (px): main.js paints the ground from it
   */
  function layout(fr) {
    const { W, H } = fr, S = Math.sqrt(W * H), aspect = W / H;
    // field of view: about the same picture area on a tall phone and a wide desktop
    const tanHalf = clamp(0.42 / Math.sqrt(aspect), 0.27, 0.66);
    frame = { W, H, S, tanHalf, aspect, aimX: 0, aimY: 0 };
    const comp = compose({ W, H, S, safe: fr.safe, lines: fr.lines, tight: fr.tight, replay: fr.replay }, sprites, TL,
                         { aim, shellMag, shellWhen, ringScale, hiddenAfter, paintAt, landed: CAM.hold + TL.dolly });
    const px2world = (pl, depth, zWorld, cam) => {            // cam: the camera the placement was composed for (the resting one unless given)
      const k = (2 * depth * (cam ? cam.tanHalf : tanHalf)) / H;   // world units per CSS px at that depth
      return { x: (cam ? cam.x : 0) + (pl.x - W / 2) * k, y: (cam ? cam.y : 0) + (H / 2 - pl.y) * k, z: zWorld, k };
    };
    const cam0 = cameraAt(0);                                 // where the camera starts: the wallpaper is composed for this frame
    stats = {};
    for (const name of LEAF_LAYERS) {
      const list = comp.layers[name];
      stats[name] = list.length;
      const pi = name.startsWith('pass') ? +name.slice(4) : -1;
      fill(layers[name], list, (pl) => {
        if (pi >= 0) { const d = shellDist(pi, pl.z); return px2world(pl, d, cam0.z - d, cam0); }
        const d = DEPTH[name] * (1 - 0.035 * pl.z);
        return px2world(pl, d, -d);
      });
    }
    // a shell is not asked of the GPU once every leaf of it has swung clear and settled out of the picture
    gone = PASS.map((n) => comp.layers[n].reduce((m, pl) => Math.max(m, (pl.part ? pl.part[1] : 0) + 2.4), 0));
    emptied = gone.map((g) => g - 1.3);
    U.uSun.value.set(comp.glow.x / W, 1 - comp.glow.y / H);
    U.uGlow.value.set(comp.glow.rx / W, comp.glow.ry / H);

    // the string that carries the papel picado
    const s = comp.string, k = (2 * s.depth * tanHalf) / H;
    U.uStrA.value.set((s.ax - W / 2) * k, (H / 2 - s.ay) * k, -s.depth, s.sag * k);
    U.uStrB.value.set((s.bx - W / 2) * k, (H / 2 - s.by) * k, -s.depth, 0.006 * S * k);
    const seg = 40, wirePos = [], wireIdx = [];
    for (let j = 0; j <= seg; j++) wirePos.push(j / seg, -1, 0, j / seg, 1, 0);
    for (let j = 0; j < seg; j++) { const a = j * 2; wireIdx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(wirePos.length), 3));
    wg.setAttribute('aWire', new THREE.Float32BufferAttribute(wirePos, 3));
    wg.setIndex(wireIdx);
    wire.geometry.dispose();
    wire.geometry = wg;

    U.uFlag.value.set(comp.flags.w * k, comp.flags.h * k, comp.flags.w / (s.bx - s.ax), TL.flags);
    const fg = new THREE.InstancedBufferGeometry();
    fg.setAttribute('position', flagCard.pos.clone()); fg.setIndex(flagCard.idx.clone());
    fg.setAttribute('aFlag', new THREE.InstancedBufferAttribute(new Float32Array(comp.flags.list.flatMap((fl) => [fl.s, 0, fl.seed, fl.design])), 4));
    fg.setAttribute('aDye', new THREE.InstancedBufferAttribute(new Float32Array(comp.flags.list.flatMap((fl) => fl.dye)), 3));
    fg.instanceCount = comp.flags.list.length;
    flags.geometry.dispose();
    flags.geometry = flagShadows.geometry = fg;

    stats.flags = comp.flags.list.length;
    stats.hang = comp.hangSpots;                             // where the banana bunches and blossoms ended up (px)
    stats.curtain = comp.curtain;                            // how the last curtain was closed (see compose.js)
    stats.wall = PASS.reduce((a, n) => a + stats[n], 0);     // leaves in the wallpaper that parts before the camera
    stats.shellGone = PASS.map((n, i) => { for (let t = 0; t < gone[i]; t += 0.005) if (PASS_DIST[i] * 0.97 - (CAM.startZ - cameraAt(t).z) <= 0.08) return +t.toFixed(3); return +gone[i].toFixed(3); });   // when each shell stops being drawn (it has been empty for a while by then)
    stats.total = LEAF_LAYERS.reduce((a, n) => a + stats[n], 0);
    return { glow: comp.glow };
  }

  /** resize the drawing buffer (cheap; called immediately on resize, layout() follows) */
  function resize(W, H, dpr) {
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    const bw = renderer.domElement.width, bh = renderer.domElement.height;
    U.uRes.value.set(bw, bh);
    U.uAspect.value = bw / bh;
    U.uWirePx.value = 1.15 * dpr;
    camera.aspect = W / H;
  }

  /**
   * Draw the frame for time t.
   * @param px,py  pointer / tilt offset, -1..1 (0 in frozen and reduced-motion modes)
   */
  function render(t, px = 0, py = 0) {
    const c = cameraAt(t);
    const settle = smoothstep(1.6, 6.5, t);                    // the ambient drift fades up as the dolly lands
    camera.position.set(
      c.x + settle * (0.07 * Math.sin(t * 0.21 + 0.6) + 0.025 * Math.sin(t * 0.53)) + px * 0.3,
      c.y + settle * (0.045 * Math.sin(t * 0.17 + 2.1) + 0.015 * Math.sin(t * 0.47 + 1.0)) + py * 0.18,
      c.z - settle * CAM.drift * Math.sin((t - 3) * 0.045));   // the push never quite ends: it goes on, almost imperceptibly, for half a minute, then as slowly eases back
    camera.rotation.set(settle * 0.002 * Math.sin(t * 0.13 + 1.0) - py * 0.005, settle * 0.0025 * Math.sin(t * 0.11) + px * 0.007,
                        c.roll + settle * 0.002 * Math.sin(t * 0.09 + 2.0));
    camera.fov = (2 * Math.atan(c.tanHalf) * 180) / Math.PI;   // a touch wider at the start
    camera.updateProjectionMatrix();

    // the two clocks (see shaders.js): cues, and the wrapped loop for everything that repeats
    U.uTime.value = Math.min(t, 120);
    U.uLoop.value = ((t % GL.LOOP) + GL.LOOP) % GL.LOOP;
    // t < 0 is the rise out of the bare ground; at t = 0 the wallpaper is fully there
    U.uFade.value = 1 - smoothstep(-TL.fadeIn, 0, t);
    veilPass.visible = U.uFade.value > 0.001;
    // PAPER SHADOWS: faint while the print is flat, full once the push has shown it to be layers
    const apart = smoothstep(CAM.hold, CAM.hold + 0.75, t);
    U.uPaper.value.set(lerp(LOOK.shadow.flat, LOOK.shadow.full, apart), lerp(LOOK.shadow.reach[0], LOOK.shadow.reach[1], apart));
    U.uWireA.value = 1.1 * easeOut((t - (TL.flags - 0.5)) / 1.5);   // the string is thrown across just ahead of its flags
    // the air: the leaves stir a little as we push through them, then barely at all
    const push = smoothstep(CAM.hold, CAM.hold + 0.4, t) * (1 - smoothstep(1.5, 3.4, t));
    U.uWindGust.value = 0.34 + 0.7 * push;
    U.uWindBase.value = 0.44;
    U.uGate.value = 1 - smoothstep(4.0, 9.0, t);

    // do not ask the GPU for what cannot be in the picture: a shell the camera has come right up to (none is, as PASS_DIST stands), or one whose
    // leaves have all long since swung clear (every one of them is outside the frame well before either)
    const travelled = CAM.startZ - camera.position.z;
    PASS.forEach((n, i) => { layers[n].mesh.visible = PASS_DIST[i] * 0.97 - travelled > 0.08 && t < gone[i]; });
    if (only) for (const n of LEAF_LAYERS) layers[n].mesh.visible = layers[n].mesh.visible && only.includes(n);   // ?only=pass3,near : look at some layers by themselves
    PASS.forEach((n, i) => { layers[n].mask.visible = mask && layers[n].mesh.visible && t < emptied[i]; });
    flags.visible = flagShadows.visible = t > TL.flags - 0.05 && !only;
    wire.visible = t > TL.flags - 0.5 && !only;
    renderer.render(scene, camera);
  }

  /** how long the GPU takes over the heaviest frame of the piece, in ms (best of a few; blocks until done).
   *  `withMask`: time it with THE MASK on or off (it is left the way it was). */
  function bench(t = 0.3, n = 3, withMask = mask) {
    const px = new Uint8Array(4), was = mask;
    let best = Infinity;
    mask = withMask;
    for (let i = 0; i <= n; i++) {
      const t0 = performance.now();
      render(t);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);   // forces the GPU to finish before we read the clock
      if (i > 0) best = Math.min(best, performance.now() - t0);  // the first run pays for shader compilation
    }
    mask = was;
    return best;
  }

  /** build every program now. (The string and its flags are not drawn until three seconds in: left to
   *  themselves their shaders would be compiled then, in the middle of the shot, and cost a frame.) */
  function warm() {
    try { renderer.compile(scene, camera); } catch (err) { /* then they are built on first use, as before */ }
  }

  return {
    render, resize, layout, bench, warm, still, sprites,
    get stats() { return stats; },
    get mask() { return mask; },
    set mask(on) { mask = !!on; },
    dispose() {
      for (const l of Object.values(layers)) l.mesh.geometry.dispose();   // (a shell's mask shares its geometry)
      for (const o of [flags, wire]) o.geometry.dispose();
      for (const d of disposables) d.dispose();
      renderer.dispose();
    },
  };
}
