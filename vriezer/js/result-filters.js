import { matchVriezers } from "./matching.js";
import { GESCHIKT_VOOR_GARAGE_KLASSEN } from "./data.js";
import { computeDynamicPriceGroups, computeDynamicDimensionGroups, normalizeProducts, parsePrice, qs } from "./utils.js";
import { updateResultMatches } from "./result.js";
import { fetchProducts } from "./supabase.js";
import { computeCounts, renderFilterList } from "../../shared/filters.js";

const PLAATSING_LABELS = {
  inbouw:     "Inbouw",
  vrijstaand: "Vrijstaand kastmodel",
  vrieskist:  "Vrieskist",
};

const filterState = {
  priceLabels:   new Set(),
  plaatsingen:   new Set(),
  brands:        new Set(),
  capaciteiten:  new Set(),
  energielabels: new Set(),
  nofrost:       new Set(),
  geluid:        new Set(),
  garage:        new Set(),
  breedteLabels: new Set(),
  diepteLabels:  new Set(),
  hoogteLabels:  new Set(),
  aanbieder:     new Set(),
  baseMatches:   [],
  priceGroups:   [],
  breedteGroups: [],
  diepteGroups:  [],
  hoogteGroups:  [],
  answers:       null,
  bestType:      ""
};

// Price buckets are recomputed fresh from the live-fetched catalog on every
// results page load (not trusted from the quiz-time localStorage snapshot).
function getDynamicPriceGroups() {
  return filterState.priceGroups;
}

function formatBrandLabel(brand) {
  const raw = String(brand ?? "").trim();
  if (!raw) return "";
  if (raw === raw.toUpperCase()) return raw;
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function capaciteitBucketLabel(l) {
  if (!Number.isFinite(l)) return null;
  if (l < 100) return "< 100 L";
  if (l < 200) return "100 - 200 L";
  if (l < 350) return "200 - 350 L";
  return "350+ L";
}

const CAPACITEIT_ORDER = ["< 100 L", "100 - 200 L", "200 - 350 L", "350+ L"];

function getBaseMatches() {
  return filterState.baseMatches;
}

function getPriceScopedMatches() {
  const base = getBaseMatches();
  if (filterState.priceLabels.size === 0) return base;
  const groups = getDynamicPriceGroups().filter(g => filterState.priceLabels.has(g.label));
  if (groups.length === 0) return base;
  return base.filter(v => {
    const price = parsePrice(v.prijs);
    return groups.some(g => price >= g.min && price <= g.max);
  });
}

function collectPlaatsingOptions(matches) {
  const set = new Set();
  matches.forEach(v => { if (v.plaatsing) set.add(PLAATSING_LABELS[v.plaatsing] ?? v.plaatsing); });
  const order = ["Inbouw", "Vrijstaand kastmodel", "Vrieskist"];
  return order.filter(l => set.has(l));
}

function collectBrandOptions(matches) {
  const set = new Set();
  matches.forEach(v => { const label = formatBrandLabel(v.merk); if (label) set.add(label); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "nl"));
}

function collectCapaciteitOptions(matches) {
  const set = new Set();
  matches.forEach(v => { const label = capaciteitBucketLabel(v.nettoInhoudL); if (label) set.add(label); });
  return CAPACITEIT_ORDER.filter(l => set.has(l));
}

function collectEnergielabelOptions(matches) {
  const set = new Set();
  matches.forEach(v => { if (v.energielabel) set.add(v.energielabel); });
  const order = ["A", "B", "C", "D", "E", "F", "G"];
  const inOrder = order.filter(t => set.has(t));
  set.forEach(t => { if (!order.includes(t)) inOrder.push(t); });
  return inOrder;
}

function collectNofrostOptions(matches) {
  const set = new Set();
  matches.forEach(v => { if (v.automatischOntdooien) set.add(v.automatischOntdooien); });
  return Array.from(set);
}

function collectGeluidOptions(matches) {
  const set = new Set();
  matches.forEach(v => {
    if (v.geluidsniveauDb === null) return;
    set.add(v.geluidsniveauDb <= 38 ? "Stil (≤ 38 dB)" : "Normaal");
  });
  const order = ["Stil (≤ 38 dB)", "Normaal"];
  return order.filter(l => set.has(l));
}

function collectGarageOptions(matches) {
  const set = new Set();
  matches.forEach(v => {
    if (!v.klimaatklasse) return;
    set.add(GESCHIKT_VOOR_GARAGE_KLASSEN.includes(v.klimaatklasse) ? "Geschikt voor garage/schuur" : "Voor binnenshuis");
  });
  const order = ["Geschikt voor garage/schuur", "Voor binnenshuis"];
  return order.filter(l => set.has(l));
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

  if (filterState.plaatsingen.size > 0) {
    filtered = filtered.filter(v => filterState.plaatsingen.has(PLAATSING_LABELS[v.plaatsing] ?? v.plaatsing));
  }

  if (filterState.brands.size > 0) {
    filtered = filtered.filter(v => filterState.brands.has(formatBrandLabel(v.merk)));
  }

  if (filterState.capaciteiten.size > 0) {
    filtered = filtered.filter(v => filterState.capaciteiten.has(capaciteitBucketLabel(v.nettoInhoudL)));
  }

  if (filterState.energielabels.size > 0) {
    filtered = filtered.filter(v => filterState.energielabels.has(v.energielabel));
  }

  if (filterState.nofrost.size > 0) {
    filtered = filtered.filter(v => filterState.nofrost.has(v.automatischOntdooien));
  }

  if (filterState.geluid.size > 0) {
    filtered = filtered.filter(v => {
      if (v.geluidsniveauDb === null) return false;
      const label = v.geluidsniveauDb <= 38 ? "Stil (≤ 38 dB)" : "Normaal";
      return filterState.geluid.has(label);
    });
  }

  if (filterState.garage.size > 0) {
    filtered = filtered.filter(v => {
      if (!v.klimaatklasse) return false;
      const label = GESCHIKT_VOOR_GARAGE_KLASSEN.includes(v.klimaatklasse) ? "Geschikt voor garage/schuur" : "Voor binnenshuis";
      return filterState.garage.has(label);
    });
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
  const hasActive = filterState.priceLabels.size > 0 || filterState.plaatsingen.size > 0 ||
    filterState.brands.size > 0 || filterState.capaciteiten.size > 0 ||
    filterState.energielabels.size > 0 || filterState.nofrost.size > 0 || filterState.geluid.size > 0 ||
    filterState.garage.size > 0 ||
    filterState.breedteLabels.size > 0 || filterState.diepteLabels.size > 0 || filterState.hoogteLabels.size > 0 ||
    filterState.aanbieder.size > 0;
  btn.hidden = !hasActive;
}

// Zelfde patroon als de prijs-kaart hierboven: buckets 1x per catalogus
// berekend (zie initFilters), tellingen per bucket elke render opnieuw.
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

  const priceContainer        = qs("[data-filter-container='price']");
  const plaatsingContainer    = qs("[data-filter-container='plaatsing']");
  const brandContainer        = qs("[data-filter-container='brand']");
  const capaciteitContainer   = qs("[data-filter-container='capaciteit']");
  const energielabelContainer = qs("[data-filter-container='energielabel']");
  const nofrostContainer      = qs("[data-filter-container='nofrost']");
  const geluidContainer       = qs("[data-filter-container='geluid']");
  const garageContainer       = qs("[data-filter-container='garage']");
  const breedteContainer      = qs("[data-filter-container='breedte']");
  const diepteContainer       = qs("[data-filter-container='diepte']");
  const hoogteContainer       = qs("[data-filter-container='hoogte']");
  const aanbiederContainer    = qs("[data-filter-container='aanbieder']");

  const priceCard        = qs(".filter-card[data-filter='price']");
  const plaatsingCard    = qs(".filter-card[data-filter='plaatsing']");
  const brandCard        = qs(".filter-card[data-filter='brand']");
  const capaciteitCard   = qs(".filter-card[data-filter='capaciteit']");
  const energielabelCard = qs(".filter-card[data-filter='energielabel']");
  const nofrostCard      = qs(".filter-card[data-filter='nofrost']");
  const geluidCard       = qs(".filter-card[data-filter='geluid']");
  const garageCard       = qs(".filter-card[data-filter='garage']");
  const breedteCard      = qs(".filter-card[data-filter='breedte']");
  const diepteCard       = qs(".filter-card[data-filter='diepte']");
  const hoogteCard       = qs(".filter-card[data-filter='hoogte']");
  const aanbiederCard    = qs(".filter-card[data-filter='aanbieder']");

  if (priceContainer && priceCard) {
    const base = getBaseMatches();
    const groups = getDynamicPriceGroups();
    const groupForPrice = price => groups.find(g => price >= g.min && price <= g.max);
    const counts = computeCounts(base, v => groupForPrice(parsePrice(v.prijs))?.label);
    const labels = groups.filter(g => counts.has(g.label)).map(g => g.label);
    if (labels.length <= 1) {
      priceContainer.innerHTML = "";
      priceCard.hidden = true;
    } else {
      renderFilterList(priceContainer, priceCard, {
        items: labels, counts, filterName: "priceLabels", stateSet: filterState.priceLabels,
        labelFn: label => `€ ${label}`, allLabel: "Alle prijzen",
      });
    }
  }

  if (plaatsingContainer && plaatsingCard) {
    const opts = collectPlaatsingOptions(matches);
    if (opts.length <= 1) {
      plaatsingContainer.innerHTML = "";
      plaatsingCard.hidden = true;
    } else {
      renderFilterOptions(plaatsingContainer, plaatsingCard, opts, matches, v => PLAATSING_LABELS[v.plaatsing] ?? v.plaatsing, "plaatsingen");
    }
  }

  if (brandContainer && brandCard) {
    renderFilterOptions(brandContainer, brandCard, collectBrandOptions(matches), matches, v => formatBrandLabel(v.merk), "brands");
  }

  if (capaciteitContainer && capaciteitCard) {
    renderFilterOptions(capaciteitContainer, capaciteitCard, collectCapaciteitOptions(matches), matches, v => capaciteitBucketLabel(v.nettoInhoudL), "capaciteiten");
  }

  if (energielabelContainer && energielabelCard) {
    renderFilterOptions(energielabelContainer, energielabelCard, collectEnergielabelOptions(matches), matches, v => v.energielabel, "energielabels", l => `Label ${l}`);
  }

  if (nofrostContainer && nofrostCard) {
    renderFilterOptions(nofrostContainer, nofrostCard, collectNofrostOptions(matches), matches, v => v.automatischOntdooien, "nofrost");
  }

  if (geluidContainer && geluidCard) {
    renderFilterOptions(geluidContainer, geluidCard, collectGeluidOptions(matches), matches, v => v.geluidsniveauDb === null ? null : (v.geluidsniveauDb <= 38 ? "Stil (≤ 38 dB)" : "Normaal"), "geluid");
  }

  if (garageContainer && garageCard) {
    renderFilterOptions(garageContainer, garageCard, collectGarageOptions(matches), matches, v => v.klimaatklasse ? (GESCHIKT_VOOR_GARAGE_KLASSEN.includes(v.klimaatklasse) ? "Geschikt voor garage/schuur" : "Voor binnenshuis") : null, "garage");
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
    priceLabels:   { set: filterState.priceLabels,   parse: v => v },
    plaatsingen:   { set: filterState.plaatsingen,   parse: v => v, exclusive: true },
    brands:        { set: filterState.brands,        parse: v => v },
    capaciteiten:  { set: filterState.capaciteiten,  parse: v => v },
    energielabels: { set: filterState.energielabels, parse: v => v },
    nofrost:       { set: filterState.nofrost,       parse: v => v, exclusive: true },
    geluid:        { set: filterState.geluid,        parse: v => v, exclusive: true },
    garage:        { set: filterState.garage,        parse: v => v, exclusive: true },
    breedteLabels: { set: filterState.breedteLabels, parse: v => v },
    diepteLabels:  { set: filterState.diepteLabels,  parse: v => v },
    hoogteLabels:  { set: filterState.hoogteLabels,  parse: v => v },
    aanbieder:     { set: filterState.aanbieder,      parse: v => v }
  };

  if (!setMap[name]) return;

  const { set, parse, exclusive } = setMap[name];

  if (value === "all") {
    set.clear();
  } else {
    const parsed = parse(value);
    if (input.checked) {
      // "Ja"/"Nee"-achtige filters zijn elkaars tegenpolen: aanvinken van
      // de één moet de ander automatisch uitvinken.
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

  const answersData  = localStorage.getItem("vriezer_answers");
  const bestTypeData = localStorage.getItem("vriezer_bestType");

  filterState.answers  = answersData ? JSON.parse(answersData) : null;
  filterState.bestType = bestTypeData ?? "";
  filterState.priceLabels = new Set();

  let allVriezers = [];
  try {
    const raw = await fetchProducts();
    allVriezers = normalizeProducts(raw ?? []);
  } catch {
    allVriezers = [];
  }

  const liveResult = matchVriezers(allVriezers, filterState.answers);
  let baseMatches = Array.isArray(liveResult.filteredMatchedVriezers) ? liveResult.filteredMatchedVriezers : [];

  if (baseMatches.length === 0) {
    const storedData = localStorage.getItem("vriezer_filteredMatchedVriezers");
    if (storedData) {
      try {
        const storedVriezers = JSON.parse(storedData);
        if (Array.isArray(storedVriezers) && storedVriezers.length > 0) {
          baseMatches = storedVriezers;
        }
      } catch { /* ignore */ }
    }
  }

  filterState.baseMatches = baseMatches;
  filterState.priceGroups   = computeDynamicPriceGroups(baseMatches);
  filterState.breedteGroups = computeDynamicDimensionGroups(baseMatches, "breedteMm");
  filterState.diepteGroups  = computeDynamicDimensionGroups(baseMatches, "diepteMm");
  filterState.hoogteGroups  = computeDynamicDimensionGroups(baseMatches, "hoogteMm");

  renderAllFilters();

  filtersPanel.addEventListener("change", handleFilterChange);

  const clearBtn = qs("#clearFiltersBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      filterState.priceLabels.clear();
      filterState.plaatsingen.clear();
      filterState.brands.clear();
      filterState.capaciteiten.clear();
      filterState.energielabels.clear();
      filterState.nofrost.clear();
      filterState.geluid.clear();
      filterState.garage.clear();
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
