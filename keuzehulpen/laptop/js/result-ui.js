function initResultMobileUI() {
  const filterPanel   = document.querySelector("#filtersPanel");
  const filterToggle  = document.querySelector(".filter-toggle");
  const drawerClose   = document.querySelector(".filter-drawer-close");
  const restartTrigger = document.querySelector(".restart-trigger");
  const restartPopover = document.querySelector(".restart-popover");
  const restartConfirm = document.querySelector(".restart-confirm");

  const setDrawerOpen = (isOpen) => {
    if (!filterPanel || !filterToggle) return;
    filterPanel.classList.toggle("is-open", isOpen);
    filterToggle.setAttribute("aria-expanded", String(isOpen));
    document.body.classList.toggle("filter-drawer-open", isOpen);
  };

  const setRestartOpen = (isOpen) => {
    if (!restartPopover || !restartTrigger) return;
    restartPopover.classList.toggle("is-open", isOpen);
    restartPopover.setAttribute("aria-hidden", String(!isOpen));
    restartTrigger.setAttribute("aria-expanded", String(isOpen));
  };

  if (filterToggle) {
    filterToggle.addEventListener("click", (event) => {
      event.stopPropagation();
      setDrawerOpen(!filterPanel?.classList.contains("is-open"));
    });
  }

  if (drawerClose) {
    drawerClose.addEventListener("click", () => setDrawerOpen(false));
  }

  if (restartTrigger) {
    restartTrigger.addEventListener("click", (event) => {
      event.stopPropagation();
      setRestartOpen(!restartPopover?.classList.contains("is-open"));
    });
  }

  if (restartConfirm) {
    restartConfirm.addEventListener("click", () => {
      window.location.href = "keuzehulpen/laptop/vragen";
    });
  }

  document.addEventListener("click", (event) => {
    if (filterPanel && filterPanel.classList.contains("is-open")) {
      if (!filterPanel.contains(event.target) && !filterToggle?.contains(event.target)) {
        setDrawerOpen(false);
      }
    }
    if (restartPopover && restartPopover.classList.contains("is-open")) {
      if (!restartPopover.contains(event.target) && !restartTrigger?.contains(event.target)) {
        setRestartOpen(false);
      }
    }
  });
}

document.addEventListener("DOMContentLoaded", initResultMobileUI);
