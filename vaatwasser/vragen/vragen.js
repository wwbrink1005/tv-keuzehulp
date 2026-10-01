// Testversie van de vaatwasser-vragenpagina in de 3D-keuken (dezelfde keuken als de
// koelkast-test). Basisrender = de keuken met een lege nis rechts in het keukenblok;
// de vaatwasser (inbouw achter een keukenfront of vrijstaand naast de koelkast; dicht,
// op een kier of open met vaat) en het losse kastje zijn transparante lagen
// (render/scene.py). Display, energielabel en labels tekent de pagina zelf.
// Motor: shared/quiz3d.js.
import { createQuiz3D, makeCamera, placeQuad } from "../../shared/quiz3d.js";
import { matchVaatwassers } from "../js/matching.js";
import { normalizeProducts } from "../js/utils.js";
import { fetchProducts } from "../js/supabase.js";
import { gezinsgrootteMinCouverts, GELUID_BELANGRIJK_DB, GELUID_BELANGRIJK_FALLBACK_DB, GELUID_GEMIDDELD_DB } from "../js/data.js";

const camera = makeCamera({ camY: -3.6, camZ: 1.35, shiftX: -0.15, shiftY: -0.18 });
const productsPromise = fetchProducts().catch(() => null);

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

const Q = [
  {
    id: "plaatsing", type: "radio",
    title: "Wat voor vaatwasser zoek je?",
    sub: "De vaatwasser in de keuken wisselt mee.",
    why: "Een inbouwvaatwasser verdwijnt achter een keukenkastje en past in de nis van je keuken (vaak al aanwezig na een verbouwing of bij een bestaande keukeninrichting). Een vrijstaande vaatwasser heeft een eigen afwerkte behuizing en kan overal in de keuken staan, ook zonder passende nis.",
    options: [{ v: "inbouw", label: "Inbouw, past in mijn keukennis", price: "€€" }, { v: "vrijstaand", label: "Vrijstaand, overal te plaatsen", price: "€" }],
  },
  {
    id: "gezinsgrootte", type: "radio",
    title: "Voor hoeveel personen doe je de afwas?",
    sub: "De vaatwasser vult zich mee.",
    why: "De grootte van je huishouden bepaalt hoeveel couverts (het aantal complete gedekte tafels dat in één keer past) je nodig hebt. Voor 1-2 personen is een compacte vaatwasser vaak al ruim voldoende. Bij 3-4 personen past 13-14 couverts beter, en bij 5 of meer personen is 15 couverts of meer aan te raden.",
    options: [{ v: "klein", label: "1-2 personen", price: "€" }, { v: "gemiddeld", label: "3-4 personen", price: "€€" }, { v: "groot", label: "5 of meer personen", price: "€€€" }],
  },
  {
    id: "geluid", type: "radio",
    title: "Hoe belangrijk is een stille vaatwasser?",
    sub: "Zie hoeveel geluid er mag zijn.",
    why: "Het geluidsniveau tijdens het wassen varieert flink tussen vaatwassers. Staat de vaatwasser in of naast een open keuken/woonkamer, of vind je het gewoon belangrijk? Dan zoeken we gericht naar stillere modellen (lager dB-niveau).",
    options: [{ v: "belangrijk", label: "Erg belangrijk, moet stil zijn", price: "€€€" }, { v: "gemiddeld", label: "Een beetje belangrijk", price: "€€" }, { v: "niet", label: "Niet belangrijk", price: "€" }],
  },
  {
    id: "energie", type: "radio",
    title: "Hoe belangrijk is energiezuinigheid?",
    sub: "Het energielabel laat zien welke klassen meedoen.",
    why: "Vaatwassers verschillen flink in energielabel (A tot en met G). Een energiezuiniger label betekent een lager verbruik op je energierekening, vooral merkbaar als je de vaatwasser vaak gebruikt.",
    options: [{ v: "belangrijk", label: "Erg belangrijk, zo zuinig mogelijk", price: "€€€" }, { v: "gemiddeld", label: "Een beetje belangrijk", price: "€€" }, { v: "niet", label: "Maakt niet uit", price: "€" }],
  },
  {
    id: "extra", type: "check", exclusive: "geen",
    title: "Welke van de volgende mag niet ontbreken?",
    sub: "Je keuzes verschijnen op de vaatwasser.",
    why: "Een kinderslot voorkomt dat kinderen de instellingen wijzigen. Halve lading bespaart water/energie bij een kleine afwas. Wifi/app-bediening laat je de vaatwasser op afstand bedienen. Een in hoogte verstelbare bovenkorf geeft ruimte voor grotere borden of pannen. AquaStop beschermt tegen waterschade bij een lekkage. Een invertermotor is stiller en gaat langer mee. Glasbescherming wast breekbaar glaswerk zachter. Een hogere droogklasse betekent drogere vaat zonder na te hoeven drogen. Je kunt meerdere opties aanvinken.",
    options: [
      { v: "kinderslot", label: "Kinderslot", price: "€€" }, { v: "halve-lading", label: "Halve lading mogelijk", price: "€€" },
      { v: "wifi", label: "Wifi/app-bediening", price: "€€€" }, { v: "verstelbare-bovenkorf", label: "In hoogte verstelbare bovenkorf", price: "€€" },
      { v: "aquastop", label: "Lekkagebescherming (AquaStop)", price: "€€" }, { v: "inverter", label: "Stille, duurzame invertermotor", price: "€€" },
      { v: "glasbescherming", label: "Glasbescherming", price: "€€" }, { v: "extra-droog", label: "Extra droge vaat", price: "€€€" },
      { v: "geen", label: "Geen extra wensen", price: "€" },
    ],
  },
  {
    id: "programma", type: "check", exclusive: "geen",
    title: "Welke afwasprogramma's wil je zeker hebben?",
    sub: "Het display laat je programma's zien.",
    why: "Niet elke vaatwasser heeft dezelfde programma's. Eco wast zuiniger op een lagere temperatuur, intensief verwijdert hardnekkig vuil op hogere temperatuur, snel is ideaal voor een korte cyclus tussendoor, stil is extra geluidsarm voor gebruik 's avonds, voorwas voorkomt vastgekoekt vuil, en een glas/breekbaar-programma wast kwetsbaar glaswerk zachter. Je kunt meerdere opties aanvinken.",
    options: [
      { v: "eco", label: "Eco", price: "€€" }, { v: "intensief", label: "Intensief", price: "€€" }, { v: "snel", label: "Snel", price: "€€" },
      { v: "stil", label: "Stil", price: "€€€" }, { v: "voorwas", label: "Voorwas", price: "€€" }, { v: "glas", label: "Glas/Breekbaar", price: "€€" },
      { v: "geen", label: "Geen specifieke wensen", price: "€" },
    ],
  },
];

// ───────── display ─────────
const PROG = { eco: "Eco 50°", intensief: "Intensief 70°", snel: "Snel", stil: "Stil", voorwas: "Voorwas", glas: "Glas 40°" };
const progList = st => { const l = st.programma.filter(p => PROG[p]).map(p => PROG[p]); return l.length ? l : ["Eco 50°", "Auto 45-65°"]; };
let progIdx = 0;
const dispHTML = st => `<span class="big prog">${st.q === 5 ? progList(st)[progIdx % progList(st).length] : "Eco 50°"}</span>`;

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

function couvertView(ctx, st) {
  const gg = st.gezinsgrootte;
  if (!gg) return {};
  const min = gezinsgrootteMinCouverts[gg];
  const t = ctx.toPx(cx(st), g(st).yf, 1.02);
  return { svg: "", html: tag(t, min ? `<b>Minstens ${min} couverts</b> <span class="muted">per wasbeurt</span>` : "<b>Elk aantal couverts</b> <span class=\"muted\">is genoeg</span>") };
}

// geluidsgolven: meer bogen = meer toegestaan geluid; grenzen uit data.js
const SOUND = {
  belangrijk: { n: 2, tag: `<b>Liefst max. ${GELUID_BELANGRIJK_DB} dB</b> <span class="muted">zo stil als een bibliotheek</span>` },
  gemiddeld: { n: 4, tag: `<b>Max. ${GELUID_GEMIDDELD_DB} dB</b> <span class="muted">zachter dan een gesprek</span>` },
  niet: { n: 5, soft: true, tag: "<b>Geen eis</b> <span class=\"muted\">aan het geluid</span>" },
};
function waves(ctx, st) {
  const s = SOUND[st.geluid];
  if (!s) return {};
  const G = g(st), y = G.yf - 0.05, l = ctx.toPx(G.x0, y, 0.45), r = ctx.toPx(G.x1, y, 0.45);
  const w = r.x - l.x, a = 38 * Math.PI / 180;
  let svg = "";
  for (let i = 0; i < s.n; i++) {
    const rad = w * (0.1 + i * 0.075), dy = Math.sin(a) * rad, dx = Math.cos(a) * rad;
    const style = `style="animation-delay:${(i * 0.18).toFixed(2)}s"`, cls = `wave${s.soft ? " soft" : ""}`;
    svg += `<path class="${cls}" ${style} d="M${r.x + dx} ${r.y - dy} A${rad} ${rad} 0 0 1 ${r.x + dx} ${r.y + dy}"/>`;
    svg += `<path class="${cls}" ${style} d="M${l.x - dx} ${l.y - dy} A${rad} ${rad} 0 0 0 ${l.x - dx} ${l.y + dy}"/>`;
  }
  return { svg, html: tag(ctx.toPx(cx(st), G.yf, 1.02), s.tag) };
}

// energielabel: welke klassen doen mee (zoals applyEnergieFilter in matching.js)
const KLASSEN = [["A", "#00a651"], ["B", "#50b848"], ["C", "#bed630"], ["D", "#e8d400"], ["E", "#fdb913"], ["F", "#f37021"], ["G", "#ed1c24"]];
const TOEGESTAAN = { belangrijk: "AB", gemiddeld: "ABCD", niet: "ABCDEFG" };
function energieView(ctx, st) {
  if (!st.energie) return {};
  const ok = TOEGESTAAN[st.energie], G = g(st);
  const p = ctx.toPx(G.x1 + 0.08, G.yf, 0.6);
  // naast de vrijstaande is rechts weinig ruimte: dan links van het apparaat
  const left = kindOf(st) === "vs" ? ctx.toPx(G.x0 - 0.08, G.yf, 0.6).x - (ctx.mobile ? 128 : 168) : p.x;
  const rows = KLASSEN.map(([k, c], i) => `<div class="row ${ok.includes(k) ? "" : "off"}"><span class="bar" style="width:${34 + i * 13}px;background:${c}">${k}</span>${ok.includes(k) ? '<span class="ok">✓</span>' : ""}</div>`).join("");
  const note = { belangrijk: "Liefst A of B; zijn die er niet, dan ook C.", gemiddeld: "Klasse A t/m D.", niet: "Alle klassen doen mee." }[st.energie];
  return { svg: "", html: `<div class="elabel" style="left:${left}px;top:${p.y}px"><h6>Energieklasse</h6>${rows}<p>${note}</p></div>` };
}

function extraSpots(ctx, st) {
  const e = st.extra, G = g(st), c = cx(st), kind = kindOf(st);
  const open90 = p => door(st, p, 90);
  const pts = [];
  // bediening: inbouw op de bovenrand van de (open) deur, vrijstaand in de voorkant
  const panel = kind === "ib" ? open90([G.x0 + 0.08, -0.6, 0.862]) : [G.x0 + 0.1, G.yf - 0.05, 0.78];
  const panel2 = kind === "ib" ? open90([G.x1 - 0.05, -0.6, 0.862]) : [G.x0 + 0.7 - 0.25, G.yf - 0.05, 0.78];
  if (e.includes("kinderslot")) pts.push({ w: panel, label: "<b>Kinderslot</b>: knoppen vergrendeld" });
  if (e.includes("wifi")) pts.push({ w: panel2, label: "<b>Wifi</b>: starten en meldingen via de app" });
  if (e.includes("verstelbare-bovenkorf")) pts.push({ w: [G.x1 - 0.03, G.yf - 0.1, 0.58], label: "<b>Verstelbare bovenkorf</b>: ruimte voor grote borden" });
  if (e.includes("halve-lading")) pts.push({ w: [c + 0.05, G.yf - 0.05, 0.64], label: "<b>Halve lading</b>: alleen de bovenkorf wassen" });
  if (e.includes("glasbescherming")) pts.push({ w: [G.x0 + 0.1, G.yf - 0.05, 0.57], label: "<b>Glasbescherming</b>: zachter voor glaswerk" });
  if (e.includes("extra-droog")) pts.push({ w: [c, G.yf + 0.1, G.top - 0.03], label: "<b>Extra droog</b>: hogere droogklasse" });
  if (e.includes("inverter")) pts.push({ w: [c, -0.32, 0.12], label: "<b>Invertermotor</b>: stiller en slijtvaster" });
  if (e.includes("aquastop")) pts.push({ w: [G.x1 - 0.05, G.yf - 0.03, 0.05], label: "<b>AquaStop</b>: sluit het water af bij een lek" });
  return spots(ctx, pts, G.x1 + 0.02, G.yf);
}

function lens(ctx, st) {
  const c = dispCorners(st), m = c.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4, a[2] + p[2] / 4], [0, 0, 0]);
  const from = ctx.toPx(...m), G = g(st);
  // rechts van de inbouw; bij vrijstaand links (rechts is het beeld bijna op)
  const vs = kindOf(st) === "vs";
  const at = vs ? ctx.toPx(G.x0 - 0.05, G.yf, 0.78) : ctx.toPx(G.x1 + 0.05, G.yf, 0.78);
  const W_ = ctx.mobile ? 190 : 250;
  const x = vs ? at.x - W_ - (ctx.mobile ? 8 : 24) : at.x + (ctx.mobile ? 8 : 24);
  const l = progList(st), i = progIdx % l.length;
  const svg = `<line x1="${from.x}" y1="${from.y}" x2="${vs ? x + W_ : x}" y2="${at.y}" class="leader"/>`;
  const html = `<div class="spot is-on" style="left:${from.x}px;top:${from.y}px"></div><div class="lens" style="left:${x}px;top:${at.y}px"><div class="scr"><div class="prog">${l[i]}</div>
    <div class="meta"><span>${st.programma.filter(p => PROG[p]).length ? "Jouw programma's" : "Standaardprogramma's"}</span><span>${i + 1}/${l.length}</span></div>
    <div class="dots">${l.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("")}</div></div>
    <p>Zo kies je straks je programma op het display.</p></div>`;
  return { svg, html };
}

let disp, quiz;
function setup(scene) {
  disp = document.createElement("div");
  disp.className = "wdisp";
  scene.querySelector(".layers").after(disp);
  setInterval(() => {
    if (!quiz || quiz.st.q !== 5 || document.hidden) return;
    progIdx += 1;
    quiz.render();
  }, 1600);
}

function afterRender(ctx) {
  const st = ctx.st, html = dispHTML(st);
  if (disp.innerHTML !== html) disp.innerHTML = html;
  // het display is alleen te zien als de deur dicht is (vrijstaand) of op een kier staat (inbouw)
  const show = kindOf(st) === "vs" ? ![1, 4].includes(st.q) : st.q === 5;
  disp.style.opacity = show ? "1" : "0";
  placeQuad(disp, 300, kindOf(st) === "vs" ? 86 : 65, dispCorners(st).map(p => ctx.toPx(...p)));
}

quiz = createQuiz3D({
  camera,
  steps: 6,
  state: { plaatsing: null, gezinsgrootte: null, geluid: null, energie: null, extra: [], programma: [] },
  imgPath: n => `vaatwasser/vragen/img/${n}.webp`,
  question: st => Q[st.q],
  setup, afterRender,

  images(st) {
    const k = kindOf(st), size = st.gezinsgrootte ?? "gemiddeld";
    const state = st.q === 1 || st.q === 4 ? `open-${size}` : st.q === 5 && k === "ib" ? "kier" : "dicht";
    // bij vrijstaand zit er gewoon een keukenkastje in de nis
    return ["keuken", ...(k === "vs" ? ["kast"] : []), `${k}-${state}`];
  },

  onAnswer(st, id) { if (id === "programma") progIdx = 0; },

  focus: st => {
    const c = cx(st);
    return [
      { x: c, y: -0.6, z: 0.5, zoom: 1.3 },
      { x: c, y: -0.9, z: 0.35, zoom: 1.35 },
      { x: c, y: -0.6, z: 0.5, zoom: 1.35 },
      { x: c, y: -0.6, z: 0.5, zoom: 1.2, anchorX: kindOf(st) === "vs" ? 0.65 : 0.35 },
      { x: c, y: -0.9, z: 0.35, zoom: 1.35, anchorX: 0.32 },
      { x: c, y: -0.6, z: 0.75, zoom: 1.6, anchorX: kindOf(st) === "vs" ? 0.72 : 0.3 },
    ][st.q];
  },
  focusDesktop: st => {
    const c = cx(st), vs = kindOf(st) === "vs";
    return [
      { x: c, y: -0.6, z: 0.6, zoom: 1.15, anchorX: 0.64 },
      { x: c, y: -0.9, z: 0.45, zoom: 1.3, anchorX: 0.64 },
      { x: c, y: -0.6, z: 0.55, zoom: 1.25, anchorX: 0.64 },
      { x: c, y: -0.6, z: 0.55, zoom: 1.25, anchorX: vs ? 0.72 : 0.56 },
      { x: c, y: -0.9, z: 0.45, zoom: 1.3, anchorX: vs ? 0.7 : 0.55 },
      { x: c, y: -0.6, z: 0.75, zoom: 1.7, anchorX: vs ? 0.78 : 0.52 },
    ][st.q];
  },

  overlays(ctx) {
    const { st } = ctx;
    if (st.q === 0) return plaatsView(ctx, st);
    if (st.q === 1) return couvertView(ctx, st);
    if (st.q === 2) return waves(ctx, st);
    if (st.q === 3) return energieView(ctx, st);
    if (st.q === 4) return extraSpots(ctx, st);
    return lens(ctx, st);
  },

  hideCaption: (st, mobile) => !mobile && st.q === 4 && st.extra.some(e => e !== "geen"),

  caption(st) {
    switch (st.q) {
      case 0: return {
        inbouw: ["Inbouw", "Verdwijnt achter een keukenfront in de nis van je keuken."],
        vrijstaand: ["Vrijstaand", "Een eigen behuizing en bovenblad: kan overal staan, ook zonder nis."],
      }[st.plaatsing] ?? ["Jouw keuken", "Kies wat voor vaatwasser je zoekt; de keuken wisselt mee."];
      case 1: return {
        klein: ["1-2 personen", "Een kleinere afwas: elk aantal couverts volstaat."],
        gemiddeld: ["3-4 personen", "Minstens 13 couverts: dan past de afwas van een dag in één keer."],
        groot: ["5 of meer personen", "Minstens 15 couverts. Zulke vaatwassers hebben vaak een besteklade bovenin."],
      }[st.gezinsgrootte] ?? ["Couverts", "Kies voor hoeveel personen je de afwas doet."];
      case 2: return {
        belangrijk: ["Zo stil mogelijk", `We zoeken modellen tot ${GELUID_BELANGRIJK_DB} dB. Zijn die er niet, dan tot ${GELUID_BELANGRIJK_FALLBACK_DB} dB.`],
        gemiddeld: ["Redelijk stil", `We laten de luidste modellen weg: maximaal ${GELUID_GEMIDDELD_DB} dB.`],
        niet: ["Geluid maakt niet uit", "We letten niet op het geluid; dat geeft de meeste keuze."],
      }[st.geluid] ?? ["Geluid", "Kies hoe stil de vaatwasser moet zijn."];
      case 3: return {
        belangrijk: ["Zo zuinig mogelijk", "We zoeken energieklasse A of B; zijn die er niet, dan ook C."],
        gemiddeld: ["Redelijk zuinig", "We laten de minst zuinige klassen (E t/m G) weg."],
        niet: ["Maakt niet uit", "Alle energieklassen doen mee."],
      }[st.energie] ?? ["Energie", "Kies hoe belangrijk een zuinige vaatwasser is."];
      case 4: return st.extra.includes("geen") ? ["Geen extra wensen", "We kijken dan naar plaatsing, couverts, geluid en energie."] : ["Extra's", "Vink aan wat je belangrijk vindt; het verschijnt op de vaatwasser."];
      default: return st.programma.some(p => PROG[p]) ? ["Jouw programma's", "Alleen vaatwassers met deze programma's komen in je advies."] : st.programma.includes("geen") ? ["Geen specifieke wensen", "Elke vaatwasser heeft standaardprogramma's zoals eco en auto."] : ["Afwasprogramma's", "Kies welke programma's je zeker wilt hebben."];
    }
  },

  async finish(st) {
    const answers = { gezinsgrootte: st.gezinsgrootte ?? "", geluid: st.geluid ?? "", energie: st.energie ?? "", extraAnswers: st.extra, programmaAnswers: st.programma, plaatsing: st.plaatsing };
    const raw = await productsPromise;
    const result = matchVaatwassers(normalizeProducts(raw ?? []), answers);
    localStorage.setItem("vaatwasser_bestMatch", JSON.stringify(result.bestMatch));
    localStorage.setItem("vaatwasser_bestType", result.bestType ?? "");
    localStorage.setItem("vaatwasser_filteredMatchedVaatwassers", JSON.stringify(result.filteredMatchedVaatwassers));
    localStorage.setItem("vaatwasser_answers", JSON.stringify(answers));
    localStorage.setItem("vaatwasser_selectedPlaatsing", st.plaatsing ?? "");
    window.location.href = "vaatwasser/resultaat";
  },

  preload: ["ib-dicht", "ib-open-gemiddeld", "kast", "vs-dicht", "ib-open-klein", "ib-open-groot", "ib-kier", "vs-open-gemiddeld", "vs-open-klein", "vs-open-groot"],
});
