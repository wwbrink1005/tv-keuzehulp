import { availableTypesBySize, ledSizeBonuses, scoringSystem, sizeGroupToAllowedSizes } from "./data.js";
import {
  getResolutionCategory,
  getResolutionTier,
  normalizeTypeLabel,
  parseHzValue,
  parsePrice
} from "./utils.js";

// Standaarddrempel voor het "aantal winkels"-filter op de resultaatpagina.
// Gedeeld tussen result.js (eerste render, vanuit de quiz-tijd localStorage-
// snapshot) en result-filters.js (live herberekening + het filter zelf),
// zodat de eerste paint al meteen de juiste, gefilterde telling toont i.p.v.
// heel kort de ongefilterde (incl. 1-winkel-producten) telling te flashen.
export const DEFAULT_MIN_AANBIEDERS = 2;

// Filtert op minimaal `startThreshold` winkels, met een cascade-fallback:
// levert dat 0 resultaten op, dan wordt de drempel stap voor stap verlaagd
// tot en met 1 (waar het altijd gelijk is aan `matches` zelf). Zo kan dit
// filter nooit op zichzelf een lege resultatenlijst veroorzaken.
export function applyMinAanbiedersCascade(matches, startThreshold = DEFAULT_MIN_AANBIEDERS) {
  const countAanbieders = tv => (tv.aanbieders ?? []).length;
  let effectiveMin = startThreshold;
  let result = matches.filter(tv => countAanbieders(tv) >= effectiveMin);

  while (result.length === 0 && effectiveMin > 1) {
    effectiveMin -= 1;
    result = matches.filter(tv => countAanbieders(tv) >= effectiveMin);
  }

  return { effectiveMin, result };
}

export function calculateScores(answers) {
  const scores = {
    "LED": 0,
    "Mini LED": 0,
    "QLED": 0,
    "OLED": 0
  };

  const usageAnswers = answers.usageAnswers ?? [];
  const quality = answers.quality ?? "";
  const timing = answers.timing ?? "";
  const viewing = answers.viewing ?? "";
  const extraAnswers = answers.extraAnswers ?? [];

  usageAnswers.forEach(value => {
    Object.keys(scores).forEach(type => {
      scores[type] += scoringSystem.usage[value][type];
    });
  });

  Object.keys(scores).forEach(type => {
    scores[type] += scoringSystem.quality[quality][type];
    scores[type] += scoringSystem.timing[timing][type];
    scores[type] += scoringSystem.viewing[viewing][type];
  });

  extraAnswers.forEach(value => {
    Object.keys(scores).forEach(type => {
      scores[type] += scoringSystem.extra[value][type];
    });
  });

  return scores;
}

export function applyResolutionFilter(tvs, quality) {
  if (quality === "prima") {
    return tvs;
  }

  // "2.4K Ultra HD" (2560x1440) heet in Icecat ook Ultra HD, maar is geen 4K.
  const isUltraHD = (scherpte) => {
    return (scherpte.includes("Ultra HD") || scherpte.includes("8K")) && !scherpte.includes("2.4K");
  };

  if (quality === "best") {
    let filtered = tvs.filter(tv => isUltraHD(tv.scherpte));
    if (filtered.length > 0) {
      return filtered;
    }

    filtered = tvs.filter(tv => tv.scherpte.includes("Full HD"));
    if (filtered.length > 0) {
      return filtered;
    }

    return tvs.filter(tv => tv.scherpte.includes("HD Ready"));
  }

  if (quality === "belangrijk") {
    let filtered = tvs.filter(tv =>
      tv.scherpte.includes("Full HD") || isUltraHD(tv.scherpte)
    );
    if (filtered.length > 0) {
      return filtered;
    }

    return tvs.filter(tv => tv.scherpte.includes("HD Ready"));
  }

  return tvs;
}

// Hz-voorkeur als stappen van ondergrenzen, van best naar minst. Eerder waren
// dit vaste lijsten (120, 144, 165), waardoor tv's met 170, 180 of 240 Hz bij
// gamen en sport juist wegvielen. Een tv valt in de eerste stap waar hij aan
// voldoet; de eerste niet-lege stap wint.
const HZ_STAPPEN = {
  gamen:      [120, 100, 60, 0],
  sport:      [100, 60, 0],
  best:       [100, 60, 0],
  belangrijk: [60, 0],
};

export function getHzPreferences(usageAnswers = [], quality = "") {
  if (usageAnswers.includes("gamen")) return HZ_STAPPEN.gamen;
  if (usageAnswers.includes("sport")) return HZ_STAPPEN.sport;
  if (quality === "best") return HZ_STAPPEN.best;
  if (quality === "belangrijk") return HZ_STAPPEN.belangrijk;
  return null;
}

export function applyHzFilter(tvs, usageAnswers, quality) {
  const stappen = getHzPreferences(usageAnswers, quality);
  if (!stappen) return tvs;
  for (const min of stappen) {
    const filtered = tvs.filter(tv => tv.Hz >= min);
    if (filtered.length > 0) return filtered;
  }
  return tvs;
}

// ───────── Matching per tv (sinds 14-10-2026) ─────────
// Vroeger won één type alles (vaak met 1 of 2 punten verschil) en gingen de
// resolutie- en Hz-wens er als harde filters overheen: in 20% van de
// antwoordcombinaties bleef er 1 tv over terwijl er gemiddeld 30 binnen maat
// en budget waren. Nu zijn alleen maat en budget harde grenzen; elke tv krijgt
// een passcore en de lijst bestaat uit alles wat dicht bij de top zit.
//
// Passcore = 100
//   - 3 per punt dat het type van de tv achterloopt op het best passende type
//   - resolutie onder de wens (beste beeld: geen 4K −30; belangrijk: HD Ready −20)
//   - Hz onder de wens (gamen: 120+, sport: 100+, beste beeld: 100+)
//   + HDR-formaten bij films of beste beeld (Dolby Vision, HDR10+)
//   + nieuw model, − ouder model (jaar uit de productnaam)
//   + prijs: bij "prima" wint goedkoper, bij "beste beeld" het duurdere model
//     binnen hetzelfde type (prijs is het enige signaal voor de modelserie dat
//     bij bijna elke tv bekend is)
// `wens` is dezelfde score zonder het prijsdeel: die is vergelijkbaar tussen
// lijsten met en zonder budget (voor de "Meer budget?"-kaart).
const PUNTEN_PER_TYPEPUNT = 3;
export const BAND_BESTE = 4;   // binnen zoveel punten van de top = even goed → goedkoopste is de beste match
const BAND_LIJST = 10;         // de lijst: alles binnen zoveel punten van de top
const MIN_LIJST = 5;           // en minstens zoveel tv's als de maat en het budget er hebben
const MAX_LIJST = 20;          // was 30; in de Ads-test viel 1 van de 144 winkelkliks voorbij plek 20 (26-10-2026)

function typeScores(scores, sizeGroup) {
  const s = { ...scores };
  s.LED = (Number(s.LED) || 0) + (ledSizeBonuses[sizeGroup] ?? 0);
  s["Neo QLED"] = Math.max(Number(s.QLED) || 0, Number(s["Mini LED"]) || 0);
  return s;
}

function hzStraf(hz, gebruik, quality) {
  if (gebruik.includes("gamen")) return hz >= 120 ? 0 : hz >= 100 ? 12 : 25;
  if (gebruik.includes("sport")) return hz >= 100 ? 0 : 15;
  if (quality === "best") return hz >= 100 ? 0 : 4;
  return 0;
}

function resolutieStraf(tv, quality) {
  const tier = getResolutionTier(tv);
  if (quality === "best") return tier === "4K" || tier === "8K" ? 0 : 30;
  if (quality === "belangrijk") return tier === "4K" || tier === "8K" || tier === "Full HD" ? 0 : 20;
  return 0;
}

function hdrBonus(tv, gebruik, quality) {
  if (!gebruik.includes("films") && quality !== "best") return 0;
  return (tv.dolbyVision ? 3 : 0) + (tv.hdr10plus ? 1 : 0);
}

function jaarBonus(tv) {
  if (!tv.jaar) return 0;
  const nu = new Date().getFullYear();
  if (tv.jaar >= nu - 1) return 2;
  if (tv.jaar === nu - 2) return 0;
  return -3;
}

// Plek van een prijs binnen een lijst: 0 = goedkoopste, 1 = duurste.
function prijsPlek(lijst) {
  const prijzen = lijst.map(tv => parsePrice(tv.prijs)).sort((a, b) => a - b);
  return prijs => (prijzen.length < 2 ? 0 : prijzen.filter(p => p < prijs).length / (prijzen.length - 1));
}

export function scoreTVs(pool, sizeGroup, answers, scores) {
  const ts = typeScores(scores, sizeGroup);
  const beschikbaar = availableTypesBySize[sizeGroup] ?? ["LED", "QLED", "Mini LED", "OLED"];
  const topType = Math.max(...beschikbaar.map(t => Number(ts[t]) || 0));
  const gebruik = answers.usageAnswers ?? [];
  const quality = answers.quality ?? "";
  const plekAlle = prijsPlek(pool);
  const plekPerType = {};
  for (const tv of pool) (plekPerType[tv.type] ??= []).push(tv);
  for (const t of Object.keys(plekPerType)) plekPerType[t] = prijsPlek(plekPerType[t]);

  return pool.map(tv => {
    const typeAchter = Math.max(0, topType - (Number(ts[tv.type]) || 0));
    const hz = parseHzValue(tv) ?? 60;
    const wens = 100
      - typeAchter * PUNTEN_PER_TYPEPUNT
      - resolutieStraf(tv, quality)
      - hzStraf(hz, gebruik, quality)
      + hdrBonus(tv, gebruik, quality)
      + jaarBonus(tv);
    const prijs = parsePrice(tv.prijs);
    const prijsDeel =
      quality === "prima" ? -8 * plekAlle(prijs) :
      quality === "belangrijk" ? -3 * plekAlle(prijs) :
      quality === "best" ? 4 * plekPerType[tv.type](prijs) : 0;
    return { ...tv, wens: Math.round(wens * 10) / 10, fit: Math.round((wens + prijsDeel) * 10) / 10 };
  });
}

/** Beste match: de goedkoopste van de tv's die even goed passen als de beste. */
export function kiesBesteMatch(lijst) {
  const metScore = (lijst ?? []).filter(tv => Number.isFinite(tv?.fit));
  if (!metScore.length) return null;
  const top = Math.max(...metScore.map(tv => tv.fit));
  return metScore
    .filter(tv => tv.fit >= top - BAND_BESTE)
    .reduce((a, b) => {
      const pa = parsePrice(a.prijs), pb = parsePrice(b.prijs);
      return pb < pa || (pb === pa && b.fit > a.fit) ? b : a;
    });
}

export function matchTVs(tvs, sizeGroup, priceGroup, answers, scores) {
  const leeg = { bestMatch: null, bestType: null, filteredMatchedTVs: [], topWens: null };
  if (!Array.isArray(tvs) || !sizeGroup) return leeg;

  const allowedSizes = sizeGroupToAllowedSizes[sizeGroup] || [];
  const pool = tvs.filter(tv => {
    const price = parsePrice(tv.prijs);
    return (
      allowedSizes.includes(tv.grootte) &&
      (!priceGroup || (price >= priceGroup.min && price <= priceGroup.max))
    );
  });
  if (pool.length === 0) return leeg;

  const gescoord = scoreTVs(pool, sizeGroup, answers ?? {}, scores ?? {}).sort((a, b) => b.fit - a.fit);
  const top = gescoord[0].fit;
  // Alles binnen de band, maar door tot er minstens MIN_LIJST tv's in zitten die ook
  // door het standaardfilter "2+ winkels" op de resultaatpagina komen; anders bleven
  // er daar soms maar 2 over van een lijst van 5.
  const lijst = [];
  let zichtbaar = 0;
  for (const tv of gescoord) {
    if (zichtbaar >= MAX_LIJST) break;
    if (tv.fit < top - BAND_LIJST && zichtbaar >= MIN_LIJST) break;
    lijst.push(tv);
    if ((tv.aanbieders ?? []).length >= DEFAULT_MIN_AANBIEDERS) zichtbaar++;
  }
  lijst.sort((a, b) => parsePrice(a.prijs) - parsePrice(b.prijs));

  const bestMatch = kiesBesteMatch(lijst);
  return {
    bestMatch,
    bestType: bestMatch?.type ?? null,
    filteredMatchedTVs: lijst,
    topWens: Math.max(...lijst.map(tv => tv.wens)),
  };
}

export function computeMatchForPriceGroup(tvs, sizeGroup, priceGroup, answers, scores) {
  return matchTVs(tvs, sizeGroup, priceGroup, answers, scores);
}

export function getIdealTypeSet(scores) {
  if (!scores || typeof scores !== "object") return new Set();
  const entries = Object.entries(scores);
  if (entries.length === 0) return new Set();
  const maxScore = Math.max(...entries.map(([, score]) => Number(score)));
  const idealTypes = entries
    .filter(([, score]) => Number(score) === maxScore)
    .map(([type]) => normalizeTypeLabel(type));
  return new Set(idealTypes);
}

export function isPerfectMatch(tv, scores, answers, sizeGroup = "") {
  if (!tv || !scores || !answers) return false;

  // For size groups where LED is the only practical type, LED is always a type match.
  const available = availableTypesBySize[sizeGroup] ?? null;
  const isLedOnlySize = available !== null && available.every(t => t === "LED");

  let typeMatch;
  if (isLedOnlySize) {
    typeMatch = normalizeTypeLabel(tv.type) === "LED";
  } else {
    // Apply the same size bonus before computing ideal types so the result is consistent
    // with what matchTVs chose.
    const sizeBonus = ledSizeBonuses[sizeGroup] ?? 0;
    const adjustedScores = { ...scores };
    if (sizeBonus > 0) {
      adjustedScores["LED"] = (Number(adjustedScores["LED"]) || 0) + sizeBonus;
    }
    const filteredScores = available
      ? Object.fromEntries(Object.entries(adjustedScores).filter(([t]) => available.includes(t)))
      : adjustedScores;
    const idealTypes = getIdealTypeSet(filteredScores);
    const tvType = normalizeTypeLabel(tv.type);
    const isNeoQledMatch = tv.type === "Neo QLED" && (idealTypes.has("QLED") || idealTypes.has("Mini LED"));
    typeMatch = idealTypes.size === 0 ? true : (idealTypes.has(tvType) || isNeoQledMatch);
  }

  const quality = answers.quality ?? "";
  let resolutionMatch = true;
  if (quality === "best") {
    const tier = getResolutionTier(tv);
    resolutionMatch = tier === "8K" || tier === "4K";
  } else if (quality === "belangrijk") {
    const tier = getResolutionTier(tv);
    resolutionMatch = tier === "8K" || tier === "4K" || tier === "Full HD";
  }

  const hzPreferences = getHzPreferences(answers.usageAnswers ?? [], quality);
  let hzMatch = true;
  if (hzPreferences) {
    const hzValue = parseHzValue(tv);
    hzMatch = hzValue !== null && hzValue >= hzPreferences[0];
  }

  return typeMatch && resolutionMatch && hzMatch;
}

// De kaartpunten ("Waarom dit bij jou past") staan in punten.js.
