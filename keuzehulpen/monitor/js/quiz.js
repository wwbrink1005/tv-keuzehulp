import { scoringSystem, sizeGroupToAllowedSizes } from "./data.js";
import { calculateScores, matchMonitors } from "./matching.js";
import { getContainerScale, normalizeProducts, qs, qsa } from "./utils.js";
import { fetchProducts } from "./supabase.js";

const quizState = {
  selectedSizeGroup: null
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

const TOTAL_QUESTIONS = 4;

// Dimensions (px in 1242.21-wide coordinate space) per size group
const monitorDimensions = {
  'compact':   { width: 180, height: 205 },  // 24 inch
  'standaard': { width: 215, height: 244 },  // 27 inch
  'groot':     { width: 250, height: 284 },  // 32 inch
  'ultrawide': { width: 320, height: 183 }   // ultrawide
};

function updateMonitorDisplay() {
  const checked = qs('input[name="schermgrootte"]:checked');
  const monitorDisplay = qs("#monitor-display");
  const container = qs(".background-container");
  const fadeDurationMs = 120;

  if (!checked || !monitorDisplay || !container) {
    if (monitorDisplay) {
      monitorDisplay.style.opacity = "0";
      window.setTimeout(() => { monitorDisplay.style.display = "none"; }, fadeDurationMs);
    }
    return;
  }

  const dims = monitorDimensions[checked.value];
  if (!dims) {
    monitorDisplay.style.opacity = "0";
    window.setTimeout(() => { monitorDisplay.style.display = "none"; }, fadeDurationMs);
    return;
  }

  const isUltrawide = checked.value === "ultrawide";
  const newImageType = isUltrawide ? "wide" : "normal";
  const prevImageType = monitorDisplay.dataset.imageType;

  const newImage = isUltrawide
    ? "url('keuzehulpen/monitor/images/wide.png')"
    : "url('keuzehulpen/monitor/images/draak.png')";

  const style = getComputedStyle(container);
  const originalWidth  = parseFloat(style.getPropertyValue("--base-width"))  || 1242.21;
  const originalHeight = parseFloat(style.getPropertyValue("--base-height")) || 630.138;
  const containerWidth = container.offsetWidth;
  const scaleFactor    = containerWidth / originalWidth;

  const rightOffset  = parseFloat(style.getPropertyValue("--monitor-right-offset"))  || 332;
  const bottomOffset = parseFloat(style.getPropertyValue("--monitor-bottom-offset")) || 100;

  const rightPct  = ((rightOffset - dims.width / 2) / originalWidth)  * 100;
  const bottomPct = (bottomOffset / originalHeight) * 100;

  const applyDims = () => {
    monitorDisplay.dataset.imageType = newImageType;
    monitorDisplay.style.backgroundImage = newImage;
    monitorDisplay.style.width  = `${dims.width  * scaleFactor}px`;
    monitorDisplay.style.height = `${dims.height * scaleFactor}px`;
    monitorDisplay.style.right  = `${rightPct}%`;
    monitorDisplay.style.bottom = `${bottomPct}%`;
    monitorDisplay.style.left   = "auto";
  };

  if (monitorDisplay.style.display !== "block") {
    // First appearance: apply immediately and fade in via CSS transition
    applyDims();
    monitorDisplay.style.display = "block";
    monitorDisplay.style.opacity = "0";
    requestAnimationFrame(() => { monitorDisplay.style.opacity = "1"; });
  } else if (prevImageType && prevImageType !== newImageType) {
    // Image switches (ultrawide ↔ regular): fade out → snap to new size+image → fade in
    // Override transition so fade-out is fast (150ms), matching the timeout below
    monitorDisplay.style.transition = "opacity .15s ease";
    monitorDisplay.style.opacity = "0";
    window.setTimeout(() => {
      applyDims();
      requestAnimationFrame(() => {
        // Restore CSS transitions so fade-in and future size transitions work normally
        monitorDisplay.style.transition = "";
        monitorDisplay.style.opacity = "1";
      });
    }, fadeDurationMs);
  } else {
    // Same image (compact/standaard/groot): CSS size+opacity transition, identical to laptop
    applyDims();
    monitorDisplay.style.opacity = "1";
  }
}

function hideMonitorDisplay() {
  const monitorDisplay = qs("#monitor-display");
  if (!monitorDisplay) return;
  monitorDisplay.style.opacity = "0";
  window.setTimeout(() => { monitorDisplay.style.display = "none"; }, 120);
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

  // Monitor display: hide on Q1, show on Q2+ if a size is selected
  if (num === 1) {
    hideMonitorDisplay();
  } else if (num >= 2 && quizState.selectedSizeGroup) {
    updateMonitorDisplay();
  }

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
    gebruik:      qsa('input[name="gebruik"]:checked').map(cb => cb.value),
    schermgrootte: qs('input[name="schermgrootte"]:checked')?.value ?? "",
    hz:           qs('input[name="hz"]:checked')?.value ?? "",
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

  const btn = qs("#start-matching");
  if (btn) { btn.disabled = true; btn.textContent = "Bezig…"; }

  prefetchProducts()
    .then(rawProducts => {
      const monitors = normalizeProducts(rawProducts ?? []);
      const result = matchMonitors(
        monitors,
        quizState.selectedSizeGroup,
        null,
        answers,
        scores
      );

      localStorage.setItem("monitor_bestMatch",               JSON.stringify(result.bestMatch));
      localStorage.setItem("monitor_bestType",                result.bestType ?? "");
      localStorage.setItem("monitor_scores",                  JSON.stringify(scores));
      localStorage.setItem("monitor_filteredMatchedMonitors", JSON.stringify(result.filteredMatchedMonitors));
      localStorage.setItem("monitor_answers",                 JSON.stringify(answers));
      localStorage.setItem("monitor_selectedSizeGroup",       quizState.selectedSizeGroup ?? "");

      const wrapper = qs(".container-wrapper");
      if (wrapper) wrapper.classList.add("is-exiting");
      setTimeout(() => {
        window.location.href = "keuzehulpen/monitor/resultaat";
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
    const checked = qsa('input[name="gebruik"]:checked');
    if (checked.length === 0) return alert("Kies minimaal 1 antwoord");
    showQuestion(2);
  });

  // Q2 → Q1
  qs("#back-to-question-1")?.addEventListener("click", () => {
    resetQuestionsFrom(2);
    showQuestion(1);
  });

  // Q2 → Q3
  qs("#to-question-3")?.addEventListener("click", () => {
    const checked = qs('input[name="schermgrootte"]:checked');
    if (!checked) return alert("Kies een schermgrootte");

    quizState.selectedSizeGroup = checked.value;

    showQuestion(3);
  });

  // Q3 → Q2
  qs("#back-to-question-2")?.addEventListener("click", () => {
    resetQuestionsFrom(3);
    showQuestion(2);
  });

  // Q3 → Q4
  qs("#to-question-4")?.addEventListener("click", () => {
    const checked = qs('input[name="hz"]:checked');
    if (!checked) return alert("Kies een antwoord");
    showQuestion(4);
  });

  // Q4 → Q3
  qs("#back-to-question-3")?.addEventListener("click", () => {
    resetQuestionsFrom(4);
    showQuestion(3);
  });

  setupGebruikLimit();
  setupExtraLimit();

  // Q4 → Result
  qs("#start-matching")?.addEventListener("click", handleStartMatching);

  // Listen for schermgrootte (Q2) changes → update monitor visualisation
  qsa('input[name="schermgrootte"]').forEach(radio => {
    radio.addEventListener("change", updateMonitorDisplay);
  });

  // Re-render monitor display on resize
  window.addEventListener("resize", () => {
    const monitorDisplay = qs("#monitor-display");
    if (monitorDisplay && monitorDisplay.style.display === "block") {
      updateMonitorDisplay();
    }
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
