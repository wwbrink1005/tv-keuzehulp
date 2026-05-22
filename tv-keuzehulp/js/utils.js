export const qs = (selector, root = document) => root.querySelector(selector);
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

export function normalizeTypeLabel(typeValue) {
  const raw = String(typeValue ?? "").trim();
  return raw;
}

export function parseHzValue(tv) {
  const hzValue = tv?.Hz ?? tv?.hz;
  if (hzValue === undefined || hzValue === null) return null;
  const hzNumber = parseInt(String(hzValue).replace(/[^0-9]/g, ""), 10);
  return Number.isNaN(hzNumber) ? null : hzNumber;
}

export function getResolutionCategory(tv) {
  const scherpteValue = String(tv?.scherpte ?? "").toLowerCase();
  if (!scherpteValue) return "";
  if (scherpteValue.includes("8k")) return "8K";
  if (scherpteValue.includes("4k") || scherpteValue.includes("ultra hd")) return "4K";
  return "<4K";
}

export function getResolutionTier(tv) {
  const scherpteValue = String(tv?.scherpte ?? "").toLowerCase();
  if (!scherpteValue) return "";
  if (scherpteValue.includes("8k")) return "8K";
  if (scherpteValue.includes("4k") || scherpteValue.includes("ultra hd")) return "4K";
  if (scherpteValue.includes("full hd")) return "Full HD";
  if (scherpteValue.includes("hd ready")) return "HD Ready";
  return "";
}

export function formatScherpte(value) {
  const label = String(value ?? "");
  const normalized = label.replace(/\s+/g, " ").trim().toLowerCase();
  if (normalized.includes("8k")) {
    return "8K";
  }
  if (normalized.includes("4k") || normalized.includes("ultra hd")) {
    return "4K";
  }
  return label;
}

export function getStoredSelection() {
  return {
    sizeGroup: localStorage.getItem("selectedSizeGroup") || "",
    priceLabel: localStorage.getItem("selectedPriceGroupLabel") || ""
  };
}

const PRODUCT_TYPE_MAP = {
  "LED": "LED",
  "OLED": "OLED",
  "QLED": "QLED",
  "Mini LED": "Mini LED",
  "Neo QLED": "Neo QLED"
};

export function normalizeProducts(rawProducts) {
  if (!Array.isArray(rawProducts)) return [];

  return rawProducts.flatMap(product => {
    if (!product.type || !product.grootte || !product.merk || !product.scherpte || !product.hz) {
      return [];
    }

    const normalizedType = PRODUCT_TYPE_MAP[product.type];
    if (!normalizedType) return [];

    const aanbieders = Array.isArray(product.aanbieders) ? product.aanbieders : [];
    const aanbieder = aanbieders[0];
    if (!aanbieder) return [];

    const naam = String(aanbieder.productnaam_cb || "").trim() || String(aanbieder.productnaam_expert || "").trim();
    if (!naam) return [];

    const prijsCb = parseFloat(String(aanbieder.prijs_cb || "").replace(",", "."));
    const prijsExpert = parseFloat(String(aanbieder.prijs_expert || "").replace(",", "."));
    const validPrices = [prijsCb, prijsExpert].filter(p => Number.isFinite(p) && p > 0);
    if (validPrices.length === 0) return [];
    const prijs = Math.min(...validPrices);

    const afbeelding = String(aanbieder.afbeelding_cb || "").trim() || String(aanbieder.afbeelding_expert || "").trim();

    const hzNum = parseInt(String(product.hz).replace(/[^0-9]/g, ""), 10);
    if (Number.isNaN(hzNum)) return [];

    const grootteNum = parseInt(product.grootte, 10);
    if (Number.isNaN(grootteNum)) return [];

    return [{
      type: normalizedType,
      naam,
      prijs,
      grootte: grootteNum,
      merk: product.merk,
      scherpte: product.scherpte,
      Hz: hzNum,
      afbeelding,
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
 * Computes 2-3 price buckets dynamically based on actual TV prices in the
 * database for the given size group. The first bucket always starts at 0
 * and the last always ends at Infinity, so no TV is ever excluded.
 *
 * @param {object[]} tvs - normalised TV list
 * @param {string} sizeGroup - e.g. "55"
 * @param {object} allowedSizes - e.g. sizeGroupToAllowedSizes from data.js
 * @returns {{ label: string, min: number, max: number }[]}
 */
export function computeDynamicPriceGroups(tvs, sizeGroup, allowedSizes) {
  const sizes = allowedSizes[sizeGroup] || [];
  const prices = tvs
    .filter(tv => sizes.includes(tv.grootte))
    .map(tv => parsePrice(tv.prijs))
    .filter(p => Number.isFinite(p) && p > 0)
    .sort((a, b) => a - b);

  if (prices.length === 0) return [];

  const n = prices.length;

  if (n <= 2) {
    const displayMin = floorNice(prices[0]);
    return [{ label: `${displayMin}+`, min: 0, max: Number.POSITIVE_INFINITY }];
  }

  const numBuckets = n < 6 ? 2 : 3;

  // Find split points at equal-count percentiles
  const rawSplits = [];
  for (let i = 1; i < numBuckets; i++) {
    const idx = Math.floor(n * i / numBuckets);
    rawSplits.push(roundNice((prices[idx - 1] + prices[idx]) / 2));
  }

  // Deduplicate: keep only strictly increasing splits
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
