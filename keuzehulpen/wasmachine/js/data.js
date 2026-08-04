// ─── Capaciteitsgroepen (keyed by de "gezinsgrootte" antwoord-waarde) ─────────
export const capaciteitGroupToAllowedCapaciteit = {
  "klein":     [6, 7],
  "gemiddeld": [8, 9],
  "groot":     [10, 11, 12, 13, 14]
};

// ─── Static fallback price groups per capaciteitsgroep ────────────────────────
export const priceGroupsByCapaciteit = {
  "klein": [
    { label: "0-500",   min: 0,   max: 500  },
    { label: "500-800", min: 500, max: 800  },
    { label: "800+",    min: 800, max: Number.POSITIVE_INFINITY }
  ],
  "gemiddeld": [
    { label: "0-700",    min: 0,    max: 700  },
    { label: "700-1100", min: 700,  max: 1100 },
    { label: "1100+",    min: 1100, max: Number.POSITIVE_INFINITY }
  ],
  "groot": [
    { label: "0-900",    min: 0,    max: 900  },
    { label: "900-1500", min: 900,  max: 1500 },
    { label: "1500+",    min: 1500, max: Number.POSITIVE_INFINITY }
  ]
};

// ─── Wasmachine tier-definities ────────────────────────────────────────────────
// Tiers zijn gebaseerd op energiezuinigheid, centrifugesnelheid en functierijkdom
// (net als gpuTier bij desktop) — niet op prijs.
export const TIER_ORDER = ["Budget", "Mid", "Premium"];

export function getWasmachineTier(w) {
  const label = String(w.energieLabel ?? "").toUpperCase();
  const rpm = parseInt(w.centrifugeRpm, 10) || 0;
  const featureCount = ["inverter", "display", "aquastop", "uitgesteldeStart", "kinderslot"]
    .filter(key => w[key] === "Ja").length;

  const isEfficient = label === "A" || label === "B";

  if (isEfficient && (rpm >= 1400 || featureCount >= 3)) return "Premium";
  if (isEfficient || rpm >= 1200 || featureCount >= 1) return "Mid";
  return "Budget";
}

// ─── Scoringsysteem ────────────────────────────────────────────────────────────
// Elk antwoord scoort per tier. Geluid en extra wensen zijn geen scoring-as maar
// harde (gracieus degraderende) filters, zie matching.js.
export const scoringSystem = {
  gebruik: {
    gewoon: { Budget: 9, Mid: 8, Premium: 4  },
    gemak:  { Budget: 2, Mid: 6, Premium: 10 }
  }
};
