// Printer-vragenpagina op de 3D-werkplek (kleine laptop in het midden, printer
// rechts). Basisrender = het bureau; de printer (thuis, foto of kantoor, met of
// zonder scanner), de inkttanks en de documentinvoer zijn transparante lagen
// (render/scene.py). De geprinte vellen tekent de pagina zelf in perspectief op
// de uitvoerlade, zodat inhoud en aantal kunnen wisselen.
// Motor: shared/quiz3d.js. Uitleg van de matching: docs/printer-keuzehulp-werking.md.
import { createQuiz3D, makeCamera, spotColumn, placeQuad } from "../../shared/quiz3d.js";
import { matchPrinters, heeftGroteLade } from "../js/matching.js";
import { normalizeProducts, parsePrice } from "../js/utils.js";
import { fetchProducts } from "../js/supabase.js";
import { budgetCapsByGebruik } from "../js/data.js";

const camera = makeCamera({ camY: -2.15, camZ: 1.25, shiftY: -0.14 });
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
const DZ = 0.75, PX = 0.44, YB = -0.06;
const PRN = { thuis: { w: 0.43, d: 0.34, h: 0.18 }, foto: { w: 0.45, d: 0.36, h: 0.18 }, zakelijk: { w: 0.43, d: 0.43, h: 0.36 } };
const QID = st => Q[st.q]?.id;
const vanaf = (st, id) => st.q >= Q.findIndex(q => q.id === id);  // die vraag is nu of al voorbij
// render: kantoor toont de laserprinter ("zakelijk" in render/scene.py)
const kind = st => (st.gebruik === "kantoor" ? "zakelijk" : st.gebruik || "thuis");
const isLaser = st => kind(st) === "zakelijk";
const dims = st => { const p = PRN[kind(st)]; return { ...p, x0: PX - p.w / 2, x1: PX + p.w / 2, yf: YB - p.d }; };
const isAio = st => vanaf(st, "scan") && (st.scan === "los" || st.scan === "stapel");

// waar de geprinte vellen liggen: inkjet op de uitvoerlade vooraan, laser in de
// uitvoerruimte onder de scanner (all-in-one) of in de bak in de bovenkant
function sheetGeom(st) {
  const d = dims(st);
  if (!isLaser(st)) return { cx: PX, z: DZ + 0.047, yNear: d.yf - 0.22, yFar: d.yf };
  return isAio(st) ? { cx: PX - 0.03, z: DZ + 0.243, yNear: d.yf + 0.05, yFar: d.yf + 0.33 }
                   : { cx: PX - 0.03, z: DZ + 0.283, yNear: d.yf + 0.07, yFar: d.yf + 0.29 };
}
// laptop 13" als decor links van de printer (zie render/scene.py)
const LAP = { x: -0.12, y: -0.33, bd: 0.212, sw: 0.286, sh: 0.179, tilt: 18 * Math.PI / 180 };
function lapCorners() {
  const hy = LAP.y + LAP.bd / 2 - 0.004, hz = DZ + 0.016;
  const at = (x, zl) => [LAP.x + x, hy + Math.sin(LAP.tilt) * zl, hz + Math.cos(LAP.tilt) * zl];
  return [at(-LAP.sw / 2, 0.016 + LAP.sh), at(LAP.sw / 2, 0.016 + LAP.sh), at(LAP.sw / 2, 0.016), at(-LAP.sw / 2, 0.016)];
}

// ───────── budget ─────────
const euro = n => "€" + Math.round(n).toLocaleString("nl-NL");
// twee maximumbedragen plus "Geen voorkeur" (geen plafond, alle printers);
// alle opties in de taal van de vraag ("maximaal"), zodat niets als ondergrens leest
const budgetOpties = g => [...(budgetCapsByGebruik[g] ?? budgetCapsByGebruik.thuis).map(c => ({ v: String(c), label: `Tot ${euro(c)}` })), { v: "geen", label: "Geen voorkeur" }];
const capVan = v => (v && v !== "geen" ? Number(v) : null);
const GEBRUIK_WOORD = { thuis: "privégebruik", foto: "foto's", kantoor: "je werk" };

// Wat het gekozen budget betekent, uit de live catalogus (null zolang die laadt).
// Telt de printers die je standaard op de resultaatpagina ziet (bij 2+ winkels);
// bij foto's alleen printers die in kleur printen.
let catalogus = null;
function budgetInfo(g, cap) {
  if (!catalogus) return null;
  const relevant = catalogus.filter(p => (p.aanbieders ?? []).length >= 2 && (g !== "foto" || p.kanKleurenPrinten === "Ja") && !(p.alleenFoto && g !== "foto"));
  const binnen = cap ? relevant.filter(p => parsePrice(p.prijs) <= cap) : relevant;
  const prijzen = binnen.map(p => parsePrice(p.prijs)).filter(Number.isFinite);
  const alle = relevant.map(p => parsePrice(p.prijs)).filter(Number.isFinite);
  return {
    n: binnen.length, totaal: relevant.length,
    vanaf: prijzen.length ? Math.min(...prijzen) : null,
    tot: alle.length ? Math.max(...alle) : null,
  };
}

const Q = [
  {
    id: "gebruik", type: "radio",
    title: "Waarvoor ga je de printer vooral gebruiken?",
    sub: "De printer op het bureau wisselt mee.",
    why: "Voor schoolwerk, formulieren en tickets volstaat een betaalbare printer. Voor foto's zoeken we printers met extra inktkleuren en printen zonder witranden. Print je voor je werk (als zzp'er, aan je bureau thuis of op kantoor), dan letten we op snelheid, automatisch dubbelzijdig printen en een printer die veel werk aankan.",
    options: [
      { v: "thuis", label: "Privé, zoals schoolwerk en formulieren", price: "€" },
      { v: "foto", label: "Vooral foto's en kleurrijk werk", price: "€€" },
      { v: "kantoor", label: "Voor mijn werk, ook als ik thuiswerk", price: "€€" },
    ],
  },
  {
    id: "budget", type: "radio",
    title: "Wat wil je maximaal uitgeven?",
    sub: st => `Bedragen voor een printer voor ${GEBRUIK_WOORD[st.gebruik] ?? "thuis"}. Je krijgt de beste printer binnen je budget.`,
    why: "Met je budget zoeken we de beste printer die je ook echt wilt kopen. Past een printer die nog beter bij je wensen past net niet binnen je bedrag, dan laten we dat op de resultaatpagina zien.",
    options: [],   // per gebruik, zie question() hieronder
  },
  {
    id: "volume", type: "radio",
    title: "Hoeveel print je?",
    sub: "Zie wat er uit de printer komt.",
    why: "Print je weinig, dan droogt inkt in een cartridge sneller in; een laserprinter heeft daar geen last van. Print je veel, dan zijn een printer met navulbare inkttanks of een laserprinter veel goedkoper per pagina, en letten we op snelheid.",
    options: [
      { v: "weinig", label: "Af en toe, een paar pagina's per week", price: "€" },
      { v: "regelmatig", label: "Regelmatig, tientallen pagina's per week", price: "€€" },
      { v: "veel", label: "Veel, honderden pagina's per maand", price: "€€€" },
    ],
  },
  {
    id: "kleur", type: "radio",
    title: "Print je in kleur of is zwart-wit genoeg?",
    sub: "Het geprinte vel laat het verschil zien.",
    why: "Voor tekst is een zwart-witlaserprinter het voordeligst: goedkoop per pagina en er droogt niets in. Print je ook in kleur, dan zoeken we alleen printers die dat kunnen. Print je vaak in kleur, dan is een printer met navulbare inkttanks meestal het goedkoopst.",
    options: [
      { v: "zw", label: "Alleen zwart-wit", price: "€" },
      { v: "soms", label: "Soms in kleur", price: "€€" },
      { v: "vaak", label: "Vaak in kleur of foto's", price: "€€" },
    ],
  },
  {
    id: "scan", type: "radio",
    title: "Wil je ook scannen en kopiëren?",
    sub: "Een all-in-one heeft een scanner bovenop.",
    why: "Een all-in-one printer kan ook scannen en kopiëren: je legt een vel op de glasplaat onder het deksel. Scan of kopieer je vaak documenten van meerdere pagina's, zoals contracten of administratie, dan is een documentinvoer handig: je legt de hele stapel bovenop en hij haalt de vellen er zelf één voor één doorheen.",
    options: [
      { v: "nee", label: "Nee, alleen printen", price: "€" },
      { v: "los", label: "Ja, één vel tegelijk is genoeg", price: "€€" },
      { v: "stapel", label: "Ja, ook een hele stapel in één keer", price: "€€€" },
    ],
  },
  {
    id: "kosten", type: "radio",
    title: "Wat vind je belangrijker?",
    sub: "Zie waar de inkt zit.",
    why: "Printers met losse cartridges zijn goedkoop in aanschaf, maar de cartridges zijn duur per pagina. Printers met navulbare inkttanks (zoals EcoTank of Smart Tank) en laserprinters kosten meer, maar zijn daarna veel goedkoper per pagina.",
    options: [
      { v: "aanschaf", label: "Een lage aanschafprijs", price: "€" },
      { v: "printen", label: "Goedkoop printen, de printer mag meer kosten", price: "€€€" },
      { v: "egal", label: "Maakt me niet uit", price: "€€" },
    ],
  },
  {
    id: "extra", type: "check", exclusive: "geen",
    title: "Wat is nog meer belangrijk voor jou?",
    sub: "Je keuzes verschijnen op de printer.",
    why: "Automatisch dubbelzijdig printen bespaart papier zonder dat je vellen hoeft om te draaien. Een compacte printer past op een klein bureau of in een kast. Een grote papierlade hoef je minder vaak bij te vullen. A3 is twee keer zo groot als een gewoon vel, voor posters en tekeningen. Printen vanaf je telefoon kan bij bijna elke printer, daar hoef je niet op te letten.",
    options: [
      { v: "duplex", label: "Automatisch dubbelzijdig printen", price: "€" },
      { v: "compact", label: "Compact formaat", price: "€" },
      { v: "lade", label: "Grote papierlade (250 vel of meer)", price: "€€" },
      { v: "a3", label: "Printen op A3", price: "€€€" },
      { v: "geen", label: "Geen extra wensen", price: "€" },
    ],
  },
];

// wat er op het vel staat: foto-print, kleurendocument of zwart-wit
function sheetKind(st) {
  if (vanaf(st, "kleur") && st.kleur === "zw") return "zw";
  if (vanaf(st, "kleur") && st.kleur === "vaak" && st.gebruik === "foto") return "foto";
  if (vanaf(st, "kleur") && st.kleur) return "kleur";
  if (st.gebruik === "foto") return "foto";
  return st.gebruik === "kantoor" ? "zw" : "kleur";
}
const SHEETS = {
  zw: `<div class="pad"><h5>Offerte 2026-114</h5>${"<i></i>".repeat(14)}</div>`,
  kleur: `<div class="pad"><h5 style="color:#0954a3">Werkstuk: de kust</h5><img class="colorimg" src="shared/img/scherm/scherm-normaal.webp" alt=""><div class="bars"><b style="height:40%;background:#0954a3"></b><b style="height:70%;background:#c49a78"></b><b style="height:55%;background:#2e8b57"></b><b style="height:85%;background:#d08a16"></b></div>${"<i></i>".repeat(4)}</div>`,
  foto: `<img class="photo" src="shared/img/scherm/scherm-films.webp" alt="">`,
};
const VELLEN = { weinig: 1, regelmatig: 4, veel: 10 };

let sheetBox, lapScreen;
function setup(scene) {
  lapScreen = document.createElement("div");
  lapScreen.className = "lscreen";
  lapScreen.innerHTML = `<div class="wall"><svg viewBox="0 0 520 330" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="wg0" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b2d52"/><stop offset=".55" stop-color="#0954a3"/><stop offset="1" stop-color="#3f7fc4"/></linearGradient><linearGradient id="wg1" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e9c9a8"/><stop offset="1" stop-color="#c49a78"/></linearGradient><linearGradient id="wg2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9c6a45"/><stop offset="1" stop-color="#6e4428"/></linearGradient></defs><rect width="520" height="330" fill="url(#wg0)"/><path d="M0 190 C 110 140, 210 250, 330 200 S 480 150, 520 175 L520 330 L0 330Z" fill="url(#wg1)" opacity=".92"/><path d="M0 245 C 130 210, 250 300, 380 255 S 500 230, 520 240 L520 330 L0 330Z" fill="url(#wg2)" opacity=".9"/><path d="M0 290 C 150 270, 300 320, 520 285 L520 330 L0 330Z" fill="#2b1a10" opacity=".55"/></svg><div class="clock">09:41<small>dinsdag 29 september</small></div><div class="dock"><i class="a1"></i><i class="a2"></i><i class="a3"></i><i class="a4"></i><i class="a5"></i></div></div>`;
  sheetBox = document.createElement("div");
  scene.querySelector(".layers").after(lapScreen, sheetBox);
}

function afterRender(ctx) {
  const { st } = ctx;
  const n = vanaf(st, "volume") ? VELLEN[st.volume] ?? 1 : 1;
  const html = SHEETS[sheetKind(st)];
  sheetBox.innerHTML = Array.from({ length: n }, () => `<div class="sheet">${html}</div>`).join("");
  // vel van 21 cm breed komt 22 cm uit de sleuf; een stapel ligt telkens iets hoger en verschoven
  const g = sheetGeom(st);
  [...sheetBox.children].forEach((el, i) => {
    const z = g.z + (n - 1 - i) * 0.0022, dx = (i % 3 - 1) * 0.003, dy = (i % 2) * 0.004;
    const c = [[g.cx - 0.105 + dx, g.yFar - dy, z], [g.cx + 0.105 + dx, g.yFar - dy, z], [g.cx + 0.105 + dx, g.yNear - dy, z], [g.cx - 0.105 + dx, g.yNear - dy, z]];
    placeQuad(el, 420, 440, c.map(p => ctx.toPx(...p)));
  });
  // bureaublad op de laptop, net als in de laptop-keuzehulp
  placeQuad(lapScreen, 520, Math.round(520 * LAP.sh / LAP.sw), lapCorners().map(p => ctx.toPx(...p)));
}

function budgetCaption(st) {
  const cap = capVan(st.budget), info = budgetInfo(st.gebruik, cap);
  if (!st.budget) return ["Jouw budget", "Kies wat je maximaal wilt uitgeven. Je krijgt de beste printer binnen dat bedrag, en op de resultaatpagina zie je wat meer budget oplevert."];
  if (!info) return [cap ? `Tot ${euro(cap)}` : "Geen voorkeur", cap ? "We zoeken de beste printer binnen dit bedrag." : "We kiezen puur op je wensen."];
  if (!cap) return ["Geen voorkeur", `Alle ${info.totaal} printers doen mee, van ${euro(info.vanaf)} tot ${euro(info.tot)}. We kiezen puur op je wensen.`];
  if (!info.n) return [`Tot ${euro(cap)}`, "Binnen dit bedrag vonden we geen printer. We tonen dan de printers die het best bij je passen, net erboven."];
  return [`Tot ${euro(cap)}`, `${info.n} van de ${info.totaal} printers kosten ${euro(cap)} of minder, vanaf ${euro(info.vanaf)}. We zoeken de beste die bij je wensen past.`];
}

const quiz = createQuiz3D({
  camera,
  steps: Q.length,
  state: { gebruik: null, budget: null, volume: null, kleur: null, scan: null, kosten: null, extra: [] },
  imgPath: n => `printer/vragen/img/${n}.webp`,
  question: st => (QID(st) === "budget" ? { ...Q[st.q], options: budgetOpties(st.gebruik) }
    : { ...Q[st.q], options: metBeschikbaarheid(st, QID(st), Q[st.q].options) }),
  setup, afterRender,

  images(st) {
    const k = kind(st);
    const list = ["bureau", k + (isAio(st) ? "-aio" : "")];
    // laser heeft geen inkttanks en (in de render) geen losse documentinvoer
    if (vanaf(st, "kosten") && st.kosten === "printen" && k !== "zakelijk") list.push(`tank-${k}`);
    if (vanaf(st, "scan") && st.scan === "stapel" && k !== "zakelijk") list.push(`adf-${k}`);
    return list;
  },

  focus: () => ({ x: 0.3, y: -0.3, z: 0.9, zoom: 1.7 }),
  focusDesktop: st => ({ x: 0.36, y: -0.3, z: 0.9, zoom: 1.45, anchorX: QID(st) === "extra" ? 0.55 : 0.62 }),

  overlays(ctx) {
    const { st } = ctx;
    if (QID(st) !== "extra") return {};
    const d = dims(st);
    const top = DZ + d.h + (isAio(st) ? 0.03 : 0);
    const pts = [];
    if (st.extra.includes("duplex")) pts.push({ x: PX, y: d.yf + 0.05, label: "<b>Dubbelzijdig</b>: draait het vel zelf om" });
    if (st.extra.includes("compact")) pts.push({ x: d.x0 + 0.05, y: d.yf, label: "<b>Compact</b>: past op een klein bureau" });
    if (st.extra.includes("lade")) pts.push({ x: d.x1 - 0.06, y: d.yf, label: "<b>Grote papierlade</b>: 250 vel of meer" });
    if (st.extra.includes("a3")) pts.push({ x: PX + 0.08, y: d.yf + 0.1, label: "<b>A3</b>: twee keer zo groot als een gewoon vel" });
    return spotColumn(ctx, pts.map(p => ({ ...p, z: 0 })), { zBot: DZ + 0.06, zTop: top + 0.02, edgeX: d.x1 + 0.03, edgeY: d.yf });
  },

  hideCaption: (st, mobile) => QID(st) === "extra" && !mobile,

  caption(st) {
    switch (QID(st)) {
      case "gebruik": return {
        thuis: ["Privé", "Schoolwerk, formulieren, tickets en af en toe een foto: daar volstaat een betaalbare printer."],
        foto: ["Foto's", "Een fotoprinter met extra inktkleuren voor rijke, scherpe afdrukken, ook zonder witranden."],
        kantoor: ["Voor je werk", "Thuis of op kantoor: een snelle printer die veel werk aankan, met automatisch dubbelzijdig printen."],
      }[st.gebruik] ?? ["Jouw werkplek", "Kies waarvoor je de printer gebruikt; de printer op het bureau wisselt mee."];
      case "budget": return budgetCaption(st);
      case "volume": return {
        weinig: ["Af en toe", "Inkt in een cartridge droogt in als je weinig print. Een laserprinter heeft daar geen last van."],
        regelmatig: ["Regelmatig", "Dan telt wat een pagina kost: navulbare inkttanks of een laserprinter zijn voordelig."],
        veel: ["Veel", "Dan zoeken we een snelle printer die goedkoop is per pagina en veel werk aankan."],
      }[st.volume] ?? ["Hoeveel je print", "Kies wat het best past; de stapel vellen groeit mee."];
      case "kleur": return {
        zw: ["Alleen zwart-wit", "Dan is een zwart-witlaserprinter het voordeligst: goedkoop per pagina en er droogt niets in."],
        soms: ["Soms in kleur", "We kijken alleen naar printers die in kleur printen."],
        vaak: ["Vaak in kleur", "Dan is een printer met navulbare inkttanks meestal het goedkoopst per pagina."],
      }[st.kleur] ?? ["Kleur", "Kies of je ook in kleur print."];
      case "scan": return {
        nee: ["Alleen printen", "Zonder scanner: compacter en voordeliger."],
        los: ["All-in-one", "Je legt het vel op de glasplaat onder het deksel en scant of kopieert het."],
        stapel: ["Met documentinvoer", "Leg de hele stapel bovenop: de printer haalt de vellen er zelf één voor één doorheen."],
      }[st.scan] ?? ["Scannen en kopiëren", "Een all-in-one heeft een scanner bovenop."];
      case "kosten":
        if (st.kosten === "printen") return isLaser(st)
          ? ["Goedkoop printen", "Een laserprinter print met toner: voordelig per pagina en hij droogt niet in. Ook een printer met navulbare inkttanks kan."]
          : ["Goedkoop printen", "Navulbare inkttanks: iets duurder bij aanschaf, daarna veel goedkoper per pagina. Een laserprinter kan ook."];
        return {
          aanschaf: ["Lage aanschafprijs", "Dan kijken we eerst naar betaalbare printers. De cartridges zijn wel relatief duur."],
          egal: ["Maakt niet uit", "We kiezen dan puur op je andere wensen."],
        }[st.kosten] ?? ["Aanschaf of printen", "Kies wat je belangrijker vindt."];
      default: return st.extra.some(e => e !== "geen") ? ["Jouw extra's", "De gemarkeerde punten laten zien waar je keuzes zitten."] : ["Extra's", "Vink aan wat je belangrijk vindt."];
    }
  },

  onNext(st, id) {
    meetStap(st, id);
  },
  onAnswer(st, id) {
    // ander gebruik: een eerder gekozen bedrag hoort misschien niet meer bij de opties
    if (id === "gebruik" && !budgetOpties(st.gebruik).some(o => o.v === st.budget)) st.budget = null;
  },

  async finish(st) {
    meetStap(st, "extra");
    const answers = {
      gebruik: st.gebruik ?? "", budget: capVan(st.budget), volume: st.volume ?? "", kleur: st.kleur ?? "",
      scan: st.scan ?? "", kosten: st.kosten ?? "", extraAnswers: st.extra,
    };
    const raw = await productenOfFout();
    const printers = normalizeProducts(raw ?? []);
    // Beste match binnen het budget; past er niets binnen, dan zonder grens.
    let result = matchPrinters(printers, answers.budget, answers);
    if (answers.budget && !result.bestMatch) result = matchPrinters(printers, null, answers);
    localStorage.setItem("printer_bestMatch", JSON.stringify(result.bestMatch));
    localStorage.setItem("printer_bestType", result.bestType ?? "");
    localStorage.setItem("printer_filteredMatchedPrinters", JSON.stringify(result.filteredMatchedPrinters));
    localStorage.setItem("printer_answers", JSON.stringify(answers));
    localStorage.setItem("printer_selectedGebruik", st.gebruik ?? "");
    window.location.href = "printer/resultaat/";
  },

  preload: ["bureau", "thuis", "foto", "zakelijk", "thuis-aio", "foto-aio", "zakelijk-aio", "tank-thuis", "tank-foto", "adf-thuis", "adf-foto"],
});

// Meting: waar haken mensen af, en wat kiezen ze (o.a. de budgetvraag)
function meetStap(st, id) {
  const v = st[id];
  window.phTrackEvent?.("quiz_stap", {
    categorie: "printer", stap: id, nr: Q.findIndex(q => q.id === id) + 1,
    antwoord: Array.isArray(v) ? [...v].sort().join("+") : String(v ?? ""),
  });
}

// ───────── opties grijs als geen printer ze waar kan maken ─────────
// Een wens (kleur, scannen, een extra) is grijs als er binnen je budget geen
// printer bij 2+ winkels is die eraan voldoet samen met je eerdere wensen en,
// bij de extra's, met wat je al hebt aangevinkt (bv. "Compact" na "A3").
const EIS = {
  kleur: { soms: p => p.kanKleurenPrinten === "Ja", vaak: p => p.kanKleurenPrinten === "Ja" },
  scan: { los: p => p.aio, stapel: p => p.aio && p.adf === "Ja" },
  // Onbekend (Icecat weet het niet) telt als mogelijk: alleen grijs als het zeker niet kan.
  extra: { duplex: p => p.duplexAuto !== false, compact: p => p.compact !== false, lade: p => heeftGroteLade(p) !== false, a3: p => p.a3 !== false },
};
function eisenVoor(st, id, behalve) {
  const tot = Q.findIndex(q => q.id === id);
  const eisen = [];
  Q.slice(0, tot).forEach(q => { const f = EIS[q.id]?.[st[q.id]]; if (f) eisen.push(f); });
  if (id === "extra") (st.extra ?? []).filter(v => v !== behalve).forEach(v => { if (EIS.extra[v]) eisen.push(EIS.extra[v]); });
  return eisen;
}
function metBeschikbaarheid(st, id, opties) {
  if (!catalogus || !EIS[id]) return opties;
  const cap = capVan(st.budget);
  const vergelijkbaar = catalogus.filter(p => (p.aanbieders ?? []).length >= 2 && !(p.alleenFoto && st.gebruik !== "foto"));
  const binnen = cap ? vergelijkbaar.filter(p => parsePrice(p.prijs) <= cap) : vergelijkbaar;
  return opties.map(o => {
    const eis = EIS[id][o.v];
    if (!eis) return o;
    let andere = eisenVoor(st, id, o.v);
    // Eerdere wensen die samen al onmogelijk zijn, laat de matching toch vallen:
    // dan tellen ze hier ook niet mee (anders werd alles grijs).
    if (!binnen.some(p => andere.every(f => f(p)))) andere = [];
    if (binnen.some(p => eis(p) && andere.every(f => f(p)))) return o;
    const erboven = vergelijkbaar.filter(p => eis(p) && andere.every(f => f(p))).map(p => parsePrice(p.prijs));
    const note = cap && erboven.length ? `Niet tot ${euro(cap)}; wel vanaf ${euro(Math.min(...erboven))}.`
      : andere.length ? "Niet in combinatie met je andere keuzes."
      : "Niet in ons aanbod.";
    return { ...o, disabled: true, note };
  });
}

// Live telling bij de budgetvraag zodra de catalogus binnen is
productsPromise.then(raw => {
  if (!raw?.length) return;
  catalogus = normalizeProducts(raw);
  if (EIS[QID(quiz.st)]) quiz.renderQuestion();   // grijze opties pas nu bekend
  if (QID(quiz.st) === "budget") quiz.render();
});
