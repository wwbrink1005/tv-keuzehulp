// Testversie van de wasdroger-vragenpagina in de 3D-bijkeuken. Basisrender = de
// ruimte met onderop een wasmachine en een stapelkit; de droger erbovenop (7, 9 of
// 10 kg) en de wasmanden zijn transparante lagen (render/scene.py). Het display van
// de droger tekent de pagina zelf in perspectief op het zwarte glas.
// Motor: shared/quiz3d.js.
import { createQuiz3D, makeCamera, placeQuad } from "../../shared/quiz3d.js";
import { matchWasdrogers } from "../js/matching.js";
import { normalizeProducts } from "../js/utils.js";
import { fetchProducts } from "../js/supabase.js";
import { capaciteitGroupToAllowedCapaciteit } from "../js/data.js";

const camera = makeCamera({ camY: -3.3, camZ: 1.35, shiftX: -0.08, shiftY: -0.075 });
const productsPromise = fetchProducts().catch(() => null);

// zelfde bereiken als de matching (data.js), geen losse getallen
const KG = Object.fromEntries(Object.entries(capaciteitGroupToAllowedCapaciteit).map(([g, r]) =>
  [g, r.displayMin === r.displayMax ? `${r.displayMin} kg` : `${r.displayMin}-${r.displayMax} kg`]));

// geometrie (m) zoals in render/scene.py: droger 60 × 85 cm op een stapelkit van 87,2 cm hoog
const Z0 = 0.872;
const DEPTH = { klein: 0.58, gemiddeld: 0.62, groot: 0.66 };
const LAYER = { klein: "wd-7", gemiddeld: "wd-9", groot: "wd-10" };
const yf = st => -0.03 - (DEPTH[st.capaciteitGroup] ?? DEPTH.gemiddeld);
const DOOR_Z = Z0 + 0.42;
function dispCorners(st) {
  const y = yf(st) - 0.0045, z0 = Z0 + 0.734, z1 = Z0 + 0.776;
  return [[0.08, y, z1], [0.2, y, z1], [0.2, y, z0], [0.08, y, z0]];
}

const Q = [
  {
    id: "capaciteitGroup", type: "radio",
    title: "Voor hoeveel personen droog je?",
    sub: "De droger en de berg was groeien mee.",
    why: "De grootte van je huishouden bepaalt hoeveel droogcapaciteit (kg) je nodig hebt. Voor 1-2 personen is 6-7 kg ruim voldoende. Bij 3-4 personen past 8-9 kg beter bij de hoeveelheid was per week. Bij 5 of meer personen (of veel was, bijv. door kinderen of sport) is 10 kg of meer aan te raden, zo hoef je minder vaak te drogen.",
    options: [{ v: "klein", label: "1-2 personen", price: "€" }, { v: "gemiddeld", label: "3-4 personen", price: "€€" }, { v: "groot", label: "5 of meer personen, of veel was per week", price: "€€€" }],
  },
  {
    id: "geluid", type: "radio",
    title: "Hoe belangrijk is een stille wasdroger?",
    sub: "Zie hoeveel geluid er tijdens het drogen mag zijn.",
    why: "Het geluidsniveau tijdens het drogen varieert flink tussen wasdrogers. Woon je in een appartement, staat de wasdroger dicht bij de woonkamer/slaapkamer, of vind je het gewoon belangrijk? Dan zoeken we gericht naar stillere modellen (lager dB-niveau).",
    options: [{ v: "belangrijk", label: "Erg belangrijk, moet stil zijn", price: "€€€" }, { v: "gemiddeld", label: "Een beetje belangrijk", price: "€€" }, { v: "niet", label: "Niet belangrijk", price: "€" }],
  },
  {
    id: "extra", type: "check", exclusive: "geen",
    title: "Welke van de volgende mag niet ontbreken?",
    sub: "Je keuzes verschijnen op de droger.",
    why: "Energiezuinig betekent een lager verbruik op je energierekening. Een uitgestelde start laat je de wasdroger op een later tijdstip laten starten, bijvoorbeeld 's nachts voor een lagere stroomprijs. Een kinderslot voorkomt dat kinderen de instellingen wijzigen. Wifi-bediening laat je de droger op afstand bedienen via een app. Een anti-kreukfunctie voorkomt kreukels als je de was niet meteen uithaalt. Een vochtsensor stopt automatisch zodra het wasgoed droog genoeg is, in plaats van op een vaste tijd. Je kunt meerdere opties aanvinken.",
    options: [
      { v: "energiezuinig", label: "Energiezuinig", price: "€€" },
      { v: "uitgestelde-start", label: "Uitgestelde start", price: "€€" },
      { v: "kinderslot", label: "Knoppen vergrendelen (kinderslot)", price: "€€" },
      { v: "wifi", label: "Bediening op afstand (wifi/app)", price: "€€" },
      { v: "antikreuk", label: "Anti-kreukfunctie", price: "€€" },
      { v: "vochtsensor", label: "Vochtsensor", price: "€€" },
      { v: "geen", label: "Geen extra wensen", price: "€" },
    ],
  },
  {
    id: "programma", type: "check", exclusive: "geen",
    title: "Welke droogprogramma's wil je zeker hebben?",
    sub: "Het display laat je programma's zien.",
    why: "Niet elke wasdroger heeft dezelfde programma's. Een wolprogramma droogt kwetsbare kleding op lage temperatuur, sport verwijdert zweetgeur beter, stoom frist kleding op zonder wassen, allergie/hygiëne droogt op hogere temperatuur tegen huisstofmijt en bacteriën, en jeans- of babyprogramma's zijn afgestemd op die specifieke was. Je kunt meerdere opties aanvinken.",
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
  wifi: `<svg viewBox="0 0 24 24"><path d="M3 9.5a13 13 0 0 1 18 0"/><path d="M6.5 13a8 8 0 0 1 11 0"/><path d="M10 16.5a3 3 0 0 1 4 0"/><circle cx="12" cy="19.5" r=".8"/></svg>`,
};
const PROG = { wol: "Wol", sport: "Sport", stoom: "Stoom", allergie: "Hygiëne", jeans: "Jeans", baby: "Baby" };
const progList = st => { const l = st.programma.filter(p => PROG[p]).map(p => PROG[p]); return l.length ? l : ["Kastdroog", "Mix"]; };
let progIdx = 0;

function dispHTML(st) {
  switch (st.q) {
    case 0: return st.capaciteitGroup ? `<span class="big">${KG[st.capaciteitGroup].replace(" kg", "")}<small>kg</small></span>` : `<span class="big">2:45</span>`;
    case 1: return `<span class="big prog">Kastdroog</span>`;
    case 2: {
      const e = st.extra;
      const ic = [e.includes("energiezuinig") && ICON.eco, e.includes("wifi") && ICON.wifi, e.includes("uitgestelde-start") && ICON.klok, e.includes("kinderslot") && ICON.slot].filter(Boolean);
      const t = e.includes("uitgestelde-start") ? `<span class="big">3:00<small>u</small></span>` : ic.length > 2 ? "" : `<span class="big">2:45</span>`;
      return ic.join("") + t;
    }
    default: { const l = progList(st); return `<span class="big prog">${l[progIdx % l.length]}</span>`; }
  }
}

// ───────── overlays ─────────
// punten met een vaste plek op de droger; labels in een kolom rechts, nooit over elkaar
function spots(ctx, pts, edgeX) {
  let svg = "", html = "";
  if (!pts.length) return { svg, html };
  const placed = pts.map(p => ({ ...p, px: ctx.toPx(p.x, p.y, p.z) }));
  const labelX = ctx.toPx(edgeX, placed[0].y, 1).x + (ctx.mobile ? 14 : 26);
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

// geluidsgolven links en rechts van de droger: meer bogen = meer toegestaan geluid.
// Grenzen zoals applyGeluidFilter in wasdroger/js/matching.js (62 → 65 dB, 67 dB).
const SOUND = {
  belangrijk: { n: 2, tag: "<b>Liefst max. 62 dB</b> <span class=\"muted\">zo luid als een gesprek</span>" },
  gemiddeld: { n: 3, tag: "<b>Max. 67 dB</b> <span class=\"muted\">iets zachter dan een stofzuiger</span>" },
  niet: { n: 5, soft: true, tag: "<b>Geen eis</b> <span class=\"muted\">aan het geluid</span>" },
};
function waves(ctx, st) {
  const s = SOUND[st.geluid];
  if (!s) return { svg: "", html: "" };
  const y = yf(st), l = ctx.toPx(-0.3, y, DOOR_Z), r = ctx.toPx(0.3, y, DOOR_Z);
  const w = r.x - l.x, a = 38 * Math.PI / 180;
  let svg = "";
  for (let i = 0; i < s.n; i++) {
    const rad = w * (0.1 + i * 0.075), dy = Math.sin(a) * rad, dx = Math.cos(a) * rad;
    const style = `style="animation-delay:${(i * 0.18).toFixed(2)}s"`, cls = `wave${s.soft ? " soft" : ""}`;
    svg += `<path class="${cls}" ${style} d="M${r.x + dx} ${r.y - dy} A${rad} ${rad} 0 0 1 ${r.x + dx} ${r.y + dy}"/>`;
    svg += `<path class="${cls}" ${style} d="M${l.x - dx} ${l.y - dy} A${rad} ${rad} 0 0 0 ${l.x - dx} ${l.y + dy}"/>`;
  }
  const t = ctx.toPx(0, y, Z0 + 0.98);
  t.y = Math.max(t.y, 50);
  return { svg, html: `<div class="tag is-on" style="left:${t.x}px;top:${t.y}px">${s.tag}</div>` };
}

function extraSpots(ctx, st) {
  const e = st.extra, y = yf(st), dy = y - 0.004, dz = Z0 + 0.716;   // net onder het display, iconen blijven zichtbaar
  const pts = [];
  // volgorde van boven naar beneden zo gekozen dat de lijntjes elkaar niet kruisen
  if (e.includes("kinderslot")) pts.push({ x: 0.25, y: dy, z: Z0 + 0.755, label: "<b>Kinderslot</b>: knoppen vergrendeld" });
  if (e.includes("wifi")) pts.push({ x: 0.175, y: dy, z: dz, label: "<b>Wifi</b>: bedienen en meldingen via de app" });
  if (e.includes("uitgestelde-start")) pts.push({ x: 0.1, y: dy, z: dz, label: "<b>Uitgestelde start</b>: drogen wanneer het jou uitkomt" });
  if (e.includes("antikreuk")) pts.push({ x: 0, y: y + 0.3, z: DOOR_Z, label: "<b>Anti-kreuk</b>: trommel draait na afloop af en toe door" });
  if (e.includes("vochtsensor")) pts.push({ x: 0.1, y: y + 0.03, z: Z0 + 0.25, label: "<b>Vochtsensor</b>: stopt zodra de was droog is" });
  if (e.includes("energiezuinig")) pts.push({ x: 0.12, y, z: Z0 + 0.095, label: "<b>Energiezuinig</b>: lager verbruik per droogbeurt" });
  return spots(ctx, pts, 0.3);
}

// vergroting van het display met de gekozen programma's
function lens(ctx, st) {
  // naast de droger, op de hoogte van het display; lijntje vanaf de rechterrand van het display
  const c = dispCorners(st), zm = (c[0][2] + c[2][2]) / 2, from = ctx.toPx(c[1][0], c[0][1], zm);
  const at = ctx.toPx(0.34, c[0][1], zm);
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
  const html = dispHTML(ctx.st);
  if (disp.innerHTML !== html) disp.innerHTML = html;
  placeQuad(disp, 290, 102, dispCorners(ctx.st).map(p => ctx.toPx(...p)));
}

quiz = createQuiz3D({
  camera,
  steps: 4,
  state: { capaciteitGroup: null, geluid: null, extra: [], programma: [] },
  imgPath: n => `wasdroger/vragen-test/img/${n}.webp`,
  question: st => Q[st.q],
  setup, afterRender,

  images(st) {
    const g = st.capaciteitGroup;
    const list = ["bijkeuken", LAYER[g] ?? "wd-9"];
    // de berg was per week, alleen bij de capaciteitsvraag
    if (st.q === 0 && g) list.push(...["mand1", "mand2", "mand3"].slice(0, { klein: 1, gemiddeld: 2, groot: 3 }[g]));
    return list;
  },

  onAnswer(st, id) { if (id === "programma") progIdx = 0; },

  focus: st => [
    { x: 0.42, y: -0.5, z: 0.9, zoom: 1.15 },
    { x: 0, y: -0.5, z: 1.25, zoom: 1.35 },
    { x: 0, y: -0.5, z: 1.25, zoom: 1.4, anchorX: 0.33 },
    { x: 0.28, y: -0.5, z: 1.35, zoom: 1.6 },
  ][st.q],
  focusDesktop: st => [
    { x: 0.55, y: -0.5, z: 0.95, zoom: 1.0, anchorX: 0.66 },
    { x: 0, y: -0.5, z: 1.2, zoom: 1.3, anchorX: 0.66 },
    { x: 0.25, y: -0.5, z: 1.25, zoom: 1.5, anchorX: 0.57 },
    { x: 0.25, y: -0.5, z: 1.35, zoom: 1.5, anchorX: 0.6 },
  ][st.q],

  overlays(ctx) {
    const { st } = ctx;
    if (st.q === 0 && st.capaciteitGroup) {
      const t = ctx.toPx(0, yf(st), Z0 + 0.98);
      t.y = Math.max(t.y, 50);   // boven de droger is weinig ruimte: nooit buiten beeld
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
        klein: ["1-2 personen", `Weinig was per week: een droger van ${KG.klein} is ruim genoeg.`],
        gemiddeld: ["3-4 personen", `Meer was per week: ${KG.gemiddeld} past daar beter bij.`],
        groot: ["5 of meer personen", `Met een droger van ${KG.groot} hoef je minder vaak te drogen.`],
      }[st.capaciteitGroup] ?? ["Jouw bijkeuken", "Kies voor hoeveel personen je droogt; de droger en de berg was wisselen mee."];
      case 1: return {
        belangrijk: ["Zo stil mogelijk", "We zoeken drogers tot 62 dB. Zijn die er niet, dan tot 65 dB."],
        gemiddeld: ["Redelijk stil", "We laten de luidste drogers weg: maximaal 67 dB tijdens het drogen."],
        niet: ["Geluid maakt niet uit", "We letten niet op het geluid; dat geeft de meeste keuze."],
      }[st.geluid] ?? ["Geluid", "Kies hoe stil de droger moet zijn tijdens het drogen."];
      case 2: return st.extra.includes("geen") ? ["Geen extra wensen", "We kijken dan alleen naar capaciteit, geluid en prijs."] : ["Extra's", "Vink aan wat je belangrijk vindt; het verschijnt op de droger."];
      default: return st.programma.some(p => PROG[p]) ? ["Jouw programma's", "Alleen drogers met deze programma's komen in je advies."] : st.programma.includes("geen") ? ["Geen specifieke wensen", "Elke droger heeft de standaardprogramma's zoals katoen en mix."] : ["Droogprogramma's", "Kies welke programma's je zeker wilt hebben."];
    }
  },

  async finish(st) {
    const answers = { geluid: st.geluid ?? "", extraAnswers: st.extra, programmaAnswers: st.programma };
    const raw = await productsPromise;
    const result = matchWasdrogers(normalizeProducts(raw ?? []), st.capaciteitGroup, null, answers);
    localStorage.setItem("wasdroger_bestMatch", JSON.stringify(result.bestMatch));
    localStorage.setItem("wasdroger_bestType", result.bestType ?? "");
    localStorage.setItem("wasdroger_filteredMatchedWasdrogers", JSON.stringify(result.filteredMatchedWasdrogers));
    localStorage.setItem("wasdroger_answers", JSON.stringify(answers));
    localStorage.setItem("wasdroger_selectedCapaciteitGroup", st.capaciteitGroup ?? "");
    window.location.href = "wasdroger/resultaat";
  },

  preload: ["wd-9", "wd-7", "wd-10", "mand1", "mand2", "mand3"],
});
