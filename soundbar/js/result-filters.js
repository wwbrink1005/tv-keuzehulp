import { priceGroupsBySize, breedteGroupToRange, getKanalenGroep, KANALEN_GROEP_ORDER } from "./data.js";
import {
  matchSoundbars, kiesBesteMatch, heeftWens, voldoetAanSubwoofer, extraWensen,
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
  priceLabels:  new Set(),
  minAanbieders: DEFAULT_MIN_AANBIEDERS,
  brands:       new Set(),
  kanalen:      new Set(),
  // Subwoofer meegeleverd, surround, wandmontage en wifi waren 4 losse Ja/
  // Nee-kaarten — samengevoegd tot 1 "Functies"-kaart (zie FUNCTIE_DEFINITIES).
  functies:     new Set(),
  hdmiOptions:  new Set(),
  breedteLabels: new Set(),
  aanbieder:    new Set(),
  baseMatches:  [],
  breedteGroups: [],
  answers:      null,
  scores:       null,
  bestType:     "",
  breedteGroup: ""
};

// Sinds okt. 2026: losse subwoofer en achterspeakers op de nieuwe gegevens
// (utils.js), wandmontage eruit (kan bij vrijwel elke soundbar). Alleen wat
// zeker is telt.
const FUNCTIE_DEFINITIES = [
  { key: "subwoofer", label: "Losse subwoofer", check: sb => sb.subwooferLos === true },
  { key: "surround", label: "Dolby Atmos/DTS:X", check: sb => sb.atmos === true },
  { key: "achter", label: "Losse achterspeakers", check: sb => sb.achterspeakers === true },
  { key: "wifi", label: "WiFi-streaming", check: sb => sb.wifiStreaming === true },
  { key: "airplay", label: "AirPlay", check: sb => sb.airplay === true },
  { key: "spotify", label: "Spotify Connect", check: sb => sb.spotifyConnect === true },
];

// Prijsbuckets worden altijd vers herberekend vanuit de zojuist opgehaalde
// catalogus (niet vertrouwd op de localStorage-snapshot van het quiz-moment).
function getDynamicPriceGroups(breedteGroup) {
  if (Array.isArray(filterState.priceGroups) && filterState.priceGroups.length > 0) {
    return filterState.priceGroups;
  }
  return priceGroupsBySize[breedteGroup] || [];
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
  const groups = getDynamicPriceGroups(filterState.breedteGroup)
    .filter(g => filterState.priceLabels.has(g.label));
  if (groups.length === 0) return base;
  return base.filter(sb => {
    const price = parsePrice(sb.prijs);
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
  return getBaseMatches().filter(sb => (sb.aanbieders ?? []).length >= filterState.minAanbieders);
}

function collectBrandOptions(matches) {
  const set = new Set();
  matches.forEach(sb => { const label = formatBrandLabel(sb.merk); if (label) set.add(label); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "nl"));
}

function collectKanalenOptions(matches) {
  const set = new Set();
  matches.forEach(sb => { set.add(getKanalenGroep(sb)); });
  return KANALEN_GROEP_ORDER.filter(g => set.has(g));
}

function collectFunctieOptions(matches) {
  return FUNCTIE_DEFINITIES.filter(f => matches.some(f.check)).map(f => f.key);
}

function collectHdmiOptions(matches) {
  const set = new Set();
  matches.forEach(sb => { if (sb.hdmi_poorten) set.add(sb.hdmi_poorten); });
  return Array.from(set).sort((a, b) => a - b);
}

function collectAanbiederOptions(matches) {
  const set = new Set();
  matches.forEach(sb => {
    (sb.aanbieders ?? []).forEach(a => set.add(a.winkel));
  });
  return Array.from(set).sort();
}

function filterKeten() {
  let filtered = getPriceScopedMatches();

  if (filterState.brands.size > 0) {
    filtered = filtered.filter(sb => filterState.brands.has(formatBrandLabel(sb.merk)));
  }

  if (filterState.kanalen.size > 0) {
    filtered = filtered.filter(sb => filterState.kanalen.has(getKanalenGroep(sb)));
  }

  if (filterState.functies.size > 0) {
    filtered = filtered.filter(sb =>
      FUNCTIE_DEFINITIES.filter(f => filterState.functies.has(f.key)).every(f => f.check(sb))
    );
  }

  if (filterState.hdmiOptions.size > 0) {
    filtered = filtered.filter(sb => filterState.hdmiOptions.has(sb.hdmi_poorten));
  }

  if (filterState.breedteLabels.size > 0) {
    const groups = filterState.breedteGroups.filter(g => filterState.breedteLabels.has(g.label));
    filtered = filtered.filter(sb => Number.isFinite(sb.breedte_mm) && groups.some(g => sb.breedte_mm / 10 >= g.min && sb.breedte_mm / 10 < g.max));
  }

  if (filterState.aanbieder.size > 0) {
    filtered = filtered.filter(sb =>
      (sb.aanbieders ?? []).some(a => filterState.aanbieder.has(a.winkel))
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
  const hasActive = filterState.priceLabels.size > 0 || filterState.brands.size > 0 ||
    filterState.kanalen.size > 0 || filterState.functies.size > 0 ||
    filterState.hdmiOptions.size > 0 ||
    filterState.breedteLabels.size > 0 ||
    filterState.aanbieder.size > 0 || filterState.minAanbieders !== DEFAULT_MIN_AANBIEDERS;
  btn.hidden = !hasActive;
}

// Bucket-groep-behorend-tot-mm-waarde, gedeeld door breedte/diepte/hoogte
// hieronder in de generieke `filters`-array.
function dimensieLabelFn(groups, mm) {
  if (!Number.isFinite(mm)) return undefined;
  return groups.find(g => mm / 10 >= g.min && mm / 10 < g.max)?.label;
}

function renderMinAanbiedersOptions() {
  const container = qs("[data-filter-container='min-aanbieders']");
  const card      = qs(".filter-card[data-filter='min-aanbieders']");
  if (!container || !card) return;

  const matches = filterKeten();
  const options = MIN_AANBIEDERS_OPTIONS.map(n => ({
    n,
    count: matches.filter(sb => (sb.aanbieders ?? []).length >= n).length,
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
  // Vóór de rest: bepaalt/valideert filterState.minAanbieders, zodat de
  // secundaire kaarten hieronder de juiste drempel gebruiken.
  renderMinAanbiedersOptions();

  const matches = getSecondaryScopedMatches();
  const functieValueFn = sb => FUNCTIE_DEFINITIES.filter(f => f.check(sb)).map(f => f.key);
  const functieLabelFn = key => FUNCTIE_DEFINITIES.find(f => f.key === key)?.label ?? key;

  const filters = [
    { key: "priceLabels", filter: "price",       matches: getBaseScopedByMinAanbieders(), valueFn: sb => getDynamicPriceGroups(filterState.breedteGroup).find(g => { const p = parsePrice(sb.prijs); return p >= g.min && (p < g.max || g.max === Number.POSITIVE_INFINITY); })?.label, collect: (counts) => getDynamicPriceGroups(filterState.breedteGroup).filter(g => counts.has(g.label)).map(g => g.label), labelFn: label => `€ ${label}`, allLabel: "Alle prijzen" },
    { key: "brands",      filter: "brand",       matches, valueFn: sb => formatBrandLabel(sb.merk), collect: () => collectBrandOptions(matches) },
    { key: "kanalen",     filter: "kanalen",     matches, valueFn: sb => getKanalenGroep(sb), collect: () => collectKanalenOptions(matches) },
    { key: "functies",    filter: "functies",    matches, valueFn: functieValueFn, collect: () => collectFunctieOptions(matches), labelFn: functieLabelFn },
    { key: "hdmiOptions", filter: "hdmi",        matches, valueFn: sb => sb.hdmi_poorten, collect: () => collectHdmiOptions(matches), labelFn: n => `${n} HDMI` },
    { key: "breedteLabels", filter: "breedte", matches: getBaseScopedByMinAanbieders(), valueFn: sb => dimensieLabelFn(filterState.breedteGroups, sb.breedte_mm), collect: (counts) => filterState.breedteGroups.filter(g => counts.has(g.label)).map(g => g.label), allLabel: "Alle" },
    { key: "aanbieder",   filter: "aanbieder",   matches, valueFn: sb => (sb.aanbieders ?? []).map(a => a.winkel), collect: () => collectAanbiederOptions(matches) },
  ];

  filters.forEach(({ key, filter, matches: source, valueFn, collect, labelFn, allLabel }) => {
    const container = qs(`[data-filter-container='${filter}']`);
    const card      = qs(`.filter-card[data-filter='${filter}']`);
    if (!container || !card) return;

    // Welke opties er zijn komt uit de quizuitslag (de lijst springt niet);
    // het aantal erachter telt met alle andere gekozen filters.
    const opBasis = computeCounts(source, valueFn);
    const isBucketFilter = key === "priceLabels" || key === "breedteLabels";
    const items = isBucketFilter
      ? collect(new Map([...opBasis, ...[...filterState[key]].map(v => [v, 0])]))
      : collect(opBasis);
    const counts = telOpties(key, items, valueFn);
    if (items.length === 0 || (isBucketFilter && items.length <= 1)) {
      container.innerHTML = "";
      card.hidden = true;
      return;
    }
    renderFilterList(container, card, { items, counts, filterName: key, stateSet: filterState[key], labelFn, allLabel });
  });

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
    brands:      { set: filterState.brands,      parse: v => v },
    kanalen:     { set: filterState.kanalen,      parse: v => v },
    functies:    { set: filterState.functies,     parse: v => v },
    hdmiOptions: { set: filterState.hdmiOptions,  parse: v => parseInt(v, 10) },
    breedteLabels: { set: filterState.breedteLabels, parse: v => v },
    aanbieder:   { set: filterState.aanbieder,    parse: v => v }
  };

  if (!setMap[name]) return;

  const { set, parse, exclusive } = setMap[name];

  if (value === "all") {
    set.clear();
  } else {
    const parsed = parse(value);
    if (input.checked) {
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

  // Laad state uit localStorage
  const answersData      = localStorage.getItem("soundbar_answers");
  const breedteGroupData = localStorage.getItem("soundbar_selectedBreedteGroup");
  const bestTypeData     = localStorage.getItem("soundbar_bestType");

  filterState.answers      = answersData  ? JSON.parse(answersData)  : null;
  filterState.breedteGroup = breedteGroupData ?? "";
  filterState.priceLabels  = new Set();
  filterState.bestType     = bestTypeData ?? "";

  // Haal & normaliseer alle soundbars op
  let allSoundbars = [];
  try {
    const raw = await fetchProducts();
    allSoundbars = normalizeProducts(raw ?? []);
  } catch {
    allSoundbars = [];
  }

  // Budget uit de quiz (maximumbedrag) is een echte grens, net als in de quiz.
  // Past er in deze breedte niets binnen, dan zonder grens (zelfde vangnet).
  const cap = Number(filterState.answers?.budget) || null;
  const zonderGrens = matchSoundbars(allSoundbars, filterState.breedteGroup, null, filterState.answers);
  let liveResult = cap ? matchSoundbars(allSoundbars, filterState.breedteGroup, cap, filterState.answers) : zonderGrens;
  const budgetZonderMatch = Boolean(cap && !(liveResult.filteredMatchedSoundbars?.length));
  if (budgetZonderMatch) liveResult = zonderGrens;
  let baseMatches = Array.isArray(liveResult.filteredMatchedSoundbars) ? liveResult.filteredMatchedSoundbars : [];
  filterState.bestType = liveResult.bestType || filterState.bestType;

  // Fallback: als de live fetch niets oplevert, val terug op de matches die
  // al berekend en opgeslagen waren op het moment van quiz-indienen.
  if (baseMatches.length === 0) {
    const storedData = localStorage.getItem("soundbar_filteredMatchedSoundbars");
    if (storedData) {
      try {
        const storedSoundbars = JSON.parse(storedData);
        if (Array.isArray(storedSoundbars) && storedSoundbars.length > 0) {
          baseMatches = storedSoundbars;
        }
      } catch { /* ignore */ }
    }
  }

  filterState.baseMatches = baseMatches;
  // Prijs- en breedtegroepen uit de lijst zelf (breedte is nu een maximum)
  filterState.priceGroups   = computeDynamicPriceGroups(baseMatches, "weet-ik-niet", breedteGroupToRange);
  filterState.breedteGroups = computeDynamicDimensionGroups(baseMatches, "breedte_mm");

  renderAllFilters();

  filtersPanel.addEventListener("change", handleFilterChange);

  const clearBtn = qs("#clearFiltersBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      filterState.priceLabels.clear();
      filterState.brands.clear();
      filterState.kanalen.clear();
      filterState.functies.clear();
      filterState.hdmiOptions.clear();
      filterState.breedteLabels.clear();
      filterState.aanbieder.clear();
      filterState.minAanbieders = DEFAULT_MIN_AANBIEDERS;
      renderAllFilters();
      applyFilters();
    });
  }

  applyFilters();
  if (cap && baseMatches.length) initBudgetNote({ cap, result: liveResult, zonderGrens, budgetZonderMatch });
  initMeting(cap);
}

// ───────── budget: "Meer budget?" en het vangnet als er niets binnen past ─────────
const euroLabel = n => "€" + Math.round(n).toLocaleString("nl-NL");
const WENS_VOORDEEL = {
  surround: "Dolby Atmos, geluid ook van boven", achter: "losse achterspeakers voor echt surround",
  streaming: "WiFi-streaming via Spotify of AirPlay",
};

// Welke wens heeft de beste soundbar boven het budget, die geen enkele
// zichtbare soundbar binnen het budget zeker heeft? Dan noemen we die.
function wensBovenBudget(buiten, binnen, a) {
  const kandidaten = extraWensen(a).map(w => [WENS_VOORDEEL[w], sb => heeftWens(sb, w) === true]);
  if (a?.subwoofer === "ja") kandidaten.unshift(["een losse subwoofer voor diepe bas", sb => voldoetAanSubwoofer(sb, "ja") === true]);
  return kandidaten.find(([naam, f]) => naam && f(buiten) && !binnen.some(f))?.[0] ?? null;
}

function initBudgetNote({ cap, result: binnen, zonderGrens, budgetZonderMatch }) {
  const binnenLijst = binnen.filteredMatchedSoundbars ?? [];
  const kaart = document.createElement("div");
  kaart.className = "budget-kaart";
  kaart.setAttribute("role", "note");

  if (budgetZonderMatch) {
    meet("budget_kaart", { actie: "niets_binnen_budget" });
    kaart.innerHTML = `<p><strong>Binnen ${euroLabel(cap)} vonden we in deze breedte geen soundbar.</strong> Dit zijn de soundbars die het best bij je wensen passen, vanaf de goedkoopste.</p>`;
    plaatsBudgetKaart(kaart);
    return;
  }

  // Alleen tonen als er boven het budget soundbars zijn die duidelijk beter bij
  // de wensen passen (passcore zonder prijsdeel). Vergelijk met wat je binnen
  // budget echt ziet (2+ winkels), en tel erboven ook alleen wat je standaard ziet.
  const zichtbaarBinnen = binnenLijst.filter(sb => (sb.aanbieders ?? []).length >= DEFAULT_MIN_AANBIEDERS);
  const topBinnen = zichtbaarBinnen.length ? Math.max(...zichtbaarBinnen.map(sb => sb.wens)) : binnen.topWens;
  const drempel = (topBinnen ?? -Infinity) + BAND_BESTE;
  const beter = (zonderGrens.filteredMatchedSoundbars ?? []).filter(sb => parsePrice(sb.prijs) > cap && sb.wens >= drempel);
  const zichtbaar = beter.filter(sb => (sb.aanbieders ?? []).length >= DEFAULT_MIN_AANBIEDERS);
  const goedkoopsteBuiten = zichtbaar.map(sb => parsePrice(sb.prijs)).filter(Number.isFinite).sort((a, b) => a - b)[0];
  if (!goedkoopsteBuiten) return;
  const buitenBeste = kiesBesteMatch(zichtbaar);
  const reden = buitenBeste ? wensBovenBudget(buitenBeste, zichtbaarBinnen, filterState.answers) : null;
  const meer = goedkoopsteBuiten - cap;
  let toontBuiten = false;
  const teken = () => {
    kaart.innerHTML = toontBuiten
      ? `<div class="budget-kaart-tekst"><strong>Je ziet nu soundbars boven je budget</strong><span>Vanaf ${euroLabel(goedkoopsteBuiten)}. Liever binnen je budget blijven?</span></div>
         <button type="button" class="budget-kaart-btn">Terug naar soundbars tot ${euroLabel(cap)}</button>`
      : reden
        ? `<div class="budget-kaart-tekst"><strong>Meer budget? Dan krijg je ${reden}</strong><span>Binnen je budget is dat er niet bij 2 of meer winkels. Vanaf ${euroLabel(goedkoopsteBuiten)}, ${euroLabel(meer)} boven je budget.</span></div>
           <button type="button" class="budget-kaart-btn">Bekijk deze soundbars</button>`
        : `<div class="budget-kaart-tekst"><strong>Meer budget? Er zijn soundbars die nog beter bij je wensen passen</strong><span>Vanaf ${euroLabel(goedkoopsteBuiten)}, ${euroLabel(meer)} boven je budget.</span></div>
           <button type="button" class="budget-kaart-btn">Bekijk deze soundbars</button>`;
    kaart.querySelector(".budget-kaart-btn").addEventListener("click", () => {
      toontBuiten = !toontBuiten;
      meet("budget_kaart", { actie: toontBuiten ? "klik_meer_budget" : "klik_terug", reden: reden ? "wens" : "score" });
      lijstSoort = toontBuiten ? "boven_budget" : "binnen_budget";
      filterState.baseMatches = toontBuiten ? beter : binnenLijst;
      filterState.priceGroups = computeDynamicPriceGroups(filterState.baseMatches, "weet-ik-niet", breedteGroupToRange);
      filterState.breedteGroups = computeDynamicDimensionGroups(filterState.baseMatches, "breedte_mm");
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
// daarna steeds terug direct na de eerste soundbar.
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
const meet = (naam, props) => window.phTrackEvent?.(naam, { categorie: "soundbar", ...props });
let lijstSoort = "binnen_budget";

function initMeting(cap) {
  const budget = cap ? String(cap) : "geen_voorkeur";
  const zichtbaar = () => document.querySelectorAll("#otherMatchesGrid > .rcard").length;
  // Meegestuurd met elke winkelklik (shared/analytics.js)
  window.phResultaatContext = () => ({ budget, lijst: zichtbaar(), lijst_soort: lijstSoort });
  const beste = kiesBesteMatch(filterKeten().filter(genoegWinkels));
  meet("resultaat_getoond", {
    budget, breedte: filterState.breedteGroup, gebruik: (filterState.answers?.gebruik ?? []).join("+"),
    subwoofer: filterState.answers?.subwoofer ?? "", lijst: zichtbaar(), beste_merk: beste?.merk ?? "",
  });
}
