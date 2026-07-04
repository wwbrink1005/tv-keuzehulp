import { buildResultPoints } from "./matching.js";
import { formatPriceLabel, parsePrice, qs } from "./utils.js";

// Fallback shown when an Icecat product image URL 404's (stale/broken CDN entry).
const IMG_FALLBACK = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Crect width='200' height='200' fill='%23f4f5f7'/%3E%3Cg fill='none' stroke='%23c8ccd2' stroke-width='6' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='40' y='50' width='120' height='90' rx='8'/%3E%3Ccircle cx='75' cy='85' r='10'/%3E%3Cpath d='M40 125l35-30 30 25 20-18 35 28'/%3E%3C/g%3E%3C/svg%3E";
window.IMG_FALLBACK = IMG_FALLBACK;

function formatShipping(verzendkosten) {
  const val = parseFloat(String(verzendkosten ?? "").replace(",", "."));
  if (!Number.isFinite(val) || val <= 0) return "Gratis bezorgd";
  return `+ \u20ac${val.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} verzending`;
}

function buildProvidersHtml(desktop) {
  const aanbieder = desktop?.aanbieder;
  if (!aanbieder) return "";

  const providers = [];

  const priceCb = parseFloat(String(aanbieder.prijs_cb ?? "").replace(",", "."));
  if (aanbieder.url_cb && Number.isFinite(priceCb) && priceCb > 0) {
    providers.push({
      naam: "Coolblue",
      price: priceCb,
      url: aanbieder.url_cb,
      levertijd: String(aanbieder.levertijd_cb ?? "").trim(),
      verzendkosten: String(aanbieder.verzendkosten_cb ?? "").trim()
    });
  }

  const priceExpert = parseFloat(String(aanbieder.prijs_expert ?? "").replace(",", "."));
  if (aanbieder.url_expert && Number.isFinite(priceExpert) && priceExpert > 0) {
    providers.push({
      naam: "Expert",
      price: priceExpert,
      url: aanbieder.url_expert,
      levertijd: String(aanbieder.levertijd_expert ?? "").trim(),
      verzendkosten: String(aanbieder.verzendkosten_expert ?? "").trim()
    });
  }

  if (providers.length === 0) return "";

  return `
    <div class="tv-card-providers">
      <p class="tv-providers-header">Beschikbaar bij</p>
      <div class="tv-providers-list">
        ${providers.map(p => {
          const priceLabel   = formatPriceLabel(p.price);
          const shippingLabel = formatShipping(p.verzendkosten);
          const subParts     = [];
          if (p.levertijd) subParts.push(p.levertijd);
          subParts.push(shippingLabel);
          const subText = subParts.join(" \u00b7 ");
          return `
            <a href="${p.url}" class="tv-provider-row" target="_blank" rel="noopener noreferrer"
               aria-label="${p.naam}: \u20ac${priceLabel}">
              <div class="tv-provider-left">
                <span class="tv-provider-name">${p.naam}</span>
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

function buildSpecList(desktop) {
  const specs = [];

  if (desktop.behuizing) specs.push(desktop.behuizing);
  if (desktop.gpu && desktop.gpu !== "Niet beschikbaar") specs.push(desktop.gpu);
  if (desktop.ram) {
    specs.push(`${desktop.ram} GB RAM`);
  }
  if (desktop.opslag) {
    if (desktop.opslag >= 1024) {
      const tb = desktop.opslag / 1024;
      specs.push(`${Number.isInteger(tb) ? tb : tb.toFixed(1)} TB SSD`);
    } else {
      specs.push(`${desktop.opslag} GB SSD`);
    }
  }
  if (desktop.wifi === "Ja")         specs.push("Wi-Fi");
  if (desktop.waterkoeling === "Ja") specs.push("Waterkoeling");
  if (desktop.rgb === "Ja")          specs.push("RGB");

  return specs;
}

function updateMatchCount(count) {
  const countEl = qs("#resultMatchCount");
  if (!countEl) return;
  countEl.textContent = `${Number.isFinite(count) ? count : 0}`;
}

let currentAnswers = null;

function displayOtherMatchesRedesign(filteredMatchedDesktops) {
  const container = qs("#otherMatchesGrid");
  if (!container) return;

  if (!Array.isArray(filteredMatchedDesktops) || filteredMatchedDesktops.length === 0) {
    container.innerHTML = '<p class="no-matches">Geen passende desktops gevonden.</p>';
    return;
  }

  const prices   = filteredMatchedDesktops.map(d => parsePrice(d.prijs));
  const minPrice = Math.min(...prices);

  container.innerHTML = filteredMatchedDesktops
    .map((desktop, index) => {
      const price      = parsePrice(desktop.prijs);
      const isCheapest = price === minPrice;
      const specs      = buildSpecList(desktop);
      const specsText  = specs.join(" \u2022 ");
      const points     = buildResultPoints(desktop, currentAnswers);
      const pointsHtml = points.map(point => `
        <li>
          <i data-lucide="check" class="tv-card-check" aria-hidden="true"></i>
          <span>${point}</span>
        </li>
      `).join("");
      const providersHtml = buildProvidersHtml(desktop);

      return `
        <article class="tv-card${isCheapest ? " is-cheapest" : ""}" data-match-index="${index}">
          <div class="tv-card-image" aria-hidden="true">
            <img src="${desktop.afbeelding || ""}" alt="" role="presentation" onerror="this.onerror=null;this.src=window.IMG_FALLBACK;">
            <button class="tv-preview-btn" type="button"
                    aria-label="Afbeelding vergroten"
                    data-preview-src="${desktop.afbeelding || ""}"
                    data-preview-name="${desktop.naam}"
                    data-preview-imgs="${JSON.stringify(desktop.afbeeldingen || []).replace(/"/g, '&quot;')}">
              <i data-lucide="eye"></i>
            </button>
          </div>
          <div class="tv-card-body">
            ${isCheapest ? '<span class="tv-card-cheapest-badge">Goedkoopste keuze</span>' : ""}
            <h3 class="tv-card-name">${desktop.naam}</h3>
            ${points.length > 0 ? `<ul class="tv-card-points">${pointsHtml}</ul>` : ""}
            <div class="tv-card-specs">${specsText}</div>
            <div class="tv-card-price">Vanaf \u20ac${formatPriceLabel(price)}</div>
          </div>
          ${providersHtml}
        </article>
      `;
    })
    .join("");

  if (window.lucide?.createIcons) window.lucide.createIcons();
}

let baseMatches = [];
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
  if (buttonText) buttonText.textContent = SORT_LABELS[sortValue] || SORT_LABELS["price-asc"];
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

  if (window.lucide?.createIcons) window.lucide.createIcons();

  return sortedMatches;
}

export function updateResultMatches(matches, answers, type) {
  baseMatches    = Array.isArray(matches) ? matches : [];
  currentAnswers = answers;
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
  if (!qs("#bestMatchCard")) return;

  const bestMatchData = localStorage.getItem("desktop_bestMatch");
  const bestType      = localStorage.getItem("desktop_bestType");
  const filteredData  = localStorage.getItem("desktop_filteredMatchedDesktops");
  const answersData   = localStorage.getItem("desktop_answers");

  if (!bestMatchData || !bestType) return;

  const answers  = answersData ? JSON.parse(answersData) : null;
  const filtered = filteredData ? JSON.parse(filteredData) : [];

  currentAnswers = answers;
  baseMatches    = Array.isArray(filtered) ? filtered : [];

  initSortControl();
  applySortAndRender("price-asc");

  if (window.lucide?.createIcons) window.lucide.createIcons();
}
