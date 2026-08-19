import { getMonitorTier, scoringSystem, sizeGroupToAllowedSizes, TIER_ORDER } from "./data.js";
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
  if (hz === "extreem") {
    const extreem = monitors.filter(m => m.hz >= 240);
    if (extreem.length > 0) return extreem;
    const vloeiend = monitors.filter(m => m.hz >= 120);
    if (vloeiend.length > 0) return vloeiend;
    return monitors;
  }

  if (hz === "vloeiend") {
    const vloeiend = monitors.filter(m => m.hz >= 120 && m.hz < 240);
    if (vloeiend.length > 0) return vloeiend;
    const soepel = monitors.filter(m => m.hz >= 75);
    if (soepel.length > 0) return soepel;
    return monitors;
  }

  if (hz === "soepel") {
    const soepel = monitors.filter(m => m.hz >= 75 && m.hz < 120);
    if (soepel.length > 0) return soepel;
    return monitors;
  }

  // "rustig" → no Hz filter (60Hz is fine)
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

    // Bij een gelijke stand tussen tiers voegen we ze niet samen (dat maakt de
    // resultatenlijst juist grovers/breder) — we evalueren elke getelde tier
    // apart en kiezen de tier met de kleinste niet-lege resultatenset, zodat
    // de klant zo specifiek mogelijke keuzes krijgt in plaats van de optelsom
    // van alle tiers die toevallig gelijk scoorden.
    let bestTierCandidates = null;
    let bestTierName = null;

    for (const tier of tiersWithTopScore) {
      let tierCandidates = filtered.filter(m => getMonitorTier(m) === tier);
      tierCandidates = applyHzFilter(tierCandidates, answers.hz ?? "");
      tierCandidates = applyExtraFilter(tierCandidates, answers.extraAnswers ?? []);
      if (tierCandidates.length === 0) continue;
      if (bestTierCandidates === null || tierCandidates.length < bestTierCandidates.length) {
        bestTierCandidates = tierCandidates;
        bestTierName = tier;
      }
    }

    if (bestTierCandidates === null) continue;

    matchedMonitors = bestTierCandidates;
    bestType = bestTierName;
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
    points.push("QHD resolutie voor meer werkruimte en scherpte");
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
    points.push("Ingebouwde luidsprekers, geen externe speakers nodig");
  }

  // Generieke aanvulling: garandeert altijd 4 punten. schermdiagonaal is bij
  // elke monitor gegarandeerd aanwezig (harde eis in normalizeProducts());
  // resolutie/paneeltype/hz zijn hierboven alleen bij de hogere waarden
  // gedekt, dus vul de resterende (Full HD/HD, TN, <144Hz) hier generiek aan.
  if (points.length < 4) {
    points.push(`${monitor.schermdiagonaal}" scherm`);
  }
  if (points.length < 4 && monitor.resolutie && !points.some(p => p.includes(monitor.resolutie))) {
    points.push(`${monitor.resolutie}-resolutie`);
  }
  if (points.length < 4 && monitor.paneeltype && !points.some(p => p.includes(monitor.paneeltype))) {
    points.push(`${monitor.paneeltype}-paneel`);
  }
  if (points.length < 4 && monitor.hz && !points.some(p => p.includes("Hz"))) {
    points.push(`${monitor.hz}Hz verversingssnelheid`);
  }
  if (points.length < 4 && monitor.beeldverhouding) {
    points.push(`${monitor.beeldverhouding} beeldverhouding`);
  }
  if (points.length < 4 && monitor.merk) {
    points.push(`Van het merk ${monitor.merk}`);
  }
  if (points.length < 4) {
    points.push("Scherp en helder beeld voor dagelijks gebruik");
  }

  return points.slice(0, 4);
}
