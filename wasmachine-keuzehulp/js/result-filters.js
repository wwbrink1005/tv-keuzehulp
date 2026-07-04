import { priceGroupsByCapaciteit, getWasmachineTier, capaciteitGroupToAllowedCapaciteit } from "./data.js";
import { computeMatchForPriceGroup, getIdealTierSet } from "./matching.js";
import { computeDynamicPriceGroups, getStoredSelection, normalizeProducts, parsePrice, qs } from "./utils.js";
import { updateResultMatches } from "./result.js";
import { fetchProducts } from "./supabase.js";

const filterState = {
  priceLabel:     "",
  capaciteiten:   new Set(),
  brands:         new Set(),
  typeLaders:     new Set(),
  energieLabels:  new Set(),
  centrifugeRpms: new Set(),
  aanbieder:      new Set(),
  priceMatches:   new Map(),
  answers:        null,
  scores:         null,
  bestType:       "",
  capaciteitGroup: ""
};

// Price buckets are recomputed fresh from the live-fetched catalog on every
// results page load (not trusted from the quiz-time localStorage snapshot),
// since a stale/short-lived fetch during the quiz can produce fewer or
// narrower buckets than the catalog actually supports (e.g. missing the
// most expensive bucket entirely).
function getDynamicPriceGroups(capaciteitGroup) {
  if (Array.isArray(filterState.priceGroups) && filterState.priceGroups.length > 0) {
    return filterState.priceGroups;
  }
  return priceGroupsByCapaciteit[capaciteitGroup] || [];
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

function collectCapaciteitOptions(matches) {
  const set = new Set();
  matches.forEach(w => { if (w.capaciteit) set.add(w.capaciteit); });
  return Array.from(set).sort((a, b) => a - b);
}

function collectBrandOptions(matches) {
  const set = new Set();
  matches.forEach(w => { const label = formatBrandLabel(w.merk); if (label) set.add(label); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "nl"));
}

function collectTypeLaderOptions(matches) {
  const set = new Set();
  matches.forEach(w => { if (w.typeLader) set.add(w.typeLader); });
  const order = ["Voorlader", "Bovenlader"];
  const inOrder = order.filter(t => set.has(t));
  set.forEach(t => { if (!order.includes(t)) inOrder.push(t); });
  return inOrder;
}

function collectEnergieLabelOptions(matches) {
  const set = new Set();
  matches.forEach(w => { if (w.energieLabel) set.add(w.energieLabel); });
  const order = ["A", "B", "C", "D", "E", "F", "G"];
  return order.filter(t => set.has(t));
}

function collectCentrifugeRpmOptions(matches) {
  const set = new Set();
  matches.forEach(w => { if (w.centrifugeRpm) set.add(w.centrifugeRpm); });
  return Array.from(set).sort((a, b) => a - b);
}

function collectAanbiederOptions(matches) {
  const set = new Set();
  matches.forEach(w => {
    const a = w.aanbieder;
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

function buildPriceMatches(wasmachines, capaciteitGroup) {
  const groups = getDynamicPriceGroups(capaciteitGroup);
  const map = new Map();

  // Every price bucket that has at least one matching wasmachine stays in
  // the menu, regardless of tier — users should always get the full set of
  // price options to pick from themselves.
  groups.forEach(group => {
    const result = computeMatchForPriceGroup(
      wasmachines, capaciteitGroup, group, filterState.answers, filterState.scores
    );
    const matches = Array.isArray(result.filteredMatchedWasmachines) ? result.filteredMatchedWasmachines : [];
    if (matches.length > 0) map.set(group.label, matches);
  });

  return map;
}

/**
 * Picks which price bucket should be selected by default when the user
 * didn't pick a budget in the quiz ("geen voorkeur"): the cheapest bucket
 * that still contains a wasmachine of the highest-scoring tier, ignoring
 * price entirely when judging "best match". Falls back to the cheapest
 * bucket with any match at all if no bucket has the ideal tier.
 */
function pickDefaultPriceLabel(priceMatches, scores) {
  const idealTiers = getIdealTierSet(scores);
  if (idealTiers.size > 0) {
    for (const [label, matches] of priceMatches) {
      if (matches.some(w => idealTiers.has(getWasmachineTier(w)))) return label;
    }
  }
  return priceMatches.keys().next().value ?? "";
}

function applyFilters() {
  let filtered = getActivePriceMatches();

  if (filterState.capaciteiten.size > 0) {
    filtered = filtered.filter(w => filterState.capaciteiten.has(w.capaciteit));
  }

  if (filterState.brands.size > 0) {
    filtered = filtered.filter(w => filterState.brands.has(formatBrandLabel(w.merk)));
  }

  if (filterState.typeLaders.size > 0) {
    filtered = filtered.filter(w => filterState.typeLaders.has(w.typeLader));
  }

  if (filterState.energieLabels.size > 0) {
    filtered = filtered.filter(w => filterState.energieLabels.has(w.energieLabel));
  }

  if (filterState.centrifugeRpms.size > 0) {
    filtered = filtered.filter(w => filterState.centrifugeRpms.has(w.centrifugeRpm));
  }

  if (filterState.aanbieder.size > 0) {
    filtered = filtered.filter(w => {
      const a = w.aanbieder;
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

function updateClearFiltersBtn() {
  const btn = qs("#clearFiltersBtn");
  if (!btn) return;
  const hasActive = filterState.capaciteiten.size > 0 || filterState.brands.size > 0 ||
    filterState.typeLaders.size > 0 || filterState.energieLabels.size > 0 ||
    filterState.centrifugeRpms.size > 0 || filterState.aanbieder.size > 0;
  btn.hidden = !hasActive;
}

function renderAllFilters() {
  const matches = getActivePriceMatches();

  const priceContainer      = qs("[data-filter-container='price']");
  const capaciteitContainer = qs("[data-filter-container='capaciteit']");
  const brandContainer      = qs("[data-filter-container='brand']");
  const typeLaderContainer  = qs("[data-filter-container='type-lader']");
  const energieContainer    = qs("[data-filter-container='energie-label']");
  const rpmContainer        = qs("[data-filter-container='centrifuge-rpm']");
  const aanbiederContainer  = qs("[data-filter-container='aanbieder']");

  const priceCard      = qs(".filter-card[data-filter='price']");
  const capaciteitCard  = qs(".filter-card[data-filter='capaciteit']");
  const brandCard       = qs(".filter-card[data-filter='brand']");
  const typeLaderCard   = qs(".filter-card[data-filter='type-lader']");
  const energieCard     = qs(".filter-card[data-filter='energie-label']");
  const rpmCard         = qs(".filter-card[data-filter='centrifuge-rpm']");
  const aanbiederCard   = qs(".filter-card[data-filter='aanbieder']");

  if (priceContainer && priceCard) {
    const groups = getDynamicPriceGroups(filterState.capaciteitGroup);
    // Only show price buckets that actually contain a matching wasmachine
    // for the current quiz answers — otherwise users click a bucket that
    // can never show a result.
    const labels = groups.filter(g => filterState.priceMatches.has(g.label));
    priceContainer.innerHTML = "";
    if (labels.length === 0) { priceCard.hidden = true; }
    else {
      priceCard.hidden = false;
      labels.forEach(group => {
        const label = document.createElement("label");
        label.className = "filter-option";
        const input = document.createElement("input");
        input.type = "radio";
        input.name = "priceFilter";
        input.value = group.label;
        input.checked = group.label === filterState.priceLabel;
        const text = document.createElement("span");
        text.textContent = `€ ${group.label}`;
        label.append(input, text);
        priceContainer.appendChild(label);
      });
    }
  }

  if (capaciteitContainer && capaciteitCard) {
    const capaciteiten = collectCapaciteitOptions(matches);
    renderFilterOptions(capaciteitContainer, capaciteitCard, capaciteiten, "capaciteiten", c => `${c} kg`);
    capaciteitContainer.querySelectorAll('input[type="checkbox"]').forEach(input => {
      if (input.value === "all") input.checked = filterState.capaciteiten.size === 0;
      else input.checked = filterState.capaciteiten.has(parseFloat(input.value));
    });
  }

  if (brandContainer && brandCard) {
    const brands = collectBrandOptions(matches);
    renderFilterOptions(brandContainer, brandCard, brands, "brands", null);
    brandContainer.querySelectorAll('input[type="checkbox"]').forEach(input => {
      if (input.value === "all") input.checked = filterState.brands.size === 0;
      else input.checked = filterState.brands.has(input.value);
    });
  }

  if (typeLaderContainer && typeLaderCard) {
    const typeLaders = collectTypeLaderOptions(matches);
    renderFilterOptions(typeLaderContainer, typeLaderCard, typeLaders, "typeLaders", null);
    typeLaderContainer.querySelectorAll('input[type="checkbox"]').forEach(input => {
      if (input.value === "all") input.checked = filterState.typeLaders.size === 0;
      else input.checked = filterState.typeLaders.has(input.value);
    });
  }

  if (energieContainer && energieCard) {
    const labels = collectEnergieLabelOptions(matches);
    renderFilterOptions(energieContainer, energieCard, labels, "energieLabels", l => `Label ${l}`);
    energieContainer.querySelectorAll('input[type="checkbox"]').forEach(input => {
      if (input.value === "all") input.checked = filterState.energieLabels.size === 0;
      else input.checked = filterState.energieLabels.has(input.value);
    });
  }

  if (rpmContainer && rpmCard) {
    const rpms = collectCentrifugeRpmOptions(matches);
    renderFilterOptions(rpmContainer, rpmCard, rpms, "centrifugeRpms", r => `${r} RPM`);
    rpmContainer.querySelectorAll('input[type="checkbox"]').forEach(input => {
      if (input.value === "all") input.checked = filterState.centrifugeRpms.size === 0;
      else input.checked = filterState.centrifugeRpms.has(parseInt(input.value, 10));
    });
  }

  if (aanbiederContainer && aanbiederCard) {
    const aanbieders = collectAanbiederOptions(matches);
    renderFilterOptions(aanbiederContainer, aanbiederCard, aanbieders, "aanbieder", null);
    aanbiederContainer.querySelectorAll('input[type="checkbox"]').forEach(input => {
      if (input.value === "all") input.checked = filterState.aanbieder.size === 0;
      else input.checked = filterState.aanbieder.has(input.value);
    });
  }

  updateClearFiltersBtn();
}

function handleFilterChange(event) {
  const input = event.target.closest("input");
  if (!input) return;

  const name  = input.name;
  const value = input.value;

  if (name === "priceFilter") {
    filterState.priceLabel = value;
    filterState.capaciteiten.clear();
    filterState.brands.clear();
    filterState.typeLaders.clear();
    filterState.energieLabels.clear();
    filterState.centrifugeRpms.clear();
    filterState.aanbieder.clear();
    renderAllFilters();
    applyFilters();
    return;
  }

  const setMap = {
    capaciteiten:   { set: filterState.capaciteiten,   parse: v => parseFloat(v) },
    brands:         { set: filterState.brands,         parse: v => v },
    typeLaders:     { set: filterState.typeLaders,     parse: v => v },
    energieLabels:  { set: filterState.energieLabels,  parse: v => v },
    centrifugeRpms: { set: filterState.centrifugeRpms, parse: v => parseInt(v, 10) },
    aanbieder:      { set: filterState.aanbieder,      parse: v => v }
  };

  if (!setMap[name]) return;

  const { set, parse } = setMap[name];

  if (value === "all") {
    set.clear();
  } else {
    const parsed = parse(value);
    if (input.checked) {
      set.add(parsed);
    } else {
      set.delete(parsed);
    }
  }

  renderAllFilters();
  applyFilters();
}

export async function initFilters() {
  const filtersPanel = qs("#filtersPanel");
  if (!filtersPanel) return;

  // Load state from localStorage
  const answersData          = localStorage.getItem("wasmachine_answers");
  const scoresData           = localStorage.getItem("wasmachine_scores");
  const capaciteitGroupData  = localStorage.getItem("wasmachine_selectedCapaciteitGroup");
  const priceLabelData       = localStorage.getItem("wasmachine_selectedPriceGroupLabel");
  const bestTypeData         = localStorage.getItem("wasmachine_bestType");

  filterState.answers         = answersData ? JSON.parse(answersData) : null;
  filterState.scores          = scoresData  ? JSON.parse(scoresData)  : null;
  filterState.capaciteitGroup = capaciteitGroupData ?? "";
  filterState.priceLabel      = priceLabelData ?? "";
  filterState.bestType        = bestTypeData ?? "";

  // Fetch & normalize all wasmachines
  let allWasmachines = [];
  try {
    const raw = await fetchProducts();
    allWasmachines = normalizeProducts(raw ?? []);
  } catch {
    allWasmachines = [];
  }

  // Build price match map
  filterState.priceGroups = computeDynamicPriceGroups(allWasmachines, filterState.capaciteitGroup, capaciteitGroupToAllowedCapaciteit);
  filterState.priceMatches = buildPriceMatches(allWasmachines, filterState.capaciteitGroup);

  // Safety net: if the freshly-recomputed map doesn't have the price bucket
  // the user actually picked in the quiz (e.g. a transient fetch hiccup, or
  // scores/answers not reproducing identically), fall back to the matches
  // that were already computed and stored at quiz-submit time, instead of
  // showing "no results" for a bucket that demonstrably had results.
  if (!filterState.priceMatches.has(filterState.priceLabel) && filterState.priceLabel) {
    const storedData = localStorage.getItem("wasmachine_filteredMatchedWasmachines");
    if (storedData) {
      try {
        const storedWasmachines = JSON.parse(storedData);
        if (Array.isArray(storedWasmachines) && storedWasmachines.length > 0) {
          filterState.priceMatches.set(filterState.priceLabel, storedWasmachines);
        }
      } catch { /* ignore */ }
    }
  }

  // Reset the stored label if it doesn't correspond to a real price bucket
  // for this capaciteit at all (e.g. stale data, or no price was picked
  // during the quiz) — fall back to the best-matching bucket computed from
  // the quiz answers instead. A bucket that's valid but currently has 0
  // tier-matches should stay selected, not silently reset — resetting it
  // makes the user's quiz answer disappear with no explanation.
  const validLabels = new Set(getDynamicPriceGroups(filterState.capaciteitGroup).map(g => g.label));
  if (!filterState.priceLabel || !validLabels.has(filterState.priceLabel)) {
    filterState.priceLabel = filterState.priceMatches.has(filterState.priceLabel)
      ? filterState.priceLabel
      : pickDefaultPriceLabel(filterState.priceMatches, filterState.scores);
  }

  renderAllFilters();

  // Delegate all filter changes
  filtersPanel.addEventListener("change", handleFilterChange);

  // Clear filters button
  const clearBtn = qs("#clearFiltersBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      filterState.capaciteiten.clear();
      filterState.brands.clear();
      filterState.typeLaders.clear();
      filterState.energieLabels.clear();
      filterState.centrifugeRpms.clear();
      filterState.aanbieder.clear();
      renderAllFilters();
      applyFilters();
    });
  }

  // Always use the freshly computed matches so the initial render
  // is consistent with what applyFilters() will produce later.
  applyFilters();
}
