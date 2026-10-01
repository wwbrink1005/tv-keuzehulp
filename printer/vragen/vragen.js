// Testversie van de printer-vragenpagina op de 3D-werkplek (kleine laptop in het
// midden, printer rechts). Basisrender = het bureau; de printer (thuis, foto of
// zakelijk, met of zonder scanner), de inkttanks en de documentinvoer zijn
// transparante lagen (render/scene.py). De geprinte vellen tekent de pagina zelf in
// perspectief op de uitvoerlade, zodat inhoud en aantal kunnen wisselen.
// Motor: shared/quiz3d.js.
import { createQuiz3D, makeCamera, spotColumn, placeQuad } from "../../shared/quiz3d.js";
import { matchPrinters } from "../js/matching.js";
import { normalizeProducts } from "../js/utils.js";
import { fetchProducts } from "../js/supabase.js";

const camera = makeCamera({ camY: -2.15, camZ: 1.25, shiftY: -0.14 });
const productsPromise = fetchProducts().catch(() => null);

// geometrie (m) zoals in render/scene.py
const DZ = 0.75, PX = 0.44, YB = -0.06;
const PRN = { thuis: { w: 0.43, d: 0.34, h: 0.18 }, foto: { w: 0.45, d: 0.36, h: 0.18 }, zakelijk: { w: 0.43, d: 0.43, h: 0.36 } };
const isLaser = st => kind(st) === "zakelijk";
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

const Q = [
  {
    id: "gebruik", type: "radio",
    title: "Waarvoor ga je de printer vooral gebruiken?",
    sub: "De printer op het bureau wisselt mee.",
    why: "Thuisgebruik (documenten, af en toe een foto) vraagt om een compacte, betaalbare inkjetprinter. Vooral foto's afdrukken vraagt om een fotoprinter met meer kleuren en hogere afdrukkwaliteit. Zakelijk gebruik vraagt om een snellere, robuustere printer (vaak laser) met functies als automatische documentinvoer en dubbelzijdig printen.",
    options: [{ v: "thuis", label: "Thuisgebruik, zoals documenten en schoolwerk", price: "€" }, { v: "foto", label: "Vooral foto's en kleurrijk werk", price: "€€€" }, { v: "zakelijk", label: "Zakelijk, extra snel printen", price: "€€€" }],
  },
  {
    id: "volume", type: "radio",
    title: "Print je regelmatig grote oplages?",
    sub: "Zie wat er uit de printer komt.",
    why: "Print je vooral incidenteel, dan is een instapmodel ruim voldoende. Print je vaak grote oplages, dan zoeken we een printer die daar qua snelheid op berekend is.",
    options: [{ v: "gemiddeld", label: "Normaal gebruik, af en toe printen", price: "€" }, { v: "veel", label: "Veel, regelmatig grote oplages", price: "€€€" }],
  },
  {
    id: "aio", type: "radio",
    title: "Wil je naast printen ook scannen en/of kopiëren?",
    sub: "Een all-in-one heeft een scanner bovenop.",
    why: "Een all-in-one printer kan naast printen ook scannen en kopiëren, handig als je van één apparaat alles wilt kunnen. Heb je daar geen behoefte aan, dan houden we ook printer-only modellen in beeld.",
    options: [{ v: "ja", label: "Ja, graag een all-in-one", price: "€€" }, { v: "nee", label: "Nee, alleen printen is genoeg", price: "€" }],
  },
  {
    id: "kleur", type: "radio",
    title: "Print je weleens in kleur, of is zwart-wit genoeg?",
    sub: "Het geprinte vel laat het verschil zien.",
    why: "Print je vooral tekstdocumenten, dan is zwart-wit vaak voldoende en goedkoper in gebruik. Wil je ook foto's, kleurendocumenten of presentaties printen, dan zoeken we gericht naar printers die in kleur kunnen printen.",
    options: [{ v: "nee", label: "Alleen zwart-wit", price: "€" }, { v: "ja", label: "Ook in kleur", price: "€€" }],
  },
  {
    id: "inkt", type: "radio",
    title: "Wat vind je belangrijker: een lage aanschafprijs of lage kosten per pagina?",
    sub: "Zie waar de inkt zit.",
    why: "Printers met een navulbaar inktsysteem (zoals EcoTank of Smart Tank) kosten meer bij aanschaf, maar de inkt is daarna veel goedkoper per pagina. Printers met losse cartridges zijn goedkoper in aanschaf, maar de cartridges zijn relatief duur.",
    options: [{ v: "aanschafprijs", label: "Lage aanschafprijs is belangrijker", price: "€" }, { v: "tank", label: "Lage kosten per pagina", price: "€€€" }],
  },
  {
    id: "extra", type: "check", exclusive: "geen",
    title: "Wat is nog meer belangrijk voor jou?",
    sub: "Je keuzes verschijnen op de printer.",
    why: "Een automatische documentinvoer (ADF) is handig om meerdere pagina's achter elkaar te scannen of kopiëren zonder ze los in te leggen. Een display maakt de printer makkelijker te bedienen. Bluetooth laat je draadloos printen zonder wifi-netwerk.",
    options: [{ v: "adf", label: "Automatische documentinvoer (ADF)", price: "€€" }, { v: "display", label: "Display voor eenvoudige bediening", price: "€" }, { v: "bluetooth", label: "Bluetooth", price: "€€" }, { v: "geen", label: "Geen extra wensen", price: "€" }],
  },
];

const kind = st => st.gebruik || "thuis";
const dims = st => { const p = PRN[kind(st)]; return { ...p, x0: PX - p.w / 2, x1: PX + p.w / 2, yf: YB - p.d }; };
const isAio = st => st.q >= 2 && st.aio === "ja";

// wat er op het vel staat: foto-print, kleurendocument of zwart-wit
function sheetKind(st) {
  if (st.q >= 3 && st.kleur === "nee") return "zw";
  if (kind(st) === "foto") return "foto";
  if (st.q >= 3 && st.kleur === "ja") return "kleur";
  return kind(st) === "zakelijk" ? "zw" : "kleur";
}
const SHEETS = {
  zw: `<div class="pad"><h5>Offerte 2026-114</h5>${"<i></i>".repeat(14)}</div>`,
  kleur: `<div class="pad"><h5 style="color:#0954a3">Werkstuk: de kust</h5><img class="colorimg" src="shared/img/scherm/scherm-normaal.webp" alt=""><div class="bars"><b style="height:40%;background:#0954a3"></b><b style="height:70%;background:#c49a78"></b><b style="height:55%;background:#2e8b57"></b><b style="height:85%;background:#d08a16"></b></div>${"<i></i>".repeat(4)}</div>`,
  foto: `<img class="photo" src="shared/img/scherm/scherm-films.webp" alt="">`,
};

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
  const n = st.q >= 1 && st.volume === "veel" ? 10 : 1;
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

createQuiz3D({
  camera,
  steps: 6,
  state: { gebruik: null, volume: null, aio: null, kleur: null, inkt: null, extra: [] },
  imgPath: n => `printer/vragen/img/${n}.webp`,
  question: st => Q[st.q],
  setup, afterRender,

  images(st) {
    const k = kind(st);
    const list = ["bureau", k + (isAio(st) ? "-aio" : "")];
    if (st.q >= 4 && st.inkt === "tank" && k !== "zakelijk") list.push(`tank-${k}`);   // laser heeft geen inkttanks
    if (st.q === 5 && st.extra.includes("adf") && isAio(st) && k !== "zakelijk") list.push(`adf-${k}`);
    return list;
  },

  focus: () => ({ x: 0.3, y: -0.3, z: 0.9, zoom: 1.7 }),
  focusDesktop: st => ({ x: 0.36, y: -0.3, z: 0.9, zoom: 1.45, anchorX: st.q === 5 ? 0.55 : 0.62 }),

  overlays(ctx) {
    const { st } = ctx;
    if (st.q !== 5) return {};
    const d = dims(st);
    const top = DZ + d.h + (isAio(st) ? 0.03 : 0);
    const pts = [];
    if (st.extra.includes("adf")) pts.push({ x: PX, y: d.yf + 0.1, label: isAio(st) ? "<b>Documentinvoer</b>: stapel scannen in één keer" : "<b>Documentinvoer</b> hoort bij een all-in-one" });
    if (st.extra.includes("display")) pts.push({ x: isLaser(st) ? PX + 0.11 : d.x0 + 0.06, y: d.yf, label: "<b>Display</b>: makkelijk bedienen" });
    if (st.extra.includes("bluetooth")) pts.push({ x: d.x1 - 0.05, y: d.yf, label: "<b>Bluetooth</b>: printen zonder wifi" });
    return spotColumn(ctx, pts.map(p => ({ ...p, z: 0 })), { zBot: DZ + 0.06, zTop: top + 0.02, edgeX: d.x1 + 0.03, edgeY: d.yf });
  },

  hideCaption: (st, mobile) => st.q === 5 && !mobile,

  caption(st) {
    switch (st.q) {
      case 0: return {
        thuis: ["Thuisgebruik", "Een compacte inkjetprinter: betaalbaar en ruim genoeg voor documenten en af en toe een foto."],
        foto: ["Foto's", "Een fotoprinter met meer inktkleuren voor rijke, scherpe afdrukken."],
        zakelijk: ["Zakelijk", "Een snelle, robuuste (laser)printer die veel werk aankan."],
      }[st.gebruik] ?? ["Jouw werkplek", "Kies waarvoor je de printer gebruikt; de printer op het bureau wisselt mee."];
      case 1: return st.volume === "veel" ? ["Grote oplages", "Dan zoeken we een printer die snel is en veel papier aankan."] : st.volume ? ["Af en toe printen", "Een instapmodel is dan ruim voldoende."] : ["Oplage", "Kies hoeveel je meestal print."];
      case 2: return st.aio === "ja" ? ["All-in-one", "Met een scanner bovenop kun je ook scannen en kopiëren."] : st.aio ? ["Alleen printen", "Zonder scanner: compacter en voordeliger."] : ["Scannen en kopiëren", "Een all-in-one heeft een scanner bovenop."];
      case 3: return st.kleur === "ja" ? ["Ook in kleur", "Foto's, grafieken en presentaties komen in kleur uit de printer."] : st.kleur ? ["Alleen zwart-wit", "Voor tekst is zwart-wit genoeg en goedkoper per pagina."] : ["Kleur", "Kies of je ook in kleur print."];
      case 4: if (st.inkt === "tank" && isLaser(st)) return ["Lage kosten per pagina", "Een laserprinter heeft geen inkt maar toner. Voordelig per pagina zijn modellen met grote tonercartridges."];
        return st.inkt === "tank" ? ["Navulbare inkttanks", "Iets duurder bij aanschaf, daarna veel goedkoper per pagina. Je ziet het inktpeil aan de voorkant."] : st.inkt ? ["Losse cartridges", "Goedkoper in aanschaf; de cartridges zelf zijn relatief duur."] : ["Inkt", "Kies wat je belangrijker vindt."];
      default: return st.extra.some(e => e !== "geen") ? ["Jouw extra's", "De gemarkeerde punten laten zien waar je keuzes zitten."] : ["Extra's", "Vink aan wat je belangrijk vindt."];
    }
  },

  async finish(st) {
    const answers = { gebruik: st.gebruik ?? "", volume: st.volume ?? "", aio: st.aio ?? "", kleur: st.kleur ?? "", inkt: st.inkt ?? "", extraAnswers: st.extra };
    const raw = await productsPromise;
    const result = matchPrinters(normalizeProducts(raw ?? []), st.gebruik, null, answers);
    localStorage.setItem("printer_bestMatch", JSON.stringify(result.bestMatch));
    localStorage.setItem("printer_bestType", result.bestType ?? "");
    localStorage.setItem("printer_filteredMatchedPrinters", JSON.stringify(result.filteredMatchedPrinters));
    localStorage.setItem("printer_answers", JSON.stringify(answers));
    localStorage.setItem("printer_selectedGebruik", st.gebruik ?? "");
    window.location.href = "printer/resultaat";
  },

  preload: ["bureau", "thuis", "foto", "zakelijk", "thuis-aio", "foto-aio", "zakelijk-aio", "tank-thuis", "tank-foto", "adf-thuis", "adf-foto"],
});
