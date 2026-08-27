// ─── Type koffiemachine (Q1) → Icecat "Type product" + "Koffiezet apparaat
// type" samen ─────────────────────────────────────────────────────────────
// Live prijscorrelatie (493 producten, geverifieerd): filter mediaan €68,
// koffiecupmachine €82, koffiepadmachine €94, espressomachine €449 — sterk
// prijsbepalend, vandaar de belangrijkste/eerste vraag.
//
// LET OP — Icecat's "Type product" is niet altijd betrouwbaar voor capsule-
// machines: 15 van de 271 "Espressomachine"-producten zijn in werkelijkheid
// Nespresso/Dolce Gusto-capsulemachines die Icecat toch als "Espressomachine"
// labelt (bv. "Krups Dolce Gusto Genio S Plus KP3408" — half-identieke
// buurmodellen krijgen wél correct "Koffiepadmachine"). Gevonden doordat een
// gebruiker "halfautomaat" koos en alleen Dolce Gusto-cupmachines terugkreeg
// (sessie-onderzoek). "Koffie invoertype" is hier betrouwbaarder: is dat
// UITSLUITEND "Koffiecapsule"/"Koffiepad" (geen bonen/gemalen ernaast), dan
// is het altijd een capsule-/padmachine, ongeacht wat "Type product" zegt —
// zie isPureCapsuleInvoer() in matching.js.
export const TYPE_MAPPING = {
  volautomaat:  { typeProduct: ["Espressomachine"], automatiseringsgraad: ["Volledig automatisch"] },
  halfautomaat: { typeProduct: ["Espressomachine"], automatiseringsgraad: ["Half automatisch", "Handmatig"] },
  capsules:     { typeProduct: ["Koffiepadmachine", "Koffiecupmachine"] },
  filter:       { typeProduct: ["Filterkoffiezetapparaat"] },
};

// ─── Watertank (l) → hoeveelheid-kopjes-vraag (Q2) ─────────────────────────
// Betrouwbaarder dan "Capaciteit in kopjes" — dat veld betekent bij
// espressomachines "aantal kopjes gelijktijdig" (vaak 1-2) maar bij filter-
// apparaten "totale kan-inhoud" (soms 15+), dus niet 1-op-1 vergelijkbaar
// over types heen.
//
// LET OP — de watertank-range verschilt drastisch per type (sessie-
// onderzoek, volledige histogram per type gecontroleerd): volautomaten
// clusteren rond 1,7-2,3 l, halfautomaten 1,0-3,0 l, capsulemachines vrijwel
// allemaal 0,5-1,0 l, filterapparaten 0,6-1,8 l met een piek rond 1,25 l. Eén
// globale drempel (was: klein ≤1,0/gemiddeld ≤1,8) liet de vraag bij
// volautomaat en capsules bijna niets filteren (bijna alle volautomaten
// vielen boven "klein", bijna alle capsulemachines vielen al onder "klein") —
// daarom per type eigen drempels, elk gekalibreerd op een ongeveer gelijke
// verdeling binnen dat type:
export const WATERTANK_MAX = {
  volautomaat:  { klein: 1.7, gemiddeld: 2.0 },   // n=176: 20% / 61% / 19%
  halfautomaat: { klein: 1.2, gemiddeld: 2.0 },   // n=52: 29% / 37% / 35%
  capsules:     { klein: 0.7, gemiddeld: 1.0 },   // n=148: 35% / 53% / 11%
  filter:       { klein: 1.0, gemiddeld: 1.32 },  // n=49: 33% / 59% / 8%
};

// ─── Melk-opschuimen (Q3) ───────────────────────────────────────────────────
// Q3 wordt overgeslagen in de quiz als bij Q1 "filter" gekozen is: van de 69
// filterkoffiezetapparaten heeft 94% geen enkel melk-gerelateerd Icecat-veld
// (fysiek geen melksysteem, niet "toevallig niet ingevuld") — geverifieerd
// tegen de volledige live catalogus. Bij espressomachines heeft wél ~50% een
// waarde (Ja/Nee), dus daar is het een echte, zinnige vraag.
export const MELK_AUTOMATISCH_WAARDEN = new Set(["Automatisch"]);

// ─── Prijsgroepen (fallback, alleen als dynamische berekening niets geeft) ──
export const priceGroupsFallback = [
  { label: "0-100",   min: 0,   max: 100  },
  { label: "100-400", min: 100, max: 400  },
  { label: "400+",    min: 400, max: Number.POSITIVE_INFINITY },
];
