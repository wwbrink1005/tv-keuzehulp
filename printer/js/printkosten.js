// ─── Printkosten-rekentool (printer/blog/printkosten-uitgelegd/) ────────────
// Rekent per printersoort de totale kosten uit over een paar jaar: aanschaf plus
// inkt of toner, na de inkt die al bij de printer zit. Daarna de goedkoopste
// soort met echte printers uit de catalogus en een doorstap naar de keuzehulp,
// met de antwoorden alvast ingevuld (zie de #-parameters in shared/quiz3d.js).

import { fetchProducts } from "./supabase.js";
import { normalizeProducts } from "./utils.js";
import { SOORTEN, SOORT_LABEL } from "./data.js";

// Kosten per pagina: mediaan van 222 losse, originele cartridges, inktflessen
// en toners bij Coolblue (prijzen 28-10-2026), gedeeld door de paginaopbrengst
// volgens ISO/IEC 19752 en 24711 uit Icecat. Een kleurenpagina is zwart plus
// de kleurinkt (drie losse kleuren, of één driekleurencartridge).
// Meegeleverd: 25e percentiel van "Capaciteit meegeleverde cartridge" in de
// Icecat-gegevens van onze printers; instapprijs: 25e percentiel van de
// catalogus (alleen gebruikt tot de live prijzen binnen zijn).
// Herberekenen als de cartridgeprijzen flink verschuiven.
export const PEILDATUM = "28 oktober 2026";
export const KOSTEN = {
  cartridge:  { zw: 0.0722, kleur: 0.1813, meeZw: 120,  meeKl: 75,   prijs: 84 },
  tank:       { zw: 0.0042, kleur: 0.0123, meeZw: 4500, meeKl: 5200, prijs: 219 },
  laserZw:    { zw: 0.0556, kleur: null,   meeZw: 700,  meeKl: 0,    prijs: 181 },
  laserKleur: { zw: 0.0596, kleur: 0.2579, meeZw: 800,  meeKl: 500,  prijs: 342 },
};

const LIDWOORD_LABEL = {
  cartridge: "een inkjetprinter met cartridges",
  tank: "een inkttankprinter",
  laserZw: "een zwart-witlaserprinter",
  laserKleur: "een kleurenlaserprinter",
};

const MEERVOUD = {
  cartridge: "inkjetprinters met cartridges",
  tank: "inkttankprinters",
  laserZw: "zwart-witlaserprinters",
  laserKleur: "kleurenlaserprinters",
};

const IMG_FALLBACK = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 120 90%22%3E%3Crect width=%22120%22 height=%2290%22 fill=%22%23f5f5f7%22/%3E%3Crect x=%2235%22 y=%2230%22 width=%2250%22 height=%2230%22 rx=%224%22 fill=%22none%22 stroke=%22%2364748b%22 stroke-width=%222%22/%3E%3C/svg%3E";

const euro = (n) => "€" + Math.round(n).toLocaleString("nl-NL");
const cent = (n) => (n * 100).toLocaleString("nl-NL", { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + " ct";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const veiligeUrl = (u) => /^https?:\/\//i.test(String(u ?? "")) ? String(u) : null;

// Totale kosten na `maanden` voor een soort; null als de soort niet in kleur kan.
export function totaal(soort, paginasPerMaand, kleurAandeel, maanden, prijs = KOSTEN[soort].prijs) {
  const k = KOSTEN[soort];
  const kleurPaginas = paginasPerMaand * kleurAandeel * maanden;
  const zwPaginas = paginasPerMaand * maanden - kleurPaginas;
  if (kleurPaginas > 0 && k.kleur === null) return null;
  return prijs
    + Math.max(0, zwPaginas - k.meeZw) * k.zw
    + (kleurPaginas > 0 ? Math.max(0, kleurPaginas - k.meeKl) * k.kleur : 0);
}

// Eerste maand waarin `duur` (hogere aanschaf) goedkoper wordt dan `goedkoop`.
function omslagMaand(duur, goedkoop, ppm, kleur, prijzen) {
  for (let m = 1; m <= 120; m++) {
    const a = totaal(duur, ppm, kleur, m, prijzen[duur]);
    const b = totaal(goedkoop, ppm, kleur, m, prijzen[goedkoop]);
    if (a !== null && b !== null && a < b) return m;
  }
  return null;
}

function kwantiel(xs, q) {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(q * (s.length - 1))] : null;
}

// Antwoorden voor de printer-keuzehulp (zelfde waarden als printer/vragen/vragen.js).
function keuzehulpLink(ppm, kleur, soort) {
  const volume = ppm < 40 ? "weinig" : ppm <= 200 ? "regelmatig" : "veel";
  const kl = kleur === 0 ? "zw" : kleur <= 0.25 ? "soms" : "vaak";
  const kosten = soort === "cartridge" ? "aanschaf" : "printen";
  return `printer/vragen/#q=1&volume=${volume}&kleur=${kl}&kosten=${kosten}`;
}

export function initPrintkosten(root) {
  const el = (sel) => root.querySelector(sel);
  const ppmInput = el("#pkPaginas");
  const ppmUit = el("#pkPaginasUit");
  const uitslag = el("#pkUitslag");
  let kleur = 0.1;
  let jaren = 3;
  let printers = null;
  const prijzen = Object.fromEntries(SOORTEN.map((s) => [s, KOSTEN[s].prijs]));
  let gemeten = false;
  let meetTimer = null;

  function kies(groep, waarde) {
    root.querySelectorAll(`[data-${groep}]`).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset[groep] === String(waarde))));
  }

  function voorbeelden(soort) {
    if (!printers) return "";
    const lijst = printers
      .filter((p) => p.soort === soort && !p.alleenFoto && !p.hpPlus && (kleur === 0 || p.kanKleurenPrinten === "Ja"))
      .sort((a, b) => a.prijs - b.prijs)
      .slice(0, 3);
    if (!lijst.length) return "";
    const ppm = Number(ppmInput.value);
    const kaarten = lijst.map((p) => {
      const winkel = [...p.aanbieders].sort((a, b) => a.prijs - b.prijs)[0];
      const url = veiligeUrl(winkel?.url);
      const t = totaal(soort, ppm, kleur, jaren * 12, p.prijs);
      return `<div class="pk-printer">
        <img src="${esc(p.afbeelding || IMG_FALLBACK)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${IMG_FALLBACK}'">
        <div class="pk-printer-tekst">
          <p class="pk-printer-naam">${esc(p.naam)}</p>
          <p class="pk-printer-prijs">${euro(p.prijs)} · ca. ${euro(t)} in ${jaren} jaar</p>
        </div>
        ${url ? `<a class="pk-printer-link" href="${esc(url)}" target="_blank" rel="sponsored noopener" data-winkel="${esc(winkel.winkel)}" data-prijs="${esc(p.prijs)}">Bekijk bij ${esc(winkel.winkel)}</a>` : ""}
      </div>`;
    }).join("");
    return `<p class="pk-sub">De goedkoopste ${MEERVOUD[soort]} in onze vergelijking</p><div class="pk-printers">${kaarten}</div>`;
  }

  function reken() {
    const ppm = Number(ppmInput.value);
    ppmUit.textContent = `${ppm} pagina's per maand`;
    const maanden = jaren * 12;
    const rijen = SOORTEN.map((s) => ({ soort: s, kosten: totaal(s, ppm, kleur, maanden, prijzen[s]) }));
    const geldig = rijen.filter((r) => r.kosten !== null).sort((a, b) => a.kosten - b.kosten);
    const beste = geldig[0];
    const max = Math.max(...geldig.map((r) => r.kosten));

    const balken = rijen.map((r) => {
      const k = KOSTEN[r.soort];
      const perPagina = `${cent(k.zw)} zwart-wit${k.kleur ? ` · ${cent(k.kleur)} kleur` : ""}`;
      if (r.kosten === null) {
        return `<div class="pk-rij is-nvt"><div class="pk-rij-kop"><span>${esc(SOORT_LABEL[r.soort])}</span><span>print geen kleur</span></div></div>`;
      }
      const breedte = Math.max(4, Math.round((r.kosten / max) * 100));
      return `<div class="pk-rij${r === beste ? " is-beste" : ""}">
        <div class="pk-rij-kop"><span>${esc(SOORT_LABEL[r.soort])}</span><strong>${euro(r.kosten)}</strong></div>
        <div class="pk-balk"><i style="width:${breedte}%"></i></div>
        <div class="pk-rij-voet">printer vanaf ${euro(prijzen[r.soort])} · daarna ${perPagina}</div>
      </div>`;
    }).join("");

    // Omslagpunt: wanneer haalt de goedkoopste soort de goedkoopste aanschaf in?
    const goedkoopsteAanschaf = geldig.reduce((a, b) => (prijzen[a.soort] <= prijzen[b.soort] ? a : b));
    let omslag = "";
    if (beste.soort !== goedkoopsteAanschaf.soort) {
      const m = omslagMaand(beste.soort, goedkoopsteAanschaf.soort, ppm, kleur, prijzen);
      if (m) omslag = `<p class="pk-uitleg">${esc(SOORT_LABEL[beste.soort])} is duurder in aanschaf, maar na ongeveer <strong>${m} ${m === 1 ? "maand" : "maanden"}</strong> goedkoper dan ${esc(LIDWOORD_LABEL[goedkoopsteAanschaf.soort])}.</p>`;
    } else if (geldig[1]) {
      const m = omslagMaand(geldig[1].soort, beste.soort, ppm, kleur, prijzen);
      omslag = m
        ? `<p class="pk-uitleg">Print je langer dan ${m} maanden zoveel, dan wordt ${esc(LIDWOORD_LABEL[geldig[1].soort])} goedkoper.</p>`
        : `<p class="pk-uitleg">Bij zo weinig printen haalt een duurdere printer de lagere aanschafprijs niet in.</p>`;
    }

    uitslag.innerHTML = `
      <p class="pk-conclusie">Voor jou is <strong>${esc(LIDWOORD_LABEL[beste.soort])}</strong> het goedkoopst: ongeveer <strong>${euro(beste.kosten)}</strong> in ${jaren} jaar, inclusief de printer.</p>
      ${omslag}
      <div class="pk-rijen">${balken}</div>
      ${voorbeelden(beste.soort)}
      <a class="pk-cta guide-cta" href="${keuzehulpLink(ppm, kleur, beste.soort)}">Kies de printer die bij je past
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></a>
      <p class="pk-cta-uitleg">Je antwoorden over hoeveel je print en in kleur staan in de keuzehulp al klaar.</p>`;

    clearTimeout(meetTimer);
    if (!gemeten) {
      meetTimer = setTimeout(() => {
        gemeten = true;
        window.phTrackEvent?.("printkosten_berekend", { paginas: ppm, kleur: Math.round(kleur * 100), jaren, goedkoopst: beste.soort });
      }, 2500);
    }
  }

  ppmInput.addEventListener("input", reken);
  root.querySelectorAll("[data-kleur]").forEach((b) => b.addEventListener("click", () => { kleur = Number(b.dataset.kleur); kies("kleur", b.dataset.kleur); reken(); }));
  root.querySelectorAll("[data-jaren]").forEach((b) => b.addEventListener("click", () => { jaren = Number(b.dataset.jaren); kies("jaren", b.dataset.jaren); reken(); }));
  root.querySelectorAll("[data-ppm]").forEach((b) => b.addEventListener("click", () => { ppmInput.value = b.dataset.ppm; reken(); }));
  reken();

  // Live instapprijzen en echte printers pas ophalen als de tool in beeld komt.
  const laad = () => fetchProducts().then((rows) => {
    printers = normalizeProducts(rows);
    for (const s of SOORTEN) {
      const p25 = kwantiel(printers.filter((p) => p.soort === s && !p.alleenFoto).map((p) => p.prijs), 0.25);
      if (p25) prijzen[s] = p25;
    }
    reken();
  }).catch(() => {});
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { io.disconnect(); laad(); } });
    io.observe(root);
  } else {
    laad();
  }
}

const root = document.getElementById("printkostenTool");
if (root) initPrintkosten(root);
