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
 * Normalizes raw beamer products from Supabase to a consistent internal
 * shape. Geen harde partitie (een beamer heeft geen fysieke pasvorm-eis
 * zoals vaatwasser/wasmachine) — alleen merk en een geldige aanbieder zijn
 * een harde eis, net als bij airfryer/robotstofzuiger.
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
      merk:                    product.merk,
      naam,
      prijs,
      helderheidLumen:         Number.isFinite(product.helderheidLumen) ? product.helderheidLumen : null,
      resolutie:               product.resolutie ?? "",
      projectietechnologie:    product.projectietechnologie ?? "",
      lichtbronType:           product.lichtbronType ?? "",
      lichtbronLevensduurUur:  Number.isFinite(product.lichtbronLevensduurUur) ? product.lichtbronLevensduurUur : null,
      worpType:                product.worpType ?? "",
      marktPositionering:      product.marktPositionering ?? "",
      smartTv:                 product.smartTv ?? "Nee",
      ingebouwdeLuidsprekers:  product.ingebouwdeLuidsprekers ?? "Nee",
      hdr:                     product.hdr ?? "Nee",
      support3d:               product.support3d ?? "Nee",
      wifi:                    product.wifi ?? "Nee",
      bluetooth:               product.bluetooth ?? "Nee",
      hdmiPoorten:             Number.isFinite(product.hdmiPoorten) ? product.hdmiPoorten : null,
      geluidDb:                Number.isFinite(product.geluidDb) ? product.geluidDb : null,
      zoom:                    product.zoom ?? "Nee",
      kleur:                   product.kleur ?? "",
      gewichtKg:               Number.isFinite(product.gewichtKg) ? product.gewichtKg : null,
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
 * of beamers. Altijd aanroepen met een vers opgehaalde catalogus, nooit met
 * de quiz-time localStorage-snapshot.
 */
export function computeDynamicPriceGroups(beamers) {
  const prices = (beamers || [])
    .map(b => parsePrice(b.prijs))
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
 * Dynamically computes 2–3 buckets for helderheidLumen, from de actuele
 * live catalogus (zelfde kwantiel-aanpak als computeDynamicPriceGroups).
 */
export function computeDynamicLumenGroups(beamers) {
  const waarden = (beamers || [])
    .map(b => b.helderheidLumen)
    .filter(v => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);

  if (waarden.length === 0) return [];

  const n = waarden.length;
  if (n <= 2) {
    const displayMin = Math.floor(waarden[0]);
    return [{ label: `${displayMin}+ lm`, min: 0, max: Number.POSITIVE_INFINITY }];
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
    buckets.push({ label: `${displayMin}-${split} lm`, min: prevMax, max: split });
    prevMax = split;
  });

  const lastDisplayMin = prevMax;
  buckets.push({ label: `${lastDisplayMin}+ lm`, min: prevMax, max: Number.POSITIVE_INFINITY });

  return buckets;
}
