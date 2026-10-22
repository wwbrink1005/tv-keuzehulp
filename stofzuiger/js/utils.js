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
// ─── Kenmerken uit naam en Icecat (sinds okt. 2026) ─────────────────────────
// Bosch en Miele (samen meer dan de helft) staan niet in Icecat, maar hun
// productnamen zeggen het: "ProAnimal"/"Cat & Dog" (huisdieren), "Allergy"/
// "ProHygienic" (allergie), "Parquet"/"Hardfloor" (parketborstel), "Aqua"
// (dweilen), "HX3 Plus" (tweede accu). Icecat vult aan voor de andere merken.
// Alles true / null: een naam zonder zo'n woord zegt niet dat het ontbreekt.
// "PET" staat bij Bosch vast aan het typenummer (BCS711PET, BGB41PET1)
const HUISDIER = /animal|cat ?& ?dog|(\d|\b)pet(\d|\b)|haustier/i;
// "HYG" in een Bosch-typenummer (BCS712HYG5, BGL8HYG0L) = de ProHygienic-uitvoering
const ALLERGIE = /allerg|hygien|hepa|(\d|\b)hyg(\d|\b)/i;
// Bosch Unlimited: wisselbare accu (Power for ALL), bij elk model in de serie
const WISSELACCU = /\bunlimited\b/i;
const PARKET = /parquet|parket|hard ?floor|hardfloor/i;
const DWEIL = /\baqua\b|wet ?& ?dry|nat en droog|dweil/i;
// Geen stofzuigers met steel of snoer: robots en kruimelzuigers (zitten in de
// feed, horen bij de robotstofzuiger-keuzehulp of nergens).
const GEEN_STOFZUIGER = /robot ?stofzuiger|\brobot\b|kruimelzuiger|ergomini/i;

function ja(v) { return /^ja$/i.test(String(v ?? "").trim()); }
function nee(v) { return /^nee$/i.test(String(v ?? "").trim()); }

function kenmerken(p, naam) {
  const borstels = `${p.borstels ?? ""} ${p.speciaalMondstuk ?? ""}`;
  const filter = String(p.luchtfiltering ?? "");
  return {
    huisdieren: HUISDIER.test(naam) || /turbo|pet|huisdier|dier/i.test(borstels) ? true : null,
    allergie: ALLERGIE.test(naam) || /hepa|hygi[eë]n|allerg/i.test(filter) ? true : null,
    parket: PARKET.test(naam) || /parket|parquet|hard floor|harde vloer/i.test(borstels) ? true : null,
    dweilen: DWEIL.test(naam) || /nat/i.test(p.soortReiniging ?? "") ? true : /^droog$/i.test(String(p.soortReiniging ?? "").trim()) ? false : null,
    // "2 x 70 min" (Miele Triflex HX3 Plus) = twee accu's
    extraAccu: ja(p.verwisselbareAccu) || WISSELACCU.test(naam) || /\bplus\b.*hx3|hx3 plus/i.test(naam) || /2 ?x/i.test(String(p.looptijdRaw ?? "")) ? true
      : nee(p.verwisselbareAccu) ? false : null,
  };
}

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
    if (GEEN_STOFZUIGER.test(naam)) return [];

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
      ...kenmerken(product, naam),
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
