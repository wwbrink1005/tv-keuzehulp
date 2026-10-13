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

export function matchTVs(tvs, sizeGroup, priceGroup, answers, scores) {
  if (!Array.isArray(tvs) || !sizeGroup) {
    return { bestMatch: null, bestType: null, filteredMatchedTVs: [] };
  }

  const allowedSizes = sizeGroupToAllowedSizes[sizeGroup] || [];
  let filteredTVs = tvs.filter(tv => {
    const price = parsePrice(tv.prijs);
    return (
      allowedSizes.includes(tv.grootte) &&
      (!priceGroup || (price >= priceGroup.min && price <= priceGroup.max))
    );
  });

  if (filteredTVs.length === 0) {
    return { bestMatch: null, bestType: null, filteredMatchedTVs: [] };
  }

  // Apply LED size bonus: at small screen sizes the perceptual difference between
  // LED and premium types is minimal, so we boost LED's effective score.
  const sizeBonus = ledSizeBonuses[sizeGroup] ?? 0;
  const availableTypes = availableTypesBySize[sizeGroup] ?? Object.keys(scores);
  const adjustedScores = { ...scores };
  if (sizeBonus > 0) {
    adjustedScores["LED"] = (Number(adjustedScores["LED"]) || 0) + sizeBonus;
  }

  const sortedTypes = Object.entries(adjustedScores)
    .filter(([type]) => availableTypes.includes(type))
    .sort((a, b) => Number(b[1]) - Number(a[1]));
  let localBestMatch = null;
  let bestType = null;
  let matchedTVs = [];

  for (let i = 0; i < sortedTypes.length; i++) {
    const [, score] = sortedTypes[i];
    const typesWithSameScore = sortedTypes
      .filter(([, s]) => Number(s) === Number(score))
      .map(([t]) => t);

    // Bij een gelijke stand tussen types (kan bij tot 15% van alle
    // antwoordcombinaties voorkomen, in het ergste geval een volledige
    // 4-weg-gelijkspel tussen LED/Mini LED/QLED/OLED) voegen we ze niet meer
    // samen — dat maakt de resultatenlijst juist breder in plaats van
    // specifieker (getest: tot 174 tv's zonder enige type-filtering). We
    // evalueren elk geteld type apart en kiezen de kleinste niet-lege set,
    // zelfde patroon als monitor/laptop/soundbar.
    let bestTypeCandidates = null;
    let bestTypeName = null;

    for (const candidateType of typesWithSameScore) {
      let tvsOfType = filteredTVs.filter(tv => {
        if (tv.type === candidateType) return true;
        if (tv.type === "Neo QLED" && (candidateType === "QLED" || candidateType === "Mini LED")) return true;
        return false;
      });
      if (tvsOfType.length === 0) continue;

      tvsOfType = applyResolutionFilter(tvsOfType, answers.quality ?? "");
      tvsOfType = applyHzFilter(tvsOfType, answers.usageAnswers ?? [], answers.quality ?? "");
      if (tvsOfType.length === 0) continue;

      if (bestTypeCandidates === null || tvsOfType.length < bestTypeCandidates.length) {
        bestTypeCandidates = tvsOfType;
        bestTypeName = candidateType;
      }
    }

    if (bestTypeCandidates === null) continue;

    matchedTVs = bestTypeCandidates;

    localBestMatch = matchedTVs.reduce((cheapest, tv) => {
      const tvPrice = parsePrice(tv.prijs);
      const cheapestPrice = parsePrice(cheapest.prijs);
      return tvPrice < cheapestPrice ? tv : cheapest;
    });

    bestType = bestTypeName;
    break;
  }

  return { bestMatch: localBestMatch, bestType, filteredMatchedTVs: matchedTVs };
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
