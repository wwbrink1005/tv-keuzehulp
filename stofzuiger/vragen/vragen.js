// Testversie van de stofzuiger-vragenpagina in de 3D-woonkamer. Basisrender = de
// kamer met vloerkleed en eiken vloer; de stofzuiger (slede met of zonder zak, of
// een steelstofzuiger) en de hondenmand zijn transparante lagen (render/scene.py,
// dezelfde scène als de robotstofzuiger-test). Vloervlakken, stof en accu tekent
// de pagina zelf in perspectief. Motor: shared/quiz3d.js.
import { createQuiz3D, makeCamera } from "../../shared/quiz3d.js";
import { matchStofzuigers, heeftExtra, voldoetAanZak, LOOPTIJD_MIN, ACTIERADIUS_MIN } from "../js/matching.js";
import { normalizeProducts, parsePrice } from "../js/utils.js";
import { fetchProducts } from "../js/supabase.js";

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
const RUG = { x0: -1.05, x1: 0.35, y0: -2.0, y1: -0.6 };
const VAC = { x: 0.88, y: -1.0 };
const ROT = { cil: 200, steel: -35 };
// lokaal punt van de stofzuiger (voorkant = +x, oorsprong = voet) naar wereldcoördinaten
function W(kind, [lx, ly, lz]) {
  const a = ROT[kind] * Math.PI / 180;
  return [VAC.x + lx * Math.cos(a) - ly * Math.sin(a), VAC.y + lx * Math.sin(a) + ly * Math.cos(a), lz];
}
const isSteel = st => st.stofzuigerType === "Steelstofzuiger";
const kind = st => (isSteel(st) ? "steel" : "cil");
const typeNaam = st => (isSteel(st) ? "steelstofzuigers" : "sledestofzuigers");

// Sinds okt. 2026: budget, woninggrootte (snoerlengte of accuduur) en een
// extra's-vraag in plaats van de vloer- en huisdierenvraag (zie
// docs/stofzuiger-keuzehulp-werking.md).
const euro = n => "€" + Math.round(n).toLocaleString("nl-NL");
const BUDGET_CAPS = { Cilinderstofzuiger: [150, 250], Steelstofzuiger: [300, 500] };
const Q_TYPE = {
  id: "stofzuigerType", type: "radio",
  title: "Wat voor stofzuiger zoek je?",
  sub: "De stofzuiger in de kamer wisselt mee.",
  why: "Een stofzuiger met snoer (sledestofzuiger) is doorgaans krachtiger en heeft geen oplaadtijd. Een steelstofzuiger is draadloos, licht en wendbaar, maar heeft een beperkte accuduur. Dit bepaalt sterk welke stofzuigers voor je in aanmerking komen.",
  options: [{ v: "Cilinderstofzuiger", label: "Met snoer, krachtig", price: "€" }, { v: "Steelstofzuiger", label: "Steelstofzuiger, draadloos, licht en wendbaar", price: "€€€" }],
};
const Q_BUDGET = {
  id: "budget", type: "radio",
  title: "Wat wil je maximaal uitgeven?",
  sub: st => `Bedragen voor een ${isSteel(st) ? "steelstofzuiger" : "stofzuiger met snoer"}. Je krijgt de beste binnen je budget.`,
  why: "Met je budget zoeken we de beste stofzuiger die je ook echt wilt kopen. Past een stofzuiger die nog beter bij je wensen past net niet binnen je bedrag, dan laten we dat op de resultaatpagina zien.",
  options: [],   // per type, zie question() hieronder
};
const Q_WONING = {
  id: "woning", type: "radio",
  title: "Hoe groot is je woning?",
  sub: st => (isSteel(st) ? "Daar hangt af hoe lang de accu mee moet." : "Daar hangt af hoe lang het snoer moet zijn."),
  why: "Met een steelstofzuiger wil je in één keer rond kunnen: voor een appartement is 30 minuten genoeg, voor een groot huis of met trappen minstens een uur. Bij een stofzuiger met snoer bepaalt de actieradius (snoer plus slang) hoe vaak je de stekker moet verplaatsen: 8 meter voor een appartement, 12 meter voor een groot huis.",
  options: [{ v: "klein", label: "Appartement of klein huis", price: "€" }, { v: "gemiddeld", label: "Gemiddeld huis", price: "€€" }, { v: "groot", label: "Groot huis of met trappen", price: "€€€" }],
};
const Q_ZAK = {
  id: "zak", type: "radio",
  title: "Met of zonder stofzak?",
  sub: "Zie waar het stof terechtkomt.",
  why: "Een stofzuiger met stofzak is hygiënischer bij het legen, maar je koopt af en toe nieuwe zakken. Een zakloze stofzuiger heeft geen wegwerpkosten, maar het stofreservoir maak je zelf schoon.",
  options: [{ v: "met_zak", label: "Met stofzak", price: "€" }, { v: "zonder_zak", label: "Zonder stofzak (zakloos)", price: "€€" }, { v: "geen_voorkeur", label: "Geen voorkeur", price: "€" }],
};
const Q_STIL = {
  id: "stil", type: "radio",
  title: "Is een stille stofzuiger belangrijk voor je?",
  sub: "Zie hoeveel geluid er mag zijn.",
  why: "Sommige stofzuigers zijn merkbaar stiller dan andere. Vind je dat belangrijk, dan komen de stillere modellen van het gekozen type bovenaan.",
  options: [{ v: "ja", label: "Ja, het liefst een stille stofzuiger", price: "€€" }, { v: "nee", label: "Nee, het geluid maakt niet uit", price: "€" }],
};
const Q_EXTRA = {
  id: "extra", type: "check", exclusive: "geen",
  title: "Wat is nog meer belangrijk voor jou?",
  sub: "Je keuzes verschijnen in de kamer.",
  why: "Met huisdieren helpt een borstel die haren uit tapijt en meubels trekt. Bij allergie vangt een HEPA- of hygiënefilter fijnstof en pollen af. Een parketborstel met zachte haren beschermt harde vloeren. Sommige steelstofzuigers dweilen ook, en met een tweede of wisselbare accu kun je langer door.",
  options: [
    { v: "huisdieren", label: "Geschikt voor huisdierharen", price: "€€" },
    { v: "allergie", label: "Filter voor allergie (HEPA)", price: "€€" },
    { v: "parket", label: "Parketborstel voor harde vloeren", price: "€€" },
    { v: "dweilen", label: "Kan ook dweilen", price: "€€€", when: st => isSteel(st) },
    { v: "accu", label: "Extra of wisselbare accu", price: "€€€", when: st => isSteel(st) },
    { v: "geen", label: "Geen extra wensen", price: "€" },
  ],
};
// de zakvraag bestaat alleen bij een stofzuiger met snoer (steelstofzuigers zijn zakloos)
const vragen = st => [Q_TYPE, Q_BUDGET, Q_WONING, ...(isSteel(st) ? [] : [Q_ZAK]), Q_STIL, Q_EXTRA];
const QID = st => vragen(st)[st.q]?.id;

// ───────── live catalogus: budgettelling en grijze opties ─────────
let catalogus = null;
const capVan = v => (v && v !== "geen" ? Number(v) : null);
const budgetOpties = st => [...(BUDGET_CAPS[st.stofzuigerType] ?? BUDGET_CAPS.Cilinderstofzuiger).map(c => ({ v: String(c), label: `Tot ${euro(c)}` })), { v: "geen", label: "Geen voorkeur" }];
const vanType = st => (catalogus ?? []).filter(x => (x.aanbieders ?? []).length >= 2 && x.stofzuigerType === st.stofzuigerType);
function budgetCaption(st) {
  const cap = capVan(st.budget);
  if (!st.budget) return ["Jouw budget", "Kies wat je maximaal wilt uitgeven. Je krijgt de beste stofzuiger binnen dat bedrag, en op de resultaatpagina zie je wat meer budget oplevert."];
  if (!catalogus) return [cap ? `Tot ${euro(cap)}` : "Geen voorkeur", cap ? "We zoeken de beste stofzuiger binnen dit bedrag." : "We kiezen puur op je wensen."];
  const prijzen = vanType(st).map(x => parsePrice(x.prijs));
  const binnen = cap ? prijzen.filter(x => x <= cap) : prijzen;
  const naam = typeNaam(st);
  if (!cap) return ["Geen voorkeur", `Alle ${prijzen.length} ${naam} doen mee, van ${euro(Math.min(...prijzen))} tot ${euro(Math.max(...prijzen))}. We kiezen puur op je wensen.`];
  if (!binnen.length) return [`Tot ${euro(cap)}`, `Binnen dit bedrag vonden we geen ${naam}. We tonen dan de ${naam} die het best bij je passen, net erboven.`];
  return [`Tot ${euro(cap)}`, `${binnen.length} van de ${prijzen.length} ${naam} kosten ${euro(cap)} of minder, vanaf ${euro(Math.min(...binnen))}. We zoeken de beste die bij je wensen past.`];
}
// Grijs als geen stofzuiger bij 2+ winkels van dit type binnen het budget het
// zeker heeft, samen met de eerdere keuzes (zak) en de al aangevinkte extra's.
const EIS = {
  zak: { met_zak: x => voldoetAanZak(x, "met_zak") === true, zonder_zak: x => voldoetAanZak(x, "zonder_zak") === true },
  extra: Object.fromEntries(["huisdieren", "allergie", "parket", "dweilen", "accu"].map(v => [v, x => heeftExtra(x, v) === true])),
};
function eisenVan(st, totId, zonder) {
  const eisen = [];
  for (const q of vragen(st)) {
    const eigenRadio = q.id === totId && !Array.isArray(st[q.id]);
    if (EIS[q.id] && !eigenRadio) [].concat(st[q.id] ?? []).filter(v => EIS[q.id][v] && (q.id !== totId || v !== zonder)).forEach(v => eisen.push(EIS[q.id][v]));
    if (q.id === totId) break;
  }
  return eisen;
}
function metBeschikbaarheid(st, q) {
  if (!catalogus || !EIS[q.id]) return q;
  const cap = capVan(st.budget), alle = vanType(st);
  const binnen = cap ? alle.filter(x => parsePrice(x.prijs) <= cap) : alle;
  return { ...q, options: q.options.map(o => {
    const eis = EIS[q.id][o.v];
    if (!eis) return o;
    let andere = eisenVan(st, q.id, o.v);
    if (!binnen.some(x => andere.every(f => f(x)))) andere = [];
    if (binnen.some(x => eis(x) && andere.every(f => f(x)))) return o;
    const erboven = alle.filter(x => eis(x) && andere.every(f => f(x))).map(x => parsePrice(x.prijs));
    const note = cap && erboven.length ? (andere.length && binnen.some(eis) ? `Samen met je andere keuzes pas vanaf ${euro(Math.min(...erboven))}.` : `Niet tot ${euro(cap)}; wel vanaf ${euro(Math.min(...erboven))}.`)
      : andere.length && alle.some(eis) ? "Niet in combinatie met je andere keuzes." : `Niet bij de ${typeNaam(st)}.`;
    return { ...o, disabled: true, note };
  }) };
}
const WENS_NAAM = { huisdieren: "een borstel voor huisdierharen", allergie: "een filter voor allergie", parket: "een parketborstel", dweilen: "een dweilfunctie", accu: "een extra of wisselbare accu" };
function extraCaption(st) {
  const wensen = st.extra.filter(e => e !== "geen");
  if (!wensen.length) return st.extra.length ? ["Geen extra wensen", "We kiezen puur op je eerdere antwoorden."] : ["Extra's", "Vink aan wat je belangrijk vindt."];
  if (!catalogus) return ["Jouw extra's", "Je keuzes verschijnen in de kamer."];
  const cap = capVan(st.budget);
  const l = vanType(st).filter(x => !cap || parsePrice(x.prijs) <= cap);
  const eisen = eisenVan(st, "extra", null);
  const n = l.filter(x => eisen.every(f => f(x))).length;
  const wat = eisen.length > 1 ? "alles wat je koos" : WENS_NAAM[wensen[0]];
  const bij = cap ? ` binnen je budget` : "";
  if (!n) return ["Jouw extra's", `Van de ${l.length} ${typeNaam(st)}${bij} heeft er geen zeker ${wat}. We tonen die er het meest van hebben.`];
  return ["Jouw extra's", `${n} van de ${l.length} ${typeNaam(st)}${bij} ${n === 1 ? "heeft" : "hebben"} zeker ${wat}.`];
}

// ───────── overlays ─────────
const P = (ctx, x, y, z = 0.016) => ctx.toPx(x, y, z);
const poly = (ctx, pts) => pts.map(([x, y]) => { const p = P(ctx, x, y); return `${p.x},${p.y}`; }).join(" ");
// labels altijd binnen beeld houden (de stofzuiger staat rechts, dicht bij de rand)
let VIEW_W = 1200;
const tag = (p, html) => `<div class="tag is-on" style="left:${Math.min(Math.max(p.x, 140), VIEW_W - 150)}px;top:${Math.max(p.y, 46)}px">${html}</div>`;
// punt met lijntje naar een label; past het label rechts niet, dan links (rechts uitgelijnd)
function spotLabel(ctx, p, label, dx, dy) {
  const txt = ctx.mobile ? label.split(":")[0] : label;
  let lx = p.x + dx; const ly = Math.max(p.y + dy, 30);
  const flip = lx > ctx.width - (ctx.mobile ? 120 : 300);
  if (flip) lx = p.x - dx;
  const pos = flip ? `right:${ctx.width - lx}px` : `left:${lx}px`;
  return { svg: `<line x1="${p.x}" y1="${p.y}" x2="${lx}" y2="${ly}" class="leader"/>`,
    html: `<div class="spot is-on" style="left:${p.x}px;top:${p.y}px"></div><div class="spot-label is-on" style="${pos};top:${ly}px">${txt}</div>` };
}

function floorAreas(ctx, st) {
  const rug = [[RUG.x0, RUG.y1], [RUG.x1, RUG.y1], [RUG.x1, RUG.y0], [RUG.x0, RUG.y0]];
  let svg = "", html = "";
  const v = st.vloertype;
  if (v === "tapijt" || v === "allebei") {
    svg += `<polygon class="area" points="${poly(ctx, rug)}"/>`;
    html += tag(P(ctx, (RUG.x0 + RUG.x1) / 2, ctx.mobile ? -1.35 : -0.75), "<b>Tapijt</b> <span class=\"muted\">vloerkleed</span>");
  }
  if (v === "harde_vloer" || v === "allebei") {
    // eiken vloer = zichtbare vloer min het kleed (evenodd)
    const d = (pts) => "M" + pts.map(([x, y]) => { const p = P(ctx, x, y, 0.004); return `${p.x} ${p.y}`; }).join(" L") + " Z";
    const floor = [[-2.6, -0.02], [2.35, -0.02], [2.35, -2.4], [-2.6, -2.4]];
    // bij "allebei" heeft het kleed al een rand; de harde vloer dan zonder lijn, anders loopt er een dubbele stippellijn om het kleed
    svg += `<path class="area soft" fill-rule="evenodd" ${v === "allebei" ? 'stroke="none"' : ""} d="${d(floor)} ${d(rug)}"/>`;
    html += tag(P(ctx, ctx.mobile ? 1.3 : 1.25, ctx.mobile ? -1.2 : -0.62), "<b>Harde vloer</b> <span class=\"muted\">parket, tegels</span>");
  }
  return { svg, html };
}

// stofdeeltjes in de lucht (allergie): vaste, "willekeurige" posities zodat het beeld niet springt
const DUST = Array.from({ length: 34 }, (_, i) => {
  const r = n => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
  return { x: -0.8 + r(1) * 2.3, y: -1.7 + r(2) * 1.3, z: 0.15 + r(3) * 0.85, s: 1.4 + r(4) * 2.2, d: r(5) * 3 };
});
function filterView(ctx, st) {
  const h = st.huisdieren;
  if (h !== "huisdieren" && h !== "allergie") return {};
  let svg = "";
  if (h === "allergie") svg = DUST.map(d => { const p = ctx.toPx(d.x, d.y, d.z); return `<circle class="dust" cx="${p.x}" cy="${p.y}" r="${d.s}" style="animation-delay:${d.d.toFixed(2)}s"/>`; }).join("");
  const f = isSteel(st) ? W("steel", [0, 0.03, 1.08]) : W("cil", [-0.21, 0, 0.17]);
  const label = h === "huisdieren" ? "<b>HEPA-filter</b>: houdt haren en allergenen vast" : "<b>HEPA-filter</b>: vangt fijnstof en pollen";
  const o = spotLabel(ctx, ctx.toPx(...f), label, ctx.mobile ? 26 : 60, isSteel(st) ? 40 : ctx.mobile ? -30 : -50);   // steel: label onder het punt, rechtsboven zit de uitleg
  return { svg: svg + o.svg, html: o.html };
}

function spot(ctx, w, label, dx = 60, dy = -40) {
  return spotLabel(ctx, ctx.toPx(...w), label, ctx.mobile ? 24 : dx, dy);
}

function accuView(ctx, st) {
  if (isSteel(st)) {
    const min = LOOPTIJD_MIN[st.woning];
    if (!min) return {};
    // balkjes naar verhouding: 45 min = 2, 60 = 3, 90 = 4 van de 4
    const n = Math.round(min / 15), bars = Array.from({ length: 4 }, (_, i) => `<s class="${i < n ? "on" : ""}"></s>`).join("");
    // label naast de handgreep, niet erboven (daar is bij inzoomen geen ruimte)
    const w = W("steel", [0, 0.03, 0.9]), p = ctx.toPx(w[0] + 0.32, w[1], w[2]);
    const txt = `<b>Minstens ${min} min</b> <span class="muted">per acculading</span>`;
    return { svg: "", html: tag(p, `<span class="batt"><i>${bars}</i>${txt}</span>`) };
  }
  return {};
}
function zakView(ctx, st) {
  if (st.zak === "zonder_zak") return spot(ctx, W("cil", [0.07, 0, 0.3]), "<b>Stofreservoir</b>: legen en uitspoelen, geen zakken kopen");
  if (st.zak === "met_zak") return spot(ctx, W("cil", [0.07, 0, 0.24]), "<b>Stofzak</b>: stof blijft dicht bij het legen");
  return {};
}

// geluid: het filter werkt relatief (stiller dan de helft van het gekozen type), dus geen dB-getal
function waves(ctx, st) {
  if (!st.stil) return {};
  const soft = st.stil !== "ja", n = soft ? 5 : 2;
  const c = isSteel(st) ? W("steel", [0, 0.03, 0.95]) : W("cil", [0, 0, 0.14]);
  const half = isSteel(st) ? 0.07 : 0.24;
  const l = ctx.toPx(c[0] - half, c[1], c[2]), r = ctx.toPx(c[0] + half, c[1], c[2]);
  const w = ctx.toPx(c[0] + 0.3, c[1], c[2]).x - ctx.toPx(c[0] - 0.3, c[1], c[2]).x, a = 38 * Math.PI / 180;
  let svg = "";
  for (let i = 0; i < n; i++) {
    const rad = w * (0.1 + i * 0.075), dy = Math.sin(a) * rad, dx = Math.cos(a) * rad;
    const style = `style="animation-delay:${(i * 0.18).toFixed(2)}s"`, cls = `wave${soft ? " soft" : ""}`;
    svg += `<path class="${cls}" ${style} d="M${r.x + dx} ${r.y - dy} A${rad} ${rad} 0 0 1 ${r.x + dx} ${r.y + dy}"/>`;
    svg += `<path class="${cls}" ${style} d="M${l.x - dx} ${l.y - dy} A${rad} ${rad} 0 0 0 ${l.x - dx} ${l.y + dy}"/>`;
  }
  // steel reikt hoog: label links ernaast i.p.v. erboven (rechtsboven zit de uitleg)
  const t = isSteel(st) ? ctx.toPx(c[0] - 0.5, c[1], 0.75) : ctx.toPx(c[0], c[1], 0.5);
  const txt = soft ? "<b>Geen eis</b> <span class=\"muted\">aan het geluid</span>" : `<b>Stiller dan gemiddeld</b> <span class="muted">voor ${typeNaam(st)}</span>`;
  return { svg, html: tag(t, txt) };
}



// extra's in beeld: hondenmand + filter (huisdieren), stofdeeltjes (allergie),
// harde vloer (parket); de bestaande weergaven van de vroegere vragen
function extraView(ctx, st) {
  let svg = "", html = "";
  const add = r => { svg += r.svg ?? ""; html += r.html ?? ""; };
  if (st.extra.includes("parket")) add(floorAreas(ctx, { ...st, vloertype: "harde_vloer" }));
  if (st.extra.includes("allergie")) add(filterView(ctx, { ...st, huisdieren: "allergie" }));
  else if (st.extra.includes("huisdieren")) add(filterView(ctx, { ...st, huisdieren: "huisdieren" }));
  return { svg, html };
}

const FOCUS = {
  stofzuigerType: () => ({ x: 0.88, y: -1.0, z: 0.45, zoom: 1.4 }),
  budget: () => ({ x: 0.88, y: -1.0, z: 0.45, zoom: 1.4 }),
  woning: st => ({ x: 0.88, y: -1.0, z: isSteel(st) ? 0.6 : 0.35, zoom: isSteel(st) ? 1.3 : 1.2, anchorX: 0.38 }),
  zak: st => ({ x: 0.88, y: -1.0, z: 0.35, zoom: 1.6, anchorX: 0.38 }),
  stil: st => ({ x: 0.88, y: -1.0, z: isSteel(st) ? 0.6 : 0.35, zoom: 1.35 }),
  extra: () => ({ x: 0.35, y: -1.1, z: 0.3, zoom: 1.15 }),
};
const FOCUS_DESKTOP = {
  stofzuigerType: () => ({ x: 0.88, y: -1.0, z: 0.5, zoom: 1.0, anchorX: 0.66 }),
  budget: () => ({ x: 0.88, y: -1.0, z: 0.5, zoom: 1.0, anchorX: 0.66 }),
  woning: st => ({ x: 0.88, y: -1.0, z: isSteel(st) ? 0.6 : 0.4, zoom: isSteel(st) ? 1.3 : 1.0, anchorX: 0.6 }),
  zak: () => ({ x: 0.88, y: -1.0, z: 0.4, zoom: 1.6, anchorX: 0.6 }),
  stil: st => ({ x: 0.88, y: -1.0, z: isSteel(st) ? 0.55 : 0.4, zoom: isSteel(st) ? 1.1 : 1.35, anchorX: 0.64 }),
  extra: () => ({ x: 0.4, y: -1.1, z: 0.4, zoom: 1.0, anchorX: 0.64 }),
};

const quiz = createQuiz3D({
  camera,
  captionTop: true,   // uitleg vast rechtsboven: de toestellen staan laag in beeld
  steps: st => vragen(st).length,
  state: { stofzuigerType: null, budget: null, woning: null, zak: null, stil: null, extra: [] },
  imgPath: n => `stofzuiger/vragen/img/${n}.webp`,
  question: st => {
    const q = vragen(st)[st.q];
    if (q.id === "budget") return { ...q, options: budgetOpties(st) };
    return metBeschikbaarheid(st, q);
  },

  images(st) {
    const vac = isSteel(st) ? "steel" : st.zak === "zonder_zak" && QID(st) !== "stofzuigerType" ? "cil-zakloos" : "cil-zak";
    const list = ["woonkamer", vac];
    if (QID(st) === "extra" && st.extra.includes("huisdieren")) list.push("mand");
    return list;
  },

  onAnswer(st, id) {
    if (id === "stofzuigerType") {
      st.zak = null;
      st.extra = st.extra.filter(e => isSteel(st) || (e !== "dweilen" && e !== "accu"));
      if (!budgetOpties(st).some(o => o.v === st.budget)) st.budget = null;
    }
  },
  onNext(st, id) { meetStap(st, id); },

  focus: st => (FOCUS[QID(st)] ?? FOCUS.stofzuigerType)(st),
  focusDesktop: st => (FOCUS_DESKTOP[QID(st)] ?? FOCUS_DESKTOP.stofzuigerType)(st),

  overlays(ctx) {
    const { st } = ctx;
    VIEW_W = ctx.width;
    switch (QID(st)) {
      case "woning": return accuView(ctx, st);
      case "zak": return zakView(ctx, st);
      case "stil": return waves(ctx, st);
      case "extra": return extraView(ctx, st);
      default: return {};
    }
  },

  caption(st) {
    switch (QID(st)) {
      case "stofzuigerType": return isSteel(st) ? ["Steelstofzuiger", "Draadloos, licht en snel gepakt; wel met een beperkte accuduur."]
        : st.stofzuigerType ? ["Met snoer", "Veel zuigkracht en geen oplaadtijd."] : ["Jouw woonkamer", "Kies wat voor stofzuiger je zoekt; de stofzuiger in de kamer wisselt mee."];
      case "budget": return budgetCaption(st);
      case "woning": {
        if (!st.woning) return ["Jouw woning", isSteel(st) ? "Kies hoe groot je woning is; de accuduur stemmen we erop af." : "Kies hoe groot je woning is; de lengte van het snoer stemmen we erop af."];
        const t = { klein: "Appartement of klein huis", gemiddeld: "Gemiddeld huis", groot: "Groot huis of met trappen" }[st.woning];
        return [t, isSteel(st) ? `We zoeken een accu die minstens ${LOOPTIJD_MIN[st.woning]} minuten meegaat.` : `We zoeken een bereik van minstens ${ACTIERADIUS_MIN[st.woning]} meter, zodat je niet steeds de stekker verplaatst.`];
      }
      case "zak": return {
        met_zak: ["Met stofzak", "Hygiënisch legen; je koopt wel af en toe nieuwe zakken."],
        zonder_zak: ["Zakloos", "Geen wegwerpkosten; het reservoir maak je zelf schoon."],
        geen_voorkeur: ["Geen voorkeur", "We houden modellen met en zonder zak in beeld."],
      }[st.zak] ?? ["Stofzak", "Kies of je met of zonder stofzak wilt."];
      case "stil": return st.stil === "ja" ? ["Stil", `De stillere ${typeNaam(st)} komen bovenaan.`]
        : st.stil ? ["Geluid maakt niet uit", "We letten niet op het geluid; dat geeft de meeste keuze."] : ["Geluid", "Kies of een stille stofzuiger belangrijk is."];
      default: return extraCaption(st);
    }
  },

  async finish(st) {
    meetStap(st, "extra");
    const answers = {
      stofzuigerType: st.stofzuigerType ?? "", budget: capVan(st.budget), woning: st.woning ?? "",
      zak: isSteel(st) ? "" : st.zak ?? "", stil: st.stil ?? "", extraAnswers: st.extra,
    };
    const stofzuigers = normalizeProducts(await productenOfFout());
    // Beste match binnen het budget; past er niets binnen, dan zonder grens.
    let result = matchStofzuigers(stofzuigers, answers);
    if (answers.budget && !result.bestMatch) result = matchStofzuigers(stofzuigers, answers, null);
    localStorage.setItem("stofzuiger_bestMatch", JSON.stringify(result.bestMatch));
    localStorage.setItem("stofzuiger_bestType", result.bestType ?? "");
    localStorage.setItem("stofzuiger_filteredMatchedStofzuigers", JSON.stringify(result.filteredMatchedStofzuigers));
    localStorage.setItem("stofzuiger_answers", JSON.stringify(answers));
    window.location.href = "stofzuiger/resultaat/";
  },

  preload: ["cil-zak", "steel", "cil-zakloos", "mand"],
});

// Meting: waar haken mensen af, en wat kiezen ze (o.a. de budgetvraag)
function meetStap(st, id) {
  const v = st[id];
  window.phTrackEvent?.("quiz_stap", {
    categorie: "stofzuiger", stap: id, nr: vragen(st).findIndex(q => q.id === id) + 1,
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
