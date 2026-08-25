// ─── Capaciteit (liter) → personen-drempels ────────────────────────────────
// capaciteit_liter is verreweg het best gevulde capaciteitsveld (88% van de
// live catalogus, tegenover 58% voor capaciteit_gram) — gebruikt als
// primaire as voor de personen-vraag. Live spreiding: 0,65-15L, mediaan
// 6,5L, p25 4,2L, p75 8,3L (geverifieerd tegen live data na de eerste
// pipeline-run, 155 producten).
export const capaciteitLiterMin = {
  klein:     0,
  gemiddeld: 5,
  groot:     8,
};

// ─── Static fallback price groups (alleen als de dynamische berekening niets
// oplevert, bv. vóór de catalogus geladen is) ───────────────────────────────
export const priceGroupsFallback = [
  { label: "0-100",   min: 0,   max: 100  },
  { label: "100-180", min: 100, max: 180  },
  { label: "180+",    min: 180, max: Number.POSITIVE_INFINITY }
];
