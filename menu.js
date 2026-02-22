document.addEventListener("DOMContentLoaded", () => {
  if (document.querySelector(".menu-bar")) {
    return;
  }

  const menuHtml = `
    <header class="menu-bar">
      <div class="menu-brand">
        <a href="../Algemene%20website/landingspagina.html">producthulp.nl</a>
      </div>
      <nav class="menu-right" aria-label="Hoofdmenu">
        <div class="menu-texts">
          <a href="../Algemene%20website/contact.html">Contact</a>
          <a href="../Algemene%20website/over-producthulp.html">Over ons</a>
          <a href="../Algemene%20website/hoe-werkt-het.html">Hoe werkt het?</a>
        </div>
        <div class="menu-search" role="search">
          <div class="landing-search">
            <i data-lucide="search" class="search-icon" aria-hidden="true"></i>
            <input
              type="text"
              placeholder="Zoek naar een keuzehulp"
              aria-label="Zoek naar een keuzehulp"
            />
            <i data-lucide="x" class="search-clear" aria-hidden="true"></i>
            <div class="landing-search-dropdown" aria-hidden="true">
              <div class="landing-search-dropdown-header">keuzehulpen</div>
              <ul class="landing-search-results" role="listbox"></ul>
              <div class="landing-search-dropdown-footer"></div>
            </div>
          </div>
        </div>
      </nav>
    </header>
  `;

  document.body.insertAdjacentHTML("afterbegin", menuHtml);
  document.body.classList.add("has-menu");

  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }

  if (!document.querySelector('script[src$="zoekbalk.js"]')) {
    const script = document.createElement("script");
    const menuScript = document.querySelector('script[src$="menu.js"]');
    const menuSrc = menuScript?.getAttribute("src");
    const fallbackSrc = "zoekbalk.js";

    script.src = menuSrc ? menuSrc.replace(/menu\.js(?:\?.*)?$/, "zoekbalk.js") : fallbackSrc;
    script.defer = true;
    document.body.appendChild(script);
  }
});
