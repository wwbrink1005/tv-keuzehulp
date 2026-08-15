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
 */
export function classifyVrijstaandGrootte(nettoInhoudL) {
  const l = parseFloat(nettoInhoudL);
  if (!Number.isFinite(l)) return "middel";
  if (l < 100) return "mini";
  if (l < 200) return "middel";
  return "groot";
}

/**
 * Classifies a vrieskist (chest freezer) into a size bucket, derived from
 * netto inhoud (liters) — vrieskisten zijn gemiddeld veel groter dan
 * vrieskasten, vandaar eigen, hogere grenzen.
 */
export function classifyVrieskistGrootte(nettoInhoudL) {
  const l = parseFloat(nettoInhoudL);
  if (!Number.isFinite(l)) return "groot";
  if (l < 250) return "middel";
  if (l < 400) return "groot";
  return "extra-groot";
}

/**
 * Hard-partitions een vriezer in 3 groepen: inbouw / vrijstaand kastmodel /
 * vrieskist. Icecat's "Type product" (Vrieskast vs Diepvrieskist) bepaalt
 * eerst of het een kist is; anders bepaalt "Apparaatplaatsing" inbouw vs
 * vrijstaand. "Onderbouw" (semi-inbouw) wordt bij "inbouw" ondergebracht —
 * beide hebben een nis-maat nodig, en het verschil is voor de gebruiker niet
 * relevant genoeg voor een aparte vraag-tak.
 */
export function classifyPlaatsing(apparaatplaatsing, typeProduct) {
  if (typeProduct === "Diepvrieskist") return "vrieskist";
  if (apparaatplaatsing === "Ingebouwd" || apparaatplaatsing === "Onderbouw") return "inbouw";
  return "vrijstaand";
}

export const vrijstaandGrootteLabels = {
  "mini":   "Mini/compact vrieskast",
  "middel": "Middelgrote vrieskast",
  "groot":  "Grote vrieskast",
};

export const vrijstaandGrootteInhoud = {
  "mini":   "tot circa 100 liter",
  "middel": "circa 100-200 liter",
  "groot":  "200 liter of meer",
};

export const vrieskistGrootteLabels = {
  "middel":       "Middelgrote vrieskist",
  "groot":        "Grote vrieskist",
  "extra-groot":  "Extra grote vrieskist",
};

export const vrieskistGrootteInhoud = {
  "middel":      "tot circa 250 liter",
  "groot":       "circa 250-400 liter",
  "extra-groot": "400 liter of meer",
};

// ─── Gezinsgrootte → minimale netto inhoud (soft preference) ──────────────────
export const gezinsgrootteMinCapaciteit = {
  klein:     0,
  gemiddeld: 150,
  groot:     250,
};

// ─── "Stil" drempel voor de geluidsniveau-extra ────────────────────────────────
export const STIL_DB_THRESHOLD = 38;

// ─── Klimaatklasses die geschikt zijn voor een onverwarmde ruimte (garage/schuur) ──
// SN/N gaan tot een lage ondergrens (10°C), maar voor een garage/schuur is
// vooral de bovengrens (T = tot 43°C) relevant — ST/T-klasse aanbevolen.
export const GESCHIKT_VOOR_GARAGE_KLASSEN = ["ST", "T", "SN-ST", "SN-T", "N-ST", "N-T"];

// ─── Static fallback price groups (used only if dynamic computation yields
// nothing, e.g. before the catalog has loaded) ─────────────────────────────────
export const priceGroupsFallback = [
  { label: "0-300",   min: 0,   max: 300  },
  { label: "300-600", min: 300, max: 600  },
  { label: "600+",    min: 600, max: Number.POSITIVE_INFINITY }
];
