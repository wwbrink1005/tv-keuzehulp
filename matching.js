import { priceGroupsBySize, scoringSystem, sizeGroupToAllowedSizes } from "./data.js";
import {
  getResolutionCategory,
  getResolutionTier,
  normalizeTypeLabel,
  parseHzValue,
  parsePrice
} from "./utils.js";

export function calculateScores(answers) {
  const scores = {
    "LED (edge)": 0,
    "LED (direct)": 0,
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
  if (!Array.isArray(tvs) || !sizeGroup || !priceGroup) {
    return { bestMatch: null, bestType: null, filteredMatchedTVs: [] };
  }

  const allowedSizes = sizeGroupToAllowedSizes[sizeGroup] || [];
  let filteredTVs = tvs.filter(tv => {
    const price = parsePrice(tv.prijs);
    return (
      allowedSizes.includes(tv.grootte) &&
      price >= priceGroup.min &&
      price <= priceGroup.max
    );
  });

  if (filteredTVs.length === 0) {
    return { bestMatch: null, bestType: null, filteredMatchedTVs: [] };
  }

  const wantsAmbilight = (answers.extraAnswers ?? []).includes("ambilight");
  if (wantsAmbilight) {
    const ambilightTVs = filteredTVs.filter(tv =>
      tv.Ambilight === "TRUE" || tv.Ambilight === true
    );
    if (ambilightTVs.length > 0) {
      filteredTVs = ambilightTVs;
    }
  }

  const sortedTypes = Object.entries(scores).sort((a, b) => Number(b[1]) - Number(a[1]));
  let localBestMatch = null;
  let bestType = null;
  let matchedTVs = [];

  for (let i = 0; i < sortedTypes.length; i++) {
    const [, score] = sortedTypes[i];
    const typesWithSameScore = sortedTypes
      .filter(([, s]) => Number(s) === Number(score))
      .map(([t]) => t);

    let tvsOfTheseTypes = filteredTVs.filter(tv =>
      typesWithSameScore.includes(tv.type)
    );

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

export function isPerfectMatch(tv, scores, answers) {
  if (!tv || !scores || !answers) return false;

  const idealTypes = getIdealTypeSet(scores);
  const tvType = normalizeTypeLabel(tv.type);
  const typeMatch = idealTypes.size === 0 ? true : idealTypes.has(tvType);

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

export function findBetterPerfectMatchContext(tvs, selection, answers, scores) {
  if (!selection?.sizeGroup || !selection?.priceLabel || !answers || !scores) return null;

  const priceGroups = priceGroupsBySize[selection.sizeGroup] || [];
  const currentIndex = priceGroups.findIndex(group => group.label === selection.priceLabel);
  if (currentIndex < 0) return null;

  for (let i = currentIndex + 1; i < priceGroups.length; i++) {
    const priceGroup = priceGroups[i];
    const matchResult = computeMatchForPriceGroup(tvs, selection.sizeGroup, priceGroup, answers, scores);
    if (matchResult.bestMatch && isPerfectMatch(matchResult.bestMatch, scores, answers)) {
      return { priceGroup, matchResult };
    }
  }

  return null;
}

export function buildResultPoints(tv, answers) {
  if (!tv || !answers) return [];

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
    if (hasUsage("films")) addPoint("Perfect voor films en series kijken");

    if (hasUsage("gamen") && hzValue >= 100) addPoint("Perfect voor gamen");
    if (hasUsage("gamen") && hzValue < 100) addPoint("Goed voor gamen");

    if (timing === "avonds") addPoint("Beeld is extra mooi in het donker");

    if (viewing === "meerdere") {
      addPoint("Vanuit alle kijkhoeken zeer goede beeldkwaliteit");
    }

    if (hasExtra("kleur") && hasExtra("zwart")) {
      addPoint("Zwarte beelden en kleuren zijn extra mooi");
    } else {
      if (hasExtra("zwart")) addPoint("Zwarttinten zijn extra mooi");
      if (hasExtra("kleur")) addPoint("Heel goed in kleuren weergeven");
    }
  } else if (type === "QLED") {
    if (hasUsage("films")) addPoint("Prima voor films en series");

    if (hasUsage("sport") && hzValue >= 100) addPoint("Zeer geschikt voor sport");
    if (hasUsage("sport") && hzValue < 100) addPoint("Geschikt voor sport");

    if (hasUsage("gamen") && hzValue >= 100) addPoint("Prima voor het gamen");
    if (hasUsage("gamen") && hzValue < 100) addPoint("Niet ideaal voor het gamen");

    if (timing === "overdag") addPoint("Overdag heel goed beeld");
    if (timing === "beide") {
      addPoint("Zowel als het licht is en als het donker is heel goed beeld");
    }

    if (hasExtra("kleur") && hasExtra("helderheid")) {
      addPoint("Prachtige kleuren en heel helder beeld");
    } else {
      if (hasExtra("helderheid")) addPoint("Heel helder beeld");
      if (hasExtra("kleur")) addPoint("Prachtige kleuren");
    }
  } else if (type === "Mini LED") {
    if (hasUsage("films")) addPoint("Zeer geschikt voor films en series");

    if (hasUsage("sport") && hzValue >= 100) addPoint("Heel erg geschikt voor sport");
    if (hasUsage("sport") && hzValue < 100) addPoint("Geschikt voor sport");

    if (hasUsage("gamen") && hzValue >= 120) addPoint("Perfect voor gamen");
    if (hasUsage("gamen") && hzValue < 120) addPoint("Prima voor gamen");

    addPoint("Zowel als het licht is en als het donker is heel goed beeld");

    if (hasExtra("helderheid") && hasExtra("kleur")) {
      addPoint("Helder beeld en mooie kleuren");
    } else {
      if (hasExtra("helderheid")) addPoint("Helder beeld");
      if (hasExtra("kleur")) addPoint("Mooie kleuren");
    }
  } else if (type === "LED") {
    if (hasUsage("films")) addPoint("Niet heel erg geschikt voor films en series");
    if (hasUsage("sport")) addPoint("Niet heel erg geschikt voor sport");
    if (hasUsage("gamen")) addPoint("Niet heel erg geschikt voor gamen");
    if (hasUsage("normaal")) addPoint("Zeer geschikt voor normale tv programma’s");

    addPoint("Zowel als het licht is en als het donker is gewoon prima beeld");

    if (viewing === "recht") {
      addPoint("Prima voor als je altijd recht voor de tv zit");
    }
    if (viewing === "meerdere") {
      addPoint("Beeldkwaliteit vermindert zodra je niet recht voor de tv zit");
    }
  }

  if (points.length < 4) {
    const resolution = getResolutionCategory(tv);
    if (resolution === "8K") addPoint("Extreem scherp beeld");
    if (resolution === "4K") addPoint("Heel scherp beeld");
    if (resolution === "<4K") addPoint("Beeld is redelijk scherp");
  }

  return points.slice(0, 4);
}
