function setActiveMenu() {
  const current = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".menu-link").forEach((link) => {
    const href = link.getAttribute("href");
    if (href === current) {
      link.classList.add("active");
    }
  });
}

function collapseWithinPanel(parent, shouldCollapse) {
  const nestedBodies = parent.querySelectorAll(".rubric-body, .expense-body");
  nestedBodies.forEach((body) => body.classList.toggle("is-collapsed", shouldCollapse));
  parent.querySelectorAll("[data-toggle-target]").forEach((nestedBtn) => {
    nestedBtn.setAttribute("aria-expanded", String(!shouldCollapse));
  });
}

function initNumberMask() {
  const formatValue = (value) => {
    const clean = value.replace(/\s+/g, "");
    if (!clean) {
      return "";
    }
    const numeric = Number(clean.replace(/,/g, ""));
    if (Number.isNaN(numeric)) {
      return value;
    }
    return numeric.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  document.addEventListener("focusout", (event) => {
    const input = event.target.closest("input[data-money]");
    if (!input) {
      return;
    }
    input.value = formatValue(input.value);
  });
}

function initExpenseModal() {
  const modal = document.getElementById("expense-modal");
  if (!modal) {
    return;
  }
  const modalTitle = modal.querySelector("[data-modal-title]");

  document.addEventListener("click", (event) => {
    const fieldBtn = event.target.closest("button[data-expense-field]");
    if (!fieldBtn) {
      return;
    }
    const label = fieldBtn.getAttribute("data-expense-field");
    if (modalTitle) {
      modalTitle.textContent = `Registo detalhado: ${label}`;
    }
    modal.classList.add("show");
  });

  modal.querySelectorAll("[data-close-modal]").forEach((closeBtn) => {
    closeBtn.addEventListener("click", () => modal.classList.remove("show"));
  });

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      modal.classList.remove("show");
    }
  });
}

function highlightMonth(monthIndex) {
  document.querySelectorAll(".month-tile").forEach((tile) => {
    tile.classList.toggle("active", Number(tile.dataset.month) === monthIndex);
  });

  document.querySelectorAll(".money-pill").forEach((pill) => pill.classList.remove("active"));
  document.querySelectorAll(`[data-month-col='${monthIndex}']`).forEach((pill) => {
    pill.classList.add("active");
  });
}

function syncExpensePastMonthsState() {
  const yearLabel = document.querySelector("[data-year-label]");
  if (!yearLabel) {
    return;
  }

  const selectedYear = Number(yearLabel.textContent.trim());
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  document.querySelectorAll(".data-row.expense [data-month-col]").forEach((pill) => {
    const monthIndex = Number(pill.getAttribute("data-month-col"));
    const isPastYear = selectedYear < currentYear;
    const isCurrentYearPastMonth = selectedYear === currentYear && currentMonth > 0 && monthIndex < currentMonth;
    const isPastMonth = isPastYear || isCurrentYearPastMonth;
    pill.classList.toggle("is-past-current-year", isPastMonth);
  });
}

window.syncExpensePastMonthsState = syncExpensePastMonthsState;

function initDelegatedActions() {
  const closeAllMenus = () => {
    document.querySelectorAll(".rubric-sort-actions.open").forEach((openMenu) => {
      openMenu.classList.remove("open");
      const btn = openMenu.closest(".rubric-desc-cell")?.querySelector("[data-rubric-menu-toggle]");
      if (btn) {
        btn.setAttribute("aria-expanded", "false");
      }
    });

    document.querySelectorAll(".expense-sort-actions.open").forEach((openMenu) => {
      openMenu.classList.remove("open");
      const btn = openMenu.closest(".expense-desc-cell")?.querySelector("[data-expense-menu-toggle]");
      if (btn) {
        btn.setAttribute("aria-expanded", "false");
      }
    });
  };

  document.addEventListener("click", (event) => {
    const menuToggle = event.target.closest("[data-rubric-menu-toggle]");
    if (menuToggle) {
      const descCell = menuToggle.closest(".rubric-desc-cell");
      const menuWrap = descCell?.querySelector(".rubric-sort-actions");
      const isOpen = menuWrap?.classList.contains("open");

      closeAllMenus();

      if (menuWrap && !isOpen) {
        menuWrap.classList.add("open");
        menuToggle.setAttribute("aria-expanded", "true");
      }
      return;
    }

    const expenseMenuToggle = event.target.closest("[data-expense-menu-toggle]");
    if (expenseMenuToggle) {
      const descCell = expenseMenuToggle.closest(".expense-desc-cell");
      const menuWrap = descCell?.querySelector(".expense-sort-actions");
      const isOpen = menuWrap?.classList.contains("open");

      closeAllMenus();

      if (menuWrap && !isOpen) {
        menuWrap.classList.add("open");
        expenseMenuToggle.setAttribute("aria-expanded", "true");
      }
      return;
    }

    const menuAction = event.target.closest("[data-rubric-menu-action]");
    if (menuAction) {
      const row = menuAction.closest("[data-sortable]");
      const action = menuAction.getAttribute("data-rubric-menu-action");
      if (row && action === "up" && row.previousElementSibling) {
        row.parentElement.insertBefore(row, row.previousElementSibling);
      }
      if (row && action === "down" && row.nextElementSibling) {
        row.parentElement.insertBefore(row.nextElementSibling, row);
      }

      closeAllMenus();
      return;
    }

    const expenseMenuAction = event.target.closest("[data-expense-menu-action]");
    if (expenseMenuAction) {
      const row = expenseMenuAction.closest("[data-sortable]");
      const action = expenseMenuAction.getAttribute("data-expense-menu-action");
      if (row && action === "up" && row.previousElementSibling) {
        row.parentElement.insertBefore(row, row.previousElementSibling);
      }
      if (row && action === "down" && row.nextElementSibling) {
        row.parentElement.insertBefore(row.nextElementSibling, row);
      }

      closeAllMenus();
      return;
    }

    if (!event.target.closest(".rubric-sort-actions") && !event.target.closest(".expense-sort-actions")) {
      closeAllMenus();
    }

    const toggleBtn = event.target.closest("[data-toggle-target]");
    if (toggleBtn) {
      const targetId = toggleBtn.getAttribute("data-toggle-target");
      const target = document.getElementById(targetId);
      if (!target) {
        return;
      }
      const expanded = toggleBtn.getAttribute("aria-expanded") === "true";
      toggleBtn.setAttribute("aria-expanded", String(!expanded));
      target.classList.toggle("is-collapsed", expanded);

      const parent = toggleBtn.closest("[data-panel-block]");
      if (parent && toggleBtn.closest(".panel-head")) {
        collapseWithinPanel(parent, expanded);
      }
      return;
    }

    const upBtn = event.target.closest("[data-move-up]");
    if (upBtn) {
      const row = upBtn.closest("[data-sortable]");
      if (row && row.previousElementSibling) {
        row.parentElement.insertBefore(row, row.previousElementSibling);
      }
      return;
    }

    const downBtn = event.target.closest("[data-move-down]");
    if (downBtn) {
      const row = downBtn.closest("[data-sortable]");
      if (row && row.nextElementSibling) {
        row.parentElement.insertBefore(row.nextElementSibling, row);
      }
      return;
    }

    const monthTile = event.target.closest(".month-tile");
    if (monthTile) {
      highlightMonth(Number(monthTile.dataset.month));
    }
  });
}

function initYearNavigation() {
  const yearLabel = document.querySelector("[data-year-label]");
  if (!yearLabel) {
    return;
  }

  let year = Number(yearLabel.textContent.trim()) || new Date().getFullYear();

  const render = () => {
    yearLabel.textContent = String(year);
    syncExpensePastMonthsState();
  };

  document.querySelector("[data-year-prev]")?.addEventListener("click", () => {
    year -= 1;
    render();
  });

  document.querySelector("[data-year-next]")?.addEventListener("click", () => {
    year += 1;
    render();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setActiveMenu();
  initDelegatedActions();
  initNumberMask();
  initExpenseModal();
  initYearNavigation();

  const currentMonth = new Date().getMonth();
  const activeMonthTile = document.querySelector(`.month-tile[data-month='${currentMonth}']`) || document.querySelector(".month-tile");
  if (activeMonthTile) {
    highlightMonth(Number(activeMonthTile.dataset.month));
  }

  syncExpensePastMonthsState();
  requestAnimationFrame(syncExpensePastMonthsState);
});

document.addEventListener("cgd:rendered", () => {
  syncExpensePastMonthsState();
});
