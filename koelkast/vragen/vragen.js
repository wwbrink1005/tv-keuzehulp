// Testversie van de koelkast-vragenpagina met een Blender-gerenderde keuken.
// Alle renders (koelkast/vragen/img) delen één camera (render/scene.py,
// --d 1.3); alleen de koelkast wisselt. De motor staat in shared/quiz3d.js.
import { createQuiz3D, makeCamera, dimLine, spotColumn } from "../../shared/quiz3d.js";
import { nishoogteGroups, vrijstaandTypeLabels } from "../js/data.js";
import { matchKoelkasten } from "../js/matching.js";
import { normalizeProducts } from "../js/utils.js";
import { fetchProducts } from "../js/supabase.js";

const camera = makeCamera({ camY: -(1.3 + 2.45) });
const productsPromise = fetchProducts().catch(() => null);   // alvast ophalen

// geometrie van de koelkasten (meters, zoals in render/scene.py)
const X0 = -0.31;
const FRIDGE = {
  standaard:     { w: 0.60, h: 1.86, yf: -0.70, cm: [60, 186], freezerTop: 0.72 },
  "extra-breed": { w: 0.70, h: 2.00, yf: -0.74, cm: [70, 200], freezerTop: 0.78 },
  amerikaans:    { w: 0.91, h: 1.78, yf: -0.74, cm: [91, 178] },
  tafelmodel:    { w: 0.55, h: 0.84, yf: -0.63, cm: [55, 85] },
};
const INBOUW = { x0: -0.31, x1: 0.29, yf: -0.64, z0: 0.1 };
const IMG_KEY = { standaard: "standaard", "extra-breed": "breed", amerikaans: "amerikaans", tafelmodel: "tafelmodel" };

const Q_PLAATSING = {
  id: "plaatsing", type: "radio",
  title: "Zoek je een inbouw- of vrijstaande koelkast?",
  sub: "Zie het verschil in dezelfde keuken.",
  why: "Een inbouwkoelkast wordt weggewerkt achter een keukenkastje en moet fysiek passen in de nis die daarvoor bedoeld is. Een vrijstaande koelkast staat los in de ruimte en is flexibeler qua formaat en plaatsing. Deze keuze bepaalt welke koelkasten voor jou sowieso geschikt zijn, dus we vragen dit als eerste.",
  options: [{ v: "inbouw", label: "Inbouw, wegwerken in een keukenkast", price: "€€" }, { v: "vrijstaand", label: "Vrijstaand, los in de ruimte", price: "€" }],
};
const Q_TYPE = {
  id: "vrijstaandtype", type: "radio",
  title: "Welk type koelkast zoek je?",
  sub: "De koelkast wisselt in de keuken, met de maten op ware grootte.",
  why: "Een standaard koelkast (koel-vriescombinatie of losse koelkast) past in de meeste keukens. Extra brede en Amerikaanse (side-by-side) modellen bieden meer opbergruimte, maar hebben ook meer plaats nodig. Een tafelmodel is compact en ideaal voor een kleine ruimte, zoals een studeerkamer of studio.",
  options: ["standaard", "extra-breed", "amerikaans", "tafelmodel"].map(v => ({ v, label: vrijstaandTypeLabels[v] })),
};
const Q_NIS = {
  id: "nishoogte", type: "radio", two: true,
  title: "Wat is de hoogte van je nis?",
  sub: "Meet de binnenhoogte van de opening in je keukenkast. De kast in beeld past zich aan.",
  why: "De hoogte van de nis bepaalt welke inbouwkoelkasten fysiek in je keukenkast passen. Meet de binnenhoogte van de nis waar de koelkast moet komen, van vloer tot bovenkant van de opening. Weet je het niet precies? Kies de dichtstbijzijnde maat.",
  options: [...nishoogteGroups.map(cm => ({ v: String(cm), label: `${cm} cm` })), { v: "", label: "Weet ik nog niet" }],
};
const Q_GEZIN = {
  id: "gezinsgrootte", type: "radio",
  title: "Voor hoeveel personen kook je?",
  sub: "Kijk alvast naar binnen: hoeveel ruimte heb je nodig?",
  why: "Hoe meer personen in huis, hoe meer boodschappen er meestal in de koelkast moeten passen. We houden hiermee rekening bij de inhoud (in liters) die we adviseren, maar filteren nooit zo streng dat je geen passende koelkast meer te zien krijgt.",
  options: [{ v: "klein", label: "Klein huishouden, 1 tot 2 personen", price: "€" }, { v: "gemiddeld", label: "Gemiddeld huishouden, 3 tot 4 personen", price: "€€" }, { v: "groot", label: "Groot huishouden, 5 personen of meer", price: "€€€" }],
};
const isBreed = st => st.plaatsing === "vrijstaand" && ["amerikaans", "extra-breed"].includes(st.vrijstaandtype);
const Q_EXTRA = {
  id: "extra", type: "check", exclusive: "geen",
  title: "Wat is nog meer belangrijk voor jou?",
  sub: "Je keuzes verschijnen op de koelkast zelf.",
  why: "Energiezuinig betekent een lager verbruik op je energierekening. Stil in gebruik is prettig als de koelkast dicht bij een woon- of slaapkamer staat. No Frost betekent dat de vriezer nooit meer handmatig ontdooid hoeft te worden. Een vriesvak is handig als je ook bevroren producten wilt bewaren zonder een aparte vriezer. Een vers zone compartiment houdt groente, fruit en vlees langer vers. Waterdispenser en ijsmaker zijn vooral te vinden bij Amerikaanse en extra brede koelkasten.",
  options: [
    { v: "energiezuinig", label: "Energiezuinig, laag energieverbruik", price: "€€" },
    { v: "stil", label: "Stil in gebruik", price: "€€" },
    { v: "nofrost", label: "Nooit ontdooien (No Frost)", price: "€€" },
    { v: "vriesvak", label: "Met vriesvak", price: "€€" },
    { v: "verszone", label: "Vers zone compartiment", price: "€€" },
    { v: "waterdispenser", label: "Waterdispenser", price: "€€€", when: isBreed },
    { v: "ijsmaker", label: "IJsmaker", price: "€€€", when: isBreed },
    { v: "geen", label: "Geen extra wensen", price: "€" },
  ],
};

const LITERS = {
  klein: ["1 tot 2 personen", "Tot zo'n 250 liter is meestal genoeg: ruimte voor de boodschappen van een week."],
  gemiddeld: ["3 tot 4 personen", "Reken op minimaal 250 liter, zodat er ook plek is voor verse groente en drinken."],
  groot: ["5 personen of meer", "Kies 350 liter of meer. Extra brede en Amerikaanse modellen komen dan in beeld."],
};
const SPOT_TEXT = {
  energiezuinig: "Laag <b>energieverbruik</b>", stil: "Stil: <b>38 dB</b> of minder", nofrost: "<b>No Frost</b> vriezer",
  vriesvak: "<b>Vriesvak</b>", verszone: "<b>Verszone</b> voor groente", waterdispenser: "<b>Waterdispenser</b>", ijsmaker: "<b>IJsmaker</b>",
};
// volgorde van boven naar beneden waarin de labels op de koelkast staan
const SPOT_ORDER = ["energiezuinig", "ijsmaker", "waterdispenser", "vriesvak", "stil", "nofrost", "verszone"];

const type = st => (st.plaatsing === "inbouw" ? "inbouw" : st.vrijstaandtype || "standaard");
const nisCm = st => (st.nishoogte ? parseInt(st.nishoogte, 10) : 178);
const nisTop = st => (nisCm(st) <= 95 ? 0.87 : INBOUW.z0 + nisCm(st) / 100);

createQuiz3D({
  camera,
  steps: 4,
  state: { plaatsing: null, vrijstaandtype: null, nishoogte: null, gezinsgrootte: null, extra: [] },
  imgPath: n => `koelkast/vragen/img/${n}.webp`,
  question: st => [Q_PLAATSING, st.plaatsing === "inbouw" ? Q_NIS : Q_TYPE, Q_GEZIN, Q_EXTRA][st.q],

  images(st) {
    const t = type(st);
    if (t === "inbouw") return [`inbouw-${nisCm(st)}`];
    return [`${IMG_KEY[t]}-${st.q === 2 ? "open" : "dicht"}`];
  },

  focus(st) {
    const t = type(st);
    if (t === "inbouw") return { x: 0, y: INBOUW.yf, z: nisCm(st) <= 95 ? 0.5 : INBOUW.z0 + nisCm(st) / 200, zoom: nisCm(st) > 95 ? 1 : 1.35 };
    const f = FRIDGE[t];
    return { x: X0 + f.w / 2, y: f.yf, z: f.h / 2, zoom: f.h > 1.2 ? 1 : 1.35 };
  },

  overlays(ctx) {
    const { st } = ctx;
    const t = type(st);
    let svg = "", html = "";
    const add = o => { svg += o.svg; html += o.html; };
    if (st.q === 1 && t !== "inbouw") {
      const f = FRIDGE[t], x1 = X0 + f.w;
      add(dimLine(ctx, [X0, f.yf, f.h + 0.07], [x1, f.yf, f.h + 0.07], `<b>${f.cm[0]} cm</b> breed`));
      add(dimLine(ctx, [x1 + 0.08, f.yf, 0], [x1 + 0.08, f.yf, f.h], `<b>${f.cm[1]} cm</b> hoog`));
    }
    if (st.q === 1 && t === "inbouw" && st.nishoogte) {
      add(dimLine(ctx, [INBOUW.x1 + 0.08, INBOUW.yf, INBOUW.z0], [INBOUW.x1 + 0.08, INBOUW.yf, nisTop(st)], `nis <b>${nisCm(st)} cm</b>`));
    }
    if (st.q === 3) {
      const keys = SPOT_ORDER.filter(k => st.extra.includes(k) && SPOT_TEXT[k]);
      const inb = t === "inbouw";
      const f = FRIDGE[t];
      const x = inb ? 0 : X0 + f.w / 2, y = inb ? -0.45 : f.yf;
      add(spotColumn(ctx, keys.map(k => ({ x, y, z: 1, label: SPOT_TEXT[k] })), {
        zBot: inb ? INBOUW.z0 + 0.08 : 0.1,
        zTop: inb ? nisTop(st) - 0.06 : f.h - 0.1,
        edgeX: inb ? INBOUW.x1 : X0 + f.w, edgeY: inb ? INBOUW.yf : f.yf,
      }));
    }
    return { svg, html };
  },

  // bij de extra's spreken de labels voor zich; op desktop zou de uitleg ze afdekken
  hideCaption: (st, mobile) => st.q === 3 && !mobile,

  caption(st) {
    const t = type(st);
    switch (st.q) {
      case 0:
        if (st.plaatsing === "inbouw") return ["Inbouw", "Weggewerkt achter een keukenfront. Hij moet passen in de nis van je keukenkast."];
        if (st.plaatsing === "vrijstaand") return ["Vrijstaand", "Los naast het aanrecht. Flexibel in maat en makkelijk te vervangen."];
        return ["Jouw keuken", "Kies of je koelkast wordt ingebouwd of los komt te staan. De keuken verandert mee."];
      case 1:
        if (t === "inbouw") {
          if (st.nishoogte) return [`Nis van ${st.nishoogte} cm`, +st.nishoogte <= 95 ? "Een onderbouwkoelkast onder het aanrecht: compact en helemaal weggewerkt." : "De kastkolom heeft een nis op deze hoogte. Alleen koelkasten die precies passen tonen we."];
          if (st.nishoogte === "") return ["Nishoogte onbekend", "Geen probleem: we tonen dan alle inbouwkoelkasten, ongeacht hoogte."];
          return ["Hoogte van de nis", "Meet de binnenhoogte van de opening. De kast in beeld past zich aan je keuze aan."];
        }
        if (st.vrijstaandtype) {
          const [w, h] = FRIDGE[t].cm;
          return [vrijstaandTypeLabels[t], `${w} × ${h} cm. Het aanrecht is 90 cm hoog, zo zie je meteen hoe groot hij in je keuken staat.`];
        }
        return ["Type koelkast", "Van compact tafelmodel tot Amerikaanse side-by-side: kies een type en zie het formaat."];
      case 2:
        return st.gezinsgrootte ? LITERS[st.gezinsgrootte] : ["Kijk naar binnen", "Hoe meer mensen, hoe meer liter je nodig hebt. Kies je huishouden."];
      default: {
        if (st.extra.some(e => e !== "geen")) return ["Jouw extra's", "De gemarkeerde punten laten zien waar je keuzes op de koelkast zitten."];
        if (st.extra.includes("geen")) return ["Geen extra wensen", "Dan kijken we puur naar formaat, inhoud en prijs."];
        return ["Extra's", "Vink aan wat je belangrijk vindt; het verschijnt op de koelkast."];
      }
    }
  },

  onBack(st) { if (st.q === 0) { st.vrijstaandtype = null; st.nishoogte = null; } },

  async finish(st) {
    const answers = {
      plaatsing: st.plaatsing ?? "",
      nishoogte: st.plaatsing === "inbouw" ? (st.nishoogte ?? "") : "",
      vrijstaandtype: st.plaatsing === "vrijstaand" ? (st.vrijstaandtype ?? "") : "",
      gezinsgrootte: st.gezinsgrootte ?? "",
      extraAnswers: st.extra.filter(e => isBreed(st) || !["waterdispenser", "ijsmaker"].includes(e)),
    };
    const raw = await productsPromise;
    const result = matchKoelkasten(normalizeProducts(raw ?? []), answers);
    localStorage.setItem("koelkast_bestMatch", JSON.stringify(result.bestMatch));
    localStorage.setItem("koelkast_bestType", result.bestType ?? "");
    localStorage.setItem("koelkast_filteredMatchedKoelkasten", JSON.stringify(result.filteredMatchedKoelkasten));
    localStorage.setItem("koelkast_answers", JSON.stringify(answers));
    window.location.href = "koelkast/resultaat/";
  },

  preload: ["standaard-dicht", "inbouw-178", "breed-dicht", "amerikaans-dicht", "tafelmodel-dicht",
    "standaard-open", "breed-open", "amerikaans-open", "tafelmodel-open", ...nishoogteGroups.map(n => `inbouw-${n}`)],
});
