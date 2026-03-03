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
          <a class="footer-logo" href="index.html">producthulp.nl</a>
          <p class="footer-tagline">Onafhankelijk productadvies — altijd gratis, altijd eerlijk.</p>
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
              <a href="vragen.html" class="footer-link-active">Televisies</a>
            </li>
            <li><span class="footer-soon">Soundbars <span class="footer-soon-tag">binnenkort</span></span></li>
            <li><span class="footer-soon">Laptops <span class="footer-soon-tag">binnenkort</span></span></li>
            <li><span class="footer-soon">Koffiemachines <span class="footer-soon-tag">binnenkort</span></span></li>
            <li><span class="footer-soon">Wasmachines <span class="footer-soon-tag">binnenkort</span></span></li>
          </ul>
        </div>

        <!-- Informatie column -->
        <div class="footer-col">
          <h3 class="footer-col-title">Informatie</h3>
          <ul>
            <li><a href="over-producthulp.html">Over ons</a></li>
            <li><a href="hoe-werkt-het.html">Hoe werkt het?</a></li>
            <li><a href="contact.html">Contact</a></li>
          </ul>
        </div>

        <!-- Juridisch column -->
        <div class="footer-col">
          <h3 class="footer-col-title">Juridisch</h3>
          <ul>
            <li><a href="disclaimer.html">Disclaimer</a></li>
            <li><a href="privacy.html">Privacybeleid</a></li>
          </ul>
        </div>

      </div>

      <!-- Bottom bar -->
      <div class="footer-bottom">
        <p class="footer-bottom-left">&copy; ${year} producthulp.nl &mdash; Alle rechten voorbehouden</p>
        <div class="footer-bottom-right">
          <a href="disclaimer.html">Disclaimer</a>
          <a href="privacy.html">Privacy</a>
          <a href="contact.html">Contact</a>
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

