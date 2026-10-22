// Testversie van de beamer-vragenpagina in de 3D-woonkamer (dezelfde kamer als
// de tv-test, met salontafel). Drie lichtstanden van de kamer (dag, avond,
// donker) en drie beamers als transparante lagen (render/scene.py, --d 3).
// Het projectiescherm, het beeld en de lichtbundel tekent de pagina zelf met de
// camera uit Blender, zodat alles exact aansluit. Motor: shared/quiz3d.js.
import { createQuiz3D, makeCamera, spotColumn } from "../../shared/quiz3d.js";
import { matchBeamers, heeftWens, helderGenoeg, scherpGenoeg, draagbaarGenoeg } from "../js/matching.js";
import { normalizeProducts, parsePrice } from "../js/utils.js";
import { BUDGET_CAPS } from "../js/data.js";
import { fetchProducts } from "../js/supabase.js";

const camera = makeCamera({ camY: -(3 + 2.45) });
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

// geometrie (meters, zoals in render/scene.py)
const SCREEN = { w: 2.214, h: 1.245, z0: 0.75, y: -0.03 };      // 100 inch
const TY = -1.75;                                                  // salontafel
const LENS = { mini: [0, TY + 0.075, 0.45], groot: [-0.08, TY + 0.155, 0.465], ust: [0, -0.1, 0.68] };
const ROOM = { licht: "dag", normaal: "avond", donker: "donker" };
const CONTENT = { thuisbioscoop: "films", gamen: "gamen", mix: "normaal" };

// hoe het geprojecteerde beeld eruitziet bij elke lichtstand
const LOOK = {
  licht:   { img: "opacity:.5;filter:contrast(.55) brightness(1.12) saturate(.7)", beam: 0, glow: 0, layer: "" },
  normaal: { img: "opacity:.92;filter:contrast(.95)", beam: 0.09, glow: 0.22, layer: "brightness(.62)" },
  donker:  { img: "opacity:1;filter:contrast(1.05) saturate(1.1)", beam: 0.16, glow: 0.5, layer: "brightness(.3)" },
};
const SHARP = { "heel-goed": "", prima: "blur(1.4px)", "maakt-niet-uit": "blur(.7px)" };

const euro = n => "€" + Math.round(n).toLocaleString("nl-NL");
const Q = [
  {
    id: "gebruik", type: "radio",
    title: "Waarvoor ga je de beamer vooral gebruiken?",
    sub: "Op het scherm zie je waar het om draait.",
    why: "Een beamer voor thuisbioscoop legt de nadruk op contrast en beeldkwaliteit in het donker. Voor gamen is een lage inputlag belangrijk. Voor werk en presentaties telt vooral helderheid en makkelijk aansluiten. Gebruik je 'm voor van alles wat, dan kijken we breder.",
    options: [{ v: "thuisbioscoop", label: "Films en series thuis", price: "€€" }, { v: "gamen", label: "Gamen", price: "€€" }, { v: "werk", label: "Werk en presentaties", price: "€€" }, { v: "mix", label: "Een beetje van alles", price: "€€" }],
  },
  {
    id: "budget", type: "radio",
    title: "Wat wil je maximaal uitgeven?",
    sub: "Je krijgt de beste beamer binnen je budget.",
    why: "Met je budget zoeken we de beste beamer die je ook echt wilt kopen. Past een beamer die nog beter bij je wensen past net niet binnen je bedrag, dan laten we dat op de resultaatpagina zien.",
    options: [...BUDGET_CAPS.map(c => ({ v: String(c), label: `Tot ${euro(c)}` })), { v: "geen", label: "Geen voorkeur" }],
  },
  {
    id: "licht", type: "radio",
    title: "Hoe licht is de ruimte waar je 'm meestal gebruikt?",
    sub: "Zie wat omgevingslicht met het beeld doet.",
    why: "Hoe meer omgevingslicht, hoe meer ANSI lumen (helderheid) nodig is om een scherp, goed zichtbaar beeld te krijgen. Een verduisterde bioscoopkamer heeft aan weinig lumen genoeg; een ruimte met daglicht of felle lampen vraagt om een veel helderdere beamer.",
    options: [{ v: "donker", label: "Donker, verduisterd (bioscoopachtig)", price: "€" }, { v: "normaal", label: "Normaal verduisterd (avond, gordijnen dicht)", price: "€€" }, { v: "licht", label: "Vaak overdag of met lamplicht aan", price: "€€€" }],
  },
  {
    id: "beeldkwaliteit", type: "radio",
    title: "Hoe belangrijk is een scherp beeld voor je?",
    sub: "Op 100 inch zie je elk verschil in scherpte.",
    why: "Een hogere resolutie geeft een scherper, gedetailleerder beeld, vooral op een groot scherm, maar kost ook meer. Vind je \"gewoon prima\" ruim voldoende, dan hoeft het niet de scherpste (en duurste) variant te zijn.",
    options: [{ v: "heel-goed", label: "Heel belangrijk, het liefst zo scherp mogelijk", price: "€€€" }, { v: "prima", label: "Gewoon prima", price: "€" }, { v: "maakt-niet-uit", label: "Maakt me niet uit", price: "€€" }],
  },
  {
    id: "draagbaar", type: "radio",
    title: "Moet hij makkelijk mee te nemen zijn?",
    sub: "De beamer op de salontafel wisselt mee.",
    why: "Wil je de beamer regelmatig verplaatsen (andere kamer, mee op vakantie of camping), dan zoeken we gericht naar een licht en compact model. Blijft hij op een vaste plek staan, dan speelt gewicht geen rol.",
    options: [{ v: "ja", label: "Ja, licht en compact", price: "€" }, { v: "nee", label: "Nee, blijft op een vaste plek", price: "€€" }, { v: "maakt-niet-uit", label: "Maakt me niet uit", price: "€€" }],
  },
  {
    id: "extra", type: "check", exclusive: "geen",
    title: "Nog iets belangrijk?",
    sub: "Je keuzes verschijnen in beeld.",
    why: "Smart TV met apps laat je direct streamen zonder losse tv-stick. Een laser-lichtbron gaat veel langer mee dan een traditionele lamp. Een stil apparaat valt minder op tijdens het kijken. Kan hij dicht tegen de muur of het scherm staan, dan heb je minder ruimte nodig. Ingebouwde speakers hebben vrijwel alle beamers, daar hoef je niet op te letten.",
    options: [{ v: "smart-tv", label: "Smart TV met apps (Netflix e.d.)", price: "€€" }, { v: "laser", label: "Laser-lichtbron (lange levensduur)", price: "€€€" }, { v: "stil", label: "Stil apparaat (weinig ventilatorgeluid)", price: "€€" }, { v: "korte-worp", label: "Dicht tegen de muur kunnen zetten", price: "€€€" }, { v: "geen", label: "Geen voorkeur", price: "€" }],
  },
];
const QID = st => Q[st.q]?.id;
const NA = (st, id) => st.q >= Q.findIndex(q => q.id === id);   // deze vraag bereikt of voorbij

// ───────── live catalogus: budgettelling en grijze opties ─────────
let catalogus = null;
const capVan = v => (v && v !== "geen" ? Number(v) : null);
const zichtbaar = () => (catalogus ?? []).filter(b => (b.aanbieders ?? []).length >= 2);
function budgetCaption(st) {
  const cap = capVan(st.budget);
  if (!st.budget) return ["Jouw budget", "Kies wat je maximaal wilt uitgeven. Je krijgt de beste beamer binnen dat bedrag, en op de resultaatpagina zie je wat meer budget oplevert."];
  if (!catalogus) return [cap ? `Tot ${euro(cap)}` : "Geen voorkeur", cap ? "We zoeken de beste beamer binnen dit bedrag." : "We kiezen puur op je wensen."];
  const prijzen = zichtbaar().map(b => parsePrice(b.prijs));
  const binnen = cap ? prijzen.filter(x => x <= cap) : prijzen;
  if (!cap) return ["Geen voorkeur", `Alle ${prijzen.length} beamers doen mee, van ${euro(Math.min(...prijzen))} tot ${euro(Math.max(...prijzen))}. We kiezen puur op je wensen.`];
  return [`Tot ${euro(cap)}`, `${binnen.length} van de ${prijzen.length} beamers kosten ${euro(cap)} of minder, vanaf ${euro(Math.min(...binnen))}. We zoeken de beste die bij je wensen past.`];
}

// Grijs als er binnen het budget geen beamer bij 2+ winkels is die er zeker aan
// voldoet, samen met je eerdere keuzes. Zelfde regel als bij de andere
// keuzehulpen; bij een keuzerondje telt het eigen antwoord niet als eis.
const EIS = {
  licht: { normaal: b => helderGenoeg(b, "normaal") === true, licht: b => helderGenoeg(b, "licht") === true },
  beeldkwaliteit: { "heel-goed": b => scherpGenoeg(b, "heel-goed") === true, prima: b => scherpGenoeg(b, "prima") === true },
  draagbaar: { ja: b => draagbaarGenoeg(b, "ja") === true },
  extra: Object.fromEntries(["smart-tv", "laser", "stil", "korte-worp"].map(v => [v, b => heeftWens(b, v) === true])),
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
  if (!catalogus || !EIS[q.id]) return q;
  const cap = capVan(st.budget), alle = zichtbaar();
  const binnen = cap ? alle.filter(b => parsePrice(b.prijs) <= cap) : alle;
  return { ...q, options: q.options.map(o => {
    const eis = EIS[q.id][o.v];
    if (!eis) return o;
    let andere = eisenVan(st, q.id, o.v);
    if (!binnen.some(b => andere.every(f => f(b)))) andere = [];
    if (binnen.some(b => eis(b) && andere.every(f => f(b)))) return o;
    const erboven = alle.filter(b => eis(b) && andere.every(f => f(b))).map(b => parsePrice(b.prijs));
    const note = cap && erboven.length ? (andere.length && binnen.some(eis) ? `Samen met je andere keuzes pas vanaf ${euro(Math.min(...erboven))}.` : `Niet tot ${euro(cap)}; wel vanaf ${euro(Math.min(...erboven))}.`)
      : "Niet in combinatie met je andere keuzes.";
    return { ...o, disabled: true, note };
  }) };
}
const WENS_NAAM = { "smart-tv": "apps zoals Netflix", laser: "een laser-lichtbron", stil: "een stil apparaat", "korte-worp": "een korte projectieafstand" };
function extraCaption(st) {
  const wensen = st.extra.filter(e => e !== "geen");
  if (!wensen.length) return st.extra.length ? ["Geen voorkeur", "We kiezen puur op je eerdere antwoorden."] : ["Extra's", "Vink aan wat je belangrijk vindt."];
  if (!catalogus) return ["Jouw extra's", "De gemarkeerde punten laten zien waar je keuzes zitten."];
  const cap = capVan(st.budget);
  const lijst = zichtbaar().filter(b => !cap || parsePrice(b.prijs) <= cap);
  const eisen = eisenVan(st, "extra", null);
  const n = lijst.filter(b => eisen.every(f => f(b))).length;
  const wat = eisen.length > 1 ? "alles wat je koos" : WENS_NAAM[wensen[0]];
  const bij = cap ? " binnen je budget" : "";
  if (!n) return ["Jouw extra's", `Geen van de ${lijst.length} beamers${bij} heeft ${wat}. We tonen de beamers die er het meest van hebben.`];
  return ["Jouw extra's", `${n} van de ${lijst.length} beamers${bij} ${n === 1 ? "heeft" : "hebben"} ${wat}.`];
}

const light = st => st.licht || "normaal";
const ust = st => QID(st) === "extra" && st.extra.includes("korte-worp");
const projector = st => (ust(st) ? "ust" : NA(st, "draagbaar") && st.draagbaar === "ja" ? "mini" : "groot");

// ───────── scherm + lichtbundel (blijvende elementen) ─────────
let screenEl, imgEl, slideEl, glowEl, hudEl;
function setup(scene) {
  glowEl = document.createElement("div"); glowEl.className = "beam-glow";
  screenEl = document.createElement("div"); screenEl.className = "pscreen";
  screenEl.innerHTML = `<img alt=""><div class="hud" id="pjHud"><div class="pos">P3<small>/ 12</small></div><div class="lap">Ronde 2 / 5</div><div class="speed"><b>187</b><small>KM/U</small></div></div><div class="slide"><b>Kwartaalcijfers</b><span>Q3 · omzet en groei</span><div class="bars"><i style="height:45%"></i><i style="height:62%"></i><i style="height:58%"></i><i style="height:84%"></i></div><div class="kpi"><b>+24%</b><span>ten opzichte van Q2</span></div></div>`;
  scene.querySelector(".layers").after(glowEl, screenEl);
  imgEl = screenEl.querySelector("img"); slideEl = screenEl.querySelector(".slide");
  hudEl = screenEl.querySelector("#pjHud");
}

function afterRender(ctx) {
  const { st } = ctx;
  const tl = ctx.toPx(-SCREEN.w / 2, SCREEN.y, SCREEN.z0 + SCREEN.h), br = ctx.toPx(SCREEN.w / 2, SCREEN.y, SCREEN.z0);
  const pw = br.x - tl.x, ph = br.y - tl.y;
  Object.assign(screenEl.style, { left: `${tl.x}px`, top: `${tl.y}px`, width: `${pw}px`, height: `${ph}px` });
  screenEl.style.setProperty("--sw", pw);
  const look = LOOK[light(st)];
  const werk = st.gebruik === "werk";
  const src = `shared/img/scherm/scherm-${CONTENT[st.gebruik] ?? "films"}.webp`;
  if (imgEl.getAttribute("src") !== src) imgEl.src = src;
  hudEl.classList.toggle("is-on", st.gebruik === "gamen");
  const sharp = QID(st) === "beeldkwaliteit" && st.beeldkwaliteit ? SHARP[st.beeldkwaliteit] : "";
  const [op, filt] = look.img.split(";").map(s => s.split(":")[1]);
  for (const el of [imgEl, slideEl]) {
    el.style.opacity = (el === slideEl) === werk ? op : "0";
    el.style.filter = `${filt} ${sharp}`;
  }
  Object.assign(glowEl.style, { left: `${tl.x - pw * 0.25}px`, top: `${tl.y - ph * 0.3}px`, width: `${pw * 1.5}px`, height: `${ph * 1.6}px`, opacity: String(look.glow), backgroundImage: werk ? "none" : `url("${src}")`, backgroundColor: werk ? "#fff" : "" });
}

const quiz = createQuiz3D({
  camera,
  steps: Q.length,
  state: { gebruik: null, budget: null, licht: null, beeldkwaliteit: null, draagbaar: null, extra: [] },
  imgPath: n => `beamer/vragen/img/${n}.webp`,
  question: st => metBeschikbaarheid(st, Q[st.q]),
  setup, afterRender,

  images(st) {
    return [ROOM[light(st)], { name: projector(st), filter: LOOK[light(st)].layer }];
  },

  focus: () => ({ x: 0, y: SCREEN.y, z: 1.2, zoom: 1.1 }),

  overlays(ctx) {
    const { st } = ctx;
    let svg = "", html = "";
    // lichtbundel van de lens naar de vier hoeken van het scherm
    const look = LOOK[light(st)];
    if (look.beam) {
      const L = ctx.toPx(...LENS[projector(st)]);
      const c = [[-1, 1], [1, 1], [1, 0], [-1, 0]].map(([sx, sz]) => ctx.toPx(sx * SCREEN.w / 2, SCREEN.y, SCREEN.z0 + sz * SCREEN.h));
      const mid = ctx.toPx(0, SCREEN.y, SCREEN.z0 + SCREEN.h / 2);
      svg += `<defs><linearGradient id="beam" gradientUnits="userSpaceOnUse" x1="${L.x}" y1="${L.y}" x2="${mid.x}" y2="${mid.y}"><stop offset="0" stop-color="#fff" stop-opacity="${look.beam * 2.2}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>`;
      svg += `<polygon points="${[L, c[2], c[1], c[0], c[3]].map(p => `${p.x},${p.y}`).join(" ")}" fill="url(#beam)" style="stroke:none"/>`;
      svg += `<circle cx="${L.x}" cy="${L.y}" r="3" fill="#fff" style="stroke:none" opacity=".9"/>`;
    }
    if (QID(st) === "beeldkwaliteit" && st.beeldkwaliteit) {
      const p = ctx.toPx(SCREEN.w / 2, SCREEN.y, SCREEN.z0 + SCREEN.h);
      const t = { "heel-goed": "Zo scherp mogelijk: <b>4K</b>", prima: "Prima: <b>Full HD</b>", "maakt-niet-uit": "Scherpte <b>maakt niet uit</b>" }[st.beeldkwaliteit];
      html += `<div class="tag is-on" style="left:${p.x - 70}px;top:${p.y - 10}px">${t}</div>`;
    }
    if (QID(st) === "draagbaar" && st.draagbaar) {
      const pj = projector(st);
      const [x, y, z] = LENS[pj];
      const label = pj === "mini" ? "<b>Draagbaar</b>: licht en compact" : st.draagbaar === "nee" ? "<b>Vaste plek</b>: meer licht en beeld" : "Draagbaar of vast: <b>allebei goed</b>";
      const r = spotColumn(ctx, [{ x, y, z, label }], { zBot: z, zTop: z, edgeX: 0.9, edgeY: y });
      svg += r.svg; html += r.html;
    }
    if (QID(st) === "extra") {
      const [lx, ly, lz] = LENS[projector(st)];
      const onPj = [["laser", "<b>Laser</b>: gaat jaren mee"], ["stil", "<b>Stil</b>: weinig ventilator"], ["korte-worp", "<b>Korte worp</b>: vlak onder het scherm"]]
        .filter(([k]) => st.extra.includes(k));
      const pts = onPj.map(([, label], i) => ({ x: lx + (i - (onPj.length - 1) / 2) * 0.16, y: ly, z: lz, label }));
      let r = spotColumn(ctx, pts, { zBot: lz, zTop: lz, edgeX: 1.3, edgeY: ly });
      svg += r.svg; html += r.html;
      if (st.extra.includes("smart-tv")) {
        r = spotColumn(ctx, [{ x: SCREEN.w / 2 - 0.25, y: SCREEN.y, z: 0, label: "<b>Smart TV</b>: Netflix en meer ingebouwd" }], { zBot: SCREEN.z0 + SCREEN.h - 0.2, zTop: SCREEN.z0 + SCREEN.h - 0.2, edgeX: SCREEN.w / 2, edgeY: SCREEN.y });
        svg += r.svg; html += r.html;
      }
    }
    return { svg, html };
  },

  caption(st) {
    switch (QID(st)) {
      case "gebruik":
        return {
          thuisbioscoop: ["Films en series", "Contrast en diep zwart maken het verschil, vooral in een donkere kamer."],
          gamen: ["Gamen", "Een lage inputlag zorgt dat je beeld direct reageert op je controller."],
          werk: ["Werk en presentaties", "Helderheid en makkelijk aansluiten tellen hier het zwaarst."],
          mix: ["Een beetje van alles", "We zoeken een beamer die overal goed in is."],
        }[st.gebruik] ?? ["Jouw thuisbioscoop", "Een scherm van 100 inch aan de muur waar nu de tv hangt. Kies waarvoor je 'm gebruikt."];
      case "budget": return budgetCaption(st);
      case "licht":
        return {
          licht: ["Veel omgevingslicht", "Daglicht spoelt het beeld weg. Je hebt dan een heel heldere beamer nodig (veel ANSI lumen)."],
          normaal: ["Normaal verduisterd", "'s Avonds met de gordijnen dicht is een gemiddelde helderheid genoeg."],
          donker: ["Verduisterd", "In het donker is minder helderheid nodig en zie je het beste contrast."],
        }[st.licht] ?? ["Licht in de kamer", "Kies hoe licht het meestal is. Zie wat dat met het beeld doet."];
      case "beeldkwaliteit":
        return {
          "heel-goed": ["Zo scherp mogelijk", "Op een scherm van 100 inch zie je het verschil tussen 4K en Full HD echt."],
          prima: ["Gewoon prima", "Full HD is voor de meeste films en series ruim voldoende, en voordeliger."],
          "maakt-niet-uit": ["Maakt niet uit", "Dan weegt scherpte niet mee in het advies."],
        }[st.beeldkwaliteit] ?? ["Scherpte", "Kies hoe belangrijk een scherp beeld is."];
      case "draagbaar":
        return {
          ja: ["Draagbaar", "Klein en licht: makkelijk mee naar een andere kamer, de tuin of op vakantie."],
          nee: ["Vaste plek", "Een grotere beamer geeft meestal meer licht en een beter beeld."],
          "maakt-niet-uit": ["Maakt niet uit", "We kijken naar beide soorten."],
        }[st.draagbaar] ?? ["Meenemen?", "Kies of de beamer vaak verplaatst wordt."];
      default: return extraCaption(st);
    }
  },

  onNext(st, id) { meetStap(st, id); },

  async finish(st) {
    meetStap(st, "extra");
    const answers = { gebruik: st.gebruik ?? "", budget: capVan(st.budget), licht: st.licht ?? "", beeldkwaliteit: st.beeldkwaliteit ?? "", draagbaar: st.draagbaar ?? "", extraAnswers: st.extra };
    const beamers = normalizeProducts(await productenOfFout());
    // Beste match binnen het budget; past er niets binnen, dan zonder grens.
    let result = matchBeamers(beamers, answers);
    if (answers.budget && !result.bestMatch) result = matchBeamers(beamers, answers, null);
    localStorage.setItem("beamer_bestMatch", JSON.stringify(result.bestMatch));
    localStorage.setItem("beamer_bestType", result.bestType ?? "");
    localStorage.setItem("beamer_filteredMatchedBeamers", JSON.stringify(result.filteredMatchedBeamers));
    localStorage.setItem("beamer_answers", JSON.stringify(answers));
    window.location.href = "beamer/resultaat/";
  },

  preload: ["avond", "groot", "dag", "donker", "mini", "ust"],
});

// Meting: waar haken mensen af, en wat kiezen ze (o.a. de budgetvraag)
function meetStap(st, id) {
  const v = st[id];
  window.phTrackEvent?.("quiz_stap", {
    categorie: "beamer", stap: id, nr: Q.findIndex(q => q.id === id) + 1,
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
