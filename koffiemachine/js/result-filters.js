import { priceGroupsFallback } from "./data.js";
import { matchKoffiemachines, classificeerType } from "./matching.js";
import { computeDynamicPriceGroups, normalizeProducts, parsePrice, qs } from "./utils.js";
import { updateResultMatches } from "./result.js";
import { fetchProducts } from "./supabase.js";
import { computeCounts, renderFilterList } from "../../shared/filters.js";

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
  baseMatches:      [],
  answers:          null,
  bestType:         "",
};

const FUNCTIE_DEFINITIES = [
  { key: "ingebouwde-molen", label: "Ingebouwde molen",       check: b => b.ingebouwdeMolen === "Ja" },
  { key: "melkopschuimer",   label: "Melkopschuimer",         check: b => b.melkopschuimer === "Ja" },
  { key: "touchbediening",   label: "Touchbediening",          check: b => b.bediening.includes("Touch") },
  { key: "display",          label: "Ingebouwd display",      check: b => b.display === "Ja" },
  { key: "wifi",             label: "Wifi",                   check: b => b.wifi === "Ja" },
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
    return groups.some(g => price >= g.min && price <= g.max);
  });
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
  const counts = computeCounts(matches, productValueFn);
  renderFilterList(container, card, { items, counts, filterName, stateSet, labelFn });
}

function applyFilters() {
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

  updateClearFiltersBtn();
  updateResultMatches(filtered, filterState.answers, filterState.bestType);
}

function updateClearFiltersBtn() {
  const btn = qs("#clearFiltersBtn");
  if (!btn) return;
  const hasActive = filterState.priceLabels.size > 0 || filterState.typeProducts.size > 0 ||
    filterState.koffieInvoertypes.size > 0 || filterState.capsuleSystemen.size > 0 || filterState.brands.size > 0 || filterState.kleuren.size > 0 ||
    filterState.functies.size > 0 || filterState.varianten.size > 0 || filterState.aanbieder.size > 0;
  btn.hidden = !hasActive;
}

function renderAllFilters() {
  const matches = getPriceScopedMatches();

  const priceContainer      = qs("[data-filter-container='price']");
  const typeContainer       = qs("[data-filter-container='type']");
  const invoerContainer     = qs("[data-filter-container='invoertype']");
  const capsuleContainer    = qs("[data-filter-container='capsulesysteem']");
  const brandContainer      = qs("[data-filter-container='brand']");
  const kleurContainer      = qs("[data-filter-container='kleur']");
  const functieContainer    = qs("[data-filter-container='functies']");
  const variantenContainer  = qs("[data-filter-container='varianten']");
  const aanbiederContainer  = qs("[data-filter-container='aanbieder']");

  const priceCard      = qs(".filter-card[data-filter='price']");
  const typeCard       = qs(".filter-card[data-filter='type']");
  const invoerCard     = qs(".filter-card[data-filter='invoertype']");
  const capsuleCard    = qs(".filter-card[data-filter='capsulesysteem']");
  const brandCard      = qs(".filter-card[data-filter='brand']");
  const kleurCard      = qs(".filter-card[data-filter='kleur']");
  const functieCard    = qs(".filter-card[data-filter='functies']");
  const variantenCard  = qs(".filter-card[data-filter='varianten']");
  const aanbiederCard  = qs(".filter-card[data-filter='aanbieder']");

  if (priceContainer && priceCard) {
    const groups = getDynamicPriceGroups();
    const base = getBaseMatches();
    const groupForPrice = price => groups.find(g => price >= g.min && price <= g.max);
    const counts = computeCounts(base, b => groupForPrice(parsePrice(b.prijs))?.label);
    const labels = groups.filter(g => counts.has(g.label)).map(g => g.label);

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

  const name  = input.name;
  const value = input.value;

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

  const result = matchKoffiemachines(allKoffiemachines, filterState.answers ?? {});
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
      renderAllFilters();
      applyFilters();
    });
  }

  applyFilters();
}
