import { priceGroupsBySize } from "./data.js";
import { computeMatchForPriceGroup, getIdealTypeSet } from "./matching.js";
import { getStoredSelection, normalizeTypeLabel, qs } from "./utils.js";
import { updateResultMatches } from "./result.js";

const filterState = {
  priceLabel: "",
  brands: new Set(),
  priceMatches: new Map(),
  answers: null,
  scores: null,
  bestType: ""
};

function formatBrandLabel(brand) {
  const raw = String(brand ?? "").trim();
  if (!raw) return "";
  if (raw === raw.toUpperCase()) return raw;
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function collectBrandOptions(matches) {
  const brandSet = new Set();
  matches.forEach(tv => {
    const label = formatBrandLabel(tv.merk);
    if (label) brandSet.add(label);
  });
  return Array.from(brandSet).sort((a, b) => a.localeCompare(b, "nl"));
}

function buildPriceMatches(tvs, sizeGroup, selectedPriceLabel) {
  const groups = priceGroupsBySize[sizeGroup] || [];
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
  const groups = priceGroupsBySize[sizeGroup] || [];
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

function getActivePriceMatches() {
  return filterState.priceMatches.get(filterState.priceLabel) || [];
}

function applyFilters() {
  const priceMatches = getActivePriceMatches();
  let filtered = priceMatches;

  if (filterState.brands.size > 0) {
    filtered = priceMatches.filter(tv => filterState.brands.has(formatBrandLabel(tv.merk)));
  }

  updateResultMatches(filtered, filterState.answers, filterState.bestType, filterState.scores);
}

function initFilterEvents(priceContainer, brandContainer) {
  priceContainer.addEventListener("change", event => {
    const input = event.target.closest("input[type=radio]");
    if (!input) return;

    filterState.priceLabel = input.value;
    filterState.brands.clear();

    renderBrandOptions(brandContainer, qs(".filter-card[data-filter='brand']"), getActivePriceMatches());
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
}

function initResultFilters() {
  const priceContainer = qs("#priceFilterOptions");
  const brandContainer = qs("#brandFilterOptions");
  const priceCard = qs(".filter-card[data-filter='price']");
  const brandCard = qs(".filter-card[data-filter='brand']");

  if (!priceContainer || !brandContainer || !priceCard || !brandCard) return;

  const stored = getStoredSelection();
  const answersData = localStorage.getItem("answers");
  const scoresData = localStorage.getItem("scores");

  if (!stored.sizeGroup || !answersData || !scoresData) return;

  filterState.answers = JSON.parse(answersData);
  filterState.scores = JSON.parse(scoresData);
  filterState.bestType = localStorage.getItem("bestType") || "";

  const selectedPriceLabel = stored.priceLabel || "";

  fetch("tvs.json")
    .then(response => response.json())
    .then(tvs => {
      filterState.priceMatches = buildPriceMatches(tvs, stored.sizeGroup, selectedPriceLabel);

      const availableLabels = Array.from(filterState.priceMatches.keys());
      if (availableLabels.length === 0) return;

      filterState.priceLabel = filterState.priceMatches.has(selectedPriceLabel)
        ? selectedPriceLabel
        : availableLabels[0];

      renderPriceOptions(priceContainer, priceCard, stored.sizeGroup);
      renderBrandOptions(brandContainer, brandCard, getActivePriceMatches());
      initFilterEvents(priceContainer, brandContainer);
      applyFilters();
    })
    .catch(() => {
      priceCard.hidden = true;
      brandCard.hidden = true;
    });
}

document.addEventListener("DOMContentLoaded", initResultFilters);
