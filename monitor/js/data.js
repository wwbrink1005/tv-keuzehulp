// ─── Size groups (keyed by schermgrootte answer) ─────────────────────────────
export const sizeGroupToAllowedSizes = {
  "compact":    [21.5, 22, 23.8, 24],
  "standaard":  [27, 28],
  "groot":      [31.5, 32],
  "ultrawide":  [29, 34, 40, 49]
};

// ─── Static fallback price groups per formaat ─────────────────────────────────
export const priceGroupsBySize = {
  "compact": [
    { label: "0-200",   min: 0,   max: 200  },
    { label: "200-400", min: 200, max: 400  },
    { label: "400+",    min: 400, max: Number.POSITIVE_INFINITY }
  ],
  "standaard": [
    { label: "0-250",   min: 0,   max: 250  },
    { label: "250-500", min: 250, max: 500  },
    { label: "500+",    min: 500, max: Number.POSITIVE_INFINITY }
  ],
  "groot": [
    { label: "0-300",   min: 0,   max: 300  },
    { label: "300-600", min: 300, max: 600  },
    { label: "600+",    min: 600, max: Number.POSITIVE_INFINITY }
  ],
  "ultrawide": [
    { label: "0-400",   min: 0,   max: 400  },
    { label: "400-800", min: 400, max: 800  },
    { label: "800+",    min: 800, max: Number.POSITIVE_INFINITY }
  ]
};

// ─── Monitor tier definitions ─────────────────────────────────────────────────
// Tiers are based on typical use-case profile rather than a CPU tier.
export const TIER_ORDER = ["Budget", "Mid", "Gaming", "Premium"];

/**
 * Determine the "tier" of a monitor based on its specs.
 */
export function getMonitorTier(monitor) {
  const hz     = parseInt(String(monitor.hz ?? "60").replace(/[^0-9]/g, ""), 10) || 60;
  const res    = String(monitor.resolutie ?? "").toLowerCase();
  const panel  = String(monitor.paneeltype ?? "").toLowerCase();

  if (panel === "oled" || res === "4k" || res.includes("3840")) return "Premium";
  if (hz >= 144) return "Gaming";
  if (res === "qhd" || res.includes("2560") || res.includes("1440")) return "Mid";
  return "Budget";
}

// ─── Scoring system ───────────────────────────────────────────────────────────
// Each answer maps to a score per monitor tier.
export const scoringSystem = {
  gebruik: {
    thuiswerk: { Budget: 8, Mid: 9, Gaming: 4, Premium: 7 },
    gaming:    { Budget: 2, Mid: 5, Gaming: 10, Premium: 7 },
    creatief:  { Budget: 2, Mid: 6, Gaming: 3,  Premium: 10 },
    algemeen:  { Budget: 7, Mid: 9, Gaming: 6,  Premium: 7  }
  },
  hz: {
    rustig:   { Budget: 9, Mid: 7, Gaming: 1,  Premium: 5 },
    soepel:   { Budget: 5, Mid: 8, Gaming: 4,  Premium: 6 },
    vloeiend: { Budget: 2, Mid: 6, Gaming: 10, Premium: 7 },
    extreem:  { Budget: 1, Mid: 3, Gaming: 10, Premium: 8 }
  }
};
