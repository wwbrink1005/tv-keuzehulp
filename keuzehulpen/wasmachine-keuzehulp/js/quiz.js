import { priceGroupsByCapaciteit, capaciteitGroupToAllowedCapaciteit } from "./data.js";
import { calculateScores, matchWasmachines } from "./matching.js";
import { computeDynamicPriceGroups, getContainerScale, normalizeProducts, qs, qsa } from "./utils.js";
import { fetchProducts } from "./supabase.js";

const quizState = {
  selectedCapaciteitGroup: null,
  selectedPriceGroup:      null,
  priceGroups:             []
};

let productsFetchPromise = null;

function prefetchProducts() {
  if (!productsFetchPromise) {
    productsFetchPromise = fetchProducts().catch(() => null);
  }
  return productsFetchPromise;
}

const mobileQuery = window.matchMedia("(max-width: 900px)");

function getMenuOffset() {
  const rootStyles = getComputedStyle(document.documentElement);
  const menuHeight = parseFloat(rootStyles.getPropertyValue("--menu-height"));
  return Number.isFinite(menuHeight) ? menuHeight : 64;
}

function scrollMobileAnswersIntoView(question) {
  if (!mobileQuery.matches || !question) return;
  const answers = question.querySelector(".answers-container");
  if (!answers) return;
  const top = answers.getBoundingClientRect().top + window.scrollY - getMenuOffset() - 12;
  window.scrollTo({ top, behavior: "smooth" });
}

function setQuestionExpanded(question, expanded) {
  if (!question) return;
  question.classList.toggle("is-expanded", expanded);
  const toggle = question.querySelector(".answers-toggle");
  if (toggle) toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
}

const TOTAL_QUESTIONS = 5;

// Capaciteit-visualisatie: vaste wasmachine + trommel-vulling (leeg/normaal/vol)
// o.b.v. gezinsgrootte. De basismachine (zonder trommel) staat altijd vast;
// alleen de trommel-laag wisselt, via crossfade tussen 2 lagen zodat er nooit
// een moment is waarop de machine zonder trommel te zien is.
const WASMACHINE_BASE_IMAGE = "keuzehulpen/wasmachine-keuzehulp/images/wasmachine zonder trommel.png";

const DRUM_IMAGES = {
  klein:     "keuzehulpen/wasmachine-keuzehulp/images/trommel leeg.png",
  gemiddeld: "keuzehulpen/wasmachine-keuzehulp/images/trommel normaal.png",
  groot:     "keuzehulpen/wasmachine-keuzehulp/images/trommel vol.png"
};

// Afmetingen (px in de 1242.21-brede coördinatenruimte). Basismachine en
// trommel-laag hebben elk hun EIGEN grootte/positie — pas WASMACHINE_DIMENSIONS
// aan om de machine te schalen, DRUM_DIMENSIONS om alleen de trommel-foto
// groter/kleiner te maken of preciezer over het trommelgat heen te leggen.
const WASMACHINE_DIMENSIONS = { width: 275, height: 325 };
const DRUM_DIMENSIONS       = { width: 201.633, height: 238.326 };

let currentDrumGroup = null;
// Welke van de 2 trommel-lagen momenteel "actief" (zichtbaar) is — de andere
// is de laag die we voorladen en naar toe crossfaden bij de volgende wissel.
let activeDrumLayer = "a";

function positionWasmachineLayer(el, container, dims, rightOffsetVar, bottomOffsetVar) {
  const style = getComputedStyle(container);
  const originalWidth  = parseFloat(style.getPropertyValue("--base-width"))  || 1242.21;
  const originalHeight = parseFloat(style.getPropertyValue("--base-height")) || 630.138;
  const scaleFactor    = container.offsetWidth / originalWidth;

  const rightOffset  = parseFloat(style.getPropertyValue(rightOffsetVar))  || 300;
  const bottomOffset = parseFloat(style.getPropertyValue(bottomOffsetVar)) || 40;

  const rightPct  = ((rightOffset - dims.width / 2) / originalWidth) * 100;
  const bottomPct = (bottomOffset / originalHeight) * 100;

  el.style.width  = `${dims.width  * scaleFactor}px`;
  el.style.height = `${dims.height * scaleFactor}px`;
  el.style.right  = `${rightPct}%`;
  el.style.bottom = `${bottomPct}%`;
  el.style.left   = "auto";
}

function positionBaseLayer(el, container) {
  positionWasmachineLayer(el, container, WASMACHINE_DIMENSIONS, "--wasmachine-right-offset", "--wasmachine-bottom-offset");
}

function positionDrumLayer(el, container) {
  positionWasmachineLayer(el, container, DRUM_DIMENSIONS, "--wasmachine-drum-right-offset", "--wasmachine-drum-bottom-offset");
}

function updateWasmachineDisplay() {
  const checked = qs('input[name="capaciteitGroup"]:checked');
  const base   = qs("#wasmachine-base");
  const drumA  = qs("#wasmachine-drum-a");
  const drumB  = qs("#wasmachine-drum-b");
  const container = qs(".background-container");

  if (!base || !drumA || !drumB || !container) return;

  if (!checked || !DRUM_IMAGES[checked.value]) {
    [base, drumA, drumB].forEach(el => {
      el.style.opacity = "0";
      window.setTimeout(() => { el.style.display = "none"; }, 300);
    });
    currentDrumGroup = null;
    return;
  }

  // Basismachine: éénmalig tonen, blijft daarna altijd staan.
  if (base.style.display !== "block") {
    base.style.backgroundImage = `url('${WASMACHINE_BASE_IMAGE}')`;
    positionBaseLayer(base, container);
    base.style.display = "block";
    requestAnimationFrame(() => { base.style.opacity = "1"; });
  } else {
    positionBaseLayer(base, container);
  }

  // Al de juiste trommel-vulling in beeld — niets te doen (voorkomt opnieuw
  // crossfaden bij elke vraagwissel).
  if (currentDrumGroup === checked.value) {
    const active = activeDrumLayer === "a" ? drumA : drumB;
    positionDrumLayer(active, container);
    return;
  }
  currentDrumGroup = checked.value;

  const activeEl   = activeDrumLayer === "a" ? drumA : drumB;
  const inactiveEl = activeDrumLayer === "a" ? drumB : drumA;
  const nextLayer  = activeDrumLayer === "a" ? "b" : "a";

  inactiveEl.style.backgroundImage = `url('${DRUM_IMAGES[checked.value]}')`;
  positionDrumLayer(inactiveEl, container);
  positionDrumLayer(activeEl, container);
  inactiveEl.style.display = "block";

  const isFirstShow = activeEl.style.display !== "block";

  if (isFirstShow) {
    // Nog geen trommel getoond: alleen de nieuwe laag hoeft in te faden.
    requestAnimationFrame(() => { inactiveEl.style.opacity = "1"; });
  } else {
    // Crossfade: oude laag uit, nieuwe laag in — tegelijk, dus altijd
    // minstens 1 laag volledig zichtbaar (nooit een "lege" tussenstap).
    requestAnimationFrame(() => {
      activeEl.style.opacity   = "0";
      inactiveEl.style.opacity = "1";
    });
  }

  activeDrumLayer = nextLayer;
}

function showQuestion(num) {
  for (let i = 1; i <= TOTAL_QUESTIONS; i++) {
    const q = qs(`#question-${i}`);
    if (q) {
      q.classList.remove("is-active");
      q.style.display = "none";
    }
  }

  if (num === "result") {
    updateProgressBar("result");
    const hintBtn = qs("#question-hint-btn");
    const hintBtnMobile = qs("#question-hint-btn-mobile");
    if (hintBtn) hintBtn.style.display = "none";
    if (hintBtnMobile) hintBtnMobile.style.display = "none";
    return;
  }

  const currentQuestion = qs(`#question-${num}`);
  if (!currentQuestion) return;

  currentQuestion.style.display = "block";

  // Capaciteit-visualisatie: blijft zichtbaar zodra een gezinsgrootte is
  // gekozen, gedurende de hele keuzehulp (niet alleen op vraag 1).
  updateWasmachineDisplay();

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      currentQuestion.classList.add("is-active");
      setQuestionExpanded(currentQuestion, false);
      positionElements(num);
      updateProgressBar(num);

      const hintBtn = qs("#question-hint-btn");
      if (hintBtn) {
        hintBtn.style.display = "";
        hintBtn.textContent = "Waarom deze vraag?";
      }
      const hintBtnMobile = qs("#question-hint-btn-mobile");
      if (hintBtnMobile) hintBtnMobile.style.display = "";
    });
  });
}

function updateProgressBar(questionNum) {
  const progressBar = qs("#progress-bar");
  if (!progressBar) return;
  if (questionNum === "result") {
    progressBar.style.width = "100%";
  } else if (typeof questionNum === "number" && questionNum >= 1 && questionNum <= TOTAL_QUESTIONS) {
    progressBar.style.width = `${(questionNum / TOTAL_QUESTIONS) * 100}%`;
  }
}

function positionElements(questionNum) {
  const question = qs(`#question-${questionNum} .question-container`);
  const answers  = qs(`#question-${questionNum} .answers-container`);
  const buttons  = qs(`#question-${questionNum} .button-container`);

  if (!question || !answers) return;

  if (question.offsetHeight === 0) {
    requestAnimationFrame(() => positionElements(questionNum));
    return;
  }

  const scale = getContainerScale(question);
  const answersTop = question.offsetTop + question.offsetHeight + (20 * scale);
  answers.style.top = `${answersTop}px`;

  if (buttons) {
    const buttonsTop = answersTop + answers.offsetHeight + (22 * scale);
    buttons.style.top = `${buttonsTop}px`;
  }
}

function renderPriceOptions(groups) {
  const container = qs("#price-options");
  if (!container) return;
  container.innerHTML = "";

  groups.forEach(group => {
    const label = document.createElement("label");
    label.className = "answer-option";
    label.innerHTML = `
      <input type="radio" name="priceGroup" value="${group.label}">
      <span>€ ${group.label}</span>
    `;
    container.appendChild(label);
  });

  const noPriceLabel = document.createElement("label");
  noPriceLabel.className = "answer-option";
  noPriceLabel.innerHTML = `
    <input type="radio" name="priceGroup" value="geen-voorkeur">
    <span>Geen voorkeur – toon alle prijzen</span>
  `;
  container.appendChild(noPriceLabel);
}

function resetQuestionsFrom(questionNumber) {
  for (let i = questionNumber; i <= TOTAL_QUESTIONS; i++) {
    const inputs = qsa(`#question-${i} input`);
    inputs.forEach(input => { input.checked = false; });
  }
}

function buildAnswers() {
  return {
    gebruik:      qs('input[name="gebruik"]:checked')?.value ?? "",
    geluid:       qs('input[name="geluid"]:checked')?.value ?? "",
    extraAnswers: qsa('input[name="extra"]:checked').map(cb => cb.value)
  };
}

function setupExtraLimit() {
  const geenCheckbox = qs('input[name="extra"][value="geen"]');
  const otherExtraCheckboxes = qsa('input[name="extra"]:not([value="geen"])');
  if (!geenCheckbox || otherExtraCheckboxes.length === 0) return;

  geenCheckbox.addEventListener("change", function() {
    if (this.checked) {
      otherExtraCheckboxes.forEach(cb => { cb.checked = false; });
    }
  });

  otherExtraCheckboxes.forEach(checkbox => {
    checkbox.addEventListener("change", function() {
      if (this.checked) {
        geenCheckbox.checked = false;
      }
    });
  });
}

function handleStartMatching() {
  const extraChecked = qsa('input[name="extra"]:checked');
  if (extraChecked.length === 0) return alert("Kies minimaal 1 antwoord");

  const answers = buildAnswers();
  const scores = calculateScores(answers);

  const btn = qs("#start-matching");
  if (btn) { btn.disabled = true; btn.textContent = "Bezig…"; }

  prefetchProducts()
    .then(rawProducts => {
      const wasmachines = normalizeProducts(rawProducts ?? []);
      const result = matchWasmachines(
        wasmachines,
        quizState.selectedCapaciteitGroup,
        quizState.selectedPriceGroup,
        answers,
        scores
      );

      localStorage.setItem("wasmachine_bestMatch",                   JSON.stringify(result.bestMatch));
      localStorage.setItem("wasmachine_bestType",                    result.bestType ?? "");
      localStorage.setItem("wasmachine_scores",                      JSON.stringify(scores));
      localStorage.setItem("wasmachine_filteredMatchedWasmachines",  JSON.stringify(result.filteredMatchedWasmachines));
      localStorage.setItem("wasmachine_answers",                     JSON.stringify(answers));
      localStorage.setItem("wasmachine_selectedCapaciteitGroup",     quizState.selectedCapaciteitGroup ?? "");
      localStorage.setItem("wasmachine_selectedPriceGroupLabel",     quizState.selectedPriceGroup?.label ?? "");
      localStorage.setItem("wasmachine_dynamicPriceGroups",          JSON.stringify(quizState.priceGroups));

      const wrapper = qs(".container-wrapper");
      if (wrapper) wrapper.classList.add("is-exiting");
      setTimeout(() => {
        window.location.href = "keuzehulpen/wasmachine-keuzehulp/resultaat";
      }, 180);
    })
    .catch(() => {
      if (btn) { btn.disabled = false; btn.textContent = "Resultaat"; }
      alert("Fout bij ophalen van producten. Probeer het opnieuw.");
    });
}

export function initQuizPage() {
  if (!qs("#question-1")) return;

  // Pre-fetch products in the background
  prefetchProducts();

  // Q1 → Q2 (fetch dynamic price groups based on selected capaciteitGroup)
  qs("#to-question-2")?.addEventListener("click", async () => {
    const checked = qs('input[name="capaciteitGroup"]:checked');
    if (!checked) return alert("Kies een gezinsgrootte");

    quizState.selectedCapaciteitGroup = checked.value;

    const btn = qs("#to-question-2");
    if (btn) btn.disabled = true;
    try {
      const rawProducts = await prefetchProducts();
      const wasmachines = normalizeProducts(rawProducts ?? []);
      const dynamic = computeDynamicPriceGroups(wasmachines, quizState.selectedCapaciteitGroup, capaciteitGroupToAllowedCapaciteit);
      quizState.priceGroups = dynamic.length > 0 ? dynamic : (priceGroupsByCapaciteit[quizState.selectedCapaciteitGroup] ?? []);
    } catch {
      quizState.priceGroups = priceGroupsByCapaciteit[quizState.selectedCapaciteitGroup] ?? [];
    } finally {
      if (btn) btn.disabled = false;
    }

    renderPriceOptions(quizState.priceGroups);
    showQuestion(2);
  });

  // Q2 → Q1
  qs("#back-to-question-1")?.addEventListener("click", () => {
    resetQuestionsFrom(2);
    showQuestion(1);
  });

  // Q2 → Q3
  qs("#to-question-3")?.addEventListener("click", () => {
    const checked = qs('input[name="priceGroup"]:checked');
    if (!checked) return alert("Kies een budget");
    quizState.selectedPriceGroup = checked.value === "geen-voorkeur"
      ? null
      : quizState.priceGroups.find(p => p.label === checked.value);
    showQuestion(3);
  });

  // Q3 → Q2
  qs("#back-to-question-2")?.addEventListener("click", () => {
    resetQuestionsFrom(3);
    showQuestion(2);
  });

  // Q3 → Q4
  qs("#to-question-4")?.addEventListener("click", () => {
    const checked = qs('input[name="geluid"]:checked');
    if (!checked) return alert("Kies een antwoord");
    showQuestion(4);
  });

  // Q4 → Q3
  qs("#back-to-question-3")?.addEventListener("click", () => {
    resetQuestionsFrom(4);
    showQuestion(3);
  });

  // Q4 → Q5
  qs("#to-question-5")?.addEventListener("click", () => {
    const checked = qs('input[name="gebruik"]:checked');
    if (!checked) return alert("Kies een antwoord");
    showQuestion(5);
  });

  // Q5 → Q4
  qs("#back-to-question-4")?.addEventListener("click", () => {
    resetQuestionsFrom(5);
    showQuestion(4);
  });

  setupExtraLimit();

  // Q5 → Result
  qs("#start-matching")?.addEventListener("click", handleStartMatching);

  // Live-visualisatie bij het kiezen van een gezinsgrootte (Q1)
  qsa('input[name="capaciteitGroup"]').forEach(radio => {
    radio.addEventListener("change", updateWasmachineDisplay);
  });

  window.addEventListener("resize", () => {
    updateWasmachineDisplay();
    if (mobileQuery.matches) return;
    for (let i = 1; i <= TOTAL_QUESTIONS; i++) {
      const q = qs(`#question-${i}`);
      if (q && q.classList.contains("is-active")) {
        positionElements(i);
        break;
      }
    }
  }, { passive: true });

  showQuestion(1);
}
