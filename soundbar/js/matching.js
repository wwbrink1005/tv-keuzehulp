import { getSoundbarTier, breedteGroupToRange, scoringSystem, TIER_ORDER } from "./data.js";
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

// ─── Score computation ────────────────────────────────────────────────────────

export function calculateScores(answers) {
  const scores = { Compact: 0, Allround: 0, HomeCinema: 0, Premium: 0 };

  const gebruik = Array.isArray(answers.gebruik)
    ? answers.gebruik
    : (answers.gebruik ? [answers.gebruik] : []);

  for (const g of gebruik) {
    if (scoringSystem.gebruik[g]) {
      for (const tier of TIER_ORDER) {
        scores[tier] += scoringSystem.gebruik[g][tier] ?? 0;
      }
    }
  }

  return scores;
}

// ─── Subwoofer-filter (vraag 3) ────────────────────────────────────────────────

export function applySubwooferFilter(soundbars, subwoofer) {
  if (subwoofer === "ja") {
    const met = soundbars.filter(sb => sb.subwoofer_meegeleverd === "Ja");
    if (met.length > 0) return met;
    return soundbars;
  }

  if (subwoofer === "nee") {
    const zonder = soundbars.filter(sb => sb.subwoofer_meegeleverd === "Nee");
    if (zonder.length > 0) return zonder;
    return soundbars;
  }

  // "maakt-niet-uit" → geen filter
  return soundbars;
}

// ─── Extra wensen (vraag 4) ────────────────────────────────────────────────────

export function applyExtraFilter(soundbars, extraAnswers) {
  if (!Array.isArray(extraAnswers) || extraAnswers.includes("geen") || extraAnswers.length === 0) {
    return soundbars;
  }

  let filtered = [...soundbars];

  if (extraAnswers.includes("surround")) {
    const surround = filtered.filter(sb => {
      const d = String(sb.audio_decoders || "").toLowerCase();
      return d.includes("atmos") || d.includes("dts:x") || d.includes("dts x");
    });
    if (surround.length > 0) filtered = surround;
  }

  if (extraAnswers.includes("wandmontage")) {
    const wand = filtered.filter(sb => sb.wandmontage === "Ja");
    if (wand.length > 0) filtered = wand;
  }

  if (extraAnswers.includes("streaming")) {
    const streaming = filtered.filter(sb => sb.wifi === "Ja");
    if (streaming.length > 0) filtered = streaming;
  }

  return filtered;
}

// Strikte versie van de wensfilters: alleen soundbars die aan ÁLLE wensen
// voldoen (subwoofer + extra's), zonder terug te vallen. Gebruikt om eerst een
// tier te zoeken waarin alle wensen vervuld worden, voordat er een wens mag
// wegvallen (zie matchSoundbars).
const heeftAtmos = sb => {
  const d = String(sb.audio_decoders || "").toLowerCase();
  return d.includes("atmos") || d.includes("dts:x") || d.includes("dts x");
};

function voldoetAanAlleWensen(soundbars, answers) {
  const sub = answers.subwoofer ?? "";
  const extra = Array.isArray(answers.extraAnswers) ? answers.extraAnswers : [];
  return soundbars.filter(sb =>
    (sub !== "ja" || sb.subwoofer_meegeleverd === "Ja") &&
    (sub !== "nee" || sb.subwoofer_meegeleverd === "Nee") &&
    (!extra.includes("surround") || heeftAtmos(sb)) &&
    (!extra.includes("wandmontage") || sb.wandmontage === "Ja") &&
    (!extra.includes("streaming") || sb.wifi === "Ja")
  );
}

// ─── Main matching function ───────────────────────────────────────────────────

export function matchSoundbars(soundbars, breedteGroup, priceGroup, answers, scores) {
  if (!Array.isArray(soundbars) || !breedteGroup) {
    return { bestMatch: null, bestType: null, filteredMatchedSoundbars: [] };
  }

  const range = breedteGroupToRange[breedteGroup];

  // 1. Filter op breedte + prijs
  let filtered = soundbars.filter(sb => {
    const price = parsePrice(sb.prijs);
    const withinBreedte = !range || (Number.isFinite(sb.breedte_mm) && sb.breedte_mm >= range.min && sb.breedte_mm < range.max);
    return (
      withinBreedte &&
      (!priceGroup || (price >= priceGroup.min && price <= priceGroup.max))
    );
  });

  if (filtered.length === 0) {
    return { bestMatch: null, bestType: null, filteredMatchedSoundbars: [] };
  }

  // 2. Beste tier op basis van score
  const sortedTiers = Object.entries(scores)
    .sort((a, b) => Number(b[1]) - Number(a[1]));

  let matchedSoundbars = [];
  let bestType = null;

  // 2a. Eerst de best scorende tier waarin ALLE wensen vervuld kunnen worden.
  // De tier komt uit het gebruik (een voorkeur), de wensen zijn expliciet
  // aangevinkt: die gaan voor. Zonder deze stap viel bv. "Dolby Atmos" bij
  // "vooral tv-kijken" stil weg (die tier heeft per definitie geen Atmos),
  // terwijl er in dezelfde breedte wel Atmos-soundbars waren.
  const scoresAflopend = [...new Set(sortedTiers.map(([, s]) => Number(s)))];
  for (const score of scoresAflopend) {
    const tiers = sortedTiers.filter(([, s]) => Number(s) === score).map(([t]) => t);
    let beste = null, besteNaam = null;
    for (const tier of tiers) {
      const kandidaten = voldoetAanAlleWensen(filtered.filter(sb => getSoundbarTier(sb) === tier), answers);
      if (kandidaten.length && (!beste || kandidaten.length < beste.length)) { beste = kandidaten; besteNaam = tier; }
    }
    if (beste) { matchedSoundbars = beste; bestType = besteNaam; break; }
  }

  // 2b. Kan dat in geen enkele tier: de best scorende tier, waarbij een wens
  // die daar niet bestaat wegvalt (gracieuze degradatie).
  for (let i = 0; i < sortedTiers.length && matchedSoundbars.length === 0; i++) {
    const [, topScore] = sortedTiers[i];
    const tiersWithTopScore = sortedTiers
      .filter(([, s]) => Number(s) === Number(topScore))
      .map(([t]) => t);

    // Bij een gelijke stand tussen tiers (bv. "muziek": Allround en Premium
    // scoren allebei 8) voegen we ze niet samen — dat maakt de resultatenlijst
    // juist breder (getest: 45 van de 117 soundbars bij zo'n samenvoeging).
    // We evalueren elke getelde tier apart en kiezen de kleinste niet-lege
    // resultatenset, zelfde patroon als monitor/laptop.
    let bestTierCandidates = null;
    let bestTierName = null;

    for (const tier of tiersWithTopScore) {
      let tierCandidates = filtered.filter(sb => getSoundbarTier(sb) === tier);
      tierCandidates = applySubwooferFilter(tierCandidates, answers.subwoofer ?? "");
      tierCandidates = applyExtraFilter(tierCandidates, answers.extraAnswers ?? []);
      if (tierCandidates.length === 0) continue;
      if (bestTierCandidates === null || tierCandidates.length < bestTierCandidates.length) {
        bestTierCandidates = tierCandidates;
        bestTierName = tier;
      }
    }

    if (bestTierCandidates === null) continue;

    matchedSoundbars = bestTierCandidates;
    bestType = bestTierName;
    break;
  }

  // Verplichte eindfallback: als de tier-cascade niets opleverde, val terug
  // op alle breedte+prijs-gefilterde soundbars (met subwoofer/extra-filter
  // waar mogelijk), zodat een prijscategorie met wél voorraad nooit "geen
  // resultaten" teruggeeft.
  if (matchedSoundbars.length === 0) {
    let fallback = applySubwooferFilter(filtered, answers.subwoofer ?? "");
    fallback = applyExtraFilter(fallback, answers.extraAnswers ?? []);
    if (fallback.length === 0) fallback = [...filtered];
    matchedSoundbars = fallback;
    bestType = "Algemeen";
  }

  // Beste match = goedkoopste in de gematchte set
  const bestMatch = matchedSoundbars.reduce((cheapest, sb) => {
    return parsePrice(sb.prijs) < parsePrice(cheapest.prijs) ? sb : cheapest;
  });

  return { bestMatch, bestType, filteredMatchedSoundbars: matchedSoundbars };
}

// De kaartpunten ("Waarom dit bij jou past") staan in punten.js.
