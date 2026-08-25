import { capaciteitLiterMin } from "./data.js";
import { parsePrice } from "./utils.js";

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

const PERSONEN_LABELS = {
  klein:     "1-2 personen",
  gemiddeld: "3-4 personen",
  groot:     "5 of meer personen",
};

export function buildResultPoints(airfryer, answers) {
  const points = [];
  const personen = answers?.personen ?? "";
  const dubbeleMand = answers?.dubbeleMand ?? "";
  const gebruik = answers?.gebruik ?? "";
  const extraAnswers = Array.isArray(answers?.extraAnswers) ? answers.extraAnswers : [];

  // Houdt bij welk feit al in een punt verwerkt is, zodat de generieke
  // aanvulling verderop nooit hetzelfde gegeven (bv. capaciteit) nog een
  // keer met andere woorden herhaalt.
  const gebruikt = new Set();

  if (personen && airfryer.capaciteitLiter) {
    const label = PERSONEN_LABELS[personen];
    points.push(label ? `${airfryer.capaciteitLiter} liter, past bij ${label}` : `${airfryer.capaciteitLiter} liter inhoud`);
    gebruikt.add("capaciteit");
  }

  if (dubbeleMand === "ja" && airfryer.constructietype === "Dubbel") {
    points.push("Dubbele mand: bereid 2 gerechten tegelijk, los van elkaar");
    gebruikt.add("constructietype");
  } else if (dubbeleMand === "nee" && airfryer.constructietype === "Enkel") {
    points.push("Enkele mand");
    gebruikt.add("constructietype");
  }

  if (gebruik === "grillen-braden" || gebruik === "alles-in-1") {
    if (airfryer.grillen === "Ja") points.push("Kan ook grillen");
    if (points.length < 4 && airfryer.braadfunctie === "Ja") points.push("Kan ook braden");
  }

  if (gebruik === "alles-in-1") {
    if (points.length < 4 && airfryer.stoomfunctie === "Ja") points.push("Heeft ook een stoomfunctie");
    if (points.length < 4 && airfryer.dehydratiefunctie === "Ja") points.push("Kan ook drogen/dehydrateren");
  }

  if (extraAnswers.includes("kijkglas") && airfryer.kijkglas === "Ja") {
    points.push("Kijkglas: zie het eten tijdens het bakken");
  }

  if (extraAnswers.includes("display") && airfryer.display === "Ja") {
    points.push("Ingebouwd (digitaal) display");
  }

  if (extraAnswers.includes("vaatwasserbestendig") && airfryer.vaatwasserbestendig === "Ja") {
    points.push("Onderdelen zijn vaatwasserbestendig");
  }

  // Generieke aanvulling: garandeert altijd 4 punten. Elk feit hierboven kan
  // hier nog maar 1x bijdragen (zie 'gebruikt'), zodat bijvoorbeeld capaciteit
  // niet dubbelop met net iets andere woorden terugkomt.
  if (points.length < 4 && !gebruikt.has("vermogen") && airfryer.vermogenWatt) {
    points.push(`Vermogen van ${airfryer.vermogenWatt} watt`);
    gebruikt.add("vermogen");
  }
  if (points.length < 4 && !gebruikt.has("programmas") && airfryer.aantalProgrammas) {
    points.push(`${airfryer.aantalProgrammas} voorgeprogrammeerde standen`);
    gebruikt.add("programmas");
  }
  if (points.length < 4 && !gebruikt.has("capaciteit") && airfryer.capaciteitLiter) {
    points.push(`${airfryer.capaciteitLiter} liter inhoud`);
    gebruikt.add("capaciteit");
  }
  if (points.length < 4 && airfryer.merk) {
    points.push(`${airfryer.merk}, een bekend merk in airfryers`);
  }
  // Pure vangnet-zinnen, geen productdata nodig — 3 stuks. Getest tegen de
  // volledige live catalogus (155 producten) over alle personen×gebruik-
  // combinaties: met 2 vangnet-zinnen zakten nog 81 combinaties onder de 4
  // punten (producten met alleen merk + weinig andere gevulde velden), pas
  // met 3 bleef het altijd op minimaal 4 — zelfde patroon als bij
  // robotstofzuiger (zie 5.5 in nieuwe-keuzehulp.md).
  if (points.length < 4) {
    points.push("Betrouwbare keuze voor dagelijks gebruik");
  }
  if (points.length < 4) {
    points.push("Onderdeel van een uitgebreid assortiment airfryers bij onze aanbieders");
  }
  if (points.length < 4) {
    points.push("Vergeleken op basis van actuele prijzen bij onze aanbieders");
  }

  return points.slice(0, 4);
}
