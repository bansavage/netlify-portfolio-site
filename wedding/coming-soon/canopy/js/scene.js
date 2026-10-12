/* scene.js — the WebGL scene (three.js): camera, depth layers, light, dust, papel picado, bulbs.
 *
 * It draws exactly one picture for a given time `t`: render(t) is a pure function of t (plus the
 * optional pointer offset), which is what makes "?t=3.5" frames repeatable.
 *
 * Draw order, back to front (no depth buffer; everything is painted over what is behind it):
 *   backdrop → far palms → jungle wall ×2 → bed of leaves behind the names
 *   → [sun shafts, golden mist, shade behind the copy] → mid → focal → bulbs → string + papel picado
 *   → near → the pass-through jungle → dust → [lens: grain, vignette]
 */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js';   // the one external library, version-pinned
import { buildAtlases, buildPaper, BLUR_DIV, CARD_ROWS, PAPER } from './plants.js';
import { compose } from './compose.js';
import * as GL from './shaders.js';
import { rng, clamp, lerp, smoothstep, hexToVec, GREEN } from './kit.js';

/* Distances along the camera's line of sight, in world units. The camera rests at z = 0 looking
 * down -z; the lens is focused 10 units ahead, so the "focal" layer is the sharp one. */
const DEPTH = { far: 42, wall2: 30, wall1: 22, bed: 17, mid: 15, focal: 10, near: 5.6 };
const PASS_DIST = [2.3, 4.6, 7.0, 9.2, 10.9, 12.2];   // pass-through shells: distance from where the camera STARTS
/* The camera move. It starts `startZ` back and to one side, rolled a touch; `creep` is the share of
 * the push that is not over when the dolly lands but keeps easing in for a few more seconds
 * (time constant `creepTau`), so the shot never comes to a dead stop before the ambient drift. */
const CAM = { startZ: 13.5, startX: -0.7, startY: -0.45, startRoll: 0.05, focus: 10, wideStart: 0.14, creep: 0.04, creepTau: 2.4 };
const WIND = { far: 0.5, wall2: 0.5, wall1: 0.65, bed: 0.55, mid: 0.85, focal: 1, near: 1.25, pass0: 1.7, pass1: 1.6, pass2: 1.4, pass3: 1.3, pass4: 1.2, pass5: 1.2 };
const LEAF_LAYERS = ['far', 'wall2', 'wall1', 'bed', 'mid', 'focal', 'near', 'pass5', 'pass4', 'pass3', 'pass2', 'pass1', 'pass0'];
/* the layer nearest the resting camera would read as leaves floating in mid-air from far back,
 * so it only fades in once the camera is within this distance of it: [fully visible, invisible] */
const FAR_FADE = { near: [8, 11] };
/* per layer: [blur multiplier, haze multiplier, cap on blur, 1 = stands behind the copy (so it is
 * held in shade there)]. The palms stay crisp enough to read as trees; the nearest leaves are soft,
 * but never so soft that they stop being leaves. */
const LOOK = { far: [0.2, 0.36, 1, 1], wall2: [1, 1, 1, 1], wall1: [1, 1, 1, 1], bed: [0.8, 0.5, 1, 1], near: [0.42, 1, 1, 0] };

const v3 = (hex) => ({ value: new THREE.Vector3(...hexToVec(hex)) });
const f = (value) => ({ value });
/* premultiplied 'over' blending, no depth buffer, both faces drawn (mirrored leaves face away from us) */
const BLEND = { transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
                blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
                blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor };

/** the dolly: fast through the leaves, then a long, long ease-out into the clearing */
const dollyEase = (x) => 1 - Math.pow(1 - Math.pow(clamp(x), 1.2), 3.4);
const bump = (x) => (x <= 0 ? 0 : smoothstep(0, 0.22, x) * (1 - smoothstep(0.22, 1, x)));
const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);

export function createScene(canvas, TL) {
  THREE.ColorManagement.enabled = false;                       // palette hex values are used as-is
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.sortObjects = false;                                // we add things in paint order
  renderer.setClearColor(new THREE.Color(...hexToVec(GREEN[0])), 1);
  const gl = renderer.getContext();
  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200);

  /* ---- textures: every plant drawn once (plants.js), plus a small pre-blurred copy -------------- */
  // full size on big screens; 3/4 on phones (still at least one texel per pixel there, a third less memory)
  const atlasScale = maxTex < 4096 ? 0.5 : Math.min(window.innerWidth, window.innerHeight) < 520 ? 0.75 : 1;
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
    const sharp = canvasTexture(canvases[name]);
    const b = blurs[name];
    const soft = keep(new THREE.DataTexture(b.data, b.width, b.height, THREE.RGBAFormat, THREE.UnsignedByteType));
    soft.generateMipmaps = true; soft.minFilter = THREE.LinearMipmapLinearFilter; soft.magFilter = THREE.LinearFilter;
    soft.needsUpdate = true;
    renderer.initTexture(soft);
    tex[name] = { sharp, soft, size: new THREE.Vector2(canvases[name].width, canvases[name].height) };
    canvases[name].width = canvases[name].height = 0;          // the GPU has it; free the 2D canvas memory
  }
  // where each drawing sits inside its atlas cell, row by row: lets every leaf card hug its leaf
  const hull = keep(new THREE.DataTexture(outline.data, outline.width, outline.height, THREE.RGBAFormat, THREE.UnsignedByteType));
  hull.minFilter = hull.magFilter = THREE.NearestFilter; hull.generateMipmaps = false; hull.needsUpdate = true;
  renderer.initTexture(hull);
  const paperCanvas = buildPaper(atlasScale);
  const paper = canvasTexture(paperCanvas);
  paperCanvas.width = paperCanvas.height = 0;

  /* ---- uniforms shared by all programs ----------------------------------------------------------- */
  const U = {
    uTime: f(0), uLoop: f(0), uFrame: f(0), uRes: f(new THREE.Vector2(1, 1)), uAspect: f(1), uSun: f(new THREE.Vector2(-0.04, 1.06)), uSkyLine: f(0.8),
    uPortal: f(1), uGold: f(0), uRayT: f(0), uPoolRect: f(new THREE.Vector4(0.5, 0.5, 0.3, 0.3)), uPool: f(0),
    cDeep: v3(GREEN[0]), cMid: v3(GREEN[2]), cHazeGreen: v3('#C7A546'), cHaze: v3('#F6B24A'), cSkyFar: v3('#EE9038'), cSun: v3('#FFBE66'),
    uFocus: f(CAM.focus), uCocPx: f(100), uCocMax: f(100), uBackBlur: f(0.55), uNearFade: f(new THREE.Vector2(0.7, 2.0)),
    uWindBase: f(1), uWindGust: f(1), uGate: f(1), uFogStart: f(12), uFogDensity: f(0.024), uExposure: f(1),
    uRays: f(0), cPool: v3('#133824'), uFade: f(1), uGrain: f(0.035), uFrontRays: f(0),
    uBoxMin: f(new THREE.Vector3()), uBoxSize: f(new THREE.Vector3(1, 1, 1)), uPxScale: f(6), uMotes: f(0), cMote: v3('#FFE2A0'),
    uStrA: f([new THREE.Vector4(), new THREE.Vector4()]), uStrB: f([new THREE.Vector4(), new THREE.Vector4()]),
    uLightsOn: f(TL.lights), uLights: f(1), cBulbCore: v3('#FFE0A0'), cBulbGlow: v3('#F2A33C'), uWirePx: f(1), uWireA: f(new THREE.Vector2(0, 0)), uBulb: f(new THREE.Vector2(1, 9.2)),
    uHull: f(hull), uHullSize: f(new THREE.Vector2(outline.width, outline.height)),
    uPaper: f(paper), uFlag: f(new THREE.Vector4(1, 1, 0.05, TL.flags)),
    uPaperCell: f(new THREE.Vector4(1 / PAPER.count, PAPER.pad / PAPER.cell[0], PAPER.pad / PAPER.cell[1], PAPER.count)),
  };
  const material = (vertexShader, fragmentShader, extra = {}) =>
    keep(new THREE.ShaderMaterial({ uniforms: { ...U, ...extra }, vertexShader, fragmentShader, ...BLEND }));

  /* ---- geometry ------------------------------------------------------------------------------- */
  // a grid of quads, x across and y along: vertex positions + triangle indices
  const grid = (nx, ny, x0, x1, y0, y1) => {
    const pos = [], idx = [];
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) pos.push(lerp(x0, x1, i / nx), lerp(y0, y1, j / ny), 0);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
    return { pos: new THREE.Float32BufferAttribute(pos, 3), idx: new THREE.Uint16BufferAttribute(idx, 1) };
  };
  const card = grid(2, CARD_ROWS, 0, 1, 0, 1);                 // one bendable leaf card: x and y both 0..1
  const flagCard = grid(4, 5, -0.5, 0.5, 0, -1);               // one paper flag: hangs down from y = 0
  const screenTri = keep(new THREE.BufferGeometry());
  screenTri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const fullscreen = (frag) => { const m = new THREE.Mesh(screenTri, material(GL.SCREEN_VERT, frag)); m.frustumCulled = false; return m; };

  const ATTRS = ['iRoot', 'iQuad', 'iUV', 'iWind', 'iTint', 'iPose', 'iHead', 'iBloom', 'iGrow'];
  const layers = {};
  for (const name of LEAF_LAYERS) {
    const atlas = name === 'far' ? 'trees' : 'foliage';
    const mat = material(GL.LEAF_VERT, GL.LEAF_FRAG, { uAtlas: f(tex[atlas].sharp), uBlur: f(tex[atlas].soft), uAtlasSize: f(tex[atlas].size), uBlurDiv: f(BLUR_DIV),
                         uFarFade: f(new THREE.Vector2(...(FAR_FADE[name] || [1e4, 1e5]))), uLayer: f(new THREE.Vector4(...(LOOK[name] || [1, 1, 1, 0]))) });
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    mesh.frustumCulled = false;
    layers[name] = { name, mesh, capacity: 0, arrays: null };
  }
  function allocate(layer, capacity) {
    layer.mesh.geometry.dispose();
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', card.pos.clone()); geo.setIndex(card.idx.clone());   // own copies: safe to dispose later
    layer.arrays = {};
    for (const a of ATTRS) {
      layer.arrays[a] = new Float32Array(capacity * 4);
      geo.setAttribute(a, new THREE.InstancedBufferAttribute(layer.arrays[a], 4));
    }
    layer.mesh.geometry = geo; layer.capacity = capacity;
  }

  const backdrop = fullscreen(GL.BACKDROP_FRAG);
  const atmos = fullscreen(GL.ATMOS_FRAG);
  const lens = fullscreen(GL.LENS_FRAG);

  // dust motes: fixed set of seeded points, all their motion happens in the vertex shader
  const MOTES = Math.min(window.innerWidth, window.innerHeight) < 520 ? 90 : 150;
  const motes = (() => {
    const R = rng(4242), seed = [], param = [];
    for (let i = 0; i < MOTES; i++) {
      seed.push(R.f(), R.f(), R.f(), R.f());
      param.push(R.int(4, 12), R.range(0.05, 0.3), R.range(0.3, 0.85), R.int(1, 5));   // whole rises / drifts per loop: no seam
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(MOTES * 3), 3));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 4));
    g.setAttribute('aParam', new THREE.Float32BufferAttribute(param, 4));
    const p = new THREE.Points(g, material(GL.MOTE_VERT, GL.MOTE_FRAG));
    p.frustumCulled = false;
    return p;
  })();

  // the two strings: paper flags (instanced cards), bulbs (points) and wire (thin ribbon); rebuilt in layout()
  const flags = new THREE.Mesh(new THREE.BufferGeometry(), material(GL.FLAG_VERT, GL.FLAG_FRAG));
  const bulbs = new THREE.Points(new THREE.BufferGeometry(), material(GL.BULB_VERT, GL.BULB_FRAG));
  const wires = [0, 1].map(() => new THREE.Mesh(new THREE.BufferGeometry(), material(GL.WIRE_VERT, GL.WIRE_FRAG)));   // [0] the flags' string, [1] the bulbs' flex
  flags.frustumCulled = bulbs.frustumCulled = wires[0].frustumCulled = wires[1].frustumCulled = false;

  // paint order
  scene.add(backdrop, layers.far.mesh, layers.wall2.mesh, layers.wall1.mesh, layers.bed.mesh, atmos, layers.mid.mesh, layers.focal.mesh,
            wires[1], bulbs, wires[0], flags, layers.near.mesh,
            layers.pass5.mesh, layers.pass4.mesh, layers.pass3.mesh, layers.pass2.mesh, layers.pass1.mesh, layers.pass0.mesh, motes, lens);

  /* ---- the camera at time t (also used by the layout to know what the lens can see when) ------- */
  let frame = { W: 1, H: 1, S: 1, tanHalf: 0.5, aspect: 1 };
  function cameraAt(t) {
    const q = (1 - CAM.creep) * (1 - dollyEase(t / TL.dolly)) + CAM.creep * Math.exp(-Math.max(t, 0) / CAM.creepTau);   // 1 → 0: how far back it still is
    return { q, x: CAM.startX * Math.pow(q, 1.4), y: CAM.startY * Math.pow(q, 1.4), z: CAM.startZ * q,
             roll: CAM.startRoll * Math.pow(q, 1.2), tanHalf: frame.tanHalf * (1 + CAM.wideStart * q) };
  }
  /** the last moment of the camera move at which a point of the resting frame (px) on a layer is still in shot */
  function hiddenAfter(x, y, layer) {
    const D = DEPTH[layer], k = (2 * D * frame.tanHalf) / frame.H;
    const X = (x - frame.W / 2) * k, Y = (frame.H / 2 - y) * k;
    for (let t = TL.dolly; t > 0; t -= 0.05) {
      const c = cameraAt(t), dx = X - c.x, dy = Y - c.y, cr = Math.cos(c.roll), sr = Math.sin(c.roll);
      const vx = dx * cr + dy * sr, vy = -dx * sr + dy * cr, h = (D + c.z) * c.tanHalf;
      if (Math.abs(vx) < h * frame.aspect * 1.04 && Math.abs(vy) < h * 1.04) return t + 0.05;
    }
    return 0;
  }

  /* ---- layout: turn the composition (screen px at rest) into instances in the world ------------- */
  let stats = {};

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
      A.iTint.set([pl.tint[0], pl.tint[1], pl.tint[2], pl.sun], o);
      A.iPose.set([pl.a, pl.flip, pl.part ? pl.part[0] : 0, pl.part ? pl.part[1] : -1000], o);
      A.iHead.set([pl.head ? pl.head[0] * k : 0, pl.head ? pl.head[1] * k : 0, pl.lag, sp.index], o);
      A.iBloom.set(pl.bloom || [0, 0, -1000, 1], o);
      A.iGrow.set(pl.grow ? [pl.grow[0], pl.grow[1], pl.grow[2], pl.flower ? 1 : 0] : [-1000, 1, 0, pl.flower ? 1 : 0], o);
    });
    const geo = layer.mesh.geometry;
    for (const a of ATTRS) geo.attributes[a].needsUpdate = true;
    geo.instanceCount = list.length;
  }

  /**
   * @param fr { W, H (CSS px), safe: {l,t,r,b} rectangle of the copy, pool: {cx,cy,rx,ry} shade behind it,
   *             replay: {l,t,r,b} rectangle of the Replay control or null }
   */
  function layout(fr) {
    const { W, H } = fr, S = Math.sqrt(W * H), aspect = W / H;
    // field of view: about the same picture area on a tall phone and a wide desktop
    const tanHalf = clamp(0.42 / Math.sqrt(aspect), 0.27, 0.66);
    frame = { W, H, S, tanHalf, aspect };
    const comp = compose({ W, H, S, safe: fr.safe, replay: fr.replay }, sprites, TL, { hiddenAfter });
    const px2world = (pl, depth, zWorld) => {
      const k = (2 * depth * tanHalf) / H;                    // world units per CSS px at that depth
      return { x: (pl.x - W / 2) * k, y: (H / 2 - pl.y) * k, z: zWorld, k };
    };
    stats = {};
    for (const name of LEAF_LAYERS) {
      const list = comp.layers[name];
      stats[name] = list.length;
      const pi = name.startsWith('pass') ? +name.slice(4) : -1;
      fill(layers[name], list, (pl) => {
        if (pi >= 0) { const d = PASS_DIST[pi] * (1 - 0.06 * pl.z); return px2world(pl, d, CAM.startZ - d); }
        const d = DEPTH[name] * (1 - 0.035 * pl.z);
        return px2world(pl, d, -d);
      });
    }
    U.uSkyLine.value = 1 - comp.skyY / H;
    U.uPoolRect.value.set(fr.pool.cx / W, 1 - fr.pool.cy / H, fr.pool.rx / W, fr.pool.ry / H);

    // the strings: [0] carries the papel picado, [1] the bulbs
    flags.geometry.dispose(); bulbs.geometry.dispose();
    comp.strings.forEach((s, i) => {
      const k = (2 * s.depth * tanHalf) / H;
      U.uStrA.value[i].set((s.ax - W / 2) * k, (H / 2 - s.ay) * k, -s.depth, s.sag * k);
      U.uStrB.value[i].set((s.bx - W / 2) * k, (H / 2 - s.by) * k, -s.depth, 0.012 * S * k);
      const seg = 40, wirePos = [], wireIdx = [];
      for (let j = 0; j <= seg; j++) wirePos.push(j / seg, -1, i, j / seg, 1, i);
      for (let j = 0; j < seg; j++) { const a = j * 2; wireIdx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
      const wg = new THREE.BufferGeometry();
      wg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(wirePos.length), 3));
      wg.setAttribute('aWire', new THREE.Float32BufferAttribute(wirePos, 3));
      wg.setIndex(wireIdx);
      wires[i].geometry.dispose();
      wires[i].geometry = wg;
    });

    const s0 = comp.strings[0], k0 = (2 * s0.depth * tanHalf) / H;
    U.uFlag.value.set(comp.flags.w * k0, comp.flags.h * k0, comp.flags.w / (s0.bx - s0.ax), TL.flags);
    const fg = new THREE.InstancedBufferGeometry();
    fg.setAttribute('position', flagCard.pos.clone()); fg.setIndex(flagCard.idx.clone());
    fg.setAttribute('aFlag', new THREE.InstancedBufferAttribute(new Float32Array(comp.flags.list.flatMap((fl) => [fl.s, 0, fl.seed, fl.design])), 4));
    fg.setAttribute('aDye', new THREE.InstancedBufferAttribute(new Float32Array(comp.flags.list.flatMap((fl) => fl.dye)), 3));
    fg.instanceCount = comp.flags.list.length;
    flags.geometry = fg;

    const bulb = [], R = rng(701);
    for (let j = 0; j < comp.bulbs.n; j++) bulb.push((j + 0.5 + R.range(-0.12, 0.12)) / comp.bulbs.n, 1, R.f(), comp.bulbs.size * R.range(0.85, 1.12));
    U.uBulb.value.y = comp.strings[1].depth;
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((bulb.length / 4) * 3), 3));
    bg.setAttribute('aBulb', new THREE.Float32BufferAttribute(bulb, 4));
    bulbs.geometry = bg;

    // the box of air the dust drifts through
    const hh = 14 * tanHalf * 1.2, hw = hh * aspect * 1.1;
    U.uBoxMin.value.set(-hw, -hh, -15.5);
    U.uBoxSize.value.set(hw * 2, hh * 2, 13.5);
    stats.flags = comp.flags.list.length; stats.bulbs = comp.bulbs.n;
    stats.total = LEAF_LAYERS.reduce((a, n) => a + stats[n], 0);
  }

  /** resize the drawing buffer (cheap; called immediately on resize, layout() follows) */
  function resize(W, H, dpr) {
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    const bw = renderer.domElement.width, bh = renderer.domElement.height, bs = Math.sqrt(bw * bh);
    U.uRes.value.set(bw, bh);
    U.uAspect.value = bw / bh;
    U.uCocPx.value = 0.21 * bs;                               // blur diameter (px) per unit of focus error
    U.uCocMax.value = 0.16 * bs;
    U.uPxScale.value = 6.5 * dpr * clamp(Math.sqrt(W * H) / 700, 0.75, 1.5);
    U.uWirePx.value = 1.25 * dpr;
    U.uBulb.value.x = dpr;
    camera.aspect = W / H;
  }

  /**
   * Draw the frame for time t.
   * @param px,py  pointer / tilt offset, -1..1 (0 in frozen and reduced-motion modes)
   * @param veil   0..1: extra fade to deep green on top of the timeline's own (used while the window is being resized)
   */
  function render(t, px = 0, py = 0, veil = 0) {
    const c = cameraAt(t);
    const settle = smoothstep(2.0, 7.5, t);                    // the ambient drift fades up as the dolly lands
    camera.position.set(
      c.x + settle * (0.15 * Math.sin(t * 0.23 + 0.6) + 0.05 * Math.sin(t * 0.61)) + px * 0.32,
      c.y + settle * (0.09 * Math.sin(t * 0.19 + 2.1) + 0.03 * Math.sin(t * 0.53 + 1.0)) + py * 0.2,
      c.z + settle * 0.2 * Math.sin(t * 0.11 + 4.0));
    camera.rotation.set(settle * 0.004 * Math.sin(t * 0.17 + 1.0) - py * 0.006, settle * 0.005 * Math.sin(t * 0.14) + px * 0.008,
                        c.roll + settle * 0.004 * Math.sin(t * 0.13 + 2.0));
    camera.fov = (2 * Math.atan(c.tanHalf) * 180) / Math.PI;   // a touch wider while moving fast
    camera.updateProjectionMatrix();

    // the two clocks (see shaders.js): cues, and the wrapped loop for everything that repeats
    U.uTime.value = Math.min(t, 120);
    U.uLoop.value = ((t % GL.LOOP) + GL.LOOP) % GL.LOOP;
    U.uFrame.value = ((Math.floor(t * 24) % 1024) + 1024) % 1024;
    U.uRayT.value = (t * 0.12) % (20 * Math.PI);
    U.uFade.value = Math.max(1 - smoothstep(-0.18, TL.fadeIn, t), veil);   // the very first frame is already a dim glimpse, not blank
    U.uPortal.value = 1 - smoothstep(TL.portal[0], TL.portal[1], t);
    U.uGold.value = 0.42 * smoothstep(1.4, 3.6, t);            // the gold that stays in the air along the tree line
    U.uPool.value = smoothstep(TL.pool[0], TL.pool[1], t);
    U.uExposure.value = lerp(0.74, 1, smoothstep(0.6, 3.6, t));
    U.uRays.value = smoothstep(1.2, 5.2, t) * (0.9 + 0.1 * Math.sin(t * 0.21));   // the shafts keep building through the reveal
    U.uFrontRays.value = smoothstep(2.0, 5.2, t);
    U.uMotes.value = smoothstep(1.4, 4.6, t);
    U.uWireA.value.set(1.1 * easeOut((t - (TL.flags - 0.5)) / 1.5), 1.1 * easeOut((t - (TL.lights - 0.55)) / 1.4));   // each string is thrown across just ahead of its flags / bulbs
    // leaves whip as we push through them; the air holds still for a beat as the names come up
    // (anticipation), then one gust rolls through as the camera lands; after that the wind settles
    // into its own rhythm of gusts and lulls
    const hush = 1 - 0.6 * smoothstep(TL.names - 0.5, TL.names - 0.05, t) * (1 - smoothstep(TL.gust - 0.1, TL.gust + 0.45, t));
    U.uWindGust.value = (1 + 0.9 * (1 - smoothstep(0.4, 3.0, t)) + 1.25 * bump((t - TL.gust) / 2.0)) * hush;
    U.uWindBase.value = 0.55 + 0.45 * hush;
    U.uGate.value = 1 - smoothstep(5.0, 10.5, t);

    // do not ask the GPU for layers that cannot be seen yet / any more
    const camZ = camera.position.z;
    PASS_DIST.forEach((d, i) => { layers['pass' + i].mesh.visible = camZ - (CAM.startZ - d * 1.04) > 0.6; });   // still ahead of the lens
    layers.near.mesh.visible = camZ + DEPTH.near * 0.96 < FAR_FADE.near[1];
    layers.bed.mesh.visible = t > TL.bed - 0.05;
    flags.visible = t > TL.flags - 0.05;
    wires[0].visible = t > TL.flags - 0.5;
    wires[1].visible = bulbs.visible = t > TL.lights - 0.55;
    motes.visible = U.uMotes.value > 0;
    renderer.render(scene, camera);
  }

  /** how long the GPU takes over the heaviest frame of the piece, in ms (best of a few; blocks until done) */
  function bench(t = 1.4, n = 3) {
    const px = new Uint8Array(4);
    let best = Infinity;
    for (let i = 0; i <= n; i++) {
      const t0 = performance.now();
      render(t);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);   // forces the GPU to finish before we read the clock
      if (i > 0) best = Math.min(best, performance.now() - t0);  // the first run pays for shader compilation
    }
    return best;
  }

  return {
    render, resize, layout, bench, sprites,
    get stats() { return stats; },
    dispose() {
      for (const l of Object.values(layers)) l.mesh.geometry.dispose();
      for (const o of [flags, bulbs, ...wires, motes]) o.geometry.dispose();
      for (const d of disposables) d.dispose();
      renderer.dispose();
    },
  };
}
