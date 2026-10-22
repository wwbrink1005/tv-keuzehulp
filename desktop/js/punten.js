// desktop/js/punten.js — kaartinhoud voor resultaat- en favorietenpagina.
// Zelfde opzet als koelkast/js/punten.js; bouwstenen in shared/punten-basis.js.
//
// Let op: `wifi` staat in de catalogus als "Nee" of als de wifi-standaard
// ("Wifi 6E (802.11ax)"), nooit als "Ja". `ram`/`opslag` 0 betekent onbekend.

import {
  esc, getal, ja,
  maakContext, vergelijk, zochtRegel, puntenLijst, prijsPunten, winkelVangnet, schoonSpecs,
} from "../../shared/punten-basis.js";
import { TIER_ORDER } from "./data.js";

const opslagTekst = (gb) => (gb >= 1024 ? `${getal(gb / 1024, 1)} TB` : `${getal(gb)} GB`);
const heeftGpu = (d) => d.gpuLos === true;
const KLASSE_TEKST = { Budget: "instapprocessor", Mid: "processor uit de middenklasse", Krachtig: "krachtige processor", Topklasse: "processor uit de topklasse" };
const heeftWifi = (d) => Boolean(d.wifi) && d.wifi !== "Nee";
const BEHUIZING = { tower: "tower", "mini-pc": "mini-pc", "all-in-one": "all-in-one" };

export function buildContext(lijst, naam) {
  return maakContext(lijst, naam, {
    gpu: (p) => (heeftGpu(p) ? TIER_ORDER.indexOf(p.gpuTier) : NaN),
    ram: (p) => (p.ram > 0 ? p.ram : NaN),
    opslag: (p) => (p.opslag > 0 ? p.opslag : NaN),
  });
}

function gebruikPunt(d, gebruik, intensiteit) {
  const t = d.processorTier;
  if (gebruik.includes("gaming") && heeftGpu(d)) return `<strong>${esc(d.gpu)}</strong>: krachtig genoeg om moderne games soepel te spelen`;
  if (gebruik.includes("creatief") && (heeftGpu(d) || t === "Topklasse" || t === "Krachtig")) return "Krachtig genoeg voor <strong>foto- en videobewerking</strong>";
  if (gebruik.includes("werk")) return "Ruim voldoende voor <strong>werk en studie</strong>";
  if (gebruik.includes("dagelijks") || intensiteit === "licht") return "Meer dan genoeg voor <strong>surfen, mailen en streamen</strong>";
  return null;
}

/** "Waarom dit bij jou past": precies 4 punten. */
export function buildResultPoints(d, answers, ctx) {
  const p = puntenLijst();
  const a = answers || {};
  const gebruik = Array.isArray(a.gebruik) ? a.gebruik : (a.gebruik ? [a.gebruik] : []);
  const wensen = Array.isArray(a.extraAnswers) ? a.extraAnswers : [];
  const wil = (x) => wensen.includes(x);

  // 1. Alle vervulde keuzes in één regel
  const delen = [];
  const vink = (onderwerp, tekst) => { delen.push(`<strong>${tekst}</strong>`); p.gebruikt.add(onderwerp); };
  if (BEHUIZING[a.behuizing] && d.behuizingCategory === a.behuizing) vink("behuizing", BEHUIZING[a.behuizing]);
  if (a.os === "mac" && d.systeem === "macOS") vink("os", "Mac");
  if (a.os === "windows" && d.systeem === "Windows") vink("os", "Windows");
  if (a.opslag === "veel" && d.opslag >= 2000) vink("opslag", `${opslagTekst(d.opslag)} opslag`);
  else if (a.opslag === "gemiddeld" && d.opslag >= 1000) vink("opslag", `${opslagTekst(d.opslag)} opslag`);
  if (wil("rgb") && ja(d.rgb)) vink("rgb", "RGB-verlichting");
  if (wil("waterkoeling") && ja(d.waterkoeling)) vink("koeling", "waterkoeling");
  if (wil("wifi") && heeftWifi(d)) vink("wifi", "wifi");
  zochtRegel(p, delen);

  // 2. Wat deze kaart onderscheidt binnen de lijst
  vergelijk(p, ctx, "gpu", heeftGpu(d) ? TIER_ORDER.indexOf(d.gpuTier) : NaN, {
    laagBeter: false, overtreffend: "krachtigste", onderwerp: "gpu", fmt: () => `<strong>${esc(d.gpu)}</strong>`,
  });
  prijsPunten(p, d, ctx);

  // 3. Rekenkracht vertaald naar het eigen gebruik
  const gp = gebruikPunt(d, gebruik, a.intensiteit);
  if (gp) p.voeg(30, "gebruik", gp);

  // 4. Kenmerken waar niet om gevraagd is, en het vangnet
  if (heeftGpu(d)) p.voeg(40, "gpu", `<strong>${esc(d.gpu)}</strong> videokaart`);
  if (d.processorNaam && KLASSE_TEKST[d.processorTier]) p.voeg(42, "cpu", `<strong>${esc(d.processorNaam)}</strong>: ${KLASSE_TEKST[d.processorTier]}`);
  if (heeftWifi(d)) p.voeg(41, "wifi", `<strong>${esc(d.wifi.replace(/\s*\(.*\)/, ""))}</strong>: geen netwerkkabel nodig`);
  if (d.ram > 0) p.voeg(90, "ram", `<strong>${getal(d.ram)} GB</strong> werkgeheugen`);
  if (d.opslag > 0) p.voeg(91, "opslag", `<strong>${opslagTekst(d.opslag)}</strong> opslag`);
  if (d.behuizing) p.voeg(92, "behuizing", `<strong>${esc(d.behuizing)}</strong>`);
  if (d.os && d.os !== "Nee") p.voeg(93, "os", `Met <strong>${esc(d.os)}</strong>`);
  if (d.merk) p.voeg(94, "merk", `Van <strong>${esc(d.merk)}</strong>`);
  winkelVangnet(p, d);
  return p.top4();
}

export function buildSpecChips(d) {
  const specs = [];
  if (d.behuizing) specs.push(d.behuizing);
  if (d.gpu && d.gpu !== "Niet beschikbaar") specs.push(d.gpu);
  if (d.ram) specs.push(`${d.ram} GB RAM`);
  if (d.opslag) {
    if (d.opslag >= 1024) {
      const tb = d.opslag / 1024;
      specs.push(`${Number.isInteger(tb) ? tb : tb.toFixed(1)} TB SSD`);
    } else {
      specs.push(`${d.opslag} GB SSD`);
    }
  }
  if (heeftWifi(d)) specs.push("Wi-Fi");
  if (d.waterkoeling === "Ja") specs.push("Waterkoeling");
  if (d.rgb === "Ja") specs.push("RGB");
  return specs;
}

export function buildAlleSpecs(d, raw) {
  return schoonSpecs([
    { titel: "Prestaties", rijen: [
      ["Werkgeheugen", d.ram > 0 ? `${getal(d.ram)} GB` : null],
      ["Opslag", d.opslag > 0 ? opslagTekst(d.opslag) : null],
      ["Videokaart", d.gpu && d.gpu !== "Niet beschikbaar" ? d.gpu : "Geïntegreerd"],
      ["Processor", d.processorNaam || d.processorFabrikant],
    ] },
    { titel: "Behuizing", rijen: [
      ["Type", d.behuizing || raw?.type_product], ["Waterkoeling", d.waterkoeling], ["RGB-verlichting", d.rgb], ["Kleur", d.kleur],
    ] },
    { titel: "Aansluitingen en overig", rijen: [
      ["Wifi", heeftWifi(d) ? d.wifi : "Nee"], ["HDMI", String(d.hdmiPoorten ?? "")], ["DisplayPort", String(d.displayport ?? "")],
      ["USB-C", String(d.usbC ?? "")], ["Besturingssysteem", d.os], ["Merk", d.merk], ["EAN", raw?.ean],
    ] },
  ]);
}
