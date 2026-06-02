import { getMonitorTier, priceGroupsBySize, scoringSystem, sizeGroupToAllowedSizes, TIER_ORDER } from "./data.js";
import { parsePrice } from "./utils.js";

// ─── Score computation ────────────────────────────────────────────────────────

export function calculateScores(answers) {
  const scores = { Budget: 0, Mid: 0, Gaming: 0, Premium: 0 };

  const gebruik = Array.isArray(answers.gebruik)
    ? answers.gebruik
    : (answers.gebruik ? [answers.gebruik] : []);
  const hz = answers.hz ?? "";

  for (const g of gebruik) {
    if (scoringSystem.gebruik[g]) {
      for (const tier of TIER_ORDER) {
        scores[tier] += scoringSystem.gebruik[g][tier] ?? 0;
      }
    }
  }

  if (hz && scoringSystem.hz[hz]) {
    for (const tier of TIER_ORDER) {
      scores[tier] += scoringSystem.hz[hz][tier] ?? 0;
    }
  }

  return scores;
}

// ─── Hz filter ────────────────────────────────────────────────────────────────

export function applyHzFilter(monitors, hz) {
  if (hz === "ultra") {
    const ultra = monitors.filter(m => m.hz >= 240);
    if (ultra.length > 0) return ultra;
    const fast = monitors.filter(m => m.hz >= 144);
    if (fast.length > 0) return fast;
    return monitors;
  }

  if (hz === "snel") {
    const fast = monitors.filter(m => m.hz >= 144);
    if (fast.length > 0) return fast;
    const medium = monitors.filter(m => m.hz >= 75);
    if (medium.length > 0) return medium;
    return monitors;
  }

  // "normaal" → no Hz filter (60Hz is fine)
  return monitors;
}

// ─── Extra preferences ────────────────────────────────────────────────────────

export function applyExtraFilter(monitors, extraAnswers) {
  if (!Array.isArray(extraAnswers) || extraAnswers.includes("geen") || extraAnswers.length === 0) {
    return monitors;
  }

  let filtered = [...monitors];

  if (extraAnswers.includes("usb-c")) {
    const usbc = filtered.filter(m => m.usb_c === "Ja");
    if (usbc.length > 0) filtered = usbc;
  }

  if (extraAnswers.includes("gebogen")) {
    const curved = filtered.filter(m => m.gebogen === "Ja");
    if (curved.length > 0) filtered = curved;
  }

  if (extraAnswers.includes("speakers")) {
    const spk = filtered.filter(m => m.speakers === "Ja");
    if (spk.length > 0) filtered = spk;
  }

  if (extraAnswers.includes("4k")) {
    const fourk = filtered.filter(m => m.resolutie === "4K");
    if (fourk.length > 0) filtered = fourk;
  }

  if (extraAnswers.includes("hdr")) {
    const hdr = filtered.filter(m => m.hdr === "Ja");
    if (hdr.length > 0) filtered = hdr;
  }

  return filtered;
}

// ─── Main matching function ───────────────────────────────────────────────────

export function matchMonitors(monitors, sizeGroup, priceGroup, answers, scores) {
  if (!Array.isArray(monitors) || !sizeGroup) {
    return { bestMatch: null, bestType: null, filteredMatchedMonitors: [] };
  }

  const allowedSizes = sizeGroupToAllowedSizes[sizeGroup] || [];

  // 1. Filter by size + price
  let filtered = monitors.filter(m => {
    const price = parsePrice(m.prijs);
    return (
      allowedSizes.includes(m.schermdiagonaal) &&
      (!priceGroup || (price >= priceGroup.min && price <= priceGroup.max))
    );
  });

  if (filtered.length === 0) {
    return { bestMatch: null, bestType: null, filteredMatchedMonitors: [] };
  }

  // 2. Pick best tier by score
  const sortedTiers = Object.entries(scores)
    .sort((a, b) => Number(b[1]) - Number(a[1]));

  let matchedMonitors = [];
  let bestType = null;

  for (let i = 0; i < sortedTiers.length; i++) {
    const [, topScore] = sortedTiers[i];
    const tiersWithTopScore = sortedTiers
      .filter(([, s]) => Number(s) === Number(topScore))
      .map(([t]) => t);

    let candidates = filtered.filter(m => tiersWithTopScore.includes(getMonitorTier(m)));

    if (candidates.length === 0) continue;

    // 3. Apply Hz filter
    candidates = applyHzFilter(candidates, answers.hz ?? "");
    if (candidates.length === 0) continue;

    // 4. Apply extra preferences
    candidates = applyExtraFilter(candidates, answers.extraAnswers ?? []);
    if (candidates.length === 0) continue;

    matchedMonitors = [...candidates];
    bestType = tiersWithTopScore.join(" / ");
    break;
  }

  // Fallback: if tier matching yielded nothing, use all size+price filtered with hz filter
  if (matchedMonitors.length === 0) {
    let fallback = applyHzFilter(filtered, answers.hz ?? "");
    fallback = applyExtraFilter(fallback, answers.extraAnswers ?? []);
    if (fallback.length === 0) fallback = [...filtered];
    matchedMonitors = fallback;
    bestType = "Algemeen";
  }

  // Best match = cheapest in the matched set
  const bestMatch = matchedMonitors.reduce((cheapest, m) => {
    return parsePrice(m.prijs) < parsePrice(cheapest.prijs) ? m : cheapest;
  });

  return { bestMatch, bestType, filteredMatchedMonitors: matchedMonitors };
}

export function computeMatchForPriceGroup(monitors, sizeGroup, priceGroup, answers, scores) {
  return matchMonitors(monitors, sizeGroup, priceGroup, answers, scores);
}

export function getIdealTierSet(scores) {
  if (!scores || typeof scores !== "object") return new Set();
  const entries = Object.entries(scores);
  if (entries.length === 0) return new Set();

  const maxScore = Math.max(...entries.map(([, v]) => Number(v)));
  return new Set(entries.filter(([, v]) => Number(v) === maxScore).map(([t]) => t));
}

export function buildResultPoints(monitor, answers) {
  const points = [];
  const gebruik = Array.isArray(answers?.gebruik) ? answers.gebruik : [];

  if (gebruik.includes("gaming") && monitor.hz >= 144) {
    points.push(`${monitor.hz}Hz verversingssnelheid voor vloeiend gaming`);
  } else if (monitor.hz >= 144) {
    points.push(`${monitor.hz}Hz verversingssnelheid`);
  }

  if (monitor.resolutie === "4K") {
    points.push("4K resolutie voor superscherp beeld");
  } else if (monitor.resolutie === "QHD" || monitor.resolutie === "UWQHD") {
    points.push("QHD resolutie — meer werkruimte en scherpte");
  }

  if (monitor.paneeltype === "OLED") {
    points.push("OLED-paneel met perfecte zwartweergave");
  } else if (monitor.paneeltype === "IPS") {
    points.push("IPS-paneel met brede kijkhoeken en nauwkeurige kleuren");
  } else if (monitor.paneeltype === "VA") {
    points.push("VA-paneel met hoog contrast");
  }

  if (gebruik.includes("creatief") && monitor.hdr === "Ja") {
    points.push("HDR-ondersteuning voor bredere kleurweergave");
  }

  if (monitor.usb_c === "Ja") {
    points.push("USB-C aansluiting voor modern opladen en aansluiten");
  }

  if (monitor.gebogen === "Ja") {
    points.push("Gebogen scherm voor een meeslepende ervaring");
  }

  if (monitor.speakers === "Ja") {
    points.push("Ingebouwde luidsprekers — geen externe speakers nodig");
  }

  return points.slice(0, 4);
}
