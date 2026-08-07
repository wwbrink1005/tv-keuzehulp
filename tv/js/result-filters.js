import { priceGroupsBySize, sizeGroupToAllowedSizes } from "./data.js";
import { computeMatchForPriceGroup } from "./matching.js";
import { computeDynamicPriceGroups, getResolutionTier, getStoredSelection, normalizeProducts, parsePrice, qs } from "./utils.js";
import { updateResultMatches } from "./result.js";
import { fetchProducts } from "./supabase.js";

const filterState = {
  priceLabels: new Set(),
  sizes: new Set(),
  brands: new Set(),
  types: new Set(),
  resolutions: new Set(),
  hzOptions: new Set(),
  hdmiOptions: new Set(),
  kleuren: new Set(),
  aanbieder: new Set(),
  baseMatches: [],
  answers: null,
  scores: null,
  bestType: "",
  sizeGroup: ""
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

// Price is just another optional narrowing filter, not a hard upfront wall:
// with no bucket selected, every TV matching the quiz answers is shown.
function getBaseMatches() {
  return filterState.baseMatches;
}

function getPriceScopedMatches() {
  const base = getBaseMatches();
  if (filterState.priceLabels.size === 0) return base;
  const groups = getDynamicPriceGroups(filterState.sizeGroup).filter(g => filterState.priceLabels.has(g.label));
  return base.filter(tv => {
    const price = parsePrice(tv.prijs);
    return groups.some(g => price >= g.min && price <= g.max);
  });
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

function collectHdmiOptions(matches) {
  const set = new Set();
  matches.forEach(tv => { if (tv.hdmiPoorten) set.add(tv.hdmiPoorten); });
  return Array.from(set).sort((a, b) => a - b);
}

// Normaliseert combinaties als "Zwart, Metallic" en "Metallic, Zwart" naar
// dezelfde canonieke waarde, zodat ze niet als 2 losse filteropties verschijnen.
function normalizeKleur(kleur) {
  const raw = String(kleur ?? "").trim();
  if (!raw) return "";
  return raw.split(",").map(s => s.trim()).filter(Boolean).sort().join(", ");
}

function collectKleurOptions(matches) {
  const set = new Set();
  matches.forEach(tv => { const k = normalizeKleur(tv.kleur); if (k) set.add(k); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "nl"));
}

function collectAanbiederOptions(matches) {
  const set = new Set();
  matches.forEach(tv => {
    (tv.aanbieders ?? []).forEach(a => set.add(a.winkel));
  });
  return Array.from(set).sort();
}

function renderPriceOptions(container, priceCard, sizeGroup) {
  const groups = getDynamicPriceGroups(sizeGroup);
  container.innerHTML = "";

  // Only show price buckets that actually contain a matching TV for the
  // current quiz answers — otherwise users click a bucket that can never
  // show a result. If there's only one (or zero) non-empty bucket there's
  // nothing meaningful to narrow, so hide the whole filter card.
  const base = getBaseMatches();
  const labels = groups.filter(g => base.some(tv => {
    const price = parsePrice(tv.prijs);
    return price >= g.min && price <= g.max;
  }));

  if (labels.length <= 1) {
    priceCard.hidden = true;
    return;
  }

  priceCard.hidden = false;

  const isAllSelected = filterState.priceLabels.size === 0;
  const allLabel = document.createElement("label");
  allLabel.className = "filter-option";
  const allInput = document.createElement("input");
  allInput.type = "checkbox";
  allInput.name = "priceFilter";
  allInput.value = "all";
  allInput.checked = isAllSelected;
  const allText = document.createElement("span");
  allText.textContent = "Alle prijzen";
  allLabel.append(allInput, allText);
  container.appendChild(allLabel);

  labels.forEach(group => {
    const label = document.createElement("label");
    label.className = "filter-option";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "priceFilter";
    input.value = group.label;
    input.checked = filterState.priceLabels.has(group.label);

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

function renderHdmiOptions(container, hdmiCard, matches) {
  container.innerHTML = "";
  const hdmiValues = collectHdmiOptions(matches);
  if (hdmiValues.length === 0) { hdmiCard.hidden = true; return; }
  hdmiCard.hidden = false;

  const isAllSelected = filterState.hdmiOptions.size === 0;
  const allLabel = document.createElement("label");
  allLabel.className = "filter-option";
  const allInput = document.createElement("input");
  allInput.type = "checkbox";
  allInput.name = "hdmiFilter";
  allInput.value = "all";
  allInput.checked = isAllSelected;
  const allText = document.createElement("span");
  allText.textContent = "Alle";
  allLabel.append(allInput, allText);
  container.appendChild(allLabel);

  hdmiValues.forEach(count => {
    const label = document.createElement("label");
    label.className = "filter-option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "hdmiFilter";
    input.value = count;
    input.checked = filterState.hdmiOptions.has(count);
    const text = document.createElement("span");
    text.textContent = `${count} HDMI`;
    label.append(input, text);
    container.appendChild(label);
  });
}

function renderKleurOptions(container, kleurCard, matches) {
  container.innerHTML = "";
  const kleuren = collectKleurOptions(matches);
  if (kleuren.length === 0) { kleurCard.hidden = true; return; }
  kleurCard.hidden = false;

  const isAllSelected = filterState.kleuren.size === 0;
  const allLabel = document.createElement("label");
  allLabel.className = "filter-option";
  const allInput = document.createElement("input");
  allInput.type = "checkbox";
  allInput.name = "kleurFilter";
  allInput.value = "all";
  allInput.checked = isAllSelected;
  const allText = document.createElement("span");
  allText.textContent = "Alle";
  allLabel.append(allInput, allText);
  container.appendChild(allLabel);

  kleuren.forEach(kleur => {
    const label = document.createElement("label");
    label.className = "filter-option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "kleurFilter";
    input.value = kleur;
    input.checked = filterState.kleuren.has(kleur);
    const text = document.createElement("span");
    text.textContent = kleur;
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
  const hasActive = filterState.priceLabels.size > 0 || filterState.sizes.size > 0 || filterState.brands.size > 0 || filterState.types.size > 0 ||
    filterState.resolutions.size > 0 || filterState.hzOptions.size > 0 || filterState.hdmiOptions.size > 0 ||
    filterState.kleuren.size > 0 ||
    filterState.aanbieder.size > 0;
  btn.hidden = !hasActive;
}

function applyFilters() {
  let filtered = getPriceScopedMatches();

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
  if (filterState.hdmiOptions.size > 0) {
    filtered = filtered.filter(tv => filterState.hdmiOptions.has(tv.hdmiPoorten));
  }
  if (filterState.kleuren.size > 0) {
    filtered = filtered.filter(tv => filterState.kleuren.has(normalizeKleur(tv.kleur)));
  }
  if (filterState.aanbieder.size > 0) {
    filtered = filtered.filter(tv =>
      (tv.aanbieders ?? []).some(a => filterState.aanbieder.has(a.winkel))
    );
  }

  updateClearFiltersBtn();
  updateResultMatches(filtered, filterState.answers, filterState.bestType, filterState.scores, filterState.sizeGroup);
}

function initFilterEvents(priceContainer, sizeContainer, brandContainer, typeContainer, resolutionContainer, hzContainer, hdmiContainer, kleurContainer, aanbiederContainer) {
  function renderAllSecondary() {
    const matches = getPriceScopedMatches();
    renderSizeOptions(sizeContainer, qs(".filter-card[data-filter='size']"), matches);
    renderBrandOptions(brandContainer, qs(".filter-card[data-filter='brand']"), matches);
    renderTypeOptions(typeContainer, qs(".filter-card[data-filter='type']"), matches);
    renderResolutionOptions(resolutionContainer, qs(".filter-card[data-filter='resolution']"), matches);
    renderHzOptions(hzContainer, qs(".filter-card[data-filter='hz']"), matches);
    renderHdmiOptions(hdmiContainer, qs(".filter-card[data-filter='hdmi']"), matches);
    renderKleurOptions(kleurContainer, qs(".filter-card[data-filter='kleur']"), matches);
    renderAanbiederOptions(aanbiederContainer, qs(".filter-card[data-filter='aanbieder']"), matches);
  }

  priceContainer.addEventListener("change", event => {
    const input = event.target.closest("input[type=checkbox]");
    if (!input) return;

    if (input.value === "all") {
      if (input.checked) {
        filterState.priceLabels.clear();
        renderPriceOptions(priceContainer, qs(".filter-card[data-filter='price']"), filterState.sizeGroup);
      } else if (filterState.priceLabels.size === 0) {
        input.checked = true;
      }
    } else {
      if (input.checked) {
        filterState.priceLabels.add(input.value);
      } else {
        filterState.priceLabels.delete(input.value);
      }
      if (filterState.priceLabels.size === 0) {
        renderPriceOptions(priceContainer, qs(".filter-card[data-filter='price']"), filterState.sizeGroup);
      } else {
        const allInput = priceContainer.querySelector('input[value="all"]');
        if (allInput) allInput.checked = false;
      }
    }

    renderAllSecondary();
    applyFilters();
  });

  sizeContainer.addEventListener("change", event => {
    const input = event.target.closest("input[type=checkbox]");
    if (!input) return;

    if (input.value === "all") {
      if (input.checked) {
        filterState.sizes.clear();
        renderSizeOptions(sizeContainer, qs(".filter-card[data-filter='size']"), getPriceScopedMatches());
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
        renderSizeOptions(sizeContainer, qs(".filter-card[data-filter='size']"), getPriceScopedMatches());
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
        renderBrandOptions(brandContainer, qs(".filter-card[data-filter='brand']"), getPriceScopedMatches());
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
        renderBrandOptions(brandContainer, qs(".filter-card[data-filter='brand']"), getPriceScopedMatches());
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
        renderTypeOptions(typeContainer, qs(".filter-card[data-filter='type']"), getPriceScopedMatches());
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
        renderTypeOptions(typeContainer, qs(".filter-card[data-filter='type']"), getPriceScopedMatches());
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
        renderResolutionOptions(resolutionContainer, qs(".filter-card[data-filter='resolution']"), getPriceScopedMatches());
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
        renderResolutionOptions(resolutionContainer, qs(".filter-card[data-filter='resolution']"), getPriceScopedMatches());
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
        renderHzOptions(hzContainer, qs(".filter-card[data-filter='hz']"), getPriceScopedMatches());
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
        renderHzOptions(hzContainer, qs(".filter-card[data-filter='hz']"), getPriceScopedMatches());
      } else {
        const allInput = hzContainer.querySelector('input[value="all"]');
        if (allInput) allInput.checked = false;
      }
    }
    applyFilters();
  });

  hdmiContainer.addEventListener("change", event => {
    const input = event.target.closest("input[type=checkbox]");
    if (!input) return;

    if (input.value === "all") {
      if (input.checked) {
        filterState.hdmiOptions.clear();
        renderHdmiOptions(hdmiContainer, qs(".filter-card[data-filter='hdmi']"), getPriceScopedMatches());
      } else if (filterState.hdmiOptions.size === 0) {
        input.checked = true;
      }
    } else {
      const count = parseInt(input.value, 10);
      if (input.checked) {
        filterState.hdmiOptions.add(count);
      } else {
        filterState.hdmiOptions.delete(count);
      }
      if (filterState.hdmiOptions.size === 0) {
        renderHdmiOptions(hdmiContainer, qs(".filter-card[data-filter='hdmi']"), getPriceScopedMatches());
      } else {
        const allInput = hdmiContainer.querySelector('input[value="all"]');
        if (allInput) allInput.checked = false;
      }
    }
    applyFilters();
  });

  kleurContainer.addEventListener("change", event => {
    const input = event.target.closest("input[type=checkbox]");
    if (!input) return;

    if (input.value === "all") {
      if (input.checked) {
        filterState.kleuren.clear();
        renderKleurOptions(kleurContainer, qs(".filter-card[data-filter='kleur']"), getPriceScopedMatches());
      } else if (filterState.kleuren.size === 0) {
        input.checked = true;
      }
    } else {
      if (input.checked) {
        filterState.kleuren.add(input.value);
      } else {
        filterState.kleuren.delete(input.value);
      }
      if (filterState.kleuren.size === 0) {
        renderKleurOptions(kleurContainer, qs(".filter-card[data-filter='kleur']"), getPriceScopedMatches());
      } else {
        const allInput = kleurContainer.querySelector('input[value="all"]');
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
        renderAanbiederOptions(aanbiederContainer, qs(".filter-card[data-filter='aanbieder']"), getPriceScopedMatches());
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
        renderAanbiederOptions(aanbiederContainer, qs(".filter-card[data-filter='aanbieder']"), getPriceScopedMatches());
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
      filterState.priceLabels.clear();
      filterState.sizes.clear();
      filterState.brands.clear();
      filterState.types.clear();
      filterState.resolutions.clear();
      filterState.hzOptions.clear();
      filterState.hdmiOptions.clear();
      filterState.kleuren.clear();
      filterState.aanbieder.clear();
      renderPriceOptions(priceContainer, qs(".filter-card[data-filter='price']"), filterState.sizeGroup);
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
  const hdmiContainer = qs("#hdmiFilterOptions");
  const kleurContainer = qs("#kleurFilterOptions");
  const aanbiederContainer = qs("#aanbiederFilterOptions");

  const priceCard = qs(".filter-card[data-filter='price']");
  const sizeCard = qs(".filter-card[data-filter='size']");
  const brandCard = qs(".filter-card[data-filter='brand']");
  const typeCard = qs(".filter-card[data-filter='type']");
  const resolutionCard = qs(".filter-card[data-filter='resolution']");
  const hzCard = qs(".filter-card[data-filter='hz']");
  const hdmiCard = qs(".filter-card[data-filter='hdmi']");
  const kleurCard = qs(".filter-card[data-filter='kleur']");
  const aanbiederCard = qs(".filter-card[data-filter='aanbieder']");

  if (!priceContainer || !sizeContainer || !brandContainer || !typeContainer || !resolutionContainer || !hzContainer || !hdmiContainer || !kleurContainer || !aanbiederContainer) return;
  if (!priceCard || !sizeCard || !brandCard || !typeCard || !resolutionCard || !hzCard || !hdmiCard || !kleurCard || !aanbiederCard) return;

  const stored = getStoredSelection();
  const answersData = localStorage.getItem("answers");
  const scoresData = localStorage.getItem("scores");

  if (!stored.sizeGroup || !answersData || !scoresData) return;

  filterState.answers = JSON.parse(answersData);
  filterState.scores = JSON.parse(scoresData);
  filterState.bestType = localStorage.getItem("bestType") || "";
  filterState.sizeGroup = stored.sizeGroup || "";

  fetchProducts()
    .then(rawProducts => {
      const tvs = normalizeProducts(rawProducts);
      filterState.priceGroups = computeDynamicPriceGroups(tvs, stored.sizeGroup, sizeGroupToAllowedSizes);

      // Ignore the ambilight preference when computing the base match pool.
      // The ambilight notice on the result page already informs the user;
      // restricting the pool here can wipe out all results when ambilight
      // TVs don't satisfy the Hz/resolution filters.
      const answersForFilter = { ...filterState.answers, ambilight: "" };
      const result = computeMatchForPriceGroup(tvs, stored.sizeGroup, null, answersForFilter, filterState.scores);
      filterState.baseMatches = Array.isArray(result.filteredMatchedTVs) ? result.filteredMatchedTVs : [];

      // Fallback: if the live computation yields nothing, seed the pool with
      // the TVs that were already matched during the quiz. This ensures the
      // filter panel always shows options regardless of whether the dynamic
      // computation succeeds.
      if (filterState.baseMatches.length === 0) {
        const storedTVsData = localStorage.getItem("filteredMatchedTVs");
        if (storedTVsData) {
          try {
            const storedTVs = JSON.parse(storedTVsData);
            if (Array.isArray(storedTVs) && storedTVs.length > 0) {
              filterState.baseMatches = storedTVs;
            }
          } catch {
            // ignore parse errors
          }
        }
      }

      if (filterState.baseMatches.length === 0) return;

      // No price bucket selected by default: show every matching TV, sorted
      // by relevance/price, and let the user optionally narrow by budget.
      filterState.priceLabels = new Set();

      const matches = getPriceScopedMatches();
      renderPriceOptions(priceContainer, priceCard, stored.sizeGroup);
      renderSizeOptions(sizeContainer, sizeCard, matches);
      renderBrandOptions(brandContainer, brandCard, matches);
      renderTypeOptions(typeContainer, typeCard, matches);
      renderResolutionOptions(resolutionContainer, resolutionCard, matches);
      renderHzOptions(hzContainer, hzCard, matches);
      renderHdmiOptions(hdmiContainer, hdmiCard, matches);
      renderKleurOptions(kleurContainer, kleurCard, matches);
      renderAanbiederOptions(aanbiederContainer, aanbiederCard, matches);
      initFilterEvents(priceContainer, sizeContainer, brandContainer, typeContainer, resolutionContainer, hzContainer, hdmiContainer, kleurContainer, aanbiederContainer);
      applyFilters();
    })
    .catch(() => {
      [priceCard, sizeCard, brandCard, typeCard, resolutionCard, hzCard, hdmiCard, kleurCard, aanbiederCard].forEach(card => { card.hidden = true; });
    });
}

document.addEventListener("DOMContentLoaded", initResultFilters);
