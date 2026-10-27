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
  guests: { invited: 125, expected: 70, low: 60, high: 80, plan: 75, teens: "16 and 13" }, // Oct 25, 2026: 125 invited, about half to two-thirds expected
  budget: { target: 20000, ceiling: 30000 },
  fx: 18.45, // the rate in use; set from fxMode at boot
  fxMode: "live", // live | atlas | manual
  fxManual: 18.45,
  fxLive: null,
  contingency: 10,
  minEnd: 1, // a.m. — the atlas rule: a listed end of 1 a.m. or later, or none stated
  minBeds: 0,
  needTaq: false,
  weights: { setting: 40, cost: 30, beds: 20, access: 10 }, // the couple's four tests, in their order (Oct 23)
  // Saltillo & Monterrey: a wedding near Daina's family, ranked on the venue itself, never rooms (Oct 27)
  norte: {
    guests: { low: 90, plan: 110, high: 130 }, // more of the Saltillo family comes when it's a drive away
    weights: { setting: 60, cost: 30, near: 10 },
  },
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

// The couple's own first email to every venue (Oct 23, 2026), and its questions in English
export const EMAIL_ES = {
  subject: "Boda simbólica en 2027",
  intro: "Hola,\n\nSomos Kyle y Daina. Estamos planeando una boda simbólica para unas 60 personas en 2027 y nos encantaría celebrarla con ustedes. Tenemos algunas preguntas para empezar:",
  outro: "¡Muchas gracias!\nKyle y Daina",
};
export const QUESTIONS_ES = [
  "¿Hasta qué hora se permite la música? ¿Es posible extenderla y, si sí, cuánto cuesta cada hora extra?",
  "¿A qué hora tendría que terminar la recepción?",
  "¿Podemos llevar un taquero externo y ofrecer una taquiza y un buffet para la recepción? ¿Hay algún cargo por usar la cocina, por descorche o por llevar proveedores externos? ¿O ustedes cuentan con algún proveedor que nos recomienden?",
  "¿Cuántas habitaciones y camas tienen disponibles? ¿Cuáles son las tarifas y el mínimo de noches? ¿Es obligatorio reservar todas las habitaciones?",
  "¿Hay un mínimo de invitados? ¿Se cobra algo si no llegamos a ese número?",
  "¿Pueden asistir invitados de 13 y 16 años sin restricciones?",
  "¿Nuestra boda sería el único evento ese día? ¿Tienen algún espacio techado por si llueve?",
];
export const QUESTIONS_EN = [
  "Until what time is music allowed? Can it run later, and if so, what does each extra hour cost?",
  "What time would the reception have to end?",
  "Can we bring an outside taquero and serve a taquiza and a buffet at the reception? Is there a fee for the kitchen, corkage or outside vendors? Or do you have a vendor you'd recommend?",
  "How many rooms and beds are available? What are the rates and the minimum nights? Do we have to book every room?",
  "Is there a guest minimum? Is there a charge if we fall short of it?",
  "Can guests aged 13 and 16 attend without restrictions?",
  "Would ours be the only event that day? Do you have a covered space in case it rains?",
];
