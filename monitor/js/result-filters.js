import { priceGroupsBySize, sizeGroupToAllowedSizes } from "./data.js";
import { matchMonitors } from "./matching.js";
import { computeDynamicPriceGroups, normalizeProducts, parsePrice, qs } from "./utils.js";
import { updateResultMatches } from "./result.js";
import { fetchProducts } from "./supabase.js";

const filterState = {
  priceLabels:  new Set(),
  sizes:        new Set(),
  brands:       new Set(),
  panelTypes:   new Set(),
  resolutions:  new Set(),
  hzOptions:    new Set(),
  aspectRatios: new Set(),
  curved:       new Set(),
  speakers:     new Set(),
  usbc:         new Set(),
  hdmiOptions:  new Set(),
  aanbieder:    new Set(),
  baseMatches:  [],
  answers:      null,
  scores:       null,
  bestType:     "",
  sizeGroup:    ""
};

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

function collectCurvedOptions(matches) {
  const set = new Set();
  matches.forEach(m => { if (m.gebogen) set.add(m.gebogen); });
  return Array.from(set);
}

function collectSpeakersOptions(matches) {
  const set = new Set();
  matches.forEach(m => { if (m.speakers) set.add(m.speakers); });
  return Array.from(set);
}

function collectUsbcOptions(matches) {
  const set = new Set();
  matches.forEach(m => { if (m.usb_c) set.add(m.usb_c); });
  return Array.from(set);
}

function collectHdmiOptions(matches) {
  const set = new Set();
  matches.forEach(m => { if (m.hdmi_poorten) set.add(m.hdmi_poorten); });
  return Array.from(set).sort((a, b) => a - b);
}

function collectAanbiederOptions(matches) {
  const set = new Set();
  matches.forEach(m => {
    const a = m.aanbieder;
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

  if (filterState.curved.size > 0) {
    filtered = filtered.filter(m => filterState.curved.has(m.gebogen));
  }

  if (filterState.speakers.size > 0) {
    filtered = filtered.filter(m => filterState.speakers.has(m.speakers));
  }

  if (filterState.usbc.size > 0) {
    filtered = filtered.filter(m => filterState.usbc.has(m.usb_c));
  }

  if (filterState.hdmiOptions.size > 0) {
    filtered = filtered.filter(m => filterState.hdmiOptions.has(m.hdmi_poorten));
  }

  if (filterState.aanbieder.size > 0) {
    filtered = filtered.filter(m => {
      const a = m.aanbieder;
      if (!a) return false;
      if (filterState.aanbieder.has("Coolblue")) {
        const p = parseFloat(String(a.prijs_cb ?? "").replace(",", "."));
        if (a.url_cb && Number.isFinite(p) && p > 0) return true;
      }
      if (filterState.aanbieder.has("Expert")) {
        const p = parseFloat(String(a.prijs_expert ?? "").replace(",", "."));
        if (a.url_expert && Number.isFinite(p) && p > 0) return true;
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
  const hasActive = filterState.priceLabels.size > 0 || filterState.sizes.size > 0 || filterState.brands.size > 0 ||
    filterState.panelTypes.size > 0 || filterState.resolutions.size > 0 ||
    filterState.hzOptions.size > 0 || filterState.aspectRatios.size > 0 ||
    filterState.curved.size > 0 || filterState.speakers.size > 0 ||
    filterState.usbc.size > 0 ||
    filterState.hdmiOptions.size > 0 || filterState.aanbieder.size > 0;
  btn.hidden = !hasActive;
}

function renderAllFilters(monitors) {
  const matches = getPriceScopedMatches();

  const priceContainer    = qs("[data-filter-container='price']");
  const sizeContainer     = qs("[data-filter-container='size']");
  const brandContainer    = qs("[data-filter-container='brand']");
  const panelContainer    = qs("[data-filter-container='panel']");
  const resContainer      = qs("[data-filter-container='resolution']");
  const hzContainer       = qs("[data-filter-container='hz']");
  const aspectContainer   = qs("[data-filter-container='aspect']");
  const curvedContainer   = qs("[data-filter-container='curved']");
  const speakersContainer = qs("[data-filter-container='speakers']");
  const usbcContainer     = qs("[data-filter-container='usbc']");
  const hdmiContainer     = qs("[data-filter-container='hdmi']");
  const aanbiederContainer = qs("[data-filter-container='aanbieder']");

  const priceCard     = qs(".filter-card[data-filter='price']");
  const sizeCard      = qs(".filter-card[data-filter='size']");
  const brandCard     = qs(".filter-card[data-filter='brand']");
  const panelCard     = qs(".filter-card[data-filter='panel']");
  const resCard       = qs(".filter-card[data-filter='resolution']");
  const hzCard        = qs(".filter-card[data-filter='hz']");
  const aspectCard    = qs(".filter-card[data-filter='aspect']");
  const curvedCard    = qs(".filter-card[data-filter='curved']");
  const speakersCard  = qs(".filter-card[data-filter='speakers']");
  const usbcCard      = qs(".filter-card[data-filter='usbc']");
  const hdmiCard      = qs(".filter-card[data-filter='hdmi']");
  const aanbiederCard = qs(".filter-card[data-filter='aanbieder']");

  if (priceContainer && priceCard) {
    const base = getBaseMatches();
    const groups = getDynamicPriceGroups(filterState.sizeGroup).filter(group => {
      return base.some(m => {
        const price = parsePrice(m.prijs);
        return price >= group.min && price <= group.max;
      });
    });
    renderFilterOptions(priceContainer, priceCard, groups.map(g => g.label), "priceLabels", label => `€ ${label}`, false);
    priceContainer.querySelectorAll('input[type="checkbox"]').forEach(input => {
      if (input.value === "all") input.checked = filterState.priceLabels.size === 0;
      else input.checked = filterState.priceLabels.has(input.value);
    });
    if (groups.length <= 1) priceCard.hidden = true;
  }

  if (sizeContainer && sizeCard) {
    const sizes = collectSizeOptions(matches);
    renderFilterOptions(sizeContainer, sizeCard, sizes, "sizes", s => `${s}"`, false);
    sizeContainer.querySelectorAll('input[type="checkbox"]').forEach(input => {
      if (input.value === "all") input.checked = filterState.sizes.size === 0;
      else input.checked = filterState.sizes.has(parseFloat(input.value));
    });
  }

  if (brandContainer && brandCard) {
    const brands = collectBrandOptions(matches);
    renderFilterOptions(brandContainer, brandCard, brands, "brands", null, false);
    brandContainer.querySelectorAll('input[type="checkbox"]').forEach(input => {
      if (input.value === "all") input.checked = filterState.brands.size === 0;
      else input.checked = filterState.brands.has(input.value);
    });
  }

  if (panelContainer && panelCard) {
    const panels = collectPanelTypeOptions(matches);
    renderFilterOptions(panelContainer, panelCard, panels, "panelTypes", null, false);
    panelContainer.querySelectorAll('input[type="checkbox"]').forEach(input => {
      if (input.value === "all") input.checked = filterState.panelTypes.size === 0;
      else input.checked = filterState.panelTypes.has(input.value);
    });
  }

  if (resContainer && resCard) {
    const resolutions = collectResolutionOptions(matches);
    renderFilterOptions(resContainer, resCard, resolutions, "resolutions", null, false);
    resContainer.querySelectorAll('input[type="checkbox"]').forEach(input => {
      if (input.value === "all") input.checked = filterState.resolutions.size === 0;
      else input.checked = filterState.resolutions.has(input.value);
    });
  }

  if (hzContainer && hzCard) {
    const hzOpts = collectHzOptions(matches);
    renderFilterOptions(hzContainer, hzCard, hzOpts, "hzOptions", hz => `${hz}Hz`, false);
    hzContainer.querySelectorAll('input[type="checkbox"]').forEach(input => {
      if (input.value === "all") input.checked = filterState.hzOptions.size === 0;
      else input.checked = filterState.hzOptions.has(parseInt(input.value, 10));
    });
  }

  if (aspectContainer && aspectCard) {
    const aspects = collectAspectRatioOptions(matches);
    renderFilterOptions(aspectContainer, aspectCard, aspects, "aspectRatios", null, false);
    aspectContainer.querySelectorAll('input[type="checkbox"]').forEach(input => {
      if (input.value === "all") input.checked = filterState.aspectRatios.size === 0;
      else input.checked = filterState.aspectRatios.has(input.value);
    });
  }

  if (curvedContainer && curvedCard) {
    const curvedOpts = collectCurvedOptions(matches);
    renderFilterOptions(curvedContainer, curvedCard, curvedOpts, "curved", null, false);
    curvedContainer.querySelectorAll('input[type="checkbox"]').forEach(input => {
      if (input.value === "all") input.checked = filterState.curved.size === 0;
      else input.checked = filterState.curved.has(input.value);
    });
  }

  if (speakersContainer && speakersCard) {
    const speakerOpts = collectSpeakersOptions(matches);
    renderFilterOptions(speakersContainer, speakersCard, speakerOpts, "speakers", null, false);
    speakersContainer.querySelectorAll('input[type="checkbox"]').forEach(input => {
      if (input.value === "all") input.checked = filterState.speakers.size === 0;
      else input.checked = filterState.speakers.has(input.value);
    });
  }

  if (usbcContainer && usbcCard) {
    const usbcOpts = collectUsbcOptions(matches);
    renderFilterOptions(usbcContainer, usbcCard, usbcOpts, "usbc", null, false);
    usbcContainer.querySelectorAll('input[type="checkbox"]').forEach(input => {
      if (input.value === "all") input.checked = filterState.usbc.size === 0;
      else input.checked = filterState.usbc.has(input.value);
    });
  }

  if (hdmiContainer && hdmiCard) {
    const hdmiOpts = collectHdmiOptions(matches);
    renderFilterOptions(hdmiContainer, hdmiCard, hdmiOpts, "hdmiOptions", n => `${n} HDMI`, false);
    hdmiContainer.querySelectorAll('input[type="checkbox"]').forEach(input => {
      if (input.value === "all") input.checked = filterState.hdmiOptions.size === 0;
      else input.checked = filterState.hdmiOptions.has(parseInt(input.value, 10));
    });
  }

  if (aanbiederContainer && aanbiederCard) {
    const aanbieders = collectAanbiederOptions(matches);
    renderFilterOptions(aanbiederContainer, aanbiederCard, aanbieders, "aanbieder", null, false);
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
    priceLabels: { set: filterState.priceLabels, parse: v => v },
    sizes:       { set: filterState.sizes,      parse: v => parseFloat(v) },
    brands:      { set: filterState.brands,      parse: v => v },
    panelTypes:  { set: filterState.panelTypes,  parse: v => v },
    resolutions: { set: filterState.resolutions, parse: v => v },
    hzOptions:   { set: filterState.hzOptions,   parse: v => parseInt(v, 10) },
    aspectRatios: { set: filterState.aspectRatios, parse: v => v },
    curved:      { set: filterState.curved,      parse: v => v, exclusive: true },
    speakers:    { set: filterState.speakers,    parse: v => v, exclusive: true },
    usbc:        { set: filterState.usbc,        parse: v => v, exclusive: true },
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

  renderAllFilters(allMonitors);

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
      filterState.curved.clear();
      filterState.speakers.clear();
      filterState.usbc.clear();
      filterState.hdmiOptions.clear();
      filterState.aanbieder.clear();
      renderAllFilters(allMonitors);
      applyFilters();
    });
  }

  // Always use the freshly computed matches so the initial render
  // is consistent with what applyFilters() will produce later.
  applyFilters();
}
