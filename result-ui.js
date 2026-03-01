function initResultMobileUI() {
  const filterPanel = document.querySelector("#filtersPanel");
  const filterToggle = document.querySelector(".filter-toggle");
  const drawerClose = document.querySelector(".filter-drawer-close");
  const restartTrigger = document.querySelector(".restart-trigger");
  const restartPopover = document.querySelector(".restart-popover");
  const restartConfirm = document.querySelector(".restart-confirm");

  const setDrawerOpen = (isOpen) => {
    if (!filterPanel || !filterToggle) return;
    filterPanel.classList.toggle("is-open", isOpen);
    filterToggle.setAttribute("aria-expanded", String(isOpen));
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
      const isOpen = filterPanel?.classList.contains("is-open");
      setDrawerOpen(!isOpen);
    });
  }

  if (drawerClose) {
    drawerClose.addEventListener("click", () => setDrawerOpen(false));
  }

  if (restartTrigger) {
    restartTrigger.addEventListener("click", (event) => {
      event.stopPropagation();
      const isOpen = restartPopover?.classList.contains("is-open");
      setRestartOpen(!isOpen);
    });
  }

  if (restartConfirm) {
    restartConfirm.addEventListener("click", () => {
      window.location.href = "vragen.html";
    });
  }

  document.addEventListener("click", (event) => {
    if (filterPanel && filterPanel.classList.contains("is-open")) {
      const clickedInsideDrawer = filterPanel.contains(event.target);
      const clickedToggle = filterToggle?.contains(event.target);
      if (!clickedInsideDrawer && !clickedToggle) {
        setDrawerOpen(false);
      }
    }

    if (restartPopover && restartPopover.classList.contains("is-open")) {
      const clickedInsidePopover = restartPopover.contains(event.target);
      const clickedTrigger = restartTrigger?.contains(event.target);
      if (!clickedInsidePopover && !clickedTrigger) {
        setRestartOpen(false);
      }
    }
  });
}

document.addEventListener("DOMContentLoaded", initResultMobileUI);
