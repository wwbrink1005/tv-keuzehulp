import { getGpuTier } from "./data.js";

const SUPABASE_URL = "https://clypcdpapacpowxehxzv.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNseXBjZHBhcGFjcG93eGVoeHp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NTc3NDIsImV4cCI6MjA5MzEzMzc0Mn0.3BpYssokCLQdhbSwTvhOMj5ve5QYhg2Jzd7MIUYCHkE";

const HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

function parseFirstInt(value) {
  if (!value) return 0;
  const m = String(value).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

function adaptAanbieders(row) {
  return {
    productnaam_cb:       row.coolblue_naam              ?? "",
    prijs_cb:             row.coolblue_prijs   != null   ? String(row.coolblue_prijs)   : "",
    url_cb:               row.coolblue_affiliate_link    ?? "",
    levertijd_cb:         row.coolblue_levertijd         ?? "",
    verzendkosten_cb:     row.coolblue_bezorgkosten != null ? String(row.coolblue_bezorgkosten) : "",
    productnaam_expert:   row.expert_naam                ?? "",
    prijs_expert:         row.expert_prijs    != null    ? String(row.expert_prijs)     : "",
    url_expert:           row.expert_affiliate_link      ?? "",
    levertijd_expert:     row.expert_levertijd           ?? "",
    verzendkosten_expert: row.expert_bezorgkosten != null ? String(row.expert_bezorgkosten) : "",
  };
}

function adaptRow(row) {
  return {
    ean:                 row.ean,
    merk:                row.merk,
    behuizing:           row.type_behuizing  ?? null,
    type_product:        row.type_product    ?? null,
    ram_gb:              row.ram_gb          ?? "",
    opslag_gb:           row.opslag_gb       ?? "",
    gpu:                 row.gpu_model       ?? "",
    gpuApart:            row.gpu_apart       ?? "Nee",
    gpuTier:             getGpuTier(row.gpu_model, row.gpu_apart),
    wifi:                row.wifi            ?? "Nee",
    kleur:               row.kleur           ?? "",
    rgb:                 row.rgb             ?? "Nee",
    waterkoeling:        row.waterkoeling    ?? "Nee",
    hdmiPoorten:         parseFirstInt(row.hdmi_poorten),
    displayport:         parseFirstInt(row.displayport_poorten),
    usbC:                parseFirstInt(row.usb32_gen2_type_c),
    os:                  row.os                ?? "",
    processorFabrikant:  row.processor_fabrikant ?? "",
    icecat_afbeelding:   row.icecat_afbeelding  ?? "",
    icecat_afbeeldingen: Array.isArray(row.icecat_afbeeldingen) ? row.icecat_afbeeldingen : [],
    aanbieders:          [adaptAanbieders(row)],
  };
}

async function fetchAll() {
  const PAGE_SIZE = 1000;
  const results   = [];
  let offset      = 0;

  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/desktops?order=ean&limit=${PAGE_SIZE}&offset=${offset}`;
    const response = await fetch(url, { headers: HEADERS });

    if (!response.ok) {
      throw new Error(
        `Supabase fetch mislukt (desktops): ${response.status} ${response.statusText}`
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

export async function fetchProducts() {
  const rows = await fetchAll();
  return samenvoegDuplicaten(rows).map(adaptRow).filter(Boolean);
}
