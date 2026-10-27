// The venue drawer, shared by every tab: live prices, the couple's stage, notes and quote,
// the atlas's facts, the seven questions in Spanish and the full cost breakdown.

import { S, commit, venueState } from "./store.js";
import { app, res, nav, STATUS, statusBadge, shortEnd } from "./app.js";
import { illo } from "./illo.js";
import { photosOf, photoSrc, photoTag, photoHost } from "./photos.js";
import { gmapsURL, esc, k, kMXN, vbadge, usd, mxn, num, driveTxt, copyText, toast, ICON, moneyPair, wireMoneyPairs } from "./util.js";
import { STAGES, QUESTIONS_EN, QUESTIONS_ES, EMAIL_ES } from "./defaults.js";
import { SCORE_KEYS } from "./engine.js";
const fmtShort = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

let openKey = null;
let costN = "plan";
const el = {};

const KIND = {
  quote: "Quote",
  venue: "Venue",
  rule: "Venue rule",
  vision: "Your vision",
  included: "Included",
  off: "Removed",
  replaced: "Replaced",
};

function srcTag(t) {
  const m = { written: ["w", "In writing"], quote: ["w", "Quote"], listed: ["", "Listed"], unverified: ["u", "Unverified"], conflict: ["u", "Conflicting"] };
  const x = m[(t || "").toLowerCase()] || ["", t || ""];
  return x[1] ? `<span class="src-tag ${x[0]}">${esc(x[1])}</span>` : "";
}

export function budgetBar(lowUsd, highUsd) {
  const { target, ceiling } = S.cfg.budget;
  const max = Math.max(ceiling * 1.2, highUsd * 1.05);
  const p = (x) => Math.min(100, (x / max) * 100);
  const cls = highUsd > ceiling ? "over" : highUsd > target ? "warn" : "";
  return `<div class="bbar" role="img" aria-label="Wedding day ${k(lowUsd)} to ${k(highUsd)} against the ${k(target)} target and ${k(ceiling)} ceiling">
    <i class="${cls}" style="left:${p(lowUsd)}%;width:${Math.max(1.5, p(highUsd) - p(lowUsd))}%"></i>
    <span class="tick" style="left:${p(target)}%"></span><span class="tick ceil" style="left:${p(ceiling)}%"></span></div>`;
}

export function costTable(r, which) {
  const P = r[which];
  if (!P) return "";
  const fx = S.cfg.fx;
  let body = P.lines.map((l) => {
    const zero = l.kind === "included" || l.kind === "off" || l.kind === "replaced";
    const tag = l.kind === "contingency" ? "" : `<span class="kind ${l.kind}">${KIND[l.kind] || l.kind}</span>`;
    const note = l.kind === "included" ? "The venue's package or menu covers this." : l.kind === "off" ? "Switched off in your vision." : l.kind === "replaced" ? `Was ${mxn(l.replaced)}; your quote replaces it.` : l.note || (l.perGuest ? "Scales with guests" : "");
    return `<tr class="${zero ? "zero" : ""}"><td class="lbl">${esc(l.label)}${tag}${note ? `<small>${esc(note)}</small>` : ""}</td><td class="n">${zero ? "—" : num(l.amt)}</td><td class="n">${zero ? "" : usd(l.amt / fx)}</td></tr>`;
  }).join("");
  body += `<tr class="tot"><td>Wedding day, ${P.n} guests</td><td class="n">${num(P.mxn)}</td><td class="n">${usd(P.usd)}</td></tr>`;
  const w = S.cfg.weekend;
  if (w.welcome.on) body += `<tr class="sub"><td>Welcome dinner (MXN ${num(w.welcome.pp)} a guest)</td><td class="n">${num(P.welcome)}</td><td class="n">${usd(P.welcome / fx)}</td></tr>`;
  if (w.brunch.on) body += `<tr class="sub"><td>Recalentado brunch (MXN ${num(w.brunch.pp)} a guest)</td><td class="n">${num(P.brunch)}</td><td class="n">${usd(P.brunch / fx)}</td></tr>`;
  if (w.rooms.on) body += `<tr class="sub"><td>${w.rooms.count} covered rooms × ${w.rooms.nights} nights</td><td class="n">${num(P.roomsUsd * fx)}</td><td class="n">${usd(P.roomsUsd)}</td></tr>`;
  if (w.flights.on) body += `<tr class="sub"><td>Flights we cover</td><td class="n">${num(P.flightsUsd * fx)}</td><td class="n">${usd(P.flightsUsd)}</td></tr>`;
  body += `<tr class="tot"><td>Full weekend, ${P.n} guests</td><td class="n"></td><td class="n">${usd(P.weekendUsd)}</td></tr>`;
  return `<div class="tablewrap"><table class="lines"><thead><tr><th>Line</th><th class="n">MXN</th><th class="n">US$</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

function scoreRows(r) {
  if (!r.scores) return "";
  const W = S.cfg.weights;
  const tot = SCORE_KEYS.reduce((s, x) => s + (+W[x] || 0), 0) || 1;
  const LBL = { setting: "Setting", end: "Party end time", taq: "Own taqueros", beds: "Beds on site", cost: "All-in cost", access: "Airport proximity" };
  return `<div class="scores">${SCORE_KEYS.map((x) => {
    const s = r.scores[x] ?? 0;
    return `<div class="srow"><span class="sl">${LBL[x]} <small>${Math.round(((+W[x] || 0) / tot) * 100)}%</small></span><span class="sb"><i style="width:${Math.max(2, (s / 5) * 100)}%"></i></span><span class="sv">${(+s).toFixed(1)}</span></div>`;
  }).join("")}</div>`;
}

// the couple's own template (defaults.js) replaced the atlas's seven questions
const questionsES = () => QUESTIONS_ES;
const questionsEN = () => QUESTIONS_EN;

function emailES() {
  const qs = questionsES().map((q, i) => `${i + 1}. ${q}`).join("\n");
  return `${EMAIL_ES.intro}\n\n${qs}\n\n\n${EMAIL_ES.outro}`;
}

// how we reached a venue: channel, addresses and numbers, and where the thread stands
const CHANNEL = { email: "Email", whatsapp: "WhatsApp", "email+whatsapp": "Email and WhatsApp" };
const waLink = (n) => `<a href="https://wa.me/${String(n).replace(/\D/g, "")}" target="_blank" rel="noopener">${esc(n)}</a>`;
const mailLink = (m) => `<a href="mailto:${esc(m)}">${esc(m)}</a>`;
function contactHTML(c) {
  const rows = [];
  if (c.email) rows.push(["Email", mailLink(c.email) + (c.email2 ? ` · ${mailLink(c.email2)}` : "")]);
  if (c.whatsapp) rows.push(["WhatsApp", waLink(c.whatsapp) + (c.whatsapp_old ? ` <span class="muted">(was ${esc(c.whatsapp_old)})</span>` : "")]);
  if (c.phone && c.phone !== c.whatsapp) rows.push(["Phone", `<a href="tel:${esc(c.phone.replace(/[^\d+]/g, ""))}">${esc(c.phone)}</a>`]);
  if (c.bounced && c.bounced.length) rows.push(["Bounced", c.bounced.map((m) => `<s class="muted">${esc(m)}</s>`).join(" · ")]);
  return `<div class="catch reach"><b>How we reached them · ${esc(CHANNEL[c.channel] || c.channel || "")}${c.sent ? " · " + esc(fmtShort(c.sent)) : ""}</b>${c.status ? `<p>${esc(c.status)}</p>` : ""}${rows.length ? `<dl>${rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join("")}</dl>` : ""}</div>`;
}

function bodyHTML(v, r) {
  const st = venueState(v.key);
  const badges = [statusBadge(r)];
  if (st.star) badges.push(`<span class="badge star">${ICON.star.replace("<svg", '<svg width="11" height="11" style="fill:currentColor;stroke:none"')} Shortlist</span>`);
  if (r.fit != null && r.status !== "out") badges.push(`<span class="badge">Fit ${r.fit.toFixed(2)} / 5</span>`);
  if (r.rank && r.status !== "top") badges.push(`<span class="badge">Rank ${r.rank} of ${app.ev.viableCount}</span>`);
  if (v.rank && r.fitRank && v.rank !== r.fitRank) badges.push(`<span class="badge">Atlas #${v.rank}</span>`);
  let h = `<div class="dw-top"><div class="badges">${badges.join("")}</div><h2 class="dw-title" id="dwTitle" tabindex="-1">${esc(v.short)}</h2><p class="dw-place">${esc(v.place)} · ${esc(v.groupLabel)}</p></div>`;
  const ph = photosOf(v);
  if (ph.length > 1) h += `<div class="gallery" aria-label="Photos">${ph.slice(0, 12).map((p, i) => `<button type="button" data-ph="${i}" aria-label="Photo ${i + 1}" aria-current="${i === 0}"><img src="${esc(photoSrc(p, 320))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"></button>`).join("")}</div>`;
  h += `<div class="dw-acts"><button class="btn sm star" type="button" data-star aria-pressed="${!!st.star}">${ICON.star} ${st.star ? "Shortlisted" : "Shortlist"}</button>
    <select class="stage-sel" data-stage aria-label="Where this venue stands">${STAGES.map(([id, label]) => `<option value="${id}" ${st.stage === id ? "selected" : ""}>${label}</option>`).join("")}</select>
    ${S.ui.tab !== "map" ? `<button class="btn sm" type="button" data-onmap>${ICON.pin} Map</button>` : ""}
    ${v.photos_url ? `<a class="btn sm" href="${esc(v.photos_url)}" target="_blank" rel="noopener">${ICON.link} Photos</a>` : ""}
    <a class="btn sm" href="${esc(gmapsURL(v))}" target="_blank" rel="noopener">${ICON.pin} Google Maps</a></div>`;
  if (v.description) h += `<p class="dw-desc">${esc(v.description)}</p>`;
  if (r.plan) {
    const g = S.cfg.guests, c = S.cfg.budget.ceiling;
    const cell = (P, lab, plan) => `<div class="${P.usd > c ? "over" : ""}${plan ? " plan" : ""}"><span class="lab">${lab}</span><b>${k(P.usd)}${vbadge(r.v)}</b><small class="mx">${kMXN(P.mxn)}</small><small>${P.n} guests</small></div>`;
    const wk = (P, plan) => `<div class="${P.weekendUsd > c ? "over" : ""}${plan ? " plan" : ""}"><span class="lab">Weekend</span><b>${k(P.weekendUsd)}${vbadge(r.v)}</b><small class="mx">${kMXN(P.weekendMxn)}</small><small>${P.n} guests</small></div>`;
    h += `<div><div class="prices">${cell(r.low, "Wedding day", false)}${cell(r.plan, "Wedding day", true)}${cell(r.high, "Wedding day", false)}${wk(r.low)}${wk(r.plan, true)}${wk(r.high)}</div>
      <div style="margin-top:12px">${budgetBar(r.low.usd, r.high.usd)}<div class="bbar-legend"><span>$0</span><span>${k(S.cfg.budget.target)} target</span><span>${k(c)} ceiling</span></div></div></div>`;
    if (g.plan < g.low || g.plan > g.high) h += `<p class="muted" style="margin:-8px 0 0;font-size:12px">Pricing for ${g.plan} guests, outside your ${g.low}–${g.high} range.</p>`;
  }
  if (v.inbox && v.inbox.quote) h += `<div class="catch"><b>From our messages${v.inbox.date ? " · " + esc(fmtShort(v.inbox.date)) : ""}</b>${esc(v.inbox.quote)}${v.inbox.note ? `<br><span class="muted">${esc(v.inbox.note)}</span>` : ""}</div>`;
  if (v.inbox && v.inbox.contact) h += contactHTML(v.inbox.contact);
  if (v.catch) h += `<div class="catch"><b>The catch</b>${esc(v.catch)}</div>`;
  if (r.why && (r.status === "out" || r.status === "over" || r.status === "wild")) h += `<div class="catch ${r.status === "out" ? "bad" : ""}"><b>${r.status === "wild" ? "Why it's a wildcard" : r.status === "over" ? "Why it's over" : r.soft ? "Fails one of your must-haves" : "Why it's ruled out"}</b>${esc(r.why)}</div>`;
  const facts = [];
  if (v.end) facts.push(["Party ends", esc(v.end) + srcTag(v.end_src)]);
  if (v.taq_label) { const tt = String(v.taq_txt || "").replace(/^(yes|likely|house only|house taquiza|unclear|no)\s*[:·.-]\s*/i, ""); facts.push(["Outside taqueros", `<b>${esc(v.taq_label)}</b>${tt ? " · " + esc(tt) : ""}`]); }
  if (v.beds_txt) facts.push(["Sleeps on site", esc(v.beds_txt)]);
  if (v.ap) { const a = app.geo.airports.find((x) => x.iata === v.ap); facts.push(["Nearest airport", `${esc(v.ap)}${a ? " · " + esc(a.city) : ""}${v.drive ? " · about " + driveTxt(v.drive) + " drive" : ""}`]); }
  if (v.rev) facts.push(["Reviews", esc(v.rev)]);
  if (v.conf || (v.review_flags && v.review_flags.length)) facts.push(["Evidence", esc([v.conf, ...(v.review_flags || []).map((x) => (/review/i.test(x) ? x : x + " reviews"))].filter(Boolean).join(" · "))]);
  if (v.address) facts.push(["Address", esc(v.address)]);
  if (facts.length) h += `<dl class="facts">${facts.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join("")}</dl>`;
  if (v.loc_note) h += `<p class="muted" style="margin:-6px 0 0;font-size:12px">${esc(v.loc_note)}</p>`;

  h += `<section class="mine" aria-label="Your notes"><div class="field"><span>Your notes</span><textarea class="inp" data-notes placeholder="Calls, impressions, what they said, who to ask for…">${esc(st.notes || "")}</textarea></div>
    ${v.rows ? `<div class="field"><span>Your quote for the venue</span>${moneyPair({ id: "q:" + v.key, value: st.quote ? st.quote : "", canon: "mxn", fx: S.cfg.fx, label: "Your quote" })}<small>Replaces the venue's own lines (rental, house menu, required extras). Your vision lines and the weekend still apply.</small></div>` : ""}</section>`;

  const extra = [...(v.callouts || []), ...(v.facts || [])];
  if (extra.length) h += `<section class="dsec"><h3>Worth knowing</h3><ul>${extra.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>`;
  if (v.mentions && v.mentions.length) h += `<section class="dsec mentions"><h3>What the atlas says</h3><ul>${v.mentions.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>`;
  if (r.status !== "out" || r.soft) {
    const en = questionsEN();
    const qs = questionsES().map((q, i) => `<li>${esc(q)}<br><small class="muted">${esc(en[i] || "")}</small></li>`).join("");
    h += `<section class="dsec"><h3>Get in writing</h3>${v.nextstep ? `<p><b>${v.quote_order ? "Quote #" + v.quote_order + ": " : ""}</b>${esc(v.nextstep)}</p>` : ""}<p class="muted">Our seven questions for every venue, in Spanish:</p><ol>${qs}</ol>
      <p><b>Subject:</b> ${esc(EMAIL_ES.subject)}</p>
      <div class="chips"><button class="btn sm" type="button" data-copysubj>${ICON.copy} Copy the subject</button><button class="btn sm" type="button" data-copymail>${ICON.copy} Copy the body</button><button class="btn sm" type="button" data-copyq>${ICON.copy} Copy the questions</button></div></section>`;
  }
  if (r.scores && r.status !== "out") h += `<section class="dsec"><h3>How it scores</h3>${scoreRows(r)}</section>`;
  if (r.plan) {
    const g = S.cfg.guests;
    const opt = (id, n) => `<button type="button" data-n="${id}" aria-pressed="${costN === id}">${n}</button>`;
    h += `<section class="dsec"><h3>Cost breakdown <span class="seg" role="group" aria-label="Guest count">${opt("low", g.low)}${opt("plan", g.plan)}${opt("high", g.high)}</span></h3><div data-costwrap>${costTable(r, costN)}</div>
      <p class="muted" style="font-size:12px">Your vision lines come from the Brief and apply at every venue; edit them there or in the Budget tab.</p></section>`;
  }
  const links = [];
  if (v.photos_url) links.push(`<a href="${esc(v.photos_url)}" target="_blank" rel="noopener">Photos and listing ↗</a>`);
  (v.src || []).filter((u) => u && u !== v.photos_url).forEach((u) => links.push(/^https?:/.test(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u.replace(/^https?:\/\/(www\.)?/, "").slice(0, 70))} ↗</a>` : `<span class="muted" style="font-size:13px">${esc(u)}</span>`));
  if (links.length) h += `<section class="dsec"><h3>Sources</h3><div class="links">${links.join("")}</div></section>`;
  return h;
}

function updateNav() {
  const i = app.list.findIndex((r) => r.v.key === openKey);
  el.pos.textContent = i >= 0 ? `${i + 1} of ${app.list.length}` : "";
  el.prev.disabled = i <= 0;
  el.next.disabled = i < 0 || i >= app.list.length - 1;
}

function render(keepScroll) {
  const v = app.byKey.get(openKey), r = res(openKey);
  if (!v || !r) return;
  const top = el.scroll.scrollTop;
  el.hero.innerHTML = illo(v, 470, 210) + photoTag(v, 960) + (photosOf(v).length ? `<a class="illo-tag" href="${esc(v.photo_src)}" target="_blank" rel="noopener">Photo · ${esc(photoHost(v))} ↗</a>` : `<span class="illo-tag">Drawing of the setting · photos via Sources</span>`);
  el.body.innerHTML = bodyHTML(v, r);
  el.scroll.scrollTop = keepScroll ? top : 0;
  updateNav();
}

function stepTo(d) {
  const i = app.list.findIndex((r) => r.v.key === openKey);
  const n = app.list[i + d];
  if (n) nav.openVenue(n.v.key);
}

export const drawer = {
  init() {
    el.root = document.getElementById("drawer");
    el.hero = document.getElementById("dwHero");
    el.body = document.getElementById("dwBody");
    el.scroll = document.getElementById("dwScroll");
    el.pos = document.getElementById("dwPos");
    el.prev = document.getElementById("dwPrev");
    el.next = document.getElementById("dwNext");
    document.getElementById("dwClose").innerHTML = ICON.close;
    el.prev.innerHTML = `${ICON.left} Previous`;
    el.next.innerHTML = `Next ${ICON.right}`;
    document.getElementById("dwClose").addEventListener("click", () => nav.closeVenue());
    el.prev.addEventListener("click", () => stepTo(-1));
    el.next.addEventListener("click", () => stepTo(1));
    el.body.addEventListener("click", (e) => {
      const v = app.byKey.get(openKey);
      if (!v) return;
      const pb = e.target.closest("[data-ph]");
      if (pb) {
        const url = photosOf(v)[+pb.dataset.ph];
        let img = el.hero.querySelector("img.ph");
        if (!img) { el.hero.insertAdjacentHTML("beforeend", photoTag(v, 960)); img = el.hero.querySelector("img.ph"); }
        if (img && url) img.src = photoSrc(url, 960);
        el.body.querySelectorAll("[data-ph]").forEach((b) => b.setAttribute("aria-current", String(b === pb)));
        return;
      }
      const nb = e.target.closest("[data-n]");
      if (nb) {
        costN = nb.dataset.n;
        nb.parentElement.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.n === costN)));
        el.body.querySelector("[data-costwrap]").innerHTML = costTable(res(openKey), costN);
        return;
      }
      if (e.target.closest("[data-star]")) { const st = venueState(v.key); st.star = !st.star; commit("venue"); toast(st.star ? `${v.short} is on your shortlist` : `Removed ${v.short} from your shortlist`); return; }
      if (e.target.closest("[data-onmap]")) { nav.showOnMap(v.key); return; }
      if (e.target.closest("[data-copyq]")) {
        const text = `${v.short}\n` + questionsES().map((q, i) => `${i + 1}. ${q}`).join("\n");
        copyText(text).then(() => toast("Questions copied"), () => toast("Couldn't copy; select the text instead"));
        return;
      }
      if (e.target.closest("[data-copysubj]")) copyText(EMAIL_ES.subject).then(() => toast("Subject copied"), () => toast("Couldn't copy"));
      if (e.target.closest("[data-copymail]")) copyText(emailES()).then(() => toast("Body copied"), () => toast("Couldn't copy"));
    });
    el.body.addEventListener("change", (e) => {
      const v = app.byKey.get(openKey);
      if (!v) return;
      const st = venueState(v.key);
      if (e.target.matches("[data-stage]")) { st.stage = e.target.value; st.updated = new Date().toISOString(); commit("venue"); toast(`${v.short}: ${e.target.selectedOptions[0].textContent}`); }
    });
    wireMoneyPairs(el.body, () => S.cfg.fx, (id, val) => {
      if (!id.startsWith("q:")) return;
      const st = venueState(id.slice(2));
      st.quote = val > 0 ? val : 0;
      if (st.quote && (st.stage === "none" || st.stage === "asked")) st.stage = "quoted";
      commit("venue");
    });
    el.body.addEventListener("input", (e) => {
      if (!e.target.matches("[data-notes]")) return;
      const st = venueState(openKey);
      st.notes = e.target.value;
      st.updated = new Date().toISOString();
      commit("note");
    });
  },
  open(key, opts = {}) {
    const changed = openKey !== key;
    openKey = key;
    app.activeKey = key;
    render(!changed);
    el.root.classList.add("open");
    el.root.setAttribute("aria-hidden", "false");
    document.body.classList.add("drawer-open");
    Object.values(app.views).forEach((v) => v.onActive && v.onActive(key, opts));
    if (changed && !opts.fromRoute) setTimeout(() => { const t = document.getElementById("dwTitle"); if (t) t.focus({ preventScroll: true }); }, 60);
  },
  close() {
    if (!openKey) return;
    openKey = null;
    app.activeKey = null;
    el.root.classList.remove("open");
    el.root.setAttribute("aria-hidden", "true");
    document.body.classList.remove("drawer-open");
    Object.values(app.views).forEach((v) => v.onActive && v.onActive(null, {}));
  },
  isOpen() { return !!openKey; },
  update(reason) {
    if (!openKey || reason === "note") return;
    if (reason === "filters") { updateNav(); return; }
    render(true);
  },
};
