document.addEventListener("DOMContentLoaded", () => {
  if (document.querySelector(".menu-bar")) {
    return;
  }

  const menuHtml = `
    <header class="menu-bar">
      <div class="menu-brand">
        <a href="index.html">producthulp.nl</a>
      </div>
      <nav class="menu-right" aria-label="Hoofdmenu">
        <div class="menu-texts">
          <a href="contact.html">Contact</a>
          <a href="over-producthulp.html">Over ons</a>
          <a href="hoe-werkt-het.html">Hoe werkt het?</a>
        </div>
        <div class="menu-search" role="search">
          <button
            class="menu-search-toggle"
            type="button"
            aria-expanded="false"
            aria-controls="menu-search-content"
          >
            <i data-lucide="search" class="menu-search-toggle-icon" aria-hidden="true"></i>
            <span class="sr-only">Open zoekveld</span>
          </button>
          <div class="menu-search-content" id="menu-search-content" aria-hidden="false">
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

  const menuSearch = document.querySelector(".menu-search");
  const toggleButton = menuSearch?.querySelector(".menu-search-toggle");
  const searchContent = menuSearch?.querySelector(".menu-search-content");
  const searchInput = menuSearch?.querySelector("input");
  const mobileQuery = window.matchMedia("(max-width: 640px)");

  const closeMobileSearch = () => {
    if (!menuSearch || !searchContent || !toggleButton) return;
    menuSearch.classList.remove("is-open");
    toggleButton.setAttribute("aria-expanded", "false");
    searchContent.setAttribute("aria-hidden", mobileQuery.matches ? "true" : "false");
  };

  const openMobileSearch = () => {
    if (!menuSearch || !searchContent || !toggleButton) return;
    menuSearch.classList.add("is-open");
    toggleButton.setAttribute("aria-expanded", "true");
    searchContent.setAttribute("aria-hidden", "false");
    window.requestAnimationFrame(() => searchInput?.focus());
  };

  const syncSearchMode = () => {
    if (!searchContent || !toggleButton) return;
    if (mobileQuery.matches) {
      searchContent.setAttribute("aria-hidden", menuSearch?.classList.contains("is-open") ? "false" : "true");
      return;
    }

    menuSearch?.classList.remove("is-open");
    toggleButton.setAttribute("aria-expanded", "false");
    searchContent.setAttribute("aria-hidden", "false");
  };

  toggleButton?.addEventListener("click", () => {
    if (!menuSearch) return;
    const willOpen = !menuSearch.classList.contains("is-open");
    if (willOpen) {
      openMobileSearch();
      return;
    }
    closeMobileSearch();
  });

  document.addEventListener("click", (event) => {
    if (!mobileQuery.matches || !menuSearch) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (menuSearch.contains(target)) return;
    closeMobileSearch();
  });

  document.addEventListener("keydown", (event) => {
    if (!mobileQuery.matches || !menuSearch) return;
    if (event.key === "Escape" && menuSearch.classList.contains("is-open")) {
      closeMobileSearch();
    }
  });

  if (typeof mobileQuery.addEventListener === "function") {
    mobileQuery.addEventListener("change", syncSearchMode);
  } else if (typeof mobileQuery.addListener === "function") {
    mobileQuery.addListener(syncSearchMode);
  }

  syncSearchMode();
});
