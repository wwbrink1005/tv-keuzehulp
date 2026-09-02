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

// Een stofzuiger heeft geen natuurlijke prestatie-tier-as zoals een tv
// (schermgrootte) of laptop (processorklasse) — "Zuigkracht" is bij Icecat
// een zwak gevuld, niet-gestandaardiseerd veld (zie sessie-onderzoek).
// Net als koelkast/vriezer/printer: 1 harde knop (type), daarna alleen
// gracieus degraderende voorkeursfilters, geen scoring-cascade.

// ─── Harde knop: cilinder- vs steelstofzuiger ─────────────────────────────

export function filterByType(stofzuigers, stofzuigerType) {
  if (stofzuigerType !== "Steelstofzuiger" && stofzuigerType !== "Cilinderstofzuiger") {
    return stofzuigers;
  }
  return stofzuigers.filter(s => s.stofzuigerType === stofzuigerType);
}

// ─── Vloertype (Q2) ─────────────────────────────────────────────────────

export function applyVloertypeFilter(stofzuigers, vloertype) {
  if (!vloertype || vloertype === "allebei") return stofzuigers;

  if (vloertype === "tapijt") {
    const matched = stofzuigers.filter(s => s.geschiktTapijt);
    return matched.length > 0 ? matched : stofzuigers;
  }

  if (vloertype === "harde_vloer") {
    const matched = stofzuigers.filter(s => s.geschiktHardeVloer);
    return matched.length > 0 ? matched : stofzuigers;
  }

  return stofzuigers;
}

// ─── Huisdieren/allergie (Q3) → voorkeur voor HEPA-filtering ──────────────

export function applyHuisdierenFilter(stofzuigers, huisdierenAntwoord) {
  if (huisdierenAntwoord !== "huisdieren" && huisdierenAntwoord !== "allergie") return stofzuigers;
  const matched = stofzuigers.filter(s => s.heeftHepaFilter);
  return matched.length > 0 ? matched : stofzuigers;
}

// ─── Dynamische vraag 4: zak-voorkeur (cilinder) of looptijd (steel) ──────

export function applyZakFilter(stofzuigers, zakAntwoord) {
  if (zakAntwoord !== "met_zak" && zakAntwoord !== "zonder_zak") return stofzuigers;
  const gewenst = zakAntwoord === "met_zak" ? "Stofzak" : "Zakloos";
  const matched = stofzuigers.filter(s => s.containerType === gewenst);
  return matched.length > 0 ? matched : stofzuigers;
}

// Minuten-drempel per antwoordoptie — zie vragen/index.html voor de labels.
const LOOPTIJD_MINIMUM = {
  "45min": 0,
  "60min": 60,
  "90min": 90,
};

export function applyLooptijdFilter(stofzuigers, looptijdAntwoord) {
  const minimum = LOOPTIJD_MINIMUM[looptijdAntwoord];
  if (!minimum) return stofzuigers;
  const matched = stofzuigers.filter(s => s.looptijdMinuten !== null && s.looptijdMinuten >= minimum);
  return matched.length > 0 ? matched : stofzuigers;
}

// ─── Geluid (Q5) — relatief t.o.v. de resterende kandidaten, geen vaste
// dB-drempel: cilinder- en steelstofzuigers zitten qua geluidsniveau op een
// andere schaal (cilinder mediaan ~75 dB, steel ~80 dB, sessie-onderzoek) —
// een universele drempel zou bij het ene type bijna niets doen en bij het
// andere bijna alles wegfilteren. Filtert daarom op "stiller dan de mediaan
// van wat er nu nog over is", wat zich vanzelf aanpast aan het gekozen type.

function mediaan(getallen) {
  const sorted = [...getallen].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function applyGeluidFilter(stofzuigers, geluidBelangrijk) {
  if (geluidBelangrijk !== "belangrijk") return stofzuigers;
  const metDb = stofzuigers.filter(s => s.geluidsniveauDb !== null);
  if (metDb.length < 2) return stofzuigers;
  const grens = mediaan(metDb.map(s => s.geluidsniveauDb));
  const matched = stofzuigers.filter(s => s.geluidsniveauDb !== null && s.geluidsniveauDb <= grens);
  return matched.length > 0 ? matched : stofzuigers;
}

// ─── Main matching function ───────────────────────────────────────────────

export function matchStofzuigers(stofzuigers, answers) {
  if (!Array.isArray(stofzuigers) || !answers?.stofzuigerType) {
    return { bestMatch: null, bestType: null, filteredMatchedStofzuigers: [] };
  }

  // 1. Harde knop: type
  const filtered = filterByType(stofzuigers, answers.stofzuigerType);
  if (filtered.length === 0) {
    return { bestMatch: null, bestType: null, filteredMatchedStofzuigers: [] };
  }

  // 2-5. Gracieus degraderende voorkeursfilters, elk apart toegepast
  let matched = applyVloertypeFilter(filtered, answers.vloertype);
  matched = applyHuisdierenFilter(matched, answers.huisdieren);
  matched = applyZakFilter(matched, answers.zak);
  matched = applyLooptijdFilter(matched, answers.looptijd);
  matched = applyGeluidFilter(matched, answers.geluid);

  // Verplichte eindfallback: nooit leeg als de type-partitie wél voorraad heeft.
  if (matched.length === 0) {
    matched = [...filtered];
  }

  const bestType = answers.stofzuigerType;

  const bestMatch = matched.reduce((goedkoopste, s) => {
    return parsePrice(s.prijs) < parsePrice(goedkoopste.prijs) ? s : goedkoopste;
  });

  return { bestMatch, bestType, filteredMatchedStofzuigers: matched };
}

export function buildResultPoints(stofzuiger, answers) {
  const points = [];
  const isSteel = stofzuiger.stofzuigerType === "Steelstofzuiger";

  if (isSteel) {
    points.push("Draadloos, licht en wendbaar in gebruik");
  } else {
    points.push("Met snoer, doorgaans krachtiger en zonder oplaadtijd");
  }

  if (answers?.vloertype === "tapijt" && stofzuiger.geschiktTapijt) {
    points.push("Geschikt voor tapijt en vloerkleden");
  } else if (answers?.vloertype === "harde_vloer" && stofzuiger.geschiktHardeVloer) {
    points.push("Geschikt voor harde vloeren zoals parket en tegels");
  } else if (stofzuiger.geschiktTapijt && stofzuiger.geschiktHardeVloer) {
    points.push("Geschikt voor zowel tapijt als harde vloeren");
  }

  if ((answers?.huisdieren === "huisdieren" || answers?.huisdieren === "allergie") && stofzuiger.heeftHepaFilter) {
    points.push("HEPA-filtering, vangt fijnstof en allergenen goed af");
  }

  if (isSteel && stofzuiger.looptijdMinuten) {
    points.push(`Tot ${stofzuiger.looptijdMinuten} minuten gebruik op 1 acculading`);
  } else if (!isSteel && stofzuiger.containerType) {
    points.push(stofzuiger.containerType === "Stofzak" ? "Werkt met stofzakken" : "Zakloos, geen wegwerpkosten");
  }

  if (stofzuiger.geluidsniveauDb !== null && points.length < 4) {
    points.push(`Geluidsniveau van ${stofzuiger.geluidsniveauDb} dB`);
  }

  // Generieke aanvulling: garandeert altijd 4 punten (merk en type zijn
  // gegarandeerd aanwezig; de rest is best-effort, Icecat-datagaten komen
  // voor bij stofzuigers).
  if (points.length < 4 && stofzuiger.gewichtKg) {
    points.push(`Weegt ${String(stofzuiger.gewichtKg).replace(".", ",")} kg`);
  }
  if (points.length < 4 && stofzuiger.containerType && !points.some(p => p.includes("zak"))) {
    points.push(stofzuiger.containerType === "Stofzak" ? "Werkt met stofzakken" : "Zakloos ontwerp");
  }
  if (points.length < 4 && stofzuiger.merk) {
    points.push(`Van het merk ${stofzuiger.merk}`);
  }
  if (points.length < 4) {
    points.push("Betrouwbare keuze voor dagelijks gebruik");
  }

  return points.slice(0, 4);
}
