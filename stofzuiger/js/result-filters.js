import { matchStofzuigers, applyMinAanbiedersCascade, DEFAULT_MIN_AANBIEDERS } from "./matching.js";
import { computeDynamicPriceGroups, computeDynamicWeightGroups, normalizeProducts, parsePrice, qs } from "./utils.js";
import { updateResultMatches } from "./result.js";
import { fetchProducts } from "./supabase.js";
import { computeCounts, renderFilterList } from "../../shared/filters.js";

const MIN_AANBIEDERS_OPTIONS = [1, 2, 3, 4, 5];

const filterState = {
  priceLabels:   new Set(),
  weightLabels:  new Set(),
  vloertypes:    new Set(),
  containertypes: new Set(),
  brands:        new Set(),
  functies:      new Set(),
  aanbieder:     new Set(),
  minAanbieders: DEFAULT_MIN_AANBIEDERS,
  baseMatches:   [],
  answers:       null,
  bestType:      "",
};

const FUNCTIE_DEFINITIES = [
  { key: "hepa", label: "HEPA-filtering", check: s => s.heeftHepaFilter },
];

const VLOERTYPE_LABELS = {
  tapijt: "Tapijt",
  hardeVloer: "Harde vloer",
};

function getDynamicPriceGroups() {
  return Array.isArray(filterState.priceGroups) ? filterState.priceGroups : [];
}

function getDynamicWeightGroups() {
  return Array.isArray(filterState.weightGroups) ? filterState.weightGroups : [];
}

function getBaseMatches() {
  return filterState.baseMatches;
}

function getPriceScopedMatches() {
  const base = getBaseMatches();
  if (filterState.priceLabels.size === 0) return base;
  const groups = getDynamicPriceGroups().filter(g => filterState.priceLabels.has(g.label));
  return base.filter(s => {
    const price = parsePrice(s.prijs);
    return groups.some(g => price >= g.min && price <= g.max);
  });
}

// Basis voor de tellingen op alle secundaire filterkaarten: prijs-gescoped
// én al beperkt tot de huidige "aantal winkels"-drempel.
function getSecondaryScopedMatches() {
  return getPriceScopedMatches().filter(s => (s.aanbieders ?? []).length >= filterState.minAanbieders);
}

function getBaseScopedByMinAanbieders() {
  return getBaseMatches().filter(s => (s.aanbieders ?? []).length >= filterState.minAanbieders);
}

function formatBrandLabel(brand) {
  const raw = String(brand ?? "").trim();
  if (!raw) return "";
  if (raw === raw.toUpperCase()) return raw;
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function collectVloertypeOptions(matches) {
  const opties = [];
  if (matches.some(s => s.geschiktTapijt)) opties.push("tapijt");
  if (matches.some(s => s.geschiktHardeVloer)) opties.push("hardeVloer");
  return opties;
}

function collectContainerTypeOptions(matches) {
  const set = new Set();
  matches.forEach(s => { if (s.containerType) set.add(s.containerType); });
  const order = ["Zakloos", "Stofzak"];
  const inOrder = order.filter(t => set.has(t));
  set.forEach(t => { if (!order.includes(t)) inOrder.push(t); });
  return inOrder;
}

function collectBrandOptions(matches) {
  const set = new Set();
  matches.forEach(s => { const label = formatBrandLabel(s.merk); if (label) set.add(label); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "nl"));
}

function collectFunctieOptions(matches) {
  return FUNCTIE_DEFINITIES.filter(f => matches.some(f.check)).map(f => f.key);
}

function collectAanbiederOptions(matches) {
  const set = new Set();
  matches.forEach(s => { (s.aanbieders ?? []).forEach(a => set.add(a.winkel)); });
  return Array.from(set).sort();
}

function renderFilterOptions(container, card, items, matches, productValueFn, filterName, labelFn) {
  if (items.length === 0) { container.innerHTML = ""; card.hidden = true; return; }
  const stateSet = filterState[filterName];
  const counts = computeCounts(matches, productValueFn);
  renderFilterList(container, card, { items, counts, filterName, stateSet, labelFn });
}

function applyFilters() {
  let filtered = getPriceScopedMatches();

  if (filterState.weightLabels.size > 0) {
    const groups = getDynamicWeightGroups().filter(g => filterState.weightLabels.has(g.label));
    filtered = filtered.filter(s => groups.some(g => s.gewichtKg !== null && s.gewichtKg >= g.min && s.gewichtKg <= g.max));
  }

  if (filterState.vloertypes.size > 0) {
    filtered = filtered.filter(s =>
      (filterState.vloertypes.has("tapijt") && s.geschiktTapijt) ||
      (filterState.vloertypes.has("hardeVloer") && s.geschiktHardeVloer)
    );
  }

  if (filterState.containertypes.size > 0) {
    filtered = filtered.filter(s => filterState.containertypes.has(s.containerType));
  }

  if (filterState.brands.size > 0) {
    filtered = filtered.filter(s => filterState.brands.has(formatBrandLabel(s.merk)));
  }

  if (filterState.functies.size > 0) {
    filtered = filtered.filter(s =>
      FUNCTIE_DEFINITIES.filter(f => filterState.functies.has(f.key)).every(f => f.check(s))
    );
  }

  if (filterState.aanbieder.size > 0) {
    filtered = filtered.filter(s => (s.aanbieders ?? []).some(a => filterState.aanbieder.has(a.winkel)));
  }

  // "Aantal winkels" als allerlaatste stap, met cascade-fallback.
  const { effectiveMin, result: final } = applyMinAanbiedersCascade(filtered, filterState.minAanbieders);
  const cascaded = effectiveMin !== filterState.minAanbieders;
  if (cascaded) filterState.minAanbieders = effectiveMin;

  updateClearFiltersBtn();
  updateResultMatches(final, filterState.answers, filterState.bestType);

  if (cascaded) renderAllFilters();
}

function updateClearFiltersBtn() {
  const btn = qs("#clearFiltersBtn");
  if (!btn) return;
  const hasActive = filterState.priceLabels.size > 0 || filterState.weightLabels.size > 0 ||
    filterState.vloertypes.size > 0 || filterState.containertypes.size > 0 || filterState.brands.size > 0 ||
    filterState.functies.size > 0 || filterState.aanbieder.size > 0 ||
    filterState.minAanbieders !== DEFAULT_MIN_AANBIEDERS;
  btn.hidden = !hasActive;
}

function renderMinAanbiedersOptions(container, card) {
  if (!container || !card) return;
  const matches = getPriceScopedMatches();
  const options = MIN_AANBIEDERS_OPTIONS.map(n => ({
    n,
    count: matches.filter(s => (s.aanbieders ?? []).length >= n).length,
  })).filter(o => o.count > 0);

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

function renderAllFilters() {
  const priceContainer      = qs("[data-filter-container='price']");
  const minAanbiedersContainer = qs("[data-filter-container='min-aanbieders']");
  const weightContainer     = qs("[data-filter-container='gewicht']");
  const vloertypeContainer  = qs("[data-filter-container='vloertype']");
  const containerTypeContainer = qs("[data-filter-container='containertype']");
  const brandContainer      = qs("[data-filter-container='brand']");
  const functieContainer    = qs("[data-filter-container='functies']");
  const aanbiederContainer  = qs("[data-filter-container='aanbieder']");

  const priceCard      = qs(".filter-card[data-filter='price']");
  const minAanbiedersCard = qs(".filter-card[data-filter='min-aanbieders']");
  const weightCard     = qs(".filter-card[data-filter='gewicht']");
  const vloertypeCard  = qs(".filter-card[data-filter='vloertype']");
  const containerTypeCard = qs(".filter-card[data-filter='containertype']");
  const brandCard      = qs(".filter-card[data-filter='brand']");
  const functieCard    = qs(".filter-card[data-filter='functies']");
  const aanbiederCard  = qs(".filter-card[data-filter='aanbieder']");

  renderMinAanbiedersOptions(minAanbiedersContainer, minAanbiedersCard);
  const matches = getSecondaryScopedMatches();

  if (priceContainer && priceCard) {
    const groups = getDynamicPriceGroups();
    const base = getBaseScopedByMinAanbieders();
    const groupForPrice = price => groups.find(g => price >= g.min && price <= g.max);
    const counts = computeCounts(base, s => groupForPrice(parsePrice(s.prijs))?.label);
    const labels = groups.filter(g => counts.has(g.label)).map(g => g.label);

    if (labels.length <= 1) {
      priceContainer.innerHTML = "";
      priceCard.hidden = true;
    } else {
      renderFilterList(priceContainer, priceCard, {
        items: labels, counts, filterName: "priceFilter", stateSet: filterState.priceLabels,
        labelFn: label => `€ ${label}`, allLabel: "Alle prijzen",
      });
    }
  }

  if (weightContainer && weightCard) {
    const groups = getDynamicWeightGroups();
    const base = getBaseScopedByMinAanbieders();
    const groupForWeight = kg => groups.find(g => kg !== null && kg >= g.min && kg <= g.max);
    const counts = computeCounts(base, s => groupForWeight(s.gewichtKg)?.label);
    const labels = groups.filter(g => counts.has(g.label)).map(g => g.label);

    if (labels.length <= 1) {
      weightContainer.innerHTML = "";
      weightCard.hidden = true;
    } else {
      renderFilterList(weightContainer, weightCard, {
        items: labels, counts, filterName: "weightFilter", stateSet: filterState.weightLabels,
        allLabel: "Alle gewichten",
      });
    }
  }

  if (vloertypeContainer && vloertypeCard) {
    renderFilterOptions(vloertypeContainer, vloertypeCard, collectVloertypeOptions(matches), matches,
      s => [s.geschiktTapijt ? "tapijt" : null, s.geschiktHardeVloer ? "hardeVloer" : null].filter(Boolean),
      "vloertypes", key => VLOERTYPE_LABELS[key] ?? key);
  }

  if (containerTypeContainer && containerTypeCard) {
    renderFilterOptions(containerTypeContainer, containerTypeCard, collectContainerTypeOptions(matches), matches,
      s => s.containerType, "containertypes", val => val === "Zakloos" ? "Zonder zak" : "Met zak");
  }

  if (brandContainer && brandCard) {
    renderFilterOptions(brandContainer, brandCard, collectBrandOptions(matches), matches, s => formatBrandLabel(s.merk), "brands");
  }

  if (functieContainer && functieCard) {
    const functieValueFn = s => FUNCTIE_DEFINITIES.filter(f => f.check(s)).map(f => f.key);
    const labelFn = key => FUNCTIE_DEFINITIES.find(f => f.key === key)?.label ?? key;
    renderFilterOptions(functieContainer, functieCard, collectFunctieOptions(matches), matches, functieValueFn, "functies", labelFn);
  }

  if (aanbiederContainer && aanbiederCard) {
    renderFilterOptions(aanbiederContainer, aanbiederCard, collectAanbiederOptions(matches), matches, s => (s.aanbieders ?? []).map(a => a.winkel), "aanbieder");
  }

  updateClearFiltersBtn();
}

function handleFilterChange(event) {
  const input = event.target.closest("input");
  if (!input) return;

  const name  = input.name;
  const value = input.value;

  if (name === "minAanbiedersFilter") {
    filterState.minAanbieders = parseInt(value, 10);
    renderAllFilters();
    applyFilters();
    return;
  }

  const setMap = {
    priceFilter:    { set: filterState.priceLabels },
    weightFilter:   { set: filterState.weightLabels },
    vloertypes:     { set: filterState.vloertypes },
    containertypes: { set: filterState.containertypes },
    brands:         { set: filterState.brands },
    functies:       { set: filterState.functies },
    aanbieder:      { set: filterState.aanbieder },
  };

  if (!setMap[name]) return;

  const { set } = setMap[name];

  if (value === "all") {
    set.clear();
  } else if (input.checked) {
    set.add(value);
  } else {
    set.delete(value);
  }

  renderAllFilters();
  applyFilters();
}

export async function initFilters() {
  const filtersPanel = qs("#filtersPanel");
  if (!filtersPanel) return;

  const answersData  = localStorage.getItem("stofzuiger_answers");
  const bestTypeData = localStorage.getItem("stofzuiger_bestType");

  filterState.answers  = answersData ? JSON.parse(answersData) : null;
  filterState.bestType = bestTypeData ?? "";

  let allStofzuigers = [];
  try {
    const raw = await fetchProducts();
    allStofzuigers = normalizeProducts(raw ?? []);
  } catch {
    allStofzuigers = [];
  }

  const result = matchStofzuigers(allStofzuigers, filterState.answers ?? {});
  filterState.baseMatches = Array.isArray(result.filteredMatchedStofzuigers) ? result.filteredMatchedStofzuigers : [];

  // Fallback: if the live fetch/computation yields nothing, seed the pool
  // with the stofzuigers that were already matched during the quiz.
  if (filterState.baseMatches.length === 0) {
    const storedData = localStorage.getItem("stofzuiger_filteredMatchedStofzuigers");
    if (storedData) {
      try {
        const stored = JSON.parse(storedData);
        if (Array.isArray(stored) && stored.length > 0) {
          filterState.baseMatches = stored;
        }
      } catch { /* ignore */ }
    }
  }

  filterState.priceGroups  = computeDynamicPriceGroups(filterState.baseMatches);
  filterState.weightGroups = computeDynamicWeightGroups(filterState.baseMatches);

  filterState.priceLabels = new Set();

  renderAllFilters();

  filtersPanel.addEventListener("change", handleFilterChange);

  const clearBtn = qs("#clearFiltersBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      filterState.priceLabels.clear();
      filterState.weightLabels.clear();
      filterState.vloertypes.clear();
      filterState.containertypes.clear();
      filterState.brands.clear();
      filterState.functies.clear();
      filterState.aanbieder.clear();
      filterState.minAanbieders = DEFAULT_MIN_AANBIEDERS;
      renderAllFilters();
      applyFilters();
    });
  }

  applyFilters();
}
