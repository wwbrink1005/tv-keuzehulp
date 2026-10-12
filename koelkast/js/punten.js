// koelkast/js/punten.js — kaartinhoud voor de resultaatpagina en de
// favorietenpagina: "Waarom dit bij jou past", de spec-chips en de groepen
// voor "Alle specificaties". Referentiepatroon voor de andere categorieën;
// de gedeelde bouwstenen en uitgangspunten staan in shared/punten-basis.js.

import { isUitgezet } from "../../shared/klant.js";
import {
  LABEL_RANG, esc, getal, cm, gemiddelde, leeg, opsomming,
  basisContext, opvallend, zochtRegel, puntenLijst, prijsPunten, winkelVangnet, schoonSpecs,
} from "../../shared/punten-basis.js";

/**
 * Statistieken over de lijst waarin de kaart staat, één keer per render.
 * @param {object[]} lijst  genormaliseerde producten
 * @param {string} [naam]   hoe de lijst in de tekst heet ("je 3 favorieten")
 */
export function buildContext(lijst, naam) {
  return {
    ...basisContext(lijst, naam),
    geluid: lijst.map((p) => p.geluidsniveauDb).filter(Number.isFinite).sort((a, b) => a - b),
    inhoud: lijst.map((p) => p.nettoInhoudL).filter(Number.isFinite).sort((a, b) => b - a),
    labels: lijst.map((p) => LABEL_RANG[p.energielabel]).filter(Boolean).sort((a, b) => a - b),
  };
}

const LITERS_ADVIES = {
  klein:     { min: 0,   wie: "1 tot 2 personen" },
  gemiddeld: { min: 250, wie: "3 tot 4 personen" },
  groot:     { min: 350, wie: "5 personen of meer" },
};

/**
 * Bouwt de "Waarom dit bij jou past"-punten.
 *
 * Opbouw, in deze volgorde:
 *   1. Eén regel met álles wat de bezoeker vroeg en waaraan dit product
 *      voldoet ("Precies wat je zocht: side-by-side, stil en No Frost").
 *      Bewust samengevoegd: er is op die wensen gefilterd, dus ze gelden
 *      voor vrijwel de hele lijst. Als losse punten maken ze elke kaart
 *      gelijk.
 *   2. Wat dit product onderscheidt van de rest van de lijst: de stilste,
 *      goedkoper dan gemiddeld, ruimer dan gemiddeld.
 *   3. De inhoud vertaald naar het eigen huishouden.
 *   4. Vangnet tot 4 punten: afmetingen, inhoud, energielabel en merk zijn
 *      bij vrijwel elk product gevuld.
 *
 * @param {object} k             genormaliseerd koelkastproduct
 * @param {object|null} answers  quizantwoorden (null op de favorietenpagina)
 * @param {object} ctx           uitkomst van buildContext() voor de getoonde lijst
 * @returns {string[]} precies 4 punten, HTML met <strong> rond de kern
 */
export function buildResultPoints(k, answers, ctx) {
  const p = puntenLijst();
  const a = answers || {};
  const wensen = Array.isArray(a.extraAnswers) ? a.extraAnswers : [];
  const wil = (w) => wensen.includes(w);

  // ── 1. Alle vervulde keuzes in één regel ─────────────────────────────
  const delen = [];
  const vink = (onderwerp, tekst) => { delen.push(`<strong>${tekst}</strong>`); p.gebruikt.add(onderwerp); };

  if (k.plaatsing === "inbouw" && k.nishoogteGroup && a.nishoogte && String(a.nishoogte) === String(k.nishoogteGroup)) {
    vink("plaatsing", `past in je nis van ${k.nishoogteGroup} cm`);
  } else if (k.plaatsing !== "inbouw") {
    if (a.vrijstaandtype === "amerikaans" && k.vrijstaandType === "amerikaans") vink("plaatsing", "side-by-side");
    if (a.vrijstaandtype === "extra-breed" && k.vrijstaandType === "extra-breed") vink("plaatsing", "extra breed");
    if (a.vrijstaandtype === "tafelmodel" && k.vrijstaandType === "tafelmodel") vink("plaatsing", "tafelmodel");
  }
  if (wil("stil") && Number.isFinite(k.geluidsniveauDb) && k.geluidsniveauDb <= 38) vink("wens-stil", "stil");
  if (wil("energiezuinig") && ["A", "B", "C"].includes(k.energielabel)) vink("wens-zuinig", "zuinig");
  if (wil("nofrost") && k.automatischOntdooien === "Ja") vink("nofrost", "No Frost");
  if (wil("vriesvak") && k.heeftVriesvak) vink("vriesvak", "met vriesvak");
  if (wil("verszone") && k.versZone === "Ja") vink("verszone", "met vers zone");
  if (wil("waterdispenser") && k.waterdispenser === "Ja") vink("water", "met waterdispenser");
  if (wil("ijsmaker") && k.ijsmaker === "Ja") vink("ijs", "met ijsmaker");

  zochtRegel(p, delen);

  // ── 2. Wat déze kaart onderscheidt van de rest van de lijst ──────────
  const { geluid: geluiden, labels, inhoud: inhouden } = ctx;

  const stil = opvallend(geluiden, k.geluidsniveauDb, true, ctx, "stilste");
  if (stil) p.voeg(stil.sterk ? 20 : 23, "geluid", `<strong>${getal(k.geluidsniveauDb)} dB</strong>: ${stil.tekst}`);

  const zuinig = opvallend(labels, LABEL_RANG[k.energielabel], true, ctx, "zuinigste");
  if (zuinig) p.voeg(zuinig.sterk ? 20 : 23, "energie", `<strong>Energielabel ${esc(k.energielabel)}</strong>: ${zuinig.tekst}`);

  const ruim = opvallend(inhouden, k.nettoInhoudL, false, ctx, "ruimste");
  if (ruim) p.voeg(ruim.sterk ? 20 : 23, "inhoud", `<strong>${getal(k.nettoInhoudL)} liter</strong>: ${ruim.tekst}`);

  prijsPunten(p, k, ctx);

  // Minder sterk dan een eerste plek, maar nog steeds een echt verschil.
  if (ctx.n >= 4) {
    const gemDb = gemiddelde(geluiden);
    if (Number.isFinite(k.geluidsniveauDb) && gemDb && gemDb - k.geluidsniveauDb >= 2) {
      p.voeg(25, "geluid", `<strong>${getal(k.geluidsniveauDb)} dB</strong>: ${getal(gemDb - k.geluidsniveauDb)} dB stiller dan gemiddeld`);
    }
    const gemL = gemiddelde(inhouden);
    if (Number.isFinite(k.nettoInhoudL) && gemL && k.nettoInhoudL - gemL >= Math.max(30, gemL * 0.12)) {
      p.voeg(25, "inhoud", `<strong>${getal(k.nettoInhoudL)} liter</strong>: ${getal(Math.round((k.nettoInhoudL - gemL) / 5) * 5)} liter ruimer dan gemiddeld`);
    }
    const rangLabel = LABEL_RANG[k.energielabel];
    if (rangLabel && labels.filter((x) => x > rangLabel).length >= labels.length * 0.6) {
      p.voeg(26, "energie", `<strong>Energielabel ${esc(k.energielabel)}</strong>: zuiniger dan de meeste van ${ctx.naam}`);
    }
  }

  // ── 3. Inhoud vertaald naar het eigen huishouden ─────────────────────
  const advies = LITERS_ADVIES[a.gezinsgrootte];
  if (advies && Number.isFinite(k.nettoInhoudL)) {
    if (advies.min > 0 && k.nettoInhoudL >= advies.min) {
      p.voeg(30, "inhoud", `<strong>${getal(k.nettoInhoudL)} liter</strong>, ruim genoeg voor ${advies.wie}`);
    } else if (advies.min === 0 && k.nettoInhoudL <= 250) {
      p.voeg(30, "inhoud", `<strong>${getal(k.nettoInhoudL)} liter</strong>: genoeg voor ${advies.wie}, zonder overbodige ruimte`);
    }
  }

  // ── 4. Kenmerken waar niet om gevraagd is, en het vangnet ────────────
  if (k.automatischOntdooien === "Ja" && !isUitgezet("nofrost")) p.voeg(40, "nofrost", `<strong>No Frost</strong>: de vriezer hoeft nooit ontdooid te worden`);
  if (k.versZone === "Ja" && !isUitgezet("verszone")) p.voeg(41, "verszone", `<strong>Vers zone</strong> voor groente en vlees`);
  if (k.hoogteMm && k.breedteMm && k.diepteMm) {
    p.voeg(90, "maat", `<strong>${cm(k.hoogteMm)} × ${cm(k.breedteMm)} × ${cm(k.diepteMm)} cm</strong> (h × b × d)`);
  }
  if (Number.isFinite(k.nettoInhoudL)) p.voeg(91, "inhoud", `<strong>${getal(k.nettoInhoudL)} liter</strong> netto inhoud`);
  if (k.energielabel) p.voeg(92, "energie", `<strong>Energielabel ${esc(k.energielabel)}</strong>`);
  if (k.merk) p.voeg(93, "merk", `Van <strong>${esc(k.merk)}</strong>`);
  // Laatste vangnet voor producten zonder energielabel of afmetingen in de
  // catalogus (ongeveer 1 op de 100): plaatsing is altijd bekend.
  if (Number.isFinite(k.geluidsniveauDb)) p.voeg(94, "geluid", `<strong>${getal(k.geluidsniveauDb)} dB</strong> geluidsniveau`);
  if (k.heeftVriesvak && !isUitgezet("vriesvak")) p.voeg(95, "vriesvak", `<strong>Met vriesvak</strong>`);
  p.voeg(96, "plaatsing", k.plaatsing === "inbouw"
    ? `<strong>Inbouwmodel</strong>, valt weg in je keukenkast`
    : `<strong>Vrijstaand</strong>, overal in huis te plaatsen`);
  winkelVangnet(p, k);

  return p.top4();
}

/** Korte chips onder de afbeelding. */
export function buildSpecChips(k) {
  const specs = [k.plaatsing === "inbouw" ? "Inbouw" : "Vrijstaand"];
  if (k.nettoInhoudL) specs.push(`${k.nettoInhoudL} L`);
  if (k.energielabel) specs.push(`Energielabel ${k.energielabel}`);
  if (k.geluidsniveauDb) specs.push(`${k.geluidsniveauDb} dB`);
  return specs;
}

/**
 * Groepen voor "Alle specificaties", alleen velden die echt gevuld zijn.
 * @param {object} k    genormaliseerd product
 * @param {object} raw  ruwe rij uit fetchProducts() (heeft velden die het
 *                      genormaliseerde product mist: vriescapaciteit, nismaten, EAN)
 */
export function buildAlleSpecs(k, raw) {
  const r = raw || {};
  const mmNaarCm = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) && n > 0 ? `${cm(n)} cm` : null;
  };
  return schoonSpecs([
    {
      titel: "Afmetingen",
      rijen: [
        ["Hoogte", mmNaarCm(r.hoogte_mm ?? k.hoogteMm)],
        ["Breedte", mmNaarCm(r.breedte_mm ?? k.breedteMm)],
        ["Diepte", mmNaarCm(r.diepte_mm ?? k.diepteMm)],
        ["Nishoogte", leeg(r.nis_hoogte_cm) ? null : `${parseFloat(r.nis_hoogte_cm)} cm`],
        ["Nisbreedte", leeg(r.nis_breedte_cm) ? null : `${parseFloat(r.nis_breedte_cm)} cm`],
      ],
    },
    {
      titel: "Inhoud en indeling",
      rijen: [
        ["Netto inhoud", Number.isFinite(k.nettoInhoudL) ? `${getal(k.nettoInhoudL)} liter` : null],
        ["Vriescapaciteit", r.vriescapaciteit],
        ["Vrieslades", r.vrieslades],
        ["Vers zone", k.versZone],
      ],
    },
    {
      titel: "Verbruik en gebruik",
      rijen: [
        ["Energielabel", k.energielabel],
        ["Geluidsniveau", Number.isFinite(k.geluidsniveauDb) ? `${getal(k.geluidsniveauDb)} dB` : null],
        ["No Frost", r.automatisch_ontdooien],
        ["Plaatsing", r.apparaatplaatsing],
      ],
    },
    {
      titel: "Extra",
      rijen: [
        ["Waterdispenser", k.waterdispenser],
        ["IJsmaker", k.ijsmaker],
        ["Merk", k.merk],
        ["EAN", r.ean],
      ],
    },
  ]);
}
