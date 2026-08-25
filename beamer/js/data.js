// ─── Helderheid (ANSI lumen) → drempels voor de licht-vraag ────────────────
// Live spreiding: 100-6000, mediaan 3500, p25 2000, p75 4000 (geverifieerd
// tegen live data, 140 producten).
export const helderheidMin = {
  donker:  0,
  normaal: 2000,
  licht:   4000,
};

// ─── Gewicht (kg) → drempel voor de draagbaarheid-vraag ────────────────────
// Live spreiding: 0,5-23,2 kg, mediaan 2,9 kg, p25 2,3 kg.
export const GEWICHT_DRAAGBAAR_MAX_KG = 2.5;

// ─── markt_positionering → gebruiksdoel-vraag ──────────────────────────────
// Icecat's eigen waarden (87% dekking): Thuisbioscoop/Draagbaar/Bedrijf/
// Gamen/Presentatie/Onderwijs. "Werk en presentaties" bundelt Bedrijf/
// Presentatie/Onderwijs — apart houden zou de quiz onnodig versnipperen
// voor 3 tiers die stuk voor stuk klein zijn.
// "mix" ("Een beetje van alles") heeft bewust GEEN entry hier — dat is geen
// omissie maar de bedoeling: matching.js's applyGebruikFilter() valt terug
// op "geen filter" als er geen mapping is, precies het gewenste gedrag voor
// een antwoord dat juist geen voorkeur uitspreekt. Draagbaarheid wordt al
// apart en specifieker uitgevraagd via Q3 (zie GEWICHT_DRAAGBAAR_MAX_KG) —
// die 2 vragen overlapten toen "mix" hier nog "Draagbaar" heette.
export const GEBRUIK_MARKT_POSITIES = {
  thuisbioscoop: ["Thuisbioscoop"],
  gamen:         ["Gamen"],
  werk:          ["Bedrijf", "Presentatie", "Onderwijs"],
};

// ─── Resolutie → beeldkwaliteit-vraag ───────────────────────────────────────
// Bewust niet-technisch verwoord in de quiz ("Gewoon prima"/"Heel goed"), de
// vertaling naar echte resolutiewaarden gebeurt hier. Live mediaanprijs per
// resolutie (geverifieerd): 720p €139, SVGA €349, 1080p €600, WUXGA €1379,
// 4K €1599 — een reëel, sterk prijsbepalend verschil, vandaar een eigen
// vraag i.p.v. alleen een filter.
export const RESOLUTIE_HOOG = new Set([
  "UHD 4K (3840x2160)", "4K (4096x2400)", "4K+ (5120x3200)", "WUXGA (1920x1200)",
]);
export const RESOLUTIE_LAAG = new Set([
  "720p (1280x720)", "SVGA (800x600)", "XGA (1024x768)",
]);

// ─── Geluidsniveau (dB) → drempel voor de "stil apparaat"-extra ────────────
// Live spreiding: 22-39 dB, mediaan 33, p25 29 (66% dekking).
export const GELUID_STIL_MAX_DB = 29;

// ─── Type projectieafstand → "dicht tegen de muur"-extra ──────────────────
// Icecat's 'Type product'-waarden (74% dekking) geven dit direct: korte en
// ultrakorte projectieafstand kunnen dicht bij het scherm/de muur staan.
export const KORTE_WORP_TYPES = new Set([
  "Projector met korte projectieafstand",
  "Projector met ultrakorte projectieafstand",
]);

// ─── Static fallback price groups (alleen als de dynamische berekening niets
// oplevert, bv. vóór de catalogus geladen is) ───────────────────────────────
export const priceGroupsFallback = [
  { label: "0-400",    min: 0,   max: 400  },
  { label: "400-800",  min: 400, max: 800  },
  { label: "800+",     min: 800, max: Number.POSITIVE_INFINITY }
];
