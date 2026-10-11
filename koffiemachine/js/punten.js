// koffiemachine/js/punten.js — kaartinhoud voor resultaat- en favorietenpagina.
// Zelfde opzet als koelkast/js/punten.js; bouwstenen in shared/punten-basis.js.

import {
  esc, getal, ja, opsomming,
  maakContext, vergelijk, zochtRegel, puntenLijst, prijsPunten, winkelVangnet, schoonSpecs,
} from "../../shared/punten-basis.js";
import { WATERTANK_MAX, MELK_AUTOMATISCH_WAARDEN } from "./data.js";
import { classificeerType } from "./matching.js";

const TYPE_TEKST = {
  volautomaat: "volautomaat",
  halfautomaat: "halfautomaat",
  capsules: "capsules of pads",
  filter: "filterkoffie",
};
const HOEVEELHEID = { klein: "1 tot 2 personen", gemiddeld: "een gemiddeld huishouden", groot: "een groot huishouden of veel bezoek" };

export function buildContext(lijst, naam) {
  return maakContext(lijst, naam, {
    tank: (p) => p.capaciteitWatertankL ?? NaN,
    bar: (p) => (p.maxWerkdrukBar > 1 ? p.maxWerkdrukBar : NaN),
    bonen: (p) => p.boonreservoirGram ?? NaN,
    varianten: (p) => (Array.isArray(p.varianten) && p.varianten.length ? p.varianten.length : NaN),
  });
}

const tankKlopt = (k, hoeveelheid, type) => {
  const l = k.capaciteitWatertankL;
  const t = WATERTANK_MAX[type] ?? WATERTANK_MAX.volautomaat;
  if (!Number.isFinite(l)) return false;
  return (hoeveelheid === "klein" && l <= t.klein)
    || (hoeveelheid === "gemiddeld" && l > t.klein && l <= t.gemiddeld)
    || (hoeveelheid === "groot" && l > t.gemiddeld);
};

/** "Waarom dit bij jou past": precies 4 punten. */
export function buildResultPoints(k, answers, ctx) {
  const p = puntenLijst();
  const a = answers || {};
  const wensen = Array.isArray(a.extraAnswers) ? a.extraAnswers : [];
  const wil = (x) => wensen.includes(x);
  const varianten = Array.isArray(k.varianten) ? k.varianten : [];

  // 1. Alle vervulde keuzes in één regel
  const delen = [];
  const vink = (onderwerp, tekst) => { delen.push(`<strong>${tekst}</strong>`); p.gebruikt.add(onderwerp); };
  if (a.type && classificeerType(k) === a.type) vink("type", TYPE_TEKST[a.type]);
  if (a.melk === "automatisch" && MELK_AUTOMATISCH_WAARDEN.has(k.melkToevoegen)) vink("melk", "melk automatisch opgeschuimd");
  else if (a.melk === "handmatig" && ja(k.melkopschuimer)) vink("melk", "melkopschuimer");
  if (wil("touchbediening") && String(k.bediening ?? "").includes("Touch")) vink("bediening", "touchbediening");
  if (wil("wifi") && ja(k.wifi)) vink("wifi", "bediening via app");
  if (wil("antikalk") && ja(k.automatischAntikalk)) vink("antikalk", "ontkalkt zelf");
  if (wil("thee") && varianten.includes("Thee")) vink("thee", "zet ook thee");
  zochtRegel(p, delen);

  // 2. Wat deze kaart onderscheidt binnen de lijst
  vergelijk(p, ctx, "varianten", varianten.length || NaN, {
    laagBeter: false, overtreffend: "meeste", onderwerp: "varianten",
    fmt: (x) => `<strong>${getal(x)} soorten koffie</strong>`,
  });
  vergelijk(p, ctx, "tank", k.capaciteitWatertankL ?? NaN, {
    laagBeter: false, overtreffend: "grootste", onderwerp: "tank",
    fmt: (x) => `<strong>${getal(x, 1)} liter</strong> watertank`,
  });
  vergelijk(p, ctx, "bonen", k.boonreservoirGram ?? NaN, {
    laagBeter: false, overtreffend: "grootste", onderwerp: "bonen",
    fmt: (x) => `<strong>${getal(x)} gram</strong> bonenreservoir`,
  });
  prijsPunten(p, k, ctx);

  // 3. Watertank vertaald naar het eigen huishouden
  if (HOEVEELHEID[a.hoeveelheid] && tankKlopt(k, a.hoeveelheid, a.type)) {
    p.voeg(30, "tank", `<strong>${getal(k.capaciteitWatertankL, 1)} liter</strong> watertank: past bij ${HOEVEELHEID[a.hoeveelheid]}`);
  }

  // 4. Kenmerken waar niet om gevraagd is, en het vangnet
  if (varianten.length >= 3) p.voeg(40, "varianten", `Maakt <strong>${opsomming(varianten.slice(0, 3).map((v) => v.toLowerCase()))}</strong>${varianten.length > 3 ? ` en nog ${varianten.length - 3} andere soorten` : ""}`);
  if (ja(k.zelfreinigend)) p.voeg(41, "reinigen", `<strong>Reinigt zichzelf</strong>`);
  if (ja(k.automatischAntikalk)) p.voeg(42, "antikalk", `<strong>Ontkalkt automatisch</strong>`);
  if (ja(k.ingebouwdeMolen)) p.voeg(43, "molen", `<strong>Ingebouwde molen</strong>: elke kop vers gemalen`);
  if (k.capsuleSysteem) p.voeg(44, "systeem", `Werkt met <strong>${esc(k.capsuleSysteem)}</strong>`);
  if (Number.isFinite(k.capaciteitWatertankL)) p.voeg(90, "tank", `<strong>${getal(k.capaciteitWatertankL, 1)} liter</strong> watertank`);
  if (k.typeProduct) p.voeg(91, "type", `<strong>${esc(k.typeProduct)}</strong>`);
  if (k.merk) p.voeg(92, "merk", `Van <strong>${esc(k.merk)}</strong>`);
  if (ja(k.melkopschuimer)) p.voeg(93, "melk", `<strong>Melkopschuimer</strong> voor cappuccino`);
  winkelVangnet(p, k);
  return p.top4();
}

export function buildSpecChips(k) {
  const specs = [];
  if (k.typeProduct) specs.push(k.typeProduct);
  if (k.capaciteitWatertankL !== null && k.capaciteitWatertankL !== undefined) specs.push(`${k.capaciteitWatertankL} l`);
  if (k.merk) specs.push(k.merk);
  return specs;
}

export function buildAlleSpecs(k, raw) {
  const r = raw || {};
  const mm = (v) => (Number(v) > 0 ? `${getal(Number(v) / 10, 1)} cm` : null);
  return schoonSpecs([
    { titel: "Koffie", rijen: [
      ["Type", k.typeProduct], ["Bediening", k.automatiseringsgraad], ["Invoer", k.koffieInvoertype],
      ["Capsulesysteem", k.capsuleSysteem], ["Ingebouwde molen", k.ingebouwdeMolen],
      ["Soorten koffie", Array.isArray(k.varianten) ? k.varianten.join(", ") : null],
      ["Kopjes tegelijk", k.capaciteitKopjes],
      ["Druk", k.maxWerkdrukBar > 1 ? `${getal(k.maxWerkdrukBar)} bar` : null],
    ] },
    { titel: "Melk en water", rijen: [
      ["Melkopschuimer", k.melkopschuimer], ["Melk toevoegen", k.melkToevoegen], ["Melkreservoir", k.melkreservoir],
      ["Watertank", Number.isFinite(k.capaciteitWatertankL) ? `${getal(k.capaciteitWatertankL, 1)} liter` : null],
      ["Bonenreservoir", Number.isFinite(k.boonreservoirGram) ? `${getal(k.boonreservoirGram)} gram` : null],
    ] },
    { titel: "Gemak", rijen: [
      ["Bediening", k.bediening], ["Display", k.display], ["Wifi/app", k.wifi],
      ["Zelfreinigend", k.zelfreinigend], ["Automatisch ontkalken", k.automatischAntikalk],
    ] },
    { titel: "Afmetingen en overig", rijen: [
      ["Hoogte", mm(r.hoogte)], ["Breedte", mm(r.breedte)], ["Diepte", mm(r.diepte)],
      ["Gewicht", Number.isFinite(k.gewichtKg) ? `${getal(k.gewichtKg, 1)} kg` : null],
      ["Vermogen", Number.isFinite(k.vermogenWatt) ? `${getal(k.vermogenWatt)} watt` : null],
      ["Kleur", k.kleur], ["Merk", k.merk], ["EAN", r.ean],
    ] },
  ]);
}
