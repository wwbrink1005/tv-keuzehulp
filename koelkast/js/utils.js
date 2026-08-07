import { classifyNishoogte, classifyPlaatsing, classifyVrijstaandType } from "./data.js";

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
 * Normalizes raw koelkast products from Supabase to a consistent internal shape.
 * Computes plaatsing/vrijstaandType/nishoogteGroup classification fields once
 * here so matching.js can filter on precomputed fields, not raw specs.
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

    if (!product.merk) return [];

    const plaatsing = classifyPlaatsing(product.apparaatplaatsing);
    const vrijstaandType = plaatsing === "inbouw"
      ? null
      : classifyVrijstaandType(product.breedte_mm, product.hoogte_mm);
    const nishoogteGroup = plaatsing === "inbouw"
      ? classifyNishoogte(product.nis_hoogte_cm, product.hoogte_mm)
      : null;

    const nettoInhoudL   = parseFloat(product.netto_inhoud_l);
    const geluidsniveauDb = parseFloat(product.geluidsniveau_db);
    const breedteMm = parseFloat(product.breedte_mm);
    const hoogteMm  = parseFloat(product.hoogte_mm);
    const diepteMm  = parseFloat(product.diepte_mm);
    // Presence of either field is a good-enough signal for "heeft een
    // vriesvak" — absence doesn't always mean "geen vriesvak" (Icecat mist
    // deze spec soms ook bij modellen die er wél een hebben), maar dit is
    // een zachte voorkeursfilter die gracieus degradeert, geen harde eis.
    const heeftVriesvak = Boolean(product.vrieslades) || Boolean(product.vriescapaciteit);

    return [{
      merk:                  product.merk,
      naam,
      prijs,
      plaatsing,
      vrijstaandType,
      nishoogteGroup,
      breedteMm: Number.isFinite(breedteMm) ? breedteMm : null,
      hoogteMm:  Number.isFinite(hoogteMm)  ? hoogteMm  : null,
      diepteMm:  Number.isFinite(diepteMm)  ? diepteMm  : null,
      nettoInhoudL:      Number.isFinite(nettoInhoudL) ? nettoInhoudL : null,
      energielabel:      product.energielabel ?? "",
      automatischOntdooien: product.automatisch_ontdooien ?? "",
      geluidsniveauDb:   Number.isFinite(geluidsniveauDb) ? geluidsniveauDb : null,
      heeftVriesvak,
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
 * Dynamically computes 1–3 price buckets from the prices of the given
 * (already relevant, e.g. plaatsing/type-matched) list of koelkasten.
 * Always call this with a freshly fetched catalog on the results page,
 * never with the quiz-time localStorage snapshot.
 */
export function computeDynamicPriceGroups(koelkasten) {
  const prices = (koelkasten || [])
    .map(k => parsePrice(k.prijs))
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
