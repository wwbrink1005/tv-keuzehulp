import { getGpuTier } from "./data.js";
import { initLucideIcons } from "./icons.js";
import { initQuestionPopovers, initResultPopover } from "./popovers.js";
import { initQuizPage } from "./quiz.js";
import { initResultPage } from "./result.js";
import { getContainerScale } from "./utils.js";

// Expose getGpuTier for result-filters.js (loaded as non-module script)
window.__desktopData = { getGpuTier };

function updateContainerScales() {
  const containers = document.querySelectorAll(".background-container");
  containers.forEach(container => {
    const baseWidth = parseFloat(getComputedStyle(container).getPropertyValue("--base-width"));
    const resolvedBaseWidth = Number.isFinite(baseWidth) && baseWidth > 0 ? baseWidth : 1242.21;
    const scale = container.offsetWidth / resolvedBaseWidth;
    container.style.setProperty("--scale", String(Number.isFinite(scale) && scale > 0 ? scale : 1));
  });
}

function initResponsiveScaling() {
  updateContainerScales();

  const observer = new ResizeObserver(() => {
    requestAnimationFrame(updateContainerScales);
  });

  document.querySelectorAll(".background-container").forEach(el => {
    observer.observe(el);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initLucideIcons();
  initResponsiveScaling();
  initQuestionPopovers();
  initResultPopover();
  initQuizPage();
  initResultPage();

  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
});
