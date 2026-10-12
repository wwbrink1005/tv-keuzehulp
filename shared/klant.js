// shared/klant.js — klantinstellingen voor de B2B-embed (keuzehulp op de
// site van een webshop, in een iframe). Zie strategie/b2b-keuzehulp.md.
//
// Eén code voor producthulp.nl én alle klanten: de keuzehulpmodules lezen
// hier of ze in klantmodus draaien en passen dan alleen hun databron, opslag,
// links en uitgezette opties aan. Op producthulp.nl zelf is `klant` altijd
// null en verandert er niets.
//
// Klantmodus is ALLEEN actief onder /embed/. Zo kan niemand met ?klant= op de
// consumentensite een ander assortiment laden.
//
// Op een embed-pagina zonder geldige klant stopt alles met een foutmelding:
// nooit terugvallen op onze eigen catalogus, want dan staan er opeens
// affiliatelinks naar andere winkels op de site van een klant.

// Klantdata staat in een APART Supabase-project ("b2b"), los van de
// catalogus van producthulp.nl. De anon-sleutel is publiek (net als die van
// het hoofdproject in de categorie-JS) en mag hier dus staan; de
// service-sleutel om te schrijven staat alleen in de .env van de pipeline.
export const B2B_SUPABASE_URL = "https://etnizgscqpylxwhyjfzj.supabase.co";
export const B2B_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0bml6Z3NjcXB5bHh3aHlqZnpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzNjExMTgsImV4cCI6MjEwNjkzNzExOH0.ZSdPIxyuAEtyn5EHhznBJF2Tuc61XmArkMQWX9_ehbU";

const params = new URLSearchParams(location.search);
import { isEmbed } from "./embed-modus.js";
export { isEmbed };
const isLokaal = ["localhost", "127.0.0.1"].includes(location.hostname);

async function laadKlant() {
  if (!isEmbed) return null;
  const id = params.get("klant") || "";
  if (!/^[a-z0-9-]{2,40}$/.test(id)) return null;
  try {
    const res = await fetch(`klanten/${id}.json`, { cache: "no-cache" });
    if (!res.ok) return null;
    const cfg = await res.json();
    // Lokaal testen vóórdat de Supabase-tabel bestaat: ?bron=<pad>.json
    // wijst naar de droge uitvoer van de pipeline. Werkt alleen lokaal.
    const bron = params.get("bron");
    const databron = isLokaal && bron && /^[\w/.-]+\.json$/.test(bron) ? bron : cfg.databron;
    return { ...cfg, id, databron, uitgezet: new Set(cfg.uitgezet || []) };
  } catch {
    return null;
  }
}

export const klant = await laadKlant();

if (isEmbed && !klant) {
  document.documentElement.classList.remove("klant-laden");
  document.body.innerHTML = '<p style="font:15px/1.5 system-ui,sans-serif;color:#444;padding:24px;text-align:center">Deze keuzehulp is niet goed ingesteld. Neem contact op met de winkel.</p>';
  throw new Error("Embed zonder geldige klantinstellingen: gestopt (geen terugval op de eigen catalogus).");
}

/** Opslagsleutel, per klant gescheiden van producthulp.nl zelf. */
export function sleutel(naam) {
  return klant ? `klant_${klant.id}_${naam}` : naam;
}

/** Staat deze optie (bv. "verszone") uit voor deze klant? */
export function isUitgezet(optie) {
  return Boolean(klant?.uitgezet.has(optie));
}

/** Zet een uitgezette optie extra uit, bv. automatisch bij te weinig data. */
export function zetUit(optie) {
  klant?.uitgezet.add(optie);
}

/** Productlink van de klant met hun meet-tag (utm) erachter. */
export function productLink(url) {
  if (!klant?.productlink || !url) return url;
  const sjabloon = klant.productlink;
  // "{url}?utm=..." op een url die al een "?" heeft → "&" gebruiken.
  if (url.includes("?") && sjabloon.startsWith("{url}?")) {
    return url + "&" + sjabloon.slice("{url}?".length);
  }
  return sjabloon.replace("{url}", url);
}

/** Pad naar een pagina van de keuzehulp, in klantmodus naar de embed-versie. */
export function pagina(categorie, soort /* "vragen" | "resultaat" */) {
  if (!klant) return `${categorie}/${soort}/`;
  const pad = soort === "vragen" ? `embed/${categorie}/` : `embed/${categorie}/resultaat/`;
  const qs = new URLSearchParams({ klant: klant.id });
  if (params.get("bron") && isLokaal) qs.set("bron", params.get("bron"));
  return `${pad}?${qs}`;
}

/** Huisstijl van de klant op de CSS-variabelen van quiz3d.css en resultaat.css. */
function pasHuisstijlToe() {
  const root = document.documentElement;
  if (klant?.kleuren?.accent) {
    const { accent, accentDonker = accent } = klant.kleuren;
    for (const [naam, waarde] of [
      ["--accent", accent], ["--accent-mid", accent], ["--accent-dark", accentDonker],
      ["--c-accent", accent], ["--c-accent-dark", accentDonker],
    ]) root.style.setProperty(naam, waarde);
  }
  root.classList.remove("klant-laden");
}

pasHuisstijlToe();
