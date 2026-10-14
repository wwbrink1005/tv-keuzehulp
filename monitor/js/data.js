// ─── Size groups (keyed by schermgrootte answer) ─────────────────────────────
// Maatgroepen. Ultrawide gaat op beeldverhouding (21:9, 32:9), niet op maat:
// eerder zaten gewone 16:9-schermen van 40 en 49 inch in "ultrawide", en vielen
// veelgebruikte maten als 24,5" en 26,5" (gaming/OLED) en 34,1"/38"/44,5"
// (ultrawide) buiten elke groep: ruim 400 monitoren verschenen nooit
// (doorlichting okt. 2026). Gebruik inMaatGroep(), niet deze lijst direct.
export const sizeGroupToAllowedSizes = {
  "compact":    [21.4, 21.5, 22, 22.5, 23, 23.6, 23.8, 24, 24.1, 24.5],
  "standaard":  [25, 26.5, 26.7, 26.9, 27, 28, 28.2],
  "groot":      [31.5, 31.6, 32, 37, 40, 42.5, 43, 46, 49, 49.5],
  "ultrawide":  [29, 34, 34.1, 34.2, 35, 37, 37.5, 38, 39, 39.7, 40, 44.5, 45, 46, 48.5, 48.8, 48.9, 49, 49.5, 57]
};

const ULTRAWIDE_VERHOUDING = new Set(["21:9", "32:9", "24:10", "12:5"]);
export const isUltrawide = m => ULTRAWIDE_VERHOUDING.has(String(m.beeldverhouding ?? "").replace(/\s/g, ""));

/** Hoort deze monitor bij de maatgroep uit de quiz? */
export function inMaatGroep(m, groep) {
  const maten = sizeGroupToAllowedSizes[groep];
  if (!maten) return false;
  const verhouding = String(m.beeldverhouding ?? "").trim();
  if (groep === "ultrawide") return isUltrawide(m) || (!verhouding && maten.includes(m.schermdiagonaal));
  return maten.includes(m.schermdiagonaal) && !isUltrawide(m);
}

// Resolutie als aantal pixels: de catalogus gebruikt zowel namen ("UWQHD")
// als pixelmaten ("5120 x 2160 Pixels"). Eerder werden die laatste bijna
// allemaal als "Budget" ingedeeld, ook 5K- en 6K-schermen.
const RES_PIXELS = {
  "hd": 1366 * 768, "full hd": 1920 * 1080, "wuxga": 1920 * 1200, "uwfhd": 2560 * 1080,
  "qhd": 2560 * 1440, "uwqhd": 3440 * 1440, "5k ultrawide": 5120 * 1440, "4k": 3840 * 2160,
};
export function resolutiePixels(m) {
  const r = String(m.resolutie ?? "").toLowerCase().trim();
  const xy = r.match(/(\d{3,5})\s*x\s*(\d{3,5})/);
  if (xy) return parseInt(xy[1], 10) * parseInt(xy[2], 10);
  return RES_PIXELS[r] ?? 0;
}
export const VIERK = 3840 * 2160;
export const is4KOfMeer = m => resolutiePixels(m) >= VIERK * 0.95;

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
  const pixels = resolutiePixels(monitor);
  const panel  = String(monitor.paneeltype ?? "").toLowerCase();

  if (panel.includes("oled") || pixels >= VIERK * 0.95) return "Premium";
  if (hz >= 144) return "Gaming";
  if (pixels >= 2560 * 1440 * 0.95) return "Mid";
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
