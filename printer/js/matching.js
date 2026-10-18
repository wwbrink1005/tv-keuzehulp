import { SOORTEN, soortPunten, GROTE_LADE_MIN } from "./data.js";
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

// ───────── Matching per printer (sinds 18-10-2026) ─────────
// Zelfde opzet als de tv: alleen het budget is een harde grens. Elke printer
// krijgt een passcore en de lijst is alles wat dicht bij de top zit.
// Vroeger was het gebruik ("thuis", "foto", "zakelijk") een harde scheiding,
// met daarna een rij filters die stuk voor stuk wegvielen als er niets
// overbleef: bij "foto" bleven er zo maar 9 vergelijkbare printers over en
// kreeg 80 van de 128 antwoordcombinaties één printer te zien.
//
// Passcore = 100
//   - 3 per punt dat de soort (inkjet met cartridges, inkttank, laser
//     zwart-wit, laser kleur) achterloopt op de best passende soort
//   - kan geen kleur terwijl je in kleur print, geen scanner terwijl je wilt
//     scannen, een extra wens die hij niet heeft, enz.
//   + fotoprinter bij foto's
//   - prijs: bij "lage aanschafprijs" wint goedkoper duidelijk
// `wens` is dezelfde score zonder het prijsdeel (voor de "Meer budget?"-kaart).
const PUNTEN_PER_SOORTPUNT = 3;
export const BAND_BESTE = 4;   // binnen zoveel punten van de top = even goed → goedkoopste is de beste match
const BAND_LIJST = 10;         // de lijst: alles binnen zoveel punten van de top
const MIN_LIJST = 5;           // en minstens zoveel printers die bij 2+ winkels te koop zijn
const MAX_LIJST = 30;          // maar nooit meer dan 30 zichtbare

/** Punten per soort voor deze antwoorden (hoger = past beter). */
export function berekenSoortScores(answers = {}) {
  const s = Object.fromEntries(SOORTEN.map(t => [t, 0]));
  for (const vraag of ["gebruik", "volume", "kleur", "kosten"]) {
    const tabel = soortPunten[vraag]?.[answers[vraag]];
    if (tabel) SOORTEN.forEach(t => { s[t] += tabel[t]; });
  }
  return s;
}

const wilKleur = a => a.kleur === "soms" || a.kleur === "vaak";
export const extraWensen = a => (Array.isArray(a?.extraAnswers) ? a.extraAnswers : []).filter(e => e !== "geen");
export const heeftGroteLade = p => (Number.isFinite(p.invoercapaciteit) ? p.invoercapaciteit >= GROTE_LADE_MIN : null);

// Wensen eerst: een printer die een uitgesproken wens niet heeft (kleur,
// scannen, een extra) zakt altijd onder de printers die hem wel hebben, wat de
// voorkeur voor een soort printer ook zegt (die scheelt samen met de
// gebruikspunten hooguit zo'n 110 punten). Bij een onbekend kenmerk kost het minder: onbekend is geen nee.
const WENS = 150, WENS_ONBEKEND = 50;
function wensStraf(heeft, nee, onbekend) {
  if (heeft === true) return 0;
  return heeft === false ? nee : onbekend;
}

function straffen(p, a) {
  let s = 0;

  // Kleur
  if (wilKleur(a) && p.kanKleurenPrinten !== "Ja") s += WENS;

  // Fotoprinters die alleen kleine fotootjes maken (sublimatie, ZINK)
  if (p.alleenFoto) s += a.gebruik === "foto" ? 5 : 40;

  // Scannen en kopiëren
  if (a.scan === "los" && !p.aio) s += WENS;
  if (a.scan === "stapel") s += !p.aio || p.adf !== "Ja" ? WENS : 0;

  // Hoeveel je print
  const snelheid = Number(p.snelheid);
  if (a.volume === "veel") {
    if (Number.isFinite(snelheid) && snelheid < 20) s += 10;
    if (Number.isFinite(p.paginasPerMaand) && p.paginasPerMaand < 1000) s += 6;
  }
  if (a.volume === "regelmatig" && Number.isFinite(snelheid) && snelheid < 10) s += 4;

  // Gebruik: kantoor wil automatisch dubbelzijdig; thuis geen zware bedrijfsprinter
  const bedrijf = /bedrijf|werkgroep/i.test(p.marktPositionering ?? "");
  if (a.gebruik === "kantoor") {
    if (p.duplexAuto === false) s += 10;
    if (Number.isFinite(snelheid) && snelheid < 15) s += 6;
    // Gemaakt voor werk? Maximaal aantal pagina's per maand volgens de fabrikant:
    // thuisprinters 1.000 tot 3.000, kantoorprinters 15.000 en meer.
    const max = p.maxPaginasPerMaand;
    if (Number.isFinite(max)) s += max < 3000 ? 10 : max < 10000 ? 4 : 0;
    else if (Number.isFinite(p.paginasPerMaand) && p.paginasPerMaand < 500) s += 8;
    else s += 5;   // onbekend: geen bewijs dat hij voor werk gemaakt is
  }
  if (a.gebruik === "thuis" && bedrijf) s += 4;

  // Extra wensen
  const ex = extraWensen(a);
  if (ex.includes("duplex")) s += wensStraf(p.duplexAuto, WENS, WENS_ONBEKEND);
  if (ex.includes("compact")) s += wensStraf(p.compact, WENS, WENS_ONBEKEND);
  if (ex.includes("lade")) s += wensStraf(heeftGroteLade(p), WENS, WENS_ONBEKEND);
  if (ex.includes("a3")) s += wensStraf(p.a3, WENS, WENS_ONBEKEND);

  return s;
}

function bonussen(p, a) {
  let b = 0;
  if (a.gebruik === "foto") {
    // Een echte fotoprinter (5+ inktkleuren of een "Photo"-lijn) moet winnen
    // van een gewone goedkope kleurenprinter; eerder (+6) won de goedkoopste
    // Expression Home het van elke fotoprinter.
    if (p.fotoprinter) b += 15;
    if (p.zonderWitranden === "Ja") b += 3;
  }
  if (a.gebruik === "kantoor") {
    if (/bedrijf|werkgroep/i.test(p.marktPositionering ?? "")) b += 2;
    if (p.maxPaginasPerMaand >= 15000) b += 4;
  }
  return b;
}

// Plek van een prijs binnen een lijst: 0 = goedkoopste, 1 = duurste.
function prijsPlek(lijst) {
  const prijzen = lijst.map(p => parsePrice(p.prijs)).sort((x, y) => x - y);
  return prijs => (prijzen.length < 2 ? 0 : prijzen.filter(x => x < prijs).length / (prijzen.length - 1));
}

const PRIJS_GEWICHT = { aanschaf: 8, egal: 3, printen: 1 };

export function scorePrinters(pool, answers = {}) {
  const ss = berekenSoortScores(answers);
  const top = Math.max(...SOORTEN.map(t => ss[t]));
  const plek = prijsPlek(pool);
  const gewicht = PRIJS_GEWICHT[answers.kosten] ?? 3;
  return pool.map(p => {
    const achter = Math.max(0, top - (ss[p.soort] ?? 0));
    const wens = 100 - achter * PUNTEN_PER_SOORTPUNT - straffen(p, answers) + bonussen(p, answers);
    const fit = wens - gewicht * plek(parsePrice(p.prijs));
    return { ...p, wens: Math.round(wens * 10) / 10, fit: Math.round(fit * 10) / 10 };
  });
}

/** De best passende soort voor deze antwoorden. */
export function idealeSoort(answers) {
  const ss = berekenSoortScores(answers);
  return SOORTEN.reduce((a, b) => (ss[b] > ss[a] ? b : a));
}

/** Beste match: de goedkoopste van de printers die even goed passen als de beste. */
export function kiesBesteMatch(lijst) {
  const metScore = (lijst ?? []).filter(p => Number.isFinite(p?.fit));
  if (!metScore.length) return null;
  const top = Math.max(...metScore.map(p => p.fit));
  return metScore
    .filter(p => p.fit >= top - BAND_BESTE)
    .reduce((a, b) => {
      const pa = parsePrice(a.prijs), pb = parsePrice(b.prijs);
      return pb < pa || (pb === pa && b.fit > a.fit) ? b : a;
    });
}

/**
 * @param {object[]} printers  genormaliseerde printers (utils.normalizeProducts)
 * @param {number|null} budget maximumbedrag uit de quiz, of null (geen voorkeur)
 * @param {object} answers     antwoorden uit de quiz
 */
export function matchPrinters(printers, budget, answers) {
  const leeg = { bestMatch: null, bestType: null, filteredMatchedPrinters: [], topWens: null };
  if (!Array.isArray(printers)) return leeg;

  const cap = Number(budget) || null;
  const pool = printers.filter(p => !cap || parsePrice(p.prijs) <= cap);
  if (pool.length === 0) return leeg;

  const gescoord = scorePrinters(pool, answers ?? {}).sort((x, y) => y.fit - x.fit);
  const top = gescoord[0].fit;
  // Alles binnen de band, maar door tot er minstens MIN_LIJST printers in zitten
  // die door het standaardfilter "2+ winkels" op de resultaatpagina komen.
  const lijst = [];
  let zichtbaar = 0;
  for (const p of gescoord) {
    if (zichtbaar >= MAX_LIJST) break;
    if (p.fit < top - BAND_LIJST && zichtbaar >= MIN_LIJST) break;
    lijst.push(p);
    if ((p.aanbieders ?? []).length >= DEFAULT_MIN_AANBIEDERS) zichtbaar++;
  }
  lijst.sort((x, y) => parsePrice(x.prijs) - parsePrice(y.prijs));

  const bestMatch = kiesBesteMatch(lijst);
  return {
    bestMatch,
    bestType: bestMatch?.soort ?? null,
    filteredMatchedPrinters: lijst,
    topWens: Math.max(...lijst.map(p => p.wens)),
  };
}
