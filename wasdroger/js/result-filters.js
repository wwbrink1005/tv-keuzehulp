import { priceGroupsByCapaciteit, capaciteitGroupToAllowedCapaciteit, heeftDroogprogramma, DROOGPROGRAMMA_DEFINITIES } from "./data.js";
import { matchWasdrogers } from "./matching.js";
import { computeDynamicPriceGroups, computeDynamicDimensionGroups, normalizeProducts, parsePrice, qs } from "./utils.js";
import { updateResultMatches } from "./result.js";
import { fetchProducts } from "./supabase.js";
import { computeCounts, renderFilterList } from "../../shared/filters.js";

const filterState = {
  priceLabels:    new Set(),
  capaciteiten:   new Set(),
  brands:         new Set(),
  energieLabels:  new Set(),
  kleuren:        new Set(),
  // Kinderslot/Uitgestelde start/Wifi/Inverter/Anti-kreuk/Vochtsensor waren
  // 6 losse Ja/Nee-kaarten — samengevoegd tot 1 "Functies"-kaart, zelfde
  // patroon als wasmachine (zie FUNCTIE_DEFINITIES).
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
  { key: "kinderslot",       label: "Kinderslot",          check: w => w.kinderslot === "Ja" },
  { key: "uitgesteldeStart", label: "Uitgestelde start",   check: w => w.uitgesteldeStart === "Ja" },
  { key: "wifi",             label: "Wifi-bediening",      check: w => w.wifi === "Ja" },
  { key: "inverter",         label: "Inverter motor",      check: w => w.inverter === "Ja" },
  { key: "antikreuk",        label: "Anti-kreukfunctie",   check: w => w.antikreuk === "Ja" },
  { key: "vochtsensor",      label: "Vochtsensor",         check: w => w.vochtsensor === "Ja" },
];

// Price buckets are recomputed fresh from the live-fetched catalog on every
// results page load (not trusted from the quiz-time localStorage snapshot),
// zelfde reden als wasmachine.
function getDynamicPriceGroups(capaciteitGroup) {
  if (Array.isArray(filterState.priceGroups) && filterState.priceGroups.length > 0) {
    return filterState.priceGroups;
  }
  return priceGroupsByCapaciteit[capaciteitGroup] || [];
}

// Price is just another optional narrowing filter, not a hard upfront wall:
// with no bucket selected, every wasdroger matching the quiz answers is shown.
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

function collectEnergieLabelOptions(matches) {
  const set = new Set();
  matches.forEach(w => { if (w.energieLabel) set.add(w.energieLabel); });
  const order = ["A", "B", "C", "D", "E", "F", "G"];
  return order.filter(t => set.has(t));
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
  return DROOGPROGRAMMA_DEFINITIES.filter(d => matches.some(w => heeftDroogprogramma(w.droogprogrammas, d.key))).map(d => d.key);
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

  if (filterState.energieLabels.size > 0) {
    filtered = filtered.filter(w => filterState.energieLabels.has(w.energieLabel));
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
      Array.from(filterState.programmas).every(key => heeftDroogprogramma(w.droogprogrammas, key))
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

  updateClearFiltersBtn();
  updateResultMatches(filtered, filterState.answers, filterState.bestType);
}

function updateClearFiltersBtn() {
  const btn = qs("#clearFiltersBtn");
  if (!btn) return;
  const hasActive = filterState.priceLabels.size > 0 || filterState.capaciteiten.size > 0 || filterState.brands.size > 0 ||
    filterState.energieLabels.size > 0 || filterState.kleuren.size > 0 ||
    filterState.functies.size > 0 || filterState.programmas.size > 0 ||
    filterState.breedteLabels.size > 0 || filterState.diepteLabels.size > 0 || filterState.hoogteLabels.size > 0 ||
    filterState.aanbieder.size > 0;
  btn.hidden = !hasActive;
}

// Afmetingen-buckets (breedte/diepte/hoogte) worden 1x per catalogus berekend
// (zie initFilters), maar de tellingen per bucket wél elke render opnieuw op
// de actuele matches — zelfde patroon als de prijs-kaart hierboven.
function renderDimensionFilter(container, card, groups, veld, stateSet, filterName) {
  if (!container || !card) return;
  if (groups.length === 0) { container.innerHTML = ""; card.hidden = true; return; }

  const base = getBaseMatches();
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

function renderAllFilters() {
  const matches = getPriceScopedMatches();

  const priceContainer      = qs("[data-filter-container='price']");
  const capaciteitContainer = qs("[data-filter-container='capaciteit']");
  const brandContainer      = qs("[data-filter-container='brand']");
  const energieContainer    = qs("[data-filter-container='energie-label']");
  const kleurContainer      = qs("[data-filter-container='kleur']");
  const functieContainer    = qs("[data-filter-container='functies']");
  const programmaContainer  = qs("[data-filter-container='programmas']");
  const breedteContainer    = qs("[data-filter-container='breedte']");
  const diepteContainer     = qs("[data-filter-container='diepte']");
  const hoogteContainer     = qs("[data-filter-container='hoogte']");
  const aanbiederContainer  = qs("[data-filter-container='aanbieder']");

  const priceCard      = qs(".filter-card[data-filter='price']");
  const capaciteitCard = qs(".filter-card[data-filter='capaciteit']");
  const brandCard      = qs(".filter-card[data-filter='brand']");
  const energieCard    = qs(".filter-card[data-filter='energie-label']");
  const kleurCard      = qs(".filter-card[data-filter='kleur']");
  const functieCard    = qs(".filter-card[data-filter='functies']");
  const programmaCard  = qs(".filter-card[data-filter='programmas']");
  const breedteCard    = qs(".filter-card[data-filter='breedte']");
  const diepteCard     = qs(".filter-card[data-filter='diepte']");
  const hoogteCard     = qs(".filter-card[data-filter='hoogte']");
  const aanbiederCard  = qs(".filter-card[data-filter='aanbieder']");

  if (priceContainer && priceCard) {
    const groups = getDynamicPriceGroups(filterState.capaciteitGroup);
    // Only show price buckets that actually contain a matching wasdroger
    // for the current quiz answers — anders klikt de gebruiker een bucket
    // die nooit een resultaat kan tonen. Bij 1 of 0 buckets is er niks
    // zinvols om mee te verfijnen, dus de hele kaart verbergen.
    const base = getBaseMatches();
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

  if (energieContainer && energieCard) {
    renderFilterOptions(energieContainer, energieCard, collectEnergieLabelOptions(matches), matches, w => w.energieLabel, "energieLabels", l => `Label ${l}`);
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
    const programmaValueFn = w => DROOGPROGRAMMA_DEFINITIES.filter(d => heeftDroogprogramma(w.droogprogrammas, d.key)).map(d => d.key);
    const labelFn = key => DROOGPROGRAMMA_DEFINITIES.find(d => d.key === key)?.label ?? key;
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

  const setMap = {
    priceFilter:    { set: filterState.priceLabels,    parse: v => v },
    capaciteiten:   { set: filterState.capaciteiten,   parse: v => parseFloat(v) },
    brands:         { set: filterState.brands,         parse: v => v },
    energieLabels:  { set: filterState.energieLabels,  parse: v => v },
    kleuren:        { set: filterState.kleuren,        parse: v => v },
    functies:       { set: filterState.functies,       parse: v => v },
    programmas:     { set: filterState.programmas,     parse: v => v },
    breedteLabels:  { set: filterState.breedteLabels,  parse: v => v },
    diepteLabels:   { set: filterState.diepteLabels,   parse: v => v },
    hoogteLabels:   { set: filterState.hoogteLabels,   parse: v => v },
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
  const answersData          = localStorage.getItem("wasdroger_answers");
  const capaciteitGroupData  = localStorage.getItem("wasdroger_selectedCapaciteitGroup");
  const bestTypeData         = localStorage.getItem("wasdroger_bestType");

  filterState.answers         = answersData ? JSON.parse(answersData) : null;
  filterState.capaciteitGroup = capaciteitGroupData ?? "";
  filterState.bestType        = bestTypeData ?? "";

  // Fetch & normalize all wasdrogers
  let allWasdrogers = [];
  try {
    const raw = await fetchProducts();
    allWasdrogers = normalizeProducts(raw ?? []);
  } catch {
    allWasdrogers = [];
  }

  filterState.priceGroups   = computeDynamicPriceGroups(allWasdrogers, filterState.capaciteitGroup, capaciteitGroupToAllowedCapaciteit);
  filterState.breedteGroups = computeDynamicDimensionGroups(allWasdrogers, "breedteMm");
  filterState.diepteGroups  = computeDynamicDimensionGroups(allWasdrogers, "diepteMm");
  filterState.hoogteGroups  = computeDynamicDimensionGroups(allWasdrogers, "hoogteMm");

  // No budget question was asked during the quiz, so the base match set is
  // computed with priceGroup = null (the full, price-unrestricted result).
  const result = matchWasdrogers(allWasdrogers, filterState.capaciteitGroup, null, filterState.answers);
  filterState.baseMatches = Array.isArray(result.filteredMatchedWasdrogers) ? result.filteredMatchedWasdrogers : [];

  // Fallback: if the live fetch/computation yields nothing, seed the pool
  // with the wasdrogers that were already matched during the quiz.
  if (filterState.baseMatches.length === 0) {
    const storedData = localStorage.getItem("wasdroger_filteredMatchedWasdrogers");
    if (storedData) {
      try {
        const storedWasdrogers = JSON.parse(storedData);
        if (Array.isArray(storedWasdrogers) && storedWasdrogers.length > 0) {
          filterState.baseMatches = storedWasdrogers;
        }
      } catch { /* ignore */ }
    }
  }

  // No price bucket selected by default: show every matching wasdroger and
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
      filterState.energieLabels.clear();
      filterState.kleuren.clear();
      filterState.functies.clear();
      filterState.programmas.clear();
      filterState.breedteLabels.clear();
      filterState.diepteLabels.clear();
      filterState.hoogteLabels.clear();
      filterState.aanbieder.clear();
      renderAllFilters();
      applyFilters();
    });
  }

  // Always use the freshly computed matches so the initial render
  // is consistent with what applyFilters() will produce later.
  applyFilters();
}
