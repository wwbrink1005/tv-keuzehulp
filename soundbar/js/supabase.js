const SUPABASE_URL = "https://clypcdpapacpowxehxzv.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNseXBjZHBhcGFjcG93eGVoeHp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NTc3NDIsImV4cCI6MjA5MzEzMzc0Mn0.3BpYssokCLQdhbSwTvhOMj5ve5QYhg2Jzd7MIUYCHkE";

const HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

/**
 * Normalise "Ja"/"Nee"/true/false/null naar "Ja" of "Nee".
 */
function parseJaNee(value) {
  if (!value) return "Nee";
  const s = String(value).toLowerCase();
  if (s === "ja" || s === "true" || s === "yes" || s === "1") return "Ja";
  return "Nee";
}

/**
 * Extraheert het eerste getal uit strings als "3" of "3 poorten".
 */
function parseFirstInt(value) {
  if (!value) return 0;
  const m = String(value).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * Extraheert een millimeterwaarde uit Icecat-strings als "97 cm (38.2")" of "970".
 */
function parseMm(value) {
  if (!value) return null;
  const s = String(value).replace(",", ".");
  const cmMatch = s.match(/^(\d+(?:\.\d+)?)\s*cm/);
  if (cmMatch) return parseFloat(cmMatch[1]) * 10;
  const numMatch = s.match(/^(\d+(?:\.\d+)?)/);
  return numMatch ? parseFloat(numMatch[1]) : null;
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
 * Icecat's breedte-spec bevat af en toe evident foute waarden (bijv. "37 mm"
 * voor een soundbar die overduidelijk tientallen centimeters breed is — een
 * datafout aan Icecat's kant, geen parse-fout hier). Een soundbar smaller dan
 * 15 cm bestaat in de praktijk niet, dus behandel dat als onbekend i.p.v.
 * een onzinnige maat te tonen of te gebruiken in de breedtefilter.
 */
function parseBreedteMm(value) {
  const mm = parseMm(value);
  return Number.isFinite(mm) && mm >= 150 ? mm : null;
}

/**
 * Adapts a single soundbars row to the shape that normalizeProducts() expects.
 */
function adaptRow(row) {
  return {
    ean:                  row.ean,
    merk:                 row.merk,
    breedte_mm:           parseBreedteMm(row.breedte_mm),
    hoogte_mm:            parseMm(row.hoogte_mm),
    diepte_mm:            parseMm(row.diepte_mm),
    kanalen:              row.kanalen ?? "",
    audio_decoders:       row.audio_decoders ?? "",
    vermogen_watt:        parseFirstInt(row.vermogen_watt),
    subwoofer_meegeleverd: parseJaNee(row.subwoofer_meegeleverd),
    hdmi_poorten:         parseFirstInt(row.hdmi_poorten),
    earc:                 parseJaNee(row.earc),
    wandmontage:          parseJaNee(row.wandmontage),
    wifi:                 parseJaNee(row.wifi),
    bluetooth:            parseJaNee(row.bluetooth),
    icecat_afbeelding:    row.icecat_afbeelding  ?? "",
    icecat_afbeeldingen:  Array.isArray(row.icecat_afbeeldingen) ? row.icecat_afbeeldingen : [],
    aanbieders:           adaptAanbieders(row),
  };
}

/**
 * Fetches all rows from the `soundbars` table with offset-based pagination.
 */
async function fetchAll() {
  const PAGE_SIZE = 1000;
  const results = [];
  let offset = 0;

  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/soundbars?order=ean&limit=${PAGE_SIZE}&offset=${offset}`;
    const response = await fetch(url, { headers: HEADERS });

    if (!response.ok) {
      throw new Error(
        `Supabase fetch mislukt (soundbars): ${response.status} ${response.statusText}`
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
 * Fetches all soundbars and returns them in the shape normalizeProducts() expects.
 */
export async function fetchProducts() {
  const rows = await fetchAll();
  return samenvoegDuplicaten(rows).map(adaptRow).filter(Boolean);
}
