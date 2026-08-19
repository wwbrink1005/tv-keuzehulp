import { classifyBehuizing } from "./data.js";

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
  if (typeof value === "string") return parseFloat(value.replace(",", "."));
  return parseFloat(value);
}

export function formatPriceLabel(priceValue) {
  const numericPrice = Number.isFinite(priceValue) ? priceValue : 0;
  const integerPrice = Math.trunc(numericPrice);
  return integerPrice.toLocaleString("nl-NL");
}

export function getStoredSelection() {
  return {
    behuizingType: localStorage.getItem("desktop_selectedBehuizingType") || ""
  };
}

export function parseRamGb(value) {
  if (!value) return 0;
  const m = String(value).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

export function parseOpslagGb(value) {
  if (!value) return 0;
  const m = String(value).match(/(\d+(?:[.,]\d+)?)\s*(TB|GB)/i);
  if (!m) return 0;
  const num = parseFloat(m[1].replace(",", "."));
  return m[2].toUpperCase() === "TB" ? Math.round(num * 1024) : Math.round(num);
}

/**
 * Normalizes raw desktop products from Supabase to a consistent internal shape.
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

    const ram    = parseRamGb(product.ram_gb);
    const opslag = parseOpslagGb(product.opslag_gb);

    if (!product.merk) return [];

    return [{
      merk:         product.merk,
      naam,
      prijs,
      ram,
      opslag,
      gpuTier:      product.gpuTier    ?? "Budget",
      gpu:          product.gpu        ?? "",
      behuizing:    product.behuizing  ?? null,
      behuizingCategory: classifyBehuizing(product.type_product, product.behuizing),
      wifi:         product.wifi       ?? "Nee",
      kleur:        product.kleur      ?? "",
      rgb:          product.rgb        ?? "Nee",
      waterkoeling: product.waterkoeling ?? "Nee",
      hdmiPoorten:  product.hdmiPoorten ?? 0,
      displayport:  product.displayport ?? 0,
      usbC:         product.usbC       ?? 0,
      os:                 product.os                 ?? "",
      processorFabrikant: product.processorFabrikant  ?? "",
      afbeelding,
      afbeeldingen,
      aanbieders
    }];
  });
}

function roundNice(value) {
  let step;
  if (value <= 100)       step = 10;
  else if (value <= 500)  step = 50;
  else if (value <= 2000) step = 100;
  else if (value <= 5000) step = 500;
  else                    step = 1000;
  return Math.round(value / step) * step;
}

function floorNice(value) {
  let step;
  if (value <= 100)       step = 10;
  else if (value <= 500)  step = 50;
  else if (value <= 2000) step = 100;
  else if (value <= 5000) step = 500;
  else                    step = 1000;
  return Math.floor(value / step) * step;
}

/**
 * Dynamically computes 2–3 price buckets from actual desktop prices
 * filtered by the chosen behuizing type.
 */
export function computeDynamicPriceGroups(desktops, behuizingType) {
  const prices = desktops
    .filter(d => {
      return !behuizingType || behuizingType === "maakt-niet-uit" ||
             d.behuizingCategory === behuizingType;
    })
    .map(d => parsePrice(d.prijs))
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
    if (splits.length === 0 || s > splits[splits.length - 1]) splits.push(s);
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
