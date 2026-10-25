// Testversie van de robotstofzuiger-vragenpagina in de 3D-woonkamer (dezelfde scène
// als de stofzuiger-test). Basisrender = de kamer; de robot (met of zonder LiDAR, met
// of zonder dweilpads) en het basisstation (gewoon of zelflegend) zijn transparante
// lagen (render/scene.py). Route, dweilbanen en vloeroppervlak tekent de pagina zelf
// in perspectief op de vloer. Motor: shared/quiz3d.js.
import { createQuiz3D, makeCamera } from "../../shared/quiz3d.js";
import { matchRobotstofzuigers, heeftExtra, heeftStation } from "../js/matching.js";
import { normalizeProducts, parsePrice } from "../js/utils.js";
import { fetchProducts } from "../js/supabase.js";
import { woninggrootteMinLooptijd, BUDGET_CAPS, LAAG_MAX_MM, HOGE_DREMPEL_CM, HUISDIER_PA } from "../js/data.js";

const camera = makeCamera({ camY: -3.4, camZ: 1.25, shiftX: -0.12, shiftY: -0.17 });
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

// geometrie (m) zoals in render/scene.py
const RUG_X1 = 0.35;
const BOT = { x: 0.62, y: -1.1, rot: -25 };
const DOCK = { x: 1.55, y: -0.02 };
function W([lx, ly, lz]) {   // lokaal robotpunt (voorkant = -y) naar wereld
  const a = BOT.rot * Math.PI / 180;
  return [BOT.x + lx * Math.cos(a) - ly * Math.sin(a), BOT.y + lx * Math.sin(a) + ly * Math.cos(a), lz];
}

// Sinds okt. 2026: vragen over wat robots echt onderscheidt (station, vloer,
// hoogte, drempels, zuigkracht) i.p.v. LiDAR, dweilen, WiFi en Alexa, die
// vrijwel elke robot heeft (zie docs/robotstofzuiger-keuzehulp-werking.md).
const euro = n => "€" + Math.round(n).toLocaleString("nl-NL");
const Q = [
  {
    id: "station", type: "radio",
    title: "Wat moet het basisstation doen?",
    sub: "Het station naast de bank wisselt mee.",
    why: "Elke robot laadt op in zijn station. Een zelflegend station zuigt ook de stofbak van de robot leeg, zodat je wekenlang niet hoeft om te kijken. Een volledig station wast daarnaast de dweilpads, droogt ze en vult water bij: dan hoef je bijna nooit meer iets te doen. Hoe meer het station doet, hoe duurder.",
    options: [
      { v: "alles", label: "Alles automatisch: ook dweilpads wassen en water bijvullen", price: "€€€" },
      { v: "zelflegend", label: "Zelflegend: het station leegt de stofbak", price: "€€" },
      { v: "maakt-niet-uit", label: "Maakt niet uit, alleen opladen is ook goed", price: "€" },
    ],
  },
  {
    id: "budget", type: "radio",
    title: "Wat wil je maximaal uitgeven?",
    sub: "Je krijgt de beste robot binnen je budget.",
    why: "Met je budget zoeken we de beste robotstofzuiger die je ook echt wilt kopen. Past een robot die nog beter bij je wensen past net niet binnen je bedrag, dan laten we dat op de resultaatpagina zien.",
    options: [...BUDGET_CAPS.map(c => ({ v: String(c), label: `Tot ${euro(c)}` })), { v: "geen", label: "Geen voorkeur" }],
  },
  {
    id: "woninggrootte", type: "radio",
    title: "Hoeveel vloeroppervlak moet hij per beurt schoonmaken?",
    sub: "Hoe meer vloer, hoe langer de accu mee moet.",
    why: "Een robotstofzuiger kan geen trap op, dus telt alleen het oppervlak van de verdieping waar hij rijdt. Hoe meer vierkante meters hij in één beurt moet doen, hoe langer hij moet kunnen doorwerken op één acculading.",
    options: [{ v: "klein", label: "Weinig (appartement, enkele kamers)", price: "€" }, { v: "gemiddeld", label: "Gemiddeld (hele begane grond)", price: "€€" }, { v: "groot", label: "Veel (grote, open leefruimte)", price: "€€€" }],
  },
  {
    id: "vloer", type: "radio",
    title: "Wat voor vloeren heb je vooral?",
    sub: "Zie waar hij zuigt en waar hij dweilt.",
    why: "Op tapijt telt zuigkracht, en een dweilpad dat omhoog gaat zodat het tapijt niet nat wordt. Op harde vloeren telt hoe goed hij dweilt: een station dat de dweilpads wast, houdt ze schoon.",
    options: [{ v: "harde_vloer", label: "Vooral harde vloeren, zoals parket of tegels", price: "€€" }, { v: "tapijt", label: "Vooral tapijt of vloerkleden", price: "€€" }, { v: "allebei", label: "Allebei, ongeveer evenveel", price: "€€" }],
  },
  {
    id: "stil", type: "radio",
    title: "Is een stille robotstofzuiger belangrijk voor je?",
    sub: "Zie hoeveel geluid er mag zijn.",
    why: "Wil je hem laten werken terwijl je thuis bent, bijvoorbeeld overdag in een open woonruimte, dan komen de stillere modellen bovenaan.",
    options: [{ v: "ja", label: "Ja, het liefst een stille robot", price: "€€" }, { v: "nee", label: "Nee, het geluid maakt niet uit", price: "€" }],
  },
  {
    id: "extra", type: "check", exclusive: "geen",
    title: "Wat is nog meer belangrijk voor jou?",
    sub: "Je keuzes verschijnen op de robot.",
    why: `Met huisdieren helpt veel zuigkracht (${HUISDIER_PA.toLocaleString("nl-NL")} Pa of meer) om haren uit tapijt te halen. Een robot van hooguit ${LAAG_MAX_MM / 10} cm hoog past onder de meeste banken en bedden. Heb je hoge drempels of deurlijsten, dan wil je een robot die over ${HOGE_DREMPEL_CM} cm of meer heen komt. Een app, plattegrond en spraakbediening heeft vrijwel elke robot.`,
    options: [
      { v: "huisdieren", label: "Huisdieren: extra veel zuigkracht", price: "€€" },
      { v: "laag", label: `Past onder lage meubels (max ${LAAG_MAX_MM / 10} cm)`, price: "€€€" },
      { v: "drempel", label: `Komt over hoge drempels (${HOGE_DREMPEL_CM} cm of meer)`, price: "€€€" },
      { v: "geen", label: "Geen extra wensen", price: "€" },
    ],
  },
];
const QID = st => Q[st.q]?.id;

// ───────── live catalogus: budgettelling en grijze opties ─────────
let catalogus = null;
const capVan = v => (v && v !== "geen" ? Number(v) : null);
const zichtbaar = () => (catalogus ?? []).filter(r => (r.aanbieders ?? []).length >= 2);
function budgetCaption(st) {
  const cap = capVan(st.budget);
  if (!st.budget) return ["Jouw budget", "Kies wat je maximaal wilt uitgeven. Je krijgt de beste robot binnen dat bedrag, en op de resultaatpagina zie je wat meer budget oplevert."];
  if (!catalogus) return [cap ? `Tot ${euro(cap)}` : "Geen voorkeur", cap ? "We zoeken de beste robot binnen dit bedrag." : "We kiezen puur op je wensen."];
  const pas = r => heeftStation(r, st.station) === true;
  const alle = zichtbaar(), prijzen = alle.map(r => parsePrice(r.prijs));
  const binnen = cap ? prijzen.filter(x => x <= cap) : prijzen;
  const met = (st.station === "alles" || st.station === "zelflegend") ? alle.filter(pas).map(r => parsePrice(r.prijs)) : null;
  const stationRegel = met && met.length ? ` Met ${st.station === "alles" ? "een volledig" : "een zelflegend"} station vanaf ${euro(Math.min(...met))}.` : "";
  if (!cap) return ["Geen voorkeur", `Alle ${prijzen.length} robots doen mee, van ${euro(Math.min(...prijzen))} tot ${euro(Math.max(...prijzen))}.${stationRegel}`];
  return [`Tot ${euro(cap)}`, `${binnen.length} van de ${prijzen.length} robots kosten ${euro(cap)} of minder, vanaf ${euro(Math.min(...binnen))}.${stationRegel}`];
}
// Grijs als geen robot bij 2+ winkels binnen het budget het zeker heeft, samen
// met het gekozen station en de al aangevinkte extra's.
const EIS = {
  station: { alles: r => heeftStation(r, "alles") === true, zelflegend: r => heeftStation(r, "zelflegend") === true },
  extra: Object.fromEntries(["huisdieren", "laag", "drempel"].map(v => [v, r => heeftExtra(r, v) === true])),
};
function eisenVan(st, totId, zonder) {
  const eisen = [];
  for (const q of Q) {
    const eigenRadio = q.id === totId && !Array.isArray(st[q.id]);
    if (EIS[q.id] && !eigenRadio) [].concat(st[q.id] ?? []).filter(v => EIS[q.id][v] && (q.id !== totId || v !== zonder)).forEach(v => eisen.push(EIS[q.id][v]));
    if (q.id === totId) break;
  }
  return eisen;
}
function metBeschikbaarheid(st, q) {
  // het station komt vóór het budget: daar kan nog niets grijs
  if (!catalogus || !EIS[q.id] || q.id === "station") return q;
  const cap = capVan(st.budget), alle = zichtbaar();
  const binnen = cap ? alle.filter(r => parsePrice(r.prijs) <= cap) : alle;
  return { ...q, options: q.options.map(o => {
    const eis = EIS[q.id][o.v];
    if (!eis) return o;
    let andere = eisenVan(st, q.id, o.v);
    if (!binnen.some(r => andere.every(f => f(r)))) andere = [];
    if (binnen.some(r => eis(r) && andere.every(f => f(r)))) return o;
    const erboven = alle.filter(r => eis(r) && andere.every(f => f(r))).map(r => parsePrice(r.prijs));
    const note = cap && erboven.length ? (andere.length && binnen.some(eis) ? `Samen met je andere keuzes pas vanaf ${euro(Math.min(...erboven))}.` : `Niet tot ${euro(cap)}; wel vanaf ${euro(Math.min(...erboven))}.`)
      : "Niet in combinatie met je andere keuzes.";
    return { ...o, disabled: true, note };
  }) };
}
const WENS_NAAM = { huisdieren: "extra veel zuigkracht", laag: "een lage bouw", drempel: "een hoge drempel-klim" };
function extraCaption(st) {
  const wensen = st.extra.filter(e => e !== "geen");
  if (!wensen.length) return st.extra.length ? ["Geen extra wensen", "We kiezen puur op je eerdere antwoorden."] : ["Extra's", "Vink aan wat je belangrijk vindt; het verschijnt op de robot."];
  if (!catalogus) return ["Jouw extra's", "De gemarkeerde punten laten zien waar je keuzes zitten."];
  const cap = capVan(st.budget);
  const l = zichtbaar().filter(r => !cap || parsePrice(r.prijs) <= cap);
  const eisen = eisenVan(st, "extra", null);
  const n = l.filter(r => eisen.every(f => f(r))).length;
  const wat = eisen.length > 1 ? "alles wat je koos" : WENS_NAAM[wensen[0]];
  const bij = cap ? " binnen je budget" : "";
  if (!n) return ["Jouw extra's", `Van de ${l.length} robots${bij} heeft er geen zeker ${wat}. We tonen die er het meest van hebben.`];
  return ["Jouw extra's", `${n} van de ${l.length} robots${bij} ${n === 1 ? "heeft" : "hebben"} zeker ${wat}.`];
}

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
// dweilbaan rij voor rij (vrijwel elke robot in het aanbod heeft LiDAR)
function route(st, hardOnly) {
  const x0 = hardOnly ? RUG_X1 + 0.08 : -0.8;
  return lanes(x0, 1.35, -1.7, -0.6, hardOnly ? 0.3 : 0.14);
}
function mopView(ctx, st) {
  if (st.vloer !== "harde_vloer" && st.vloer !== "allebei") return {};
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

// geluid: stil gewenst = stiller dan gemiddeld
const SOUND = {
  ja: { n: 2, tag: "<b>Stiller dan gemiddeld</b> <span class=\"muted\">voor robotstofzuigers</span>" },
  nee: { n: 5, soft: true, tag: "<b>Geen eis</b> <span class=\"muted\">aan het geluid</span>" },
};
function waves(ctx, st) {
  const s = SOUND[st.stil];
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
  if (e.includes("laag")) pts.push({ w: W([-0.022, -0.06, 0.085]), label: `<b>Laag</b>: max. ${LAAG_MAX_MM / 10} cm, past onder de bank` });
  if (e.includes("huisdieren")) pts.push({ w: W([0, -0.18, 0.05]), label: "<b>Veel zuigkracht</b>: haalt haren uit tapijt" });
  if (e.includes("drempel")) pts.push({ w: W([0.06, 0.17, 0.05]), label: `<b>Hoge drempels</b>: klimt over ${HOGE_DREMPEL_CM} cm of meer` });
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

// station in beeld: bij "zelflegend" en "alles" het grote station
function stationView(ctx, st) {
  if (st.station !== "alles" && st.station !== "zelflegend") return {};
  const t = ctx.toPx(DOCK.x, DOCK.y - 0.15, 0.62);
  const txt = st.station === "alles" ? "<b>Volledig station</b> <span class=\"muted\">leegt, wast dweilpads en vult water bij</span>" : "<b>Zelflegend</b> <span class=\"muted\">station leegt de stofbak</span>";
  return { svg: "", html: `<div class="tag is-on" style="left:${t.x}px;top:${Math.max(t.y, 46)}px">${txt}</div>` };
}
function vloerView(ctx, st) {
  if (st.vloer === "tapijt") {
    const t = ctx.toPx(-0.35, -1.2, 0);
    return { svg: "", html: `<div class="tag is-on" style="left:${t.x}px;top:${t.y}px"><b>Tapijt</b> <span class="muted">zuigkracht telt, dweilpad omhoog</span></div>` };
  }
  return mopView(ctx, st);
}

const FOCUS = {
  station: { x: 0.9, y: -1.0, z: 0.2, zoom: 1.3 }, budget: { x: 0.9, y: -1.0, z: 0.2, zoom: 1.3 },
  woninggrootte: { x: 0.3, y: -1.2, z: 0.1, zoom: 1.0 }, vloer: { x: 0.7, y: -1.1, z: 0.1, zoom: 1.25 },
  stil: { x: 0.62, y: -1.1, z: 0.15, zoom: 1.6 }, extra: { x: 0.9, y: -1.0, z: 0.2, zoom: 1.3 },
};
const FOCUS_DESKTOP = {
  station: { x: 0.9, y: -1.0, z: 0.3, zoom: 1.25, anchorX: 0.64 }, budget: { x: 0.9, y: -1.0, z: 0.3, zoom: 1.25, anchorX: 0.64 },
  woninggrootte: { x: 0.2, y: -1.2, z: 0.3, zoom: 1.0, anchorX: 0.62 }, vloer: { x: 0.75, y: -1.1, z: 0.25, zoom: 1.15, anchorX: 0.66 },
  stil: { x: 0.62, y: -1.1, z: 0.2, zoom: 1.5, anchorX: 0.66 }, extra: { x: 0.9, y: -1.0, z: 0.3, zoom: 1.25, anchorX: 0.64 },
};

const quiz = createQuiz3D({
  camera,
  captionTop: true,   // uitleg vast rechtsboven: de toestellen staan laag in beeld
  steps: Q.length,
  state: { station: null, budget: null, woninggrootte: null, vloer: null, stil: null, extra: [] },
  imgPath: n => `robotstofzuiger/vragen/img/${n}.webp`,
  question: st => metBeschikbaarheid(st, Q[st.q]),

  images(st) {
    const mop = st.vloer === "harde_vloer" || st.vloer === "allebei" ? "-mop" : "";
    const groot = st.station === "alles" || st.station === "zelflegend";
    return ["woonkamer", `robot-lidar${mop}`, groot ? "dock-zelflegend" : "dock"];
  },

  focus: st => FOCUS[QID(st)],
  focusDesktop: st => FOCUS_DESKTOP[QID(st)],

  overlays(ctx) {
    const { st } = ctx;
    switch (QID(st)) {
      case "station": return stationView(ctx, st);
      case "woninggrootte": return areaView(ctx, st);
      case "vloer": return vloerView(ctx, st);
      case "stil": return waves(ctx, st);
      case "extra": return extraSpots(ctx, st);
      default: return {};
    }
  },

  caption(st) {
    switch (QID(st)) {
      case "station": return {
        alles: ["Alles automatisch", "Het station leegt de stofbak, wast en droogt de dweilpads en vult water bij."],
        zelflegend: ["Zelflegend", "Het station zuigt de stofbak leeg: wekenlang niet omkijken."],
        "maakt-niet-uit": ["Maakt niet uit", "We kijken naar alle robots; de beste prijs telt mee."],
      }[st.station] ?? ["Basisstation", "Kies wat het station moet doen; het station naast de bank wisselt mee."];
      case "budget": return budgetCaption(st);
      case "woninggrootte": return st.woninggrootte ? ["Vloer per beurt", "Hoe meer vloer, hoe langer hij op één lading moet kunnen rijden."] : ["Vloeroppervlak", "Kies hoeveel vloer hij per beurt moet doen; alleen de verdieping waar hij rijdt telt."];
      case "vloer": return {
        harde_vloer: ["Harde vloeren", "Dweilen telt mee; een station dat de dweilpads wast houdt ze schoon."],
        tapijt: ["Tapijt", "Zuigkracht telt mee, en een dweilpad dat omhoog gaat zodat het tapijt droog blijft."],
        allebei: ["Allebei", "We letten op zuigkracht én op dweilen."],
      }[st.vloer] ?? ["Vloeren", "Kies wat voor vloeren je vooral hebt."];
      case "stil": return st.stil === "ja" ? ["Stil", "De stillere robots komen bovenaan."]
        : st.stil ? ["Geluid maakt niet uit", "We letten niet op het geluid; dat geeft de meeste keuze."] : ["Geluid", "Kies of een stille robot belangrijk is."];
      default: return extraCaption(st);
    }
  },

  onNext(st, id) { meetStap(st, id); },

  async finish(st) {
    meetStap(st, "extra");
    const answers = { station: st.station ?? "", budget: capVan(st.budget), woninggrootte: st.woninggrootte ?? "", vloer: st.vloer ?? "", stil: st.stil ?? "", extraAnswers: st.extra };
    const robots = normalizeProducts(await productenOfFout());
    // Beste match binnen het budget; past er niets binnen, dan zonder grens.
    let result = matchRobotstofzuigers(robots, answers);
    if (answers.budget && !result.bestMatch) result = matchRobotstofzuigers(robots, answers, null);
    localStorage.setItem("robotstofzuiger_bestMatch", JSON.stringify(result.bestMatch));
    localStorage.setItem("robotstofzuiger_bestType", result.bestType ?? "");
    localStorage.setItem("robotstofzuiger_filteredMatchedRobotstofzuigers", JSON.stringify(result.filteredMatchedRobotstofzuigers));
    localStorage.setItem("robotstofzuiger_answers", JSON.stringify(answers));
    window.location.href = "robotstofzuiger/resultaat/";
  },

  preload: ["robot-lidar", "dock", "robot-lidar-mop", "dock-zelflegend"],
});

// Meting: waar haken mensen af, en wat kiezen ze (o.a. de budgetvraag)
function meetStap(st, id) {
  const v = st[id];
  window.phTrackEvent?.("quiz_stap", {
    categorie: "robotstofzuiger", stap: id, nr: Q.findIndex(q => q.id === id) + 1,
    antwoord: Array.isArray(v) ? [...v].sort().join("+") : String(v ?? ""),
  });
}

// Grijze opties en live tellingen zodra de catalogus binnen is
productsPromise.then(raw => {
  if (!raw?.length) return;
  catalogus = normalizeProducts(raw);
  if (EIS[QID(quiz.st)]) quiz.renderQuestion();
  quiz.render();
});
