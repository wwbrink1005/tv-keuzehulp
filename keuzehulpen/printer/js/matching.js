import { getPrinterTier, scoringSystem, TIER_ORDER } from "./data.js";
import { parsePrice } from "./utils.js";

// ─── Score computation ────────────────────────────────────────────────────────

export function calculateScores(answers) {
  const scores = { Budget: 0, Mid: 0, Premium: 0 };

  for (const dimensie of ["gebruik", "volume", "aio"]) {
    const weights = scoringSystem[dimensie]?.[answers[dimensie]];
    if (!weights) continue;
    for (const tier of TIER_ORDER) {
      scores[tier] += weights[tier] ?? 0;
    }
  }

  return scores;
}

// ─── Kleur filter ──────────────────────────────────────────────────────────────

export function applyKleurFilter(printers, kleurBelangrijk) {
  if (kleurBelangrijk === "ja") {
    const kleurenPrinters = printers.filter(p => p.kanKleurenPrinten === "Ja");
    if (kleurenPrinters.length > 0) return kleurenPrinters;
    return printers;
  }
  // "nee" of onbeantwoord → geen filter (zwart-wit is voor iedereen prima)
  return printers;
}

// ─── All-in-one voorkeur ────────────────────────────────────────────────────────
// "Nee" is geen uitsluiting (je hoeft geen printer-only apparaat te forceren),
// alleen "ja" scoort een zachte voorkeur voor scan/kopieer-capabele printers.

export function applyAioFilter(printers, aio) {
  if (aio === "ja") {
    const aioPrinters = printers.filter(p => p.scannen === "Ja" && p.kopieren === "Ja");
    if (aioPrinters.length > 0) return aioPrinters;
  }
  return printers;
}

// ─── Main matching function ───────────────────────────────────────────────────

export function matchPrinters(printers, gebruik, priceGroup, answers, scores) {
  if (!Array.isArray(printers) || !gebruik) {
    return { bestMatch: null, bestType: null, filteredMatchedPrinters: [] };
  }

  // 1. Filter by gebruikstype + price
  let filtered = printers.filter(p => {
    const price = parsePrice(p.prijs);
    return (
      p.gebruikType === gebruik &&
      (!priceGroup || (price >= priceGroup.min && price <= priceGroup.max))
    );
  });

  if (filtered.length === 0) {
    return { bestMatch: null, bestType: null, filteredMatchedPrinters: [] };
  }

  // 2. Pick best kwaliteits-tier by score
  const sortedTiers = Object.entries(scores)
    .sort((a, b) => Number(b[1]) - Number(a[1]));

  let matchedPrinters = [];
  let bestType = null;

  for (let i = 0; i < sortedTiers.length; i++) {
    const [, topScore] = sortedTiers[i];
    const tiersWithTopScore = sortedTiers
      .filter(([, s]) => Number(s) === Number(topScore))
      .map(([t]) => t);

    let candidates = filtered.filter(p => tiersWithTopScore.includes(getPrinterTier(p)));

    if (candidates.length === 0) continue;

    // 3. Apply kleur filter
    candidates = applyKleurFilter(candidates, answers.kleur ?? "");
    if (candidates.length === 0) continue;

    // 4. Apply all-in-one voorkeur
    candidates = applyAioFilter(candidates, answers.aio ?? "");
    if (candidates.length === 0) continue;

    matchedPrinters = [...candidates];
    bestType = tiersWithTopScore.join(" / ");
    break;
  }

  // Fallback: if tier matching yielded nothing, use all gebruikstype+price
  // filtered printers (still applying kleur/aio where possible) so a
  // non-empty price bucket never results in an empty result set.
  if (matchedPrinters.length === 0) {
    let fallback = applyKleurFilter(filtered, answers.kleur ?? "");
    fallback = applyAioFilter(fallback, answers.aio ?? "");
    if (fallback.length === 0) fallback = [...filtered];
    matchedPrinters = fallback;
    bestType = "Algemeen";
  }

  // Best match = cheapest in the matched set
  const bestMatch = matchedPrinters.reduce((cheapest, p) => {
    return parsePrice(p.prijs) < parsePrice(cheapest.prijs) ? p : cheapest;
  });

  return { bestMatch, bestType, filteredMatchedPrinters: matchedPrinters };
}

export function computeMatchForPriceGroup(printers, gebruik, priceGroup, answers, scores) {
  return matchPrinters(printers, gebruik, priceGroup, answers, scores);
}


export function buildResultPoints(printer, answers) {
  const points = [];
  const kleur = answers?.kleur ?? "";
  const aio = answers?.aio ?? "";
  const volume = answers?.volume ?? "";

  if (printer.gebruikType === "zakelijk") {
    points.push("Geschikt voor intensief zakelijk gebruik");
  } else if (printer.gebruikType === "foto") {
    points.push("Fotokwaliteit-afdrukken met extra kleuren");
  }

  if (volume === "veel" && getPrinterTier(printer) === "Premium") {
    points.push("Geschikt voor een hoog printvolume");
  }

  if (kleur === "ja" && printer.kanKleurenPrinten === "Ja") {
    points.push("Print en scant in kleur");
  }

  if (aio === "ja" && printer.scannen === "Ja" && printer.kopieren === "Ja") {
    points.push("Scannen en kopiëren mogelijk (all-in-one)");
  }

  if (printer.duplex === "Ja") {
    points.push("Automatisch dubbelzijdig printen");
  }

  if (printer.printsnelheidZwart) {
    points.push(`${printer.printsnelheidZwart} pagina's per minuut (zwart-wit)`);
  }

  return points.slice(0, 4);
}
