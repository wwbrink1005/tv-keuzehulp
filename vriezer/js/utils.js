import { classifyNishoogte, classifyPlaatsing, classifyVrijstaandGrootte, classifyVrieskistGrootte } from "./data.js";

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
 * Normalizes raw vriezer products from Supabase to a consistent internal
 * shape. Computes plaatsing/grootteGroup/nishoogteGroup classification
 * fields once here so matching.js can filter on precomputed fields, not
 * raw specs.
 */
export function normalizeProducts(rawProducts) {
  if (!Array.isArray(rawProducts)) return [];

  return rawProducts.flatMap(product => {
    const rawAanbieders = Array.isArray(product.aanbieders) ? product.aanbieders : [];
    const aanbieders = rawAanbieders
      .map(a => ({ ...a, prijs: parseFloat(String(a.prijs || "").replace(",", ".")) }))
      .filter(a => a.url && Number.isFinite(a.prijs) && a.prijs > 0);
    if (aanbieders.length === 0) return [];

    const naam = aanbieders.map(a => String(a.productnaam || "").trim()).find(Boolean) || "";
    if (!naam) return [];

    const prijs = Math.min(...aanbieders.map(a => a.prijs));

    const afbeelding   = String(product.icecat_afbeelding || "").trim();
    const afbeeldingen = Array.isArray(product.icecat_afbeeldingen) ? product.icecat_afbeeldingen : [];

    if (!product.merk) return [];

    const nettoInhoudL = parseFloat(product.netto_inhoud_l);

    const plaatsing = classifyPlaatsing(product.apparaatplaatsing, product.type_product);
    const nishoogteGroup = plaatsing === "inbouw"
      ? classifyNishoogte(product.nis_hoogte_cm, product.hoogte_mm)
      : null;
    const grootteGroup = plaatsing === "vrijstaand"
      ? classifyVrijstaandGrootte(nettoInhoudL)
      : plaatsing === "vrieskist"
        ? classifyVrieskistGrootte(nettoInhoudL)
        : null;

    const geluidsniveauDb = parseFloat(product.geluidsniveau_db);
    const breedteMm = parseFloat(product.breedte_mm);
    const hoogteMm  = parseFloat(product.hoogte_mm);
    const diepteMm  = parseFloat(product.diepte_mm);

    return [{
      merk:                  product.merk,
      naam,
      prijs,
      plaatsing,
      grootteGroup,
      nishoogteGroup,
      breedteMm: Number.isFinite(breedteMm) ? breedteMm : null,
      hoogteMm:  Number.isFinite(hoogteMm)  ? hoogteMm  : null,
      diepteMm:  Number.isFinite(diepteMm)  ? diepteMm  : null,
      nettoInhoudL:      Number.isFinite(nettoInhoudL) ? nettoInhoudL : null,
      energielabel:      product.energielabel ?? "",
      automatischOntdooien: product.automatisch_ontdooien ?? "",
      geluidsniveauDb:   Number.isFinite(geluidsniveauDb) ? geluidsniveauDb : null,
      klimaatklasse:     product.klimaatklasse ?? "",
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
 * Dynamically computes 1–3 price buckets from the prices of the given
 * (already relevant, e.g. plaatsing/type-matched) list of vriezers.
 * Always call this with a freshly fetched catalog on the results page,
 * never with the quiz-time localStorage snapshot.
 */
export function computeDynamicPriceGroups(vriezers) {
  const prices = (vriezers || [])
    .map(v => parsePrice(v.prijs))
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
