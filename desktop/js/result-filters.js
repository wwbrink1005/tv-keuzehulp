import { TIER_ORDER, priceGroupsByType } from "./data.js";
import {
  matchDesktops, kiesBesteMatch, voldoetAanGebruik, genoegOpslag,
  applyMinAanbiedersCascade, BAND_BESTE, DEFAULT_MIN_AANBIEDERS,
} from "./matching.js";
import { computeDynamicPriceGroups, getStoredSelection, normalizeProducts, parsePrice, qs } from "./utils.js";
import { updateResultMatches } from "./result.js";
import { fetchProducts } from "./supabase.js";
import { computeCounts, renderFilterList } from "../../shared/filters.js";


// ─── Tellen zoals bij grote webwinkels ───────────────────────────────────────
// Binnen één filter is het "of", tussen filters "en". Het aantal naast een
// optie is wat je krijgt als je hem aanklikt, gegeven alle ANDERE gekozen
// filters: de eigen selectie van die kaart telt even niet mee. Een optie met 0
// wordt grijs (shared/filters.js), zodat je nooit op "geen resultaten" uitkomt.
// Kaarten waar meerdere keuzes "en" betekenen (alle gekozen functies tegelijk)
// tellen per optie wat er overblijft als je hem erbij aanvinkt.
const EN_FILTERS = new Set(["functies", "programmas", "varianten"]);

const genoegWinkels = p => (p.aanbieders ?? []).length >= filterState.minAanbieders;

/** Producten door alle filters, behalve de selectie in `set` (en het winkelaantal). */
function zonderSelectie(set) {
  if (!set || set.size === 0) return filterKeten().filter(genoegWinkels);
  const bewaard = [...set];
  set.clear();
  const uit = filterKeten().filter(genoegWinkels);
  bewaard.forEach(v => set.add(v));
  return uit;
}

function telOpties(filterName, items, productValueFn) {
  const set = filterState[filterName];
  if (!EN_FILTERS.has(filterName) || !set) return computeCounts(zonderSelectie(set), productValueFn);
  return new Map(items.map(v => {
    const had = set.has(v);
    set.add(v);
    const n = filterKeten().filter(genoegWinkels).length;
    if (!had) set.delete(v);
    return [v, n];
  }));
}

const MIN_AANBIEDERS_OPTIONS = [1, 2, 3, 4, 5];

const filterState = {
  priceLabels:   new Set(),
  minAanbieders: DEFAULT_MIN_AANBIEDERS,
  behuizingTypes: new Set(),
  brands:        new Set(),
  gpuTiers:      new Set(),
  ramOptions:    new Set(),
  opslagOptions: new Set(),
  osOptions:     new Set(),
  processorFabrikanten: new Set(),
  // RGB-verlichting en waterkoeling waren voorheen 2 losse Ja/Nee-kaarten —
  // samengevoegd tot 1 "Functies"-kaart met aanvinkbare functies (zie
  // FUNCTIE_DEFINITIES), net als bij wasmachine/koelkast.
  functies:      new Set(),
  kleuren:       new Set(),
  aanbieder:     new Set(),
  baseMatches:   [],
  answers:       null,
  scores:        null,
  bestType:      "",
  behuizingType: ""
};

const FUNCTIE_DEFINITIES = [
  { key: "gpu", label: "Losse videokaart", check: d => d.gpuLos === true },
  { key: "rgb", label: "RGB-verlichting", check: d => d.rgb === "Ja" },
  { key: "waterkoeling", label: "Waterkoeling", check: d => d.waterkoeling === "Ja" },
  { key: "wifi", label: "Ingebouwde wifi", check: d => Boolean(d.wifi) && d.wifi !== "Nee" },
];

// Price buckets are recomputed fresh from the live-fetched catalog on every
// results page load (not trusted from the quiz-time localStorage snapshot),
// since a stale/short-lived fetch during the quiz can produce fewer or
// narrower buckets than the catalog actually supports (e.g. missing the
// most expensive bucket entirely).
function getDynamicPriceGroups(behuizingType) {
  if (Array.isArray(filterState.priceGroups) && filterState.priceGroups.length > 0) {
    return filterState.priceGroups;
  }
  return priceGroupsByType[behuizingType] || priceGroupsByType["maakt-niet-uit"];
}

// Price is just another optional narrowing filter, not a hard upfront wall:
// with no bucket selected, every desktop matching the quiz answers is shown.
function getBaseMatches() {
  return filterState.baseMatches;
}

function getPriceScopedMatches() {
  const base = getBaseMatches();
  if (filterState.priceLabels.size === 0) return base;
  const groups = getDynamicPriceGroups(filterState.behuizingType).filter(g => filterState.priceLabels.has(g.label));
  return base.filter(d => {
    const price = parsePrice(d.prijs);
    return groups.some(g => price >= g.min && (price < g.max || g.max === Number.POSITIVE_INFINITY));
  });
}

// Welke opties een filterkaart toont: alles uit de quizuitslag (alleen de
// winkelregel telt mee), NIET beperkt door de andere gekozen filters. Zo
// blijft een optie die door bv. een prijskeuze op 0 komt grijs in beeld
// staan in plaats van te verdwijnen. Het aantal erachter telt wel met alle
// andere filters (zie zonderSelectie/telOpties).
function getSecondaryScopedMatches() {
  return getBaseScopedByMinAanbieders();
}

function getBaseScopedByMinAanbieders() {
  return getBaseMatches().filter(d => (d.aanbieders ?? []).length >= filterState.minAanbieders);
}

function formatBrandLabel(brand) {
  const raw = String(brand ?? "").trim();
  if (!raw) return "";
  if (raw === raw.toUpperCase()) return raw;
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function collectBehuizingOptions(matches) {
  const set = new Set();
  matches.forEach(d => { if (d.behuizing) set.add(d.behuizing); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "nl"));
}

function collectBrandOptions(matches) {
  const set = new Set();
  matches.forEach(d => { const label = formatBrandLabel(d.merk); if (label) set.add(label); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "nl"));
}

// Sinds okt. 2026 de processorklasse (de kaart heette "GPU Klasse"; de
// videokaart staat nu als "Losse videokaart" bij de functies).
const KLASSE_LABEL = { Budget: "Instap", Mid: "Middenklasse", Krachtig: "Krachtig", Topklasse: "Topklasse" };
function collectGpuTierOptions(matches) {
  const tierOrder = ["Budget", "Mid", "Krachtig", "Topklasse"];
  const set = new Set(matches.map(d => d.processorTier).filter(Boolean));
  return tierOrder.filter(t => set.has(t));
}

function collectRamOptions(matches) {
  const set = new Set();
  matches.forEach(d => { if (d.ram) set.add(d.ram); });
  return Array.from(set).sort((a, b) => a - b);
}

function collectOpslagOptions(matches) {
  const set = new Set();
  matches.forEach(d => { if (d.opslag) set.add(d.opslag); });
  return Array.from(set).sort((a, b) => a - b);
}

function collectOsOptions(matches) {
  const set = new Set();
  matches.forEach(d => { if (d.os) set.add(d.os); });
  const order = ["Windows 11 Home", "Windows 11 Pro"];
  const inOrder = order.filter(t => set.has(t));
  set.forEach(t => { if (!order.includes(t)) inOrder.push(t); });
  return inOrder;
}

function collectProcessorFabrikantOptions(matches) {
  const set = new Set();
  matches.forEach(d => { if (d.processorFabrikant) set.add(d.processorFabrikant); });
  const order = ["Intel", "AMD"];
  const inOrder = order.filter(t => set.has(t));
  set.forEach(t => { if (!order.includes(t)) inOrder.push(t); });
  return inOrder;
}

function collectFunctieOptions(matches) {
  return FUNCTIE_DEFINITIES.filter(f => matches.some(f.check)).map(f => f.key);
}

function collectKleurOptions(matches) {
  const set = new Set();
  matches.forEach(d => { if (d.kleur) set.add(d.kleur); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "nl"));
}

function collectAanbiederOptions(matches) {
  const set = new Set();
  matches.forEach(d => {
    (d.aanbieders ?? []).forEach(a => set.add(a.winkel));
  });
  return Array.from(set).sort();
}

function renderFilterOptions(container, card, items, matches, productValueFn, filterName, labelFn) {
  if (items.length === 0) { container.innerHTML = ""; card.hidden = true; return; }
  const stateSet = filterState[filterName];
  const counts = telOpties(filterName, items, productValueFn);
  renderFilterList(container, card, { items, counts, filterName, stateSet, labelFn });
}

function renderPriceOptions(container, card, behuizingType) {
  const groups = getDynamicPriceGroups(behuizingType);

  // Only show price buckets that actually contain a matching desktop for the
  // current quiz answers — otherwise users click a bucket that can never
  // show a result. If there's only one (or zero) non-empty bucket there's
  // nothing meaningful to narrow, so hide the whole filter card.
  const base = getBaseScopedByMinAanbieders();
  const groupForPrice = price => groups.find(g => price >= g.min && (price < g.max || g.max === Number.POSITIVE_INFINITY));
  const counts = computeCounts(zonderSelectie(filterState.priceLabels), d => groupForPrice(parsePrice(d.prijs))?.label);
  const opBasis = computeCounts(base, d => groupForPrice(parsePrice(d.prijs))?.label);
  const relevant = groups.filter(g => opBasis.has(g.label) || filterState.priceLabels.has(g.label)).map(g => g.label);

  if (relevant.length <= 1) { container.innerHTML = ""; card.hidden = true; return; }

  renderFilterList(container, card, {
    items: relevant,
    counts,
    filterName: "priceFilter",
    stateSet: filterState.priceLabels,
    labelFn: label => `€ ${label}`,
    allLabel: "Alle prijzen",
  });
}

function renderMinAanbiedersOptions(container, card) {
  const matches = filterKeten();
  const options = MIN_AANBIEDERS_OPTIONS.map(n => ({
    n,
    count: matches.filter(d => (d.aanbieders ?? []).length >= n).length,
  })).filter(o => o.count > 0);

  // Corrigeer de drempel naar een geldige optie VOORDAT de kaart eventueel
  // wordt verborgen — anders blijft filterState.minAanbieders op een
  // onhaalbare waarde staan en gaan de kaarten hieronder (die via
  // getSecondaryScopedMatches()/getBaseScopedByMinAanbieders() dezelfde
  // drempel gebruiken) ten onrechte allemaal leeg renderen.
  if (options.length > 0 && !options.some(o => o.n === filterState.minAanbieders)) {
    const fallback = options.find(o => o.n === DEFAULT_MIN_AANBIEDERS) || options[options.length - 1];
    filterState.minAanbieders = fallback.n;
  }

  if (options.length <= 1) { container.innerHTML = ""; card.hidden = true; return; }
  card.hidden = false;

  container.innerHTML = "";
  const list = document.createElement("div");
  list.className = "filter-list";
  container.appendChild(list);

  options.forEach(({ n, count }) => {
    const label = document.createElement("label");
    label.className = "filter-row";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "minAanbiedersFilter";
    input.value = String(n);
    input.checked = filterState.minAanbieders === n;
    input.className = "filter-row-input";

    const check = document.createElement("span");
    check.className = "filter-check";
    check.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6 9 17l-5-5"/></svg>';

    const labelText = document.createElement("span");
    labelText.className = "filter-label";
    labelText.append(document.createTextNode(n === 1 ? "Alle winkels" : `${n}+ winkels`));
    if (n === DEFAULT_MIN_AANBIEDERS) {
      labelText.classList.add("has-badge");
      const recommended = document.createElement("span");
      recommended.className = "filter-recommended-badge";
      recommended.textContent = "Aanbevolen";
      labelText.appendChild(recommended);
    }

    const countEl = document.createElement("span");
    countEl.className = "filter-count";
    countEl.textContent = String(count);

    label.append(input, check, labelText, countEl);
    list.appendChild(label);
  });
}

function renderBehuizingOptions(container, card, matches) {
  renderFilterOptions(container, card, collectBehuizingOptions(matches), matches, d => d.behuizing, "behuizingTypes");
}

function renderBrandOptions(container, card, matches) {
  renderFilterOptions(container, card, collectBrandOptions(matches), matches, d => formatBrandLabel(d.merk), "brands");
}

function renderGpuTierOptions(container, card, matches) {
  renderFilterOptions(container, card, collectGpuTierOptions(matches), matches, d => d.processorTier, "gpuTiers", t => KLASSE_LABEL[t] ?? t);
}

function renderRamOptions(container, card, matches) {
  renderFilterOptions(container, card, collectRamOptions(matches), matches, d => d.ram, "ramOptions", r => `${r} GB`);
}

function formatOpslagLabel(gb) {
  if (gb >= 1024) {
    const tb = gb / 1024;
    return `${Number.isInteger(tb) ? tb : tb.toFixed(1)} TB`;
  }
  return `${gb} GB`;
}

function renderOpslagOptions(container, card, matches) {
  renderFilterOptions(container, card, collectOpslagOptions(matches), matches, d => d.opslag, "opslagOptions", formatOpslagLabel);
}

function renderOsOptions(container, card, matches) {
  renderFilterOptions(container, card, collectOsOptions(matches), matches, d => d.os, "osOptions");
}

function renderProcessorFabrikantOptions(container, card, matches) {
  renderFilterOptions(container, card, collectProcessorFabrikantOptions(matches), matches, d => d.processorFabrikant, "processorFabrikanten");
}

function renderFunctieOptions(container, card, matches) {
  const functieValueFn = d => FUNCTIE_DEFINITIES.filter(f => f.check(d)).map(f => f.key);
  const labelFn = key => FUNCTIE_DEFINITIES.find(f => f.key === key)?.label ?? key;
  renderFilterOptions(container, card, collectFunctieOptions(matches), matches, functieValueFn, "functies", labelFn);
}

function renderKleurOptions(container, card, matches) {
  renderFilterOptions(container, card, collectKleurOptions(matches), matches, d => d.kleur, "kleuren");
}

function renderAanbiederOptions(container, card, matches) {
  renderFilterOptions(container, card, collectAanbiederOptions(matches), matches, d => (d.aanbieders ?? []).map(a => a.winkel), "aanbieder");
}

function updateClearFiltersBtn() {
  const btn = qs("#clearFiltersBtn");
  if (!btn) return;
  const hasActive =
    filterState.priceLabels.size > 0     ||
    filterState.behuizingTypes.size > 0  ||
    filterState.brands.size > 0          ||
    filterState.gpuTiers.size > 0        ||
    filterState.ramOptions.size > 0      ||
    filterState.opslagOptions.size > 0   ||
    filterState.osOptions.size > 0       ||
    filterState.processorFabrikanten.size > 0 ||
    filterState.functies.size > 0 ||
    filterState.kleuren.size > 0 ||
    filterState.aanbieder.size > 0 ||
    filterState.minAanbieders !== DEFAULT_MIN_AANBIEDERS;
  btn.hidden = !hasActive;
}

function filterKeten() {
  let filtered = getPriceScopedMatches();

  if (filterState.behuizingTypes.size > 0) {
    filtered = filtered.filter(d => filterState.behuizingTypes.has(d.behuizing));
  }

  if (filterState.brands.size > 0) {
    filtered = filtered.filter(d => filterState.brands.has(formatBrandLabel(d.merk)));
  }

  if (filterState.gpuTiers.size > 0) {
    filtered = filtered.filter(d => filterState.gpuTiers.has(d.processorTier));
  }

  if (filterState.ramOptions.size > 0) {
    filtered = filtered.filter(d => filterState.ramOptions.has(d.ram));
  }

  if (filterState.opslagOptions.size > 0) {
    filtered = filtered.filter(d => filterState.opslagOptions.has(d.opslag));
  }

  if (filterState.osOptions.size > 0) {
    filtered = filtered.filter(d => filterState.osOptions.has(d.os));
  }

  if (filterState.processorFabrikanten.size > 0) {
    filtered = filtered.filter(d => filterState.processorFabrikanten.has(d.processorFabrikant));
  }

  if (filterState.functies.size > 0) {
    filtered = filtered.filter(d =>
      FUNCTIE_DEFINITIES.filter(f => filterState.functies.has(f.key)).every(f => f.check(d))
    );
  }

  if (filterState.kleuren.size > 0) {
    filtered = filtered.filter(d => filterState.kleuren.has(d.kleur));
  }

  if (filterState.aanbieder.size > 0) {
    filtered = filtered.filter(d =>
      (d.aanbieders ?? []).some(a => filterState.aanbieder.has(a.winkel))
    );
  }

  return filtered;
}

function applyFilters() {
  const filtered = filterKeten();

  const { effectiveMin, result: final } = applyMinAanbiedersCascade(filtered, filterState.minAanbieders);
  if (effectiveMin !== filterState.minAanbieders) {
    syncMinAanbiedersUI(effectiveMin);
  }

  updateClearFiltersBtn();
  updateResultMatches(final, filterState.answers, filterState.bestType);
}

// Zet de zichtbare selectie gelijk aan `n` zonder een change-event te vuren
// (gebruikt door de cascade-fallback in applyFilters()).
function syncMinAanbiedersUI(n) {
  filterState.minAanbieders = n;
  const container = qs("#minAanbiedersFilterOptions");
  if (!container) return;
  container.querySelectorAll('input[name="minAanbiedersFilter"]').forEach(input => {
    input.checked = Number(input.value) === n;
  });
}

function initFilterEvents(priceContainer, behuizingContainer, brandContainer, gpuTierContainer, ramContainer, opslagContainer, osContainer, processorFabrikantContainer, functieContainer, kleurContainer, aanbiederContainer, minAanbiedersContainer) {
  function renderAllSecondary() {
    renderMinAanbiedersOptions(minAanbiedersContainer, qs(".filter-card[data-filter='min-aanbieders']"));
    const matches = getSecondaryScopedMatches();
    renderBehuizingOptions(behuizingContainer, qs(".filter-card[data-filter='behuizing']"), matches);
    renderBrandOptions(brandContainer, qs(".filter-card[data-filter='brand']"), matches);
    renderGpuTierOptions(gpuTierContainer, qs(".filter-card[data-filter='gpu-tier']"), matches);
    renderRamOptions(ramContainer, qs(".filter-card[data-filter='ram']"), matches);
    renderOpslagOptions(opslagContainer, qs(".filter-card[data-filter='opslag']"), matches);
    renderOsOptions(osContainer, qs(".filter-card[data-filter='os']"), matches);
    renderProcessorFabrikantOptions(processorFabrikantContainer, qs(".filter-card[data-filter='processor-fabrikant']"), matches);
    renderFunctieOptions(functieContainer, qs(".filter-card[data-filter='functies']"), matches);
    renderKleurOptions(kleurContainer, qs(".filter-card[data-filter='kleur']"), matches);
    renderAanbiederOptions(aanbiederContainer, qs(".filter-card[data-filter='aanbieder']"), matches);
    renderPriceOptions(priceContainer, qs(".filter-card[data-filter='price']"), filterState.behuizingType);
  }

  minAanbiedersContainer.addEventListener("change", event => {
    const input = event.target.closest("input[type=radio]");
    if (!input) return;
    filterState.minAanbieders = parseInt(input.value, 10);
    applyFilters();
    renderAllSecondary();
  });

  priceContainer.addEventListener("change", event => {
    const input = event.target.closest("input[type=checkbox]");
    if (!input) return;

    if (input.value === "all") {
      if (input.checked) {
        filterState.priceLabels.clear();
        renderPriceOptions(priceContainer, qs(".filter-card[data-filter='price']"), filterState.behuizingType);
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
        renderPriceOptions(priceContainer, qs(".filter-card[data-filter='price']"), filterState.behuizingType);
      } else {
        const allInput = priceContainer.querySelector('input[value="all"]');
        if (allInput) allInput.checked = false;
      }
    }

    applyFilters();
    renderAllSecondary();
  });

  function handleCheckboxSet(container, stateSet, card, renderFn, valueFn = v => v, exclusive = false) {
    container.addEventListener("change", event => {
      const input = event.target.closest("input[type=checkbox]");
      if (!input) return;
      if (input.value === "all") {
        if (input.checked) { stateSet.clear(); renderFn(container, card, getSecondaryScopedMatches()); }
        else if (stateSet.size === 0) { input.checked = true; }
      } else {
        const val = valueFn(input.value);
        if (input.checked) {
          // "Ja"/"Nee"-achtige filters zijn elkaars tegenpolen: aanvinken
          // van de één moet de ander automatisch uitvinken.
          if (exclusive) stateSet.clear();
          stateSet.add(val);
        } else {
          stateSet.delete(val);
        }
        if (stateSet.size === 0) renderFn(container, card, getSecondaryScopedMatches());
        else {
          const allInput = container.querySelector('input[value="all"]');
          if (allInput) allInput.checked = false;
        }
      }
      applyFilters();
      renderAllSecondary();
    });
  }

  const behuizingCard = qs(".filter-card[data-filter='behuizing']");
  const brandCard     = qs(".filter-card[data-filter='brand']");
  const gpuTierCard   = qs(".filter-card[data-filter='gpu-tier']");
  const ramCard       = qs(".filter-card[data-filter='ram']");
  const opslagCard    = qs(".filter-card[data-filter='opslag']");
  const osCard        = qs(".filter-card[data-filter='os']");
  const processorFabrikantCard = qs(".filter-card[data-filter='processor-fabrikant']");
  const functieCard = qs(".filter-card[data-filter='functies']");
  const kleurCard = qs(".filter-card[data-filter='kleur']");
  const aanbiederCard = qs(".filter-card[data-filter='aanbieder']");

  handleCheckboxSet(behuizingContainer, filterState.behuizingTypes, behuizingCard, renderBehuizingOptions);
  handleCheckboxSet(brandContainer,     filterState.brands,         brandCard,     renderBrandOptions);
  handleCheckboxSet(gpuTierContainer,   filterState.gpuTiers,       gpuTierCard,   renderGpuTierOptions);
  handleCheckboxSet(ramContainer,       filterState.ramOptions,     ramCard,       renderRamOptions,   v => parseInt(v, 10));
  handleCheckboxSet(opslagContainer,    filterState.opslagOptions,  opslagCard,    renderOpslagOptions, v => parseInt(v, 10));
  handleCheckboxSet(osContainer,        filterState.osOptions,      osCard,        renderOsOptions);
  handleCheckboxSet(processorFabrikantContainer, filterState.processorFabrikanten, processorFabrikantCard, renderProcessorFabrikantOptions);
  handleCheckboxSet(functieContainer,   filterState.functies,       functieCard,   renderFunctieOptions);
  handleCheckboxSet(kleurContainer,     filterState.kleuren,        kleurCard,     renderKleurOptions);
  handleCheckboxSet(aanbiederContainer, filterState.aanbieder,      aanbiederCard, renderAanbiederOptions);

  const clearBtn = qs("#clearFiltersBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      filterState.priceLabels.clear();
      filterState.behuizingTypes.clear();
      filterState.brands.clear();
      filterState.gpuTiers.clear();
      filterState.ramOptions.clear();
      filterState.opslagOptions.clear();
      filterState.osOptions.clear();
      filterState.processorFabrikanten.clear();
      filterState.functies.clear();
      filterState.kleuren.clear();
      filterState.aanbieder.clear();
      filterState.minAanbieders = DEFAULT_MIN_AANBIEDERS;
      renderPriceOptions(priceContainer, qs(".filter-card[data-filter='price']"), filterState.behuizingType);
      renderAllSecondary();
      applyFilters();
    });
  }
}

function initResultFilters() {
  const priceContainer    = qs("#priceFilterOptions");
  const behuizingContainer = qs("#behuizingFilterOptions");
  const brandContainer    = qs("#brandFilterOptions");
  const gpuTierContainer  = qs("#gpuTierFilterOptions");
  const ramContainer      = qs("#ramFilterOptions");
  const opslagContainer   = qs("#opslagFilterOptions");
  const osContainer       = qs("#osFilterOptions");
  const processorFabrikantContainer = qs("#processorFabrikantFilterOptions");
  const functieContainer = qs("#functiesFilterOptions");
  const kleurContainer = qs("#kleurFilterOptions");
  const aanbiederContainer = qs("#aanbiederFilterOptions");
  const minAanbiedersContainer = qs("#minAanbiedersFilterOptions");

  const priceCard     = qs(".filter-card[data-filter='price']");
  const behuizingCard = qs(".filter-card[data-filter='behuizing']");
  const brandCard     = qs(".filter-card[data-filter='brand']");
  const gpuTierCard   = qs(".filter-card[data-filter='gpu-tier']");
  const ramCard       = qs(".filter-card[data-filter='ram']");
  const opslagCard    = qs(".filter-card[data-filter='opslag']");
  const osCard        = qs(".filter-card[data-filter='os']");
  const processorFabrikantCard = qs(".filter-card[data-filter='processor-fabrikant']");
  const functieCard = qs(".filter-card[data-filter='functies']");
  const kleurCard = qs(".filter-card[data-filter='kleur']");
  const aanbiederCard = qs(".filter-card[data-filter='aanbieder']");
  const minAanbiedersCard = qs(".filter-card[data-filter='min-aanbieders']");

  if (!priceContainer || !behuizingContainer || !brandContainer || !gpuTierContainer ||
      !ramContainer || !opslagContainer || !osContainer || !processorFabrikantContainer ||
      !functieContainer || !kleurContainer ||
      !aanbiederContainer || !minAanbiedersContainer) return;
  if (!priceCard || !behuizingCard || !brandCard || !gpuTierCard ||
      !ramCard || !opslagCard || !osCard || !processorFabrikantCard ||
      !functieCard || !kleurCard || !aanbiederCard || !minAanbiedersCard) return;

  const stored      = getStoredSelection();
  const answersData = localStorage.getItem("desktop_answers");

  if (!answersData) return;

  filterState.answers       = JSON.parse(answersData);
  filterState.bestType      = localStorage.getItem("desktop_bestType") || "";
  filterState.behuizingType = stored.behuizingType || "maakt-niet-uit";

  fetchProducts()
    .then(rawProducts => {
      const desktops = normalizeProducts(rawProducts);

      // Budget uit de quiz (maximumbedrag) is een echte grens, net als in de quiz.
      // Past er van dit type niets binnen, dan zonder grens (zelfde vangnet).
      const cap = Number(filterState.answers?.budget) || null;
      const zonderGrens = matchDesktops(desktops, filterState.behuizingType, null, filterState.answers);
      let result = cap ? matchDesktops(desktops, filterState.behuizingType, cap, filterState.answers) : zonderGrens;
      const budgetZonderMatch = Boolean(cap && !(result.filteredMatchedDesktops?.length));
      if (budgetZonderMatch) result = zonderGrens;
      filterState.baseMatches = Array.isArray(result.filteredMatchedDesktops) ? result.filteredMatchedDesktops : [];
      filterState.bestType = result.bestType || filterState.bestType;
      filterState.priceGroups = computeDynamicPriceGroups(filterState.baseMatches, filterState.behuizingType);
      budgetContext = { cap, result, zonderGrens, budgetZonderMatch };

      // Fallback: if the live computation yields nothing, seed the pool with
      // the desktops that were already matched during the quiz. This ensures
      // the filter panel always shows options regardless of whether the
      // dynamic computation succeeds.
      if (filterState.baseMatches.length === 0) {
        const storedData = localStorage.getItem("desktop_filteredMatchedDesktops");
        if (storedData) {
          try {
            const storedDesktops = JSON.parse(storedData);
            if (Array.isArray(storedDesktops) && storedDesktops.length > 0) {
              filterState.baseMatches = storedDesktops;
            }
          } catch { /* ignore */ }
        }
      }

      if (filterState.baseMatches.length === 0) return;

      // No price bucket selected by default: show every matching desktop,
      // and let the user optionally narrow by budget.
      filterState.priceLabels = new Set();

      // Vóór alle andere tellingen: bepaalt/valideert filterState.minAanbieders.
      renderMinAanbiedersOptions(minAanbiedersContainer, minAanbiedersCard);
      renderPriceOptions(priceContainer, priceCard, filterState.behuizingType);
      const matches = getSecondaryScopedMatches();
      renderBehuizingOptions(behuizingContainer, behuizingCard, matches);
      renderBrandOptions(brandContainer, brandCard, matches);
      renderGpuTierOptions(gpuTierContainer, gpuTierCard, matches);
      renderRamOptions(ramContainer, ramCard, matches);
      renderOpslagOptions(opslagContainer, opslagCard, matches);
      renderOsOptions(osContainer, osCard, matches);
      renderProcessorFabrikantOptions(processorFabrikantContainer, processorFabrikantCard, matches);
      renderFunctieOptions(functieContainer, functieCard, matches);
      renderKleurOptions(kleurContainer, kleurCard, matches);
      renderAanbiederOptions(aanbiederContainer, aanbiederCard, matches);
      initFilterEvents(priceContainer, behuizingContainer, brandContainer, gpuTierContainer, ramContainer, opslagContainer, osContainer, processorFabrikantContainer, functieContainer, kleurContainer, aanbiederContainer, minAanbiedersContainer);
      qs("#filtersPanel")?.addEventListener("change", event => {
        const input = event.target.closest("input");
        if (!input) return;
        meet("filter_gebruikt", { filter: input.closest(".filter-card")?.dataset.filter || input.name, waarde: input.value === "all" ? "alle" : String(input.value).slice(0, 40) });
      });
      applyFilters();
      if (budgetContext.cap) initBudgetNote(budgetContext);
      initMeting(budgetContext.cap);
    })
    .catch(() => {
      [priceCard, behuizingCard, brandCard, gpuTierCard, ramCard, opslagCard, osCard, processorFabrikantCard, functieCard, kleurCard, aanbiederCard, minAanbiedersCard]
        .forEach(card => { card.hidden = true; });
    });
}

let budgetContext = null;

// ───────── budget: "Meer budget?" en het vangnet als er niets binnen past ─────────
const euroLabel = n => "€" + Math.round(n).toLocaleString("nl-NL");
const KLASSE_MEER = {
  Topklasse: "een desktop met een processor uit de topklasse",
  Krachtig:  "een desktop met een krachtigere processor",
};

// Wat krijg je met meer budget? Eerst een wens die binnen het budget niet te
// krijgen is (videokaart bij gamen, opslag), anders een hogere processorklasse.
function redenBovenBudget(buiten, binnen, a) {
  const gebruik = Array.isArray(a?.gebruik) ? a.gebruik : [];
  const kandidaten = [];
  if (gebruik.includes("gaming")) kandidaten.push(["een losse videokaart, die je nodig hebt om te gamen", d => voldoetAanGebruik(d, gebruik) === true]);
  else if (gebruik.includes("creatief")) kandidaten.push(["genoeg rekenkracht voor foto- en videobewerking", d => voldoetAanGebruik(d, gebruik) === true]);
  if (a?.opslag === "gemiddeld" || a?.opslag === "veel") kandidaten.push([a.opslag === "veel" ? "2 TB opslag" : "1 TB opslag", d => genoegOpslag(d, a.opslag) === true]);
  const wens = kandidaten.find(([, f]) => f(buiten) && !binnen.some(f))?.[0];
  if (wens) return wens;
  const rang = t => TIER_ORDER.indexOf(t ?? "Mid");
  return rang(buiten.tier) > Math.max(...binnen.map(d => rang(d.tier))) ? KLASSE_MEER[buiten.tier] ?? null : null;
}

function initBudgetNote({ cap, result: binnen, zonderGrens, budgetZonderMatch }) {
  const binnenLijst = binnen.filteredMatchedDesktops ?? [];
  const kaart = document.createElement("div");
  kaart.className = "budget-kaart";
  kaart.setAttribute("role", "note");

  if (budgetZonderMatch) {
    meet("budget_kaart", { actie: "niets_binnen_budget" });
    kaart.innerHTML = `<p><strong>Binnen ${euroLabel(cap)} vonden we van dit type geen desktop.</strong> Dit zijn de desktops die het best bij je wensen passen, vanaf de goedkoopste.</p>`;
    plaatsBudgetKaart(kaart);
    return;
  }

  // Alleen tonen als er boven het budget desktops zijn die duidelijk beter bij de
  // wensen passen (passcore zonder prijsdeel). Vergelijk met wat je binnen budget
  // echt ziet (2+ winkels), en tel erboven ook alleen wat je standaard ziet.
  const zichtbaarBinnen = binnenLijst.filter(d => (d.aanbieders ?? []).length >= DEFAULT_MIN_AANBIEDERS);
  const topBinnen = zichtbaarBinnen.length ? Math.max(...zichtbaarBinnen.map(d => d.wens)) : binnen.topWens;
  const drempel = (topBinnen ?? -Infinity) + BAND_BESTE;
  const beter = (zonderGrens.filteredMatchedDesktops ?? []).filter(d => parsePrice(d.prijs) > cap && d.wens >= drempel);
  const zichtbaar = beter.filter(d => (d.aanbieders ?? []).length >= DEFAULT_MIN_AANBIEDERS);
  const goedkoopsteBuiten = zichtbaar.map(d => parsePrice(d.prijs)).filter(Number.isFinite).sort((a, b) => a - b)[0];
  if (!goedkoopsteBuiten) return;
  const buitenBeste = kiesBesteMatch(zichtbaar, filterState.answers);
  const reden = buitenBeste ? redenBovenBudget(buitenBeste, zichtbaarBinnen, filterState.answers) : null;
  const meer = goedkoopsteBuiten - cap;
  let toontBuiten = false;
  const teken = () => {
    kaart.innerHTML = toontBuiten
      ? `<div class="budget-kaart-tekst"><strong>Je ziet nu desktops boven je budget</strong><span>Vanaf ${euroLabel(goedkoopsteBuiten)}. Liever binnen je budget blijven?</span></div>
         <button type="button" class="budget-kaart-btn">Terug naar desktops tot ${euroLabel(cap)}</button>`
      : reden
        ? `<div class="budget-kaart-tekst"><strong>Meer budget? Dan krijg je ${reden}</strong><span>Vanaf ${euroLabel(goedkoopsteBuiten)}, ${euroLabel(meer)} boven je budget.</span></div>
           <button type="button" class="budget-kaart-btn">Bekijk deze desktops</button>`
        : `<div class="budget-kaart-tekst"><strong>Meer budget? Er zijn desktops die nog beter bij je wensen passen</strong><span>Vanaf ${euroLabel(goedkoopsteBuiten)}, ${euroLabel(meer)} boven je budget.</span></div>
           <button type="button" class="budget-kaart-btn">Bekijk deze desktops</button>`;
    kaart.querySelector(".budget-kaart-btn").addEventListener("click", () => {
      toontBuiten = !toontBuiten;
      meet("budget_kaart", { actie: toontBuiten ? "klik_meer_budget" : "klik_terug", reden: reden ? "wens" : "score" });
      lijstSoort = toontBuiten ? "boven_budget" : "binnen_budget";
      filterState.baseMatches = toontBuiten ? beter : binnenLijst;
      filterState.priceGroups = computeDynamicPriceGroups(filterState.baseMatches, filterState.behuizingType);
      // Andere lijst = verse start: alle filters terug naar standaard, zoals "Wis filters".
      qs("#clearFiltersBtn")?.click();
      teken();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };
  teken();
  plaatsBudgetKaart(kaart);
  meet("budget_kaart", { actie: "getoond", reden: reden ? "wens" : "score", meer_euro: Math.round(meer) });
}

// De lijst wordt bij elk filter en elke sortering opnieuw getekend: zet de kaart
// daarna steeds terug direct na de eerste desktop.
function plaatsBudgetKaart(kaart) {
  const grid = qs("#otherMatchesGrid");
  if (!grid) return;
  const zet = () => {
    const items = [...grid.children].filter(el => el !== kaart && !el.classList.contains("rcard-skelet"));
    if (!items.length) return;
    const na = items[0];
    if (na.nextElementSibling === kaart) return;
    waker.disconnect();
    na.after(kaart);
    waker.observe(grid, { childList: true });
  };
  const waker = new MutationObserver(zet);
  waker.observe(grid, { childList: true });
  zet();
}

// ───────── meting (Umami, via shared/consent.js) ─────────
const meet = (naam, props) => window.phTrackEvent?.(naam, { categorie: "desktop", ...props });
let lijstSoort = "binnen_budget";

function initMeting(cap) {
  const budget = cap ? String(cap) : "geen_voorkeur";
  const zichtbaar = () => document.querySelectorAll("#otherMatchesGrid > .rcard").length;
  // Meegestuurd met elke winkelklik (shared/analytics.js)
  window.phResultaatContext = () => ({ budget, lijst: zichtbaar(), lijst_soort: lijstSoort });
  const beste = kiesBesteMatch(filterKeten().filter(genoegWinkels), filterState.answers);
  meet("resultaat_getoond", {
    budget, behuizing: filterState.behuizingType, os: filterState.answers?.os ?? "", lijst: zichtbaar(), beste_klasse: beste?.tier ?? "",
  });
}

document.addEventListener("DOMContentLoaded", initResultFilters);
