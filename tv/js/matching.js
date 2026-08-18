import { availableTypesBySize, ledSizeBonuses, scoringSystem, sizeGroupToAllowedSizes } from "./data.js";
import {
  getResolutionCategory,
  getResolutionTier,
  normalizeTypeLabel,
  parseHzValue,
  parsePrice
} from "./utils.js";

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

  const isUltraHD = (scherpte) => {
    return scherpte.includes("Ultra HD") || scherpte.includes("8K");
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

export function applyHzFilter(tvs, usageAnswers, quality) {
  const hasGamen = usageAnswers.includes("gamen");
  const hasSport = usageAnswers.includes("sport");

  let hzPreferences = [];

  if (hasGamen) {
    hzPreferences = [
      [120, 144, 165],
      [100],
      [60],
      [50]
    ];
  } else if (hasSport) {
    hzPreferences = [
      [100, 120, 144, 165],
      [60],
      [50]
    ];
  } else if (quality === "best") {
    hzPreferences = [
      [100, 120, 144, 165],
      [60],
      [50]
    ];
  } else if (quality === "belangrijk") {
    hzPreferences = [
      [60, 100, 120, 144, 165],
      [50]
    ];
  } else {
    return tvs;
  }

  for (const hzGroup of hzPreferences) {
    const filtered = tvs.filter(tv => hzGroup.includes(tv.Hz));
    if (filtered.length > 0) {
      return filtered;
    }
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

    let tvsOfTheseTypes = filteredTVs.filter(tv => {
      if (typesWithSameScore.includes(tv.type)) return true;
      if (tv.type === "Neo QLED" && (typesWithSameScore.includes("QLED") || typesWithSameScore.includes("Mini LED"))) return true;
      return false;
    });

    if (tvsOfTheseTypes.length === 0) continue;

    tvsOfTheseTypes = applyResolutionFilter(tvsOfTheseTypes, answers.quality ?? "");
    if (tvsOfTheseTypes.length === 0) continue;

    tvsOfTheseTypes = applyHzFilter(tvsOfTheseTypes, answers.usageAnswers ?? [], answers.quality ?? "");
    if (tvsOfTheseTypes.length === 0) continue;

    matchedTVs = [...tvsOfTheseTypes];

    localBestMatch = tvsOfTheseTypes.reduce((cheapest, tv) => {
      const tvPrice = parsePrice(tv.prijs);
      const cheapestPrice = parsePrice(cheapest.prijs);
      return tvPrice < cheapestPrice ? tv : cheapest;
    });

    bestType = typesWithSameScore.join(" / ");
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

export function getHzPreferences(usageAnswers = [], quality = "") {
  const hasGamen = usageAnswers.includes("gamen");
  const hasSport = usageAnswers.includes("sport");

  if (hasGamen) {
    return [
      [120, 144, 165],
      [100],
      [60],
      [50]
    ];
  }

  if (hasSport) {
    return [
      [100, 120, 144, 165],
      [60],
      [50]
    ];
  }

  if (quality === "best") {
    return [
      [100, 120, 144, 165],
      [60],
      [50]
    ];
  }

  if (quality === "belangrijk") {
    return [
      [60, 100, 120, 144, 165],
      [50]
    ];
  }

  return null;
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
    hzMatch = hzValue !== null && hzPreferences[0].includes(hzValue);
  }

  return typeMatch && resolutionMatch && hzMatch;
}

export function buildResultPoints(tv, answers, sizeGroup = "") {
  if (!tv || !answers) return [];

  // For size groups where LED is the only practical type, use positive framing.
  const available = availableTypesBySize[sizeGroup] ?? null;
  const isLedOnlySize = available !== null && available.every(t => t === "LED");

  const points = [];
  const usage = answers.usageAnswers ?? [];
  const timing = answers.timing ?? "";
  const viewing = answers.viewing ?? "";
  const extra = answers.extraAnswers ?? [];
  const hzValue = parseHzValue(tv) ?? 0;
  const type = normalizeTypeLabel(tv.type);

  const hasUsage = (value) => usage.includes(value);
  const hasExtra = (value) => extra.includes(value);
  const addPoint = (text) => {
    if (!text) return;
    if (!points.includes(text) && points.length < 4) {
      points.push(text);
    }
  };

  if (type === "OLED") {
    if (hasUsage("films")) addPoint("Uitstekend voor films en series");

    if (hasUsage("gamen") && hzValue >= 100) addPoint("Uitstekend voor gamen");
    if (hasUsage("gamen") && hzValue < 100) addPoint("Goed voor gamen");

    if (timing === "avonds") addPoint("Prachtig beeld 's avonds in het donker");
    if (timing === "overdag") addPoint("Genoeg helderheid voor overdag");
    if (timing === "beide") addPoint("Goed beeld overdag en 's avonds");

    if (viewing === "meerdere") {
      addPoint("Scherp beeld vanuit elke hoek");
    }

    if (hasExtra("kleur") && hasExtra("zwart")) {
      addPoint("Diepe zwarttinten en levendige kleuren");
    } else {
      if (hasExtra("zwart")) addPoint("Ongeevenaarde diepe zwarttinten");
      if (hasExtra("kleur")) addPoint("Levendige en nauwkeurige kleuren");
    }
  } else if (type === "QLED") {
    if (hasUsage("films")) addPoint("Goed voor films en series");

    if (hasUsage("sport") && hzValue >= 100) addPoint("Uitstekend voor sport kijken");
    if (hasUsage("sport") && hzValue < 100) addPoint("Goed voor sport kijken");

    if (hasUsage("gamen") && hzValue >= 100) addPoint("Goed voor gamen");
    if (hasUsage("gamen") && hzValue < 100) addPoint("Minder geschikt voor serieus gamen");

    if (timing === "overdag") addPoint("Uitstekend beeld bij daglicht");
    if (timing === "beide") addPoint("Goed beeld overdag en 's avonds");
    if (timing === "avonds") addPoint("Prima beeld ook 's avonds");

    if (hasExtra("kleur") && hasExtra("helderheid")) {
      addPoint("Prachtige kleuren en een helder beeld");
    } else {
      if (hasExtra("helderheid")) addPoint("Opvallend helder beeld");
      if (hasExtra("kleur")) addPoint("Levendige, rijke kleuren");
    }
  } else if (type === "Neo QLED") {
    if (hasUsage("films")) addPoint("Uitstekend voor films en series");

    if (hasUsage("sport") && hzValue >= 100) addPoint("Uitstekend voor sport kijken");
    if (hasUsage("sport") && hzValue < 100) addPoint("Goed voor sport kijken");

    if (hasUsage("gamen") && hzValue >= 120) addPoint("Uitstekend voor gamen");
    if (hasUsage("gamen") && hzValue < 120) addPoint("Goed voor gamen");

    if (timing === "overdag") addPoint("Uitstekend beeld bij daglicht");
    if (timing === "beide") addPoint("Goed beeld overdag en 's avonds");
    if (timing === "avonds") addPoint("Diepe zwarttinten ook 's avonds");

    if (hasExtra("kleur") && hasExtra("helderheid")) {
      addPoint("Prachtige kleuren en een helder beeld");
    } else {
      if (hasExtra("helderheid")) addPoint("Opvallend helder beeld");
      if (hasExtra("kleur")) addPoint("Levendige, rijke kleuren");
    }
    if (hasExtra("zwart")) addPoint("Diepe zwarttinten dankzij Mini LED");
  } else if (type === "Mini LED") {
    if (hasUsage("films")) addPoint("Uitstekend voor films en series");

    if (hasUsage("sport") && hzValue >= 100) addPoint("Uitstekend voor sport kijken");
    if (hasUsage("sport") && hzValue < 100) addPoint("Goed voor sport kijken");

    if (hasUsage("gamen") && hzValue >= 120) addPoint("Uitstekend voor gamen");
    if (hasUsage("gamen") && hzValue < 120) addPoint("Goed voor gamen");

    addPoint("Goed beeld overdag en 's avonds");

    if (hasExtra("helderheid") && hasExtra("kleur")) {
      addPoint("Helder beeld met mooie kleuren");
    } else {
      if (hasExtra("helderheid")) addPoint("Opvallend helder beeld");
      if (hasExtra("kleur")) addPoint("Levendige kleuren");
    }
  } else if (type === "LED") {
    if (isLedOnlySize) {
      // At small sizes, LED is the natural and appropriate choice — no negative framing.
      if (hasUsage("films") || hasUsage("normaal")) addPoint("Prima voor dagelijks tv kijken");
      if (hasUsage("gamen")) addPoint("Geschikt voor casual gamen");
      if (hasUsage("sport")) addPoint("Goed voor sport kijken");
      addPoint("Gewoon prima beeld, overdag en 's avonds");
      if (viewing === "recht") addPoint("Prima als je altijd recht voor de tv zit");
    } else {
      if (hasUsage("films")) addPoint("Minder geschikt voor films en series");
      if (hasUsage("sport")) addPoint("Minder geschikt voor sport kijken");
      if (hasUsage("gamen")) addPoint("Minder geschikt voor serieus gamen");
      if (hasUsage("normaal")) addPoint("Prima voor dagelijks tv kijken");

      addPoint("Gewoon prima beeld, overdag en 's avonds");

      if (viewing === "recht") {
        addPoint("Prima als je altijd recht voor de tv zit");
      }
      if (viewing === "meerdere") {
        addPoint("Beeld wordt minder vanuit een schuine hoek");
      }
    }
  }

  if (points.length < 4) {
    const resolution = getResolutionCategory(tv);
    if (resolution === "8K") addPoint("Extreem scherp beeld");
    if (resolution === "4K") addPoint("Heel scherp beeld");
    if (resolution === "<4K") addPoint("Beeld is redelijk scherp");
  }

  // Vangnet: als er nog steeds geen 4 punten zijn (bv. weinig/geen
  // voorwaardelijke antwoorden getriggerd), vul aan met specs die
  // normalizeProducts() altijd garandeert (merk/grootte/hz — zie de harde
  // vereisten in tv/js/utils.js). addPoint() dedupliceert en stopt vanzelf
  // bij 4, dus deze cascade kan nooit op ontbrekende data stranden.
  if (points.length < 4) addPoint(`${tv.merk} kwaliteit`);
  if (points.length < 4) addPoint(`${tv.grootte}" scherm`);
  if (points.length < 4) addPoint(`${tv.hz} Hz voor vloeiend beeld`);

  return points.slice(0, 4);
}
