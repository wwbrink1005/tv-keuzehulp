import { capaciteitLiterMin } from "./data.js";
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

// Airfryers hebben geen fysieke pasvorm-eis zoals vaatwasser (inbouw/
// vrijstaand) of wasmachine (capaciteit) — dus geen harde eerste filter.
// Alle vragen zijn zachte, gracieus degraderende voorkeursfilters die in
// cascade worden toegepast op de volledige catalogus.

// ─── Personen (via capaciteit in liter) ─────────────────────────────────────

export function applyPersonenFilter(airfryers, personen) {
  const min = capaciteitLiterMin[personen];
  if (min === undefined) return airfryers;
  const filtered = airfryers.filter(a => a.capaciteitLiter !== null && a.capaciteitLiter >= min);
  return filtered.length > 0 ? filtered : airfryers;
}

// ─── Constructietype (enkele/dubbele mand) ─────────────────────────────────

export function applyConstructietypeFilter(airfryers, dubbeleMand) {
  if (dubbeleMand === "ja") {
    const dubbel = airfryers.filter(a => a.constructietype === "Dubbel");
    return dubbel.length > 0 ? dubbel : airfryers;
  }
  if (dubbeleMand === "nee") {
    const enkel = airfryers.filter(a => a.constructietype === "Enkel");
    return enkel.length > 0 ? enkel : airfryers;
  }
  return airfryers;
}

// ─── Gebruik (grillen/braden/stomen/drogen) ────────────────────────────────

export function applyGebruikFilter(airfryers, gebruik) {
  if (gebruik === "grillen-braden") {
    const f = airfryers.filter(a => a.grillen === "Ja" || a.braadfunctie === "Ja");
    return f.length > 0 ? f : airfryers;
  }

  if (gebruik === "alles-in-1") {
    const strict = airfryers.filter(a =>
      a.grillen === "Ja" && a.braadfunctie === "Ja" && (a.stoomfunctie === "Ja" || a.dehydratiefunctie === "Ja")
    );
    if (strict.length > 0) return strict;
    const relaxed = airfryers.filter(a => a.grillen === "Ja" && a.braadfunctie === "Ja");
    if (relaxed.length > 0) return relaxed;
    return airfryers;
  }

  // "frituren-bakken" (basisgebruik, vrijwel elke airfryer voldoet) of geen antwoord
  return airfryers;
}

// ─── Extra preferences (Functies) ──────────────────────────────────────────

export function applyExtraFilter(airfryers, extraAnswers) {
  if (!Array.isArray(extraAnswers) || extraAnswers.includes("geen") || extraAnswers.length === 0) {
    return airfryers;
  }

  let filtered = [...airfryers];

  if (extraAnswers.includes("kijkglas")) {
    const kg = filtered.filter(a => a.kijkglas === "Ja");
    if (kg.length > 0) filtered = kg;
  }

  if (extraAnswers.includes("display")) {
    const ds = filtered.filter(a => a.display === "Ja");
    if (ds.length > 0) filtered = ds;
  }

  if (extraAnswers.includes("vaatwasserbestendig")) {
    const vw = filtered.filter(a => a.vaatwasserbestendig === "Ja");
    if (vw.length > 0) filtered = vw;
  }

  return filtered;
}

// ─── Main matching function ───────────────────────────────────────────────

export function matchAirfryers(airfryers, answers) {
  if (!Array.isArray(airfryers) || airfryers.length === 0) {
    return { bestMatch: null, bestType: null, filteredMatchedAirfryers: [] };
  }

  let matched = applyPersonenFilter(airfryers, answers?.personen ?? "");
  matched = applyConstructietypeFilter(matched, answers?.dubbeleMand ?? "");
  matched = applyGebruikFilter(matched, answers?.gebruik ?? "");
  matched = applyExtraFilter(matched, answers?.extraAnswers ?? []);

  // Verplichte eindfallback: geen harde partitie hier, dus de volledige
  // catalogus is zelf al de basis om op terug te vallen.
  if (matched.length === 0) matched = [...airfryers];

  const bestMatch = matched.reduce((cheapest, a) => {
    return parsePrice(a.prijs) < parsePrice(cheapest.prijs) ? a : cheapest;
  });

  return { bestMatch, bestType: "Algemeen", filteredMatchedAirfryers: matched };
}

// De kaartpunten ("Waarom dit bij jou past") staan in punten.js.
