// Testversie van de stofzuiger-vragenpagina in de 3D-woonkamer. Basisrender = de
// kamer met vloerkleed en eiken vloer; de stofzuiger (slede met of zonder zak, of
// een steelstofzuiger) en de hondenmand zijn transparante lagen (render/scene.py,
// dezelfde scène als de robotstofzuiger-test). Vloervlakken, stof en accu tekent
// de pagina zelf in perspectief. Motor: shared/quiz3d.js.
import { createQuiz3D, makeCamera } from "../../shared/quiz3d.js";
import { matchStofzuigers } from "../js/matching.js";
import { normalizeProducts } from "../js/utils.js";
import { fetchProducts } from "../js/supabase.js";

const camera = makeCamera({ camY: -3.4, camZ: 1.25, shiftX: -0.12, shiftY: -0.17 });
const productsPromise = fetchProducts().catch(() => null);

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

const Q_TYPE = {
  id: "stofzuigerType", type: "radio",
  title: "Wat voor stofzuiger zoek je?",
  sub: "De stofzuiger in de kamer wisselt mee.",
  why: "Een cilinderstofzuiger werkt met een snoer, is doorgaans krachtiger en heeft geen oplaadtijd. Een steelstofzuiger is draadloos, licht en wendbaar, maar heeft een beperkte accuduur. Dit bepaalt sterk welke stofzuigers voor je in aanmerking komen.",
  options: [{ v: "Cilinderstofzuiger", label: "Cilinderstofzuiger, met snoer, krachtig", price: "€" }, { v: "Steelstofzuiger", label: "Steelstofzuiger, draadloos, licht en wendbaar", price: "€€€" }],
};
const Q_VLOER = {
  id: "vloertype", type: "radio",
  title: "Welke vloeren ga je vooral stofzuigen?",
  sub: "Zie welk deel van de vloer telt.",
  why: "Niet elke stofzuiger presteert even goed op tapijt en op harde vloeren zoals parket of tegels. We geven voorrang aan stofzuigers die goed geschikt zijn voor het vloertype dat jij vooral hebt.",
  options: [{ v: "tapijt", label: "Vooral tapijt of vloerkleden", price: "€€" }, { v: "harde_vloer", label: "Vooral harde vloeren, zoals parket of tegels", price: "€" }, { v: "allebei", label: "Allebei, ongeveer evenveel", price: "€€€" }],
};
const Q_DIER = {
  id: "huisdieren", type: "radio",
  title: "Heb je huisdieren of last van allergieën?",
  sub: "Dan telt het filter extra mee.",
  why: "Bij huisdieren of allergieën geven we voorrang aan stofzuigers met HEPA-filtering, die fijnstof en allergenen beter afvangen dan een standaardfilter.",
  options: [{ v: "huisdieren", label: "Ja, ik heb huisdieren", price: "€€" }, { v: "allergie", label: "Ik heb last van allergieën", price: "€€" }, { v: "geen", label: "Nee, geen van beide", price: "€" }],
};
const Q_ZAK = {
  id: "zak", type: "radio",
  title: "Met of zonder stofzak?",
  sub: "Zie waar het stof terechtkomt.",
  why: "Een stofzuiger met stofzak is vaak hygiënischer bij het legen, maar brengt vervangingskosten met zich mee. Een zakloze stofzuiger heeft geen wegwerpkosten, maar het stofreservoir moet je zelf schoonmaken.",
  options: [{ v: "met_zak", label: "Met stofzak", price: "€" }, { v: "zonder_zak", label: "Zonder stofzak (zakloos)", price: "€€" }, { v: "geen_voorkeur", label: "Geen voorkeur", price: "€" }],
};
const Q_LOOP = {
  id: "looptijd", type: "radio",
  title: "Hoe lang wil je minimaal kunnen stofzuigen op 1 acculading?",
  sub: "De accu-indicator laat het zien.",
  why: "Steelstofzuigers verschillen sterk in accuduur. Voor een klein huis is een kortere looptijd vaak voldoende; voor een groter huis of om steeds te moeten opladen te voorkomen kies je beter een model met een langere looptijd.",
  options: [{ v: "45min", label: "Geen voorkeur, ongeveer 45 minuten is prima", price: "€" }, { v: "60min", label: "Minstens 60 minuten", price: "€€" }, { v: "90min", label: "Minstens 90 minuten", price: "€€€" }],
};
const Q_GELUID = {
  id: "geluid", type: "radio",
  title: "Is een stil geluidsniveau belangrijk voor je?",
  sub: "Zie hoeveel geluid er mag zijn.",
  why: "Sommige stofzuigers zijn merkbaar stiller dan andere. Vind je dat belangrijk, dan geven we voorrang aan de stillere modellen binnen jouw gekozen type.",
  options: [{ v: "belangrijk", label: "Ja, het liefst een stille stofzuiger", price: "€€" }, { v: "niet_belangrijk", label: "Nee, maakt mij niet uit", price: "€" }],
};
// stap 4 hangt af van het type, net als in de huidige keuzehulp (zak bij slede, accu bij steel)
const question = st => [Q_TYPE, Q_VLOER, Q_DIER, isSteel(st) ? Q_LOOP : Q_ZAK, Q_GELUID][st.q];

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

function stap4(ctx, st) {
  if (isSteel(st)) {
    const min = { "45min": 45, "60min": 60, "90min": 90 }[st.looptijd];
    if (!min) return {};
    // balkjes naar verhouding: 45 min = 2, 60 = 3, 90 = 4 van de 4
    const n = Math.round(min / 22.5), bars = Array.from({ length: 4 }, (_, i) => `<s class="${i < n ? "on" : ""}"></s>`).join("");
    // label naast de handgreep, niet erboven (daar is bij inzoomen geen ruimte)
    const w = W("steel", [0, 0.03, 0.9]), p = ctx.toPx(w[0] + 0.32, w[1], w[2]);
    const txt = st.looptijd === "45min" ? "<b>± 45 min</b> <span class=\"muted\">per acculading</span>" : `<b>Minstens ${min} min</b> <span class="muted">per acculading</span>`;
    return { svg: "", html: tag(p, `<span class="batt"><i>${bars}</i>${txt}</span>`) };
  }
  if (st.zak === "zonder_zak") return spot(ctx, W("cil", [0.07, 0, 0.3]), "<b>Stofreservoir</b>: legen en uitspoelen, geen zakken kopen");
  if (st.zak === "met_zak") return spot(ctx, W("cil", [0.07, 0, 0.24]), "<b>Stofzak</b>: stof blijft dicht bij het legen");
  return {};
}

// geluid: het filter werkt relatief (stiller dan de helft van het gekozen type), dus geen dB-getal
function waves(ctx, st) {
  if (!st.geluid) return {};
  const soft = st.geluid !== "belangrijk", n = soft ? 5 : 2;
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
  const txt = soft ? "<b>Geen eis</b> <span class=\"muted\">aan het geluid</span>" : `<b>Stiller dan de helft</b> <span class="muted">van de ${typeNaam(st)}</span>`;
  return { svg, html: tag(t, txt) };
}



createQuiz3D({
  camera,
  captionTop: true,   // uitleg vast rechtsboven: de toestellen staan laag in beeld
  steps: 5,
  state: { stofzuigerType: null, vloertype: null, huisdieren: null, zak: null, looptijd: null, geluid: null },
  imgPath: n => `stofzuiger/vragen-test/img/${n}.webp`,
  question,

  images(st) {
    const vac = isSteel(st) ? "steel" : st.q >= 3 && st.zak === "zonder_zak" ? "cil-zakloos" : "cil-zak";
    const list = ["woonkamer", vac];
    if (st.q === 2 && st.huisdieren === "huisdieren") list.push("mand");
    return list;
  },

  onAnswer(st, id) { if (id === "stofzuigerType") { st.zak = null; st.looptijd = null; } },

  focus: st => [
    { x: 0.88, y: -1.0, z: 0.45, zoom: 1.4 },
    { x: 0.2, y: -1.2, z: 0.1, zoom: 1.0 },
    { x: 0.35, y: -1.1, z: 0.3, zoom: 1.15 },
    { x: 0.88, y: -1.0, z: isSteel(st) ? 0.6 : 0.35, zoom: isSteel(st) ? 1.3 : 1.6, anchorX: 0.38 },
    { x: 0.88, y: -1.0, z: isSteel(st) ? 0.6 : 0.35, zoom: 1.35 },
  ][st.q],
  focusDesktop: st => [
    { x: 0.88, y: -1.0, z: 0.5, zoom: 1.0, anchorX: 0.66 },
    { x: 0.2, y: -1.2, z: 0.3, zoom: 1.0, anchorX: 0.62 },
    { x: 0.4, y: -1.1, z: 0.4, zoom: 1.0, anchorX: 0.64 },
    { x: 0.88, y: -1.0, z: isSteel(st) ? 0.6 : 0.4, zoom: isSteel(st) ? 1.3 : 1.6, anchorX: 0.6 },
    { x: 0.88, y: -1.0, z: isSteel(st) ? 0.55 : 0.4, zoom: isSteel(st) ? 1.1 : 1.35, anchorX: 0.64 },
  ][st.q],

  overlays(ctx) {
    const { st } = ctx;
    VIEW_W = ctx.width;
    if (st.q === 1) return floorAreas(ctx, st);
    if (st.q === 2) return filterView(ctx, st);
    if (st.q === 3) return stap4(ctx, st);
    if (st.q === 4) return waves(ctx, st);
    return {};
  },

  caption(st) {
    switch (st.q) {
      case 0: return isSteel(st) ? ["Steelstofzuiger", "Draadloos, licht en snel gepakt; wel met een beperkte accuduur."]
        : st.stofzuigerType ? ["Cilinderstofzuiger", "Met snoer: veel zuigkracht en geen oplaadtijd."] : ["Jouw woonkamer", "Kies wat voor stofzuiger je zoekt; de stofzuiger in de kamer wisselt mee."];
      case 1: return {
        tapijt: ["Vooral tapijt", "We geven voorrang aan stofzuigers die goed zijn op tapijt en vloerkleden."],
        harde_vloer: ["Vooral harde vloeren", "We geven voorrang aan stofzuigers die goed zijn op parket en tegels."],
        allebei: ["Allebei", "We zoeken een stofzuiger die op beide vloeren goed werkt."],
      }[st.vloertype] ?? ["Vloeren", "Kies welke vloer je vooral stofzuigt."];
      case 2: return {
        huisdieren: ["Huisdieren", "We geven voorrang aan stofzuigers met een HEPA-filter voor haren en allergenen."],
        allergie: ["Allergie", "We geven voorrang aan stofzuigers met een HEPA-filter: dat vangt fijnstof beter af."],
        geen: ["Geen huisdieren of allergie", "Een standaardfilter is dan prima."],
      }[st.huisdieren] ?? ["Filter", "Heb je huisdieren of allergieën?"];
      case 3: if (isSteel(st)) return st.looptijd ? ["Accuduur", "We zoeken modellen die minstens zo lang meegaan op één lading."] : ["Accuduur", "Kies hoe lang je minstens wilt kunnen stofzuigen."];
        return {
          met_zak: ["Met stofzak", "Hygiënisch legen; je koopt wel af en toe nieuwe zakken."],
          zonder_zak: ["Zakloos", "Geen wegwerpkosten; het reservoir maak je zelf schoon."],
          geen_voorkeur: ["Geen voorkeur", "We houden modellen met en zonder zak in beeld."],
        }[st.zak] ?? ["Stofzak", "Kies of je met of zonder stofzak wilt."];
      default: return st.geluid === "belangrijk" ? ["Stil", `We geven voorrang aan modellen die stiller zijn dan de helft van de ${typeNaam(st)}.`]
        : st.geluid ? ["Geluid maakt niet uit", "We letten niet op het geluid; dat geeft de meeste keuze."] : ["Geluid", "Kies of een stille stofzuiger belangrijk is."];
    }
  },

  async finish(st) {
    const answers = {
      stofzuigerType: st.stofzuigerType ?? "", vloertype: st.vloertype ?? "", huisdieren: st.huisdieren ?? "",
      zak: isSteel(st) ? "" : st.zak ?? "", looptijd: isSteel(st) ? st.looptijd ?? "" : "", geluid: st.geluid ?? "",
    };
    const raw = await productsPromise;
    const result = matchStofzuigers(normalizeProducts(raw ?? []), answers);
    localStorage.setItem("stofzuiger_bestMatch", JSON.stringify(result.bestMatch));
    localStorage.setItem("stofzuiger_bestType", result.bestType ?? "");
    localStorage.setItem("stofzuiger_filteredMatchedStofzuigers", JSON.stringify(result.filteredMatchedStofzuigers));
    localStorage.setItem("stofzuiger_answers", JSON.stringify(answers));
    window.location.href = "stofzuiger/resultaat";
  },

  preload: ["cil-zak", "steel", "cil-zakloos", "mand"],
});
