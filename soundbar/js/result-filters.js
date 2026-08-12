import { priceGroupsBySize, breedteGroupToRange, getKanalenGroep, KANALEN_GROEP_ORDER } from "./data.js";
import { matchSoundbars } from "./matching.js";
import { computeDynamicPriceGroups, normalizeProducts, parsePrice, qs } from "./utils.js";
import { updateResultMatches } from "./result.js";
import { fetchProducts } from "./supabase.js";

const filterState = {
  priceLabels:  new Set(),
  brands:       new Set(),
  kanalen:      new Set(),
  subwoofer:    new Set(),
  surround:     new Set(),
  wandmontage:  new Set(),
  wifi:         new Set(),
  hdmiOptions:  new Set(),
  aanbieder:    new Set(),
  baseMatches:  [],
  answers:      null,
  scores:       null,
  bestType:     "",
  breedteGroup: ""
};

// Prijsbuckets worden altijd vers herberekend vanuit de zojuist opgehaalde
// catalogus (niet vertrouwd op de localStorage-snapshot van het quiz-moment).
function getDynamicPriceGroups(breedteGroup) {
  if (Array.isArray(filterState.priceGroups) && filterState.priceGroups.length > 0) {
    return filterState.priceGroups;
  }
  return priceGroupsBySize[breedteGroup] || [];
}

function formatBrandLabel(brand) {
  const raw = String(brand ?? "").trim();
  if (!raw) return "";
  if (raw === raw.toUpperCase()) return raw;
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function getBaseMatches() {
  return filterState.baseMatches;
}

function getPriceScopedMatches() {
  const base = getBaseMatches();
  if (filterState.priceLabels.size === 0) return base;
  const groups = getDynamicPriceGroups(filterState.breedteGroup)
    .filter(g => filterState.priceLabels.has(g.label));
  if (groups.length === 0) return base;
  return base.filter(sb => {
    const price = parsePrice(sb.prijs);
    return groups.some(g => price >= g.min && price <= g.max);
  });
}

function collectBrandOptions(matches) {
  const set = new Set();
  matches.forEach(sb => { const label = formatBrandLabel(sb.merk); if (label) set.add(label); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "nl"));
}

function collectKanalenOptions(matches) {
  const set = new Set();
  matches.forEach(sb => { set.add(getKanalenGroep(sb)); });
  return KANALEN_GROEP_ORDER.filter(g => set.has(g));
}

function collectSubwooferOptions(matches) {
  const set = new Set();
  matches.forEach(sb => { if (sb.subwoofer_meegeleverd) set.add(sb.subwoofer_meegeleverd); });
  return Array.from(set);
}

function collectSurroundOptions(matches) {
  const set = new Set();
  matches.forEach(sb => {
    const d = String(sb.audio_decoders || "").toLowerCase();
    set.add(d.includes("atmos") || d.includes("dts:x") || d.includes("dts x") ? "Ja" : "Nee");
  });
  return Array.from(set);
}

function collectWandmontageOptions(matches) {
  const set = new Set();
  matches.forEach(sb => { if (sb.wandmontage) set.add(sb.wandmontage); });
  return Array.from(set);
}

function collectWifiOptions(matches) {
  const set = new Set();
  matches.forEach(sb => { if (sb.wifi) set.add(sb.wifi); });
  return Array.from(set);
}

function collectHdmiOptions(matches) {
  const set = new Set();
  matches.forEach(sb => { if (sb.hdmi_poorten) set.add(sb.hdmi_poorten); });
  return Array.from(set).sort((a, b) => a - b);
}

function collectAanbiederOptions(matches) {
  const set = new Set();
  matches.forEach(sb => {
    (sb.aanbieders ?? []).forEach(a => set.add(a.winkel));
  });
  return Array.from(set).sort();
}

function hasSurround(sb) {
  const d = String(sb.audio_decoders || "").toLowerCase();
  return d.includes("atmos") || d.includes("dts:x") || d.includes("dts x") ? "Ja" : "Nee";
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
    filtered = filtered.filter(sb => filterState.brands.has(formatBrandLabel(sb.merk)));
  }

  if (filterState.kanalen.size > 0) {
    filtered = filtered.filter(sb => filterState.kanalen.has(getKanalenGroep(sb)));
  }

  if (filterState.subwoofer.size > 0) {
    filtered = filtered.filter(sb => filterState.subwoofer.has(sb.subwoofer_meegeleverd));
  }

  if (filterState.surround.size > 0) {
    filtered = filtered.filter(sb => filterState.surround.has(hasSurround(sb)));
  }

  if (filterState.wandmontage.size > 0) {
    filtered = filtered.filter(sb => filterState.wandmontage.has(sb.wandmontage));
  }

  if (filterState.wifi.size > 0) {
    filtered = filtered.filter(sb => filterState.wifi.has(sb.wifi));
  }

  if (filterState.hdmiOptions.size > 0) {
    filtered = filtered.filter(sb => filterState.hdmiOptions.has(sb.hdmi_poorten));
  }

  if (filterState.aanbieder.size > 0) {
    filtered = filtered.filter(sb =>
      (sb.aanbieders ?? []).some(a => filterState.aanbieder.has(a.winkel))
    );
  }

  updateClearFiltersBtn();
  updateResultMatches(filtered, filterState.answers, filterState.bestType);
}

function updateClearFiltersBtn() {
  const btn = qs("#clearFiltersBtn");
  if (!btn) return;
  const hasActive = filterState.priceLabels.size > 0 || filterState.brands.size > 0 ||
    filterState.kanalen.size > 0 || filterState.subwoofer.size > 0 ||
    filterState.surround.size > 0 || filterState.wandmontage.size > 0 ||
    filterState.wifi.size > 0 || filterState.hdmiOptions.size > 0 ||
    filterState.aanbieder.size > 0;
  btn.hidden = !hasActive;
}

function renderAllFilters() {
  const matches = getPriceScopedMatches();

  const filters = [
    { key: "priceLabels", filter: "price",       collect: () => getDynamicPriceGroups(filterState.breedteGroup).filter(g => getBaseMatches().some(sb => { const p = parsePrice(sb.prijs); return p >= g.min && p <= g.max; })).map(g => g.label), labelFn: label => `€ ${label}`, hideIfSingle: true },
    { key: "brands",      filter: "brand",       collect: () => collectBrandOptions(matches) },
    { key: "kanalen",     filter: "kanalen",     collect: () => collectKanalenOptions(matches) },
    { key: "subwoofer",   filter: "subwoofer",   collect: () => collectSubwooferOptions(matches) },
    { key: "surround",    filter: "surround",    collect: () => collectSurroundOptions(matches) },
    { key: "wandmontage", filter: "wandmontage", collect: () => collectWandmontageOptions(matches) },
    { key: "wifi",        filter: "wifi",        collect: () => collectWifiOptions(matches) },
    { key: "hdmiOptions", filter: "hdmi",        collect: () => collectHdmiOptions(matches), labelFn: n => `${n} HDMI` },
    { key: "aanbieder",   filter: "aanbieder",   collect: () => collectAanbiederOptions(matches) },
  ];

  filters.forEach(({ key, filter, collect, labelFn, hideIfSingle }) => {
    const container = qs(`[data-filter-container='${filter}']`);
    const card      = qs(`.filter-card[data-filter='${filter}']`);
    if (!container || !card) return;

    const items = collect();
    renderFilterOptions(container, card, items, key, labelFn);
    container.querySelectorAll('input[type="checkbox"]').forEach(input => {
      if (input.value === "all") {
        input.checked = filterState[key].size === 0;
      } else {
        const parsed = key === "hdmiOptions" ? parseInt(input.value, 10) : input.value;
        input.checked = filterState[key].has(parsed);
      }
    });
    if (hideIfSingle && items.length <= 1) card.hidden = true;
  });

  updateClearFiltersBtn();
}

function handleFilterChange(event) {
  const input = event.target.closest("input");
  if (!input) return;

  const name  = input.name;
  const value = input.value;

  const setMap = {
    priceLabels: { set: filterState.priceLabels, parse: v => v },
    brands:      { set: filterState.brands,      parse: v => v },
    kanalen:     { set: filterState.kanalen,      parse: v => v },
    subwoofer:   { set: filterState.subwoofer,    parse: v => v, exclusive: true },
    surround:    { set: filterState.surround,     parse: v => v, exclusive: true },
    wandmontage: { set: filterState.wandmontage,  parse: v => v, exclusive: true },
    wifi:        { set: filterState.wifi,         parse: v => v, exclusive: true },
    hdmiOptions: { set: filterState.hdmiOptions,  parse: v => parseInt(v, 10) },
    aanbieder:   { set: filterState.aanbieder,    parse: v => v }
  };

  if (!setMap[name]) return;

  const { set, parse, exclusive } = setMap[name];

  if (value === "all") {
    set.clear();
  } else {
    const parsed = parse(value);
    if (input.checked) {
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

  // Laad state uit localStorage
  const answersData      = localStorage.getItem("soundbar_answers");
  const scoresData       = localStorage.getItem("soundbar_scores");
  const breedteGroupData = localStorage.getItem("soundbar_selectedBreedteGroup");
  const bestTypeData     = localStorage.getItem("soundbar_bestType");

  filterState.answers      = answersData  ? JSON.parse(answersData)  : null;
  filterState.scores       = scoresData   ? JSON.parse(scoresData)   : null;
  filterState.breedteGroup = breedteGroupData ?? "";
  filterState.priceLabels  = new Set();
  filterState.bestType     = bestTypeData ?? "";

  // Haal & normaliseer alle soundbars op
  let allSoundbars = [];
  try {
    const raw = await fetchProducts();
    allSoundbars = normalizeProducts(raw ?? []);
  } catch {
    allSoundbars = [];
  }

  filterState.priceGroups = computeDynamicPriceGroups(allSoundbars, filterState.breedteGroup, breedteGroupToRange);
  const liveResult = matchSoundbars(allSoundbars, filterState.breedteGroup, null, filterState.answers, filterState.scores);
  let baseMatches = Array.isArray(liveResult.filteredMatchedSoundbars) ? liveResult.filteredMatchedSoundbars : [];

  // Fallback: als de live fetch niets oplevert, val terug op de matches die
  // al berekend en opgeslagen waren op het moment van quiz-indienen.
  if (baseMatches.length === 0) {
    const storedData = localStorage.getItem("soundbar_filteredMatchedSoundbars");
    if (storedData) {
      try {
        const storedSoundbars = JSON.parse(storedData);
        if (Array.isArray(storedSoundbars) && storedSoundbars.length > 0) {
          baseMatches = storedSoundbars;
        }
      } catch { /* ignore */ }
    }
  }

  filterState.baseMatches = baseMatches;

  renderAllFilters();

  filtersPanel.addEventListener("change", handleFilterChange);

  const clearBtn = qs("#clearFiltersBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      filterState.priceLabels.clear();
      filterState.brands.clear();
      filterState.kanalen.clear();
      filterState.subwoofer.clear();
      filterState.surround.clear();
      filterState.wandmontage.clear();
      filterState.wifi.clear();
      filterState.hdmiOptions.clear();
      filterState.aanbieder.clear();
      renderAllFilters();
      applyFilters();
    });
  }

  applyFilters();
}
