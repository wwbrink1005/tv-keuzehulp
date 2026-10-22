import {
  matchStofzuigers, kiesBesteMatch, heeftExtra, voldoetAanZak, genoegBereik, lijst,
  applyMinAanbiedersCascade, BAND_BESTE, DEFAULT_MIN_AANBIEDERS,
} from "./matching.js";
import { computeDynamicPriceGroups, computeDynamicWeightGroups, normalizeProducts, parsePrice, qs } from "./utils.js";
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
  weightLabels:  new Set(),
  vloertypes:    new Set(),
  containertypes: new Set(),
  brands:        new Set(),
  functies:      new Set(),
  aanbieder:     new Set(),
  minAanbieders: DEFAULT_MIN_AANBIEDERS,
  baseMatches:   [],
  answers:       null,
  bestType:      "",
};

// Sinds okt. 2026 de kenmerken uit naam en Icecat (utils.js); alleen wat zeker is.
const FUNCTIE_DEFINITIES = [
  { key: "hepa", label: "Filter voor allergie (HEPA)", check: s => s.allergie === true },
  { key: "huisdieren", label: "Voor huisdierharen", check: s => s.huisdieren === true },
  { key: "parket", label: "Parketborstel", check: s => s.parket === true },
  { key: "dweilen", label: "Ook dweilen", check: s => s.dweilen === true },
  { key: "accu", label: "Extra of wisselbare accu", check: s => s.extraAccu === true },
];

const VLOERTYPE_LABELS = {
  tapijt: "Tapijt",
  hardeVloer: "Harde vloer",
};

function getDynamicPriceGroups() {
  return Array.isArray(filterState.priceGroups) ? filterState.priceGroups : [];
}

function getDynamicWeightGroups() {
  return Array.isArray(filterState.weightGroups) ? filterState.weightGroups : [];
}

function getBaseMatches() {
  return filterState.baseMatches;
}

function getPriceScopedMatches() {
  const base = getBaseMatches();
  if (filterState.priceLabels.size === 0) return base;
  const groups = getDynamicPriceGroups().filter(g => filterState.priceLabels.has(g.label));
  return base.filter(s => {
    const price = parsePrice(s.prijs);
    return groups.some(g => price >= g.min && (price < g.max || g.max === Number.POSITIVE_INFINITY));
  });
}

// Basis voor de tellingen op alle secundaire filterkaarten: prijs-gescoped
// én al beperkt tot de huidige "aantal winkels"-drempel.
// Welke opties een filterkaart toont: alles uit de quizuitslag (alleen de
// winkelregel telt mee), NIET beperkt door de andere gekozen filters. Zo
// blijft een optie die door bv. een prijskeuze op 0 komt grijs in beeld
// staan in plaats van te verdwijnen. Het aantal erachter telt wel met alle
// andere filters.
function getSecondaryScopedMatches() {
  return getBaseScopedByMinAanbieders();
}

function getBaseScopedByMinAanbieders() {
  return getBaseMatches().filter(s => (s.aanbieders ?? []).length >= filterState.minAanbieders);
}

function formatBrandLabel(brand) {
  const raw = String(brand ?? "").trim();
  if (!raw) return "";
  if (raw === raw.toUpperCase()) return raw;
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

// De vloertype-kaart staat uit (sinds okt. 2026): "reinigt ondergronden" is
// bij Bosch en Miele nooit bekend, dus een vloerfilter liet die stil vallen.
// Parket staat nu bij de functies.
function collectVloertypeOptions(matches) {
  return [];
  const opties = [];
  if (matches.some(s => s.geschiktTapijt)) opties.push("tapijt");
  if (matches.some(s => s.geschiktHardeVloer)) opties.push("hardeVloer");
  return opties;
}

function collectContainerTypeOptions(matches) {
  const set = new Set();
  matches.forEach(s => { if (s.containerType) set.add(s.containerType); });
  const order = ["Zakloos", "Stofzak"];
  const inOrder = order.filter(t => set.has(t));
  set.forEach(t => { if (!order.includes(t)) inOrder.push(t); });
  return inOrder;
}

function collectBrandOptions(matches) {
  const set = new Set();
  matches.forEach(s => { const label = formatBrandLabel(s.merk); if (label) set.add(label); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "nl"));
}

function collectFunctieOptions(matches) {
  return FUNCTIE_DEFINITIES.filter(f => matches.some(f.check)).map(f => f.key);
}

function collectAanbiederOptions(matches) {
  const set = new Set();
  matches.forEach(s => { (s.aanbieders ?? []).forEach(a => set.add(a.winkel)); });
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

  if (filterState.weightLabels.size > 0) {
    const groups = getDynamicWeightGroups().filter(g => filterState.weightLabels.has(g.label));
    filtered = filtered.filter(s => groups.some(g => s.gewichtKg !== null && s.gewichtKg >= g.min && (s.gewichtKg < g.max || g.max === Number.POSITIVE_INFINITY)));
  }

  if (filterState.vloertypes.size > 0) {
    filtered = filtered.filter(s =>
      (filterState.vloertypes.has("tapijt") && s.geschiktTapijt) ||
      (filterState.vloertypes.has("hardeVloer") && s.geschiktHardeVloer)
    );
  }

  if (filterState.containertypes.size > 0) {
    filtered = filtered.filter(s => filterState.containertypes.has(s.containerType));
  }

  if (filterState.brands.size > 0) {
    filtered = filtered.filter(s => filterState.brands.has(formatBrandLabel(s.merk)));
  }

  if (filterState.functies.size > 0) {
    filtered = filtered.filter(s =>
      FUNCTIE_DEFINITIES.filter(f => filterState.functies.has(f.key)).every(f => f.check(s))
    );
  }

  if (filterState.aanbieder.size > 0) {
    filtered = filtered.filter(s => (s.aanbieders ?? []).some(a => filterState.aanbieder.has(a.winkel)));
  }

  // "Aantal winkels" als allerlaatste stap, met cascade-fallback.

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
  const hasActive = filterState.priceLabels.size > 0 || filterState.weightLabels.size > 0 ||
    filterState.vloertypes.size > 0 || filterState.containertypes.size > 0 || filterState.brands.size > 0 ||
    filterState.functies.size > 0 || filterState.aanbieder.size > 0 ||
    filterState.minAanbieders !== DEFAULT_MIN_AANBIEDERS;
  btn.hidden = !hasActive;
}

function renderMinAanbiedersOptions(container, card) {
  if (!container || !card) return;
  const matches = filterKeten();
  const options = MIN_AANBIEDERS_OPTIONS.map(n => ({
    n,
    count: matches.filter(s => (s.aanbieders ?? []).length >= n).length,
  })).filter(o => o.count > 0);

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
  const weightContainer     = qs("[data-filter-container='gewicht']");
  const vloertypeContainer  = qs("[data-filter-container='vloertype']");
  const containerTypeContainer = qs("[data-filter-container='containertype']");
  const brandContainer      = qs("[data-filter-container='brand']");
  const functieContainer    = qs("[data-filter-container='functies']");
  const aanbiederContainer  = qs("[data-filter-container='aanbieder']");

  const priceCard      = qs(".filter-card[data-filter='price']");
  const minAanbiedersCard = qs(".filter-card[data-filter='min-aanbieders']");
  const weightCard     = qs(".filter-card[data-filter='gewicht']");
  const vloertypeCard  = qs(".filter-card[data-filter='vloertype']");
  const containerTypeCard = qs(".filter-card[data-filter='containertype']");
  const brandCard      = qs(".filter-card[data-filter='brand']");
  const functieCard    = qs(".filter-card[data-filter='functies']");
  const aanbiederCard  = qs(".filter-card[data-filter='aanbieder']");

  renderMinAanbiedersOptions(minAanbiedersContainer, minAanbiedersCard);
  const matches = getSecondaryScopedMatches();

  if (priceContainer && priceCard) {
    const groups = getDynamicPriceGroups();
    const base = getBaseScopedByMinAanbieders();
    const groupForPrice = price => groups.find(g => price >= g.min && (price < g.max || g.max === Number.POSITIVE_INFINITY));
    const counts = computeCounts(zonderSelectie(filterState.priceLabels), s => groupForPrice(parsePrice(s.prijs))?.label);
    const opBasis = computeCounts(base, s => groupForPrice(parsePrice(s.prijs))?.label);
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

  if (weightContainer && weightCard) {
    const groups = getDynamicWeightGroups();
    const base = getBaseScopedByMinAanbieders();
    const groupForWeight = kg => groups.find(g => kg !== null && kg >= g.min && (kg < g.max || g.max === Number.POSITIVE_INFINITY));
    const counts = computeCounts(zonderSelectie(filterState.weightLabels), s => groupForWeight(s.gewichtKg)?.label);
    const opBasis = computeCounts(base, s => groupForWeight(s.gewichtKg)?.label);
    const labels = groups.filter(g => opBasis.has(g.label) || filterState.weightLabels.has(g.label)).map(g => g.label);

    if (labels.length <= 1) {
      weightContainer.innerHTML = "";
      weightCard.hidden = true;
    } else {
      renderFilterList(weightContainer, weightCard, {
        items: labels, counts, filterName: "weightFilter", stateSet: filterState.weightLabels,
        allLabel: "Alle gewichten",
      });
    }
  }

  if (vloertypeContainer && vloertypeCard) {
    renderFilterOptions(vloertypeContainer, vloertypeCard, collectVloertypeOptions(matches), matches,
      s => [s.geschiktTapijt ? "tapijt" : null, s.geschiktHardeVloer ? "hardeVloer" : null].filter(Boolean),
      "vloertypes", key => VLOERTYPE_LABELS[key] ?? key);
  }

  if (containerTypeContainer && containerTypeCard) {
    renderFilterOptions(containerTypeContainer, containerTypeCard, collectContainerTypeOptions(matches), matches,
      s => s.containerType, "containertypes", val => val === "Zakloos" ? "Zonder zak" : "Met zak");
  }

  if (brandContainer && brandCard) {
    renderFilterOptions(brandContainer, brandCard, collectBrandOptions(matches), matches, s => formatBrandLabel(s.merk), "brands");
  }

  if (functieContainer && functieCard) {
    const functieValueFn = s => FUNCTIE_DEFINITIES.filter(f => f.check(s)).map(f => f.key);
    const labelFn = key => FUNCTIE_DEFINITIES.find(f => f.key === key)?.label ?? key;
    renderFilterOptions(functieContainer, functieCard, collectFunctieOptions(matches), matches, functieValueFn, "functies", labelFn);
  }

  if (aanbiederContainer && aanbiederCard) {
    renderFilterOptions(aanbiederContainer, aanbiederCard, collectAanbiederOptions(matches), matches, s => (s.aanbieders ?? []).map(a => a.winkel), "aanbieder");
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
    priceFilter:    { set: filterState.priceLabels },
    weightFilter:   { set: filterState.weightLabels },
    vloertypes:     { set: filterState.vloertypes },
    containertypes: { set: filterState.containertypes },
    brands:         { set: filterState.brands },
    functies:       { set: filterState.functies },
    aanbieder:      { set: filterState.aanbieder },
  };

  if (!setMap[name]) return;

  const { set } = setMap[name];

  if (value === "all") {
    set.clear();
  } else if (input.checked) {
    set.add(value);
  } else {
    set.delete(value);
  }

  renderAllFilters();
  applyFilters();
}

export async function initFilters() {
  const filtersPanel = qs("#filtersPanel");
  if (!filtersPanel) return;

  const answersData  = localStorage.getItem("stofzuiger_answers");
  const bestTypeData = localStorage.getItem("stofzuiger_bestType");

  filterState.answers  = answersData ? JSON.parse(answersData) : null;
  filterState.bestType = bestTypeData ?? "";

  let allStofzuigers = [];
  try {
    const raw = await fetchProducts();
    allStofzuigers = normalizeProducts(raw ?? []);
  } catch {
    allStofzuigers = [];
  }

  // Budget uit de quiz (maximumbedrag) is een echte grens, net als in de quiz.
  // Past er van dit type niets binnen, dan zonder grens (zelfde vangnet).
  const cap = Number(filterState.answers?.budget) || null;
  const zonderGrens = matchStofzuigers(allStofzuigers, filterState.answers ?? {}, null);
  let result = cap ? matchStofzuigers(allStofzuigers, filterState.answers ?? {}, cap) : zonderGrens;
  const budgetZonderMatch = Boolean(cap && !(result.filteredMatchedStofzuigers?.length));
  if (budgetZonderMatch) result = zonderGrens;
  filterState.baseMatches = Array.isArray(result.filteredMatchedStofzuigers) ? result.filteredMatchedStofzuigers : [];

  // Fallback: if the live fetch/computation yields nothing, seed the pool
  // with the stofzuigers that were already matched during the quiz.
  if (filterState.baseMatches.length === 0) {
    const storedData = localStorage.getItem("stofzuiger_filteredMatchedStofzuigers");
    if (storedData) {
      try {
        const stored = JSON.parse(storedData);
        if (Array.isArray(stored) && stored.length > 0) {
          filterState.baseMatches = stored;
        }
      } catch { /* ignore */ }
    }
  }

  filterState.priceGroups  = computeDynamicPriceGroups(filterState.baseMatches);
  filterState.weightGroups = computeDynamicWeightGroups(filterState.baseMatches);

  filterState.priceLabels = new Set();

  renderAllFilters();

  filtersPanel.addEventListener("change", handleFilterChange);

  const clearBtn = qs("#clearFiltersBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      filterState.priceLabels.clear();
      filterState.weightLabels.clear();
      filterState.vloertypes.clear();
      filterState.containertypes.clear();
      filterState.brands.clear();
      filterState.functies.clear();
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

// ───────── budget: "Meer budget?" en het vangnet als er niets binnen past ─────────
const euroLabel = n => "€" + Math.round(n).toLocaleString("nl-NL");
const WENS_VOORDEEL = {
  huisdieren: "een stofzuiger voor huisdierharen", allergie: "een filter voor allergie (HEPA)",
  parket: "een parketborstel", dweilen: "een stofzuiger die ook dweilt", accu: "een extra of wisselbare accu",
};

// Welke wens heeft de beste stofzuiger boven het budget, die geen enkele
// zichtbare stofzuiger binnen het budget zeker heeft? Dan noemen we die.
function wensBovenBudget(buiten, binnen, a) {
  const kandidaten = lijst(a?.extraAnswers).map(w => [WENS_VOORDEEL[w], s => heeftExtra(s, w) === true]);
  if (a?.zak === "met_zak" || a?.zak === "zonder_zak") kandidaten.unshift([a.zak === "met_zak" ? "een stofzuiger met zak" : "een zakloze stofzuiger", s => voldoetAanZak(s, a.zak) === true]);
  if (a?.woning) kandidaten.push([a.stofzuigerType === "Steelstofzuiger" ? "een langere accuduur voor je woning" : "een langer snoer voor je woning", s => genoegBereik(s, a.woning) === true]);
  return kandidaten.find(([naam, f]) => naam && f(buiten) && !binnen.some(f))?.[0] ?? null;
}

function initBudgetNote({ cap, result: binnen, zonderGrens, budgetZonderMatch }) {
  const binnenLijst = binnen.filteredMatchedStofzuigers ?? [];
  const kaart = document.createElement("div");
  kaart.className = "budget-kaart";
  kaart.setAttribute("role", "note");

  if (budgetZonderMatch) {
    meet("budget_kaart", { actie: "niets_binnen_budget" });
    kaart.innerHTML = `<p><strong>Binnen ${euroLabel(cap)} vonden we van dit type geen stofzuiger.</strong> Dit zijn de stofzuigers die het best bij je wensen passen, vanaf de goedkoopste.</p>`;
    plaatsBudgetKaart(kaart);
    return;
  }

  // Alleen tonen als er boven het budget stofzuigers zijn die duidelijk beter bij
  // de wensen passen (passcore zonder prijsdeel). Vergelijk met wat je binnen
  // budget echt ziet (2+ winkels), en tel erboven ook alleen wat je standaard ziet.
  const zichtbaarBinnen = binnenLijst.filter(sb => (sb.aanbieders ?? []).length >= DEFAULT_MIN_AANBIEDERS);
  const topBinnen = zichtbaarBinnen.length ? Math.max(...zichtbaarBinnen.map(sb => sb.wens)) : binnen.topWens;
  const drempel = (topBinnen ?? -Infinity) + BAND_BESTE;
  const beter = (zonderGrens.filteredMatchedStofzuigers ?? []).filter(sb => parsePrice(sb.prijs) > cap && sb.wens >= drempel);
  const zichtbaar = beter.filter(sb => (sb.aanbieders ?? []).length >= DEFAULT_MIN_AANBIEDERS);
  const goedkoopsteBuiten = zichtbaar.map(sb => parsePrice(sb.prijs)).filter(Number.isFinite).sort((a, b) => a - b)[0];
  if (!goedkoopsteBuiten) return;
  const buitenBeste = kiesBesteMatch(zichtbaar);
  const reden = buitenBeste ? wensBovenBudget(buitenBeste, zichtbaarBinnen, filterState.answers) : null;
  const meer = goedkoopsteBuiten - cap;
  let toontBuiten = false;
  const teken = () => {
    kaart.innerHTML = toontBuiten
      ? `<div class="budget-kaart-tekst"><strong>Je ziet nu stofzuigers boven je budget</strong><span>Vanaf ${euroLabel(goedkoopsteBuiten)}. Liever binnen je budget blijven?</span></div>
         <button type="button" class="budget-kaart-btn">Terug naar stofzuigers tot ${euroLabel(cap)}</button>`
      : reden
        ? `<div class="budget-kaart-tekst"><strong>Meer budget? Dan krijg je ${reden}</strong><span>Binnen je budget is dat er niet bij 2 of meer winkels. Vanaf ${euroLabel(goedkoopsteBuiten)}, ${euroLabel(meer)} boven je budget.</span></div>
           <button type="button" class="budget-kaart-btn">Bekijk deze stofzuigers</button>`
        : `<div class="budget-kaart-tekst"><strong>Meer budget? Er zijn stofzuigers die nog beter bij je wensen passen</strong><span>Vanaf ${euroLabel(goedkoopsteBuiten)}, ${euroLabel(meer)} boven je budget.</span></div>
           <button type="button" class="budget-kaart-btn">Bekijk deze stofzuigers</button>`;
    kaart.querySelector(".budget-kaart-btn").addEventListener("click", () => {
      toontBuiten = !toontBuiten;
      meet("budget_kaart", { actie: toontBuiten ? "klik_meer_budget" : "klik_terug", reden: reden ? "wens" : "score" });
      lijstSoort = toontBuiten ? "boven_budget" : "binnen_budget";
      filterState.baseMatches = toontBuiten ? beter : binnenLijst;
      filterState.priceGroups = computeDynamicPriceGroups(filterState.baseMatches);
      filterState.weightGroups = computeDynamicWeightGroups(filterState.baseMatches);
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
// daarna steeds terug direct na de eerste stofzuiger.
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
const meet = (naam, props) => window.phTrackEvent?.(naam, { categorie: "stofzuiger", ...props });
let lijstSoort = "binnen_budget";

function initMeting(cap) {
  const budget = cap ? String(cap) : "geen_voorkeur";
  const zichtbaar = () => document.querySelectorAll("#otherMatchesGrid > .rcard").length;
  // Meegestuurd met elke winkelklik (shared/analytics.js)
  window.phResultaatContext = () => ({ budget, lijst: zichtbaar(), lijst_soort: lijstSoort });
  const beste = kiesBesteMatch(filterKeten().filter(genoegWinkels));
  meet("resultaat_getoond", {
    budget, type: filterState.answers?.stofzuigerType ?? "", woning: filterState.answers?.woning ?? "",
    extra: lijst(filterState.answers?.extraAnswers).join("+"), lijst: zichtbaar(), beste_merk: beste?.merk ?? "",
  });
}
