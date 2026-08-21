// ─── Plaatsing: hard partitie inbouw vs vrijstaand ─────────────────────────
// Geverifieerd tegen de live catalogus (278 producten): "Volledig ingebouwd"
// (174) / "Semi-ingebouwd" (21) / "Onderbouw" (2) horen praktisch bij dezelfde
// koopbeslissing (past in een keukenkast-nis) — samengevoegd tot "inbouw".
// "Vrijstaand" (75) / "Aanrecht" (5, compact tafelmodel) samengevoegd tot
// "vrijstaand". Onbekende/lege waarden (bv. een verkeerd geclassificeerd
// product dat via bol's categoryId meekwam) leveren bewust `null` op, zodat
// normalizeProducts() ze uitsluit i.p.v. ze een kant op te gokken.
const INBOUW_WAARDEN = ["Volledig ingebouwd", "Semi-ingebouwd", "Onderbouw"];
const VRIJSTAAND_WAARDEN = ["Vrijstaand", "Aanrecht"];

export function classifyPlaatsing(apparaatplaatsing) {
  if (INBOUW_WAARDEN.includes(apparaatplaatsing)) return "inbouw";
  if (VRIJSTAAND_WAARDEN.includes(apparaatplaatsing)) return "vrijstaand";
  return null;
}

// ─── Gezinsgrootte → minimaal aantal couverts (zachte voorkeur) ────────────
// Net als koelkast's netto-inhoud-drempel: geen harde partitie, want 90% van
// de catalogus zit sowieso tussen 13-16 couverts (geverifieerd tegen live
// data) — een harde ondergrens zou "klein huishouden" bijna niets laten zien.
export const gezinsgrootteMinCouverts = {
  klein:     0,
  gemiddeld: 13,
  groot:     15,
};

// ─── "Stil" drempels voor de geluid-vraag ──────────────────────────────────
// Live dB-range 37-58, mediaan 44 (geverifieerd tegen live data).
export const GELUID_BELANGRIJK_DB = 40;
export const GELUID_BELANGRIJK_FALLBACK_DB = 42;
export const GELUID_GEMIDDELD_DB = 46;

// ─── Static fallback price groups (alleen als de dynamische berekening niets
// oplevert, bv. vóór de catalogus geladen is) ───────────────────────────────
export const priceGroupsFallback = [
  { label: "0-500",   min: 0,   max: 500  },
  { label: "500-800", min: 500, max: 800  },
  { label: "800+",    min: 800, max: Number.POSITIVE_INFINITY }
];
