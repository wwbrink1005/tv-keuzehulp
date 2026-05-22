const SUPABASE_URL = "https://clypcdpapacpowxehxzv.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNseXBjZHBhcGFjcG93eGVoeHp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NTc3NDIsImV4cCI6MjA5MzEzMzc0Mn0.3BpYssokCLQdhbSwTvhOMj5ve5QYhg2Jzd7MIUYCHkE";

const HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

/**
 * Extracts the inch value from scherm_inch strings like "40,6 cm (16\")" → "16"
 * or "33,8 cm (13.3\")" → "13.3".
 */
function parseSchermInch(value) {
  if (!value) return "";
  const inParens = String(value).match(/\((\d+(?:[.,]\d+)?)/);
  if (inParens) return inParens[1].replace(",", ".");
  const firstNum = String(value).match(/(\d+(?:[.,]\d+)?)/);
  return firstNum ? firstNum[1].replace(",", ".") : "";
}

/**
 * Extracts the first integer from strings like "24 GB".
 */
function parseFirstInt(value) {
  if (!value) return "";
  const m = String(value).match(/(\d+)/);
  return m ? m[1] : "";
}

/**
 * Parses opslag strings like "512 GB" → "512" or "1 TB" → "1024".
 */
function parseOpslag(value) {
  if (!value) return "";
  const m = String(value).match(/(\d+(?:[.,]\d+)?)\s*(TB|GB)/i);
  if (!m) return "";
  const num = parseFloat(m[1].replace(",", "."));
  return m[2].toUpperCase() === "TB" ? String(Math.round(num * 1024)) : String(Math.round(num));
}

/**
 * Parses weight strings like "1,85 kg" → "1.85".
 */
function parseGewicht(value) {
  if (!value) return "";
  const m = String(value).match(/(\d+[.,]\d+|\d+)/);
  return m ? m[1].replace(",", ".") : "";
}

/**
 * Builds the flat cb/expert aanbieder shape that normalizeProducts() expects,
 * from a single laptops row (with coolblue_* and expert_* columns).
 */
function adaptAanbieders(row) {
  return {
    productnaam_cb:       row.coolblue_naam              ?? "",
    afbeelding_cb:        row.coolblue_afbeelding        ?? "",
    prijs_cb:             row.coolblue_prijs    != null  ? String(row.coolblue_prijs)    : "",
    url_cb:               row.coolblue_affiliate_link    ?? "",
    levertijd_cb:         row.coolblue_levertijd         ?? "",
    verzendkosten_cb:     row.coolblue_bezorgkosten != null ? String(row.coolblue_bezorgkosten) : "",
    productnaam_expert:   row.expert_naam                ?? "",
    afbeelding_expert:    row.expert_afbeelding          ?? "",
    prijs_expert:         row.expert_prijs     != null   ? String(row.expert_prijs)      : "",
    url_expert:           row.expert_affiliate_link      ?? "",
    levertijd_expert:     row.expert_levertijd           ?? "",
    verzendkosten_expert: row.expert_bezorgkosten != null ? String(row.expert_bezorgkosten) : "",
  };
}

/**
 * Adapts a single laptops row to the shape that normalizeProducts() expects.
 */
function adaptRow(row) {
  return {
    ean:             row.ean,
    extra_eans:      [],
    merk:            row.merk,
    schermdiagonaal: parseSchermInch(row.scherm_inch),
    werkgeheugen:    parseFirstInt(row.ram),
    opslag:          parseOpslag(row.opslag),
    touchscreen:     row.touchscreen ?? "Nee",
    usb_c:           parseInt(row.usb_c, 10) > 0 ? "Ja" : "Nee",
    hdmi:            row.hdmi ?? "0",
    resolutie:       row.scherm_resolutie ?? "",
    paneeltype:      row.scherm_type ?? "",
    hz:              "60",
    processor:       row.processor ?? "",
    gpu:             row.gpu ?? "",
    gewicht:         parseGewicht(row.gewicht),
    aanbieders:      [adaptAanbieders(row)],
  };
}

/**
 * Fetches all rows from the `laptops` table with offset-based pagination.
 */
async function fetchAll() {
  const PAGE_SIZE = 1000;
  const results = [];
  let offset = 0;

  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/laptops?order=ean&limit=${PAGE_SIZE}&offset=${offset}`;
    const response = await fetch(url, { headers: HEADERS });

    if (!response.ok) {
      throw new Error(
        `Supabase fetch mislukt (laptops): ${response.status} ${response.statusText}`
      );
    }

    const page = await response.json();
    results.push(...page);

    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return results;
}

/**
 * Fetches all laptops and returns them in the shape normalizeProducts() expects.
 */
export async function fetchProducts() {
  const rows = await fetchAll();
  return rows.map(adaptRow).filter(Boolean);
}
