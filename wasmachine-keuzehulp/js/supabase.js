const SUPABASE_URL = "https://clypcdpapacpowxehxzv.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNseXBjZHBhcGFjcG93eGVoeHp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NTc3NDIsImV4cCI6MjA5MzEzMzc0Mn0.3BpYssokCLQdhbSwTvhOMj5ve5QYhg2Jzd7MIUYCHkE";

const HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

/**
 * Extracts the numeric kg value from strings like "9 kg" → 9.
 */
function parseCapaciteit(value) {
  if (!value) return null;
  const m = String(value).match(/(\d+(?:[.,]\d+)?)/);
  return m ? parseFloat(m[1].replace(",", ".")) : null;
}

/**
 * Extracts the first integer from strings like "1400 RPM" → 1400, "76 dB" → 76.
 */
function parseFirstInt(value) {
  if (!value) return null;
  const m = String(value).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Normalise "Ja"/"Nee"/true/false/null to "Ja" or "Nee".
 */
function parseJaNee(value) {
  if (!value) return "Nee";
  const s = String(value).toLowerCase();
  if (s === "ja" || s === "true" || s === "yes" || s === "1") return "Ja";
  return "Nee";
}

/**
 * Builds the flat cb/expert aanbieder shape that normalizeProducts() expects,
 * from a single wasmachines row.
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
 * Adapts a single wasmachines row to the shape that normalizeProducts() expects.
 */
function adaptRow(row) {
  return {
    ean:                 row.ean,
    merk:                row.merk,
    capaciteit:          parseCapaciteit(row.capaciteit_kg),
    typeLader:           row.type_lader ?? "",
    plaatsing:           row.plaatsing  ?? "",
    centrifugeRpm:       parseFirstInt(row.centrifuge_rpm),
    energieLabel:        String(row.energie_label ?? "").trim().toUpperCase(),
    geluidDb:            parseFirstInt(row.geluid_db),
    kleur:               row.kleur ?? "",
    inverter:            parseJaNee(row.inverter),
    display:             parseJaNee(row.display),
    uitgesteldeStart:    parseJaNee(row.uitgestelde_start),
    kinderslot:          parseJaNee(row.kinderslot),
    aquastop:            parseJaNee(row.aquastop),
    icecat_afbeelding:   row.icecat_afbeelding  ?? "",
    icecat_afbeeldingen: Array.isArray(row.icecat_afbeeldingen) ? row.icecat_afbeeldingen : [],
    aanbieders:          [adaptAanbieders(row)],
  };
}

/**
 * Fetches all rows from the `wasmachines` table with offset-based pagination.
 */
async function fetchAll() {
  const PAGE_SIZE = 1000;
  const results = [];
  let offset = 0;

  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/wasmachines?order=ean&limit=${PAGE_SIZE}&offset=${offset}`;
    const response = await fetch(url, { headers: HEADERS });

    if (!response.ok) {
      throw new Error(
        `Supabase fetch mislukt (wasmachines): ${response.status} ${response.statusText}`
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
 * Fetches all wasmachines and returns them in the shape normalizeProducts() expects.
 */
export async function fetchProducts() {
  const rows = await fetchAll();
  return samenvoegDuplicaten(rows).map(adaptRow).filter(Boolean);
}
