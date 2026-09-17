// shared/resultaat-kaart.js — één gedeeld kaartsjabloon voor alle
// resultaatpagina's. Elke categorie levert alleen zijn eigen specs (korte
// strings uit buildSpecList) en USP-punten (buildResultPoints); de opmaak,
// de prijsregel en het winkelblok zijn hier voor iedereen gelijk.
//
// Kaart in twee zones: links afbeelding + spec-chips, rechts naam,
// "Waarom dit bij jou past", prijs met één knop naar de goedkoopste winkel
// en daaronder de overige winkels als compacte pills. Alle winkels blijven
// direct klikbaar — dat is het verdienmodel, dus nooit achter een klik.

import { AANBIEDER_LOGOS, normaliseLevertijd, normaliseVerzendkosten, registerProviders } from "./aanbieders.js";

const ICONS = {
  scherm:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/></svg>',
  paneel:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
  ram:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/></svg>',
  opslag:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="12" x2="2" y2="12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>',
  hz:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  gewicht: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="3"/><path d="M6.5 8h11l2.5 13H4z"/></svg>',
  geluid:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>',
  energie: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v6"/><circle cx="12" cy="14" r="8"/></svg>',
  maat:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 6H3"/><path d="M21 12H3"/><path d="M21 18H3"/></svg>',
  tag:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
};

const CHECK = '<svg class="rcard-why-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>';
const TRUCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>';

const MAX_PUNTEN = 3;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatPriceLabel(prijs) {
  const numeriek = Number.isFinite(prijs) ? prijs : 0;
  return Math.trunc(numeriek).toLocaleString("nl-NL");
}

function parsePrijs(value) {
  const n = parseFloat(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : Infinity;
}

/** Kiest een icoon op basis van wat de spec-tekst zegt; onbekend → label. */
function iconFor(spec) {
  const s = spec.toLowerCase();
  if (/\bhz\b/.test(s)) return ICONS.hz;
  if (/\bram\b|werkgeheugen/.test(s)) return ICONS.ram;
  if (/\bssd\b|\bhdd\b|opslag|\btb\b/.test(s)) return ICONS.opslag;
  if (/\bdb\b/.test(s)) return ICONS.geluid;
  if (/energielabel|energieklasse|\bklasse [a-g]\b|^[a-g]$/.test(s)) return ICONS.energie;
  if (/\bkg\b|\bgram\b|\bg\b/.test(s)) return ICONS.gewicht;
  if (/oled|qled|mini led|\bled\b|\bips\b|\bva\b|\btn\b|nano|paneel/.test(s)) return ICONS.paneel;
  if (/["″]|inch|scherm|diagonaal/.test(s)) return ICONS.scherm;
  if (/\bcm\b|\bmm\b|\bliter\b|\bl\b|couverts|breedte|hoogte|diepte/.test(s)) return ICONS.maat;
  return ICONS.tag;
}

function chipsHtml(specs) {
  const lijst = (Array.isArray(specs) ? specs : []).filter(Boolean).slice(0, 5);
  if (lijst.length === 0) return "";
  return `<div class="rcard-chips">${lijst.map((s) => `<span class="rcard-chip">${iconFor(s)}${escapeHtml(s)}</span>`).join("")}</div>`;
}

function storeHtml(winkel) {
  const src = AANBIEDER_LOGOS[winkel];
  if (src) return `<img class="rcard-shop-logo" src="${src}" alt="${escapeHtml(winkel)}" loading="lazy">`;
  return `<span class="rcard-shop-name">${escapeHtml(winkel)}</span>`;
}

/** Verzendkosten-label, maar alleen als de feed er echt iets over zegt:
 * een lege waarde is "onbekend", geen gratis verzending. */
function verzendLabelIndienBekend(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === "") return null;
  return normaliseVerzendkosten(raw).label;
}

/** Bezorgregel voor de winkel waar de knop naartoe gaat. */
function deliveryHtml(a) {
  const { label: levertijd } = normaliseLevertijd(a.levertijd);
  const verzending = verzendLabelIndienBekend(a.verzendkosten);
  const delen = [levertijd, verzending].filter(Boolean);
  if (delen.length === 0) return "";
  return `<p class="rcard-delivery">${TRUCK}<span>Bij ${escapeHtml(a.winkel)}: ${delen.map(escapeHtml).join(" · ")}</span></p>`;
}

function shopsHtml(aanbieders) {
  const lijst = (Array.isArray(aanbieders) ? aanbieders : [])
    .filter((a) => a && a.url)
    .sort((a, b) => parsePrijs(a.prijs) - parsePrijs(b.prijs));
  if (lijst.length === 0) return { cta: "", delivery: "", rest: "" };

  const [goedkoopste, ...overige] = lijst;
  const cta = `<a class="rcard-cta" href="${escapeHtml(goedkoopste.url)}" target="_blank" rel="noopener noreferrer">Bekijk bij ${escapeHtml(goedkoopste.winkel)} ${ARROW}</a>`;
  const delivery = deliveryHtml(goedkoopste);

  const pills = overige.map((a) => {
    const { label: levertijd, dagen } = normaliseLevertijd(a.levertijd);
    const { label: verzending } = normaliseVerzendkosten(a.verzendkosten);
    const snel = dagen <= 1 ? `<span class="rcard-shop-fast" aria-hidden="true">${TRUCK}</span>` : "";
    const titel = [levertijd, verzending].filter(Boolean).join(" · ");
    return `<a class="rcard-shop" href="${escapeHtml(a.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(titel)}" aria-label="${escapeHtml(a.winkel)}: €${formatPriceLabel(parsePrijs(a.prijs))}${titel ? ", " + escapeHtml(titel) : ""}">${storeHtml(a.winkel)}<span class="rcard-shop-price">€&nbsp;${formatPriceLabel(parsePrijs(a.prijs))}</span>${snel}</a>`;
  }).join("");

  // Vergelijk-link opent het gedeelde venster uit aanbieders.js (prijs,
  // levertijd, bezorgkosten per winkel) — tooltips werken niet op mobiel.
  const compare = overige.length
    ? `<button type="button" class="rcard-compare" data-providers-id="${registerProviders(lijst)}">Alle ${lijst.length} winkels vergelijken</button>`
    : "";
  const rest = overige.length ? `<div class="rcard-shops"><span class="rcard-shops-label">Ook bij</span>${pills}${compare}</div>` : "";
  return { cta, delivery, rest };
}

/**
 * Bouwt de HTML van één resultaatkaart.
 * @param {object} o
 * @param {object} o.product     genormaliseerd product (naam, prijs, afbeelding, afbeeldingen, aanbieders)
 * @param {number} o.index       positie in de lijst (voor lazy-loading van afbeeldingen)
 * @param {boolean} o.isCheapest goedkoopste van de lijst → badge
 * @param {string[]} o.specs     korte spec-strings (uit de categorie-eigen buildSpecList)
 * @param {string[]} o.points    USP-regels (uit de categorie-eigen buildResultPoints); de eerste 3 worden getoond
 */
export function buildCardHtml({ product, index = 0, isCheapest = false, specs = [], points = [] }) {
  const naam = escapeHtml(product.naam);
  const afbeelding = product.afbeelding || "";
  const galerij = JSON.stringify(product.afbeeldingen || []).replace(/"/g, "&quot;");
  const laagste = Math.min(...(product.aanbieders || []).map((a) => parsePrijs(a.prijs)), parsePrijs(product.prijs));
  const { cta, delivery, rest } = shopsHtml(product.aanbieders);
  const punten = (Array.isArray(points) ? points : []).filter(Boolean).slice(0, MAX_PUNTEN);

  return `
    <article class="rcard" data-match-index="${index}">
      <div class="rcard-left">
        <div class="rcard-img" aria-hidden="true">
          <img src="${escapeHtml(afbeelding)}" alt="" role="presentation" ${index < 4 ? 'fetchpriority="high" loading="eager"' : 'loading="lazy"'} onerror="this.onerror=null;this.src=window.IMG_FALLBACK;">
          <button class="tv-preview-btn" type="button" aria-label="Afbeelding vergroten" data-preview-src="${escapeHtml(afbeelding)}" data-preview-name="${naam}" data-preview-imgs="${galerij}">
            <i data-lucide="eye"></i>
          </button>
        </div>
        ${chipsHtml(specs)}
      </div>
      <div class="rcard-body">
        ${isCheapest ? '<div class="rcard-badges"><span class="rcard-badge-cheap">Goedkoopste keuze</span></div>' : ""}
        <h3 class="rcard-name">${naam}</h3>
        ${punten.length ? `
          <p class="rcard-why-title">Waarom dit bij jou past</p>
          <ul class="rcard-why">${punten.map((p) => `<li>${CHECK}<span>${p}</span></li>`).join("")}</ul>` : ""}
        <div class="rcard-price-row">
          <div class="rcard-price"><span class="rcard-price-label">Vanaf</span> €&nbsp;${formatPriceLabel(laagste)}</div>
          ${cta}
        </div>
        ${delivery}
        ${rest}
      </div>
    </article>
  `;
}
