// ─── Capaciteitsgroepen (keyed by de "gezinsgrootte" antwoord-waarde) ─────────
// Zelfde grenzen als wasmachine (6-7.9 / 8-9.9 / 10+ kg) — geverifieerd tegen
// de live catalogus: 7 kg (n=10), 8-9 kg (n=135, verreweg de meeste), 10 kg+
// (n=16, incl. een paar 16-18 kg-uitschieters). Bereik i.p.v. een lijst exacte
// waarden, zelfde reden als bij wasmachine: halve kg's zouden anders buiten
// elke groep vallen.
//
// Sinds okt. 2026 een ondergrens i.p.v. een vak (zelfde als wasmachine): bij
// 2+ winkels is er maar 1 droger van 7 kg, vrijwel alles is 8 of 9 kg. Het
// ideaal weegt mee in de matching.
export const capaciteitGroupToAllowedCapaciteit = {
  "klein":     { min: 7, max: Number.POSITIVE_INFINITY, idealMin: 7,  idealMax: 9,  displayMin: 7,  displayMax: 9  },
  "gemiddeld": { min: 8, max: Number.POSITIVE_INFINITY, idealMin: 8,  idealMax: 10, displayMin: 8,  displayMax: 10 },
  "groot":     { min: 9, max: Number.POSITIVE_INFINITY, idealMin: 10, idealMax: 12, displayMin: 10, displayMax: 12 }
};

// ─── Budgetvraag ("Wat wil je maximaal uitgeven?") ─────────────────────────
// Twee maximumbedragen plus "Geen voorkeur". Uit de live catalogus (okt. 2026,
// 2+ winkels): rond een derde en twee derde van de prijzen (€711 en €899);
// dat geldt voor 8, 9 en 10 kg ongeveer gelijk.
export const BUDGET_CAPS = [700, 900];

// Energielabels: A is het zuinigst. Een C-droger verbruikt ruim de helft meer
// stroom dan een A-droger (Icecat: ~60 tegen ~95 kWh per 100 beurten).
export const ENERGIE_RANG = { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6 };

export function isCapaciteitInGroup(capaciteit, group) {
  const range = capaciteitGroupToAllowedCapaciteit[group];
  if (!range || !Number.isFinite(capaciteit)) return false;
  return capaciteit >= range.min && capaciteit <= range.max;
}

// ─── Static fallback price groups per capaciteitsgroep ────────────────────────
// Alleen gebruikt als computeDynamicPriceGroups() niets oplevert (bv. lege
// catalogus-fetch) — de resultaatpagina berekent de echte buckets altijd vers
// vanuit de live catalogus. Ruwe schatting op basis van de live prijsrange
// (€429-€1559, mediaan €679) tijdens het bouwen van deze keuzehulp.
export const priceGroupsByCapaciteit = {
  "klein": [
    { label: "0-500",   min: 0,   max: 500  },
    { label: "500-700", min: 500, max: 700  },
    { label: "700+",    min: 700, max: Number.POSITIVE_INFINITY }
  ],
  "gemiddeld": [
    { label: "0-600",   min: 0,   max: 600  },
    { label: "600-900", min: 600, max: 900  },
    { label: "900+",    min: 900, max: Number.POSITIVE_INFINITY }
  ],
  "groot": [
    { label: "0-800",    min: 0,   max: 800   },
    { label: "800-1200", min: 800, max: 1200  },
    { label: "1200+",    min: 1200, max: Number.POSITIVE_INFINITY }
  ]
};

// ─── Specifieke droogprogramma's (afgeleid uit Icecat's vrije-tekstlijst) ──
// Icecat's "Droogprogramma's"-veld is, net als wasmachine's "Wasprogramma's",
// een kommagescheiden lijst van programmanamen — 73% dekking op de live
// catalogus. Detectie via keyword-match, zelfde aanpak als wasmachine.
// Sinds okt. 2026 ook outdoor ("Impregneren" bij Miele), stoom in het Engels
// ("Steam", "Refresh") en beddengoed/dons. De quiz vraagt wol, sport/outdoor,
// stoom, allergie/hygiëne en beddengoed; jeans en baby blijven voor de filters.
export const DROOGPROGRAMMA_DEFINITIES = [
  { key: "wol",      label: "Wol",                 patroon: /wol/i },
  { key: "sport",    label: "Sport/outdoor",       patroon: /sport|outdoor|impregn/i },
  { key: "stoom",    label: "Stoom (opfrissen)",   patroon: /stoom|steam|opfris|refresh/i },
  { key: "allergie", label: "Allergie/hygiëne",    patroon: /allergie|hygi[eë]/i },
  { key: "dekbed",   label: "Beddengoed/dons",     patroon: /bedde|bedlinnen|dekbed|dons|duvet/i },
  { key: "jeans",    label: "Jeans",               patroon: /jeans|denim/i },
  { key: "baby",     label: "Babyverzorging",      patroon: /baby/i },
];

export function heeftDroogprogramma(droogprogrammas, key) {
  const definitie = DROOGPROGRAMMA_DEFINITIES.find(d => d.key === key);
  if (!definitie) return false;
  return definitie.patroon.test(String(droogprogrammas ?? ""));
}

// Geen Budget/Mid/Premium-tier-classificatie voor wasdrogers — net als bij
// wasmachine, maar hier is het niet eens een keuze: "Droogsysteem" is voor
// 95% van de catalogus "Warmtepomp" (geverifieerd tegen live data) en
// "Apparaatplaatsing" is 100% "Vrijstaand", dus geen van beide geeft een
// bruikbare tier-as. Capaciteit is de enige harde partitie (zie hierboven).
