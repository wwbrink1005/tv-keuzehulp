// Wasmachine-vragenpagina in een 3D-bijkeuken. Basisrender = de ruimte (hoge
// kast, plank, plant); de wasmachine (7, 9 of 10 kg) en de wasmanden zijn
// transparante lagen (render/scene.py). Het display van de machine tekent de
// pagina zelf in perspectief op het zwarte glas.
// Motor: shared/quiz3d.js. Uitleg van de matching: docs/wasmachine-keuzehulp-werking.md.
//
// Okt. 2026: nieuwe vragen (budget, stil, droog, programma's, extra's). De
// beelden zijn niet opnieuw gemaakt: bestaande beelden hangen nu aan het
// vraag-id i.p.v. het vraagnummer; de nieuwe vragen hebben nog geen eigen beeld.
import { createQuiz3D, makeCamera, placeQuad } from "../../shared/quiz3d.js";
import { matchWasmachines, heeftProgramma, EXTRA_KENMERK } from "../js/matching.js";
import { normalizeProducts, parsePrice } from "../js/utils.js";
import { fetchProducts } from "../js/supabase.js";
import { capaciteitGroupToAllowedCapaciteit, budgetCapsByCapaciteit, isCapaciteitInGroup } from "../js/data.js";

const camera = makeCamera({ camY: -2.9, camZ: 1.2, shiftX: -0.08, shiftY: -0.11 });
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

// zelfde bereiken als de matching (data.js), geen losse getallen
const KG = Object.fromEntries(Object.entries(capaciteitGroupToAllowedCapaciteit).map(([g, r]) =>
  [g, r.displayMin === r.displayMax ? `${r.displayMin} kg` : `${r.displayMin}-${r.displayMax} kg`]));

// geometrie (m) zoals in render/scene.py: voorlader 60 cm breed, 85 cm hoog, achterkant op y = -0.03
const DEPTH = { klein: 0.50, gemiddeld: 0.58, groot: 0.64 };
const LAYER = { klein: "wm-7", gemiddeld: "wm-9", groot: "wm-10" };
const yf = st => -0.03 - (DEPTH[st.capaciteitGroup] ?? DEPTH.gemiddeld);
// display op de bedieningsstrook
function dispCorners(st) {
  const y = yf(st) - 0.0045, z0 = 0.728, z1 = 0.772;
  return [[0.07, y, z1], [0.2, y, z1], [0.2, y, z0], [0.07, y, z0]];
}

// ───────── budget ─────────
const euro = n => "€" + Math.round(n).toLocaleString("nl-NL");
const budgetOpties = g => [...(budgetCapsByCapaciteit[g] ?? budgetCapsByCapaciteit.gemiddeld).map(c => ({ v: String(c), label: `Tot ${euro(c)}` })), { v: "geen", label: "Geen voorkeur" }];
const capVan = v => (v && v !== "geen" ? Number(v) : null);
let catalogus = null;
const vergelijkbaar = () => (catalogus ?? []).filter(w => (w.aanbieders ?? []).length >= 2);
function budgetCaption(st) {
  const cap = capVan(st.budget);
  if (!st.budget) return ["Jouw budget", "Kies wat je maximaal wilt uitgeven. Je krijgt de beste wasmachine binnen dat bedrag, en op de resultaatpagina zie je wat meer budget oplevert."];
  if (!catalogus) return [cap ? `Tot ${euro(cap)}` : "Geen voorkeur", cap ? "We zoeken de beste wasmachine binnen dit bedrag." : "We kiezen puur op je wensen."];
  const inGroep = vergelijkbaar().filter(w => isCapaciteitInGroup(w.capaciteit, st.capaciteitGroup));
  const prijzen = inGroep.map(w => parsePrice(w.prijs)).filter(Number.isFinite);
  if (!cap) return ["Geen voorkeur", `Alle ${inGroep.length} wasmachines die bij je huishouden passen doen mee, van ${euro(Math.min(...prijzen))} tot ${euro(Math.max(...prijzen))}.`];
  const binnen = prijzen.filter(p => p <= cap);
  if (!binnen.length) return [`Tot ${euro(cap)}`, "Binnen dit bedrag vonden we geen wasmachine. We tonen dan de wasmachines die het best bij je passen, net erboven."];
  return [`Tot ${euro(cap)}`, `${binnen.length} van de ${inGroep.length} wasmachines kosten ${euro(cap)} of minder, vanaf ${euro(Math.min(...binnen))}. We zoeken de beste die bij je wensen past.`];
}

const Q = [
  {
    id: "capaciteitGroup", type: "radio",
    title: "Voor hoeveel personen was je?",
    sub: "De wasmachine en de berg was groeien mee.",
    why: "De grootte van je huishouden bepaalt hoeveel kilo was er in één keer in moet. Voor 1-2 personen is 7 tot 9 kg ruim genoeg; bijna alle wasmachines zijn tegenwoordig 8 of 9 kg. Bij 3-4 personen past 8 tot 10 kg. Bij 5 of meer personen, of veel was (kinderen, sport), is 10 kg of meer handig: dan hoef je minder vaak te wassen.",
    options: [{ v: "klein", label: "1-2 personen", price: "€" }, { v: "gemiddeld", label: "3-4 personen", price: "€€" }, { v: "groot", label: "5 of meer personen, of veel was per week", price: "€€€" }],
  },
  {
    id: "budget", type: "radio",
    title: "Wat wil je maximaal uitgeven?",
    sub: "Je krijgt de beste wasmachine binnen je budget.",
    why: "Met je budget zoeken we de beste wasmachine die je ook echt wilt kopen. Past een wasmachine die nog beter bij je wensen past net niet binnen je bedrag, dan laten we dat op de resultaatpagina zien.",
    options: [],   // per huishouden, zie question() hieronder
  },
  {
    id: "stil", type: "radio",
    title: "Staat de wasmachine op een plek waar je last hebt van lawaai?",
    sub: "Zie hoeveel geluid er bij centrifugeren mag zijn.",
    why: "Tijdens het centrifugeren maakt een wasmachine het meeste lawaai: tussen ongeveer 70 en 76 dB. Staat hij dicht bij de woonkamer of slaapkamer, of in een appartement, dan zoeken we de stilste modellen.",
    options: [{ v: "ja", label: "Ja, liefst een stille wasmachine", price: "€€" }, { v: "nee", label: "Nee, niet per se", price: "€" }],
  },
  {
    id: "droog", type: "radio",
    title: "Wil je dat je was zo droog mogelijk uit de machine komt?",
    sub: "Het display laat het toerental zien.",
    why: "Hoe droog de was uit de trommel komt, staat op het energielabel als centrifugeer-droogklasse (A is het droogst). Droog je aan de lijn of op een rek, dan droogt de was met klasse A sneller. Gebruik je een droger, dan maakt het minder uit.",
    options: [{ v: "ja", label: "Ja, ik droog aan de lijn of op een rek", price: "€€" }, { v: "nee", label: "Nee, niet per se", price: "€" }],
  },
  {
    id: "programma", type: "check", exclusive: "geen",
    title: "Welke wasprogramma's wil je zeker hebben?",
    sub: "Het display laat je programma's zien.",
    why: "Katoen, synthetisch, wol, fijne was en eco heeft elke wasmachine. Allergie/hygiëne wast op hogere temperatuur tegen huisstofmijt en bacteriën. Sport verwijdert zweetgeur uit sportkleding. Outdoor/impregneren is voor regen- en skikleding. Dekbed/dons wast een dekbed of donsjas. Een snelwasprogramma frist een kleine lading op in 15 tot 30 minuten.",
    options: [
      { v: "allergie", label: "Allergie/hygiëne", price: "€€" }, { v: "sport", label: "Sport", price: "€€" },
      { v: "outdoor", label: "Outdoor/impregneren", price: "€€" }, { v: "dekbed", label: "Dekbed/dons", price: "€€" },
      { v: "snel", label: "Snelwas (15-30 minuten)", price: "€" },
      { v: "geen", label: "Geen specifieke wensen", price: "€" },
    ],
  },
  {
    id: "extra", type: "check", exclusive: "geen",
    title: "Wat is nog meer belangrijk voor jou?",
    sub: "Je keuzes verschijnen op de wasmachine.",
    why: "Met automatische dosering vul je het wasmiddel één keer bij en doseert de machine zelf: zuiniger met wasmiddel. Een stoomfunctie haalt kreukels en geurtjes uit kleding. Met de app bedien en volg je de wasmachine op je telefoon. AquaStop sluit het water af bij een lek en voorkomt waterschade. Een uitgestelde start en een kinderslot heeft vrijwel elke wasmachine.",
    options: [
      { v: "dosering", label: "Automatische dosering van wasmiddel", price: "€€€" },
      { v: "stoom", label: "Stoomfunctie tegen kreukels en geurtjes", price: "€€" },
      { v: "app", label: "Bediening met een app", price: "€€" },
      { v: "aquastop", label: "Lekbeveiliging (AquaStop)", price: "€€" },
      { v: "geen", label: "Geen extra wensen", price: "€" },
    ],
  },
];
const QID = st => Q[st.q]?.id;

// ───────── opties grijs als geen wasmachine ze waar kan maken ─────────
// Grijs als er binnen huishouden en budget geen wasmachine bij 2+ winkels is
// die het zeker heeft, samen met de eerdere wensen en wat al is aangevinkt.
const EIS = {
  programma: Object.fromEntries(["allergie", "sport", "outdoor", "dekbed", "snel"].map(p => [p, w => heeftProgramma(w, p) === true])),
  extra: Object.fromEntries(Object.entries(EXTRA_KENMERK).map(([k, f]) => [k, w => f(w) === true])),
};
function metBeschikbaarheid(st, id, opties) {
  if (!catalogus || !EIS[id]) return opties;
  const cap = capVan(st.budget);
  const alle = vergelijkbaar().filter(w => isCapaciteitInGroup(w.capaciteit, st.capaciteitGroup));
  const binnen = cap ? alle.filter(w => parsePrice(w.prijs) <= cap) : alle;
  const tot = Q.findIndex(q => q.id === id);
  return opties.map(o => {
    const eis = EIS[id][o.v];
    if (!eis) return o;
    let andere = [];
    Q.slice(0, tot).forEach(q => (Array.isArray(st[q.id]) ? st[q.id] : []).forEach(v => { if (EIS[q.id]?.[v]) andere.push(EIS[q.id][v]); }));
    (st[id] ?? []).filter(v => v !== o.v).forEach(v => { if (EIS[id][v]) andere.push(EIS[id][v]); });
    if (!binnen.some(w => andere.every(f => f(w)))) andere = [];
    if (binnen.some(w => eis(w) && andere.every(f => f(w)))) return o;
    const erboven = alle.filter(w => eis(w) && andere.every(f => f(w))).map(w => parsePrice(w.prijs));
    const note = cap && erboven.length ? `Niet tot ${euro(cap)}; wel vanaf ${euro(Math.min(...erboven))}.`
      : andere.length ? "Niet in combinatie met je andere keuzes."
      : "Niet in ons aanbod.";
    return { ...o, disabled: true, note };
  });
}

// ───────── display ─────────
const ICON = {
  eco: `<svg viewBox="0 0 24 24"><path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14"/><path d="M5 19c3-4 6-7 9-9"/></svg>`,
  klok: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>`,
  slot: `<svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>`,
};
const PROG = { allergie: "Allergie 60°", sport: "Sport 40°", outdoor: "Outdoor 40°", dekbed: "Dekbed 40°", snel: "Snel 15'" };
const progList = st => { const l = st.programma.filter(p => PROG[p]).map(p => PROG[p]); return l.length ? l : ["Katoen 40°", "Eco 40-60"]; };
let progIdx = 0;

function dispHTML(st) {
  switch (QID(st)) {
    case "capaciteitGroup": return st.capaciteitGroup ? `<span class="big">${KG[st.capaciteitGroup].replace(" kg", "")}<small>kg</small></span>` : `<span class="big">1:59</span>`;
    case "droog": return `<span class="big">${st.droog === "ja" ? 1600 : 1400}<small>t/min</small></span>`;
    case "budget":
    case "stil": return `<span class="big">1400<small>t/min</small></span>`;
    case "extra": return `<span class="big">40°</span>`;
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
  ja: { n: 2, tag: "<b>Zo stil mogelijk</b> <span class=\"muted\">rond 70 dB bij centrifugeren</span>" },
  nee: { n: 6, soft: true, tag: "<b>Geen eis</b> <span class=\"muted\">aan het geluid</span>" },
};
function waves(ctx, st) {
  const s = SOUND[st.stil];
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

// Alleen AquaStop heeft (nog) een vaste plek op de machine; de andere extra's
// krijgen een beeld van de visual agent.
function extraSpots(ctx, st) {
  const y = yf(st), pts = [];
  if (st.extra.includes("aquastop")) pts.push({ x: 0.24, y, z: 0.07, label: "<b>AquaStop</b>: sluit het water af bij een lek" });
  return spots(ctx, pts, 0.3);
}

// vergroting van het display met de gekozen programma's
function lens(ctx, st) {
  // naast de machine, op de hoogte van het display; lijntje vanaf de rechterrand van het display
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
  // programma's rouleren op het display (programmavraag)
  setInterval(() => {
    if (!quiz || QID(quiz.st) !== "programma" || document.hidden) return;
    progIdx += 1;
    quiz.render();
  }, 1600);
}

function afterRender(ctx) {
  const { st } = ctx;
  const html = dispHTML(st);
  if (disp.innerHTML !== html) disp.innerHTML = html;
  placeQuad(disp, 300, 102, dispCorners(st).map(p => ctx.toPx(...p)));
}

// camera per vraag (zelfde standen als voorheen, nu op vraag-id)
const FOCUS = {
  capaciteitGroup: { x: 0.42, y: -0.5, z: 0.45, zoom: 1.2 },
  budget: { x: 0, y: -0.5, z: 0.5, zoom: 1.4 }, stil: { x: 0, y: -0.5, z: 0.5, zoom: 1.4 }, droog: { x: 0, y: -0.5, z: 0.5, zoom: 1.4 },
  extra: { x: 0, y: -0.5, z: 0.5, zoom: 1.45, anchorX: 0.33 },
  programma: { x: 0.28, y: -0.5, z: 0.52, zoom: 1.6 },
};
const FOCUS_DESKTOP = {
  capaciteitGroup: { x: 0.55, y: -0.5, z: 0.5, zoom: 1.2, anchorX: 0.66 },
  budget: { x: 0, y: -0.5, z: 0.5, zoom: 1.3, anchorX: 0.66 }, stil: { x: 0, y: -0.5, z: 0.5, zoom: 1.3, anchorX: 0.66 }, droog: { x: 0, y: -0.5, z: 0.5, zoom: 1.3, anchorX: 0.66 },
  extra: { x: 0.25, y: -0.5, z: 0.5, zoom: 1.5, anchorX: 0.57 },
  programma: { x: 0.25, y: -0.5, z: 0.55, zoom: 1.5, anchorX: 0.6 },
};

quiz = createQuiz3D({
  camera,
  steps: Q.length,
  state: { capaciteitGroup: null, budget: null, stil: null, droog: null, programma: [], extra: [] },
  imgPath: n => `wasmachine/vragen/img/${n}.webp`,
  question: st => (QID(st) === "budget" ? { ...Q[st.q], options: budgetOpties(st.capaciteitGroup) }
    : { ...Q[st.q], options: metBeschikbaarheid(st, QID(st), Q[st.q].options) }),
  setup, afterRender,

  images(st) {
    const g = st.capaciteitGroup;
    const list = ["bijkeuken", LAYER[g] ?? "wm-9"];
    // de berg was per week, alleen bij de capaciteitsvraag; per machinemaat gerenderd, zodat de
    // schaduw van de manden op de juiste wasmachine valt
    if (QID(st) === "capaciteitGroup" && g) {
      const kg = { klein: 7, gemiddeld: 9, groot: 10 }[g];
      list.push(...["mand1", "mand2", "mand3"].slice(0, { klein: 1, gemiddeld: 2, groot: 3 }[g]).map(m => `${m}-${kg}`));
    }
    return list;
  },

  onAnswer(st, id) {
    if (id === "programma") progIdx = 0;
    // ander huishouden: een eerder gekozen bedrag hoort misschien niet meer bij de opties
    if (id === "capaciteitGroup" && !budgetOpties(st.capaciteitGroup).some(o => o.v === st.budget)) st.budget = null;
  },
  onNext(st, id) { meetStap(st, id); },

  focus: st => FOCUS[QID(st)] ?? FOCUS.budget,
  focusDesktop: st => FOCUS_DESKTOP[QID(st)] ?? FOCUS_DESKTOP.budget,

  overlays(ctx) {
    const { st } = ctx;
    const id = QID(st);
    if (id === "capaciteitGroup" && st.capaciteitGroup) {
      const t = ctx.toPx(0, yf(st), 0.98);
      return { svg: "", html: `<div class="tag is-on" style="left:${t.x}px;top:${t.y}px">Trommel <b>${KG[st.capaciteitGroup]}</b></div>` };
    }
    if (id === "stil") return waves(ctx, st);
    if (id === "extra") return extraSpots(ctx, st);
    if (id === "programma") return lens(ctx, st);
    return {};
  },

  hideCaption: (st, mobile) => QID(st) === "extra" && !mobile && st.extra.includes("aquastop"),

  caption(st) {
    switch (QID(st)) {
      case "capaciteitGroup": return {
        klein: ["1-2 personen", `Weinig was per week: een trommel van ${KG.klein} is ruim genoeg.`],
        gemiddeld: ["3-4 personen", `Meer was per week: ${KG.gemiddeld} past daar beter bij.`],
        groot: ["5 of meer personen", `Met een trommel van ${KG.groot} of meer hoef je minder vaak te wassen.`],
      }[st.capaciteitGroup] ?? ["Jouw bijkeuken", "Kies voor hoeveel personen je wast; de machine en de berg was wisselen mee."];
      case "budget": return budgetCaption(st);
      case "stil": return {
        ja: ["Zo stil mogelijk", "We zoeken de stilste wasmachines: rond 70 dB tijdens centrifugeren."],
        nee: ["Geluid maakt niet uit", "We letten niet op het geluid; dat geeft de meeste keuze."],
      }[st.stil] ?? ["Geluid", "Kies of het geluid voor jou uitmaakt."];
      case "droog": return {
        ja: ["Zo droog mogelijk", "We zoeken wasmachines met centrifugeer-droogklasse A: je was droogt sneller aan de lijn."],
        nee: ["Niet per se", "We letten niet op de droogklasse."],
      }[st.droog] ?? ["Droog uit de trommel", "Kies of je de was zo droog mogelijk wilt."];
      case "extra": return st.extra.includes("geen") ? ["Geen extra wensen", "We kijken dan naar je huishouden, budget en andere wensen."] : ["Extra's", "Vink aan wat je belangrijk vindt."];
      default: return st.programma.some(p => PROG[p]) ? ["Jouw programma's", "Wasmachines met deze programma's komen bovenaan in je advies."] : st.programma.includes("geen") ? ["Geen specifieke wensen", "Elke wasmachine heeft de standaardprogramma's zoals katoen, wol en eco."] : ["Wasprogramma's", "Kies welke programma's je zeker wilt hebben."];
    }
  },

  async finish(st) {
    meetStap(st, "extra");
    const answers = {
      capaciteitGroup: st.capaciteitGroup ?? "", budget: capVan(st.budget), stil: st.stil ?? "", droog: st.droog ?? "",
      programmaAnswers: st.programma, extraAnswers: st.extra,
    };
    const wasmachines = normalizeProducts((await productenOfFout()) ?? []);
    // Beste match binnen het budget; past er niets binnen, dan zonder grens.
    let result = matchWasmachines(wasmachines, st.capaciteitGroup, answers.budget, answers);
    if (answers.budget && !result.bestMatch) result = matchWasmachines(wasmachines, st.capaciteitGroup, null, answers);
    localStorage.setItem("wasmachine_bestMatch", JSON.stringify(result.bestMatch));
    localStorage.setItem("wasmachine_bestType", result.bestType ?? "");
    localStorage.setItem("wasmachine_filteredMatchedWasmachines", JSON.stringify(result.filteredMatchedWasmachines));
    localStorage.setItem("wasmachine_answers", JSON.stringify(answers));
    localStorage.setItem("wasmachine_selectedCapaciteitGroup", st.capaciteitGroup ?? "");
    window.location.href = "wasmachine/resultaat/";
  },

  preload: ["wm-9", "wm-7", "wm-10", "mand1-9", "mand2-9", "mand1-7", "mand1-10", "mand2-10", "mand3-10"],
});

// Meting: waar haken mensen af, en wat kiezen ze (o.a. de budgetvraag)
function meetStap(st, id) {
  const v = st[id];
  window.phTrackEvent?.("quiz_stap", {
    categorie: "wasmachine", stap: id, nr: Q.findIndex(q => q.id === id) + 1,
    antwoord: Array.isArray(v) ? [...v].sort().join("+") : String(v ?? ""),
  });
}

// Live telling bij de budgetvraag en grijze opties zodra de catalogus binnen is
productsPromise.then(raw => {
  if (!raw?.length) return;
  catalogus = normalizeProducts(raw);
  if (EIS[QID(quiz.st)]) quiz.renderQuestion();
  if (QID(quiz.st) === "budget") quiz.render();
});
