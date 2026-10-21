import { priceGroupsBySize, is4KOfMeer, AANBEVOLEN_SCHERPTE } from "./data.js";
import {
  matchMonitors, kiesBesteMatch, heeftWens, voldoetAanGame, beeldWensen, extraWensen, scherpGenoeg,
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
  priceLabels:  new Set(),
  minAanbieders: DEFAULT_MIN_AANBIEDERS,
  sizes:        new Set(),
  brands:       new Set(),
  panelTypes:   new Set(),
  resolutions:  new Set(),
  hzOptions:    new Set(),
  aspectRatios: new Set(),
  // Gebogen scherm, ingebouwde speakers en USB-C waren 3 losse Ja/Nee-
  // kaarten — samengevoegd tot 1 "Functies"-kaart (zie FUNCTIE_DEFINITIES).
  functies:     new Set(),
  hdmiOptions:  new Set(),
  aanbieder:    new Set(),
  baseMatches:  [],
  answers:      null,
  scores:       null,
  bestType:     "",
  sizeGroup:    ""
};

// Sinds okt. 2026 ook de nieuwe Icecat-velden (hoogte, webcam, opladen via
// USB-C, HDMI 2.1). Alleen wat zeker is telt: een onbekend veld is geen "ja".
const FUNCTIE_DEFINITIES = [
  { key: "hoogte", label: "In hoogte verstelbaar", check: m => heeftWens(m, "hoogte") === true },
  { key: "usbcladen", label: "Laptop opladen via USB-C", check: m => heeftWens(m, "usbc") === true },
  { key: "usbc", label: "USB-C", check: m => m.usb_c === "Ja" },
  { key: "webcam", label: "Ingebouwde webcam", check: m => heeftWens(m, "webcam") === true },
  { key: "speakers", label: "Ingebouwde speakers", check: m => m.speakers === "Ja" },
  { key: "curved", label: "Gebogen scherm", check: m => m.gebogen === "Ja" },
  { key: "hdmi21", label: "HDMI 2.1 (PS5/Xbox op 120 Hz)", check: m => (m.hdmiVersie ?? 0) >= 2.1 },
];

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

function formatBrandLabel(brand) {
  const raw = String(brand ?? "").trim();
  if (!raw) return "";
  if (raw === raw.toUpperCase()) return raw;
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function getBaseMatches() {
  return filterState.baseMatches;
}

function getPriceScopedMatches() {
  const base = getBaseMatches();
  if (filterState.priceLabels.size === 0) return base;
  const groups = getDynamicPriceGroups(filterState.sizeGroup)
    .filter(g => filterState.priceLabels.has(g.label));
  if (groups.length === 0) return base;
  return base.filter(m => {
    const price = parsePrice(m.prijs);
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
  return getBaseMatches().filter(m => (m.aanbieders ?? []).length >= filterState.minAanbieders);
}

function collectSizeOptions(matches) {
  const set = new Set();
  matches.forEach(m => { if (m.schermdiagonaal) set.add(m.schermdiagonaal); });
  return Array.from(set).sort((a, b) => a - b);
}

function collectBrandOptions(matches) {
  const set = new Set();
  matches.forEach(m => { const label = formatBrandLabel(m.merk); if (label) set.add(label); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "nl"));
}

function collectPanelTypeOptions(matches) {
  const set = new Set();
  matches.forEach(m => { if (m.paneeltype) set.add(m.paneeltype); });
  const order = ["IPS", "OLED", "VA", "TN"];
  const inOrder = order.filter(t => set.has(t));
  set.forEach(t => { if (!order.includes(t)) inOrder.push(t); });
  return inOrder;
}

function collectResolutionOptions(matches) {
  const set = new Set();
  matches.forEach(m => { if (m.resolutie) set.add(m.resolutie); });
  const order = ["Full HD", "QHD", "UWFHD", "UWQHD", "4K", "WUXGA"];
  const inOrder = order.filter(t => set.has(t));
  set.forEach(t => { if (!order.includes(t)) inOrder.push(t); });
  return inOrder;
}

function collectHzOptions(matches) {
  const set = new Set();
  matches.forEach(m => { if (m.hz) set.add(m.hz); });
  return Array.from(set).sort((a, b) => a - b);
}

function collectAspectRatioOptions(matches) {
  const set = new Set();
  matches.forEach(m => { if (m.beeldverhouding) set.add(m.beeldverhouding); });
  const order = ["16:9", "16:10", "21:9", "32:9"];
  const inOrder = order.filter(t => set.has(t));
  set.forEach(t => { if (!order.includes(t)) inOrder.push(t); });
  return inOrder;
}

function collectFunctieOptions(matches) {
  return FUNCTIE_DEFINITIES.filter(f => matches.some(f.check)).map(f => f.key);
}

function collectHdmiOptions(matches) {
  const set = new Set();
  matches.forEach(m => { if (m.hdmi_poorten) set.add(m.hdmi_poorten); });
  return Array.from(set).sort((a, b) => a - b);
}

function collectAanbiederOptions(matches) {
  const set = new Set();
  matches.forEach(m => {
    (m.aanbieders ?? []).forEach(a => set.add(a.winkel));
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

  if (filterState.sizes.size > 0) {
    filtered = filtered.filter(m => filterState.sizes.has(m.schermdiagonaal));
  }

  if (filterState.brands.size > 0) {
    filtered = filtered.filter(m => filterState.brands.has(formatBrandLabel(m.merk)));
  }

  if (filterState.panelTypes.size > 0) {
    filtered = filtered.filter(m => filterState.panelTypes.has(m.paneeltype));
  }

  if (filterState.resolutions.size > 0) {
    filtered = filtered.filter(m => filterState.resolutions.has(m.resolutie));
  }

  if (filterState.hzOptions.size > 0) {
    filtered = filtered.filter(m => filterState.hzOptions.has(m.hz));
  }

  if (filterState.aspectRatios.size > 0) {
    filtered = filtered.filter(m => filterState.aspectRatios.has(m.beeldverhouding));
  }

  if (filterState.functies.size > 0) {
    filtered = filtered.filter(m =>
      FUNCTIE_DEFINITIES.filter(f => filterState.functies.has(f.key)).every(f => f.check(m))
    );
  }

  if (filterState.hdmiOptions.size > 0) {
    filtered = filtered.filter(m => filterState.hdmiOptions.has(m.hdmi_poorten));
  }

  if (filterState.aanbieder.size > 0) {
    filtered = filtered.filter(m =>
      (m.aanbieders ?? []).some(a => filterState.aanbieder.has(a.winkel))
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
  const hasActive = filterState.priceLabels.size > 0 || filterState.sizes.size > 0 || filterState.brands.size > 0 ||
    filterState.panelTypes.size > 0 || filterState.resolutions.size > 0 ||
    filterState.hzOptions.size > 0 || filterState.aspectRatios.size > 0 ||
    filterState.functies.size > 0 ||
    filterState.hdmiOptions.size > 0 || filterState.aanbieder.size > 0 ||
    filterState.minAanbieders !== DEFAULT_MIN_AANBIEDERS;
  btn.hidden = !hasActive;
}

function renderMinAanbiedersOptions(container, card) {
  if (!container || !card) return;
  const matches = filterKeten();
  const options = MIN_AANBIEDERS_OPTIONS.map(n => ({
    n,
    count: matches.filter(m => (m.aanbieders ?? []).length >= n).length,
  })).filter(o => o.count > 0);

  // Corrigeer de drempel naar een geldige optie VOORDAT de kaart eventueel
  // wordt verborgen — anders blijft filterState.minAanbieders op een
  // onhaalbare waarde staan en gaan de kaarten hieronder ten onrechte
  // allemaal leeg renderen.
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
  const priceContainer    = qs("[data-filter-container='price']");
  const minAanbiedersContainer = qs("[data-filter-container='min-aanbieders']");
  const sizeContainer     = qs("[data-filter-container='size']");
  const brandContainer    = qs("[data-filter-container='brand']");
  const panelContainer    = qs("[data-filter-container='panel']");
  const resContainer      = qs("[data-filter-container='resolution']");
  const hzContainer       = qs("[data-filter-container='hz']");
  const aspectContainer   = qs("[data-filter-container='aspect']");
  const functieContainer  = qs("[data-filter-container='functies']");
  const hdmiContainer     = qs("[data-filter-container='hdmi']");
  const aanbiederContainer = qs("[data-filter-container='aanbieder']");

  const priceCard     = qs(".filter-card[data-filter='price']");
  const sizeCard      = qs(".filter-card[data-filter='size']");
  const brandCard     = qs(".filter-card[data-filter='brand']");
  const panelCard     = qs(".filter-card[data-filter='panel']");
  const resCard       = qs(".filter-card[data-filter='resolution']");
  const hzCard        = qs(".filter-card[data-filter='hz']");
  const aspectCard    = qs(".filter-card[data-filter='aspect']");
  const functieCard   = qs(".filter-card[data-filter='functies']");
  const hdmiCard      = qs(".filter-card[data-filter='hdmi']");
  const aanbiederCard = qs(".filter-card[data-filter='aanbieder']");
  const minAanbiedersCard = qs(".filter-card[data-filter='min-aanbieders']");

  renderMinAanbiedersOptions(minAanbiedersContainer, minAanbiedersCard);
  const matches = getSecondaryScopedMatches();

  if (priceContainer && priceCard) {
    const base = getBaseScopedByMinAanbieders();
    const groups = getDynamicPriceGroups(filterState.sizeGroup);
    const groupForPrice = price => groups.find(g => price >= g.min && (price < g.max || g.max === Number.POSITIVE_INFINITY));
    const counts = computeCounts(zonderSelectie(filterState.priceLabels), m => groupForPrice(parsePrice(m.prijs))?.label);
    const opBasis = computeCounts(base, m => groupForPrice(parsePrice(m.prijs))?.label);
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

  if (sizeContainer && sizeCard) {
    renderFilterOptions(sizeContainer, sizeCard, collectSizeOptions(matches), matches, m => m.schermdiagonaal, "sizes", s => `${s}"`);
  }

  if (brandContainer && brandCard) {
    renderFilterOptions(brandContainer, brandCard, collectBrandOptions(matches), matches, m => formatBrandLabel(m.merk), "brands");
  }

  if (panelContainer && panelCard) {
    renderFilterOptions(panelContainer, panelCard, collectPanelTypeOptions(matches), matches, m => m.paneeltype, "panelTypes");
  }

  if (resContainer && resCard) {
    renderFilterOptions(resContainer, resCard, collectResolutionOptions(matches), matches, m => m.resolutie, "resolutions");
  }

  if (hzContainer && hzCard) {
    renderFilterOptions(hzContainer, hzCard, collectHzOptions(matches), matches, m => m.hz, "hzOptions", hz => `${hz}Hz`);
  }

  if (aspectContainer && aspectCard) {
    renderFilterOptions(aspectContainer, aspectCard, collectAspectRatioOptions(matches), matches, m => m.beeldverhouding, "aspectRatios");
  }

  if (functieContainer && functieCard) {
    const functieValueFn = m => FUNCTIE_DEFINITIES.filter(f => f.check(m)).map(f => f.key);
    const labelFn = key => FUNCTIE_DEFINITIES.find(f => f.key === key)?.label ?? key;
    renderFilterOptions(functieContainer, functieCard, collectFunctieOptions(matches), matches, functieValueFn, "functies", labelFn);
  }

  if (hdmiContainer && hdmiCard) {
    renderFilterOptions(hdmiContainer, hdmiCard, collectHdmiOptions(matches), matches, m => m.hdmi_poorten, "hdmiOptions", n => `${n} HDMI`);
  }

  if (aanbiederContainer && aanbiederCard) {
    renderFilterOptions(aanbiederContainer, aanbiederCard, collectAanbiederOptions(matches), matches, m => (m.aanbieders ?? []).map(a => a.winkel), "aanbieder");
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
    priceLabels: { set: filterState.priceLabels, parse: v => v },
    sizes:       { set: filterState.sizes,      parse: v => parseFloat(v) },
    brands:      { set: filterState.brands,      parse: v => v },
    panelTypes:  { set: filterState.panelTypes,  parse: v => v },
    resolutions: { set: filterState.resolutions, parse: v => v },
    hzOptions:   { set: filterState.hzOptions,   parse: v => parseInt(v, 10) },
    aspectRatios: { set: filterState.aspectRatios, parse: v => v },
    functies:    { set: filterState.functies,    parse: v => v },
    hdmiOptions: { set: filterState.hdmiOptions, parse: v => parseInt(v, 10) },
    aanbieder:   { set: filterState.aanbieder,   parse: v => v }
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
  const answersData     = localStorage.getItem("monitor_answers");
  const sizeGroupData   = localStorage.getItem("monitor_selectedSizeGroup");
  const bestTypeData    = localStorage.getItem("monitor_bestType");

  filterState.answers   = answersData  ? JSON.parse(answersData)  : null;
  filterState.sizeGroup = sizeGroupData ?? "";
  filterState.priceLabels = new Set();
  filterState.bestType  = bestTypeData ?? "";

  // Fetch & normalize all monitors
  let allMonitors = [];
  try {
    const raw = await fetchProducts();
    allMonitors = normalizeProducts(raw ?? []);
  } catch {
    allMonitors = [];
  }

  // Budget uit de quiz (maximumbedrag) is een echte grens, net als in de quiz.
  // Past er in deze maat niets binnen, dan zonder grens (zelfde vangnet).
  const cap = Number(filterState.answers?.budget) || null;
  const zonderGrens = matchMonitors(allMonitors, filterState.sizeGroup, null, filterState.answers);
  let liveResult = cap ? matchMonitors(allMonitors, filterState.sizeGroup, cap, filterState.answers) : zonderGrens;
  const budgetZonderMatch = Boolean(cap && !(liveResult.filteredMatchedMonitors?.length));
  if (budgetZonderMatch) liveResult = zonderGrens;
  let baseMatches = Array.isArray(liveResult.filteredMatchedMonitors) ? liveResult.filteredMatchedMonitors : [];
  filterState.bestType = liveResult.bestType || filterState.bestType;

  // Fallback: if the live fetch yields nothing, fall back to the matches
  // that were already computed and stored at quiz-submit time.
  if (baseMatches.length === 0) {
    const storedData = localStorage.getItem("monitor_filteredMatchedMonitors");
    if (storedData) {
      try {
        const storedMonitors = JSON.parse(storedData);
        if (Array.isArray(storedMonitors) && storedMonitors.length > 0) {
          baseMatches = storedMonitors;
        }
      } catch { /* ignore */ }
    }
  }

  filterState.baseMatches = baseMatches;
  filterState.priceGroups = computeDynamicPriceGroups(baseMatches, filterState.sizeGroup);

  renderAllFilters();

  // Delegate all filter changes
  filtersPanel.addEventListener("change", handleFilterChange);

  // Clear filters button
  const clearBtn = qs("#clearFiltersBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      filterState.priceLabels.clear();
      filterState.sizes.clear();
      filterState.brands.clear();
      filterState.panelTypes.clear();
      filterState.resolutions.clear();
      filterState.hzOptions.clear();
      filterState.aspectRatios.clear();
      filterState.functies.clear();
      filterState.hdmiOptions.clear();
      filterState.aanbieder.clear();
      filterState.minAanbieders = DEFAULT_MIN_AANBIEDERS;
      renderAllFilters();
      applyFilters();
    });
  }

  // Always use the freshly computed matches so the initial render
  // is consistent with what applyFilters() will produce later.
  applyFilters();
  if (cap && baseMatches.length) initBudgetNote({ cap, result: liveResult, zonderGrens, budgetZonderMatch });
  initMeting(cap);
}

// ───────── budget: "Meer budget?" en het vangnet als er niets binnen past ─────────
const euroLabel = n => "€" + Math.round(n).toLocaleString("nl-NL");
const WENS_VOORDEEL = {
  "4k": "een 4K-scherm", oled: "een OLED-scherm", gebogen: "een gebogen scherm",
  usbc: "USB-C waarmee je je laptop oplaadt", hoogte: "een in hoogte verstelbare voet",
  webcam: "een ingebouwde webcam", speakers: "ingebouwde speakers",
};
const GAME_VOORDEEL = {
  console: "HDMI 2.1, zodat je PS5 of Xbox 120 beelden per seconde haalt",
  rustig: "120 Hz of meer", snel: "144 Hz of meer", competitief: "240 Hz of meer",
};

// Welke wens heeft de beste monitor boven het budget, die geen enkele zichtbare
// monitor binnen het budget zeker heeft? Dan noemen we die op de kaart.
function wensBovenBudget(buiten, binnen, a) {
  const kandidaten = [...beeldWensen(a), ...extraWensen(a)].map(w => [WENS_VOORDEEL[w], m => heeftWens(m, w) === true]);
  if ((a?.gebruik ?? []).includes("gaming") && a?.game) kandidaten.unshift([GAME_VOORDEEL[a.game], m => voldoetAanGame(m, a.game) === true]);
  // Geen wens, maar wel de scherpte die bij de maat hoort (27" QHD, 32" 4K)
  const scherpte = AANBEVOLEN_SCHERPTE[filterState.sizeGroup];
  if (scherpte) kandidaten.push([`een scherper scherm (${scherpte.naam}), zoals past bij deze maat`, m => scherpGenoeg(m, filterState.sizeGroup) === true]);
  return kandidaten.find(([naam, f]) => naam && f(buiten) && !binnen.some(f))?.[0] ?? null;
}

function initBudgetNote({ cap, result: binnen, zonderGrens, budgetZonderMatch }) {
  const binnenLijst = binnen.filteredMatchedMonitors ?? [];
  const kaart = document.createElement("div");
  kaart.className = "budget-kaart";
  kaart.setAttribute("role", "note");

  if (budgetZonderMatch) {
    meet("budget_kaart", { actie: "niets_binnen_budget" });
    kaart.innerHTML = `<p><strong>Binnen ${euroLabel(cap)} vonden we in deze maat geen monitor.</strong> Dit zijn de monitoren die het best bij je wensen passen, vanaf de goedkoopste.</p>`;
    plaatsBudgetKaart(kaart);
    return;
  }

  // Alleen tonen als er boven het budget monitoren zijn die duidelijk beter bij de
  // wensen passen (passcore zonder prijsdeel). Vergelijk met wat je binnen budget
  // echt ziet (2+ winkels), en tel erboven ook alleen wat je standaard ziet.
  const zichtbaarBinnen = binnenLijst.filter(m => (m.aanbieders ?? []).length >= DEFAULT_MIN_AANBIEDERS);
  const topBinnen = zichtbaarBinnen.length ? Math.max(...zichtbaarBinnen.map(m => m.wens)) : binnen.topWens;
  const drempel = (topBinnen ?? -Infinity) + BAND_BESTE;
  const beter = (zonderGrens.filteredMatchedMonitors ?? []).filter(m => parsePrice(m.prijs) > cap && m.wens >= drempel);
  const zichtbaar = beter.filter(m => (m.aanbieders ?? []).length >= DEFAULT_MIN_AANBIEDERS);
  const goedkoopsteBuiten = zichtbaar.map(m => parsePrice(m.prijs)).filter(Number.isFinite).sort((a, b) => a - b)[0];
  if (!goedkoopsteBuiten) return;
  const buitenBeste = kiesBesteMatch(zichtbaar);
  const reden = buitenBeste ? wensBovenBudget(buitenBeste, zichtbaarBinnen, filterState.answers) : null;
  const meer = goedkoopsteBuiten - cap;
  let toontBuiten = false;
  const teken = () => {
    kaart.innerHTML = toontBuiten
      ? `<div class="budget-kaart-tekst"><strong>Je ziet nu monitoren boven je budget</strong><span>Vanaf ${euroLabel(goedkoopsteBuiten)}. Liever binnen je budget blijven?</span></div>
         <button type="button" class="budget-kaart-btn">Terug naar monitoren tot ${euroLabel(cap)}</button>`
      : reden
        ? `<div class="budget-kaart-tekst"><strong>Meer budget? Dan krijg je ${reden}</strong><span>Binnen je budget is dat er niet bij 2 of meer winkels. Vanaf ${euroLabel(goedkoopsteBuiten)}, ${euroLabel(meer)} boven je budget.</span></div>
           <button type="button" class="budget-kaart-btn">Bekijk deze monitoren</button>`
        : `<div class="budget-kaart-tekst"><strong>Meer budget? Er zijn monitoren die nog beter bij je wensen passen</strong><span>Vanaf ${euroLabel(goedkoopsteBuiten)}, ${euroLabel(meer)} boven je budget.</span></div>
           <button type="button" class="budget-kaart-btn">Bekijk deze monitoren</button>`;
    kaart.querySelector(".budget-kaart-btn").addEventListener("click", () => {
      toontBuiten = !toontBuiten;
      meet("budget_kaart", { actie: toontBuiten ? "klik_meer_budget" : "klik_terug", reden: reden ? "wens" : "score" });
      lijstSoort = toontBuiten ? "boven_budget" : "binnen_budget";
      filterState.baseMatches = toontBuiten ? beter : binnenLijst;
      filterState.priceGroups = computeDynamicPriceGroups(filterState.baseMatches, filterState.sizeGroup);
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
// daarna steeds terug direct na de eerste monitor.
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
const meet = (naam, props) => window.phTrackEvent?.(naam, { categorie: "monitor", ...props });
let lijstSoort = "binnen_budget";

function initMeting(cap) {
  const budget = cap ? String(cap) : "geen_voorkeur";
  const zichtbaar = () => document.querySelectorAll("#otherMatchesGrid > .rcard").length;
  // Meegestuurd met elke winkelklik (shared/analytics.js)
  window.phResultaatContext = () => ({ budget, lijst: zichtbaar(), lijst_soort: lijstSoort });
  const beste = kiesBesteMatch(filterKeten().filter(genoegWinkels));
  meet("resultaat_getoond", {
    budget, maat: filterState.sizeGroup, gebruik: (filterState.answers?.gebruik ?? []).join("+"),
    lijst: zichtbaar(), beste_merk: beste?.merk ?? "", beste_4k: beste ? String(is4KOfMeer(beste)) : "",
  });
}
