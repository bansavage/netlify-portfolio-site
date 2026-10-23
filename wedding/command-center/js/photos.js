// Venue photos, loaded straight from each venue's own listing (the URLs were collected
// into data/photos.json; nothing is copied here). Each photo sits over the drawn
// illustration, so a photo that fails to load simply reveals the drawing.

import { esc } from "./util.js";

export const photosOf = (v) => (v && v.photos && v.photos.length ? v.photos : []);

// bodas.com.mx (and its sister weddingwire.com) serve every gallery image at 320, 640, 960 and 1280 px wide
export const photoSrc = (url, w) => url.replace(/(cdn\d?\.(?:bodas\.com\.mx|weddingwire\.com)\/vendor\/\d+\/\d+_\d+\/)\d+(\/)/, `$1${w}$2`);

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
