import { distanceToSizeGroup, tvDimensions } from "../../../keuzehulpen/tv/js/data.js";
import { calculateScores, matchTVs, applyResolutionFilter } from "../../../keuzehulpen/tv/js/matching.js";
import { normalizeProducts } from "../../../keuzehulpen/tv/js/utils.js";
import { fetchProducts } from "../../../keuzehulpen/tv/js/supabase.js";

const sizeGroups = ["24-32", "40-43", "48-50", "55", "58-65", "70-77", "83-86", "97-115"];

// ─── Question definitions (same questions/scoring as the live TV keuzehulp,
// only the presentation is new) ─────────────────────────────────────────────
const QUESTIONS = [
  {
    id: "distance",
    name: "distance",
    type: "single",
    title: "Hoe ver zit je van de televisie af?",
    why: "De kijkafstand bepaalt mede welke tv-grootte het meest comfortabel is. Te dichtbij geeft een overweldigend beeld, te ver weg mis je details.",
    icon: "ruler",
    options: [
      { value: "1m", label: "1 meter" },
      { value: "1.5m", label: "1,5 meter" },
      { value: "2m", label: "2 meter" },
      { value: "2.5m", label: "2,5 meter" },
      { value: "3m", label: "3 meter" },
      { value: "3.5m", label: "3,5 meter" },
      { value: "4m", label: "4 meter" },
      { value: "bioscoop", label: "Thuisbioscoop" },
    ],
  },
  {
    id: "sizeGroup",
    name: "sizeGroup",
    type: "single",
    title: "Welke grootte past bij jou?",
    why: "Op basis van je kijkafstand geven we een advies. Je kunt dit opvolgen of zelf een andere maat kiezen — deze maat wordt gebruikt voor de rest van de keuzehulp.",
    icon: "monitor",
    dynamic: true, // options generated at runtime
  },
  {
    id: "usage",
    name: "usage",
    type: "multi",
    max: 2,
    title: "Waar ga je de tv voornamelijk voor gebruiken?",
    why: "Films vragen om een hoge contrastratio, sport om een hoge beeldverversing, gamen om lage input lag. Kies maximaal 2 opties.",
    options: [
      { value: "films", label: "Films en series kijken", icon: "popcorn", price: "€€€" },
      { value: "sport", label: "Sport kijken", icon: "volleyball", price: "€€" },
      { value: "gamen", label: "Gamen", icon: "gamepad-2", price: "€€" },
      { value: "normaal", label: "Normale televisie kijken", icon: "tv", price: "€" },
    ],
  },
  {
    id: "quality",
    name: "quality",
    type: "single",
    title: "Hoe belangrijk vind je de beeldkwaliteit?",
    why: "Wie het allerbeste wil kiest doorgaans OLED of premium Mini LED. Voor casual gebruik is er een prima prijs-kwaliteitverhouding te vinden.",
    options: [
      { value: "best", label: "Ik wil de best mogelijke beeldkwaliteit", icon: "trophy", price: "€€€" },
      { value: "belangrijk", label: "Belangrijk, maar niet per se het beste", icon: "star", price: "€€" },
      { value: "prima", label: "Als het gewoon prima is, ben ik tevreden", icon: "thumbs-up", price: "€" },
    ],
  },
  {
    id: "timing",
    name: "timing",
    type: "single",
    title: "Wanneer kijk je meestal tv?",
    why: "In het donker komen OLED's diepe zwarttinten goed tot hun recht. Overdag zijn heldere QLED/LCD-schermen beter bestand tegen omgevingslicht.",
    options: [
      { value: "avonds", label: "In de avond als het donker is", icon: "moon", price: "€€€" },
      { value: "overdag", label: "Overdag als het licht is", icon: "sun", price: "€€" },
      { value: "beide", label: "Beide", icon: "sun-moon", price: "€€" },
      { value: "nvt", label: "Dit is voor mij niet belangrijk", icon: "minus-circle", price: "€" },
    ],
  },
  {
    id: "viewing",
    name: "viewing",
    type: "single",
    title: "Hoe kijk je meestal tv?",
    why: "OLED- en QLED-panelen houden kleur en contrast beter vast bij een schuine kijkhoek dan standaard LCD-panelen.",
    options: [
      { value: "recht", label: "Met 1 of 2 mensen recht voor de tv", icon: "sofa", price: "€€" },
      { value: "meerdere", label: "Met meerdere mensen, niet recht voor de tv", icon: "users", price: "€€€" },
      { value: "nvt", label: "Dit is voor mij niet belangrijk", icon: "minus-circle", price: "€" },
    ],
  },
  {
    id: "extra",
    name: "extra",
    type: "multi",
    max: 2,
    title: "Wat is extra belangrijk voor je tv?",
    why: "Perfecte zwarttinten zijn het specialisme van OLED. Extreme helderheid is het domein van Mini-LED/QLED. Kies maximaal 2 opties.",
    options: [
      { value: "zwart", label: "Zwarttinten; donkere beelden zijn extra mooi", icon: "cloud", price: "€€€" },
      { value: "helderheid", label: "Helderheid; de tv moet heel helder kunnen zijn", icon: "sun", price: "€€" },
      { value: "kleur", label: "Kleur; de mooiste kleuren moeten naar voren komen", icon: "palette", price: "€€" },
      { value: "niks", label: "Niets hiervan is extra belangrijk", icon: "minus-circle", price: "€" },
    ],
  },
];

const state = {
  step: 0,
  answers: {
    distance: "",
    sizeGroup: "",
    usage: [],
    quality: "",
    timing: "",
    viewing: "",
    extra: [],
  },
};

let allTVs = [];
let productsReady = false;

const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// ─── Product prefetch ───────────────────────────────────────────────────────
fetchProducts()
  .then(raw => {
    allTVs = normalizeProducts(raw ?? []);
    productsReady = true;
    updateLiveCount();
  })
  .catch(() => {
    allTVs = [];
    productsReady = true;
  });

// ─── Rendering ──────────────────────────────────────────────────────────────
function iconSvg(name) {
  return `<i data-lucide="${name}"></i>`;
}

function advisedSizeGroup() {
  const distance = state.answers.distance;
  return distanceToSizeGroup[distance] || null;
}

function optionsFor(question) {
  if (!question.dynamic) return question.options;
  const advised = advisedSizeGroup();
  return sizeGroups.map(sg => ({
    value: sg,
    label: `${sg} inch`,
    recommended: sg === advised,
  }));
}

function renderStep() {
  const question = QUESTIONS[state.step];
  const root = qs("#question-root");
  const options = optionsFor(question);
  const currentValue = state.answers[question.name];

  const isChecked = (opt) =>
    question.type === "multi"
      ? currentValue.includes(opt.value)
      : currentValue === opt.value;

  root.innerHTML = `
    <div class="q-head">
      <h2 class="q-title">${question.title}</h2>
      <button type="button" class="q-why-btn" aria-expanded="false">
        ${iconSvg("help-circle")}
        <span>Waarom deze vraag?</span>
      </button>
    </div>
    <div class="q-why-panel">${question.why}</div>
    ${question.type === "multi" ? `<p class="q-hint">Kies maximaal ${question.max} opties</p>` : ""}
    <div class="q-options ${question.dynamic ? "q-options--sizes" : ""}">
      ${options.map((opt, i) => `
        <label class="opt-card ${isChecked(opt) ? "is-selected" : ""}" style="--i:${i}">
          <input type="${question.type === "multi" ? "checkbox" : "radio"}"
                 name="${question.name}" value="${opt.value}"
                 ${isChecked(opt) ? "checked" : ""}>
          ${opt.icon ? `<span class="opt-icon">${iconSvg(opt.icon)}</span>` : ""}
          <span class="opt-label">${opt.label}</span>
          ${opt.recommended ? `<span class="opt-badge">Aanbevolen</span>` : ""}
          ${opt.price ? `<span class="opt-price">${opt.price}</span>` : ""}
          <span class="opt-check">${iconSvg("check")}</span>
        </label>
      `).join("")}
    </div>
  `;

  qsa(`input[name="${question.name}"]`, root).forEach(input => {
    input.addEventListener("change", () => onAnswer(question, input));
  });

  qs(".q-why-btn", root).addEventListener("click", (e) => {
    const btn = e.currentTarget;
    const panel = qs(".q-why-panel", root);
    const open = panel.classList.toggle("is-open");
    btn.classList.toggle("is-open", open);
    btn.setAttribute("aria-expanded", String(open));
  });

  if (window.lucide?.createIcons) window.lucide.createIcons();

  updateProgress();
  updateNavButtons();
}

function onAnswer(question, input) {
  if (question.type === "multi") {
    const checked = qsa(`input[name="${question.name}"]:checked`);
    if (checked.length > question.max) {
      input.checked = false;
      return;
    }
    state.answers[question.name] = checked.map(el => el.value);
  } else {
    state.answers[question.name] = input.value;
    if (question.id === "distance") {
      // Pre-fill the recommended size but don't lock the user in.
      state.answers.sizeGroup = advisedSizeGroup() || "";
    }
  }

  qsa(".opt-card", qs("#question-root")).forEach(card => {
    const cardInput = qs("input", card);
    card.classList.toggle("is-selected", cardInput.checked);
  });

  updateTvVisual();
  updateNavButtons();
  updateLiveCount();
}

// ─── Live room visualisation ────────────────────────────────────────────────
// The room pane holds a single <img> with object-fit:cover and
// object-position:right, so the left side of the photo gets cropped off
// (per the split-screen design) while the right edge always stays anchored.
// The TV itself is drawn live with CSS (bezel + animated screen glow)
// instead of a pre-rendered PNG per size, positioned using the same
// reference coordinates the live site uses (base-space 1242.21×630.138,
// with the TV's target spot measured from the photo's own right/bottom
// edge) — remapped here onto wherever that photo actually renders inside
// the (possibly heavily cropped) pane.
const ROOM_BASE_WIDTH = 1242.21;
const ROOM_BASE_HEIGHT = 630.138;
const ROOM_RIGHT_OFFSET = 410;
const ROOM_BOTTOM_OFFSET = 234;

function formatSizeLabel(sizeGroup) {
  const parts = String(sizeGroup).split("-").map(Number);
  const avgInch = parts.length === 2 ? (parts[0] + parts[1]) / 2 : parts[0];
  const diagonalCm = avgInch * 2.54;
  const widthCm = Math.round((diagonalCm * 16) / 18.3576);
  const heightCm = Math.round((diagonalCm * 9) / 18.3576);
  return `≈ ${widthCm} × ${heightCm} cm`;
}

function updateTvVisual() {
  const pane = qs("#room-pane");
  const wrap = qs("#tv-live-wrap");
  const label = qs("#tv-live-label");
  const hint = qs("#tv-stage-hint");
  if (!pane || !wrap || !label) return;

  const sizeGroup = state.answers.sizeGroup;
  const dims = tvDimensions[sizeGroup];

  if (!sizeGroup || !dims) {
    wrap.classList.remove("is-visible");
    if (hint) hint.classList.remove("is-hidden");
    return;
  }

  const paneWidth = pane.clientWidth;
  const paneHeight = pane.clientHeight;

  // object-fit: cover, object-position: 100% 50% — the photo's right edge
  // always sits flush with the pane's right edge; overflow crops equally
  // off the left, and top/bottom overflow is centered.
  const scale = Math.max(paneWidth / ROOM_BASE_WIDTH, paneHeight / ROOM_BASE_HEIGHT);
  const displayedHeight = ROOM_BASE_HEIGHT * scale;
  const photoOffsetFromBottom = (paneHeight - displayedHeight) / 2;

  const w = dims.width * scale;
  const h = dims.height * scale;
  const rightPx = ROOM_RIGHT_OFFSET * scale - w / 2;
  const bottomPx = photoOffsetFromBottom + ROOM_BOTTOM_OFFSET * scale;

  wrap.style.width = `${w}px`;
  wrap.style.height = `${h}px`;
  wrap.style.right = `${rightPx}px`;
  wrap.style.bottom = `${bottomPx}px`;
  wrap.classList.add("is-visible");

  label.textContent = formatSizeLabel(sizeGroup);

  if (hint) hint.classList.add("is-hidden");
}

function currentQuestionValid() {
  const question = QUESTIONS[state.step];
  const value = state.answers[question.name];
  return question.type === "multi" ? value.length > 0 : Boolean(value);
}

function updateNavButtons() {
  qs("#next-btn").disabled = !currentQuestionValid();
}

function updateProgress() {
  const total = QUESTIONS.length;
  const step = state.step + 1;
  qs("#progress-fill").style.width = `${(step / total) * 100}%`;
  qs("#progress-label").textContent = `Stap ${step} van ${total}`;

  qs("#step-dots").innerHTML = QUESTIONS.map((_, i) => `
    <span class="dot ${i < step ? "is-done" : ""} ${i === state.step ? "is-current" : ""}"></span>
  `).join("");

  qs("#back-btn").style.visibility = state.step === 0 ? "hidden" : "visible";
  qs("#next-btn").textContent = state.step === QUESTIONS.length - 1 ? "Bekijk mijn tv's" : "Volgende";
}

// ─── Live match counter ─────────────────────────────────────────────────────
function updateLiveCount() {
  const badge = qs("#live-count");
  if (!productsReady) {
    badge.textContent = "Producten laden…";
    badge.classList.add("is-loading");
    return;
  }
  badge.classList.remove("is-loading");

  const { sizeGroup, quality, timing, viewing, usage, extra } = state.answers;

  if (!sizeGroup) {
    badge.textContent = `${allTVs.length} tv's beschikbaar`;
    return;
  }

  const { sizeGroupToAllowedSizes } = window.__tvData;
  const allowedSizes = sizeGroupToAllowedSizes[sizeGroup] || [];
  let pool = allTVs.filter(tv => allowedSizes.includes(tv.grootte));

  if (quality) {
    pool = applyResolutionFilter(pool, quality);
  }

  let count = pool.length;
  let label = "tv's passen bij je maat";

  if (quality && timing && viewing) {
    const scores = calculateScores({ usageAnswers: usage, quality, timing, viewing, extraAnswers: extra });
    const result = matchTVs(allTVs, sizeGroup, null, { usageAnswers: usage, quality, timing, viewing, extraAnswers: extra }, scores);
    count = result.filteredMatchedTVs.length;
    label = "tv's passen bij al je antwoorden";
  }

  animateCount(badge, count, label);
}

let lastCount = null;
function animateCount(badge, count, label) {
  badge.innerHTML = `<strong>${count}</strong> <span>${label}</span>`;
  if (lastCount !== null && count !== lastCount) {
    badge.classList.remove("pulse");
    void badge.offsetWidth;
    badge.classList.add("pulse");
  }
  lastCount = count;
}

// ─── Navigation ─────────────────────────────────────────────────────────────
function goToStep(nextStep, direction) {
  const root = qs("#question-root");
  root.classList.add(direction === "forward" ? "slide-out-left" : "slide-out-right");

  window.setTimeout(() => {
    state.step = nextStep;
    renderStep();
    root.classList.remove("slide-out-left", "slide-out-right");
    root.classList.add(direction === "forward" ? "slide-in-right" : "slide-in-left");
    window.setTimeout(() => root.classList.remove("slide-in-right", "slide-in-left"), 320);
  }, 180);
}

function handleNext() {
  if (!currentQuestionValid()) return;

  if (state.step < QUESTIONS.length - 1) {
    goToStep(state.step + 1, "forward");
    return;
  }

  finishQuiz();
}

function handleBack() {
  if (state.step === 0) return;
  goToStep(state.step - 1, "back");
}

function finishQuiz() {
  const answers = {
    usageAnswers: state.answers.usage,
    quality: state.answers.quality,
    timing: state.answers.timing,
    viewing: state.answers.viewing,
    extraAnswers: state.answers.extra,
  };
  const scores = calculateScores(answers);
  const result = matchTVs(allTVs, state.answers.sizeGroup, null, answers, scores);

  localStorage.setItem("bestMatch", JSON.stringify(result.bestMatch));
  localStorage.setItem("bestType", result.bestType ?? "");
  localStorage.setItem("scores", JSON.stringify(scores));
  localStorage.setItem("filteredMatchedTVs", JSON.stringify(result.filteredMatchedTVs));
  localStorage.setItem("answers", JSON.stringify(answers));
  localStorage.setItem("selectedSizeGroup", state.answers.sizeGroup ?? "");

  const shell = qs("#quiz-shell");
  shell.classList.add("is-exiting");
  window.setTimeout(() => {
    window.location.href = "keuzehulpen/tv/resultaat";
  }, 260);
}

export async function initTestQuiz() {
  if (!qs("#question-root")) return;

  // Expose the size-group map to the live-count logic without re-importing.
  const { sizeGroupToAllowedSizes } = await import("../../../keuzehulpen/tv/js/data.js");
  window.__tvData = { sizeGroupToAllowedSizes };

  qs("#next-btn").addEventListener("click", handleNext);
  qs("#back-btn").addEventListener("click", handleBack);

  window.addEventListener("resize", updateTvVisual, { passive: true });

  renderStep();
  updateTvVisual();
  updateLiveCount();
}

initTestQuiz();
