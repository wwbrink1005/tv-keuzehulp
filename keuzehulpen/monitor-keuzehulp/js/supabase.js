const SUPABASE_URL = "https://clypcdpapacpowxehxzv.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNseXBjZHBhcGFjcG93eGVoeHp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NTc3NDIsImV4cCI6MjA5MzEzMzc0Mn0.3BpYssokCLQdhbSwTvhOMj5ve5QYhg2Jzd7MIUYCHkE";

const HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

/**
 * Extracts inch value from strings like "60,5 cm (24\")" → 24
 * or "68,6 cm (27\")" → 27
 */
function parseSchermInch(value) {
  if (!value) return null;
  const inParens = String(value).match(/\((\d+(?:[.,]\d+)?)/);
  if (inParens) return parseFloat(inParens[1].replace(",", "."));
  const firstNum = String(value).match(/^(\d+(?:[.,]\d+)?)/);
  return firstNum ? parseFloat(firstNum[1].replace(",", ".")) : null;
}

/**
 * Extracts the Hz value from strings like "144 Hz" → 144
 */
function parseHz(value) {
  if (!value) return 60;
  const m = String(value).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 60;
}

/**
 * Maps resolution strings like "1920 x 1080", "3840 x 2160" to a label.
 */
function parseResolutie(value) {
  if (!value) return "";
  const s = String(value).toLowerCase().replace(/\s+/g, "");
  if (s.includes("3840x2160") || s.includes("uhd") || s.includes("4k")) return "4K";
  if (s.includes("2560x1440") || s.includes("qhd")) return "QHD";
  if (s.includes("2560x1080") || s.includes("uwfhd")) return "UWFHD";
  if (s.includes("3440x1440") || s.includes("uwqhd")) return "UWQHD";
  if (s.includes("5120x1440")) return "5K Ultrawide";
  if (s.includes("1920x1200") || s.includes("wuxga")) return "WUXGA";
  if (s.includes("1920x1080") || s.includes("fhd") || s.includes("fullhd")) return "Full HD";
  if (s.includes("1280x1024") || s.includes("1024x768")) return "HD";
  return String(value).trim();
}

/**
 * Normalise "Ja"/"Nee"/true/false/null to "Ja" or "Nee".
 */
function parseJaNee(value) {
  if (!value) return "Nee";
  const s = String(value).toLowerCase();
  if (s === "ja" || s === "true" || s === "yes" || s === "1" || s.includes("curved")) return "Ja";
  return "Nee";
}

/**
 * Extracts the first integer from strings like "2" or "2 poorten".
 */
function parseFirstInt(value) {
  if (!value) return 0;
  const m = String(value).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * Build flat aanbieder shape from a monitoren row.
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
 * Adapts a single monitoren row to the shape that normalizeProducts() expects.
 */
function adaptRow(row) {
  const inch = parseSchermInch(row.scherm_inch);
  return {
    ean:             row.ean,
    merk:            row.merk,
    schermdiagonaal: inch,
    resolutie:       parseResolutie(row.scherm_resolutie),
    paneeltype:      row.scherm_type ?? "",
    hz:              parseHz(row.refresh_rate),
    responstijd:     row.responstijd ?? "",
    hdr:                 parseJaNee(row.hdr),
    hdmi_poorten:        parseFirstInt(row.hdmi_poorten),
    dp_poorten:          parseFirstInt(row.displayport_poorten),
    speakers:            parseJaNee(row.speakers),
    gebogen:             parseJaNee(row.gebogen),
    usb_c:               parseJaNee(row.usb_c),
    beeldverhouding:     row.beeldverhouding ?? "",
    icecat_afbeelding:   row.icecat_afbeelding  ?? "",
    icecat_afbeeldingen: Array.isArray(row.icecat_afbeeldingen) ? row.icecat_afbeeldingen : [],
    aanbieders:          [adaptAanbieders(row)],
  };
}

/**
 * Fetches all rows from the `monitoren` table with offset-based pagination.
 */
async function fetchAll() {
  const PAGE_SIZE = 1000;
  const results = [];
  let offset = 0;

  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/monitoren?order=ean&limit=${PAGE_SIZE}&offset=${offset}`;
    const response = await fetch(url, { headers: HEADERS });

    if (!response.ok) {
      throw new Error(
        `Supabase fetch mislukt (monitoren): ${response.status} ${response.statusText}`
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
 * Fetches all monitors and returns them in the shape normalizeProducts() expects.
 */
export async function fetchProducts() {
  const rows = await fetchAll();
  return samenvoegDuplicaten(rows).map(adaptRow).filter(Boolean);
}
