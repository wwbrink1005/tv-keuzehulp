const SUPABASE_URL = "https://clypcdpapacpowxehxzv.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNseXBjZHBhcGFjcG93eGVoeHp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NTc3NDIsImV4cCI6MjA5MzEzMzc0Mn0.3BpYssokCLQdhbSwTvhOMj5ve5QYhg2Jzd7MIUYCHkE";

const HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

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
 * "Kopiëren in kleur" / "Zwart-wit kopiëren" / "Nee" → "Ja"/"Nee" of behoudt
 * het kleur-onderscheid via de aparte *_kleur velden in normalizeProducts().
 */
function parseFunctieAanwezig(value) {
  if (!value) return "Nee";
  const s = String(value).toLowerCase();
  if (s === "nee" || s === "false" || s === "0") return "Nee";
  return "Ja";
}

/**
 * Extracts the first integer from strings like "25 ppm" → 25.
 */
function parseFirstInt(value) {
  if (!value) return null;
  const m = String(value).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Geeft de generieke aanbieders-lijst terug die normalizeProducts() verwacht,
 * rechtstreeks uit de `aanbieders`-jsonb-kolom (gevuld door de pipeline). Een
 * nieuwe aanbieder zoals MediaMarkt vereist hier geen wijziging.
 */
function adaptAanbieders(row) {
  return Array.isArray(row.aanbieders) ? row.aanbieders : [];
}

/**
 * Of een printer daadwerkelijk in kleur kan PRINTEN — niet te verwarren met
 * "kan in kleur scannen/kopiëren" (aparte, veelvoorkomende combinatie bij
 * zwart-witprinters met een kleurenscanner). Alleen "printkleuren" (bevat
 * cyaan/magenta/geel bij een kleurenprinter, alleen "Zwart" bij mono) en een
 * ingevulde printsnelheid-kleur zeggen iets over het PRINTEN zelf.
 */
function heeftKleurenPrinten(row) {
  const printkleuren = String(row.printkleuren ?? "").toLowerCase();
  if (/cyaan|magenta|geel|colour|color/.test(printkleuren)) return "Ja";
  return parseFirstInt(row.printsnelheid_kleur) !== null ? "Ja" : "Nee";
}

/**
 * Adapts a single printers row to the shape that normalizeProducts() expects.
 */
function adaptRow(row) {
  return {
    ean:                 row.ean,
    titel:           row.titel ?? "",
    merk:                row.merk,
    printtechnologie:    row.printtechnologie    ?? "",
    marktPositionering:  row.markt_positionering ?? "",
    duplex:              parseJaNee(row.duplex),
    kopieren:            parseFunctieAanwezig(row.kopieren),
    scannen:             parseFunctieAanwezig(row.scannen),
    faxen:               parseFunctieAanwezig(row.faxen),
    wifi:                parseJaNee(row.wifi),
    bluetooth:           parseJaNee(row.bluetooth),
    adf:                 parseJaNee(row.adf),
    printsnelheidZwart:  parseFirstInt(row.printsnelheid_zwart),
    printsnelheidKleur:  parseFirstInt(row.printsnelheid_kleur),
    kleur:               row.kleur ?? "",
    display:             parseJaNee(row.display),
    printkleuren:        row.printkleuren ?? "",
    kanKleurenPrinten:   heeftKleurenPrinten(row),
    icecat_afbeelding:   row.icecat_afbeelding  ?? "",
    icecat_afbeeldingen: Array.isArray(row.icecat_afbeeldingen) ? row.icecat_afbeeldingen : [],
    aanbieders:          adaptAanbieders(row),
  };
}

/**
 * Fetches all rows from the `printers` table with offset-based pagination.
 */
async function fetchAll() {
  const PAGE_SIZE = 1000;
  const results = [];
  let offset = 0;

  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/printers?order=ean&limit=${PAGE_SIZE}&offset=${offset}`;
    const response = await fetch(url, { headers: HEADERS });

    if (!response.ok) {
      throw new Error(
        `Supabase fetch mislukt (printers): ${response.status} ${response.statusText}`
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
 * Fetches all printers and returns them in the shape normalizeProducts() expects.
 */
export async function fetchProducts() {
  const rows = await fetchAll();
  return samenvoegDuplicaten(rows).map(adaptRow).filter(Boolean);
}
