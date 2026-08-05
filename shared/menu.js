document.addEventListener("DOMContentLoaded", () => {
  if (document.querySelector(".menu-bar")) {
    return;
  }

  const menuHtml = `
    <header class="menu-bar" role="banner">

      <!-- Brand -->
      <div class="menu-brand">
        <a href="./" aria-label="producthulp.nl homepage">
          <img
            src="logo's/logo.svg"
            alt="producthulp.nl"
            class="menu-logo"
            height="44"
          />
        </a>
      </div>

      <!-- Desktop nav links -->
      <div class="menu-desktop-links" id="menuDesktopLinks">
        <div class="menu-dropdown-trigger" id="desktopCatTrigger">
          <button class="menu-link menu-cat-btn" type="button" aria-expanded="false" id="desktopCatBtn">
            Categorieën
            <svg class="menu-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div class="menu-dropdown" id="desktopCatDropdown" role="dialog" aria-label="Alle categorieën">
            <div class="menu-dropdown-grid">
              <div class="menu-dropdown-col">
                <h4>Beeld, Geluid &amp; Foto</h4>
                <ul>
                  <li><a href="keuzehulpen/tv/vragen">Televisies <svg class="cat-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg></a></li>
                  <li><span>Soundbars <svg class="cat-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg></span></li>
                  <li><span>Camera's <svg class="cat-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg></span></li>
                  <li><span>Fototoestellen <svg class="cat-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg></span></li>
                </ul>
              </div>
              <div class="menu-dropdown-col">
                <h4>Huishoudelijke Apparaten</h4>
                <ul>
                  <li><a href="keuzehulpen/koelkast/vragen">Koelkasten <svg class="cat-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg></a></li>
                  <li><a href="keuzehulpen/wasmachine/vragen">Wasmachines <svg class="cat-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg></a></li>
                  <li><span>Koffiemachines <svg class="cat-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg></span></li>
                  <li><span>Vaatwassers <svg class="cat-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg></span></li>
                  <li><span>Stofzuigers <svg class="cat-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg></span></li>
                </ul>
              </div>
              <div class="menu-dropdown-col">
                <h4>Computer &amp; Telefonie</h4>
                <ul>
                  <li><a href="keuzehulpen/laptop/vragen">Laptops <svg class="cat-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg></a></li>
                  <li><a href="keuzehulpen/desktop/vragen">Desktops <svg class="cat-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg></a></li>
                  <li><a href="keuzehulpen/monitor/vragen">Monitoren <svg class="cat-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg></a></li>
                  <li><span>Smartphones <svg class="cat-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg></span></li>
                  <li><span>Tablets <svg class="cat-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg></span></li>
                  <li><a href="keuzehulpen/printer/vragen">Printers <svg class="cat-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg></a></li>
                </ul>
              </div>
              <div class="menu-dropdown-col">
                <h4>Buiten &amp; Tuin</h4>
                <ul>
                  <li><span>E-bikes <svg class="cat-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg></span></li>
                  <li><span>Barbecues <svg class="cat-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg></span></li>
                  <li><span>Grasmaaiers <svg class="cat-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg></span></li>
                </ul>
              </div>
            </div>
          </div>
        </div>
        <a class="menu-link" href="blog/">Blogs</a>
        <a class="menu-link" href="overige-paginas/over-ons">Over ons</a>
      </div>

      <!-- Hamburger (always visible) -->
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
        <a class="mobile-brand" href="./">
          <img src="logo's/logo.svg" alt="producthulp.nl" class="menu-logo" />
        </a>
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
          <div class="landing-search-dropdown" aria-hidden="true">
            <div class="landing-search-dropdown-header">keuzehulpen</div>
            <ul class="landing-search-results" role="listbox"></ul>
            <div class="landing-search-dropdown-footer"></div>
          </div>
        </div>
      </div>

      <div class="mobile-nav-links">
        <a class="mobile-nav-link" href="./">Home</a>

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
              <li><a href="keuzehulpen/tv/vragen">Televisies <i data-lucide="chevron-right" class="cat-chevron" aria-hidden="true"></i></a></li>
              <li><span>Soundbars</span></li>
              <li><span>Fototoestellen</span></li>
            </ul>
          </div>
          <div class="mobile-cat-group">
            <h4>Huishoudelijke Apparaten</h4>
            <ul>
              <li><a href="keuzehulpen/koelkast/vragen">Koelkasten <i data-lucide="chevron-right" class="cat-chevron" aria-hidden="true"></i></a></li>
              <li><a href="keuzehulpen/wasmachine/vragen">Wasmachines <i data-lucide="chevron-right" class="cat-chevron" aria-hidden="true"></i></a></li>
              <li><span>Koffiemachines</span></li>
              <li><span>Vaatwassers</span></li>
              <li><span>Stofzuigers</span></li>
            </ul>
          </div>
          <div class="mobile-cat-group">
            <h4>Computer &amp; Telefonie</h4>
            <ul>
              <li><a href="keuzehulpen/laptop/vragen">Laptop <i data-lucide="chevron-right" class="cat-chevron" aria-hidden="true"></i></a></li>
              <li><a href="keuzehulpen/desktop/vragen">Desktop <i data-lucide="chevron-right" class="cat-chevron" aria-hidden="true"></i></a></li>
              <li><a href="keuzehulpen/monitor/vragen">Monitor <i data-lucide="chevron-right" class="cat-chevron" aria-hidden="true"></i></a></li>
              <li><span>Smartphone</span></li>
              <li><span>Tablets</span></li>
              <li><a href="keuzehulpen/printer/vragen">Printers <i data-lucide="chevron-right" class="cat-chevron" aria-hidden="true"></i></a></li>
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

        <a class="mobile-nav-link" href="blog/">Blogs</a>
        <a class="mobile-nav-link" href="overige-paginas/hoe-werkt-het">Hoe werkt het?</a>
        <a class="mobile-nav-link" href="overige-paginas/over-ons">Over ons</a>
      </div>

      <div class="mobile-nav-footer">
        <a href="overige-paginas/contact">Contact</a>
        <a href="overige-paginas/disclaimer">Disclaimer</a>
        <a href="overige-paginas/privacy">Privacybeleid</a>
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

  /* ── Desktop categories dropdown ── */
  const desktopCatBtn = document.getElementById("desktopCatBtn");
  const desktopCatTrigger = document.getElementById("desktopCatTrigger");
  const desktopCatDropdown = document.getElementById("desktopCatDropdown");

  desktopCatBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = desktopCatTrigger?.classList.contains("is-open");
    if (isOpen) {
      desktopCatTrigger?.classList.remove("is-open");
      desktopCatBtn.setAttribute("aria-expanded", "false");
    } else {
      desktopCatTrigger?.classList.add("is-open");
      desktopCatBtn.setAttribute("aria-expanded", "true");
    }
  });

  /* ── Close on outside click / Escape ── */
  document.addEventListener("click", (e) => {
    if (!desktopCatTrigger?.contains(e.target)) {
      desktopCatTrigger?.classList.remove("is-open");
      desktopCatBtn?.setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeMobileMenu();
    }
  });
});

