import { helderheidMin, GEWICHT_DRAAGBAAR_MAX_KG, GEBRUIK_MARKT_POSITIES, RESOLUTIE_LAAG, GELUID_STIL_MAX_DB, KORTE_WORP_TYPES } from "./data.js";
import { parsePrice } from "./utils.js";

export const DEFAULT_MIN_AANBIEDERS = 2;

export function applyMinAanbiedersCascade(matches, startThreshold = DEFAULT_MIN_AANBIEDERS) {
  const countAanbieders = item => (item.aanbieders ?? []).length;
  let effectiveMin = startThreshold;
  let result = matches.filter(item => countAanbieders(item) >= effectiveMin);

  while (result.length === 0 && effectiveMin > 1) {
    effectiveMin -= 1;
    result = matches.filter(item => countAanbieders(item) >= effectiveMin);
  }

  return { effectiveMin, result };
}

// ─── Wensen: true / false / null (onbekend) ────────────────────────────────
const lijst = v => (Array.isArray(v) ? v : v ? [v] : []);
export const extraWensen = a => lijst(a?.extraAnswers).filter(w => w !== "geen");
export const is4K = b => /4k/i.test(b.resolutie ?? "");

export function heeftWens(b, wens) {
  switch (wens) {
    case "smart-tv": return b.smart ?? null;
    case "laser": return b.lichtbronType ? /laser/i.test(b.lichtbronType) : null;
    case "stil": return b.geluidDb == null ? null : b.geluidDb <= GELUID_STIL_MAX_DB;
    case "korte-worp": return b.worpType ? KORTE_WORP_TYPES.has(b.worpType) : null;
    default: return true;
  }
}

/** Helder genoeg voor de ruimte? */
export function helderGenoeg(b, licht) {
  const min = helderheidMin[licht];
  if (!min) return true;
  return b.helderheidLumen == null ? null : b.helderheidLumen >= min;
}

/** Scherp genoeg? "heel-goed" = 4K; "prima" = geen 720p/WXGA of lager. */
export function scherpGenoeg(b, beeldkwaliteit) {
  if (!b.resolutie) return beeldkwaliteit === "heel-goed" || beeldkwaliteit === "prima" ? null : true;
  if (beeldkwaliteit === "heel-goed") return is4K(b);
  // Op de naam, niet de exacte tekst: Icecat schrijft ook "WXGA (1200x800)".
  if (beeldkwaliteit === "prima") return !RESOLUTIE_LAAG.has(b.resolutie) && !/^(720p|svga|xga|wxga)\b/i.test(b.resolutie);
  return true;
}

/** Licht genoeg om mee te nemen? */
export function draagbaarGenoeg(b, draagbaar) {
  if (draagbaar !== "ja") return true;
  return b.gewichtKg == null ? null : b.gewichtKg <= GEWICHT_DRAAGBAAR_MAX_KG;
}

// ───────── Matching per beamer (sinds 22-10-2026) ─────────
// Zelfde opzet als de andere keuzehulpen: het budget is een harde grens, elke
// beamer krijgt een passcore en de lijst is alles wat dicht bij de top zit.
// Vroeger was het een rij filters die stil wegvielen als er niets overbleef
// (bv. "veel licht" + "draagbaar"), en was de Beste match de goedkoopste.
//
// Passcore = 100
//   - 150 per wens die de beamer niet waarmaakt (helder genoeg voor de ruimte,
//     scherpte, draagbaar, extra's); 50 bij onbekend
//   - gebruik (voorkeur): films 4K, HDR en geen zakelijke beamer; gamen
//     "geschikt voor gamen" en 4K; werk extra helderheid
//   - erg zwak (onder 1000 lumen) als je hem niet mee wilt nemen
//   - prijs: de duurste in de lijst verliest tot PRIJS_GEWICHT punten
// `wens` is dezelfde score zonder het prijsdeel (voor de "Meer budget?"-kaart).
const WENS = 150, WENS_ONBEKEND = 50;
export const BAND_BESTE = 4;
const BAND_LIJST = 10;
const MIN_LIJST = 5;
const MAX_LIJST = 20;          // was 30; in de Ads-test viel 1 van de 144 winkelkliks voorbij plek 20 (26-10-2026)
const PRIJS_GEWICHT = 6;

function wensStraf(heeft) {
  if (heeft === true) return 0;
  return heeft === false ? WENS : WENS_ONBEKEND;
}
const ZAKELIJK = new Set(GEBRUIK_MARKT_POSITIES.werk);

function straffen(b, a) {
  let s = 0;
  s += wensStraf(helderGenoeg(b, a.licht));
  s += wensStraf(scherpGenoeg(b, a.beeldkwaliteit));
  s += wensStraf(draagbaarGenoeg(b, a.draagbaar));
  for (const w of extraWensen(a)) s += wensStraf(heeftWens(b, w));

  if (a.gebruik === "thuisbioscoop") {
    if (!is4K(b)) s += 4;
    if (ZAKELIJK.has(b.marktPositionering) || /grote zalen/i.test(b.worpType ?? "")) s += 6;
  }
  if (a.gebruik === "gamen" && !is4K(b)) s += 3;
  if (a.gebruik === "werk" && b.helderheidLumen != null && b.helderheidLumen < 3000) s += 6;
  if (a.draagbaar !== "ja" && b.helderheidLumen != null && b.helderheidLumen < 1000) s += 6;
  return s;
}

function bonussen(b, a) {
  let x = 0;
  if ((a.gebruik === "thuisbioscoop" || a.gebruik === "gamen") && /^ja$/i.test(b.hdr ?? "")) x += 2;
  if (a.gebruik === "gamen" && b.marktPositionering === "Gamen") x += 4;
  return x;
}

// Plek van een prijs binnen een lijst: 0 = goedkoopste, 1 = duurste.
function prijsPlek(pool) {
  const prijzen = pool.map(b => parsePrice(b.prijs)).sort((x, y) => x - y);
  return prijs => (prijzen.length < 2 ? 0 : prijzen.filter(x => x < prijs).length / (prijzen.length - 1));
}

export function scoreBeamers(pool, answers = {}) {
  const plek = prijsPlek(pool);
  return pool.map(b => {
    const wens = 100 - straffen(b, answers) + bonussen(b, answers);
    const fit = wens - PRIJS_GEWICHT * plek(parsePrice(b.prijs));
    return { ...b, wens: Math.round(wens * 10) / 10, fit: Math.round(fit * 10) / 10 };
  });
}

/** Beste match: de goedkoopste van de beamers die even goed passen als de beste. */
export function kiesBesteMatch(lijstIn) {
  const kandidaten = (lijstIn ?? []).filter(b => Number.isFinite(b?.fit));
  if (!kandidaten.length) return null;
  const top = Math.max(...kandidaten.map(b => b.fit));
  return kandidaten.filter(b => b.fit >= top - BAND_BESTE).reduce((x, y) => {
    const px = parsePrice(x.prijs), py = parsePrice(y.prijs);
    return py < px || (py === px && y.fit > x.fit) ? y : x;
  });
}

/**
 * @param {object[]} beamers   genormaliseerde beamers (utils.normalizeProducts)
 * @param {object} answers     antwoorden uit de quiz (answers.budget: maximum of null)
 * @param {number|null} [budget] overschrijft answers.budget (null = zonder grens)
 */
export function matchBeamers(beamers, answers, budget = answers?.budget) {
  const leeg = { bestMatch: null, bestType: null, filteredMatchedBeamers: [], topWens: null };
  if (!Array.isArray(beamers) || beamers.length === 0) return leeg;

  const cap = Number(budget) || null;
  const pool = beamers.filter(b => !cap || parsePrice(b.prijs) <= cap);
  if (pool.length === 0) return leeg;

  const gescoord = scoreBeamers(pool, answers ?? {}).sort((x, y) => y.fit - x.fit);
  const top = gescoord[0].fit;
  // Alles binnen de band, maar door tot er minstens MIN_LIJST beamers in
  // zitten die door het standaardfilter "2+ winkels" op de resultaatpagina komen.
  const uit = [];
  let zichtbaar = 0;
  for (const b of gescoord) {
    if (zichtbaar >= MAX_LIJST) break;
    if (b.fit < top - BAND_LIJST && zichtbaar >= MIN_LIJST) break;
    uit.push(b);
    if ((b.aanbieders ?? []).length >= DEFAULT_MIN_AANBIEDERS) zichtbaar++;
  }
  uit.sort((x, y) => parsePrice(x.prijs) - parsePrice(y.prijs));

  return {
    bestMatch: kiesBesteMatch(uit),
    bestType: "Algemeen",
    filteredMatchedBeamers: uit,
    topWens: Math.max(...uit.map(b => b.wens)),
  };
}

// De kaartpunten ("Waarom dit bij jou past") staan in punten.js.
