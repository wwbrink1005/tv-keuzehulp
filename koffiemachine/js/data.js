// ─── Type koffiemachine ───────────────────────────────────────────────────
// Het 4-weg type (volautomaat / halfautomaat / capsules / filter) staat in
// matching.js classificeerType(): Icecat's "Type product" is niet altijd
// betrouwbaar (Nespresso-capsulemachines als "Espressomachine", La Specialista
// als volautomaat), dus naam, invoertype en pompdruk wegen mee.
//
// Sinds okt. 2026 geen watertankvraag meer: de tank zegt kopers weinig. Bij
// filterkoffie telt het aantal kopjes per kan (zie matching.js KOPJES_MIN).

// ─── Capsulesysteem (sinds okt. 2026) ─────────────────────────────────────
// Uit de productnaam: die is altijd duidelijk ("Nespresso Vertuo Pop",
// "Dolce Gusto Genio S"), het Icecat-veld niet (Vertuo Pop staat er als
// gewone "Nespresso", een L'OR Barista als "Nespresso").
export const SYSTEEM_LABEL = {
  nespresso: "Nespresso", vertuo: "Nespresso Vertuo", dolcegusto: "Dolce Gusto", senseo: "Senseo-pads", lor: "L'OR Barista",
};
export function capsuleSysteemVan(naam, icecat) {
  const t = String(naam ?? "");
  if (/vertuo/i.test(t)) return "vertuo";
  if (/l['’]?or barista/i.test(t)) return "lor";
  if (/dolce\s?gusto/i.test(t)) return "dolcegusto";
  if (/senseo/i.test(t)) return "senseo";
  if (/nespresso/i.test(t)) return "nespresso";
  const i = String(icecat ?? "");
  if (/vertuo/i.test(i)) return "vertuo";
  if (/dolce/i.test(i)) return "dolcegusto";
  if (/senseo/i.test(i)) return "senseo";
  if (/l'or/i.test(i)) return "lor";
  if (/nespresso/i.test(i)) return "nespresso";
  return null;
}

// ─── Melk (sinds okt. 2026) ───────────────────────────────────────────────
// "auto" = cappuccino op één knop (melkkaraf, LatteGo, LatteCrema, Lattissima,
// Aeroccino; bij Dolce Gusto via melkcapsules), "stoom" = zelf opschuimen
// met een stoompijpje, "geen" = geen melksysteem, null = onbekend.
const AUTO_NAAM = /lattego|lattecrema|lattissima|latte\b|& ?milk|\+ ?milk|aeroccino|cappuccino/i;
// Series waarvan alle modellen cappuccino op één knop maken (en de data het
// vaak niet zegt): Miele CM, Krups Evidence, Krups Intuition Experience.
const AUTO_SERIE = /\bMiele\s+CM\s?\d|evidence|intuition experience/i;
export function melkVan(k, type, systeem) {
  if (type === "filter") return "geen";
  if (systeem === "dolcegusto") return "auto";
  if (k.melkToevoegen === "Automatisch" || k.melkreservoirRaw === "Ja" || AUTO_NAAM.test(k.naam) || AUTO_SERIE.test(k.naam)) return "auto";
  // Bij capsulemachines betekent "Soort toevoegen melk: Handmatig" zelf melk
  // erbij doen (Vertuo Pop), geen stoompijpje; een opschuimer (Lattissima,
  // Aeroccino) werkt daar op een knop.
  if (type === "capsules") return k.melkopschuimerRaw === "Ja" ? "auto" : systeem ? "geen" : null;
  if (k.melkToevoegen === "Handmatig" || k.melkToevoegen === "Pijp" || k.melkopschuimerRaw === "Ja") return "stoom";
  if (k.melkopschuimerRaw === "Nee") return "geen";
  // Capsulemachines met melk zeggen dat altijd in de naam (Lattissima, & Milk,
  // Aeroccino); zonder zo'n woord heeft de machine geen melksysteem.
  if (type === "capsules" && systeem) return "geen";
  return null;
}

// ─── Budgetvraag (sinds okt. 2026) ─────────────────────────────────────────
// Twee maximumbedragen per type, plus "Geen voorkeur": rond een derde en
// twee derde van de prijzen (live catalogus, ook 1 winkel, okt. 2026).
export const budgetCaps = {
  volautomaat: [450, 700], halfautomaat: [200, 400], capsules: [90, 130], filter: [50, 75],
};

// Bij koffiemachines doen ook modellen bij 1 winkel mee (besluit okt. 2026):
// winkels verkopen eigen modelvarianten (Siemens EQ alleen bij Coolblue of
// Expert), waardoor de 2-winkelregel 91% van de volautomaten wegfilterde.
export const MIN_WINKELS = 1;

// ─── Prijsgroepen (fallback, alleen als dynamische berekening niets geeft) ──
export const priceGroupsFallback = [
  { label: "0-100",   min: 0,   max: 100  },
  { label: "100-400", min: 100, max: 400  },
  { label: "400+",    min: 400, max: Number.POSITIVE_INFINITY },
];
