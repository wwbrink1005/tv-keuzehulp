// ─── Size groups (keyed by formaat answer) ──────────────────────────────────
export const sizeGroupToAllowedSizes = {
  "licht-compact":  [13, 13.3, 14],
  "middenweg":      [15, 15.6, 16],
  "groot-krachtig": [17, 17.3]
};

// ─── Static fallback price groups per formaat ────────────────────────────────
export const priceGroupsBySize = {
  "licht-compact": [
    { label: "350-800",  min: 0,    max: 800  },
    { label: "800-1300", min: 800,  max: 1300 },
    { label: "1300+",    min: 1300, max: Number.POSITIVE_INFINITY }
  ],
  "middenweg": [
    { label: "350-900",  min: 0,    max: 900  },
    { label: "900-1500", min: 900,  max: 1500 },
    { label: "1500+",    min: 1500, max: Number.POSITIVE_INFINITY }
  ],
  "groot-krachtig": [
    { label: "500-1000",  min: 0,    max: 1000 },
    { label: "1000-1800", min: 1000, max: 1800 },
    { label: "1800+",     min: 1800, max: Number.POSITIVE_INFINITY }
  ]
};

// ─── Processor tier definitions ───────────────────────────────────────────────
// Legacy patroon (bv. "Intel Core i7-13620H", "AMD Ryzen 7 5825U") — dekt
// alleen de oude naamgeving, waar merk+lijnnummer al in het processor-veld
// zelf staan.
export const PROCESSOR_TIERS = {
  Budget:    ["i3"],
  Mid:       ["i5", "Ryzen 5"],
  Krachtig:  ["i7", "Ryzen 7"],
  Topklasse: ["i9"]
};

export const TIER_ORDER = ["Budget", "Mid", "Krachtig", "Topklasse"];

// Moderne processormodellen ("356H", "275HX", "N100") bevatten zelf geen
// merk/lijn meer — die info staat apart in Icecat's "Processorfamilie"
// (bv. "Intel Core Ultra 7", "AMD Ryzen AI 9 HX", "Intel® N", "MediaTek").
// Zonder dit veld vielen 511 van de 573 laptops (89%) stil terug op de
// "Mid"-default, waardoor bv. €7.700 workstation-laptops (Ultra 9 HX) als
// "Mid" werden aangeboden aan iemand die gemiddeld gebruik zocht.
function tierFromFamilieNummer(familie) {
  const f = String(familie ?? "");
  if (!f) return null;

  if (/mediatek/i.test(f)) return "Budget";
  // "AMD Ryzen AI Max(+) PRO" heeft geen cijfer-lijn in de familienaam zelf
  // (die zit in het modelnummer, bv. "390"/"PRO 395") — dit is AMD's
  // topklasse mobiele workstationchip, vergelijkbaar met Ryzen 9.
  if (/ryzen ai max/i.test(f)) return "Topklasse";
  // "Intel® N" (Celeron/Pentium N-serie, bv. N100/N355) heeft geen cijfer-lijn.
  if (/intel.{0,3}\bn\b/i.test(f)) return "Budget";
  // Snapdragon X Elite/Plus zijn krachtige Copilot+-chips; overige Snapdragons
  // (zonder cijfer-lijn) behandelen we als middenklasse-efficiëntiechip.
  if (/snapdragon.*(x elite|x plus)/i.test(f)) return "Krachtig";
  if (/snapdragon/i.test(f)) return "Mid";

  // Laatste losse cijfer in de familienaam is de lijn/tier (Intel Core(?:
  // Ultra)? 3/5/7/9, AMD Ryzen(?: AI)? 3/5/7/9).
  const match = f.match(/(\d+)(?!.*\d)/);
  if (!match) return null;

  const nummer = parseInt(match[1], 10);
  if (nummer <= 3) return "Budget";
  if (nummer === 5) return "Mid";
  if (nummer === 7) return "Krachtig";
  if (nummer >= 9) return "Topklasse";
  return null;
}

export function getProcessorTier(processor, processorFamilie) {
  const uitFamilie = tierFromFamilieNummer(processorFamilie);
  if (uitFamilie) return uitFamilie;

  const raw = String(processor ?? "").trim();
  for (const [tier, procs] of Object.entries(PROCESSOR_TIERS)) {
    if (procs.some(p => raw.toLowerCase().includes(p.toLowerCase()))) return tier;
  }
  return "Mid"; // default fallback voor de resterende, écht onherkende gevallen
}

// ─── Scoring system ───────────────────────────────────────────────────────────
// Each answer value maps to a score per processor tier.
// gebruik is now multi-select (array); scores are summed per selected item.
export const scoringSystem = {
  gebruik: {
    dagelijks: { Budget: 9, Mid: 8, Krachtig: 5, Topklasse: 2 },
    werk:      { Budget: 6, Mid: 9, Krachtig: 8, Topklasse: 5 },
    gaming:    { Budget: 1, Mid: 5, Krachtig: 9, Topklasse: 10 },
    creatief:  { Budget: 2, Mid: 6, Krachtig: 9, Topklasse: 10 },
    // Voor wie te veel doelen heeft om er 2 te kiezen: 1 gebalanceerde score
    // die middenin leunt, i.p.v. dat de gebruiker gedwongen wordt een
    // onvolledige selectie te maken.
    allround:  { Budget: 5, Mid: 8, Krachtig: 7, Topklasse: 4 }
  },
  intensiteit: {
    licht:   { Budget: 10, Mid: 7,  Krachtig: 3,  Topklasse: 1  },
    normaal: { Budget: 6,  Mid: 10, Krachtig: 6,  Topklasse: 3  },
    zwaar:   { Budget: 2,  Mid: 6,  Krachtig: 10, Topklasse: 6  },
    extreem: { Budget: 1,  Mid: 3,  Krachtig: 7,  Topklasse: 10 }
  },
  formaat: {
    "licht-compact":  { Budget: 8, Mid: 7, Krachtig: 4, Topklasse: 2 },
    "middenweg":      { Budget: 5, Mid: 9, Krachtig: 8, Topklasse: 6 },
    "groot-krachtig": { Budget: 3, Mid: 6, Krachtig: 9, Topklasse: 9 }
  }
};
