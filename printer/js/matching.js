import { VEEL_VOLUME_MIN_SNELHEID, isInktTankSysteem, isLaser, pastBijGebruik } from "./data.js";
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

const vergelijkbaar = lijst => lijst.filter(p => (p.aanbieders ?? []).length >= 2).length;
const MIN_KEUZE = 3;

// Een expliciete wens versmalt zodra er minstens 1 vergelijkbare printer
// (2+ winkels) overblijft; anders zou de min-aanbieders-stap terugvallen tot
// printers die maar bij 1 winkel te koop zijn.
function wens(lijst, sub) {
  if (vergelijkbaar(sub) > 0) return sub;
  if (sub.length > 0 && vergelijkbaar(lijst) === 0) return sub;
  return lijst;
}

// Een voorkeur (geen harde wens) alleen toepassen als er genoeg keus blijft.
function zacht(lijst, sub) {
  const n = vergelijkbaar(sub);
  return n >= MIN_KEUZE || (n > 0 && n >= vergelijkbaar(lijst)) ? sub : lijst;
}

// ─── Volume (printvolume) voorkeur ─────────────────────────────────────────────

export function applyVolumeFilter(printers, volume) {
  if (volume === "veel") {
    return wens(printers, printers.filter(p => (parseInt(p.printsnelheidZwart, 10) || 0) >= VEEL_VOLUME_MIN_SNELHEID));
  }
  // "gemiddeld"/onbeantwoord → geen filter nodig: dat vraagt niet om een
  // specifieke printer, de goedkoopste uit het aanbod is prima.
  return printers;
}

// ─── Kleur filter ──────────────────────────────────────────────────────────────

export function applyKleurFilter(printers, kleurBelangrijk) {
  if (kleurBelangrijk === "ja") {
    return wens(printers, printers.filter(p => p.kanKleurenPrinten === "Ja"));
  }
  // "Alleen zwart-wit": een zwart-witprinter is goedkoper in gebruik, maar een
  // kleurenprinter kan het ook. Daarom een voorkeur, geen eis.
  if (kleurBelangrijk === "nee") {
    return zacht(printers, printers.filter(p => p.kanKleurenPrinten !== "Ja"));
  }
  return printers;
}

// ─── Inktsysteem voorkeur ───────────────────────────────────────────────────────
// "tank" versmalt naar tank-printers (hogere aanschafprijs, lagere kosten per
// pagina); "aanschafprijs" versmalt juist naar cartridge-printers (lagere
// aanschafprijs) — dit is de vraag die daadwerkelijk de prijsspreiding binnen
// "thuis" narrowt, in plaats van dat alle "€"-antwoorden nog steeds de volle
// €49-959-range opleveren. Beide kanten degraderen gracieus naar het
// ongefilterde aanbod als de voorkeur toevallig 0 treffers oplevert.
// Lage kosten per pagina hebben zowel inkttankprinters als laserprinters
// (toner); eerder telde alleen een inkttank, waardoor een laser nooit paste.
export function lageKostenPerPagina(printer) {
  return isInktTankSysteem(printer.naam) || isLaser(printer);
}

export function applyInktFilter(printers, inktVoorkeur) {
  if (inktVoorkeur === "tank") {
    return wens(printers, printers.filter(lageKostenPerPagina));
  }
  if (inktVoorkeur === "aanschafprijs") {
    return zacht(printers, printers.filter(p => !isInktTankSysteem(p.naam)));
  }
  return printers;
}

// ─── All-in-one voorkeur ────────────────────────────────────────────────────────
// "Nee" is geen uitsluiting (je hoeft geen printer-only apparaat te forceren),
// alleen "ja" scoort een zachte voorkeur voor scan/kopieer-capabele printers.

export function applyAioFilter(printers, aio) {
  if (aio === "ja") {
    return wens(printers, printers.filter(p => p.scannen === "Ja" && p.kopieren === "Ja"));
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

  if (extraAnswers.includes("adf")) filtered = wens(filtered, filtered.filter(p => p.adf === "Ja"));
  if (extraAnswers.includes("display")) filtered = wens(filtered, filtered.filter(p => p.display === "Ja"));
  if (extraAnswers.includes("bluetooth")) filtered = wens(filtered, filtered.filter(p => p.bluetooth === "Ja"));

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
      pastBijGebruik(p, gebruik) &&
      (!priceGroup || (price >= priceGroup.min && (price < priceGroup.max || priceGroup.max === Infinity)))
    );
  });

  if (filtered.length === 0) {
    return { bestMatch: null, bestType: null, filteredMatchedPrinters: [] };
  }

  // 2. Eerst de wensen: snel printen, kleur, all-in-one, lage kosten per
  // pagina en de extra's.
  let candidates = applyVolumeFilter(filtered, answers.volume ?? "");
  if (answers.kleur === "ja") candidates = applyKleurFilter(candidates, "ja");
  candidates = applyAioFilter(candidates, answers.aio ?? "");
  if (answers.inkt === "tank") candidates = applyInktFilter(candidates, "tank");
  candidates = applyExtraFilter(candidates, answers.extraAnswers ?? []);

  // 3. Dan de voorkeuren, die een wens nooit mogen verdringen: alleen
  // zwart-wit, en een lage aanschafprijs (geen duurdere inkttankprinter).
  if (answers.kleur === "nee") candidates = applyKleurFilter(candidates, "nee");
  if (answers.inkt === "aanschafprijs") candidates = applyInktFilter(candidates, "aanschafprijs");

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
