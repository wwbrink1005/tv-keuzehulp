import { priceGroupsByCapaciteit, capaciteitGroupToAllowedCapaciteit } from "./data.js";
import { matchWasmachines } from "./matching.js";
import { computeDynamicPriceGroups, normalizeProducts, parsePrice, qs } from "./utils.js";
import { updateResultMatches } from "./result.js";
import { fetchProducts } from "./supabase.js";

const filterState = {
  priceLabels:    new Set(),
  capaciteiten:   new Set(),
  brands:         new Set(),
  typeLaders:     new Set(),
  energieLabels:  new Set(),
  centrifugeRpms: new Set(),
  kleuren:        new Set(),
  aanbieder:      new Set(),
  baseMatches:    [],
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

// Price is just another optional narrowing filter, not a hard upfront wall:
// with no bucket selected, every wasmachine matching the quiz answers is shown.
function getBaseMatches() {
  return filterState.baseMatches;
}

function getPriceScopedMatches() {
  const base = getBaseMatches();
  if (filterState.priceLabels.size === 0) return base;
  const groups = getDynamicPriceGroups(filterState.capaciteitGroup).filter(g => filterState.priceLabels.has(g.label));
  return base.filter(w => {
    const price = parsePrice(w.prijs);
    return groups.some(g => price >= g.min && price <= g.max);
  });
}

function formatBrandLabel(brand) {
  const raw = String(brand ?? "").trim();
  if (!raw) return "";
  if (raw === raw.toUpperCase()) return raw;
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
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

// Normaliseert combinaties als "Wit, Zwart" en "Zwart, Wit" naar dezelfde
// canonieke waarde, zodat ze niet als 2 losse filteropties verschijnen.
function normalizeKleur(kleur) {
  const raw = String(kleur ?? "").trim();
  if (!raw) return "";
  return raw.split(",").map(s => s.trim()).filter(Boolean).sort().join(", ");
}

function collectKleurOptions(matches) {
  const set = new Set();
  matches.forEach(w => { const k = normalizeKleur(w.kleur); if (k) set.add(k); });
  const order = ["Wit", "Zwart", "Zwart, Wit", "Antraciet", "Grijs", "Zilver"];
  const inOrder = order.filter(t => set.has(t));
  set.forEach(t => { if (!order.includes(t)) inOrder.push(t); });
  return inOrder;
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

function applyFilters() {
  let filtered = getPriceScopedMatches();

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

  if (filterState.kleuren.size > 0) {
    filtered = filtered.filter(w => filterState.kleuren.has(normalizeKleur(w.kleur)));
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
  const hasActive = filterState.priceLabels.size > 0 || filterState.capaciteiten.size > 0 || filterState.brands.size > 0 ||
    filterState.typeLaders.size > 0 || filterState.energieLabels.size > 0 ||
    filterState.centrifugeRpms.size > 0 || filterState.kleuren.size > 0 ||
    filterState.aanbieder.size > 0;
  btn.hidden = !hasActive;
}

function renderAllFilters() {
  const matches = getPriceScopedMatches();

  const priceContainer      = qs("[data-filter-container='price']");
  const capaciteitContainer = qs("[data-filter-container='capaciteit']");
  const brandContainer      = qs("[data-filter-container='brand']");
  const typeLaderContainer  = qs("[data-filter-container='type-lader']");
  const energieContainer    = qs("[data-filter-container='energie-label']");
  const rpmContainer        = qs("[data-filter-container='centrifuge-rpm']");
  const kleurContainer      = qs("[data-filter-container='kleur']");
  const aanbiederContainer  = qs("[data-filter-container='aanbieder']");

  const priceCard      = qs(".filter-card[data-filter='price']");
  const capaciteitCard  = qs(".filter-card[data-filter='capaciteit']");
  const brandCard       = qs(".filter-card[data-filter='brand']");
  const typeLaderCard   = qs(".filter-card[data-filter='type-lader']");
  const energieCard     = qs(".filter-card[data-filter='energie-label']");
  const rpmCard         = qs(".filter-card[data-filter='centrifuge-rpm']");
  const kleurCard       = qs(".filter-card[data-filter='kleur']");
  const aanbiederCard   = qs(".filter-card[data-filter='aanbieder']");

  if (priceContainer && priceCard) {
    const groups = getDynamicPriceGroups(filterState.capaciteitGroup);
    // Only show price buckets that actually contain a matching wasmachine
    // for the current quiz answers — otherwise users click a bucket that
    // can never show a result. If there's only one (or zero) non-empty
    // bucket there's nothing meaningful to narrow, so hide the whole card.
    const base = getBaseMatches();
    const labels = groups.filter(g => base.some(w => {
      const price = parsePrice(w.prijs);
      return price >= g.min && price <= g.max;
    }));

    priceContainer.innerHTML = "";
    if (labels.length <= 1) { priceCard.hidden = true; }
    else {
      priceCard.hidden = false;

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
      priceContainer.appendChild(allLabel);

      labels.forEach(group => {
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

  if (kleurContainer && kleurCard) {
    const kleuren = collectKleurOptions(matches);
    renderFilterOptions(kleurContainer, kleurCard, kleuren, "kleuren", null);
    kleurContainer.querySelectorAll('input[type="checkbox"]').forEach(input => {
      if (input.value === "all") input.checked = filterState.kleuren.size === 0;
      else input.checked = filterState.kleuren.has(input.value);
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

  const setMap = {
    priceFilter:    { set: filterState.priceLabels,    parse: v => v },
    capaciteiten:   { set: filterState.capaciteiten,   parse: v => parseFloat(v) },
    brands:         { set: filterState.brands,         parse: v => v },
    typeLaders:     { set: filterState.typeLaders,     parse: v => v },
    energieLabels:  { set: filterState.energieLabels,  parse: v => v },
    centrifugeRpms: { set: filterState.centrifugeRpms, parse: v => parseInt(v, 10) },
    kleuren:        { set: filterState.kleuren,        parse: v => v },
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
  const bestTypeData         = localStorage.getItem("wasmachine_bestType");

  filterState.answers         = answersData ? JSON.parse(answersData) : null;
  filterState.scores          = scoresData  ? JSON.parse(scoresData)  : null;
  filterState.capaciteitGroup = capaciteitGroupData ?? "";
  filterState.bestType        = bestTypeData ?? "";

  // Fetch & normalize all wasmachines
  let allWasmachines = [];
  try {
    const raw = await fetchProducts();
    allWasmachines = normalizeProducts(raw ?? []);
  } catch {
    allWasmachines = [];
  }

  filterState.priceGroups = computeDynamicPriceGroups(allWasmachines, filterState.capaciteitGroup, capaciteitGroupToAllowedCapaciteit);

  // No budget question was asked during the quiz, so the base match set is
  // computed with priceGroup = null (the full, price-unrestricted result).
  const result = matchWasmachines(allWasmachines, filterState.capaciteitGroup, null, filterState.answers, filterState.scores);
  filterState.baseMatches = Array.isArray(result.filteredMatchedWasmachines) ? result.filteredMatchedWasmachines : [];

  // Fallback: if the live fetch/computation yields nothing, seed the pool
  // with the wasmachines that were already matched during the quiz.
  if (filterState.baseMatches.length === 0) {
    const storedData = localStorage.getItem("wasmachine_filteredMatchedWasmachines");
    if (storedData) {
      try {
        const storedWasmachines = JSON.parse(storedData);
        if (Array.isArray(storedWasmachines) && storedWasmachines.length > 0) {
          filterState.baseMatches = storedWasmachines;
        }
      } catch { /* ignore */ }
    }
  }

  // No price bucket selected by default: show every matching wasmachine and
  // let the user optionally narrow by budget via the "Prijscategorie" filter.
  filterState.priceLabels = new Set();

  renderAllFilters();

  // Delegate all filter changes
  filtersPanel.addEventListener("change", handleFilterChange);

  // Clear filters button
  const clearBtn = qs("#clearFiltersBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      filterState.priceLabels.clear();
      filterState.capaciteiten.clear();
      filterState.brands.clear();
      filterState.typeLaders.clear();
      filterState.energieLabels.clear();
      filterState.centrifugeRpms.clear();
      filterState.kleuren.clear();
      filterState.aanbieder.clear();
      renderAllFilters();
      applyFilters();
    });
  }

  // Always use the freshly computed matches so the initial render
  // is consistent with what applyFilters() will produce later.
  applyFilters();
}
