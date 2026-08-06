import { VEEL_VOLUME_MIN_SNELHEID } from "./data.js";
import { parsePrice } from "./utils.js";

// Geen scoring-as meer (zie data.js) — behouden als no-op zodat de
// call-sites/localStorage-vorm elders niet hoeven te wijzigen.
export function calculateScores() {
  return {};
}

// ─── Volume (printvolume) voorkeur ─────────────────────────────────────────────

export function applyVolumeFilter(printers, volume) {
  if (volume === "veel") {
    const snel = printers.filter(p => (parseInt(p.printsnelheidZwart, 10) || 0) >= VEEL_VOLUME_MIN_SNELHEID);
    if (snel.length > 0) return snel;
  }
  // "gemiddeld"/onbeantwoord → geen filter nodig: dat vraagt niet om een
  // specifieke printer, de goedkoopste uit het aanbod is prima.
  return printers;
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

export function matchPrinters(printers, gebruik, priceGroup, answers) {
  if (!Array.isArray(printers) || !gebruik) {
    return { bestMatch: null, bestType: null, filteredMatchedPrinters: [] };
  }

  // 1. Filter by gebruikstype + price
  const filtered = printers.filter(p => {
    const price = parsePrice(p.prijs);
    return (
      p.gebruikType === gebruik &&
      (!priceGroup || (price >= priceGroup.min && price <= priceGroup.max))
    );
  });

  if (filtered.length === 0) {
    return { bestMatch: null, bestType: null, filteredMatchedPrinters: [] };
  }

  // 2. Apply volume (printvolume) voorkeur
  let candidates = applyVolumeFilter(filtered, answers.volume ?? "");

  // 3. Apply kleur filter
  candidates = applyKleurFilter(candidates, answers.kleur ?? "");

  // 4. Apply all-in-one voorkeur
  candidates = applyAioFilter(candidates, answers.aio ?? "");

  const matchedPrinters = candidates.length > 0 ? candidates : filtered;

  // Best match = cheapest in the matched set
  const bestMatch = matchedPrinters.reduce((cheapest, p) => {
    return parsePrice(p.prijs) < parsePrice(cheapest.prijs) ? p : cheapest;
  });

  return { bestMatch, bestType: "Algemeen", filteredMatchedPrinters: matchedPrinters };
}

export function computeMatchForPriceGroup(printers, gebruik, priceGroup, answers) {
  return matchPrinters(printers, gebruik, priceGroup, answers);
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

  if (volume === "veel" && (parseInt(printer.printsnelheidZwart, 10) || 0) >= VEEL_VOLUME_MIN_SNELHEID) {
    points.push(`Snel printen (${printer.printsnelheidZwart} pagina's per minuut), geschikt voor een hoog volume`);
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
