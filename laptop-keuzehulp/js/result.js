import { buildResultPoints } from "./matching.js";
import { formatPriceLabel, parsePrice, qs } from "./utils.js";

function formatShipping(verzendkosten) {
  const val = parseFloat(String(verzendkosten ?? "").replace(",", "."));
  if (!Number.isFinite(val) || val <= 0) return "Gratis bezorgd";
  return `+ \u20ac${val.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} verzending`;
}

function buildProvidersHtml(laptop) {
  const aanbieder = laptop?.aanbieder;
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
          const priceLabel = formatPriceLabel(p.price);
          const shippingLabel = formatShipping(p.verzendkosten);
          const subParts = [];
          if (p.levertijd) subParts.push(p.levertijd);
          subParts.push(shippingLabel);
          const subText = subParts.join(" \u00b7 ");
          return `
            <a href="${p.url}" class="tv-provider-row" target="_blank" rel="noopener noreferrer" aria-label="${p.naam}: \u20ac${priceLabel}">
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

function buildSpecList(laptop) {
  const specs = [];

  if (laptop.schermdiagonaal) {
    specs.push(`${laptop.schermdiagonaal}" scherm`);
  }

  if (laptop.processor) {
    specs.push(laptop.processor);
  }

  if (laptop.werkgeheugen) {
    specs.push(`${laptop.werkgeheugen} GB RAM`);
  }

  if (laptop.opslag) {
    const opslagNum = parseInt(laptop.opslag, 10);
    if (opslagNum >= 1024) {
      specs.push(`${opslagNum / 1024} TB SSD`);
    } else {
      specs.push(`${opslagNum} GB SSD`);
    }
  }

  if (laptop.paneeltype) {
    specs.push(laptop.paneeltype);
  }

  if (laptop.resolutie) {
    specs.push(laptop.resolutie);
  }

  return specs;
}

function updateMatchCount(count) {
  const countEl = qs("#resultMatchCount");
  if (!countEl) return;
  countEl.textContent = `${Number.isFinite(count) ? count : 0}`;
}

function displayOtherMatchesRedesign(filteredMatchedLaptops) {
  const container = qs("#otherMatchesGrid");
  if (!container) return;

  if (filteredMatchedLaptops.length === 0) {
    container.innerHTML = '<p class="no-matches">Geen passende laptops gevonden.</p>';
    return;
  }

  const prices = filteredMatchedLaptops.map(l => parsePrice(l.prijs));
  const minPrice = Math.min(...prices);

  container.innerHTML = filteredMatchedLaptops
    .map((laptop, index) => {
      const price = parsePrice(laptop.prijs);
      const isCheapest = price === minPrice;
      const specs = buildSpecList(laptop);
      const specsText = specs.join(" \u2022 ");
      const points = buildResultPoints(laptop, currentAnswers);
      const pointsHtml = points.map(point => `
        <li>
          <i data-lucide="check" class="tv-card-check" aria-hidden="true"></i>
          <span>${point}</span>
        </li>
      `).join("");
      const providersHtml = buildProvidersHtml(laptop);

      return `
        <article class="tv-card${isCheapest ? " is-cheapest" : ""}" data-match-index="${index}">
          <div class="tv-card-image" aria-hidden="true">
            <img src="${laptop.afbeelding || ''}" alt="" role="presentation" data-provider="${laptop.afbeelding && laptop.afbeelding.includes('expert.nl') ? 'expert' : 'coolblue'}">
            <button class="tv-preview-btn" type="button" aria-label="Afbeelding vergroten" data-preview-src="${laptop.afbeelding || ''}" data-preview-name="${laptop.naam}">
              <i data-lucide="eye"></i>
            </button>
          </div>
          <div class="tv-card-body">
            ${isCheapest ? '<span class="tv-card-cheapest-badge">Goedkoopste keuze</span>' : ''}
            <h3 class="tv-card-name">${laptop.naam}</h3>
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

  // Image preview buttons
  container.querySelectorAll(".tv-preview-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const src  = btn.dataset.previewSrc;
      const name = btn.dataset.previewName;
      openImagePreview(src, name);
    });
  });
}

function openImagePreview(src, name) {
  const overlay = qs("#imagePreviewOverlay");
  const img     = qs("#imagePreviewImg");
  const nameEl  = qs("#imagePreviewName");
  if (!overlay || !img) return;
  img.src = src;
  if (nameEl) nameEl.textContent = name || "";
  overlay.classList.add("is-open");
  document.body.style.overflow = "hidden";
}

function closeImagePreview() {
  const overlay = qs("#imagePreviewOverlay");
  if (!overlay) return;
  overlay.classList.remove("is-open");
  document.body.style.overflow = "";
}

function initImagePreview() {
  const overlay = qs("#imagePreviewOverlay");
  const closeBtn = qs("#imagePreviewClose");
  if (!overlay) return;

  closeBtn?.addEventListener("click", closeImagePreview);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeImagePreview();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeImagePreview();
  });
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

  const bestMatchData  = localStorage.getItem("laptop_bestMatch");
  const bestType       = localStorage.getItem("laptop_bestType");
  const scoresData     = localStorage.getItem("laptop_scores");
  const filteredData   = localStorage.getItem("laptop_filteredMatchedLaptops");
  const answersData    = localStorage.getItem("laptop_answers");

  if (!bestMatchData || !bestType) return;

  const bestMatch           = JSON.parse(bestMatchData);
  const answers             = answersData ? JSON.parse(answersData) : null;
  const filteredMatchedLaptops = filteredData ? JSON.parse(filteredData) : [];

  currentAnswers = answers;
  baseMatches    = Array.isArray(filteredMatchedLaptops) ? filteredMatchedLaptops : [];

  initSortControl();
  initImagePreview();
  applySortAndRender("price-asc");

  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}
