function createDashboardModalLifecycle() {
  const activeOwners = new Set();
  const returnFocusByOwner = new WeakMap();
  let savedBodyStyle = null;
  let savedScrollY = 0;
  const getTopmost = () => Array.from(activeOwners).at(-1);
  const focusableSelector =
    "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
  const isRestorableFocusTarget = (element) => {
    if (
      !(element instanceof HTMLElement)
      || !element.isConnected
      || !element.matches(focusableSelector)
      || element.closest("[inert], [hidden], [aria-hidden='true'], .is-collapsed")
    ) {
      return false;
    }

    const style = window.getComputedStyle(element);
    return (
      style.display !== "none"
      && style.visibility !== "hidden"
      && style.visibility !== "collapse"
      && element.getClientRects().length > 0
    );
  };

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") {
      return;
    }

    const owner = getTopmost();
    if (!owner) {
      return;
    }

    const focusable = Array.from(owner.querySelectorAll(focusableSelector))
      .filter(isRestorableFocusTarget);
    if (!focusable.length) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const activeElement = document.activeElement;
    if (!owner.contains(activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  const lock = (owner, returnFocus = document.activeElement) => {
    if (!owner || activeOwners.has(owner)) {
      return;
    }

    activeOwners.add(owner);
    owner.removeAttribute("inert");
    if (returnFocus instanceof HTMLElement) {
      returnFocusByOwner.set(owner, returnFocus);
    }
    if (activeOwners.size > 1) {
      return;
    }

    savedBodyStyle = document.body.getAttribute("style");
    savedScrollY = window.scrollY;
    const scrollbarGap = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    document.body.style.position = "fixed";
    document.body.style.inset = `${-savedScrollY}px 0 auto`;
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
    if (scrollbarGap > 0) {
      document.body.style.paddingRight = `${scrollbarGap}px`;
    }
    document.body.classList.add("modal-scroll-locked");
  };

  const unlock = (owner, fallbackFocus) => {
    if (!owner || !activeOwners.delete(owner)) {
      return;
    }

    const returnFocus = returnFocusByOwner.get(owner);
    returnFocusByOwner.delete(owner);
    owner.setAttribute("inert", "");
    if (activeOwners.size === 0) {
      document.body.classList.remove("modal-scroll-locked");
      if (savedBodyStyle === null) {
        document.body.removeAttribute("style");
      } else {
        document.body.setAttribute("style", savedBodyStyle);
      }
      window.scrollTo(0, savedScrollY);
    }

    const focusTarget = [returnFocus, fallbackFocus, document.querySelector(".brand")]
      .find(isRestorableFocusTarget);
    if (focusTarget) {
      requestAnimationFrame(() => focusTarget.focus({ preventScroll: true }));
    }
  };

  const isTopmost = (owner) => getTopmost() === owner;

  return { lock, unlock, isTopmost, isRestorableFocusTarget };
}

window.DashboardModalLifecycle = window.DashboardModalLifecycle || createDashboardModalLifecycle();
document.querySelectorAll(".modal, .admin-modal").forEach((modal) => modal.setAttribute("inert", ""));

function initStickyTemporalNavigation() {
  const topbar = document.querySelector(".topbar");
  const temporalNav = document.querySelector(".temporal-nav-card");
  const siteShell = temporalNav?.closest(".site-shell");
  if (!topbar || !temporalNav || !siteShell) {
    return;
  }

  let offsetFrame = 0;
  const responsiveQuery = window.matchMedia("(max-width: 1024px)");
  const updateOffset = () => {
    offsetFrame = 0;
    const topbarStyle = window.getComputedStyle(topbar);
    const parsedTop = Number.parseFloat(topbarStyle.top);
    const topbarTop = Number.isFinite(parsedTop) ? Math.max(0, parsedTop) : 0;
    const topbarHeight = topbar.getBoundingClientRect().height;
    const isResponsive = responsiveQuery.matches;
    const gap = isResponsive ? 8 : 16;
    const offset = Math.ceil(topbarTop + topbarHeight + gap);
    siteShell.style.setProperty("--temporal-nav-sticky-top", `${offset}px`);
  };
  const scheduleOffsetUpdate = () => {
    if (!offsetFrame) {
      offsetFrame = requestAnimationFrame(updateOffset);
    }
  };

  updateOffset();
  if ("ResizeObserver" in window) {
    const topbarObserver = new ResizeObserver(scheduleOffsetUpdate);
    topbarObserver.observe(topbar);
  }
  window.addEventListener("resize", scheduleOffsetUpdate, { passive: true });
  window.addEventListener("orientationchange", scheduleOffsetUpdate, { passive: true });
  responsiveQuery.addEventListener("change", scheduleOffsetUpdate);
  document.fonts?.ready.then(scheduleOffsetUpdate);
}

function initMobileNavigation() {
  const topbar = document.querySelector(".topbar");
  const menu = topbar?.querySelector("nav.menu");
  if (!topbar || !menu) {
    return;
  }

  if (!menu.id) {
    menu.id = "primary-navigation";
  }

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "menu-toggle";
  toggle.setAttribute("aria-controls", menu.id);
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", "Abrir menu principal");
  toggle.innerHTML = "<span aria-hidden='true'></span><span aria-hidden='true'></span><span aria-hidden='true'></span>";
  topbar.insertBefore(toggle, menu);
  topbar.classList.add("nav-enhanced");

  const setOpen = (open, restoreFocus = false) => {
    topbar.classList.toggle("menu-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Fechar menu principal" : "Abrir menu principal");
    if (restoreFocus) {
      toggle.focus();
    }
  };

  toggle.addEventListener("click", () => {
    setOpen(toggle.getAttribute("aria-expanded") !== "true");
  });

  menu.addEventListener("click", (event) => {
    if (event.target.closest("a[href], .menu-logout")) {
      setOpen(false);
    }
  });

  document.addEventListener("click", (event) => {
    if (topbar.classList.contains("menu-open") && !topbar.contains(event.target)) {
      setOpen(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && topbar.classList.contains("menu-open")) {
      event.preventDefault();
      setOpen(false, true);
    }
  });

  const mobileQuery = window.matchMedia("(max-width: 1024px)");
  mobileQuery.addEventListener("change", (event) => {
    if (!event.matches) {
      setOpen(false);
    }
  });
}

function setActiveMenu() {
  const current = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".menu-link").forEach((link) => {
    const href = link.getAttribute("href");
    const isCurrent = href === current;
    link.classList.toggle("active", isCurrent);
    if (isCurrent) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
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
  const historyTableBody = modal.querySelector("[data-expense-history-body]");
  const historyEmpty = modal.querySelector("[data-expense-history-empty]");
  const checkEstimated = modal.querySelector("[data-expense-estimated]");
  const checkTotalizador = modal.querySelector("[data-expense-totalizador]");
  const checkApplyEndYear = modal.querySelector("[data-expense-apply-end-year]");
  const zeroBtn = modal.querySelector("[data-expense-zero]");
  const saveBtn = modal.querySelector("[data-expense-save]");
  const closeModal = () => {
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
    const fallbackFocus = activeContext
      ? document.querySelector(
        `button[data-rubrica-id='${activeContext.rubricaId}'][data-expense-id='${activeContext.despesaId}'][data-month-index='${activeContext.monthIndex}']`
      )
      : document.querySelector(".brand");
    window.DashboardModalLifecycle?.unlock(modal, fallbackFocus || document.querySelector(".brand"));
  };
  let isModalReadonly = false;
  let initialModalValues = {
    valor: 0,
    valorEstimado: 0,
    totalizador: false
  };
  let editedValorField = false;
  let editedValorEstimadoField = false;

  const toNumber = (value) => {
    const normalized = String(value || "").replace(/\s+/g, "").replace(/,/g, "");
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric : 0;
  };

  const isZeroMoneyDisplayValue = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return true;
    }
    return Math.round(numeric * 100) === 0;
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

  const hasTrackedValueChanges = () => {
    const currentValor = toNumber(inputValor?.value);
    const currentValorEstimado = toNumber(inputValorEstimado?.value);
    const currentTotalizador = Boolean(checkTotalizador?.checked);
    return (
      currentValor !== initialModalValues.valor
      || currentValorEstimado !== initialModalValues.valorEstimado
      || currentTotalizador !== initialModalValues.totalizador
      || editedValorField
      || editedValorEstimadoField
    );
  };

  const updateNotesVisibility = () => {
    if (!notesSection) {
      return;
    }
    const showNotes =
      hasAdjustmentValue(inputAdd?.value)
      || hasAdjustmentValue(inputSubtract?.value)
      || hasTrackedValueChanges();
    notesSection.hidden = !showNotes;
  };

  const applyFieldDisabledState = (element, disabled) => {
    if (!element) {
      return;
    }
    element.disabled = disabled;
    const wrapper = element.closest(".expense-field, .toggle-control");
    if (wrapper) {
      wrapper.classList.toggle("is-locked", disabled);
    }
  };

  const clearLockedFieldIndicators = () => {
    modal.querySelectorAll(".expense-field.is-locked, .toggle-control.is-locked").forEach((node) => {
      node.classList.remove("is-locked");
    });
  };

  const syncFieldLocks = () => {
    if (isModalReadonly) {
      return;
    }

    const currentValor = toNumber(inputValor?.value);
    const currentValorEstimado = toNumber(inputValorEstimado?.value);
    const valorChanged = currentValor !== initialModalValues.valor;
    const valorEstimadoChanged = currentValorEstimado !== initialModalValues.valorEstimado;
    const hasAddValue = hasAdjustmentValue(inputAdd?.value);
    const hasSubtractValue = hasAdjustmentValue(inputSubtract?.value);
    const editedValueFields = valorChanged || valorEstimadoChanged;

    applyFieldDisabledState(inputAdd, editedValueFields || hasSubtractValue);
    applyFieldDisabledState(inputSubtract, editedValueFields || hasAddValue);

    const lockOtherFields = hasAddValue || hasSubtractValue;
    applyFieldDisabledState(inputValor, lockOtherFields);
    applyFieldDisabledState(inputValorEstimado, true);
    applyFieldDisabledState(inputNotes, false);
    applyFieldDisabledState(checkEstimated, false);
    applyFieldDisabledState(checkTotalizador, lockOtherFields);
    applyFieldDisabledState(checkApplyEndYear, lockOtherFields);
  };

  const renderHistoryRows = (entries) => {
    if (historyTableBody) {
      historyTableBody.replaceChildren();
    }

    const validEntries = Array.isArray(entries) ? entries : [];
    if (!validEntries.length) {
      if (historyEmpty) {
        historyEmpty.hidden = false;
      }
      return;
    }

    if (historyEmpty) {
      historyEmpty.hidden = true;
    }

    if (!historyTableBody) {
      return;
    }

    const fragment = document.createDocumentFragment();
    validEntries.forEach((entry) => {
      const counter = Number(entry?.contadorId) || 0;
      const value = Number(entry?.valor) || 0;
      const note = entry?.nota == null ? "" : String(entry.nota);
      const row = document.createElement("tr");
      row.dataset.historyCounterId = String(counter);

      const valueCell = document.createElement("td");
      valueCell.className = "history-value-cell";
      valueCell.textContent = value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      const noteCell = document.createElement("td");
      noteCell.className = "history-note-cell";
      const noteText = document.createElement("span");
      noteText.textContent = note;
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "history-delete-btn";
      deleteButton.dataset.expenseHistoryDelete = "";
      deleteButton.dataset.counterId = String(counter);
      deleteButton.setAttribute("aria-label", "Eliminar nota");
      deleteButton.textContent = "Eliminar";

      noteCell.append(noteText, deleteButton);
      row.append(valueCell, noteCell);
      fragment.append(row);
    });

    historyTableBody.replaceChildren(fragment);
  };

  const enforceExpenseNumericInput = (input, options = {}) => {
    if (!input) {
      return;
    }

    input.addEventListener("input", () => {
      if (typeof options.onEdit === "function") {
        options.onEdit();
      }
      const cursorPosition = input.selectionStart;
      input.value = sanitizeDecimalInputValue(input.value);
      if (typeof cursorPosition === "number") {
        const safePosition = Math.min(cursorPosition, input.value.length);
        input.setSelectionRange(safePosition, safePosition);
      }
      updateNotesVisibility();
      syncFieldLocks();
    });

    input.addEventListener("blur", () => {
      if (typeof options.onEdit === "function") {
        options.onEdit();
      }
      const sanitized = sanitizeDecimalInputValue(input.value);
      if (!sanitized) {
        input.value = "";
        updateNotesVisibility();
        return;
      }

      const numeric = Number(sanitized);
      if (Number.isFinite(numeric)) {
        if (isZeroMoneyDisplayValue(numeric)) {
          input.value = "";
        } else {
          input.value = numeric.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
      } else {
        input.value = "";
      }
      updateNotesVisibility();
      syncFieldLocks();
    });
  };

  enforceExpenseNumericInput(inputValor, {
    onEdit: () => {
      editedValorField = true;
    }
  });
  [inputAdd, inputSubtract].forEach((input) => enforceExpenseNumericInput(input));

  if (inputValorEstimado) {
    inputValorEstimado.readOnly = true;
    inputValorEstimado.setAttribute("aria-readonly", "true");
  }

  checkEstimated?.addEventListener("change", () => {
    updateNotesVisibility();
    syncFieldLocks();
  });

  checkTotalizador?.addEventListener("change", () => {
    updateNotesVisibility();
    syncFieldLocks();
  });

  const applyReadonlyState = (readonly) => {
    isModalReadonly = readonly;
    clearLockedFieldIndicators();
    [inputValor, inputValorEstimado, inputAdd, inputSubtract, inputNotes, checkEstimated, checkTotalizador, checkApplyEndYear].forEach((element) => {
      if (element) {
        element.disabled = readonly;
      }
    });
    if (saveBtn) {
      saveBtn.disabled = readonly;
      saveBtn.style.display = readonly ? "none" : "inline-flex";
    }
    if (zeroBtn) {
      zeroBtn.disabled = readonly;
      zeroBtn.style.display = readonly ? "none" : "inline-flex";
    }
    if (modalCard) {
      modalCard.setAttribute("data-expense-modal-readonly", String(readonly));
    }
    if (!readonly) {
      syncFieldLocks();
    }
  };

  const applyAdjustments = (useEstimatedMode) => {
    if (!inputValor || !inputValorEstimado || !inputAdd || !inputSubtract) {
      return;
    }
    const targetInput = useEstimatedMode ? inputValorEstimado : inputValor;
    const baseValue = toNumber(targetInput.value);
    const plusValue = toNumber(inputAdd.value);
    const minusValue = toNumber(inputSubtract.value);
    const result = baseValue + plusValue - minusValue;
    if (isZeroMoneyDisplayValue(result)) {
      targetInput.value = "";
    } else {
      targetInput.value = result.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
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
    const rawKind = fieldBtn.getAttribute("data-expense-kind");
    const kind = rawKind === "income" || rawKind === "savings" ? rawKind : "outcome";
    const selectedMonth = Number(document.querySelector(".month-tile.active")?.getAttribute("data-month"));
    const readonly = monthIndex !== selectedMonth;

    if (modalTitle) {
      modalTitle.textContent = expenseName;
    }

    if (monthIndicator) {
      const monthName = monthNames[monthIndex] || "--";
      const year = document.querySelector("[data-year-label]")?.textContent?.trim() || "";
      monthIndicator.textContent = year ? `${monthName} ${year}` : monthName;
    }

    if (modalCard) {
      modalCard.setAttribute("data-expense-modal-kind", kind);
    }

    const detail = window.cgdGetExpenseDetail
      ? window.cgdGetExpenseDetail({ rubricaId, despesaId, monthIndex })
      : null;

    if (inputValor) {
      const numericValor = Number(detail?.valor);
      if (!Number.isFinite(numericValor) || isZeroMoneyDisplayValue(numericValor)) {
        inputValor.value = "";
      } else {
        inputValor.value = numericValor.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
    }
    if (inputValorEstimado) {
      const numericValorEstimado = Number(detail?.valorEstimado);
      if (!Number.isFinite(numericValorEstimado) || isZeroMoneyDisplayValue(numericValorEstimado)) {
        inputValorEstimado.value = "";
      } else {
        inputValorEstimado.value = numericValorEstimado.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
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
    if (checkEstimated) {
      checkEstimated.checked = false;
    }
    if (inputAdd) {
      inputAdd.value = "";
    }
    if (inputSubtract) {
      inputSubtract.value = "";
    }

    initialModalValues = {
      valor: toNumber(inputValor?.value),
      valorEstimado: toNumber(inputValorEstimado?.value),
      totalizador: Boolean(checkTotalizador?.checked)
    };
    editedValorField = false;
    editedValorEstimadoField = false;

    updateNotesVisibility();
    syncFieldLocks();

    activeContext = { rubricaId, despesaId, monthIndex };
    applyReadonlyState(readonly);
    window.DashboardModalLifecycle?.lock(modal, fieldBtn);
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");

    if (window.cgdGetExpenseNotes) {
      window.cgdGetExpenseNotes({ rubricaId, despesaId, monthIndex })
        .then((entries) => {
          renderHistoryRows(entries);
        })
        .catch((error) => {
          console.error("Erro ao carregar historico de ajustes:", error);
          renderHistoryRows([]);
        });
    }

    if (!readonly && inputAdd) {
      requestAnimationFrame(() => {
        inputAdd.focus();
      });
    } else {
      requestAnimationFrame(() => modal.querySelector("[data-close-modal]")?.focus());
    }
  });

  modal.querySelectorAll("[data-close-modal]").forEach((closeBtn) => {
    closeBtn.addEventListener("click", closeModal);
  });

  modal.addEventListener("click", (event) => {
    const deleteBtn = event.target.closest("[data-expense-history-delete]");
    if (!deleteBtn || !activeContext || !window.cgdDeleteExpenseNote || !window.cgdGetExpenseNotes) {
      return;
    }

    const counterId = Number(deleteBtn.getAttribute("data-counter-id"));
    if (!Number.isFinite(counterId)) {
      return;
    }

    const originalLabel = deleteBtn.textContent;
    deleteBtn.disabled = true;
    deleteBtn.textContent = "A remover...";

    window.cgdDeleteExpenseNote({
      rubricaId: activeContext.rubricaId,
      despesaId: activeContext.despesaId,
      monthIndex: activeContext.monthIndex,
      contadorId: counterId
    })
      .then((success) => {
        if (!success) {
          throw new Error("Falha ao eliminar nota");
        }
        return window.cgdGetExpenseNotes({
          rubricaId: activeContext.rubricaId,
          despesaId: activeContext.despesaId,
          monthIndex: activeContext.monthIndex
        });
      })
      .then((entries) => {
        renderHistoryRows(entries);
      })
      .catch((error) => {
        console.error("Erro ao eliminar nota do historico:", error);
        deleteBtn.disabled = false;
        deleteBtn.textContent = originalLabel;
      });
  });

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }
    if (
      !modal.classList.contains("show")
      || !window.DashboardModalLifecycle?.isTopmost(modal)
    ) {
      return;
    }
    event.preventDefault();
    closeModal();
  });

  const handleSave = async () => {
    if (!activeContext || !window.cgdSaveExpenseDetail) {
      closeModal();
      return;
    }

    const currentValor = toNumber(inputValor?.value);
    const currentValorEstimado = toNumber(inputValorEstimado?.value);
    const estimatedMode = Boolean(checkEstimated?.checked);
    const currentTotalizador = Boolean(checkTotalizador?.checked);
    const plusValue = toNumber(inputAdd?.value);
    const minusValue = toNumber(inputSubtract?.value);
    const adjustmentValue = plusValue - minusValue;
    const registerAdjustment = plusValue !== 0 || minusValue !== 0;
    const valorChanged = !registerAdjustment && !estimatedMode && currentValor !== initialModalValues.valor;
    const valorEstimadoChanged = !registerAdjustment && estimatedMode && currentValorEstimado !== initialModalValues.valorEstimado;
    const totalizadorChanged = currentTotalizador !== initialModalValues.totalizador;
    const registerValueChangeNote =
      valorChanged
      || valorEstimadoChanged
      || totalizadorChanged
      || editedValorField;

    let noteEntryValue = 0;
    if (registerAdjustment) {
      noteEntryValue = adjustmentValue;
    } else if (valorChanged || totalizadorChanged) {
      noteEntryValue = currentValor;
    } else if (valorEstimadoChanged) {
      noteEntryValue = currentValorEstimado;
    }

    if (registerAdjustment) {
      applyAdjustments(estimatedMode);
    }

    const valueInputAfterAdjustments = toNumber(inputValor?.value);
    const estimatedInputAfterAdjustments = toNumber(inputValorEstimado?.value);
    const finalValor = estimatedMode && !registerAdjustment
      ? initialModalValues.valor
      : valueInputAfterAdjustments;
    const finalValorEstimado = estimatedMode && !registerAdjustment
      ? valueInputAfterAdjustments
      : estimatedInputAfterAdjustments;

    const success = await window.cgdSaveExpenseDetail({
      rubricaId: activeContext.rubricaId,
      despesaId: activeContext.despesaId,
      monthIndex: activeContext.monthIndex,
      valor: finalValor,
      valorEstimado: finalValorEstimado,
      estimatedMode,
      totalizador: Boolean(checkTotalizador?.checked),
      applyToEndYear: Boolean(checkApplyEndYear?.checked),
      nota: inputNotes?.value || "",
      adjustmentValue,
      registerAdjustment,
      registerValueChangeNote,
      noteEntryValue
    });

    if (success) {
      closeModal();
    }
  };

  const submitOnEnterInputs = [inputValor, inputAdd, inputSubtract, inputNotes];
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

  zeroBtn?.addEventListener("click", async () => {
    if (!activeContext || !window.cgdZeroExpenseDetail || zeroBtn.disabled) {
      return;
    }

    zeroBtn.disabled = true;

    try {
      const success = await window.cgdZeroExpenseDetail({
        rubricaId: activeContext.rubricaId,
        despesaId: activeContext.despesaId,
        monthIndex: activeContext.monthIndex
      });

      if (success) {
        closeModal();
        return;
      }
    } catch (error) {
      console.error("Erro ao zerar despesa:", error);
    }

    zeroBtn.disabled = false;
  });
}

function revealMonthTileHorizontally(tile) {
  const scroller = tile?.closest(".temporal-nav-card");
  if (!scroller) {
    return;
  }

  const scrollerRect = scroller.getBoundingClientRect();
  const tileRect = tile.getBoundingClientRect();
  const edgePadding = 8;
  let nextScrollLeft = Number(scroller.scrollLeft) || 0;

  if (tileRect.left < scrollerRect.left + edgePadding) {
    nextScrollLeft += tileRect.left - scrollerRect.left - edgePadding;
  } else if (tileRect.right > scrollerRect.right - edgePadding) {
    nextScrollLeft += tileRect.right - scrollerRect.right + edgePadding;
  } else {
    return;
  }

  scroller.scrollLeft = Math.max(0, nextScrollLeft);
}

function highlightMonth(monthIndex, { reveal = true } = {}) {
  let activeMonthTile = null;
  document.querySelectorAll(".month-tile").forEach((tile) => {
    const isActive = Number(tile.dataset.month) === monthIndex;
    tile.classList.toggle("active", isActive);
    if (isActive) {
      tile.setAttribute("aria-current", "date");
      activeMonthTile = tile;
    } else {
      tile.removeAttribute("aria-current");
    }
  });
  if (reveal) {
    revealMonthTileHorizontally(activeMonthTile);
  }

  document.querySelectorAll(".money-pill").forEach((pill) => pill.classList.remove("active"));
  document.querySelectorAll(`.data-row.expense [data-month-col='${monthIndex}']`).forEach((pill) => {
    pill.classList.add("active");
  });
  document.querySelectorAll(`[data-totalizer-month='${monthIndex}']`).forEach((pill) => {
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

  if (typeof window.cgdSyncRealTotalizerEditableMonth === "function") {
    window.cgdSyncRealTotalizerEditableMonth(monthIndex);
  }

  document.querySelectorAll(".outcome-evolution-point[data-point-month]").forEach((point) => {
    const isActive = Number(point.getAttribute("data-point-month")) === monthIndex;
    point.classList.toggle("is-active-month", isActive);
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
  const positionMenuForViewport = (menuWrap, trigger) => {
    if (!menuWrap || !trigger || !window.matchMedia("(max-width: 768px)").matches) {
      return;
    }

    const menu = menuWrap.querySelector(".panel-menu, .rubric-menu, .expense-menu");
    if (!menu) {
      return;
    }

    menu.style.left = "0";
    menu.style.top = "0";
    const triggerRect = trigger.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const margin = 8;
    const left = Math.min(
      Math.max(margin, triggerRect.right - menuRect.width),
      window.innerWidth - menuRect.width - margin
    );
    const centeredTop = triggerRect.top + (triggerRect.height - menuRect.height) / 2;
    const top = Math.min(
      Math.max(margin, centeredTop),
      window.innerHeight - menuRect.height - margin
    );
    menu.style.left = `${Math.max(margin, left)}px`;
    menu.style.top = `${Math.max(margin, top)}px`;
  };

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

    document.querySelectorAll(".panel-menu, .rubric-menu, .expense-menu").forEach((menu) => {
      menu.style.removeProperty("left");
      menu.style.removeProperty("top");
    });
  };

  const closeMenusOnViewportChange = () => {
    if (document.querySelector(".panel-sort-actions.open, .rubric-sort-actions.open, .expense-sort-actions.open")) {
      closeAllMenus();
    }
  };

  window.addEventListener("resize", closeMenusOnViewportChange);
  document.addEventListener("scroll", closeMenusOnViewportChange, true);

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
        positionMenuForViewport(menuWrap, panelMenuToggle);
      }
      return;
    }

    const panelMenuAction = event.target.closest("[data-panel-menu-action='add-rubric']");
    if (panelMenuAction) {
      const panel = panelMenuAction.closest(".panel[data-panel-kind]");
      const kind = panel?.getAttribute("data-panel-kind");
      const focusFallback = panel?.querySelector("[data-panel-menu-toggle]");
      if (kind && window.cgdCreateRubric) {
        window.cgdCreateRubric(kind, focusFallback).catch((error) => {
          console.error("Erro ao adicionar rubrica:", error);
        });
      }
      closeAllMenus();
      return;
    }

    const outcomeChartToggle = event.target.closest("[data-outcome-chart-toggle-visibility]");
    if (outcomeChartToggle) {
      if (window.cgdToggleOutcomeChart) {
        window.cgdToggleOutcomeChart();
      }
      closeAllMenus();
      return;
    }

    const incomeChartToggle = event.target.closest("[data-income-chart-toggle-visibility]");
    if (incomeChartToggle) {
      if (window.cgdToggleIncomeChart) {
        window.cgdToggleIncomeChart();
      }
      closeAllMenus();
      return;
    }

    const savingsChartToggle = event.target.closest("[data-savings-chart-toggle-visibility]");
    if (savingsChartToggle) {
      if (window.cgdToggleSavingsChart) {
        window.cgdToggleSavingsChart();
      }
      closeAllMenus();
      return;
    }

    const outcomeComparisonChartToggle = event.target.closest("[data-outcome-comparison-chart-toggle-visibility]");
    if (outcomeComparisonChartToggle) {
      if (window.cgdToggleOutcomeComparisonChart) {
        window.cgdToggleOutcomeComparisonChart();
      }
      closeAllMenus();
      return;
    }

    const incomeComparisonChartToggle = event.target.closest("[data-income-comparison-chart-toggle-visibility]");
    if (incomeComparisonChartToggle) {
      if (window.cgdToggleIncomeComparisonChart) {
        window.cgdToggleIncomeComparisonChart();
      }
      closeAllMenus();
      return;
    }

    const savingsComparisonChartToggle = event.target.closest("[data-savings-comparison-chart-toggle-visibility]");
    if (savingsComparisonChartToggle) {
      if (window.cgdToggleSavingsComparisonChart) {
        window.cgdToggleSavingsComparisonChart();
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
        positionMenuForViewport(menuWrap, menuToggle);
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
        positionMenuForViewport(menuWrap, expenseMenuToggle);
      }
      return;
    }

    const menuAction = event.target.closest("[data-rubric-menu-action]");
    if (menuAction) {
      const row = menuAction.closest("[data-sortable]");
      const focusFallback = row?.querySelector("[data-rubric-menu-toggle]");
      const action = menuAction.getAttribute("data-rubric-menu-action");
      if (action === "create-expense") {
        const rubricId = Number(row?.getAttribute("data-rubrica-id"));
        if (Number.isFinite(rubricId) && window.cgdCreateExpense) {
          window.cgdCreateExpense(rubricId, focusFallback).catch((error) => {
            console.error("Erro a criar despesa:", error);
          });
        }
        closeAllMenus();
        return;
      }

      if (action === "delete-rubric") {
        const rubricId = Number(row?.getAttribute("data-rubrica-id"));
        if (Number.isFinite(rubricId) && window.cgdDeleteRubric) {
          window.cgdDeleteRubric(rubricId, focusFallback).catch((error) => {
            console.error("Erro a eliminar rubrica:", error);
          });
        }
        closeAllMenus();
        return;
      }

      if (action === "rename-rubric") {
        const rubricId = Number(row?.getAttribute("data-rubrica-id"));
        if (Number.isFinite(rubricId) && window.cgdRenameRubric) {
          window.cgdRenameRubric(rubricId, focusFallback).catch((error) => {
            console.error("Erro a renomear rubrica:", error);
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
      const focusFallback = row?.querySelector("[data-expense-menu-toggle]");
      const action = expenseMenuAction.getAttribute("data-expense-menu-action");
      if (action === "delete-expense") {
        const rubricId = Number(row?.getAttribute("data-rubrica-id"));
        const despesaId = Number(row?.getAttribute("data-expense-id"));
        if (Number.isFinite(rubricId) && Number.isFinite(despesaId) && window.cgdDeleteExpense) {
          window.cgdDeleteExpense(rubricId, despesaId, focusFallback).catch((error) => {
            console.error("Erro a eliminar despesa:", error);
          });
        }
        closeAllMenus();
        return;
      }

      if (action === "rename-expense") {
        const rubricId = Number(row?.getAttribute("data-rubrica-id"));
        const despesaId = Number(row?.getAttribute("data-expense-id"));
        if (Number.isFinite(rubricId) && Number.isFinite(despesaId) && window.cgdRenameExpense) {
          window.cgdRenameExpense(rubricId, despesaId, focusFallback).catch((error) => {
            console.error("Erro a renomear despesa:", error);
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
        highlightMonth(activeMonth, { reveal: false });
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
  initMobileNavigation();
  initStickyTemporalNavigation();
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
});

document.addEventListener("cgd:rendered", () => {
  const activeMonth = Number(document.querySelector(".month-tile.active")?.getAttribute("data-month"));
  if (Number.isInteger(activeMonth) && activeMonth >= 0 && activeMonth <= 11) {
    highlightMonth(activeMonth);
  }
  syncExpensePastMonthsState();
});
