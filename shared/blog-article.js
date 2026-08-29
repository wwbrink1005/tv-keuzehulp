// shared/blog-article.js — top-CTA/sticky-CTA gedrag voor alle blogartikelen.
// Toont de sticky-balk zodra de top-CTA-kaart uit beeld scrolt, verbergt hem
// weer zodra de onderste .article-cta in beeld komt (voorkomt 2 CTA's tegelijk).
(function () {
  var topCta = document.getElementById("articleTopCta");
  var bottomCta = document.querySelector(".article-cta");
  var stickyCta = document.getElementById("stickyCta");
  if (!topCta || !bottomCta || !stickyCta || !("IntersectionObserver" in window)) return;

  var pastTopCta = false;
  var pastBottomCta = false;

  function update() {
    stickyCta.classList.toggle("is-visible", pastTopCta && !pastBottomCta);
  }

  new IntersectionObserver(function (entries) {
    pastTopCta = !entries[0].isIntersecting && entries[0].boundingClientRect.top < 0;
    update();
  }, { threshold: 0 }).observe(topCta);

  new IntersectionObserver(function (entries) {
    pastBottomCta = entries[0].isIntersecting;
    update();
  }, { threshold: 0.2 }).observe(bottomCta);
})();
