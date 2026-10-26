import { getMonitorTier, inMaatGroep, is4KOfMeer, resolutiePixels, AANBEVOLEN_SCHERPTE } from "./data.js";
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

// ─── Kenmerken ──────────────────────────────────────────────────────────────

const jaNee = v => (/^ja$/i.test(v ?? "") ? true : /^nee$/i.test(v ?? "") ? false : null);
const ms = m => parseFloat(String(m.responstijd ?? "").replace(",", "."));
const lijst = v => (Array.isArray(v) ? v : v ? [v] : []);
export const beeldWensen = a => lijst(a?.beeld).filter(w => w !== "geen");
export const extraWensen = a => lijst(a?.extraAnswers).filter(w => w !== "geen");

// Een laptop opladen vraagt zo'n 60 W; de 15 W die sommige monitoren via USB-C
// leveren is alleen genoeg voor een telefoon.
const LAPTOP_LADEN_W = 60;

/** Heeft de monitor deze wens (beeld of extra)? true / false / null (onbekend). */
export function heeftWens(m, wens) {
  switch (wens) {
    case "4k": return resolutiePixels(m) ? is4KOfMeer(m) : null;
    case "oled": return m.paneeltype ? /oled/i.test(m.paneeltype) : null;
    case "gebogen": return m.gebogen === "Ja";
    case "usbc":
      if (m.usb_c !== "Ja") return false;
      return m.usbPdWatt == null ? null : m.usbPdWatt >= LAPTOP_LADEN_W;
    case "hoogte": return jaNee(m.hoogteVerstelbaar);
    case "webcam": return jaNee(m.webcam);
    case "speakers": return jaNee(m.speakersBekend);
    default: return true;
  }
}

// Gamevraag (alleen bij "Gamen"): de minimale verversingssnelheid, en voor een
// PS5/Xbox ook HDMI 2.1 (anders blijft de console op 60 beelden per seconde).
export const GAME_HZ = { console: 120, rustig: 120, snel: 144, competitief: 240 };
export function voldoetAanGame(m, game) {
  const min = GAME_HZ[game];
  if (!min) return true;
  if (m.hzOnbekend) return null;
  if (m.hz < min) return false;
  if (game !== "console") return true;
  return m.hdmiVersie == null ? null : m.hdmiVersie >= 2.1;
}
const gamet = a => lijst(a?.gebruik).includes("gaming");

// ───────── Matching per monitor (sinds 21-10-2026) ─────────
// Zelfde opzet als tv, printer, laptop en wasmachine: maat en budget zijn harde
// grenzen, elke monitor krijgt een passcore en de lijst is alles wat dicht bij
// de top zit. Vroeger won één klasse (Budget/Mid/Gaming/Premium) en kwam daarna
// een rij filters die stuk voor stuk wegvielen als er niets overbleef.
//
// Passcore = 100
//   - 150 per uitgesproken wens die de monitor niet heeft (beeld, extra's, de
//     verversingssnelheid of HDMI 2.1 uit de gamevraag); 50 bij onbekend. Zo
//     komt een monitor zonder die wens altijd onder de monitoren die hem wel
//     hebben.
//   - voorkeuren zonder vraag: scherp genoeg voor de maat (27" QHD, 32" 4K),
//     kleurbereik en paneel bij creatief werk, reactietijd bij gamen,
//     hoogteverstelling bij thuiswerk
//   - prijs: de duurste in de lijst verliest tot PRIJS_GEWICHT punten
// `wens` is dezelfde score zonder het prijsdeel (voor de "Meer budget?"-kaart).
const WENS = 150, WENS_ONBEKEND = 50;
export const BAND_BESTE = 4;
const BAND_LIJST = 10;
const MIN_LIJST = 5;
const MAX_LIJST = 20;          // was 30; in de Ads-test viel 1 van de 144 winkelkliks voorbij plek 20 (26-10-2026)
const PRIJS_GEWICHT = 6;

function wensStraf(heeft) {
  if (heeft === true) return 0;
  return heeft === false ? WENS : WENS_ONBEKEND;
}

/** Is het scherm scherp genoeg voor zijn maat? true / false / null. */
export function scherpGenoeg(m, maat) {
  const px = resolutiePixels(m), eis = AANBEVOLEN_SCHERPTE[maat];
  if (!px || !eis) return null;
  return px >= eis.pixels * 0.95;
}

/** Goed kleurbereik voor foto- en videobewerking. true / false / null. */
export function kleurecht(m) {
  if (m.srgb == null && m.dciP3 == null) return null;
  return (m.srgb ?? 0) >= 99 || (m.dciP3 ?? 0) >= 90;
}

function straffen(m, a) {
  let s = 0;
  const gebruik = lijst(a.gebruik);
  for (const w of beeldWensen(a)) s += wensStraf(heeftWens(m, w));
  for (const w of extraWensen(a)) s += wensStraf(heeftWens(m, w));
  if (gamet(a) && a.game) s += wensStraf(voldoetAanGame(m, a.game));

  // Voorkeuren
  if (scherpGenoeg(m, a.schermgrootte) === false) s += 12;
  if (gebruik.includes("creatief")) {
    const kleur = kleurecht(m);
    s += kleur === false ? 15 : kleur === null ? 6 : 0;
    if (resolutiePixels(m) && resolutiePixels(m) < 2560 * 1440 * 0.95) s += 8;
    if (/\b(va|tn)\b/i.test(m.paneeltype ?? "")) s += 6;
  }
  if (gamet(a) && ms(m) > 4) s += 4;
  // Wie de hele dag achter het scherm zit, heeft veel aan een voet die je op
  // ooghoogte zet. 8 punten: meer dan het verschil waarbinnen de goedkoopste
  // Beste match wordt (BAND_BESTE), dus een vaste voet wint niet meer op prijs.
  if (gebruik.includes("thuiswerk")) s += { false: 8, null: 3 }[jaNee(m.hoogteVerstelbaar)] ?? 0;
  // "24 inch" omvat ook 21,5 en 22 inch; die zijn merkbaar kleiner.
  if (a.schermgrootte === "compact" && m.schermdiagonaal < 23) s += 6;
  return s;
}

function bonussen(m, a) {
  const gebruik = lijst(a.gebruik);
  let b = 0;
  if (gamet(a) && m.hz >= 165) b += 2;
  if (gamet(a) && a.game === "competitief" && ms(m) <= 1) b += 2;
  if (gamet(a) && a.game === "console" && is4KOfMeer(m)) b += 3;
  if (gebruik.includes("creatief") && (m.dciP3 ?? 0) >= 95) b += 3;
  return b;
}

// Plek van een prijs binnen een lijst: 0 = goedkoopste, 1 = duurste.
function prijsPlek(pool) {
  const prijzen = pool.map(m => parsePrice(m.prijs)).sort((x, y) => x - y);
  return prijs => (prijzen.length < 2 ? 0 : prijzen.filter(x => x < prijs).length / (prijzen.length - 1));
}

export function scoreMonitors(pool, answers = {}) {
  const plek = prijsPlek(pool);
  return pool.map(m => {
    const wens = 100 - straffen(m, answers) + bonussen(m, answers);
    const fit = wens - PRIJS_GEWICHT * plek(parsePrice(m.prijs));
    return { ...m, tier: getMonitorTier(m), wens: Math.round(wens * 10) / 10, fit: Math.round(fit * 10) / 10 };
  });
}

/** Beste match: de goedkoopste van de monitoren die even goed passen als de beste. */
export function kiesBesteMatch(lijstIn) {
  const kandidaten = (lijstIn ?? []).filter(m => Number.isFinite(m?.fit));
  if (!kandidaten.length) return null;
  const top = Math.max(...kandidaten.map(m => m.fit));
  return kandidaten.filter(m => m.fit >= top - BAND_BESTE).reduce((a, b) => {
    const pa = parsePrice(a.prijs), pb = parsePrice(b.prijs);
    return pb < pa || (pb === pa && b.fit > a.fit) ? b : a;
  });
}

/**
 * @param {object[]} monitors  genormaliseerde monitoren (utils.normalizeProducts)
 * @param {string} sizeGroup   maat uit de quiz
 * @param {number|null} budget maximumbedrag uit de quiz, of null (geen voorkeur)
 * @param {object} answers     antwoorden uit de quiz
 */
export function matchMonitors(monitors, sizeGroup, budget, answers) {
  const leeg = { bestMatch: null, bestType: null, filteredMatchedMonitors: [], topWens: null };
  if (!Array.isArray(monitors) || !sizeGroup) return leeg;

  const cap = Number(budget) || null;
  const pool = monitors.filter(m => inMaatGroep(m, sizeGroup) && (!cap || parsePrice(m.prijs) <= cap));
  if (pool.length === 0) return leeg;

  const gescoord = scoreMonitors(pool, { ...(answers ?? {}), schermgrootte: sizeGroup }).sort((x, y) => y.fit - x.fit);
  const top = gescoord[0].fit;
  // Alles binnen de band, maar door tot er minstens MIN_LIJST monitoren in
  // zitten die door het standaardfilter "2+ winkels" op de resultaatpagina komen.
  const uit = [];
  let zichtbaar = 0;
  for (const m of gescoord) {
    if (zichtbaar >= MAX_LIJST) break;
    if (m.fit < top - BAND_LIJST && zichtbaar >= MIN_LIJST) break;
    uit.push(m);
    if ((m.aanbieders ?? []).length >= DEFAULT_MIN_AANBIEDERS) zichtbaar++;
  }
  uit.sort((x, y) => parsePrice(x.prijs) - parsePrice(y.prijs));

  const bestMatch = kiesBesteMatch(uit);
  return {
    bestMatch,
    bestType: bestMatch?.tier ?? null,
    filteredMatchedMonitors: uit,
    topWens: Math.max(...uit.map(m => m.wens)),
  };
}

// De kaartpunten ("Waarom dit bij jou past") staan in punten.js.
