import { gezinsgrootteMinCapaciteit, WENS, VRIEZER_WENS } from "./data.js";
import { parsePrice } from "./utils.js";
import { klant, isUitgezet } from "../../shared/klant.js";

export const DEFAULT_MIN_AANBIEDERS = 2;
// Wat telt als "zichtbaar" voor de lijstlengte en de budgetkaart. In de B2B-
// embed is de klant de enige winkel, dus daar telt elke koelkast.
export const MIN_ZICHTBAAR = klant ? 1 : DEFAULT_MIN_AANBIEDERS;

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

// ─── Harde filters: inbouw/vrijstaand en type of nis ──────────────────────────

export function filterByPlaatsing(koelkasten, plaatsing) {
  if (plaatsing === "inbouw") return koelkasten.filter(k => k.plaatsing === "inbouw");
  return koelkasten.filter(k => k.plaatsing !== "inbouw");
}

// Gracieus: heeft de gekozen nis of het type geen enkele koelkast, dan alle
// koelkasten van die plaatsing in plaats van een lege lijst.
export function filterBySubGroup(koelkasten, plaatsing, subGroup) {
  if (!subGroup) return koelkasten;
  const matched = plaatsing === "inbouw"
    ? koelkasten.filter(k => k.nishoogteGroup === Number(subGroup))
    : koelkasten.filter(k => k.vrijstaandType === subGroup);
  return matched.length > 0 ? matched : koelkasten;
}

/** Plaatsing + type/nis: de koelkasten die mogen meedoen (zonder budget). */
export function poolVoor(koelkasten, answers) {
  const opPlaatsing = filterByPlaatsing(koelkasten, answers?.plaatsing);
  const sub = answers?.plaatsing === "inbouw" ? answers?.nishoogte : answers?.vrijstaandtype;
  return filterBySubGroup(opPlaatsing, answers?.plaatsing, sub);
}

// ───────── Matching per koelkast (sinds 25-10-2026) ─────────
// Zelfde opzet als de andere keuzehulpen: plaatsing, type/nis en budget zijn
// een harde grens, elke koelkast krijgt een passcore en de lijst is alles wat
// dicht bij de top zit. Vroeger: filters na elkaar en de goedkoopste als
// "beste match", ook als die maar aan één wens voldeed.
//
// Passcore = 100
//   - een wens (vriezer, extra) die hij niet heeft: −150, onbekend: −40
//   - personen: −1,5 per 10 liter koelruimte te weinig (onbekend −5)
//   - stil gewenst: −2 per dB boven de stilste van de lijst (onbekend −6).
//     Bewust de stilste, niet het gemiddelde: anders won een luider model op
//     prijs (zelfde regel als vaatwasser, okt. 2026).
//   - prijs: de duurste in de lijst verliest tot 5 punten
// `wens` is dezelfde score zonder het prijsdeel (voor de "Meer budget?"-kaart).
const WENS_STRAF = 150, WENS_ONBEKEND = 40;
export const BAND_BESTE = 4;
const BAND_LIJST = 10;
const MIN_LIJST = 5;
const MAX_LIJST = 20;          // was 30; in de Ads-test viel 1 van de 144 winkelkliks voorbij plek 20 (26-10-2026)
const PRIJS_GEWICHT = 5;

export const lijst = a => (Array.isArray(a) ? a : []).filter(v => v !== "geen");
/** De extra's die als wens tellen (stil is een score, geen wens). */
export const extraWensen = a => lijst(a?.extraAnswers).filter(w => WENS[w] && !isUitgezet(w));

/** Vriezerwens uit de antwoorden ("" als die er niet is of niet geldt). */
export const vriezerWens = a => (VRIEZER_WENS[a?.vriezer] ? a.vriezer : "");

/** Heeft de koelkast deze wens? true / false / null (onbekend). */
export function heeftWens(k, wens) {
  if (VRIEZER_WENS[wens]) return VRIEZER_WENS[wens](k);
  return WENS[wens] ? WENS[wens](k) : true;
}

/** Genoeg koelruimte voor het huishouden? true / false / null. */
export function genoegInhoud(k, gezinsgrootte) {
  const min = gezinsgrootteMinCapaciteit[gezinsgrootte];
  if (!min) return true;
  return Number.isFinite(k.nettoInhoudL) ? k.nettoInhoudL >= min : null;
}

function wensStraf(heeft) {
  if (heeft === true) return 0;
  return heeft === false ? WENS_STRAF : WENS_ONBEKEND;
}

function straffen(k, a, stilste) {
  let s = 0;
  const vw = vriezerWens(a);
  if (vw) s += wensStraf(heeftWens(k, vw));
  for (const w of extraWensen(a)) s += wensStraf(heeftWens(k, w));

  const min = gezinsgrootteMinCapaciteit[a.gezinsgrootte];
  if (min) s += Number.isFinite(k.nettoInhoudL) ? Math.max(0, min - k.nettoInhoudL) / 10 * 1.5 : 5;

  if (lijst(a.extraAnswers).includes("stil") && !isUitgezet("stil")) {
    s += Number.isFinite(k.geluidsniveauDb) ? (k.geluidsniveauDb - stilste) * 2 : 6;
  }
  return s;
}

// Plek van een prijs binnen een lijst: 0 = goedkoopste, 1 = duurste.
function prijsPlek(pool) {
  const prijzen = pool.map(k => parsePrice(k.prijs)).sort((x, y) => x - y);
  return prijs => (prijzen.length < 2 ? 0 : prijzen.filter(x => x < prijs).length / (prijzen.length - 1));
}

export function scoreKoelkasten(pool, answers = {}) {
  const plek = prijsPlek(pool);
  const db = pool.map(k => k.geluidsniveauDb).filter(Number.isFinite);
  const stilste = db.length ? Math.min(...db) : 0;
  return pool.map(k => {
    const wens = 100 - straffen(k, answers, stilste);
    const fit = wens - PRIJS_GEWICHT * plek(parsePrice(k.prijs));
    return { ...k, wens: Math.round(wens * 10) / 10, fit: Math.round(fit * 10) / 10 };
  });
}

/** Beste match: de goedkoopste van de koelkasten die even goed passen als de beste. */
export function kiesBesteMatch(lijstIn) {
  const metScore = (lijstIn ?? []).filter(k => Number.isFinite(k?.fit));
  if (!metScore.length) return null;
  const top = Math.max(...metScore.map(k => k.fit));
  return metScore.filter(k => k.fit >= top - BAND_BESTE).reduce((x, y) => {
    const px = parsePrice(x.prijs), py = parsePrice(y.prijs);
    return py < px || (py === px && y.fit > x.fit) ? y : x;
  });
}

/**
 * @param {object[]} koelkasten   genormaliseerde koelkasten (utils.normalizeProducts)
 * @param {object} answers        antwoorden uit de quiz (answers.budget: maximum of null)
 * @param {number|null} [budget]  overschrijft answers.budget (null = zonder grens)
 */
export function matchKoelkasten(koelkasten, answers, budget = answers?.budget) {
  const leeg = { bestMatch: null, bestType: null, filteredMatchedKoelkasten: [], topWens: null };
  if (!Array.isArray(koelkasten) || !answers?.plaatsing) return leeg;

  const cap = Number(budget) || null;
  const pool = poolVoor(koelkasten, answers).filter(k => !cap || parsePrice(k.prijs) <= cap);
  if (pool.length === 0) return leeg;

  const gescoord = scoreKoelkasten(pool, answers).sort((x, y) => y.fit - x.fit);
  const top = gescoord[0].fit;
  const uit = [];
  let zichtbaar = 0;
  for (const k of gescoord) {
    if (zichtbaar >= MAX_LIJST) break;
    if (k.fit < top - BAND_LIJST && zichtbaar >= MIN_LIJST) break;
    uit.push(k);
    if ((k.aanbieders ?? []).length >= MIN_ZICHTBAAR) zichtbaar++;
  }
  uit.sort((x, y) => parsePrice(x.prijs) - parsePrice(y.prijs));

  return {
    bestMatch: kiesBesteMatch(uit),
    bestType: answers.plaatsing === "inbouw" ? "Inbouw" : "Vrijstaand",
    filteredMatchedKoelkasten: uit,
    topWens: Math.max(...uit.map(k => k.wens)),
  };
}

// De kaartpunten ("Waarom dit bij jou past") staan in punten.js.
