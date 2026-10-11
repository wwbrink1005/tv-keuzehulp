import { scoringSystem, TIER_ORDER } from "./data.js";
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
  const scores = { Budget: 0, Mid: 0, Krachtig: 0, Topklasse: 0 };

  const gebruik     = Array.isArray(answers.gebruik) ? answers.gebruik : (answers.gebruik ? [answers.gebruik] : []);
  const intensiteit = answers.intensiteit ?? "";

  for (const g of gebruik) {
    if (scoringSystem.gebruik[g]) {
      for (const tier of TIER_ORDER) {
        scores[tier] += scoringSystem.gebruik[g][tier] ?? 0;
      }
    }
  }

  if (intensiteit && scoringSystem.intensiteit[intensiteit]) {
    for (const tier of TIER_ORDER) {
      scores[tier] += scoringSystem.intensiteit[intensiteit][tier] ?? 0;
    }
  }

  return scores;
}

// ─── Opslag filter ────────────────────────────────────────────────────────────

export function applyOpslagFilter(desktops, opslag) {
  if (opslag === "veel") {
    const big = desktops.filter(d => d.opslag >= 2000);
    if (big.length > 0) return big;
    const medium = desktops.filter(d => d.opslag >= 1000);
    if (medium.length > 0) return medium;
    return desktops;
  }

  if (opslag === "gemiddeld") {
    const medium = desktops.filter(d => d.opslag >= 1000);
    if (medium.length > 0) return medium;
    return desktops;
  }

  // "weinig" → 512 GB is fine, no filter
  return desktops;
}

// ─── Werkgeheugen (RAM) filter ─────────────────────────────────────────────
// Geen eigen vraag — leunt op de al-bestaande "intensiteit"-vraag, zelfde
// patroon als laptop. ram_gb werd tot nu toe alleen als infobullet gebruikt,
// nooit om te filteren — waardoor bv. "intensief" + "gaming" een desktop met
// een sterke GPU maar slechts 8 GB RAM als top-match kon opleveren.
export function applyRamFilter(desktops, intensiteit) {
  if (intensiteit === "gemiddeld" || intensiteit === "intensief") {
    const medium = desktops.filter(d => d.ram >= 16);
    if (medium.length > 0) return medium;
    return desktops;
  }

  // "licht" → geen RAM-eis (8 GB is prima)
  return desktops;
}

// ─── Extra preferences filter ─────────────────────────────────────────────────

export function applyExtraFilter(desktops, extraAnswers) {
  if (!Array.isArray(extraAnswers) || extraAnswers.includes("geen") || extraAnswers.length === 0) {
    return desktops;
  }

  let filtered = [...desktops];

  if (extraAnswers.includes("rgb")) {
    const r = filtered.filter(d => d.rgb === "Ja");
    if (r.length > 0) filtered = r;
  }

  if (extraAnswers.includes("waterkoeling")) {
    const wk = filtered.filter(d => d.waterkoeling === "Ja");
    if (wk.length > 0) filtered = wk;
  }

  if (extraAnswers.includes("wifi")) {
    // De catalogus noemt de wifi-standaard ("Wifi 6E (802.11ax)"), nooit "Ja".
    const w = filtered.filter(d => Boolean(d.wifi) && d.wifi !== "Nee");
    if (w.length > 0) filtered = w;
  }

  return filtered;
}

// ─── Main matching function ───────────────────────────────────────────────────

export function matchDesktops(desktops, behuizingType, priceGroup, answers, scores) {
  if (!Array.isArray(desktops)) {
    return { bestMatch: null, bestType: null, filteredMatchedDesktops: [] };
  }

  // 1. Filter by behuizing category + price.
  // "maakt-niet-uit" (or no type selected) means every category is allowed —
  // including products whose category we couldn't classify (behuizingCategory
  // is null), since excluding them would throw away most of the catalog.
  let filtered = desktops.filter(d => {
    const price  = parsePrice(d.prijs);
    const typeOk = !behuizingType || behuizingType === "maakt-niet-uit" ||
                   d.behuizingCategory === behuizingType;
    return typeOk && (!priceGroup || (price >= priceGroup.min && price <= priceGroup.max));
  });

  if (filtered.length === 0) {
    return { bestMatch: null, bestType: null, filteredMatchedDesktops: [] };
  }

  // 2. Pick best-scoring GPU tier(s) by total score. Rather than stopping at
  // the first tier (or tied tiers) that has ANY stock, we widen to the next
  // best-scoring tier(s) until we hit a reasonable result count. This
  // matters for behuizing types where discrete GPUs are rare (all-in-one,
  // mini-pc): almost all stock sits in "Budget", so stopping at the first
  // nonempty tier could strand someone on a tiny niche tier (e.g. 2 gaming
  // all-in-ones) while ignoring 35 perfectly fine Budget ones with a lower
  // (but still relevant) score.
  const MIN_RESULTS = 5;
  const sortedTiers = Object.entries(scores)
    .sort((a, b) => Number(b[1]) - Number(a[1]));

  let matchedDesktops = [];
  let bestType = null;
  const tiersSoFar = [];

  for (let i = 0; i < sortedTiers.length; i++) {
    const [tier] = sortedTiers[i];
    tiersSoFar.push(tier);

    let candidates = filtered.filter(d => tiersSoFar.includes(d.gpuTier));
    if (candidates.length === 0) continue;

    // 3. Apply opslag filter
    candidates = applyOpslagFilter(candidates, answers.opslag ?? "");

    // 3b. Apply werkgeheugen (RAM) filter
    candidates = applyRamFilter(candidates, answers.intensiteit ?? "");

    // 4. Apply extra preferences
    candidates = applyExtraFilter(candidates, answers.extraAnswers ?? []);

    if (candidates.length === 0) continue;

    matchedDesktops = candidates;
    bestType = tiersSoFar.join(" / ");

    if (matchedDesktops.length >= MIN_RESULTS) break;
  }

  // Fallback: if tier matching yielded nothing, use all behuizing+price
  // filtered desktops (still applying opslag/extra where possible) so a
  // non-empty price bucket never results in an empty result set.
  if (matchedDesktops.length === 0) {
    let fallback = applyOpslagFilter(filtered, answers.opslag ?? "");
    fallback = applyRamFilter(fallback, answers.intensiteit ?? "");
    fallback = applyExtraFilter(fallback, answers.extraAnswers ?? []);
    if (fallback.length === 0) fallback = [...filtered];
    matchedDesktops = fallback;
    bestType = "Algemeen";
  }

  // Best match = cheapest in the matched set
  const bestMatch = matchedDesktops.reduce((cheapest, d) =>
    parsePrice(d.prijs) < parsePrice(cheapest.prijs) ? d : cheapest
  );

  return { bestMatch, bestType, filteredMatchedDesktops: matchedDesktops };
}

export function computeMatchForPriceGroup(desktops, behuizingType, priceGroup, answers, scores) {
  return matchDesktops(desktops, behuizingType, priceGroup, answers, scores);
}

// ─── Result points ────────────────────────────────────────────────────────────

// De kaartpunten ("Waarom dit bij jou past") staan in punten.js.
