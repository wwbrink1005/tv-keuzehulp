export const qs  = (selector, root = document) => root.querySelector(selector);
export const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

export function getContainerScale(element) {
  const container = element?.closest?.(".background-container")
    ?? document.querySelector(".background-container");
  if (!container) return 1;

  const style = getComputedStyle(container);
  const baseWidth = parseFloat(style.getPropertyValue("--base-width"));
  const resolvedBaseWidth = Number.isFinite(baseWidth) && baseWidth > 0 ? baseWidth : 1242.21;

  const scale = container.offsetWidth / resolvedBaseWidth;
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

export function parsePrice(value) {
  if (value === undefined || value === null) return Number.NaN;
  if (typeof value === "string") {
    return parseFloat(value.replace(",", "."));
  }
  return parseFloat(value);
}

export function formatPriceLabel(priceValue) {
  const numericPrice = Number.isFinite(priceValue) ? priceValue : 0;
  const integerPrice = Math.trunc(numericPrice);
  return integerPrice.toLocaleString("nl-NL");
}

/**
 * Normalizes raw airfryer products from Supabase to a consistent internal
 * shape. Geen harde partitie (airfryers zijn altijd vrijstaand) — alleen
 * merk en een geldige aanbieder zijn een harde eis, net als bij
 * robotstofzuiger.
 */
export function normalizeProducts(rawProducts) {
  if (!Array.isArray(rawProducts)) return [];

  return rawProducts.flatMap(product => {
    const rawAanbieders = Array.isArray(product.aanbieders) ? product.aanbieders : [];
    const aanbieders = rawAanbieders
      .map(a => ({ ...a, prijs: parseFloat(String(a.prijs || "").replace(",", ".")) }))
      .filter(a => a.url && Number.isFinite(a.prijs) && a.prijs > 0);
    if (aanbieders.length === 0) return [];

    const naam = String(product.titel || "").trim() || aanbieders.map(a => String(a.productnaam || "").trim()).find(Boolean) || "";
    if (!naam) return [];

    const prijs = Math.min(...aanbieders.map(a => a.prijs));

    const afbeelding   = String(product.icecat_afbeelding || "").trim();
    const afbeeldingen = Array.isArray(product.icecat_afbeeldingen) ? product.icecat_afbeeldingen : [];

    if (!product.merk) return [];

    return [{
      merk:                 product.merk,
      naam,
      prijs,
      capaciteitLiter:      Number.isFinite(product.capaciteitLiter) ? product.capaciteitLiter : null,
      capaciteitGram:       Number.isFinite(product.capaciteitGram) ? product.capaciteitGram : null,
      aantalPersonen:       Number.isFinite(product.aantalPersonen) ? product.aantalPersonen : null,
      constructietype:      product.constructietype ?? "",
      vermogenWatt:         Number.isFinite(product.vermogenWatt) ? product.vermogenWatt : null,
      aantalProgrammas:     Number.isFinite(product.aantalProgrammas) ? product.aantalProgrammas : null,
      frituurfunctie:       product.frituurfunctie ?? "Nee",
      bakfunctie:           product.bakfunctie ?? "Nee",
      grillen:              product.grillen ?? "Nee",
      braadfunctie:         product.braadfunctie ?? "Nee",
      stoomfunctie:         product.stoomfunctie ?? "Nee",
      dehydratiefunctie:    product.dehydratiefunctie ?? "Nee",
      warmhoudfunctie:      product.warmhoudfunctie ?? "Nee",
      kijkglas:             product.kijkglas ?? "Nee",
      display:              product.display ?? "Nee",
      vaatwasserbestendig:  product.vaatwasserbestendig ?? "Nee",
      kleur:                product.kleur ?? "",
      afbeelding,
      afbeeldingen,
      aanbieders
    }];
  });
}

function roundNice(value) {
  let step;
  if (value <= 100) step = 10;
  else if (value <= 500) step = 50;
  else if (value <= 2000) step = 100;
  else if (value <= 5000) step = 500;
  else step = 1000;
  return Math.round(value / step) * step;
}

function floorNice(value) {
  let step;
  if (value <= 100) step = 10;
  else if (value <= 500) step = 50;
  else if (value <= 2000) step = 100;
  else if (value <= 5000) step = 500;
  else step = 1000;
  return Math.floor(value / step) * step;
}

/**
 * Dynamically computes 1–3 price buckets from the prices of the given list
 * of airfryers. Altijd aanroepen met een vers opgehaalde catalogus, nooit
 * met de quiz-time localStorage-snapshot.
 */
export function computeDynamicPriceGroups(airfryers) {
  const prices = (airfryers || [])
    .map(a => parsePrice(a.prijs))
    .filter(p => Number.isFinite(p) && p > 0)
    .sort((a, b) => a - b);

  if (prices.length === 0) return [];

  const n = prices.length;

  if (n <= 2) {
    const displayMin = floorNice(prices[0]);
    return [{ label: `${displayMin}+`, min: 0, max: Number.POSITIVE_INFINITY }];
  }

  const numBuckets = n < 6 ? 2 : 3;

  const rawSplits = [];
  for (let i = 1; i < numBuckets; i++) {
    const idx = Math.floor(n * i / numBuckets);
    rawSplits.push(roundNice((prices[idx - 1] + prices[idx]) / 2));
  }

  const splits = [...new Set(rawSplits)].sort((a, b) => a - b);

  const buckets = [];
  let prevMax = 0;

  splits.forEach((split, i) => {
    const displayMin = i === 0 ? floorNice(prices[0]) : prevMax;
    buckets.push({ label: `${displayMin}-${split}`, min: prevMax, max: split });
    prevMax = split;
  });

  const lastDisplayMin = prevMax;
  buckets.push({ label: `${lastDisplayMin}+`, min: prevMax, max: Number.POSITIVE_INFINITY });

  return buckets;
}

/**
 * Dynamically computes 2–3 buckets for capaciteitLiter, from de actuele
 * live catalogus (zelfde kwantiel-aanpak als computeDynamicPriceGroups).
 */
export function computeDynamicCapaciteitGroups(airfryers) {
  const waarden = (airfryers || [])
    .map(a => a.capaciteitLiter)
    .filter(v => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);

  if (waarden.length === 0) return [];

  const n = waarden.length;
  if (n <= 2) {
    const displayMin = Math.floor(waarden[0]);
    return [{ label: `${displayMin}+ L`, min: 0, max: Number.POSITIVE_INFINITY }];
  }

  const numBuckets = n < 6 ? 2 : 3;
  const rawSplits = [];
  for (let i = 1; i < numBuckets; i++) {
    const idx = Math.floor(n * i / numBuckets);
    rawSplits.push(Math.round((waarden[idx - 1] + waarden[idx]) / 2 * 10) / 10);
  }
  const splits = [...new Set(rawSplits)].sort((a, b) => a - b);

  const buckets = [];
  let prevMax = 0;

  splits.forEach((split, i) => {
    const displayMin = i === 0 ? Math.floor(waarden[0]) : prevMax;
    buckets.push({ label: `${displayMin}-${split} L`, min: prevMax, max: split });
    prevMax = split;
  });

  const lastDisplayMin = prevMax;
  buckets.push({ label: `${lastDisplayMin}+ L`, min: prevMax, max: Number.POSITIVE_INFINITY });

  return buckets;
}
