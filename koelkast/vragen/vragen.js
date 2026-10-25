// Testversie van de koelkast-vragenpagina met een Blender-gerenderde keuken.
// Alle renders (koelkast/vragen/img) delen één camera (render/scene.py,
// --d 1.3); alleen de koelkast wisselt. De motor staat in shared/quiz3d.js.
import { createQuiz3D, makeCamera, dimLine, spotColumn } from "../../shared/quiz3d.js";
import { nishoogteGroups, nisRender, vrijstaandTypeLabels, EXTRA_CHECKS, VRIEZER_WENS, budgetCapsVoor } from "../js/data.js";
import { klant, isUitgezet, zetUit, sleutel, pagina } from "../../shared/klant.js";
import { matchKoelkasten, poolVoor, heeftWens } from "../js/matching.js";
import { normalizeProducts, parsePrice } from "../js/utils.js";
import { fetchProducts } from "../js/supabase.js";

const camera = makeCamera({ camY: -(1.3 + 2.45) });
const productsPromise = fetchProducts().catch(() => null);   // alvast ophalen

// Mislukt het ophalen (geen verbinding, database even onbereikbaar), dan één
// keer opnieuw. Lukt dat ook niet, dan meldt shared/quiz3d.js dat met een
// knop "Opnieuw proberen", in plaats van door te sturen naar een lege
// resultaatpagina.
async function productenOfFout() {
  const raw = (await productsPromise) ?? await fetchProducts().catch(() => null);
  if (!raw?.length) throw new Error("producten niet beschikbaar");
  return raw;
}

// B2B-embed: een extra wens waar de klant (vrijwel) geen producten voor
// heeft, doet niets (de matching slaat hem stil over). Die zetten we dan
// automatisch uit, bovenop wat de klant zelf in "uitgezet" heeft staan.
// Op producthulp.nl zelf gebeurt dit niet.
const MIN_PRODUCTEN_PER_OPTIE = 3;
if (klant) {
  productsPromise.then(raw => {
    const producten = normalizeProducts(raw ?? []);
    for (const [wens, voldoet] of Object.entries(EXTRA_CHECKS)) {
      if (producten.filter(voldoet).length < MIN_PRODUCTEN_PER_OPTIE) zetUit(wens);
    }
    for (const [wens, f] of Object.entries(VRIEZER_WENS)) {
      if (producten.filter(k => f(k) === true).length < MIN_PRODUCTEN_PER_OPTIE) zetUit(`vriezer-${wens}`);
    }
  });
}

// geometrie van de koelkasten (meters, zoals in render/scene.py)
const X0 = -0.31;
const FRIDGE = {
  standaard:     { w: 0.60, h: 1.86, yf: -0.70, cm: [60, 186], freezerTop: 0.72 },
  "extra-breed": { w: 0.70, h: 2.00, yf: -0.74, cm: [70, 200], freezerTop: 0.78 },
  amerikaans:    { w: 0.91, h: 1.78, yf: -0.74, cm: [91, 178] },
  tafelmodel:    { w: 0.55, h: 0.84, yf: -0.63, cm: [55, 85] },
};
const INBOUW = { x0: -0.31, x1: 0.29, yf: -0.64, z0: 0.1 };
const IMG_KEY = { standaard: "standaard", "extra-breed": "breed", amerikaans: "amerikaans", tafelmodel: "tafelmodel" };

const Q_PLAATSING = {
  id: "plaatsing", type: "radio",
  title: "Zoek je een inbouw- of vrijstaande koelkast?",
  sub: "Zie het verschil in dezelfde keuken.",
  why: "Een inbouwkoelkast wordt weggewerkt achter een keukenkastje en moet fysiek passen in de nis die daarvoor bedoeld is. Een vrijstaande koelkast staat los in de ruimte en is flexibeler qua formaat en plaatsing. Deze keuze bepaalt welke koelkasten voor jou sowieso geschikt zijn, dus we vragen dit als eerste.",
  options: [{ v: "inbouw", label: "Inbouw, wegwerken in een keukenkast", price: "€€" }, { v: "vrijstaand", label: "Vrijstaand, los in de ruimte", price: "€" }],
};
const Q_TYPE = {
  id: "vrijstaandtype", type: "radio",
  title: "Welk type koelkast zoek je?",
  sub: "De koelkast wisselt in de keuken, met de maten op ware grootte.",
  why: "Een standaard koelkast (koel-vriescombinatie of losse koelkast) past in de meeste keukens. Extra brede en Amerikaanse (side-by-side) modellen bieden meer opbergruimte, maar hebben ook meer plaats nodig. Een tafelmodel is compact en ideaal voor een kleine ruimte, zoals een studeerkamer of studio.",
  options: ["standaard", "extra-breed", "amerikaans", "tafelmodel"].map(v => ({ v, label: vrijstaandTypeLabels[v] })),
};
const Q_NIS = {
  id: "nishoogte", type: "radio", two: true,
  title: "Wat is de hoogte van je nis?",
  sub: "Meet de binnenhoogte van de opening in je keukenkast. De kast in beeld past zich aan.",
  why: "De hoogte van de nis bepaalt welke inbouwkoelkasten fysiek in je keukenkast passen. Meet de binnenhoogte van de nis waar de koelkast moet komen, van vloer tot bovenkant van de opening. Weet je het niet precies? Kies de dichtstbijzijnde maat.",
  options: [...nishoogteGroups.map(cm => ({ v: String(cm), label: `${cm} cm` })), { v: "", label: "Weet ik nog niet" }],
};
const euro = n => "€" + Math.round(n).toLocaleString("nl-NL");
const subVan = st => (st.plaatsing === "inbouw" ? st.nishoogte ?? "" : st.vrijstaandtype ?? "");
const Q_BUDGET = {
  id: "budget", type: "radio",
  title: "Wat wil je maximaal uitgeven?",
  sub: "Je krijgt de beste koelkast binnen je budget.",
  why: "Met je budget zoeken we de beste koelkast die je ook echt wilt kopen. De bedragen passen bij het type of de nis die je koos, want de prijzen lopen ver uiteen. Past een koelkast die nog beter bij je wensen past net niet binnen je bedrag, dan laten we dat op de resultaatpagina zien.",
};
// De bedragen hangen af van type of nis (data.js budgetCaps)
const budgetVraag = st => ({
  ...Q_BUDGET,
  options: [...budgetCapsVoor(st.plaatsing, subVan(st)).map(c => ({ v: String(c), label: `Tot ${euro(c)}` })), { v: "geen", label: "Geen voorkeur" }],
});
// Amerikaanse en extra brede koelkasten hebben altijd een vriezer.
const vraagVriezer = st => !(st.plaatsing === "vrijstaand" && ["amerikaans", "extra-breed"].includes(st.vrijstaandtype));
const Q_VRIEZER = {
  id: "vriezer", type: "radio",
  title: "Moet er ook een vriezer in?",
  sub: "Zie hoeveel ruimte er voor vriezen is.",
  why: "Een koel-vriescombinatie heeft een aparte vriezer met laden, genoeg voor de diepvries van een gezin. Een vriesvak is een klein vak in de koelkast, voor ijsblokjes en een pak spinazie. Zonder vriezer heb je de meeste koelruimte, handig als je al een losse vriezer hebt.",
  options: [
    { v: "vriezer", label: "Ja, een aparte vriezer (koel-vriescombinatie)", price: "€€", when: st => st.vrijstaandtype !== "tafelmodel" || st.plaatsing === "inbouw" },
    { v: "vriesvak", label: "Een klein vriesvak is genoeg", price: "€" },
    { v: "zonder", label: "Nee, alleen koelen", price: "€" },
    { v: "maakt-niet-uit", label: "Maakt niet uit", price: "€" },
  ].map(o => (o.v === "maakt-niet-uit" ? o : { ...o, when: st => !isUitgezet(`vriezer-${o.v}`) && (!o.when || o.when(st)) })),
};
const Q_GEZIN = {
  id: "gezinsgrootte", type: "radio",
  title: "Voor hoeveel personen kook je?",
  sub: "Kijk alvast naar binnen: hoeveel ruimte heb je nodig?",
  why: "Hoe meer personen in huis, hoe meer boodschappen er meestal in de koelkast moeten passen. We houden hiermee rekening bij de inhoud (in liters) die we adviseren, maar filteren nooit zo streng dat je geen passende koelkast meer te zien krijgt.",
  options: [{ v: "klein", label: "Klein huishouden, 1 tot 2 personen", price: "€" }, { v: "gemiddeld", label: "Gemiddeld huishouden, 3 tot 4 personen", price: "€€" }, { v: "groot", label: "Groot huishouden, 5 personen of meer", price: "€€€" }],
};
const isBreed = st => st.plaatsing === "vrijstaand" && ["amerikaans", "extra-breed"].includes(st.vrijstaandtype);
// No Frost zegt alleen iets als er een vriezer of vriesvak in zit.
const metVriezer = st => !vraagVriezer(st) || st.vriezer !== "zonder";
const Q_EXTRA = {
  id: "extra", type: "check", exclusive: "geen",
  title: "Wat is nog meer belangrijk voor jou?",
  sub: "Je keuzes verschijnen op de koelkast zelf.",
  // Uitleg per optie, zodat een uitgezette optie (B2B-klant) ook uit de
  // tekst verdwijnt. Wordt bij elke weergave opnieuw samengesteld.
  get why() {
    const delen = [
      ["energiezuinig", "Energiezuinig (label A, B of C) betekent een lager verbruik op je energierekening."],
      ["stil", "Stil in gebruik is prettig als de koelkast dicht bij een woon- of slaapkamer staat: dan komen de stilste van dit type bovenaan."],
      ["nofrost", "No Frost betekent dat de vriezer nooit meer handmatig ontdooid hoeft te worden."],
      ["verszone", "Een vers zone compartiment houdt groente, fruit en vlees langer vers."],
    ].filter(([v]) => !isUitgezet(v)).map(([, tekst]) => tekst);
    const breed = ["waterdispenser", "ijsmaker"].filter(v => !isUitgezet(v));
    if (breed.length === 2) delen.push("Waterdispenser en ijsmaker zijn vooral te vinden bij Amerikaanse en extra brede koelkasten.");
    else if (breed.length === 1) delen.push(`Een ${breed[0]} is vooral te vinden bij Amerikaanse en extra brede koelkasten.`);
    return delen.join(" ");
  },
  options: [
    { v: "energiezuinig", label: "Energiezuinig, laag energieverbruik", price: "€€" },
    { v: "stil", label: "Stiller dan de meeste", price: "€€" },
    { v: "nofrost", label: "Vriezer nooit ontdooien (No Frost)", price: "€€", when: st => metVriezer(st) },
    { v: "verszone", label: "Vers zone compartiment", price: "€€" },
    { v: "waterdispenser", label: "Waterdispenser", price: "€€€", when: isBreed },
    { v: "ijsmaker", label: "IJsmaker", price: "€€€", when: isBreed },
    { v: "geen", label: "Geen extra wensen", price: "€" },
  ].map(o => (o.v === "geen" ? o : { ...o, when: st => !isUitgezet(o.v) && (!o.when || o.when(st)) })),
};

const LITERS = {
  klein: ["1 tot 2 personen", "Tot zo'n 250 liter is meestal genoeg: ruimte voor de boodschappen van een week."],
  gemiddeld: ["3 tot 4 personen", "Reken op minimaal 250 liter, zodat er ook plek is voor verse groente en drinken."],
  groot: ["5 personen of meer", "Kies 350 liter of meer. Extra brede en Amerikaanse modellen komen dan in beeld."],
};
const SPOT_TEXT = {
  energiezuinig: "Laag <b>energieverbruik</b>", stil: "<b>Stiller</b> dan de meeste", nofrost: "<b>No Frost</b> vriezer",
  verszone: "<b>Verszone</b> voor groente", waterdispenser: "<b>Waterdispenser</b>", ijsmaker: "<b>IJsmaker</b>",
};
// volgorde van boven naar beneden waarin de labels op de koelkast staan
const SPOT_ORDER = ["energiezuinig", "ijsmaker", "waterdispenser", "stil", "nofrost", "verszone"];

const type = st => (st.plaatsing === "inbouw" ? "inbouw" : st.vrijstaandtype || "standaard");
// 102 en 158 cm hebben geen eigen render: de dichtstbijzijnde kast (data.js nisRender)
const nisCm = st => (st.nishoogte ? parseInt(st.nishoogte, 10) : 178);
const nisImg = st => nisRender[nisCm(st)] ?? nisCm(st);
const nisTop = st => (nisImg(st) <= 95 ? 0.87 : INBOUW.z0 + nisImg(st) / 100);

const vragen = st => [Q_PLAATSING, st.plaatsing === "inbouw" ? Q_NIS : Q_TYPE, budgetVraag(st), ...(vraagVriezer(st) ? [Q_VRIEZER] : []), Q_GEZIN, Q_EXTRA];
const QID = st => vragen(st)[st.q]?.id;

// ───────── live catalogus: budgettelling en grijze opties ─────────
let catalogus = null;
const capVan = v => (v && v !== "geen" ? Number(v) : null);
// De 2-winkelregel geldt niet in de B2B-embed: daar is de klant de enige winkel.
const MIN_WINKELS = klant ? 1 : 2;
const zichtbaarIn = st => poolVoor(catalogus ?? [], { plaatsing: st.plaatsing, nishoogte: st.nishoogte, vrijstaandtype: st.vrijstaandtype })
  .filter(k => (k.aanbieders ?? []).length >= MIN_WINKELS);
const welke = st => (st.plaatsing === "inbouw" ? (st.nishoogte ? `inbouwkoelkasten voor een nis van ${st.nishoogte} cm` : "inbouwkoelkasten") : ({
  standaard: "standaard koelkasten", "extra-breed": "extra brede koelkasten", amerikaans: "Amerikaanse koelkasten", tafelmodel: "tafelmodellen",
}[st.vrijstaandtype] ?? "koelkasten"));
function budgetCaption(st) {
  const cap = capVan(st.budget);
  if (!st.budget) return ["Jouw budget", "Kies wat je maximaal wilt uitgeven. Je krijgt de beste koelkast binnen dat bedrag, en op de resultaatpagina zie je wat meer budget oplevert."];
  if (!catalogus) return [cap ? `Tot ${euro(cap)}` : "Geen voorkeur", cap ? "We zoeken de beste koelkast binnen dit bedrag." : "We kiezen puur op je wensen."];
  const prijzen = zichtbaarIn(st).map(k => parsePrice(k.prijs));
  if (!prijzen.length) return [cap ? `Tot ${euro(cap)}` : "Geen voorkeur", "We zoeken de beste koelkast die bij je keuzes past."];
  const binnen = cap ? prijzen.filter(x => x <= cap) : prijzen;
  if (!cap) return ["Geen voorkeur", `Alle ${prijzen.length} ${welke(st)} doen mee, van ${euro(Math.min(...prijzen))} tot ${euro(Math.max(...prijzen))}.`];
  if (!binnen.length) return [`Tot ${euro(cap)}`, `Geen ${welke(st)} tot ${euro(cap)}; de goedkoopste kost ${euro(Math.min(...prijzen))}. We tonen dan de best passende.`];
  return [`Tot ${euro(cap)}`, `${binnen.length} van de ${prijzen.length} ${welke(st)} ${binnen.length === 1 ? "kost" : "kosten"} ${euro(cap)} of minder, vanaf ${euro(Math.min(...binnen))}.`];
}
// Grijs als geen koelkast bij 2+ winkels binnen type/nis en budget het zeker
// heeft, samen met de vriezerkeuze en de al aangevinkte extra's.
const EIS = {
  vriezer: Object.fromEntries(Object.keys(VRIEZER_WENS).map(v => [v, k => heeftWens(k, v) === true])),
  extra: Object.fromEntries(["energiezuinig", "nofrost", "verszone", "waterdispenser", "ijsmaker"].map(v => [v, k => heeftWens(k, v) === true])),
};
function eisenVan(st, totId, zonder) {
  const eisen = [];
  for (const q of vragen(st)) {
    const eigenRadio = q.id === totId && !Array.isArray(st[q.id]);
    if (EIS[q.id] && !eigenRadio) [].concat(st[q.id] ?? []).filter(v => EIS[q.id][v] && (q.id !== totId || v !== zonder)).forEach(v => eisen.push(EIS[q.id][v]));
    if (q.id === totId) break;
  }
  return eisen;
}
function metBeschikbaarheid(st, q) {
  if (!catalogus || !EIS[q.id]) return q;
  const cap = capVan(st.budget), alle = zichtbaarIn(st);
  const binnen = cap ? alle.filter(k => parsePrice(k.prijs) <= cap) : alle;
  return { ...q, options: q.options.map(o => {
    const eis = EIS[q.id][o.v];
    if (!eis || (o.when && !o.when(st))) return o;
    let andere = eisenVan(st, q.id, o.v);
    if (!binnen.some(k => andere.every(f => f(k)))) andere = [];
    if (binnen.some(k => eis(k) && andere.every(f => f(k)))) return o;
    const erboven = alle.filter(k => eis(k) && andere.every(f => f(k))).map(k => parsePrice(k.prijs));
    if (!alle.some(eis)) return { ...o, disabled: true, note: st.plaatsing === "inbouw" && st.nishoogte ? `Niet bij een nis van ${st.nishoogte} cm.` : "Niet bij dit type koelkast." };
    const note = cap && erboven.length ? (andere.length && binnen.some(eis) ? `Samen met je andere keuzes pas vanaf ${euro(Math.min(...erboven))}.` : `Niet tot ${euro(cap)}; wel vanaf ${euro(Math.min(...erboven))}.`)
      : "Niet in combinatie met je andere keuzes.";
    return { ...o, disabled: true, note };
  }) };
}
const VRIEZER_CAPTION = {
  vriezer: ["Aparte vriezer", "Een koel-vriescombinatie: de vriezer met laden zit onder of boven de koelkast."],
  vriesvak: ["Vriesvak", "Een klein vak in de koelkast, voor ijsblokjes en wat diepvriesgroente."],
  zonder: ["Alleen koelen", "De meeste koelruimte; handig als je al een losse vriezer hebt."],
  "maakt-niet-uit": ["Maakt niet uit", "We kijken naar alle koelkasten van dit type."],
};
function vriezerCaption(st) {
  const [kop, tekst] = VRIEZER_CAPTION[st.vriezer] ?? ["Vriezer", "Kies of er een vriezer in moet."];
  if (!catalogus || !EIS.vriezer[st.vriezer]) return [kop, tekst];
  const cap = capVan(st.budget);
  const l = zichtbaarIn(st).filter(k => !cap || parsePrice(k.prijs) <= cap);
  const n = l.filter(EIS.vriezer[st.vriezer]).length;
  return [kop, `${tekst} ${n} van de ${l.length} ${welke(st)}${cap ? " binnen je budget" : ""}.`];
}

const quiz = createQuiz3D({
  camera,
  steps: st => vragen(st).length,
  state: { plaatsing: null, vrijstaandtype: null, nishoogte: null, budget: null, vriezer: null, gezinsgrootte: null, extra: [] },
  imgPath: n => `koelkast/vragen/img/${n}.webp`,
  question: st => metBeschikbaarheid(st, vragen(st)[st.q]),

  images(st) {
    const t = type(st);
    if (t === "inbouw") return [`inbouw-${nisImg(st)}`];
    return [`${IMG_KEY[t]}-${["vriezer", "gezinsgrootte"].includes(QID(st)) ? "open" : "dicht"}`];
  },

  focus(st) {
    const t = type(st);
    if (t === "inbouw") return { x: 0, y: INBOUW.yf, z: nisImg(st) <= 95 ? 0.5 : INBOUW.z0 + nisImg(st) / 200, zoom: nisImg(st) > 95 ? 1 : 1.35 };
    const f = FRIDGE[t];
    return { x: X0 + f.w / 2, y: f.yf, z: f.h / 2, zoom: f.h > 1.2 ? 1 : 1.35 };
  },

  overlays(ctx) {
    const { st } = ctx;
    const t = type(st);
    let svg = "", html = "";
    const add = o => { svg += o.svg; html += o.html; };
    const id = QID(st);
    if (id === "vrijstaandtype" && t !== "inbouw") {
      const f = FRIDGE[t], x1 = X0 + f.w;
      add(dimLine(ctx, [X0, f.yf, f.h + 0.07], [x1, f.yf, f.h + 0.07], `<b>${f.cm[0]} cm</b> breed`));
      add(dimLine(ctx, [x1 + 0.08, f.yf, 0], [x1 + 0.08, f.yf, f.h], `<b>${f.cm[1]} cm</b> hoog`));
    }
    if (id === "nishoogte" && t === "inbouw" && st.nishoogte) {
      add(dimLine(ctx, [INBOUW.x1 + 0.08, INBOUW.yf, INBOUW.z0], [INBOUW.x1 + 0.08, INBOUW.yf, nisTop(st)], `nis <b>${nisCm(st)} cm</b>`));
    }
    if (id === "extra") {
      const keys = SPOT_ORDER.filter(k => st.extra.includes(k) && SPOT_TEXT[k]);
      const inb = t === "inbouw";
      const f = FRIDGE[t];
      const x = inb ? 0 : X0 + f.w / 2, y = inb ? -0.45 : f.yf;
      add(spotColumn(ctx, keys.map(k => ({ x, y, z: 1, label: SPOT_TEXT[k] })), {
        zBot: inb ? INBOUW.z0 + 0.08 : 0.1,
        zTop: inb ? nisTop(st) - 0.06 : f.h - 0.1,
        edgeX: inb ? INBOUW.x1 : X0 + f.w, edgeY: inb ? INBOUW.yf : f.yf,
      }));
    }
    return { svg, html };
  },

  // bij de extra's spreken de labels voor zich; op desktop zou de uitleg ze afdekken
  hideCaption: (st, mobile) => QID(st) === "extra" && !mobile && st.extra.some(e => e !== "geen"),

  caption(st) {
    const t = type(st);
    switch (QID(st)) {
      case "plaatsing":
        if (st.plaatsing === "inbouw") return ["Inbouw", "Weggewerkt achter een keukenfront. Hij moet passen in de nis van je keukenkast."];
        if (st.plaatsing === "vrijstaand") return ["Vrijstaand", "Los naast het aanrecht. Flexibel in maat en makkelijk te vervangen."];
        return ["Jouw keuken", "Kies of je koelkast wordt ingebouwd of los komt te staan. De keuken verandert mee."];
      case "nishoogte":
      case "vrijstaandtype":
        if (t === "inbouw") {
          if (st.nishoogte) return [`Nis van ${st.nishoogte} cm`, +st.nishoogte <= 95 ? "Een onderbouwkoelkast onder het aanrecht: compact en helemaal weggewerkt." : "De kastkolom heeft een nis op deze hoogte. Alleen koelkasten die precies passen tonen we."];
          if (st.nishoogte === "") return ["Nishoogte onbekend", "Geen probleem: we tonen dan alle inbouwkoelkasten, ongeacht hoogte."];
          return ["Hoogte van de nis", "Meet de binnenhoogte van de opening. De kast in beeld past zich aan je keuze aan."];
        }
        if (st.vrijstaandtype) {
          const [w, h] = FRIDGE[t].cm;
          return [vrijstaandTypeLabels[t], `${w} × ${h} cm. Het aanrecht is 90 cm hoog, zo zie je meteen hoe groot hij in je keuken staat.`];
        }
        return ["Type koelkast", "Van compact tafelmodel tot Amerikaanse side-by-side: kies een type en zie het formaat."];
      case "budget":
        return budgetCaption(st);
      case "vriezer":
        return vriezerCaption(st);
      case "gezinsgrootte":
        return st.gezinsgrootte ? LITERS[st.gezinsgrootte] : ["Kijk naar binnen", "Hoe meer mensen, hoe meer liter je nodig hebt. Kies je huishouden."];
      default: {
        if (st.extra.some(e => e !== "geen")) return ["Jouw extra's", "De gemarkeerde punten laten zien waar je keuzes op de koelkast zitten."];
        if (st.extra.includes("geen")) return ["Geen extra wensen", "Dan kijken we puur naar formaat, inhoud en prijs."];
        return ["Extra's", "Vink aan wat je belangrijk vindt; het verschijnt op de koelkast."];
      }
    }
  },

  // Terug naar vraag 1 of 2: type of nis kan veranderen, en daarmee de
  // budgetbedragen en of de vriezervraag er is.
  onBack(st) {
    if (st.q === 0) { st.vrijstaandtype = null; st.nishoogte = null; }
    if (st.q <= 1) { st.budget = null; st.vriezer = null; }
  },

  onNext(st, id) { meetStap(st, id); },

  async finish(st) {
    meetStap(st, "extra");
    const answers = {
      plaatsing: st.plaatsing ?? "",
      nishoogte: st.plaatsing === "inbouw" ? (st.nishoogte ?? "") : "",
      vrijstaandtype: st.plaatsing === "vrijstaand" ? (st.vrijstaandtype ?? "") : "",
      budget: capVan(st.budget),
      vriezer: vraagVriezer(st) ? (st.vriezer ?? "") : "",
      gezinsgrootte: st.gezinsgrootte ?? "",
      extraAnswers: st.extra.filter(e => !isUitgezet(e) && (isBreed(st) || !["waterdispenser", "ijsmaker"].includes(e)) && (e !== "nofrost" || metVriezer(st))),
    };
    const raw = await productenOfFout();
    const koelkasten = normalizeProducts(raw ?? []);
    // Beste match binnen het budget; past er niets binnen, dan zonder grens.
    let result = matchKoelkasten(koelkasten, answers);
    if (answers.budget && !result.bestMatch) result = matchKoelkasten(koelkasten, answers, null);
    localStorage.setItem(sleutel("koelkast_bestMatch"), JSON.stringify(result.bestMatch));
    localStorage.setItem(sleutel("koelkast_bestType"), result.bestType ?? "");
    localStorage.setItem(sleutel("koelkast_filteredMatchedKoelkasten"), JSON.stringify(result.filteredMatchedKoelkasten));
    localStorage.setItem(sleutel("koelkast_answers"), JSON.stringify(answers));
    window.location.href = pagina("koelkast", "resultaat");
  },

  preload: ["standaard-dicht", "inbouw-178", "breed-dicht", "amerikaans-dicht", "tafelmodel-dicht",
    "standaard-open", "breed-open", "amerikaans-open", "tafelmodel-open", ...nishoogteGroups.filter(n => !nisRender[n]).map(n => `inbouw-${n}`)],
});

// Meting: waar haken mensen af, en wat kiezen ze (o.a. de budgetvraag).
// In de B2B-embed is er geen meting (phTrackEvent bestaat daar niet).
function meetStap(st, id) {
  const v = st[id];
  window.phTrackEvent?.("quiz_stap", {
    categorie: "koelkast", stap: id, nr: vragen(st).findIndex(q => q.id === id) + 1,
    antwoord: Array.isArray(v) ? [...v].sort().join("+") : String(v ?? ""),
  });
}

// Grijze opties en live tellingen zodra de catalogus binnen is
productsPromise.then(raw => {
  if (!raw?.length) return;
  catalogus = normalizeProducts(raw);
  if (EIS[QID(quiz.st)] || QID(quiz.st) === "budget") quiz.renderQuestion();
  quiz.render();
});
