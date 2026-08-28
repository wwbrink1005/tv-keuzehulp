import { priceGroupsByCapaciteit, capaciteitGroupToAllowedCapaciteit, heeftWasprogramma, WASPROGRAMMA_DEFINITIES } from "./data.js";
import { matchWasmachines, applyMinAanbiedersCascade, DEFAULT_MIN_AANBIEDERS } from "./matching.js";
import { computeDynamicPriceGroups, computeDynamicDimensionGroups, normalizeProducts, parsePrice, qs } from "./utils.js";
import { updateResultMatches } from "./result.js";
import { fetchProducts } from "./supabase.js";
import { computeCounts, renderFilterList } from "../../shared/filters.js";

const MIN_AANBIEDERS_OPTIONS = [1, 2, 3, 4, 5];

const filterState = {
  priceLabels:    new Set(),
  minAanbieders:  DEFAULT_MIN_AANBIEDERS,
  capaciteiten:   new Set(),
  brands:         new Set(),
  typeLaders:     new Set(),
  energieLabels:  new Set(),
  centrifugeRpms: new Set(),
  kleuren:        new Set(),
  // Kinderslot/AquaStop/Uitgestelde start/Inverter waren 4 losse Ja/Nee-
  // kaarten — samengevoegd tot 1 "Functies"-kaart (zie FUNCTIE_DEFINITIES).
  functies:       new Set(),
  programmas:     new Set(),
  breedteLabels:  new Set(),
  diepteLabels:   new Set(),
  hoogteLabels:   new Set(),
  aanbieder:      new Set(),
  baseMatches:    [],
  answers:        null,
  bestType:       "",
  capaciteitGroup: ""
};

const FUNCTIE_DEFINITIES = [
  { key: "kinderslot", label: "Kinderslot", check: w => w.kinderslot === "Ja" },
  { key: "aquastop", label: "AquaStop", check: w => w.aquastop === "Ja" },
  { key: "uitgesteldeStart", label: "Uitgestelde start", check: w => w.uitgesteldeStart === "Ja" },
  { key: "inverter", label: "Inverter motor", check: w => w.inverter === "Ja" },
];

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

function getSecondaryScopedMatches() {
  return getPriceScopedMatches().filter(w => (w.aanbieders ?? []).length >= filterState.minAanbieders);
}

function getBaseScopedByMinAanbieders() {
  return getBaseMatches().filter(w => (w.aanbieders ?? []).length >= filterState.minAanbieders);
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

function collectFunctieOptions(matches) {
  return FUNCTIE_DEFINITIES.filter(f => matches.some(f.check)).map(f => f.key);
}

function collectProgrammaOptions(matches) {
  return WASPROGRAMMA_DEFINITIES.filter(d => matches.some(w => heeftWasprogramma(w.wasprogrammas, d.key))).map(d => d.key);
}

function collectAanbiederOptions(matches) {
  const set = new Set();
  matches.forEach(w => {
    (w.aanbieders ?? []).forEach(a => set.add(a.winkel));
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

  if (filterState.functies.size > 0) {
    filtered = filtered.filter(w =>
      FUNCTIE_DEFINITIES.filter(f => filterState.functies.has(f.key)).every(f => f.check(w))
    );
  }

  if (filterState.programmas.size > 0) {
    filtered = filtered.filter(w =>
      Array.from(filterState.programmas).every(key => heeftWasprogramma(w.wasprogrammas, key))
    );
  }

  if (filterState.breedteLabels.size > 0) {
    const groups = filterState.breedteGroups.filter(g => filterState.breedteLabels.has(g.label));
    filtered = filtered.filter(w => Number.isFinite(w.breedteMm) && groups.some(g => w.breedteMm / 10 >= g.min && w.breedteMm / 10 < g.max));
  }

  if (filterState.diepteLabels.size > 0) {
    const groups = filterState.diepteGroups.filter(g => filterState.diepteLabels.has(g.label));
    filtered = filtered.filter(w => Number.isFinite(w.diepteMm) && groups.some(g => w.diepteMm / 10 >= g.min && w.diepteMm / 10 < g.max));
  }

  if (filterState.hoogteLabels.size > 0) {
    const groups = filterState.hoogteGroups.filter(g => filterState.hoogteLabels.has(g.label));
    filtered = filtered.filter(w => Number.isFinite(w.hoogteMm) && groups.some(g => w.hoogteMm / 10 >= g.min && w.hoogteMm / 10 < g.max));
  }

  if (filterState.aanbieder.size > 0) {
    filtered = filtered.filter(w =>
      (w.aanbieders ?? []).some(a => filterState.aanbieder.has(a.winkel))
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
  const hasActive = filterState.priceLabels.size > 0 || filterState.capaciteiten.size > 0 || filterState.brands.size > 0 ||
    filterState.typeLaders.size > 0 || filterState.energieLabels.size > 0 ||
    filterState.centrifugeRpms.size > 0 || filterState.kleuren.size > 0 ||
    filterState.functies.size > 0 || filterState.programmas.size > 0 ||
    filterState.breedteLabels.size > 0 || filterState.diepteLabels.size > 0 || filterState.hoogteLabels.size > 0 ||
    filterState.aanbieder.size > 0 || filterState.minAanbieders !== DEFAULT_MIN_AANBIEDERS;
  btn.hidden = !hasActive;
}

// Afmetingen-buckets (breedte/diepte/hoogte) worden 1x per catalogus berekend
// (zie initFilters), maar de tellingen per bucket wél elke render opnieuw op
// de actuele matches — zelfde patroon als de prijs-kaart hierboven, alleen
// hergebruikt voor 3 velden i.p.v. eenmalig uitgeschreven.
function renderDimensionFilter(container, card, groups, veld, stateSet, filterName) {
  if (!container || !card) return;
  if (groups.length === 0) { container.innerHTML = ""; card.hidden = true; return; }

  const base = getBaseScopedByMinAanbieders();
  const groupForMm = mm => Number.isFinite(mm) ? groups.find(g => mm / 10 >= g.min && mm / 10 < g.max) : undefined;
  const counts = computeCounts(base, w => groupForMm(w[veld])?.label);
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
    count: matches.filter(w => (w.aanbieders ?? []).length >= n).length,
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
  const capaciteitContainer = qs("[data-filter-container='capaciteit']");
  const brandContainer      = qs("[data-filter-container='brand']");
  const typeLaderContainer  = qs("[data-filter-container='type-lader']");
  const energieContainer    = qs("[data-filter-container='energie-label']");
  const rpmContainer        = qs("[data-filter-container='centrifuge-rpm']");
  const kleurContainer      = qs("[data-filter-container='kleur']");
  const functieContainer   = qs("[data-filter-container='functies']");
  const programmaContainer = qs("[data-filter-container='programmas']");
  const breedteContainer   = qs("[data-filter-container='breedte']");
  const diepteContainer    = qs("[data-filter-container='diepte']");
  const hoogteContainer    = qs("[data-filter-container='hoogte']");
  const aanbiederContainer  = qs("[data-filter-container='aanbieder']");

  const priceCard      = qs(".filter-card[data-filter='price']");
  const capaciteitCard  = qs(".filter-card[data-filter='capaciteit']");
  const brandCard       = qs(".filter-card[data-filter='brand']");
  const typeLaderCard   = qs(".filter-card[data-filter='type-lader']");
  const energieCard     = qs(".filter-card[data-filter='energie-label']");
  const rpmCard         = qs(".filter-card[data-filter='centrifuge-rpm']");
  const kleurCard       = qs(".filter-card[data-filter='kleur']");
  const functieCard    = qs(".filter-card[data-filter='functies']");
  const programmaCard  = qs(".filter-card[data-filter='programmas']");
  const breedteCard     = qs(".filter-card[data-filter='breedte']");
  const diepteCard      = qs(".filter-card[data-filter='diepte']");
  const hoogteCard      = qs(".filter-card[data-filter='hoogte']");
  const aanbiederCard   = qs(".filter-card[data-filter='aanbieder']");
  const minAanbiedersCard = qs(".filter-card[data-filter='min-aanbieders']");

  renderMinAanbiedersOptions(minAanbiedersContainer, minAanbiedersCard);
  const matches = getSecondaryScopedMatches();

  if (priceContainer && priceCard) {
    const groups = getDynamicPriceGroups(filterState.capaciteitGroup);
    // Only show price buckets that actually contain a matching wasmachine
    // for the current quiz answers — otherwise users click a bucket that
    // can never show a result. If there's only one (or zero) non-empty
    // bucket there's nothing meaningful to narrow, so hide the whole card.
    const base = getBaseScopedByMinAanbieders();
    const groupForPrice = price => groups.find(g => price >= g.min && price <= g.max);
    const counts = computeCounts(base, w => groupForPrice(parsePrice(w.prijs))?.label);
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
    renderFilterOptions(capaciteitContainer, capaciteitCard, collectCapaciteitOptions(matches), matches, w => w.capaciteit, "capaciteiten", c => `${c} kg`);
  }

  if (brandContainer && brandCard) {
    renderFilterOptions(brandContainer, brandCard, collectBrandOptions(matches), matches, w => formatBrandLabel(w.merk), "brands");
  }

  if (typeLaderContainer && typeLaderCard) {
    renderFilterOptions(typeLaderContainer, typeLaderCard, collectTypeLaderOptions(matches), matches, w => w.typeLader, "typeLaders");
  }

  if (energieContainer && energieCard) {
    renderFilterOptions(energieContainer, energieCard, collectEnergieLabelOptions(matches), matches, w => w.energieLabel, "energieLabels", l => `Label ${l}`);
  }

  if (rpmContainer && rpmCard) {
    renderFilterOptions(rpmContainer, rpmCard, collectCentrifugeRpmOptions(matches), matches, w => w.centrifugeRpm, "centrifugeRpms", r => `${r} RPM`);
  }

  if (kleurContainer && kleurCard) {
    renderFilterOptions(kleurContainer, kleurCard, collectKleurOptions(matches), matches, w => normalizeKleur(w.kleur), "kleuren");
  }

  if (functieContainer && functieCard) {
    const functieValueFn = w => FUNCTIE_DEFINITIES.filter(f => f.check(w)).map(f => f.key);
    const labelFn = key => FUNCTIE_DEFINITIES.find(f => f.key === key)?.label ?? key;
    renderFilterOptions(functieContainer, functieCard, collectFunctieOptions(matches), matches, functieValueFn, "functies", labelFn);
  }

  if (programmaContainer && programmaCard) {
    const programmaValueFn = w => WASPROGRAMMA_DEFINITIES.filter(d => heeftWasprogramma(w.wasprogrammas, d.key)).map(d => d.key);
    const labelFn = key => WASPROGRAMMA_DEFINITIES.find(d => d.key === key)?.label ?? key;
    renderFilterOptions(programmaContainer, programmaCard, collectProgrammaOptions(matches), matches, programmaValueFn, "programmas", labelFn);
  }

  renderDimensionFilter(breedteContainer, breedteCard, filterState.breedteGroups, "breedteMm", filterState.breedteLabels, "breedteLabels");
  renderDimensionFilter(diepteContainer, diepteCard, filterState.diepteGroups, "diepteMm", filterState.diepteLabels, "diepteLabels");
  renderDimensionFilter(hoogteContainer, hoogteCard, filterState.hoogteGroups, "hoogteMm", filterState.hoogteLabels, "hoogteLabels");

  if (aanbiederContainer && aanbiederCard) {
    renderFilterOptions(aanbiederContainer, aanbiederCard, collectAanbiederOptions(matches), matches, w => (w.aanbieders ?? []).map(a => a.winkel), "aanbieder");
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
    priceFilter:    { set: filterState.priceLabels,    parse: v => v },
    capaciteiten:   { set: filterState.capaciteiten,   parse: v => parseFloat(v) },
    brands:         { set: filterState.brands,         parse: v => v },
    typeLaders:     { set: filterState.typeLaders,     parse: v => v },
    energieLabels:  { set: filterState.energieLabels,  parse: v => v },
    centrifugeRpms: { set: filterState.centrifugeRpms, parse: v => parseInt(v, 10) },
    kleuren:        { set: filterState.kleuren,        parse: v => v },
    functies:       { set: filterState.functies,       parse: v => v },
    programmas:     { set: filterState.programmas,     parse: v => v },
    breedteLabels:  { set: filterState.breedteLabels,  parse: v => v },
    diepteLabels:   { set: filterState.diepteLabels,   parse: v => v },
    hoogteLabels:   { set: filterState.hoogteLabels,   parse: v => v },
    aanbieder:      { set: filterState.aanbieder,      parse: v => v }
  };

  if (!setMap[name]) return;

  const { set, parse, exclusive } = setMap[name];

  if (value === "all") {
    set.clear();
  } else {
    const parsed = parse(value);
    if (input.checked) {
      // "Ja"/"Nee"-achtige filters zijn elkaars tegenpolen: aanvinken van
      // de één moet de ander automatisch uitvinken (anders slaat "Ja" én
      // "Nee" tegelijk aanvinken nergens op naast de "Alle"-optie).
      if (exclusive) set.clear();
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
  const capaciteitGroupData  = localStorage.getItem("wasmachine_selectedCapaciteitGroup");
  const bestTypeData         = localStorage.getItem("wasmachine_bestType");

  filterState.answers         = answersData ? JSON.parse(answersData) : null;
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

  filterState.priceGroups   = computeDynamicPriceGroups(allWasmachines, filterState.capaciteitGroup, capaciteitGroupToAllowedCapaciteit);
  filterState.breedteGroups = computeDynamicDimensionGroups(allWasmachines, "breedteMm");
  filterState.diepteGroups  = computeDynamicDimensionGroups(allWasmachines, "diepteMm");
  filterState.hoogteGroups  = computeDynamicDimensionGroups(allWasmachines, "hoogteMm");

  // No budget question was asked during the quiz, so the base match set is
  // computed with priceGroup = null (the full, price-unrestricted result).
  const result = matchWasmachines(allWasmachines, filterState.capaciteitGroup, null, filterState.answers);
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
      filterState.functies.clear();
      filterState.programmas.clear();
      filterState.breedteLabels.clear();
      filterState.diepteLabels.clear();
      filterState.hoogteLabels.clear();
      filterState.aanbieder.clear();
      filterState.minAanbieders = DEFAULT_MIN_AANBIEDERS;
      renderAllFilters();
      applyFilters();
    });
  }

  // Always use the freshly computed matches so the initial render
  // is consistent with what applyFilters() will produce later.
  applyFilters();
}
