// koffiemachine/js/punten.js — kaartinhoud voor resultaat- en favorietenpagina.
// Zelfde opzet als koelkast/js/punten.js; bouwstenen in shared/punten-basis.js.

import {
  esc, getal, ja, opsomming,
  maakContext, vergelijk, zochtRegel, puntenLijst, prijsPunten, winkelVangnet, schoonSpecs,
} from "../../shared/punten-basis.js";
import { SYSTEEM_LABEL } from "./data.js";
import { heeftWens, wensenVan } from "./matching.js";

const TYPE_TEKST = {
  volautomaat: "volautomaat",
  halfautomaat: "halfautomaat",
  capsules: "capsules of pads",
  filter: "filterkoffie",
};
const WENS_TEKST = {
  "melk-auto": "cappuccino op één knop", "melk-stoom": "melk opschuimen", melk: "ook cappuccino", molen: "ingebouwde bonenmaler",
  "zonder-molen": "voor gemalen koffie", tweekopjes: "twee kopjes tegelijk", app: "bediening met de app",
  dranken: "veel koffiesoorten", thermoskan: "thermoskan", timer: "timer", grind: "bonenmaler",
};

export function buildContext(lijst, naam) {
  return maakContext(lijst, naam, {
    tank: (p) => p.capaciteitWatertankL ?? NaN,
    bar: (p) => (p.maxWerkdrukBar > 1 ? p.maxWerkdrukBar : NaN),
    bonen: (p) => p.boonreservoirGram ?? NaN,
    varianten: (p) => (Array.isArray(p.varianten) && p.varianten.length ? p.varianten.length : NaN),
  });
}


/** "Waarom dit bij jou past": precies 4 punten. */
export function buildResultPoints(k, answers, ctx) {
  const p = puntenLijst();
  const a = answers || {};
  const varianten = Array.isArray(k.varianten) ? k.varianten : [];

  // 1. Alle vervulde keuzes in één regel
  const delen = [];
  const vink = (onderwerp, tekst) => { delen.push(`<strong>${tekst}</strong>`); p.gebruikt.add(onderwerp); };
  if (a.type && k.type === a.type) vink("type", TYPE_TEKST[a.type]);
  if (a.systeem && SYSTEEM_LABEL[a.systeem] && k.systeem === a.systeem) vink("systeem", SYSTEEM_LABEL[a.systeem]);
  for (const w of wensenVan(a)) if (heeftWens(k, w) === true) vink(w.startsWith("melk") ? "melk" : w.includes("molen") || w === "grind" ? "molen" : w, WENS_TEKST[w]);
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

  // 3. Kopjes per kan (filter)
  if (k.type === "filter" && Number.isFinite(k.capaciteitKopjes) && k.capaciteitKopjes >= 4) {
    p.voeg(30, "kopjes", `<strong>${getal(k.capaciteitKopjes)} kopjes</strong> per kan`);
  }

  // 4. Kenmerken waar niet om gevraagd is, en het vangnet
  if (varianten.length >= 3) p.voeg(40, "varianten", `Maakt <strong>${opsomming(varianten.slice(0, 3).map((v) => v.toLowerCase()))}</strong>${varianten.length > 3 ? ` en nog ${varianten.length - 3} andere soorten` : ""}`);
  if (ja(k.zelfreinigend)) p.voeg(41, "reinigen", `<strong>Reinigt zichzelf</strong>`);
  if (ja(k.automatischAntikalk)) p.voeg(42, "antikalk", `<strong>Ontkalkt automatisch</strong>`);
  if (k.melk === "auto") p.voeg(39, "melk", `<strong>Cappuccino op één knop</strong>: de machine schuimt de melk zelf op`);
  if (k.molen === true && k.type !== "capsules") p.voeg(43, "molen", `<strong>Ingebouwde molen</strong>: elke kop vers gemalen`);
  if (k.tweeKopjes === true && k.type !== "filter") p.voeg(44, "tweekopjes", `<strong>Twee kopjes</strong> tegelijk`);
  if (k.thermoskan === true) p.voeg(44, "thermoskan", `<strong>Thermoskan</strong>: koffie blijft uren warm`);
  if (k.systeem) p.voeg(45, "systeem", `Werkt met <strong>${esc(SYSTEEM_LABEL[k.systeem])}</strong>`);
  if (Number.isFinite(k.capaciteitWatertankL)) p.voeg(90, "tank", `<strong>${getal(k.capaciteitWatertankL, 1)} liter</strong> watertank`);
  if (k.typeProduct) p.voeg(91, "type", `<strong>${esc(k.typeProduct)}</strong>`);
  if (k.merk) p.voeg(92, "merk", `Van <strong>${esc(k.merk)}</strong>`);
  if (k.melk === "stoom") p.voeg(93, "melk", `<strong>Stoompijpje</strong> om melk op te schuimen`);
  winkelVangnet(p, k);
  return p.top4();
}

const TYPE_CHIP = { volautomaat: "Volautomaat", halfautomaat: "Halfautomaat", capsules: "Capsules/pads", filter: "Filterkoffie" };
const MELK_CHIP = { auto: "Cappuccino op één knop", stoom: "Stoompijpje" };

export function buildSpecChips(k) {
  const specs = [];
  if (TYPE_CHIP[k.type]) specs.push(TYPE_CHIP[k.type]);
  if (k.systeem) specs.push(SYSTEEM_LABEL[k.systeem]);
  if (MELK_CHIP[k.melk]) specs.push(MELK_CHIP[k.melk]);
  if (k.type === "filter" && Number.isFinite(k.capaciteitKopjes)) specs.push(`${k.capaciteitKopjes} kopjes`);
  if (k.molen === true && (k.type === "halfautomaat" || k.type === "filter")) specs.push("Bonenmaler");
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
