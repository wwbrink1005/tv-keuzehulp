// Testversie van de airfryer-vragenpagina in de 3D-keuken (dezelfde keuken als de
// koelkast- en vaatwasser-test, camera dicht op het werkblad). Basisrender = de keuken;
// de airfryer (klein, gemiddeld, groot of met dubbele mand, met of zonder kijkglas) en
// het eten op de plank ervoor zijn transparante lagen (render/scene.py). Het display
// tekent de pagina zelf in perspectief. Motor: shared/quiz3d.js.
import { createQuiz3D, makeCamera, placeQuad } from "../../shared/quiz3d.js";
import { matchAirfryers } from "../js/matching.js";
import { normalizeProducts } from "../js/utils.js";
import { fetchProducts } from "../js/supabase.js";
import { capaciteitLiterMin } from "../js/data.js";

const camera = makeCamera({ camX: -0.72, camY: -1.9, camZ: 1.42, shiftX: -0.12, shiftY: -0.12 });
const productsPromise = fetchProducts().catch(() => null);

// geometrie (m) zoals in render/scene.py: airfryer op het werkblad (z = 0.9), plank ervoor
const Z0 = 0.9, AX = -0.66, AYB = -0.07;
const SIZES = { klein: [0.25, 0.3, 0.29], gemiddeld: [0.29, 0.35, 0.32], groot: [0.33, 0.39, 0.35], dubbel: [0.42, 0.37, 0.32] };
const BOARD = { x: -0.98, y: -0.43 };
const sizeOf = st => (st.q >= 1 && st.dubbeleMand === "ja" ? "dubbel" : st.personen ?? "gemiddeld");
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
    id: "gebruik", type: "radio",
    title: "Wat wil je er vooral mee doen?",
    sub: "Op de plank zie je wat je ermee maakt.",
    why: "Elke airfryer kan frituren en bakken. Wil je ook grillen en braden, dan zoeken we naar modellen met die extra functies. Wil je een echt alles-in-1-apparaat dat ook kan stomen of drogen/dehydrateren, dan zoeken we naar de meest veelzijdige modellen.",
    options: [{ v: "frituren-bakken", label: "Vooral frituren en bakken", price: "€" }, { v: "grillen-braden", label: "Ook grillen en braden", price: "€€" }, { v: "alles-in-1", label: "Ook bakken, stomen en drogen (alles-in-1)", price: "€€€" }],
  },
  {
    id: "extra", type: "check", exclusive: "geen",
    title: "Nog iets belangrijk?",
    sub: "Je keuzes verschijnen op de airfryer.",
    why: "Een kijkglas laat je het eten zien tijdens het bakken, zonder de mand open te trekken. Een ingebouwd display maakt instellen makkelijker. Vaatwasserbestendige onderdelen schelen afwas. Je kunt meerdere opties aanvinken.",
    options: [{ v: "kijkglas", label: "Kijkglas (zie je het eten tijdens het bakken)", price: "€€" }, { v: "display", label: "Ingebouwd display", price: "€€" }, { v: "vaatwasserbestendig", label: "Vaatwasserbestendige onderdelen", price: "€€" }, { v: "geen", label: "Geen voorkeur", price: "€" }],
  },
];

const ETEN = { "frituren-bakken": "friet", "grillen-braden": "grill", "alles-in-1": "alles" };
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
  if (st.q === 2 && st.gebruik) {
    const t = { "frituren-bakken": "<b>Frituren en bakken</b> <span class=\"muted\">dat kan elke airfryer</span>", "grillen-braden": "<b>Grillen en braden</b> <span class=\"muted\">met grill- of braadfunctie</span>", "alles-in-1": "<b>Alles-in-1</b> <span class=\"muted\">ook bakken, stomen en drogen</span>" }[st.gebruik];
    return { svg: "", html: tag(ctx.toPx(BOARD.x, BOARD.y, Z0 + 0.16), t) };
  }
  if (st.q === 3) {
    const e = st.extra, pts = [], c = sizeOf(st) === "dubbel" ? AX - D.w / 4 : AX;
    if (e.includes("display")) pts.push({ w: [AX + 0.03, D.yf - 0.006, Z0 + D.h * 0.8], label: "<b>Display</b>: tijd en temperatuur instellen" });
    if (e.includes("kijkglas")) pts.push({ w: [c, D.yf - 0.02, Z0 + D.h * 0.43], label: "<b>Kijkglas</b>: eten zien zonder de mand open te trekken" });
    if (e.includes("vaatwasserbestendig")) pts.push({ w: [c + 0.03, D.yf - 0.07, Z0 + D.h * 0.2], label: "<b>Vaatwasserbestendig</b>: mand en rooster mogen in de vaatwasser" });
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

createQuiz3D({
  camera,
  steps: 4,
  state: { personen: null, dubbeleMand: null, gebruik: null, extra: [] },
  imgPath: n => `airfryer/vragen/img/${n}.webp`,
  question: st => Q[st.q],
  setup, afterRender, overlays,

  images(st) {
    const glas = st.q >= 3 && st.extra.includes("kijkglas") ? "-glas" : "";
    const list = ["keuken", `af-${sizeOf(st)}${glas}`];
    if (st.q >= 2 && st.gebruik) list.push(`eten-${ETEN[st.gebruik]}`);
    return list;
  },

  focus: st => [
    { x: AX, y: -0.25, z: 1.05, zoom: 1.5 },
    { x: AX, y: -0.25, z: 1.05, zoom: 1.5 },
    { x: -0.82, y: -0.35, z: 1.0, zoom: 1.35 },
    { x: AX, y: -0.25, z: 1.05, zoom: 1.7, anchorX: 0.35 },
  ][st.q],
  focusDesktop: st => [
    { x: AX, y: -0.25, z: 1.07, zoom: 1.45, anchorX: 0.64 },
    { x: AX, y: -0.25, z: 1.07, zoom: 1.45, anchorX: 0.64 },
    { x: -0.82, y: -0.35, z: 1.03, zoom: 1.4, anchorX: 0.62 },
    // airfryer iets links van het midden: rechts is dan ruimte voor de (lange) labels
    { x: AX, y: -0.25, z: 1.07, zoom: 1.45, anchorX: sizeOf(st) === "dubbel" ? 0.47 : 0.5 },
  ][st.q],

  hideCaption: (st, mobile) => !mobile && st.q === 3 && st.extra.some(e => e !== "geen"),

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
      case 2: return {
        "frituren-bakken": ["Frituren en bakken", "Friet en snacks: dat kan elke airfryer."],
        "grillen-braden": ["Grillen en braden", "We zoeken modellen met een grill- of braadfunctie."],
        "alles-in-1": ["Alles-in-1", "We zoeken de meest veelzijdige modellen: ook bakken, stomen en drogen."],
      }[st.gebruik] ?? ["Gebruik", "Kies wat je er vooral mee wilt doen."];
      default: return st.extra.includes("geen") ? ["Geen voorkeur", "We kijken dan naar inhoud, manden en functies."] : ["Extra's", "Vink aan wat je belangrijk vindt; het verschijnt op de airfryer."];
    }
  },

  async finish(st) {
    const answers = { personen: st.personen ?? "", dubbeleMand: st.dubbeleMand ?? "", gebruik: st.gebruik ?? "", extraAnswers: st.extra };
    const raw = await productsPromise;
    const result = matchAirfryers(normalizeProducts(raw ?? []), answers);
    localStorage.setItem("airfryer_bestMatch", JSON.stringify(result.bestMatch));
    localStorage.setItem("airfryer_bestType", result.bestType ?? "");
    localStorage.setItem("airfryer_filteredMatchedAirfryers", JSON.stringify(result.filteredMatchedAirfryers));
    localStorage.setItem("airfryer_answers", JSON.stringify(answers));
    window.location.href = "airfryer/resultaat/";
  },

  preload: ["af-gemiddeld", "af-klein", "af-groot", "af-dubbel", "eten-friet", "eten-grill", "eten-alles", "af-gemiddeld-glas"],
});
