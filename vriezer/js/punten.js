// vriezer/js/punten.js — kaartinhoud voor resultaat- en favorietenpagina.
// Zelfde opzet als koelkast/js/punten.js; bouwstenen in shared/punten-basis.js.

import {
  esc, getal, cm, leeg, opsomming, ja, maten,
  maakContext, vergelijk, zochtRegel, energiePunt, puntenLijst, prijsPunten, winkelVangnet, schoonSpecs,
} from "../../shared/punten-basis.js";
import { extraWensen, heeftWens } from "./matching.js";

const PLAATSING_LABELS = { inbouw: "Inbouw", vrijstaand: "Vrijstaand kastmodel", vrieskist: "Vrieskist" };

export function buildContext(lijst, naam) {
  return maakContext(lijst, naam, {
    geluid: (p) => p.geluidsniveauDb,
    inhoud: (p) => p.nettoInhoudL,
  });
}

const WENS_TEKST = { nofrost: "No Frost", garage: "werkt ook in een koude garage" };

/** "Waarom dit bij jou past": precies 4 punten. */
export function buildResultPoints(v, answers, ctx) {
  const p = puntenLijst();
  const a = answers || {};

  // 1. Alle vervulde keuzes in één regel
  const delen = [];
  const vink = (onderwerp, tekst) => { delen.push(`<strong>${tekst}</strong>`); p.gebruikt.add(onderwerp); };
  if (v.plaatsing === "inbouw" && v.nishoogteGroup && a.nishoogte && String(a.nishoogte) === String(v.nishoogteGroup)) {
    vink("plaatsing", `past in je nis van ${v.nishoogteGroup} cm`);
  } else if (a.plaatsing === "vrieskist" && v.plaatsing === "vrieskist") {
    vink("plaatsing", "vrieskist");
  }
  for (const w of extraWensen(a)) if (heeftWens(v, w) === true) vink(w, WENS_TEKST[w]);
  zochtRegel(p, delen);

  // 2. Wat deze kaart onderscheidt binnen de lijst
  vergelijk(p, ctx, "geluid", v.geluidsniveauDb, {
    laagBeter: true, overtreffend: "stilste", fmt: (w) => `<strong>${getal(w)} dB</strong>`,
    gemMin: 2, gemTekst: (d) => `${getal(d)} dB stiller dan gemiddeld`,
  });
  vergelijk(p, ctx, "inhoud", v.nettoInhoudL, {
    laagBeter: false, overtreffend: "ruimste", fmt: (w) => `<strong>${getal(w)} liter</strong>`,
    gemMin: 25, gemTekst: (d) => `${getal(Math.round(d / 5) * 5)} liter ruimer dan gemiddeld`,
  });
  energiePunt(p, ctx, v.energielabel);
  prijsPunten(p, v, ctx);

  // 3. Kenmerken waar niet om gevraagd is, en het vangnet
  if (v.nofrost === true) p.voeg(40, "nofrost", `<strong>No Frost</strong>: hoeft nooit ontdooid te worden`);
  if (v.garage === true) p.voeg(41, "garage", `<strong>Werkt tot −15 °C</strong>: ook in een koude garage of schuur`);
  p.voeg(90, "maat", maten(v.hoogteMm, v.breedteMm, v.diepteMm));
  if (Number.isFinite(v.nettoInhoudL)) p.voeg(91, "inhoud", `<strong>${getal(v.nettoInhoudL)} liter</strong> netto inhoud`);
  if (v.energielabel) p.voeg(92, "energie", `<strong>Energielabel ${esc(v.energielabel)}</strong>`);
  if (v.merk) p.voeg(93, "merk", `Van <strong>${esc(v.merk)}</strong>`);
  if (Number.isFinite(v.geluidsniveauDb)) p.voeg(94, "geluid", `<strong>${getal(v.geluidsniveauDb)} dB</strong> geluidsniveau`);
  p.voeg(96, "plaatsing", `<strong>${esc(PLAATSING_LABELS[v.plaatsing] ?? "Vrijstaand")}</strong>`);
  winkelVangnet(p, v);
  return p.top4();
}

export function buildSpecChips(v) {
  const specs = [PLAATSING_LABELS[v.plaatsing] ?? "Vrijstaand"];
  if (v.nettoInhoudL) specs.push(`${v.nettoInhoudL} L`);
  if (v.energielabel) specs.push(`Energielabel ${v.energielabel}`);
  if (v.geluidsniveauDb) specs.push(`${v.geluidsniveauDb} dB`);
  return specs;
}

export function buildAlleSpecs(v, raw) {
  const r = raw || {};
  const mm = (n) => (Number.isFinite(n) && n > 0 ? `${cm(n)} cm` : null);
  return schoonSpecs([
    { titel: "Afmetingen", rijen: [
      ["Hoogte", mm(v.hoogteMm)], ["Breedte", mm(v.breedteMm)], ["Diepte", mm(v.diepteMm)],
      ["Nishoogte", leeg(r.nis_hoogte_cm) ? null : r.nis_hoogte_cm],
      ["Nisbreedte", leeg(r.nis_breedte_cm) ? null : r.nis_breedte_cm],
    ] },
    { titel: "Inhoud en gebruik", rijen: [
      ["Netto inhoud", Number.isFinite(v.nettoInhoudL) ? `${getal(v.nettoInhoudL)} liter` : null],
      ["Type", PLAATSING_LABELS[v.plaatsing]],
      ["No Frost", v.nofrost === true ? "Ja" : v.nofrost === false ? "Nee" : null],
      ["Werkt bij", v.bedrijfstemperatuur || null],
      ["Klimaatklasse", v.klimaatklasse],
    ] },
    { titel: "Verbruik", rijen: [
      ["Energielabel", v.energielabel],
      ["Geluidsniveau", Number.isFinite(v.geluidsniveauDb) ? `${getal(v.geluidsniveauDb)} dB` : null],
    ] },
    { titel: "Extra", rijen: [["Merk", v.merk], ["EAN", r.ean]] },
  ]);
}
