// laptop/js/punten.js — kaartinhoud voor resultaat- en favorietenpagina.
// Zelfde opzet als koelkast/js/punten.js; bouwstenen in shared/punten-basis.js.
//
// `hz` is sinds okt. 2026 echte data (Icecat "Maximale refresh snelheid"),
// maar bij ongeveer de helft van de laptops onbekend (null).

import {
  esc, getal, ja,
  maakContext, vergelijk, zochtRegel, puntenLijst, prijsPunten, winkelVangnet, schoonSpecs,
} from "../../shared/punten-basis.js";
import { getProcessorTier, TIER_ORDER } from "./data.js";
import { heeftDedicatedGpu, heeftExtra, isScherp } from "./matching.js";

const SCHERP = new Set(["QHD", "QHD+", "4K"]);
const OS_WENS = { windows: "Windows", mac: "macOS", chromebook: "Chrome OS" };
const OS_LABEL = { Windows: "Windows", macOS: "macOS", "Chrome OS": "ChromeOS" };
const opslagTekst = (gb) => (gb >= 1024 ? `${getal(gb / 1024, 1)} TB` : `${getal(gb)} GB`);
const tier = (l) => getProcessorTier(l.processor, l.processor_familie);
const procNaam = (l) => String(l.processor_familie || l.processor || "").replace(/®|™/g, "").replace(/\s+/g, " ").trim();

export function buildContext(lijst, naam) {
  return maakContext(lijst, naam, {
    gewicht: (p) => p.gewicht ?? NaN,
    tier: (p) => TIER_ORDER.indexOf(tier(p)),
  });
}

/** Wat de rekenkracht betekent voor waar de bezoeker de laptop voor wil. */
function gebruikPunt(l, gebruik, intensiteit) {
  const t = tier(l);
  const gpu = heeftDedicatedGpu(l.gpu);
  if (gebruik.includes("gaming") && gpu && (t === "Topklasse" || t === "Krachtig")) return "Snel genoeg voor <strong>moderne games</strong>";
  if (gebruik.includes("creatief") && (t === "Topklasse" || t === "Krachtig")) return "Krachtig genoeg voor <strong>foto- en videobewerking</strong>";
  if (intensiteit === "extreem" && t === "Topklasse") return "<strong>Topklasse-processor</strong> voor zeer zware taken";
  if (gebruik.includes("werk") && t !== "Budget") return "Ruim voldoende voor <strong>studie en werk</strong>";
  if (gebruik.includes("dagelijks") || intensiteit === "licht") return "Meer dan genoeg voor <strong>surfen, mailen en streamen</strong>";
  return null;
}

/** "Waarom dit bij jou past": precies 4 punten. */
export function buildResultPoints(l, answers, ctx) {
  const p = puntenLijst();
  const a = answers || {};
  const gebruik = Array.isArray(a.gebruik) ? a.gebruik : (a.gebruik ? [a.gebruik] : []);
  const wensen = Array.isArray(a.extraAnswers) ? a.extraAnswers : [];
  const wil = (x) => wensen.includes(x);
  const gpu = heeftDedicatedGpu(l.gpu);

  // 1. Alle vervulde keuzes in één regel
  const delen = [];
  const vink = (onderwerp, tekst) => { delen.push(`<strong>${tekst}</strong>`); p.gebruikt.add(onderwerp); };
  if ((gebruik.includes("gaming") || gebruik.includes("creatief")) && gpu) vink("gpu", "eigen videokaart");
  if (a.formaat === "licht-compact" && Number.isFinite(l.gewicht) && l.gewicht <= 1.6) vink("gewicht", "licht");
  if (OS_WENS[a.os] && l.os === OS_WENS[a.os]) vink("os", OS_LABEL[l.os] ?? l.os);
  if (wil("accu") && heeftExtra(l, "accu") === true) vink("accu", "lange accuduur");
  if (wil("touchscreen") && ja(l.touchscreen)) vink("touch", "touchscreen");
  if (wil("scherp-beeldscherm") && isScherp(l)) vink("scherm", /oled/i.test(l.paneeltype ?? "") ? "OLED-scherm" : `${esc(l.resolutie)}-scherm`);
  if (wil("numpad") && ja(l.numeriekToetsenblok)) vink("numpad", "numeriek toetsenblok");
  if (wil("vingerafdruk") && ja(l.vingerafdruk)) vink("vingerafdruk", "vingerafdruklezer");
  if (gebruik.includes("gaming") && l.hz >= 120) vink("hz", `${getal(l.hz)} Hz-scherm`);
  if (a.opslag === "veel" && l.opslag >= 1000) vink("opslag", `${opslagTekst(l.opslag)} opslag`);
  zochtRegel(p, delen);

  // 2. Wat deze kaart onderscheidt binnen de lijst
  vergelijk(p, ctx, "tier", TIER_ORDER.indexOf(tier(l)), {
    laagBeter: false, overtreffend: "snelste", onderwerp: "processor",
    fmt: () => `<strong>${esc(procNaam(l))}</strong>`,
  });
  vergelijk(p, ctx, "gewicht", l.gewicht ?? NaN, {
    laagBeter: true, overtreffend: "lichtste", fmt: (x) => `<strong>${getal(x, 2)} kg</strong>`,
    gemMin: 0.3, gemTekst: (d) => `${getal(d, 1)} kg lichter dan gemiddeld`,
  });
  prijsPunten(p, l, ctx);

  // 3. Rekenkracht vertaald naar het eigen gebruik
  const gp = gebruikPunt(l, gebruik, a.intensiteit);
  if (gp) p.voeg(30, "gebruik", gp);

  // 4. Kenmerken waar niet om gevraagd is, en het vangnet
  if (gpu) p.voeg(40, "gpu", `<strong>${esc(l.gpu)}</strong> videokaart`);
  if (l.paneeltype === "OLED") p.voeg(41, "scherm", `<strong>OLED-scherm</strong>: diep zwart en sterke kleuren`);
  else if (SCHERP.has(l.resolutie)) p.voeg(41, "scherm", `<strong>${esc(l.resolutie)}-scherm</strong>: scherper dan Full HD`);
  if (ja(l.touchscreen)) p.voeg(42, "touch", `<strong>Touchscreen</strong>`);
  if (heeftExtra(l, "accu") === true) p.voeg(43, "accu", Number(l.accuUren) >= 15 ? `<strong>Tot ${getal(l.accuUren)} uur</strong> op een acculading` : `<strong>Grote accu</strong> (${getal(l.accuWh)} Wh): lang werken zonder stekker`);
  if (l.hz >= 120) p.voeg(44, "hz", `<strong>${getal(l.hz)} Hz-scherm</strong>: vloeiend beeld`);
  if (ja(l.vingerafdruk)) p.voeg(45, "vingerafdruk", `<strong>Vingerafdruklezer</strong>: inloggen zonder wachtwoord`);
  if (Number.isFinite(l.werkgeheugen)) p.voeg(90, "ram", `<strong>${getal(l.werkgeheugen)} GB</strong> werkgeheugen`);
  if (Number.isFinite(l.opslag)) p.voeg(91, "opslag", `<strong>${opslagTekst(l.opslag)}</strong> SSD-opslag`);
  if (l.schermdiagonaal) p.voeg(92, "diagonaal", `<strong>${getal(l.schermdiagonaal, 1)} inch</strong> ${esc(l.resolutie || "")}-scherm`.replace(" -scherm", " scherm"));
  if (procNaam(l)) p.voeg(93, "processor", `<strong>${esc(procNaam(l))}</strong>-processor`);
  if (l.merk) p.voeg(94, "merk", `Van <strong>${esc(l.merk)}</strong>`);
  winkelVangnet(p, l);
  return p.top4();
}

export function buildSpecChips(l) {
  const specs = [];
  if (l.schermdiagonaal) specs.push(`${l.schermdiagonaal}" scherm`);
  if (l.processor) specs.push(l.processor);
  if (l.werkgeheugen) specs.push(`${l.werkgeheugen} GB RAM`);
  if (l.opslag) {
    const gb = parseInt(l.opslag, 10);
    specs.push(gb >= 1024 ? `${gb / 1024} TB SSD` : `${gb} GB SSD`);
  }
  if (l.paneeltype) specs.push(l.paneeltype);
  if (l.resolutie) specs.push(l.resolutie);
  return specs;
}

export function buildAlleSpecs(l, raw) {
  return schoonSpecs([
    { titel: "Prestaties", rijen: [
      ["Processor", [procNaam(l), l.processor].filter(Boolean).join(" ").replace(/^(.+) \1$/, "$1")],
      ["Werkgeheugen", Number.isFinite(l.werkgeheugen) ? `${getal(l.werkgeheugen)} GB` : null],
      ["Opslag", Number.isFinite(l.opslag) ? `${opslagTekst(l.opslag)} SSD` : null],
      ["Videokaart", l.gpu && l.gpu !== "Niet beschikbaar" ? l.gpu : "Geïntegreerd"],
    ] },
    { titel: "Scherm", rijen: [
      ["Diagonaal", l.schermdiagonaal ? `${getal(l.schermdiagonaal, 1)} inch` : null],
      ["Resolutie", l.resolutie], ["Paneel", l.paneeltype], ["Verversing", Number.isFinite(l.hz) ? `${l.hz} Hz` : null], ["Touchscreen", l.touchscreen],
    ] },
    { titel: "Aansluitingen en overig", rijen: [
      ["USB-C", l.usb_c], ["HDMI", Number.isFinite(l.hdmi) ? String(l.hdmi) : l.hdmi],
      ["Besturingssysteem", OS_LABEL[l.os] ?? l.os],
      ["Accu", [Number.isFinite(l.accuWh) ? `${getal(l.accuWh)} Wh` : null, Number(l.accuUren) ? `tot ${l.accuUren} uur` : null].filter(Boolean).join(", ") || null],
      ["Numeriek toetsenblok", l.numeriekToetsenblok || null], ["Vingerafdruklezer", l.vingerafdruk || null],
      ["Soort", l.typeProduct || null],
      ["Gewicht", Number.isFinite(l.gewicht) ? `${getal(l.gewicht, 2)} kg` : null],
      ["Kleur", l.kleur], ["Merk", l.merk], ["EAN", raw?.ean],
    ] },
  ]);
}
