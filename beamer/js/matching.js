import { helderheidMin, GEWICHT_DRAAGBAAR_MAX_KG, GEBRUIK_MARKT_POSITIES, RESOLUTIE_HOOG, RESOLUTIE_LAAG, GELUID_STIL_MAX_DB, KORTE_WORP_TYPES } from "./data.js";
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

// Beamers hebben geen fysieke pasvorm-eis zoals vaatwasser (inbouw/
// vrijstaand) of wasmachine (capaciteit) — dus geen harde eerste filter.
// Alle vragen zijn zachte, gracieus degraderende voorkeursfilters die in
// cascade worden toegepast op de volledige catalogus.

// ─── Gebruiksdoel (markt_positionering) ─────────────────────────────────────

export function applyGebruikFilter(beamers, gebruik) {
  const posities = GEBRUIK_MARKT_POSITIES[gebruik];
  if (!posities) return beamers;
  const filtered = beamers.filter(b => posities.includes(b.marktPositionering));
  return filtered.length > 0 ? filtered : beamers;
}

// ─── Hoeveelheid licht in de ruimte (helderheid) ────────────────────────────

export function applyHelderheidFilter(beamers, licht) {
  const min = helderheidMin[licht];
  if (min === undefined) return beamers;
  const filtered = beamers.filter(b => b.helderheidLumen !== null && b.helderheidLumen >= min);
  return filtered.length > 0 ? filtered : beamers;
}

// ─── Draagbaarheid (gewicht) ────────────────────────────────────────────────

export function applyDraagbaarFilter(beamers, draagbaar) {
  if (draagbaar !== "ja") return beamers;
  const licht = beamers.filter(b => b.gewichtKg !== null && b.gewichtKg <= GEWICHT_DRAAGBAAR_MAX_KG);
  return licht.length > 0 ? licht : beamers;
}

// ─── Beeldkwaliteit (resolutie) ─────────────────────────────────────────────
// Bewust niet-technisch uitgevraagd ("Gewoon prima"/"Heel goed") — zie
// RESOLUTIE_HOOG/RESOLUTIE_LAAG in data.js voor de vertaling naar echte
// resolutiewaarden.

export function applyBeeldkwaliteitFilter(beamers, beeldkwaliteit) {
  if (beeldkwaliteit === "heel-goed") {
    const hoog = beamers.filter(b => RESOLUTIE_HOOG.has(b.resolutie));
    return hoog.length > 0 ? hoog : beamers;
  }
  if (beeldkwaliteit === "prima") {
    // "Gewoon prima" sluit alleen de duidelijk lage/budget-resoluties uit,
    // het is geen voorkeur VOOR een specifieke resolutie, maar tegen de
    // duidelijk mindere.
    const nietLaag = beamers.filter(b => !RESOLUTIE_LAAG.has(b.resolutie));
    return nietLaag.length > 0 ? nietLaag : beamers;
  }
  return beamers;
}

// ─── Extra preferences (Functies) ──────────────────────────────────────────

export function applyExtraFilter(beamers, extraAnswers) {
  if (!Array.isArray(extraAnswers) || extraAnswers.includes("geen") || extraAnswers.length === 0) {
    return beamers;
  }

  let filtered = [...beamers];

  if (extraAnswers.includes("smart-tv")) {
    const st = filtered.filter(b => b.smartTv === "Ja");
    if (st.length > 0) filtered = st;
  }

  if (extraAnswers.includes("speakers")) {
    const sp = filtered.filter(b => b.ingebouwdeLuidsprekers === "Ja");
    if (sp.length > 0) filtered = sp;
  }

  if (extraAnswers.includes("laser")) {
    const ls = filtered.filter(b => b.lichtbronType === "Laser");
    if (ls.length > 0) filtered = ls;
  }

  if (extraAnswers.includes("stil")) {
    const st = filtered.filter(b => b.geluidDb !== null && b.geluidDb <= GELUID_STIL_MAX_DB);
    if (st.length > 0) filtered = st;
  }

  if (extraAnswers.includes("korte-worp")) {
    const kw = filtered.filter(b => KORTE_WORP_TYPES.has(b.worpType));
    if (kw.length > 0) filtered = kw;
  }

  return filtered;
}

// ─── Main matching function ───────────────────────────────────────────────

export function matchBeamers(beamers, answers) {
  if (!Array.isArray(beamers) || beamers.length === 0) {
    return { bestMatch: null, bestType: null, filteredMatchedBeamers: [] };
  }

  let matched = applyGebruikFilter(beamers, answers?.gebruik ?? "");
  matched = applyHelderheidFilter(matched, answers?.licht ?? "");
  matched = applyBeeldkwaliteitFilter(matched, answers?.beeldkwaliteit ?? "");
  matched = applyDraagbaarFilter(matched, answers?.draagbaar ?? "");
  matched = applyExtraFilter(matched, answers?.extraAnswers ?? []);

  // Verplichte eindfallback: geen harde partitie hier, dus de volledige
  // catalogus is zelf al de basis om op terug te vallen.
  if (matched.length === 0) matched = [...beamers];

  const bestMatch = matched.reduce((cheapest, b) => {
    return parsePrice(b.prijs) < parsePrice(cheapest.prijs) ? b : cheapest;
  });

  return { bestMatch, bestType: "Algemeen", filteredMatchedBeamers: matched };
}

// "mix" heeft bewust geen entry — zie GEBRUIK_MARKT_POSITIES in data.js,
// zonder mapping wordt er ook geen "Geschikt voor ..."-punt gegenereerd.
const GEBRUIK_LABELS = {
  thuisbioscoop: "thuisbioscoop",
  gamen:         "gamen",
  werk:          "werk en presentaties",
};

export function buildResultPoints(beamer, answers) {
  const points = [];
  const gebruik = answers?.gebruik ?? "";
  const licht = answers?.licht ?? "";
  const beeldkwaliteit = answers?.beeldkwaliteit ?? "";
  const draagbaar = answers?.draagbaar ?? "";
  const extraAnswers = Array.isArray(answers?.extraAnswers) ? answers.extraAnswers : [];

  // Houdt bij welk feit al in een punt verwerkt is, zodat de generieke
  // aanvulling verderop nooit hetzelfde gegeven (bv. helderheid) nog een
  // keer met andere woorden herhaalt (zie 5.5 in nieuwe-keuzehulp.md).
  const gebruikt = new Set();

  const gebruikLabel = GEBRUIK_LABELS[gebruik];
  if (gebruikLabel && GEBRUIK_MARKT_POSITIES[gebruik]?.includes(beamer.marktPositionering)) {
    points.push(`Geschikt voor ${gebruikLabel}`);
  }

  if (licht && beamer.helderheidLumen) {
    const label = licht === "licht" ? "helder genoeg voor een verlichte ruimte" : licht === "donker" ? "ideaal voor een verduisterde ruimte" : "geschikt voor een normaal verduisterde ruimte";
    points.push(`${beamer.helderheidLumen} ANSI lumen, ${label}`);
    gebruikt.add("helderheid");
  }

  if (beeldkwaliteit === "heel-goed" && RESOLUTIE_HOOG.has(beamer.resolutie)) {
    points.push(`Scherp beeld: ${beamer.resolutie}`);
    gebruikt.add("resolutie");
  } else if (beeldkwaliteit === "prima" && beamer.resolutie && !RESOLUTIE_LAAG.has(beamer.resolutie)) {
    points.push(`Resolutie: ${beamer.resolutie}`);
    gebruikt.add("resolutie");
  }

  if (draagbaar === "ja" && beamer.gewichtKg !== null && beamer.gewichtKg <= 2.5) {
    points.push(`Licht en compact (${beamer.gewichtKg} kg)`);
    gebruikt.add("gewicht");
  }

  if (extraAnswers.includes("smart-tv") && beamer.smartTv === "Ja") {
    points.push("Smart TV met ingebouwde apps (o.a. streamingdiensten)");
  }

  if (extraAnswers.includes("speakers") && beamer.ingebouwdeLuidsprekers === "Ja") {
    points.push("Ingebouwde luidsprekers");
  }

  if (extraAnswers.includes("laser") && beamer.lichtbronType === "Laser") {
    points.push("Laser-lichtbron: lange levensduur, geen lamp vervangen");
  }

  if (extraAnswers.includes("stil") && beamer.geluidDb !== null && beamer.geluidDb <= GELUID_STIL_MAX_DB) {
    points.push(`Stil in gebruik (${beamer.geluidDb} dB)`);
    gebruikt.add("geluid");
  }

  if (extraAnswers.includes("korte-worp") && KORTE_WORP_TYPES.has(beamer.worpType)) {
    points.push("Kan dicht tegen de muur/het scherm geplaatst worden");
  }

  // Generieke aanvulling: garandeert altijd 4 punten. Elk feit hierboven kan
  // hier nog maar 1x bijdragen (zie 'gebruikt').
  if (points.length < 4 && !gebruikt.has("helderheid") && beamer.helderheidLumen) {
    points.push(`${beamer.helderheidLumen} ANSI lumen`);
    gebruikt.add("helderheid");
  }
  if (points.length < 4 && !gebruikt.has("resolutie") && beamer.resolutie) {
    points.push(`Resolutie: ${beamer.resolutie}`);
    gebruikt.add("resolutie");
  }
  if (points.length < 4 && !gebruikt.has("geluid") && beamer.geluidDb !== null) {
    points.push(`${beamer.geluidDb} dB geluidsniveau`);
    gebruikt.add("geluid");
  }
  if (points.length < 4 && !gebruikt.has("gewicht") && beamer.gewichtKg !== null) {
    points.push(`${beamer.gewichtKg} kg`);
    gebruikt.add("gewicht");
  }
  if (points.length < 4 && beamer.merk) {
    points.push(`${beamer.merk}, een bekend merk in beamers`);
  }
  // Pure vangnet-zinnen, geen productdata nodig — 3 stuks, zelfde reden als
  // bij airfryer/robotstofzuiger (2 bleek eerder niet altijd genoeg).
  if (points.length < 4) {
    points.push("Betrouwbare keuze voor dagelijks gebruik");
  }
  if (points.length < 4) {
    points.push("Onderdeel van een uitgebreid assortiment beamers bij onze aanbieders");
  }
  if (points.length < 4) {
    points.push("Vergeleken op basis van actuele prijzen bij onze aanbieders");
  }

  return points.slice(0, 4);
}
