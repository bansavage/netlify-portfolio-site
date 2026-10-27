// Small shared helpers: escaping, number formats, icons.

export const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const k = (usd) => "$" + (usd / 1000).toFixed(1) + "k";
// Blue check beside prices built from a venue's own reply and figures (inbox rows).
export const vbadge = (v) => (v && v.verified ? `<span class="vbadge" title="Verified: priced from the venue's own reply" aria-label="Verified price"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="8"/><path d="M4.6 8.3l2.2 2.2 4.6-4.8"/></svg></span>` : "");
export const kMXN = (n) => "MXN " + (n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e5 ? Math.round(n / 1000) + "k" : (n / 1000).toFixed(1) + "k");
export const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");
export const mxn = (n) => "MXN " + Math.round(n).toLocaleString("en-US");
export const num = (n) => Math.round(n).toLocaleString("en-US");
export const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// Google Maps search for the venue by name and town (pins in the data sit at town level)
export const gmapsURL = (v) => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(`${v.name.replace(/\s*\(.*\)\s*$/, "")}, ${v.town || ""}, ${v.state || ""}, México`);

export function debounce(fn, ms) {
  let t = null;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function driveTxt(min) {
  if (!min) return "";
  const h = Math.floor(min / 60), m = Math.round((min % 60) / 5) * 5;
  return h ? `${h} h${m ? " " + m + " min" : ""}` : `${m} min`;
}

export function copyText(text) {
  const fallback = () => {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { /* left selected for a manual copy */ }
    ta.remove();
    return ok ? Promise.resolve() : Promise.reject(new Error("copy failed"));
  };
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).catch(fallback);
  return fallback();
}

let toastTimer = null;
export function toast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

const svg = (d, extra = "") => `<svg viewBox="0 0 24 24" aria-hidden="true" ${extra}>${d}</svg>`;
export const ICON = {
  overview: svg('<path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 4v4h6V4z"/>'),
  brief: svg('<path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4M10 12h6M10 16h6"/>'),
  venues: svg('<path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6"/>'),
  map: svg('<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>'),
  vendors: svg('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20c.6-3.4 2.8-5.5 5.5-5.5s4.9 2.1 5.5 5.5"/><path d="M16 5.2a3 3 0 0 1 0 5.6M17.5 14.8c1.7.7 2.8 2.5 3 5.2"/>'),
  norte: svg('<path d="M2 19h20L15 7l-3.5 5L9 9z"/><path d="M13.2 9.6 15 7l2 3.2"/>'),
  budget: svg('<path d="M4 7h16v12H4z"/><path d="M4 11h16M8 15h3"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  left: svg('<path d="M15 6l-6 6 6 6"/>'),
  right: svg('<path d="M9 6l6 6-6 6"/>'),
  up: svg('<path d="M6 15l6-6 6 6"/>'),
  down: svg('<path d="M6 9l6 6 6-6"/>'),
  star: svg('<path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  minus: svg('<path d="M5 12h14"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: svg('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'),
  menu: svg('<circle cx="12" cy="5.5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="18.5" r="1.4"/>'),
  fit: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  list: svg('<path d="M4 6h16M4 12h16M4 18h10"/>'),
  grid: svg('<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>'),
  table: svg('<path d="M3 5h18v14H3zM3 10h18M3 15h18M9 5v14"/>'),
  pin: svg('<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
  link: svg('<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>'),
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  download: svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  upload: svg('<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>'),
  reset: svg('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v5h5"/>'),
  plane: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/></svg>',
  spark: svg('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
};

// six-colour papel picado banner, drawn to fit any width
export const FEST = ["#E0387E", "#2B4FC4", "#F2A33C", "#B8D430", "#C4562F", "#6E7A3A"];
export function picado(el, { w = 600, h = 24, n = 22, line = "currentColor" } = {}) {
  const f = (x) => Math.round(x * 10) / 10;
  let s = `<path d="M0 2 H ${w}" stroke="${line}" stroke-width="1" opacity=".55"/>`;
  for (let i = 0; i < n; i++) {
    const x = (w / n) * i, fw = w / n - 3, c = FEST[i % FEST.length];
    let d = `M${f(x + 1.5)} 2 L ${f(x + 1.5 + fw)} 2 L ${f(x + 1.5 + fw)} ${h - 8}`;
    for (let z = 6; z >= 0; z--) d += ` L ${f(x + 1.5 + (fw / 6) * z)} ${z % 2 ? h - 4 : h - 8}`;
    s += `<path d="${d} Z" fill="${c}"/><circle cx="${f(x + 1.5 + fw / 2)}" cy="${f((h - 6) / 2.4)}" r="2" fill="var(--bg)" opacity=".9"/>`;
  }
  el.setAttribute("viewBox", `0 0 ${w} ${h}`);
  el.setAttribute("preserveAspectRatio", "none");
  el.innerHTML = s;
}

// Two linked boxes for one amount: type in either currency and the other follows at the
// current rate. `canon` is the currency the amount is stored in.
const inVal = (v, cur) => (cur === "mxn" ? String(Math.round(v)) : String(Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100));
export function moneyPair({ id, value, canon = "mxn", fx, label = "", compact = false, name = "" }) {
  const blank = value === "" || value == null;
  const v = +value || 0;
  const m = canon === "mxn" ? v : v * fx, u = canon === "usd" ? v : v / fx;
  return `<span class="money-pair${compact ? " compact" : ""}" data-mp="${esc(id)}" data-canon="${canon}">` +
    `<label class="mp"><i>MXN</i><input class="inp num" type="number" inputmode="decimal" min="0" step="any" data-cur="mxn"${name ? ` name="${name}"` : ""} value="${blank ? "" : inVal(m, "mxn")}" aria-label="${esc(label)} in pesos"></label>` +
    `<label class="mp"><i>US$</i><input class="inp num" type="number" inputmode="decimal" min="0" step="any" data-cur="usd" value="${blank ? "" : inVal(u, "usd")}" aria-label="${esc(label)} in dollars"></label></span>`;
}
export function wireMoneyPairs(root, getFx, onCommit) {
  root.addEventListener("input", (e) => {
    const inp = e.target.closest(".money-pair [data-cur]");
    if (!inp) return;
    const pair = inp.closest(".money-pair"), v = parseFloat(inp.value), fx = getFx();
    const other = pair.querySelector(`[data-cur="${inp.dataset.cur === "mxn" ? "usd" : "mxn"}"]`);
    other.value = isFinite(v) ? (inp.dataset.cur === "mxn" ? inVal(v / fx, "usd") : inVal(v * fx, "mxn")) : "";
  });
  root.addEventListener("change", (e) => {
    const inp = e.target.closest(".money-pair [data-cur]");
    if (!inp || !onCommit) return;
    const pair = inp.closest(".money-pair"), fx = getFx(), canon = pair.dataset.canon;
    let v = parseFloat(inp.value);
    if (!isFinite(v) || v < 0) v = 0;
    const val = inp.dataset.cur === canon ? v : canon === "mxn" ? v * fx : v / fx;
    onCommit(pair.dataset.mp, canon === "mxn" ? Math.round(val) : Math.round(val * 100) / 100);
  });
}
// after the rate (or a stored amount) changes, redraw both boxes, leaving alone the one being typed in
export function syncMoneyPairs(root, fx, valueOf) {
  root.querySelectorAll(".money-pair").forEach((pair) => {
    const v = valueOf(pair.dataset.mp);
    if (v == null || v === "") return;
    const canon = pair.dataset.canon, m = canon === "mxn" ? v : v * fx, u = canon === "usd" ? v : v / fx;
    const im = pair.querySelector('[data-cur="mxn"]'), iu = pair.querySelector('[data-cur="usd"]');
    if (document.activeElement !== im) im.value = inVal(m, "mxn");
    if (document.activeElement !== iu) iu.value = inVal(u, "usd");
  });
}
