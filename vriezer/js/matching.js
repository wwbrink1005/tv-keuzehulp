import { LABEL_VOLGORDE } from "./data.js";
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

// ─── Harde filters: soort (inbouw / vrieskast / vrieskist) en nis of formaat ──

export function filterByPlaatsing(vriezers, plaatsing) {
  return vriezers.filter(v => v.plaatsing === plaatsing);
}

// Gracieus: heeft de gekozen nis of het formaat geen enkele vriezer, dan alle
// vriezers van die soort in plaats van een lege lijst.
export function filterBySubGroup(vriezers, plaatsing, subGroup) {
  if (!subGroup) return vriezers;
  const matched = plaatsing === "inbouw"
    ? vriezers.filter(v => v.nishoogteGroup === Number(subGroup))
    : vriezers.filter(v => v.grootteGroup === subGroup);
  return matched.length > 0 ? matched : vriezers;
}

/** Soort + nis/formaat: de vriezers die mogen meedoen (zonder budget). */
export function poolVoor(vriezers, answers) {
  const sub = answers?.plaatsing === "inbouw" ? answers?.nishoogte : answers?.grootte;
  return filterBySubGroup(filterByPlaatsing(vriezers, answers?.plaatsing), answers?.plaatsing, sub);
}

// ───────── Matching per vriezer (sinds 25-10-2026) ─────────
// Zelfde opzet als de andere keuzehulpen: soort, nis/formaat en budget zijn
// een harde grens, elke vriezer krijgt een passcore en de lijst is alles wat
// dicht bij de top zit. Vroeger: filters na elkaar en de goedkoopste als
// "beste match".
//
// Passcore = 100
//   - een wens (No Frost, garage) die hij niet heeft: −150, onbekend: −40
//   - zuinig gewenst: −5 per labelstap boven de zuinigste van de lijst
//     (onbekend −15, als drie stappen: onbekend mag niet winnen van een bekend label)
//   - stil gewenst: −2 per dB boven de stilste van de lijst (onbekend −6).
//     Bewust de stilste, niet het gemiddelde: anders won een luider model op
//     prijs (zelfde regel als vaatwasser, okt. 2026).
//   - prijs: de duurste in de lijst verliest tot 5 punten
// `wens` is dezelfde score zonder het prijsdeel (voor de "Meer budget?"-kaart).
const WENS_STRAF = 150, WENS_ONBEKEND = 40;
export const BAND_BESTE = 4;
const BAND_LIJST = 10;
const MIN_LIJST = 5;
const MAX_LIJST = 30;
const PRIJS_GEWICHT = 5;

export const lijst = a => (Array.isArray(a) ? a : []).filter(v => v !== "geen");
// Zuinig en stil zijn een score; No Frost en garage zijn wensen.
export const WENSEN = ["nofrost", "garage"];
export const extraWensen = a => lijst(a?.extraAnswers).filter(w => WENSEN.includes(w));

/** Heeft de vriezer deze wens? true / false / null (onbekend). */
export function heeftWens(v, wens) {
  if (wens === "nofrost") return v.nofrost;
  if (wens === "garage") return v.garage;
  return true;
}

const labelRang = v => (LABEL_VOLGORDE.includes(v.energielabel) ? LABEL_VOLGORDE.indexOf(v.energielabel) : null);

function straffen(v, a, ctx) {
  let s = 0;
  for (const w of extraWensen(a)) {
    const h = heeftWens(v, w);
    s += h === true ? 0 : h === false ? WENS_STRAF : WENS_ONBEKEND;
  }
  const ex = lijst(a.extraAnswers);
  if (ex.includes("energiezuinig")) {
    const r = labelRang(v);
    // 5 per stap: groter dan de marge van de Beste match (4), zodat een
    // zuiniger label echt wint als je erom vraagt
    s += r === null ? 15 : (r - ctx.besteLabel) * 5;
  }
  if (ex.includes("stil")) {
    s += Number.isFinite(v.geluidsniveauDb) ? (v.geluidsniveauDb - ctx.stilste) * 2 : 6;
  }
  return s;
}

// Plek van een prijs binnen een lijst: 0 = goedkoopste, 1 = duurste.
function prijsPlek(pool) {
  const prijzen = pool.map(v => parsePrice(v.prijs)).sort((x, y) => x - y);
  return prijs => (prijzen.length < 2 ? 0 : prijzen.filter(x => x < prijs).length / (prijzen.length - 1));
}

export function scoreVriezers(pool, answers = {}) {
  const plek = prijsPlek(pool);
  const db = pool.map(v => v.geluidsniveauDb).filter(Number.isFinite);
  const rangen = pool.map(labelRang).filter(r => r !== null);
  const ctx = {
    stilste: db.length ? Math.min(...db) : 0,
    besteLabel: rangen.length ? Math.min(...rangen) : 0,
  };
  return pool.map(v => {
    const wens = 100 - straffen(v, answers, ctx);
    const fit = wens - PRIJS_GEWICHT * plek(parsePrice(v.prijs));
    return { ...v, wens: Math.round(wens * 10) / 10, fit: Math.round(fit * 10) / 10 };
  });
}

/** Beste match: de goedkoopste van de vriezers die even goed passen als de beste. */
export function kiesBesteMatch(lijstIn) {
  const metScore = (lijstIn ?? []).filter(v => Number.isFinite(v?.fit));
  if (!metScore.length) return null;
  const top = Math.max(...metScore.map(v => v.fit));
  return metScore.filter(v => v.fit >= top - BAND_BESTE).reduce((x, y) => {
    const px = parsePrice(x.prijs), py = parsePrice(y.prijs);
    return py < px || (py === px && y.fit > x.fit) ? y : x;
  });
}

const BEST_TYPE = { inbouw: "Inbouw", vrijstaand: "Vrijstaand kastmodel", vrieskist: "Vrieskist" };

/**
 * @param {object[]} vriezers     genormaliseerde vriezers (utils.normalizeProducts)
 * @param {object} answers        antwoorden uit de quiz (answers.budget: maximum of null)
 * @param {number|null} [budget]  overschrijft answers.budget (null = zonder grens)
 */
export function matchVriezers(vriezers, answers, budget = answers?.budget) {
  const leeg = { bestMatch: null, bestType: null, filteredMatchedVriezers: [], topWens: null };
  if (!Array.isArray(vriezers) || !answers?.plaatsing) return leeg;

  const cap = Number(budget) || null;
  const pool = poolVoor(vriezers, answers).filter(v => !cap || parsePrice(v.prijs) <= cap);
  if (pool.length === 0) return leeg;

  const gescoord = scoreVriezers(pool, answers).sort((x, y) => y.fit - x.fit);
  const top = gescoord[0].fit;
  const uit = [];
  let zichtbaar = 0;
  for (const v of gescoord) {
    if (zichtbaar >= MAX_LIJST) break;
    if (v.fit < top - BAND_LIJST && zichtbaar >= MIN_LIJST) break;
    uit.push(v);
    if ((v.aanbieders ?? []).length >= DEFAULT_MIN_AANBIEDERS) zichtbaar++;
  }
  uit.sort((x, y) => parsePrice(x.prijs) - parsePrice(y.prijs));

  return {
    bestMatch: kiesBesteMatch(uit),
    bestType: BEST_TYPE[answers.plaatsing] ?? null,
    filteredMatchedVriezers: uit,
    topWens: Math.max(...uit.map(v => v.wens)),
  };
}

// De kaartpunten ("Waarom dit bij jou past") staan in punten.js.
