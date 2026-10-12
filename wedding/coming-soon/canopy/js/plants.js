/* plants.js — every plant in the scene is drawn here, procedurally, with the 2D canvas API.
 *
 * Nothing is an image file. Each plant part ("sprite") is drawn once at start-up, upright, into its
 * own cell of a big texture atlas; the WebGL scene then places hundreds of copies of those cells
 * on bendable cards. So if a leaf looks wrong, this is the file to edit.
 *
 * Conventions used by every draw function:
 *   - the origin (0,0) is the point the part grows from (its pivot); it is drawn growing UP (-y)
 *   - angles are radians, 0 = straight up, positive = leaning to the right
 *   - R is a seeded random source (kit.js), so a given seed always draws the same leaf
 *   - it returns { len, hull, ... }: `len` = nominal length in px, `hull` = circles [x, y(up), r]
 *     (px, relative to the pivot) that roughly cover the shape; the layout uses them to keep
 *     foliage off the names.
 */
import { rng, clamp, lerp, smoothstep, mix, rgba, shade, GREEN, PALETTE } from './kit.js';

const PI = Math.PI, DEG = PI / 180;
const [G0, G1, G2, G3, G4, G5, G6] = GREEN;
const RIB = '#DCE6A2';        // pale yellow-green of a backlit midrib

/* ============================================================================================
 * Geometry helpers
 * ========================================================================================== */

/** A curved centre line, built by walking forward while the heading changes. */
function makeSpine(len, n, angleAt, x0 = 0, y0 = 0) {
  const xs = new Float32Array(n + 1), ys = new Float32Array(n + 1), as = new Float32Array(n + 1);
  let px = x0, py = y0;
  const ds = len / n;
  for (let i = 0; i <= n; i++) {
    const a = angleAt(i / n);
    as[i] = a; xs[i] = px; ys[i] = py;
    px += Math.sin(a) * ds; py -= Math.cos(a) * ds;
  }
  return {
    len,
    /** point + tangent (tx,ty) + right-hand normal (nx,ny) at s = 0..1 */
    at(s) {
      const f = clamp(s) * n, i = Math.min(n - 1, Math.floor(f)), k = f - i;
      const a = lerp(as[i], as[i + 1], k);
      return { x: lerp(xs[i], xs[i + 1], k), y: lerp(ys[i], ys[i + 1], k), ang: a,
               tx: Math.sin(a), ty: -Math.cos(a), nx: Math.cos(a), ny: Math.sin(a) };
    },
  };
}

/** Path of a tapered strip that follows a spine from s0 to s1 (half-widths w0 → w1). */
function ribbon(ctx, sp, s0, s1, w0, w1, steps = 28, ease = 1) {
  const left = [], right = [];
  for (let i = 0; i <= steps; i++) {
    const k = i / steps, p = sp.at(lerp(s0, s1, k)), w = lerp(w0, w1, Math.pow(k, ease));
    left.push([p.x - p.nx * w, p.y - p.ny * w]);
    right.push([p.x + p.nx * w, p.y + p.ny * w]);
  }
  ctx.beginPath();
  ctx.moveTo(left[0][0], left[0][1]);
  for (const p of left) ctx.lineTo(p[0], p[1]);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
}

const dir = (a) => [Math.sin(a), -Math.cos(a)];

/* ============================================================================================
 * The paddle leaf: banana, bird-of-paradise leaf and monstera are all built from this.
 *
 * A midrib (spine) with a width envelope on both sides. Side veins leave the midrib and sweep
 * forward to the margin; the blade is painted vein-strip by vein-strip (that is what gives the
 * corrugated, backlit look), and "tears" cut in from the margin along a vein.
 * ========================================================================================== */
function paddle(ctx, o) {
  const total = o.stalk + o.blade;
  const sp = makeSpine(total, 140, o.angle);
  const sb = o.stalk / total;
  const M = (u) => sp.at(sb + clamp(u) * (1 - sb));
  const sideW = o.sideW || [1, 1];
  const sweep = o.sweep || (() => 0.35);
  const hw = (u) => o.halfW * o.env(clamp(u));
  /** a point on the blade: u along the midrib, sg = side (-1 left, +1 right), r = 0 midrib … 1 margin */
  const E = (u, sg, r) => {
    const p = M(u), w = hw(u) * r * (sg < 0 ? sideW[0] : sideW[1]), k = sweep(u);
    return [p.x + sg * p.nx * w + p.tx * k * w, p.y + sg * p.ny * w + p.ty * k * w];
  };

  /* --- outline of one side, with its tears ------------------------------------------------ */
  const sidePoints = (sg) => {
    const tears = (sg < 0 ? o.tearsL : o.tearsR) || [];
    const N = 76;
    let pts = [];
    for (let i = 0; i <= N; i++) pts.push({ u: i / N, r: 1 });
    pts = pts.filter((p) => !tears.some((t) => Math.abs(p.u - t.u) <= t.gap * 0.5 + 1e-4));
    for (const t of tears) {
      const d = 1 - t.depth;
      pts.push({ u: t.u - t.gap * 0.5, r: 1, lip: 1 }, { u: t.u + t.gap * 0.5, r: 1, lip: 1 });
      if (o.roundTears) {
        pts.push({ u: t.u - t.gap * 0.34, r: lerp(1, d, 0.72), inner: 1 }, { u: t.u - t.gap * 0.16, r: lerp(1, d, 0.95), inner: 1 },
                 { u: t.u, r: d, inner: 1 },
                 { u: t.u + t.gap * 0.16, r: lerp(1, d, 0.95), inner: 1 }, { u: t.u + t.gap * 0.34, r: lerp(1, d, 0.72), inner: 1 });
      } else {
        pts.push({ u: t.u, r: d, inner: 1 });
      }
    }
    pts.sort((a, b) => a.u - b.u);
    // every strip between two tears hangs a little differently, so the margin looks ragged
    const mul = (o.segMul && (sg < 0 ? o.segMul[0] : o.segMul[1])) || [];
    return pts.map((p) => {
      const seg = tears.filter((t) => t.u < p.u).length;
      const m = p.inner ? 1 : (mul[seg] ?? 1);
      return E(p.u, sg, p.r * m);
    });
  };
  const right = sidePoints(1), left = sidePoints(-1);
  const outline = () => {
    ctx.beginPath();
    ctx.moveTo(right[0][0], right[0][1]);
    for (const p of right) ctx.lineTo(p[0], p[1]);
    for (let i = left.length - 1; i >= 0; i--) ctx.lineTo(left[i][0], left[i][1]);
    ctx.closePath();
  };

  /* --- stalk (petiole) ---------------------------------------------------------------------- */
  if (o.stalk > 0) {
    ribbon(ctx, sp, 0, sb + 0.04, o.stalkW[0], o.stalkW[1], 30);
    ctx.fillStyle = o.pal.stalk; ctx.fill();
    ribbon(ctx, sp, 0, sb + 0.04, o.stalkW[0] * 0.38, o.stalkW[1] * 0.3, 30);
    ctx.fillStyle = rgba(o.pal.rib, 0.5); ctx.fill();
  }

  /* --- blade: clip to the torn outline, then paint strip by strip ---------------------------- */
  ctx.save();
  outline(); ctx.clip();
  const Q = o.strips || 60;
  for (let i = 0; i < Q; i++) {
    const u0 = i / Q, u1 = Math.min(1, (i + 1.3) / Q), um = (i + 0.5) / Q;
    for (const sg of [-1, 1]) {
      const a = M(u0), b = M(u1), e0 = E(u0, sg, 1.1), e1 = E(u1, sg, 1.1), m = M(um), em = E(um, sg, 1);
      const [cin, cmid, cout] = o.colors(um, sg, i);
      const g = ctx.createLinearGradient(m.x, m.y, em[0], em[1]);
      g.addColorStop(0, cin); g.addColorStop(0.5, cmid); g.addColorStop(1, cout);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(e0[0], e0[1]); ctx.lineTo(e1[0], e1[1]); ctx.lineTo(b.x, b.y); ctx.closePath(); ctx.fill();
    }
  }
  // fine parallel side veins
  const V = o.veins || 110;
  ctx.lineWidth = o.veinW || 1;
  for (let i = 1; i < V; i++) {
    const u = i / V;
    for (const sg of [-1, 1]) {
      const m = M(u), e = E(u, sg, 1.02);
      ctx.strokeStyle = i % 2 ? rgba(o.pal.veinDark, o.veinA ?? 0.16) : rgba(o.pal.veinLight, (o.veinA ?? 0.16) * 0.9);
      ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(e[0], e[1]); ctx.stroke();
    }
  }
  // a few stronger veins (monstera lobes, bird-of-paradise ribs)
  if (o.mainVeins) {
    for (const mv of o.mainVeins) {
      const m = M(mv.u), e = E(mv.u, mv.sg, 0.97);
      ctx.strokeStyle = rgba(o.pal.rib, mv.a ?? 0.55); ctx.lineWidth = mv.w ?? 2;
      ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(e[0], e[1]); ctx.stroke();
    }
  }
  ctx.restore();

  // sun-bleached lip along the margin and the torn edges
  outline();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = rgba(o.pal.lip, o.lipA ?? 0.5); ctx.lineWidth = o.lipW ?? 1.6; ctx.stroke();

  /* --- holes (monstera) ---------------------------------------------------------------------- */
  if (o.holes) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    for (const h of o.holes) {
      const c = E(h.u, h.sg, h.r), m = M(h.u), e = E(h.u, h.sg, 1);
      const ang = Math.atan2(e[1] - m.y, e[0] - m.x);
      ctx.beginPath(); ctx.ellipse(c[0], c[1], h.len, h.len * h.fat, ang, 0, PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  /* --- midrib: pale, tapered, with a thin shadow so it reads as raised ---------------------------- */
  ctx.save(); ctx.translate(o.ribW[0] * 0.45, 0);
  ribbon(ctx, sp, sb - 0.02, 1, o.ribW[0], o.ribW[1], 40, 0.8);
  ctx.fillStyle = rgba(o.pal.veinDark, 0.35); ctx.fill(); ctx.restore();
  ribbon(ctx, sp, sb - 0.02, 1, o.ribW[0], o.ribW[1], 40, 0.8);
  ctx.fillStyle = o.pal.rib; ctx.fill();

  const hull = [];
  for (const u of [0.08, 0.26, 0.44, 0.62, 0.8, 0.95]) { const p = M(u); hull.push([p.x + p.tx * sweep(u) * hw(u) * 0.5, -(p.y + p.ty * sweep(u) * hw(u) * 0.5), Math.max(hw(u) * 0.92, o.stalkW ? o.stalkW[1] * 2 : 4)]); }
  for (const s of [0.3, 0.7]) { const p = sp.at(sb * s); hull.push([p.x, -p.y, (o.stalkW ? o.stalkW[0] : 4) * 1.5]); }
  return { len: total, hull };
}

/** tear positions down one side of a leaf: more of them, and deeper, toward the tip */
function makeTears(R, { from = 0.14, to = 0.94, count = 5, depth = [0.5, 0.96], gap = [0.006, 0.02], every = [0.07, 0.2] }) {
  const out = [];
  let u = R.range(from, from + 0.1);
  while (u < to && out.length < count) {
    out.push({ u, depth: R.range(depth[0], depth[1]), gap: R.range(gap[0], gap[1]) });
    u += R.range(every[0], every[1]);
  }
  return out;
}
const segMuls = (R, n, lo = 0.9, hi = 1.03) => Array.from({ length: n + 1 }, () => R.range(lo, hi));

/* ============================================================================================
 * BANANA LEAF — huge oblong paddle, thick stalk, pale midrib, fine veins, wind-shredded margin
 * ========================================================================================== */
function banana(ctx, R, v) {
  const L = v.len, stalk = L * v.stalk, blade = L - stalk;
  const tearsR = makeTears(R, { count: v.tears[0], every: [0.06, 0.19] });
  const tearsL = makeTears(R, { count: v.tears[1], every: [0.07, 0.22] });
  const pal = v.pal;
  return paddle(ctx, {
    stalk, blade, halfW: blade * v.wide,
    angle: (s) => v.lean * s + v.curl * s * s * s,
    env: (u) => Math.pow(Math.sin(PI * Math.pow(u, 0.8)), 0.5) * (1 - 0.14 * u),
    sweep: (u) => 0.36 * (1 - Math.pow(u, 8)),
    sideW: v.sideW,
    tearsL, tearsR, segMul: [segMuls(R, tearsL.length), segMuls(R, tearsR.length)],
    strips: 64, veins: 150, veinA: 0.15,
    stalkW: [L * 0.02, L * 0.012], ribW: [L * 0.0105, L * 0.0016],
    pal: { stalk: mix(pal.mid, G5, 0.35), rib: RIB, veinDark: G1, veinLight: G6, lip: mix(G6, '#F3E79A', 0.4) },
    lipA: 0.55,
    colors: (u, sg, i) => {
      const fold = sg < 0 ? v.fold : 0;                                   // one half sits in its own shade
      const pleat = (i % 2 ? 0.05 : -0.03) + (i % 7 === 0 ? -0.07 : 0);  // corrugation between veins
      const k = fold + pleat + lerp(-0.07, 0.1, u);                       // a little lighter toward the tip
      return [shade(pal.inn, k - 0.05), shade(pal.mid, k), shade(pal.out, k + 0.06)];
    },
  });
}

/* ============================================================================================
 * BIRD OF PARADISE LEAF — an upright grey-green paddle on a long stiff stalk, folded like a canoe
 * ========================================================================================== */
function bopLeaf(ctx, R, v) {
  const L = v.len, stalk = L * v.stalk, blade = L - stalk;
  const tearsR = makeTears(R, { count: v.tears, from: 0.45, depth: [0.3, 0.7], gap: [0.004, 0.012], every: [0.14, 0.3] });
  const pal = { inn: '#2B6A4C', mid: '#48905F', out: '#86B982' };
  return paddle(ctx, {
    stalk, blade, halfW: blade * v.wide,
    angle: (s) => v.lean * s + v.curl * s * s,
    env: (u) => Math.pow(Math.sin(PI * Math.pow(u, 0.86)), 0.72),
    sweep: (u) => 0.55 * (1 - Math.pow(u, 6)),
    sideW: v.sideW,
    tearsL: [], tearsR, segMul: [[1], segMuls(R, tearsR.length, 0.94, 1.02)],
    strips: 54, veins: 120, veinA: 0.13,
    stalkW: [L * 0.013, L * 0.009], ribW: [L * 0.0085, L * 0.0014],
    pal: { stalk: '#6F9A62', rib: '#E6E2B4', veinDark: '#17402A', veinLight: '#CFE2B0', lip: '#C9DDA8' },
    lipA: 0.5,
    mainVeins: Array.from({ length: 9 }, (_, i) => ({ u: 0.1 + i * 0.095, sg: i % 2 ? 1 : -1, a: 0.16, w: 1.6 })),
    colors: (u, sg, i) => {
      const k = (sg < 0 ? v.fold : 0.03) + (i % 2 ? 0.035 : -0.02) + lerp(-0.05, 0.08, u);
      return [shade(pal.inn, k - 0.04), shade(pal.mid, k), shade(pal.out, k + 0.04)];
    },
  });
}

/* ============================================================================================
 * MONSTERA — heart-shaped, deep rounded slits between the side veins, holes near the midrib
 * ========================================================================================== */
function monstera(ctx, R, v) {
  const L = v.len, stalk = L * v.stalk, blade = L - stalk;
  const slits = (n) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const u = lerp(0.13, 0.86, (i + 0.5) / n) + R.range(-0.012, 0.012);
      out.push({ u, depth: R.range(0.5, 0.78) * (1 - 0.25 * Math.abs(u - 0.45)), gap: R.range(0.034, 0.05) });
    }
    return out;
  };
  const tearsR = slits(v.slits), tearsL = slits(v.slits);
  const lobeMids = (ts) => { const us = [0.04, ...ts.map((t) => t.u), 0.97]; return us.slice(0, -1).map((u, i) => (u + us[i + 1]) / 2); };
  const holes = [], mainVeins = [];
  for (const [sg, ts] of [[1, tearsR], [-1, tearsL]]) {
    lobeMids(ts).forEach((u, i) => {
      mainVeins.push({ u: u - 0.02, sg, a: 0.5, w: 2.2 });
      if (i > 0 && i < ts.length && R.chance(0.7)) holes.push({ u: u - 0.015, sg, r: R.range(0.14, 0.3), len: blade * R.range(0.022, 0.04), fat: R.range(0.34, 0.5) });
    });
  }
  const pal = v.pal;
  return paddle(ctx, {
    stalk, blade, halfW: blade * 0.5,
    angle: (s) => v.lean * s + v.curl * s * s,
    env: (u) => Math.pow(Math.sin(PI * Math.pow(u, 0.62)), 0.8) * (1 - 0.3 * u),
    sweep: (u) => lerp(-0.78, 0.95, Math.pow(u, 0.8)),
    sideW: v.sideW,
    tearsL, tearsR, roundTears: true,
    strips: 56, veins: 60, veinA: 0.08,
    stalkW: [L * 0.011, L * 0.008], ribW: [L * 0.009, L * 0.0016],
    pal: { stalk: mix(G3, G5, 0.3), rib: '#B9D67A', veinDark: G0, veinLight: G5, lip: G5 },
    lipA: 0.45, lipW: 1.4,
    mainVeins, holes,
    colors: (u, sg, i) => {
      const gloss = 0.07 * Math.sin(u * (v.slits + 1) * PI * 2 + (sg < 0 ? 1.2 : 0));   // soft sheen per lobe
      const k = (sg < 0 ? v.fold : 0.02) + gloss + lerp(-0.04, 0.05, u);
      return [shade(pal.inn, k - 0.03), shade(pal.mid, k), shade(pal.out, k + 0.03)];
    },
  });
}

/* ============================================================================================
 * PINNATE PALM FROND (coconut palm) — curved rachis, many narrow leaflets, feathered not solid
 *   v.grav = which way gravity pulls inside the sprite, so one drawing can be used pointing up,
 *            sideways or hanging and its leaflets still droop the right way.
 * ========================================================================================== */
function frond(ctx, R, v) {
  const sp = makeSpine(v.len, 100, (s) => v.lean0 + v.arc * Math.pow(s, v.arcPow));
  const leaflets = [];
  for (let i = 0; i < v.n; i++) {
    for (const sg of [-1, 1]) {
      if (R.chance(0.035)) continue;                                   // a leaflet has snapped off
      const s = 0.07 + 0.92 * (i + (sg > 0 ? 0.5 : 0.08)) / v.n;      // left and right alternate
      const p = sp.at(s);
      // length envelope: short at the base, longest about 40% along, tapering to the tip
      const env = smoothstep(-0.22, 0.3, s) * Math.pow(Math.sin(PI * Math.pow(s, 0.66)), 0.75);
      const ell = v.maxLeaf * (0.1 + 0.9 * env) * R.range(0.9, 1.07) * (sg < 0 ? v.backScale : 1);
      const off = lerp(v.splay[0], v.splay[1], Math.pow(s, 0.85)) * DEG * R.range(0.92, 1.08);   // angle off the rachis
      const a = p.ang + sg * off;
      const [dx, dy] = dir(a);
      const k = clamp(v.droop * R.range(0.75, 1.25));
      let ex = dx * (1 - k) + v.grav[0] * k, ey = dy * (1 - k) + v.grav[1] * k;
      const n = Math.hypot(ex, ey) || 1; ex /= n; ey /= n;
      const cx = p.x + dx * ell * 0.48, cy = p.y + dy * ell * 0.48;
      leaflets.push({ sg, s, ax: p.x, ay: p.y, cx, cy, ex: cx + ex * ell * 0.56, ey: cy + ey * ell * 0.56, w: Math.max(2.2, ell * v.leafW) * R.range(0.85, 1.15), tone: R.range(-0.08, 0.08) });
    }
  }
  const drawLeaflet = (lf) => {
    const P = (t) => { const m = 1 - t; return [m * m * lf.ax + 2 * m * t * lf.cx + t * t * lf.ex, m * m * lf.ay + 2 * m * t * lf.cy + t * t * lf.ey]; };
    const up = [], dn = [], S = 7;
    for (let i = 0; i <= S; i++) {
      const t = i / S, a = P(Math.max(0, t - 0.04)), b = P(Math.min(1, t + 0.04));
      let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
      const w = lf.w * 2.9 * Math.pow(t, 0.5) * Math.pow(1 - t, 1.3) + (t < 0.05 ? lf.w * 0.25 : 0);
      const c = P(t);
      up.push([c[0] + nx * w, c[1] + ny * w]); dn.push([c[0] - nx * w, c[1] - ny * w]);
    }
    const dark = lf.sg < 0 ? v.pal.backBase : v.pal.base, light = lf.sg < 0 ? v.pal.backTip : v.pal.tip;
    const g = ctx.createLinearGradient(lf.ax, lf.ay, lf.ex, lf.ey);
    g.addColorStop(0, shade(dark, lf.tone - 0.04)); g.addColorStop(0.55, shade(mix(dark, light, 0.6), lf.tone)); g.addColorStop(1, shade(light, lf.tone + 0.05));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(up[0][0], up[0][1]);
    for (const p of up) ctx.lineTo(p[0], p[1]);
    for (let i = dn.length - 1; i >= 0; i--) ctx.lineTo(dn[i][0], dn[i][1]);
    ctx.closePath(); ctx.fill();
    // each leaflet is folded along its length: a thin lit crease
    ctx.strokeStyle = rgba(v.pal.crease, 0.38); ctx.lineWidth = Math.max(0.8, lf.w * 0.22);
    ctx.beginPath(); ctx.moveTo(lf.ax, lf.ay); ctx.quadraticCurveTo(lf.cx, lf.cy, lf.ex, lf.ey); ctx.stroke();
  };
  for (const lf of leaflets) if (lf.sg < 0) drawLeaflet(lf);
  ribbon(ctx, sp, 0, 1, v.len * 0.012, v.len * 0.0018, 60, 0.9);
  ctx.fillStyle = v.pal.rachis; ctx.fill();
  for (const lf of leaflets) if (lf.sg > 0) drawLeaflet(lf);
  ribbon(ctx, sp, 0, 0.9, v.len * 0.0045, v.len * 0.0008, 50, 0.9);
  ctx.fillStyle = rgba('#F2E9A8', 0.6); ctx.fill();

  const hull = [];
  for (const s of [0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 0.97]) {
    const p = sp.at(s), env = smoothstep(-0.22, 0.3, s) * Math.pow(Math.sin(PI * Math.pow(s, 0.66)), 0.75);
    hull.push([p.x + v.grav[0] * v.maxLeaf * env * 0.25, -(p.y + v.grav[1] * v.maxLeaf * env * 0.25), v.maxLeaf * (0.1 + 0.9 * env) * 0.7]);
  }
  return { len: v.len, hull };
}

/* ============================================================================================
 * FAN PALM — pleated blades radiating from one point; fused inner half, pointed and split rim
 * ========================================================================================== */
function fanPalm(ctx, R, v) {
  const sp = makeSpine(v.stalk, 30, (s) => v.lean * s);
  const hub = sp.at(1), N = v.n, base = hub.ang;
  const radiusAt = (rel) => v.radius * (0.64 + 0.36 * Math.cos(rel * PI * 0.5));
  const tips = [], notches = [];
  for (let k = 0; k <= N; k++) {
    const rel = (k / N) * 2 - 1, a = base + rel * v.span * 0.5, d = dir(a);
    const rn = radiusAt(rel) * v.fused * R.range(0.9, 1.1);
    notches.push([hub.x + d[0] * rn, hub.y + d[1] * rn]);
  }
  for (let k = 0; k < N; k++) {
    const rel = ((k + 0.5) / N) * 2 - 1, a = base + rel * v.span * 0.5 + R.range(-0.012, 0.012), d = dir(a);
    const r = radiusAt(rel) * R.range(0.92, 1.05);
    tips.push({ x: hub.x + d[0] * r, y: hub.y + d[1] * r + r * 0.11 * rel * rel, rel });   // outer blades sag
  }
  // petiole
  ribbon(ctx, sp, 0, 1, v.stalk * 0.016, v.stalk * 0.011, 20);
  ctx.fillStyle = mix(v.pal.mid, G5, 0.3); ctx.fill();
  ribbon(ctx, sp, 0, 1, v.stalk * 0.005, v.stalk * 0.003, 20);
  ctx.fillStyle = rgba(RIB, 0.55); ctx.fill();
  // blades: each one is two pleat faces, one catching light and one in shade
  for (let k = 0; k < N; k++) {
    const t = tips[k], a = notches[k], b = notches[k + 1];
    const tone = R.range(-0.05, 0.05) - 0.1 * t.rel * t.rel;
    for (const half of [0, 1]) {
      const n = half ? b : a, k2 = tone + (half ? -0.09 : 0.06);
      const g = ctx.createRadialGradient(hub.x, hub.y, v.radius * 0.04, hub.x, hub.y, v.radius);
      g.addColorStop(0, shade(v.pal.hub, k2)); g.addColorStop(0.5, shade(v.pal.mid, k2)); g.addColorStop(1, shade(v.pal.rim, k2 + 0.05));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(hub.x, hub.y); ctx.lineTo(n[0], n[1]); ctx.lineTo(t.x, t.y); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 0.8; ctx.stroke();           // hide hairline seams
    }
  }
  ctx.lineCap = 'round';
  for (let k = 0; k < N; k++) {
    ctx.strokeStyle = rgba(RIB, 0.5); ctx.lineWidth = 1.5;                            // rib up the middle of each blade
    ctx.beginPath(); ctx.moveTo(hub.x, hub.y); ctx.lineTo(tips[k].x, tips[k].y); ctx.stroke();
  }
  for (let k = 1; k < N; k++) {
    ctx.strokeStyle = rgba(G0, 0.42); ctx.lineWidth = 1.3;                            // crease between blades
    ctx.beginPath(); ctx.moveTo(hub.x, hub.y); ctx.lineTo(notches[k][0], notches[k][1]); ctx.stroke();
  }
  ctx.fillStyle = rgba(RIB, 0.85);
  ctx.beginPath(); ctx.ellipse(hub.x, hub.y, v.radius * 0.035, v.radius * 0.05, base, 0, PI * 2); ctx.fill();

  const hull = [[hub.x + hub.tx * v.radius * 0.3, -(hub.y + hub.ty * v.radius * 0.3), v.radius * 0.72]];
  for (const s of [0.25, 0.6]) { const p = sp.at(s); hull.push([p.x, -p.y, v.stalk * 0.03]); }
  return { len: v.stalk + v.radius, hull };
}

/* ============================================================================================
 * PALM TREE — slender ringed trunk, a crown of drooping fronds, coconuts. For the far distance.
 * ========================================================================================== */
function palmTree(ctx, R, v) {
  const H = v.height;
  const sp = makeSpine(H, 70, (s) => v.lean * s + v.curve * Math.sin(s * PI * 0.9));
  const top = sp.at(1);
  // trunk
  ribbon(ctx, sp, 0, 1, H * 0.021, H * 0.0125, 50, 0.6);
  ctx.fillStyle = '#3F4A2C'; ctx.fill();
  ctx.save(); ctx.translate(-H * 0.006, 0);                                          // lit side
  ribbon(ctx, sp, 0, 1, H * 0.008, H * 0.004, 50, 0.6);
  ctx.fillStyle = rgba('#8E9457', 0.6); ctx.fill(); ctx.restore();
  for (let i = 1; i < 44; i++) {                                                     // ring scars
    const p = sp.at(i / 44), w = lerp(H * 0.021, H * 0.0125, Math.pow(i / 44, 0.6));
    ctx.strokeStyle = rgba('#1B2414', 0.5); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(p.x - p.nx * w, p.y - p.ny * w); ctx.quadraticCurveTo(p.x - p.tx * w * 0.35, p.y - p.ty * w * 0.35, p.x + p.nx * w, p.y + p.ny * w); ctx.stroke();
  }
  // crown
  const fronds = [];
  for (let i = 0; i < v.fronds; i++) {
    const rel = (i / (v.fronds - 1)) * 2 - 1;                                         // -1 … 1 around the crown
    const a0 = rel * 150 * DEG + R.range(-0.14, 0.14);
    const up = 1 - Math.abs(rel);
    fronds.push({ a0, len: v.frond * R.range(0.82, 1.05) * (0.86 + 0.14 * (1 - up)), droop: (a0 >= 0 ? 1 : -1) * R.range(0.75, 1.35) * (0.55 + 0.45 * (1 - up)), up });
  }
  const drawFrond = (f) => {
    const fs = makeSpine(f.len, 40, (s) => f.a0 + f.droop * Math.pow(s, 1.5), top.x, top.y);
    const n = 30;
    for (const sg of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        const s = 0.06 + 0.93 * (i + 0.5) / n, p = fs.at(s);
        const env = smoothstep(-0.2, 0.3, s) * Math.pow(Math.sin(PI * Math.pow(s, 0.7)), 0.75);
        const ell = f.len * 0.26 * (0.12 + 0.88 * env) * R.range(0.85, 1.1);
        const [dx, dy] = dir(p.ang + sg * lerp(70, 28, s) * DEG);
        let ex = dx * 0.5, ey = dy * 0.5 + 0.5; const m = Math.hypot(ex, ey) || 1; ex /= m; ey /= m;   // leaflets hang
        const w = Math.max(1.6, ell * 0.075);
        const tone = (sg < 0 ? -0.1 : 0.04) + R.range(-0.06, 0.06) + f.up * 0.08;
        ctx.fillStyle = shade(mix(G2, G4, 0.35 + 0.4 * s), tone);
        ctx.beginPath();
        ctx.moveTo(p.x - p.tx * w, p.y - p.ty * w);
        ctx.quadraticCurveTo(p.x + dx * ell * 0.5 - p.tx * w, p.y + dy * ell * 0.5 - p.ty * w, p.x + dx * ell * 0.45 + ex * ell * 0.55, p.y + dy * ell * 0.45 + ey * ell * 0.55);
        ctx.quadraticCurveTo(p.x + dx * ell * 0.5 + p.tx * w, p.y + dy * ell * 0.5 + p.ty * w, p.x + p.tx * w, p.y + p.ty * w);
        ctx.closePath(); ctx.fill();
      }
    }
    ribbon(ctx, fs, 0, 1, H * 0.0055, H * 0.001, 30);
    ctx.fillStyle = '#9DAA55'; ctx.fill();
  };
  const order = [...fronds].sort((a, b) => a.up - b.up);     // lowest-hanging first
  order.slice(0, Math.floor(order.length * 0.45)).forEach(drawFrond);
  for (let i = 0; i < v.nuts; i++) {
    const a = R.range(-1.2, 1.2), r = H * 0.022;
    ctx.fillStyle = i % 2 ? '#5A4A22' : '#6E6A2E';
    ctx.beginPath(); ctx.arc(top.x + Math.sin(a) * r * 1.2, top.y + Math.abs(Math.cos(a)) * r * 1.5 + r * 0.6, H * 0.014, 0, PI * 2); ctx.fill();
  }
  order.slice(Math.floor(order.length * 0.45)).forEach(drawFrond);
  return { len: H + v.frond * 0.9, hull: [[top.x, -top.y, v.frond * 0.8]], crown: [top.x, -top.y], crownR: v.frond };
}

/* ============================================================================================
 * HELICONIA ("lobster claw") — fat boat-shaped bracts stacked zig-zag up the top of a stem, each
 * one cupped upward with a lime lip. Supporting cast, and the only pink in the planting.
 * ========================================================================================== */
function heliconia(ctx, R, v) {
  const L = v.len;
  const sp = makeSpine(L, 60, (s) => v.lean * s + 0.07 * Math.sin(s * 11) * smoothstep(0.35, 0.55, s));
  ribbon(ctx, sp, 0, 1, L * 0.012, L * 0.0055, 36);
  ctx.fillStyle = mix(G3, G5, 0.4); ctx.fill();
  ribbon(ctx, sp, 0, 0.95, L * 0.004, L * 0.0018, 36);
  ctx.fillStyle = rgba(RIB, 0.5); ctx.fill();
  const n = v.bracts;
  for (let i = 0; i < n; i++) {                                                         // bottom bract first; each tucks behind the one above
    const k = i / (n - 1), s = lerp(0.44, 0.965, Math.pow(k, 0.92)), p = sp.at(s), sg = i % 2 ? 1 : -1;
    const len = L * lerp(0.135, 0.062, Math.pow(k, 0.85)) * R.range(0.94, 1.06);
    const a = p.ang + sg * lerp(58, 30, k) * DEG;
    const [dx, dy] = dir(a), nx = -dy * sg, ny = dx * sg;                               // n = the belly (outer, lower) side
    const tip = [p.x + dx * len, p.y + dy * len - len * 0.06];
    const P = (f, b) => [p.x + dx * len * f + nx * len * b, p.y + dy * len * f + ny * len * b];
    const b1 = P(0.12, 0.42), b2 = P(0.72, 0.36), l1 = P(0.45, -0.035);
    const g = ctx.createLinearGradient(p.x, p.y, tip[0], tip[1]);
    g.addColorStop(0, shade(v.color, -0.2)); g.addColorStop(0.3, v.color); g.addColorStop(0.72, mix(v.color, PALETTE.barro, 0.55)); g.addColorStop(1, PALETTE.cempasuchil);
    const body = () => { ctx.beginPath(); ctx.moveTo(p.x - dx * len * 0.04, p.y - dy * len * 0.04);
      ctx.bezierCurveTo(b1[0], b1[1], b2[0], b2[1], tip[0], tip[1]); ctx.quadraticCurveTo(l1[0], l1[1], p.x - dx * len * 0.04, p.y - dy * len * 0.04); ctx.closePath(); };
    body(); ctx.fillStyle = g; ctx.fill();
    ctx.save(); body(); ctx.clip();                                                     // the belly rounds away into shade
    const g2 = ctx.createLinearGradient(l1[0], l1[1], P(0.45, 0.34)[0], P(0.45, 0.34)[1]);
    g2.addColorStop(0, rgba('#FFD9A0', 0.28)); g2.addColorStop(0.4, rgba('#FFD9A0', 0)); g2.addColorStop(1, rgba('#5A1230', 0.42));
    ctx.fillStyle = g2; ctx.fillRect(-9999, -9999, 19998, 19998);
    ctx.restore();
    ctx.strokeStyle = rgba(PALETTE.lima, 0.9); ctx.lineWidth = Math.max(1.6, len * 0.035); ctx.lineCap = 'round';   // lime lip along the open top edge
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(l1[0], l1[1], tip[0], tip[1]); ctx.stroke();
  }
  return { len: L, hull: [[0, L * 0.92, L * 0.12], [0, L * 0.72, L * 0.17], [0, L * 0.52, L * 0.18], [0, L * 0.25, L * 0.03]] };
}

/* ============================================================================================
 * BIRD OF PARADISE FLOWER (Strelitzia reginae), drawn as three kinds of part so it can open:
 *   bopStalk  the tall bare stalk bending over into the horizontal, beak-like green spathe
 *   bopSepal  one long pointed orange sepal (the scene fans 4-5 of them up out of the spathe)
 *   bopPetal  the cobalt, arrow-shaped petal that sits among them
 * ========================================================================================== */
function bopStalk(ctx, R, v) {
  const L = v.len;
  // the bare stalk rises almost straight, nods over in its last fifth and swells into the spathe
  const sp = makeSpine(L, 120, (s) => v.lean * s + v.curl * s * s + smoothstep(0.76, 1.0, s) * v.nod);
  const w0 = L * 0.0105, w1 = L * 0.0082, w2 = L * 0.0125;
  const stalkW = (s) => (s < 0.84 ? lerp(w0, w1, s / 0.84) : lerp(w1, w2, Math.pow((s - 0.84) / 0.16, 1.5)));
  ribbon(ctx, sp, 0, 0.845, w0, w1, 50);
  ctx.fillStyle = '#5E8F4C'; ctx.fill();
  ribbon(ctx, sp, 0.835, 1, w1, w2, 26, 1.5);                                          // the neck
  ctx.fillStyle = '#5E8F4C'; ctx.fill();
  ctx.save(); ctx.translate(-L * 0.003, 0);
  ribbon(ctx, sp, 0, 0.97, L * 0.0035, L * 0.0026, 60);
  ctx.fillStyle = rgba('#B8D28A', 0.6); ctx.fill(); ctx.restore();

  const J = sp.at(1);
  const sa = v.beak * DEG;                                 // beak direction (≈ 77° = pointing right, a touch upward)
  const [ax, ay] = dir(sa), nx = Math.cos(sa), ny = Math.sin(sa);   // n = the keel (under) side
  const S = L * v.spathe, D = S * 0.25;
  const tip = [J.x + ax * S, J.y + ay * S];
  const P = (f, k) => [J.x + ax * S * f + nx * D * k, J.y + ay * S * f + ny * D * k];
  // where the spathe grows out of the neck: the two edges of the stalk, a little way back from the joint
  const bt = sp.at(0.955), bk = sp.at(0.9);
  const BT = [bt.x - bt.nx * stalkW(0.955), bt.y - bt.ny * stalkW(0.955)], BK = [bk.x + bk.nx * stalkW(0.9), bk.y + bk.ny * stalkW(0.9)];
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(BT[0], BT[1]);
    // top edge: a low shoulder, then nearly straight to the tip - this is the slit the flowers come out of
    ctx.bezierCurveTo(...P(0.1, -0.5), ...P(0.5, -0.36), tip[0], tip[1]);
    // keel: sweeps back from the sharp beak into a deep belly a third of the way along …
    ctx.bezierCurveTo(...P(0.72, 0.52), ...P(0.36, 1.22), ...P(0.07, 0.86));
    // … and tapers into the underside of the neck
    ctx.quadraticCurveTo(...P(-0.07, 0.58), BK[0], BK[1]);
    ctx.closePath();
  };
  const g = ctx.createLinearGradient(J.x, J.y, tip[0], tip[1]);
  g.addColorStop(0, '#5E8F4C'); g.addColorStop(0.35, '#6C9350'); g.addColorStop(0.72, '#8E7A45'); g.addColorStop(1, '#B4553A');
  body(); ctx.fillStyle = g; ctx.fill();
  // shade under the keel, light along the shoulder
  ctx.save(); body(); ctx.clip();
  const g2 = ctx.createLinearGradient(...P(0.4, -0.4), ...P(0.4, 1.15));
  g2.addColorStop(0, rgba('#E4EE9C', 0.5)); g2.addColorStop(0.42, rgba('#DCE6A2', 0)); g2.addColorStop(1, rgba('#12301F', 0.55));
  ctx.fillStyle = g2; ctx.fillRect(-9999, -9999, 19998, 19998);
  ctx.strokeStyle = rgba('#12301F', 0.22); ctx.lineWidth = Math.max(1, L * 0.0016);     // two long creases, as on the real bract
  for (const k of [0.28, 0.62]) { ctx.beginPath(); ctx.moveTo(...P(0.02, k * 0.8)); ctx.quadraticCurveTo(...P(0.45, k * 0.95), tip[0], tip[1]); ctx.stroke(); }
  ctx.restore();
  // the slit: a lime-lit upper lip with the dusky red edge the real flower has
  ctx.lineCap = 'round';
  ctx.save(); body(); ctx.clip();
  ctx.strokeStyle = rgba(PALETTE.lima, 0.8); ctx.lineWidth = Math.max(3, L * 0.009);
  ctx.beginPath(); ctx.moveTo(BT[0], BT[1]); ctx.bezierCurveTo(...P(0.1, -0.5), ...P(0.5, -0.36), tip[0], tip[1]); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = rgba(PALETTE.barro, 0.95); ctx.lineWidth = Math.max(1.4, L * 0.0026);
  ctx.beginPath(); ctx.moveTo(BT[0], BT[1]); ctx.bezierCurveTo(...P(0.1, -0.5), ...P(0.5, -0.36), tip[0], tip[1]); ctx.stroke();

  return { len: L, hull: [[J.x + ax * S * 0.5, -(J.y + ay * S * 0.5), S * 0.6], [sp.at(0.5).x, -sp.at(0.5).y, L * 0.02]],
           head: [J.x, -J.y], beak: sa, spathe: S };
}

function bopSepal(ctx, R, v) {
  const L = v.len, W = L * v.wide;
  const sp = makeSpine(L, 40, (s) => v.curl * s * s);
  const hw = (u) => W * (0.26 * (1 - u) + Math.pow(Math.sin(PI * Math.pow(u, 0.8)), 0.9));
  const pts = (sg) => Array.from({ length: 33 }, (_, i) => { const u = i / 32, p = sp.at(u), w = hw(u) * sg; return [p.x + p.nx * w, p.y + p.ny * w]; });
  const r = pts(1), l = pts(-1);
  const shape = (a, b) => { ctx.beginPath(); ctx.moveTo(a[0][0], a[0][1]); a.forEach((p) => ctx.lineTo(p[0], p[1])); for (let i = b.length - 1; i >= 0; i--) ctx.lineTo(b[i][0], b[i][1]); ctx.closePath(); };
  const mid = Array.from({ length: 33 }, (_, i) => { const p = sp.at(i / 32); return [p.x, p.y]; });
  const tip = sp.at(1);
  const g = ctx.createLinearGradient(0, 0, tip.x, tip.y);
  g.addColorStop(0, PALETTE.barro); g.addColorStop(0.3, mix(PALETTE.barro, PALETTE.cempasuchil, 0.65)); g.addColorStop(0.72, PALETTE.cempasuchil); g.addColorStop(1, '#F9CB6B');
  shape(r, l); ctx.fillStyle = g; ctx.fill();
  shape(mid, l); ctx.fillStyle = rgba(PALETTE.barro, 0.3); ctx.fill();                  // shaded half
  ctx.strokeStyle = rgba('#8E3A1E', 0.55); ctx.lineWidth = Math.max(1, W * 0.1);       // crease
  ctx.beginPath(); mid.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
  ctx.strokeStyle = rgba('#FFE39A', 0.75); ctx.lineWidth = Math.max(1, W * 0.09);      // lit edge
  ctx.beginPath(); r.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
  return { len: L, hull: [[0, L * 0.5, W]] };
}

function bopPetal(ctx, R, v) {
  const L = v.len;
  // half-width profile of the arrow: thin shaft, two back-swept barbs, long point
  const prof = [[0, 0.02], [0.2, 0.025], [0.34, 0.032], [0.4, 0.108], [0.455, 0.124], [0.56, 0.1], [0.75, 0.052], [0.9, 0.02], [1, 0]];
  const side = (sg) => prof.map(([u, w]) => [sg * w * L + v.curl * L * u * u, -u * L + (u > 0.37 && u < 0.43 ? L * 0.04 : 0)]);
  const r = side(1), l = side(-1).reverse();
  const g = ctx.createLinearGradient(0, 0, v.curl * L, -L);
  g.addColorStop(0, '#DDE5FF'); g.addColorStop(0.22, '#5B7FE6'); g.addColorStop(0.5, PALETTE.cobalto); g.addColorStop(1, '#1D3696');
  ctx.beginPath(); ctx.moveTo(r[0][0], r[0][1]);
  for (const p of r) ctx.lineTo(p[0], p[1]);
  for (const p of l) ctx.lineTo(p[0], p[1]);
  ctx.closePath(); ctx.fillStyle = g; ctx.lineJoin = 'round'; ctx.fill();
  ctx.strokeStyle = rgba('#8FA9F5', 0.85); ctx.lineWidth = Math.max(1, L * 0.008);
  ctx.beginPath(); ctx.moveTo(0, -L * 0.1); ctx.quadraticCurveTo(v.curl * L * 0.25, -L * 0.5, v.curl * L * 0.86, -L * 0.93); ctx.stroke();
  return { len: L, hull: [[0, L * 0.5, L * 0.1]] };
}

/* ============================================================================================
 * The atlas: where every sprite lives. `x,y,w,h` is its cell (px), `pu` the pivot's position
 * across the cell (0..1). Cells are padded so blurred copies do not bleed into their neighbours.
 * ========================================================================================== */
const PAD = 36;
const bananaPal = [
  { inn: G3, mid: G4, out: mix(G5, G6, 0.35) },             // A: classic mid green
  { inn: G4, mid: G5, out: G6 },                            // B: young leaf, almost lime
  { inn: G2, mid: G3, out: G4 },                            // C: old leaf, deep
];
const frondPal = [
  { base: G2, tip: G4, backBase: G1, backTip: G3, rachis: '#B9C46A', crease: G6 },
  { base: G3, tip: G5, backBase: G2, backTip: G4, rachis: '#C8CF74', crease: '#E6F08A' },
  { base: G2, tip: mix(G4, PALETTE.olivo, 0.35), backBase: G1, backTip: G3, rachis: '#AEB763', crease: G5 },
];

export const SPRITES = [
  /* ---- foliage atlas, row 1 ---- */
  { id: 'bananaA', atlas: 'foliage', x: 0, y: 0, w: 448, h: 1024, pu: 0.47, seed: 11,
    draw: (c, R, s) => banana(c, R, { len: s.up, stalk: 0.15, wide: 0.19, lean: 0.1, curl: 0.16, sideW: [0.92, 1], fold: -0.14, tears: [6, 4], pal: bananaPal[0] }) },
  { id: 'bananaB', atlas: 'foliage', x: 448, y: 0, w: 448, h: 1024, pu: 0.55, seed: 23,
    draw: (c, R, s) => banana(c, R, { len: s.up, stalk: 0.13, wide: 0.2, lean: -0.16, curl: -0.1, sideW: [1, 0.86], fold: 0.1, tears: [3, 5], pal: bananaPal[1] }) },
  { id: 'bananaC', atlas: 'foliage', x: 896, y: 0, w: 448, h: 1024, pu: 0.4, seed: 37,
    draw: (c, R, s) => banana(c, R, { len: s.up * 0.98, stalk: 0.17, wide: 0.185, lean: 0.05, curl: 0.42, sideW: [0.8, 1], fold: -0.2, tears: [7, 6], pal: bananaPal[2] }) },
  { id: 'bopLeafA', atlas: 'foliage', x: 1344, y: 0, w: 352, h: 1024, pu: 0.47, seed: 41,
    draw: (c, R, s) => bopLeaf(c, R, { len: s.up, stalk: 0.5, wide: 0.235, lean: 0.06, curl: 0.12, sideW: [0.74, 1], fold: -0.17, tears: 1 }) },
  { id: 'bopLeafB', atlas: 'foliage', x: 1696, y: 0, w: 352, h: 1024, pu: 0.55, seed: 53,
    draw: (c, R, s) => bopLeaf(c, R, { len: s.up * 0.97, stalk: 0.56, wide: 0.25, lean: -0.1, curl: -0.1, sideW: [1, 0.7], fold: 0.08, tears: 2 }) },
  { id: 'frondA', atlas: 'foliage', x: 2048, y: 0, w: 640, h: 1024, pu: 0.4, seed: 61,   // upright
    draw: (c, R, s) => frond(c, R, { len: s.up * 0.99, lean0: -0.12, arc: 0.5, arcPow: 1.7, n: 42, maxLeaf: 215, leafW: 0.062, splay: [72, 22], droop: 0.3, grav: [0, 1], backScale: 0.9, pal: frondPal[0] }) },
  { id: 'frondB', atlas: 'foliage', x: 2688, y: 0, w: 704, h: 1024, pu: 0.3, seed: 73,   // reaching sideways: gravity = sprite's right
    draw: (c, R, s) => frond(c, R, { len: s.up * 1.02, lean0: -0.26, arc: 1.25, arcPow: 1.7, n: 44, maxLeaf: 215, leafW: 0.06, splay: [74, 24], droop: 0.42, grav: [1, 0], backScale: 0.78, pal: frondPal[1] }) },
  { id: 'frondD', atlas: 'foliage', x: 3392, y: 0, w: 704, h: 1024, pu: 0.42, seed: 89,  // hanging: gravity = toward its own tip
    draw: (c, R, s) => frond(c, R, { len: s.up * 0.93, lean0: -0.2, arc: 0.62, arcPow: 1.4, n: 44, maxLeaf: 250, leafW: 0.055, splay: [64, 16], droop: 0.5, grav: [0.25, -0.97], backScale: 0.92, pal: frondPal[2] }) },
  /* ---- foliage atlas, row 2 ---- */
  { id: 'frondC', atlas: 'foliage', x: 0, y: 1024, w: 704, h: 1024, pu: 0.27, seed: 97,  // strongly arched over
    draw: (c, R, s) => frond(c, R, { len: s.up * 1.06, lean0: -0.3, arc: 1.75, arcPow: 1.5, n: 46, maxLeaf: 200, leafW: 0.058, splay: [70, 22], droop: 0.5, grav: [0.94, 0.34], backScale: 0.72, pal: frondPal[0] }) },
  { id: 'fanA', atlas: 'foliage', x: 704, y: 1024, w: 768, h: 1024, pu: 0.5, seed: 103,
    draw: (c, R, s) => fanPalm(c, R, { stalk: s.up - 345, radius: 340, lean: 0.06, n: 26, span: 250 * DEG, fused: 0.52, pal: { hub: G2, mid: G3, rim: G5 } }) },
  { id: 'fanB', atlas: 'foliage', x: 1472, y: 1024, w: 768, h: 1024, pu: 0.5, seed: 113,
    draw: (c, R, s) => fanPalm(c, R, { stalk: s.up - 340, radius: 334, lean: -0.1, n: 22, span: 215 * DEG, fused: 0.44, pal: { hub: G1, mid: mix(G3, PALETTE.olivo, 0.3), rim: mix(G5, PALETTE.olivo, 0.25) } }) },
  { id: 'monsteraA', atlas: 'foliage', x: 2240, y: 1024, w: 640, h: 1024, pu: 0.5, seed: 127,
    draw: (c, R, s) => monstera(c, R, { len: s.up, stalk: 0.4, lean: 0.05, curl: 0.1, slits: 6, sideW: [0.95, 1], fold: -0.1, pal: { inn: G1, mid: G2, out: G3 } }) },
  { id: 'monsteraB', atlas: 'foliage', x: 2880, y: 1024, w: 640, h: 1024, pu: 0.5, seed: 131,
    draw: (c, R, s) => monstera(c, R, { len: s.up * 0.97, stalk: 0.42, lean: -0.08, curl: -0.12, slits: 5, sideW: [1, 0.9], fold: 0.07, pal: { inn: G2, mid: G3, out: G4 } }) },
  { id: 'heliconia', atlas: 'foliage', x: 3520, y: 1024, w: 208, h: 1024, pu: 0.5, pad: 14, seed: 139,
    draw: (c, R, s) => heliconia(c, R, { len: s.up * 0.8, lean: 0.05, bracts: 8, color: PALETTE.buganvilia }) },
  { id: 'bopStalk', atlas: 'foliage', x: 3728, y: 1024, w: 272, h: 1024, pu: 0.13, pad: 14, seed: 149,
    draw: (c, R, s) => bopStalk(c, R, { len: s.up * 0.97, lean: 0.03, curl: -0.09, nod: 0.8, beak: 77, spathe: 0.172 }) },
  { id: 'bopSepalA', atlas: 'foliage', x: 4000, y: 1024, w: 96, h: 340, pu: 0.5, pad: 12, seed: 151,
    draw: (c, R, s) => bopSepal(c, R, { len: s.up, wide: 0.07, curl: 0.12 }) },
  { id: 'bopSepalB', atlas: 'foliage', x: 4000, y: 1364, w: 96, h: 340, pu: 0.5, pad: 12, seed: 157,
    draw: (c, R, s) => bopSepal(c, R, { len: s.up * 0.96, wide: 0.062, curl: -0.16 }) },
  { id: 'bopPetal', atlas: 'foliage', x: 4000, y: 1704, w: 96, h: 344, pu: 0.5, pad: 12, seed: 163,
    draw: (c, R, s) => bopPetal(c, R, { len: s.up, curl: 0.05 }) },
  /* ---- tree atlas ---- */
  { id: 'treeA', atlas: 'trees', x: 0, y: 0, w: 704, h: 1024, pu: 0.42, seed: 211,
    draw: (c, R, s) => palmTree(c, R, { height: s.up - 250, lean: 0.14, curve: 0.1, fronds: 13, frond: 300, nuts: 4 }) },
  { id: 'treeB', atlas: 'trees', x: 704, y: 0, w: 704, h: 1024, pu: 0.58, seed: 223,
    draw: (c, R, s) => palmTree(c, R, { height: s.up - 300, lean: -0.2, curve: -0.12, fronds: 12, frond: 310, nuts: 3 }) },
  { id: 'treeC', atlas: 'trees', x: 1408, y: 0, w: 640, h: 1024, pu: 0.34, seed: 227,
    draw: (c, R, s) => palmTree(c, R, { height: s.up - 235, lean: 0.03, curve: 0.2, fronds: 11, frond: 262, nuts: 5 }) },
];

export const ATLAS_SIZE = { foliage: [4096, 2048], trees: [2048, 1024] };
export const BLUR_DIV = 8;        // the pre-blurred copy of each atlas is this many times smaller
export const CARD_ROWS = 12;      // each leaf card is this many rows of quads, root to tip

/**
 * Draw every sprite and pack them into the atlases.
 * @param {number} scale  1 = full size (4096px wide); 0.5 halves every dimension for small GPUs
 * @returns {{ canvases, blurs, sprites, outline }}
 *   canvases.foliage / .trees   the sharp atlases (2D canvases)
 *   blurs.foliage / .trees      { data, width, height }: small pre-blurred copies (see softCopy)
 *   sprites[id] = { index, atlas, uv:[u0,v0,du,dv], aspect (w/h of the cell), pivot:[u,v], len (fraction
 *                   of cell height), hull:[[x,y,r]…] in units of `len`, …extras from the draw function }
 *   outline     { data, width, height }: for every sprite, how far the drawing reaches left and right
 *               at each row of its card, so the GPU only shades where there is actually leaf
 */
export function buildAtlases(scale = 1) {
  const canvases = {}, ctxs = {}, sprites = {}, blurs = {};
  for (const [name, [w, h]] of Object.entries(ATLAS_SIZE)) {
    const c = document.createElement('canvas');
    c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    canvases[name] = c; ctxs[name] = c.getContext('2d');
  }
  const scratch = document.createElement('canvas');
  const sctx = scratch.getContext('2d');
  SPRITES.forEach((s, index) => {
    const pad = s.pad ?? PAD;
    scratch.width = Math.round(s.w * scale); scratch.height = Math.round(s.h * scale);
    const px = s.w * s.pu, py = s.h - pad;                      // pivot inside the cell
    sctx.setTransform(scale, 0, 0, scale, px * scale, py * scale);
    const space = { up: s.h - pad * 2, left: px - pad, right: s.w - px - pad };
    const info = s.draw(sctx, rng(s.seed), space);
    const [aw, ah] = ATLAS_SIZE[s.atlas];
    ctxs[s.atlas].drawImage(scratch, Math.round(s.x * scale), Math.round(s.y * scale));
    const { len, hull, ...extra } = info;
    sprites[s.id] = {
      id: s.id, index, atlas: s.atlas,
      uv: [s.x / aw, 1 - (s.y + s.h) / ah, s.w / aw, s.h / ah],
      aspect: s.w / s.h, pivot: [s.pu, pad / s.h], len: len / s.h,
      hull: hull.map(([x, y, r]) => [x / len, y / len, r / len]),
      ...normaliseExtras(extra, len),
    };
  });
  scratch.width = scratch.height = 0;

  // one small copy of each atlas does two jobs: it tells us where each drawing actually is
  // (the outline table), and, blurred, it is what out-of-focus leaves are painted with
  const W = CARD_ROWS + 2, outline = { data: new Uint8Array(W * SPRITES.length * 4), width: W, height: SPRITES.length };
  for (const name of Object.keys(canvases)) {
    const small = shrink(canvases[name], BLUR_DIV);
    SPRITES.forEach((s, i) => { if (s.atlas === name) outline.data.set(outlineOf(small, s, scale / BLUR_DIV), i * W * 4); });
    blurs[name] = softCopy(small);
  }
  return { canvases, blurs, sprites, outline };
}

/* positions returned by a draw function (px) → units of that sprite's own length */
function normaliseExtras(extra, len) {
  const out = { ...extra };
  if (extra.head) out.head = extra.head.map((v) => v / len);
  if (extra.crown) out.crown = extra.crown.map((v) => v / len);
  if (extra.crownR) out.crownR = extra.crownR / len;
  if (extra.spathe) out.spathe = extra.spathe / len;
  return out;
}

/** a clean 1/div copy of a canvas (halved repeatedly), as RGBA bytes, top row first */
function shrink(canvas, div) {
  let src = canvas, w = canvas.width, h = canvas.height;
  for (let d = div; d > 1; d /= 2) {
    const c = document.createElement('canvas');
    w = Math.max(1, w >> 1); h = Math.max(1, h >> 1);
    c.width = w; c.height = h;
    const cx = c.getContext('2d', { willReadFrequently: d <= 2 });
    cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
    cx.drawImage(src, 0, 0, w, h);
    src = c;
  }
  return { data: src.getContext('2d').getImageData(0, 0, w, h).data, width: w, height: h };
}

/**
 * Where one sprite's drawing sits inside its cell, as one row of the outline table:
 * CARD_ROWS + 1 texels of [left, right] (0..255 across the cell) from the bottom of the drawing to
 * its top, then one texel of [bottom, top]. A margin is left all round for anti-aliasing and blur.
 */
function outlineOf(small, s, k) {
  const x0 = Math.floor(s.x * k), x1 = Math.ceil((s.x + s.w) * k), y0 = Math.floor(s.y * k), y1 = Math.ceil((s.y + s.h) * k);
  const cw = x1 - x0, ch = y1 - y0, lo = new Int32Array(ch).fill(1e6), hi = new Int32Array(ch).fill(-1);
  let top = -1, bottom = -1;                                     // rows (from the top of the cell) that hold any ink
  for (let y = 0; y < ch; y++) {
    const row = ((y0 + y) * small.width + x0) * 4 + 3;
    for (let x = 0; x < cw; x++) if (small.data[row + x * 4] > 0) { if (x < lo[y]) lo[y] = x; hi[y] = x + 1; }
    if (hi[y] >= 0) { if (top < 0) top = y; bottom = y + 1; }
  }
  const out = new Uint8Array((CARD_ROWS + 2) * 4);
  if (top < 0) return out;
  const mx = 26 * k, my = 22 * k;                                // margins: 26 and 22 px of the full-size drawing, in small-copy px
  const vb = Math.max(0, ch - bottom - my), vt = Math.min(ch, ch - top + my);     // crop, measured up from the cell's bottom edge
  const band = (a, b) => {                                       // widest reach of the drawing between two heights
    let l = 1e6, r = -1;
    for (let y = Math.max(0, Math.floor(ch - b)); y < Math.min(ch, Math.ceil(ch - a)); y++) if (hi[y] >= 0) { l = Math.min(l, lo[y]); r = Math.max(r, hi[y]); }
    return [l, r];
  };
  const bands = [];
  for (let j = 0; j < CARD_ROWS; j++) bands.push(band(lerp(vb, vt, j / CARD_ROWS) - my * 0.5, lerp(vb, vt, (j + 1) / CARD_ROWS) + my * 0.5));
  for (let j = 0; j <= CARD_ROWS; j++) {
    const a = bands[Math.max(0, j - 1)], b = bands[Math.min(CARD_ROWS - 1, j)];
    let l = Math.min(a[0], b[0]), r = Math.max(a[1], b[1]);
    if (r < 0) { l = cw * s.pu; r = l; }                         // nothing drawn at this height: collapse onto the pivot line
    out[j * 4] = Math.floor(clamp((l - mx) / cw) * 255); out[j * 4 + 1] = Math.ceil(clamp((r + mx) / cw) * 255); out[j * 4 + 3] = 255;
  }
  out[(CARD_ROWS + 1) * 4] = Math.floor((vb / ch) * 255); out[(CARD_ROWS + 1) * 4 + 1] = Math.ceil((vt / ch) * 255); out[(CARD_ROWS + 1) * 4 + 3] = 255;
  return out;
}

/**
 * Blur a small copy (soft Gaussian, done in premultiplied alpha so edges do not pick up dark halos).
 * Returns raw RGBA bytes, bottom row first, ready to be a GL texture.
 */
function softCopy(small) {
  const w = small.width, h = small.height, img = small.data;
  let a = new Float32Array(w * h * 4), b = new Float32Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const al = img[i * 4 + 3] / 255;
    a[i * 4] = img[i * 4] * al; a[i * 4 + 1] = img[i * 4 + 1] * al; a[i * 4 + 2] = img[i * 4 + 2] * al; a[i * 4 + 3] = img[i * 4 + 3];
  }
  const r = 2, win = r * 2 + 1;
  const pass = (src2, dst, horizontal) => {
    const outer = horizontal ? h : w, inner = horizontal ? w : h, step = horizontal ? 4 : w * 4;
    for (let o = 0; o < outer; o++) {
      const base = horizontal ? o * w * 4 : o * 4;
      for (let ch = 0; ch < 4; ch++) {
        let sum = 0;
        for (let k = -r; k <= r; k++) sum += src2[base + clamp(k, 0, inner - 1) * step + ch];
        for (let i = 0; i < inner; i++) {
          dst[base + i * step + ch] = sum / win;
          sum += src2[base + Math.min(inner - 1, i + r + 1) * step + ch] - src2[base + Math.max(0, i - r) * step + ch];
        }
      }
    }
  };
  for (let n = 0; n < 3; n++) { pass(a, b, true); pass(b, a, false); }   // 3 box blurs ≈ Gaussian
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const srcRow = (h - 1 - y) * w * 4, dstRow = y * w * 4;                // flip: GL wants the bottom row first
    for (let i = 0; i < w * 4; i++) out[dstRow + i] = Math.round(a[srcRow + i]);
  }
  return { data: out, width: w, height: h };
}

/* ============================================================================================
 * PAPEL PICADO — the cut tissue-paper flags strung over a Mexican party. Three designs, drawn in
 * plain white so the scene can dye each flag one of the six palette colours. Only geometric
 * cut-outs (flowers, suns, diamonds): no hearts, doves or bells.
 * ========================================================================================== */
export const PAPER = { cell: [256, 352], count: 3, pad: 10 };

export function buildPaper(scale = 1) {
  const [cw, ch] = PAPER.cell, pad = PAPER.pad;
  const c = document.createElement('canvas');
  c.width = Math.round(cw * PAPER.count * scale); c.height = Math.round(ch * scale);
  const ctx = c.getContext('2d');
  const w = cw - pad * 2, h = ch - pad * 2;
  const punch = (fn) => { ctx.beginPath(); fn(); ctx.fill(); };
  const diamond = (x, y, rx, ry) => { ctx.moveTo(x, y - ry); ctx.lineTo(x + rx, y); ctx.lineTo(x, y + ry); ctx.lineTo(x - rx, y); ctx.closePath(); };
  const dot = (x, y, r) => { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, PI * 2); };
  const petal = (x, y, a, r0, r1, wd) => {                       // a pointed oval radiating from (x, y)
    const [dx, dy] = dir(a), nx = -dy, ny = dx, m = (r0 + r1) / 2;
    ctx.moveTo(x + dx * r0, y + dy * r0);
    ctx.quadraticCurveTo(x + dx * m + nx * wd, y + dy * m + ny * wd, x + dx * r1, y + dy * r1);
    ctx.quadraticCurveTo(x + dx * m - nx * wd, y + dy * m - ny * wd, x + dx * r0, y + dy * r0);
  };
  for (let d = 0; d < PAPER.count; d++) {
    ctx.setTransform(scale, 0, 0, scale, (d * cw + pad) * scale, pad * scale);
    ctx.globalCompositeOperation = 'source-over';
    // the sheet: straight top (folded over the string), shaped bottom edge
    const n = d === 1 ? 6 : 5, sw = w / n, drop = d === 1 ? 30 : 26;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, 0); ctx.lineTo(w, h - drop);
    for (let i = n - 1; i >= 0; i--) {
      if (d === 1) { ctx.lineTo((i + 0.5) * sw, h); ctx.lineTo(i * sw, h - drop); }      // zig-zag
      else ctx.quadraticCurveTo((i + 0.5) * sw, h + drop * 0.9, i * sw, h - drop);      // scallops
    }
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#E9E9E9'); g.addColorStop(0.08, '#FFFFFF'); g.addColorStop(1, '#F4F4F4');
    ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.07)';                           // soft creases where the stack of tissue was folded for cutting
    ctx.fillRect(w / 2 - 1, 0, 2, h); ctx.fillRect(0, h * 0.5 - 1, w, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fillRect(0, 0, w, 7); // the glued hem
    // cut-outs
    ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#000';
    const cx = w / 2, cy = h * 0.47;
    for (let i = 0; i < n; i++) punch(() => dot((i + 0.5) * sw, h - drop * (d === 1 ? 0.95 : 0.55), d === 1 ? 6 : 7));
    for (let i = 0; i < 7; i++) punch(() => diamond(w * (i + 0.5) / 7, 26, 9, 9));
    if (d === 0) {                                                // FLOR: an eight-petalled flower in a ring of dots
      for (let i = 0; i < 8; i++) punch(() => petal(cx, cy, i * PI / 4, 22, 84, 21));
      punch(() => dot(cx, cy, 13));
      for (let i = 0; i < 16; i++) { const a = (i + 0.5) * PI / 8; punch(() => dot(cx + Math.sin(a) * 102, cy - Math.cos(a) * 102, 6)); }
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) punch(() => petal(cx + sx * 96, cy + sy * 122, Math.atan2(-sx, sy) , 4, 44, 13));
    } else if (d === 1) {                                         // ROMBOS: a lattice of diamonds
      for (let r = 0; r < 5; r++) for (let q = 0; q < (r % 2 ? 3 : 4); q++) {
        const x = w * ((q + (r % 2 ? 1 : 0.5)) / 4), y = 72 + r * 48;
        punch(() => diamond(x, y, r === 2 ? 25 : 20, r === 2 ? 22 : 18));
      }
      for (let r = 0; r < 4; r++) for (const x of [9, w - 9]) punch(() => diamond(x, 96 + r * 48, 5, 12));
    } else {                                                      // SOL: a sun with long and short rays
      punch(() => dot(cx, cy, 26));
      for (let i = 0; i < 16; i++) punch(() => petal(cx, cy, i * PI / 8, 38, i % 2 ? 74 : 104, i % 2 ? 7 : 10));
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { punch(() => dot(cx + sx * 92, cy + sy * 112, 9)); punch(() => dot(cx + sx * 66, cy + sy * 124, 5)); punch(() => dot(cx + sx * 104, cy + sy * 86, 5)); }
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over';
  return c;
}
