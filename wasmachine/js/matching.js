import { heeftWasprogramma, isCapaciteitInGroup, WASPROGRAMMA_DEFINITIES } from "./data.js";
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

// Geen scoring-as meer voor "gebruik" (zie matchWasmachines) — behouden als
// no-op zodat de call-sites/localStorage-vorm elders niet hoeven te wijzigen.
export function calculateScores() {
  return {};
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

  // Bovenlader eerst en apart: dat is een fysiek vormfactor-vereiste, geen
  // "leuk om te hebben"-extra zoals de rest. Door 'm als eerste toe te passen
  // blijft die subset de basis waar de overige extra's op verder filteren,
  // i.p.v. dat een latere extra de bovenlader-voorkeur per ongeluk
  // wegfiltert (en dus stilletjes genegeerd wordt door de gracieuze
  // degradatie hieronder).
  if (extraAnswers.includes("bovenlader")) {
    const bl = filtered.filter(w => w.typeLader === "Bovenlader");
    if (bl.length > 0) filtered = bl;
  }

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

  if (extraAnswers.includes("aquastop")) {
    const aq = filtered.filter(w => w.aquastop === "Ja");
    if (aq.length > 0) filtered = aq;
  }

  if (extraAnswers.includes("inverter")) {
    const inv = filtered.filter(w => w.inverter === "Ja");
    if (inv.length > 0) filtered = inv;
  }

  return filtered;
}

// ─── Specifieke wasprogramma's ──────────────────────────────────────────────

export function applyProgrammaFilter(wasmachines, programmaAnswers) {
  if (!Array.isArray(programmaAnswers) || programmaAnswers.includes("geen") || programmaAnswers.length === 0) {
    return wasmachines;
  }

  let filtered = [...wasmachines];

  for (const key of programmaAnswers) {
    const match = filtered.filter(w => heeftWasprogramma(w.wasprogrammas, key));
    if (match.length > 0) filtered = match;
  }

  return filtered;
}

// ─── Main matching function ───────────────────────────────────────────────────

export function matchWasmachines(wasmachines, capaciteitGroup, priceGroup, answers) {
  if (!Array.isArray(wasmachines) || !capaciteitGroup) {
    return { bestMatch: null, bestType: null, filteredMatchedWasmachines: [] };
  }

  // 1. Filter by capaciteit + price
  const filtered = wasmachines.filter(w => {
    const price = parsePrice(w.prijs);
    return (
      isCapaciteitInGroup(w.capaciteit, capaciteitGroup) &&
      (!priceGroup || (price >= priceGroup.min && price <= priceGroup.max))
    );
  });

  if (filtered.length === 0) {
    return { bestMatch: null, bestType: null, filteredMatchedWasmachines: [] };
  }

  // 2. Apply geluid filter
  let candidates = applyGeluidFilter(filtered, answers.geluid ?? "");

  // 3. Apply extra preferences
  candidates = applyExtraFilter(candidates, answers.extraAnswers ?? []);

  // 4. Apply specifieke wasprogramma's
  candidates = applyProgrammaFilter(candidates, answers.programmaAnswers ?? []);

  const matchedWasmachines = candidates.length > 0 ? candidates : filtered;

  // Best match = cheapest in the matched set
  const bestMatch = matchedWasmachines.reduce((cheapest, w) => {
    return parsePrice(w.prijs) < parsePrice(cheapest.prijs) ? w : cheapest;
  });

  return { bestMatch, bestType: "Algemeen", filteredMatchedWasmachines: matchedWasmachines };
}

// De kaartpunten ("Waarom dit bij jou past") staan in punten.js.
