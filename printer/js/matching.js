import { VEEL_VOLUME_MIN_SNELHEID, isInktTankSysteem } from "./data.js";
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

// ─── Inktsysteem voorkeur ───────────────────────────────────────────────────────
// "tank" versmalt naar tank-printers (hogere aanschafprijs, lagere kosten per
// pagina); "aanschafprijs" versmalt juist naar cartridge-printers (lagere
// aanschafprijs) — dit is de vraag die daadwerkelijk de prijsspreiding binnen
// "thuis" narrowt, in plaats van dat alle "€"-antwoorden nog steeds de volle
// €49-959-range opleveren. Beide kanten degraderen gracieus naar het
// ongefilterde aanbod als de voorkeur toevallig 0 treffers oplevert.
export function applyInktFilter(printers, inktVoorkeur) {
  if (inktVoorkeur === "tank") {
    const tank = printers.filter(p => isInktTankSysteem(p.naam));
    if (tank.length > 0) return tank;
  }
  if (inktVoorkeur === "aanschafprijs") {
    const cartridge = printers.filter(p => !isInktTankSysteem(p.naam));
    if (cartridge.length > 0) return cartridge;
  }
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

  // 5. Apply inktsysteem voorkeur
  candidates = applyInktFilter(candidates, answers.inkt ?? "");

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
  const inkt = answers?.inkt ?? "";

  if (inkt === "tank" && isInktTankSysteem(printer.naam)) {
    points.push("Navulbaar inktsysteem: lage kosten per pagina op de lange termijn");
  } else if (inkt === "aanschafprijs" && !isInktTankSysteem(printer.naam)) {
    points.push("Lage aanschafprijs, standaard cartridges");
  }

  if (printer.gebruikType === "zakelijk") {
    points.push("Geschikt voor intensief zakelijk gebruik");
  } else if (printer.gebruikType === "foto") {
    points.push("Fotokwaliteit-afdrukken met extra kleuren");
  } else if (printer.gebruikType === "thuis") {
    points.push("Compacte printer voor thuisgebruik");
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

  // Generieke aanvulling: garandeert altijd 4 punten. printtechnologie is
  // bij elke printer gegarandeerd aanwezig (harde eis in normalizeProducts());
  // de rest is best-effort maar dekt de meeste modellen.
  if (points.length < 4 && printer.printtechnologie) {
    points.push(printtechniekLabel(printer.printtechnologie));
  }
  if (points.length < 4 && printer.kanKleurenPrinten === "Ja" && !points.some(p => p.toLowerCase().includes("kleur"))) {
    points.push("Kleurenprinter");
  }
  if (points.length < 4 && printer.wifi === "Ja") {
    points.push("Verbindt draadloos via wifi");
  }
  if (points.length < 4 && printer.printkleuren) {
    const aantalKleuren = String(printer.printkleuren).split(",").map(s => s.trim()).filter(Boolean).length;
    if (aantalKleuren === 1) points.push("Zwart-wit printer");
    else if (aantalKleuren > 1) points.push(`${aantalKleuren} kleuren inkt`);
  }
  if (points.length < 4 && printer.merk) {
    points.push(`Van het merk ${printer.merk}`);
  }
  if (points.length < 4) {
    points.push("Betrouwbare printer voor dagelijks gebruik");
  }

  return points.slice(0, 4);
}

function printtechniekLabel(tech) {
  const t = String(tech ?? "");
  if (/inkjet/i.test(t)) return "Inkjetprinter";
  if (/laser|led/i.test(t)) return "Laserprinter";
  return `${t}-printer`;
}
