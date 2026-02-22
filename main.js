import { initLucideIcons } from "./icons.js";
import { initQuestionPopovers, initResultPopover } from "./popovers.js";
import { initQuizPage } from "./quiz.js";
import { initResultPage } from "./result.js";

const DEFAULT_BASE_WIDTH = 1242.21;

function getBaseWidth(container) {
  const style = getComputedStyle(container);
  const baseWidth = parseFloat(style.getPropertyValue("--base-width"));
  return Number.isFinite(baseWidth) && baseWidth > 0 ? baseWidth : DEFAULT_BASE_WIDTH;
}

function updateContainerScales() {
  let primaryScale = null;

  document.querySelectorAll(".background-container").forEach(container => {
    const baseWidth = getBaseWidth(container);
    const scale = container.offsetWidth / baseWidth;
    const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    container.style.setProperty("--scale", safeScale.toString());

    if (primaryScale === null && !container.classList.contains("extra-option-card")) {
      primaryScale = safeScale;
    }
  });

  if (primaryScale !== null) {
    document.documentElement.style.setProperty("--page-scale", primaryScale.toString());
  }
}

function initResponsiveScaling() {
  const applyUpdate = () => requestAnimationFrame(updateContainerScales);

  applyUpdate();

  window.addEventListener("resize", applyUpdate);

  if (typeof MutationObserver === "function") {
    const observer = new MutationObserver(applyUpdate);
    observer.observe(document.body, { childList: true, subtree: true });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initResponsiveScaling();
  initLucideIcons();
  initQuestionPopovers();
  initResultPopover();
  initQuizPage();
  initResultPage();
});
