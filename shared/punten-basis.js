// shared/punten-basis.js — bouwstenen voor "Waarom dit bij jou past" op de
// resultaatpagina's. Elke categorie heeft een eigen {categorie}/js/punten.js
// die bepaalt WELKE punten er zijn; dit bestand bevat alleen wat voor elke
// categorie hetzelfde werkt (vergelijken binnen de lijst, getallen, opsommen).
//
// Uitgangspunten voor elke punten.js (koelkast is het referentiepatroon):
// - Punten bevestigen wat de bezoeker koos en laten vooral zien wat déze kaart
//   onderscheidt binnen de eigen resultatenlijst ("de stilste van je 31
//   resultaten"). Zo verschillen ze per kaart en per bezoeker.
// - Nooit iets negatiefs: een wens waaraan het product niet voldoet wordt
//   overgeslagen, niet benoemd.
// - Geen verzonnen getallen, alleen wat echt in de catalogus staat.
// - Altijd precies 4 punten (CLAUDE.md, stap 5.5), met een vangnet van velden
//   die bij vrijwel elk product gevuld zijn. Testen tegen de live catalogus.

export const LABEL_RANG = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7 };

export function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export const getal = (n, dec = 0) => Number(n).toLocaleString("nl-NL", { maximumFractionDigits: dec });
export const cm = (mm) => getal(mm / 10, mm % 10 === 0 ? 0 : 1);
export const gemiddelde = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
export const leeg = (v) => v === null || v === undefined || String(v).trim() === "";

/** "a, b en c" */
export function opsomming(delen) {
  if (delen.length <= 1) return delen.join("");
  return `${delen.slice(0, -1).join(", ")} en ${delen[delen.length - 1]}`;
}

/**
 * Basis van de context per render: aantal, hoe de lijst in de tekst heet en
 * de prijzen. Een categorie voegt daar eigen gesorteerde waardelijsten aan toe.
 * @param {object[]} lijst  genormaliseerde producten
 * @param {string} [naam]   hoe de lijst in de tekst heet ("je 3 favorieten")
 */
export function basisContext(lijst, naam) {
  const n = lijst.length;
  const prijzen = lijst.map((p) => p.prijs).filter(Number.isFinite);
  return {
    n,
    naam: naam || (n === 1 ? "je resultaat" : `je ${n} resultaten`),
    prijzen,
    gemPrijs: gemiddelde(prijzen),
  };
}

/**
 * Valt deze waarde op binnen de lijst? Geeft "de stilste van je 31
 * resultaten" / "een van de stilste ..." / "bij de 3 stilste ...", of null.
 * Een gedeelde eerste plek telt alleen als niet een groot deel van de lijst
 * dezelfde waarde heeft, anders is het geen onderscheid meer.
 * @param {number[]} waarden   alle waarden in de lijst
 * @param {number} w           waarde van dit product
 * @param {boolean} laagBeter  true voor bv. dB, gewicht en energielabel-rang
 * @param {object} ctx         uitkomst van basisContext()
 * @param {string} overtreffend "stilste", "lichtste", ...
 */
export function opvallend(waarden, w, laagBeter, ctx, overtreffend) {
  if (!Number.isFinite(w) || ctx.n < 3) return null;
  const beter = waarden.filter((x) => (laagBeter ? x < w : x > w)).length;
  const gelijk = waarden.filter((x) => x === w).length;
  if (beter === 0 && gelijk === 1) return { sterk: true, tekst: `de ${overtreffend} van ${ctx.naam}` };
  if (beter === 0 && gelijk <= Math.max(2, ctx.n / 4)) return { sterk: true, tekst: `een van de ${overtreffend} van ${ctx.naam}` };
  if (beter + gelijk <= 3 && ctx.n >= 8) return { sterk: false, tekst: `bij de 3 ${overtreffend} van ${ctx.naam}` };
  return null;
}

/**
 * Verzamelt kandidaat-punten met een prioriteit en één punt per onderwerp.
 * Gebruik: const p = puntenLijst(); p.voeg(20, "geluid", "..."); p.top4()
 */
export function puntenLijst() {
  const kandidaten = [];
  const gebruikt = new Set();
  return {
    gebruikt,
    voeg(prio, onderwerp, tekst) {
      if (!tekst || gebruikt.has(onderwerp)) return;
      gebruikt.add(onderwerp);
      kandidaten.push({ prio, tekst });
    },
    /** Zonder onderwerp-controle, voor de samengevoegde "Precies wat je zocht"-regel. */
    los(prio, tekst) {
      if (tekst) kandidaten.push({ prio, tekst });
    },
    top4() {
      return kandidaten.sort((x, y) => x.prio - y.prio).slice(0, 4).map((p) => p.tekst);
    },
  };
}

/**
 * Prijspunten die voor elke categorie gelden: goedkoper dan het gemiddelde
 * (alleen bij de 3 goedkoopste, anders krijgt op een op prijs gesorteerde
 * lijst elke kaart in de bovenste helft dezelfde zin) en het prijsverschil
 * tussen winkels.
 */
export function prijsPunten(p, k, ctx) {
  if (ctx.gemPrijs && ctx.n >= 4 && Number.isFinite(k.prijs)) {
    const verschil = ctx.gemPrijs - k.prijs;
    const goedkoper = ctx.prijzen.filter((x) => x < k.prijs).length;
    if (goedkoper < 3 && verschil >= 50 && verschil / ctx.gemPrijs >= 0.12) {
      p.voeg(21, "prijs", `<strong>€ ${getal(Math.round(verschil / 10) * 10)} goedkoper</strong> dan het gemiddelde van ${ctx.naam}`);
    }
  }
  const winkelPrijzen = (k.aanbieders || []).map((x) => x.prijs).filter((x) => Number.isFinite(x) && x > 0);
  if (winkelPrijzen.length >= 2) {
    const spreiding = Math.max(...winkelPrijzen) - Math.min(...winkelPrijzen);
    if (spreiding >= 30) {
      p.voeg(24, "winkels", `<strong>${winkelPrijzen.length} winkels</strong> vergeleken: tot € ${getal(Math.round(spreiding))} prijsverschil`);
    }
  }
}

/**
 * Allerlaatste vangnet, voor producten met bijna geen specificaties in de
 * catalogus: bij welke winkel(s) hij te koop is, dat is altijd bekend. Als
 * laatste aanroepen in buildResultPoints().
 */
export function winkelVangnet(p, k) {
  const winkels = [...new Set((k.aanbieders || []).map((a) => a?.winkel).filter(Boolean))];
  if (winkels.length >= 2) {
    p.voeg(98, "winkels", `Te koop bij <strong>${winkels.length} winkels</strong>, wij tonen de laagste prijs`);
    p.voeg(99, "winkelnamen", `Onder andere bij <strong>${esc(opsomming(winkels.slice(0, 3)))}</strong>`);
  } else if (winkels.length === 1) {
    p.voeg(98, "winkels", `Te koop bij <strong>${esc(winkels[0])}</strong>`);
  }
  // Puur generiek (laag 3 uit stap 5.5): altijd waar, want de pipeline
  // draait dagelijks.
  p.voeg(100, "actueel", `Prijs en levertijd <strong>elke dag bijgewerkt</strong>`);
}

/** Groepen [{titel, rijen: [[label, waarde], ...]}] zonder lege velden en lege groepen. */
export function schoonSpecs(groepen) {
  return groepen
    .map((g) => ({ titel: g.titel, rijen: g.rijen.filter(([, w]) => !leeg(w)) }))
    .filter((g) => g.rijen.length);
}
