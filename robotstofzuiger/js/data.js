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
