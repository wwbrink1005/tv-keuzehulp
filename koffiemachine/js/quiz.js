import { matchKoffiemachines } from "./matching.js";
import { getContainerScale, normalizeProducts, qs, qsa } from "./utils.js";
import { fetchProducts } from "./supabase.js";

let productsFetchPromise = null;

function prefetchProducts() {
  if (!productsFetchPromise) {
    productsFetchPromise = fetchProducts().catch(() => null);
  }
  return productsFetchPromise;
}

const mobileQuery = window.matchMedia("(max-width: 900px)");

const TOTAL_QUESTIONS = 4;

// Filterkoffiezetapparaten hebben fysiek geen melksysteem (94% van de 69
// filterapparaten heeft geen enkel melk-gerelateerd Icecat-veld, geverifieerd
// tegen de volledige live catalogus) — Q3 (melk) wordt daarom overgeslagen
// als bij Q1 "filter" gekozen is. Zelfde patroon als desktop's Q5 (RGB/
// waterkoeling/wifi), die overgeslagen wordt bij mini-pc/all-in-one.
const quizState = { type: "" };

function isFilterFlow() {
  return quizState.type === "filter";
}

// Wisselt de achtergrondfoto (Q1-antwoord) met een fade, zelfde patroon als
// koelkast's updateBackgroundLayer().
function updateBackgroundLayer(type) {
  const layers = {
    volautomaat:  qs("#bg-layer-volautomaat"),
    halfautomaat: qs("#bg-layer-halfautomaat"),
    capsules:     qs("#bg-layer-capsules"),
    filter:       qs("#bg-layer-filter"),
  };
  Object.entries(layers).forEach(([key, layer]) => {
    if (layer) layer.classList.toggle("is-visible", key === type);
  });
}

// Wifi is bij filterkoffiezetapparaten letterlijk nooit ingevuld in Icecat
// (0/69, zelfs geen enkele expliciete "Nee" — geverifieerd tegen de volledige
// live catalogus), in tegenstelling tot de andere 3 typen waar het een echt,
// gevuld Ja/Nee-veld is. Verberg de optie dus bij "filter", zelfde patroon
// als desktop's tower-only extra's.
function updateExtraOptionsVisibility() {
  qsa("[data-not-filter-only]").forEach(label => {
    label.style.display = isFilterFlow() ? "none" : "";
    if (isFilterFlow()) {
      const input = label.querySelector("input");
      if (input) input.checked = false;
    }
  });
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

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      currentQuestion.classList.add("is-active");
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
    return;
  }
  const effectiveTotal = isFilterFlow() ? 3 : 4;
  // Bij de filter-flow wordt Q3 overgeslagen: Q4 is dan effectief de 3e stap.
  const effectiveStep = isFilterFlow() && questionNum >= 4 ? questionNum - 1 : questionNum;
  if (typeof questionNum === "number" && questionNum >= 1) {
    progressBar.style.width = `${(effectiveStep / effectiveTotal) * 100}%`;
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
    type:         qs('input[name="type"]:checked')?.value ?? "",
    hoeveelheid:  qs('input[name="hoeveelheid"]:checked')?.value ?? "",
    melk:         qs('input[name="melk"]:checked')?.value ?? "",
    extraAnswers: qsa('input[name="extra"]:checked').map(cb => cb.value),
  };
}

function setupGeenExclusiviteit(groepNaam) {
  const geenCheckbox = qs(`input[name="${groepNaam}"][value="geen"]`);
  const overigeCheckboxes = qsa(`input[name="${groepNaam}"]:not([value="geen"])`);
  if (!geenCheckbox || overigeCheckboxes.length === 0) return;

  geenCheckbox.addEventListener("change", function() {
    if (this.checked) {
      overigeCheckboxes.forEach(cb => { cb.checked = false; });
    }
  });

  overigeCheckboxes.forEach(checkbox => {
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
      const koffiemachines = normalizeProducts(rawProducts ?? []);
      const result = matchKoffiemachines(koffiemachines, answers);

      localStorage.setItem("koffiemachine_bestMatch",              JSON.stringify(result.bestMatch));
      localStorage.setItem("koffiemachine_bestType",               result.bestType ?? "");
      localStorage.setItem("koffiemachine_filteredMatchedKoffiemachines", JSON.stringify(result.filteredMatchedKoffiemachines));
      localStorage.setItem("koffiemachine_answers",                JSON.stringify(answers));

      const wrapper = qs(".container-wrapper");
      if (wrapper) wrapper.classList.add("is-exiting");
      setTimeout(() => {
        window.location.href = "koffiemachine/resultaat";
      }, 180);
    })
    .catch(() => {
      if (btn) { btn.disabled = false; btn.textContent = "Resultaat"; }
      alert("Fout bij ophalen van producten. Probeer het opnieuw.");
    });
}

export function initQuizPage() {
  if (!qs("#question-1")) return;

  prefetchProducts();

  // Q1 → Q2
  qs("#to-question-2")?.addEventListener("click", () => {
    const checked = qs('input[name="type"]:checked');
    if (!checked) return alert("Kies een antwoord");
    quizState.type = checked.value;
    updateExtraOptionsVisibility();
    updateBackgroundLayer(quizState.type);
    showQuestion(2);
  });

  // Live crossfade-preview terwijl je nog op Q1 staat, nog vóór "Volgende"
  qsa('input[name="type"]').forEach(radio => {
    radio.addEventListener("change", () => updateBackgroundLayer(radio.value));
  });

  // Q2 → Q1
  qs("#back-to-question-1")?.addEventListener("click", () => {
    resetQuestionsFrom(2);
    showQuestion(1);
  });

  // Q2 → Q3, of direct Q2 → Q4 als "filter" gekozen is (Q3 overgeslagen)
  qs("#to-question-3")?.addEventListener("click", () => {
    const checked = qs('input[name="hoeveelheid"]:checked');
    if (!checked) return alert("Kies een antwoord");
    if (isFilterFlow()) {
      showQuestion(4);
    } else {
      showQuestion(3);
    }
  });

  // Q3 → Q2
  qs("#back-to-question-2")?.addEventListener("click", () => {
    resetQuestionsFrom(3);
    showQuestion(2);
  });

  // Q3 → Q4
  qs("#to-question-4")?.addEventListener("click", () => {
    const checked = qs('input[name="melk"]:checked');
    if (!checked) return alert("Kies een antwoord");
    showQuestion(4);
  });

  // Q4 → Q3, of Q4 → Q2 als "filter" gekozen was (Q3 was overgeslagen)
  qs("#back-to-question-3")?.addEventListener("click", () => {
    resetQuestionsFrom(3);
    showQuestion(isFilterFlow() ? 2 : 3);
  });

  setupGeenExclusiviteit("extra");

  // Q4 → Result
  qs("#start-matching")?.addEventListener("click", handleStartMatching);

  window.addEventListener("resize", () => {
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
