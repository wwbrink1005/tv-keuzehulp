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
    if (!product.type || !product.grootte || !product.merk || !product.scherpte || !product.hz || product.ambilight === undefined || product.ambilight === "") {
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
      Ambilight: product.ambilight,
      afbeelding
    }];
  });
}
