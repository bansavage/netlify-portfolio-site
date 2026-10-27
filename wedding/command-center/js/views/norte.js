// Saltillo & Monterrey: a wedding a drive from Daina's family. Its own guest count and its
// own ranking, built on the venue itself (setting, then cost, then the drive), never rooms.

import { S, commit, venueState } from "../store.js";
import { app, nav, pinHTML, shortEnd } from "../app.js";
import { esc, k, kMXN, vbadge, ICON, debounce, driveTxt } from "../util.js";
import { STAGES } from "../defaults.js";
import { NORTE_KEYS, NORTE_TOP } from "../engine.js";
import { budgetBar } from "../drawer.js";

let root = null;
const STAGE_COLOR = { none: "var(--surface-3)", asked: "var(--cobalto)", quoted: "var(--cempa)", visit: "var(--lima)", visited: "var(--olivo)", booked: "var(--buga)", passed: "var(--out)" };
const WEIGHTS = [["setting", "Setting", "How beautiful and characterful the venue is"], ["cost", "All-in cost", "The wedding day against your target and ceiling"], ["near", "Drive from Saltillo", "Close to the family"]];
const SORTS = [["rank", "Best fit"], ["setting", "Most beautiful"], ["price", "Lowest wedding day"], ["near", "Closest to Saltillo"]];

function dots(n) { let s = ""; for (let i = 1; i <= 5; i++) s += `<i class="${n >= i - 0.25 ? "on" : ""}"></i>`; return `<span class="dots" title="Setting ${n} of 5">${s}</span>`; }

const capTxt = (v) => (v.cap_min && v.cap_max ? `${v.cap_min}–${v.cap_max}` : v.cap_max ? `Up to ${v.cap_max}` : v.cap_min ? `${v.cap_min}+` : "—");

function rowHTML(r) {
  const v = r.v, st = S.venues[v.key] || {};
  const c = S.cfg.budget.ceiling;
  const day = r.plan ? `<div class="money${r.high.usd > c ? " over" : ""}" title="${r.low.n}–${r.high.n} guests: ${k(r.low.usd)}–${k(r.high.usd)}"><b>${k(r.plan.usd)}${vbadge(v)}</b><small>${kMXN(r.plan.mxn)}</small></div>` : `<span class="muted">${r.status === "wild" ? "Quote needed" : "—"}</span>`;
  const rk = r.status === "top" ? pinHTML(r) : r.rank ? `<span class="num muted">${r.rank}</span>` : pinHTML(r);
  const stage = st.stage || "none";
  return `<tr data-key="${esc(v.key)}" class="${app.activeKey === v.key ? "is-active" : ""}${r.status === "out" ? " dim" : ""}">
    <td class="st"><button class="starbtn" type="button" data-star="${esc(v.key)}" aria-pressed="${!!st.star}" aria-label="${st.star ? "Remove from" : "Add to"} shortlist">${ICON.star}</button></td>
    <td class="rk">${rk}</td>
    <td class="vn"><b>${esc(v.short)}</b><small>${esc(v.place || v.town || "")}</small></td>
    <td>${dots(r.scores.setting || 0)}</td>
    <td style="white-space:nowrap;font-size:12.5px">${esc(shortEnd(v))}</td>
    <td style="font-size:12.5px">${esc(v.taq_label || "—")}</td>
    <td style="font-size:12.5px;white-space:nowrap">${esc(capTxt(v))}</td>
    <td style="font-size:12.5px;white-space:nowrap">${r.drive != null ? esc(driveTxt(r.drive)) : "—"}</td>
    <td class="n">${day}</td>
    <td class="bcell">${r.plan ? budgetBar(r.low.usd, r.high.usd) : ""}</td>
    <td class="n">${r.fit != null && r.status !== "out" ? r.fit.toFixed(2) : ""}</td>
    <td><span class="stage-dot" style="background:${STAGE_COLOR[stage]}"></span><select class="stage-sel" data-stage="${esc(v.key)}" aria-label="Stage for ${esc(v.short)}">${STAGES.map(([id, l]) => `<option value="${id}" ${stage === id ? "selected" : ""}>${l}</option>`).join("")}</select></td>
  </tr>`;
}

function tableHTML() {
  if (!app.nlist.length) return `<div class="empty"><b>No venues match.</b>Clear the search or show the ruled-out ones.</div>`;
  const head = ["", "#", "Venue", "Setting", "Party ends", "Taqueros", "Guests", "From Saltillo", "Wedding day", "vs budget", "Fit", "Stage"]
    .map((l) => `<th${["Wedding day", "Fit"].includes(l) ? ' class="n"' : ""}>${l}</th>`).join("");
  return `<div class="vt-wrap"><table class="vt"><thead><tr>${head}</tr></thead><tbody>${app.nlist.map(rowHTML).join("")}</tbody></table></div>`;
}

function weightsHTML() {
  const W = S.cfg.norte.weights;
  const tot = NORTE_KEYS.reduce((s, x) => s + (+W[x] || 0), 0) || 1;
  return WEIGHTS.map(([id, l, hint]) => `<div class="wrow"><label for="nw-${id}">${l}<small>${hint}</small></label><input type="range" id="nw-${id}" min="0" max="100" step="5" data-nw="${id}" value="${W[id]}" style="--p:${W[id]}%"><output>${Math.round(((+W[id] || 0) / tot) * 100)}%</output></div>`).join("");
}

function guestsHTML() {
  const g = S.cfg.norte.guests;
  const f = (id, l, hint) => `<label class="field"><span>${l}</span><input class="inp" type="number" min="1" max="600" data-ng="${id}" value="${g[id]}"><small>${hint}</small></label>`;
  return `<div class="fgrid">${f("low", "Plan low", "Bottom of the range")}${f("plan", "Price for", "Every price on this tab")}${f("high", "Plan high", "The ceiling check uses this")}</div>`;
}

function summaryHTML() {
  const all = [...app.nev.results.values()];
  const n = (s) => all.filter((r) => r.status === s).length;
  const tops = all.filter((r) => r.status === "top").sort((a, b) => a.top - b.top);
  const best = tops[0];
  return `<b>${app.norte.length}</b> venues within reach of Saltillo · <b>${n("top")}</b> in the top ${NORTE_TOP}, ${n("fit")} more that fit, ${n("wild")} waiting on a price, ${n("over")} over your ceiling, ${n("out")} ruled out.${best ? ` Leading: <b>${esc(best.v.short)}</b> at ${k(best.plan.usd)} for ${S.cfg.norte.guests.plan} guests.` : ""}`;
}

function renderBody() {
  root.querySelector("#nBody").innerHTML = tableHTML();
  root.querySelector("#nSum").innerHTML = summaryHTML();
  root.querySelector("#nCount").textContent = `${app.nlist.length} of ${app.norte.length} · priced for ${S.cfg.norte.guests.plan} guests`;
}

export const norte = {
  render(el) {
    root = el;
    const f = S.ui.norte;
    el.innerHTML = `<div class="wrap">
      <div class="sec-h"><div><span class="eyebrow">Saltillo &amp; Monterrey</span><h2>Near <em>the family</em></h2><p>A wedding a drive from Daina's family in Saltillo. Guests sleep at home or in town, so rooms don't count here: venues rank on their setting first, then the all-in cost, then the drive from Saltillo. Same vision, budget and must-haves as the rest of the Command Center; its own guest count.</p></div></div>
      <div class="brief-grid" style="margin-bottom:18px">
        <section class="card pad"><h3>Guests</h3><p class="lede">More of the family comes when it's a drive away.</p>${guestsHTML()}</section>
        <section class="card pad"><h3>What matters here</h3><p class="lede">The venue first. No beds on site in the score.</p><div class="weights" id="nWeights">${weightsHTML()}</div></section>
      </div>
      <div class="impact" id="nSum" style="margin-bottom:14px"></div>
      <div class="toolbar"><div class="tb-row">
        <label class="search">${ICON.search}<input class="inp" id="nQ" type="search" placeholder="Search venue or town" value="${esc(f.q)}" autocomplete="off"></label>
        <select class="sel" id="nSort" style="width:auto" aria-label="Sort">${SORTS.map(([v, l]) => `<option value="${v}" ${f.sort === v ? "selected" : ""}>Sort: ${l}</option>`).join("")}</select>
        <button class="fchip" type="button" id="nOut" aria-pressed="${!!f.out}">Show ruled out</button>
        <span class="grow"></span><span class="count" id="nCount"></span>
      </div></div>
      <div id="nBody"></div>
    </div>`;
    renderBody();
    const q = el.querySelector("#nQ");
    q.addEventListener("input", debounce(() => { f.q = q.value.trim(); commit("filters"); }, 140));
    el.querySelector("#nSort").addEventListener("change", (e) => { f.sort = e.target.value; commit("filters"); });
    el.addEventListener("input", (e) => {
      const w = e.target.closest("[data-nw]");
      if (w) { S.cfg.norte.weights[w.dataset.nw] = +w.value; w.style.setProperty("--p", w.value + "%"); commit("cfg"); return; }
    });
    el.addEventListener("change", (e) => {
      const g = e.target.closest("[data-ng]");
      if (g) { const n = Math.max(1, Math.min(600, Math.round(+g.value || 0))); S.cfg.norte.guests[g.dataset.ng] = n; g.value = n; commit("cfg"); return; }
      const s = e.target.closest("[data-stage]");
      if (s) { const st = venueState(s.dataset.stage); st.stage = s.value; st.updated = new Date().toISOString(); commit("venue"); }
    });
    el.addEventListener("click", (e) => {
      if (e.target.closest("#nOut")) { f.out = !f.out; e.target.closest("#nOut").setAttribute("aria-pressed", String(f.out)); commit("filters"); return; }
      const star = e.target.closest("[data-star]");
      if (star) { const st = venueState(star.dataset.star); st.star = !st.star; commit("venue"); return; }
      if (e.target.closest("select, input, label")) return;
      const row = e.target.closest("tr[data-key]");
      if (row) nav.openVenue(row.dataset.key, { tab: "norte" });
    });
  },
  update(reason) {
    if (!root || reason === "note" || reason === "ui") return;
    renderBody();
    root.querySelectorAll("[data-ng]").forEach((i) => { if (document.activeElement !== i) i.value = S.cfg.norte.guests[i.dataset.ng]; });
    const tot = NORTE_KEYS.reduce((s, x) => s + (+S.cfg.norte.weights[x] || 0), 0) || 1;
    root.querySelectorAll("#nWeights output").forEach((o, i) => { o.textContent = Math.round(((+S.cfg.norte.weights[WEIGHTS[i][0]] || 0) / tot) * 100) + "%"; });
  },
  onActive(key) {
    if (!root) return;
    root.querySelectorAll("tr.is-active").forEach((r) => r.classList.remove("is-active"));
    if (key) { const r = root.querySelector(`tr[data-key="${CSS.escape(key)}"]`); if (r) r.classList.add("is-active"); }
  },
};
