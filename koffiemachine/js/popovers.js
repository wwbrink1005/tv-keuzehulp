import { getContainerScale, qs, qsa } from "./utils.js";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function initQuestionPopovers() {
  if (!qs(".question-hint-btn") && !qs(".question-hint-btn-mobile")) return;

  const infoPanel      = qs("#info-panel");
  const panelTitle     = qs("#info-panel-title");
  const panelText      = qs("#info-panel-text");
  const panelImg       = qs("#info-panel-img");
  const panelClose     = qs("#info-panel-close");
  const questionsPanel = qs(".questions-panel");
  const hintBtn        = qs("#question-hint-btn");
  const hintBtnMobile  = qs("#question-hint-btn-mobile");

  function openPanel(popover) {
    if (!infoPanel || !popover) return;

    const title = popover.querySelector(".question-popover-title")?.textContent.trim() ?? "";
    const text  = popover.querySelector(".question-popover-text")?.textContent.trim()  ?? "";

    if (panelTitle) panelTitle.textContent = title;
    if (panelText)  panelText.textContent  = text;

    const imgEl = popover.querySelector(".question-popover-img");
    if (panelImg) {
      if (imgEl) {
        panelImg.src   = imgEl.src;
        panelImg.alt   = imgEl.alt;
        panelImg.style.display = "block";
      } else {
        panelImg.style.display = "none";
        panelImg.src = "";
      }
    }

    hintBtn?.classList.add("hint-btn-active");
    hintBtnMobile?.classList.add("hint-btn-active");

    infoPanel.classList.add("is-open");
    if (questionsPanel) questionsPanel.classList.add("panel-open");
  }

  function closePanel() {
    if (!infoPanel) return;
    infoPanel.classList.remove("is-open");
    if (questionsPanel) questionsPanel.classList.remove("panel-open");
    hintBtn?.classList.remove("hint-btn-active");
    hintBtnMobile?.classList.remove("hint-btn-active");
  }

  if (panelClose) {
    panelClose.addEventListener("click", (e) => {
      e.stopPropagation();
      closePanel();
    });
  }

  // Mobile drag-to-close
  let dragStartY = 0;
  let currentDragY = 0;
  let isDragging = false;

  function onDragStart(e) {
    if (window.innerWidth > 900) return;
    if (!infoPanel?.classList.contains("is-open")) return;
    const panelBody = infoPanel.querySelector(".info-panel-body");
    if (panelBody?.contains(e.target) && panelBody.scrollHeight > panelBody.clientHeight) return;
    dragStartY = e.touches[0].clientY;
    currentDragY = 0;
    isDragging = true;
    infoPanel.style.transition = "none";
  }

  function onDragMove(e) {
    if (!isDragging) return;
    const dy = e.touches[0].clientY - dragStartY;
    if (dy < 0) return;
    e.preventDefault();
    currentDragY = dy;
    infoPanel.style.transform = `translateY(${dy}px)`;
  }

  function onDragEnd() {
    if (!isDragging) return;
    isDragging = false;
    if (currentDragY > 120) {
      infoPanel.style.transition = "transform 0.28s ease";
      infoPanel.style.transform = "translateY(104%)";
      setTimeout(() => {
        closePanel();
        infoPanel.style.transition = "";
        infoPanel.style.transform = "";
      }, 280);
    } else {
      infoPanel.style.transition = "transform 0.3s cubic-bezier(.4,0,.2,1)";
      infoPanel.style.transform = "";
      setTimeout(() => { infoPanel.style.transition = ""; }, 300);
    }
  }

  if (infoPanel) {
    infoPanel.addEventListener("touchstart", onDragStart, { passive: true });
    infoPanel.addEventListener("touchmove", onDragMove, { passive: false });
    infoPanel.addEventListener("touchend", onDragEnd);
  }

  document.addEventListener("click", function(e) {
    const isHintBtn = e.target.closest(".question-hint-btn") ||
                      e.target.closest(".question-hint-btn-mobile");

    if (isHintBtn) {
      e.stopPropagation();
      if (infoPanel?.classList.contains("is-open")) {
        closePanel();
        return;
      }
      const activeBlock = qs(".question-block.is-active");
      const popover = activeBlock?.querySelector(".question-popover");
      openPanel(popover);
      return;
    }

    if (infoPanel?.classList.contains("is-open") && !infoPanel.contains(e.target)) {
      closePanel();
    }
  });
}

export function initResultPopover() {
  // No result popover in koffiemachine version
}
