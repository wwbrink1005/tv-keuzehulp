import { priceGroupsBySize, getProcessorTier, sizeGroupToAllowedSizes } from "./data.js";
import { computeMatchForPriceGroup, applyMinAanbiedersCascade, DEFAULT_MIN_AANBIEDERS } from "./matching.js";
import { computeDynamicPriceGroups, getStoredSelection, normalizeProducts, parsePrice, qs } from "./utils.js";
import { updateResultMatches } from "./result.js";
import { fetchProducts } from "./supabase.js";
import { computeCounts, renderFilterList } from "../../shared/filters.js";

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
  usbc:         new Set(),
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
    return groups.some(g => price >= g.min && price <= g.max);
  });
}

function getSecondaryScopedMatches() {
  return getPriceScopedMatches().filter(l => (l.aanbieders ?? []).length >= filterState.minAanbieders);
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

function collectUsbcOptions(matches) {
  const set = new Set();
  matches.forEach(l => { if (l.usb_c) set.add(l.usb_c); });
  const order = ["Ja", "Nee"];
  return order.filter(t => set.has(t));
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
  const counts = computeCounts(matches, productValueFn);
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
  const groupForPrice = price => groups.find(g => price >= g.min && price <= g.max);
  const counts = computeCounts(base, l => groupForPrice(parsePrice(l.prijs))?.label);
  const labels = groups.filter(g => counts.has(g.label)).map(g => g.label);

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
  const matches = getPriceScopedMatches();
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
  renderCheckboxFilter(container, card, collectRamOptions(matches), matches, l => l.werkgeheugen, "ramOptions", "Alle", r => `${r}+ GB`);
}

function renderResolutionOptions(container, card, matches) {
  renderCheckboxFilter(container, card, collectResolutionOptions(matches), matches, l => l.resolutie, "resolutions", "Alle");
}

function renderTouchscreenOptions(container, card, matches) {
  renderCheckboxFilter(container, card, collectTouchscreenOptions(matches), matches, l => l.touchscreen, "touchscreens", "Alle");
}

function renderUsbcOptions(container, card, matches) {
  renderCheckboxFilter(container, card, collectUsbcOptions(matches), matches, l => l.usb_c, "usbc", "Alle");
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
    filterState.touchscreens.size > 0 || filterState.usbc.size > 0 ||
    filterState.kleuren.size > 0 ||
    filterState.osOptions.size > 0 ||
    filterState.aanbieder.size > 0 ||
    filterState.minAanbieders !== DEFAULT_MIN_AANBIEDERS;
  btn.hidden = !hasActive;
}

function applyFilters() {
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

  if (filterState.usbc.size > 0) {
    filtered = filtered.filter(l => filterState.usbc.has(l.usb_c));
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
    renderMinAanbiedersOptions(minAanbiedersContainer, minAanbiedersCard);
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
    });
  }

  handleCheckboxSet(sizeContainer,        filterState.sizes,        sizeCard,        renderSizeOptions,        v => parseFloat(v));
  handleCheckboxSet(brandContainer,       filterState.brands,       brandCard,       renderBrandOptions);
  handleCheckboxSet(tierContainer,        filterState.tiers,        tierCard,        renderTierOptions);
  handleCheckboxSet(panelContainer,       filterState.panelTypes,   panelCard,       renderPanelTypeOptions);
  handleCheckboxSet(ramContainer,         filterState.ramOptions,   ramCard,         renderRamOptions,        v => parseInt(v, 10));
  handleCheckboxSet(resolutionContainer,  filterState.resolutions,  resolutionCard,  renderResolutionOptions);
  handleCheckboxSet(touchscreenContainer, filterState.touchscreens, touchscreenCard, renderTouchscreenOptions, v => v, true);
  handleCheckboxSet(usbcContainer,        filterState.usbc,         usbcCard,        renderUsbcOptions,        v => v, true);
  handleCheckboxSet(kleurContainer,       filterState.kleuren,      kleurCard,       renderKleurOptions);
  handleCheckboxSet(osContainer,          filterState.osOptions,    osCard,          renderOsOptions);
  handleCheckboxSet(aanbiederContainer,   filterState.aanbieder,    aanbiederCard,   renderAanbiederOptions);

  const clearBtn = qs("#clearFiltersBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      filterState.priceLabels.clear();
      filterState.sizes.clear(); filterState.brands.clear();
      filterState.tiers.clear(); filterState.panelTypes.clear();
      filterState.ramOptions.clear(); filterState.resolutions.clear();
      filterState.touchscreens.clear(); filterState.osOptions.clear();
      filterState.usbc.clear();
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
      filterState.priceGroups = computeDynamicPriceGroups(laptops, stored.sizeGroup, sizeGroupToAllowedSizes);

      const result = computeMatchForPriceGroup(laptops, stored.sizeGroup, null, filterState.answers, filterState.scores);
      filterState.baseMatches = Array.isArray(result.filteredMatchedLaptops) ? result.filteredMatchedLaptops : [];

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
    })
    .catch(() => {
      [priceCard, sizeCard, brandCard, tierCard, panelCard, ramCard, resolutionCard, touchscreenCard, usbcCard, kleurCard, osCard, aanbiederCard, minAanbiedersCard]
        .forEach(card => { card.hidden = true; });
    });
}

document.addEventListener("DOMContentLoaded", initResultFilters);
