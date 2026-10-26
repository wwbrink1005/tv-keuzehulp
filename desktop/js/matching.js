import { scoringSystem, TIER_ORDER } from "./data.js";
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

// ─── Punten per processorklasse ─────────────────────────────────────────────

export function calculateScores(answers) {
  const scores = { Budget: 0, Mid: 0, Krachtig: 0, Topklasse: 0 };
  const gebruik     = Array.isArray(answers.gebruik) ? answers.gebruik : (answers.gebruik ? [answers.gebruik] : []);
  const intensiteit = answers.intensiteit ?? "";
  for (const g of gebruik) {
    if (scoringSystem.gebruik[g]) for (const tier of TIER_ORDER) scores[tier] += scoringSystem.gebruik[g][tier] ?? 0;
  }
  if (intensiteit && scoringSystem.intensiteit[intensiteit]) {
    for (const tier of TIER_ORDER) scores[tier] += scoringSystem.intensiteit[intensiteit][tier] ?? 0;
  }
  return scores;
}

// ─── Wensen: true / false / null (onbekend) ────────────────────────────────
const lijst = v => (Array.isArray(v) ? v : v ? [v] : []);
export const OS_WENS = { windows: "Windows", mac: "macOS" };

/** Opslagwens waargemaakt? */
export function genoegOpslag(d, opslag) {
  const min = { gemiddeld: 1000, veel: 2000 }[opslag];
  if (!min) return true;
  return d.opslag > 0 ? d.opslag >= min : null;
}

/** Krachtig genoeg voor wat je ermee doet? Gamen: losse videokaart. Creatief: losse videokaart of een krachtige processor. */
export function voldoetAanGebruik(d, gebruik) {
  const g = lijst(gebruik);
  if (g.includes("gaming")) return d.gpuLos ?? null;
  if (g.includes("creatief")) {
    if (d.gpuLos === true) return true;
    if (d.processorTier == null) return null;
    return d.processorTier === "Krachtig" || d.processorTier === "Topklasse";
  }
  return true;
}

// ───────── Matching per desktop (sinds 22-10-2026) ─────────
// Zelfde opzet als laptop: behuizing en budget zijn harde grenzen, het gekozen
// systeem (Windows/Mac) ook zodra het er is. Elke desktop krijgt een passcore
// en de lijst is alles wat dicht bij de top zit. Vroeger telde alleen de
// videokaart (de processor kwam nooit uit Icecat) en vielen wensen stil weg.
//
// Passcore = 100
//   - 3 per punt dat de processorklasse achterloopt op de best passende klasse
//   - 150 per wens die de desktop niet waarmaakt (opslag, krachtig genoeg voor
//     creatief werk); losse videokaart bij gamen dubbel; 50 bij onbekend
//   - werkgeheugen bij gemiddeld en intensief gebruik
//   - prijs: bij licht gebruik wint goedkoper duidelijk, bij intensief niet
// `wens` is dezelfde score zonder het prijsdeel (voor de "Meer budget?"-kaart).
const PUNTEN_PER_KLASSEPUNT = 3;
const WENS = 150, WENS_ONBEKEND = 50, OS_MIS = 1000;
export const BAND_BESTE = 4;
const BAND_LIJST = 10;
const MIN_LIJST = 5;
const MAX_LIJST = 20;          // was 30; in de Ads-test viel 1 van de 144 winkelkliks voorbij plek 20 (26-10-2026)
const PRIJS_GEWICHT = { licht: 8, gemiddeld: 4, intensief: 1 };

function wensStraf(heeft) {
  if (heeft === true) return 0;
  return heeft === false ? WENS : WENS_ONBEKEND;
}

function straffen(d, a) {
  let s = 0;
  const gebruik = lijst(a.gebruik);
  const os = OS_WENS[a.os];
  if (os) s += d.systeem ? (d.systeem === os ? 0 : OS_MIS) : WENS_ONBEKEND;
  const kracht = voldoetAanGebruik(d, gebruik);
  s += gebruik.includes("gaming") && kracht === false ? 2 * WENS : wensStraf(kracht);
  s += wensStraf(genoegOpslag(d, a.opslag));
  if (d.ram > 0) {
    if (a.intensiteit === "intensief") s += d.ram < 16 ? 12 : d.ram < 32 ? 4 : 0;
    else if (a.intensiteit === "gemiddeld") s += d.ram < 16 ? 8 : 0;
  }
  return s;
}

// Plek van een prijs binnen een lijst: 0 = goedkoopste, 1 = duurste.
function prijsPlek(pool) {
  const prijzen = pool.map(d => parsePrice(d.prijs)).sort((x, y) => x - y);
  return prijs => (prijzen.length < 2 ? 0 : prijzen.filter(x => x < prijs).length / (prijzen.length - 1));
}

export function scoreDesktops(pool, answers = {}) {
  const scores = calculateScores(answers);
  const top = Math.max(...TIER_ORDER.map(t => scores[t]));
  const plek = prijsPlek(pool);
  const gewicht = PRIJS_GEWICHT[answers.intensiteit] ?? 4;
  return pool.map(d => {
    // Onbekende processor: als middenklasse rekenen, met een kleine aftrek
    const tier = d.processorTier ?? "Mid";
    const klasse = Math.max(0, top - scores[tier]) * PUNTEN_PER_KLASSEPUNT + (d.processorTier ? 0 : 6);
    const wens = 100 - klasse - straffen(d, answers);
    const fit = wens - gewicht * plek(parsePrice(d.prijs));
    return { ...d, tier, wens: Math.round(wens * 10) / 10, fit: Math.round(fit * 10) / 10 };
  });
}

/**
 * Beste match: de goedkoopste van de desktops die even goed passen als de
 * beste; bij intensief gebruik eerst de krachtigste processorklasse daarvan.
 */
export function kiesBesteMatch(lijstIn, answers) {
  let kandidaten = (lijstIn ?? []).filter(d => Number.isFinite(d?.fit));
  if (!kandidaten.length) return null;
  const top = Math.max(...kandidaten.map(d => d.fit));
  kandidaten = kandidaten.filter(d => d.fit >= top - BAND_BESTE);
  if (answers?.intensiteit === "intensief") {
    const rang = d => TIER_ORDER.indexOf(d.tier ?? d.processorTier ?? "Mid");
    const hoogste = Math.max(...kandidaten.map(rang));
    kandidaten = kandidaten.filter(d => rang(d) === hoogste);
  }
  return kandidaten.reduce((x, y) => {
    const px = parsePrice(x.prijs), py = parsePrice(y.prijs);
    return py < px || (py === px && y.fit > x.fit) ? y : x;
  });
}

/**
 * @param {object[]} desktops     genormaliseerde desktops (utils.normalizeProducts)
 * @param {string} behuizingType  antwoord op de behuizingvraag
 * @param {number|null} budget    maximumbedrag uit de quiz, of null
 * @param {object} answers        antwoorden uit de quiz
 */
export function matchDesktops(desktops, behuizingType, budget, answers) {
  const leeg = { bestMatch: null, bestType: null, filteredMatchedDesktops: [], topWens: null };
  if (!Array.isArray(desktops)) return leeg;

  const cap = Number(budget) || null;
  let pool = desktops.filter(d =>
    (!behuizingType || behuizingType === "maakt-niet-uit" || d.behuizingCategory === behuizingType) &&
    (!cap || parsePrice(d.prijs) <= cap));
  // Het gekozen systeem is een harde grens zodra het er is (zelfde als laptop):
  // liever 3 Macs dan een Windows-pc ertussen.
  const os = OS_WENS[answers?.os];
  if (os && pool.some(d => d.systeem === os)) pool = pool.filter(d => d.systeem === os);
  if (pool.length === 0) return leeg;

  const gescoord = scoreDesktops(pool, answers ?? {}).sort((x, y) => y.fit - x.fit);
  const top = gescoord[0].fit;
  const uit = [];
  let zichtbaar = 0;
  for (const d of gescoord) {
    if (zichtbaar >= MAX_LIJST) break;
    if (d.fit < top - BAND_LIJST && zichtbaar >= MIN_LIJST) break;
    uit.push(d);
    if ((d.aanbieders ?? []).length >= DEFAULT_MIN_AANBIEDERS) zichtbaar++;
  }
  uit.sort((x, y) => parsePrice(x.prijs) - parsePrice(y.prijs));

  const bestMatch = kiesBesteMatch(uit, answers);
  return {
    bestMatch,
    bestType: bestMatch?.tier ?? null,
    filteredMatchedDesktops: uit,
    topWens: Math.max(...uit.map(d => d.wens)),
  };
}

// De kaartpunten ("Waarom dit bij jou past") staan in punten.js.
