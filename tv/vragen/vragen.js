// De tv-vragenpagina met een Blender-gerenderde woonkamer.
// De renders (tv/vragen/img) zijn per kijkafstand en per licht (dag/avond)
// gemaakt met een camera die recht op de tv-muur kijkt. Daardoor is een tv op die
// muur in beeld een exacte rechthoek en kunnen we hem met dezelfde cameragegevens
// als in Blender op ware grootte over de render leggen.
import { distanceToSizeGroup, budgetCapsBySize, sizeGroupToAllowedSizes } from "../js/data.js";
import { calculateScores, matchTVs } from "../js/matching.js";
import { normalizeProducts, parsePrice } from "../js/utils.js";
import { fetchProducts } from "../js/supabase.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

// ───────── camera (identiek aan scene.py) ─────────
const IMG_W = 2000, IMG_H = 1015, ASPECT = IMG_W / IMG_H;
const F = 22 / 36, SHIFT_X = -0.12, SHIFT_Y = -0.08, CAM_Z = 1.62, CAM_BACK = 2.45;
const TV_BOTTOM = 0.62;          // onderrand tv boven de vloer (m)
const TV_FRONT_Y = -0.035;       // voorkant tv t.o.v. de muur (m)

function project(D, x, y, z) {
  const depth = y + (D + CAM_BACK);
  return {
    u: 0.5 - SHIFT_X + F * x / depth,
    v: 0.5 + SHIFT_Y * ASPECT - F * ASPECT * (z - CAM_Z) / depth,
  };
}

// ───────── inhoud ─────────
const DIST = { "1m": 1, "1.5m": 1.5, "2m": 2, "2.5m": 2.5, "3m": 3, "3.5m": 3.5, "4m": 4, "bioscoop": 4 };
const DIST_LABEL = { "1m": "1 meter", "1.5m": "1,5 meter", "2m": "2 meter", "2.5m": "2,5 meter", "3m": "3 meter", "3.5m": "3,5 meter", "4m": "4 meter", "bioscoop": "4 meter" };
const SIZE_GROUPS = ["24-28", "32", "40-43", "48-50", "55", "58-65", "70-77", "83-86", "97-115"];
const SIZE_INCH = { "24-28": 24, "32": 32, "40-43": 43, "48-50": 50, "55": 55, "58-65": 65, "70-77": 75, "83-86": 85, "97-115": 100 };
const SIZE_LABEL = g => g.replace("-", "–") + " inch";

const tvDims = inch => ({ w: inch * 0.8716 * 0.0254, h: inch * 0.4903 * 0.0254 });
const cm = m => Math.round(m * 100);

const SCREENS = {
  films: "films", sport: "sport", gamen: "gamen", normaal: "normaal",
  zwart: "zwart", helderheid: "helder", kleur: "kleur",
};
const screenSrc = k => `shared/img/scherm/scherm-${SCREENS[k] ?? k}.webp`;
const roomSrc = (light, D) => `tv/vragen/img/kamer-${light}-${D}.webp`;

const QUESTIONS = [
  {
    id: "distance", type: "radio", two: true,
    title: "Hoe ver zit je van de televisie af?",
    sub: "Kies je kijkafstand. De bank schuift mee, zodat je ziet wat dat in je kamer betekent.",
    why: "De kijkafstand bepaalt mede welke tv-grootte het meest comfortabel is. Te dichtbij geeft een overweldigend en vermoeiend beeld; te ver weg en je mist fijne details. Op basis van jouw antwoord berekenen we een advies. In de volgende stap maak je de definitieve groottekeuze.",
    options: [["1m", "1 meter"], ["1.5m", "1,5 meter"], ["2m", "2 meter"], ["2.5m", "2,5 meter"], ["3m", "3 meter"], ["3.5m", "3,5 meter"], ["4m", "4 meter"], ["bioscoop", "Thuisbioscoop"]],
  },
  {
    id: "sizeGroup", type: "radio", two: true,
    title: "Welke grootte past bij jou?",
    sub: "",
    why: "Op basis van je kijkafstand laten we de aanbevolen schermgrootte zien. Je kunt het advies volgen of zelf een andere maat kiezen. De tv in beeld staat op ware grootte in de kamer, gezien vanaf jouw plek.",
    options: [],
  },
  {
    id: "budget", type: "radio",
    title: "Wat wil je maximaal uitgeven?",
    sub: "",
    why: "Met je budget zoeken we de beste tv die je ook echt wilt kopen. Past het type dat het best bij je wensen past niet binnen je bedrag, dan krijg je de beste keuze binnen je budget. Op de resultaatpagina laten we dan zien wat je voor meer geld krijgt.",
    options: [],
  },
  {
    id: "usage", type: "check", max: 2,
    title: "Waar ga je de tv voor gebruiken?",
    sub: "Kies er maximaal 2. Op het scherm zie je waar het bij elk gebruik om draait.",
    why: "Voor films en series telt vooral contrast: diep zwart in donkere scènes, waar OLED en Mini LED het sterkst in zijn. Voor sport kiezen we een tv met 100 Hz of meer, zodat snelle beelden scherp blijven. Voor gamen 120 Hz of meer, voor vloeiend beeld op een console of pc. Gebruik je de tv voor meer dingen, kies dan \"Een beetje van alles\".",
    options: [["films", "Films en series kijken", "€€€"], ["sport", "Sport kijken", "€€"], ["gamen", "Gamen", "€€"], ["normaal", "Normale televisie kijken", "€"], ["allround", "Een beetje van alles", "€€"]],
  },
  {
    id: "quality", type: "radio",
    title: "Hoe belangrijk vind je de beeldkwaliteit?",
    sub: "Het scherm laat het verschil zien tussen de niveaus.",
    why: "Wie het beste beeld wil, komt meestal uit bij een OLED- of Mini LED-tv. Wie goed beeld wil maar niet het duurste, zit vaak goed met een QLED- of Mini LED-tv. Is gewoon prima beeld genoeg, dan volstaat een LED-tv. Kies je voor het beste beeld, dan tonen we alleen 4K-tv's.",
    options: [["best", "Ik wil de best mogelijke beeldkwaliteit", "€€€"], ["belangrijk", "Belangrijk, maar ik hoef niet het beste", "€€"], ["prima", "Als het gewoon prima is ben ik tevreden", "€"]],
  },
  {
    id: "timing", type: "radio",
    title: "Wanneer kijk je meestal tv?",
    sub: "Zie hoe dezelfde kamer overdag en 's avonds verandert.",
    why: "In een donkere kamer kunnen OLED-tv's prachtig diepe zwarttinten tonen. Overdag zijn heldere LCD- of QLED-tv's beter bestand tegen invallend licht en weerspiegelingen. Kijk je op beide momenten, dan zoeken we een goede balans.",
    options: [["avonds", "In de avond als het donker is", "€€€"], ["overdag", "Overdag als het licht is", "€€"], ["beide", "Beide", "€€"], ["nvt", "Dit is voor mij niet belangrijk", "€"]],
  },
  {
    id: "viewing", type: "radio",
    title: "Hoe kijk je meestal tv?",
    sub: "In het bovenaanzicht zie je onder welke hoek iedereen naar het scherm kijkt.",
    why: "Hoe schuiner je kijkt, hoe meer kleur en contrast er bij veel tv's wegvallen. OLED blijft ook van opzij goed; bij LED- en QLED-tv's zie je het verschil eerder. Zit je altijd recht voor het scherm, dan kun je hierop besparen.",
    options: [["recht", "Met 1 of 2 mensen recht voor de tv", "€€"], ["meerdere", "Met meerdere mensen die niet recht voor de tv zitten", "€€€"], ["nvt", "Dit is voor mij niet belangrijk", "€"]],
  },
];

const IDX = Object.fromEntries(QUESTIONS.map((q, i) => [q.id, i]));
const QID = () => QUESTIONS[st.q]?.id;
const LAST = QUESTIONS.length - 1;
const euro = n => "€" + Math.round(n).toLocaleString("nl-NL");
// twee maximumbedragen plus "Geen maximum" ("geen" = geen plafond, alle tv's van de maat);
// alle opties in de taal van de vraag ("maximaal"), zodat niets als ondergrens leest
const budgetOpties = g => [...(budgetCapsBySize[g] ?? []).map(c => [String(c), `Tot ${euro(c)}`]), ["geen", "Geen maximum"]];
const capVan = v => (v && v !== "geen" ? Number(v) : null);

// Wat het gekozen budget betekent in de gekozen maat, uit de live catalogus (null zolang die laadt).
let catalogus = null;
function budgetInfo(g, cap) {
  if (!catalogus || !g) return null;
  const maten = sizeGroupToAllowedSizes[g] ?? [];
  const inMaat = catalogus.filter(t => maten.includes(t.grootte));
  const binnen = cap ? inMaat.filter(t => parsePrice(t.prijs) <= cap) : inMaat;
  const prijzen = binnen.map(t => parsePrice(t.prijs)).filter(Number.isFinite);
  const alle = inMaat.map(t => parsePrice(t.prijs)).filter(Number.isFinite);
  return {
    n: binnen.length, totaal: inMaat.length,
    vanaf: prijzen.length ? Math.min(...prijzen) : null,
    tot: alle.length ? Math.max(...alle) : null,
  };
}
function budgetTag(g) {
  if (!st.budget) return "";
  const cap = capVan(st.budget), info = budgetInfo(g, cap);
  const kop = cap ? `Tot ${euro(cap)}` : "Geen maximum";
  if (!info) return `<b>${kop}</b>`;
  return `<b>${kop}</b><span class="muted">${cap ? `${info.n} tv's` : `alle ${info.totaal} tv's`}</span>`;
}

const USAGE_CAPTION = {
  films: ["Films en series", "Donkere scènes vragen om hoog contrast en diep zwart, anders worden ze grijs en vlak."],
  sport: ["Sport", "Snelle beelden blijven scherp vanaf 100 Hz. Een bal die uitsmeert is het eerste wat opvalt."],
  gamen: ["Gamen", "Met 120 Hz of meer blijft het beeld vloeiend, ook bij snelle actie op een console of pc."],
  normaal: ["Gewoon tv kijken", "Nieuws, programma's en series: een goede basis is genoeg, daar hoeft geen topmodel voor."],
};
const QUALITY = {
  best: { label: "Topniveau", text: "OLED of high-end Mini-LED: diep zwart, rijke kleuren en veel detail in licht en donker.", filter: "contrast(1.1) saturate(1.12)" },
  belangrijk: { label: "Goed beeld", text: "Een QLED- of Mini LED-tv: mooi en helder beeld, net iets minder diepte in het donker dan OLED.", filter: "contrast(.96) saturate(.97) brightness(1.02)" },
  prima: { label: "Prima beeld", text: "Een degelijk instapmodel: prima voor dagelijks kijken, wat vlakker in contrast en kleur.", filter: "contrast(.84) saturate(.82) brightness(1.06) blur(.35px)" },
};
const TIMING_CAPTION = {
  avonds: ["'s Avonds", "In het donker zie je elk verschil in zwart. Daar zijn OLED-tv's op hun best."],
  overdag: ["Overdag", "Daglicht weerspiegelt in het scherm. Een heldere tv houdt het beeld dan krachtig."],
  beide: ["Overdag én 's avonds", "We zoeken een tv die in beide situaties overeind blijft: helder genoeg, met goed contrast."],
  nvt: ["Geen voorkeur", "Dan weegt het kijkmoment niet mee in het advies."],
};

// ───────── staat ─────────
const st = { q: 0, distance: null, sizeGroup: null, budget: null, usage: [], quality: null, timing: null, viewing: null };
let cycleTimer = null, cycleIdx = 0;
let lightTimer = null, lightAlt = "day";

// ───────── dom ─────────
const stage = $("#stage"), scene = $("#scene");
const rooms = [$("#roomA"), $("#roomB")];
const scr = [$("#scrA"), $("#scrB")];
const tv = $("#tv"), glow = $("#glow"), ghost = $("#ghost");
const tvTag = $("#tvTag"), ghostTag = $("#ghostTag");
const caption = $("#caption"), planSvg = $("#planSvg"), plan = $("#plan");
const mobileQuery = window.matchMedia("(max-width: 900px)");

// op mobiel staat de uitleg in de kaart onder het beeld, niet over de tv heen
// op mobiel staan bovenaanzicht en uitleg samen in de kaart onder het beeld
const infoRow = document.createElement("div");
infoRow.className = "info-row";
function placeCaption() {
  const step = $("#step");
  if (mobileQuery.matches) {
    if (infoRow.parentElement !== $("#card")) step.after(infoRow);
    infoRow.append(plan, caption);
  } else if (caption.parentElement !== stage) {
    stage.insertBefore(plan, $("#loading"));
    stage.insertBefore(caption, $("#loading"));
    infoRow.remove();
  }
}
placeCaption();
mobileQuery.addEventListener("change", () => { placeCaption(); render(false); });

// ───────── beeld-plaatsing (object-fit: cover met focus op de tv) ─────────
function layout() {
  const sw = stage.clientWidth, sh = stage.clientHeight;
  // op mobiel extra inzoomen op de tv; kleine tv's (korte afstand) het meest
  const D = currentD();
  const zoom = mobileQuery.matches ? (D <= 1.5 ? 1.6 : D <= 2.5 ? 1.45 : 1.3) : 1;
  const s = Math.max(sw / IMG_W, sh / IMG_H) * zoom;
  const dw = IMG_W * s, dh = IMG_H * s;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const focusV = mobileQuery.matches ? project(D, 0, 0, 1.0).v + 0.03 : 0.5;
  const x0 = clamp(sw / 2 - 0.63 * dw, sw - dw, 0);
  const y0 = clamp(sh / 2 - focusV * dh, sh - dh, 0);
  return { x0, y0, dw, dh };
}
const toPx = (L, p) => ({ x: L.x0 + p.u * L.dw, y: L.y0 + p.v * L.dh });

function placeRooms() {
  const L = layout();
  rooms.forEach(img => Object.assign(img.style, { left: `${L.x0}px`, top: `${L.y0}px`, width: `${L.dw}px`, height: `${L.dh}px` }));
  return L;
}

// ───────── kamerwissel met een kleine camerabeweging ─────────
let roomState = { key: null, D: null, front: 0 };
const imgCache = new Map();
function loadImg(src) {
  if (!imgCache.has(src)) {
    imgCache.set(src, new Promise(res => {
      const im = new Image();
      im.onload = () => res(true); im.onerror = () => res(false);
      im.src = src;
    }));
  }
  return imgCache.get(src);
}

function setRoom(light, D) {
  const key = `${light}-${D}`;
  if (roomState.key === key) return;
  const prevD = roomState.D;
  roomState.key = key; roomState.D = D;
  let src = roomSrc(light, D);
  loadImg(src).then(async ok => {
    if (roomState.key !== key) return;
    // ontbreekt een render, val dan terug op de dagversie in plaats van een kapot plaatje
    if (!ok && light !== "day") { src = roomSrc("day", D); ok = await loadImg(src); }
    if (!ok || roomState.key !== key) return;
    const back = rooms[1 - roomState.front], front = rooms[roomState.front];
    const L = layout();
    const c = toPx(L, project(D, 0, 0, 1.0));
    const origin = `${c.x - L.x0}px ${c.y - L.y0}px`;
    back.style.transition = "none";
    back.style.transformOrigin = origin; front.style.transformOrigin = origin;
    back.style.transform = prevD !== null && D > prevD ? "scale(1.06)" : "scale(1)";
    back.src = src;
    void back.offsetWidth;
    back.style.transition = "";
    back.classList.add("is-on");
    back.style.transform = "scale(1)";
    front.classList.remove("is-on");
    if (prevD !== null && D < prevD) front.style.transform = "scale(1.06)";
    roomState.front = 1 - roomState.front;
    $("#loading").classList.add("is-done");
  });
}

// ───────── scherminhoud ─────────
let screenState = { key: null, front: 0 };
function setScreen(key) {
  // filmbalken alleen bij de gebruiksvraag: elders lijkt de tv er kleiner door
  $("#letterbox").classList.toggle("is-on", key === "films" && QID() === "usage");
  if (screenState.key === key) return;
  screenState.key = key;
  const src = screenSrc(key);
  loadImg(src).then(ok => {
    if (!ok || screenState.key !== key) return;
    const back = scr[1 - screenState.front], front = scr[screenState.front];
    back.src = src;
    back.classList.add("is-on"); front.classList.remove("is-on");
    screenState.front = 1 - screenState.front;
  });
  glow.style.backgroundImage = `url("${src}")`;
  $$(".hud").forEach(h => h.classList.toggle("is-on", h.dataset.hud === key));
}

// ───────── afgeleide weergave per vraag ─────────
function currentD() { return st.distance ? DIST[st.distance] : 3; }
function advisedGroup() { return st.distance ? distanceToSizeGroup[st.distance] : null; }

function currentLight() {
  if (QID() === "timing" && st.timing === "beide") return lightAlt;
  if (st.q >= IDX.timing && st.timing === "avonds") return "night";
  return "day";
}

function contentKeys() {
  const id = QID();
  if (id === "usage") {
    const u = st.usage.includes("allround") ? ["films", "sport", "gamen", "normaal"] : st.usage;
    return u.length ? u : ["films", "sport", "gamen", "normaal"];
  }
  if (id === "timing" && st.timing === "overdag") return ["helderheid"];
  if (id === "viewing" || id === "budget") return ["normaal"];
  return ["films"];
}

function render(animatePlan = true) {
  const L = placeRooms();
  const D = currentD();
  const light = currentLight();
  setRoom(light, D);

  // tv
  const group = st.q >= 1 ? (st.sizeGroup ?? advisedGroup()) : null;
  const showTV = st.q >= 1 && group;
  if (showTV) {
    const { w, h } = tvDims(SIZE_INCH[group]);
    const tl = toPx(L, project(D, -w / 2, TV_FRONT_Y, TV_BOTTOM + h));
    const br = toPx(L, project(D, w / 2, TV_FRONT_Y, TV_BOTTOM));
    const pw = br.x - tl.x, ph = br.y - tl.y;
    Object.assign(tv.style, { left: `${tl.x}px`, top: `${tl.y}px`, width: `${pw}px`, height: `${ph}px` });
    tv.style.setProperty("--bezel", `${Math.max(1.5, pw * 0.007)}px`);
    tv.style.setProperty("--sw", pw);
    const night = light === "night";
    tv.style.boxShadow = night
      ? `0 ${pw * 0.01}px ${pw * 0.05}px rgba(0,0,0,.45)`
      : `${-pw * 0.02}px ${pw * 0.022}px ${pw * 0.06}px rgba(55,40,25,.32), ${-pw * 0.004}px ${pw * 0.004}px ${pw * 0.01}px rgba(55,40,25,.25)`;
    tv.classList.add("is-on");
    Object.assign(glow.style, { left: `${tl.x - pw * 0.28}px`, top: `${tl.y - ph * 0.35}px`, width: `${pw * 1.56}px`, height: `${ph * 1.7}px` });
    glow.style.opacity = night ? ".85" : ".16";
    const sheen = night ? .1 : (st.q >= IDX.timing && st.timing === "overdag" ? 1 : .45);
    $("#screen").style.setProperty("--sheen", sheen);

    // label boven de tv
    tvTag.innerHTML = QID() === "budget"
      ? budgetTag(group)
      : `<b>${SIZE_INCH[group]} inch</b><span class="muted">${cm(w)} × ${cm(h)} cm</span>`;
    Object.assign(tvTag.style, { left: `${(tl.x + br.x) / 2}px`, top: `${tl.y - 10}px` });
    tvTag.classList.toggle("is-on", QID() === "sizeGroup" || (QID() === "budget" && !!st.budget));
  } else {
    tv.classList.remove("is-on"); glow.style.opacity = "0"; tvTag.classList.remove("is-on");
  }

  // spookkader: het advies bij vraag 1, of het advies naast een afwijkende keuze bij vraag 2
  const adv = advisedGroup();
  const ghostOn = adv && (QID() === "distance" || (QID() === "sizeGroup" && st.sizeGroup && st.sizeGroup !== adv));
  if (ghostOn) {
    const { w, h } = tvDims(SIZE_INCH[adv]);
    const tl = toPx(L, project(D, -w / 2, TV_FRONT_Y, TV_BOTTOM + h));
    const br = toPx(L, project(D, w / 2, TV_FRONT_Y, TV_BOTTOM));
    Object.assign(ghost.style, { left: `${tl.x}px`, top: `${tl.y}px`, width: `${br.x - tl.x}px`, height: `${br.y - tl.y}px` });
    ghost.classList.add("is-on");
    ghostTag.innerHTML = QID() === "distance"
      ? `Advies: <b>${SIZE_LABEL(adv)}</b>`
      : `<span class="muted">Advies</span> <b>${SIZE_INCH[adv]} inch</b>`;
    const tagTop = QID() === "sizeGroup" ? br.y + 34 : tl.y - 10;
    Object.assign(ghostTag.style, { left: `${(tl.x + br.x) / 2}px`, top: `${tagTop}px` });
    // bij vraag 2 spreekt het kader voor zich; alleen bij vraag 1 een label
    ghostTag.classList.toggle("is-on", QID() === "distance");
  } else {
    ghost.classList.remove("is-on"); ghostTag.classList.remove("is-on");
  }

  // scherminhoud (wisselt elke paar seconden bij meerdere keuzes)
  const keys = contentKeys();
  clearInterval(cycleTimer);
  cycleIdx = cycleIdx % keys.length;
  setScreen(keys[cycleIdx]);
  updateCaption(keys[cycleIdx]);
  if (keys.length > 1) {
    cycleTimer = setInterval(() => {
      cycleIdx = (cycleIdx + 1) % keys.length;
      setScreen(keys[cycleIdx]); updateCaption(keys[cycleIdx]);
    }, 3200);
  }

  // beeldkwaliteit alleen bij de kwaliteitsvraag demonstreren
  const filt = QID() === "quality" && st.quality ? QUALITY[st.quality].filter : "none";
  scr.forEach(i => { i.style.filter = filt; });

  // dag/avond afwisselen bij "beide"
  clearInterval(lightTimer);
  if (QID() === "timing" && st.timing === "beide") {
    lightTimer = setInterval(() => { lightAlt = lightAlt === "day" ? "night" : "day"; render(false); }, 3400);
  }

  $("#progress").style.width = `${((st.q + 1) / QUESTIONS.length) * 100}%`;
  // bovenaanzicht alleen waar het iets toevoegt: afstand, grootte en kijkhoek
  plan.classList.toggle("is-hidden", !["distance", "sizeGroup", "viewing"].includes(QID()));
  drawPlan(animatePlan);
}

// ───────── uitleg-chip ─────────
let lastCaption = "";
function updateCaption(key) {
  let t = "", s = "";
  const d = st.distance ? DIST_LABEL[st.distance] : null;
  switch (QID()) {
    case "distance":
      if (!st.distance) { t = "Jouw woonkamer"; s = "Kies een kijkafstand. De bank schuift mee en we tekenen de tv-maat die daarbij past op de muur."; }
      else if (st.distance === "bioscoop") { t = "Thuisbioscoop"; s = "Zo groot als het kan: vanaf 4 meter past een scherm van 97 tot 115 inch. Het gestippelde kader toont die maat op ware grootte."; }
      else { t = `Kijkafstand ${d}`; s = `Daarbij past een tv van ${SIZE_LABEL(advisedGroup())}. Het gestippelde kader toont die maat op ware grootte.`; }
      break;
    case "sizeGroup": {
      const g = st.sizeGroup;
      t = `${SIZE_INCH[g]} inch vanaf ${d}`;
      s = g === advisedGroup()
        ? "Dit is ons advies. Zo groot hangt hij aan de muur, gezien vanaf jouw plek op de bank."
        : (SIZE_GROUPS.indexOf(g) > SIZE_GROUPS.indexOf(advisedGroup())
          ? "Groter dan ons advies: indrukwekkend, maar van dichtbij kan het vermoeiend kijken."
          : "Kleiner dan ons advies: rustig in de kamer, maar je mist van deze afstand wat detail.");
      break;
    }
    case "budget": {
      const cap = capVan(st.budget), info = budgetInfo(st.sizeGroup, cap);
      if (!st.budget) { t = "Jouw budget"; s = "Kies wat je maximaal wilt uitgeven. Je krijgt de beste tv binnen dat bedrag, en op de resultaatpagina zie je wat meer budget oplevert."; }
      else if (!info) { t = cap ? `Tot ${euro(cap)}` : "Geen maximum"; s = cap ? "We zoeken de beste tv binnen dit bedrag." : "We kiezen puur op je wensen."; }
      else if (!cap) { t = "Geen maximum"; s = `Alle ${info.totaal} tv's doen mee, van ${euro(info.vanaf)} tot ${euro(info.tot)}. We kiezen puur op je wensen.`; }
      else if (!info.n) { t = `Tot ${euro(cap)}`; s = "In deze maat is er geen tv binnen dit bedrag. We tonen dan de tv's die het best bij je passen, net erboven."; }
      else { t = `Tot ${euro(cap)}`; s = `${info.n} van de ${info.totaal} tv's van deze maat kosten ${euro(cap)} of minder, vanaf ${euro(info.vanaf)}. We zoeken de beste die bij je wensen past.`; }
      break;
    }
    case "usage": [t, s] = USAGE_CAPTION[key] ?? ["Waarvoor gebruik je de tv?", "Kies wat je het meest doet. Het scherm laat zien waar het om draait."];
      if (!st.usage.length) { t = "Waarvoor gebruik je de tv?"; s = "Films, sport, gamen of gewoon tv: elk gebruik stelt andere eisen aan het scherm."; }
      break;
    case "quality":
      if (st.quality) { t = QUALITY[st.quality].label; s = QUALITY[st.quality].text; }
      else { t = "Beeldkwaliteit"; s = "Kies een niveau en zie op het scherm wat het verschil in contrast en kleur doet."; }
      break;
    case "timing":
      if (st.timing) [t, s] = TIMING_CAPTION[st.timing];
      else { t = "Licht in de kamer"; s = "Daglicht en avondlicht vragen iets anders van een tv. Kies wanneer je meestal kijkt."; }
      break;
    case "viewing":
      if (st.viewing === "meerdere") { t = "Schuin kijken"; s = "Wie aan de zijkant zit, kijkt onder een flinke hoek. Kies dan een paneel met brede kijkhoek, zoals OLED."; }
      else if (st.viewing === "recht") { t = "Recht ervoor"; s = "Iedereen kijkt vrijwel recht op het scherm. Dan maakt het paneeltype weinig uit en kun je besparen."; }
      else { t = "Kijkhoek"; s = "Hoe schuiner je kijkt, hoe meer kleur en contrast wegvallen bij veel tv's. Het bovenaanzicht toont de hoeken."; }
      break;
  }
  const html = `<strong>${t}</strong>${s}`;
  if (html === lastCaption) return;
  lastCaption = html;
  caption.classList.add("is-swap");
  setTimeout(() => { caption.innerHTML = html; caption.classList.remove("is-swap"); }, 180);
}

// ───────── bovenaanzicht ─────────
const P = { s: 31, ox: 8, oy: 8, x0: -2.7, x1: 2.4, y0: 0, y1: -4.9 };
const px = x => P.ox + (x - P.x0) * P.s;
const py = y => P.oy + (P.y0 - y) * P.s;
let planAnim = { D: null, w: null, raf: 0 };

function drawPlan(animate) {
  const D = currentD();
  const group = st.q >= 1 ? (st.sizeGroup ?? advisedGroup()) : null;
  const w = group ? tvDims(SIZE_INCH[group]).w : (advisedGroup() ? tvDims(SIZE_INCH[advisedGroup()]).w : 0);
  const from = { D: planAnim.D ?? D, w: planAnim.w ?? w };
  cancelAnimationFrame(planAnim.raf);
  if (!animate || (from.D === D && from.w === w)) { planAnim.D = D; planAnim.w = w; paintPlan(D, w); return; }
  const t0 = performance.now(), dur = 750;
  const step = now => {
    // het rAF-tijdstip kan net vóór t0 liggen: dan zou k (en de tv-breedte) even negatief zijn
    const k = Math.max(0, Math.min(1, (now - t0) / dur));
    const e = 1 - Math.pow(1 - k, 3);
    planAnim.D = from.D + (D - from.D) * e; planAnim.w = from.w + (w - from.w) * e;
    paintPlan(planAnim.D, planAnim.w);
    if (k < 1) planAnim.raf = requestAnimationFrame(step);
  };
  planAnim.raf = requestAnimationFrame(step);
}

function armchairPos(D) {
  return { x: 1.85, y: -D + 0.7 };
}

function paintPlan(D, w) {
  const q = st.q, kijkhoek = QID() === "viewing";
  const H = py(P.y1) + 6;
  planSvg.setAttribute("viewBox", `0 0 ${px(P.x1) + 8} ${H}`);
  const ink = "#1d1d1f", accent = "#0954a3";
  let g = "";
  // vloer en muren
  g += `<rect x="${px(P.x0)}" y="${py(0)}" width="${px(P.x1) - px(P.x0)}" height="${py(P.y1) - py(0)}" fill="#eeeae3"/>`;
  g += `<path d="M${px(P.x0)} ${py(P.y1)} V${py(0)} H${px(P.x1)} V${py(-0.55)}" fill="none" stroke="${ink}" stroke-width="3.2" stroke-linecap="square"/>`;
  g += `<path d="M${px(P.x1)} ${py(-4.4)} V${py(P.y1)}" fill="none" stroke="${ink}" stroke-width="3.2"/>`;
  // meubel en tv
  g += `<rect x="${px(-1.55)}" y="${py(0)}" width="${3.1 * P.s}" height="${0.42 * P.s}" fill="#c49a78" rx="1"/>`;
  if (w) g += `<rect x="${px(-w / 2)}" y="${py(-0.02) - 1}" width="${w * P.s}" height="3" rx="1" fill="${ink}"/>`;
  // extra zitplek aan de zijkant, alleen bij de kijkhoekvraag
  const ac = armchairPos(D);
  if (kijkhoek && st.viewing === "meerdere") g += `<circle cx="${px(ac.x)}" cy="${py(ac.y)}" r="${0.3 * P.s}" fill="#d9d2c6" stroke="#a79d8e" stroke-dasharray="2 2"/>`;
  // bank (rugleuning aan de achterkant, zitting richting tv)
  const yb = -D - 0.45;
  g += `<rect x="${px(-1.18)}" y="${py(yb + 0.98)}" width="${2.36 * P.s}" height="${0.98 * P.s}" rx="5" fill="#a39a8c"/>`;
  g += `<rect x="${px(-1.18)}" y="${py(yb + 0.22)}" width="${2.36 * P.s}" height="${0.22 * P.s}" rx="3" fill="#877e70"/>`;

  // kijklijnen
  const tvc = { x: 0, y: -0.02 };
  const seats = [];
  if (kijkhoek && st.viewing === "meerdere") {
    seats.push({ x: -0.72, y: -D }, { x: 0.72, y: -D }, { x: ac.x - 0.05, y: ac.y - 0.05 });
  } else if (kijkhoek && st.viewing === "recht") {
    seats.push({ x: -0.3, y: -D }, { x: 0.3, y: -D });
  } else if (q <= 1) {
    seats.push({ x: 0, y: -D });
  }
  seats.forEach(s => {
    const ang = Math.round(Math.atan2(Math.abs(s.x - tvc.x), Math.abs(s.y - tvc.y)) * 180 / Math.PI);
    const col = kijkhoek ? (ang < 20 ? "#2e8b57" : ang < 35 ? "#d08a16" : "#c4452d") : accent;
    g += `<line x1="${px(s.x)}" y1="${py(s.y)}" x2="${px(tvc.x)}" y2="${py(tvc.y)}" stroke="${col}" stroke-width="1.5" stroke-dasharray="${kijkhoek ? "0" : "3 3"}" opacity=".9"/>`;
    g += `<circle cx="${px(s.x)}" cy="${py(s.y)}" r="4.2" fill="#fff" stroke="${col}" stroke-width="2"/>`;
    if (kijkhoek) {
      const lx = px(s.x), ly = py(s.y) + (s.x > 1.3 ? -9 : 17);
      g += `<text x="${lx}" y="${ly}" font-size="10.5" font-weight="700" fill="${col}" text-anchor="middle" font-family="Inter,sans-serif" stroke="#fff" stroke-width="3" paint-order="stroke">${ang}°</text>`;
    }
  });

  // maatlijn kijkafstand
  if (q <= 1) {
    const xl = -2.2;
    g += `<g stroke="${accent}" stroke-width="1.2"><line x1="${px(xl)}" y1="${py(-0.02)}" x2="${px(xl)}" y2="${py(-D)}"/>`;
    g += `<line x1="${px(xl) - 4}" y1="${py(-0.02)}" x2="${px(xl) + 4}" y2="${py(-0.02)}"/><line x1="${px(xl) - 4}" y1="${py(-D)}" x2="${px(xl) + 4}" y2="${py(-D)}"/></g>`;
    const label = (Math.round(D * 10) / 10).toLocaleString("nl-NL") + " m";
    g += `<g transform="translate(${px(xl) + 6} ${(py(-0.02) + py(-D)) / 2})"><rect x="0" y="-9" width="30" height="18" rx="9" fill="${accent}"/><text x="15" y="4" font-size="10.5" font-weight="700" fill="#fff" text-anchor="middle" font-family="Inter,sans-serif">${label}</text></g>`;
  }
  planSvg.innerHTML = g;
}

// ───────── vraagkaart ─────────
function renderQuestion(dir = 1) {
  const Q = QUESTIONS[st.q];
  const body = $("#qBody");
  body.classList.add("is-out");
  setTimeout(() => {
    $("#step").textContent = `Vraag ${st.q + 1} van ${QUESTIONS.length}`;
    let opts = Q.options;
    let sub = Q.sub;
    if (Q.id === "sizeGroup") {
      const adv = advisedGroup();
      opts = SIZE_GROUPS.map(g => [g, SIZE_LABEL(g), g === adv ? "advies" : ""]);
      sub = `Vanaf ${DIST_LABEL[st.distance]} adviseren we ${SIZE_LABEL(adv)}. De tv hangt op ware grootte aan de muur; kies gerust een andere maat.`;
    }
    if (Q.id === "budget") {
      opts = budgetOpties(st.sizeGroup);
      sub = `Bedragen voor een tv van ${SIZE_LABEL(st.sizeGroup)}. Je krijgt de beste tv binnen je budget.`;
    }
    const sel = st[Q.id];
    const isChecked = v => Array.isArray(sel) ? sel.includes(v) : sel === v;
    body.innerHTML = `
      <h2 class="q-title">${Q.title}</h2>
      ${sub ? `<p class="q-sub">${sub}</p>` : ""}
      <button class="why" type="button" aria-expanded="false">Waarom deze vraag? <span aria-hidden="true">›</span></button>
      <p class="why-text">${Q.why}</p>
      <div class="answers ${Q.two ? "two" : ""}" role="${Q.type === "radio" ? "radiogroup" : "group"}">
        ${opts.map(([v, label, extra]) => `
          <label class="opt ${Q.type === "check" ? "is-check" : ""}">
            <input type="${Q.type === "radio" ? "radio" : "checkbox"}" name="${Q.id}" value="${v}" ${isChecked(v) ? "checked" : ""}>
            <span class="dot" aria-hidden="true"></span>
            <span>${label}</span>
            ${extra === "advies" ? `<span class="advised">advies</span>` : extra ? `<span class="price">${extra}</span>` : ""}
          </label>`).join("")}
      </div>
      <p class="hint" id="hint"></p>
      <div class="nav">
        ${st.q > 0 ? `<button class="btn btn-back" type="button" id="back">Terug</button>` : ""}
        <button class="btn btn-next" type="button" id="next">${st.q === LAST ? "Bekijk mijn advies" : "Volgende"}</button>
      </div>`;
    body.classList.remove("is-out");

    const why = $(".why", body), whyText = $(".why-text", body);
    why.addEventListener("click", () => {
      const open = whyText.classList.toggle("is-open");
      why.setAttribute("aria-expanded", open ? "true" : "false");
    });
    $$("input", body).forEach(inp => inp.addEventListener("change", () => onAnswer(Q, inp)));
    $("#next", body).addEventListener("click", next);
    $("#back", body)?.addEventListener("click", back);
  }, dir ? 160 : 0);
}

function onAnswer(Q, inp) {
  const hint = $("#hint");
  hint.textContent = "";
  if (Q.type === "radio") {
    st[Q.id] = inp.value;
  } else {
    let arr = $$(`input[name="${Q.id}"]:checked`).map(i => i.value);
    const exclusive = Q.id === "usage" ? "allround" : "niks";
    if (inp.checked && inp.value === exclusive) arr = [exclusive];
    else if (inp.checked) arr = arr.filter(v => v !== exclusive);
    const counted = arr.filter(v => v !== exclusive);
    if (counted.length > Q.max) {
      arr = arr.filter(v => v !== inp.value);
      hint.textContent = `Je kunt maximaal ${Q.max} antwoorden kiezen.`;
    }
    $$(`input[name="${Q.id}"]`).forEach(i => { i.checked = arr.includes(i.value); });
    st[Q.id] = arr;
    // de zojuist aangevinkte keuze meteen op het scherm tonen
    const keys = contentKeysFor(Q.id, arr);
    const idx = keys.indexOf(inp.value === "allround" ? "films" : inp.value);
    cycleIdx = inp.checked && idx >= 0 ? idx : 0;
  }
  if (Q.id === "distance") st.sizeGroup = null;
  render();
}
function contentKeysFor(id, arr) {
  if (id === "usage") return arr.includes("allround") ? ["films", "sport", "gamen", "normaal"] : arr;
  return arr.filter(x => x !== "niks");
}

function next() {
  const Q = QUESTIONS[st.q];
  const v = st[Q.id];
  if (!v || (Array.isArray(v) && v.length === 0)) {
    $("#hint").textContent = Q.type === "check" ? "Kies minimaal 1 antwoord." : "Kies een antwoord om verder te gaan.";
    return;
  }
  if (st.q === LAST) return finish();
  if (Q.id === "distance") st.sizeGroup = advisedGroup();
  // andere maat gekozen: een eerder gekozen bedrag hoort misschien niet meer bij de opties
  if (Q.id === "sizeGroup" && !budgetOpties(st.sizeGroup).some(([v]) => v === st.budget)) st.budget = null;
  st.q += 1;
  cycleIdx = 0;
  renderQuestion(1);
  render();
}

function back() {
  if (st.q === 0) return;
  const Q = QUESTIONS[st.q];
  st[Q.id] = Array.isArray(st[Q.id]) ? [] : null;
  if (Q.id === "sizeGroup") st.sizeGroup = null;
  st.q -= 1;
  cycleIdx = 0;
  renderQuestion(0);
  render();
}

// ───────── zelfde matching als de echte keuzehulp ─────────
let productsPromise = null;
const prefetch = () => (productsPromise ??= fetchProducts().catch(() => null));

function finish() {
  const btn = $("#next");
  btn.disabled = true; btn.textContent = "Advies berekenen…";
  const answers = {
    usageAnswers: st.usage, quality: st.quality ?? "", timing: st.timing ?? "",
    viewing: st.viewing ?? "", extraAnswers: [], budget: capVan(st.budget),
  };
  const scores = calculateScores(answers);
  $("#hint").textContent = "";
  // Mislukt het ophalen, dan één keer opnieuw; lukt dat ook niet, dan een
  // melding met "Opnieuw proberen" in plaats van een lege resultaatpagina.
  prefetch().then(raw => raw ?? (productsPromise = null, prefetch())).then(raw => {
    if (!raw?.length) {
      btn.disabled = false; btn.textContent = "Opnieuw proberen";
      $("#hint").textContent = "We konden de tv's op dit moment niet ophalen. Controleer je internetverbinding en probeer het opnieuw.";
      productsPromise = null;
      return;
    }
    const tvs = normalizeProducts(raw);
    // Beste match binnen het budget (matchTVs scoort elke tv binnen maat en budget).
    // Past er in deze maat helemaal niets binnen, dan zonder grens.
    let result = matchTVs(tvs, st.sizeGroup, answers.budget ? { min: 0, max: answers.budget } : null, answers, scores);
    if (answers.budget && !result.bestMatch) result = matchTVs(tvs, st.sizeGroup, null, answers, scores);
    localStorage.setItem("bestMatch", JSON.stringify(result.bestMatch));
    localStorage.setItem("bestType", result.bestType ?? "");
    localStorage.setItem("scores", JSON.stringify(scores));
    localStorage.setItem("filteredMatchedTVs", JSON.stringify(result.filteredMatchedTVs));
    localStorage.setItem("answers", JSON.stringify(answers));
    localStorage.setItem("selectedSizeGroup", st.sizeGroup ?? "");
    window.location.href = "tv/resultaat/";
  });
}

// ───────── start ─────────
function warmCache() {
  const list = [];
  ["1", "1.5", "2", "2.5", "3", "3.5", "4"].forEach(d => list.push(roomSrc("day", d)));
  Object.keys(SCREENS).forEach(k => list.push(screenSrc(k)));
  ["1", "1.5", "2", "2.5", "3", "3.5", "4"].forEach(d => list.push(roomSrc("night", d)));
  let i = 0;
  const nextOne = () => { if (i < list.length) loadImg(list[i++]).then(nextOne); };
  nextOne(); nextOne();
}

// Alleen voor het testen van losse stappen: #q=3&distance=3m&usage=films,sport
if (location.hash.length > 1) {
  const h = new URLSearchParams(location.hash.slice(1));
  ["distance", "sizeGroup", "budget", "quality", "timing", "viewing"].forEach(k => { if (h.get(k)) st[k] = h.get(k); });
  ["usage"].forEach(k => { if (h.get(k)) st[k] = h.get(k).split(","); });
  if (st.distance && !st.sizeGroup) st.sizeGroup = advisedGroup();
  st.q = Math.max(0, Math.min(LAST, (parseInt(h.get("q"), 10) || 1) - 1));
}

renderQuestion(0);
render(false);
prefetch().then(raw => {
  if (!raw?.length) return;
  catalogus = normalizeProducts(raw);
  if (QID() === "budget") render(false);
});
window.addEventListener("load", warmCache);
let rt;
window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => render(false), 60); });
