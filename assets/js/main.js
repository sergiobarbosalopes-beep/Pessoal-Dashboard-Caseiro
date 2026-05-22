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
  const monthNames = ["Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const modalTitle = modal.querySelector("[data-modal-title]");
  const monthIndicator = modal.querySelector("[data-expense-month-indicator]");
  const modalCard = modal.querySelector(".expense-detail-modal");
  const inputValor = modal.querySelector("[data-expense-valor]");
  const inputValorEstimado = modal.querySelector("[data-expense-valor-estimado]");
  const inputAdd = modal.querySelector("[data-expense-add]");
  const inputSubtract = modal.querySelector("[data-expense-subtract]");
  const inputNotes = modal.querySelector("[data-expense-notes]");
  const notesSection = modal.querySelector("[data-expense-notes-section]");
  const checkTotalizador = modal.querySelector("[data-expense-totalizador]");
  const checkApplyEndYear = modal.querySelector("[data-expense-apply-end-year]");
  const saveBtn = modal.querySelector("[data-expense-save]");
  const closeModal = () => modal.classList.remove("show");

  const toNumber = (value) => {
    const normalized = String(value || "").replace(/\s+/g, "").replace(/,/g, "");
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric : 0;
  };

  let activeContext = null;

  const sanitizeDecimalInputValue = (value) => {
    const raw = String(value || "").replace(/,/g, ".").replace(/[^\d.]/g, "");
    if (!raw) {
      return "";
    }

    const firstDot = raw.indexOf(".");
    const hasDot = firstDot >= 0;
    const integerRaw = hasDot ? raw.slice(0, firstDot) : raw;
    const decimalRaw = hasDot ? raw.slice(firstDot + 1).replace(/\./g, "") : "";
    const integerPart = integerRaw.slice(0, 6);
    const decimalPart = decimalRaw.slice(0, 2);

    if (!hasDot) {
      return integerPart;
    }

    const normalizedInteger = integerPart || "0";
    return `${normalizedInteger}.${decimalPart}`;
  };

  const hasAdjustmentValue = (value) => {
    const numeric = toNumber(value);
    return Number.isFinite(numeric) && numeric !== 0;
  };

  const updateNotesVisibility = () => {
    if (!notesSection) {
      return;
    }
    const showNotes = hasAdjustmentValue(inputAdd?.value) || hasAdjustmentValue(inputSubtract?.value);
    notesSection.hidden = !showNotes;
  };

  const enforceExpenseNumericInput = (input) => {
    if (!input) {
      return;
    }

    input.addEventListener("input", () => {
      const cursorPosition = input.selectionStart;
      input.value = sanitizeDecimalInputValue(input.value);
      if (typeof cursorPosition === "number") {
        const safePosition = Math.min(cursorPosition, input.value.length);
        input.setSelectionRange(safePosition, safePosition);
      }
      updateNotesVisibility();
    });

    input.addEventListener("blur", () => {
      const sanitized = sanitizeDecimalInputValue(input.value);
      if (!sanitized) {
        input.value = "";
        updateNotesVisibility();
        return;
      }

      const numeric = Number(sanitized);
      if (Number.isFinite(numeric)) {
        input.value = numeric.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      } else {
        input.value = "";
      }
      updateNotesVisibility();
    });
  };

  [inputValor, inputValorEstimado, inputAdd, inputSubtract].forEach(enforceExpenseNumericInput);

  const applyReadonlyState = (readonly) => {
    [inputValor, inputValorEstimado, inputAdd, inputSubtract, inputNotes, checkTotalizador, checkApplyEndYear].forEach((element) => {
      if (element) {
        element.disabled = readonly;
      }
    });
    if (saveBtn) {
      saveBtn.disabled = readonly;
      saveBtn.style.display = readonly ? "none" : "inline-flex";
    }
    if (modalCard) {
      modalCard.setAttribute("data-expense-modal-readonly", String(readonly));
    }
  };

  const applyAdjustments = () => {
    if (!inputValor || !inputAdd || !inputSubtract) {
      return;
    }
    const baseValue = toNumber(inputValor.value);
    const plusValue = toNumber(inputAdd.value);
    const minusValue = toNumber(inputSubtract.value);
    const result = baseValue + plusValue - minusValue;
    inputValor.value = result.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    inputAdd.value = "";
    inputSubtract.value = "";
    updateNotesVisibility();
  };

  document.addEventListener("click", (event) => {
    const fieldBtn = event.target.closest("button[data-expense-field]");
    if (!fieldBtn) {
      return;
    }

    const expenseName =
      fieldBtn.closest(".data-row.expense")?.querySelector("[data-expense-menu-toggle]")?.textContent?.trim() ||
      fieldBtn.getAttribute("data-expense-field") ||
      "Despesa";
    const rubricaId = Number(fieldBtn.getAttribute("data-rubrica-id"));
    const despesaId = Number(fieldBtn.getAttribute("data-expense-id"));
    const monthIndex = Number(fieldBtn.getAttribute("data-month-index"));
    const kind = fieldBtn.getAttribute("data-expense-kind") === "income" ? "income" : "outcome";
    const selectedMonth = Number(document.querySelector(".month-tile.active")?.getAttribute("data-month"));
    const readonly = monthIndex !== selectedMonth;

    if (modalTitle) {
      modalTitle.textContent = expenseName;
    }

    if (monthIndicator) {
      const monthName = monthNames[monthIndex] || "--";
      const year = document.querySelector("[data-year-label]")?.textContent?.trim() || "";
      monthIndicator.textContent = year ? `Mês: ${monthName} ${year}` : `Mês: ${monthName}`;
    }

    if (modalCard) {
      modalCard.setAttribute("data-expense-modal-kind", kind);
    }

    const detail = window.cgdGetExpenseDetail
      ? window.cgdGetExpenseDetail({ rubricaId, despesaId, monthIndex })
      : null;

    if (inputValor) {
      inputValor.value = Number(detail?.valor || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (inputValorEstimado) {
      inputValorEstimado.value = Number(detail?.valorEstimado || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (inputNotes) {
      inputNotes.value = detail?.nota || "";
    }
    if (checkTotalizador) {
      checkTotalizador.checked = Boolean(detail?.totalizador);
    }
    if (checkApplyEndYear) {
      checkApplyEndYear.checked = false;
    }
    if (inputAdd) {
      inputAdd.value = "";
    }
    if (inputSubtract) {
      inputSubtract.value = "";
    }

    updateNotesVisibility();

    activeContext = { rubricaId, despesaId, monthIndex };
    applyReadonlyState(readonly);
    modal.classList.add("show");

    if (!readonly && inputAdd) {
      requestAnimationFrame(() => {
        inputAdd.focus();
      });
    }
  });

  modal.querySelectorAll("[data-close-modal]").forEach((closeBtn) => {
    closeBtn.addEventListener("click", closeModal);
  });

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });

  const handleSave = async () => {
    if (!activeContext || !window.cgdSaveExpenseDetail) {
      closeModal();
      return;
    }

    applyAdjustments();

    const success = await window.cgdSaveExpenseDetail({
      rubricaId: activeContext.rubricaId,
      despesaId: activeContext.despesaId,
      monthIndex: activeContext.monthIndex,
      valor: toNumber(inputValor?.value),
      valorEstimado: toNumber(inputValorEstimado?.value),
      totalizador: Boolean(checkTotalizador?.checked),
      applyToEndYear: Boolean(checkApplyEndYear?.checked),
      nota: inputNotes?.value || ""
    });

    if (success) {
      closeModal();
    }
  };

  const submitOnEnterInputs = [inputValor, inputValorEstimado, inputAdd, inputSubtract, inputNotes];
  submitOnEnterInputs.forEach((input) => {
    input?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      if (!saveBtn || saveBtn.disabled) {
        return;
      }
      handleSave();
    });
  });

  saveBtn?.addEventListener("click", handleSave);
}

function highlightMonth(monthIndex) {
  document.querySelectorAll(".month-tile").forEach((tile) => {
    tile.classList.toggle("active", Number(tile.dataset.month) === monthIndex);
  });

  document.querySelectorAll(".money-pill").forEach((pill) => pill.classList.remove("active"));
  document.querySelectorAll(`.data-row.expense [data-month-col='${monthIndex}']`).forEach((pill) => {
    pill.classList.add("active");
  });

  document.querySelectorAll("article.rubric").forEach((rubric) => {
    const rubricBody = rubric.querySelector(":scope > .rubric-body");
    const isCollapsed = rubricBody?.classList.contains("is-collapsed");
    if (!isCollapsed) {
      return;
    }

    const rubricMonthPill = rubric.querySelector(`.rubric-head [data-month-col='${monthIndex}']`);
    rubricMonthPill?.classList.add("active");
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
    document.querySelectorAll(".panel-sort-actions.open").forEach((openMenu) => {
      openMenu.classList.remove("open");
      const btn = openMenu.closest(".panel-title")?.querySelector("[data-panel-menu-toggle]");
      if (btn) {
        btn.setAttribute("aria-expanded", "false");
      }
    });

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
    const panelMenuToggle = event.target.closest("[data-panel-menu-toggle]");
    if (panelMenuToggle) {
      const panelTitle = panelMenuToggle.closest(".panel-title");
      const menuWrap = panelTitle?.querySelector(".panel-sort-actions");
      const isOpen = menuWrap?.classList.contains("open");

      closeAllMenus();

      if (menuWrap && !isOpen) {
        menuWrap.classList.add("open");
        panelMenuToggle.setAttribute("aria-expanded", "true");
      }
      return;
    }

    const panelMenuAction = event.target.closest("[data-panel-menu-action='add-rubric']");
    if (panelMenuAction) {
      const panel = panelMenuAction.closest(".panel[data-panel-kind]");
      const kind = panel?.getAttribute("data-panel-kind");
      if (kind && window.cgdCreateRubric) {
        window.cgdCreateRubric(kind).catch((error) => {
          console.error("Erro ao adicionar rubrica:", error);
        });
      }
      closeAllMenus();
      return;
    }

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
      if (action === "create-expense") {
        const rubricId = Number(row?.getAttribute("data-rubrica-id"));
        if (Number.isFinite(rubricId) && window.cgdCreateExpense) {
          window.cgdCreateExpense(rubricId).catch((error) => {
            console.error("Erro a criar despesa:", error);
          });
        }
        closeAllMenus();
        return;
      }

      if (action === "delete-rubric") {
        const rubricId = Number(row?.getAttribute("data-rubrica-id"));
        if (Number.isFinite(rubricId) && window.cgdDeleteRubric) {
          window.cgdDeleteRubric(rubricId).catch((error) => {
            console.error("Erro a eliminar rubrica:", error);
          });
        }
        closeAllMenus();
        return;
      }

      const hasRemoteHandler = typeof window.cgdHandleRubricReorder === "function";
      if (hasRemoteHandler) {
        window.cgdHandleRubricReorder(row, action).catch((error) => {
          console.error("Erro no reorder de rubricas:", error);
        });
      }
      if (!hasRemoteHandler && row && action === "up" && row.previousElementSibling) {
        row.parentElement.insertBefore(row, row.previousElementSibling);
      }
      if (!hasRemoteHandler && row && action === "down" && row.nextElementSibling) {
        row.parentElement.insertBefore(row.nextElementSibling, row);
      }

      closeAllMenus();
      return;
    }

    const expenseMenuAction = event.target.closest("[data-expense-menu-action]");
    if (expenseMenuAction) {
      const row = expenseMenuAction.closest("[data-sortable]");
      const action = expenseMenuAction.getAttribute("data-expense-menu-action");
      if (action === "delete-expense") {
        const rubricId = Number(row?.getAttribute("data-rubrica-id"));
        const despesaId = Number(row?.getAttribute("data-expense-id"));
        if (Number.isFinite(rubricId) && Number.isFinite(despesaId) && window.cgdDeleteExpense) {
          window.cgdDeleteExpense(rubricId, despesaId).catch((error) => {
            console.error("Erro a eliminar despesa:", error);
          });
        }
        closeAllMenus();
        return;
      }

      const hasRemoteHandler = typeof window.cgdHandleExpenseReorder === "function";
      if (hasRemoteHandler) {
        window.cgdHandleExpenseReorder(row, action).catch((error) => {
          console.error("Erro no reorder de despesas:", error);
        });
      }
      if (!hasRemoteHandler && row && action === "up" && row.previousElementSibling) {
        row.parentElement.insertBefore(row, row.previousElementSibling);
      }
      if (!hasRemoteHandler && row && action === "down" && row.nextElementSibling) {
        row.parentElement.insertBefore(row.nextElementSibling, row);
      }

      closeAllMenus();
      return;
    }

    if (!event.target.closest(".panel-sort-actions") && !event.target.closest(".rubric-sort-actions") && !event.target.closest(".expense-sort-actions")) {
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

      const activeMonth = Number(document.querySelector(".month-tile.active")?.getAttribute("data-month"));
      if (Number.isInteger(activeMonth) && activeMonth >= 0 && activeMonth <= 11) {
        highlightMonth(activeMonth);
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
  document.addEventListener("click", (event) => {
    const yearBtn = event.target.closest("[data-year-prev], [data-year-next]");
    if (!yearBtn) {
      return;
    }

    const yearLabel = document.querySelector("[data-year-label]");
    if (!yearLabel) {
      return;
    }

    const currentYear = Number(yearLabel.textContent.trim()) || new Date().getFullYear();
    const nextYear = yearBtn.hasAttribute("data-year-prev") ? currentYear - 1 : currentYear + 1;
    yearLabel.textContent = String(nextYear);
    if (window.cgdLoadYearData) {
      window.cgdLoadYearData(nextYear).catch((error) => {
        console.error("Erro ao carregar ano CGD:", error);
      });
    }
    syncExpensePastMonthsState();
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
  const activeMonth = Number(document.querySelector(".month-tile.active")?.getAttribute("data-month"));
  if (Number.isInteger(activeMonth) && activeMonth >= 0 && activeMonth <= 11) {
    highlightMonth(activeMonth);
  }
  syncExpensePastMonthsState();
});
