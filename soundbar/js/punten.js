// soundbar/js/punten.js — kaartinhoud voor resultaat- en favorietenpagina.
// Zelfde opzet als koelkast/js/punten.js; bouwstenen in shared/punten-basis.js.
//
// Let op: `vermogen_watt` 0 betekent onbekend (28% van de catalogus).
// subwooferLos, achterspeakers, wifiStreaming: true/false/null uit utils.js.

import {
  esc, getal, ja,
  maakContext, vergelijk, zochtRegel, puntenLijst, prijsPunten, winkelVangnet, schoonSpecs,
} from "../../shared/punten-basis.js";
import { breedteGroupToRange } from "./data.js";

const atmos = (s) => s.atmos === true;
const sub = (s) => s.subwooferLos === true;
const wifi = (s) => s.wifiStreaming === true;
const kanalenGetal = (s) => {
  const m = String(s.kanalen ?? "").match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  return m ? Number(m[1]) + Number(m[2] ?? 0) + Number(m[3] ?? 0) : NaN;
};
const kanalenKort = (s) => String(s.kanalen ?? "").replace(/\s*kanalen$/, "");
// Breedtegroep (antwoord op vraag 2) → bij welke tv die breedte hoort (zie tvGrootteToBreedteGroup).
const TV = { compact: "een tv tot 43 inch", gemiddeld: "een tv van 43 tot 55 inch", groot: "een tv van 55 inch of groter" };

export function buildContext(lijst, naam) {
  return maakContext(lijst, naam, {
    kanalen: (p) => kanalenGetal(p),
    watt: (p) => (p.vermogen_watt > 0 ? p.vermogen_watt : NaN),
  });
}

/** "Waarom dit bij jou past": precies 4 punten. */
export function buildResultPoints(s, answers, ctx) {
  const p = puntenLijst();
  const a = answers || {};
  const gebruik = Array.isArray(a.gebruik) ? a.gebruik : (a.gebruik ? [a.gebruik] : []);
  const wensen = Array.isArray(a.extraAnswers) ? a.extraAnswers : [];
  const wil = (x) => wensen.includes(x);

  // 1. Alle vervulde keuzes in één regel
  const delen = [];
  const vink = (onderwerp, tekst) => { delen.push(`<strong>${tekst}</strong>`); p.gebruikt.add(onderwerp); };
  if (a.subwoofer === "ja" && sub(s)) vink("sub", "losse subwoofer");
  if (a.subwoofer === "nee" && s.subwooferLos === false) vink("sub", "zonder losse subwoofer");
  if (wil("surround") && atmos(s)) vink("atmos", "Dolby Atmos");
  if (wil("achter") && s.achterspeakers === true) vink("achter", "losse achterspeakers");
  if (wil("streaming") && wifi(s)) vink("wifi", "WiFi-streaming");
  zochtRegel(p, delen);

  // 2. Wat deze kaart onderscheidt binnen de lijst
  vergelijk(p, ctx, "kanalen", kanalenGetal(s), {
    laagBeter: false, overtreffend: "meeste", onderwerp: "kanalen",
    fmt: () => `<strong>${esc(kanalenKort(s))} kanalen</strong>`,
  });
  vergelijk(p, ctx, "watt", s.vermogen_watt > 0 ? s.vermogen_watt : NaN, {
    laagBeter: false, overtreffend: "krachtigste", fmt: (x) => `<strong>${getal(x)} watt</strong>`,
  });
  prijsPunten(p, s, ctx);

  // 3. Breedte vertaald naar de eigen tv (alleen als hij in het geadviseerde vak valt)
  const r = breedteGroupToRange[a.breedte];
  if (r && TV[a.breedte] && Number.isFinite(s.breedte_mm) && s.breedte_mm >= r.min && s.breedte_mm < r.max) {
    p.voeg(30, "breedte", `<strong>${getal(s.breedte_mm / 10)} cm breed</strong>: past bij ${TV[a.breedte]}`);
  }
  if (atmos(s) && (gebruik.includes("films") || gebruik.includes("gaming"))) p.voeg(31, "atmos", `<strong>Dolby Atmos</strong>: geluid van boven en opzij, ook bij films en games`);
  if (gebruik.includes("tv") && kanalenGetal(s) >= 3) p.voeg(32, "spraak", `<strong>Middenkanaal</strong>: stemmen in films en nieuws beter verstaanbaar`);
  if (gebruik.includes("muziek") && wifi(s)) p.voeg(33, "wifi", `<strong>WiFi</strong>: muziek via ${s.airplay ? "AirPlay" : "Spotify Connect"} zonder bluetooth-haperingen`);
  if (gebruik.includes("films") && s.achterspeakers === true) p.voeg(34, "achter", `<strong>Losse achterspeakers</strong>: geluid echt van achteren`);

  // 4. Kenmerken waar niet om gevraagd is, en het vangnet
  if (ja(s.earc)) p.voeg(40, "earc", `<strong>HDMI eARC</strong>: bedienen met je tv-afstandsbediening`);
  if (sub(s)) p.voeg(41, "sub", `<strong>Losse subwoofer</strong> voor stevige bas`);
  if (atmos(s)) p.voeg(42, "atmos", `<strong>Dolby Atmos</strong> voor ruimtelijk geluid`);
  if (s.kanalen) p.voeg(90, "kanalen", `<strong>${esc(kanalenKort(s))} kanalen</strong>`);
  if (Number.isFinite(s.breedte_mm)) p.voeg(91, "breedte", `<strong>${getal(s.breedte_mm / 10)} cm</strong> breed`);
  if (ja(s.bluetooth)) p.voeg(92, "bt", `<strong>Bluetooth</strong>: muziek vanaf je telefoon`);
  if (s.merk) p.voeg(93, "merk", `Van <strong>${esc(s.merk)}</strong>`);
  winkelVangnet(p, s);
  return p.top4();
}

export function buildSpecChips(s) {
  const specs = [];
  if (s.kanalen) specs.push(s.kanalen);
  if (sub(s)) specs.push("Incl. subwoofer");
  if (s.vermogen_watt) specs.push(`${s.vermogen_watt}W`);
  if (s.breedte_mm) specs.push(`${Math.round(s.breedte_mm / 10)} cm breed`);
  return specs;
}

export function buildAlleSpecs(s, raw) {
  const cmv = (mm) => (Number.isFinite(mm) && mm > 0 ? `${getal(mm / 10, 1)} cm` : null);
  return schoonSpecs([
    { titel: "Geluid", rijen: [
      ["Kanalen", kanalenKort(s)], ["Losse subwoofer", s.subwooferLos == null ? null : s.subwooferLos ? "Ja" : "Nee"],
      ["Achterspeakers", s.achterspeakers == null ? null : s.achterspeakers ? "Ja" : "Nee"],
      ["Vermogen", s.vermogen_watt > 0 ? `${getal(s.vermogen_watt)} watt` : null], ["Formaten", s.audio_decoders],
    ] },
    { titel: "Aansluitingen", rijen: [
      ["HDMI", String(s.hdmi_poorten ?? "")], ["eARC", s.earc], ["WiFi", s.wifiStreaming == null ? null : s.wifiStreaming ? "Ja" : "Nee"],
      ["AirPlay", s.airplay == null ? null : s.airplay ? "Ja" : "Nee"], ["Spotify Connect", s.spotifyConnect == null ? null : s.spotifyConnect ? "Ja" : "Nee"],
      ["Bluetooth", s.bluetooth],
    ] },
    { titel: "Afmetingen en overig", rijen: [
      ["Breedte", cmv(s.breedte_mm)], ["Hoogte", cmv(s.hoogte_mm)], ["Diepte", cmv(s.diepte_mm)],
      ["Wandmontage", s.wandmontage], ["Merk", s.merk], ["EAN", raw?.ean],
    ] },
  ]);
}
