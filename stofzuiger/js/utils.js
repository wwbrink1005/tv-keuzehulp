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
 * Normalizes raw stofzuiger products from Supabase to a consistent internal
 * shape. Harde vereisten (vallen anders weg): merk (komt alleen van Icecat —
 * ontbreekt bij merken zonder Icecat-dekking, bv. Bosch/Miele/Dyson, zie
 * sessie-onderzoek) en een geldige aanbieder, net als bij koffiemachine/
 * airfryer/beamer. "stofzuigerType" is de harde partitie (cilinder/steel)
 * maar wordt NOOIT als harde eis behandeld hier — de pipeline garandeert al
 * (via het gewicht-vangnet in merge_publish.py) dat dit vrijwel altijd
 * gevuld is; een enkel ontbrekend geval mag niet het hele product laten
 * verdwijnen, dat hoort bij de matching-fallback (zie matching.js).
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

    const ondergrondenRuw = String(product.reinigtOndergronden || "").toLowerCase();

    return [{
      merk:                    product.merk,
      naam,
      prijs,
      stofzuigerType:          product.stofzuigerType || "Cilinderstofzuiger",
      containerType:           product.containerType ?? "",
      // "Reinigt ondergronden" is een vrije, kommagescheiden Icecat-string
      // (bv. "Tapijt, Harde vloer, Soft floor, Tile, Vinyl") — hier vast
      // omgezet naar 2 simpele Ja/Nee-signalen die de vloertype-vraag
      // (quiz) en het filtermenu rechtstreeks kunnen gebruiken. "Soft
      // floor"/"Tile"/"Vinyl" tellen mee als harde vloer.
      geschiktTapijt:          /tapijt|carpet/.test(ondergrondenRuw),
      geschiktHardeVloer:      /harde vloer|kale vloer|hard floor|soft floor|tile|vinyl|parket|laminaat|houten vloer/.test(ondergrondenRuw),
      geluidsniveauDb:         Number.isFinite(product.geluidsniveauDb) ? product.geluidsniveauDb : null,
      vermogenWatt:            Number.isFinite(product.vermogenWatt) ? product.vermogenWatt : null,
      stofcapaciteitLiter:     Number.isFinite(product.stofcapaciteitLiter) ? product.stofcapaciteitLiter : null,
      heeftHepaFilter:         /hepa/i.test(String(product.luchtfiltering || "")),
      looptijdMinuten:         Number.isFinite(product.looptijdMinuten) ? product.looptijdMinuten : null,
      actieradiusMeter:        Number.isFinite(product.actieradiusMeter) ? product.actieradiusMeter : null,
      kleur:                   product.kleur ?? "",
      breedteMm:               Number.isFinite(product.breedte) ? product.breedte : null,
      diepteMm:                Number.isFinite(product.diepte) ? product.diepte : null,
      hoogteMm:                Number.isFinite(product.hoogte) ? product.hoogte : null,
      gewichtKg:               Number.isFinite(product.gewichtKg) ? product.gewichtKg : null,
      afbeelding,
      afbeeldingen,
      aanbieders,
      bijgewerktOp:            product.bijgewerktOp ?? null,
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
 * of stofzuigers. Altijd aanroepen met een vers opgehaalde catalogus, nooit
 * met de quiz-time localStorage-snapshot.
 */
export function computeDynamicPriceGroups(stofzuigers) {
  const prices = (stofzuigers || [])
    .map(s => parsePrice(s.prijs))
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
 * Verdeelt de meegegeven stofzuigers in 3 gewichtscategorieën (Licht/
 * Gemiddeld/Zwaar) op basis van tertielen van de live catalogus — geen
 * vaste kg-grenzen (zie CLAUDE.md 5.4: drempels altijd tegen live data
 * valideren). Cilinder- en steelstofzuigers hebben een sterk verschillende
 * gewichtsverdeling (steel doorgaans 1-3 kg, cilinder 4-9 kg) — wordt daarom
 * altijd berekend op de op dat moment AL op type gefilterde matches, nooit
 * op de volledige catalogus, anders zou "Licht" bij cilinderstofzuigers
 * nooit voorkomen (en omgekeerd "Zwaar" nooit bij steel).
 */
export function computeDynamicWeightGroups(stofzuigers) {
  const gewichten = (stofzuigers || [])
    .map(s => s.gewichtKg)
    .filter(g => Number.isFinite(g) && g > 0)
    .sort((a, b) => a - b);

  if (gewichten.length < 3) return [];

  const n = gewichten.length;
  const grens1 = gewichten[Math.floor(n / 3)];
  const grens2 = gewichten[Math.floor((n * 2) / 3)];

  return [
    { label: "Licht", min: 0, max: grens1 },
    { label: "Gemiddeld", min: grens1, max: grens2 },
    { label: "Zwaar", min: grens2, max: Number.POSITIVE_INFINITY },
  ];
}
