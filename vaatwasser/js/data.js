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

// Okt. 2026: zonder plaatsing de naam proberen. Vier Miele-modellen (G .. SCi,
// G .. SCU) misten de plaatsing en vielen zo stil weg uit de keuzehulp.
export function classifyPlaatsing(apparaatplaatsing, naam = "") {
  if (INBOUW_WAARDEN.includes(apparaatplaatsing)) return "inbouw";
  if (VRIJSTAAND_WAARDEN.includes(apparaatplaatsing)) return "vrijstaand";
  if (/ge[iï]ntegreer|inbouw|onderbouw|\bSC[iU]\b|\bVi\b/i.test(naam)) return "inbouw";
  if (/vrijstaand/i.test(naam)) return "vrijstaand";
  return null;
}

// ─── Maat (sinds okt. 2026) ────────────────────────────────────────────────
// "smal" = 45 cm breed. Bij inbouw 60 cm ook de hoogte: "xxl" (86-87 cm)
// past niet in een standaardnis van 82 cm; een standaardmodel past wel in
// een hoge nis (met een hogere plint).
export function maatVan(plaatsing, breedteMm, hoogteMm) {
  if (Number.isFinite(breedteMm) && breedteMm < 500) return "smal";
  if (plaatsing === "inbouw" && Number.isFinite(hoogteMm) && hoogteMm >= 845) return "xxl";
  return "breed";
}
/** Past deze maat bij het antwoord? */
export function pastMaat(v, antwoord) {
  switch (antwoord) {
    case "standaard": return v.maat === "breed";
    case "hoog": return v.maat === "breed" || v.maat === "xxl";
    case "breed": return v.maat === "breed" || v.maat === "xxl";
    case "smal": return v.maat === "smal";
    default: return true;
  }
}

// Droogt beter: de deur gaat aan het eind vanzelf open (Bosch EfficientDry,
// Siemens autoOpen/Zeolith, AEG AirDry, Miele AutoOpen) of er zit een
// zeoliet- of PerfectDry-systeem in. true / false / null (onbekend).
export function droogtBeter(droogsysteem, automatischeDeuropening) {
  if (automatischeDeuropening === "Ja") return true;
  const d = String(droogsysteem ?? "");
  if (/efficientdry|perfectdry|zeolit|airdry|auto ?open/i.test(d)) return true;
  if (d) return false;
  return null;
}

// ─── Budgetvraag (sinds okt. 2026) ─────────────────────────────────────────
// Twee maximumbedragen per soort, plus "Geen voorkeur": rond een derde en
// twee derde van de prijzen (live catalogus, 2+ winkels, okt. 2026).
// Smal (45 cm) heeft maar 6 modellen per soort: dezelfde bedragen.
export const budgetCaps = { inbouw: [750, 950], vrijstaand: [600, 750] };

export const RUIM_COUVERTS = 15;
export const LABEL_VOLGORDE = ["A", "B", "C", "D", "E", "F", "G"];

// ─── Static fallback price groups (alleen als de dynamische berekening niets
// oplevert, bv. vóór de catalogus geladen is) ───────────────────────────────
export const priceGroupsFallback = [
  { label: "0-500",   min: 0,   max: 500  },
  { label: "500-800", min: 500, max: 800  },
  { label: "800+",    min: 800, max: Number.POSITIVE_INFINITY }
];
