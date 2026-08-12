import { getSoundbarTier, breedteGroupToRange, scoringSystem, TIER_ORDER } from "./data.js";
import { parsePrice } from "./utils.js";

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

  for (let i = 0; i < sortedTiers.length; i++) {
    const [, topScore] = sortedTiers[i];
    const tiersWithTopScore = sortedTiers
      .filter(([, s]) => Number(s) === Number(topScore))
      .map(([t]) => t);

    let candidates = filtered.filter(sb => tiersWithTopScore.includes(getSoundbarTier(sb)));

    if (candidates.length === 0) continue;

    // 3. Subwoofer-filter
    candidates = applySubwooferFilter(candidates, answers.subwoofer ?? "");
    if (candidates.length === 0) continue;

    // 4. Extra wensen
    candidates = applyExtraFilter(candidates, answers.extraAnswers ?? []);
    if (candidates.length === 0) continue;

    matchedSoundbars = [...candidates];
    bestType = tiersWithTopScore.join(" / ");
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

export function buildResultPoints(soundbar, answers) {
  const points = [];
  const gebruik = Array.isArray(answers?.gebruik) ? answers.gebruik : [];
  const decoders = String(soundbar.audio_decoders || "").toLowerCase();
  const hasAtmos = decoders.includes("atmos") || decoders.includes("dts:x") || decoders.includes("dts x");

  if (soundbar.kanalen) {
    // Icecat's waarde bevat het woord "kanalen" al (bijv. "3.1.2 kanalen").
    points.push(soundbar.kanalen);
  }

  if (hasAtmos && (gebruik.includes("films") || gebruik.includes("gaming"))) {
    points.push("Dolby Atmos / DTS:X voor meeslepend surroundgeluid");
  } else if (hasAtmos) {
    points.push("Ondersteunt Dolby Atmos / DTS:X");
  }

  if (soundbar.subwoofer_meegeleverd === "Ja") {
    points.push("Inclusief subwoofer voor stevige bas");
  }

  if (soundbar.vermogen_watt > 0) {
    points.push(`${soundbar.vermogen_watt}W totaal vermogen`);
  }

  if (soundbar.earc === "Ja") {
    points.push("HDMI eARC voor de beste geluidskwaliteit en één afstandsbediening");
  }

  if (soundbar.wandmontage === "Ja") {
    points.push("Geschikt voor wandmontage");
  }

  if (soundbar.wifi === "Ja") {
    points.push("WiFi-streaming (Spotify Connect, AirPlay of vergelijkbaar)");
  }

  return points.slice(0, 4);
}
