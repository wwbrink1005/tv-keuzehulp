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
 * Werkgeheugen en opslag uit productnamen ("16 GB - 512 GB", "16GB/1TB",
 * "24 GB - 1 TB"): het eerste getal is het geheugen, het tweede de opslag.
 * De naam die het vaakst voorkomt wint niet: de eerste naam met een paar telt.
 */
function geheugenUitNamen(namen) {
  for (const naam of namen) {
    const m = String(naam ?? "").match(/\b(\d{1,3})\s?GB\s*[-/,]\s*(\d{3,4}|[1-8])\s?(GB|TB)\b/i);
    if (!m) continue;
    const ram = parseInt(m[1], 10);
    const opslag = parseInt(m[2], 10) * (m[3].toUpperCase() === "TB" ? 1024 : 1);
    if (ram >= 4 && ram <= 128 && opslag >= 64) return { ram, opslag };
  }
  // Alleen de opslag genoemd ("Zilver - 512 GB - Touch ID"): 128 GB of meer is
  // opslag, kleiner is werkgeheugen.
  for (const naam of namen) {
    const m = String(naam ?? "").match(/\b(\d{3,4}|[1-8])\s?(GB|TB)\b/i);
    if (!m) continue;
    const opslag = parseInt(m[1], 10) * (m[2].toUpperCase() === "TB" ? 1024 : 1);
    if (opslag >= 128) return { ram: null, opslag };
  }
  return { ram: null, opslag: null };
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

    // Werkgeheugen en opslag ontbreken bij o.a. veel MacBooks in Icecat; zo'n
    // laptop niet weggooien maar zonder die gegevens tonen (null). Onder de 4 GB
    // is een invoerfout (er stond bv. "2" bij een M4 Pro).
    // Ontbreken ze (vooral MacBooks: de Apple-scraper haalt ze uit de titel, en
    // bv. Coolblue noemt hem alleen "MacBook Air 13" M5"), dan uit de
    // productnamen bij de winkels: "16 GB - 512 GB", "16GB/1TB".
    const uitNamen = geheugenUitNamen([product.titel, ...aanbieders.map(a => a.productnaam)]);
    const ram = parseInt(product.werkgeheugen, 10);
    const werkgeheugen = Number.isFinite(ram) && ram >= 4 ? ram : uitNamen.ram;

    const opsl = parseInt(product.opslag, 10);
    const opslag = Number.isFinite(opsl) && opsl > 0 ? opsl : uitNamen.opslag;

    // Verversing (Hz) is bij ongeveer de helft bekend; onbekend = null. Apple
    // staat niet in Icecat: een MacBook Pro heeft 120 Hz (ProMotion), een Air 60.
    const hzGetal = parseInt(String(product.hz ?? "").replace(/[^0-9]/g, ""), 10);
    const isApple = /^apple$/i.test(product.merk ?? "");
    const hz = Number.isFinite(hzGetal) && hzGetal >= 30 ? hzGetal
      : isApple && /macbook pro/i.test(naam) ? 120
      : isApple && /macbook air/i.test(naam) ? 60
      : null;

    const gewicht = parseFloat(product.gewicht);
    // gewicht may be missing for some laptops; don't reject if NaN

    // Paneeltype is alleen nodig voor een filter en een punt: niet verplicht
    // (ontbrak o.a. bij de Surface Pro). Processor of processorfamilie wel.
    if (!product.merk || !(product.processor || product.processor_familie) || !product.resolutie) {
      return [];
    }
    // Schermen van 23 inch en groter zijn geen laptops (all-in-ones in de feed).
    if (schermdiagonaal >= 20) return [];

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
      paneeltype:     product.paneeltype ?? "",
      hz,
      processor:      product.processor ?? "",
      processor_familie: product.processor_familie ?? "",
      gpu:            product.gpu ?? "",
      gewicht:        Number.isFinite(gewicht) ? gewicht : null,
      // Besturingssysteem: Apple is altijd macOS, een Chromebook ChromeOS.
      os:             product.os || (/^apple$/i.test(product.merk) ? "macOS" : /chromebook/i.test(`${product.typeProduct} ${naam}`) ? "Chrome OS" : ""),
      accuWh:         Number.isFinite(product.accuWh) ? product.accuWh : null,
      accuUren:       parseInt(product.accuUren, 10) || null,
      numeriekToetsenblok: product.numeriekToetsenblok ?? "",
      // MacBook Neo (A-chip): Touch ID alleen op de uitvoering met 512 GB, het
      // basismodel met 256 GB heeft een gewone aan/uit-knop.
      vingerafdruk:   product.vingerafdruk
        || (isApple && /\bA\d+/.test(product.processor ?? "")
          ? (/touch id/i.test(naam) || opslag >= 512 ? "Ja" : opslag ? "Nee" : "")
          : ""),
      typeProduct:    product.typeProduct ?? "",
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
