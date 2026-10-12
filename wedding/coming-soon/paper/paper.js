/* ==========================================================================
   paper.js — "Paper Jungle", the coming-soon film for Kyle & Daina
   ==========================================================================

   WHAT THIS IS
   A cut-paper jungle that grows in, parts around the names, and then just
   lives there in the breeze. Everything on the canvas is a pure function of
   one number, t (seconds since the start). Nothing is random at draw time.

   THE TIMELINE   (edit the numbers in `T` just below)
   ------------------------------------------------------------------------
   ACT 1  grow
     0.00          blank bone paper, a beat of stillness
     0.10 - 1.2    two palm trees shoot up from the bottom corners; their
                   crowns ride up as a bud and burst open at the top
     0.24 - 2.0    leaves unfurl, back layer first, the growth sweeping
                   clockwise round the frame from the bottom-left corner
     0.75 - 2.1    behind them the dark back sheet of jungle closes in
     0.94 - 2.1    the huge foreground leaves swing in across the middle:
                   the screen is now all green
     2.0  - 2.3    a short held beat, nearly still
   ACT 2  reveal
     2.15 - 2.9    anticipation: the air draws back and every leaf leans in
                   a little further, left side first
     2.60 - 3.6    the gust rolls left to right and the foliage parts;
                   the biggest leaves are the heaviest and peel away last
     3.48 - 4.3    "Kyle"  "&"  "Daina" rise out of their slots, one by one
                   (all three are readable by about 4.3)
   ACT 3  settle  (information first, then one flourish at a time)
     4.30          "are getting married" and the six-colour bar
     4.75 - 5.5    place, then date, type on
     5.50          the "Coming soon" label is pressed down
     5.05 - 7.0    birds of paradise rise and bloom: the beak tips level,
                   the orange sepals flick up one after another, cobalt last
     6.65 - 8.2    the papel picado drops in between the palms and swings
                   to rest
     8.80          intro over: Replay appears. From here it runs forever:
                   gusts travel across the leaves, the flags flutter, a
                   flower nods, and every ~14 s one leaf lets go and drifts down.

   WHERE TO CHANGE THINGS
   - Names, place, date, "Coming soon":  index.html (plain text, nothing here)
   - Type sizes and colours:             paper.css
   - Timing:                             `T` below
   - How many leaves / which greens:     `LAYERS` below
   - A different jungle altogether:      change `SEED`
   - How each plant is drawn:            plants.js

   HOW IT IS BUILT  (section numbers match the code below)
   5  the copy is measured and turned into keep-clear zones
   6  the scene is planted round those zones, once per screen size: back sheet,
      shutters, palms, three layers of leaves, the big "hero" leaves, flowers,
      flags. Every part is cut to a sprite once; nothing is re-drawn from scratch.
   7  each frame only moves those sprites: draw order is back to front by `z`
   8  the HTML copy is driven by the same clock
   9  the clock, Replay, resize, and a watchdog that lowers resolution if a
      device is steadily slow

   DEBUGGING
   - ?t=3.2          renders exactly that frame and stays frozen there
   - ?debug          draws the keep-clear zones round the copy, logs leaf counts
   - window.__timeline = { duration, seek(t), play(), pause() }
     (seek moves a frozen page to another frame; play un-freezes it)
   ========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  var cleanup = null;                          // set by main(): stops the clock and un-styles the copy
  function giveUp(err) {                       // any failure: fall back to the plain, static copy
    try { if (cleanup) cleanup(); } catch (e) { /* nothing more to do */ }
    root.className = root.className.replace(/\s*\b(js|live)\b/g, '');
    if (window.console && console.warn) console.warn('Paper Jungle could not start:', err);
  }

  try { main(); } catch (err) { giveUp(err); }

  function main() {
    var PP = window.PaperPlants;
    if (!PP) throw new Error('plants.js did not load');
    // If the 5 s safety net in index.html has already shown the plain copy, leave it
    // showing and let the jungle arrive around it (no intro): see START at the bottom.
    var lateStart = !/\bjs\b/.test(root.className);
    if (lateStart) root.className += ' js live';
    var DEG = PP.DEG, clamp = PP.clamp, lerp = PP.lerp, smooth = PP.smooth, head = PP.head, makeRng = PP.makeRng;
    var TAU = Math.PI * 2;

    /* ------------------------------------------------------------------
       1. SETTINGS
       ------------------------------------------------------------------ */
    var SEED = 2027;

    var T = {
      palms: 0.10,         // palm trunks start rising, crowns riding up with them
      back: 0.24,          // each layer of leaves starts unfurling...
      mid: 0.50,
      front: 0.74,
      hero: 0.94,
      sweep: 0.65,         // ...and takes this long to travel round the frame
      grow: 1.0,           // one leaf, base to tip
      wall: 0.75,          // dark back sheet starts closing in
      gust: 2.60,          // the gust reaches the left edge
      gustTravel: 0.28,    // and the right edge this much later
      names: 3.48,         // first word starts to rise
      nameStagger: 0.16,
      nameDur: 0.95,
      sub: 4.30,           // "are getting married" + the colour bar
      meta: 4.75,          // place, then date
      tag: 5.50,           // "Coming soon"
      blooms: 5.05,        // first bird of paradise starts up
      bloomStagger: 0.18,
      picado: 6.65,
      end: 8.8             // intro length; Replay appears here
    };

    var INK = { lima: '#B8D430', cempasuchil: '#F2A33C', barro: '#C4562F', buganvilia: '#E0387E', cobalto: '#2B4FC4', olivo: '#6E7A3A', hueso: '#F6F1E4', tinta: '#20241C' };
    var SIX = [INK.lima, INK.cempasuchil, INK.barro, INK.buganvilia, INK.cobalto, INK.olivo];

    var TEXT = 1, PICADO = 2, CROWN = 4;       // kinds of keep-clear zone

    /* Depth layers, back to front. Sizes and distances are in U (see measure()).
       pad    how far this layer keeps back from the copy (nearer layers stay further out)
       every  one plant every this many U along the edge of the screen
       wind   how far it sways (radians per unit of wind): near layers move more
       close  how far it leans over the middle before the gust parts it
       f, d   the spring it parts on: frequency (Hz) and damping. Lower f = heavier.
       sh     drop shadow: offset x/y, opacity, softness */
    var LAYERS = [
      { id: 'back', size: 1.0, pad: 0.06, padJit: 0.26, every: 2.3, wind: 0.030, close: 0.5, f: 0.95, d: 3.6,
        sh: { x: 0.03, y: 0.045, a: 0.24, blur: 0.05 }, mask: TEXT,
        cols: ['#B8D430', '#9CC63A', '#7FB23A', '#6EA63D', '#A6CB34', '#5BA348', '#8FBE38'], bop: ['#8E9A52', '#7C8A4E'] },
      { id: 'mid', size: 1.2, pad: 0.34, padJit: 0.36, every: 2.5, wind: 0.042, close: 0.7, f: 0.85, d: 3.3,
        sh: { x: 0.045, y: 0.07, a: 0.28, blur: 0.075 }, mask: TEXT | PICADO,
        cols: ['#4C9A4A', '#3E8E4A', '#2E7D46', '#5BA348', '#357F3F', '#6E7A3A'], bop: ['#6E7A3A', '#5F7446'] },
      { id: 'front', size: 1.42, pad: 0.66, padJit: 0.4, every: 3.0, wind: 0.055, close: 0.7, f: 0.78, d: 3.1,
        sh: { x: 0.06, y: 0.1, a: 0.32, blur: 0.1 }, mask: TEXT | PICADO,
        cols: ['#1F5A36', '#256B3C', '#17402A', '#2E7D46', '#1F5A36'], bop: ['#566B3F', '#4A5F3A'] },
      { id: 'hero', size: 2.0, pad: 0.26, padJit: 0.16, every: 0, wind: 0.06, close: 1, f: 0.6, d: 3.0,
        sh: { x: 0.08, y: 0.13, a: 0.36, blur: 0.14 }, mask: TEXT | PICADO | CROWN,
        cols: ['#17402A', '#123624', '#1F5A36', '#0F2A1D'], bop: ['#4A5F3A'] }
    ];
    var WALL = '#10301F';
    var TRUNK = '#8F7644';
    var CROWN_COLS = ['#4C9A4A', '#5BA348', '#3E8E4A', '#6EA63D', '#7FB23A', '#2E7D46', '#8FBE38'];

    /* ------------------------------------------------------------------
       2. SMALL MATHS
       ------------------------------------------------------------------ */
    function prog(t, start, dur) { return clamp((t - start) / dur); }
    function expoOut(p) { return p >= 1 ? 1 : 1 - Math.pow(2, -10 * p); }
    function quintOut(p) { return 1 - Math.pow(1 - p, 5); }
    function quartOut(p) { return 1 - Math.pow(1 - p, 4); }
    function cubicOut(p) { return 1 - Math.pow(1 - p, 3); }
    function cubicInOut(p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }
    function backOut(p, s) { s = s === undefined ? 1.7 : s; p = clamp(p) - 1; return 1 + p * p * ((s + 1) * p + s); }
    /* A damped spring: goes 0 -> 1, overshoots, settles. tau in seconds. */
    function spring(tau, freq, damp) {
      if (tau <= 0) return 0;
      var w = TAU * freq;
      return 1 - Math.exp(-damp * tau) * (Math.cos(w * tau) + damp / w * Math.sin(w * tau));
    }
    function hTo(dx, dy) { return Math.atan2(dx, -dy); }                  // heading of a vector
    function wrap(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }
    function mixAngle(a, b, k) { return a + wrap(b - a) * k; }

    /* ------------------------------------------------------------------
       3. THE PAGE
       ------------------------------------------------------------------ */
    var stage = document.getElementById('stage');
    var canvas = document.getElementById('scene');
    var ctx = canvas.getContext('2d', { alpha: false });
    var els = {
      names: document.querySelector('.names'),
      lines: [].slice.call(document.querySelectorAll('.names .ln-in')),
      sub: document.querySelector('.sub'),
      bar: document.querySelector('.bar'),
      chips: [].slice.call(document.querySelectorAll('.bar i')),
      meta: [].slice.call(document.querySelectorAll('.meta')),
      tag: document.querySelector('.tag'),
      replay: document.getElementById('replay')
    };

    var query = new URLSearchParams(location.search);
    var frozen = query.has('t') ? Math.max(0, parseFloat(query.get('t')) || 0) : null;
    var debug = query.has('debug');
    var mqReduced = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    var mqLand = window.matchMedia ? window.matchMedia('(min-aspect-ratio: 5/4)') : null;
    var mqShort = window.matchMedia ? window.matchMedia('(max-height: 480px)') : null;
    var reduced = !!(mqReduced && mqReduced.matches);
    var REST_T = T.end + 3;                    // the settled frame used for reduced motion

    var W = 0, H = 0, dpr = 1, U = 100, SR = 1;   // stage size, pixel ratio, layout unit, sprite resolution
    var portrait = true, PADK = 1;                // PADK < 1 on narrow screens: everything may sit closer to the copy
    var quality = 1, cpx0 = 1, cpx = 1;           // cpx = canvas pixels per CSS pixel (cpx0, less if the device struggles)
    var view = { k: 1, x: 0, y: 0, w: 0, h: 0 };  // how the planted scene sits on the stage (CSS px): scale, offset, stage size
    var vs = 1, vox = 0, voy = 0;                 // the same thing in canvas pixels
    var scene = null, ready = false;
    var windOn = reduced ? 0 : 1;

    /* ------------------------------------------------------------------
       4. WIND — a field, not a wiggle
       A slow swell, plus gusts whose front travels left to right, so the
       phase depends on x and a breeze visibly rolls across the scene.
       ------------------------------------------------------------------ */
    function gustShape(p) {                     // p = seconds since the front passed this spot
      if (p <= 0) return 0;
      var a = p / 0.85;
      return a * Math.exp(1 - a) * (1 + 0.3 * Math.sin(p * 4.6) * Math.exp(-p * 0.45));
    }
    function inhale(p) {                        // the breath in before the big gust: the air draws back, then hits
      if (p <= -0.5) return 0;
      return p < 0 ? smooth((p + 0.5) / 0.42) : Math.exp(-p * 11);
    }
    function gustTrain(t, xn, period, travel, offset) {
      var local = (t - offset - xn * travel) / period;
      return gustShape((local - Math.floor(local)) * period);
    }
    function wind(x, t) {
      if (!windOn) return 0;
      var xn = x / W;
      var w = 0.20 * Math.sin(t * 0.63 + xn * 2.2) + 0.12 * Math.sin(t * 1.07 - xn * 3.1 + 1.7) + 0.06 * Math.sin(t * 1.9 + xn * 5.0);
      var ambient = smooth((t - 7.2) / 2.2);
      w += ambient * (0.9 * gustTrain(t, xn, 11.3, 2.4, 10.2) + 0.55 * gustTrain(t, xn, 17.9, 3.3, 15.5));
      var pg = t - T.gust - xn * T.gustTravel;                           // the gust that parts the jungle
      w += 2.2 * gustShape(pg) - 1.25 * inhale(pg);
      return w / (1 + Math.abs(w) / 4);                                  // big gusts saturate: leaves bow, they do not flail into the copy
    }

    /* ------------------------------------------------------------------
       5. KEEP-CLEAR ZONES
       The copy is real HTML. We measure where it sits and the jungle is
       planted around it, so no leaf ever crosses a letter.
       ------------------------------------------------------------------ */
    var zones = [], CB = null, C = null, RB = null, anchor = [0, 0], builtRects = null, builtKey = '';

    function hit(x, y, pad, mask) {
      for (var i = 0; i < zones.length; i++) {
        var z = zones[i];
        if (!(z.m & mask)) continue;
        var dx = Math.abs(x - z.cx) / (z.rx + pad), dy = Math.abs(y - z.cy) / (z.ry + pad);
        if (dx < 1 && dy < 1 && dx * dx * dx * dx + dy * dy * dy * dy < 1) return true;
      }
      return false;
    }
    function zoneOf(r, px, py, m) {
      return { cx: (r.x0 + r.x1) / 2, cy: (r.y0 + r.y1) / 2, rx: (r.x1 - r.x0) / 2 * 1.08 + px, ry: (r.y1 - r.y0) / 2 * 1.06 + py, m: m };
    }

    function sizeCanvas() {
      cpx = cpx0 * quality;
      vs = cpx * view.k; vox = view.x * cpx; voy = view.y * cpx;
      canvas.width = Math.max(1, Math.round(view.w * cpx)); canvas.height = Math.max(1, Math.round(view.h * cpx));
      ctx.fillStyle = INK.hueso; ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    function rectOf(el) {
      var sr = stage.getBoundingClientRect(), r = el.getBoundingClientRect();
      return { x0: r.left - sr.left, y0: r.top - sr.top, x1: r.right - sr.left, y1: r.bottom - sr.top };
    }
    /* Where each piece of copy sits. Layout only: call it with the copy un-animated. */
    function copyRects() { return els.lines.map(rectOf).concat([rectOf(els.sub), rectOf(els.bar)], els.meta.map(rectOf), [rectOf(els.tag)]); }
    function anchorNow() { var r = rectOf(els.names); return [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2]; }
    /* A fingerprint of how the copy is laid out (which breakpoint, and how big each piece
       is). Sizes come from the layout boxes, so they are right even in mid-animation. */
    function layoutKey() {
      return (mqLand && mqLand.matches ? 'L' : 'P') + (mqShort && mqShort.matches ? 's' : '') +
        [els.names, els.sub, els.meta[0], els.tag].map(function (el) { return el.offsetWidth + 'x' + el.offsetHeight; }).join('|');
    }

    function measure() {
      W = stage.clientWidth; H = stage.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      U = 0.09 * (W + H);
      portrait = H > W * 1.05;
      SR = Math.min(dpr, Math.max(0.6, 300 / U));        // big screens: leaves are huge, so cap their texture size...
      cpx0 = Math.min(dpr, Math.max(1.25, SR * 1.25));   // ...and do not draw the canvas much finer than the leaves are
      view.k = 1; view.x = 0; view.y = 0; view.w = W; view.h = H;
      sizeCanvas();

      clearCopyStyles();
      var rects = copyRects(), m0 = rectOf(els.meta[0]);
      builtRects = rects; builtKey = layoutKey(); anchor = anchorNow();
      CB = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };
      rects.forEach(function (r) {
        CB.x0 = Math.min(CB.x0, r.x0); CB.y0 = Math.min(CB.y0, r.y0); CB.x1 = Math.max(CB.x1, r.x1); CB.y1 = Math.max(CB.y1, r.y1);
      });
      CB.cx = (CB.x0 + CB.x1) / 2; CB.cy = (CB.y0 + CB.y1) / 2; CB.w = CB.x1 - CB.x0; CB.h = CB.y1 - CB.y0;
      CB.subW = m0.x1 - m0.x0;
      // On a phone the names nearly fill the width. Whatever room is left at the sides
      // decides how close the foliage may come, so the long sides still get a thick frame.
      PADK = clamp(Math.min(CB.x0, W - CB.x1) / (1.4 * U), 0.4, 1);
      zones = rects.map(function (r) { return zoneOf(r, 0.17 * U * Math.max(0.6, PADK), 0.11 * U, TEXT); });
      RB = reduced ? null : rectOf(els.replay);          // flowers keep out from under the Replay button
      if (RB && RB.x1 - RB.x0 < 2) RB = null;
    }

    /* ------------------------------------------------------------------
       6. BUILDING THE SCENE (once per screen size)
       ------------------------------------------------------------------ */
    function mkCanvas(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
    /* Every canvas a scene makes is noted, so the memory can be handed back when the jungle is re-planted. */
    function own(s, sp) { s.canvases.push(sp.img); s.bytes += sp.img.width * sp.img.height * 4; return sp; }
    function release(s) { if (s) s.canvases.forEach(function (c) { c.width = c.height = 0; }); }

    function sweepOf(x, y) {                    // 0..1 clockwise round the frame, starting at the bottom-left corner
      var cx = clamp(x, 0, W), cy = clamp(y, 0, H);
      var dl = cx, dr = W - cx, dt = cy, db = H - cy, m = Math.min(dl, dr, dt, db), d;
      if (m === dl) d = H - cy;                          // up the left edge
      else if (m === dt) d = H + cx;                     // across the top
      else if (m === dr) d = H + W + cy;                 // down the right edge
      else d = 2 * H + W + (W - cx);                     // back along the bottom
      return d / (2 * (W + H));
    }

    function build() {
      release(scene); scene = null;             // hand the old jungle's memory back before growing a new one
      measure();
      var s = { items: [], leaves: [], trees: [], canvases: [], bytes: 0 };
      s.grain = PP.grainTile(SEED + 7, 180);

      planTrees(s, makeRng(SEED + 31));         // where the palms stand: the bunting hangs between them
      var pic = planPicado(s);                  // its zone is needed before planting

      // the clearing: everything that must stay paper
      C = { x0: CB.x0, x1: CB.x1, y0: pic.y, y1: CB.y1 };
      C.cx = (C.x0 + C.x1) / 2; C.cy = (C.y0 + C.y1) / 2; C.w = C.x1 - C.x0; C.h = C.y1 - C.y0;

      buildPaper(s);
      buildFlowers(s);
      buildWall(s, makeRng(SEED + 23));
      plantShutters(s, makeRng(SEED + 43));
      growCrowns(s, makeRng(SEED + 37));
      for (var li = 0; li < 3; li++) plantLayer(s, li, makeRng(SEED + 100 + li * 17));
      plantHeroes(s, makeRng(SEED + 61));
      // every bird of paradise gets its own upright grey-green paddle leaves behind it
      var fr = makeRng(SEED + 67);
      s.flowers.forEach(function (f, i) {
        if (i > 1) return;
        clump(s, 2, 'bop', [f.rootX - f.dir * 0.2 * U, H + 0.45 * U], -f.dir * 0.16, 0.95 * U, fr, T.front + 0.8 + i * 0.1, { mask: TEXT, pad: [0.1, 0.3] });
      });
      buildPicado(s, pic, makeRng(SEED + 71));
      buildDrift(s);

      // draw order, back to front
      var it = s.items;
      it.push({ z: 1, kind: 'wall' });
      s.trees.forEach(function (tr) {
        it.push({ z: 2.95, kind: 'trunk', o: tr });        // in front of the pale back layer, woven behind the rest
        it.push({ z: 4.38, kind: 'nuts', o: tr });
      });
      s.leaves.forEach(function (lf, i) { it.push({ z: (lf.z || 2 + lf.layer) + i * 1e-4, kind: 'leaf', o: lf }); });
      it.push({ z: 4.25, kind: 'string' });               // the string runs up behind the crowns...
      it.push({ z: 4.45, kind: 'picado' });               // ...the flags hang in front of them
      it.push({ z: 5.5, kind: 'flowers' });
      it.push({ z: 7, kind: 'drift' });
      it.sort(function (a, b) { return a.z - b.z; });

      // touch every sprite once so the GPU has them before they are needed
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      s.leaves.forEach(function (lf) {
        ctx.drawImage(lf.sprite.img, 0, 0, 1, 1);
        if (lf.shadow) ctx.drawImage(lf.shadow.img, 0, 0, 1, 1);
        if (lf.tip) ctx.drawImage(lf.tip.img, 0, 0, 1, 1);
        if (lf.tipShadow) ctx.drawImage(lf.tipShadow.img, 0, 0, 1, 1);
      });
      ctx.drawImage(s.paper, 0, 0, canvas.width, canvas.height);

      scene = s;
      if (debug && window.console) {
        var area = 0, mb = {};
        s.leaves.forEach(function (lf) {
          var key = lf.gone ? 'shutters' : lf.tree ? 'crowns' : LAYERS[lf.layer].id;
          [lf.sprite, lf.shadow, lf.tip, lf.tipShadow].forEach(function (q) { if (q) { if (!lf.gone) area += q.w * q.h; mb[key] = (mb[key] || 0) + q.img.width * q.img.height * 4 / 1048576; } });
        });
        mb.wall = s.wall.img.width * s.wall.img.height * 4 / 1048576; mb.paper = s.paper.width * s.paper.height * 4 / 1048576;
        console.log('[paper] MB ' + Object.keys(mb).map(function (k) { return k + '=' + mb[k].toFixed(1); }).join(' '));
        console.log('[paper] ' + W + 'x' + H + ' U=' + U.toFixed(1) + ' SR=' + SR.toFixed(2) + ' cpx=' + cpx.toFixed(2) + ' PADK=' + PADK.toFixed(2) +
          ' leaves=' + s.leaves.length + ' trees=' + s.trees.length + ' flowers=' + s.flowers.length + ' flags=' + s.pic.flags.length +
          ' canvases=' + s.canvases.length + ' spriteMB=' + (s.bytes / 1048576).toFixed(1) + ' leafOverdraw=' + (area / (W * H)).toFixed(1) + 'x');
      }
    }

    /* -- the sheet of bone paper everything sits on */
    function buildPaper(s) {
      var cv = mkCanvas(W * cpx0, H * cpx0), x = cv.getContext('2d');
      x.fillStyle = INK.hueso; x.fillRect(0, 0, cv.width, cv.height);
      var g = x.createRadialGradient(cv.width * 0.3, cv.height * 0.25, 0, cv.width * 0.5, cv.height * 0.5, Math.hypot(cv.width, cv.height) * 0.62);
      g.addColorStop(0, 'rgba(255,253,244,0.55)'); g.addColorStop(0.5, 'rgba(255,253,244,0)'); g.addColorStop(1, 'rgba(160,140,90,0.10)');
      x.fillStyle = g; x.fillRect(0, 0, cv.width, cv.height);
      x.fillStyle = x.createPattern(s.grain, 'repeat'); x.fillRect(0, 0, cv.width, cv.height);
      s.paper = cv; s.canvases.push(cv);
    }

    /* -- one leaf: its geometry, where it is rooted, how it moves ---------- */
    function makeLeaf(o, r) {
      var L = LAYERS[o.layer];
      var lf = { type: o.type, layer: o.layer, B: o.B, sh: o.sh, sl: o.sl || 0, bow: o.bow || 0, bl: o.bl, tilt: o.tilt || 0, tree: o.tree || null, col: o.col };
      var bh = lf.sh + lf.bow * 0.9 + lf.tilt;                           // roughly where the blade will point
      lf.flip = o.flip || (Math.sin(bh) >= 0 ? 1 : -1);                  // so curl and bend fall with gravity
      var grav = [Math.sin(bh) * lf.flip, Math.cos(bh)];                 // "down", seen from the blade
      var geo;
      if (o.type === 'frond') {
        geo = PP.frond(r, { curl: r.range(0.75, 1.3), pairs: clamp(Math.round(o.bl / 9.5), 14, 58), lmax: r.range(0.25, 0.33), lw: r.range(0.33, 0.4), grav: grav, gAmt: 0.42, col: o.col, split: true });
      } else if (o.type === 'fan') {
        geo = PP.fan(r, { blades: r.int(8, 11) * 2 + 1, span: r.range(205, 275) * DEG, fuse: r.range(0.46, 0.56), sag: r.range(0.1, 0.2), grav: grav, col: o.col });
      } else if (o.type === 'banana') {
        geo = PP.paddle(r, { kind: 'banana', bend: o.flat ? r.range(-0.1, 0.1) : r.range(0.15, 0.5), W: o.flat ? 0.2 : r.range(0.165, 0.21), sweep: r.range(10, 18) * DEG, veinStep: clamp(8 / o.bl, 0.014, 0.04), tears: o.flat ? [0, 2] : [2, 5], col: o.col });
      } else if (o.type === 'bop') {
        geo = PP.paddle(r, { kind: 'bop', bend: r.range(0.04, 0.26), W: r.range(0.15, 0.185), sweep: 14 * DEG, veinStep: clamp(10 / o.bl, 0.022, 0.06), tears: [0, 1], col: o.col });
      } else {
        geo = PP.monstera(r, { wide: r.range(1.02, 1.2), col: o.col });
      }
      lf.geo = geo;
      var t = PP.tones(o.col);
      lf.stalkCol = PP.mix(o.col, geo.ribCol || t.rib, 0.7);
      lf.stalkW = o.bl * ({ banana: 0.058, bop: 0.03, fan: 0.032, monstera: 0.028, frond: 0 })[o.type];
      lf.amp = L.wind * r.range(0.75, 1.25) * ({ frond: 1.15, banana: 0.8, fan: 0.9, monstera: 1.0, bop: 0.6 })[o.type];
      lf.ph = r.range(0, TAU); lf.rate = r.range(0.8, 1.3);
      lf.pad = (L.pad + r() * L.padJit) * U * PADK;
      lf.fold = -lf.flip * r.range(0.35, 0.7);                           // tucked-in angle it unfurls from
      return lf;
    }

    function restPose(lf, dh) {
      var h = lf.sh + dh, d = head(h), c = head(h - lf.bow);
      var jx = lf.B[0] + d[0] * lf.sl, jy = lf.B[1] + d[1] * lf.sl;
      var cx = lf.B[0] + c[0] * lf.sl * 0.5, cy = lf.B[1] + c[1] * lf.sl * 0.5;
      return { jx: jx, jy: jy, cx: cx, cy: cy, bh: (lf.sl > 0 ? hTo(jx - cx, jy - cy) : h) + lf.tilt };
    }

    /* How much of the leaf is on screen at this pose, or -1 if it touches a zone. */
    function clearance(lf, dh, sc, pad, mask) {
      var p = restPose(lf, dh), c = Math.cos(p.bh), sn = Math.sin(p.bh), hull = lf.geo.hull, k = lf.bl * sc, on = 0, i;
      var sway = lf.amp * 1.8;                                           // room for the strongest gust
      for (i = 0; i < hull.length; i += 2) {
        var hx = hull[i] * k * lf.flip, hy = hull[i + 1] * k;
        var x = p.jx + hx * c - hy * sn, y = p.jy + hx * sn + hy * c;
        if (hit(x, y, pad + Math.hypot(hx, hy) * sway, mask)) return -1;
        if (x > 0 && x < W && y > 0 && y < H) on++;
      }
      if (lf.sl > 0) {
        for (i = 1; i <= 4; i++) {
          var u = i / 4, v = 1 - u;
          if (hit(v * v * lf.B[0] + 2 * v * u * p.cx + u * u * p.jx, v * v * lf.B[1] + 2 * v * u * p.cy + u * u * p.jy, pad * 0.6, mask & TEXT)) return -1;
        }
      }
      return on / (hull.length / 2);
    }

    /* Turn / shrink a leaf until it frames the copy instead of covering it.
       Tries the smallest change first; returns false if nothing works. */
    var TRY_ANG = [0, 7, 14, 21, 28, 35, 42, 49, 56, 63, 70, 77, 84], TRY_SC = [1, 0.86, 0.73, 0.61];
    function settle(lf, minVisible) {
      var L = LAYERS[lf.layer], best = null, p0 = restPose(lf, 0);
      // which way swings the blade away from the middle?
      var away = wrap(p0.bh - hTo(C.cx - p0.jx, C.cy - p0.jy)) >= 0 ? 1 : -1;
      for (var si = 0; si < TRY_SC.length; si++) for (var ai = 0; ai < TRY_ANG.length; ai++) for (var sg = 1; sg >= -1; sg -= 2) {
        if (ai === 0 && sg < 0) continue;
        var dh = TRY_ANG[ai] * DEG * sg * away;
        var cost = TRY_ANG[ai] / 75 + (1 - TRY_SC[si]) * 2.1 + (sg < 0 ? 0.18 : 0);
        if (best && cost >= best.cost) continue;
        var vis = clearance(lf, dh, TRY_SC[si], lf.pad, lf.mask || L.mask);
        if (vis >= minVisible) best = { dh: dh, sc: TRY_SC[si], cost: cost };
      }
      if (!best) return false;
      lf.sh += best.dh; lf.bl *= best.sc; lf.stalkW *= best.sc;
      return true;
    }

    /* Once its place is settled: cut the sprite and set up its motion. */
    function finishLeaf(s, lf, r, t0) {
      var L = LAYERS[lf.layer], p = restPose(lf, 0);
      // All but the biggest leaves carry their shadow inside their own sprite (one draw
      // per leaf per frame instead of two). The shadow has to fall down-right on screen,
      // so it is glued on at the angle the leaf will rest at.
      var glued = lf.layer < 3, seen = lf.closeTo === undefined ? p.bh : lf.closeTo;
      var cs = Math.cos(seen), sn = Math.sin(seen), vx = L.sh.x * U, vy = L.sh.y * U;
      var cut = function (geo) {
        var sp = PP.raster(geo, lf.bl, lf.gone ? SR * 0.5 : SR, { grain: s.grain, gx: r.int(0, 160), gy: r.int(0, 160) });   // (the shutters are dark, far back and brief: half resolution)
        return own(s, glued ? PP.bake(sp, L.sh.blur * U, lf.flip * (cs * vx + sn * vy), cs * vy - sn * vx, L.sh.a) : sp);
      };
      lf.sprite = cut(lf.geo);
      if (!glued) lf.shadow = own(s, PP.shadow(lf.sprite, L.sh.blur * U));
      if (lf.geo.tip) {                                                  // fronds: the outer half is its own piece
        lf.tipX = lf.geo.tip.jx * lf.bl; lf.tipY = lf.geo.tip.jy * lf.bl;
        lf.tip = cut(lf.geo.tip);
        if (!glued) lf.tipShadow = own(s, PP.shadow(lf.tip, L.sh.blur * U));
      }
      lf.wx = p.jx; lf.cosH = Math.cos(p.bh);
      // closed pose: lean over the middle of the clearing (the big leaves aim true, to seal it)
      var j = lf.layer === 3 ? 0.12 : 0.3;
      var aim = [C.cx + r.range(-j, j) * C.w, C.cy + r.range(-j, j) * C.h];
      var lim = lf.out ? 3.2 : lf.layer === 3 ? 2.2 : 1.45;
      lf.close = clamp(wrap(hTo(aim[0] - lf.B[0], aim[1] - lf.B[1]) - (lf.sl > 0 ? lf.sh : p.bh)) * L.close * (lf.closeK === undefined ? 1 : lf.closeK), -lim, lim);
      if (lf.closeTo !== undefined) lf.close = wrap(lf.closeTo - lf.sh);  // an exact closed pose was asked for
      lf.antic = Math.min(0.16, 0.17 / Math.max(0.05, Math.abs(lf.close)));     // lean in ~10 degrees at most before the gust
      lf.t0 = t0;
      // when the gust reaches it; the biggest leaves are the heaviest and let go last
      lf.tp = T.gust + clamp((p.jx + Math.sin(p.bh) * lf.bl * 0.5) / W) * T.gustTravel + r.range(0, 0.1) * (lf.layer === 3 ? 0.6 : 1) + (lf.layer === 3 ? 0.05 : 0);
      lf.geo = null;                                                     // the description is no longer needed
      s.leaves.push(lf);
    }

    /* -- the generic planting: clumps of leaves all the way round the frame */
    function perimeter(sv) {
      var d = (((sv % 1) + 1) % 1) * 2 * (W + H);
      if (d < H) return { x: 0, y: H - d, nx: 1, ny: 0, edge: 'L', f: d / H };
      d -= H; if (d < W) return { x: d, y: 0, nx: 0, ny: 1, edge: 'T', f: d / W };
      d -= W; if (d < H) return { x: W, y: d, nx: -1, ny: 0, edge: 'R', f: 1 - d / H };
      d -= H; return { x: W - d, y: H, nx: 0, ny: -1, edge: 'B', f: 1 - d / W };
    }

    function plantLayer(s, li, r) {
      var L = LAYERS[li], n = Math.round(2 * (W + H) / (L.every * U)), phase = r();
      for (var j = 0; j < n; j++) {
        var rt = perimeter((j + phase + r.range(-0.3, 0.3)) / n);
        var out = r.range(0.2, 0.55) * U, B = [rt.x - rt.nx * out, rt.y - rt.ny * out];
        var aIn = hTo(C.cx - B[0], C.cy - B[1]), size = L.size * U * r.range(0.86, 1.14), type, base;
        if (rt.edge === 'B') { type = r.weighted({ banana: 3, bop: 2, fan: 2, monstera: 1.6 }); base = mixAngle(aIn, 0, 0.6); }
        else if (rt.edge === 'T') { type = r.weighted({ frond: 3, banana: 1.6, monstera: 1.4 }); base = aIn; }
        else if (rt.f < 0.55) { type = r.weighted({ banana: 2.4, fan: 2, monstera: 2, bop: 1.2 }); base = mixAngle(aIn, 0, 0.55); }
        else { type = r.weighted({ frond: 2.4, monstera: 2, banana: 1.4, fan: 1.2 }); base = mixAngle(aIn, 0, 0.3); }
        // the lighter layers leave the palm crowns alone, so each crown reads against dark leaves
        if (li < 2 && nearCrown(s, B[0], B[1], 1.25 * U)) continue;
        var t0 = T[L.id] + sweepOf(B[0], B[1]) * T.sweep;
        clump(s, li, type, B, base, size, r, t0);
      }
    }

    function clump(s, li, type, B, base, size, r, t0, over) {
      var L = LAYERS[li], n, i, off, sg, o;
      var add = function (spec) {
        spec.layer = li; spec.type = type; spec.B = B;
        var lf = makeLeaf(spec, r);
        if (over) { lf.mask = over.mask; lf.pad = r.range(over.pad[0], over.pad[1]) * U * PADK; }
        if (settle(lf, 0.22)) finishLeaf(s, lf, r, t0 + r.range(0, 0.16) + i * 0.05);
      };
      if (type === 'banana') {
        n = r.int(2, 4);
        for (i = 0; i < n; i++) {
          off = (i - (n - 1) / 2) * r.range(24, 38) * DEG + r.range(-8, 8) * DEG; sg = off >= 0 ? 1 : -1;
          add({ sh: base + off, sl: size * r.range(0.5, 1.1), bow: sg * r.range(0.1, 0.3), bl: size * r.range(1.5, 2.2), tilt: sg * r.range(0.1, 0.35), col: r.pick(L.cols) });
        }
      } else if (type === 'bop') {
        n = r.int(3, 4);
        for (i = 0; i < n; i++) {
          off = (i - (n - 1) / 2) * r.range(11, 20) * DEG + r.range(-4, 4) * DEG; sg = off >= 0 ? 1 : -1;
          add({ sh: base + off, sl: size * r.range(1.0, 1.8), bow: sg * r.range(0.03, 0.14), bl: size * r.range(1.0, 1.35), tilt: sg * r.range(0, 0.12), col: r.pick(L.bop) });
        }
      } else if (type === 'fan') {
        n = r.int(2, 3);
        for (i = 0; i < n; i++) {
          off = (i - (n - 1) / 2) * r.range(30, 50) * DEG + r.range(-8, 8) * DEG; sg = off >= 0 ? 1 : -1;
          add({ sh: base + off, sl: size * r.range(0.9, 1.7), bow: sg * r.range(0.05, 0.2), bl: size * r.range(0.8, 1.05), tilt: sg * r.range(0, 0.2), col: r.pick(L.cols) });
        }
      } else if (type === 'monstera') {
        n = r.int(2, 4);
        for (i = 0; i < n; i++) {
          off = (i - (n - 1) / 2) * r.range(26, 44) * DEG + r.range(-8, 8) * DEG;
          o = base + off; sg = Math.sin(o) >= 0 ? 1 : -1;
          add({ sh: o, sl: size * r.range(0.7, 1.5), bow: sg * r.range(0.1, 0.3), bl: size * r.range(0.95, 1.3), tilt: sg * r.range(0.8, 1.7), col: r.pick(L.cols) });
        }
      } else {
        n = r.int(2, 4);
        for (i = 0; i < n; i++) {
          off = (i - (n - 1) / 2) * r.range(20, 34) * DEG + r.range(-6, 6) * DEG;
          add({ sh: base + off, bl: size * r.range(1.9, 2.7), col: r.pick(L.cols) });
        }
      }
    }

    /* -- palm trees ---------------------------------------------------------
       Two palms stand at the sides: a leaning, ringed trunk and a compact
       starburst crown in the top corner, drawn in front of nearly everything so
       it reads as a tree. The papel picado is strung between them.
       planTrees() only decides where they stand; growCrowns() adds the fronds. */
    function trunkAt(tr, u) {                   // a point on the trunk's centre line, 0 = foot, 1 = crown
      var v = 1 - u;
      return [v * v * tr.bx + 2 * v * u * tr.mx + u * u * tr.cx, v * v * tr.by + 2 * v * u * tr.my + u * u * tr.cy];
    }
    function trunkXAt(tr, y) {                  // where the trunk is at height y
      var prev = trunkAt(tr, 0);
      for (var i = 1; i <= 40; i++) {
        var p = trunkAt(tr, i / 40);
        if (p[1] <= y) return lerp(prev[0], p[0], clamp((prev[1] - y) / Math.max(1e-3, prev[1] - p[1])));
        prev = p;
      }
      return tr.cx;
    }
    function nearCrown(s, x, y, d) {
      return s.trees.some(function (tr) { return Math.hypot(x - tr.cx, y - tr.cy) < d; });
    }

    function planTrees(s, r) {
      var inset = portrait ? 0.7 * U : clamp(0.075 * W, 0.85 * U, 1.1 * U);          // crown, in from the side
      var top = portrait ? clamp(0.13 * H, 0.8 * U, 1.05 * U) : clamp(0.2 * H, 0.62 * U, 1.0 * U);   // and down from the top
      var flen = clamp(0.24 * H, 1.2 * U, 1.9 * U);                                  // frond length: a crown about a third of the tree
      // on a tall screen the bunting is tied to the trunks just under the crowns, so the crowns sit above it
      var lim = portrait ? Math.max(0.3 * U, CB.y0 - flagWidth() * 2.13 - 0.12 * U) : 1e9;
      var specs = [
        { side: -1, crown: [inset, Math.min(top * 1.06, lim)], n: 12, len: flen },
        { side: 1, crown: [W - inset * 0.94, Math.min(top * 0.9, lim * 0.92)], n: 12, len: flen * 1.04 }
      ];
      specs.forEach(function (sp, ti) {
        var cx = sp.crown[0], cy = sp.crown[1], by = H + 0.8 * U, bx, mx, my;
        if (portrait) {                         // no room to lean: up the edge of the frame, tipping in at the top
          bx = cx + sp.side * r.range(0.62, 0.7) * U; mx = bx - sp.side * r.range(0.04, 0.1) * U; my = lerp(by, cy, 0.6);
        } else {                                // room to swoop: leans in low, then curves up to the crown
          bx = cx + sp.side * r.range(0.6, 0.8) * U;
          mx = lerp(bx, cx, 0.35) - sp.side * r.range(0.5, 0.65) * U; my = lerp(by, cy, 0.35);
        }
        var tr = { layer: 1, side: sp.side, bx: bx, by: by, mx: mx, my: my, cx: cx, cy: cy,
          w0: 0.24 * U, w1: 0.105 * U, n: sp.n, flen: sp.len, col: TRUNK,
          t0: T.palms + ti * 0.12, amp: LAYERS[1].wind * 0.5, ph: r.range(0, TAU), px: cx, py: cy, sway: 0 };
        // a trunk never passes behind the copy: step the whole tree outward until it is clear
        var clear = function () {
          for (var i = 1; i <= 20; i++) {
            var p = trunkAt(tr, i / 20);
            if (hit(p[0], p[1], tr.w0 / 2 + 0.08 * U, TEXT)) return false;
          }
          return true;
        };
        for (var tries = 0; tries < 10 && !clear(); tries++) { tr.bx += sp.side * 0.12 * U; tr.mx += sp.side * 0.12 * U; tr.cx += sp.side * 0.12 * U; }
        if (!clear()) return;
        tr.ring = PP.darker(tr.col, 0.35); tr.shade = PP.darker(tr.col, 0.2); tr.lit = PP.mix(tr.col, '#FFF6D0', 0.3);
        s.trees.push(tr);
        zones.push({ cx: tr.cx, cy: tr.cy, rx: 0.5 * tr.flen, ry: 0.5 * tr.flen, m: CROWN });   // the big leaves keep off the crowns
      });
    }

    function growCrowns(s, r) {
      s.trees.forEach(function (tr) {
        var cols = CROWN_COLS;
        for (var i = 0; i < tr.n; i++) {
          var deg = lerp(-156, 156, (i + 0.5) / tr.n) + r.range(-7, 7), a = deg * DEG, hang = Math.abs(deg) / 156;
          // the young fronds at the top are shorter; the old ones that hang are the longest
          var lf = makeLeaf({ layer: tr.layer, type: 'frond', B: [tr.cx, tr.cy], sh: a, bl: tr.flen * lerp(0.8, 1.06, hang) * r.range(0.9, 1.08), col: r.pick(cols), tree: tr }, r);
          lf.mask = TEXT; lf.pad = r.range(0.08, 0.3) * U * PADK;           // the crown may hang behind the flags
          lf.fold = -a * 0.72;                                              // starts bundled upright with the rest, then falls open
          lf.closeK = 0.4;                                                  // a crown only leans a little over the middle
          lf.z = 4.3 + hang * 0.05;                                         // hanging fronds in front of upright ones
          if (settle(lf, 0.16)) finishLeaf(s, lf, r, tr.t0 + 0.03 + hang * 0.26 + r.range(0, 0.05));
        }
        // coconuts tucked under the crown
        tr.nuts = own(s, PP.raster(PP.coconuts(), tr.w1 * 2.1, SR, { grain: s.grain }));
        tr.nutsSh = own(s, PP.shadow(tr.nuts, 0.04 * U));
      });
    }

    /* -- the heroes: a few huge foreground leaves that close over the middle
          and swing aside like heavy curtains when the gust arrives */
    function plantHeroes(s, r) {
      var L = LAYERS[3], li = 3;
      var specs = [
        { type: 'banana', B: [-0.35 * U, H + 0.75 * U], rest: -5, sl: 1.15, bl: 3.4 },
        { type: 'banana', B: [W + 0.3 * U, H + 0.85 * U], rest: 7, sl: 1.3, bl: 3.2 },
        { type: 'monstera', B: [W + 0.7 * U, H * 0.66], rest: -62, sl: 1.7, bl: 2.0, tilt: -1.3 },
        { type: 'fan', B: [-0.8 * U, H * 0.6], rest: 58, sl: 1.9, bl: 1.75 },
        // two long fronds wait above the frame and swing down to shut the top
        { type: 'frond', B: [W * 0.3, -0.5 * U], rest: -62, bl: 3.6, out: true },
        { type: 'frond', B: [W * 0.7, -0.45 * U], rest: 64, bl: 3.5, out: true }
      ];
      if (W > 5.4 * U) {                        // wide screens need more curtain
        specs.push({ type: 'banana', B: [W * 0.56, H + 0.9 * U], rest: -38, sl: 1.0, bl: 2.9 });
        specs.push({ type: 'monstera', B: [W * 0.28, H + 0.7 * U], rest: -30, sl: 1.5, bl: 1.8, tilt: -1.2 });
        specs.push({ type: 'frond', B: [W * 0.5, -0.5 * U], rest: 14, bl: 3.4, out: true });
        specs.push({ type: 'banana', B: [W * 0.76, H + 0.8 * U], rest: 26, sl: 1.1, bl: 2.7 });
      } else {                                  // tall screens: more from each long side
        specs.push({ type: 'frond', B: [W + 0.35 * U, H * 0.36], rest: -75, bl: 3.0 });
        specs.push({ type: 'banana', B: [-0.5 * U, H * 0.88], rest: 20, sl: 0.9, bl: 2.8 });
        specs.push({ type: 'banana', B: [-0.6 * U, H * 0.3], rest: 165, sl: 0.8, bl: 2.6 });
        specs.push({ type: 'monstera', B: [-0.7 * U, H * 0.45], rest: 80, sl: 1.5, bl: 1.8, tilt: 1.2 });
      }
      specs.forEach(function (sp, i) {
        var sh = sp.rest * DEG;
        var lf = makeLeaf({ layer: li, type: sp.type, B: sp.B, sh: sh, sl: (sp.sl || 0) * U, bl: sp.bl * U, bow: sp.type === 'frond' ? 0 : (sh >= 0 ? 0.18 : -0.18), tilt: sp.tilt || (sp.type === 'banana' ? (sh >= 0 ? 0.15 : -0.15) : 0), col: L.cols[i % L.cols.length] }, r);
        // stay and frame the clearing if there is anywhere to rest; otherwise swing right out of frame
        lf.out = !!sp.out;
        if (!sp.out && !settle(lf, 0.12) && !settle(lf, 0.03)) {
          lf.sh = hTo(lf.B[0] - C.cx, lf.B[1] - C.cy) + 0.5 * (lf.flip);
        }
        finishLeaf(s, lf, r, T.hero + sweepOf(sp.B[0], sp.B[1]) * 0.45 + r.range(0, 0.1));
      });
    }

    /* -- the back sheet: one dark piece of card with a leafy hole in it.
          It guarantees there is never bare paper showing through the frame. */
    function buildWall(s, r) {
      var sideGap = Math.max(0.1 * U, Math.min(CB.x0, W - CB.x1, C.y0 + 0.4 * U, H - C.y1));
      // how far the hole in the sheet stands back from the copy: less where room is tight, so a phone's sides stay thick
      var pad = Math.max(0.1 * U, clamp((0.3 + 0.2 * clamp((PADK - 0.6) / 0.4)) * sideGap, 0.14 * U, 0.62 * U) * PADK);
      s.wallPad = pad;
      var m = Math.ceil(0.16 * Math.max(W, H)), res = Math.min(SR, Math.max(1, SR * 0.75));
      var cv = mkCanvas((W + 2 * m) * res, (H + 2 * m) * res), x = cv.getContext('2d');
      x.setTransform(res, 0, 0, res, m * res, m * res);
      x.fillStyle = WALL; x.fillRect(-m, -m, W + 2 * m, H + 2 * m);
      // The hole follows the copy, but not line by line: narrow lines are treated as nearly
      // as wide as the widest, so the hole is one calm rounded shape, not a row of waists.
      var RX = 0;
      zones.forEach(function (z) { if (z.m & TEXT) RX = Math.max(RX, z.rx); });
      var holes = zones.filter(function (z) { return z.m & (TEXT | PICADO); }).map(function (z) {
        return { cx: z.cx, cy: z.cy, rx: (z.m & TEXT ? Math.max(z.rx, 0.86 * RX) : z.rx) + pad, ry: z.ry + pad };
      });
      var inHole = function (px, py) {
        for (var i = 0; i < holes.length; i++) {
          var dx = Math.abs(px - holes[i].cx) / holes[i].rx, dy = Math.abs(py - holes[i].cy) / holes[i].ry;
          if (dx < 1 && dy < 1 && dx * dx * dx * dx + dy * dy * dy * dy < 1) return true;
        }
        return false;
      };
      x.globalCompositeOperation = 'destination-out';
      holes.forEach(function (z) {
        x.beginPath();
        for (var i = 0; i < 56; i++) {
          var a = i / 56 * TAU, c = Math.cos(a), sn = Math.sin(a);
          var px = z.cx + Math.sign(c) * Math.pow(Math.abs(c), 0.5) * z.rx, py = z.cy + Math.sign(sn) * Math.pow(Math.abs(sn), 0.5) * z.ry;
          if (i) x.lineTo(px, py); else x.moveTo(px, py);
        }
        x.closePath(); x.fill();
      });
      x.globalCompositeOperation = 'source-over';
      // dark leaves stamped all over the sheet, and a fringe of them poking over the
      // edge of the hole, so that edge reads as foliage and not as a cut line
      var stamps = [], cols = ['#10301F', '#143A26', '#0D2819', '#16402A'];
      for (var k = 0; k < 7; k++) {
        var rr = makeRng(SEED + 500 + k), geo, col = cols[k % cols.length];
        if (k % 3 === 0) geo = PP.frond(rr, { curl: rr.range(0.6, 1.1) * rr.sign(), pairs: 22, lmax: 0.3, lw: 0.36, grav: [0, 0], gAmt: 0, col: col });
        else if (k % 3 === 1) geo = PP.paddle(rr, { kind: 'banana', bend: rr.range(-0.4, 0.4), W: 0.19, sweep: 14 * DEG, veinStep: 0.05, tears: [2, 4], col: col });
        else geo = PP.fan(rr, { blades: 17, span: 240 * DEG, fuse: 0.5, sag: 0, grav: [0, 0], col: col });
        stamps.push({ sp: PP.raster(geo, U * (k % 3 === 2 ? 0.7 : 1.3), res, { light: 0.16, dark: 0.3 }), reach: k % 3 === 2 ? 0.7 : 1.3 });
      }
      var stampAt = function (st, x0, y0, hd, k2, flip) {
        x.save(); x.translate(x0, y0); x.rotate(hd); x.scale(k2 * flip, k2);
        x.drawImage(st.sp.img, -st.sp.ax, -st.sp.ay, st.sp.w, st.sp.h);
        x.restore();
      };
      // does any part of this stamp's outline come too near the copy?
      var stampHits = function (st, x0, y0, hd, k2, flip) {
        var c = Math.cos(hd), sn = Math.sin(hd), h = st.sp.hull;
        for (var i = 0; i < h.length; i += 2) {
          var hx = h[i] * k2 * flip, hy = h[i + 1] * k2;
          if (hit(x0 + hx * c - hy * sn, y0 + hx * sn + hy * c, 0.06 * U, TEXT)) return true;
        }
        return false;
      };
      var fill = Math.round(W * H / (U * U) * 1.1);
      for (var q = 0; q < fill; q++) {
        var fx = r.range(-0.1, 1.1) * W, fy = r.range(-0.1, 1.1) * H;
        if (hit(fx, fy, pad + 1.2 * U, TEXT | PICADO)) continue;
        stampAt(r.pick(stamps), fx, fy, r.range(0, TAU), r.range(0.9, 1.5), r.sign());
      }
      var n = Math.round((C.w + C.h) * 2 / (0.15 * U)), reachIn = pad + 0.1 * U;
      for (var i = 0; i < n; i++) {
        var a = (i + r.range(-0.3, 0.3)) / n * TAU, dx = Math.cos(a), dy = Math.sin(a), d = 0;
        while (d < Math.max(W, H) && inHole(C.cx + dx * d, C.cy + dy * d)) d += 4;
        var ex = C.cx + dx * d, ey = C.cy + dy * d;
        if (ex < -0.2 * U || ex > W + 0.2 * U || ey < -0.2 * U || ey > H + 0.2 * U) continue;
        var st = r.pick(stamps), k2 = r.range(0.6, 1.1), flip = r.sign();
        var hd = hTo(-dx, -dy) + r.range(-0.75, 0.75), poke = r.range(0.3, 1) * reachIn, ok = false, rx = 0, ry = 0;
        for (var tries = 0; tries < 5 && !ok; tries++) {       // rooted on the sheet, its tip reaching `poke` past the edge
          var back = Math.max(0, st.reach * U * k2 - poke);
          rx = ex + dx * back; ry = ey + dy * back;
          ok = !stampHits(st, rx, ry, hd, k2, flip);
          if (!ok) { k2 *= 0.8; poke *= 0.8; }
        }
        if (!ok) continue;
        stampAt(st, rx, ry, hd, k2, flip);
      }
      stamps.forEach(function (st) { st.sp.img.width = st.sp.img.height = 0; });
      // the sheet and the shadow it throws on the paper, as one piece
      s.wall = own(s, PP.bake({ img: cv, ax: m, ay: m, w: W + 2 * m, h: H + 2 * m, res: res }, 0.07 * U, 0.035 * U, 0.06 * U, 0.3));
    }

    /* -- the shutters: a handful of very large, very dark banana leaves at the very
          back that reach right across the clearing from alternate sides, so the closed
          jungle is sealed whatever the screen shape. They swing out of frame with the
          gust and are not drawn again. */
    function plantShutters(s, r) {
      var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, pad = s.wallPad;
      zones.forEach(function (z) {
        if (!(z.m & (TEXT | PICADO))) return;
        x0 = Math.min(x0, z.cx - z.rx - pad); x1 = Math.max(x1, z.cx + z.rx + pad);
        y0 = Math.min(y0, z.cy - z.ry - pad); y1 = Math.max(y1, z.cy + z.ry + pad);
      });
      x0 = Math.max(x0, 0); x1 = Math.min(x1, W); y0 = Math.max(y0, 0); y1 = Math.min(y1, H);
      var hw = x1 - x0, hh = y1 - y0, tall = hh >= hw, D = tall ? hw : hh, along = tall ? hh : hw;
      var bl = D / 0.58, wid = 0.36 * bl, n = Math.max(2, Math.ceil(along / (wid * 0.7)));
      var far = 0.5 * wid + 0.3 * U;            // rooted this far outside, so at rest the leaf lies along the edge, unseen
      var cols = ['#143A26', '#0F2E1E', '#17402A', '#0D2819'];
      for (var i = 0; i < n; i++) {
        var q = (i + 0.5) / n, side = i % 2 ? 1 : -1, B, sl, hc, rest, mid;
        if (tall) {                             // tall clearing: reach in from the left and the right
          var y = lerp(y0, y1, q), jx = side < 0 ? x0 - 0.08 * bl : x1 + 0.08 * bl;
          B = [side < 0 ? Math.min(jx - 0.3 * U, -far) : Math.max(jx + 0.3 * U, W + far), y];
          sl = Math.abs(jx - B[0]); hc = -side * 90 * DEG; rest = q < 0.5 ? 0 : Math.PI; mid = (x0 + x1) / 2;
        } else {                                // wide clearing: hang from the top and stand up from the bottom
          var x = lerp(x0, x1, q), jy = side < 0 ? y0 - 0.08 * bl : y1 + 0.08 * bl;
          B = [x, side < 0 ? Math.min(jy - 0.3 * U, -far) : Math.max(jy + 0.3 * U, H + far)];
          sl = Math.abs(jy - B[1]); hc = side < 0 ? Math.PI : 0; rest = (q < 0.5 ? -90 : 90) * DEG; mid = x;
        }
        var lf = makeLeaf({ layer: 0, type: 'banana', flat: true, B: B, sh: rest, sl: sl, bl: bl, col: cols[i % cols.length] }, r);
        lf.out = lf.gone = true; lf.z = 1.2; lf.closeTo = hc;
        finishLeaf(s, lf, r, T.mid + 0.3 + q * 0.5 + r.range(0, 0.1));
        lf.tp = T.gust + clamp(mid / W) * T.gustTravel + r.range(0, 0.06);   // the gust reaches it where it lies, not where it is rooted
      }
    }

    /* -- birds of paradise ------------------------------------------------ */
    function buildFlowers(s) {
      s.flowers = [];
      var S = (portrait ? 0.84 : 0.72) * U, edge = 0.08 * U, specs, placed = [];
      if (portrait) {
        specs = [
          { x: Math.max(0.78 * U, CB.x0 - 0.12 * U), y: CB.y1 + 1.12 * U, dir: 1, k: 1 },
          { x: Math.min(W - 0.74 * U, CB.x1 + 0.16 * U), y: CB.y1 + 1.5 * U, dir: -1, k: 0.9 }
        ];
        if (W > 4.3 * U) specs.push({ x: CB.x0 - 1.15 * U, y: CB.y1 + 1.8 * U, dir: -1, k: 0.68 });   // tablets have room for a third
      } else {
        var off = CB.subW / 2 + 1.5 * U;
        specs = [
          { x: CB.cx - off, y: CB.y1 - 0.05 * U, dir: 1, k: 1 },
          { x: CB.cx + off + 0.1 * U, y: CB.y1 + 0.25 * U, dir: -1, k: 0.92 },
          { x: CB.cx - off - 0.95 * U, y: CB.y1 + 0.6 * U, dir: -1, k: 0.7 },
          { x: CB.cx + off + 1.2 * U, y: CB.y1 + 0.8 * U, dir: 1, k: 0.62 }
        ];
      }
      // where each orange sepal sits along the top of the beak, and how far it leans (0 = straight up)
      var SEPALS = [
        { bx: 0.04, by: -0.05, rest: -26, len: 0.98 },
        { bx: 0.14, by: -0.085, rest: -3, len: 1.12 },
        { bx: 0.25, by: -0.1, rest: 20, len: 0.98 },
        { bx: 0.5, by: -0.065, rest: 73, len: 0.6 }
      ];
      specs.forEach(function (sp, fi) {
        var Sk = S * sp.k, rr = makeRng(SEED + 300 + fi * 13), tries = 0;
        var fwd = 1.04 * Sk, aft = 0.46 * Sk;   // how far the head reaches ahead of, and behind, the top of its stalk
        // keep the whole flower off the copy: slide it down (portrait) or outward (landscape) until clear
        var touches = function () {
          var pts = [[sp.dir * Sk, 0], [sp.dir * Sk * 0.55, -Sk * 0.9], [sp.dir * Sk * 0.12, -Sk * 1.15], [-sp.dir * Sk * 0.4, -Sk * 0.92], [sp.dir * Sk * 1.05, -Sk * 0.7], [sp.dir * Sk * 0.5, -Sk * 0.4]];
          return pts.some(function (p) { return hit(sp.x + p[0], sp.y + p[1], 0.1 * U, TEXT); });
        };
        while (touches() && tries++ < 40) { if (portrait) sp.y += 0.08 * U; else { sp.y += 0.05 * U; sp.x -= sp.dir * 0.03 * U; } }
        sp.y = Math.min(sp.y, H - 0.27 * U);
        // the whole head stays inside the frame...
        sp.x = clamp(sp.x, edge + (sp.dir > 0 ? aft : fwd), W - edge - (sp.dir > 0 ? fwd : aft));
        // ...and out from under the Replay button
        if (RB && sp.y + 0.28 * Sk > RB.y0 - 6) {
          var lo = sp.x - (sp.dir > 0 ? 0.16 * Sk : fwd), hi = sp.x + (sp.dir > 0 ? fwd : 0.16 * Sk);
          if (hi > RB.x0 - 6 && lo < RB.x1 + 6) sp.x += RB.x0 > W / 2 ? RB.x0 - 6 - hi : RB.x1 + 6 - lo;
        }
        if (touches()) return;                  // nowhere to put it: leave it out
        var box = { x0: sp.x - (sp.dir > 0 ? aft : fwd), x1: sp.x + (sp.dir > 0 ? fwd : aft), y0: sp.y - 1.16 * Sk, y1: sp.y + 0.28 * Sk };
        if (box.x0 < 0 || box.x1 > W) return;
        if (placed.some(function (b) { return box.x0 < b.x1 - 0.12 * Sk && box.x1 > b.x0 + 0.12 * Sk && box.y0 < b.y1 - 0.12 * Sk && box.y1 > b.y0 + 0.12 * Sk; })) return;
        placed.push(box);
        var f = { x: sp.x, y: sp.y, dir: sp.dir, S: Sk, rest: rr.range(-0.2, -0.08), t0: T.blooms + s.flowers.length * T.bloomStagger, ph: rr.range(0, TAU), amp: 0.05, parts: [],
          rootX: sp.x - sp.dir * rr.range(0.35, 0.7) * U, rootY: H + 0.8 * U, ctrlX: sp.x - sp.dir * rr.range(-0.05, 0.12) * U, stalkW: Sk * 0.085 };
        var mk = function (geo, px, bx, by, rest, fold, delay) {
          var sprite = own(s, PP.raster(geo, px, SR, { grain: s.grain, light: 0.5, dark: 0.22 }));
          f.parts.push({ sp: sprite, sh: own(s, PP.shadow(sprite, 0.035 * U)), bx: bx * Sk, by: by * Sk, rest: rest * DEG, fold: fold * DEG, delay: delay });
        };
        var sep = function (i, d) {
          var q = SEPALS[i];
          mk(PP.sepal(rr, { curl: rr.range(-0.1, 0.32), w: rr.range(0.105, 0.125), col: INK.cempasuchil, shade: PP.mix(INK.cempasuchil, INK.barro, 0.55), hi: '#FACB72' }), Sk * q.len, q.bx, q.by, q.rest + rr.range(-4, 4), 92, d);
        };
        sep(0, 0); sep(1, 0.1); sep(2, 0.2); sep(3, 0.3);
        // the cobalt tongue, last: it points forward out of the crest, in the gap between the flames
        mk(PP.petal(rr, { col: INK.cobalto, shade: '#1E3795', hi: '#5674DA', curl: rr.range(-0.1, 0.12) }), Sk * 1.08, 0.33, -0.09, 50 + rr.range(-3, 3), 96, 0.46);
        mk(PP.spathe(rr, { col: '#5E8150', rim: PP.mix(INK.barro, INK.buganvilia, 0.3), rimW: Sk * 0.032 }), Sk, 0, 0, 0, 0, -1);
        s.flowers.push(f);
      });
    }

    /* -- papel picado ----------------------------------------------------- */
    /* Where the string hangs. If both near palms are standing it is tied between
       them; otherwise it simply spans the clearing. */
    function flagWidth() {                      // as big as the room above the names allows
      var fw = Math.min(clamp(0.44 * U, 34, 96), (CB.y0 - 6) * 0.86 / 2.13);
      if (!portrait && H <= 480) fw = Math.min(fw, 30);                  // short landscape phones: keep the stack centred
      return Math.max(20, fw);
    }
    function planPicado(s) {
      var fw = flagWidth(), least = portrait ? 6 : 4;
      var span = Math.min(W + 0.5 * U, CB.w + 2.7 * U), x0 = CB.cx - span / 2, x1 = CB.cx + span / 2, u0 = 0, u1 = 1;
      var a = s.trees[0], b = s.trees[1], tied = !!(a && b), n = Math.max(least, Math.round(span / (fw * 1.13)));
      if (tied) {
        var y0 = CB.y0 - fw * 2.13, xa = trunkXAt(a, y0), xb = trunkXAt(b, y0), sp = xb - xa, v0 = 0, v1 = 1;
        // where the string meets a crown rather than the trunk under it, the flags start clear of that crown
        if (y0 < a.cy || y0 < b.cy) { v0 = 0.42 * a.flen / sp; v1 = 1 - 0.42 * b.flen / sp; }
        var room = sp * (v1 - v0), m = Math.max(least, Math.round(room / (fw * 1.13))), w = Math.min(fw, room / (m * 1.09));
        if (w >= 20 && sp > CB.w * 0.8) { x0 = xa; x1 = xb; span = sp; u0 = v0; u1 = v1; n = m; fw = w; } else tied = false;
      }
      var fh = fw * 1.33, sag = fw * 0.42, gap = fw * 0.38, y = CB.y0 - fh - sag - gap;
      if (tied) { x0 = trunkXAt(a, y); x1 = trunkXAt(b, y); span = x1 - x0; }
      var pic = { x0: x0, x1: x1, y: y, sag: sag, fw: fw, fh: fh, n: n, tied: tied, u0: u0, u1: u1 };
      zones.push({ cx: (x0 + x1) / 2, cy: pic.y + (sag + fh) / 2 + fh * 0.12, rx: Math.min(span / 2, CB.w / 2 + 0.55 * U), ry: (sag + fh) / 2 + fh * 0.1, m: PICADO });
      return pic;
    }

    function buildPicado(s, pic, r) {
      pic.flags = [];
      var sprites = {};
      for (var i = 0; i < pic.n; i++) {
        var col = SIX[i % 6], variant = i % 3, key = col + variant;
        if (!sprites[key]) {
          var sp = PP.raster(PP.flag(r, { col: col, variant: variant }), pic.fw, SR, { grain: s.grain, light: 0.45, dark: 0.2 });
          sprites[key] = own(s, PP.bake(sp, 0.04 * U, 0.035 * U, 0.055 * U, 0.28));   // flag + its shadow, one piece
        }
        pic.flags.push({ u: lerp(pic.u0, pic.u1, (i + 0.5) / pic.n), sp: sprites[key], ph: r.range(0, TAU), kick: r.range(0.25, 0.5) * r.sign() });
      }
      s.pic = pic;
    }

    /* -- the leaf that lets go ------------------------------------------- */
    function buildDrift(s) {
      s.drift = [INK.lima, INK.cempasuchil, '#7FB23A'].map(function (col, i) {
        var sp = own(s, PP.raster(PP.paddle(makeRng(SEED + 700 + i), { kind: 'bop', bend: 0.3, W: 0.2, sweep: 14 * DEG, veinStep: 0.09, tears: [0, 0], col: col }), 0.42 * U, SR, { grain: s.grain }));
        return { sp: sp, sh: own(s, PP.shadow(sp, 0.05 * U)) };
      });
    }

    /* ------------------------------------------------------------------
       7. DRAWING ONE FRAME
       ------------------------------------------------------------------ */
    function sprite(sp, x, y, h, sx, sy) {
      var c = Math.cos(h) * vs, sn = Math.sin(h) * vs;
      ctx.setTransform(c * sx, sn * sx, -sn * sy, c * sy, x * vs + vox, y * vs + voy);
      ctx.drawImage(sp.img, -sp.ax, -sp.ay, sp.w, sp.h);
    }
    function plain() { ctx.setTransform(vs, 0, 0, vs, vox, voy); }

    /* How "closed over the middle" a leaf is: 1 before the gust, 0 at rest.
       It leans in a touch further first (anticipation), then springs open
       and overshoots. */
    function closedness(lf, t) {
      var L = LAYERS[lf.layer], tau = t - lf.tp;
      if (tau <= -0.45) return 1;
      if (tau < 0) return 1 + lf.antic * cubicInOut((tau + 0.45) / 0.45);
      return (1 + lf.antic) * (1 - spring(tau, L.f, L.d));
    }

    function drawLeaf(lf, t) {
      var tg = t - lf.t0;
      if (tg <= 0 || (lf.gone && t - lf.tp > 3.2)) return;               // not grown yet / long gone out of frame
      var L = LAYERS[lf.layer];
      // growth: the stalk leads, the blade follows and opens last
      var eStalk = quintOut(clamp(tg / (T.grow * 0.7)));
      var eAng = spring(tg, 1.25, 4.4);
      var eLen = spring(tg - 0.1, 1.4, 7.5);
      var eWid = eLen * cubicOut(clamp((tg - 0.18) / (T.grow * 0.75)));
      if (eLen <= 0.002) eLen = 0.002;
      // wind now, and wind a moment ago: the difference is what makes tips lag
      var w = wind(lf.wx, t), wLag = wind(lf.wx, t - 0.24);
      // every leaf also trembles on its own, harder when the wind is up
      var blow = Math.min(1.6, Math.abs(wLag));
      var flutter = windOn * (Math.sin(t * lf.rate * 1.6 + lf.ph) * (0.13 + 0.17 * blow) + Math.sin(t * lf.rate * 5.3 + lf.ph * 2.3) * 0.11 * blow);
      // parting: c is how closed it is, cLag is where the tip still thinks it is
      var c = closedness(lf, t), cLag = closedness(lf, t - 0.13) - c;
      var bx = lf.B[0], by = lf.B[1];
      if (lf.tree) { bx = lf.tree.px; by = lf.tree.py; }
      var jx, jy, bh, k = lf.amp, sx = L.sh.x * U, sy = L.sh.y * U;
      if (lf.sl > 0) {
        var h = lf.sh + lf.close * c + lf.fold * 0.5 * (1 - eAng) + k * 0.7 * (w + flutter * 0.5) * Math.cos(lf.sh);
        var len = lf.sl * eStalk, d = head(h), cc = head(h - lf.bow - k * 1.2 * (wLag - w) * Math.cos(lf.sh) - lf.close * cLag * 0.3);
        jx = bx + d[0] * len; jy = by + d[1] * len;
        var cx = bx + cc[0] * len * 0.5, cy = by + cc[1] * len * 0.5;
        bh = hTo(jx - cx, jy - cy) + lf.tilt + lf.fold * (1 - spring(tg - 0.16, 1.25, 4.4)) + k * (wLag * 1.25 + flutter) * lf.cosH + lf.close * cLag * 0.35;
        // the stalk, and its shadow on the layer below
        plain();
        ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1, lf.stalkW * (0.5 + 0.5 * eStalk));
        ctx.strokeStyle = 'rgba(8,26,16,' + (L.sh.a * 0.7) + ')';
        ctx.beginPath(); ctx.moveTo(bx + sx, by + sy); ctx.quadraticCurveTo(cx + sx, cy + sy, jx + sx, jy + sy); ctx.stroke();
        ctx.strokeStyle = lf.stalkCol;
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(cx, cy, jx, jy); ctx.stroke();
      } else {
        jx = bx; jy = by;
        bh = lf.sh + lf.close * c + lf.fold * (1 - eAng) + k * (w * 0.75 + wLag * 0.25 + flutter * 0.6) * lf.cosH;
      }
      var fx = eWid * lf.flip, fy = eLen;
      if (!lf.tip) {
        if (lf.shadow) { ctx.globalAlpha = L.sh.a; sprite(lf.shadow, jx + sx, jy + sy, bh, fx, fy); ctx.globalAlpha = 1; }
        sprite(lf.sprite, jx, jy, bh, fx, fy);
        return;
      }
      // a frond is two pieces: the outer half hinges on the rib, lags and overshoots
      var bend = lf.fold * 0.7 * (1 - spring(tg - 0.2, 1.25, 4.4)) + k * ((wLag - w) * 2.2 + wLag * 0.7 + flutter * 1.3) * lf.cosH + lf.close * cLag * 0.55;
      var cs = Math.cos(bh), sn = Math.sin(bh), lx = lf.tipX * fx, ly = lf.tipY * fy;
      var hx = jx + lx * cs - ly * sn, hy = jy + lx * sn + ly * cs;
      if (lf.shadow) {
        ctx.globalAlpha = L.sh.a;
        sprite(lf.shadow, jx + sx, jy + sy, bh, fx, fy);
        sprite(lf.tipShadow, hx + sx, hy + sy, bh + bend, fx, fy);
        ctx.globalAlpha = 1;
      }
      sprite(lf.sprite, jx, jy, bh, fx, fy);
      sprite(lf.tip, hx, hy, bh + bend, fx, fy);
    }

    /* A tapered, ringed trunk along a curve (foot -> control -> top), grown to
       fraction g. ox/oy shift the whole thing (used for its shadow). */
    function trunkPath(tr, mx, tx, ty, g, ox, oy, flat) {
      var bx = tr.bx + ox, by = tr.by + oy, my = tr.my + oy, n = 16, A = [], B = [], M = [], i, u, v, x, y, dx, dy, dl, w, nx, ny;
      mx += ox; tx += ox; ty += oy;
      var at = function (q) {
        v = 1 - q;
        x = v * v * bx + 2 * v * q * mx + q * q * tx; y = v * v * by + 2 * v * q * my + q * q * ty;
        dx = 2 * v * (mx - bx) + 2 * q * (tx - mx); dy = 2 * v * (my - by) + 2 * q * (ty - my); dl = Math.hypot(dx, dy) || 1;
        nx = -dy / dl; ny = dx / dl;            // points to the trunk's right-hand side (the side in shade)
        w = lerp(tr.w0, tr.w1, q) / 2;
      };
      for (i = 0; i <= n; i++) {
        at(g * i / n);
        A.push(x - nx * w, y - ny * w); B.push(x + nx * w, y + ny * w); M.push(x + nx * w * 0.28, y + ny * w * 0.28);
      }
      var poly = function (P, Q) {
        ctx.beginPath(); ctx.moveTo(P[0], P[1]);
        for (i = 1; i <= n; i++) ctx.lineTo(P[i * 2], P[i * 2 + 1]);
        for (i = n; i >= 0; i--) ctx.lineTo(Q[i * 2], Q[i * 2 + 1]);
        ctx.closePath(); ctx.fill();
      };
      plain();
      if (flat) { ctx.fillStyle = flat; poly(A, B); return; }
      ctx.fillStyle = tr.col; poly(A, B);
      ctx.fillStyle = tr.shade; poly(M, B);     // the card's shaded side
      // ring scars
      ctx.strokeStyle = tr.ring; ctx.lineWidth = Math.max(1, tr.w1 * 0.11); ctx.lineCap = 'butt'; ctx.beginPath();
      var total = Math.hypot(tr.cx - tr.bx, tr.cy - tr.by), step = 0.17 * U, rings = Math.floor(total * g / step);
      for (i = 1; i <= rings; i++) {
        at(i * step / total);
        ctx.moveTo(x - nx * w, y - ny * w); ctx.lineTo(x + nx * w, y + ny * w);
      }
      ctx.stroke();
      // hairline lit edge
      ctx.strokeStyle = tr.lit; ctx.lineWidth = 1; ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.moveTo(A[0], A[1]);
      for (i = 1; i <= n; i++) ctx.lineTo(A[i * 2], A[i * 2 + 1]);
      ctx.stroke(); ctx.globalAlpha = 1;
      // the growing tip: a green crownshaft and the spear of the next frond, so the top is never a sawn-off pole
      at(g);
      var tx2 = -ny, ty2 = nx, wt = tr.w1 * 0.62, hgt = tr.w1 * 2.6;      // (tx2,ty2) points along the trunk, upward
      ctx.fillStyle = '#2E7D46'; ctx.beginPath();
      ctx.moveTo(x - nx * wt, y - ny * wt);
      ctx.quadraticCurveTo(x - nx * wt * 0.9 + tx2 * hgt * 0.45, y - ny * wt * 0.9 + ty2 * hgt * 0.45, x + tx2 * hgt, y + ty2 * hgt);
      ctx.quadraticCurveTo(x + nx * wt * 0.9 + tx2 * hgt * 0.45, y + ny * wt * 0.9 + ty2 * hgt * 0.45, x + nx * wt, y + ny * wt);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#1F5A36'; ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x + tx2 * hgt, y + ty2 * hgt);
      ctx.quadraticCurveTo(x + nx * wt * 0.9 + tx2 * hgt * 0.45, y + ny * wt * 0.9 + ty2 * hgt * 0.45, x + nx * wt, y + ny * wt);
      ctx.closePath(); ctx.fill();
    }

    function drawTrunk(tr, t) {
      var tau = t - tr.t0;
      tr.px = tr.bx; tr.py = tr.by; tr.sway = 0;
      if (tau <= 0) return;
      var g = quartOut(clamp(tau / 1.0)), L = LAYERS[tr.layer];
      var sway = tr.amp * U * 1.6 * (wind(tr.cx, t - 0.15) + 0.2 * windOn * Math.sin(t * 0.8 + tr.ph));
      var tw = tau - 0.55;                      // arriving at full height the crown's weight carries it over, and back
      if (tw > 0 && tw < 4) sway -= tr.side * 0.1 * U * Math.exp(-2.4 * tw) * Math.sin(TAU * 1.15 * tw);
      var tx = tr.cx + sway, ty = tr.cy, mx = tr.mx + sway * 0.35, v = 1 - g;
      tr.sway = sway;
      tr.px = v * v * tr.bx + 2 * v * g * mx + g * g * tx; tr.py = v * v * tr.by + 2 * v * g * tr.my + g * g * ty;
      ctx.globalAlpha = L.sh.a * 0.8;
      trunkPath(tr, mx, tx, ty, g, L.sh.x * U, L.sh.y * U, 'rgb(8,26,16)');
      ctx.globalAlpha = 1;
      trunkPath(tr, mx, tx, ty, g, 0, 0, null);
    }
    function drawNuts(tr, t) {                  // coconuts pop in under the crown
      var kn = spring(t - tr.t0 - 0.6, 1.6, 5), L = LAYERS[tr.layer];
      if (kn <= 0) return;
      var y = tr.py + tr.w1 * 0.35;
      ctx.globalAlpha = L.sh.a; sprite(tr.nutsSh, tr.px + L.sh.x * U * 0.6, y + L.sh.y * U * 0.6, 0, kn, kn);
      ctx.globalAlpha = 1; sprite(tr.nuts, tr.px, y, 0, kn, kn);
    }

    function drawWall(s, t) {
      var tau = t - T.wall;
      if (tau <= 0) return;
      // closes in like an iris, holds a little tight, then eases open with the gust
      var k = lerp(1.7, 0.9, cubicInOut(clamp(tau / 1.35)));
      k += 0.1 * spring(t - T.gust - 0.12, 0.8, 3.2);
      k -= 0.018 * cubicInOut(prog(t, T.gust - 0.45, 0.45)) * (t < T.gust ? 1 : Math.exp(-(t - T.gust) * 5));
      k += 0.004 * windOn * Math.sin(t * 0.31);
      var x = C.cx - C.cx * k + 0.012 * U * wind(C.cx, t - 0.4), y = C.cy - C.cy * k;
      ctx.setTransform(k * vs, 0, 0, k * vs, x * vs + vox, y * vs + voy);
      ctx.drawImage(s.wall.img, -s.wall.ax, -s.wall.ay, s.wall.w, s.wall.h);
    }

    function drawFlowers(s, t) {
      for (var fi = s.flowers.length - 1; fi >= 0; fi--) {
        var f = s.flowers[fi], tau = t - f.t0;
        if (tau <= 0) continue;
        var g = quintOut(clamp(tau / 0.62));
        var nod = f.amp * (wind(f.x, t - 0.1) + 0.3 * windOn * Math.sin(t * 0.85 + f.ph));
        var hx = f.x + nod * f.S * 0.9, hy = f.y + Math.abs(nod) * f.S * 0.1;
        // stalk, grown to fraction g
        var cx = f.ctrlX, cy = lerp(f.rootY, hy, 0.5), v = 1 - g;
        var ex = v * v * f.rootX + 2 * v * g * cx + g * g * hx, ey = v * v * f.rootY + 2 * v * g * cy + g * g * hy;
        var qx = lerp(f.rootX, cx, g), qy = lerp(f.rootY, cy, g);
        plain(); ctx.lineCap = 'round'; ctx.lineWidth = f.stalkW;
        ctx.strokeStyle = 'rgba(8,26,16,0.25)';
        ctx.beginPath(); ctx.moveTo(f.rootX + 0.05 * U, f.rootY); ctx.quadraticCurveTo(qx + 0.05 * U, qy + 0.07 * U, ex + 0.05 * U, ey + 0.07 * U); ctx.stroke();
        ctx.strokeStyle = '#6A8A3C';
        ctx.beginPath(); ctx.moveTo(f.rootX, f.rootY); ctx.quadraticCurveTo(qx, qy, ex, ey); ctx.stroke();
        ctx.strokeStyle = '#8FAE4A'; ctx.lineWidth = Math.max(1, f.stalkW * 0.22);          // lit edge of the stalk
        ctx.beginPath(); ctx.moveTo(f.rootX - f.stalkW * 0.3, f.rootY); ctx.quadraticCurveTo(qx - f.stalkW * 0.3, qy, ex - f.stalkW * 0.3, ey); ctx.stroke();
        if (tau < 0.3) continue;
        // the head: a bud pointing up, then the beak tips level and the flames flick up
        var hs = spring(tau - 0.3, 1.9, 6.5);
        var rot = f.rest + (-1.35 - f.rest) * (1 - spring(tau - 0.44, 1.45, 4.3)) + nod * 0.9;
        for (var pass = 0; pass < 2; pass++) {
          ctx.globalAlpha = pass ? 1 : 0.26;
          var ox = pass ? 0 : 0.045 * U, oy = pass ? 0 : 0.07 * U;
          for (var i = 0; i < f.parts.length; i++) {
            var p = f.parts[i], a = p.rest, sc = 1;
            if (p.delay >= 0) {
              var pt = tau - 0.78 - p.delay;
              if (pt <= 0) continue;
              var e = spring(pt, 2.1, 5.2);
              a = lerp(p.fold, p.rest, e) + 0.035 * windOn * Math.sin(t * 1.3 + i * 1.9 + f.ph) + nod * 0.5 * (1 + i * 0.2);
              sc = lerp(0.25, 1, backOut(clamp(pt / 0.45), 1.4));
            }
            ctx.setTransform(vs, 0, 0, vs, (ex + ox) * vs + vox, (ey + oy) * vs + voy);
            ctx.scale(f.dir * hs, hs); ctx.rotate(rot);
            ctx.translate(p.bx, p.by); ctx.rotate(a); ctx.scale(sc, sc);
            var im = pass ? p.sp : p.sh;
            ctx.drawImage(im.img, -im.ax, -im.ay, im.w, im.h);
          }
        }
        ctx.globalAlpha = 1;
      }
    }

    /* The string is drawn first (it runs up behind the palm crowns), the flags later
       (in front of them); both ask this for the string's shape at time t. */
    function stringAt(s, t) {
      var p = s.pic, tau = t - T.picado;
      // each end of the string drops, pulls taut and rebounds upward (never down into
      // the names); the left end leads, and every flag keeps swinging a little after
      var lift = p.y + p.fh + p.sag + 0.8 * U;
      var dA = Math.abs(1 - spring(tau, 1.2, 3.5)), dB = Math.abs(1 - spring(tau - 0.17, 1.2, 3.5));
      var yA = p.y - lift * dA, yB = p.y - lift * dB, slack = 1 - 0.6 * Math.min(1, dA + dB);
      // tied to the palms: the ends go where the trunks go
      var xA = p.x0 + (p.tied ? s.trees[0].sway * 0.9 : 0), xB = p.x1 + (p.tied ? s.trees[1].sway * 0.9 : 0);
      return function (u) {
        var x = lerp(xA, xB, u), wv = wind(x, t) * Math.sin(Math.PI * u);
        return [x + wv * p.fw * 0.1, lerp(yA, yB, u) + p.sag * slack * 4 * u * (1 - u) - Math.abs(wv) * p.fw * 0.05];
      };
    }

    function drawString(s, t) {
      var p = s.pic;
      if (t - T.picado <= 0) return;
      var pt = stringAt(s, t), i, q;
      plain();
      ctx.strokeStyle = 'rgba(8,26,16,0.2)'; ctx.lineWidth = Math.max(1, p.fw * 0.03); ctx.lineCap = 'round';
      for (var pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        for (i = 0; i <= 24; i++) { q = pt(i / 24); if (i) ctx.lineTo(q[0] + (pass ? 0 : 0.03 * U), q[1] + (pass ? 0 : 0.05 * U)); else ctx.moveTo(q[0] + (pass ? 0 : 0.03 * U), q[1] + (pass ? 0 : 0.05 * U)); }
        ctx.stroke();
        ctx.strokeStyle = '#5C5140';
      }
    }

    function drawPicado(s, t) {
      var p = s.pic, tau = t - T.picado;
      if (tau <= 0) return;
      var pt = stringAt(s, t);
      for (var i = 0; i < p.flags.length; i++) {
        var f = p.flags[i], a = pt(f.u), b = pt(f.u + 0.01), slope = Math.atan2(b[1] - a[1], b[0] - a[0]);
        var ti = tau - 0.17 * f.u, w = wind(a[0], t - 0.12);
        var swing = -0.085 * w - 0.03 * windOn * Math.sin(t * 1.9 + f.ph) + (ti > 0 ? f.kick * Math.exp(-2.4 * ti) * Math.cos(8.5 * ti + f.ph) : 0);
        var rot = slope * 0.75 + swing, shear = -swing * 0.55 + 0.04 * windOn * Math.sin(t * 2.7 + f.ph * 2), sy = 1 - Math.min(0.12, Math.abs(swing) * 0.5);
        var c = Math.cos(rot) * vs, sn = Math.sin(rot) * vs;
        ctx.setTransform(c, sn, (c * shear - sn) * sy, (sn * shear + c) * sy, a[0] * vs + vox, a[1] * vs + voy);
        ctx.drawImage(f.sp.img, -f.sp.ax, -f.sp.ay, f.sp.w, f.sp.h);
      }
    }

    /* Every ~14 s, one leaf lets go and drifts down one side of the clearing. */
    function drawDrift(s, t) {
      if (!windOn) return;
      var FIRST = 12.5, EVERY = 13.7, DUR = 7.5;
      var k = Math.floor((t - FIRST) / EVERY);
      if (k < 0) return;
      var u = (t - FIRST - k * EVERY) / DUR;
      if (u >= 1) return;
      var rr = makeRng(SEED + 4000 + k * 97), left = (k % 2 === 0), d = s.drift[k % s.drift.length];
      var x0 = left ? Math.max(0.5 * U, C.x0 - 0.35 * U) : Math.min(W - 0.5 * U, C.x1 + 0.35 * U);
      x0 += rr.range(-0.2, 0.2) * U;
      var ph = rr.range(0, TAU), turns = rr.range(2.2, 3.2), amp = rr.range(0.35, 0.6) * U;
      var fall = u * u * 0.35 + u * 0.65, a = turns * TAU * u + ph;
      var x = x0 + Math.sin(a) * amp * (0.4 + 0.6 * u) + wind(x0, t) * 0.3 * U;
      var y = lerp(-0.6 * U, H + 0.6 * U, fall) - Math.abs(Math.cos(a)) * 0.12 * U;
      // it never passes behind the copy: where the copy is, it slides down the outside of it
      for (var i = 0; i < zones.length; i++) {
        var z = zones[i];
        if (!(z.m & TEXT)) continue;
        var ry = z.ry + 0.32 * U, dy = Math.abs(y - z.cy) / ry;
        if (dy >= 1) continue;
        var half = (z.rx + 0.32 * U) * Math.pow(1 - dy * dy * dy * dy, 0.25);
        x = left ? Math.min(x, z.cx - half) : Math.max(x, z.cx + half);
      }
      var rot = Math.cos(a) * 0.9 + ph + u * 1.5;
      var flipX = 0.3 + 0.7 * Math.abs(Math.cos(a * 0.5 + ph));         // turns edge-on and back as it tumbles
      ctx.globalAlpha = 0.22; sprite(d.sh, x + 0.07 * U, y + 0.11 * U, rot, flipX, 1);
      ctx.globalAlpha = 1; sprite(d.sp, x, y, rot, flipX, 1);
    }

    function render(t) {
      var s = scene;
      if (!s) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
      ctx.drawImage(s.paper, 0, 0, canvas.width, canvas.height);
      for (var i = 0; i < s.items.length; i++) {
        var it = s.items[i];
        if (it.kind === 'leaf') drawLeaf(it.o, t);
        else if (it.kind === 'trunk') drawTrunk(it.o, t);
        else if (it.kind === 'nuts') drawNuts(it.o, t);
        else if (it.kind === 'wall') drawWall(s, t);
        else if (it.kind === 'string') drawString(s, t);
        else if (it.kind === 'picado') drawPicado(s, t);
        else if (it.kind === 'flowers') drawFlowers(s, t);
        else if (it.kind === 'drift') drawDrift(s, t);
      }
      ctx.globalAlpha = 1;
      if (debug) {
        plain(); ctx.lineWidth = 1;
        zones.forEach(function (z) {
          ctx.strokeStyle = z.m === TEXT ? '#E0387E' : z.m === PICADO ? '#2B4FC4' : '#F2A33C';
          ctx.strokeRect(z.cx - z.rx, z.cy - z.ry, z.rx * 2, z.ry * 2);
        });
      }
      updateCopy(t);
    }

    /* ------------------------------------------------------------------
       8. THE COPY — real HTML, driven by the same clock
       ------------------------------------------------------------------ */
    function put(el, prop, val) {
      var c = el.__s || (el.__s = {});
      if (c[prop] !== val) { c[prop] = val; el.style[prop] = val; }
    }
    function clearCopyStyles() {
      els.lines.concat([els.sub, els.tag], els.chips, els.meta).forEach(function (el) {
        el.__s = {}; el.style.transform = ''; el.style.opacity = ''; el.style.visibility = ''; el.style.clipPath = ''; el.style.webkitClipPath = '';
      });
    }
    var metaLen = els.meta.map(function (m) { return (m.textContent || '').length; });
    var refocus = false;                        // Replay was used from the keyboard: hand focus back when it returns

    function updateCopy(t) {
      var i, p, e;
      // names: each word rises out of its slot
      for (i = 0; i < els.lines.length; i++) {
        p = prog(t, T.names + i * T.nameStagger, T.nameDur); e = expoOut(p);
        put(els.lines[i], 'visibility', p <= 0 ? 'hidden' : '');
        put(els.lines[i], 'transform', p >= 1 ? '' : 'translate3d(0,' + ((1 - e) * 118).toFixed(2) + '%,0) rotate(' + ((1 - e) * (i === 1 ? -9 : 4)).toFixed(2) + 'deg)');
      }
      // "are getting married"
      p = prog(t, T.sub, 0.7); e = quintOut(p);
      put(els.sub, 'opacity', p >= 1 ? '' : e.toFixed(3));
      put(els.sub, 'transform', p >= 1 ? '' : 'translate3d(0,' + ((1 - e) * 12).toFixed(2) + 'px,0)');
      // six-colour bar: chips wipe in one after another
      for (i = 0; i < els.chips.length; i++) {
        p = prog(t, T.sub + 0.18 + i * 0.05, 0.5);
        put(els.chips[i], 'transform', p >= 1 ? '' : 'scaleX(' + expoOut(p).toFixed(4) + ')');
      }
      // place and date: typed on, a character at a time
      for (i = 0; i < els.meta.length; i++) {
        p = prog(t, T.meta + i * 0.24, 0.48);
        var shown = Math.ceil(p * metaLen[i]) / metaLen[i], cp = p >= 1 ? '' : 'inset(-20% ' + ((1 - shown) * 100).toFixed(2) + '% -20% 0)';
        put(els.meta[i], 'visibility', p <= 0 ? 'hidden' : '');
        put(els.meta[i], 'clipPath', cp); put(els.meta[i], 'webkitClipPath', cp);
      }
      // "Coming soon": pressed down like a label
      var tau = t - T.tag;
      if (tau <= 0) { put(els.tag, 'visibility', 'hidden'); put(els.tag, 'transform', ''); put(els.tag, 'opacity', ''); }
      else if (tau > 1.6) { put(els.tag, 'visibility', ''); put(els.tag, 'transform', ''); put(els.tag, 'opacity', ''); }
      else {
        e = spring(tau, 2.3, 6.5);
        put(els.tag, 'visibility', '');
        put(els.tag, 'opacity', clamp(tau / 0.12).toFixed(3));
        put(els.tag, 'transform', 'rotate(' + lerp(7, -3, e).toFixed(2) + 'deg) scale(' + lerp(1.55, 1, e).toFixed(4) + ')');
      }
      // replay
      p = prog(t, T.end, 0.6);
      var show = p > 0 && !reduced;
      put(els.replay, 'visibility', show ? 'visible' : 'hidden');
      put(els.replay, 'opacity', p.toFixed(3));
      if (show && refocus) { refocus = false; try { els.replay.focus({ preventScroll: true }); } catch (err) { /* older browsers */ } }
      if (!root.classList.contains('live')) root.classList.add('live');
    }

    /* ------------------------------------------------------------------
       9. THE CLOCK
       ------------------------------------------------------------------ */
    var playing = false, held = false, tNow = 0, wall0 = 0, raf = 0;
    var pendingQuality = 0;                     // a change of resolution waiting for the start of the next frame
    var ghost = null;                           // the old picture, fading out over a freshly planted jungle

    function frame(now) {
      raf = 0;
      if (!playing) return;
      tNow = Math.max(0, (now - wall0) / 1000);
      try {
        // resize and redraw land in the same frame, so the picture never blanks
        if (pendingQuality) { quality = pendingQuality; pendingQuality = 0; sizeCanvas(); }
        render(tNow);
        if (ghost) drawGhost(now);
      } catch (err) { giveUp(err); return; }
      watchdog(now);
      raf = requestAnimationFrame(frame);
    }

    function drawGhost(now) {
      var a = 1 - (now - ghost.t0) / 260;
      if (a <= 0) { ghost.img.width = ghost.img.height = 0; ghost = null; return; }
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = a * a * (3 - 2 * a);
      ctx.drawImage(ghost.img, 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
    }

    /* If frames are STEADILY slow, quietly draw at a lower resolution (the composition
       and timing do not change). It looks at whole 90-frame windows and needs two slow
       ones in a row, so one hiccup, a rotation or a tab switch never trips it. A clean
       30fps cadence (iOS Low Power Mode caps everything there) is left alone, because
       fewer pixels cannot make that faster. Never runs for frozen ?t= frames. */
    var wd = { on: true, last: 0, n: 0, sum: 0, capped: 0, slow: 0, before: 0, prev: 1 };
    function wdReset() { wd.last = 0; wd.n = 0; wd.sum = 0; wd.capped = 0; wd.slow = 0; wd.before = 0; }
    function watchdog(now) {
      var dt = wd.last ? now - wd.last : 0; wd.last = now;
      if (!wd.on || dt <= 0 || dt > 100 || tNow < 0.6) return;           // first frame, a hitch, a tab switch: not evidence
      wd.sum += dt; wd.n++; if (dt >= 28) wd.capped++;
      if (wd.n < 90) return;
      var mean = wd.sum / wd.n, cap = mean > 29 && mean < 37 && wd.capped > 81;
      wd.n = 0; wd.sum = 0; wd.capped = 0;
      if (wd.before) {                                                   // we stepped down a window ago: did it help?
        if (mean > wd.before * 0.85) { pendingQuality = wd.prev; wd.on = false; }
        wd.before = 0; wd.slow = 0;
        return;
      }
      if (cap) { wd.on = false; return; }
      if (mean <= 20) { wd.slow = 0; return; }
      if (++wd.slow >= 2 && quality > 0.6) {
        wd.before = mean; wd.prev = quality; wd.slow = 0;
        pendingQuality = quality > 0.8 ? 0.75 : 0.56;
      }
    }

    function shownT() { return reduced ? REST_T : frozen !== null ? frozen : tNow; }
    function play() {
      held = false;
      if (!ready || !scene || reduced || frozen !== null || playing || document.hidden) return;
      playing = true;
      wdReset();
      wall0 = performance.now() - tNow * 1000;
      raf = requestAnimationFrame(frame);
    }
    function pause() { playing = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
    function seek(t) {
      tNow = Math.max(0, +t || 0);
      if (frozen !== null) frozen = tNow;       // a frozen page stays frozen, at the new frame
      wall0 = performance.now() - tNow * 1000;
      render(tNow);
    }

    cleanup = function () {
      pause();
      clearCopyStyles();
      canvas.style.display = 'none';
      els.replay.style.visibility = ''; els.replay.style.opacity = '';
    };

    window.__timeline = {
      duration: T.end,
      seek: seek,
      play: function () { frozen = null; play(); },
      pause: function () { held = true; pause(); }
    };

    els.replay.addEventListener('click', function (e) {
      refocus = e.detail === 0;                 // activated from the keyboard
      frozen = null;
      seek(0); play();
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) pause(); else if (!held) play();
    });

    if (mqReduced) {
      var onReduced = function () {
        reduced = mqReduced.matches; windOn = reduced ? 0 : 1;
        if (!ready || !scene) return;
        if (reduced) { pause(); render(REST_T); } else if (frozen === null) { tNow = REST_T; play(); }
      };
      if (mqReduced.addEventListener) mqReduced.addEventListener('change', onReduced);
      else if (mqReduced.addListener) mqReduced.addListener(onReduced);
    }

    /* Re-plant the jungle for the current stage size. While playing, the old picture
       fades out over the new one instead of popping. */
    function replant() {
      if (playing && scene && canvas.width > 1) {
        var g = mkCanvas(canvas.width, canvas.height);
        g.getContext('2d').drawImage(canvas, 0, 0);
        if (ghost) ghost.img.width = ghost.img.height = 0;
        ghost = { img: g, t0: performance.now() };
      }
      build();
      wdReset();
      render(shownT());
    }

    /* Show the planted scene on a stage of a different size without re-planting:
       scaled to cover (never stretched) and slid so the clearing stays behind the copy. */
    function fitView(w, h) {
      var k = Math.max(w / W, h / H), a = anchorNow();
      view.k = k; view.w = w; view.h = h;
      view.x = clamp(a[0] - anchor[0] * k, w - W * k, 0);
      view.y = clamp(a[1] - anchor[1] * k, h - H * k, 0);
      sizeCanvas();
      render(shownT());
    }

    // resize / rotate. Straight away: fit the current jungle to the new box. Then, once
    // the size has settled, re-plant it for the new shape - unless only the height moved
    // a little and the copy is exactly the size it was (a phone's browser toolbar sliding
    // in or out), in which case the fit is enough.
    var resizeTimer = 0, lastW = 0, lastH = 0;
    function onResize() {
      var w = stage.clientWidth, h = stage.clientHeight;
      if (w === lastW && h === lastH) return;
      lastW = w; lastH = h;
      if (!ready || !scene) return;             // not planted yet: the first build measures the new size itself
      try { fitView(w, h); } catch (err) { giveUp(err); return; }
      clearTimeout(resizeTimer);
      if (w === W && Math.abs(h - H) < 0.15 * H && layoutKey() === builtKey) return;
      resizeTimer = setTimeout(function () {
        try { replant(); } catch (err) { giveUp(err); }
      }, 140);
    }
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    /* ------------------------------------------------------------------
       10. START — but not before the fonts are in, so nothing is measured
           (or seen) in a fallback face
       ------------------------------------------------------------------ */
    function fontsReady() {
      if (!document.fonts || !document.fonts.load) return Promise.resolve(true);
      var faces = ['400 1em "Instrument Serif"', 'italic 400 1em "Instrument Serif"', '400 1em "Space Mono"', '700 1em "Space Mono"', '600 1em "Bricolage Grotesque"'];
      var all = Promise.all(faces.map(function (f) { return document.fonts.load(f, 'Kyle & Daina é').catch(function () {}); })).then(function () { return true; });
      var late = new Promise(function (res) { setTimeout(function () { res(false); }, 1500); });
      return Promise.race([all, late]).then(function (inTime) {
        // Fonts that arrive after the timeout: only re-plant if the copy actually moved.
        if (!inTime) all.then(function () {
          try {
            if (!scene) return;
            clearCopyStyles();
            var now = copyRects(), moved = 0;
            now.forEach(function (r, i) { var b = builtRects[i]; moved = Math.max(moved, Math.abs(r.x0 - b.x0), Math.abs(r.x1 - b.x1), Math.abs(r.y0 - b.y0), Math.abs(r.y1 - b.y1)); });
            if (moved > 0.5) replant(); else render(shownT());
          } catch (err) { giveUp(err); }
        });
        return inTime;
      });
    }

    fontsReady().then(function () {
      try {
        ready = true;
        lastW = stage.clientWidth; lastH = stage.clientHeight;
        build();
        if (reduced) { render(REST_T); return; }           // finished composition, no motion
        if (frozen !== null) { tNow = frozen; render(frozen); return; }
        tNow = lateStart ? REST_T : 0;                     // arrived late: the copy is already up, skip the intro
        render(tNow);
        play();
      } catch (err) { giveUp(err); }
    });
  }
})();
