/* ==========================================================================
   plants.js — the botanical drawing kit for the Paper Jungle
   --------------------------------------------------------------------------
   Nothing here knows about time or the page. Each function describes ONE
   plant part as flat shapes ("ops") in a tiny unit space, and raster() cuts
   that description out of "paper" into an offscreen canvas (a sprite) once.
   paper.js then only moves those sprites around.

   Conventions
   - Unit space: the part's base sits at (0,0) and it grows "up" (towards -y).
     Unless noted, the part is 1 unit long.
   - Headings: 0 = straight up, positive = clockwise, in radians.
   - Every random choice comes from a seeded PRNG, so the same seed always
     grows the same leaf.

   Parts
     frond()     coconut / pinnate palm frond: curved rib, feathered leaflets
     fan()       fan-palm blade: pleated segments from one hub, split at the rim
     paddle()    banana leaf (torn) or bird-of-paradise leaf (stiff, pointed)
     monstera()  split leaf with holes
     spathe() sepal() petal()   the three pieces of a bird-of-paradise flower
     coconuts()  the cluster under a palm crown
     flag()      one papel picado flag
   and the paper-making:
     raster()    cut a part out of card (lit edge, shaded edge, grain)
     shadow()    its soft drop shadow      bake()   part + shadow as one sprite
   ========================================================================== */
(function (global) {
  'use strict';

  var DEG = Math.PI / 180;
  function clamp(v, a, b) { a = a === undefined ? 0 : a; b = b === undefined ? 1 : b; return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { t = clamp(t); return t * t * (3 - 2 * t); }
  function head(a) { return [Math.sin(a), -Math.cos(a)]; }           // heading -> unit vector

  /* ---------- seeded randomness ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function makeRng(seed) {
    var r = mulberry32(seed);
    r.range = function (a, b) { return a + (b - a) * r(); };
    r.int = function (a, b) { return Math.floor(a + (b - a + 1) * r()); };
    r.pick = function (arr) { return arr[Math.floor(r() * arr.length)]; };
    r.sign = function () { return r() < 0.5 ? -1 : 1; };
    r.weighted = function (table) {                                   // {name: weight}
      var k, sum = 0; for (k in table) sum += table[k];
      var x = r() * sum; for (k in table) { x -= table[k]; if (x <= 0) return k; }
      return k;
    };
    return r;
  }

  /* ---------- colour ---------- */
  function hexToRgb(h) { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(function (v) { v = clamp(Math.round(v), 0, 255).toString(16); return v.length < 2 ? '0' + v : v; }).join('');
  }
  function mix(a, b, t) { var A = hexToRgb(a), B = hexToRgb(b); return rgbToHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)); }
  function luma(h) { var c = hexToRgb(h); return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; }
  function darker(h, k) { return mix(h, '#0A1F14', k); }
  /* The second tone of a folded leaf, and the tones of its midrib and cut veins. */
  function tones(base) {
    var l = luma(base), light = l > 0.36;
    return {
      a: base,
      b: darker(base, l > 0.45 ? 0.2 : 0.26),
      rib: light ? darker(base, 0.4) : mix(base, '#C3D862', 0.5),
      vein: light ? darker(base, 0.5) : mix(base, '#C3D862', 0.6),
      veinA: light ? 0.15 : 0.3
    };
  }

  /* ---------- geometry helpers ---------- */
  /* A curved centre line: starts at the origin heading a0, turns by `curl` in total. */
  function spine(n, len, a0, curl, pow) {
    var xs = new Float32Array(n + 1), ys = new Float32Array(n + 1), as = new Float32Array(n + 1);
    var x = 0, y = 0, ds = len / n;
    for (var i = 0; i <= n; i++) {
      var a = a0 + curl * Math.pow(i / n, pow);
      xs[i] = x; ys[i] = y; as[i] = a;
      x += Math.sin(a) * ds; y -= Math.cos(a) * ds;
    }
    return { xs: xs, ys: ys, as: as, n: n };
  }
  function at(sp, s) {
    var f = clamp(s) * sp.n, i = Math.min(sp.n - 1, Math.floor(f)), k = f - i;
    return [lerp(sp.xs[i], sp.xs[i + 1], k), lerp(sp.ys[i], sp.ys[i + 1], k), lerp(sp.as[i], sp.as[i + 1], k)];
  }
  /* A tapered strip along a spine, as one closed polygon. */
  function ribbon(sp, s0, s1, w0, w1, steps) {
    var L = [], R = [], i, s, p, w;
    for (i = 0; i <= steps; i++) {
      s = lerp(s0, s1, i / steps); p = at(sp, s); w = lerp(w0, w1, i / steps);
      L.push(p[0] - Math.cos(p[2]) * w, p[1] - Math.sin(p[2]) * w);
      R.push(p[0] + Math.cos(p[2]) * w, p[1] + Math.sin(p[2]) * w);
    }
    var out = L.slice();
    for (i = steps; i >= 0; i--) out.push(R[i * 2], R[i * 2 + 1]);
    return out;
  }
  function ellipse(cx, cy, rx, ry, rot, n) {
    var p = [], c = Math.cos(rot || 0), s = Math.sin(rot || 0);
    n = n || 14;
    for (var i = 0; i < n; i++) {
      var a = i / n * Math.PI * 2, x = Math.cos(a) * rx, y = Math.sin(a) * ry;
      p.push(cx + x * c - y * s, cy + x * s + y * c);
    }
    return p;
  }
  function quad(p0, c, p1, n, out) {                                   // sample a quadratic bezier
    for (var i = 0; i <= n; i++) {
      var t = i / n, u = 1 - t;
      out.push(u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]);
    }
    return out;
  }

  /* ======================================================================
     FROND — coconut / pinnate palm
     A drooping rib with many narrow tapered leaflets down both sides. Leaflet
     length follows an envelope (short at the base, longest ~38% along, fading
     to the tip); each leaflet sweeps forward and hangs a little with gravity.
     o: { curl, pairs, lmax, lw (leaflet width as a share of the spacing), grav:[x,y], gAmt, col, split }
     ====================================================================== */
  function frond(rng, o) {
    var t = tones(o.col), sp = spine(44, 1, -o.curl * 0.22, o.curl, 1.3);
    var N = o.pairs, hull = [0, 0], i, k;
    // With o.split the frond comes back in two pieces, hinged half-way along the
    // rib, so the outer half can lag behind and bend in the wind.
    var CUT = 0.5, J = at(sp, CUT), ox = o.split ? J[0] : 0, oy = o.split ? J[1] : 0;
    var near = [[], []], far = [[], []];
    for (i = 0; i < N; i++) {
      var s = 0.1 + 0.885 * Math.pow(i / (N - 1), 0.96);
      var p = at(sp, s), a = p[2], T = head(a);
      var env = s < 0.36 ? lerp(0.42, 1, smooth(s / 0.36)) : lerp(1, 0.13, Math.pow((s - 0.36) / 0.64, 1.3));
      var part = o.split && s >= CUT ? 1 : 0, sx = part ? ox : 0, sy = part ? oy : 0;
      for (k = 0; k < 2; k++) {
        if (rng() < 0.035) continue;                                   // the odd missing leaflet
        var side = k ? 1 : -1;
        var open = (lerp(66, 24, s) + rng.range(-5, 5)) * DEG;
        var d = head(a + side * open), g = o.gAmt * (0.45 + 0.85 * s);
        var dx = d[0] + o.grav[0] * g, dy = d[1] + o.grav[1] * g, dl = Math.hypot(dx, dy); dx /= dl; dy /= dl;
        var L = o.lmax * env * rng.range(0.9, 1.07) * (rng() < 0.05 ? 0.62 : 1);
        var hb = (0.885 / N) * o.lw * (0.55 + 0.45 * env);          // a share of the gap to the next leaflet
        var nx = -dy * side, ny = dx * side;
        var tx = p[0] + dx * L + o.grav[0] * L * 0.17, ty = p[1] + dy * L + o.grav[1] * L * 0.17;
        var mx = p[0] + dx * L * 0.42, my = p[1] + dy * L * 0.42;
        (k ? near : far)[part].push([
          p[0] - T[0] * hb - sx, p[1] - T[1] * hb - sy,
          mx + nx * hb * 1.55 - sx, my + ny * hb * 1.55 - sy, tx - sx, ty - sy,
          mx - nx * hb * 1.55 - sx, my - ny * hb * 1.55 - sy, p[0] + T[0] * hb - sx, p[1] + T[1] * hb - sy
        ]);
        if (i % 2 === 0) hull.push(tx, ty);
      }
      if (i % 5 === 0) hull.push(p[0], p[1]);
    }
    var tip = at(sp, 1); hull.push(tip[0], tip[1]);
    var shift = function (poly) { for (var q = 0; q < poly.length; q += 2) { poly[q] -= ox; poly[q + 1] -= oy; } return poly; };
    var wAt = function (u) { return lerp(0.013, 0.0022, u); };
    if (!o.split) {
      return {
        ops: [
          { k: 'f', q: 1, c: t.b, polys: far[0] },
          { k: 'f', q: 1, c: t.a, polys: near[0] },
          { k: 'f', c: t.rib, polys: [ribbon(sp, 0, 1, wAt(0), wAt(1), 30)] }
        ],
        hull: hull
      };
    }
    return {
      ops: [
        { k: 'f', q: 1, c: t.b, polys: far[0] },
        { k: 'f', q: 1, c: t.a, polys: near[0] },
        { k: 'f', c: t.rib, polys: [ribbon(sp, 0, CUT + 0.03, wAt(0), wAt(CUT + 0.03), 16)] }
      ],
      tip: {
        ops: [
          { k: 'f', q: 1, c: t.b, polys: far[1] },
          { k: 'f', q: 1, c: t.a, polys: near[1] },
          { k: 'f', c: t.rib, polys: [shift(ribbon(sp, CUT - 0.02, 1, wAt(CUT - 0.02), wAt(1), 16))] }
        ],
        hull: [0, 0],
        jx: J[0], jy: J[1]                                             // where the hinge sits on the first piece
      },
      hull: hull
    };
  }

  /* ======================================================================
     FAN — fan palm blade (palmate)
     Pleated segments radiating from one hub; fused for the inner half, then
     each one runs out to a point that is split at the very tip. The outer
     side segments sag with gravity.
     o: { blades, span (rad), fuse, sag, grav:[x,y], col }
     Unit: radius 1. Base (0,0) is the hub.
     ====================================================================== */
  function fan(rng, o) {
    var t = tones(o.col), N = o.blades, half = o.span / 2, del = o.span / N / 2;
    var A = [], B = [], ribs = [], hull = [0, 0];
    function fall(phi) { return 1 - 0.3 * Math.pow(Math.abs(phi) / half, 2.2); }
    function P(phi, r) {
      var x = Math.sin(phi) * r, y = -Math.cos(phi) * r;
      var k = r > o.fuse ? Math.pow((r - o.fuse) / (1 - o.fuse), 2) * o.sag * Math.abs(Math.sin(phi * 0.9)) : 0;
      return [x + o.grav[0] * k, y + o.grav[1] * k];
    }
    for (var i = 0; i < N; i++) {
      var phi = -half + o.span * (i + 0.5) / N, R = fall(phi) * rng.range(0.93, 1.04);
      var v0 = P(phi - del, o.fuse * fall(phi - del)), v1 = P(phi + del, o.fuse * fall(phi + del));
      var s0 = P(phi - del * 0.66, R * 0.8), s1 = P(phi + del * 0.66, R * 0.8);
      var t0 = P(phi - del * 0.13, R), tn = P(phi, R * 0.905), t1 = P(phi + del * 0.13, R * 0.985);
      A.push([0, 0, v0[0], v0[1], s0[0], s0[1], t0[0], t0[1], tn[0], tn[1], t1[0], t1[1], s1[0], s1[1], v1[0], v1[1]]);
      B.push([0, 0, tn[0], tn[1], t1[0], t1[1], s1[0], s1[1], v1[0], v1[1]]);
      ribs.push([0, 0, tn[0], tn[1]]);
      hull.push(t0[0], t0[1], s0[0], s0[1]);
    }
    return {
      ops: [
        { k: 'f', c: t.a, polys: A, sep: 1 },
        { k: 'f', c: t.b, polys: B, sep: 1 },
        { k: 'l', c: t.rib, w: 0.9, a: 0.55, segs: ribs },
        { k: 'f', c: t.rib, polys: [ellipse(0, 0, 0.05, 0.05, 0, 10)] }
      ],
      hull: hull
    };
  }

  /* ======================================================================
     PADDLE — banana leaf, or bird-of-paradise leaf
     banana: a very large oblong paddle, strong pale midrib, fine parallel
             side veins, and wind tears: clean splits from the margin in
             toward the midrib, some with a corner blown away.
     bop:    the same idea, stiffer: narrower, pointed, untorn, grey-green.
     o: { kind:'banana'|'bop', bend, W, sweep, veinStep, tears:[min,max], col, rib? }
     Unit: blade length 1. Base (0,0) is where the stalk meets the blade.
     ====================================================================== */
  function paddle(rng, o) {
    var t = tones(o.col), n = 44, sp = spine(n, 1, -o.bend * 0.35, o.bend, 1.5);
    var bop = o.kind === 'bop';
    var wL = o.W * rng.range(0.9, 1.06), wR = o.W * rng.range(0.9, 1.06);
    var ph = rng.range(0, 6);
    function prof(u) {
      var rise, fall;
      if (bop) {
        rise = Math.sqrt(1 - Math.pow(1 - Math.min(1, u / 0.26), 2));
        fall = u < 0.4 ? 1 : Math.pow(Math.max(0, 1 - Math.pow((u - 0.4) / 0.6, 1.75)), 0.85);
        return Math.pow(rise, 0.9) * fall;
      }
      rise = Math.sqrt(1 - Math.pow(1 - Math.min(1, u / 0.15), 2));
      fall = u < 0.6 ? 1 : Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.6) / 0.4, 2.1)));
      return Math.pow(rise, 0.75) * fall * (1 - 0.07 * u);
    }
    function edge(u, side, k) {
      var p = at(sp, u), d = head(p[2] + side * (Math.PI / 2 - o.sweep));
      var w = (side > 0 ? wR : wL) * prof(u) * (k || 1) * (1 + 0.014 * Math.sin(u * 37 + ph + side));
      return [p[0] + d[0] * w, p[1] + d[1] * w];
    }
    var halves = [[], []], hull = [], i, side, u, e, m;
    for (side = -1; side <= 1; side += 2) {
      var poly = halves[side < 0 ? 0 : 1];
      for (i = 0; i <= n; i++) poly.push(sp.xs[i], sp.ys[i]);
      for (i = n; i >= 0; i--) { e = edge(i / n, side); poly.push(e[0], e[1]); if (i % 4 === 0) hull.push(e[0], e[1]); }
    }
    var veins = [];
    for (u = 0.035; u < 0.975; u += o.veinStep) {
      m = at(sp, u);
      for (side = -1; side <= 1; side += 2) { e = edge(u, side, 0.97); veins.push([m[0], m[1], e[0], e[1]]); }
    }
    var cuts = [];
    for (side = -1; side <= 1; side += 2) {
      var count = rng.int(o.tears[0], o.tears[1]), us = [], tries = 0;
      while (us.length < count && tries++ < 40) {
        u = rng.range(0.13, 0.93);
        if (us.every(function (v) { return Math.abs(v - u) > 0.075; })) us.push(u);
      }
      for (i = 0; i < us.length; i++) {
        u = us[i]; m = at(sp, u); e = edge(u, side);
        var depth = rng.range(0.5, 0.95), g = rng.range(0.004, 0.012);
        var o1 = edge(u - g, side, 1.07), o2 = edge(u + g * 1.7, side, 1.07);
        cuts.push([lerp(e[0], m[0], depth), lerp(e[1], m[1], depth), o1[0], o1[1], o2[0], o2[1]]);
        if (rng() < 0.4) {                                             // a corner of the flap has blown away
          var w = rng.range(0.03, 0.07), c1 = edge(u + g, side, 1.07), c2 = edge(u + g + w, side, 1.07);
          var e2 = edge(u + 0.01, side), m2 = at(sp, u + 0.01), kk = rng.range(0.16, 0.3);
          cuts.push([c1[0], c1[1], c2[0], c2[1], lerp(e2[0], m2[0], kk), lerp(e2[1], m2[1], kk)]);
        }
      }
    }
    var rib = o.rib || t.rib;
    return {
      ops: [
        { k: 'f', c: t.a, polys: [halves[0]] },
        { k: 'f', c: t.b, polys: [halves[1]] },
        { k: 'l', c: t.vein, w: 0.75, a: t.veinA * (bop ? 0.7 : 1), segs: veins },
        { k: 'cut', polys: cuts },
        { k: 'f', c: rib, polys: [ribbon(sp, 0, 0.985, bop ? 0.017 : 0.023, 0.003, 26)] }
      ],
      hull: hull,
      ribCol: rib
    };
  }

  /* ======================================================================
     MONSTERA — split leaf with holes
     A heart-shaped blade. Slots are cut from the margin toward the midrib
     between the side veins, and a few oval holes sit near the midrib.
     o: { wide, col }   Unit: 1 = stalk joint to tip; the lobes hang behind.
     ====================================================================== */
  function monstera(rng, o) {
    var t = tones(o.col), wide = o.wide;
    var KEYS = [[0, 1], [14, 0.93], [30, 0.79], [50, 0.66], [72, 0.58], [95, 0.55], [118, 0.54], [140, 0.48], [158, 0.36], [172, 0.19], [180, 0.05]];
    function rad(deg) {
      deg = Math.abs(deg);
      for (var i = 1; i < KEYS.length; i++) if (deg <= KEYS[i][0]) {
        return lerp(KEYS[i - 1][1], KEYS[i][1], smooth((deg - KEYS[i - 1][0]) / (KEYS[i][0] - KEYS[i - 1][0])));
      }
      return 0.05;
    }
    function inside(x, y) { var th = Math.atan2(x / wide, -y) / DEG; return Math.hypot(x / wide, y) < rad(th); }
    var halves = [[0, 0], [0, 0]], hull = [], side, deg, r, i;
    for (side = -1; side <= 1; side += 2) {
      var poly = halves[side < 0 ? 0 : 1];
      for (deg = 180; deg >= 0; deg -= 4) {
        r = rad(deg);
        var x = Math.sin(deg * DEG) * r * wide * side, y = -Math.cos(deg * DEG) * r;
        poly.push(x, y);
        if (deg % 16 === 0) hull.push(x, y);
      }
    }
    // Five deep wedges a side split the blade into fingers; each wedge is narrow and
    // round at the midrib end and opens wide at the margin, with its mouth corners rounded off.
    var cuts = [], veins = [], US = [0.06, 0.24, 0.42, 0.6, 0.77];
    for (side = -1; side <= 1; side += 2) {
      for (i = 0; i < US.length; i++) {
        var u = US[i] + rng.range(-0.025, 0.025), hd = side * lerp(125, 30, Math.pow(u, 0.85)) * DEG, d = head(hd);
        var D = 0; while (D < 1.4 && inside(d[0] * D, -u + d[1] * D)) D += 0.01;
        var nx = d[1], ny = -d[0];
        // the side vein that feeds the finger below this wedge
        var uv = u - 0.085, dv = head(side * lerp(125, 30, Math.pow(Math.max(0, uv), 0.85)) * DEG), Dv = 0;
        while (Dv < 1.4 && inside(dv[0] * Dv, -uv + dv[1] * Dv)) Dv += 0.01;
        if (uv > 0) veins.push([0, -uv, dv[0] * Dv * 0.9, -uv + dv[1] * Dv * 0.9]);
        if (rng() < 0.08) continue;
        var inner = D * rng.range(0.22, 0.36), w0 = rng.range(0.013, 0.02), w1 = w0 * rng.range(3.0, 3.8), slot = [], k;
        for (k = 0; k <= 6; k++) {                                     // rounded inner end
          var a = Math.PI * k / 6;
          slot.push(d[0] * (inner - Math.sin(a) * w0) + nx * Math.cos(a) * w0, -u + d[1] * (inner - Math.sin(a) * w0) + ny * Math.cos(a) * w0);
        }
        // out to the margin, flaring: the last stretch widens faster, which rounds the finger tips
        var wm = lerp(w0, w1, 0.7);
        slot.push(d[0] * D * 0.82 - nx * wm, -u + d[1] * D * 0.82 - ny * wm,
          d[0] * D * 1.0 - nx * w1 * 1.25, -u + d[1] * D * 1.0 - ny * w1 * 1.25,
          d[0] * D * 1.2 - nx * w1 * 2.3, -u + d[1] * D * 1.2 - ny * w1 * 2.3,
          d[0] * D * 1.2 + nx * w1 * 2.3, -u + d[1] * D * 1.2 + ny * w1 * 2.3,
          d[0] * D * 1.0 + nx * w1 * 1.25, -u + d[1] * D * 1.0 + ny * w1 * 1.25,
          d[0] * D * 0.82 + nx * wm, -u + d[1] * D * 0.82 + ny * wm);
        cuts.push(slot);
        if (rng() < 0.6 && u > 0.1 && u < 0.72) {                      // a hole between the wedge and the midrib
          var hr = D * rng.range(0.09, 0.15);
          cuts.push(ellipse(d[0] * hr, -u - 0.085 + d[1] * hr, 0.034, 0.018, hd - Math.PI / 2, 12));
        }
      }
    }
    var rib = [-0.012, 0.03, 0.012, 0.03, 0.004, -0.96, -0.004, -0.96];
    return {
      ops: [
        { k: 'f', c: t.a, polys: [halves[0]] },
        { k: 'f', c: t.b, polys: [halves[1]] },
        { k: 'l', c: t.rib, w: 1, a: 0.6, segs: veins },
        { k: 'f', c: t.rib, polys: [rib] },
        { k: 'cut', polys: cuts }
      ],
      hull: hull,
      ribCol: t.rib
    };
  }

  /* ======================================================================
     BIRD OF PARADISE (Strelitzia reginae) — three kinds of piece
     spathe : the horizontal beak-like boat at the top of the stalk
     sepal  : one long pointed orange "flame" (several rise out of the beak)
     petal  : the cobalt tongue that points forward out of the crest
     ====================================================================== */
  function spathe(rng, o) {              // unit: beak length 1, pointing +x; base (0,0) is the stalk joint
    var top = [], bot = [];
    quad([-0.09, 0.0], [0.26, -0.185], [1, -0.005], 16, top);
    quad([1, 0.005], [0.5, 0.25], [-0.03, 0.14], 16, bot);
    var body = top.concat(bot, [-0.12, 0.08]);
    var keel = []; quad([1, 0.01], [0.42, 0.08], [-0.14, 0.035], 10, keel); keel.push(-0.14, 0.3, 1, 0.3);
    var rim = []; quad([-0.05, -0.012], [0.27, -0.172], [0.985, -0.006], 14, rim);
    return {
      ops: [
        { k: 'f', c: o.col, polys: [body] },
        { k: 'atop', c: darker(o.col, 0.3), polys: [keel] },
        { k: 'l', c: o.rim, w: Math.max(1.4, o.rimW || 1.6), segs: [rim] }
      ],
      hull: [1, 0, 0.5, -0.1, 0, -0.08, 0.5, 0.14, 0, 0.14]
    };
  }
  function sepal(rng, o) {               // unit: length 1, base (0,0), pointing up
    var sp = spine(20, 1, -o.curl * 0.3, o.curl, 1.4), L = [], R = [], i;
    for (i = 0; i <= 20; i++) {
      var u = i / 20, w = Math.max(0.03 * (1 - u), o.w * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.78)), 0.9) * (1 - 0.2 * u));
      var c = Math.cos(sp.as[i]), s = Math.sin(sp.as[i]);
      L.push(sp.xs[i] - c * w, sp.ys[i] - s * w); R.push(sp.xs[i] + c * w, sp.ys[i] + s * w);
    }
    var mid = [], left = L.slice(), right = R.slice();
    for (i = 20; i >= 0; i--) { left.push(sp.xs[i], sp.ys[i]); right.push(sp.xs[i], sp.ys[i]); }
    for (i = 0; i <= 20; i += 2) mid.push(sp.xs[i], sp.ys[i]);
    return {
      ops: [
        { k: 'f', c: o.col, polys: [left] },
        { k: 'f', c: o.shade, polys: [right] },
        { k: 'l', c: o.hi, w: 0.8, a: 0.7, segs: [mid] }
      ],
      hull: [0, 0, 0, -1]
    };
  }
  function petal(rng, o) {               // the blue tongue: slim neck, a soft shoulder, then one long spear point. unit: length 1
    var n = 22, sp = spine(n, 1, -(o.curl || 0) * 0.3, o.curl || 0, 1.4), L = [], R = [], mid = [], i;
    for (i = 0; i <= n; i++) {
      var u = i / n;
      var w = u < 0.2 ? lerp(0.028, 0.09, smooth((u - 0.04) / 0.16)) : 0.09 * Math.pow(1 - (u - 0.2) / 0.8, 0.92);
      w = Math.max(w, 0.004);
      var c = Math.cos(sp.as[i]), s = Math.sin(sp.as[i]);
      L.push(sp.xs[i] - c * w, sp.ys[i] - s * w); R.push(sp.xs[i] + c * w, sp.ys[i] + s * w);
      if (i % 2 === 0 && u > 0.08 && u < 0.92) mid.push(sp.xs[i], sp.ys[i]);
    }
    var left = L.slice(), right = R.slice();
    for (i = n; i >= 0; i--) { left.push(sp.xs[i], sp.ys[i]); right.push(sp.xs[i], sp.ys[i]); }
    return {
      ops: [
        { k: 'f', c: o.col, polys: [left] },
        { k: 'f', c: o.shade, polys: [right] },
        { k: 'l', c: o.hi || '#5674DA', w: 0.8, a: 0.8, segs: [mid] }
      ],
      hull: [0, 0, 0, -1]
    };
  }

  /* Three coconuts and the green collar they hang from, for the top of a palm trunk.
     Each nut gets a lighter patch on its lit side so the three read as separate rounds.
     Unit: about one trunk-width across; base (0,0) is the trunk top. */
  function coconuts() {
    var ops = [];
    function nut(cx, cy, r, base) {
      ops.push({ k: 'f', c: base, polys: [ellipse(cx, cy, r, r * 1.08, 0, 16)] });
      ops.push({ k: 'atop', c: mix(base, '#F2C078', 0.4), polys: [ellipse(cx - r * 0.26, cy - r * 0.3, r * 0.5, r * 0.58, -0.5, 12)] });
    }
    nut(-0.37, 0.14, 0.33, '#6A4526'); nut(0.37, 0.18, 0.32, '#5E3C1F'); nut(0, 0.5, 0.36, '#7B5330');
    ops.push({ k: 'f', c: '#3E6B3A', polys: [ellipse(0, -0.1, 0.36, 0.2, 0, 14)] });
    return { ops: ops, hull: [0, 0] };
  }

  /* ======================================================================
     FLAG — one papel picado flag
     Tissue-paper rectangle with a scalloped hem and cut-out pattern.
     o: { col, variant }   Unit: width 1. Base (0,0) is top-centre; hangs DOWN (+y).
     ====================================================================== */
  function flag(rng, o) {
    var h = 1.22, n = 5, body = [-0.5, 0, 0.5, 0, 0.5, h], cuts = [], i, k, a;
    function lens(cx, cy, ang, r0, r1, w) {                           // a petal-shaped cut
      var d = [Math.cos(ang), Math.sin(ang)], nn = [-d[1], d[0]], p = [], m = (r0 + r1) / 2;
      p.push(cx + d[0] * r0, cy + d[1] * r0, cx + d[0] * m + nn[0] * w, cy + d[1] * m + nn[1] * w,
        cx + d[0] * r1, cy + d[1] * r1, cx + d[0] * m - nn[0] * w, cy + d[1] * m - nn[1] * w, cx + d[0] * r0, cy + d[1] * r0);
      return p;
    }
    function diamond(cx, cy, rx, ry) { return [cx, cy - ry, cx + rx, cy, cx, cy + ry, cx - rx, cy]; }
    for (i = 0; i < n; i++) {                                          // scalloped hem, right to left
      var x1 = 0.5 - i / n, x0 = 0.5 - (i + 1) / n, cx = (x0 + x1) / 2, r = (x1 - x0) / 2;
      for (k = 1; k <= 7; k++) { a = Math.PI * k / 7; body.push(cx + Math.cos(a) * r, h + Math.sin(a) * r * 0.95); }
      cuts.push(ellipse(cx, h + r * 0.12, r * 0.36, r * 0.36, 0, 10));
      cuts.push(diamond(cx, h - 0.15, 0.03, 0.05));
      if (i < n - 1) cuts.push(diamond(x0, h - 0.07, 0.022, 0.045));
    }
    for (i = 0; i < 7; i++) cuts.push(ellipse(-0.39 + i * 0.13, 0.165, 0.026, 0.026, 0, 8));
    var cy = 0.6, lensCuts = [];
    if (o.variant === 0) {                                             // eight-petal flower
      for (i = 0; i < 8; i++) lensCuts.push(lens(0, cy, i * Math.PI / 4, 0.085, 0.3, 0.052));
      cuts.push(ellipse(0, cy, 0.05, 0.05, 0, 10));
    } else if (o.variant === 1) {                                      // sun
      for (i = 0; i < 12; i++) { a = i * Math.PI / 6; cuts.push([Math.cos(a - 0.14) * 0.17, cy + Math.sin(a - 0.14) * 0.17, Math.cos(a) * 0.31, cy + Math.sin(a) * 0.31, Math.cos(a + 0.14) * 0.17, cy + Math.sin(a + 0.14) * 0.17]); }
      for (i = 0; i < 6; i++) lensCuts.push(lens(0, cy, i * Math.PI / 3 + 0.5, 0.035, 0.125, 0.03));
    } else {                                                           // four big petals and four small
      for (i = 0; i < 4; i++) lensCuts.push(lens(0, cy, i * Math.PI / 2, 0.07, 0.31, 0.075));
      for (i = 0; i < 4; i++) lensCuts.push(lens(0, cy, i * Math.PI / 2 + Math.PI / 4, 0.1, 0.23, 0.035));
      cuts.push(diamond(0, cy, 0.04, 0.04));
    }
    for (k = -1; k <= 1; k += 2) for (i = 0; i < 4; i++) cuts.push(diamond(k * 0.41, 0.34 + i * 0.165, 0.028, 0.048));
    return {
      ops: [
        { k: 'f', c: o.col, polys: [body] },
        { k: 'atop', c: darker(o.col, 0.25), polys: [[-0.5, 0, 0.5, 0, 0.5, 0.075, -0.5, 0.075]] },
        { k: 'cut', polys: cuts },
        { k: 'cut', polys: lensCuts, q: 1 }
      ],
      hull: [-0.5, 0, 0.5, 0, 0.5, h + 0.1, -0.5, h + 0.1]
    };
  }

  /* ======================================================================
     RASTER — cut a part out of paper, once
     px  = CSS pixels per unit (how long the part is on screen)
     res = canvas pixels per CSS pixel
     Adds what makes it read as card: a hairline lit edge (top-left), a
     hairline dark edge (bottom-right) and a little grain.
     Returns { img, ax, ay, w, h } in CSS pixels; (ax,ay) is where the part's
     base sits inside the sprite.
     ====================================================================== */
  var scratch = null;
  function getScratch(w, h) {
    if (!scratch) scratch = document.createElement('canvas');
    if (scratch.width < w) scratch.width = w;
    if (scratch.height < h) scratch.height = h;
    return scratch;
  }

  function trace(ctx, p, q) {
    var i;
    ctx.moveTo(p[0], p[1]);
    if (q) for (i = 2; i < p.length; i += 4) ctx.quadraticCurveTo(p[i], p[i + 1], p[i + 2], p[i + 3]);
    else for (i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
    ctx.closePath();
  }

  function drawOps(ctx, ops, px) {
    for (var o = 0; o < ops.length; o++) {
      var op = ops[o], i, j, p;
      ctx.globalAlpha = op.a === undefined ? 1 : op.a;
      if (op.k === 'l') {
        ctx.globalCompositeOperation = 'source-atop';
        ctx.strokeStyle = op.c; ctx.lineWidth = op.w / px; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath();
        for (i = 0; i < op.segs.length; i++) { p = op.segs[i]; ctx.moveTo(p[0], p[1]); for (j = 2; j < p.length; j += 2) ctx.lineTo(p[j], p[j + 1]); }
        ctx.stroke();
        continue;
      }
      ctx.globalCompositeOperation = op.k === 'cut' ? 'destination-out' : op.k === 'atop' ? 'source-atop' : 'source-over';
      ctx.fillStyle = op.k === 'cut' ? '#000' : op.c;
      if (op.sep || op.k === 'cut') {
        for (i = 0; i < op.polys.length; i++) { ctx.beginPath(); trace(ctx, op.polys[i], op.q); ctx.fill(); }
      } else {
        ctx.beginPath();
        for (i = 0; i < op.polys.length; i++) trace(ctx, op.polys[i], op.q);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  function raster(geo, px, res, opt) {
    opt = opt || {};
    var S = px * res, minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9, o, i, j, p;
    for (o = 0; o < geo.ops.length; o++) {
      var op = geo.ops[o];
      if (op.k !== 'f') continue;
      for (i = 0; i < op.polys.length; i++) {
        p = op.polys[i];
        for (j = 0; j < p.length; j += 2) {
          if (p[j] < minX) minX = p[j]; if (p[j] > maxX) maxX = p[j];
          if (p[j + 1] < minY) minY = p[j + 1]; if (p[j + 1] > maxY) maxY = p[j + 1];
        }
      }
    }
    var pad = Math.ceil(res * 2) + 2;
    var w = Math.max(2, Math.ceil((maxX - minX) * S) + pad * 2), h = Math.max(2, Math.ceil((maxY - minY) * S) + pad * 2);
    var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    var ctx = cv.getContext('2d');
    var ax = pad - minX * S, ay = pad - minY * S;
    ctx.setTransform(S, 0, 0, S, ax, ay);
    drawOps(ctx, geo.ops, px);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    if (opt.flat !== true) {
      var e = Math.max(1, Math.round(res * 0.8)), sc = getScratch(w, h), sx = sc.getContext('2d');
      var rim = function (dx, dy, color, alpha) {
        sx.setTransform(1, 0, 0, 1, 0, 0);
        sx.globalCompositeOperation = 'copy'; sx.globalAlpha = 1; sx.drawImage(cv, 0, 0);
        sx.globalCompositeOperation = 'source-in'; sx.fillStyle = color; sx.fillRect(0, 0, w, h);
        sx.globalCompositeOperation = 'destination-out'; sx.drawImage(cv, dx, dy);
        ctx.globalCompositeOperation = 'source-atop'; ctx.globalAlpha = alpha;
        ctx.drawImage(sc, 0, 0, w, h, 0, 0, w, h);
      };
      rim(e, e, '#FFFDE8', opt.light === undefined ? 0.42 : opt.light);     // lit edge of the card
      rim(-e, -e, '#06140C', opt.dark === undefined ? 0.26 : opt.dark);     // the edge in shade
      if (opt.grain) {
        ctx.globalCompositeOperation = 'source-atop'; ctx.globalAlpha = opt.grainAlpha === undefined ? 1 : opt.grainAlpha;
        ctx.fillStyle = ctx.createPattern(opt.grain, 'repeat');
        ctx.save(); ctx.translate(-(opt.gx || 0), -(opt.gy || 0)); ctx.fillRect(opt.gx || 0, opt.gy || 0, w, h); ctx.restore();
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }

    var hull = new Float32Array(geo.hull.length);
    for (i = 0; i < hull.length; i++) hull[i] = geo.hull[i] * px;
    return { img: cv, ax: ax / res, ay: ay / res, w: w / res, h: h / res, res: res, hull: hull, px: px };
  }

  /* A soft, low-resolution drop shadow of a sprite (made once, reused every frame).
     Built from nothing but drawImage and compositing, which every browser does the
     same way: the silhouette is tinted dark, then smeared by drawing it nine times in
     a ring, three times over with a shrinking radius (close to a gaussian blur). */
  var smear = [null, null];
  function shadow(sprite, blur, rgb) {
    var q = 0.34, r = sprite.res * q, R = Math.max(0.5, blur * r), b = Math.ceil(R * 1.35) + 1;
    var iw = Math.max(1, Math.round(sprite.img.width * q)), ih = Math.max(1, Math.round(sprite.img.height * q));
    var w = iw + b * 2, h = ih + b * 2, i, k;
    for (i = 0; i < 2; i++) {
      if (!smear[i]) smear[i] = document.createElement('canvas');
      if (smear[i].width < w) smear[i].width = w;
      if (smear[i].height < h) smear[i].height = h;
    }
    // (the two work canvases are shared and only ever grow, so each is wiped whole before
    // use: what a shadow looks like must not depend on which shadow was made before it)
    var src = smear[0], dst = smear[1], x = src.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    x.clearRect(0, 0, src.width, src.height);
    x.drawImage(sprite.img, b, b, iw, ih);
    x.globalCompositeOperation = 'source-in'; x.fillStyle = 'rgb(' + (rgb || '8,26,16') + ')'; x.fillRect(0, 0, w, h);
    var radii = [R * 0.62, R * 0.36, R * 0.18];
    for (k = 0; k < radii.length; k++) {
      x = dst.getContext('2d');
      x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
      x.clearRect(0, 0, dst.width, dst.height);
      x.globalCompositeOperation = 'lighter'; x.globalAlpha = 1 / 9;
      x.drawImage(src, 0, 0, w, h, 0, 0, w, h);
      for (i = 0; i < 8; i++) {
        var an = (i + k * 0.5) * Math.PI / 4;
        x.drawImage(src, 0, 0, w, h, Math.cos(an) * radii[k], Math.sin(an) * radii[k], w, h);
      }
      var swap = src; src = dst; dst = swap;
    }
    var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(src, 0, 0, w, h, 0, 0, w, h);
    return { img: cv, ax: sprite.ax + b / r, ay: sprite.ay + b / r, w: w / r, h: h / r };
  }

  /* Glue a sprite and its soft shadow into ONE sprite, so that part costs one draw
     per frame instead of two. (dx, dy) is the shadow's offset in the part's own
     space, in CSS pixels; alpha is how dark the shadow is. The two inputs are freed. */
  function bake(sprite, blur, dx, dy, alpha) {
    var sh = shadow(sprite, blur), res = sprite.res;
    var padL = Math.max(0, Math.ceil((sh.ax - dx - sprite.ax) * res)), padT = Math.max(0, Math.ceil((sh.ay - dy - sprite.ay) * res));
    var padR = Math.max(0, Math.ceil((sh.w - sh.ax + dx - (sprite.w - sprite.ax)) * res)), padB = Math.max(0, Math.ceil((sh.h - sh.ay + dy - (sprite.h - sprite.ay)) * res));
    var cv = document.createElement('canvas'); cv.width = sprite.img.width + padL + padR; cv.height = sprite.img.height + padT + padB;
    var ctx = cv.getContext('2d'), ox = padL / res + sprite.ax, oy = padT / res + sprite.ay;
    ctx.setTransform(res, 0, 0, res, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.drawImage(sh.img, ox - sh.ax + dx, oy - sh.ay + dy, sh.w, sh.h);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
    ctx.drawImage(sprite.img, padL, padT);                             // whole pixels: the cut edge stays crisp
    sh.img.width = sh.img.height = 0; sprite.img.width = sprite.img.height = 0;
    return { img: cv, ax: ox, ay: oy, w: cv.width / res, h: cv.height / res, res: res, hull: sprite.hull, px: sprite.px };
  }

  /* A small tile of paper fibre and speckle, used on every sheet. */
  function grainTile(seed, size) {
    var rng = makeRng(seed), cv = document.createElement('canvas'), i;
    cv.width = cv.height = size;
    // (A software canvas on purpose. Left to choose for itself, Chrome about one load in twenty
    // treated this tile differently part-way through a build, and every leaf cut after that
    // came out one level in 255 away from normal: invisible, but two loads no longer matched.)
    var ctx = cv.getContext('2d', { willReadFrequently: true });
    for (i = 0; i < size * size / 26; i++) {
      ctx.fillStyle = rng() < 0.5 ? 'rgba(255,253,235,' + rng.range(0.03, 0.1) + ')' : 'rgba(20,30,20,' + rng.range(0.03, 0.09) + ')';
      ctx.fillRect(rng() * size, rng() * size, rng() < 0.8 ? 1 : 2, 1);
    }
    ctx.lineWidth = 1;
    for (i = 0; i < size / 2.2; i++) {                                 // fibres
      var x = rng() * size, y = rng() * size, a = rng() * Math.PI, l = rng.range(5, 22);
      ctx.strokeStyle = rng() < 0.55 ? 'rgba(255,253,235,' + rng.range(0.03, 0.07) + ')' : 'rgba(30,40,25,' + rng.range(0.03, 0.07) + ')';
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + rng.range(-2, 2), y + Math.sin(a) * l * 0.5 + rng.range(-2, 2), x + Math.cos(a) * l, y + Math.sin(a) * l);
      ctx.stroke();
    }
    return cv;
  }

  global.PaperPlants = {
    DEG: DEG, clamp: clamp, lerp: lerp, smooth: smooth, head: head,
    makeRng: makeRng, mix: mix, darker: darker, tones: tones,
    frond: frond, fan: fan, paddle: paddle, monstera: monstera,
    spathe: spathe, sepal: sepal, petal: petal, coconuts: coconuts, flag: flag,
    raster: raster, shadow: shadow, bake: bake, grainTile: grainTile, ellipse: ellipse
  };
})(window);
