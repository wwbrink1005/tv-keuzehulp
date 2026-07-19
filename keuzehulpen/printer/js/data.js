// ─── Gebruikstypes (keyed by de "gebruik" antwoord-waarde in vraag 1) ────────
// Dit is een harde partitie van de catalogus (zoals behuizingType bij desktop):
// je kiest er 1, en alleen printers van dat gebruikstype komen in aanmerking.
export const gebruikTypes = ["thuis", "zakelijk", "foto"];

// ─── Static fallback price groups per gebruikstype ────────────────────────────
export const priceGroupsByGebruik = {
  "thuis": [
    { label: "0-100",   min: 0,   max: 100  },
    { label: "100-250", min: 100, max: 250  },
    { label: "250+",    min: 250, max: Number.POSITIVE_INFINITY }
  ],
  "zakelijk": [
    { label: "0-300",   min: 0,   max: 300  },
    { label: "300-600", min: 300, max: 600  },
    { label: "600+",    min: 600, max: Number.POSITIVE_INFINITY }
  ],
  "foto": [
    { label: "0-150",   min: 0,   max: 150  },
    { label: "150-350", min: 150, max: 350  },
    { label: "350+",    min: 350, max: Number.POSITIVE_INFINITY }
  ]
};

/**
 * Classificeert een printer op basis van specs naar gebruikstype
 * (thuis/zakelijk/foto). Retourneert null als het niet te bepalen is
 * (onvoldoende Icecat-data) — zo'n printer komt dan bij geen enkel
 * gebruikstype in de resultaten terecht.
 */
export function classifyGebruik(printtechnologie, marktPositionering, printkleuren) {
  const tech = String(printtechnologie ?? "").toLowerCase();
  const markt = String(marktPositionering ?? "").toLowerCase();
  const kleurenAantal = String(printkleuren ?? "").split(",").map(s => s.trim()).filter(Boolean).length;

  if (tech.includes("laser") || markt.includes("bedrijf")) return "zakelijk";
  if (kleurenAantal >= 5) return "foto";
  if (tech) return "thuis";
  return null;
}

// ─── Kwaliteits-tier binnen een gebruikstype ──────────────────────────────────
// Net als gpuTier bij desktop: een tweede, zachte as bovenop het gebruikstype,
// gebaseerd op printsnelheid en functierijkdom.
export const TIER_ORDER = ["Budget", "Mid", "Premium"];

export function getPrinterTier(p) {
  const speed = parseInt(p.printsnelheidZwart, 10) || 0;
  const featureCount = ["duplex", "display", "wifi", "adf"]
    .filter(key => p[key] === "Ja").length;

  if (speed >= 30 || featureCount >= 3) return "Premium";
  if (speed >= 20 || featureCount >= 1) return "Mid";
  return "Budget";
}

// ─── Vertaling quizantwoord (vraag 1) → harde gebruikType-partitie ────────────
// Vraag 1 heeft 4 antwoorden (rijker dan de 3 gebruikTypes) zodat "thuis" kan
// worden opgesplitst in een tekst-only en een gemengd profiel, die allebei in
// dezelfde harde partitie vallen maar wel anders scoren op kwaliteits-tier.
export const GEBRUIK_ANTWOORD_TO_TYPE = {
  tekst:    "thuis",
  gemengd:  "thuis",
  foto:     "foto",
  zakelijk: "zakelijk"
};

// ─── Scoringsysteem ────────────────────────────────────────────────────────────
// Elke vraag hieronder is single-select en scoort de kwaliteits-tier direct.
// Kleur is een harde (gracieus degraderende) filter, all-in-one een zachte
// voorkeur — zie matching.js.
export const scoringSystem = {
  gebruik: {
    tekst:    { Budget: 8, Mid: 5, Premium: 2  },
    gemengd:  { Budget: 4, Mid: 8, Premium: 5  },
    foto:     { Budget: 2, Mid: 6, Premium: 9  },
    zakelijk: { Budget: 2, Mid: 6, Premium: 10 }
  },
  volume: {
    weinig:    { Budget: 9, Mid: 6, Premium: 3  },
    gemiddeld: { Budget: 4, Mid: 9, Premium: 6  },
    veel:      { Budget: 1, Mid: 6, Premium: 10 }
  },
  aio: {
    ja:  { Budget: 3, Mid: 7, Premium: 9 },
    nee: { Budget: 7, Mid: 6, Premium: 4 }
  }
};
