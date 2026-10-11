// beamer/js/punten.js — kaartinhoud voor resultaat- en favorietenpagina.
// Zelfde opzet als koelkast/js/punten.js; bouwstenen in shared/punten-basis.js.

import {
  esc, getal, ja,
  maakContext, vergelijk, zochtRegel, puntenLijst, prijsPunten, winkelVangnet, schoonSpecs,
} from "../../shared/punten-basis.js";
import {
  helderheidMin, GEWICHT_DRAAGBAAR_MAX_KG, RESOLUTIE_HOOG, RESOLUTIE_LAAG, GELUID_STIL_MAX_DB, KORTE_WORP_TYPES,
} from "./data.js";

const resKort = (r) => String(r ?? "").replace(/\s*\(.*\)/, "");
const LICHT = { licht: "een kamer met licht aan", normaal: "een avond met de gordijnen dicht" };

export function buildContext(lijst, naam) {
  return maakContext(lijst, naam, {
    lumen: (p) => p.helderheidLumen ?? NaN,
    gewicht: (p) => p.gewichtKg ?? NaN,
    geluid: (p) => p.geluidDb ?? NaN,
    levensduur: (p) => p.lichtbronLevensduurUur ?? NaN,
  });
}

/** "Waarom dit bij jou past": precies 4 punten. */
export function buildResultPoints(b, answers, ctx) {
  const p = puntenLijst();
  const a = answers || {};
  const wensen = Array.isArray(a.extraAnswers) ? a.extraAnswers : [];
  const wil = (x) => wensen.includes(x);

  // 1. Alle vervulde keuzes in één regel
  const delen = [];
  const vink = (onderwerp, tekst) => { delen.push(`<strong>${tekst}</strong>`); p.gebruikt.add(onderwerp); };
  if (a.beeldkwaliteit === "heel-goed" && RESOLUTIE_HOOG.has(b.resolutie)) vink("res", `${esc(resKort(b.resolutie))}`);
  if (a.draagbaar === "ja" && Number.isFinite(b.gewichtKg) && b.gewichtKg <= GEWICHT_DRAAGBAAR_MAX_KG) vink("gewicht", "licht en draagbaar");
  if (wil("smart-tv") && ja(b.smartTv)) vink("smart", "apps zoals Netflix");
  if (wil("speakers") && ja(b.ingebouwdeLuidsprekers)) vink("speakers", "ingebouwde speakers");
  if (wil("laser") && b.lichtbronType === "Laser") vink("licht", "laser-lichtbron");
  if (wil("stil") && Number.isFinite(b.geluidDb) && b.geluidDb <= GELUID_STIL_MAX_DB) vink("geluid", "stil");
  if (wil("korte-worp") && KORTE_WORP_TYPES.has(b.worpType)) vink("worp", "korte projectieafstand");
  zochtRegel(p, delen);

  // 2. Wat deze kaart onderscheidt binnen de lijst
  vergelijk(p, ctx, "lumen", b.helderheidLumen ?? NaN, {
    laagBeter: false, overtreffend: "helderste", fmt: (x) => `<strong>${getal(x)} lumen</strong>`,
  });
  vergelijk(p, ctx, "geluid", b.geluidDb ?? NaN, {
    laagBeter: true, overtreffend: "stilste", fmt: (x) => `<strong>${getal(x)} dB</strong>`,
  });
  vergelijk(p, ctx, "gewicht", b.gewichtKg ?? NaN, {
    laagBeter: true, overtreffend: "lichtste", fmt: (x) => `<strong>${getal(x, 1)} kg</strong>`,
  });
  vergelijk(p, ctx, "levensduur", b.lichtbronLevensduurUur ?? NaN, {
    laagBeter: false, overtreffend: "langste", onderwerp: "levensduur",
    fmt: (x) => `<strong>${getal(x)} uur</strong> lamplevensduur`,
  });
  prijsPunten(p, b, ctx);

  // 3. Helderheid vertaald naar de eigen ruimte
  const min = helderheidMin[a.licht];
  if (LICHT[a.licht] && Number.isFinite(b.helderheidLumen) && b.helderheidLumen >= min) {
    p.voeg(30, "lumen", `<strong>${getal(b.helderheidLumen)} lumen</strong>: helder genoeg voor ${LICHT[a.licht]}`);
  }

  // 4. Kenmerken waar niet om gevraagd is, en het vangnet
  if (RESOLUTIE_HOOG.has(b.resolutie)) p.voeg(40, "res", `<strong>${esc(resKort(b.resolutie))}</strong>: scherper dan Full HD`);
  if (b.lichtbronType === "Laser" || b.lichtbronType === "LED") p.voeg(41, "licht", `<strong>${esc(b.lichtbronType)}-lichtbron</strong>: geen lamp die vervangen moet worden`);
  if (ja(b.smartTv)) p.voeg(42, "smart", `<strong>Apps ingebouwd</strong>: Netflix en YouTube zonder extra kastje`);
  if (KORTE_WORP_TYPES.has(b.worpType)) p.voeg(43, "worp", `<strong>Korte projectieafstand</strong>: groot beeld vlak voor de muur`);
  if (ja(b.hdr)) p.voeg(44, "hdr", `<strong>HDR</strong> voor meer contrast`);
  if (b.resolutie && !RESOLUTIE_LAAG.has(b.resolutie)) p.voeg(90, "res", `<strong>${esc(resKort(b.resolutie))}</strong> resolutie`);
  if (Number.isFinite(b.helderheidLumen)) p.voeg(91, "lumen", `<strong>${getal(b.helderheidLumen)} lumen</strong>`);
  if (b.projectietechnologie) p.voeg(92, "techniek", `<strong>${esc(b.projectietechnologie)}</strong>-projectie`);
  if (ja(b.ingebouwdeLuidsprekers)) p.voeg(93, "speakers", `<strong>Ingebouwde speakers</strong>`);
  if (b.merk) p.voeg(94, "merk", `Van <strong>${esc(b.merk)}</strong>`);
  winkelVangnet(p, b);
  return p.top4();
}

export function buildSpecChips(b) {
  const specs = [];
  if (b.helderheidLumen) specs.push(`${b.helderheidLumen} lumen`);
  if (b.resolutie) specs.push(b.resolutie);
  if (b.gewichtKg !== null && b.gewichtKg !== undefined) specs.push(`${b.gewichtKg} kg`);
  return specs;
}

export function buildAlleSpecs(b, raw) {
  const r = raw || {};
  const mm = (v) => (Number(v) > 0 ? `${getal(Number(v) / 10, 1)} cm` : null);
  return schoonSpecs([
    { titel: "Beeld", rijen: [
      ["Resolutie", b.resolutie], ["Helderheid", Number.isFinite(b.helderheidLumen) ? `${getal(b.helderheidLumen)} lumen` : null],
      ["Contrast", r.contrastverhouding], ["HDR", b.hdr], ["3D", b.support3d], ["Techniek", b.projectietechnologie],
      ["Beeldgrootte", r.schermmaten],
    ] },
    { titel: "Lichtbron en plaatsing", rijen: [
      ["Lichtbron", b.lichtbronType],
      ["Levensduur", Number.isFinite(b.lichtbronLevensduurUur) ? `${getal(b.lichtbronLevensduurUur)} uur` : null],
      ["Projectieafstand", b.worpType], ["Throw ratio", r.throwRatio], ["Zoom", b.zoom],
    ] },
    { titel: "Aansluitingen en geluid", rijen: [
      ["HDMI", b.hdmiPoorten != null ? String(b.hdmiPoorten) : null], ["Wifi", b.wifi], ["Bluetooth", b.bluetooth],
      ["Apps (smart)", b.smartTv], ["Speakers", b.ingebouwdeLuidsprekers],
      ["Geluid", Number.isFinite(b.geluidDb) ? `${getal(b.geluidDb)} dB` : null],
    ] },
    { titel: "Afmetingen en overig", rijen: [
      ["Breedte", mm(r.breedte)], ["Diepte", mm(r.diepte)], ["Hoogte", mm(r.hoogte)],
      ["Gewicht", Number.isFinite(b.gewichtKg) ? `${getal(b.gewichtKg, 1)} kg` : null],
      ["Kleur", b.kleur], ["Merk", b.merk], ["EAN", r.ean],
    ] },
  ]);
}
