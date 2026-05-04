import { getProcessorTier, priceGroupsBySize, scoringSystem, sizeGroupToAllowedSizes, TIER_ORDER } from "./data.js";
import { parsePrice } from "./utils.js";

// ─── Score computation ────────────────────────────────────────────────────────

export function calculateScores(answers) {
  const scores = { Budget: 0, Mid: 0, Krachtig: 0, Topklasse: 0 };

  // gebruik is now an array (multi-select, max 2)
  const gebruik     = Array.isArray(answers.gebruik) ? answers.gebruik : (answers.gebruik ? [answers.gebruik] : []);
  const intensiteit = answers.intensiteit ?? "";
  const formaat     = answers.formaat     ?? "";

  for (const g of gebruik) {
    if (scoringSystem.gebruik[g]) {
      for (const tier of TIER_ORDER) {
        scores[tier] += scoringSystem.gebruik[g][tier] ?? 0;
      }
    }
  }

  if (intensiteit && scoringSystem.intensiteit[intensiteit]) {
    for (const tier of TIER_ORDER) {
      scores[tier] += scoringSystem.intensiteit[intensiteit][tier] ?? 0;
    }
  }

  if (formaat && scoringSystem.formaat[formaat]) {
    for (const tier of TIER_ORDER) {
      scores[tier] += scoringSystem.formaat[formaat][tier] ?? 0;
    }
  }

  return scores;
}

// ─── Formaat filter (size + portability combined) ────────────────────────────

export function applyFormaatFilter(laptops, formaat) {
  if (formaat === "licht-compact") {
    // Prefer very light laptops
    const light = laptops.filter(l => l.gewicht !== null && l.gewicht <= 1.6);
    if (light.length > 0) return light;

    const medium = laptops.filter(l => l.gewicht !== null && l.gewicht <= 1.9);
    if (medium.length > 0) return medium;

    return laptops;
  }

  if (formaat === "middenweg") {
    const filtered = laptops.filter(l => l.gewicht === null || l.gewicht <= 2.2);
    if (filtered.length > 0) return filtered;
    return laptops;
  }

  // "groot-krachtig" → no weight filter
  return laptops;
}

// ─── Opslag filter ────────────────────────────────────────────────────────────

export function applyOpslagFilter(laptops, opslag) {
  if (opslag === "veel") {
    const big = laptops.filter(l => l.opslag >= 1000);
    if (big.length > 0) return big;
    // fall back to 512
    const medium = laptops.filter(l => l.opslag >= 512);
    if (medium.length > 0) return medium;
    return laptops;
  }

  if (opslag === "gemiddeld") {
    const medium = laptops.filter(l => l.opslag >= 512);
    if (medium.length > 0) return medium;
    return laptops;
  }

  // "weinig" → no storage filter (256 GB is fine)
  return laptops;
}

// ─── Extra preferences ────────────────────────────────────────────────────────

export function applyExtraFilter(laptops, extraAnswers) {
  if (!Array.isArray(extraAnswers) || extraAnswers.includes("geen") || extraAnswers.length === 0) {
    return laptops;
  }

  let filtered = [...laptops];

  if (extraAnswers.includes("touchscreen")) {
    const ts = filtered.filter(l => l.touchscreen === "Ja");
    if (ts.length > 0) filtered = ts;
  }

  if (extraAnswers.includes("usb-c")) {
    const usbc = filtered.filter(l => l.usb_c === "Ja");
    if (usbc.length > 0) filtered = usbc;
  }

  if (extraAnswers.includes("meerdere-schermen")) {
    const multi = filtered.filter(l => l.hdmi >= 2);
    if (multi.length > 0) filtered = multi;
  }

  if (extraAnswers.includes("scherp-beeldscherm")) {
    // Prefer OLED first, then high resolution, then IPS
    const oled = filtered.filter(l => l.paneeltype === "OLED");
    if (oled.length > 0) { filtered = oled; }
    else {
      const hires = filtered.filter(l => l.resolutie === "4K" || l.resolutie === "Quad HD");
      if (hires.length > 0) { filtered = hires; }
      else {
        const ips = filtered.filter(l => l.paneeltype === "IPS");
        if (ips.length > 0) filtered = ips;
      }
    }
  }

  return filtered;
}

// ─── Main matching function ───────────────────────────────────────────────────

export function matchLaptops(laptops, sizeGroup, priceGroup, answers, scores) {
  if (!Array.isArray(laptops) || !sizeGroup || !priceGroup) {
    return { bestMatch: null, bestType: null, filteredMatchedLaptops: [] };
  }

  const allowedSizes = sizeGroupToAllowedSizes[sizeGroup] || [];

  // 1. Filter by size + price
  let filtered = laptops.filter(l => {
    const price = parsePrice(l.prijs);
    return (
      allowedSizes.includes(l.schermdiagonaal) &&
      price >= priceGroup.min &&
      price <= priceGroup.max
    );
  });

  if (filtered.length === 0) {
    return { bestMatch: null, bestType: null, filteredMatchedLaptops: [] };
  }

  // 2. Pick best processor tier by score
  const sortedTiers = Object.entries(scores)
    .sort((a, b) => Number(b[1]) - Number(a[1]));

  let matchedLaptops = [];
  let bestType = null;

  for (let i = 0; i < sortedTiers.length; i++) {
    const [, topScore] = sortedTiers[i];
    const tiersWithTopScore = sortedTiers
      .filter(([, s]) => Number(s) === Number(topScore))
      .map(([t]) => t);

    let candidates = filtered.filter(l => tiersWithTopScore.includes(getProcessorTier(l.processor)));

    if (candidates.length === 0) continue;

    // 3. Apply formaat filter (weight-based portability)
    candidates = applyFormaatFilter(candidates, answers.formaat ?? "");
    if (candidates.length === 0) continue;

    // 4. Apply opslag filter
    candidates = applyOpslagFilter(candidates, answers.opslag ?? "");
    if (candidates.length === 0) continue;

    // 5. Apply extra preferences
    candidates = applyExtraFilter(candidates, answers.extraAnswers ?? []);
    if (candidates.length === 0) continue;

    matchedLaptops = [...candidates];
    bestType = tiersWithTopScore.join(" / ");
    break;
  }

  if (matchedLaptops.length === 0) {
    return { bestMatch: null, bestType: null, filteredMatchedLaptops: [] };
  }

  // Best match = cheapest in the matched set
  const bestMatch = matchedLaptops.reduce((cheapest, l) => {
    return parsePrice(l.prijs) < parsePrice(cheapest.prijs) ? l : cheapest;
  });

  return { bestMatch, bestType, filteredMatchedLaptops: matchedLaptops };
}

export function computeMatchForPriceGroup(laptops, sizeGroup, priceGroup, answers, scores) {
  return matchLaptops(laptops, sizeGroup, priceGroup, answers, scores);
}

export function getIdealTierSet(scores) {
  if (!scores || typeof scores !== "object") return new Set();
  const entries = Object.entries(scores);
  if (entries.length === 0) return new Set();
  const maxScore = Math.max(...entries.map(([, s]) => Number(s)));
  return new Set(
    entries.filter(([, s]) => Number(s) === maxScore).map(([t]) => t)
  );
}

// ─── Result points ────────────────────────────────────────────────────────────

export function buildResultPoints(laptop, answers) {
  if (!laptop || !answers) return [];

  const points = [];
  const addPoint = (text) => {
    if (text && !points.includes(text) && points.length < 4) points.push(text);
  };

  const gebruik      = Array.isArray(answers.gebruik) ? answers.gebruik : (answers.gebruik ? [answers.gebruik] : []);
  const intensiteit  = answers.intensiteit ?? "";
  const formaat      = answers.formaat ?? "";
  const opslag       = answers.opslag ?? "";
  const extraAnswers = answers.extraAnswers ?? [];
  const tier         = getProcessorTier(laptop.processor);

  // Processor tier points
  if (tier === "Topklasse") {
    if (gebruik.includes("gaming"))   addPoint("Top rekenkracht voor veeleisende games");
    if (gebruik.includes("creatief")) addPoint("Maximale prestaties voor video- en fotobewerking");
    if (intensiteit === "intensief")  addPoint("Hoge rekenkracht voor zware taken");
  } else if (tier === "Krachtig") {
    if (gebruik.includes("gaming"))   addPoint("Voldoende krachtig voor gamen");
    if (gebruik.includes("creatief")) addPoint("Prima voor creatief en productief werk");
    if (intensiteit === "intensief")  addPoint("Krachtige processor voor zware taken");
  } else if (tier === "Mid") {
    if (gebruik.includes("werk"))      addPoint("Prima geschikt voor thuiswerken en kantoor");
    if (gebruik.includes("dagelijks")) addPoint("Meer dan voldoende voor dagelijks gebruik");
    if (intensiteit === "gemiddeld")   addPoint("Goede balans tussen kracht en efficiëntie");
  } else {
    addPoint("Energiezuinig en betaalbaar voor dagelijks gebruik");
  }

  // Display quality
  if (laptop.paneeltype === "OLED") {
    addPoint("OLED-scherm met scherpe kleuren en hoog contrast");
  } else if (extraAnswers.includes("scherp-beeldscherm")) {
    if (laptop.resolutie === "4K")       addPoint("4K-scherm voor maximale beeldscherpte");
    else if (laptop.resolutie === "Quad HD") addPoint("Helder Quad HD-scherm");
  }

  // Portability / formaat
  if (formaat === "licht-compact") {
    if (laptop.gewicht !== null && laptop.gewicht <= 1.5) {
      addPoint("Extreem licht — ideaal voor onderweg");
    } else if (laptop.gewicht !== null && laptop.gewicht <= 1.9) {
      addPoint("Lichtgewicht ontwerp voor extra portabiliteit");
    }
  }

  // Extra
  if (extraAnswers.includes("touchscreen") && laptop.touchscreen === "Ja") {
    addPoint("Touchscreen voor intuïtieve bediening");
  }
  if (extraAnswers.includes("usb-c") && laptop.usb_c === "Ja") {
    addPoint("USB-C aansluiting voor snel opladen en accessoires");
  }
  if (extraAnswers.includes("meerdere-schermen") && laptop.hdmi >= 2) {
    addPoint("Meerdere HDMI-aansluitingen voor extra beeldschermen");
  }

  // Opslag
  if (opslag === "veel" && laptop.opslag >= 1000) {
    addPoint(`${laptop.opslag >= 1024 ? laptop.opslag / 1024 + " TB" : laptop.opslag + " GB"} opslag voor grote projecten`);
  } else if (opslag === "gemiddeld" && laptop.opslag >= 512) {
    addPoint(`${laptop.opslag} GB opslag — ruim voor foto's en programma's`);
  }

  // Fill remaining slots with generic spec points
  if (points.length < 2) {
    if (laptop.werkgeheugen >= 32) addPoint("32 GB RAM voor zware workloads");
    else if (laptop.werkgeheugen >= 16) addPoint("16 GB RAM voor vlot multitasken");
  }

  return points;
}
