// Venues: every venue in one sortable table (or as cards), live-priced for the current
// guest count and vision, with the shortlist star and pipeline stage inline.

import { S, commit, venueState } from "../store.js";
import { app, nav, STATUS, pinHTML, regionsList, shortEnd, shortBeds } from "../app.js";
import { illo } from "../illo.js";
import { photoTag } from "../photos.js";
import { esc, k, kMXN, ICON, debounce } from "../util.js";
import { STAGES } from "../defaults.js";
import { budgetBar } from "../drawer.js";

let root = null;
const QUICK = [["u20", "Under target"], ["late", "Party 2 a.m.+"], ["beds", "Sleeps 40+"], ["taq", "Own taqueros"]];
const STAGE_COLOR = { none: "var(--surface-3)", asked: "var(--cobalto)", quoted: "var(--cempa)", visit: "var(--lima)", visited: "var(--olivo)", booked: "var(--buga)", passed: "var(--out)" };
const COLS = [
  ["star", "", null], ["rank", "#", "rank"], ["venue", "Venue", "name"], ["setting", "Setting", "rank"],
  ["end", "Party ends", "end"], ["taq", "Taqueros", "rank"], ["beds", "Sleeps", "beds"], ["day", "Wedding day", "price"], ["bar", "vs budget", "price"],
  ["weekend", "Weekend", "weekend"], ["fit", "Fit", "fit"], ["stage", "Stage", "stage"],
];

function toolbarHTML() {
  const f = S.ui.filters;
  const regions = regionsList();
  return `<div class="toolbar">
    <div class="tb-row">
      <label class="search">${ICON.search}<input class="inp" id="vQ" type="search" placeholder="Search venue, town, state or region" value="${esc(f.q)}" autocomplete="off"></label>
      <select class="sel" id="vRegion" style="width:auto" aria-label="Region">
        <option value="">All regions</option>
        ${regions.map(([r, n]) => `<option value="${esc(r)}" ${f.regions.length === 1 && f.regions[0] === r ? "selected" : ""}>${esc(r)} (${n})</option>`).join("")}
      </select>
      <select class="sel" id="vSort" style="width:auto" aria-label="Sort">
        ${[["rank", "Best fit"], ["price", "Lowest wedding day"], ["weekend", "Lowest weekend"], ["fit", "Highest fit score"], ["end", "Latest party"], ["beds", "Most beds"], ["stage", "Furthest along"], ["region", "Region"], ["name", "Name"]].map(([v, l]) => `<option value="${v}" ${f.sort === v ? "selected" : ""}>Sort: ${l}</option>`).join("")}
      </select>
      <span class="grow"></span>
      <span class="count" id="vCount"></span>
      <div class="seg" role="group" aria-label="Layout"><button type="button" data-vv="table" aria-pressed="${S.ui.venueView === "table"}">${ICON.table} Table</button><button type="button" data-vv="cards" aria-pressed="${S.ui.venueView === "cards"}">${ICON.grid} Cards</button></div>
    </div>
    <div class="tb-row" id="vChips"></div>
  </div>`;
}

function chipsHTML() {
  const f = S.ui.filters;
  const counts = {};
  for (const r of app.ev.results.values()) counts[r.status] = (counts[r.status] || 0) + 1;
  const nStar = Object.values(S.venues).filter((s) => s.star).length;
  const ST = ["top", "fit", "wild", "over", "out"];
  const allOn = !f.star && ST.every((s) => f.show[s]);
  const total = ST.reduce((n, s) => n + (counts[s] || 0), 0);
  // "All" shows every status; a status chip shows only that status
  const st = `<button class="fchip" type="button" data-show="all" aria-pressed="${allOn}">All <span class="n">${total}</span></button>` + ST.map((s) => `<button class="fchip" type="button" data-show="${s}" aria-pressed="${!allOn && !!f.show[s] && !f.star}" style="--c:${STATUS[s].color}"><span class="dot${s === "wild" ? " dia" : ""}"></span>${STATUS[s].label} <span class="n">${counts[s] || 0}</span></button>`).join("");
  const q = QUICK.map(([id, l]) => `<button class="fchip" type="button" data-q="${id}" aria-pressed="${f.quick.includes(id)}">${l}</button>`).join("");
  return `${st}<button class="fchip" type="button" data-star aria-pressed="${!!f.star}">${ICON.star} Shortlist <span class="n">${nStar}</span></button><span style="width:10px"></span>${q}`;
}

function dots(n) { let s = ""; for (let i = 1; i <= 5; i++) s += `<i class="${n >= i - 0.25 ? "on" : ""}"></i>`; return `<span class="dots" title="Setting ${n} of 5">${s}</span>`; }

function rowHTML(r) {
  const v = r.v, st = S.venues[v.key] || {};
  const c = S.cfg.budget.ceiling;
  const day = r.plan ? `<div class="money${r.high.usd > c ? " over" : ""}" title="${r.low.n}–${r.high.n} guests: ${k(r.low.usd)}–${k(r.high.usd)} · ${kMXN(r.low.mxn)}–${kMXN(r.high.mxn)}"><b>${k(r.plan.usd)}</b><small>${kMXN(r.plan.mxn)}</small></div>` : `<span class="muted">${r.status === "wild" ? "Quote needed" : "—"}</span>`;
  const wk = r.plan ? `<div class="money${r.plan.weekendUsd > c ? " over" : ""}"><b>${k(r.plan.weekendUsd)}</b><small>${kMXN(r.plan.weekendMxn)}</small></div>` : "";
  const rk = r.status === "top" ? pinHTML(r) : r.rank ? `<span class="num muted">${r.rank}</span>` : pinHTML(r);
  const stage = st.stage || "none";
  return `<tr data-key="${esc(v.key)}" class="${app.activeKey === v.key ? "is-active" : ""}${r.status === "out" ? " dim" : ""}">
    <td class="st"><button class="starbtn" type="button" data-star="${esc(v.key)}" aria-pressed="${!!st.star}" aria-label="${st.star ? "Remove from" : "Add to"} shortlist">${ICON.star}</button></td>
    <td class="rk">${rk}</td>
    <td class="vn"><b>${esc(v.short)}</b><small title="${esc(v.groupLabel)}">${esc(v.place)}</small></td>
    <td>${v.scores ? dots(v.scores.setting) : ""}</td>
    <td style="white-space:nowrap;font-size:12.5px">${esc(shortEnd(v))}</td>
    <td style="font-size:12.5px">${esc(v.taq_label || "—")}</td>
    <td style="font-size:12.5px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(v.beds_txt || "")}">${esc(shortBeds(v))}</td>
    <td class="n">${day}</td>
    <td class="bcell">${r.plan ? budgetBar(r.low.usd, r.high.usd) : ""}</td>
    <td class="n">${wk}</td>
    <td class="n">${r.fit != null && r.status !== "out" ? r.fit.toFixed(2) : ""}</td>
    <td><span class="stage-dot" style="background:${STAGE_COLOR[stage]}"></span><select class="stage-sel" data-stage="${esc(v.key)}" aria-label="Stage for ${esc(v.short)}">${STAGES.map(([id, l]) => `<option value="${id}" ${stage === id ? "selected" : ""}>${l}</option>`).join("")}</select></td>
  </tr>`;
}

function tableHTML() {
  const sort = S.ui.filters.sort;
  const head = COLS.map(([id, label, s]) => {
    const cls = ["day", "weekend", "fit"].includes(id) ? ' class="n"' : "";
    if (!s || !label) return `<th${cls}>${label}</th>`;
    return `<th${cls}${sort === s && (id !== "rank" || sort === "rank") && !(s === "rank" && id !== "rank") ? ' aria-sort="ascending"' : ""}><button type="button" data-sort="${s}">${label}</button></th>`;
  }).join("");
  if (!app.list.length) return `<div class="empty"><b>No venues match.</b>Clear a filter or the search to see more.</div>`;
  return `<div class="vt-wrap"><table class="vt"><thead><tr>${head}</tr></thead><tbody>${app.list.map(rowHTML).join("")}</tbody></table></div>`;
}

function cardHTML(r) {
  const v = r.v, st = S.venues[v.key] || {};
  const badge = r.status === "top" ? `<span class="badge top">Top 20 · #${r.top}</span>` : `<span class="badge ${r.status}">${esc(STATUS[r.status].label)}</span>`;
  const money = r.plan ? `<div class="money"><b class="${r.high.usd > S.cfg.budget.ceiling ? "over" : ""}">${k(r.plan.usd)}</b><small>${kMXN(r.plan.mxn)} · wedding day · ${r.plan.n} guests</small></div>` : `<div class="money"><b>—</b><small>${r.status === "wild" ? "quote needed" : esc(r.why || "")}</small></div>`;
  const chips = [];
  if (v.end) chips.push(`<span class="chip">Ends ${esc(shortEnd(v))}</span>`);
  if (v.beds_txt) chips.push(`<span class="chip">Sleeps ${esc(shortBeds(v))}</span>`);
  if (v.taq_label) chips.push(`<span class="chip${v.taq_label === "Yes" ? " ok" : v.taq_label === "House only" ? " no" : ""}">Taqueros: ${esc(v.taq_label)}</span>`);
  return `<article class="vcard" data-key="${esc(v.key)}">
    <div class="im">${illo(v, 320, 150)}${photoTag(v, 640)}${badge}<button class="starbtn" type="button" data-star="${esc(v.key)}" aria-pressed="${!!st.star}" aria-label="Shortlist">${ICON.star}</button></div>
    <div class="bd"><h3>${esc(v.short)}</h3><div class="pl">${esc(v.place)}</div>${money}<div class="chips">${chips.join("")}</div></div>
  </article>`;
}

function renderBody() {
  const body = root.querySelector("#vBody");
  body.innerHTML = S.ui.venueView === "cards" ? (app.list.length ? `<div class="vcards">${app.list.map(cardHTML).join("")}</div>` : `<div class="empty"><b>No venues match.</b>Clear a filter or the search to see more.</div>`) : tableHTML();
  root.querySelector("#vChips").innerHTML = chipsHTML();
  root.querySelector("#vCount").textContent = `${app.list.length} of ${app.venues.length} · priced for ${S.cfg.guests.plan} guests`;
}

export const venues = {
  render(el) {
    root = el;
    el.innerHTML = `<div class="wrap">
      <div class="sec-h"><div><span class="eyebrow">03 — Venues</span><h2>Every venue, <em>live</em></h2><p>All ${app.venues.length} venues from the atlas, re-priced and re-ranked whenever you change the guest count, the vision or the weights. Click a row for everything we know.</p></div>
      <div class="acts"><button class="btn" type="button" data-go="map">${ICON.map} Open the map</button></div></div>
      ${toolbarHTML()}
      <div id="vBody"></div>
    </div>`;
    renderBody();
    const f = S.ui.filters;
    const q = el.querySelector("#vQ");
    q.addEventListener("input", debounce(() => { f.q = q.value.trim(); commit("filters"); }, 140));
    el.querySelector("#vRegion").addEventListener("change", (e) => { f.regions = e.target.value ? [e.target.value] : []; commit("filters"); });
    el.querySelector("#vSort").addEventListener("change", (e) => { f.sort = e.target.value; commit("filters"); });
    el.addEventListener("click", (e) => {
      const go = e.target.closest("[data-go]"); if (go) { nav.go(go.dataset.go); return; }
      const vv = e.target.closest("[data-vv]");
      if (vv) { S.ui.venueView = vv.dataset.vv; vv.parentElement.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === vv))); commit("ui"); renderBody(); return; }
      const star = e.target.closest("[data-star]");
      if (star && star.dataset.star) { const st = venueState(star.dataset.star); st.star = !st.star; commit("venue"); return; }
      if (star) { f.star = !f.star; commit("filters"); return; }
      const sh = e.target.closest("[data-show]");
      if (sh) {
        const ST = ["top", "fit", "wild", "over", "out"], want = sh.dataset.show;
        const only = !f.star && ST.filter((s) => f.show[s]).length === 1 && f.show[want];
        f.star = false;
        // clicking the one status already shown goes back to All
        ST.forEach((s) => { f.show[s] = want === "all" || only ? true : s === want; });
        commit("filters");
        return;
      }
      const qq = e.target.closest("[data-q]");
      if (qq) { const id = qq.dataset.q; f.quick = f.quick.includes(id) ? f.quick.filter((x) => x !== id) : [...f.quick, id]; commit("filters"); return; }
      const so = e.target.closest("[data-sort]");
      if (so) { f.sort = so.dataset.sort; el.querySelector("#vSort").value = f.sort; commit("filters"); return; }
      if (e.target.closest("select")) return;
      const row = e.target.closest("[data-key]");
      if (row) nav.openVenue(row.dataset.key, { tab: "venues" });
    });
    el.addEventListener("change", (e) => {
      const s = e.target.closest("[data-stage]");
      if (s) { const st = venueState(s.dataset.stage); st.stage = s.value; st.updated = new Date().toISOString(); commit("venue"); }
    });
  },
  update(reason) {
    if (!root || reason === "note" || reason === "ui") return;
    renderBody();
    const q = root.querySelector("#vQ");
    if (document.activeElement !== q) q.value = S.ui.filters.q;
    root.querySelector("#vSort").value = S.ui.filters.sort;
  },
  onActive(key) {
    if (!root) return;
    root.querySelectorAll("tr.is-active").forEach((r) => r.classList.remove("is-active"));
    if (key) { const r = root.querySelector(`tr[data-key="${CSS.escape(key)}"]`); if (r) r.classList.add("is-active"); }
  },
};
