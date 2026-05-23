const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const emptyValues = () => Array.from({ length: 12 }, () => 0);

const fallbackMock = {
  income: [],
  outcome: []
};

const cgdState = {
  selectedYear: new Date().getFullYear(),
  data: fallbackMock,
  expenseColumns: new Set(),
  notesTableName: null,
  incomeChartVisible: false,
  incomeComparisonChartVisible: false,
  incomeComparisonHiddenRubrics: new Set(),
  incomeChartHiddenRubrics: new Set(),
  incomeChartSelectedRubricKey: null,
  incomeDrilldownHiddenExpenses: new Set(),
  outcomeChartVisible: false,
  outcomeComparisonChartVisible: false,
  outcomeComparisonHiddenRubrics: new Set(),
  outcomeChartHiddenRubrics: new Set(),
  outcomeChartSelectedRubricKey: null,
  outcomeDrilldownHiddenExpenses: new Set()
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

function parseExpenseValue(record, fallback = 0) {
  const valor = Number(record.valor);
  const valorEstimado = Number(record.valor_estimado ?? record.valor_Estimado);

  if (Number.isFinite(valor) && valor === 0 && Number.isFinite(valorEstimado) && valorEstimado !== 0) {
    return valorEstimado;
  }

  return Number.isFinite(valor) ? valor : fallback;
}

function isEstimatedExpenseValue(record) {
  const valor = Number(record.valor);
  const valorEstimado = Number(record.valor_estimado ?? record.valor_Estimado);
  return Number.isFinite(valor) && valor === 0 && Number.isFinite(valorEstimado) && valorEstimado !== 0;
}

function parseSeq(value, fallback = 999999) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function parseBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "t" || normalized === "1" || normalized === "yes";
  }
  return false;
}

function normalizeRubricType(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "receita") {
    return "income";
  }
  return "outcome";
}

async function fetchRubricsForYear(year) {
  if (!supabaseClient) {
    return [];
  }

  const { data, error } = await supabaseClient
    .from("cgd_rubrica")
    .select("ano,mes,rubrica_id,rubrica_desc,rubrica_seq,rubrica_tipo")
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
    .select("*")
    .eq("ano", year)
    .order("despesa_seq", { ascending: true })
    .order("mes", { ascending: true });

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

async function fetchExpenseNotesForKey({ ano, rubricaId, despesaId, mes }) {
  if (!supabaseClient) {
    return [];
  }

  const keyQuery = (tableName) =>
    supabaseClient
      .from(tableName)
      .select("*")
      .eq("ano", Number(ano))
      .eq("mes", Number(mes))
      .eq("rubrica_id", Number(rubricaId))
      .eq("despesa_id", Number(despesaId))
      .order("contador_id", { ascending: true });

  const preferredTable = cgdState.notesTableName || "cgd_despesa_notas";
  const { data: primaryData, error: primaryError } = await keyQuery(preferredTable);
  if (!primaryError) {
    cgdState.notesTableName = preferredTable;
    return Array.isArray(primaryData) ? primaryData : [];
  }

  const fallbackTable = preferredTable === "cgd_despesa_notas" ? "cgd_despesas_notas" : "cgd_despesa_notas";
  const { data: fallbackData, error: fallbackError } = await keyQuery(fallbackTable);
  if (fallbackError) {
    throw primaryError;
  }

  cgdState.notesTableName = fallbackTable;
  return Array.isArray(fallbackData) ? fallbackData : [];
}

function buildExpenseHistoryKey(rubricaId, despesaId) {
  return `${Number(rubricaId)}::${Number(despesaId)}`;
}

function buildExpenseHistoryMonthKey(rubricaId, despesaId, mes) {
  return `${Number(rubricaId)}::${Number(despesaId)}::${Number(mes)}`;
}

async function fetchExpenseHistoryMonthKeysForYear(year) {
  if (!supabaseClient) {
    return new Set();
  }

  const queryByYear = (tableName) =>
    supabaseClient
      .from(tableName)
      .select("rubrica_id,despesa_id,mes")
      .eq("ano", Number(year));

  const preferredTable = cgdState.notesTableName || "cgd_despesa_notas";
  const { data: primaryData, error: primaryError } = await queryByYear(preferredTable);
  if (!primaryError) {
    cgdState.notesTableName = preferredTable;
    return new Set(
      (Array.isArray(primaryData) ? primaryData : [])
        .map((row) => buildExpenseHistoryMonthKey(row.rubrica_id, row.despesa_id, row.mes))
        .filter((key) => !key.includes("NaN"))
    );
  }

  const fallbackTable = preferredTable === "cgd_despesa_notas" ? "cgd_despesas_notas" : "cgd_despesa_notas";
  const { data: fallbackData, error: fallbackError } = await queryByYear(fallbackTable);
  if (fallbackError) {
    throw primaryError;
  }

  cgdState.notesTableName = fallbackTable;
  return new Set(
    (Array.isArray(fallbackData) ? fallbackData : [])
      .map((row) => buildExpenseHistoryMonthKey(row.rubrica_id, row.despesa_id, row.mes))
      .filter((key) => !key.includes("NaN"))
  );
}

async function createExpenseNoteEntry({ ano, rubricaId, despesaId, mes, valor, nota }) {
  if (!supabaseClient) {
    return;
  }

  let notesTableName = cgdState.notesTableName || "cgd_despesa_notas";
  const alternateTableName = notesTableName === "cgd_despesa_notas" ? "cgd_despesas_notas" : "cgd_despesa_notas";

  const filters = (query) =>
    query
      .eq("ano", Number(ano))
      .eq("rubrica_id", Number(rubricaId))
      .eq("despesa_id", Number(despesaId))
      .eq("mes", Number(mes));

  let { data: latestRows, error: latestError } = await filters(
    supabaseClient.from(notesTableName).select("contador_id").order("contador_id", { ascending: false }).limit(1)
  );

  if (latestError) {
    const retryLatest = await filters(
      supabaseClient.from(alternateTableName).select("contador_id").order("contador_id", { ascending: false }).limit(1)
    );
    if (retryLatest.error) {
      throw latestError;
    }
    notesTableName = alternateTableName;
    cgdState.notesTableName = alternateTableName;
    latestRows = retryLatest.data;
    latestError = null;
  }

  const lastCounter = Number(latestRows?.[0]?.contador_id || 0);
  const nextCounter = Number.isFinite(lastCounter) ? lastCounter + 1 : 1;
  const noteText = nota == null ? "" : String(nota);

  const basePayload = {
    ano: Number(ano),
    mes: Number(mes),
    rubrica_id: Number(rubricaId),
    despesa_id: Number(despesaId),
    contador_id: nextCounter,
    valor: Number.isFinite(Number(valor)) ? Number(valor) : 0
  };

  let { error: insertError } = await supabaseClient
    .from(notesTableName)
    .insert({
      ...basePayload,
      nota: noteText
    });

  if (insertError) {
    const retryInsert = await supabaseClient
      .from(alternateTableName)
      .insert({
        ...basePayload,
        nota: noteText
      });

    if (!retryInsert.error) {
      cgdState.notesTableName = alternateTableName;
      return;
    }
  }

  if (!insertError) {
    return;
  }

  const shouldRetryWithNotas = /column/i.test(String(insertError.message || "")) && /nota/i.test(String(insertError.message || ""));
  if (!shouldRetryWithNotas) {
    throw insertError;
  }

  const { error: retryError } = await supabaseClient
    .from(notesTableName)
    .insert({
      ...basePayload,
      notas: noteText
    });

  if (retryError) {
    throw retryError;
  }
}

async function deleteExpenseNoteEntry({ ano, rubricaId, despesaId, mes, contadorId }) {
  if (!supabaseClient) {
    return false;
  }

  const filterDelete = (tableName) =>
    supabaseClient
      .from(tableName)
      .delete()
      .eq("ano", Number(ano))
      .eq("mes", Number(mes))
      .eq("rubrica_id", Number(rubricaId))
      .eq("despesa_id", Number(despesaId))
      .eq("contador_id", Number(contadorId));

  const preferredTable = cgdState.notesTableName || "cgd_despesa_notas";
  const { error: primaryError } = await filterDelete(preferredTable);
  if (!primaryError) {
    cgdState.notesTableName = preferredTable;
    return true;
  }

  const fallbackTable = preferredTable === "cgd_despesa_notas" ? "cgd_despesas_notas" : "cgd_despesa_notas";
  const { error: fallbackError } = await filterDelete(fallbackTable);
  if (fallbackError) {
    throw primaryError;
  }

  cgdState.notesTableName = fallbackTable;
  return true;
}

function buildDataModel(rubricRows, expenseRows, expenseHistoryMonthKeys = new Set()) {
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
        historyByMonth: Array.from({ length: 12 }, () => false),
        values: emptyValues(),
        estimatedFlags: Array.from({ length: 12 }, () => false),
        monthData: Array.from({ length: 12 }, () => ({
          valor: 0,
          valorEstimado: 0,
          totalizador: false,
          nota: ""
        }))
      });
    }

    const expense = expenseMap.get(expenseKey);
    expense.seq = Math.min(expense.seq, parseSeq(row.despesa_seq, expense.seq));
    if (monthIndex >= 0) {
      expense.historyByMonth[monthIndex] = expenseHistoryMonthKeys.has(buildExpenseHistoryMonthKey(row.rubrica_id, row.despesa_id, row.mes));
      const rawValor = Number(row.valor);
      const rawValorEstimado = Number(row.valor_estimado ?? row.valor_Estimado);
      const rawNota = row.nota ?? row.notas ?? "";
      expense.values[monthIndex] = parseExpenseValue(row, expense.values[monthIndex]);
      expense.estimatedFlags[monthIndex] = isEstimatedExpenseValue(row);
      expense.monthData[monthIndex] = {
        valor: Number.isFinite(rawValor) ? rawValor : 0,
        valorEstimado: Number.isFinite(rawValorEstimado) ? rawValorEstimado : 0,
        totalizador: parseBoolean(row.totalizador),
        nota: rawNota == null ? "" : String(rawNota)
      };
    }
  });

  rubricsByKey.forEach((rubric) => {
    const expenseMap = expensesByRubric.get(rubric.id);
    if (!expenseMap) {
      rubric.expenses = [];
      rubric.values = emptyValues();
      return;
    }
    rubric.expenses = Array.from(expenseMap.values()).sort((a, b) => a.seq - b.seq || a.name.localeCompare(b.name));
    rubric.values = sumByMonth(rubric.expenses);
  });

  const allRubrics = Array.from(rubricsByKey.values()).sort((a, b) => a.seq - b.seq || a.name.localeCompare(b.name));
  return {
    income: allRubrics.filter((rubric) => rubric.type === "income"),
    outcome: allRubrics.filter((rubric) => rubric.type === "outcome")
  };
}

function sumByMonth(expenses) {
  return months.map((_, index) =>
    expenses.reduce((acc, expense) => {
      const includeInTotalizer = expense.monthData?.[index]?.totalizador;
      if (includeInTotalizer === false) {
        return acc;
      }
      return acc + (expense.values[index] || 0);
    }, 0)
  );
}

function money(value) {
  return Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function monthPills(values, editable, labelPrefix, estimatedFlags = [], historyByMonth = [], detailMeta = null) {
  return values
    .map((value, monthIndex) => {
      const dataMonth = `data-month-col='${monthIndex}'`;
      if (editable) {
        return `
        <div class='money-pill' ${dataMonth}>
          <input data-money type='text' value='${money(value)}' aria-label='${labelPrefix} ${months[monthIndex]}' />
        </div>`;
      }
      const detailAttrs = detailMeta
        ? `data-rubrica-id='${detailMeta.rubricaId ?? detailMeta.rubricId ?? ""}' data-expense-id='${detailMeta.expenseId ?? ""}' data-month-index='${monthIndex}' data-expense-kind='${detailMeta.kind || "outcome"}'`
        : "";
      const historyClass = historyByMonth?.[monthIndex] ? "has-history-note" : "";
      return `
      <div class='money-pill readonly' ${dataMonth}>
        <button type='button' class='${historyClass}' data-expense-field='${labelPrefix} - ${months[monthIndex]}' ${detailAttrs}>
          <span class='${estimatedFlags[monthIndex] ? "estimated-value" : ""}'>${money(value)}</span>
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

function renderExpenseRows(expenses, rubricName, kind) {
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
              <div class='menu-separator' role='separator' aria-hidden='true'></div>
              <button type='button' role='menuitem' data-expense-menu-action='delete-expense'><span class='menu-icon danger' aria-hidden='true'><svg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M8 8L16 16M16 8L8 16' stroke='currentColor' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'/></svg></span><span>Eliminar despesa</span></button>
            </div>
          </div>
        </div>
        ${monthPills(expense.values, false, `${rubricName} / ${expense.name}`, expense.estimatedFlags, expense.historyByMonth, {
          rubricId: expense.rubricId,
          expenseId: expense.id,
          kind
        })}
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
                <div class='menu-separator' role='separator' aria-hidden='true'></div>
                <button type='button' role='menuitem' data-rubric-menu-action='create-expense'><span class='menu-icon' aria-hidden='true'><svg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M12 5V19M5 12H19' stroke='currentColor' stroke-width='2.2' stroke-linecap='round'/></svg></span><span>Criar despesa</span></button>
                <div class='menu-separator' role='separator' aria-hidden='true'></div>
                <button type='button' role='menuitem' data-rubric-menu-action='delete-rubric'><span class='menu-icon danger' aria-hidden='true'><svg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M8 8L16 16M16 8L8 16' stroke='currentColor' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'/></svg></span><span>Eliminar rubrica</span></button>
              </div>
            </div>
          </div>
          ${monthPills(totals, true, `${rubric.name} total`)}
        </header>
        <div class='rubric-body' id='${expenseBodyId}'>
          <div class='expense-body'>
            <div class='item-rows'>
              ${renderExpenseRows(rubric.expenses, rubric.name, kind)}
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
  const showChartAction = kind === "outcome" || kind === "income";
  const isOutcome = kind === "outcome";
  const lineChartVisible = isOutcome ? cgdState.outcomeChartVisible : cgdState.incomeChartVisible;
  const comparisonChartVisible = isOutcome ? cgdState.outcomeComparisonChartVisible : cgdState.incomeComparisonChartVisible;
  const lineChartToggleAttr = isOutcome ? "data-outcome-chart-toggle-visibility" : "data-income-chart-toggle-visibility";
  const comparisonChartToggleAttr = isOutcome
    ? "data-outcome-comparison-chart-toggle-visibility"
    : "data-income-comparison-chart-toggle-visibility";
  const chartAction = showChartAction
    ? `<div class='panel-head-actions'>
        <button
          type='button'
          class='panel-chart-toggle ${lineChartVisible ? "is-active" : ""}'
          ${lineChartToggleAttr}
          aria-pressed='${lineChartVisible ? "true" : "false"}'
          aria-label='${lineChartVisible ? "Fechar grafico" : "Abrir grafico"}'
          title='${lineChartVisible ? "Fechar grafico" : "Abrir grafico"}'
        >
          <svg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg' aria-hidden='true'>
            <path d='M4 18V15M9.5 18V10M15 18V6M20 18V12' stroke='currentColor' stroke-width='2.1' stroke-linecap='round' stroke-linejoin='round'/>
          </svg>
        </button>
        <button
          type='button'
          class='panel-chart-toggle ${comparisonChartVisible ? "is-active" : ""}'
          ${comparisonChartToggleAttr}
          aria-pressed='${comparisonChartVisible ? "true" : "false"}'
          aria-label='${comparisonChartVisible ? "Fechar grafico comparativo" : "Abrir grafico comparativo"}'
          title='${comparisonChartVisible ? "Fechar grafico comparativo" : "Abrir grafico comparativo"}'
        >
          <svg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg' aria-hidden='true'>
            <path d='M4 17.5H20' stroke='currentColor' stroke-width='1.8' stroke-linecap='round'/>
            <path d='M4 15.5C6.2 13 8 10.5 10.6 9.8C12.8 9.2 14.6 10.6 16.4 11.1C17.7 11.4 18.9 10.9 20 9.3' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/>
            <path d='M4 11.8C6.1 10.7 7.8 9.4 9.8 7.4C12 5.2 14.2 5.4 16 7.3C17 8.3 18.3 8.9 20 8.6' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/>
          </svg>
        </button>
      </div>`
    : "";
  return `
  <section class='panel ${kind}' data-panel-block data-panel-kind='${kind}'>
    <header class='panel-head'>
      <div class='panel-title'>
        <button class='chev' type='button' data-toggle-target='${bodyId}' aria-expanded='true' aria-label='Expandir ${title}'>▼</button>
        <button class='desc-pill panel-menu-trigger' type='button' data-panel-menu-toggle aria-expanded='false' aria-label='Opcoes do painel ${title}'>${title}</button>
        <div class='panel-sort-actions'>
          <div class='panel-menu' role='menu'>
            <button type='button' role='menuitem' data-panel-menu-action='add-rubric'>Criar rubrica</button>
          </div>
        </div>
      </div>
      ${chartAction}
    </header>
    <div class='panel-body' id='${bodyId}'>
      ${renderRubrics(rubrics, kind)}
    </div>
  </section>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildSmoothPathData(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return "";
  }

  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] || points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] || p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }

  return path;
}

function ensureChartBottomVisible(chartCard, gap = 14) {
  if (!chartCard) {
    return;
  }

  const rect = chartCard.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const overflowBottom = rect.bottom - viewportHeight + gap;

  if (overflowBottom > 0) {
    window.scrollBy({ top: overflowBottom, behavior: "smooth" });
  }
}

function scheduleChartOpenScroll(selector) {
  if (!selector) {
    return;
  }

  // Wait one full paint cycle so hidden cards are laid out before measuring.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const chartCard = document.querySelector(selector);
      ensureChartBottomVisible(chartCard);
    });
  });
}

function scheduleChartOpenScrollByHostId(hostId) {
  if (!hostId) {
    return;
  }

  // Resolve by host id to avoid ambiguous selectors when multiple chart cards share classes.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const host = document.getElementById(hostId);
      const chartCard = host?.closest(".outcome-evolution-card") || host;
      ensureChartBottomVisible(chartCard);
    });
  });
}

function ensurePanelHeadVisible(kind, topGap = 84, bottomGap = 16) {
  const panel = document.querySelector(`.panel.${kind}`);
  const panelHead = panel?.querySelector(".panel-head") || panel;
  if (!panelHead) {
    return;
  }

  const rect = panelHead.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;

  if (rect.top < topGap) {
    window.scrollBy({ top: rect.top - topGap, behavior: "smooth" });
    return;
  }

  if (rect.bottom > viewportHeight - bottomGap) {
    window.scrollBy({ top: rect.bottom - (viewportHeight - bottomGap), behavior: "smooth" });
  }
}

function captureCollapseState() {
  const state = new Map();
  document.querySelectorAll("[data-toggle-target]").forEach((button) => {
    const targetId = String(button.getAttribute("data-toggle-target") || "").trim();
    if (!targetId) {
      return;
    }
    const target = document.getElementById(targetId);
    if (!target) {
      return;
    }
    state.set(targetId, target.classList.contains("is-collapsed"));
  });
  return state;
}

function restoreCollapseState(state) {
  if (!(state instanceof Map) || !state.size) {
    return;
  }

  state.forEach((isCollapsed, targetId) => {
    const target = document.getElementById(targetId);
    if (!target) {
      return;
    }

    target.classList.toggle("is-collapsed", Boolean(isCollapsed));

    document.querySelectorAll("[data-toggle-target]").forEach((button) => {
      if (button.getAttribute("data-toggle-target") === targetId) {
        button.setAttribute("aria-expanded", String(!isCollapsed));
      }
    });
  });
}

function positionOutcomeChartTooltip(tooltip, wrap, event) {
  const wrapRect = wrap.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const margin = 10;
  let left = event.clientX - wrapRect.left + 12;
  let top = event.clientY - wrapRect.top - tooltipRect.height - 12;

  if (left + tooltipRect.width > wrapRect.width - margin) {
    left = wrapRect.width - tooltipRect.width - margin;
  }
  if (left < margin) {
    left = margin;
  }

  if (top < margin) {
    top = event.clientY - wrapRect.top + 14;
  }
  if (top + tooltipRect.height > wrapRect.height - margin) {
    top = wrapRect.height - tooltipRect.height - margin;
  }

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function bindOutcomeChartHover(host) {
  if (!host) {
    return;
  }

  host.querySelectorAll(".outcome-evolution-svg-wrap").forEach((wrap) => {
    const tooltip = wrap.querySelector(".outcome-evolution-tooltip");
    if (!tooltip) {
      return;
    }

    const hideTooltip = () => {
      tooltip.classList.remove("is-visible");
    };

    wrap.addEventListener("pointerleave", hideTooltip);

    wrap.querySelectorAll(".outcome-evolution-point").forEach((point) => {
      const showTooltip = (event) => {
        const monthName = point.getAttribute("data-month-name") || "";
        const seriesName = point.getAttribute("data-series-name") || "";
        const value = point.getAttribute("data-value") || "0.00";
        const color = point.getAttribute("data-series-color") || "#b8ced9";

        tooltip.innerHTML = `
          <div class='outcome-evolution-tooltip-month'>${escapeHtml(monthName)}</div>
          <div class='outcome-evolution-tooltip-row'>
            <span class='outcome-evolution-tooltip-dot' style='background:${escapeHtml(color)};'></span>
            <span class='outcome-evolution-tooltip-series'>${escapeHtml(seriesName)}</span>
            <strong class='outcome-evolution-tooltip-value'>${escapeHtml(value)}</strong>
          </div>
        `;
        tooltip.classList.add("is-visible");
        positionOutcomeChartTooltip(tooltip, wrap, event);
      };

      point.addEventListener("pointerenter", showTooltip);
      point.addEventListener("pointermove", showTooltip);
      point.addEventListener("focus", (event) => showTooltip(event));
      point.addEventListener("blur", hideTooltip);
    });
  });
}

function buildOutcomeRubricSeries() {
  const palette = ["#f2c46a", "#f08b5f", "#5fc8b6", "#7cb7ff", "#84d56b", "#f29db1", "#a9e46f", "#9ad9ff", "#e6b86d", "#8bd3a0"];
  const sourceRubrics = Array.isArray(cgdState.data?.outcome) ? cgdState.data.outcome : [];

  return sourceRubrics
    .map((rubric, index) => {
      const rawId = rubric?.id;
      const key = Number.isFinite(Number(rawId)) ? `id-${Number(rawId)}` : `idx-${index}`;
      const values = months.map((_, monthIndex) => {
        const numeric = Number(rubric?.values?.[monthIndex]);
        return Number.isFinite(numeric) ? numeric : 0;
      });
      const expenses = Array.isArray(rubric?.expenses)
        ? rubric.expenses.map((expense, expenseIndex) => ({
            key: `expense-${index}-${expenseIndex}-${Number(expense?.id) || 0}`,
            name: expense?.name || `Despesa ${expenseIndex + 1}`,
            values: months.map((_, monthIndex) => {
              const numeric = Number(expense?.values?.[monthIndex]);
              return Number.isFinite(numeric) ? numeric : 0;
            })
          }))
        : [];
      return {
        key,
        name: rubric?.name || `Rubrica ${index + 1}`,
        values,
        color: palette[index % palette.length],
        expenses
      };
    })
    .filter((entry) => entry.values.some((value) => value !== 0));
}

function buildIncomeRubricSeries() {
  const palette = ["#6ecf9a", "#7cc4ff", "#9ed86b", "#58d2c3", "#8bcf7a", "#5fb3de", "#9edfb7", "#71d0ff", "#77c87f", "#79bdf0"];
  const sourceRubrics = Array.isArray(cgdState.data?.income) ? cgdState.data.income : [];

  return sourceRubrics
    .map((rubric, index) => {
      const rawId = rubric?.id;
      const key = Number.isFinite(Number(rawId)) ? `id-${Number(rawId)}` : `idx-${index}`;
      const values = months.map((_, monthIndex) => {
        const numeric = Number(rubric?.values?.[monthIndex]);
        return Number.isFinite(numeric) ? numeric : 0;
      });
      const expenses = Array.isArray(rubric?.expenses)
        ? rubric.expenses.map((expense, expenseIndex) => ({
            key: `expense-${index}-${expenseIndex}-${Number(expense?.id) || 0}`,
            name: expense?.name || `Despesa ${expenseIndex + 1}`,
            values: months.map((_, monthIndex) => {
              const numeric = Number(expense?.values?.[monthIndex]);
              return Number.isFinite(numeric) ? numeric : 0;
            })
          }))
        : [];
      return {
        key,
        name: rubric?.name || `Rubrica ${index + 1}`,
        values,
        color: palette[index % palette.length],
        expenses
      };
    })
    .filter((entry) => entry.values.some((value) => value !== 0));
}

function buildOutcomeExpenseSeriesForRubric(rubric) {
  if (!rubric) {
    return [];
  }

  const palette = ["#9ad9ff", "#a9e46f", "#f7c86a", "#f3a47d", "#95c7ff", "#84d56b", "#e8a0b4", "#7acfc6", "#eac17a", "#a6d8b5"];
  return (rubric.expenses || [])
    .map((expense, index) => ({
      key: expense.key || `expense-${index}`,
      name: expense.name || `Despesa ${index + 1}`,
      values: months.map((_, monthIndex) => {
        const numeric = Number(expense.values?.[monthIndex]);
        return Number.isFinite(numeric) ? numeric : 0;
      }),
      color: palette[index % palette.length]
    }))
    .filter((entry) => entry.values.some((value) => value !== 0));
}

function buildIncomeExpenseSeriesForRubric(rubric) {
  if (!rubric) {
    return [];
  }

  const palette = ["#8fdcb3", "#8bc8f5", "#9fdc88", "#7fded2", "#95d889", "#79bfe3", "#abdcc6", "#8fd7ff", "#8bcf96", "#93c4eb"];
  return (rubric.expenses || [])
    .map((expense, index) => ({
      key: expense.key || `expense-${index}`,
      name: expense.name || `Despesa ${index + 1}`,
      values: months.map((_, monthIndex) => {
        const numeric = Number(expense.values?.[monthIndex]);
        return Number.isFinite(numeric) ? numeric : 0;
      }),
      color: palette[index % palette.length]
    }))
    .filter((entry) => entry.values.some((value) => value !== 0));
}

function bindIncomeChartInteractions(host) {
  if (!host || host.dataset.chartBoundIncome === "1") {
    return;
  }

  host.dataset.chartBoundIncome = "1";
  host.addEventListener("click", (event) => {
    const closeMainChartBtn = event.target.closest("[data-income-chart-close-main]");
    if (closeMainChartBtn) {
      cgdState.incomeChartVisible = false;
      cgdState.incomeChartSelectedRubricKey = null;
      cgdState.incomeChartHiddenRubrics.clear();
      renderPanels();
      document.dispatchEvent(new Event("cgd:rendered"));
      requestAnimationFrame(() => {
        ensurePanelHeadVisible("income");
      });
      return;
    }

    const drilldownToggle = event.target.closest("[data-income-drilldown-toggle]");
    if (drilldownToggle) {
      const expenseKey = String(drilldownToggle.getAttribute("data-income-drilldown-toggle") || "").trim();
      const activeRubricKey = cgdState.incomeChartSelectedRubricKey || String(host.dataset.singleIncomeRubricKey || "").trim();
      if (expenseKey) {
        const stateKey = `${activeRubricKey}::${expenseKey}`;
        if (cgdState.incomeDrilldownHiddenExpenses.has(stateKey)) {
          cgdState.incomeDrilldownHiddenExpenses.delete(stateKey);
        } else {
          cgdState.incomeDrilldownHiddenExpenses.add(stateKey);
        }
        renderIncomeEvolutionChart();
      }
      return;
    }

    const drilldownTarget = event.target.closest("[data-income-chart-drilldown]");
    if (drilldownTarget) {
      const key = String(drilldownTarget.getAttribute("data-income-chart-drilldown") || "").trim();
      const isSameSelectedRubric = cgdState.incomeChartSelectedRubricKey === key;

      if (isSameSelectedRubric) {
        cgdState.incomeChartSelectedRubricKey = null;
        cgdState.incomeChartHiddenRubrics.clear();
      } else {
        cgdState.incomeChartSelectedRubricKey = key;
        const allRubricKeys = buildIncomeRubricSeries().map((entry) => entry.key);
        cgdState.incomeChartHiddenRubrics.clear();
        allRubricKeys.forEach((rubricKey) => {
          if (rubricKey !== key) {
            cgdState.incomeChartHiddenRubrics.add(rubricKey);
          }
        });
      }

      renderIncomeEvolutionChart();
      return;
    }

    const toggleBtn = event.target.closest("[data-income-chart-toggle]");
    if (toggleBtn) {
      const key = String(toggleBtn.getAttribute("data-income-chart-toggle") || "").trim();
      if (key) {
        if (cgdState.incomeChartHiddenRubrics.has(key)) {
          cgdState.incomeChartHiddenRubrics.delete(key);
        } else {
          cgdState.incomeChartHiddenRubrics.add(key);
          if (cgdState.incomeChartSelectedRubricKey === key) {
            cgdState.incomeChartSelectedRubricKey = null;
          }
        }
        renderIncomeEvolutionChart();
      }
      return;
    }

    const selectAllBtn = event.target.closest("[data-income-chart-select-all]");
    if (selectAllBtn) {
      cgdState.incomeChartHiddenRubrics.clear();
      renderIncomeEvolutionChart();
      return;
    }

    const deselectAllBtn = event.target.closest("[data-income-chart-deselect-all]");
    if (deselectAllBtn) {
      host.querySelectorAll("[data-income-chart-toggle]").forEach((item) => {
        const key = String(item.getAttribute("data-income-chart-toggle") || "").trim();
        if (key) {
          cgdState.incomeChartHiddenRubrics.add(key);
        }
      });
      cgdState.incomeChartSelectedRubricKey = null;
      renderIncomeEvolutionChart();
    }
  });
}

function renderIncomeEvolutionChart() {
  const host = document.getElementById("income-evolution-chart");
  if (!host) {
    return;
  }

  const chartCard = host.closest(".income-evolution-card");
  if (!cgdState.incomeChartVisible) {
    if (chartCard) {
      chartCard.classList.add("outcome-evolution-card-hidden");
    }
    host.innerHTML = "";
    return;
  }

  if (chartCard) {
    chartCard.classList.remove("outcome-evolution-card-hidden");
  }

  bindIncomeChartInteractions(host);

  const series = buildIncomeRubricSeries();
  const visibleSeries = series.filter((entry) => !cgdState.incomeChartHiddenRubrics.has(entry.key));
  const singleVisibleRubric = visibleSeries.length === 1 ? visibleSeries[0] : null;
  host.dataset.singleIncomeRubricKey = singleVisibleRubric ? singleVisibleRubric.key : "";

  const legend = series
    .map((entry) => {
      const isVisible = !cgdState.incomeChartHiddenRubrics.has(entry.key);
      const stateClass = isVisible ? "is-active" : "is-inactive";
      return `<button type='button' class='outcome-evolution-legend-item ${stateClass}' data-income-chart-toggle='${escapeHtml(entry.key)}' aria-pressed='${isVisible ? "true" : "false"}'><span class='outcome-evolution-legend-dot' style='background:${entry.color};'></span>${escapeHtml(entry.name)}</button>`;
    })
    .join("");

  if (!series.length) {
    host.innerHTML = `
      <p class='outcome-evolution-empty'>Ainda nao existem valores totalizadores para desenhar a evolucao anual.</p>
      <div class='outcome-evolution-legend'></div>
    `;
    return;
  }

  if (!visibleSeries.length) {
    host.innerHTML = `
      <p class='outcome-evolution-empty'>Nenhuma rubrica selecionada. Clica na legenda para voltar a mostrar.</p>
      <div class='outcome-evolution-legend'>${legend}</div>
    `;
    return;
  }

  const isSingleRubricMode = Boolean(singleVisibleRubric);
  const expenseSeries = isSingleRubricMode ? buildIncomeExpenseSeriesForRubric(singleVisibleRubric) : [];
  const expenseStateKey = (expenseKey) => `${singleVisibleRubric.key}::${expenseKey}`;
  const visibleExpenseSeries = isSingleRubricMode
    ? expenseSeries.filter((entry) => !cgdState.incomeDrilldownHiddenExpenses.has(expenseStateKey(entry.key)))
    : [];

  const chartWidth = 980;
  const chartHeight = 320;
  const padding = { top: 20, right: 18, bottom: 38, left: 54 };
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;
  const monthStep = plotWidth / (months.length - 1);
  const plotBottom = padding.top + plotHeight;

  const plottedSeries = isSingleRubricMode ? visibleExpenseSeries : visibleSeries;
  if (isSingleRubricMode && !expenseSeries.length) {
    host.innerHTML = `
      <div class='outcome-drilldown-toolbar'>
        <button type='button' class='outcome-drilldown-close-btn' data-income-chart-close-main>Fechar</button>
      </div>
      <div class='outcome-evolution-top-series'>${legend}</div>
      <p class='outcome-evolution-empty'>Esta rubrica nao tem despesas com valores ao longo do ano.</p>
    `;
    return;
  }

  if (isSingleRubricMode && !visibleExpenseSeries.length) {
    host.innerHTML = `
      <div class='outcome-drilldown-toolbar'>
        <button type='button' class='outcome-drilldown-close-btn' data-income-chart-close-main>Fechar</button>
      </div>
      <div class='outcome-evolution-top-series'>${legend}</div>
      <p class='outcome-evolution-empty'>Nenhuma despesa selecionada. Clica na legenda para voltar a mostrar.</p>
      <div class='outcome-evolution-top-series'>${expenseSeries
        .map((entry) => {
          const isVisible = !cgdState.incomeDrilldownHiddenExpenses.has(expenseStateKey(entry.key));
          const stateClass = isVisible ? "is-active" : "is-inactive";
          return `<button type='button' class='outcome-evolution-legend-item ${stateClass}' data-income-drilldown-toggle='${escapeHtml(entry.key)}' aria-pressed='${isVisible ? "true" : "false"}'><span class='outcome-evolution-legend-dot' style='background:${entry.color};'></span>${escapeHtml(entry.name)}</button>`;
        })
        .join("")}</div>
    `;
    return;
  }

  const maxValue = Math.max(...plottedSeries.flatMap((entry) => entry.values));
  const yMax = maxValue > 0 ? maxValue : 1;

  const xFor = (monthIndex) => padding.left + monthIndex * monthStep;
  const yFor = (value) => padding.top + plotHeight - (value / yMax) * plotHeight;

  const horizontalGridCount = 12;
  const gridLines = Array.from({ length: horizontalGridCount + 1 }, (_, index) => {
    const ratio = index / horizontalGridCount;
    const y = padding.top + plotHeight - ratio * plotHeight;
    const labelValue = yMax * ratio;
    return `
      <line x1='${padding.left}' y1='${y}' x2='${chartWidth - padding.right}' y2='${y}' stroke='rgba(176,210,226,0.18)' stroke-width='0.7' />
      <text x='${padding.left - 8}' y='${y + 4}' text-anchor='end' fill='rgba(197,220,231,0.82)' font-size='9'>${labelValue.toFixed(0)}</text>
    `;
  }).join("");

  const monthLabels = months
    .map((month, monthIndex) => {
      const x = xFor(monthIndex);
      return `<text x='${x}' y='${chartHeight - 12}' text-anchor='middle' fill='rgba(197,220,231,0.9)' font-size='10'>${escapeHtml(month)}</text>`;
    })
    .join("");

  const monthGridLines = months
    .map((_, monthIndex) => {
      const x = xFor(monthIndex);
      return `<line x1='${x}' y1='${padding.top}' x2='${x}' y2='${padding.top + plotHeight}' stroke='rgba(176,210,226,0.12)' stroke-width='1' />`;
    })
    .join("");

  const lines = plottedSeries
    .map((entry) => {
      const isSelected = !isSingleRubricMode && entry.key === cgdState.incomeChartSelectedRubricKey;
      const strokeWidth = isSingleRubricMode ? "0.6" : "1.3";
      const selectionClass = isSelected ? "is-selected" : "";
      const points = entry.values.map((value, monthIndex) => ({ x: xFor(monthIndex), y: yFor(value), value, monthIndex }));
      const pathData = buildSmoothPathData(points);
      const areaPath = `${pathData} L ${points[points.length - 1].x.toFixed(2)} ${plotBottom.toFixed(2)} L ${points[0].x.toFixed(2)} ${plotBottom.toFixed(2)} Z`;
      const pointsMarkup = entry.values
        .map((value, monthIndex) => {
          const cx = xFor(monthIndex);
          const cy = yFor(value);
          return `<circle class='outcome-evolution-point' cx='${cx.toFixed(2)}' cy='${cy.toFixed(2)}' r='2.8' fill='${entry.color}' tabindex='0' data-series-name='${escapeHtml(entry.name)}' data-month-name='${escapeHtml(months[monthIndex])}' data-value='${value.toFixed(2)}' data-series-color='${entry.color}'></circle>`;
        })
        .join("");
      return `
        <g class='outcome-evolution-series ${selectionClass}' ${isSingleRubricMode ? "" : `data-income-chart-drilldown='${escapeHtml(entry.key)}'`}>
          <path d='${areaPath}' class='outcome-evolution-area' fill='${entry.color}' fill-opacity='0.10' />
          <path d='${pathData}' class='outcome-evolution-line' fill='none' stroke='${entry.color}' stroke-width='${strokeWidth}' stroke-linecap='round' stroke-linejoin='round' />
          ${pointsMarkup}
        </g>
      `;
    })
    .join("");

  const expenseLegend = isSingleRubricMode
    ? expenseSeries
        .map((entry) => {
          const isVisible = !cgdState.incomeDrilldownHiddenExpenses.has(expenseStateKey(entry.key));
          const stateClass = isVisible ? "is-active" : "is-inactive";
          return `<button type='button' class='outcome-evolution-legend-item ${stateClass}' data-income-drilldown-toggle='${escapeHtml(entry.key)}' aria-pressed='${isVisible ? "true" : "false"}'><span class='outcome-evolution-legend-dot' style='background:${entry.color};'></span>${escapeHtml(entry.name)}</button>`;
        })
        .join("")
    : "";

  const singleRubricLegendMarkup = isSingleRubricMode && expenseSeries.length
    ? `<div class='outcome-evolution-top-series'>${expenseLegend}</div>`
    : "";

  host.innerHTML = `
    <div class='outcome-drilldown-toolbar'>
      <button type='button' class='outcome-drilldown-close-btn' data-income-chart-close-main>Fechar</button>
    </div>
    <div class='outcome-evolution-top-series'>${legend}</div>
    ${singleRubricLegendMarkup}
    <div class='outcome-evolution-svg-wrap'>
      <svg class='outcome-evolution-svg' viewBox='0 0 ${chartWidth} ${chartHeight}' role='img' aria-label='${isSingleRubricMode ? "Grafico de linhas com evolucao das despesas da rubrica selecionada" : "Grafico de linhas com evolucao das rubricas de income"}'>
        ${gridLines}
        ${monthGridLines}
        ${lines}
        ${monthLabels}
      </svg>
      <div class='outcome-evolution-tooltip' aria-hidden='true'></div>
    </div>
  `;

  bindOutcomeChartHover(host);
}

function bindOutcomeChartInteractions(host) {
  if (!host || host.dataset.chartBound === "1") {
    return;
  }

  host.dataset.chartBound = "1";
  host.addEventListener("click", (event) => {
    const closeMainChartBtn = event.target.closest("[data-outcome-chart-close-main]");
    if (closeMainChartBtn) {
      cgdState.outcomeChartVisible = false;
      cgdState.outcomeChartSelectedRubricKey = null;
      cgdState.outcomeChartHiddenRubrics.clear();
      renderPanels();
      document.dispatchEvent(new Event("cgd:rendered"));
      requestAnimationFrame(() => {
        ensurePanelHeadVisible("outcome");
      });
      return;
    }

    const closeDrilldownBtn = event.target.closest("[data-outcome-chart-close-drilldown]");
    if (closeDrilldownBtn) {
      cgdState.outcomeChartSelectedRubricKey = null;
      cgdState.outcomeChartHiddenRubrics.clear();
      renderOutcomeEvolutionChart();
      return;
    }

    const drilldownToggle = event.target.closest("[data-outcome-drilldown-toggle]");
    if (drilldownToggle) {
      const expenseKey = String(drilldownToggle.getAttribute("data-outcome-drilldown-toggle") || "").trim();
      const activeRubricKey = cgdState.outcomeChartSelectedRubricKey || String(host.dataset.singleRubricKey || "").trim();
      if (expenseKey) {
        const stateKey = `${activeRubricKey}::${expenseKey}`;
        if (cgdState.outcomeDrilldownHiddenExpenses.has(stateKey)) {
          cgdState.outcomeDrilldownHiddenExpenses.delete(stateKey);
        } else {
          cgdState.outcomeDrilldownHiddenExpenses.add(stateKey);
        }
        renderOutcomeEvolutionChart();
      }
      return;
    }

    const drilldownTarget = event.target.closest("[data-outcome-chart-drilldown]");
    if (drilldownTarget) {
      const key = String(drilldownTarget.getAttribute("data-outcome-chart-drilldown") || "").trim();
      const isSameSelectedRubric = cgdState.outcomeChartSelectedRubricKey === key;

      if (isSameSelectedRubric) {
        cgdState.outcomeChartSelectedRubricKey = null;
        cgdState.outcomeChartHiddenRubrics.clear();
      } else {
        cgdState.outcomeChartSelectedRubricKey = key;
        const allRubricKeys = buildOutcomeRubricSeries().map((entry) => entry.key);
        cgdState.outcomeChartHiddenRubrics.clear();
        allRubricKeys.forEach((rubricKey) => {
          if (rubricKey !== key) {
            cgdState.outcomeChartHiddenRubrics.add(rubricKey);
          }
        });
      }

      renderOutcomeEvolutionChart();

      if (cgdState.outcomeChartSelectedRubricKey) {
        requestAnimationFrame(() => {
          const drilldown = host.querySelector(".outcome-drilldown");
          if (drilldown) {
            drilldown.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        });
      }
      return;
    }

    const toggleBtn = event.target.closest("[data-outcome-chart-toggle]");
    if (toggleBtn) {
      const key = String(toggleBtn.getAttribute("data-outcome-chart-toggle") || "").trim();
      if (key) {
        if (cgdState.outcomeChartHiddenRubrics.has(key)) {
          cgdState.outcomeChartHiddenRubrics.delete(key);
        } else {
          cgdState.outcomeChartHiddenRubrics.add(key);
          if (cgdState.outcomeChartSelectedRubricKey === key) {
            cgdState.outcomeChartSelectedRubricKey = null;
          }
        }
        renderOutcomeEvolutionChart();
      }
      return;
    }

    const selectAllBtn = event.target.closest("[data-outcome-chart-select-all]");
    if (selectAllBtn) {
      cgdState.outcomeChartHiddenRubrics.clear();
      renderOutcomeEvolutionChart();
      return;
    }

    const deselectAllBtn = event.target.closest("[data-outcome-chart-deselect-all]");
    if (deselectAllBtn) {
      host.querySelectorAll("[data-outcome-chart-toggle]").forEach((item) => {
        const key = String(item.getAttribute("data-outcome-chart-toggle") || "").trim();
        if (key) {
          cgdState.outcomeChartHiddenRubrics.add(key);
        }
      });
      cgdState.outcomeChartSelectedRubricKey = null;
      renderOutcomeEvolutionChart();
    }
  });
}

function renderOutcomeEvolutionChart() {
  const host = document.getElementById("outcome-evolution-chart");
  if (!host) {
    return;
  }

  const chartCard = host.closest(".outcome-evolution-card");
  if (!cgdState.outcomeChartVisible) {
    if (chartCard) {
      chartCard.classList.add("outcome-evolution-card-hidden");
    }
    host.innerHTML = "";
    return;
  }

  if (chartCard) {
    chartCard.classList.remove("outcome-evolution-card-hidden");
  }

  bindOutcomeChartInteractions(host);

  const series = buildOutcomeRubricSeries();
  const visibleSeries = series.filter((entry) => !cgdState.outcomeChartHiddenRubrics.has(entry.key));
  const singleVisibleRubric = visibleSeries.length === 1 ? visibleSeries[0] : null;
  host.dataset.singleRubricKey = singleVisibleRubric ? singleVisibleRubric.key : "";

  const legend = series
    .map((entry) => {
      const isVisible = !cgdState.outcomeChartHiddenRubrics.has(entry.key);
      const stateClass = isVisible ? "is-active" : "is-inactive";
      return `<button type='button' class='outcome-evolution-legend-item ${stateClass}' data-outcome-chart-toggle='${escapeHtml(entry.key)}' aria-pressed='${isVisible ? "true" : "false"}'><span class='outcome-evolution-legend-dot' style='background:${entry.color};'></span>${escapeHtml(entry.name)}</button>`;
    })
    .join("");

  if (!series.length) {
    host.innerHTML = `
      <p class='outcome-evolution-empty'>Ainda nao existem valores totalizadores para desenhar a evolucao anual.</p>
      <div class='outcome-evolution-legend'></div>
    `;
    return;
  }

  if (!visibleSeries.length) {
    host.innerHTML = `
      <p class='outcome-evolution-empty'>Nenhuma rubrica selecionada. Clica na legenda para voltar a mostrar.</p>
      <div class='outcome-evolution-legend'>${legend}</div>
    `;
    return;
  }

  const isSingleRubricMode = Boolean(singleVisibleRubric);
  const expenseSeries = isSingleRubricMode ? buildOutcomeExpenseSeriesForRubric(singleVisibleRubric) : [];
  const expenseStateKey = (expenseKey) => `${singleVisibleRubric.key}::${expenseKey}`;
  const visibleExpenseSeries = isSingleRubricMode
    ? expenseSeries.filter((entry) => !cgdState.outcomeDrilldownHiddenExpenses.has(expenseStateKey(entry.key)))
    : [];

  const chartWidth = 980;
  const chartHeight = 320;
  const padding = { top: 20, right: 18, bottom: 38, left: 54 };
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;
  const monthStep = plotWidth / (months.length - 1);
  const plotBottom = padding.top + plotHeight;

  const plottedSeries = isSingleRubricMode ? visibleExpenseSeries : visibleSeries;
  if (isSingleRubricMode && !expenseSeries.length) {
    host.innerHTML = `
      <div class='outcome-drilldown-toolbar'>
        <button type='button' class='outcome-drilldown-close-btn' data-outcome-chart-close-main>Fechar</button>
      </div>
      <div class='outcome-evolution-top-series'>${legend}</div>
      <p class='outcome-evolution-empty'>Esta rubrica nao tem despesas com valores ao longo do ano.</p>
    `;
    return;
  }

  if (isSingleRubricMode && !visibleExpenseSeries.length) {
    host.innerHTML = `
      <div class='outcome-drilldown-toolbar'>
        <button type='button' class='outcome-drilldown-close-btn' data-outcome-chart-close-main>Fechar</button>
      </div>
      <div class='outcome-evolution-top-series'>${legend}</div>
      <p class='outcome-evolution-empty'>Nenhuma despesa selecionada. Clica na legenda para voltar a mostrar.</p>
      <div class='outcome-evolution-top-series'>${expenseSeries
        .map((entry) => {
          const isVisible = !cgdState.outcomeDrilldownHiddenExpenses.has(expenseStateKey(entry.key));
          const stateClass = isVisible ? "is-active" : "is-inactive";
          return `<button type='button' class='outcome-evolution-legend-item ${stateClass}' data-outcome-drilldown-toggle='${escapeHtml(entry.key)}' aria-pressed='${isVisible ? "true" : "false"}'><span class='outcome-evolution-legend-dot' style='background:${entry.color};'></span>${escapeHtml(entry.name)}</button>`;
        })
        .join("")}</div>
    `;
    return;
  }
  const maxValue = Math.max(...plottedSeries.flatMap((entry) => entry.values));
  const yMax = maxValue > 0 ? maxValue : 1;

  const xFor = (monthIndex) => padding.left + monthIndex * monthStep;
  const yFor = (value) => padding.top + plotHeight - (value / yMax) * plotHeight;

  const horizontalGridCount = 12;
  const gridLines = Array.from({ length: horizontalGridCount + 1 }, (_, index) => {
    const ratio = index / horizontalGridCount;
    const y = padding.top + plotHeight - ratio * plotHeight;
    const labelValue = yMax * ratio;
    return `
      <line x1='${padding.left}' y1='${y}' x2='${chartWidth - padding.right}' y2='${y}' stroke='rgba(176,210,226,0.18)' stroke-width='0.7' />
      <text x='${padding.left - 8}' y='${y + 4}' text-anchor='end' fill='rgba(197,220,231,0.82)' font-size='9'>${labelValue.toFixed(0)}</text>
    `;
  }).join("");

  const monthLabels = months
    .map((month, monthIndex) => {
      const x = xFor(monthIndex);
      return `<text x='${x}' y='${chartHeight - 12}' text-anchor='middle' fill='rgba(197,220,231,0.9)' font-size='10'>${escapeHtml(month)}</text>`;
    })
    .join("");

  const monthGridLines = months
    .map((_, monthIndex) => {
      const x = xFor(monthIndex);
      return `<line x1='${x}' y1='${padding.top}' x2='${x}' y2='${padding.top + plotHeight}' stroke='rgba(176,210,226,0.12)' stroke-width='1' />`;
    })
    .join("");

  const lines = plottedSeries
    .map((entry) => {
      const isSelected = !isSingleRubricMode && entry.key === cgdState.outcomeChartSelectedRubricKey;
      const strokeWidth = isSingleRubricMode ? "0.6" : "1.3";
      const selectionClass = isSelected ? "is-selected" : "";
      const points = entry.values.map((value, monthIndex) => ({ x: xFor(monthIndex), y: yFor(value), value, monthIndex }));
      const pathData = buildSmoothPathData(points);
      const areaPath = `${pathData} L ${points[points.length - 1].x.toFixed(2)} ${plotBottom.toFixed(2)} L ${points[0].x.toFixed(2)} ${plotBottom.toFixed(2)} Z`;
      const pointsMarkup = entry.values
        .map((value, monthIndex) => {
          const cx = xFor(monthIndex);
          const cy = yFor(value);
          return `<circle class='outcome-evolution-point' cx='${cx.toFixed(2)}' cy='${cy.toFixed(2)}' r='2.8' fill='${entry.color}' tabindex='0' data-series-name='${escapeHtml(entry.name)}' data-month-name='${escapeHtml(months[monthIndex])}' data-value='${value.toFixed(2)}' data-series-color='${entry.color}'></circle>`;
        })
        .join("");
      return `
        <g class='outcome-evolution-series ${selectionClass}' ${isSingleRubricMode ? "" : `data-outcome-chart-drilldown='${escapeHtml(entry.key)}'`}>
          <path d='${areaPath}' class='outcome-evolution-area' fill='${entry.color}' fill-opacity='0.10' />
          <path d='${pathData}' class='outcome-evolution-line' fill='none' stroke='${entry.color}' stroke-width='${strokeWidth}' stroke-linecap='round' stroke-linejoin='round' />
          ${pointsMarkup}
        </g>
      `;
    })
    .join("");

  const expenseLegend = isSingleRubricMode
    ? expenseSeries
        .map((entry) => {
          const isVisible = !cgdState.outcomeDrilldownHiddenExpenses.has(expenseStateKey(entry.key));
          const stateClass = isVisible ? "is-active" : "is-inactive";
          return `<button type='button' class='outcome-evolution-legend-item ${stateClass}' data-outcome-drilldown-toggle='${escapeHtml(entry.key)}' aria-pressed='${isVisible ? "true" : "false"}'><span class='outcome-evolution-legend-dot' style='background:${entry.color};'></span>${escapeHtml(entry.name)}</button>`;
        })
        .join("")
    : "";

  const singleRubricLegendMarkup = isSingleRubricMode && expenseSeries.length
    ? `<div class='outcome-evolution-top-series'>${expenseLegend}</div>`
    : "";

  host.innerHTML = `
    <div class='outcome-drilldown-toolbar'>
      <button type='button' class='outcome-drilldown-close-btn' data-outcome-chart-close-main>Fechar</button>
    </div>
    <div class='outcome-evolution-top-series'>${legend}</div>
    ${singleRubricLegendMarkup}
    <div class='outcome-evolution-svg-wrap'>
      <svg class='outcome-evolution-svg' viewBox='0 0 ${chartWidth} ${chartHeight}' role='img' aria-label='${isSingleRubricMode ? "Grafico de linhas com evolucao das despesas da rubrica selecionada" : "Grafico de linhas com evolucao das rubricas de outcome"}'>
        ${gridLines}
        ${monthGridLines}
        ${lines}
        ${monthLabels}
      </svg>
      <div class='outcome-evolution-tooltip' aria-hidden='true'></div>
    </div>
  `;

  bindOutcomeChartHover(host);
}

function renderPanels() {
  const panels = document.getElementById("cgd-panels");
  if (!panels) {
    return;
  }

  const collapseState = captureCollapseState();

  panels.innerHTML = `
    ${buildPanel("Income", "income", cgdState.data.income)}
    <section class='outcome-evolution-card income-evolution-card'>
      <div class='outcome-evolution' id='income-evolution-chart' aria-live='polite'></div>
    </section>
    <section class='outcome-evolution-card income-comparison-card'>
      <div class='outcome-evolution' id='income-comparison-chart' aria-live='polite'></div>
    </section>
    ${buildPanel("Outcome", "outcome", cgdState.data.outcome)}
  `;

  restoreCollapseState(collapseState);

  renderIncomeEvolutionChart();
  renderIncomeComparisonChart();
  renderOutcomeEvolutionChart();
  renderOutcomeComparisonChart();
}

function buildComparisonSeriesForKind(kind) {
  const palette = kind === "income"
    ? ["#6ecf9a", "#7cc4ff", "#9ed86b", "#58d2c3", "#8bcf7a", "#5fb3de", "#9edfb7", "#71d0ff", "#77c87f", "#79bdf0"]
    : ["#f2c46a", "#f08b5f", "#5fc8b6", "#7cb7ff", "#84d56b", "#f29db1", "#a9e46f", "#9ad9ff", "#e6b86d", "#8bd3a0"];
  const sourceRubrics = kind === "income" ? cgdState.data?.income : cgdState.data?.outcome;
  const rubrics = Array.isArray(sourceRubrics) ? sourceRubrics : [];

  return rubrics
    .map((rubric, index) => {
      const rawId = rubric?.id;
      const key = Number.isFinite(Number(rawId)) ? `id-${Number(rawId)}` : `idx-${index}`;
      const valueTotals = emptyValues();
      const estimatedTotals = emptyValues();

    const expenses = Array.isArray(rubric?.expenses) ? rubric.expenses : [];
    expenses.forEach((expense) => {
      months.forEach((_, monthIndex) => {
        const monthData = expense?.monthData?.[monthIndex] || {};
        const rawValor = Number(monthData.valor);
        const rawEstimado = Number(monthData.valorEstimado);
        valueTotals[monthIndex] += Number.isFinite(rawValor) ? rawValor : 0;
        estimatedTotals[monthIndex] += Number.isFinite(rawEstimado) ? rawEstimado : 0;
      });
    });

      return {
        key,
        name: rubric?.name || `Rubrica ${index + 1}`,
        color: palette[index % palette.length],
        values: valueTotals,
        estimatedValues: estimatedTotals
      };
    })
    .filter((entry) => entry.values.some((value) => value !== 0) || entry.estimatedValues.some((value) => value !== 0));
}

function bindComparisonChartHover(host) {
  if (!host) {
    return;
  }

  host.querySelectorAll(".outcome-evolution-svg-wrap").forEach((wrap) => {
    const tooltip = wrap.querySelector(".outcome-evolution-tooltip");
    if (!tooltip) {
      return;
    }

    const hideTooltip = () => {
      tooltip.classList.remove("is-visible");
    };

    wrap.addEventListener("pointerleave", hideTooltip);

    wrap.querySelectorAll("[data-comparison-point]").forEach((point) => {
      const showTooltip = (event) => {
        const monthName = point.getAttribute("data-month-name") || "";
        const seriesName = point.getAttribute("data-series-name") || "";
        const value = point.getAttribute("data-value") || "0.00";
        const color = point.getAttribute("data-series-color") || "#b8ced9";

        tooltip.innerHTML = `
          <div class='outcome-evolution-tooltip-month'>${escapeHtml(monthName)}</div>
          <div class='outcome-evolution-tooltip-row'>
            <span class='outcome-evolution-tooltip-dot' style='background:${escapeHtml(color)};'></span>
            <span class='outcome-evolution-tooltip-series'>${escapeHtml(seriesName)}</span>
            <strong class='outcome-evolution-tooltip-value'>${escapeHtml(value)}</strong>
          </div>
        `;
        tooltip.classList.add("is-visible");
        positionOutcomeChartTooltip(tooltip, wrap, event);
      };

      point.addEventListener("pointerenter", showTooltip);
      point.addEventListener("pointermove", showTooltip);
      point.addEventListener("focus", (event) => showTooltip(event));
      point.addEventListener("blur", hideTooltip);
    });
  });
}

function bindComparisonChartInteractions(host, kind) {
  if (!host || host.dataset.comparisonChartBound === "1") {
    return;
  }

  host.dataset.comparisonChartBound = "1";
  host.addEventListener("click", (event) => {
    const hiddenSet = kind === "income" ? cgdState.incomeComparisonHiddenRubrics : cgdState.outcomeComparisonHiddenRubrics;

    const closeBtn = event.target.closest("[data-income-comparison-chart-close-main], [data-outcome-comparison-chart-close-main]");
    if (closeBtn) {
      hiddenSet.clear();
      if (kind === "income") {
        cgdState.incomeComparisonChartVisible = false;
      } else {
        cgdState.outcomeComparisonChartVisible = false;
      }

      renderPanels();
      document.dispatchEvent(new Event("cgd:rendered"));
      requestAnimationFrame(() => {
        ensurePanelHeadVisible(kind);
      });
      return;
    }

    const toggleBtn = event.target.closest("[data-comparison-chart-toggle]");
    if (toggleBtn) {
      const key = String(toggleBtn.getAttribute("data-comparison-chart-toggle") || "").trim();
      if (!key) {
        return;
      }

      if (hiddenSet.has(key)) {
        hiddenSet.delete(key);
      } else {
        hiddenSet.add(key);
      }

      if (kind === "income") {
        renderIncomeComparisonChart();
      } else {
        renderOutcomeComparisonChart();
      }
      return;
    }

    const selectAllBtn = event.target.closest("[data-comparison-chart-select-all]");
    if (selectAllBtn) {
      hiddenSet.clear();
      if (kind === "income") {
        renderIncomeComparisonChart();
      } else {
        renderOutcomeComparisonChart();
      }
      return;
    }

    const deselectAllBtn = event.target.closest("[data-comparison-chart-deselect-all]");
    if (deselectAllBtn) {
      host.querySelectorAll("[data-comparison-chart-toggle]").forEach((item) => {
        const key = String(item.getAttribute("data-comparison-chart-toggle") || "").trim();
        if (key) {
          hiddenSet.add(key);
        }
      });
      if (kind === "income") {
        renderIncomeComparisonChart();
      } else {
        renderOutcomeComparisonChart();
      }
    }
  });
}

function renderComparisonChart({ hostId, kind, isVisible, closeAttr }) {
  const host = document.getElementById(hostId);
  if (!host) {
    return;
  }

  const chartCard = host.closest(".outcome-evolution-card");
  if (!isVisible) {
    if (chartCard) {
      chartCard.classList.add("outcome-evolution-card-hidden");
    }
    host.innerHTML = "";
    return;
  }

  if (chartCard) {
    chartCard.classList.remove("outcome-evolution-card-hidden");
  }

  bindComparisonChartInteractions(host, kind);

  const hiddenSet = kind === "income" ? cgdState.incomeComparisonHiddenRubrics : cgdState.outcomeComparisonHiddenRubrics;
  const rubricSeries = buildComparisonSeriesForKind(kind);

  if (!rubricSeries.length) {
    host.innerHTML = `
      <div class='outcome-drilldown-toolbar'>
        <button type='button' class='outcome-drilldown-close-btn' ${closeAttr}>Fechar</button>
      </div>
      <p class='outcome-evolution-empty'>Ainda nao existem valores para comparar valor e valor estimado.</p>
    `;
    return;
  }

  const visibleRubrics = rubricSeries.filter((entry) => !hiddenSet.has(entry.key));
  const legend = rubricSeries
    .map((entry) => {
      const isVisibleRubric = !hiddenSet.has(entry.key);
      const stateClass = isVisibleRubric ? "is-active" : "is-inactive";
      return `<button type='button' class='outcome-evolution-legend-item ${stateClass}' data-comparison-chart-toggle='${escapeHtml(entry.key)}' aria-pressed='${isVisibleRubric ? "true" : "false"}'><span class='outcome-evolution-legend-dot' style='background:${entry.color};'></span>${escapeHtml(entry.name)}</button>`;
    })
    .join("");

  if (!visibleRubrics.length) {
    host.innerHTML = `
      <div class='outcome-drilldown-toolbar'>
        <button type='button' class='outcome-drilldown-close-btn' ${closeAttr}>Fechar</button>
      </div>
      <div class='outcome-evolution-controls'>
        <button type='button' class='outcome-evolution-control-btn' data-comparison-chart-select-all>Selecionar todas</button>
        <button type='button' class='outcome-evolution-control-btn' data-comparison-chart-deselect-all>Desselecionar todas</button>
      </div>
      <p class='outcome-evolution-empty'>Nenhuma rubrica selecionada. Clica na legenda para voltar a mostrar.</p>
      <div class='outcome-evolution-top-series'>${legend}</div>
    `;
    return;
  }

  const chartWidth = 980;
  const chartHeight = 320;
  const padding = { top: 20, right: 18, bottom: 38, left: 54 };
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;
  const monthBand = plotWidth / months.length;

  const maxValue = Math.max(...visibleRubrics.flatMap((entry) => [...entry.values, ...entry.estimatedValues]));
  const yMax = maxValue > 0 ? maxValue : 1;

  const xFor = (monthIndex) => padding.left + monthIndex * monthBand;
  const yFor = (value) => padding.top + plotHeight - (value / yMax) * plotHeight;

  const horizontalGridCount = 12;
  const gridLines = Array.from({ length: horizontalGridCount + 1 }, (_, index) => {
    const ratio = index / horizontalGridCount;
    const y = padding.top + plotHeight - ratio * plotHeight;
    const labelValue = yMax * ratio;
    return `
      <line x1='${padding.left}' y1='${y}' x2='${chartWidth - padding.right}' y2='${y}' stroke='rgba(176,210,226,0.18)' stroke-width='0.7' />
      <text x='${padding.left - 8}' y='${y + 4}' text-anchor='end' fill='rgba(197,220,231,0.82)' font-size='9'>${labelValue.toFixed(0)}</text>
    `;
  }).join("");

  const monthLabels = months
    .map((month, monthIndex) => {
      const x = xFor(monthIndex) + monthBand / 2;
      return `<text x='${x}' y='${chartHeight - 12}' text-anchor='middle' fill='rgba(197,220,231,0.9)' font-size='10'>${escapeHtml(month)}</text>`;
    })
    .join("");

  const monthGridLines = months
    .map((_, monthIndex) => {
      const x = xFor(monthIndex) + monthBand / 2;
      return `<line x1='${x}' y1='${padding.top}' x2='${x}' y2='${padding.top + plotHeight}' stroke='rgba(176,210,226,0.12)' stroke-width='1' />`;
    })
    .join("");

  const barPairsPerMonth = Math.max(visibleRubrics.length, 1);
  const monthInnerPadding = 6;
  const barSlotWidth = Math.max((monthBand - monthInnerPadding * 2) / (barPairsPerMonth * 2), 2);
  const barWidth = Math.min(barSlotWidth, 11);
  const clusterWidth = barPairsPerMonth * 2 * barWidth;

  const bars = months
    .map((monthName, monthIndex) => {
      const monthStart = xFor(monthIndex) + monthBand / 2 - clusterWidth / 2;
      return visibleRubrics
        .map((rubric, rubricIndex) => {
          const baseX = monthStart + rubricIndex * 2 * barWidth;
          const value = Number(rubric.values?.[monthIndex]) || 0;
          const estimated = Number(rubric.estimatedValues?.[monthIndex]) || 0;
          const valueY = yFor(value);
          const estimatedY = yFor(estimated);
          const valueHeight = Math.max(padding.top + plotHeight - valueY, 1);
          const estimatedHeight = Math.max(padding.top + plotHeight - estimatedY, 1);

          return `
            <rect class='outcome-comparison-bar' x='${baseX.toFixed(2)}' y='${valueY.toFixed(2)}' width='${barWidth.toFixed(2)}' height='${valueHeight.toFixed(2)}' fill='${rubric.color}' data-comparison-point tabindex='0' data-series-name='${escapeHtml(`${rubric.name} · Valor`)}' data-month-name='${escapeHtml(monthName)}' data-value='${value.toFixed(2)}' data-series-color='${rubric.color}'></rect>
            <rect class='outcome-comparison-bar outcome-comparison-bar-estimated' x='${(baseX + barWidth).toFixed(2)}' y='${estimatedY.toFixed(2)}' width='${barWidth.toFixed(2)}' height='${estimatedHeight.toFixed(2)}' fill='${rubric.color}' fill-opacity='0.42' stroke='${rubric.color}' stroke-width='0.8' data-comparison-point tabindex='0' data-series-name='${escapeHtml(`${rubric.name} · Estimado`)}' data-month-name='${escapeHtml(monthName)}' data-value='${estimated.toFixed(2)}' data-series-color='${rubric.color}'></rect>
          `;
        })
        .join("");
    })
    .join("");

  const chartLabel = kind === "income"
    ? "Grafico comparativo mensal de valor e valor estimado do income"
    : "Grafico comparativo mensal de valor e valor estimado do outcome";

  host.innerHTML = `
    <div class='outcome-drilldown-toolbar'>
      <button type='button' class='outcome-drilldown-close-btn' ${closeAttr}>Fechar</button>
    </div>
    <div class='outcome-evolution-controls'>
      <button type='button' class='outcome-evolution-control-btn' data-comparison-chart-select-all>Selecionar todas</button>
      <button type='button' class='outcome-evolution-control-btn' data-comparison-chart-deselect-all>Desselecionar todas</button>
    </div>
    <div class='outcome-evolution-top-series'>${legend}</div>
    <div class='outcome-evolution-svg-wrap'>
      <svg class='outcome-evolution-svg' viewBox='0 0 ${chartWidth} ${chartHeight}' role='img' aria-label='${chartLabel}'>
        ${gridLines}
        ${monthGridLines}
        ${bars}
        ${monthLabels}
      </svg>
      <div class='outcome-evolution-tooltip' aria-hidden='true'></div>
    </div>
  `;

  bindComparisonChartHover(host);
}

function renderIncomeComparisonChart() {
  renderComparisonChart({
    hostId: "income-comparison-chart",
    kind: "income",
    isVisible: cgdState.incomeComparisonChartVisible,
    closeAttr: "data-income-comparison-chart-close-main"
  });
}

function renderOutcomeComparisonChart() {
  renderComparisonChart({
    hostId: "outcome-comparison-chart",
    kind: "outcome",
    isVisible: cgdState.outcomeComparisonChartVisible,
    closeAttr: "data-outcome-comparison-chart-close-main"
  });
}

window.cgdToggleIncomeChart = () => {
  cgdState.incomeChartVisible = !cgdState.incomeChartVisible;
  if (!cgdState.incomeChartVisible) {
    cgdState.incomeChartSelectedRubricKey = null;
    cgdState.incomeChartHiddenRubrics.clear();
  }
  renderPanels();
  document.dispatchEvent(new Event("cgd:rendered"));

  if (cgdState.incomeChartVisible) {
    scheduleChartOpenScroll(".income-evolution-card");
  } else {
    requestAnimationFrame(() => {
      ensurePanelHeadVisible("income");
    });
  }

  return cgdState.incomeChartVisible;
};

window.cgdToggleIncomeComparisonChart = () => {
  cgdState.incomeComparisonChartVisible = !cgdState.incomeComparisonChartVisible;
  if (!cgdState.incomeComparisonChartVisible) {
    cgdState.incomeComparisonHiddenRubrics.clear();
  }
  renderPanels();
  document.dispatchEvent(new Event("cgd:rendered"));

  if (cgdState.incomeComparisonChartVisible) {
    scheduleChartOpenScroll(".income-comparison-card");
  } else {
    requestAnimationFrame(() => {
      ensurePanelHeadVisible("income");
    });
  }

  return cgdState.incomeComparisonChartVisible;
};

window.cgdToggleOutcomeChart = () => {
  cgdState.outcomeChartVisible = !cgdState.outcomeChartVisible;
  if (!cgdState.outcomeChartVisible) {
    cgdState.outcomeChartSelectedRubricKey = null;
    cgdState.outcomeChartHiddenRubrics.clear();
  }
  renderPanels();
  document.dispatchEvent(new Event("cgd:rendered"));

  if (cgdState.outcomeChartVisible) {
    scheduleChartOpenScrollByHostId("outcome-evolution-chart");
  } else {
    requestAnimationFrame(() => {
      ensurePanelHeadVisible("outcome");
    });
  }

  return cgdState.outcomeChartVisible;
};

window.cgdToggleOutcomeComparisonChart = () => {
  cgdState.outcomeComparisonChartVisible = !cgdState.outcomeComparisonChartVisible;
  if (!cgdState.outcomeComparisonChartVisible) {
    cgdState.outcomeComparisonHiddenRubrics.clear();
  }
  renderPanels();
  document.dispatchEvent(new Event("cgd:rendered"));

  if (cgdState.outcomeComparisonChartVisible) {
    scheduleChartOpenScroll(".outcome-comparison-card");
  } else {
    requestAnimationFrame(() => {
      ensurePanelHeadVisible("outcome");
    });
  }

  return cgdState.outcomeComparisonChartVisible;
};

async function loadYearData(year) {
  cgdState.selectedYear = year;
  const yearLabel = document.querySelector("[data-year-label]");
  if (yearLabel) {
    yearLabel.textContent = String(year);
  }

  if (!supabaseClient) {
    cgdState.data = fallbackMock;
    renderPanels();
    document.dispatchEvent(new Event("cgd:rendered"));
    return;
  }

  try {
    const [rubricsResult, expensesResult, expenseHistoryResult] = await Promise.allSettled([
      fetchRubricsForYear(year),
      fetchExpensesForYear(year),
      fetchExpenseHistoryMonthKeysForYear(year)
    ]);

    const rubricRows = rubricsResult.status === "fulfilled" ? rubricsResult.value : [];
    const expenseRows = expensesResult.status === "fulfilled" ? expensesResult.value : [];
    cgdState.expenseColumns = new Set(expenseRows.flatMap((row) => Object.keys(row || {})));

    if (rubricsResult.status === "rejected") {
      console.error("Erro a carregar rubricas CGD:", rubricsResult.reason);
    }

    if (expensesResult.status === "rejected") {
      console.error("Erro a carregar despesas CGD:", expensesResult.reason);
    }

    if (expenseHistoryResult.status === "rejected") {
      console.error("Erro a carregar historico de notas CGD:", expenseHistoryResult.reason);
    }

    const expenseHistoryMonthKeys = expenseHistoryResult.status === "fulfilled" ? expenseHistoryResult.value : new Set();
    cgdState.data = buildDataModel(rubricRows, expenseRows, expenseHistoryMonthKeys);
    renderPanels();
    document.dispatchEvent(new Event("cgd:rendered"));
  } catch (error) {
    console.error("Erro a carregar dados CGD:", error);
    cgdState.data = fallbackMock;
    renderPanels();
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

async function getNextRubricaId() {
  const { data, error } = await supabaseClient
    .from("cgd_rubrica")
    .select("rubrica_id")
    .order("rubrica_id", { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

  const maxId = Number(data?.[0]?.rubrica_id || 0);
  return Number.isFinite(maxId) ? maxId + 1 : 1;
}

async function createRubricaForYear(kind, description) {
  if (!supabaseClient) {
    return;
  }

  const normalizedKind = kind === "income" ? "income" : "outcome";
  const rubricaTipo = normalizedKind === "income" ? "Receita" : "Despesa";
  const existing = cgdState.data[normalizedKind] || [];
  const nextSeq = existing.length ? Math.max(...existing.map((item) => parseSeq(item.seq, 0))) + 1 : 1;
  const nextRubricaId = await getNextRubricaId();

  const rows = Array.from({ length: 12 }, (_, index) => ({
    ano: cgdState.selectedYear,
    mes: index + 1,
    rubrica_id: nextRubricaId,
    rubrica_desc: description,
    rubrica_seq: nextSeq,
    rubrica_tipo: rubricaTipo
  }));

  const { error } = await supabaseClient.from("cgd_rubrica").insert(rows);
  if (error) {
    throw error;
  }
}

async function getNextDespesaId() {
  const { data, error } = await supabaseClient
    .from("cgd_despesa")
    .select("despesa_id")
    .order("despesa_id", { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

  const maxId = Number(data?.[0]?.despesa_id || 0);
  return Number.isFinite(maxId) ? maxId + 1 : 1;
}

async function createDespesaForRubrica(rubricaId, description) {
  if (!supabaseClient || !Number.isFinite(rubricaId)) {
    return;
  }

  const rubricType = cgdState.data.income.some((rubric) => Number(rubric.id) === rubricaId) ? "income" : "outcome";
  const sourceRubrics = rubricType === "income" ? cgdState.data.income : cgdState.data.outcome;
  const rubric = sourceRubrics.find((item) => Number(item.id) === rubricaId);
  const existingExpenses = rubric?.expenses || [];
  const nextSeq = existingExpenses.length ? Math.max(...existingExpenses.map((item) => parseSeq(item.seq, 0))) + 1 : 1;
  const nextDespesaId = await getNextDespesaId();

  const rows = Array.from({ length: 12 }, (_, index) => ({
    ano: cgdState.selectedYear,
    mes: index + 1,
    rubrica_id: rubricaId,
    despesa_id: nextDespesaId,
    despesa_desc: description,
    despesa_seq: nextSeq,
    valor: 0,
    totalizador: true
  }));

  const { error } = await supabaseClient.from("cgd_despesa").insert(rows);
  if (error) {
    throw error;
  }
}

function requestEntityDescription(options) {
  const modal = document.getElementById("rubric-modal");
  const input = modal?.querySelector("[data-rubric-desc]");
  const title = modal?.querySelector("[data-rubric-modal-title]");
  const subtitle = modal?.querySelector("[data-rubric-modal-subtitle]");
  const label = modal?.querySelector("[data-rubric-modal-label]");
  const confirmBtn = modal?.querySelector("[data-rubric-confirm]");
  const cancelBtn = modal?.querySelector("[data-rubric-cancel]");

  if (!modal || !input || !confirmBtn || !cancelBtn) {
    const fallback = window.prompt(options?.promptText || "Descricao", "");
    return Promise.resolve(fallback ? fallback.trim() : null);
  }

  return new Promise((resolve) => {
    input.value = "";
    if (title) {
      title.textContent = options?.title || "Adicionar";
    }
    if (subtitle) {
      subtitle.textContent = options?.subtitle || "Indica o descritivo.";
    }
    if (label) {
      label.textContent = options?.label || "Descricao";
    }

    const close = (result) => {
      modal.classList.remove("show");
      modal.setAttribute("aria-hidden", "true");
      confirmBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);
      modal.removeEventListener("click", onBackdrop);
      input.removeEventListener("keydown", onKeydown);
      resolve(result);
    };

    const onConfirm = () => {
      const value = input.value.trim();
      close(value || null);
    };

    const onCancel = () => close(null);

    const onBackdrop = (event) => {
      if (event.target === modal) {
        close(null);
      }
    };

    const onKeydown = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        onConfirm();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };

    confirmBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onCancel);
    modal.addEventListener("click", onBackdrop);
    input.addEventListener("keydown", onKeydown);

    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => input.focus());
  });
}

function requestConfirmation(options) {
  const modal = document.getElementById("confirm-modal");
  const title = modal?.querySelector("[data-confirm-title]");
  const subtitle = modal?.querySelector("[data-confirm-subtitle]");
  const confirmBtn = modal?.querySelector("[data-confirm-yes]");
  const cancelBtn = modal?.querySelector("[data-confirm-no]");

  if (!modal || !confirmBtn || !cancelBtn) {
    return Promise.resolve(window.confirm(options?.subtitle || options?.title || "Confirmar"));
  }

  return new Promise((resolve) => {
    if (title) {
      title.textContent = options?.title || "Confirmar";
    }
    if (subtitle) {
      subtitle.textContent = options?.subtitle || "Tem a certeza que pretende continuar?";
    }

    const close = (result) => {
      modal.classList.remove("show");
      modal.setAttribute("aria-hidden", "true");
      confirmBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);
      modal.removeEventListener("click", onBackdrop);
      resolve(result);
    };

    const onConfirm = () => close(true);
    const onCancel = () => close(false);
    const onBackdrop = (event) => {
      if (event.target === modal) {
        close(false);
      }
    };

    confirmBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onCancel);
    modal.addEventListener("click", onBackdrop);

    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
  });
}

async function deleteDespesaForYear(rubricaId, despesaId) {
  if (!supabaseClient) {
    return;
  }

  const { error } = await supabaseClient
    .from("cgd_despesa")
    .delete()
    .eq("ano", cgdState.selectedYear)
    .eq("rubrica_id", rubricaId)
    .eq("despesa_id", despesaId);

  if (error) {
    throw error;
  }
}

async function deleteRubricaForYear(rubricaId) {
  if (!supabaseClient) {
    return;
  }

  const { error: expenseError } = await supabaseClient
    .from("cgd_despesa")
    .delete()
    .eq("ano", cgdState.selectedYear)
    .eq("rubrica_id", rubricaId);

  if (expenseError) {
    throw expenseError;
  }

  const { error: rubricError } = await supabaseClient
    .from("cgd_rubrica")
    .delete()
    .eq("ano", cgdState.selectedYear)
    .eq("rubrica_id", rubricaId);

  if (rubricError) {
    throw rubricError;
  }
}

function findExpenseRecord(rubricaId, despesaId) {
  const allRubrics = [...(cgdState.data.income || []), ...(cgdState.data.outcome || [])];
  for (const rubric of allRubrics) {
    if (Number(rubric.id) !== Number(rubricaId)) {
      continue;
    }
    const expense = (rubric.expenses || []).find((item) => Number(item.id) === Number(despesaId));
    if (expense) {
      return { rubric, expense };
    }
  }
  return null;
}

function resolveSelectedExpenseKey({ rubricaId, despesaId, monthIndex }) {
  const index = Number(monthIndex);
  if (!Number.isInteger(index) || index < 0 || index > 11) {
    return null;
  }

  const found = findExpenseRecord(rubricaId, despesaId);
  if (!found) {
    return null;
  }

  const resolvedRubricaId = Number(found.expense?.rubricId ?? rubricaId);
  const resolvedDespesaId = Number(found.expense?.id ?? despesaId);
  if (!Number.isFinite(resolvedRubricaId) || !Number.isFinite(resolvedDespesaId)) {
    return null;
  }

  return {
    ano: Number(cgdState.selectedYear),
    rubricaId: resolvedRubricaId,
    despesaId: resolvedDespesaId,
    mes: index + 1
  };
}

function resolveExpenseUpdatePayload(detail) {
  const payload = {
    valor: detail.valor,
    totalizador: detail.totalizador
  };

  if (cgdState.expenseColumns.has("valor_estimado")) {
    payload.valor_estimado = detail.valorEstimado;
  } else if (cgdState.expenseColumns.has("valor_Estimado")) {
    payload.valor_Estimado = detail.valorEstimado;
  }

  if (cgdState.expenseColumns.has("nota")) {
    payload.nota = detail.nota;
  } else if (cgdState.expenseColumns.has("notas")) {
    payload.notas = detail.nota;
  }

  return payload;
}

window.cgdLoadYearData = loadYearData;

window.cgdCreateRubric = async (kind) => {
  const description = await requestEntityDescription({
    title: `Adicionar rubrica ${kind === "income" ? "Income" : "Outcome"}`,
    subtitle: "Indica o descritivo da nova rubrica para o ano selecionado.",
    label: "Descricao da rubrica",
    promptText: "Descricao da nova rubrica"
  });
  if (!description) {
    return false;
  }

  try {
    await createRubricaForYear(kind, description.trim());
    await loadYearData(cgdState.selectedYear);
    return true;
  } catch (error) {
    console.error("Erro ao criar rubrica:", error);
    return false;
  }
};

window.cgdCreateExpense = async (rubricaId) => {
  const description = await requestEntityDescription({
    title: "Adicionar despesa",
    subtitle: "Indica o descritivo da nova despesa para a rubrica selecionada.",
    label: "Descricao da despesa",
    promptText: "Descricao da nova despesa"
  });
  if (!description) {
    return false;
  }

  try {
    await createDespesaForRubrica(Number(rubricaId), description.trim());
    await loadYearData(cgdState.selectedYear);
    return true;
  } catch (error) {
    console.error("Erro ao criar despesa:", error);
    return false;
  }
};

window.cgdDeleteExpense = async (rubricaId, despesaId) => {
  const confirmed = await requestConfirmation({
    title: "Eliminar despesa",
    subtitle: "Tem a certeza que pretende eliminar a despesa selecionada para o ano atual?"
  });

  if (!confirmed) {
    return false;
  }

  try {
    await deleteDespesaForYear(Number(rubricaId), Number(despesaId));
    await loadYearData(cgdState.selectedYear);
    return true;
  } catch (error) {
    console.error("Erro ao eliminar despesa:", error);
    return false;
  }
};

window.cgdDeleteRubric = async (rubricaId) => {
  const confirmed = await requestConfirmation({
    title: "Eliminar rubrica",
    subtitle: "Tem a certeza que pretende eliminar esta rubrica? As despesas contidas na rubrica tambem serao eliminadas."
  });

  if (!confirmed) {
    return false;
  }

  try {
    await deleteRubricaForYear(Number(rubricaId));
    await loadYearData(cgdState.selectedYear);
    return true;
  } catch (error) {
    console.error("Erro ao eliminar rubrica:", error);
    return false;
  }
};

window.cgdGetExpenseDetail = ({ rubricaId, despesaId, monthIndex }) => {
  const index = Number(monthIndex);
  const found = findExpenseRecord(rubricaId, despesaId);
  if (!found || !Number.isInteger(index) || index < 0 || index > 11) {
    return null;
  }

  const monthDetail = found.expense.monthData?.[index] || {
    valor: 0,
    valorEstimado: 0,
    totalizador: false,
    nota: ""
  };

  return {
    valor: Number(monthDetail.valor) || 0,
    valorEstimado: Number(monthDetail.valorEstimado) || 0,
    totalizador: Boolean(monthDetail.totalizador),
    nota: monthDetail.nota || ""
  };
};

window.cgdGetExpenseNotes = async ({ rubricaId, despesaId, monthIndex }) => {
  const selectedKey = resolveSelectedExpenseKey({ rubricaId, despesaId, monthIndex });
  if (!selectedKey) {
    return [];
  }

  const rows = await fetchExpenseNotesForKey({
    ano: selectedKey.ano,
    rubricaId: selectedKey.rubricaId,
    despesaId: selectedKey.despesaId,
    mes: selectedKey.mes
  });

  return rows
    .map((row) => ({
      contadorId: Number(row.contador_id) || 0,
      valor: Number(row.valor) || 0,
      nota: row.nota ?? row.notas ?? ""
    }))
    .sort((a, b) => a.contadorId - b.contadorId);
};

window.cgdDeleteExpenseNote = async ({ rubricaId, despesaId, monthIndex, contadorId }) => {
  const selectedKey = resolveSelectedExpenseKey({ rubricaId, despesaId, monthIndex });
  if (!selectedKey) {
    return false;
  }

  const normalizedCounter = Number(contadorId);
  if (!Number.isFinite(normalizedCounter)) {
    return false;
  }

  await deleteExpenseNoteEntry({
    ano: selectedKey.ano,
    rubricaId: selectedKey.rubricaId,
    despesaId: selectedKey.despesaId,
    mes: selectedKey.mes,
    contadorId: normalizedCounter
  });

  return true;
};

window.cgdSaveExpenseDetail = async ({ rubricaId, despesaId, monthIndex, valor, valorEstimado, totalizador, nota, applyToEndYear, adjustmentValue, registerAdjustment }) => {
  if (!supabaseClient) {
    return false;
  }

  const selectedKey = resolveSelectedExpenseKey({ rubricaId, despesaId, monthIndex });
  if (!selectedKey) {
    return false;
  }

  const startMonth = selectedKey.mes;

  const normalizedValor = Number(valor);
  const normalizedValorEstimado = Number(valorEstimado);
  const detail = {
    valor: Number.isFinite(normalizedValor) ? normalizedValor : 0,
    valorEstimado: Number.isFinite(normalizedValorEstimado) ? normalizedValorEstimado : 0,
    totalizador: Boolean(totalizador),
    nota: nota == null ? "" : String(nota)
  };

  const payload = resolveExpenseUpdatePayload(detail);
  const targetMonths = applyToEndYear
    ? Array.from({ length: 13 - startMonth }, (_, index) => startMonth + index)
    : [startMonth];

  if (applyToEndYear) {
    await supabaseClient
      .from("cgd_despesa")
      .update(payload)
      .eq("ano", selectedKey.ano)
      .eq("rubrica_id", selectedKey.rubricaId)
      .eq("despesa_id", selectedKey.despesaId)
      .gte("mes", startMonth);
  } else {
    await supabaseClient
      .from("cgd_despesa")
      .update(payload)
      .eq("ano", selectedKey.ano)
      .eq("rubrica_id", selectedKey.rubricaId)
      .eq("despesa_id", selectedKey.despesaId)
      .eq("mes", startMonth);
  }

  const numericAdjustment = Number(adjustmentValue);
  const adjustmentNote = String(nota == null ? "" : nota).trim();
  const shouldRegisterAdjustment =
    Boolean(registerAdjustment) && Number.isFinite(numericAdjustment) && numericAdjustment !== 0 && adjustmentNote.length > 0;
  if (shouldRegisterAdjustment) {
    await Promise.all(
      targetMonths.map((mes) =>
        createExpenseNoteEntry({
          ano: selectedKey.ano,
          rubricaId: selectedKey.rubricaId,
          despesaId: selectedKey.despesaId,
          mes,
          valor: numericAdjustment,
          nota: adjustmentNote
        })
      )
    );
  }

  await loadYearData(cgdState.selectedYear);
  return true;
};

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

  const rows = Array.from(parent.querySelectorAll("article.rubric[data-sortable]"));
  persistRubricOrder(rows).catch((error) => {
    console.error("Erro ao guardar ordem de rubricas:", error);
  });

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
  const rows = Array.from(parent.querySelectorAll(".data-row.expense[data-sortable]"));
  persistExpenseOrder(rows, rubricId).catch((error) => {
    console.error("Erro ao guardar ordem de despesas:", error);
  });

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

