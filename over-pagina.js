const infoPages = [
  {
    id: "over-producthulp",
    title: "Over producthulp",
    file: "over-producthulp.html",
    body: [
      "Hier komt een korte introductie over producthulp.nl en onze missie.",
    ],
  },
  {
    id: "hoe-werkt-het",
    title: "Hoe werkt het?",
    file: "hoe-werkt-het.html",
    body: [
      "Beschrijf hier stap voor stap hoe de keuzehulpen werken.",
    ],
  },
  {
    id: "contact",
    title: "Contact",
    file: "contact.html",
    body: [
      "Plaats hier de contactmogelijkheden en eventuele openingstijden.",
    ],
  },
  {
    id: "disclaimer",
    title: "Disclaimer",
    file: "disclaimer.html",
    body: [
      "Dit is een placeholder voor de disclaimer.",
    ],
  },
  {
    id: "privacy",
    title: "Privacy",
    file: "privacy.html",
    body: [
      "Plaats hier de privacyverklaring en gegevensverwerking.",
    ],
  },
];

const pageId = document.body?.dataset?.page;
const current = infoPages.find((page) => page.id === pageId) || infoPages[0];

const titleEl = document.querySelector(".info-title");
const textEl = document.querySelector(".info-text");
const navList = document.querySelector(".info-nav-list");

if (titleEl) {
  titleEl.textContent = current.title;
}

if (textEl) {
  textEl.innerHTML = "";
  current.body.forEach((paragraph) => {
    const p = document.createElement("p");
    p.textContent = paragraph;
    textEl.appendChild(p);
  });
}

if (navList) {
  navList.innerHTML = "";
  infoPages.forEach((page) => {
    const li = document.createElement("li");
    const link = document.createElement("a");
    const icon = document.createElement("i");

    link.href = page.file;
    link.className = "info-nav-link";
    link.textContent = page.title;

    if (page.id === current.id) {
      link.classList.add("is-active");
    }

    icon.setAttribute("data-lucide", "chevron-right");
    icon.className = "chevron-icon";

    link.appendChild(icon);
    li.appendChild(link);
    navList.appendChild(li);
  });
}

if (window.lucide && typeof window.lucide.createIcons === "function") {
  window.lucide.createIcons();
}
