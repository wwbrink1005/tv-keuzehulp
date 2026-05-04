const SUPABASE_URL = "https://clypcdpapacpowxehxzv.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNseXBjZHBhcGFjcG93eGVoeHp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NTc3NDIsImV4cCI6MjA5MzEzMzc0Mn0.3BpYssokCLQdhbSwTvhOMj5ve5QYhg2Jzd7MIUYCHkE";

const HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

/**
 * Transforms the Supabase aanbieders array into the flat cb/expert shape
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
    productnaam_cb:     cb.productnaam ?? "",
    afbeelding_cb:      cb.afbeelding  ?? "",
    prijs_cb:           cb.prijs != null ? String(cb.prijs) : "",
    url_cb:             cb.url         ?? "",
    levertijd_cb:       cb.levertijd   ?? "",
    verzendkosten_cb:   cb.verzendkosten != null ? String(cb.verzendkosten) : "",
    productnaam_expert: expert.productnaam ?? "",
    afbeelding_expert:  expert.afbeelding  ?? "",
    prijs_expert:       expert.prijs != null ? String(expert.prijs) : "",
    url_expert:         expert.url         ?? "",
    levertijd_expert:   expert.levertijd   ?? "",
    verzendkosten_expert:
      expert.verzendkosten != null ? String(expert.verzendkosten) : "",
  };
}

/**
 * Adapts a single Supabase laptop row to the normalizeProducts shape.
 */
function adaptLaptop(row) {
  return {
    ean:            row.ean,
    extra_eans:     row.extra_eans ?? [],
    merk:           row.merk,
    schermdiagonaal: String(row.schermdiagonaal),
    werkgeheugen:   String(row.werkgeheugen),
    opslag:         String(row.opslag),
    touchscreen:    row.touchscreen ?? "Nee",
    usb_c:          row.usb_c ?? "Nee",
    hdmi:           row.hdmi != null ? String(row.hdmi) : "0",
    resolutie:      row.resolutie,
    paneeltype:     row.paneeltype,
    hz:             String(row.hz),
    processor:      row.processor,
    gpu:            row.gpu,
    gewicht:        String(row.gewicht),
    aanbieders:     [adaptAanbieders(row.aanbieders)],
  };
}

/**
 * Fetches all live laptops from Supabase.
 * Uses page-based pagination so it works regardless of row count.
 */
export async function fetchProducts() {
  const PAGE_SIZE = 1000;
  const results = [];
  let offset = 0;

  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/laptops?status=eq.live&order=id&limit=${PAGE_SIZE}&offset=${offset}`;
    const response = await fetch(url, { headers: HEADERS });

    if (!response.ok) {
      throw new Error(
        `Supabase fetch mislukt: ${response.status} ${response.statusText}`
      );
    }

    const page = await response.json();
    results.push(...page.map(adaptLaptop));

    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return results;
}
