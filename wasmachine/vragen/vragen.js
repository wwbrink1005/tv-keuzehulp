// Testversie van de wasmachine-vragenpagina in een 3D-bijkeuken. Basisrender = de
// ruimte (hoge kast, plank, plant); de wasmachine (7, 9 of 10 kg, of een bovenlader)
// en de wasmanden zijn transparante lagen (render/scene.py). Het display van de
// machine tekent de pagina zelf in perspectief op het zwarte glas.
// Motor: shared/quiz3d.js.
import { createQuiz3D, makeCamera, placeQuad } from "../../shared/quiz3d.js";
import { matchWasmachines } from "../js/matching.js";
import { normalizeProducts } from "../js/utils.js";
import { fetchProducts } from "../js/supabase.js";
import { capaciteitGroupToAllowedCapaciteit } from "../js/data.js";

const camera = makeCamera({ camY: -2.9, camZ: 1.2, shiftX: -0.08, shiftY: -0.11 });
const productsPromise = fetchProducts().catch(() => null);

// zelfde bereiken als de matching (data.js), geen losse getallen
const KG = Object.fromEntries(Object.entries(capaciteitGroupToAllowedCapaciteit).map(([g, r]) =>
  [g, r.displayMin === r.displayMax ? `${r.displayMin} kg` : `${r.displayMin}-${r.displayMax} kg`]));

// geometrie (m) zoals in render/scene.py: voorlader 60 cm breed, 85 cm hoog, achterkant op y = -0.03
const DEPTH = { klein: 0.50, gemiddeld: 0.58, groot: 0.64 };
const LAYER = { klein: "wm-7", gemiddeld: "wm-9", groot: "wm-10" };
const isTop = st => st.q >= 2 && st.capaciteitGroup === "klein" && st.extra.includes("bovenlader");
const yf = st => -0.03 - (DEPTH[st.capaciteitGroup] ?? DEPTH.gemiddeld);
// display: voorlader op de bedieningsstrook, bovenlader op het paneel achter het deksel
function dispCorners(st) {
  if (isTop(st)) { const y = -0.192, z0 = 0.912, z1 = 0.936; return [[-0.06, y, z1], [0.08, y, z1], [0.08, y, z0], [-0.06, y, z0]]; }
  const y = yf(st) - 0.0045, z0 = 0.728, z1 = 0.772;
  return [[0.07, y, z1], [0.2, y, z1], [0.2, y, z0], [0.07, y, z0]];
}

const Q = [
  {
    id: "capaciteitGroup", type: "radio",
    title: "Voor hoeveel personen was je?",
    sub: "De wasmachine en de berg was groeien mee.",
    why: "De grootte van je huishouden bepaalt hoeveel capaciteit (kg) je nodig hebt. Voor 1-2 personen is 6-7 kg ruim voldoende. Bij 3-4 personen past 8-9 kg beter bij de hoeveelheid was per week. Bij 5 of meer personen (of veel was, bijv. door kinderen of sport) is 10 kg of meer aan te raden, zo hoef je minder vaak te wassen.",
    options: [{ v: "klein", label: "1-2 personen", price: "€" }, { v: "gemiddeld", label: "3-4 personen", price: "€€" }, { v: "groot", label: "5 of meer personen, of veel was per week", price: "€€€" }],
  },
  {
    id: "geluid", type: "radio",
    title: "Hoe belangrijk is een stille wasmachine?",
    sub: "Zie hoeveel geluid er bij centrifugeren mag zijn.",
    why: "Het geluidsniveau tijdens centrifugeren varieert flink tussen wasmachines. Woon je in een appartement, heeft de wasmachine een plek dicht bij de woonkamer/slaapkamer, of vind je het gewoon belangrijk? Dan zoeken we gericht naar stillere modellen (lager dB-niveau).",
    options: [{ v: "belangrijk", label: "Erg belangrijk, moet stil zijn", price: "€€€" }, { v: "gemiddeld", label: "Een beetje belangrijk", price: "€€" }, { v: "niet", label: "Niet belangrijk", price: "€" }],
  },
  {
    id: "extra", type: "check", exclusive: "geen",
    title: "Welke van de volgende mag niet ontbreken?",
    sub: "Je keuzes verschijnen op de wasmachine.",
    why: "Energiezuinig betekent een lager verbruik op je energierekening. Een uitgestelde start laat je de wasmachine op een later tijdstip laten starten, bijvoorbeeld 's nachts voor een lagere stroomprijs. Een kinderslot voorkomt dat kinderen de instellingen wijzigen. AquaStop beschermt tegen waterschade bij een lekkage. Een invertermotor is stiller en gaat langer mee. Je kunt meerdere opties aanvinken.",
    options: [
      { v: "energiezuinig", label: "Energiezuinig", price: "€€" },
      { v: "uitgestelde-start", label: "Uitgestelde start", price: "€€" },
      { v: "kinderslot", label: "Knoppen vergrendelen (kinderslot)", price: "€€" },
      { v: "aquastop", label: "Lekkagebescherming (AquaStop)", price: "€€" },
      { v: "inverter", label: "Stille, duurzame invertermotor", price: "€€" },
      // bovenladers bestaan in de catalogus alleen bij 1-2 personen (zie wasmachine/js/quiz.js)
      { v: "bovenlader", label: "Bovenlader (compacter, smal model)", price: "€€", when: st => st.capaciteitGroup === "klein" },
      { v: "geen", label: "Geen extra wensen", price: "€" },
    ],
  },
  {
    id: "programma", type: "check", exclusive: "geen",
    title: "Welke wasprogramma's wil je zeker hebben?",
    sub: "Het display laat je programma's zien.",
    why: "Niet elke wasmachine heeft dezelfde programma's. Een wolprogramma is zachter voor kwetsbare kleding, sport verwijdert zweetgeur beter, stoom frist kleding op zonder wassen, allergie/hygiëne wast op hogere temperatuur tegen huisstofmijt en bacteriën, en jeans- of babyprogramma's zijn afgestemd op die specifieke was. Je kunt meerdere opties aanvinken.",
    options: [
      { v: "wol", label: "Wol", price: "€€" }, { v: "sport", label: "Sport", price: "€€" }, { v: "stoom", label: "Stoom", price: "€€€" },
      { v: "allergie", label: "Allergie/hygiëne", price: "€€" }, { v: "jeans", label: "Jeans", price: "€€" }, { v: "baby", label: "Babyverzorging", price: "€€" },
      { v: "geen", label: "Geen specifieke wensen", price: "€" },
    ],
  },
];

// ───────── display ─────────
const ICON = {
  eco: `<svg viewBox="0 0 24 24"><path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14"/><path d="M5 19c3-4 6-7 9-9"/></svg>`,
  klok: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>`,
  slot: `<svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>`,
};
const PROG = { wol: "Wol 30°", sport: "Sport 40°", stoom: "Stoom", allergie: "Allergie 60°", jeans: "Jeans 40°", baby: "Baby 60°" };
const progList = st => { const l = st.programma.filter(p => PROG[p]).map(p => PROG[p]); return l.length ? l : ["Katoen 40°", "Eco 40-60"]; };
let progIdx = 0;

function dispHTML(st) {
  switch (st.q) {
    case 0: return st.capaciteitGroup ? `<span class="big">${KG[st.capaciteitGroup].replace(" kg", "")}<small>kg</small></span>` : `<span class="big">1:59</span>`;
    case 1: return `<span class="big">1400<small>t/min</small></span>`;
    case 2: {
      const ic = [st.extra.includes("energiezuinig") && ICON.eco, st.extra.includes("uitgestelde-start") && ICON.klok, st.extra.includes("kinderslot") && ICON.slot].filter(Boolean);
      const t = st.extra.includes("uitgestelde-start") ? `<span class="big">3:00<small>u</small></span>` : `<span class="big">40°</span>`;
      return ic.join("") + t;
    }
    default: { const l = progList(st); return `<span class="big prog">${l[progIdx % l.length]}</span>`; }
  }
}

// ───────── overlays ─────────
// punten met een vaste plek op de machine; labels in een kolom rechts, nooit over elkaar
function spots(ctx, pts, edgeX) {
  let svg = "", html = "";
  if (!pts.length) return { svg, html };
  const placed = pts.map(p => ({ ...p, px: ctx.toPx(p.x, p.y, p.z) }));
  const labelX = ctx.toPx(edgeX, placed[0].y, 0.5).x + (ctx.mobile ? 14 : 26);
  const gap = ctx.mobile ? 26 : 34;
  const ys = placed.map(d => d.px.y);
  for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + gap);
  const overflow = ys[ys.length - 1] - (ctx.height - 20);
  if (overflow > 0) for (let i = 0; i < ys.length; i++) ys[i] -= overflow;
  for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] - gap);
  placed.forEach((d, i) => {
    svg += `<line x1="${d.px.x}" y1="${d.px.y}" x2="${labelX}" y2="${ys[i]}" class="leader"/>`;
    html += `<div class="spot is-on" style="left:${d.px.x}px;top:${d.px.y}px"></div>`;
    // op mobiel alleen de naam, anders loopt het label uit beeld
    html += `<div class="spot-label is-on" style="left:${labelX}px;top:${ys[i]}px">${ctx.mobile ? d.label.split(":")[0] : d.label}</div>`;
  });
  return { svg, html };
}

// geluidsgolven links en rechts van de machine: meer bogen = meer toegestaan geluid
const SOUND = {
  belangrijk: { n: 2, tag: "<b>Liefst max. 60 dB</b> <span class=\"muted\">zo luid als een gesprek</span>" },
  gemiddeld: { n: 5, tag: "<b>Max. 74 dB</b> <span class=\"muted\">zo luid als een stofzuiger</span>" },
  niet: { n: 6, soft: true, tag: "<b>Geen eis</b> <span class=\"muted\">aan het geluid</span>" },
};
function waves(ctx, st) {
  const s = SOUND[st.geluid];
  if (!s) return { svg: "", html: "" };
  const y = yf(st), l = ctx.toPx(-0.3, y, 0.45), r = ctx.toPx(0.3, y, 0.45);
  const w = r.x - l.x, a = 38 * Math.PI / 180;
  let svg = "";
  for (let i = 0; i < s.n; i++) {
    const rad = w * (0.1 + i * 0.075), dy = Math.sin(a) * rad, dx = Math.cos(a) * rad;
    const style = `style="animation-delay:${(i * 0.18).toFixed(2)}s"`, cls = `wave${s.soft ? " soft" : ""}`;
    svg += `<path class="${cls}" ${style} d="M${r.x + dx} ${r.y - dy} A${rad} ${rad} 0 0 1 ${r.x + dx} ${r.y + dy}"/>`;
    svg += `<path class="${cls}" ${style} d="M${l.x - dx} ${l.y - dy} A${rad} ${rad} 0 0 0 ${l.x - dx} ${l.y + dy}"/>`;
  }
  const t = ctx.toPx(0, y, 1.0);
  return { svg, html: `<div class="tag is-on" style="left:${t.x}px;top:${t.y}px">${s.tag}</div>` };
}

function extraSpots(ctx, st) {
  const e = st.extra, top = isTop(st), y = top ? -0.63 : yf(st);
  const pts = [];
  if (top && e.includes("bovenlader")) pts.push({ x: 0.05, y: -0.4, z: 0.9, label: "<b>Bovenlader</b>: 40 cm smal, vullen van boven" });
  const dx = top ? [-0.03, 0.01, 0.05] : [0.1, 0.14, 0.18], dy = top ? -0.192 : y - 0.004, dz = top ? 0.9 : 0.705;   // net onder het display, zodat de iconen zichtbaar blijven
  // volgorde van boven naar beneden zo gekozen dat de lijntjes elkaar niet kruisen
  if (e.includes("kinderslot")) pts.push({ x: top ? dx[2] : 0.25, y: dy, z: top ? dz : 0.75, label: "<b>Kinderslot</b>: knoppen vergrendeld" });
  if (e.includes("uitgestelde-start")) pts.push({ x: dx[1], y: dy, z: dz, label: "<b>Uitgestelde start</b>: starten wanneer het jou uitkomt" });
  if (e.includes("energiezuinig")) pts.push({ x: dx[0], y: dy, z: dz, label: "<b>Energiezuinig</b>: lager verbruik per wasbeurt" });
  if (e.includes("inverter")) pts.push({ x: 0, y: top ? -0.35 : y + 0.25, z: top ? 0.5 : 0.4, label: "<b>Invertermotor</b>: stiller en slijtvaster" });
  if (e.includes("aquastop")) pts.push({ x: top ? 0.14 : 0.24, y, z: 0.07, label: "<b>AquaStop</b>: sluit het water af bij een lek" });
  return spots(ctx, pts, top ? 0.2 : 0.3);
}

// vergroting van het display met de gekozen programma's
function lens(ctx, st) {
  // naast de machine, op de hoogte van het display; lijntje vanaf de rechterrand van het display
  const c = dispCorners(st), zm = (c[0][2] + c[2][2]) / 2, from = ctx.toPx(c[1][0], c[0][1], zm);
  const at = ctx.toPx(isTop(st) ? 0.24 : 0.34, c[0][1], zm);
  at.x += ctx.mobile ? 12 : 36;
  const l = progList(st), i = progIdx % l.length;
  const svg = `<line x1="${from.x}" y1="${from.y}" x2="${at.x}" y2="${at.y}" class="leader"/>`;
  const html = `<div class="lens" style="left:${at.x}px;top:${at.y}px"><div class="scr"><div class="prog">${l[i]}</div>
    <div class="meta"><span>${st.programma.filter(p => PROG[p]).length ? "Jouw programma's" : "Standaardprogramma's"}</span><span>${i + 1}/${l.length}</span></div>
    <div class="dots">${l.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("")}</div></div>
    <p>Draai aan de knop: dit staat straks op je display.</p></div>`;
  return { svg, html };
}

let disp, quiz;
function setup(scene) {
  disp = document.createElement("div");
  disp.className = "wdisp";
  scene.querySelector(".layers").after(disp);
  // programma's rouleren op het display (vraag 4)
  setInterval(() => {
    if (!quiz || quiz.st.q !== 3 || document.hidden) return;
    progIdx += 1;
    quiz.render();
  }, 1600);
}

function afterRender(ctx) {
  const { st } = ctx;
  const html = dispHTML(st);
  if (disp.innerHTML !== html) disp.innerHTML = html;
  const top = isTop(st);
  placeQuad(disp, top ? 560 : 300, top ? 96 : 102, dispCorners(st).map(p => ctx.toPx(...p)));
}

quiz = createQuiz3D({
  camera,
  steps: 4,
  state: { capaciteitGroup: null, geluid: null, extra: [], programma: [] },
  imgPath: n => `wasmachine/vragen/img/${n}.webp`,
  question: st => Q[st.q],
  setup, afterRender,

  images(st) {
    const g = st.capaciteitGroup;
    const list = ["bijkeuken", isTop(st) ? "top" : (LAYER[g] ?? "wm-9")];
    // de berg was per week, alleen bij de capaciteitsvraag
    if (st.q === 0 && g) list.push(...["mand1", "mand2", "mand3"].slice(0, { klein: 1, gemiddeld: 2, groot: 3 }[g]));
    return list;
  },

  onAnswer(st, id) { if (id === "capaciteitGroup" && st.capaciteitGroup !== "klein") st.extra = st.extra.filter(v => v !== "bovenlader"); if (id === "programma") progIdx = 0; },
  onBack(st) { if (st.q < 2) st.extra = st.extra.filter(v => v !== "bovenlader"); },

  focus: st => st.q === 0 ? { x: 0.42, y: -0.5, z: 0.45, zoom: 1.2 } : st.q === 2 ? { x: 0, y: -0.5, z: 0.5, zoom: 1.45, anchorX: 0.33 } : st.q === 1 ? { x: 0, y: -0.5, z: 0.5, zoom: 1.4 } : { x: 0.28, y: -0.5, z: 0.52, zoom: 1.6 },
  focusDesktop: st => [
    { x: 0.55, y: -0.5, z: 0.5, zoom: 1.2, anchorX: 0.66 },
    { x: 0, y: -0.5, z: 0.5, zoom: 1.3, anchorX: 0.66 },
    { x: 0.25, y: -0.5, z: 0.5, zoom: 1.5, anchorX: 0.57 },
    { x: 0.25, y: -0.5, z: 0.55, zoom: 1.5, anchorX: 0.6 },
  ][st.q],

  overlays(ctx) {
    const { st } = ctx;
    if (st.q === 0 && st.capaciteitGroup) {
      const t = ctx.toPx(0, yf(st), 0.98);
      return { svg: "", html: `<div class="tag is-on" style="left:${t.x}px;top:${t.y}px">Trommel <b>${KG[st.capaciteitGroup]}</b></div>` };
    }
    if (st.q === 1) return waves(ctx, st);
    if (st.q === 2) return extraSpots(ctx, st);
    if (st.q === 3) return lens(ctx, st);
    return {};
  },

  hideCaption: (st, mobile) => st.q === 2 && !mobile && st.extra.some(e => e !== "geen"),

  caption(st) {
    switch (st.q) {
      case 0: return {
        klein: ["1-2 personen", `Weinig was per week: een trommel van ${KG.klein} is ruim genoeg.`],
        gemiddeld: ["3-4 personen", `Meer was per week: ${KG.gemiddeld} past daar beter bij.`],
        groot: ["5 of meer personen", `Met een trommel van ${KG.groot} hoef je minder vaak te wassen.`],
      }[st.capaciteitGroup] ?? ["Jouw bijkeuken", "Kies voor hoeveel personen je wast; de machine en de berg was wisselen mee."];
      case 1: return {
        belangrijk: ["Zo stil mogelijk", "We zoeken modellen tot 60 dB tijdens centrifugeren. Zijn die er niet, dan tot 68 dB."],
        gemiddeld: ["Redelijk stil", "We laten de luidste modellen weg: maximaal 74 dB tijdens centrifugeren."],
        niet: ["Geluid maakt niet uit", "We letten niet op het geluid; dat geeft de meeste keuze."],
      }[st.geluid] ?? ["Geluid", "Kies hoe stil de wasmachine moet zijn tijdens centrifugeren."];
      case 2: return st.extra.includes("geen") ? ["Geen extra wensen", "We kijken dan alleen naar capaciteit, geluid en prijs."] : ["Extra's", "Vink aan wat je belangrijk vindt; het verschijnt op de wasmachine."];
      default: return st.programma.some(p => PROG[p]) ? ["Jouw programma's", "Alleen wasmachines met deze programma's komen in je advies."] : st.programma.includes("geen") ? ["Geen specifieke wensen", "Elke wasmachine heeft de standaardprogramma's zoals katoen en eco."] : ["Wasprogramma's", "Kies welke programma's je zeker wilt hebben."];
    }
  },

  async finish(st) {
    const answers = { geluid: st.geluid ?? "", extraAnswers: st.extra, programmaAnswers: st.programma };
    const raw = await productsPromise;
    const result = matchWasmachines(normalizeProducts(raw ?? []), st.capaciteitGroup, null, answers);
    localStorage.setItem("wasmachine_bestMatch", JSON.stringify(result.bestMatch));
    localStorage.setItem("wasmachine_bestType", result.bestType ?? "");
    localStorage.setItem("wasmachine_filteredMatchedWasmachines", JSON.stringify(result.filteredMatchedWasmachines));
    localStorage.setItem("wasmachine_answers", JSON.stringify(answers));
    localStorage.setItem("wasmachine_selectedCapaciteitGroup", st.capaciteitGroup ?? "");
    window.location.href = "wasmachine/resultaat/";
  },

  preload: ["wm-9", "wm-7", "wm-10", "mand1", "mand2", "mand3", "top"],
});
