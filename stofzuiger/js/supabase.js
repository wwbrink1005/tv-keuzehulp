const SUPABASE_URL = "https://clypcdpapacpowxehxzv.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNseXBjZHBhcGFjcG93eGVoeHp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NTc3NDIsImV4cCI6MjA5MzEzMzc0Mn0.3BpYssokCLQdhbSwTvhOMj5ve5QYhg2Jzd7MIUYCHkE";

const HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

/**
 * Extracts the first (decimal) number from strings like "78 dB" → 78,
 * "4,6 kg" → 4.6.
 */
function parseFirstFloat(value) {
  if (!value) return null;
  const m = String(value).match(/(\d+(?:[.,]\d+)?)/);
  return m ? parseFloat(m[1].replace(",", ".")) : null;
}

function adaptAanbieders(row) {
  return Array.isArray(row.aanbieders) ? row.aanbieders : [];
}

/**
 * Adapts a single stofzuigers row to the shape normalizeProducts() expects.
 */
function adaptRow(row) {
  return {
    ean:                    row.ean,
    titel:                  row.titel ?? "",
    merk:                   row.merk,
    stofzuigerType:         row.stofzuiger_type ?? "",
    typeProduct:            row.type_product ?? "",
    stroombron:             row.stroombron ?? "",
    containerType:          row.container_type ?? "",
    reinigtOndergronden:    row.reinigt_ondergronden ?? "",
    geluidsniveauDb:        parseFirstFloat(row.geluidsniveau_db),
    vermogenWatt:           parseFirstFloat(row.vermogen_watt),
    stofcapaciteitLiter:    parseFirstFloat(row.stofcapaciteit_liter),
    luchtfiltering:         row.luchtfiltering ?? "",
    looptijdMinuten:        parseFirstFloat(row.looptijd_minuten),
    actieradiusMeter:       parseFirstFloat(row.actieradius_meter),
    kleur:                  row.kleur ?? "",
    breedte:                parseFirstFloat(row.breedte),
    diepte:                 parseFirstFloat(row.diepte),
    hoogte:                 parseFirstFloat(row.hoogte),
    gewichtKg:              parseFirstFloat(row.gewicht),
    icecat_afbeelding:      row.icecat_afbeelding ?? "",
    icecat_afbeeldingen:    Array.isArray(row.icecat_afbeeldingen) ? row.icecat_afbeeldingen : [],
    aanbieders:             adaptAanbieders(row),
    bijgewerktOp:           row.bijgewerkt_op ?? null,
  };
}

/**
 * Fetches all rows from the `stofzuigers` table with offset-based pagination.
 */
async function fetchAll() {
  const PAGE_SIZE = 1000;
  const results = [];
  let offset = 0;

  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/stofzuigers?order=ean&limit=${PAGE_SIZE}&offset=${offset}`;
    const response = await fetch(url, { headers: HEADERS });

    if (!response.ok) {
      throw new Error(
        `Supabase fetch mislukt (stofzuigers): ${response.status} ${response.statusText}`
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
 * Fetches all stofzuigers and returns them in the shape normalizeProducts()
 * expects.
 */
export async function fetchProducts() {
  const rows = await fetchAll();
  return samenvoegDuplicaten(rows).map(adaptRow).filter(Boolean);
}
