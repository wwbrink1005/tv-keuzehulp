// shared/product-counts.js — vult overal waar een productaantal getoond wordt
// (homepage "populaire keuzehulpen", homepage hero-USP, categorie-gidspagina's
// "Kies uit X+ ..."-USP) automatisch het actuele, live aantal in vanuit
// Supabase. Voorkomt dat deze getallen handmatig bijgehouden moeten worden en
// achterlopen bij de werkelijke catalogus.
//
// Gebruik: zet op het element dat het getal moet tonen een
// data-product-count="{categorie}" attribuut (categorie = de sleutel uit
// TABEL_PER_CATEGORIE hieronder, of "totaal" voor de som van alle
// categorieën) en laad dit script op de pagina — de rest gaat vanzelf.

const SUPABASE_URL = "https://clypcdpapacpowxehxzv.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNseXBjZHBhcGFjcG93eGVoeHp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NTc3NDIsImV4cCI6MjA5MzEzMzc0Mn0.3BpYssokCLQdhbSwTvhOMj5ve5QYhg2Jzd7MIUYCHkE";

const TABEL_PER_CATEGORIE = {
  televisies:  "televisies",
  laptops:     "laptops",
  monitoren:   "monitoren",
  desktops:    "desktops",
  printers:    "printers",
  wasmachines: "wasmachines",
  koelkasten:  "koelkasten",
  vriezers:    "vriezers",
  soundbars:   "soundbars",
  wasdrogers:  "wasdrogers",
  vaatwassers: "vaatwassers",
  robotstofzuigers: "robotstofzuigers",
  airfryers: "airfryers",
};

/**
 * Rondt een aantal naar beneden af tot een "mooi" marketing-getal, altijd met
 * een "+"-suffix (nooit meer beloven dan er echt is): < 1000 → dichtstbijzijnde
 * 10, 1000-9999 → dichtstbijzijnde 100, 10.000+ → dichtstbijzijnde 1000.
 * Bijvoorbeeld 161 → "160+", 897 → "890+", 1748 → "1700+", 12345 → "12000+".
 *
 * De vorige grens bij 100 (i.p.v. 1000) rondde een categorie die net boven de
 * 100 zit veel te zwaar af: 161 wasdrogers werd "100+" (61 producten, 38% van
 * de catalogus, verdwenen in de afronding) — trof ook vriezers (122→"100+",
 * 18%) en soundbars (128→"100+", 22%). Onder de 1000 producten is een
 * tiental-afronding nog steeds "mooi" genoeg voor een marketing-getal en
 * houdt het verlies bij elke live categorie onder de 1%.
 */
export function roundNiceCount(n) {
  if (!Number.isFinite(n) || n <= 0) return null;
  let step;
  if (n < 1000) step = 10;
  else if (n < 10000) step = 100;
  else step = 1000;
  const rounded = Math.floor(n / step) * step;
  return `${rounded}+`;
}

/**
 * Haalt het totaal aantal rijen in een tabel op via Supabase's exact-count
 * header — vraagt geen echte rijen op (limit=1), alleen de Content-Range.
 */
async function haalAantalOp(tabel) {
  const url = `${SUPABASE_URL}/rest/v1/${tabel}?select=ean&limit=1`;
  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Prefer: "count=exact",
    },
  });
  if (!response.ok) throw new Error(`Supabase count mislukt (${tabel}): ${response.status}`);
  const contentRange = response.headers.get("content-range") ?? "";
  const total = parseInt(contentRange.split("/")[1], 10);
  return Number.isFinite(total) ? total : 0;
}

/**
 * Vult alle [data-product-count]-elementen op de huidige pagina in. Elke
 * categorie wordt maar 1x opgehaald, ook als hij op meerdere plekken op de
 * pagina staat (bv. homepage-cards). "totaal" telt alle categorieën samen op.
 */
export async function vulProductAantallenIn(root = document) {
  const elements = Array.from(root.querySelectorAll("[data-product-count]"));
  if (elements.length === 0) return;

  const benodigdeCategorieen = new Set(
    elements.map(el => el.dataset.productCount).filter(c => c !== "totaal")
  );
  const heeftTotaal = elements.some(el => el.dataset.productCount === "totaal");
  if (heeftTotaal) {
    Object.keys(TABEL_PER_CATEGORIE).forEach(c => benodigdeCategorieen.add(c));
  }

  const aantallen = {};
  await Promise.all(
    Array.from(benodigdeCategorieen).map(async categorie => {
      const tabel = TABEL_PER_CATEGORIE[categorie];
      if (!tabel) return;
      try {
        aantallen[categorie] = await haalAantalOp(tabel);
      } catch {
        aantallen[categorie] = null;
      }
    })
  );

  elements.forEach(el => {
    const categorie = el.dataset.productCount;
    let n;
    if (categorie === "totaal") {
      const waarden = Object.values(aantallen).filter(Number.isFinite);
      n = waarden.length > 0 ? waarden.reduce((a, b) => a + b, 0) : null;
    } else {
      n = aantallen[categorie];
    }
    const label = Number.isFinite(n) ? roundNiceCount(n) : null;
    // Bij een mislukte fetch de bestaande (statische) tekst gewoon laten
    // staan i.p.v. leeg te maken — beter een licht verouderd getal tonen dan
    // helemaal niks.
    if (label) el.textContent = label;
  });
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => vulProductAantallenIn());
}
