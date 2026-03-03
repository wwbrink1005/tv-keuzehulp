document.addEventListener("DOMContentLoaded", () => {
  if (document.querySelector(".menu-bar")) {
    return;
  }

  const menuHtml = `
    <header class="menu-bar" role="banner">

      <!-- Brand -->
      <div class="menu-brand">
        <a href="index.html">producthulp.nl</a>
      </div>

      <!-- Center nav (desktop) -->
      <nav class="menu-nav" aria-label="Hoofdmenu">
        <a class="menu-link" href="index.html">Home</a>

        <!-- Categorieën dropdown -->
        <div class="menu-dropdown-trigger" id="categoriesDropdownTrigger">
          <button
            class="menu-link menu-link--dropdown"
            type="button"
            aria-haspopup="true"
            aria-expanded="false"
            aria-controls="categoriesDropdown"
            id="categoriesBtn"
          >
            Categorieën
            <i data-lucide="chevron-down" class="menu-chevron" aria-hidden="true"></i>
          </button>

          <div
            id="categoriesDropdown"
            class="menu-dropdown"
            role="dialog"
            aria-hidden="true"
          >
            <div class="menu-dropdown-grid">
              <div class="menu-dropdown-col">
                <h4>Beeld, Geluid &amp; Foto</h4>
                <ul>
                  <li>
                    <a href="vragen.html">
                      Televisies
                      <i data-lucide="chevron-right" class="cat-chevron" aria-hidden="true"></i>
                    </a>
                  </li>
                  <li>
                    <span>
                      Soundbars
                      <span class="menu-dropdown-badge">binnenkort</span>
                    </span>
                  </li>
                  <li>
                    <span>
                      Fototoestellen
                      <span class="menu-dropdown-badge">binnenkort</span>
                    </span>
                  </li>
                </ul>
              </div>
              <div class="menu-dropdown-col">
                <h4>Huishoudelijke Apparaten</h4>
                <ul>
                  <li><span>Koelkasten <span class="menu-dropdown-badge">binnenkort</span></span></li>
                  <li><span>Wasmachines <span class="menu-dropdown-badge">binnenkort</span></span></li>
                  <li><span>Koffiemachines <span class="menu-dropdown-badge">binnenkort</span></span></li>
                  <li><span>Vaatwassers <span class="menu-dropdown-badge">binnenkort</span></span></li>
                  <li><span>Stofzuigers <span class="menu-dropdown-badge">binnenkort</span></span></li>
                </ul>
              </div>
              <div class="menu-dropdown-col">
                <h4>Computer &amp; Telefonie</h4>
                <ul>
                  <li><span>Laptop <span class="menu-dropdown-badge">binnenkort</span></span></li>
                  <li><span>Smartphone <span class="menu-dropdown-badge">binnenkort</span></span></li>
                  <li><span>Tablets <span class="menu-dropdown-badge">binnenkort</span></span></li>
                </ul>
                <h4 style="margin-top:16px;">Buiten &amp; Tuin</h4>
                <ul>
                  <li><span>Barbecues <span class="menu-dropdown-badge">binnenkort</span></span></li>
                  <li><span>Grasmaaiers <span class="menu-dropdown-badge">binnenkort</span></span></li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <a class="menu-link" href="hoe-werkt-het.html">Hoe werkt het?</a>
        <a class="menu-link" href="over-producthulp.html">Over ons</a>
      </nav>

      <!-- Right side (desktop) -->
      <div class="menu-right">
        <div class="menu-search" id="menuSearch" role="search">
          <div class="landing-search" id="desktopLandingSearch">
            <i data-lucide="search" class="search-icon" aria-hidden="true"></i>
            <input
              type="text"
              placeholder="Zoek een keuzehulp…"
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
        <a class="menu-contact-btn" href="contact.html">Contact</a>
      </div>

      <!-- Hamburger (mobile) -->
      <button
        class="menu-hamburger"
        type="button"
        aria-expanded="false"
        aria-controls="mobileNav"
        aria-label="Menu openen"
        id="menuHamburger"
      >
        <i data-lucide="menu" aria-hidden="true"></i>
      </button>
    </header>

    <!-- Mobile overlay -->
    <div class="mobile-nav-overlay" id="mobileNavOverlay" aria-hidden="true"></div>

    <!-- Mobile drawer -->
    <nav
      class="mobile-nav"
      id="mobileNav"
      aria-label="Mobiel menu"
      aria-hidden="true"
    >
      <div class="mobile-nav-header">
        <a class="mobile-brand" href="index.html">producthulp.nl</a>
        <button
          class="mobile-nav-close"
          type="button"
          aria-label="Menu sluiten"
          id="mobileNavClose"
        >
          <i data-lucide="x" aria-hidden="true"></i>
        </button>
      </div>

      <!-- Mobile search -->
      <div class="mobile-nav-search">
        <div class="landing-search" id="mobileLandingSearch">
          <i data-lucide="search" class="search-icon" aria-hidden="true"></i>
          <input
            type="text"
            placeholder="Zoek een keuzehulp…"
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

      <div class="mobile-nav-links">
        <a class="mobile-nav-link" href="index.html">Home</a>

        <!-- Mobile categories accordion -->
        <button
          class="mobile-nav-link mobile-categories-trigger"
          type="button"
          aria-expanded="false"
          id="mobileCategoriesBtn"
        >
          Categorieën
          <i data-lucide="chevron-down" aria-hidden="true"></i>
        </button>
        <div class="mobile-categories-panel" id="mobileCategoriesPanel">
          <div class="mobile-cat-group">
            <h4>Beeld, Geluid &amp; Foto</h4>
            <ul>
              <li><a href="vragen.html">Televisies <i data-lucide="chevron-right" class="cat-chevron" aria-hidden="true"></i></a></li>
              <li><span>Soundbars</span></li>
              <li><span>Fototoestellen</span></li>
            </ul>
          </div>
          <div class="mobile-cat-group">
            <h4>Huishoudelijke Apparaten</h4>
            <ul>
              <li><span>Koelkasten</span></li>
              <li><span>Wasmachines</span></li>
              <li><span>Koffiemachines</span></li>
              <li><span>Vaatwassers</span></li>
              <li><span>Stofzuigers</span></li>
            </ul>
          </div>
          <div class="mobile-cat-group">
            <h4>Computer &amp; Telefonie</h4>
            <ul>
              <li><span>Laptop</span></li>
              <li><span>Smartphone</span></li>
              <li><span>Tablets</span></li>
            </ul>
          </div>
          <div class="mobile-cat-group">
            <h4>Buiten &amp; Tuin</h4>
            <ul>
              <li><span>Barbecues</span></li>
              <li><span>Grasmaaiers</span></li>
            </ul>
          </div>
        </div>

        <a class="mobile-nav-link" href="hoe-werkt-het.html">Hoe werkt het?</a>
        <a class="mobile-nav-link" href="over-producthulp.html">Over ons</a>
      </div>

      <div class="mobile-nav-footer">
        <a href="contact.html">Contact</a>
        <a href="disclaimer.html">Disclaimer</a>
        <a href="privacy.html">Privacybeleid</a>
      </div>
    </nav>
  `;

  document.body.insertAdjacentHTML("afterbegin", menuHtml);
  document.body.classList.add("has-menu");

  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }

  // Load zoekbalk.js for search functionality
  if (!document.querySelector('script[src$="zoekbalk.js"]')) {
    const script = document.createElement("script");
    const menuScript = document.querySelector('script[src$="menu.js"]');
    const menuSrc = menuScript?.getAttribute("src");
    script.src = menuSrc
      ? menuSrc.replace(/menu\.js(?:\?.*)?$/, "zoekbalk.js")
      : "zoekbalk.js";
    script.defer = true;
    document.body.appendChild(script);
  }

  /* ── Categories dropdown (desktop) ── */
  const categoriesTrigger = document.getElementById("categoriesDropdownTrigger");
  const categoriesBtn = document.getElementById("categoriesBtn");
  const categoriesDropdown = document.getElementById("categoriesDropdown");

  const openCategories = () => {
    if (!categoriesTrigger || !categoriesDropdown || !categoriesBtn) return;
    categoriesTrigger.classList.add("is-open");
    categoriesBtn.setAttribute("aria-expanded", "true");
    categoriesDropdown.setAttribute("aria-hidden", "false");
  };

  const closeCategories = () => {
    if (!categoriesTrigger || !categoriesDropdown || !categoriesBtn) return;
    categoriesTrigger.classList.remove("is-open");
    categoriesBtn.setAttribute("aria-expanded", "false");
    categoriesDropdown.setAttribute("aria-hidden", "true");
  };

  categoriesBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = categoriesTrigger?.classList.contains("is-open");
    if (isOpen) {
      closeCategories();
    } else {
      openCategories();
    }
  });

  /* ── Mobile menu ── */
  const hamburger = document.getElementById("menuHamburger");
  const mobileNav = document.getElementById("mobileNav");
  const mobileOverlay = document.getElementById("mobileNavOverlay");
  const mobileClose = document.getElementById("mobileNavClose");

  const openMobileMenu = () => {
    if (!mobileNav || !mobileOverlay || !hamburger) return;
    mobileNav.classList.add("is-open");
    mobileNav.setAttribute("aria-hidden", "false");
    mobileOverlay.classList.add("is-visible");
    mobileOverlay.setAttribute("aria-hidden", "false");
    hamburger.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
  };

  const closeMobileMenu = () => {
    if (!mobileNav || !mobileOverlay || !hamburger) return;
    mobileNav.classList.remove("is-open");
    mobileNav.setAttribute("aria-hidden", "true");
    mobileOverlay.classList.remove("is-visible");
    mobileOverlay.setAttribute("aria-hidden", "true");
    hamburger.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  };

  hamburger?.addEventListener("click", openMobileMenu);
  mobileClose?.addEventListener("click", closeMobileMenu);
  mobileOverlay?.addEventListener("click", closeMobileMenu);

  /* ── Mobile categories accordion ── */
  const mobileCategoriesBtn = document.getElementById("mobileCategoriesBtn");
  const mobileCategoriesPanel = document.getElementById("mobileCategoriesPanel");

  mobileCategoriesBtn?.addEventListener("click", () => {
    const isOpen = mobileCategoriesPanel?.classList.contains("is-open");
    if (isOpen) {
      mobileCategoriesPanel?.classList.remove("is-open");
      mobileCategoriesBtn.setAttribute("aria-expanded", "false");
      const chevron = mobileCategoriesBtn.querySelector("svg");
      chevron?.classList.remove("is-open");
    } else {
      mobileCategoriesPanel?.classList.add("is-open");
      mobileCategoriesBtn.setAttribute("aria-expanded", "true");
      const chevron = mobileCategoriesBtn.querySelector("svg");
      chevron?.classList.add("is-open");
    }
  });

  /* ── Close on outside click / Escape ── */
  document.addEventListener("click", (e) => {
    if (
      categoriesTrigger &&
      !categoriesTrigger.contains(e.target) &&
      categoriesTrigger.classList.contains("is-open")
    ) {
      closeCategories();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeCategories();
      closeMobileMenu();
    }
  });
});

