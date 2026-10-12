import { applyMinAanbiedersCascade } from "./matching.js";
import { parsePrice, qs } from "./utils.js";
import { fetchProducts } from "./supabase.js";
import { resetProvidersRegistry } from "../../shared/aanbieders.js";
import { buildCardHtml } from "../../shared/resultaat-kaart.js";
import { buildContext, buildResultPoints, buildSpecChips, buildAlleSpecs } from "./punten.js";
import { initFavorieten } from "../../shared/favorieten.js";
import { initAlleSpecs } from "../../shared/alle-specs.js";
import { maakVerrijker } from "../../shared/kaart-verrijking.js";
import { sleutel } from "../../shared/klant.js";

// Fallback shown when an Icecat product image URL 404's (stale/broken CDN entry).
const IMG_FALLBACK = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Crect width='200' height='200' fill='%23f4f5f7'/%3E%3Cg fill='none' stroke='%23c8ccd2' stroke-width='6' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='40' y='50' width='120' height='90' rx='8'/%3E%3Ccircle cx='75' cy='85' r='10'/%3E%3Cpath d='M40 125l35-30 30 25 20-18 35 28'/%3E%3C/g%3E%3C/svg%3E";
window.IMG_FALLBACK = IMG_FALLBACK;

const verrijker = maakVerrijker({ categorie: "koelkast", fetchProducts, buildAlleSpecs });

function updateMatchCount(count) {
  const countEl = qs("#resultMatchCount");
  if (countEl) countEl.textContent = `${Number.isFinite(count) ? count : 0}`;

  // Enkelvoud alleen bij precies 1 resultaat — zie laptop/js/result.js voor
  // de reden (voorkomt de indruk dat de eerste kaart de enige/beste optie is).
  const titleEl = qs("#resultTitleText");
  if (titleEl) {
    titleEl.textContent = count === 1
      ? "Koelkast die bij je past"
      : "Koelkasten die bij je passen";
  }
}

let renderVolgnummer = 0;

function displayOtherMatchesRedesign(lijst) {
  const mijnRender = ++renderVolgnummer;
  resetProvidersRegistry();
  const container = qs("#otherMatchesGrid");
  if (!container) return;

  if (lijst.length === 0) {
    container.innerHTML = '<p class="no-matches">Geen passende koelkasten gevonden.</p>';
    return;
  }

  const minPrice = Math.min(...lijst.map(k => parsePrice(k.prijs)));
  const ctx = buildContext(lijst);

  container.innerHTML = lijst
    .map((koelkast, index) => buildCardHtml({
      product: koelkast,
      index,
      isCheapest: parsePrice(koelkast.prijs) === minPrice,
      specs: buildSpecChips(koelkast),
      points: buildResultPoints(koelkast, currentAnswers, ctx),
    }))
    .join("");

  // Hartje en specificatieblok komen erbij zodra de ruwe catalogus binnen
  // is; alleen als er intussen niet opnieuw gerenderd is (filter aangeklikt).
  if (verrijker.isKlaar) {
    verrijker.verrijk(container, lijst);
  } else {
    verrijker.klaar.then(() => {
      if (mijnRender === renderVolgnummer) verrijker.verrijk(container, lijst);
    });
  }

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
  initFavorieten();
  initAlleSpecs();

  const hasRedesignLayout = Boolean(qs("#bestMatchCard"));
  if (!hasRedesignLayout) return;

  const bestMatchData  = localStorage.getItem(sleutel("koelkast_bestMatch"));
  const filteredData   = localStorage.getItem(sleutel("koelkast_filteredMatchedKoelkasten"));
  const answersData    = localStorage.getItem(sleutel("koelkast_answers"));

  if (!bestMatchData) return;

  const rawFilteredMatchedKoelkasten = filteredData ? JSON.parse(filteredData) : [];
  const answers                      = answersData  ? JSON.parse(answersData)  : null;

  const { result: filteredMatchedKoelkasten } = applyMinAanbiedersCascade(
    Array.isArray(rawFilteredMatchedKoelkasten) ? rawFilteredMatchedKoelkasten : []
  );

  currentAnswers = answers;
  baseMatches    = filteredMatchedKoelkasten;

  initSortControl();
  applySortAndRender("price-asc");

  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}
