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

// ───────── Matching per stofzuiger (sinds 22-10-2026) ─────────
// Zelfde opzet als de andere keuzehulpen: type (snoer of steel) en budget zijn
// harde grenzen, elke stofzuiger krijgt een passcore en de lijst is alles wat
// dicht bij de top zit. Vroeger een rij filters die stil wegvielen; de
// vloervraag liet Bosch en Miele (geen ondergrond-gegevens) ongemerkt vallen.
//
// Passcore = 100
//   - een wens (zak/zakloos, extra's) die hij niet heeft: −150, onbekend: −40
//   - woning: snoer korter dan nodig −6 per meter; accu korter dan nodig −1,5
//     per minuut (onbekend −5 / −15)
//   - stil gewenst: −3 per dB boven het gemiddelde van dat type in de lijst
//   - prijs: de duurste in de lijst verliest tot 5 punten
// `wens` is dezelfde score zonder het prijsdeel (voor de "Meer budget?"-kaart).
const WENS = 150, WENS_ONBEKEND = 40;
export const BAND_BESTE = 4;
const BAND_LIJST = 10;
const MIN_LIJST = 5;
const MAX_LIJST = 20;          // was 30; in de Ads-test viel 1 van de 144 winkelkliks voorbij plek 20 (26-10-2026)
const PRIJS_GEWICHT = 5;

export const isSteel = s => s.stofzuigerType === "Steelstofzuiger";
// Woninggrootte → minimale snoerlengte (actieradius) of accuduur
export const ACTIERADIUS_MIN = { klein: 8, gemiddeld: 10, groot: 12 };
export const LOOPTIJD_MIN = { klein: 30, gemiddeld: 45, groot: 60 };

export const lijst = a => (Array.isArray(a) ? a : []).filter(v => v !== "geen");

/** Heeft de stofzuiger deze extra? true / false / null (onbekend). Zie utils.js. */
export function heeftExtra(s, wens) {
  switch (wens) {
    case "huisdieren": return s.huisdieren ?? null;
    case "allergie": return s.allergie ?? null;
    case "parket": return s.parket ?? null;
    case "dweilen": return s.dweilen ?? null;
    case "accu": return s.extraAccu ?? null;
    default: return true;
  }
}

/** Past de opvang bij het antwoord (met of zonder zak)? */
export function voldoetAanZak(s, zak) {
  const gewenst = { met_zak: "Stofzak", zonder_zak: "Zakloos" }[zak];
  if (!gewenst) return true;
  return s.containerType ? s.containerType === gewenst : null;
}

/** Groot genoeg bereik voor de woning? true / false / null. */
export function genoegBereik(s, woning) {
  if (isSteel(s)) {
    const min = LOOPTIJD_MIN[woning];
    if (!min) return true;
    return Number.isFinite(s.looptijdMinuten) ? s.looptijdMinuten >= min : null;
  }
  const min = ACTIERADIUS_MIN[woning];
  if (!min) return true;
  return Number.isFinite(s.actieradiusMeter) ? s.actieradiusMeter >= min : null;
}

function wensStraf(heeft) {
  if (heeft === true) return 0;
  return heeft === false ? WENS : WENS_ONBEKEND;
}

function straffen(s, a, gemDb) {
  let x = 0;
  if (!isSteel(s)) x += a.zak === "met_zak" || a.zak === "zonder_zak" ? wensStraf(voldoetAanZak(s, a.zak)) : 0;
  for (const e of lijst(a.extraAnswers)) x += wensStraf(heeftExtra(s, e));

  if (isSteel(s)) {
    const min = LOOPTIJD_MIN[a.woning];
    if (min) x += Number.isFinite(s.looptijdMinuten) ? Math.max(0, min - s.looptijdMinuten) * 1.5 : 15;
  } else {
    const min = ACTIERADIUS_MIN[a.woning];
    if (min) x += Number.isFinite(s.actieradiusMeter) ? Math.max(0, min - s.actieradiusMeter) * 6 : 5;
  }
  if (a.stil === "ja") x += Number.isFinite(s.geluidsniveauDb) ? Math.max(0, s.geluidsniveauDb - gemDb) * 3 : 5;
  return x;
}

// Plek van een prijs binnen een lijst: 0 = goedkoopste, 1 = duurste.
function prijsPlek(pool) {
  const prijzen = pool.map(s => parsePrice(s.prijs)).sort((x, y) => x - y);
  return prijs => (prijzen.length < 2 ? 0 : prijzen.filter(x => x < prijs).length / (prijzen.length - 1));
}

export function scoreStofzuigers(pool, answers = {}) {
  const plek = prijsPlek(pool);
  const db = pool.map(s => s.geluidsniveauDb).filter(Number.isFinite);
  const gemDb = db.length ? db.reduce((a, b) => a + b, 0) / db.length : 0;
  return pool.map(s => {
    const wens = 100 - straffen(s, answers, gemDb);
    const fit = wens - PRIJS_GEWICHT * plek(parsePrice(s.prijs));
    return { ...s, wens: Math.round(wens * 10) / 10, fit: Math.round(fit * 10) / 10 };
  });
}

/** Beste match: de goedkoopste van de stofzuigers die even goed passen als de beste. */
export function kiesBesteMatch(lijstIn) {
  const metScore = (lijstIn ?? []).filter(s => Number.isFinite(s?.fit));
  if (!metScore.length) return null;
  const top = Math.max(...metScore.map(s => s.fit));
  return metScore.filter(s => s.fit >= top - BAND_BESTE).reduce((a, b) => {
    const pa = parsePrice(a.prijs), pb = parsePrice(b.prijs);
    return pb < pa || (pb === pa && b.fit > a.fit) ? b : a;
  });
}

/**
 * @param {object[]} stofzuigers genormaliseerde stofzuigers (utils.normalizeProducts)
 * @param {object} answers       antwoorden uit de quiz (answers.budget: maximum of null)
 * @param {number|null} [budget] overschrijft answers.budget (null = zonder grens)
 */
export function matchStofzuigers(stofzuigers, answers, budget = answers?.budget) {
  const leeg = { bestMatch: null, bestType: null, filteredMatchedStofzuigers: [], topWens: null };
  if (!Array.isArray(stofzuigers) || !answers?.stofzuigerType) return leeg;

  const cap = Number(budget) || null;
  const pool = stofzuigers.filter(s => s.stofzuigerType === answers.stofzuigerType && (!cap || parsePrice(s.prijs) <= cap));
  if (pool.length === 0) return leeg;

  const gescoord = scoreStofzuigers(pool, answers).sort((x, y) => y.fit - x.fit);
  const top = gescoord[0].fit;
  const uit = [];
  let zichtbaar = 0;
  for (const s of gescoord) {
    if (zichtbaar >= MAX_LIJST) break;
    if (s.fit < top - BAND_LIJST && zichtbaar >= MIN_LIJST) break;
    uit.push(s);
    if ((s.aanbieders ?? []).length >= DEFAULT_MIN_AANBIEDERS) zichtbaar++;
  }
  uit.sort((x, y) => parsePrice(x.prijs) - parsePrice(y.prijs));

  return {
    bestMatch: kiesBesteMatch(uit),
    bestType: answers.stofzuigerType,
    filteredMatchedStofzuigers: uit,
    topWens: Math.max(...uit.map(s => s.wens)),
  };
}

// De kaartpunten ("Waarom dit bij jou past") staan in punten.js.
