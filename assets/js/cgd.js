const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const emptyValues = () => Array.from({ length: 12 }, () => 0);

const fallbackMock = {
  income: [],
  outcome: []
};

const cgdState = {
  selectedYear: new Date().getFullYear(),
  data: fallbackMock,
  expenseColumns: new Set()
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

  const buildQuery = (includeMonth) => {
    let query = supabaseClient
      .from("cgd_despesas_notas")
      .select("*")
      .eq("ano", Number(ano))
      .eq("rubrica_id", Number(rubricaId))
      .eq("despesa_id", Number(despesaId))
      .order("contador_id", { ascending: true });

    if (includeMonth) {
      query = query.eq("mes", Number(mes));
    }

    return query;
  };

  const { data: monthScopedRows, error: monthScopedError } = await buildQuery(true);
  if (monthScopedError) {
    throw monthScopedError;
  }

  const monthScoped = Array.isArray(monthScopedRows) ? monthScopedRows : [];
  if (monthScoped.length) {
    return monthScoped;
  }

  const { data: expenseScopedRows, error: expenseScopedError } = await buildQuery(false);
  if (expenseScopedError) {
    throw expenseScopedError;
  }

  return Array.isArray(expenseScopedRows) ? expenseScopedRows : [];
}

async function createExpenseNoteEntry({ ano, rubricaId, despesaId, mes, valor, nota }) {
  if (!supabaseClient) {
    return;
  }

  const filters = (query) =>
    query
      .eq("ano", Number(ano))
      .eq("rubrica_id", Number(rubricaId))
      .eq("despesa_id", Number(despesaId))
      .eq("mes", Number(mes));

  const { data: latestRows, error: latestError } = await filters(
    supabaseClient.from("cgd_despesas_notas").select("contador_id").order("contador_id", { ascending: false }).limit(1)
  );

  if (latestError) {
    throw latestError;
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

  const { error: insertError } = await supabaseClient
    .from("cgd_despesas_notas")
    .insert({
      ...basePayload,
      nota: noteText
    });

  if (!insertError) {
    return;
  }

  const shouldRetryWithNotas = /column/i.test(String(insertError.message || "")) && /nota/i.test(String(insertError.message || ""));
  if (!shouldRetryWithNotas) {
    throw insertError;
  }

  const { error: retryError } = await supabaseClient
    .from("cgd_despesas_notas")
    .insert({
      ...basePayload,
      notas: noteText
    });

  if (retryError) {
    throw retryError;
  }
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
  return months.map((_, index) => expenses.reduce((acc, expense) => acc + (expense.values[index] || 0), 0));
}

function money(value) {
  return Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function monthPills(values, editable, labelPrefix, estimatedFlags = [], detailMeta = null) {
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
      return `
      <div class='money-pill readonly' ${dataMonth}>
        <button type='button' data-expense-field='${labelPrefix} - ${months[monthIndex]}' ${detailAttrs}>
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
        ${monthPills(expense.values, false, `${rubricName} / ${expense.name}`, expense.estimatedFlags, { rubricId: expense.rubricId, expenseId: expense.id, kind })}
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
    document.dispatchEvent(new Event("cgd:rendered"));
    return;
  }

  try {
    const [rubricsResult, expensesResult] = await Promise.allSettled([
      fetchRubricsForYear(year),
      fetchExpensesForYear(year)
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

    cgdState.data = buildDataModel(rubricRows, expenseRows);
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

  await Promise.all(
    targetMonths.map((mes) =>
      supabaseClient
        .from("cgd_despesa")
        .update(payload)
        .eq("ano", selectedKey.ano)
        .eq("rubrica_id", selectedKey.rubricaId)
        .eq("despesa_id", selectedKey.despesaId)
        .eq("mes", mes)
    )
  );

  const numericAdjustment = Number(adjustmentValue);
  const shouldRegisterAdjustment = Boolean(registerAdjustment) && Number.isFinite(numericAdjustment) && numericAdjustment !== 0;
  if (shouldRegisterAdjustment) {
    await Promise.all(
      targetMonths.map((mes) =>
        createExpenseNoteEntry({
          ano: selectedKey.ano,
          rubricaId: selectedKey.rubricaId,
          despesaId: selectedKey.despesaId,
          mes,
          valor: numericAdjustment,
          nota
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

