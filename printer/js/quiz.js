import { matchPrinters } from "./matching.js";
import { getContainerScale, normalizeProducts, qs, qsa } from "./utils.js";
import { fetchProducts } from "./supabase.js";

const quizState = {
  selectedGebruikType: null
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

const TOTAL_QUESTIONS = 6;

// ─── Printer-visualisatie: silhouet per gebruiksdoel ───────────────────────────
// Het printer-silhouet wisselt (met crossfade, dubbele buffer — zelfde patroon
// als de wasmachine-trommel) o.b.v. vraag 1.

const PRINTER_IMAGES = {
  thuis:    "printer/images/Gemengd.png",
  foto:     "printer/images/Foto.png",
  zakelijk: "printer/images/Zakelijk.png"
};

// Elke productfoto heeft zijn eigen beeldverhouding (b x h in px) — gebruikt
// om per type dezelfde hoogte op het kastblad te behouden terwijl de breedte
// vanzelf meeschaalt, zodat geen enkele foto vervormd of uitgerekt wordt.
const PRINTER_IMAGE_SIZES = {
  thuis:    { width: 542, height: 460 },
  foto:     { width: 620, height: 403 },
  zakelijk: { width: 542, height: 460 }
};

// Afmetingen + positie per printertype (px in de 1242.21-brede coördinaten-
// ruimte). Elk type heeft een EIGEN hoogte (de breedte volgt automatisch uit
// de eigen beeldverhouding van de foto, zie PRINTER_IMAGE_SIZES) én een eigen
// right/bottom-offset — pas deze 3 getallen per type aan om die ene printer
// groter/kleiner te maken of anders te positioneren, zonder de andere 3 te
// beïnvloeden.
//
// Mobiel gebruikt dezelfde waarden als desktop: de mobiele achtergrondfoto is
// dezelfde compositie, alleen aan de zijkanten afgeknipt met een gelijke
// hoogte, dus de positie (afstand vanaf rechts/onder) blijft identiek.
const PRINTER_LAYOUT = {
  thuis:    { height: 200, rightOffset: 430, bottomOffset: 207 },
  foto:     { height: 130, rightOffset: 430, bottomOffset: 242 },
  zakelijk: { height: 200, rightOffset: 430, bottomOffset: 240 }
};

// Losse mobiele correctie bovenop PRINTER_LAYOUT (in dezelfde coördinaten-
// ruimte als hierboven). rightOffset is de afstand vanaf de RECHTERKANT, dus
// een KLEINER getal (of negatief) schuift de printer naar rechts, een groter
// getal schuift 'm naar links. bottomOffset werkt hetzelfde voor op/neer.
const MOBILE_OFFSET_ADJUST = { right: -130, bottom: 0 };

function getPrinterLayout(gebruikValue) {
  const base = PRINTER_LAYOUT[gebruikValue] ?? { height: 100, rightOffset: 300, bottomOffset: 40 };
  if (!mobileQuery.matches) return base;
  return {
    height: base.height,
    rightOffset: base.rightOffset + MOBILE_OFFSET_ADJUST.right,
    bottomOffset: base.bottomOffset + MOBILE_OFFSET_ADJUST.bottom
  };
}

function getPrinterDimensions(gebruikValue) {
  const size = PRINTER_IMAGE_SIZES[gebruikValue];
  const targetHeight = getPrinterLayout(gebruikValue).height;
  if (!size) return { width: targetHeight, height: targetHeight };
  const aspect = size.width / size.height;
  return { width: targetHeight * aspect, height: targetHeight };
}

let currentGebruikAnswer = null;
let activePrinterLayer = "a";

// Plaatst een laag op basis van vaste right/bottom-offsets (getallen, px in
// de 1242.21-brede coördinatenruimte) — gebruikt voor de printers, die elk
// hun eigen positie hebben (zie PRINTER_LAYOUT).
function positionLayerAbs(el, container, dims, rightOffset, bottomOffset) {
  const style = getComputedStyle(container);
  const originalWidth  = parseFloat(style.getPropertyValue("--base-width"))  || 1242.21;
  const originalHeight = parseFloat(style.getPropertyValue("--base-height")) || 630.138;
  const scaleFactor    = container.offsetWidth / originalWidth;

  const rightPct  = ((rightOffset - dims.width / 2) / originalWidth) * 100;
  const bottomPct = (bottomOffset / originalHeight) * 100;

  el.style.width  = `${dims.width  * scaleFactor}px`;
  el.style.height = `${dims.height * scaleFactor}px`;
  el.style.right  = `${rightPct}%`;
  el.style.bottom = `${bottomPct}%`;
  el.style.left   = "auto";
}

function updatePrinterDisplay() {
  const checked    = qs('input[name="gebruik"]:checked');
  const layerA     = qs("#printer-display-a");
  const layerB     = qs("#printer-display-b");
  const container  = qs(".background-container");
  if (!layerA || !layerB || !container) return;

  if (!checked || !PRINTER_IMAGES[checked.value]) {
    [layerA, layerB].forEach(el => {
      el.style.opacity = "0";
      window.setTimeout(() => { el.style.display = "none"; }, 280);
    });
    currentGebruikAnswer = null;
    return;
  }

  const dims   = getPrinterDimensions(checked.value);
  const layout = getPrinterLayout(checked.value);

  // Zelfde antwoord als al getoond: alleen herpositioneren (bv. na resize).
  if (currentGebruikAnswer === checked.value) {
    const active = activePrinterLayer === "a" ? layerA : layerB;
    positionLayerAbs(active, container, dims, layout.rightOffset, layout.bottomOffset);
    return;
  }
  currentGebruikAnswer = checked.value;

  const activeEl   = activePrinterLayer === "a" ? layerA : layerB;
  const inactiveEl = activePrinterLayer === "a" ? layerB : layerA;
  const nextLayer  = activePrinterLayer === "a" ? "b" : "a";

  // Alleen de inkomende laag krijgt de (mogelijk andere) afmetingen/positie
  // van het nieuwe type — de uitgaande laag laten we ongemoeid terwijl hij
  // wegfadet, zodat de oude foto niet nog even verspringt vlak voor hij
  // verdwijnt.
  inactiveEl.style.backgroundImage = `url('${PRINTER_IMAGES[checked.value]}')`;
  positionLayerAbs(inactiveEl, container, dims, layout.rightOffset, layout.bottomOffset);
  inactiveEl.style.display = "block";

  const isFirstShow = activeEl.style.display !== "block";

  if (isFirstShow) {
    // Nog geen printer getoond: alleen de nieuwe laag hoeft in te faden.
    requestAnimationFrame(() => { inactiveEl.style.opacity = "1"; });
  } else {
    // Crossfade: oude laag uit, nieuwe laag in — tegelijk, dus nooit een
    // moment waarop de printer helemaal verdwenen is.
    requestAnimationFrame(() => {
      activeEl.style.opacity   = "0";
      inactiveEl.style.opacity = "1";
    });
  }

  activePrinterLayer = nextLayer;
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

  // Printer-visualisatie blijft zichtbaar zodra er een antwoord gekozen is,
  // gedurende de hele keuzehulp (niet alleen op vraag 1).
  updatePrinterDisplay();

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
    gebruik:      qs('input[name="gebruik"]:checked')?.value ?? "",
    volume:       qs('input[name="volume"]:checked')?.value ?? "",
    aio:          qs('input[name="aio"]:checked')?.value ?? "",
    kleur:        qs('input[name="kleur"]:checked')?.value ?? "",
    inkt:         qs('input[name="inkt"]:checked')?.value ?? "",
    extraAnswers: qsa('input[name="extra"]:checked').map(cb => cb.value)
  };
}

function handleStartMatching() {
  const checked = qs('input[name="extra"]:checked');
  if (!checked) return alert("Kies minimaal 1 antwoord");

  const answers = buildAnswers();

  const btn = qs("#start-matching");
  if (btn) { btn.disabled = true; btn.textContent = "Bezig…"; }

  prefetchProducts()
    .then(rawProducts => {
      const printers = normalizeProducts(rawProducts ?? []);
      const result = matchPrinters(
        printers,
        quizState.selectedGebruikType,
        null,
        answers
      );

      localStorage.setItem("printer_bestMatch",                 JSON.stringify(result.bestMatch));
      localStorage.setItem("printer_bestType",                  result.bestType ?? "");
      localStorage.setItem("printer_filteredMatchedPrinters",   JSON.stringify(result.filteredMatchedPrinters));
      localStorage.setItem("printer_answers",                   JSON.stringify(answers));
      localStorage.setItem("printer_selectedGebruik",           quizState.selectedGebruikType ?? "");

      const wrapper = qs(".container-wrapper");
      if (wrapper) wrapper.classList.add("is-exiting");
      setTimeout(() => {
        window.location.href = "printer/resultaat";
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

  // Printer-silhouet reageert meteen op wijzigingen binnen vraag 1, niet pas
  // bij het doorklikken naar de volgende vraag.
  qsa('input[name="gebruik"]').forEach(radio => {
    radio.addEventListener("change", updatePrinterDisplay);
  });

  // Q1 → Q2
  qs("#to-question-2")?.addEventListener("click", () => {
    const checked = qs('input[name="gebruik"]:checked');
    if (!checked) return alert("Kies een gebruiksdoel");

    quizState.selectedGebruikType = checked.value;
    showQuestion(2);
  });

  // Q2 → Q1
  qs("#back-to-question-1")?.addEventListener("click", () => {
    resetQuestionsFrom(2);
    showQuestion(1);
  });

  // Q2 → Q3
  qs("#to-question-3")?.addEventListener("click", () => {
    const checked = qs('input[name="volume"]:checked');
    if (!checked) return alert("Kies een antwoord");
    showQuestion(3);
  });

  // Q3 → Q2
  qs("#back-to-question-2")?.addEventListener("click", () => {
    resetQuestionsFrom(3);
    showQuestion(2);
  });

  // Q3 → Q4
  qs("#to-question-4")?.addEventListener("click", () => {
    const checked = qs('input[name="aio"]:checked');
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
    const checked = qs('input[name="kleur"]:checked');
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
    const checked = qs('input[name="inkt"]:checked');
    if (!checked) return alert("Kies een antwoord");
    showQuestion(6);
  });

  // Q6 → Q5
  qs("#back-to-question-5")?.addEventListener("click", () => {
    resetQuestionsFrom(6);
    showQuestion(5);
  });

  // Vraag 6: "Geen extra wensen" sluit de overige opties uit en omgekeerd,
  // zelfde exclusiviteitspatroon als bij monitor/laptop.
  const geenCheckbox = qs('input[name="extra"][value="geen"]');
  const overigeExtraCheckboxes = qsa('input[name="extra"]:not([value="geen"])');
  geenCheckbox?.addEventListener("change", () => {
    if (geenCheckbox.checked) overigeExtraCheckboxes.forEach(cb => { cb.checked = false; });
  });
  overigeExtraCheckboxes.forEach(cb => {
    cb.addEventListener("change", () => {
      if (cb.checked && geenCheckbox) geenCheckbox.checked = false;
    });
  });

  // Q6 → Result
  qs("#start-matching")?.addEventListener("click", handleStartMatching);

  window.addEventListener("resize", () => {
    updatePrinterDisplay();
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
