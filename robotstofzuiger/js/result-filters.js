import { priceGroupsFallback, heeftLidarNavigatie } from "./data.js";
import { matchRobotstofzuigers, applyMinAanbiedersCascade, DEFAULT_MIN_AANBIEDERS } from "./matching.js";
import { computeDynamicPriceGroups, computeDynamicDimensionGroups, normalizeProducts, parsePrice, qs } from "./utils.js";
import { updateResultMatches } from "./result.js";
import { fetchProducts } from "./supabase.js";
import { computeCounts, renderFilterList } from "../../shared/filters.js";

const MIN_AANBIEDERS_OPTIONS = [1, 2, 3, 4, 5];

const filterState = {
  priceLabels:      new Set(),
  navigatieTypes:   new Set(),
  dweilOpties:      new Set(),
  brands:           new Set(),
  kleuren:          new Set(),
  functies:         new Set(),
  hoogteLabels:     new Set(),
  basisstationHoogteLabels: new Set(),
  aanbieder:        new Set(),
  minAanbieders:    DEFAULT_MIN_AANBIEDERS,
  baseMatches:      [],
  answers:          null,
  bestType:         "",
};

const FUNCTIE_DEFINITIES = [
  { key: "zelflegend",        label: "Zelflegend stofreservoir",  check: r => r.zelflegend === "Ja" },
  { key: "obstakeldetectie",  label: "Obstakeldetectie",          check: r => r.obstakeldetectie === "Ja" },
  { key: "hepa",              label: "HEPA-filter",               check: r => r.hepaFilter === "Ja" },
  { key: "wifi",              label: "Wifi/app-bediening",        check: r => r.wifi === "Ja" },
  { key: "alexa",             label: "Amazon Alexa",              check: r => r.alexa === "Ja" },
  { key: "google-assistent",  label: "Google Assistent",          check: r => r.googleAssistent === "Ja" },
];

// Price buckets are recomputed fresh from the live-fetched catalog op elke
// resultaatpagina-load, nooit vertrouwd op de quiz-time localStorage-snapshot.
function getDynamicPriceGroups() {
  if (Array.isArray(filterState.priceGroups) && filterState.priceGroups.length > 0) {
    return filterState.priceGroups;
  }
  return priceGroupsFallback;
}

function getBaseMatches() {
  return filterState.baseMatches;
}

function getPriceScopedMatches() {
  const base = getBaseMatches();
  if (filterState.priceLabels.size === 0) return base;
  const groups = getDynamicPriceGroups().filter(g => filterState.priceLabels.has(g.label));
  return base.filter(r => {
    const price = parsePrice(r.prijs);
    return groups.some(g => price >= g.min && price <= g.max);
  });
}

function getSecondaryScopedMatches() {
  return getPriceScopedMatches().filter(r => (r.aanbieders ?? []).length >= filterState.minAanbieders);
}

function getBaseScopedByMinAanbieders() {
  return getBaseMatches().filter(r => (r.aanbieders ?? []).length >= filterState.minAanbieders);
}

function formatBrandLabel(brand) {
  const raw = String(brand ?? "").trim();
  if (!raw) return "";
  if (raw === raw.toUpperCase()) return raw;
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function navigatieLabel(navigatieType) {
  return heeftLidarNavigatie(navigatieType) ? "lidar" : "overig";
}

function collectNavigatieOptions(matches) {
  const set = new Set();
  matches.forEach(r => { if (r.navigatieType) set.add(navigatieLabel(r.navigatieType)); });
  const order = ["lidar", "overig"];
  return order.filter(t => set.has(t));
}

function collectDweilOptions(matches) {
  const set = new Set();
  matches.forEach(r => { if (r.natDweilen) set.add(r.natDweilen); });
  const order = ["Ja", "Nee"];
  return order.filter(t => set.has(t));
}

function collectBrandOptions(matches) {
  const set = new Set();
  matches.forEach(r => { const label = formatBrandLabel(r.merk); if (label) set.add(label); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "nl"));
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
  matches.forEach(r => { const k = normalizeKleur(r.kleur); if (k) set.add(k); });
  const order = ["Zwart", "Wit", "Zwart, Wit", "Grijs", "Zwart, Grijs", "Donkergrijs", "Goud", "Metallic"];
  const inOrder = order.filter(t => set.has(t));
  set.forEach(t => { if (!order.includes(t)) inOrder.push(t); });
  return inOrder;
}

function collectFunctieOptions(matches) {
  return FUNCTIE_DEFINITIES.filter(f => matches.some(f.check)).map(f => f.key);
}

function collectAanbiederOptions(matches) {
  const set = new Set();
  matches.forEach(r => {
    (r.aanbieders ?? []).forEach(a => set.add(a.winkel));
  });
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

  if (filterState.navigatieTypes.size > 0) {
    filtered = filtered.filter(r => filterState.navigatieTypes.has(navigatieLabel(r.navigatieType)));
  }

  if (filterState.dweilOpties.size > 0) {
    filtered = filtered.filter(r => filterState.dweilOpties.has(r.natDweilen));
  }

  if (filterState.brands.size > 0) {
    filtered = filtered.filter(r => filterState.brands.has(formatBrandLabel(r.merk)));
  }

  if (filterState.kleuren.size > 0) {
    filtered = filtered.filter(r => filterState.kleuren.has(normalizeKleur(r.kleur)));
  }

  if (filterState.functies.size > 0) {
    filtered = filtered.filter(r =>
      FUNCTIE_DEFINITIES.filter(f => filterState.functies.has(f.key)).every(f => f.check(r))
    );
  }

  if (filterState.hoogteLabels.size > 0) {
    const groups = filterState.hoogteGroups.filter(g => filterState.hoogteLabels.has(g.label));
    filtered = filtered.filter(r => Number.isFinite(r.hoogteMm) && groups.some(g => r.hoogteMm / 10 >= g.min && r.hoogteMm / 10 < g.max));
  }

  if (filterState.basisstationHoogteLabels.size > 0) {
    const groups = filterState.basisstationHoogteGroups.filter(g => filterState.basisstationHoogteLabels.has(g.label));
    filtered = filtered.filter(r => Number.isFinite(r.basisstationHoogteMm) && groups.some(g => r.basisstationHoogteMm / 10 >= g.min && r.basisstationHoogteMm / 10 < g.max));
  }

  if (filterState.aanbieder.size > 0) {
    filtered = filtered.filter(r =>
      (r.aanbieders ?? []).some(a => filterState.aanbieder.has(a.winkel))
    );
  }

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
  const hasActive = filterState.priceLabels.size > 0 || filterState.navigatieTypes.size > 0 ||
    filterState.dweilOpties.size > 0 || filterState.brands.size > 0 || filterState.kleuren.size > 0 ||
    filterState.functies.size > 0 ||
    filterState.hoogteLabels.size > 0 || filterState.basisstationHoogteLabels.size > 0 ||
    filterState.aanbieder.size > 0 ||
    filterState.minAanbieders !== DEFAULT_MIN_AANBIEDERS;
  btn.hidden = !hasActive;
}

function renderDimensionFilter(container, card, groups, veld, stateSet, filterName) {
  if (!container || !card) return;
  if (groups.length === 0) { container.innerHTML = ""; card.hidden = true; return; }

  const base = getBaseScopedByMinAanbieders();
  const groupForMm = mm => Number.isFinite(mm) ? groups.find(g => mm / 10 >= g.min && mm / 10 < g.max) : undefined;
  const counts = computeCounts(base, r => groupForMm(r[veld])?.label);
  const labels = groups.filter(g => counts.has(g.label)).map(g => g.label);

  if (labels.length <= 1) {
    container.innerHTML = "";
    card.hidden = true;
  } else {
    renderFilterList(container, card, { items: labels, counts, filterName, stateSet, allLabel: "Alle" });
  }
}

function renderMinAanbiedersOptions(container, card) {
  if (!container || !card) return;
  const matches = getPriceScopedMatches();
  const options = MIN_AANBIEDERS_OPTIONS.map(n => ({
    n,
    count: matches.filter(r => (r.aanbieders ?? []).length >= n).length,
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

function renderAllFilters() {
  const priceContainer      = qs("[data-filter-container='price']");
  const minAanbiedersContainer = qs("[data-filter-container='min-aanbieders']");
  const navigatieContainer  = qs("[data-filter-container='navigatie']");
  const dweilContainer      = qs("[data-filter-container='dweilfunctie']");
  const brandContainer      = qs("[data-filter-container='brand']");
  const kleurContainer      = qs("[data-filter-container='kleur']");
  const functieContainer    = qs("[data-filter-container='functies']");
  const hoogteContainer     = qs("[data-filter-container='hoogte']");
  const basisstationContainer = qs("[data-filter-container='basisstation-hoogte']");
  const aanbiederContainer  = qs("[data-filter-container='aanbieder']");

  const priceCard      = qs(".filter-card[data-filter='price']");
  const navigatieCard  = qs(".filter-card[data-filter='navigatie']");
  const dweilCard      = qs(".filter-card[data-filter='dweilfunctie']");
  const brandCard      = qs(".filter-card[data-filter='brand']");
  const kleurCard      = qs(".filter-card[data-filter='kleur']");
  const functieCard    = qs(".filter-card[data-filter='functies']");
  const hoogteCard     = qs(".filter-card[data-filter='hoogte']");
  const basisstationCard = qs(".filter-card[data-filter='basisstation-hoogte']");
  const aanbiederCard  = qs(".filter-card[data-filter='aanbieder']");
  const minAanbiedersCard = qs(".filter-card[data-filter='min-aanbieders']");

  renderMinAanbiedersOptions(minAanbiedersContainer, minAanbiedersCard);
  const matches = getSecondaryScopedMatches();

  if (priceContainer && priceCard) {
    const groups = getDynamicPriceGroups();
    const base = getBaseScopedByMinAanbieders();
    const groupForPrice = price => groups.find(g => price >= g.min && price <= g.max);
    const counts = computeCounts(base, r => groupForPrice(parsePrice(r.prijs))?.label);
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

  if (navigatieContainer && navigatieCard) {
    const labelFn = key => key === "lidar" ? "LiDAR/laser-navigatie" : "Overig/onbekend";
    renderFilterOptions(navigatieContainer, navigatieCard, collectNavigatieOptions(matches), matches, r => navigatieLabel(r.navigatieType), "navigatieTypes", labelFn);
  }

  if (dweilContainer && dweilCard) {
    const labelFn = key => key === "Ja" ? "Met dweilfunctie" : "Alleen zuigen";
    renderFilterOptions(dweilContainer, dweilCard, collectDweilOptions(matches), matches, r => r.natDweilen, "dweilOpties", labelFn);
  }

  if (brandContainer && brandCard) {
    renderFilterOptions(brandContainer, brandCard, collectBrandOptions(matches), matches, r => formatBrandLabel(r.merk), "brands");
  }

  if (kleurContainer && kleurCard) {
    renderFilterOptions(kleurContainer, kleurCard, collectKleurOptions(matches), matches, r => normalizeKleur(r.kleur), "kleuren");
  }

  if (functieContainer && functieCard) {
    const functieValueFn = r => FUNCTIE_DEFINITIES.filter(f => f.check(r)).map(f => f.key);
    const labelFn = key => FUNCTIE_DEFINITIES.find(f => f.key === key)?.label ?? key;
    renderFilterOptions(functieContainer, functieCard, collectFunctieOptions(matches), matches, functieValueFn, "functies", labelFn);
  }

  renderDimensionFilter(hoogteContainer, hoogteCard, filterState.hoogteGroups, "hoogteMm", filterState.hoogteLabels, "hoogteLabels");
  renderDimensionFilter(basisstationContainer, basisstationCard, filterState.basisstationHoogteGroups, "basisstationHoogteMm", filterState.basisstationHoogteLabels, "basisstationHoogteLabels");

  if (aanbiederContainer && aanbiederCard) {
    renderFilterOptions(aanbiederContainer, aanbiederCard, collectAanbiederOptions(matches), matches, r => (r.aanbieders ?? []).map(a => a.winkel), "aanbieder");
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
    priceFilter:      { set: filterState.priceLabels,      parse: v => v },
    navigatieTypes:   { set: filterState.navigatieTypes,   parse: v => v },
    dweilOpties:      { set: filterState.dweilOpties,      parse: v => v },
    brands:           { set: filterState.brands,           parse: v => v },
    kleuren:          { set: filterState.kleuren,           parse: v => v },
    functies:         { set: filterState.functies,         parse: v => v },
    hoogteLabels:     { set: filterState.hoogteLabels,     parse: v => v },
    basisstationHoogteLabels: { set: filterState.basisstationHoogteLabels, parse: v => v },
    aanbieder:        { set: filterState.aanbieder,        parse: v => v }
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

  const answersData   = localStorage.getItem("robotstofzuiger_answers");
  const bestTypeData  = localStorage.getItem("robotstofzuiger_bestType");

  filterState.answers  = answersData ? JSON.parse(answersData) : null;
  filterState.bestType = bestTypeData ?? "";

  let allRobots = [];
  try {
    const raw = await fetchProducts();
    allRobots = normalizeProducts(raw ?? []);
  } catch {
    allRobots = [];
  }

  const result = matchRobotstofzuigers(allRobots, filterState.answers ?? {});
  filterState.baseMatches = Array.isArray(result.filteredMatchedRobotstofzuigers) ? result.filteredMatchedRobotstofzuigers : [];

  // Fallback: if the live fetch/computation yields nothing, seed the pool
  // with the robotstofzuigers that were already matched during the quiz.
  if (filterState.baseMatches.length === 0) {
    const storedData = localStorage.getItem("robotstofzuiger_filteredMatchedRobotstofzuigers");
    if (storedData) {
      try {
        const stored = JSON.parse(storedData);
        if (Array.isArray(stored) && stored.length > 0) {
          filterState.baseMatches = stored;
        }
      } catch { /* ignore */ }
    }
  }

  filterState.priceGroups = computeDynamicPriceGroups(filterState.baseMatches);
  filterState.hoogteGroups = computeDynamicDimensionGroups(filterState.baseMatches, "hoogteMm");
  filterState.basisstationHoogteGroups = computeDynamicDimensionGroups(filterState.baseMatches, "basisstationHoogteMm");

  filterState.priceLabels = new Set();

  renderAllFilters();

  filtersPanel.addEventListener("change", handleFilterChange);

  const clearBtn = qs("#clearFiltersBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      filterState.priceLabels.clear();
      filterState.navigatieTypes.clear();
      filterState.dweilOpties.clear();
      filterState.brands.clear();
      filterState.kleuren.clear();
      filterState.functies.clear();
      filterState.hoogteLabels.clear();
      filterState.basisstationHoogteLabels.clear();
      filterState.aanbieder.clear();
      filterState.minAanbieders = DEFAULT_MIN_AANBIEDERS;
      renderAllFilters();
      applyFilters();
    });
  }

  applyFilters();
}
