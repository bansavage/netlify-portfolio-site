// Venue photos, loaded straight from each venue's own listing (the URLs were collected
// into data/photos.json; nothing is copied here). Each photo sits over the drawn
// illustration, so a photo that fails to load simply reveals the drawing.

import { esc } from "./util.js";

export const photosOf = (v) => (v && v.photos && v.photos.length ? v.photos : []);

// Ask each host for a copy near the size it's shown at, where the host can resize.
export function photoSrc(url, w) {
  // bodas.com.mx and its sister weddingwire.com: 320, 640, 960 or 1280 px, as a path segment
  if (/cdn\d?\.(?:bodas\.com\.mx|weddingwire\.com)\/vendor\//.test(url)) return url.replace(/(\/vendor\/\d+\/\d+_\d+\/)\d+(\/)/, `$1${w}$2`);
  // Angsana stores camera originals; its own resizer serves 384, 640 and 1080 px
  if (/^https:\/\/www\.angsana\.com\/assets\//.test(url)) return `https://www.angsana.com/_next/image?url=${encodeURIComponent(url)}&w=${w <= 384 ? 384 : w <= 640 ? 640 : 1080}&q=75`;
  // Squarespace: ?format=500w / 750w / 1000w
  if (/squarespace(?:-cdn)?\.com\//.test(url)) return url.split("?")[0] + `?format=${w <= 500 ? 500 : w <= 750 ? 750 : 1000}w`;
  // Duda sites (cdn-website.com): -640w or -1920w before the extension
  if (/cdn-website\.com\//.test(url)) return url.replace(/-\d+w\.(jpe?g|png|webp)$/i, `-${w <= 640 ? 640 : 1920}w.$1`);
  return url;
}

export function photoHost(v) {
  try { return new URL(v.photo_src).hostname.replace(/^www\./, ""); } catch (e) { return ""; }
}

export function photoTag(v, w, i = 0) {
  const p = photosOf(v)[i];
  if (!p) return "";
  return `<img class="ph" src="${esc(photoSrc(p, w))}" alt="${esc(v.short)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="photoFailed(this)">`;
}

export function photoLabel(v, drawingText = "Drawing") {
  return photosOf(v).length ? `Photo · ${esc(photoHost(v))}` : drawingText;
}

window.photoFailed = (img) => {
  const box = img.parentNode;
  img.remove();
  const tag = box && box.querySelector(".illo-tag");
  if (tag) tag.textContent = "Drawing";
};
