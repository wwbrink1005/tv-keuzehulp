// Testversie van de robotstofzuiger-vragenpagina in de 3D-woonkamer (dezelfde scène
// als de stofzuiger-test). Basisrender = de kamer; de robot (met of zonder LiDAR, met
// of zonder dweilpads) en het basisstation (gewoon of zelflegend) zijn transparante
// lagen (render/scene.py). Route, dweilbanen en vloeroppervlak tekent de pagina zelf
// in perspectief op de vloer. Motor: shared/quiz3d.js.
import { createQuiz3D, makeCamera } from "../../shared/quiz3d.js";
import { matchRobotstofzuigers } from "../js/matching.js";
import { normalizeProducts } from "../js/utils.js";
import { fetchProducts } from "../js/supabase.js";
import { woninggrootteMinLooptijd, GELUID_BELANGRIJK_DB, GELUID_BELANGRIJK_FALLBACK_DB, GELUID_GEMIDDELD_DB } from "../js/data.js";

const camera = makeCamera({ camY: -3.4, camZ: 1.25, shiftX: -0.12, shiftY: -0.17 });
const productsPromise = fetchProducts().catch(() => null);

// geometrie (m) zoals in render/scene.py
const RUG_X1 = 0.35;
const BOT = { x: 0.62, y: -1.1, rot: -25 };
const DOCK = { x: 1.55, y: -0.02 };
function W([lx, ly, lz]) {   // lokaal robotpunt (voorkant = -y) naar wereld
  const a = BOT.rot * Math.PI / 180;
  return [BOT.x + lx * Math.cos(a) - ly * Math.sin(a), BOT.y + lx * Math.sin(a) + ly * Math.cos(a), lz];
}

const Q = [
  {
    id: "navigatie", type: "radio",
    title: "Moet de robotstofzuiger een plattegrond van je huis maken?",
    sub: "Zie hoe hij door de kamer rijdt.",
    why: "Robotstofzuigers met LiDAR/laser-navigatie maken een nauwkeurige plattegrond van je woning, onthouden die en rijden systematisch rij voor rij. Goedkopere modellen zonder deze techniek rijden vaker willekeurig rond, zonder plattegrond. Wil je dat hij slim en gericht werkt, dan zoeken we daar gericht op.",
    options: [{ v: "belangrijk", label: "Ja, slim en systematisch (LiDAR)", price: "€€€" }, { v: "maakt-niet-uit", label: "Nee, gewoon rondrijden is prima", price: "€" }],
  },
  {
    id: "dweilen", type: "radio",
    title: "Wil je ook laten dweilen?",
    sub: "Dweilen doet hij alleen op de harde vloer.",
    why: "Veel moderne robotstofzuigers combineren zuigen met een natte dweilfunctie voor harde vloeren. Wil je dat niet (bijvoorbeeld puur voor tapijt of om kosten te besparen), dan zoeken we gericht naar modellen zonder dweilfunctie.",
    options: [{ v: "ja", label: "Ja, graag zuigen én dweilen", price: "€€" }, { v: "liever-niet", label: "Liever niet, alleen zuigen", price: "€" }, { v: "maakt-niet-uit", label: "Maakt niet uit", price: "€€" }],
  },
  {
    id: "woninggrootte", type: "radio",
    title: "Hoeveel vloeroppervlak moet hij per beurt schoonmaken?",
    sub: "Hoe meer vloer, hoe langer de accu mee moet.",
    why: "Een robotstofzuiger kan geen trap op, dus telt alleen het oppervlak van de verdieping waar hij rijdt. Hoe meer vierkante meters hij in één beurt moet doen, hoe langer hij moet kunnen doorwerken op één acculading. Weinig oppervlak is met een kortere looptijd al klaar; veel oppervlak vraagt om een robot met langere looptijd (en idealiter een zelflegend basisstation).",
    options: [{ v: "klein", label: "Weinig (appartement, enkele kamers)", price: "€" }, { v: "gemiddeld", label: "Gemiddeld (hele begane grond)", price: "€€" }, { v: "groot", label: "Veel (grote, open leefruimte)", price: "€€€" }],
  },
  {
    id: "geluid", type: "radio",
    title: "Hoe belangrijk is een stille robotstofzuiger?",
    sub: "Zie hoeveel geluid er mag zijn.",
    why: "Het geluidsniveau tijdens het schoonmaken varieert flink tussen modellen. Wil je 'm ook kunnen laten werken terwijl je thuis bent (bijv. overdag in een open woonruimte), dan zoeken we gericht naar stillere modellen (lager dB-niveau).",
    options: [{ v: "belangrijk", label: "Erg belangrijk, moet stil zijn", price: "€€€" }, { v: "gemiddeld", label: "Een beetje belangrijk", price: "€€" }, { v: "niet", label: "Niet belangrijk", price: "€" }],
  },
  {
    id: "extra", type: "check", exclusive: "geen",
    title: "Welke van de volgende mag niet ontbreken?",
    sub: "Je keuzes verschijnen op de robot en het station.",
    why: "Een zelflegend stofreservoir maakt het basisstation zelf leeg, zodat je wekenlang niet hoeft om te kijken. Obstakeldetectie voorkomt dat de robot vastloopt tussen speelgoed/kabels. Een HEPA-filter houdt fijnstof en allergenen beter tegen. Wifi/app-bediening, Amazon Alexa en Google Assistent laten je de robot op afstand of met je stem bedienen. Je kunt meerdere opties aanvinken.",
    options: [
      { v: "zelflegend", label: "Zelflegend stofreservoir", price: "€€€" }, { v: "obstakeldetectie", label: "Obstakeldetectie", price: "€€" },
      { v: "hepa", label: "HEPA-filter", price: "€€" }, { v: "wifi", label: "Wifi/app-bediening", price: "€€" },
      { v: "alexa", label: "Amazon Alexa", price: "€€" }, { v: "google-assistent", label: "Google Assistent", price: "€€" },
      { v: "geen", label: "Geen extra wensen", price: "€" },
    ],
  },
];

// ───────── route over de vloer ─────────
const pts2 = (ctx, pts, z = 0.016) => pts.map(([x, y]) => { const p = ctx.toPx(x, y, z); return `${p.x},${p.y}`; }).join(" ");
// rij voor rij (LiDAR) binnen een rechthoek, beginnend bij de robot
function lanes(x0, x1, y0, y1, step) {
  const out = []; let dir = 1;
  for (let y = y1; y >= y0 - 1e-6; y -= step) {
    out.push(dir > 0 ? [x0, y] : [x1, y], dir > 0 ? [x1, y] : [x0, y]);
    dir = -dir;
  }
  return out;
}
// zonder plattegrond: rechtdoor tot hij ergens tegenaan rijdt, dan een willekeurige
// nieuwe richting (zo werken robots zonder LiDAR). Vaste reeks, zodat het beeld niet springt.
const TURNS = [2.55, -0.55, 1.95, -2.45, 0.35, 2.9, -1.15, 1.35, -2.0];
function bounce(x0, x1, y0, y1, n) {
  const out = [[BOT.x, BOT.y]]; let x = BOT.x, y = BOT.y;
  for (let i = 0; i < n; i++) {
    const a = TURNS[i % TURNS.length], dx = Math.cos(a), dy = Math.sin(a);
    const tx = dx > 0 ? (x1 - x) / dx : dx < 0 ? (x0 - x) / dx : Infinity;
    const ty = dy > 0 ? (y1 - y) / dy : dy < 0 ? (y0 - y) / dy : Infinity;
    const t = Math.min(tx, ty); x += dx * t; y += dy * t; out.push([x, y]);
  }
  return out;
}
const isLidar = st => st.navigatie !== "maakt-niet-uit";
function route(st, hardOnly) {
  const x0 = hardOnly ? RUG_X1 + 0.08 : -0.8;
  return isLidar(st) ? lanes(x0, 1.35, -1.7, -0.6, hardOnly ? 0.3 : 0.14) : bounce(x0, 1.4, -1.55, -0.6, hardOnly ? 6 : 8);
}
function routeView(ctx, st) {
  if (!st.navigatie) return {};
  const svg = `<polyline class="route ${isLidar(st) ? "" : "rand"}" points="${pts2(ctx, route(st, false))}"/>`;
  const t = ctx.toPx(0.3, -0.45, 0);
  const txt = isLidar(st) ? "<b>Rij voor rij</b> <span class=\"muted\">met plattegrond</span>" : "<b>Rijdt rond</b> <span class=\"muted\">tot hij botst, zonder plattegrond</span>";
  return { svg, html: `<div class="tag is-on" style="left:${t.x}px;top:${t.y}px">${txt}</div>` };
}
function mopView(ctx, st) {
  if (st.dweilen !== "ja") return {};
  // baan van de dweilpads (± 20 cm breed) alleen over de harde vloer, niet over het kleed
  const a = ctx.toPx(0, -1.1, 0), b = ctx.toPx(0.2, -1.1, 0);
  // masker rond de robot, zodat de baan de robot zelf niet blauw kleurt
  const c = ctx.toPx(BOT.x, BOT.y, 0.05), rx = ctx.toPx(BOT.x + 0.22, BOT.y, 0.05).x - c.x;
  const svg = `<defs><mask id="mopmask"><rect x="-5000" y="-5000" width="10000" height="10000" fill="#fff"/><ellipse cx="${c.x}" cy="${c.y}" rx="${rx}" ry="${rx * 0.62}" fill="#000"/></mask></defs>`
    + `<polyline class="mop" mask="url(#mopmask)" stroke-width="${(b.x - a.x).toFixed(1)}" points="${pts2(ctx, route(st, true), 0.004)}"/>`;
  const t = ctx.toPx(0.85, -0.45, 0);
  return { svg, html: `<div class="tag is-on" style="left:${t.x}px;top:${t.y}px"><b>Dweilt</b> <span class="muted">de harde vloer, niet het kleed</span></div>` };
}

// vloeroppervlak per beurt: deel van de zichtbare vloer, met de minimale looptijd uit data.js
function areaView(ctx, st) {
  const g = st.woninggrootte;
  if (!g) return {};
  const xs = { klein: [0.35, 1.4], gemiddeld: [-0.8, 1.4], groot: [-2.5, 2.3] }[g];
  const ys = { klein: [-1.55, -0.55], gemiddeld: [-1.8, -0.55], groot: [-2.4, -0.5] }[g];
  const svg = `<polygon class="area" points="${pts2(ctx, [[xs[0], ys[1]], [xs[1], ys[1]], [xs[1], ys[0]], [xs[0], ys[0]]])}"/>`;
  const min = woninggrootteMinLooptijd[g];
  const t = ctx.toPx(0.5, -0.45, 0);
  const txt = min ? `<b>Minstens ${min} min</b> <span class="muted">looptijd op één lading</span>` : "<b>Elke looptijd</b> <span class=\"muted\">is hiervoor genoeg</span>";
  return { svg, html: `<div class="tag is-on" style="left:${t.x}px;top:${t.y}px">${txt}</div>` };
}

// geluid: grenzen uit data.js
const SOUND = {
  belangrijk: { n: 2, tag: `<b>Liefst max. ${GELUID_BELANGRIJK_DB} dB</b> <span class="muted">zo luid als een gesprek</span>` },
  gemiddeld: { n: 4, tag: `<b>Max. ${GELUID_GEMIDDELD_DB} dB</b> <span class="muted">zo luid als een stofzuiger</span>` },
  niet: { n: 5, soft: true, tag: "<b>Geen eis</b> <span class=\"muted\">aan het geluid</span>" },
};
function waves(ctx, st) {
  const s = SOUND[st.geluid];
  if (!s) return {};
  const l = ctx.toPx(BOT.x - 0.18, BOT.y, 0.05), r = ctx.toPx(BOT.x + 0.18, BOT.y, 0.05);
  const w = ctx.toPx(BOT.x + 0.3, BOT.y, 0.05).x - ctx.toPx(BOT.x - 0.3, BOT.y, 0.05).x, a = 38 * Math.PI / 180;
  let svg = "";
  for (let i = 0; i < s.n; i++) {
    const rad = w * (0.1 + i * 0.075), dy = Math.sin(a) * rad, dx = Math.cos(a) * rad;
    const style = `style="animation-delay:${(i * 0.18).toFixed(2)}s"`, cls = `wave${s.soft ? " soft" : ""}`;
    svg += `<path class="${cls}" ${style} d="M${r.x + dx} ${r.y - dy} A${rad} ${rad} 0 0 1 ${r.x + dx} ${r.y + dy}"/>`;
    svg += `<path class="${cls}" ${style} d="M${l.x - dx} ${l.y - dy} A${rad} ${rad} 0 0 0 ${l.x - dx} ${l.y + dy}"/>`;
  }
  const t = ctx.toPx(BOT.x, BOT.y, 0.35);
  return { svg, html: `<div class="tag is-on" style="left:${t.x}px;top:${t.y}px">${s.tag}</div>` };
}

// extra's: punten op robot en station, labels in een kolom, nooit over elkaar
function extraSpots(ctx, st) {
  const e = st.extra, pts = [];
  if (e.includes("zelflegend")) pts.push({ w: [DOCK.x, DOCK.y - 0.15, 0.44], label: "<b>Zelflegend station</b>: wekenlang niet legen" });
  if (e.includes("wifi")) pts.push({ w: W([-0.022, -0.06, 0.085]), label: "<b>Wifi</b>: starten en plattegrond in de app" });
  if (e.includes("alexa")) pts.push({ w: W([0.0, -0.1, 0.08]), label: "<b>Alexa</b>: starten met je stem" });
  if (e.includes("google-assistent")) pts.push({ w: W([0.03, -0.12, 0.08]), label: "<b>Google Assistent</b>: starten met je stem" });
  if (e.includes("obstakeldetectie")) pts.push({ w: W([0, -0.18, 0.05]), label: "<b>Obstakeldetectie</b>: ziet kabels en speelgoed" });
  if (e.includes("hepa")) pts.push({ w: W([0.06, 0.17, 0.05]), label: "<b>HEPA-filter</b>: vangt fijnstof en pollen" });
  if (!pts.length) return {};
  const placed = pts.map(p => ({ ...p, px: ctx.toPx(...p.w) })).sort((a, b) => a.px.y - b.px.y);
  // labels rechts van de robot; is daar geen ruimte, dan links ervan (rechts uitgelijnd)
  let labelX = Math.max(...placed.map(d => d.px.x)) + (ctx.mobile ? 20 : 40);
  const flip = labelX > ctx.width - (ctx.mobile ? 150 : 290);
  if (flip) labelX = Math.min(...placed.map(d => d.px.x)) - (ctx.mobile ? 20 : 40);
  const gap = ctx.mobile ? 26 : 34;
  const ys = placed.map(d => d.px.y - (ctx.mobile ? 60 : 110));
  ys[0] = Math.max(ys[0], ctx.mobile ? 20 : 104);   // bovenin vrijhouden voor de uitleg rechtsboven
  for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + gap);
  const over = ys[ys.length - 1] - (ctx.height - 20);
  if (over > 0) for (let i = 0; i < ys.length; i++) ys[i] -= over;
  let svg = "", html = "";
  placed.forEach((d, i) => {
    svg += `<line x1="${d.px.x}" y1="${d.px.y}" x2="${labelX}" y2="${ys[i]}" class="leader"/>`;
    html += `<div class="spot is-on" style="left:${d.px.x}px;top:${d.px.y}px"></div>`;
    const pos = flip ? `right:${ctx.width - labelX}px` : `left:${labelX}px`;
    html += `<div class="spot-label is-on" style="${pos};top:${ys[i]}px">${ctx.mobile ? d.label.split(":")[0] : d.label}</div>`;
  });
  return { svg, html };
}



createQuiz3D({
  camera,
  captionTop: true,   // uitleg vast rechtsboven: de toestellen staan laag in beeld
  steps: 5,
  state: { navigatie: null, dweilen: null, woninggrootte: null, geluid: null, extra: [] },
  imgPath: n => `robotstofzuiger/vragen/img/${n}.webp`,
  question: st => Q[st.q],

  images(st) {
    const mop = st.q >= 1 && st.dweilen === "ja" ? "-mop" : "";
    return ["woonkamer", `robot-${isLidar(st) ? "lidar" : "basic"}${mop}`, st.q === 4 && st.extra.includes("zelflegend") ? "dock-zelflegend" : "dock"];
  },

  focus: st => [
    { x: 0.3, y: -1.1, z: 0.1, zoom: 1.1 },
    { x: 0.7, y: -1.1, z: 0.1, zoom: 1.25 },
    { x: 0.3, y: -1.2, z: 0.1, zoom: 1.0 },
    { x: 0.62, y: -1.1, z: 0.15, zoom: 1.6 },
    { x: 0.9, y: -1.0, z: 0.2, zoom: 1.3 },
  ][st.q],
  focusDesktop: st => [
    { x: 0.3, y: -1.1, z: 0.25, zoom: 1.05, anchorX: 0.64 },
    { x: 0.75, y: -1.1, z: 0.25, zoom: 1.15, anchorX: 0.66 },
    { x: 0.2, y: -1.2, z: 0.3, zoom: 1.0, anchorX: 0.62 },
    { x: 0.62, y: -1.1, z: 0.2, zoom: 1.5, anchorX: 0.66 },
    { x: 0.9, y: -1.0, z: 0.3, zoom: 1.25, anchorX: 0.64 },
  ][st.q],

  overlays(ctx) {
    const { st } = ctx;
    if (st.q === 0) return routeView(ctx, st);
    if (st.q === 1) return mopView(ctx, st);
    if (st.q === 2) return areaView(ctx, st);
    if (st.q === 3) return waves(ctx, st);
    return extraSpots(ctx, st);
  },


  caption(st) {
    switch (st.q) {
      case 0: return {
        belangrijk: ["Slim en systematisch", "Met LiDAR (het torentje) maakt hij een plattegrond en rijdt hij rij voor rij."],
        "maakt-niet-uit": ["Gewoon rondrijden", "Zonder plattegrond rijdt hij rond tot hij iets raakt; goedkoper, maar minder gericht."],
      }[st.navigatie] ?? ["Jouw woonkamer", "Kies of de robot een plattegrond moet maken; je ziet hoe hij rijdt."];
      case 1: return {
        ja: ["Zuigen én dweilen", "Met dweilpads onderop; op het vloerkleed dweilt hij niet."],
        "liever-niet": ["Alleen zuigen", "We zoeken gericht naar modellen zonder dweilfunctie."],
        "maakt-niet-uit": ["Maakt niet uit", "We houden modellen met en zonder dweilfunctie in beeld."],
      }[st.dweilen] ?? ["Dweilen", "Kies of hij ook moet dweilen."];
      case 2: return st.woninggrootte ? ["Vloer per beurt", "Hoe meer vloer, hoe langer hij op één lading moet kunnen rijden."] : ["Vloeroppervlak", "Kies hoeveel vloer hij per beurt moet doen; alleen de verdieping waar hij rijdt telt."];
      case 3: return {
        belangrijk: ["Zo stil mogelijk", `We zoeken modellen tot ${GELUID_BELANGRIJK_DB} dB. Zijn die er niet, dan tot ${GELUID_BELANGRIJK_FALLBACK_DB} dB.`],
        gemiddeld: ["Redelijk stil", `We laten de luidste modellen weg: maximaal ${GELUID_GEMIDDELD_DB} dB.`],
        niet: ["Geluid maakt niet uit", "We letten niet op het geluid; dat geeft de meeste keuze."],
      }[st.geluid] ?? ["Geluid", "Kies hoe stil de robot moet zijn."];
      default: return st.extra.includes("geen") ? ["Geen extra wensen", "We kijken dan naar navigatie, dweilen, oppervlak en geluid."] : ["Extra's", "Vink aan wat je belangrijk vindt; het verschijnt op de robot of het station."];
    }
  },

  async finish(st) {
    const answers = { navigatie: st.navigatie ?? "", dweilen: st.dweilen ?? "", woninggrootte: st.woninggrootte ?? "", geluid: st.geluid ?? "", extraAnswers: st.extra };
    const raw = await productsPromise;
    const result = matchRobotstofzuigers(normalizeProducts(raw ?? []), answers);
    localStorage.setItem("robotstofzuiger_bestMatch", JSON.stringify(result.bestMatch));
    localStorage.setItem("robotstofzuiger_bestType", result.bestType ?? "");
    localStorage.setItem("robotstofzuiger_filteredMatchedRobotstofzuigers", JSON.stringify(result.filteredMatchedRobotstofzuigers));
    localStorage.setItem("robotstofzuiger_answers", JSON.stringify(answers));
    window.location.href = "robotstofzuiger/resultaat";
  },

  preload: ["robot-lidar", "dock", "robot-basic", "robot-lidar-mop", "robot-basic-mop", "dock-zelflegend"],
});
