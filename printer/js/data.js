// ─── Printer-keuzehulp: vaste gegevens en kenmerken ────────────────────────
// Zie docs/printer-keuzehulp-werking.md voor de uitleg in gewone taal.

// ─── Budgetvraag ("Wat wil je maximaal uitgeven?") ─────────────────────────
// Twee maximumbedragen per gebruik, plus "Geen voorkeur" zonder bovengrens.
// Afgeleid uit de live catalogus (18-10-2026, printers bij 2+ winkels): rond
// een derde en twee derde van de prijzen die bij dat gebruik passen. Herzien
// als de prijzen flink verschuiven.
export const budgetCapsByGebruik = {
  thuis:    [100, 200],
  foto:     [200, 300],
  kantoor:  [200, 350],
};

// ─── Soort printer ─────────────────────────────────────────────────────────
// Vier soorten, die voor een koper echt verschillen in aanschaf, kosten per
// pagina en gebruik. Dit is wat de vragen tegen elkaar afwegen (zoals het
// paneeltype bij de tv).
export const SOORTEN = ["cartridge", "tank", "laserZw", "laserKleur"];

export const SOORT_LABEL = {
  cartridge:  "Inkjet met cartridges",
  tank:       "Inkttankprinter",
  laserZw:    "Laserprinter zwart-wit",
  laserKleur: "Laserprinter kleur",
};

// Icecat heeft geen betrouwbaar "navulbare inkttank"-veld; EcoTank, Smart Tank,
// MegaTank en SuperTank zijn productlijnnamen van Epson, HP, Canon en Brother.
// Niet elke winkel noemt de lijnnaam, dus ook de modelreeksen: Epson ET-xxxx,
// Canon PIXMA G-xxxx (MegaTank) en Brother DCP-T/MFC-T (InkBenefit).
const INKTTANK_PATRONEN = [/ecotank/i, /smart tank/i, /megatank/i, /supertank/i, /inkbenefit/i,
  /\bET-\d{4}/i, /\bpixma g\d{3,4}/i, /\b(dcp|mfc)-t\d{3}/i];

export function isInktTankSysteem(naam) {
  return INKTTANK_PATRONEN.some(re => re.test(String(naam ?? "")));
}

// "LED" is Brother's naam voor hun laser-techniek (toner, zelfde klasse).
export function isLaser(printer) {
  return /laser|led/i.test(String(printer.printtechnologie ?? ""));
}

export function soortVan(printer) {
  if (isLaser(printer)) return printer.kanKleurenPrinten === "Ja" ? "laserKleur" : "laserZw";
  return isInktTankSysteem(printer.naam) ? "tank" : "cartridge";
}

// Een echte fotoprinter: 5 of meer inktkleuren (extra grijs, rood, fotozwart)
// of "Photo" in de productlijn (Epson Expression Photo, HP Envy Photo, Canon
// ... Photo).
export function isFotoprinter(printer) {
  const kleuren = String(printer.printkleuren ?? "").split(",").map(s => s.trim()).filter(Boolean).length;
  return kleuren >= 5 || /\bphoto\b/i.test(String(printer.naam ?? ""));
}

// HP+ / Instant Ink: modelnummer eindigt op "e" (OfficeJet Pro 8122e, ENVY
// 6120e, LaserJet M110we). Die werken alleen met een HP-account en originele
// HP-cartridges; dat zetten we eerlijk op de kaart.
export function isHpPlus(printer) {
  const naam = String(printer.naam ?? "");
  if (!/^HP\b/i.test(naam)) return false;
  return /\b[a-z]*\d{3,4}[a-z]*e\b/i.test(naam) || /instant ink/i.test(naam);
}

// ─── Kenmerken voor de extra wensen ────────────────────────────────────────
// Compact: binnen het kleinste kwart van de catalogus (gemeten 18-10-2026:
// breedte p25 375 mm, diepte p25 343 mm, hoogte p25 179 mm).
export const COMPACT_MAX = { breedte: 410, diepte: 370, hoogte: 230 };
export const GROTE_LADE_MIN = 250;            // vel; p75 van de catalogus
export const SNEL_MIN = 25;                   // pagina's per minuut zwart-wit
export const VEEL_PAGINAS_MIN = 1000;         // aanbevolen pagina's per maand (bovengrens)

export function isCompact(p) {
  if (![p.breedteMm, p.diepteMm, p.hoogteMm].every(Number.isFinite)) return null;
  return p.breedteMm <= COMPACT_MAX.breedte && p.diepteMm <= COMPACT_MAX.diepte && p.hoogteMm <= COMPACT_MAX.hoogte;
}

// "400 - 800 pagina's per maand" → 800
export function aanbevolenMax(tekst) {
  const getallen = String(tekst ?? "").replace(/\./g, "").match(/\d+/g);
  return getallen ? Math.max(...getallen.map(Number)) : null;
}

// ─── Punten per soort (zoals de typepunten bij de tv) ──────────────────────
// Hoe hoger, hoe beter die soort past bij het antwoord. Per vraag opgeteld; de
// soort met de meeste punten is de "ideale soort" en een printer van een
// andere soort verliest punten per punt achterstand (zie matching.js).
export const soortPunten = {
  gebruik: {
    thuis:   { cartridge: 8, tank: 8, laserZw: 7, laserKleur: 5 },
    foto:    { cartridge: 9, tank: 9, laserZw: 0, laserKleur: 3 },
    kantoor: { cartridge: 3, tank: 6, laserZw: 9, laserKleur: 9 },
  },
  // Weinig printen: inkt droogt in, toner niet. Veel printen: alleen tank en
  // laser zijn dan betaalbaar per pagina.
  volume: {
    weinig:     { cartridge: 6, tank: 5, laserZw: 9, laserKleur: 7 },
    regelmatig: { cartridge: 6, tank: 9, laserZw: 9, laserKleur: 8 },
    veel:       { cartridge: 2, tank: 9, laserZw: 10, laserKleur: 9 },
  },
  kleur: {
    zw:    { cartridge: 3, tank: 3, laserZw: 10, laserKleur: 4 },
    soms:  { cartridge: 8, tank: 8, laserZw: 0, laserKleur: 8 },
    vaak:  { cartridge: 8, tank: 10, laserZw: 0, laserKleur: 7 },
  },
  kosten: {
    aanschaf: { cartridge: 10, tank: 3, laserZw: 8, laserKleur: 4 },
    printen:  { cartridge: 2, tank: 10, laserZw: 9, laserKleur: 8 },
    egal:     { cartridge: 0, tank: 0, laserZw: 0, laserKleur: 0 },
  },
};

// Kassa-, label- en matrixprinters, pasjesprinters en plotters zitten ook in
// de feed, maar zijn geen printer voor thuis of op kantoor.
// "Thermische inkjet" is gewone inkjet (HP) en blijft dus.
const GEEN_KANTOORPRINTER_TECH = /^(direct )?thermisch$|thermo transfer|thermische (overdracht|overzetting)|stippen|matrix/i;
const GEEN_KANTOORPRINTER_NAAM = /\bPOS\b|bonprinter|kassaprinter|labelprinter|etiketten|label printer|receipt|kaart ?printer|designjet|plotter/i;

export function isKantoorprinter(printtechnologie, naam) {
  return !GEEN_KANTOORPRINTER_TECH.test(String(printtechnologie ?? "")) &&
    !GEEN_KANTOORPRINTER_NAAM.test(String(naam ?? ""));
}
