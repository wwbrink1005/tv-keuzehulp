import { priceGroupsBySize } from "./data.js";
import { computeMatchForPriceGroup, getIdealTypeSet } from "./matching.js";
import { getResolutionTier, getStoredSelection, normalizeProducts, normalizeTypeLabel, qs } from "./utils.js";
import { updateResultMatches } from "./result.js";
import { fetchProducts } from "./supabase.js";

const filterState = {
  priceLabel: "",
  sizes: new Set(),
  brands: new Set(),
  types: new Set(),
  resolutions: new Set(),
  hzOptions: new Set(),
  aanbieder: new Set(),
  priceMatches: new Map(),
  answers: null,
  scores: null,
  bestType: "",
  sizeGroup: ""
};

function getDynamicPriceGroups(sizeGroup) {
  const stored = localStorage.getItem("dynamicPriceGroups");
  if (stored) {
    try {
      const groups = JSON.parse(stored);
      if (Array.isArray(groups) && groups.length > 0) return groups;
    } catch {
      // fall through to static fallback
    }
  }
  return priceGroupsBySize[sizeGroup] || [];
}

function formatBrandLabel(brand) {
  const raw = String(brand ?? "").trim();
  if (!raw) return "";
  if (raw === raw.toUpperCase()) return raw;
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function collectSizeOptions(matches) {
  const set = new Set();
  matches.forEach(tv => { if (tv.grootte) set.add(tv.grootte); });
  return Array.from(set).sort((a, b) => a - b);
}

function renderSizeOptions(container, sizeCard, matches) {
  container.innerHTML = "";
  const sizes = collectSizeOptions(matches);
  if (sizes.length <= 1) { sizeCard.hidden = true; return; }
  sizeCard.hidden = false;

  const isAllSelected = filterState.sizes.size === 0;
  const allLabel = document.createElement("label");
  allLabel.className = "filter-option";
  const allInput = document.createElement("input");
  allInput.type = "checkbox";
  allInput.name = "sizeFilter";
  allInput.value = "all";
  allInput.checked = isAllSelected;
  const allText = document.createElement("span");
  allText.textContent = "Alle maten";
  allLabel.append(allInput, allText);
  container.appendChild(allLabel);

  sizes.forEach(size => {
    const label = document.createElement("label");
    label.className = "filter-option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "sizeFilter";
    input.value = size;
    input.checked = filterState.sizes.has(size);
    const text = document.createElement("span");
    text.textContent = `${size}"`;
    label.append(input, text);
    container.appendChild(label);
  });
}

function collectBrandOptions(matches) {
  const brandSet = new Set();
  matches.forEach(tv => {
    const label = formatBrandLabel(tv.merk);
    if (label) brandSet.add(label);
  });
  return Array.from(brandSet).sort((a, b) => a.localeCompare(b, "nl"));
}

function collectTypeOptions(matches) {
  const set = new Set();
  matches.forEach(tv => { if (tv.type) set.add(tv.type); });
  const order = ["LED", "Mini LED", "QLED", "Neo QLED", "OLED"];
  return order.filter(t => set.has(t));
}

function collectResolutionOptions(matches) {
  const set = new Set();
  matches.forEach(tv => {
    const tier = getResolutionTier(tv);
    if (tier) set.add(tier);
  });
  const order = ["HD Ready", "Full HD", "4K", "8K"];
  return order.filter(r => set.has(r));
}

function collectHzOptions(matches) {
  const set = new Set();
  matches.forEach(tv => { if (tv.Hz) set.add(tv.Hz); });
  return Array.from(set).sort((a, b) => a - b);
}

function collectAanbiederOptions(matches) {
  const set = new Set();
  matches.forEach(tv => {
    const a = tv.aanbieder;
    if (!a) return;
    const pCb = parseFloat(String(a.prijs_cb ?? "").replace(",", "."));
    if (a.url_cb && Number.isFinite(pCb) && pCb > 0) set.add("Coolblue");
    const pEx = parseFloat(String(a.prijs_expert ?? "").replace(",", "."));
    if (a.url_expert && Number.isFinite(pEx) && pEx > 0) set.add("Expert");
  });
  return Array.from(set).sort();
}

function buildPriceMatches(tvs, sizeGroup, selectedPriceLabel) {
  const groups = getDynamicPriceGroups(sizeGroup);
  const idealTypes = getIdealTypeSet(filterState.scores);
  const map = new Map();

  groups.forEach(group => {
    const result = computeMatchForPriceGroup(
      tvs,
      sizeGroup,
      group,
      filterState.answers,
      filterState.scores
    );
    let matches = Array.isArray(result.filteredMatchedTVs) ? result.filteredMatchedTVs : [];

    if (group.label !== selectedPriceLabel && idealTypes.size > 0) {
      matches = matches.filter(tv => idealTypes.has(normalizeTypeLabel(tv.type)));
    }

    if (matches.length > 0) {
      map.set(group.label, matches);
    }
  });

  return map;
}

function renderPriceOptions(container, priceCard, sizeGroup) {
  const groups = getDynamicPriceGroups(sizeGroup);
  container.innerHTML = "";

  const labels = groups.filter(group => filterState.priceMatches.has(group.label));
  if (labels.length === 0) {
    priceCard.hidden = true;
    return;
  }

  priceCard.hidden = false;

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

function renderBrandOptions(container, brandCard, matches) {
  container.innerHTML = "";

  const brands = collectBrandOptions(matches);
  if (brands.length === 0) {
    brandCard.hidden = true;
    return;
  }

  brandCard.hidden = false;

  const isAllSelected = filterState.brands.size === 0;

  const allLabel = document.createElement("label");
  allLabel.className = "filter-option";

  const allInput = document.createElement("input");
  allInput.type = "checkbox";
  allInput.name = "brandFilter";
  allInput.value = "all";
  allInput.checked = isAllSelected;

  const allText = document.createElement("span");
  allText.textContent = "Alle merken";

  allLabel.append(allInput, allText);
  container.appendChild(allLabel);

  brands.forEach(brand => {
    const label = document.createElement("label");
    label.className = "filter-option";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "brandFilter";
    input.value = brand;
    input.checked = filterState.brands.has(brand);

    const text = document.createElement("span");
    text.textContent = brand;

    label.append(input, text);
    container.appendChild(label);
  });
}

function renderTypeOptions(container, typeCard, matches) {
  container.innerHTML = "";
  const types = collectTypeOptions(matches);
  if (types.length === 0) { typeCard.hidden = true; return; }
  typeCard.hidden = false;

  const isAllSelected = filterState.types.size === 0;
  const allLabel = document.createElement("label");
  allLabel.className = "filter-option";
  const allInput = document.createElement("input");
  allInput.type = "checkbox";
  allInput.name = "typeFilter";
  allInput.value = "all";
  allInput.checked = isAllSelected;
  const allText = document.createElement("span");
  allText.textContent = "Alle types";
  allLabel.append(allInput, allText);
  container.appendChild(allLabel);

  types.forEach(type => {
    const label = document.createElement("label");
    label.className = "filter-option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "typeFilter";
    input.value = type;
    input.checked = filterState.types.has(type);
    const text = document.createElement("span");
    text.textContent = type;
    label.append(input, text);
    container.appendChild(label);
  });
}

function renderResolutionOptions(container, resolutionCard, matches) {
  container.innerHTML = "";
  const resolutions = collectResolutionOptions(matches);
  if (resolutions.length === 0) { resolutionCard.hidden = true; return; }
  resolutionCard.hidden = false;

  const isAllSelected = filterState.resolutions.size === 0;
  const allLabel = document.createElement("label");
  allLabel.className = "filter-option";
  const allInput = document.createElement("input");
  allInput.type = "checkbox";
  allInput.name = "resolutionFilter";
  allInput.value = "all";
  allInput.checked = isAllSelected;
  const allText = document.createElement("span");
  allText.textContent = "Alle";
  allLabel.append(allInput, allText);
  container.appendChild(allLabel);

  resolutions.forEach(res => {
    const label = document.createElement("label");
    label.className = "filter-option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "resolutionFilter";
    input.value = res;
    input.checked = filterState.resolutions.has(res);
    const text = document.createElement("span");
    text.textContent = res;
    label.append(input, text);
    container.appendChild(label);
  });
}

function renderHzOptions(container, hzCard, matches) {
  container.innerHTML = "";
  const hzValues = collectHzOptions(matches);
  if (hzValues.length === 0) { hzCard.hidden = true; return; }
  hzCard.hidden = false;

  const isAllSelected = filterState.hzOptions.size === 0;
  const allLabel = document.createElement("label");
  allLabel.className = "filter-option";
  const allInput = document.createElement("input");
  allInput.type = "checkbox";
  allInput.name = "hzFilter";
  allInput.value = "all";
  allInput.checked = isAllSelected;
  const allText = document.createElement("span");
  allText.textContent = "Alle";
  allLabel.append(allInput, allText);
  container.appendChild(allLabel);

  hzValues.forEach(hz => {
    const label = document.createElement("label");
    label.className = "filter-option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "hzFilter";
    input.value = hz;
    input.checked = filterState.hzOptions.has(hz);
    const text = document.createElement("span");
    text.textContent = `${hz} Hz`;
    label.append(input, text);
    container.appendChild(label);
  });
}

function renderAanbiederOptions(container, aanbiederCard, matches) {
  container.innerHTML = "";
  const aanbieders = collectAanbiederOptions(matches);
  if (aanbieders.length === 0) { aanbiederCard.hidden = true; return; }
  aanbiederCard.hidden = false;

  const isAllSelected = filterState.aanbieder.size === 0;
  const allLabel = document.createElement("label");
  allLabel.className = "filter-option";
  const allInput = document.createElement("input");
  allInput.type = "checkbox";
  allInput.name = "aanbiederFilter";
  allInput.value = "all";
  allInput.checked = isAllSelected;
  const allText = document.createElement("span");
  allText.textContent = "Alle";
  allLabel.append(allInput, allText);
  container.appendChild(allLabel);

  aanbieders.forEach(a => {
    const label = document.createElement("label");
    label.className = "filter-option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "aanbiederFilter";
    input.value = a;
    input.checked = filterState.aanbieder.has(a);
    const text = document.createElement("span");
    text.textContent = a;
    label.append(input, text);
    container.appendChild(label);
  });
}

function updateClearFiltersBtn() {
  const btn = qs("#clearFiltersBtn");
  if (!btn) return;
  const hasActive = filterState.sizes.size > 0 || filterState.brands.size > 0 || filterState.types.size > 0 ||
    filterState.resolutions.size > 0 || filterState.hzOptions.size > 0 || filterState.aanbieder.size > 0;
  btn.hidden = !hasActive;
}

function getActivePriceMatches() {
  return filterState.priceMatches.get(filterState.priceLabel) || [];
}

function applyFilters() {
  let filtered = getActivePriceMatches();

  if (filterState.sizes.size > 0) {
    filtered = filtered.filter(tv => filterState.sizes.has(tv.grootte));
  }

  if (filterState.brands.size > 0) {
    filtered = filtered.filter(tv => filterState.brands.has(formatBrandLabel(tv.merk)));
  }
  if (filterState.types.size > 0) {
    filtered = filtered.filter(tv => filterState.types.has(tv.type));
  }
  if (filterState.resolutions.size > 0) {
    filtered = filtered.filter(tv => filterState.resolutions.has(getResolutionTier(tv)));
  }
  if (filterState.hzOptions.size > 0) {
    filtered = filtered.filter(tv => filterState.hzOptions.has(tv.Hz));
  }
  if (filterState.aanbieder.size > 0) {
    filtered = filtered.filter(tv => {
      const a = tv.aanbieder;
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
  updateResultMatches(filtered, filterState.answers, filterState.bestType, filterState.scores, filterState.sizeGroup);
}

function initFilterEvents(priceContainer, sizeContainer, brandContainer, typeContainer, resolutionContainer, hzContainer, aanbiederContainer) {
  function renderAllSecondary() {
    const matches = getActivePriceMatches();
    renderSizeOptions(sizeContainer, qs(".filter-card[data-filter='size']"), matches);
    renderBrandOptions(brandContainer, qs(".filter-card[data-filter='brand']"), matches);
    renderTypeOptions(typeContainer, qs(".filter-card[data-filter='type']"), matches);
    renderResolutionOptions(resolutionContainer, qs(".filter-card[data-filter='resolution']"), matches);
    renderHzOptions(hzContainer, qs(".filter-card[data-filter='hz']"), matches);
    renderAanbiederOptions(aanbiederContainer, qs(".filter-card[data-filter='aanbieder']"), matches);
  }

  priceContainer.addEventListener("change", event => {
    const input = event.target.closest("input[type=radio]");
    if (!input) return;

    filterState.priceLabel = input.value;
    filterState.sizes.clear();
    filterState.brands.clear();
    filterState.types.clear();
    filterState.resolutions.clear();
    filterState.hzOptions.clear();
    filterState.aanbieder.clear();

    renderAllSecondary();
    applyFilters();
  });

  sizeContainer.addEventListener("change", event => {
    const input = event.target.closest("input[type=checkbox]");
    if (!input) return;

    if (input.value === "all") {
      if (input.checked) {
        filterState.sizes.clear();
        renderSizeOptions(sizeContainer, qs(".filter-card[data-filter='size']"), getActivePriceMatches());
      } else if (filterState.sizes.size === 0) {
        input.checked = true;
      }
    } else {
      const sz = parseInt(input.value, 10);
      if (input.checked) {
        filterState.sizes.add(sz);
      } else {
        filterState.sizes.delete(sz);
      }
      if (filterState.sizes.size === 0) {
        renderSizeOptions(sizeContainer, qs(".filter-card[data-filter='size']"), getActivePriceMatches());
      } else {
        const allInput = sizeContainer.querySelector('input[value="all"]');
        if (allInput) allInput.checked = false;
      }
    }
    applyFilters();
  });

  brandContainer.addEventListener("change", event => {
    const input = event.target.closest("input[type=checkbox]");
    if (!input) return;

    if (input.value === "all") {
      if (input.checked) {
        filterState.brands.clear();
        renderBrandOptions(brandContainer, qs(".filter-card[data-filter='brand']"), getActivePriceMatches());
      } else if (filterState.brands.size === 0) {
        input.checked = true;
      }
    } else {
      if (input.checked) {
        filterState.brands.add(input.value);
      } else {
        filterState.brands.delete(input.value);
      }
      if (filterState.brands.size === 0) {
        renderBrandOptions(brandContainer, qs(".filter-card[data-filter='brand']"), getActivePriceMatches());
      } else {
        const allInput = brandContainer.querySelector('input[value="all"]');
        if (allInput) allInput.checked = false;
      }
    }
    applyFilters();
  });

  typeContainer.addEventListener("change", event => {
    const input = event.target.closest("input[type=checkbox]");
    if (!input) return;

    if (input.value === "all") {
      if (input.checked) {
        filterState.types.clear();
        renderTypeOptions(typeContainer, qs(".filter-card[data-filter='type']"), getActivePriceMatches());
      } else if (filterState.types.size === 0) {
        input.checked = true;
      }
    } else {
      if (input.checked) {
        filterState.types.add(input.value);
      } else {
        filterState.types.delete(input.value);
      }
      if (filterState.types.size === 0) {
        renderTypeOptions(typeContainer, qs(".filter-card[data-filter='type']"), getActivePriceMatches());
      } else {
        const allInput = typeContainer.querySelector('input[value="all"]');
        if (allInput) allInput.checked = false;
      }
    }
    applyFilters();
  });

  resolutionContainer.addEventListener("change", event => {
    const input = event.target.closest("input[type=checkbox]");
    if (!input) return;

    if (input.value === "all") {
      if (input.checked) {
        filterState.resolutions.clear();
        renderResolutionOptions(resolutionContainer, qs(".filter-card[data-filter='resolution']"), getActivePriceMatches());
      } else if (filterState.resolutions.size === 0) {
        input.checked = true;
      }
    } else {
      if (input.checked) {
        filterState.resolutions.add(input.value);
      } else {
        filterState.resolutions.delete(input.value);
      }
      if (filterState.resolutions.size === 0) {
        renderResolutionOptions(resolutionContainer, qs(".filter-card[data-filter='resolution']"), getActivePriceMatches());
      } else {
        const allInput = resolutionContainer.querySelector('input[value="all"]');
        if (allInput) allInput.checked = false;
      }
    }
    applyFilters();
  });

  hzContainer.addEventListener("change", event => {
    const input = event.target.closest("input[type=checkbox]");
    if (!input) return;

    if (input.value === "all") {
      if (input.checked) {
        filterState.hzOptions.clear();
        renderHzOptions(hzContainer, qs(".filter-card[data-filter='hz']"), getActivePriceMatches());
      } else if (filterState.hzOptions.size === 0) {
        input.checked = true;
      }
    } else {
      const hz = parseInt(input.value, 10);
      if (input.checked) {
        filterState.hzOptions.add(hz);
      } else {
        filterState.hzOptions.delete(hz);
      }
      if (filterState.hzOptions.size === 0) {
        renderHzOptions(hzContainer, qs(".filter-card[data-filter='hz']"), getActivePriceMatches());
      } else {
        const allInput = hzContainer.querySelector('input[value="all"]');
        if (allInput) allInput.checked = false;
      }
    }
    applyFilters();
  });

  aanbiederContainer.addEventListener("change", event => {
    const input = event.target.closest("input[type=checkbox]");
    if (!input) return;

    if (input.value === "all") {
      if (input.checked) {
        filterState.aanbieder.clear();
        renderAanbiederOptions(aanbiederContainer, qs(".filter-card[data-filter='aanbieder']"), getActivePriceMatches());
      } else if (filterState.aanbieder.size === 0) {
        input.checked = true;
      }
    } else {
      if (input.checked) {
        filterState.aanbieder.add(input.value);
      } else {
        filterState.aanbieder.delete(input.value);
      }
      if (filterState.aanbieder.size === 0) {
        renderAanbiederOptions(aanbiederContainer, qs(".filter-card[data-filter='aanbieder']"), getActivePriceMatches());
      } else {
        const allInput = aanbiederContainer.querySelector('input[value="all"]');
        if (allInput) allInput.checked = false;
      }
    }
    applyFilters();
  });

  const clearBtn = qs("#clearFiltersBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      filterState.sizes.clear();
      filterState.brands.clear();
      filterState.types.clear();
      filterState.resolutions.clear();
      filterState.hzOptions.clear();
      filterState.aanbieder.clear();
      renderAllSecondary();
      applyFilters();
    });
  }
}

function initResultFilters() {
  const priceContainer = qs("#priceFilterOptions");
  const sizeContainer = qs("#sizeFilterOptions");
  const brandContainer = qs("#brandFilterOptions");
  const typeContainer = qs("#typeFilterOptions");
  const resolutionContainer = qs("#resolutionFilterOptions");
  const hzContainer = qs("#hzFilterOptions");
  const aanbiederContainer = qs("#aanbiederFilterOptions");

  const priceCard = qs(".filter-card[data-filter='price']");
  const sizeCard = qs(".filter-card[data-filter='size']");
  const brandCard = qs(".filter-card[data-filter='brand']");
  const typeCard = qs(".filter-card[data-filter='type']");
  const resolutionCard = qs(".filter-card[data-filter='resolution']");
  const hzCard = qs(".filter-card[data-filter='hz']");
  const aanbiederCard = qs(".filter-card[data-filter='aanbieder']");

  if (!priceContainer || !sizeContainer || !brandContainer || !typeContainer || !resolutionContainer || !hzContainer || !aanbiederContainer) return;
  if (!priceCard || !sizeCard || !brandCard || !typeCard || !resolutionCard || !hzCard || !aanbiederCard) return;

  const stored = getStoredSelection();
  const answersData = localStorage.getItem("answers");
  const scoresData = localStorage.getItem("scores");

  if (!stored.sizeGroup || !answersData || !scoresData) return;

  filterState.answers = JSON.parse(answersData);
  filterState.scores = JSON.parse(scoresData);
  filterState.bestType = localStorage.getItem("bestType") || "";
  filterState.sizeGroup = stored.sizeGroup || "";

  const selectedPriceLabel = stored.priceLabel || "";

  fetchProducts()
    .then(rawProducts => {
      const tvs = normalizeProducts(rawProducts);
      filterState.priceMatches = buildPriceMatches(tvs, stored.sizeGroup, selectedPriceLabel);

      const availableLabels = Array.from(filterState.priceMatches.keys());
      if (availableLabels.length === 0) return;

      filterState.priceLabel = filterState.priceMatches.has(selectedPriceLabel)
        ? selectedPriceLabel
        : availableLabels[0];

      const matches = getActivePriceMatches();
      renderPriceOptions(priceContainer, priceCard, stored.sizeGroup);
      renderSizeOptions(sizeContainer, sizeCard, matches);
      renderBrandOptions(brandContainer, brandCard, matches);
      renderTypeOptions(typeContainer, typeCard, matches);
      renderResolutionOptions(resolutionContainer, resolutionCard, matches);
      renderHzOptions(hzContainer, hzCard, matches);
      renderAanbiederOptions(aanbiederContainer, aanbiederCard, matches);
      initFilterEvents(priceContainer, sizeContainer, brandContainer, typeContainer, resolutionContainer, hzContainer, aanbiederContainer);
      applyFilters();
    })
    .catch(() => {
      [priceCard, sizeCard, brandCard, typeCard, resolutionCard, hzCard, aanbiederCard].forEach(card => { card.hidden = true; });
    });
}

document.addEventListener("DOMContentLoaded", initResultFilters);
