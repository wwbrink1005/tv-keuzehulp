import { applyMinAanbiedersCascade, kiesBesteMatch } from "./matching.js";
import { formatPriceLabel, parsePrice, qs } from "./utils.js";
import { resetProvidersRegistry } from "../../shared/aanbieders.js";
import { toonGeenUitslag, toonGeenFilterResultaat } from "../../shared/resultaat-status.js";
import { buildCardHtml } from "../../shared/resultaat-kaart.js";
import { fetchProducts } from "./supabase.js";
import { buildContext, buildResultPoints, buildSpecChips, buildAlleSpecs } from "./punten.js";
import { initFavorieten } from "../../shared/favorieten.js";
import { initAlleSpecs } from "../../shared/alle-specs.js";
import { maakVerrijker } from "../../shared/kaart-verrijking.js";

// Fallback shown when an Icecat product image URL 404's (stale/broken CDN entry).
const IMG_FALLBACK = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Crect width='200' height='200' fill='%23f4f5f7'/%3E%3Cg fill='none' stroke='%23c8ccd2' stroke-width='6' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='40' y='50' width='120' height='90' rx='8'/%3E%3Ccircle cx='75' cy='85' r='10'/%3E%3Cpath d='M40 125l35-30 30 25 20-18 35 28'/%3E%3C/g%3E%3C/svg%3E";
window.IMG_FALLBACK = IMG_FALLBACK;

const verrijker = maakVerrijker({ categorie: "koffiemachine", fetchProducts, buildAlleSpecs });

function updateMatchCount(count) {
  const countEl = qs("#resultMatchCount");
  if (countEl) countEl.textContent = `${Number.isFinite(count) ? count : 0}`;

  const titleEl = qs("#resultTitleText");
  if (titleEl) {
    titleEl.textContent = count === 1
      ? "Koffiemachine die bij je past"
      : "Koffiemachines die bij je passen";
  }
}

let renderVolgnummer = 0;

function displayOtherMatchesRedesign(filteredMatchedKoffiemachines) {
  const mijnRender = ++renderVolgnummer;
  resetProvidersRegistry();
  const container = qs("#otherMatchesGrid");
  if (!container) return;

  if (filteredMatchedKoffiemachines.length === 0) {
    toonGeenFilterResultaat(container, "koffiemachines");
    return;
  }

  const prices = filteredMatchedKoffiemachines.map(k => parsePrice(k.prijs));
  const minPrice = Math.min(...prices);
  const ctx = buildContext(filteredMatchedKoffiemachines);
  // Beste match uit de huidige (eventueel gefilterde) lijst
  const beste = kiesBesteMatch(filteredMatchedKoffiemachines);

  container.innerHTML = filteredMatchedKoffiemachines
    .map((koffiemachine, index) => {
      const price = parsePrice(koffiemachine.prijs);
      const isCheapest = price === minPrice;
      const specs = buildSpecChips(koffiemachine);
      const points = buildResultPoints(koffiemachine, currentAnswers, ctx);

      return buildCardHtml({ product: koffiemachine, index, isCheapest, isBeste: koffiemachine === beste, specs, points });
    })
    .join("");

  // Hartje en specificatieblok komen erbij zodra de ruwe catalogus binnen
  // is; alleen als er intussen niet opnieuw gerenderd is (filter aangeklikt).
  if (verrijker.isKlaar) {
    verrijker.verrijk(container, filteredMatchedKoffiemachines);
  } else {
    verrijker.klaar.then(() => {
      if (mijnRender === renderVolgnummer) verrijker.verrijk(container, filteredMatchedKoffiemachines);
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

// Op prijs, met de beste match bovenaan bij "laag-hoog"; bij "hoog-laag"
// staat hij gewoon op zijn plek (zelfde als de andere keuzehulpen).
function sortMatchesByPrice(matches, sortValue) {
  const list = Array.isArray(matches) ? [...matches] : [];
  list.sort((a, b) => parsePrice(a.prijs) - parsePrice(b.prijs));
  if (sortValue === "price-desc") return list.reverse();
  const beste = kiesBesteMatch(list);
  if (beste) {
    list.splice(list.indexOf(beste), 1);
    list.unshift(beste);
  }
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
      window.phTrackEvent?.("sorteren", { categorie: "koffiemachine", volgorde: option.dataset.value || "price-asc" });
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

  const bestMatchData = localStorage.getItem("koffiemachine_bestMatch");
  const filteredData  = localStorage.getItem("koffiemachine_filteredMatchedKoffiemachines");
  const answersData   = localStorage.getItem("koffiemachine_answers");

  if (!bestMatchData) { toonGeenUitslag(); return; }

  const rawFilteredMatchedKoffiemachines = filteredData ? JSON.parse(filteredData) : [];
  const answers                          = answersData  ? JSON.parse(answersData)  : null;

  // Past de "aantal winkels"-drempel al toe op de allereerste render, zodat
  // de bezoeker niet heel kort de ongefilterde telling/lijst ziet flitsen
  // voordat result-filters.js de live herberekening heeft afgerond.
  const { result: filteredMatchedKoffiemachines } = applyMinAanbiedersCascade(
    Array.isArray(rawFilteredMatchedKoffiemachines) ? rawFilteredMatchedKoffiemachines : []
  );

  currentAnswers = answers;
  baseMatches    = filteredMatchedKoffiemachines;

  initSortControl();
  applySortAndRender("price-asc");

  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}
