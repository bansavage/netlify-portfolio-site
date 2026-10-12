/* ============================================================================
   plants.js — the cut-paper botanicals for the Kyle & Daina "1974" poster.

   Every plant is drawn by code (no images). A generator takes a size, a seed
   and a three-colour "tone" and returns a piece of ART:

     { shapes: [ { fill, polys:[[x,y,x,y,...], ...], op } ,
                 { stroke, width, polys:[...], op } ],
       hull:   [x,y, ...]      a few outline points (used to keep leaves off the type)
       top:    number          how far the plant reaches above its pivot
       meta:   {...}           extras a rig needs (crown position, fan hub, ...) }

   Coordinates: the pivot (base of the stalk) is 0,0 and the plant grows UP,
   toward negative y. Angles are radians, 0 = straight up, positive = clockwise.
   `op` is how the shape is laid on the paper: normal, 'erase' (scissors — used
   for monstera splits and holes) or 'atop' (ink that only prints on the leaf).

   The same seed always gives the same leaf; change a seed to get a sibling.
   ============================================================================ */
(function (global) {
  'use strict';

  var TAU = Math.PI * 2;
  function rad(d) { return d * Math.PI / 180; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* Seeded random numbers, 0..1. Never Math.random: the poster must be repeatable. */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* ---- spine: a centre line made by walking forward while the heading turns ---- */
  function spine(len, n, angleAt) {
    var X = [0], Y = [0], A = [angleAt(0)], x = 0, y = 0, d = len / n;
    for (var i = 1; i <= n; i++) {
      var a = angleAt((i - 0.5) / n);
      x += Math.sin(a) * d; y -= Math.cos(a) * d;
      X.push(x); Y.push(y); A.push(angleAt(i / n));
    }
    return { X: X, Y: Y, A: A, n: n, len: len };
  }
  /* point + local frame (tangent t, right-hand normal n) at u = 0..1 along a spine */
  function at(sp, u) {
    var f = clamp(u, 0, 1) * sp.n, i = Math.min(sp.n - 1, Math.floor(f)), k = f - i;
    var a = lerp(sp.A[i], sp.A[i + 1], k);
    return { x: lerp(sp.X[i], sp.X[i + 1], k), y: lerp(sp.Y[i], sp.Y[i + 1], k), a: a,
             tx: Math.sin(a), ty: -Math.cos(a), nx: Math.cos(a), ny: Math.sin(a) };
  }
  /* a tapered band that follows a spine from u0 to u1 */
  function ribbon(sp, u0, u1, w0, w1, steps) {
    var L = [], R = [];
    for (var i = 0; i <= steps; i++) {
      var k = i / steps, p = at(sp, lerp(u0, u1, k)), w = lerp(w0, w1, k) / 2;
      L.push(p.x - p.nx * w, p.y - p.ny * w);
      R.push(p.x + p.nx * w, p.y + p.ny * w);
    }
    return L.concat(reversePairs(R));
  }
  function reversePairs(a) {
    var o = [];
    for (var i = a.length - 2; i >= 0; i -= 2) o.push(a[i], a[i + 1]);
    return o;
  }
  function circle(cx, cy, r, n) {
    var o = [];
    for (var i = 0; i < n; i++) o.push(cx + Math.cos(i / n * TAU) * r, cy + Math.sin(i / n * TAU) * r);
    return o;
  }
  /* Catmull-Rom through a list of [x,y] points (open), returned as a flat polyline */
  function smooth(pts, seg) {
    var o = [], n = pts.length;
    for (var i = 0; i < n - 1; i++) {
      var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
      for (var s = 0; s < seg; s++) {
        var t = s / seg, t2 = t * t, t3 = t2 * t;
        o.push(0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
               0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3));
      }
    }
    o.push(pts[n - 1][0], pts[n - 1][1]);
    return o;
  }

  /* ---- finishing: work out bounds + a sparse hull for an art object ---- */
  var artId = 0;
  function finish(shapes, meta, ownHull) {
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, hull = ownHull || [], count = 0;
    shapes.forEach(function (s) {
      if (s.op === 'erase') return;
      var pad = s.stroke ? s.width : 0;
      s.polys.forEach(function (p) {
        for (var i = 0; i < p.length; i += 2) {
          if (p[i] - pad < x0) x0 = p[i] - pad; if (p[i] + pad > x1) x1 = p[i] + pad;
          if (p[i + 1] - pad < y0) y0 = p[i + 1] - pad; if (p[i + 1] + pad > y1) y1 = p[i + 1] + pad;
          if (!s.stroke && s.op !== 'atop') count++;
        }
      });
    });
    var every = Math.max(1, Math.floor(count / 70)), c = 0;
    if (!ownHull) shapes.forEach(function (s) {
      if (s.op || s.stroke) return;
      s.polys.forEach(function (p) {
        for (var i = 0; i < p.length; i += 2) if (c++ % every === 0) hull.push(p[i], p[i + 1]);
      });
    });
    return { id: ++artId, shapes: shapes, hull: hull, x0: x0, y0: y0, x1: x1, y1: y1, top: -y0, meta: meta || {} };
  }

  /* ==========================================================================
     BANANA LEAF  (also the bird-of-paradise "paddle" leaf with form:'paddle')
     A big oblong blade on a thick stalk. Two flat halves either side of a pale
     midrib, fine side veins, and the wind tears that make it a banana leaf.
     ========================================================================== */
  function bananaLeaf(o) {
    var r = mulberry32(o.seed || 1), c = o.tone;
    var L = o.len, stalk = o.stalk != null ? o.stalk : L * 0.2, Lt = L + stalk;
    var curl = o.curl != null ? o.curl : (0.22 + r() * 0.4) * (r() < 0.5 ? -1 : 1);
    var sp = spine(Lt, 96, function (u) { return curl * u * u; });
    var u0 = stalk / Lt, paddle = o.form === 'paddle';
    var half = o.width != null ? o.width : L * (paddle ? 0.25 : 0.185) * (0.94 + r() * 0.14);
    var skew = o.skew != null ? o.skew : (r() - 0.5) * 0.44;         // one half narrower: the leaf is turned
    var prof = paddle
      ? function (s) { return Math.pow(Math.sin(Math.PI * Math.pow(s, 0.66)), 0.7); }
      : function (s) { return Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * Math.pow(s, 0.9) - 1), 2.5)), 0.6); };
    var nTears = o.tears != null ? o.tears : 3 + Math.floor(r() * 3);
    var shapes = [], halves = [], veinsA = [], veinsB = [];

    [-1, 1].forEach(function (sg) {
      var w = half * (1 + sg * skew), tears = [], k;
      var cnt = Math.max(0, nTears + (nTears ? Math.round(r() * 2 - 1) : 0));
      for (k = 0; k < cnt; k++) tears.push({ s: 0.13 + 0.8 * (k + 0.15 + r() * 0.7) / cnt, depth: 0.5 + r() * 0.44, gap: 0.02 + r() * 0.034 });
      var flap = 1, ti = 0, skipTo = -1, pts = [], N = 72;
      function edge(s, fl) {
        var p = at(sp, u0 + (1 - u0) * clamp(s, 0, 1)), hw = w * prof(clamp(s, 0, 1)) * fl;
        return [p.x + sg * p.nx * hw, p.y + sg * p.ny * hw];
      }
      for (var i = 0; i <= N; i++) {
        var s = i / N;
        while (ti < tears.length && tears[ti].s - tears[ti].gap / 2 <= s) {     // cut a tear: margin -> toward midrib -> margin
          var t = tears[ti++], e1 = edge(t.s - t.gap / 2, flap);
          var pa = at(sp, u0 + (1 - u0) * Math.max(0.02, t.s - 0.02 - 0.05 * t.depth)), hwa = w * prof(t.s) * (1 - t.depth);
          flap = 0.92 + r() * 0.13;                                              // each flap sits a little in or out
          var e2 = edge(t.s + t.gap / 2, flap);
          pts.push(e1[0], e1[1], pa.x + sg * pa.nx * hwa, pa.y + sg * pa.ny * hwa, e2[0], e2[1]);
          skipTo = t.s + t.gap / 2;
        }
        if (s <= skipTo) continue;
        var e = edge(s, flap); pts.push(e[0], e[1]);
      }
      var mid = [];
      for (i = 0; i <= 40; i++) { var m = at(sp, u0 + (1 - u0) * i / 40); mid.push(m.x, m.y); }
      halves.push(mid.concat(reversePairs(pts)));
      // side veins: midrib -> margin, leaning toward the tip
      var nv = o.veins != null ? o.veins : Math.round(clamp(L / 13, 9, 26));
      for (k = 1; k <= nv; k++) {
        var vs = k / (nv + 1), a = at(sp, u0 + (1 - u0) * Math.max(0, vs - 0.035)), b = edge(vs, 1.1);
        (sg < 0 ? veinsA : veinsB).push([a.x, a.y, b[0], b[1]]);
      }
    });

    var vw = Math.max(0.7, L * 0.0042);
    shapes.push({ fill: c.rib2 || c.rib, polys: [ribbon(sp, 0, u0 + 0.04, L * 0.034, L * 0.028, 10)] });
    shapes.push({ fill: c.a, polys: [halves[0]] });
    shapes.push({ fill: c.b, polys: [halves[1]] });
    if (o.veins !== 0) {
      shapes.push({ stroke: c.b, width: vw, polys: veinsA, op: 'atop' });
      shapes.push({ stroke: c.a, width: vw, polys: veinsB, op: 'atop' });
    }
    shapes.push({ fill: c.rib, polys: [ribbon(sp, Math.max(0, u0 - 0.02), 0.985, L * 0.028, L * 0.004, 30)] });
    return finish(shapes, { kind: paddle ? 'paddle' : 'banana' });
  }

  /* ==========================================================================
     PALM FROND (pinnate, coconut-palm style)
     A drooping rachis with many narrow leaflets down both sides. Leaflets are
     short at the base, longest ~40% along and taper to the tip; each one angles
     forward and sags toward `grav`. Gaps between them keep it feathered.
     ========================================================================== */
  function palmFrond(o) {
    var r = mulberry32(o.seed || 1), c = o.tone;
    var L = o.len, turn = o.turn != null ? o.turn : rad(40 + r() * 40) * (r() < 0.5 ? -1 : 1);
    var sp = spine(L, 64, function (u) { return turn * Math.pow(u, 1.55); });
    var per = o.n || Math.round(clamp(L / 10.5, 10, 34));
    var bare = o.bare != null ? o.bare : 0.13, Lmax = L * (o.leaf || 0.3);
    var g = o.grav || [0, 1], droop = o.droop != null ? o.droop : 0.3, fill = o.fill || 0.6;
    var spacing = L * (1 - bare) / per, A = [], B = [], hull = [0, 0];
    for (var i = 0; i < per; i++) {
      for (var q = 0; q < 2; q++) {
        var sg = q ? 1 : -1;
        var u = bare + (1 - bare) * (i + (q ? 0.5 : 0)) / per;
        if (u > 0.985) continue;
        var p = at(sp, u);
        var env = 0.34 + 0.66 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.72)), 0.85);
        var len = Lmax * env * (0.9 + r() * 0.2);
        if (r() < 0.07) len *= 0.5 + r() * 0.2;                                  // the odd broken leaflet
        var rel = rad(lerp(70, 24, Math.pow(u, 0.8)) + (r() - 0.5) * 9);
        var ang = p.a + sg * rel, dx = Math.sin(ang), dy = -Math.cos(ang);
        var bw = Math.max(1.1, spacing * Math.sin(rel) * fill * 1.25);
        var cx = p.x + dx * len * 0.5, cy = p.y + dy * len * 0.5;
        var tx = p.x + dx * len + g[0] * len * droop, ty = p.y + dy * len + g[1] * len * droop;
        var K = 5, Lp = [], Rp = [];
        for (var k = 0; k <= K; k++) {
          var t = k / K, mt = 1 - t;
          var x = mt * mt * p.x + 2 * mt * t * cx + t * t * tx, y = mt * mt * p.y + 2 * mt * t * cy + t * t * ty;
          var ddx = mt * (cx - p.x) + t * (tx - cx), ddy = mt * (cy - p.y) + t * (ty - cy);
          var dl = Math.sqrt(ddx * ddx + ddy * ddy) || 1, nx = -ddy / dl, ny = ddx / dl;
          var hw = bw / 2 * (t < 0.22 ? lerp(0.5, 1, t / 0.22) : Math.pow(1 - (t - 0.22) / 0.78, 0.8));
          Lp.push(x + nx * hw, y + ny * hw);
          if (k < K) Rp.push(x - nx * hw, y - ny * hw);
        }
        (q ? A : B).push(Lp.concat(reversePairs(Rp)));
        hull.push(tx, ty, (p.x + 2 * cx + tx) / 4, (p.y + 2 * cy + ty) / 4);     // every leaflet's tip and belly
      }
    }
    var end = at(sp, 0.99); hull.push(end.x, end.y);
    return finish([
      { fill: c.b, polys: B },
      { fill: c.a, polys: A },
      { fill: c.rib, polys: [ribbon(sp, 0, 0.99, L * 0.024, L * 0.004, 32)] }
    ], { kind: 'frond' }, hull);
  }

  /* ==========================================================================
     FAN PALM (palmate)
     Pleated blades radiating from one hub through 200-300 degrees. Fused for
     the inner half, then split into pointed, notched tips at the rim. Each
     blade is two flat tones either side of its fold, which reads as pleating.
     ========================================================================== */
  function fanPalm(o) {
    var r = mulberry32(o.seed || 1), c = o.tone;
    var R = o.r, pet = o.stalk != null ? o.stalk : R * 0.9;
    var lean = o.curl != null ? o.curl : (r() - 0.5) * 0.5;
    var sp = spine(pet, 24, function (u) { return lean * u * u; }), hub = at(sp, 1);
    var span = o.span || rad(215 + r() * 60), N = o.n || 17 + Math.floor(r() * 6), fuse = o.fuse || 0.4;
    var step = span / N, A = [], B = [], folds = [], hull = [0, 0, hub.x, hub.y];
    function pol(ang, rr) { return [hub.x + Math.sin(hub.a + ang) * rr, hub.y - Math.cos(hub.a + ang) * rr]; }
    for (var i = 0; i < N; i++) {
      var th = -span / 2 + step * (i + 0.5), k = Math.abs(th) / (span / 2);
      var len = R * (1 - 0.25 * k * k) * (0.9 + r() * 0.12);
      var tip = th + (th < 0 ? -1 : 1) * rad(9) * k * k;                         // outer blades droop
      var f = R * fuse * (1.1 - 0.2 * k);                                         // fused further out in the middle of the fan
      var nL = pol(th - step / 2, f), nR = pol(th + step / 2, f);
      var sL = pol(tip - step * 0.42, len * 0.6), sR = pol(tip + step * 0.42, len * 0.6);     // each blade narrows from here...
      var tL = pol(tip - step * 0.11, len), tR = pol(tip + step * 0.11, len * (0.92 + r() * 0.08));   // ...to two sharp points
      var cut = pol(tip, len * (0.7 + r() * 0.08));                               // the deep split in each tip
      A.push([hub.x, hub.y].concat(nL, sL, tL, cut));
      B.push([hub.x, hub.y].concat(cut, tR, sR, nR));
      folds.push([hub.x, hub.y].concat(pol(tip, len * 0.66)));                    // the pleat: a rib down the middle of every blade
      hull.push(tL[0], tL[1], tR[0], tR[1], sL[0], sL[1]);
    }
    var under = [hub.x, hub.y];
    for (i = 0; i <= 24; i++) under.push.apply(under, pol(-span / 2 + span * i / 24, R * fuse * 0.92));
    var shapes = [
      { fill: c.rib2 || c.b, polys: [ribbon(sp, 0, 1, R * 0.05, R * 0.038, 10)] },
      { fill: c.b, polys: [under] },
      { fill: c.b, polys: B },
      { fill: c.a, polys: A }
    ];
    if (o.folds !== 0) shapes.push({ stroke: c.rib, width: Math.max(0.7, R * 0.009), polys: folds, op: 'atop' });
    shapes.push({ fill: c.rib, polys: [circle(hub.x, hub.y, R * 0.06, 14)] });
    return finish(shapes, { kind: 'fan', hx: hub.x, hy: hub.y, ha: hub.a, span: span, r: R }, hull);
  }

  /* ==========================================================================
     MONSTERA
     A heart-shaped blade hung from its stalk at the notch, cut with deep splits
     that follow the side veins and a few holes by the midrib.
     ========================================================================== */
  function monstera(o) {
    var r = mulberry32(o.seed || 1), c = o.tone;
    var Lb = o.len, pet = o.stalk != null ? o.stalk : Lb * 0.7;
    var lean = o.curl != null ? o.curl : (r() - 0.5) * 0.6;
    var sp = spine(pet, 20, function (u) { return lean * u * u; }), A0 = at(sp, 1);
    var ax = A0.a + (o.tilt || 0), fx = Math.sin(ax), fy = -Math.cos(ax), sx = Math.cos(ax), sy = Math.sin(ax);
    var cx = A0.x + fx * Lb * 0.3, cy = A0.y + fy * Lb * 0.3;
    function rAt(deg) {                                                          // heart: pointed tip at 0, notch at 180
      var a = Math.abs(deg);
      return 0.55 + 0.03 * Math.cos(rad(2 * a)) + 0.15 * Math.exp(-a / 17) - 0.28 * Math.exp(-Math.pow((180 - a) / 15, 1.5));
    }
    function P(deg, rr) {
      var a = rad(deg), ca = Math.cos(a), sa = Math.sin(a);
      return [cx + (fx * ca + sx * sa) * rr * Lb, cy + (fy * ca + sy * sa) * rr * Lb];
    }
    function axis(k) { return [cx + fx * k * Lb, cy + fy * k * Lb]; }             // k: -0.3 (stalk) .. 0.7 (tip)
    var halves = [], cuts = [], veins = [];
    [-1, 1].forEach(function (sg) {
      var pts = [], d;
      for (d = 0; d <= 180; d += 3) pts.push.apply(pts, P(sg * d, rAt(d)));
      halves.push(pts);
      var ns = o.splits || 5;
      for (var k = 0; k < ns; k++) {
        var deg = 30 + (k + 0.5) * (120 / ns) + (r() - 0.5) * 7, rr = rAt(deg);
        var E = P(sg * deg, rr * 1.12);
        var ak = clamp(rr * Math.cos(rad(deg)) - rr * Math.sin(rad(deg)) * 0.62, -0.27, 0.6), M = axis(ak);
        var depth = 0.56 + r() * 0.16, I = [lerp(E[0], M[0], depth), lerp(E[1], M[1], depth)];
        var vx = E[0] - I[0], vy = E[1] - I[1], vl = Math.sqrt(vx * vx + vy * vy), px = -vy / vl, py = vx / vl;
        var wo = Lb * (0.03 + r() * 0.012), wi = Lb * 0.017, slot = [E[0] + px * wo, E[1] + py * wo];
        for (var j = 0; j <= 8; j++) {                                           // rounded inner end
          var q = Math.PI * j / 8;
          slot.push(I[0] + (px * Math.cos(q) - vx / vl * Math.sin(q)) * wi, I[1] + (py * Math.cos(q) - vy / vl * Math.sin(q)) * wi);
        }
        slot.push(E[0] - px * wo, E[1] - py * wo);
        cuts.push(slot);
        if (k > 0 && k < ns - 1 && r() < 0.8) {                                  // a hole between slot and midrib
          var hc = [lerp(M[0], I[0], 0.5), lerp(M[1], I[1], 0.5)], hole = [];
          for (j = 0; j < 14; j++) {
            q = j / 14 * TAU;
            hole.push(hc[0] + vx / vl * Math.cos(q) * Lb * 0.042 + px * Math.sin(q) * Lb * 0.017,
                      hc[1] + vy / vl * Math.cos(q) * Lb * 0.042 + py * Math.sin(q) * Lb * 0.017);
          }
          cuts.push(hole);
        }
        var vdeg = deg - 60 / ns, V = P(sg * vdeg, rAt(vdeg) * 0.9);            // a vein running out into each lobe
        var vk = clamp(rAt(vdeg) * Math.cos(rad(vdeg)) - rAt(vdeg) * Math.sin(rad(vdeg)) * 0.62, -0.27, 0.6), VM = axis(vk);
        veins.push([VM[0], VM[1], V[0], V[1]]);
      }
    });
    var tipP = axis(0.66), baseP = axis(-0.3);
    var nxm = sx * Lb * 0.014, nym = sy * Lb * 0.014;
    return finish([
      { fill: c.rib2 || c.b, polys: [ribbon(sp, 0, 1, Lb * 0.04, Lb * 0.03, 10)] },
      { fill: c.a, polys: [halves[0]] },
      { fill: c.b, polys: [halves[1]] },
      { fill: '#000', polys: cuts, op: 'erase' },
      { stroke: c.rib, width: Math.max(0.8, Lb * 0.008), polys: veins, op: 'atop' },
      { fill: c.rib, polys: [[baseP[0] - nxm, baseP[1] - nym, tipP[0], tipP[1], baseP[0] + nxm, baseP[1] + nym]], op: 'atop' }
    ], { kind: 'monstera' });
  }

  /* ==========================================================================
     PALM TREE (a rig: one trunk + a crown of separate fronds so the crown can
     burst open and each frond can sway on its own)
     ========================================================================== */
  function palmTree(o) {
    var r = mulberry32(o.seed || 1), c = o.tone;
    var Ht = o.h, lean = o.lean || 0, w0 = o.w || Ht * 0.034;
    var sp = spine(Ht, 60, function (u) { return lean * Math.pow(1 - u, 1.3) - lean * 0.12 * u; });
    function wAt(u) { return w0 * (1 - 0.45 * u) + w0 * 0.55 * Math.exp(-u * 16); }
    var m = Math.max(8, Math.round(Ht / (w0 * 1.25))), segs = [], gap = Math.min(0.4, Math.max(1, w0 * 0.13) / (Ht / m));
    for (var j = 0; j < m; j++) {                                                // stacked, slightly flared ring segments
      var ua = j / m, ub = (j + 1 - gap) / m, pa = at(sp, ua), pb = at(sp, ub), wa = wAt(ua) * 0.46, wb = wAt(ua) * 0.56;
      segs.push([pa.x - pa.nx * wa, pa.y - pa.ny * wa, pb.x - pb.nx * wb, pb.y - pb.ny * wb, pb.x + pb.nx * wb, pb.y + pb.ny * wb, pa.x + pa.nx * wa, pa.y + pa.ny * wa]);
    }
    var top = at(sp, 1), nuts = [];
    for (j = 0; j < 3; j++) nuts.push(circle(top.x + (j - 1) * w0 * 0.62, top.y + w0 * (0.55 + (j === 1 ? 0.35 : 0)), w0 * 0.5, 12));
    var trunk = finish([{ fill: c.b, polys: segs }, { fill: c.nut || c.b, polys: nuts }], { kind: 'trunk', cx: top.x, cy: top.y });

    var nf = o.fronds || 11, Lf = o.frondLen || Ht * 0.42, fronds = [];
    for (j = 0; j < nf; j++) {
      var frac = nf > 1 ? j / (nf - 1) : 0.5;
      var ang = rad(lerp(-132, 132, frac) + (r() - 0.5) * 12), k = Math.abs(ang) / rad(132);
      var len = Lf * (0.74 + 0.3 * Math.sin(Math.PI * Math.min(1, k * 1.15))) * (0.92 + r() * 0.16);
      var sgn = ang < 0 ? -1 : 1; if (k < 0.12) sgn = r() < 0.5 ? -1 : 1;
      var turn = sgn * (rad(20) + rad(58) * k) * (0.85 + r() * 0.3);
      fronds.push({
        rot: ang, order: k,
        art: palmFrond({ len: len, turn: turn, n: Math.round(clamp(len / 5.2, 9, 20)), leaf: 0.36, bare: 0.05,
                         grav: [Math.sin(ang), Math.cos(ang)], droop: 0.34, fill: 0.62, seed: (o.seed || 1) * 31 + j, tone: c })
      });
    }
    fronds.sort(function (a, b) { return b.order - a.order; });                  // hanging fronds behind, upright ones in front
    return { trunk: trunk, fronds: fronds, crown: { x: top.x, y: top.y } };
  }

  /* The same palm tree as ONE piece of art, for distant trees that only need to sway as a whole. */
  function palmWhole(o) {
    var pt = palmTree(o), shapes = pt.trunk.shapes.slice(), cx = pt.crown.x, cy = pt.crown.y;
    pt.fronds.forEach(function (f) {
      var c = Math.cos(f.rot), s = Math.sin(f.rot);
      f.art.shapes.forEach(function (sh) {
        shapes.push({ fill: sh.fill, stroke: sh.stroke, width: sh.width, op: sh.op, polys: sh.polys.map(function (p) {
          var q = new Array(p.length);
          for (var i = 0; i < p.length; i += 2) { q[i] = cx + p[i] * c - p[i + 1] * s; q[i + 1] = cy + p[i] * s + p[i + 1] * c; }
          return q;
        }) });
      });
    });
    return finish(shapes, { kind: 'palm' });
  }

  /* ==========================================================================
     BIRD OF PARADISE (Strelitzia reginae) — the flower, in parts so it can open
       spathe : the horizontal green "beak", boat shaped, pivot at the neck,
                pointing along +x (the rig turns it / mirrors it)
       sepal  : a long pointed orange blade, pivot at its base, pointing up
       petal  : the cobalt arrow, pivot at its base, pointing up
       stalk  : the tall bare stem (keeps its spine in meta so the head can ride the tip)
     ========================================================================== */
  function strelitziaSpathe(o) {
    var S = o.size, c = o.tone;
    function pt(a) { return [a[0] * S, a[1] * S]; }
    var topE = smooth([[-0.07, -0.02], [0.03, -0.085], [0.3, -0.09], [0.65, -0.055], [1.02, 0.0]].map(pt), 8);
    var botE = smooth([[1.02, 0.0], [0.74, 0.07], [0.44, 0.13], [0.18, 0.15], [-0.02, 0.12], [-0.09, 0.05], [-0.07, -0.02]].map(pt), 8);
    var rimTop = smooth([[0.0, -0.075], [0.3, -0.09], [0.65, -0.055], [1.02, 0.0]].map(pt), 8);
    var rimBot = smooth([[1.02, 0.0], [0.65, -0.022], [0.3, -0.047], [0.02, -0.04]].map(pt), 8);
    var keel = smooth([[1.02, 0.0], [0.7, 0.045], [0.4, 0.085], [0.12, 0.1], [-0.06, 0.07]].map(pt), 8);
    return finish([
      { fill: c.a, polys: [topE.concat(botE)] },
      { fill: c.b, polys: [keel.concat(reversePairs(botE.slice(0, botE.length - 14)))], op: 'atop' },
      { fill: c.rib, polys: [rimTop.concat(rimBot)] }
    ], { kind: 'spathe' });
  }
  function strelitziaSepal(o) {
    var r = mulberry32(o.seed || 1), c = o.tone, L = o.len, w = L * (o.wide || 0.105);
    var curl = o.curl != null ? o.curl : (r() - 0.5) * 0.5;
    var sp = spine(L, 28, function (u) { return curl * u * u; });
    function hw(t) { return w * (0.22 + 0.78 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.7)), 0.9)) * (t > 0.9 ? (1 - t) / 0.1 : 1); }
    var Lp = [], Rp = [], Mp = [], Sp = [];
    for (var i = 0; i <= 28; i++) {
      var t = i / 28, p = at(sp, t), h = hw(t);
      Lp.push(p.x - p.nx * h, p.y - p.ny * h); Rp.push(p.x + p.nx * h, p.y + p.ny * h);
      Mp.push(p.x + p.nx * h * 0.3, p.y + p.ny * h * 0.3); Sp.push(p.x + p.nx * h, p.y + p.ny * h);
    }
    return finish([
      { fill: c.a, polys: [Lp.concat(reversePairs(Rp))] },
      { fill: c.b, polys: [Mp.concat(reversePairs(Sp))] }
    ], { kind: 'sepal' });
  }
  function strelitziaPetal(o) {
    /* a long narrow spearhead (not an arrow icon): slim shaft, soft shoulders, long point */
    var c = o.tone, L = o.len, sw = L * 0.05, bw = L * 0.115;
    var left = smooth([[-sw * 0.8, 0], [-sw, -L * 0.2], [-sw * 1.15, -L * 0.36], [-bw * 0.92, -L * 0.47], [-bw, -L * 0.56],
                       [-bw * 0.66, -L * 0.74], [-bw * 0.26, -L * 0.9], [0, -L]], 5);
    var right = [];
    for (var i = left.length - 2; i >= 0; i -= 2) right.push(-left[i], left[i + 1]);
    var shade = [0, 0, 0, -L].concat(right);
    return finish([{ fill: c.a, polys: [left.concat(right)] }, { fill: c.b, polys: [shade] }], { kind: 'petal' });
  }
  function strelitziaStalk(o) {
    var c = o.tone, Hs = o.h, w = o.w, curl = o.curl || 0;
    var sp = spine(Hs, 40, function (u) { return curl * Math.sin(u * Math.PI * 0.9) * 0.6 + curl * u * 0.4; });
    return finish([{ fill: c.a, polys: [ribbon(sp, 0, 1, w * 1.1, w * 0.85, 30)] },
                   { fill: c.b, polys: [ribbon(sp, 0, 1, w * 0.36, w * 0.28, 30).map(function (v, i) { return i % 2 ? v : v + w * 0.3; })] }],
                  { kind: 'stalk', sp: sp });
  }

  /* ==========================================================================
     HELICONIA (lobster claw) — a small supporting accent: a hanging zig-zag of
     pointed bracts on a bare stem.
     ========================================================================== */
  function heliconia(o) {
    var r = mulberry32(o.seed || 1), c = o.tone, L = o.len, n = o.n || 7;
    var sp = spine(L, 40, function (u) { return (o.curl || 0.3) * u * u; });
    var A = [], B = [], E = [], u0 = 0.4;
    for (var i = 0; i < n; i++) {
      /* each bract is a little boat: a round keel underneath, a straight rim on top, a sharp upturned prow */
      var u = u0 + (1 - u0) * i / n, p = at(sp, u), sg = i % 2 ? 1 : -1, bl = L * 0.23 * (1 - 0.55 * i / n) * (0.92 + r() * 0.16);
      var sx = sg * p.nx, sy = sg * p.ny;
      var pt = function (side, along) { return [p.x + sx * bl * side + p.tx * bl * along, p.y + sy * bl * side + p.ty * bl * along]; };
      var heel = pt(0, -0.12), prow = pt(0.86, 0.52), deck = pt(0, 0.36);
      var keel = smooth([heel, pt(0.26, -0.13), pt(0.56, 0.06), pt(0.76, 0.3), prow], 5);
      var rim = [].concat(pt(0.5, 0.42), pt(0.2, 0.36), deck);
      var mid = smooth([prow, pt(0.5, 0.22), pt(0.22, 0.08), heel], 4);
      A.push(keel.concat(rim));
      B.push(keel.concat(mid));                                                    // the shaded underside of the boat
      E.push([].concat(prow, pt(0.5, 0.42), pt(0.2, 0.36), deck, pt(0.02, 0.27), pt(0.22, 0.28), pt(0.5, 0.345)));   // the pale rim
    }
    return finish([
      { fill: c.rib, polys: [ribbon(sp, 0, 1, L * 0.024, L * 0.012, 20)] },
      { fill: c.a, polys: A },
      { fill: c.b, polys: B },
      { fill: c.edge || c.a, polys: E }
    ], { kind: 'heliconia' });
  }

  global.PosterPlants = {
    mulberry32: mulberry32, rad: rad, lerp: lerp, clamp: clamp, at: at,
    bananaLeaf: bananaLeaf, palmFrond: palmFrond, fanPalm: fanPalm, monstera: monstera, palmTree: palmTree, palmWhole: palmWhole,
    strelitziaSpathe: strelitziaSpathe, strelitziaSepal: strelitziaSepal, strelitziaPetal: strelitziaPetal,
    strelitziaStalk: strelitziaStalk, heliconia: heliconia
  };
})(window);
