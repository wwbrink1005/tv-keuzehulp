import { capaciteitGroupToAllowedCapaciteit, getWasmachineTier, scoringSystem, TIER_ORDER } from "./data.js";
import { parsePrice } from "./utils.js";

// ─── Score computation ────────────────────────────────────────────────────────

export function calculateScores(answers) {
  const scores = { Budget: 0, Mid: 0, Premium: 0 };

  const gebruik = answers.gebruik ?? "";
  if (gebruik && scoringSystem.gebruik[gebruik]) {
    for (const tier of TIER_ORDER) {
      scores[tier] += scoringSystem.gebruik[gebruik][tier] ?? 0;
    }
  }

  return scores;
}

// ─── Geluid filter ─────────────────────────────────────────────────────────────

export function applyGeluidFilter(wasmachines, geluid) {
  if (geluid === "belangrijk") {
    const stil = wasmachines.filter(w => w.geluidDb !== null && w.geluidDb <= 60);
    if (stil.length > 0) return stil;
    const redelijkStil = wasmachines.filter(w => w.geluidDb !== null && w.geluidDb <= 68);
    if (redelijkStil.length > 0) return redelijkStil;
    return wasmachines;
  }

  if (geluid === "gemiddeld") {
    const redelijk = wasmachines.filter(w => w.geluidDb !== null && w.geluidDb <= 74);
    if (redelijk.length > 0) return redelijk;
    return wasmachines;
  }

  // "niet" of onbeantwoord → geen filter
  return wasmachines;
}

// ─── Extra preferences ────────────────────────────────────────────────────────

export function applyExtraFilter(wasmachines, extraAnswers) {
  if (!Array.isArray(extraAnswers) || extraAnswers.includes("geen") || extraAnswers.length === 0) {
    return wasmachines;
  }

  let filtered = [...wasmachines];

  if (extraAnswers.includes("uitgestelde-start")) {
    const us = filtered.filter(w => w.uitgesteldeStart === "Ja");
    if (us.length > 0) filtered = us;
  }

  if (extraAnswers.includes("kinderslot")) {
    const ks = filtered.filter(w => w.kinderslot === "Ja");
    if (ks.length > 0) filtered = ks;
  }

  if (extraAnswers.includes("aquastop")) {
    const aq = filtered.filter(w => w.aquastop === "Ja");
    if (aq.length > 0) filtered = aq;
  }

  return filtered;
}

// ─── Main matching function ───────────────────────────────────────────────────

export function matchWasmachines(wasmachines, capaciteitGroup, priceGroup, answers, scores) {
  if (!Array.isArray(wasmachines) || !capaciteitGroup) {
    return { bestMatch: null, bestType: null, filteredMatchedWasmachines: [] };
  }

  const allowedCapaciteit = capaciteitGroupToAllowedCapaciteit[capaciteitGroup] || [];

  // 1. Filter by capaciteit + price
  let filtered = wasmachines.filter(w => {
    const price = parsePrice(w.prijs);
    return (
      allowedCapaciteit.includes(w.capaciteit) &&
      (!priceGroup || (price >= priceGroup.min && price <= priceGroup.max))
    );
  });

  if (filtered.length === 0) {
    return { bestMatch: null, bestType: null, filteredMatchedWasmachines: [] };
  }

  // 2. Pick best tier by score
  const sortedTiers = Object.entries(scores)
    .sort((a, b) => Number(b[1]) - Number(a[1]));

  let matchedWasmachines = [];
  let bestType = null;

  for (let i = 0; i < sortedTiers.length; i++) {
    const [, topScore] = sortedTiers[i];
    const tiersWithTopScore = sortedTiers
      .filter(([, s]) => Number(s) === Number(topScore))
      .map(([t]) => t);

    let candidates = filtered.filter(w => tiersWithTopScore.includes(getWasmachineTier(w)));

    if (candidates.length === 0) continue;

    // 3. Apply geluid filter
    candidates = applyGeluidFilter(candidates, answers.geluid ?? "");
    if (candidates.length === 0) continue;

    // 4. Apply extra preferences
    candidates = applyExtraFilter(candidates, answers.extraAnswers ?? []);
    if (candidates.length === 0) continue;

    matchedWasmachines = [...candidates];
    bestType = tiersWithTopScore.join(" / ");
    break;
  }

  // Fallback: if tier matching yielded nothing, use all capaciteit+price filtered
  // (still applying geluid/extra where possible) so a non-empty price bucket
  // never results in an empty result set.
  if (matchedWasmachines.length === 0) {
    let fallback = applyGeluidFilter(filtered, answers.geluid ?? "");
    fallback = applyExtraFilter(fallback, answers.extraAnswers ?? []);
    if (fallback.length === 0) fallback = [...filtered];
    matchedWasmachines = fallback;
    bestType = "Algemeen";
  }

  // Best match = cheapest in the matched set
  const bestMatch = matchedWasmachines.reduce((cheapest, w) => {
    return parsePrice(w.prijs) < parsePrice(cheapest.prijs) ? w : cheapest;
  });

  return { bestMatch, bestType, filteredMatchedWasmachines: matchedWasmachines };
}

export function buildResultPoints(wasmachine, answers) {
  const points = [];
  const gebruik = answers?.gebruik ?? "";
  const geluid = answers?.geluid ?? "";

  if (wasmachine.energieLabel === "A" || wasmachine.energieLabel === "B") {
    points.push(`Energielabel ${wasmachine.energieLabel} — laag energieverbruik`);
  }

  if (geluid === "belangrijk" && wasmachine.geluidDb) {
    points.push(`Slechts ${wasmachine.geluidDb} dB bij centrifugeren — erg stil`);
  } else if (wasmachine.geluidDb && wasmachine.geluidDb <= 65) {
    points.push(`${wasmachine.geluidDb} dB bij centrifugeren — stil in gebruik`);
  }

  if (wasmachine.centrifugeRpm >= 1400) {
    points.push(`${wasmachine.centrifugeRpm} toeren — droogt wasgoed sneller voor`);
  }

  if (gebruik === "gemak" && wasmachine.display === "Ja") {
    points.push("Ingebouwd display voor eenvoudige bediening");
  }

  if (wasmachine.inverter === "Ja") {
    points.push("Inverter-motor — stiller en duurzamer");
  }

  if (wasmachine.aquastop === "Ja") {
    points.push("AquaStop-functie tegen waterschade");
  }

  if (wasmachine.kinderslot === "Ja") {
    points.push("Kinderslot aanwezig");
  }

  return points.slice(0, 4);
}
