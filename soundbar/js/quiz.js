import { breedteGroepLabels, tvGrootteToBreedteGroup, tvDimensionsByTvGrootte, tvDimensionsByTvGrootteMobile, SOUNDBAR_CUTOUT_IMAGES, soundbarDimensionsByBreedte, soundbarDimensionsByBreedteMobile, subwooferDimensions, subwooferDimensionsMobile } from "./data.js";
import { calculateScores, matchSoundbars } from "./matching.js";
import { getContainerScale, normalizeProducts, qs, qsa } from "./utils.js";
import { fetchProducts } from "./supabase.js";

const quizState = {
  selectedTvGrootte: null,
  selectedBreedteGroup: null
};

const breedteGroups = ["compact", "gemiddeld", "groot", "weet-ik-niet"];

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

// ─── Tv-visualisatie (vraag 1) ─────────────────────────────────────────────────
// Zelfde patroon als de tv-keuzehulp's eigen updateTVDisplay(): een losse
// laag bovenop de achtergrond die van grootte wisselt op basis van het
// gekozen antwoord. Toont standaard al de gemiddelde maat (43-55"), i.p.v.
// pas te verschijnen na een keuze — zo staat er meteen een realistische tv
// in beeld.
function updateTVDisplay() {
  const checked = qs('input[name="tvgrootte"]:checked');
  const tvGrootte = checked ? checked.value : "43-55"; // default vóór een keuze

  const tvDisplay = qs("#tv-display");
  const container = qs(".background-container");
  if (!tvDisplay || !container) return;

  const dimsTable = mobileQuery.matches ? tvDimensionsByTvGrootteMobile : tvDimensionsByTvGrootte;
  const dims = dimsTable[tvGrootte];
  if (!dims) return;

  const containerWidth = container.offsetWidth;
  const style = getComputedStyle(container);
  const originalWidth = parseFloat(style.getPropertyValue("--base-width")) || 1242.21;
  const containerHeight = parseFloat(style.getPropertyValue("--base-height")) || 630.138;
  const scaleFactor = containerWidth / originalWidth;

  tvDisplay.style.width = `${dims.width * scaleFactor}px`;
  tvDisplay.style.height = `${dims.height * scaleFactor}px`;

  const rightOffset = parseFloat(style.getPropertyValue("--tv-right-offset")) || 378;
  const bottomOffset = parseFloat(style.getPropertyValue("--tv-bottom-offset")) || 259;

  const rightValue = rightOffset - (dims.width / 2);
  const rightPercentage = (rightValue / originalWidth) * 100;
  const bottomPercentage = (bottomOffset / containerHeight) * 100;

  tvDisplay.style.right = `${rightPercentage}%`;
  tvDisplay.style.bottom = `${bottomPercentage}%`;
  tvDisplay.style.left = "auto";

  if (tvDisplay.style.display !== "block") {
    tvDisplay.style.display = "block";
    tvDisplay.style.opacity = "0";
    requestAnimationFrame(() => { tvDisplay.style.opacity = "1"; });
  } else {
    tvDisplay.style.opacity = "1";
  }
}

// ─── Soundbar-visualisatie op het kastje (vraag 2) ─────────────────────────────
// Wisselt van formaat op basis van de breedte-keuze. Typen zonder cutout
// (nog geen productfoto aangeleverd) laten de display gewoon verborgen.
function applySoundbarDims(sbDisplay, container, image, dims) {
  const containerWidth = container.offsetWidth;
  const style = getComputedStyle(container);
  const originalWidth = parseFloat(style.getPropertyValue("--base-width")) || 1242.21;
  const containerHeight = parseFloat(style.getPropertyValue("--base-height")) || 630.138;
  const scaleFactor = containerWidth / originalWidth;

  sbDisplay.dataset.image = image;
  sbDisplay.style.backgroundImage = `url('${image}')`;
  sbDisplay.style.width  = `${dims.width * scaleFactor}px`;
  sbDisplay.style.height = `${dims.height * scaleFactor}px`;

  const rightOffset  = dims.rightOffset  || 372;
  const bottomOffset = dims.bottomOffset || 178;

  const rightValue = rightOffset - (dims.width / 2);
  sbDisplay.style.right  = `${(rightValue / originalWidth) * 100}%`;
  sbDisplay.style.bottom = `${(bottomOffset / containerHeight) * 100}%`;
  sbDisplay.style.left   = "auto";
}

function updateSoundbarDisplay(breedteGroup) {
  const sbDisplay = qs("#soundbar-display");
  const container = qs(".background-container");
  if (!sbDisplay || !container) return;

  const image = breedteGroup && SOUNDBAR_CUTOUT_IMAGES[breedteGroup];
  const dimsTable = mobileQuery.matches ? soundbarDimensionsByBreedteMobile : soundbarDimensionsByBreedte;
  const dims = breedteGroup ? dimsTable[breedteGroup] : null;
  const fadeDurationMs = 300;

  if (!image || !dims) {
    sbDisplay.style.opacity = "0";
    window.setTimeout(() => { sbDisplay.style.display = "none"; delete sbDisplay.dataset.image; }, fadeDurationMs);
    return;
  }

  const isFirstAppearance = sbDisplay.style.display !== "block";
  const isImageChange = !isFirstAppearance && sbDisplay.dataset.image !== image;

  if (isFirstAppearance) {
    applySoundbarDims(sbDisplay, container, image, dims);
    sbDisplay.style.display = "block";
    sbDisplay.style.opacity = "0";
    requestAnimationFrame(() => { sbDisplay.style.opacity = "1"; });
  } else if (isImageChange) {
    // De drie formaten zijn losse foto's op net iets andere posities — als
    // breedte/hoogte/right/bottom tijdens het infaden nog zouden meebewegen
    // (ze hebben alle vier hun eigen CSS-transition) zie je een vervormende
    // "warp" dwars door de fade heen. Daarom eerst uitfaden, dan de nieuwe
    // maat/positie in één keer hard zetten (transities tijdelijk uit) zodat
    // 'm al op de juiste plek staat vóórdat het infaden begint — er animeert
    // dan alleen nog de opacity, niet de vorm.
    sbDisplay.style.opacity = "0";
    window.setTimeout(() => {
      sbDisplay.style.transition = "none";
      applySoundbarDims(sbDisplay, container, image, dims);
      void sbDisplay.offsetHeight; // force reflow zodat de sprong niet meeanimeert
      requestAnimationFrame(() => {
        sbDisplay.style.transition = "";
        requestAnimationFrame(() => { sbDisplay.style.opacity = "1"; });
      });
    }, fadeDurationMs);
  } else {
    applySoundbarDims(sbDisplay, container, image, dims);
    sbDisplay.style.opacity = "1";
  }
}

// ─── Subwoofer-visualisatie (vraag 4) ──────────────────────────────────────────
// 1 vaste afbeelding/maat, verschijnt/verdwijnt alleen (geen formaatwissel
// nodig, dus geen crossfade-swap-logica zoals bij de soundbar).
function updateSubwooferDisplay(subwoofer) {
  const subDisplay = qs("#subwoofer-display");
  const container = qs(".background-container");
  if (!subDisplay || !container) return;

  if (subwoofer !== "ja") {
    subDisplay.style.opacity = "0";
    window.setTimeout(() => { subDisplay.style.display = "none"; }, 300);
    return;
  }

  const dims = mobileQuery.matches ? subwooferDimensionsMobile : subwooferDimensions;
  const containerWidth = container.offsetWidth;
  const style = getComputedStyle(container);
  const originalWidth = parseFloat(style.getPropertyValue("--base-width")) || 1242.21;
  const containerHeight = parseFloat(style.getPropertyValue("--base-height")) || 630.138;
  const scaleFactor = containerWidth / originalWidth;

  subDisplay.style.width  = `${dims.width * scaleFactor}px`;
  subDisplay.style.height = `${dims.height * scaleFactor}px`;

  const rightValue = dims.rightOffset - (dims.width / 2);
  subDisplay.style.right  = `${(rightValue / originalWidth) * 100}%`;
  subDisplay.style.bottom = `${(dims.bottomOffset / containerHeight) * 100}%`;
  subDisplay.style.left   = "auto";

  if (subDisplay.style.display !== "block") {
    subDisplay.style.display = "block";
    subDisplay.style.opacity = "0";
    requestAnimationFrame(() => { subDisplay.style.opacity = "1"; });
  } else {
    subDisplay.style.opacity = "1";
  }
}

const TOTAL_QUESTIONS = 5;

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

// ─── Vraag 2: dynamisch advies op basis van vraag 1's tv-grootte ───────────────
// Mirrors tv's renderSizeOptions()-patroon: toon een voorgesteld antwoord,
// laat de bezoeker het aanpassen.

function renderBreedteOptions(advisedGroup) {
  const container = qs("#breedte-options");
  if (!container) return;
  container.innerHTML = "";

  const labels = {
    compact:        "Compact, tot ongeveer 80 cm",
    gemiddeld:       "Gemiddeld, ongeveer 80 tot 110 cm",
    groot:           "Groot, 110 cm of breder",
    "weet-ik-niet":  "Weet ik niet / maakt niet uit"
  };
  const prices = {
    compact: "€", gemiddeld: "€€", groot: "€€€", "weet-ik-niet": "€"
  };
  const icons = {
    compact: "ruler", gemiddeld: "ruler", groot: "ruler", "weet-ik-niet": "help-circle"
  };

  breedteGroups.forEach(group => {
    const label = document.createElement("label");
    label.className = "answer-option";
    label.innerHTML = `
      <input type="radio" name="breedte" value="${group}" ${group === advisedGroup ? "checked" : ""}>
      <svg class="answer-info-icon" data-icon="${icons[group]}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></svg>
      <span>${labels[group]}</span>
      <span class="price-indicator">${prices[group]}</span>
    `;
    container.appendChild(label);
  });

  qsa('input[name="breedte"]', container).forEach(radio => {
    radio.addEventListener("change", () => updateSoundbarDisplay(radio.value));
  });
  updateSoundbarDisplay(advisedGroup);

  const rowCount = breedteGroups.length;
  const scale = getContainerScale(container);
  const baseTop = 70.11 + 37.77 + (rowCount * 58) + ((rowCount - 1) * 15) + 22;
  const q2Buttons = qs("#question-2 .button-container");
  if (q2Buttons) q2Buttons.style.top = `${baseTop * scale}px`;

  if (window.lucide && typeof window.lucide.createIcons === "function") {
    // Nieuw ingevoegde svg[data-icon]-elementen na de pagina's initiële
    // initLucideIcons()-pass hebben een eigen render-aanroep nodig.
    const iconElements = container.querySelectorAll("svg[data-icon]");
    iconElements.forEach(svg => {
      const iconName = svg.getAttribute("data-icon");
      const temp = document.createElement("div");
      temp.innerHTML = `<svg data-lucide="${iconName}"></svg>`;
      const renderedSvg = temp.querySelector("svg");
      ["viewBox", "fill", "stroke", "stroke-linecap", "stroke-linejoin", "class"].forEach(attr => {
        if (svg.hasAttribute(attr)) renderedSvg.setAttribute(attr, svg.getAttribute(attr));
      });
      svg.parentNode.replaceChild(renderedSvg, svg);
    });
    window.lucide.createIcons();
  }
}

function resetQuestionsFrom(questionNumber) {
  for (let i = questionNumber; i <= TOTAL_QUESTIONS; i++) {
    const inputs = qsa(`#question-${i} input`);
    inputs.forEach(input => { input.checked = false; });
  }
}

function buildAnswers() {
  const gebruikChecked = qs('input[name="gebruik"]:checked')?.value ?? "";
  return {
    breedte:      qs('input[name="breedte"]:checked')?.value ?? "",
    gebruik:      gebruikChecked ? [gebruikChecked] : [],
    subwoofer:    qs('input[name="subwoofer"]:checked')?.value ?? "",
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
  const scores = calculateScores(answers);

  const btn = qs("#start-matching");
  if (btn) { btn.disabled = true; btn.textContent = "Bezig…"; }

  prefetchProducts()
    .then(rawProducts => {
      const soundbars = normalizeProducts(rawProducts ?? []);
      const result = matchSoundbars(
        soundbars,
        quizState.selectedBreedteGroup,
        null,
        answers,
        scores
      );

      localStorage.setItem("soundbar_bestMatch",                JSON.stringify(result.bestMatch));
      localStorage.setItem("soundbar_bestType",                 result.bestType ?? "");
      localStorage.setItem("soundbar_scores",                   JSON.stringify(scores));
      localStorage.setItem("soundbar_filteredMatchedSoundbars", JSON.stringify(result.filteredMatchedSoundbars));
      localStorage.setItem("soundbar_answers",                  JSON.stringify(answers));
      localStorage.setItem("soundbar_selectedBreedteGroup",     quizState.selectedBreedteGroup ?? "");

      const wrapper = qs(".container-wrapper");
      if (wrapper) wrapper.classList.add("is-exiting");
      setTimeout(() => {
        window.location.href = "soundbar/resultaat";
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

  // Q1 → Q2 (tv-grootte → breedte-advies)
  qs("#to-question-2")?.addEventListener("click", () => {
    const checked = qs('input[name="tvgrootte"]:checked');
    if (!checked) return alert("Kies een tv-grootte");

    quizState.selectedTvGrootte = checked.value;
    const advisedGroup = tvGrootteToBreedteGroup[quizState.selectedTvGrootte] || "gemiddeld";

    const adviesEl = qs("#breedte-advies-tekst");
    if (adviesEl) {
      const info = breedteGroepLabels[advisedGroup];
      adviesEl.textContent = `Wij adviseren een ${info.naam} soundbar (${info.omschrijving}). Pas eventueel aan.`;
    }

    renderBreedteOptions(advisedGroup);
    showQuestion(2);
  });

  // Q2 → Q1
  qs("#back-to-question-1")?.addEventListener("click", () => {
    resetQuestionsFrom(2);
    updateSoundbarDisplay(null);
    updateSubwooferDisplay(null);
    showQuestion(1);
  });

  // Q2 → Q3
  qs("#to-question-3")?.addEventListener("click", () => {
    const checked = qs('input[name="breedte"]:checked');
    if (!checked) return alert("Kies een breedte");
    quizState.selectedBreedteGroup = checked.value;
    showQuestion(3);
  });

  // Q3 → Q2
  qs("#back-to-question-2")?.addEventListener("click", () => {
    resetQuestionsFrom(3);
    updateSubwooferDisplay(null);
    showQuestion(2);
  });

  // Q3 → Q4
  qs("#to-question-4")?.addEventListener("click", () => {
    const checked = qs('input[name="gebruik"]:checked');
    if (!checked) return alert("Kies een antwoord");
    showQuestion(4);
    const subwooferChecked = qs('input[name="subwoofer"]:checked');
    updateSubwooferDisplay(subwooferChecked ? subwooferChecked.value : null);
  });

  // Q4 → Q3
  qs("#back-to-question-3")?.addEventListener("click", () => {
    resetQuestionsFrom(4);
    updateSubwooferDisplay(null);
    showQuestion(3);
  });

  // Q4 → Q5
  qs("#to-question-5")?.addEventListener("click", () => {
    const checked = qs('input[name="subwoofer"]:checked');
    if (!checked) return alert("Kies een antwoord");
    showQuestion(5);
  });

  // Q5 → Q4
  qs("#back-to-question-4")?.addEventListener("click", () => {
    resetQuestionsFrom(5);
    showQuestion(4);
    const subwooferChecked = qs('input[name="subwoofer"]:checked');
    updateSubwooferDisplay(subwooferChecked ? subwooferChecked.value : null);
  });

  // Live subwoofer-visualisatie op vraag 4
  qsa('input[name="subwoofer"]').forEach(radio => {
    radio.addEventListener("change", () => updateSubwooferDisplay(radio.value));
  });

  setupExtraLimit();

  // Q5 → Result
  qs("#start-matching")?.addEventListener("click", handleStartMatching);

  // Live tv-visualisatie: staat standaard al op de gemiddelde maat, en
  // wisselt live mee zodra de bezoeker op vraag 1 een tv-grootte kiest.
  qsa('input[name="tvgrootte"]').forEach(radio => {
    radio.addEventListener("change", updateTVDisplay);
  });

  // Re-position on resize
  window.addEventListener("resize", () => {
    updateTVDisplay();
    const breedteChecked = qs('input[name="breedte"]:checked');
    if (breedteChecked) updateSoundbarDisplay(breedteChecked.value);
    const subwooferChecked = qs('input[name="subwoofer"]:checked');
    if (subwooferChecked) updateSubwooferDisplay(subwooferChecked.value);
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
  updateTVDisplay();
}
