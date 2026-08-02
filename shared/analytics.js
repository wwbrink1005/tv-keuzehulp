// Generieke funnel-events voor alle keuzehulpen: quiz_gestart, quiz_voltooid, affiliate_klik.
// Werkt op basis van de URL-structuur (keuzehulpen/{categorie}/vragen|resultaat), zodat er
// geen aanpassingen nodig zijn in de per-categorie quiz.js/result.js bestanden.
(function () {
  function getCategoryAndStage() {
    const match = window.location.pathname.match(/\/keuzehulpen\/([^/]+)\/(vragen|resultaat)\/?/);
    if (!match) return null;
    return { category: match[1], stage: match[2] };
  }

  // SEO-tussenpagina van een categorie: /keuzehulpen/{categorie}/ zonder vragen/resultaat erachter.
  function getGuideCategory() {
    const match = window.location.pathname.match(/\/keuzehulpen\/([^/]+)\/?$/);
    if (!match) return null;
    return match[1];
  }

  function trackPageStage() {
    const info = getCategoryAndStage();
    if (!info) return;

    if (info.stage === "vragen") {
      window.phTrackEvent?.("quiz_gestart", { categorie: info.category });
    } else if (info.stage === "resultaat") {
      window.phTrackEvent?.("quiz_voltooid", { categorie: info.category });
    }
  }

  function trackAffiliateClicks() {
    document.addEventListener("click", (event) => {
      const link = event.target.closest('a[target="_blank"]');
      if (!link || !link.href) return;

      let hostname = "";
      try {
        hostname = new URL(link.href).hostname;
      } catch {
        return;
      }
      if (hostname === window.location.hostname) return;

      const info = getCategoryAndStage();
      window.phTrackEvent?.("affiliate_klik", {
        categorie: info?.category ?? "onbekend",
        aanbieder: hostname
      });
    }, true);
  }

  function trackGuideCtaClicks() {
    document.addEventListener("click", (event) => {
      const link = event.target.closest("a.guide-cta");
      if (!link) return;

      const category = getGuideCategory();
      window.phTrackEvent?.("gids_cta_klik", { categorie: category ?? "onbekend" });
    }, true);
  }

  function init() {
    trackPageStage();
    trackAffiliateClicks();
    trackGuideCtaClicks();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
