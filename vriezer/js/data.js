// ─── Nishoogte groups (inbouw) ─────────────────────────────────────────────────
// Zelfde bucket-set als koelkast — nis-hoogtes zijn gestandaardiseerde
// keukenkast-maten, niet fridge-specifiek, dus dit is een legitieme
// hergebruikte aanname. Nog te valideren tegen de echte productverdeling
// zodra de pipeline voor deze categorie heeft gedraaid.
export const nishoogteGroups = [88, 122, 140, 178, 194];

const nishoogteRanges = {
  88:  [80, 95],
  122: [115, 130],
  140: [132, 150],
  178: [165, 183],
  194: [184, 210],
};

/**
 * Classifies a built-in freezer into a niche-height bucket. Prefers
 * nis_hoogte_cm when present, falls back to hoogte_mm / 10.
 */
export function classifyNishoogte(nisHoogteCm, hoogteMm) {
  let h = parseFloat(nisHoogteCm);
  if (!Number.isFinite(h) || h <= 0) {
    const hm = parseFloat(hoogteMm);
    h = Number.isFinite(hm) && hm > 0 ? hm / 10 : NaN;
  }
  if (!Number.isFinite(h)) return null;

  for (const bucket of nishoogteGroups) {
    const [min, max] = nishoogteRanges[bucket];
    if (h >= min && h <= max) return bucket;
  }
  return null;
}

/**
 * Classifies a freestanding upright freezer (vrijstaand kastmodel) into a
 * size bucket, derived from netto inhoud (liters) — mirrors how vrijstaande
 * koelkasten zijn onderverdeeld, maar op inhoud i.p.v. breedte, omdat
 * vrieskasten qua breedte veel minder variëren dan hun inhoud.
 *
 * Grenzen herijkt tegen de live catalogus (82 producten): de oude grens van
 * 200L voor "groot" gaf een sterk scheve verdeling (14/8/60 — "groot" was
 * 73% van alle vrijstaande vriezers). 150L/280L geeft een veel gelijkmatiger
 * verdeling (15/33/33) en valt samen met een natuurlijke dichtheidssprong in
 * de data.
 */
export function classifyVrijstaandGrootte(nettoInhoudL) {
  const l = parseFloat(nettoInhoudL);
  if (!Number.isFinite(l)) return "middel";
  if (l < 150) return "klein";
  if (l < 280) return "middel";
  return "groot";
}

/**
 * Classifies a vrieskist (chest freezer) into a size bucket, derived from
 * netto inhoud (liters) — vrieskisten zijn gemiddeld groter dan vrieskasten,
 * vandaar eigen, hogere grenzen.
 *
 * Grenzen herijkt tegen de live catalogus (24 producten): er zit een
 * natuurlijke kloof tussen 142L en 196L (geen enkel product daartussen) en
 * tussen 254L en 308L — 150L/300L volgt die kloven en geeft een gebalanceerde
 * verdeling (5/10/9).
 */
export function classifyVrieskistGrootte(nettoInhoudL) {
  const l = parseFloat(nettoInhoudL);
  if (!Number.isFinite(l)) return "middel";
  if (l < 150) return "klein";
  if (l < 300) return "middel";
  return "groot";
}

/**
 * Hard-partitions een vriezer in 3 groepen: inbouw / vrijstaand kastmodel /
 * vrieskist. Okt. 2026 aangescherpt, want 7 van de 109 vriezers zaten in de
 * verkeerde groep:
 *   - Icecat "Diepvrieskist" bij een smal tafelmodel (Whirlpool W55Z1 112W,
 *     54 cm): een kist is breder dan 65 cm.
 *   - Icecat "Onderbouw" bij Beko-tafelmodellen: dat is "past onder het
 *     aanrecht", geen inbouw. Alleen inbouw als de naam het zegt.
 *   - Geen plaatsing bij Bosch GUN/Siemens GU/Miele FNUS: dan de naam.
 */
export function classifyPlaatsing(apparaatplaatsing, typeProduct, naam = "", breedteMm = null) {
  const b = parseFloat(breedteMm);
  const smal = Number.isFinite(b) && b >= 400 && b < 650;
  if (typeProduct === "Diepvrieskist" && !smal) return "vrieskist";
  if (/vrieskist|diepvrieskist/i.test(naam) && !smal) return "vrieskist";
  const inbouwNaam = /inbouw|onderbouw|integreer/i.test(naam);
  if (apparaatplaatsing === "Ingebouwd") return "inbouw";
  if (apparaatplaatsing === "Onderbouw") return inbouwNaam ? "inbouw" : "vrijstaand";
  if (!apparaatplaatsing && inbouwNaam) return "inbouw";
  return "vrijstaand";
}

/**
 * No Frost: true / false / null. Uit de data (Icecat "No Frost system", of de
 * sites van Bosch, Siemens en Liebherr); bij Miele, dat scrapers blokkeert,
 * uit de modelnaam: FN.. = No Frost, F.. zonder N niet. Een vrieskist is nooit
 * No Frost.
 */
export function nofrostVan(waarde, naam, plaatsing) {
  if (plaatsing === "vrieskist") return false;
  if (waarde === "Ja") return true;
  if (waarde === "Nee") return false;
  if (/^Miele\s+FN/i.test(naam)) return true;
  if (/^Miele\s+F\s?\d/i.test(naam)) return false;
  return null;
}

/**
 * Werkt hij in een onverwarmde garage of schuur? true / false / null.
 * Ja als hij tot 0 °C of kouder werkt (Icecat "Bedrijfstemperatuur", bv.
 * "-15 - 43 °C") of "Freezerguard" heeft (Beko). Nee als alleen een
 * klimaatklasse bekend is: SN begint bij +10 °C, N bij +16 °C.
 */
export function garageVan(bedrijfstemperatuur, klimaatklasse, naam) {
  const m = String(bedrijfstemperatuur ?? "").match(/^\s*(-?\d+(?:[.,]\d+)?)/);
  if (m) return parseFloat(m[1].replace(",", ".")) <= 0;
  if (/freezer\s?guard/i.test(naam)) return true;
  if (klimaatklasse) return false;
  return null;
}

export const vrijstaandGrootteLabels = {
  "klein":  "Klein, tafelmodel dat onder het aanrecht past",
  "middel": "Middelgroot, voor 2 tot 4 personen",
  "groot":  "Groot, voor 4 personen of meer",
};

export const vrijstaandGrootteInhoud = {
  "klein":  "tot circa 150 liter",
  "middel": "circa 150-280 liter",
  "groot":  "280 liter of meer",
};

export const vrieskistGrootteLabels = {
  "klein":  "Kleine vrieskist",
  "middel": "Middelgrote vrieskist, voor een gezin",
  "groot":  "Grote vrieskist, voor veel voorraad",
};

export const vrieskistGrootteInhoud = {
  "klein":  "tot circa 150 liter",
  "middel": "circa 150-300 liter",
  "groot":  "300 liter of meer",
};

// ─── Budgetvraag (sinds okt. 2026) ─────────────────────────────────────────
// Twee maximumbedragen per soort/formaat of nis, plus "Geen voorkeur": rond
// een derde en twee derde van de prijzen (live catalogus, 2+ winkels).
// Vrieskisten (10) en de inbouwnis van 122 cm (1) zijn te klein voor eigen
// bedragen per formaat: die krijgen de bedragen van hun soort.
export const budgetCaps = {
  "vrijstaand-klein": [300, 600], "vrijstaand-middel": [800, 1100], "vrijstaand-groot": [850, 1000], vrijstaand: [700, 950],
  vrieskist: [400, 500],
  "inbouw-88": [700, 850], "inbouw-178": [1300, 1550], inbouw: [700, 1500],
};
/** Bedragen voor de gekozen soort en formaat/nis ("" = maakt niet uit / onbekend). */
export function budgetCapsVoor(plaatsing, sub) {
  return budgetCaps[`${plaatsing}-${sub}`] ?? budgetCaps[plaatsing] ?? budgetCaps.vrijstaand;
}

// "Stil" in de filter op de resultaatpagina
export const STIL_DB_THRESHOLD = 38;
export const LABEL_VOLGORDE = ["A", "B", "C", "D", "E", "F", "G"];

// ─── Static fallback price groups (used only if dynamic computation yields
// nothing, e.g. before the catalog has loaded) ─────────────────────────────────
export const priceGroupsFallback = [
  { label: "0-300",   min: 0,   max: 300  },
  { label: "300-600", min: 300, max: 600  },
  { label: "600+",    min: 600, max: Number.POSITIVE_INFINITY }
];
