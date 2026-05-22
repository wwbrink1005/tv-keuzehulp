const SUPABASE_URL = "https://clypcdpapacpowxehxzv.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNseXBjZHBhcGFjcG93eGVoeHp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NTc3NDIsImV4cCI6MjA5MzEzMzc0Mn0.3BpYssokCLQdhbSwTvhOMj5ve5QYhg2Jzd7MIUYCHkE";

const HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

/**
 * Extracts the inch value from scherm_inch strings like "109,2 cm (43\")" → "43".
 */
function parseSchermInch(value) {
  if (!value) return "";
  const inParens = String(value).match(/\((\d+(?:[.,]\d+)?)/);
  if (inParens) return inParens[1].replace(",", ".");
  const firstNum = String(value).match(/(\d+(?:[.,]\d+)?)/);
  return firstNum ? firstNum[1].replace(",", ".") : "";
}

/**
 * Extracts the integer Hz value from refresh_rate strings like "100 Hz" → "100".
 * Defaults to "60" when the value is absent.
 */
function parseRefreshRate(value) {
  if (!value) return "60";
  const m = String(value).match(/(\d+)/);
  return m ? m[1] : "60";
}

/**
 * Maps display_technologie values to the panel types the scoring system knows.
 */
const TECHNOLOGIE_MAP = {
  "LED":         "LED",
  "DLED":        "LED",
  "LCD":         "LED",
  "ULED":        "QLED",
  "QLED":        "QLED",
  "QLED Pro":    "QLED",
  "QNED":        "QLED",
  "Neo QLED":    "Neo QLED",
  "Mini LED":    "Mini LED",
  "QD-Mini LED": "Mini LED",
  "QNED MiniLED":"Mini LED",
  "OLED":        "OLED",
  "OLED evo":    "OLED",
  "NanoCell":    "QLED",
  "QNED evo":    "Mini LED",
};

/**
 * Maps scherm_type values to the scherpte strings the matching code expects
 * ("HD Ready", "Full HD", "Ultra HD", "8K Ultra HD").
 */
function mapScherpte(value) {
  if (!value) return "";
  if (value === "HD" || value === "HD+") return "HD Ready";
  if (value === "Quad HD")              return "Full HD";
  return value; // "Full HD", "4K Ultra HD", "8K Ultra HD" already work as-is
}

/**
 * Builds the flat cb/expert aanbieder shape that normalizeProducts() expects
 * from a single televisies row.
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
 * Adapts a single televisies row to the shape that normalizeProducts() expects.
 * Returns null when the row cannot be mapped (unknown type or missing size).
 */
function adaptRow(row) {
  const grootte = parseSchermInch(row.scherm_inch);
  if (!grootte) return null;

  const type = TECHNOLOGIE_MAP[row.display_technologie];
  if (!type) return null;

  return {
    ean:        row.ean,
    type,
    grootte,
    merk:       row.merk,
    scherpte:   mapScherpte(row.scherm_type),
    hz:         parseRefreshRate(row.refresh_rate),
    aanbieders: [adaptAanbieders(row)],
  };
}

/**
 * Fetches all rows from the `televisies` table with offset-based pagination.
 */
async function fetchAll() {
  const PAGE_SIZE = 1000;
  const results = [];
  let offset = 0;

  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/televisies?order=ean&limit=${PAGE_SIZE}&offset=${offset}`;
    const response = await fetch(url, { headers: HEADERS });

    if (!response.ok) {
      throw new Error(
        `Supabase fetch mislukt (televisies): ${response.status} ${response.statusText}`
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
 * Fetches all televisies and returns them in the shape normalizeProducts() expects.
 */
export async function fetchProducts() {
  const rows = await fetchAll();
  return rows.map(adaptRow).filter(Boolean);
}
