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
    capaciteitGroup: localStorage.getItem("wasmachine_selectedCapaciteitGroup") || "",
    priceLabel:      localStorage.getItem("wasmachine_selectedPriceGroupLabel") || ""
  };
}

/**
 * Normalizes raw wasmachine products from Supabase to a consistent internal shape.
 */
export function normalizeProducts(rawProducts) {
  if (!Array.isArray(rawProducts)) return [];

  return rawProducts.flatMap(product => {
    const aanbieders = Array.isArray(product.aanbieders) ? product.aanbieders : [];
    const aanbieder = aanbieders[0];
    if (!aanbieder) return [];

    const naam = String(aanbieder.productnaam_cb || "").trim()
               || String(aanbieder.productnaam_expert || "").trim();
    if (!naam) return [];

    const prijsCb     = parseFloat(String(aanbieder.prijs_cb     || "").replace(",", "."));
    const prijsExpert = parseFloat(String(aanbieder.prijs_expert || "").replace(",", "."));
    const validPrices = [prijsCb, prijsExpert].filter(p => Number.isFinite(p) && p > 0);
    if (validPrices.length === 0) return [];
    const prijs = Math.min(...validPrices);

    const afbeelding   = String(product.icecat_afbeelding || "").trim();
    const afbeeldingen = Array.isArray(product.icecat_afbeeldingen) ? product.icecat_afbeeldingen : [];

    const capaciteit = parseFloat(product.capaciteit);
    if (Number.isNaN(capaciteit) || capaciteit <= 0) return [];

    if (!product.merk) return [];

    const centrifugeRpm = parseInt(String(product.centrifugeRpm ?? "").replace(/[^0-9]/g, ""), 10) || 0;

    return [{
      merk:             product.merk,
      naam,
      prijs,
      capaciteit,
      typeLader:        product.typeLader        ?? "",
      plaatsing:        product.plaatsing        ?? "",
      centrifugeRpm,
      energieLabel:     product.energieLabel     ?? "",
      geluidDb:         parseInt(String(product.geluidDb ?? "").replace(/[^0-9]/g, ""), 10) || null,
      kleur:            product.kleur            ?? "",
      inverter:         product.inverter         ?? "Nee",
      display:          product.display          ?? "Nee",
      uitgesteldeStart: product.uitgesteldeStart ?? "Nee",
      kinderslot:       product.kinderslot       ?? "Nee",
      aquastop:         product.aquastop         ?? "Nee",
      afbeelding,
      afbeeldingen,
      aanbieder
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
 * Dynamically computes 2–3 price buckets from actual wasmachine prices in the
 * given capaciteitsgroep.
 */
export function computeDynamicPriceGroups(wasmachines, capaciteitGroup, allowedCapaciteit) {
  const capaciteiten = allowedCapaciteit[capaciteitGroup] || [];
  const prices = wasmachines
    .filter(w => capaciteiten.includes(w.capaciteit))
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
