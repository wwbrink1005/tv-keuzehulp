import { priceGroupsBySize, getProcessorTier, sizeGroupToAllowedSizes } from "./data.js";
import { computeMatchForPriceGroup, getIdealTierSet } from "./matching.js";
import { computeDynamicPriceGroups, getStoredSelection, normalizeProducts, qs } from "./utils.js";
import { updateResultMatches } from "./result.js";
import { fetchProducts } from "./supabase.js";

const filterState = {
  priceLabel:   "",
  sizes:        new Set(),
  brands:       new Set(),
  tiers:        new Set(),
  panelTypes:   new Set(),
  ramOptions:   new Set(),
  resolutions:  new Set(),
  touchscreens: new Set(),
  osOptions:    new Set(),
  aanbieder:    new Set(),
  priceMatches: new Map(),
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

function getActivePriceMatches() {
  return filterState.priceMatches.get(filterState.priceLabel) || [];
}

function collectSizeOptions(matches) {
  const set = new Set();
  matches.forEach(l => { if (l.schermdiagonaal) set.add(l.schermdiagonaal); });
  return Array.from(set).sort((a, b) => a - b);
}

function collectBrandOptions(matches) {
  const set = new Set();
  matches.forEach(l => { const label = formatBrandLabel(l.merk); if (label) set.add(label); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "nl"));
}

function collectTierOptions(matches) {
  const { getProcessorTier } = window.__laptopData || {};
  if (!getProcessorTier) {
    const set = new Set();
    matches.forEach(l => { if (l.processor) set.add(l.processor); });
    return Array.from(set);
  }
  const set = new Set();
  matches.forEach(l => set.add(getProcessorTier(l.processor)));
  const order = ["Budget", "Mid", "Krachtig", "Topklasse"];
  return order.filter(t => set.has(t));
}

function collectPanelTypeOptions(matches) {
  const set = new Set();
  matches.forEach(l => { if (l.paneeltype) set.add(l.paneeltype); });
  const order = ["IPS", "OLED", "VA", "TN"];
  return order.filter(t => set.has(t));
}

function collectRamOptions(matches) {
  const set = new Set();
  matches.forEach(l => { if (l.werkgeheugen) set.add(l.werkgeheugen); });
  return Array.from(set).sort((a, b) => a - b);
}

function collectResolutionOptions(matches) {
  const set = new Set();
  matches.forEach(l => { if (l.resolutie) set.add(l.resolutie); });
  const order = ["HD", "Full HD", "QHD", "QHD+", "4K"];
  return order.filter(t => set.has(t));
}

function collectTouchscreenOptions(matches) {
  const set = new Set();
  matches.forEach(l => { if (l.touchscreen) set.add(l.touchscreen); });
  const order = ["Ja", "Nee"];
  return order.filter(t => set.has(t));
}

function collectOsOptions(matches) {
  const set = new Set();
  matches.forEach(l => { if (l.os) set.add(l.os); });
  const order = ["Windows", "macOS", "Chrome OS"];
  const inOrder = order.filter(t => set.has(t));
  set.forEach(t => { if (!order.includes(t)) inOrder.push(t); });
  return inOrder;
}

function collectAanbiederOptions(matches) {
  const set = new Set();
  matches.forEach(l => {
    const a = l.aanbieder;
    if (!a) return;
    const pCb = parseFloat(String(a.prijs_cb ?? "").replace(",", "."));
    if (a.url_cb && Number.isFinite(pCb) && pCb > 0) set.add("Coolblue");
    const pEx = parseFloat(String(a.prijs_expert ?? "").replace(",", "."));
    if (a.url_expert && Number.isFinite(pEx) && pEx > 0) set.add("Expert");
  });
  return Array.from(set).sort();
}

function renderFilterOptions(container, card, items, filterName, labelFn, isRadio = false) {
  container.innerHTML = "";
  if (items.length === 0) { card.hidden = true; return; }
  card.hidden = false;

  const stateSet = filterState[filterName];

  if (!isRadio) {
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
  }

  items.forEach(item => {
    const label = document.createElement("label");
    label.className = "filter-option";
    const input = document.createElement("input");
    input.type = isRadio ? "radio" : "checkbox";
    input.name = filterName;
    input.value = String(item);
    input.checked = isRadio ? String(item) === filterState.priceLabel : (stateSet?.has(item) ?? false);
    const text = document.createElement("span");
    text.textContent = labelFn ? labelFn(item) : String(item);
    label.append(input, text);
    container.appendChild(label);
  });
}

function renderSizeOptions(container, card, matches) {
  const sizes = collectSizeOptions(matches);
  renderFilterOptions(container, card, sizes, "sizes",
    s => `${s}"`,
    false
  );
  // Override checked state manually since sizes uses floats
  container.querySelectorAll('input[type="checkbox"]').forEach(input => {
    if (input.value === "all") {
      input.checked = filterState.sizes.size === 0;
    } else {
      input.checked = filterState.sizes.has(parseFloat(input.value));
    }
  });
}

function renderPriceOptions(container, card, sizeGroup) {
  const groups = getDynamicPriceGroups(sizeGroup);
  container.innerHTML = "";
  // Only show price buckets that actually contain a matching laptop for the
  // current quiz answers — otherwise users click a bucket that can never
  // show a result.
  const labels = groups.filter(g => filterState.priceMatches.has(g.label));
  if (labels.length === 0) { card.hidden = true; return; }
  card.hidden = false;

  labels.forEach(group => {
    const label = document.createElement("label");
    label.className = "filter-option";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "priceFilter";
    input.value = group.label;
    input.checked = group.label === filterState.priceLabel;
    const text = document.createElement("span");
    text.textContent = `€ ${group.label}`;
    label.append(input, text);
    container.appendChild(label);
  });
}

function renderBrandOptions(container, card, matches) {
  const brands = collectBrandOptions(matches);
  renderFilterOptions(container, card, brands, "brands", null, false);
  container.querySelectorAll('input[type="checkbox"]').forEach(input => {
    if (input.value === "all") input.checked = filterState.brands.size === 0;
    else input.checked = filterState.brands.has(input.value);
  });
}

function renderTierOptions(container, card, matches) {
  const tiers = ["Budget", "Mid", "Krachtig", "Topklasse"].filter(t =>
    matches.some(l => {
      const { getProcessorTier } = window.__laptopData || {};
      return getProcessorTier ? getProcessorTier(l.processor) === t : true;
    })
  );
  renderFilterOptions(container, card, tiers, "tiers", null, false);
  container.querySelectorAll('input[type="checkbox"]').forEach(input => {
    if (input.value === "all") input.checked = filterState.tiers.size === 0;
    else input.checked = filterState.tiers.has(input.value);
  });
}

function renderPanelTypeOptions(container, card, matches) {
  const types = collectPanelTypeOptions(matches);
  renderFilterOptions(container, card, types, "panelTypes", null, false);
  container.querySelectorAll('input[type="checkbox"]').forEach(input => {
    if (input.value === "all") input.checked = filterState.panelTypes.size === 0;
    else input.checked = filterState.panelTypes.has(input.value);
  });
}

function renderRamOptions(container, card, matches) {
  const rams = collectRamOptions(matches);
  renderFilterOptions(container, card, rams, "ramOptions", r => `${r} GB`, false);
  container.querySelectorAll('input[type="checkbox"]').forEach(input => {
    if (input.value === "all") input.checked = filterState.ramOptions.size === 0;
    else input.checked = filterState.ramOptions.has(parseInt(input.value, 10));
  });
}

function renderResolutionOptions(container, card, matches) {
  const resolutions = collectResolutionOptions(matches);
  renderFilterOptions(container, card, resolutions, "resolutions", null, false);
  container.querySelectorAll('input[type="checkbox"]').forEach(input => {
    if (input.value === "all") input.checked = filterState.resolutions.size === 0;
    else input.checked = filterState.resolutions.has(input.value);
  });
}

function renderTouchscreenOptions(container, card, matches) {
  const touchscreens = collectTouchscreenOptions(matches);
  renderFilterOptions(container, card, touchscreens, "touchscreens", null, false);
  container.querySelectorAll('input[type="checkbox"]').forEach(input => {
    if (input.value === "all") input.checked = filterState.touchscreens.size === 0;
    else input.checked = filterState.touchscreens.has(input.value);
  });
}

function renderOsOptions(container, card, matches) {
  const osOptions = collectOsOptions(matches);
  renderFilterOptions(container, card, osOptions, "osOptions", null, false);
  container.querySelectorAll('input[type="checkbox"]').forEach(input => {
    if (input.value === "all") input.checked = filterState.osOptions.size === 0;
    else input.checked = filterState.osOptions.has(input.value);
  });
}

function renderAanbiederOptions(container, card, matches) {
  const aanbieders = collectAanbiederOptions(matches);
  renderFilterOptions(container, card, aanbieders, "aanbieder", null, false);
  container.querySelectorAll('input[type="checkbox"]').forEach(input => {
    if (input.value === "all") input.checked = filterState.aanbieder.size === 0;
    else input.checked = filterState.aanbieder.has(input.value);
  });
}

function updateClearFiltersBtn() {
  const btn = qs("#clearFiltersBtn");
  if (!btn) return;
  const hasActive = filterState.sizes.size > 0 || filterState.brands.size > 0 ||
    filterState.tiers.size > 0 || filterState.panelTypes.size > 0 ||
    filterState.ramOptions.size > 0 || filterState.resolutions.size > 0 ||
    filterState.touchscreens.size > 0 || filterState.osOptions.size > 0 ||
    filterState.aanbieder.size > 0;
  btn.hidden = !hasActive;
}

function buildPriceMatches(laptops, sizeGroup) {
  const groups = getDynamicPriceGroups(sizeGroup);
  const map = new Map();

  const answersForFilter = { ...filterState.answers };

  // Every price bucket that has at least one matching laptop stays in the
  // menu, regardless of tier — users should always get the full set of
  // price options to pick from themselves.
  groups.forEach(group => {
    const result = computeMatchForPriceGroup(
      laptops, sizeGroup, group, answersForFilter, filterState.scores
    );
    const matches = Array.isArray(result.filteredMatchedLaptops) ? result.filteredMatchedLaptops : [];
    if (matches.length > 0) {
      map.set(group.label, matches);
    }
  });

  return map;
}

/**
 * Picks which price bucket should be selected by default when the user
 * didn't pick a budget in the quiz ("geen voorkeur"): the cheapest bucket
 * that still contains a laptop of the highest-scoring processor tier,
 * ignoring price entirely when judging "best match". Falls back to the
 * cheapest bucket with any match at all if no bucket has the ideal tier.
 */
function pickDefaultPriceLabel(priceMatches, scores) {
  const idealTiers = getIdealTierSet(scores);
  if (idealTiers.size > 0) {
    for (const [label, matches] of priceMatches) {
      if (matches.some(l => idealTiers.has(getProcessorTier(l.processor)))) return label;
    }
  }
  return priceMatches.keys().next().value ?? "";
}

function applyFilters() {
  let filtered = getActivePriceMatches();

  if (filterState.sizes.size > 0) {
    filtered = filtered.filter(l => filterState.sizes.has(l.schermdiagonaal));
  }

  if (filterState.brands.size > 0) {
    filtered = filtered.filter(l => filterState.brands.has(formatBrandLabel(l.merk)));
  }

  if (filterState.tiers.size > 0) {
    const { getProcessorTier } = window.__laptopData || {};
    if (getProcessorTier) {
      filtered = filtered.filter(l => filterState.tiers.has(getProcessorTier(l.processor)));
    }
  }

  if (filterState.panelTypes.size > 0) {
    filtered = filtered.filter(l => filterState.panelTypes.has(l.paneeltype));
  }

  if (filterState.ramOptions.size > 0) {
    filtered = filtered.filter(l => filterState.ramOptions.has(l.werkgeheugen));
  }

  if (filterState.resolutions.size > 0) {
    filtered = filtered.filter(l => filterState.resolutions.has(l.resolutie));
  }

  if (filterState.touchscreens.size > 0) {
    filtered = filtered.filter(l => filterState.touchscreens.has(l.touchscreen));
  }

  if (filterState.osOptions.size > 0) {
    filtered = filtered.filter(l => filterState.osOptions.has(l.os));
  }

  if (filterState.aanbieder.size > 0) {
    filtered = filtered.filter(l => {
      const a = l.aanbieder;
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

function renderAllSecondary(priceContainer, sizeContainer, brandContainer, tierContainer, panelContainer, ramContainer, resolutionContainer, touchscreenContainer, osContainer, aanbiederContainer) {
  const matches = getActivePriceMatches();
  const sizeCard       = qs(".filter-card[data-filter='size']");
  const brandCard      = qs(".filter-card[data-filter='brand']");
  const tierCard       = qs(".filter-card[data-filter='tier']");
  const panelCard      = qs(".filter-card[data-filter='panel']");
  const ramCard        = qs(".filter-card[data-filter='ram']");
  const resolutionCard = qs(".filter-card[data-filter='resolution']");
  const touchscreenCard = qs(".filter-card[data-filter='touchscreen']");
  const osCard         = qs(".filter-card[data-filter='os']");
  const aanbiederCard  = qs(".filter-card[data-filter='aanbieder']");

  renderSizeOptions(sizeContainer, sizeCard, matches);
  renderBrandOptions(brandContainer, brandCard, matches);
  renderTierOptions(tierContainer, tierCard, matches);
  renderPanelTypeOptions(panelContainer, panelCard, matches);
  renderRamOptions(ramContainer, ramCard, matches);
  renderResolutionOptions(resolutionContainer, resolutionCard, matches);
  renderTouchscreenOptions(touchscreenContainer, touchscreenCard, matches);
  renderOsOptions(osContainer, osCard, matches);
  renderAanbiederOptions(aanbiederContainer, aanbiederCard, matches);
}

function initFilterEvents(priceContainer, sizeContainer, brandContainer, tierContainer, panelContainer, ramContainer, resolutionContainer, touchscreenContainer, osContainer, aanbiederContainer) {
  function renderAll() {
    renderAllSecondary(priceContainer, sizeContainer, brandContainer, tierContainer, panelContainer, ramContainer, resolutionContainer, touchscreenContainer, osContainer, aanbiederContainer);
  }

  priceContainer.addEventListener("change", event => {
    const input = event.target.closest("input[type=radio]");
    if (!input) return;
    filterState.priceLabel = input.value;
    filterState.sizes.clear(); filterState.brands.clear();
    filterState.tiers.clear(); filterState.panelTypes.clear();
    filterState.ramOptions.clear(); filterState.resolutions.clear();
    filterState.touchscreens.clear(); filterState.osOptions.clear();
    filterState.aanbieder.clear();
    renderAll();
    applyFilters();
  });

  function handleCheckboxSet(container, stateSet, card, renderFn, valueFn = v => v) {
    container.addEventListener("change", event => {
      const input = event.target.closest("input[type=checkbox]");
      if (!input) return;
      if (input.value === "all") {
        if (input.checked) { stateSet.clear(); renderFn(container, card, getActivePriceMatches()); }
        else if (stateSet.size === 0) { input.checked = true; }
      } else {
        const val = valueFn(input.value);
        if (input.checked) stateSet.add(val);
        else stateSet.delete(val);
        if (stateSet.size === 0) renderFn(container, card, getActivePriceMatches());
        else { const allInput = container.querySelector('input[value="all"]'); if (allInput) allInput.checked = false; }
      }
      applyFilters();
    });
  }

  const sizeCard       = qs(".filter-card[data-filter='size']");
  const brandCard      = qs(".filter-card[data-filter='brand']");
  const tierCard       = qs(".filter-card[data-filter='tier']");
  const panelCard      = qs(".filter-card[data-filter='panel']");
  const ramCard        = qs(".filter-card[data-filter='ram']");
  const resolutionCard = qs(".filter-card[data-filter='resolution']");
  const touchscreenCard = qs(".filter-card[data-filter='touchscreen']");
  const osCard         = qs(".filter-card[data-filter='os']");
  const aanbiederCard  = qs(".filter-card[data-filter='aanbieder']");

  handleCheckboxSet(sizeContainer,      filterState.sizes,      sizeCard,      renderSizeOptions,      v => parseFloat(v));
  handleCheckboxSet(brandContainer,     filterState.brands,     brandCard,     renderBrandOptions);
  handleCheckboxSet(tierContainer,      filterState.tiers,      tierCard,      renderTierOptions);
  handleCheckboxSet(panelContainer,     filterState.panelTypes, panelCard,     renderPanelTypeOptions);
  handleCheckboxSet(ramContainer,       filterState.ramOptions, ramCard,       renderRamOptions,       v => parseInt(v, 10));
  handleCheckboxSet(resolutionContainer, filterState.resolutions,  resolutionCard,  renderResolutionOptions);
  handleCheckboxSet(touchscreenContainer, filterState.touchscreens, touchscreenCard, renderTouchscreenOptions);
  handleCheckboxSet(osContainer,         filterState.osOptions,    osCard,          renderOsOptions);
  handleCheckboxSet(aanbiederContainer, filterState.aanbieder,  aanbiederCard, renderAanbiederOptions);

  const clearBtn = qs("#clearFiltersBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      filterState.sizes.clear(); filterState.brands.clear();
      filterState.tiers.clear(); filterState.panelTypes.clear();
      filterState.ramOptions.clear(); filterState.resolutions.clear();
      filterState.touchscreens.clear(); filterState.osOptions.clear();
      filterState.aanbieder.clear();
      renderAll();
      applyFilters();
    });
  }
}

function initResultFilters() {
  const priceContainer    = qs("#priceFilterOptions");
  const sizeContainer     = qs("#sizeFilterOptions");
  const brandContainer    = qs("#brandFilterOptions");
  const tierContainer     = qs("#tierFilterOptions");
  const panelContainer    = qs("#panelFilterOptions");
  const ramContainer      = qs("#ramFilterOptions");
  const resolutionContainer  = qs("#resolutionFilterOptions");
  const touchscreenContainer = qs("#touchscreenFilterOptions");
  const osContainer          = qs("#osFilterOptions");
  const aanbiederContainer = qs("#aanbiederFilterOptions");

  const priceCard      = qs(".filter-card[data-filter='price']");
  const sizeCard       = qs(".filter-card[data-filter='size']");
  const brandCard      = qs(".filter-card[data-filter='brand']");
  const tierCard       = qs(".filter-card[data-filter='tier']");
  const panelCard      = qs(".filter-card[data-filter='panel']");
  const ramCard        = qs(".filter-card[data-filter='ram']");
  const resolutionCard  = qs(".filter-card[data-filter='resolution']");
  const touchscreenCard = qs(".filter-card[data-filter='touchscreen']");
  const osCard          = qs(".filter-card[data-filter='os']");
  const aanbiederCard  = qs(".filter-card[data-filter='aanbieder']");

  if (!priceContainer || !sizeContainer || !brandContainer || !tierContainer ||
      !panelContainer || !ramContainer || !resolutionContainer || !touchscreenContainer ||
      !osContainer || !aanbiederContainer) return;
  if (!priceCard || !sizeCard || !brandCard || !tierCard ||
      !panelCard || !ramCard || !resolutionCard || !touchscreenCard ||
      !osCard || !aanbiederCard) return;

  const stored      = getStoredSelection();
  const answersData = localStorage.getItem("laptop_answers");
  const scoresData  = localStorage.getItem("laptop_scores");

  if (!stored.sizeGroup || !answersData || !scoresData) return;

  filterState.answers   = JSON.parse(answersData);
  filterState.scores    = JSON.parse(scoresData);
  filterState.bestType  = localStorage.getItem("laptop_bestType") || "";
  filterState.sizeGroup = stored.sizeGroup;

  const selectedPriceLabel = stored.priceLabel || "";

  fetchProducts()
    .then(rawProducts => {
      const laptops = normalizeProducts(rawProducts);
      filterState.priceGroups = computeDynamicPriceGroups(laptops, stored.sizeGroup, sizeGroupToAllowedSizes);
      filterState.priceMatches = buildPriceMatches(laptops, stored.sizeGroup);

      // Fallback: seed from stored results if computed map is empty
      if (!filterState.priceMatches.has(selectedPriceLabel) && selectedPriceLabel) {
        const storedData = localStorage.getItem("laptop_filteredMatchedLaptops");
        if (storedData) {
          try {
            const storedLaptops = JSON.parse(storedData);
            if (Array.isArray(storedLaptops) && storedLaptops.length > 0) {
              filterState.priceMatches.set(selectedPriceLabel, storedLaptops);
            }
          } catch { /* ignore */ }
        }
      }

      const availableLabels = Array.from(filterState.priceMatches.keys());
      if (availableLabels.length === 0) return;

      filterState.priceLabel = filterState.priceMatches.has(selectedPriceLabel)
        ? selectedPriceLabel
        : pickDefaultPriceLabel(filterState.priceMatches, filterState.scores);

      const matches = getActivePriceMatches();
      renderPriceOptions(priceContainer, priceCard, stored.sizeGroup);
      renderSizeOptions(sizeContainer, sizeCard, matches);
      renderBrandOptions(brandContainer, brandCard, matches);
      renderTierOptions(tierContainer, tierCard, matches);
      renderPanelTypeOptions(panelContainer, panelCard, matches);
      renderRamOptions(ramContainer, ramCard, matches);
      renderResolutionOptions(resolutionContainer, resolutionCard, matches);
      renderTouchscreenOptions(touchscreenContainer, touchscreenCard, matches);
      renderOsOptions(osContainer, osCard, matches);
      renderAanbiederOptions(aanbiederContainer, aanbiederCard, matches);
      initFilterEvents(priceContainer, sizeContainer, brandContainer, tierContainer, panelContainer, ramContainer, resolutionContainer, touchscreenContainer, osContainer, aanbiederContainer);
      applyFilters();
    })
    .catch(() => {
      [priceCard, sizeCard, brandCard, tierCard, panelCard, ramCard, resolutionCard, touchscreenCard, osCard, aanbiederCard]
        .forEach(card => { card.hidden = true; });
    });
}

document.addEventListener("DOMContentLoaded", initResultFilters);
