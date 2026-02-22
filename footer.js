document.addEventListener("DOMContentLoaded", () => {
  if (document.querySelector(".landing-footer")) {
    return;
  }

  const footerHtml = `
    <footer class="landing-footer" aria-label="Footer">
      <ul>
        <li><a href="over-producthulp.html">Over producthulp.nl</a></li>
        <li><a href="contact.html">Contact</a></li>
        <li><a href="disclaimer.html">Disclaimer</a></li>
        <li><a href="privacy.html">Privacy</a></li>
      </ul>
    </footer>
  `;

  const main = document.querySelector("main");
  if (main) {
    main.insertAdjacentHTML("afterend", footerHtml);
    return;
  }

  document.body.insertAdjacentHTML("beforeend", footerHtml);
});
