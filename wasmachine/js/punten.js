// wasmachine/js/punten.js — kaartinhoud voor resultaat- en favorietenpagina.
// Zelfde opzet als koelkast/js/punten.js; bouwstenen in shared/punten-basis.js.

import {
  esc, getal, cm, opsomming, ja, maten,
  maakContext, vergelijk, zochtRegel, energiePunt, puntenLijst, prijsPunten, winkelVangnet, schoonSpecs,
} from "../../shared/punten-basis.js";
import { heeftWasprogramma, isCapaciteitInGroup, WASPROGRAMMA_DEFINITIES } from "./data.js";

export function buildContext(lijst, naam) {
  return maakContext(lijst, naam, {
    geluid: (p) => p.geluidDb,
    toeren: (p) => p.centrifugeRpm || NaN,
    capaciteit: (p) => p.capaciteit,
  });
}

const HUISHOUDEN = { klein: "1 tot 2 personen", gemiddeld: "3 tot 4 personen", groot: "5 personen of meer" };

// Zelfde grenzen als applyGeluidFilter() in matching.js.
const STIL_DB = { belangrijk: 68, gemiddeld: 74 };

/** "Waarom dit bij jou past": precies 4 punten. */
export function buildResultPoints(w, answers, ctx) {
  const p = puntenLijst();
  const a = answers || {};
  const wensen = Array.isArray(a.extraAnswers) ? a.extraAnswers : [];
  const wil = (x) => wensen.includes(x);

  // 1. Alle vervulde keuzes in één regel
  const delen = [];
  const vink = (onderwerp, tekst) => { delen.push(`<strong>${tekst}</strong>`); p.gebruikt.add(onderwerp); };
  if (STIL_DB[a.geluid] && Number.isFinite(w.geluidDb) && w.geluidDb <= STIL_DB[a.geluid]) vink("geluid-wens", "stil");
  if (wil("energiezuinig") && ["A", "B", "C"].includes(w.energieLabel)) vink("energie-wens", "zuinig");
  if (wil("bovenlader") && w.typeLader === "Bovenlader") vink("lader", "bovenlader");
  if (wil("uitgestelde-start") && ja(w.uitgesteldeStart)) vink("uitgesteld", "uitgestelde start");
  if (wil("kinderslot") && ja(w.kinderslot)) vink("kinderslot", "kinderslot");
  if (wil("aquastop") && ja(w.aquastop)) vink("aquastop", "AquaStop");
  if (wil("inverter") && ja(w.inverter)) vink("inverter", "invertermotor");
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
  if (w.centrifugeRpm >= 1400) p.voeg(40, "toeren", `<strong>${getal(w.centrifugeRpm)} toeren</strong>: je was komt droger uit de machine`);
  if (ja(w.inverter)) p.voeg(41, "inverter", `<strong>Invertermotor</strong>: stiller en gaat langer mee`);
  if (ja(w.aquastop)) p.voeg(42, "aquastop", `<strong>AquaStop</strong> tegen waterschade`);
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
      ["Invertermotor", w.inverter],
    ] },
    { titel: "Functies", rijen: [
      ["Uitgestelde start", w.uitgesteldeStart], ["Kinderslot", w.kinderslot], ["AquaStop", w.aquastop],
      ["Display", w.display], ["Plaatsing", w.plaatsing], ["Kleur", w.kleur],
      ["Merk", w.merk], ["EAN", raw?.ean],
    ] },
  ]);
}
