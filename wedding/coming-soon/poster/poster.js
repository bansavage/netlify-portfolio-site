/* ============================================================================
   poster.js — the "1974" kinetic poster for Kyle & Daina's coming-soon page.

   HOW IT WORKS
   The whole piece is one function of time: render(t) draws the frame for
   t seconds after the start. Nothing remembers the previous frame and nothing
   uses Math.random, so any moment can be recreated exactly:
       index.html?t=3.5      shows the frame at 3.5s and stays frozen there
       index.html?guides     outlines the boxes the leaves must keep out of (add &t=9 to freeze)
       index.html?specimens  shows a sheet of every plant on its own (handy when editing plants.js)
       window.__timeline     { duration, seek(t), play(), pause() } in the console

   THE TIMELINE  (seconds — the numbers live in `T` just below)
     0.00 - 0.75   paper. Six colour panels drop in one after another and fill the frame
     0.75 - 0.95   hold. Loud.
     0.95 - 1.95   the panels wipe up in sequence and the bar collapses to a thin stripe along
                   the top, revealing the deep green field: dark leaves pop open left to right
                   and big mid-dark leaves swing in from both edges behind where the names will be
     1.15 - 2.3    leaves cut in ON TWELVES (see CUT_FPS): banana leaves swing in from the
                   corners, fan palms snap open, fronds whip in — mid greens first, brightest last.
                   Palm trees rise on the horizon and their crowns burst open (dark on dark for now)
     2.05 - 2.35   anticipation: the foliage leans away from the middle...
     2.30 - 3.5    ...and springs back as "Kyle"  "&"  "Daina" slide up out of their masks.
                   From here the leaves lie perfectly still: the stage belongs to the names
     3.40 - 5.0    the sun rises behind the horizon just above the names, through slits that
                   keep drifting down it forever, and turns the palms into silhouettes
     3.60 - 4.3    "are getting married"
     3.75 - 6.0    the bird of paradise: the stalk grows with its bud pointing up, the bud tips
                   over into the beak, the orange crest flicks open sepal by sepal, the cobalt
                   petal last. A second, half-open bloom follows half a second behind
     5.20 - 6.4    credits set in: place, date, "Coming soon"
     6.20 - 7.9    the breeze arrives: stepped cut-paper time melts into smooth time, the leaves
                   begin to sway and the first gust rolls in from the left
     7.30          intro over -> the Replay button appears
     7.3 +         ambient, forever (it never repeats, so there is no loop seam): gusts roll
                   across the leaves left to right, front layers and leaf tips moving most; the
                   sun breathes and its slits drift; the flowers nod; and now and then (first at
                   16s, then every 20s) the stripe quietly re-orders its colours

   WHERE TO CHANGE THINGS
     names / place / date / wording ... index.html  (the <main class="copy"> block). The names
                                        shrink to fit by themselves if you make them longer.
     type sizes, colours of the type .. poster.css
     timing ........................... `T` below
     stop-motion vs silky ............. CUT_FPS below (12 = cut paper, 0 = smooth)
     which plants go where ............ portrait() and landscape() in section 5
     how a plant is drawn ............. plants.js
   ============================================================================ */
(function () {
  'use strict';

  var P = window.PosterPlants;
  var root = document.documentElement;
  if (!P) { root.classList.remove('js', 'booting'); return; }
  var rad = P.rad, lerp = P.lerp, clamp = P.clamp, TAU = Math.PI * 2;

  /* ==========================================================================
     1. SETTINGS
     ========================================================================== */
  var T = {
    barsIn: 0.06, barsStagger: 0.075, barsInDur: 0.30,   // panels drop in
    cover: 0.74,                                         // frame fully covered: swap paper for jungle behind the panels
    barsOut: 0.95, barsOutDur: 0.62,                     // panels wipe up to the stripe
    far: 0.95, back: 1.1,                                // dark background leaves unfold, big back leaves swing in
    mid: 1.15, palms: 1.3, front: 1.45,                  // foliage layers cut in
    kick: 2.05,                                          // foliage leans away before the names
    kyle: 2.3, amp: 2.6, daina: 2.8, wordDur: 0.9,       // the names
    sun: 3.4,                                            // sunrise
    lede: 3.6,                                           // "are getting married"
    birdLeaves: 2.0, bird: 3.75,                         // bird of paradise: its leaves, then the flower stalk
    credits: 5.2,
    melt: 6.2,                                           // the breeze arrives: stepped plant time eases into smooth time (takes 1.2s) and the leaves begin to sway
    end: 7.3,                                            // intro length; Replay appears here
    shuffleFirst: 16, shuffleEvery: 20                   // the stripe re-ordering itself
  };
  var SEED = 1974;          // change for a different (but still repeatable) jungle
  var CUT_FPS = 12;         // while the plants are being placed they move like cut paper under a rostrum camera: on twelves.
                            // The type, the bars and the sun always move smoothly — that contrast is the look. 0 = everything smooth.
  var AMBIENT_FPS = 30;     // once settled, the slow sway is redrawn at this rate (plenty for slow motion, half the battery)
  var MAX_DPR = 2, MAX_PIXELS = 6e6;   // never draw more canvas pixels than this, however big the screen
  var SUN_UP = 1.62;        // how much of the sun stands above the horizon, in radii (2 = the whole disc)
  var SLITS = 4, SLIT_LIFE = 30;       // slits across the lower sun; each takes this many seconds to drift down and out

  /* canvas colours (the rest of the house palette is in poster.css) */
  var COL = { cemp: '#F2A33C', hueso: '#F6F1E4', ground: '#0F2A1D' };
  /* Foliage tones: a = lit half, b = shaded half, rib = midrib. One family, from
     near-black green up to acid lime, anchored on olivo and lima. */
  var TONE = {
    farA:   { a: '#17402A', b: '#133524', rib: '#1B4A30' },
    farB:   { a: '#1D4F33', b: '#163E29', rib: '#22593A' },
    back:   { a: '#1F5A36', b: '#194A2D', rib: '#236639' },                     // behind the names: hueso on this is still 7:1
    palm:   { a: '#17402A', b: '#17402A', rib: '#17402A' },                     // one flat tone: true silhouettes on the sun
    ridge:  { a: '#256B3D', b: '#256B3D', rib: '#256B3D' },                     // the far palms along the horizon, either side of the sun
    deep:   { a: '#2E7D46', b: '#1F5A36', rib: '#4C9A4A' },
    mid:    { a: '#4C9A4A', b: '#2E7D46', rib: '#7FB23A' },
    olive:  { a: '#6E7A3A', b: '#57622C', rib: '#B8D430' },
    bright: { a: '#7FB23A', b: '#4C9A4A', rib: '#B8D430' },
    lime:   { a: '#B8D430', b: '#7FB23A', rib: '#2E7D46' },
    sage:   { a: '#5F9070', b: '#497A5C', rib: '#A5C79B' },                     // bird-of-paradise leaves: grey-green, pale midrib
    spathe: { a: '#6E7A3A', b: '#57622C', rib: '#C4562F' },
    sepal:  { a: '#F2A33C', b: '#C4562F' },
    petal:  { a: '#2B4FC4', b: '#2442A6' },
    stalk:  { a: '#6E7A3A', b: '#7FB23A' },
    heli:   { a: '#E0387E', b: '#C4562F', rib: '#6E7A3A', edge: '#F2A33C' }
  };
  /* depth layers, back to front */
  var FAR = 0, BACK = 1, SUN = 2, MID = 3, FRONT = 4;
  var LAYER = [
    { amp: 0,     K: 1, q: 0.6,  fit: false, kick: 0 },      // FAR   tone-on-tone canopy. Still once it has unfolded (it is baked into one picture)
    { amp: 0.014, K: 2, q: 0.75, fit: false, kick: 0.3 },    // BACK  oversized mid-dark leaves that pass behind the names
    { amp: 0.026, K: 1, q: 0.9,  fit: false, kick: 0 },      // SUN   the palm trees standing in front of the sun
    { amp: 0.042, K: 4, q: 0.9,  fit: true,  kick: 1.0 },    // MID   foliage
    { amp: 0.064, K: 5, q: 1.0,  fit: true,  kick: 1.5 }     // FRONT the brightest, biggest shapes and the flowers
  ];

  /* ==========================================================================
     2. EASING  (never linear)
     ========================================================================== */
  function seg(t, a, d) { return clamp((t - a) / d, 0, 1); }
  function outExpo(x) { return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x); }
  function outCubic(x) { return 1 - Math.pow(1 - x, 3); }
  function outQuart(x) { return 1 - Math.pow(1 - x, 4); }
  function inOutQuad(x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }
  function inOutCubic(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function inOutExpo(x) { return x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2; }
  function smooth(x, a, b) { var k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); }
  /* a hard start that overshoots and settles: 0 -> 1. d = damping, w = bounce speed */
  function spring(p, d, w) { return p <= 0 ? 0 : 1 - Math.exp(-d * p) * Math.cos(w * p); }
  function soft(v, m) { return m * Math.tanh(v / m); }

  /* ==========================================================================
     3. DOM
     ========================================================================== */
  var stage = document.querySelector('.stage');
  var canvas = document.getElementById('art'), ctx2d = canvas.getContext('2d', { alpha: false });
  var barsEl = document.querySelector('.bars');
  var bars = [].slice.call(barsEl.querySelectorAll('span'));
  var replayBtn = document.querySelector('.replay');
  var copyEl = document.querySelector('.copy'), blockEl = document.querySelector('.block');
  var namesEl = document.querySelector('.names');
  var words = {}, typed = {};
  [].forEach.call(document.querySelectorAll('[data-reveal]'), function (el) { words[el.getAttribute('data-reveal')] = el; });
  [].forEach.call(document.querySelectorAll('[data-type]'), function (el) { typed[el.getAttribute('data-type')] = el; });

  var query = new URLSearchParams(location.search);
  var frozenAt = query.has('t') ? Math.max(0, parseFloat(query.get('t')) || 0) : null;
  var reducedMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  var specimenMode = query.has('specimens'), guideMode = query.has('guides');

  function setStyle(el, prop, val) {            // only touch the DOM when a value really changes
    var k = '_' + prop;
    if (el[k] !== val) { el[k] = val; el.style[prop] = val; }
  }

  /* ==========================================================================
     4. SPRITES — every plant is drawn once into its own little canvas, then
        each frame just moves / turns / bends those pictures.
     ========================================================================== */
  var artMemo = {}, spriteMemo = {}, generation = 0;
  function art(kind, opts) {                    // memoised: same request -> same art (and so the same sprite)
    var key = kind + JSON.stringify(opts);
    var hit = artMemo[key];
    if (!hit) hit = artMemo[key] = { v: P[kind](opts) };
    hit.gen = generation;
    return hit.v;
  }
  function sprite(a, res) {
    var area = (a.x1 - a.x0) * (a.y1 - a.y0) * res * res;
    if (area > 5e6) res *= Math.sqrt(5e6 / area);
    res = Math.max(0.1, Math.round(res * 50) / 50);
    var key = a.id + '@' + res, hit = spriteMemo[key];
    if (hit) { hit.gen = generation; return hit; }
    var pad = 2, w = Math.ceil((a.x1 - a.x0) * res) + pad * 2, h = Math.ceil((a.y1 - a.y0) * res) + pad * 2;
    var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    var g = cv.getContext('2d');
    g.translate(pad - a.x0 * res, pad - a.y0 * res); g.scale(res, res);
    g.lineCap = 'round';
    a.shapes.forEach(function (s) {
      g.globalCompositeOperation = s.op === 'erase' ? 'destination-out' : s.op === 'atop' ? 'source-atop' : 'source-over';
      g.beginPath();
      s.polys.forEach(function (p) {
        g.moveTo(p[0], p[1]);
        for (var i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]);
        if (!s.stroke) g.closePath();
      });
      if (s.stroke) { g.strokeStyle = s.stroke; g.lineWidth = s.width; g.stroke(); }
      else { g.fillStyle = s.fill; g.fill(); }
    });
    return (spriteMemo[key] = { cv: cv, w: w, h: h, ox: pad - a.x0 * res, oy: pad - a.y0 * res, res: res, gen: generation });
  }
  function pruneMemo() {                        // after a rebuild, forget what the new layout no longer uses
    var k;
    for (k in artMemo) if (artMemo[k].gen !== generation) delete artMemo[k];
    for (k in spriteMemo) if (spriteMemo[k].gen !== generation) delete spriteMemo[k];
  }

  /* ==========================================================================
     5. THE SCENE — where every plant sits. Two recipes: portrait (phones,
        tablets) and landscape (desktop / phone on its side). All positions hang
        off the frame edges and the measured position of the type, so the
        composition re-flows instead of stretching.
     ========================================================================== */
  var scene = null, L = null, dpr = 1;

  /* 2D matrices [a,b,c,d,e,f] for working out where hull points land */
  function mTRS(x, y, rot, sx, sy) { var c = Math.cos(rot), s = Math.sin(rot); return [c * sx, s * sx, -s * sy, c * sy, x, y]; }
  function mMul(m, n) {
    return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
            m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  }
  function nodeMatrix(n, parent) {
    var m = mTRS(n.x, n.y, n.rot, n.flip * n.scale, n.scale);
    return parent ? mMul(parent, m) : m;
  }

  /* Where the ink of a word really is (not its line box), so leaves can come close without touching. */
  var probe = document.createElement('canvas').getContext('2d');
  function inkOf(el) {
    var r = el.getBoundingClientRect(), cs = getComputedStyle(el), size = parseFloat(cs.fontSize);
    var y0 = r.top + 0.12 * size, y1 = r.top + (/[gjpqy]/.test(el.textContent) ? 1.05 : 0.86) * size;   // fallback guess
    try {
      probe.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + size + 'px ' + cs.fontFamily;
      var m = probe.measureText(el.textContent);
      if (m.fontBoundingBoxAscent != null && m.actualBoundingBoxAscent != null) {
        var base = r.top + (r.height - m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2 + m.fontBoundingBoxAscent;
        y0 = base - m.actualBoundingBoxAscent; y1 = base + m.actualBoundingBoxDescent;
      }
    } catch (err) { /* keep the guess */ }
    return { x0: r.left, x1: r.right, y0: y0, y1: y1 };
  }
  function boxOf(el) { var r = el.getBoundingClientRect(); return { x0: r.left, x1: r.right, y0: r.top, y1: r.bottom }; }

  function measure() {
    root.classList.add('measuring');             // read the type as it sits at rest, whatever the intro is doing to it
    root.style.removeProperty('--fs');
    var W = stage.clientWidth, H = stage.clientHeight;
    var cs = getComputedStyle(copyEl);
    var availW = W - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var availH = H - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    for (var pass = 0; pass < 2; pass++) {       // auto-fit: longer names or a fallback font must never run off the frame
      var b = blockEl.getBoundingClientRect(), k = Math.min(availW / b.width, availH / b.height);
      if (!(k < 0.995)) break;
      root.style.setProperty('--fs', Math.floor(parseFloat(getComputedStyle(namesEl).fontSize) * k * 100) / 100 + 'px');
    }
    var fs = parseFloat(getComputedStyle(namesEl).fontSize);
    var ink = [inkOf(words.kyle), inkOf(words.amp), inkOf(words.daina)];
    var credits = [].map.call(document.querySelectorAll('[data-type]'), boxOf);
    var ko = ink.concat([boxOf(words.lede)], credits);
    var layoutName = getComputedStyle(root).getPropertyValue('--layout').trim();
    var land = layoutName ? layoutName === 'landscape' : W / H >= 1.05;
    var stripe = parseFloat(getComputedStyle(barsEl).paddingTop) || clamp(0.034 * Math.min(W, H), 12, 18);
    root.classList.remove('measuring');
    var o = {
      W: W, H: H, fs: fs, land: land, ko: ko, stripe: stripe,
      capTop: Math.min(ink[0].y0, ink[1].y0, ink[2].y0), namesBottom: Math.max(ink[0].y1, ink[1].y1, ink[2].y1),
      left: Math.min(ink[0].x0, ink[2].x0), right: Math.max(ink[1].x1, ink[2].x1),
      copyBottom: Math.max.apply(null, credits.map(function (c) { return c.y1; })),
      credRight: Math.max.apply(null, credits.map(function (c) { return c.x1; })),
      credTop: Math.min.apply(null, credits.map(function (c) { return c.y0; })),
      credLeft: Math.min.apply(null, credits.map(function (c) { return c.x0; }))
    };
    o.cx = (o.left + o.right) / 2; o.cy = (o.capTop + o.copyBottom) / 2;
    o.u = land ? Math.min(H / 520, W / 900) : Math.min(W / 390, H / 700);
    o.u = Math.max(0.2, Math.round(o.u * 40) / 40);                // in small steps, so dragging a window edge can reuse sprites
    return o;
  }

  function makeNode(a, o) {
    var d = LAYER[o.layer != null ? o.layer : MID];
    var n = { art: a, x: 0, y: 0, rot: 0, flip: 1, scale: 1, layer: MID, at: 0, enter: { kind: 'swing', from: 0 },
              amp: d.amp, K: d.K, q: d.q, fit: d.fit, kick: d.kick, f1: 1.1, phase: 0, maxJ: 0.075,
              kids: [], kidsBehind: false, type: '' };
    for (var k in o) n[k] = o[k];
    return n;
  }

  function buildScene(Lm) {
    generation++;
    var W = Lm.W, H = Lm.H, u = Lm.u, nodes = [], R = P.mulberry32(SEED), sun = null;
    var seedN = 1;

    function add(a, o) { var n = makeNode(a, o); n.phase = R() * TAU; n.f1 = 0.8 + R() * 0.7; nodes.push(n); return n; }

    /* leaf(kind, size options in poster units, placement). rot is in degrees: 0 up, 90 right, 180 down, -90 left */
    function leaf(kind, s, p) {
      var o = { seed: s.seed || (SEED + seedN++ * 7), tone: TONE[s.tone] }, a;
      var flip = p.flip || 1, rot = rad(p.rot || 0);
      if (kind === 'banana' || kind === 'paddle') {
        o.len = s.len * u; o.form = kind === 'paddle' ? 'paddle' : 'banana';
        if (s.stalk != null) o.stalk = s.stalk * u; if (s.curl != null) o.curl = s.curl; if (s.tears != null) o.tears = s.tears;
        if (s.skew != null) o.skew = s.skew; if (s.width != null) o.width = s.width * u; if (s.veins != null) o.veins = s.veins;
        a = art('bananaLeaf', o);
      } else if (kind === 'frond') {
        o.len = s.len * u; o.turn = rad(s.turn != null ? s.turn : 50); o.grav = [Math.sin(rot) * flip, Math.cos(rot)];
        if (s.leaf) o.leaf = s.leaf; if (s.droop != null) o.droop = s.droop; if (s.n) o.n = s.n;
        a = art('palmFrond', o);
      } else if (kind === 'fan') {
        o.r = s.r * u; if (s.stalk != null) o.stalk = s.stalk * u; if (s.span) o.span = rad(s.span); if (s.curl != null) o.curl = s.curl; if (s.n) o.n = s.n;
        a = art('fanPalm', o);
      } else if (kind === 'monstera') {
        o.len = s.len * u; if (s.stalk != null) o.stalk = s.stalk * u; if (s.curl != null) o.curl = s.curl; if (s.tilt != null) o.tilt = rad(s.tilt);
        a = art('monstera', o);
      } else if (kind === 'heliconia') {
        o.len = s.len * u; if (s.curl != null) o.curl = s.curl;
        a = art('heliconia', o);
      }
      var enter = p.enter || { kind: kind === 'fan' ? 'fan' : 'swing', from: 0 };
      if (enter.fromDeg != null) enter.from = rad(enter.fromDeg);
      var stiff = kind === 'fan' || kind === 'monstera';
      return add(a, { x: p.x, y: p.y, rot: rot, flip: flip, layer: p.layer, at: p.at, enter: enter,
                      K: p.K != null ? p.K : (stiff ? Math.min(3, LAYER[p.layer].K) : LAYER[p.layer].K),
                      maxJ: stiff ? 0.035 : 0.075, fit: p.fit != null ? p.fit : LAYER[p.layer].fit,
                      amp: LAYER[p.layer].amp * (p.amp || 1) });
    }
    /* a back-layer leaf: oversized, mid-dark, slow to swing in; each one follows 90ms after the last */
    var backN = 0;
    function back(kind, s, p) {
      s.tone = 'back';
      return leaf(kind, s, { x: p.x, y: p.y, rot: p.rot, flip: p.flip, layer: BACK, at: T.back + 0.09 * backN++,
                             enter: { kind: 'swing', fromDeg: p.from != null ? p.from : (p.rot > 0 ? -46 : 46), d: 5.2, w: 6.4 } });
    }

    /* The sun sits on a horizon a little above the names: a classic half-set disc with air above and below. */
    function placeSun(maxR) {
      var horizon = Lm.capTop - 0.14 * Lm.fs;
      var r = Math.max(1, Math.min(maxR, (horizon - Lm.stripe) / (SUN_UP + 0.22)));
      sun = { x: W * 0.5, r: r, horizon: horizon, y: horizon - (SUN_UP - 1) * r };
    }

    /* a palm tree: trunk + a crown of fronds that burst open one after another */
    function palm(o) {
      var pt = art('palmTree', { h: o.h, lean: rad(o.lean), w: o.w, fronds: o.fronds || 11, frondLen: o.frondLen, seed: o.seed, tone: TONE[o.tone || 'palm'] });
      var trunk = add(pt.trunk, { x: o.x, y: o.y, layer: SUN, K: 1, amp: 0.012, at: o.at,
                                  enter: { kind: 'rise', from: rad(-o.lean * 0.45), d: 6.5, w: 8 } });
      pt.fronds.forEach(function (f, i) {
        var k = makeNode(f.art, { x: pt.crown.x, y: pt.crown.y, rot: f.rot, layer: SUN, amp: 0.034, kick: 0,
                                  at: o.at + 0.34 + i * 0.04, enter: { kind: 'unfurl', from: -f.rot * 0.82, d: 6, w: 11 } });
        k.phase = R() * TAU; k.f1 = 0.8 + R() * 0.7;
        trunk.kids.push(k);
      });
      return trunk;
    }

    /* a far palm on the horizon beside the sun: one flat piece that rises and then sways as a whole */
    var ridgeN = 0;
    function ridge(dx, h, lean, seed) {
      var a = art('palmWhole', { h: h, lean: rad(lean), w: h * 0.05, fronds: 10, frondLen: h * 0.4, seed: seed, tone: TONE.ridge });
      return add(a, { x: sun.x + dx, y: sun.horizon + 3 * u, layer: SUN, K: 2, amp: 0.02, kick: 0, at: T.palms + 0.08 + 0.07 * ridgeN++,
                      enter: { kind: 'rise', from: rad(-lean * 0.5), d: 6.5, w: 8 } });
    }

    /* A bird of paradise: a clump of grey-green paddles and a flower on a tall bare stalk.
         o.headX(S), o.headY   where the flower head should sit on screen (S = flower size in px)
         o.size, o.minSize     the flower is only shrunk (never below minSize) if it would touch the type
         o.rots / o.lens       the orange sepals (angle in degrees, length as a fraction of S)
         o.petal               false for a half-open bloom with no blue petal yet
       The leaves are fitted one by one, so a leaf that brushes the copy never shrinks the flower. */
    function bird(o) {
      var flip = o.flip || 1, s = o.stalk, pad = o.pad || 14 * u;
      var group = add(null, { x: 0, y: o.y, flip: flip, layer: FRONT, at: o.leavesAt, kick: 0.6, amp: 0, K: 1, fit: false });
      var rots = o.rots || [-16, 5, 25, 44], lens = o.lens || [0.84, 0.98, 0.88, 0.7];

      function flower(S) {
        var Rb = P.mulberry32(SEED + o.seed * 101);
        var sa = art('strelitziaStalk', { h: Math.max(40 * u, o.y - o.headY), w: S * 0.085, curl: s.curl || 0, tone: TONE.stalk });
        var st = makeNode(sa, { x: 0, y: 0, rot: rad(s.rot || 0), layer: FRONT, type: 'stalk', amp: 0.022, kick: 0, at: o.at,
                                enter: { kind: 'grow', from: rad(s.sway != null ? s.sway : 5) } });
        st.phase = Rb() * TAU;
        var tip = P.at(sa.meta.sp, 1);
        // the flower head: the spathe ("beak") with the sepals and the petal tucked in behind it.
        // It rides up as a closed bud pointing along the stalk, then tips over into place.
        var head = makeNode(art('strelitziaSpathe', { size: S, tone: TONE.spathe }),
          { x: tip.x, y: tip.y, rot: rad(s.tilt) - rad(s.rot || 0), layer: FRONT, kidsBehind: true, amp: 0.036, kick: 0,
            at: o.at, enter: { kind: 'tip', from: rad(-80 - s.tilt), hold: 0.55, d: 4.6, w: 8.2 } });
        head.phase = Rb() * TAU; head.f1 = 0.7;
        var open = o.at + 1.2;
        for (var j = 0; j < rots.length; j++) {                                    // the orange sepals flick open, back to front
          var sep = makeNode(art('strelitziaSepal', { len: S * lens[j], seed: o.seed * 7 + j, curl: (j - (rots.length - 1) / 2) * 0.14, tone: TONE.sepal }),
            { x: S * (0.04 + 0.27 * j / Math.max(1, rots.length - 1)), y: -S * 0.035, rot: rad(rots[j]), layer: FRONT, amp: 0.03, kick: 0,
              at: open + j * 0.12, enter: { kind: 'flick', from: rad(82 - rots[j]), d: 6.5, w: 14 } });
          sep.phase = Rb() * TAU; head.kids.push(sep);
        }
        if (o.petal !== false) head.kids.push(makeNode(art('strelitziaPetal', { len: S * 0.84, tone: TONE.petal }),   // ...then the cobalt petal, last
          { x: S * 0.4, y: -S * 0.035, rot: rad(60), layer: FRONT, amp: 0.02, kick: 0,
            at: open + rots.length * 0.12 + 0.14, enter: { kind: 'flick', from: rad(26), d: 6, w: 13 } }));
        st.kids.push(head);
        // stand the stalk so that the head lands on headX
        var c = Math.cos(st.rot), sn = Math.sin(st.rot);
        group.x = o.headX(S) - flip * (tip.x * c - tip.y * sn);
        return st;
      }

      var S = o.size, st = flower(S), tries = 0;
      while (touches(st, nodeMatrix(group, null), pad, 0, 1.8) && S * 0.94 >= o.minSize && tries++ < 12) { S *= 0.94; st = flower(S); }

      var G = nodeMatrix(group, null), Rl = P.mulberry32(SEED + o.seed * 211);
      (o.leaves || []).forEach(function (lf, i) {
        var a = art('bananaLeaf', { len: lf.len * u, stalk: lf.stalk * u, form: 'paddle', tears: lf.tears || 0, curl: lf.curl, skew: lf.skew,
                                    seed: o.seed * 13 + i, tone: TONE[lf.tone || 'sage'] });
        var n = makeNode(a, { x: lf.dx * u, y: 0, rot: rad(lf.rot), layer: FRONT, K: 4, amp: 0.046, kick: 0, at: o.leavesAt + i * 0.07,
                              enter: { kind: 'rise', from: rad(lf.rot > 0 ? -16 : 16), d: 7, w: 9 } });
        n.phase = Rl() * TAU; n.f1 = 0.8 + Rl() * 0.7;
        var guard = 0;
        while (touches(n, G, 12 * u) && guard++ < 16) n.scale *= 0.94;
        group.kids.push(n);
      });
      group.kids.push(st);
      return { group: group, size: S };
    }

    /* the far canopy: big, dark, tone-on-tone leaves scattered over the whole field */
    function canopy() {
      var cell = 118 * u, cols = Math.ceil(W / cell) + 1, rows = Math.ceil(H / cell) + 1;
      var pool = [
        function () { return art('bananaLeaf', { len: 250 * u, seed: 901, tone: TONE.farA, veins: 9 }); },
        function () { return art('bananaLeaf', { len: 290 * u, seed: 902, tone: TONE.farB, veins: 10 }); },
        function () { return art('monstera', { len: 150 * u, stalk: 60 * u, seed: 903, tone: TONE.farA }); },
        function () { return art('monstera', { len: 170 * u, stalk: 60 * u, seed: 904, tone: TONE.farB }); },
        function () { return art('fanPalm', { r: 125 * u, stalk: 60 * u, seed: 905, tone: TONE.farA }); },
        function () { return art('palmFrond', { len: 270 * u, turn: rad(45), seed: 906, tone: TONE.farB, leaf: 0.34 }); },
        function () { return art('palmFrond', { len: 240 * u, turn: rad(-60), seed: 907, tone: TONE.farA, leaf: 0.34 }); },
        function () { return art('bananaLeaf', { len: 220 * u, seed: 908, tone: TONE.farB, veins: 8 }); }
      ];
      for (var j = 0; j < rows; j++) for (var i = 0; i < cols; i++) {
        var x = (i - 0.5 + R()) * cell, y = (j - 0.3 + R()) * cell;
        var a = pool[Math.floor(R() * pool.length)]();
        var rot = (R() - 0.5) * rad(250), sc = [0.82, 1, 1.15][Math.floor(R() * 3)];
        add(a, { x: x, y: y + a.top * 0.45 * sc, rot: rot, scale: sc, flip: R() < 0.5 ? -1 : 1, layer: FAR,
                 at: T.far + clamp(x / W, 0, 1) * 0.42 + R() * 0.2, enter: { kind: 'pop', from: (R() - 0.5) * 1.6, d: 7, w: 8 } });
      }
    }

    /* ---------------------------------------------------------------- PORTRAIT */
    function portrait() {
      var top = Lm.stripe, cap = Lm.capTop, bot = H, wide = W / H > 0.62;       // wide: tablets and squarish windows
      placeSun(W * 0.3);
      var r = sun.r, hz = sun.horizon;

      canopy();

      // back layer: oversized leaves from both edges, passing behind the names
      back('banana', { len: 330, curl: 0.32, seed: 61 }, { x: -46 * u, y: H * 0.47, rot: 68 });
      back('banana', { len: 350, curl: -0.26, seed: 62 }, { x: W + 44 * u, y: H * 0.7, rot: -74 });
      back('fan', { r: 150, stalk: 90, seed: 64 }, { x: W + 40 * u, y: H * 0.43, rot: -72 });
      back('frond', { len: 330, turn: 34, leaf: 0.34, seed: 63 }, { x: -30 * u, y: H * 0.8, rot: 52 });
      back('monstera', { len: 190, stalk: 70, seed: 65 }, { x: -44 * u, y: H * 0.64, rot: 78 });
      back('banana', { len: 300, curl: 0.2, seed: 66 }, { x: W * 0.6, y: bot + 50 * u, rot: -10 });

      // palm trees stand on the horizon: far ones either side of the sun, two in front of it (dark silhouettes once it rises)
      ridge(-r * 1.5, r * 0.95, -10, 81); ridge(r * 1.42, r * 1.2, 12, 82);
      if (wide) { ridge(-r * 2.3, r * 1.3, 14, 83); ridge(r * 2.4, r * 0.85, -12, 84); }
      palm({ x: sun.x - r * 0.26, y: hz + 3 * u, h: r * 1.1, lean: -17, fronds: 11, frondLen: r * 0.44, w: r * 0.055, seed: 11, at: T.palms });
      palm({ x: sun.x + r * 0.34, y: hz + 3 * u, h: r * 0.74, lean: 15, fronds: 10, frondLen: r * 0.38, w: r * 0.048, seed: 23, at: T.palms + 0.16 });

      // mid layer
      leaf('banana', { len: 200, tone: 'deep', curl: -0.35, seed: 31 }, { x: -34 * u, y: top + 26 * u, rot: 166, layer: MID, at: T.mid, enter: { kind: 'swing', fromDeg: -80 } });
      leaf('frond', { len: 210, tone: 'deep', turn: 24, seed: 32 }, { x: W + 22 * u, y: top + 6 * u, rot: -166, layer: MID, at: T.mid + 0.08, enter: { kind: 'swing', fromDeg: 80 } });
      leaf('fan', { r: 74, stalk: 52, tone: 'deep', seed: 33 }, { x: -24 * u, y: cap - 18 * u, rot: 60, layer: MID, at: T.mid + 0.18 });
      leaf('monstera', { len: 86, stalk: 54, tone: 'mid', seed: 34 }, { x: W + 26 * u, y: cap - 30 * u, rot: -64, layer: MID, at: T.mid + 0.24, enter: { kind: 'swing', fromDeg: 70 } });
      leaf('fan', { r: 104, stalk: 64, tone: 'deep', seed: 35 }, { x: 28 * u, y: bot + 36 * u, rot: 10, layer: MID, at: T.mid + 0.12 });
      leaf('banana', { len: 230, tone: 'deep', seed: 36 }, { x: W * 0.5, y: bot + 62 * u, rot: 18, layer: MID, at: T.mid + 0.2, enter: { kind: 'rise', fromDeg: -18 } });
      leaf('monstera', { len: 96, stalk: 74, tone: 'mid', seed: 37 }, { x: W * 0.36, y: bot + 38 * u, rot: -14, layer: MID, at: T.mid + 0.3, enter: { kind: 'rise', fromDeg: 20 } });
      leaf('banana', { len: 205, tone: 'mid', seed: 38 }, { x: W * 0.62, y: bot + 52 * u, rot: -5, layer: MID, at: T.mid + 0.38, enter: { kind: 'rise', fromDeg: 14 } });
      leaf('frond', { len: 220, tone: 'deep', turn: 52, seed: 39 }, { x: W * 0.2, y: bot + 40 * u, rot: -14, layer: MID, at: T.mid + 0.26, enter: { kind: 'rise', fromDeg: -24 } });
      if (wide) {       // tablets: the names leave room either side, so mass foliage there as the landscape recipe does
        leaf('monstera', { len: 118, stalk: 70, tone: 'mid', seed: 71 }, { x: -22 * u, y: H * 0.56, rot: 72, layer: MID, at: T.mid + 0.1, enter: { kind: 'swing', fromDeg: -80 } });
        leaf('banana', { len: 230, tone: 'deep', seed: 72 }, { x: W + 24 * u, y: H * 0.62, rot: -70, layer: MID, at: T.mid + 0.22, enter: { kind: 'swing', fromDeg: 80 } });
        leaf('frond', { len: 200, tone: 'bright', turn: 40, seed: 73 }, { x: -26 * u, y: H * 0.4, rot: 64, layer: FRONT, at: T.front + 0.16, enter: { kind: 'swing', fromDeg: -90 } });
        leaf('fan', { r: 92, stalk: 70, tone: 'mid', seed: 74 }, { x: W + 20 * u, y: H * 0.44, rot: -66, layer: MID, at: T.mid + 0.3 });
        leaf('monstera', { len: 104, stalk: 80, tone: 'deep', seed: 75 }, { x: W * 0.17, y: top - 46 * u, rot: 168, layer: MID, at: T.mid + 0.14, enter: { kind: 'swing', fromDeg: -70 } });
      }

      // front layer: the brightest, biggest shapes, cropped by the frame
      leaf('banana', { len: 190, tone: 'bright', curl: 0.4, seed: 41 }, { x: -30 * u, y: top - 30 * u, rot: 150, layer: FRONT, at: T.front, enter: { kind: 'swing', fromDeg: -110 } });
      leaf('frond', { len: 210, tone: 'lime', turn: -30, seed: 42 }, { x: W + 26 * u, y: top - 22 * u, rot: -139, layer: FRONT, at: T.front + 0.12, enter: { kind: 'swing', fromDeg: 100 } });
      leaf('frond', { len: 160, tone: 'bright', turn: -50, seed: 43 }, { x: W + 16 * u, y: top - 30 * u, rot: -108, layer: FRONT, at: T.front + 0.2, enter: { kind: 'swing', fromDeg: 90 } });
      leaf('banana', { len: 204, tone: 'bright', curl: -0.3, seed: 44 }, { x: -26 * u, y: bot + 8 * u, rot: 37, layer: FRONT, at: T.front + 0.28, enter: { kind: 'swing', fromDeg: 100 } });
      leaf('frond', { len: 186, tone: 'lime', turn: 62, seed: 45 }, { x: W * 0.42, y: bot + 30 * u, rot: -8, layer: FRONT, at: T.front + 0.38, enter: { kind: 'rise', fromDeg: -30 } });

      // one small pink accent, kept clear of the Replay button in the corner
      leaf('heliconia', { len: 150, tone: 'heli', curl: -0.22, seed: 51 }, { x: Math.max(W * 0.31, 132), y: bot + 14 * u, rot: -4, layer: FRONT, at: T.front + 0.5, K: 3, enter: { kind: 'rise', fromDeg: 22 } });

      // the hero: a bird of paradise filling the free column to the right of the credits...
      var S = clamp((W - Lm.credRight - 14 * u) / 1.5, 62 * u, 112 * u);
      var headY = Math.max(Lm.namesBottom + 16 * u + S * 0.96, Lm.credTop + (Lm.copyBottom - Lm.credTop) * 0.5);
      var hero = bird({
        y: bot + 34 * u, size: S, minSize: 50 * u, flip: -1, seed: 5, at: T.bird, leavesAt: T.birdLeaves,
        headX: function (s) { return W - s * 0.36 - 5 * u; }, headY: headY,
        leaves: [                                  // (the clump is mirrored, so a negative rot leans right on screen)
          { dx: -22, len: 120, stalk: 96, rot: -24, curl: -0.2, skew: 0.2 },
          { dx: 16, len: 130, stalk: 120, rot: 13, curl: 0.18, skew: -0.2 },
          { dx: -4, len: 112, stalk: 70, rot: -46, curl: -0.3, skew: 0.1 },
          { dx: 26, len: 104, stalk: 64, rot: 36, curl: 0.25, skew: 0.2 }
        ],
        stalk: { rot: -3, curl: 0.1, tilt: -13 }
      });
      // ...and a second, half-open bloom tucked in below and to the left of it
      var S1 = hero.size, hx = W - S1 * 0.36 - 5 * u;
      bird({
        y: bot + 30 * u, size: S1 * 0.66, minSize: 30 * u, flip: -1, seed: 8, at: T.bird + 0.5, leavesAt: T.birdLeaves + 0.2,
        headX: function () { return hx - S1 * 0.56; }, headY: Math.min(headY + S1 * 1.02, bot - S1 * 0.2),
        rots: [8, 30], lens: [0.86, 0.74], petal: false,
        stalk: { rot: -4, curl: 0.12, tilt: -24 }
      });
    }

    /* --------------------------------------------------------------- LANDSCAPE */
    function landscape() {
      var top = Lm.stripe, cap = Lm.capTop, bot = H;
      placeSun(Math.min(H * 0.23, W * 0.14));
      var r = sun.r, hz = sun.horizon;

      canopy();

      // back layer: oversized leaves reaching in behind the names from both sides and from below
      back('banana', { len: 380, curl: 0.3, seed: 61 }, { x: W * 0.16, y: H * 0.5, rot: 80 });
      back('banana', { len: 400, curl: -0.28, seed: 62 }, { x: W * 0.86, y: H * 0.66, rot: -82 });
      back('fan', { r: 170, stalk: 110, seed: 64 }, { x: W * 0.4, y: bot + 70 * u, rot: -6 });
      back('frond', { len: 360, turn: 30, leaf: 0.34, seed: 63 }, { x: W * 0.62, y: bot + 40 * u, rot: 8 });
      back('monstera', { len: 200, stalk: 80, seed: 65 }, { x: W * 0.78, y: top - 60 * u, rot: 190 });
      back('banana', { len: 320, curl: 0.24, seed: 66 }, { x: W * 0.28, y: top - 50 * u, rot: 172 });

      ridge(-r * 1.62, r * 1.22, -12, 81); ridge(-r * 2.4, r * 0.82, 10, 83); ridge(r * 1.5, r * 0.9, 12, 82); ridge(r * 2.25, r * 1.28, -9, 84);
      palm({ x: sun.x - r * 0.3, y: hz + 3 * u, h: r * 1.1, lean: -17, fronds: 12, frondLen: r * 0.44, w: r * 0.055, seed: 11, at: T.palms });
      palm({ x: sun.x + r * 0.2, y: hz + 3 * u, h: r * 0.76, lean: 15, fronds: 11, frondLen: r * 0.38, w: r * 0.048, seed: 23, at: T.palms + 0.16 });
      palm({ x: sun.x + r * 0.56, y: hz + 3 * u, h: r * 0.42, lean: 9, fronds: 9, frondLen: r * 0.25, w: r * 0.036, seed: 29, at: T.palms + 0.3 });

      // mid layer — left mass
      leaf('banana', { len: 300, tone: 'deep', curl: 0.3, seed: 31 }, { x: W * 0.05, y: bot + 50 * u, rot: -7, layer: MID, at: T.mid, enter: { kind: 'rise', fromDeg: 18 } });
      leaf('fan', { r: 112, stalk: 120, tone: 'deep', seed: 33 }, { x: W * 0.14, y: bot + 40 * u, rot: 13, layer: MID, at: T.mid + 0.16 });
      leaf('monstera', { len: 118, stalk: 70, tone: 'mid', seed: 34 }, { x: -22 * u, y: H * 0.56, rot: 72, layer: MID, at: T.mid + 0.1, enter: { kind: 'swing', fromDeg: -80 } });
      leaf('banana', { len: 230, tone: 'mid', seed: 38 }, { x: W * 0.02, y: top - 30 * u, rot: 162, layer: MID, at: T.mid + 0.22, enter: { kind: 'swing', fromDeg: -70 } });
      // mid layer — right mass
      leaf('frond', { len: 250, tone: 'deep', turn: 26, seed: 32 }, { x: W + 20 * u, y: top + 6 * u, rot: -164, layer: MID, at: T.mid + 0.08, enter: { kind: 'swing', fromDeg: 80 } });
      leaf('monstera', { len: 124, stalk: 80, tone: 'deep', seed: 37 }, { x: W + 22 * u, y: H * 0.5, rot: -72, layer: MID, at: T.mid + 0.26, enter: { kind: 'swing', fromDeg: 80 } });
      leaf('fan', { r: 100, stalk: 90, tone: 'olive', seed: 35 }, { x: W * 0.975, y: bot + 40 * u, rot: -12, layer: MID, at: T.mid + 0.32 });
      leaf('banana', { len: 280, tone: 'deep', seed: 36 }, { x: W * 0.8, y: bot + 70 * u, rot: 6, layer: MID, at: T.mid + 0.2, enter: { kind: 'rise', fromDeg: -16 } });
      // low growth along the bottom, under the credits
      leaf('frond', { len: 200, tone: 'deep', turn: 58, seed: 39 }, { x: W * 0.3, y: bot + 60 * u, rot: -30, layer: MID, at: T.mid + 0.3, enter: { kind: 'rise', fromDeg: -24 } });
      leaf('frond', { len: 200, tone: 'deep', turn: -58, seed: 40 }, { x: W * 0.68, y: bot + 60 * u, rot: 28, layer: MID, at: T.mid + 0.36, enter: { kind: 'rise', fromDeg: 24 } });
      leaf('monstera', { len: 100, stalk: 50, tone: 'mid', seed: 47 }, { x: W * 0.47, y: bot + 70 * u, rot: 8, layer: MID, at: T.mid + 0.4, enter: { kind: 'rise', fromDeg: 20 } });

      // front layer
      leaf('banana', { len: 290, tone: 'bright', curl: 0.4, seed: 41 }, { x: -34 * u, y: top - 30 * u, rot: 128, layer: FRONT, at: T.front, enter: { kind: 'swing', fromDeg: -110 } });
      leaf('banana', { len: 270, tone: 'bright', curl: -0.32, seed: 44 }, { x: -30 * u, y: bot + 10 * u, rot: 34, layer: FRONT, at: T.front + 0.26, enter: { kind: 'swing', fromDeg: 100 } });
      leaf('frond', { len: 230, tone: 'lime', turn: 60, seed: 45 }, { x: W * 0.2, y: bot + 36 * u, rot: 4, layer: FRONT, at: T.front + 0.36, enter: { kind: 'rise', fromDeg: -30 } });
      leaf('frond', { len: 236, tone: 'lime', turn: -28, seed: 42 }, { x: W + 30 * u, y: top - 24 * u, rot: -150, layer: FRONT, at: T.front + 0.12, enter: { kind: 'swing', fromDeg: 100 } });
      leaf('frond', { len: 170, tone: 'bright', turn: -50, seed: 43 }, { x: W + 20 * u, y: top - 34 * u, rot: -116, layer: FRONT, at: T.front + 0.2, enter: { kind: 'swing', fromDeg: 90 } });

      leaf('heliconia', { len: 190, tone: 'heli', curl: 0.22, seed: 51 }, { x: W * 0.265, y: bot + 30 * u, rot: 9, layer: FRONT, at: T.front + 0.5, K: 3, enter: { kind: 'rise', fromDeg: -22 } });

      // the hero: a tall bird of paradise up the right side, its flower level with the sun
      var S = 112 * u, hx = W - (W - Lm.right) * 0.42;
      bird({
        y: bot + 40 * u, size: S, minSize: 70 * u, flip: -1, seed: 5, at: T.bird, leavesAt: T.birdLeaves,
        headX: function () { return hx; }, headY: cap - S * 0.62,
        leaves: [                                  // (the clump is mirrored, so a negative rot leans right on screen)
          { dx: -26, len: 170, stalk: 200, rot: -13, curl: -0.2, skew: 0.2 },
          { dx: 20, len: 130, stalk: 120, rot: 9, curl: 0.16, skew: -0.2 },
          { dx: 34, len: 120, stalk: 96, rot: 35, curl: 0.25, skew: 0.2 },
          { dx: -40, len: 120, stalk: 90, rot: -38, curl: -0.3, skew: 0.1 }
        ],
        stalk: { rot: 2.5, curl: 0.07, tilt: -13 }
      });
      // a second, half-open bloom in the left mass, facing the names
      var S2 = 74 * u;
      bird({
        y: bot + 30 * u, size: S2, minSize: 44 * u, flip: 1, seed: 8, at: T.bird + 0.5, leavesAt: T.birdLeaves + 0.2,
        headX: function (s) { return Math.min(W * 0.125, Lm.left - s * 1.25, Lm.credLeft - 26 * u); }, headY: cap - S2 * 0.1,
        rots: [8, 30], lens: [0.86, 0.74], petal: false,
        leaves: [
          { dx: -24, len: 120, stalk: 150, rot: -12, curl: -0.2, skew: 0.2 },
          { dx: 22, len: 104, stalk: 96, rot: 18, curl: 0.22, skew: -0.2 }
        ],
        stalk: { rot: -2, curl: -0.07, tilt: -20 }
      });
    }

    if (Lm.land) landscape(); else portrait();

    /* ---- finishing: keep leaves off the type (and mostly off the sun), make sprites, note how each node meets the wind ---- */
    /* does a plant's outline come within `pad` of the copy (or inside the sun's keep-clear circle)?
       `turn` swings it about its own pivot first, in screen space. */
    function hullHits(n, M, pad, keepSun, turn) {
      var m = nodeMatrix(n, M);
      if (turn) {
        var c = Math.cos(turn), sn = Math.sin(turn), px = m[4], py = m[5];
        m = mMul([c, sn, -sn, c, px - c * px + sn * py, py - sn * px - c * py], m);
      }
      return hullHitsAt(n, m, pad, keepSun);
    }
    /* ...tested where it rests AND at both ends of its sway, so a gust can never push a tip onto the type */
    function touches(n, M, pad, keepSun, extra) {
      if (hullHits(n, M, pad, keepSun, 0)) return true;
      var amp = n.amp * (extra || 1);
      if (!amp) return false;
      var m = nodeMatrix(n, M), ul = Math.sqrt(m[2] * m[2] + m[3] * m[3]) || 1, up = m[3] / ul, side = up >= 0 ? 1 : -1;
      return hullHits(n, M, pad, keepSun, side * amp * 1.05 * (1.75 * Math.abs(up) + 0.3)) ||       // the gust side
             hullHits(n, M, pad, keepSun, -side * amp * 1.05 * (0.5 * Math.abs(up) + 0.3));          // the lull side
    }
    function hullHitsAt(n, m, pad, keepSun) {
      var i, k, a = n.art;
      if (a) for (i = 0; i < a.hull.length; i += 2) {
        var x = m[0] * a.hull[i] + m[2] * a.hull[i + 1] + m[4], y = m[1] * a.hull[i] + m[3] * a.hull[i + 1] + m[5];
        for (k = 0; k < Lm.ko.length; k++) { var b = Lm.ko[k]; if (x > b.x0 - pad && x < b.x1 + pad && y > b.y0 - pad && y < b.y1 + pad) return true; }
        if (keepSun && y < sun.horizon) { var dx = x - sun.x, dy = y - sun.y; if (dx * dx + dy * dy < keepSun * keepSun) return true; }
      }
      for (i = 0; i < n.kids.length; i++) if (hullHitsAt(n.kids[i], nodeMatrix(n.kids[i], m), pad, keepSun)) return true;
      return false;
    }
    function prepare(n, M, sc, flipSign) {
      var m = nodeMatrix(n, M), total = sc * n.scale;
      n.wx = m[4];
      var ux = -m[2], uy = -m[3], ul = Math.sqrt(ux * ux + uy * uy) || 1;       // where this node's "up" points on screen
      n.up = -uy / ul;
      n.sBase = flipSign; n.sBend = flipSign * n.flip;
      n.j = new Float32Array(Math.max(1, n.K));
      if (n.art) {
        n.sprite = sprite(n.art, dpr * total * n.q);
        n.top = n.art.top;
        var tx = m[2] * (-n.top * 0.7) + m[4], ty = m[3] * (-n.top * 0.7) + m[5];
        var dx = tx - m[4], dy = ty - m[5];
        n.away = ((-dy) * (tx - Lm.cx) + dx * (ty - Lm.cy)) >= 0 ? 1 : -1;
      } else { n.top = 0; n.away = 1; }
      for (var i = 0; i < n.kids.length; i++) prepare(n.kids[i], m, total, flipSign * n.flip);
    }
    var farDone = 0;
    nodes.forEach(function (n) {
      if (n.fit) {
        var pad = (n.layer >= FRONT ? 12 : 9) * u, guard = 0;
        while (touches(n, null, pad, sun.r * 0.84) && guard++ < 16) n.scale *= 0.94;
      }
      if (n.layer === FAR) farDone = Math.max(farDone, n.at + 1.5);
      prepare(n, null, 1, 1);
    });
    nodes.sort(function (a, b) { return a.layer - b.layer; });                  // stable: recipe order is kept inside a layer
    pruneMemo();
    return { nodes: nodes, sun: sun, farDone: farDone, far: null };
  }

  /* ==========================================================================
     6. DRAWING THE ARTWORK
     ========================================================================== */

  /* Plant time. While the plants are being placed they tick on twelves, like cut paper
     shot frame by frame; once everything has landed the steps melt into smooth time. */
  function plantTime(t) {
    if (!CUT_FPS) return t;
    var stepped = Math.floor(t * CUT_FPS + 1e-4) / CUT_FPS;
    return lerp(stepped, t, smooth(t, T.melt, T.melt + 1.2));
  }

  /* Wind is a field, not a wiggle: a slow swell, a flutter, and gusts whose crests cross
     the frame from left to right in about three seconds. Returns roughly -0.6 .. 1.6. */
  function wind(x, tp) {
    var kx = x / L.W;
    var g1 = Math.sin((tp - T.melt - 0.9) * TAU / 10.5 - kx * 1.9 + Math.PI / 2);      // its first crest enters at the left edge 0.9s after the melt
    var g2 = Math.sin(tp * TAU / 17 - kx * 1.3 + 2.1);
    return 0.34 * Math.sin(tp * 0.83 - kx * 4.2) + 0.16 * Math.sin(tp * 1.47 - kx * 8.6 + 1.7)
         + 0.9 * Math.pow(Math.max(0, g1), 2.6) + 0.5 * Math.pow(Math.max(0, g2), 3);
  }
  /* While the poster is being assembled the leaves lie still where they are put, like cut paper, so nothing
     competes with the names, the sun and the flower. Then the breeze arrives, and never leaves. 0 .. 1 */
  var breeze = 0;
  function breezeAt(t, still) { return still ? 0 : smooth(t, T.melt, T.melt + 1.7); }
  function windOn(n, tp) { return wind(n.wx, tp) * n.up + 0.3 * Math.sin(tp * n.f1 + n.phase); }   // the field + the leaf's own idle sway
  /* The lean-away just before the names arrive (anticipation), then a springy release. */
  function kickAt(tp) {
    if (tp < T.kick) return 0;
    var out = inOutQuad(seg(tp, T.kick, 0.3));
    return out * (1 - spring(tp - (T.kick + 0.3), 5, 8.5));
  }

  function drawNode(ctx, n, tp) {
    var p = tp - n.at;
    if (p < 0) return;
    var e = n.enter, s = 1, rot = 0, sc = 1, ty = 0, wedge = 1, grow = 1, j;
    var K = n.K, lagOn = false, sd = e.d, sw = e.w, joints = n.j;

    if (p < 4) switch (e.kind) {                 // (after 4s every entrance has long since settled)
      case 'swing':  sd = sd || 8.5; sw = sw || 10; s = spring(p, sd, sw); rot = e.from * (1 - s); sc = lerp(0.6, 1, outExpo(p / 0.2)); lagOn = true; break;
      case 'rise':   sd = sd || 7; sw = sw || 9; s = spring(p, sd, sw); rot = e.from * (1 - s); ty = (1 - s) * n.top * 1.08; lagOn = true; break;
      case 'fan':    s = spring(p, 7.5, 11); sc = s; rot = (e.from || 0.5) * (1 - s); wedge = outExpo(seg(p, 0.03, 0.5)); break;
      case 'pop':    s = spring(p, e.d || 7, e.w || 9); sc = lerp(0.35, 1, s); rot = e.from * (1 - s); break;
      case 'unfurl': s = spring(p, e.d || 6, e.w || 11); rot = e.from * (1 - s); sc = lerp(0.12, 1, outExpo(p / 0.3)); break;
      case 'flick':  s = spring(p, e.d || 6.5, e.w || 14); rot = e.from * (1 - s); sc = lerp(0.1, 1, outExpo(p / 0.22)); break;
      case 'grow':   grow = outQuart(seg(p, 0, 0.85)); rot = e.from * (1 - spring(p, 3.4, 6.5)); break;        // slower: it is growing, not cutting in
      case 'tip':    s = spring(p - e.hold, e.d, e.w); rot = e.from * (1 - s); sc = lerp(0.5, 1, outCubic(seg(p, 0, e.hold + 0.25))); break;   // bud rides up closed, then tips over
    }

    var amp = n.amp * breeze * smooth(p, 0.2, 1.6);             // (a leaf that has only just landed is let go gently)
    var w = amp ? windOn(n, tp) * amp : 0;
    var kick = n.kick ? kickAt(tp) * n.kick * 0.06 * n.away : 0;

    ctx.save();
    ctx.translate(n.x, n.y);
    ctx.rotate(n.rot + rot + n.sBase * w * 0.45 + kick);
    var S = n.scale * sc;
    ctx.scale(n.flip * S, S);
    if (ty) ctx.translate(0, ty);

    // joints: the wind bends the leaf more toward its tip, and reaches the tip a beat after the base, so a
    // bend travels up the leaf; on entrance the tip lags behind the base and overshoots late
    for (j = 0; j < K; j++) {
      var wj = amp && K > 1 ? windOn(n, tp - 0.07 * (j + 1)) * amp : w;
      var bend = n.sBend * wj * 1.1 * (j + 1) / (K * (K + 1) / 2);
      if (lagOn && j > 0 && p < 2.2) {
        var lg = 0.034;
        bend += soft(e.from * (spring(p - (j - 1) * lg, sd, sw) - spring(p - j * lg, sd, sw)), n.maxJ);
      }
      joints[j] = bend;
    }

    if (K <= 1) ctx.rotate(joints[0]);
    if (n.type === 'stalk') {
      drawStalk(ctx, n, grow, tp);
    } else {
      if (n.kidsBehind) drawKids(ctx, n, tp);
      if (n.art) {
        if (wedge < 1) {                                        // fan palm snapping open: reveal through a growing wedge
          var m = n.art.meta, half = m.span / 2 * wedge + 0.02, a0 = m.ha - Math.PI / 2;
          ctx.save();
          ctx.beginPath(); ctx.moveTo(m.hx, m.hy); ctx.arc(m.hx, m.hy, m.r * 1.4, a0 - half, a0 + half); ctx.closePath();
          ctx.rect(-m.r, m.hy - 1, m.r * 2, n.top);
          ctx.clip();
          blit(ctx, n, 1);
          ctx.restore();
        } else blit(ctx, n, K);
      }
      if (!n.kidsBehind) drawKids(ctx, n, tp);
    }
    ctx.restore();
  }

  /* draw a sprite in K slices from base to tip, turning a little more at each joint (a cheap, convincing bend) */
  function blit(ctx, n, K) {
    var sp = n.sprite, r = sp.res, joints = n.j;
    if (K <= 1) { ctx.drawImage(sp.cv, -sp.ox / r, -sp.oy / r, sp.w / r, sp.h / r); return; }
    var hs = sp.oy / K, ov = Math.min(hs * 0.5, 8 * r);
    ctx.save();
    for (var j = 0; j < K; j++) {
      ctx.rotate(joints[j]);
      var y0 = j === K - 1 ? 0 : Math.floor(sp.oy - (j + 1) * hs);
      var y1 = j === 0 ? sp.h : Math.ceil(sp.oy - j * hs + ov);
      ctx.drawImage(sp.cv, 0, y0, sp.w, y1 - y0, -sp.ox / r, (y0 - sp.oy + j * hs) / r, sp.w / r, (y1 - y0) / r);
      ctx.translate(0, -hs / r);
    }
    ctx.restore();
  }
  function drawKids(ctx, n, tp) {
    for (var i = 0; i < n.kids.length; i++) drawNode(ctx, n.kids[i], tp);
  }
  /* the flower stalk grows from the ground; whatever sits on its tip rides up with it */
  function drawStalk(ctx, n, grow, tp) {
    var sp = n.sprite, r = sp.res, tip = P.at(n.art.meta.sp, grow);
    var y0 = Math.max(0, Math.floor(sp.oy + tip.y * r));
    ctx.drawImage(sp.cv, 0, y0, sp.w, sp.h - y0, -sp.ox / r, (y0 - sp.oy) / r, sp.w / r, (sp.h - y0) / r);
    for (var i = 0; i < n.kids.length; i++) {
      var k = n.kids[i], kx = k.x, ky = k.y;
      k.x = tip.x; k.y = tip.y;
      drawNode(ctx, k, tp);
      k.x = kx; k.y = ky;
    }
  }

  /* The sun rises from behind a straight horizon just above the names and comes to rest
     half-set on it. Slits (gaps — the jungle shows through) hang at fixed heights above the
     horizon, thin at the top and fat at the bottom, and drift slowly down and out forever.
     Order on the paper: sun -> palm trees, everything cut by the horizon. */
  function sunState(t, still) {
    var s = scene.sun, p = t - T.sun;
    if (p < 0) return null;
    var e = spring(p, 1.9, 1.5);                 // slow and heavy next to the snappy leaves; a breath of overshoot
    var amb = still ? 0 : smooth(t, T.end - 1.5, T.end + 2);
    return { x: s.x, y: s.y + (1 - e) * (SUN_UP * s.r + 6), r: s.r * (1 + 0.014 * amb * Math.sin(t * TAU / 12.5)) };
  }
  var slitBuf = [];
  function drawSun(ctx, st, t) {
    var s = scene.sun, hz = s.horizon, R0 = s.r, i;
    var reach = 0.66 * R0, fat = 0.115 * R0;     // how far up the slits start, and how thick they get by the horizon
    for (i = 0; i < SLITS; i++) {
      var k = (t / SLIT_LIFE + i / SLITS) % 1;   // 0 = just born (nothing yet, high up) .. 1 = gone below the horizon
      var h = fat * Math.pow(k, 0.8), mid = hz + fat / 2 - (reach + fat / 2) * Math.pow(1 - k, 1.5);
      slitBuf[i] = { k: k, y0: mid - h / 2, y1: mid + h / 2 };
    }
    slitBuf.length = SLITS;
    slitBuf.sort(function (a, b) { return a.k - b.k; });         // top to bottom
    ctx.save();
    ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, TAU); ctx.clip();
    ctx.fillStyle = COL.cemp;
    var y = st.y - st.r - 1, x0 = st.x - st.r - 1, wide = st.r * 2 + 2;
    for (i = 0; i < SLITS; i++) {                                 // the bands of sun between the slits
      if (slitBuf[i].y0 > y) ctx.fillRect(x0, y, wide, slitBuf[i].y0 - y);
      y = Math.max(y, slitBuf[i].y1);
    }
    if (hz > y) ctx.fillRect(x0, y, wide, hz - y);
    ctx.restore();
  }

  var lastArtKey = null, farCanvas = null;
  /* Once the far canopy has unfolded it never moves again, so it is baked (with the ground)
     into one picture: one blit per frame instead of fifty. */
  function bakeFar() {
    if (!farCanvas) farCanvas = document.createElement('canvas');
    if (farCanvas.width !== canvas.width || farCanvas.height !== canvas.height) { farCanvas.width = canvas.width; farCanvas.height = canvas.height; }
    var g = farCanvas.getContext('2d', { alpha: false }), nodes = scene.nodes;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = COL.ground; g.fillRect(0, 0, L.W, L.H);
    var was = breeze; breeze = 0;
    for (var i = 0; i < nodes.length && nodes[i].layer === FAR; i++) drawNode(g, nodes[i], 1e3);
    breeze = was;
    return farCanvas;
  }
  function renderArt(t, still, force) {
    if (!scene) return;
    var tp = plantTime(t), key;
    breeze = breezeAt(t, still);
    // redraw only when something on the canvas can have changed
    if (t < T.cover) key = -1;                               // paper
    else if (t < T.sun) key = tp;                            // only plants so far: redraw on their beat
    else if (t < T.end + 1.5) key = t;                       // sun, flower, the melt into smooth time: every frame
    else key = Math.floor(t * AMBIENT_FPS + 1e-4);           // the slow ambient sway
    if (!force && key === lastArtKey) return;
    lastArtKey = key;

    var W = L.W, H = L.H, i = 0, nodes = scene.nodes, c = ctx2d, N = nodes.length;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (t < T.cover) { c.fillStyle = COL.hueso; c.fillRect(0, 0, W, H); return; }   // paper, until the panels cover the frame

    // ground + far canopy
    if (tp >= scene.farDone) {
      if (!scene.far) scene.far = bakeFar();
      c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(scene.far, 0, 0); c.setTransform(dpr, 0, 0, dpr, 0, 0);
      while (i < N && nodes[i].layer === FAR) i++;
    } else {
      c.fillStyle = COL.ground; c.fillRect(0, 0, W, H);
      for (; i < N && nodes[i].layer === FAR; i++) drawNode(c, nodes[i], tp);
    }
    // the big leaves behind the names
    for (; i < N && nodes[i].layer === BACK; i++) drawNode(c, nodes[i], tp);
    // everything that lives behind the horizon: the sun, then the palm trees in front of it
    c.save(); c.beginPath(); c.rect(0, 0, W, scene.sun.horizon); c.clip();
    var st = sunState(t, still);
    if (st) drawSun(c, st, t);
    for (; i < N && nodes[i].layer === SUN; i++) drawNode(c, nodes[i], tp);
    c.restore();
    // foliage in front
    for (; i < N; i++) drawNode(c, nodes[i], tp);

    if (guideMode) {                                         // ?guides : the boxes leaves must keep out of, and the horizon
      c.lineWidth = 1; c.strokeStyle = '#E0387E';
      L.ko.forEach(function (b) { c.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0); });
      c.beginPath(); c.moveTo(0, scene.sun.horizon); c.lineTo(W, scene.sun.horizon); c.stroke();
    }
  }

  /* ==========================================================================
     7. THE TYPE AND THE SIX-COLOUR BAR  (real DOM, moved with transforms)
     ========================================================================== */
  function slideUp(el, t, start, dur) {
    var e = outExpo(seg(t, start, dur));
    setStyle(el, 'transform', e >= 1 ? 'none' : 'translate3d(0,' + ((1 - e) * 116).toFixed(2) + '%,0)');
  }
  function typeOn(el, t, start, dur) {          // set in character by character, like a teletype credit
    var n = el.textContent.length, k = Math.ceil(outCubic(seg(t, start, dur)) * n);
    setStyle(el, 'clipPath', k >= n ? 'none' : 'inset(-20% ' + ((1 - k / n) * 100).toFixed(2) + '% -20% -2%)');
  }
  /* The stripe's colour order. Now and then it re-orders itself: a new colour
     wipes slowly across each segment, one segment after the next. */
  var STRIPE = ['var(--lima)', 'var(--cempasuchil)', 'var(--barro)', 'var(--buganvilia)', 'var(--cobalto)', 'var(--olivo)'];
  var WIPE = 1.1, WIPE_STAGGER = 0.1;
  var overlays = bars.map(function (b) { return b.firstElementChild; });
  var shiftMemo = { k: 0, now: 0, was: 0 };
  function stripeShift(k) {                      // how far the order has rotated after k shuffles (seeded, so repeatable)
    if (shiftMemo.k !== k) {
      var sh = 0, was = 0;
      for (var i = 1; i <= k; i++) { was = sh; sh += 1 + Math.floor(P.mulberry32(SEED * 97 + i)() * 5); }
      shiftMemo = { k: k, now: sh, was: was };
    }
    return shiftMemo;
  }
  function stripeBusy(t) {                       // is a re-ordering in progress?
    return t >= T.shuffleFirst && (t - T.shuffleFirst) % T.shuffleEvery < WIPE + 5 * WIPE_STAGGER + 0.1;
  }
  function renderStripe(t, still) {
    var k = still || t < T.shuffleFirst ? 0 : Math.floor((t - T.shuffleFirst) / T.shuffleEvery) + 1;
    var since = k ? t - (T.shuffleFirst + (k - 1) * T.shuffleEvery) : 99;
    var sh = stripeShift(k), now = sh.now, was = sh.was;
    for (var i = 0; i < 6; i++) {
      var e = inOutCubic(seg(since, i * WIPE_STAGGER, WIPE));
      setStyle(bars[i], 'backgroundColor', STRIPE[((e >= 1 ? now : was) + i) % 6]);
      setStyle(overlays[i], 'backgroundColor', STRIPE[(now + i) % 6]);
      setStyle(overlays[i], 'transform', e >= 1 ? 'scaleX(0)' : 'scaleX(' + e.toFixed(4) + ')');
    }
  }

  var refocus = false;                           // Replay was activated from the keyboard: hand focus back when it returns
  function renderType(t, still) {
    var i;
    // six-colour panels -> stripe. Each panel is moved relative to its own height (which is live CSS),
    // so the bar is always in the right place even in the middle of a resize.
    for (i = 0; i < 6; i++) {
      var a = outExpo(seg(t, T.barsIn + i * T.barsStagger, T.barsInDur));
      var b = inOutExpo(seg(t, T.barsOut + i * T.barsStagger, T.barsOutDur));
      setStyle(bars[i], 'transform', a >= 1 && b >= 1 ? '' :
        'translate3d(0,calc(' + (-((1 - a) * 100.4 + b * 100)).toFixed(3) + '% + ' + b.toFixed(4) + ' * var(--stripe)),0)');
    }
    renderStripe(t, still);
    // names
    slideUp(words.kyle, t, T.kyle, T.wordDur);
    slideUp(words.daina, t, T.daina, T.wordDur);
    var pa = t - T.amp, sa = spring(pa, 6.5, 9), ea = outExpo(seg(t, T.amp, 0.7));
    setStyle(words.amp, 'transform', pa > 2.5 ? 'none' : 'translate3d(0,' + ((1 - ea) * 116).toFixed(2) + '%,0) rotate(' + ((1 - sa) * -22).toFixed(2) + 'deg)');
    slideUp(words.lede, t, T.lede, 0.7);
    // credits
    typeOn(typed.place, t, T.credits, 0.5);
    typeOn(typed.date, t, T.credits + 0.3, 0.4);
    var es = outExpo(seg(t, T.credits + 0.62, 0.6));
    setStyle(typed.soon, 'clipPath', es >= 1 ? 'none' : 'inset(0 ' + ((1 - es) * 100).toFixed(2) + '% 0 0)');
    // replay
    var show = t >= T.end && !still;
    if (replayBtn.hidden === show) {
      replayBtn.hidden = !show;
      if (show && refocus) { refocus = false; replayBtn.focus({ preventScroll: true }); }
    }
    if (show) {
      var er = outExpo(seg(t, T.end, 0.6));
      setStyle(replayBtn, 'transform', er >= 1 ? 'none' : 'translate3d(0,' + ((1 - er) * 18).toFixed(1) + 'px,0)');
      setStyle(replayBtn, 'opacity', er >= 1 ? '' : er.toFixed(3));
    }
  }

  var typeAtRest = false;
  function render(t, force) {
    if (!scene) return;
    var still = reducedMQ.matches;
    if (still) t = T.end + 0.4;                 // reduced motion: the finished poster, no intro, no sway
    // once the intro has settled the type is at rest; only the stripe's occasional re-ordering touches the DOM
    var busy = t < T.end + 1 || stripeBusy(t);
    if (force || busy || !typeAtRest) renderType(t, still);
    typeAtRest = !busy;
    renderArt(t, still, force);
  }

  /* ==========================================================================
     8. THE CLOCK
     ========================================================================== */
  var clock = { t: 0, playing: false, origin: 0, raf: 0, fresh: false, last: 0 };
  function tick(now) {
    clock.raf = 0;
    if (!clock.playing) return;
    if (clock.fresh) { clock.origin = now - clock.t * 1000; clock.fresh = false; }     // the film starts on the first frame that is actually shown
    else if (now - clock.last > 250) clock.origin += now - clock.last - 16;            // a stalled tab pauses the film instead of skipping it
    clock.last = now;
    clock.t = Math.max(0, (now - clock.origin) / 1000);
    try { render(clock.t); } catch (err) { fail(err); return; }
    clock.raf = requestAnimationFrame(tick);
  }
  function play(from) {
    if (from != null) clock.t = from;
    clock.fresh = true; clock.playing = true;
    if (!clock.raf && !document.hidden) clock.raf = requestAnimationFrame(tick);
  }
  function pause() {
    clock.playing = false;
    if (clock.raf) { cancelAnimationFrame(clock.raf); clock.raf = 0; }
  }
  function seek(t) { pause(); clock.t = Math.max(0, +t || 0); render(clock.t, true); }

  /* If anything ever goes wrong while drawing, stop and show the plain finished poster
     (the stylesheet's resting state) rather than a frozen half-built frame. */
  function fail(err) {
    pause(); scene = null;
    root.classList.remove('js', 'booting');
    stage.style.display = 'none';
    [].forEach.call(document.querySelectorAll('[data-reveal],[data-type],.bars span,.bars i'), function (el) {
      el.style.transform = ''; el.style.clipPath = ''; el.style.backgroundColor = '';
      el._transform = el._clipPath = el._backgroundColor = undefined;
    });
    replayBtn.hidden = true;
    if (window.console && console.error) console.error(err);
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { if (clock.raf) { cancelAnimationFrame(clock.raf); clock.raf = 0; } }
    else if (clock.playing) play();             // pick up exactly where we left off
  });
  replayBtn.addEventListener('click', function () { refocus = document.activeElement === replayBtn; play(0); });
  function onMotionPref() {
    if (!scene) return;
    if (reducedMQ.matches) { pause(); render(clock.t, true); }
    else if (frozenAt == null) play(Math.max(clock.t, T.end + 0.4));
  }
  if (reducedMQ.addEventListener) reducedMQ.addEventListener('change', onMotionPref);
  else if (reducedMQ.addListener) reducedMQ.addListener(onMotionPref);

  /* ---- sizing ---- */
  function layout() {
    var W = stage.clientWidth, H = stage.clientHeight;
    if (W < 2 || H < 2) return false;           // not on screen yet (hidden frame): wait for a real size
    L = measure();
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR, Math.sqrt(MAX_PIXELS / (L.W * L.H)));
    var w = Math.round(L.W * dpr), h = Math.round(L.H * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    scene = specimenMode ? null : buildScene(L);
    if (specimenMode) specimens(); else render(clock.t, true);
    return true;
  }
  /* Re-compose on the very next frame after any size change (no debounce: a stale frame would
     show the old picture cropped under freshly re-flowed type). */
  var layoutQueued = false, started = false;
  function queueLayout() {
    if (layoutQueued || !started) return;
    layoutQueued = true;
    requestAnimationFrame(function () {
      layoutQueued = false;
      try { layout(); } catch (err) { fail(err); }
    });
  }
  function sizeChanged() {
    if (!L || stage.clientWidth !== L.W || stage.clientHeight !== L.H) queueLayout();
  }
  window.addEventListener('resize', sizeChanged);
  window.addEventListener('orientationchange', sizeChanged);
  if (window.ResizeObserver) new ResizeObserver(sizeChanged).observe(stage);

  /* ---- paper grain: one small seeded noise tile, laid over everything ---- */
  function grain() {
    var n = 180, cv = document.createElement('canvas'); cv.width = cv.height = n * 2;
    var g = cv.getContext('2d'), img = g.createImageData(n * 2, n * 2), d = img.data, r = P.mulberry32(SEED + 7);
    for (var i = 0; i < d.length; i += 4) {
      var v = r(), dark = v < 0.5;
      d[i] = dark ? 15 : 246; d[i + 1] = dark ? 20 : 241; d[i + 2] = dark ? 12 : 228;
      d[i + 3] = Math.pow(r(), 2.2) * (dark ? 24 : 15);
    }
    g.putImageData(img, 0, 0);
    document.querySelector('.grain').style.backgroundImage = 'url(' + cv.toDataURL() + ')';
  }

  /* ---- ?specimens : every plant on its own, for editing plants.js ---- */
  function specimens() {
    var W = L.W, H = L.H, c = ctx2d;
    copyEl.style.display = 'none';
    barsEl.style.display = 'none';
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = COL.ground; c.fillRect(0, 0, W, H);
    var k = Math.min(W / 1440, H / 900), list = [
      ['bananaLeaf', { len: 300 * k, seed: 41, tone: TONE.bright }], ['bananaLeaf', { len: 280 * k, seed: 36, tone: TONE.deep }],
      ['bananaLeaf', { len: 260 * k, seed: 61, tone: TONE.back }], ['palmFrond', { len: 320 * k, turn: rad(60), seed: 45, tone: TONE.lime }],
      ['palmFrond', { len: 300 * k, turn: rad(-36), seed: 42, tone: TONE.bright }], ['fanPalm', { r: 130 * k, stalk: 110 * k, seed: 35, tone: TONE.deep }],
      ['fanPalm', { r: 120 * k, stalk: 100 * k, seed: 33, tone: TONE.olive }], ['monstera', { len: 170 * k, stalk: 110 * k, seed: 37, tone: TONE.mid }],
      ['monstera', { len: 160 * k, stalk: 100 * k, seed: 34, tone: TONE.bright }], ['bananaLeaf', { len: 150 * k, stalk: 150 * k, form: 'paddle', tears: 0, seed: 66, tone: TONE.sage }],
      ['heliconia', { len: 260 * k, seed: 4, tone: TONE.heli }]
    ];
    var cols = 6, cw = W / cols, ch = H / 2;
    list.forEach(function (it, i) {
      var a = P[it[0]](it[1]), sp = sprite(a, dpr), x = (i % cols + 0.5) * cw, y = (Math.floor(i / cols) + 0.93) * ch;
      c.drawImage(sp.cv, x - sp.ox / sp.res, y - sp.oy / sp.res, sp.w / sp.res, sp.h / sp.res);
    });
    // a palm tree and a bird of paradise, assembled
    var pt = P.palmTree({ h: 330 * k, lean: rad(24), w: 13 * k, fronds: 12, frondLen: 150 * k, seed: 11, tone: TONE.mid });
    var bx = W * 0.93 - 60 * k, by = H * 0.96, ts = sprite(pt.trunk, dpr);
    c.drawImage(ts.cv, bx - ts.ox / ts.res, by - ts.oy / ts.res, ts.w / ts.res, ts.h / ts.res);
    pt.fronds.forEach(function (f) {
      var s2 = sprite(f.art, dpr);
      c.save(); c.translate(bx + pt.crown.x, by + pt.crown.y); c.rotate(f.rot);
      c.drawImage(s2.cv, -s2.ox / s2.res, -s2.oy / s2.res, s2.w / s2.res, s2.h / s2.res); c.restore();
    });
    var S = 150 * k, hx = W * 0.5 + cw * 0.2, hy = H * 0.3;
    var stalk = sprite(P.strelitziaStalk({ h: 300 * k, w: S * 0.085, curl: 0.1, tone: TONE.stalk }), dpr);
    c.drawImage(stalk.cv, hx - stalk.ox / stalk.res, hy + 300 * k - stalk.oy / stalk.res, stalk.w / stalk.res, stalk.h / stalk.res);
    c.save(); c.translate(hx, hy); c.rotate(rad(-13));
    [-16, 5, 25, 44].forEach(function (rt, j) {
      var s3 = sprite(P.strelitziaSepal({ len: S * [0.84, 0.98, 0.88, 0.7][j], seed: 35 + j, curl: (j - 1.5) * 0.14, tone: TONE.sepal }), dpr);
      c.save(); c.translate(S * (0.04 + 0.09 * j), -S * 0.035); c.rotate(rad(rt));
      c.drawImage(s3.cv, -s3.ox / s3.res, -s3.oy / s3.res, s3.w / s3.res, s3.h / s3.res); c.restore();
    });
    var pe = sprite(P.strelitziaPetal({ len: S * 0.84, tone: TONE.petal }), dpr);
    c.save(); c.translate(S * 0.4, -S * 0.035); c.rotate(rad(60));
    c.drawImage(pe.cv, -pe.ox / pe.res, -pe.oy / pe.res, pe.w / pe.res, pe.h / pe.res); c.restore();
    var spa = sprite(P.strelitziaSpathe({ size: S, tone: TONE.spathe }), dpr);
    c.drawImage(spa.cv, -spa.ox / spa.res, -spa.oy / spa.res, spa.w / spa.res, spa.h / spa.res);
    c.restore();
  }

  /* ---- start: wait for the three typefaces (1.5s at most), then build and roll ---- */
  function start() {
    if (started) return;
    try {
      var lateScript = !root.classList.contains('js');   // the 4s fallback in index.html already showed the plain poster
      if (lateScript) root.classList.add('js', 'late');
      grain();
      started = true;
      if (!layout()) { started = false; return waitForSize(); }
      root.classList.remove('booting');
      window.__timeline = { duration: T.end, seek: seek, play: function () { play(); }, pause: pause };
      if (specimenMode) return;
      if (frozenAt != null || reducedMQ.matches) seek(frozenAt != null ? frozenAt : T.end + 0.4);
      else if (lateScript) play(T.end + 1);              // do not blank a page the guest is already reading: join at the ambient loop
      else { render(0, true); play(0); }
    } catch (err) {
      fail(err);                                         // fall back to the plain poster rather than a blank page
    }
  }
  function waitForSize() {                               // loaded while hidden at 0x0: start when there is something to draw on
    if (!window.ResizeObserver) return;
    var ro = new ResizeObserver(function () {
      if (stage.clientWidth >= 2 && stage.clientHeight >= 2) { ro.disconnect(); start(); }
    });
    ro.observe(stage);
  }
  var fonts = document.fonts, wanted = ['400 1em "Instrument Serif"', 'italic 400 1em "Instrument Serif"',
    '600 1em "Bricolage Grotesque"', '400 1em "Space Mono"', '700 1em "Space Mono"'];
  if (fonts && fonts.load) {
    var late = false;
    Promise.all(wanted.map(function (f) { return fonts.load(f).catch(function () {}); })).then(function () {
      if (late) queueLayout(); else start();    // fonts arrived after the timeout: re-measure the type
    });
    setTimeout(function () { late = true; start(); }, 1500);
  } else start();
})();
