import {
  matchKoelkasten, kiesBesteMatch, heeftWens, extraWensen, vriezerWens, genoegInhoud, lijst,
  applyMinAanbiedersCascade, BAND_BESTE, DEFAULT_MIN_AANBIEDERS, MIN_ZICHTBAAR,
} from "./matching.js";
import { computeDynamicPriceGroups, computeDynamicDimensionGroups, normalizeProducts, parsePrice, qs } from "./utils.js";
import { updateResultMatches } from "./result.js";
import { fetchProducts } from "./supabase.js";
import { computeCounts, renderFilterList } from "../../shared/filters.js";
import { sleutel, isUitgezet } from "../../shared/klant.js";


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
  plaatsingen:   new Set(),
  brands:        new Set(),
  capaciteiten:  new Set(),
  energielabels: new Set(),
  geluid:        new Set(),
  // No Frost/vriesvak/waterdispenser/ijsmaker/vers zone waren 5 losse
  // kaarten — samengevoegd tot 1 "Functies"-kaart (zie FUNCTIE_DEFINITIES),
  // zelfde patroon als monitor/desktop/wasmachine.
  functies:      new Set(),
  vriezers:      new Set(),
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

const FUNCTIE_DEFINITIES = [
  { key: "nofrost", label: "No Frost vriezer", check: k => k.nofrost === true },
  { key: "verszone", label: "Vers zone compartiment", check: k => k.versZone === "Ja" },
  { key: "waterdispenser", label: "Waterdispenser", check: k => k.waterdispenser === "Ja" },
  { key: "ijsmaker", label: "IJsmaker", check: k => k.ijsmaker === "Ja" },
];

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
  if (l < 250) return "< 250 L";
  if (l < 350) return "250 - 350 L";
  if (l < 450) return "350 - 450 L";
  return "450+ L";
}

const CAPACITEIT_ORDER = ["< 250 L", "250 - 350 L", "350 - 450 L", "450+ L"];

const VRIEZER_LABEL = { vriezer: "Aparte vriezer", vriesvak: "Klein vriesvak", zonder: "Zonder vriezer" };
const VRIEZER_ORDER = ["Aparte vriezer", "Klein vriesvak", "Zonder vriezer"];
const vriezerLabel = k => VRIEZER_LABEL[k.vriezer] ?? null;

function getBaseMatches() {
  return filterState.baseMatches;
}

function getPriceScopedMatches() {
  const base = getBaseMatches();
  if (filterState.priceLabels.size === 0) return base;
  const groups = getDynamicPriceGroups().filter(g => filterState.priceLabels.has(g.label));
  if (groups.length === 0) return base;
  return base.filter(k => {
    const price = parsePrice(k.prijs);
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
  return getBaseMatches().filter(k => (k.aanbieders ?? []).length >= filterState.minAanbieders);
}

function collectPlaatsingOptions(matches) {
  const set = new Set();
  matches.forEach(k => { if (k.plaatsing) set.add(k.plaatsing === "inbouw" ? "Inbouw" : "Vrijstaand"); });
  return Array.from(set);
}

function collectBrandOptions(matches) {
  const set = new Set();
  matches.forEach(k => { const label = formatBrandLabel(k.merk); if (label) set.add(label); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "nl"));
}

function collectCapaciteitOptions(matches) {
  const set = new Set();
  matches.forEach(k => { const label = capaciteitBucketLabel(k.nettoInhoudL); if (label) set.add(label); });
  return CAPACITEIT_ORDER.filter(l => set.has(l));
}

function collectEnergielabelOptions(matches) {
  const set = new Set();
  matches.forEach(k => { if (k.energielabel) set.add(k.energielabel); });
  const order = ["A", "B", "C", "D", "E", "F", "G"];
  const inOrder = order.filter(t => set.has(t));
  set.forEach(t => { if (!order.includes(t)) inOrder.push(t); });
  return inOrder;
}

function collectFunctieOptions(matches) {
  // Uitgezette opties (B2B-klant zonder die data) ook als filter weglaten.
  return FUNCTIE_DEFINITIES.filter(f => !isUitgezet(f.key) && matches.some(f.check)).map(f => f.key);
}

function collectVriezerOptions(matches) {
  const set = new Set(matches.map(vriezerLabel).filter(Boolean));
  return VRIEZER_ORDER.filter(l => set.has(l));
}

function collectGeluidOptions(matches) {
  const set = new Set();
  matches.forEach(k => {
    if (k.geluidsniveauDb === null) return;
    set.add(k.geluidsniveauDb <= 38 ? "Stil (≤ 38 dB)" : "Normaal");
  });
  const order = ["Stil (≤ 38 dB)", "Normaal"];
  return order.filter(l => set.has(l));
}

function collectAanbiederOptions(matches) {
  const set = new Set();
  matches.forEach(k => {
    (k.aanbieders ?? []).forEach(a => set.add(a.winkel));
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
    filtered = filtered.filter(k => filterState.plaatsingen.has(k.plaatsing === "inbouw" ? "Inbouw" : "Vrijstaand"));
  }

  if (filterState.brands.size > 0) {
    filtered = filtered.filter(k => filterState.brands.has(formatBrandLabel(k.merk)));
  }

  if (filterState.capaciteiten.size > 0) {
    filtered = filtered.filter(k => filterState.capaciteiten.has(capaciteitBucketLabel(k.nettoInhoudL)));
  }

  if (filterState.energielabels.size > 0) {
    filtered = filtered.filter(k => filterState.energielabels.has(k.energielabel));
  }

  if (filterState.geluid.size > 0) {
    filtered = filtered.filter(k => {
      if (k.geluidsniveauDb === null) return false;
      const label = k.geluidsniveauDb <= 38 ? "Stil (≤ 38 dB)" : "Normaal";
      return filterState.geluid.has(label);
    });
  }

  if (filterState.vriezers.size > 0) {
    filtered = filtered.filter(k => filterState.vriezers.has(vriezerLabel(k)));
  }

  if (filterState.functies.size > 0) {
    filtered = filtered.filter(k =>
      FUNCTIE_DEFINITIES.filter(f => filterState.functies.has(f.key)).every(f => f.check(k))
    );
  }

  if (filterState.breedteLabels.size > 0) {
    const groups = filterState.breedteGroups.filter(g => filterState.breedteLabels.has(g.label));
    filtered = filtered.filter(k => Number.isFinite(k.breedteMm) && groups.some(g => k.breedteMm / 10 >= g.min && k.breedteMm / 10 < g.max));
  }

  if (filterState.diepteLabels.size > 0) {
    const groups = filterState.diepteGroups.filter(g => filterState.diepteLabels.has(g.label));
    filtered = filtered.filter(k => Number.isFinite(k.diepteMm) && groups.some(g => k.diepteMm / 10 >= g.min && k.diepteMm / 10 < g.max));
  }

  if (filterState.hoogteLabels.size > 0) {
    const groups = filterState.hoogteGroups.filter(g => filterState.hoogteLabels.has(g.label));
    filtered = filtered.filter(k => Number.isFinite(k.hoogteMm) && groups.some(g => k.hoogteMm / 10 >= g.min && k.hoogteMm / 10 < g.max));
  }

  if (filterState.aanbieder.size > 0) {
    filtered = filtered.filter(k =>
      (k.aanbieders ?? []).some(a => filterState.aanbieder.has(a.winkel))
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
    filterState.energielabels.size > 0 || filterState.geluid.size > 0 ||
    filterState.functies.size > 0 || filterState.vriezers.size > 0 ||
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
  const counts = computeCounts(zonderSelectie(stateSet), k => groupForMm(k[veld])?.label);
  const opBasis = computeCounts(base, k => groupForMm(k[veld])?.label);
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
    count: matches.filter(k => (k.aanbieders ?? []).length >= n).length,
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
  const geluidContainer       = qs("[data-filter-container='geluid']");
  const functieContainer      = qs("[data-filter-container='functies']");
  const vriezerContainer      = qs("[data-filter-container='vriezer']");
  const breedteContainer      = qs("[data-filter-container='breedte']");
  const diepteContainer       = qs("[data-filter-container='diepte']");
  const hoogteContainer       = qs("[data-filter-container='hoogte']");
  const aanbiederContainer    = qs("[data-filter-container='aanbieder']");

  const priceCard        = qs(".filter-card[data-filter='price']");
  const plaatsingCard    = qs(".filter-card[data-filter='plaatsing']");
  const brandCard        = qs(".filter-card[data-filter='brand']");
  const capaciteitCard   = qs(".filter-card[data-filter='capaciteit']");
  const energielabelCard = qs(".filter-card[data-filter='energielabel']");
  const geluidCard       = qs(".filter-card[data-filter='geluid']");
  const functieCard      = qs(".filter-card[data-filter='functies']");
  const vriezerCard      = qs(".filter-card[data-filter='vriezer']");
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
    const counts = computeCounts(zonderSelectie(filterState.priceLabels), k => groupForPrice(parsePrice(k.prijs))?.label);
    const opBasis = computeCounts(base, k => groupForPrice(parsePrice(k.prijs))?.label);
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
      renderFilterOptions(plaatsingContainer, plaatsingCard, opts, matches, k => k.plaatsing === "inbouw" ? "Inbouw" : "Vrijstaand", "plaatsingen");
    }
  }

  if (brandContainer && brandCard) {
    renderFilterOptions(brandContainer, brandCard, collectBrandOptions(matches), matches, k => formatBrandLabel(k.merk), "brands");
  }

  if (capaciteitContainer && capaciteitCard) {
    renderFilterOptions(capaciteitContainer, capaciteitCard, collectCapaciteitOptions(matches), matches, k => capaciteitBucketLabel(k.nettoInhoudL), "capaciteiten");
  }

  if (energielabelContainer && energielabelCard) {
    renderFilterOptions(energielabelContainer, energielabelCard, collectEnergielabelOptions(matches), matches, k => k.energielabel, "energielabels", l => `Label ${l}`);
  }

  if (geluidContainer && geluidCard) {
    renderFilterOptions(geluidContainer, geluidCard, collectGeluidOptions(matches), matches, k => k.geluidsniveauDb === null ? null : (k.geluidsniveauDb <= 38 ? "Stil (≤ 38 dB)" : "Normaal"), "geluid");
  }

  if (vriezerContainer && vriezerCard) {
    const opts = collectVriezerOptions(matches);
    if (opts.length <= 1) { vriezerContainer.innerHTML = ""; vriezerCard.hidden = true; }
    else renderFilterOptions(vriezerContainer, vriezerCard, opts, matches, vriezerLabel, "vriezers");
  }

  if (functieContainer && functieCard) {
    const functieValueFn = k => FUNCTIE_DEFINITIES.filter(f => f.check(k)).map(f => f.key);
    const labelFn = key => FUNCTIE_DEFINITIES.find(f => f.key === key)?.label ?? key;
    renderFilterOptions(functieContainer, functieCard, collectFunctieOptions(matches), matches, functieValueFn, "functies", labelFn);
  }

  renderDimensionFilter(breedteContainer, breedteCard, filterState.breedteGroups, "breedteMm", filterState.breedteLabels, "breedteLabels");
  renderDimensionFilter(diepteContainer, diepteCard, filterState.diepteGroups, "diepteMm", filterState.diepteLabels, "diepteLabels");
  renderDimensionFilter(hoogteContainer, hoogteCard, filterState.hoogteGroups, "hoogteMm", filterState.hoogteLabels, "hoogteLabels");

  if (aanbiederContainer && aanbiederCard) {
    renderFilterOptions(aanbiederContainer, aanbiederCard, collectAanbiederOptions(matches), matches, k => (k.aanbieders ?? []).map(a => a.winkel), "aanbieder");
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
    geluid:        { set: filterState.geluid,        parse: v => v, exclusive: true },
    functies:      { set: filterState.functies,      parse: v => v },
    vriezers:      { set: filterState.vriezers,      parse: v => v },
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
      // de één moet de ander automatisch uitvinken (anders slaat "Ja" én
      // "Nee" tegelijk aanvinken nergens op naast de "Alle"-optie).
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

  // Load state from localStorage
  const answersData  = localStorage.getItem(sleutel("koelkast_answers"));
  const bestTypeData = localStorage.getItem(sleutel("koelkast_bestType"));

  filterState.answers  = answersData ? JSON.parse(answersData) : null;
  filterState.bestType = bestTypeData ?? "";
  filterState.priceLabels = new Set();

  // Fetch & normalize all koelkasten
  let allKoelkasten = [];
  try {
    const raw = await fetchProducts();
    allKoelkasten = normalizeProducts(raw ?? []);
  } catch {
    allKoelkasten = [];
  }

  // Budget uit de quiz (maximumbedrag) is een echte grens, net als in de quiz.
  // Past er niets binnen, dan zonder grens (zelfde vangnet).
  const cap = Number(filterState.answers?.budget) || null;
  const zonderGrens = matchKoelkasten(allKoelkasten, filterState.answers, null);
  let liveResult = cap ? matchKoelkasten(allKoelkasten, filterState.answers, cap) : zonderGrens;
  const budgetZonderMatch = Boolean(cap && !(liveResult.filteredMatchedKoelkasten?.length));
  if (budgetZonderMatch) liveResult = zonderGrens;
  let baseMatches = Array.isArray(liveResult.filteredMatchedKoelkasten) ? liveResult.filteredMatchedKoelkasten : [];

  // Fallback: if the live fetch yields nothing, fall back to the matches
  // that were already computed and stored at quiz-submit time.
  if (baseMatches.length === 0) {
    const storedData = localStorage.getItem(sleutel("koelkast_filteredMatchedKoelkasten"));
    if (storedData) {
      try {
        const storedKoelkasten = JSON.parse(storedData);
        if (Array.isArray(storedKoelkasten) && storedKoelkasten.length > 0) {
          baseMatches = storedKoelkasten;
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

  // Delegate all filter changes
  filtersPanel.addEventListener("change", handleFilterChange);

  // Clear filters button
  const clearBtn = qs("#clearFiltersBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      filterState.priceLabels.clear();
      filterState.plaatsingen.clear();
      filterState.brands.clear();
      filterState.capaciteiten.clear();
      filterState.energielabels.clear();
      filterState.geluid.clear();
      filterState.functies.clear();
      filterState.vriezers.clear();
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
const WENS_VOORDEEL = {
  energiezuinig: "een zuinig energielabel (A, B of C)", nofrost: "een No Frost-vriezer",
  verszone: "een vers zone voor groente en vlees", waterdispenser: "een waterdispenser", ijsmaker: "een ijsmaker",
};
const VRIEZER_VOORDEEL = { vriezer: "een aparte vriezer", vriesvak: "een vriesvak", zonder: "een koelkast zonder vriezer" };

// Welke wens heeft de beste koelkast boven het budget, die geen enkele
// zichtbare koelkast binnen het budget zeker heeft? Dan noemen we die.
function wensBovenBudget(buiten, binnen, a) {
  const kandidaten = extraWensen(a).map(w => [WENS_VOORDEEL[w], k => heeftWens(k, w) === true]);
  const vw = vriezerWens(a);
  if (vw) kandidaten.unshift([VRIEZER_VOORDEEL[vw], k => heeftWens(k, vw) === true]);
  if (a?.gezinsgrootte) kandidaten.push(["genoeg koelruimte voor je huishouden", k => genoegInhoud(k, a.gezinsgrootte) === true]);
  return kandidaten.find(([naam, f]) => naam && f(buiten) && !binnen.some(f))?.[0] ?? null;
}

function initBudgetNote({ cap, result: binnen, zonderGrens, budgetZonderMatch }) {
  const binnenLijst = binnen.filteredMatchedKoelkasten ?? [];
  const kaart = document.createElement("div");
  kaart.className = "budget-kaart";
  kaart.setAttribute("role", "note");

  if (budgetZonderMatch) {
    meet("budget_kaart", { actie: "niets_binnen_budget" });
    kaart.innerHTML = `<p><strong>Binnen ${euroLabel(cap)} vonden we geen koelkast van dit type.</strong> Dit zijn de koelkasten die het best bij je wensen passen, vanaf de goedkoopste.</p>`;
    plaatsBudgetKaart(kaart);
    return;
  }

  // Alleen tonen als er boven het budget koelkasten zijn die duidelijk beter
  // bij de wensen passen (passcore zonder prijsdeel). Vergelijk met wat je
  // binnen budget echt ziet (2+ winkels), en tel erboven ook alleen dat.
  const zichtbaarBinnen = binnenLijst.filter(k => (k.aanbieders ?? []).length >= MIN_ZICHTBAAR);
  const topBinnen = zichtbaarBinnen.length ? Math.max(...zichtbaarBinnen.map(k => k.wens)) : binnen.topWens;
  const drempel = (topBinnen ?? -Infinity) + BAND_BESTE;
  const beter = (zonderGrens.filteredMatchedKoelkasten ?? []).filter(k => parsePrice(k.prijs) > cap && k.wens >= drempel);
  const zichtbaar = beter.filter(k => (k.aanbieders ?? []).length >= MIN_ZICHTBAAR);
  const goedkoopsteBuiten = zichtbaar.map(k => parsePrice(k.prijs)).filter(Number.isFinite).sort((a, b) => a - b)[0];
  if (!goedkoopsteBuiten) return;
  const buitenBeste = kiesBesteMatch(zichtbaar);
  const reden = buitenBeste ? wensBovenBudget(buitenBeste, zichtbaarBinnen, filterState.answers) : null;
  const meer = goedkoopsteBuiten - cap;
  let toontBuiten = false;
  const teken = () => {
    kaart.innerHTML = toontBuiten
      ? `<div class="budget-kaart-tekst"><strong>Je ziet nu koelkasten boven je budget</strong><span>Vanaf ${euroLabel(goedkoopsteBuiten)}. Liever binnen je budget blijven?</span></div>
         <button type="button" class="budget-kaart-btn">Terug naar koelkasten tot ${euroLabel(cap)}</button>`
      : reden
        ? `<div class="budget-kaart-tekst"><strong>Meer budget? Dan krijg je ${reden}</strong><span>Binnen je budget is dat er niet${MIN_ZICHTBAAR > 1 ? " bij 2 of meer winkels" : ""}. Vanaf ${euroLabel(goedkoopsteBuiten)}, ${euroLabel(meer)} boven je budget.</span></div>
           <button type="button" class="budget-kaart-btn">Bekijk deze koelkasten</button>`
        : `<div class="budget-kaart-tekst"><strong>Meer budget? Er zijn koelkasten die nog beter bij je wensen passen</strong><span>Vanaf ${euroLabel(goedkoopsteBuiten)}, ${euroLabel(meer)} boven je budget.</span></div>
           <button type="button" class="budget-kaart-btn">Bekijk deze koelkasten</button>`;
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
// daarna steeds terug direct na de eerste koelkast.
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

// ───────── meting (Umami, via shared/consent.js; niet in de B2B-embed) ─────────
const meet = (naam, props) => window.phTrackEvent?.(naam, { categorie: "koelkast", ...props });
let lijstSoort = "binnen_budget";

function initMeting(cap) {
  const budget = cap ? String(cap) : "geen_voorkeur";
  const zichtbaar = () => document.querySelectorAll("#otherMatchesGrid > .rcard").length;
  // Meegestuurd met elke winkelklik (shared/analytics.js)
  window.phResultaatContext = () => ({ budget, lijst: zichtbaar(), lijst_soort: lijstSoort });
  const a = filterState.answers ?? {};
  const beste = kiesBesteMatch(filterKeten().filter(genoegWinkels));
  meet("resultaat_getoond", {
    budget, plaatsing: a.plaatsing ?? "", type: a.plaatsing === "inbouw" ? `nis-${a.nishoogte || "onbekend"}` : a.vrijstaandtype ?? "",
    vriezer: a.vriezer ?? "", extra: lijst(a.extraAnswers).join("+"), lijst: zichtbaar(), beste_merk: beste?.merk ?? "",
  });
}
