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
export function classifyBehuizing(typeProduct, typeBehuizing, naam = "") {
  const tp = String(typeProduct ?? "").toLowerCase();
  const tb = String(typeBehuizing ?? "").toLowerCase();
  const n = String(naam ?? "").toLowerCase();

  // Een paar winkels leveren alleen "Desktops" als type (HP OmniStudio is een
  // all-in-one, OmniDesk een tower). Dan zegt de naam het.
  if (!tb && (tp === "desktops" || !tp)) {
    if (/all-in-one|alles-in-|omnistudio|\baio\b|imac/.test(n)) return "all-in-one";
    if (/mini ?pc|mac mini|\bmini\b/.test(n)) return "mini-pc";
    if (/desktop|tower|omnidesk/.test(n)) return "tower";
  }

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

// ─── Budgetvraag ("Wat wil je maximaal uitgeven?") ─────────────────────────
// Twee maximumbedragen plus "Geen voorkeur", per soort. Uit de live catalogus
// (okt. 2026, 2+ winkels): goedkoopste desktops rond €725, tower €800-3.200,
// all-in-one €725-1.800, mini-pc €1.000-1.950 (vooral Mac mini).
export const budgetCapsByType = {
  "tower":          [1000, 1500],
  "all-in-one":     [900, 1300],
  "mini-pc":        [1200, 1500],
  "maakt-niet-uit": [1000, 1500],
};

// ─── Processorklasse ────────────────────────────────────────────────────────
// Sinds okt. 2026 de basis van de matching (vroeger de videokaart, omdat de
// processor nooit uit Icecat kwam). Zelfde indeling als de laptop:
// Core/Ryzen 3 = Budget, 5 = Mid, 7 = Krachtig, 9 = Topklasse; Apple M = Mid,
// M Pro = Krachtig, M Max/Ultra = Topklasse.
export { getProcessorTier } from "../../laptop/js/data.js";

// Zonder processorfamilie (sommige HP's) zegt het modelnummer het:
// Intel Core Ultra 2xx (225 = 5, 265 = 7, 285 = 9), AMD Ryzen 8500G/7800X3D.
export function familieUitModel(model) {
  const m = String(model ?? "").trim();
  let r = m.match(/^2([0-8])\d[a-z]*$/i);
  if (r) { const d = +r[1]; return `Intel Core Ultra ${d <= 4 ? 5 : d <= 7 ? 7 : 9}`; }
  r = m.match(/^i([3579])-/i);
  if (r) return `Intel Core i${r[1]}`;
  r = m.match(/^\d([3579])\d{2}[a-z0-9]*$/i);
  if (r) return `AMD Ryzen ${r[1]}`;
  return "";
}

// ─── Scoring system ───────────────────────────────────────────────────────────
// Punten per processorklasse per antwoord (zelfde als laptop). Hoger = beter.
export const scoringSystem = {
  gebruik: {
    dagelijks: { Budget: 9, Mid: 8, Krachtig: 5, Topklasse: 2 },
    werk:      { Budget: 6, Mid: 9, Krachtig: 8, Topklasse: 5 },
    gaming:    { Budget: 1, Mid: 5, Krachtig: 9, Topklasse: 10 },
    creatief:  { Budget: 2, Mid: 6, Krachtig: 9, Topklasse: 10 },
    allround:  { Budget: 5, Mid: 8, Krachtig: 7, Topklasse: 4 }
  },
  intensiteit: {
    licht:     { Budget: 10, Mid: 7,  Krachtig: 3, Topklasse: 1  },
    gemiddeld: { Budget: 6,  Mid: 10, Krachtig: 6, Topklasse: 3  },
    intensief: { Budget: 1,  Mid: 5,  Krachtig: 9, Topklasse: 10 }
  }
};
