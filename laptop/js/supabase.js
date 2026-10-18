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
 * Bucketizes scherm_resolutie strings like "3840x2400" into display labels.
 */
function parseResolutieLabel(value) {
  if (!value) return "";
  const m = String(value).match(/(\d+)\s*x\s*(\d+)/i);
  if (!m) return String(value).trim();
  const width = parseInt(m[1], 10);
  if (width >= 3800) return "4K";
  if (width >= 2800) return "QHD+";
  if (width >= 2500) return "QHD";
  if (width >= 1900) return "Full HD";
  return "HD";
}

/**
 * Normalizes os strings like "Windows 11 Home in S mode" into simple labels.
 */
function parseOs(value) {
  if (!value) return "";
  const s = String(value).toLowerCase();
  if (s.includes("chrome")) return "Chrome OS";
  if (s.includes("windows")) return "Windows";
  if (s.includes("mac")) return "macOS";
  return String(value).trim();
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
 * Adapts a single laptops row to the shape that normalizeProducts() expects.
 */
function adaptRow(row) {
  return {
    ean:             row.ean,
    titel:           row.titel ?? "",
    extra_eans:      [],
    merk:            row.merk,
    schermdiagonaal: parseSchermInch(row.scherm_inch),
    werkgeheugen:    parseFirstInt(row.ram),
    opslag:          parseOpslag(row.opslag),
    touchscreen:         row.touchscreen ?? "Nee",
    // usb_c wordt door de pipeline al als "Ja"/"Nee" opgeslagen (afgeleid uit
    // meerdere Icecat-velden — het kale "Aantal USB Type-C-poorten"-veld is
    // vrijwel altijd leeg, zie merge_publish.py in de pipeline-repo).
    usb_c:               row.usb_c === "Ja" ? "Ja" : "Nee",
    hdmi:                row.hdmi ?? "0",
    resolutie:           parseResolutieLabel(row.scherm_resolutie),
    paneeltype:          row.scherm_type ?? "",
    // Was altijd "60" (nooit opgehaald). Nu de maximale verversing uit Icecat;
    // onbekend = null.
    hz:                  parseFirstInt(row.verversing_hz),
    processor:           row.processor ?? "",
    processor_familie:   row.processor_familie ?? "",
    gpu:                 row.gpu ?? "",
    gewicht:             parseGewicht(row.gewicht),
    os:                  parseOs(row.os),
    kleur:               row.kleur ?? "",
    // Sinds okt 2026 (keuzehulp-pipeline/migrations/laptops_extra_specs.sql)
    accuWh:              parseFloat(String(row.accu_wh ?? "").replace(",", ".")) || null,
    accuUren:            parseFirstInt(row.accu_uren),
    numeriekToetsenblok: row.numeriek_toetsenblok ?? "",
    vingerafdruk:        row.vingerafdruk ?? "",
    typeProduct:         row.type_product ?? "",
    icecat_afbeelding:   row.icecat_afbeelding  ?? "",
    icecat_afbeeldingen: Array.isArray(row.icecat_afbeeldingen) ? row.icecat_afbeeldingen : [],
    aanbieders:          adaptAanbieders(row),
    bijgewerktOp:        row.bijgewerkt_op ?? null,
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
  const url = `${SUPABASE_URL}/rest/v1/laptops?ean=in.(${[...varianten].join(",")})`;
  const response = await fetch(url, { headers: HEADERS });
  if (!response.ok) {
    throw new Error(`Supabase fetch mislukt (laptops): ${response.status} ${response.statusText}`);
  }
  const rows = await response.json();
  return samenvoegDuplicaten(rows).map(adaptRow).filter(Boolean);
}

/**
 * Alle producten in de vorm die normalizeProducts() verwacht.
 * Eén download per pagina: result-filters.js en de kaartverrijking
 * (shared/kaart-verrijking.js) delen dezelfde belofte. Mislukt hij, dan
 * probeert de volgende aanroep het opnieuw.
 */
let belofte = null;
export function fetchProducts() {
  belofte ??= fetchAll()
    .then((rows) => samenvoegDuplicaten(rows).map(adaptRow).filter(Boolean))
    .catch((err) => { belofte = null; throw err; });
  return belofte;
}
