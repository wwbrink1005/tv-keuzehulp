import { heeftDroogprogramma, isCapaciteitInGroup, DROOGPROGRAMMA_DEFINITIES } from "./data.js";
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

// Geen scoring-as (zie data.js) — behouden als no-op zodat de call-sites/
// localStorage-vorm elders niet hoeven te wijzigen, zelfde patroon als wasmachine.
export function calculateScores() {
  return {};
}

// ─── Geluid filter ─────────────────────────────────────────────────────────────

export function applyGeluidFilter(wasdrogers, geluid) {
  if (geluid === "belangrijk") {
    const stil = wasdrogers.filter(w => w.geluidDb !== null && w.geluidDb <= 62);
    if (stil.length > 0) return stil;
    const redelijkStil = wasdrogers.filter(w => w.geluidDb !== null && w.geluidDb <= 65);
    if (redelijkStil.length > 0) return redelijkStil;
    return wasdrogers;
  }

  if (geluid === "gemiddeld") {
    const redelijk = wasdrogers.filter(w => w.geluidDb !== null && w.geluidDb <= 67);
    if (redelijk.length > 0) return redelijk;
    return wasdrogers;
  }

  // "niet" of onbeantwoord → geen filter
  return wasdrogers;
}

// ─── Extra preferences ────────────────────────────────────────────────────────

export function applyExtraFilter(wasdrogers, extraAnswers) {
  if (!Array.isArray(extraAnswers) || extraAnswers.includes("geen") || extraAnswers.length === 0) {
    return wasdrogers;
  }

  let filtered = [...wasdrogers];

  if (extraAnswers.includes("energiezuinig")) {
    const zuinig = filtered.filter(w => ["A", "B", "C"].includes(w.energieLabel));
    if (zuinig.length > 0) filtered = zuinig;
  }

  if (extraAnswers.includes("uitgestelde-start")) {
    const us = filtered.filter(w => w.uitgesteldeStart === "Ja");
    if (us.length > 0) filtered = us;
  }

  if (extraAnswers.includes("kinderslot")) {
    const ks = filtered.filter(w => w.kinderslot === "Ja");
    if (ks.length > 0) filtered = ks;
  }

  if (extraAnswers.includes("wifi")) {
    const wf = filtered.filter(w => w.wifi === "Ja");
    if (wf.length > 0) filtered = wf;
  }

  if (extraAnswers.includes("antikreuk")) {
    const ak = filtered.filter(w => w.antikreuk === "Ja");
    if (ak.length > 0) filtered = ak;
  }

  if (extraAnswers.includes("vochtsensor")) {
    const vs = filtered.filter(w => w.vochtsensor === "Ja");
    if (vs.length > 0) filtered = vs;
  }

  return filtered;
}

// ─── Specifieke droogprogramma's ──────────────────────────────────────────────

export function applyProgrammaFilter(wasdrogers, programmaAnswers) {
  if (!Array.isArray(programmaAnswers) || programmaAnswers.includes("geen") || programmaAnswers.length === 0) {
    return wasdrogers;
  }

  let filtered = [...wasdrogers];

  for (const key of programmaAnswers) {
    const match = filtered.filter(w => heeftDroogprogramma(w.droogprogrammas, key));
    if (match.length > 0) filtered = match;
  }

  return filtered;
}

// ─── Main matching function ───────────────────────────────────────────────────

export function matchWasdrogers(wasdrogers, capaciteitGroup, priceGroup, answers) {
  if (!Array.isArray(wasdrogers) || !capaciteitGroup) {
    return { bestMatch: null, bestType: null, filteredMatchedWasdrogers: [] };
  }

  // 1. Filter by capaciteit + price
  const filtered = wasdrogers.filter(w => {
    const price = parsePrice(w.prijs);
    return (
      isCapaciteitInGroup(w.capaciteit, capaciteitGroup) &&
      (!priceGroup || (price >= priceGroup.min && price <= priceGroup.max))
    );
  });

  if (filtered.length === 0) {
    return { bestMatch: null, bestType: null, filteredMatchedWasdrogers: [] };
  }

  // 2. Apply geluid filter
  let candidates = applyGeluidFilter(filtered, answers.geluid ?? "");

  // 3. Apply extra preferences
  candidates = applyExtraFilter(candidates, answers.extraAnswers ?? []);

  // 4. Apply specifieke droogprogramma's
  candidates = applyProgrammaFilter(candidates, answers.programmaAnswers ?? []);

  const matchedWasdrogers = candidates.length > 0 ? candidates : filtered;

  // Best match = cheapest in the matched set
  const bestMatch = matchedWasdrogers.reduce((cheapest, w) => {
    return parsePrice(w.prijs) < parsePrice(cheapest.prijs) ? w : cheapest;
  });

  return { bestMatch, bestType: "Algemeen", filteredMatchedWasdrogers: matchedWasdrogers };
}

// De kaartpunten ("Waarom dit bij jou past") staan in punten.js.
