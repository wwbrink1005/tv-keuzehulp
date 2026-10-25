// ─── Navigatietype: classificatie op vrije tekst ───────────────────────────
// Icecat's "Navigatie type"-veld is geen nette categorie maar een vrije-
// tekstlijst van technologienamen (bv. "AIVI 3D 3.0, D-ToF lidar, TruEdge
// 3D") — gedetecteerd via keyword-match, zelfde aanpak als afwasprogramma's.
// Bewust GEEN harde partitie (in tegenstelling tot vaatwasser's plaatsing):
// 35% van de live catalogus heeft een leeg/onduidelijk navigatie-veld, en
// dat is vaak gewoon ontbrekende Icecat-data — geen bewijs dat het product
// daadwerkelijk een simpele/willekeurige navigatie heeft. Een harde filter
// zou legitieme LiDAR-robots onterecht kunnen uitsluiten. Daarom een zachte
// voorkeursvraag die gracieus degradeert.
export function heeftLidarNavigatie(navigatieType) {
  return /lidar|lds|laser|tof/i.test(String(navigatieType ?? ""));
}

// ─── Woninggrootte → minimale looptijd (zachte voorkeur) ───────────────────
// Live looptijd-range 110-497 min, mediaan 180 (geverifieerd tegen live data).
export const woninggrootteMinLooptijd = {
  klein:     0,
  gemiddeld: 150,
  groot:     250,
};

// ─── Budgetvraag (sinds okt. 2026) ─────────────────────────────────────────
// Twee maximumbedragen plus "Geen voorkeur". Uit de live catalogus (okt. 2026,
// 2+ winkels): rond een derde en twee derde van de prijzen (€440 en €700).
export const BUDGET_CAPS = [400, 700];

// Extra's: grenzen
export const LAAG_MAX_MM = 90;          // past onder de meeste banken en bedden
export const HOGE_DREMPEL_CM = 4;       // over hogere drempels en deurlijsten
export const HUISDIER_PA = 20000;       // veel zuigkracht voor haren in tapijt

// ─── "Stil" drempels voor de geluid-vraag ──────────────────────────────────
// Live dB-range 51-80, mediaan 65 (geverifieerd tegen live data).
export const GELUID_BELANGRIJK_DB = 60;
export const GELUID_BELANGRIJK_FALLBACK_DB = 65;
export const GELUID_GEMIDDELD_DB = 70;

// ─── Static fallback price groups (alleen als de dynamische berekening niets
// oplevert, bv. vóór de catalogus geladen is) ───────────────────────────────
export const priceGroupsFallback = [
  { label: "0-300",   min: 0,   max: 300  },
  { label: "300-600", min: 300, max: 600  },
  { label: "600+",    min: 600, max: Number.POSITIVE_INFINITY }
];
