import { getContainerScale, qs, qsa } from "./utils.js";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function initQuestionPopovers() {
  if (!qs(".question-info-icon")) return;

  const infoPanel      = qs("#info-panel");
  const panelTitle     = qs("#info-panel-title");
  const panelText      = qs("#info-panel-text");
  const panelImg       = qs("#info-panel-img");
  const panelClose     = qs("#info-panel-close");
  const questionsPanel = qs(".questions-panel");

  // Track which icon is currently active so we can toggle
  let activeIcon = null;

  function lockBodyScroll() {
    if (window.innerWidth <= 900) {
      document.body.style.overflow = "hidden";
      document.body.style.touchAction = "none";
    }
  }

  function unlockBodyScroll() {
    document.body.style.overflow = "";
    document.body.style.touchAction = "";
  }

  function openPanel(icon, popover) {
    if (!infoPanel || !popover) return;

    const title = popover.querySelector(".question-popover-title")?.textContent.trim() ?? "";
    const text  = popover.querySelector(".question-popover-text")?.textContent.trim()  ?? "";

    if (panelTitle) panelTitle.textContent = title;
    if (panelText)  panelText.textContent  = text;

    // Show or hide the optional image (used for e.g. ambilight in Q8)
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

    // Animate icon to active state
    if (activeIcon && activeIcon !== icon) {
      activeIcon.classList.remove("info-icon-active");
    }
    icon.classList.add("info-icon-active");
    activeIcon = icon;

    infoPanel.classList.add("is-open");
    if (questionsPanel) questionsPanel.classList.add("panel-open");
    lockBodyScroll();
  }

  function closePanel() {
    if (!infoPanel) return;
    infoPanel.classList.remove("is-open");
    if (questionsPanel) questionsPanel.classList.remove("panel-open");
    if (activeIcon) {
      activeIcon.classList.remove("info-icon-active");
      activeIcon = null;
    }
    unlockBodyScroll();
  }

  if (panelClose) {
    panelClose.addEventListener("click", (e) => {
      e.stopPropagation();
      closePanel();
    });
  }

  // ── Mobile drag-to-close (bottom sheet) ──
  let dragStartY = 0;
  let currentDragY = 0;
  let isDragging = false;

  function onDragStart(e) {
    if (window.innerWidth > 900) return;
    if (!infoPanel?.classList.contains("is-open")) return;
    dragStartY = e.touches[0].clientY;
    currentDragY = 0;
    isDragging = true;
    infoPanel.style.transition = "none";
  }

  function onDragMove(e) {
    if (!isDragging) return;
    const dy = e.touches[0].clientY - dragStartY;
    if (dy < 0) return; // don't allow dragging upward
    e.preventDefault(); // block page scroll while dragging panel
    currentDragY = dy;
    infoPanel.style.transform = `translateY(${dy}px)`;
  }

  function onDragEnd() {
    if (!isDragging) return;
    isDragging = false;
    if (currentDragY > 120) {
      // Animate the rest of the way off screen, then close cleanly
      infoPanel.style.transition = "transform 0.28s ease";
      infoPanel.style.transform = "translateY(104%)";
      setTimeout(() => {
        closePanel(); // removes is-open → CSS holds translateY(104%)
        infoPanel.style.transition = "";
        infoPanel.style.transform = "";
      }, 280);
    } else {
      // Snap back to open position
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
    const infoIcon = e.target.closest(".question-info-icon");

    if (infoIcon) {
      e.stopPropagation();

      // Toggle: clicking the same icon closes the panel
      if (infoPanel?.classList.contains("is-open") && activeIcon === infoIcon) {
        closePanel();
        return;
      }

      const questionContainer = infoIcon.closest(".question-container");
      const popover = questionContainer?.querySelector(".question-popover");
      openPanel(infoIcon, popover);
      return;
    }

    // Click outside panel → close
    if (infoPanel?.classList.contains("is-open") && !infoPanel.contains(e.target)) {
      closePanel();
    }
  });
}

function positionResultPopover(infoIcon, popover) {
  const container = infoIcon.closest(".background-container");
  if (!container) return;

  const scale = getContainerScale(infoIcon);
  const horizontalGap = 10 * scale;
  const padding = 8 * scale;

  const iconRect = infoIcon.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();

  const popoverWidth = popover.offsetWidth;
  const popoverHeight = popover.offsetHeight;

  const desiredLeft = iconRect.right - containerRect.left + horizontalGap;
  const desiredTop = iconRect.top - containerRect.top;

  const viewportLeft = containerRect.left + desiredLeft;
  const viewportTop = containerRect.top + desiredTop;

  const clampedViewportLeft = clamp(viewportLeft, padding, window.innerWidth - popoverWidth - padding);
  const clampedViewportTop = clamp(viewportTop, padding, window.innerHeight - popoverHeight - padding);

  popover.style.left = `${clampedViewportLeft - containerRect.left}px`;
  popover.style.top = `${clampedViewportTop - containerRect.top}px`;
}

function updateResultPopoverSize(popover) {
  if (!popover) return;
  const width = popover.offsetWidth;
  const height = popover.offsetHeight;
  popover.style.setProperty("--popover-width", `${width}px`);
  popover.style.setProperty("--popover-height", `${height}px`);
}

export function initResultPopover() {
  if (!qs(".result-info-icon")) return;

  document.addEventListener("click", function(e) {
    const infoIcon = e.target.closest(".result-info-icon");
    const popover = qs("#result-popover");

    if (infoIcon && popover) {
      e.stopPropagation();
      popover.classList.toggle("active");
      if (popover.classList.contains("active")) {
        requestAnimationFrame(() => {
          updateResultPopoverSize(popover);
          positionResultPopover(infoIcon, popover);
        });
      }
      return;
    }

    if (popover && popover.classList.contains("active")) {
      if (!popover.contains(e.target)) {
        popover.classList.remove("active");
      }
    }
  });

  window.addEventListener("resize", function() {
    const popover = qs("#result-popover");
    const infoIcon = qs(".result-info-icon");

    if (popover && popover.classList.contains("active") && infoIcon) {
      positionResultPopover(infoIcon, popover);
      updateResultPopoverSize(popover);
    }
  });

  window.addEventListener("scroll", function() {
    const popover = qs("#result-popover");
    const infoIcon = qs(".result-info-icon");

    if (popover && popover.classList.contains("active") && infoIcon) {
      positionResultPopover(infoIcon, popover);
      updateResultPopoverSize(popover);
    }
  });
}
