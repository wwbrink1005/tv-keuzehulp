import { priceGroupsBySize, sizeGroupToAllowedSizes } from "./data.js";
import { calculateScores, matchLaptops } from "./matching.js";
import { computeDynamicPriceGroups, getContainerScale, normalizeProducts, qs, qsa } from "./utils.js";
import { fetchProducts } from "./supabase.js";

const quizState = {
  selectedSizeGroup:  null,
  selectedPriceGroup: null,
  priceGroups:        []
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

function showQuestion(num) {
  for (let i = 1; i <= 6; i++) {
    const q = qs(`#question-${i}`);
    if (q) {
      q.classList.remove("is-active");
      q.style.display = "none";
    }
  }

  const totalQuestions = 6;

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

function renderSizeOptions() {
  // Size options are static in the HTML for laptop (Q2)
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
}

function resetQuestionsFrom(questionNumber) {
  for (let i = questionNumber; i <= 6; i++) {
    const inputs = qsa(`#question-${i} input`);
    inputs.forEach(input => { input.checked = false; });
  }
}

function buildAnswers() {
  return {
    gebruik:      qsa('input[name="gebruik"]:checked').map(cb => cb.value),
    intensiteit:  qs('input[name="intensiteit"]:checked')?.value ?? "",
    formaat:      qs('input[name="formaat"]:checked')?.value     ?? "",
    opslag:       qs('input[name="opslag"]:checked')?.value      ?? "",
    extraAnswers: qsa('input[name="extra"]:checked').map(cb => cb.value)
  };
}

function setupGebruikLimit() {
  const checkboxes = qsa('input[name="gebruik"]');
  checkboxes.forEach(cb => {
    cb.addEventListener("change", function () {
      const checked = qsa('input[name="gebruik"]:checked');
      if (checked.length > 2) {
        this.checked = false;
      }
    });
  });
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

  prefetchProducts()
    .then(rawProducts => {
      const laptops = normalizeProducts(rawProducts ?? []);
      const result = matchLaptops(
        laptops,
        quizState.selectedSizeGroup,
        quizState.selectedPriceGroup,
        answers,
        scores
      );

      localStorage.setItem("laptop_bestMatch",               JSON.stringify(result.bestMatch));
      localStorage.setItem("laptop_bestType",                result.bestType ?? "");
      localStorage.setItem("laptop_scores",                  JSON.stringify(scores));
      localStorage.setItem("laptop_filteredMatchedLaptops",  JSON.stringify(result.filteredMatchedLaptops));
      localStorage.setItem("laptop_answers",                 JSON.stringify(answers));
      localStorage.setItem("laptop_selectedSizeGroup",       quizState.selectedSizeGroup ?? "");
      localStorage.setItem("laptop_selectedPriceGroupLabel", quizState.selectedPriceGroup?.label ?? "");
      localStorage.setItem("laptop_dynamicPriceGroups",      JSON.stringify(quizState.priceGroups));

      const wrapper = qs(".container-wrapper");
      if (wrapper) wrapper.classList.add("is-exiting");
      setTimeout(() => {
        window.location.href = "laptop-keuzehulp/resultaat";
      }, 180);
    });
}

export function initQuizPage() {
  if (!qs("#question-1")) return;

  // Pre-fetch products in the background
  prefetchProducts();

  // Q1 → Q2 (gebruik is multi-select, require at least 1)
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

  // Q2 → Q3 (fetch dynamic price groups based on selected formaat)
  qs("#to-question-3")?.addEventListener("click", async () => {
    const checked = qs('input[name="formaat"]:checked');
    if (!checked) return alert("Kies een formaat");

    quizState.selectedSizeGroup = checked.value;

    const btn = qs("#to-question-3");
    if (btn) btn.disabled = true;
    try {
      const rawProducts = await prefetchProducts();
      const laptops = normalizeProducts(rawProducts ?? []);
      const dynamic = computeDynamicPriceGroups(laptops, quizState.selectedSizeGroup, sizeGroupToAllowedSizes);
      quizState.priceGroups = dynamic.length > 0 ? dynamic : (priceGroupsBySize[quizState.selectedSizeGroup] ?? []);
    } catch {
      quizState.priceGroups = priceGroupsBySize[quizState.selectedSizeGroup] ?? [];
    } finally {
      if (btn) btn.disabled = false;
    }

    renderPriceOptions(quizState.priceGroups);
    showQuestion(3);
  });

  // Q3 → Q2
  qs("#back-to-question-2")?.addEventListener("click", () => {
    showQuestion(2);
  });

  // Q3 → Q4
  qs("#to-question-4")?.addEventListener("click", () => {
    const checked = qs('input[name="priceGroup"]:checked');
    if (!checked) return alert("Kies een budget");
    quizState.selectedPriceGroup = quizState.priceGroups.find(p => p.label === checked.value);
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

  // Toggle panels
  const explanationTab = qs("#explanation-tab");
  const explanationDrawer = qs("#explanation-drawer");
  if (explanationTab && explanationDrawer) {
    explanationTab.addEventListener("click", () => {
      const isOpen = explanationDrawer.classList.toggle("is-open");
      explanationTab.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
    document.addEventListener("click", (e) => {
      if (explanationDrawer.classList.contains("is-open") &&
          !explanationDrawer.contains(e.target)) {
        explanationDrawer.classList.remove("is-open");
        explanationTab.setAttribute("aria-expanded", "false");
      }
    });
  }

  // Re-position elements on window resize (desktop only)
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
    if (qs("#question-1")) {
      showQuestion(1);
    }
  });
}
