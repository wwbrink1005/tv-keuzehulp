// ─── Capaciteitsgroepen (keyed by de "gezinsgrootte" antwoord-waarde) ─────────
// Bereik (min/max) i.p.v. een lijst exacte waarden: de catalogus bevat ook
// halve kg's (bijv. "6,5 kg", "10,5 kg") — met een exacte-waarde-lijst vielen
// die producten buiten ELKE groep en verdwenen ze stilletjes uit alle
// resultaten. displayLabel is puur voor UI-teksten (badge, prijsgroepen-titel).
//
// Sinds okt. 2026 een ondergrens i.p.v. een vak: er zijn maar 5 wasmachines
// van 6-7 kg bij 2+ winkels, vrijwel alles is 8-9 kg en dat is voor een klein
// huishouden ook prima. Het ideaal (display) weegt mee in de matching.
export const capaciteitGroupToAllowedCapaciteit = {
  "klein":     { min: 6, max: Number.POSITIVE_INFINITY, idealMin: 7,  idealMax: 9,  displayMin: 7,  displayMax: 9  },
  "gemiddeld": { min: 8, max: Number.POSITIVE_INFINITY, idealMin: 8,  idealMax: 10, displayMin: 8,  displayMax: 10 },
  "groot":     { min: 9, max: Number.POSITIVE_INFINITY, idealMin: 10, idealMax: 14, displayMin: 10, displayMax: 12 }
};

// ─── Budgetvraag ("Wat wil je maximaal uitgeven?") ─────────────────────────
// Twee maximumbedragen plus "Geen voorkeur". Uit de live catalogus (okt. 2026,
// 2+ winkels): rond een derde en twee derde van de prijzen (8-9 kg: €630 en
// €820; 10 kg+: €750 en €1.020).
export const budgetCapsByCapaciteit = {
  "klein":     [600, 900],
  "gemiddeld": [600, 900],
  "groot":     [800, 1100],
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

// ─── Specifieke wasprogramma's (afgeleid uit Icecat's vrije-tekstlijst) ────
// Icecat's "Wasprogramma's"-veld is een kommagescheiden lijst van
// programmanamen (bv. "Katoen, Wol, Sport, Hygiëne/anti-allergie,
// Delicaat/zijde, Stoom, ..."), met 98% dekking — veel completer dan losse
// Ja/Nee-velden per programma (die Icecat voor wasmachines niet aanbiedt).
// Detectie via keyword-match op de tekst, zelfde aanpak als isInktTankSysteem
// bij printer.
// Sinds okt. 2026 vullen ook de Bosch/Siemens-scrapers de volledige lijst
// (zie keuzehulp-pipeline/bsh_wasmachine.py). De vraag in de quiz gebruikt
// allergie, sport, outdoor, dekbed en snel; de rest is voor filters en kaarten.
export const WASPROGRAMMA_DEFINITIES = [
  { key: "allergie", label: "Allergie/hygiëne",   patroon: /allergi|hygi[eë]/i },
  { key: "sport",    label: "Sport",              patroon: /sport/i },
  { key: "outdoor",  label: "Outdoor/impregneren", patroon: /outdoor|impregn/i },
  { key: "dekbed",   label: "Dekbed/dons",        patroon: /dekbed|dons|beddengoed/i },
  { key: "snel",     label: "Snelwas",            patroon: /snel|quick|superkort|express|rapid|\b1[45] ?min|\b20 ?min/i },
  { key: "wol",      label: "Wol",                patroon: /wol/i },
  { key: "stoom",    label: "Stoom",              patroon: /stoom|steam/i },
  { key: "jeans",    label: "Jeans",              patroon: /jeans|denim/i },
  { key: "baby",     label: "Babyverzorging",     patroon: /baby/i },
];

export function heeftWasprogramma(wasprogrammas, key) {
  const definitie = WASPROGRAMMA_DEFINITIES.find(d => d.key === key);
  if (!definitie) return false;
  return definitie.patroon.test(String(wasprogrammas ?? ""));
}

// Geen Budget/Mid/Premium-tier-classificatie (meer) voor wasmachines — die
// correleerde niet betrouwbaar met prijs bij kleine capaciteitssegmenten (een
// functierijke machine kon toevallig goedkoper zijn dan een "simpele",
// waardoor "simpel" kiezen een duurder resultaat gaf dan "gemak" kiezen). De
// vraag die op die tier scoorde ("waar hecht je waarde aan?") is daarom
// verwijderd. Sinds okt. 2026 een passcore per wasmachine (zie matching.js).
