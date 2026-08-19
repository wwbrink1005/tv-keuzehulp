import { gezinsgrootteMinCapaciteit, STIL_DB_THRESHOLD, GESCHIKT_VOOR_GARAGE_KLASSEN } from "./data.js";
import { parsePrice } from "./utils.js";

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

export function buildResultPoints(vriezer, answers) {
  const points = [];
  const gezinsgrootte = answers?.gezinsgrootte ?? "";

  if (vriezer.plaatsing === "inbouw" && vriezer.nishoogteGroup) {
    points.push(`Past in een nis van ${vriezer.nishoogteGroup} cm hoog`);
  } else if (vriezer.plaatsing === "inbouw") {
    points.push("Inbouwmodel, past onder het keukenblad");
  }

  if (vriezer.nettoInhoudL) {
    if (gezinsgrootte === "groot" && vriezer.nettoInhoudL >= 250) {
      points.push(`Ruime ${vriezer.nettoInhoudL} liter inhoud, goed voor een groot huishouden`);
    } else if (gezinsgrootte === "gemiddeld" && vriezer.nettoInhoudL >= 150) {
      points.push(`${vriezer.nettoInhoudL} liter inhoud, goed voor een gezin van 3 tot 4 personen`);
    } else {
      points.push(`${vriezer.nettoInhoudL} liter netto inhoud`);
    }
  }

  if (vriezer.geluidsniveauDb !== null && vriezer.geluidsniveauDb <= 38) {
    points.push(`Stil in gebruik (${vriezer.geluidsniveauDb} dB)`);
  }

  if (vriezer.automatischOntdooien === "Ja") {
    points.push("Nooit meer ontdooien dankzij No Frost");
  }

  if (vriezer.klimaatklasse && GESCHIKT_VOOR_GARAGE_KLASSEN.includes(vriezer.klimaatklasse)) {
    points.push("Geschikt voor een garage of schuur");
  }

  if (["A", "B", "C"].includes(vriezer.energielabel)) {
    points.push(`Energiezuinig dankzij energielabel ${vriezer.energielabel}`);
  }

  if (vriezer.plaatsing === "vrieskist") {
    points.push("Vrieskist, veel opbergruimte voor grote of onregelmatige vormen");
  } else if (vriezer.plaatsing === "vrijstaand") {
    points.push("Vrijstaand model, overal in huis te plaatsen");
  }

  // Generieke aanvulling: garandeert altijd 4 punten. plaatsing en merk zijn
  // gegarandeerd aanwezig; de rest is best-effort (Icecat-datagaten komen
  // voor bij vriezers) maar dekt de meeste modellen.
  if (points.length < 4 && vriezer.geluidsniveauDb !== null && !points.some(p => p.includes("dB"))) {
    points.push(`Geluidsniveau van ${vriezer.geluidsniveauDb} dB`);
  }
  if (points.length < 4 && vriezer.energielabel && !points.some(p => p.includes("energielabel"))) {
    points.push(`Energielabel ${vriezer.energielabel}`);
  }
  if (points.length < 4 && vriezer.merk) {
    points.push(`Van het merk ${vriezer.merk}`);
  }

  return points.slice(0, 4);
}
