// wasmachine/js/punten.js — kaartinhoud voor resultaat- en favorietenpagina.
// Zelfde opzet als koelkast/js/punten.js; bouwstenen in shared/punten-basis.js.

import {
  esc, getal, cm, opsomming, ja, maten,
  maakContext, vergelijk, zochtRegel, energiePunt, puntenLijst, prijsPunten, winkelVangnet, schoonSpecs,
} from "../../shared/punten-basis.js";
import { heeftWasprogramma, isCapaciteitInGroup, WASPROGRAMMA_DEFINITIES } from "./data.js";
import { STIL_DREMPEL } from "./matching.js";

const DROOG = { A: "komt het droogst uit de trommel", B: "komt goed droog uit de trommel" };

export function buildContext(lijst, naam) {
  return maakContext(lijst, naam, {
    geluid: (p) => p.geluidDb,
    toeren: (p) => p.centrifugeRpm || NaN,
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
  if (a.stil === "ja" && Number.isFinite(w.geluidDb) && w.geluidDb <= STIL_DREMPEL) vink("geluid-wens", "stil");
  if (a.droog === "ja" && w.droogklasse === "A") vink("droog", "droogklasse A");
  if (wil("dosering") && w.dosering === true) vink("dosering", "automatische dosering");
  if (wil("stoom") && w.stoom === true) vink("stoom", "stoomfunctie");
  if (wil("app") && w.app === true) vink("app", "bediening met app");
  if (wil("aquastop") && w.lekbeveiliging === true) vink("aquastop", "AquaStop");
  const programmas = (a.programmaAnswers || [])
    .filter((key) => key !== "geen" && heeftWasprogramma(w.wasprogrammas, key))
    .map((key) => WASPROGRAMMA_DEFINITIES.find((d) => d.key === key)?.label.toLowerCase())
    .filter(Boolean);
  if (programmas.length) vink("programmas", `${programmas.length > 1 ? "programma's" : "programma"} voor ${opsomming(programmas)}`);
  zochtRegel(p, delen);

  // 2. Wat deze kaart onderscheidt binnen de lijst
  vergelijk(p, ctx, "geluid", w.geluidDb, {
    laagBeter: true, overtreffend: "stilste", fmt: (x) => `<strong>${getal(x)} dB</strong> bij centrifugeren`,
    gemMin: 2, gemTekst: (d) => `${getal(d)} dB stiller dan gemiddeld`,
  });
  vergelijk(p, ctx, "toeren", w.centrifugeRpm || NaN, {
    laagBeter: false, overtreffend: "snelst centrifugerende", onderwerp: "toeren",
    fmt: (x) => `<strong>${getal(x)} toeren</strong>`,
  });
  energiePunt(p, ctx, w.energieLabel);
  prijsPunten(p, w, ctx);

  // 3. Capaciteit vertaald naar het eigen huishouden. De groep staat niet
  // in de antwoorden maar apart in localStorage (zie vragen.js).
  const groep = answers ? (a.capaciteitGroup ?? localStorage.getItem("wasmachine_selectedCapaciteitGroup")) : null;
  if (HUISHOUDEN[groep] && isCapaciteitInGroup(w.capaciteit, groep)) {
    p.voeg(30, "capaciteit", `<strong>${getal(w.capaciteit, 1)} kg</strong>: past bij een huishouden van ${HUISHOUDEN[groep]}`);
  }

  // 4. Kenmerken waar niet om gevraagd is, en het vangnet
  if (DROOG[w.droogklasse]) p.voeg(39, "droog", `<strong>Droogklasse ${esc(w.droogklasse)}</strong>: je was ${DROOG[w.droogklasse]}`);
  if (w.dosering === true) p.voeg(43, "dosering", `<strong>Automatische dosering</strong>: zuinig met wasmiddel`);
  if (w.stoom === true) p.voeg(44, "stoom", `<strong>Stoomfunctie</strong> tegen kreukels en geurtjes`);
  if (w.centrifugeRpm >= 1400) p.voeg(40, "droog", `<strong>${getal(w.centrifugeRpm)} toeren</strong>: je was komt droger uit de machine`);   // zelfde onderwerp als de droogklasse: niet allebei
  if (ja(w.inverter)) p.voeg(41, "inverter", `<strong>Invertermotor</strong>: stiller en gaat langer mee`);
  if (w.lekbeveiliging === true || ja(w.aquastop)) p.voeg(42, "aquastop", `<strong>AquaStop</strong> tegen waterschade`);
  if (Number.isFinite(w.capaciteit)) p.voeg(90, "capaciteit", `<strong>${getal(w.capaciteit, 1)} kg</strong> wascapaciteit`);
  if (w.energieLabel) p.voeg(91, "energie", `<strong>Energielabel ${esc(w.energieLabel)}</strong>`);
  if (Number.isFinite(w.geluidDb)) p.voeg(92, "geluid", `<strong>${getal(w.geluidDb)} dB</strong> bij centrifugeren`);
  if (w.merk) p.voeg(93, "merk", `Van <strong>${esc(w.merk)}</strong>`);
  p.voeg(94, "maat", maten(w.hoogteMm, w.breedteMm, w.diepteMm));
  winkelVangnet(p, w);
  return p.top4();
}

export function buildSpecChips(w) {
  const specs = [];
  if (w.capaciteit) specs.push(`${w.capaciteit} kg`);
  if (w.typeLader) specs.push(w.typeLader);
  if (w.centrifugeRpm) specs.push(`${w.centrifugeRpm} RPM`);
  if (w.energieLabel) specs.push(`Energielabel ${w.energieLabel}`);
  if (w.geluidDb) specs.push(`${w.geluidDb} dB`);
  return specs;
}

const janee = (v) => (v === true ? "Ja" : v === false ? "Nee" : null);

export function buildAlleSpecs(w, raw) {
  const mm = (n) => (Number.isFinite(n) && n > 0 ? `${cm(n)} cm` : null);
  return schoonSpecs([
    { titel: "Afmetingen", rijen: [["Hoogte", mm(w.hoogteMm)], ["Breedte", mm(w.breedteMm)], ["Diepte", mm(w.diepteMm)]] },
    { titel: "Wassen", rijen: [
      ["Capaciteit", Number.isFinite(w.capaciteit) ? `${getal(w.capaciteit, 1)} kg` : null],
      ["Type", w.typeLader],
      ["Toerental", w.centrifugeRpm ? `${getal(w.centrifugeRpm)} toeren` : null],
      ["Programma's", w.wasprogrammas],
    ] },
    { titel: "Verbruik en geluid", rijen: [
      ["Energielabel", w.energieLabel],
      ["Geluid (centrifugeren)", Number.isFinite(w.geluidDb) ? `${getal(w.geluidDb)} dB` : null],
      ["Droogklasse", w.droogklasse ? `${w.droogklasse} (A is het droogst)` : null],
      // Alleen "Ja" tonen: bij een deel van de merken staat het niet vermeld,
      // en dat is geen nee.
      ["Invertermotor", ja(w.inverter) ? "Ja" : null],
    ] },
    { titel: "Functies", rijen: [
      ["Automatische dosering", janee(w.dosering)], ["Stoomfunctie", janee(w.stoom)], ["Bediening met app", janee(w.app)],
      ["AquaStop", janee(w.lekbeveiliging)],
      ["Uitgestelde start", ja(w.uitgesteldeStart) ? "Ja" : null], ["Kinderslot", ja(w.kinderslot) ? "Ja" : null],
      ["Display", w.display], ["Plaatsing", w.plaatsing], ["Kleur", w.kleur],
      ["Merk", w.merk], ["EAN", raw?.ean],
    ] },
  ]);
}
