import { getProcessorTier, priceGroupsBySize, scoringSystem, sizeGroupToAllowedSizes, TIER_ORDER } from "./data.js";
import { parsePrice } from "./utils.js";

// ─── Score computation ────────────────────────────────────────────────────────

export function calculateScores(answers) {
  const scores = { Budget: 0, Mid: 0, Krachtig: 0, Topklasse: 0 };

  // gebruik is now an array (multi-select, max 2)
  const gebruik     = Array.isArray(answers.gebruik) ? answers.gebruik : (answers.gebruik ? [answers.gebruik] : []);
  const intensiteit = answers.intensiteit ?? "";
  const formaat     = answers.formaat     ?? "";

  for (const g of gebruik) {
    if (scoringSystem.gebruik[g]) {
      for (const tier of TIER_ORDER) {
        scores[tier] += scoringSystem.gebruik[g][tier] ?? 0;
      }
    }
  }

  if (intensiteit && scoringSystem.intensiteit[intensiteit]) {
    for (const tier of TIER_ORDER) {
      scores[tier] += scoringSystem.intensiteit[intensiteit][tier] ?? 0;
    }
  }

  if (formaat && scoringSystem.formaat[formaat]) {
    for (const tier of TIER_ORDER) {
      scores[tier] += scoringSystem.formaat[formaat][tier] ?? 0;
    }
  }

  return scores;
}

// ─── Formaat filter (size + portability combined) ────────────────────────────

export function applyFormaatFilter(laptops, formaat) {
  if (formaat === "licht-compact") {
    // Prefer very light laptops
    const light = laptops.filter(l => l.gewicht !== null && l.gewicht <= 1.6);
    if (light.length > 0) return light;

    const medium = laptops.filter(l => l.gewicht !== null && l.gewicht <= 1.9);
    if (medium.length > 0) return medium;

    return laptops;
  }

  if (formaat === "middenweg") {
    const filtered = laptops.filter(l => l.gewicht === null || l.gewicht <= 2.2);
    if (filtered.length > 0) return filtered;
    return laptops;
  }

  // "groot-krachtig" → no weight filter
  return laptops;
}

// ─── Opslag filter ────────────────────────────────────────────────────────────

export function applyOpslagFilter(laptops, opslag) {
  if (opslag === "veel") {
    const big = laptops.filter(l => l.opslag >= 1000);
    if (big.length > 0) return big;
    // fall back to 512
    const medium = laptops.filter(l => l.opslag >= 512);
    if (medium.length > 0) return medium;
    return laptops;
  }

  if (opslag === "gemiddeld") {
    const medium = laptops.filter(l => l.opslag >= 512);
    if (medium.length > 0) return medium;
    return laptops;
  }

  // "weinig" → no storage filter (256 GB is fine)
  return laptops;
}

// ─── Werkgeheugen (RAM) filter ─────────────────────────────────────────────────
// Geen eigen vraag — leunt op de al-bestaande "intensiteit"-vraag, want RAM
// correleert daarmee net zo goed als processortier: binnen bijv. de "Mid"-tier
// zit nog een echte spreiding van 4 tot 48 GB (129 op 16 GB, maar ook 23 op
// 8 GB en 16 op 24-48 GB) die tot nu toe volledig ongebruikt bleef in de
// matching. Zelfde gracieus-degraderende patroon als applyOpslagFilter.
//
// Bewust géén 32 GB-eis voor "intensief": getest tegen de live catalogus en
// dat sneed tot 90% van de Krachtig/Topklasse-laptops weg (169 van de 271
// hebben "gewoon" 16 GB, wat prima intensief-geschikt is — 32 GB is een
// premium-upgrade, geen basisvereiste). 16 GB als ondergrens voor zowel
// "gemiddeld" als "intensief" verwijdert vooral de paar 4/8 GB-uitschieters
// die in hogere tiers lekken, zonder overig goed aanbod weg te filteren.
export function applyRamFilter(laptops, intensiteit) {
  if (intensiteit === "gemiddeld" || intensiteit === "intensief") {
    const medium = laptops.filter(l => l.werkgeheugen >= 16);
    if (medium.length > 0) return medium;
    return laptops;
  }

  // "licht" → geen RAM-eis (8 GB is prima)
  return laptops;
}

// ─── Extra preferences ────────────────────────────────────────────────────────

export function applyExtraFilter(laptops, extraAnswers) {
  if (!Array.isArray(extraAnswers) || extraAnswers.includes("geen") || extraAnswers.length === 0) {
    return laptops;
  }

  let filtered = [...laptops];

  if (extraAnswers.includes("touchscreen")) {
    const ts = filtered.filter(l => l.touchscreen === "Ja");
    if (ts.length > 0) filtered = ts;
  }

  if (extraAnswers.includes("usb-c")) {
    const usbc = filtered.filter(l => l.usb_c === "Ja");
    if (usbc.length > 0) filtered = usbc;
  }

  if (extraAnswers.includes("scherp-beeldscherm")) {
    // Prefer OLED first, then high resolution, then IPS
    const oled = filtered.filter(l => l.paneeltype === "OLED");
    if (oled.length > 0) { filtered = oled; }
    else {
      const hires = filtered.filter(l => l.resolutie === "4K" || l.resolutie === "Quad HD");
      if (hires.length > 0) { filtered = hires; }
      else {
        const ips = filtered.filter(l => l.paneeltype === "IPS");
        if (ips.length > 0) filtered = ips;
      }
    }
  }

  return filtered;
}

// ─── Main matching function ───────────────────────────────────────────────────

export function matchLaptops(laptops, sizeGroup, priceGroup, answers, scores) {
  if (!Array.isArray(laptops) || !sizeGroup) {
    return { bestMatch: null, bestType: null, filteredMatchedLaptops: [] };
  }

  const allowedSizes = sizeGroupToAllowedSizes[sizeGroup] || [];

  // 1. Filter by size + price
  let filtered = laptops.filter(l => {
    const price = parsePrice(l.prijs);
    return (
      allowedSizes.includes(l.schermdiagonaal) &&
      (!priceGroup || (price >= priceGroup.min && price <= priceGroup.max))
    );
  });

  if (filtered.length === 0) {
    return { bestMatch: null, bestType: null, filteredMatchedLaptops: [] };
  }

  // 2. Pick best processor tier by score
  const sortedTiers = Object.entries(scores)
    .sort((a, b) => Number(b[1]) - Number(a[1]));

  let matchedLaptops = [];
  let bestType = null;

  for (let i = 0; i < sortedTiers.length; i++) {
    const [, topScore] = sortedTiers[i];
    const tiersWithTopScore = sortedTiers
      .filter(([, s]) => Number(s) === Number(topScore))
      .map(([t]) => t);

    // Tegenstrijdige antwoorden (bv. "werk" + "gaming") kunnen 2 tiers laten
    // gelijkspelen. Die dan allebei samenvoegen tot 1 pool verdubbelde het
    // aantal resultaten (getest: 126+ i.p.v. de gebruikelijke ~60-80) — dus
    // bij een gelijkspel proberen we de getailde tiers apart, goedkoopste/
    // conservatiefste eerst (TIER_ORDER), en gebruiken we de eerste die na
    // alle filters daadwerkelijk treffers overhoudt. Zo blijft de resultaten-
    // lijst net zo scherp als bij een ondubbelzinnig antwoord.
    const tiersInVolgorde = TIER_ORDER.filter(t => tiersWithTopScore.includes(t));

    let candidates = [];
    let gekozenTier = null;

    for (const tier of tiersInVolgorde) {
      let poging = filtered.filter(l => getProcessorTier(l.processor, l.processor_familie) === tier);
      if (poging.length === 0) continue;

      // 3. Apply formaat filter (weight-based portability)
      poging = applyFormaatFilter(poging, answers.formaat ?? "");
      if (poging.length === 0) continue;

      // 4. Apply opslag filter
      poging = applyOpslagFilter(poging, answers.opslag ?? "");
      if (poging.length === 0) continue;

      // 5. Apply werkgeheugen (RAM) filter
      poging = applyRamFilter(poging, answers.intensiteit ?? "");
      if (poging.length === 0) continue;

      // 6. Apply extra preferences
      poging = applyExtraFilter(poging, answers.extraAnswers ?? []);
      if (poging.length === 0) continue;

      candidates = poging;
      gekozenTier = tier;
      break;
    }

    if (candidates.length === 0) continue;

    matchedLaptops = candidates;
    bestType = gekozenTier;
    break;
  }

  // Fallback: if tier matching yielded nothing, use all size+price filtered
  // laptops (still applying formaat/opslag/extra where possible) so a
  // non-empty price bucket never results in an empty result set.
  if (matchedLaptops.length === 0) {
    let fallback = applyFormaatFilter(filtered, answers.formaat ?? "");
    fallback = applyOpslagFilter(fallback, answers.opslag ?? "");
    fallback = applyRamFilter(fallback, answers.intensiteit ?? "");
    fallback = applyExtraFilter(fallback, answers.extraAnswers ?? []);
    if (fallback.length === 0) fallback = [...filtered];
    matchedLaptops = fallback;
    bestType = "Algemeen";
  }

  // Best match = cheapest in the matched set
  const bestMatch = matchedLaptops.reduce((cheapest, l) => {
    return parsePrice(l.prijs) < parsePrice(cheapest.prijs) ? l : cheapest;
  });

  return { bestMatch, bestType, filteredMatchedLaptops: matchedLaptops };
}

export function computeMatchForPriceGroup(laptops, sizeGroup, priceGroup, answers, scores) {
  return matchLaptops(laptops, sizeGroup, priceGroup, answers, scores);
}

export function getIdealTierSet(scores) {
  if (!scores || typeof scores !== "object") return new Set();
  const entries = Object.entries(scores);
  if (entries.length === 0) return new Set();
  const maxScore = Math.max(...entries.map(([, s]) => Number(s)));
  return new Set(
    entries.filter(([, s]) => Number(s) === maxScore).map(([t]) => t)
  );
}

// ─── Result points ────────────────────────────────────────────────────────────

export function buildResultPoints(laptop, answers) {
  if (!laptop || !answers) return [];

  const points = [];
  const addPoint = (text) => {
    if (text && !points.includes(text) && points.length < 4) points.push(text);
  };

  const gebruik      = Array.isArray(answers.gebruik) ? answers.gebruik : (answers.gebruik ? [answers.gebruik] : []);
  const intensiteit  = answers.intensiteit ?? "";
  const formaat      = answers.formaat ?? "";
  const opslag       = answers.opslag ?? "";
  const extraAnswers = answers.extraAnswers ?? [];
  const tier         = getProcessorTier(laptop.processor, laptop.processor_familie);

  // Processor tier points
  if (tier === "Topklasse") {
    if (gebruik.includes("gaming"))   addPoint("Top rekenkracht voor veeleisende games");
    if (gebruik.includes("creatief")) addPoint("Maximale prestaties voor video- en fotobewerking");
    if (intensiteit === "intensief")  addPoint("Hoge rekenkracht voor zware taken");
  } else if (tier === "Krachtig") {
    if (gebruik.includes("gaming"))   addPoint("Voldoende krachtig voor gamen");
    if (gebruik.includes("creatief")) addPoint("Prima voor creatief en productief werk");
    if (intensiteit === "intensief")  addPoint("Krachtige processor voor zware taken");
  } else if (tier === "Mid") {
    if (gebruik.includes("werk"))      addPoint("Prima geschikt voor thuiswerken en kantoor");
    if (gebruik.includes("dagelijks")) addPoint("Meer dan voldoende voor dagelijks gebruik");
    if (intensiteit === "gemiddeld")   addPoint("Goede balans tussen kracht en efficiëntie");
  } else {
    addPoint("Energiezuinig en betaalbaar voor dagelijks gebruik");
  }

  // Display quality
  if (laptop.paneeltype === "OLED") {
    addPoint("OLED-scherm met scherpe kleuren en hoog contrast");
  } else if (extraAnswers.includes("scherp-beeldscherm")) {
    if (laptop.resolutie === "4K")       addPoint("4K-scherm voor maximale beeldscherpte");
    else if (laptop.resolutie === "Quad HD") addPoint("Helder Quad HD-scherm");
  }

  // Portability / formaat
  if (formaat === "licht-compact") {
    if (laptop.gewicht !== null && laptop.gewicht <= 1.5) {
      addPoint("Extreem licht, ideaal voor onderweg");
    } else if (laptop.gewicht !== null && laptop.gewicht <= 1.9) {
      addPoint("Lichtgewicht ontwerp voor extra portabiliteit");
    }
  }

  // Extra
  if (extraAnswers.includes("touchscreen") && laptop.touchscreen === "Ja") {
    addPoint("Touchscreen voor intuïtieve bediening");
  }
  if (extraAnswers.includes("usb-c") && laptop.usb_c === "Ja") {
    addPoint("USB-C aansluiting voor snel opladen en accessoires");
  }

  // Opslag
  if (opslag === "veel" && laptop.opslag >= 1000) {
    addPoint(`${laptop.opslag >= 1024 ? laptop.opslag / 1024 + " TB" : laptop.opslag + " GB"} opslag voor grote projecten`);
  } else if (opslag === "gemiddeld" && laptop.opslag >= 512) {
    addPoint(`${laptop.opslag} GB opslag, ruim voor foto's en programma's`);
  }

  // Generieke aanvulling: garandeert altijd 4 punten, ook als er weinig
  // voorwaardelijke punten hierboven matchten. Deze specs zijn bij elke
  // laptop gegarandeerd aanwezig (harde eisen in normalizeProducts()),
  // dus deze cascade kan nooit op ontbrekende data stranden. addPoint()
  // dedupliceert en stopt vanzelf bij 4, dus onvoorwaardelijk aanroepen kan.
  if (laptop.werkgeheugen >= 32) addPoint("32 GB RAM voor zware workloads");
  else if (laptop.werkgeheugen >= 16) addPoint("16 GB RAM voor vlot multitasken");
  else addPoint(`${laptop.werkgeheugen} GB RAM`);

  if (laptop.opslag >= 1024) addPoint(`${laptop.opslag / 1024} TB opslag`);
  else addPoint(`${laptop.opslag} GB opslag`);

  addPoint(`${laptop.schermdiagonaal}" scherm`);
  addPoint(`${laptop.resolutie}-resolutie`);
  addPoint(`${laptop.paneeltype}-paneel`);

  return points;
}
