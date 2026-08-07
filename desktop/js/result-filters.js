import { priceGroupsByType } from "./data.js";
import { computeMatchForPriceGroup } from "./matching.js";
import { computeDynamicPriceGroups, getStoredSelection, normalizeProducts, parsePrice, qs } from "./utils.js";
import { updateResultMatches } from "./result.js";
import { fetchProducts } from "./supabase.js";

const filterState = {
  priceLabels:   new Set(),
  behuizingTypes: new Set(),
  brands:        new Set(),
  gpuTiers:      new Set(),
  ramOptions:    new Set(),
  opslagOptions: new Set(),
  osOptions:     new Set(),
  processorFabrikanten: new Set(),
  rgb:           new Set(),
  waterkoeling:  new Set(),
  kleuren:       new Set(),
  aanbieder:     new Set(),
  baseMatches:   [],
  answers:       null,
  scores:        null,
  bestType:      "",
  behuizingType: ""
};

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

function collectRgbOptions(matches) {
  const set = new Set();
  matches.forEach(d => { if (d.rgb) set.add(d.rgb); });
  const order = ["Ja", "Nee"];
  return order.filter(t => set.has(t));
}

function collectWaterkoelingOptions(matches) {
  const set = new Set();
  matches.forEach(d => { if (d.waterkoeling) set.add(d.waterkoeling); });
  const order = ["Ja", "Nee"];
  return order.filter(t => set.has(t));
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

function renderFilterOptions(container, card, items, filterName, labelFn) {
  container.innerHTML = "";
  if (items.length === 0) { card.hidden = true; return; }
  card.hidden = false;

  const stateSet = filterState[filterName];
  const isAllSelected = !stateSet || stateSet.size === 0;

  const allLabel = document.createElement("label");
  allLabel.className = "filter-option";
  const allInput = document.createElement("input");
  allInput.type = "checkbox";
  allInput.name = filterName;
  allInput.value = "all";
  allInput.checked = isAllSelected;
  const allText = document.createElement("span");
  allText.textContent = "Alle";
  allLabel.append(allInput, allText);
  container.appendChild(allLabel);

  items.forEach(item => {
    const label = document.createElement("label");
    label.className = "filter-option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = filterName;
    input.value = String(item);
    input.checked = stateSet?.has(item) ?? false;
    const text = document.createElement("span");
    text.textContent = labelFn ? labelFn(item) : String(item);
    label.append(input, text);
    container.appendChild(label);
  });
}

function renderPriceOptions(container, card, behuizingType) {
  const groups = getDynamicPriceGroups(behuizingType);
  container.innerHTML = "";

  // Only show price buckets that actually contain a matching desktop for the
  // current quiz answers — otherwise users click a bucket that can never
  // show a result. If there's only one (or zero) non-empty bucket there's
  // nothing meaningful to narrow, so hide the whole filter card.
  const base = getBaseMatches();
  const relevant = groups.filter(g => base.some(d => {
    const price = parsePrice(d.prijs);
    return price >= g.min && price <= g.max;
  }));

  if (relevant.length <= 1) { card.hidden = true; return; }
  card.hidden = false;

  const isAllSelected = filterState.priceLabels.size === 0;
  const allLabel = document.createElement("label");
  allLabel.className = "filter-option";
  const allInput = document.createElement("input");
  allInput.type = "checkbox";
  allInput.name = "priceFilter";
  allInput.value = "all";
  allInput.checked = isAllSelected;
  const allText = document.createElement("span");
  allText.textContent = "Alle prijzen";
  allLabel.append(allInput, allText);
  container.appendChild(allLabel);

  relevant.forEach(group => {
    const label = document.createElement("label");
    label.className = "filter-option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "priceFilter";
    input.value = group.label;
    input.checked = filterState.priceLabels.has(group.label);
    const text = document.createElement("span");
    text.textContent = `€ ${group.label}`;
    label.append(input, text);
    container.appendChild(label);
  });
}

function renderBehuizingOptions(container, card, matches) {
  const types = collectBehuizingOptions(matches);
  renderFilterOptions(container, card, types, "behuizingTypes", null);
  container.querySelectorAll("input[type=checkbox]").forEach(input => {
    if (input.value === "all") input.checked = filterState.behuizingTypes.size === 0;
    else input.checked = filterState.behuizingTypes.has(input.value);
  });
}

function renderBrandOptions(container, card, matches) {
  const brands = collectBrandOptions(matches);
  renderFilterOptions(container, card, brands, "brands", null);
  container.querySelectorAll("input[type=checkbox]").forEach(input => {
    if (input.value === "all") input.checked = filterState.brands.size === 0;
    else input.checked = filterState.brands.has(input.value);
  });
}

function renderGpuTierOptions(container, card, matches) {
  const tiers = collectGpuTierOptions(matches);
  renderFilterOptions(container, card, tiers, "gpuTiers", null);
  container.querySelectorAll("input[type=checkbox]").forEach(input => {
    if (input.value === "all") input.checked = filterState.gpuTiers.size === 0;
    else input.checked = filterState.gpuTiers.has(input.value);
  });
}

function renderRamOptions(container, card, matches) {
  const rams = collectRamOptions(matches);
  renderFilterOptions(container, card, rams, "ramOptions", r => `${r} GB`);
  container.querySelectorAll("input[type=checkbox]").forEach(input => {
    if (input.value === "all") input.checked = filterState.ramOptions.size === 0;
    else input.checked = filterState.ramOptions.has(parseInt(input.value, 10));
  });
}

function formatOpslagLabel(gb) {
  if (gb >= 1024) {
    const tb = gb / 1024;
    return `${Number.isInteger(tb) ? tb : tb.toFixed(1)} TB`;
  }
  return `${gb} GB`;
}

function renderOpslagOptions(container, card, matches) {
  const opts = collectOpslagOptions(matches);
  renderFilterOptions(container, card, opts, "opslagOptions", formatOpslagLabel);
  container.querySelectorAll("input[type=checkbox]").forEach(input => {
    if (input.value === "all") input.checked = filterState.opslagOptions.size === 0;
    else input.checked = filterState.opslagOptions.has(parseInt(input.value, 10));
  });
}

function renderOsOptions(container, card, matches) {
  const options = collectOsOptions(matches);
  renderFilterOptions(container, card, options, "osOptions", null);
  container.querySelectorAll("input[type=checkbox]").forEach(input => {
    if (input.value === "all") input.checked = filterState.osOptions.size === 0;
    else input.checked = filterState.osOptions.has(input.value);
  });
}

function renderProcessorFabrikantOptions(container, card, matches) {
  const options = collectProcessorFabrikantOptions(matches);
  renderFilterOptions(container, card, options, "processorFabrikanten", null);
  container.querySelectorAll("input[type=checkbox]").forEach(input => {
    if (input.value === "all") input.checked = filterState.processorFabrikanten.size === 0;
    else input.checked = filterState.processorFabrikanten.has(input.value);
  });
}

function renderRgbOptions(container, card, matches) {
  const options = collectRgbOptions(matches);
  renderFilterOptions(container, card, options, "rgb", null);
  container.querySelectorAll("input[type=checkbox]").forEach(input => {
    if (input.value === "all") input.checked = filterState.rgb.size === 0;
    else input.checked = filterState.rgb.has(input.value);
  });
}

function renderWaterkoelingOptions(container, card, matches) {
  const options = collectWaterkoelingOptions(matches);
  renderFilterOptions(container, card, options, "waterkoeling", null);
  container.querySelectorAll("input[type=checkbox]").forEach(input => {
    if (input.value === "all") input.checked = filterState.waterkoeling.size === 0;
    else input.checked = filterState.waterkoeling.has(input.value);
  });
}

function renderKleurOptions(container, card, matches) {
  const options = collectKleurOptions(matches);
  renderFilterOptions(container, card, options, "kleuren", null);
  container.querySelectorAll("input[type=checkbox]").forEach(input => {
    if (input.value === "all") input.checked = filterState.kleuren.size === 0;
    else input.checked = filterState.kleuren.has(input.value);
  });
}

function renderAanbiederOptions(container, card, matches) {
  const aanbieders = collectAanbiederOptions(matches);
  renderFilterOptions(container, card, aanbieders, "aanbieder", null);
  container.querySelectorAll("input[type=checkbox]").forEach(input => {
    if (input.value === "all") input.checked = filterState.aanbieder.size === 0;
    else input.checked = filterState.aanbieder.has(input.value);
  });
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
    filterState.rgb.size > 0 ||
    filterState.waterkoeling.size > 0 ||
    filterState.kleuren.size > 0 ||
    filterState.aanbieder.size > 0;
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

  if (filterState.rgb.size > 0) {
    filtered = filtered.filter(d => filterState.rgb.has(d.rgb));
  }

  if (filterState.waterkoeling.size > 0) {
    filtered = filtered.filter(d => filterState.waterkoeling.has(d.waterkoeling));
  }

  if (filterState.kleuren.size > 0) {
    filtered = filtered.filter(d => filterState.kleuren.has(d.kleur));
  }

  if (filterState.aanbieder.size > 0) {
    filtered = filtered.filter(d =>
      (d.aanbieders ?? []).some(a => filterState.aanbieder.has(a.winkel))
    );
  }

  updateClearFiltersBtn();
  updateResultMatches(filtered, filterState.answers, filterState.bestType);
}

function initFilterEvents(priceContainer, behuizingContainer, brandContainer, gpuTierContainer, ramContainer, opslagContainer, osContainer, processorFabrikantContainer, rgbContainer, waterkoelingContainer, kleurContainer, aanbiederContainer) {
  function renderAllSecondary() {
    const matches = getPriceScopedMatches();
    renderBehuizingOptions(behuizingContainer, qs(".filter-card[data-filter='behuizing']"), matches);
    renderBrandOptions(brandContainer, qs(".filter-card[data-filter='brand']"), matches);
    renderGpuTierOptions(gpuTierContainer, qs(".filter-card[data-filter='gpu-tier']"), matches);
    renderRamOptions(ramContainer, qs(".filter-card[data-filter='ram']"), matches);
    renderOpslagOptions(opslagContainer, qs(".filter-card[data-filter='opslag']"), matches);
    renderOsOptions(osContainer, qs(".filter-card[data-filter='os']"), matches);
    renderProcessorFabrikantOptions(processorFabrikantContainer, qs(".filter-card[data-filter='processor-fabrikant']"), matches);
    renderRgbOptions(rgbContainer, qs(".filter-card[data-filter='rgb']"), matches);
    renderWaterkoelingOptions(waterkoelingContainer, qs(".filter-card[data-filter='waterkoeling']"), matches);
    renderKleurOptions(kleurContainer, qs(".filter-card[data-filter='kleur']"), matches);
    renderAanbiederOptions(aanbiederContainer, qs(".filter-card[data-filter='aanbieder']"), matches);
  }

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

    renderAllSecondary();
    applyFilters();
  });

  function handleCheckboxSet(container, stateSet, card, renderFn, valueFn = v => v, exclusive = false) {
    container.addEventListener("change", event => {
      const input = event.target.closest("input[type=checkbox]");
      if (!input) return;
      if (input.value === "all") {
        if (input.checked) { stateSet.clear(); renderFn(container, card, getPriceScopedMatches()); }
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
        if (stateSet.size === 0) renderFn(container, card, getPriceScopedMatches());
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
  const rgbCard = qs(".filter-card[data-filter='rgb']");
  const waterkoelingCard = qs(".filter-card[data-filter='waterkoeling']");
  const kleurCard = qs(".filter-card[data-filter='kleur']");
  const aanbiederCard = qs(".filter-card[data-filter='aanbieder']");

  handleCheckboxSet(behuizingContainer, filterState.behuizingTypes, behuizingCard, renderBehuizingOptions);
  handleCheckboxSet(brandContainer,     filterState.brands,         brandCard,     renderBrandOptions);
  handleCheckboxSet(gpuTierContainer,   filterState.gpuTiers,       gpuTierCard,   renderGpuTierOptions);
  handleCheckboxSet(ramContainer,       filterState.ramOptions,     ramCard,       renderRamOptions,   v => parseInt(v, 10));
  handleCheckboxSet(opslagContainer,    filterState.opslagOptions,  opslagCard,    renderOpslagOptions, v => parseInt(v, 10));
  handleCheckboxSet(osContainer,        filterState.osOptions,      osCard,        renderOsOptions);
  handleCheckboxSet(processorFabrikantContainer, filterState.processorFabrikanten, processorFabrikantCard, renderProcessorFabrikantOptions);
  handleCheckboxSet(rgbContainer,       filterState.rgb,            rgbCard,       renderRgbOptions,       v => v, true);
  handleCheckboxSet(waterkoelingContainer, filterState.waterkoeling, waterkoelingCard, renderWaterkoelingOptions, v => v, true);
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
      filterState.rgb.clear();
      filterState.waterkoeling.clear();
      filterState.kleuren.clear();
      filterState.aanbieder.clear();
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
  const rgbContainer = qs("#rgbFilterOptions");
  const waterkoelingContainer = qs("#waterkoelingFilterOptions");
  const kleurContainer = qs("#kleurFilterOptions");
  const aanbiederContainer = qs("#aanbiederFilterOptions");

  const priceCard     = qs(".filter-card[data-filter='price']");
  const behuizingCard = qs(".filter-card[data-filter='behuizing']");
  const brandCard     = qs(".filter-card[data-filter='brand']");
  const gpuTierCard   = qs(".filter-card[data-filter='gpu-tier']");
  const ramCard       = qs(".filter-card[data-filter='ram']");
  const opslagCard    = qs(".filter-card[data-filter='opslag']");
  const osCard        = qs(".filter-card[data-filter='os']");
  const processorFabrikantCard = qs(".filter-card[data-filter='processor-fabrikant']");
  const rgbCard = qs(".filter-card[data-filter='rgb']");
  const waterkoelingCard = qs(".filter-card[data-filter='waterkoeling']");
  const kleurCard = qs(".filter-card[data-filter='kleur']");
  const aanbiederCard = qs(".filter-card[data-filter='aanbieder']");

  if (!priceContainer || !behuizingContainer || !brandContainer || !gpuTierContainer ||
      !ramContainer || !opslagContainer || !osContainer || !processorFabrikantContainer ||
      !rgbContainer || !waterkoelingContainer || !kleurContainer ||
      !aanbiederContainer) return;
  if (!priceCard || !behuizingCard || !brandCard || !gpuTierCard ||
      !ramCard || !opslagCard || !osCard || !processorFabrikantCard ||
      !rgbCard || !waterkoelingCard || !kleurCard || !aanbiederCard) return;

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

      const matches = getPriceScopedMatches();
      renderPriceOptions(priceContainer, priceCard, filterState.behuizingType);
      renderBehuizingOptions(behuizingContainer, behuizingCard, matches);
      renderBrandOptions(brandContainer, brandCard, matches);
      renderGpuTierOptions(gpuTierContainer, gpuTierCard, matches);
      renderRamOptions(ramContainer, ramCard, matches);
      renderOpslagOptions(opslagContainer, opslagCard, matches);
      renderOsOptions(osContainer, osCard, matches);
      renderProcessorFabrikantOptions(processorFabrikantContainer, processorFabrikantCard, matches);
      renderRgbOptions(rgbContainer, rgbCard, matches);
      renderWaterkoelingOptions(waterkoelingContainer, waterkoelingCard, matches);
      renderKleurOptions(kleurContainer, kleurCard, matches);
      renderAanbiederOptions(aanbiederContainer, aanbiederCard, matches);
      initFilterEvents(priceContainer, behuizingContainer, brandContainer, gpuTierContainer, ramContainer, opslagContainer, osContainer, processorFabrikantContainer, rgbContainer, waterkoelingContainer, kleurContainer, aanbiederContainer);
      applyFilters();
    })
    .catch(() => {
      [priceCard, behuizingCard, brandCard, gpuTierCard, ramCard, opslagCard, osCard, processorFabrikantCard, rgbCard, waterkoelingCard, kleurCard, aanbiederCard]
        .forEach(card => { card.hidden = true; });
    });
}

document.addEventListener("DOMContentLoaded", initResultFilters);
