// monitor/js/punten.js — kaartinhoud voor resultaat- en favorietenpagina.
// Zelfde opzet als koelkast/js/punten.js; bouwstenen in shared/punten-basis.js.
//
// Let op: `hdr` en `gebogen` staan in de catalogus bij elke monitor op "Nee"
// (geen echte data) en worden daarom nergens gebruikt.

import {
  esc, getal, ja,
  maakContext, vergelijk, zochtRegel, puntenLijst, prijsPunten, winkelVangnet, schoonSpecs,
} from "../../shared/punten-basis.js";

const RES_RANG = { HD: 1, "Full HD": 2, WUXGA: 2.5, QHD: 3, UWQHD: 3.5, "4K": 4, "5K": 5, "5K Ultrawide": 5 };
const ms = (m) => parseFloat(String(m.responstijd ?? "").replace(",", "."));
const HZ_WENS = { extreem: [240, Infinity], vloeiend: [120, 240], soepel: [75, 120] };
const ultrawide = (m) => ["21:9", "32:9"].includes(m.beeldverhouding);

export function buildContext(lijst, naam) {
  return maakContext(lijst, naam, {
    hz: (p) => p.hz,
    res: (p) => RES_RANG[p.resolutie] ?? NaN,
    ms: (p) => ms(p),
  });
}

/** "Waarom dit bij jou past": precies 4 punten. */
export function buildResultPoints(m, answers, ctx) {
  const p = puntenLijst();
  const a = answers || {};
  const gebruik = Array.isArray(a.gebruik) ? a.gebruik : (a.gebruik ? [a.gebruik] : []);
  const wensen = Array.isArray(a.extraAnswers) ? a.extraAnswers : [];
  const wil = (x) => wensen.includes(x);

  // 1. Alle vervulde keuzes in één regel
  const delen = [];
  const vink = (onderwerp, tekst) => { delen.push(`<strong>${tekst}</strong>`); p.gebruikt.add(onderwerp); };
  const hzWens = HZ_WENS[a.hz];
  if (hzWens && m.hz >= hzWens[0] && m.hz < hzWens[1]) vink("hz", `${getal(m.hz)} Hz`);
  if (a.schermgrootte === "ultrawide" && ultrawide(m)) vink("vorm", "ultrawide");
  if (wil("4k") && m.resolutie === "4K") vink("res", "4K");
  if (wil("usb-c") && ja(m.usb_c)) vink("usbc", "USB-C");
  if (wil("speakers") && ja(m.speakers)) vink("speakers", "ingebouwde speakers");
  zochtRegel(p, delen);

  // 2. Wat deze kaart onderscheidt binnen de lijst
  vergelijk(p, ctx, "hz", m.hz, {
    laagBeter: false, overtreffend: "vloeiendste", fmt: (x) => `<strong>${getal(x)} Hz</strong>`,
  });
  vergelijk(p, ctx, "res", RES_RANG[m.resolutie] ?? NaN, {
    laagBeter: false, overtreffend: "scherpste", onderwerp: "res", fmt: () => `<strong>${esc(m.resolutie)}</strong>`,
  });
  if (gebruik.includes("gaming")) {
    vergelijk(p, ctx, "ms", ms(m), {
      laagBeter: true, overtreffend: "snelste", onderwerp: "ms", fmt: (x) => `<strong>${getal(x, 2)} ms</strong> reactietijd`,
    });
  }
  prijsPunten(p, m, ctx);

  // 3. Het paneel vertaald naar het eigen gebruik
  if (gebruik.includes("gaming") && m.hz >= 144) p.voeg(30, "hz", `<strong>${getal(m.hz)} Hz</strong>: vloeiend beeld bij snelle games`);
  if (gebruik.includes("gaming") && ms(m) <= 1) p.voeg(31, "ms", `<strong>${getal(ms(m), 2)} ms</strong> reactietijd: geen vegen bij snelle beelden`);
  if (gebruik.includes("creatief") && /IPS|OLED/.test(m.paneeltype ?? "")) p.voeg(31, "paneel", `<strong>${esc(m.paneeltype)}-paneel</strong>: betrouwbare kleuren voor foto's en video`);
  if (gebruik.includes("thuiswerk") && ja(m.usb_c)) p.voeg(32, "usbc", `<strong>USB-C</strong>: laptop aansluiten en opladen met één kabel`);

  // 4. Kenmerken waar niet om gevraagd is, en het vangnet
  if (m.paneeltype === "OLED") p.voeg(40, "paneel", `<strong>OLED-paneel</strong>: echt zwart en sterk contrast`);
  if (ja(m.usb_c)) p.voeg(41, "usbc", `<strong>USB-C</strong>: beeld, data en opladen via één kabel`);
  if (m.schermdiagonaal) p.voeg(90, "diagonaal", `<strong>${getal(m.schermdiagonaal, 1)} inch</strong> ${esc(m.resolutie || "")}-scherm`.replace(" -scherm", " scherm"));
  if (m.paneeltype) p.voeg(91, "paneel", `<strong>${esc(m.paneeltype)}</strong>-paneel`);
  if (m.hz) p.voeg(92, "hz", `<strong>${getal(m.hz)} Hz</strong> verversingssnelheid`);
  if (ja(m.speakers)) p.voeg(93, "speakers", `<strong>Ingebouwde speakers</strong>`);
  if (m.beeldverhouding) p.voeg(94, "vorm", `Beeldverhouding <strong>${esc(m.beeldverhouding)}</strong>`);
  if (m.merk) p.voeg(95, "merk", `Van <strong>${esc(m.merk)}</strong>`);
  winkelVangnet(p, m);
  return p.top4();
}

export function buildSpecChips(m) {
  const specs = [];
  if (m.schermdiagonaal) specs.push(`${m.schermdiagonaal}" monitor`);
  if (m.resolutie) specs.push(m.resolutie);
  if (m.paneeltype) specs.push(m.paneeltype);
  if (m.hz) specs.push(`${m.hz}Hz`);
  if (m.responstijd) specs.push(`${m.responstijd} reactietijd`);
  return specs;
}

export function buildAlleSpecs(m, raw) {
  return schoonSpecs([
    { titel: "Beeld", rijen: [
      ["Diagonaal", m.schermdiagonaal ? `${getal(m.schermdiagonaal, 1)} inch` : null],
      ["Resolutie", m.resolutie], ["Paneel", m.paneeltype], ["Beeldverhouding", m.beeldverhouding],
      ["Verversingssnelheid", m.hz ? `${getal(m.hz)} Hz` : null], ["Reactietijd", m.responstijd],
    ] },
    { titel: "Aansluitingen", rijen: [
      ["HDMI", String(m.hdmi_poorten ?? "")], ["DisplayPort", String(m.dp_poorten ?? "")], ["USB-C", m.usb_c],
    ] },
    { titel: "Overig", rijen: [["Speakers", m.speakers], ["Merk", m.merk], ["EAN", raw?.ean]] },
  ]);
}
