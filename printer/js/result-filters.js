import { SOORTEN, SOORT_LABEL, GROTE_LADE_MIN } from "./data.js";
import { matchPrinters, kiesBesteMatch, applyMinAanbiedersCascade, BAND_BESTE, DEFAULT_MIN_AANBIEDERS } from "./matching.js";
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
  brands:       new Set(),
  soorten:      new Set(),
  kleuren:      new Set(),
  snelheden:    new Set(),
  functies:     new Set(),
  aanbieder:    new Set(),
  baseMatches:  [],
  priceGroups:  [],
  answers:      null,
  bestType:     "",
};

// Prijsgroepen uit de getoonde lijst (vers berekend, niet uit de quiz-snapshot).
function getDynamicPriceGroups() {
  return filterState.priceGroups;
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
  const groups = getDynamicPriceGroups().filter(g => filterState.priceLabels.has(g.label));
  return base.filter(p => {
    const price = parsePrice(p.prijs);
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
  return getBaseMatches().filter(p => (p.aanbieders ?? []).length >= filterState.minAanbieders);
}

function collectBrandOptions(matches) {
  const set = new Set();
  matches.forEach(p => { const label = formatBrandLabel(p.merk); if (label) set.add(label); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "nl"));
}

function collectSoortOptions(matches) {
  return SOORTEN.filter(s => matches.some(p => p.soort === s));
}

function collectKleurOptions(matches) {
  const set = new Set();
  matches.forEach(p => { if (p.kleur) set.add(p.kleur); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "nl"));
}

// Pagina's per minuut zwart-wit (Icecat-standaard, anders ISO). Grenzen op de
// echte spreiding: de meeste thuisprinters zitten onder 16, kantoorprinters
// vanaf 25.
const SNELHEID_GROEPEN = [
  { key: "traag",   label: "Tot 15 pagina's per minuut",  min: 0,  max: 15 },
  { key: "normaal", label: "16 tot 24 pagina's per minuut", min: 16, max: 24 },
  { key: "snel",    label: "25 of meer pagina's per minuut", min: 25, max: Infinity }
];
const snelheidVan = p => parseInt(p.snelheid ?? p.printsnelheidZwart, 10);

function collectSnelheidOptions(matches) {
  return SNELHEID_GROEPEN.filter(g => matches.some(p => {
    const snelheid = snelheidVan(p);
    return Number.isFinite(snelheid) && snelheid >= g.min && snelheid <= g.max;
  })).map(g => g.key);
}

// Functies: alleen wat printers echt van elkaar onderscheidt. Wifi (96%) en
// een display (92%) heeft bijna elke printer, dus die staan er niet meer bij.
const FUNCTIES = [
  { key: "duplex",       label: "Automatisch dubbelzijdig", heeft: p => p.duplexAuto === true },
  { key: "scan-kopieer", label: "Scannen en kopiëren",      heeft: p => p.aio },
  { key: "adf",          label: "Automatische documentinvoer", heeft: p => p.adf === "Ja" },
  { key: "compact",      label: "Compact formaat",          heeft: p => p.compact === true },
  { key: "lade",         label: `Papierlade van ${GROTE_LADE_MIN}+ vel`, heeft: p => Number(p.invoercapaciteit) >= GROTE_LADE_MIN },
  { key: "a3",           label: "Printen op A3",            heeft: p => p.a3 === true },
  { key: "witranden",    label: "Foto's zonder witranden",  heeft: p => p.zonderWitranden === "Ja" },
  { key: "ethernet",     label: "Netwerkkabel",             heeft: p => p.ethernet === "Ja" },
];
const functiesVan = p => FUNCTIES.filter(f => f.heeft(p)).map(f => f.key);

function collectFunctieOptions(matches) {
  return FUNCTIES.filter(f => matches.some(f.heeft)).map(f => f.key);
}

function collectAanbiederOptions(matches) {
  const set = new Set();
  matches.forEach(p => {
    (p.aanbieders ?? []).forEach(a => set.add(a.winkel));
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

  if (filterState.brands.size > 0) {
    filtered = filtered.filter(p => filterState.brands.has(formatBrandLabel(p.merk)));
  }

  if (filterState.soorten.size > 0) {
    filtered = filtered.filter(p => filterState.soorten.has(p.soort));
  }

  if (filterState.kleuren.size > 0) {
    filtered = filtered.filter(p => filterState.kleuren.has(p.kleur));
  }

  if (filterState.snelheden.size > 0) {
    filtered = filtered.filter(p => {
      const snelheid = snelheidVan(p);
      if (!Number.isFinite(snelheid)) return false;
      return SNELHEID_GROEPEN.some(g => filterState.snelheden.has(g.key) && snelheid >= g.min && snelheid <= g.max);
    });
  }

  // "en": alle aangevinkte functies tegelijk
  if (filterState.functies.size > 0) {
    filtered = filtered.filter(p => {
      const heeft = functiesVan(p);
      return [...filterState.functies].every(f => heeft.includes(f));
    });
  }

  if (filterState.aanbieder.size > 0) {
    filtered = filtered.filter(p =>
      (p.aanbieders ?? []).some(a => filterState.aanbieder.has(a.winkel))
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
  const hasActive = filterState.priceLabels.size > 0 || filterState.brands.size > 0 || filterState.soorten.size > 0 ||
    filterState.kleuren.size > 0 || filterState.snelheden.size > 0 || filterState.functies.size > 0 || filterState.aanbieder.size > 0 ||
    filterState.minAanbieders !== DEFAULT_MIN_AANBIEDERS;
  btn.hidden = !hasActive;
}

function renderMinAanbiedersOptions(container, card) {
  if (!container || !card) return;
  const matches = filterKeten();
  const options = MIN_AANBIEDERS_OPTIONS.map(n => ({
    n,
    count: matches.filter(p => (p.aanbieders ?? []).length >= n).length,
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
  const brandContainer      = qs("[data-filter-container='brand']");
  const soortContainer      = qs("[data-filter-container='soort']");
  const kleurContainer      = qs("[data-filter-container='kleur']");
  const snelheidContainer   = qs("[data-filter-container='snelheid']");
  const functieContainer    = qs("[data-filter-container='functies']");
  const aanbiederContainer  = qs("[data-filter-container='aanbieder']");

  const priceCard      = qs(".filter-card[data-filter='price']");
  const brandCard       = qs(".filter-card[data-filter='brand']");
  const soortCard       = qs(".filter-card[data-filter='soort']");
  const kleurCard       = qs(".filter-card[data-filter='kleur']");
  const snelheidCard    = qs(".filter-card[data-filter='snelheid']");
  const functieCard     = qs(".filter-card[data-filter='functies']");
  const aanbiederCard   = qs(".filter-card[data-filter='aanbieder']");
  const minAanbiedersCard = qs(".filter-card[data-filter='min-aanbieders']");

  renderMinAanbiedersOptions(minAanbiedersContainer, minAanbiedersCard);
  const matches = getSecondaryScopedMatches();

  if (priceContainer && priceCard) {
    const groups = getDynamicPriceGroups();
    // Alleen prijsgroepen met minstens één printer in de uitslag; bij hooguit
    // één zo'n groep valt er niets te kiezen en verdwijnt de kaart.
    const base = getBaseScopedByMinAanbieders();
    const groupForPrice = price => groups.find(g => price >= g.min && (price < g.max || g.max === Number.POSITIVE_INFINITY));
    const counts = computeCounts(zonderSelectie(filterState.priceLabels), p => groupForPrice(parsePrice(p.prijs))?.label);
    const opBasis = computeCounts(base, p => groupForPrice(parsePrice(p.prijs))?.label);
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

  if (brandContainer && brandCard) {
    renderFilterOptions(brandContainer, brandCard, collectBrandOptions(matches), matches, p => formatBrandLabel(p.merk), "brands");
  }

  if (soortContainer && soortCard) {
    renderFilterOptions(soortContainer, soortCard, collectSoortOptions(matches), matches, p => p.soort, "soorten", s => SOORT_LABEL[s] ?? s);
  }

  if (kleurContainer && kleurCard) {
    renderFilterOptions(kleurContainer, kleurCard, collectKleurOptions(matches), matches, p => p.kleur, "kleuren");
  }

  if (snelheidContainer && snelheidCard) {
    const snelheidValueFn = p => {
      const snelheid = snelheidVan(p);
      if (!Number.isFinite(snelheid)) return undefined;
      return SNELHEID_GROEPEN.find(g => snelheid >= g.min && snelheid <= g.max)?.key;
    };
    renderFilterOptions(snelheidContainer, snelheidCard, collectSnelheidOptions(matches), matches, snelheidValueFn, "snelheden", key => SNELHEID_GROEPEN.find(g => g.key === key)?.label ?? key);
  }

  if (functieContainer && functieCard) {
    renderFilterOptions(functieContainer, functieCard, collectFunctieOptions(matches), matches, functiesVan, "functies", f => FUNCTIES.find(x => x.key === f)?.label ?? f);
  }

  if (aanbiederContainer && aanbiederCard) {
    renderFilterOptions(aanbiederContainer, aanbiederCard, collectAanbiederOptions(matches), matches, p => (p.aanbieders ?? []).map(a => a.winkel), "aanbieder");
  }

  updateClearFiltersBtn();
}

function handleFilterChange(event) {
  const input = event.target.closest("input");
  if (!input) return;

  const name  = input.name;
  const value = input.value;
  meet("filter_gebruikt", { filter: input.closest(".filter-card")?.dataset.filter || name, waarde: value === "all" ? "alle" : String(value).slice(0, 40) });

  if (name === "minAanbiedersFilter") {
    filterState.minAanbieders = parseInt(value, 10);
    renderAllFilters();
    applyFilters();
    return;
  }

  const setMap = {
    priceLabels: filterState.priceLabels,
    brands:      filterState.brands,
    soorten:     filterState.soorten,
    kleuren:     filterState.kleuren,
    snelheden:   filterState.snelheden,
    functies:    filterState.functies,
    aanbieder:   filterState.aanbieder,
  };

  const set = setMap[name];
  if (!set) return;

  if (value === "all") set.clear();
  else if (input.checked) set.add(value);
  else set.delete(value);

  renderAllFilters();
  applyFilters();
}

function wisAlleFilters() {
  filterState.priceLabels.clear();
  filterState.brands.clear();
  filterState.soorten.clear();
  filterState.kleuren.clear();
  filterState.snelheden.clear();
  filterState.functies.clear();
  filterState.aanbieder.clear();
  filterState.minAanbieders = DEFAULT_MIN_AANBIEDERS;
}

/** Nieuwe basislijst (binnen of boven budget): prijsgroepen opnieuw, filters terug naar standaard. */
function zetBasis(lijst, bestType) {
  filterState.baseMatches = lijst;
  filterState.bestType = bestType ?? "";
  filterState.priceGroups = computeDynamicPriceGroups(lijst.filter(p => (p.aanbieders ?? []).length >= DEFAULT_MIN_AANBIEDERS).length ? lijst.filter(p => (p.aanbieders ?? []).length >= DEFAULT_MIN_AANBIEDERS) : lijst);
  wisAlleFilters();
}

export async function initFilters() {
  const filtersPanel = qs("#filtersPanel");
  if (!filtersPanel) return;

  const answersData  = localStorage.getItem("printer_answers");
  const bestTypeData = localStorage.getItem("printer_bestType");

  filterState.answers   = answersData ? JSON.parse(answersData) : null;
  filterState.bestType  = bestTypeData ?? "";

  let allPrinters = [];
  try {
    const raw = await fetchProducts();
    allPrinters = normalizeProducts(raw ?? []);
  } catch {
    allPrinters = [];
  }

  // Budget uit de quiz (maximumbedrag) is een echte grens, net als in de quiz zelf.
  // Past er niets binnen, dan zonder grens (zelfde vangnet als de quiz).
  const answers = filterState.answers ?? {};
  const cap = Number(answers.budget) || null;
  const zonderGrens = matchPrinters(allPrinters, null, answers);
  let result = cap ? matchPrinters(allPrinters, cap, answers) : zonderGrens;
  const budgetZonderMatch = Boolean(cap && !(result.filteredMatchedPrinters?.length));
  if (budgetZonderMatch) result = zonderGrens;
  zetBasis(Array.isArray(result.filteredMatchedPrinters) ? result.filteredMatchedPrinters : [], result.bestType);

  // Vangnet: lukt het live ophalen niet, dan de printers uit de quiz.
  if (filterState.baseMatches.length === 0) {
    const storedData = localStorage.getItem("printer_filteredMatchedPrinters");
    if (storedData) {
      try {
        const storedPrinters = JSON.parse(storedData);
        if (Array.isArray(storedPrinters) && storedPrinters.length > 0) zetBasis(storedPrinters, filterState.bestType);
      } catch { /* ignore */ }
    }
  }

  renderAllFilters();

  filtersPanel.addEventListener("change", handleFilterChange);

  const clearBtn = qs("#clearFiltersBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      wisAlleFilters();
      renderAllFilters();
      applyFilters();
    });
  }

  applyFilters();
  if (cap && allPrinters.length) initBudgetNote(cap, result, zonderGrens, budgetZonderMatch);
  initMeting(cap);
}


// ───────── budget: "Meer budget?" en het vangnet als er niets binnen past ─────────
const SOORT_MEER = {
  tank:       ["een printer met navulbare inkttanks", "Veel goedkoper per pagina, ideaal als je veel print"],
  laserZw:    ["een zwart-witlaserprinter", "Snel, goedkoop per pagina en er droogt niets in"],
  laserKleur: ["een kleurenlaserprinter", "Snel en voordelig per pagina, ook in kleur"],
  cartridge:  ["een betere inkjetprinter", "Meer van wat je zoekt"],
};
const euroLabel = n => "€" + Math.round(n).toLocaleString("nl-NL");

function initBudgetNote(cap, binnen, zonderGrens, budgetZonderMatch) {
  const binnenLijst = binnen.filteredMatchedPrinters ?? [];
  const kaart = document.createElement("div");
  kaart.className = "budget-kaart";
  kaart.setAttribute("role", "note");

  if (budgetZonderMatch) {
    meet("budget_kaart", { actie: "niets_binnen_budget" });
    kaart.innerHTML = `<p><strong>Binnen ${euroLabel(cap)} vonden we geen printer.</strong> Dit zijn de printers die het best bij je wensen passen, vanaf de goedkoopste.</p>`;
    plaatsBudgetKaart(kaart);
    return;
  }

  // Alleen tonen als er boven het budget printers zijn die duidelijk beter bij de
  // wensen passen (passcore zonder prijsdeel, zie matching.js), en die je ook
  // standaard te zien krijgt.
  // Vergelijk met wat je binnen budget echt ziet.
  const zichtbaarBinnen = binnenLijst.filter(p => (p.aanbieders ?? []).length >= DEFAULT_MIN_AANBIEDERS);
  const topBinnen = zichtbaarBinnen.length ? Math.max(...zichtbaarBinnen.map(p => p.wens)) : binnen.topWens;
  const drempel = (topBinnen ?? -Infinity) + BAND_BESTE;
  const beter = (zonderGrens.filteredMatchedPrinters ?? [])
    .filter(p => parsePrice(p.prijs) > cap && p.wens >= drempel);
  const zichtbaarBeter = beter.filter(p => (p.aanbieders ?? []).length >= DEFAULT_MIN_AANBIEDERS);
  const goedkoopsteBuiten = zichtbaarBeter.map(p => parsePrice(p.prijs)).filter(Number.isFinite).sort((a, b) => a - b)[0];
  if (!goedkoopsteBuiten) return;
  const buitenBeste = kiesBesteMatch(zichtbaarBeter);
  const soort = buitenBeste?.soort ?? zonderGrens.bestType;
  const anderSoort = soort && soort !== binnen.bestType;
  const meer = goedkoopsteBuiten - cap;
  let toontBuiten = false;
  const teken = () => {
    const [wat, voordeel] = SOORT_MEER[soort] ?? SOORT_MEER.cartridge;
    kaart.innerHTML = toontBuiten
      ? `<div class="budget-kaart-tekst"><strong>Je ziet nu printers boven je budget</strong><span>Vanaf ${euroLabel(goedkoopsteBuiten)}. Liever binnen je budget blijven?</span></div>
         <button type="button" class="budget-kaart-btn">Terug naar printers tot ${euroLabel(cap)}</button>`
      : anderSoort
        ? `<div class="budget-kaart-tekst"><strong>Meer budget? Dan past ${wat} nog beter bij je wensen</strong><span>${voordeel}. Vanaf ${euroLabel(goedkoopsteBuiten)}, ${euroLabel(meer)} boven je budget.</span></div>
         <button type="button" class="budget-kaart-btn">Bekijk deze printers</button>`
        : `<div class="budget-kaart-tekst"><strong>Meer budget? Er zijn printers die nog beter bij je wensen passen</strong><span>Vanaf ${euroLabel(goedkoopsteBuiten)}, ${euroLabel(meer)} boven je budget.</span></div>
         <button type="button" class="budget-kaart-btn">Bekijk deze printers</button>`;
    kaart.querySelector(".budget-kaart-btn").addEventListener("click", () => {
      toontBuiten = !toontBuiten;
      meet("budget_kaart", { actie: toontBuiten ? "klik_meer_budget" : "klik_terug", soort });
      lijstSoort = toontBuiten ? "boven_budget" : "binnen_budget";
      // Andere lijst = verse start: alle filters terug naar standaard
      zetBasis(toontBuiten ? beter : binnenLijst, toontBuiten ? soort : binnen.bestType);
      renderAllFilters();
      applyFilters();
      teken();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };
  teken();
  plaatsBudgetKaart(kaart);
  meet("budget_kaart", { actie: "getoond", soort, meer_euro: Math.round(meer) });
}

// De lijst wordt bij elk filter en elke sortering opnieuw getekend (innerHTML):
// zet de kaart daarna steeds terug direct na de eerste printer. Hij hoort bij de
// lijst, zodat de kop en de filterkolom niet verschuiven.
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
const meet = (naam, props) => window.phTrackEvent?.(naam, { categorie: "printer", ...props });
let lijstSoort = "binnen_budget";

function initMeting(cap) {
  const budget = cap ? String(cap) : "geen_voorkeur";
  const zichtbaar = () => document.querySelectorAll("#otherMatchesGrid > .rcard").length;
  // Meegestuurd met elke winkelklik (shared/analytics.js)
  window.phResultaatContext = () => ({ budget, lijst: zichtbaar(), lijst_soort: lijstSoort });
  const beste = kiesBesteMatch(filterKeten().filter(genoegWinkels));
  meet("resultaat_getoond", {
    budget, gebruik: filterState.answers?.gebruik ?? "", lijst: zichtbaar(), beste_soort: beste?.soort ?? "",
  });
}
