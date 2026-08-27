import { TYPE_MAPPING, WATERTANK_MAX, MELK_AUTOMATISCH_WAARDEN } from "./data.js";
import { parsePrice } from "./utils.js";

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
  }
  return null;
}

export function applyTypeFilter(koffiemachines, type) {
  if (!TYPE_MAPPING[type]) return koffiemachines;
  const filtered = koffiemachines.filter(k => classificeerType(k) === type);
  return filtered.length > 0 ? filtered : koffiemachines;
}

// ─── Hoeveelheid (Q2: watertank-capaciteit) ─────────────────────────────────
// Drempels zijn per type (zie WATERTANK_MAX in data.js) — de watertank-range
// verschilt te drastisch tussen bv. capsulemachines (0,5-1,0 l) en
// volautomaten (1,7-2,3 l) om met 1 globale drempel te werken.

function getWatertankThresholds(type) {
  return WATERTANK_MAX[type] ?? WATERTANK_MAX.volautomaat;
}

export function applyWatertankFilter(koffiemachines, hoeveelheid, type) {
  if (!hoeveelheid) return koffiemachines;
  const thresholds = getWatertankThresholds(type);

  let filtered;
  if (hoeveelheid === "klein") {
    filtered = koffiemachines.filter(k => k.capaciteitWatertankL !== null && k.capaciteitWatertankL <= thresholds.klein);
  } else if (hoeveelheid === "gemiddeld") {
    filtered = koffiemachines.filter(k => k.capaciteitWatertankL !== null && k.capaciteitWatertankL > thresholds.klein && k.capaciteitWatertankL <= thresholds.gemiddeld);
  } else if (hoeveelheid === "groot") {
    filtered = koffiemachines.filter(k => k.capaciteitWatertankL !== null && k.capaciteitWatertankL > thresholds.gemiddeld);
  } else {
    return koffiemachines;
  }
  return filtered.length > 0 ? filtered : koffiemachines;
}

// ─── Melk (Q3, overgeslagen in de quiz bij type "filter" — zie quiz.js) ────
// "nee" filtert bewust niets: bij ~50% van de espressomachines ontbreekt dit
// veld simpelweg (niet expliciet "Nee"), dus filteren op "Nee" zou machines
// met onbekende status onterecht uitsluiten. Alleen een positieve wens
// (automatisch/handmatig) is een betrouwbaar filter.

export function applyMelkFilter(koffiemachines, melk) {
  if (melk === "automatisch") {
    const auto = koffiemachines.filter(k => MELK_AUTOMATISCH_WAARDEN.has(k.melkToevoegen));
    return auto.length > 0 ? auto : koffiemachines;
  }
  if (melk === "handmatig") {
    const met = koffiemachines.filter(k => k.melkopschuimer === "Ja");
    return met.length > 0 ? met : koffiemachines;
  }
  return koffiemachines;
}

// ─── Extra preferences (Q4) ─────────────────────────────────────────────────

export function applyExtraFilter(koffiemachines, extraAnswers) {
  if (!Array.isArray(extraAnswers) || extraAnswers.includes("geen") || extraAnswers.length === 0) {
    return koffiemachines;
  }

  let filtered = [...koffiemachines];

  if (extraAnswers.includes("touchbediening")) {
    const ts = filtered.filter(k => k.bediening.includes("Touch"));
    if (ts.length > 0) filtered = ts;
  }

  if (extraAnswers.includes("wifi")) {
    const wf = filtered.filter(k => k.wifi === "Ja");
    if (wf.length > 0) filtered = wf;
  }

  if (extraAnswers.includes("antikalk")) {
    const ak = filtered.filter(k => k.automatischAntikalk === "Ja");
    if (ak.length > 0) filtered = ak;
  }

  if (extraAnswers.includes("thee")) {
    const th = filtered.filter(k => k.varianten.includes("Thee"));
    if (th.length > 0) filtered = th;
  }

  return filtered;
}

// ─── Main matching function ───────────────────────────────────────────────

export function matchKoffiemachines(koffiemachines, answers) {
  if (!Array.isArray(koffiemachines) || koffiemachines.length === 0) {
    return { bestMatch: null, bestType: null, filteredMatchedKoffiemachines: [] };
  }

  let matched = applyTypeFilter(koffiemachines, answers?.type ?? "");
  matched = applyWatertankFilter(matched, answers?.hoeveelheid ?? "", answers?.type ?? "");
  matched = applyMelkFilter(matched, answers?.melk ?? "");
  matched = applyExtraFilter(matched, answers?.extraAnswers ?? []);

  // Verplichte eindfallback: geen harde partitie hier, dus de volledige
  // catalogus is zelf al de basis om op terug te vallen.
  if (matched.length === 0) matched = [...koffiemachines];

  const bestMatch = matched.reduce((cheapest, k) => {
    return parsePrice(k.prijs) < parsePrice(cheapest.prijs) ? k : cheapest;
  });

  return { bestMatch, bestType: "Algemeen", filteredMatchedKoffiemachines: matched };
}

const TYPE_LABELS = {
  volautomaat:  "een volautomaat",
  halfautomaat: "een halfautomaat/handmatige espressomachine",
  capsules:     "capsules of pads",
  filter:       "filterkoffie",
};

const HOEVEELHEID_LABELS = {
  klein:     "1-2 personen",
  gemiddeld: "een gemiddeld huishouden",
  groot:     "een groot huishouden of veel bezoek",
};

export function buildResultPoints(koffiemachine, answers) {
  const points = [];
  const type = answers?.type ?? "";
  const hoeveelheid = answers?.hoeveelheid ?? "";
  const melk = answers?.melk ?? "";
  const extraAnswers = Array.isArray(answers?.extraAnswers) ? answers.extraAnswers : [];

  // Houdt bij welk feit al in een punt verwerkt is, zodat de generieke
  // aanvulling verderop nooit hetzelfde gegeven nog een keer herhaalt.
  const gebruikt = new Set();

  const typeKlopt = Boolean(type) && classificeerType(koffiemachine) === type;

  if (typeKlopt) {
    if (type === "volautomaat") {
      points.push("Volautomaat: koffie op één druk op de knop, inclusief bonen malen");
      gebruikt.add("type");
    } else if (type === "halfautomaat") {
      points.push("Handmatige/halfautomatische bediening voor volledige controle over je espresso");
      gebruikt.add("type");
    } else if (type === "capsules") {
      const systeem = koffiemachine.capsuleSysteem ? ` (${koffiemachine.capsuleSysteem})` : "";
      points.push(`Werkt met capsules of pads${systeem}, snel en zonder gedoe`);
      gebruikt.add("type");
    } else if (type === "filter") {
      points.push("Filterkoffiezetapparaat, ideaal voor een grote kan in één keer");
      gebruikt.add("type");
    }
  }

  if (hoeveelheid && koffiemachine.capaciteitWatertankL !== null) {
    const thresholds = WATERTANK_MAX[type] ?? WATERTANK_MAX.volautomaat;
    const l = koffiemachine.capaciteitWatertankL;
    const zitInTier =
      (hoeveelheid === "klein" && l <= thresholds.klein) ||
      (hoeveelheid === "gemiddeld" && l > thresholds.klein && l <= thresholds.gemiddeld) ||
      (hoeveelheid === "groot" && l > thresholds.gemiddeld);
    if (zitInTier) {
      const label = HOEVEELHEID_LABELS[hoeveelheid] ?? "";
      points.push(`${l} liter waterreservoir, geschikt voor ${label}`);
      gebruikt.add("watertank");
    }
  }

  if (melk === "automatisch" && MELK_AUTOMATISCH_WAARDEN.has(koffiemachine.melkToevoegen)) {
    points.push("Automatische melkopschuimer, voor cappuccino en latte zonder moeite");
    gebruikt.add("melk");
  } else if (melk === "handmatig" && koffiemachine.melkopschuimer === "Ja") {
    points.push("Melkopschuimer aanwezig om zelf cappuccino of latte te maken");
    gebruikt.add("melk");
  }

  if (extraAnswers.includes("touchbediening") && koffiemachine.bediening.includes("Touch")) {
    points.push("Touchbediening");
  }

  if (extraAnswers.includes("wifi") && koffiemachine.wifi === "Ja") {
    points.push("Wifi: slim te bedienen via app");
  }

  if (extraAnswers.includes("antikalk") && koffiemachine.automatischAntikalk === "Ja") {
    points.push("Automatisch ontkalkingssysteem");
  }

  if (extraAnswers.includes("thee") && koffiemachine.varianten.includes("Thee")) {
    points.push("Kan ook thee zetten");
  }

  // Generieke aanvulling: garandeert altijd 4 punten. Elk feit hierboven kan
  // hier nog maar 1x bijdragen (zie 'gebruikt').
  if (points.length < 4 && !gebruikt.has("type") && koffiemachine.typeProduct) {
    points.push(`Type: ${koffiemachine.typeProduct}`);
    gebruikt.add("type");
  }
  if (points.length < 4 && koffiemachine.varianten.length > 0) {
    const top = koffiemachine.varianten.slice(0, 3).join(", ");
    points.push(`Kan onder andere: ${top}`);
  }
  if (points.length < 4 && !gebruikt.has("watertank") && koffiemachine.capaciteitWatertankL !== null) {
    points.push(`${koffiemachine.capaciteitWatertankL} liter waterreservoir`);
    gebruikt.add("watertank");
  }
  if (points.length < 4 && koffiemachine.vermogenWatt !== null) {
    points.push(`${koffiemachine.vermogenWatt} watt vermogen`);
  }
  if (points.length < 4 && koffiemachine.merk) {
    points.push(`${koffiemachine.merk}, een bekend merk in koffiemachines`);
  }
  // Pure vangnet-zinnen, geen productdata nodig — 3 stuks, zelfde reden als
  // bij airfryer/beamer (2 bleek eerder niet altijd genoeg).
  if (points.length < 4) {
    points.push("Betrouwbare keuze voor dagelijks gebruik");
  }
  if (points.length < 4) {
    points.push("Onderdeel van een uitgebreid assortiment koffiemachines bij onze aanbieders");
  }
  if (points.length < 4) {
    points.push("Vergeleken op basis van actuele prijzen bij onze aanbieders");
  }

  return points.slice(0, 4);
}
