// Testversie van de vriezer-vragenpagina in de 3D-keuken (dezelfde keuken als
// de koelkast-test). Renders: render/scene.py, --d 1.3. Motor: shared/quiz3d.js.
import { createQuiz3D, makeCamera, dimLine, spotColumn } from "../../shared/quiz3d.js";
import {
  nishoogteGroups, vrijstaandGrootteLabels, vrijstaandGrootteInhoud,
  vrieskistGrootteLabels, vrieskistGrootteInhoud, budgetCapsVoor,
} from "../js/data.js";
import { matchVriezers, poolVoor, heeftWens } from "../js/matching.js";
import { normalizeProducts, parsePrice } from "../js/utils.js";
import { fetchProducts } from "../js/supabase.js";

const camera = makeCamera({ camY: -(1.3 + 2.45) });
const productsPromise = fetchProducts().catch(() => null);

// Mislukt het ophalen (geen verbinding, database even onbereikbaar), dan één
// keer opnieuw. Lukt dat ook niet, dan meldt shared/quiz3d.js dat met een
// knop "Opnieuw proberen", in plaats van door te sturen naar een lege
// resultaatpagina.
async function productenOfFout() {
  const raw = (await productsPromise) ?? await fetchProducts().catch(() => null);
  if (!raw?.length) throw new Error("producten niet beschikbaar");
  return raw;
}

// Nishoogtes alleen tonen als er voorraad in die maat is (zelfde regel als de
// huidige keuzehulp); zolang de producten nog laden tonen we alle maten.
let availableNis = null;
productsPromise.then(raw => {
  const set = new Set(normalizeProducts(raw ?? []).filter(v => v.plaatsing === "inbouw" && v.nishoogteGroup).map(v => v.nishoogteGroup));
  if (set.size) availableNis = set;
});

// geometrie (meters, zoals in render/scene.py)
const X0 = -0.31;
const KAST = { klein: { w: 0.55, h: 0.84, yf: -0.63 }, middel: { w: 0.60, h: 1.45, yf: -0.64 }, groot: { w: 0.60, h: 1.86, yf: -0.64 } };
const KIST = { klein: { w: 0.80, h: 0.85, yf: -0.62 }, middel: { w: 1.10, h: 0.85, yf: -0.71 }, groot: { w: 1.50, h: 0.85, yf: -0.76 } };
const KIST_X0 = -0.29;
const INBOUW = { x0: -0.31, x1: 0.29, yf: -0.64, z0: 0.1 };

const Q_PLAATSING = {
  id: "plaatsing", type: "radio",
  title: "Zoek je een inbouw-, vrijstaande of vrieskist-vriezer?",
  sub: "Zie het verschil in dezelfde keuken.",
  why: "Een inbouwvriezer wordt weggewerkt achter een keukenkastje en moet fysiek passen in de nis die daarvoor bedoeld is. Een vrijstaande vriezer (kastmodel) staat rechtop los in de ruimte. Een vrieskist ligt plat, heeft een deksel in plaats van een deur, en is vooral geschikt voor grote hoeveelheden of onregelmatig gevormde etenswaren.",
  options: [
    { v: "inbouw", label: "Inbouw, wegwerken in een keukenkast", price: "€€" },
    { v: "vrijstaand", label: "Vrijstaand kastmodel, rechtop staand", price: "€" },
    { v: "vrieskist", label: "Vrieskist, liggend model", price: "€€" },
  ],
};
const Q_NIS = {
  id: "nishoogte", type: "radio", two: true,
  title: "Wat is de hoogte van je nis?",
  sub: "Meet de binnenhoogte van de opening in je keukenkast. De kast in beeld past zich aan.",
  why: "De hoogte van de nis bepaalt welke inbouwvriezers fysiek in je keukenkast passen. Meet de binnenhoogte van de nis waar de vriezer moet komen, van vloer tot bovenkant van de opening. Weet je het niet precies? Kies de dichtstbijzijnde maat.",
  options: [...nishoogteGroups.map(cm => ({ v: String(cm), label: `${cm} cm`, when: () => !availableNis || availableNis.has(cm) })), { v: "", label: "Weet ik nog niet" }],
};
const grootteQ = kist => ({
  id: "grootte", type: "radio",
  title: kist ? "Welke inhoud heb je nodig?" : "Welk formaat zoek je?",
  sub: "De vriezer wisselt in de keuken, met de maten op ware grootte.",
  why: kist
    ? "Vrieskisten variëren sterk in inhoud. Een kleine kist is prima voor incidenteel invriezen; een middelgrote of grote kist is handig als je structureel veel wilt invriezen of grote, onregelmatig gevormde etenswaren wilt bewaren."
    : "Een kleine/compacte vrieskast past ook in een kleine ruimte, zoals een bijkeuken of studio. Een middelgrote of grote vrieskast biedt meer opbergruimte voor een gezin.",
  options: [...["klein", "middel", "groot"].map(v => ({
    v, label: `${(kist ? vrieskistGrootteLabels : vrijstaandGrootteLabels)[v]} <span class="muted">(${(kist ? vrieskistGrootteInhoud : vrijstaandGrootteInhoud)[v]})</span>`,
    price: { klein: "€", middel: "€€", groot: "€€€" }[v],
  })), { v: "maakt-niet-uit", label: "Maakt niet uit", price: "€" }],
});
// Sinds okt. 2026: geen vraag "voor hoeveel personen" meer. Het formaat gaat
// al over liters; samen gaven ze tegenstrijdige eisen ("klein" + "5 personen").
const euro = n => "€" + Math.round(n).toLocaleString("nl-NL");
const subVan = st => (st.plaatsing === "inbouw" ? st.nishoogte ?? "" : st.grootte && st.grootte !== "maakt-niet-uit" ? st.grootte : "");
const budgetVraag = st => ({
  id: "budget", type: "radio",
  title: "Wat wil je maximaal uitgeven?",
  sub: "Je krijgt de beste vriezer binnen je budget.",
  why: "Met je budget zoeken we de beste vriezer die je ook echt wilt kopen. De bedragen passen bij het soort en formaat dat je koos. Past een vriezer die nog beter bij je wensen past net niet binnen je bedrag, dan laten we dat op de resultaatpagina zien.",
  options: [...budgetCapsVoor(st.plaatsing, subVan(st)).map(c => ({ v: String(c), label: `Tot ${euro(c)}` })), { v: "geen", label: "Geen voorkeur" }],
});
const Q_EXTRA = {
  id: "extra", type: "check", exclusive: "geen",
  title: "Wat is nog meer belangrijk voor jou?",
  sub: "Je keuzes verschijnen op de vriezer zelf.",
  why: "No Frost betekent dat je nooit meer handmatig hoeft te ontdooien; vrieskisten hebben dat niet. Bij zuinig en stil komen de zuinigste en stilste van dit soort bovenaan. De meeste vriezers werken pas vanaf +10 °C; voor een onverwarmde garage of schuur heb je er een nodig die ook bij vorst werkt.",
  options: [
    { v: "nofrost", label: "Nooit ontdooien (No Frost)", price: "€€", when: st => st.plaatsing !== "vrieskist" },
    { v: "energiezuinig", label: "Zo zuinig mogelijk", price: "€€" },
    { v: "stil", label: "Stiller dan de meeste", price: "€€" },
    { v: "garage", label: "Ook in een koude garage of schuur (tot −15 °C)", price: "€€" },
    { v: "geen", label: "Geen extra wensen", price: "€" },
  ],
};

const SPOT_TEXT = { energiezuinig: "<b>Zuinig</b> voor zijn soort", stil: "<b>Stiller</b> dan de meeste", nofrost: "<b>No Frost</b>: nooit ontdooien", garage: "Werkt ook in een <b>koude garage</b>" };

const vragen = st => [Q_PLAATSING, st.plaatsing === "inbouw" ? Q_NIS : grootteQ(st.plaatsing === "vrieskist"), budgetVraag(st), Q_EXTRA];
const QID = st => vragen(st)[st.q]?.id;

// ───────── live catalogus: budgettelling en grijze opties ─────────
let catalogus = null;
const capVan = v => (v && v !== "geen" ? Number(v) : null);
const zichtbaarIn = st => poolVoor(catalogus ?? [], { plaatsing: st.plaatsing, nishoogte: st.nishoogte, grootte: subVan(st) })
  .filter(v => (v.aanbieders ?? []).length >= 2);
const welke = st => ({ inbouw: "inbouwvriezers", vrijstaand: "vrieskasten", vrieskist: "vrieskisten" }[st.plaatsing] ?? "vriezers") + (st.plaatsing === "inbouw" && st.nishoogte ? ` voor een nis van ${st.nishoogte} cm` : "");
function budgetCaption(st) {
  const cap = capVan(st.budget);
  if (!st.budget) return ["Jouw budget", "Kies wat je maximaal wilt uitgeven. Je krijgt de beste vriezer binnen dat bedrag, en op de resultaatpagina zie je wat meer budget oplevert."];
  if (!catalogus) return [cap ? `Tot ${euro(cap)}` : "Geen voorkeur", cap ? "We zoeken de beste vriezer binnen dit bedrag." : "We kiezen puur op je wensen."];
  const prijzen = zichtbaarIn(st).map(v => parsePrice(v.prijs));
  if (!prijzen.length) return [cap ? `Tot ${euro(cap)}` : "Geen voorkeur", "We zoeken de beste vriezer die bij je keuzes past."];
  const binnen = cap ? prijzen.filter(x => x <= cap) : prijzen;
  if (!cap) return ["Geen voorkeur", `Alle ${prijzen.length} ${welke(st)} doen mee, van ${euro(Math.min(...prijzen))} tot ${euro(Math.max(...prijzen))}.`];
  if (!binnen.length) return [`Tot ${euro(cap)}`, `Geen ${welke(st)} tot ${euro(cap)}; de goedkoopste kost ${euro(Math.min(...prijzen))}. We tonen dan de best passende.`];
  return [`Tot ${euro(cap)}`, `${binnen.length} van de ${prijzen.length} ${welke(st)} ${binnen.length === 1 ? "kost" : "kosten"} ${euro(cap)} of minder, vanaf ${euro(Math.min(...binnen))}.`];
}
// Grijs als geen vriezer bij 2+ winkels binnen soort, nis/formaat en budget
// het zeker heeft, samen met de andere aangevinkte wensen.
const EIS = { extra: { nofrost: v => heeftWens(v, "nofrost") === true, garage: v => heeftWens(v, "garage") === true } };
function metBeschikbaarheid(st, q) {
  if (!catalogus || !EIS[q.id]) return q;
  const cap = capVan(st.budget), alle = zichtbaarIn(st);
  const binnen = cap ? alle.filter(v => parsePrice(v.prijs) <= cap) : alle;
  return { ...q, options: q.options.map(o => {
    const eis = EIS[q.id][o.v];
    if (!eis || (o.when && !o.when(st))) return o;
    let andere = st.extra.filter(e => e !== o.v && EIS.extra[e]).map(e => EIS.extra[e]);
    if (!binnen.some(v => andere.every(f => f(v)))) andere = [];
    if (binnen.some(v => eis(v) && andere.every(f => f(v)))) return o;
    if (!alle.some(eis)) return { ...o, disabled: true, note: `Geen van deze ${welke(st)} kan dat.` };
    const erboven = alle.filter(v => eis(v) && andere.every(f => f(v))).map(v => parsePrice(v.prijs));
    const note = cap && erboven.length ? (andere.length && binnen.some(eis) ? `Samen met je andere keuzes pas vanaf ${euro(Math.min(...erboven))}.` : `Niet tot ${euro(cap)}; wel vanaf ${euro(Math.min(...erboven))}.`)
      : "Niet in combinatie met je andere keuzes.";
    return { ...o, disabled: true, note };
  }) };
}
function extraCaption(st) {
  const wensen = st.extra.filter(e => EIS.extra[e]);
  if (!st.extra.some(e => e !== "geen")) return st.extra.length ? ["Geen extra wensen", "We kiezen puur op soort, formaat en prijs."] : ["Extra's", "Vink aan wat je belangrijk vindt; het verschijnt op de vriezer."];
  if (!catalogus || !wensen.length) return ["Jouw extra's", "De gemarkeerde punten laten zien waar je keuzes zitten."];
  const cap = capVan(st.budget);
  const l = zichtbaarIn(st).filter(v => !cap || parsePrice(v.prijs) <= cap);
  const n = l.filter(v => wensen.every(w => EIS.extra[w](v))).length;
  return ["Jouw extra's", `${n} van de ${l.length} ${welke(st)}${cap ? " binnen je budget" : ""} ${n === 1 ? "heeft" : "hebben"} zeker ${wensen.length > 1 ? "alles wat je koos" : wensen[0] === "nofrost" ? "No Frost" : "garagebestendigheid"}.`];
}

const size = st => (["klein", "middel", "groot"].includes(st.grootte) ? st.grootte : "middel");
const nisCm = st => (st.nishoogte ? parseInt(st.nishoogte, 10) : 178);
const nisTop = st => (nisCm(st) <= 95 ? 0.87 : INBOUW.z0 + nisCm(st) / 100);
// het object in beeld: { x0, w, h, yf } in meters
function obj(st) {
  if (st.plaatsing === "inbouw") return { x0: INBOUW.x0, w: INBOUW.x1 - INBOUW.x0, h: nisTop(st), yf: INBOUW.yf, zb: INBOUW.z0 };
  if (st.plaatsing === "vrieskist") return { x0: KIST_X0, ...KIST[size(st)], zb: 0 };
  return { x0: X0, ...KAST[size(st)], zb: 0 };
}

const quiz = createQuiz3D({
  camera,
  steps: st => vragen(st).length,
  state: { plaatsing: null, nishoogte: null, grootte: null, budget: null, extra: [] },
  imgPath: n => `vriezer/vragen/img/${n}.webp`,
  question: st => metBeschikbaarheid(st, vragen(st)[st.q]),

  images(st) {
    if (st.plaatsing === "inbouw") return [`inbouw-${nisCm(st)}`];
    const kind = st.plaatsing === "vrieskist" ? "kist" : "kast";
    // bij de budgetvraag kijk je naar binnen (vroeger de personenvraag)
    return [`${kind}-${size(st)}-${QID(st) === "budget" ? "open" : "dicht"}`];
  },

  focus(st) {
    const o = obj(st);
    return { x: o.x0 + o.w / 2, y: o.yf, z: (o.zb + o.h) / 2, zoom: o.h > 1.2 || o.w > 1 ? 1 : 1.3 };
  },

  overlays(ctx) {
    const { st } = ctx;
    let svg = "", html = "";
    const add = r => { svg += r.svg; html += r.html; };
    const o = obj(st);
    const x1 = o.x0 + o.w;
    const id = QID(st);
    if (id === "grootte" && st.grootte && st.grootte !== "maakt-niet-uit") {
      add(dimLine(ctx, [o.x0, o.yf, o.h + 0.07], [x1, o.yf, o.h + 0.07], `<b>${Math.round(o.w * 100)} cm</b> breed`));
      add(dimLine(ctx, [x1 + 0.08, o.yf, 0], [x1 + 0.08, o.yf, o.h], `<b>${Math.round(o.h * 100)} cm</b> hoog`));
    }
    if (id === "nishoogte" && st.nishoogte) {
      add(dimLine(ctx, [INBOUW.x1 + 0.08, INBOUW.yf, INBOUW.z0], [INBOUW.x1 + 0.08, INBOUW.yf, nisTop(st)], `nis <b>${nisCm(st)} cm</b>`));
    }
    if (id === "extra") {
      const keys = ["energiezuinig", "nofrost", "stil", "garage"].filter(k => st.extra.includes(k));
      const inb = st.plaatsing === "inbouw";
      const x = o.x0 + o.w / 2, y = inb ? -0.45 : o.yf;
      add(spotColumn(ctx, keys.map(k => ({ x, y, z: 1, label: SPOT_TEXT[k] })), {
        zBot: o.zb + 0.1, zTop: o.h - 0.1, edgeX: x1, edgeY: o.yf,
      }));
    }
    return { svg, html };
  },

  hideCaption: (st, mobile) => QID(st) === "extra" && !mobile && st.extra.some(e => e !== "geen") && !st.extra.some(e => EIS.extra[e]),

  caption(st) {
    switch (QID(st)) {
      case "plaatsing":
        return {
          inbouw: ["Inbouw", "Weggewerkt achter een keukenfront. Hij moet passen in de nis van je keukenkast."],
          vrijstaand: ["Vrijstaand kastmodel", "Rechtop, met laden: overzichtelijk en makkelijk te vinden wat je zoekt."],
          vrieskist: ["Vrieskist", "Liggend met een deksel: veel ruimte, ook voor grote of onregelmatige dingen."],
        }[st.plaatsing] ?? ["Jouw keuken", "Kies het soort vriezer. De keuken verandert mee."];
      case "nishoogte":
      case "grootte":
        if (st.plaatsing === "inbouw") {
          if (st.nishoogte) return [`Nis van ${st.nishoogte} cm`, +st.nishoogte <= 95 ? "Een onderbouwvriezer onder het aanrecht: compact en helemaal weggewerkt." : "De kastkolom heeft een nis op deze hoogte. Alleen vriezers die precies passen tonen we."];
          if (st.nishoogte === "") return ["Nishoogte onbekend", "Geen probleem: we tonen dan alle inbouwvriezers, ongeacht hoogte."];
          return ["Hoogte van de nis", "Meet de binnenhoogte van de opening. De kast in beeld past zich aan je keuze aan."];
        }
        if (st.grootte === "maakt-niet-uit") return ["Maakt niet uit", "We kijken naar alle formaten; de beste prijs telt mee."];
        if (st.grootte) {
          const kist = st.plaatsing === "vrieskist";
          const o = obj(st);
          return [(kist ? vrieskistGrootteLabels : vrijstaandGrootteLabels)[st.grootte], `${(kist ? vrieskistGrootteInhoud : vrijstaandGrootteInhoud)[st.grootte]}, ongeveer ${Math.round(o.w * 100)} × ${Math.round(o.h * 100)} cm. Het aanrecht is 90 cm hoog.`];
        }
        return ["Formaat", "Kies een formaat en zie hoe groot hij in de keuken staat."];
      case "budget":
        return budgetCaption(st);
      default:
        return extraCaption(st);
    }
  },

  // Terug naar vraag 1 of 2: soort of formaat kan veranderen, en daarmee de budgetbedragen.
  onBack(st) {
    if (st.q === 0) { st.grootte = null; st.nishoogte = null; }
    if (st.q <= 1) st.budget = null;
  },

  onNext(st, id) { meetStap(st, id); },

  async finish(st) {
    meetStap(st, "extra");
    const answers = {
      plaatsing: st.plaatsing ?? "",
      nishoogte: st.plaatsing === "inbouw" ? (st.nishoogte ?? "") : "",
      grootte: st.plaatsing !== "inbouw" ? subVan(st) : "",
      budget: capVan(st.budget),
      extraAnswers: st.extra.filter(e => e !== "nofrost" || st.plaatsing !== "vrieskist"),
    };
    const vriezers = normalizeProducts(await productenOfFout());
    // Beste match binnen het budget; past er niets binnen, dan zonder grens.
    let result = matchVriezers(vriezers, answers);
    if (answers.budget && !result.bestMatch) result = matchVriezers(vriezers, answers, null);
    localStorage.setItem("vriezer_bestMatch", JSON.stringify(result.bestMatch));
    localStorage.setItem("vriezer_bestType", result.bestType ?? "");
    localStorage.setItem("vriezer_filteredMatchedVriezers", JSON.stringify(result.filteredMatchedVriezers));
    localStorage.setItem("vriezer_answers", JSON.stringify(answers));
    window.location.href = "vriezer/resultaat/";
  },

  preload: ["kast-middel-dicht", "inbouw-178", "kist-middel-dicht", "kast-klein-dicht", "kast-groot-dicht", "kist-klein-dicht", "kist-groot-dicht",
    "kast-middel-open", "kist-middel-open", ...nishoogteGroups.map(n => `inbouw-${n}`)],
});

// Meting: waar haken mensen af, en wat kiezen ze (o.a. de budgetvraag)
function meetStap(st, id) {
  const v = st[id];
  window.phTrackEvent?.("quiz_stap", {
    categorie: "vriezer", stap: id, nr: vragen(st).findIndex(q => q.id === id) + 1,
    antwoord: Array.isArray(v) ? [...v].sort().join("+") : String(v ?? ""),
  });
}

// Grijze opties en live tellingen zodra de catalogus binnen is
productsPromise.then(raw => {
  if (!raw?.length) return;
  catalogus = normalizeProducts(raw);
  if (["extra", "budget"].includes(QID(quiz.st))) quiz.renderQuestion();
  quiz.render();
});
