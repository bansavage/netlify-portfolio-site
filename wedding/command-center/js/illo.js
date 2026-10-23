// Generated drawings of each venue's type of setting (not photos), seeded by the venue key
// so a venue always gets the same picture. Ported from the atlas map; the papel picado
// strings now use the wedding's six-colour palette.

import { esc, FEST } from "./util.js";

let uid = 0;
const PAL = {
  hacienda: { sky: ["#f2b386", "#fde6c8"], far: "#e7c29a", ground: "#c7a273" },
  colonial_city: { sky: ["#e2a2b2", "#fbe1d3"], far: "#e3bcb5", ground: "#b49d86" },
  beach: { sky: ["#74c1e3", "#e2f3f7"], far: "#b6e0ee", ground: "#ead6ad" },
  lagoon: { sky: ["#8ccde4", "#eef8f6"], far: "#9fd5cf", ground: "#d6cda6" },
  cenote: { sky: ["#96c4ad", "#e5f0e4"], far: "#bcd6bb", ground: "#a59e78" },
  vineyard: { sky: ["#b49fd2", "#f4dfcf"], far: "#c7b2c4", ground: "#8a9d63" },
  forest_lake: { sky: ["#96b6d2", "#e8eff3"], far: "#adc0cf", ground: "#6b8b64" },
  jungle: { sky: ["#95c19e", "#e2eedd"], far: "#a9c9a9", ground: "#4b7449" },
  desert_ranch: { sky: ["#ec9568", "#fcd9bb"], far: "#e3aa80", ground: "#d6a067" },
  mountain_town: { sky: ["#a2b3cb", "#ebecef"], far: "#bcc6d2", ground: "#87977a" },
  garden_estate: { sky: ["#544a82", "#e0a693"], far: "#8f7c9e", ground: "#617f52" },
  modern_retreat: { sky: ["#b8cbd4", "#f0f2f0"], far: "#cdd8dc", ground: "#cbc1ae" },
};
const WALLS = ["#c24f37", "#cf9433", "#e9dac4", "#b45f39", "#d6744d", "#dfbd72", "#8f4a3a"];
const PASTEL = ["#e3a06f", "#78acc4", "#e2bd55", "#d46f88", "#93c793", "#c9a2d8", "#e8d6b5"];

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];
const f = (n) => Math.round(n * 10) / 10;

function hills(r, y, amp, color, w) { let d = `M0 ${y}`; const n = 5; for (let i = 0; i <= n; i++) { const x = (w / n) * i; const yy = y - amp * (0.4 + r() * 0.8); d += ` Q ${f(x - w / n / 2)} ${f(yy - amp * 0.6)} ${f(x)} ${f(yy)}`; } return `<path d="${d} L ${w} 200 L 0 200 Z" fill="${color}"/>`; }
function palm(x, y, s, c = "#2f5d3a") { const t = `<path d="M${x} ${y} q ${f(4 * s)} ${f(-22 * s)} ${f(-2 * s)} ${f(-46 * s)}" stroke="#7a5a3a" stroke-width="${f(3.2 * s)}" fill="none" stroke-linecap="round"/>`; const tx = x - 2 * s, ty = y - 46 * s; let fr = ""; [[-26, 6], [-18, -6], [0, -12], [18, -6], [26, 6], [12, 10], [-12, 10]].forEach(([dx, dy]) => { fr += `<path d="M${f(tx)} ${f(ty)} q ${f(dx * s * 0.5)} ${f((dy - 10) * s * 0.5)} ${f(dx * s)} ${f(dy * s)}" stroke="${c}" stroke-width="${f(4 * s)}" fill="none" stroke-linecap="round"/>`; }); return t + fr; }
function agave(x, y, s, c = "#5f8f7a") { let p = ""; [-60, -35, -12, 12, 35, 60, -80, 80].forEach((a) => { const rad = ((a - 90) * Math.PI) / 180; const len = (a % 2 ? 16 : 20) * s; const ex = x + Math.cos(rad) * len, ey = y + Math.sin(rad) * len; const nx = Math.cos(rad + Math.PI / 2) * 2.4 * s, ny = Math.sin(rad + Math.PI / 2) * 2.4 * s; p += `<path d="M${f(x - nx)} ${f(y - ny)} L ${f(ex)} ${f(ey)} L ${f(x + nx)} ${f(y + ny)} Z" fill="${c}"/>`; }); return p; }
function pine(x, y, s, c = "#2e5a43") { return `<path d="M${x} ${f(y - 34 * s)} L ${f(x + 10 * s)} ${f(y - 12 * s)} L ${f(x + 5 * s)} ${f(y - 12 * s)} L ${f(x + 13 * s)} ${y} L ${f(x - 13 * s)} ${y} L ${f(x - 5 * s)} ${f(y - 12 * s)} L ${f(x - 10 * s)} ${f(y - 12 * s)} Z" fill="${c}"/>`; }
function cactus(x, y, s, c = "#4e7d4f") { return `<g fill="${c}"><rect x="${f(x - 3 * s)}" y="${f(y - 34 * s)}" width="${f(6 * s)}" height="${f(34 * s)}" rx="${f(3 * s)}"/><rect x="${f(x - 11 * s)}" y="${f(y - 24 * s)}" width="${f(5 * s)}" height="${f(14 * s)}" rx="${f(2.5 * s)}"/><rect x="${f(x - 11 * s)}" y="${f(y - 13 * s)}" width="${f(10 * s)}" height="${f(4 * s)}" rx="${f(2 * s)}"/><rect x="${f(x + 6 * s)}" y="${f(y - 28 * s)}" width="${f(5 * s)}" height="${f(14 * s)}" rx="${f(2.5 * s)}"/><rect x="${f(x + 1 * s)}" y="${f(y - 17 * s)}" width="${f(10 * s)}" height="${f(4 * s)}" rx="${f(2 * s)}"/></g>`; }
function arches(x, y, w, h, n, wall, dark) { let s = `<rect x="${f(x)}" y="${f(y - h)}" width="${f(w)}" height="${f(h)}" fill="${wall}"/>`; s += `<rect x="${f(x - 3)}" y="${f(y - h - 4)}" width="${f(w + 6)}" height="5" fill="${wall}" opacity=".9"/>`; const gap = w / n; for (let i = 0; i < n; i++) { const ax = x + gap * i + gap * 0.18, aw = gap * 0.64, ah = h * 0.62; s += `<path d="M${f(ax)} ${f(y)} L ${f(ax)} ${f(y - ah + aw / 2)} A ${f(aw / 2)} ${f(aw / 2)} 0 0 1 ${f(ax + aw)} ${f(y - ah + aw / 2)} L ${f(ax + aw)} ${f(y)} Z" fill="${dark}"/>`; } return s; }
function espadana(x, y, wall, dark) { return `<path d="M${x - 16} ${y} L ${x - 16} ${y - 18} L ${x - 9} ${y - 18} L ${x - 9} ${y - 27} L ${x} ${y - 36} L ${x + 9} ${y - 27} L ${x + 9} ${y - 18} L ${x + 16} ${y - 18} L ${x + 16} ${y} Z" fill="${wall}"/><path d="M${x - 4} ${y - 14} v -6 a 4 4 0 0 1 8 0 v 6 Z" fill="${dark}"/><circle cx="${x}" cy="${y - 27}" r="2.4" fill="${dark}"/>`; }
function picado(r, w, top) { let s = `<path d="M-4 ${top} Q ${w / 2} ${top + 14} ${w + 4} ${top}" stroke="#5b4a3a" stroke-width="1" fill="none" opacity=".7"/>`; const n = 9; for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; const x = t * w; const y = top + 14 * t * (1 - t) * 2 + 1; const c = FEST[(i + Math.floor(r() * 3)) % FEST.length]; const fw = 18, fh = 20; let d = `M${f(x - fw / 2)} ${f(y)} L ${f(x + fw / 2)} ${f(y)} L ${f(x + fw / 2)} ${f(y + fh)}`; for (let z = 6; z >= 0; z--) d += ` L ${f(x - fw / 2 + (fw / 6) * z)} ${f(y + fh - (z % 2 ? 3 : 0))}`; s += `<path d="${d} Z" fill="${c}" opacity=".92"/><circle cx="${f(x)}" cy="${f(y + 7)}" r="2.6" fill="#fff" opacity=".55"/><path d="M${f(x - 5)} ${f(y + 13)} h 10" stroke="#fff" stroke-width="1.6" opacity=".45"/>`; } return s; }

function scene(type, m, r, w, h, P) {
  const gy = h - 30; let s = "";
  const wall = pick(r, WALLS), dark = "rgba(40,24,16,.55)";
  const fgLeft = () => (m.has("agave") ? agave(26, gy + 18, 1.1) + agave(56, gy + 22, 0.8) : m.has("palms") ? palm(30, gy + 20, 1.05) : "");
  const fgRight = () => (m.has("palms") ? palm(w - 28, gy + 22, 0.95) : m.has("agave") ? agave(w - 34, gy + 20, 1) : m.has("pines") ? pine(w - 26, gy + 20, 1.2) : "");
  switch (type) {
    case "colonial_city": {
      let x = 10; while (x < w - 10) { const bw = 30 + r() * 26, bh = 34 + r() * 30, c = pick(r, PASTEL); s += `<rect x="${f(x)}" y="${f(gy - bh)}" width="${f(bw)}" height="${f(bh + 30)}" fill="${c}"/>`; for (let wx = x + 6; wx < x + bw - 8; wx += 11) s += `<rect x="${f(wx)}" y="${f(gy - bh + 10)}" width="5" height="9" rx="2" fill="${dark}"/>`; x += bw + 1; }
      const cx = w * (0.35 + r() * 0.3); s += `<rect x="${f(cx - 10)}" y="${gy - 86}" width="20" height="58" fill="#e8d7bd"/><path d="M${f(cx - 10)} ${gy - 86} q 10 -16 20 0" fill="#d9b25b"/><rect x="${f(cx - 2)}" y="${gy - 104}" width="4" height="12" fill="#d9b25b"/>`;
      s += `<path d="M${f(cx + 30)} ${gy - 58} a 22 22 0 0 1 44 0 Z" fill="#c9893d"/><rect x="${f(cx + 49)}" y="${gy - 88}" width="6" height="12" fill="#c9893d"/>`;
      if (m.has("aqueduct")) s += arches(0, gy - 6, w, 26, 9, "#d8c5a6", dark);
      if (m.has("bullring")) s += `<ellipse cx="${f(w * 0.78)}" cy="${gy - 10}" rx="44" ry="13" fill="#d8b98f"/><ellipse cx="${f(w * 0.78)}" cy="${gy - 13}" rx="34" ry="8" fill="#b88f5f"/>`;
      break;
    }
    case "beach": {
      s += `<rect x="0" y="${gy - 18}" width="${w}" height="26" fill="#3aa6c9"/><rect x="0" y="${gy - 8}" width="${w}" height="10" fill="#6cc8dd" opacity=".8"/>`;
      s += `<path d="M0 ${gy + 2} Q ${w / 2} ${gy - 8} ${w} ${gy + 4} L ${w} ${h} L 0 ${h} Z" fill="${P.ground}"/>`;
      s += `<path d="M${w * 0.55} ${gy - 6} l 26 -16 l 26 16 Z" fill="#b98a4c"/><rect x="${w * 0.55 + 4}" y="${gy - 6}" width="2.4" height="18" fill="#7a5a3a"/><rect x="${w * 0.55 + 44}" y="${gy - 6}" width="2.4" height="18" fill="#7a5a3a"/>`;
      s += palm(36, gy + 22, 1.15) + palm(w - 40, gy + 20, 0.9);
      if (m.has("cliffs")) s += `<path d="M${w - 90} ${gy - 18} l 20 -30 l 34 -6 l 36 22 l 0 14 Z" fill="#a07a5a"/>`;
      return s;
    }
    case "lagoon": {
      ["#2e9fc0", "#3fbfca", "#71d6d2", "#a9e7de"].forEach((c, i) => { s += `<rect x="0" y="${f(gy - 26 + i * 9)}" width="${w}" height="10" fill="${c}"/>`; });
      s += `<rect x="0" y="${gy - 30}" width="${w}" height="5" fill="#4f7a49"/>`;
      s += `<path d="M0 ${gy + 10} Q ${w * 0.3} ${gy + 2} ${w * 0.5} ${gy + 14} L ${w * 0.5} ${h} L 0 ${h} Z" fill="${P.ground}"/>`;
      const dx = w * 0.42; s += `<rect x="${f(dx)}" y="${gy + 4}" width="${f(w * 0.42)}" height="4" fill="#8b6a46"/>`; for (let i = 0; i < 6; i++) s += `<rect x="${f(dx + 8 + i * 22)}" y="${gy + 6}" width="2" height="9" fill="#6b4f33"/>`;
      s += `<path d="M${f(dx + w * 0.42 - 26)} ${gy + 2} l 16 -14 l 16 14 Z" fill="#b98a4c"/>`;
      s += palm(28, gy + 26, 1);
      return s;
    }
    case "cenote": {
      s += `<ellipse cx="${w / 2}" cy="${gy + 6}" rx="${w * 0.36}" ry="22" fill="#6a5a44"/><ellipse cx="${w / 2}" cy="${gy + 9}" rx="${w * 0.31}" ry="15" fill="#1f8aa6"/><ellipse cx="${w / 2 - 14}" cy="${gy + 7}" rx="${w * 0.13}" ry="4" fill="#7fd3e0" opacity=".7"/>`;
      for (let i = 0; i < 7; i++) { const x = w * 0.2 + i * w * 0.1; s += `<path d="M${f(x)} ${gy - 12} q ${f(-4 + r() * 8)} 14 ${f(-2 + r() * 4)} ${f(16 + r() * 10)}" stroke="#3f6b3c" stroke-width="1.6" fill="none"/>`; }
      s += arches(w * 0.62, gy - 14, 92, 26, 4, wall, dark);
      break;
    }
    case "vineyard": {
      s += hills(r, gy - 6, 14, "#9cb07a", w);
      for (let i = 0; i < 9; i++) { const x0 = -40 + (i * (w + 80)) / 8; s += `<path d="M${f(x0)} ${h} L ${f(w / 2 + (x0 - w / 2) * 0.18)} ${gy - 8}" stroke="#5d7a3c" stroke-width="${f(4 - (i % 2))}" opacity=".9"/>`; }
      s += `<rect x="${f(w * 0.62)}" y="${gy - 30}" width="46" height="20" fill="${pick(r, ["#e9dac4", "#d9b98a"])}"/><path d="M${f(w * 0.62 - 3)} ${gy - 30} l 26 -12 l 26 12 Z" fill="#a8553b"/>`;
      break;
    }
    case "forest_lake": {
      s += `<path d="M0 ${gy - 18} L ${w * 0.22} ${gy - 70} L ${w * 0.42} ${gy - 22} L ${w * 0.6} ${gy - 58} L ${w * 0.85} ${gy - 20} L ${w} ${gy - 40} L ${w} ${gy} L 0 ${gy} Z" fill="${P.far}"/>`;
      s += `<rect x="0" y="${gy - 10}" width="${w}" height="22" fill="#5a8fb0"/><rect x="${w * 0.2}" y="${gy - 4}" width="${w * 0.5}" height="2" fill="#cfe3ee" opacity=".7"/>`;
      for (let i = 0; i < 9; i++) s += pine(10 + i * 14 + r() * 6, gy + 18 + r() * 6, 0.8 + r() * 0.5);
      for (let i = 0; i < 5; i++) s += pine(w - 12 - i * 16 - r() * 6, gy + 18 + r() * 6, 0.8 + r() * 0.5);
      return s;
    }
    case "jungle": {
      s += `<path d="M${w * 0.36} ${gy} L ${w * 0.41} ${gy - 16} L ${w * 0.45} ${gy - 16} L ${w * 0.48} ${gy - 32} L ${w * 0.52} ${gy - 32} L ${w * 0.55} ${gy - 16} L ${w * 0.59} ${gy - 16} L ${w * 0.64} ${gy} Z" fill="#9c9278"/><rect x="${w * 0.485}" y="${gy - 42}" width="${w * 0.03}" height="10" fill="#8a8068"/>`;
      for (let i = 0; i < 16; i++) { const x = r() * w, y = gy - 6 + r() * 30, rr = 10 + r() * 16; s += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rr)}" ry="${f(rr * 0.6)}" fill="${pick(r, ["#3d6b3f", "#4f8248", "#2f5a36", "#5f9653"])}"/>`; }
      return s;
    }
    case "desert_ranch": {
      s += `<path d="M${w * 0.05} ${gy - 8} L ${w * 0.1} ${gy - 40} L ${w * 0.32} ${gy - 40} L ${w * 0.38} ${gy - 8} Z" fill="#c9805a"/><path d="M${w * 0.62} ${gy - 8} L ${w * 0.66} ${gy - 28} L ${w * 0.86} ${gy - 28} L ${w * 0.92} ${gy - 8} Z" fill="#d4906a"/>`;
      s += `<rect x="${w * 0.42}" y="${gy - 24}" width="58" height="22" fill="#e6d2b1"/><rect x="${w * 0.42 - 3}" y="${gy - 27}" width="64" height="4" fill="#9b6b43"/><rect x="${w * 0.42 + 10}" y="${gy - 16}" width="8" height="14" fill="${dark}"/><rect x="${w * 0.42 + 36}" y="${gy - 18}" width="10" height="8" fill="${dark}"/>`;
      s += cactus(40, gy + 20, 1.05) + cactus(w - 36, gy + 18, 0.8);
      break;
    }
    case "mountain_town": {
      s += `<path d="M0 ${gy + 6} L ${w * 0.5} ${gy - 70} L ${w} ${gy + 6} Z" fill="${P.far}"/>`;
      for (let i = 0; i < 14; i++) { const t = r(), x = w * (0.18 + t * 0.64), y = gy + 4 - (1 - Math.abs(t - 0.5) * 2) * 60 * r(); const c = pick(r, PASTEL); s += `<rect x="${f(x)}" y="${f(y - 12)}" width="16" height="12" fill="${c}"/><path d="M${f(x - 1)} ${f(y - 12)} l 9 -6 l 9 6 Z" fill="#a8553b"/>`; }
      s += `<rect x="${w * 0.5 - 6}" y="${gy - 92}" width="12" height="26" fill="#e7d5bb"/><path d="M${w * 0.5 - 6} ${gy - 92} l 6 -10 l 6 10 Z" fill="#c9893d"/>`;
      break;
    }
    case "garden_estate": {
      for (let i = 0; i < 6; i++) { const x = 20 + (i * (w - 40)) / 5 + r() * 10; s += `<rect x="${f(x - 1.5)}" y="${gy - 20}" width="3" height="22" fill="#5a4632"/><circle cx="${f(x)}" cy="${gy - 28}" r="${f(13 + r() * 7)}" fill="${pick(r, ["#3f6a40", "#4d7c46", "#365e3b"])}"/>`; }
      s += `<rect x="${w * 0.36}" y="${gy - 18}" width="${w * 0.28}" height="3" fill="#7b5d3e"/><rect x="${w * 0.36}" y="${gy - 18}" width="3" height="20" fill="#7b5d3e"/><rect x="${w * 0.64 - 3}" y="${gy - 18}" width="3" height="20" fill="#7b5d3e"/>`;
      let lights = `<path d="M0 ${gy - 44} Q ${w / 2} ${gy - 16} ${w} ${gy - 44}" stroke="#f6e3b0" stroke-width="1" fill="none" opacity=".8"/>`; for (let i = 1; i < 14; i++) { const t = i / 14; const y = gy - 44 + 28 * 4 * t * (1 - t) * 0.5; lights += `<circle cx="${f(t * w)}" cy="${f(y + 2)}" r="2.2" fill="#ffe7a6"/>`; } s += lights;
      break;
    }
    case "modern_retreat": {
      s += `<rect x="${w * 0.2}" y="${gy - 34}" width="${w * 0.34}" height="34" fill="#d8d3c8"/><rect x="${w * 0.46}" y="${gy - 22}" width="${w * 0.3}" height="22" fill="#c7c1b4"/><rect x="${w * 0.24}" y="${gy - 26}" width="${w * 0.12}" height="16" fill="#5c6a70"/><rect x="${w * 0.5}" y="${gy - 16}" width="${w * 0.16}" height="10" fill="#5c6a70"/>`;
      s += `<rect x="${w * 0.24}" y="${gy + 6}" width="${w * 0.5}" height="9" fill="#5fc0d6"/>`;
      s += palm(30, gy + 22, 1) + palm(w - 30, gy + 24, 0.9);
      return s;
    }
    default: {
      const bx = w * (0.14 + r() * 0.06), bw = w * (0.6 + r() * 0.12), n = 5 + Math.floor(r() * 3);
      s += arches(bx, gy, bw, 40 + r() * 8, n, wall, dark);
      if (m.has("chimney") || r() < 0.35) { const cx = bx + bw + 14; s += `<rect x="${f(cx)}" y="${gy - 86}" width="9" height="86" fill="${wall}"/><rect x="${f(cx - 2)}" y="${gy - 90}" width="13" height="5" fill="${wall}"/>`; }
      if (m.has("chapel") || r() < 0.4) s += espadana(f(bx + bw * 0.22), gy - 44, wall, dark);
    }
  }
  if (m.has("volcano") && type !== "forest_lake") s = `<path d="M${w * 0.5} ${gy - 30} L ${w * 0.68} ${gy - 92} L ${w * 0.74} ${gy - 92} L ${w * 0.92} ${gy - 30} Z" fill="${P.far}" opacity=".95"/><path d="M${w * 0.71} ${gy - 96} q 6 -10 0 -18" stroke="#ffffff" stroke-width="3" opacity=".6" fill="none"/>` + s;
  if (m.has("lake") && type !== "forest_lake" && type !== "lagoon") s = `<rect x="0" y="${gy - 14}" width="${w}" height="12" fill="#6aa7c4"/>` + s;
  if (m.has("ruins") && type !== "jungle") s += `<path d="M${w - 70} ${gy} l 8 -10 h 6 l 5 -9 h 10 l 5 9 h 6 l 8 10 Z" fill="#a69a80"/>`;
  if (m.has("pool")) s += `<rect x="${w * 0.3}" y="${gy + 8}" width="${w * 0.36}" height="7" rx="2" fill="#60c3d8"/>`;
  if (m.has("cenote") && type !== "cenote") s += `<ellipse cx="${w * 0.78}" cy="${gy + 14}" rx="26" ry="7" fill="#5b4c3a"/><ellipse cx="${w * 0.78}" cy="${gy + 15}" rx="21" ry="4.5" fill="#1f8aa6"/>`;
  if (m.has("vines") && type !== "vineyard") for (let i = 0; i < 5; i++) s += `<path d="M${f(w * 0.08 + i * 12)} ${h} L ${f(w * 0.16 + i * 4)} ${gy + 6}" stroke="#5d7a3c" stroke-width="2.2"/>`;
  if (m.has("dock") && type !== "lagoon") s += `<rect x="${w * 0.6}" y="${gy + 4}" width="${w * 0.36}" height="3" fill="#8b6a46"/>`;
  return s + fgLeft() + fgRight();
}

export function illo(v, w = 320, h = 150) {
  const id = "il" + ++uid;
  const r = rng(hash(v.key || v.name || "x"));
  const type = PAL[v.type] ? v.type : "hacienda";
  const P = PAL[type];
  const m = new Set(v.motifs || []);
  let s = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Drawing of a ${esc((v.type || "hacienda").replace("_", " "))} setting">`;
  s += `<defs><linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.sky[0]}"/><stop offset="1" stop-color="${P.sky[1]}"/></linearGradient></defs>`;
  s += `<rect width="${w}" height="${h}" fill="url(#${id}s)"/>`;
  const sunX = w * (0.62 + r() * 0.28), sunY = 46 + r() * 18;
  s += `<circle cx="${f(sunX)}" cy="${f(sunY)}" r="${f(13 + r() * 6)}" fill="${type === "garden_estate" ? "#f6e7c6" : "#fff4d6"}" opacity=".85"/>`;
  s += hills(r, h - 44, 12, P.far, w);
  s += `<rect x="0" y="${h - 30}" width="${w}" height="30" fill="${P.ground}"/>`;
  s += scene(type, m, r, w, h, P);
  s += picado(r, w, 2);
  s += `</svg>`;
  return s;
}
