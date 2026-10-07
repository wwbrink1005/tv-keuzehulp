import { initLucideIcons } from "./icons.js";
import { initResultPage } from "./result.js";
import { initFilters } from "./result-filters.js";

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

    if (primaryScale === null) {
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

// Start zodra de DOM klaar is, ook als dat moment al voorbij is: in de
// B2B-embed wacht shared/klant.js eerst op de klantinstellingen (top-level
// await), waardoor deze module pas ná DOMContentLoaded draait.
function start(fn) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
  else fn();
}

start(() => {
  initResponsiveScaling();
  initLucideIcons();
  initResultPage();
  initFilters();
});
