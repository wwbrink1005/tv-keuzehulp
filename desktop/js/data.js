// ─── GPU Tier definitions ──────────────────────────────────────────────────────
// Checked top-down (most specific first) to avoid substring collisions.
// e.g. "RTX 5070 Ti" must be checked before "RTX 5070".
export const TIER_ORDER = ["Budget", "Mid", "Krachtig", "Topklasse"];

// Herkent geïntegreerde (CPU-)graphics aan hun modelnaam — deze hebben geen
// eigen videogeheugen en horen dus altijd in "Budget", ongeacht wat er verder
// in de naam staat. Voorheen leunde dit op een aparte "gpuApart"-vlag, maar
// die kolom bleek nergens door de pipeline geschreven te worden (altijd
// "Nee"/leeg) — waardoor 97,5% van alle desktops als "Budget" werd
// geclassificeerd, zelfs modellen met een RTX 5080 erin. Nu wordt dedicated-
// vs-geïntegreerd puur uit de modelnaam zelf afgeleid.
const GEINTEGREERDE_GPU_PATRONEN = [
  /\bhd graphics\b/i,
  /\buhd graphics\b/i,
  /\biris\s*(xe)?\s*graphics\b/i,
  /\bradeon(\(tm\))?\s+graphics\b/i,
  /\bvega\s*\d*\s*graphics\b/i,
];

function isGeintegreerdeGpu(raw) {
  return GEINTEGREERDE_GPU_PATRONEN.some(p => p.test(raw));
}

export function getGpuTier(gpu) {
  const raw = String(gpu ?? "").trim();
  if (!raw || raw === "Niet beschikbaar" || isGeintegreerdeGpu(raw)) return "Budget";

  const topkl = ["RTX 5070 Ti", "RTX 5080", "RTX 5090", "RTX 4070 Ti", "RTX 4080", "RTX 4090", "RX 7900 XT"];
  if (topkl.some(p => raw.includes(p))) return "Topklasse";

  const krach = ["RTX 5070", "RTX 5060 Ti", "RTX 4060 Ti", "RTX 4070", "RX 7800", "RX 7700"];
  if (krach.some(p => raw.includes(p))) return "Krachtig";

  const mid = ["Arc B580", "RTX 4050", "RTX 4060", "RTX 3060", "RX 6700", "RX 6600", "GTX 1660", "GTX 1650"];
  if (mid.some(p => raw.includes(p))) return "Mid";

  // Heeft een dedicated GPU maar onherkend model → default Mid
  return "Mid";
}

// ─── Behuizing classification ──────────────────────────────────────────────────
// The Supabase "desktops" table has two relevant columns:
//   - type_product:   e.g. "PC", "Alles-in-één-pc", "Mini PC", "Workstation"
//   - type_behuizing: e.g. "Tower", "SFF", "Mini PC", "Clamshell" (often empty)
// Neither column alone is reliable (type_behuizing is null for ~85% of rows),
// so we classify using both, with type_product taking priority since it has
// far better coverage and includes the all-in-one category that
// type_behuizing doesn't have at all.
export function classifyBehuizing(typeProduct, typeBehuizing) {
  const tp = String(typeProduct ?? "").toLowerCase();
  const tb = String(typeBehuizing ?? "").toLowerCase();

  if (tp.includes("alles-in-één") || tp.includes("alles-in-een") ||
      tp.includes("all-in-one") || tp.includes("all in one")) {
    return "all-in-one";
  }

  if (tp.includes("mini pc") || tp.includes("mini-pc") ||
      tb.includes("mini pc") || tb.includes("mini-pc") || tb.includes("clamshell")) {
    return "mini-pc";
  }

  if (tp === "pc" || tp.includes("workstation") ||
      tb.includes("tower") || tb.includes("sff")) {
    return "tower";
  }

  return null;
}

// ─── Static fallback price groups per behuizing type ──────────────────────────
export const priceGroupsByType = {
  "tower": [
    { label: "500-1200",  min: 0,    max: 1200 },
    { label: "1200-2200", min: 1200, max: 2200 },
    { label: "2200+",     min: 2200, max: Number.POSITIVE_INFINITY }
  ],
  "mini-pc": [
    { label: "400-700",  min: 0,   max: 700  },
    { label: "700-1200", min: 700, max: 1200 },
    { label: "1200+",    min: 1200, max: Number.POSITIVE_INFINITY }
  ],
  "all-in-one": [
    { label: "600-1000",  min: 0,    max: 1000 },
    { label: "1000-1500", min: 1000, max: 1500 },
    { label: "1500+",     min: 1500, max: Number.POSITIVE_INFINITY }
  ],
  "maakt-niet-uit": [
    { label: "400-1200",  min: 0,    max: 1200 },
    { label: "1200-2200", min: 1200, max: 2200 },
    { label: "2200+",     min: 2200, max: Number.POSITIVE_INFINITY }
  ]
};

// ─── Scoring system ───────────────────────────────────────────────────────────
// Scores per GPU tier per answer value. Higher = better match.
export const scoringSystem = {
  gebruik: {
    dagelijks: { Budget: 10, Mid: 8,  Krachtig: 4,  Topklasse: 1  },
    werk:      { Budget: 7,  Mid: 9,  Krachtig: 7,  Topklasse: 4  },
    gaming:    { Budget: 1,  Mid: 5,  Krachtig: 9,  Topklasse: 10 },
    creatief:  { Budget: 2,  Mid: 6,  Krachtig: 9,  Topklasse: 10 },
    // Voor wie te veel doelen heeft om er 2 te kiezen: 1 gebalanceerde score
    // die middenin leunt, i.p.v. dat de gebruiker gedwongen wordt een
    // onvolledige selectie te maken.
    allround:  { Budget: 5,  Mid: 8,  Krachtig: 7,  Topklasse: 4  }
  },
  intensiteit: {
    licht:     { Budget: 10, Mid: 7,  Krachtig: 3,  Topklasse: 1  },
    gemiddeld: { Budget: 5,  Mid: 10, Krachtig: 8,  Topklasse: 4  },
    intensief: { Budget: 1,  Mid: 5,  Krachtig: 9,  Topklasse: 10 }
  }
};
