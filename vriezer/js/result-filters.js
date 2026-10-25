import {
  matchVriezers, kiesBesteMatch, heeftWens, extraWensen, lijst,
  applyMinAanbiedersCascade, BAND_BESTE, DEFAULT_MIN_AANBIEDERS,
} from "./matching.js";

// No Frost en garage: true / false / null (onbekend), zie data.js
const nofrostLabel = v => v.nofrost === true ? "Ja" : v.nofrost === false ? "Nee" : null;
const garageLabel = v => v.garage === true ? "Ook voor een koude garage" : v.garage === false ? "Alleen binnenshuis" : null;
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

const PLAATSING_LABELS = {
  inbouw:     "Inbouw",
  vrijstaand: "Vrijstaand kastmodel",
  vrieskist:  "Vrieskist",
};

const filterState = {
  priceLabels:   new Set(),
  minAanbieders: DEFAULT_MIN_AANBIEDERS,
  plaatsingen:   new Set(),
  brands:        new Set(),
  capaciteiten:  new Set(),
  energielabels: new Set(),
  nofrost:       new Set(),
  geluid:        new Set(),
  garage:        new Set(),
  breedteLabels: new Set(),
  diepteLabels:  new Set(),
  hoogteLabels:  new Set(),
  aanbieder:     new Set(),
  baseMatches:   [],
  priceGroups:   [],
  breedteGroups: [],
  diepteGroups:  [],
  hoogteGroups:  [],
  answers:       null,
  bestType:      ""
};

// Price buckets are recomputed fresh from the live-fetched catalog on every
// results page load (not trusted from the quiz-time localStorage snapshot).
function getDynamicPriceGroups() {
  return filterState.priceGroups;
}

function formatBrandLabel(brand) {
  const raw = String(brand ?? "").trim();
  if (!raw) return "";
  if (raw === raw.toUpperCase()) return raw;
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function capaciteitBucketLabel(l) {
  if (!Number.isFinite(l)) return null;
  if (l < 100) return "< 100 L";
  if (l < 200) return "100 - 200 L";
  if (l < 350) return "200 - 350 L";
  return "350+ L";
}

const CAPACITEIT_ORDER = ["< 100 L", "100 - 200 L", "200 - 350 L", "350+ L"];

function getBaseMatches() {
  return filterState.baseMatches;
}

function getPriceScopedMatches() {
  const base = getBaseMatches();
  if (filterState.priceLabels.size === 0) return base;
  const groups = getDynamicPriceGroups().filter(g => filterState.priceLabels.has(g.label));
  if (groups.length === 0) return base;
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

function collectPlaatsingOptions(matches) {
  const set = new Set();
  matches.forEach(v => { if (v.plaatsing) set.add(PLAATSING_LABELS[v.plaatsing] ?? v.plaatsing); });
  const order = ["Inbouw", "Vrijstaand kastmodel", "Vrieskist"];
  return order.filter(l => set.has(l));
}

function collectBrandOptions(matches) {
  const set = new Set();
  matches.forEach(v => { const label = formatBrandLabel(v.merk); if (label) set.add(label); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "nl"));
}

function collectCapaciteitOptions(matches) {
  const set = new Set();
  matches.forEach(v => { const label = capaciteitBucketLabel(v.nettoInhoudL); if (label) set.add(label); });
  return CAPACITEIT_ORDER.filter(l => set.has(l));
}

function collectEnergielabelOptions(matches) {
  const set = new Set();
  matches.forEach(v => { if (v.energielabel) set.add(v.energielabel); });
  const order = ["A", "B", "C", "D", "E", "F", "G"];
  const inOrder = order.filter(t => set.has(t));
  set.forEach(t => { if (!order.includes(t)) inOrder.push(t); });
  return inOrder;
}

function collectNofrostOptions(matches) {
  const set = new Set();
  matches.forEach(v => { const l = nofrostLabel(v); if (l) set.add(l); });
  return ["Ja", "Nee"].filter(l => set.has(l));
}

function collectGeluidOptions(matches) {
  const set = new Set();
  matches.forEach(v => {
    if (v.geluidsniveauDb === null) return;
    set.add(v.geluidsniveauDb <= 38 ? "Stil (≤ 38 dB)" : "Normaal");
  });
  const order = ["Stil (≤ 38 dB)", "Normaal"];
  return order.filter(l => set.has(l));
}

function collectGarageOptions(matches) {
  const set = new Set();
  matches.forEach(v => {
    const l = garageLabel(v);
    if (l) set.add(l);
  });
  const order = ["Ook voor een koude garage", "Alleen binnenshuis"];
  return order.filter(l => set.has(l));
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

  if (filterState.plaatsingen.size > 0) {
    filtered = filtered.filter(v => filterState.plaatsingen.has(PLAATSING_LABELS[v.plaatsing] ?? v.plaatsing));
  }

  if (filterState.brands.size > 0) {
    filtered = filtered.filter(v => filterState.brands.has(formatBrandLabel(v.merk)));
  }

  if (filterState.capaciteiten.size > 0) {
    filtered = filtered.filter(v => filterState.capaciteiten.has(capaciteitBucketLabel(v.nettoInhoudL)));
  }

  if (filterState.energielabels.size > 0) {
    filtered = filtered.filter(v => filterState.energielabels.has(v.energielabel));
  }

  if (filterState.nofrost.size > 0) {
    filtered = filtered.filter(v => filterState.nofrost.has(nofrostLabel(v)));
  }

  if (filterState.geluid.size > 0) {
    filtered = filtered.filter(v => {
      if (v.geluidsniveauDb === null) return false;
      const label = v.geluidsniveauDb <= 38 ? "Stil (≤ 38 dB)" : "Normaal";
      return filterState.geluid.has(label);
    });
  }

  if (filterState.garage.size > 0) {
    filtered = filtered.filter(v => filterState.garage.has(garageLabel(v)));
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
  const hasActive = filterState.priceLabels.size > 0 || filterState.plaatsingen.size > 0 ||
    filterState.brands.size > 0 || filterState.capaciteiten.size > 0 ||
    filterState.energielabels.size > 0 || filterState.nofrost.size > 0 || filterState.geluid.size > 0 ||
    filterState.garage.size > 0 ||
    filterState.breedteLabels.size > 0 || filterState.diepteLabels.size > 0 || filterState.hoogteLabels.size > 0 ||
    filterState.aanbieder.size > 0 || filterState.minAanbieders !== DEFAULT_MIN_AANBIEDERS;
  btn.hidden = !hasActive;
}

// Zelfde patroon als de prijs-kaart hierboven: buckets 1x per catalogus
// berekend (zie initFilters), tellingen per bucket elke render opnieuw.
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
  const priceContainer        = qs("[data-filter-container='price']");
  const minAanbiedersContainer = qs("[data-filter-container='min-aanbieders']");
  const plaatsingContainer    = qs("[data-filter-container='plaatsing']");
  const brandContainer        = qs("[data-filter-container='brand']");
  const capaciteitContainer   = qs("[data-filter-container='capaciteit']");
  const energielabelContainer = qs("[data-filter-container='energielabel']");
  const nofrostContainer      = qs("[data-filter-container='nofrost']");
  const geluidContainer       = qs("[data-filter-container='geluid']");
  const garageContainer       = qs("[data-filter-container='garage']");
  const breedteContainer      = qs("[data-filter-container='breedte']");
  const diepteContainer       = qs("[data-filter-container='diepte']");
  const hoogteContainer       = qs("[data-filter-container='hoogte']");
  const aanbiederContainer    = qs("[data-filter-container='aanbieder']");

  const priceCard        = qs(".filter-card[data-filter='price']");
  const plaatsingCard    = qs(".filter-card[data-filter='plaatsing']");
  const brandCard        = qs(".filter-card[data-filter='brand']");
  const capaciteitCard   = qs(".filter-card[data-filter='capaciteit']");
  const energielabelCard = qs(".filter-card[data-filter='energielabel']");
  const nofrostCard      = qs(".filter-card[data-filter='nofrost']");
  const geluidCard       = qs(".filter-card[data-filter='geluid']");
  const garageCard       = qs(".filter-card[data-filter='garage']");
  const breedteCard      = qs(".filter-card[data-filter='breedte']");
  const diepteCard       = qs(".filter-card[data-filter='diepte']");
  const hoogteCard       = qs(".filter-card[data-filter='hoogte']");
  const aanbiederCard    = qs(".filter-card[data-filter='aanbieder']");
  const minAanbiedersCard = qs(".filter-card[data-filter='min-aanbieders']");

  renderMinAanbiedersOptions(minAanbiedersContainer, minAanbiedersCard);
  const matches = getSecondaryScopedMatches();

  if (priceContainer && priceCard) {
    const base = getBaseScopedByMinAanbieders();
    const groups = getDynamicPriceGroups();
    const groupForPrice = price => groups.find(g => price >= g.min && (price < g.max || g.max === Number.POSITIVE_INFINITY));
    const counts = computeCounts(zonderSelectie(filterState.priceLabels), v => groupForPrice(parsePrice(v.prijs))?.label);
    const opBasis = computeCounts(base, v => groupForPrice(parsePrice(v.prijs))?.label);
    const labels = groups.filter(g => opBasis.has(g.label) || filterState.priceLabels.has(g.label)).map(g => g.label);
    if (labels.length <= 1) {
      priceContainer.innerHTML = "";
      priceCard.hidden = true;
    } else {
      renderFilterList(priceContainer, priceCard, {
        items: labels, counts, filterName: "priceLabels", stateSet: filterState.priceLabels,
        labelFn: label => `€ ${label}`, allLabel: "Alle prijzen",
      });
    }
  }

  if (plaatsingContainer && plaatsingCard) {
    const opts = collectPlaatsingOptions(matches);
    if (opts.length <= 1) {
      plaatsingContainer.innerHTML = "";
      plaatsingCard.hidden = true;
    } else {
      renderFilterOptions(plaatsingContainer, plaatsingCard, opts, matches, v => PLAATSING_LABELS[v.plaatsing] ?? v.plaatsing, "plaatsingen");
    }
  }

  if (brandContainer && brandCard) {
    renderFilterOptions(brandContainer, brandCard, collectBrandOptions(matches), matches, v => formatBrandLabel(v.merk), "brands");
  }

  if (capaciteitContainer && capaciteitCard) {
    renderFilterOptions(capaciteitContainer, capaciteitCard, collectCapaciteitOptions(matches), matches, v => capaciteitBucketLabel(v.nettoInhoudL), "capaciteiten");
  }

  if (energielabelContainer && energielabelCard) {
    renderFilterOptions(energielabelContainer, energielabelCard, collectEnergielabelOptions(matches), matches, v => v.energielabel, "energielabels", l => `Label ${l}`);
  }

  if (nofrostContainer && nofrostCard) {
    renderFilterOptions(nofrostContainer, nofrostCard, collectNofrostOptions(matches), matches, nofrostLabel, "nofrost");
  }

  if (geluidContainer && geluidCard) {
    renderFilterOptions(geluidContainer, geluidCard, collectGeluidOptions(matches), matches, v => v.geluidsniveauDb === null ? null : (v.geluidsniveauDb <= 38 ? "Stil (≤ 38 dB)" : "Normaal"), "geluid");
  }

  if (garageContainer && garageCard) {
    renderFilterOptions(garageContainer, garageCard, collectGarageOptions(matches), matches, garageLabel, "garage");
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
    priceLabels:   { set: filterState.priceLabels,   parse: v => v },
    plaatsingen:   { set: filterState.plaatsingen,   parse: v => v, exclusive: true },
    brands:        { set: filterState.brands,        parse: v => v },
    capaciteiten:  { set: filterState.capaciteiten,  parse: v => v },
    energielabels: { set: filterState.energielabels, parse: v => v },
    nofrost:       { set: filterState.nofrost,       parse: v => v, exclusive: true },
    geluid:        { set: filterState.geluid,        parse: v => v, exclusive: true },
    garage:        { set: filterState.garage,        parse: v => v, exclusive: true },
    breedteLabels: { set: filterState.breedteLabels, parse: v => v },
    diepteLabels:  { set: filterState.diepteLabels,  parse: v => v },
    hoogteLabels:  { set: filterState.hoogteLabels,  parse: v => v },
    aanbieder:     { set: filterState.aanbieder,      parse: v => v }
  };

  if (!setMap[name]) return;

  const { set, parse, exclusive } = setMap[name];

  if (value === "all") {
    set.clear();
  } else {
    const parsed = parse(value);
    if (input.checked) {
      // "Ja"/"Nee"-achtige filters zijn elkaars tegenpolen: aanvinken van
      // de één moet de ander automatisch uitvinken.
      if (exclusive) set.clear();
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

  const answersData  = localStorage.getItem("vriezer_answers");
  const bestTypeData = localStorage.getItem("vriezer_bestType");

  filterState.answers  = answersData ? JSON.parse(answersData) : null;
  filterState.bestType = bestTypeData ?? "";
  filterState.priceLabels = new Set();

  let allVriezers = [];
  try {
    const raw = await fetchProducts();
    allVriezers = normalizeProducts(raw ?? []);
  } catch {
    allVriezers = [];
  }

  // Budget uit de quiz (maximumbedrag) is een echte grens, net als in de quiz.
  // Past er niets binnen, dan zonder grens (zelfde vangnet).
  const cap = Number(filterState.answers?.budget) || null;
  const zonderGrens = matchVriezers(allVriezers, filterState.answers, null);
  let liveResult = cap ? matchVriezers(allVriezers, filterState.answers, cap) : zonderGrens;
  const budgetZonderMatch = Boolean(cap && !(liveResult.filteredMatchedVriezers?.length));
  if (budgetZonderMatch) liveResult = zonderGrens;
  let baseMatches = Array.isArray(liveResult.filteredMatchedVriezers) ? liveResult.filteredMatchedVriezers : [];

  if (baseMatches.length === 0) {
    const storedData = localStorage.getItem("vriezer_filteredMatchedVriezers");
    if (storedData) {
      try {
        const storedVriezers = JSON.parse(storedData);
        if (Array.isArray(storedVriezers) && storedVriezers.length > 0) {
          baseMatches = storedVriezers;
        }
      } catch { /* ignore */ }
    }
  }

  filterState.baseMatches = baseMatches;
  filterState.priceGroups   = computeDynamicPriceGroups(baseMatches);
  filterState.breedteGroups = computeDynamicDimensionGroups(baseMatches, "breedteMm");
  filterState.diepteGroups  = computeDynamicDimensionGroups(baseMatches, "diepteMm");
  filterState.hoogteGroups  = computeDynamicDimensionGroups(baseMatches, "hoogteMm");

  renderAllFilters();

  filtersPanel.addEventListener("change", handleFilterChange);

  const clearBtn = qs("#clearFiltersBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      filterState.priceLabels.clear();
      filterState.plaatsingen.clear();
      filterState.brands.clear();
      filterState.capaciteiten.clear();
      filterState.energielabels.clear();
      filterState.nofrost.clear();
      filterState.geluid.clear();
      filterState.garage.clear();
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
  if (cap && filterState.baseMatches.length) initBudgetNote({ cap, result: liveResult, zonderGrens, budgetZonderMatch });
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
const WENS_VOORDEEL = { nofrost: "een No Frost-vriezer", garage: "een vriezer die ook in een koude garage werkt" };

// Welke wens heeft de beste vriezer boven het budget, die geen enkele
// zichtbare vriezer binnen het budget zeker heeft? Dan noemen we die.
function wensBovenBudget(buiten, binnen, a) {
  const kandidaten = extraWensen(a).map(w => [WENS_VOORDEEL[w], v => heeftWens(v, w) === true]);
  return kandidaten.find(([naam, f]) => naam && f(buiten) && !binnen.some(f))?.[0] ?? null;
}

function initBudgetNote({ cap, result: binnen, zonderGrens, budgetZonderMatch }) {
  const binnenLijst = binnen.filteredMatchedVriezers ?? [];
  const kaart = document.createElement("div");
  kaart.className = "budget-kaart";
  kaart.setAttribute("role", "note");

  if (budgetZonderMatch) {
    meet("budget_kaart", { actie: "niets_binnen_budget" });
    kaart.innerHTML = `<p><strong>Binnen ${euroLabel(cap)} vonden we geen vriezer van dit soort.</strong> Dit zijn de vriezers die het best bij je wensen passen, vanaf de goedkoopste.</p>`;
    plaatsBudgetKaart(kaart);
    return;
  }

  // Alleen tonen als er boven het budget vriezers zijn die duidelijk beter
  // bij de wensen passen (passcore zonder prijsdeel), bij 2+ winkels.
  const zichtbaarBinnen = binnenLijst.filter(v => (v.aanbieders ?? []).length >= DEFAULT_MIN_AANBIEDERS);
  const topBinnen = zichtbaarBinnen.length ? Math.max(...zichtbaarBinnen.map(v => v.wens)) : binnen.topWens;
  const drempel = (topBinnen ?? -Infinity) + BAND_BESTE;
  const beter = (zonderGrens.filteredMatchedVriezers ?? []).filter(v => parsePrice(v.prijs) > cap && v.wens >= drempel);
  const zichtbaar = beter.filter(v => (v.aanbieders ?? []).length >= DEFAULT_MIN_AANBIEDERS);
  const goedkoopsteBuiten = zichtbaar.map(v => parsePrice(v.prijs)).filter(Number.isFinite).sort((a, b) => a - b)[0];
  if (!goedkoopsteBuiten) return;
  const buitenBeste = kiesBesteMatch(zichtbaar);
  const reden = buitenBeste ? wensBovenBudget(buitenBeste, zichtbaarBinnen, filterState.answers) : null;
  const meer = goedkoopsteBuiten - cap;
  let toontBuiten = false;
  const teken = () => {
    kaart.innerHTML = toontBuiten
      ? `<div class="budget-kaart-tekst"><strong>Je ziet nu vriezers boven je budget</strong><span>Vanaf ${euroLabel(goedkoopsteBuiten)}. Liever binnen je budget blijven?</span></div>
         <button type="button" class="budget-kaart-btn">Terug naar vriezers tot ${euroLabel(cap)}</button>`
      : reden
        ? `<div class="budget-kaart-tekst"><strong>Meer budget? Dan krijg je ${reden}</strong><span>Binnen je budget is dat er niet bij 2 of meer winkels. Vanaf ${euroLabel(goedkoopsteBuiten)}, ${euroLabel(meer)} boven je budget.</span></div>
           <button type="button" class="budget-kaart-btn">Bekijk deze vriezers</button>`
        : `<div class="budget-kaart-tekst"><strong>Meer budget? Er zijn vriezers die nog beter bij je wensen passen</strong><span>Vanaf ${euroLabel(goedkoopsteBuiten)}, ${euroLabel(meer)} boven je budget.</span></div>
           <button type="button" class="budget-kaart-btn">Bekijk deze vriezers</button>`;
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
// daarna steeds terug direct na de eerste vriezer.
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
const meet = (naam, props) => window.phTrackEvent?.(naam, { categorie: "vriezer", ...props });
let lijstSoort = "binnen_budget";

function initMeting(cap) {
  const budget = cap ? String(cap) : "geen_voorkeur";
  const zichtbaar = () => document.querySelectorAll("#otherMatchesGrid > .rcard").length;
  // Meegestuurd met elke winkelklik (shared/analytics.js)
  window.phResultaatContext = () => ({ budget, lijst: zichtbaar(), lijst_soort: lijstSoort });
  const a = filterState.answers ?? {};
  const beste = kiesBesteMatch(filterKeten().filter(v => (v.aanbieders ?? []).length >= filterState.minAanbieders));
  meet("resultaat_getoond", {
    budget, soort: a.plaatsing ?? "", formaat: a.plaatsing === "inbouw" ? `nis-${a.nishoogte || "onbekend"}` : a.grootte || "maakt_niet_uit",
    extra: lijst(a.extraAnswers).join("+"), lijst: zichtbaar(), beste_merk: beste?.merk ?? "",
  });
}
