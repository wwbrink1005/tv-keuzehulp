import { matchWasmachines } from "./matching.js";
import { getContainerScale, normalizeProducts, qs, qsa } from "./utils.js";
import { fetchProducts } from "./supabase.js";
import { capaciteitGroupToAllowedCapaciteit } from "./data.js";

// Labels voor het capaciteits-badge op de achtergrondfoto, afgeleid van
// dezelfde ranges die de matching-logica gebruikt (data.js) — geen losse
// verzonnen getallen.
const CAPACITEIT_BADGE_LABELS = Object.fromEntries(
  Object.entries(capaciteitGroupToAllowedCapaciteit).map(([group, range]) => {
    const { displayMin, displayMax } = range;
    return [group, displayMin === displayMax ? `${displayMin} kg` : `${displayMin}-${displayMax} kg`];
  })
);

const quizState = {
  selectedCapaciteitGroup: null
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

const TOTAL_QUESTIONS = 3;

// Bovenladers komen in de catalogus uitsluitend voor bij de "klein"
// capaciteitsgroep (1-2 personen) — bij gemiddeld/groot bestaat de optie
// gewoon niet, dus die zou daar toch nooit iets filteren. Zelfde patroon als
// de tower-only RGB/waterkoeling-opties bij de desktop-keuzehulp.
function updateExtraOptionsVisibility() {
  const isKlein = quizState.selectedCapaciteitGroup === "klein";
  qsa('[data-klein-only]').forEach(label => {
    label.style.display = isKlein ? "" : "none";
    if (!isKlein) {
      const input = label.querySelector("input");
      if (input) input.checked = false;
    }
  });
}

// Capaciteit-visualisatie: 3 volledige achtergrond-varianten (zelfde kamer +
// machine, oplopende hoeveelheid was) die crossfaden o.b.v. gezinsgrootte —
// zelfde laag-crossfade-patroon als de koelkast-keuzehulp.
function updateWasmachineDisplay() {
  const checked = qs('input[name="capaciteitGroup"]:checked');
  const layers = {
    klein:     qs("#bg-layer-klein"),
    gemiddeld: qs("#bg-layer-gemiddeld"),
    groot:     qs("#bg-layer-groot"),
  };

  const active = checked?.value ?? null;

  Object.entries(layers).forEach(([key, layer]) => {
    if (layer) layer.classList.toggle("is-visible", key === active);
  });

  const badge = qs("#wasmachine-dim-badge");
  if (badge) {
    const label = active ? CAPACITEIT_BADGE_LABELS[active] : null;
    if (label) {
      badge.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10"/>
          <circle cx="12" cy="12" r="5.5"/>
          <path d="M12 9.2v2.8l1.8 1.8"/>
        </svg>
        <span>Trommelcapaciteit ${label}</span>
      `;
      badge.classList.add("is-visible");
    } else {
      badge.classList.remove("is-visible");
    }
  }
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

  if (num === 3) updateExtraOptionsVisibility();

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

function resetQuestionsFrom(questionNumber) {
  for (let i = questionNumber; i <= TOTAL_QUESTIONS; i++) {
    const inputs = qsa(`#question-${i} input`);
    inputs.forEach(input => { input.checked = false; });
  }
}

function buildAnswers() {
  return {
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

  const btn = qs("#start-matching");
  if (btn) { btn.disabled = true; btn.textContent = "Bezig…"; }

  prefetchProducts()
    .then(rawProducts => {
      const wasmachines = normalizeProducts(rawProducts ?? []);
      const result = matchWasmachines(
        wasmachines,
        quizState.selectedCapaciteitGroup,
        null,
        answers
      );

      localStorage.setItem("wasmachine_bestMatch",                   JSON.stringify(result.bestMatch));
      localStorage.setItem("wasmachine_bestType",                    result.bestType ?? "");
      localStorage.setItem("wasmachine_filteredMatchedWasmachines",  JSON.stringify(result.filteredMatchedWasmachines));
      localStorage.setItem("wasmachine_answers",                     JSON.stringify(answers));
      localStorage.setItem("wasmachine_selectedCapaciteitGroup",     quizState.selectedCapaciteitGroup ?? "");

      const wrapper = qs(".container-wrapper");
      if (wrapper) wrapper.classList.add("is-exiting");
      setTimeout(() => {
        window.location.href = "wasmachine/resultaat";
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

  // Q1 → Q2
  qs("#to-question-2")?.addEventListener("click", () => {
    const checked = qs('input[name="capaciteitGroup"]:checked');
    if (!checked) return alert("Kies een gezinsgrootte");

    quizState.selectedCapaciteitGroup = checked.value;

    showQuestion(2);
  });

  // Q2 → Q1
  qs("#back-to-question-1")?.addEventListener("click", () => {
    resetQuestionsFrom(2);
    showQuestion(1);
  });

  // Q2 → Q3 (extra's)
  qs("#to-question-3")?.addEventListener("click", () => {
    const checked = qs('input[name="geluid"]:checked');
    if (!checked) return alert("Kies een antwoord");
    showQuestion(3);
  });

  // Q3 → Q2
  qs("#back-to-question-2")?.addEventListener("click", () => {
    resetQuestionsFrom(3);
    showQuestion(2);
  });

  setupExtraLimit();

  // Q3 → Result
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
