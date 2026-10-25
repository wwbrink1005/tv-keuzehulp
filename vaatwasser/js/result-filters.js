import { priceGroupsFallback } from "./data.js";
import {
  matchVaatwassers, heeftAfwasprogramma, kiesBesteMatch, heeftWens, extraWensen, lijst,
  applyMinAanbiedersCascade, BAND_BESTE, DEFAULT_MIN_AANBIEDERS,
} from "./matching.js";
import { computeDynamicPriceGroups, computeDynamicDimensionGroups, normalizeProducts, parsePrice, qs } from "./utils.js";
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
  plaatsingDetails: new Set(),
  couvertsSet:   new Set(),
  brands:        new Set(),
  energieLabels: new Set(),
  droogsystemen: new Set(),
  bestekTypes:   new Set(),
  kleuren:       new Set(),
  // 10 Ja/Nee-eigenschappen samengevoegd tot 1 "Functies"-kaart (zie
  // FUNCTIE_DEFINITIES) — waarvan er 8 ook als quiz-vraag (Q5) voorkomen, en
  // automatische deuropening/vloerindicatielampje bewust alleen hier zitten
  // (te niche voor een verplichte quizvraag, wel de moeite waard als filter).
  functies:      new Set(),
  programmas:    new Set(),
  breedteLabels: new Set(),
  diepteLabels:  new Set(),
  hoogteLabels:  new Set(),
  aanbieder:     new Set(),
  baseMatches:   [],
  answers:       null,
  bestType:      "",
};

const PROGRAMMA_LABELS = {
  eco: "Eco", intensief: "Intensief", snel: "Snel", stil: "Stil",
  voorwas: "Voorwas", glas: "Glas/Breekbaar",
};

const FUNCTIE_DEFINITIES = [
  { key: "kinderslot",              label: "Kinderslot",                  check: v => v.kinderslot === "Ja" },
  { key: "halve-lading",             label: "Halve lading",                check: v => v.halveLading === "Ja" },
  { key: "wifi",                     label: "Wifi/app-bediening",          check: v => v.wifi === "Ja" },
  { key: "verstelbare-bovenkorf",    label: "In hoogte verstelbare bovenkorf", check: v => v.verstelbareBovenkorf === "Ja" },
  { key: "aquastop",                 label: "AquaStop",                    check: v => v.aquastop === "Ja" },
  { key: "inverter",                 label: "Inverter motor",              check: v => v.inverter === "Ja" },
  { key: "glasbescherming",          label: "Glasbescherming",             check: v => v.glasbescherming === "Ja" },
  { key: "droog",                    label: "Droogt beter (deur gaat vanzelf open)", check: v => v.droogtBeter === true },
  { key: "besteklade",               label: "Besteklade",                  check: v => heeftWens(v, "besteklade") === true },
  { key: "vloerlampje",              label: "Vloerindicatielampje",        check: v => v.vloerlampje === "Ja" },
];

// Price buckets are recomputed fresh from the live-fetched, plaatsing-
// gefilterde catalogus op elke resultaatpagina-load, nooit vertrouwd op de
// quiz-time localStorage-snapshot.
function getDynamicPriceGroups() {
  if (Array.isArray(filterState.priceGroups) && filterState.priceGroups.length > 0) {
    return filterState.priceGroups;
  }
  return priceGroupsFallback;
}

function getBaseMatches() {
  return filterState.baseMatches;
}

function getPriceScopedMatches() {
  const base = getBaseMatches();
  if (filterState.priceLabels.size === 0) return base;
  const groups = getDynamicPriceGroups().filter(g => filterState.priceLabels.has(g.label));
  return base.filter(v => {
    const price = parsePrice(v.prijs);
    return groups.some(g => price >= g.min && (price < g.max || g.max === Number.POSITIVE_INFINITY));
  });
}

// Welke opties een filterkaart toont: alles uit de quizuitslag (alleen de
// winkelregel telt mee), NIET beperkt door de andere gekozen filters. Zo
// blijft een optie die door bv. een prijskeuze op 0 komt grijs in beeld
// staan in plaats van te verdwijnen. Het aantal erachter telt wel met alle
// andere filters.
function getSecondaryScopedMatches() {
  return getBaseScopedByMinAanbieders();
}

function getBaseScopedByMinAanbieders() {
  return getBaseMatches().filter(v => (v.aanbieders ?? []).length >= filterState.minAanbieders);
}

function formatBrandLabel(brand) {
  const raw = String(brand ?? "").trim();
  if (!raw) return "";
  if (raw === raw.toUpperCase()) return raw;
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function collectPlaatsingDetailOptions(matches) {
  const set = new Set();
  matches.forEach(v => { if (v.plaatsingDetail) set.add(v.plaatsingDetail); });
  const order = ["Volledig ingebouwd", "Semi-ingebouwd", "Onderbouw", "Vrijstaand", "Aanrecht"];
  const inOrder = order.filter(t => set.has(t));
  set.forEach(t => { if (!order.includes(t)) inOrder.push(t); });
  return inOrder;
}

function collectCouvertsOptions(matches) {
  const set = new Set();
  matches.forEach(v => { if (v.couverts) set.add(v.couverts); });
  return Array.from(set).sort((a, b) => a - b);
}

function collectBrandOptions(matches) {
  const set = new Set();
  matches.forEach(v => { const label = formatBrandLabel(v.merk); if (label) set.add(label); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "nl"));
}

function collectEnergieLabelOptions(matches) {
  const set = new Set();
  matches.forEach(v => { if (v.energieLabel) set.add(v.energieLabel); });
  const order = ["A", "B", "C", "D", "E", "F", "G"];
  return order.filter(t => set.has(t));
}

function collectDroogsysteemOptions(matches) {
  const set = new Set();
  matches.forEach(v => { if (v.droogsysteem) set.add(v.droogsysteem); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "nl"));
}

function collectBestekTypeOptions(matches) {
  const set = new Set();
  matches.forEach(v => { if (v.bestekType) set.add(v.bestekType); });
  const order = ["Mand", "Lade", "Mand & lade"];
  const inOrder = order.filter(t => set.has(t));
  set.forEach(t => { if (!order.includes(t)) inOrder.push(t); });
  return inOrder;
}

function normalizeKleur(kleur) {
  const raw = String(kleur ?? "").trim();
  if (!raw) return "";
  return raw.split(",").map(s => s.trim()).filter(Boolean).sort().join(", ");
}

function collectKleurOptions(matches) {
  const set = new Set();
  matches.forEach(v => { const k = normalizeKleur(v.kleur); if (k) set.add(k); });
  const order = ["Wit", "Zwart", "Roestvrijstaal", "Antraciet", "Grijs", "Zilver"];
  const inOrder = order.filter(t => set.has(t));
  set.forEach(t => { if (!order.includes(t)) inOrder.push(t); });
  return inOrder;
}

function collectFunctieOptions(matches) {
  return FUNCTIE_DEFINITIES.filter(f => matches.some(f.check)).map(f => f.key);
}

function collectProgrammaOptions(matches) {
  return Object.keys(PROGRAMMA_LABELS).filter(key => matches.some(v => heeftAfwasprogramma(v.afwasprogrammas, key)));
}

function collectAanbiederOptions(matches) {
  const set = new Set();
  matches.forEach(v => {
    (v.aanbieders ?? []).forEach(a => set.add(a.winkel));
  });
  return Array.from(set).sort();
}

function renderFilterOptions(container, card, items, matches, productValueFn, filterName, labelFn) {
  if (items.length === 0) { container.innerHTML = ""; card.hidden = true; return; }
  const stateSet = filterState[filterName];
  const counts = telOpties(filterName, items, productValueFn);
  renderFilterList(container, card, { items, counts, filterName, stateSet, labelFn });
}

function filterKeten() {
  let filtered = getPriceScopedMatches();

  if (filterState.plaatsingDetails.size > 0) {
    filtered = filtered.filter(v => filterState.plaatsingDetails.has(v.plaatsingDetail));
  }

  if (filterState.couvertsSet.size > 0) {
    filtered = filtered.filter(v => filterState.couvertsSet.has(v.couverts));
  }

  if (filterState.brands.size > 0) {
    filtered = filtered.filter(v => filterState.brands.has(formatBrandLabel(v.merk)));
  }

  if (filterState.energieLabels.size > 0) {
    filtered = filtered.filter(v => filterState.energieLabels.has(v.energieLabel));
  }

  if (filterState.droogsystemen.size > 0) {
    filtered = filtered.filter(v => filterState.droogsystemen.has(v.droogsysteem));
  }

  if (filterState.bestekTypes.size > 0) {
    filtered = filtered.filter(v => filterState.bestekTypes.has(v.bestekType));
  }

  if (filterState.kleuren.size > 0) {
    filtered = filtered.filter(v => filterState.kleuren.has(normalizeKleur(v.kleur)));
  }

  if (filterState.functies.size > 0) {
    filtered = filtered.filter(v =>
      FUNCTIE_DEFINITIES.filter(f => filterState.functies.has(f.key)).every(f => f.check(v))
    );
  }

  if (filterState.programmas.size > 0) {
    filtered = filtered.filter(v =>
      Array.from(filterState.programmas).every(key => heeftAfwasprogramma(v.afwasprogrammas, key))
    );
  }

  if (filterState.breedteLabels.size > 0) {
    const groups = filterState.breedteGroups.filter(g => filterState.breedteLabels.has(g.label));
    filtered = filtered.filter(v => Number.isFinite(v.breedteMm) && groups.some(g => v.breedteMm / 10 >= g.min && v.breedteMm / 10 < g.max));
  }

  if (filterState.diepteLabels.size > 0) {
    const groups = filterState.diepteGroups.filter(g => filterState.diepteLabels.has(g.label));
    filtered = filtered.filter(v => Number.isFinite(v.diepteMm) && groups.some(g => v.diepteMm / 10 >= g.min && v.diepteMm / 10 < g.max));
  }

  if (filterState.hoogteLabels.size > 0) {
    const groups = filterState.hoogteGroups.filter(g => filterState.hoogteLabels.has(g.label));
    filtered = filtered.filter(v => Number.isFinite(v.hoogteMm) && groups.some(g => v.hoogteMm / 10 >= g.min && v.hoogteMm / 10 < g.max));
  }

  if (filterState.aanbieder.size > 0) {
    filtered = filtered.filter(v =>
      (v.aanbieders ?? []).some(a => filterState.aanbieder.has(a.winkel))
    );
  }

  return filtered;
}

function applyFilters() {
  const filtered = filterKeten();

  const { effectiveMin, result: final } = applyMinAanbiedersCascade(filtered, filterState.minAanbieders);
  const cascaded = effectiveMin !== filterState.minAanbieders;
  if (cascaded) filterState.minAanbieders = effectiveMin;

  updateClearFiltersBtn();
  updateResultMatches(final, filterState.answers, filterState.bestType);

  if (cascaded) renderAllFilters();
}

function updateClearFiltersBtn() {
  const btn = qs("#clearFiltersBtn");
  if (!btn) return;
  const hasActive = filterState.priceLabels.size > 0 || filterState.plaatsingDetails.size > 0 || filterState.couvertsSet.size > 0 || filterState.brands.size > 0 ||
    filterState.energieLabels.size > 0 || filterState.droogsystemen.size > 0 || filterState.bestekTypes.size > 0 ||
    filterState.kleuren.size > 0 || filterState.functies.size > 0 || filterState.programmas.size > 0 ||
    filterState.breedteLabels.size > 0 || filterState.diepteLabels.size > 0 || filterState.hoogteLabels.size > 0 ||
    filterState.aanbieder.size > 0 || filterState.minAanbieders !== DEFAULT_MIN_AANBIEDERS;
  btn.hidden = !hasActive;
}

function renderDimensionFilter(container, card, groups, veld, stateSet, filterName) {
  if (!container || !card) return;
  if (groups.length === 0) { container.innerHTML = ""; card.hidden = true; return; }

  const base = getBaseScopedByMinAanbieders();
  const groupForMm = mm => Number.isFinite(mm) ? groups.find(g => mm / 10 >= g.min && mm / 10 < g.max) : undefined;
  const counts = computeCounts(zonderSelectie(stateSet), v => groupForMm(v[veld])?.label);
  const opBasis = computeCounts(base, v => groupForMm(v[veld])?.label);
  const labels = groups.filter(g => opBasis.has(g.label) || stateSet.has(g.label)).map(g => g.label);

  if (labels.length <= 1) {
    container.innerHTML = "";
    card.hidden = true;
  } else {
    renderFilterList(container, card, { items: labels, counts, filterName, stateSet, allLabel: "Alle" });
  }
}

function renderMinAanbiedersOptions(container, card) {
  if (!container || !card) return;
  const matches = filterKeten();
  const options = MIN_AANBIEDERS_OPTIONS.map(n => ({
    n,
    count: matches.filter(v => (v.aanbieders ?? []).length >= n).length,
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

function renderAllFilters() {
  const priceContainer      = qs("[data-filter-container='price']");
  const minAanbiedersContainer = qs("[data-filter-container='min-aanbieders']");
  const plaatsingDetailContainer = qs("[data-filter-container='plaatsing-detail']");
  const couvertsContainer   = qs("[data-filter-container='couverts']");
  const brandContainer      = qs("[data-filter-container='brand']");
  const energieContainer    = qs("[data-filter-container='energie-label']");
  const droogsysteemContainer = qs("[data-filter-container='droogsysteem']");
  const bestekContainer     = qs("[data-filter-container='bestek-type']");
  const kleurContainer      = qs("[data-filter-container='kleur']");
  const functieContainer    = qs("[data-filter-container='functies']");
  const programmaContainer  = qs("[data-filter-container='programmas']");
  const breedteContainer    = qs("[data-filter-container='breedte']");
  const diepteContainer     = qs("[data-filter-container='diepte']");
  const hoogteContainer     = qs("[data-filter-container='hoogte']");
  const aanbiederContainer  = qs("[data-filter-container='aanbieder']");

  const priceCard        = qs(".filter-card[data-filter='price']");
  const plaatsingDetailCard = qs(".filter-card[data-filter='plaatsing-detail']");
  const couvertsCard     = qs(".filter-card[data-filter='couverts']");
  const brandCard        = qs(".filter-card[data-filter='brand']");
  const energieCard      = qs(".filter-card[data-filter='energie-label']");
  const droogsysteemCard = qs(".filter-card[data-filter='droogsysteem']");
  const bestekCard       = qs(".filter-card[data-filter='bestek-type']");
  const kleurCard        = qs(".filter-card[data-filter='kleur']");
  const functieCard      = qs(".filter-card[data-filter='functies']");
  const programmaCard    = qs(".filter-card[data-filter='programmas']");
  const breedteCard      = qs(".filter-card[data-filter='breedte']");
  const diepteCard       = qs(".filter-card[data-filter='diepte']");
  const hoogteCard       = qs(".filter-card[data-filter='hoogte']");
  const aanbiederCard    = qs(".filter-card[data-filter='aanbieder']");
  const minAanbiedersCard = qs(".filter-card[data-filter='min-aanbieders']");

  renderMinAanbiedersOptions(minAanbiedersContainer, minAanbiedersCard);
  const matches = getSecondaryScopedMatches();

  if (priceContainer && priceCard) {
    const groups = getDynamicPriceGroups();
    const base = getBaseScopedByMinAanbieders();
    const groupForPrice = price => groups.find(g => price >= g.min && (price < g.max || g.max === Number.POSITIVE_INFINITY));
    const counts = computeCounts(zonderSelectie(filterState.priceLabels), v => groupForPrice(parsePrice(v.prijs))?.label);
    const opBasis = computeCounts(base, v => groupForPrice(parsePrice(v.prijs))?.label);
    const labels = groups.filter(g => opBasis.has(g.label) || filterState.priceLabels.has(g.label)).map(g => g.label);

    if (labels.length <= 1) {
      priceContainer.innerHTML = "";
      priceCard.hidden = true;
    } else {
      renderFilterList(priceContainer, priceCard, {
        items: labels, counts, filterName: "priceFilter", stateSet: filterState.priceLabels,
        labelFn: label => `€ ${label}`, allLabel: "Alle prijzen",
      });
    }
  }

  if (plaatsingDetailContainer && plaatsingDetailCard) {
    renderFilterOptions(plaatsingDetailContainer, plaatsingDetailCard, collectPlaatsingDetailOptions(matches), matches, v => v.plaatsingDetail, "plaatsingDetails");
  }

  if (couvertsContainer && couvertsCard) {
    renderFilterOptions(couvertsContainer, couvertsCard, collectCouvertsOptions(matches), matches, v => v.couverts, "couvertsSet", c => `${c} couverts`);
  }

  if (brandContainer && brandCard) {
    renderFilterOptions(brandContainer, brandCard, collectBrandOptions(matches), matches, v => formatBrandLabel(v.merk), "brands");
  }

  if (energieContainer && energieCard) {
    renderFilterOptions(energieContainer, energieCard, collectEnergieLabelOptions(matches), matches, v => v.energieLabel, "energieLabels", l => `Label ${l}`);
  }

  if (droogsysteemContainer && droogsysteemCard) {
    renderFilterOptions(droogsysteemContainer, droogsysteemCard, collectDroogsysteemOptions(matches), matches, v => v.droogsysteem, "droogsystemen");
  }

  if (bestekContainer && bestekCard) {
    renderFilterOptions(bestekContainer, bestekCard, collectBestekTypeOptions(matches), matches, v => v.bestekType, "bestekTypes");
  }

  if (kleurContainer && kleurCard) {
    renderFilterOptions(kleurContainer, kleurCard, collectKleurOptions(matches), matches, v => normalizeKleur(v.kleur), "kleuren");
  }

  if (functieContainer && functieCard) {
    const functieValueFn = v => FUNCTIE_DEFINITIES.filter(f => f.check(v)).map(f => f.key);
    const labelFn = key => FUNCTIE_DEFINITIES.find(f => f.key === key)?.label ?? key;
    renderFilterOptions(functieContainer, functieCard, collectFunctieOptions(matches), matches, functieValueFn, "functies", labelFn);
  }

  if (programmaContainer && programmaCard) {
    const programmaValueFn = v => Object.keys(PROGRAMMA_LABELS).filter(key => heeftAfwasprogramma(v.afwasprogrammas, key));
    const labelFn = key => PROGRAMMA_LABELS[key] ?? key;
    renderFilterOptions(programmaContainer, programmaCard, collectProgrammaOptions(matches), matches, programmaValueFn, "programmas", labelFn);
  }

  renderDimensionFilter(breedteContainer, breedteCard, filterState.breedteGroups, "breedteMm", filterState.breedteLabels, "breedteLabels");
  renderDimensionFilter(diepteContainer, diepteCard, filterState.diepteGroups, "diepteMm", filterState.diepteLabels, "diepteLabels");
  renderDimensionFilter(hoogteContainer, hoogteCard, filterState.hoogteGroups, "hoogteMm", filterState.hoogteLabels, "hoogteLabels");

  if (aanbiederContainer && aanbiederCard) {
    renderFilterOptions(aanbiederContainer, aanbiederCard, collectAanbiederOptions(matches), matches, v => (v.aanbieders ?? []).map(a => a.winkel), "aanbieder");
  }

  updateClearFiltersBtn();
}

function handleFilterChange(event) {
  const input = event.target.closest("input");
  if (!input) return;
  meet("filter_gebruikt", { filter: input.closest(".filter-card")?.dataset.filter || input.name, waarde: input.value === "all" ? "alle" : String(input.value).slice(0, 40) });

  const name  = input.name;
  const value = input.value;

  if (name === "minAanbiedersFilter") {
    filterState.minAanbieders = parseInt(value, 10);
    renderAllFilters();
    applyFilters();
    return;
  }

  const setMap = {
    priceFilter:      { set: filterState.priceLabels,      parse: v => v },
    plaatsingDetails: { set: filterState.plaatsingDetails, parse: v => v },
    couvertsSet:    { set: filterState.couvertsSet,   parse: v => parseInt(v, 10) },
    brands:         { set: filterState.brands,        parse: v => v },
    energieLabels:  { set: filterState.energieLabels, parse: v => v },
    droogsystemen:  { set: filterState.droogsystemen, parse: v => v },
    bestekTypes:    { set: filterState.bestekTypes,   parse: v => v },
    kleuren:        { set: filterState.kleuren,       parse: v => v },
    functies:       { set: filterState.functies,      parse: v => v },
    programmas:     { set: filterState.programmas,    parse: v => v },
    breedteLabels:  { set: filterState.breedteLabels, parse: v => v },
    diepteLabels:   { set: filterState.diepteLabels,  parse: v => v },
    hoogteLabels:   { set: filterState.hoogteLabels,  parse: v => v },
    aanbieder:      { set: filterState.aanbieder,     parse: v => v }
  };

  if (!setMap[name]) return;

  const { set, parse } = setMap[name];

  if (value === "all") {
    set.clear();
  } else {
    const parsed = parse(value);
    if (input.checked) {
      set.add(parsed);
    } else {
      set.delete(parsed);
    }
  }

  renderAllFilters();
  applyFilters();
}

export async function initFilters() {
  const filtersPanel = qs("#filtersPanel");
  if (!filtersPanel) return;

  const answersData   = localStorage.getItem("vaatwasser_answers");
  const bestTypeData  = localStorage.getItem("vaatwasser_bestType");

  filterState.answers  = answersData ? JSON.parse(answersData) : null;
  filterState.bestType = bestTypeData ?? "";

  let allVaatwassers = [];
  try {
    const raw = await fetchProducts();
    allVaatwassers = normalizeProducts(raw ?? []);
  } catch {
    allVaatwassers = [];
  }

  // Budget uit de quiz (maximumbedrag) is een echte grens, net als in de quiz.
  // Past er niets binnen, dan zonder grens (zelfde vangnet).
  const cap = Number(filterState.answers?.budget) || null;
  const zonderGrens = matchVaatwassers(allVaatwassers, filterState.answers ?? {}, null);
  let result = cap ? matchVaatwassers(allVaatwassers, filterState.answers ?? {}, cap) : zonderGrens;
  const budgetZonderMatch = Boolean(cap && !(result.filteredMatchedVaatwassers?.length));
  if (budgetZonderMatch) result = zonderGrens;
  filterState.baseMatches = Array.isArray(result.filteredMatchedVaatwassers) ? result.filteredMatchedVaatwassers : [];

  // Fallback: if the live fetch/computation yields nothing, seed the pool
  // with the vaatwassers that were already matched during the quiz.
  if (filterState.baseMatches.length === 0) {
    const storedData = localStorage.getItem("vaatwasser_filteredMatchedVaatwassers");
    if (storedData) {
      try {
        const storedVaatwassers = JSON.parse(storedData);
        if (Array.isArray(storedVaatwassers) && storedVaatwassers.length > 0) {
          filterState.baseMatches = storedVaatwassers;
        }
      } catch { /* ignore */ }
    }
  }

  filterState.priceGroups   = computeDynamicPriceGroups(filterState.baseMatches);
  filterState.breedteGroups = computeDynamicDimensionGroups(filterState.baseMatches, "breedteMm");
  filterState.diepteGroups  = computeDynamicDimensionGroups(filterState.baseMatches, "diepteMm");
  filterState.hoogteGroups  = computeDynamicDimensionGroups(filterState.baseMatches, "hoogteMm");

  filterState.priceLabels = new Set();

  renderAllFilters();

  filtersPanel.addEventListener("change", handleFilterChange);

  const clearBtn = qs("#clearFiltersBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      filterState.priceLabels.clear();
      filterState.plaatsingDetails.clear();
      filterState.couvertsSet.clear();
      filterState.brands.clear();
      filterState.energieLabels.clear();
      filterState.droogsystemen.clear();
      filterState.bestekTypes.clear();
      filterState.kleuren.clear();
      filterState.functies.clear();
      filterState.programmas.clear();
      filterState.breedteLabels.clear();
      filterState.diepteLabels.clear();
      filterState.hoogteLabels.clear();
      filterState.aanbieder.clear();
      filterState.minAanbieders = DEFAULT_MIN_AANBIEDERS;
      renderAllFilters();
      applyFilters();
    });
  }

  applyFilters();
  if (cap && filterState.baseMatches.length) initBudgetNote({ cap, result, zonderGrens, budgetZonderMatch });
  initMeting(cap);
}

function zetGroepen() {
  filterState.priceGroups   = computeDynamicPriceGroups(filterState.baseMatches);
  filterState.breedteGroups = computeDynamicDimensionGroups(filterState.baseMatches, "breedteMm");
  filterState.diepteGroups  = computeDynamicDimensionGroups(filterState.baseMatches, "diepteMm");
  filterState.hoogteGroups  = computeDynamicDimensionGroups(filterState.baseMatches, "hoogteMm");
}

// ───────── budget: "Meer budget?" en het vangnet als er niets binnen past ─────────
const euroLabel = n => "€" + Math.round(n).toLocaleString("nl-NL");
const WENS_VOORDEEL = {
  droog: "een deur die vanzelf opengaat, voor drogere vaat", besteklade: "een besteklade bovenin",
  ruim: "extra veel ruimte (15 couverts of meer)",
};

// Welke wens heeft de beste vaatwasser boven het budget, die geen enkele
// zichtbare vaatwasser binnen het budget zeker heeft? Dan noemen we die.
function wensBovenBudget(buiten, binnen, a) {
  const kandidaten = extraWensen(a).map(w => [WENS_VOORDEEL[w], v => heeftWens(v, w) === true]);
  return kandidaten.find(([naam, f]) => naam && f(buiten) && !binnen.some(f))?.[0] ?? null;
}

function initBudgetNote({ cap, result: binnen, zonderGrens, budgetZonderMatch }) {
  const binnenLijst = binnen.filteredMatchedVaatwassers ?? [];
  const kaart = document.createElement("div");
  kaart.className = "budget-kaart";
  kaart.setAttribute("role", "note");

  if (budgetZonderMatch) {
    meet("budget_kaart", { actie: "niets_binnen_budget" });
    kaart.innerHTML = `<p><strong>Binnen ${euroLabel(cap)} vonden we geen vaatwasser in deze maat.</strong> Dit zijn de vaatwassers die het best bij je wensen passen, vanaf de goedkoopste.</p>`;
    plaatsBudgetKaart(kaart);
    return;
  }

  // Alleen tonen als er boven het budget vaatwassers zijn die duidelijk beter
  // bij de wensen passen (passcore zonder prijsdeel), bij 2+ winkels.
  const zichtbaarBinnen = binnenLijst.filter(v => (v.aanbieders ?? []).length >= DEFAULT_MIN_AANBIEDERS);
  const topBinnen = zichtbaarBinnen.length ? Math.max(...zichtbaarBinnen.map(v => v.wens)) : binnen.topWens;
  const drempel = (topBinnen ?? -Infinity) + BAND_BESTE;
  const beter = (zonderGrens.filteredMatchedVaatwassers ?? []).filter(v => parsePrice(v.prijs) > cap && v.wens >= drempel);
  const zichtbaar = beter.filter(v => (v.aanbieders ?? []).length >= DEFAULT_MIN_AANBIEDERS);
  const goedkoopsteBuiten = zichtbaar.map(v => parsePrice(v.prijs)).filter(Number.isFinite).sort((a, b) => a - b)[0];
  if (!goedkoopsteBuiten) return;
  const buitenBeste = kiesBesteMatch(zichtbaar);
  const reden = buitenBeste ? wensBovenBudget(buitenBeste, zichtbaarBinnen, filterState.answers) : null;
  const meer = goedkoopsteBuiten - cap;
  let toontBuiten = false;
  const teken = () => {
    kaart.innerHTML = toontBuiten
      ? `<div class="budget-kaart-tekst"><strong>Je ziet nu vaatwassers boven je budget</strong><span>Vanaf ${euroLabel(goedkoopsteBuiten)}. Liever binnen je budget blijven?</span></div>
         <button type="button" class="budget-kaart-btn">Terug naar vaatwassers tot ${euroLabel(cap)}</button>`
      : reden
        ? `<div class="budget-kaart-tekst"><strong>Meer budget? Dan krijg je ${reden}</strong><span>Binnen je budget is dat er niet bij 2 of meer winkels. Vanaf ${euroLabel(goedkoopsteBuiten)}, ${euroLabel(meer)} boven je budget.</span></div>
           <button type="button" class="budget-kaart-btn">Bekijk deze vaatwassers</button>`
        : `<div class="budget-kaart-tekst"><strong>Meer budget? Er zijn vaatwassers die nog beter bij je wensen passen</strong><span>Vanaf ${euroLabel(goedkoopsteBuiten)}, ${euroLabel(meer)} boven je budget.</span></div>
           <button type="button" class="budget-kaart-btn">Bekijk deze vaatwassers</button>`;
    kaart.querySelector(".budget-kaart-btn").addEventListener("click", () => {
      toontBuiten = !toontBuiten;
      meet("budget_kaart", { actie: toontBuiten ? "klik_meer_budget" : "klik_terug", reden: reden ? "wens" : "score" });
      lijstSoort = toontBuiten ? "boven_budget" : "binnen_budget";
      filterState.baseMatches = toontBuiten ? beter : binnenLijst;
      zetGroepen();
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
// daarna steeds terug direct na de eerste vaatwasser.
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
const meet = (naam, props) => window.phTrackEvent?.(naam, { categorie: "vaatwasser", ...props });
let lijstSoort = "binnen_budget";

function initMeting(cap) {
  const budget = cap ? String(cap) : "geen_voorkeur";
  const zichtbaar = () => document.querySelectorAll("#otherMatchesGrid > .rcard").length;
  // Meegestuurd met elke winkelklik (shared/analytics.js)
  window.phResultaatContext = () => ({ budget, lijst: zichtbaar(), lijst_soort: lijstSoort });
  const a = filterState.answers ?? {};
  const beste = kiesBesteMatch(filterKeten().filter(v => (v.aanbieders ?? []).length >= filterState.minAanbieders));
  meet("resultaat_getoond", {
    budget, plaatsing: a.plaatsing ?? "", maat: a.maat || "onbekend",
    extra: lijst(a.extraAnswers).join("+"), lijst: zichtbaar(), beste_merk: beste?.merk ?? "",
  });
}
