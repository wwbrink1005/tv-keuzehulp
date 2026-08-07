import { calculateScores, matchLaptops } from "./matching.js";
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

// Dimensions (px in 1242.21-wide coordinate space) per size group.
// Geschaald t.o.v. de stoelrug op het bureau (~44cm breed, betrouwbaardere
// referentie dan de decoratieve pennenbeker) in de achtergrondfoto.
const laptopDimensions = {
  'licht-compact':  { width: 188, height: 174 },  // 13–14 inch
  'middenweg':      { width: 219, height: 203 },  // 15–16 inch
  'groot-krachtig': { width: 250, height: 231 }   // 17 inch+
};

function updateLaptopDisplay() {
  const checked = qs('input[name="formaat"]:checked');
  const laptopDisplay = qs("#laptop-display");
  const container = qs(".background-container");
  const fadeDurationMs = 120;

  if (!checked || !laptopDisplay || !container) {
    if (laptopDisplay) {
      laptopDisplay.style.opacity = "0";
      window.setTimeout(() => { laptopDisplay.style.display = "none"; }, fadeDurationMs);
    }
    return;
  }

  const dims = laptopDimensions[checked.value];
  if (!dims) {
    laptopDisplay.style.opacity = "0";
    window.setTimeout(() => { laptopDisplay.style.display = "none"; }, fadeDurationMs);
    return;
  }

  const style = getComputedStyle(container);
  const originalWidth  = parseFloat(style.getPropertyValue("--base-width"))  || 1242.21;
  const originalHeight = parseFloat(style.getPropertyValue("--base-height")) || 630.138;
  const containerWidth = container.offsetWidth;
  const scaleFactor    = containerWidth / originalWidth;

  laptopDisplay.style.width  = `${dims.width  * scaleFactor}px`;
  laptopDisplay.style.height = `${dims.height * scaleFactor}px`;

  const rightOffset  = parseFloat(style.getPropertyValue("--laptop-right-offset"))  || 370;
  const bottomOffset = parseFloat(style.getPropertyValue("--laptop-bottom-offset")) || 55;

  // rightOffset = distance from right edge to the horizontal CENTRE of the laptop
  const rightPct  = ((rightOffset - dims.width / 2) / originalWidth)  * 100;
  const bottomPct = (bottomOffset / originalHeight) * 100;

  laptopDisplay.style.right  = `${rightPct}%`;
  laptopDisplay.style.bottom = `${bottomPct}%`;
  laptopDisplay.style.left   = "auto";

  if (laptopDisplay.style.display !== "block") {
    laptopDisplay.style.display = "block";
    laptopDisplay.style.opacity = "0";
    requestAnimationFrame(() => { laptopDisplay.style.opacity = "1"; });
  } else {
    laptopDisplay.style.opacity = "1";
  }
}

function hideLaptopDisplay() {
  const laptopDisplay = qs("#laptop-display");
  if (!laptopDisplay) return;
  laptopDisplay.style.opacity = "0";
  window.setTimeout(() => { laptopDisplay.style.display = "none"; }, 120);
}

function showQuestion(num) {
  for (let i = 1; i <= 5; i++) {
    const q = qs(`#question-${i}`);
    if (q) {
      q.classList.remove("is-active");
      q.style.display = "none";
    }
  }

  const totalQuestions = 5;

  if (num === "result") {
    hideLaptopDisplay();
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

  // Laptop display: formaat is nu Q1, dus de visualisatie kan vanaf de
  // eerste vraag al leven — updateLaptopDisplay() verbergt zichzelf gracieus
  // als er nog geen formaat gekozen is.
  updateLaptopDisplay();

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
  } else if (typeof questionNum === "number" && questionNum >= 1 && questionNum <= 5) {
    progressBar.style.width = `${(questionNum / 5) * 100}%`;
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

function resetQuestionsFrom(questionNumber) {
  for (let i = questionNumber; i <= 5; i++) {
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
  const allroundBox  = qs('input[name="gebruik"][value="allround"]');
  const otherGebruik = qsa('input[name="gebruik"]:not([value="allround"])');

  // De max-2-limiet geldt alleen voor de specifieke doelen, niet voor
  // "allround" zelf — anders wint deze generieke check het van de
  // exclusiviteits-logica hieronder als er al 2 andere zijn aangevinkt.
  otherGebruik.forEach(cb => {
    cb.addEventListener("change", function () {
      const checked = qsa('input[name="gebruik"]:not([value="allround"]):checked');
      if (checked.length > 2) {
        this.checked = false;
        alert("Je kunt maximaal 2 antwoorden selecteren");
      }
    });
  });

  // "Een beetje van alles" is een gebalanceerde score op zichzelf — sluit
  // elkaar uit met de specifieke doelen, net als "geen" bij de extra's.
  if (allroundBox && otherGebruik.length > 0) {
    allroundBox.addEventListener("change", function () {
      if (this.checked) otherGebruik.forEach(cb => { cb.checked = false; });
    });
    otherGebruik.forEach(checkbox => {
      checkbox.addEventListener("change", function () {
        if (this.checked) allroundBox.checked = false;
      });
    });
  }
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
      // No price filter here anymore: the quiz no longer asks for a budget.
      // matchLaptops is called without a priceGroup so it returns the full
      // set of laptops matching size/tier/opslag/extra; price is only ever
      // applied as an optional narrowing filter on the results page.
      const result = matchLaptops(
        laptops,
        quizState.selectedSizeGroup,
        null,
        answers,
        scores
      );

      localStorage.setItem("laptop_bestMatch",               JSON.stringify(result.bestMatch));
      localStorage.setItem("laptop_bestType",                result.bestType ?? "");
      localStorage.setItem("laptop_scores",                  JSON.stringify(scores));
      localStorage.setItem("laptop_filteredMatchedLaptops",  JSON.stringify(result.filteredMatchedLaptops));
      localStorage.setItem("laptop_answers",                 JSON.stringify(answers));
      localStorage.setItem("laptop_selectedSizeGroup",       quizState.selectedSizeGroup ?? "");

      const wrapper = qs(".container-wrapper");
      if (wrapper) wrapper.classList.add("is-exiting");
      setTimeout(() => {
        window.location.href = "keuzehulpen/laptop/resultaat";
      }, 180);
    });
}

export function initQuizPage() {
  if (!qs("#question-1")) return;

  // Pre-fetch products in the background
  prefetchProducts();

  // Q1 → Q2 (formaat)
  qs("#to-question-2")?.addEventListener("click", () => {
    const checked = qs('input[name="formaat"]:checked');
    if (!checked) return alert("Kies een formaat");

    quizState.selectedSizeGroup = checked.value;
    showQuestion(2);
  });

  // Q2 → Q1
  qs("#back-to-question-1")?.addEventListener("click", () => {
    resetQuestionsFrom(2);
    showQuestion(1);
  });

  // Q2 → Q3 (gebruik is multi-select, require at least 1)
  qs("#to-question-3")?.addEventListener("click", () => {
    const checked = qsa('input[name="gebruik"]:checked');
    if (checked.length === 0) return alert("Kies minimaal 1 antwoord");
    showQuestion(3);
  });

  // Q3 → Q2
  qs("#back-to-question-2")?.addEventListener("click", () => {
    resetQuestionsFrom(3);
    showQuestion(2);
  });

  // Q3 → Q4
  qs("#to-question-4")?.addEventListener("click", () => {
    const checked = qs('input[name="intensiteit"]:checked');
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
    const checked = qs('input[name="opslag"]:checked');
    if (!checked) return alert("Kies een antwoord");
    showQuestion(5);
  });

  // Q5 → Q4
  qs("#back-to-question-4")?.addEventListener("click", () => {
    resetQuestionsFrom(5);
    showQuestion(4);
  });

  // Listen for formaat (Q1) changes → update laptop visualisation
  qsa('input[name="formaat"]').forEach(radio => {
    radio.addEventListener("change", updateLaptopDisplay);
  });

  setupGebruikLimit();
  setupExtraLimit();

  // Q5 → Result
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
    // Re-render laptop display on every resize
    const laptopDisplay = qs("#laptop-display");
    if (laptopDisplay && laptopDisplay.style.display === "block") {
      updateLaptopDisplay();
    }
    if (mobileQuery.matches) return;
    for (let i = 1; i <= 5; i++) {
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
