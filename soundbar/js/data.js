// ─── Breedte-groepen (keyed by breedte answer, vraag 1) ───────────────────────
// Grenzen gebaseerd op Coolblue's eigen "Compacte soundbars"-filter (max 80cm)
// en Kieskeurig's formaatgids (80-110cm middenklasse, 110cm+ groot) — niet
// zelfverzonnen, en beter gebalanceerd op onze eigen catalogus dan de eerdere
// 65/100cm-grenzen (die gaven 1/16/16, dit geeft 5/18/10).
export const breedteGroupToRange = {
  "compact":   { min: 0,   max: 800  },
  "gemiddeld": { min: 800, max: 1100 },
  "groot":     { min: 1100, max: Number.POSITIVE_INFINITY },
  "weet-ik-niet": null // geen breedtefilter
};

// ─── Tv-grootte → geadviseerde breedtegroep (vraag 1 → advies bij vraag 2) ─────
// Zelfde patroon als de tv-keuzehulp's kijkafstand → tv-grootte-advies: vraag 1
// vraagt iets dat mensen makkelijk weten (tv-formaat in inch), vraag 2 toont op
// basis daarvan een voorstel dat je nog kunt aanpassen.
export const tvGrootteToBreedteGroup = {
  "tot-43":       "compact",
  "43-55":        "gemiddeld",
  "55-plus":      "groot",
  "weet-ik-niet": "gemiddeld"
};

export const breedteGroepLabels = {
  "compact":      { naam: "compacte", omschrijving: "tot 80 cm" },
  "gemiddeld":    { naam: "gemiddelde", omschrijving: "80 tot 110 cm" },
  "groot":        { naam: "grote", omschrijving: "110 cm of breder" },
  "weet-ik-niet": { naam: "", omschrijving: "" }
};

// ─── Static fallback price groups per breedtegroep ─────────────────────────────
export const priceGroupsBySize = {
  "compact": [
    { label: "0-150",   min: 0,   max: 150  },
    { label: "150-300", min: 150, max: 300  },
    { label: "300+",    min: 300, max: Number.POSITIVE_INFINITY }
  ],
  "gemiddeld": [
    { label: "0-250",   min: 0,   max: 250  },
    { label: "250-500", min: 250, max: 500  },
    { label: "500+",    min: 500, max: Number.POSITIVE_INFINITY }
  ],
  "groot": [
    { label: "0-400",    min: 0,   max: 400  },
    { label: "400-800",  min: 400, max: 800  },
    { label: "800+",     min: 800, max: Number.POSITIVE_INFINITY }
  ],
  "weet-ik-niet": [
    { label: "0-250",    min: 0,   max: 250  },
    { label: "250-600",  min: 250, max: 600  },
    { label: "600+",     min: 600, max: Number.POSITIVE_INFINITY }
  ]
};

// ─── Soundbar tier definitions ─────────────────────────────────────────────────
// Tiers zijn gebaseerd op kanaalconfiguratie + Atmos/DTS:X-ondersteuning, niet
// op prijs — een simpele 2.1-bar en een uitgebreide 5.1.2-set met Atmos dienen
// duidelijk verschillende gebruiksdoelen (zie scoringSystem.gebruik hieronder).
export const TIER_ORDER = ["Compact", "Allround", "HomeCinema", "Premium"];

/**
 * Bepaalt de "tier" van een soundbar op basis van kanaalconfiguratie en
 * ondersteunde audio-decoders.
 */
export function getSoundbarTier(soundbar) {
  const parts = String(soundbar.kanalen || "2.0").split(".").map(n => parseInt(n, 10) || 0);
  const main   = parts[0] || 2;
  const height = parts[2] || 0;
  const decoders = String(soundbar.audio_decoders || "").toLowerCase();
  const hasAtmos = decoders.includes("atmos") || decoders.includes("dts:x") || decoders.includes("dts x");

  if (height > 0 || hasAtmos) return "Premium";
  if (main >= 5) return "HomeCinema";
  if (main >= 3) return "Allround";
  return "Compact";
}

// ─── Kanalen-groep (voor de filter op de resultaatpagina) ─────────────────────
// De ruwe kanalen-notatie (bijv. "9.1.4 kanalen") zegt de meeste bezoekers
// weinig — groepeer 'm daarom naar wat het praktisch oplevert, in plaats van
// techniek. Volgorde bepaalt ook de sortering in het filter.
export const KANALEN_GROEP_ORDER = [
  "Tv-geluid verbeteren",
  "Rondom geluid",
  "Rondom geluid + boven"
];

export function getKanalenGroep(soundbar) {
  const parts = String(soundbar.kanalen || "2.0").split(".").map(n => parseInt(n, 10) || 0);
  const main   = parts[0] || 2;
  const height = parts[2] || 0;

  if (height > 0) return "Rondom geluid + boven";
  if (main >= 5) return "Rondom geluid";
  return "Tv-geluid verbeteren";
}

// ─── Scoring system ───────────────────────────────────────────────────────────
// Elk antwoord geeft een score per soundbar-tier.
export const scoringSystem = {
  gebruik: {
    tv:      { Compact: 9, Allround: 8, HomeCinema: 5, Premium: 5  },
    films:   { Compact: 3, Allround: 7, HomeCinema: 9, Premium: 10 },
    muziek:  { Compact: 6, Allround: 8, HomeCinema: 7, Premium: 8  },
    gaming:  { Compact: 4, Allround: 7, HomeCinema: 8, Premium: 10 }
  }
};
