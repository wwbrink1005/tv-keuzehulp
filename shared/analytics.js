// Generieke funnel-events voor alle keuzehulpen: quiz_gestart, quiz_voltooid, affiliate_klik.
// Werkt op basis van de URL-structuur (/{categorie}/vragen|resultaat), zodat er geen
// aanpassingen nodig zijn in de per-categorie quiz.js/result.js bestanden.
(function () {
  // Houd in sync met de categorieen in shared/zoekbalk.js en blog/index.html.
  const CATEGORIES = ["tv", "laptop", "monitor", "desktop", "printer", "wasmachine", "koelkast", "soundbar", "vriezer", "wasdroger", "vaatwasser", "robotstofzuiger", "airfryer", "beamer", "koffiemachine", "stofzuiger"];

  function getCategoryAndStage() {
    const match = window.location.pathname.match(/^\/([^/]+)\/(vragen|resultaat)\/?/);
    if (!match || !CATEGORIES.includes(match[1])) return null;
    return { category: match[1], stage: match[2] };
  }

  // SEO-tussenpagina van een categorie: /{categorie}/ zonder vragen/resultaat erachter.
  function getGuideCategory() {
    const match = window.location.pathname.match(/^\/([^/]+)\/?$/);
    if (!match || !CATEGORIES.includes(match[1])) return null;
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
        aanbieder: link.dataset.winkel || hostname,
        prijs: link.dataset.prijs || ""
      });
    }, true);
  }

  function trackGuideCtaClicks() {
    document.addEventListener("click", (event) => {
      const link = event.target.closest("a.guide-cta");
      if (!link) return;

      // Zelfde event voor gidspagina's en blogartikelen (die gebruiken ook .guide-cta);
      // "bron" onderscheidt ze zodat we de stap blog -> keuzehulp apart kunnen meten.
      const isBlog = /^\/[^/]+\/blog\//.test(window.location.pathname);
      const category = isBlog ? window.location.pathname.split("/")[1] : getGuideCategory();
      window.phTrackEvent?.("gids_cta_klik", {
        categorie: CATEGORIES.includes(category) ? category : "onbekend",
        bron: isBlog ? "blog" : "gids"
      });
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
