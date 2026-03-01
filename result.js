import { buildResultPoints, isPerfectMatch } from "./matching.js";
import { formatPriceLabel, formatScherpte, parsePrice, qs } from "./utils.js";

function renderBestMatchPoints(points) {
  const listEl = qs("#bestMatchPoints");
  if (!listEl) return;

  listEl.innerHTML = points
    .map(point => `
      <li>
        <i data-lucide="check" class="best-match-check"></i>
        <span>${point}</span>
      </li>
    `)
    .join("");
}

function buildAllMatches(filteredMatchedTVs, bestMatch) {
  const list = Array.isArray(filteredMatchedTVs) ? [...filteredMatchedTVs] : [];
  if (bestMatch && !list.some(tv => tv.naam === bestMatch.naam)) {
    list.push(bestMatch);
  }
  return list;
}

function updateMatchCount(count) {
  const countEl = qs("#resultMatchCount");
  if (!countEl) return;
  const safeCount = Number.isFinite(count) ? count : 0;
  countEl.textContent = `(${safeCount})`;
}

function buildSpecList(tv) {
  const specs = [];

  const sizeMatch = String(tv.grootte ?? "").match(/\d+/);
  if (sizeMatch) {
    specs.push(`${sizeMatch[0]} inch`);
  }

  const typeValue = String(tv.type ?? "");
  if (typeValue === "LED (edge)" || typeValue === "LED (direct)") {
    specs.push("LED");
  } else if (typeValue) {
    specs.push(typeValue);
  }

  const hzValue = tv.Hz ?? tv.hz;
  if (hzValue !== undefined && hzValue !== null && hzValue !== "") {
    const hzLabel = String(hzValue).trim();
    if (/hz$/i.test(hzLabel)) {
      specs.push(hzLabel);
    } else {
      specs.push(`${hzLabel} Hz`);
    }
  }

  const scherpteValue = String(tv.scherpte ?? "");
  if (scherpteValue) {
    specs.push(formatScherpte(scherpteValue));
  }

  const ambiValue = tv.Ambilight ?? tv.ambilight;
  const ambiEnabled =
    ambiValue === true ||
    ambiValue === "TRUE" ||
    ambiValue === "true" ||
    ambiValue === 1 ||
    ambiValue === "1";
  if (ambiEnabled) {
    specs.push("Ambilight");
  }

  return specs;
}

function updateResultMatchUI(tv, scores, answers) {
  const newTitleTextEl = qs("#resultTitle span") || qs("#resultTitleText");
  const newTitleEl = qs("#resultTitle");
  const titleEl = newTitleTextEl || newTitleEl;

  const perfectMatch = isPerfectMatch(tv, scores, answers);
  const titleText = perfectMatch
    ? "De tv's die perfect bij je keuzes passen"
    : "De tv's die het beste bij je keuzes passen";

  if (titleEl) {
    titleEl.textContent = titleText;
  }
}

function showResultRedesign(tv, type, answers, filteredMatchedTVs, bestMatch) {
  const allMatches = buildAllMatches(filteredMatchedTVs, bestMatch);

  setResultState(allMatches, answers, type);
  initSortControl();
  applySortAndRender("price-asc");

  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

function getMatchCardByIndex(matchIndex) {
  const container = qs("#otherMatchesGrid");
  if (!container) return null;
  return container.querySelector(`.other-match-card[data-match-index="${matchIndex}"]`);
}

function updateBestMatchCard(tv, type, answers) {
  const nameEl = qs("#bestMatchName");
  const specsEl = qs("#bestMatchSpecs");
  const priceEl = qs("#bestMatchPrice");

  if (!nameEl && !specsEl && !priceEl) return;

  if (!tv) {
    if (nameEl) {
      nameEl.textContent = "Geen match gevonden";
    }
    if (specsEl) {
      specsEl.textContent = type ? `Aanbevolen type: ${type}` : "";
    }
    if (priceEl) {
      priceEl.textContent = "";
    }
    renderBestMatchPoints([]);
    return;
  }

  if (nameEl) {
    nameEl.textContent = tv.naam;
  }

  if (specsEl) {
    const specs = buildSpecList(tv);
    specsEl.textContent = specs.join(" \u2022 ");
  }

  if (priceEl) {
    const price = parsePrice(tv.prijs);
    priceEl.textContent = `Vanaf \u20ac${formatPriceLabel(price)}`;
  }

  renderBestMatchPoints(buildResultPoints(tv, answers));

  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

function displayOtherMatchesRedesign(filteredMatchedTVs) {
  const container = qs("#otherMatchesGrid");
  if (!container) return;

  const bestMatchCard = qs("#bestMatchCard");
  if (bestMatchCard && container.contains(bestMatchCard)) {
    // Keep the best match card in the DOM before wiping the grid.
    container.parentElement.insertBefore(bestMatchCard, container);
    bestMatchCard.classList.remove("inline");
  }

  if (filteredMatchedTVs.length === 0) {
    container.innerHTML = "<p class=\"no-matches\">Geen passende TV's gevonden.</p>";
    return;
  }

  container.innerHTML = filteredMatchedTVs
    .map((tv, index) => {
      const price = parsePrice(tv.prijs);
      const specs = buildSpecList(tv);
      const specsHtml = specs.map(spec => `<li>${spec}</li>`).join("");

      return `
        <article class="other-match-card" data-match-index="${index}">
          <div class="other-match-media" aria-hidden="true">
            <img src="tv.png" alt="" role="presentation">
          </div>
          <h3 class="other-match-title">${tv.naam}</h3>
          <ul class="other-match-specs">${specsHtml}</ul>
          <div class="other-match-price">Vanaf \u20ac${formatPriceLabel(price)}</div>
          <button class="other-match-action" type="button">Bekijk</button>
        </article>
      `;
    })
    .join("");

  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

let redesignHandlersBound = false;
let currentMatches = [];
let baseMatches = [];
let currentAnswers = null;
let currentType = "";
let currentSort = "price-asc";

const SORT_LABELS = {
  "price-asc": "Prijs (laag-hoog)",
  "price-desc": "Prijs (hoog-laag)",
};

function initRedesignInteractions(matchedTVs, answers) {
  currentMatches = Array.isArray(matchedTVs) ? matchedTVs : [];
  if (redesignHandlersBound) return;

  const container = qs("#otherMatchesGrid");
  const bestMatchCard = qs("#bestMatchCard");
  const closeButton = qs(".best-match-close");

  if (!container || !bestMatchCard) return;

  container.addEventListener("click", event => {
    const actionButton = event.target.closest(".other-match-action");
    if (!actionButton) return;

    const card = actionButton.closest(".other-match-card");
    if (!card) return;

    const indexValue = Number(card.dataset.matchIndex);
    const targetMatch = currentMatches[indexValue];
    if (!targetMatch) return;

    updateBestMatchCard(targetMatch, "", answers);
    placeBestMatchCardAtIndex(indexValue);
    setActiveMatchCard(card);
    scrollBestMatchCardIntoView();
  });

  if (closeButton) {
    closeButton.addEventListener("click", () => {
      bestMatchCard.classList.add("is-hidden");
      clearActiveMatchCards();
    });
  }

  redesignHandlersBound = true;
}

function setResultState(matches, answers, type) {
  baseMatches = Array.isArray(matches) ? matches : [];
  currentAnswers = answers;
  currentType = type || "";
}

function sortMatchesByPrice(matches, sortValue) {
  const list = Array.isArray(matches) ? [...matches] : [];
  list.sort((a, b) => parsePrice(a.prijs) - parsePrice(b.prijs));
  if (sortValue === "price-desc") {
    list.reverse();
  }
  return list;
}

function updateSortUI(sortValue) {
  const buttonText = qs("#sortButtonText");
  if (buttonText) {
    buttonText.textContent = SORT_LABELS[sortValue] || SORT_LABELS["price-asc"];
  }

  const options = document.querySelectorAll(".sort-option");
  options.forEach(option => {
    const isSelected = option.dataset.value === sortValue;
    option.classList.toggle("is-selected", isSelected);
    option.setAttribute("aria-selected", String(isSelected));
  });
}

function setSortOpen(isOpen) {
  const control = qs("#sortControl");
  const button = qs("#sortButton");
  const menu = qs("#sortMenu");

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
  currentMatches = sortedMatches;

  displayOtherMatchesRedesign(sortedMatches);
  initRedesignInteractions(sortedMatches, currentAnswers);

  const topMatch = sortedMatches[0] || null;
  updateBestMatchCard(topMatch, currentType, currentAnswers);

  const bestMatchCard = qs("#bestMatchCard");
  const gridSection = qs(".other-matches");
  if (bestMatchCard) {
    bestMatchCard.classList.remove("is-hidden");
  }

  if (topMatch) {
    placeBestMatchCardAtIndex(0);
    if (bestMatchCard && gridSection && bestMatchCard.parentElement !== qs("#otherMatchesGrid")) {
      bestMatchCard.classList.remove("inline");
      gridSection.parentElement.insertBefore(bestMatchCard, gridSection);
    }
    setActiveMatchCard(getMatchCardByIndex(0));
  }

  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }

  return sortedMatches;
}

export function updateResultMatches(matches, answers, type, scores) {
  setResultState(matches, answers, type);
  const sortedMatches = applySortAndRender(currentSort);
  updateMatchCount(sortedMatches.length);
  updateResultMatchUI(sortedMatches[0] || null, scores, answers);
}

function initSortControl() {
  const control = qs("#sortControl");
  const button = qs("#sortButton");
  const menu = qs("#sortMenu");
  if (!control || !button || !menu) return;

  updateSortUI(currentSort);

  if (!control.dataset.bound) {
    button.addEventListener("click", event => {
      event.stopPropagation();
      const isOpen = control.classList.contains("is-open");
      setSortOpen(!isOpen);
    });

    menu.addEventListener("click", event => {
      const option = event.target.closest(".sort-option");
      if (!option) return;
      const value = option.dataset.value || "price-asc";
      applySortAndRender(value);
      setSortOpen(false);
    });

    document.addEventListener("click", event => {
      if (!control.contains(event.target)) {
        setSortOpen(false);
      }
    });

    control.dataset.bound = "true";
  }
}

function scrollBestMatchCardIntoView() {
  const bestMatchCard = qs("#bestMatchCard");
  if (!bestMatchCard || bestMatchCard.classList.contains("is-hidden")) return;

  const getMenuHeight = () => {
    const menuBar = document.querySelector(".menu-bar");
    if (menuBar) {
      const height = menuBar.getBoundingClientRect().height;
      if (Number.isFinite(height) && height > 0) return height;
    }
    const rootStyle = getComputedStyle(document.documentElement);
    const menuValue = parseFloat(rootStyle.getPropertyValue("--menu-height"));
    return Number.isFinite(menuValue) && menuValue > 0 ? menuValue : 0;
  };

  const useFallbackScroll = () => {
    const rect = bestMatchCard.getBoundingClientRect();
    const margin = 16;
    const menuHeight = getMenuHeight();
    const viewportTop = window.scrollY;
    const viewportBottom = viewportTop + window.innerHeight;
    const viewportVisibleHeight = window.innerHeight - menuHeight;
    const cardTop = viewportTop + rect.top;
    const cardBottom = viewportTop + rect.bottom;

    let targetScroll = viewportTop;

    if (rect.height + margin * 2 > viewportVisibleHeight) {
      targetScroll = Math.max(cardTop - (menuHeight + margin), 0);
    } else if (cardTop < viewportTop + menuHeight + margin) {
      targetScroll = Math.max(cardTop - (menuHeight + margin), 0);
    } else if (cardBottom > viewportBottom - margin) {
      targetScroll = Math.max(cardBottom - window.innerHeight + margin, 0);
    }

    if (targetScroll !== viewportTop) {
      window.scrollTo({ top: targetScroll, behavior: "smooth" });
    }
  };

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      useFallbackScroll();
    });
  });
}

function placeBestMatchCardAtIndex(matchIndex) {
  const container = qs("#otherMatchesGrid");
  const bestMatchCard = qs("#bestMatchCard");
  if (!container || !bestMatchCard) return;

  const cards = Array.from(container.querySelectorAll(".other-match-card"));
  const safeIndex = Math.max(0, Math.min(matchIndex, cards.length - 1));

  const getColumnCount = () => {
    const style = window.getComputedStyle(container);
    const template = style.getPropertyValue("grid-template-columns") || "";
    const columns = template
      .split(" ")
      .map(part => part.trim())
      .filter(Boolean).length;
    return columns > 0 ? columns : 1;
  };

  const columnCount = getColumnCount();
  const rowStartIndex = Math.floor(safeIndex / columnCount) * columnCount;
  const anchorCard = cards[rowStartIndex] || cards[safeIndex];

  bestMatchCard.classList.remove("is-hidden");
  bestMatchCard.classList.add("inline");
  bestMatchCard.classList.add("is-opening");

  if (anchorCard) {
    container.insertBefore(bestMatchCard, anchorCard);
  } else {
    container.appendChild(bestMatchCard);
  }

  window.setTimeout(() => {
    bestMatchCard.classList.remove("is-opening");
  }, 200);
}

function clearActiveMatchCards() {
  const container = qs("#otherMatchesGrid");
  if (!container) return;
  container.querySelectorAll(".other-match-card.is-active").forEach(card => {
    card.classList.remove("is-active");
  });
}

function setActiveMatchCard(card) {
  if (!card) return;
  clearActiveMatchCards();
  card.classList.add("is-active");
}

export function initResultPage() {
  const hasRedesignLayout = Boolean(qs("#bestMatchCard"));
  if (!hasRedesignLayout) return;

  const bestMatchData = localStorage.getItem("bestMatch");
  const bestType = localStorage.getItem("bestType");
  const scoresData = localStorage.getItem("scores");
  const filteredTVsData = localStorage.getItem("filteredMatchedTVs");
  const answersData = localStorage.getItem("answers");

  if (!bestMatchData || !bestType) return;

  const bestMatch = JSON.parse(bestMatchData);
  const scores = scoresData ? JSON.parse(scoresData) : {};
  const answers = answersData ? JSON.parse(answersData) : null;
  const filteredMatchedTVs = filteredTVsData ? JSON.parse(filteredTVsData) : [];

  showResultRedesign(bestMatch, bestType, answers, filteredMatchedTVs, bestMatch);
  updateMatchCount(filteredMatchedTVs.length);
  updateResultMatchUI(bestMatch, scores, answers);
}
