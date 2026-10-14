import { priceGroupsBySize, sizeGroupToAllowedSizes } from "./data.js";
import { computeMatchForPriceGroup, applyMinAanbiedersCascade, DEFAULT_MIN_AANBIEDERS } from "./matching.js";
import { computeDynamicPriceGroups, getResolutionTier, getStoredSelection, normalizeProducts, parsePrice, qs } from "./utils.js";
import { updateResultMatches } from "./result.js";
import { fetchProducts } from "./supabase.js";
import { computeCounts, renderFilterList } from "../../shared/filters.js";

const MIN_AANBIEDERS_OPTIONS = [1, 2, 3, 4, 5];

const filterState = {
  priceLabels: new Set(),
  sizes: new Set(),
  brands: new Set(),
  types: new Set(),
  resolutions: new Set(),
  hzOptions: new Set(),
  hdmiOptions: new Set(),
  kleuren: new Set(),
  aanbieder: new Set(),
  minAanbieders: DEFAULT_MIN_AANBIEDERS,
  baseMatches: [],
  answers: null,
  scores: null,
  bestType: "",
  sizeGroup: ""
};

// Price buckets are recomputed fresh from the live-fetched catalog on every
// results page load (not trusted from the quiz-time localStorage snapshot),
// since a stale/short-lived fetch during the quiz can produce fewer or
// narrower buckets than the catalog actually supports (e.g. missing the
// most expensive bucket entirely).
function getDynamicPriceGroups(sizeGroup) {
  if (Array.isArray(filterState.priceGroups) && filterState.priceGroups.length > 0) {
    return filterState.priceGroups;
  }
  return priceGroupsBySize[sizeGroup] || [];
}

// Price is just another optional narrowing filter, not a hard upfront wall:
// with no bucket selected, every TV matching the quiz answers is shown.
function getBaseMatches() {
  return filterState.baseMatches;
}

function getPriceScopedMatches() {
  const base = getBaseMatches();
  if (filterState.priceLabels.size === 0) return base;
  const groups = getDynamicPriceGroups(filterState.sizeGroup).filter(g => filterState.priceLabels.has(g.label));
  return base.filter(tv => {
    const price = parsePrice(tv.prijs);
    return groups.some(g => price >= g.min && (price < g.max || g.max === Number.POSITIVE_INFINITY));
  });
}

// Basis voor de tellingen op alle secundaire filterkaarten (grootte, merk,
// type, ...): prijs-gescoped én al beperkt tot de huidige "aantal winkels"-
// drempel, zodat de getoonde aantallen kloppen met wat er na alle filters
// daadwerkelijk overblijft — niet ook nog 1-winkel-producten meetellen die
// het minAanbieders-filter er sowieso al uitzeeft.
// Welke opties een filterkaart toont: alles uit de quizuitslag (alleen de
// winkelregel telt mee), NIET beperkt door de andere gekozen filters. Zo
// blijft een optie die door bv. een prijskeuze op 0 komt grijs in beeld
// staan in plaats van te verdwijnen. Het aantal erachter telt wel met alle
// andere filters.
function getSecondaryScopedMatches() {
  return getBaseScopedByMinAanbieders();
}

// Voor de prijsfilter-kaart zelf: die moet, net als de andere secundaire
// kaarten, alleen tellen wat er overblijft na de "aantal winkels"-drempel —
// maar (in tegenstelling tot de rest) NIET al prijs-gescoped zijn, want de
// prijsfilter berekent juist zijn eigen buckets uit de ongescoopte basis.
function getBaseScopedByMinAanbieders() {
  return getBaseMatches().filter(tv => (tv.aanbieders ?? []).length >= filterState.minAanbieders);
}

// ─── Facetten ────────────────────────────────────────────────────────────────
// Zoals bij grote webwinkels: binnen één filter is het "of", tussen filters
// "en". Het aantal naast een optie is wat je krijgt als je die optie aanklikt,
// gegeven alle ANDERE gekozen filters (de eigen kaart telt niet mee). Een optie
// met 0 wordt grijs (shared/filters.js). Zo kun je nooit op "geen resultaten"
// uitkomen door twee filters te combineren.
const FACETTEN = {
  size:       { set: () => filterState.sizes,       waarde: tv => tv.grootte },
  brand:      { set: () => filterState.brands,      waarde: tv => formatBrandLabel(tv.merk) },
  type:       { set: () => filterState.types,       waarde: tv => tv.type },
  resolution: { set: () => filterState.resolutions, waarde: tv => getResolutionTier(tv) },
  hz:         { set: () => filterState.hzOptions,   waarde: tv => tv.Hz },
  hdmi:       { set: () => filterState.hdmiOptions, waarde: tv => tv.hdmiPoorten },
  kleur:      { set: () => filterState.kleuren,     waarde: tv => normalizeKleur(tv.kleur) },
  aanbieder:  { set: () => filterState.aanbieder,   waarde: tv => (tv.aanbieders ?? []).map(a => a.winkel) },
};

function binnenPrijs(tv) {
  if (filterState.priceLabels.size === 0) return true;
  const price = parsePrice(tv.prijs);
  return getDynamicPriceGroups(filterState.sizeGroup)
    .filter(g => filterState.priceLabels.has(g.label))
    .some(g => price >= g.min && (price < g.max || g.max === Number.POSITIVE_INFINITY));
}

function voldoetAanFacet(tv, sleutel) {
  const set = FACETTEN[sleutel].set();
  if (set.size === 0) return true;
  const w = FACETTEN[sleutel].waarde(tv);
  return Array.isArray(w) ? w.some(x => set.has(x)) : set.has(w);
}

/**
 * Alle producten die door de gekozen filters komen, behalve het filter
 * `behalve` ("price", een facet-sleutel, of "min" voor het winkelaantal).
 */
function matchesBehalve(behalve) {
  return getBaseMatches().filter(tv =>
    (behalve === "price" || binnenPrijs(tv)) &&
    Object.keys(FACETTEN).every(k => k === behalve || voldoetAanFacet(tv, k)) &&
    (behalve === "min" || (tv.aanbieders ?? []).length >= filterState.minAanbieders)
  );
}

function formatBrandLabel(brand) {
  const raw = String(brand ?? "").trim();
  if (!raw) return "";
  if (raw === raw.toUpperCase()) return raw;
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function collectSizeOptions(matches) {
  const set = new Set();
  matches.forEach(tv => { if (tv.grootte) set.add(tv.grootte); });
  return Array.from(set).sort((a, b) => a - b);
}

function renderSizeOptions(container, sizeCard, matches, tellen = matches) {
  const sizes = collectSizeOptions(matches);
  if (sizes.length <= 1) { container.innerHTML = ""; sizeCard.hidden = true; return; }
  const counts = computeCounts(tellen, tv => tv.grootte);
  renderFilterList(container, sizeCard, {
    items: sizes,
    counts,
    filterName: "sizeFilter",
    stateSet: filterState.sizes,
    labelFn: size => `${size}"`,
    allLabel: "Alle maten",
    searchPlaceholder: "Zoek een maat...",
  });
}

function collectBrandOptions(matches) {
  const brandSet = new Set();
  matches.forEach(tv => {
    const label = formatBrandLabel(tv.merk);
    if (label) brandSet.add(label);
  });
  return Array.from(brandSet).sort((a, b) => a.localeCompare(b, "nl"));
}

function collectTypeOptions(matches) {
  const set = new Set();
  matches.forEach(tv => { if (tv.type) set.add(tv.type); });
  const order = ["LED", "Mini LED", "QLED", "Neo QLED", "OLED"];
  return order.filter(t => set.has(t));
}

function collectResolutionOptions(matches) {
  const set = new Set();
  matches.forEach(tv => {
    const tier = getResolutionTier(tv);
    if (tier) set.add(tier);
  });
  const order = ["HD Ready", "Full HD", "2.4K", "4K", "8K"];
  return order.filter(r => set.has(r));
}

function collectHzOptions(matches) {
  const set = new Set();
  matches.forEach(tv => { if (tv.Hz) set.add(tv.Hz); });
  return Array.from(set).sort((a, b) => a - b);
}

function collectHdmiOptions(matches) {
  const set = new Set();
  matches.forEach(tv => { if (tv.hdmiPoorten) set.add(tv.hdmiPoorten); });
  return Array.from(set).sort((a, b) => a - b);
}

// Normaliseert combinaties als "Zwart, Metallic" en "Metallic, Zwart" naar
// dezelfde canonieke waarde, zodat ze niet als 2 losse filteropties verschijnen.
function normalizeKleur(kleur) {
  const raw = String(kleur ?? "").trim();
  if (!raw) return "";
  return raw.split(",").map(s => s.trim()).filter(Boolean).sort().join(", ");
}

function collectKleurOptions(matches) {
  const set = new Set();
  matches.forEach(tv => { const k = normalizeKleur(tv.kleur); if (k) set.add(k); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "nl"));
}

function collectAanbiederOptions(matches) {
  const set = new Set();
  matches.forEach(tv => {
    (tv.aanbieders ?? []).forEach(a => set.add(a.winkel));
  });
  return Array.from(set).sort();
}

function renderPriceOptions(container, priceCard, sizeGroup) {
  const groups = getDynamicPriceGroups(sizeGroup);

  // Only show price buckets that actually contain a matching TV for the
  // current quiz answers — otherwise users click a bucket that can never
  // show a result. If there's only one (or zero) non-empty bucket there's
  // nothing meaningful to narrow, so hide the whole filter card.
  const base = matchesBehalve("price");
  const groupForPrice = price => groups.find(g => price >= g.min && (price < g.max || g.max === Number.POSITIVE_INFINITY));
  const counts = computeCounts(base, tv => groupForPrice(parsePrice(tv.prijs))?.label);
  const opBasis = computeCounts(getBaseScopedByMinAanbieders(), tv => groupForPrice(parsePrice(tv.prijs))?.label);
  const labels = groups.filter(g => opBasis.has(g.label) || filterState.priceLabels.has(g.label)).map(g => g.label);

  if (labels.length <= 1) {
    container.innerHTML = "";
    priceCard.hidden = true;
    return;
  }

  renderFilterList(container, priceCard, {
    items: labels,
    counts,
    filterName: "priceFilter",
    stateSet: filterState.priceLabels,
    labelFn: label => `€ ${label}`,
    allLabel: "Alle prijzen",
  });
}

function renderBrandOptions(container, brandCard, matches, tellen = matches) {
  const brands = collectBrandOptions(matches);
  if (brands.length === 0) { container.innerHTML = ""; brandCard.hidden = true; return; }
  const counts = computeCounts(tellen, tv => formatBrandLabel(tv.merk));
  renderFilterList(container, brandCard, {
    items: brands,
    counts,
    filterName: "brandFilter",
    stateSet: filterState.brands,
    allLabel: "Alle merken",
    searchPlaceholder: "Zoek een merk...",
  });
}

function renderTypeOptions(container, typeCard, matches, tellen = matches) {
  const types = collectTypeOptions(matches);
  if (types.length === 0) { container.innerHTML = ""; typeCard.hidden = true; return; }
  const counts = computeCounts(tellen, tv => tv.type);
  renderFilterList(container, typeCard, {
    items: types,
    counts,
    filterName: "typeFilter",
    stateSet: filterState.types,
    allLabel: "Alle types",
  });
}

function renderResolutionOptions(container, resolutionCard, matches, tellen = matches) {
  const resolutions = collectResolutionOptions(matches);
  if (resolutions.length === 0) { container.innerHTML = ""; resolutionCard.hidden = true; return; }
  const counts = computeCounts(tellen, tv => getResolutionTier(tv));
  renderFilterList(container, resolutionCard, {
    items: resolutions,
    counts,
    filterName: "resolutionFilter",
    stateSet: filterState.resolutions,
  });
}

function renderHzOptions(container, hzCard, matches, tellen = matches) {
  const hzValues = collectHzOptions(matches);
  if (hzValues.length === 0) { container.innerHTML = ""; hzCard.hidden = true; return; }
  const counts = computeCounts(tellen, tv => tv.Hz);
  renderFilterList(container, hzCard, {
    items: hzValues,
    counts,
    filterName: "hzFilter",
    stateSet: filterState.hzOptions,
    labelFn: hz => `${hz} Hz`,
  });
}

function renderHdmiOptions(container, hdmiCard, matches, tellen = matches) {
  const hdmiValues = collectHdmiOptions(matches);
  if (hdmiValues.length === 0) { container.innerHTML = ""; hdmiCard.hidden = true; return; }
  const counts = computeCounts(tellen, tv => tv.hdmiPoorten);
  renderFilterList(container, hdmiCard, {
    items: hdmiValues,
    counts,
    filterName: "hdmiFilter",
    stateSet: filterState.hdmiOptions,
    labelFn: count => `${count} HDMI`,
  });
}

function renderKleurOptions(container, kleurCard, matches, tellen = matches) {
  const kleuren = collectKleurOptions(matches);
  if (kleuren.length === 0) { container.innerHTML = ""; kleurCard.hidden = true; return; }
  const counts = computeCounts(tellen, tv => normalizeKleur(tv.kleur));
  renderFilterList(container, kleurCard, {
    items: kleuren,
    counts,
    filterName: "kleurFilter",
    stateSet: filterState.kleuren,
  });
}

// Filtert alle actieve zijbalk-filters behalve minAanbieders — de basis
// waartegen zowel de minAanbieders-opties (met counts) als de cascade-
// fallback in applyFilters() worden berekend.
function getFilteredExclMinAanbieders() {
  return matchesBehalve("min");
}

function renderMinAanbiedersOptions(container, card) {
  const matches = matchesBehalve("min");
  const options = MIN_AANBIEDERS_OPTIONS.map(n => ({
    n,
    count: matches.filter(tv => (tv.aanbieders ?? []).length >= n).length,
  })).filter(o => o.count > 0);

  // Corrigeer de drempel naar een geldige optie VOORDAT de kaart eventueel
  // wordt verborgen (bv. na een cascade-fallback of een gewijzigd ander
  // filter) — anders blijft filterState.minAanbieders op een onhaalbare
  // waarde staan en gaan de kaarten hieronder ten onrechte allemaal leeg
  // renderen.
  if (options.length > 0 && !options.some(o => o.n === filterState.minAanbieders)) {
    const fallback = options.find(o => o.n === DEFAULT_MIN_AANBIEDERS) || options[options.length - 1];
    filterState.minAanbieders = fallback.n;
  }

  // Niks om te kiezen als elke TV toch al bij evenveel winkels ligt.
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

// Zet de zichtbare selectie gelijk aan `n` zonder een change-event te vuren
// (gebruikt door de cascade-fallback in applyFilters, die zelf al opnieuw
// rendert/matcht en dus geen extra ronde via het event mag triggeren).
function syncMinAanbiedersUI(n) {
  filterState.minAanbieders = n;
  const container = qs("#minAanbiedersFilterOptions");
  if (!container) return;
  container.querySelectorAll('input[name="minAanbiedersFilter"]').forEach(input => {
    input.checked = Number(input.value) === n;
  });
}

function renderAanbiederOptions(container, aanbiederCard, matches, tellen = matches) {
  const aanbieders = collectAanbiederOptions(matches);
  if (aanbieders.length === 0) { container.innerHTML = ""; aanbiederCard.hidden = true; return; }
  const counts = computeCounts(tellen, tv => (tv.aanbieders ?? []).map(a => a.winkel));
  renderFilterList(container, aanbiederCard, {
    items: aanbieders,
    counts,
    filterName: "aanbiederFilter",
    stateSet: filterState.aanbieder,
  });
}

function updateClearFiltersBtn() {
  const btn = qs("#clearFiltersBtn");
  if (!btn) return;
  const hasActive = filterState.priceLabels.size > 0 || filterState.sizes.size > 0 || filterState.brands.size > 0 || filterState.types.size > 0 ||
    filterState.resolutions.size > 0 || filterState.hzOptions.size > 0 || filterState.hdmiOptions.size > 0 ||
    filterState.kleuren.size > 0 ||
    filterState.aanbieder.size > 0 ||
    filterState.minAanbieders !== DEFAULT_MIN_AANBIEDERS;
  btn.hidden = !hasActive;
}

function applyFilters() {
  const filtered = getFilteredExclMinAanbieders();
  const { effectiveMin, result: final } = applyMinAanbiedersCascade(filtered, filterState.minAanbieders);

  if (effectiveMin !== filterState.minAanbieders) {
    syncMinAanbiedersUI(effectiveMin);
  }

  updateClearFiltersBtn();
  updateResultMatches(final, filterState.answers, filterState.bestType, filterState.scores, filterState.sizeGroup);
}

// Basislijst per kaart: een optie verschijnt zolang hij binnen de quizuitslag
// voorkomt (de lijst springt dus niet), het aantal komt uit matchesBehalve().
function renderAllSecondary() {
  const kaart = naam => qs(`.filter-card[data-filter='${naam}']`);
  // Eerst het winkelaantal: corrigeert filterState.minAanbieders zo nodig
  // (bv. naar 1 als elke tv maar bij één winkel ligt). Pas daarna de basis
  // bepalen, anders is die leeg en verdwijnen alle andere filterkaarten.
  renderMinAanbiedersOptions(qs("#minAanbiedersFilterOptions"), kaart("min-aanbieders"));
  const basis = getSecondaryScopedMatches();
  const teken = (render, container, naam) => {
    const tellen = matchesBehalve(naam);
    render(container, kaart(naam), basis, tellen);
  };
  teken(renderSizeOptions, qs("#sizeFilterOptions"), "size");
  teken(renderBrandOptions, qs("#brandFilterOptions"), "brand");
  teken(renderTypeOptions, qs("#typeFilterOptions"), "type");
  teken(renderResolutionOptions, qs("#resolutionFilterOptions"), "resolution");
  teken(renderHzOptions, qs("#hzFilterOptions"), "hz");
  teken(renderHdmiOptions, qs("#hdmiFilterOptions"), "hdmi");
  teken(renderKleurOptions, qs("#kleurFilterOptions"), "kleur");
  teken(renderAanbiederOptions, qs("#aanbiederFilterOptions"), "aanbieder");
  renderPriceOptions(qs("#priceFilterOptions"), kaart("price"), filterState.sizeGroup);
}

function initFilterEvents(priceContainer, sizeContainer, brandContainer, typeContainer, resolutionContainer, hzContainer, hdmiContainer, kleurContainer, aanbiederContainer, minAanbiedersContainer) {


  minAanbiedersContainer.addEventListener("change", event => {
    const input = event.target.closest("input[type=radio]");
    if (!input) return;
    filterState.minAanbieders = parseInt(input.value, 10);
    // Eerst matchen (kan minAanbieders zelf nog cascaden bij 0 resultaten),
    // dan pas de secundaire tellingen tekenen met de uiteindelijke drempel.
    applyFilters();
    renderAllSecondary();
  });

  priceContainer.addEventListener("change", event => {
    const input = event.target.closest("input[type=checkbox]");
    if (!input) return;

    if (input.value === "all") {
      if (input.checked) {
        filterState.priceLabels.clear();
        renderPriceOptions(priceContainer, qs(".filter-card[data-filter='price']"), filterState.sizeGroup);
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
        renderPriceOptions(priceContainer, qs(".filter-card[data-filter='price']"), filterState.sizeGroup);
      } else {
        const allInput = priceContainer.querySelector('input[value="all"]');
        if (allInput) allInput.checked = false;
      }
    }

    applyFilters();
    renderAllSecondary();
  });

  sizeContainer.addEventListener("change", event => {
    const input = event.target.closest("input[type=checkbox]");
    if (!input) return;

    if (input.value === "all") {
      if (input.checked) {
        filterState.sizes.clear();
        renderSizeOptions(sizeContainer, qs(".filter-card[data-filter='size']"), getSecondaryScopedMatches());
      } else if (filterState.sizes.size === 0) {
        input.checked = true;
      }
    } else {
      const sz = parseInt(input.value, 10);
      if (input.checked) {
        filterState.sizes.add(sz);
      } else {
        filterState.sizes.delete(sz);
      }
      if (filterState.sizes.size === 0) {
        renderSizeOptions(sizeContainer, qs(".filter-card[data-filter='size']"), getSecondaryScopedMatches());
      } else {
        const allInput = sizeContainer.querySelector('input[value="all"]');
        if (allInput) allInput.checked = false;
      }
    }
    applyFilters();
  });

  brandContainer.addEventListener("change", event => {
    const input = event.target.closest("input[type=checkbox]");
    if (!input) return;

    if (input.value === "all") {
      if (input.checked) {
        filterState.brands.clear();
        renderBrandOptions(brandContainer, qs(".filter-card[data-filter='brand']"), getSecondaryScopedMatches());
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
        renderBrandOptions(brandContainer, qs(".filter-card[data-filter='brand']"), getSecondaryScopedMatches());
      } else {
        const allInput = brandContainer.querySelector('input[value="all"]');
        if (allInput) allInput.checked = false;
      }
    }
    applyFilters();
  });

  typeContainer.addEventListener("change", event => {
    const input = event.target.closest("input[type=checkbox]");
    if (!input) return;

    if (input.value === "all") {
      if (input.checked) {
        filterState.types.clear();
        renderTypeOptions(typeContainer, qs(".filter-card[data-filter='type']"), getSecondaryScopedMatches());
      } else if (filterState.types.size === 0) {
        input.checked = true;
      }
    } else {
      if (input.checked) {
        filterState.types.add(input.value);
      } else {
        filterState.types.delete(input.value);
      }
      if (filterState.types.size === 0) {
        renderTypeOptions(typeContainer, qs(".filter-card[data-filter='type']"), getSecondaryScopedMatches());
      } else {
        const allInput = typeContainer.querySelector('input[value="all"]');
        if (allInput) allInput.checked = false;
      }
    }
    applyFilters();
  });

  resolutionContainer.addEventListener("change", event => {
    const input = event.target.closest("input[type=checkbox]");
    if (!input) return;

    if (input.value === "all") {
      if (input.checked) {
        filterState.resolutions.clear();
        renderResolutionOptions(resolutionContainer, qs(".filter-card[data-filter='resolution']"), getSecondaryScopedMatches());
      } else if (filterState.resolutions.size === 0) {
        input.checked = true;
      }
    } else {
      if (input.checked) {
        filterState.resolutions.add(input.value);
      } else {
        filterState.resolutions.delete(input.value);
      }
      if (filterState.resolutions.size === 0) {
        renderResolutionOptions(resolutionContainer, qs(".filter-card[data-filter='resolution']"), getSecondaryScopedMatches());
      } else {
        const allInput = resolutionContainer.querySelector('input[value="all"]');
        if (allInput) allInput.checked = false;
      }
    }
    applyFilters();
  });

  hzContainer.addEventListener("change", event => {
    const input = event.target.closest("input[type=checkbox]");
    if (!input) return;

    if (input.value === "all") {
      if (input.checked) {
        filterState.hzOptions.clear();
        renderHzOptions(hzContainer, qs(".filter-card[data-filter='hz']"), getSecondaryScopedMatches());
      } else if (filterState.hzOptions.size === 0) {
        input.checked = true;
      }
    } else {
      const hz = parseInt(input.value, 10);
      if (input.checked) {
        filterState.hzOptions.add(hz);
      } else {
        filterState.hzOptions.delete(hz);
      }
      if (filterState.hzOptions.size === 0) {
        renderHzOptions(hzContainer, qs(".filter-card[data-filter='hz']"), getSecondaryScopedMatches());
      } else {
        const allInput = hzContainer.querySelector('input[value="all"]');
        if (allInput) allInput.checked = false;
      }
    }
    applyFilters();
  });

  hdmiContainer.addEventListener("change", event => {
    const input = event.target.closest("input[type=checkbox]");
    if (!input) return;

    if (input.value === "all") {
      if (input.checked) {
        filterState.hdmiOptions.clear();
        renderHdmiOptions(hdmiContainer, qs(".filter-card[data-filter='hdmi']"), getSecondaryScopedMatches());
      } else if (filterState.hdmiOptions.size === 0) {
        input.checked = true;
      }
    } else {
      const count = parseInt(input.value, 10);
      if (input.checked) {
        filterState.hdmiOptions.add(count);
      } else {
        filterState.hdmiOptions.delete(count);
      }
      if (filterState.hdmiOptions.size === 0) {
        renderHdmiOptions(hdmiContainer, qs(".filter-card[data-filter='hdmi']"), getSecondaryScopedMatches());
      } else {
        const allInput = hdmiContainer.querySelector('input[value="all"]');
        if (allInput) allInput.checked = false;
      }
    }
    applyFilters();
  });

  kleurContainer.addEventListener("change", event => {
    const input = event.target.closest("input[type=checkbox]");
    if (!input) return;

    if (input.value === "all") {
      if (input.checked) {
        filterState.kleuren.clear();
        renderKleurOptions(kleurContainer, qs(".filter-card[data-filter='kleur']"), getSecondaryScopedMatches());
      } else if (filterState.kleuren.size === 0) {
        input.checked = true;
      }
    } else {
      if (input.checked) {
        filterState.kleuren.add(input.value);
      } else {
        filterState.kleuren.delete(input.value);
      }
      if (filterState.kleuren.size === 0) {
        renderKleurOptions(kleurContainer, qs(".filter-card[data-filter='kleur']"), getSecondaryScopedMatches());
      } else {
        const allInput = kleurContainer.querySelector('input[value="all"]');
        if (allInput) allInput.checked = false;
      }
    }
    applyFilters();
  });

  aanbiederContainer.addEventListener("change", event => {
    const input = event.target.closest("input[type=checkbox]");
    if (!input) return;

    if (input.value === "all") {
      if (input.checked) {
        filterState.aanbieder.clear();
        renderAanbiederOptions(aanbiederContainer, qs(".filter-card[data-filter='aanbieder']"), getSecondaryScopedMatches());
      } else if (filterState.aanbieder.size === 0) {
        input.checked = true;
      }
    } else {
      if (input.checked) {
        filterState.aanbieder.add(input.value);
      } else {
        filterState.aanbieder.delete(input.value);
      }
      if (filterState.aanbieder.size === 0) {
        renderAanbiederOptions(aanbiederContainer, qs(".filter-card[data-filter='aanbieder']"), getSecondaryScopedMatches());
      } else {
        const allInput = aanbiederContainer.querySelector('input[value="all"]');
        if (allInput) allInput.checked = false;
      }
    }
    applyFilters();
  });

  [priceContainer, sizeContainer, brandContainer, typeContainer, resolutionContainer, hzContainer, hdmiContainer, kleurContainer, aanbiederContainer, minAanbiedersContainer]
    .forEach(c => c.addEventListener("change", () => renderAllSecondary()));

  const clearBtn = qs("#clearFiltersBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      filterState.priceLabels.clear();
      filterState.sizes.clear();
      filterState.brands.clear();
      filterState.types.clear();
      filterState.resolutions.clear();
      filterState.hzOptions.clear();
      filterState.hdmiOptions.clear();
      filterState.kleuren.clear();
      filterState.aanbieder.clear();
      filterState.minAanbieders = DEFAULT_MIN_AANBIEDERS;
      renderPriceOptions(priceContainer, qs(".filter-card[data-filter='price']"), filterState.sizeGroup);
      renderAllSecondary();
      applyFilters();
    });
  }
}

function initResultFilters() {
  const priceContainer = qs("#priceFilterOptions");
  const sizeContainer = qs("#sizeFilterOptions");
  const brandContainer = qs("#brandFilterOptions");
  const typeContainer = qs("#typeFilterOptions");
  const resolutionContainer = qs("#resolutionFilterOptions");
  const hzContainer = qs("#hzFilterOptions");
  const hdmiContainer = qs("#hdmiFilterOptions");
  const kleurContainer = qs("#kleurFilterOptions");
  const aanbiederContainer = qs("#aanbiederFilterOptions");
  const minAanbiedersContainer = qs("#minAanbiedersFilterOptions");

  const priceCard = qs(".filter-card[data-filter='price']");
  const sizeCard = qs(".filter-card[data-filter='size']");
  const brandCard = qs(".filter-card[data-filter='brand']");
  const typeCard = qs(".filter-card[data-filter='type']");
  const resolutionCard = qs(".filter-card[data-filter='resolution']");
  const hzCard = qs(".filter-card[data-filter='hz']");
  const hdmiCard = qs(".filter-card[data-filter='hdmi']");
  const kleurCard = qs(".filter-card[data-filter='kleur']");
  const aanbiederCard = qs(".filter-card[data-filter='aanbieder']");
  const minAanbiedersCard = qs(".filter-card[data-filter='min-aanbieders']");

  if (!priceContainer || !sizeContainer || !brandContainer || !typeContainer || !resolutionContainer || !hzContainer || !hdmiContainer || !kleurContainer || !aanbiederContainer || !minAanbiedersContainer) return;
  if (!priceCard || !sizeCard || !brandCard || !typeCard || !resolutionCard || !hzCard || !hdmiCard || !kleurCard || !aanbiederCard || !minAanbiedersCard) return;

  const stored = getStoredSelection();
  const answersData = localStorage.getItem("answers");
  const scoresData = localStorage.getItem("scores");

  if (!stored.sizeGroup || !answersData || !scoresData) return;

  filterState.answers = JSON.parse(answersData);
  filterState.scores = JSON.parse(scoresData);
  filterState.bestType = localStorage.getItem("bestType") || "";
  filterState.sizeGroup = stored.sizeGroup || "";

  fetchProducts()
    .then(rawProducts => {
      const tvs = normalizeProducts(rawProducts);
      filterState.priceGroups = computeDynamicPriceGroups(tvs, stored.sizeGroup, sizeGroupToAllowedSizes);

      // Ignore the ambilight preference when computing the base match pool.
      // The ambilight notice on the result page already informs the user;
      // restricting the pool here can wipe out all results when ambilight
      // TVs don't satisfy the Hz/resolution filters.
      const answersForFilter = { ...filterState.answers, ambilight: "" };
      // Budget uit de quiz (maximumbedrag) is een echte grens, net als in de quiz zelf.
      // Past er in deze maat niets binnen, dan zonder grens (zelfde vangnet als de quiz).
      const cap = Number(filterState.answers?.budget) || null;
      const zonderGrens = computeMatchForPriceGroup(tvs, stored.sizeGroup, null, answersForFilter, filterState.scores);
      let result = cap ? computeMatchForPriceGroup(tvs, stored.sizeGroup, { min: 0, max: cap }, answersForFilter, filterState.scores) : zonderGrens;
      const budgetZonderMatch = Boolean(cap && !(result.filteredMatchedTVs?.length));
      if (budgetZonderMatch) result = zonderGrens;
      filterState.baseMatches = Array.isArray(result.filteredMatchedTVs) ? result.filteredMatchedTVs : [];
      if (cap) {
        filterState.bestType = result.bestType || filterState.bestType;
        initBudgetNote(cap, result, zonderGrens, budgetZonderMatch);
      }

      // Fallback: if the live computation yields nothing, seed the pool with
      // the TVs that were already matched during the quiz. This ensures the
      // filter panel always shows options regardless of whether the dynamic
      // computation succeeds.
      if (filterState.baseMatches.length === 0) {
        const storedTVsData = localStorage.getItem("filteredMatchedTVs");
        if (storedTVsData) {
          try {
            const storedTVs = JSON.parse(storedTVsData);
            if (Array.isArray(storedTVs) && storedTVs.length > 0) {
              filterState.baseMatches = storedTVs;
            }
          } catch {
            // ignore parse errors
          }
        }
      }

      if (filterState.baseMatches.length === 0) return;

      // No price bucket selected by default: show every matching TV, sorted
      // by relevance/price, and let the user optionally narrow by budget.
      filterState.priceLabels = new Set();

      // Vóór alle andere tellingen: bepaalt/valideert filterState.minAanbieders
      // (default 2, of een fallback als dat geen geldige optie is), zodat
      // zowel de prijs-buckets als getSecondaryScopedMatches() hieronder de
      // uiteindelijke drempel gebruiken.
      renderAllSecondary();
      initFilterEvents(priceContainer, sizeContainer, brandContainer, typeContainer, resolutionContainer, hzContainer, hdmiContainer, kleurContainer, aanbiederContainer, minAanbiedersContainer);
      applyFilters();
    })
    .catch(() => {
      [priceCard, sizeCard, brandCard, typeCard, resolutionCard, hzCard, hdmiCard, kleurCard, aanbiederCard, minAanbiedersCard].forEach(card => { card.hidden = true; });
    });
}


// ───────── budget: "Meer budget?" en het vangnet als er niets binnen past ─────────
const TYPE_VOORDEEL = {
  "OLED": "Diep zwart, rijk contrast en een brede kijkhoek",
  "Mini LED": "Fel beeld met sterk contrast, ook overdag",
  "QLED": "Helder beeld en levendige kleuren",
  "Neo QLED": "Fel beeld met sterk contrast, ook overdag",
  "LED": "Een degelijk en betaalbaar beeld",
};
const euroLabel = n => "€" + Math.round(n).toLocaleString("nl-NL");

function initBudgetNote(cap, binnen, zonderGrens, budgetZonderMatch) {
  const binnenLijst = binnen.filteredMatchedTVs ?? [];
  const buitenLijst = zonderGrens.filteredMatchedTVs ?? [];
  const kaart = document.createElement("div");
  kaart.className = "budget-kaart";
  kaart.setAttribute("role", "note");

  if (budgetZonderMatch) {
    kaart.innerHTML = `<p><strong>Binnen ${euroLabel(cap)} vonden we in deze maat geen tv.</strong> Dit zijn de tv's die het best bij je wensen passen, vanaf de goedkoopste.</p>`;
    plaatsBudgetKaart(kaart);
    return;
  }

  // Alleen tonen als er zonder budgetgrens een ander, beter passend type wint.
  const anderType = zonderGrens.bestType && zonderGrens.bestType !== binnen.bestType;
  const goedkoopsteBuiten = buitenLijst.map(t => parsePrice(t.prijs)).filter(Number.isFinite).sort((a, b) => a - b)[0];
  if (!anderType || !goedkoopsteBuiten || goedkoopsteBuiten <= cap) return;

  const type = zonderGrens.bestType;
  const meer = goedkoopsteBuiten - cap;
  let toontBuiten = false;
  const teken = () => {
    kaart.innerHTML = toontBuiten
      ? `<div class="budget-kaart-tekst"><strong>Je ziet nu ${type}-tv's boven je budget</strong><span>Vanaf ${euroLabel(goedkoopsteBuiten)}. Liever binnen je budget blijven?</span></div>
         <button type="button" class="budget-kaart-btn">Terug naar tv's tot ${euroLabel(cap)}</button>`
      : `<div class="budget-kaart-tekst"><strong>Meer budget? Dan past een ${type} het best bij je wensen</strong><span>${TYPE_VOORDEEL[type] ?? "Een stap beter beeld"}. Vanaf ${euroLabel(goedkoopsteBuiten)}, ${euroLabel(meer)} boven je budget.</span></div>
         <button type="button" class="budget-kaart-btn">Bekijk ${type}-tv's</button>`;
    kaart.querySelector(".budget-kaart-btn").addEventListener("click", () => {
      toontBuiten = !toontBuiten;
      filterState.baseMatches = toontBuiten ? buitenLijst : binnenLijst;
      filterState.bestType = toontBuiten ? zonderGrens.bestType : binnen.bestType;
      renderAllSecondary();
      applyFilters();
      teken();
      qs("#resultTitle")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };
  teken();
  plaatsBudgetKaart(kaart);
}

// De lijst wordt bij elk filter en elke sortering opnieuw getekend (innerHTML): zet de kaart
// daarna steeds terug na de derde tv (of na de laatste als er minder zijn). Hij hoort bij
// de lijst, zodat de kop en de filterkolom niet verschuiven.
function plaatsBudgetKaart(kaart) {
  const grid = qs("#otherMatchesGrid");
  if (!grid) return;
  const zet = () => {
    const items = [...grid.children].filter(el => el !== kaart && !el.classList.contains("rcard-skelet"));
    if (!items.length) return;
    const na = items[Math.min(2, items.length - 1)];
    if (na.nextElementSibling === kaart) return;
    waker.disconnect();
    na.after(kaart);
    waker.observe(grid, { childList: true });
  };
  const waker = new MutationObserver(zet);
  waker.observe(grid, { childList: true });
  zet();
}

document.addEventListener("DOMContentLoaded", initResultFilters);
