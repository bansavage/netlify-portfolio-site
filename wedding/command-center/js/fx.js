// The exchange rate. "Live" pulls today's MXN per US$ from public feeds (no key, open to
// browsers), trying each in turn; "Atlas" is the 18.45 the atlas priced everything at;
// "My rate" is whatever the couple types. Prices are stored in their own currency
// (venue lines and vendors in pesos, the budget in dollars) and converted at this rate.

export const ATLAS_FX = 18.45;
const MAX_AGE_MS = 3 * 60 * 60 * 1000;

const FEEDS = [
  { name: "ExchangeRate-API", url: "https://open.er-api.com/v6/latest/USD", pick: (d) => d && d.result === "success" && d.rates && { rate: d.rates.MXN, asOf: d.time_last_update_utc } },
  { name: "European Central Bank, via Frankfurter", url: "https://api.frankfurter.dev/v1/latest?from=USD&to=MXN", pick: (d) => d && d.rates && { rate: d.rates.MXN, asOf: d.date } },
  { name: "currency-api on jsDelivr", url: "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json", pick: (d) => d && d.usd && { rate: d.usd.mxn, asOf: d.date } },
];

export async function fetchLiveFx() {
  for (const f of FEEDS) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 7000);
    try {
      const r = await fetch(f.url, { signal: ctl.signal, cache: "no-store" });
      if (!r.ok) continue;
      const v = f.pick(await r.json());
      if (v && v.rate > 5 && v.rate < 60) return { rate: Math.round(v.rate * 10000) / 10000, asOf: v.asOf || "", source: f.name, fetched: new Date().toISOString() };
    } catch (e) {
      /* this feed is down or blocked: try the next */
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("None of the rate feeds answered.");
}

export function effectiveFx(cfg) {
  if (cfg.fxMode === "atlas") return ATLAS_FX;
  if (cfg.fxMode === "manual") return +cfg.fxManual > 0 ? +cfg.fxManual : ATLAS_FX;
  return cfg.fxLive && cfg.fxLive.rate > 0 ? cfg.fxLive.rate : ATLAS_FX;
}

export function liveIsStale(cfg) {
  return !cfg.fxLive || !cfg.fxLive.fetched || Date.now() - new Date(cfg.fxLive.fetched).getTime() > MAX_AGE_MS;
}

export function fxSourceText(cfg) {
  if (cfg.fxMode === "atlas") return "The atlas's rate (Banxico fixed 18.49 on Oct 16, 2026).";
  if (cfg.fxMode === "manual") return "Your own rate.";
  if (!cfg.fxLive) return "Fetching today's rate… (using the atlas's 18.45 until it arrives)";
  const when = cfg.fxLive.asOf ? String(cfg.fxLive.asOf).replace(/ \d\d:\d\d:\d\d \+0000$/, "") : "";
  return `Live from ${cfg.fxLive.source}${when ? `, rate of ${when}` : ""}. Checked ${new Date(cfg.fxLive.fetched).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.`;
}
