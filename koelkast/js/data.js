// ─── Nishoogte groups (inbouw) ─────────────────────────────────────────────────
// Real common niche-height values seen in the koelkasten catalog. 102 en 158
// sinds okt. 2026: 22 inbouwkoelkasten (vooral de gangbare halfhoge nis van
// 102 cm) vielen in geen enkele groep en verdwenen zodra je een nis koos.
export const nishoogteGroups = [88, 102, 122, 140, 158, 178, 194];

// Voor 102 en 158 zijn er geen eigen renders: de vragenpagina toont de
// dichtstbijzijnde kast (zie vragen.js).
export const nisRender = { 102: 122, 158: 140 };

// Tolerance ranges per bucket (cm), used for both nis_hoogte_cm and the
// hoogte_mm/10 fallback (see classifyNishoogte below).
const nishoogteRanges = {
  88:  [80, 95],
  102: [96, 112],
  122: [113, 130],
  140: [132, 150],
  158: [151, 164],
  178: [165, 183],
  194: [184, 210],
};

/**
 * Classifies a built-in ("Ingebouwd") fridge into a niche-height bucket.
 * Prefers nis_hoogte_cm when present (~58% filled). When absent, falls back
 * to hoogte_mm / 10 — built-in fridges are manufactured to closely match
 * their rated niche height, so this is a legitimate proxy, not a hack.
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
 * Classifies a freestanding (or "Aanrecht") fridge into a sub-type, derived
 * purely from breedte_mm/hoogte_mm since there's no dedicated column.
 */
export function classifyVrijstaandType(breedteMm, hoogteMm) {
  const breedte = parseFloat(breedteMm);
  const hoogte  = parseFloat(hoogteMm);

  if (Number.isFinite(hoogte) && hoogte < 1200) return "tafelmodel";
  if (Number.isFinite(breedte) && breedte >= 850) return "amerikaans";
  if (Number.isFinite(breedte) && breedte >= 700) return "extra-breed";
  return "standaard";
}

/**
 * Hard-partitions apparaatplaatsing into "inbouw" vs "vrijstaand".
 * The rare "Aanrecht" value is bucketed with vrijstaand/tafelmodel.
 */
export function classifyPlaatsing(apparaatplaatsing) {
  return apparaatplaatsing === "Ingebouwd" ? "inbouw" : "vrijstaand";
}

export const vrijstaandTypeLabels = {
  "standaard":    "Standaard koelkast",
  "extra-breed":  "Extra breed",
  "amerikaans":   "Amerikaanse koelkast (side-by-side)",
  "tafelmodel":   "Tafelmodel (compact)",
};

// Approximate widths per vrijstaand-type, shown as an on-image indicator
// (overlay badge on the visualisation) instead of in the answer label.
export const vrijstaandTypeBreedte = {
  "standaard":    "circa 55-60 cm breed",
  "extra-breed":  "circa 70-76 cm breed",
  "amerikaans":   "circa 90 cm breed",
  "tafelmodel":   "circa 55 cm breed",
};

// ─── Gezinsgrootte → minimale netto inhoud (soft preference) ──────────────────
export const gezinsgrootteMinCapaciteit = {
  klein:     0,
  gemiddeld: 250,
  groot:     350,
};

// ─── "Stil" drempel voor de geluid-filter op de resultaatpagina ────────────────
export const STIL_DB_THRESHOLD = 38;

// ─── Budgetvraag (sinds okt. 2026) ─────────────────────────────────────────
// Twee maximumbedragen per type of nis, plus "Geen voorkeur": rond een derde
// en twee derde van de prijzen in de live catalogus (2+ winkels, okt. 2026).
// De prijzen lopen per type ver uiteen (standaard rond €790, Amerikaans rond
// €1.470), dus één set bedragen zou bij de helft van de types niets zeggen.
// 140 en 158 cm hebben maar 5 en 3 koelkasten: daar zijn de bedragen grof.
export const budgetCaps = {
  standaard: [700, 950], "extra-breed": [850, 1100], amerikaans: [1150, 1700], tafelmodel: [450, 550],
  88: [700, 1000], 102: [600, 850], 122: [700, 950], 140: [1450, 1600], 158: [1100, 1800],
  178: [1000, 1650], 194: [1100, 2000], inbouw: [800, 1250],
};
/** Bedragen voor de gekozen plaatsing en type/nis ("" = nis onbekend). */
export function budgetCapsVoor(plaatsing, sub) {
  if (plaatsing === "inbouw") return budgetCaps[sub] ?? budgetCaps.inbouw;
  return budgetCaps[sub] ?? budgetCaps.standaard;
}

// ─── Vriezer (sinds okt. 2026) ─────────────────────────────────────────────
// "vriezer" = aparte vriezer (koel-vriescombinatie), "vriesvak" = klein vak
// in de koelkast, "zonder" = alleen koelen, null = onbekend. Eerst de inhoud
// van de vriezer (Icecat en de sites van Bosch, Siemens en Liebherr), dan de
// productnaam. De naam van de winkel klopt niet altijd (Liebherr IRbi 3951:
// "zonder vriesvak", maar heeft 16 liter), daarom gaat de inhoud voor.
export const VRIESVAK_MAX_L = 40;
export function vriezerSoort(vriezerL, naam, vrijstaandType, vrieslades) {
  if (Number.isFinite(vriezerL)) return vriezerL <= 0 ? "zonder" : vriezerL < VRIESVAK_MAX_L ? "vriesvak" : "vriezer";
  const t = String(naam ?? "");
  if (/zonder\s+(vriesvak|vriezer|vriesgedeelte)/i.test(t)) return "zonder";
  if (/met\s+vriesvak/i.test(t)) return "vriesvak";
  if (/koel-?\s?vries|\bcombi\b|side[\s-]?by[\s-]?side|french[\s-]?door|multi[\s-]?door|\bKFN?\s?\d/i.test(t)) return "vriezer";
  if (vrijstaandType === "amerikaans" || parseInt(vrieslades, 10) >= 2) return "vriezer";
  return null;
}

// ─── Wensen: true / false / null (onbekend) ────────────────────────────────
// Eén definitie voor de matching, de grijze opties op de vragenpagina, de
// filters en het automatisch uitzetten van opties waar een klant (B2B-embed)
// geen data voor heeft. Onbekend telt nooit als "nee".
const jaNee = v => (v === "Ja" ? true : v === "Nee" ? false : null);
export const WENS = {
  energiezuinig:  k => (LABEL_VOLGORDE.includes(k.energielabel) ? ["A", "B", "C"].includes(k.energielabel) : null),
  nofrost:        k => k.nofrost,
  verszone:       k => jaNee(k.versZone),
  waterdispenser: k => jaNee(k.waterdispenser),
  ijsmaker:       k => jaNee(k.ijsmaker),
};
export const LABEL_VOLGORDE = ["A", "B", "C", "D", "E", "F", "G"];
export const VRIEZER_WENS = {
  vriezer:  k => (k.vriezer ? k.vriezer === "vriezer" : null),
  vriesvak: k => (k.vriezer ? k.vriezer === "vriesvak" : null),
  zonder:   k => (k.vriezer ? k.vriezer === "zonder" : null),
};
// Zeker waar (voor filters en het automatisch uitzetten in de B2B-embed).
export const EXTRA_CHECKS = {
  ...Object.fromEntries(Object.entries(WENS).map(([w, f]) => [w, k => f(k) === true])),
  stil: k => Number.isFinite(k.geluidsniveauDb),
};

// ─── Static fallback price groups (used only if dynamic computation yields
// nothing, e.g. before the catalog has loaded) ─────────────────────────────────
export const priceGroupsFallback = [
  { label: "0-500",    min: 0,   max: 500  },
  { label: "500-1000", min: 500, max: 1000 },
  { label: "1000+",    min: 1000, max: Number.POSITIVE_INFINITY }
];
