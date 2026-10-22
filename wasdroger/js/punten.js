// wasdroger/js/punten.js — kaartinhoud voor resultaat- en favorietenpagina.
// Zelfde opzet als koelkast/js/punten.js; bouwstenen in shared/punten-basis.js.

import {
  esc, getal, cm, opsomming, ja, maten,
  maakContext, vergelijk, zochtRegel, energiePunt, puntenLijst, prijsPunten, winkelVangnet, schoonSpecs,
} from "../../shared/punten-basis.js";
import { heeftDroogprogramma, isCapaciteitInGroup, DROOGPROGRAMMA_DEFINITIES } from "./data.js";
import { STIL_DREMPEL } from "./matching.js";

export function buildContext(lijst, naam) {
  return maakContext(lijst, naam, {
    geluid: (p) => p.geluidDb,
    duur: (p) => p.cyclusDuurMin,
    capaciteit: (p) => p.capaciteit,
  });
}

const HUISHOUDEN = { klein: "1 tot 2 personen", gemiddeld: "3 tot 4 personen", groot: "5 personen of meer" };

/** "Waarom dit bij jou past": precies 4 punten. */
export function buildResultPoints(w, answers, ctx) {
  const p = puntenLijst();
  const a = answers || {};
  const wensen = Array.isArray(a.extraAnswers) ? a.extraAnswers : [];
  const wil = (x) => wensen.includes(x);

  // 1. Alle vervulde keuzes in één regel
  const delen = [];
  const vink = (onderwerp, tekst) => { delen.push(`<strong>${tekst}</strong>`); p.gebruikt.add(onderwerp); };
  if (a.stil === "ja" && Number.isFinite(w.geluidDb) && w.geluidDb <= STIL_DREMPEL) vink("geluid-wens", `stil (${getal(w.geluidDb)} dB)`);
  if (wil("zuinig") && w.energieLabel === "A") vink("energie-wens", "energielabel A");
  if (wil("app") && w.app === true) vink("wifi", "bediening via app");
  const programmas = (a.programmaAnswers || [])
    .filter((key) => key !== "geen" && heeftDroogprogramma(w.droogprogrammas, key))
    .map((key) => DROOGPROGRAMMA_DEFINITIES.find((d) => d.key === key)?.label.toLowerCase())
    .filter(Boolean);
  if (programmas.length) vink("programmas", `${programmas.length > 1 ? "programma's" : "programma"} voor ${opsomming(programmas)}`);
  zochtRegel(p, delen);

  // 2. Wat deze kaart onderscheidt binnen de lijst
  vergelijk(p, ctx, "geluid", w.geluidDb, {
    laagBeter: true, overtreffend: "stilste", fmt: (x) => `<strong>${getal(x)} dB</strong>`,
    gemMin: 2, gemTekst: (d) => `${getal(d)} dB stiller dan gemiddeld`,
  });
  vergelijk(p, ctx, "duur", w.cyclusDuurMin, {
    laagBeter: true, overtreffend: "snelste", fmt: (x) => `<strong>${getal(x)} minuten</strong> per droogbeurt`,
    gemMin: 20, gemTekst: (d) => `${getal(Math.round(d / 5) * 5)} minuten sneller dan gemiddeld`,
  });
  energiePunt(p, ctx, w.energieLabel);
  prijsPunten(p, w, ctx);

  // 3. Capaciteit vertaald naar het eigen huishouden. De groep staat niet
  // in de antwoorden maar apart in localStorage (zie vragen.js).
  const groep = answers ? (a.capaciteitGroup ?? localStorage.getItem("wasdroger_selectedCapaciteitGroup")) : null;
  if (HUISHOUDEN[groep] && isCapaciteitInGroup(w.capaciteit, groep)) {
    p.voeg(30, "capaciteit", `<strong>${getal(w.capaciteit, 1)} kg</strong>: past bij een huishouden van ${HUISHOUDEN[groep]}`);
  }

  // 4. Kenmerken waar niet om gevraagd is, en het vangnet
  // Bijna elke droger heeft een warmtepomp: daarom pas in het vangnet.
  if (w.droogsysteem === "Warmtepomp") p.voeg(95, "systeem", `<strong>Warmtepomp</strong>: het zuinigste droogsysteem`);
  if (ja(w.vochtsensor)) p.voeg(41, "vochtsensor", `<strong>Vochtsensor</strong>: stopt zodra de was droog is`);
  if (ja(w.antikreuk)) p.voeg(42, "antikreuk", `<strong>Anti-kreuk</strong>: minder strijken na het drogen`);
  if (Number.isFinite(w.capaciteit)) p.voeg(90, "capaciteit", `<strong>${getal(w.capaciteit, 1)} kg</strong> droogcapaciteit`);
  if (w.energieLabel) p.voeg(91, "energie", `<strong>Energielabel ${esc(w.energieLabel)}</strong>`);
  if (Number.isFinite(w.geluidDb)) p.voeg(92, "geluid", `<strong>${getal(w.geluidDb)} dB</strong> geluidsniveau`);
  if (w.droogsysteem) p.voeg(95, "systeem", `Droogsysteem: <strong>${esc(w.droogsysteem)}</strong>`);
  if (w.merk) p.voeg(93, "merk", `Van <strong>${esc(w.merk)}</strong>`);
  p.voeg(94, "maat", maten(w.hoogteMm, w.breedteMm, w.diepteMm));
  winkelVangnet(p, w);
  return p.top4();
}

export function buildSpecChips(w) {
  const specs = [];
  if (w.capaciteit) specs.push(`${w.capaciteit} kg`);
  if (w.droogsysteem) specs.push(w.droogsysteem);
  if (w.energieLabel) specs.push(`Energielabel ${w.energieLabel}`);
  if (w.geluidDb) specs.push(`${w.geluidDb} dB`);
  return specs;
}

export function buildAlleSpecs(w, raw) {
  const mm = (n) => (Number.isFinite(n) && n > 0 ? `${cm(n)} cm` : null);
  return schoonSpecs([
    { titel: "Afmetingen", rijen: [["Hoogte", mm(w.hoogteMm)], ["Breedte", mm(w.breedteMm)], ["Diepte", mm(w.diepteMm)]] },
    { titel: "Drogen", rijen: [
      ["Capaciteit", Number.isFinite(w.capaciteit) ? `${getal(w.capaciteit, 1)} kg` : null],
      ["Droogsysteem", w.droogsysteem],
      ["Duur droogbeurt", Number.isFinite(w.cyclusDuurMin) ? `${getal(w.cyclusDuurMin)} minuten` : null],
      ["Programma's", w.droogprogrammas],
    ] },
    { titel: "Verbruik en geluid", rijen: [
      ["Energielabel", w.energieLabel],
      ["Geluid", Number.isFinite(w.geluidDb) ? `${getal(w.geluidDb)} dB` : null],
      ["Invertermotor", w.inverter],
    ] },
    { titel: "Functies", rijen: [
      ["Vochtsensor", w.vochtsensor], ["Anti-kreuk", w.antikreuk], ["Wifi/app", w.wifi],
      ["Uitgestelde start", w.uitgesteldeStart], ["Kinderslot", w.kinderslot],
      ["Plaatsing", w.plaatsing], ["Kleur", w.kleur],
      ["Merk", w.merk], ["EAN", raw?.ean],
    ] },
  ]);
}
