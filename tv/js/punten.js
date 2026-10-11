// tv/js/punten.js — kaartinhoud voor resultaat- en favorietenpagina.
// Zelfde opzet als koelkast/js/punten.js; bouwstenen in shared/punten-basis.js.
//
// De tv-catalogus heeft weinig velden (type paneel, grootte, scherpte, Hz,
// HDMI, merk). De waarde zit daarom vooral in wat het paneeltype betekent voor
// hoe de bezoeker kijkt: dat advies komt uit de oude buildResultPoints() in
// matching.js, zonder de negatieve zinnen ("Minder geschikt voor ...").

import {
  esc, getal,
  maakContext, vergelijk, puntenLijst, prijsPunten, winkelVangnet, schoonSpecs,
} from "../../shared/punten-basis.js";
import { formatScherpte, getResolutionCategory, parseHzValue } from "./utils.js";

const PANEEL = {
  OLED: "met pixels die zelf licht geven, voor echt zwart",
  "Neo QLED": "met Mini LED en quantum dots, fel en diep zwart",
  "Mini LED": "met duizenden kleine leds, fel met goed contrast",
  QLED: "met quantum dots, voor heldere kleuren",
};
const inch = (tv) => parseInt(String(tv.grootte ?? "").match(/\d+/)?.[0] ?? "", 10);

export function buildContext(lijst, naam) {
  return maakContext(lijst, naam, {
    hz: (p) => parseHzValue(p) ?? NaN,
    hdmi: (p) => p.hdmiPoorten ?? NaN,
  });
}

/** Wat het paneel betekent voor hoe de bezoeker kijkt; alleen positieve zinnen. */
function kijkPunten(tv, a) {
  const type = String(tv.type ?? "");
  const hz = parseHzValue(tv) ?? 0;
  const gebruik = a.usageAnswers ?? [];
  const extra = a.extraAnswers ?? [];
  const uit = [];
  const premium = type === "OLED" || type === "Neo QLED" || type === "Mini LED";
  if (gebruik.includes("films") && (premium || type === "QLED")) uit.push("Sterk beeld voor <strong>films en series</strong>");
  if (gebruik.includes("sport") && hz >= 100) uit.push(`<strong>${hz} Hz</strong>: snelle beelden bij sport blijven scherp`);
  if (gebruik.includes("gamen") && hz >= 120) uit.push(`<strong>${hz} Hz</strong>: vloeiend gamen op een console of pc`);
  if (a.timing === "avonds" && (type === "OLED" || type === "Neo QLED" || type === "Mini LED")) uit.push("Diep zwart <strong>'s avonds in het donker</strong>");
  if (a.timing === "overdag" && (type === "QLED" || type === "Neo QLED" || type === "Mini LED")) uit.push("Fel genoeg voor <strong>een lichte kamer overdag</strong>");
  if (a.viewing === "meerdere" && type === "OLED") uit.push("Goed beeld <strong>vanaf de zijkant</strong>, ook voor wie schuin zit");
  if (extra.includes("zwart") && (type === "OLED" || type === "Neo QLED" || type === "Mini LED")) uit.push("<strong>Diepe zwarttinten</strong>");
  // Niet nog een keer als "fel genoeg voor overdag" er al staat.
  if (extra.includes("helderheid") && a.timing !== "overdag" && (type === "QLED" || type === "Neo QLED" || type === "Mini LED")) uit.push("<strong>Opvallend helder</strong> beeld");
  if (extra.includes("kleur") && (premium || type === "QLED")) uit.push("<strong>Levendige kleuren</strong>");
  return uit;
}

/** "Waarom dit bij jou past": precies 4 punten. */
export function buildResultPoints(tv, answers, ctx) {
  const p = puntenLijst();
  const a = answers || {};
  const type = String(tv.type ?? "");
  const hz = parseHzValue(tv);

  // 1. Wat het paneel betekent voor de eigen keuzes: bij tv's de kern, dus
  // als losse punten in plaats van één samengevoegde regel. Maximaal 2
  // bovenaan; de rest pas na de vergelijkingen, anders is elke kaart met
  // hetzelfde paneeltype gelijk.
  kijkPunten(tv, a).forEach((t, i) => p.voeg(i < 2 ? 12 + i : 27 + i, `kijk-${i}`, t));

  // 2. Wat deze kaart onderscheidt binnen de lijst
  vergelijk(p, ctx, "hz", hz ?? NaN, {
    laagBeter: false, overtreffend: "vloeiendste", fmt: (x) => `<strong>${getal(x)} Hz</strong>`,
  });
  vergelijk(p, ctx, "hdmi", tv.hdmiPoorten ?? NaN, {
    laagBeter: false, overtreffend: "meeste", onderwerp: "hdmi", fmt: (x) => `<strong>${getal(x)} HDMI-poorten</strong>`,
  });
  prijsPunten(p, tv, ctx);

  // 4. Kenmerken waar niet om gevraagd is, en het vangnet
  if (PANEEL[type]) p.voeg(40, "paneel", `<strong>${esc(type)}</strong> ${PANEEL[type]}`);
  const res = getResolutionCategory(tv);
  if (res === "8K" || res === "4K") p.voeg(41, "scherpte", `<strong>${esc(formatScherpte(tv.scherpte))}</strong>: scherp, ook van dichtbij`);
  if (Number.isFinite(inch(tv))) p.voeg(90, "grootte", `<strong>${inch(tv)} inch</strong> scherm`);
  if (hz) p.voeg(91, "hz", `<strong>${getal(hz)} Hz</strong> beeldverversing`);
  if (Number.isFinite(tv.hdmiPoorten)) p.voeg(92, "hdmi", `<strong>${getal(tv.hdmiPoorten)} HDMI-poorten</strong> voor console, soundbar en kastje`);
  if (type) p.voeg(93, "paneel", `<strong>${esc(type)}</strong>-scherm`);
  if (tv.merk) p.voeg(94, "merk", `Van <strong>${esc(tv.merk)}</strong>`);
  winkelVangnet(p, tv);
  return p.top4();
}

export function buildSpecChips(tv) {
  const specs = [];
  const sizeMatch = String(tv.grootte ?? "").match(/\d+/);
  if (sizeMatch) specs.push(`${sizeMatch[0]} inch`);
  const typeValue = String(tv.type ?? "");
  if (typeValue === "LED (edge)" || typeValue === "LED (direct)") specs.push("LED");
  else if (typeValue) specs.push(typeValue);
  const hzValue = tv.Hz ?? tv.hz;
  if (hzValue !== undefined && hzValue !== null && hzValue !== "") {
    const hzLabel = String(hzValue).trim();
    specs.push(/hz$/i.test(hzLabel) ? hzLabel : `${hzLabel} Hz`);
  }
  const scherpteValue = String(tv.scherpte ?? "");
  if (scherpteValue) specs.push(formatScherpte(scherpteValue));
  return specs;
}

export function buildAlleSpecs(tv, raw) {
  const hz = parseHzValue(tv);
  return schoonSpecs([
    { titel: "Beeld", rijen: [
      ["Schermgrootte", Number.isFinite(inch(tv)) ? `${inch(tv)} inch` : null],
      ["Paneel", tv.type], ["Scherpte", tv.scherpte], ["Beeldverversing", hz ? `${hz} Hz` : null],
    ] },
    { titel: "Overig", rijen: [
      ["HDMI-poorten", Number.isFinite(tv.hdmiPoorten) ? String(tv.hdmiPoorten) : null],
      ["Kleur", tv.kleur], ["Merk", tv.merk], ["EAN", raw?.ean],
    ] },
  ]);
}
