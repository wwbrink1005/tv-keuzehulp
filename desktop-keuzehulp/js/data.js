// ─── GPU Tier definitions ──────────────────────────────────────────────────────
// Checked top-down (most specific first) to avoid substring collisions.
// e.g. "RTX 5070 Ti" must be checked before "RTX 5070".
export const TIER_ORDER = ["Budget", "Mid", "Krachtig", "Topklasse"];

export function getGpuTier(gpu, gpuApart) {
  if (!gpu || gpu === "Niet beschikbaar" || gpuApart === "Nee") return "Budget";
  const raw = String(gpu).trim();

  const topkl = ["RTX 5070 Ti", "RTX 5080", "RTX 5090", "RTX 4070 Ti", "RTX 4080", "RTX 4090", "RX 7900 XT"];
  if (topkl.some(p => raw.includes(p))) return "Topklasse";

  const krach = ["RTX 5070", "RTX 5060 Ti", "RTX 4060 Ti", "RTX 4070", "RX 7800", "RX 7700"];
  if (krach.some(p => raw.includes(p))) return "Krachtig";

  const mid = ["Arc B580", "RTX 4050", "RTX 4060", "RTX 3060", "RX 6700", "RX 6600", "GTX 1660", "GTX 1650"];
  if (mid.some(p => raw.includes(p))) return "Mid";

  // Has discrete GPU but unrecognized model → default Mid
  return "Mid";
}

// ─── Behuizing type mapping ────────────────────────────────────────────────────
// null = no filter (any type allowed)
export const behuizingTypeToAllowed = {
  "tower":          ["Tower", "Desktop"],
  "mini-pc":        ["Mini PC"],
  "maakt-niet-uit": null
};

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
    creatief:  { Budget: 2,  Mid: 6,  Krachtig: 9,  Topklasse: 10 }
  },
  intensiteit: {
    licht:     { Budget: 10, Mid: 7,  Krachtig: 3,  Topklasse: 1  },
    gemiddeld: { Budget: 5,  Mid: 10, Krachtig: 8,  Topklasse: 4  },
    intensief: { Budget: 1,  Mid: 5,  Krachtig: 9,  Topklasse: 10 }
  }
};
