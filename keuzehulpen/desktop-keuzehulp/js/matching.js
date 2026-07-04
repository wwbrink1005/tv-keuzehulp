import { scoringSystem, TIER_ORDER } from "./data.js";
import { parsePrice } from "./utils.js";

// ─── Score computation ────────────────────────────────────────────────────────

export function calculateScores(answers) {
  const scores = { Budget: 0, Mid: 0, Krachtig: 0, Topklasse: 0 };

  const gebruik     = Array.isArray(answers.gebruik) ? answers.gebruik : (answers.gebruik ? [answers.gebruik] : []);
  const intensiteit = answers.intensiteit ?? "";

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

  return scores;
}

// ─── Opslag filter ────────────────────────────────────────────────────────────

export function applyOpslagFilter(desktops, opslag) {
  if (opslag === "veel") {
    const big = desktops.filter(d => d.opslag >= 2000);
    if (big.length > 0) return big;
    const medium = desktops.filter(d => d.opslag >= 1000);
    if (medium.length > 0) return medium;
    return desktops;
  }

  if (opslag === "gemiddeld") {
    const medium = desktops.filter(d => d.opslag >= 1000);
    if (medium.length > 0) return medium;
    return desktops;
  }

  // "weinig" → 512 GB is fine, no filter
  return desktops;
}

// ─── Extra preferences filter ─────────────────────────────────────────────────

export function applyExtraFilter(desktops, extraAnswers) {
  if (!Array.isArray(extraAnswers) || extraAnswers.includes("geen") || extraAnswers.length === 0) {
    return desktops;
  }

  let filtered = [...desktops];

  if (extraAnswers.includes("rgb")) {
    const r = filtered.filter(d => d.rgb === "Ja");
    if (r.length > 0) filtered = r;
  }

  if (extraAnswers.includes("waterkoeling")) {
    const wk = filtered.filter(d => d.waterkoeling === "Ja");
    if (wk.length > 0) filtered = wk;
  }

  if (extraAnswers.includes("veel-aansluitingen")) {
    const multi = filtered.filter(d => d.hdmiPoorten >= 2 || d.displayport >= 2 || d.usbC >= 2);
    if (multi.length > 0) filtered = multi;
  }

  return filtered;
}

// ─── Main matching function ───────────────────────────────────────────────────

export function matchDesktops(desktops, behuizingType, priceGroup, answers, scores) {
  if (!Array.isArray(desktops)) {
    return { bestMatch: null, bestType: null, filteredMatchedDesktops: [] };
  }

  // 1. Filter by behuizing category + price.
  // "maakt-niet-uit" (or no type selected) means every category is allowed —
  // including products whose category we couldn't classify (behuizingCategory
  // is null), since excluding them would throw away most of the catalog.
  let filtered = desktops.filter(d => {
    const price  = parsePrice(d.prijs);
    const typeOk = !behuizingType || behuizingType === "maakt-niet-uit" ||
                   d.behuizingCategory === behuizingType;
    return typeOk && (!priceGroup || (price >= priceGroup.min && price <= priceGroup.max));
  });

  if (filtered.length === 0) {
    return { bestMatch: null, bestType: null, filteredMatchedDesktops: [] };
  }

  // 2. Pick best GPU tier by total score
  const sortedTiers = Object.entries(scores)
    .sort((a, b) => Number(b[1]) - Number(a[1]));

  let matchedDesktops = [];
  let bestType = null;

  for (let i = 0; i < sortedTiers.length; i++) {
    const [, topScore] = sortedTiers[i];
    const tiersWithTopScore = sortedTiers
      .filter(([, s]) => Number(s) === Number(topScore))
      .map(([t]) => t);

    let candidates = filtered.filter(d => tiersWithTopScore.includes(d.gpuTier));
    if (candidates.length === 0) continue;

    // 3. Apply opslag filter
    candidates = applyOpslagFilter(candidates, answers.opslag ?? "");
    if (candidates.length === 0) continue;

    // 4. Apply extra preferences
    candidates = applyExtraFilter(candidates, answers.extraAnswers ?? []);
    if (candidates.length === 0) continue;

    matchedDesktops = [...candidates];
    bestType = tiersWithTopScore.join(" / ");
    break;
  }

  // Fallback: if tier matching yielded nothing, use all behuizing+price
  // filtered desktops (still applying opslag/extra where possible) so a
  // non-empty price bucket never results in an empty result set.
  if (matchedDesktops.length === 0) {
    let fallback = applyOpslagFilter(filtered, answers.opslag ?? "");
    fallback = applyExtraFilter(fallback, answers.extraAnswers ?? []);
    if (fallback.length === 0) fallback = [...filtered];
    matchedDesktops = fallback;
    bestType = "Algemeen";
  }

  // Best match = cheapest in the matched set
  const bestMatch = matchedDesktops.reduce((cheapest, d) =>
    parsePrice(d.prijs) < parsePrice(cheapest.prijs) ? d : cheapest
  );

  return { bestMatch, bestType, filteredMatchedDesktops: matchedDesktops };
}

export function computeMatchForPriceGroup(desktops, behuizingType, priceGroup, answers, scores) {
  return matchDesktops(desktops, behuizingType, priceGroup, answers, scores);
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

export function buildResultPoints(desktop, answers) {
  if (!desktop || !answers) return [];

  const points = [];
  const addPoint = (text) => {
    if (text && !points.includes(text) && points.length < 4) points.push(text);
  };

  const gebruik      = Array.isArray(answers.gebruik) ? answers.gebruik : (answers.gebruik ? [answers.gebruik] : []);
  const intensiteit  = answers.intensiteit  ?? "";
  const opslag       = answers.opslag       ?? "";
  const extraAnswers = answers.extraAnswers ?? [];
  const tier         = desktop.gpuTier;

  // GPU-tier-based points
  if (tier === "Topklasse") {
    if (gebruik.includes("gaming"))   addPoint("Topklasse GPU voor maximale gameprestaties");
    if (gebruik.includes("creatief")) addPoint("Professionele GPU voor video- en fotobewerking");
    if (intensiteit === "intensief")  addPoint("Maximale rekenkracht voor veeleisende taken");
    if (points.length === 0)          addPoint("Vlaggenschip hardware voor elke taak");
  } else if (tier === "Krachtig") {
    if (gebruik.includes("gaming"))   addPoint("Krachtige GPU voor soepel gamen op hoge instellingen");
    if (gebruik.includes("creatief")) addPoint("Prima geschikt voor video- en fotobewerking");
    if (intensiteit === "intensief")  addPoint("Meer dan voldoende voor intensief gebruik");
    if (points.length === 0)          addPoint("Krachtige hardware voor veeleisende taken");
  } else if (tier === "Mid") {
    if (gebruik.includes("werk"))      addPoint("Prima voor kantoorwerk en thuiswerken");
    if (gebruik.includes("dagelijks")) addPoint("Meer dan voldoende voor dagelijks gebruik");
    if (gebruik.includes("gaming"))    addPoint("Geschikt voor casual gaming");
    if (intensiteit === "gemiddeld")   addPoint("Goede balans tussen kracht en prijs");
    if (points.length === 0)           addPoint("Veelzijdig voor werk en entertainment");
  } else {
    addPoint("Snel en energiezuinig voor dagelijks gebruik");
    if (gebruik.includes("werk")) addPoint("Uitstekend voor kantoorwerk en productiviteit");
  }

  // GPU mention
  if (desktop.gpu && desktop.gpu !== "Niet beschikbaar") {
    addPoint(`${desktop.gpu} grafische kaart`);
  }

  // Extra preferences
  if (extraAnswers.includes("rgb") && desktop.rgb === "Ja") {
    addPoint("RGB-verlichting voor een stijlvolle uitstraling");
  }
  if (extraAnswers.includes("waterkoeling") && desktop.waterkoeling === "Ja") {
    addPoint("Waterkoeling voor optimale temperaturen onder belasting");
  }
  if (extraAnswers.includes("veel-aansluitingen") &&
      (desktop.hdmiPoorten >= 2 || desktop.displayport >= 2)) {
    addPoint("Meerdere video-uitgangen voor extra schermen");
  }

  // Opslag
  if (opslag === "veel" && desktop.opslag >= 2000) {
    addPoint(`${desktop.opslag / 1024} TB opslag voor grote projecten`);
  } else if (opslag === "gemiddeld" && desktop.opslag >= 1000) {
    addPoint("1 TB SSD — ruim voor programma's en bestanden");
  }

  // RAM fallback
  if (points.length < 2) {
    if (desktop.ram >= 32) addPoint("32 GB RAM voor vlot multitasken");
    else if (desktop.ram >= 16) addPoint("16 GB RAM voor comfortabel gebruik");
  }

  return points;
}
