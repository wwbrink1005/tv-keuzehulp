import { gezinsgrootteMinCouverts, GELUID_BELANGRIJK_DB, GELUID_BELANGRIJK_FALLBACK_DB, GELUID_GEMIDDELD_DB } from "./data.js";
import { parsePrice } from "./utils.js";

// Een vaatwasser heeft geen natuurlijke prestatie-tier-as (net als koelkast/
// vriezer) — wél een echte harde partitie (inbouw vs vrijstaand, in
// tegenstelling tot wasdroger waar die niet bestond). Structuur: harde
// plaatsing-filter, dan een reeks gracieus degraderende zachte
// voorkeursfilters, met een verplichte eindfallback.

// ─── Hard filter: inbouw vs vrijstaand ─────────────────────────────────────

export function filterByPlaatsing(vaatwassers, plaatsing) {
  return vaatwassers.filter(v => v.plaatsing === plaatsing);
}

// ─── Zachte voorkeur: gezinsgrootte → minimaal aantal couverts ────────────

export function applyGezinsgrootteFilter(vaatwassers, gezinsgrootte) {
  const min = gezinsgrootteMinCouverts[gezinsgrootte];
  if (!min) return vaatwassers;
  const filtered = vaatwassers.filter(v => v.couverts !== null && v.couverts >= min);
  return filtered.length > 0 ? filtered : vaatwassers;
}

// ─── Geluid filter ─────────────────────────────────────────────────────────

export function applyGeluidFilter(vaatwassers, geluid) {
  if (geluid === "belangrijk") {
    const stil = vaatwassers.filter(v => v.geluidDb !== null && v.geluidDb <= GELUID_BELANGRIJK_DB);
    if (stil.length > 0) return stil;
    const redelijkStil = vaatwassers.filter(v => v.geluidDb !== null && v.geluidDb <= GELUID_BELANGRIJK_FALLBACK_DB);
    if (redelijkStil.length > 0) return redelijkStil;
    return vaatwassers;
  }

  if (geluid === "gemiddeld") {
    const redelijk = vaatwassers.filter(v => v.geluidDb !== null && v.geluidDb <= GELUID_GEMIDDELD_DB);
    if (redelijk.length > 0) return redelijk;
    return vaatwassers;
  }

  return vaatwassers;
}

// ─── Energiezuinigheid filter ───────────────────────────────────────────────

export function applyEnergieFilter(vaatwassers, energie) {
  if (energie === "belangrijk") {
    const zuinig = vaatwassers.filter(v => ["A", "B"].includes(v.energieLabel));
    if (zuinig.length > 0) return zuinig;
    const redelijkZuinig = vaatwassers.filter(v => ["A", "B", "C"].includes(v.energieLabel));
    if (redelijkZuinig.length > 0) return redelijkZuinig;
    return vaatwassers;
  }

  if (energie === "gemiddeld") {
    const redelijk = vaatwassers.filter(v => ["A", "B", "C", "D"].includes(v.energieLabel));
    if (redelijk.length > 0) return redelijk;
    return vaatwassers;
  }

  return vaatwassers;
}

// ─── Extra preferences (Functies) ──────────────────────────────────────────

export function applyExtraFilter(vaatwassers, extraAnswers) {
  if (!Array.isArray(extraAnswers) || extraAnswers.includes("geen") || extraAnswers.length === 0) {
    return vaatwassers;
  }

  let filtered = [...vaatwassers];

  if (extraAnswers.includes("kinderslot")) {
    const ks = filtered.filter(v => v.kinderslot === "Ja");
    if (ks.length > 0) filtered = ks;
  }

  if (extraAnswers.includes("halve-lading")) {
    const hl = filtered.filter(v => v.halveLading === "Ja");
    if (hl.length > 0) filtered = hl;
  }

  if (extraAnswers.includes("wifi")) {
    const wf = filtered.filter(v => v.wifi === "Ja");
    if (wf.length > 0) filtered = wf;
  }

  if (extraAnswers.includes("verstelbare-bovenkorf")) {
    const vb = filtered.filter(v => v.verstelbareBovenkorf === "Ja");
    if (vb.length > 0) filtered = vb;
  }

  if (extraAnswers.includes("aquastop")) {
    const aq = filtered.filter(v => v.aquastop === "Ja");
    if (aq.length > 0) filtered = aq;
  }

  if (extraAnswers.includes("inverter")) {
    const inv = filtered.filter(v => v.inverter === "Ja");
    if (inv.length > 0) filtered = inv;
  }

  if (extraAnswers.includes("glasbescherming")) {
    const gb = filtered.filter(v => v.glasbescherming === "Ja");
    if (gb.length > 0) filtered = gb;
  }

  if (extraAnswers.includes("extra-droog")) {
    const ed = filtered.filter(v => v.droogprestaties === "A");
    if (ed.length > 0) filtered = ed;
  }

  return filtered;
}

// ─── Specifieke afwasprogramma's ───────────────────────────────────────────

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

export function applyProgrammaFilter(vaatwassers, programmaAnswers) {
  if (!Array.isArray(programmaAnswers) || programmaAnswers.includes("geen") || programmaAnswers.length === 0) {
    return vaatwassers;
  }

  let filtered = [...vaatwassers];

  for (const key of programmaAnswers) {
    const match = filtered.filter(v => heeftAfwasprogramma(v.afwasprogrammas, key));
    if (match.length > 0) filtered = match;
  }

  return filtered;
}

// ─── Main matching function ───────────────────────────────────────────────

export function matchVaatwassers(vaatwassers, answers) {
  if (!Array.isArray(vaatwassers) || !answers?.plaatsing) {
    return { bestMatch: null, bestType: null, filteredMatchedVaatwassers: [] };
  }

  // 1. Hard filter: plaatsing
  const filtered = filterByPlaatsing(vaatwassers, answers.plaatsing);
  if (filtered.length === 0) {
    return { bestMatch: null, bestType: null, filteredMatchedVaatwassers: [] };
  }

  // 2. Zachte voorkeur: gezinsgrootte
  let matched = applyGezinsgrootteFilter(filtered, answers.gezinsgrootte);

  // 3. Geluid
  matched = applyGeluidFilter(matched, answers.geluid ?? "");

  // 4. Energiezuinigheid
  matched = applyEnergieFilter(matched, answers.energie ?? "");

  // 5. Extra's
  matched = applyExtraFilter(matched, answers.extraAnswers ?? []);

  // 6. Specifieke afwasprogramma's
  matched = applyProgrammaFilter(matched, answers.programmaAnswers ?? []);

  // Verplichte eindfallback: nooit leeg teruggeven als de plaatsing-
  // gefilterde set wél voorraad heeft.
  if (matched.length === 0) {
    let fallback = applyGezinsgrootteFilter(filtered, answers.gezinsgrootte);
    fallback = applyGeluidFilter(fallback, answers.geluid ?? "");
    if (fallback.length === 0) fallback = [...filtered];
    matched = fallback;
  }

  const bestType = answers.plaatsing === "inbouw" ? "Inbouw" : "Vrijstaand";

  const bestMatch = matched.reduce((cheapest, v) => {
    return parsePrice(v.prijs) < parsePrice(cheapest.prijs) ? v : cheapest;
  });

  return { bestMatch, bestType, filteredMatchedVaatwassers: matched };
}

export function buildResultPoints(vaatwasser, answers) {
  const points = [];
  const gezinsgrootte = answers?.gezinsgrootte ?? "";
  const programmaAnswers = answers?.programmaAnswers ?? [];

  if (vaatwasser.couverts) {
    if (gezinsgrootte === "groot" && vaatwasser.couverts >= 15) {
      points.push(`Ruime ${vaatwasser.couverts} couverts, goed voor een groot huishouden`);
    } else if (gezinsgrootte === "gemiddeld" && vaatwasser.couverts >= 13) {
      points.push(`${vaatwasser.couverts} couverts, goed voor een gezin van 3 tot 4 personen`);
    } else {
      points.push(`${vaatwasser.couverts} couverts`);
    }
  }

  const gevondenProgrammas = programmaAnswers
    .filter(key => key !== "geen" && heeftAfwasprogramma(vaatwasser.afwasprogrammas, key))
    .map(key => ({
      eco: "Eco", intensief: "Intensief", snel: "Snel", stil: "Stil",
      voorwas: "Voorwas", glas: "Glas/Breekbaar",
    }[key]))
    .filter(Boolean);
  if (gevondenProgrammas.length > 0) {
    points.push(`Programma's: ${gevondenProgrammas.join(", ")}`);
  }

  if (["A", "B", "C"].includes(vaatwasser.energieLabel)) {
    points.push(`Laag energieverbruik dankzij energielabel ${vaatwasser.energieLabel}`);
  }

  if (answers?.geluid === "belangrijk" && vaatwasser.geluidDb) {
    points.push(`Extra stil in gebruik (${vaatwasser.geluidDb} dB)`);
  } else if (vaatwasser.geluidDb && vaatwasser.geluidDb <= 42) {
    points.push(`Stil in gebruik (${vaatwasser.geluidDb} dB)`);
  }

  if (vaatwasser.aquastop === "Ja") {
    points.push("AquaStop-functie tegen waterschade");
  }

  if (vaatwasser.verstelbareBovenkorf === "Ja") {
    points.push("In hoogte verstelbare bovenkorf voor grotere borden");
  }

  if (vaatwasser.wifi === "Ja") {
    points.push("Bedienbaar op afstand via wifi/app");
  }

  if (vaatwasser.plaatsing === "inbouw") {
    points.push("Inbouwmodel, past onder het keukenblad");
  } else {
    points.push("Vrijstaand model, overal in de keuken te plaatsen");
  }

  // Generieke aanvulling: garandeert altijd 4 punten. plaatsing en merk zijn
  // gegarandeerd aanwezig (harde eis in normalizeProducts()); de rest is
  // best-effort.
  if (points.length < 4 && vaatwasser.energieLabel && !points.some(p => p.includes("energielabel"))) {
    points.push(`Energielabel ${vaatwasser.energieLabel}`);
  }
  if (points.length < 4 && vaatwasser.geluidDb && !points.some(p => p.includes("dB"))) {
    points.push(`Geluidsniveau van ${vaatwasser.geluidDb} dB`);
  }
  if (points.length < 4 && vaatwasser.merk) {
    points.push(`${vaatwasser.merk}, een bekend merk in vaatwassers`);
  }
  if (points.length < 4) {
    points.push("Betrouwbare keuze voor dagelijks gebruik");
  }
  if (points.length < 4) {
    points.push("Onderdeel van een uitgebreid assortiment vaatwassers bij onze aanbieders");
  }

  return points.slice(0, 4);
}
