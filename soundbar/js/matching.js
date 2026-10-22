import { getSoundbarTier, breedteGroupToRange, breedteMaxMm } from "./data.js";
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

// ─── Wensen ─────────────────────────────────────────────────────────────────
// De kenmerken (subwooferLos, achterspeakers, atmos, wifiStreaming,
// middenkanaal) leidt utils.js af: true / false / null (onbekend).
const lijst = v => (Array.isArray(v) ? v : v ? [v] : []);
export const extraWensen = a => lijst(a?.extraAnswers).filter(w => w !== "geen");
const gebruikVan = a => lijst(a?.gebruik);

/** Heeft de soundbar deze extra wens? true / false / null (onbekend). */
export function heeftWens(sb, wens) {
  switch (wens) {
    case "surround": return sb.atmos ?? null;
    case "achter": return sb.achterspeakers ?? null;
    case "streaming": return sb.wifiStreaming ?? null;
    default: return true;
  }
}

/** Past de soundbar bij het antwoord op de subwoofervraag? true / false / null. */
export function voldoetAanSubwoofer(sb, antwoord) {
  const los = sb.subwooferLos ?? null;
  if (antwoord === "ja") return los;
  if (antwoord === "nee") return los === null ? null : !los;
  return true;
}

/** Past hij binnen de gekozen maximale breedte? (onbekende breedte: alleen bij "groot"/"weet-ik-niet") */
export function pastBreedte(sb, groep) {
  const max = breedteMaxMm[groep];
  if (max === undefined || max === Number.POSITIVE_INFINITY) return true;
  return Number.isFinite(sb.breedte_mm) && sb.breedte_mm < max;
}

// ───────── Matching per soundbar (sinds 22-10-2026) ─────────
// Zelfde opzet als tv, printer, laptop, wasmachine en monitor: breedte (als
// maximum) en budget zijn harde grenzen, elke soundbar krijgt een passcore en
// de lijst is alles wat dicht bij de top zit. Vroeger won één klasse
// (Compact/Allround/Premium) en kwamen er filters achteraan die wegvielen als
// er niets overbleef; "Nee, geen subwoofer" telde een onbekende als "nee".
//
// Passcore = 100
//   - 150 per uitgesproken wens die de soundbar niet heeft (subwoofer ja/nee,
//     Dolby Atmos, losse achterspeakers, WiFi); 50 bij onbekend
//   - breedte: 3 punten per 10 cm smaller dan het geadviseerde vak (max 15)
//   - gebruik (voorkeur, geen vraag om aan te vinken):
//       tv-kijken: middenkanaal voor stemmen; films: Atmos, losse subwoofer,
//       achterspeakers; muziek: WiFi-streaming, losse subwoofer; gamen: Atmos
//   - prijs: de duurste in de lijst verliest tot PRIJS_GEWICHT punten
// `wens` is dezelfde score zonder het prijsdeel (voor de "Meer budget?"-kaart).
const WENS = 150, WENS_ONBEKEND = 50;
export const BAND_BESTE = 4;
const BAND_LIJST = 10;
const MIN_LIJST = 5;
const MAX_LIJST = 30;
const PRIJS_GEWICHT = 6;

function wensStraf(heeft) {
  if (heeft === true) return 0;
  return heeft === false ? WENS : WENS_ONBEKEND;
}
const straf = (waarde, nee, onbekend) => (waarde === false ? nee : waarde == null ? onbekend : 0);

function straffen(sb, a) {
  let s = 0;
  const gebruik = gebruikVan(a);
  if (a.subwoofer === "ja" || a.subwoofer === "nee") s += wensStraf(voldoetAanSubwoofer(sb, a.subwoofer));
  for (const w of extraWensen(a)) s += wensStraf(heeftWens(sb, w));

  // Breedte: smaller dan het ideaal mag, maar hoe dichterbij hoe beter
  const ideaal = breedteGroupToRange[a.breedte];
  if (ideaal && a.breedte !== "compact") {
    if (!Number.isFinite(sb.breedte_mm)) s += 5;
    else if (sb.breedte_mm < ideaal.min) s += Math.min(15, Math.round((ideaal.min - sb.breedte_mm) / 100 * 3));
  }

  // Gebruik. Wie zelf "geen losse subwoofer" kiest, krijgt daar geen aftrek voor.
  const subOk = a.subwoofer !== "nee";
  if (gebruik.includes("tv")) s += straf(sb.middenkanaal, 8, 3);
  if (gebruik.includes("films")) {
    s += straf(sb.atmos, 10, 4);
    if (subOk) s += straf(sb.subwooferLos, 6, 3);
  }
  if (gebruik.includes("muziek")) {
    s += straf(sb.wifiStreaming, 8, 3);
    if (subOk) s += straf(sb.subwooferLos, 4, 2);
  }
  if (gebruik.includes("gaming")) s += straf(sb.atmos, 8, 3);
  return s;
}

function bonussen(sb, a) {
  const gebruik = gebruikVan(a);
  let b = 0;
  if (gebruik.includes("films") && sb.achterspeakers === true) b += 4;
  if (gebruik.includes("muziek") && (sb.airplay === true || sb.spotifyConnect === true)) b += 2;
  return b;
}

// Plek van een prijs binnen een lijst: 0 = goedkoopste, 1 = duurste.
function prijsPlek(pool) {
  const prijzen = pool.map(sb => parsePrice(sb.prijs)).sort((x, y) => x - y);
  return prijs => (prijzen.length < 2 ? 0 : prijzen.filter(x => x < prijs).length / (prijzen.length - 1));
}

export function scoreSoundbars(pool, answers = {}) {
  const plek = prijsPlek(pool);
  return pool.map(sb => {
    const wens = 100 - straffen(sb, answers) + bonussen(sb, answers);
    const fit = wens - PRIJS_GEWICHT * plek(parsePrice(sb.prijs));
    return { ...sb, tier: getSoundbarTier(sb), wens: Math.round(wens * 10) / 10, fit: Math.round(fit * 10) / 10 };
  });
}

/** Beste match: de goedkoopste van de soundbars die even goed passen als de beste. */
export function kiesBesteMatch(lijstIn) {
  const kandidaten = (lijstIn ?? []).filter(sb => Number.isFinite(sb?.fit));
  if (!kandidaten.length) return null;
  const top = Math.max(...kandidaten.map(sb => sb.fit));
  return kandidaten.filter(sb => sb.fit >= top - BAND_BESTE).reduce((a, b) => {
    const pa = parsePrice(a.prijs), pb = parsePrice(b.prijs);
    return pb < pa || (pb === pa && b.fit > a.fit) ? b : a;
  });
}

/**
 * @param {object[]} soundbars  genormaliseerde soundbars (utils.normalizeProducts)
 * @param {string} breedteGroup antwoord op de breedtevraag
 * @param {number|null} budget  maximumbedrag uit de quiz, of null (geen voorkeur)
 * @param {object} answers      antwoorden uit de quiz
 */
export function matchSoundbars(soundbars, breedteGroup, budget, answers) {
  const leeg = { bestMatch: null, bestType: null, filteredMatchedSoundbars: [], topWens: null };
  if (!Array.isArray(soundbars) || !breedteGroup) return leeg;

  const cap = Number(budget) || null;
  const pool = soundbars.filter(sb => pastBreedte(sb, breedteGroup) && (!cap || parsePrice(sb.prijs) <= cap));
  if (pool.length === 0) return leeg;

  const gescoord = scoreSoundbars(pool, { ...(answers ?? {}), breedte: breedteGroup }).sort((x, y) => y.fit - x.fit);
  const top = gescoord[0].fit;
  // Alles binnen de band, maar door tot er minstens MIN_LIJST soundbars in
  // zitten die door het standaardfilter "2+ winkels" op de resultaatpagina komen.
  const uit = [];
  let zichtbaar = 0;
  for (const sb of gescoord) {
    if (zichtbaar >= MAX_LIJST) break;
    if (sb.fit < top - BAND_LIJST && zichtbaar >= MIN_LIJST) break;
    uit.push(sb);
    if ((sb.aanbieders ?? []).length >= DEFAULT_MIN_AANBIEDERS) zichtbaar++;
  }
  uit.sort((x, y) => parsePrice(x.prijs) - parsePrice(y.prijs));

  const bestMatch = kiesBesteMatch(uit);
  return {
    bestMatch,
    bestType: bestMatch?.tier ?? null,
    filteredMatchedSoundbars: uit,
    topWens: Math.max(...uit.map(sb => sb.wens)),
  };
}

// De kaartpunten ("Waarom dit bij jou past") staan in punten.js.
