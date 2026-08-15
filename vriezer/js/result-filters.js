import { matchVriezers } from "./matching.js";
import { GESCHIKT_VOOR_GARAGE_KLASSEN } from "./data.js";
import { computeDynamicPriceGroups, normalizeProducts, parsePrice, qs } from "./utils.js";
import { updateResultMatches } from "./result.js";
import { fetchProducts } from "./supabase.js";

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
  aanbieder:     new Set(),
  baseMatches:   [],
  priceGroups:   [],
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
    filterState.garage.size > 0 || filterState.aanbieder.size > 0;
  btn.hidden = !hasActive;
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
  const aanbiederContainer    = qs("[data-filter-container='aanbieder']");

  const priceCard        = qs(".filter-card[data-filter='price']");
  const plaatsingCard    = qs(".filter-card[data-filter='plaatsing']");
  const brandCard        = qs(".filter-card[data-filter='brand']");
  const capaciteitCard   = qs(".filter-card[data-filter='capaciteit']");
  const energielabelCard = qs(".filter-card[data-filter='energielabel']");
  const nofrostCard      = qs(".filter-card[data-filter='nofrost']");
  const geluidCard       = qs(".filter-card[data-filter='geluid']");
  const garageCard       = qs(".filter-card[data-filter='garage']");
  const aanbiederCard    = qs(".filter-card[data-filter='aanbieder']");

  if (priceContainer && priceCard) {
    const base = getBaseMatches();
    const groups = getDynamicPriceGroups().filter(group => {
      return base.some(v => {
        const price = parsePrice(v.prijs);
        return price >= group.min && price <= group.max;
      });
    });
    renderFilterOptions(priceContainer, priceCard, groups.map(g => g.label), "priceLabels", label => `€ ${label}`);
    priceContainer.querySelectorAll('input[type="checkbox"]').forEach(input => {
      if (input.value === "all") input.checked = filterState.priceLabels.size === 0;
      else input.checked = filterState.priceLabels.has(input.value);
    });
    if (groups.length <= 1) priceCard.hidden = true;
  }

  if (plaatsingContainer && plaatsingCard) {
    const opts = collectPlaatsingOptions(matches);
    renderFilterOptions(plaatsingContainer, plaatsingCard, opts, "plaatsingen", null);
    plaatsingContainer.querySelectorAll('input[type="checkbox"]').forEach(input => {
      if (input.value === "all") input.checked = filterState.plaatsingen.size === 0;
      else input.checked = filterState.plaatsingen.has(input.value);
    });
    if (opts.length <= 1) plaatsingCard.hidden = true;
  }

  if (brandContainer && brandCard) {
    const brands = collectBrandOptions(matches);
    renderFilterOptions(brandContainer, brandCard, brands, "brands", null);
    brandContainer.querySelectorAll('input[type="checkbox"]').forEach(input => {
      if (input.value === "all") input.checked = filterState.brands.size === 0;
      else input.checked = filterState.brands.has(input.value);
    });
  }

  if (capaciteitContainer && capaciteitCard) {
    const caps = collectCapaciteitOptions(matches);
    renderFilterOptions(capaciteitContainer, capaciteitCard, caps, "capaciteiten", null);
    capaciteitContainer.querySelectorAll('input[type="checkbox"]').forEach(input => {
      if (input.value === "all") input.checked = filterState.capaciteiten.size === 0;
      else input.checked = filterState.capaciteiten.has(input.value);
    });
  }

  if (energielabelContainer && energielabelCard) {
    const labels = collectEnergielabelOptions(matches);
    renderFilterOptions(energielabelContainer, energielabelCard, labels, "energielabels", l => `Label ${l}`);
    energielabelContainer.querySelectorAll('input[type="checkbox"]').forEach(input => {
      if (input.value === "all") input.checked = filterState.energielabels.size === 0;
      else input.checked = filterState.energielabels.has(input.value);
    });
  }

  if (nofrostContainer && nofrostCard) {
    const opts = collectNofrostOptions(matches);
    renderFilterOptions(nofrostContainer, nofrostCard, opts, "nofrost", null);
    nofrostContainer.querySelectorAll('input[type="checkbox"]').forEach(input => {
      if (input.value === "all") input.checked = filterState.nofrost.size === 0;
      else input.checked = filterState.nofrost.has(input.value);
    });
  }

  if (geluidContainer && geluidCard) {
    const opts = collectGeluidOptions(matches);
    renderFilterOptions(geluidContainer, geluidCard, opts, "geluid", null);
    geluidContainer.querySelectorAll('input[type="checkbox"]').forEach(input => {
      if (input.value === "all") input.checked = filterState.geluid.size === 0;
      else input.checked = filterState.geluid.has(input.value);
    });
  }

  if (garageContainer && garageCard) {
    const opts = collectGarageOptions(matches);
    renderFilterOptions(garageContainer, garageCard, opts, "garage", null);
    garageContainer.querySelectorAll('input[type="checkbox"]').forEach(input => {
      if (input.value === "all") input.checked = filterState.garage.size === 0;
      else input.checked = filterState.garage.has(input.value);
    });
  }

  if (aanbiederContainer && aanbiederCard) {
    const opts = collectAanbiederOptions(matches);
    renderFilterOptions(aanbiederContainer, aanbiederCard, opts, "aanbieder", null);
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
    priceLabels:   { set: filterState.priceLabels,   parse: v => v },
    plaatsingen:   { set: filterState.plaatsingen,   parse: v => v, exclusive: true },
    brands:        { set: filterState.brands,        parse: v => v },
    capaciteiten:  { set: filterState.capaciteiten,  parse: v => v },
    energielabels: { set: filterState.energielabels, parse: v => v },
    nofrost:       { set: filterState.nofrost,       parse: v => v, exclusive: true },
    geluid:        { set: filterState.geluid,        parse: v => v, exclusive: true },
    garage:        { set: filterState.garage,        parse: v => v, exclusive: true },
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
  filterState.priceGroups = computeDynamicPriceGroups(baseMatches);

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
      filterState.aanbieder.clear();
      renderAllFilters();
      applyFilters();
    });
  }

  applyFilters();
}
