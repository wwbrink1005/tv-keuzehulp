// printer/js/punten.js — kaartinhoud voor resultaat- en favorietenpagina.
// Zelfde opzet als koelkast/js/punten.js; bouwstenen in shared/punten-basis.js.

import {
  esc, getal, ja, maten,
  maakContext, vergelijk, zochtRegel, puntenLijst, prijsPunten, winkelVangnet, schoonSpecs,
} from "../../shared/punten-basis.js";
import { SOORT_LABEL, SNEL_MIN, GROTE_LADE_MIN } from "./data.js";

const ppm = (v) => parseInt(v, 10) || NaN;
const telefoon = (pr) => /airprint|mopria/i.test(pr.mobielPrinten ?? "");

export function buildContext(lijst, naam) {
  return maakContext(lijst, naam, {
    zwart: (p) => ppm(p.snelheid ?? p.printsnelheidZwart),
  });
}

/** "Waarom dit bij jou past": precies 4 punten. */
export function buildResultPoints(pr, answers, ctx) {
  const p = puntenLijst();
  const a = answers || {};
  const wensen = Array.isArray(a.extraAnswers) ? a.extraAnswers : [];
  const wil = (x) => wensen.includes(x);
  const kleur = ja(pr.kanKleurenPrinten);
  const snelheid = ppm(pr.snelheid ?? pr.printsnelheidZwart);

  // 1. Alle vervulde keuzes in één regel
  const delen = [];
  const vink = (onderwerp, tekst) => { delen.push(`<strong>${tekst}</strong>`); p.gebruikt.add(onderwerp); };
  if (a.gebruik === "foto" && pr.fotoprinter) vink("foto", "fotoprinter");
  if ((a.kleur === "soms" || a.kleur === "vaak") && kleur) vink("kleur", "print in kleur");
  if (a.kleur === "zw" && !kleur) vink("kleur", "zwart-witprinter");
  if (a.scan === "los" && pr.aio) vink("aio", "ook scannen en kopiëren");
  if (a.scan === "stapel" && pr.aio && ja(pr.adf)) { vink("aio", "scannen en kopiëren"); vink("adf", "documentinvoer voor stapels"); }
  if (a.kosten === "printen" && pr.soort === "tank") vink("inkt", "navulbare inkttanks");
  if (a.kosten === "printen" && (pr.soort === "laserZw" || pr.soort === "laserKleur")) vink("inkt", "voordelig per pagina met toner");
  if (a.volume === "veel" && snelheid >= SNEL_MIN) vink("snelheid", "snel");
  if (wil("duplex") && pr.duplexAuto === true) vink("duplex", "automatisch dubbelzijdig");
  if (wil("compact") && pr.compact === true) vink("compact", "compact");
  if (wil("lade") && pr.invoercapaciteit >= GROTE_LADE_MIN) vink("lade", "grote papierlade");
  if (wil("a3") && pr.a3 === true) vink("a3", "print op A3");
  zochtRegel(p, delen);

  // 2. Wat deze kaart onderscheidt binnen de lijst
  vergelijk(p, ctx, "zwart", snelheid, {
    laagBeter: false, overtreffend: "snelste", onderwerp: "snelheid",
    fmt: (x) => `<strong>${getal(x)} pagina's per minuut</strong>`,
  });
  prijsPunten(p, pr, ctx);

  // 3. Wat de soort printer betekent voor de kosten. Wie vaak in kleur of veel print
  // (of goedkoop printen wil), heeft het meeste aan inkttanks: dan bovenaan (26-10-2026,
  // uit de analyse: tankprinters zijn daar het betere advies maar vielen weg).
  const veelInkt = a.kleur === "vaak" || a.volume === "regelmatig" || a.volume === "veel" || a.kosten === "printen";
  if (pr.soort === "tank" && veelInkt) p.voeg(11, "inkt", `<strong>Navulbare inkttanks</strong>: bij jouw gebruik veel goedkoper per pagina dan cartridges`);
  if (pr.soort === "tank") p.voeg(30, "inkt", `<strong>Navulbare inkttanks</strong>: veel lagere kosten per pagina dan cartridges`);
  else if (pr.soort === "laserZw" || pr.soort === "laserKleur") p.voeg(31, "inkt", `<strong>Toner</strong> in plaats van inkt: voordelig per pagina en droogt niet in`);
  if (a.gebruik === "foto" && pr.zonderWitranden === "Ja") p.voeg(32, "witranden", `<strong>Foto's zonder witranden</strong>, tot de rand bedrukt`);

  // 4. Kenmerken waar niet om gevraagd is, en het vangnet
  if (pr.duplexAuto === true) p.voeg(40, "duplex", `<strong>Automatisch dubbelzijdig</strong> printen, zonder omdraaien`);
  if (pr.aio) p.voeg(42, "aio", `<strong>All-in-one</strong>: printen, scannen en kopiëren`);
  if (ja(pr.adf)) p.voeg(43, "adf", `<strong>Automatische documentinvoer</strong> voor stapels papier`);
  if (pr.invoercapaciteit >= GROTE_LADE_MIN) p.voeg(44, "lade", `<strong>Papierlade van ${getal(pr.invoercapaciteit)} vel</strong>: minder vaak bijvullen`);
  if (pr.compact === true) p.voeg(45, "compact", `<strong>Compact</strong>: ${maten(pr.hoogteMm, pr.breedteMm, pr.diepteMm) ?? "past op een klein bureau"}`);
  if (telefoon(pr)) p.voeg(46, "telefoon", `<strong>Printen vanaf je telefoon</strong> met ${/airprint/i.test(pr.mobielPrinten) ? "AirPrint (iPhone)" : "Mopria (Android)"}`);
  else if (ja(pr.wifi)) p.voeg(46, "telefoon", `<strong>Wifi</strong>: printen vanaf je telefoon of laptop`);
  if (Number.isFinite(snelheid)) p.voeg(90, "snelheid", `<strong>${getal(snelheid)} pagina's per minuut</strong> in zwart-wit`);
  if (pr.soort) p.voeg(91, "soort", `<strong>${esc(SOORT_LABEL[pr.soort] ?? pr.printtechnologie)}</strong>`);
  p.voeg(92, "kleur", kleur ? `Print in <strong>kleur</strong>` : `Print in <strong>zwart-wit</strong>`);
  if (pr.merk) p.voeg(93, "merk", `Van <strong>${esc(pr.merk)}</strong>`);
  winkelVangnet(p, pr);
  return p.top4();
}

/**
 * Eerlijke kanttekening onder de punten. HP+ / Instant Ink (modelnummer op
 * "e"): werkt alleen met een HP-account en originele HP-cartridges.
 */
export function buildNote(pr, answers) {
  const a = answers || {};
  const notities = [];
  if (pr?.hpPlus) notities.push("HP+ printer: werkt alleen met een HP-account, internet en originele HP-cartridges.");
  // Goedkoop in aanschaf, duur in gebruik: eerlijk melden bij wie veel inkt gebruikt.
  const veelInkt = a.kleur === "vaak" || a.volume === "regelmatig" || a.volume === "veel";
  if (pr?.soort === "cartridge" && veelInkt) notities.push("Let op: bij jouw gebruik zijn cartridges duur per pagina. Een printer met navulbare inkttanks is op termijn meestal goedkoper.");
  return notities.join(" ");
}

export function buildSpecChips(pr) {
  const specs = [];
  if (pr.soort) specs.push(SOORT_LABEL[pr.soort]);
  else if (pr.printtechnologie) specs.push(pr.printtechnologie);
  const snelheid = ppm(pr.snelheid ?? pr.printsnelheidZwart);
  if (Number.isFinite(snelheid)) specs.push(`${snelheid} ppm`);
  if (pr.aio) specs.push("All-in-one");
  if (pr.fotoprinter) specs.push("Fotoprinter");
  if (pr.a3) specs.push("A3");
  return specs;
}

export function buildAlleSpecs(pr, raw) {
  const duplex = pr.duplexAuto === true ? "Automatisch" : pr.duplexAuto === false ? (ja(pr.duplex) ? "Handmatig" : "Nee") : pr.duplex;
  const afm = pr.breedteMm && pr.diepteMm && pr.hoogteMm ? `${getal(pr.breedteMm)} × ${getal(pr.diepteMm)} × ${getal(pr.hoogteMm)} mm (b × d × h)` : null;
  const snelheid = ppm(pr.snelheid ?? pr.printsnelheidZwart);
  return schoonSpecs([
    { titel: "Printen", rijen: [
      ["Soort", SOORT_LABEL[pr.soort]], ["Techniek", pr.printtechnologie], ["Kleur", pr.kanKleurenPrinten], ["Inktkleuren", pr.printkleuren],
      ["Snelheid zwart", Number.isFinite(snelheid) ? `${snelheid} pagina's/min` : null],
      ["Snelheid kleur", Number.isFinite(ppm(pr.printsnelheidKleur)) ? `${ppm(pr.printsnelheidKleur)} pagina's/min` : null],
      ["Dubbelzijdig", duplex],
      ["Grootste papierformaat", pr.maxPapierformaat],
      ["Zonder witranden", pr.zonderWitranden === "Ja" ? "Ja" : null],
      ["Aanbevolen per maand", Number.isFinite(pr.paginasPerMaand) ? `tot ${getal(pr.paginasPerMaand)} pagina's` : null],
    ] },
    { titel: "Functies", rijen: [
      ["Scannen", pr.scannen], ["Kopiëren", pr.kopieren], ["Faxen", pr.faxen], ["Documentinvoer", pr.adf], ["Display", pr.display],
      ["Papierlade", Number.isFinite(pr.invoercapaciteit) ? `${getal(pr.invoercapaciteit)} vel` : null],
    ] },
    { titel: "Verbinding en overig", rijen: [
      ["Wifi", pr.wifi], ["Printen vanaf telefoon", pr.mobielPrinten], ["Netwerkkabel", pr.ethernet], ["Bluetooth", pr.bluetooth],
      ["HP+", pr.hpPlus ? "Ja: HP-account en originele HP-cartridges nodig" : null],
      ["Afmetingen", afm], ["Gewicht", Number.isFinite(pr.gewichtKg) ? `${getal(pr.gewichtKg, 1)} kg` : null],
      ["Bedoeld voor", pr.marktPositionering], ["Kleur behuizing", pr.kleur], ["Merk", pr.merk], ["EAN", raw?.ean],
    ] },
  ]);
}
