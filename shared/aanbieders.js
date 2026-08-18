// shared/aanbieders.js — generiek "Beschikbaar bij"-blok, gebruikt door alle
// keuzehulpen (result.js per categorie roept alleen buildProvidersHtml() aan).
// Normaliseert de sterk uiteenlopende ruwe levertijd-strings per aanbieder
// (Coolblue's hele zin, Expert's paar varianten, MediaMarkt's kale getal)
// naar een vast label + een sorteerbaar dagen-getal, en toont een logo i.p.v.
// tekst zodra er een logo-bestand beschikbaar is voor die winkel.

export const AANBIEDER_LOGOS = {
  "Coolblue":   "shared/images/aanbieder-logos/coolblue.png",
  "MediaMarkt": "shared/images/aanbieder-logos/mediamarkt.png",
  "Expert":     "shared/images/aanbieder-logos/expert.png",
  // Heet sinds de 2023-rebranding officieel gewoon "bol" (niet meer "bol.com")
  // — zie ook de weergavenaam in AANBIEDERS["bol"] in de pipeline-config.
  "bol":        "shared/images/aanbieder-logos/bol.svg",
};

const MAX_ZICHTBAAR = 2;

/**
 * Zet een ruwe levertijd-string van een willekeurige aanbieder om naar een
 * kort, consistent label + een dagen-getal (voor sorteren en om de snelste
 * optie te markeren). Onbekende/nieuwe formats vallen terug op de ruwe tekst
 * (zichtbaar, maar onderaan gesorteerd) i.p.v. te crashen of te verdwijnen.
 */
export function normaliseLevertijd(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return { label: null, dagen: 99 };

  // Kaal getal (bijv. MediaMarkt's "1" = dagen)
  if (/^\d+$/.test(value)) {
    const dagen = parseInt(value, 10);
    return dagen <= 1
      ? { label: "Morgen in huis", dagen: 1 }
      : { label: `${dagen} werkdagen`, dagen };
  }

  const lower = value.toLowerCase();
  if (lower.includes("morgen") || lower.includes("volgende werkdag")) {
    return { label: "Morgen in huis", dagen: 1 };
  }

  const range = lower.match(/(\d+)\s*-\s*(\d+)\s*werkdag/);
  if (range) {
    return { label: `${range[1]}-${range[2]} werkdagen`, dagen: parseInt(range[2], 10) };
  }

  const single = lower.match(/(\d+)\s*werkdag/);
  if (single) {
    const dagen = parseInt(single[1], 10);
    return dagen <= 1 ? { label: "Morgen in huis", dagen: 1 } : { label: `${dagen} werkdagen`, dagen };
  }

  return { label: value, dagen: 99 };
}

export function normaliseVerzendkosten(verzendkosten) {
  const val = parseFloat(String(verzendkosten ?? "").replace(",", "."));
  if (!Number.isFinite(val) || val <= 0) return { label: "Gratis verzending", gratis: true };
  return {
    label: `+ €${val.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} verzending`,
    gratis: false,
  };
}

function storeLabelHtml(winkel) {
  const src = AANBIEDER_LOGOS[winkel];
  // Logo groter i.p.v. logo+naam ernaast: dat laatste voelde dubbel-druk.
  // Op een groter logo (24px) is ook Coolblue's ronde merk nog herkenbaar.
  // Alleen winkels zonder logo-bestand vallen terug op tekst.
  if (src) return `<img class="tv-provider-logo" src="${src}" alt="${winkel}" loading="lazy" />`;
  return `<span class="tv-provider-name">${winkel}</span>`;
}

// id → ruwe aanbieders-array, zodat de sort/expand-knoppen (event delegation,
// zie initProvidersInteractions) een blok kunnen her-renderen zonder de data
// opnieuw uit de kaart te hoeven lezen.
const registry = new Map();
let seq = 0;

/** Aanroepen vóór elke volledige her-render van de resultatengrid (filter-/
 * sorteerwijziging), zodat de registry niet onbeperkt aangroeit. */
export function resetProvidersRegistry() {
  registry.clear();
  seq = 0;
}

// Zelfde opmaak als formatPriceLabel() in elke categorie's eigen utils.js:
// altijd hele euro's, nooit centen (ook niet bij bijv. 299,99).
function formatPriceLabel(prijs) {
  const numeriek = Number.isFinite(prijs) ? prijs : 0;
  return Math.trunc(numeriek).toLocaleString("nl-NL");
}

function rowHtml(p, fastest) {
  const { label: levertijdLabel, dagen } = normaliseLevertijd(p.levertijd);
  const { label: verzendLabel, gratis } = normaliseVerzendkosten(p.verzendkosten);
  const priceLabel = formatPriceLabel(p.prijs);
  const isFastest = dagen === fastest && dagen < 99;

  return `
    <a href="${p.url}" class="tv-provider-row" target="_blank" rel="noopener noreferrer" aria-label="${p.winkel}: €${priceLabel}">
      <div class="tv-provider-left">
        <div class="tv-provider-name-line">
          ${storeLabelHtml(p.winkel)}
          ${isFastest ? '<span class="tv-provider-fast-chip">Snelst</span>' : ""}
        </div>
        <div class="tv-provider-badges">
          ${levertijdLabel ? `<span class="tv-provider-badge"><i data-lucide="truck" class="tv-provider-badge-icon" aria-hidden="true"></i>${levertijdLabel}</span>` : ""}
          <span class="tv-provider-badge${gratis ? " is-free" : ""}"><i data-lucide="euro" class="tv-provider-badge-icon" aria-hidden="true"></i>${verzendLabel}</span>
        </div>
      </div>
      <div class="tv-provider-right">
        <span class="tv-provider-price">€&nbsp;${priceLabel}</span>
        <span class="tv-provider-arrow" aria-hidden="true">
          <i data-lucide="chevron-right"></i>
        </span>
      </div>
    </a>
  `;
}

function renderBlock(aanbieders, sortKey, expanded) {
  const sorted = [...aanbieders].sort((a, b) => {
    if (sortKey === "levertijd") return normaliseLevertijd(a.levertijd).dagen - normaliseLevertijd(b.levertijd).dagen;
    return Number(a.prijs ?? Infinity) - Number(b.prijs ?? Infinity);
  });
  const fastest = Math.min(...sorted.map(p => normaliseLevertijd(p.levertijd).dagen));
  const visible = sorted.slice(0, MAX_ZICHTBAAR);
  const rest = sorted.slice(MAX_ZICHTBAAR);

  return `
    <div class="tv-providers-head">
      <p class="tv-providers-header">Beschikbaar bij</p>
      ${aanbieders.length > 1 ? `
        <div class="tv-providers-sort">
          <span>Sorteer:</span>
          <button type="button" class="tv-providers-sort-btn${sortKey === "prijs" ? " is-active" : ""}" data-sort="prijs">Prijs</button>
          <span>·</span>
          <button type="button" class="tv-providers-sort-btn${sortKey === "levertijd" ? " is-active" : ""}" data-sort="levertijd">Levertijd</button>
        </div>
      ` : ""}
    </div>
    <div class="tv-providers-list">${visible.map(p => rowHtml(p, fastest)).join("")}</div>
    ${rest.length > 0 ? `
      <button type="button" class="tv-providers-expand${expanded ? " is-open" : ""}">
        <span>${expanded ? "Toon minder" : `Toon nog ${rest.length} aanbieder${rest.length > 1 ? "s" : ""}`}</span>
        <i data-lucide="chevron-down" class="tv-providers-expand-icon" aria-hidden="true"></i>
      </button>
      <div class="tv-providers-extra${expanded ? " is-open" : ""}">${rest.map(p => rowHtml(p, fastest)).join("")}</div>
    ` : ""}
  `;
}

/** Bouwt het volledige "Beschikbaar bij"-blok voor één product. */
export function buildProvidersHtml(aanbieders) {
  const list = Array.isArray(aanbieders) ? aanbieders : [];
  if (list.length === 0) return "";

  const id = `tv-providers-${seq++}`;
  registry.set(id, list);
  return `<div class="tv-card-providers" id="${id}" data-sort="prijs" data-expanded="0">${renderBlock(list, "prijs", false)}</div>`;
}

let interactionsBound = false;

// Zelfde 1100px-omslagpunt als waarop elke categorie's .tv-card van een
// horizontale flex-rij naar een gestapelde grid overschakelt (zie elke
// resultaat/index.html). Boven dat punt: popover (deze module). Eronder:
// het bestaande inline-uitklap-gedrag (kaart wordt gewoon iets hoger, geen
// stretch-probleem omdat de aanbieders-kolom daar al een eigen grid-rij is).
const DESKTOP_QUERY = "(min-width: 1101px)";

// De popover wordt als los element aan <body> gehangen (niet als kind van de
// kaart) en met getBoundingClientRect() gepositioneerd — zo hoeft .tv-card's
// eigen overflow: hidden (voor de afgeronde hoeken/cheapest-badge) niet
// aangepast te worden, en kan de popover nooit binnen de kaart afgeknipt
// worden.
let activeFlyout = null;
let activeFlyoutBtn = null;

function closeFlyout() {
  if (activeFlyout) {
    activeFlyout.remove();
    activeFlyout = null;
  }
  if (activeFlyoutBtn) {
    activeFlyoutBtn.setAttribute("aria-expanded", "false");
    activeFlyoutBtn.classList.remove("is-open");
    const label = activeFlyoutBtn.querySelector("span");
    if (label && activeFlyoutBtn.dataset.closedLabel) label.textContent = activeFlyoutBtn.dataset.closedLabel;
    activeFlyoutBtn = null;
  }
}

function openFlyout(button) {
  if (activeFlyoutBtn === button) {
    closeFlyout();
    return;
  }
  closeFlyout();

  const container = button.closest(".tv-card-providers");
  const extra = container?.querySelector(".tv-providers-extra");
  if (!extra) return;

  const flyout = document.createElement("div");
  flyout.className = "tv-provider-flyout";
  flyout.innerHTML = extra.innerHTML;
  document.body.appendChild(flyout);

  const btnRect = button.getBoundingClientRect();
  const flyoutRect = flyout.getBoundingClientRect();

  let left = btnRect.right - flyoutRect.width;
  left = Math.max(8, Math.min(left, window.innerWidth - flyoutRect.width - 8));

  let top = btnRect.bottom + 8;
  const passtOnder = top + flyoutRect.height <= window.innerHeight - 8;
  const passtBoven = btnRect.top - flyoutRect.height - 8 >= 8;
  if (!passtOnder && passtBoven) top = btnRect.top - flyoutRect.height - 8;

  flyout.style.left = `${left + window.scrollX}px`;
  flyout.style.top = `${top + window.scrollY}px`;

  requestAnimationFrame(() => flyout.classList.add("is-open"));

  button.setAttribute("aria-expanded", "true");
  button.classList.add("is-open");
  const label = button.querySelector("span");
  if (label) {
    button.dataset.closedLabel = label.textContent;
    label.textContent = "Toon minder";
  }
  activeFlyout = flyout;
  activeFlyoutBtn = button;

  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

/** Eenmalige, gedelegeerde click-handler voor sorteren/uitklappen — werkt
 * voor elk "Beschikbaar bij"-blok op de pagina, ongeacht hoeveel er zijn. */
export function initProvidersInteractions() {
  if (interactionsBound) return;
  interactionsBound = true;

  document.addEventListener("click", (event) => {
    const sortBtn = event.target.closest(".tv-providers-sort-btn");
    const expandBtn = event.target.closest(".tv-providers-expand");

    if (expandBtn && window.matchMedia(DESKTOP_QUERY).matches) {
      event.preventDefault();
      openFlyout(expandBtn);
      return;
    }

    if (!sortBtn && !expandBtn) {
      if (activeFlyout && !event.target.closest(".tv-provider-flyout")) closeFlyout();
      return;
    }

    const container = (sortBtn || expandBtn).closest(".tv-card-providers");
    if (!container) return;
    const data = registry.get(container.id);
    if (!data) return;

    event.preventDefault();
    closeFlyout(); // dit blok gaat zo opnieuw renderen — een open popover zou nu stale data tonen

    if (sortBtn) container.dataset.sort = sortBtn.dataset.sort;
    if (expandBtn) container.dataset.expanded = container.dataset.expanded === "1" ? "0" : "1";

    container.innerHTML = renderBlock(data, container.dataset.sort, container.dataset.expanded === "1");

    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }
  });

  window.addEventListener("resize", closeFlyout, { passive: true });
  window.addEventListener("scroll", closeFlyout, { passive: true, capture: true });
}

if (typeof document !== "undefined") initProvidersInteractions();
