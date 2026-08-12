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

// ─── Tv-visualisatie (vraag 1) ─────────────────────────────────────────────────
// Dimensies (px in de 1242.21-brede coördinatenruimte) per tv-grootte-antwoord.
// Empirisch gekalibreerd (gerenderd en visueel beoordeeld t.o.v. het kastje/de
// muur in soundbar achtergrond.png — geen bruikbare harde schaalreferentie
// aanwezig in de foto), de drie groepen onderling geschaald met dezelfde
// verhouding als de tv-keuzehulp's eigen tvDimensions-tabel (40-43 en 58-65
// t.o.v. 48-50).
// Height-waarden gecorrigeerd t.o.v. de eerdere "tv visualisatie.png" (nu
// "tv scherp.png") — die heeft een iets andere beeldverhouding (1.769 i.p.v.
// 1.719), dus de hoogte is met dezelfde factor (0.9714) verkleind zodat de
// gerenderde tv-breedte (het bepalende getal voor het formaat) exact gelijk
// blijft aan voorheen — zelfde correctie als tv/js/data.js's tvDimensions.
export const tvDimensionsByTvGrootte = {
  "tot-43":       { width: 351.8, height: 191.27 },
  "43-55":        { width: 409.14, height: 222.45 },
  "55-plus":      { width: 531.8, height: 289.18 },
  "weet-ik-niet":  { width: 409.14, height: 222.45 } // toont het gemiddelde advies
};

// Mobiel heeft een eigen tabel: de mobiele achtergrond-crop (cover, 92% center
// op een vierkant) heeft een andere schaal dan de desktop-crop van dezelfde
// foto, dus dezelfde cm-waarden vertalen niet 1-op-1 naar dezelfde
// coördinatenruimte-eenheden.
export const tvDimensionsByTvGrootteMobile = {
  "tot-43":       { width: 319.4, height: 173.69 },
  "43-55":        { width: 371.4, height: 202.05 },
  "55-plus":      { width: 482.8, height: 262.67 },
  "weet-ik-niet":  { width: 371.4, height: 202.05 }
};

// ─── Soundbar-visualisatie op het kastje (vraag 2) ─────────────────────────────
// Elke cutout is via diff-vergelijking tegen "referentie met tv voor
// generator.png" (dezelfde kamer+tv, alleen de soundbar toegevoegd) exact
// uitgesneden, dus positie/schaal komen rechtstreeks overeen met waar de
// soundbar in de gegenereerde foto's ook echt staat — onder de tv, op het
// kastje.
export const SOUNDBAR_CUTOUT_IMAGES = {
  compact:   "soundbar/images/soundbar cutout klein.png",
  gemiddeld: "soundbar/images/soundbar cutout middel.png",
  groot:     "soundbar/images/soundbar cutout groot.png"
};

// De AI-generaties waren niet allemaal even precies horizontaal gecentreerd
// onder de tv (klein/groot zaten er vlak bij, gemiddeld ~34px ernaast) — dus
// rightOffset staat hier bewust gelijk aan de tv's eigen rightOffset (zie
// --tv-right-offset in vragen/index.html) i.p.v. de losse gemeten waarde per
// generatie. bottomOffset varieert wel bewust een fractie per grootte (de
// gemeten hoogte van elk tafelblad-contactpunt).
export const soundbarDimensionsByBreedte = {
  compact:        { width: 191.11, height: 24.61, rightOffset: 372, bottomOffset: 189.41 },
  gemiddeld:      { width: 285.94, height: 31.13, rightOffset: 372, bottomOffset: 193.03 },
  groot:          { width: 406.83, height: 39.09, rightOffset: 372, bottomOffset: 186.51 },
  "weet-ik-niet": null
};

export const soundbarDimensionsByBreedteMobile = {
  compact:        { width: 171.33, height: 22.07, rightOffset: 297.3, bottomOffset: 184.85 },
  gemiddeld:      { width: 256.35, height: 27.91, rightOffset: 297.3, bottomOffset: 188.09 },
  groot:          { width: 364.73, height: 35.04, rightOffset: 297.3, bottomOffset: 182.25 },
  "weet-ik-niet": null
};

// ─── Subwoofer-visualisatie (vraag 4) ──────────────────────────────────────────
// 1 vaste maat — een subwoofer varieert in het echt niet zo in formaat zoals
// een soundbar. Verschijnt/verdwijnt op basis van het subwoofer-antwoord,
// staat op de vloer vóór het kastje, rechts. De cutout bevat nu ook de
// schaduw (in tegenstelling tot de eerdere product-only cutout), dus de box
// is groter dan het product zelf — rightOffset/bottomOffset zijn gecorrigeerd
// zodat het product-zelf (excl. schaduw) op exact dezelfde plek blijft staan.
export const subwooferDimensions       = { width: 105.48, height: 110.01, rightOffset: 158.01, bottomOffset: 8.65 };
export const subwooferDimensionsMobile = { width: 94.57,  height: 98.63,  rightOffset: 102.23, bottomOffset: 22.79 };

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
