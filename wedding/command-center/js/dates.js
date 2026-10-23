// The wedding date: any day can be chosen, plus other dates the couple would consider.
// Builds the date phrases the quote emails and questions use, and notes on Mexican
// holidays, long weekends and seasons around a chosen date.

const WD_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MO_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const WD_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const parse = (iso) => new Date(iso + "T12:00:00");
export const isISO = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) && !isNaN(parse(s));
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);

export function candidateDates(cfg) {
  return [...new Set([cfg.date, ...(cfg.altDates || [])].filter(isISO))].sort();
}

export function fmtDate(s, style = "long") {
  const d = parse(s);
  if (style === "short") return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export function daysTo(s) {
  return Math.round((parse(s) - new Date()) / 86400000);
}

// "sábado 6 o sábado 13 de noviembre de 2027"
export function phraseES(list) {
  const groups = [];
  for (const s of list) {
    const d = parse(s), key = d.getFullYear() * 12 + d.getMonth();
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) { g = { key, items: [], m: d.getMonth(), y: d.getFullYear() }; groups.push(g); }
    g.items.push(`${WD_ES[d.getDay()]} ${d.getDate()}`);
  }
  const join = (a) => (a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " o " + a[a.length - 1]);
  return join(groups.map((g) => `${join(g.items)} de ${MO_ES[g.m]} de ${g.y}`));
}

// "Saturday Nov 6, 2027 or Saturday Nov 13, 2027"
export function phraseEN(list) {
  const items = list.map((s) => { const d = parse(s); return `${WD_EN[d.getDay()]} ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`; });
  return items.length < 2 ? items.join("") : items.slice(0, -1).join(", ") + " or " + items[items.length - 1];
}

function nthWeekday(y, m, wd, n) {
  const first = new Date(y, m, 1, 12);
  return new Date(y, m, 1 + ((wd - first.getDay() + 7) % 7) + 7 * (n - 1), 12);
}
function easter(y) {
  // anonymous Gregorian algorithm
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day, 12);
}

// Mexico's official days off (Ley Federal del Trabajo, art. 74), the Monday ones moved by law
export function officialHolidays(y) {
  return [
    [new Date(y, 0, 1, 12), "New Year's Day"],
    [nthWeekday(y, 1, 1, 1), "Constitution Day"],
    [nthWeekday(y, 2, 1, 3), "Benito Juárez Day"],
    [new Date(y, 4, 1, 12), "Labour Day"],
    [new Date(y, 8, 16, 12), "Independence Day"],
    [nthWeekday(y, 10, 1, 3), "Revolution Day"],
    [new Date(y, 11, 25, 12), "Christmas"],
  ].map(([d, name]) => ({ iso: iso(d), d, name }));
}

export function dateNotes(s) {
  if (!isISO(s)) return [];
  const d = parse(s), y = d.getFullYear(), wd = d.getDay(), notes = [];
  const hol = [...officialHolidays(y - 1), ...officialHolidays(y), ...officialHolidays(y + 1)];
  const holOn = (x) => hol.find((h) => h.iso === iso(x));
  const md = (x) => x.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const self = holOn(d);
  if (self) notes.push({ tone: "warn", text: `${self.name} itself, an official day off in Mexico. Venues and vendors may charge a holiday rate.` });
  if (wd === 6 || wd === 0) {
    const mon = holOn(addDays(d, wd === 6 ? 2 : 1)), fri = holOn(addDays(d, wd === 6 ? -1 : -2));
    if (mon) notes.push({ tone: "good", text: `Long weekend: Monday ${md(mon.d)} is ${mon.name}. Easier travel for the family in Monterrey and Saltillo and every guest in Mexico; getaway towns fill up, so a venue that houses everyone matters more.` });
    if (fri) notes.push({ tone: "good", text: `Long weekend: Friday ${md(fri.d)} is ${fri.name}, so guests in Mexico get the Friday off.` });
  }
  if (wd !== 6) notes.push({ tone: "info", text: `A ${WD_EN[wd]}. The atlas priced Saturdays; ask venues for their ${WD_EN[wd]} rate, often lower.` });

  const rev = nthWeekday(y, 10, 1, 3);
  if (d >= addDays(rev, -4) && d <= rev) notes.push({ tone: "info", text: "Probably Buen Fin, Mexico's big shopping weekend, which fills popular getaway towns." });
  if (d >= new Date(y, 9, 25, 12) && d <= new Date(y, 10, 8, 12)) notes.push({ tone: "warn", text: "Close to Día de Muertos (Nov 1–2): Oaxaca, Pátzcuaro and Mérida fill up and prices rise. Book rooms early." });
  const e = easter(y);
  if (d >= addDays(e, -9) && d <= addDays(e, 1)) notes.push({ tone: "warn", text: `Semana Santa (Easter is ${md(e)}): Mexico's peak domestic travel week; beaches and pueblos mágicos fill and prices rise.` });
  const m = d.getMonth(), day = d.getDate();
  if ((m === 11 && day >= 18) || (m === 0 && day <= 6)) notes.push({ tone: "warn", text: "Christmas and New Year season: peak travel and holiday pricing." });
  else if (m === 11 && day >= 10 && day <= 13) notes.push({ tone: "info", text: "Around Día de la Virgen de Guadalupe (Dec 12): pilgrimages and fiestas; churches are busy." });
  if (m === 8 && day >= 13 && day <= 17) notes.push({ tone: "info", text: "Fiestas patrias (Sep 15–16): fireworks, crowds and busy roads." });
  if (m >= 5 && m <= 8) notes.push({ tone: "warn", text: "Rainy season inland (afternoon storms) and hurricane season on both coasts, peaking Aug–Oct. A covered space and a rain plan matter." });
  else if (m === 9) notes.push({ tone: "info", text: "The tail of hurricane season on the coasts; inland is drying out." });
  if (!(y === 2027 && m === 10 && wd === 6)) notes.push({ tone: "info", text: "Prices here are the atlas's, for a Saturday in November 2027 (heaters where November nights are cold). Quotes for this date can differ." });
  return notes;
}
