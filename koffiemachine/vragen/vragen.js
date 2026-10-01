// Testversie van de koffiemachine-vragenpagina in de 3D-keuken (zelfde werkblad als de
// airfryer-test). Basisrender = de keuken; de koffiemachine (volautomaat, halfautomaat,
// capsule of filter, met melkkaraf/opschuimer of stoompijpje) en de kopjes op het
// dienblad zijn transparante lagen (render/scene.py). Display en labels tekent de
// pagina zelf. Net als de huidige keuzehulp: bij filterkoffie vervalt de melkvraag en
// de wifi-optie. Motor: shared/quiz3d.js.
import { createQuiz3D, makeCamera, placeQuad } from "../../shared/quiz3d.js";
import { matchKoffiemachines } from "../js/matching.js";
import { normalizeProducts } from "../js/utils.js";
import { fetchProducts } from "../js/supabase.js";
import { WATERTANK_MAX } from "../js/data.js";

const camera = makeCamera({ camX: -0.72, camY: -1.9, camZ: 1.42, shiftX: -0.12, shiftY: -0.12 });
const productsPromise = fetchProducts().catch(() => null);

// geometrie (m) zoals in render/scene.py: machine op het werkblad (z = 0.9) tegen de muur
const Z0 = 0.9, KX = -0.66, KYB = -0.07;
const DIM = { vol: [0.24, 0.40, 0.37], half: [0.28, 0.30, 0.38], caps: [0.14, 0.32, 0.27], filter: [0.21, 0.26, 0.37] };
const KEY = { volautomaat: "vol", halfautomaat: "half", capsules: "caps", filter: "filter" };
const kind = st => KEY[st.type] ?? "vol";
const isFilter = st => st.type === "filter";
const dims = st => { const [w, d, h] = DIM[kind(st)]; return { w, d, h, x0: KX - w / 2, x1: KX + w / 2, yf: KYB - d }; };
const liter = v => String(v).replace(".", ",");

const Q_TYPE = {
  id: "type", type: "radio",
  title: "Wat voor koffiemachine zoek je?",
  sub: "De machine op het werkblad wisselt mee.",
  why: "Het type koffiemachine bepaalt het meest hoeveel je kwijt bent: een volautomaat (bonen, alles op 1 druk op de knop) kost gemiddeld een stuk meer dan een filterapparaat of capsulemachine. Een halfautomaat/handmatige machine geeft je zelf meer controle over je espresso, maar vraagt ook meer handigheid.",
  options: [{ v: "volautomaat", label: "Volautomaat, bonen, alles op 1 druk op de knop", price: "€€€" }, { v: "halfautomaat", label: "Halfautomaat/handmatig, zelf meer controle", price: "€€" }, { v: "capsules", label: "Capsules of pads, snel en makkelijk", price: "€" }, { v: "filter", label: "Filterkoffie, grote kan, eenvoudig", price: "€" }],
};
const Q_HOEV = {
  id: "hoeveelheid", type: "radio",
  title: "Hoeveel koffie heb je per keer nodig?",
  sub: "Het dienblad laat zien voor hoeveel mensen.",
  why: "De inhoud van het waterreservoir bepaalt hoe vaak je moet bijvullen. Voor 1-2 personen is een compact reservoir prima; voor een groot huishouden of veel bezoek is een groter reservoir handiger, zodat je niet steeds hoeft bij te vullen.",
  options: [{ v: "klein", label: "Weinig, 1-2 personen", price: "€" }, { v: "gemiddeld", label: "Gemiddeld huishouden", price: "€€" }, { v: "groot", label: "Groot huishouden of veel bezoek", price: "€€€" }],
};
const Q_MELK = {
  id: "melk", type: "radio",
  title: "Wil je ook cappuccino of latte kunnen maken?",
  sub: "Zie hoe de melk wordt opgeschuimd.",
  why: "Sommige machines schuimen melk automatisch op, andere hebben een handmatige stoompijp waarmee je het zelf doet. Wil je alleen zwarte koffie, dan hoeft je machine geen melksysteem te hebben.",
  options: [{ v: "automatisch", label: "Ja, automatisch opschuimen", price: "€€€" }, { v: "handmatig", label: "Ja, handmatig is prima", price: "€€" }, { v: "nee", label: "Nee, gewoon zwarte koffie", price: "€" }],
};
const Q_EXTRA = {
  id: "extra", type: "check", exclusive: "geen",
  title: "Nog iets belangrijk?",
  sub: "Je keuzes verschijnen op de machine.",
  why: "Touchbediening maakt bediening overzichtelijker, wifi laat je de machine op afstand bedienen via een app, automatisch ontkalken bespaart onderhoud, en niet elke machine kan ook thee zetten. Je kunt meerdere opties aanvinken.",
  options: [
    { v: "touchbediening", label: "Touchbediening", price: "€€" },
    // wifi is bij filterapparaten nooit ingevuld in de catalogus (zie koffiemachine/js/quiz.js)
    { v: "wifi", label: "Wifi/app-bediening", price: "€€", when: st => st.type !== "filter" },
    { v: "antikalk", label: "Automatisch ontkalken", price: "€€" },
    { v: "thee", label: "Kan ook thee zetten", price: "€€" },
    { v: "geen", label: "Geen extra wensen", price: "€" },
  ],
};
const questions = st => (isFilter(st) ? [Q_TYPE, Q_HOEV, Q_EXTRA] : [Q_TYPE, Q_HOEV, Q_MELK, Q_EXTRA]);
const qId = st => questions(st)[st.q].id;

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

// watertank per type, met dezelfde grenzen als de matching (WATERTANK_MAX in data.js)
function tankTekst(st) {
  const t = WATERTANK_MAX[st.type ?? "volautomaat"], h = st.hoeveelheid;
  if (h === "klein") return `<b>Watertank tot ${liter(t.klein)} l</b>`;
  if (h === "gemiddeld") return `<b>Watertank ${liter(t.klein)}-${liter(t.gemiddeld)} l</b>`;
  return `<b>Watertank groter dan ${liter(t.gemiddeld)} l</b>`;
}

const EXTRA_POS = {
  vol: D => ({ touchbediening: [KX - 0.03, D.yf + 0.006, Z0 + D.h - 0.065], wifi: [KX + 0.085, D.yf + 0.006, Z0 + D.h - 0.068], antikalk: [D.x1, KYB - 0.2, Z0 + 0.25], thee: [KX + 0.015, D.yf - 0.005, Z0 + 0.16] }),
  half: D => ({ touchbediening: [KX - 0.075, D.yf - 0.006, Z0 + D.h - 0.075], wifi: [KX + 0.075, D.yf - 0.006, Z0 + D.h - 0.075], antikalk: [KX, KYB - 0.05, Z0 + D.h + 0.01], thee: [D.x1 - 0.01, D.yf - 0.03, Z0 + 0.14] }),
  caps: D => ({ touchbediening: [KX - 0.03, KYB - 0.04, Z0 + D.h + 0.004], wifi: [KX + 0.03, KYB - 0.04, Z0 + D.h + 0.004], antikalk: [KX, KYB - 0.04, Z0 + 0.12], thee: [KX, D.yf + 0.03, Z0 + D.h - 0.12] }),
  filter: D => ({ touchbediening: [KX, D.yf - 0.003, Z0 + D.h - 0.065], antikalk: [D.x1, KYB - 0.06, Z0 + 0.2], thee: [KX, D.yf + 0.03, Z0 + 0.14] }),
};
const EXTRA_LABEL = {
  touchbediening: "<b>Touchbediening</b>: aanraakknoppen",
  wifi: "<b>Wifi</b>: koffie zetten via de app",
  antikalk: "<b>Automatisch ontkalken</b>: minder onderhoud",
  thee: "<b>Thee</b>: heet water voor thee",
};

function overlays(ctx) {
  const { st } = ctx, D = dims(st), id = qId(st);
  if (id === "type" && st.type) {
    const t = { volautomaat: "<b>Volautomaat</b> <span class=\"muted\">bonen, alles op 1 knop</span>", halfautomaat: "<b>Halfautomaat</b> <span class=\"muted\">zelf espresso zetten</span>", capsules: "<b>Capsules of pads</b> <span class=\"muted\">snel en makkelijk</span>", filter: "<b>Filterkoffie</b> <span class=\"muted\">een hele kan tegelijk</span>" }[st.type];
    return { svg: "", html: tag(above(ctx, st), t) };
  }
  if (id === "hoeveelheid" && st.hoeveelheid) return { svg: "", html: tag(above(ctx, st), tankTekst(st)) };
  if (id === "melk" && st.melk) {
    const t = { automatisch: "<b>Automatisch opschuimen</b> <span class=\"muted\">met één knop</span>", handmatig: "<b>Zelf opschuimen</b> <span class=\"muted\">met een stoompijpje</span>", nee: "<b>Zwarte koffie</b> <span class=\"muted\">geen melksysteem nodig</span>" }[st.melk];
    return { svg: "", html: tag(above(ctx, st), t) };
  }
  if (id === "extra") {
    const pos = EXTRA_POS[kind(st)](D);
    const pts = st.extra.filter(e => pos[e]).map(e => ({ w: pos[e], label: EXTRA_LABEL[e] }));
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
    txt = { automatisch: "Latte", handmatig: "Espresso" }[st.melk] ?? "Koffie";
  } else {
    const y = D.yf - 0.0027, z0 = Z0 + D.h - 0.085, z1 = Z0 + D.h - 0.045;
    c = [[KX - 0.045, y, z1], [KX + 0.045, y, z1], [KX + 0.045, y, z0], [KX - 0.045, y, z0]];
    txt = "07:30";
  }
  const html = `<span class="big prog">${txt}</span>`;
  if (disp.innerHTML !== html) disp.innerHTML = html;
  placeQuad(disp, k === "vol" ? 240 : 270, 120, c.map(p => ctx.toPx(...p)));
}

createQuiz3D({
  camera,
  steps: st => questions(st).length,
  state: { type: null, hoeveelheid: null, melk: null, extra: [] },
  imgPath: n => `koffiemachine/vragen/img/${n}.webp`,
  question: st => questions(st)[st.q],
  setup, afterRender, overlays,

  images(st) {
    const k = kind(st), id = qId(st);
    let m = k;
    if (k !== "filter" && (id === "melk" || id === "extra") && st.melk) m += { automatisch: "-auto", handmatig: "-stoom", nee: "" }[st.melk];
    const list = ["keuken", m];
    if (st.q >= 1 && st.hoeveelheid) list.push(`kopjes-${st.hoeveelheid}`);
    return list;
  },

  onAnswer(st, id) {
    if (id === "type" && st.type === "filter") { st.melk = null; st.extra = st.extra.filter(e => e !== "wifi"); }
  },

  focus: st => {
    const id = qId(st);
    if (id === "hoeveelheid") return { x: -0.82, y: -0.4, z: 1.05, zoom: 1.35 };
    if (id === "extra") return { x: KX, y: -0.3, z: 1.1, zoom: 1.55, anchorX: 0.36 };
    return { x: KX + (id === "melk" ? 0.05 : 0), y: -0.3, z: 1.1, zoom: 1.5 };
  },
  focusDesktop: st => {
    const id = qId(st);
    if (id === "hoeveelheid") return { x: -0.82, y: -0.4, z: 1.08, zoom: 1.35, anchorX: 0.62 };
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
      case "hoeveelheid": return st.hoeveelheid ? ["Watertank", "Hoe meer koffie per keer, hoe groter de watertank, zodat je minder vaak bijvult."] : ["Hoeveelheid", "Kies hoeveel koffie je per keer nodig hebt."];
      case "melk": return {
        automatisch: ["Automatisch opschuimen", "We zoeken machines die de melk zelf opschuimen."],
        handmatig: ["Handmatig opschuimen", "We zoeken machines met een melkopschuimer of stoompijpje."],
        nee: ["Zwarte koffie", "Een melksysteem is dan niet nodig."],
      }[st.melk] ?? ["Melk", "Kies of je ook cappuccino of latte wilt maken."];
      default: return st.extra.includes("geen") ? ["Geen extra wensen", "We kijken dan naar type, hoeveelheid en melk."] : ["Extra's", "Vink aan wat je belangrijk vindt; het verschijnt op de machine."];
    }
  },

  async finish(st) {
    const answers = { type: st.type ?? "", hoeveelheid: st.hoeveelheid ?? "", melk: isFilter(st) ? "" : st.melk ?? "", extraAnswers: st.extra };
    const raw = await productsPromise;
    const result = matchKoffiemachines(normalizeProducts(raw ?? []), answers);
    localStorage.setItem("koffiemachine_bestMatch", JSON.stringify(result.bestMatch));
    localStorage.setItem("koffiemachine_bestType", result.bestType ?? "");
    localStorage.setItem("koffiemachine_filteredMatchedKoffiemachines", JSON.stringify(result.filteredMatchedKoffiemachines));
    localStorage.setItem("koffiemachine_answers", JSON.stringify(answers));
    window.location.href = "koffiemachine/resultaat";
  },

  preload: ["vol", "half", "caps", "filter", "kopjes-gemiddeld", "kopjes-klein", "kopjes-groot", "vol-auto", "vol-stoom", "half-auto", "half-stoom", "caps-auto", "caps-stoom"],
});
