import { getContainerScale, qs, qsa } from "./utils.js";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function positionPopover(infoIcon, popover) {
  const questionContainer = infoIcon.closest(".question-container");
  if (!questionContainer) return;

  const scale = getContainerScale(infoIcon);
  const horizontalGap = 10 * scale;
  const padding = 8 * scale;

  const iconRect = infoIcon.getBoundingClientRect();
  const questionRect = questionContainer.getBoundingClientRect();

  const popoverWidth = popover.offsetWidth;
  const popoverHeight = popover.offsetHeight;

  const desiredLeft = iconRect.right - questionRect.left + horizontalGap;
  const desiredTop = iconRect.top - questionRect.top;

  const viewportLeft = questionRect.left + desiredLeft;
  const viewportTop = questionRect.top + desiredTop;

  const clampedViewportLeft = clamp(viewportLeft, padding, window.innerWidth - popoverWidth - padding);
  const clampedViewportTop = clamp(viewportTop, padding, window.innerHeight - popoverHeight - padding);

  popover.style.left = `${clampedViewportLeft - questionRect.left}px`;
  popover.style.top = `${clampedViewportTop - questionRect.top}px`;
}

export function initQuestionPopovers() {
  if (!qs(".question-info-icon")) return;

  document.addEventListener("click", function(e) {
    const infoIcon = e.target.closest(".question-info-icon");

    if (infoIcon) {
      e.stopPropagation();

      const questionContainer = infoIcon.closest(".question-container");
      const popover = questionContainer?.querySelector(".question-popover");

      if (popover) {
        qsa(".question-popover.active").forEach(otherPopover => {
          if (otherPopover !== popover) {
            otherPopover.classList.remove("active");
          }
        });

        popover.classList.toggle("active");
        if (popover.classList.contains("active")) {
          requestAnimationFrame(() => positionPopover(infoIcon, popover));
        }
      }
      return;
    }

    const popovers = qsa(".question-popover.active");
    popovers.forEach(popover => {
      if (!popover.contains(e.target)) {
        popover.classList.remove("active");
      }
    });
  });

  window.addEventListener("resize", function() {
    qsa(".question-popover.active").forEach(popover => {
      const questionContainer = popover.closest(".question-container");
      const infoIcon = questionContainer?.querySelector(".question-info-icon");
      if (infoIcon) {
        positionPopover(infoIcon, popover);
      }
    });
  });

  window.addEventListener("scroll", function() {
    qsa(".question-popover.active").forEach(popover => {
      const questionContainer = popover.closest(".question-container");
      const infoIcon = questionContainer?.querySelector(".question-info-icon");
      if (infoIcon) {
        positionPopover(infoIcon, popover);
      }
    });
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
