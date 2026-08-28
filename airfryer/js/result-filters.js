import { priceGroupsFallback } from "./data.js";
import { matchAirfryers, applyMinAanbiedersCascade, DEFAULT_MIN_AANBIEDERS } from "./matching.js";
import { computeDynamicPriceGroups, computeDynamicCapaciteitGroups, normalizeProducts, parsePrice, qs } from "./utils.js";
import { updateResultMatches } from "./result.js";
import { fetchProducts } from "./supabase.js";
import { computeCounts, renderFilterList } from "../../shared/filters.js";

const MIN_AANBIEDERS_OPTIONS = [1, 2, 3, 4, 5];

const filterState = {
  priceLabels:       new Set(),
  capaciteitLabels:  new Set(),
  constructietypen:  new Set(),
  brands:            new Set(),
  kleuren:           new Set(),
  functies:          new Set(),
  aanbieder:         new Set(),
  minAanbieders:     DEFAULT_MIN_AANBIEDERS,
  baseMatches:       [],
  answers:           null,
  bestType:          "",
};

const FUNCTIE_DEFINITIES = [
  { key: "kijkglas",             label: "Kijkglas",                   check: a => a.kijkglas === "Ja" },
  { key: "display",              label: "Ingebouwd display",          check: a => a.display === "Ja" },
  { key: "vaatwasserbestendig",  label: "Vaatwasserbestendige onderdelen", check: a => a.vaatwasserbestendig === "Ja" },
  { key: "grillen",              label: "Grillen",                    check: a => a.grillen === "Ja" },
  { key: "braadfunctie",         label: "Braden",                     check: a => a.braadfunctie === "Ja" },
  { key: "stoomfunctie",         label: "Stoomfunctie",                check: a => a.stoomfunctie === "Ja" },
  { key: "dehydratiefunctie",    label: "Drogen/dehydrateren",         check: a => a.dehydratiefunctie === "Ja" },
  { key: "warmhoudfunctie",      label: "Warmhoudfunctie",             check: a => a.warmhoudfunctie === "Ja" },
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
  return base.filter(a => {
    const price = parsePrice(a.prijs);
    return groups.some(g => price >= g.min && price <= g.max);
  });
}

function getSecondaryScopedMatches() {
  return getPriceScopedMatches().filter(a => (a.aanbieders ?? []).length >= filterState.minAanbieders);
}

function getBaseScopedByMinAanbieders() {
  return getBaseMatches().filter(a => (a.aanbieders ?? []).length >= filterState.minAanbieders);
}

function formatBrandLabel(brand) {
  const raw = String(brand ?? "").trim();
  if (!raw) return "";
  if (raw === raw.toUpperCase()) return raw;
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function collectCapaciteitOptions() {
  return (filterState.capaciteitGroups || []).map(g => g.label);
}

function collectConstructietypeOptions(matches) {
  const set = new Set();
  matches.forEach(a => { if (a.constructietype) set.add(a.constructietype); });
  const order = ["Enkel", "Dubbel"];
  return order.filter(t => set.has(t));
}

function collectBrandOptions(matches) {
  const set = new Set();
  matches.forEach(a => { const label = formatBrandLabel(a.merk); if (label) set.add(label); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "nl"));
}

function normalizeKleur(kleur) {
  const raw = String(kleur ?? "").trim();
  if (!raw) return "";
  return raw.split(",").map(s => s.trim()).filter(Boolean).sort().join(", ");
}

function collectKleurOptions(matches) {
  const set = new Set();
  matches.forEach(a => { const k = normalizeKleur(a.kleur); if (k) set.add(k); });
  const order = ["Zwart", "Wit", "Grijs", "Zilver", "Roestvrijstaal", "Zwart, Roestvrijstaal", "Zwart, Zilver", "Zwart, Grijs", "Zwart, Goud", "Zwart, Koper"];
  const inOrder = order.filter(t => set.has(t));
  set.forEach(t => { if (!order.includes(t)) inOrder.push(t); });
  return inOrder;
}

function collectFunctieOptions(matches) {
  return FUNCTIE_DEFINITIES.filter(f => matches.some(f.check)).map(f => f.key);
}

function collectAanbiederOptions(matches) {
  const set = new Set();
  matches.forEach(a => {
    (a.aanbieders ?? []).forEach(x => set.add(x.winkel));
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

  if (filterState.capaciteitLabels.size > 0) {
    const groups = (filterState.capaciteitGroups || []).filter(g => filterState.capaciteitLabels.has(g.label));
    filtered = filtered.filter(a => Number.isFinite(a.capaciteitLiter) && groups.some(g => a.capaciteitLiter >= g.min && a.capaciteitLiter < g.max));
  }

  if (filterState.constructietypen.size > 0) {
    filtered = filtered.filter(a => filterState.constructietypen.has(a.constructietype));
  }

  if (filterState.brands.size > 0) {
    filtered = filtered.filter(a => filterState.brands.has(formatBrandLabel(a.merk)));
  }

  if (filterState.kleuren.size > 0) {
    filtered = filtered.filter(a => filterState.kleuren.has(normalizeKleur(a.kleur)));
  }

  if (filterState.functies.size > 0) {
    filtered = filtered.filter(a =>
      FUNCTIE_DEFINITIES.filter(f => filterState.functies.has(f.key)).every(f => f.check(a))
    );
  }

  if (filterState.aanbieder.size > 0) {
    filtered = filtered.filter(a =>
      (a.aanbieders ?? []).some(x => filterState.aanbieder.has(x.winkel))
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
  const hasActive = filterState.priceLabels.size > 0 || filterState.capaciteitLabels.size > 0 ||
    filterState.constructietypen.size > 0 || filterState.brands.size > 0 || filterState.kleuren.size > 0 ||
    filterState.functies.size > 0 || filterState.aanbieder.size > 0 ||
    filterState.minAanbieders !== DEFAULT_MIN_AANBIEDERS;
  btn.hidden = !hasActive;
}

function renderMinAanbiedersOptions(container, card) {
  if (!container || !card) return;
  const matches = getPriceScopedMatches();
  const options = MIN_AANBIEDERS_OPTIONS.map(n => ({
    n,
    count: matches.filter(a => (a.aanbieders ?? []).length >= n).length,
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
  const priceContainer          = qs("[data-filter-container='price']");
  const minAanbiedersContainer  = qs("[data-filter-container='min-aanbieders']");
  const capaciteitContainer     = qs("[data-filter-container='capaciteit']");
  const constructietypeContainer = qs("[data-filter-container='constructietype']");
  const brandContainer          = qs("[data-filter-container='brand']");
  const kleurContainer          = qs("[data-filter-container='kleur']");
  const functieContainer        = qs("[data-filter-container='functies']");
  const aanbiederContainer      = qs("[data-filter-container='aanbieder']");

  const priceCard          = qs(".filter-card[data-filter='price']");
  const capaciteitCard     = qs(".filter-card[data-filter='capaciteit']");
  const constructietypeCard = qs(".filter-card[data-filter='constructietype']");
  const brandCard          = qs(".filter-card[data-filter='brand']");
  const kleurCard          = qs(".filter-card[data-filter='kleur']");
  const functieCard        = qs(".filter-card[data-filter='functies']");
  const aanbiederCard      = qs(".filter-card[data-filter='aanbieder']");
  const minAanbiedersCard  = qs(".filter-card[data-filter='min-aanbieders']");

  renderMinAanbiedersOptions(minAanbiedersContainer, minAanbiedersCard);
  const matches = getSecondaryScopedMatches();

  if (priceContainer && priceCard) {
    const groups = getDynamicPriceGroups();
    const base = getBaseScopedByMinAanbieders();
    const groupForPrice = price => groups.find(g => price >= g.min && price <= g.max);
    const counts = computeCounts(base, a => groupForPrice(parsePrice(a.prijs))?.label);
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

  if (capaciteitContainer && capaciteitCard) {
    const groups = filterState.capaciteitGroups || [];
    const base = getBaseScopedByMinAanbieders();
    const groupForLiter = l => Number.isFinite(l) ? groups.find(g => l >= g.min && l < g.max) : undefined;
    const counts = computeCounts(base, a => groupForLiter(a.capaciteitLiter)?.label);
    const labels = groups.filter(g => counts.has(g.label)).map(g => g.label);

    if (labels.length <= 1) {
      capaciteitContainer.innerHTML = "";
      capaciteitCard.hidden = true;
    } else {
      renderFilterList(capaciteitContainer, capaciteitCard, {
        items: labels, counts, filterName: "capaciteitLabels", stateSet: filterState.capaciteitLabels, allLabel: "Alle",
      });
    }
  }

  if (constructietypeContainer && constructietypeCard) {
    const labelFn = key => key === "Dubbel" ? "Dubbele mand" : "Enkele mand";
    renderFilterOptions(constructietypeContainer, constructietypeCard, collectConstructietypeOptions(matches), matches, a => a.constructietype, "constructietypen", labelFn);
  }

  if (brandContainer && brandCard) {
    renderFilterOptions(brandContainer, brandCard, collectBrandOptions(matches), matches, a => formatBrandLabel(a.merk), "brands");
  }

  if (kleurContainer && kleurCard) {
    renderFilterOptions(kleurContainer, kleurCard, collectKleurOptions(matches), matches, a => normalizeKleur(a.kleur), "kleuren");
  }

  if (functieContainer && functieCard) {
    const functieValueFn = a => FUNCTIE_DEFINITIES.filter(f => f.check(a)).map(f => f.key);
    const labelFn = key => FUNCTIE_DEFINITIES.find(f => f.key === key)?.label ?? key;
    renderFilterOptions(functieContainer, functieCard, collectFunctieOptions(matches), matches, functieValueFn, "functies", labelFn);
  }

  if (aanbiederContainer && aanbiederCard) {
    renderFilterOptions(aanbiederContainer, aanbiederCard, collectAanbiederOptions(matches), matches, a => (a.aanbieders ?? []).map(x => x.winkel), "aanbieder");
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
    priceFilter:       { set: filterState.priceLabels,      parse: v => v },
    capaciteitLabels:  { set: filterState.capaciteitLabels,  parse: v => v },
    constructietypen:  { set: filterState.constructietypen,  parse: v => v },
    brands:            { set: filterState.brands,            parse: v => v },
    kleuren:           { set: filterState.kleuren,            parse: v => v },
    functies:          { set: filterState.functies,          parse: v => v },
    aanbieder:         { set: filterState.aanbieder,          parse: v => v }
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

  const answersData   = localStorage.getItem("airfryer_answers");
  const bestTypeData  = localStorage.getItem("airfryer_bestType");

  filterState.answers  = answersData ? JSON.parse(answersData) : null;
  filterState.bestType = bestTypeData ?? "";

  let allAirfryers = [];
  try {
    const raw = await fetchProducts();
    allAirfryers = normalizeProducts(raw ?? []);
  } catch {
    allAirfryers = [];
  }

  const result = matchAirfryers(allAirfryers, filterState.answers ?? {});
  filterState.baseMatches = Array.isArray(result.filteredMatchedAirfryers) ? result.filteredMatchedAirfryers : [];

  // Fallback: if the live fetch/computation yields nothing, seed the pool
  // with the airfryers that were already matched during the quiz.
  if (filterState.baseMatches.length === 0) {
    const storedData = localStorage.getItem("airfryer_filteredMatchedAirfryers");
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
  filterState.capaciteitGroups = computeDynamicCapaciteitGroups(filterState.baseMatches);

  filterState.priceLabels = new Set();

  renderAllFilters();

  filtersPanel.addEventListener("change", handleFilterChange);

  const clearBtn = qs("#clearFiltersBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      filterState.priceLabels.clear();
      filterState.capaciteitLabels.clear();
      filterState.constructietypen.clear();
      filterState.brands.clear();
      filterState.kleuren.clear();
      filterState.functies.clear();
      filterState.aanbieder.clear();
      filterState.minAanbieders = DEFAULT_MIN_AANBIEDERS;
      renderAllFilters();
      applyFilters();
    });
  }

  applyFilters();
}
