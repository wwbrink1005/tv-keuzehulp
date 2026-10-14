import { getProcessorTier, priceGroupsBySize, scoringSystem, sizeGroupToAllowedSizes, TIER_ORDER } from "./data.js";
import { parsePrice } from "./utils.js";

export const DEFAULT_MIN_AANBIEDERS = 2;

export function applyMinAanbiedersCascade(matches, startThreshold = DEFAULT_MIN_AANBIEDERS) {
  const countAanbieders = item => (item.aanbieders ?? []).length;
  let effectiveMin = startThreshold;
  let result = matches.filter(item => countAanbieders(item) >= effectiveMin);

  while (result.length === 0 && effectiveMin > 1) {
    effectiveMin -= 1;
    result = matches.filter(item => countAanbieders(item) >= effectiveMin);
  }

  return { effectiveMin, result };
}

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

// ─── Zachte filters: niet terug tot 1 of 2 laptops ───────────────────────────
// Gewicht, werkgeheugen en zuinige/krachtige chip zijn voorkeuren, geen eisen.
// Eerder werd elke voorkeur toegepast zolang er ook maar 1 laptop overbleef,
// met als gevolg dat de helft van de bezoekers 2 laptops of minder te zien
// kreeg (doorlichting okt. 2026). Nu alleen als er minstens MIN_KEUZE laptops
// bij 2+ winkels overblijven, of als het niets kost (de lijst was al zo klein).
const MIN_KEUZE = 3;
const vergelijkbaar = lijst => lijst.filter(l => (l.aanbieders ?? []).length >= 2).length;
function zacht(lijst, gefilterd) {
  if (gefilterd.length === 0) return lijst;
  const n = vergelijkbaar(gefilterd);
  return n >= MIN_KEUZE || n >= vergelijkbaar(lijst) ? gefilterd : lijst;
}

// ─── Formaat filter (size + portability combined) ────────────────────────────

export function applyFormaatFilter(laptops, formaat) {
  if (formaat === "licht-compact") {
    // Liefst heel licht, anders licht, anders alles.
    const light = zacht(laptops, laptops.filter(l => l.gewicht !== null && l.gewicht <= 1.6));
    if (light !== laptops) return light;
    return zacht(laptops, laptops.filter(l => l.gewicht !== null && l.gewicht <= 1.9));
  }

  if (formaat === "middenweg") {
    return zacht(laptops, laptops.filter(l => l.gewicht === null || l.gewicht <= 2.2));
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
  // Onbekend werkgeheugen (o.a. veel MacBooks in Icecat) is geen reden om
  // een laptop weg te laten.
  const minstens = gb => l => l.werkgeheugen === null || l.werkgeheugen >= gb;
  if (intensiteit === "extreem") {
    const hoog = zacht(laptops, laptops.filter(minstens(32)));
    if (hoog !== laptops) return hoog;
    return zacht(laptops, laptops.filter(minstens(16)));
  }

  if (intensiteit === "normaal" || intensiteit === "zwaar") {
    return zacht(laptops, laptops.filter(minstens(16)));
  }

  // "licht" → geen RAM-eis (8 GB is prima)
  return laptops;
}

// ─── Processorklasse (H/HX/HS vs U/P/V) ────────────────────────────────────
// Los van de processor-tier (Budget/Mid/Krachtig/Topklasse, gebaseerd op de
// lijn-cijfers zoals i5/i7) geeft het achtervoegsel in het modelnummer aan of
// een chip vermogen- of efficiëntiegericht is (bv. "i7-13620H" vs
// "7430U"). Dat correleert sterk met "intensiteit", maar was tot nu toe
// volledig ongebruikt — waardoor bv. Mid-tier "normaal gebruik" een pool van
// 345 laptops binnen middenweg opleverde zonder enig onderscheid tussen een
// dun-lichte U-serie en een zwaardere H-serie chip. ~70% van de laptops heeft
// een herkenbaar achtervoegsel; de rest (bv. MediaTek/Snapdragon-modellen
// zonder H/U-letter) blijft ongemoeid in beide richtingen.
function processorSuffixKlasse(processor) {
  const match = String(processor ?? "").match(/\b\d{3,5}(HX|HS|H|U|P|V)\b/i);
  if (!match) return null;
  const suffix = match[1].toUpperCase();
  return (suffix === "HX" || suffix === "HS" || suffix === "H") ? "performance" : "efficient";
}

export function applyProcessorClassFilter(laptops, intensiteit) {
  if (intensiteit === "zwaar" || intensiteit === "extreem") {
    return zacht(laptops, laptops.filter(l => processorSuffixKlasse(l.processor) !== "efficient"));
  }

  if (intensiteit === "licht" || intensiteit === "normaal") {
    return zacht(laptops, laptops.filter(l => processorSuffixKlasse(l.processor) !== "performance"));
  }

  return laptops;
}

// ─── Dedicated GPU (afgeleid uit Icecat's "gpu"-veld) ──────────────────────
// Voor gaming/creatief werk maakt een dedicated videokaart (i.p.v. alleen
// geïntegreerde graphics) een groot verschil, maar dit werd tot nu toe
// nergens gefilterd — de processor-tier alleen zegt niets over de GPU. Het
// "gpu"-veld bevat het model van de dedicated kaart (bv. "NVIDIA GeForce RTX
// 4070") en is leeg bij alleen geïntegreerde graphics — maar Icecat vult het
// bij sommige modellen niet leeg, maar met de letterlijke placeholder-tekst
// "Niet beschikbaar" (zelfde patroon als bij desktop's gpu_model). Zonder
// deze check werd "Niet beschikbaar" behandeld als een geldig GPU-model,
// zowel in de filter (liet laptops zonder dedicated GPU gewoon toe bij
// gaming/creatief) als in het resultaatpunt ("Dedicated Niet beschikbaar
// videokaart").
export function heeftDedicatedGpu(gpu) {
  const raw = String(gpu ?? "").trim();
  return raw !== "" && raw.toLowerCase() !== "niet beschikbaar";
}

// Gamen vraagt een losse videokaart. Voor creatief werk (foto, video) volstaat
// ook de ingebouwde grafische chip van een Apple M Pro/Max: die zijn daar juist
// sterk in. Zonder deze uitzondering verscheen een MacBook Pro 16 nooit.
function voldoetAanGpuWens(l, gebruik) {
  if (!Array.isArray(gebruik)) return true;
  if (gebruik.includes("gaming")) return heeftDedicatedGpu(l.gpu);
  if (gebruik.includes("creatief")) return heeftDedicatedGpu(l.gpu) || /\bM\d+\s+(pro|max|ultra)\b/i.test(l.processor ?? "");
  return true;
}

export function applyGpuFilter(laptops, gebruikAnswers) {
  const wilDedicatedGpu = Array.isArray(gebruikAnswers)
    && (gebruikAnswers.includes("gaming") || gebruikAnswers.includes("creatief"));
  if (!wilDedicatedGpu) return laptops;

  const metGpu = laptops.filter(l => voldoetAanGpuWens(l, gebruikAnswers));
  if (metGpu.length > 0) return metGpu;
  return laptops;
}

// ─── Extra preferences ────────────────────────────────────────────────────────
// Resoluties boven Full HD zoals ze in de catalogus heten. Eerder stond hier
// "Quad HD", dat nergens voorkomt: alleen 4K telde dan als scherp scherm.
const SCHERP = new Set(["QHD", "QHD+", "4K"]);

// Strikte versie van de expliciete wensen (opslag, videokaart bij gamen of
// creatief werk, touchscreen, USB-C, scherp scherm): alleen laptops die aan
// ALLES voldoen. Zie matchLaptops, stap 2a.
function voldoetAanAlleWensen(laptops, answers) {
  const opslag = answers.opslag ?? "";
  const gebruik = Array.isArray(answers.gebruik) ? answers.gebruik : [];
  const extra = Array.isArray(answers.extraAnswers) ? answers.extraAnswers : [];
  return laptops.filter(l =>
    (opslag !== "veel" || l.opslag >= 1000) &&
    (opslag !== "gemiddeld" || l.opslag >= 512) &&
    voldoetAanGpuWens(l, gebruik) &&
    (!extra.includes("touchscreen") || l.touchscreen === "Ja") &&
    (!extra.includes("usb-c") || l.usb_c === "Ja") &&
    (!extra.includes("scherp-beeldscherm") || l.paneeltype === "OLED" || SCHERP.has(l.resolutie))
  );
}

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
      const hires = filtered.filter(l => SCHERP.has(l.resolutie));
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

  // 2a. De best scorende tier waarin ALLE expliciete wensen vervuld kunnen
  // worden (bij gelijke score de goedkoopste tier eerst, zoals hieronder). De
  // tier komt uit gebruik/intensiteit/formaat (een voorkeur); een aangevinkte
  // wens gaat voor. Zonder deze stap viel bv. "scherp scherm" of de videokaart
  // bij gamen in ruim 900 van de 3.168 antwoordcombinaties weg terwijl er wél
  // passende laptops waren. Daarna de zachte filters (gewicht, geheugen, chip).
  const scoresAflopend = [...new Set(sortedTiers.map(([, s]) => Number(s)))];
  for (const score of scoresAflopend) {
    const tiers = TIER_ORDER.filter(t => sortedTiers.some(([n, s]) => n === t && Number(s) === score));
    for (const tier of tiers) {
      let poging = voldoetAanAlleWensen(
        filtered.filter(l => getProcessorTier(l.processor, l.processor_familie) === tier), answers);
      if (vergelijkbaar(poging) === 0) continue;
      poging = applyFormaatFilter(poging, answers.formaat ?? "");
      poging = applyRamFilter(poging, answers.intensiteit ?? "");
      poging = applyProcessorClassFilter(poging, answers.intensiteit ?? "");
      matchedLaptops = poging;
      bestType = tier;
      break;
    }
    if (matchedLaptops.length) break;
  }

  // 2b. Kan dat in geen enkele tier: de oude cascade, waarin een wens die er
  // niet is gracieus wegvalt.
  for (let i = 0; i < sortedTiers.length && matchedLaptops.length === 0; i++) {
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

      // 5b. Apply processorklasse filter (H/HX/HS vs U/P/V)
      poging = applyProcessorClassFilter(poging, answers.intensiteit ?? "");
      if (poging.length === 0) continue;

      // 5c. Apply dedicated-GPU filter (gaming/creatief)
      poging = applyGpuFilter(poging, answers.gebruik ?? []);
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
    fallback = applyProcessorClassFilter(fallback, answers.intensiteit ?? "");
    fallback = applyGpuFilter(fallback, answers.gebruik ?? []);
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

// De kaartpunten ("Waarom dit bij jou past") staan in punten.js.
