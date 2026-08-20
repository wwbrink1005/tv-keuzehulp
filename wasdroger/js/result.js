import { buildResultPoints } from "./matching.js";
import { formatPriceLabel, parsePrice, qs } from "./utils.js";
import { buildProvidersHtml, resetProvidersRegistry } from "../../shared/aanbieders.js";

// Fallback shown when an Icecat product image URL 404's (stale/broken CDN entry).
const IMG_FALLBACK = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Crect width='200' height='200' fill='%23f4f5f7'/%3E%3Cg fill='none' stroke='%23c8ccd2' stroke-width='6' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='40' y='50' width='120' height='90' rx='8'/%3E%3Ccircle cx='75' cy='85' r='10'/%3E%3Cpath d='M40 125l35-30 30 25 20-18 35 28'/%3E%3C/g%3E%3C/svg%3E";
window.IMG_FALLBACK = IMG_FALLBACK;

function buildSpecList(wasdroger) {
  const specs = [];

  if (wasdroger.capaciteit) {
    specs.push(`${wasdroger.capaciteit} kg`);
  }

  if (wasdroger.droogsysteem) {
    specs.push(wasdroger.droogsysteem);
  }

  if (wasdroger.energieLabel) {
    specs.push(`Energielabel ${wasdroger.energieLabel}`);
  }

  if (wasdroger.geluidDb) {
    specs.push(`${wasdroger.geluidDb} dB`);
  }

  return specs;
}

function updateMatchCount(count) {
  const countEl = qs("#resultMatchCount");
  if (countEl) countEl.textContent = `${Number.isFinite(count) ? count : 0}`;

  // Enkelvoud alleen bij precies 1 resultaat — zelfde reden als wasmachine
  // (voorkomt de indruk dat de eerste kaart de enige/beste optie is).
  const titleEl = qs("#resultTitleText");
  if (titleEl) {
    titleEl.textContent = count === 1
      ? "De wasdroger die het beste bij je past!"
      : "De wasdrogers die het beste bij je passen!";
  }
}

function displayOtherMatchesRedesign(filteredMatchedWasdrogers) {
  resetProvidersRegistry();
  const container = qs("#otherMatchesGrid");
  if (!container) return;

  if (filteredMatchedWasdrogers.length === 0) {
    container.innerHTML = '<p class="no-matches">Geen passende wasdrogers gevonden.</p>';
    return;
  }

  const prices = filteredMatchedWasdrogers.map(w => parsePrice(w.prijs));
  const minPrice = Math.min(...prices);

  container.innerHTML = filteredMatchedWasdrogers
    .map((wasdroger, index) => {
      const price = parsePrice(wasdroger.prijs);
      const isCheapest = price === minPrice;
      const specs = buildSpecList(wasdroger);
      const specsText = specs.join(" • ");
      const points = buildResultPoints(wasdroger, currentAnswers);
      const pointsHtml = points.map(point => `
        <li>
          <i data-lucide="check" class="tv-card-check" aria-hidden="true"></i>
          <span>${point}</span>
        </li>
      `).join("");
      const providersHtml = buildProvidersHtml(wasdroger.aanbieders);

      return `
        <article class="tv-card${isCheapest ? " is-cheapest" : ""}" data-match-index="${index}">
          <div class="tv-card-image" aria-hidden="true">
            <img src="${wasdroger.afbeelding || ''}" alt="" role="presentation" ${index < 4 ? 'fetchpriority="high" loading="eager"' : 'loading="lazy"'} onerror="this.onerror=null;this.src=window.IMG_FALLBACK;">
            <button class="tv-preview-btn" type="button" aria-label="Afbeelding vergroten" data-preview-src="${wasdroger.afbeelding || ''}" data-preview-name="${wasdroger.naam}" data-preview-imgs="${JSON.stringify(wasdroger.afbeeldingen || []).replace(/"/g, '&quot;')}">
              <i data-lucide="eye"></i>
            </button>
          </div>
          <div class="tv-card-body">
            ${isCheapest ? '<span class="tv-card-cheapest-badge">Goedkoopste keuze</span>' : ''}
            <h3 class="tv-card-name">${wasdroger.naam}</h3>
            ${points.length > 0 ? `<ul class="tv-card-points">${pointsHtml}</ul>` : ""}
            <div class="tv-card-specs">${specsText}</div>
            <div class="tv-card-price">Vanaf €${formatPriceLabel(price)}</div>
          </div>
          ${providersHtml}
        </article>
      `;
    })
    .join("");

  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

let baseMatches = [];
let currentAnswers = null;
let currentType = "";
let currentSort = "price-asc";

const SORT_LABELS = {
  "price-asc":  "Prijs (laag-hoog)",
  "price-desc": "Prijs (hoog-laag)"
};

function sortMatchesByPrice(matches, sortValue) {
  const list = Array.isArray(matches) ? [...matches] : [];
  list.sort((a, b) => parsePrice(a.prijs) - parsePrice(b.prijs));
  if (sortValue === "price-desc") list.reverse();
  return list;
}

function updateSortUI(sortValue) {
  const buttonText = qs("#sortButtonText");
  if (buttonText) {
    buttonText.textContent = SORT_LABELS[sortValue] || SORT_LABELS["price-asc"];
  }
  document.querySelectorAll(".sort-option").forEach(option => {
    const isSelected = option.dataset.value === sortValue;
    option.classList.toggle("is-selected", isSelected);
    option.setAttribute("aria-selected", String(isSelected));
  });
}

function setSortOpen(isOpen) {
  const control = qs("#sortControl");
  const button  = qs("#sortButton");
  const menu    = qs("#sortMenu");
  if (!control || !button || !menu) return;
  control.classList.toggle("is-open", isOpen);
  button.setAttribute("aria-expanded", String(isOpen));
  menu.setAttribute("aria-hidden", String(!isOpen));
}

function applySortAndRender(sortValue) {
  const normalizedSort = SORT_LABELS[sortValue] ? sortValue : "price-asc";
  currentSort = normalizedSort;
  updateSortUI(normalizedSort);

  const sortedMatches = sortMatchesByPrice(baseMatches, normalizedSort);

  displayOtherMatchesRedesign(sortedMatches);
  updateMatchCount(sortedMatches.length);

  const bestMatchCard = qs("#bestMatchCard");
  if (bestMatchCard) bestMatchCard.classList.add("is-hidden");

  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }

  return sortedMatches;
}

export function updateResultMatches(matches, answers, type) {
  baseMatches = Array.isArray(matches) ? matches : [];
  currentAnswers = answers;
  currentType = type || "";
  applySortAndRender(currentSort);
}

function initSortControl() {
  const control = qs("#sortControl");
  const button  = qs("#sortButton");
  const menu    = qs("#sortMenu");
  if (!control || !button || !menu) return;

  updateSortUI(currentSort);

  if (!control.dataset.bound) {
    button.addEventListener("click", event => {
      event.stopPropagation();
      setSortOpen(!control.classList.contains("is-open"));
    });

    menu.addEventListener("click", event => {
      const option = event.target.closest(".sort-option");
      if (!option) return;
      applySortAndRender(option.dataset.value || "price-asc");
      setSortOpen(false);
    });

    document.addEventListener("click", event => {
      if (!control.contains(event.target)) setSortOpen(false);
    });

    control.dataset.bound = "true";
  }
}

export function initResultPage() {
  const hasRedesignLayout = Boolean(qs("#bestMatchCard"));
  if (!hasRedesignLayout) return;

  const bestMatchData = localStorage.getItem("wasdroger_bestMatch");
  const filteredData  = localStorage.getItem("wasdroger_filteredMatchedWasdrogers");
  const answersData   = localStorage.getItem("wasdroger_answers");

  if (!bestMatchData) return;

  const filteredMatchedWasdrogers = filteredData ? JSON.parse(filteredData) : [];
  const answers                   = answersData  ? JSON.parse(answersData)  : null;

  currentAnswers = answers;
  baseMatches    = Array.isArray(filteredMatchedWasdrogers) ? filteredMatchedWasdrogers : [];

  initSortControl();
  applySortAndRender("price-asc");

  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}
