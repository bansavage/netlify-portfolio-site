// Shared app context: the loaded data, the live evaluation, the shared venue filters
// and small cross-view helpers. Views import this; main.js fills it in at boot.

import { S } from "./store.js";
import { evaluate, evaluateNorte } from "./engine.js";
import { norm, esc } from "./util.js";

export const app = {
  meta: null,
  venues: [],
  byKey: new Map(),
  geo: null,
  vendors: [],
  benchmarks: [],
  ev: null,
  list: [], // the venues passing the shared filters, in the shared sort order
  norte: [], // Saltillo & Monterrey: researched venues plus the atlas's northern ones
  nev: null,
  nlist: [],
  views: {},
  activeKey: null,
};

export const STATUS = {
  top: { label: "Top 20", long: "Top 20", color: "var(--top)" },
  fit: { label: "Fits the brief", long: "Fits the brief", color: "var(--fit)" },
  wild: { label: "Wildcard", long: "Wildcard, not priced yet", color: "var(--wild)" },
  over: { label: "Over ceiling", long: "Over your ceiling", color: "var(--over)" },
  out: { label: "Ruled out", long: "Ruled out", color: "var(--out)" },
};
export const STATUS_ORDER = { top: 0, fit: 1, wild: 2, over: 3, out: 4 };

export function recompute() {
  app.ev = evaluate(app.venues, S.cfg, S.venues);
  app.list = filterList();
  app.nev = evaluateNorte(app.norte, S.cfg, S.venues);
  app.nlist = norteList();
  return app.ev;
}

// on the Saltillo tab a venue is judged by that tab's own ranking
export const inNorte = () => S.ui.tab === "norte";
export const res = (key) => (inNorte() && app.nev && app.nev.results.get(key)) || (app.ev && app.ev.results.get(key)) || (app.nev && app.nev.results.get(key));
// the destination ranking, whatever tab is showing (map, budget and overview read this)
export const mainRes = (key) => app.ev && app.ev.results.get(key);
export const drawerList = () => (inNorte() ? app.nlist : app.list);

// the Venues list carries every venue: the destination ranking plus the Saltillo tab's own
// venues, which keep their Saltillo pricing (its guest count) and Saltillo rank
export function allResults() {
  if (!app.ev) return [];
  const out = [...app.ev.results.values()];
  if (app.nev) for (const r of app.nev.results.values()) if (r.v.norteOnly) out.push(r);
  return out;
}

export function norteList() {
  if (!app.nev) return [];
  const f = S.ui.norte;
  const out = [...app.nev.results.values()].filter((r) => (f.out || r.status !== "out") && (!f.q || r.v._hay.includes(norm(f.q))));
  const price = (r) => (r.plan ? r.plan.usd : 9e9);
  const base = (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || (a.rank || 999) - (b.rank || 999) || (b.scores.setting || 0) - (a.scores.setting || 0) || a.v.short.localeCompare(b.v.short);
  const by = { price: (a, b) => price(a) - price(b) || base(a, b), setting: (a, b) => (b.scores.setting || 0) - (a.scores.setting || 0) || base(a, b), near: (a, b) => (a.drive ?? 999) - (b.drive ?? 999) || base(a, b) };
  return out.sort(by[f.sort] || base);
}

export const lateOK = (v) => v.end_h != null && (v.end_h === 99 || (v.end_h >= 2 && v.end_h <= 11));
export const taqOK = (v) => v.taq_label === "Yes" || v.taq_label === "Likely" || v.taq_label === "House taquiza";

export function passes(r, f = S.ui.filters) {
  const v = r.v;
  const st = S.venues[v.key];
  if (f.star) { if (!(st && st.star)) return false; }
  else if (!f.show[r.status]) return false;
  if (f.regions && f.regions.length && !f.regions.includes(v.groupLabel)) return false;
  if (f.q && !v._hay.includes(norm(f.q))) return false;
  const q = f.quick || [];
  if (q.includes("u20") && !(r.plan && r.plan.usd <= S.cfg.budget.target)) return false;
  if (q.includes("late") && !lateOK(v)) return false;
  if (q.includes("beds") && !(v.beds >= 40)) return false;
  if (q.includes("taq") && !taqOK(v)) return false;
  if (q.includes("ver") && !v.verified) return false;
  return true;
}

export function sorter(sort = S.ui.filters.sort) {
  const price = (r) => (r.plan ? r.plan.usd : 9e9);
  const base = (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || !!a.norte - !!b.norte || (a.top || 99) - (b.top || 99) || (a.rank || 999) - (b.rank || 999) || a.v.short.localeCompare(b.v.short);
  switch (sort) {
    case "price": return (a, b) => price(a) - price(b) || base(a, b);
    case "weekend": return (a, b) => (a.plan ? a.plan.weekendUsd : 9e9) - (b.plan ? b.plan.weekendUsd : 9e9) || base(a, b);
    case "fit": return (a, b) => (b.fit ?? -1) - (a.fit ?? -1) || base(a, b);
    case "name": return (a, b) => a.v.short.localeCompare(b.v.short, "es");
    case "region": return (a, b) => a.v.groupLabel.localeCompare(b.v.groupLabel, "es") || base(a, b);
    case "beds": return (a, b) => (b.v.beds || 0) - (a.v.beds || 0) || base(a, b);
    case "end": return (a, b) => endRank(b.v) - endRank(a.v) || base(a, b);
    case "stage": return (a, b) => stageRank(a.v.key) - stageRank(b.v.key) || base(a, b);
    default: return base;
  }
}
const endRank = (v) => (v.end_h == null ? 0.5 : v.end_h === 99 ? 50 : v.end_h);
const STAGE_RANK = { booked: 0, visited: 1, visit: 2, quoted: 3, asked: 4, none: 5, passed: 6 };
const stageRank = (key) => STAGE_RANK[(S.venues[key] && S.venues[key].stage) || "none"];

export function filterList() {
  if (!app.ev) return [];
  const out = [];
  for (const r of allResults()) if (passes(r)) out.push(r);
  out.sort(sorter());
  return out;
}

export function regionsList() {
  const m = new Map();
  for (const v of [...app.venues, ...app.norte.filter((x) => x.norteOnly)]) m.set(v.groupLabel, (m.get(v.groupLabel) || 0) + 1);
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "es"));
}

export function pinHTML(r, extra = "") {
  const starred = S.venues[r.v.key] && S.venues[r.v.key].star;
  return `<span class="pin pin--${r.status}${starred ? " starred" : ""}${extra}">${r.status === "top" ? r.top : ""}</span>`;
}

export function statusBadge(r) {
  const s = STATUS[r.status];
  if (r.status === "top") return `<span class="badge top">Top 20 · #${r.top}</span>`;
  return `<span class="badge ${r.status}">${esc(s.long)}</span>`;
}

export function shortEnd(v) {
  const e = v.end || "";
  if (/^none|no limit/i.test(e)) return "No limit";
  const m = e.match(/\b(\d{1,2}:\d{2}|\d{1,2} ?a\.m\.)/i);
  return m ? m[1] : e.length > 22 ? e.slice(0, 20) + "…" : e || "—";
}
export function shortBeds(v) {
  const b = String(v.beds_txt || "");
  return b.length > 26 ? (b.match(/^[^;(]+/) || [b])[0].trim().slice(0, 26) : b || "—";
}

// navigation hooks, set by main.js
export const nav = { go: () => {}, openVenue: () => {}, closeVenue: () => {}, showOnMap: () => {}, refreshFx: () => {} };
