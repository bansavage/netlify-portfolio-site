// Budget: one venue's full all-in budget, line by line, with the vision lines editable in
// place, plus where the money goes and a side-by-side comparison with up to three others.

import { S, commit } from "../store.js";
import { app, nav, res } from "../app.js";
import { esc, k, kMXN, usd, mxn, num, ICON, toast, moneyPair, wireMoneyPairs } from "../util.js";

let root = null;
const GROUPS = [
  ["venue", "The venue", "var(--ink)"],
  ["food", "Food & drink", "var(--cempa)"],
  ["music", "Music", "var(--buga)"],
  ["people", "Photo, planning & ceremony", "var(--cobalto)"],
  ["look", "Décor & rentals", "var(--lima)"],
  ["site", "Site & logistics", "var(--olivo)"],
  ["other", "Tips & extras", "var(--barro)"],
  ["cont", "Contingency", "var(--out)"],
];
const G_OF = { venue: "venue", buffet: "food", taco: "food", bar: "food", caterer: "food", taquero: "food", mariachi: "music", band: "music", dj: "music", photo: "people", video: "people", coord: "people", planner: "people", officiant: "people", decor: "look", extras: "look", florals: "look", rentals: "look", heaters: "site", generator: "site", tent: "site", shuttles: "site", transport: "site", tips: "other", beauty: "other", tradition: "other", other: "other", contingency: "cont" };
const KIND = { quote: "Quote", venue: "Venue", rule: "Venue rule", vision: "Your vision", included: "Included", off: "Removed", replaced: "Replaced" };
const groupOf = (l) => G_OF[l.cat] || "other";

function priced() {
  return [...app.ev.results.values()].filter((r) => r.plan).sort((a, b) => {
    const sa = S.venues[a.v.key] && S.venues[a.v.key].star ? 0 : 1, sb = S.venues[b.v.key] && S.venues[b.v.key].star ? 0 : 1;
    return sa - sb || (a.top || 99) - (b.top || 99) || (a.rank || 999) - (b.rank || 999) || a.plan.usd - b.plan.usd;
  });
}
function current() {
  const key = S.ui.budget.venue;
  if (key && res(key) && res(key).plan) return res(key);
  return priced()[0];
}
function option(r, sel) {
  const star = S.venues[r.v.key] && S.venues[r.v.key].star ? "★ " : "";
  const tag = r.status === "top" ? `#${r.top} ` : r.status === "over" ? "Over · " : r.status === "out" ? "Out · " : "";
  return `<option value="${esc(r.v.key)}" ${r.v.key === sel ? "selected" : ""}>${star}${tag}${esc(r.v.short)} — ${k(r.plan.usd)} · ${kMXN(r.plan.mxn)}</option>`;
}

function groupsOf(P) {
  const g = Object.fromEntries(GROUPS.map(([id]) => [id, 0]));
  for (const l of P.lines) g[groupOf(l)] += l.amt;
  return g;
}

function linesHTML(r) {
  const P = r.plan, fx = S.cfg.fx, n = P.n;
  let body = "";
  for (const [gid, glabel] of GROUPS) {
    const ls = P.lines.filter((l) => groupOf(l) === gid);
    if (!ls.length) continue;
    const gsum = ls.reduce((s, l) => s + l.amt, 0);
    if (gid !== "cont") body += `<tr class="grp"><td>${glabel}</td><td class="n">${num(gsum)}</td><td class="n">${usd(gsum / fx)}</td></tr>`;
    for (const l of ls) {
      const zero = l.kind === "included" || l.kind === "off" || l.kind === "replaced";
      const tag = l.kind === "contingency" ? "" : `<span class="kind ${l.kind}">${KIND[l.kind] || l.kind}</span>`;
      let extra = "";
      if (l.kind === "vision") {
        const c = S.cfg.vision.find((x) => x.id === l.card);
        if (c) {
          const u = c.unit === "guest" ? `a guest × ${n}` : c.unit === "hour" ? "an hour ×" : "";
          extra = `<span class="edit">${moneyPair({ id: "v:" + c.id, value: c.rate, canon: "mxn", fx: S.cfg.fx, label: c.title, compact: true })}<span>${u}</span>${c.unit === "hour" ? `<input class="q" type="number" min="0" step="0.5" data-card="${esc(c.id)}" data-f="qty" value="${c.qty}" aria-label="Hours"><span>h</span>` : ""}</span>`;
        }
      }
      const note = l.kind === "included" ? "Covered by the venue's package or menu" : l.kind === "off" ? "Switched off in your vision" : l.kind === "replaced" ? `Was ${mxn(l.replaced)}` : l.detail || l.note || "";
      body += `<tr class="${zero ? "zero" : ""}"><td class="lbl">${esc(l.label)}${tag}${note ? `<small>${esc(note)}</small>` : ""}${extra}</td><td class="n">${zero ? "—" : num(l.amt)}</td><td class="n">${zero ? "" : usd(l.amt / fx)}</td></tr>`;
    }
  }
  body += `<tr class="tot"><td>Wedding day · ${n} guests</td><td class="n">${num(P.mxn)}</td><td class="n">${usd(P.usd)}</td></tr>`;
  const w = S.cfg.weekend;
  body += `<tr class="grp"><td>The rest of the weekend</td><td></td><td></td></tr>`;
  if (w.welcome.on) body += `<tr class="sub"><td class="lbl">Welcome dinner<small>MXN ${num(w.welcome.pp)} a guest</small></td><td class="n">${num(P.welcome)}</td><td class="n">${usd(P.welcome / fx)}</td></tr>`;
  if (w.brunch.on) body += `<tr class="sub"><td class="lbl">Recalentado brunch<small>MXN ${num(w.brunch.pp)} a guest</small></td><td class="n">${num(P.brunch)}</td><td class="n">${usd(P.brunch / fx)}</td></tr>`;
  if (w.rooms.on) body += `<tr class="sub"><td class="lbl">${w.rooms.count} covered rooms × ${w.rooms.nights} nights<small>At the venue's rate, or $150 a night where unknown</small></td><td class="n">${num(P.roomsUsd * fx)}</td><td class="n">${usd(P.roomsUsd)}</td></tr>`;
  if (w.flights.on) body += `<tr class="sub"><td class="lbl">Flights we cover</td><td class="n">${num(P.flightsUsd * fx)}</td><td class="n">${usd(P.flightsUsd)}</td></tr>`;
  body += `<tr class="tot"><td>Full weekend</td><td class="n"></td><td class="n">${usd(P.weekendUsd)}</td></tr>`;
  return `<div class="tablewrap" style="border:0"><table class="lines"><thead><tr><th>Line</th><th class="n">MXN</th><th class="n">US$</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

function heroHTML(r) {
  const P = r.plan, b = S.cfg.budget;
  const over = P.usd > b.ceiling, warn = P.usd > b.target;
  const max = Math.max(b.ceiling * 1.2, P.usd * 1.05);
  const p = (x) => Math.min(100, (x / max) * 100);
  const two = (x) => `${k(x)} (${kMXN(x * S.cfg.fx)})`;
  const verdict = over ? `<b style="color:var(--over)">${two(P.usd - b.ceiling)} over</b> the ceiling` : warn ? `<b style="color:var(--warn)">${two(P.usd - b.target)} over</b> the target, ${two(b.ceiling - P.usd)} under the ceiling` : `<b style="color:var(--good)">${two(b.target - P.usd)} under</b> the target`;
  return `<div class="bud-hero">
    <div class="card"><span class="eyebrow">Wedding day · ${P.n} guests</span><div class="big${over ? " over" : ""}">${usd(P.usd)}</div><small>${mxn(P.mxn)} · ${usd(P.usd / P.n)} (${mxn(P.mxn / P.n)}) a guest · ${r.low.n}–${r.high.n} guests: ${k(r.low.usd)}–${k(r.high.usd)}</small></div>
    <div class="card"><span class="eyebrow">Full weekend</span><div class="mid">${usd(P.weekendUsd)}</div><small>${mxn(P.weekendMxn)} · welcome dinner, brunch${S.cfg.weekend.rooms.on ? ", covered rooms" : ""}${S.cfg.weekend.flights.on ? ", flights" : ""}</small></div>
    <div class="card"><span class="eyebrow">Against the budget</span><div style="margin:18px 0 8px"><div class="bbar"><i class="${over ? "over" : warn ? "warn" : ""}" style="left:0;width:${p(P.usd)}%"></i><span class="tick" style="left:${p(b.target)}%"></span><span class="tick ceil" style="left:${p(b.ceiling)}%"></span></div><div class="bbar-legend"><span>$0</span><span>${k(b.target)}</span><span>${k(b.ceiling)}</span></div></div><small style="font-size:13px;color:var(--ink-2)">${verdict}</small></div>
  </div>`;
}

function whereHTML(r) {
  const g = groupsOf(r.plan), tot = r.plan.mxn || 1, fx = S.cfg.fx;
  const bar = GROUPS.filter(([id]) => g[id] > 0).map(([id, , c]) => `<span style="width:${(g[id] / tot) * 100}%;background:${c}" title="${id}"></span>`).join("");
  const keys = GROUPS.filter(([id]) => g[id] > 0).map(([id, l, c]) => `<div><i style="background:${c}"></i>${l}<b>${k(g[id] / fx)}<small>${kMXN(g[id])}</small></b></div>`).join("");
  return `<div class="card"><div class="panel-h"><div><span class="eyebrow">${esc(r.v.short)}</span><h3>Where the money goes</h3></div></div><div class="stagebar" style="height:16px">${bar}</div><div class="stagekeys">${keys}</div></div>`;
}

function compareHTML(r) {
  const keys = [r.v.key, ...S.ui.budget.compare.filter((x) => x !== r.v.key && res(x) && res(x).plan)].slice(0, 4);
  const rs = keys.map((x) => res(x));
  const gs = rs.map((x) => groupsOf(x.plan));
  const fx = S.cfg.fx;
  const row = (label, vals, fmt, best = "min") => {
    const nums = vals.filter((v) => v != null);
    const b = best === "min" ? Math.min(...nums) : Math.max(...nums);
    return `<tr><td>${label}</td>${vals.map((v) => `<td class="${rs.length > 1 && v === b ? "best" : ""}">${v == null ? "—" : fmt(v)}</td>`).join("")}</tr>`;
  };
  let body = GROUPS.map(([id, l]) => row(l, gs.map((g) => g[id] / fx), (v) => `${k(v)}<small>${kMXN(v * fx)}</small>`)).join("");
  body += `<tr class="tot"><td>Wedding day</td>${rs.map((x) => `<td>${k(x.plan.usd)}<small>${kMXN(x.plan.mxn)}</small></td>`).join("")}</tr>`;
  body += `<tr class="tot"><td>Full weekend</td>${rs.map((x) => `<td>${k(x.plan.weekendUsd)}<small>${kMXN(x.plan.weekendMxn)}</small></td>`).join("")}</tr>`;
  body += row("A guest", rs.map((x) => x.plan.usd / x.plan.n), (v) => `${usd(v)}<small>${mxn(v * fx)}</small>`);
  body += row("Fit score", rs.map((x) => x.fit), (v) => v.toFixed(2), "max");
  body += row("Sleeps on site", rs.map((x) => x.v.beds || 0), (v) => String(v), "max");
  const opts = priced().filter((x) => !keys.includes(x.v.key)).map((x) => option(x)).join("");
  const head = rs.map((x, i) => `<th>${esc(x.v.short)}<small>${esc(x.v.town || "")}${i ? ` · <a href="#" data-uncompare="${esc(x.v.key)}">remove</a>` : ""}</small></th>`).join("");
  return `<div class="card"><div class="panel-h"><div><span class="eyebrow">Side by side · ${r.plan.n} guests</span><h3>Compare</h3></div>${keys.length < 4 ? `<select class="sel" id="bAdd" style="width:auto;max-width:220px" aria-label="Add a venue to compare"><option value="">Add a venue…</option>${opts}</select>` : ""}</div>
    <div class="compare" style="padding:0 8px 10px"><table><thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody></table></div></div>`;
}

function html() {
  const r = current();
  if (!r) return `<div class="wrap"><div class="empty"><b>Nothing priced yet.</b></div></div>`;
  const list = priced();
  return `<div class="wrap">
    <div class="sec-h"><div><span class="eyebrow">06 — Budget</span><h2>The all-in <em>budget</em></h2><p>Every line for one venue at ${r.plan.n} guests: the venue's own lines from the atlas, your vision lines and the weekend. Change a vision price here and it changes at every venue.</p></div>
      <div class="acts"><select class="sel" id="bVenue" style="width:auto;max-width:340px" aria-label="Venue">${list.map((x) => option(x, r.v.key)).join("")}</select><button class="btn" type="button" data-open="${esc(r.v.key)}">Details ${ICON.right}</button></div></div>
    ${heroHTML(r)}
    <div class="bud-cols">
      <div class="card">${linesHTML(r)}</div>
      <div style="display:grid;gap:16px;grid-template-columns:minmax(0,1fr)">${whereHTML(r)}${compareHTML(r)}
        <div class="card pad"><span class="eyebrow">How to read it</span><p style="margin:8px 0 0;font-size:13px;color:var(--ink-2)"><span class="kind quote">Quote</span> a written quote or rate card · <span class="kind venue">Venue</span> the venue's listed price · <span class="kind rule">Venue rule</span> added where the atlas's rules call for it (heaters, generator, tent, shuttles, a required planner) · <span class="kind vision">Your vision</span> from the Brief · <span class="kind included">Included</span> the venue covers it. The contingency is ${S.cfg.contingency}% of every line that isn't a quote.</p></div>
      </div>
    </div></div>`;
}

function paint() {
  const top = root.scrollTop;
  root.innerHTML = html();
  root.scrollTop = top;
}

export const budget = {
  render(el) {
    root = el;
    paint();
    wireMoneyPairs(el, () => S.cfg.fx, (id, val) => {
      const c = S.cfg.vision.find((x) => "v:" + x.id === id);
      if (!c) return;
      c.rate = val;
      delete c.vendor;
      commit("cfg");
      toast(`${c.title} updated at every venue`);
    });
    el.addEventListener("change", (e) => {
      const t = e.target;
      if (t.closest(".money-pair")) return;
      if (t.id === "bVenue") { S.ui.budget.venue = t.value; commit("ui"); paint(); return; }
      if (t.id === "bAdd" && t.value) { S.ui.budget.compare = [...S.ui.budget.compare.filter((x) => x !== t.value), t.value].slice(-3); commit("ui"); paint(); return; }
      if (t.dataset.card) {
        const c = S.cfg.vision.find((x) => x.id === t.dataset.card);
        if (!c) return;
        c[t.dataset.f] = Math.max(0, parseFloat(t.value) || 0);
        delete c.vendor;
        commit("cfg");
        toast(`${c.title} updated at every venue`);
      }
    });
    el.addEventListener("click", (e) => {
      const o = e.target.closest("[data-open]");
      if (o) { nav.openVenue(o.dataset.open, { tab: "budget" }); return; }
      const u = e.target.closest("[data-uncompare]");
      if (u) { e.preventDefault(); S.ui.budget.compare = S.ui.budget.compare.filter((x) => x !== u.dataset.uncompare); commit("ui"); paint(); }
    });
  },
  update(reason) {
    if (!root || reason === "note" || reason === "filters" || reason === "ui") return;
    paint();
  },
  onShow() { if (root) paint(); },
  onActive(key) {
    // opening a venue anywhere makes it the budget's venue next time the tab is shown
    if (key && res(key) && res(key).plan && S.ui.tab !== "budget") S.ui.budget.venue = key;
  },
};
