import { VEEL_VOLUME_MIN_SNELHEID, isInktTankSysteem } from "./data.js";
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

// ─── Extra voorkeuren (ADF/display/bluetooth) ──────────────────────────────
// adf/display/bluetooth stonden tot nu toe alleen als infobullet op de
// resultaatpagina, zonder eigen vraag — nooit gebruikt om te filteren.
export function applyExtraFilter(printers, extraAnswers) {
  if (!Array.isArray(extraAnswers) || extraAnswers.includes("geen") || extraAnswers.length === 0) {
    return printers;
  }

  let filtered = [...printers];

  if (extraAnswers.includes("adf")) {
    const adf = filtered.filter(p => p.adf === "Ja");
    if (adf.length > 0) filtered = adf;
  }

  if (extraAnswers.includes("display")) {
    const display = filtered.filter(p => p.display === "Ja");
    if (display.length > 0) filtered = display;
  }

  if (extraAnswers.includes("bluetooth")) {
    const bt = filtered.filter(p => p.bluetooth === "Ja");
    if (bt.length > 0) filtered = bt;
  }

  return filtered;
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

  // 6. Apply extra voorkeuren (ADF/display/bluetooth)
  candidates = applyExtraFilter(candidates, answers.extraAnswers ?? []);

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

// De kaartpunten ("Waarom dit bij jou past") staan in punten.js.
function printtechniekLabel(tech) {
  const t = String(tech ?? "");
  if (/inkjet/i.test(t)) return "Inkjetprinter";
  if (/laser|led/i.test(t)) return "Laserprinter";
  return `${t}-printer`;
}
