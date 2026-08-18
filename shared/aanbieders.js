// shared/aanbieders.js — generiek "Beschikbaar bij"-blok, gebruikt door alle
// keuzehulpen (result.js per categorie roept alleen buildProvidersHtml() aan).
// Normaliseert de sterk uiteenlopende ruwe levertijd-strings per aanbieder
// (Coolblue's hele zin, Expert's paar varianten, MediaMarkt's kale getal)
// naar een vast label + een sorteerbaar dagen-getal, en toont een logo i.p.v.
// tekst zodra er een logo-bestand beschikbaar is voor die winkel.
//
// Kaart toont altijd alleen de 2 goedkoopste aanbieders, zonder header/sort —
// bij meer aanbieders komt daaronder een "Vergelijk X prijzen"-link die een
// modal opent met de volledige, sorteerbare lijst. Zelfde gedrag op mobiel
// en desktop (geen aparte popover-/inline-uitklap-varianten meer — dat bleek
// rommelig bij veel aanbieders en had positionerings-edge-cases).

export const AANBIEDER_LOGOS = {
  "Coolblue":   "shared/images/aanbieder-logos/coolblue.png",
  "MediaMarkt": "shared/images/aanbieder-logos/mediamarkt.png",
  "Expert":     "shared/images/aanbieder-logos/expert.png",
  // Heet sinds de 2023-rebranding officieel gewoon "bol" (niet meer "bol.com")
  // — zie ook de weergavenaam in AANBIEDERS["bol"] in de pipeline-config.
  "bol":        "shared/images/aanbieder-logos/bol.svg",
  // Sleutel moet exact matchen met AANBIEDERS["ep"]["weergavenaam"] in de
  // pipeline-config ("EP.").
  "EP.":        "shared/images/aanbieder-logos/ep.svg",
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

  // ep.nl's format: "Vandaag besteld, woensdag in huis" — de volledige zin
  // is te lang voor de kaart (dwingt 'm naar 2 regels), dus alleen het
  // weekdag-deel overhouden. Dagen-afstand is een schatting (geen rekening
  // met besteltijd-cutoffs) maar goed genoeg om te sorteren/"snelst" te tonen.
  const weekdagen = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
  const weekdagMatch = weekdagen.find((d) => lower.includes(d));
  if (weekdagMatch && lower.includes("in huis")) {
    const vandaag = new Date().getDay();
    const doelIndex = weekdagen.indexOf(weekdagMatch);
    const verschil = ((doelIndex - vandaag + 7) % 7) || 7;
    return {
      label: `${weekdagMatch.charAt(0).toUpperCase()}${weekdagMatch.slice(1)} in huis`,
      dagen: verschil,
    };
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

// id → ruwe aanbieders-array, zodat de modal (event delegation, zie
// initProvidersInteractions) een blok kan openen zonder de data opnieuw uit
// de kaart te hoeven lezen.
const registry = new Map();
let seq = 0;

/** Aanroepen vóór elke volledige her-render van de resultatengrid (filter-/
 * sorteerwijziging), zodat de registry niet onbeperkt aangroeit. */
export function resetProvidersRegistry() {
  registry.clear();
  seq = 0;
  closeModal();
}

// Zelfde opmaak als formatPriceLabel() in elke categorie's eigen utils.js:
// altijd hele euro's, nooit centen (ook niet bij bijv. 299,99).
function formatPriceLabel(prijs) {
  const numeriek = Number.isFinite(prijs) ? prijs : 0;
  return Math.trunc(numeriek).toLocaleString("nl-NL");
}

function sorteerAanbieders(aanbieders, sortKey) {
  return [...aanbieders].sort((a, b) => {
    if (sortKey === "levertijd") return normaliseLevertijd(a.levertijd).dagen - normaliseLevertijd(b.levertijd).dagen;
    return Number(a.prijs ?? Infinity) - Number(b.prijs ?? Infinity);
  });
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

/** De altijd-zichtbare kaart-inhoud: top 2 (op prijs) + evt. compare-trigger. */
function renderCardBlock(aanbieders) {
  const sorted = sorteerAanbieders(aanbieders, "prijs");
  const fastest = Math.min(...sorted.map((p) => normaliseLevertijd(p.levertijd).dagen));
  const visible = sorted.slice(0, MAX_ZICHTBAAR);
  const rest = sorted.length - visible.length;

  return `
    <div class="tv-providers-list">${visible.map((p) => rowHtml(p, fastest)).join("")}</div>
    ${rest > 0 ? `
      <button type="button" class="tv-providers-compare-trigger">
        <span>Vergelijk ${sorted.length} prijzen</span>
        <i data-lucide="chevron-right" class="tv-providers-compare-icon" aria-hidden="true"></i>
      </button>
    ` : ""}
  `;
}

/** Bouwt het volledige "Beschikbaar bij"-blok voor één product. */
export function buildProvidersHtml(aanbieders) {
  const list = Array.isArray(aanbieders) ? aanbieders : [];
  if (list.length === 0) return "";

  const id = `tv-providers-${seq++}`;
  registry.set(id, list);
  return `<div class="tv-card-providers" id="${id}">${renderCardBlock(list)}</div>`;
}

// ─── Modal: "Vergelijk X prijzen" ─────────────────────────────────────────
// Eén gedeelde modal voor de hele pagina (niet één per kaart) — als los
// element aan <body> gehangen, los van .tv-card's overflow: hidden.

let modalBackdrop = null;
let modalData = null;
let modalSort = "prijs";

function renderModalList() {
  const sorted = sorteerAanbieders(modalData, modalSort);
  const fastest = Math.min(...sorted.map((p) => normaliseLevertijd(p.levertijd).dagen));
  return sorted.map((p) => rowHtml(p, fastest)).join("");
}

function renderModalMarkup() {
  return `
    <div class="tv-providers-modal" role="dialog" aria-modal="true" aria-label="Vergelijk winkels">
      <div class="tv-providers-modal-header">
        <p class="tv-providers-header">Beschikbaar bij</p>
        <button type="button" class="tv-providers-modal-close" aria-label="Sluiten">
          <i data-lucide="x" aria-hidden="true"></i>
        </button>
      </div>
      <div class="tv-providers-sort">
        <span>Sorteer:</span>
        <button type="button" class="tv-providers-sort-btn${modalSort === "prijs" ? " is-active" : ""}" data-sort="prijs">Prijs</button>
        <span>·</span>
        <button type="button" class="tv-providers-sort-btn${modalSort === "levertijd" ? " is-active" : ""}" data-sort="levertijd">Levertijd</button>
      </div>
      <div class="tv-providers-modal-list">${renderModalList()}</div>
    </div>
  `;
}

function closeModal() {
  if (!modalBackdrop) return;
  modalBackdrop.classList.remove("is-open");
  const el = modalBackdrop;
  modalBackdrop = null;
  modalData = null;
  window.setTimeout(() => el.remove(), 200);
  document.body.classList.remove("tv-modal-open");
}

function openModal(aanbieders) {
  closeModal();
  modalData = aanbieders;
  modalSort = "prijs";

  const backdrop = document.createElement("div");
  backdrop.className = "tv-providers-modal-backdrop";
  backdrop.innerHTML = renderModalMarkup();
  document.body.appendChild(backdrop);
  document.body.classList.add("tv-modal-open");

  requestAnimationFrame(() => backdrop.classList.add("is-open"));
  modalBackdrop = backdrop;

  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

function rerenderModal() {
  if (!modalBackdrop) return;
  const dialog = modalBackdrop.querySelector(".tv-providers-modal");
  if (!dialog) return;
  dialog.outerHTML = renderModalMarkup();
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

let interactionsBound = false;

/** Eenmalige, gedelegeerde click-handler voor de compare-trigger/modal —
 * werkt voor elk "Beschikbaar bij"-blok op de pagina, ongeacht hoeveel er
 * zijn. */
export function initProvidersInteractions() {
  if (interactionsBound) return;
  interactionsBound = true;

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest(".tv-providers-compare-trigger");
    if (trigger) {
      event.preventDefault();
      const container = trigger.closest(".tv-card-providers");
      const data = container && registry.get(container.id);
      if (data) openModal(data);
      return;
    }

    if (!modalBackdrop) return;

    const sortBtn = event.target.closest(".tv-providers-sort-btn");
    if (sortBtn) {
      modalSort = sortBtn.dataset.sort;
      rerenderModal();
      return;
    }

    const closeBtn = event.target.closest(".tv-providers-modal-close");
    const clickedInsideDialog = event.target.closest(".tv-providers-modal");
    if (closeBtn || !clickedInsideDialog) {
      closeModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modalBackdrop) closeModal();
  });
}

if (typeof document !== "undefined") initProvidersInteractions();
