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
export const PROCESSOR_TIERS = {
  Budget:    ["i3"],
  Mid:       ["i5", "Ryzen 5"],
  Krachtig:  ["i7", "Ryzen 7"],
  Topklasse: ["i9"]
};

export const TIER_ORDER = ["Budget", "Mid", "Krachtig", "Topklasse"];

export function getProcessorTier(processor) {
  const raw = String(processor ?? "").trim();
  for (const [tier, procs] of Object.entries(PROCESSOR_TIERS)) {
    if (procs.some(p => raw.toLowerCase().includes(p.toLowerCase()))) return tier;
  }
  return "Mid"; // default fallback
}

// ─── Scoring system ───────────────────────────────────────────────────────────
// Each answer value maps to a score per processor tier.
// gebruik is now multi-select (array); scores are summed per selected item.
export const scoringSystem = {
  gebruik: {
    dagelijks: { Budget: 9, Mid: 8, Krachtig: 5, Topklasse: 2 },
    werk:      { Budget: 6, Mid: 9, Krachtig: 8, Topklasse: 5 },
    gaming:    { Budget: 1, Mid: 5, Krachtig: 9, Topklasse: 10 },
    creatief:  { Budget: 2, Mid: 6, Krachtig: 9, Topklasse: 10 }
  },
  intensiteit: {
    licht:     { Budget: 10, Mid: 7,  Krachtig: 4, Topklasse: 2  },
    gemiddeld: { Budget: 5,  Mid: 10, Krachtig: 8, Topklasse: 4  },
    intensief: { Budget: 2,  Mid: 5,  Krachtig: 9, Topklasse: 10 }
  },
  formaat: {
    "licht-compact":  { Budget: 8, Mid: 7, Krachtig: 4, Topklasse: 2 },
    "middenweg":      { Budget: 5, Mid: 9, Krachtig: 8, Topklasse: 6 },
    "groot-krachtig": { Budget: 3, Mid: 6, Krachtig: 9, Topklasse: 9 }
  }
};
