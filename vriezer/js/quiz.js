import {
  nishoogteGroups,
  vrijstaandGrootteLabels, vrijstaandGrootteInhoud,
  vrieskistGrootteLabels, vrieskistGrootteInhoud,
} from "./data.js";
import { matchVriezers } from "./matching.js";
import { getContainerScale, normalizeProducts, qs, qsa } from "./utils.js";
import { fetchProducts } from "./supabase.js";
import { initLucideIcons } from "./icons.js";

// Geen achtergrond-visualisatie (crossfade-lagen per type/formaat) zoals bij
// koelkast — dat komt pas later zodra er scene-foto's zijn (zie CLAUDE.md:
// eerst quiz+resultaat, visuals volgen apart). Deze pagina heeft nu gewoon 1
// vaste achtergrond.

const quizState = {
  plaatsing: null
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

// Basis-achtergrond toont de keuken zonder vriezer. Per plaatsing-antwoord
// fade (of bij vrieskist: schuift) een eigen volledige scène-foto erover:
// "inbouw" toont de kast erbij; "vrijstaand" en "vrieskist" hebben elk eigen
// formaat-varianten die op Q2 verder verfijnen — vóór die keuze (nog op Q1)
// toont het grootste formaat als redelijk standaard-voorbeeld. Vrieskist
// heeft nog geen apart "extra-groot"-beeld — die valt terug op "groot".
// "vrieskist" is bewust een andere ruimte (berging i.p.v. keuken), dus die
// schuift in i.p.v. te faden (zie .background-layer--vrieskist-* in
// vragen/index.html) — voelt als naar de kamer ernaast gaan.
function updateBackgroundLayer(plaatsing, grootte) {
  let active = null;
  if (plaatsing === "inbouw") {
    active = "inbouw";
  } else if (plaatsing === "vrijstaand") {
    active = grootte === "mini" ? "vrijstaand-mini"
           : grootte === "middel" ? "vrijstaand-middel"
           : "vrijstaand-groot"; // standaard / nog niet gekozen
  } else if (plaatsing === "vrieskist") {
    active = grootte === "middel" ? "vrieskist-middel"
           : grootte === "groot" ? "vrieskist-groot"
           : grootte === "extra-groot" ? "vrieskist-extra-groot"
           : "vrieskist-groot"; // standaard / nog niet gekozen
  }

  const layers = {
    "inbouw":              qs("#bg-layer-inbouw"),
    "vrijstaand-mini":     qs("#bg-layer-vrijstaand-mini"),
    "vrijstaand-middel":   qs("#bg-layer-vrijstaand-middel"),
    "vrijstaand-groot":    qs("#bg-layer-vrijstaand-groot"),
    "vrieskist-middel":    qs("#bg-layer-vrieskist-middel"),
    "vrieskist-groot":     qs("#bg-layer-vrieskist-groot"),
    "vrieskist-extra-groot": qs("#bg-layer-vrieskist-extra-groot"),
  };

  Object.entries(layers).forEach(([key, layer]) => {
    if (layer) layer.classList.toggle("is-visible", key === active);
  });

  // De muur-laag hoort altijd bij vrieskist (zie CSS-comment hierboven) —
  // geen eigen "active"-status, gewoon gelijk geschakeld, en blijft staan
  // (geen herhaalde slide) terwijl je tussen de 3 formaten wisselt.
  const muurLayer = qs("#bg-layer-vrieskist-muur");
  if (muurLayer) muurLayer.classList.toggle("is-visible", Boolean(active) && active.startsWith("vrieskist-"));
}

function setQuestionExpanded(question, expanded) {
  if (!question) return;
  question.classList.toggle("is-expanded", expanded);
  const toggle = question.querySelector(".answers-toggle");
  if (toggle) toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
}

const TOTAL_QUESTIONS = 4;

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

function resetQuestionsFrom(questionNumber) {
  for (let i = questionNumber; i <= TOTAL_QUESTIONS; i++) {
    const inputs = qsa(`#question-${i} input`);
    inputs.forEach(input => { input.checked = false; });
  }
}

// ─── Q2: dynamically rendered based on Q1's answer ─────────────────────────────
// Mirrors koelkast's renderQ2Options() patroon, nu met 3 takken i.p.v. 2.

function renderQ2Options(plaatsing) {
  const container = qs("#question-2-options");
  const heading   = qs("#question-2-heading");
  const popoverText = qs("#question-2-popover-text");
  if (!container) return;

  container.innerHTML = "";

  if (plaatsing === "inbouw") {
    if (heading) heading.textContent = "Wat is de hoogte van je nis?";
    if (popoverText) {
      popoverText.textContent = "De hoogte van de nis bepaalt welke inbouwvriezers fysiek in je keukenkast passen. Meet de binnenhoogte van de nis waar de vriezer moet komen, van vloer tot bovenkant van de opening. Weet je het niet precies? Kies de dichtstbijzijnde maat.";
    }

    nishoogteGroups.forEach(cm => {
      const label = document.createElement("label");
      label.className = "answer-option";
      label.innerHTML = `
        <input type="radio" name="nishoogte" value="${cm}">
        <svg class="answer-info-icon" data-icon="ruler" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></svg>
        <span>${cm} cm</span>
      `;
      container.appendChild(label);
    });

    const unknownLabel = document.createElement("label");
    unknownLabel.className = "answer-option";
    unknownLabel.innerHTML = `
      <input type="radio" name="nishoogte" value="">
      <svg class="answer-info-icon" data-icon="help-circle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></svg>
      <span>Weet ik nog niet</span>
    `;
    container.appendChild(unknownLabel);
  } else {
    const isVrieskist = plaatsing === "vrieskist";
    const labels = isVrieskist ? vrieskistGrootteLabels : vrijstaandGrootteLabels;
    const inhoud = isVrieskist ? vrieskistGrootteInhoud : vrijstaandGrootteInhoud;
    const order = isVrieskist ? ["middel", "groot", "extra-groot"] : ["mini", "middel", "groot"];

    if (heading) heading.textContent = isVrieskist ? "Welke inhoud heb je nodig?" : "Welk formaat zoek je?";
    if (popoverText) {
      popoverText.textContent = isVrieskist
        ? "Vrieskisten variëren sterk in inhoud. Een middelgrote kist is prima voor incidenteel grote of onregelmatig gevormde etenswaren; een grote of extra grote kist is handig als je structureel veel wilt invriezen."
        : "Een mini/compacte vrieskast past ook in een kleine ruimte, zoals een bijkeuken of studio. Een middelgrote of grote vrieskast biedt meer opbergruimte voor een gezin.";
    }

    order.forEach(value => {
      const label = document.createElement("label");
      label.className = "answer-option";
      label.innerHTML = `
        <input type="radio" name="grootte" value="${value}">
        <svg class="answer-info-icon" data-icon="${isVrieskist ? "archive" : "refrigerator"}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></svg>
        <span>${labels[value]} <span class="answer-sub">(${inhoud[value]})</span></span>
      `;
      container.appendChild(label);
    });

    // Live crossfade/slide preview while still on Q2, before "Volgende" is clicked
    qsa('input[name="grootte"]', container).forEach(radio => {
      radio.addEventListener("change", () => updateBackgroundLayer(plaatsing, radio.value));
    });
  }

  const rowCount = container.children.length;
  const scale = getContainerScale(container);
  const baseTop = 70.11 + 37.77 + (rowCount * 58) + ((rowCount - 1) * 15) + 22;
  const q2Buttons = qs("#question-2 .button-container");
  if (q2Buttons) q2Buttons.style.top = `${baseTop * scale}px`;

  // Deze answer-option-iconen worden na de initiële initLucideIcons()-pass
  // ingevoegd, dus ze hebben een eigen render-aanroep nodig.
  initLucideIcons();

  positionElements(2);
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

function buildAnswers() {
  return {
    plaatsing:      qs('input[name="plaatsing"]:checked')?.value ?? "",
    nishoogte:      qs('input[name="nishoogte"]:checked')?.value ?? "",
    grootte:        qs('input[name="grootte"]:checked')?.value ?? "",
    gezinsgrootte:  qs('input[name="gezinsgrootte"]:checked')?.value ?? "",
    extraAnswers:   qsa('input[name="extra"]:checked').map(cb => cb.value)
  };
}

function handleStartMatching() {
  const extraChecked = qsa('input[name="extra"]:checked');
  if (extraChecked.length === 0) return alert("Kies minimaal 1 antwoord");

  const answers = buildAnswers();

  const btn = qs("#start-matching");
  if (btn) { btn.disabled = true; btn.textContent = "Bezig…"; }

  prefetchProducts()
    .then(rawProducts => {
      const vriezers = normalizeProducts(rawProducts ?? []);
      const result = matchVriezers(vriezers, answers);

      localStorage.setItem("vriezer_bestMatch",              JSON.stringify(result.bestMatch));
      localStorage.setItem("vriezer_bestType",                result.bestType ?? "");
      localStorage.setItem("vriezer_filteredMatchedVriezers", JSON.stringify(result.filteredMatchedVriezers));
      localStorage.setItem("vriezer_answers",                 JSON.stringify(answers));

      const wrapper = qs(".container-wrapper");
      if (wrapper) wrapper.classList.add("is-exiting");
      setTimeout(() => {
        window.location.href = "vriezer/resultaat";
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

  // Q1 → Q2 (Q1 is hard/required)
  qs("#to-question-2")?.addEventListener("click", () => {
    const checked = qs('input[name="plaatsing"]:checked');
    if (!checked) return alert("Kies welk type vriezer je zoekt");

    quizState.plaatsing = checked.value;
    updateBackgroundLayer(quizState.plaatsing);
    renderQ2Options(quizState.plaatsing);
    showQuestion(2);
  });

  // Live crossfade preview while still on Q1, before "Volgende" is clicked
  qsa('input[name="plaatsing"]').forEach(radio => {
    radio.addEventListener("change", () => updateBackgroundLayer(radio.value));
  });

  // Q2 → Q1
  qs("#back-to-question-1")?.addEventListener("click", () => {
    resetQuestionsFrom(2);
    showQuestion(1);
  });

  // Q2 → Q3
  qs("#to-question-3")?.addEventListener("click", () => {
    const name = quizState.plaatsing === "inbouw" ? "nishoogte" : "grootte";
    const checked = qs(`input[name="${name}"]:checked`);
    if (!checked) return alert("Kies een antwoord");
    showQuestion(3);
  });

  // Q3 → Q2 (re-render Q2 voor de huidige plaatsing zodat teruggaan en dan
  // Q1 wijzigen geen verouderde opties van de andere tak achterlaat)
  qs("#back-to-question-2")?.addEventListener("click", () => {
    resetQuestionsFrom(3);
    if (quizState.plaatsing) renderQ2Options(quizState.plaatsing);
    showQuestion(2);
  });

  // Q3 → Q4
  qs("#to-question-4")?.addEventListener("click", () => {
    const checked = qs('input[name="gezinsgrootte"]:checked');
    if (!checked) return alert("Kies een antwoord");
    showQuestion(4);
  });

  // Q4 → Q3
  qs("#back-to-question-3")?.addEventListener("click", () => {
    resetQuestionsFrom(4);
    showQuestion(3);
  });

  setupExtraLimit();

  // Q4 → Result
  qs("#start-matching")?.addEventListener("click", handleStartMatching);

  // Re-position on resize
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
