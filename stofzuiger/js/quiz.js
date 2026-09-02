import { matchStofzuigers } from "./matching.js";
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

// 5 conceptuele stappen; stap 4 wisselt van inhoud (zak vs looptijd)
// afhankelijk van het Q1-antwoord, zelfde soort branching als koffiemachine's
// melk-vraag maar hier wisselt de VRAAG i.p.v. dat hij wordt overgeslagen.
const TOTAL_QUESTIONS = 5;

const quizState = { type: "" };

function isSteel() {
  return quizState.type === "Steelstofzuiger";
}

function step4Id() {
  return isSteel() ? "question-4-looptijd" : "question-4-zak";
}

function updateStep4Visibility() {
  const zakBlock     = qs("#question-4-zak");
  const looptijdBlock = qs("#question-4-looptijd");
  if (zakBlock)      zakBlock.style.display      = isSteel() ? "none" : "";
  if (looptijdBlock) looptijdBlock.style.display = isSteel() ? "" : "none";
}

function showQuestion(id) {
  const allBlocks = [
    "question-1", "question-2", "question-3",
    "question-4-zak", "question-4-looptijd", "question-5",
  ];

  allBlocks.forEach(blockId => {
    const block = qs(`#${blockId}`);
    if (block) {
      block.classList.remove("is-active");
      block.style.display = "none";
    }
  });

  updateStep4Visibility();

  if (id === "result") {
    updateProgressBar(TOTAL_QUESTIONS);
    const hintBtn = qs("#question-hint-btn");
    const hintBtnMobile = qs("#question-hint-btn-mobile");
    if (hintBtn) hintBtn.style.display = "none";
    if (hintBtnMobile) hintBtnMobile.style.display = "none";
    return;
  }

  const currentQuestion = qs(`#${id}`);
  if (!currentQuestion) return;

  currentQuestion.style.display = "block";

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      currentQuestion.classList.add("is-active");
      positionElements(id);
      updateProgressBar(stepNumberFor(id));

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

function stepNumberFor(id) {
  if (id === "question-1") return 1;
  if (id === "question-2") return 2;
  if (id === "question-3") return 3;
  if (id === "question-4-zak" || id === "question-4-looptijd") return 4;
  if (id === "question-5") return 5;
  return 1;
}

function updateProgressBar(stepNumber) {
  const progressBar = qs("#progress-bar");
  if (!progressBar) return;
  if (typeof stepNumber === "number" && stepNumber >= 1) {
    progressBar.style.width = `${(stepNumber / TOTAL_QUESTIONS) * 100}%`;
  }
}

function positionElements(id) {
  const question = qs(`#${id} .question-container`);
  const answers  = qs(`#${id} .answers-container`);
  const buttons  = qs(`#${id} .button-container`);

  if (!question || !answers) return;

  if (question.offsetHeight === 0) {
    requestAnimationFrame(() => positionElements(id));
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

function resetQuestionInputs(id) {
  qsa(`#${id} input`).forEach(input => { input.checked = false; });
}

function buildAnswers() {
  return {
    stofzuigerType: qs('input[name="stofzuigerType"]:checked')?.value ?? "",
    vloertype:      qs('input[name="vloertype"]:checked')?.value ?? "",
    huisdieren:     qs('input[name="huisdieren"]:checked')?.value ?? "",
    zak:            qs('input[name="zak"]:checked')?.value ?? "",
    looptijd:       qs('input[name="looptijd"]:checked')?.value ?? "",
    geluid:         qs('input[name="geluid"]:checked')?.value ?? "",
  };
}

function handleStartMatching() {
  const geluidChecked = qs('input[name="geluid"]:checked');
  if (!geluidChecked) return alert("Kies een antwoord");

  const answers = buildAnswers();

  const btn = qs("#start-matching");
  if (btn) { btn.disabled = true; btn.textContent = "Bezig…"; }

  prefetchProducts()
    .then(rawProducts => {
      const stofzuigers = normalizeProducts(rawProducts ?? []);
      const result = matchStofzuigers(stofzuigers, answers);

      localStorage.setItem("stofzuiger_bestMatch",                     JSON.stringify(result.bestMatch));
      localStorage.setItem("stofzuiger_bestType",                      result.bestType ?? "");
      localStorage.setItem("stofzuiger_filteredMatchedStofzuigers",    JSON.stringify(result.filteredMatchedStofzuigers));
      localStorage.setItem("stofzuiger_answers",                       JSON.stringify(answers));

      const wrapper = qs(".container-wrapper");
      if (wrapper) wrapper.classList.add("is-exiting");
      setTimeout(() => {
        window.location.href = "stofzuiger/resultaat";
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
    const checked = qs('input[name="stofzuigerType"]:checked');
    if (!checked) return alert("Kies een antwoord");
    quizState.type = checked.value;
    showQuestion("question-2");
  });

  // Q2 → Q1
  qs("#back-to-question-1")?.addEventListener("click", () => {
    resetQuestionInputs("question-2");
    showQuestion("question-1");
  });

  // Q2 → Q3
  qs("#to-question-3")?.addEventListener("click", () => {
    const checked = qs('input[name="vloertype"]:checked');
    if (!checked) return alert("Kies een antwoord");
    showQuestion("question-3");
  });

  // Q3 → Q2
  qs("#back-to-question-2")?.addEventListener("click", () => {
    resetQuestionInputs("question-3");
    showQuestion("question-2");
  });

  // Q3 → Q4 (zak of looptijd, afhankelijk van Q1)
  qs("#to-question-4")?.addEventListener("click", () => {
    const checked = qs('input[name="huisdieren"]:checked');
    if (!checked) return alert("Kies een antwoord");
    showQuestion(step4Id());
  });

  // Q4 → Q3
  qsa("#back-to-question-3").forEach(btn => {
    btn.addEventListener("click", () => {
      resetQuestionInputs(step4Id());
      showQuestion("question-3");
    });
  });

  // Q4 → Q5
  qsa("#to-question-5").forEach(btn => {
    btn.addEventListener("click", () => {
      const checked = qs(`#${step4Id()} input:checked`);
      if (!checked) return alert("Kies een antwoord");
      showQuestion("question-5");
    });
  });

  // Q5 → Q4
  qs("#back-to-question-4")?.addEventListener("click", () => {
    resetQuestionInputs("question-5");
    showQuestion(step4Id());
  });

  // Q5 → Result
  qs("#start-matching")?.addEventListener("click", handleStartMatching);

  window.addEventListener("resize", () => {
    if (mobileQuery.matches) return;
    const activeBlock = qs(".question-block.is-active");
    if (activeBlock) positionElements(activeBlock.id);
  }, { passive: true });

  updateStep4Visibility();
  showQuestion("question-1");
}
