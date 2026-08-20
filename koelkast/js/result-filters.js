import { matchKoelkasten } from "./matching.js";
import { computeDynamicPriceGroups, computeDynamicDimensionGroups, normalizeProducts, parsePrice, qs } from "./utils.js";
import { updateResultMatches } from "./result.js";
import { fetchProducts } from "./supabase.js";
import { computeCounts, renderFilterList } from "../../shared/filters.js";

const filterState = {
  priceLabels:   new Set(),
  plaatsingen:   new Set(),
  brands:        new Set(),
  capaciteiten:  new Set(),
  energielabels: new Set(),
  geluid:        new Set(),
  // No Frost/vriesvak/waterdispenser/ijsmaker/vers zone waren 5 losse
  // kaarten — samengevoegd tot 1 "Functies"-kaart (zie FUNCTIE_DEFINITIES),
  // zelfde patroon als monitor/desktop/wasmachine.
  functies:      new Set(),
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

const FUNCTIE_DEFINITIES = [
  { key: "nofrost", label: "No Frost", check: k => k.automatischOntdooien === "Ja" },
  { key: "vriesvak", label: "Met vriesvak", check: k => Boolean(k.heeftVriesvak) },
  { key: "verszone", label: "Vers zone compartiment", check: k => k.versZone === "Ja" },
  { key: "waterdispenser", label: "Waterdispenser", check: k => k.waterdispenser === "Ja" },
  { key: "ijsmaker", label: "IJsmaker", check: k => k.ijsmaker === "Ja" },
];

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
  if (l < 250) return "< 250 L";
  if (l < 350) return "250 - 350 L";
  if (l < 450) return "350 - 450 L";
  return "450+ L";
}

const CAPACITEIT_ORDER = ["< 250 L", "250 - 350 L", "350 - 450 L", "450+ L"];

function getBaseMatches() {
  return filterState.baseMatches;
}

function getPriceScopedMatches() {
  const base = getBaseMatches();
  if (filterState.priceLabels.size === 0) return base;
  const groups = getDynamicPriceGroups().filter(g => filterState.priceLabels.has(g.label));
  if (groups.length === 0) return base;
  return base.filter(k => {
    const price = parsePrice(k.prijs);
    return groups.some(g => price >= g.min && price <= g.max);
  });
}

function collectPlaatsingOptions(matches) {
  const set = new Set();
  matches.forEach(k => { if (k.plaatsing) set.add(k.plaatsing === "inbouw" ? "Inbouw" : "Vrijstaand"); });
  return Array.from(set);
}

function collectBrandOptions(matches) {
  const set = new Set();
  matches.forEach(k => { const label = formatBrandLabel(k.merk); if (label) set.add(label); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "nl"));
}

function collectCapaciteitOptions(matches) {
  const set = new Set();
  matches.forEach(k => { const label = capaciteitBucketLabel(k.nettoInhoudL); if (label) set.add(label); });
  return CAPACITEIT_ORDER.filter(l => set.has(l));
}

function collectEnergielabelOptions(matches) {
  const set = new Set();
  matches.forEach(k => { if (k.energielabel) set.add(k.energielabel); });
  const order = ["A", "B", "C", "D", "E", "F", "G"];
  const inOrder = order.filter(t => set.has(t));
  set.forEach(t => { if (!order.includes(t)) inOrder.push(t); });
  return inOrder;
}

function collectFunctieOptions(matches) {
  return FUNCTIE_DEFINITIES.filter(f => matches.some(f.check)).map(f => f.key);
}

function collectGeluidOptions(matches) {
  const set = new Set();
  matches.forEach(k => {
    if (k.geluidsniveauDb === null) return;
    set.add(k.geluidsniveauDb <= 38 ? "Stil (≤ 38 dB)" : "Normaal");
  });
  const order = ["Stil (≤ 38 dB)", "Normaal"];
  return order.filter(l => set.has(l));
}

function collectAanbiederOptions(matches) {
  const set = new Set();
  matches.forEach(k => {
    (k.aanbieders ?? []).forEach(a => set.add(a.winkel));
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
    filtered = filtered.filter(k => filterState.plaatsingen.has(k.plaatsing === "inbouw" ? "Inbouw" : "Vrijstaand"));
  }

  if (filterState.brands.size > 0) {
    filtered = filtered.filter(k => filterState.brands.has(formatBrandLabel(k.merk)));
  }

  if (filterState.capaciteiten.size > 0) {
    filtered = filtered.filter(k => filterState.capaciteiten.has(capaciteitBucketLabel(k.nettoInhoudL)));
  }

  if (filterState.energielabels.size > 0) {
    filtered = filtered.filter(k => filterState.energielabels.has(k.energielabel));
  }

  if (filterState.geluid.size > 0) {
    filtered = filtered.filter(k => {
      if (k.geluidsniveauDb === null) return false;
      const label = k.geluidsniveauDb <= 38 ? "Stil (≤ 38 dB)" : "Normaal";
      return filterState.geluid.has(label);
    });
  }

  if (filterState.functies.size > 0) {
    filtered = filtered.filter(k =>
      FUNCTIE_DEFINITIES.filter(f => filterState.functies.has(f.key)).every(f => f.check(k))
    );
  }

  if (filterState.breedteLabels.size > 0) {
    const groups = filterState.breedteGroups.filter(g => filterState.breedteLabels.has(g.label));
    filtered = filtered.filter(k => Number.isFinite(k.breedteMm) && groups.some(g => k.breedteMm / 10 >= g.min && k.breedteMm / 10 < g.max));
  }

  if (filterState.diepteLabels.size > 0) {
    const groups = filterState.diepteGroups.filter(g => filterState.diepteLabels.has(g.label));
    filtered = filtered.filter(k => Number.isFinite(k.diepteMm) && groups.some(g => k.diepteMm / 10 >= g.min && k.diepteMm / 10 < g.max));
  }

  if (filterState.hoogteLabels.size > 0) {
    const groups = filterState.hoogteGroups.filter(g => filterState.hoogteLabels.has(g.label));
    filtered = filtered.filter(k => Number.isFinite(k.hoogteMm) && groups.some(g => k.hoogteMm / 10 >= g.min && k.hoogteMm / 10 < g.max));
  }

  if (filterState.aanbieder.size > 0) {
    filtered = filtered.filter(k =>
      (k.aanbieders ?? []).some(a => filterState.aanbieder.has(a.winkel))
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
    filterState.energielabels.size > 0 || filterState.geluid.size > 0 ||
    filterState.functies.size > 0 ||
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
  const counts = computeCounts(base, k => groupForMm(k[veld])?.label);
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
  const geluidContainer       = qs("[data-filter-container='geluid']");
  const functieContainer      = qs("[data-filter-container='functies']");
  const breedteContainer      = qs("[data-filter-container='breedte']");
  const diepteContainer       = qs("[data-filter-container='diepte']");
  const hoogteContainer       = qs("[data-filter-container='hoogte']");
  const aanbiederContainer    = qs("[data-filter-container='aanbieder']");

  const priceCard        = qs(".filter-card[data-filter='price']");
  const plaatsingCard    = qs(".filter-card[data-filter='plaatsing']");
  const brandCard        = qs(".filter-card[data-filter='brand']");
  const capaciteitCard   = qs(".filter-card[data-filter='capaciteit']");
  const energielabelCard = qs(".filter-card[data-filter='energielabel']");
  const geluidCard       = qs(".filter-card[data-filter='geluid']");
  const functieCard      = qs(".filter-card[data-filter='functies']");
  const breedteCard      = qs(".filter-card[data-filter='breedte']");
  const diepteCard       = qs(".filter-card[data-filter='diepte']");
  const hoogteCard       = qs(".filter-card[data-filter='hoogte']");
  const aanbiederCard    = qs(".filter-card[data-filter='aanbieder']");

  if (priceContainer && priceCard) {
    const base = getBaseMatches();
    const groups = getDynamicPriceGroups();
    const groupForPrice = price => groups.find(g => price >= g.min && price <= g.max);
    const counts = computeCounts(base, k => groupForPrice(parsePrice(k.prijs))?.label);
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
      renderFilterOptions(plaatsingContainer, plaatsingCard, opts, matches, k => k.plaatsing === "inbouw" ? "Inbouw" : "Vrijstaand", "plaatsingen");
    }
  }

  if (brandContainer && brandCard) {
    renderFilterOptions(brandContainer, brandCard, collectBrandOptions(matches), matches, k => formatBrandLabel(k.merk), "brands");
  }

  if (capaciteitContainer && capaciteitCard) {
    renderFilterOptions(capaciteitContainer, capaciteitCard, collectCapaciteitOptions(matches), matches, k => capaciteitBucketLabel(k.nettoInhoudL), "capaciteiten");
  }

  if (energielabelContainer && energielabelCard) {
    renderFilterOptions(energielabelContainer, energielabelCard, collectEnergielabelOptions(matches), matches, k => k.energielabel, "energielabels", l => `Label ${l}`);
  }

  if (geluidContainer && geluidCard) {
    renderFilterOptions(geluidContainer, geluidCard, collectGeluidOptions(matches), matches, k => k.geluidsniveauDb === null ? null : (k.geluidsniveauDb <= 38 ? "Stil (≤ 38 dB)" : "Normaal"), "geluid");
  }

  if (functieContainer && functieCard) {
    const functieValueFn = k => FUNCTIE_DEFINITIES.filter(f => f.check(k)).map(f => f.key);
    const labelFn = key => FUNCTIE_DEFINITIES.find(f => f.key === key)?.label ?? key;
    renderFilterOptions(functieContainer, functieCard, collectFunctieOptions(matches), matches, functieValueFn, "functies", labelFn);
  }

  renderDimensionFilter(breedteContainer, breedteCard, filterState.breedteGroups, "breedteMm", filterState.breedteLabels, "breedteLabels");
  renderDimensionFilter(diepteContainer, diepteCard, filterState.diepteGroups, "diepteMm", filterState.diepteLabels, "diepteLabels");
  renderDimensionFilter(hoogteContainer, hoogteCard, filterState.hoogteGroups, "hoogteMm", filterState.hoogteLabels, "hoogteLabels");

  if (aanbiederContainer && aanbiederCard) {
    renderFilterOptions(aanbiederContainer, aanbiederCard, collectAanbiederOptions(matches), matches, k => (k.aanbieders ?? []).map(a => a.winkel), "aanbieder");
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
    geluid:        { set: filterState.geluid,        parse: v => v, exclusive: true },
    functies:      { set: filterState.functies,      parse: v => v },
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
  const answersData  = localStorage.getItem("koelkast_answers");
  const bestTypeData = localStorage.getItem("koelkast_bestType");

  filterState.answers  = answersData ? JSON.parse(answersData) : null;
  filterState.bestType = bestTypeData ?? "";
  filterState.priceLabels = new Set();

  // Fetch & normalize all koelkasten
  let allKoelkasten = [];
  try {
    const raw = await fetchProducts();
    allKoelkasten = normalizeProducts(raw ?? []);
  } catch {
    allKoelkasten = [];
  }

  // Full, freshly computed matchset for the user's quiz answers.
  const liveResult = matchKoelkasten(allKoelkasten, filterState.answers);
  let baseMatches = Array.isArray(liveResult.filteredMatchedKoelkasten) ? liveResult.filteredMatchedKoelkasten : [];

  // Fallback: if the live fetch yields nothing, fall back to the matches
  // that were already computed and stored at quiz-submit time.
  if (baseMatches.length === 0) {
    const storedData = localStorage.getItem("koelkast_filteredMatchedKoelkasten");
    if (storedData) {
      try {
        const storedKoelkasten = JSON.parse(storedData);
        if (Array.isArray(storedKoelkasten) && storedKoelkasten.length > 0) {
          baseMatches = storedKoelkasten;
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

  // Delegate all filter changes
  filtersPanel.addEventListener("change", handleFilterChange);

  // Clear filters button
  const clearBtn = qs("#clearFiltersBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      filterState.priceLabels.clear();
      filterState.plaatsingen.clear();
      filterState.brands.clear();
      filterState.capaciteiten.clear();
      filterState.energielabels.clear();
      filterState.geluid.clear();
      filterState.functies.clear();
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
