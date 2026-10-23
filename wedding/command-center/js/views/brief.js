// The Brief: the wedding's basics, must-haves, what matters most, the weekend and the
// vision. Vision lines are phrases ("1.5 hour mariachi at the cocktail hour") that carry a
// category and a price, so they flow straight into every venue's all-in total.

import { S, commit, resetConfig } from "../store.js";
import { app, nav } from "../app.js";
import { esc, k, kMXN, usd, mxn, num, ICON, toast, debounce, moneyPair, wireMoneyPairs, syncMoneyPairs } from "../util.js";
import { effectiveFx, fxSourceText, liveIsStale } from "../fx.js";
import { isISO, fmtDate, daysTo, dateNotes } from "../dates.js";
import { CATEGORIES, guessCategory, parseHours, DEFAULT_VISION } from "../defaults.js";
import { cardAmount } from "../engine.js";

let root = null;
const commitSoon = debounce(() => commit("cfg"), 280);
const both = (a) => `${mxn(a)} · ${usd(a / S.cfg.fx)}`;
const DEFAULT_RATES = { caterer: ["guest", 750], taquero: ["guest", 150], bar: ["guest", 350], mariachi: ["hour", 6000], band: ["flat", 25000], dj: ["flat", 20000], photo: ["flat", 25000], video: ["flat", 0], planner: ["flat", 20000], officiant: ["flat", 8000], decor: ["flat", 10000], florals: ["flat", 0], rentals: ["flat", 8000], transport: ["flat", 0], beauty: ["flat", 0], tradition: ["flat", 0], other: ["flat", 0], principle: ["none", 0] };
const CAT_COLOR = { caterer: "var(--cempa)", taquero: "var(--barro)", bar: "var(--olivo)", mariachi: "var(--buga)", band: "var(--cobalto)", dj: "var(--buga)", photo: "var(--ink-2)", video: "var(--ink-2)", planner: "var(--cobalto)", officiant: "var(--lima)", decor: "var(--lima)", florals: "var(--lima)", rentals: "var(--cempa)", transport: "var(--ink-3)", beauty: "var(--buga)", tradition: "var(--barro)", other: "var(--ink-3)", principle: "var(--olivo)" };
const WEIGHTS = [["setting", "Setting", "Landmark, hacienda or garden"], ["end", "Party end time", "2 a.m. or later, in writing"], ["taq", "Own taqueros", "Outside caterers allowed"], ["beds", "Beds on site", "Share of guests who sleep there"], ["cost", "All-in cost", "Full marks at or under target"], ["access", "Access", "Flights and the drive"]];

const get = (path) => path.split(".").reduce((o, p) => (o == null ? o : o[p]), S.cfg);
function set(path, val) {
  const parts = path.split(".");
  let o = S.cfg;
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
  o[parts[parts.length - 1]] = val;
}
const numField = (path, label, opts = {}) => `<label class="field"><span>${label}</span>${opts.pre ? `<span class="inp-pre"><i>${opts.pre}</i>` : ""}<input class="inp num" type="number" inputmode="decimal" data-path="${path}" value="${esc(get(path))}" ${opts.min != null ? `min="${opts.min}"` : ""} ${opts.max != null ? `max="${opts.max}"` : ""} step="${opts.step || 1}">${opts.pre ? "</span>" : ""}${opts.hint ? `<small>${opts.hint}</small>` : ""}</label>`;

function catOptions(sel) {
  return Object.entries(CATEGORIES).filter(([id]) => id !== "venue").map(([id, c]) => `<option value="${id}" ${id === sel ? "selected" : ""}>${c.label}</option>`).join("");
}

function vlineHTML(c) {
  const n = S.cfg.guests.plan;
  const principle = c.unit === "none";
  const stdCard = DEFAULT_VISION.find((d) => d.key && d.key === c.key);
  const qtyLabel = c.unit === "hour" ? "Hours" : c.unit === "guest" ? "× guests" : "Count";
  const pending = c.pending ? S.cfg.vision.find((x) => x.id === c.pending) : null;
  return `<article class="vline${c.on ? "" : " off"}${principle ? " principle" : ""}" data-id="${esc(c.id)}" style="--c:${CAT_COLOR[c.cat] || "var(--ink-3)"}">
    <div class="vh"><select class="sel" data-f="cat" aria-label="Category">${catOptions(c.cat)}</select><span class="grow"></span>
      ${c.key ? "" : `<button class="icon-btn sm" type="button" data-del="${esc(c.id)}" aria-label="Delete this line" title="Delete">${ICON.trash}</button>`}
      ${principle ? "" : `<label class="switch" title="Count it in the budget"><input type="checkbox" data-f="on" ${c.on ? "checked" : ""}><span class="tr"></span></label>`}</div>
    <input class="ttl" data-f="title" value="${esc(c.title)}" aria-label="Title">
    <textarea class="txt" data-f="text" rows="2" aria-label="The phrase">${esc(c.text)}</textarea>
    ${principle ? "" : `<div class="cost">
      <label class="field"><span>Priced</span><select class="sel" data-f="unit"><option value="guest" ${c.unit === "guest" ? "selected" : ""}>Per guest</option><option value="hour" ${c.unit === "hour" ? "selected" : ""}>Per hour</option><option value="flat" ${c.unit === "flat" ? "selected" : ""}>Flat fee</option><option value="none">No cost</option></select></label>
      <label class="field"><span>${qtyLabel}</span><input class="inp num" type="number" inputmode="decimal" min="0" step="${c.unit === "hour" ? 0.5 : c.unit === "guest" ? 0.05 : 1}" data-f="qty" value="${esc(c.qty ?? 1)}"></label>
      <div class="field wide"><span>Price${c.unit === "guest" ? " a guest" : c.unit === "hour" ? " an hour" : ""}</span>${moneyPair({ id: "v:" + c.id, value: c.rate, canon: "mxn", fx: S.cfg.fx, label: c.title })}</div>
    </div>`}
    ${pending ? `<div class="impact">Your atlas line <b>${esc(pending.title)}</b> (${both(cardAmount(pending, n))}) is still counted too. <span class="chips" style="margin-top:6px"><button class="btn sm btn-primary" type="button" data-replace="${esc(c.id)}">Replace it with this</button><button class="btn sm" type="button" data-keep="${esc(c.id)}">Keep both</button></span></div>` : ""}
    <div class="amt"><span>${principle ? '<span class="inc">Principle · no cost</span>' : c.key ? `Replaces the atlas's ${esc((stdCard && stdCard.title) || c.key)} line at every venue` : "Added at every venue"}${c.vendor ? `<br><span class="used">Using ${esc(c.vendor.name)}'s price</span>` : ""}</span><b data-out="amt">${principle ? "" : c.on ? both(cardAmount(c, n)) : "Off"}</b></div>
  </article>`;
}

function visionTotalHTML() {
  const n = S.cfg.guests.plan;
  const on = S.cfg.vision.filter((c) => c.on && c.unit !== "none");
  const tot = on.reduce((s, c) => s + cardAmount(c, n), 0);
  return `<span><b>${mxn(tot)}</b> ${usd(tot / S.cfg.fx)} per venue at ${n} guests, before the venue's own lines and the ${S.cfg.contingency}% contingency</span><span>${on.length} priced lines · ${S.cfg.vision.filter((c) => c.unit === "none").length} principles</span>`;
}

function impactHTML() {
  const atlasViable = app.venues.filter((v) => v.status === "top" || v.status === "fit").length;
  const now = app.ev.viableCount;
  const soft = [...app.ev.results.values()].filter((r) => r.soft).length;
  const over = [...app.ev.results.values()].filter((r) => r.status === "over").length;
  return `<b>${now}</b> venues pass right now (the atlas had ${atlasViable}). ${soft ? `${soft} fail one of the must-haves above; ` : ""}${over} are over your ceiling at ${S.cfg.guests.high} guests.`;
}

function weightsHTML() {
  const W = S.cfg.weights;
  const tot = WEIGHTS.reduce((s, [id]) => s + (+W[id] || 0), 0) || 1;
  return WEIGHTS.map(([id, l, hint]) => `<div class="wrow"><label for="w-${id}">${l}<small>${hint}</small></label><input type="range" id="w-${id}" min="0" max="50" step="1" data-w="${id}" value="${W[id]}" style="--p:${(W[id] / 50) * 100}%"><output data-out="w-${id}">${Math.round(((+W[id] || 0) / tot) * 100)}%</output></div>`).join("");
}

function html() {
  const c = S.cfg, g = c.guests, w = c.weekend;
  return `<div class="wrap">
    <div class="sec-h"><div><span class="eyebrow">02 — The brief</span><h2>What we're <em>looking for</em></h2><p>The numbers and phrases every venue gets measured against. Change anything and the whole Command Center re-prices and re-ranks. It all saves in this browser; export it from the menu to move it or share it.</p></div>
      <div class="acts"><button class="btn" type="button" data-reset="all">${ICON.reset} Back to the atlas brief</button></div></div>
    <div class="brief-grid">
      <section class="card pad"><h3>The basics</h3><p class="lede">Who, when and how many.</p>
        <div class="fgrid" style="grid-template-columns:minmax(0,1fr)"><label class="field"><span>Couple</span><input class="inp" data-path="couple" value="${esc(c.couple)}"></label></div>
        ${datesHTML()}
        <div class="fgrid" style="margin-top:16px">
          ${numField("guests.invited", "Invited", { min: 0 })}${numField("guests.expected", "Expected", { min: 0 })}
          ${numField("guests.low", "Plan low", { min: 1, hint: "Bottom of the range" })}${numField("guests.high", "Plan high", { min: 1, hint: "The ceiling check uses this" })}
          ${numField("guests.plan", "Price for", { min: 1, hint: "Every live price; also the header control" })}
          <label class="field"><span>Teens</span><input class="inp" data-path="guests.teens" value="${esc(g.teens)}"><small>Venues must accept them</small></label>
        </div></section>
      <section class="card pad"><h3>Money</h3><p class="lede">The wedding-day budget and the assumptions behind every total.</p>
        <div class="money-grid">
          <div class="field"><span>Target, wedding day</span>${moneyPair({ id: "b:target", value: c.budget.target, canon: "usd", fx: c.fx, label: "Target" })}</div>
          <div class="field"><span>Ceiling, wedding day</span>${moneyPair({ id: "b:ceiling", value: c.budget.ceiling, canon: "usd", fx: c.fx, label: "Ceiling" })}</div>
        </div>
        <div data-out="fxbox" style="margin-top:16px">${fxHTML()}</div>
        <div class="fgrid" style="margin-top:14px">${numField("contingency", "Contingency %", { min: 0, max: 50, hint: "On every line that isn't a written quote" })}</div>
        <div class="impact" style="margin-top:16px" data-out="costnote">${costNoteHTML()}</div></section>
      <section class="card pad"><h3>Must-haves</h3><p class="lede">Hard filters. A venue that fails one leaves the ranking but stays on the map.</p>
        <div class="must">
          <div class="must-row"><div class="t"><b>Teens welcome</b><small>No adults-only policy, no age limit above 13. Always on.</small></div><span class="badge fit">Required</span></div>
          <div class="must-row"><div class="t"><b>Party ends no earlier than</b><small>Venues with no stated end time still pass.</small></div><select class="sel" data-path="minEnd" data-num>${[[1, "1 a.m. (atlas)"], [2, "2 a.m."], [3, "3 a.m."], [4, "4 a.m."]].map(([v, l]) => `<option value="${v}" ${c.minEnd === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
          <div class="must-row"><div class="t"><b>Sleeps on site, at least</b><small>Beds counted the atlas's way; dorm beds count half.</small></div><select class="sel" data-path="minBeds" data-num>${[[0, "Any"], [20, "20 guests"], [30, "30 guests"], [40, "40 guests"], [60, "60 guests"]].map(([v, l]) => `<option value="${v}" ${c.minBeds === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
          <div class="must-row"><div class="t"><b>Our own taqueros allowed</b><small>Only venues marked Yes or Likely.</small></div><label class="switch"><input type="checkbox" data-path="needTaq" ${c.needTaq ? "checked" : ""}><span class="tr"></span></label></div>
        </div>
        <div class="impact" data-out="impact">${impactHTML()}</div></section>
      <section class="card pad"><h3>What matters most</h3><p class="lede">How the fit score weighs each test. The atlas used 30 / 22 / 18 / 13 / 11 / 6.</p>
        <div class="weights" data-out="weights">${weightsHTML()}</div>
        <div style="margin-top:14px"><button class="btn sm" type="button" data-reset="weights">${ICON.reset} Atlas weights</button></div></section>

      <section class="card pad wide"><div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap"><div><h3>The vision</h3><p class="lede">Write it the way you'd say it. Each line picks up a category and a price and lands in every venue's budget; the atlas's base stack is already here. Principles cost nothing but stay on the page.</p></div>
        <button class="btn sm" type="button" data-reset="vision">${ICON.reset} Atlas vision</button></div>
        <div class="vision-add"><input class="inp" id="vAdd" placeholder="Add a line, e.g. “1.5 hour mariachi at the cocktail hour” or “cold sparklers for the last dance”"><button class="btn btn-accent" type="button" id="vAddBtn">${ICON.plus} Add</button></div>
        <p class="vision-hint">Hours in the phrase set the hours. The category and price fill in from what you write; change either on the card.</p>
        <div class="vgrid" id="vGrid">${c.vision.map(vlineHTML).join("")}</div>
        <div class="vtotal" data-out="vtotal">${visionTotalHTML()}</div></section>

      <section class="card pad"><h3>The weekend</h3><p class="lede">Added to every venue's full-weekend total.</p>
        <div class="must">
          <div class="must-row"><div class="t"><b>Welcome dinner</b><small>Per guest</small></div><span class="wk-ctl">${moneyPair({ id: "wk:welcome", value: w.welcome.pp, canon: "mxn", fx: c.fx, label: "Welcome dinner, per guest", compact: true })}<label class="switch"><input type="checkbox" data-path="weekend.welcome.on" ${w.welcome.on ? "checked" : ""}><span class="tr"></span></label></span></div>
          <div class="must-row"><div class="t"><b>Recalentado brunch</b><small>Per guest, the morning after</small></div><span class="wk-ctl">${moneyPair({ id: "wk:brunch", value: w.brunch.pp, canon: "mxn", fx: c.fx, label: "Brunch, per guest", compact: true })}<label class="switch"><input type="checkbox" data-path="weekend.brunch.on" ${w.brunch.on ? "checked" : ""}><span class="tr"></span></label></span></div>
          <div class="must-row"><div class="t"><b>Rooms we cover</b><small>At each venue's own rate ($150 a night where unknown)</small></div><span style="display:flex;gap:8px;align-items:center"><input class="inp num" style="width:64px" type="number" min="0" data-path="weekend.rooms.count" value="${w.rooms.count}" aria-label="Rooms"><span class="muted">×</span><input class="inp num" style="width:64px" type="number" min="0" data-path="weekend.rooms.nights" value="${w.rooms.nights}" aria-label="Nights"><label class="switch"><input type="checkbox" data-path="weekend.rooms.on" ${w.rooms.on ? "checked" : ""}><span class="tr"></span></label></span></div>
          <div class="must-row"><div class="t"><b>Flights we cover</b><small>About 8 people; $1.3–2k from Monterrey, $2–6k from the US</small></div><span class="wk-ctl">${moneyPair({ id: "wk:flights", value: w.flights.usd, canon: "usd", fx: c.fx, label: "Flights we cover", compact: true })}<label class="switch"><input type="checkbox" data-path="weekend.flights.on" ${w.flights.on ? "checked" : ""}><span class="tr"></span></label></span></div>
        </div></section>
      <section class="card pad"><h3>Notes</h3><p class="lede">Anything the numbers don't hold.</p>
        <textarea class="inp" data-path="notes" rows="9" placeholder="Scouting impressions, family asks, what we've ruled out and why…">${esc(c.notes || "")}</textarea>
        <div class="impact"><b>Ruled out before the atlas:</b> Caribbean all-inclusives (bland food, upselling, sargassum), adults-only resorts and adults-only splits, US-based wedding agencies. Travel advisories are not a screen.</div></section>
    </div></div>`;
}

function altList() { return (S.cfg.altDates || []).filter(isISO).filter((x) => x !== S.cfg.date).sort(); }
function dateMetaHTML() {
  if (!isISO(S.cfg.date)) return "";
  const n = daysTo(S.cfg.date);
  return `${esc(fmtDate(S.cfg.date))} · ${n >= 0 ? n + " days away" : Math.abs(n) + " days ago"}`;
}
function dateNotesHTML() { return dateNotes(S.cfg.date).map((x) => `<li class="${x.tone}">${esc(x.text)}</li>`).join(""); }
function altDatesHTML() {
  const alts = altList();
  return alts.length ? alts.map((d) => `<span class="chip date-chip"><button type="button" data-make-main="${d}" title="Make this the wedding date">${esc(fmtDate(d, "short"))}</button><button type="button" class="x" data-alt-del="${d}" aria-label="Remove ${esc(fmtDate(d))}">×</button></span>`).join("") : `<span class="muted" style="font-size:13px">None yet.</span>`;
}
function datesHTML() {
  return `<div class="field" style="margin-top:14px"><span>Wedding date</span>
      <div class="date-row"><input class="inp" type="date" id="dateMain" value="${esc(S.cfg.date)}" aria-label="Wedding date"><span class="date-meta" data-out="datemeta">${dateMetaHTML()}</span></div>
      <ul class="date-notes" data-out="datenotes">${dateNotesHTML()}</ul></div>
    <div class="field" style="margin-top:12px"><span>Other dates we'd consider</span>
      <div class="chips" data-out="altdates">${altDatesHTML()}</div>
      <div class="date-row"><input class="inp" type="date" id="altDateIn" aria-label="Another date"><button class="btn sm" type="button" id="altDateAdd">${ICON.plus} Add date</button></div>
      <small>Every date here goes into the quote emails and the seven questions. Tap one to make it the wedding date.</small></div>`;
}
function refreshDates() {
  if (!root) return;
  const o = (sel) => root.querySelector(`[data-out="${sel}"]`);
  if (o("datemeta")) o("datemeta").innerHTML = dateMetaHTML();
  if (o("datenotes")) o("datenotes").innerHTML = dateNotesHTML();
  if (o("altdates")) o("altdates").innerHTML = altDatesHTML();
  const m = root.querySelector("#dateMain");
  if (m && document.activeElement !== m) m.value = S.cfg.date;
}

function fxHTML() {
  const c = S.cfg;
  const btn = (m, l) => `<button type="button" data-fx-mode="${m}" aria-pressed="${c.fxMode === m}">${l}</button>`;
  return `<div class="field"><span>Exchange rate</span>
    <div class="fx-now"><b data-out="fxrate">MXN ${(+c.fx).toFixed(2)} = US$1</b><div class="seg" role="group" aria-label="Which rate">${btn("live", "Live")}${btn("atlas", "Atlas 18.45")}${btn("manual", "My rate")}</div>${c.fxMode === "live" ? `<button class="btn sm btn-ghost" type="button" data-fx-refresh>${ICON.reset} Refresh</button>` : ""}</div>
    ${c.fxMode === "manual" ? `<label class="field" style="max-width:190px;margin-top:4px"><span>MXN per US$</span><input class="inp num" type="number" min="1" step="0.01" data-fx-manual value="${esc(c.fxManual)}"></label>` : ""}
    <small data-out="fxsrc">${esc(fxSourceText(c))} Venue lines and vendor prices are in pesos and convert at this rate; the budget is in dollars.</small></div>`;
}
function costNoteHTML() {
  const c = S.cfg;
  return `Cost scores give full marks at or under ${k(c.budget.target)} (${kMXN(c.budget.target * c.fx)}), 2.5 halfway to the ceiling and 0.5 at ${k(c.budget.ceiling)} (${kMXN(c.budget.ceiling * c.fx)}); anything over the ceiling at ${c.guests.high} guests is set aside.`;
}
// the stored amount behind each pair of MXN / US$ boxes
function pairValue(id) {
  const i = id.indexOf(":"), kind = id.slice(0, i), ref = id.slice(i + 1), c = S.cfg;
  if (kind === "b") return c.budget[ref];
  if (kind === "wk") return ref === "flights" ? c.weekend.flights.usd : c.weekend[ref].pp;
  if (kind === "v") { const card = c.vision.find((x) => x.id === ref); return card ? card.rate : null; }
  return null;
}

function refreshOutputs() {
  if (!root) return;
  refreshDates();
  syncMoneyPairs(root, S.cfg.fx, pairValue);
  const fxr = root.querySelector('[data-out="fxrate"]'); if (fxr) fxr.textContent = `MXN ${(+S.cfg.fx).toFixed(2)} = US$1`;
  const fxs = root.querySelector('[data-out="fxsrc"]'); if (fxs) fxs.textContent = `${fxSourceText(S.cfg)} Venue lines and vendor prices are in pesos and convert at this rate; the budget is in dollars.`;
  const cn = root.querySelector('[data-out="costnote"]'); if (cn) cn.innerHTML = costNoteHTML();
  const o = (sel) => root.querySelector(`[data-out="${sel}"]`);
  const imp = o("impact"); if (imp) imp.innerHTML = impactHTML();
  const vt = o("vtotal"); if (vt) vt.innerHTML = visionTotalHTML();
  const n = S.cfg.guests.plan;
  root.querySelectorAll(".vline").forEach((el) => {
    const c = S.cfg.vision.find((x) => x.id === el.dataset.id); if (!c) return;
    const a = el.querySelector('[data-out="amt"]');
    if (a && c.unit !== "none") a.textContent = c.on ? both(cardAmount(c, n)) : "Off";
    el.classList.toggle("off", !c.on);
  });
  const W = S.cfg.weights, tot = WEIGHTS.reduce((s, [id]) => s + (+W[id] || 0), 0) || 1;
  WEIGHTS.forEach(([id]) => { const out = o("w-" + id); if (out) out.textContent = Math.round(((+W[id] || 0) / tot) * 100) + "%"; });
  const gp = root.querySelector('[data-path="guests.plan"]');
  if (gp && document.activeElement !== gp) gp.value = S.cfg.guests.plan;
}

function paint() {
  const top = root.scrollTop;
  root.innerHTML = html();
  root.scrollTop = top;
}

function addLine(text) {
  text = text.trim();
  if (!text) return;
  const cat = guessCategory(text);
  const [unit, rate] = DEFAULT_RATES[cat] || ["flat", 0];
  const hours = parseHours(text);
  // title: the phrase up to its first comma or dash, if that still says something
  let title = text.replace(/[.!]+$/, "");
  const head = title.split(/\s*[,;–—]\s*|\s+-\s+/)[0];
  if (head.split(/\s+/).length >= 3) title = head;
  title = title.replace(/^\w/, (m) => m.toUpperCase());
  const card = { id: "c-" + Date.now().toString(36), key: null, cat, title: title.length > 46 ? title.slice(0, 44) + "…" : title, text, unit, rate, qty: unit === "hour" ? hours || 1 : 1, on: true, auto: true };
  const std = S.cfg.vision.find((c) => c.key && c.cat === cat && c.on);
  if (std) card.pending = std.id;
  S.cfg.vision.push(card);
  commit("cfg");
  const grid = root.querySelector("#vGrid");
  grid.insertAdjacentHTML("beforeend", vlineHTML(card));
  refreshOutputs();
  if (!rate && unit !== "none") toast("Added. Give it a price so it counts.");
  else toast(`Added as ${CATEGORIES[cat].label}${unit === "hour" ? `, ${card.qty} h` : ""}`);
}

export const brief = {
  render(el) {
    root = el;
    paint();
    el.addEventListener("click", (e) => {
      const fm = e.target.closest("[data-fx-mode]");
      if (fm) {
        S.cfg.fxMode = fm.dataset.fxMode;
        S.cfg.fx = effectiveFx(S.cfg);
        commit("cfg");
        el.querySelector('[data-out="fxbox"]').innerHTML = fxHTML();
        refreshOutputs();
        if (S.cfg.fxMode === "live" && liveIsStale(S.cfg)) nav.refreshFx(true);
        return;
      }
      if (e.target.closest("[data-fx-refresh]")) { nav.refreshFx(true); return; }
      if (e.target.closest("#altDateAdd")) {
        const i = el.querySelector("#altDateIn"), v = i.value;
        if (!isISO(v)) { toast("Pick a date first"); return; }
        if (v !== S.cfg.date && !altList().includes(v)) { S.cfg.altDates = [...altList(), v]; commit("cfg"); refreshDates(); }
        i.value = "";
        return;
      }
      const mm = e.target.closest("[data-make-main]");
      if (mm) { const nd = mm.dataset.makeMain; S.cfg.altDates = [...altList().filter((x) => x !== nd), S.cfg.date].filter(isISO); S.cfg.date = nd; commit("cfg"); refreshDates(); toast(`Wedding date: ${fmtDate(nd)}`); return; }
      const ad = e.target.closest("[data-alt-del]");
      if (ad) { S.cfg.altDates = altList().filter((x) => x !== ad.dataset.altDel); commit("cfg"); refreshDates(); return; }
      const r = e.target.closest("[data-reset]");
      if (r) {
        const what = r.dataset.reset;
        const msg = { all: "Put the whole brief back to the atlas's (guests, money, must-haves, weights, weekend and vision)?", vision: "Put the vision back to the atlas's base stack? Lines you added will go.", weights: "Put the weights back to the atlas's 30 / 22 / 18 / 13 / 11 / 6?" }[what];
        if (confirm(msg)) { resetConfig(what === "all" ? undefined : what); paint(); toast("Done"); }
        return;
      }
      if (e.target.closest("#vAddBtn")) { const i = el.querySelector("#vAdd"); addLine(i.value); i.value = ""; i.focus(); return; }
      const del = e.target.closest("[data-del]");
      if (del) { S.cfg.vision = S.cfg.vision.filter((c) => c.id !== del.dataset.del); S.cfg.vision.forEach((c) => { if (c.pending === del.dataset.del) delete c.pending; }); del.closest(".vline").remove(); commit("cfg"); refreshOutputs(); return; }
      const rep = e.target.closest("[data-replace]");
      if (rep) {
        const c = S.cfg.vision.find((x) => x.id === rep.dataset.replace);
        const std = c && S.cfg.vision.find((x) => x.id === c.pending);
        if (c && std) { c.key = std.key; delete c.pending; S.cfg.vision = S.cfg.vision.filter((x) => x.id !== std.id); commit("cfg"); paint(); toast(`${c.title} now replaces ${std.title}`); }
        return;
      }
      const keep = e.target.closest("[data-keep]");
      if (keep) { const c = S.cfg.vision.find((x) => x.id === keep.dataset.keep); if (c) { delete c.pending; commit("cfg"); keep.closest(".impact").remove(); } }
    });
    el.addEventListener("keydown", (e) => { if (e.target.id === "vAdd" && e.key === "Enter") { e.preventDefault(); addLine(e.target.value); e.target.value = ""; } });
    el.addEventListener("input", (e) => {
      const t = e.target;
      if (t.dataset.w) { S.cfg.weights[t.dataset.w] = +t.value; t.style.setProperty("--p", (t.value / 50) * 100 + "%"); commit("cfg"); refreshOutputs(); return; }
      if (t.dataset.path === "notes" || t.dataset.path === "couple" || t.dataset.path === "guests.teens") { set(t.dataset.path, t.value); commit(t.dataset.path === "couple" ? "cfg" : "note"); return; }
      const card = t.closest(".vline");
      if (card && (t.dataset.f === "title" || t.dataset.f === "text")) {
        const c = S.cfg.vision.find((x) => x.id === card.dataset.id); if (!c) return;
        c[t.dataset.f] = t.value;
        if (t.dataset.f === "text") {
          const h = parseHours(t.value);
          if (h && c.unit === "hour" && c.qty !== h) { c.qty = h; const q = card.querySelector('[data-f="qty"]'); if (q) q.value = h; }
          if (c.auto) { const cat = guessCategory(t.value); if (cat !== c.cat) { c.cat = cat; card.querySelector('[data-f="cat"]').value = cat; card.style.setProperty("--c", CAT_COLOR[cat]); } }
        }
        commitSoon();
        refreshOutputs();
      }
    });
    wireMoneyPairs(el, () => S.cfg.fx, (id, val) => {
      const i = id.indexOf(":"), kind = id.slice(0, i), ref = id.slice(i + 1), c = S.cfg;
      if (kind === "b") c.budget[ref] = val;
      else if (kind === "wk") { if (ref === "flights") c.weekend.flights.usd = val; else c.weekend[ref].pp = val; }
      else if (kind === "v") { const card = c.vision.find((x) => x.id === ref); if (card) { card.rate = val; delete card.vendor; } }
      commit("cfg");
      refreshOutputs();
    });
    el.addEventListener("change", (e) => {
      const t = e.target;
      if (t.matches("[data-fx-manual]")) {
        const v = parseFloat(t.value);
        if (v > 0) { S.cfg.fxManual = v; S.cfg.fx = effectiveFx(S.cfg); commit("cfg"); refreshOutputs(); }
        return;
      }
      if (t.id === "dateMain") {
        if (!isISO(t.value)) return;
        S.cfg.date = t.value;
        S.cfg.altDates = altList();
        commit("cfg");
        refreshDates();
        return;
      }
      if (t.dataset.path) {
        let v = t.type === "checkbox" ? t.checked : t.type === "number" || t.dataset.num != null ? parseFloat(t.value) : t.value;
        if (typeof v === "number" && !isFinite(v)) return;
        if (t.dataset.path === "guests.plan" || t.dataset.path === "guests.low" || t.dataset.path === "guests.high") v = Math.max(1, Math.round(v));
        set(t.dataset.path, v);
        if (S.cfg.guests.low > S.cfg.guests.high) S.cfg.guests.high = S.cfg.guests.low;
        commit("cfg");
        refreshOutputs();
        return;
      }
      const card = t.closest(".vline");
      if (card && t.dataset.f) {
        const c = S.cfg.vision.find((x) => x.id === card.dataset.id); if (!c) return;
        const f = t.dataset.f;
        if (f === "on") c.on = t.checked;
        else if (f === "rate" || f === "qty") c[f] = Math.max(0, parseFloat(t.value) || 0);
        else if (f === "cat") { c.cat = t.value; c.auto = false; card.style.setProperty("--c", CAT_COLOR[c.cat]); if (c.cat === "principle") c.unit = "none"; }
        else if (f === "unit") c.unit = t.value;
        if (c.vendor && (f === "rate" || f === "unit")) delete c.vendor;
        commit("cfg");
        if (f === "unit" || f === "cat") { card.outerHTML = vlineHTML(c); }
        refreshOutputs();
      }
    });
  },
  update(reason) {
    if (!root || reason === "note" || reason === "ui" || reason === "filters") return;
    if (root.contains(document.activeElement) && document.activeElement !== document.body) refreshOutputs();
    else paint();
  },
};
