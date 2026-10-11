// vriezer/js/punten.js — kaartinhoud voor resultaat- en favorietenpagina.
// Zelfde opzet als koelkast/js/punten.js; bouwstenen in shared/punten-basis.js.

import {
  esc, getal, cm, leeg, opsomming, ja, maten,
  maakContext, vergelijk, zochtRegel, energiePunt, puntenLijst, prijsPunten, winkelVangnet, schoonSpecs,
} from "../../shared/punten-basis.js";
import { STIL_DB_THRESHOLD, GESCHIKT_VOOR_GARAGE_KLASSEN } from "./data.js";

const PLAATSING_LABELS = { inbouw: "Inbouw", vrijstaand: "Vrijstaand kastmodel", vrieskist: "Vrieskist" };

export function buildContext(lijst, naam) {
  return maakContext(lijst, naam, {
    geluid: (p) => p.geluidsniveauDb,
    inhoud: (p) => p.nettoInhoudL,
  });
}

const LITERS_ADVIES = {
  klein:     { min: 0,   wie: "1 tot 2 personen" },
  gemiddeld: { min: 150, wie: "3 tot 4 personen" },
  groot:     { min: 250, wie: "5 personen of meer" },
};

const garageGeschikt = (v) => v.klimaatklasse && GESCHIKT_VOOR_GARAGE_KLASSEN.includes(v.klimaatklasse);

/** "Waarom dit bij jou past": precies 4 punten. */
export function buildResultPoints(v, answers, ctx) {
  const p = puntenLijst();
  const a = answers || {};
  const wensen = Array.isArray(a.extraAnswers) ? a.extraAnswers : [];
  const wil = (w) => wensen.includes(w);

  // 1. Alle vervulde keuzes in één regel
  const delen = [];
  const vink = (onderwerp, tekst) => { delen.push(`<strong>${tekst}</strong>`); p.gebruikt.add(onderwerp); };
  if (v.plaatsing === "inbouw" && v.nishoogteGroup && a.nishoogte && String(a.nishoogte) === String(v.nishoogteGroup)) {
    vink("plaatsing", `past in je nis van ${v.nishoogteGroup} cm`);
  } else if (a.plaatsing === "vrieskist" && v.plaatsing === "vrieskist") {
    vink("plaatsing", "vrieskist");
  }
  if (wil("stil") && Number.isFinite(v.geluidsniveauDb) && v.geluidsniveauDb <= STIL_DB_THRESHOLD) vink("geluid-wens", "stil");
  if (wil("energiezuinig") && ["A", "B", "C"].includes(v.energielabel)) vink("energie-wens", "zuinig");
  if (wil("nofrost") && ja(v.automatischOntdooien)) vink("nofrost", "No Frost");
  if (wil("garage") && garageGeschikt(v)) vink("garage", "geschikt voor garage of schuur");
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

  // 3. Inhoud vertaald naar het eigen huishouden
  const advies = LITERS_ADVIES[a.gezinsgrootte];
  if (advies && Number.isFinite(v.nettoInhoudL)) {
    if (advies.min > 0 && v.nettoInhoudL >= advies.min) {
      p.voeg(30, "inhoud", `<strong>${getal(v.nettoInhoudL)} liter</strong>, ruim genoeg voor ${advies.wie}`);
    } else if (advies.min === 0 && v.nettoInhoudL <= 150) {
      p.voeg(30, "inhoud", `<strong>${getal(v.nettoInhoudL)} liter</strong>: genoeg voor ${advies.wie}, zonder overbodige ruimte`);
    }
  }

  // 4. Kenmerken waar niet om gevraagd is, en het vangnet
  if (ja(v.automatischOntdooien)) p.voeg(40, "nofrost", `<strong>No Frost</strong>: hoeft nooit ontdooid te worden`);
  // Bijna elke vriezer heeft een garage-klimaatklasse: daarom pas in het vangnet.
  if (garageGeschikt(v)) p.voeg(95, "garage", `<strong>Klimaatklasse ${esc(v.klimaatklasse)}</strong>: werkt ook in een koude garage of schuur`);
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
      ["No Frost", v.automatischOntdooien],
      ["Klimaatklasse", v.klimaatklasse],
    ] },
    { titel: "Verbruik", rijen: [
      ["Energielabel", v.energielabel],
      ["Geluidsniveau", Number.isFinite(v.geluidsniveauDb) ? `${getal(v.geluidsniveauDb)} dB` : null],
    ] },
    { titel: "Extra", rijen: [["Merk", v.merk], ["EAN", r.ean]] },
  ]);
}
