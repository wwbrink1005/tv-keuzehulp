import { priceGroupsFallback } from "./data.js";
import {
  matchKoffiemachines, classificeerType, kiesBesteMatch, heeftWens, wensenVan, lijst,
  applyMinAanbiedersCascade, BAND_BESTE, DEFAULT_MIN_AANBIEDERS,
} from "./matching.js";
import { computeDynamicPriceGroups, normalizeProducts, parsePrice, qs } from "./utils.js";
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
  priceLabels:      new Set(),
  typeProducts:     new Set(),
  koffieInvoertypes: new Set(),
  capsuleSystemen:  new Set(),
  brands:           new Set(),
  kleuren:          new Set(),
  functies:         new Set(),
  varianten:        new Set(),
  aanbieder:        new Set(),
  minAanbieders:    DEFAULT_MIN_AANBIEDERS,
  baseMatches:      [],
  answers:          null,
  bestType:         "",
};

const FUNCTIE_DEFINITIES = [
  { key: "ingebouwde-molen", label: "Ingebouwde molen",       check: b => b.molen === true },
  { key: "melk-auto",        label: "Cappuccino op één knop", check: b => b.melk === "auto" },
  { key: "melkopschuimer",   label: "Stoompijpje",            check: b => b.melk === "stoom" },
  { key: "tweekopjes",       label: "Twee kopjes tegelijk",   check: b => b.tweeKopjes === true },
  { key: "wifi",             label: "App-bediening",          check: b => b.app === true },
  { key: "thermoskan",       label: "Thermoskan",             check: b => b.thermoskan === true },
  { key: "timer",            label: "Timer",                  check: b => b.timer === true },
  { key: "touchbediening",   label: "Touchbediening",          check: b => b.bediening.includes("Touch") },
  { key: "display",          label: "Ingebouwd display",      check: b => b.display === "Ja" },
  { key: "zelfreinigend",    label: "Zelfreinigend",          check: b => b.zelfreinigend === "Ja" },
  { key: "antikalk",         label: "Automatisch ontkalken",  check: b => b.automatischAntikalk === "Ja" },
];

// Gebruikt dezelfde gecorrigeerde classificatie als de quiz (classificeerType
// in matching.js) — niet los op het rauwe (soms foutieve) "Type product"-veld
// filteren, anders zou een Dolce Gusto-capsulemachine die Icecat onterecht
// als "Espressomachine" labelt hier onder "Espressomachine" verschijnen
// terwijl de quiz 'm terecht als capsulemachine behandelt.
const TYPE_LABELS = {
  volautomaat:  "Volautomaat",
  halfautomaat: "Halfautomaat/handmatig",
  capsules:     "Capsules/pads",
  filter:       "Filterkoffiezetapparaat",
};

function getTypeLabel(koffiemachine) {
  const type = classificeerType(koffiemachine);
  if (type) return TYPE_LABELS[type];
  // Fallback voor Combinatiekoffiemachine/onbekende combinaties: rauwe waarde
  // tonen i.p.v. helemaal niet filterbaar te zijn.
  return koffiemachine.typeProduct || null;
}

// Price buckets are recomputed fresh from the live-fetched catalog op elke
// resultaatpagina-load, nooit vertrouwd op de quiz-time localStorage-snapshot.
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
  return base.filter(b => {
    const price = parsePrice(b.prijs);
    return groups.some(g => price >= g.min && (price < g.max || g.max === Number.POSITIVE_INFINITY));
  });
}

// Basis voor de tellingen op alle secundaire filterkaarten: prijs-gescoped
// én al beperkt tot de huidige "aantal winkels"-drempel, zodat de getoonde
// aantallen kloppen met wat er na alle filters daadwerkelijk overblijft.
// Welke opties een filterkaart toont: alles uit de quizuitslag (alleen de
// winkelregel telt mee), NIET beperkt door de andere gekozen filters. Zo
// blijft een optie die door bv. een prijskeuze op 0 komt grijs in beeld
// staan in plaats van te verdwijnen. Het aantal erachter telt wel met alle
// andere filters (zie zonderSelectie/telOpties).
function getSecondaryScopedMatches() {
  return getBaseScopedByMinAanbieders();
}

// Voor de prijsfilter-kaart zelf: die rekent zijn eigen buckets uit de
// ongescoopte basis, dus alleen de winkel-drempel toepassen, niet prijs zelf.
function getBaseScopedByMinAanbieders() {
  return getBaseMatches().filter(b => (b.aanbieders ?? []).length >= filterState.minAanbieders);
}

function formatBrandLabel(brand) {
  const raw = String(brand ?? "").trim();
  if (!raw) return "";
  if (raw === raw.toUpperCase()) return raw;
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function collectTypeProductOptions(matches) {
  const set = new Set();
  matches.forEach(b => { const label = getTypeLabel(b); if (label) set.add(label); });
  return Array.from(set);
}

function collectKoffieInvoertypeOptions(matches) {
  const set = new Set();
  matches.forEach(b => {
    String(b.koffieInvoertype || "").split(",").map(s => s.trim()).filter(Boolean).forEach(t => set.add(t));
  });
  const order = ["Koffiebonen", "Gemalen koffie", "Koffiecapsule", "Koffiepad"];
  const inOrder = order.filter(t => set.has(t));
  set.forEach(t => { if (!order.includes(t)) inOrder.push(t); });
  return inOrder;
}

function collectCapsuleSysteemOptions(matches) {
  const set = new Set();
  matches.forEach(b => { if (b.capsuleSysteem) set.add(b.capsuleSysteem); });
  const order = ["Nespresso", "Nespresso VertuoLine", "Senseo", "Dolce Gusto", "L'OR"];
  const inOrder = order.filter(t => set.has(t));
  set.forEach(t => { if (!order.includes(t)) inOrder.push(t); });
  return inOrder;
}

function collectBrandOptions(matches) {
  const set = new Set();
  matches.forEach(b => { const label = formatBrandLabel(b.merk); if (label) set.add(label); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "nl"));
}

function collectKleurOptions(matches) {
  const set = new Set();
  matches.forEach(b => { if (b.kleur) set.add(b.kleur); });
  const order = ["Zwart", "Wit", "Zilver", "Grijs", "Roestvrijstaal"];
  const inOrder = order.filter(t => set.has(t));
  set.forEach(t => { if (!order.includes(t)) inOrder.push(t); });
  return inOrder;
}

function collectFunctieOptions(matches) {
  return FUNCTIE_DEFINITIES.filter(f => matches.some(f.check)).map(f => f.key);
}

function collectVariantenOptions(matches) {
  const set = new Set();
  matches.forEach(b => (b.varianten ?? []).forEach(v => set.add(v)));
  return Array.from(set).sort((a, b) => a.localeCompare(b, "nl"));
}

function collectAanbiederOptions(matches) {
  const set = new Set();
  matches.forEach(b => {
    (b.aanbieders ?? []).forEach(a => set.add(a.winkel));
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

  if (filterState.typeProducts.size > 0) {
    filtered = filtered.filter(b => filterState.typeProducts.has(getTypeLabel(b)));
  }

  if (filterState.koffieInvoertypes.size > 0) {
    filtered = filtered.filter(b =>
      String(b.koffieInvoertype || "").split(",").map(s => s.trim()).some(t => filterState.koffieInvoertypes.has(t))
    );
  }

  if (filterState.capsuleSystemen.size > 0) {
    filtered = filtered.filter(b => filterState.capsuleSystemen.has(b.capsuleSysteem));
  }

  if (filterState.brands.size > 0) {
    filtered = filtered.filter(b => filterState.brands.has(formatBrandLabel(b.merk)));
  }

  if (filterState.kleuren.size > 0) {
    filtered = filtered.filter(b => filterState.kleuren.has(b.kleur));
  }

  if (filterState.functies.size > 0) {
    filtered = filtered.filter(b =>
      FUNCTIE_DEFINITIES.filter(f => filterState.functies.has(f.key)).every(f => f.check(b))
    );
  }

  if (filterState.varianten.size > 0) {
    filtered = filtered.filter(b =>
      Array.from(filterState.varianten).every(v => (b.varianten ?? []).includes(v))
    );
  }

  if (filterState.aanbieder.size > 0) {
    filtered = filtered.filter(b =>
      (b.aanbieders ?? []).some(a => filterState.aanbieder.has(a.winkel))
    );
  }

  // "Aantal winkels" als allerlaatste stap toepassen, met cascade-fallback:
  // levert de gekozen (of standaard) drempel 0 resultaten op in combinatie
  // met de overige filters, dan automatisch verlagen tot en met 1. Als dat
  // de selectie wijzigt, opnieuw renderen zodat de zijbalk het laat zien.

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
  const hasActive = filterState.priceLabels.size > 0 || filterState.typeProducts.size > 0 ||
    filterState.koffieInvoertypes.size > 0 || filterState.capsuleSystemen.size > 0 || filterState.brands.size > 0 || filterState.kleuren.size > 0 ||
    filterState.functies.size > 0 || filterState.varianten.size > 0 || filterState.aanbieder.size > 0 ||
    filterState.minAanbieders !== DEFAULT_MIN_AANBIEDERS;
  btn.hidden = !hasActive;
}

function renderMinAanbiedersOptions(container, card) {
  if (!container || !card) return;
  const matches = filterKeten();
  const options = MIN_AANBIEDERS_OPTIONS.map(n => ({
    n,
    count: matches.filter(b => (b.aanbieders ?? []).length >= n).length,
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
  const typeContainer       = qs("[data-filter-container='type']");
  const invoerContainer     = qs("[data-filter-container='invoertype']");
  const capsuleContainer    = qs("[data-filter-container='capsulesysteem']");
  const brandContainer      = qs("[data-filter-container='brand']");
  const kleurContainer      = qs("[data-filter-container='kleur']");
  const functieContainer    = qs("[data-filter-container='functies']");
  const variantenContainer  = qs("[data-filter-container='varianten']");
  const aanbiederContainer  = qs("[data-filter-container='aanbieder']");

  const priceCard      = qs(".filter-card[data-filter='price']");
  const minAanbiedersCard = qs(".filter-card[data-filter='min-aanbieders']");
  const typeCard       = qs(".filter-card[data-filter='type']");
  const invoerCard     = qs(".filter-card[data-filter='invoertype']");
  const capsuleCard    = qs(".filter-card[data-filter='capsulesysteem']");
  const brandCard      = qs(".filter-card[data-filter='brand']");
  const kleurCard      = qs(".filter-card[data-filter='kleur']");
  const functieCard    = qs(".filter-card[data-filter='functies']");
  const variantenCard  = qs(".filter-card[data-filter='varianten']");
  const aanbiederCard  = qs(".filter-card[data-filter='aanbieder']");

  // Vóór de andere kaarten: bepaalt/valideert filterState.minAanbieders,
  // zodat `matches` hieronder de juiste drempel gebruikt.
  renderMinAanbiedersOptions(minAanbiedersContainer, minAanbiedersCard);
  const matches = getSecondaryScopedMatches();

  if (priceContainer && priceCard) {
    const groups = getDynamicPriceGroups();
    const base = getBaseScopedByMinAanbieders();
    const groupForPrice = price => groups.find(g => price >= g.min && (price < g.max || g.max === Number.POSITIVE_INFINITY));
    const counts = computeCounts(zonderSelectie(filterState.priceLabels), b => groupForPrice(parsePrice(b.prijs))?.label);
    const opBasis = computeCounts(base, b => groupForPrice(parsePrice(b.prijs))?.label);
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

  if (typeContainer && typeCard) {
    renderFilterOptions(typeContainer, typeCard, collectTypeProductOptions(matches), matches, getTypeLabel, "typeProducts");
  }

  if (invoerContainer && invoerCard) {
    renderFilterOptions(invoerContainer, invoerCard, collectKoffieInvoertypeOptions(matches), matches,
      b => String(b.koffieInvoertype || "").split(",").map(s => s.trim()).filter(Boolean), "koffieInvoertypes");
  }

  if (capsuleContainer && capsuleCard) {
    renderFilterOptions(capsuleContainer, capsuleCard, collectCapsuleSysteemOptions(matches), matches, b => b.capsuleSysteem, "capsuleSystemen");
  }

  if (brandContainer && brandCard) {
    renderFilterOptions(brandContainer, brandCard, collectBrandOptions(matches), matches, b => formatBrandLabel(b.merk), "brands");
  }

  if (kleurContainer && kleurCard) {
    renderFilterOptions(kleurContainer, kleurCard, collectKleurOptions(matches), matches, b => b.kleur, "kleuren");
  }

  if (functieContainer && functieCard) {
    const functieValueFn = b => FUNCTIE_DEFINITIES.filter(f => f.check(b)).map(f => f.key);
    const labelFn = key => FUNCTIE_DEFINITIES.find(f => f.key === key)?.label ?? key;
    renderFilterOptions(functieContainer, functieCard, collectFunctieOptions(matches), matches, functieValueFn, "functies", labelFn);
  }

  if (variantenContainer && variantenCard) {
    renderFilterOptions(variantenContainer, variantenCard, collectVariantenOptions(matches), matches, b => b.varianten ?? [], "varianten");
  }

  if (aanbiederContainer && aanbiederCard) {
    renderFilterOptions(aanbiederContainer, aanbiederCard, collectAanbiederOptions(matches), matches, b => (b.aanbieders ?? []).map(a => a.winkel), "aanbieder");
  }

  updateClearFiltersBtn();
}

function handleFilterChange(event) {
  const input = event.target.closest("input");
  if (!input) return;
  meet("filter_gebruikt", { filter: input.closest(".filter-card")?.dataset.filter || input.name, waarde: input.value === "all" ? "alle" : String(input.value).slice(0, 40) });

  const name  = input.name;
  const value = input.value;

  // Enkelvoudige drempel-keuze (radio), geen Set — apart afgehandeld.
  if (name === "minAanbiedersFilter") {
    filterState.minAanbieders = parseInt(value, 10);
    renderAllFilters();
    applyFilters();
    return;
  }

  const setMap = {
    priceFilter:       { set: filterState.priceLabels },
    typeProducts:      { set: filterState.typeProducts },
    koffieInvoertypes: { set: filterState.koffieInvoertypes },
    capsuleSystemen:   { set: filterState.capsuleSystemen },
    brands:            { set: filterState.brands },
    kleuren:           { set: filterState.kleuren },
    functies:          { set: filterState.functies },
    varianten:         { set: filterState.varianten },
    aanbieder:         { set: filterState.aanbieder },
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

  const answersData   = localStorage.getItem("koffiemachine_answers");
  const bestTypeData  = localStorage.getItem("koffiemachine_bestType");

  filterState.answers  = answersData ? JSON.parse(answersData) : null;
  filterState.bestType = bestTypeData ?? "";

  let allKoffiemachines = [];
  try {
    const raw = await fetchProducts();
    allKoffiemachines = normalizeProducts(raw ?? []);
  } catch {
    allKoffiemachines = [];
  }

  // Budget uit de quiz (maximumbedrag) is een echte grens, net als in de quiz.
  // Past er niets binnen, dan zonder grens (zelfde vangnet).
  const cap = Number(filterState.answers?.budget) || null;
  const zonderGrens = matchKoffiemachines(allKoffiemachines, filterState.answers ?? {}, null);
  let result = cap ? matchKoffiemachines(allKoffiemachines, filterState.answers ?? {}, cap) : zonderGrens;
  const budgetZonderMatch = Boolean(cap && !(result.filteredMatchedKoffiemachines?.length));
  if (budgetZonderMatch) result = zonderGrens;
  filterState.baseMatches = Array.isArray(result.filteredMatchedKoffiemachines) ? result.filteredMatchedKoffiemachines : [];

  // Fallback: if the live fetch/computation yields nothing, seed the pool
  // with the koffiemachines that were already matched during the quiz.
  if (filterState.baseMatches.length === 0) {
    const storedData = localStorage.getItem("koffiemachine_filteredMatchedKoffiemachines");
    if (storedData) {
      try {
        const stored = JSON.parse(storedData);
        if (Array.isArray(stored) && stored.length > 0) {
          filterState.baseMatches = stored;
        }
      } catch { /* ignore */ }
    }
  }

  filterState.priceGroups = computeDynamicPriceGroups(filterState.baseMatches);

  filterState.priceLabels = new Set();

  renderAllFilters();

  filtersPanel.addEventListener("change", handleFilterChange);

  const clearBtn = qs("#clearFiltersBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      filterState.priceLabels.clear();
      filterState.typeProducts.clear();
      filterState.koffieInvoertypes.clear();
      filterState.capsuleSystemen.clear();
      filterState.brands.clear();
      filterState.kleuren.clear();
      filterState.functies.clear();
      filterState.varianten.clear();
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
  filterState.priceGroups = computeDynamicPriceGroups(filterState.baseMatches);
}

// ───────── budget: "Meer budget?" en het vangnet als er niets binnen past ─────────
const euroLabel = n => "€" + Math.round(n).toLocaleString("nl-NL");
const WENS_VOORDEEL = {
  "melk-auto": "cappuccino op één knop", "melk-stoom": "een stoompijpje om melk op te schuimen", melk: "cappuccino en latte",
  molen: "een ingebouwde bonenmaler", tweekopjes: "twee kopjes tegelijk", app: "bediening met de app",
  dranken: "veel koffiesoorten op één knop", thermoskan: "een thermoskan", timer: "een timer", grind: "een bonenmaler",
};

// Welke wens heeft de beste koffiemachine boven het budget, die geen enkele
// zichtbare koffiemachine binnen het budget zeker heeft? Dan noemen we die.
function wensBovenBudget(buiten, binnen, a) {
  const kandidaten = wensenVan(a).map(w => [WENS_VOORDEEL[w], v => heeftWens(v, w) === true]);
  return kandidaten.find(([naam, f]) => naam && f(buiten) && !binnen.some(f))?.[0] ?? null;
}

function initBudgetNote({ cap, result: binnen, zonderGrens, budgetZonderMatch }) {
  const binnenLijst = binnen.filteredMatchedKoffiemachines ?? [];
  const kaart = document.createElement("div");
  kaart.className = "budget-kaart";
  kaart.setAttribute("role", "note");

  if (budgetZonderMatch) {
    meet("budget_kaart", { actie: "niets_binnen_budget" });
    kaart.innerHTML = `<p><strong>Binnen ${euroLabel(cap)} vonden we geen koffiemachine van dit type.</strong> Dit zijn de koffiemachines die het best bij je wensen passen, vanaf de goedkoopste.</p>`;
    plaatsBudgetKaart(kaart);
    return;
  }

  // Alleen tonen als er boven het budget koffiemachines zijn die duidelijk beter
  // bij de wensen passen (passcore zonder prijsdeel), bij 2+ winkels.
  const zichtbaarBinnen = binnenLijst.filter(v => (v.aanbieders ?? []).length >= DEFAULT_MIN_AANBIEDERS);
  const topBinnen = zichtbaarBinnen.length ? Math.max(...zichtbaarBinnen.map(v => v.wens)) : binnen.topWens;
  const drempel = (topBinnen ?? -Infinity) + BAND_BESTE;
  const beter = (zonderGrens.filteredMatchedKoffiemachines ?? []).filter(v => parsePrice(v.prijs) > cap && v.wens >= drempel);
  const zichtbaar = beter.filter(v => (v.aanbieders ?? []).length >= DEFAULT_MIN_AANBIEDERS);
  const goedkoopsteBuiten = zichtbaar.map(v => parsePrice(v.prijs)).filter(Number.isFinite).sort((a, b) => a - b)[0];
  if (!goedkoopsteBuiten) return;
  const buitenBeste = kiesBesteMatch(zichtbaar);
  const reden = buitenBeste ? wensBovenBudget(buitenBeste, zichtbaarBinnen, filterState.answers) : null;
  const meer = goedkoopsteBuiten - cap;
  let toontBuiten = false;
  const teken = () => {
    kaart.innerHTML = toontBuiten
      ? `<div class="budget-kaart-tekst"><strong>Je ziet nu koffiemachines boven je budget</strong><span>Vanaf ${euroLabel(goedkoopsteBuiten)}. Liever binnen je budget blijven?</span></div>
         <button type="button" class="budget-kaart-btn">Terug naar koffiemachines tot ${euroLabel(cap)}</button>`
      : reden
        ? `<div class="budget-kaart-tekst"><strong>Meer budget? Dan krijg je ${reden}</strong><span>Binnen je budget is dat er niet. Vanaf ${euroLabel(goedkoopsteBuiten)}, ${euroLabel(meer)} boven je budget.</span></div>
           <button type="button" class="budget-kaart-btn">Bekijk deze koffiemachines</button>`
        : `<div class="budget-kaart-tekst"><strong>Meer budget? Er zijn koffiemachines die nog beter bij je wensen passen</strong><span>Vanaf ${euroLabel(goedkoopsteBuiten)}, ${euroLabel(meer)} boven je budget.</span></div>
           <button type="button" class="budget-kaart-btn">Bekijk deze koffiemachines</button>`;
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
// daarna steeds terug direct na de eerste koffiemachine.
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
const meet = (naam, props) => window.phTrackEvent?.(naam, { categorie: "koffiemachine", ...props });
let lijstSoort = "binnen_budget";

function initMeting(cap) {
  const budget = cap ? String(cap) : "geen_voorkeur";
  const zichtbaar = () => document.querySelectorAll("#otherMatchesGrid > .rcard").length;
  // Meegestuurd met elke winkelklik (shared/analytics.js)
  window.phResultaatContext = () => ({ budget, lijst: zichtbaar(), lijst_soort: lijstSoort });
  const a = filterState.answers ?? {};
  const beste = kiesBesteMatch(filterKeten().filter(v => (v.aanbieders ?? []).length >= filterState.minAanbieders));
  meet("resultaat_getoond", {
    budget, type: a.type ?? "", systeem: a.systeem ?? "", melk: a.melk ?? "", molen: a.molen ?? "",
    extra: lijst(a.extraAnswers).join("+"), lijst: zichtbaar(), beste_merk: beste?.merk ?? "",
  });
}
