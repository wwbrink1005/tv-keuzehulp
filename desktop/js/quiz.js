import { calculateScores, matchDesktops } from "./matching.js";
import { getContainerScale, normalizeProducts, qs, qsa } from "./utils.js";
import { fetchProducts } from "./supabase.js";

const quizState = {
  selectedBehuizingType: null
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

// ─── PC Type Visualisation ──────────────────────────────────────────────────────
// Dimensions (px in 1242.21-wide coordinate space) per behuizing type.
// rightOffset = distance from right edge to the CENTER of the image.
// bottomOffset = distance from bottom edge to the BOTTOM of the image.
const pcTypeDimensions = {
  'tower':      { width: 202,    height: 275.5, rightOffset: 580, bottomOffset: 53 },
  'mini-pc':    { width: 238, height: 105, rightOffset: 622, bottomOffset: 52 },
  'all-in-one': { width: 285, height: 300, rightOffset: 330, bottomOffset: 118 }
  // 'maakt-niet-uit' intentionally absent → no visualisation
};

const pcTypeImages = {
  'tower':      "url('desktop/images/tower.png')",
  'mini-pc':    "url('desktop/images/desktop mini visualisatie.png')",
  'all-in-one': "url('desktop/images/all in one visualisatie.png')"
};

function updatePcTypeDisplay() {
  const checked   = qs('input[name="behuizing"]:checked');
  const pcDisplay = qs("#pc-type-display");
  const container = qs(".background-container");
  const fadeDurationMs = 120;
  // Moet gelijk zijn aan de opacity-transition-duur van #pc-type-display in
  // CSS (.5s) — anders wordt de fade-out afgekapt door display:none.
  const hideFadeDurationMs = 500;

  if (!pcDisplay || !container) return;

  if (!checked || !pcTypeDimensions[checked.value]) {
    pcDisplay.style.opacity = "0";
    window.setTimeout(() => { pcDisplay.style.display = "none"; }, hideFadeDurationMs);
    return;
  }

  const dims     = pcTypeDimensions[checked.value];
  const newType  = checked.value;
  const prevType = pcDisplay.dataset.currentType;
  const newImage = pcTypeImages[newType];

  const style          = getComputedStyle(container);
  const originalWidth  = parseFloat(style.getPropertyValue("--base-width"))  || 1242.21;
  const originalHeight = parseFloat(style.getPropertyValue("--base-height")) || 630.138;
  const scaleFactor    = container.offsetWidth / originalWidth;

  // On mobile, read per-type dimensions from CSS variables for easy manual adjustment.
  // Adjust the variables in the @media (max-width: 900px) section of the HTML.
  let w, h, rightOff, bottomOff;
  if (mobileQuery.matches) {
    w         = parseFloat(style.getPropertyValue(`--pc-${newType}-width`))         || dims.width;
    h         = parseFloat(style.getPropertyValue(`--pc-${newType}-height`))        || dims.height;
    rightOff  = parseFloat(style.getPropertyValue(`--pc-${newType}-right-offset`))  || dims.rightOffset;
    bottomOff = parseFloat(style.getPropertyValue(`--pc-${newType}-bottom-offset`)) || dims.bottomOffset;
  } else {
    w         = dims.width;
    h         = dims.height;
    rightOff  = dims.rightOffset;
    bottomOff = dims.bottomOffset;
  }

  const rightPct  = ((rightOff - w / 2) / originalWidth)  * 100;
  const bottomPct = (bottomOff / originalHeight) * 100;

  const applyDims = () => {
    pcDisplay.dataset.currentType = newType;
    pcDisplay.style.backgroundImage = newImage;
    pcDisplay.style.width  = `${w * scaleFactor}px`;
    pcDisplay.style.height = `${h * scaleFactor}px`;
    pcDisplay.style.right  = `${rightPct}%`;
    pcDisplay.style.bottom = `${bottomPct}%`;
    pcDisplay.style.left   = "auto";
  };

  if (pcDisplay.style.display !== "block") {
    applyDims();
    pcDisplay.style.display = "block";
    pcDisplay.style.opacity = "0";
    requestAnimationFrame(() => { pcDisplay.style.opacity = "1"; });
  } else if (prevType && prevType !== newType) {
    pcDisplay.style.transition = "opacity .15s ease";
    pcDisplay.style.opacity = "0";
    window.setTimeout(() => {
      applyDims();
      requestAnimationFrame(() => {
        pcDisplay.style.transition = "";
        pcDisplay.style.opacity = "1";
      });
    }, fadeDurationMs);
  } else {
    applyDims();
    pcDisplay.style.opacity = "1";
  }
}

function hidePcTypeDisplay() {
  const pcDisplay = qs("#pc-type-display");
  if (!pcDisplay) return;
  pcDisplay.style.opacity = "0";
  window.setTimeout(() => { pcDisplay.style.display = "none"; }, 500);
}

function showQuestion(num) {
  for (let i = 1; i <= 5; i++) {
    const q = qs(`#question-${i}`);
    if (q) { q.classList.remove("is-active"); q.style.display = "none"; }
  }

  if (num === "result") {
    updateProgressBar("result");
    hidePcTypeDisplay();
    const hintBtn = qs("#question-hint-btn");
    const hintBtnMobile = qs("#question-hint-btn-mobile");
    if (hintBtn) hintBtn.style.display = "none";
    if (hintBtnMobile) hintBtnMobile.style.display = "none";
    return;
  }

  // PC type display: Q1 (behuizing) is where the type gets picked, so keep
  // it live-updated from Q1 onwards. updatePcTypeDisplay() itself hides the
  // visual when nothing is checked yet.
  updatePcTypeDisplay();

  if (num === 5) updateExtraOptionsVisibility();
  if (num === 4) {
    updateQuestion4AsLastStep();
    updateOpslagOptionsForBehuizing();
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
  } else if (questionNum === 4 && quizState.selectedBehuizingType === "all-in-one") {
    // Bij all-in-one is Q5 overgeslagen (zie updateExtraOptionsVisibility/
    // handleStartMatching), dus Q4 is dan de laatste stap.
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

// RGB-verlichting, waterkoeling en wifi zijn ofwel fysiek gebonden aan een
// tower-behuizing (mini-pc/all-in-one hebben dit nooit), of nauwelijks
// onderscheidend buiten tower (wifi: 83% Ja bij tower vs. 95-100% Ja bij
// mini-pc/all-in-one — daar filtert de optie dus vrijwel niets) — verberg
// die opties dus zodra een andere behuizing is gekozen. "Compleet pakket"
// (muis + toetsenbord) is wél onderscheidend bij mini-pc (59/41-verdeling),
// alleen bij all-in-one niet (99% Ja, die zijn per definitie altijd
// compleet) — die optie krijgt dus een eigen, ruimere zichtbaarheidsregel.
function updateExtraOptionsVisibility() {
  const isTower = quizState.selectedBehuizingType === "tower";
  const isAllInOne = quizState.selectedBehuizingType === "all-in-one";

  qsa('[data-tower-only]').forEach(label => {
    label.style.display = isTower ? "" : "none";
    if (!isTower) {
      const input = label.querySelector("input");
      if (input) input.checked = false;
    }
  });

  qsa('[data-not-aio-only]').forEach(label => {
    label.style.display = isAllInOne ? "none" : "";
    if (isAllInOne) {
      const input = label.querySelector("input");
      if (input) input.checked = false;
    }
  });
}

// Bij mini-pc/all-in-one slaat de "Volgende"-knop op Q4 direct door naar het
// resultaat (zie handleStartMatching in de #to-question-5 listener), dus
// laat de knop dat ook zeggen i.p.v. "Volgende" te tonen voor een vraag die
// niet meer komt.
function updateQuestion4AsLastStep() {
  const btn = qs("#to-question-5");
  if (!btn) return;
  btn.textContent = quizState.selectedBehuizingType === "all-in-one" ? "Resultaat" : "Volgende";
}

// Mini-pc's in de catalogus gaan nooit boven 1 TB (geen enkele met 2 TB+),
// en 512 GB is voor dat formaat juist de standaard, niet "weinig". Zonder
// aanpassing geeft de generieke opslagvraag dus een vertekend beeld. Pas de
// labels aan en verberg de nooit-van-toepassing-zijnde "Veel"-optie.
function updateOpslagOptionsForBehuizing() {
  const isMiniPc = quizState.selectedBehuizingType === "mini-pc";

  const weinigLabel    = qs("#opslag-weinig-label");
  const gemiddeldLabel = qs("#opslag-gemiddeld-label");
  if (weinigLabel)    weinigLabel.textContent    = isMiniPc ? "Standaard, 512 GB" : "Weinig, 512 GB";
  if (gemiddeldLabel) gemiddeldLabel.textContent = isMiniPc ? "Ruimer, 1 TB"      : "Gemiddeld, 1 TB";

  qsa('[data-tower-and-aio-only]').forEach(label => {
    label.style.display = isMiniPc ? "none" : "";
    if (isMiniPc) {
      const input = label.querySelector("input");
      if (input) input.checked = false;
    }
  });
}

function resetQuestionsFrom(questionNumber) {
  for (let i = questionNumber; i <= 5; i++) {
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
  const allroundBox   = qs('input[name="gebruik"][value="allround"]');
  const otherGebruik  = qsa('input[name="gebruik"]:not([value="allround"])');

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
        null,
        answers,
        scores
      );

      localStorage.setItem("desktop_bestMatch",               JSON.stringify(result.bestMatch));
      localStorage.setItem("desktop_bestType",                result.bestType ?? "");
      localStorage.setItem("desktop_scores",                  JSON.stringify(scores));
      localStorage.setItem("desktop_filteredMatchedDesktops", JSON.stringify(result.filteredMatchedDesktops));
      localStorage.setItem("desktop_answers",                 JSON.stringify(answers));
      localStorage.setItem("desktop_selectedBehuizingType",   quizState.selectedBehuizingType ?? "");

      const wrapper = qs(".container-wrapper");
      if (wrapper) wrapper.classList.add("is-exiting");
      setTimeout(() => {
        window.location.href = "desktop/resultaat";
      }, 180);
    });
}

export function initQuizPage() {
  if (!qs("#question-1")) return;

  // Pre-fetch products in background
  prefetchProducts();

  // Q1 → Q2
  qs("#to-question-2")?.addEventListener("click", () => {
    const checked = qs('input[name="behuizing"]:checked');
    if (!checked) return alert("Kies een behuizing");
    quizState.selectedBehuizingType = checked.value;
    showQuestion(2);
  });

  // Q2 → Q1
  qs("#back-to-question-1")?.addEventListener("click", () => {
    resetQuestionsFrom(2);
    showQuestion(1);
  });

  // Q2 → Q3 (intensiteit)
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

  // Q3 → Q4 (opslag)
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

  // Q4 → Q5 (extra's) — bij all-in-one blijft er in Q5 alleen "Geen extra
  // wensen" over (geen enkele extra-optie is daar onderscheidend), dus die
  // vraag heeft dan geen functie meer: sla 'm over en ga direct naar het
  // resultaat. Bij mini-pc blijft "Compleet pakket" wél relevant, dus die
  // behuizing krijgt Q5 gewoon te zien.
  qs("#to-question-5")?.addEventListener("click", () => {
    const checked = qs('input[name="opslag"]:checked');
    if (!checked) return alert("Kies een antwoord");

    if (quizState.selectedBehuizingType === "all-in-one") {
      const geenCheckbox = qs('input[name="extra"][value="geen"]');
      if (geenCheckbox) geenCheckbox.checked = true;
      handleStartMatching();
      return;
    }

    showQuestion(5);
  });

  // Q5 → Q4
  qs("#back-to-question-4")?.addEventListener("click", () => {
    resetQuestionsFrom(5);
    showQuestion(4);
  });

  setupGebruikLimit();
  setupExtraLimit();

  // Update PC visualisation when behuizing selection changes
  qsa('input[name="behuizing"]').forEach(radio => {
    radio.addEventListener('change', updatePcTypeDisplay);
  });

  // Q6 → Result
  qs("#start-matching")?.addEventListener("click", handleStartMatching);

  // Re-position on resize
  window.addEventListener("resize", () => {
    for (let i = 1; i <= 5; i++) {
      const q = qs(`#question-${i}`);
      if (q && q.classList.contains("is-active")) {
        if (!mobileQuery.matches) positionElements(i);
        if (i >= 2) updatePcTypeDisplay();
        break;
      }
    }
  }, { passive: true });

  window.addEventListener("load", () => {
    if (qs("#question-1")) showQuestion(1);
  });
}
