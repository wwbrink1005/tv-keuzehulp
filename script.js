/**
 * script.js — TV Keuzehulp Google Sheets sync
 *
 * Leest twee tabbladen uit Google Sheets:
 *   - "specs"  → tv-specificaties (kolom A-D zijn EAN-nummers)
 *   - "feeds"  → aanbieder-info   (kolom A-D zijn EAN-nummers, meerdere rijen per EAN mogelijk)
 *
 * Output: ./data/products.json
 * Structuur per product: specs + array van aanbieders
 *
 * Gebruik: node script.js
 */

const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

// ─── CONFIGURATIE ────────────────────────────────────────────────────────────

const CREDENTIALS_FILE       = path.join(__dirname, "credentials.json");
const SPREADSHEET_ID_SPECS   = "15vkHSHiHiB1i69Otxye9Mfd6VZQYy_0FQCNKj-ich68";
const SPREADSHEET_ID_FEEDS   = "1Jadi03SYMsrbtZggVLviVc7OBr2VMxyiubJdtxsWgxc";
const SHEET_SPECS             = "specificaties";
const SHEET_FEEDS             = "lijst";
const OUTPUT_FILE             = path.join(__dirname, "data", "products.json");

// ─────────────────────────────────────────────────────────────────────────────

// EAN-kolomnamen (kolommen A t/m D in beide sheets)
const EAN_COLS = ["ean1", "ean2", "ean3", "ean4"];

async function main() {
  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_FILE,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  console.log("Ophalen van Google Sheets...");

  const [specsRes, feedsRes] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID_SPECS, range: SHEET_SPECS }),
    sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID_FEEDS, range: SHEET_FEEDS }),
  ]);

  const specs = parseSheet(specsRes.data.values);
  const feeds = parseSheet(feedsRes.data.values);

  console.log(`Specs: ${specs.length} rijen | Feeds: ${feeds.length} rijen`);

  // Bouw een EAN → lijst van aanbieders map
  // Elke rij in feeds kan meerdere EANs bevatten (kolom A-D)
  const eanToOffers = {};

  feeds.forEach((row) => {
    // Verwijder de EAN-velden uit het aanbieder-object
    const { ean1, ean2, ean3, ean4, ...offerData } = row;

    // Sla de offer op onder elke niet-lege EAN
    [ean1, ean2, ean3, ean4].forEach((ean) => {
      if (!ean) return;
      const key = String(ean).trim();
      if (!eanToOffers[key]) eanToOffers[key] = [];
      eanToOffers[key].push(offerData);
    });
  });

  // Koppel specs aan offers via EAN
  const products = specs.map((tv) => {
    const { ean1, ean2, ean3, ean4, ...specData } = tv;

    // Zoek de eerste EAN die een match heeft in feeds
    let aanbieders = [];
    [ean1, ean2, ean3, ean4].forEach((ean) => {
      if (!ean) return;
      const key = String(ean).trim();
      if (eanToOffers[key]) {
        // Voeg toe, maar voorkom dubbelen als meerdere EANs matchen
        eanToOffers[key].forEach((offer) => {
          if (!aanbieders.includes(offer)) aanbieders.push(offer);
        });
      }
    });

    return {
      ean: ean1 || ean2 || ean3 || ean4, // primaire EAN
      extra_eans: [ean2, ean3, ean4].filter(Boolean),
      ...specData,
      aanbieders,
    };
  });

  // Zorg dat de output-map bestaat
  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(products, null, 2), "utf8");

  console.log(`\nKlaar. ${products.length} producten geschreven naar ${OUTPUT_FILE}`);
  const metAanbieders = products.filter((p) => p.aanbieders.length > 0).length;
  console.log(`Gekoppeld aan aanbieders: ${metAanbieders} / ${products.length}`);
}

/**
 * Zet Google Sheets waarden om naar array van objecten.
 * Rij 1 = headers. Kolommen A-D worden altijd ean1 t/m ean4 genoemd.
 */
function parseSheet(values) {
  if (!values || values.length < 2) return [];

  const rawHeaders = values[0];
  const headers = rawHeaders.map((h, i) => {
    if (i === 0) return "ean1";
    if (i === 1) return "ean2";
    if (i === 2) return "ean3";
    if (i === 3) return "ean4";
    return String(h).trim().toLowerCase().replace(/\s+/g, "_");
  });

  return values
    .slice(1)
    .filter((row) => row.some((cell) => cell !== "" && cell !== undefined))
    .map((row) => {
      const obj = {};
      headers.forEach((header, i) => {
        obj[header] = row[i] !== undefined ? row[i] : "";
      });
      return obj;
    });
}

main().catch((err) => {
  console.error("Fout:", err.message);
  process.exit(1);
});
