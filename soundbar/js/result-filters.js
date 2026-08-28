import { priceGroupsBySize, breedteGroupToRange, getKanalenGroep, KANALEN_GROEP_ORDER } from "./data.js";
import { matchSoundbars, applyMinAanbiedersCascade, DEFAULT_MIN_AANBIEDERS } from "./matching.js";
import { computeDynamicPriceGroups, computeDynamicDimensionGroups, normalizeProducts, parsePrice, qs } from "./utils.js";
import { updateResultMatches } from "./result.js";
import { fetchProducts } from "./supabase.js";
import { computeCounts, renderFilterList } from "../../shared/filters.js";

const MIN_AANBIEDERS_OPTIONS = [1, 2, 3, 4, 5];

const filterState = {
  priceLabels:  new Set(),
  minAanbieders: DEFAULT_MIN_AANBIEDERS,
  brands:       new Set(),
  kanalen:      new Set(),
  // Subwoofer meegeleverd, surround, wandmontage en wifi waren 4 losse Ja/
  // Nee-kaarten — samengevoegd tot 1 "Functies"-kaart (zie FUNCTIE_DEFINITIES).
  functies:     new Set(),
  hdmiOptions:  new Set(),
  breedteLabels: new Set(),
  aanbieder:    new Set(),
  baseMatches:  [],
  breedteGroups: [],
  answers:      null,
  scores:       null,
  bestType:     "",
  breedteGroup: ""
};

const FUNCTIE_DEFINITIES = [
  { key: "subwoofer", label: "Subwoofer meegeleverd", check: sb => sb.subwoofer_meegeleverd === "Ja" },
  { key: "surround", label: "Surround (Atmos/DTS:X)", check: sb => hasSurround(sb) === "Ja" },
  { key: "wandmontage", label: "Wandmontage mogelijk", check: sb => sb.wandmontage === "Ja" },
  { key: "wifi", label: "Wifi", check: sb => sb.wifi === "Ja" },
];

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

function getSecondaryScopedMatches() {
  return getPriceScopedMatches().filter(sb => (sb.aanbieders ?? []).length >= filterState.minAanbieders);
}

function getBaseScopedByMinAanbieders() {
  return getBaseMatches().filter(sb => (sb.aanbieders ?? []).length >= filterState.minAanbieders);
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

function collectFunctieOptions(matches) {
  return FUNCTIE_DEFINITIES.filter(f => matches.some(f.check)).map(f => f.key);
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

function applyFilters() {
  let filtered = getPriceScopedMatches();

  if (filterState.brands.size > 0) {
    filtered = filtered.filter(sb => filterState.brands.has(formatBrandLabel(sb.merk)));
  }

  if (filterState.kanalen.size > 0) {
    filtered = filtered.filter(sb => filterState.kanalen.has(getKanalenGroep(sb)));
  }

  if (filterState.functies.size > 0) {
    filtered = filtered.filter(sb =>
      FUNCTIE_DEFINITIES.filter(f => filterState.functies.has(f.key)).every(f => f.check(sb))
    );
  }

  if (filterState.hdmiOptions.size > 0) {
    filtered = filtered.filter(sb => filterState.hdmiOptions.has(sb.hdmi_poorten));
  }

  if (filterState.breedteLabels.size > 0) {
    const groups = filterState.breedteGroups.filter(g => filterState.breedteLabels.has(g.label));
    filtered = filtered.filter(sb => Number.isFinite(sb.breedte_mm) && groups.some(g => sb.breedte_mm / 10 >= g.min && sb.breedte_mm / 10 < g.max));
  }

  if (filterState.aanbieder.size > 0) {
    filtered = filtered.filter(sb =>
      (sb.aanbieders ?? []).some(a => filterState.aanbieder.has(a.winkel))
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
  const hasActive = filterState.priceLabels.size > 0 || filterState.brands.size > 0 ||
    filterState.kanalen.size > 0 || filterState.functies.size > 0 ||
    filterState.hdmiOptions.size > 0 ||
    filterState.breedteLabels.size > 0 ||
    filterState.aanbieder.size > 0 || filterState.minAanbieders !== DEFAULT_MIN_AANBIEDERS;
  btn.hidden = !hasActive;
}

// Bucket-groep-behorend-tot-mm-waarde, gedeeld door breedte/diepte/hoogte
// hieronder in de generieke `filters`-array.
function dimensieLabelFn(groups, mm) {
  if (!Number.isFinite(mm)) return undefined;
  return groups.find(g => mm / 10 >= g.min && mm / 10 < g.max)?.label;
}

function renderMinAanbiedersOptions() {
  const container = qs("[data-filter-container='min-aanbieders']");
  const card      = qs(".filter-card[data-filter='min-aanbieders']");
  if (!container || !card) return;

  const matches = getPriceScopedMatches();
  const options = MIN_AANBIEDERS_OPTIONS.map(n => ({
    n,
    count: matches.filter(sb => (sb.aanbieders ?? []).length >= n).length,
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
  // Vóór de rest: bepaalt/valideert filterState.minAanbieders, zodat de
  // secundaire kaarten hieronder de juiste drempel gebruiken.
  renderMinAanbiedersOptions();

  const matches = getSecondaryScopedMatches();
  const functieValueFn = sb => FUNCTIE_DEFINITIES.filter(f => f.check(sb)).map(f => f.key);
  const functieLabelFn = key => FUNCTIE_DEFINITIES.find(f => f.key === key)?.label ?? key;

  const filters = [
    { key: "priceLabels", filter: "price",       matches: getBaseScopedByMinAanbieders(), valueFn: sb => getDynamicPriceGroups(filterState.breedteGroup).find(g => { const p = parsePrice(sb.prijs); return p >= g.min && p <= g.max; })?.label, collect: (counts) => getDynamicPriceGroups(filterState.breedteGroup).filter(g => counts.has(g.label)).map(g => g.label), labelFn: label => `€ ${label}`, allLabel: "Alle prijzen" },
    { key: "brands",      filter: "brand",       matches, valueFn: sb => formatBrandLabel(sb.merk), collect: () => collectBrandOptions(matches) },
    { key: "kanalen",     filter: "kanalen",     matches, valueFn: sb => getKanalenGroep(sb), collect: () => collectKanalenOptions(matches) },
    { key: "functies",    filter: "functies",    matches, valueFn: functieValueFn, collect: () => collectFunctieOptions(matches), labelFn: functieLabelFn },
    { key: "hdmiOptions", filter: "hdmi",        matches, valueFn: sb => sb.hdmi_poorten, collect: () => collectHdmiOptions(matches), labelFn: n => `${n} HDMI` },
    { key: "breedteLabels", filter: "breedte", matches: getBaseScopedByMinAanbieders(), valueFn: sb => dimensieLabelFn(filterState.breedteGroups, sb.breedte_mm), collect: (counts) => filterState.breedteGroups.filter(g => counts.has(g.label)).map(g => g.label), allLabel: "Alle" },
    { key: "aanbieder",   filter: "aanbieder",   matches, valueFn: sb => (sb.aanbieders ?? []).map(a => a.winkel), collect: () => collectAanbiederOptions(matches) },
  ];

  filters.forEach(({ key, filter, matches: source, valueFn, collect, labelFn, allLabel }) => {
    const container = qs(`[data-filter-container='${filter}']`);
    const card      = qs(`.filter-card[data-filter='${filter}']`);
    if (!container || !card) return;

    const counts = computeCounts(source, valueFn);
    const items = collect(counts);
    const isBucketFilter = key === "priceLabels" || key === "breedteLabels";
    if (items.length === 0 || (isBucketFilter && items.length <= 1)) {
      container.innerHTML = "";
      card.hidden = true;
      return;
    }
    renderFilterList(container, card, { items, counts, filterName: key, stateSet: filterState[key], labelFn, allLabel });
  });

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
    priceLabels: { set: filterState.priceLabels, parse: v => v },
    brands:      { set: filterState.brands,      parse: v => v },
    kanalen:     { set: filterState.kanalen,      parse: v => v },
    functies:    { set: filterState.functies,     parse: v => v },
    hdmiOptions: { set: filterState.hdmiOptions,  parse: v => parseInt(v, 10) },
    breedteLabels: { set: filterState.breedteLabels, parse: v => v },
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

  filterState.priceGroups   = computeDynamicPriceGroups(allSoundbars, filterState.breedteGroup, breedteGroupToRange);
  filterState.breedteGroups = computeDynamicDimensionGroups(allSoundbars, "breedte_mm");
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
      filterState.functies.clear();
      filterState.hdmiOptions.clear();
      filterState.breedteLabels.clear();
      filterState.aanbieder.clear();
      filterState.minAanbieders = DEFAULT_MIN_AANBIEDERS;
      renderAllFilters();
      applyFilters();
    });
  }

  applyFilters();
}
