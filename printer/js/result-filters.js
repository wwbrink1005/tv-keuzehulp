import { priceGroupsByGebruik } from "./data.js";
import { computeMatchForPriceGroup } from "./matching.js";
import { computeDynamicPriceGroups, normalizeProducts, parsePrice, qs } from "./utils.js";
import { updateResultMatches } from "./result.js";
import { fetchProducts } from "./supabase.js";

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
  return opties;
}

const FUNCTIE_LABELS = {
  "duplex": "Dubbelzijdig printen",
  "scan-kopieer": "Scannen en kopiëren",
  "wifi": "Wifi",
  "display": "Display"
};

function collectAanbiederOptions(matches) {
  const set = new Set();
  matches.forEach(p => {
    const a = p.aanbieder;
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
      return false;
    });
  }

  if (filterState.aanbieder.size > 0) {
    filtered = filtered.filter(p => {
      const a = p.aanbieder;
      if (!a) return false;
      if (filterState.aanbieder.has("Coolblue")) {
        const price = parseFloat(String(a.prijs_cb ?? "").replace(",", "."));
        if (a.url_cb && Number.isFinite(price) && price > 0) return true;
      }
      if (filterState.aanbieder.has("Expert")) {
        const price = parseFloat(String(a.prijs_expert ?? "").replace(",", "."));
        if (a.url_expert && Number.isFinite(price) && price > 0) return true;
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
    const labels = groups.filter(g => base.some(p => {
      const price = parsePrice(p.prijs);
      return price >= g.min && price <= g.max;
    }));
    if (labels.length <= 1) {
      priceContainer.innerHTML = "";
      priceCard.hidden = true;
    } else {
      renderFilterOptions(priceContainer, priceCard, labels.map(g => g.label), "priceLabels", label => `€ ${label}`);
    }
  }

  if (brandContainer && brandCard) {
    const brands = collectBrandOptions(matches);
    renderFilterOptions(brandContainer, brandCard, brands, "brands", null);
    brandContainer.querySelectorAll('input[type="checkbox"]').forEach(input => {
      if (input.value === "all") input.checked = filterState.brands.size === 0;
      else input.checked = filterState.brands.has(input.value);
    });
  }

  if (techContainer && techCard) {
    const techs = collectPrinttechnologieOptions(matches);
    renderFilterOptions(techContainer, techCard, techs, "printtechnologieen", null);
    techContainer.querySelectorAll('input[type="checkbox"]').forEach(input => {
      if (input.value === "all") input.checked = filterState.printtechnologieen.size === 0;
      else input.checked = filterState.printtechnologieen.has(input.value);
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

  if (snelheidContainer && snelheidCard) {
    const snelheden = collectSnelheidOptions(matches);
    renderFilterOptions(snelheidContainer, snelheidCard, snelheden, "snelheden", key => SNELHEID_GROEPEN.find(g => g.key === key)?.label ?? key);
    snelheidContainer.querySelectorAll('input[type="checkbox"]').forEach(input => {
      if (input.value === "all") input.checked = filterState.snelheden.size === 0;
      else input.checked = filterState.snelheden.has(input.value);
    });
  }

  if (functieContainer && functieCard) {
    const functies = collectFunctieOptions(matches);
    renderFilterOptions(functieContainer, functieCard, functies, "functies", f => FUNCTIE_LABELS[f] ?? f);
    functieContainer.querySelectorAll('input[type="checkbox"]').forEach(input => {
      if (input.value === "all") input.checked = filterState.functies.size === 0;
      else input.checked = filterState.functies.has(input.value);
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
