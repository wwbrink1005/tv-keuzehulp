import { capaciteitGroupToAllowedCapaciteit, heeftDroogprogramma, isCapaciteitInGroup, ENERGIE_RANG } from "./data.js";
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

// ───────── Matching per wasdroger (sinds 22-10-2026) ─────────
// Zelfde opzet als de wasmachine: de minimale trommelinhoud en het budget zijn
// harde grenzen, elke droger krijgt een passcore en de lijst is alles wat dicht
// bij de top zit. Vroeger een rij filters die stil wegvielen, met wensen die
// vrijwel elke droger heeft (uitgestelde start, vochtsensor, kinderslot) en
// anti-kreuk, dat bij Bosch en Siemens onterecht op "Nee" staat.
//
// Passcore = 100
//   - een wens (programma of extra) die hij niet heeft: −150, onbekend: −40
//   - stil gewenst: −4 per dB boven STIL_DREMPEL (62 dB)
//   - energielabel: −1,5 per klasse onder A (stroomkosten), ook zonder wens
//   - trommel kleiner of groter dan ideaal voor het huishouden
//   - prijs: de duurste in de lijst verliest tot 5 punten
// `wens` is dezelfde score zonder het prijsdeel (voor de "Meer budget?"-kaart).
const WENS = 150, WENS_ONBEKEND = 40;
// Drogers maken 56 tot 67 dB; tot en met 62 dB telt als stil.
export const STIL_DREMPEL = 62;
export const BAND_BESTE = 4;
const BAND_LIJST = 10;
const MIN_LIJST = 5;
const MAX_LIJST = 20;          // was 30; in de Ads-test viel 1 van de 144 winkelkliks voorbij plek 20 (26-10-2026)
const PRIJS_GEWICHT = 5;
const PER_ENERGIEKLASSE = 1.5;

const jaNee = v => (v === true || /^ja$/i.test(v ?? "") ? true : v === false || /^nee$/i.test(v ?? "") ? false : null);
export const EXTRA_KENMERK = {
  zuinig: w => (w.energieLabel ? w.energieLabel === "A" : null),
  app: w => jaNee(w.app),
};

export const lijst = a => (Array.isArray(a) ? a : []).filter(v => v !== "geen");

/** Heeft de droger dit programma? true / false / null (lijst onvolledig). */
export function heeftProgramma(w, key) {
  if (heeftDroogprogramma(w.droogprogrammas, key)) return true;
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
  const rang = ENERGIE_RANG[w.energieLabel];
  if (Number.isFinite(rang)) s += rang * PER_ENERGIEKLASSE;

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

export function scoreWasdrogers(pool, answers = {}) {
  const plek = prijsPlek(pool);
  return pool.map(w => {
    const wens = 100 - straffen(w, answers);
    const fit = wens - PRIJS_GEWICHT * plek(parsePrice(w.prijs));
    return { ...w, wens: Math.round(wens * 10) / 10, fit: Math.round(fit * 10) / 10 };
  });
}

/** Beste match: de goedkoopste van de drogers die even goed passen als de beste. */
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
 * @param {object[]} wasdrogers    genormaliseerde drogers (utils.normalizeProducts)
 * @param {string} capaciteitGroup klein / gemiddeld / groot
 * @param {number|null} budget     maximumbedrag uit de quiz, of null (geen voorkeur)
 * @param {object} answers         antwoorden uit de quiz
 */
export function matchWasdrogers(wasdrogers, capaciteitGroup, budget, answers) {
  const leeg = { bestMatch: null, bestType: null, filteredMatchedWasdrogers: [], topWens: null };
  if (!Array.isArray(wasdrogers) || !capaciteitGroup) return leeg;

  const cap = Number(budget) || null;
  const pool = wasdrogers.filter(w => isCapaciteitInGroup(w.capaciteit, capaciteitGroup) && (!cap || parsePrice(w.prijs) <= cap));
  if (pool.length === 0) return leeg;

  const gescoord = scoreWasdrogers(pool, { ...answers, capaciteitGroup }).sort((x, y) => y.fit - x.fit);
  const top = gescoord[0].fit;
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
    filteredMatchedWasdrogers: resultaat,
    topWens: Math.max(...resultaat.map(w => w.wens)),
  };
}

// De kaartpunten ("Waarom dit bij jou past") staan in punten.js.
