document.addEventListener("DOMContentLoaded", () => {
  if (document.querySelector(".landing-footer")) {
    return;
  }

  const year = new Date().getFullYear();

  const footerHtml = `
    <footer class="landing-footer" aria-label="Footer">

      <!-- Main grid -->
      <div class="footer-inner">

        <!-- Brand column -->
        <div class="footer-brand-col">
          <a class="footer-logo" href="./">
            <img src="logo's/logo.svg" alt="producthulp.nl" class="footer-logo-img" />
          </a>
          <p class="footer-tagline">Onafhankelijk productadvies, altijd gratis en altijd eerlijk.</p>
          <span class="footer-badge">
            <span class="footer-badge-dot"></span>
            100% onafhankelijk
          </span>
        </div>

        <!-- Keuzehulpen column -->
        <div class="footer-col">
          <h3 class="footer-col-title">Keuzehulpen</h3>
          <ul>
            <li>
              <a href="tv/vragen">Televisies</a>
            </li>
            <li>
              <a href="laptop/vragen">Laptops</a>
            </li>
            <li>
              <a href="monitor/vragen">Monitoren</a>
            </li>
            <li>
              <a href="desktop/vragen">Desktops</a>
            </li>
            <li>
              <a href="wasmachine/vragen">Wasmachines</a>
            </li>
            <li>
              <a href="koelkast/vragen">Koelkasten</a>
            </li>
          </ul>
        </div>

        <!-- Informatie column -->
        <div class="footer-col">
          <h3 class="footer-col-title">Informatie</h3>
          <ul>
            <li><a href="blog/">Blogs</a></li>
            <li><a href="over-ons">Over ons</a></li>
            <li><a href="hoe-werkt-het">Hoe werkt het?</a></li>
            <li><a href="contact">Contact</a></li>
          </ul>
        </div>

        <!-- Juridisch column -->
        <div class="footer-col">
          <h3 class="footer-col-title">Juridisch</h3>
          <ul>
            <li><a href="disclaimer">Disclaimer</a></li>
            <li><a href="privacy">Privacybeleid</a></li>
          </ul>
        </div>

      </div>

      <!-- Bottom bar -->
      <div class="footer-bottom">
        <p class="footer-bottom-left">&copy; ${year} producthulp.nl &mdash; Alle rechten voorbehouden</p>
        <div class="footer-bottom-right">
          <a href="disclaimer">Disclaimer</a>
          <a href="privacy">Privacy</a>
          <a href="contact">Contact</a>
        </div>
      </div>

    </footer>
  `;

  const main = document.querySelector("main");
  if (main) {
    main.insertAdjacentHTML("afterend", footerHtml);
    return;
  }

  document.body.insertAdjacentHTML("beforeend", footerHtml);
});

