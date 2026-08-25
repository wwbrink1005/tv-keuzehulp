import { priceGroupsFallback, GELUID_STIL_MAX_DB, KORTE_WORP_TYPES } from "./data.js";
import { matchBeamers } from "./matching.js";
import { computeDynamicPriceGroups, computeDynamicLumenGroups, normalizeProducts, parsePrice, qs } from "./utils.js";
import { updateResultMatches } from "./result.js";
import { fetchProducts } from "./supabase.js";
import { computeCounts, renderFilterList } from "../../shared/filters.js";

const filterState = {
  priceLabels:      new Set(),
  lumenLabels:      new Set(),
  worpTypes:        new Set(),
  lichtbronTypes:   new Set(),
  resoluties:       new Set(),
  brands:           new Set(),
  kleuren:          new Set(),
  functies:         new Set(),
  aanbieder:        new Set(),
  baseMatches:      [],
  answers:          null,
  bestType:         "",
};

const FUNCTIE_DEFINITIES = [
  { key: "smart-tv", label: "Smart TV met apps",  check: b => b.smartTv === "Ja" },
  { key: "speakers", label: "Ingebouwde speakers", check: b => b.ingebouwdeLuidsprekers === "Ja" },
  { key: "hdr",       label: "HDR-ondersteuning",   check: b => b.hdr === "Ja" },
  { key: "3d",        label: "3D-ondersteuning",    check: b => b.support3d === "Ja" },
  { key: "wifi",      label: "Wifi",                check: b => b.wifi === "Ja" },
  { key: "stil",      label: "Stil apparaat",        check: b => b.geluidDb !== null && b.geluidDb <= GELUID_STIL_MAX_DB },
  { key: "korte-worp", label: "Korte projectieafstand", check: b => KORTE_WORP_TYPES.has(b.worpType) },
];

const WORP_TYPE_LABELS = {
  "Projector met normale projectieafstand":      "Normale projectieafstand",
  "Projector met korte projectieafstand":        "Korte projectieafstand",
  "Projector met ultrakorte projectieafstand":   "Ultrakorte projectieafstand",
};

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
  return base.filter(b => {
    const price = parsePrice(b.prijs);
    return groups.some(g => price >= g.min && price <= g.max);
  });
}

function formatBrandLabel(brand) {
  const raw = String(brand ?? "").trim();
  if (!raw) return "";
  if (raw === raw.toUpperCase()) return raw;
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function collectWorpTypeOptions(matches) {
  const set = new Set();
  matches.forEach(b => { if (WORP_TYPE_LABELS[b.worpType]) set.add(b.worpType); });
  const order = Object.keys(WORP_TYPE_LABELS);
  return order.filter(t => set.has(t));
}

function collectLichtbronOptions(matches) {
  const set = new Set();
  matches.forEach(b => { if (b.lichtbronType) set.add(b.lichtbronType); });
  const order = ["Laser", "LED", "Lamp"];
  const inOrder = order.filter(t => set.has(t));
  set.forEach(t => { if (!order.includes(t)) inOrder.push(t); });
  return inOrder;
}

function collectResolutieOptions(matches) {
  const set = new Set();
  matches.forEach(b => { if (b.resolutie) set.add(b.resolutie); });
  const order = ["4K (4096x2400)", "4K+ (5120x3200)", "UHD 4K (3840x2160)", "WUXGA (1920x1200)", "1080p (1920x1080)", "720p (1280x720)", "WXGA (1280x800)", "WXGA (1200x800)", "XGA (1024x768)", "SVGA (800x600)"];
  const inOrder = order.filter(t => set.has(t));
  set.forEach(t => { if (!order.includes(t)) inOrder.push(t); });
  return inOrder;
}

function collectBrandOptions(matches) {
  const set = new Set();
  matches.forEach(b => { const label = formatBrandLabel(b.merk); if (label) set.add(label); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "nl"));
}

function normalizeKleur(kleur) {
  const raw = String(kleur ?? "").trim();
  if (!raw) return "";
  return raw.split(",").map(s => s.trim()).filter(Boolean).sort().join(", ");
}

function collectKleurOptions(matches) {
  const set = new Set();
  matches.forEach(b => { const k = normalizeKleur(b.kleur); if (k) set.add(k); });
  const order = ["Zwart", "Wit", "Grijs", "Zilver"];
  const inOrder = order.filter(t => set.has(t));
  set.forEach(t => { if (!order.includes(t)) inOrder.push(t); });
  return inOrder;
}

function collectFunctieOptions(matches) {
  return FUNCTIE_DEFINITIES.filter(f => matches.some(f.check)).map(f => f.key);
}

function collectAanbiederOptions(matches) {
  const set = new Set();
  matches.forEach(b => {
    (b.aanbieders ?? []).forEach(a => set.add(a.winkel));
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

  if (filterState.lumenLabels.size > 0) {
    const groups = (filterState.lumenGroups || []).filter(g => filterState.lumenLabels.has(g.label));
    filtered = filtered.filter(b => Number.isFinite(b.helderheidLumen) && groups.some(g => b.helderheidLumen >= g.min && b.helderheidLumen < g.max));
  }

  if (filterState.worpTypes.size > 0) {
    filtered = filtered.filter(b => filterState.worpTypes.has(b.worpType));
  }

  if (filterState.lichtbronTypes.size > 0) {
    filtered = filtered.filter(b => filterState.lichtbronTypes.has(b.lichtbronType));
  }

  if (filterState.resoluties.size > 0) {
    filtered = filtered.filter(b => filterState.resoluties.has(b.resolutie));
  }

  if (filterState.brands.size > 0) {
    filtered = filtered.filter(b => filterState.brands.has(formatBrandLabel(b.merk)));
  }

  if (filterState.kleuren.size > 0) {
    filtered = filtered.filter(b => filterState.kleuren.has(normalizeKleur(b.kleur)));
  }

  if (filterState.functies.size > 0) {
    filtered = filtered.filter(b =>
      FUNCTIE_DEFINITIES.filter(f => filterState.functies.has(f.key)).every(f => f.check(b))
    );
  }

  if (filterState.aanbieder.size > 0) {
    filtered = filtered.filter(b =>
      (b.aanbieders ?? []).some(a => filterState.aanbieder.has(a.winkel))
    );
  }

  updateClearFiltersBtn();
  updateResultMatches(filtered, filterState.answers, filterState.bestType);
}

function updateClearFiltersBtn() {
  const btn = qs("#clearFiltersBtn");
  if (!btn) return;
  const hasActive = filterState.priceLabels.size > 0 || filterState.lumenLabels.size > 0 ||
    filterState.worpTypes.size > 0 || filterState.lichtbronTypes.size > 0 ||
    filterState.resoluties.size > 0 || filterState.brands.size > 0 || filterState.kleuren.size > 0 ||
    filterState.functies.size > 0 || filterState.aanbieder.size > 0;
  btn.hidden = !hasActive;
}

function renderAllFilters() {
  const matches = getPriceScopedMatches();

  const priceContainer      = qs("[data-filter-container='price']");
  const lumenContainer      = qs("[data-filter-container='lumen']");
  const worpContainer       = qs("[data-filter-container='worp']");
  const lichtbronContainer  = qs("[data-filter-container='lichtbron']");
  const resolutieContainer  = qs("[data-filter-container='resolutie']");
  const brandContainer      = qs("[data-filter-container='brand']");
  const kleurContainer      = qs("[data-filter-container='kleur']");
  const functieContainer    = qs("[data-filter-container='functies']");
  const aanbiederContainer  = qs("[data-filter-container='aanbieder']");

  const priceCard      = qs(".filter-card[data-filter='price']");
  const lumenCard      = qs(".filter-card[data-filter='lumen']");
  const worpCard       = qs(".filter-card[data-filter='worp']");
  const lichtbronCard  = qs(".filter-card[data-filter='lichtbron']");
  const resolutieCard  = qs(".filter-card[data-filter='resolutie']");
  const brandCard      = qs(".filter-card[data-filter='brand']");
  const kleurCard      = qs(".filter-card[data-filter='kleur']");
  const functieCard    = qs(".filter-card[data-filter='functies']");
  const aanbiederCard  = qs(".filter-card[data-filter='aanbieder']");

  if (priceContainer && priceCard) {
    const groups = getDynamicPriceGroups();
    const base = getBaseMatches();
    const groupForPrice = price => groups.find(g => price >= g.min && price <= g.max);
    const counts = computeCounts(base, b => groupForPrice(parsePrice(b.prijs))?.label);
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

  if (lumenContainer && lumenCard) {
    const groups = filterState.lumenGroups || [];
    const base = getBaseMatches();
    const groupForLumen = l => Number.isFinite(l) ? groups.find(g => l >= g.min && l < g.max) : undefined;
    const counts = computeCounts(base, b => groupForLumen(b.helderheidLumen)?.label);
    const labels = groups.filter(g => counts.has(g.label)).map(g => g.label);

    if (labels.length <= 1) {
      lumenContainer.innerHTML = "";
      lumenCard.hidden = true;
    } else {
      renderFilterList(lumenContainer, lumenCard, {
        items: labels, counts, filterName: "lumenLabels", stateSet: filterState.lumenLabels, allLabel: "Alle",
      });
    }
  }

  if (worpContainer && worpCard) {
    renderFilterOptions(worpContainer, worpCard, collectWorpTypeOptions(matches), matches, b => b.worpType, "worpTypes", key => WORP_TYPE_LABELS[key] ?? key);
  }

  if (lichtbronContainer && lichtbronCard) {
    renderFilterOptions(lichtbronContainer, lichtbronCard, collectLichtbronOptions(matches), matches, b => b.lichtbronType, "lichtbronTypes");
  }

  if (resolutieContainer && resolutieCard) {
    renderFilterOptions(resolutieContainer, resolutieCard, collectResolutieOptions(matches), matches, b => b.resolutie, "resoluties");
  }

  if (brandContainer && brandCard) {
    renderFilterOptions(brandContainer, brandCard, collectBrandOptions(matches), matches, b => formatBrandLabel(b.merk), "brands");
  }

  if (kleurContainer && kleurCard) {
    renderFilterOptions(kleurContainer, kleurCard, collectKleurOptions(matches), matches, b => normalizeKleur(b.kleur), "kleuren");
  }

  if (functieContainer && functieCard) {
    const functieValueFn = b => FUNCTIE_DEFINITIES.filter(f => f.check(b)).map(f => f.key);
    const labelFn = key => FUNCTIE_DEFINITIES.find(f => f.key === key)?.label ?? key;
    renderFilterOptions(functieContainer, functieCard, collectFunctieOptions(matches), matches, functieValueFn, "functies", labelFn);
  }

  if (aanbiederContainer && aanbiederCard) {
    renderFilterOptions(aanbiederContainer, aanbiederCard, collectAanbiederOptions(matches), matches, b => (b.aanbieders ?? []).map(a => a.winkel), "aanbieder");
  }

  updateClearFiltersBtn();
}

function handleFilterChange(event) {
  const input = event.target.closest("input");
  if (!input) return;

  const name  = input.name;
  const value = input.value;

  const setMap = {
    priceFilter:     { set: filterState.priceLabels,    parse: v => v },
    lumenLabels:     { set: filterState.lumenLabels,    parse: v => v },
    worpTypes:       { set: filterState.worpTypes,      parse: v => v },
    lichtbronTypes:  { set: filterState.lichtbronTypes, parse: v => v },
    resoluties:      { set: filterState.resoluties,     parse: v => v },
    brands:          { set: filterState.brands,         parse: v => v },
    kleuren:         { set: filterState.kleuren,        parse: v => v },
    functies:        { set: filterState.functies,       parse: v => v },
    aanbieder:       { set: filterState.aanbieder,      parse: v => v }
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

  const answersData   = localStorage.getItem("beamer_answers");
  const bestTypeData  = localStorage.getItem("beamer_bestType");

  filterState.answers  = answersData ? JSON.parse(answersData) : null;
  filterState.bestType = bestTypeData ?? "";

  let allBeamers = [];
  try {
    const raw = await fetchProducts();
    allBeamers = normalizeProducts(raw ?? []);
  } catch {
    allBeamers = [];
  }

  const result = matchBeamers(allBeamers, filterState.answers ?? {});
  filterState.baseMatches = Array.isArray(result.filteredMatchedBeamers) ? result.filteredMatchedBeamers : [];

  // Fallback: if the live fetch/computation yields nothing, seed the pool
  // with the beamers that were already matched during the quiz.
  if (filterState.baseMatches.length === 0) {
    const storedData = localStorage.getItem("beamer_filteredMatchedBeamers");
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
  filterState.lumenGroups = computeDynamicLumenGroups(filterState.baseMatches);

  filterState.priceLabels = new Set();

  renderAllFilters();

  filtersPanel.addEventListener("change", handleFilterChange);

  const clearBtn = qs("#clearFiltersBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      filterState.priceLabels.clear();
      filterState.lumenLabels.clear();
      filterState.worpTypes.clear();
      filterState.lichtbronTypes.clear();
      filterState.resoluties.clear();
      filterState.brands.clear();
      filterState.kleuren.clear();
      filterState.functies.clear();
      filterState.aanbieder.clear();
      renderAllFilters();
      applyFilters();
    });
  }

  applyFilters();
}
