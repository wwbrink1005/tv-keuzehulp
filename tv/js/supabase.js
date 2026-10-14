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
  "SQD-Mini LED":"Mini LED",
  "RGB-Mini LED":"Mini LED",
  "Mini RGB":    "Mini LED",
  "Micro RGB":   "Mini LED",
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
 * Geeft de generieke aanbieders-lijst terug die normalizeProducts() verwacht,
 * rechtstreeks uit de `aanbieders`-jsonb-kolom (gevuld door de pipeline). Een
 * nieuwe aanbieder zoals MediaMarkt vereist hier geen wijziging.
 */
function adaptAanbieders(row) {
  return Array.isArray(row.aanbieders) ? row.aanbieders : [];
}

/**
 * Adapts a single televisies row to the shape that normalizeProducts() expects.
 * Returns null when the row cannot be mapped (unknown type or missing size).
 */
/**
 * Icecat's "Display technologie" klopt bij zo'n 15% van de tv's niet (gemeten
 * 14-10-2026): Mini LED- en RGB-tv's staan als "LED" of "QLED", QLED-tv's als
 * "LED", en een Full HD-tv van €279 als "OLED". De productnamen van de winkels
 * zeggen het wel goed, dus die gaan voor. Alleen bij een duidelijk signaal:
 * Mini LED/RGB in één naam is genoeg (zo heet niets anders), OLED en QLED
 * moeten in minstens de helft van de namen staan.
 */
const NAAM_MINI = /mini[\s-]?led|true rgb|rgb[\s-]?(led|tv|mini)/i;
const NAAM_OLED = /(^|[^q])oled/i;
const NAAM_QLED = /qled|qned|nanocell/i;

function productNamen(row) {
  const winkels = Array.isArray(row.aanbieders) ? row.aanbieders.map((a) => a?.productnaam) : [];
  return [row.titel, ...winkels].filter(Boolean).map(String);
}

function typeUitNamen(namen, type) {
  if (!namen.length || type === "Neo QLED") return type;
  const aandeel = (re) => namen.filter((n) => re.test(n)).length / namen.length;
  if (aandeel(NAAM_MINI) > 0) return "Mini LED";
  if (type !== "OLED" && aandeel(NAAM_OLED) >= 0.5) return "OLED";
  if (type === "OLED" && aandeel(NAAM_OLED) === 0) return aandeel(NAAM_QLED) > 0 ? "QLED" : "LED";
  if ((type === "LED" || !type) && aandeel(NAAM_QLED) >= 0.5) return "QLED";
  return type;
}

/**
 * Modeljaar uit de productnamen ("(2025)", "- 2026"). De titel gaat voor; staat
 * daar geen jaar in, dan het jaar dat de meeste winkels noemen, en bij een
 * gelijke stand het oudste. Winkelnamen zitten er soms naast: bol noemde de
 * Philips MLED910 (2025) "2026" (en ook "QLED"), terwijl titel, Expert en EP
 * 2025 zeiden. Het nieuwste jaar laten winnen maakte hem ten onrechte "nieuw".
 */
const jarenIn = (n) => [...String(n).matchAll(/\b(20[12]\d)\b/g)].map((m) => Number(m[1]));

function jaarUitNamen(namen, titel) {
  const uitTitel = jarenIn(titel ?? "");
  if (uitTitel.length) return Math.max(...uitTitel);
  const stemmen = new Map();
  for (const n of namen) for (const j of new Set(jarenIn(n))) stemmen.set(j, (stemmen.get(j) ?? 0) + 1);
  if (!stemmen.size) return null;
  return [...stemmen].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

function adaptRow(row) {
  const grootte = parseSchermInch(row.scherm_inch);
  if (!grootte) return null;

  const namen = productNamen(row);
  const type = typeUitNamen(namen, TECHNOLOGIE_MAP[row.display_technologie]);
  if (!type) return null;

  return {
    ean:                 row.ean,
    titel:           row.titel ?? "",
    type,
    grootte,
    merk:                row.merk,
    scherpte:            mapScherpte(row.scherm_type),
    hdr:                 row.hdr ?? "",
    jaar:                jaarUitNamen(namen, row.titel),
    hz:                  parseRefreshRate(row.refresh_rate),
    hdmiPoorten:         parseHdmiPoorten(row.hdmi_poorten),
    kleur:               row.kleur ?? "",
    icecat_afbeelding:   row.icecat_afbeelding  ?? "",
    icecat_afbeeldingen: Array.isArray(row.icecat_afbeeldingen) ? row.icecat_afbeeldingen : [],
    aanbieders:          adaptAanbieders(row),
    bijgewerktOp:        row.bijgewerkt_op ?? null,
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
  const url = `${SUPABASE_URL}/rest/v1/televisies?ean=in.(${[...varianten].join(",")})`;
  const response = await fetch(url, { headers: HEADERS });
  if (!response.ok) {
    throw new Error(`Supabase fetch mislukt (televisies): ${response.status} ${response.statusText}`);
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
