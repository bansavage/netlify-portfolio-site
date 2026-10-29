// The map: MapLibre GL (WebGL) instead of the atlas's Leaflet/SVG map, so wheel, trackpad
// and pinch zoom are continuous and stay locked to the fingers. Every label and pin is
// drawn to a canvas in the wedding's own typefaces and handed to the GPU as an icon, which
// also gets MapLibre's label collision for free. Icon ids carry the theme, so switching
// light/dark just swaps ids and the missing ones are drawn on demand.

import { S, commit } from "../store.js";
import { app, mainRes as res, nav, STATUS, pinHTML, passes, taqOK, lateOK } from "../app.js";
import { illo } from "../illo.js";
import { photosOf, photoSrc, photoTag, photoLabel } from "../photos.js";
import { gmapsURL, esc, k, kMXN, vbadge, ICON, norm, debounce } from "../util.js";

const ML_JS = "https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js";
const ML_CSS = "https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css";
const TOPO_JS = "https://unpkg.com/topojson-client@3.1.0/dist/topojson-client.min.js";
const MEX = [[-117.3, 14.5], [-86.7, 32.7]];
const PR = Math.max(2, Math.min(3, Math.ceil(window.devicePixelRatio || 1)));
const FIXNAME = { "Distrito Federal": "Ciudad de México", "México": "Estado de México" };
const WATER = [["Pacific Ocean", 15.6, -105.2], ["Gulf of Mexico", 24.6, -93.2], ["Caribbean Sea", 18.2, -84.9], ["Sea of Cortés", 27.2, -111.4]];
const COUNTRIES = [["United States", 33.2, -103.5], ["Guatemala", 15.6, -90.4], ["Belize", 17.1, -88.75]];
const PRI = { out: 0, over: 1, wild: 2, fit: 3, top: 4 };

let map = null, ready = false, root = null, panel = null, listEl = null, activeMk = null;
let theme = "light", T = {};
let hoverKey = null, cardKey = null, cardPinned = false;
const isPhone = () => matchMedia("(max-width: 760px)").matches;
const canHover = () => matchMedia("(hover: hover) and (pointer: fine)").matches;

/* ---------- loading ---------- */
function loadScript(src, ok) {
  if (ok()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src; s.async = true; s.crossOrigin = "anonymous";
    s.onload = () => resolve(); s.onerror = () => reject(new Error("Couldn't load " + src));
    document.head.appendChild(s);
  });
}
function loadCSS(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; document.head.appendChild(l);
}
export async function libs() {
  loadCSS(ML_CSS);
  await Promise.all([loadScript(ML_JS, () => window.maplibregl), loadScript(TOPO_JS, () => window.topojson)]);
  const fonts = ['600 11px "GT Standard"', '600 12px "GT Standard"', '500 11px "GT Standard"', '500 13px "GT Standard"', '600 11.5px "GT Standard"'];
  await Promise.race([Promise.all(fonts.map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 2500))]);
}

/* ---------- theme ---------- */
function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  const g = (n) => cs.getPropertyValue(n).trim();
  theme = document.documentElement.dataset.theme || "light";
  T = { sea: g("--sea"), land: g("--land"), landV: g("--land-venues"), neighbor: g("--neighbor"), border: g("--border"), coast: g("--coast"),
    ink: g("--ink"), ink2: g("--ink-2"), ink3: g("--ink-3"), surface: g("--surface"), line: g("--line"),
    top: g("--top"), fit: g("--fit"), wild: g("--wild"), over: g("--over"), out: g("--out"), star: g("--star") };
}
function hexRGB(h) { const m = h.replace("#", ""); const n = parseInt(m.length === 3 ? m.split("").map((c) => c + c).join("") : m, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(a, b, t) { const A = hexRGB(a), B = hexRGB(b); return `rgb(${A.map((x, i) => Math.round(x * t + B[i] * (1 - t))).join(",")})`; }

/* ---------- canvas icons ---------- */
function cv(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.ceil(w * PR); c.height = Math.ceil(h * PR);
  const g = c.getContext("2d"); g.scale(PR, PR);
  return [c, g];
}
const img = (c, g) => g.getImageData(0, 0, c.width, c.height);
function spacedWidth(g, text, ls) { let w = 0; for (const ch of text) w += g.measureText(ch).width + ls; return w - ls; }
function spacedText(g, text, x, y, ls, stroke) { for (const ch of text) { if (stroke) g.strokeText(ch, x, y); else g.fillText(ch, x, y); x += g.measureText(ch).width + ls; } }
function label(text, { font, size, color, halo, ls = 0, upper = false, alpha = 1 }) {
  const t = upper ? text.toUpperCase() : text;
  const [m0, g0] = cv(1, 1); g0.font = font;
  const tw = Math.ceil(spacedWidth(g0, t, ls)), hw = 3;
  const W = tw + hw * 2 + 2, H = Math.ceil(size * 1.5) + hw * 2;
  const [c, g] = cv(W, H);
  g.font = font; g.textBaseline = "middle"; g.globalAlpha = alpha;
  if (halo) { g.strokeStyle = halo; g.lineWidth = hw; g.lineJoin = "round"; spacedText(g, t, hw + 1, H / 2, ls, true); }
  g.fillStyle = color; spacedText(g, t, hw + 1, H / 2, ls, false);
  m0.width = 0;
  return img(c, g);
}
function circle(g, x, y, r, fill, stroke, sw) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = sw; g.stroke(); } }
function diamond(g, x, y, r, fill) { g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.beginPath(); const s = r * 1.42; if (g.roundRect) g.roundRect(-s / 2, -s / 2, s, s, 2.5); else g.rect(-s / 2, -s / 2, s, s); g.fillStyle = fill; g.fill(); g.restore(); }
const PIN = { top: 26, fit: 15, over: 15, wild: 15, out: 11 };
function pinIcon(status, top, star) {
  const s = PIN[status] || 15, ring = star ? 3.5 : 0, pad = 5;
  const W = s + 4 + ring * 2 + pad * 2;
  const [c, g] = cv(W, W); const x = W / 2, y = W / 2, col = T[status] || T.fit;
  const shape = status === "wild" ? diamond : (gg, xx, yy, r, f) => circle(gg, xx, yy, r, f);
  if (star) shape(g, x, y, s / 2 + 2 + ring, T.star);
  g.shadowColor = "rgba(0,0,0,.35)"; g.shadowBlur = 3; g.shadowOffsetY = 1;
  shape(g, x, y, s / 2 + (status === "out" ? 1.5 : 2), T.surface);
  g.shadowColor = "transparent";
  shape(g, x, y, s / 2, col);
  if (status === "top" && top) { g.fillStyle = "#fff"; g.font = '600 11.5px "GT Standard"'; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(top), x, y + 0.5); }
  return img(c, g);
}
function clusterIcon(n) {
  const d = n < 6 ? 30 : n < 15 ? 36 : 42, pad = 5, W = d + pad * 2;
  const [c, g] = cv(W, W);
  g.shadowColor = "rgba(0,0,0,.22)"; g.shadowBlur = 6; g.shadowOffsetY = 2;
  circle(g, W / 2, W / 2, d / 2, mix(T.fit, T.surface, 0.2));
  g.shadowColor = "transparent";
  circle(g, W / 2, W / 2, d / 2 - 1, null, T.fit, 2);
  g.fillStyle = T.ink; g.font = '600 12.5px "GT Standard"'; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(n), W / 2, W / 2 + 0.5);
  return img(c, g);
}
function cityIcon(tier, name) {
  const font = tier === 1 ? '600 12px "GT Standard"' : '500 11px "GT Standard"';
  const [m, g0] = cv(1, 1); g0.font = font; const tw = Math.ceil(g0.measureText(name).width); m.width = 0;
  const r = tier === 1 ? 4 : 3, hw = 3, H = 20, W = r * 2 + 5 + tw + hw * 2 + 4;
  const [c, g] = cv(W, H);
  const cx = hw + r + 1;
  if (tier === 1) circle(g, cx, H / 2, r, T.ink2, T.surface, 1.5); else circle(g, cx, H / 2, r, T.surface, T.ink2, 1.5);
  g.font = font; g.textBaseline = "middle";
  const tx = cx + r + 5;
  g.strokeStyle = T.land; g.lineWidth = hw; g.lineJoin = "round"; g.strokeText(name, tx, H / 2);
  g.fillStyle = tier === 1 ? T.ink : T.ink2; g.fillText(name, tx, H / 2);
  return { image: img(c, g), anchorX: cx };
}
const PLANE = new Path2D("M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z");
function airportIcon(code) {
  const [m, g0] = cv(1, 1); g0.font = '600 10.5px "GT Standard"'; const tw = Math.ceil(g0.measureText(code).width); m.width = 0;
  const W = 17 + tw + 12 + 4, H = 20;
  const [c, g] = cv(W, H);
  g.save(); g.translate(1, 2.5); g.scale(15 / 24, 15 / 24); g.fillStyle = T.ink; g.strokeStyle = T.land; g.lineWidth = 3; g.stroke(PLANE); g.fill(PLANE); g.restore();
  const bx = 18, bw = tw + 9;
  g.fillStyle = T.surface; g.strokeStyle = T.line.startsWith("rgba") ? T.border : T.line; g.lineWidth = 1;
  g.beginPath(); if (g.roundRect) g.roundRect(bx, 3.5, bw, 13, 4); else g.rect(bx, 3.5, bw, 13); g.fill(); g.stroke();
  g.fillStyle = T.ink; g.font = '600 10.5px "GT Standard"'; g.textBaseline = "middle"; g.fillText(code, bx + 4.5, H / 2 + 0.5);
  return img(c, g);
}
function nameIcon(text) {
  const font = '600 11px "GT Standard"';
  const [m, g0] = cv(1, 1); g0.font = font; const tw = Math.ceil(g0.measureText(text).width); m.width = 0;
  const W = tw + 12 + 6, H = 24;
  const [c, g] = cv(W, H);
  g.shadowColor = "rgba(0,0,0,.14)"; g.shadowBlur = 3; g.shadowOffsetY = 1;
  g.fillStyle = T.surface; g.beginPath(); if (g.roundRect) g.roundRect(3, 3.5, tw + 12, 17, 5); else g.rect(3, 3.5, tw + 12, 17); g.fill();
  g.shadowColor = "transparent";
  g.fillStyle = T.ink; g.font = font; g.textBaseline = "middle"; g.fillText(text, 9, H / 2 + 0.5);
  return img(c, g);
}

// icon ids: kind|args…|theme
function makeIcon(id) {
  const p = id.split("|");
  const kind = p[0];
  if (kind === "pin") return { image: pinIcon(p[1], +p[2], p[3] === "1") };
  if (kind === "cl") return { image: clusterIcon(+p[1]) };
  if (kind === "ci") return cityIcon(+p[1], p[2]);
  if (kind === "ap") return { image: airportIcon(p[1]) };
  if (kind === "vn") { const v = app.byKey.get(p[1]); return { image: nameIcon(v ? v.short : p[1]) }; }
  if (kind === "st") {
    const small = p[2].endsWith("9");
    return { image: label(p[2].startsWith("s") ? p[3] : p[1], { font: `600 ${small ? 9 : 10.5}px "GT Standard"`, size: small ? 9 : 10.5, color: T.ink3, halo: T.land, ls: small ? 1 : 1.45, upper: true, alpha: 0.92 }) };
  }
  if (kind === "wa") return { image: label(p[1], { font: '500 13px "GT Standard"', size: 13, color: T.coast, ls: 1.2, alpha: 0.95 }) };
  if (kind === "co") return { image: label(p[1], { font: '600 10px "GT Standard"', size: 10, color: T.ink3, halo: T.sea, ls: 2.2, upper: true, alpha: 0.7 }) };
  return null;
}

// Draw the icons the next zooms will ask for while the map is idle, so a new cluster count
// or label size never has to be drawn in the middle of a gesture.
let warmQueue = [];
function prewarm() {
  const t = theme, ids = [];
  for (let n = 2; n <= 90; n++) ids.push(`cl|${n}|${t}`);
  for (const s of ["fit", "wild", "over", "out"]) for (const st of [0, 1]) ids.push(`pin|${s}|0|${st}|${t}`);
  for (let i = 1; i <= 20; i++) for (const st of [0, 1]) ids.push(`pin|top|${i}|${st}|${t}`);
  for (const l of app.geo.labels) for (const vnt of ["f9", "s9", "f10", "s10"]) ids.push(`st|${l.name}|${vnt}|${l.short}|${t}`);
  for (const c of app.geo.cities) ids.push(`ci|${c.tier}|${c.name}|${t}`);
  for (const a of app.geo.airports) ids.push(`ap|${a.iata}|${t}`);
  if (S.ui.layers.vnames) for (const v of app.venues) ids.push(`vn|${v.key}|${t}`);
  const fresh = !warmQueue.length;
  warmQueue = ids;
  if (!fresh) return;
  const idle = window.requestIdleCallback || ((fn) => setTimeout(() => fn({ timeRemaining: () => 6 }), 16));
  const step = (dl) => {
    let n = 0;
    while (warmQueue.length && (dl.timeRemaining() > 2 || n < 2)) {
      const id = warmQueue.shift(); n++;
      if (!map || map.hasImage(id)) continue;
      const ic = makeIcon(id);
      if (ic) map.addImage(id, ic.image, { pixelRatio: PR });
    }
    if (warmQueue.length) idle(step);
  };
  idle(step);
}

/* ---------- data ---------- */
let statesFC, bordersGeo, coastGeo, labelFC, cityFC, apFC, waterFC, countryFC;
function buildGeo() {
  const topo = app.geo.topo;
  const obj = topo.objects[Object.keys(topo.objects)[0]];
  const venueStates = new Set(app.venues.map((v) => v.state));
  statesFC = topojson.feature(topo, obj);
  statesFC.features.forEach((ft) => {
    const n = ft.properties && ft.properties.name;
    if (n && FIXNAME[n]) ft.properties.name = FIXNAME[n];
    ft.properties.hv = venueStates.has(ft.properties.name) ? 1 : 0;
  });
  bordersGeo = topojson.mesh(topo, obj, (a, b) => a !== b && a.properties && b.properties && a.properties.name && b.properties.name);
  coastGeo = topojson.mesh(topo, obj, (a, b) => a === b || !(a.properties && a.properties.name) || !(b.properties && b.properties.name));
  const pt = (lng, lat, props) => ({ type: "Feature", geometry: { type: "Point", coordinates: [lng, lat] }, properties: props });
  labelFC = { type: "FeatureCollection", features: app.geo.labels.map((l) => pt(l.lng, l.lat, { name: l.name, short: l.short, size: l.area < 1.3 ? "small" : l.area < 3.2 ? "med" : "big" })) };
  cityFC = { type: "FeatureCollection", features: app.geo.cities.map((c) => pt(c.lng, c.lat, { name: c.name, tier: c.tier, pop: c.pop || 0 })) };
  apFC = { type: "FeatureCollection", features: app.geo.airports.map((a) => pt(a.lng, a.lat, { iata: a.iata })) };
  waterFC = { type: "FeatureCollection", features: WATER.map(([n, la, ln]) => pt(ln, la, { name: n })) };
  countryFC = { type: "FeatureCollection", features: COUNTRIES.map(([n, la, ln]) => pt(ln, la, { name: n })) };
  // venues that share a town sit on top of each other: fan them out a little
  const groups = new Map();
  for (const v of app.venues) { const key = v.lat.toFixed(3) + "," + v.lng.toFixed(3); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(v); }
  for (const g of groups.values()) {
    g.forEach((v, i) => {
      if (g.length === 1) { v._ll = [v.lng, v.lat]; return; }
      const a = (i / g.length) * Math.PI * 2, r = 0.0045 * Math.sqrt(g.length);
      v._ll = [v.lng + Math.cos(a) * r / Math.cos((v.lat * Math.PI) / 180), v.lat + Math.sin(a) * r];
    });
  }
}

function venueFeatures() {
  const cl = [], solo = [], names = [];
  for (const r of app.list) {
    if (r.norte) continue; // the Saltillo tab has its own map
    const v = r.v, st = S.venues[v.key];
    const star = st && st.star ? 1 : 0;
    const props = { key: v.key, status: r.status, top: r.top || 0, star, pri: r.status === "top" ? 100 - r.top : PRI[r.status] + star * 10 };
    const f = { type: "Feature", geometry: { type: "Point", coordinates: v._ll }, properties: props };
    if (r.status === "top" || star || v.key === app.activeKey) solo.push(f); else cl.push(f);
    names.push(f);
  }
  return { cl: { type: "FeatureCollection", features: cl }, solo: { type: "FeatureCollection", features: solo }, names: { type: "FeatureCollection", features: names } };
}

/* ---------- style ---------- */
const th = () => theme;
function iconExpr(parts) { return ["concat", ...parts.flatMap((p, i) => (i ? ["|", p] : [p])), "|", th()]; }
function layers() {
  const L = [];
  L.push({ id: "sea", type: "background", paint: { "background-color": T.sea } });
  L.push({ id: "nb-fill", type: "fill", source: "neighbors", paint: { "fill-color": T.neighbor } });
  L.push({ id: "nb-line", type: "line", source: "neighbors", paint: { "line-color": T.border, "line-width": 0.7, "line-opacity": 0.7 } });
  L.push({ id: "st-fill", type: "fill", source: "states", paint: { "fill-color": ["case", ["==", ["get", "hv"], 1], T.landV, T.land] } });
  L.push({ id: "borders", type: "line", source: "borders", layout: { "line-join": "round" }, paint: { "line-color": T.border, "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.8, 9, 1.4], "line-dasharray": [3, 2.5] } });
  L.push({ id: "coast", type: "line", source: "coast", layout: { "line-join": "round" }, paint: { "line-color": T.coast, "line-width": ["interpolate", ["linear"], ["zoom"], 4, 1, 9, 1.8] } });
  const stBase = { type: "symbol", source: "labels", layout: { "icon-allow-overlap": false, "icon-padding": 2, "symbol-z-order": "source" } };
  L.push(Object.assign({}, stBase, { id: "st-far", maxzoom: 5.25, filter: ["!=", ["get", "size"], "small"], layout: Object.assign({}, stBase.layout, { "icon-image": ["case", ["==", ["get", "size"], "big"], iconExpr(["st", ["get", "name"], "f9", ["get", "short"]]), iconExpr(["st", ["get", "name"], "s9", ["get", "short"]])] }) }));
  L.push(Object.assign({}, stBase, { id: "st-mid", minzoom: 5.25, maxzoom: 6.75, layout: Object.assign({}, stBase.layout, { "icon-image": ["case", ["==", ["get", "size"], "small"], iconExpr(["st", ["get", "name"], "s10", ["get", "short"]]), iconExpr(["st", ["get", "name"], "f10", ["get", "short"]])] }) }));
  L.push(Object.assign({}, stBase, { id: "st-near", minzoom: 6.75, layout: Object.assign({}, stBase.layout, { "icon-image": iconExpr(["st", ["get", "name"], "f10", ["get", "short"]]) }), paint: { "icon-opacity": ["interpolate", ["linear"], ["zoom"], 8.3, 1, 8.7, 0.55] } }));
  L.push({ id: "water", type: "symbol", source: "water", layout: { "icon-image": iconExpr(["wa", ["get", "name"]]), "icon-allow-overlap": true } });
  L.push({ id: "countries", type: "symbol", source: "countries", layout: { "icon-image": iconExpr(["co", ["get", "name"]]), "icon-allow-overlap": true } });
  const cityL = (id, tier, minzoom) => ({ id, type: "symbol", source: "cities", minzoom, filter: ["==", ["get", "tier"], tier], layout: { "icon-image": iconExpr(["ci", ["to-string", ["get", "tier"]], ["get", "name"]]), "icon-anchor": "left", "icon-offset": [tier === 1 ? -8 : -7, 0], "icon-padding": 1, "symbol-sort-key": ["-", 0, ["get", "pop"]] } });
  L.push(cityL("city-3", 3, 6.75), cityL("city-2", 2, 5.25), cityL("city-1", 1, 0));
  L.push({ id: "airports", type: "symbol", source: "airports", layout: { "icon-image": iconExpr(["ap", ["get", "iata"]]), "icon-anchor": "left", "icon-offset": [-9, 0], "icon-padding": 1, visibility: "none" } });
  const pinImg = iconExpr(["pin", ["get", "status"], ["to-string", ["get", "top"]], ["to-string", ["get", "star"]]]);
  L.push({ id: "vnames", type: "symbol", source: "v-names", minzoom: 9.6, filter: ["==", ["get", "top"], 0], layout: { "icon-image": iconExpr(["vn", ["get", "key"]]), "icon-anchor": "left", "icon-offset": [9, 0], "icon-padding": 1, visibility: "none" } });
  L.push({ id: "vnames-top", type: "symbol", source: "v-names", filter: [">", ["get", "top"], 0], layout: { "icon-image": iconExpr(["vn", ["get", "key"]]), "icon-anchor": "left", "icon-offset": [14, 0], "icon-padding": 1, visibility: "none" } });
  L.push({ id: "clusters", type: "symbol", source: "v-cl", filter: ["has", "point_count"], layout: { "icon-image": iconExpr(["cl", ["to-string", ["get", "point_count"]]]), "icon-allow-overlap": true, "icon-ignore-placement": true } });
  L.push({ id: "pins", type: "symbol", source: "v-cl", filter: ["!", ["has", "point_count"]], layout: { "icon-image": pinImg, "icon-allow-overlap": true, "icon-ignore-placement": true, "symbol-sort-key": ["get", "pri"] } });
  L.push({ id: "solo", type: "symbol", source: "v-solo", layout: { "icon-image": pinImg, "icon-allow-overlap": true, "icon-ignore-placement": true, "symbol-sort-key": ["get", "pri"] } });
  L.push({ id: "hl", type: "symbol", source: "v-hl", layout: { "icon-image": pinImg, "icon-allow-overlap": true, "icon-ignore-placement": true, "icon-size": 1.32 } });
  return L;
}
function style() {
  const fc = (features) => ({ type: "geojson", data: { type: "FeatureCollection", features } });
  const vf = venueFeatures();
  return {
    version: 8,
    sources: {
      neighbors: { type: "geojson", data: app.geo.neighbors },
      states: { type: "geojson", data: statesFC },
      borders: { type: "geojson", data: bordersGeo },
      coast: { type: "geojson", data: coastGeo },
      labels: { type: "geojson", data: labelFC },
      water: { type: "geojson", data: waterFC },
      countries: { type: "geojson", data: countryFC },
      cities: { type: "geojson", data: cityFC },
      airports: { type: "geojson", data: apFC },
      "v-cl": { type: "geojson", data: vf.cl, cluster: true, clusterRadius: 34, clusterMaxZoom: 9 },
      "v-solo": { type: "geojson", data: vf.solo },
      "v-names": { type: "geojson", data: vf.names },
      "v-hl": fc([]),
    },
    layers: layers(),
  };
}

/* ---------- map ---------- */
function padding() {
  if (isPhone()) return { top: 20, bottom: 110, left: 16, right: 16 };
  const shown = panelShown();
  return { top: 30, bottom: 30, left: shown ? panel.offsetWidth + 50 : 30, right: document.getElementById("drawer").classList.contains("open") ? document.getElementById("drawer").offsetWidth + 30 : 40 };
}
function panelShown() { return !isPhone() && panel && !panel.classList.contains("collapsed"); }
function fitMexico(animate) { if (map) map.fitBounds(MEX, { padding: padding(), duration: animate ? 700 : 0 }); }

function initMap() {
  readTheme();
  buildGeo();
  map = new maplibregl.Map({
    container: "map",
    style: style(),
    bounds: MEX,
    fitBoundsOptions: { padding: padding() },
    minZoom: 3.4,
    maxZoom: 13.5,
    maxBounds: [[-134, 2], [-68, 41]],
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    renderWorldCopies: false,
    attributionControl: false,
    fadeDuration: 120,
  });
  window.__map = map; // handy in the console
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  map.scrollZoom.setWheelZoomRate(1 / 300);
  map.on("styleimagemissing", (e) => {
    if (map.hasImage(e.id)) return;
    const ic = makeIcon(e.id);
    if (!ic) return;
    map.addImage(e.id, ic.image, { pixelRatio: PR });
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  map.addControl({
    onAdd() {
      const d = document.createElement("div");
      d.className = "maplibregl-ctrl maplibregl-ctrl-group fitctl";
      d.innerHTML = `<button type="button" title="Show all of Mexico" aria-label="Show all of Mexico">${ICON.fit}</button>`;
      d.querySelector("button").addEventListener("click", () => fitMexico(true));
      return d;
    },
    onRemove() {},
  }, "top-right");
  map.on("load", () => {
    ready = true;
    applyLayers();
    syncActive();
    prewarm();
    // opened straight from a link to one venue: fly there once the map exists
    if (app.activeKey && S.ui.tab === "map") focusVenue(app.activeKey);
  });
  wireMap();
}

function applyLayers() {
  if (!ready) return;
  const L = S.ui.layers;
  const vis = (id, on) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  vis("borders", L.lines);
  ["st-far", "st-mid", "st-near"].forEach((id) => vis(id, L.names));
  ["city-1", "city-2", "city-3"].forEach((id) => vis(id, L.cities));
  vis("airports", L.airports);
  vis("vnames", L.vnames); vis("vnames-top", L.vnames);
}

function refreshData() {
  if (!ready) return;
  const vf = venueFeatures();
  map.getSource("v-cl").setData(vf.cl);
  map.getSource("v-solo").setData(vf.solo);
  map.getSource("v-names").setData(vf.names);
  if (hoverKey) setHover(hoverKey);
}

export function themeChangedImpl() {
  if (!map) return;
  readTheme();
  if (!ready) return;
  // fills and lines take new colours; icons switch to ids for the new theme and redraw on demand
  map.setPaintProperty("sea", "background-color", T.sea);
  map.setPaintProperty("nb-fill", "fill-color", T.neighbor);
  map.setPaintProperty("nb-line", "line-color", T.border);
  map.setPaintProperty("st-fill", "fill-color", ["case", ["==", ["get", "hv"], 1], T.landV, T.land]);
  map.setPaintProperty("borders", "line-color", T.border);
  map.setPaintProperty("coast", "line-color", T.coast);
  for (const l of layers()) if (l.type === "symbol" && l.layout && l.layout["icon-image"]) map.setLayoutProperty(l.id, "icon-image", l.layout["icon-image"]);
  syncActive();
  prewarm();
}

/* ---------- hover card ---------- */
function priceLine(r) {
  if (r.plan) { const over = r.high.usd > S.cfg.budget.ceiling; return `<div class="price-line${over ? " over" : ""}"><span class="lab">Est. all-in · wedding day${vbadge(r.v)}</span><span><b>${k(r.low.usd)}</b><small>${kMXN(r.low.mxn)} · ${r.low.n} guests</small></span><span><b>${k(r.high.usd)}</b><small>${kMXN(r.high.mxn)} · ${r.high.n} guests</small></span></div>`; }
  if (r.status === "wild") return `<div class="price-line"><span class="lab">Est. all-in</span><span class="na">Not priced yet. Ask for a quote.</span></div>`;
  return `<div class="price-line"><span class="lab">Ruled out</span><span class="na">${esc(r.why || "")}</span></div>`;
}
function chipsFor(v) {
  const out = [];
  if (v.end) out.push(`<span class="chip${lateOK(v) ? " ok" : v.end_h != null ? " no" : ""}">Party: ${esc(shortEnd(v))}</span>`);
  if (v.beds_txt) out.push(`<span class="chip">Sleeps: ${esc(shortBeds(v))}</span>`);
  if (v.taq_label) out.push(`<span class="chip${v.taq_label === "Yes" ? " ok" : v.taq_label === "House only" ? " no" : ""}">Taqueros: ${esc(v.taq_label)}</span>`);
  return out.join("");
}
function shortEnd(v) { const e = v.end || ""; if (/^none|no limit/i.test(e)) return "no limit"; const m = e.match(/\b(\d{1,2}:\d{2}|\d{1,2} ?a\.m\.)/i); return m ? m[1] : e.length > 22 ? e.slice(0, 20) + "…" : e; }
function shortBeds(v) { const b = String(v.beds_txt || ""); return b.length > 26 ? (b.match(/^[^;(]+/) || [b])[0].trim().slice(0, 26) : b; }
function cardHTML(r, pinned) {
  const v = r.v, s = STATUS[r.status];
  return `<div class="card-img">${illo(v, 300, 140)}${photoTag(v, 640)}<span class="illo-tag">${photoLabel(v)}</span></div>
  <div class="card-body">
    <div class="card-eyebrow eyebrow" style="--c:${s.color}"><span class="dot"></span>${r.status === "top" ? "Top 20 · #" + r.top : esc(s.long)}${S.venues[v.key] && S.venues[v.key].star ? " · ★ shortlist" : ""}</div>
    <h3 class="card-name">${esc(v.short)}</h3>
    <div class="card-place">${esc(v.place)}</div>
    ${v.description ? `<p class="card-desc">${esc(v.description)}</p>` : ""}
    ${priceLine(r)}
    <div class="chips">${chipsFor(v)}</div>
    <div class="card-actions"><button class="btn btn-primary sm" type="button" data-more="${esc(v.key)}">More info</button><a class="btn sm" href="${esc(gmapsURL(v))}" target="_blank" rel="noopener">Google Maps</a>${pinned ? `<button class="btn sm" type="button" data-close>Close</button>` : ""}</div>
  </div>`;
}
const cardEl = () => document.getElementById("card");
function placeCard() {
  const r = res(cardKey); if (!r || !map) return;
  const el = cardEl();
  const rect = map.getContainer().getBoundingClientRect();
  const pt = map.project(r.v._ll);
  const px = rect.left + pt.x, py = rect.top + pt.y;
  let L0 = rect.left + 12, R0 = rect.right - 12, T0 = rect.top + 12, B0 = rect.bottom - 12;
  if (panelShown()) L0 = panel.getBoundingClientRect().right + 12;
  const dw = document.getElementById("drawer");
  if (dw.classList.contains("open")) { if (isPhone()) B0 = dw.getBoundingClientRect().top - 8; else R0 = dw.getBoundingClientRect().left - 12; }
  if (isPhone() && !dw.classList.contains("open")) B0 = rect.bottom - 96;
  const w = el.offsetWidth, h = el.offsetHeight, gap = 18;
  let left = Math.max(L0, Math.min(px - w / 2, R0 - w));
  let top = py - h - gap;
  if (top < T0) top = py + gap;
  if (top + h > B0) top = Math.max(T0, B0 - h);
  el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}
function showCard(key, pinned) {
  const r = res(key); if (!r) return;
  const el = cardEl();
  if (cardKey !== key || cardPinned !== !!pinned) { cardKey = key; cardPinned = !!pinned; el.innerHTML = cardHTML(r, pinned); }
  el.classList.add("show"); el.setAttribute("aria-hidden", "false");
  placeCard();
}
function hideCard() { const el = cardEl(); el.classList.remove("show"); el.setAttribute("aria-hidden", "true"); cardKey = null; }

let tipEl = null;
function clusterTip(text, x, y) {
  if (!tipEl) { tipEl = document.createElement("div"); tipEl.className = "cl-tip"; document.body.appendChild(tipEl); }
  if (!text) { tipEl.hidden = true; return; }
  tipEl.hidden = false; tipEl.innerHTML = text;
  const w = tipEl.offsetWidth;
  tipEl.style.left = Math.round(x - w / 2) + "px";
  tipEl.style.top = Math.round(y - tipEl.offsetHeight - 22) + "px";
}

function setHover(key) {
  hoverKey = key;
  if (!ready) return;
  const r = key && res(key);
  const f = r ? [{ type: "Feature", geometry: { type: "Point", coordinates: r.v._ll }, properties: { key, status: r.status, top: r.top || 0, star: S.venues[key] && S.venues[key].star ? 1 : 0 } }] : [];
  map.getSource("v-hl").setData({ type: "FeatureCollection", features: f });
}

// where pins overlap, the one drawn on top (highest sort key) is the one under the cursor
const topFeature = (fs) => (fs && fs.length ? fs.reduce((a, b) => ((b.properties.pri || 0) > (a.properties.pri || 0) ? b : a)) : null);

function wireMap() {
  const PINS = ["pins", "solo"];
  map.on("mousemove", PINS, (e) => {
    const f = topFeature(e.features); if (!f) return;
    map.getCanvas().style.cursor = "pointer";
    const key = f.properties.key;
    if (hoverKey !== key) { if (hoverKey) hoverRow(hoverKey, false); setHover(key); hoverRow(key, true); }
  });
  map.on("mouseleave", PINS, () => { map.getCanvas().style.cursor = ""; if (hoverKey) hoverRow(hoverKey, false); setHover(null); });
  map.on("click", PINS, (e) => {
    const f = topFeature(e.features); if (!f) return;
    e.preventDefault();
    showCard(f.properties.key, true);
  });
  map.on("mousemove", "clusters", async (e) => {
    const f = e.features && e.features[0]; if (!f) return;
    map.getCanvas().style.cursor = "pointer";
    try {
      const leaves = await map.getSource("v-cl").getClusterLeaves(f.properties.cluster_id, 60, 0);
      const rs = leaves.map((l) => res(l.properties.key)).filter(Boolean).sort((a, b) => PRI[b.status] - PRI[a.status] || (a.rank || 999) - (b.rank || 999));
      const names = rs.slice(0, 5).map((r) => esc(r.v.short)).join("<br>");
      const more = rs.length > 5 ? `<br><small>and ${rs.length - 5} more</small>` : "";
      clusterTip(`<b>${rs.length} venues here</b>${names}${more}<br><small>Click to zoom in</small>`, e.originalEvent.clientX, e.originalEvent.clientY);
    } catch (err) { /* cluster gone mid-zoom */ }
  });
  map.on("mouseleave", "clusters", () => { map.getCanvas().style.cursor = ""; clusterTip(null); });
  map.on("click", "clusters", async (e) => {
    const f = e.features && e.features[0]; if (!f) return;
    e.preventDefault();
    clusterTip(null);
    try {
      const z = await map.getSource("v-cl").getClusterExpansionZoom(f.properties.cluster_id);
      map.easeTo({ center: f.geometry.coordinates, zoom: Math.min(z + 0.25, 13), duration: 550 });
    } catch (err) { /* ignore */ }
  });
  map.on("click", (e) => { if (!e.defaultPrevented) hideCard(); });
  map.on("move", () => { if (cardKey) placeCard(); });
  map.on("zoomstart", () => { if (cardKey && !cardPinned) hideCard(); clusterTip(null); });
  const card = cardEl();
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && cardKey) { hideCard(); e.stopImmediatePropagation(); } }, true);
  card.addEventListener("click", (e) => {
    const more = e.target.closest("[data-more]");
    if (more) { hideCard(); nav.openVenue(more.dataset.more, { tab: "map" }); return; }
    if (e.target.closest("[data-close]")) hideCard();
  });
  window.addEventListener("resize", debounce(() => { if (cardKey) placeCard(); }, 100));
}

function syncActive() {
  if (!map) return;
  const key = app.activeKey;
  if (!key) { if (activeMk) { activeMk.remove(); activeMk = null; } return; }
  const r = res(key); if (!r) return;
  if (!activeMk) {
    const d = document.createElement("div");
    d.className = "active-mk"; d.innerHTML = "<i></i>";
    activeMk = new maplibregl.Marker({ element: d, anchor: "center" });
  }
  activeMk.getElement().style.setProperty("--c", STATUS[r.status].color);
  activeMk.setLngLat(r.v._ll).addTo(map);
}

function focusVenue(key) {
  const r = res(key); if (!r || !map) return;
  const z = Math.max(map.getZoom(), 8);
  const dw = document.getElementById("drawer");
  let offset;
  if (isPhone()) offset = [0, -Math.round(dw.offsetHeight / 2) + 40];
  else offset = [Math.round(((panelShown() ? panel.offsetWidth + 16 : 0) - (dw.offsetWidth || 0)) / 2), 0];
  map.flyTo({ center: r.v._ll, zoom: z, offset, duration: 700, essential: true });
}

/* ---------- panel ---------- */
const QUICK = [["u20", "Under target"], ["late", "Party 2 a.m.+"], ["beds", "Sleeps 40+"], ["taq", "Own taqueros"], ["ver", "Verified price"]];
function panelHTML() {
  const f = S.ui.filters;
  return `<header class="mp-head" id="mpHead"><span class="grab" aria-hidden="true"></span>
      <div class="grow"><span class="eyebrow">Live map · ${S.cfg.guests.plan} guests</span><h2>Mexico Venue Map</h2></div>
      <button class="icon-btn sm p-hide" id="mpHide" type="button" aria-label="Hide the list">${ICON.left}</button></header>
    <div class="mp-controls">
      <label class="search">${ICON.search}<input class="inp" id="mpQ" type="search" placeholder="Search venue, town or state" autocomplete="off" value="${esc(f.q)}"></label>
      <div class="chips" id="mpQuick" role="group" aria-label="Quick filters">${QUICK.map(([id, l]) => `<button class="fchip" type="button" data-f="${id}" aria-pressed="${f.quick.includes(id)}">${l}</button>`).join("")}<button class="fchip" type="button" data-f="star" aria-pressed="${!!f.star}">${ICON.star} Shortlist</button></div>
      <div class="mp-meta"><span id="mpCount" aria-live="polite"></span><label>Sort <select class="sel" id="mpSort">
        ${[["rank", "Best fit"], ["price", "Lowest price"], ["name", "Name"], ["region", "Region"], ["beds", "Most beds"]].map(([v, l]) => `<option value="${v}" ${f.sort === v ? "selected" : ""}>${l}</option>`).join("")}
      </select></label></div>
    </div>
    <div class="mplist" id="mpList"></div>
    <div class="mp-foot"><details id="mpLayers" ${isPhone() ? "" : "open"}><summary>Map layers &amp; legend ${ICON.up}</summary>
      <div class="layers">
        <div class="lgrid" role="group" aria-label="Map layers">
          ${[["lines", "State lines"], ["names", "State names"], ["cities", "Cities"], ["airports", "Airports"], ["vnames", "Venue names"]].map(([id, l]) => `<label class="tg"><input type="checkbox" data-layer="${id}" ${S.ui.layers[id] ? "checked" : ""}> ${l}</label>`).join("")}
        </div>
        <div class="lgrid" id="mpLegend" role="group" aria-label="Show venue types"></div>
        <p class="mnote">Prices are live: the all-in estimate for a Saturday wedding day with your vision and guest count, at <span data-out="mapfx">MXN ${(+S.cfg.fx).toFixed(2)}</span> = US$1. Pins sit at each venue's town unless the details say otherwise; a lime ring marks your shortlist.</p>
      </div></details></div>`;
}
function legendHTML() {
  const counts = {};
  for (const r of app.ev.results.values()) counts[r.status] = (counts[r.status] || 0) + 1;
  const show = S.ui.filters.show;
  return `<div class="ltitle">Show venues</div>` + ["top", "fit", "wild", "over", "out"].map((s) => `<label class="tg"><input type="checkbox" data-show="${s}" ${show[s] ? "checked" : ""}><span class="pin pin--${s}">${s === "top" ? "1" : ""}</span>${esc(STATUS[s].label)} <span class="n">${counts[s] || 0}</span></label>`).join("");
}
function rowHTML(r) {
  const v = r.v;
  const pr = r.plan ? `<span class="pr${r.high.usd > S.cfg.budget.ceiling ? " over" : ""}">${k(r.plan.usd)}${vbadge(r.v)}<small>${kMXN(r.plan.mxn)}</small></span>` : `<span class="pr na">${r.status === "wild" ? "Quote" : "—"}</span>`;
  const th = photosOf(v).length ? `<img src="${esc(photoSrc(v.photos[0], 320))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : "";
  return `<button class="row${app.activeKey === v.key ? " is-active" : ""}" type="button" data-key="${esc(v.key)}"><span class="mk">${pinHTML(r)}</span><span class="th">${th}</span><span class="nm"><b>${esc(v.short)}</b><small>${esc(v.place)}</small></span>${pr}</button>`;
}
function renderList() {
  if (!listEl) return;
  const sort = S.ui.filters.sort;
  let html = "", last = null;
  const list = app.list.filter((r) => !r.norte); // the Saltillo tab has its own map
  if (!list.length) html = `<div class="empty" style="margin:10px">No venues match. Clear a filter or the search.</div>`;
  for (const r of list) {
    const g = sort === "region" ? r.v.groupLabel : sort === "rank" ? (S.ui.filters.star ? "Shortlist" : STATUS[r.status].long) : null;
    if (g && g !== last) { html += `<div class="grp">${esc(g)}</div>`; last = g; }
    html += rowHTML(r);
  }
  listEl.innerHTML = html;
  document.getElementById("mpCount").textContent = `${list.length} of ${app.venues.length} venues`;
  document.getElementById("mpLegend").innerHTML = legendHTML();
  root.querySelector(".mp-head .eyebrow").textContent = `Live map · ${S.cfg.guests.plan} guests`;
  const fxEl = root.querySelector('[data-out="mapfx"]');
  if (fxEl) fxEl.textContent = `MXN ${(+S.cfg.fx).toFixed(2)}`;
}
function hoverRow(key, on) { if (!listEl) return; const r = listEl.querySelector(`[data-key="${CSS.escape(key)}"]`); if (r) r.classList.toggle("hov", on); }
function markRow(key) {
  if (!listEl) return;
  listEl.querySelectorAll(".row.is-active").forEach((r) => r.classList.remove("is-active"));
  if (!key) return;
  const r = listEl.querySelector(`[data-key="${CSS.escape(key)}"]`);
  if (!r) return;
  r.classList.add("is-active");
  const top = r.offsetTop, bot = top + r.offsetHeight;
  if (top < listEl.scrollTop) listEl.scrollTop = top - 8;
  else if (bot > listEl.scrollTop + listEl.clientHeight) listEl.scrollTop = bot - listEl.clientHeight + 8;
}

function wirePanel() {
  const f = S.ui.filters;
  const q = document.getElementById("mpQ");
  q.addEventListener("input", debounce(() => { f.q = q.value.trim(); commit("filters"); }, 120));
  q.addEventListener("focus", () => { if (isPhone()) panel.classList.add("expanded"); });
  document.getElementById("mpQuick").addEventListener("click", (e) => {
    const b = e.target.closest(".fchip"); if (!b) return;
    const id = b.dataset.f;
    if (id === "star") f.star = !f.star;
    else if (f.quick.includes(id)) f.quick = f.quick.filter((x) => x !== id); else f.quick = [...f.quick, id];
    b.setAttribute("aria-pressed", String(id === "star" ? f.star : f.quick.includes(id)));
    commit("filters");
  });
  document.getElementById("mpSort").addEventListener("change", (e) => { f.sort = e.target.value; commit("filters"); });
  listEl.addEventListener("click", (e) => { const r = e.target.closest(".row"); if (r) nav.openVenue(r.dataset.key, { tab: "map" }); });
  listEl.addEventListener("mouseover", (e) => { const r = e.target.closest(".row"); if (r && canHover()) setHover(r.dataset.key); });
  listEl.addEventListener("mouseleave", () => setHover(null));
  root.querySelector(".layers").addEventListener("change", (e) => {
    const l = e.target.closest("[data-layer]");
    if (l) { S.ui.layers[l.dataset.layer] = l.checked; applyLayers(); if (l.dataset.layer === "vnames" && l.checked) prewarm(); commit("ui"); return; }
    const s = e.target.closest("[data-show]");
    if (s) { f.show[s.dataset.show] = s.checked; commit("filters"); }
  });
  document.getElementById("mpHide").addEventListener("click", () => { panel.classList.add("collapsed"); root.classList.add("panel-hidden"); S.ui.panel = "hidden"; commit("ui"); });
  const sp = document.getElementById("showPanel");
  sp.innerHTML = `${ICON.list} Venues`;
  sp.addEventListener("click", () => { panel.classList.remove("collapsed"); root.classList.remove("panel-hidden"); S.ui.panel = "shown"; commit("ui"); });
  document.getElementById("mpHead").addEventListener("click", (e) => { if (isPhone() && !e.target.closest("button")) panel.classList.toggle("expanded"); });
}

/* ---------- view ---------- */
export const mapView = {
  async render(el) {
    root = el;
    panel = document.getElementById("mapPanel");
    panel.innerHTML = panelHTML();
    listEl = document.getElementById("mpList");
    if (S.ui.panel === "hidden" && !isPhone()) { panel.classList.add("collapsed"); root.classList.add("panel-hidden"); }
    renderList();
    wirePanel();
    try {
      await libs();
      initMap();
    } catch (err) {
      document.getElementById("map").innerHTML = `<div class="wrap"><div class="empty"><b>The map couldn't load.</b>${esc(err.message)}. Check the connection and reload.</div></div>`;
    }
  },
  update(reason) {
    if (!root) return;
    if (reason === "note" || reason === "ui") return;
    renderList();
    refreshData();
    syncActive();
    if (cardKey) { const r = res(cardKey); if (r) { cardEl().innerHTML = cardHTML(r, cardPinned); placeCard(); } }
  },
  onShow() {
    if (map) { map.resize(); }
  },
  onActive(key, opts) {
    markRow(key);
    if (!map) return;
    refreshData();
    syncActive();
    if (key && opts.fly && S.ui.tab === "map") { hideCard(); setTimeout(() => focusVenue(key), 30); }
  },
  themeChanged() { themeChangedImpl(); },
};
