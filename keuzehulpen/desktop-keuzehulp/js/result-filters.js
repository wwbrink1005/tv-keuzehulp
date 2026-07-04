import { priceGroupsByType } from "./data.js";
import { computeMatchForPriceGroup, getIdealTierSet } from "./matching.js";
import { computeDynamicPriceGroups, getStoredSelection, normalizeProducts, qs } from "./utils.js";
import { updateResultMatches } from "./result.js";
import { fetchProducts } from "./supabase.js";

const filterState = {
  priceLabel:    "",
  behuizingTypes: new Set(),
  brands:        new Set(),
  gpuTiers:      new Set(),
  ramOptions:    new Set(),
  opslagOptions: new Set(),
  osOptions:     new Set(),
  processorFabrikanten: new Set(),
  aanbieder:     new Set(),
  priceMatches:  new Map(),
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

function formatBrandLabel(brand) {
  const raw = String(brand ?? "").trim();
  if (!raw) return "";
  if (raw === raw.toUpperCase()) return raw;
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function getActivePriceMatches() {
  return filterState.priceMatches.get(filterState.priceLabel) || [];
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
  const sorted = Array.from(set).sort((a, b) => a - b);
  return sorted;
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

function collectAanbiederOptions(matches) {
  const set = new Set();
  matches.forEach(d => {
    const a = d.aanbieder;
    if (!a) return;
    const pCb = parseFloat(String(a.prijs_cb ?? "").replace(",", "."));
    if (a.url_cb && Number.isFinite(pCb) && pCb > 0) set.add("Coolblue");
    const pEx = parseFloat(String(a.prijs_expert ?? "").replace(",", "."));
    if (a.url_expert && Number.isFinite(pEx) && pEx > 0) set.add("Expert");
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
  // show a result.
  const relevant = groups.filter(g => filterState.priceMatches.has(g.label));
  if (relevant.length === 0) { card.hidden = true; return; }
  card.hidden = false;

  relevant.forEach(group => {
    const label = document.createElement("label");
    label.className = "filter-option";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "priceFilter";
    input.value = group.label;
    input.checked = group.label === filterState.priceLabel;
    const text = document.createElement("span");
    text.textContent = `\u20ac ${group.label}`;
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
    filterState.behuizingTypes.size > 0 ||
    filterState.brands.size > 0         ||
    filterState.gpuTiers.size > 0       ||
    filterState.ramOptions.size > 0     ||
    filterState.opslagOptions.size > 0  ||
    filterState.osOptions.size > 0      ||
    filterState.processorFabrikanten.size > 0 ||
    filterState.aanbieder.size > 0;
  btn.hidden = !hasActive;
}

function buildPriceMatches(desktops, behuizingType) {
  const groups = getDynamicPriceGroups(behuizingType);
  const map = new Map();
  const answersForFilter = { ...filterState.answers };

  // Every price bucket that has at least one matching desktop stays in the
  // menu, regardless of GPU tier — users should always get the full set of
  // price options to pick from themselves.
  groups.forEach(group => {
    const result = computeMatchForPriceGroup(
      desktops, behuizingType, group, answersForFilter, filterState.scores
    );
    const matches = result.filteredMatchedDesktops || [];
    if (matches.length > 0) map.set(group.label, matches);
  });

  return map;
}

/**
 * Picks which price bucket should be selected by default when the user
 * didn't pick a budget in the quiz ("geen voorkeur"): the cheapest bucket
 * that still contains a desktop of the highest-scoring GPU tier, ignoring
 * price entirely when judging "best match". Falls back to the cheapest
 * bucket with any match at all if no bucket has the ideal tier.
 */
function pickDefaultPriceLabel(priceMatches, scores) {
  const idealTiers = getIdealTierSet(scores);
  if (idealTiers.size > 0) {
    for (const [label, matches] of priceMatches) {
      if (matches.some(d => idealTiers.has(d.gpuTier))) return label;
    }
  }
  return priceMatches.keys().next().value ?? "";
}

function applyFilters() {
  let filtered = getActivePriceMatches();

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

  if (filterState.aanbieder.size > 0) {
    filtered = filtered.filter(d => {
      const a = d.aanbieder;
      if (!a) return false;
      if (filterState.aanbieder.has("Coolblue")) {
        const p = parseFloat(String(a.prijs_cb ?? "").replace(",", "."));
        if (a.url_cb && Number.isFinite(p) && p > 0) return true;
      }
      if (filterState.aanbieder.has("Expert")) {
        const p = parseFloat(String(a.prijs_expert ?? "").replace(",", "."));
        if (a.url_expert && Number.isFinite(p) && p > 0) return true;
      }
      return false;
    });
  }

  updateClearFiltersBtn();
  updateResultMatches(filtered, filterState.answers, filterState.bestType);
}

function renderAllSecondary(behuizingContainer, brandContainer, gpuTierContainer, ramContainer, opslagContainer, osContainer, processorFabrikantContainer, aanbiederContainer) {
  const matches = getActivePriceMatches();
  const behuizingCard   = qs(".filter-card[data-filter='behuizing']");
  const brandCard       = qs(".filter-card[data-filter='brand']");
  const gpuTierCard     = qs(".filter-card[data-filter='gpu-tier']");
  const ramCard         = qs(".filter-card[data-filter='ram']");
  const opslagCard      = qs(".filter-card[data-filter='opslag']");
  const osCard          = qs(".filter-card[data-filter='os']");
  const processorFabrikantCard = qs(".filter-card[data-filter='processor-fabrikant']");
  const aanbiederCard   = qs(".filter-card[data-filter='aanbieder']");

  renderBehuizingOptions(behuizingContainer, behuizingCard, matches);
  renderBrandOptions(brandContainer, brandCard, matches);
  renderGpuTierOptions(gpuTierContainer, gpuTierCard, matches);
  renderRamOptions(ramContainer, ramCard, matches);
  renderOpslagOptions(opslagContainer, opslagCard, matches);
  renderOsOptions(osContainer, osCard, matches);
  renderProcessorFabrikantOptions(processorFabrikantContainer, processorFabrikantCard, matches);
  renderAanbiederOptions(aanbiederContainer, aanbiederCard, matches);
}

function initFilterEvents(priceContainer, behuizingContainer, brandContainer, gpuTierContainer, ramContainer, opslagContainer, osContainer, processorFabrikantContainer, aanbiederContainer) {
  function renderAll() {
    renderAllSecondary(behuizingContainer, brandContainer, gpuTierContainer, ramContainer, opslagContainer, osContainer, processorFabrikantContainer, aanbiederContainer);
  }

  priceContainer.addEventListener("change", event => {
    const input = event.target.closest("input[type=radio]");
    if (!input) return;
    filterState.priceLabel = input.value;
    filterState.behuizingTypes.clear();
    filterState.brands.clear();
    filterState.gpuTiers.clear();
    filterState.ramOptions.clear();
    filterState.opslagOptions.clear();
    filterState.osOptions.clear();
    filterState.processorFabrikanten.clear();
    filterState.aanbieder.clear();
    renderAll();
    applyFilters();
  });

  function handleCheckboxSet(container, stateSet, card, renderFn, valueFn = v => v) {
    container.addEventListener("change", event => {
      const input = event.target.closest("input[type=checkbox]");
      if (!input) return;
      if (input.value === "all") {
        if (input.checked) { stateSet.clear(); renderFn(container, card, getActivePriceMatches()); }
        else if (stateSet.size === 0) { input.checked = true; }
      } else {
        const val = valueFn(input.value);
        if (input.checked) stateSet.add(val);
        else stateSet.delete(val);
        if (stateSet.size === 0) renderFn(container, card, getActivePriceMatches());
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
  const aanbiederCard = qs(".filter-card[data-filter='aanbieder']");

  handleCheckboxSet(behuizingContainer, filterState.behuizingTypes, behuizingCard, renderBehuizingOptions);
  handleCheckboxSet(brandContainer,     filterState.brands,         brandCard,     renderBrandOptions);
  handleCheckboxSet(gpuTierContainer,   filterState.gpuTiers,       gpuTierCard,   renderGpuTierOptions);
  handleCheckboxSet(ramContainer,       filterState.ramOptions,     ramCard,       renderRamOptions,   v => parseInt(v, 10));
  handleCheckboxSet(opslagContainer,    filterState.opslagOptions,  opslagCard,    renderOpslagOptions, v => parseInt(v, 10));
  handleCheckboxSet(osContainer,        filterState.osOptions,      osCard,        renderOsOptions);
  handleCheckboxSet(processorFabrikantContainer, filterState.processorFabrikanten, processorFabrikantCard, renderProcessorFabrikantOptions);
  handleCheckboxSet(aanbiederContainer, filterState.aanbieder,      aanbiederCard, renderAanbiederOptions);

  const clearBtn = qs("#clearFiltersBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      filterState.behuizingTypes.clear();
      filterState.brands.clear();
      filterState.gpuTiers.clear();
      filterState.ramOptions.clear();
      filterState.opslagOptions.clear();
      filterState.osOptions.clear();
      filterState.processorFabrikanten.clear();
      filterState.aanbieder.clear();
      renderAll();
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
  const aanbiederContainer = qs("#aanbiederFilterOptions");

  const priceCard     = qs(".filter-card[data-filter='price']");
  const behuizingCard = qs(".filter-card[data-filter='behuizing']");
  const brandCard     = qs(".filter-card[data-filter='brand']");
  const gpuTierCard   = qs(".filter-card[data-filter='gpu-tier']");
  const ramCard       = qs(".filter-card[data-filter='ram']");
  const opslagCard    = qs(".filter-card[data-filter='opslag']");
  const osCard        = qs(".filter-card[data-filter='os']");
  const processorFabrikantCard = qs(".filter-card[data-filter='processor-fabrikant']");
  const aanbiederCard = qs(".filter-card[data-filter='aanbieder']");

  if (!priceContainer || !behuizingContainer || !brandContainer || !gpuTierContainer ||
      !ramContainer || !opslagContainer || !osContainer || !processorFabrikantContainer ||
      !aanbiederContainer) return;
  if (!priceCard || !behuizingCard || !brandCard || !gpuTierCard ||
      !ramCard || !opslagCard || !osCard || !processorFabrikantCard || !aanbiederCard) return;

  const stored      = getStoredSelection();
  const answersData = localStorage.getItem("desktop_answers");
  const scoresData  = localStorage.getItem("desktop_scores");

  if (!answersData || !scoresData) return;

  filterState.answers       = JSON.parse(answersData);
  filterState.scores        = JSON.parse(scoresData);
  filterState.bestType      = localStorage.getItem("desktop_bestType") || "";
  filterState.behuizingType = stored.behuizingType || "maakt-niet-uit";

  const selectedPriceLabel = stored.priceLabel || "";

  fetchProducts()
    .then(rawProducts => {
      const desktops = normalizeProducts(rawProducts);
      filterState.priceGroups = computeDynamicPriceGroups(desktops, filterState.behuizingType);
      filterState.priceMatches = buildPriceMatches(desktops, filterState.behuizingType);

      // Seed from stored results if computed map is empty for selected label
      if (!filterState.priceMatches.has(selectedPriceLabel) && selectedPriceLabel) {
        const storedData = localStorage.getItem("desktop_filteredMatchedDesktops");
        if (storedData) {
          try {
            const storedDesktops = JSON.parse(storedData);
            if (Array.isArray(storedDesktops) && storedDesktops.length > 0) {
              filterState.priceMatches.set(selectedPriceLabel, storedDesktops);
            }
          } catch { /* ignore */ }
        }
      }

      const availableLabels = Array.from(filterState.priceMatches.keys());
      if (availableLabels.length === 0) return;

      filterState.priceLabel = filterState.priceMatches.has(selectedPriceLabel)
        ? selectedPriceLabel
        : pickDefaultPriceLabel(filterState.priceMatches, filterState.scores);

      const matches = getActivePriceMatches();
      renderPriceOptions(priceContainer, priceCard, filterState.behuizingType);
      renderBehuizingOptions(behuizingContainer, behuizingCard, matches);
      renderBrandOptions(brandContainer, brandCard, matches);
      renderGpuTierOptions(gpuTierContainer, gpuTierCard, matches);
      renderRamOptions(ramContainer, ramCard, matches);
      renderOpslagOptions(opslagContainer, opslagCard, matches);
      renderOsOptions(osContainer, osCard, matches);
      renderProcessorFabrikantOptions(processorFabrikantContainer, processorFabrikantCard, matches);
      renderAanbiederOptions(aanbiederContainer, aanbiederCard, matches);
      initFilterEvents(priceContainer, behuizingContainer, brandContainer, gpuTierContainer, ramContainer, opslagContainer, osContainer, processorFabrikantContainer, aanbiederContainer);
      applyFilters();
    })
    .catch(() => {
      [priceCard, behuizingCard, brandCard, gpuTierCard, ramCard, opslagCard, osCard, processorFabrikantCard, aanbiederCard]
        .forEach(card => { card.hidden = true; });
    });
}

document.addEventListener("DOMContentLoaded", initResultFilters);
