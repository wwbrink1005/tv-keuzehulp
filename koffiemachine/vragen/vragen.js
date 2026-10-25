// Testversie van de koffiemachine-vragenpagina in de 3D-keuken (zelfde werkblad als de
// airfryer-test). Basisrender = de keuken; de koffiemachine (volautomaat, halfautomaat,
// capsule of filter, met melkkaraf/opschuimer of stoompijpje) en de kopjes op het
// dienblad zijn transparante lagen (render/scene.py). Display en labels tekent de
// pagina zelf. Net als de huidige keuzehulp: bij filterkoffie vervalt de melkvraag en
// de wifi-optie. Motor: shared/quiz3d.js.
import { createQuiz3D, makeCamera, placeQuad } from "../../shared/quiz3d.js";
import { matchKoffiemachines, poolVoor, heeftWens, wensenVan, VEEL_DRANKEN, KOPJES_MIN } from "../js/matching.js";
import { normalizeProducts, parsePrice } from "../js/utils.js";
import { fetchProducts } from "../js/supabase.js";
import { budgetCaps, SYSTEEM_LABEL, MIN_WINKELS } from "../js/data.js";

const camera = makeCamera({ camX: -0.72, camY: -1.9, camZ: 1.42, shiftX: -0.12, shiftY: -0.12 });
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

// geometrie (m) zoals in render/scene.py: machine op het werkblad (z = 0.9) tegen de muur
const Z0 = 0.9, KX = -0.66, KYB = -0.07;
const DIM = { vol: [0.24, 0.40, 0.37], half: [0.28, 0.30, 0.38], caps: [0.14, 0.32, 0.27], filter: [0.21, 0.26, 0.37] };
const KEY = { volautomaat: "vol", halfautomaat: "half", capsules: "caps", filter: "filter" };
const kind = st => KEY[st.type] ?? "vol";
const dims = st => { const [w, d, h] = DIM[kind(st)]; return { w, d, h, x0: KX - w / 2, x1: KX + w / 2, yf: KYB - d }; };
const euro = n => "€" + Math.round(n).toLocaleString("nl-NL");

const Q_TYPE = {
  id: "type", type: "radio",
  title: "Wat voor koffiemachine zoek je?",
  sub: "De machine op het werkblad wisselt mee.",
  why: "Het type koffiemachine bepaalt het meest hoeveel je kwijt bent: een volautomaat (bonen, alles op 1 druk op de knop) kost gemiddeld een stuk meer dan een filterapparaat of capsulemachine. Een halfautomaat/handmatige machine geeft je zelf meer controle over je espresso, maar vraagt ook meer handigheid.",
  options: [{ v: "volautomaat", label: "Volautomaat, bonen, alles op 1 druk op de knop", price: "€€€" }, { v: "halfautomaat", label: "Halfautomaat/handmatig, zelf meer controle", price: "€€" }, { v: "capsules", label: "Capsules of pads, snel en makkelijk", price: "€" }, { v: "filter", label: "Filterkoffie, grote kan, eenvoudig", price: "€" }],
};
// Sinds okt. 2026: per type andere vragen (zie docs/koffiemachine-keuzehulp-werking.md).
const Q_MELK_VOL = {
  id: "melk", type: "radio",
  title: "Wil je ook cappuccino of latte?",
  sub: "Zie hoe de melk wordt opgeschuimd.",
  why: "Bij cappuccino op één knop zuigt de machine de melk zelf op uit een karaf of melkpak (zoals LatteGo of LatteCrema) en schuimt hem op: makkelijk, maar duurder. Met een stoompijpje schuim je de melk zelf op in een kannetje; dat vraagt wat oefening, maar je hebt meer controle. Drink je alleen zwarte koffie, dan heb je geen melksysteem nodig.",
  options: [
    { v: "auto", label: "Ja, cappuccino op één knop", price: "€€€" },
    { v: "stoom", label: "Ja, zelf opschuimen met een stoompijpje is prima", price: "€€" },
    { v: "geen", label: "Nee, alleen zwarte koffie", price: "€" },
  ],
};
const Q_MOLEN = {
  id: "molen", type: "radio",
  title: "Moet hij ook de bonen malen?",
  sub: "Zie het verschil met en zonder bonenmaler.",
  why: "Een halfautomaat met ingebouwde bonenmaler maalt vers voor elk kopje: de lekkerste espresso, zonder losse molen. Zonder bonenmaler gebruik je gemalen koffie (of koop je een losse molen); die machines zijn een stuk goedkoper.",
  options: [
    { v: "ja", label: "Ja, met ingebouwde bonenmaler", price: "€€€" },
    { v: "nee", label: "Nee, ik gebruik gemalen koffie", price: "€" },
    { v: "maakt-niet-uit", label: "Maakt niet uit", price: "€€" },
  ],
};
const Q_SYSTEEM = {
  id: "systeem", type: "radio",
  title: "Welke capsules of pads wil je gebruiken?",
  sub: "Het systeem bepaalt welke koffie je straks koopt.",
  why: "Het systeem bepaalt jarenlang welke cups je koopt. Senseo-pads zijn het goedkoopst per kopje en liggen in elke supermarkt. Voor gewone Nespresso-cups zijn er veel merken, ook in de supermarkt. Vertuo-capsules koop je alleen bij Nespresso; ze zetten ook grote mokken en lungo met een crema. Dolce Gusto maakt ook cappuccino en chocomel met melkcapsules. L'OR Barista werkt met L'OR-cups én gewone Nespresso-cups.",
  options: [
    { v: "nespresso", label: "Nespresso (Original)", price: "€€" },
    { v: "vertuo", label: "Nespresso Vertuo", price: "€€€" },
    { v: "dolcegusto", label: "Dolce Gusto", price: "€€" },
    { v: "senseo", label: "Senseo-pads", price: "€" },
    { v: "lor", label: "L'OR Barista", price: "€€" },
    { v: "maakt-niet-uit", label: "Maakt niet uit", price: "€" },
  ],
};
const Q_MELK_CAPS = {
  id: "melk", type: "radio",
  title: "Wil je ook cappuccino of latte maken?",
  sub: "Zie hoe de melk wordt opgeschuimd.",
  why: "Sommige capsulemachines hebben een melkopschuimer (Nespresso Lattissima, CitiZ & Milk met Aeroccino); Dolce Gusto maakt cappuccino met melkcapsules. Machines zonder melk zijn kleiner en goedkoper.",
  options: [{ v: "ja", label: "Ja, ook cappuccino of latte", price: "€€" }, { v: "maakt-niet-uit", label: "Nee, zwarte koffie is genoeg", price: "€" }],
};
const Q_KOPJES = {
  id: "kopjes", type: "radio",
  title: "Hoeveel koffie zet je per keer?",
  sub: "Het dienblad laat zien voor hoeveel mensen.",
  why: `De meeste filterapparaten zetten een kan van 10 kopjes. Zet je vaak koffie voor bezoek of op kantoor, dan is een kan van ${KOPJES_MIN.groot} tot 15 kopjes handiger.`,
  options: [{ v: "klein", label: "Voor een paar mensen", price: "€" }, { v: "groot", label: `Voor veel mensen (${KOPJES_MIN.groot}+ kopjes)`, price: "€€" }],
};
const budgetVraag = st => ({
  id: "budget", type: "radio",
  title: "Wat wil je maximaal uitgeven?",
  sub: "Je krijgt de beste koffiemachine binnen je budget.",
  why: "Met je budget zoeken we de beste koffiemachine die je ook echt wilt kopen. De bedragen passen bij het type dat je koos. Past een machine die nog beter bij je wensen past net niet binnen je bedrag, dan laten we dat op de resultaatpagina zien.",
  options: [...(budgetCaps[st.type] ?? budgetCaps.volautomaat).map(c => ({ v: String(c), label: `Tot ${euro(c)}` })), { v: "geen", label: "Geen voorkeur" }],
});
const Q_EXTRA_VOL = {
  id: "extra", type: "check", exclusive: "geen",
  title: "Nog iets belangrijk?",
  sub: "Je keuzes verschijnen op de machine.",
  why: `Twee kopjes tegelijk scheelt wachten als je met z'n tweeën koffie drinkt. Met de app kies en start je je koffie vanaf je telefoon. Veel koffiesoorten: ${VEEL_DRANKEN} of meer dranken op één knop, zoals flat white en ristretto. Heet water voor thee en een uitneembare zetgroep heeft vrijwel elke volautomaat.`,
  options: [
    { v: "tweekopjes", label: "Twee kopjes tegelijk", price: "€€" },
    { v: "app", label: "Bediening met de app", price: "€€€" },
    { v: "dranken", label: `Veel koffiesoorten (${VEEL_DRANKEN}+)`, price: "€€€" },
    { v: "geen", label: "Geen extra wensen", price: "€" },
  ],
};
const Q_EXTRA_FILTER = {
  id: "extra", type: "check", exclusive: "geen",
  title: "Nog iets belangrijk?",
  sub: "Je keuzes verschijnen op het apparaat.",
  why: "Een thermoskan houdt de koffie uren warm zonder warmhoudplaat, en de koffie brandt niet aan. Met een timer staat de koffie klaar als je opstaat. Met een bonenmaler (grind & brew) maal je de bonen vers voor elke kan.",
  options: [
    { v: "thermoskan", label: "Thermoskan", price: "€€" },
    { v: "timer", label: "Timer: koffie klaar als je opstaat", price: "€€" },
    { v: "grind", label: "Met bonenmaler", price: "€€€" },
    { v: "geen", label: "Geen extra wensen", price: "€" },
  ],
};
const questions = st => ({
  volautomaat: [Q_TYPE, Q_MELK_VOL, budgetVraag(st), Q_EXTRA_VOL],
  halfautomaat: [Q_TYPE, Q_MOLEN, budgetVraag(st)],
  capsules: [Q_TYPE, Q_SYSTEEM, Q_MELK_CAPS, budgetVraag(st)],
  filter: [Q_TYPE, Q_KOPJES, budgetVraag(st), Q_EXTRA_FILTER],
}[st.type] ?? [Q_TYPE, Q_MELK_VOL, budgetVraag(st), Q_EXTRA_VOL]);
const qId = st => questions(st)[st.q].id;

// ───────── live catalogus: budgettelling en grijze opties ─────────
let catalogus = null;
const capVan = v => (v && v !== "geen" ? Number(v) : null);
const antw = st => ({ type: st.type, systeem: st.systeem });
const zichtbaarIn = st => poolVoor(catalogus ?? [], antw(st)).filter(k => (k.aanbieders ?? []).length >= MIN_WINKELS);
const welke = st => ({ volautomaat: "volautomaten", halfautomaat: "halfautomaten", filter: "filterapparaten" }[st.type]
  ?? (st.systeem && SYSTEEM_LABEL[st.systeem] ? `${SYSTEEM_LABEL[st.systeem]}-machines` : "capsulemachines"));
function budgetCaption(st) {
  const cap = capVan(st.budget);
  if (!st.budget) return ["Jouw budget", "Kies wat je maximaal wilt uitgeven. Je krijgt de beste koffiemachine binnen dat bedrag, en op de resultaatpagina zie je wat meer budget oplevert."];
  if (!catalogus) return [cap ? `Tot ${euro(cap)}` : "Geen voorkeur", cap ? "We zoeken de beste machine binnen dit bedrag." : "We kiezen puur op je wensen."];
  const prijzen = zichtbaarIn(st).map(k => parsePrice(k.prijs));
  if (!prijzen.length) return [cap ? `Tot ${euro(cap)}` : "Geen voorkeur", "We zoeken de beste machine die bij je keuzes past."];
  const binnen = cap ? prijzen.filter(x => x <= cap) : prijzen;
  if (!cap) return ["Geen voorkeur", `Alle ${prijzen.length} ${welke(st)} doen mee, van ${euro(Math.min(...prijzen))} tot ${euro(Math.max(...prijzen))}.`];
  if (!binnen.length) return [`Tot ${euro(cap)}`, `Geen ${welke(st)} tot ${euro(cap)}; de goedkoopste kost ${euro(Math.min(...prijzen))}. We tonen dan de best passende.`];
  return [`Tot ${euro(cap)}`, `${binnen.length} van de ${prijzen.length} ${welke(st)} ${binnen.length === 1 ? "kost" : "kosten"} ${euro(cap)} of minder, vanaf ${euro(Math.min(...binnen))}.`];
}
// Grijs als geen machine binnen type, systeem en budget het zeker heeft, samen
// met de eerdere keuzes (melk, bonenmaler, andere extra's). Bij een radiovraag
// telt het eigen antwoord niet mee als eis.
function eisenTot(st, id, zonder) {
  const a = { melk: st.melk, molen: st.molen, extraAnswers: st.extra.filter(e => e !== zonder) };
  if (id === "melk") delete a.melk;
  if (id === "molen") delete a.molen;
  if (id === "melk" || id === "molen") a.extraAnswers = [];
  return wensenVan(a).map(w => k => heeftWens(k, w) === true);
}
const WENS_VAN_OPTIE = {
  melk: { auto: "melk-auto", stoom: "melk-stoom", ja: "melk" },
  molen: { ja: "molen", nee: "zonder-molen" },
  extra: { tweekopjes: "tweekopjes", app: "app", dranken: "dranken", thermoskan: "thermoskan", timer: "timer", grind: "grind" },
};
function metBeschikbaarheid(st, q) {
  const map = WENS_VAN_OPTIE[q.id];
  if (!catalogus || !map) return q;
  const cap = capVan(st.budget), alle = zichtbaarIn(st);
  const binnen = cap ? alle.filter(k => parsePrice(k.prijs) <= cap) : alle;
  return { ...q, options: q.options.map(o => {
    if (!map[o.v] || (o.when && !o.when(st))) return o;
    const eis = k => heeftWens(k, map[o.v]) === true;
    let andere = eisenTot(st, q.id, o.v);
    if (!binnen.some(k => andere.every(f => f(k)))) andere = [];
    if (binnen.some(k => eis(k) && andere.every(f => f(k)))) return o;
    if (!alle.some(eis)) return { ...o, disabled: true, note: `Geen van deze ${welke(st)} heeft dat.` };
    const erboven = alle.filter(k => eis(k) && andere.every(f => f(k))).map(k => parsePrice(k.prijs));
    const note = cap && erboven.length ? (andere.length && binnen.some(eis) ? `Samen met je andere keuzes pas vanaf ${euro(Math.min(...erboven))}.` : `Niet tot ${euro(cap)}; wel vanaf ${euro(Math.min(...erboven))}.`)
      : "Niet in combinatie met je andere keuzes.";
    return { ...o, disabled: true, note };
  }) };
}

// ───────── overlays ─────────
const tag = (p, html) => `<div class="tag is-on" style="left:${p.x}px;top:${Math.max(p.y, 56)}px">${html}</div>`;
const above = (ctx, st) => ctx.toPx(KX, dims(st).yf, Z0 + dims(st).h + (kind(st) === "half" ? 0.12 : 0.07));

function spots(ctx, pts, edgeX, edgeY) {
  let svg = "", html = "";
  if (!pts.length) return { svg, html };
  const placed = pts.map(p => ({ ...p, px: ctx.toPx(...p.w) })).sort((a, b) => a.px.y - b.px.y);
  let labelX = ctx.toPx(edgeX, edgeY, 1.1).x + (ctx.mobile ? 14 : 30);
  const flip = labelX > ctx.width - (ctx.mobile ? 130 : 290);
  if (flip) labelX = Math.min(...placed.map(d => d.px.x)) - (ctx.mobile ? 14 : 30);
  const gap = ctx.mobile ? 26 : 34;
  const ys = placed.map(d => d.px.y);
  for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + gap);
  placed.forEach((d, i) => {
    svg += `<line x1="${d.px.x}" y1="${d.px.y}" x2="${labelX}" y2="${ys[i]}" class="leader"/>`;
    html += `<div class="spot is-on" style="left:${d.px.x}px;top:${d.px.y}px"></div>`;
    const pos = flip ? `right:${ctx.width - labelX}px` : `left:${labelX}px`;
    html += `<div class="spot-label is-on" style="${pos};top:${ys[i]}px">${ctx.mobile ? d.label.split(":")[0] : d.label}</div>`;
  });
  return { svg, html };
}

const EXTRA_POS = {
  vol: D => ({ touchbediening: [KX - 0.03, D.yf + 0.006, Z0 + D.h - 0.065], wifi: [KX + 0.085, D.yf + 0.006, Z0 + D.h - 0.068], antikalk: [D.x1, KYB - 0.2, Z0 + 0.25], thee: [KX + 0.015, D.yf - 0.005, Z0 + 0.16] }),
  half: D => ({ touchbediening: [KX - 0.075, D.yf - 0.006, Z0 + D.h - 0.075], wifi: [KX + 0.075, D.yf - 0.006, Z0 + D.h - 0.075], antikalk: [KX, KYB - 0.05, Z0 + D.h + 0.01], thee: [D.x1 - 0.01, D.yf - 0.03, Z0 + 0.14] }),
  caps: D => ({ touchbediening: [KX - 0.03, KYB - 0.04, Z0 + D.h + 0.004], wifi: [KX + 0.03, KYB - 0.04, Z0 + D.h + 0.004], antikalk: [KX, KYB - 0.04, Z0 + 0.12], thee: [KX, D.yf + 0.03, Z0 + D.h - 0.12] }),
  filter: D => ({ touchbediening: [KX, D.yf - 0.003, Z0 + D.h - 0.065], antikalk: [D.x1, KYB - 0.06, Z0 + 0.2], thee: [KX, D.yf + 0.03, Z0 + 0.14] }),
};
// nieuwe extra's op de plekken van de oude punten
const POS_VAN = { tweekopjes: "thee", app: "wifi", dranken: "touchbediening", thermoskan: "thee", timer: "touchbediening", grind: "antikalk" };
const EXTRA_LABEL = {
  tweekopjes: "<b>Twee kopjes</b> tegelijk",
  app: "<b>App</b>: koffie kiezen en starten vanaf je telefoon",
  dranken: `<b>Veel koffiesoorten</b>: ${VEEL_DRANKEN}+ op één knop`,
  thermoskan: "<b>Thermoskan</b>: blijft uren warm",
  timer: "<b>Timer</b>: koffie klaar als je opstaat",
  grind: "<b>Bonenmaler</b>: vers gemalen per kan",
};

function overlays(ctx) {
  const { st } = ctx, D = dims(st), id = qId(st);
  if (id === "type" && st.type) {
    const t = { volautomaat: "<b>Volautomaat</b> <span class=\"muted\">bonen, alles op 1 knop</span>", halfautomaat: "<b>Halfautomaat</b> <span class=\"muted\">zelf espresso zetten</span>", capsules: "<b>Capsules of pads</b> <span class=\"muted\">snel en makkelijk</span>", filter: "<b>Filterkoffie</b> <span class=\"muted\">een hele kan tegelijk</span>" }[st.type];
    return { svg: "", html: tag(above(ctx, st), t) };
  }
  if (id === "kopjes" && st.kopjes) return { svg: "", html: tag(above(ctx, st), st.kopjes === "groot" ? `<b>Kan van ${KOPJES_MIN.groot}+ kopjes</b>` : "<b>Een gewone kan</b> <span class=\"muted\">rond 10 kopjes</span>") };
  if (id === "systeem" && st.systeem) return { svg: "", html: tag(above(ctx, st), st.systeem === "maakt-niet-uit" ? "<b>Elk systeem</b>" : `<b>${SYSTEEM_LABEL[st.systeem]}</b>`) };
  if (id === "molen" && st.molen) return { svg: "", html: tag(above(ctx, st), { ja: "<b>Met bonenmaler</b> <span class=\"muted\">vers gemalen per kopje</span>", nee: "<b>Gemalen koffie</b> <span class=\"muted\">geen molen</span>", "maakt-niet-uit": "<b>Met of zonder molen</b>" }[st.molen]) };
  if (id === "melk" && st.melk) {
    const t = { auto: "<b>Cappuccino op één knop</b> <span class=\"muted\">melk uit een karaf</span>", stoom: "<b>Zelf opschuimen</b> <span class=\"muted\">met een stoompijpje</span>", geen: "<b>Zwarte koffie</b> <span class=\"muted\">geen melksysteem nodig</span>", ja: "<b>Ook cappuccino</b> <span class=\"muted\">met melk</span>", "maakt-niet-uit": "<b>Zwarte koffie</b> <span class=\"muted\">geen melksysteem nodig</span>" }[st.melk];
    return { svg: "", html: tag(above(ctx, st), t) };
  }
  if (id === "extra") {
    const pos = EXTRA_POS[kind(st)](D);
    const pts = st.extra.filter(e => pos[POS_VAN[e]]).map(e => ({ w: pos[POS_VAN[e]], label: EXTRA_LABEL[e] }));
    return spots(ctx, pts, D.x1 + 0.1, D.yf);
  }
  return {};
}

// display op de volautomaat en het filterapparaat
let disp;
function setup(scene) {
  disp = document.createElement("div");
  disp.className = "wdisp";
  scene.querySelector(".layers").after(disp);
}
function afterRender(ctx) {
  const st = ctx.st, D = dims(st), k = kind(st);
  disp.style.opacity = k === "vol" || k === "filter" ? "1" : "0";
  let c, txt;
  if (k === "vol") {
    const y = D.yf + 0.0064, z0 = Z0 + D.h - 0.095, z1 = Z0 + D.h - 0.035;
    c = [[KX - 0.06, y, z1], [KX + 0.06, y, z1], [KX + 0.06, y, z0], [KX - 0.06, y, z0]];
    txt = { auto: "Latte", stoom: "Espresso" }[st.melk] ?? "Koffie";
  } else {
    const y = D.yf - 0.0027, z0 = Z0 + D.h - 0.085, z1 = Z0 + D.h - 0.045;
    c = [[KX - 0.045, y, z1], [KX + 0.045, y, z1], [KX + 0.045, y, z0], [KX - 0.045, y, z0]];
    txt = "07:30";
  }
  const html = `<span class="big prog">${txt}</span>`;
  if (disp.innerHTML !== html) disp.innerHTML = html;
  placeQuad(disp, k === "vol" ? 240 : 270, 120, c.map(p => ctx.toPx(...p)));
}

const quiz = createQuiz3D({
  camera,
  steps: st => questions(st).length,
  state: { type: null, systeem: null, melk: null, molen: null, kopjes: null, budget: null, extra: [] },
  imgPath: n => `koffiemachine/vragen/img/${n}.webp`,
  question: st => metBeschikbaarheid(st, questions(st)[st.q]),
  setup, afterRender, overlays,

  images(st) {
    const k = kind(st), id = qId(st);
    let m = k;
    const melk = { auto: "-auto", stoom: "-stoom", ja: "-auto" }[st.melk];
    if (k !== "filter" && melk && (id === "melk" || id === "budget" || id === "extra")) m += melk;
    const list = ["keuken", m];
    if (st.kopjes && (id === "kopjes" || id === "budget" || id === "extra")) list.push(`kopjes-${st.kopjes === "groot" ? "groot" : "gemiddeld"}`);
    return list;
  },

  onAnswer(st, id) {
    // ander type: de vragen erna zijn anders
    if (id === "type") { st.systeem = null; st.melk = null; st.molen = null; st.kopjes = null; st.budget = null; st.extra = []; }
  },

  focus: st => {
    const id = qId(st);
    if (id === "kopjes") return { x: -0.82, y: -0.4, z: 1.05, zoom: 1.35 };
    if (id === "extra") return { x: KX, y: -0.3, z: 1.1, zoom: 1.55, anchorX: 0.36 };
    return { x: KX + (id === "melk" ? 0.05 : 0), y: -0.3, z: 1.1, zoom: 1.5 };
  },
  focusDesktop: st => {
    const id = qId(st);
    if (id === "kopjes") return { x: -0.82, y: -0.4, z: 1.08, zoom: 1.35, anchorX: 0.62 };
    if (id === "extra") return { x: KX, y: -0.3, z: 1.1, zoom: 1.45, anchorX: 0.5 };
    return { x: KX + (id === "melk" ? 0.05 : 0), y: -0.3, z: 1.1, zoom: 1.45, anchorX: 0.64 };
  },

  hideCaption: (st, mobile) => !mobile && qId(st) === "extra" && st.extra.some(e => e !== "geen"),

  caption(st) {
    switch (qId(st)) {
      case "type": return {
        volautomaat: ["Volautomaat", "Bonen erin, één druk op de knop: de machine maalt en zet zelf."],
        halfautomaat: ["Halfautomaat", "Je zet de espresso zelf met een portafilter; meer controle, meer handigheid."],
        capsules: ["Capsules of pads", "Snel en makkelijk: capsule erin, hendel dicht, klaar."],
        filter: ["Filterkoffie", "Een hele kan tegelijk, eenvoudig en voordelig."],
      }[st.type] ?? ["Jouw keuken", "Kies wat voor koffiemachine je zoekt; de machine wisselt mee."];
      case "systeem": return st.systeem ? [st.systeem === "maakt-niet-uit" ? "Elk systeem" : SYSTEEM_LABEL[st.systeem], {
        nespresso: "Veel merken cups, ook in de supermarkt.", vertuo: "Cups alleen bij Nespresso; ook grote mokken met crema.",
        dolcegusto: "Ook cappuccino en chocomel met melkcapsules.", senseo: "Pads zijn het goedkoopst per kopje.",
        lor: "L'OR-cups én gewone Nespresso-cups.", "maakt-niet-uit": "We kijken naar alle capsule- en padmachines.",
      }[st.systeem]] : ["Capsules of pads", "Kies welk systeem je wilt gebruiken."];
      case "molen": return { ja: ["Met bonenmaler", "Vers gemalen voor elk kopje, zonder losse molen."], nee: ["Gemalen koffie", "Zonder bonenmaler: een stuk goedkoper."], "maakt-niet-uit": ["Maakt niet uit", "We kijken naar machines met en zonder molen."] }[st.molen] ?? ["Bonenmaler", "Kies of de machine zelf de bonen moet malen."];
      case "kopjes": return st.kopjes ? ["Kopjes per kan", st.kopjes === "groot" ? `Een kan van ${KOPJES_MIN.groot} kopjes of meer.` : "Een gewone kan van rond de 10 kopjes is genoeg."] : ["Hoeveelheid", "Kies hoeveel koffie je per keer zet."];
      case "melk": return {
        auto: ["Cappuccino op één knop", "De machine zuigt de melk zelf op en schuimt hem op."],
        stoom: ["Zelf opschuimen", "Met een stoompijpje schuim je de melk zelf op."],
        geen: ["Zwarte koffie", "Een melksysteem is dan niet nodig."],
        ja: ["Ook cappuccino", "Met een melkopschuimer of melkcapsules."],
        "maakt-niet-uit": ["Zwarte koffie", "Een melksysteem is dan niet nodig."],
      }[st.melk] ?? ["Melk", "Kies of je ook cappuccino of latte wilt maken."];
      case "budget": return budgetCaption(st);
      default: return st.extra.includes("geen") ? ["Geen extra wensen", "We kijken dan naar je eerdere keuzes en de prijs."] : ["Extra's", "Vink aan wat je belangrijk vindt; het verschijnt op de machine."];
    }
  },

  onBack(st) { if (st.q === 0) { st.systeem = null; st.melk = null; st.molen = null; st.kopjes = null; } },

  onNext(st, id) { meetStap(st, id); },

  async finish(st) {
    meetStap(st, qId(st));
    const ids = questions(st).map(q => q.id);
    const answers = {
      type: st.type ?? "",
      systeem: ids.includes("systeem") ? st.systeem ?? "" : "",
      melk: ids.includes("melk") ? st.melk ?? "" : "",
      molen: ids.includes("molen") ? st.molen ?? "" : "",
      kopjes: ids.includes("kopjes") ? st.kopjes ?? "" : "",
      budget: capVan(st.budget),
      extraAnswers: ids.includes("extra") ? st.extra : [],
    };
    const machines = normalizeProducts(await productenOfFout());
    // Beste match binnen het budget; past er niets binnen, dan zonder grens.
    let result = matchKoffiemachines(machines, answers);
    if (answers.budget && !result.bestMatch) result = matchKoffiemachines(machines, answers, null);
    localStorage.setItem("koffiemachine_bestMatch", JSON.stringify(result.bestMatch));
    localStorage.setItem("koffiemachine_bestType", result.bestType ?? "");
    localStorage.setItem("koffiemachine_filteredMatchedKoffiemachines", JSON.stringify(result.filteredMatchedKoffiemachines));
    localStorage.setItem("koffiemachine_answers", JSON.stringify(answers));
    window.location.href = "koffiemachine/resultaat/";
  },

  preload: ["vol", "half", "caps", "filter", "kopjes-gemiddeld", "kopjes-groot", "vol-auto", "vol-stoom", "caps-auto"],
});

// Meting: waar haken mensen af, en wat kiezen ze (o.a. de budgetvraag)
function meetStap(st, id) {
  const v = st[id];
  window.phTrackEvent?.("quiz_stap", {
    categorie: "koffiemachine", stap: id, nr: questions(st).findIndex(q => q.id === id) + 1,
    antwoord: Array.isArray(v) ? [...v].sort().join("+") : String(v ?? ""),
  });
}

// Grijze opties en live tellingen zodra de catalogus binnen is
productsPromise.then(raw => {
  if (!raw?.length) return;
  catalogus = normalizeProducts(raw);
  quiz.renderQuestion();
  quiz.render();
});
