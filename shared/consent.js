// Cookiebanner + voorwaardelijk laden van Google Analytics (GA4).
// GA laadt pas nadat de bezoeker expliciet op "Accepteren" heeft geklikt.
(function () {
  const CONSENT_KEY = "ph_cookie_consent"; // "granted" | "denied"
  const GA_ID = "G-8YMXDZXWV9";

  function loadGA() {
    if (window.__gaLoaded) return;
    window.__gaLoaded = true;

    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", GA_ID, { anonymize_ip: true });

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.appendChild(script);
  }

  function getConsent() {
    return localStorage.getItem(CONSENT_KEY);
  }

  function setConsent(value) {
    localStorage.setItem(CONSENT_KEY, value);
  }

  function showBanner() {
    const style = document.createElement("style");
    style.textContent = `
      #ph-cookie-banner {
        position: fixed; left: 0; right: 0; bottom: 0; z-index: 9999;
        background: #fff; border-top: 1px solid #e8eaed;
        box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.08);
        padding: 16px 20px; display: flex; flex-wrap: wrap;
        align-items: center; gap: 12px; font-family: "Inter", sans-serif;
      }
      #ph-cookie-banner p { margin: 0; flex: 1 1 280px; font-size: 14px; color: #1d1d1f; line-height: 1.4; }
      #ph-cookie-banner a { color: #0954a3; text-decoration: underline; }
      #ph-cookie-banner .ph-cookie-actions { display: flex; gap: 10px; flex: 0 0 auto; }
      #ph-cookie-banner button {
        border: none; border-radius: 999px; padding: 10px 18px;
        font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit;
      }
      #ph-cookie-banner .ph-accept { background: #0954a3; color: #fff; }
      #ph-cookie-banner .ph-decline { background: #f5f5f7; color: #1d1d1f; }
    `;
    document.head.appendChild(style);

    const banner = document.createElement("div");
    banner.id = "ph-cookie-banner";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-label", "Cookiemelding");
    banner.innerHTML = `
      <p>We gebruiken analytische cookies om te begrijpen hoe bezoekers onze keuzehulpen gebruiken, zodat we ze kunnen verbeteren. Lees ons <a href="overige-paginas/privacy">privacybeleid</a>.</p>
      <div class="ph-cookie-actions">
        <button type="button" class="ph-decline">Weigeren</button>
        <button type="button" class="ph-accept">Accepteren</button>
      </div>
    `;
    document.body.appendChild(banner);

    banner.querySelector(".ph-accept").addEventListener("click", () => {
      setConsent("granted");
      banner.remove();
      loadGA();
    });
    banner.querySelector(".ph-decline").addEventListener("click", () => {
      setConsent("denied");
      banner.remove();
    });
  }

  function init() {
    const consent = getConsent();
    if (consent === "granted") {
      loadGA();
    } else if (consent !== "denied") {
      showBanner();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Beschikbaar voor shared/analytics.js — stuurt alleen events door als er toestemming is.
  window.phTrackEvent = function phTrackEvent(name, params) {
    if (getConsent() !== "granted") return;
    if (typeof window.gtag === "function") {
      window.gtag("event", name, params || {});
    }
  };
})();
