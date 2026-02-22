export function initLucideIcons() {
  if (typeof window.lucide === "undefined") return;

  const iconElements = document.querySelectorAll("svg[data-icon]");

  iconElements.forEach(svg => {
    const iconName = svg.getAttribute("data-icon");

    const temp = document.createElement("div");
    temp.innerHTML = `<svg data-lucide="${iconName}"></svg>`;

    const renderedSvg = temp.querySelector("svg");

    ["viewBox", "fill", "stroke", "stroke-linecap", "stroke-linejoin", "class"].forEach(attr => {
      if (svg.hasAttribute(attr)) {
        renderedSvg.setAttribute(attr, svg.getAttribute(attr));
      }
    });

    svg.parentNode.replaceChild(renderedSvg, svg);
  });

  window.lucide.createIcons();
}
