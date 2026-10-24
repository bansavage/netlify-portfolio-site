// Pricing, scoring and live status. Pure functions: venue data + config in, numbers out.
//
// Each priced venue carries the atlas's cost rows at 60 and 70 guests. Standard stack rows
// (buffet, mariachi, DJ ...) are replaced by the matching vision line, so editing the vision
// reprices every venue at once; venue rows (rental, house menus, required extras) are
// interpolated between the 60- and 70-guest figures. With the default config this
// reproduces the atlas's totals exactly (ranks now follow the couple's own weights).

export const STD_KEYS = ["buffet", "taco", "bar", "mariachi", "band", "dj", "photo", "coord", "officiant", "decor", "extras", "tips"];
export const RULE_KEYS = ["planner", "generator", "heaters", "tent", "shuttles"];
// Taquero permission is not scored (Kyle, Oct 23 2026): it rests on bodas.com.mx catering fields
// nobody can vouch for. It stays visible as information until venues answer in writing.
export const TOP_N = 20;
export const SCORE_KEYS = ["setting", "cost", "beds", "access"];

export function cardAmount(card, n) {
  if (!card || !card.on || card.unit === "none") return 0;
  const q = card.qty == null || card.qty === "" ? 1 : +card.qty;
  if (card.unit === "guest") return Math.round(card.rate * n * q);
  return Math.round(card.rate * q);
}

export function priceVenue(v, cfg, n, state) {
  if (!v.rows) return null;
  const cards = cfg.vision;
  const byKey = new Map();
  for (const c of cards) if (c.key && !byKey.has(c.key)) byKey.set(c.key, c);
  const t = (n - 60) / 10;
  const lines = [];
  const seen = new Set();
  const quote = state && state.quote > 0 ? +state.quote : 0;

  for (const [label, a60, a70, firm, note, cat] of v.rows) {
    if (cat === "contingency") continue;
    if (STD_KEYS.includes(cat)) {
      seen.add(cat);
      const c = byKey.get(cat);
      if (!c || !c.on) { lines.push({ label: c ? c.title : label, cat, amt: 0, kind: "off" }); continue; }
      lines.push({ label: c.title, detail: c.text, cat, amt: cardAmount(c, n), kind: "vision", card: c.id });
      continue;
    }
    const amt = Math.max(0, Math.round(a60 + (a70 - a60) * t));
    const kind = firm ? "quote" : RULE_KEYS.includes(cat) ? "rule" : "venue";
    lines.push({ label, note, cat, amt, kind, firm: !!firm, perGuest: a60 !== a70 });
  }
  // standard lines this venue already covers (a package, a house menu, an all-in quote)
  for (const c of cards) {
    if (c.key && STD_KEYS.includes(c.key) && !seen.has(c.key) && c.on) lines.push({ label: c.title, cat: c.key, amt: 0, kind: "included" });
  }
  // add-ons from the vision that have no atlas equivalent
  for (const c of cards) {
    if (!c.key && c.on && c.unit !== "none" && +c.rate > 0) lines.push({ label: c.title, detail: c.text, cat: c.cat, amt: cardAmount(c, n), kind: "vision", card: c.id, addon: true });
  }
  // a quote the couple entered replaces the venue's own lines
  if (quote) {
    for (const l of lines) if (l.kind === "venue" || l.kind === "quote") { l.replaced = l.amt; l.amt = 0; l.kind = "replaced"; }
    lines.unshift({ label: "Your quote for the venue", cat: "venue", amt: Math.round(quote), kind: "quote", firm: true, mine: true });
  }
  const est = lines.reduce((s, l) => s + (l.firm ? 0 : l.amt), 0);
  const cont = (est * cfg.contingency) / 100; // kept unrounded in the total, as the atlas did
  const mxn = lines.reduce((s, l) => s + l.amt, 0) + cont;
  lines.push({ label: `Contingency, ${cfg.contingency}% of estimated lines`, cat: "contingency", amt: Math.round(cont), kind: "contingency" });
  const usd = Math.round(mxn / cfg.fx);

  const w = cfg.weekend;
  const welcome = w.welcome.on ? w.welcome.pp * n : 0;
  const brunch = w.brunch.on ? w.brunch.pp * n : 0;
  const rooms = w.rooms.on ? ((v.rooms_usd || 0) * (w.rooms.count * w.rooms.nights)) / 12 : 0;
  const flights = w.flights.on ? +w.flights.usd || 0 : 0;
  const weekendUsd = Math.round(usd + (welcome + brunch) / cfg.fx + rooms + flights);
  const weekendMxn = Math.round(mxn + welcome + brunch + (rooms + flights) * cfg.fx);
  return { n, lines, mxn: Math.round(mxn), usd, est, cont: Math.round(cont), welcome, brunch, roomsUsd: Math.round(rooms), flightsUsd: flights, weekendUsd, weekendMxn };
}

export function costScore(usd, target, ceiling) {
  const k = usd / 1000, T = target / 1000, C = ceiling / 1000, M = (T + C) / 2;
  if (k <= T) return 5;
  if (k <= M) return 5 - (2.5 * (k - T)) / (M - T);
  if (k <= C) return 2.5 - (2 * (k - M)) / (C - M);
  return 0;
}

export function bedsScore(beds, n) {
  return Math.min(5, ((beds || 0) / n) * 5);
}

const r2 = (x) => Math.round(x * 100) / 100;

export function endLabel(h) {
  if (h == null) return "Not stated";
  if (h === 99) return "No limit";
  return `${h} a.m.`;
}

// Evaluate every venue against the config: prices at the planning, low and high guest
// counts, live scores, status and rank. Returns a Map key → result.
export function evaluate(venues, cfg, store = {}) {
  const W = cfg.weights;
  const wsum = SCORE_KEYS.reduce((s, k) => s + (+W[k] || 0), 0) || 1;
  const out = new Map();
  const viable = [];
  for (const v of venues) {
    const st = store[v.key] || {};
    const res = { v, st, status: v.status, why: v.reason || "" };
    if (v.rows) {
      res.plan = priceVenue(v, cfg, cfg.guests.plan, st);
      res.low = priceVenue(v, cfg, cfg.guests.low, st);
      res.high = priceVenue(v, cfg, cfg.guests.high, st);
      const s = Object.assign({}, v.scores);
      s.beds = r2(bedsScore(v.beds, cfg.guests.plan));
      s.cost = r2(costScore(res.plan.usd, cfg.budget.target, cfg.budget.ceiling));
      res.scores = s;
      res.fit = SCORE_KEYS.reduce((acc, k) => acc + (s[k] || 0) * (+W[k] || 0), 0) / wsum;
    } else if (v.scores) {
      res.scores = v.scores;
    }
    if (v.status === "out" || v.custom === "out") {
      res.status = "out";
    } else if (!v.rows && v.status === "over") {
      res.status = "over"; // priced by email, not in the atlas tables
      res.why = v.reason || "";
    } else if (!v.rows) {
      res.status = "wild";
      res.why = v.reason || "Not priced yet. Ask for a quote.";
    } else if (res.high.usd > cfg.budget.ceiling) {
      res.status = "over";
      res.why = `Wedding day at ${cfg.guests.high} guests comes to $${(res.high.usd / 1000).toFixed(1)}k, over your $${Math.round(cfg.budget.ceiling / 1000)}k ceiling.`;
    } else if (cfg.minEnd > 1 && v.end_h != null && v.end_h !== 99 && v.end_h < cfg.minEnd) {
      res.status = "out";
      res.soft = true;
      res.why = `The party has to end at ${endLabel(v.end_h)}, before your ${cfg.minEnd} a.m. minimum.`;
    } else if (cfg.minBeds > 0 && (v.beds || 0) < cfg.minBeds) {
      res.status = "out";
      res.soft = true;
      res.why = `Sleeps ${v.beds || 0} on site; your minimum is ${cfg.minBeds}.`;
    } else if (cfg.needTaq && !(v.taq_label === "Yes" || v.taq_label === "Likely")) {
      res.status = "out";
      res.soft = true;
      res.why = `Outside taqueros: ${v.taq_label || "unclear"}. You've asked for venues that allow your own.`;
    } else {
      res.status = "fit";
      viable.push(res);
    }
    out.set(v.key, res);
  }
  // ties (scores are rounded to 2 places) fall back to the atlas's own order
  viable.sort((a, b) => b.fit - a.fit || (a.v.rank || 999) - (b.v.rank || 999) || a.v.short.localeCompare(b.v.short));
  let top = 0;
  viable.forEach((r, i) => {
    r.fitRank = i + 1;
    if (top < TOP_N && (r.scores.setting || 0) >= 4) { top++; r.status = "top"; r.top = top; }
  });
  // one sequence for display: the top 20 are 1-20, everyone else follows from 21 by fit
  let next = top;
  viable.forEach((r) => { r.rank = r.top || ++next; });
  return { results: out, viableCount: viable.length };
}
