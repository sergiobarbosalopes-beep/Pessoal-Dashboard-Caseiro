const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const emptyValues = () => Array.from({ length: 12 }, () => 0);

const fallbackMock = {
  income: [],
  outcome: []
};

const cgdState = {
  selectedYear: new Date().getFullYear(),
  data: fallbackMock
};

const SUPABASE_URL = window.CGD_SUPABASE_URL || "https://uooovgxrexpstrtfktst.supabase.co";
const SUPABASE_ANON_KEY = window.CGD_SUPABASE_ANON_KEY || "";
const supabaseClient = window.supabase?.createClient && SUPABASE_ANON_KEY ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

function normalizeMonth(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return -1;
  }
  if (numeric >= 1 && numeric <= 12) {
    return numeric - 1;
  }
  if (numeric >= 0 && numeric <= 11) {
    return numeric;
  }
  return -1;
}

function parseMoneyField(record, fallback = 0) {
  const candidates = [
    record.despesa_valor,
    record.rubrica_valor,
    record.valor,
    record.amount,
    record.montante,
    record.total,
    fallback
  ];
  const value = candidates.find((candidate) => candidate !== undefined && candidate !== null);
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function parseSeq(value, fallback = 999999) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeRubricType(value) {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "receita" ? "income" : "outcome";
}

async function fetchRubricsForYear(year) {
  if (!supabaseClient) {
    return [];
  }

  const { data, error } = await supabaseClient
    .from("cgd_rubrica")
    .select("rubrica_id, ano, mes, rubrica_desc, rubrica_seq, rubrica_tipo, rubrica_valor, valor")
    .eq("ano", year)
    .order("rubrica_seq", { ascending: true })
    .order("mes", { ascending: true });

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

async function fetchExpensesForYear(year) {
  if (!supabaseClient) {
    return [];
  }

  const { data, error } = await supabaseClient
    .from("cgd_despesa")
    .select("despesa_id, rubrica_id, ano, mes, despesa_desc, despesa_seq, despesa_valor, valor")
    .eq("ano", year)
    .order("despesa_seq", { ascending: true })
    .order("mes", { ascending: true });

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

function buildDataModel(rubricRows, expenseRows) {
  const rubricsByKey = new Map();

  rubricRows.forEach((row, index) => {
    const rubricKey = row.rubrica_id ?? `rubrica-fallback-${index}-${row.rubrica_desc}`;
    const monthIndex = normalizeMonth(row.mes);
    if (!rubricsByKey.has(rubricKey)) {
      rubricsByKey.set(rubricKey, {
        id: row.rubrica_id,
        name: row.rubrica_desc || "Rubrica",
        type: normalizeRubricType(row.rubrica_tipo),
        seq: parseSeq(row.rubrica_seq, index + 1),
        values: emptyValues(),
        expenses: []
      });
    }

    const rubric = rubricsByKey.get(rubricKey);
    rubric.seq = Math.min(rubric.seq, parseSeq(row.rubrica_seq, rubric.seq));
    if (monthIndex >= 0) {
      rubric.values[monthIndex] = parseMoneyField(row, rubric.values[monthIndex]);
    }
  });

  const expensesByRubric = new Map();
  expenseRows.forEach((row, index) => {
    const rubricKey = row.rubrica_id;
    if (!expensesByRubric.has(rubricKey)) {
      expensesByRubric.set(rubricKey, new Map());
    }
    const expenseMap = expensesByRubric.get(rubricKey);
    const expenseKey = row.despesa_id ?? `despesa-fallback-${index}-${row.despesa_desc}`;
    const monthIndex = normalizeMonth(row.mes);

    if (!expenseMap.has(expenseKey)) {
      expenseMap.set(expenseKey, {
        id: row.despesa_id,
        rubricId: row.rubrica_id,
        name: row.despesa_desc || "Despesa",
        seq: parseSeq(row.despesa_seq, index + 1),
        values: emptyValues()
      });
    }

    const expense = expenseMap.get(expenseKey);
    expense.seq = Math.min(expense.seq, parseSeq(row.despesa_seq, expense.seq));
    if (monthIndex >= 0) {
      expense.values[monthIndex] = parseMoneyField(row, expense.values[monthIndex]);
    }
  });

  rubricsByKey.forEach((rubric) => {
    const expenseMap = expensesByRubric.get(rubric.id);
    if (!expenseMap) {
      rubric.expenses = [];
      return;
    }
    rubric.expenses = Array.from(expenseMap.values()).sort((a, b) => a.seq - b.seq || a.name.localeCompare(b.name));
  });

  const allRubrics = Array.from(rubricsByKey.values()).sort((a, b) => a.seq - b.seq || a.name.localeCompare(b.name));
  return {
    income: allRubrics.filter((rubric) => rubric.type === "income"),
    outcome: allRubrics.filter((rubric) => rubric.type === "outcome")
  };
}

function showLoadError(message) {
  const panels = document.getElementById("cgd-panels");
  if (!panels) {
    return;
  }
  panels.innerHTML = `<section class='card' style='grid-column: span 12;'><p class='muted'>${message}</p></section>`;
}

function sumByMonth(expenses) {
  return months.map((_, index) => expenses.reduce((acc, expense) => acc + (expense.values[index] || 0), 0));
}

function money(value) {
  return Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function monthPills(values, editable, labelPrefix) {
  return values
    .map((value, monthIndex) => {
      const dataMonth = `data-month-col='${monthIndex}'`;
      if (editable) {
        return `
        <div class='money-pill' ${dataMonth}>
          <input data-money type='text' value='${money(value)}' aria-label='${labelPrefix} ${months[monthIndex]}' />
        </div>`;
      }
      return `
      <div class='money-pill readonly' ${dataMonth}>
        <button type='button' data-expense-field='${labelPrefix} - ${months[monthIndex]}'>
          <span>${money(value)}</span>
        </button>
      </div>`;
    })
    .join("");
}

function renderTimeline(year) {
  const timeline = document.getElementById("month-timeline");
  if (!timeline) {
    return;
  }

  const monthsHtml = months
    .map((month, index) => {
      const monthLabel = month.toUpperCase();
      const monthNumber = String(index + 1).padStart(2, "0");
      return `<button class='month-tile' type='button' data-month='${index}' aria-label='${monthLabel} ${monthNumber}'>
        <span class='month-tile-label'>${monthLabel}</span>
        <span class='month-tile-number'>${monthNumber}</span>
      </button>`;
    })
    .join("");

  timeline.innerHTML = `
    <div class='desc-cell timeline-year-slot'>
      <div class='year-nav year-nav-timeline' aria-label='Navegacao de anos'>
        <button class='year-btn' type='button' data-year-prev aria-label='Ano anterior'>-</button>
        <strong data-year-label>${year}</strong>
        <button class='year-btn' type='button' data-year-next aria-label='Ano seguinte'>+</button>
      </div>
    </div>
    ${monthsHtml}
  `;
}

function renderExpenseRows(expenses, rubricName) {
  return expenses
    .map((expense) => {
      return `
      <div class='data-row expense' data-sortable data-expense-id='${expense.id ?? ""}' data-rubrica-id='${expense.rubricId ?? ""}' data-despesa-seq='${expense.seq ?? ""}'>
        <div class='desc-cell expense-desc-cell'>
          <span class='chev-spacer' aria-hidden='true'></span>
          <button class='desc-pill expense-menu-trigger' type='button' data-expense-menu-toggle aria-expanded='false' aria-label='Opcoes da despesa ${expense.name}'>${expense.name}</button>
          <div class='expense-sort-actions'>
            <div class='expense-menu' role='menu'>
              <button type='button' role='menuitem' data-expense-menu-action='up'><span class='menu-icon' aria-hidden='true'><svg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M12 18V6M12 6L7 11M12 6L17 11' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/></svg></span><span>Mover para cima</span></button>
              <button type='button' role='menuitem' data-expense-menu-action='down'><span class='menu-icon' aria-hidden='true'><svg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M12 6V18M12 18L7 13M12 18L17 13' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/></svg></span><span>Mover para baixo</span></button>
            </div>
          </div>
        </div>
        ${monthPills(expense.values, false, `${rubricName} / ${expense.name}`)}
      </div>
      `;
    })
    .join("");
}

function renderRubrics(rubrics, kind) {
  return rubrics
    .map((rubric, rubricIndex) => {
      const rubricId = `${kind}-rubric-${rubricIndex}`;
      const expenseBodyId = `${rubricId}-expenses`;
      const totals = rubric.values || sumByMonth(rubric.expenses);

      return `
      <article class='rubric' data-sortable data-rubrica-id='${rubric.id ?? ""}' data-rubrica-seq='${rubric.seq ?? ""}' data-rubrica-tipo='${kind}'>
        <header class='rubric-head data-row'>
          <div class='desc-cell rubric-desc-cell'>
            <button class='chev' type='button' data-toggle-target='${expenseBodyId}' aria-expanded='true' aria-label='Expandir rubrica'>▼</button>
            <button class='desc-pill rubric-title rubric-menu-trigger' type='button' data-rubric-menu-toggle aria-expanded='false' aria-label='Opcoes da rubrica ${rubric.name}'>${rubric.name}</button>
            <div class='rubric-sort-actions'>
              <div class='rubric-menu' role='menu'>
                <button type='button' role='menuitem' data-rubric-menu-action='up'><span class='menu-icon' aria-hidden='true'><svg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M12 18V6M12 6L7 11M12 6L17 11' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/></svg></span><span>Mover para cima</span></button>
                <button type='button' role='menuitem' data-rubric-menu-action='down'><span class='menu-icon' aria-hidden='true'><svg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M12 6V18M12 18L7 13M12 18L17 13' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/></svg></span><span>Mover para baixo</span></button>
              </div>
            </div>
          </div>
          ${monthPills(totals, true, `${rubric.name} total`)}
        </header>
        <div class='rubric-body' id='${expenseBodyId}'>
          <div class='expense-body'>
            <div class='item-rows'>
              ${renderExpenseRows(rubric.expenses, rubric.name)}
            </div>
          </div>
        </div>
      </article>
      `;
    })
    .join("");
}

function buildPanel(title, kind, rubrics) {
  const panelId = `panel-${kind}`;
  const bodyId = `${panelId}-body`;
  return `
  <section class='panel ${kind}' data-panel-block>
    <header class='panel-head'>
      <div class='panel-title'>
        <button class='chev' type='button' data-toggle-target='${bodyId}' aria-expanded='true' aria-label='Expandir ${title}'>▼</button>
        <h3>${title}</h3>
      </div>
    </header>
    <div class='panel-body' id='${bodyId}'>
      ${renderRubrics(rubrics, kind)}
    </div>
  </section>
  `;
}

function renderPanels() {
  const panels = document.getElementById("cgd-panels");
  if (!panels) {
    return;
  }

  panels.innerHTML = `
    ${buildPanel("Income", "income", cgdState.data.income)}
    ${buildPanel("Outcome", "outcome", cgdState.data.outcome)}
  `;
}

async function loadYearData(year) {
  cgdState.selectedYear = year;
  const yearLabel = document.querySelector("[data-year-label]");
  if (yearLabel) {
    yearLabel.textContent = String(year);
  }

  if (!supabaseClient) {
    cgdState.data = fallbackMock;
    renderPanels();
    showLoadError("Configure a chave anon do Supabase em window.CGD_SUPABASE_ANON_KEY para carregar rubricas e despesas da BD.");
    document.dispatchEvent(new Event("cgd:rendered"));
    return;
  }

  try {
    const [rubricRows, expenseRows] = await Promise.all([
      fetchRubricsForYear(year),
      fetchExpensesForYear(year)
    ]);
    cgdState.data = buildDataModel(rubricRows, expenseRows);
    renderPanels();
    document.dispatchEvent(new Event("cgd:rendered"));
  } catch (error) {
    console.error("Erro a carregar dados CGD:", error);
    cgdState.data = fallbackMock;
    renderPanels();
    showLoadError("Nao foi possivel carregar dados da BD CGD para o ano selecionado.");
    document.dispatchEvent(new Event("cgd:rendered"));
  }
}

async function persistRubricOrder(rubricRows) {
  if (!supabaseClient) {
    return false;
  }

  const updates = rubricRows
    .map((row, index) => ({
      id: Number(row.getAttribute("data-rubrica-id")),
      seq: index + 1,
      tipo: row.getAttribute("data-rubrica-tipo") === "income" ? "receita" : "despesa"
    }))
    .filter((item) => Number.isFinite(item.id));

  if (!updates.length) {
    return false;
  }

  await Promise.all(
    updates.map((item) =>
      supabaseClient
        .from("cgd_rubrica")
        .update({ rubrica_seq: item.seq })
        .eq("rubrica_id", item.id)
        .eq("ano", cgdState.selectedYear)
        .eq("rubrica_tipo", item.tipo)
    )
  );

  return true;
}

async function persistExpenseOrder(expenseRows, rubricId) {
  if (!supabaseClient || !Number.isFinite(rubricId)) {
    return false;
  }

  const updates = expenseRows
    .map((row, index) => ({
      id: Number(row.getAttribute("data-expense-id")),
      seq: index + 1
    }))
    .filter((item) => Number.isFinite(item.id));

  if (!updates.length) {
    return false;
  }

  await Promise.all(
    updates.map((item) =>
      supabaseClient
        .from("cgd_despesa")
        .update({ despesa_seq: item.seq })
        .eq("despesa_id", item.id)
        .eq("rubrica_id", rubricId)
        .eq("ano", cgdState.selectedYear)
    )
  );

  return true;
}

window.cgdLoadYearData = loadYearData;

window.cgdHandleRubricReorder = async (row, action) => {
  const currentRow = row?.closest("article.rubric[data-sortable]");
  if (!currentRow) {
    return false;
  }

  const parent = currentRow.parentElement;
  const sibling = action === "up" ? currentRow.previousElementSibling : currentRow.nextElementSibling;
  if (!sibling) {
    return true;
  }

  if (action === "up") {
    parent.insertBefore(currentRow, sibling);
  } else {
    parent.insertBefore(sibling, currentRow);
  }

  try {
    const rows = Array.from(parent.querySelectorAll("article.rubric[data-sortable]"));
    await persistRubricOrder(rows);
    await loadYearData(cgdState.selectedYear);
  } catch (error) {
    console.error("Erro ao guardar ordem de rubricas:", error);
    await loadYearData(cgdState.selectedYear);
  }

  return true;
};

window.cgdHandleExpenseReorder = async (row, action) => {
  const currentRow = row?.closest(".data-row.expense[data-sortable]");
  if (!currentRow) {
    return false;
  }

  const parent = currentRow.parentElement;
  const sibling = action === "up" ? currentRow.previousElementSibling : currentRow.nextElementSibling;
  if (!sibling) {
    return true;
  }

  if (action === "up") {
    parent.insertBefore(currentRow, sibling);
  } else {
    parent.insertBefore(sibling, currentRow);
  }

  const rubricId = Number(currentRow.getAttribute("data-rubrica-id"));
  try {
    const rows = Array.from(parent.querySelectorAll(".data-row.expense[data-sortable]"));
    await persistExpenseOrder(rows, rubricId);
    await loadYearData(cgdState.selectedYear);
  } catch (error) {
    console.error("Erro ao guardar ordem de despesas:", error);
    await loadYearData(cgdState.selectedYear);
  }

  return true;
};

document.addEventListener("DOMContentLoaded", async () => {
  renderTimeline(cgdState.selectedYear);
  await loadYearData(cgdState.selectedYear);

  const currentMonth = new Date().getMonth();
  const activeMonthTile = document.querySelector(`.month-tile[data-month='${currentMonth}']`) || document.querySelector(".month-tile");
  if (activeMonthTile) {
    activeMonthTile.click();
  }
});

