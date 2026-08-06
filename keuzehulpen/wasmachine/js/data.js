// ─── Capaciteitsgroepen (keyed by de "gezinsgrootte" antwoord-waarde) ─────────
// Bereik (min/max) i.p.v. een lijst exacte waarden: de catalogus bevat ook
// halve kg's (bijv. "6,5 kg", "10,5 kg") — met een exacte-waarde-lijst vielen
// die producten buiten ELKE groep en verdwenen ze stilletjes uit alle
// resultaten. displayLabel is puur voor UI-teksten (badge, prijsgroepen-titel).
export const capaciteitGroupToAllowedCapaciteit = {
  "klein":     { min: 6,  max: 7.9,              displayMin: 6,  displayMax: 7  },
  "gemiddeld": { min: 8,  max: 9.9,               displayMin: 8,  displayMax: 9  },
  "groot":     { min: 10, max: Number.POSITIVE_INFINITY, displayMin: 10, displayMax: 14 }
};

export function isCapaciteitInGroup(capaciteit, group) {
  const range = capaciteitGroupToAllowedCapaciteit[group];
  if (!range || !Number.isFinite(capaciteit)) return false;
  return capaciteit >= range.min && capaciteit <= range.max;
}

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

// Geen Budget/Mid/Premium-tier-classificatie (meer) voor wasmachines — die
// correleerde niet betrouwbaar met prijs bij kleine capaciteitssegmenten (een
// functierijke machine kon toevallig goedkoper zijn dan een "simpele",
// waardoor "simpel" kiezen een duurder resultaat gaf dan "gemak" kiezen). De
// vraag die op die tier scoorde ("waar hecht je waarde aan?") is daarom
// verwijderd; invertermotor + bovenlader zijn losse extra-checkboxes
// geworden (zie vragen/index.html en matching.js's applyExtraFilter).
