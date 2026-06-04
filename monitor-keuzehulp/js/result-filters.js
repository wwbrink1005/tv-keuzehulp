import { priceGroupsBySize } from "./data.js";
import { computeMatchForPriceGroup, getIdealTierSet } from "./matching.js";
import { getStoredSelection, normalizeProducts, parsePrice, qs } from "./utils.js";
import { updateResultMatches } from "./result.js";
import { fetchProducts } from "./supabase.js";

const filterState = {
  priceLabel:   "",
  sizes:        new Set(),
  brands:       new Set(),
  panelTypes:   new Set(),
  resolutions:  new Set(),
  hzOptions:    new Set(),
  aanbieder:    new Set(),
  priceMatches: new Map(),
  answers:      null,
  scores:       null,
  bestType:     "",
  sizeGroup:    ""
};

function getDynamicPriceGroups(sizeGroup) {
  const stored = localStorage.getItem("monitor_dynamicPriceGroups");
  if (stored) {
    try {
      const groups = JSON.parse(stored);
      if (Array.isArray(groups) && groups.length > 0) return groups;
    } catch { /* fall through */ }
  }
  return priceGroupsBySize[sizeGroup] || [];
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

function collectSizeOptions(matches) {
  const set = new Set();
  matches.forEach(m => { if (m.schermdiagonaal) set.add(m.schermdiagonaal); });
  return Array.from(set).sort((a, b) => a - b);
}

function collectBrandOptions(matches) {
  const set = new Set();
  matches.forEach(m => { const label = formatBrandLabel(m.merk); if (label) set.add(label); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "nl"));
}

function collectPanelTypeOptions(matches) {
  const set = new Set();
  matches.forEach(m => { if (m.paneeltype) set.add(m.paneeltype); });
  const order = ["IPS", "OLED", "VA", "TN"];
  const inOrder = order.filter(t => set.has(t));
  set.forEach(t => { if (!order.includes(t)) inOrder.push(t); });
  return inOrder;
}

function collectResolutionOptions(matches) {
  const set = new Set();
  matches.forEach(m => { if (m.resolutie) set.add(m.resolutie); });
  const order = ["Full HD", "QHD", "UWFHD", "UWQHD", "4K", "WUXGA"];
  const inOrder = order.filter(t => set.has(t));
  set.forEach(t => { if (!order.includes(t)) inOrder.push(t); });
  return inOrder;
}

function collectHzOptions(matches) {
  const set = new Set();
  matches.forEach(m => { if (m.hz) set.add(m.hz); });
  return Array.from(set).sort((a, b) => a - b);
}

function collectAanbiederOptions(matches) {
  const set = new Set();
  matches.forEach(m => {
    const a = m.aanbieder;
    if (!a) return;
    const pCb = parseFloat(String(a.prijs_cb ?? "").replace(",", "."));
    if (a.url_cb && Number.isFinite(pCb) && pCb > 0) set.add("Coolblue");
    const pEx = parseFloat(String(a.prijs_expert ?? "").replace(",", "."));
    if (a.url_expert && Number.isFinite(pEx) && pEx > 0) set.add("Expert");
  });
  return Array.from(set).sort();
}

function renderFilterOptions(container, card, items, filterName, labelFn, isRadio = false) {
  container.innerHTML = "";
  if (items.length === 0) { card.hidden = true; return; }
  card.hidden = false;

  const stateSet = filterState[filterName];

  if (!isRadio) {
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
  }

  items.forEach(item => {
    const label = document.createElement("label");
    label.className = "filter-option";
    const input = document.createElement("input");
    input.type = isRadio ? "radio" : "checkbox";
    input.name = filterName;
    input.value = String(item);
    input.checked = isRadio
      ? String(item) === filterState.priceLabel
      : (stateSet?.has(item) ?? false);
    const text = document.createElement("span");
    text.textContent = labelFn ? labelFn(item) : String(item);
    label.append(input, text);
    container.appendChild(label);
  });
}

function buildPriceMatches(monitors, sizeGroup) {
  const groups = getDynamicPriceGroups(sizeGroup);
  const map = new Map();

  // Always add a no-price-filter entry ("") so "geen voorkeur" stays consistent
  const allResult = computeMatchForPriceGroup(
    monitors, sizeGroup, null, filterState.answers, filterState.scores
  );
  const allMatches = Array.isArray(allResult.filteredMatchedMonitors) ? allResult.filteredMatchedMonitors : [];
  if (allMatches.length > 0) map.set("", allMatches);

  groups.forEach(group => {
    const result = computeMatchForPriceGroup(
      monitors, sizeGroup, group, filterState.answers, filterState.scores
    );
    const matches = Array.isArray(result.filteredMatchedMonitors) ? result.filteredMatchedMonitors : [];
    if (matches.length > 0) map.set(group.label, matches);
  });

  return map;
}

function applyFilters() {
  let filtered = getActivePriceMatches();

  if (filterState.sizes.size > 0) {
    filtered = filtered.filter(m => filterState.sizes.has(m.schermdiagonaal));
  }

  if (filterState.brands.size > 0) {
    filtered = filtered.filter(m => filterState.brands.has(formatBrandLabel(m.merk)));
  }

  if (filterState.panelTypes.size > 0) {
    filtered = filtered.filter(m => filterState.panelTypes.has(m.paneeltype));
  }

  if (filterState.resolutions.size > 0) {
    filtered = filtered.filter(m => filterState.resolutions.has(m.resolutie));
  }

  if (filterState.hzOptions.size > 0) {
    filtered = filtered.filter(m => filterState.hzOptions.has(m.hz));
  }

  if (filterState.aanbieder.size > 0) {
    filtered = filtered.filter(m => {
      const a = m.aanbieder;
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
  const hasActive = filterState.sizes.size > 0 || filterState.brands.size > 0 ||
    filterState.panelTypes.size > 0 || filterState.resolutions.size > 0 ||
    filterState.hzOptions.size > 0 || filterState.aanbieder.size > 0;
  btn.hidden = !hasActive;
}

function renderAllFilters(monitors) {
  const matches = getActivePriceMatches();

  const priceContainer    = qs("[data-filter-container='price']");
  const sizeContainer     = qs("[data-filter-container='size']");
  const brandContainer    = qs("[data-filter-container='brand']");
  const panelContainer    = qs("[data-filter-container='panel']");
  const resContainer      = qs("[data-filter-container='resolution']");
  const hzContainer       = qs("[data-filter-container='hz']");
  const aanbiederContainer = qs("[data-filter-container='aanbieder']");

  const priceCard     = qs(".filter-card[data-filter='price']");
  const sizeCard      = qs(".filter-card[data-filter='size']");
  const brandCard     = qs(".filter-card[data-filter='brand']");
  const panelCard     = qs(".filter-card[data-filter='panel']");
  const resCard       = qs(".filter-card[data-filter='resolution']");
  const hzCard        = qs(".filter-card[data-filter='hz']");
  const aanbiederCard = qs(".filter-card[data-filter='aanbieder']");

  if (priceContainer && priceCard) {
    const groups = getDynamicPriceGroups(filterState.sizeGroup);
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

  if (sizeContainer && sizeCard) {
    const sizes = collectSizeOptions(matches);
    renderFilterOptions(sizeContainer, sizeCard, sizes, "sizes", s => `${s}"`, false);
    sizeContainer.querySelectorAll('input[type="checkbox"]').forEach(input => {
      if (input.value === "all") input.checked = filterState.sizes.size === 0;
      else input.checked = filterState.sizes.has(parseFloat(input.value));
    });
  }

  if (brandContainer && brandCard) {
    const brands = collectBrandOptions(matches);
    renderFilterOptions(brandContainer, brandCard, brands, "brands", null, false);
    brandContainer.querySelectorAll('input[type="checkbox"]').forEach(input => {
      if (input.value === "all") input.checked = filterState.brands.size === 0;
      else input.checked = filterState.brands.has(input.value);
    });
  }

  if (panelContainer && panelCard) {
    const panels = collectPanelTypeOptions(matches);
    renderFilterOptions(panelContainer, panelCard, panels, "panelTypes", null, false);
    panelContainer.querySelectorAll('input[type="checkbox"]').forEach(input => {
      if (input.value === "all") input.checked = filterState.panelTypes.size === 0;
      else input.checked = filterState.panelTypes.has(input.value);
    });
  }

  if (resContainer && resCard) {
    const resolutions = collectResolutionOptions(matches);
    renderFilterOptions(resContainer, resCard, resolutions, "resolutions", null, false);
    resContainer.querySelectorAll('input[type="checkbox"]').forEach(input => {
      if (input.value === "all") input.checked = filterState.resolutions.size === 0;
      else input.checked = filterState.resolutions.has(input.value);
    });
  }

  if (hzContainer && hzCard) {
    const hzOpts = collectHzOptions(matches);
    renderFilterOptions(hzContainer, hzCard, hzOpts, "hzOptions", hz => `${hz}Hz`, false);
    hzContainer.querySelectorAll('input[type="checkbox"]').forEach(input => {
      if (input.value === "all") input.checked = filterState.hzOptions.size === 0;
      else input.checked = filterState.hzOptions.has(parseInt(input.value, 10));
    });
  }

  if (aanbiederContainer && aanbiederCard) {
    const aanbieders = collectAanbiederOptions(matches);
    renderFilterOptions(aanbiederContainer, aanbiederCard, aanbieders, "aanbieder", null, false);
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
    filterState.sizes.clear();
    filterState.brands.clear();
    filterState.panelTypes.clear();
    filterState.resolutions.clear();
    filterState.hzOptions.clear();
    filterState.aanbieder.clear();
    renderAllFilters();
    applyFilters();
    return;
  }

  const setMap = {
    sizes:       { set: filterState.sizes,      parse: v => parseFloat(v) },
    brands:      { set: filterState.brands,      parse: v => v },
    panelTypes:  { set: filterState.panelTypes,  parse: v => v },
    resolutions: { set: filterState.resolutions, parse: v => v },
    hzOptions:   { set: filterState.hzOptions,   parse: v => parseInt(v, 10) },
    aanbieder:   { set: filterState.aanbieder,   parse: v => v }
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
  const answersData     = localStorage.getItem("monitor_answers");
  const scoresData      = localStorage.getItem("monitor_scores");
  const sizeGroupData   = localStorage.getItem("monitor_selectedSizeGroup");
  const priceLabelData  = localStorage.getItem("monitor_selectedPriceGroupLabel");
  const bestTypeData    = localStorage.getItem("monitor_bestType");

  filterState.answers   = answersData  ? JSON.parse(answersData)  : null;
  filterState.scores    = scoresData   ? JSON.parse(scoresData)   : null;
  filterState.sizeGroup = sizeGroupData ?? "";
  filterState.priceLabel = priceLabelData ?? "";
  filterState.bestType  = bestTypeData ?? "";

  // Fetch & normalize all monitors
  let allMonitors = [];
  try {
    const raw = await fetchProducts();
    allMonitors = normalizeProducts(raw ?? []);
  } catch {
    allMonitors = [];
  }

  // Build price match map
  filterState.priceMatches = buildPriceMatches(allMonitors, filterState.sizeGroup);

  // If stored label isn't in the map, fall back to "" (all prices) or the first bucket
  if (!filterState.priceMatches.has(filterState.priceLabel)) {
    filterState.priceLabel = filterState.priceMatches.has("") ? "" :
      (filterState.priceMatches.keys().next().value ?? "");
  }

  renderAllFilters(allMonitors);

  // Delegate all filter changes
  filtersPanel.addEventListener("change", handleFilterChange);

  // Clear filters button
  const clearBtn = qs("#clearFiltersBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      filterState.sizes.clear();
      filterState.brands.clear();
      filterState.panelTypes.clear();
      filterState.resolutions.clear();
      filterState.hzOptions.clear();
      filterState.aanbieder.clear();
      renderAllFilters(allMonitors);
      applyFilters();
    });
  }

  // Always use the freshly computed matches so the initial render
  // is consistent with what applyFilters() will produce later.
  applyFilters();
}
