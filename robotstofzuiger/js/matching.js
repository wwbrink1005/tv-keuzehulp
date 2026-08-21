import { heeftLidarNavigatie, woninggrootteMinLooptijd, GELUID_BELANGRIJK_DB, GELUID_BELANGRIJK_FALLBACK_DB, GELUID_GEMIDDELD_DB } from "./data.js";
import { parsePrice } from "./utils.js";

// Robotstofzuigers hebben geen fysieke pasvorm-eis zoals vaatwasser (inbouw/
// vrijstaand) of wasmachine (capaciteit) — dus geen harde eerste filter.
// Alle vragen zijn zachte, gracieus degraderende voorkeursfilters die in
// cascade worden toegepast op de volledige catalogus.

// ─── Navigatie ──────────────────────────────────────────────────────────────

export function applyNavigatieFilter(robots, navigatie) {
  if (navigatie !== "belangrijk") return robots;
  const lidar = robots.filter(r => heeftLidarNavigatie(r.navigatieType));
  return lidar.length > 0 ? lidar : robots;
}

// ─── Dweilfunctie ───────────────────────────────────────────────────────────

export function applyDweilFilter(robots, dweilen) {
  if (dweilen === "ja") {
    const metDweil = robots.filter(r => r.natDweilen === "Ja");
    return metDweil.length > 0 ? metDweil : robots;
  }
  if (dweilen === "liever-niet") {
    const zonderDweil = robots.filter(r => r.natDweilen === "Nee");
    return zonderDweil.length > 0 ? zonderDweil : robots;
  }
  return robots;
}

// ─── Woninggrootte → minimale looptijd ─────────────────────────────────────

export function applyWoninggrootteFilter(robots, woninggrootte) {
  const min = woninggrootteMinLooptijd[woninggrootte];
  if (!min) return robots;
  const filtered = robots.filter(r => r.looptijdMin !== null && r.looptijdMin >= min);
  return filtered.length > 0 ? filtered : robots;
}

// ─── Geluid ─────────────────────────────────────────────────────────────────

export function applyGeluidFilter(robots, geluid) {
  if (geluid === "belangrijk") {
    const stil = robots.filter(r => r.geluidDb !== null && r.geluidDb <= GELUID_BELANGRIJK_DB);
    if (stil.length > 0) return stil;
    const redelijkStil = robots.filter(r => r.geluidDb !== null && r.geluidDb <= GELUID_BELANGRIJK_FALLBACK_DB);
    if (redelijkStil.length > 0) return redelijkStil;
    return robots;
  }

  if (geluid === "gemiddeld") {
    const redelijk = robots.filter(r => r.geluidDb !== null && r.geluidDb <= GELUID_GEMIDDELD_DB);
    if (redelijk.length > 0) return redelijk;
    return robots;
  }

  return robots;
}

// ─── Extra preferences (Functies) ──────────────────────────────────────────

export function applyExtraFilter(robots, extraAnswers) {
  if (!Array.isArray(extraAnswers) || extraAnswers.includes("geen") || extraAnswers.length === 0) {
    return robots;
  }

  let filtered = [...robots];

  if (extraAnswers.includes("zelflegend")) {
    const zl = filtered.filter(r => r.zelflegend === "Ja");
    if (zl.length > 0) filtered = zl;
  }

  if (extraAnswers.includes("obstakeldetectie")) {
    const od = filtered.filter(r => r.obstakeldetectie === "Ja");
    if (od.length > 0) filtered = od;
  }

  if (extraAnswers.includes("hepa")) {
    const hp = filtered.filter(r => r.hepaFilter === "Ja");
    if (hp.length > 0) filtered = hp;
  }

  if (extraAnswers.includes("wifi")) {
    const wf = filtered.filter(r => r.wifi === "Ja");
    if (wf.length > 0) filtered = wf;
  }

  if (extraAnswers.includes("alexa")) {
    const al = filtered.filter(r => r.alexa === "Ja");
    if (al.length > 0) filtered = al;
  }

  if (extraAnswers.includes("google-assistent")) {
    const ga = filtered.filter(r => r.googleAssistent === "Ja");
    if (ga.length > 0) filtered = ga;
  }

  return filtered;
}

// ─── Main matching function ───────────────────────────────────────────────

export function matchRobotstofzuigers(robots, answers) {
  if (!Array.isArray(robots) || robots.length === 0) {
    return { bestMatch: null, bestType: null, filteredMatchedRobotstofzuigers: [] };
  }

  let matched = applyNavigatieFilter(robots, answers?.navigatie ?? "");
  matched = applyDweilFilter(matched, answers?.dweilen ?? "");
  matched = applyWoninggrootteFilter(matched, answers?.woninggrootte ?? "");
  matched = applyGeluidFilter(matched, answers?.geluid ?? "");
  matched = applyExtraFilter(matched, answers?.extraAnswers ?? []);

  // Verplichte eindfallback: geen harde partitie hier, dus de volledige
  // catalogus is zelf al de basis om op terug te vallen.
  if (matched.length === 0) matched = [...robots];

  const bestMatch = matched.reduce((cheapest, r) => {
    return parsePrice(r.prijs) < parsePrice(cheapest.prijs) ? r : cheapest;
  });

  return { bestMatch, bestType: "Algemeen", filteredMatchedRobotstofzuigers: matched };
}

export function buildResultPoints(robot, answers) {
  const points = [];
  const geluid = answers?.geluid ?? "";

  if (heeftLidarNavigatie(robot.navigatieType)) {
    points.push("LiDAR-navigatie voor nauwkeurige plattegronden");
  }

  if (robot.natDweilen === "Ja") {
    points.push("Combineert stofzuigen met dweilen");
  }

  if (robot.zelflegend === "Ja") {
    points.push("Zelflegend stofreservoir in het basisstation");
  }

  if (geluid === "belangrijk" && robot.geluidDb) {
    points.push(`Extra stil in gebruik (${robot.geluidDb} dB)`);
  } else if (robot.geluidDb && robot.geluidDb <= 62) {
    points.push(`Stil in gebruik (${robot.geluidDb} dB)`);
  }

  if (robot.looptijdMin) {
    points.push(`Tot ${robot.looptijdMin} minuten looptijd op 1 acculading`);
  }

  if (robot.obstakeldetectie === "Ja") {
    points.push("Detecteert en vermijdt obstakels automatisch");
  }

  if (robot.hepaFilter === "Ja") {
    points.push("HEPA-filter voor fijnstof en allergenen");
  }

  if (robot.wifi === "Ja") {
    points.push("Bedienbaar op afstand via wifi/app");
  }

  // Generieke aanvulling: garandeert altijd 4 punten. merk is gegarandeerd
  // aanwezig (harde eis in normalizeProducts()); de rest is best-effort.
  if (points.length < 4 && robot.zuigkracht) {
    points.push(`${robot.zuigkracht} Pa zuigkracht`);
  }
  if (points.length < 4 && robot.merk) {
    points.push(`${robot.merk}, een bekend merk in robotstofzuigers`);
  }
  if (points.length < 4) {
    points.push("Betrouwbare keuze voor dagelijks gebruik");
  }
  if (points.length < 4) {
    points.push("Onderdeel van een uitgebreid assortiment robotstofzuigers bij onze aanbieders");
  }
  // Robotstofzuigers hebben geen gegarandeerd numeriek veld zoals capaciteit
  // bij wasmachine/vaatwasser (alleen merk is een harde eis in
  // normalizeProducts()) — getest tegen de volledige live catalogus zakte
  // een product met alleen merk gevuld terug tot 3 punten zonder deze 3e
  // pure vangnet-zin (zie 5.5 in nieuwe-keuzehulp.md).
  if (points.length < 4) {
    points.push("Vergeleken op basis van actuele prijzen bij onze aanbieders");
  }

  return points.slice(0, 4);
}
