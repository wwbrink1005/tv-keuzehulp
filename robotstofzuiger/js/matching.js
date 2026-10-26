import { woninggrootteMinLooptijd, LAAG_MAX_MM, HOGE_DREMPEL_CM, HUISDIER_PA } from "./data.js";
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

// ───────── Matching per robot (sinds 25-10-2026) ─────────
// Zelfde opzet als de andere keuzehulpen: het budget is een harde grens, elke
// robot krijgt een passcore en de lijst is alles wat dicht bij de top zit.
// Vroeger een rij filters op kenmerken die bijna elke robot heeft (LiDAR,
// dweilen, WiFi, Alexa); nu op wat ze echt onderscheidt: het basisstation,
// zuigkracht, hoogte en drempels.
//
// Passcore = 100
//   - een wens (station, extra) die hij niet heeft: −150, onbekend: −40
//   - vloer per beurt: −2 per 10 minuten accu te weinig (onbekend −5)
//   - tapijt: weinig zuigkracht en een dweilpad dat niet omhoog gaat kosten punten;
//     harde vloer: geen dweilfunctie kost punten, een wassend station levert op
//   - stil gewenst: −2 per dB boven het gemiddelde van de lijst
//   - prijs: de duurste in de lijst verliest tot 5 punten
// `wens` is dezelfde score zonder het prijsdeel (voor de "Meer budget?"-kaart).
const WENS = 150, WENS_ONBEKEND = 40;
export const BAND_BESTE = 4;
const BAND_LIJST = 10;
const MIN_LIJST = 5;
const MAX_LIJST = 20;          // was 30; in de Ads-test viel 1 van de 144 winkelkliks voorbij plek 20 (26-10-2026)
const PRIJS_GEWICHT = 5;

export const lijst = a => (Array.isArray(a) ? a : []).filter(v => v !== "geen");

/** Heeft de robot het gewenste station? "alles" telt ook als zelflegend. */
export function heeftStation(r, wens) {
  if (wens !== "zelflegend" && wens !== "alles") return true;
  if (!r.station) return null;
  if (wens === "alles") return r.station === "alles";
  return r.station === "alles" || r.station === "zelflegend";
}

/** Heeft de robot deze extra? true / false / null (onbekend). */
export function heeftExtra(r, wens) {
  switch (wens) {
    case "huisdieren": return Number.isFinite(r.zuigkracht) ? r.zuigkracht >= HUISDIER_PA : null;
    case "laag": return Number.isFinite(r.hoogteMm) ? r.hoogteMm <= LAAG_MAX_MM : null;
    case "drempel": return Number.isFinite(r.drempelCm) ? r.drempelCm >= HOGE_DREMPEL_CM : null;
    default: return true;
  }
}

/** Gaat de accu lang genoeg mee voor het oppervlak? true / false / null. */
export function genoegLooptijd(r, woninggrootte) {
  const min = woninggrootteMinLooptijd[woninggrootte];
  if (!min) return true;
  return Number.isFinite(r.looptijdMin) ? r.looptijdMin >= min : null;
}

function wensStraf(heeft) {
  if (heeft === true) return 0;
  return heeft === false ? WENS : WENS_ONBEKEND;
}

function straffen(r, a, gemDb) {
  let s = 0;
  if (a.station === "zelflegend" || a.station === "alles") s += wensStraf(heeftStation(r, a.station));
  for (const e of lijst(a.extraAnswers)) s += wensStraf(heeftExtra(r, e));

  const min = woninggrootteMinLooptijd[a.woninggrootte];
  if (min) s += Number.isFinite(r.looptijdMin) ? Math.max(0, min - r.looptijdMin) / 10 * 2 : 5;

  const pa = r.zuigkracht;
  if (a.vloer === "tapijt" || a.vloer === "allebei") {
    const zwaar = a.vloer === "tapijt" ? 1 : 0.5;
    s += zwaar * (Number.isFinite(pa) ? (pa < 10000 ? 10 : pa < 20000 ? 4 : 0) : 3);
    if (r.dweilOmhoog === false) s += zwaar * 6;
  }
  if (a.vloer === "harde_vloer" || a.vloer === "allebei") {
    const zwaar = a.vloer === "harde_vloer" ? 1 : 0.5;
    if (r.natDweilen !== "Ja") s += zwaar * 10;
  }
  if (a.stil === "ja") s += Number.isFinite(r.geluidDb) ? Math.max(0, r.geluidDb - gemDb) * 2 : 4;
  return s;
}

function bonussen(r, a) {
  let b = 0;
  if (a.vloer === "tapijt" && r.dweilOmhoog === true) b += 2;
  if (a.vloer === "harde_vloer" && r.station === "alles") b += 2;
  return b;
}

// Plek van een prijs binnen een lijst: 0 = goedkoopste, 1 = duurste.
function prijsPlek(pool) {
  const prijzen = pool.map(r => parsePrice(r.prijs)).sort((x, y) => x - y);
  return prijs => (prijzen.length < 2 ? 0 : prijzen.filter(x => x < prijs).length / (prijzen.length - 1));
}

export function scoreRobots(pool, answers = {}) {
  const plek = prijsPlek(pool);
  const db = pool.map(r => r.geluidDb).filter(Number.isFinite);
  const gemDb = db.length ? db.reduce((x, y) => x + y, 0) / db.length : 0;
  return pool.map(r => {
    const wens = 100 - straffen(r, answers, gemDb) + bonussen(r, answers);
    const fit = wens - PRIJS_GEWICHT * plek(parsePrice(r.prijs));
    return { ...r, wens: Math.round(wens * 10) / 10, fit: Math.round(fit * 10) / 10 };
  });
}

/** Beste match: de goedkoopste van de robots die even goed passen als de beste. */
export function kiesBesteMatch(lijstIn) {
  const metScore = (lijstIn ?? []).filter(r => Number.isFinite(r?.fit));
  if (!metScore.length) return null;
  const top = Math.max(...metScore.map(r => r.fit));
  return metScore.filter(r => r.fit >= top - BAND_BESTE).reduce((x, y) => {
    const px = parsePrice(x.prijs), py = parsePrice(y.prijs);
    return py < px || (py === px && y.fit > x.fit) ? y : x;
  });
}

/**
 * @param {object[]} robots       genormaliseerde robots (utils.normalizeProducts)
 * @param {object} answers        antwoorden uit de quiz (answers.budget: maximum of null)
 * @param {number|null} [budget]  overschrijft answers.budget (null = zonder grens)
 */
export function matchRobotstofzuigers(robots, answers, budget = answers?.budget) {
  const leeg = { bestMatch: null, bestType: null, filteredMatchedRobotstofzuigers: [], topWens: null };
  if (!Array.isArray(robots) || robots.length === 0) return leeg;

  const cap = Number(budget) || null;
  const pool = robots.filter(r => !cap || parsePrice(r.prijs) <= cap);
  if (pool.length === 0) return leeg;

  const gescoord = scoreRobots(pool, answers ?? {}).sort((x, y) => y.fit - x.fit);
  const top = gescoord[0].fit;
  const uit = [];
  let zichtbaar = 0;
  for (const r of gescoord) {
    if (zichtbaar >= MAX_LIJST) break;
    if (r.fit < top - BAND_LIJST && zichtbaar >= MIN_LIJST) break;
    uit.push(r);
    if ((r.aanbieders ?? []).length >= DEFAULT_MIN_AANBIEDERS) zichtbaar++;
  }
  uit.sort((x, y) => parsePrice(x.prijs) - parsePrice(y.prijs));

  return {
    bestMatch: kiesBesteMatch(uit),
    bestType: "Algemeen",
    filteredMatchedRobotstofzuigers: uit,
    topWens: Math.max(...uit.map(r => r.wens)),
  };
}

// De kaartpunten ("Waarom dit bij jou past") staan in punten.js.
