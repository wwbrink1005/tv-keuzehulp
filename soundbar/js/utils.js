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
    breedteGroup: localStorage.getItem("soundbar_selectedBreedteGroup") || ""
  };
}

/**
 * Normalizes raw soundbar products from Supabase to a consistent internal shape.
 */
// Producten die de feed als soundbar aanlevert maar geen tv-soundbar zijn:
// muurbeugels, vergaderspeakers en speakerbalken voor een pc-monitor (gevonden
// bij de doorlichting van okt. 2026). Op de titel, want een eigen veld
// daarvoor bestaat niet in de catalogus.
const GEEN_TV_SOUNDBAR = /speaker ?steun|muurbeugel|wandbeugel|beugel|houder|mspeaker|luidsprekerbalk|slim soundbar - sb/i;

// ─── Losse subwoofer, achterspeakers, WiFi (sinds okt. 2026) ───────────────
// Icecat's "Meegeleverde subwoofer" staat ook op "Ja" bij soundbars met de bas
// ín de bar (TCL S45H: "Subwoofer locatie: Ingebouwd"). Locatie, gewicht en een
// draadloze verbinding zeggen wél of er een losse subwoofer bij zit.
//
// Vaste kenmerken voor modellen zonder (volledige) Icecat-gegevens, nagekeken
// bij fabrikant en winkels (22-10-2026), net als de vaste Miele-kenmerken bij
// de wasmachine. Alleen wat zeker is; de rest blijft onbekend.
const VAST = [
  { patroon: /sonos (ray|beam|arc)/i, subLos: false, achter: false, wifi: true },
  { patroon: /bravia theatre bar [89]/i, subLos: false, achter: false, wifi: true },
  { patroon: /bravia theatre bar 6/i, subLos: true, achter: false, wifi: false },
  { patroon: /bravia theatre system 6/i, subLos: true, achter: true },
  { patroon: /ht-s2000/i, subLos: false, achter: false, wifi: false },
  { patroon: /dht-s(316|517)/i, subLos: true, achter: false, wifi: false },
  { patroon: /denon home soundbar/i, subLos: false, achter: false, wifi: true },
  { patroon: /sound suite/i, subLos: false, achter: false },
  { patroon: /hisense hs2000/i, subLos: false, achter: false },
  // afneembare achterspeakers (JBL) en sets met achterspeakers (Samsung Q990)
  { patroon: /jbl bar (800|1000|1300) mk2/i, achter: true },
  { patroon: /q990/i, achter: true },
];
const vastVoor = naam => VAST.filter(v => v.patroon.test(naam)).reduce((a, v) => ({ ...a, ...v }), {});
const jaNee = v => (/^ja$/i.test(String(v ?? "").trim()) ? true : /^nee$/i.test(String(v ?? "").trim()) ? false : null);
const kg = v => { const m = String(v ?? "").replace(",", ".").match(/(\d+(?:\.\d+)?)\s*(kg|g)\b/i); return m ? parseFloat(m[1]) / (m[2].toLowerCase() === "g" ? 1000 : 1) : null; };
const hoofdKanalen = k => { const m = String(k ?? "").match(/^(\d+)/); return m ? parseInt(m[1], 10) : null; };

function subwooferLos(p, naam, vast) {
  if (vast.subLos !== undefined) return vast.subLos;
  if (/gescheiden/i.test(p.subwooferLocatie)) return true;
  if (/ingebouwd/i.test(p.subwooferLocatie)) return false;
  const gewicht = kg(p.subwooferGewicht);
  if (gewicht !== null) return gewicht > 0;
  if (/draadloos/i.test(p.subwooferVerbinding)) return true;
  if (/subwoofer/i.test(naam) && !/ingebouwde subwoofer|built-in sub/i.test(naam)) return true;
  // "Ja" zonder meer zegt niet of hij los staat; "Nee" wel dat er geen is.
  return jaNee(p.subwooferRaw) === false ? false : null;
}

function achterspeakers(p, vast) {
  if (vast.achter !== undefined) return vast.achter;
  if ((kg(p.achterspeakerGewicht) ?? 0) > 0) return true;
  // Minder dan 4 hoofdkanalen (2.x, 3.x): daar horen geen losse achterspeakers bij.
  const hoofd = hoofdKanalen(p.kanalen);
  return hoofd !== null && hoofd < 4 ? false : null;
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
    if (GEEN_TV_SOUNDBAR.test(naam)) return [];

    const prijs = Math.min(...aanbieders.map(a => a.prijs));

    const afbeelding   = String(product.icecat_afbeelding || "").trim();
    const afbeeldingen = Array.isArray(product.icecat_afbeeldingen) ? product.icecat_afbeeldingen : [];

    if (!product.merk) return [];

    const vast = vastVoor(naam);
    const decoders = String(product.audio_decoders ?? "");
    const hoofd = hoofdKanalen(product.kanalen);
    const wifiBekend = vast.wifi ?? jaNee(product.wifiRaw);

    return [{
      merk:                 product.merk,
      naam,
      prijs,
      breedte_mm:           product.breedte_mm ?? null,
      hoogte_mm:            product.hoogte_mm  ?? null,
      diepte_mm:            product.diepte_mm  ?? null,
      kanalen:              product.kanalen        ?? "",
      audio_decoders:       product.audio_decoders ?? "",
      vermogen_watt:        product.vermogen_watt  ?? 0,
      subwoofer_meegeleverd: product.subwoofer_meegeleverd ?? "Nee",
      hdmi_poorten:         product.hdmi_poorten ?? 0,
      earc:                 product.earc         ?? "Nee",
      wandmontage:          product.wandmontage  ?? "Nee",
      wifi:                 product.wifi         ?? "Nee",
      bluetooth:            product.bluetooth    ?? "Nee",
      // Afgeleid, true / false / null (onbekend). Zie de toelichting bovenaan.
      subwooferLos:         subwooferLos(product, naam, vast),
      achterspeakers:       achterspeakers(product, vast),
      // Hoogtekanalen (x.x.2, x.x.4) zijn er alleen voor Atmos/DTS:X, ook als
      // de decoderlijst afgekapt is (Samsung Q930F: 9.1.4, "Dolby Digital").
      atmos:                /atmos|dts:x|dts x/i.test(decoders) || /^\d+\.\d+\.[1-9]/.test(String(product.kanalen ?? "")) ? true : decoders ? false : null,
      middenkanaal:         hoofd === null ? null : hoofd >= 3,
      wifiStreaming:        wifiBekend,
      airplay:              jaNee(product.airplay),
      spotifyConnect:       jaNee(product.spotifyConnect),
      chromecast:           jaNee(product.chromecast),
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
 * Filtert soundbars op een breedtegroep (zie breedteGroupToRange in data.js).
 */
function filterByBreedteGroup(soundbars, breedteGroup, breedteGroupToRange) {
  const range = breedteGroupToRange[breedteGroup];
  if (!range) return soundbars; // "weet-ik-niet" of onbekend → geen filter
  return soundbars.filter(sb => Number.isFinite(sb.breedte_mm) && sb.breedte_mm >= range.min && sb.breedte_mm < range.max);
}

/**
 * Dynamically computes 2–3 price buckets from actual soundbar prices in the given breedtegroep.
 */
export function computeDynamicPriceGroups(soundbars, breedteGroup, breedteGroupToRange) {
  const scoped = filterByBreedteGroup(soundbars, breedteGroup, breedteGroupToRange);
  const prices = scoped
    .map(sb => parsePrice(sb.prijs))
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
 * Dynamically computes 2–3 buckets (in cm) for een mm-veld (breedte_mm/
 * diepte_mm/hoogte_mm), from de actuele live catalogus — zelfde kwantiel-
 * aanpak als computeDynamicPriceGroups, alleen op hele cm i.p.v. de
 * grovere prijs-afrondstappen.
 */
export function computeDynamicDimensionGroups(products, veld) {
  const waarden = (products || [])
    .map(p => p[veld])
    .filter(v => Number.isFinite(v) && v > 0)
    .map(mm => mm / 10)
    .sort((a, b) => a - b);

  if (waarden.length === 0) return [];

  const n = waarden.length;
  if (n <= 2) {
    const displayMin = Math.floor(waarden[0]);
    return [{ label: `${displayMin}+ cm`, min: 0, max: Number.POSITIVE_INFINITY }];
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
    buckets.push({ label: `${displayMin}-${split} cm`, min: prevMax, max: split });
    prevMax = split;
  });

  const lastDisplayMin = prevMax;
  buckets.push({ label: `${lastDisplayMin}+ cm`, min: prevMax, max: Number.POSITIVE_INFINITY });

  return buckets;
}
