// Overview: the countdown, the live top 20, the shortlist, the pipeline, the quotes to
// chase and where the viable venues are.

import { S, commit } from "../store.js";
import { app, nav, STATUS, pinHTML, res } from "../app.js";
import { illo } from "../illo.js";
import { photoTag } from "../photos.js";
import { esc, k, kMXN, usd, mxn, ICON, picado } from "../util.js";
import { STAGES, DEFAULT_VISION } from "../defaults.js";
import { cardAmount } from "../engine.js";

let root = null;
const STAGE_COLOR = { asked: "var(--cobalto)", quoted: "var(--cempa)", visit: "var(--lima)", visited: "var(--olivo)", booked: "var(--buga)", passed: "var(--out)" };

function daysTo(dateStr) {
  const d = new Date(dateStr + "T12:00:00"), now = new Date();
  return Math.max(0, Math.round((d - now) / 86400000));
}

function visionDelta() {
  const n = S.cfg.guests.plan;
  const sum = (cards) => cards.reduce((s, c) => s + (c.unit === "none" ? 0 : cardAmount(c, n)), 0);
  return sum(S.cfg.vision) - sum(DEFAULT_VISION);
}

function heroHTML() {
  const days = daysTo(S.cfg.date);
  const all = [...app.ev.results.values()];
  const tops = all.filter((r) => r.status === "top").sort((a, b) => a.top - b.top);
  const starred = all.filter((r) => S.venues[r.v.key] && S.venues[r.v.key].star);
  const quoted = Object.values(S.venues).filter((s) => ["quoted", "visit", "visited", "booked"].includes(s.stage)).length;
  const underTarget = all.filter((r) => (r.status === "top" || r.status === "fit") && r.plan.usd <= S.cfg.budget.target).length;
  const cheapestTop = tops.slice().sort((a, b) => a.plan.usd - b.plan.usd)[0];
  const g = S.cfg.guests, b = S.cfg.budget;
  const d = new Date(S.cfg.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  return `<section class="hero">
    <svg class="picado" id="ovPicado" aria-hidden="true"></svg>
    <div class="hero-l">
      <span class="eyebrow">The hunt · ${esc(d)}</span>
      <h2>${days} days to find <em>the place</em>.</h2>
      <p>A symbolic wedding in Mexico for about <b>${g.low}–${g.high} guests</b>, with a <b>${k(b.target)}</b> (${kMXN(b.target * S.cfg.fx)}) target and a <b>${k(b.ceiling)}</b> (${kMXN(b.ceiling * S.cfg.fx)}) ceiling for the wedding day. Every price here is live: change the guest count, the vision or what matters most, and all ${app.venues.length} venues re-price and re-rank.</p>
    </div>
    <div class="hero-r">
      <div class="hk accent"><span class="eyebrow">Fit the brief</span><b>${app.ev.viableCount}</b><small>of ${app.venues.length} venues · ${underTarget} under target</small></div>
      <div class="hk pink"><span class="eyebrow">Shortlist</span><b>${starred.length}</b><small>${starred.length ? "starred venues" : "star venues to build it"}</small></div>
      <div class="hk"><span class="eyebrow">Quotes in hand</span><b>${quoted}</b><small>${quoted ? "venues with a written number" : "none yet; start with #1 below"}</small></div>
      <div class="hk"><span class="eyebrow">Best top-20 price</span><b>${cheapestTop ? k(cheapestTop.plan.usd) : "—"}</b><small>${cheapestTop ? kMXN(cheapestTop.plan.mxn) + " · " + esc(cheapestTop.v.short) + " · " + g.plan + " guests" : ""}</small></div>
    </div>
  </section>`;
}

function topTenHTML() {
  const tops = [...app.ev.results.values()].filter((r) => r.status === "top").sort((a, b) => a.top - b.top);
  const rows = tops.map((r) => {
    const v = r.v;
    const was = v.headline_rank || null;
    const mv = !was ? `<span class="mv up">New</span>` : was > r.top ? `<span class="mv up">▲${was - r.top}</span>` : was < r.top ? `<span class="mv dn">▼${r.top - was}</span>` : "";
    return `<li data-key="${esc(v.key)}">${pinHTML(r)}<span class="nm"><b>${esc(v.short)} ${mv}</b><small>${esc(v.place)} · ends ${esc(endShort(v))} · sleeps ${esc(String(v.beds || "?"))}</small></span><span class="pr">${k(r.plan.usd)}<small>${kMXN(r.plan.mxn)}</small></span><span class="fit" title="Fit score">${r.fit.toFixed(1)}</span></li>`;
  }).join("");
  return `<div class="card"><div class="panel-h"><div><span class="eyebrow">Live ranking · ${S.cfg.guests.plan} guests</span><h3>The top 20 right now</h3></div><button class="btn sm" type="button" data-go="venues">All venues ${ICON.right}</button></div><ol class="toplist">${rows}</ol></div>`;
}
const endShort = (v) => { const e = v.end || ""; if (/^none|no limit/i.test(e)) return "no limit"; const m = e.match(/\b(\d{1,2}:\d{2})/); return m ? m[1] : e ? e.slice(0, 14) : "?"; };

function shortlistHTML() {
  const starred = [...app.ev.results.values()].filter((r) => S.venues[r.v.key] && S.venues[r.v.key].star).sort((a, b) => (a.plan ? a.plan.usd : 9e9) - (b.plan ? b.plan.usd : 9e9));
  const body = starred.length
    ? `<div class="shortlist">${starred.map((r) => { const st = S.venues[r.v.key]; const stage = STAGES.find((s) => s[0] === st.stage); return `<article class="sl-card" data-key="${esc(r.v.key)}"><div class="im">${illo(r.v, 280, 110)}${photoTag(r.v, 640)}</div><div class="bd"><b>${esc(r.v.short)}</b><small>${esc(r.v.place)}</small><div class="ln"><span>${r.plan ? `${k(r.plan.usd)} <small class="muted">${kMXN(r.plan.mxn)}</small>` : "Quote"}</span><small>${esc(stage ? stage[1] : "")}</small></div></div></article>`; }).join("")}</div>`
    : `<div style="padding:0 18px 18px"><div class="empty"><b>Nothing starred yet.</b>Tap the star on any venue, in the table, the map or its details, and it lands here with its live price.</div></div>`;
  return `<div class="card"><div class="panel-h"><div><span class="eyebrow">Yours</span><h3>The shortlist</h3></div>${starred.length ? `<button class="btn sm" type="button" data-shortlist>On the map ${ICON.right}</button>` : ""}</div>${body}</div>`;
}

function pipelineHTML() {
  const counts = {};
  Object.values(S.venues).forEach((s) => { if (s.stage && s.stage !== "none") counts[s.stage] = (counts[s.stage] || 0) + 1; });
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const bar = total ? STAGES.filter(([id]) => counts[id]).map(([id]) => `<span style="width:${(counts[id] / total) * 100}%;background:${STAGE_COLOR[id]}"></span>`).join("") : "";
  const keys = STAGES.filter(([id]) => id !== "none").map(([id, l]) => `<div><i style="background:${STAGE_COLOR[id]}"></i>${l}<b>${counts[id] || 0}</b></div>`).join("");
  return `<div class="card"><div class="panel-h"><div><span class="eyebrow">Outreach</span><h3>Pipeline</h3></div></div><div class="stagebar">${bar}</div><div class="stagekeys">${keys}</div></div>`;
}

function quotesHTML() {
  const list = app.venues.filter((v) => v.quote_order).sort((a, b) => a.quote_order - b.quote_order);
  const rows = list.map((v) => {
    const st = S.venues[v.key] || {}, stage = STAGES.find((s) => s[0] === (st.stage || "none"));
    const r = res(v.key);
    return `<li data-key="${esc(v.key)}"><span class="qn">${String(v.quote_order).padStart(2, "0")}</span><span><b>${esc(v.short)}</b><small>${esc(v.nextstep || "")}</small></span><span class="badge ${st.stage && st.stage !== "none" ? "fit" : ""}">${esc(stage ? stage[1] : "")}</span></li>`;
  }).join("");
  return `<div class="card"><div class="panel-h"><div><span class="eyebrow">From the atlas, in order</span><h3>Quotes to request</h3></div></div><ol class="qlist">${rows}</ol></div>`;
}

function regionsHTML() {
  const m = new Map();
  for (const r of app.ev.results.values()) {
    if (r.status !== "top" && r.status !== "fit") continue;
    const g = r.v.groupLabel;
    const e = m.get(g) || { n: 0, best: null };
    e.n++; if (!e.best || r.plan.usd < e.best.plan.usd) e.best = r;
    m.set(g, e);
  }
  const rows = [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  const max = Math.max(1, ...rows.map(([, e]) => e.n));
  return `<div class="card"><div class="panel-h"><div><span class="eyebrow">Viable venues by region</span><h3>Where the fits are</h3></div></div><div class="regions">${rows.map(([g, e]) => `<div class="reg" data-region="${esc(g)}" title="Lowest: ${esc(e.best.v.short)}"><span class="rn">${esc(g)} <span class="muted">· ${e.n}</span></span><span class="rb"><i style="width:${(e.n / max) * 100}%"></i></span><span class="rp">${k(e.best.plan.usd)}<small>${kMXN(e.best.plan.mxn)}</small></span></div>`).join("")}</div></div>`;
}

function visionHTML() {
  const dlt = visionDelta();
  const n = S.cfg.guests.plan;
  const lines = S.cfg.vision.filter((c) => c.on && c.unit !== "none");
  const tot = lines.reduce((s, c) => s + cardAmount(c, n), 0);
  const principles = S.cfg.vision.filter((c) => c.unit === "none" && c.on).map((c) => `<span class="chip">${esc(c.title)}</span>`).join("");
  return `<div class="card pad"><span class="eyebrow">The vision, priced</span><h3 style="margin:4px 0 8px;font:600 19px/1.2 var(--f-display)">${lines.length} lines · ${mxn(tot)} · ${usd(tot / S.cfg.fx)}</h3>
    <p style="margin:0 0 10px;color:var(--ink-2);font-size:13.5px">What your vision costs per venue at ${n} guests, before the venue itself. ${dlt === 0 ? "Same as the atlas's base stack." : `That's <b>${dlt > 0 ? "+" : "−"}${mxn(Math.abs(dlt))}</b> (${dlt > 0 ? "+" : "−"}${usd(Math.abs(dlt) / S.cfg.fx)}) against the atlas's base stack.`}</p>
    <div class="chips" style="margin-bottom:12px">${principles}</div>
    <button class="btn sm" type="button" data-go="brief">Edit the vision ${ICON.right}</button></div>`;
}

function html() {
  return `<div class="wrap">${heroHTML()}
    <div class="ov-grid">
      <div>${topTenHTML()}${shortlistHTML()}</div>
      <div>${visionHTML()}${pipelineHTML()}${quotesHTML()}${regionsHTML()}</div>
    </div></div>`;
}

function paint() {
  const top = root.scrollTop;
  root.innerHTML = html();
  picado(root.querySelector("#ovPicado"), { w: 1200, h: 26, n: 40, line: "rgba(246,241,228,.5)" });
  root.scrollTop = top;
}

export const overview = {
  render(el) {
    root = el;
    paint();
    el.addEventListener("click", (e) => {
      const go = e.target.closest("[data-go]"); if (go) { nav.go(go.dataset.go); return; }
      if (e.target.closest("[data-shortlist]")) { S.ui.filters.star = true; commit("filters"); nav.go("map"); return; }
      const reg = e.target.closest("[data-region]");
      if (reg) { S.ui.filters.regions = [reg.dataset.region]; S.ui.filters.star = false; commit("filters"); nav.go("venues"); return; }
      const it = e.target.closest("[data-key]");
      if (it) nav.openVenue(it.dataset.key, { tab: "overview" });
    });
  },
  update(reason) {
    if (!root || reason === "note" || reason === "ui" || reason === "filters") return;
    paint();
  },
};
