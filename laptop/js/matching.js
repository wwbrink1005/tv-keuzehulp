import { getProcessorTier, isLangeAccu, scoringSystem, sizeGroupToAllowedSizes, TIER_ORDER } from "./data.js";
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

// ─── Punten per processorklasse ─────────────────────────────────────────────

export function calculateScores(answers) {
  const scores = { Budget: 0, Mid: 0, Krachtig: 0, Topklasse: 0 };

  // gebruik is multi-select (max 2)
  const gebruik     = Array.isArray(answers.gebruik) ? answers.gebruik : (answers.gebruik ? [answers.gebruik] : []);
  const intensiteit = answers.intensiteit ?? "";
  const formaat     = answers.formaat     ?? "";

  for (const g of gebruik) {
    if (scoringSystem.gebruik[g]) {
      for (const tier of TIER_ORDER) scores[tier] += scoringSystem.gebruik[g][tier] ?? 0;
    }
  }
  if (intensiteit && scoringSystem.intensiteit[intensiteit]) {
    for (const tier of TIER_ORDER) scores[tier] += scoringSystem.intensiteit[intensiteit][tier] ?? 0;
  }
  if (formaat && scoringSystem.formaat[formaat]) {
    for (const tier of TIER_ORDER) scores[tier] += scoringSystem.formaat[formaat][tier] ?? 0;
  }
  return scores;
}

// ─── Kenmerken ──────────────────────────────────────────────────────────────

// Het "gpu"-veld bevat het model van de losse videokaart, of is leeg. Icecat
// vult het soms met de letterlijke tekst "Niet beschikbaar".
export function heeftDedicatedGpu(gpu) {
  const raw = String(gpu ?? "").trim();
  return raw !== "" && raw.toLowerCase() !== "niet beschikbaar";
}

// Gamen vraagt een losse videokaart. Voor creatief werk (foto, video) volstaat
// ook de ingebouwde grafische chip van een Apple M Pro/Max: die zijn daar juist
// sterk in.
function voldoetAanGpuWens(l, gebruik, intensiteit) {
  if (gebruik.includes("gaming")) return heeftDedicatedGpu(l.gpu);
  // Creatief bij licht of normaal gebruik (af en toe foto's bewerken) kan prima zonder
  // losse videokaart. Anders werd dat altijd een gamelaptop of MacBook Pro (26-10-2026).
  if (gebruik.includes("creatief") && (intensiteit === "zwaar" || intensiteit === "extreem")) return heeftDedicatedGpu(l.gpu) || /\bM\d+\s+(pro|max|ultra)\b/i.test(l.processor ?? "");
  return true;
}

// Resoluties boven Full HD zoals ze in de catalogus heten.
const SCHERP = new Set(["QHD", "QHD+", "4K"]);
export const isScherp = l => /oled/i.test(l.paneeltype ?? "") || SCHERP.has(l.resolutie);

// H/HX/HS = krachtig en warm, U/P/V = zuinig. Ongeveer 70% herkenbaar.
function processorKlasse(processor) {
  const match = String(processor ?? "").match(/\b\d{3,5}(HX|HS|H|U|P|V)\b/i);
  if (!match) return null;
  return ["HX", "HS", "H"].includes(match[1].toUpperCase()) ? "performance" : "efficient";
}

const OS_WENS = { windows: "Windows", mac: "macOS", chromebook: "Chrome OS" };
const jaNee = v => (/^ja$/i.test(v ?? "") ? true : /^nee$/i.test(v ?? "") ? false : null);
export const extraWensen = a => (Array.isArray(a?.extraAnswers) ? a.extraAnswers : []).filter(e => e !== "geen");

/** Voldoet de laptop aan deze extra wens? true / false / null (onbekend). */
export function heeftExtra(l, wens) {
  switch (wens) {
    case "accu": return isLangeAccu(l, heeftDedicatedGpu(l.gpu));
    case "touchscreen": return jaNee(l.touchscreen);
    case "scherp-beeldscherm": return isScherp(l);
    case "numpad": return jaNee(l.numeriekToetsenblok);
    case "vingerafdruk": return jaNee(l.vingerafdruk);
    default: return true;
  }
}

// ───────── Matching per laptop (sinds 19-10-2026) ─────────
// Zelfde opzet als tv en printer: formaat en budget zijn harde grenzen, elke
// laptop krijgt een passcore en de lijst is alles wat dicht bij de top zit.
// Vroeger won één processorklasse alles en kwam daarna een rij filters die
// stuk voor stuk wegvielen als er niets overbleef.
//
// Passcore = 100
//   - 3 per punt dat de processorklasse achterloopt op de best passende klasse
//   - 150 per uitgesproken wens die de laptop niet heeft (besturingssysteem,
//     videokaart bij gamen of creatief werk, opslag, extra's); 50 bij onbekend.
//     Zo komt een laptop zonder die wens altijd onder de laptops die hem wel
//     hebben, wat de klasse ook zegt (die scheelt hooguit zo'n 75 punten).
//   - voorkeuren: werkgeheugen, gewicht bij het formaat, zuinige of krachtige
//     chip, 120 Hz bij gamen
//   - prijs: bij licht gebruik wint goedkoper duidelijk, bij zwaar gebruik niet
// `wens` is dezelfde score zonder het prijsdeel (voor de "Meer budget?"-kaart).
const PUNTEN_PER_KLASSEPUNT = 3;
const WENS = 150, WENS_ONBEKEND = 50, OS_MIS = 1000;
export const BAND_BESTE = 4;
const BAND_LIJST = 10;
const MIN_LIJST = 5;
const MAX_LIJST = 30;
const PRIJS_GEWICHT = { licht: 8, normaal: 4, zwaar: 1, extreem: 0 };

function wensStraf(heeft) {
  if (heeft === true) return 0;
  return heeft === false ? WENS : WENS_ONBEKEND;
}

function straffen(l, a) {
  let s = 0;
  const gebruik = Array.isArray(a.gebruik) ? a.gebruik : [];

  // Wensen. Het besturingssysteem weegt het zwaarst: wie een Mac wil, wil geen
  // Windows-laptop, ook niet als die wel een videokaart heeft (er bestaat geen
  // Mac met losse videokaart).
  const os = OS_WENS[a.os];
  if (os) s += l.os ? (l.os === os ? 0 : OS_MIS) : WENS_ONBEKEND;
  // Zonder losse videokaart is een laptop onbruikbaar om te gamen: dat weegt
  // dubbel. Bij creatief werk weegt hij even zwaar als een extra wens.
  if (!voldoetAanGpuWens(l, gebruik, a.intensiteit)) s += gebruik.includes("gaming") ? 2 * WENS : WENS;
  if (a.opslag === "gemiddeld") s += wensStraf(l.opslag == null ? null : l.opslag >= 512);
  if (a.opslag === "veel") s += wensStraf(l.opslag == null ? null : l.opslag >= 1000);
  for (const e of extraWensen(a)) s += wensStraf(heeftExtra(l, e));

  // Voorkeuren
  const ram = l.werkgeheugen;
  if (Number.isFinite(ram)) {
    if (a.intensiteit === "extreem") s += ram < 16 ? 12 : ram < 32 ? 6 : 0;
    else if (a.intensiteit === "normaal" || a.intensiteit === "zwaar") s += ram < 16 ? 8 : 0;
  }
  if (Number.isFinite(l.gewicht)) {
    if (a.formaat === "licht-compact") s += l.gewicht > 1.9 ? 12 : l.gewicht > 1.6 ? 6 : 0;
    if (a.formaat === "middenweg" && l.gewicht > 2.2) s += 6;
  }
  const klasse = processorKlasse(l.processor);
  if ((a.intensiteit === "zwaar" || a.intensiteit === "extreem") && klasse === "efficient") s += 6;
  if ((a.intensiteit === "licht" || a.intensiteit === "normaal") && klasse === "performance") s += 4;
  if (gebruik.includes("gaming")) s += l.hz == null ? 3 : l.hz < 120 ? 8 : 0;
  return s;
}

function bonussen(l, a) {
  const gebruik = Array.isArray(a.gebruik) ? a.gebruik : [];
  let b = 0;
  if (gebruik.includes("gaming") && l.hz >= 144) b += 2;
  if (gebruik.includes("creatief") && isScherp(l)) b += 3;
  return b;
}

// Plek van een prijs binnen een lijst: 0 = goedkoopste, 1 = duurste.
function prijsPlek(lijst) {
  const prijzen = lijst.map(l => parsePrice(l.prijs)).sort((x, y) => x - y);
  return prijs => (prijzen.length < 2 ? 0 : prijzen.filter(x => x < prijs).length / (prijzen.length - 1));
}

export function scoreLaptops(pool, answers = {}) {
  const scores = calculateScores(answers);
  const top = Math.max(...TIER_ORDER.map(t => scores[t]));
  const plek = prijsPlek(pool);
  const gewicht = PRIJS_GEWICHT[answers.intensiteit] ?? 4;
  return pool.map(l => {
    const tier = getProcessorTier(l.processor, l.processor_familie);
    const wens = 100 - Math.max(0, top - scores[tier]) * PUNTEN_PER_KLASSEPUNT - straffen(l, answers) + bonussen(l, answers);
    const fit = wens - gewicht * plek(parsePrice(l.prijs));
    return { ...l, tier, wens: Math.round(wens * 10) / 10, fit: Math.round(fit * 10) / 10 };
  });
}

/**
 * Beste match: de goedkoopste van de laptops die even goed passen als de
 * beste. Bij zwaar of zeer zwaar gebruik eerst de krachtigste klasse daarvan
 * (wens gebruiker: "bij zwaar gebruik moet de krachtige klasse winnen").
 */
export function kiesBesteMatch(lijst, answers) {
  let kandidaten = (lijst ?? []).filter(l => Number.isFinite(l?.fit));
  if (!kandidaten.length) return null;
  const top = Math.max(...kandidaten.map(l => l.fit));
  kandidaten = kandidaten.filter(l => l.fit >= top - BAND_BESTE);
  const zwaar = answers?.intensiteit === "zwaar" || answers?.intensiteit === "extreem";
  if (zwaar) {
    const rang = l => TIER_ORDER.indexOf(l.tier ?? getProcessorTier(l.processor, l.processor_familie));
    const hoogste = Math.max(...kandidaten.map(rang));
    kandidaten = kandidaten.filter(l => rang(l) === hoogste);
  }
  return kandidaten.reduce((a, b) => {
    const pa = parsePrice(a.prijs), pb = parsePrice(b.prijs);
    return pb < pa || (pb === pa && b.fit > a.fit) ? b : a;
  });
}

/**
 * @param {object[]} laptops   genormaliseerde laptops (utils.normalizeProducts)
 * @param {string} sizeGroup   formaat uit de quiz
 * @param {number|null} budget maximumbedrag uit de quiz, of null (geen voorkeur)
 * @param {object} answers     antwoorden uit de quiz
 */
export function matchLaptops(laptops, sizeGroup, budget, answers) {
  const leeg = { bestMatch: null, bestType: null, filteredMatchedLaptops: [], topWens: null };
  if (!Array.isArray(laptops) || !sizeGroup) return leeg;

  const maten = sizeGroupToAllowedSizes[sizeGroup] || [];
  const cap = Number(budget) || null;
  let pool = laptops.filter(l => maten.includes(l.schermdiagonaal) && (!cap || parsePrice(l.prijs) <= cap));
  // Het gekozen besturingssysteem is een harde grens zodra het er is: anders
  // vulde de lijst (minstens 5) bij "Mac tot €800" aan met een Windows-laptop,
  // omdat er maar 4 Macs zijn. Liever 4 Macs dan een Acer ertussen. De quiz
  // maakt een systeem dat er niet is grijs; dit vangt de rest op.
  const os = OS_WENS[answers?.os];
  if (os && pool.some(l => l.os === os)) pool = pool.filter(l => l.os === os);
  if (pool.length === 0) return leeg;

  const gescoord = scoreLaptops(pool, answers ?? {}).sort((x, y) => y.fit - x.fit);
  const top = gescoord[0].fit;
  // Alles binnen de band, maar door tot er minstens MIN_LIJST laptops in zitten
  // die door het standaardfilter "2+ winkels" op de resultaatpagina komen.
  const lijst = [];
  let zichtbaar = 0;
  for (const l of gescoord) {
    if (zichtbaar >= MAX_LIJST) break;
    if (l.fit < top - BAND_LIJST && zichtbaar >= MIN_LIJST) break;
    lijst.push(l);
    if ((l.aanbieders ?? []).length >= DEFAULT_MIN_AANBIEDERS) zichtbaar++;
  }
  lijst.sort((x, y) => parsePrice(x.prijs) - parsePrice(y.prijs));

  const bestMatch = kiesBesteMatch(lijst, answers);
  return {
    bestMatch,
    bestType: bestMatch?.tier ?? null,
    filteredMatchedLaptops: lijst,
    topWens: Math.max(...lijst.map(l => l.wens)),
  };
}

// De kaartpunten ("Waarom dit bij jou past") staan in punten.js.
