import { matchVaatwassers } from "./matching.js";
import { getContainerScale, normalizeProducts, qs, qsa } from "./utils.js";
import { fetchProducts } from "./supabase.js";

const quizState = {
  selectedPlaatsing: null
};

let productsFetchPromise = null;

function prefetchProducts() {
  if (!productsFetchPromise) {
    productsFetchPromise = fetchProducts().catch(() => null);
  }
  return productsFetchPromise;
}

const mobileQuery = window.matchMedia("(max-width: 900px)");

// Basis-achtergrond toont de keuken zonder vaatwasser. Zodra "inbouw" of
// "vrijstaand" gekozen wordt op Q1 fadet de bijpassende volledige scène-foto
// erover (zelfde crossfade-patroon als vriezer, zie CSS-comment in
// vragen/index.html).
function updateBackgroundLayer(plaatsing) {
  const inbouwLayer     = qs("#bg-layer-inbouw");
  const vrijstaandLayer = qs("#bg-layer-vrijstaand");
  if (inbouwLayer)     inbouwLayer.classList.toggle("is-visible", plaatsing === "inbouw");
  if (vrijstaandLayer) vrijstaandLayer.classList.toggle("is-visible", plaatsing === "vrijstaand");
}

const TOTAL_QUESTIONS = 6;

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
    gezinsgrootte:    qs('input[name="gezinsgrootte"]:checked')?.value ?? "",
    geluid:           qs('input[name="geluid"]:checked')?.value ?? "",
    energie:          qs('input[name="energie"]:checked')?.value ?? "",
    extraAnswers:     qsa('input[name="extra"]:checked').map(cb => cb.value),
    programmaAnswers: qsa('input[name="programma"]:checked').map(cb => cb.value)
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
  const programmaChecked = qsa('input[name="programma"]:checked');
  if (programmaChecked.length === 0) return alert("Kies minimaal 1 antwoord");

  const answers = buildAnswers();
  answers.plaatsing = quizState.selectedPlaatsing;

  const btn = qs("#start-matching");
  if (btn) { btn.disabled = true; btn.textContent = "Bezig…"; }

  prefetchProducts()
    .then(rawProducts => {
      const vaatwassers = normalizeProducts(rawProducts ?? []);
      const result = matchVaatwassers(vaatwassers, answers);

      localStorage.setItem("vaatwasser_bestMatch",                  JSON.stringify(result.bestMatch));
      localStorage.setItem("vaatwasser_bestType",                   result.bestType ?? "");
      localStorage.setItem("vaatwasser_filteredMatchedVaatwassers", JSON.stringify(result.filteredMatchedVaatwassers));
      localStorage.setItem("vaatwasser_answers",                    JSON.stringify(answers));
      localStorage.setItem("vaatwasser_selectedPlaatsing",          quizState.selectedPlaatsing ?? "");

      const wrapper = qs(".container-wrapper");
      if (wrapper) wrapper.classList.add("is-exiting");
      setTimeout(() => {
        window.location.href = "vaatwasser/resultaat";
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

  // Live-crossfade zodra een plaatsing-antwoord wordt aangeklikt (niet pas
  // na "Volgende"), zelfde gevoel als vriezer.
  qsa('input[name="plaatsing"]').forEach(radio => {
    radio.addEventListener("change", () => updateBackgroundLayer(radio.value));
  });

  // Q1 → Q2
  qs("#to-question-2")?.addEventListener("click", () => {
    const checked = qs('input[name="plaatsing"]:checked');
    if (!checked) return alert("Kies inbouw of vrijstaand");
    quizState.selectedPlaatsing = checked.value;
    showQuestion(2);
  });

  // Q2 → Q1
  qs("#back-to-question-1")?.addEventListener("click", () => {
    resetQuestionsFrom(2);
    showQuestion(1);
  });

  // Q2 → Q3
  qs("#to-question-3")?.addEventListener("click", () => {
    const checked = qs('input[name="gezinsgrootte"]:checked');
    if (!checked) return alert("Kies een antwoord");
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
    const checked = qs('input[name="energie"]:checked');
    if (!checked) return alert("Kies een antwoord");
    showQuestion(5);
  });

  // Q5 → Q4
  qs("#back-to-question-4")?.addEventListener("click", () => {
    resetQuestionsFrom(5);
    showQuestion(4);
  });

  // Q5 → Q6
  qs("#to-question-6")?.addEventListener("click", () => {
    const checked = qsa('input[name="extra"]:checked');
    if (checked.length === 0) return alert("Kies minimaal 1 antwoord");
    showQuestion(6);
  });

  // Q6 → Q5
  qs("#back-to-question-5")?.addEventListener("click", () => {
    resetQuestionsFrom(6);
    showQuestion(5);
  });

  setupGeenExclusiviteit("extra");
  setupGeenExclusiviteit("programma");

  // Q6 → Result
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
