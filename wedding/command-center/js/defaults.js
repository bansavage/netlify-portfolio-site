// Starting state for the Command Center: the brief, the vision and the cost model
// exactly as the atlas (Oct 23, 2026) priced them. Everything here is editable in the app.

export const CATEGORIES = {
  venue: { label: "Venue", plural: "Venues" },
  planner: { label: "Planner", plural: "Planners & coordinators" },
  caterer: { label: "Caterer", plural: "Caterers & buffets" },
  taquero: { label: "Taquero", plural: "Taqueros & taquizas" },
  bar: { label: "Bar", plural: "Bar & bartenders" },
  mariachi: { label: "Mariachi", plural: "Mariachi" },
  band: { label: "Live band", plural: "Live bands" },
  dj: { label: "DJ", plural: "DJs" },
  photo: { label: "Photo", plural: "Photographers" },
  video: { label: "Video", plural: "Videographers" },
  decor: { label: "Décor", plural: "Décor & papel picado" },
  florals: { label: "Florals", plural: "Florals & greenery" },
  rentals: { label: "Rentals", plural: "Rentals, lighting & tents" },
  transport: { label: "Transport", plural: "Transport" },
  officiant: { label: "Officiant", plural: "Officiants" },
  beauty: { label: "Hair & makeup", plural: "Hair & makeup" },
  tradition: { label: "Calenda", plural: "Calendas & traditions" },
  other: { label: "Other", plural: "Sound, lighting & other" },
  principle: { label: "Principle", plural: "Principles" },
};

// Words in a vision phrase that point to a vendor category (first match wins).
export const CATEGORY_WORDS = [
  ["mariachi", /mariachi/i],
  ["tradition", /calenda|monos|parade|desfile|tornaboda|lazo|arras/i],
  ["taquero", /taquer|taquiza|trompo|pastor|arrachera|tacos?\b/i],
  ["dj", /\bdj\b|deejay|cumbia|reggaet|bad bunny|disco block/i],
  ["band", /\bband\b|banda en vivo|grupo vers|live music|m[uú]sica en vivo|son jarocho|marimba/i],
  ["bar", /\bbar\b|bartender|mezcal|tequila|cocktail bar|cerveza|beer|wine|corkage|descorche/i],
  ["caterer", /buffet|cazuela|caterer|catering|banquete|dinner|brunch|food|comida|menu|men[uú]/i],
  ["photo", /photo|fot[oó]graf/i],
  ["video", /video|film/i],
  ["decor", /papel picado|candle|vela|d[eé]cor|centerpiece|lantern|farol/i],
  ["florals", /flower|floral|bouquet|greenery|flor(es)?\b/i],
  ["rentals", /rental|lounge|furniture|string light|lighting|tent|carpa|heater|generator|dance floor|pista/i],
  ["transport", /shuttle|van|bus|transport|transfer|driver/i],
  ["officiant", /officiant|ceremony|ceremonia|blessing/i],
  ["planner", /planner|coordinator|coordinaci/i],
  ["beauty", /hair|makeup|maquillaje|peinado/i],
];

export function guessCategory(text) {
  for (const [cat, rx] of CATEGORY_WORDS) if (rx.test(text)) return cat;
  return "other";
}

// "1.5 hour band", "2 hrs", "90 min" → hours
export function parseHours(text) {
  const h = String(text).match(/(\d+(?:[.,]\d+)?)\s*(?:-|–)?\s*(?:h\b|hrs?\b|hours?\b|horas?\b)/i);
  if (h) return parseFloat(h[1].replace(",", "."));
  const m = String(text).match(/(\d+)\s*(?:min\b|minutes?\b|minutos?\b)/i);
  if (m) return Math.round((parseInt(m[1], 10) / 60) * 100) / 100;
  return null;
}

// The atlas's base stack, written as vision lines. `key` ties a line to the matching
// standard row in each venue's pricing; lines without a key are add-ons priced at every venue.
export const DEFAULT_VISION = [
  { id: "v-buffet", key: "buffet", cat: "caterer", title: "Mexican buffet", text: "Mexican food served buffet-style in clay cazuelas, with furniture and waiters. No plated service, no silver chafing dishes.", unit: "guest", rate: 750, qty: 1, on: true },
  { id: "v-taco", key: "taco", cat: "taquero", title: "Live taquero station", text: "Taqueros cooking to order in front of guests: al pastor on the trompo, arrachera and pollo.", unit: "guest", rate: 150, qty: 1, on: true },
  { id: "v-bar", key: "bar", cat: "bar", title: "Open bar", text: "Open bar with our own alcohol and hired bartenders.", unit: "guest", rate: 350, qty: 1, on: true },
  { id: "v-mariachi", key: "mariachi", cat: "mariachi", title: "Mariachi", text: "Mariachi at the cocktail hour, 1 hour.", unit: "hour", rate: 6000, qty: 1, on: true },
  { id: "v-band", key: "band", cat: "band", title: "Live band", text: "Live band for the first part of the reception.", unit: "flat", rate: 25000, qty: 1, on: true },
  { id: "v-dj", key: "dj", cat: "dj", title: "Mexican DJ", text: "Mexican DJ with lights and a dance floor until about 2:30 a.m.: cumbia, banda, reggaetón, Bad Bunny, house and a short 70s disco block. No US Top 40, no MC games.", unit: "flat", rate: 20000, qty: 1, on: true },
  { id: "v-photo", key: "photo", cat: "photo", title: "Photographer", text: "Photographer for 8–10 hours.", unit: "flat", rate: 25000, qty: 1, on: true },
  { id: "v-coord", key: "coord", cat: "planner", title: "Month-of coordinator", text: "Month-of coordinator (a venue that requires its own planner replaces this).", unit: "flat", rate: 20000, qty: 1, on: true },
  { id: "v-officiant", key: "officiant", cat: "officiant", title: "Symbolic officiant", text: "A symbolic ceremony in a scenic, striking spot, with an officiant.", unit: "flat", rate: 8000, qty: 1, on: true },
  { id: "v-decor", key: "decor", cat: "decor", title: "Papel picado & candles", text: "Candles in clusters and papel picado overhead in the six-color palette. No floral centerpieces.", unit: "flat", rate: 10000, qty: 1, on: true },
  { id: "v-extras", key: "extras", cat: "rentals", title: "Lighting & lounge rentals", text: "Warm string lights, a lounge corner and other rentals.", unit: "flat", rate: 8000, qty: 1, on: true },
  { id: "v-tips", key: "tips", cat: "other", title: "Tips", text: "Tips for waiters, taqueros and bartenders.", unit: "flat", rate: 6000, qty: 1, on: true },
  { id: "v-p1", key: null, cat: "principle", title: "The venue is the décor", text: "Jungle, cenotes, old stone, a hacienda courtyard, a lagoon. Nothing that needs a full décor build to look right.", unit: "none", rate: 0, qty: 1, on: true },
  { id: "v-p2", key: null, cat: "principle", title: "One place, nobody moves", text: "Ceremony, cocktail hour and reception in the same space.", unit: "none", rate: 0, qty: 1, on: true },
  { id: "v-p3", key: null, cat: "principle", title: "The party runs late", text: "Ideally to 2–3 a.m., at the same venue.", unit: "none", rate: 0, qty: 1, on: true },
  { id: "v-p4", key: null, cat: "principle", title: "Everyone sleeps in one place", text: "Ideally on site.", unit: "none", rate: 0, qty: 1, on: true },
];

export const DEFAULT_CONFIG = {
  couple: "Kyle & Daina",
  altDates: ["2027-11-06"], // other dates we would consider; any day can be the wedding date
  date: "2027-11-13",
  guests: { invited: 91, expected: 57, low: 60, high: 70, plan: 65, teens: "16 and 13" },
  budget: { target: 20000, ceiling: 30000 },
  fx: 18.45, // the rate in use; set from fxMode at boot
  fxMode: "live", // live | atlas | manual
  fxManual: 18.45,
  fxLive: null,
  contingency: 10,
  minEnd: 1, // a.m. — the atlas rule: a listed end of 1 a.m. or later, or none stated
  minBeds: 0,
  needTaq: false,
  weights: { setting: 30, end: 22, taq: 18, beds: 13, cost: 11, access: 6 },
  weekend: {
    welcome: { on: true, pp: 700 },
    brunch: { on: true, pp: 350 },
    rooms: { on: true, count: 4, nights: 3 },
    flights: { on: false, usd: 4000 },
  },
  vision: DEFAULT_VISION,
  notes: "",
};

export const STAGES = [
  ["none", "Not contacted"],
  ["asked", "Asked for a quote"],
  ["quoted", "Quote in hand"],
  ["visit", "Visit planned"],
  ["visited", "Visited"],
  ["booked", "Booked"],
  ["passed", "Passed"],
];

export const QUESTIONS_EN = [
  "Until what time can amplified music play, in writing, and what does each extra hour cost?",
  "Can we bring outside taqueros with a trompo and open flame, and is there a kitchen, corkage or outside-vendor fee?",
  "Does the price for Saturday Nov 6 or Nov 13, 2027 include IVA, furniture, a generator, security and cleaning?",
  "How many rooms and beds are there, at what rate and minimum nights, and do we have to book them all?",
  "Is there a guest minimum, or a charge for falling short of it?",
  "Are guests aged 13 and 16 accepted without restriction?",
  "Is ours the only event that day, what covered space is there if it rains, and are heaters allowed?",
];
