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
    capaciteitGroup: localStorage.getItem("wasdroger_selectedCapaciteitGroup") || ""
  };
}

/**
 * Normalizes raw wasdroger products from Supabase to a consistent internal shape.
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

    const capaciteit = parseFloat(product.capaciteit);
    if (Number.isNaN(capaciteit) || capaciteit <= 0) return [];

    if (!product.merk) return [];

    return [{
      merk:             product.merk,
      naam,
      prijs,
      capaciteit,
      droogsysteem:     product.droogsysteem     ?? "",
      plaatsing:        product.plaatsing        ?? "",
      cyclusDuurMin:    Number.isFinite(product.cyclusDuurMin) ? product.cyclusDuurMin : null,
      energieLabel:     product.energieLabel     ?? "",
      geluidDb:         Number.isFinite(product.geluidDb) ? product.geluidDb : null,
      kleur:            product.kleur            ?? "",
      kinderslot:       product.kinderslot       ?? "Nee",
      uitgesteldeStart: product.uitgesteldeStart ?? "Nee",
      wifi:             product.wifi             ?? "Nee",
      inverter:         product.inverter         ?? "Nee",
      antikreuk:        product.antikreuk        ?? "Nee",
      vochtsensor:      product.vochtsensor      ?? "Nee",
      droogprogrammas:  product.droogprogrammas  ?? "",
      breedteMm:        Number.isFinite(product.breedteMm) ? product.breedteMm : null,
      diepteMm:         Number.isFinite(product.diepteMm)  ? product.diepteMm  : null,
      hoogteMm:         Number.isFinite(product.hoogteMm)  ? product.hoogteMm  : null,
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
 * Dynamically computes 2–3 price buckets from actual wasdroger prices in the
 * given capaciteitsgroep.
 */
export function computeDynamicPriceGroups(wasdrogers, capaciteitGroup, allowedCapaciteit) {
  const range = allowedCapaciteit[capaciteitGroup];
  const prices = wasdrogers
    .filter(w => range && Number.isFinite(w.capaciteit) && w.capaciteit >= range.min && w.capaciteit <= range.max)
    .map(w => parsePrice(w.prijs))
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
 * Dynamically computes 2–3 buckets (in cm) for a mm-based dimension field
 * (breedteMm/diepteMm/hoogteMm), from the actual live catalog.
 */
export function computeDynamicDimensionGroups(products, veld) {
  const waarden = products
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
