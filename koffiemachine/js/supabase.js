const SUPABASE_URL = "https://clypcdpapacpowxehxzv.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNseXBjZHBhcGFjcG93eGVoeHp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NTc3NDIsImV4cCI6MjA5MzEzMzc0Mn0.3BpYssokCLQdhbSwTvhOMj5ve5QYhg2Jzd7MIUYCHkE";

const HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

/**
 * Extracts the first (decimal) number from strings like "1,8 l" → 1.8.
 */
function parseFirstFloat(value) {
  if (!value) return null;
  const m = String(value).match(/(\d+(?:[.,]\d+)?)/);
  return m ? parseFloat(m[1].replace(",", ".")) : null;
}

/**
 * "3,7 kg" → 3.7, "950 g" → 0.95. Gewicht staat als vrije Icecat-tekst met
 * wisselende eenheid, dus altijd naar kg normaliseren.
 */
function parseGewichtKg(value) {
  const num = parseFirstFloat(value);
  if (num === null) return null;
  return /\bg\b/i.test(String(value)) && !/kg/i.test(String(value)) ? num / 1000 : num;
}

/**
 * Normalise "Ja"/"Nee"/true/false/null to "Ja" of "Nee".
 */
function parseJaNee(value) {
  if (!value) return "Nee";
  const s = String(value).toLowerCase();
  if (s === "ja" || s === "true" || s === "yes" || s === "1") return "Ja";
  return "Nee";
}

function adaptAanbieders(row) {
  return Array.isArray(row.aanbieders) ? row.aanbieders : [];
}

/**
 * Adapts a single koffiemachines row to the shape normalizeProducts() expects.
 */
function adaptRow(row) {
  return {
    ean:                    row.ean,
    titel:                  row.titel ?? "",
    merk:                   row.merk,
    typeProduct:            row.type_product ?? "",
    automatiseringsgraad:   row.automatiseringsgraad ?? "",
    koffieInvoertype:       row.koffie_invoertype ?? "",
    capsuleSysteem:         row.capsule_systeem ?? "",
    ingebouwdeMolen:        parseJaNee(row.ingebouwde_molen),
    boonreservoirGram:      parseFirstFloat(row.boonreservoir_gram),
    capaciteitWatertankL:   parseFirstFloat(row.capaciteit_watertank),
    capaciteitKopjes:       parseFirstFloat(row.capaciteit_kopjes),
    melkopschuimer:         parseJaNee(row.melkopschuimer),
    melkToevoegen:          row.melk_toevoegen ?? "",
    melkreservoir:          parseJaNee(row.melkreservoir),
    bediening:              row.bediening ?? "",
    display:                parseJaNee(row.display),
    wifi:                   parseJaNee(row.wifi),
    zelfreinigend:          parseJaNee(row.zelfreinigend),
    automatischAntikalk:    parseJaNee(row.automatisch_antikalk),
    maxWerkdrukBar:         parseFirstFloat(row.max_werkdruk_bar),
    vermogenWatt:           parseFirstFloat(row.vermogen_watt),
    varianten:              Array.isArray(row.varianten) ? row.varianten : [],
    kleur:                  row.kleur ?? "",
    gewichtKg:              parseGewichtKg(row.gewicht),
    breedte:                parseFirstFloat(row.breedte),
    diepte:                 parseFirstFloat(row.diepte),
    hoogte:                 parseFirstFloat(row.hoogte),
    icecat_afbeelding:      row.icecat_afbeelding ?? "",
    icecat_afbeeldingen:    Array.isArray(row.icecat_afbeeldingen) ? row.icecat_afbeeldingen : [],
    aanbieders:             adaptAanbieders(row),
  };
}

/**
 * Fetches all rows from the `koffiemachines` table with offset-based pagination.
 */
async function fetchAll() {
  const PAGE_SIZE = 1000;
  const results = [];
  let offset = 0;

  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/koffiemachines?order=ean&limit=${PAGE_SIZE}&offset=${offset}`;
    const response = await fetch(url, { headers: HEADERS });

    if (!response.ok) {
      throw new Error(
        `Supabase fetch mislukt (koffiemachines): ${response.status} ${response.statusText}`
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
 * Fetches all koffiemachines and returns them in the shape normalizeProducts()
 * expects.
 */
export async function fetchProducts() {
  const rows = await fetchAll();
  return samenvoegDuplicaten(rows).map(adaptRow).filter(Boolean);
}
