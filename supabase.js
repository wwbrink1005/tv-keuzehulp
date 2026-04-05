const SUPABASE_URL = "https://qbgxkilpjckftkfznszn.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFiZ3hraWxwamNrZnRrZnpuc3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MDgyNTYsImV4cCI6MjA5MDk4NDI1Nn0.bo_EdTF--I_m70-7vpEQXPjF0ogocfRia9IQyMrhBtY";

const HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

/**
 * Transforms the Supabase aanbieder-array into the flat cb/expert shape
 * that normalizeProducts() expects.
 */
function adaptAanbieders(aanbieders) {
  const cb = Array.isArray(aanbieders)
    ? aanbieders.find((a) => a.aanbieder === "coolblue") ?? {}
    : {};
  const expert = Array.isArray(aanbieders)
    ? aanbieders.find((a) => a.aanbieder === "expert") ?? {}
    : {};

  return {
    productnaam_cb: cb.productnaam ?? "",
    afbeelding_cb: cb.afbeelding ?? "",
    prijs_cb: cb.prijs != null ? String(cb.prijs) : "",
    url_cb: cb.url ?? "",
    levertijd_cb: cb.levertijd ?? "",
    verzendkosten_cb: cb.verzendkosten != null ? String(cb.verzendkosten) : "",
    productnaam_expert: expert.productnaam ?? "",
    afbeelding_expert: expert.afbeelding ?? "",
    prijs_expert: expert.prijs != null ? String(expert.prijs) : "",
    url_expert: expert.url ?? "",
    levertijd_expert: expert.levertijd ?? "",
    verzendkosten_expert:
      expert.verzendkosten != null ? String(expert.verzendkosten) : "",
  };
}

/**
 * Adapts a single Supabase row to the products.json shape.
 */
function adaptProduct(row) {
  return {
    ean: row.ean,
    extra_eans: row.extra_eans ?? [],
    type: row.type,
    grootte: String(row.grootte),
    merk: row.merk,
    scherpte: row.scherpte,
    hz: String(row.hz),
    ambilight: String(row.ambilight ?? "false").toUpperCase(),
    aanbieders: [adaptAanbieders(row.aanbieders)],
  };
}

/**
 * Fetches all live products from Supabase and returns them in the
 * same shape as data/products.json.
 *
 * Uses page-based pagination so it works regardless of the row count.
 */
export async function fetchProducts() {
  const PAGE_SIZE = 1000;
  const results = [];
  let offset = 0;

  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/tvs?status=eq.live&order=id&limit=${PAGE_SIZE}&offset=${offset}`;
    const response = await fetch(url, { headers: HEADERS });

    if (!response.ok) {
      throw new Error(
        `Supabase fetch mislukt: ${response.status} ${response.statusText}`
      );
    }

    const page = await response.json();
    results.push(...page.map(adaptProduct));

    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return results;
}
