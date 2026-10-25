import { MIN_WINKELS } from "./data.js";
import { parsePrice } from "./utils.js";

// Standaarddrempel voor het "aantal winkels"-filter op de resultaatpagina.
// Gedeeld tussen result.js (eerste render, vanuit de quiz-tijd localStorage-
// snapshot) en result-filters.js (live herberekening + het filter zelf),
// zodat de eerste paint al meteen de juiste, gefilterde telling toont i.p.v.
// heel kort de ongefilterde (incl. 1-winkel-producten) telling te flashen.
// Bij koffiemachines 1: winkels verkopen eigen modelvarianten (zie data.js).
export const DEFAULT_MIN_AANBIEDERS = MIN_WINKELS;

// Filtert op minimaal `startThreshold` winkels, met een cascade-fallback:
// levert dat 0 resultaten op, dan wordt de drempel stap voor stap verlaagd
// tot en met 1 (waar het altijd gelijk is aan `matches` zelf). Zo kan dit
// filter nooit op zichzelf een lege resultatenlijst veroorzaken.
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

// Koffiemachines hebben geen fysieke pasvorm-eis zoals vaatwasser (inbouw/
// vrijstaand) — dus geen harde eerste filter. Alle vragen zijn zachte,
// gracieus degraderende voorkeursfilters in cascade op de volledige catalogus.

// ─── Type (Q1: volautomaat/halfautomaat/capsules/filter) ───────────────────

// Icecat's "Type product" labelt sommige Nespresso/Dolce Gusto-capsule-
// machines onterecht als "Espressomachine" (zie data.js). "Koffie invoertype"
// is betrouwbaarder: bestaat het UITSLUITEND uit Koffiecapsule/Koffiepad
// (geen bonen/gemalen erbij, zoals bij een halfautomaat die ook ESE-pads
// accepteert), dan is het altijd een capsule-/padmachine.
function isPureCapsuleInvoer(koffieInvoertype) {
  const types = String(koffieInvoertype || "").split(",").map(s => s.trim()).filter(Boolean);
  if (types.length === 0) return false;
  return types.every(t => t === "Koffiecapsule" || t === "Koffiepad");
}

// Icecat's eigen "automatiseringsgraad"-veld ("Koffiezet apparaat type") is
// zelf soms intern tegenstrijdig met Icecat's eigen gegenereerde titel — bv.
// "Krups Intuition Preference EA8738" heet in de titel letterlijk
// "Volautomatische Espressomachine" en "De'Longhi ECAM293.52.B" (het ECAM-
// voorvoegsel is De'Longhi's eigen naamgeving voor de volautomaat-lijn) heet
// "Volautomaat", maar automatiseringsgraad staat bij beide op "Half
// automatisch" (8 producten in totaal, geverifieerd tegen de volledige live
// catalogus, sessie-onderzoek: gebruiker koos halfautomaat+automatisch
// opschuimen en kreeg deze duidelijk volautomaat-klinkende modellen terug).
// "volautomaat" (zelfstandig naamwoord) en "volautomatisch" (bijvoeglijk
// naamwoord) zijn geen substrings van elkaar (dubbele vs. enkele a), dus
// beide vormen expliciet checken. De titel wint hier: bij een expliciete
// vermelding negeren we een tegenstrijdig automatiseringsgraad-veld.
function titelZegtAutomatiseringsgraad(naam) {
  const n = String(naam || "").toLowerCase();
  if (n.includes("volautomatisch") || n.includes("volautomaat")) return "Volledig automatisch";
  if (n.includes("half automatisch")) return "Half automatisch";
  if (n.includes("handmatig")) return "Handmatig";
  // De'Longhi's eigen productlijn-namen voor hun handmatige/halfautomatische
  // lijn — geverifieerd tegen alle 13 Dedica/La Specialista-producten in de
  // live catalogus: waar automatiseringsgraad gevuld is, staat die zonder
  // uitzondering op "Half automatisch"/"Handmatig" (0 tegenvoorbeelden).
  // Vult de 2 gevallen aan waar dat veld leeg is (bv. "Dedica Duo EC890.M").
  if (n.includes("dedica") || n.includes("la specialista")) return "Half automatisch";
  return null;
}

// Bepaalt het 4-weg type van 1 koffiemachine — enige plek waar deze logica
// staat, gebruikt door zowel applyTypeFilter() (matching), buildResultPoints()
// (USP-tekst) als result-filters.js (de "Type koffiemachine"-kaart), zodat
// die drie nooit uit elkaar kunnen lopen.
export function classificeerType(koffiemachine) {
  // Braun KF is de filterlijn van Braun (KF 1500 heet bij Icecat "Espressomachine")
  if (/\bBraun\b.*\bKF\s?\d{3,4}/i.test(koffiemachine.naam || "")) return "filter";
  const t = classificeerRuw(koffiemachine);
  // Een volautomaat maalt per definitie bonen. Zonder bonen of molen in de
  // data is het iets anders, ook al noemt Icecat het "volledig automatisch":
  // Braun KF 1500 (€44) is een filterapparaat, De'Longhi Icona Vintage een
  // pistonmachine (okt. 2026).
  if (t === "volautomaat" && !/baristina/i.test(koffiemachine.naam || "")
      && !String(koffiemachine.koffieInvoertype || "").includes("Koffiebonen") && koffiemachine.molenRaw !== "Ja") {
    return koffiemachine.maxWerkdrukBar >= 9 || /icona|espresso/i.test(koffiemachine.naam || "") ? "halfautomaat" : "filter";
  }
  return t;
}

function classificeerRuw(koffiemachine) {
  // Okt. 2026: eerst de naam waar die eenduidig is. Capsulesystemen staan er
  // altijd in; La Specialista (De'Longhi EC9xxx) is een halfautomaat met
  // bonenmaler, maar stond als volautomaat; de Philips Baristina (maalt en zet
  // met één beweging) stond de ene keer als vol-, de andere keer als
  // halfautomaat of zonder type.
  const naam = String(koffiemachine.naam || "");
  if (/nespresso|vertuo|dolce\s?gusto|senseo|l['’]?or barista|tassimo/i.test(naam)) return "capsules";
  if (/la specialista|\bEC9\d{3}/i.test(naam)) return "halfautomaat";
  if (/baristina/i.test(naam)) return "volautomaat";
  // Volautomaatlijnen waarvan Icecat soms "Half automatisch" zegt (Magnifica S ECAM21.117)
  if (/\b(ECAM|EXAM|ETAM)\s?\d|magnifica|eletta|dinamica|rivelia|primadonna|\bEP\s?\d{4}|\bEQ\s?\.?\s?\d|\bEA\s?(8|9)\d{2}/i.test(naam)) return "volautomaat";
  if (/combinatiekoffie/i.test(naam)) return null;

  // Koffie invoertype wint ALTIJD als eerste, ongeacht wat "Type product"
  // zegt — niet alleen wanneer "Type product" op "Espressomachine" staat.
  // Ontdekt doordat een De'Longhi Citiz EN267.WAE/.BAE (onbetwist een
  // Nespresso-capsulemachine, koffie_invoertype="Koffiecapsule") bij Icecat
  // zelf "Type product: Filterkoffiezetapparaat" heeft staan — dezelfde
  // categorie fout als bij de eerdere Espressomachine-mislabeling, maar dan
  // op de "Filterkoffiezetapparaat"-tak, die hiervoor nog vóór de capsule-
  // check werd ge-`return`, waardoor de kruiscontrole nooit werd bereikt.
  if (isPureCapsuleInvoer(koffiemachine.koffieInvoertype)) return "capsules";

  const graad = titelZegtAutomatiseringsgraad(koffiemachine.naam) ?? koffiemachine.automatiseringsgraad;
  const heeftBonen = String(koffiemachine.koffieInvoertype || "").includes("Koffiebonen");
  const heeftWerkdruk = koffiemachine.maxWerkdrukBar !== null;

  // Bonen ALLEEN in combinatie met een pompdruk (bar) is een espressomachine
  // -- zonder pompdruk is het een grind&brew FILTERAPPARAAT (maalt bonen
  // maar zet via het filterprincipe, geen espresso-extractie onder druk).
  // Ontdekt: "Krups Grind Aroma XL"/"Philips HD7900"/"Krups Aroma Partner
  // Grind en Brew" hebben Koffiebonen (+ vaak Volledig automatisch) maar
  // GEEN pompdruk — genuine filterapparaten (hun eigen naam bevestigt dit:
  // "Grind en Brew"). "De'Longhi Magnifica S ECAM220.30.SB" had WEL 15 bar
  // maar stond bij Icecat's "Type product" ten onrechte op
  // "Filterkoffiezetapparaat" — zonder de bar-check zou "bonen" alleen de
  // 5 échte grind&brew-filters ook foutief naar volautomaat/halfautomaat
  // hebben geduwd.
  if (heeftBonen && heeftWerkdruk) {
    if (graad === "Volledig automatisch") return "volautomaat";
    if (graad === "Half automatisch" || graad === "Handmatig") return "halfautomaat";
    return "volautomaat";
  }

  const tp = koffiemachine.typeProduct;
  if (tp === "Filterkoffiezetapparaat") return "filter";
  if (tp === "Koffiepadmachine" || tp === "Koffiecupmachine") return "capsules";
  if (tp === "Espressomachine") {
    if (graad === "Volledig automatisch") return "volautomaat";
    if (graad === "Half automatisch" || graad === "Handmatig") return "halfautomaat";
    // geen bonen en geen graad: een espressoapparaat met filterhouder (Dedica EC890)
    if (!heeftBonen) return "halfautomaat";
  }
  if (/volautoma/i.test(naam)) return "volautomaat";
  return null;
}

// ───────── Matching per koffiemachine (sinds 25-10-2026) ─────────
// Zelfde opzet als de andere keuzehulpen: type, capsulesysteem en budget zijn
// een harde grens, elke machine krijgt een passcore en de lijst is alles wat
// dicht bij de top zit. Vroeger: filters na elkaar (ook op touch, ontkalken
// en thee, die vrijwel iedereen heeft of die niet ingevuld zijn) en de
// goedkoopste als "beste match".
//
// Passcore = 100
//   - een wens (melk, bonenmaler, 2 kopjes tegelijk, app, veel koffiesoorten,
//     thermoskan, timer) die hij niet heeft: −150, onbekend: −40
//   - filter, kopjes per kan: −3 per kopje te weinig (onbekend −6)
//   - prijs: de duurste in de lijst verliest tot 5 punten
// `wens` is dezelfde score zonder het prijsdeel (voor de "Meer budget?"-kaart).
const WENS_STRAF = 150, WENS_ONBEKEND = 40;
export const BAND_BESTE = 4;
const BAND_LIJST = 10;
const MIN_LIJST = 5;
const MAX_LIJST = 30;
const PRIJS_GEWICHT = 5;
export const VEEL_DRANKEN = 8;
export const KOPJES_MIN = { groot: 12 };

export const lijst = a => (Array.isArray(a) ? a : []).filter(v => v !== "geen");

/** Alle wensen uit de antwoorden, als sleutels voor heeftWens(). */
export function wensenVan(a) {
  const w = [];
  if (a?.melk === "auto") w.push("melk-auto");
  else if (a?.melk === "stoom") w.push("melk-stoom");
  else if (a?.melk === "ja") w.push("melk");
  if (a?.molen === "ja") w.push("molen");
  else if (a?.molen === "nee") w.push("zonder-molen");
  for (const e of lijst(a?.extraAnswers)) w.push(e);
  return w;
}

/** Heeft de machine deze wens? true / false / null (onbekend). */
export function heeftWens(k, wens) {
  const ja = v => (v === null || v === undefined ? null : v);
  switch (wens) {
    case "melk-auto": return k.melk ? k.melk === "auto" : null;
    case "melk-stoom": return k.melk ? k.melk === "stoom" || k.melk === "auto" : null;
    case "melk": return k.melk ? k.melk !== "geen" : null;
    case "molen": return ja(k.molen);
    case "zonder-molen": return k.molen === null ? null : !k.molen;
    case "tweekopjes": return ja(k.tweeKopjes);
    case "app": return ja(k.app);
    case "dranken": return k.aantalDranken === null ? null : k.aantalDranken >= VEEL_DRANKEN;
    case "thermoskan": return ja(k.thermoskan);
    case "timer": return ja(k.timer);
    case "grind": return ja(k.molen);
    default: return true;
  }
}

/** Type + capsulesysteem: de machines die mogen meedoen (zonder budget). */
export function poolVoor(koffiemachines, answers) {
  const opType = answers?.type ? koffiemachines.filter(k => k.type === answers.type) : koffiemachines;
  const basis = opType.length ? opType : koffiemachines;
  if (answers?.type !== "capsules" || !answers?.systeem || answers.systeem === "maakt-niet-uit") return basis;
  const opSysteem = basis.filter(k => k.systeem === answers.systeem);
  return opSysteem.length ? opSysteem : basis;
}

const straf = h => (h === true ? 0 : h === false ? WENS_STRAF : WENS_ONBEKEND);

function straffen(k, a) {
  let s = 0;
  for (const w of wensenVan(a)) s += straf(heeftWens(k, w));
  const min = KOPJES_MIN[a.kopjes];
  if (a.type === "filter" && min) s += Number.isFinite(k.capaciteitKopjes) ? Math.max(0, min - k.capaciteitKopjes) * 3 : 6;
  return s;
}

// Plek van een prijs binnen een lijst: 0 = goedkoopste, 1 = duurste.
function prijsPlek(pool) {
  const prijzen = pool.map(k => parsePrice(k.prijs)).sort((x, y) => x - y);
  return prijs => (prijzen.length < 2 ? 0 : prijzen.filter(x => x < prijs).length / (prijzen.length - 1));
}

export function scoreKoffiemachines(pool, answers = {}) {
  const plek = prijsPlek(pool);
  return pool.map(k => {
    const wens = 100 - straffen(k, answers);
    const fit = wens - PRIJS_GEWICHT * plek(parsePrice(k.prijs));
    return { ...k, wens: Math.round(wens * 10) / 10, fit: Math.round(fit * 10) / 10 };
  });
}

/** Beste match: de goedkoopste van de machines die even goed passen als de beste. */
export function kiesBesteMatch(lijstIn) {
  const metScore = (lijstIn ?? []).filter(k => Number.isFinite(k?.fit));
  if (!metScore.length) return null;
  const top = Math.max(...metScore.map(k => k.fit));
  return metScore.filter(k => k.fit >= top - BAND_BESTE).reduce((x, y) => {
    const px = parsePrice(x.prijs), py = parsePrice(y.prijs);
    return py < px || (py === px && y.fit > x.fit) ? y : x;
  });
}

/**
 * @param {object[]} koffiemachines  genormaliseerde machines (utils.normalizeProducts)
 * @param {object} answers           antwoorden uit de quiz (answers.budget: maximum of null)
 * @param {number|null} [budget]     overschrijft answers.budget (null = zonder grens)
 */
export function matchKoffiemachines(koffiemachines, answers, budget = answers?.budget) {
  const leeg = { bestMatch: null, bestType: null, filteredMatchedKoffiemachines: [], topWens: null };
  if (!Array.isArray(koffiemachines) || koffiemachines.length === 0) return leeg;

  const cap = Number(budget) || null;
  const pool = poolVoor(koffiemachines, answers).filter(k => !cap || parsePrice(k.prijs) <= cap);
  if (pool.length === 0) return leeg;

  const gescoord = scoreKoffiemachines(pool, answers ?? {}).sort((x, y) => y.fit - x.fit);
  const top = gescoord[0].fit;
  const uit = [];
  let zichtbaar = 0;
  for (const k of gescoord) {
    if (zichtbaar >= MAX_LIJST) break;
    if (k.fit < top - BAND_LIJST && zichtbaar >= MIN_LIJST) break;
    uit.push(k);
    if ((k.aanbieders ?? []).length >= DEFAULT_MIN_AANBIEDERS) zichtbaar++;
  }
  uit.sort((x, y) => parsePrice(x.prijs) - parsePrice(y.prijs));

  return {
    bestMatch: kiesBesteMatch(uit),
    bestType: "Algemeen",
    filteredMatchedKoffiemachines: uit,
    topWens: Math.max(...uit.map(k => k.wens)),
  };
}

// De kaartpunten ("Waarom dit bij jou past") staan in punten.js.
