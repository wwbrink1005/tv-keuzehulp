import { distanceToSizeGroup, priceGroupsBySize, tvDimensions } from "./data.js";
import { calculateScores, matchTVs } from "./matching.js";
import { getContainerScale, qs, qsa } from "./utils.js";

const quizState = {
  selectedDistance: null,
  selectedSizeGroup: null,
  selectedPriceGroup: null
};

const sizeGroups = ["24", "27-32", "40-43", "48-50", "55", "58-65", "70-77", "83-86", "97-115"];

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

function ensureMobileToggle(question) {
  const answers = question?.querySelector(".answers-container");
  const firstOption = answers?.querySelector(".answer-option");
  if (!firstOption || firstOption.querySelector(".answers-toggle")) return;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "answers-toggle";
  toggle.setAttribute("aria-expanded", "false");
  toggle.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  `;

  toggle.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const expanded = !question.classList.contains("is-expanded");
    setQuestionExpanded(question, expanded);
    if (expanded) {
      requestAnimationFrame(() => scrollMobileAnswersIntoView(question));
    }
  });

  firstOption.appendChild(toggle);
}

function initMobileAccordion() {
  qsa(".question-block").forEach(question => {
    ensureMobileToggle(question);
    setQuestionExpanded(question, false);
  });
}

function positionElements(questionNum) {
  const question = qs(`#question-${questionNum} .question-container`);
  const answers = qs(`#question-${questionNum} .answers-container`);
  const buttons = qs(`#question-${questionNum} .button-container`);

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
  for (let i = questionNumber; i <= 8; i++) {
    const inputs = qsa(`#question-${i} input`);
    inputs.forEach(input => {
      input.checked = false;
    });
  }
}

function updateProgressBar(questionNum) {
  const progressBar = qs("#progress-bar");
  if (!progressBar) return;

  const scale = getContainerScale(progressBar);
  const totalWidth = 294 * scale;
  const unitWidth = totalWidth / 8;

  if (questionNum === "result") {
    progressBar.style.width = `${totalWidth}px`;
  } else if (typeof questionNum === "number" && questionNum >= 1 && questionNum <= 8) {
    progressBar.style.width = `${questionNum * unitWidth}px`;
  }
}

function updateTVDisplay() {
  const checked = qs('input[name="sizeGroup"]:checked');
  const tvDisplay = qs("#tv-display");
  const container = qs(".background-container");
  const fadeDurationMs = 120;

  if (!checked || !tvDisplay || !container) {
    if (tvDisplay) {
      tvDisplay.style.opacity = "0";
      window.setTimeout(() => {
        tvDisplay.style.display = "none";
      }, fadeDurationMs);
    }
    return;
  }

  const sizeGroup = checked.value;
  const dims = tvDimensions[sizeGroup];

  if (!dims) {
    tvDisplay.style.opacity = "0";
    window.setTimeout(() => {
      tvDisplay.style.display = "none";
    }, fadeDurationMs);
    return;
  }

  const containerWidth = container.offsetWidth;
  const style = getComputedStyle(container);
  const originalWidth = parseFloat(style.getPropertyValue("--base-width")) || 1242.21;
  const containerHeight = parseFloat(style.getPropertyValue("--base-height")) || 630.138;
  const scaleFactor = containerWidth / originalWidth;

  const scaledWidth = dims.width * scaleFactor;
  const scaledHeight = dims.height * scaleFactor;

  tvDisplay.style.width = `${scaledWidth}px`;
  tvDisplay.style.height = `${scaledHeight}px`;

  const referenceBorder = 3;
  const referenceWidth = 402.8;
  const dynamicBorder = (dims.width / referenceWidth) * referenceBorder * scaleFactor;
  tvDisplay.style.borderWidth = `${dynamicBorder}px`;

  const rightOffset = parseFloat(style.getPropertyValue("--tv-right-offset")) || 490;
  const bottomOffset = parseFloat(style.getPropertyValue("--tv-bottom-offset")) || 224;

  const rightValue = rightOffset - (dims.width / 2);
  const rightPercentage = (rightValue / originalWidth) * 100;
  const bottomPercentage = (bottomOffset / containerHeight) * 100;

  tvDisplay.style.right = `${rightPercentage}%`;
  tvDisplay.style.bottom = `${bottomPercentage}%`;
  tvDisplay.style.left = "auto";
  if (tvDisplay.style.display !== "block") {
    tvDisplay.style.display = "block";
    tvDisplay.style.opacity = "0";
    requestAnimationFrame(() => {
      tvDisplay.style.opacity = "1";
    });
  } else {
    tvDisplay.style.opacity = "1";
  }
}

function showQuestion(num) {
  for (let i = 1; i <= 8; i++) {
    const q = qs(`#question-${i}`);
    if (q) {
      q.classList.remove("is-active");
      q.style.display = "none";
    }
  }

  const resultEl = qs("#result");
  if (resultEl) resultEl.classList.remove("is-active");

  const tvDisplay = qs("#tv-display");
  if (num === 1 && tvDisplay) {
    tvDisplay.style.display = "none";
  } else if (num >= 2 && num <= 8 && quizState.selectedSizeGroup) {
    updateTVDisplay();
  }

  if (num === "result") {
    const progressBar = qs("#progress-bar");
    if (progressBar) progressBar.style.display = "none";
    const topBar = qs(".top-bar");
    if (topBar) topBar.style.display = "none";

    const bgContainer = qs(".background-container");
    if (bgContainer) {
      bgContainer.style.backgroundImage = 'url("ja vervaagd.png")';
    }
    if (resultEl) {
      resultEl.style.display = "block";
      resultEl.classList.add("is-active");
    }
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
    });
  });
}

function renderSizeOptions(advisedSize) {
  const container = qs("#size-options");
  if (!container) return;
  container.innerHTML = "";

  sizeGroups.forEach(group => {
    const label = document.createElement("label");
    label.className = "answer-option";
    label.innerHTML = `
      <input type="radio" name="sizeGroup" value="${group}" ${group === advisedSize ? "checked" : ""}>
      <span>${group} inch</span>
    `;
    container.appendChild(label);
  });

  const buttonCount = sizeGroups.length;
  const scale = getContainerScale(container);
  const baseTop = 70.11 + 37.77 + (buttonCount * 51.3935) + ((buttonCount - 1) * 8) + 22;
  const q2Buttons = qs("#q2-buttons");
  if (q2Buttons) q2Buttons.style.top = `${baseTop * scale}px`;

  qsa('input[name="sizeGroup"]').forEach(radio => {
    radio.addEventListener("change", updateTVDisplay);
  });

  updateTVDisplay();
  ensureMobileToggle(qs("#question-2"));
}

function renderPriceOptions() {
  const container = qs("#price-options");
  if (!container) return;
  container.innerHTML = "";

  const priceGroups = priceGroupsBySize[quizState.selectedSizeGroup];

  priceGroups.forEach(group => {
    const label = document.createElement("label");
    label.className = "answer-option";
    label.innerHTML = `
      <input type="radio" name="priceGroup" value="${group.label}">
      <span>€ ${group.label}</span>
    `;
    container.appendChild(label);
  });

  ensureMobileToggle(qs("#question-3"));
}

function setupUsageLimit() {
  qsa('input[name="usage"]').forEach(checkbox => {
    checkbox.addEventListener("change", function() {
      const checked = qsa('input[name="usage"]:checked');
      if (checked.length > 2) {
        this.checked = false;
        alert("Je kunt maximaal 2 antwoorden selecteren");
      }
    });
  });
}

function setupExtraLimit() {
  const niksCheckbox = qs('input[name="extra"][value="niks"]');
  const otherExtraCheckboxes = qsa('input[name="extra"]:not([value="niks"])');

  if (!niksCheckbox || otherExtraCheckboxes.length === 0) return;

  niksCheckbox.addEventListener("change", function() {
    if (this.checked) {
      otherExtraCheckboxes.forEach(cb => {
        cb.checked = false;
      });
    }
  });

  otherExtraCheckboxes.forEach(checkbox => {
    checkbox.addEventListener("change", function() {
      if (this.checked) {
        niksCheckbox.checked = false;
      }
      const checked = qsa('input[name="extra"]:checked');
      if (checked.length > 2) {
        this.checked = false;
        alert("Je kunt maximaal 2 antwoorden selecteren");
      }
    });
  });
}

function buildAnswers() {
  return {
    usageAnswers: qsa('input[name="usage"]:checked').map(cb => cb.value),
    quality: qs('input[name="quality"]:checked')?.value ?? "",
    timing: qs('input[name="timing"]:checked')?.value ?? "",
    viewing: qs('input[name="viewing"]:checked')?.value ?? "",
    extraAnswers: qsa('input[name="extra"]:checked').map(cb => cb.value)
  };
}

function handleStartMatching() {
  const extraChecked = qsa('input[name="extra"]:checked');
  if (extraChecked.length === 0) return alert("Kies minimaal 1 antwoord");

  const answers = buildAnswers();
  const scores = calculateScores(answers);

  fetch("tvs.json")
    .then(res => res.json())
    .then(tvs => {
      const result = matchTVs(tvs, quizState.selectedSizeGroup, quizState.selectedPriceGroup, answers, scores);

      localStorage.setItem("bestMatch", JSON.stringify(result.bestMatch));
      localStorage.setItem("bestType", result.bestType ?? "");
      localStorage.setItem("scores", JSON.stringify(scores));
      localStorage.setItem("filteredMatchedTVs", JSON.stringify(result.filteredMatchedTVs));
      localStorage.setItem("answers", JSON.stringify(answers));
      localStorage.setItem("selectedSizeGroup", quizState.selectedSizeGroup ?? "");
      localStorage.setItem("selectedPriceGroupLabel", quizState.selectedPriceGroup?.label ?? "");

      const wrapper = qs(".container-wrapper");
      if (wrapper) wrapper.classList.add("is-exiting");
      setTimeout(() => {
        window.location.href = "resultaat2.html";
      }, 180);
    });
}

export function initQuizPage() {
  if (!qs("#question-1")) return;

  initMobileAccordion();

  qs("#to-question-2")?.addEventListener("click", () => {
    const checked = qs('input[name="distance"]:checked');
    if (!checked) return alert("Kies een kijkafstand");

    quizState.selectedDistance = checked.value;
    const advisedSize = distanceToSizeGroup[quizState.selectedDistance];

    let displayedSize = advisedSize;
    if (advisedSize === "48-50") {
      displayedSize = "48-55";
    }

    const adviceEl = qs("#advies-tekst");
    if (adviceEl) {
      adviceEl.innerText = `Wij adviseren een tv van ${displayedSize} inch. Pas eventueel aan.`;
    }

    renderSizeOptions(advisedSize);
    showQuestion(2);
  });

  qs("#back-to-question-1")?.addEventListener("click", () => {
    quizState.selectedDistance = null;
    quizState.selectedSizeGroup = null;
    quizState.selectedPriceGroup = null;

    for (let i = 1; i <= 8; i++) {
      const inputs = qsa(`#question-${i} input`);
      inputs.forEach(input => {
        input.checked = false;
      });
    }

    const bgContainer = qs(".background-container");
    if (bgContainer) {
      bgContainer.style.backgroundImage = 'url("ja.png")';
    }

    showQuestion(1);
  });

  qs("#to-question-3")?.addEventListener("click", () => {
    const checked = qs('input[name="sizeGroup"]:checked');
    if (!checked) return alert("Kies een grootte");

    quizState.selectedSizeGroup = checked.value;
    renderPriceOptions();
    showQuestion(3);
  });

  qs("#back-to-question-2")?.addEventListener("click", () => {
    showQuestion(2);
  });

  qs("#to-question-4")?.addEventListener("click", () => {
    const checked = qs('input[name="priceGroup"]:checked');
    if (!checked) return alert("Kies een budget");

    quizState.selectedPriceGroup = priceGroupsBySize[quizState.selectedSizeGroup]
      .find(p => p.label === checked.value);

    showQuestion(4);
  });

  setupUsageLimit();

  qs("#back-to-question-3")?.addEventListener("click", () => {
    resetQuestionsFrom(4);
    showQuestion(3);
  });

  qs("#to-question-5")?.addEventListener("click", () => {
    const checked = qsa('input[name="usage"]:checked');
    if (checked.length === 0) return alert("Kies minimaal 1 antwoord");
    showQuestion(5);
  });

  qs("#back-to-question-4")?.addEventListener("click", () => {
    resetQuestionsFrom(5);
    showQuestion(4);
  });

  qs("#to-question-6")?.addEventListener("click", () => {
    const checked = qs('input[name="quality"]:checked');
    if (!checked) return alert("Kies een antwoord");
    showQuestion(6);
  });

  qs("#back-to-question-5")?.addEventListener("click", () => {
    resetQuestionsFrom(6);
    showQuestion(5);
  });

  qs("#to-question-7")?.addEventListener("click", () => {
    const checked = qs('input[name="timing"]:checked');
    if (!checked) return alert("Kies een antwoord");
    showQuestion(7);
  });

  qs("#back-to-question-6")?.addEventListener("click", () => {
    resetQuestionsFrom(7);
    showQuestion(6);
  });

  qs("#to-question-8")?.addEventListener("click", () => {
    const checked = qs('input[name="viewing"]:checked');
    if (!checked) return alert("Kies een antwoord");
    showQuestion(8);
  });

  setupExtraLimit();

  qs("#back-to-question-7")?.addEventListener("click", () => {
    resetQuestionsFrom(8);
    showQuestion(7);
  });

  qs("#start-matching")?.addEventListener("click", handleStartMatching);

  window.addEventListener("load", () => {
    if (qs("#question-1")) {
      showQuestion(1);
    }
  });
}
