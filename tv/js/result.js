import { buildResultPoints, isPerfectMatch } from "./matching.js";
import { formatPriceLabel, formatScherpte, parsePrice, qs } from "./utils.js";

// Fallback shown when an Icecat product image URL 404's (stale/broken CDN entry).
const IMG_FALLBACK = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Crect width='200' height='200' fill='%23f4f5f7'/%3E%3Cg fill='none' stroke='%23c8ccd2' stroke-width='6' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='40' y='50' width='120' height='90' rx='8'/%3E%3Ccircle cx='75' cy='85' r='10'/%3E%3Cpath d='M40 125l35-30 30 25 20-18 35 28'/%3E%3C/g%3E%3C/svg%3E";
window.IMG_FALLBACK = IMG_FALLBACK;

function formatShipping(verzendkosten) {
  const val = parseFloat(String(verzendkosten ?? "").replace(",", "."));
  if (!Number.isFinite(val) || val <= 0) return "Gratis bezorgd";
  return `+ \u20ac${val.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} verzending`;
}

function buildProvidersHtml(tv) {
  const providers = tv?.aanbieders ?? [];
  if (providers.length === 0) return "";

  return `
    <div class="tv-card-providers">
      <p class="tv-providers-header">Beschikbaar bij</p>
      <div class="tv-providers-list">
        ${providers.map(p => {
          const priceLabel = formatPriceLabel(p.prijs);
          const shippingLabel = formatShipping(p.verzendkosten);
          const subParts = [];
          if (p.levertijd) subParts.push(p.levertijd);
          subParts.push(shippingLabel);
          const subText = subParts.join(" \u00b7 ");
          return `
            <a href="${p.url}" class="tv-provider-row" target="_blank" rel="noopener noreferrer" aria-label="${p.winkel}: \u20ac${priceLabel}">
              <div class="tv-provider-left">
                <span class="tv-provider-name">${p.winkel}</span>
                ${subText ? `<span class="tv-provider-sub">${subText}</span>` : ""}
              </div>
              <div class="tv-provider-right">
                <span class="tv-provider-price">\u20ac\u00a0${priceLabel}</span>
                <span class="tv-provider-arrow" aria-hidden="true">
                  <i data-lucide="chevron-right"></i>
                </span>
              </div>
            </a>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function renderBestMatchProviders(tv) {
  const container = qs("#bestMatchProviders");
  const cardEl = qs("#bestMatchCard");
  if (!container) return;

  const providers = tv?.aanbieders ?? [];

  if (providers.length === 0) {
    container.innerHTML = "";
    if (cardEl) cardEl.classList.remove("has-providers");
    return;
  }

  if (cardEl) cardEl.classList.add("has-providers");

  container.innerHTML = `
    <p class="providers-header">Beschikbaar bij</p>
    <div class="providers-list">
      ${providers.map(p => {
        const priceLabel = formatPriceLabel(p.prijs);
        const shippingLabel = formatShipping(p.verzendkosten);
        return `
          <a href="${p.url}" class="provider-btn" target="_blank" rel="noopener noreferrer" aria-label="${p.winkel}: \u20ac${priceLabel}, ${p.levertijd}">
            <span class="provider-name">${p.winkel}</span>
            <span class="provider-price">\u20ac\u00a0${priceLabel}</span>
            <span class="provider-meta">
              <span class="provider-delivery">
                <i data-lucide="truck" aria-hidden="true"></i>
                <span class="provider-delivery-text">${p.levertijd}</span>
              </span>
              <span class="provider-shipping">${shippingLabel}</span>
            </span>
            <span class="provider-chevron" aria-hidden="true">
              <i data-lucide="chevron-right"></i>
            </span>
          </a>
        `;
      }).join("")}
    </div>
  `;

  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

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
  countEl.textContent = `${safeCount}`;
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

  return specs;
}

function updateResultMatchUI(tv, scores, answers) {
  const newTitleTextEl = qs("#resultTitle span") || qs("#resultTitleText");
  const newTitleEl = qs("#resultTitle");
  const titleEl = newTitleTextEl || newTitleEl;

  const perfectMatch = isPerfectMatch(tv, scores, answers, currentSizeGroup);
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
    renderBestMatchProviders(null);
    return;
  }

  if (nameEl) {
    nameEl.textContent = tv.naam;
  }

  const imageEl = qs("#bestMatchImage");
  if (imageEl) {
    imageEl.onerror = function () { this.onerror = null; this.src = IMG_FALLBACK; };
    imageEl.src = tv.afbeelding || "tv.png";
  }

  const previewBtn = qs("#bestMatchPreviewBtn");
  if (previewBtn) {
    previewBtn.dataset.previewSrc  = tv.afbeelding || "tv.png";
    previewBtn.dataset.previewName = tv.naam || "";
    previewBtn.dataset.previewImgs = JSON.stringify(tv.afbeeldingen || []);
  }

  if (specsEl) {
    const specs = buildSpecList(tv);
    specsEl.textContent = specs.join(" \u2022 ");
  }

  if (priceEl) {
    const price = parsePrice(tv.prijs);
    priceEl.textContent = `Vanaf \u20ac${formatPriceLabel(price)}`;
  }

  renderBestMatchPoints(buildResultPoints(tv, answers, currentSizeGroup));
  renderBestMatchProviders(tv);

  const bestMatchCard = qs("#bestMatchCard");
  if (bestMatchCard) {
    const isBest = originalBestMatchNaam !== null && tv.naam === originalBestMatchNaam;
    bestMatchCard.classList.toggle("is-best-match", isBest);
  }

  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

function displayOtherMatchesRedesign(filteredMatchedTVs) {
  const container = qs("#otherMatchesGrid");
  if (!container) return;

  if (filteredMatchedTVs.length === 0) {
    container.innerHTML = "<p class=\"no-matches\">Geen passende TV's gevonden.</p>";
    return;
  }

  const prices = filteredMatchedTVs.map(tv => parsePrice(tv.prijs));
  const minPrice = Math.min(...prices);

  container.innerHTML = filteredMatchedTVs
    .map((tv, index) => {
      const price = parsePrice(tv.prijs);
      const isCheapest = price === minPrice;
      const specs = buildSpecList(tv);
      const specsText = specs.join(" \u2022 ");
      const points = buildResultPoints(tv, currentAnswers, currentSizeGroup);
      const pointsHtml = points.map(point => `
        <li>
          <i data-lucide="check" class="tv-card-check" aria-hidden="true"></i>
          <span>${point}</span>
        </li>
      `).join("");
      const providersHtml = buildProvidersHtml(tv);

      return `
        <article class="tv-card${isCheapest ? " is-cheapest" : ""}" data-match-index="${index}">
          <div class="tv-card-image" aria-hidden="true">
            <img src="${tv.afbeelding || 'tv.png'}" alt="" role="presentation" ${index < 4 ? 'fetchpriority="high" loading="eager"' : 'loading="lazy"'} onerror="this.onerror=null;this.src=window.IMG_FALLBACK;">
            <button class="tv-preview-btn" type="button" aria-label="Afbeelding vergroten" data-preview-src="${tv.afbeelding || 'tv.png'}" data-preview-name="${tv.naam}" data-preview-imgs="${JSON.stringify(tv.afbeeldingen || []).replace(/"/g, '&quot;')}">
              <i data-lucide="eye"></i>
            </button>
          </div>
          <div class="tv-card-body">
            ${isCheapest ? '<span class="tv-card-cheapest-badge">Goedkoopste keuze</span>' : ''}
            <h3 class="tv-card-name">${tv.naam}</h3>
            ${points.length > 0 ? `<ul class="tv-card-points">${pointsHtml}</ul>` : ""}
            <div class="tv-card-specs">${specsText}</div>
            <div class="tv-card-price">Vanaf \u20ac${formatPriceLabel(price)}</div>
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

let redesignHandlersBound = false;
let currentMatches = [];
let baseMatches = [];
let currentAnswers = null;
let currentType = "";
let currentSizeGroup = "";
let currentSort = "price-asc";
let originalBestMatchNaam = null;

const SORT_LABELS = {
  "price-asc": "Prijs (laag-hoog)",
  "price-desc": "Prijs (hoog-laag)",
};

function initRedesignInteractions(matchedTVs, answers) {
  currentMatches = Array.isArray(matchedTVs) ? matchedTVs : [];
  if (redesignHandlersBound) return;

  const closeButton = qs(".best-match-close");
  const bestMatchCard = qs("#bestMatchCard");

  if (closeButton && bestMatchCard) {
    closeButton.addEventListener("click", () => {
      bestMatchCard.classList.add("is-hidden");
    });
  }

  redesignHandlersBound = true;
}

function setResultState(matches, answers, type, sizeGroup) {
  baseMatches = Array.isArray(matches) ? matches : [];
  currentAnswers = answers;
  currentType = type || "";
  currentSizeGroup = sizeGroup || "";
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

  // Keep bestMatchCard hidden — all info is shown inline in tv-cards
  const bestMatchCard = qs("#bestMatchCard");
  if (bestMatchCard) {
    bestMatchCard.classList.add("is-hidden");
  }

  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }

  return sortedMatches;
}

export function updateResultMatches(matches, answers, type, scores, sizeGroup) {
  setResultState(matches, answers, type, sizeGroup);
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
  container.classList.remove("has-non-cheapest-active");
  container.classList.remove("has-cheapest-active");
}

function setActiveMatchCard(card) {
  if (!card) return;
  clearActiveMatchCards();
  card.classList.add("is-active");
  const container = qs("#otherMatchesGrid");
  if (container) {
    if (!card.classList.contains("is-cheapest")) {
      container.classList.add("has-non-cheapest-active");
    } else {
      container.classList.add("has-cheapest-active");
    }
  }
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

  const sizeGroup = localStorage.getItem("selectedSizeGroup") || "";

  originalBestMatchNaam = bestMatch?.naam ?? null;

  showResultRedesign(bestMatch, bestType, answers, filteredMatchedTVs, bestMatch);
  setResultState(filteredMatchedTVs, answers, bestType, sizeGroup);
  updateMatchCount(filteredMatchedTVs.length);
  updateResultMatchUI(bestMatch, scores, answers);
}