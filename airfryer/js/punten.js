// airfryer/js/punten.js — kaartinhoud voor resultaat- en favorietenpagina.
// Zelfde opzet als koelkast/js/punten.js; bouwstenen in shared/punten-basis.js.

import {
  esc, getal, ja, maten,
  maakContext, vergelijk, zochtRegel, puntenLijst, prijsPunten, winkelVangnet, schoonSpecs,
} from "../../shared/punten-basis.js";
import { capaciteitLiterMin } from "./data.js";

const HUISHOUDEN = { klein: "1 tot 2 personen", gemiddeld: "3 tot 4 personen", groot: "5 personen of meer" };

export function buildContext(lijst, naam) {
  return maakContext(lijst, naam, {
    liter: (p) => p.capaciteitLiter,
    watt: (p) => p.vermogenWatt,
    programmas: (p) => p.aantalProgrammas,
  });
}

/** Extra bereidingen naast frituren en bakken, in leesbare woorden. */
function functies(a) {
  return [
    ja(a.grillen) && "grillen",
    ja(a.braadfunctie) && "braden",
    ja(a.stoomfunctie) && "stomen",
    ja(a.dehydratiefunctie) && "drogen",
  ].filter(Boolean);
}

/** "Waarom dit bij jou past": precies 4 punten. */
export function buildResultPoints(f, answers, ctx) {
  const p = puntenLijst();
  const a = answers || {};
  const wensen = Array.isArray(a.extraAnswers) ? a.extraAnswers : [];
  const wil = (x) => wensen.includes(x);

  // 1. Alle vervulde keuzes in één regel
  const delen = [];
  const vink = (onderwerp, tekst) => { delen.push(`<strong>${tekst}</strong>`); p.gebruikt.add(onderwerp); };
  if (a.dubbeleMand === "ja" && f.constructietype === "Dubbel") vink("mand", "dubbele mand");
  if ((a.gebruik === "grillen-braden" || a.gebruik === "alles-in-1") && functies(f).length) {
    vink("functies", `ook ${functies(f).join("/")}`);
  }
  if (wil("kijkglas") && ja(f.kijkglas)) vink("kijkglas", "kijkglas");
  if (wil("display") && ja(f.display)) vink("display", "display");
  if (wil("vaatwasserbestendig") && ja(f.vaatwasserbestendig)) vink("vaatwasser", "vaatwasserbestendig");
  zochtRegel(p, delen);

  // 2. Wat deze kaart onderscheidt binnen de lijst
  vergelijk(p, ctx, "liter", f.capaciteitLiter, {
    laagBeter: false, overtreffend: "ruimste", fmt: (x) => `<strong>${getal(x, 1)} liter</strong>`,
  });
  vergelijk(p, ctx, "watt", f.vermogenWatt, {
    laagBeter: false, overtreffend: "krachtigste", fmt: (x) => `<strong>${getal(x)} watt</strong>`,
  });
  vergelijk(p, ctx, "programmas", f.aantalProgrammas, {
    laagBeter: false, overtreffend: "meeste", onderwerp: "programmas",
    fmt: (x) => `<strong>${getal(x)} programma's</strong>`,
  });
  prijsPunten(p, f, ctx);

  // 3. Inhoud vertaald naar het eigen huishouden
  const min = capaciteitLiterMin[a.personen];
  if (HUISHOUDEN[a.personen] && Number.isFinite(f.capaciteitLiter) && f.capaciteitLiter >= min) {
    p.voeg(30, "liter", `<strong>${getal(f.capaciteitLiter, 1)} liter</strong>: genoeg voor ${HUISHOUDEN[a.personen]}`);
  }

  // 4. Kenmerken waar niet om gevraagd is, en het vangnet
  if (f.constructietype === "Dubbel") p.voeg(40, "mand", `<strong>Dubbele mand</strong>: 2 gerechten tegelijk, elk op hun eigen stand`);
  if (functies(f).length >= 2) p.voeg(41, "functies", `<strong>Meer dan frituren</strong>: ook ${functies(f).join(", ").replace(/, ([^,]*)$/, " en $1")}`);
  if (ja(f.kijkglas)) p.voeg(42, "kijkglas", `<strong>Kijkglas</strong>: je ziet je eten zonder de mand te openen`);
  if (ja(f.vaatwasserbestendig)) p.voeg(43, "vaatwasser", `<strong>Vaatwasserbestendige</strong> mand en onderdelen`);
  if (Number.isFinite(f.capaciteitLiter)) p.voeg(90, "liter", `<strong>${getal(f.capaciteitLiter, 1)} liter</strong> inhoud`);
  if (Number.isFinite(f.vermogenWatt)) p.voeg(91, "watt", `<strong>${getal(f.vermogenWatt)} watt</strong> vermogen`);
  if (Number.isFinite(f.aantalProgrammas)) p.voeg(92, "programmas", `<strong>${getal(f.aantalProgrammas)} programma's</strong> om uit te kiezen`);
  if (f.merk) p.voeg(93, "merk", `Van <strong>${esc(f.merk)}</strong>`);
  if (ja(f.display)) p.voeg(94, "display", `<strong>Display</strong> met tijd en temperatuur`);
  winkelVangnet(p, f);
  return p.top4();
}

export function buildSpecChips(f) {
  const specs = [];
  if (f.capaciteitLiter) specs.push(`${f.capaciteitLiter} liter`);
  if (f.constructietype) specs.push(f.constructietype === "Dubbel" ? "Dubbele mand" : "Enkele mand");
  if (f.vermogenWatt) specs.push(`${f.vermogenWatt} W`);
  if (f.aantalProgrammas) specs.push(`${f.aantalProgrammas} programma's`);
  return specs;
}

export function buildAlleSpecs(f, raw) {
  const r = raw || {};
  const n = (v) => (v === null || v === undefined || v === "" ? NaN : Number(v));
  const mm = (v) => (Number.isFinite(n(v)) && n(v) > 0 ? `${getal(n(v) / 10, 1)} cm` : null);
  return schoonSpecs([
    { titel: "Inhoud", rijen: [
      ["Inhoud", Number.isFinite(f.capaciteitLiter) ? `${getal(f.capaciteitLiter, 1)} liter` : null],
      ["Capaciteit", Number.isFinite(f.capaciteitGram) ? `${getal(f.capaciteitGram)} gram` : null],
      ["Aantal personen", f.aantalPersonen],
      ["Mand", f.constructietype ? (f.constructietype === "Dubbel" ? "Dubbel" : "Enkel") : null],
    ] },
    { titel: "Functies", rijen: [
      ["Frituren", f.frituurfunctie], ["Bakken", f.bakfunctie], ["Grillen", f.grillen], ["Braden", f.braadfunctie],
      ["Stomen", f.stoomfunctie], ["Drogen", f.dehydratiefunctie], ["Warmhouden", f.warmhoudfunctie],
      ["Programma's", f.aantalProgrammas],
    ] },
    { titel: "Bediening", rijen: [
      ["Vermogen", Number.isFinite(f.vermogenWatt) ? `${getal(f.vermogenWatt)} watt` : null],
      ["Temperatuur", r.temperatuurMin && r.temperatuurMax ? `${r.temperatuurMin} tot ${r.temperatuurMax} °C` : null],
      ["Bediening", r.bediening], ["Display", f.display], ["Timer", r.digitaleTimer], ["Kijkglas", f.kijkglas],
    ] },
    { titel: "Afmetingen en overig", rijen: [
      ["Hoogte", mm(r.hoogte)], ["Breedte", mm(r.breedte)], ["Diepte", mm(r.diepte)],
      ["Gewicht", Number.isFinite(n(r.gewicht)) ? `${getal(n(r.gewicht), 1)} kg` : null],
      ["Vaatwasserbestendig", f.vaatwasserbestendig], ["Kleur", f.kleur], ["Merk", f.merk], ["EAN", r.ean],
    ] },
  ]);
}
