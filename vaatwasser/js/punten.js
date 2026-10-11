// vaatwasser/js/punten.js — kaartinhoud voor resultaat- en favorietenpagina.
// Zelfde opzet als koelkast/js/punten.js; bouwstenen in shared/punten-basis.js.

import {
  esc, getal, cm, opsomming, ja, maten,
  maakContext, vergelijk, zochtRegel, energiePunt, puntenLijst, prijsPunten, winkelVangnet, schoonSpecs,
} from "../../shared/punten-basis.js";
import { gezinsgrootteMinCouverts, GELUID_BELANGRIJK_FALLBACK_DB, GELUID_GEMIDDELD_DB } from "./data.js";
import { heeftAfwasprogramma } from "./matching.js";

const PROGRAMMA_LABELS = { eco: "eco", intensief: "intensief", snel: "snel", stil: "stil", voorwas: "voorwas", glas: "glas" };
const STIL_DB = { belangrijk: GELUID_BELANGRIJK_FALLBACK_DB, gemiddeld: GELUID_GEMIDDELD_DB };
const ZUINIG = { belangrijk: ["A", "B", "C"], gemiddeld: ["A", "B", "C", "D"] };
const HUISHOUDEN = { klein: "1 tot 2 personen", gemiddeld: "3 tot 4 personen", groot: "5 personen of meer" };

export function buildContext(lijst, naam) {
  return maakContext(lijst, naam, {
    geluid: (p) => p.geluidDb,
    couverts: (p) => p.couverts,
    duur: (p) => p.cyclusDuurMin,
  });
}

/** "Waarom dit bij jou past": precies 4 punten. */
export function buildResultPoints(v, answers, ctx) {
  const p = puntenLijst();
  const a = answers || {};
  const wensen = Array.isArray(a.extraAnswers) ? a.extraAnswers : [];
  const wil = (x) => wensen.includes(x);

  // 1. Alle vervulde keuzes in één regel
  const delen = [];
  const vink = (onderwerp, tekst) => { delen.push(`<strong>${tekst}</strong>`); p.gebruikt.add(onderwerp); };
  if (a.plaatsing && a.plaatsing === v.plaatsing) vink("plaatsing", v.plaatsing === "inbouw" ? "inbouw" : "vrijstaand");
  if (STIL_DB[a.geluid] && Number.isFinite(v.geluidDb) && v.geluidDb <= STIL_DB[a.geluid]) vink("geluid-wens", "stil");
  if (ZUINIG[a.energie]?.includes(v.energieLabel)) vink("energie-wens", "zuinig");
  if (wil("halve-lading") && ja(v.halveLading)) vink("halve", "halve lading");
  if (wil("verstelbare-bovenkorf") && ja(v.verstelbareBovenkorf)) vink("korf", "verstelbare bovenkorf");
  if (wil("aquastop") && ja(v.aquastop)) vink("aquastop", "AquaStop");
  if (wil("wifi") && ja(v.wifi)) vink("wifi", "bediening via app");
  if (wil("kinderslot") && ja(v.kinderslot)) vink("kinderslot", "kinderslot");
  if (wil("inverter") && ja(v.inverter)) vink("inverter", "invertermotor");
  if (wil("glasbescherming") && ja(v.glasbescherming)) vink("glas", "glasbescherming");
  if (wil("extra-droog") && v.droogprestaties === "A") vink("droog", "extra droge vaat");
  const programmas = (a.programmaAnswers || [])
    .filter((key) => key !== "geen" && heeftAfwasprogramma(v.afwasprogrammas, key))
    .map((key) => PROGRAMMA_LABELS[key])
    .filter(Boolean);
  if (programmas.length) vink("programmas", `${programmas.length > 1 ? "programma's" : "programma"} ${opsomming(programmas)}`);
  zochtRegel(p, delen);

  // 2. Wat deze kaart onderscheidt binnen de lijst
  vergelijk(p, ctx, "geluid", v.geluidDb, {
    laagBeter: true, overtreffend: "stilste", fmt: (x) => `<strong>${getal(x)} dB</strong>`,
    gemMin: 2, gemTekst: (d) => `${getal(d)} dB stiller dan gemiddeld`,
  });
  vergelijk(p, ctx, "couverts", v.couverts, {
    laagBeter: false, overtreffend: "ruimste", fmt: (x) => `<strong>${getal(x)} couverts</strong>`,
  });
  vergelijk(p, ctx, "duur", v.cyclusDuurMin, {
    laagBeter: true, overtreffend: "snelste", fmt: (x) => `<strong>${getal(x)} minuten</strong> programmaduur`,
  });
  energiePunt(p, ctx, v.energieLabel);
  prijsPunten(p, v, ctx);

  // 3. Couverts vertaald naar het eigen huishouden
  const min = gezinsgrootteMinCouverts[a.gezinsgrootte];
  if (HUISHOUDEN[a.gezinsgrootte] && Number.isFinite(v.couverts) && min > 0 && v.couverts >= min) {
    p.voeg(30, "couverts", `<strong>${getal(v.couverts)} couverts</strong>: genoeg voor ${HUISHOUDEN[a.gezinsgrootte]}`);
  }

  // 4. Kenmerken waar niet om gevraagd is, en het vangnet
  if (ja(v.automatischeDeuropening)) p.voeg(40, "deur", `<strong>Deur gaat vanzelf open</strong> na het programma: drogere vaat`);
  if (ja(v.aquastop)) p.voeg(41, "aquastop", `<strong>AquaStop</strong> tegen waterschade`);
  if (ja(v.verstelbareBovenkorf)) p.voeg(42, "korf", `<strong>Verstelbare bovenkorf</strong> voor grote borden`);
  if (Number.isFinite(v.couverts)) p.voeg(90, "couverts", `<strong>${getal(v.couverts)} couverts</strong>`);
  if (v.energieLabel) p.voeg(91, "energie", `<strong>Energielabel ${esc(v.energieLabel)}</strong>`);
  if (Number.isFinite(v.geluidDb)) p.voeg(92, "geluid", `<strong>${getal(v.geluidDb)} dB</strong> geluidsniveau`);
  if (v.merk) p.voeg(93, "merk", `Van <strong>${esc(v.merk)}</strong>`);
  p.voeg(94, "plaatsing", `<strong>${esc(v.plaatsingDetail || (v.plaatsing === "inbouw" ? "Inbouw" : "Vrijstaand"))}</strong>`);
  p.voeg(95, "maat", maten(v.hoogteMm, v.breedteMm, v.diepteMm));
  winkelVangnet(p, v);
  return p.top4();
}

export function buildSpecChips(v) {
  const specs = [];
  if (v.couverts) specs.push(`${v.couverts} couverts`);
  if (v.plaatsing) specs.push(v.plaatsing === "inbouw" ? "Inbouw" : "Vrijstaand");
  if (v.energieLabel) specs.push(`Energielabel ${v.energieLabel}`);
  if (v.geluidDb) specs.push(`${v.geluidDb} dB`);
  return specs;
}

export function buildAlleSpecs(v, raw) {
  const mm = (n) => (Number.isFinite(n) && n > 0 ? `${cm(n)} cm` : null);
  return schoonSpecs([
    { titel: "Afmetingen", rijen: [
      ["Hoogte", mm(v.hoogteMm)], ["Breedte", mm(v.breedteMm)], ["Diepte", mm(v.diepteMm)],
      ["Plaatsing", v.plaatsingDetail],
    ] },
    { titel: "Afwassen", rijen: [
      ["Couverts", v.couverts],
      ["Programmaduur", Number.isFinite(v.cyclusDuurMin) ? `${getal(v.cyclusDuurMin)} minuten` : null],
      ["Programma's", v.afwasprogrammas],
      ["Droogsysteem", v.droogsysteem],
      ["Droogklasse", /^[A-G]$/.test(v.droogprestaties ?? "") ? v.droogprestaties : null],
    ] },
    { titel: "Verbruik en geluid", rijen: [
      ["Energielabel", v.energieLabel],
      ["Geluid", Number.isFinite(v.geluidDb) ? `${getal(v.geluidDb)} dB` : null],
      ["Invertermotor", v.inverter],
    ] },
    { titel: "Functies", rijen: [
      ["Bestek", v.bestekType], ["Verstelbare bovenkorf", v.verstelbareBovenkorf], ["Halve lading", v.halveLading],
      ["AquaStop", v.aquastop], ["Deur gaat vanzelf open", v.automatischeDeuropening], ["Glasbescherming", v.glasbescherming],
      ["Wifi/app", v.wifi], ["Kinderslot", v.kinderslot], ["Lampje op de vloer", v.vloerlampje],
      ["Merk", v.merk], ["EAN", raw?.ean],
    ] },
  ]);
}
