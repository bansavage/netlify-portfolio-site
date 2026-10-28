// The Saltillo tab's own map: the same MapLibre setup as the main map, framed on Saltillo,
// Monterrey and the sierra between them, showing only this tab's venues in this tab's
// ranking. Pins are drawn to canvas like the main map's, so they use the wedding's type
// and switch with the theme.

import { S } from "../store.js";
import { app, nav, STATUS } from "../app.js";
import { esc, k, kMXN, vbadge, ICON, driveTxt } from "../util.js";
import { libs } from "./map.js";

const REGION = [[-102.35, 24.75], [-99.55, 26.05]]; // Parras to Montemorelos, Galeana to García
const PR = Math.max(2, Math.min(3, Math.ceil(window.devicePixelRatio || 1)));
const PIN = { top: 26, fit: 15, over: 15, wild: 15, out: 11 };
const PRI = { out: 0, over: 1, wild: 2, fit: 3, top: 4 };

let map = null, ready = false, box = null, tip = null, theme = "light", T = {}, statesFC = null, bordersGeo = null;
const canHover = () => matchMedia("(hover: hover) and (pointer: fine)").matches;

function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  const g = (n) => cs.getPropertyValue(n).trim();
  theme = document.documentElement.dataset.theme || "light";
  T = { land: g("--land"), landV: g("--land-venues"), neighbor: g("--neighbor"), border: g("--border"), ink: g("--ink"), ink2: g("--ink-2"), surface: g("--surface"),
    top: g("--top"), fit: g("--fit"), wild: g("--wild"), over: g("--over"), out: g("--out"), star: g("--star") };
}

function cv(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.ceil(w * PR); c.height = Math.ceil(h * PR);
  const g = c.getContext("2d"); g.scale(PR, PR);
  return [c, g];
}
const img = (c, g) => g.getImageData(0, 0, c.width, c.height);
function circle(g, x, y, r, fill) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); }
function diamond(g, x, y, r, fill) { g.save(); g.translate(x, y); g.rotate(Math.PI / 4); const s = r * 1.42; g.beginPath(); if (g.roundRect) g.roundRect(-s / 2, -s / 2, s, s, 2.5); else g.rect(-s / 2, -s / 2, s, s); g.fillStyle = fill; g.fill(); g.restore(); }
function pinIcon(status, top, star) {
  const s = PIN[status] || 15, ring = star ? 3.5 : 0, pad = 5, W = s + 4 + ring * 2 + pad * 2;
  const [c, g] = cv(W, W), x = W / 2, col = T[status] || T.fit;
  const shape = status === "wild" ? diamond : circle;
  if (star) shape(g, x, x, s / 2 + 2 + ring, T.star);
  g.shadowColor = "rgba(0,0,0,.35)"; g.shadowBlur = 3; g.shadowOffsetY = 1;
  shape(g, x, x, s / 2 + (status === "out" ? 1.5 : 2), T.surface);
  g.shadowColor = "transparent";
  shape(g, x, x, s / 2, col);
  if (status === "top" && top) { g.fillStyle = "#fff"; g.font = '600 11.5px "GT Standard"'; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(top), x, x + 0.5); }
  return img(c, g);
}
function cityIcon(tier, name) {
  const font = tier === 1 ? '600 13px "GT Standard"' : '500 11.5px "GT Standard"';
  const [m, g0] = cv(1, 1); g0.font = font; const tw = Math.ceil(g0.measureText(name).width); m.width = 0;
  const r = tier === 1 ? 4.5 : 3, hw = 3, H = 22, W = r * 2 + 6 + tw + hw * 2 + 4;
  const [c, g] = cv(W, H), cx = hw + r + 1;
  g.beginPath(); g.arc(cx, H / 2, r, 0, Math.PI * 2); g.fillStyle = tier === 1 ? T.ink2 : T.surface; g.fill(); g.lineWidth = 1.5; g.strokeStyle = tier === 1 ? T.surface : T.ink2; g.stroke();
  g.font = font; g.textBaseline = "middle";
  g.strokeStyle = T.land; g.lineWidth = hw; g.lineJoin = "round"; g.strokeText(name, cx + r + 5, H / 2);
  g.fillStyle = tier === 1 ? T.ink : T.ink2; g.fillText(name, cx + r + 5, H / 2);
  return img(c, g);
}
function makeIcon(id) {
  const p = id.split("|");
  if (p[0] === "npin") return pinIcon(p[1], +p[2], p[3] === "1");
  if (p[0] === "ncity") return cityIcon(+p[1], p[2]);
  return null;
}
const iconExpr = (parts) => ["concat", ...parts.flatMap((x, i) => (i ? ["|", x] : [x])), "|", theme];

// venues placed at the same town point sit on top of each other: fan them out a little
function placed(list) {
  const groups = new Map();
  for (const r of list) {
    const v = r.v; if (v.lat == null) continue;
    const key = v.lat.toFixed(3) + "," + v.lng.toFixed(3);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const out = [];
  for (const g of groups.values()) g.forEach((r, i) => {
    const v = r.v;
    if (g.length === 1) { out.push([r, [v.lng, v.lat]]); return; }
    const a = (i / g.length) * Math.PI * 2, rad = 0.006 * Math.sqrt(g.length);
    out.push([r, [v.lng + (Math.cos(a) * rad) / Math.cos((v.lat * Math.PI) / 180), v.lat + Math.sin(a) * rad]]);
  });
  return out;
}
function venueFC() {
  return { type: "FeatureCollection", features: placed(app.nlist).map(([r, ll]) => {
    const star = S.venues[r.v.key] && S.venues[r.v.key].star ? 1 : 0;
    return { type: "Feature", geometry: { type: "Point", coordinates: ll },
      properties: { key: r.v.key, status: r.status, top: r.top || 0, star, pri: r.status === "top" ? 100 - r.top : PRI[r.status] + star * 10 } };
  }) };
}
function cityFC() {
  const pt = (c) => ({ type: "Feature", geometry: { type: "Point", coordinates: [c.lng, c.lat] }, properties: { name: c.name, tier: c.tier, pop: c.pop || 0 } });
  return { type: "FeatureCollection", features: app.geo.cities.filter((c) => c.lng > -104 && c.lng < -98 && c.lat > 23.5 && c.lat < 27.5).map(pt) };
}

const cityLayer = (id, filter, overlap) => ({ id, type: "symbol", source: "cities", filter,
  layout: { "icon-image": iconExpr(["ncity", ["to-string", ["get", "tier"]], ["get", "name"]]), "icon-anchor": "bottom-left", "icon-offset": [-9, -10], "icon-allow-overlap": overlap, "icon-padding": 2, "symbol-sort-key": ["-", 0, ["get", "pop"]] } });

function style() {
  const pinImg = iconExpr(["npin", ["get", "status"], ["to-string", ["get", "top"]], ["to-string", ["get", "star"]]]);
  return {
    version: 8,
    sources: {
      neighbors: { type: "geojson", data: app.geo.neighbors },
      states: { type: "geojson", data: statesFC },
      borders: { type: "geojson", data: bordersGeo },
      cities: { type: "geojson", data: cityFC() },
      venues: { type: "geojson", data: venueFC() },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": T.land } },
      { id: "nb-fill", type: "fill", source: "neighbors", paint: { "fill-color": T.neighbor } },
      { id: "st-fill", type: "fill", source: "states", paint: { "fill-color": ["case", ["in", ["get", "name"], ["literal", ["Coahuila", "Nuevo León"]]], T.landV, T.land] } },
      { id: "borders", type: "line", source: "borders", layout: { "line-join": "round" }, paint: { "line-color": T.border, "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1, 11, 1.8], "line-dasharray": [3, 2.5] } },
      { id: "pins", type: "symbol", source: "venues", layout: { "icon-image": pinImg, "icon-allow-overlap": true, "icon-ignore-placement": true, "symbol-sort-key": ["get", "pri"] } },
      // town names sit above the pins and lift off them, so a cluster never hides "Saltillo"
      cityLayer("cities-small", ["!=", ["get", "tier"], 1], false),
      cityLayer("cities-big", ["==", ["get", "tier"], 1], true),
    ],
  };
}

function tipHTML(r) {
  const v = r.v, s = STATUS[r.status];
  const price = r.plan ? `<b>${k(r.plan.usd)}${vbadge(v)}</b> <small>${kMXN(r.plan.mxn)} · ${r.plan.n} guests</small>` : `<small>${r.status === "out" ? esc(r.why || "Ruled out") : "Not priced yet"}</small>`;
  const bits = [v.end ? `Ends ${esc(v.end)}` : "", v.taq_label ? `Taqueros: ${esc(v.taq_label)}` : "", r.drive != null ? `${esc(driveTxt(r.drive))} from Saltillo` : ""].filter(Boolean).join(" · ");
  return `<div class="nm-tip-eb" style="--c:${s.color}"><span class="dot"></span>${r.status === "top" ? "Saltillo top 10 · #" + r.top : esc(s.label)}</div>
    <b class="nm-tip-name">${esc(v.short)}</b><small class="nm-tip-place">${esc(v.place || v.town || "")}</small>
    <div class="nm-tip-price">${price}</div>${bits ? `<small class="nm-tip-bits">${bits}</small>` : ""}`;
}
function showTip(key, pt) {
  const r = app.nev && app.nev.results.get(key);
  if (!r || !tip) return;
  tip.innerHTML = tipHTML(r);
  tip.hidden = false;
  const W = box.clientWidth, w = tip.offsetWidth, h = tip.offsetHeight;
  let x = pt.x + 14, y = pt.y - h - 10;
  if (x + w > W - 8) x = pt.x - w - 14;
  if (y < 8) y = pt.y + 14;
  tip.style.transform = `translate(${Math.max(8, x)}px, ${y}px)`;
}
const hideTip = () => { if (tip) tip.hidden = true; };

function fitAll(animate) {
  if (!map) return;
  const pts = placed(app.nlist).map(([, ll]) => ll);
  if (!pts.length) { map.fitBounds(REGION, { padding: 30, duration: animate ? 600 : 0 }); return; }
  const b = pts.reduce((acc, [x, y]) => [[Math.min(acc[0][0], x), Math.min(acc[0][1], y)], [Math.max(acc[1][0], x), Math.max(acc[1][1], y)]], [[180, 90], [-180, -90]]);
  map.fitBounds(b, { padding: { top: 40, bottom: 40, left: 40, right: 60 }, maxZoom: 11, duration: animate ? 600 : 0 });
}

function init() {
  readTheme();
  const topo = app.geo.topo, obj = topo.objects[Object.keys(topo.objects)[0]];
  statesFC = topojson.feature(topo, obj);
  bordersGeo = topojson.mesh(topo, obj, (a, b) => a !== b);
  map = new maplibregl.Map({
    container: box.querySelector(".nm-canvas"), style: style(), bounds: REGION, fitBoundsOptions: { padding: 30 },
    minZoom: 5.5, maxZoom: 14, maxBounds: [[-106, 21.5], [-96, 29.5]], dragRotate: false, pitchWithRotate: false, touchPitch: false,
    renderWorldCopies: false, attributionControl: false, fadeDuration: 120, cooperativeGestures: false,
  });
  window.__nmap = map; // handy in the console
  map.on("error", (e) => console.warn("saltillo map:", e && e.error && e.error.message));
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  map.scrollZoom.setWheelZoomRate(1 / 300);
  map.on("styleimagemissing", (e) => { if (map.hasImage(e.id)) return; const im = makeIcon(e.id); if (im) map.addImage(e.id, im, { pixelRatio: PR }); });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  map.addControl({
    onAdd() {
      const d = document.createElement("div");
      d.className = "maplibregl-ctrl maplibregl-ctrl-group fitctl";
      d.innerHTML = `<button type="button" title="Show every venue" aria-label="Show every venue">${ICON.fit}</button>`;
      d.querySelector("button").addEventListener("click", () => fitAll(true));
      return d;
    },
    onRemove() {},
  }, "top-right");
  map.on("load", () => { ready = true; fitAll(false); });
  map.on("mouseenter", "pins", () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", "pins", () => { map.getCanvas().style.cursor = ""; hideTip(); });
  map.on("mousemove", "pins", (e) => { if (canHover() && e.features.length) showTip(e.features[0].properties.key, e.point); });
  map.on("movestart", hideTip);
  map.on("click", "pins", (e) => { if (!e.features.length) return; hideTip(); nav.openVenue(e.features[0].properties.key, { tab: "norte" }); });
}

export const norteMap = {
  async mount(el) {
    box = el;
    box.innerHTML = `<div class="nm-canvas"></div><div class="nm-tip" hidden></div>
      <div class="nm-legend">${["top", "fit", "wild", "over", "out"].map((s) => `<span style="--c:${STATUS[s].color}"><i class="${s === "wild" ? "dia" : ""}"></i>${s === "top" ? "Top 10" : esc(STATUS[s].label)}</span>`).join("")}</div>
      <div class="map-attr">Boundaries: Natural Earth · Towns: GeoNames</div>`;
    tip = box.querySelector(".nm-tip");
    try { await libs(); init(); }
    catch (err) { box.querySelector(".nm-canvas").innerHTML = `<div class="empty"><b>The map couldn't load.</b>${esc(err.message)}. Check the connection and reload.</div>`; }
  },
  refresh() {
    if (!ready) return;
    map.getSource("venues").setData(venueFC());
  },
  resize() { if (map) { map.resize(); } },
  fit() { fitAll(true); },
  themeChanged() {
    if (!map) return;
    readTheme();
    if (!ready) return;
    map.setPaintProperty("bg", "background-color", T.land);
    map.setPaintProperty("nb-fill", "fill-color", T.neighbor);
    map.setPaintProperty("st-fill", "fill-color", ["case", ["in", ["get", "name"], ["literal", ["Coahuila", "Nuevo León"]]], T.landV, T.land]);
    map.setPaintProperty("borders", "line-color", T.border);
    for (const l of style().layers) if (l.type === "symbol") map.setLayoutProperty(l.id, "icon-image", l.layout["icon-image"]);
  },
  get mounted() { return !!box; },
};
