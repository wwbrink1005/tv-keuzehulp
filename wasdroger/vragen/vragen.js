// Testversie van de wasdroger-vragenpagina in de 3D-bijkeuken. Basisrender = de
// ruimte met onderop een wasmachine en een stapelkit; de droger erbovenop (7, 9 of
// 10 kg) en de wasmanden zijn transparante lagen (render/scene.py). Het display van
// de droger tekent de pagina zelf in perspectief op het zwarte glas.
// Motor: shared/quiz3d.js.
import { createQuiz3D, makeCamera, placeQuad } from "../../shared/quiz3d.js";
import { matchWasdrogers, heeftProgramma, EXTRA_KENMERK, STIL_DREMPEL } from "../js/matching.js";
import { normalizeProducts, parsePrice } from "../js/utils.js";
import { fetchProducts } from "../js/supabase.js";
import { capaciteitGroupToAllowedCapaciteit, isCapaciteitInGroup, BUDGET_CAPS } from "../js/data.js";

const camera = makeCamera({ camY: -3.3, camZ: 1.35, shiftX: -0.08, shiftY: -0.075 });
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

const euro = n => "€" + Math.round(n).toLocaleString("nl-NL");

// Sinds okt. 2026: budget als vraag 2; stil als ja/nee (zoals bij de
// wasmachine); bij de extra's alleen wat drogers echt van elkaar onderscheidt.
const Q = [
  {
    id: "capaciteitGroup", type: "radio",
    title: "Voor hoeveel personen droog je?",
    sub: "De droger en de berg was groeien mee.",
    why: "De grootte van je huishouden bepaalt hoeveel droogcapaciteit (kg) je nodig hebt. Voor 1-2 personen is 7 tot 9 kg ruim genoeg; bijna alle drogers zijn tegenwoordig 8 of 9 kg. Bij 3-4 personen past 8 tot 10 kg. Bij 5 of meer personen, of veel was, is 10 kg of meer handig: dan hoef je minder vaak te drogen.",
    options: [{ v: "klein", label: "1-2 personen", price: "€" }, { v: "gemiddeld", label: "3-4 personen", price: "€€" }, { v: "groot", label: "5 of meer personen, of veel was per week", price: "€€€" }],
  },
  {
    id: "budget", type: "radio",
    title: "Wat wil je maximaal uitgeven?",
    sub: "Je krijgt de beste wasdroger binnen je budget.",
    why: "Met je budget zoeken we de beste wasdroger die je ook echt wilt kopen. Past een droger die nog beter bij je wensen past net niet binnen je bedrag, dan laten we dat op de resultaatpagina zien.",
    options: [...BUDGET_CAPS.map(c => ({ v: String(c), label: `Tot ${euro(c)}` })), { v: "geen", label: "Geen voorkeur" }],
  },
  {
    id: "stil", type: "radio",
    title: "Staat de droger op een plek waar je last hebt van lawaai?",
    sub: "Zie hoeveel geluid er tijdens het drogen mag zijn.",
    why: "Drogers maken tijdens het drogen tussen ongeveer 56 en 67 dB. Staat hij dicht bij de woonkamer of slaapkamer, of in een appartement, dan zoeken we de stilste modellen.",
    options: [{ v: "ja", label: "Ja, liefst een stille droger", price: "€€" }, { v: "nee", label: "Nee, het geluid maakt niet uit", price: "€" }],
  },
  {
    id: "programma", type: "check", exclusive: "geen",
    title: "Welke droogprogramma's wil je zeker hebben?",
    sub: "Het display laat je programma's zien.",
    why: "Katoen, synthetisch, mix en eco heeft elke droger. Een wolprogramma droogt kwetsbare kleding op lage temperatuur, sport/outdoor is voor sportkleding en jassen, stoom frist kleding op zonder wassen, allergie/hygiëne droogt op hogere temperatuur tegen huisstofmijt en bacteriën, en een beddengoedprogramma droogt dekbedden en dons gelijkmatig.",
    options: [
      { v: "wol", label: "Wol", price: "€€" }, { v: "sport", label: "Sport en outdoor", price: "€€" }, { v: "stoom", label: "Stoom (opfrissen)", price: "€€€" },
      { v: "allergie", label: "Allergie/hygiëne", price: "€€" }, { v: "dekbed", label: "Beddengoed en dons", price: "€€" },
      { v: "geen", label: "Geen specifieke wensen", price: "€" },
    ],
  },
  {
    id: "extra", type: "check", exclusive: "geen",
    title: "Wat is nog meer belangrijk voor jou?",
    sub: "Je keuzes verschijnen op de droger.",
    why: "Een droger met energielabel A verbruikt ruim een derde minder stroom dan een droger met label C; dat scheelt elk jaar op je energierekening. Met een app start je de droger op afstand en krijg je een melding als hij klaar is. Een vochtsensor, anti-kreukfase, uitgestelde start en kinderslot heeft vrijwel elke droger, daar hoef je niet op te letten.",
    options: [
      { v: "zuinig", label: "Extra zuinig (energielabel A)", price: "€€€" },
      { v: "app", label: "Bediening met een app", price: "€€" },
      { v: "geen", label: "Geen extra wensen", price: "€" },
    ],
  },
];
const QID = st => Q[st.q]?.id;

// ───────── live catalogus: budgettelling en grijze opties ─────────
let catalogus = null;
const capVan = v => (v && v !== "geen" ? Number(v) : null);
const vanMaat = st => (catalogus ?? []).filter(w => (w.aanbieders ?? []).length >= 2 && isCapaciteitInGroup(w.capaciteit, st.capaciteitGroup));
function budgetCaption(st) {
  const cap = capVan(st.budget);
  if (!st.budget) return ["Jouw budget", "Kies wat je maximaal wilt uitgeven. Je krijgt de beste droger binnen dat bedrag, en op de resultaatpagina zie je wat meer budget oplevert."];
  if (!catalogus) return [cap ? `Tot ${euro(cap)}` : "Geen voorkeur", cap ? "We zoeken de beste droger binnen dit bedrag." : "We kiezen puur op je wensen."];
  const prijzen = vanMaat(st).map(w => parsePrice(w.prijs));
  const binnen = cap ? prijzen.filter(x => x <= cap) : prijzen;
  if (!cap) return ["Geen voorkeur", `Alle ${prijzen.length} drogers die groot genoeg zijn doen mee, van ${euro(Math.min(...prijzen))} tot ${euro(Math.max(...prijzen))}. We kiezen puur op je wensen.`];
  if (!binnen.length) return [`Tot ${euro(cap)}`, "Binnen dit bedrag vonden we geen droger die groot genoeg is. We tonen dan de drogers die het best bij je passen, net erboven."];
  return [`Tot ${euro(cap)}`, `${binnen.length} van de ${prijzen.length} drogers die groot genoeg zijn kosten ${euro(cap)} of minder, vanaf ${euro(Math.min(...binnen))}. We zoeken de beste die bij je wensen past.`];
}
// Grijs als geen droger bij 2+ winkels binnen maat en budget het zeker heeft,
// samen met je eerdere programma's en de al aangevinkte opties (zelfde regel als
// bij de andere keuzehulpen).
const EIS = {
  programma: Object.fromEntries(["wol", "sport", "stoom", "allergie", "dekbed"].map(v => [v, w => heeftProgramma(w, v) === true])),
  extra: Object.fromEntries(["zuinig", "app"].map(v => [v, w => EXTRA_KENMERK[v](w) === true])),
};
function eisenVan(st, totId, zonder) {
  const eisen = [];
  for (const q of Q) {
    if (EIS[q.id]) [].concat(st[q.id] ?? []).filter(v => EIS[q.id][v] && (q.id !== totId || v !== zonder)).forEach(v => eisen.push(EIS[q.id][v]));
    if (q.id === totId) break;
  }
  return eisen;
}
function metBeschikbaarheid(st, q) {
  if (!catalogus || !EIS[q.id]) return q;
  const cap = capVan(st.budget), alle = vanMaat(st);
  const binnen = cap ? alle.filter(w => parsePrice(w.prijs) <= cap) : alle;
  return { ...q, options: q.options.map(o => {
    const eis = EIS[q.id][o.v];
    if (!eis) return o;
    let andere = eisenVan(st, q.id, o.v);
    if (!binnen.some(w => andere.every(f => f(w)))) andere = [];
    if (binnen.some(w => eis(w) && andere.every(f => f(w)))) return o;
    const erboven = alle.filter(w => eis(w) && andere.every(f => f(w))).map(w => parsePrice(w.prijs));
    const note = cap && erboven.length ? (andere.length && binnen.some(eis) ? `Samen met je andere keuzes pas vanaf ${euro(Math.min(...erboven))}.` : `Niet tot ${euro(cap)}; wel vanaf ${euro(Math.min(...erboven))}.`)
      : "Niet in combinatie met je andere keuzes.";
    return { ...o, disabled: true, note };
  }) };
}
const WENS_NAAM = { wol: "een wolprogramma", sport: "een sport/outdoorprogramma", stoom: "een stoomprogramma", allergie: "een hygiëneprogramma",
  dekbed: "een beddengoedprogramma", zuinig: "energielabel A", app: "bediening met een app" };
function wensCaption(st, id, leeg) {
  const wensen = (st[id] ?? []).filter(e => e !== "geen");
  if (!wensen.length || !catalogus) return leeg;
  const cap = capVan(st.budget);
  const l = vanMaat(st).filter(w => !cap || parsePrice(w.prijs) <= cap);
  const eisen = eisenVan(st, id, null);
  const n = l.filter(w => eisen.every(f => f(w))).length;
  const wat = eisen.length > 1 ? "alles wat je koos" : WENS_NAAM[wensen[0]];
  const bij = cap ? "maat en budget" : "maat";
  const titel = id === "extra" ? "Jouw extra's" : "Jouw programma's";
  if (!n) return [titel, `Geen van de ${l.length} drogers die bij je ${bij} passen heeft zeker ${wat}. We tonen de drogers die er het meest van hebben.`];
  return [titel, `${n} van de ${l.length} drogers die bij je ${bij} passen ${n === 1 ? "heeft" : "hebben"} ${wat}.`];
}

// ───────── display ─────────
const ICON = {
  eco: `<svg viewBox="0 0 24 24"><path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14"/><path d="M5 19c3-4 6-7 9-9"/></svg>`,
  klok: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>`,
  slot: `<svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>`,
  wifi: `<svg viewBox="0 0 24 24"><path d="M3 9.5a13 13 0 0 1 18 0"/><path d="M6.5 13a8 8 0 0 1 11 0"/><path d="M10 16.5a3 3 0 0 1 4 0"/><circle cx="12" cy="19.5" r=".8"/></svg>`,
};
const PROG = { wol: "Wol", sport: "Outdoor", stoom: "Stoom", allergie: "Hygiëne", dekbed: "Dekbed", jeans: "Jeans", baby: "Baby" };
const progList = st => { const l = st.programma.filter(p => PROG[p]).map(p => PROG[p]); return l.length ? l : ["Kastdroog", "Mix"]; };
let progIdx = 0;

function dispHTML(st) {
  switch (QID(st)) {
    case "capaciteitGroup": case "budget": return st.capaciteitGroup ? `<span class="big">${KG[st.capaciteitGroup].replace(" kg", "")}<small>kg</small></span>` : `<span class="big">2:45</span>`;
    case "stil": return `<span class="big prog">Kastdroog</span>`;
    case "extra": {
      const e = st.extra;
      const ic = [e.includes("zuinig") && ICON.eco, e.includes("app") && ICON.wifi].filter(Boolean);
      return ic.join("") + `<span class="big">2:45</span>`;
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
// Grens zoals STIL_DREMPEL in wasdroger/js/matching.js (62 dB).
const SOUND = {
  ja: { n: 2, tag: `<b>Liefst max. ${STIL_DREMPEL} dB</b> <span class="muted">zo luid als een gesprek</span>` },
  nee: { n: 5, soft: true, tag: "<b>Geen eis</b> <span class=\"muted\">aan het geluid</span>" },
};
function waves(ctx, st) {
  const s = SOUND[st.stil];
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
  if (e.includes("app")) pts.push({ x: 0.175, y: dy, z: dz, label: "<b>App</b>: bedienen en meldingen op je telefoon" });
  if (e.includes("zuinig")) pts.push({ x: 0.12, y, z: Z0 + 0.095, label: "<b>Energielabel A</b>: ruim een derde zuiniger dan C" });
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
    if (!quiz || QID(quiz.st) !== "programma" || document.hidden) return;
    progIdx += 1;
    quiz.render();
  }, 1600);
}

function afterRender(ctx) {
  const html = dispHTML(ctx.st);
  if (disp.innerHTML !== html) disp.innerHTML = html;
  placeQuad(disp, 290, 102, dispCorners(ctx.st).map(p => ctx.toPx(...p)));
}

// focus per vraag (zoals voorheen per stap; budget deelt die van de capaciteit)
const FOCUS = {
  capaciteitGroup: { x: 0.42, y: -0.5, z: 0.9, zoom: 1.15 }, budget: { x: 0.42, y: -0.5, z: 0.9, zoom: 1.15 },
  stil: { x: 0, y: -0.5, z: 1.25, zoom: 1.35 },
  extra: { x: 0, y: -0.5, z: 1.25, zoom: 1.4, anchorX: 0.33 },
  programma: { x: 0.28, y: -0.5, z: 1.35, zoom: 1.6 },
};
const FOCUS_DESKTOP = {
  capaciteitGroup: { x: 0.55, y: -0.5, z: 0.95, zoom: 1.0, anchorX: 0.66 }, budget: { x: 0.55, y: -0.5, z: 0.95, zoom: 1.0, anchorX: 0.66 },
  stil: { x: 0, y: -0.5, z: 1.2, zoom: 1.3, anchorX: 0.66 },
  extra: { x: 0.25, y: -0.5, z: 1.25, zoom: 1.5, anchorX: 0.57 },
  programma: { x: 0.25, y: -0.5, z: 1.35, zoom: 1.5, anchorX: 0.6 },
};

quiz = createQuiz3D({
  camera,
  steps: Q.length,
  state: { capaciteitGroup: null, budget: null, stil: null, programma: [], extra: [] },
  imgPath: n => `wasdroger/vragen/img/${n}.webp`,
  question: st => metBeschikbaarheid(st, Q[st.q]),
  setup, afterRender,

  images(st) {
    const g = st.capaciteitGroup;
    const list = ["bijkeuken", LAYER[g] ?? "wd-9"];
    // de berg was per week, alleen bij de capaciteitsvraag
    if (QID(st) === "capaciteitGroup" && g) list.push(...["mand1", "mand2", "mand3"].slice(0, { klein: 1, gemiddeld: 2, groot: 3 }[g]));
    return list;
  },

  onAnswer(st, id) { if (id === "programma") progIdx = 0; },

  focus: st => FOCUS[QID(st)],
  focusDesktop: st => FOCUS_DESKTOP[QID(st)],

  overlays(ctx) {
    const { st } = ctx;
    if ((QID(st) === "capaciteitGroup" || QID(st) === "budget") && st.capaciteitGroup) {
      const t = ctx.toPx(0, yf(st), Z0 + 0.98);
      t.y = Math.max(t.y, 50);   // boven de droger is weinig ruimte: nooit buiten beeld
      return { svg: "", html: `<div class="tag is-on" style="left:${t.x}px;top:${t.y}px">Trommel <b>${KG[st.capaciteitGroup]}</b></div>` };
    }
    if (QID(st) === "stil") return waves(ctx, st);
    if (QID(st) === "extra") return extraSpots(ctx, st);
    if (QID(st) === "programma") return lens(ctx, st);
    return {};
  },

  caption(st) {
    switch (QID(st)) {
      case "capaciteitGroup": return {
        klein: ["1-2 personen", `Weinig was per week: een droger van ${KG.klein} is ruim genoeg.`],
        gemiddeld: ["3-4 personen", `Meer was per week: ${KG.gemiddeld} past daar beter bij.`],
        groot: ["5 of meer personen", `Met een droger van ${KG.groot} hoef je minder vaak te drogen.`],
      }[st.capaciteitGroup] ?? ["Jouw bijkeuken", "Kies voor hoeveel personen je droogt; de droger en de berg was wisselen mee."];
      case "budget": return budgetCaption(st);
      case "stil": return {
        ja: ["Liefst stil", `De stilste drogers komen bovenaan; tot ${STIL_DREMPEL} dB telt als stil.`],
        nee: ["Geluid maakt niet uit", "We letten niet op het geluid; dat geeft de meeste keuze."],
      }[st.stil] ?? ["Geluid", "Kies of de droger stil moet zijn tijdens het drogen."];
      case "extra": return wensCaption(st, "extra", st.extra.includes("geen") ? ["Geen extra wensen", "We kiezen puur op je eerdere antwoorden."] : ["Extra's", "Vink aan wat je belangrijk vindt; het verschijnt op de droger."]);
      default: return wensCaption(st, "programma", st.programma.includes("geen") ? ["Geen specifieke wensen", "Elke droger heeft de standaardprogramma's zoals katoen en mix."] : ["Droogprogramma's", "Kies welke programma's je zeker wilt hebben."]);
    }
  },

  onNext(st, id) { meetStap(st, id); },

  async finish(st) {
    meetStap(st, "extra");
    const answers = { budget: capVan(st.budget), stil: st.stil ?? "", extraAnswers: st.extra, programmaAnswers: st.programma };
    const wasdrogers = normalizeProducts(await productenOfFout());
    // Beste match binnen het budget; past er niets binnen, dan zonder grens.
    let result = matchWasdrogers(wasdrogers, st.capaciteitGroup, answers.budget, answers);
    if (answers.budget && !result.bestMatch) result = matchWasdrogers(wasdrogers, st.capaciteitGroup, null, answers);
    localStorage.setItem("wasdroger_bestMatch", JSON.stringify(result.bestMatch));
    localStorage.setItem("wasdroger_bestType", result.bestType ?? "");
    localStorage.setItem("wasdroger_filteredMatchedWasdrogers", JSON.stringify(result.filteredMatchedWasdrogers));
    localStorage.setItem("wasdroger_answers", JSON.stringify(answers));
    localStorage.setItem("wasdroger_selectedCapaciteitGroup", st.capaciteitGroup ?? "");
    window.location.href = "wasdroger/resultaat/";
  },

  preload: ["wd-9", "wd-7", "wd-10", "mand1", "mand2", "mand3"],
});

// Meting: waar haken mensen af, en wat kiezen ze (o.a. de budgetvraag)
function meetStap(st, id) {
  const v = st[id];
  window.phTrackEvent?.("quiz_stap", {
    categorie: "wasdroger", stap: id, nr: Q.findIndex(q => q.id === id) + 1,
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
