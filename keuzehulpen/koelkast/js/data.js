// ─── Nishoogte groups (inbouw) ─────────────────────────────────────────────────
// Real common niche-height values seen in the koelkasten catalog.
export const nishoogteGroups = [88, 122, 140, 178, 194];

// Tolerance ranges per bucket (cm), used for both nis_hoogte_cm and the
// hoogte_mm/10 fallback (see classifyNishoogte below).
const nishoogteRanges = {
  88:  [80, 95],
  122: [115, 130],
  140: [132, 150],
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

// ─── "Stil" drempel voor de geluidsniveau-extra ────────────────────────────────
export const STIL_DB_THRESHOLD = 38;

// ─── Static fallback price groups (used only if dynamic computation yields
// nothing, e.g. before the catalog has loaded) ─────────────────────────────────
export const priceGroupsFallback = [
  { label: "0-500",    min: 0,   max: 500  },
  { label: "500-1000", min: 500, max: 1000 },
  { label: "1000+",    min: 1000, max: Number.POSITIVE_INFINITY }
];
