// Testversie van de airfryer-vragenpagina in de 3D-keuken (dezelfde keuken als de
// koelkast- en vaatwasser-test, camera dicht op het werkblad). Basisrender = de keuken;
// de airfryer (klein, gemiddeld, groot of met dubbele mand, met of zonder kijkglas) en
// het eten op de plank ervoor zijn transparante lagen (render/scene.py). Het display
// tekent de pagina zelf in perspectief. Motor: shared/quiz3d.js.
import { createQuiz3D, makeCamera, placeQuad } from "../../shared/quiz3d.js";
import { matchAirfryers, heeftWens, mandWens } from "../js/matching.js";
import { normalizeProducts, parsePrice } from "../js/utils.js";
import { fetchProducts } from "../js/supabase.js";
import { capaciteitLiterMin, budgetCaps } from "../js/data.js";

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

// geometrie (m) zoals in render/scene.py: airfryer op het werkblad (z = 0.9), plank ervoor
const Z0 = 0.9, AX = -0.66, AYB = -0.07;
const SIZES = { klein: [0.25, 0.3, 0.29], gemiddeld: [0.29, 0.35, 0.32], groot: [0.33, 0.39, 0.35], dubbel: [0.42, 0.37, 0.32] };
const sizeOf = st => (st.q >= 1 && st.dubbeleMand === "ja" ? "dubbel" : st.personen ?? "gemiddeld");
const euro = n => "€" + Math.round(n).toLocaleString("nl-NL");
const dims = st => { const [w, d, h] = SIZES[sizeOf(st)]; return { w, d, h, x0: AX - w / 2, x1: AX + w / 2, yf: AYB - d }; };
function dispCorners(st) {
  const { h, yf } = dims(st), pz0 = Z0 + h * 0.64, pz1 = Z0 + h - 0.035, zc = (pz0 + pz1) / 2, y = yf - 0.0056;
  return [[AX - 0.045, y, zc + 0.016], [AX + 0.045, y, zc + 0.016], [AX + 0.045, y, zc - 0.016], [AX - 0.045, y, zc - 0.016]];
}

const Q = [
  {
    id: "personen", type: "radio",
    title: "Voor hoeveel personen kook je meestal?",
    sub: "De airfryer op het werkblad groeit mee.",
    why: "De inhoud van de mand bepaalt hoeveel eten er in één keer in past. Kook je voor een klein huishouden, dan volstaat een kleinere, compactere airfryer. Kook je vaker voor een groter gezelschap, dan zoeken we gericht naar een model met een ruimere mand.",
    options: [{ v: "klein", label: "1-2 personen", price: "€" }, { v: "gemiddeld", label: "3-4 personen", price: "€€" }, { v: "groot", label: "5 of meer personen", price: "€€€" }],
  },
  {
    id: "dubbeleMand", type: "radio",
    title: "Wil je 2 gerechten tegelijk kunnen bereiden, los van elkaar?",
    sub: "Zie het verschil tussen 1 en 2 manden.",
    why: "Een airfryer met een dubbele mand (of 2 gestapelde lades) laat je 2 verschillende gerechten tegelijk bereiden, elk met een eigen tijd en temperatuur — handig als je bijvoorbeeld vlees en groenten apart wilt garen. Een enkele mand is compacter en vaak voordeliger.",
    options: [{ v: "ja", label: "Ja, dubbele mand", price: "€€€" }, { v: "nee", label: "Nee, 1 mand is genoeg", price: "€" }, { v: "maakt-niet-uit", label: "Maakt me niet uit", price: "€€" }],
  },
  {
    id: "budget", type: "radio",
    title: "Wat wil je maximaal uitgeven?",
    sub: "Je krijgt de beste airfryer binnen je budget.",
    why: "Met je budget zoeken we de beste airfryer die je ook echt wilt kopen. Met een dubbele mand ligt de prijs hoger, dus de bedragen passen bij je vorige keuze. Past een airfryer die nog beter bij je wensen past net niet binnen je bedrag, dan laten we dat op de resultaatpagina zien.",
    options: [],
  },
  {
    id: "extra", type: "check", exclusive: "geen",
    title: "Nog iets belangrijk?",
    sub: "Je keuzes verschijnen op de airfryer.",
    why: "Een kijkglas laat je het eten zien tijdens het bakken, zonder de mand open te trekken. Met een stoomfunctie kun je ook groente en vis stomen, en blijft vlees sappiger. Compact: de airfryer neemt zo min mogelijk ruimte in op het aanrecht. Een display, timer en vaatwasserbestendige mand heeft vrijwel elke airfryer.",
    options: [
      { v: "kijkglas", label: "Kijkglas: het eten zien tijdens het bakken", price: "€€" },
      { v: "stomen", label: "Ook stomen", price: "€€€" },
      { v: "compact", label: "Compact: weinig ruimte op het aanrecht", price: "€" },
      { v: "geen", label: "Geen extra wensen", price: "€" },
    ],
  },
];

// Sinds okt. 2026: geen gebruiksvraag meer (grillen/braden/drogen staan bij de
// helft van de airfryers niet ingevuld, terwijl vrijwel elke airfryer het kan).
const capsVoor = st => budgetCaps[st.dubbeleMand === "ja" ? "dubbel" : st.dubbeleMand === "nee" ? "enkel" : "alles"];
const vraag = st => {
  const q = Q[st.q];
  if (q.id !== "budget") return q;
  return { ...q, options: [...capsVoor(st).map(c => ({ v: String(c), label: `Tot ${euro(c)}` })), { v: "geen", label: "Geen voorkeur" }] };
};

// ───────── live catalogus: budgettelling en grijze opties ─────────
let catalogus = null;
const capVan = v => (v && v !== "geen" ? Number(v) : null);
const zichtbaarIn = st => (catalogus ?? []).filter(af => (af.aanbieders ?? []).length >= 2 && (!mandWens(st) || heeftWens(af, mandWens(st)) === true));
const welke = st => (st.dubbeleMand === "ja" ? "airfryers met een dubbele mand" : st.dubbeleMand === "nee" ? "airfryers met 1 mand" : "airfryers");
function budgetCaption(st) {
  const cap = capVan(st.budget);
  if (!st.budget) return ["Jouw budget", "Kies wat je maximaal wilt uitgeven. Je krijgt de beste airfryer binnen dat bedrag, en op de resultaatpagina zie je wat meer budget oplevert."];
  if (!catalogus) return [cap ? `Tot ${euro(cap)}` : "Geen voorkeur", cap ? "We zoeken de beste airfryer binnen dit bedrag." : "We kiezen puur op je wensen."];
  const prijzen = zichtbaarIn(st).map(af => parsePrice(af.prijs));
  if (!prijzen.length) return [cap ? `Tot ${euro(cap)}` : "Geen voorkeur", "We zoeken de beste airfryer die bij je keuzes past."];
  const binnen = cap ? prijzen.filter(x => x <= cap) : prijzen;
  if (!cap) return ["Geen voorkeur", `Alle ${prijzen.length} ${welke(st)} doen mee, van ${euro(Math.min(...prijzen))} tot ${euro(Math.max(...prijzen))}.`];
  if (!binnen.length) return [`Tot ${euro(cap)}`, `Geen ${welke(st)} tot ${euro(cap)}; de goedkoopste kost ${euro(Math.min(...prijzen))}. We tonen dan de best passende.`];
  return [`Tot ${euro(cap)}`, `${binnen.length} van de ${prijzen.length} ${welke(st)} ${binnen.length === 1 ? "kost" : "kosten"} ${euro(cap)} of minder, vanaf ${euro(Math.min(...binnen))}.`];
}
// Grijs als geen airfryer bij 2+ winkels binnen mand en budget het zeker
// heeft, samen met de andere aangevinkte wens.
const EIS = { extra: { kijkglas: af => heeftWens(af, "kijkglas") === true, stomen: af => heeftWens(af, "stomen") === true } };
function metBeschikbaarheid(st, q) {
  if (!catalogus || !EIS[q.id]) return q;
  const cap = capVan(st.budget), alle = zichtbaarIn(st);
  const binnen = cap ? alle.filter(af => parsePrice(af.prijs) <= cap) : alle;
  return { ...q, options: q.options.map(o => {
    const eis = EIS[q.id][o.v];
    if (!eis) return o;
    let andere = st.extra.filter(e => e !== o.v && EIS.extra[e]).map(e => EIS.extra[e]);
    if (!binnen.some(af => andere.every(f => f(af)))) andere = [];
    if (binnen.some(af => eis(af) && andere.every(f => f(af)))) return o;
    if (!alle.some(eis)) return { ...o, disabled: true, note: `Geen van deze ${welke(st)} heeft dat.` };
    const erboven = alle.filter(af => eis(af) && andere.every(f => f(af))).map(af => parsePrice(af.prijs));
    const note = cap && erboven.length ? (andere.length && binnen.some(eis) ? `Samen met je andere keuze pas vanaf ${euro(Math.min(...erboven))}.` : `Niet tot ${euro(cap)}; wel vanaf ${euro(Math.min(...erboven))}.`)
      : "Niet in combinatie met je andere keuzes.";
    return { ...o, disabled: true, note };
  }) };
}
function extraCaption(st) {
  const wensen = st.extra.filter(e => EIS.extra[e]);
  if (!st.extra.some(e => e !== "geen")) return st.extra.length ? ["Geen extra wensen", "We kijken dan naar inhoud, manden en prijs."] : ["Extra's", "Vink aan wat je belangrijk vindt; het verschijnt op de airfryer."];
  if (!catalogus || !wensen.length) return ["Jouw extra's", "De gemarkeerde punten laten zien waar je keuzes zitten."];
  const cap = capVan(st.budget);
  const l = zichtbaarIn(st).filter(af => !cap || parsePrice(af.prijs) <= cap);
  const n = l.filter(af => wensen.every(w => EIS.extra[w](af))).length;
  return ["Jouw extra's", `${n} van de ${l.length} ${welke(st)}${cap ? " binnen je budget" : ""} ${n === 1 ? "heeft" : "hebben"} zeker ${wensen.length > 1 ? "alles wat je koos" : wensen[0] === "kijkglas" ? "een kijkglas" : "een stoomfunctie"}.`];
}
const tag = (p, html) => `<div class="tag is-on" style="left:${p.x}px;top:${Math.max(p.y, 56)}px">${html}</div>`;
const above = (ctx, st) => ctx.toPx(AX, dims(st).yf, Z0 + dims(st).h + 0.07);

function spots(ctx, pts, edgeX, edgeY) {
  let svg = "", html = "";
  if (!pts.length) return { svg, html };
  const placed = pts.map(p => ({ ...p, px: ctx.toPx(...p.w) })).sort((a, b) => a.px.y - b.px.y);
  let labelX = ctx.toPx(edgeX, edgeY, 1).x + (ctx.mobile ? 14 : 30);
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

function overlays(ctx) {
  const { st } = ctx, D = dims(st);
  if (st.q === 0 && st.personen) {
    const min = capaciteitLiterMin[st.personen];
    return { svg: "", html: tag(above(ctx, st), min ? `<b>Minstens ${min} liter</b> <span class="muted">inhoud</span>` : "<b>Elke maat</b> <span class=\"muted\">past</span>") };
  }
  if (st.q === 1 && st.dubbeleMand) {
    const t = { ja: "<b>2 manden</b> <span class=\"muted\">elk een eigen tijd en temperatuur</span>", nee: "<b>1 mand</b> <span class=\"muted\">compacter en voordeliger</span>", "maakt-niet-uit": "<b>1 of 2 manden</b> <span class=\"muted\">allebei goed</span>" }[st.dubbeleMand];
    return { svg: "", html: tag(above(ctx, st), t) };
  }

  if (st.q === 3) {
    const e = st.extra, pts = [], c = sizeOf(st) === "dubbel" ? AX - D.w / 4 : AX;
    if (e.includes("stomen")) pts.push({ w: [AX + 0.03, D.yf - 0.006, Z0 + D.h * 0.8], label: "<b>Stomen</b>: ook groente en vis" });
    if (e.includes("kijkglas")) pts.push({ w: [c, D.yf - 0.02, Z0 + D.h * 0.43], label: "<b>Kijkglas</b>: eten zien zonder de mand open te trekken" });
    if (e.includes("compact")) pts.push({ w: [c + 0.03, D.yf - 0.07, Z0 + D.h * 0.05], label: "<b>Compact</b>: weinig ruimte op het aanrecht" });
    return spots(ctx, pts, D.x1 + 0.02, D.yf);
  }
  return {};
}

let disp;
function setup(scene) {
  disp = document.createElement("div");
  disp.className = "wdisp";
  scene.querySelector(".layers").after(disp);
}
function afterRender(ctx) {
  const html = sizeOf(ctx.st) === "dubbel" ? `<span class="big">200°<small>1</small></span><span class="big">180°<small>2</small></span>` : `<span class="big">200°<small> 15:00</small></span>`;
  if (disp.innerHTML !== html) disp.innerHTML = html;
  placeQuad(disp, 300, 106, dispCorners(ctx.st).map(p => ctx.toPx(...p)));
}

const quiz = createQuiz3D({
  camera,
  steps: 4,
  state: { personen: null, dubbeleMand: null, budget: null, extra: [] },
  imgPath: n => `airfryer/vragen/img/${n}.webp`,
  question: st => metBeschikbaarheid(st, vraag(st)),
  setup, afterRender, overlays,

  images(st) {
    const glas = st.q >= 3 && st.extra.includes("kijkglas") ? "-glas" : "";
    return ["keuken", `af-${sizeOf(st)}${glas}`];
  },

  focus: st => [
    { x: AX, y: -0.25, z: 1.05, zoom: 1.5 },
    { x: AX, y: -0.25, z: 1.05, zoom: 1.5 },
    { x: AX, y: -0.25, z: 1.05, zoom: 1.5 },
    { x: AX, y: -0.25, z: 1.05, zoom: 1.7, anchorX: 0.35 },
  ][st.q],
  focusDesktop: st => [
    { x: AX, y: -0.25, z: 1.07, zoom: 1.45, anchorX: 0.64 },
    { x: AX, y: -0.25, z: 1.07, zoom: 1.45, anchorX: 0.64 },
    { x: AX, y: -0.25, z: 1.07, zoom: 1.45, anchorX: 0.64 },
    // airfryer iets links van het midden: rechts is dan ruimte voor de (lange) labels
    { x: AX, y: -0.25, z: 1.07, zoom: 1.45, anchorX: sizeOf(st) === "dubbel" ? 0.47 : 0.5 },
  ][st.q],

  hideCaption: (st, mobile) => !mobile && st.q === 3 && st.extra.some(e => e !== "geen") && !st.extra.some(e => EIS.extra[e]),

  caption(st) {
    switch (st.q) {
      case 0: return {
        klein: ["1-2 personen", "Een compacte airfryer is dan ruim genoeg."],
        gemiddeld: ["3-4 personen", `We zoeken een mand van minstens ${capaciteitLiterMin.gemiddeld} liter.`],
        groot: ["5 of meer personen", `We zoeken een ruime mand van minstens ${capaciteitLiterMin.groot} liter.`],
      }[st.personen] ?? ["Jouw keuken", "Kies voor hoeveel personen je kookt; de airfryer groeit mee."];
      case 1: return {
        ja: ["Dubbele mand", "Twee gerechten tegelijk, elk met een eigen tijd en temperatuur."],
        nee: ["1 mand", "Compacter en vaak voordeliger."],
        "maakt-niet-uit": ["Maakt niet uit", "We houden modellen met 1 en 2 manden in beeld."],
      }[st.dubbeleMand] ?? ["Manden", "Kies of je 2 gerechten tegelijk wilt kunnen maken."];
      case 2: return budgetCaption(st);
      default: return extraCaption(st);
    }
  },

  // Terug naar vraag 2: de mandkeuze bepaalt de budgetbedragen.
  onBack(st) { if (st.q <= 1) st.budget = null; },

  onNext(st, id) { meetStap(st, id); },

  async finish(st) {
    meetStap(st, "extra");
    const answers = { personen: st.personen ?? "", dubbeleMand: st.dubbeleMand ?? "", budget: capVan(st.budget), extraAnswers: st.extra };
    const airfryers = normalizeProducts(await productenOfFout());
    // Beste match binnen het budget; past er niets binnen, dan zonder grens.
    let result = matchAirfryers(airfryers, answers);
    if (answers.budget && !result.bestMatch) result = matchAirfryers(airfryers, answers, null);
    localStorage.setItem("airfryer_bestMatch", JSON.stringify(result.bestMatch));
    localStorage.setItem("airfryer_bestType", result.bestType ?? "");
    localStorage.setItem("airfryer_filteredMatchedAirfryers", JSON.stringify(result.filteredMatchedAirfryers));
    localStorage.setItem("airfryer_answers", JSON.stringify(answers));
    window.location.href = "airfryer/resultaat/";
  },

  preload: ["af-gemiddeld", "af-klein", "af-groot", "af-dubbel", "af-gemiddeld-glas"],
});

// Meting: waar haken mensen af, en wat kiezen ze (o.a. de budgetvraag)
function meetStap(st, id) {
  const v = st[id];
  window.phTrackEvent?.("quiz_stap", {
    categorie: "airfryer", stap: id, nr: Q.findIndex(q => q.id === id) + 1,
    antwoord: Array.isArray(v) ? [...v].sort().join("+") : String(v ?? ""),
  });
}

// Grijze opties en live tellingen zodra de catalogus binnen is
productsPromise.then(raw => {
  if (!raw?.length) return;
  catalogus = normalizeProducts(raw);
  if (quiz.st.q >= 2) quiz.renderQuestion();
  quiz.render();
});
