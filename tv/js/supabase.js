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
 * Extracts the integer HDMI port count from hdmi_poorten values like "4" → 4.
 * Returns null when the value is absent so the filter can skip unknowns.
 */
function parseHdmiPoorten(value) {
  if (value === null || value === undefined || value === "") return null;
  const m = String(value).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
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
    prijs_cb:             row.coolblue_prijs    != null  ? String(row.coolblue_prijs)    : "",
    url_cb:               row.coolblue_affiliate_link    ?? "",
    levertijd_cb:         row.coolblue_levertijd         ?? "",
    verzendkosten_cb:     row.coolblue_bezorgkosten != null ? String(row.coolblue_bezorgkosten) : "",
    productnaam_expert:   row.expert_naam                ?? "",
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
    ean:                 row.ean,
    type,
    grootte,
    merk:                row.merk,
    scherpte:            mapScherpte(row.scherm_type),
    hz:                  parseRefreshRate(row.refresh_rate),
    hdmiPoorten:         parseHdmiPoorten(row.hdmi_poorten),
    kleur:               row.kleur ?? "",
    icecat_afbeelding:   row.icecat_afbeelding  ?? "",
    icecat_afbeeldingen: Array.isArray(row.icecat_afbeeldingen) ? row.icecat_afbeeldingen : [],
    aanbieders:          [adaptAanbieders(row)],
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
 * Normaliseert een EAN naar 13 cijfers.
 * UPC-A (12 cijfers) is hetzelfde als EAN-13 mét een voorloopnul.
 * Sommige feeds slaan EANs op als getal waardoor de voorloopnul wegvalt.
 */
function normaliseEan(ean) {
  if (!ean) return ean;
  const s = String(ean).trim();
  return (s.length === 12 && /^\d+$/.test(s)) ? "0" + s : s;
}

/**
 * Voegt rijen met hetzelfde EAN samen tot één rij.
 * Normaliseert EANs naar 13 cijfers zodat UPC-A en EAN-13 varianten van
 * hetzelfde product als één rij worden herkend.
 * Bij elk veld wint de eerste niet-lege waarde.
 */
function samenvoegDuplicaten(rows) {
  const byEan = new Map();
  for (const row of rows) {
    const ean = normaliseEan(row.ean);
    const normRow = ean !== row.ean ? { ...row, ean } : row;
    if (!byEan.has(ean)) {
      byEan.set(ean, { ...normRow });
    } else {
      const existing = byEan.get(ean);
      for (const [key, value] of Object.entries(normRow)) {
        if (existing[key] === null || existing[key] === undefined || existing[key] === "") {
          if (value !== null && value !== undefined && value !== "") {
            existing[key] = value;
          }
        }
      }
    }
  }
  return Array.from(byEan.values());
}

/**
 * Fetches all televisies and returns them in the shape normalizeProducts() expects.
 */
export async function fetchProducts() {
  const rows = await fetchAll();
  return samenvoegDuplicaten(rows).map(adaptRow).filter(Boolean);
}
