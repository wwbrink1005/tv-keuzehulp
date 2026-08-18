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
    sizeGroup: localStorage.getItem("laptop_selectedSizeGroup") || ""
  };
}

/**
 * Normalizes raw laptop products from Supabase to a consistent internal shape.
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

    const schermdiagonaal = parseFloat(product.schermdiagonaal);
    if (Number.isNaN(schermdiagonaal)) return [];

    const werkgeheugen = parseInt(product.werkgeheugen, 10);
    if (Number.isNaN(werkgeheugen)) return [];

    const opslag = parseInt(product.opslag, 10);
    if (Number.isNaN(opslag)) return [];

    const hz = parseInt(String(product.hz).replace(/[^0-9]/g, ""), 10);
    if (Number.isNaN(hz)) return [];

    const gewicht = parseFloat(product.gewicht);
    // gewicht may be missing for some laptops; don't reject if NaN

    if (!product.merk || !product.processor || !product.paneeltype || !product.resolutie) {
      return [];
    }

    return [{
      merk:           product.merk,
      naam,
      prijs,
      schermdiagonaal,
      werkgeheugen,
      opslag,
      touchscreen:    product.touchscreen ?? "Nee",
      usb_c:          product.usb_c ?? "Nee",
      hdmi:           parseInt(product.hdmi, 10) || 0,
      resolutie:      product.resolutie,
      paneeltype:     product.paneeltype,
      hz,
      processor:      product.processor,
      processor_familie: product.processor_familie ?? "",
      gpu:            product.gpu ?? "",
      gewicht:        Number.isFinite(gewicht) ? gewicht : null,
      os:             product.os ?? "",
      kleur:          product.kleur ?? "",
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
 * Dynamically computes 2–3 price buckets from actual laptop prices
 * in the given size group.
 */
export function computeDynamicPriceGroups(laptops, sizeGroup, allowedSizes) {
  const sizes = allowedSizes[sizeGroup] || [];
  const prices = laptops
    .filter(l => sizes.includes(l.schermdiagonaal))
    .map(l => parsePrice(l.prijs))
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

  const splits = [];
  for (const s of rawSplits) {
    if (splits.length === 0 || s > splits[splits.length - 1]) {
      splits.push(s);
    }
  }

  if (splits.length === 0) {
    const displayMin = floorNice(prices[0]);
    return [{ label: `${displayMin}+`, min: 0, max: Number.POSITIVE_INFINITY }];
  }

  const groups = [];
  for (let i = 0; i <= splits.length; i++) {
    const min = i === 0 ? 0 : splits[i - 1];
    const max = i === splits.length ? Number.POSITIVE_INFINITY : splits[i];

    let label;
    if (i === splits.length) {
      label = `${min}+`;
    } else {
      const displayMin = i === 0 ? floorNice(prices[0]) : min;
      label = `${displayMin}-${max}`;
    }

    groups.push({ label, min, max });
  }

  return groups;
}
