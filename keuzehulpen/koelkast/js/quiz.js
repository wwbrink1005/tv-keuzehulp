import { nishoogteGroups, vrijstaandTypeLabels, vrijstaandTypeBreedte } from "./data.js";
import { matchKoelkasten } from "./matching.js";
import { getContainerScale, normalizeProducts, qs, qsa } from "./utils.js";
import { fetchProducts } from "./supabase.js";
import { initLucideIcons } from "./icons.js";

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

function updateBackgroundLayer(plaatsing, vrijstaandtype) {
  const layers = {
    inbouw:      qs("#bg-layer-inbouw"),
    vrijstaand:  qs("#bg-layer-vrijstaand"),
    amerikaans:  qs("#bg-layer-amerikaans"),
    tafelmodel:  qs("#bg-layer-tafelmodel"),
  };

  let active = null;
  if (plaatsing === "inbouw") {
    active = "inbouw";
  } else if (plaatsing === "vrijstaand") {
    active = vrijstaandtype === "amerikaans" ? "amerikaans"
           : vrijstaandtype === "tafelmodel" ? "tafelmodel"
           : "vrijstaand"; // standaard / extra-breed / not chosen yet
  }

  Object.entries(layers).forEach(([key, layer]) => {
    if (layer) layer.classList.toggle("is-visible", key === active);
  });

  const badge = qs("#koelkast-dim-badge");
  if (badge) {
    const breedte = plaatsing === "vrijstaand" ? vrijstaandTypeBreedte[vrijstaandtype] : null;
    if (breedte) {
      badge.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0Z"/>
          <path d="m14.5 12.5 2-2"/>
          <path d="m11.5 9.5 2-2"/>
          <path d="m8.5 6.5 2-2"/>
          <path d="m17.5 15.5 2-2"/>
        </svg>
        <span>${breedte}</span>
      `;
      badge.classList.toggle("koelkast-dim-badge--tafelmodel", vrijstaandtype === "tafelmodel");
      badge.classList.add("is-visible");
    } else {
      badge.classList.remove("is-visible");
    }
  }
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
// Mirrors tv's renderSizeOptions() pattern: repopulate a container at runtime
// based on a prior answer, instead of shipping two static markup branches.

function renderQ2Options(plaatsing) {
  const container = qs("#question-2-options");
  const heading   = qs("#question-2-heading");
  const popoverText = qs("#question-2-popover-text");
  if (!container) return;

  container.innerHTML = "";

  if (plaatsing === "inbouw") {
    if (heading) heading.textContent = "Wat is de hoogte van je nis?";
    if (popoverText) {
      popoverText.textContent = "De hoogte van de nis bepaalt welke inbouwkoelkasten fysiek in je keukenkast passen. Meet de binnenhoogte van de nis waar de koelkast moet komen, van vloer tot bovenkant van de opening. Weet je het niet precies? Kies de dichtstbijzijnde maat.";
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

    // Graceful opt-out: matching.js already skips the nishoogte-filter
    // entirely when this is chosen (empty value), so no results get
    // wrongly excluded — the user just sees inbouwkoelkasten ongefilterd
    // op hoogte.
    const unknownLabel = document.createElement("label");
    unknownLabel.className = "answer-option";
    unknownLabel.innerHTML = `
      <input type="radio" name="nishoogte" value="">
      <svg class="answer-info-icon" data-icon="help-circle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></svg>
      <span>Weet ik nog niet</span>
    `;
    container.appendChild(unknownLabel);
  } else {
    if (heading) heading.textContent = "Welk type koelkast zoek je?";
    if (popoverText) {
      popoverText.textContent = "Een standaard koelkast (koel-vriescombinatie of losse koelkast) past in de meeste keukens. Extra brede en Amerikaanse (side-by-side) modellen bieden meer opbergruimte, maar hebben ook meer plaats nodig. Een tafelmodel is compact en ideaal voor een kleine ruimte, zoals een studeerkamer of studio.";
    }

    const options = [
      { value: "standaard",   label: vrijstaandTypeLabels["standaard"] },
      { value: "extra-breed", label: vrijstaandTypeLabels["extra-breed"] },
      { value: "amerikaans",  label: vrijstaandTypeLabels["amerikaans"] },
      { value: "tafelmodel",  label: vrijstaandTypeLabels["tafelmodel"] },
    ];

    options.forEach(opt => {
      const label = document.createElement("label");
      label.className = "answer-option";
      label.innerHTML = `
        <input type="radio" name="vrijstaandtype" value="${opt.value}">
        <svg class="answer-info-icon" data-icon="refrigerator" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></svg>
        <span>${opt.label}</span>
      `;
      container.appendChild(label);
    });

    // Live crossfade preview while still on Q2, before "Volgende" is clicked
    qsa('input[name="vrijstaandtype"]', container).forEach(radio => {
      radio.addEventListener("change", () => updateBackgroundLayer(plaatsing, radio.value));
    });
  }

  const rowCount = container.children.length;
  const scale = getContainerScale(container);
  const baseTop = 70.11 + 37.77 + (rowCount * 58) + ((rowCount - 1) * 15) + 22;
  const q2Buttons = qs("#question-2 .button-container");
  if (q2Buttons) q2Buttons.style.top = `${baseTop * scale}px`;

  // These answer-option icons are injected after the page's one-time
  // initLucideIcons() pass, so they need their own render call.
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
    vrijstaandtype: qs('input[name="vrijstaandtype"]:checked')?.value ?? "",
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
      const koelkasten = normalizeProducts(rawProducts ?? []);
      const result = matchKoelkasten(koelkasten, answers);

      localStorage.setItem("koelkast_bestMatch",               JSON.stringify(result.bestMatch));
      localStorage.setItem("koelkast_bestType",                result.bestType ?? "");
      localStorage.setItem("koelkast_filteredMatchedKoelkasten", JSON.stringify(result.filteredMatchedKoelkasten));
      localStorage.setItem("koelkast_answers",                 JSON.stringify(answers));

      const wrapper = qs(".container-wrapper");
      if (wrapper) wrapper.classList.add("is-exiting");
      setTimeout(() => {
        window.location.href = "keuzehulpen/koelkast/resultaat";
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

  // Q1 → Q2 (Q1 is hard/required, no "maakt niet uit" option)
  qs("#to-question-2")?.addEventListener("click", () => {
    const checked = qs('input[name="plaatsing"]:checked');
    if (!checked) return alert("Kies of je een inbouw- of vrijstaande koelkast zoekt");

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
    const name = quizState.plaatsing === "inbouw" ? "nishoogte" : "vrijstaandtype";
    const checked = qs(`input[name="${name}"]:checked`);
    if (!checked) return alert("Kies een antwoord");
    showQuestion(3);
  });

  // Q3 → Q2 (re-render Q2 for the currently stored plaatsing so going back
  // then changing Q1 doesn't leave stale options from the other branch)
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
