import { pastMaat, RUIM_COUVERTS, LABEL_VOLGORDE } from "./data.js";
import { parsePrice } from "./utils.js";

export const DEFAULT_MIN_AANBIEDERS = 2;

export function applyMinAanbiedersCascade(matches, startThreshold = DEFAULT_MIN_AANBIEDERS) {
  const countAanbieders = item => (item.aanbieders ?? []).length;
  let effectiveMin = startThreshold;
  let result = matches.filter(item => countAanbieders(item) >= effectiveMin);

  while (result.length === 0 && effectiveMin > 1) {
    effectiveMin -= 1;
    result = matches.filter(item => countAanbieders(item) >= effectiveMin);
  }

  return { effectiveMin, result };
}

// ─── Harde filters: inbouw/vrijstaand en de maat ───────────────────────────

export function filterByPlaatsing(vaatwassers, plaatsing) {
  return vaatwassers.filter(v => v.plaatsing === plaatsing);
}

/** Plaatsing + maat: de vaatwassers die mogen meedoen (zonder budget).
 *  Gracieus: geen enkele in die maat, dan alle van die plaatsing. */
export function poolVoor(vaatwassers, answers) {
  const opPlaatsing = filterByPlaatsing(vaatwassers, answers?.plaatsing);
  const opMaat = opPlaatsing.filter(v => pastMaat(v, answers?.maat));
  return opMaat.length ? opMaat : opPlaatsing;
}

// ───────── Matching per vaatwasser (sinds 25-10-2026) ─────────
// Zelfde opzet als de andere keuzehulpen: plaatsing, maat en budget zijn een
// harde grens, elke vaatwasser krijgt een passcore en de lijst is alles wat
// dicht bij de top zit. Vroeger: filters na elkaar (ook op kenmerken die per
// merk wel of niet ingevuld zijn) en de goedkoopste als "beste match".
//
// Passcore = 100
//   - een wens (droogt beter, besteklade, 15+ couverts) die hij niet heeft:
//     −150, onbekend: −40
//   - zuinig gewenst: −5 per labelstap boven de zuinigste van de lijst
//     (onbekend −15, als drie stappen: onbekend mag niet winnen van label C)
//   - stil gewenst: −2 per dB boven de stilste van de lijst (onbekend −6).
//     Bewust de stilste, niet het gemiddelde: anders won een vaatwasser van
//     44 dB (boven het gemiddelde) op prijs van een van 38 dB.
//   - prijs: de duurste in de lijst verliest tot 5 punten
// `wens` is dezelfde score zonder het prijsdeel (voor de "Meer budget?"-kaart).
const WENS_STRAF = 150, WENS_ONBEKEND = 40;
export const BAND_BESTE = 4;
const BAND_LIJST = 10;
const MIN_LIJST = 5;
const MAX_LIJST = 30;
const PRIJS_GEWICHT = 5;

export const lijst = a => (Array.isArray(a) ? a : []).filter(v => v !== "geen");
// Zuinig en stil zijn een score; de rest zijn wensen.
export const WENSEN = ["droog", "besteklade", "ruim"];
export const extraWensen = a => lijst(a?.extraAnswers).filter(w => WENSEN.includes(w));

/** Heeft de vaatwasser deze wens? true / false / null (onbekend). */
export function heeftWens(v, wens) {
  switch (wens) {
    case "droog": return v.droogtBeter;
    case "besteklade": return v.bestekType ? /lade/i.test(v.bestekType) : null;
    case "ruim": return Number.isFinite(v.couverts) ? v.couverts >= RUIM_COUVERTS : null;
    default: return true;
  }
}

const labelRang = v => (LABEL_VOLGORDE.includes(v.energieLabel) ? LABEL_VOLGORDE.indexOf(v.energieLabel) : null);

function straffen(v, a, ctx) {
  let s = 0;
  for (const w of extraWensen(a)) {
    const h = heeftWens(v, w);
    s += h === true ? 0 : h === false ? WENS_STRAF : WENS_ONBEKEND;
  }
  const ex = lijst(a.extraAnswers);
  // 5 per labelstap: groter dan de marge van de Beste match (4)
  if (ex.includes("energiezuinig")) {
    const r = labelRang(v);
    s += r === null ? 15 : (r - ctx.besteLabel) * 5;
  }
  if (ex.includes("stil")) {
    s += Number.isFinite(v.geluidDb) ? (v.geluidDb - ctx.stilste) * 2 : 6;
  }
  return s;
}

// Plek van een prijs binnen een lijst: 0 = goedkoopste, 1 = duurste.
function prijsPlek(pool) {
  const prijzen = pool.map(v => parsePrice(v.prijs)).sort((x, y) => x - y);
  return prijs => (prijzen.length < 2 ? 0 : prijzen.filter(x => x < prijs).length / (prijzen.length - 1));
}

export function scoreVaatwassers(pool, answers = {}) {
  const plek = prijsPlek(pool);
  const db = pool.map(v => v.geluidDb).filter(Number.isFinite);
  const rangen = pool.map(labelRang).filter(r => r !== null);
  const ctx = {
    stilste: db.length ? Math.min(...db) : 0,
    besteLabel: rangen.length ? Math.min(...rangen) : 0,
  };
  return pool.map(v => {
    const wens = 100 - straffen(v, answers, ctx);
    const fit = wens - PRIJS_GEWICHT * plek(parsePrice(v.prijs));
    return { ...v, wens: Math.round(wens * 10) / 10, fit: Math.round(fit * 10) / 10 };
  });
}

/** Beste match: de goedkoopste van de vaatwassers die even goed passen als de beste. */
export function kiesBesteMatch(lijstIn) {
  const metScore = (lijstIn ?? []).filter(v => Number.isFinite(v?.fit));
  if (!metScore.length) return null;
  const top = Math.max(...metScore.map(v => v.fit));
  return metScore.filter(v => v.fit >= top - BAND_BESTE).reduce((x, y) => {
    const px = parsePrice(x.prijs), py = parsePrice(y.prijs);
    return py < px || (py === px && y.fit > x.fit) ? y : x;
  });
}

// ─── Afwasprogramma's (alleen nog voor de filter op de resultaatpagina) ────
const PROGRAMMA_PATRONEN = {
  eco:       /eco/i,
  intensief: /intensi(ef|ve)/i,
  snel:      /snel|quick/i,
  stil:      /stil|quiet/i,
  voorwas:   /voorwas|voorspoel|prewash/i,
  glas:      /delicate|glas|breekbaar/i,
};

export function heeftAfwasprogramma(afwasprogrammas, key) {
  const patroon = PROGRAMMA_PATRONEN[key];
  if (!patroon) return false;
  return patroon.test(String(afwasprogrammas ?? ""));
}

/**
 * @param {object[]} vaatwassers  genormaliseerde vaatwassers (utils.normalizeProducts)
 * @param {object} answers        antwoorden uit de quiz (answers.budget: maximum of null)
 * @param {number|null} [budget]  overschrijft answers.budget (null = zonder grens)
 */
export function matchVaatwassers(vaatwassers, answers, budget = answers?.budget) {
  const leeg = { bestMatch: null, bestType: null, filteredMatchedVaatwassers: [], topWens: null };
  if (!Array.isArray(vaatwassers) || !answers?.plaatsing) return leeg;

  const cap = Number(budget) || null;
  const pool = poolVoor(vaatwassers, answers).filter(v => !cap || parsePrice(v.prijs) <= cap);
  if (pool.length === 0) return leeg;

  const gescoord = scoreVaatwassers(pool, answers).sort((x, y) => y.fit - x.fit);
  const top = gescoord[0].fit;
  const uit = [];
  let zichtbaar = 0;
  for (const v of gescoord) {
    if (zichtbaar >= MAX_LIJST) break;
    if (v.fit < top - BAND_LIJST && zichtbaar >= MIN_LIJST) break;
    uit.push(v);
    if ((v.aanbieders ?? []).length >= DEFAULT_MIN_AANBIEDERS) zichtbaar++;
  }
  uit.sort((x, y) => parsePrice(x.prijs) - parsePrice(y.prijs));

  return {
    bestMatch: kiesBesteMatch(uit),
    bestType: answers.plaatsing === "inbouw" ? "Inbouw" : "Vrijstaand",
    filteredMatchedVaatwassers: uit,
    topWens: Math.max(...uit.map(v => v.wens)),
  };
}

// De kaartpunten ("Waarom dit bij jou past") staan in punten.js.
