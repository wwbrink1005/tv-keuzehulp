import { gezinsgrootteMinCapaciteit, STIL_DB_THRESHOLD, GESCHIKT_VOOR_GARAGE_KLASSEN } from "./data.js";
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

// Net als koelkast: geen Budget/Mid/Premium tier-cascade (geen natuurlijke
// prestatie-as), maar een hard plaatsing-filter, een gracieus degraderend
// sub-type-filter, en zachte voorkeursfilters.

// ─── Hard filter: inbouw / vrijstaand kastmodel / vrieskist ───────────────────

export function filterByPlaatsing(vriezers, plaatsing) {
  return vriezers.filter(v => v.plaatsing === plaatsing);
}

// ─── Sub-partition: nishoogte (inbouw) of groottebucket (vrijstaand/vrieskist) ─
// Mandatory graceful degrade: nul matches → val terug op de volledige
// plaatsing-gefilterde set i.p.v. leeg terug te geven.

export function filterBySubGroup(vriezers, plaatsing, subGroup) {
  if (!subGroup) return vriezers;

  if (plaatsing === "inbouw") {
    const matched = vriezers.filter(v => v.nishoogteGroup === Number(subGroup));
    return matched.length > 0 ? matched : vriezers;
  }

  const matched = vriezers.filter(v => v.grootteGroup === subGroup);
  return matched.length > 0 ? matched : vriezers;
}

// ─── Soft preference: gezinsgrootte → hogere netto inhoud ─────────────────────

export function applyGezinsgrootteFilter(vriezers, gezinsgrootte) {
  const min = gezinsgrootteMinCapaciteit[gezinsgrootte];
  if (!min) return vriezers;
  const filtered = vriezers.filter(v => v.nettoInhoudL !== null && v.nettoInhoudL >= min);
  return filtered.length > 0 ? filtered : vriezers;
}

// ─── Extra preferences (Q4) ─────────────────────────────────────────────────────

export function applyExtraFilter(vriezers, extraAnswers) {
  if (!Array.isArray(extraAnswers) || extraAnswers.includes("geen") || extraAnswers.length === 0) {
    return vriezers;
  }

  let filtered = [...vriezers];

  if (extraAnswers.includes("energiezuinig")) {
    const zuinig = filtered.filter(v => ["A", "B", "C"].includes(v.energielabel));
    if (zuinig.length > 0) filtered = zuinig;
  }

  if (extraAnswers.includes("stil")) {
    const stil = filtered.filter(v => v.geluidsniveauDb !== null && v.geluidsniveauDb <= STIL_DB_THRESHOLD);
    if (stil.length > 0) filtered = stil;
  }

  if (extraAnswers.includes("nofrost")) {
    const nf = filtered.filter(v => v.automatischOntdooien === "Ja");
    if (nf.length > 0) filtered = nf;
  }

  if (extraAnswers.includes("garage")) {
    const geschikt = filtered.filter(v => v.klimaatklasse && GESCHIKT_VOOR_GARAGE_KLASSEN.includes(v.klimaatklasse));
    if (geschikt.length > 0) filtered = geschikt;
  }

  return filtered;
}

// ─── Main matching function ───────────────────────────────────────────────────

export function matchVriezers(vriezers, answers) {
  if (!Array.isArray(vriezers) || !answers?.plaatsing) {
    return { bestMatch: null, bestType: null, filteredMatchedVriezers: [] };
  }

  // 1. Hard filter: plaatsing
  const filtered = filterByPlaatsing(vriezers, answers.plaatsing);
  if (filtered.length === 0) {
    return { bestMatch: null, bestType: null, filteredMatchedVriezers: [] };
  }

  const subGroup = answers.plaatsing === "inbouw" ? answers.nishoogte : answers.grootte;

  // 2. Sub-partition (gracefully degrades internally)
  let matched = filterBySubGroup(filtered, answers.plaatsing, subGroup);

  // 3. Soft preference: gezinsgrootte
  matched = applyGezinsgrootteFilter(matched, answers.gezinsgrootte);

  // 4. Soft filters: extra's
  matched = applyExtraFilter(matched, answers.extraAnswers ?? []);

  // Mandatory end fallback: never return empty when the plaatsing-filtered
  // set has stock.
  if (matched.length === 0) {
    let fallback = applyGezinsgrootteFilter(filtered, answers.gezinsgrootte);
    fallback = applyExtraFilter(fallback, answers.extraAnswers ?? []);
    if (fallback.length === 0) fallback = [...filtered];
    matched = fallback;
  }

  const bestTypeLabels = { inbouw: "Inbouw", vrijstaand: "Vrijstaand kastmodel", vrieskist: "Vrieskist" };
  const bestType = bestTypeLabels[answers.plaatsing] ?? null;

  // Best match = cheapest in the matched set
  const bestMatch = matched.reduce((cheapest, v) => {
    return parsePrice(v.prijs) < parsePrice(cheapest.prijs) ? v : cheapest;
  });

  return { bestMatch, bestType, filteredMatchedVriezers: matched };
}

// De kaartpunten ("Waarom dit bij jou past") staan in punten.js.
