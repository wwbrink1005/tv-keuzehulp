// ─── Gebruikstypes (keyed by de "gebruik" antwoord-waarde in vraag 1) ────────
// Dit is een harde partitie van de catalogus (zoals behuizingType bij desktop):
// je kiest er 1, en alleen printers van dat gebruikstype komen in aanmerking.
export const gebruikTypes = ["thuis", "zakelijk", "foto"];

// ─── Static fallback price groups per gebruikstype ────────────────────────────
export const priceGroupsByGebruik = {
  "thuis": [
    { label: "0-100",   min: 0,   max: 100  },
    { label: "100-250", min: 100, max: 250  },
    { label: "250+",    min: 250, max: Number.POSITIVE_INFINITY }
  ],
  "zakelijk": [
    { label: "0-300",   min: 0,   max: 300  },
    { label: "300-600", min: 300, max: 600  },
    { label: "600+",    min: 600, max: Number.POSITIVE_INFINITY }
  ],
  "foto": [
    { label: "0-150",   min: 0,   max: 150  },
    { label: "150-350", min: 150, max: 350  },
    { label: "350+",    min: 350, max: Number.POSITIVE_INFINITY }
  ]
};

/**
 * Classificeert een printer op basis van specs naar gebruikstype
 * (thuis/zakelijk/foto). Retourneert null als het niet te bepalen is
 * (onvoldoende Icecat-data) — zo'n printer komt dan bij geen enkel
 * gebruikstype in de resultaten terecht. 1-op-1 met vraag 1's antwoorden
 * (thuis/foto/zakelijk) — geen aparte "gemengd"-tussenvorm meer, zie
 * matching.js voor waarom.
 */
export function classifyGebruik(printtechnologie, marktPositionering, printkleuren) {
  const tech = String(printtechnologie ?? "").toLowerCase();
  const markt = String(marktPositionering ?? "").toLowerCase();
  const kleurenAantal = String(printkleuren ?? "").split(",").map(s => s.trim()).filter(Boolean).length;

  // "LED" is Brother's eigen naam voor hun laserprinter-technologie (LED-array
  // i.p.v. laserdiode, functioneel dezelfde toner-klasse) — zonder deze check
  // vielen deze 2 producten ten onrechte onder "thuis" i.p.v. "zakelijk".
  if (tech.includes("laser") || tech.includes("led") || markt.includes("bedrijf")) return "zakelijk";
  if (kleurenAantal >= 5) return "foto";
  if (tech) return "thuis";
  return null;
}

// ─── Inktsysteem (tank vs. cartridge) ──────────────────────────────────────
// Icecat heeft geen apart, betrouwbaar "heeft navulbare inkttank"-veld — wel
// zijn EcoTank/Smart Tank/MegaTank/SuperTank getrademarkte productlijnnamen
// (Epson/HP/Canon), dus naam-detectie is hier betrouwbaar, i.t.t. generieke
// zoektermen. Onderzoek in de "thuis"-categorie: tank-printers liggen op een
// mediaan van €278 t.o.v. €120 voor cartridge-printers — een reëel en
// uitlegbaar prijsverschil (hogere aanschafprijs, veel lagere kosten per
// pagina), dus relevant als eigen keuzevraag i.p.v. een blinde prijscap.
const INKTTANK_PATRONEN = [/ecotank/i, /smart tank/i, /megatank/i, /supertank/i];

export function isInktTankSysteem(naam) {
  return INKTTANK_PATRONEN.some(re => re.test(String(naam ?? "")));
}

// Geen Budget/Mid/Premium-tier-classificatie (meer) — die correleerde niet
// betrouwbaar met prijs (bij "thuis" printers viel 94% van de catalogus in
// "Premium", puur op specs, inclusief zowel de goedkoopste als de duurste
// printer). Dat kon een "goedkope" voorkeur een duurder resultaat opleveren
// dan een "uitgebreide" voorkeur. "volume" is nu een directe, gracieus
// degraderende voorkeur i.p.v. een scoring-as — zie matching.js.
// Printers met minstens deze snelheid (pagina's/minuut, zwart-wit) tellen
// als "snel" voor de "veel printen"-voorkeur — gebaseerd op de echte
// spreiding in de catalogus (duidelijke cluster vanaf ~26 ppm).
export const VEEL_VOLUME_MIN_SNELHEID = 26;
