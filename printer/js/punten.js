// printer/js/punten.js — kaartinhoud voor resultaat- en favorietenpagina.
// Zelfde opzet als koelkast/js/punten.js; bouwstenen in shared/punten-basis.js.

import {
  esc, getal, ja,
  maakContext, vergelijk, zochtRegel, puntenLijst, prijsPunten, winkelVangnet, schoonSpecs,
} from "../../shared/punten-basis.js";
import { isInktTankSysteem, VEEL_VOLUME_MIN_SNELHEID } from "./data.js";

const GEBRUIK_LABEL = { thuis: "Thuisgebruik", zakelijk: "Zakelijk gebruik", foto: "Fotoprinter" };
const ppm = (v) => parseInt(v, 10) || NaN;

export function buildContext(lijst, naam) {
  return maakContext(lijst, naam, {
    zwart: (p) => ppm(p.printsnelheidZwart),
    kleur: (p) => ppm(p.printsnelheidKleur),
  });
}

/** "Waarom dit bij jou past": precies 4 punten. */
export function buildResultPoints(pr, answers, ctx) {
  const p = puntenLijst();
  const a = answers || {};
  const wensen = Array.isArray(a.extraAnswers) ? a.extraAnswers : [];
  const wil = (x) => wensen.includes(x);
  const tank = isInktTankSysteem(pr.naam);

  // 1. Alle vervulde keuzes in één regel
  const delen = [];
  const vink = (onderwerp, tekst) => { delen.push(`<strong>${tekst}</strong>`); p.gebruikt.add(onderwerp); };
  if (a.kleur === "ja" && ja(pr.kanKleurenPrinten)) vink("kleur", "print in kleur");
  if (a.aio === "ja" && ja(pr.scannen) && ja(pr.kopieren)) vink("aio", "ook scannen en kopiëren");
  if (a.inkt === "tank" && tank) vink("inkt", "navulbare inkttanks");
  if (a.volume === "veel" && ppm(pr.printsnelheidZwart) >= VEEL_VOLUME_MIN_SNELHEID) vink("snelheid", "snel");
  if (wil("adf") && ja(pr.adf)) vink("adf", "documentinvoer");
  if (wil("display") && ja(pr.display)) vink("display", "display");
  if (wil("bluetooth") && ja(pr.bluetooth)) vink("bluetooth", "bluetooth");
  zochtRegel(p, delen);

  // 2. Wat deze kaart onderscheidt binnen de lijst
  vergelijk(p, ctx, "zwart", ppm(pr.printsnelheidZwart), {
    laagBeter: false, overtreffend: "snelste", onderwerp: "snelheid",
    fmt: (x) => `<strong>${getal(x)} pagina's per minuut</strong>`,
  });
  prijsPunten(p, pr, ctx);

  // 3. Inkt vertaald naar de kosten
  if (tank) p.voeg(30, "inkt", `<strong>Navulbare inkttanks</strong>: veel lagere kosten per pagina dan cartridges`);

  // 4. Kenmerken waar niet om gevraagd is, en het vangnet
  if (ja(pr.duplex)) p.voeg(40, "duplex", `<strong>Dubbelzijdig printen</strong> zonder omdraaien`);
  if (ja(pr.wifi)) p.voeg(41, "wifi", `<strong>Wifi</strong>: printen vanaf je telefoon of laptop`);
  if (ja(pr.scannen) && ja(pr.kopieren)) p.voeg(42, "aio", `<strong>All-in-one</strong>: printen, scannen en kopiëren`);
  if (ja(pr.adf)) p.voeg(43, "adf", `<strong>Automatische documentinvoer</strong> voor stapels papier`);
  if (Number.isFinite(ppm(pr.printsnelheidZwart))) p.voeg(90, "snelheid", `<strong>${getal(ppm(pr.printsnelheidZwart))} pagina's per minuut</strong> in zwart-wit`);
  if (pr.printtechnologie) p.voeg(91, "techniek", `<strong>${esc(pr.printtechnologie)}</strong>printer`.replace("</strong>printer", "</strong>-printer"));
  p.voeg(92, "kleur", ja(pr.kanKleurenPrinten) ? `Print in <strong>kleur</strong>` : `Print in <strong>zwart-wit</strong>`);
  if (pr.merk) p.voeg(93, "merk", `Van <strong>${esc(pr.merk)}</strong>`);
  winkelVangnet(p, pr);
  return p.top4();
}

export function buildSpecChips(pr) {
  const specs = [];
  if (pr.printtechnologie) specs.push(pr.printtechnologie);
  if (pr.gebruikType) specs.push(GEBRUIK_LABEL[pr.gebruikType] ?? pr.gebruikType);
  if (pr.printsnelheidZwart) specs.push(`${pr.printsnelheidZwart} ppm`);
  if (pr.kanKleurenPrinten === "Ja") specs.push("Kleur");
  return specs;
}

export function buildAlleSpecs(pr, raw) {
  return schoonSpecs([
    { titel: "Printen", rijen: [
      ["Techniek", pr.printtechnologie], ["Kleur", pr.kanKleurenPrinten], ["Inktkleuren", pr.printkleuren],
      ["Snelheid zwart", Number.isFinite(ppm(pr.printsnelheidZwart)) ? `${ppm(pr.printsnelheidZwart)} pagina's/min` : null],
      ["Snelheid kleur", Number.isFinite(ppm(pr.printsnelheidKleur)) ? `${ppm(pr.printsnelheidKleur)} pagina's/min` : null],
      ["Dubbelzijdig", pr.duplex],
    ] },
    { titel: "Functies", rijen: [
      ["Scannen", pr.scannen], ["Kopiëren", pr.kopieren], ["Faxen", pr.faxen], ["Documentinvoer", pr.adf], ["Display", pr.display],
    ] },
    { titel: "Verbinding en overig", rijen: [
      ["Wifi", pr.wifi], ["Bluetooth", pr.bluetooth], ["Bedoeld voor", pr.marktPositionering],
      ["Kleur behuizing", pr.kleur], ["Merk", pr.merk], ["EAN", raw?.ean],
    ] },
  ]);
}
