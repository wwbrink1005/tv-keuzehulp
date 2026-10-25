// Testversie van de vaatwasser-vragenpagina in de 3D-keuken (dezelfde keuken als de
// koelkast-test). Basisrender = de keuken met een lege nis rechts in het keukenblok;
// de vaatwasser (inbouw achter een keukenfront of vrijstaand naast de koelkast; dicht,
// op een kier of open met vaat) en het losse kastje zijn transparante lagen
// (render/scene.py). Display, energielabel en labels tekent de pagina zelf.
// Motor: shared/quiz3d.js.
import { createQuiz3D, makeCamera, placeQuad } from "../../shared/quiz3d.js";
import { matchVaatwassers, poolVoor, heeftWens } from "../js/matching.js";
import { normalizeProducts, parsePrice } from "../js/utils.js";
import { fetchProducts } from "../js/supabase.js";
import { budgetCaps, RUIM_COUVERTS } from "../js/data.js";

const camera = makeCamera({ camY: -3.6, camZ: 1.35, shiftX: -0.15, shiftY: -0.18 });
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

// geometrie (m) zoals in render/scene.py: deur scharniert onderaan (z = 0.1) en klapt naar voren
const HZ = 0.1, DOOR_H = 0.73;
const GEO = {
  ib: { x0: -0.895, x1: -0.305, yf: -0.6, hy: -0.62, top: 0.865 },
  vs: { x0: 0.39, x1: 0.99, yf: -0.64, hy: -0.685, top: 0.84 },
};
const kindOf = st => (st.plaatsing === "vrijstaand" ? "vs" : "ib");
const g = st => GEO[kindOf(st)];
const cx = st => (g(st).x0 + g(st).x1) / 2;
// punt van de deur (gesloten stand) kantelen om het scharnier onderaan
function door(st, [x, y, z], deg) {
  const a = deg * Math.PI / 180, dy = y - g(st).hy, dz = z - HZ;
  return [x, g(st).hy + dy * Math.cos(a) - dz * Math.sin(a), HZ + dy * Math.sin(a) + dz * Math.cos(a)];
}
// display: inbouw op de bovenrand van de deur (bij een kier), vrijstaand in de voorkant
function dispCorners(st) {
  const G = g(st);
  if (kindOf(st) === "vs") { const y = G.yf - 0.0495; return [[0.63, y, 0.8], [0.77, y, 0.8], [0.77, y, 0.76], [0.63, y, 0.76]]; }
  const z = 0.8625, xa = G.x0 + 0.24, xb = G.x1 - 0.22, yb = -0.58, yv = -0.608;
  return [[xa, yb, z], [xb, yb, z], [xb, yv, z], [xa, yv, z]].map(p => door(st, p, 14));
}

// Sinds okt. 2026: de maat (45 of 60 cm, standaard- of hoge nis) en het budget
// i.p.v. personen, geluid, energie en afwasprogramma's; stil en zuinig zijn
// nu extra's (zie docs/vaatwasser-keuzehulp-werking.md).
const euro = n => "€" + Math.round(n).toLocaleString("nl-NL");
const Q_PLAATSING = {
  id: "plaatsing", type: "radio",
  title: "Wat voor vaatwasser zoek je?",
  sub: "De vaatwasser in de keuken wisselt mee.",
  why: "Een inbouwvaatwasser verdwijnt achter een keukenkastje en past in de nis van je keuken (vaak al aanwezig na een verbouwing of bij een bestaande keukeninrichting). Een vrijstaande vaatwasser heeft een eigen afwerkte behuizing en kan overal in de keuken staan, ook zonder passende nis.",
  options: [{ v: "inbouw", label: "Inbouw, past in mijn keukennis", price: "€€" }, { v: "vrijstaand", label: "Vrijstaand, overal te plaatsen", price: "€" }],
};
const Q_MAAT_INBOUW = {
  id: "maat", type: "radio",
  title: "Hoe groot is de nis?",
  sub: "Meet de breedte en de hoogte van de opening onder het aanrecht.",
  why: "De meeste nissen zijn 60 cm breed en 82 cm hoog. In een hoge nis (87 cm) past ook een XXL-vaatwasser met meer ruimte voor hoge borden; een gewone past daar ook, met een hogere plint. Een smalle nis van 45 cm vraagt een smalle vaatwasser met 9 à 10 couverts, genoeg voor 1 of 2 personen.",
  options: [
    { v: "standaard", label: "60 cm breed, standaardhoogte (82 cm)", price: "€€" },
    { v: "hoog", label: "60 cm breed, hoge nis (87 cm)", price: "€€€" },
    { v: "smal", label: "45 cm breed (smal)", price: "€€" },
    { v: "", label: "Weet ik nog niet", price: "€" },
  ],
};
const Q_MAAT_VRIJ = {
  id: "maat", type: "radio",
  title: "Hoe breed mag hij zijn?",
  sub: "Zie hoeveel vaat er in past.",
  why: "Een gewone vaatwasser is 60 cm breed en heeft 12 tot 16 couverts. Een smalle van 45 cm heeft 9 à 10 couverts: genoeg voor 1 of 2 personen, en hij past in een kleinere keuken.",
  options: [
    { v: "breed", label: "60 cm, voor een gezin", price: "€€" },
    { v: "smal", label: "45 cm smal, voor 1-2 personen", price: "€" },
    { v: "", label: "Maakt niet uit", price: "€" },
  ],
};
const budgetVraag = st => ({
  id: "budget", type: "radio",
  title: "Wat wil je maximaal uitgeven?",
  sub: "Je krijgt de beste vaatwasser binnen je budget.",
  why: "Met je budget zoeken we de beste vaatwasser die je ook echt wilt kopen. Past een vaatwasser die nog beter bij je wensen past net niet binnen je bedrag, dan laten we dat op de resultaatpagina zien.",
  options: [...(budgetCaps[st.plaatsing] ?? budgetCaps.inbouw).map(c => ({ v: String(c), label: `Tot ${euro(c)}` })), { v: "geen", label: "Geen voorkeur" }],
});
const Q_EXTRA = {
  id: "extra", type: "check", exclusive: "geen",
  title: "Wat is nog meer belangrijk voor jou?",
  sub: "Je keuzes verschijnen op de vaatwasser.",
  why: `Bij stil en zuinig komen de stilste en zuinigste van dit type bovenaan. Droogt beter: de deur gaat aan het eind vanzelf op een kier, zodat ook plastic droog uit de machine komt. Een besteklade bovenin maakt ruimte in de onderkorf en houdt bestek apart. Met ${RUIM_COUVERTS} couverts of meer past de afwas van een groot gezin in één keer. Eco, intensief en snel heeft elke vaatwasser; kinderslot, wifi en AquaStop vind je als filter op de resultaatpagina.`,
  options: [
    { v: "stil", label: "Stiller dan de meeste", price: "€€" },
    { v: "energiezuinig", label: "Zo zuinig mogelijk", price: "€€" },
    { v: "droog", label: "Droogt beter: deur gaat vanzelf open", price: "€€" },
    { v: "besteklade", label: "Besteklade bovenin", price: "€€" },
    { v: "ruim", label: `Extra veel ruimte (${RUIM_COUVERTS}+ couverts)`, price: "€€€", when: st => st.maat !== "smal" },
    { v: "geen", label: "Geen extra wensen", price: "€" },
  ],
};
const vragen = st => [Q_PLAATSING, st.plaatsing === "vrijstaand" ? Q_MAAT_VRIJ : Q_MAAT_INBOUW, budgetVraag(st), Q_EXTRA];
const QID = st => vragen(st)[st.q]?.id;

// ───────── live catalogus: budgettelling en grijze opties ─────────
let catalogus = null;
const capVan = v => (v && v !== "geen" ? Number(v) : null);
const zichtbaarIn = st => poolVoor(catalogus ?? [], { plaatsing: st.plaatsing, maat: st.maat })
  .filter(v => (v.aanbieders ?? []).length >= 2);
const welke = st => (st.maat === "smal" ? "smalle " : "") + (st.plaatsing === "vrijstaand" ? "vrijstaande vaatwassers" : "inbouwvaatwassers");
function budgetCaption(st) {
  const cap = capVan(st.budget);
  if (!st.budget) return ["Jouw budget", "Kies wat je maximaal wilt uitgeven. Je krijgt de beste vaatwasser binnen dat bedrag, en op de resultaatpagina zie je wat meer budget oplevert."];
  if (!catalogus) return [cap ? `Tot ${euro(cap)}` : "Geen voorkeur", cap ? "We zoeken de beste vaatwasser binnen dit bedrag." : "We kiezen puur op je wensen."];
  const prijzen = zichtbaarIn(st).map(v => parsePrice(v.prijs));
  if (!prijzen.length) return [cap ? `Tot ${euro(cap)}` : "Geen voorkeur", "We zoeken de beste vaatwasser die bij je keuzes past."];
  const binnen = cap ? prijzen.filter(x => x <= cap) : prijzen;
  if (!cap) return ["Geen voorkeur", `Alle ${prijzen.length} ${welke(st)} doen mee, van ${euro(Math.min(...prijzen))} tot ${euro(Math.max(...prijzen))}.`];
  if (!binnen.length) return [`Tot ${euro(cap)}`, `Geen ${welke(st)} tot ${euro(cap)}; de goedkoopste kost ${euro(Math.min(...prijzen))}. We tonen dan de best passende.`];
  return [`Tot ${euro(cap)}`, `${binnen.length} van de ${prijzen.length} ${welke(st)} ${binnen.length === 1 ? "kost" : "kosten"} ${euro(cap)} of minder, vanaf ${euro(Math.min(...binnen))}.`];
}
// Grijs als geen vaatwasser bij 2+ winkels binnen plaatsing, maat en budget
// het zeker heeft, samen met de andere aangevinkte wensen.
const EIS = { extra: Object.fromEntries(["droog", "besteklade", "ruim"].map(w => [w, v => heeftWens(v, w) === true])) };
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
    if (!alle.some(eis)) return { ...o, disabled: true, note: `Geen van deze ${welke(st)} heeft dat.` };
    const erboven = alle.filter(v => eis(v) && andere.every(f => f(v))).map(v => parsePrice(v.prijs));
    const note = cap && erboven.length ? (andere.length && binnen.some(eis) ? `Samen met je andere keuzes pas vanaf ${euro(Math.min(...erboven))}.` : `Niet tot ${euro(cap)}; wel vanaf ${euro(Math.min(...erboven))}.`)
      : "Niet in combinatie met je andere keuzes.";
    return { ...o, disabled: true, note };
  }) };
}
const WENS_NAAM = { droog: "een deur die vanzelf opengaat", besteklade: "een besteklade", ruim: `${RUIM_COUVERTS}+ couverts` };
function extraCaption(st) {
  const wensen = st.extra.filter(e => EIS.extra[e]);
  if (!st.extra.some(e => e !== "geen")) return st.extra.length ? ["Geen extra wensen", "We kijken dan naar plaatsing, maat en prijs."] : ["Extra's", "Vink aan wat je belangrijk vindt; het verschijnt op de vaatwasser."];
  if (!catalogus || !wensen.length) return ["Jouw extra's", "De gemarkeerde punten laten zien waar je keuzes zitten."];
  const cap = capVan(st.budget);
  const l = zichtbaarIn(st).filter(v => !cap || parsePrice(v.prijs) <= cap);
  const n = l.filter(v => wensen.every(w => EIS.extra[w](v))).length;
  return ["Jouw extra's", `${n} van de ${l.length} ${welke(st)}${cap ? " binnen je budget" : ""} ${n === 1 ? "heeft" : "hebben"} zeker ${wensen.length > 1 ? "alles wat je koos" : WENS_NAAM[wensen[0]]}.`];
}

// ───────── display (alleen vrijstaand, in de voorkant) ─────────
const dispHTML = () => `<span class="big prog">Eco 50°</span>`;

// ───────── overlays ─────────
// label boven het apparaat; nooit tegen de bovenrand van het beeld (op mobiel staat het apparaat hoog)
const tag = (p, html) => `<div class="tag is-on" style="left:${p.x}px;top:${Math.max(p.y, 56)}px">${html}</div>`;

function spots(ctx, pts, edgeX, edgeY) {
  let svg = "", html = "";
  if (!pts.length) return { svg, html };
  const placed = pts.map(p => ({ ...p, px: ctx.toPx(...p.w) })).sort((a, b) => a.px.y - b.px.y);
  let labelX = ctx.toPx(edgeX, edgeY, 0.5).x + (ctx.mobile ? 14 : 30);
  const flip = labelX > ctx.width - (ctx.mobile ? 130 : 290);
  if (flip) labelX = Math.min(...placed.map(d => d.px.x)) - (ctx.mobile ? 14 : 30);
  const gap = ctx.mobile ? 26 : 34;
  const ys = placed.map(d => d.px.y);
  for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + gap);
  const over = ys[ys.length - 1] - (ctx.height - 20);
  if (over > 0) for (let i = 0; i < ys.length; i++) ys[i] -= over;
  for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] - gap);
  placed.forEach((d, i) => {
    svg += `<line x1="${d.px.x}" y1="${d.px.y}" x2="${labelX}" y2="${ys[i]}" class="leader"/>`;
    html += `<div class="spot is-on" style="left:${d.px.x}px;top:${d.px.y}px"></div>`;
    const pos = flip ? `right:${ctx.width - labelX}px` : `left:${labelX}px`;
    html += `<div class="spot-label is-on" style="${pos};top:${ys[i]}px">${ctx.mobile ? d.label.split(":")[0] : d.label}</div>`;
  });
  return { svg, html };
}

function plaatsView(ctx, st) {
  if (!st.plaatsing) return {};
  const t = ctx.toPx(cx(st), g(st).yf, 1.02);
  return { svg: "", html: tag(t, kindOf(st) === "ib" ? "<b>Inbouw</b> <span class=\"muted\">achter een keukenfront</span>" : "<b>Vrijstaand</b> <span class=\"muted\">eigen behuizing en bovenblad</span>") };
}

// maat: de open vaatwasser vult zich mee (45 cm = kleine render, XXL = grote)
const MAAT_TAG = {
  standaard: "<b>60 × 82 cm</b> <span class=\"muted\">de gangbare nis, 12-16 couverts</span>",
  hoog: "<b>60 × 87 cm</b> <span class=\"muted\">ook XXL: meer ruimte voor hoge borden</span>",
  breed: "<b>60 cm breed</b> <span class=\"muted\">12-16 couverts</span>",
  smal: "<b>45 cm breed</b> <span class=\"muted\">9-10 couverts</span>",
};
function maatView(ctx, st) {
  if (!MAAT_TAG[st.maat]) return {};
  const t = ctx.toPx(cx(st), g(st).yf, 1.02);
  return { svg: "", html: tag(t, MAAT_TAG[st.maat]) };
}

function extraSpots(ctx, st) {
  const e = st.extra, G = g(st), c = cx(st), kind = kindOf(st);
  const open90 = p => door(st, p, 90);
  const pts = [];
  // bediening: inbouw op de bovenrand van de (open) deur, vrijstaand in de voorkant
  const panel = kind === "ib" ? open90([G.x0 + 0.08, -0.6, 0.862]) : [G.x0 + 0.1, G.yf - 0.05, 0.78];
  const panel2 = kind === "ib" ? open90([G.x1 - 0.05, -0.6, 0.862]) : [G.x0 + 0.7 - 0.25, G.yf - 0.05, 0.78];
  if (e.includes("droog")) pts.push({ w: panel, label: "<b>Droogt beter</b>: deur gaat vanzelf op een kier" });
  if (e.includes("energiezuinig")) pts.push({ w: panel2, label: "<b>Zuinig</b>: een van de zuinigste van dit type" });
  if (e.includes("besteklade")) pts.push({ w: [G.x1 - 0.03, G.yf - 0.1, 0.66], label: "<b>Besteklade</b> bovenin" });
  if (e.includes("ruim")) pts.push({ w: [c + 0.05, G.yf - 0.05, 0.5], label: `<b>${RUIM_COUVERTS}+ couverts</b>: ruimte voor een groot gezin` });
  if (e.includes("stil")) pts.push({ w: [c, -0.32, 0.12], label: "<b>Stil</b>: stiller dan de meeste" });
  return spots(ctx, pts, G.x1 + 0.02, G.yf);
}

let disp, quiz;
function setup(scene) {
  disp = document.createElement("div");
  disp.className = "wdisp";
  scene.querySelector(".layers").after(disp);
}

function afterRender(ctx) {
  const st = ctx.st, html = dispHTML(st);
  if (disp.innerHTML !== html) disp.innerHTML = html;
  // het display zit alleen bij vrijstaand in de voorkant, en is te zien als de deur dicht is
  const show = kindOf(st) === "vs" && !deurOpen(st);
  disp.style.opacity = show ? "1" : "0";
  placeQuad(disp, 300, kindOf(st) === "vs" ? 86 : 65, dispCorners(st).map(p => ctx.toPx(...p)));
}

const deurOpen = st => ["maat", "extra"].includes(QID(st));
const MAAT_RENDER = { smal: "klein", hoog: "groot" };
const FOCUS = { plaatsing: 0, maat: 1, budget: 2, extra: 4 };

quiz = createQuiz3D({
  camera,
  steps: st => vragen(st).length,
  state: { plaatsing: null, maat: null, budget: null, extra: [] },
  imgPath: n => `vaatwasser/vragen/img/${n}.webp`,
  question: st => metBeschikbaarheid(st, vragen(st)[st.q]),
  setup, afterRender,

  images(st) {
    const k = kindOf(st), size = MAAT_RENDER[st.maat] ?? "gemiddeld";
    const state = deurOpen(st) ? `open-${size}` : "dicht";
    // bij vrijstaand zit er gewoon een keukenkastje in de nis
    return ["keuken", ...(k === "vs" ? ["kast"] : []), `${k}-${state}`];
  },

  focus: st => {
    const c = cx(st);
    return [
      { x: c, y: -0.6, z: 0.5, zoom: 1.3 },
      { x: c, y: -0.9, z: 0.35, zoom: 1.35 },
      { x: c, y: -0.6, z: 0.5, zoom: 1.35 },
      { x: c, y: -0.6, z: 0.5, zoom: 1.2, anchorX: kindOf(st) === "vs" ? 0.65 : 0.35 },
      { x: c, y: -0.9, z: 0.35, zoom: 1.35, anchorX: 0.32 },
    ][FOCUS[QID(st)] ?? 0];
  },
  focusDesktop: st => {
    const c = cx(st), vs = kindOf(st) === "vs";
    return [
      { x: c, y: -0.6, z: 0.6, zoom: 1.15, anchorX: 0.64 },
      { x: c, y: -0.9, z: 0.45, zoom: 1.3, anchorX: 0.64 },
      { x: c, y: -0.6, z: 0.55, zoom: 1.25, anchorX: 0.64 },
      { x: c, y: -0.6, z: 0.55, zoom: 1.25, anchorX: vs ? 0.72 : 0.56 },
      { x: c, y: -0.9, z: 0.45, zoom: 1.3, anchorX: vs ? 0.7 : 0.55 },
    ][FOCUS[QID(st)] ?? 0];
  },

  overlays(ctx) {
    const { st } = ctx;
    switch (QID(st)) {
      case "plaatsing": return plaatsView(ctx, st);
      case "maat": return maatView(ctx, st);
      case "extra": return extraSpots(ctx, st);
      default: return {};
    }
  },

  hideCaption: (st, mobile) => !mobile && QID(st) === "extra" && st.extra.some(e => e !== "geen") && !st.extra.some(e => EIS.extra[e]),

  caption(st) {
    switch (QID(st)) {
      case "plaatsing": return {
        inbouw: ["Inbouw", "Verdwijnt achter een keukenfront in de nis van je keuken."],
        vrijstaand: ["Vrijstaand", "Een eigen behuizing en bovenblad: kan overal staan, ook zonder nis."],
      }[st.plaatsing] ?? ["Jouw keuken", "Kies wat voor vaatwasser je zoekt; de keuken wisselt mee."];
      case "maat": return {
        standaard: ["Standaardnis", "60 cm breed en 82 cm hoog: de meeste nissen. XXL-modellen passen hier niet."],
        hoog: ["Hoge nis", "Hier past ook een XXL-vaatwasser, met meer ruimte voor hoge borden."],
        breed: ["60 cm breed", "De gewone maat: 12 tot 16 couverts."],
        smal: ["45 cm smal", "9 à 10 couverts: genoeg voor 1 of 2 personen."],
        "": [st.plaatsing === "vrijstaand" ? "Maakt niet uit" : "Maat onbekend", "We kijken naar alle maten; de beste prijs telt mee."],
      }[st.maat] ?? ["Maat", st.plaatsing === "vrijstaand" ? "Kies hoe breed hij mag zijn." : "Kies de maat van je nis."];
      case "budget": return budgetCaption(st);
      default: return extraCaption(st);
    }
  },

  // Terug naar vraag 1: plaatsing kan veranderen, en daarmee de maten en bedragen.
  onBack(st) { if (st.q === 0) { st.maat = null; st.budget = null; } },

  onNext(st, id) { meetStap(st, id); },

  async finish(st) {
    meetStap(st, "extra");
    const answers = { plaatsing: st.plaatsing, maat: st.maat ?? "", budget: capVan(st.budget), extraAnswers: st.extra.filter(e => e !== "ruim" || st.maat !== "smal") };
    const vaatwassers = normalizeProducts(await productenOfFout());
    // Beste match binnen het budget; past er niets binnen, dan zonder grens.
    let result = matchVaatwassers(vaatwassers, answers);
    if (answers.budget && !result.bestMatch) result = matchVaatwassers(vaatwassers, answers, null);
    localStorage.setItem("vaatwasser_bestMatch", JSON.stringify(result.bestMatch));
    localStorage.setItem("vaatwasser_bestType", result.bestType ?? "");
    localStorage.setItem("vaatwasser_filteredMatchedVaatwassers", JSON.stringify(result.filteredMatchedVaatwassers));
    localStorage.setItem("vaatwasser_answers", JSON.stringify(answers));
    localStorage.setItem("vaatwasser_selectedPlaatsing", st.plaatsing ?? "");
    window.location.href = "vaatwasser/resultaat/";
  },

  preload: ["ib-dicht", "ib-open-gemiddeld", "kast", "vs-dicht", "ib-open-klein", "ib-open-groot", "vs-open-gemiddeld", "vs-open-klein", "vs-open-groot"],
});

// Meting: waar haken mensen af, en wat kiezen ze (o.a. de budgetvraag)
function meetStap(st, id) {
  const v = st[id];
  window.phTrackEvent?.("quiz_stap", {
    categorie: "vaatwasser", stap: id, nr: vragen(st).findIndex(q => q.id === id) + 1,
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
