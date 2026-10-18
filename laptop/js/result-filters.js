import { priceGroupsBySize, getProcessorTier, sizeGroupToAllowedSizes, TIER_ORDER } from "./data.js";
import { matchLaptops, kiesBesteMatch, heeftExtra, heeftDedicatedGpu, applyMinAanbiedersCascade, BAND_BESTE, DEFAULT_MIN_AANBIEDERS } from "./matching.js";
import { computeDynamicPriceGroups, getStoredSelection, normalizeProducts, parsePrice, qs } from "./utils.js";
import { updateResultMatches } from "./result.js";
import { fetchProducts } from "./supabase.js";
import { computeCounts, renderFilterList } from "../../shared/filters.js";


// ─── Tellen zoals bij grote webwinkels ───────────────────────────────────────
// Binnen één filter is het "of", tussen filters "en". Het aantal naast een
// optie is wat je krijgt als je hem aanklikt, gegeven alle ANDERE gekozen
// filters: de eigen selectie van die kaart telt even niet mee. Een optie met 0
// wordt grijs (shared/filters.js), zodat je nooit op "geen resultaten" uitkomt.
// Kaarten waar meerdere keuzes "en" betekenen (alle gekozen functies tegelijk)
// tellen per optie wat er overblijft als je hem erbij aanvinkt.
const EN_FILTERS = new Set(["functies", "programmas", "varianten"]);

const genoegWinkels = p => (p.aanbieders ?? []).length >= filterState.minAanbieders;

/** Producten door alle filters, behalve de selectie in `set` (en het winkelaantal). */
function zonderSelectie(set) {
  if (!set || set.size === 0) return filterKeten().filter(genoegWinkels);
  const bewaard = [...set];
  set.clear();
  const uit = filterKeten().filter(genoegWinkels);
  bewaard.forEach(v => set.add(v));
  return uit;
}

function telOpties(filterName, items, productValueFn) {
  const set = filterState[filterName];
  if (!EN_FILTERS.has(filterName) || !set) return computeCounts(zonderSelectie(set), productValueFn);
  return new Map(items.map(v => {
    const had = set.has(v);
    set.add(v);
    const n = filterKeten().filter(genoegWinkels).length;
    if (!had) set.delete(v);
    return [v, n];
  }));
}

const MIN_AANBIEDERS_OPTIONS = [1, 2, 3, 4, 5];

const filterState = {
  priceLabels:  new Set(),
  minAanbieders: DEFAULT_MIN_AANBIEDERS,
  sizes:        new Set(),
  brands:       new Set(),
  tiers:        new Set(),
  panelTypes:   new Set(),
  ramOptions:   new Set(),
  resolutions:  new Set(),
  touchscreens: new Set(),
  functies:     new Set(),
  kleuren:      new Set(),
  osOptions:    new Set(),
  aanbieder:    new Set(),
  baseMatches:  [],
  answers:      null,
  scores:       null,
  bestType:     "",
  sizeGroup:    ""
};

// Price buckets are recomputed fresh from the live-fetched catalog on every
// results page load (not trusted from the quiz-time localStorage snapshot),
// since a stale/short-lived fetch during the quiz can produce fewer or
// narrower buckets than the catalog actually supports (e.g. missing the
// most expensive bucket entirely).
function getDynamicPriceGroups(sizeGroup) {
  if (Array.isArray(filterState.priceGroups) && filterState.priceGroups.length > 0) {
    return filterState.priceGroups;
  }
  return priceGroupsBySize[sizeGroup] || [];
}

// Price is just another optional narrowing filter, not a hard upfront wall:
// with no bucket selected, every laptop matching the quiz answers is shown.
function getBaseMatches() {
  return filterState.baseMatches;
}

function getPriceScopedMatches() {
  const base = getBaseMatches();
  if (filterState.priceLabels.size === 0) return base;
  const groups = getDynamicPriceGroups(filterState.sizeGroup).filter(g => filterState.priceLabels.has(g.label));
  return base.filter(l => {
    const price = parsePrice(l.prijs);
    return groups.some(g => price >= g.min && (price < g.max || g.max === Number.POSITIVE_INFINITY));
  });
}

// Welke opties een filterkaart toont: alles uit de quizuitslag (alleen de
// winkelregel telt mee), NIET beperkt door de andere gekozen filters. Zo
// blijft een optie die door bv. een prijskeuze op 0 komt grijs in beeld
// staan in plaats van te verdwijnen. Het aantal erachter telt wel met alle
// andere filters (zie zonderSelectie/telOpties).
function getSecondaryScopedMatches() {
  return getBaseScopedByMinAanbieders();
}

function getBaseScopedByMinAanbieders() {
  return getBaseMatches().filter(l => (l.aanbieders ?? []).length >= filterState.minAanbieders);
}

function formatBrandLabel(brand) {
  const raw = String(brand ?? "").trim();
  if (!raw) return "";
  if (raw === raw.toUpperCase()) return raw;
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function collectSizeOptions(matches) {
  const set = new Set();
  matches.forEach(l => { if (l.schermdiagonaal) set.add(l.schermdiagonaal); });
  return Array.from(set).sort((a, b) => a - b);
}

function collectBrandOptions(matches) {
  const set = new Set();
  matches.forEach(l => { const label = formatBrandLabel(l.merk); if (label) set.add(label); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "nl"));
}

function collectTierOptions(matches) {
  const order = ["Budget", "Mid", "Krachtig", "Topklasse"];
  const set = new Set();
  matches.forEach(l => set.add(getProcessorTier(l.processor, l.processor_familie)));
  return order.filter(t => set.has(t));
}

function collectPanelTypeOptions(matches) {
  const set = new Set();
  matches.forEach(l => { if (l.paneeltype) set.add(l.paneeltype); });
  const order = ["IPS", "OLED", "VA", "TN"];
  return order.filter(t => set.has(t));
}

function collectRamOptions(matches) {
  const set = new Set();
  matches.forEach(l => { if (l.werkgeheugen) set.add(l.werkgeheugen); });
  return Array.from(set).sort((a, b) => a - b);
}

function collectResolutionOptions(matches) {
  const set = new Set();
  matches.forEach(l => { if (l.resolutie) set.add(l.resolutie); });
  const order = ["HD", "Full HD", "QHD", "QHD+", "4K"];
  return order.filter(t => set.has(t));
}

function collectTouchscreenOptions(matches) {
  const set = new Set();
  matches.forEach(l => { if (l.touchscreen) set.add(l.touchscreen); });
  const order = ["Ja", "Nee"];
  return order.filter(t => set.has(t));
}

// Functies: wat laptops echt van elkaar onderscheidt. USB-C (99%) en wifi
// heeft bijna elke laptop, die staan er niet (meer) bij.
const FUNCTIES = [
  { key: "accu",         label: "Lange accuduur",       heeft: l => heeftExtra(l, "accu") === true },
  { key: "videokaart",   label: "Losse videokaart",     heeft: l => heeftDedicatedGpu(l.gpu) },
  { key: "numpad",       label: "Numeriek toetsenblok", heeft: l => heeftExtra(l, "numpad") === true },
  { key: "vingerafdruk", label: "Vingerafdruklezer",    heeft: l => heeftExtra(l, "vingerafdruk") === true },
  { key: "hz",           label: "120 Hz of meer",       heeft: l => l.hz >= 120 },
];
const functiesVan = l => FUNCTIES.filter(f => f.heeft(l)).map(f => f.key);

function collectFunctieOptions(matches) {
  return FUNCTIES.filter(f => matches.some(f.heeft)).map(f => f.key);
}

// Normaliseert combinaties als "Zwart, Grijs" en "Grijs, Zwart" naar dezelfde
// canonieke waarde, zodat ze niet als 2 losse filteropties verschijnen.
function normalizeKleur(kleur) {
  const raw = String(kleur ?? "").trim();
  if (!raw) return "";
  return raw.split(",").map(s => s.trim()).filter(Boolean).sort().join(", ");
}

function collectKleurOptions(matches) {
  const set = new Set();
  matches.forEach(l => { const k = normalizeKleur(l.kleur); if (k) set.add(k); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "nl"));
}

function collectOsOptions(matches) {
  const set = new Set();
  matches.forEach(l => { if (l.os) set.add(l.os); });
  const order = ["Windows", "macOS", "Chrome OS"];
  const inOrder = order.filter(t => set.has(t));
  set.forEach(t => { if (!order.includes(t)) inOrder.push(t); });
  return inOrder;
}

function collectAanbiederOptions(matches) {
  const set = new Set();
  matches.forEach(l => {
    (l.aanbieders ?? []).forEach(a => set.add(a.winkel));
  });
  return Array.from(set).sort();
}

function renderCheckboxFilter(container, card, items, matches, productValueFn, filterName, allLabelText, labelFn) {
  if (items.length === 0) { container.innerHTML = ""; card.hidden = true; return; }
  const stateSet = filterState[filterName];
  const counts = telOpties(filterName, items, productValueFn);
  renderFilterList(container, card, {
    items,
    counts,
    filterName: `${filterName}Filter`,
    stateSet,
    labelFn,
    allLabel: allLabelText,
  });
}

function renderPriceOptions(container, priceCard, sizeGroup) {
  const groups = getDynamicPriceGroups(sizeGroup);

  // Only show price buckets that actually contain a matching laptop for the
  // current quiz answers — otherwise users click a bucket that can never
  // show a result. If there's only one (or zero) non-empty bucket there's
  // nothing meaningful to narrow, so hide the whole filter card.
  const base = getBaseScopedByMinAanbieders();
  const groupForPrice = price => groups.find(g => price >= g.min && (price < g.max || g.max === Number.POSITIVE_INFINITY));
  const counts = computeCounts(zonderSelectie(filterState.priceLabels), l => groupForPrice(parsePrice(l.prijs))?.label);
  const opBasis = computeCounts(base, l => groupForPrice(parsePrice(l.prijs))?.label);
  const labels = groups.filter(g => opBasis.has(g.label) || filterState.priceLabels.has(g.label)).map(g => g.label);

  if (labels.length <= 1) {
    container.innerHTML = "";
    priceCard.hidden = true;
    return;
  }

  renderFilterList(container, priceCard, {
    items: labels,
    counts,
    filterName: "priceFilter",
    stateSet: filterState.priceLabels,
    labelFn: label => `€ ${label}`,
    allLabel: "Alle prijzen",
  });
}

function renderMinAanbiedersOptions(container, card) {
  const matches = filterKeten();
  const options = MIN_AANBIEDERS_OPTIONS.map(n => ({
    n,
    count: matches.filter(l => (l.aanbieders ?? []).length >= n).length,
  })).filter(o => o.count > 0);

  // Corrigeer de drempel naar een geldige optie VOORDAT de kaart eventueel
  // wordt verborgen — anders blijft filterState.minAanbieders op een
  // onhaalbare waarde staan en gaan de kaarten hieronder ten onrechte
  // allemaal leeg renderen.
  if (options.length > 0 && !options.some(o => o.n === filterState.minAanbieders)) {
    const fallback = options.find(o => o.n === DEFAULT_MIN_AANBIEDERS) || options[options.length - 1];
    filterState.minAanbieders = fallback.n;
  }

  if (options.length <= 1) { container.innerHTML = ""; card.hidden = true; return; }
  card.hidden = false;

  container.innerHTML = "";
  const list = document.createElement("div");
  list.className = "filter-list";
  container.appendChild(list);

  options.forEach(({ n, count }) => {
    const label = document.createElement("label");
    label.className = "filter-row";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "minAanbiedersFilter";
    input.value = String(n);
    input.checked = filterState.minAanbieders === n;
    input.className = "filter-row-input";

    const check = document.createElement("span");
    check.className = "filter-check";
    check.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6 9 17l-5-5"/></svg>';

    const labelText = document.createElement("span");
    labelText.className = "filter-label";
    labelText.append(document.createTextNode(n === 1 ? "Alle winkels" : `${n}+ winkels`));
    if (n === DEFAULT_MIN_AANBIEDERS) {
      labelText.classList.add("has-badge");
      const recommended = document.createElement("span");
      recommended.className = "filter-recommended-badge";
      recommended.textContent = "Aanbevolen";
      labelText.appendChild(recommended);
    }

    const countEl = document.createElement("span");
    countEl.className = "filter-count";
    countEl.textContent = String(count);

    label.append(input, check, labelText, countEl);
    list.appendChild(label);
  });
}

function renderSizeOptions(container, card, matches) {
  renderCheckboxFilter(container, card, collectSizeOptions(matches), matches, l => l.schermdiagonaal, "sizes", "Alle maten", s => `${s}"`);
}

function renderBrandOptions(container, card, matches) {
  renderCheckboxFilter(container, card, collectBrandOptions(matches), matches, l => formatBrandLabel(l.merk), "brands", "Alle merken");
}

function renderTierOptions(container, card, matches) {
  renderCheckboxFilter(container, card, collectTierOptions(matches), matches, l => getProcessorTier(l.processor, l.processor_familie), "tiers", "Alle");
}

function renderPanelTypeOptions(container, card, matches) {
  renderCheckboxFilter(container, card, collectPanelTypeOptions(matches), matches, l => l.paneeltype, "panelTypes", "Alle");
}

function renderRamOptions(container, card, matches) {
  // "X GB of meer" i.p.v. exacte match — zie applyFilters(): met meerdere
  // aangevinkte waarden geldt de laagste als ondergrens (die dekt de hogere
  // al), dus "16 GB" aanvinken sluit 24/32 GB niet meer ten onrechte uit.
  // Tellen met dezelfde betekenis: een laptop met 32 GB telt mee bij "16+ GB" én "32+ GB".
  const opties = collectRamOptions(matches);
  renderCheckboxFilter(container, card, opties, matches, l => opties.filter(r => l.werkgeheugen >= r), "ramOptions", "Alle", r => `${r}+ GB`);
}

function renderResolutionOptions(container, card, matches) {
  renderCheckboxFilter(container, card, collectResolutionOptions(matches), matches, l => l.resolutie, "resolutions", "Alle");
}

function renderTouchscreenOptions(container, card, matches) {
  renderCheckboxFilter(container, card, collectTouchscreenOptions(matches), matches, l => l.touchscreen, "touchscreens", "Alle");
}

function renderUsbcOptions(container, card, matches) {
  renderCheckboxFilter(container, card, collectFunctieOptions(matches), matches, functiesVan, "functies", "Alle", f => FUNCTIES.find(x => x.key === f)?.label ?? f);
}

function renderKleurOptions(container, card, matches) {
  renderCheckboxFilter(container, card, collectKleurOptions(matches), matches, l => normalizeKleur(l.kleur), "kleuren", "Alle");
}

function renderOsOptions(container, card, matches) {
  renderCheckboxFilter(container, card, collectOsOptions(matches), matches, l => l.os, "osOptions", "Alle");
}

function renderAanbiederOptions(container, card, matches) {
  renderCheckboxFilter(container, card, collectAanbiederOptions(matches), matches, l => (l.aanbieders ?? []).map(a => a.winkel), "aanbieder", "Alle");
}

function updateClearFiltersBtn() {
  const btn = qs("#clearFiltersBtn");
  if (!btn) return;
  const hasActive = filterState.priceLabels.size > 0 || filterState.sizes.size > 0 || filterState.brands.size > 0 ||
    filterState.tiers.size > 0 || filterState.panelTypes.size > 0 ||
    filterState.ramOptions.size > 0 || filterState.resolutions.size > 0 ||
    filterState.touchscreens.size > 0 || filterState.functies.size > 0 ||
    filterState.kleuren.size > 0 ||
    filterState.osOptions.size > 0 ||
    filterState.aanbieder.size > 0 ||
    filterState.minAanbieders !== DEFAULT_MIN_AANBIEDERS;
  btn.hidden = !hasActive;
}

function filterKeten() {
  let filtered = getPriceScopedMatches();

  if (filterState.sizes.size > 0) {
    filtered = filtered.filter(l => filterState.sizes.has(l.schermdiagonaal));
  }

  if (filterState.brands.size > 0) {
    filtered = filtered.filter(l => filterState.brands.has(formatBrandLabel(l.merk)));
  }

  if (filterState.tiers.size > 0) {
    filtered = filtered.filter(l => filterState.tiers.has(getProcessorTier(l.processor, l.processor_familie)));
  }

  if (filterState.panelTypes.size > 0) {
    filtered = filtered.filter(l => filterState.panelTypes.has(l.paneeltype));
  }

  if (filterState.ramOptions.size > 0) {
    const minRam = Math.min(...filterState.ramOptions);
    filtered = filtered.filter(l => l.werkgeheugen >= minRam);
  }

  if (filterState.resolutions.size > 0) {
    filtered = filtered.filter(l => filterState.resolutions.has(l.resolutie));
  }

  if (filterState.touchscreens.size > 0) {
    filtered = filtered.filter(l => filterState.touchscreens.has(l.touchscreen));
  }

  // "en": alle aangevinkte functies tegelijk
  if (filterState.functies.size > 0) {
    filtered = filtered.filter(l => {
      const heeft = functiesVan(l);
      return [...filterState.functies].every(f => heeft.includes(f));
    });
  }

  if (filterState.kleuren.size > 0) {
    filtered = filtered.filter(l => filterState.kleuren.has(normalizeKleur(l.kleur)));
  }

  if (filterState.osOptions.size > 0) {
    filtered = filtered.filter(l => filterState.osOptions.has(l.os));
  }

  if (filterState.aanbieder.size > 0) {
    filtered = filtered.filter(l =>
      (l.aanbieders ?? []).some(a => filterState.aanbieder.has(a.winkel))
    );
  }

  return filtered;
}

function applyFilters() {
  const filtered = filterKeten();

  const { effectiveMin, result: final } = applyMinAanbiedersCascade(filtered, filterState.minAanbieders);
  if (effectiveMin !== filterState.minAanbieders) {
    syncMinAanbiedersUI(effectiveMin);
  }

  updateClearFiltersBtn();
  updateResultMatches(final, filterState.answers, filterState.bestType);
}

// Zet de zichtbare selectie gelijk aan `n` zonder een change-event te vuren
// (gebruikt door de cascade-fallback in applyFilters()).
function syncMinAanbiedersUI(n) {
  filterState.minAanbieders = n;
  const container = qs("#minAanbiedersFilterOptions");
  if (!container) return;
  container.querySelectorAll('input[name="minAanbiedersFilter"]').forEach(input => {
    input.checked = Number(input.value) === n;
  });
}

function initFilterEvents(priceContainer, sizeContainer, brandContainer, tierContainer, panelContainer, ramContainer, resolutionContainer, touchscreenContainer, usbcContainer, kleurContainer, osContainer, aanbiederContainer, minAanbiedersContainer) {
  const priceCard       = qs(".filter-card[data-filter='price']");
  const sizeCard        = qs(".filter-card[data-filter='size']");
  const brandCard       = qs(".filter-card[data-filter='brand']");
  const tierCard        = qs(".filter-card[data-filter='tier']");
  const panelCard       = qs(".filter-card[data-filter='panel']");
  const ramCard         = qs(".filter-card[data-filter='ram']");
  const resolutionCard  = qs(".filter-card[data-filter='resolution']");
  const touchscreenCard = qs(".filter-card[data-filter='touchscreen']");
  const usbcCard        = qs(".filter-card[data-filter='usbc']");
  const kleurCard       = qs(".filter-card[data-filter='kleur']");
  const osCard          = qs(".filter-card[data-filter='os']");
  const aanbiederCard   = qs(".filter-card[data-filter='aanbieder']");
  const minAanbiedersCard = qs(".filter-card[data-filter='min-aanbieders']");

  function renderAllSecondary() {
    renderMinAanbiedersOptions(minAanbiedersContainer, minAanbiedersCard);
    const matches = getSecondaryScopedMatches();
    renderSizeOptions(sizeContainer, sizeCard, matches);
    renderBrandOptions(brandContainer, brandCard, matches);
    renderTierOptions(tierContainer, tierCard, matches);
    renderPanelTypeOptions(panelContainer, panelCard, matches);
    renderRamOptions(ramContainer, ramCard, matches);
    renderResolutionOptions(resolutionContainer, resolutionCard, matches);
    renderTouchscreenOptions(touchscreenContainer, touchscreenCard, matches);
    renderUsbcOptions(usbcContainer, usbcCard, matches);
    renderKleurOptions(kleurContainer, kleurCard, matches);
    renderOsOptions(osContainer, osCard, matches);
    renderAanbiederOptions(aanbiederContainer, aanbiederCard, matches);
    renderPriceOptions(priceContainer, priceCard, filterState.sizeGroup);
  }

  minAanbiedersContainer.addEventListener("change", event => {
    const input = event.target.closest("input[type=radio]");
    if (!input) return;
    filterState.minAanbieders = parseInt(input.value, 10);
    applyFilters();
    renderAllSecondary();
  });

  priceContainer.addEventListener("change", event => {
    const input = event.target.closest("input[type=checkbox]");
    if (!input) return;

    if (input.value === "all") {
      if (input.checked) {
        filterState.priceLabels.clear();
        renderPriceOptions(priceContainer, priceCard, filterState.sizeGroup);
      } else if (filterState.priceLabels.size === 0) {
        input.checked = true;
      }
    } else {
      if (input.checked) filterState.priceLabels.add(input.value);
      else filterState.priceLabels.delete(input.value);

      if (filterState.priceLabels.size === 0) {
        renderPriceOptions(priceContainer, priceCard, filterState.sizeGroup);
      } else {
        const allInput = priceContainer.querySelector('input[value="all"]');
        if (allInput) allInput.checked = false;
      }
    }

    applyFilters();
    renderAllSecondary();
  });

  function handleCheckboxSet(container, stateSet, card, renderFn, valueFn = v => v, exclusive = false) {
    container.addEventListener("change", event => {
      const input = event.target.closest("input[type=checkbox]");
      if (!input) return;
      if (input.value === "all") {
        if (input.checked) { stateSet.clear(); renderFn(container, card, getSecondaryScopedMatches()); }
        else if (stateSet.size === 0) { input.checked = true; }
      } else {
        const val = valueFn(input.value);
        if (input.checked) {
          // "Ja"/"Nee"-achtige filters zijn elkaars tegenpolen: aanvinken
          // van de één moet de ander automatisch uitvinken.
          if (exclusive) stateSet.clear();
          stateSet.add(val);
        } else {
          stateSet.delete(val);
        }
        if (stateSet.size === 0) renderFn(container, card, getSecondaryScopedMatches());
        else { const allInput = container.querySelector('input[value="all"]'); if (allInput) allInput.checked = false; }
      }
      applyFilters();
      renderAllSecondary();
    });
  }

  handleCheckboxSet(sizeContainer,        filterState.sizes,        sizeCard,        renderSizeOptions,        v => parseFloat(v));
  handleCheckboxSet(brandContainer,       filterState.brands,       brandCard,       renderBrandOptions);
  handleCheckboxSet(tierContainer,        filterState.tiers,        tierCard,        renderTierOptions);
  handleCheckboxSet(panelContainer,       filterState.panelTypes,   panelCard,       renderPanelTypeOptions);
  handleCheckboxSet(ramContainer,         filterState.ramOptions,   ramCard,         renderRamOptions,        v => parseInt(v, 10));
  handleCheckboxSet(resolutionContainer,  filterState.resolutions,  resolutionCard,  renderResolutionOptions);
  handleCheckboxSet(touchscreenContainer, filterState.touchscreens, touchscreenCard, renderTouchscreenOptions, v => v, true);
  handleCheckboxSet(usbcContainer,        filterState.functies,     usbcCard,        renderUsbcOptions);
  handleCheckboxSet(kleurContainer,       filterState.kleuren,      kleurCard,       renderKleurOptions);
  handleCheckboxSet(osContainer,          filterState.osOptions,    osCard,          renderOsOptions);
  handleCheckboxSet(aanbiederContainer,   filterState.aanbieder,    aanbiederCard,   renderAanbiederOptions);

  qs("#filtersPanel")?.addEventListener("change", event => {
    const input = event.target.closest("input");
    if (!input) return;
    meet("filter_gebruikt", { filter: input.closest(".filter-card")?.dataset.filter || input.name, waarde: input.value === "all" ? "alle" : String(input.value).slice(0, 40) });
  });

  const clearBtn = qs("#clearFiltersBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      filterState.priceLabels.clear();
      filterState.sizes.clear(); filterState.brands.clear();
      filterState.tiers.clear(); filterState.panelTypes.clear();
      filterState.ramOptions.clear(); filterState.resolutions.clear();
      filterState.touchscreens.clear(); filterState.osOptions.clear();
      filterState.functies.clear();
      filterState.kleuren.clear();
      filterState.aanbieder.clear();
      filterState.minAanbieders = DEFAULT_MIN_AANBIEDERS;
      renderPriceOptions(priceContainer, priceCard, filterState.sizeGroup);
      renderAllSecondary();
      applyFilters();
    });
  }
}

function initResultFilters() {
  const priceContainer    = qs("#priceFilterOptions");
  const sizeContainer     = qs("#sizeFilterOptions");
  const brandContainer    = qs("#brandFilterOptions");
  const tierContainer     = qs("#tierFilterOptions");
  const panelContainer    = qs("#panelFilterOptions");
  const ramContainer      = qs("#ramFilterOptions");
  const resolutionContainer  = qs("#resolutionFilterOptions");
  const touchscreenContainer = qs("#touchscreenFilterOptions");
  const usbcContainer        = qs("#usbcFilterOptions");
  const kleurContainer       = qs("#kleurFilterOptions");
  const osContainer          = qs("#osFilterOptions");
  const aanbiederContainer = qs("#aanbiederFilterOptions");
  const minAanbiedersContainer = qs("#minAanbiedersFilterOptions");

  const priceCard      = qs(".filter-card[data-filter='price']");
  const sizeCard       = qs(".filter-card[data-filter='size']");
  const brandCard      = qs(".filter-card[data-filter='brand']");
  const tierCard       = qs(".filter-card[data-filter='tier']");
  const panelCard      = qs(".filter-card[data-filter='panel']");
  const ramCard        = qs(".filter-card[data-filter='ram']");
  const resolutionCard  = qs(".filter-card[data-filter='resolution']");
  const touchscreenCard = qs(".filter-card[data-filter='touchscreen']");
  const usbcCard        = qs(".filter-card[data-filter='usbc']");
  const kleurCard       = qs(".filter-card[data-filter='kleur']");
  const osCard          = qs(".filter-card[data-filter='os']");
  const aanbiederCard  = qs(".filter-card[data-filter='aanbieder']");
  const minAanbiedersCard = qs(".filter-card[data-filter='min-aanbieders']");

  if (!priceContainer || !sizeContainer || !brandContainer || !tierContainer ||
      !panelContainer || !ramContainer || !resolutionContainer || !touchscreenContainer ||
      !usbcContainer || !kleurContainer || !osContainer || !aanbiederContainer || !minAanbiedersContainer) return;
  if (!priceCard || !sizeCard || !brandCard || !tierCard ||
      !panelCard || !ramCard || !resolutionCard || !touchscreenCard ||
      !usbcCard || !kleurCard || !osCard || !aanbiederCard || !minAanbiedersCard) return;

  const stored      = getStoredSelection();
  const answersData = localStorage.getItem("laptop_answers");
  const scoresData  = localStorage.getItem("laptop_scores");

  if (!stored.sizeGroup || !answersData || !scoresData) return;

  filterState.answers   = JSON.parse(answersData);
  filterState.scores    = JSON.parse(scoresData);
  filterState.bestType  = localStorage.getItem("laptop_bestType") || "";
  filterState.sizeGroup = stored.sizeGroup;

  fetchProducts()
    .then(rawProducts => {
      const laptops = normalizeProducts(rawProducts);

      // Budget uit de quiz (maximumbedrag) is een echte grens, net als in de quiz.
      // Past er in dit formaat niets binnen, dan zonder grens (zelfde vangnet).
      const cap = Number(filterState.answers?.budget) || null;
      const zonderGrens = matchLaptops(laptops, stored.sizeGroup, null, filterState.answers);
      let result = cap ? matchLaptops(laptops, stored.sizeGroup, cap, filterState.answers) : zonderGrens;
      const budgetZonderMatch = Boolean(cap && !(result.filteredMatchedLaptops?.length));
      if (budgetZonderMatch) result = zonderGrens;
      filterState.baseMatches = Array.isArray(result.filteredMatchedLaptops) ? result.filteredMatchedLaptops : [];
      filterState.bestType = result.bestType || filterState.bestType;
      filterState.priceGroups = computeDynamicPriceGroups(filterState.baseMatches, stored.sizeGroup, sizeGroupToAllowedSizes);
      budgetContext = { cap, result, zonderGrens, budgetZonderMatch };

      // Fallback: if the live computation yields nothing, seed the pool with
      // the laptops that were already matched during the quiz. This ensures
      // the filter panel always shows options regardless of whether the
      // dynamic computation succeeds.
      if (filterState.baseMatches.length === 0) {
        const storedData = localStorage.getItem("laptop_filteredMatchedLaptops");
        if (storedData) {
          try {
            const storedLaptops = JSON.parse(storedData);
            if (Array.isArray(storedLaptops) && storedLaptops.length > 0) {
              filterState.baseMatches = storedLaptops;
            }
          } catch { /* ignore parse errors */ }
        }
      }

      if (filterState.baseMatches.length === 0) return;

      // No price bucket selected by default: show every matching laptop and
      // let the user optionally narrow by budget.
      filterState.priceLabels = new Set();

      // Vóór alle andere tellingen: bepaalt/valideert filterState.minAanbieders.
      renderMinAanbiedersOptions(minAanbiedersContainer, minAanbiedersCard);
      renderPriceOptions(priceContainer, priceCard, stored.sizeGroup);
      const matches = getSecondaryScopedMatches();
      renderSizeOptions(sizeContainer, sizeCard, matches);
      renderBrandOptions(brandContainer, brandCard, matches);
      renderTierOptions(tierContainer, tierCard, matches);
      renderPanelTypeOptions(panelContainer, panelCard, matches);
      renderRamOptions(ramContainer, ramCard, matches);
      renderResolutionOptions(resolutionContainer, resolutionCard, matches);
      renderTouchscreenOptions(touchscreenContainer, touchscreenCard, matches);
      renderUsbcOptions(usbcContainer, usbcCard, matches);
      renderKleurOptions(kleurContainer, kleurCard, matches);
      renderOsOptions(osContainer, osCard, matches);
      renderAanbiederOptions(aanbiederContainer, aanbiederCard, matches);
      initFilterEvents(priceContainer, sizeContainer, brandContainer, tierContainer, panelContainer, ramContainer, resolutionContainer, touchscreenContainer, usbcContainer, kleurContainer, osContainer, aanbiederContainer, minAanbiedersContainer);
      applyFilters();
      if (cap) initBudgetNote(budgetContext);
      initMeting(cap);
    })
    .catch(() => {
      [priceCard, sizeCard, brandCard, tierCard, panelCard, ramCard, resolutionCard, touchscreenCard, usbcCard, kleurCard, osCard, aanbiederCard, minAanbiedersCard]
        .forEach(card => { card.hidden = true; });
    });
}

let budgetContext = null;

// ───────── budget: "Meer budget?" en het vangnet als er niets binnen past ─────────
const KLASSE_MEER = {
  Topklasse: ["een laptop uit de topklasse", "De snelste processors, voor zwaar werk en games"],
  Krachtig:  ["een krachtigere laptop", "Meer rekenkracht voor zwaarder werk"],
  Mid:       ["een snellere laptop", "Vlotter bij veel programma's tegelijk"],
  Budget:    ["een laptop die beter past", "Meer van wat je zoekt"],
};
const euroLabel = n => "€" + Math.round(n).toLocaleString("nl-NL");

function initBudgetNote({ cap, result: binnen, zonderGrens, budgetZonderMatch }) {
  const binnenLijst = binnen.filteredMatchedLaptops ?? [];
  const kaart = document.createElement("div");
  kaart.className = "budget-kaart";
  kaart.setAttribute("role", "note");

  if (budgetZonderMatch) {
    meet("budget_kaart", { actie: "niets_binnen_budget" });
    kaart.innerHTML = `<p><strong>Binnen ${euroLabel(cap)} vonden we in dit formaat geen laptop.</strong> Dit zijn de laptops die het best bij je wensen passen, vanaf de goedkoopste.</p>`;
    plaatsBudgetKaart(kaart);
    return;
  }

  // Alleen tonen als er boven het budget laptops zijn die duidelijk beter bij de
  // wensen passen (passcore zonder prijsdeel) en die je standaard ziet (2+ winkels).
  // Vergelijk met wat je binnen budget echt ziet (2+ winkels): een gaminglaptop
  // van €999 die maar bij 1 winkel te koop is, staat standaard niet in beeld.
  const zichtbaarBinnen = binnenLijst.filter(l => (l.aanbieders ?? []).length >= DEFAULT_MIN_AANBIEDERS);
  const topBinnen = zichtbaarBinnen.length ? Math.max(...zichtbaarBinnen.map(l => l.wens)) : binnen.topWens;
  const drempel = (topBinnen ?? -Infinity) + BAND_BESTE;
  const beter = (zonderGrens.filteredMatchedLaptops ?? []).filter(l => parsePrice(l.prijs) > cap && l.wens >= drempel);
  const zichtbaar = beter.filter(l => (l.aanbieders ?? []).length >= DEFAULT_MIN_AANBIEDERS);
  const goedkoopsteBuiten = zichtbaar.map(l => parsePrice(l.prijs)).filter(Number.isFinite).sort((a, b) => a - b)[0];
  if (!goedkoopsteBuiten) return;
  const buitenBeste = kiesBesteMatch(zichtbaar, filterState.answers);
  const klasse = buitenBeste?.tier ?? zonderGrens.bestType;
  const hoger = TIER_ORDER.indexOf(klasse) > TIER_ORDER.indexOf(binnen.bestType);
  // Mist binnen budget de videokaart (of Apple-grafische chip) die gamen of
  // creatief werk vraagt, en heeft de laptop erboven die wel? Dan zeggen we dat.
  const gebruik = Array.isArray(filterState.answers?.gebruik) ? filterState.answers.gebruik : [];
  const gpuOk = l => heeftDedicatedGpu(l.gpu) || (!gebruik.includes("gaming") && /\bM\d+\s+(pro|max|ultra)\b/i.test(l.processor ?? ""));
  const gpuReden = (gebruik.includes("gaming") || gebruik.includes("creatief")) && buitenBeste && gpuOk(buitenBeste) && !zichtbaarBinnen.some(gpuOk);
  const meer = goedkoopsteBuiten - cap;
  let toontBuiten = false;
  const teken = () => {
    const [wat, voordeel] = KLASSE_MEER[klasse] ?? KLASSE_MEER.Budget;
    kaart.innerHTML = toontBuiten
      ? `<div class="budget-kaart-tekst"><strong>Je ziet nu laptops boven je budget</strong><span>Vanaf ${euroLabel(goedkoopsteBuiten)}. Liever binnen je budget blijven?</span></div>
         <button type="button" class="budget-kaart-btn">Terug naar laptops tot ${euroLabel(cap)}</button>`
      : gpuReden
        ? `<div class="budget-kaart-tekst"><strong>Meer budget? Dan krijg je ${gebruik.includes("gaming") ? "een laptop met een losse videokaart, die je nodig hebt om te gamen" : "een laptop met een krachtige grafische chip voor foto- en videobewerking"}</strong><span>Binnen je budget is die er niet bij 2 of meer winkels. Vanaf ${euroLabel(goedkoopsteBuiten)}, ${euroLabel(meer)} boven je budget.</span></div>
         <button type="button" class="budget-kaart-btn">Bekijk deze laptops</button>`
      : hoger
        ? `<div class="budget-kaart-tekst"><strong>Meer budget? Dan past ${wat} nog beter bij je wensen</strong><span>${voordeel}. Vanaf ${euroLabel(goedkoopsteBuiten)}, ${euroLabel(meer)} boven je budget.</span></div>
         <button type="button" class="budget-kaart-btn">Bekijk deze laptops</button>`
        : `<div class="budget-kaart-tekst"><strong>Meer budget? Er zijn laptops die nog beter bij je wensen passen</strong><span>Vanaf ${euroLabel(goedkoopsteBuiten)}, ${euroLabel(meer)} boven je budget.</span></div>
         <button type="button" class="budget-kaart-btn">Bekijk deze laptops</button>`;
    kaart.querySelector(".budget-kaart-btn").addEventListener("click", () => {
      toontBuiten = !toontBuiten;
      meet("budget_kaart", { actie: toontBuiten ? "klik_meer_budget" : "klik_terug", klasse });
      lijstSoort = toontBuiten ? "boven_budget" : "binnen_budget";
      filterState.baseMatches = toontBuiten ? beter : binnenLijst;
      filterState.bestType = toontBuiten ? klasse : binnen.bestType;
      filterState.priceGroups = computeDynamicPriceGroups(filterState.baseMatches, filterState.sizeGroup, sizeGroupToAllowedSizes);
      // Andere lijst = verse start: alle filters terug naar standaard, zoals "Wis filters".
      qs("#clearFiltersBtn")?.click();
      teken();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };
  teken();
  plaatsBudgetKaart(kaart);
  meet("budget_kaart", { actie: "getoond", klasse, meer_euro: Math.round(meer) });
}

// De lijst wordt bij elk filter en elke sortering opnieuw getekend: zet de kaart
// daarna steeds terug direct na de eerste laptop.
function plaatsBudgetKaart(kaart) {
  const grid = qs("#otherMatchesGrid");
  if (!grid) return;
  const zet = () => {
    const items = [...grid.children].filter(el => el !== kaart && !el.classList.contains("rcard-skelet"));
    if (!items.length) return;
    const na = items[0];
    if (na.nextElementSibling === kaart) return;
    waker.disconnect();
    na.after(kaart);
    waker.observe(grid, { childList: true });
  };
  const waker = new MutationObserver(zet);
  waker.observe(grid, { childList: true });
  zet();
}

// ───────── meting (Umami, via shared/consent.js) ─────────
const meet = (naam, props) => window.phTrackEvent?.(naam, { categorie: "laptop", ...props });
let lijstSoort = "binnen_budget";

function initMeting(cap) {
  const budget = cap ? String(cap) : "geen_voorkeur";
  const zichtbaar = () => document.querySelectorAll("#otherMatchesGrid > .rcard").length;
  // Meegestuurd met elke winkelklik (shared/analytics.js)
  window.phResultaatContext = () => ({ budget, lijst: zichtbaar(), lijst_soort: lijstSoort });
  const beste = kiesBesteMatch(filterKeten().filter(genoegWinkels), filterState.answers);
  meet("resultaat_getoond", {
    budget, formaat: filterState.sizeGroup, os: filterState.answers?.os ?? "", lijst: zichtbaar(), beste_klasse: beste?.tier ?? "",
  });
}

document.addEventListener("DOMContentLoaded", initResultFilters);
