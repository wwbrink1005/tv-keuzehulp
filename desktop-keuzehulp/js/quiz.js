import { behuizingTypeToAllowed, priceGroupsByType } from "./data.js";
import { calculateScores, matchDesktops } from "./matching.js";
import { computeDynamicPriceGroups, getContainerScale, normalizeProducts, qs, qsa } from "./utils.js";
import { fetchProducts } from "./supabase.js";

const quizState = {
  selectedBehuizingType: null,
  selectedPriceGroup:    null,
  priceGroups:           []
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

function setQuestionExpanded(question, expanded) {
  if (!question) return;
  question.classList.toggle("is-expanded", expanded);
  const toggle = question.querySelector(".answers-toggle");
  if (toggle) toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
}

function showQuestion(num) {
  for (let i = 1; i <= 6; i++) {
    const q = qs(`#question-${i}`);
    if (q) { q.classList.remove("is-active"); q.style.display = "none"; }
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
      setQuestionExpanded(currentQuestion, false);
      positionElements(num);
      updateProgressBar(num);

      const hintBtn = qs("#question-hint-btn");
      if (hintBtn) { hintBtn.style.display = ""; hintBtn.textContent = "Waarom deze vraag?"; }
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
  } else if (typeof questionNum === "number" && questionNum >= 1 && questionNum <= 6) {
    progressBar.style.width = `${(questionNum / 6) * 100}%`;
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
  for (let i = questionNumber; i <= 6; i++) {
    qsa(`#question-${i} input`).forEach(input => { input.checked = false; });
  }
}

function buildAnswers() {
  return {
    gebruik:      qsa('input[name="gebruik"]:checked').map(cb => cb.value),
    behuizing:    qs('input[name="behuizing"]:checked')?.value   ?? "",
    intensiteit:  qs('input[name="intensiteit"]:checked')?.value ?? "",
    opslag:       qs('input[name="opslag"]:checked')?.value      ?? "",
    extraAnswers: qsa('input[name="extra"]:checked').map(cb => cb.value)
  };
}

function setupGebruikLimit() {
  const checkboxes = qsa('input[name="gebruik"]');
  checkboxes.forEach(cb => {
    cb.addEventListener("change", function () {
      const checked = qsa('input[name="gebruik"]:checked');
      if (checked.length > 2) this.checked = false;
    });
  });
}

function setupExtraLimit() {
  const geenCheckbox = qs('input[name="extra"][value="geen"]');
  const otherExtra   = qsa('input[name="extra"]:not([value="geen"])');
  if (!geenCheckbox || otherExtra.length === 0) return;

  geenCheckbox.addEventListener("change", function () {
    if (this.checked) otherExtra.forEach(cb => { cb.checked = false; });
  });
  otherExtra.forEach(checkbox => {
    checkbox.addEventListener("change", function () {
      if (this.checked) geenCheckbox.checked = false;
    });
  });
}

function handleStartMatching() {
  const extraChecked = qsa('input[name="extra"]:checked');
  if (extraChecked.length === 0) return alert("Kies minimaal 1 antwoord");

  const answers = buildAnswers();
  const scores  = calculateScores(answers);

  prefetchProducts()
    .then(rawProducts => {
      const desktops = normalizeProducts(rawProducts ?? []);
      const result = matchDesktops(
        desktops,
        quizState.selectedBehuizingType,
        quizState.selectedPriceGroup,
        answers,
        scores
      );

      localStorage.setItem("desktop_bestMatch",               JSON.stringify(result.bestMatch));
      localStorage.setItem("desktop_bestType",                result.bestType ?? "");
      localStorage.setItem("desktop_scores",                  JSON.stringify(scores));
      localStorage.setItem("desktop_filteredMatchedDesktops", JSON.stringify(result.filteredMatchedDesktops));
      localStorage.setItem("desktop_answers",                 JSON.stringify(answers));
      localStorage.setItem("desktop_selectedBehuizingType",   quizState.selectedBehuizingType ?? "");
      localStorage.setItem("desktop_selectedPriceGroupLabel", quizState.selectedPriceGroup?.label ?? "");
      localStorage.setItem("desktop_dynamicPriceGroups",      JSON.stringify(quizState.priceGroups));

      const wrapper = qs(".container-wrapper");
      if (wrapper) wrapper.classList.add("is-exiting");
      setTimeout(() => {
        window.location.href = "desktop-keuzehulp/resultaat";
      }, 180);
    });
}

export function initQuizPage() {
  if (!qs("#question-1")) return;

  // Pre-fetch products in background
  prefetchProducts();

  // Q1 → Q2
  qs("#to-question-2")?.addEventListener("click", () => {
    const checked = qsa('input[name="gebruik"]:checked');
    if (checked.length === 0) return alert("Kies minimaal 1 antwoord");
    showQuestion(2);
  });

  // Q2 → Q1
  qs("#back-to-question-1")?.addEventListener("click", () => {
    resetQuestionsFrom(2);
    showQuestion(1);
  });

  // Q2 → Q3 (fetch dynamic price groups based on behuizing)
  qs("#to-question-3")?.addEventListener("click", async () => {
    const checked = qs('input[name="behuizing"]:checked');
    if (!checked) return alert("Kies een behuizing");

    quizState.selectedBehuizingType = checked.value;

    const btn = qs("#to-question-3");
    if (btn) btn.disabled = true;
    try {
      const rawProducts = await prefetchProducts();
      const desktops = normalizeProducts(rawProducts ?? []);
      const dynamic = computeDynamicPriceGroups(desktops, quizState.selectedBehuizingType, behuizingTypeToAllowed);
      quizState.priceGroups = dynamic.length > 0 ? dynamic : (priceGroupsByType[quizState.selectedBehuizingType] ?? []);
    } catch {
      quizState.priceGroups = priceGroupsByType[quizState.selectedBehuizingType] ?? [];
    } finally {
      if (btn) btn.disabled = false;
    }

    renderPriceOptions(quizState.priceGroups);
    showQuestion(3);
  });

  // Q3 → Q2
  qs("#back-to-question-2")?.addEventListener("click", () => showQuestion(2));

  // Q3 → Q4
  qs("#to-question-4")?.addEventListener("click", () => {
    const checked = qs('input[name="priceGroup"]:checked');
    if (!checked) return alert("Kies een budget");
    quizState.selectedPriceGroup = checked.value === "geen-voorkeur"
      ? null
      : quizState.priceGroups.find(p => p.label === checked.value);
    showQuestion(4);
  });

  // Q4 → Q3
  qs("#back-to-question-3")?.addEventListener("click", () => {
    resetQuestionsFrom(4);
    showQuestion(3);
  });

  // Q4 → Q5
  qs("#to-question-5")?.addEventListener("click", () => {
    const checked = qs('input[name="intensiteit"]:checked');
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
    const checked = qs('input[name="opslag"]:checked');
    if (!checked) return alert("Kies een antwoord");
    showQuestion(6);
  });

  // Q6 → Q5
  qs("#back-to-question-5")?.addEventListener("click", () => {
    resetQuestionsFrom(6);
    showQuestion(5);
  });

  setupGebruikLimit();
  setupExtraLimit();

  // Q6 → Result
  qs("#start-matching")?.addEventListener("click", handleStartMatching);

  // Re-position on resize (desktop only)
  window.addEventListener("resize", () => {
    if (mobileQuery.matches) return;
    for (let i = 1; i <= 6; i++) {
      const q = qs(`#question-${i}`);
      if (q && q.classList.contains("is-active")) {
        positionElements(i);
        break;
      }
    }
  }, { passive: true });

  window.addEventListener("load", () => {
    if (qs("#question-1")) showQuestion(1);
  });
}
