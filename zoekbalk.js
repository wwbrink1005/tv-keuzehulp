const keuzehulpen = [
  {
    title: "Televisie keuzehulp",
    keywords: ["tv", "televisie"],
    url: "../TV%20keuzehulp/vragen.html",
  },
];

const normalize = (value) => value.trim().toLowerCase();

const matchesQuery = (item, query) =>
  item.keywords.some((keyword) => keyword.startsWith(query));

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

const clearSearch = (elements) => {
  const { searchInput } = elements;
  if (!searchInput) return;
  searchInput.value = "";
  hideDropdown(elements);
  searchInput.focus();
};

document.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (!target.matches(".landing-search input")) return;

  const searchWrapper = target.closest(".landing-search");
  updateResults(getElements(searchWrapper));
});

document.addEventListener("focusin", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (!target.matches(".landing-search input")) return;

  const searchWrapper = target.closest(".landing-search");
  updateResults(getElements(searchWrapper));
});

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const searchWrapper = target.closest(".landing-search");
  if (searchWrapper && target.closest(".search-clear")) {
    clearSearch(getElements(searchWrapper));
    return;
  }

  if (!searchWrapper) {
    document.querySelectorAll(".landing-search").forEach((wrapper) => {
      hideDropdown(getElements(wrapper));
    });
  }
});
