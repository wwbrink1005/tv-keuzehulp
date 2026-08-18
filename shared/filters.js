// shared/filters.js — generieke rendering voor filter-kaarten in de resultaat-
// zijbalk, gebruikt door alle keuzehulpen. Vervangt de losse pill-opmaak die
// elke categorie voorheen zelf dupliceerde (net als shared/aanbieders.js voor
// het "Beschikbaar bij"-blok): een verticale lijst met een aantal erachter,
// en bij veel opties automatisch een zoekbalk + scrollbare lijst.

// Vanaf hoeveel opties de kaart een zoekbalk + scrollbare lijst krijgt i.p.v.
// gewoon alles direct tonen.
const SEARCH_SCROLL_THRESHOLD = 8;

/**
 * Telt hoe vaak elke waarde voorkomt in `matches`. `valueFn` mag een losse
 * waarde of een array van waarden teruggeven (bv. voor aanbieders, waar één
 * product bij meerdere winkels tegelijk hoort).
 */
export function computeCounts(matches, valueFn) {
  const counts = new Map();
  matches.forEach(item => {
    const raw = valueFn(item);
    const values = Array.isArray(raw) ? raw : [raw];
    values.forEach(v => {
      if (v === undefined || v === null || v === "") return;
      counts.set(v, (counts.get(v) || 0) + 1);
    });
  });
  return counts;
}

/**
 * Rendert een complete filter-kaart-inhoud: "Alle"-rij + één rij per item
 * met checkbox, label en aantal. Bij meer dan SEARCH_SCROLL_THRESHOLD items
 * krijgt de lijst een zoekbalkje en wordt 'm scrollbaar i.p.v. de kaart
 * eindeloos te laten uitrekken.
 *
 * @param {HTMLElement} container - leeggemaakt en opnieuw gevuld
 * @param {HTMLElement} card - .filter-card, wordt hidden als er geen items zijn
 * @param {object} opts
 * @param {Array} opts.items - lijst van waarden, al gededupliceerd + gesorteerd
 * @param {Map} opts.counts - waarde -> aantal (zie computeCounts)
 * @param {string} opts.filterName - gebruikt als input[name], voor event delegation
 * @param {Set} opts.stateSet - huidige selectie voor deze filter
 * @param {(item: any) => string} [opts.labelFn] - waarde -> weergavetekst
 * @param {string} [opts.allLabel] - tekst voor de "Alle"-rij
 * @param {string} [opts.searchPlaceholder]
 */
export function renderFilterList(container, card, opts) {
  const {
    items,
    counts,
    filterName,
    stateSet,
    labelFn,
    allLabel = "Alle",
    searchPlaceholder = "Zoeken...",
  } = opts;

  container.innerHTML = "";

  if (!items || items.length === 0) {
    if (card) card.hidden = true;
    return;
  }
  if (card) card.hidden = false;

  const isAllSelected = !stateSet || stateSet.size === 0;

  const buildRow = (value, text, count) => {
    const label = document.createElement("label");
    label.className = "filter-row" + (value !== "all" && stateSet?.has(value) ? " checked" : "") + (value === "all" && isAllSelected ? " checked" : "");

    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = filterName;
    input.value = String(value);
    input.checked = value === "all" ? isAllSelected : (stateSet?.has(value) ?? false);
    input.className = "filter-row-input";

    const check = document.createElement("span");
    check.className = "filter-check";
    check.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6 9 17l-5-5"/></svg>';

    const labelText = document.createElement("span");
    labelText.className = "filter-label";
    labelText.textContent = text;

    label.append(input, check, labelText);

    if (count !== undefined) {
      const countEl = document.createElement("span");
      countEl.className = "filter-count";
      countEl.textContent = String(count);
      label.appendChild(countEl);
    }

    return label;
  };

  container.appendChild(buildRow("all", allLabel, undefined));

  const needsSearchScroll = items.length > SEARCH_SCROLL_THRESHOLD;
  let listTarget = container;

  if (needsSearchScroll) {
    const search = document.createElement("div");
    search.className = "filter-search";
    search.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
      <input type="text" placeholder="${searchPlaceholder}" class="filter-search-input" />
    `;
    container.appendChild(search);

    listTarget = document.createElement("div");
    listTarget.className = "filter-list filter-scroll";
    container.appendChild(listTarget);

    const searchInput = search.querySelector("input");
    searchInput.addEventListener("input", () => {
      const term = searchInput.value.trim().toLowerCase();
      listTarget.querySelectorAll(".filter-row").forEach(row => {
        const text = row.querySelector(".filter-label")?.textContent.toLowerCase() ?? "";
        row.hidden = term.length > 0 && !text.includes(term);
      });
    });
  } else {
    const list = document.createElement("div");
    list.className = "filter-list";
    container.appendChild(list);
    listTarget = list;
  }

  items.forEach(item => {
    const text = labelFn ? labelFn(item) : String(item);
    listTarget.appendChild(buildRow(item, text, counts?.get(item) ?? 0));
  });
}
