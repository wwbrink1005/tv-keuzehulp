const keuzehulpen = [
  {
    title: "Televisie keuzehulp",
    keywords: ["tv", "tv's", "televisie", "televisies", "smart tv", "smart-tv"],
    url: "tv/vragen",
  },
  {
    title: "Laptop keuzehulp",
    keywords: ["laptop", "laptops", "notebook", "notebooks"],
    url: "laptop/vragen",
  },
  {
    title: "Monitor keuzehulp",
    keywords: ["monitor", "monitoren", "beeldscherm", "beeldschermen", "scherm", "schermen"],
    url: "monitor/vragen",
  },
  {
    title: "Desktop keuzehulp",
    keywords: [
      "desktop", "desktops", "desktop pc", "desktop-pc",
      "pc", "pc's", "computer", "computers",
      "mini pc", "mini-pc", "minipc",
      "all-in-one", "all in one", "alles-in-een",
    ],
    url: "desktop/vragen",
  },
  {
    title: "Wasmachine keuzehulp",
    keywords: ["wasmachine", "wasmachines", "wasautomaat", "wasautomaten", "wasgoed"],
    url: "wasmachine/vragen",
  },
  {
    title: "Printer keuzehulp",
    keywords: ["printer", "printers", "all-in-one printer", "multifunctional", "fotoprinter"],
    url: "printer/vragen",
  },
  {
    title: "Koelkast keuzehulp",
    keywords: [
      "koelkast", "koelkasten", "koeling", "koeler",
      "inbouwkoelkast", "inbouw koelkast",
      "vrijstaande koelkast", "vrijstaand",
      "amerikaanse koelkast", "amerikaanse koelkast side-by-side", "side-by-side",
      "koel-vriescombinatie", "koelvriescombinatie", "koel vries combinatie",
      "tafelmodel koelkast", "tafelmodel",
    ],
    url: "koelkast/vragen",
  },
  {
    title: "Soundbar keuzehulp",
    keywords: [
      "soundbar", "soundbars", "sound bar", "geluidsbalk",
      "surround", "surroundset", "home cinema", "hometheater",
    ],
    url: "soundbar/vragen",
  },
  {
    title: "Vriezer keuzehulp",
    keywords: [
      "vriezer", "vriezers", "diepvries", "diepvriezer", "diepvrieskist",
      "vrieskist", "vrieskast", "vrieskasten",
      "vrijstaande vriezer", "vrijstaand",
      "kastvriezer", "tafelmodel vriezer", "tafelmodel",
      "no frost", "no-frost",
    ],
    url: "vriezer/vragen",
  },
  {
    title: "Wasdroger keuzehulp",
    keywords: [
      "wasdroger", "wasdrogers", "droger", "drogers", "droogtrommel",
      "condensdroger", "warmtepompdroger", "afvoerdroger",
    ],
    url: "wasdroger/vragen",
  },
  {
    title: "Vaatwasser keuzehulp",
    keywords: [
      "vaatwasser", "vaatwassers", "afwasmachine", "afwasautomaat",
      "inbouwvaatwasser", "inbouw vaatwasser",
      "vrijstaande vaatwasser", "vrijstaand",
      "onderbouwvaatwasser", "onderbouw",
    ],
    url: "vaatwasser/vragen",
  },
  {
    title: "Robotstofzuiger keuzehulp",
    keywords: [
      "robotstofzuiger", "robotstofzuigers", "robot stofzuiger",
      "stofzuigerrobot", "robotstofzuig",
      "dweilrobot", "dweilfunctie", "zelfledigend",
    ],
    url: "robotstofzuiger/vragen",
  },
  {
    title: "Airfryer keuzehulp",
    keywords: [
      "airfryer", "airfryers", "air fryer", "heteluchtfriteuse",
      "friteuse", "hetelucht friteuse",
      "dubbele lade", "dubbele airfryer",
    ],
    url: "airfryer/vragen",
  },
  {
    title: "Beamer keuzehulp",
    keywords: [
      "beamer", "beamers", "projector", "projectoren", "beamerscherm",
      "mini beamer", "mini-beamer", "draagbare beamer",
      "korte projectieafstand", "short throw",
    ],
    url: "beamer/vragen",
  },
];

const normalize = (value) => value.trim().toLowerCase();

const matchesQuery = (item, query) =>
  item.keywords.some((keyword) => keyword.includes(query)) ||
  normalize(item.title).includes(query);

const getElements = (searchWrapper) => {
  if (!searchWrapper) return {};
  return {
    searchInput: searchWrapper.querySelector("input"),
    dropdown: searchWrapper.querySelector(".landing-search-dropdown"),
    resultsList: searchWrapper.querySelector(".landing-search-results"),
  };
};

const renderResults = (results, query, elements) => {
  const { resultsList, dropdown, searchInput } = elements;
  if (!resultsList || !dropdown || !searchInput) return;

  resultsList.innerHTML = "";

  if (results.length === 0) {
    if (query) {
      const listItem = document.createElement("li");
      listItem.classList.add("landing-search-empty");
      listItem.textContent = "Geen resultaten";
      resultsList.appendChild(listItem);

      dropdown.classList.add("visible");
      dropdown.setAttribute("aria-hidden", "false");
      searchInput.classList.add("has-results");
      return;
    }

    hideDropdown(elements);
    return;
  }

  results.forEach((item) => {
    const listItem = document.createElement("li");
    const link = document.createElement("a");
    link.href = item.url;
    link.setAttribute("role", "option");
    link.innerHTML = `${item.title}<i data-lucide="chevron-right" class="chevron-icon"></i>`;
    listItem.appendChild(link);
    resultsList.appendChild(listItem);
  });

  dropdown.classList.add("visible");
  dropdown.setAttribute("aria-hidden", "false");
  searchInput.classList.add("has-results");
  if (window.lucide?.createIcons) {
    window.lucide.createIcons();
  }
};

const hideDropdown = (elements) => {
  const { dropdown, searchInput } = elements;
  if (!dropdown || !searchInput) return;
  dropdown.classList.remove("visible");
  dropdown.setAttribute("aria-hidden", "true");
  searchInput.classList.remove("has-results");
};

const updateResults = (elements) => {
  const { searchInput } = elements;
  if (!searchInput) return;
  const query = normalize(searchInput.value);

  if (!query) {
    hideDropdown(elements);
    return;
  }

  const matches = keuzehulpen
    .filter((item) => matchesQuery(item, query))
    .sort((a, b) => a.title.localeCompare(b.title, "nl"))
    .slice(0, 5);

  renderResults(matches, query, elements);
};

document.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (!target.matches(".landing-search input, .hero-search input")) return;

  const searchWrapper = target.closest(".landing-search, .hero-search");
  updateResults(getElements(searchWrapper));
});

document.addEventListener("focusin", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (!target.matches(".landing-search input, .hero-search input")) return;

  const searchWrapper = target.closest(".landing-search, .hero-search");
  updateResults(getElements(searchWrapper));
});

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const searchWrapper = target.closest(".landing-search, .hero-search");
  if (!searchWrapper) {
    document.querySelectorAll(".landing-search, .hero-search").forEach((wrapper) => {
      hideDropdown(getElements(wrapper));
    });
  }
});
