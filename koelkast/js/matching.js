import { gezinsgrootteMinCapaciteit, STIL_DB_THRESHOLD } from "./data.js";
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

// A fridge has no natural performance-tier axis the way a GPU or monitor
// panel does, so this category intentionally does NOT use a Budget/Mid/
// Premium tier-scoring cascade. Instead: a hard plaatsing filter, a
// gracefully-degrading sub-type filter, and soft preference filters — each
// one narrows only if doing so doesn't zero out the candidate set.

// ─── Hard filter: inbouw vs vrijstaand ─────────────────────────────────────────

export function filterByPlaatsing(koelkasten, plaatsing) {
  if (plaatsing === "inbouw") return koelkasten.filter(k => k.plaatsing === "inbouw");
  return koelkasten.filter(k => k.plaatsing !== "inbouw");
}

// ─── Sub-partition: nishoogte bucket (inbouw) or vrijstaand-type ──────────────
// Mandatory graceful degrade: if the exact bucket has zero matches, widen out
// to the full plaatsing-filtered set instead of returning empty.

export function filterBySubGroup(koelkasten, plaatsing, subGroup) {
  if (!subGroup) return koelkasten;

  if (plaatsing === "inbouw") {
    const matched = koelkasten.filter(k => k.nishoogteGroup === Number(subGroup));
    return matched.length > 0 ? matched : koelkasten;
  }

  const matched = koelkasten.filter(k => k.vrijstaandType === subGroup);
  return matched.length > 0 ? matched : koelkasten;
}

// ─── Soft preference: gezinsgrootte → hogere netto inhoud ─────────────────────

export function applyGezinsgrootteFilter(koelkasten, gezinsgrootte) {
  const min = gezinsgrootteMinCapaciteit[gezinsgrootte];
  if (!min) return koelkasten;
  const filtered = koelkasten.filter(k => k.nettoInhoudL !== null && k.nettoInhoudL >= min);
  return filtered.length > 0 ? filtered : koelkasten;
}

// ─── Extra preferences (Q4) ─────────────────────────────────────────────────────

export function applyExtraFilter(koelkasten, extraAnswers) {
  if (!Array.isArray(extraAnswers) || extraAnswers.includes("geen") || extraAnswers.length === 0) {
    return koelkasten;
  }

  let filtered = [...koelkasten];

  if (extraAnswers.includes("energiezuinig")) {
    const zuinig = filtered.filter(k => ["A", "B", "C"].includes(k.energielabel));
    if (zuinig.length > 0) filtered = zuinig;
  }

  if (extraAnswers.includes("stil")) {
    const stil = filtered.filter(k => k.geluidsniveauDb !== null && k.geluidsniveauDb <= STIL_DB_THRESHOLD);
    if (stil.length > 0) filtered = stil;
  }

  if (extraAnswers.includes("nofrost")) {
    const nf = filtered.filter(k => k.automatischOntdooien === "Ja");
    if (nf.length > 0) filtered = nf;
  }

  if (extraAnswers.includes("vriesvak")) {
    const vv = filtered.filter(k => k.heeftVriesvak);
    if (vv.length > 0) filtered = vv;
  }

  if (extraAnswers.includes("verszone")) {
    const vz = filtered.filter(k => k.versZone === "Ja");
    if (vz.length > 0) filtered = vz;
  }

  // Waterdispenser/ijsmaker komen vrijwel uitsluitend voor bij Amerikaanse/
  // extra-brede koelkasten (84% resp. 38-42% dekking daar, vs. 1-4% bij
  // standaard/inbouw/tafelmodel) — de checkboxes worden in de UI dan ook
  // alleen bij die types getoond (zie updateExtraOptionsVisibility in
  // quiz.js), maar de filter zelf blijft generiek/gracieus zoals de rest.
  if (extraAnswers.includes("waterdispenser")) {
    const wd = filtered.filter(k => k.waterdispenser === "Ja");
    if (wd.length > 0) filtered = wd;
  }

  if (extraAnswers.includes("ijsmaker")) {
    const im = filtered.filter(k => k.ijsmaker === "Ja");
    if (im.length > 0) filtered = im;
  }

  return filtered;
}

// ─── Main matching function ───────────────────────────────────────────────────

export function matchKoelkasten(koelkasten, answers) {
  if (!Array.isArray(koelkasten) || !answers?.plaatsing) {
    return { bestMatch: null, bestType: null, filteredMatchedKoelkasten: [] };
  }

  // 1. Hard filter: plaatsing
  const filtered = filterByPlaatsing(koelkasten, answers.plaatsing);
  if (filtered.length === 0) {
    return { bestMatch: null, bestType: null, filteredMatchedKoelkasten: [] };
  }

  const subGroup = answers.plaatsing === "inbouw" ? answers.nishoogte : answers.vrijstaandtype;

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

  const bestType = answers.plaatsing === "inbouw" ? "Inbouw" : "Vrijstaand";

  // Best match = cheapest in the matched set
  const bestMatch = matched.reduce((cheapest, k) => {
    return parsePrice(k.prijs) < parsePrice(cheapest.prijs) ? k : cheapest;
  });

  return { bestMatch, bestType, filteredMatchedKoelkasten: matched };
}

// De kaartpunten ("Waarom dit bij jou past") staan in punten.js.
