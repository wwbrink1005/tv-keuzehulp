import { klant, productLink, B2B_SUPABASE_URL, B2B_SUPABASE_ANON_KEY } from "../../shared/klant.js";

const SUPABASE_URL = "https://clypcdpapacpowxehxzv.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNseXBjZHBhcGFjcG93eGVoeHp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NTc3NDIsImV4cCI6MjA5MzEzMzc0Mn0.3BpYssokCLQdhbSwTvhOMj5ve5QYhg2Jzd7MIUYCHkE";

// Klantmodus leest uit het aparte B2B-project (zie shared/klant.js).
const BASIS_URL = klant ? B2B_SUPABASE_URL : SUPABASE_URL;
const SLEUTEL = klant ? B2B_SUPABASE_ANON_KEY : SUPABASE_ANON_KEY;

const HEADERS = {
  apikey: SLEUTEL,
  Authorization: `Bearer ${SLEUTEL}`,
};

/**
 * Geeft de generieke aanbieders-lijst terug die normalizeProducts() verwacht,
 * rechtstreeks uit de `aanbieders`-jsonb-kolom (gevuld door de pipeline). Een
 * nieuwe aanbieder zoals MediaMarkt vereist hier geen wijziging.
 */
function adaptAanbieders(row) {
  const lijst = Array.isArray(row.aanbieders) ? row.aanbieders : [];
  // Klantmodus: de enige "winkel" is de klant zelf; de link krijgt hun
  // meet-tag (utm) zodat zij zien welke verkopen via de keuzehulp komen.
  return klant ? lijst.map(a => ({ ...a, url: productLink(a.url) })) : lijst;
}

/**
 * Adapts a single koelkasten row to the shape that normalizeProducts() expects.
 * The koelkasten columns are already clean (no Icecat-string-parsing needed),
 * so this is mostly a pass-through with light type coercion.
 */
function adaptRow(row) {
  return {
    ean:                    row.ean,
    titel:           row.titel ?? "",
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
    vriezer_l:              row.vriezer_l ?? "",
    nofrost_vriezer:        row.nofrost_vriezer ?? "",
    waterdispenser:         row.waterdispenser ?? "",
    ijsmaker:               row.ijsmaker ?? "",
    vers_zone:              row.vers_zone ?? "",
    icecat_afbeelding:      row.icecat_afbeelding  ?? "",
    icecat_afbeeldingen:    Array.isArray(row.icecat_afbeeldingen) ? row.icecat_afbeeldingen : [],
    aanbieders:             adaptAanbieders(row),
    bijgewerktOp:           row.bijgewerkt_op ?? null,
  };
}

/**
 * Fetches all rows from the `koelkasten` table with offset-based pagination.
 */
// Klantmodus leest de tabel van de klant (zie shared/klant.js); lokaal kan
// dat ook een JSON-bestand zijn (droge uitvoer van de pipeline).
const TABEL = klant?.databron ?? "koelkasten";

async function fetchAll() {
  if (TABEL.endsWith(".json")) {
    const res = await fetch(TABEL, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Testbestand niet gevonden: ${TABEL}`);
    return res.json();
  }
  const PAGE_SIZE = 1000;
  const results = [];
  let offset = 0;

  while (true) {
    if (!BASIS_URL) throw new Error("B2B-Supabase-project nog niet ingesteld (shared/klant.js)");
    const url = `${BASIS_URL}/rest/v1/${TABEL}?order=${klant ? "klant_id" : "ean"}&limit=${PAGE_SIZE}&offset=${offset}`;
    const response = await fetch(url, { headers: HEADERS });

    if (!response.ok) {
      throw new Error(
        `Supabase fetch mislukt (${TABEL}): ${response.status} ${response.statusText}`
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
 * Eén download per pagina: result-filters.js en de kaartverrijking
 * (shared/kaart-verrijking.js) delen dezelfde belofte. Mislukt hij, dan
 * probeert de volgende aanroep het opnieuw.
 */
/**
 * Alleen de opgegeven producten, voor de favorietenpagina (favorieten/).
 * Favorieten bewaren de EAN zoals fetchProducts() hem teruggeeft (13
 * cijfers); in de tabel kan dezelfde EAN als 12 cijfers staan, dus we
 * vragen beide vormen op.
 * @param {string[]} eans
 */
export async function fetchProductsByEan(eans) {
  const varianten = new Set();
  for (const e of eans) {
    const s = String(e).trim();
    if (!/^\d{8,14}$/.test(s)) continue;
    varianten.add(s);
    if (s.length === 13 && s.startsWith("0")) varianten.add(s.slice(1));
  }
  if (!varianten.size) return [];
  const url = `${SUPABASE_URL}/rest/v1/koelkasten?ean=in.(${[...varianten].join(",")})`;
  const response = await fetch(url, { headers: HEADERS });
  if (!response.ok) {
    throw new Error(`Supabase fetch mislukt (koelkasten): ${response.status} ${response.statusText}`);
  }
  return samenvoegDuplicaten(await response.json()).map(adaptRow).filter(Boolean);
}

let belofte = null;
export function fetchProducts() {
  // Klantdata heeft een eigen sleutel (klant_id) en soms geen EAN: samenvoegen
  // op EAN zou alle producten zonder EAN tot één product plakken.
  belofte ??= fetchAll()
    .then((rows) => (klant ? rows : samenvoegDuplicaten(rows)).map(adaptRow).filter(Boolean))
    .catch((err) => { belofte = null; throw err; });
  return belofte;
}
