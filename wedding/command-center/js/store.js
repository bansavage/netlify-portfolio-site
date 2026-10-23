// Everything the couple changes lives in one object, saved to this browser's localStorage.
// Export / import moves it between devices (or to Daina) as a JSON file.

import { DEFAULT_CONFIG } from "./defaults.js";

const KEY = "venue-hunt-cc:v1";

const DEFAULT_UI = {
  tab: "overview",
  filters: { q: "", regions: [], show: { top: true, fit: true, wild: true, over: true, out: false }, quick: [], star: false, sort: "rank" },
  venueView: "table",
  layers: { lines: true, names: true, cities: true, airports: false, vnames: false },
  panel: "shown",
  theme: "auto",
  costN: "plan",
  budget: { venue: null, compare: [] },
  vendorFilters: { cat: "all", region: "auto", q: "", sort: "fit", star: false },
};

function clone(x) { return JSON.parse(JSON.stringify(x)); }

function merge(base, over) {
  if (Array.isArray(base) || typeof base !== "object" || base === null) return over === undefined ? base : over;
  const out = Object.assign({}, base);
  if (over && typeof over === "object" && !Array.isArray(over)) {
    for (const k of Object.keys(over)) out[k] = k in base ? merge(base[k], over[k]) : over[k];
  }
  return out;
}

// The brief used to hold exactly two Saturdays in `dates`; now there's one wedding date
// plus `altDates`.
function migrateDates(cfg, saved) {
  if (saved && Array.isArray(saved.dates) && !Array.isArray(saved.altDates)) cfg.altDates = saved.dates.filter((x) => x !== cfg.date);
  delete cfg.dates;
}

function fresh() {
  return { cfg: clone(DEFAULT_CONFIG), venues: {}, vendors: {}, customVendors: [], customVenues: [], ui: clone(DEFAULT_UI), saved: null };
}

function load() {
  const s = fresh();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return s;
    const d = JSON.parse(raw);
    s.cfg = merge(s.cfg, d.cfg || {});
    migrateDates(s.cfg, d.cfg);
    if (!Array.isArray(s.cfg.vision) || !s.cfg.vision.length) s.cfg.vision = clone(DEFAULT_CONFIG.vision);
    s.venues = d.venues || {};
    s.vendors = d.vendors || {};
    s.customVendors = d.customVendors || [];
    s.customVenues = d.customVenues || [];
    s.ui = merge(s.ui, d.ui || {});
    s.saved = d.saved || null;
  } catch (e) { /* storage unavailable or corrupt: start fresh */ }
  return s;
}

export const S = load();
const subs = new Set();

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      S.saved = new Date().toISOString();
      localStorage.setItem(KEY, JSON.stringify({ cfg: S.cfg, venues: S.venues, vendors: S.vendors, customVendors: S.customVendors, customVenues: S.customVenues, ui: S.ui, saved: S.saved }));
    } catch (e) { /* private mode or quota: keep working in memory */ }
  }, 250);
}

// reason: "cfg" reprices everything; "venue", "vendor" and "ui" only redraw
export function commit(reason = "cfg") {
  save();
  subs.forEach((fn) => fn(reason));
}
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }

export function venueState(key) {
  if (!S.venues[key]) S.venues[key] = { star: false, stage: "none", notes: "", quote: 0 };
  return S.venues[key];
}
export function vendorState(id) {
  if (!S.vendors[id]) S.vendors[id] = { star: false, stage: "none", notes: "" };
  return S.vendors[id];
}

export function resetConfig(part) {
  if (part === "vision") S.cfg.vision = clone(DEFAULT_CONFIG.vision);
  else if (part === "weights") S.cfg.weights = clone(DEFAULT_CONFIG.weights);
  else S.cfg = clone(DEFAULT_CONFIG);
  commit("cfg");
}

export function exportState() {
  const payload = { app: "venue-hunt-command-center", version: 1, exported: new Date().toISOString(), cfg: S.cfg, venues: S.venues, vendors: S.vendors, customVendors: S.customVendors, customVenues: S.customVenues };
  const blob = new Blob([JSON.stringify(payload, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `venue-hunt-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export function importState(text) {
  const d = JSON.parse(text);
  if (d.app !== "venue-hunt-command-center") throw new Error("That file isn't a Command Center export.");
  S.cfg = merge(clone(DEFAULT_CONFIG), d.cfg || {});
  migrateDates(S.cfg, d.cfg);
  if (!Array.isArray(S.cfg.vision) || !S.cfg.vision.length) S.cfg.vision = clone(DEFAULT_CONFIG.vision);
  S.venues = d.venues || {};
  S.vendors = d.vendors || {};
  S.customVendors = d.customVendors || [];
  S.customVenues = d.customVenues || [];
  commit("cfg");
}

export function wipeAll() {
  try { localStorage.removeItem(KEY); } catch (e) { /* nothing saved */ }
  location.reload();
}
