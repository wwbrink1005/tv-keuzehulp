import { capaciteitGroupToAllowedCapaciteit, heeftWasprogramma, isCapaciteitInGroup } from "./data.js";
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

// Geen scoring-as (meer); behouden als no-op voor de localStorage-vorm.
export function calculateScores() {
  return {};
}

// ───────── Matching per wasmachine (sinds 20-10-2026) ─────────
// Zelfde opzet als tv, printer en laptop: de minimale trommelinhoud en het
// budget zijn harde grenzen, elke wasmachine krijgt een passcore en de lijst is
// alles wat dicht bij de top zit.
//
// Vroeger een rij filters na elkaar op velden die bij Bosch, Siemens en Miele
// (samen bijna de helft van het aanbod) leeg waren: wie "stoom" of
// "invertermotor" koos, kreeg nooit een van die merken. Nu telt alleen wat bij
// alle merken bekend is of eerlijk te bepalen; onbekend kost minder dan nee.
//
// Passcore = 100
//   - een wens (programma of extra) die hij niet heeft: −150, onbekend: −40
//   - stil gewenst: −4 per dB boven STIL_DREMPEL (72 dB)
//   - droog gewenst: droogklasse B −20, C of slechter −40, onbekend −10
//   - trommel kleiner of groter dan ideaal voor het huishouden
//   - prijs: de duurste in de lijst verliest tot 5 punten
// `wens` is dezelfde score zonder het prijsdeel (voor de "Meer budget?"-kaart).
const WENS = 150, WENS_ONBEKEND = 40;
// Tot en met 72 dB telt als stil. Was 70: dan won bij "geen voorkeur" een Miele van €1.709
// (68 dB) van een AEG van €849 (72 dB), om 4 dB die je nauwelijks hoort (20-10-2026).
export const STIL_DREMPEL = 72;
export const BAND_BESTE = 4;
const BAND_LIJST = 10;
const MIN_LIJST = 5;
const MAX_LIJST = 20;          // was 30; in de Ads-test viel 1 van de 144 winkelkliks voorbij plek 20 (26-10-2026)
const PRIJS_GEWICHT = 5;

export const EXTRA_KENMERK = {
  dosering: w => w.dosering,
  stoom: w => w.stoom,
  app: w => w.app,
  aquastop: w => w.lekbeveiliging,
};

export const lijst = a => (Array.isArray(a) ? a : []).filter(v => v !== "geen");

/** Heeft de wasmachine dit programma? true / false / null (lijst onvolledig). */
export function heeftProgramma(w, key) {
  if (heeftWasprogramma(w.wasprogrammas, key)) return true;
  return w.programmasVolledig ? false : null;
}

function wensStraf(heeft) {
  if (heeft === true) return 0;
  return heeft === false ? WENS : WENS_ONBEKEND;
}

function straffen(w, a) {
  let s = 0;
  for (const p of lijst(a.programmaAnswers)) s += wensStraf(heeftProgramma(w, p));
  for (const e of lijst(a.extraAnswers)) s += wensStraf(EXTRA_KENMERK[e]?.(w) ?? null);

  if (a.stil === "ja" && Number.isFinite(w.geluidDb)) s += Math.max(0, w.geluidDb - STIL_DREMPEL) * 4;
  if (a.droog === "ja") s += w.droogklasse === "A" ? 0 : w.droogklasse === "B" ? 20 : w.droogklasse ? 40 : 10;

  const cap = capaciteitGroupToAllowedCapaciteit[a.capaciteitGroup];
  if (cap && Number.isFinite(w.capaciteit)) {
    if (w.capaciteit < cap.idealMin) s += (cap.idealMin - w.capaciteit) * 20;
    if (w.capaciteit > cap.idealMax) s += (w.capaciteit - cap.idealMax) * 4;
  }
  return s;
}

// Plek van een prijs binnen een lijst: 0 = goedkoopste, 1 = duurste.
function prijsPlek(pool) {
  const prijzen = pool.map(w => parsePrice(w.prijs)).sort((x, y) => x - y);
  return prijs => (prijzen.length < 2 ? 0 : prijzen.filter(x => x < prijs).length / (prijzen.length - 1));
}

export function scoreWasmachines(pool, answers = {}) {
  const plek = prijsPlek(pool);
  return pool.map(w => {
    const wens = 100 - straffen(w, answers);
    const fit = wens - PRIJS_GEWICHT * plek(parsePrice(w.prijs));
    return { ...w, wens: Math.round(wens * 10) / 10, fit: Math.round(fit * 10) / 10 };
  });
}

/** Beste match: de goedkoopste van de wasmachines die even goed passen als de beste. */
export function kiesBesteMatch(lijstIn) {
  const metScore = (lijstIn ?? []).filter(w => Number.isFinite(w?.fit));
  if (!metScore.length) return null;
  const top = Math.max(...metScore.map(w => w.fit));
  return metScore
    .filter(w => w.fit >= top - BAND_BESTE)
    .reduce((a, b) => {
      const pa = parsePrice(a.prijs), pb = parsePrice(b.prijs);
      return pb < pa || (pb === pa && b.fit > a.fit) ? b : a;
    });
}

/**
 * @param {object[]} wasmachines  genormaliseerde wasmachines (utils.normalizeProducts)
 * @param {string} capaciteitGroup klein / gemiddeld / groot
 * @param {number|null} budget     maximumbedrag uit de quiz, of null (geen voorkeur)
 * @param {object} answers         antwoorden uit de quiz
 */
export function matchWasmachines(wasmachines, capaciteitGroup, budget, answers) {
  const leeg = { bestMatch: null, bestType: null, filteredMatchedWasmachines: [], topWens: null };
  if (!Array.isArray(wasmachines) || !capaciteitGroup) return leeg;

  const cap = Number(budget) || null;
  const pool = wasmachines.filter(w => isCapaciteitInGroup(w.capaciteit, capaciteitGroup) && (!cap || parsePrice(w.prijs) <= cap));
  if (pool.length === 0) return leeg;

  const gescoord = scoreWasmachines(pool, { ...answers, capaciteitGroup }).sort((x, y) => y.fit - x.fit);
  const top = gescoord[0].fit;
  // Alles binnen de band, maar door tot er minstens MIN_LIJST wasmachines in
  // zitten die door het standaardfilter "2+ winkels" op de resultaatpagina komen.
  const resultaat = [];
  let zichtbaar = 0;
  for (const w of gescoord) {
    if (zichtbaar >= MAX_LIJST) break;
    if (w.fit < top - BAND_LIJST && zichtbaar >= MIN_LIJST) break;
    resultaat.push(w);
    if ((w.aanbieders ?? []).length >= DEFAULT_MIN_AANBIEDERS) zichtbaar++;
  }
  resultaat.sort((x, y) => parsePrice(x.prijs) - parsePrice(y.prijs));

  const bestMatch = kiesBesteMatch(resultaat);
  return {
    bestMatch,
    bestType: "Algemeen",
    filteredMatchedWasmachines: resultaat,
    topWens: Math.max(...resultaat.map(w => w.wens)),
  };
}

// De kaartpunten ("Waarom dit bij jou past") staan in punten.js.
