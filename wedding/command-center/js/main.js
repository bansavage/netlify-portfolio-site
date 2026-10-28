// Boot: load the data, wire the header, tabs and hash routes, and keep every view in
// step with the store.

import { S, commit, subscribe, exportState, importState, wipeAll, venueState } from "./store.js";
import { app, recompute, filterList, norteList, nav } from "./app.js";
import { ICON, esc, norm, toast } from "./util.js";
import { overview } from "./views/overview.js";
import { brief } from "./views/brief.js";
import { venues } from "./views/venues.js";
import { mapView } from "./views/map.js";
import { vendors } from "./views/vendors.js";
import { budget } from "./views/budget.js";
import { norte } from "./views/norte.js";
import { drawer } from "./drawer.js";
import { effectiveFx, fetchLiveFx, liveIsStale } from "./fx.js";

const TABS = [
  ["overview", "Overview", overview],
  ["brief", "Brief", brief],
  ["venues", "Venues", venues],
  ["map", "Map", mapView],
  ["norte", "Saltillo", norte],
  ["vendors", "Vendors", vendors],
  ["budget", "Budget", budget],
];
const VIEWS = Object.fromEntries(TABS.map(([id, , v]) => [id, v]));
app.views = VIEWS;
const rendered = new Set();
const dirty = new Set();
let current = null;

async function loadJSON(path) {
  const r = await fetch(path, { cache: "no-cache" });
  if (!r.ok) { if (r.body) r.body.cancel(); throw new Error(`${path}: ${r.status}`); }
  return r.json();
}

function headerTabs() {
  const tabs = document.getElementById("tabs");
  const bottom = document.getElementById("bottombar");
  tabs.innerHTML = TABS.map(([id, label]) => `<button class="tab" type="button" role="tab" data-tab="${id}" aria-selected="false" aria-controls="view-${id}">${ICON[id]}<span>${label}</span></button>`).join("");
  bottom.innerHTML = TABS.map(([id, label]) => `<button type="button" role="tab" data-tab="${id}" aria-selected="false">${ICON[id]}${label}</button>`).join("");
  const onTab = (e) => { const b = e.target.closest("[data-tab]"); if (b) go(b.dataset.tab); };
  tabs.addEventListener("click", onTab);
  bottom.addEventListener("click", onTab);
}

function show(tab) {
  if (!VIEWS[tab]) tab = "overview";
  if (current === tab && rendered.has(tab)) return;
  current = tab;
  S.ui.tab = tab;
  document.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
  document.querySelectorAll(".view").forEach((el) => el.classList.toggle("active", el.dataset.view === tab));
  const v = VIEWS[tab];
  const el = document.getElementById("view-" + tab);
  if (!rendered.has(tab)) { v.render(el); rendered.add(tab); dirty.delete(tab); }
  else if (dirty.has(tab)) { v.update("cfg"); dirty.delete(tab); }
  if (v.onShow) v.onShow();
  document.body.dataset.tab = tab;
  document.getElementById("gNum").textContent = (tab === "norte" ? S.cfg.norte.guests : S.cfg.guests).plan;
}

function parseHash() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
  const [tab, key] = h.split("/");
  return { tab: tab || S.ui.tab || "overview", key: key || null };
}

function route() {
  const { tab, key } = parseHash();
  show(tab);
  if (key && app.byKey.has(key)) drawer.open(key, { fly: tab === "map", fromRoute: true });
  else if (!key && drawer.isOpen()) drawer.close({ fromRoute: true });
}

export function go(tab, key) {
  const want = "#/" + tab + (key ? "/" + encodeURIComponent(key) : "");
  if (location.hash === want) { route(); return; }
  location.hash = want;
}

function guestsCtl() {
  const num = document.getElementById("gNum");
  // on the Saltillo tab the header steps that tab's own guest count
  const g = () => (S.ui.tab === "norte" ? S.cfg.norte.guests : S.cfg.guests);
  const sync = () => { num.textContent = g().plan; };
  const step = (d) => {
    g().plan = Math.max(10, Math.min(600, g().plan + d));
    sync();
    commit("cfg");
  };
  document.getElementById("gMinus").innerHTML = ICON.minus;
  document.getElementById("gPlus").innerHTML = ICON.plus;
  document.getElementById("gMinus").addEventListener("click", () => step(-1));
  document.getElementById("gPlus").addEventListener("click", () => step(1));
  subscribe(sync);
  sync();
}

function resolvedTheme() {
  const t = S.ui.theme || "auto";
  return t === "auto" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : t;
}
function applyTheme() {
  const t = resolvedTheme();
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]').setAttribute("content", t === "dark" ? "#13160F" : "#F6F1E4");
  document.getElementById("themeBtn").innerHTML = t === "dark" ? ICON.sun : ICON.moon;
  const mt = document.querySelector('#menu [data-act="theme"]');
  if (mt) mt.innerHTML = `${t === "dark" ? ICON.sun : ICON.moon} ${t === "dark" ? "Paper (light)" : "Candlelight (dark)"}`;
  if (VIEWS.map.themeChanged) VIEWS.map.themeChanged();
}
function toggleTheme() {
  S.ui.theme = resolvedTheme() === "dark" ? "light" : "dark";
  applyTheme();
  commit("ui");
}

function menu() {
  const btn = document.getElementById("menuBtn");
  const m = document.getElementById("menu");
  btn.innerHTML = ICON.menu;
  m.querySelector('[data-act="export"]').innerHTML = `${ICON.download} Export everything (.json)`;
  const lab = m.querySelector("label");
  lab.insertAdjacentHTML("afterbegin", `${ICON.upload} Import a saved file`);
  m.querySelector('[data-act="wipe"]').innerHTML = `${ICON.trash} Erase my changes on this device`;
  m.querySelector('[data-act="hub"]').innerHTML = `${ICON.left} All wedding pages`;
  const close = () => { m.hidden = true; btn.setAttribute("aria-expanded", "false"); };
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    m.hidden = !m.hidden;
    btn.setAttribute("aria-expanded", String(!m.hidden));
    const saved = S.saved ? new Date(S.saved) : null;
    document.getElementById("savedNote").textContent = `Changes save in this browser only${saved ? " (last saved " + saved.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + ")" : ""}. Export to move them to another device or send them to Daina.`;
  });
  document.addEventListener("click", (e) => { if (!m.hidden && !m.contains(e.target) && e.target !== btn) close(); });
  m.addEventListener("click", (e) => {
    const a = e.target.closest("[data-act]");
    if (!a) return;
    if (a.dataset.act === "export") { exportState(); toast("Exported. Keep the file somewhere safe."); }
    if (a.dataset.act === "theme") toggleTheme();
    if (a.dataset.act === "hub") location.href = "../";
    if (a.dataset.act === "wipe" && confirm("Erase every change saved on this device (brief, vision, stars, notes, quotes, your vendors)? Export first if you want a copy.")) wipeAll();
    close();
  });
  document.getElementById("importFile").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try { importState(await f.text()); toast("Imported."); } catch (err) { alert(err.message || "Couldn't read that file."); }
    e.target.value = "";
    close();
  });
  document.getElementById("themeBtn").addEventListener("click", toggleTheme);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if ((S.ui.theme || "auto") === "auto") applyTheme(); });
}

function brandLine() {
  const d = new Date(S.cfg.date + "T12:00:00");
  const ds = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  document.getElementById("brandEyebrow").textContent = `${S.cfg.couple} · ${ds}`;
}

async function boot() {
  headerTabs();
  menu();
  applyTheme();
  const [atlas, geo, vend, photos, links, inbox, added, beds, norteData] = await Promise.all([
    loadJSON("data/atlas.json"),
    loadJSON("data/geo.json"),
    loadJSON("data/vendors.json").catch(() => ({ vendors: [], benchmarks: [] })),
    loadJSON("data/photos.json").catch(() => ({})),
    loadJSON("data/links.json").catch(() => ({})),
    loadJSON("data/inbox.json").catch(() => ({})),
    loadJSON("data/added.json").catch(() => ({ venues: [] })),
    loadJSON("data/beds.json").catch(() => ({ beds: {} })),
    loadJSON("data/norte.json").catch(() => ({ venues: [], atlas: [] })),
  ]);
  app.meta = atlas.meta;
  // venues suggested after the atlas was built ride along with it
  app.venues = [...atlas.venues, ...(added.venues || []).filter((x) => !atlas.venues.some((v) => v.key === x.key))];
  // the Saltillo tab's own venues open in the drawer too, but stay out of the destination ranking
  const norteOnly = (norteData.venues || []).filter((x) => !app.venues.some((v) => v.key === x.key));
  for (const v of norteOnly) v.norteOnly = true;
  for (const v of [...app.venues, ...norteOnly]) {
    v._hay = norm([v.name, v.short, v.place, v.state, v.town, v.groupLabel].join(" "));
    const ph = photos[v.key];
    if (ph && ph.photos && ph.photos.length) { v.photos = ph.photos; v.photo_src = ph.src; }
    // web links found later for venues the atlas only knew from an emailed quote or a PDF
    const ln = links[v.key];
    if (ln && ln.length) { v.src = [...new Set([...ln, ...(v.src || [])])]; if (!v.photos_url) v.photos_url = ln[0]; }
    // what the venues told us by email, found after the atlas was built
    const ib = inbox[v.key];
    if (ib) {
      v.inbox = ib;
      if (ib.status && !v.rows) { v.status = ib.status; v.reason = ib.reason || ib.quote; }
      // their own figures already priced it in the atlas
      if (ib.verified) v.verified = true;
      // a venue's own quote replaces the listing-based lines the atlas priced it with
      if (ib.rows) { v.rows = ib.rows; v.conf = "quote"; v.verified = true; if (ib.catch) v.catch = ib.catch; }
      // what they told us can override the listing's end time, or fail the brief outright
      if (ib.end) { v.end = ib.end; v.end_h = ib.end_h; v.end_src = "written"; }
      if (ib.taq_label) { v.taq_label = ib.taq_label; v.taq_txt = ib.taq_txt || v.taq_txt; }
      if (ib.ruleOut) { v.status = "out"; v.reason = ib.ruleOut; }
      // start the stage where the emails left it, once; after that it's the couple's to change
      const st = S.venues[v.key];
      if (ib.stage && !(st && st.inboxSeeded)) {
        const vs = venueState(v.key);
        if (vs.stage === "none") vs.stage = ib.stage;
        vs.inboxSeeded = true;
      }
    }
    // the atlas capped beds at its old 65-guest plan; fuller capacities keep the beds score honest
    const bd = (beds.beds || {})[v.key];
    if (bd) v.beds = bd[0];
    app.byKey.set(v.key, v);
  }
  // the Saltillo track can carry its own verdict on an atlas venue (it can move to September or
  // October, so a winter-only closure doesn't rule a venue out there, but its own terms might)
  const over = norteData.override || {};
  app.norte = [...norteOnly, ...(norteData.atlas || []).map((k) => app.byKey.get(k)).filter(Boolean).map((v) => (over[v.key] ? { ...v, ...over[v.key] } : v))];
  app.geo = geo;
  app.vendors = vend.vendors || [];
  app.benchmarks = vend.benchmarks || [];
  S.cfg.fx = effectiveFx(S.cfg);
  recompute();

  nav.go = go;
  nav.openVenue = (key, opts = {}) => {
    const tab = opts.tab || current || "venues";
    go(tab, key);
  };
  nav.closeVenue = () => go(current);
  nav.showOnMap = (key) => go("map", key);
  nav.refreshFx = refreshFx;

  guestsCtl();
  brandLine();
  drawer.init();

  subscribe((reason) => {
    if (reason === "cfg" || reason === "venue") recompute();
    else if (reason === "filters") { app.list = filterList(); app.nlist = norteList(); }
    if (reason === "cfg") brandLine();
    for (const [id, v] of Object.entries(VIEWS)) {
      if (!rendered.has(id)) continue;
      if (id === current || id === "map") v.update(reason);
      else dirty.add(id);
    }
    drawer.update(reason);
  });

  window.addEventListener("hashchange", route);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const m = document.getElementById("menu");
      if (!m.hidden) { m.hidden = true; return; }
      if (drawer.isOpen()) nav.closeVenue();
    }
  });
  route();
  refreshFx(false);
}

// today's MXN per US$, when the rate is on Live and the last check is a few hours old
async function refreshFx(force) {
  if (S.cfg.fxMode !== "live" || (!force && !liveIsStale(S.cfg))) return;
  try {
    S.cfg.fxLive = await fetchLiveFx();
    S.cfg.fx = effectiveFx(S.cfg);
    commit("cfg");
    if (force) toast(`Rate updated: MXN ${S.cfg.fx.toFixed(2)} = US$1`);
  } catch (e) {
    if (force) toast("Couldn't reach the rate feeds; keeping the last rate");
  }
}

boot().catch((err) => {
  console.error(err);
  document.getElementById("views").innerHTML = `<div class="wrap"><div class="empty"><b>The Command Center couldn't load its data.</b>${esc(err.message || String(err))}</div></div>`;
});
