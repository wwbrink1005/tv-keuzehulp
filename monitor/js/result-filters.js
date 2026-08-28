import { priceGroupsBySize, sizeGroupToAllowedSizes } from "./data.js";
import { matchMonitors, applyMinAanbiedersCascade, DEFAULT_MIN_AANBIEDERS } from "./matching.js";
import { computeDynamicPriceGroups, normalizeProducts, parsePrice, qs } from "./utils.js";
import { updateResultMatches } from "./result.js";
import { fetchProducts } from "./supabase.js";
import { computeCounts, renderFilterList } from "../../shared/filters.js";

const MIN_AANBIEDERS_OPTIONS = [1, 2, 3, 4, 5];

const filterState = {
  priceLabels:  new Set(),
  minAanbieders: DEFAULT_MIN_AANBIEDERS,
  sizes:        new Set(),
  brands:       new Set(),
  panelTypes:   new Set(),
  resolutions:  new Set(),
  hzOptions:    new Set(),
  aspectRatios: new Set(),
  // Gebogen scherm, ingebouwde speakers en USB-C waren 3 losse Ja/Nee-
  // kaarten — samengevoegd tot 1 "Functies"-kaart (zie FUNCTIE_DEFINITIES).
  functies:     new Set(),
  hdmiOptions:  new Set(),
  aanbieder:    new Set(),
  baseMatches:  [],
  answers:      null,
  scores:       null,
  bestType:     "",
  sizeGroup:    ""
};

const FUNCTIE_DEFINITIES = [
  { key: "curved", label: "Gebogen scherm", check: m => m.gebogen === "Gebogen" },
  { key: "speakers", label: "Ingebouwde speakers", check: m => m.speakers === "Ja" },
  { key: "usbc", label: "USB-C", check: m => m.usb_c === "Ja" },
];

// Price buckets are recomputed fresh from the live-fetched catalog on every
// results page load (not trusted from the quiz-time localStorage snapshot),
// since a stale/short-lived fetch during the quiz can produce fewer or
// narrower buckets than the catalog actually supports (e.g. missing the
// most expensive bucket entirely).
function getDynamicPriceGroups(sizeGroup) {
  if (Array.isArray(filterState.priceGroups) && filterState.priceGroups.length > 0) {
    return filterState.priceGroups;
  }
  return priceGroupsBySize[sizeGroup] || [];
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
  const groups = getDynamicPriceGroups(filterState.sizeGroup)
    .filter(g => filterState.priceLabels.has(g.label));
  if (groups.length === 0) return base;
  return base.filter(m => {
    const price = parsePrice(m.prijs);
    return groups.some(g => price >= g.min && price <= g.max);
  });
}

function getSecondaryScopedMatches() {
  return getPriceScopedMatches().filter(m => (m.aanbieders ?? []).length >= filterState.minAanbieders);
}

function getBaseScopedByMinAanbieders() {
  return getBaseMatches().filter(m => (m.aanbieders ?? []).length >= filterState.minAanbieders);
}

function collectSizeOptions(matches) {
  const set = new Set();
  matches.forEach(m => { if (m.schermdiagonaal) set.add(m.schermdiagonaal); });
  return Array.from(set).sort((a, b) => a - b);
}

function collectBrandOptions(matches) {
  const set = new Set();
  matches.forEach(m => { const label = formatBrandLabel(m.merk); if (label) set.add(label); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "nl"));
}

function collectPanelTypeOptions(matches) {
  const set = new Set();
  matches.forEach(m => { if (m.paneeltype) set.add(m.paneeltype); });
  const order = ["IPS", "OLED", "VA", "TN"];
  const inOrder = order.filter(t => set.has(t));
  set.forEach(t => { if (!order.includes(t)) inOrder.push(t); });
  return inOrder;
}

function collectResolutionOptions(matches) {
  const set = new Set();
  matches.forEach(m => { if (m.resolutie) set.add(m.resolutie); });
  const order = ["Full HD", "QHD", "UWFHD", "UWQHD", "4K", "WUXGA"];
  const inOrder = order.filter(t => set.has(t));
  set.forEach(t => { if (!order.includes(t)) inOrder.push(t); });
  return inOrder;
}

function collectHzOptions(matches) {
  const set = new Set();
  matches.forEach(m => { if (m.hz) set.add(m.hz); });
  return Array.from(set).sort((a, b) => a - b);
}

function collectAspectRatioOptions(matches) {
  const set = new Set();
  matches.forEach(m => { if (m.beeldverhouding) set.add(m.beeldverhouding); });
  const order = ["16:9", "16:10", "21:9", "32:9"];
  const inOrder = order.filter(t => set.has(t));
  set.forEach(t => { if (!order.includes(t)) inOrder.push(t); });
  return inOrder;
}

function collectFunctieOptions(matches) {
  return FUNCTIE_DEFINITIES.filter(f => matches.some(f.check)).map(f => f.key);
}

function collectHdmiOptions(matches) {
  const set = new Set();
  matches.forEach(m => { if (m.hdmi_poorten) set.add(m.hdmi_poorten); });
  return Array.from(set).sort((a, b) => a - b);
}

function collectAanbiederOptions(matches) {
  const set = new Set();
  matches.forEach(m => {
    (m.aanbieders ?? []).forEach(a => set.add(a.winkel));
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

  if (filterState.sizes.size > 0) {
    filtered = filtered.filter(m => filterState.sizes.has(m.schermdiagonaal));
  }

  if (filterState.brands.size > 0) {
    filtered = filtered.filter(m => filterState.brands.has(formatBrandLabel(m.merk)));
  }

  if (filterState.panelTypes.size > 0) {
    filtered = filtered.filter(m => filterState.panelTypes.has(m.paneeltype));
  }

  if (filterState.resolutions.size > 0) {
    filtered = filtered.filter(m => filterState.resolutions.has(m.resolutie));
  }

  if (filterState.hzOptions.size > 0) {
    filtered = filtered.filter(m => filterState.hzOptions.has(m.hz));
  }

  if (filterState.aspectRatios.size > 0) {
    filtered = filtered.filter(m => filterState.aspectRatios.has(m.beeldverhouding));
  }

  if (filterState.functies.size > 0) {
    filtered = filtered.filter(m =>
      FUNCTIE_DEFINITIES.filter(f => filterState.functies.has(f.key)).every(f => f.check(m))
    );
  }

  if (filterState.hdmiOptions.size > 0) {
    filtered = filtered.filter(m => filterState.hdmiOptions.has(m.hdmi_poorten));
  }

  if (filterState.aanbieder.size > 0) {
    filtered = filtered.filter(m =>
      (m.aanbieders ?? []).some(a => filterState.aanbieder.has(a.winkel))
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
  const hasActive = filterState.priceLabels.size > 0 || filterState.sizes.size > 0 || filterState.brands.size > 0 ||
    filterState.panelTypes.size > 0 || filterState.resolutions.size > 0 ||
    filterState.hzOptions.size > 0 || filterState.aspectRatios.size > 0 ||
    filterState.functies.size > 0 ||
    filterState.hdmiOptions.size > 0 || filterState.aanbieder.size > 0 ||
    filterState.minAanbieders !== DEFAULT_MIN_AANBIEDERS;
  btn.hidden = !hasActive;
}

function renderMinAanbiedersOptions(container, card) {
  if (!container || !card) return;
  const matches = getPriceScopedMatches();
  const options = MIN_AANBIEDERS_OPTIONS.map(n => ({
    n,
    count: matches.filter(m => (m.aanbieders ?? []).length >= n).length,
  })).filter(o => o.count > 0);

  // Corrigeer de drempel naar een geldige optie VOORDAT de kaart eventueel
  // wordt verborgen — anders blijft filterState.minAanbieders op een
  // onhaalbare waarde staan en gaan de kaarten hieronder ten onrechte
  // allemaal leeg renderen.
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
  const priceContainer    = qs("[data-filter-container='price']");
  const minAanbiedersContainer = qs("[data-filter-container='min-aanbieders']");
  const sizeContainer     = qs("[data-filter-container='size']");
  const brandContainer    = qs("[data-filter-container='brand']");
  const panelContainer    = qs("[data-filter-container='panel']");
  const resContainer      = qs("[data-filter-container='resolution']");
  const hzContainer       = qs("[data-filter-container='hz']");
  const aspectContainer   = qs("[data-filter-container='aspect']");
  const functieContainer  = qs("[data-filter-container='functies']");
  const hdmiContainer     = qs("[data-filter-container='hdmi']");
  const aanbiederContainer = qs("[data-filter-container='aanbieder']");

  const priceCard     = qs(".filter-card[data-filter='price']");
  const sizeCard      = qs(".filter-card[data-filter='size']");
  const brandCard     = qs(".filter-card[data-filter='brand']");
  const panelCard     = qs(".filter-card[data-filter='panel']");
  const resCard       = qs(".filter-card[data-filter='resolution']");
  const hzCard        = qs(".filter-card[data-filter='hz']");
  const aspectCard    = qs(".filter-card[data-filter='aspect']");
  const functieCard   = qs(".filter-card[data-filter='functies']");
  const hdmiCard      = qs(".filter-card[data-filter='hdmi']");
  const aanbiederCard = qs(".filter-card[data-filter='aanbieder']");
  const minAanbiedersCard = qs(".filter-card[data-filter='min-aanbieders']");

  renderMinAanbiedersOptions(minAanbiedersContainer, minAanbiedersCard);
  const matches = getSecondaryScopedMatches();

  if (priceContainer && priceCard) {
    const base = getBaseScopedByMinAanbieders();
    const groups = getDynamicPriceGroups(filterState.sizeGroup);
    const groupForPrice = price => groups.find(g => price >= g.min && price <= g.max);
    const counts = computeCounts(base, m => groupForPrice(parsePrice(m.prijs))?.label);
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

  if (sizeContainer && sizeCard) {
    renderFilterOptions(sizeContainer, sizeCard, collectSizeOptions(matches), matches, m => m.schermdiagonaal, "sizes", s => `${s}"`);
  }

  if (brandContainer && brandCard) {
    renderFilterOptions(brandContainer, brandCard, collectBrandOptions(matches), matches, m => formatBrandLabel(m.merk), "brands");
  }

  if (panelContainer && panelCard) {
    renderFilterOptions(panelContainer, panelCard, collectPanelTypeOptions(matches), matches, m => m.paneeltype, "panelTypes");
  }

  if (resContainer && resCard) {
    renderFilterOptions(resContainer, resCard, collectResolutionOptions(matches), matches, m => m.resolutie, "resolutions");
  }

  if (hzContainer && hzCard) {
    renderFilterOptions(hzContainer, hzCard, collectHzOptions(matches), matches, m => m.hz, "hzOptions", hz => `${hz}Hz`);
  }

  if (aspectContainer && aspectCard) {
    renderFilterOptions(aspectContainer, aspectCard, collectAspectRatioOptions(matches), matches, m => m.beeldverhouding, "aspectRatios");
  }

  if (functieContainer && functieCard) {
    const functieValueFn = m => FUNCTIE_DEFINITIES.filter(f => f.check(m)).map(f => f.key);
    const labelFn = key => FUNCTIE_DEFINITIES.find(f => f.key === key)?.label ?? key;
    renderFilterOptions(functieContainer, functieCard, collectFunctieOptions(matches), matches, functieValueFn, "functies", labelFn);
  }

  if (hdmiContainer && hdmiCard) {
    renderFilterOptions(hdmiContainer, hdmiCard, collectHdmiOptions(matches), matches, m => m.hdmi_poorten, "hdmiOptions", n => `${n} HDMI`);
  }

  if (aanbiederContainer && aanbiederCard) {
    renderFilterOptions(aanbiederContainer, aanbiederCard, collectAanbiederOptions(matches), matches, m => (m.aanbieders ?? []).map(a => a.winkel), "aanbieder");
  }

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
    sizes:       { set: filterState.sizes,      parse: v => parseFloat(v) },
    brands:      { set: filterState.brands,      parse: v => v },
    panelTypes:  { set: filterState.panelTypes,  parse: v => v },
    resolutions: { set: filterState.resolutions, parse: v => v },
    hzOptions:   { set: filterState.hzOptions,   parse: v => parseInt(v, 10) },
    aspectRatios: { set: filterState.aspectRatios, parse: v => v },
    functies:    { set: filterState.functies,    parse: v => v },
    hdmiOptions: { set: filterState.hdmiOptions, parse: v => parseInt(v, 10) },
    aanbieder:   { set: filterState.aanbieder,   parse: v => v }
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
  const answersData     = localStorage.getItem("monitor_answers");
  const scoresData      = localStorage.getItem("monitor_scores");
  const sizeGroupData   = localStorage.getItem("monitor_selectedSizeGroup");
  const bestTypeData    = localStorage.getItem("monitor_bestType");

  filterState.answers   = answersData  ? JSON.parse(answersData)  : null;
  filterState.scores    = scoresData   ? JSON.parse(scoresData)   : null;
  filterState.sizeGroup = sizeGroupData ?? "";
  filterState.priceLabels = new Set();
  filterState.bestType  = bestTypeData ?? "";

  // Fetch & normalize all monitors
  let allMonitors = [];
  try {
    const raw = await fetchProducts();
    allMonitors = normalizeProducts(raw ?? []);
  } catch {
    allMonitors = [];
  }

  // Full, non-price-filtered matchset (priceGroup = null → no restriction).
  filterState.priceGroups = computeDynamicPriceGroups(allMonitors, filterState.sizeGroup, sizeGroupToAllowedSizes);
  const liveResult = matchMonitors(allMonitors, filterState.sizeGroup, null, filterState.answers, filterState.scores);
  let baseMatches = Array.isArray(liveResult.filteredMatchedMonitors) ? liveResult.filteredMatchedMonitors : [];

  // Fallback: if the live fetch yields nothing, fall back to the matches
  // that were already computed and stored at quiz-submit time.
  if (baseMatches.length === 0) {
    const storedData = localStorage.getItem("monitor_filteredMatchedMonitors");
    if (storedData) {
      try {
        const storedMonitors = JSON.parse(storedData);
        if (Array.isArray(storedMonitors) && storedMonitors.length > 0) {
          baseMatches = storedMonitors;
        }
      } catch { /* ignore */ }
    }
  }

  filterState.baseMatches = baseMatches;

  renderAllFilters();

  // Delegate all filter changes
  filtersPanel.addEventListener("change", handleFilterChange);

  // Clear filters button
  const clearBtn = qs("#clearFiltersBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      filterState.priceLabels.clear();
      filterState.sizes.clear();
      filterState.brands.clear();
      filterState.panelTypes.clear();
      filterState.resolutions.clear();
      filterState.hzOptions.clear();
      filterState.aspectRatios.clear();
      filterState.functies.clear();
      filterState.hdmiOptions.clear();
      filterState.aanbieder.clear();
      filterState.minAanbieders = DEFAULT_MIN_AANBIEDERS;
      renderAllFilters();
      applyFilters();
    });
  }

  // Always use the freshly computed matches so the initial render
  // is consistent with what applyFilters() will produce later.
  applyFilters();
}
