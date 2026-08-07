const SUPABASE_URL = "https://clypcdpapacpowxehxzv.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNseXBjZHBhcGFjcG93eGVoeHp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NTc3NDIsImV4cCI6MjA5MzEzMzc0Mn0.3BpYssokCLQdhbSwTvhOMj5ve5QYhg2Jzd7MIUYCHkE";

const HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

/**
 * Geeft de generieke aanbieders-lijst terug die normalizeProducts() verwacht.
 * Leest bij voorkeur de aanbieders-jsonb-kolom (gevuld door de pipeline, al
 * in de juiste vorm). Valt terug op de oude losse coolblue- en
 * expert-kolommen zolang de pipeline nog niet is omgezet naar de jsonb-kolom.
 */
function adaptAanbieders(row) {
  if (Array.isArray(row.aanbieders) && row.aanbieders.length > 0) {
    return row.aanbieders;
  }
  return [
    {
      winkel:        "Coolblue",
      productnaam:   row.coolblue_naam              ?? "",
      prijs:         row.coolblue_prijs    != null   ? String(row.coolblue_prijs)    : "",
      url:           row.coolblue_affiliate_link     ?? "",
      levertijd:     row.coolblue_levertijd          ?? "",
      verzendkosten: row.coolblue_bezorgkosten != null ? String(row.coolblue_bezorgkosten) : "",
    },
    {
      winkel:        "Expert",
      productnaam:   row.expert_naam                ?? "",
      prijs:         row.expert_prijs     != null    ? String(row.expert_prijs)      : "",
      url:           row.expert_affiliate_link       ?? "",
      levertijd:     row.expert_levertijd            ?? "",
      verzendkosten: row.expert_bezorgkosten != null ? String(row.expert_bezorgkosten) : "",
    },
  ];
}

/**
 * Adapts a single koelkasten row to the shape that normalizeProducts() expects.
 * The koelkasten columns are already clean (no Icecat-string-parsing needed),
 * so this is mostly a pass-through with light type coercion.
 */
function adaptRow(row) {
  return {
    ean:                    row.ean,
    merk:                   row.merk,
    apparaatplaatsing:      row.apparaatplaatsing ?? "",
    breedte_mm:             row.breedte_mm,
    hoogte_mm:              row.hoogte_mm,
    diepte_mm:              row.diepte_mm,
    nis_hoogte_cm:          row.nis_hoogte_cm,
    nis_breedte_cm:         row.nis_breedte_cm,
    netto_inhoud_l:         row.netto_inhoud_l,
    energielabel:           row.energielabel ?? "",
    automatisch_ontdooien:  row.automatisch_ontdooien ?? "",
    geluidsniveau_db:       row.geluidsniveau_db,
    vrieslades:             row.vrieslades ?? "",
    vriescapaciteit:        row.vriescapaciteit ?? "",
    icecat_afbeelding:      row.icecat_afbeelding  ?? "",
    icecat_afbeeldingen:    Array.isArray(row.icecat_afbeeldingen) ? row.icecat_afbeeldingen : [],
    aanbieders:             adaptAanbieders(row),
  };
}

/**
 * Fetches all rows from the `koelkasten` table with offset-based pagination.
 */
async function fetchAll() {
  const PAGE_SIZE = 1000;
  const results = [];
  let offset = 0;

  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/koelkasten?order=ean&limit=${PAGE_SIZE}&offset=${offset}`;
    const response = await fetch(url, { headers: HEADERS });

    if (!response.ok) {
      throw new Error(
        `Supabase fetch mislukt (koelkasten): ${response.status} ${response.statusText}`
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
 * Fetches all koelkasten and returns them in the shape normalizeProducts() expects.
 */
export async function fetchProducts() {
  const rows = await fetchAll();
  return samenvoegDuplicaten(rows).map(adaptRow).filter(Boolean);
}
