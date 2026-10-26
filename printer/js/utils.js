import { aanbevolenMax, isCompact, isFotoprinter, isHpPlus, isKantoorprinter, soortVan } from "./data.js";

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
    gebruik: localStorage.getItem("printer_selectedGebruik") || ""
  };
}

/**
 * Normalizes raw printer products from Supabase to a consistent internal shape.
 */
const ALLEEN_NIET = { bol: true, MediaMarkt: true };

export function normalizeProducts(rawProducts) {
  if (!Array.isArray(rawProducts)) return [];

  return rawProducts.flatMap(product => {
    const rawAanbieders = Array.isArray(product.aanbieders) ? product.aanbieders : [];
    const aanbieders = rawAanbieders
      .map(a => ({ ...a, prijs: parseFloat(String(a.prijs || "").replace(",", ".")) }))
      .filter(a => a.url && Number.isFinite(a.prijs) && a.prijs > 0);
    if (aanbieders.length === 0) return [];
    // Zelfde regel als laptop (27-10-2026): printers die alleen bol of alleen MediaMarkt
    // verkoopt, laten we weg. Wat overblijft ligt bij 2+ winkels of alleen bij Coolblue,
    // Expert of EP (eigen, nieuw assortiment); daardoor kan het standaardfilter op "Alle winkels".
    if (aanbieders.length === 1 && ALLEEN_NIET[aanbieders[0].winkel]) return [];

    const naam = String(product.titel || "").trim() || aanbieders.map(a => String(a.productnaam || "").trim()).find(Boolean) || "";
    if (!naam) return [];

    const prijs = Math.min(...aanbieders.map(a => a.prijs));

    const afbeelding   = String(product.icecat_afbeelding || "").trim();
    const afbeeldingen = Array.isArray(product.icecat_afbeeldingen) ? product.icecat_afbeeldingen : [];

    if (!product.merk || !product.printtechnologie) return [];
    if (!isKantoorprinter(product.printtechnologie, naam)) return [];

    const basis = {
      merk:               product.merk,
      naam,
      prijs,
      printtechnologie:   product.printtechnologie   ?? "",
      marktPositionering: product.marktPositionering ?? "",
      duplex:             product.duplex             ?? "Nee",
      kopieren:           product.kopieren           ?? "Nee",
      scannen:            product.scannen            ?? "Nee",
      faxen:              product.faxen              ?? "Nee",
      wifi:               product.wifi               ?? "Nee",
      bluetooth:          product.bluetooth          ?? "Nee",
      adf:                product.adf                ?? "Nee",
      printsnelheidZwart: product.printsnelheidZwart ?? null,
      printsnelheidKleur: product.printsnelheidKleur ?? null,
      kleur:              product.kleur              ?? "",
      display:            product.display            ?? "Nee",
      printkleuren:       product.printkleuren       ?? "",
      kanKleurenPrinten:  product.kanKleurenPrinten  ?? "Nee",
      afbeelding,
      afbeeldingen,
      aanbieders
    };

    // Afgeleide kenmerken voor de matching (zie data.js). null = onbekend.
    const tech = String(product.printtechnologie ?? "").toLowerCase();
    const duplexModus = String(product.duplexModus ?? "");
    const soortScanner = String(product.soortScanner ?? "");
    const aio = (basis.scannen === "Ja" && basis.kopieren === "Ja") || /scanner/i.test(soortScanner);
    return [{
      ...basis,
      soort:            soortVan(basis),
      fotoprinter:      isFotoprinter(basis) || tech.includes("sublimatie") || tech.includes("zink"),
      // Sublimatie/ZINK: alleen fotootjes (10x15 en kleiner), geen documenten.
      alleenFoto:       tech.includes("sublimatie") || tech.includes("zink"),
      hpPlus:           isHpPlus(basis),
      aio,
      adf:              basis.adf === "Ja" || /adf/i.test(soortScanner) ? "Ja" : "Nee",
      duplexAuto:       /auto/i.test(duplexModus) ? true : /handmatig/i.test(duplexModus) || basis.duplex !== "Ja" ? false : null,
      a3:               product.maxPapierformaat ? /^A[0-3]/i.test(product.maxPapierformaat) : null,
      maxPapierformaat: product.maxPapierformaat ?? "",
      compact:          isCompact(product),
      breedteMm:        product.breedteMm ?? null,
      diepteMm:         product.diepteMm ?? null,
      hoogteMm:         product.hoogteMm ?? null,
      gewichtKg:        product.gewichtKg ?? null,
      invoercapaciteit: product.invoercapaciteit ?? null,
      paginasPerMaand:  aanbevolenMax(product.gebruikAanbevolen),
      maxPaginasPerMaand: product.gebruikMaxPaginas ?? null,
      // Bij inkjets is de "standaard"-snelheid van Icecat vaak de conceptstand
      // (Epson WorkForce: 33 tegenover 10 volgens ISO); alleen de ISO-snelheid
      // is vergelijkbaar. Bij lasers kloppen beide.
      snelheid:         /laser|led/i.test(tech)
        ? product.printsnelheidZwart ?? product.printsnelheidIso ?? null
        : product.printsnelheidIso ?? null,
      zonderWitranden:  product.zonderWitranden ?? "Nee",
      ethernet:         product.ethernet ?? "Nee",
      mobielPrinten:    product.mobielPrinten ?? "",
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
 * Prijsgroepen (2 of 3) voor het prijsfilter op de resultaatpagina, uit de
 * prijzen van de getoonde printers.
 */
export function computeDynamicPriceGroups(printers) {
  const prices = printers
    .map(p => parsePrice(p.prijs))
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
