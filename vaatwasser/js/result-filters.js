import { priceGroupsFallback } from "./data.js";
import { matchVaatwassers, heeftAfwasprogramma } from "./matching.js";
import { computeDynamicPriceGroups, computeDynamicDimensionGroups, normalizeProducts, parsePrice, qs } from "./utils.js";
import { updateResultMatches } from "./result.js";
import { fetchProducts } from "./supabase.js";
import { computeCounts, renderFilterList } from "../../shared/filters.js";

const filterState = {
  priceLabels:   new Set(),
  plaatsingDetails: new Set(),
  couvertsSet:   new Set(),
  brands:        new Set(),
  energieLabels: new Set(),
  droogsystemen: new Set(),
  bestekTypes:   new Set(),
  kleuren:       new Set(),
  // 10 Ja/Nee-eigenschappen samengevoegd tot 1 "Functies"-kaart (zie
  // FUNCTIE_DEFINITIES) — waarvan er 8 ook als quiz-vraag (Q5) voorkomen, en
  // automatische deuropening/vloerindicatielampje bewust alleen hier zitten
  // (te niche voor een verplichte quizvraag, wel de moeite waard als filter).
  functies:      new Set(),
  programmas:    new Set(),
  breedteLabels: new Set(),
  diepteLabels:  new Set(),
  hoogteLabels:  new Set(),
  aanbieder:     new Set(),
  baseMatches:   [],
  answers:       null,
  bestType:      "",
};

const PROGRAMMA_LABELS = {
  eco: "Eco", intensief: "Intensief", snel: "Snel", stil: "Stil",
  voorwas: "Voorwas", glas: "Glas/Breekbaar",
};

const FUNCTIE_DEFINITIES = [
  { key: "kinderslot",              label: "Kinderslot",                  check: v => v.kinderslot === "Ja" },
  { key: "halve-lading",             label: "Halve lading",                check: v => v.halveLading === "Ja" },
  { key: "wifi",                     label: "Wifi/app-bediening",          check: v => v.wifi === "Ja" },
  { key: "verstelbare-bovenkorf",    label: "In hoogte verstelbare bovenkorf", check: v => v.verstelbareBovenkorf === "Ja" },
  { key: "aquastop",                 label: "AquaStop",                    check: v => v.aquastop === "Ja" },
  { key: "inverter",                 label: "Inverter motor",              check: v => v.inverter === "Ja" },
  { key: "glasbescherming",          label: "Glasbescherming",             check: v => v.glasbescherming === "Ja" },
  { key: "extra-droog",              label: "Extra droge vaat (droogklasse A)", check: v => v.droogprestaties === "A" },
  { key: "automatische-deuropening", label: "Automatische deuropening",    check: v => v.automatischeDeuropening === "Ja" },
  { key: "vloerlampje",              label: "Vloerindicatielampje",        check: v => v.vloerlampje === "Ja" },
];

// Price buckets are recomputed fresh from the live-fetched, plaatsing-
// gefilterde catalogus op elke resultaatpagina-load, nooit vertrouwd op de
// quiz-time localStorage-snapshot.
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
  return base.filter(v => {
    const price = parsePrice(v.prijs);
    return groups.some(g => price >= g.min && price <= g.max);
  });
}

function formatBrandLabel(brand) {
  const raw = String(brand ?? "").trim();
  if (!raw) return "";
  if (raw === raw.toUpperCase()) return raw;
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function collectPlaatsingDetailOptions(matches) {
  const set = new Set();
  matches.forEach(v => { if (v.plaatsingDetail) set.add(v.plaatsingDetail); });
  const order = ["Volledig ingebouwd", "Semi-ingebouwd", "Onderbouw", "Vrijstaand", "Aanrecht"];
  const inOrder = order.filter(t => set.has(t));
  set.forEach(t => { if (!order.includes(t)) inOrder.push(t); });
  return inOrder;
}

function collectCouvertsOptions(matches) {
  const set = new Set();
  matches.forEach(v => { if (v.couverts) set.add(v.couverts); });
  return Array.from(set).sort((a, b) => a - b);
}

function collectBrandOptions(matches) {
  const set = new Set();
  matches.forEach(v => { const label = formatBrandLabel(v.merk); if (label) set.add(label); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "nl"));
}

function collectEnergieLabelOptions(matches) {
  const set = new Set();
  matches.forEach(v => { if (v.energieLabel) set.add(v.energieLabel); });
  const order = ["A", "B", "C", "D", "E", "F", "G"];
  return order.filter(t => set.has(t));
}

function collectDroogsysteemOptions(matches) {
  const set = new Set();
  matches.forEach(v => { if (v.droogsysteem) set.add(v.droogsysteem); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "nl"));
}

function collectBestekTypeOptions(matches) {
  const set = new Set();
  matches.forEach(v => { if (v.bestekType) set.add(v.bestekType); });
  const order = ["Mand", "Lade", "Mand & lade"];
  const inOrder = order.filter(t => set.has(t));
  set.forEach(t => { if (!order.includes(t)) inOrder.push(t); });
  return inOrder;
}

function normalizeKleur(kleur) {
  const raw = String(kleur ?? "").trim();
  if (!raw) return "";
  return raw.split(",").map(s => s.trim()).filter(Boolean).sort().join(", ");
}

function collectKleurOptions(matches) {
  const set = new Set();
  matches.forEach(v => { const k = normalizeKleur(v.kleur); if (k) set.add(k); });
  const order = ["Wit", "Zwart", "Roestvrijstaal", "Antraciet", "Grijs", "Zilver"];
  const inOrder = order.filter(t => set.has(t));
  set.forEach(t => { if (!order.includes(t)) inOrder.push(t); });
  return inOrder;
}

function collectFunctieOptions(matches) {
  return FUNCTIE_DEFINITIES.filter(f => matches.some(f.check)).map(f => f.key);
}

function collectProgrammaOptions(matches) {
  return Object.keys(PROGRAMMA_LABELS).filter(key => matches.some(v => heeftAfwasprogramma(v.afwasprogrammas, key)));
}

function collectAanbiederOptions(matches) {
  const set = new Set();
  matches.forEach(v => {
    (v.aanbieders ?? []).forEach(a => set.add(a.winkel));
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

  if (filterState.plaatsingDetails.size > 0) {
    filtered = filtered.filter(v => filterState.plaatsingDetails.has(v.plaatsingDetail));
  }

  if (filterState.couvertsSet.size > 0) {
    filtered = filtered.filter(v => filterState.couvertsSet.has(v.couverts));
  }

  if (filterState.brands.size > 0) {
    filtered = filtered.filter(v => filterState.brands.has(formatBrandLabel(v.merk)));
  }

  if (filterState.energieLabels.size > 0) {
    filtered = filtered.filter(v => filterState.energieLabels.has(v.energieLabel));
  }

  if (filterState.droogsystemen.size > 0) {
    filtered = filtered.filter(v => filterState.droogsystemen.has(v.droogsysteem));
  }

  if (filterState.bestekTypes.size > 0) {
    filtered = filtered.filter(v => filterState.bestekTypes.has(v.bestekType));
  }

  if (filterState.kleuren.size > 0) {
    filtered = filtered.filter(v => filterState.kleuren.has(normalizeKleur(v.kleur)));
  }

  if (filterState.functies.size > 0) {
    filtered = filtered.filter(v =>
      FUNCTIE_DEFINITIES.filter(f => filterState.functies.has(f.key)).every(f => f.check(v))
    );
  }

  if (filterState.programmas.size > 0) {
    filtered = filtered.filter(v =>
      Array.from(filterState.programmas).every(key => heeftAfwasprogramma(v.afwasprogrammas, key))
    );
  }

  if (filterState.breedteLabels.size > 0) {
    const groups = filterState.breedteGroups.filter(g => filterState.breedteLabels.has(g.label));
    filtered = filtered.filter(v => Number.isFinite(v.breedteMm) && groups.some(g => v.breedteMm / 10 >= g.min && v.breedteMm / 10 < g.max));
  }

  if (filterState.diepteLabels.size > 0) {
    const groups = filterState.diepteGroups.filter(g => filterState.diepteLabels.has(g.label));
    filtered = filtered.filter(v => Number.isFinite(v.diepteMm) && groups.some(g => v.diepteMm / 10 >= g.min && v.diepteMm / 10 < g.max));
  }

  if (filterState.hoogteLabels.size > 0) {
    const groups = filterState.hoogteGroups.filter(g => filterState.hoogteLabels.has(g.label));
    filtered = filtered.filter(v => Number.isFinite(v.hoogteMm) && groups.some(g => v.hoogteMm / 10 >= g.min && v.hoogteMm / 10 < g.max));
  }

  if (filterState.aanbieder.size > 0) {
    filtered = filtered.filter(v =>
      (v.aanbieders ?? []).some(a => filterState.aanbieder.has(a.winkel))
    );
  }

  updateClearFiltersBtn();
  updateResultMatches(filtered, filterState.answers, filterState.bestType);
}

function updateClearFiltersBtn() {
  const btn = qs("#clearFiltersBtn");
  if (!btn) return;
  const hasActive = filterState.priceLabels.size > 0 || filterState.plaatsingDetails.size > 0 || filterState.couvertsSet.size > 0 || filterState.brands.size > 0 ||
    filterState.energieLabels.size > 0 || filterState.droogsystemen.size > 0 || filterState.bestekTypes.size > 0 ||
    filterState.kleuren.size > 0 || filterState.functies.size > 0 || filterState.programmas.size > 0 ||
    filterState.breedteLabels.size > 0 || filterState.diepteLabels.size > 0 || filterState.hoogteLabels.size > 0 ||
    filterState.aanbieder.size > 0;
  btn.hidden = !hasActive;
}

function renderDimensionFilter(container, card, groups, veld, stateSet, filterName) {
  if (!container || !card) return;
  if (groups.length === 0) { container.innerHTML = ""; card.hidden = true; return; }

  const base = getBaseMatches();
  const groupForMm = mm => Number.isFinite(mm) ? groups.find(g => mm / 10 >= g.min && mm / 10 < g.max) : undefined;
  const counts = computeCounts(base, v => groupForMm(v[veld])?.label);
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
  const plaatsingDetailContainer = qs("[data-filter-container='plaatsing-detail']");
  const couvertsContainer   = qs("[data-filter-container='couverts']");
  const brandContainer      = qs("[data-filter-container='brand']");
  const energieContainer    = qs("[data-filter-container='energie-label']");
  const droogsysteemContainer = qs("[data-filter-container='droogsysteem']");
  const bestekContainer     = qs("[data-filter-container='bestek-type']");
  const kleurContainer      = qs("[data-filter-container='kleur']");
  const functieContainer    = qs("[data-filter-container='functies']");
  const programmaContainer  = qs("[data-filter-container='programmas']");
  const breedteContainer    = qs("[data-filter-container='breedte']");
  const diepteContainer     = qs("[data-filter-container='diepte']");
  const hoogteContainer     = qs("[data-filter-container='hoogte']");
  const aanbiederContainer  = qs("[data-filter-container='aanbieder']");

  const priceCard        = qs(".filter-card[data-filter='price']");
  const plaatsingDetailCard = qs(".filter-card[data-filter='plaatsing-detail']");
  const couvertsCard     = qs(".filter-card[data-filter='couverts']");
  const brandCard        = qs(".filter-card[data-filter='brand']");
  const energieCard      = qs(".filter-card[data-filter='energie-label']");
  const droogsysteemCard = qs(".filter-card[data-filter='droogsysteem']");
  const bestekCard       = qs(".filter-card[data-filter='bestek-type']");
  const kleurCard        = qs(".filter-card[data-filter='kleur']");
  const functieCard      = qs(".filter-card[data-filter='functies']");
  const programmaCard    = qs(".filter-card[data-filter='programmas']");
  const breedteCard      = qs(".filter-card[data-filter='breedte']");
  const diepteCard       = qs(".filter-card[data-filter='diepte']");
  const hoogteCard       = qs(".filter-card[data-filter='hoogte']");
  const aanbiederCard    = qs(".filter-card[data-filter='aanbieder']");

  if (priceContainer && priceCard) {
    const groups = getDynamicPriceGroups();
    const base = getBaseMatches();
    const groupForPrice = price => groups.find(g => price >= g.min && price <= g.max);
    const counts = computeCounts(base, v => groupForPrice(parsePrice(v.prijs))?.label);
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

  if (plaatsingDetailContainer && plaatsingDetailCard) {
    renderFilterOptions(plaatsingDetailContainer, plaatsingDetailCard, collectPlaatsingDetailOptions(matches), matches, v => v.plaatsingDetail, "plaatsingDetails");
  }

  if (couvertsContainer && couvertsCard) {
    renderFilterOptions(couvertsContainer, couvertsCard, collectCouvertsOptions(matches), matches, v => v.couverts, "couvertsSet", c => `${c} couverts`);
  }

  if (brandContainer && brandCard) {
    renderFilterOptions(brandContainer, brandCard, collectBrandOptions(matches), matches, v => formatBrandLabel(v.merk), "brands");
  }

  if (energieContainer && energieCard) {
    renderFilterOptions(energieContainer, energieCard, collectEnergieLabelOptions(matches), matches, v => v.energieLabel, "energieLabels", l => `Label ${l}`);
  }

  if (droogsysteemContainer && droogsysteemCard) {
    renderFilterOptions(droogsysteemContainer, droogsysteemCard, collectDroogsysteemOptions(matches), matches, v => v.droogsysteem, "droogsystemen");
  }

  if (bestekContainer && bestekCard) {
    renderFilterOptions(bestekContainer, bestekCard, collectBestekTypeOptions(matches), matches, v => v.bestekType, "bestekTypes");
  }

  if (kleurContainer && kleurCard) {
    renderFilterOptions(kleurContainer, kleurCard, collectKleurOptions(matches), matches, v => normalizeKleur(v.kleur), "kleuren");
  }

  if (functieContainer && functieCard) {
    const functieValueFn = v => FUNCTIE_DEFINITIES.filter(f => f.check(v)).map(f => f.key);
    const labelFn = key => FUNCTIE_DEFINITIES.find(f => f.key === key)?.label ?? key;
    renderFilterOptions(functieContainer, functieCard, collectFunctieOptions(matches), matches, functieValueFn, "functies", labelFn);
  }

  if (programmaContainer && programmaCard) {
    const programmaValueFn = v => Object.keys(PROGRAMMA_LABELS).filter(key => heeftAfwasprogramma(v.afwasprogrammas, key));
    const labelFn = key => PROGRAMMA_LABELS[key] ?? key;
    renderFilterOptions(programmaContainer, programmaCard, collectProgrammaOptions(matches), matches, programmaValueFn, "programmas", labelFn);
  }

  renderDimensionFilter(breedteContainer, breedteCard, filterState.breedteGroups, "breedteMm", filterState.breedteLabels, "breedteLabels");
  renderDimensionFilter(diepteContainer, diepteCard, filterState.diepteGroups, "diepteMm", filterState.diepteLabels, "diepteLabels");
  renderDimensionFilter(hoogteContainer, hoogteCard, filterState.hoogteGroups, "hoogteMm", filterState.hoogteLabels, "hoogteLabels");

  if (aanbiederContainer && aanbiederCard) {
    renderFilterOptions(aanbiederContainer, aanbiederCard, collectAanbiederOptions(matches), matches, v => (v.aanbieders ?? []).map(a => a.winkel), "aanbieder");
  }

  updateClearFiltersBtn();
}

function handleFilterChange(event) {
  const input = event.target.closest("input");
  if (!input) return;

  const name  = input.name;
  const value = input.value;

  const setMap = {
    priceFilter:      { set: filterState.priceLabels,      parse: v => v },
    plaatsingDetails: { set: filterState.plaatsingDetails, parse: v => v },
    couvertsSet:    { set: filterState.couvertsSet,   parse: v => parseInt(v, 10) },
    brands:         { set: filterState.brands,        parse: v => v },
    energieLabels:  { set: filterState.energieLabels, parse: v => v },
    droogsystemen:  { set: filterState.droogsystemen, parse: v => v },
    bestekTypes:    { set: filterState.bestekTypes,   parse: v => v },
    kleuren:        { set: filterState.kleuren,       parse: v => v },
    functies:       { set: filterState.functies,      parse: v => v },
    programmas:     { set: filterState.programmas,    parse: v => v },
    breedteLabels:  { set: filterState.breedteLabels, parse: v => v },
    diepteLabels:   { set: filterState.diepteLabels,  parse: v => v },
    hoogteLabels:   { set: filterState.hoogteLabels,  parse: v => v },
    aanbieder:      { set: filterState.aanbieder,     parse: v => v }
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

  const answersData   = localStorage.getItem("vaatwasser_answers");
  const bestTypeData  = localStorage.getItem("vaatwasser_bestType");

  filterState.answers  = answersData ? JSON.parse(answersData) : null;
  filterState.bestType = bestTypeData ?? "";

  let allVaatwassers = [];
  try {
    const raw = await fetchProducts();
    allVaatwassers = normalizeProducts(raw ?? []);
  } catch {
    allVaatwassers = [];
  }

  // No budget question was asked during the quiz, so the base match set is
  // computed with the full answers object (plaatsing komt uit filterState.answers).
  const result = matchVaatwassers(allVaatwassers, filterState.answers ?? {});
  filterState.baseMatches = Array.isArray(result.filteredMatchedVaatwassers) ? result.filteredMatchedVaatwassers : [];

  // Fallback: if the live fetch/computation yields nothing, seed the pool
  // with the vaatwassers that were already matched during the quiz.
  if (filterState.baseMatches.length === 0) {
    const storedData = localStorage.getItem("vaatwasser_filteredMatchedVaatwassers");
    if (storedData) {
      try {
        const storedVaatwassers = JSON.parse(storedData);
        if (Array.isArray(storedVaatwassers) && storedVaatwassers.length > 0) {
          filterState.baseMatches = storedVaatwassers;
        }
      } catch { /* ignore */ }
    }
  }

  filterState.priceGroups   = computeDynamicPriceGroups(filterState.baseMatches);
  filterState.breedteGroups = computeDynamicDimensionGroups(filterState.baseMatches, "breedteMm");
  filterState.diepteGroups  = computeDynamicDimensionGroups(filterState.baseMatches, "diepteMm");
  filterState.hoogteGroups  = computeDynamicDimensionGroups(filterState.baseMatches, "hoogteMm");

  filterState.priceLabels = new Set();

  renderAllFilters();

  filtersPanel.addEventListener("change", handleFilterChange);

  const clearBtn = qs("#clearFiltersBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      filterState.priceLabels.clear();
      filterState.plaatsingDetails.clear();
      filterState.couvertsSet.clear();
      filterState.brands.clear();
      filterState.energieLabels.clear();
      filterState.droogsystemen.clear();
      filterState.bestekTypes.clear();
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

  applyFilters();
}
