import { priceGroupsByType } from "./data.js";
import { computeMatchForPriceGroup, applyMinAanbiedersCascade, DEFAULT_MIN_AANBIEDERS } from "./matching.js";
import { computeDynamicPriceGroups, getStoredSelection, normalizeProducts, parsePrice, qs } from "./utils.js";
import { updateResultMatches } from "./result.js";
import { fetchProducts } from "./supabase.js";
import { computeCounts, renderFilterList } from "../../shared/filters.js";

const MIN_AANBIEDERS_OPTIONS = [1, 2, 3, 4, 5];

const filterState = {
  priceLabels:   new Set(),
  minAanbieders: DEFAULT_MIN_AANBIEDERS,
  behuizingTypes: new Set(),
  brands:        new Set(),
  gpuTiers:      new Set(),
  ramOptions:    new Set(),
  opslagOptions: new Set(),
  osOptions:     new Set(),
  processorFabrikanten: new Set(),
  // RGB-verlichting en waterkoeling waren voorheen 2 losse Ja/Nee-kaarten —
  // samengevoegd tot 1 "Functies"-kaart met aanvinkbare functies (zie
  // FUNCTIE_DEFINITIES), net als bij wasmachine/koelkast.
  functies:      new Set(),
  kleuren:       new Set(),
  aanbieder:     new Set(),
  baseMatches:   [],
  answers:       null,
  scores:        null,
  bestType:      "",
  behuizingType: ""
};

const FUNCTIE_DEFINITIES = [
  { key: "rgb", label: "RGB-verlichting", check: d => d.rgb === "Ja" },
  { key: "waterkoeling", label: "Waterkoeling", check: d => d.waterkoeling === "Ja" },
  { key: "wifi", label: "Ingebouwde wifi", check: d => d.wifi === "Ja" },
];

// Price buckets are recomputed fresh from the live-fetched catalog on every
// results page load (not trusted from the quiz-time localStorage snapshot),
// since a stale/short-lived fetch during the quiz can produce fewer or
// narrower buckets than the catalog actually supports (e.g. missing the
// most expensive bucket entirely).
function getDynamicPriceGroups(behuizingType) {
  if (Array.isArray(filterState.priceGroups) && filterState.priceGroups.length > 0) {
    return filterState.priceGroups;
  }
  return priceGroupsByType[behuizingType] || priceGroupsByType["maakt-niet-uit"];
}

// Price is just another optional narrowing filter, not a hard upfront wall:
// with no bucket selected, every desktop matching the quiz answers is shown.
function getBaseMatches() {
  return filterState.baseMatches;
}

function getPriceScopedMatches() {
  const base = getBaseMatches();
  if (filterState.priceLabels.size === 0) return base;
  const groups = getDynamicPriceGroups(filterState.behuizingType).filter(g => filterState.priceLabels.has(g.label));
  return base.filter(d => {
    const price = parsePrice(d.prijs);
    return groups.some(g => price >= g.min && price <= g.max);
  });
}

function getSecondaryScopedMatches() {
  return getPriceScopedMatches().filter(d => (d.aanbieders ?? []).length >= filterState.minAanbieders);
}

function getBaseScopedByMinAanbieders() {
  return getBaseMatches().filter(d => (d.aanbieders ?? []).length >= filterState.minAanbieders);
}

function formatBrandLabel(brand) {
  const raw = String(brand ?? "").trim();
  if (!raw) return "";
  if (raw === raw.toUpperCase()) return raw;
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function collectBehuizingOptions(matches) {
  const set = new Set();
  matches.forEach(d => { if (d.behuizing) set.add(d.behuizing); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "nl"));
}

function collectBrandOptions(matches) {
  const set = new Set();
  matches.forEach(d => { const label = formatBrandLabel(d.merk); if (label) set.add(label); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "nl"));
}

function collectGpuTierOptions(matches) {
  const tierOrder = ["Budget", "Mid", "Krachtig", "Topklasse"];
  const set = new Set(matches.map(d => d.gpuTier).filter(Boolean));
  return tierOrder.filter(t => set.has(t));
}

function collectRamOptions(matches) {
  const set = new Set();
  matches.forEach(d => { if (d.ram) set.add(d.ram); });
  return Array.from(set).sort((a, b) => a - b);
}

function collectOpslagOptions(matches) {
  const set = new Set();
  matches.forEach(d => { if (d.opslag) set.add(d.opslag); });
  return Array.from(set).sort((a, b) => a - b);
}

function collectOsOptions(matches) {
  const set = new Set();
  matches.forEach(d => { if (d.os) set.add(d.os); });
  const order = ["Windows 11 Home", "Windows 11 Pro"];
  const inOrder = order.filter(t => set.has(t));
  set.forEach(t => { if (!order.includes(t)) inOrder.push(t); });
  return inOrder;
}

function collectProcessorFabrikantOptions(matches) {
  const set = new Set();
  matches.forEach(d => { if (d.processorFabrikant) set.add(d.processorFabrikant); });
  const order = ["Intel", "AMD"];
  const inOrder = order.filter(t => set.has(t));
  set.forEach(t => { if (!order.includes(t)) inOrder.push(t); });
  return inOrder;
}

function collectFunctieOptions(matches) {
  return FUNCTIE_DEFINITIES.filter(f => matches.some(f.check)).map(f => f.key);
}

function collectKleurOptions(matches) {
  const set = new Set();
  matches.forEach(d => { if (d.kleur) set.add(d.kleur); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "nl"));
}

function collectAanbiederOptions(matches) {
  const set = new Set();
  matches.forEach(d => {
    (d.aanbieders ?? []).forEach(a => set.add(a.winkel));
  });
  return Array.from(set).sort();
}

function renderFilterOptions(container, card, items, matches, productValueFn, filterName, labelFn) {
  if (items.length === 0) { container.innerHTML = ""; card.hidden = true; return; }
  const stateSet = filterState[filterName];
  const counts = computeCounts(matches, productValueFn);
  renderFilterList(container, card, { items, counts, filterName, stateSet, labelFn });
}

function renderPriceOptions(container, card, behuizingType) {
  const groups = getDynamicPriceGroups(behuizingType);

  // Only show price buckets that actually contain a matching desktop for the
  // current quiz answers — otherwise users click a bucket that can never
  // show a result. If there's only one (or zero) non-empty bucket there's
  // nothing meaningful to narrow, so hide the whole filter card.
  const base = getBaseScopedByMinAanbieders();
  const groupForPrice = price => groups.find(g => price >= g.min && price <= g.max);
  const counts = computeCounts(base, d => groupForPrice(parsePrice(d.prijs))?.label);
  const relevant = groups.filter(g => counts.has(g.label)).map(g => g.label);

  if (relevant.length <= 1) { container.innerHTML = ""; card.hidden = true; return; }

  renderFilterList(container, card, {
    items: relevant,
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
    count: matches.filter(d => (d.aanbieders ?? []).length >= n).length,
  })).filter(o => o.count > 0);

  // Corrigeer de drempel naar een geldige optie VOORDAT de kaart eventueel
  // wordt verborgen — anders blijft filterState.minAanbieders op een
  // onhaalbare waarde staan en gaan de kaarten hieronder (die via
  // getSecondaryScopedMatches()/getBaseScopedByMinAanbieders() dezelfde
  // drempel gebruiken) ten onrechte allemaal leeg renderen.
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

function renderBehuizingOptions(container, card, matches) {
  renderFilterOptions(container, card, collectBehuizingOptions(matches), matches, d => d.behuizing, "behuizingTypes");
}

function renderBrandOptions(container, card, matches) {
  renderFilterOptions(container, card, collectBrandOptions(matches), matches, d => formatBrandLabel(d.merk), "brands");
}

function renderGpuTierOptions(container, card, matches) {
  renderFilterOptions(container, card, collectGpuTierOptions(matches), matches, d => d.gpuTier, "gpuTiers");
}

function renderRamOptions(container, card, matches) {
  renderFilterOptions(container, card, collectRamOptions(matches), matches, d => d.ram, "ramOptions", r => `${r} GB`);
}

function formatOpslagLabel(gb) {
  if (gb >= 1024) {
    const tb = gb / 1024;
    return `${Number.isInteger(tb) ? tb : tb.toFixed(1)} TB`;
  }
  return `${gb} GB`;
}

function renderOpslagOptions(container, card, matches) {
  renderFilterOptions(container, card, collectOpslagOptions(matches), matches, d => d.opslag, "opslagOptions", formatOpslagLabel);
}

function renderOsOptions(container, card, matches) {
  renderFilterOptions(container, card, collectOsOptions(matches), matches, d => d.os, "osOptions");
}

function renderProcessorFabrikantOptions(container, card, matches) {
  renderFilterOptions(container, card, collectProcessorFabrikantOptions(matches), matches, d => d.processorFabrikant, "processorFabrikanten");
}

function renderFunctieOptions(container, card, matches) {
  const functieValueFn = d => FUNCTIE_DEFINITIES.filter(f => f.check(d)).map(f => f.key);
  const labelFn = key => FUNCTIE_DEFINITIES.find(f => f.key === key)?.label ?? key;
  renderFilterOptions(container, card, collectFunctieOptions(matches), matches, functieValueFn, "functies", labelFn);
}

function renderKleurOptions(container, card, matches) {
  renderFilterOptions(container, card, collectKleurOptions(matches), matches, d => d.kleur, "kleuren");
}

function renderAanbiederOptions(container, card, matches) {
  renderFilterOptions(container, card, collectAanbiederOptions(matches), matches, d => (d.aanbieders ?? []).map(a => a.winkel), "aanbieder");
}

function updateClearFiltersBtn() {
  const btn = qs("#clearFiltersBtn");
  if (!btn) return;
  const hasActive =
    filterState.priceLabels.size > 0     ||
    filterState.behuizingTypes.size > 0  ||
    filterState.brands.size > 0          ||
    filterState.gpuTiers.size > 0        ||
    filterState.ramOptions.size > 0      ||
    filterState.opslagOptions.size > 0   ||
    filterState.osOptions.size > 0       ||
    filterState.processorFabrikanten.size > 0 ||
    filterState.functies.size > 0 ||
    filterState.kleuren.size > 0 ||
    filterState.aanbieder.size > 0 ||
    filterState.minAanbieders !== DEFAULT_MIN_AANBIEDERS;
  btn.hidden = !hasActive;
}

function applyFilters() {
  let filtered = getPriceScopedMatches();

  if (filterState.behuizingTypes.size > 0) {
    filtered = filtered.filter(d => filterState.behuizingTypes.has(d.behuizing));
  }

  if (filterState.brands.size > 0) {
    filtered = filtered.filter(d => filterState.brands.has(formatBrandLabel(d.merk)));
  }

  if (filterState.gpuTiers.size > 0) {
    filtered = filtered.filter(d => filterState.gpuTiers.has(d.gpuTier));
  }

  if (filterState.ramOptions.size > 0) {
    filtered = filtered.filter(d => filterState.ramOptions.has(d.ram));
  }

  if (filterState.opslagOptions.size > 0) {
    filtered = filtered.filter(d => filterState.opslagOptions.has(d.opslag));
  }

  if (filterState.osOptions.size > 0) {
    filtered = filtered.filter(d => filterState.osOptions.has(d.os));
  }

  if (filterState.processorFabrikanten.size > 0) {
    filtered = filtered.filter(d => filterState.processorFabrikanten.has(d.processorFabrikant));
  }

  if (filterState.functies.size > 0) {
    filtered = filtered.filter(d =>
      FUNCTIE_DEFINITIES.filter(f => filterState.functies.has(f.key)).every(f => f.check(d))
    );
  }

  if (filterState.kleuren.size > 0) {
    filtered = filtered.filter(d => filterState.kleuren.has(d.kleur));
  }

  if (filterState.aanbieder.size > 0) {
    filtered = filtered.filter(d =>
      (d.aanbieders ?? []).some(a => filterState.aanbieder.has(a.winkel))
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

function initFilterEvents(priceContainer, behuizingContainer, brandContainer, gpuTierContainer, ramContainer, opslagContainer, osContainer, processorFabrikantContainer, functieContainer, kleurContainer, aanbiederContainer, minAanbiedersContainer) {
  function renderAllSecondary() {
    const matches = getSecondaryScopedMatches();
    renderBehuizingOptions(behuizingContainer, qs(".filter-card[data-filter='behuizing']"), matches);
    renderBrandOptions(brandContainer, qs(".filter-card[data-filter='brand']"), matches);
    renderGpuTierOptions(gpuTierContainer, qs(".filter-card[data-filter='gpu-tier']"), matches);
    renderRamOptions(ramContainer, qs(".filter-card[data-filter='ram']"), matches);
    renderOpslagOptions(opslagContainer, qs(".filter-card[data-filter='opslag']"), matches);
    renderOsOptions(osContainer, qs(".filter-card[data-filter='os']"), matches);
    renderProcessorFabrikantOptions(processorFabrikantContainer, qs(".filter-card[data-filter='processor-fabrikant']"), matches);
    renderFunctieOptions(functieContainer, qs(".filter-card[data-filter='functies']"), matches);
    renderKleurOptions(kleurContainer, qs(".filter-card[data-filter='kleur']"), matches);
    renderAanbiederOptions(aanbiederContainer, qs(".filter-card[data-filter='aanbieder']"), matches);
    renderMinAanbiedersOptions(minAanbiedersContainer, qs(".filter-card[data-filter='min-aanbieders']"));
    renderPriceOptions(priceContainer, qs(".filter-card[data-filter='price']"), filterState.behuizingType);
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
        renderPriceOptions(priceContainer, qs(".filter-card[data-filter='price']"), filterState.behuizingType);
      } else if (filterState.priceLabels.size === 0) {
        input.checked = true;
      }
    } else {
      if (input.checked) {
        filterState.priceLabels.add(input.value);
      } else {
        filterState.priceLabels.delete(input.value);
      }
      if (filterState.priceLabels.size === 0) {
        renderPriceOptions(priceContainer, qs(".filter-card[data-filter='price']"), filterState.behuizingType);
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
        else {
          const allInput = container.querySelector('input[value="all"]');
          if (allInput) allInput.checked = false;
        }
      }
      applyFilters();
    });
  }

  const behuizingCard = qs(".filter-card[data-filter='behuizing']");
  const brandCard     = qs(".filter-card[data-filter='brand']");
  const gpuTierCard   = qs(".filter-card[data-filter='gpu-tier']");
  const ramCard       = qs(".filter-card[data-filter='ram']");
  const opslagCard    = qs(".filter-card[data-filter='opslag']");
  const osCard        = qs(".filter-card[data-filter='os']");
  const processorFabrikantCard = qs(".filter-card[data-filter='processor-fabrikant']");
  const functieCard = qs(".filter-card[data-filter='functies']");
  const kleurCard = qs(".filter-card[data-filter='kleur']");
  const aanbiederCard = qs(".filter-card[data-filter='aanbieder']");

  handleCheckboxSet(behuizingContainer, filterState.behuizingTypes, behuizingCard, renderBehuizingOptions);
  handleCheckboxSet(brandContainer,     filterState.brands,         brandCard,     renderBrandOptions);
  handleCheckboxSet(gpuTierContainer,   filterState.gpuTiers,       gpuTierCard,   renderGpuTierOptions);
  handleCheckboxSet(ramContainer,       filterState.ramOptions,     ramCard,       renderRamOptions,   v => parseInt(v, 10));
  handleCheckboxSet(opslagContainer,    filterState.opslagOptions,  opslagCard,    renderOpslagOptions, v => parseInt(v, 10));
  handleCheckboxSet(osContainer,        filterState.osOptions,      osCard,        renderOsOptions);
  handleCheckboxSet(processorFabrikantContainer, filterState.processorFabrikanten, processorFabrikantCard, renderProcessorFabrikantOptions);
  handleCheckboxSet(functieContainer,   filterState.functies,       functieCard,   renderFunctieOptions);
  handleCheckboxSet(kleurContainer,     filterState.kleuren,        kleurCard,     renderKleurOptions);
  handleCheckboxSet(aanbiederContainer, filterState.aanbieder,      aanbiederCard, renderAanbiederOptions);

  const clearBtn = qs("#clearFiltersBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      filterState.priceLabels.clear();
      filterState.behuizingTypes.clear();
      filterState.brands.clear();
      filterState.gpuTiers.clear();
      filterState.ramOptions.clear();
      filterState.opslagOptions.clear();
      filterState.osOptions.clear();
      filterState.processorFabrikanten.clear();
      filterState.functies.clear();
      filterState.kleuren.clear();
      filterState.aanbieder.clear();
      filterState.minAanbieders = DEFAULT_MIN_AANBIEDERS;
      renderPriceOptions(priceContainer, qs(".filter-card[data-filter='price']"), filterState.behuizingType);
      renderAllSecondary();
      applyFilters();
    });
  }
}

function initResultFilters() {
  const priceContainer    = qs("#priceFilterOptions");
  const behuizingContainer = qs("#behuizingFilterOptions");
  const brandContainer    = qs("#brandFilterOptions");
  const gpuTierContainer  = qs("#gpuTierFilterOptions");
  const ramContainer      = qs("#ramFilterOptions");
  const opslagContainer   = qs("#opslagFilterOptions");
  const osContainer       = qs("#osFilterOptions");
  const processorFabrikantContainer = qs("#processorFabrikantFilterOptions");
  const functieContainer = qs("#functiesFilterOptions");
  const kleurContainer = qs("#kleurFilterOptions");
  const aanbiederContainer = qs("#aanbiederFilterOptions");
  const minAanbiedersContainer = qs("#minAanbiedersFilterOptions");

  const priceCard     = qs(".filter-card[data-filter='price']");
  const behuizingCard = qs(".filter-card[data-filter='behuizing']");
  const brandCard     = qs(".filter-card[data-filter='brand']");
  const gpuTierCard   = qs(".filter-card[data-filter='gpu-tier']");
  const ramCard       = qs(".filter-card[data-filter='ram']");
  const opslagCard    = qs(".filter-card[data-filter='opslag']");
  const osCard        = qs(".filter-card[data-filter='os']");
  const processorFabrikantCard = qs(".filter-card[data-filter='processor-fabrikant']");
  const functieCard = qs(".filter-card[data-filter='functies']");
  const kleurCard = qs(".filter-card[data-filter='kleur']");
  const aanbiederCard = qs(".filter-card[data-filter='aanbieder']");
  const minAanbiedersCard = qs(".filter-card[data-filter='min-aanbieders']");

  if (!priceContainer || !behuizingContainer || !brandContainer || !gpuTierContainer ||
      !ramContainer || !opslagContainer || !osContainer || !processorFabrikantContainer ||
      !functieContainer || !kleurContainer ||
      !aanbiederContainer || !minAanbiedersContainer) return;
  if (!priceCard || !behuizingCard || !brandCard || !gpuTierCard ||
      !ramCard || !opslagCard || !osCard || !processorFabrikantCard ||
      !functieCard || !kleurCard || !aanbiederCard || !minAanbiedersCard) return;

  const stored      = getStoredSelection();
  const answersData = localStorage.getItem("desktop_answers");
  const scoresData  = localStorage.getItem("desktop_scores");

  if (!answersData || !scoresData) return;

  filterState.answers       = JSON.parse(answersData);
  filterState.scores        = JSON.parse(scoresData);
  filterState.bestType      = localStorage.getItem("desktop_bestType") || "";
  filterState.behuizingType = stored.behuizingType || "maakt-niet-uit";

  fetchProducts()
    .then(rawProducts => {
      const desktops = normalizeProducts(rawProducts);
      filterState.priceGroups = computeDynamicPriceGroups(desktops, filterState.behuizingType);

      const result = computeMatchForPriceGroup(desktops, filterState.behuizingType, null, filterState.answers, filterState.scores);
      filterState.baseMatches = Array.isArray(result.filteredMatchedDesktops) ? result.filteredMatchedDesktops : [];

      // Fallback: if the live computation yields nothing, seed the pool with
      // the desktops that were already matched during the quiz. This ensures
      // the filter panel always shows options regardless of whether the
      // dynamic computation succeeds.
      if (filterState.baseMatches.length === 0) {
        const storedData = localStorage.getItem("desktop_filteredMatchedDesktops");
        if (storedData) {
          try {
            const storedDesktops = JSON.parse(storedData);
            if (Array.isArray(storedDesktops) && storedDesktops.length > 0) {
              filterState.baseMatches = storedDesktops;
            }
          } catch { /* ignore */ }
        }
      }

      if (filterState.baseMatches.length === 0) return;

      // No price bucket selected by default: show every matching desktop,
      // and let the user optionally narrow by budget.
      filterState.priceLabels = new Set();

      // Vóór alle andere tellingen: bepaalt/valideert filterState.minAanbieders.
      renderMinAanbiedersOptions(minAanbiedersContainer, minAanbiedersCard);
      renderPriceOptions(priceContainer, priceCard, filterState.behuizingType);
      const matches = getSecondaryScopedMatches();
      renderBehuizingOptions(behuizingContainer, behuizingCard, matches);
      renderBrandOptions(brandContainer, brandCard, matches);
      renderGpuTierOptions(gpuTierContainer, gpuTierCard, matches);
      renderRamOptions(ramContainer, ramCard, matches);
      renderOpslagOptions(opslagContainer, opslagCard, matches);
      renderOsOptions(osContainer, osCard, matches);
      renderProcessorFabrikantOptions(processorFabrikantContainer, processorFabrikantCard, matches);
      renderFunctieOptions(functieContainer, functieCard, matches);
      renderKleurOptions(kleurContainer, kleurCard, matches);
      renderAanbiederOptions(aanbiederContainer, aanbiederCard, matches);
      initFilterEvents(priceContainer, behuizingContainer, brandContainer, gpuTierContainer, ramContainer, opslagContainer, osContainer, processorFabrikantContainer, functieContainer, kleurContainer, aanbiederContainer, minAanbiedersContainer);
      applyFilters();
    })
    .catch(() => {
      [priceCard, behuizingCard, brandCard, gpuTierCard, ramCard, opslagCard, osCard, processorFabrikantCard, functieCard, kleurCard, aanbiederCard, minAanbiedersCard]
        .forEach(card => { card.hidden = true; });
    });
}

document.addEventListener("DOMContentLoaded", initResultFilters);
