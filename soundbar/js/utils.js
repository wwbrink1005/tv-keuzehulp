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

export function getStoredSelection() {
  return {
    breedteGroup: localStorage.getItem("soundbar_selectedBreedteGroup") || ""
  };
}

/**
 * Normalizes raw soundbar products from Supabase to a consistent internal shape.
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
      breedte_mm:           product.breedte_mm ?? null,
      hoogte_mm:            product.hoogte_mm  ?? null,
      diepte_mm:            product.diepte_mm  ?? null,
      kanalen:              product.kanalen        ?? "",
      audio_decoders:       product.audio_decoders ?? "",
      vermogen_watt:        product.vermogen_watt  ?? 0,
      subwoofer_meegeleverd: product.subwoofer_meegeleverd ?? "Nee",
      hdmi_poorten:         product.hdmi_poorten ?? 0,
      earc:                 product.earc         ?? "Nee",
      wandmontage:          product.wandmontage  ?? "Nee",
      wifi:                 product.wifi         ?? "Nee",
      bluetooth:            product.bluetooth    ?? "Nee",
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
 * Filtert soundbars op een breedtegroep (zie breedteGroupToRange in data.js).
 */
function filterByBreedteGroup(soundbars, breedteGroup, breedteGroupToRange) {
  const range = breedteGroupToRange[breedteGroup];
  if (!range) return soundbars; // "weet-ik-niet" of onbekend → geen filter
  return soundbars.filter(sb => Number.isFinite(sb.breedte_mm) && sb.breedte_mm >= range.min && sb.breedte_mm < range.max);
}

/**
 * Dynamically computes 2–3 price buckets from actual soundbar prices in the given breedtegroep.
 */
export function computeDynamicPriceGroups(soundbars, breedteGroup, breedteGroupToRange) {
  const scoped = filterByBreedteGroup(soundbars, breedteGroup, breedteGroupToRange);
  const prices = scoped
    .map(sb => parsePrice(sb.prijs))
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
 * Dynamically computes 2–3 buckets (in cm) for een mm-veld (breedte_mm/
 * diepte_mm/hoogte_mm), from de actuele live catalogus — zelfde kwantiel-
 * aanpak als computeDynamicPriceGroups, alleen op hele cm i.p.v. de
 * grovere prijs-afrondstappen.
 */
export function computeDynamicDimensionGroups(products, veld) {
  const waarden = (products || [])
    .map(p => p[veld])
    .filter(v => Number.isFinite(v) && v > 0)
    .map(mm => mm / 10)
    .sort((a, b) => a - b);

  if (waarden.length === 0) return [];

  const n = waarden.length;
  if (n <= 2) {
    const displayMin = Math.floor(waarden[0]);
    return [{ label: `${displayMin}+ cm`, min: 0, max: Number.POSITIVE_INFINITY }];
  }

  const numBuckets = n < 6 ? 2 : 3;
  const rawSplits = [];
  for (let i = 1; i < numBuckets; i++) {
    const idx = Math.floor(n * i / numBuckets);
    rawSplits.push(Math.round((waarden[idx - 1] + waarden[idx]) / 2));
  }
  const splits = [...new Set(rawSplits)].sort((a, b) => a - b);

  const buckets = [];
  let prevMax = 0;

  splits.forEach((split, i) => {
    const displayMin = i === 0 ? Math.floor(waarden[0]) : prevMax;
    buckets.push({ label: `${displayMin}-${split} cm`, min: prevMax, max: split });
    prevMax = split;
  });

  const lastDisplayMin = prevMax;
  buckets.push({ label: `${lastDisplayMin}+ cm`, min: prevMax, max: Number.POSITIVE_INFINITY });

  return buckets;
}
