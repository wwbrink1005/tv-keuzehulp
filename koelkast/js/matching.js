import { gezinsgrootteMinCapaciteit, EXTRA_CHECKS } from "./data.js";
import { isUitgezet } from "../../shared/klant.js";
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

  // Per wens versmallen, maar alleen als er dan nog iets overblijft
  // (gracieus degraderen). Volgorde en regels staan in EXTRA_CHECKS
  // (data.js), dezelfde definitie die de B2B-embed gebruikt om opties zonder
  // data automatisch uit te zetten.
  //
  // Waterdispenser/ijsmaker komen vrijwel uitsluitend voor bij Amerikaanse/
  // extra-brede koelkasten (84% resp. 38-42% dekking daar, vs. 1-4% bij
  // standaard/inbouw/tafelmodel) — de vragenpagina toont ze dan ook alleen
  // bij die types (isBreed in vragen.js), maar de filter zelf blijft
  // generiek/gracieus zoals de rest.
  let filtered = [...koelkasten];
  for (const [wens, voldoet] of Object.entries(EXTRA_CHECKS)) {
    if (!extraAnswers.includes(wens)) continue;
    const subset = filtered.filter(voldoet);
    if (subset.length > 0) filtered = subset;
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

export function buildResultPoints(koelkast, answers) {
  const points = [];
  const gezinsgrootte = answers?.gezinsgrootte ?? "";

  if (koelkast.plaatsing === "inbouw" && koelkast.nishoogteGroup) {
    points.push(`Past in een nis van ${koelkast.nishoogteGroup} cm hoog`);
  } else if (koelkast.plaatsing === "inbouw") {
    points.push("Inbouwmodel, past onder het keukenblad");
  }

  if (koelkast.nettoInhoudL) {
    if (gezinsgrootte === "groot" && koelkast.nettoInhoudL >= 350) {
      points.push(`Ruime ${koelkast.nettoInhoudL} liter inhoud, goed voor een groot huishouden`);
    } else if (gezinsgrootte === "gemiddeld" && koelkast.nettoInhoudL >= 250) {
      points.push(`${koelkast.nettoInhoudL} liter inhoud, goed voor een gezin van 3 tot 4 personen`);
    } else {
      points.push(`${koelkast.nettoInhoudL} liter netto inhoud`);
    }
  }

  if (koelkast.geluidsniveauDb !== null && koelkast.geluidsniveauDb <= 38) {
    points.push(`Stil in gebruik (${koelkast.geluidsniveauDb} dB)`);
  }

  if (koelkast.automatischOntdooien === "Ja" && !isUitgezet("nofrost")) {
    points.push("Nooit meer ontdooien dankzij No Frost");
  }

  if (koelkast.heeftVriesvak && !isUitgezet("vriesvak")) {
    points.push("Heeft een vriesvak");
  }

  if (koelkast.versZone === "Ja" && !isUitgezet("verszone")) {
    points.push("Vers zone compartiment voor langere houdbaarheid");
  }

  if (koelkast.waterdispenser === "Ja" && !isUitgezet("waterdispenser")) {
    points.push("Waterdispenser aan de deur");
  }

  if (koelkast.ijsmaker === "Ja" && !isUitgezet("ijsmaker")) {
    points.push("Ingebouwde ijsmaker");
  }

  if (["A", "B", "C"].includes(koelkast.energielabel)) {
    points.push(`Energiezuinig dankzij energielabel ${koelkast.energielabel}`);
  }

  if (koelkast.plaatsing !== "inbouw" && koelkast.vrijstaandType === "amerikaans") {
    points.push("Extra ruime Amerikaanse koelkast (side-by-side)");
  } else if (koelkast.plaatsing !== "inbouw") {
    points.push("Vrijstaand model, overal in huis te plaatsen");
  }

  // Generieke aanvulling: garandeert altijd 4 punten. plaatsing en merk zijn
  // gegarandeerd aanwezig; de rest is best-effort (Icecat-datagaten komen
  // voor bij koelkasten) maar dekt de meeste modellen.
  if (points.length < 4 && koelkast.geluidsniveauDb !== null && !points.some(p => p.includes("dB"))) {
    points.push(`Geluidsniveau van ${koelkast.geluidsniveauDb} dB`);
  }
  if (points.length < 4 && koelkast.energielabel && !points.some(p => p.includes("energielabel"))) {
    points.push(`Energielabel ${koelkast.energielabel}`);
  }
  if (points.length < 4 && koelkast.merk) {
    points.push(`Van het merk ${koelkast.merk}`);
  }

  return points.slice(0, 4);
}
