import { capaciteitLiterMin } from "./data.js";
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

// ───────── Matching per airfryer (sinds 25-10-2026) ─────────
// Zelfde opzet als de andere keuzehulpen: het budget is een harde grens, elke
// airfryer krijgt een passcore en de lijst is alles wat dicht bij de top zit.
// Vroeger: filters na elkaar (ook op grillen/braden, die bij de helft
// gewoon niet ingevuld zijn) en de goedkoopste als "beste match".
//
// Passcore = 100
//   - een wens (dubbele mand of juist 1 mand, kijkglas, stomen) die hij niet
//     heeft: −150, onbekend: −40
//   - personen: −3 per liter te weinig inhoud (onbekend −6)
//   - compact gewenst: −1,5 per dm² meer aanrechtruimte dan de kleinste van de
//     lijst (onbekend −6)
//   - prijs: de duurste in de lijst verliest tot 5 punten
// `wens` is dezelfde score zonder het prijsdeel (voor de "Meer budget?"-kaart).
const WENS_STRAF = 150, WENS_ONBEKEND = 40;
export const BAND_BESTE = 4;
const BAND_LIJST = 10;
const MIN_LIJST = 5;
const MAX_LIJST = 20;          // was 30; in de Ads-test viel 1 van de 144 winkelkliks voorbij plek 20 (26-10-2026)
const PRIJS_GEWICHT = 5;

export const lijst = a => (Array.isArray(a) ? a : []).filter(v => v !== "geen");
export const WENSEN = ["kijkglas", "stomen"];
export const extraWensen = a => lijst(a?.extraAnswers).filter(w => WENSEN.includes(w));

/** Heeft de airfryer deze wens? true / false / null (onbekend). */
export function heeftWens(af, wens) {
  switch (wens) {
    case "kijkglas": return af.heeftKijkglas;
    case "stomen": return af.kanStomen;
    case "dubbel": return af.dubbel;
    case "enkel": return af.dubbel === null ? null : !af.dubbel;
    default: return true;
  }
}

/** Mand-wens uit de antwoorden: "dubbel", "enkel" of "" (maakt niet uit). */
export const mandWens = a => (a?.dubbeleMand === "ja" ? "dubbel" : a?.dubbeleMand === "nee" ? "enkel" : "");

/** Groot genoeg voor het aantal personen? true / false / null. */
export function genoegInhoud(af, personen) {
  const min = capaciteitLiterMin[personen];
  if (!min) return true;
  return Number.isFinite(af.capaciteitLiter) ? af.capaciteitLiter >= min : null;
}

const straf = h => (h === true ? 0 : h === false ? WENS_STRAF : WENS_ONBEKEND);

function straffen(af, a, ctx) {
  let s = 0;
  if (mandWens(a)) s += straf(heeftWens(af, mandWens(a)));
  for (const w of extraWensen(a)) s += straf(heeftWens(af, w));
  const min = capaciteitLiterMin[a.personen];
  if (min) s += Number.isFinite(af.capaciteitLiter) ? Math.max(0, min - af.capaciteitLiter) * 3 : 6;
  if (lijst(a.extraAnswers).includes("compact")) {
    s += Number.isFinite(af.oppervlakDm2) ? (af.oppervlakDm2 - ctx.kleinste) * 1.5 : 6;
  }
  return s;
}

// Plek van een prijs binnen een lijst: 0 = goedkoopste, 1 = duurste.
function prijsPlek(pool) {
  const prijzen = pool.map(af => parsePrice(af.prijs)).sort((x, y) => x - y);
  return prijs => (prijzen.length < 2 ? 0 : prijzen.filter(x => x < prijs).length / (prijzen.length - 1));
}

export function scoreAirfryers(pool, answers = {}) {
  const plek = prijsPlek(pool);
  const opp = pool.map(af => af.oppervlakDm2).filter(Number.isFinite);
  const ctx = { kleinste: opp.length ? Math.min(...opp) : 0 };
  return pool.map(af => {
    const wens = 100 - straffen(af, answers, ctx);
    const fit = wens - PRIJS_GEWICHT * plek(parsePrice(af.prijs));
    return { ...af, wens: Math.round(wens * 10) / 10, fit: Math.round(fit * 10) / 10 };
  });
}

/** Beste match: de goedkoopste van de airfryers die even goed passen als de beste. */
export function kiesBesteMatch(lijstIn) {
  const metScore = (lijstIn ?? []).filter(af => Number.isFinite(af?.fit));
  if (!metScore.length) return null;
  const top = Math.max(...metScore.map(af => af.fit));
  return metScore.filter(af => af.fit >= top - BAND_BESTE).reduce((x, y) => {
    const px = parsePrice(x.prijs), py = parsePrice(y.prijs);
    return py < px || (py === px && y.fit > x.fit) ? y : x;
  });
}

/**
 * @param {object[]} airfryers    genormaliseerde airfryers (utils.normalizeProducts)
 * @param {object} answers        antwoorden uit de quiz (answers.budget: maximum of null)
 * @param {number|null} [budget]  overschrijft answers.budget (null = zonder grens)
 */
export function matchAirfryers(airfryers, answers, budget = answers?.budget) {
  const leeg = { bestMatch: null, bestType: null, filteredMatchedAirfryers: [], topWens: null };
  if (!Array.isArray(airfryers) || airfryers.length === 0) return leeg;

  const cap = Number(budget) || null;
  const pool = airfryers.filter(af => !cap || parsePrice(af.prijs) <= cap);
  if (pool.length === 0) return leeg;

  const gescoord = scoreAirfryers(pool, answers ?? {}).sort((x, y) => y.fit - x.fit);
  const top = gescoord[0].fit;
  const uit = [];
  let zichtbaar = 0;
  for (const af of gescoord) {
    if (zichtbaar >= MAX_LIJST) break;
    if (af.fit < top - BAND_LIJST && zichtbaar >= MIN_LIJST) break;
    uit.push(af);
    if ((af.aanbieders ?? []).length >= DEFAULT_MIN_AANBIEDERS) zichtbaar++;
  }
  uit.sort((x, y) => parsePrice(x.prijs) - parsePrice(y.prijs));

  return {
    bestMatch: kiesBesteMatch(uit),
    bestType: "Algemeen",
    filteredMatchedAirfryers: uit,
    topWens: Math.max(...uit.map(af => af.wens)),
  };
}

// De kaartpunten ("Waarom dit bij jou past") staan in punten.js.
