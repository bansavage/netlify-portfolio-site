// Vendors: every planner, caterer, taquero, musician and more that the atlas research named,
// with the price norms for each category, a shortlist and stage per vendor, "use this price"
// to push a vendor's rate into the vision, and the couple's own additions.

import { S, commit, vendorState } from "../store.js";
import { app, nav } from "../app.js";
import { esc, k, usd, mxn, num, ICON, debounce, toast, norm, moneyPair, wireMoneyPairs } from "../util.js";
import { CATEGORIES } from "../defaults.js";

let root = null;
const ORDER = ["planner", "caterer", "taquero", "bar", "mariachi", "band", "dj", "photo", "video", "decor", "florals", "rentals", "transport", "officiant", "beauty", "tradition", "other"];
const VSTAGES = [["none", "Not contacted"], ["asked", "Asked"], ["quoted", "Quote in hand"], ["booked", "Booked"], ["passed", "Passed"]];
const USE = { caterer: "buffet", taquero: "taco", bar: "bar", mariachi: "mariachi", band: "band", dj: "dj", photo: "photo", planner: "coord", officiant: "officiant", decor: "decor", rentals: "extras" };
const FLAG = { mentions_taquiza: ["Taquiza", "ok"], mentions_trompo: ["Trompo", "ok"], travels: ["Travels", ""], thin_reviews: ["Few reviews", "warn"], low_rating: ["Low rating", "no"], preferred_by_venue: ["Venue's pick", ""], required_by_venue: ["Required by venue", "warn"] };
const REGIONS = ["Inland Jalisco", "Jalisco", "Puerto Vallarta & Riviera Nayarit", "Michoacán & Colima", "Pacific south", "Yucatán", "Bacalar, Campeche & Palenque", "Oaxaca", "Oaxaca valley", "Oaxaca coast", "Chiapas", "Morelos", "State of Mexico & Taxco", "Hidalgo–Tlaxcala–Puebla", "Bajío", "Nuevo León & Coahuila", "Zacatecas & Durango", "Sonora & Sinaloa", "Baja California", "Nationwide"];

function all() { return [...S.customVendors, ...app.vendors]; }

function unitOf(v) {
  if (v.price_unit && v.price_unit !== "unknown") return { u: v.price_unit, guess: false };
  const p = v.price_from_mxn || 0;
  if (["caterer", "taquero", "bar"].includes(v.category)) return { u: p && p <= 3000 ? "guest" : "event", guess: true };
  if (v.category === "mariachi") return { u: p && p <= 12000 ? "hour" : "event", guess: true };
  return { u: "event", guess: true };
}
const UNIT_TXT = { guest: "a guest", hour: "an hour", event: "an event", package: "a package", night: "a night" };

function nearRegions() {
  const regs = new Set();
  const starred = app.venues.filter((v) => S.venues[v.key] && S.venues[v.key].star);
  const pool = starred.length ? starred : [...app.ev.results.values()].filter((r) => r.status === "top").map((r) => r.v);
  for (const v of pool) regs.add(v.groupLabel);
  // the Oaxaca groups share vendors
  if ([...regs].some((r) => r.startsWith("Oaxaca"))) ["Oaxaca", "Oaxaca valley", "Oaxaca coast"].forEach((r) => regs.add(r));
  if (regs.has("Inland Jalisco")) regs.add("Jalisco");
  return { regs, basis: starred.length ? "your shortlist" : "the live top 20" };
}

function regionSet() {
  const f = S.ui.vendorFilters;
  if (f.region === "all") return null;
  if (f.region === "auto") return nearRegions().regs;
  return new Set([f.region]);
}

function matches(v, f, regs, withCat = true) {
  if (withCat && f.cat !== "all" && v.category !== f.cat) return false;
  if (f.star && !(S.vendors[v.id] && S.vendors[v.id].star)) return false;
  if (regs && !regs.has(v.region) && v.region !== "Nationwide" && !v.custom) return false;
  if (f.q && !norm([v.name, v.city, v.state, v.region, v.notes, v.serves, v.price_text].join(" ")).includes(norm(f.q))) return false;
  return true;
}

function relevance(v) {
  const st = S.vendors[v.id] || {};
  let s = (v.rating || 0) * Math.log2(2 + (v.reviews || 0));
  if (v.price_from_mxn || v.price_from_usd) s += 2;
  if (v.flags && v.flags.includes("mentions_taquiza")) s += 3;
  if (v.flags && v.flags.includes("mentions_trompo")) s += 4;
  if (v.flags && v.flags.includes("low_rating")) s -= 6;
  if (st.star) s += 100;
  if (v.custom) s += 200;
  return s;
}

function sorted(list) {
  const s = S.ui.vendorFilters.sort;
  const price = (v) => v.price_from_mxn || (v.price_from_usd ? v.price_from_usd * S.cfg.fx : 9e12);
  if (s === "price") return list.sort((a, b) => price(a) - price(b));
  if (s === "rating") return list.sort((a, b) => (b.rating || 0) - (a.rating || 0) || (b.reviews || 0) - (a.reviews || 0));
  if (s === "reviews") return list.sort((a, b) => (b.reviews || 0) - (a.reviews || 0));
  if (s === "name") return list.sort((a, b) => a.name.localeCompare(b.name, "es"));
  return list.sort((a, b) => relevance(b) - relevance(a));
}

function benchHTML(cat, regs) {
  if (cat === "all") return "";
  const bs = app.benchmarks.filter((b) => b.category === cat && (!regs || regs.has(b.region) || b.region === "Nationwide"));
  const nat = bs.filter((b) => b.region === "Nationwide"), loc = bs.filter((b) => b.region !== "Nationwide");
  const pick = [...loc.slice(0, 6), ...nat.slice(0, 6)];
  const card = USE[cat] ? S.cfg.vision.find((c) => c.key === USE[cat]) : null;
  const model = card ? `<div class="model">Your vision prices <b>${esc(card.title)}</b> at ${mxn(card.rate)} (${usd(card.rate / S.cfg.fx)}) ${card.unit === "guest" ? "a guest" : card.unit === "hour" ? `an hour × ${card.qty} h` : "flat"}${card.vendor ? `, from ${esc(card.vendor.name)}` : ""}. <a href="#/brief">Change it</a> or use a vendor's price below.</div>` : "";
  if (!pick.length && !model) return "";
  return `<div class="card bench"><h4>What ${esc(CATEGORIES[cat].plural.toLowerCase())} cost${regs ? " here and nationally" : ""}</h4>${pick.length ? `<ul>${pick.map((b) => `<li>${esc(b.text)}${b.source_url ? ` <a href="${esc(b.source_url)}" target="_blank" rel="noopener">source</a>` : ""}${b.region !== "Nationwide" ? ` <span class="muted">· ${esc(b.region)}</span>` : ""}</li>`).join("")}</ul>` : ""}${model}</div>`;
}

function vendHTML(v) {
  const st = S.vendors[v.id] || {};
  const { u, guess } = unitOf(v);
  const price = v.price_from_mxn ? `<b>${mxn(v.price_from_mxn)}</b><small>≈ ${usd(v.price_from_mxn / S.cfg.fx)} · from · ${UNIT_TXT[u] || ""}${guess ? " (unit not stated)" : ""}</small>` : v.price_from_usd ? `<b>${usd(v.price_from_usd)}</b><small>≈ ${mxn(v.price_from_usd * S.cfg.fx)} · from · ${UNIT_TXT[u] || ""}</small>` : `<small>No price listed</small>`;
  const stars = v.rating ? `<span class="stars">★ ${(+v.rating).toFixed(1)}${v.reviews != null ? ` <small>(${v.reviews})</small>` : ""}</span>` : "";
  const flags = (v.flags || []).filter((f) => FLAG[f]).map((f) => `<span class="chip ${FLAG[f][1]}">${FLAG[f][0]}</span>`);
  if (v.venue_link) flags.push(`<span class="chip">Tied to ${esc(v.venue_link)}</span>`);
  if (v.source_checked === false) flags.push(`<span class="chip warn" title="Found through search results; the page itself couldn't be opened to confirm">Social-only listing</span>`);
  const canUse = USE[v.category] && (v.price_from_mxn || v.price_from_usd);
  const usedBy = S.cfg.vision.find((c) => c.vendor && c.vendor.id === v.id);
  const place = [v.city, v.state].filter(Boolean).join(", ");
  return `<article class="vend${v.custom ? " mine" : ""}" data-id="${esc(v.id)}">
    <div class="vh"><div class="grow"><span class="eyebrow">${esc((CATEGORIES[v.category] || CATEGORIES.other).label)} · ${esc(v.region || "")}${v.custom ? " · yours" : ""}</span><h4>${esc(v.name)}</h4>${place ? `<div class="pl">${esc(place)}${v.serves ? " · serves " + esc(v.serves) : ""}</div>` : ""}</div>
      <button class="starbtn" type="button" data-vstar="${esc(v.id)}" aria-pressed="${!!st.star}" aria-label="${st.star ? "Remove from" : "Add to"} my vendors">${ICON.star}</button></div>
    <div class="price">${price}${stars}</div>
    ${v.price_text && v.price_from_mxn ? `<p class="muted" style="font-size:12px">${esc(v.price_text)}</p>` : ""}
    ${v.notes ? `<p>${esc(v.notes)}</p>` : ""}
    ${v.contact ? `<p><b>Contact:</b> ${esc(v.contact)}</p>` : ""}
    ${flags.length ? `<div class="chips">${flags.join("")}</div>` : ""}
    <div class="foot"><select class="stage-sel" data-vstage="${esc(v.id)}" aria-label="Stage">${VSTAGES.map(([id, l]) => `<option value="${id}" ${(st.stage || "none") === id ? "selected" : ""}>${l}</option>`).join("")}</select><span class="grow"></span>
      ${canUse ? `<button class="btn sm${usedBy ? " btn-primary" : ""}" type="button" data-use="${esc(v.id)}" title="Price your vision's ${esc(CATEGORIES[v.category].label.toLowerCase())} line with this vendor">${usedBy ? ICON.check + " In budget" : "Use price"}</button>` : ""}
      ${v.source_url ? `<a class="btn sm btn-ghost" href="${esc(v.source_url)}" target="_blank" rel="noopener" aria-label="Source">${ICON.link}</a>` : ""}
      ${v.custom ? `<button class="btn sm btn-ghost" type="button" data-vdel="${esc(v.id)}" aria-label="Delete">${ICON.trash}</button>` : ""}</div>
  </article>`;
}

function catNavHTML(f, regs) {
  const counts = {};
  let n = 0;
  for (const v of all()) if (matches(v, f, regs, false)) { counts[v.category] = (counts[v.category] || 0) + 1; n++; }
  const btn = (id, label, c) => `<button type="button" data-cat="${id}" aria-pressed="${f.cat === id}">${label}<span class="n">${c}</span></button>`;
  return btn("all", "All vendors", n) + ORDER.filter((c) => counts[c]).map((c) => btn(c, CATEGORIES[c].plural, counts[c])).join("");
}

function addFormHTML() {
  return `<details class="card pad" style="margin-top:18px" id="vendAdd"><summary style="cursor:pointer;font:400 22px/1.1 var(--f-display);list-style:none">${ICON.plus.replace("<svg", '<svg width="18" height="18" style="display:inline;vertical-align:-3px;stroke:currentColor;fill:none;stroke-width:2"')} Add a vendor you found</summary>
    <form class="addform" id="vendForm" style="margin-top:14px" autocomplete="off">
      <label class="field wide"><span>Name</span><input class="inp" name="name" required placeholder="e.g. Taquería El Trompo de Oro"></label>
      <label class="field"><span>Category</span><select class="sel" name="category">${ORDER.map((c) => `<option value="${c}">${CATEGORIES[c].label}</option>`).join("")}</select></label>
      <label class="field"><span>Region</span><select class="sel" name="region">${REGIONS.map((r) => `<option>${esc(r)}</option>`).join("")}</select></label>
      <label class="field"><span>City</span><input class="inp" name="city"></label>
      <label class="field"><span>State</span><input class="inp" name="state"></label>
      <div class="field wide"><span>Price, from</span>${moneyPair({ id: "newvendor", value: "", canon: "mxn", fx: S.cfg.fx, label: "Price", name: "price" })}</div>
      <label class="field"><span>Priced</span><select class="sel" name="unit"><option value="event">An event</option><option value="guest">A guest</option><option value="hour">An hour</option><option value="package">A package</option></select></label>
      <label class="field wide"><span>Contact</span><input class="inp" name="contact" placeholder="Phone, WhatsApp, email or Instagram"></label>
      <label class="field wide"><span>Link</span><input class="inp" name="url" type="url" placeholder="https://"></label>
      <label class="field wide"><span>Notes</span><textarea class="inp" name="notes" rows="2" placeholder="What they offer, who referred them, what they quoted…"></textarea></label>
      <div class="wide"><button class="btn btn-accent" type="submit">${ICON.plus} Add to the directory</button></div>
    </form></details>`;
}

function bodyHTML() {
  const f = S.ui.vendorFilters;
  const regs = regionSet();
  const list = sorted(all().filter((v) => matches(v, f, regs)));
  const shown = list.slice(0, 120);
  const near = nearRegions();
  const regionNote = f.region === "auto" ? `Showing vendors in ${[...near.regs].filter((r) => r !== "Jalisco" || !near.regs.has("Inland Jalisco")).join(", ") || "every region"} (the regions of ${near.basis}) plus nationwide.` : f.region === "all" ? "Showing every region." : `Showing ${esc(f.region)} plus nationwide.`;
  return `<div class="vend-layout">
    <nav class="catnav" id="catNav" aria-label="Vendor categories">${catNavHTML(f, regs)}</nav>
    <div>
      <div class="toolbar" style="position:static;border:0;padding-top:0">
        <div class="tb-row">
          <label class="search">${ICON.search}<input class="inp" id="vendQ" type="search" placeholder="Search name, town, notes…" value="${esc(f.q)}" autocomplete="off"></label>
          <select class="sel" id="vendRegion" style="width:auto" aria-label="Region"><option value="auto" ${f.region === "auto" ? "selected" : ""}>Near my shortlist</option><option value="all" ${f.region === "all" ? "selected" : ""}>All regions</option>${REGIONS.map((r) => `<option value="${esc(r)}" ${f.region === r ? "selected" : ""}>${esc(r)}</option>`).join("")}</select>
          <select class="sel" id="vendSort" style="width:auto" aria-label="Sort">${[["fit", "Most useful"], ["rating", "Best rated"], ["reviews", "Most reviewed"], ["price", "Lowest price"], ["name", "Name"]].map(([v, l]) => `<option value="${v}" ${f.sort === v ? "selected" : ""}>Sort: ${l}</option>`).join("")}</select>
          <button class="fchip" type="button" id="vendStar" aria-pressed="${!!f.star}">${ICON.star} My vendors <span class="n">${Object.values(S.vendors).filter((s) => s.star).length}</span></button>
          <span class="grow"></span><span class="count">${list.length} vendors${list.length > shown.length ? ` · first ${shown.length}` : ""}</span>
        </div>
        <p class="muted" style="margin:0;font-size:12.5px">${regionNote}</p>
      </div>
      ${benchHTML(f.cat, regs)}
      ${shown.length ? `<div class="vendor-grid">${shown.map(vendHTML).join("")}</div>` : `<div class="empty"><b>No vendors here yet.</b>Try All regions, another category, or add one you found below.</div>`}
      ${addFormHTML()}
    </div></div>`;
}

function paint() {
  const top = root.scrollTop;
  const open = root.querySelector("#vendAdd") && root.querySelector("#vendAdd").open;
  root.querySelector("#vendBody").innerHTML = bodyHTML();
  if (open) root.querySelector("#vendAdd").open = true;
  root.scrollTop = top;
}

function useVendor(v) {
  const key = USE[v.category];
  const card = S.cfg.vision.find((c) => c.key === key) || S.cfg.vision.find((c) => c.cat === v.category && c.unit !== "none");
  if (!card) { toast("No vision line for this category yet; add one in the Brief"); return; }
  const { u } = unitOf(v);
  const price = v.price_from_mxn || Math.round((v.price_from_usd || 0) * S.cfg.fx);
  card.unit = u === "guest" ? "guest" : u === "hour" ? "hour" : "flat";
  card.rate = price;
  if (card.unit === "hour" && !card.qty) card.qty = 1;
  card.vendor = { id: v.id, name: v.name };
  commit("cfg");
  toast(`${card.title} now uses ${v.name}: ${mxn(price)} (${usd(price / S.cfg.fx)}) ${UNIT_TXT[u] || ""}`);
}

export const vendors = {
  render(el) {
    root = el;
    el.innerHTML = `<div class="wrap">
      <div class="sec-h"><div><span class="eyebrow">05 — Vendors</span><h2>Everyone who makes <em>the rest</em> happen</h2><p>${app.vendors.length} planners, caterers, taqueros, mariachis, bands, DJs, photographers and more, pulled from the atlas's regional research with their listed prices and reviews. Star the ones you like, track who you've asked, and push a price into the budget.</p></div></div>
      <div id="vendBody"></div></div>`;
    paint();
    wireMoneyPairs(el, () => S.cfg.fx, null);
    const f = S.ui.vendorFilters;
    el.addEventListener("input", debounce((e) => { if (e.target.id === "vendQ") { f.q = e.target.value.trim(); commit("ui"); paint(); const q = root.querySelector("#vendQ"); q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 180));
    el.addEventListener("change", (e) => {
      const t = e.target;
      if (t.id === "vendRegion") { f.region = t.value; commit("ui"); paint(); return; }
      if (t.id === "vendSort") { f.sort = t.value; commit("ui"); paint(); return; }
      if (t.dataset.vstage) { const st = vendorState(t.dataset.vstage); st.stage = t.value; commit("vendor"); }
    });
    el.addEventListener("click", (e) => {
      const c = e.target.closest("[data-cat]");
      if (c) { f.cat = c.dataset.cat; commit("ui"); paint(); return; }
      if (e.target.closest("#vendStar")) { f.star = !f.star; commit("ui"); paint(); return; }
      const s = e.target.closest("[data-vstar]");
      if (s) { const st = vendorState(s.dataset.vstar); st.star = !st.star; s.setAttribute("aria-pressed", String(st.star)); commit("vendor"); return; }
      const u = e.target.closest("[data-use]");
      if (u) { const v = all().find((x) => x.id === u.dataset.use); if (v) { useVendor(v); paint(); } return; }
      const d = e.target.closest("[data-vdel]");
      if (d && confirm("Delete this vendor from your directory?")) { S.customVendors = S.customVendors.filter((x) => x.id !== d.dataset.vdel); commit("vendor"); paint(); }
    });
    el.addEventListener("submit", (e) => {
      if (e.target.id !== "vendForm") return;
      e.preventDefault();
      const fd = new FormData(e.target);
      const name = String(fd.get("name") || "").trim();
      if (!name) return;
      const price = parseInt(String(fd.get("price") || "").replace(/[^\d]/g, ""), 10) || null;
      const v = { id: "my-" + Date.now().toString(36), custom: true, name, category: fd.get("category"), region: fd.get("region"), city: String(fd.get("city") || "").trim(), state: String(fd.get("state") || "").trim(), price_from_mxn: price, price_unit: price ? fd.get("unit") : "unknown", contact: String(fd.get("contact") || "").trim(), source_url: String(fd.get("url") || "").trim(), notes: String(fd.get("notes") || "").trim(), flags: [] };
      S.customVendors.unshift(v);
      vendorState(v.id).star = true;
      commit("vendor");
      f.cat = v.category;
      paint();
      toast(`Added ${name}`);
    });
  },
  update(reason) {
    if (!root || reason === "note" || reason === "filters") return;
    if (reason === "cfg" || reason === "venue") paint();
  },
};
