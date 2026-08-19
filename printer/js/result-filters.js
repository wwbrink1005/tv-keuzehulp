import { priceGroupsByGebruik } from "./data.js";
import { computeMatchForPriceGroup } from "./matching.js";
import { computeDynamicPriceGroups, normalizeProducts, parsePrice, qs } from "./utils.js";
import { updateResultMatches } from "./result.js";
import { fetchProducts } from "./supabase.js";
import { computeCounts, renderFilterList } from "../../shared/filters.js";

const filterState = {
  priceLabels:  new Set(),
  brands:       new Set(),
  printtechnologieen: new Set(),
  kleuren:      new Set(),
  snelheden:    new Set(),
  functies:     new Set(),
  aanbieder:    new Set(),
  baseMatches:  [],
  answers:      null,
  bestType:     "",
  gebruik:      ""
};

// Price buckets are recomputed fresh from the live-fetched catalog on every
// results page load (not trusted from the quiz-time localStorage snapshot),
// since a stale/short-lived fetch during the quiz can produce fewer or
// narrower buckets than the catalog actually supports (e.g. missing the
// most expensive bucket entirely).
function getDynamicPriceGroups(gebruik) {
  if (Array.isArray(filterState.priceGroups) && filterState.priceGroups.length > 0) {
    return filterState.priceGroups;
  }
  return priceGroupsByGebruik[gebruik] || [];
}

function formatBrandLabel(brand) {
  const raw = String(brand ?? "").trim();
  if (!raw) return "";
  if (raw === raw.toUpperCase()) return raw;
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

// Price is just another optional narrowing filter, not a hard upfront wall:
// with no bucket selected, every printer matching the quiz answers is shown.
function getBaseMatches() {
  return filterState.baseMatches;
}

function getPriceScopedMatches() {
  const base = getBaseMatches();
  if (filterState.priceLabels.size === 0) return base;
  const groups = getDynamicPriceGroups(filterState.gebruik).filter(g => filterState.priceLabels.has(g.label));
  return base.filter(p => {
    const price = parsePrice(p.prijs);
    return groups.some(g => price >= g.min && price <= g.max);
  });
}

function collectBrandOptions(matches) {
  const set = new Set();
  matches.forEach(p => { const label = formatBrandLabel(p.merk); if (label) set.add(label); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "nl"));
}

function collectPrinttechnologieOptions(matches) {
  const set = new Set();
  matches.forEach(p => { if (p.printtechnologie) set.add(p.printtechnologie); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "nl"));
}

function collectKleurOptions(matches) {
  const set = new Set();
  matches.forEach(p => { if (p.kleur) set.add(p.kleur); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "nl"));
}

// Buckets op basis van de echte spreiding in de catalogus: het enige duidelijke
// gat zit tussen 22 en 25 ppm, verder is de verdeling vrij continu — vandaar
// 3 groepen i.p.v. een geforceerde 4e "extreem snel"-tier zonder echt gat.
const SNELHEID_GROEPEN = [
  { key: "traag",   label: "Traag, t/m 15 ppm",     min: 0,  max: 15 },
  { key: "normaal", label: "Normaal, 16-22 ppm",     min: 16, max: 22 },
  { key: "snel",    label: "Snel, 23 ppm of meer",   min: 23, max: Infinity }
];

function collectSnelheidOptions(matches) {
  return SNELHEID_GROEPEN.filter(g => matches.some(p => {
    const snelheid = parseInt(p.printsnelheidZwart, 10);
    return Number.isFinite(snelheid) && snelheid >= g.min && snelheid <= g.max;
  })).map(g => g.key);
}

function collectFunctieOptions(matches) {
  const opties = [];
  if (matches.some(p => p.duplex === "Ja")) opties.push("duplex");
  if (matches.some(p => p.scannen === "Ja" && p.kopieren === "Ja")) opties.push("scan-kopieer");
  if (matches.some(p => p.wifi === "Ja")) opties.push("wifi");
  if (matches.some(p => p.display === "Ja")) opties.push("display");
  if (matches.some(p => p.adf === "Ja")) opties.push("adf");
  if (matches.some(p => p.bluetooth === "Ja")) opties.push("bluetooth");
  return opties;
}

const FUNCTIE_LABELS = {
  "duplex": "Dubbelzijdig printen",
  "scan-kopieer": "Scannen en kopiëren",
  "wifi": "Wifi",
  "display": "Display",
  "adf": "Automatische documentinvoer (ADF)",
  "bluetooth": "Bluetooth"
};

function collectAanbiederOptions(matches) {
  const set = new Set();
  matches.forEach(p => {
    (p.aanbieders ?? []).forEach(a => set.add(a.winkel));
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

  if (filterState.brands.size > 0) {
    filtered = filtered.filter(p => filterState.brands.has(formatBrandLabel(p.merk)));
  }

  if (filterState.printtechnologieen.size > 0) {
    filtered = filtered.filter(p => filterState.printtechnologieen.has(p.printtechnologie));
  }

  if (filterState.kleuren.size > 0) {
    filtered = filtered.filter(p => filterState.kleuren.has(p.kleur));
  }

  if (filterState.snelheden.size > 0) {
    filtered = filtered.filter(p => {
      const snelheid = parseInt(p.printsnelheidZwart, 10);
      if (!Number.isFinite(snelheid)) return false;
      return SNELHEID_GROEPEN.some(g => filterState.snelheden.has(g.key) && snelheid >= g.min && snelheid <= g.max);
    });
  }

  if (filterState.functies.size > 0) {
    filtered = filtered.filter(p => {
      if (filterState.functies.has("duplex") && p.duplex === "Ja") return true;
      if (filterState.functies.has("scan-kopieer") && p.scannen === "Ja" && p.kopieren === "Ja") return true;
      if (filterState.functies.has("wifi") && p.wifi === "Ja") return true;
      if (filterState.functies.has("display") && p.display === "Ja") return true;
      if (filterState.functies.has("adf") && p.adf === "Ja") return true;
      if (filterState.functies.has("bluetooth") && p.bluetooth === "Ja") return true;
      return false;
    });
  }

  if (filterState.aanbieder.size > 0) {
    filtered = filtered.filter(p =>
      (p.aanbieders ?? []).some(a => filterState.aanbieder.has(a.winkel))
    );
  }

  updateClearFiltersBtn();
  updateResultMatches(filtered, filterState.answers, filterState.bestType);
}

function updateClearFiltersBtn() {
  const btn = qs("#clearFiltersBtn");
  if (!btn) return;
  const hasActive = filterState.priceLabels.size > 0 || filterState.brands.size > 0 || filterState.printtechnologieen.size > 0 ||
    filterState.kleuren.size > 0 || filterState.snelheden.size > 0 || filterState.functies.size > 0 || filterState.aanbieder.size > 0;
  btn.hidden = !hasActive;
}

function renderAllFilters() {
  const matches = getPriceScopedMatches();

  const priceContainer      = qs("[data-filter-container='price']");
  const brandContainer      = qs("[data-filter-container='brand']");
  const techContainer       = qs("[data-filter-container='printtechnologie']");
  const kleurContainer      = qs("[data-filter-container='kleur']");
  const snelheidContainer   = qs("[data-filter-container='snelheid']");
  const functieContainer    = qs("[data-filter-container='functies']");
  const aanbiederContainer  = qs("[data-filter-container='aanbieder']");

  const priceCard      = qs(".filter-card[data-filter='price']");
  const brandCard       = qs(".filter-card[data-filter='brand']");
  const techCard        = qs(".filter-card[data-filter='printtechnologie']");
  const kleurCard       = qs(".filter-card[data-filter='kleur']");
  const snelheidCard    = qs(".filter-card[data-filter='snelheid']");
  const functieCard     = qs(".filter-card[data-filter='functies']");
  const aanbiederCard   = qs(".filter-card[data-filter='aanbieder']");

  if (priceContainer && priceCard) {
    const groups = getDynamicPriceGroups(filterState.gebruik);
    // Only show price buckets that actually contain a matching printer for
    // the current (already price-scoped) matches — otherwise users click a
    // bucket that can never show a result. If there's ≤1 non-empty bucket
    // there's nothing meaningful to narrow, so hide the whole filter card.
    const base = getBaseMatches();
    const groupForPrice = price => groups.find(g => price >= g.min && price <= g.max);
    const counts = computeCounts(base, p => groupForPrice(parsePrice(p.prijs))?.label);
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

  if (brandContainer && brandCard) {
    renderFilterOptions(brandContainer, brandCard, collectBrandOptions(matches), matches, p => formatBrandLabel(p.merk), "brands");
  }

  if (techContainer && techCard) {
    renderFilterOptions(techContainer, techCard, collectPrinttechnologieOptions(matches), matches, p => p.printtechnologie, "printtechnologieen");
  }

  if (kleurContainer && kleurCard) {
    renderFilterOptions(kleurContainer, kleurCard, collectKleurOptions(matches), matches, p => p.kleur, "kleuren");
  }

  if (snelheidContainer && snelheidCard) {
    const snelheidValueFn = p => {
      const snelheid = parseInt(p.printsnelheidZwart, 10);
      if (!Number.isFinite(snelheid)) return undefined;
      return SNELHEID_GROEPEN.find(g => snelheid >= g.min && snelheid <= g.max)?.key;
    };
    renderFilterOptions(snelheidContainer, snelheidCard, collectSnelheidOptions(matches), matches, snelheidValueFn, "snelheden", key => SNELHEID_GROEPEN.find(g => g.key === key)?.label ?? key);
  }

  if (functieContainer && functieCard) {
    const functieValueFn = p => {
      const opties = [];
      if (p.duplex === "Ja") opties.push("duplex");
      if (p.scannen === "Ja" && p.kopieren === "Ja") opties.push("scan-kopieer");
      if (p.wifi === "Ja") opties.push("wifi");
      if (p.display === "Ja") opties.push("display");
      if (p.adf === "Ja") opties.push("adf");
      if (p.bluetooth === "Ja") opties.push("bluetooth");
      return opties;
    };
    renderFilterOptions(functieContainer, functieCard, collectFunctieOptions(matches), matches, functieValueFn, "functies", f => FUNCTIE_LABELS[f] ?? f);
  }

  if (aanbiederContainer && aanbiederCard) {
    renderFilterOptions(aanbiederContainer, aanbiederCard, collectAanbiederOptions(matches), matches, p => (p.aanbieders ?? []).map(a => a.winkel), "aanbieder");
  }

  updateClearFiltersBtn();
}

function handleFilterChange(event) {
  const input = event.target.closest("input");
  if (!input) return;

  const name  = input.name;
  const value = input.value;

  const setMap = {
    priceLabels:        { set: filterState.priceLabels,        parse: v => v },
    brands:             { set: filterState.brands,             parse: v => v },
    printtechnologieen: { set: filterState.printtechnologieen, parse: v => v },
    kleuren:            { set: filterState.kleuren,            parse: v => v },
    snelheden:          { set: filterState.snelheden,           parse: v => v },
    functies:           { set: filterState.functies,            parse: v => v },
    aanbieder:          { set: filterState.aanbieder,           parse: v => v }
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
  const answersData  = localStorage.getItem("printer_answers");
  const gebruikData  = localStorage.getItem("printer_selectedGebruik");
  const bestTypeData = localStorage.getItem("printer_bestType");

  filterState.answers   = answersData ? JSON.parse(answersData) : null;
  filterState.gebruik   = gebruikData ?? "";
  filterState.bestType  = bestTypeData ?? "";

  // Fetch & normalize all printers
  let allPrinters = [];
  try {
    const raw = await fetchProducts();
    allPrinters = normalizeProducts(raw ?? []);
  } catch {
    allPrinters = [];
  }

  filterState.priceGroups = computeDynamicPriceGroups(allPrinters, filterState.gebruik);

  // Full, non-price-restricted match set (price=null) — the gebruikType hard
  // filter is still applied inside matchPrinters/computeMatchForPriceGroup.
  const result = computeMatchForPriceGroup(allPrinters, filterState.gebruik, null, filterState.answers);
  filterState.baseMatches = Array.isArray(result.filteredMatchedPrinters) ? result.filteredMatchedPrinters : [];

  // Fallback: if the live fetch/computation yields nothing, seed the pool
  // with the printers that were already matched during the quiz.
  if (filterState.baseMatches.length === 0) {
    const storedData = localStorage.getItem("printer_filteredMatchedPrinters");
    if (storedData) {
      try {
        const storedPrinters = JSON.parse(storedData);
        if (Array.isArray(storedPrinters) && storedPrinters.length > 0) {
          filterState.baseMatches = storedPrinters;
        }
      } catch { /* ignore */ }
    }
  }

  // No price bucket selected by default: show every matching printer, and
  // let the user optionally narrow by budget via the price filter.
  filterState.priceLabels = new Set();

  renderAllFilters();

  // Delegate all filter changes
  filtersPanel.addEventListener("change", handleFilterChange);

  // Clear filters button
  const clearBtn = qs("#clearFiltersBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      filterState.priceLabels.clear();
      filterState.brands.clear();
      filterState.printtechnologieen.clear();
      filterState.kleuren.clear();
      filterState.snelheden.clear();
      filterState.functies.clear();
      filterState.aanbieder.clear();
      renderAllFilters();
      applyFilters();
    });
  }

  // Always use the freshly computed matches so the initial render
  // is consistent with what applyFilters() will produce later.
  applyFilters();
}
