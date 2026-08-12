const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const emptyValues = () => Array.from({ length: 12 }, () => 0);

const fallbackMock = {
  income: [],
  savings: [],
  outcome: []
};

const cgdState = {
  selectedYear: new Date().getFullYear(),
  data: fallbackMock,
  yearModels: {},
  personTotalizerSeriesCache: {},
  realComputationContexts: {},
  expenseColumns: new Set(),
  notesTableName: null,
  incomeChartVisible: false,
  incomeComparisonChartVisible: false,
  incomeComparisonHiddenRubrics: new Set(),
  incomeComparisonHiddenExpenses: new Set(),
  incomeComparisonRevenueDetailVisible: false,
  incomeComparisonRevenueDetailRubricKey: null,
  incomeChartHiddenRubrics: new Set(),
  incomeChartSelectedRubricKey: null,
  incomeChartRevenueDetailVisible: false,
  incomeChartRevenueDetailRubricKey: null,
  incomeDrilldownHiddenExpenses: new Set(),
  savingsChartVisible: false,
  savingsComparisonChartVisible: false,
  savingsComparisonHiddenRubrics: new Set(),
  savingsComparisonHiddenExpenses: new Set(),
  savingsChartHiddenRubrics: new Set(),
  savingsChartSelectedRubricKey: null,
  savingsDrilldownHiddenExpenses: new Set(),
  temporalSummaryHiddenSeries: new Set(),
  outcomeChartVisible: false,
  outcomeComparisonChartVisible: false,
  outcomeComparisonHiddenRubrics: new Set(),
  outcomeComparisonHiddenExpenses: new Set(),
  outcomeComparisonExpenseDetailVisible: false,
  outcomeComparisonExpenseDetailRubricKey: null,
  outcomeChartHiddenRubrics: new Set(),
  outcomeChartSelectedRubricKey: null,
  outcomeChartExpenseDetailVisible: false,
  outcomeChartExpenseDetailRubricKey: null,
  outcomeDrilldownHiddenExpenses: new Set()
};

const SUPABASE_URL = window.CGD_SUPABASE_URL || "https://uooovgxrexpstrtfktst.supabase.co";
const SUPABASE_ANON_KEY = window.CGD_SUPABASE_ANON_KEY || "";
const supabaseClient = window.supabase?.createClient && SUPABASE_ANON_KEY ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const TABLE_PREFIX = String(window.DASHBOARD_TABLE_PREFIX || "cgd").trim().toLowerCase();
const PAGE_PATHNAME = String(window.location?.pathname || "").toLowerCase();
const IS_COVERFLEX = TABLE_PREFIX === "coverflex" || PAGE_PATHNAME.includes("coverflex");
const tableName = (suffix) => `${TABLE_PREFIX}_${suffix}`;
const HIDE_SAVINGS = IS_COVERFLEX || Boolean(window.DASHBOARD_HIDE_SAVINGS);
const HIDE_BALANCE = IS_COVERFLEX || Boolean(window.DASHBOARD_HIDE_BALANCE);
const HIDE_AVAILABLE_ROW = IS_COVERFLEX || Boolean(window.DASHBOARD_HIDE_AVAILABLE_ROW);
const EXPLICIT_INCOME_REVENUE_DETAIL = Boolean(window.DASHBOARD_EXPLICIT_INCOME_REVENUE_DETAIL);
const EXPLICIT_OUTCOME_EXPENSE_DETAIL = Boolean(window.DASHBOARD_EXPLICIT_OUTCOME_EXPENSE_DETAIL);
const TOTALIZER_PEOPLE = Array.isArray(window.DASHBOARD_TOTALIZER_PEOPLE) && window.DASHBOARD_TOTALIZER_PEOPLE.length
  ? window.DASHBOARD_TOTALIZER_PEOPLE.map((entry) => String(entry || "").trim()).filter(Boolean)
  : ["Sergio", "Carina"];
let RUBRIC_TABLE = String(window.DASHBOARD_RUBRIC_TABLE || tableName("rubrica")).trim();
let EXPENSE_TABLE = String(window.DASHBOARD_EXPENSE_TABLE || tableName("despesa")).trim();
let REAL_TABLE = String(window.DASHBOARD_REAL_TABLE || tableName("real")).trim();
let EXPENSE_NOTES_TABLE = String(window.DASHBOARD_EXPENSE_NOTES_TABLE || tableName("despesa_notas")).trim();
let EXPENSE_NOTES_TABLE_LEGACY = String(window.DASHBOARD_EXPENSE_NOTES_TABLE_LEGACY || tableName("despesas_notas")).trim();
const EXPENSE_SEQ_COLUMN = String(window.DASHBOARD_EXPENSE_SEQ_COLUMN || "despesa_seq").trim();
const EXPENSE_BASE_SELECT_COLUMNS = Array.from(new Set([
  "ano",
  "mes",
  "rubrica_id",
  "despesa_id",
  "despesa_desc",
  EXPENSE_SEQ_COLUMN,
  "valor",
  "totalizador",
  "zerado"
]));
const EXPENSE_ESTIMATED_COLUMNS = ["valor_estimado", "valor_Estimado"];
const EXPENSE_NOTE_COLUMNS = ["nota", "notas", null];
const HAS_EXPLICIT_TABLE_CONFIG = Boolean(
  window.DASHBOARD_RUBRIC_TABLE
  && window.DASHBOARD_EXPENSE_TABLE
  && window.DASHBOARD_REAL_TABLE
  && window.DASHBOARD_EXPENSE_NOTES_TABLE
  && window.DASHBOARD_EXPENSE_NOTES_TABLE_LEGACY
);
let tableNamesResolved = HAS_EXPLICIT_TABLE_CONFIG;
let tableResolutionPromise = null;
const YEAR_BOOTSTRAP_PREFIXES = new Set(["cgd", "nb", "coverflex"]);
const YEAR_BOOTSTRAP_RPC = "bootstrap_dashboard_year";
let yearLoadGeneration = 0;
let activeYearBootstrapPromptCancel = null;

const THEME_COLORS = {
  summary: {
    real: "#ecf6fb",
    available: "#7fd7a8",
    savings: "#8ccbf3",
    sergio: "#41b37a",
    carina: "#2f9ad4"
  },
  outcomeRubrics: ["#f2c46a", "#f08b5f", "#5fc8b6", "#7cb7ff", "#84d56b", "#f29db1", "#a9e46f", "#9ad9ff", "#e6b86d", "#8bd3a0"],
  incomeRubrics: ["#6ecf9a", "#7cc4ff", "#9ed86b", "#58d2c3", "#8bcf7a", "#5fb3de", "#9edfb7", "#71d0ff", "#77c87f", "#79bdf0"],
  savingsRubrics: ["#70c3ff", "#5fc8b6", "#f2c46a", "#7cc4ff", "#84d56b", "#f08b5f", "#58d2c3", "#9ad9ff", "#9ed86b", "#a9e46f"],
  outcomeExpenses: ["#9ad9ff", "#a9e46f", "#f7c86a", "#f3a47d", "#95c7ff", "#84d56b", "#e8a0b4", "#7acfc6", "#eac17a", "#a6d8b5"],
  incomeExpenses: ["#8fdcb3", "#8bc8f5", "#9fdc88", "#7fded2", "#95d889", "#79bfe3", "#abdcc6", "#8fd7ff", "#8bcf96", "#93c4eb"],
  savingsExpenses: ["#9ad9ff", "#a9e46f", "#f7c86a", "#7acfc6", "#95c7ff", "#e8a0b4", "#84d56b", "#eac17a", "#8fdcb3", "#8bc8f5"],
  tooltipFallback: "#b8ced9"
};

function getAlternateNotesTable(tableNameValue) {
  return tableNameValue === EXPENSE_NOTES_TABLE ? EXPENSE_NOTES_TABLE_LEGACY : EXPENSE_NOTES_TABLE;
}

function isMissingTableError(error) {
  return String(error?.code || "").trim() === "42P01";
}

function isMissingColumnError(error) {
  const code = String(error?.code || "").trim();
  const message = String(error?.message || "");
  return code === "42703" || code === "PGRST204" || /column .* does not exist/i.test(message);
}

function isPermissionError(error) {
  const code = String(error?.code || "").trim();
  return code === "42501" || code === "PGRST301";
}

async function pickExistingTable(candidates) {
  const uniqueCandidates = Array.from(new Set((Array.isArray(candidates) ? candidates : []).map((name) => String(name || "").trim()).filter(Boolean)));
  if (!supabaseClient || !uniqueCandidates.length) {
    return uniqueCandidates[0] || "";
  }

  for (const candidate of uniqueCandidates) {
    const { error } = await supabaseClient.from(candidate).select("*").limit(1);
    if (!error || isPermissionError(error) || !isMissingTableError(error)) {
      return candidate;
    }
  }

  return uniqueCandidates[0];
}

async function ensureResolvedTableNames() {
  if (!supabaseClient || tableNamesResolved) {
    return;
  }

  if (!tableResolutionPromise) {
    tableResolutionPromise = (async () => {
      RUBRIC_TABLE = await pickExistingTable([RUBRIC_TABLE, tableName("rubricas")]);
      EXPENSE_TABLE = await pickExistingTable([EXPENSE_TABLE, tableName("despesas")]);
      REAL_TABLE = await pickExistingTable([REAL_TABLE, tableName("reais")]);
      EXPENSE_NOTES_TABLE = await pickExistingTable([EXPENSE_NOTES_TABLE, tableName("despesa_notas"), tableName("despesas_notas")]);
      EXPENSE_NOTES_TABLE_LEGACY = await pickExistingTable([EXPENSE_NOTES_TABLE_LEGACY, tableName("despesas_notas"), tableName("despesa_notas")]);
      tableNamesResolved = true;
    })();
  }

  await tableResolutionPromise;
}

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

function parseExpenseValue(record, fallback = 0) {
  const isZerado = parseBoolean(record.zerado);
  if (isZerado) {
    return null;
  }
  const rawValor = record?.valor;
  const rawValorEstimado = record?.valor_estimado ?? record?.valor_Estimado;
  const hasValorRaw = rawValor !== null && rawValor !== undefined && String(rawValor).trim() !== "";
  const hasValorEstimado = rawValorEstimado !== null && rawValorEstimado !== undefined && String(rawValorEstimado).trim() !== "";
  const valor = Number(rawValor);
  const valorEstimado = Number(rawValorEstimado);
  const hasValor = hasValorRaw && Number.isFinite(valor) && valor !== 0;

  if (hasValor) {
    return valor;
  }

  if (hasValorEstimado && Number.isFinite(valorEstimado)) {
    return valorEstimado;
  }

  return Number.isFinite(valor) ? valor : fallback;
}

function isEstimatedExpenseValue(record) {
  if (parseBoolean(record.zerado)) {
    return false;
  }
  const rawValor = record?.valor;
  const rawValorEstimado = record?.valor_estimado ?? record?.valor_Estimado;
  const hasValorRaw = rawValor !== null && rawValor !== undefined && String(rawValor).trim() !== "";
  const hasValorEstimado = rawValorEstimado !== null && rawValorEstimado !== undefined && String(rawValorEstimado).trim() !== "";
  const valor = Number(rawValor);
  const valorEstimado = Number(rawValorEstimado);
  const hasValor = hasValorRaw && Number.isFinite(valor) && valor !== 0;
  return !hasValor && hasValorEstimado && Number.isFinite(valorEstimado) && valorEstimado !== 0;
}

function parseSeq(value, fallback = 999999) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function getExpenseSeqValue(record, fallback = 999999) {
  const value = record?.[EXPENSE_SEQ_COLUMN] ?? record?.despesa_seq ?? record?.despesa_Seq;
  return parseSeq(value, fallback);
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
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (raw === "receita") {
    return "income";
  }
  if (raw === "aprovisionamento" || raw === "aprovisionamentos" || raw === "poupanca" || raw === "poupancas" || raw === "savings" || raw === "saving") {
    return "savings";
  }
  return "outcome";
}

async function fetchRubricsForYear(year) {
  if (!supabaseClient) {
    return [];
  }

  await ensureResolvedTableNames();

  const { data, error } = await supabaseClient
    .from(RUBRIC_TABLE)
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

  await ensureResolvedTableNames();

  let lastMissingColumnError = null;
  for (const noteColumn of EXPENSE_NOTE_COLUMNS) {
    for (const estimatedColumn of EXPENSE_ESTIMATED_COLUMNS) {
      const selectColumns = [
        ...EXPENSE_BASE_SELECT_COLUMNS,
        estimatedColumn,
        ...(noteColumn ? [noteColumn] : [])
      ];
      const { data, error } = await supabaseClient
        .from(EXPENSE_TABLE)
        .select(selectColumns.join(","))
        .eq("ano", year)
        .order("mes", { ascending: true })
        .order("despesa_id", { ascending: true });

      if (!error) {
        return Array.isArray(data) ? data : [];
      }

      if (!isMissingColumnError(error)) {
        throw error;
      }
      lastMissingColumnError = error;
    }
  }

  throw lastMissingColumnError;
}

async function fetchRealValuesForYear(year) {
  if (!supabaseClient) {
    return [];
  }

  await ensureResolvedTableNames();

  const { data, error } = await supabaseClient
    .from(REAL_TABLE)
    .select("ano,mes,real")
    .eq("ano", Number(year))
    .order("mes", { ascending: true });

  if (error) {
    if (String(error?.code || "") === "42P01") {
      return [];
    }
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

async function upsertRealValueForMonth({ ano, mes, real }) {
  if (!supabaseClient) {
    return false;
  }

  await ensureResolvedTableNames();

  const payload = {
    ano: Number(ano),
    mes: Number(mes),
    real: real == null ? null : Number(real)
  };

  const { error } = await supabaseClient
    .from(REAL_TABLE)
    .upsert(payload, { onConflict: "ano,mes" });

  if (!error) {
    return true;
  }

  const errorMessage = String(error?.message || "").toLowerCase();
  const conflictConstraintMissing = String(error?.code || "") === "42P10"
    || errorMessage.includes("no unique")
    || errorMessage.includes("on conflict");
  const insertBlockedByRls = String(error?.code || "") === "42501"
    && errorMessage.includes("row-level security");

  if (!conflictConstraintMissing && !insertBlockedByRls) {
    throw error;
  }

  const { error: updateError } = await supabaseClient
    .from(REAL_TABLE)
    .update({ real: payload.real })
    .eq("ano", payload.ano)
    .eq("mes", payload.mes);

  if (updateError) {
    throw updateError;
  }

  if (insertBlockedByRls) {
    return true;
  }

  const { error: insertError } = await supabaseClient
    .from(REAL_TABLE)
    .insert(payload);

  if (insertError) {
    throw insertError;
  }

  return true;
}

async function fetchExpenseNotesForKey({ ano, rubricaId, despesaId, mes }) {
  if (!supabaseClient) {
    return [];
  }

  await ensureResolvedTableNames();

  const keyQuery = (tableName) =>
    supabaseClient
      .from(tableName)
      .select("*")
      .eq("ano", Number(ano))
      .eq("mes", Number(mes))
      .eq("rubrica_id", Number(rubricaId))
      .eq("despesa_id", Number(despesaId))
      .order("contador_id", { ascending: true });

  const preferredTable = cgdState.notesTableName || EXPENSE_NOTES_TABLE;
  const { data: primaryData, error: primaryError } = await keyQuery(preferredTable);
  if (!primaryError) {
    cgdState.notesTableName = preferredTable;
    return Array.isArray(primaryData) ? primaryData : [];
  }

  const fallbackTable = getAlternateNotesTable(preferredTable);
  const { data: fallbackData, error: fallbackError } = await keyQuery(fallbackTable);
  if (fallbackError) {
    throw primaryError;
  }

  cgdState.notesTableName = fallbackTable;
  return Array.isArray(fallbackData) ? fallbackData : [];
}

function buildExpenseHistoryMonthKey(rubricaId, despesaId, mes) {
  return `${Number(rubricaId)}::${Number(despesaId)}::${Number(mes)}`;
}

async function fetchExpenseHistoryMonthKeysForYear(year) {
  if (!supabaseClient) {
    return new Set();
  }

  await ensureResolvedTableNames();

  const queryByYear = (tableName, noteColumn) =>
    supabaseClient
      .from(tableName)
      .select(`rubrica_id,despesa_id,mes,${noteColumn}`)
      .eq("ano", Number(year));

  const fetchRowsWithNoteColumn = async (tableName) => {
    const primary = await queryByYear(tableName, "nota");
    if (!primary.error) {
      return { rows: Array.isArray(primary.data) ? primary.data : [], noteColumn: "nota" };
    }

    const fallback = await queryByYear(tableName, "notas");
    if (!fallback.error) {
      return { rows: Array.isArray(fallback.data) ? fallback.data : [], noteColumn: "notas" };
    }

    throw primary.error;
  };

  const buildHistorySet = (rows, noteColumn) =>
    new Set(
      (Array.isArray(rows) ? rows : [])
        .filter((row) => String(row?.[noteColumn] ?? "").trim().length > 0)
        .map((row) => buildExpenseHistoryMonthKey(row.rubrica_id, row.despesa_id, row.mes))
        .filter((key) => !key.includes("NaN"))
    );

  const preferredTable = cgdState.notesTableName || EXPENSE_NOTES_TABLE;
  try {
    const preferredResult = await fetchRowsWithNoteColumn(preferredTable);
    cgdState.notesTableName = preferredTable;
    return buildHistorySet(preferredResult.rows, preferredResult.noteColumn);
  } catch (primaryError) {
    const fallbackTable = getAlternateNotesTable(preferredTable);
    try {
      const fallbackResult = await fetchRowsWithNoteColumn(fallbackTable);
      cgdState.notesTableName = fallbackTable;
      return buildHistorySet(fallbackResult.rows, fallbackResult.noteColumn);
    } catch (fallbackError) {
      throw primaryError;
    }
  }
}

async function createExpenseNoteEntry({ ano, rubricaId, despesaId, mes, valor, nota }) {
  if (!supabaseClient) {
    return;
  }

  await ensureResolvedTableNames();

  let notesTableName = cgdState.notesTableName || EXPENSE_NOTES_TABLE;
  const alternateTableName = getAlternateNotesTable(notesTableName);

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

  await ensureResolvedTableNames();

  const filterDelete = (tableName) =>
    supabaseClient
      .from(tableName)
      .delete()
      .eq("ano", Number(ano))
      .eq("mes", Number(mes))
      .eq("rubrica_id", Number(rubricaId))
      .eq("despesa_id", Number(despesaId))
      .eq("contador_id", Number(contadorId));

  const preferredTable = cgdState.notesTableName || EXPENSE_NOTES_TABLE;
  const { error: primaryError } = await filterDelete(preferredTable);
  if (!primaryError) {
    cgdState.notesTableName = preferredTable;
    return true;
  }

  const fallbackTable = getAlternateNotesTable(preferredTable);
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
        seq: getExpenseSeqValue(row, index + 1),
        historyByMonth: Array.from({ length: 12 }, () => false),
        values: emptyValues(),
        estimatedFlags: Array.from({ length: 12 }, () => false),
        monthData: Array.from({ length: 12 }, () => ({
          valor: null,
          valorEstimado: 0,
          totalizador: false,
          nota: "",
          estimatedByFallback: false,
          hasHistoryNote: false
        }))
      });
    }

    const expense = expenseMap.get(expenseKey);
  expense.seq = Math.min(expense.seq, getExpenseSeqValue(row, expense.seq));
    if (monthIndex >= 0) {
      const hasHistoryForMonth = expenseHistoryMonthKeys.has(buildExpenseHistoryMonthKey(row.rubrica_id, row.despesa_id, row.mes));
      expense.historyByMonth[monthIndex] = hasHistoryForMonth;
      const rawValorValue = row.valor;
      const rawValorEstimadoValue = row.valor_estimado ?? row.valor_Estimado;
      const rawValor = Number(rawValorValue);
      const rawValorEstimado = Number(rawValorEstimadoValue);
      const rawNota = row.nota ?? row.notas ?? "";
      const isEstimatedFallback = isEstimatedExpenseValue(row);
      expense.values[monthIndex] = parseExpenseValue(row, expense.values[monthIndex]);
      expense.estimatedFlags[monthIndex] = isEstimatedFallback;
      const normalizedNote = rawNota == null ? "" : String(rawNota);
      expense.monthData[monthIndex] = {
        valor: rawValorValue == null || String(rawValorValue).trim() === "" || !Number.isFinite(rawValor) ? null : rawValor,
        valorEstimado: rawValorEstimadoValue == null || String(rawValorEstimadoValue).trim() === "" || !Number.isFinite(rawValorEstimado) ? 0 : rawValorEstimado,
        totalizador: parseBoolean(row.totalizador),
        nota: normalizedNote,
        zerado: parseBoolean(row.zerado),
        estimatedByFallback: isEstimatedFallback,
        hasHistoryNote: hasHistoryForMonth
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
  const savingsRubrics = HIDE_SAVINGS ? [] : allRubrics.filter((rubric) => rubric.type === "savings");
  return {
    income: allRubrics.filter((rubric) => rubric.type === "income"),
    savings: savingsRubrics,
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
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return Number(0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  const normalized = Math.abs(numeric) < 0.005 ? 0 : numeric;
  return normalized.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isZeroMoneyDisplayValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return true;
  }
  return Math.round(numeric * 100) === 0;
}

function sumRubricsValuesByMonth(rubrics) {
  const source = Array.isArray(rubrics) ? rubrics : [];
  return months.map((_, monthIndex) =>
    source.reduce((acc, rubric) => {
      const rubricValues = Array.isArray(rubric?.values) ? rubric.values : emptyValues();
      const value = Number(rubricValues[monthIndex]);
      return acc + (Number.isFinite(value) ? value : 0);
    }, 0)
  );
}

function sumAllIncomeRubricsByMonth(rubrics) {
  const source = Array.isArray(rubrics) ? rubrics : [];
  return months.map((_, monthIndex) =>
    source.reduce((acc, rubric) => {
      const rubricValues = Array.isArray(rubric?.values) ? rubric.values : emptyValues();
      const monthValue = Number(rubricValues[monthIndex]);
      return acc + (Number.isFinite(monthValue) ? monthValue : 0);
    }, 0)
  );
}

function sumAllOutcomeRubricsByMonth(rubrics) {
  const source = Array.isArray(rubrics) ? rubrics : [];
  return months.map((_, monthIndex) =>
    source.reduce((acc, rubric) => {
      const rubricValues = Array.isArray(rubric?.values) ? rubric.values : emptyValues();
      const monthValue = Number(rubricValues[monthIndex]);
      return acc + (Number.isFinite(monthValue) ? monthValue : 0);
    }, 0)
  );
}

function computeEstimatedIrsMonthlyTotals(outcomeRubrics, rate = 0.45) {
  const sourceRubrics = Array.isArray(outcomeRubrics) ? outcomeRubrics : [];
  const excludedTerms = ["chica beni"];

  return months.map((_, monthIndex) => {
    const monthlyBase = sourceRubrics.reduce((total, rubric) => {
      if (rubricNameMatchesAny(rubric?.name, excludedTerms)) {
        return total;
      }

      const rubricExpenses = Array.isArray(rubric?.expenses) ? rubric.expenses : [];
      if (!rubricExpenses.length) {
        const rubricValue = Number(rubric?.values?.[monthIndex]);
        return total + (Number.isFinite(rubricValue) ? rubricValue : 0);
      }

      const rubricMonthTotal = rubricExpenses.reduce((acc, expense) => {
        if (rubricNameMatchesAny(expense?.name, excludedTerms)) {
          return acc;
        }
        const includeInTotalizer = expense?.monthData?.[monthIndex]?.totalizador;
        if (includeInTotalizer === false) {
          return acc;
        }
        const value = Number(expense?.values?.[monthIndex]);
        return acc + (Number.isFinite(value) ? value : 0);
      }, 0);

      return total + rubricMonthTotal;
    }, 0);

    return monthlyBase * rate;
  });
}

function parseRealDatabaseValue(value) {
  if (value == null || (typeof value === "string" && value.trim() === "")) {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function buildRealValuesFromRows(realRows) {
  const values = Array.from({ length: 12 }, () => null);
  const rows = Array.isArray(realRows) ? realRows : [];
  rows.forEach((row) => {
    const monthIndex = normalizeMonth(row?.mes);
    if (monthIndex < 0) {
      return;
    }
    values[monthIndex] = parseRealDatabaseValue(row?.real);
  });
  return values;
}

function buildTotalsForModel(model) {
  return {
    income: sumAllIncomeRubricsByMonth(model?.income),
    savings: HIDE_SAVINGS ? emptyValues() : sumRubricsValuesByMonth(model?.savings),
    outcome: sumAllOutcomeRubricsByMonth(model?.outcome)
  };
}

function buildSavingsRubricsById(model) {
  if (HIDE_SAVINGS) {
    return {};
  }
  const savingsRubrics = Array.isArray(model?.savings) ? model.savings : [];
  return savingsRubrics.reduce((acc, rubric) => {
    const rubricId = rubric?.id;
    if (rubricId == null) {
      return acc;
    }
    acc[String(rubricId)] = Array.isArray(rubric?.values) ? rubric.values.slice(0, 12) : emptyValues();
    return acc;
  }, {});
}

function defaultRealComputationContext() {
  return {
    model: fallbackMock,
    dbRealValues: Array.from({ length: 12 }, () => null),
    savingsRubricsById: {},
    totals: {
      income: emptyValues(),
      savings: emptyValues(),
      outcome: emptyValues()
    }
  };
}

function previousMonthContext(year, monthIndex) {
  if (monthIndex > 0) {
    return { year: Number(year), monthIndex: monthIndex - 1 };
  }
  return { year: Number(year) - 1, monthIndex: 11 };
}

function computeSavingsSeriesForYear(targetYear, contexts) {
  if (HIDE_SAVINGS) {
    return emptyValues();
  }
  const memo = new Map();
  const resolving = new Set();
  const maxDepth = 120;
  const yearContexts = contexts && typeof contexts === "object" ? contexts : {};

  const keyOf = (year, monthIndex) => `${Number(year)}::${Number(monthIndex)}`;

  const resolveSavings = (year, monthIndex, depth = 0) => {
    const key = keyOf(year, monthIndex);
    if (memo.has(key)) {
      return memo.get(key);
    }

    if (depth > maxDepth || resolving.has(key)) {
      memo.set(key, 0);
      return 0;
    }

    resolving.add(key);
    const previous = previousMonthContext(year, monthIndex);
    const previousSavings = resolveSavings(previous.year, previous.monthIndex, depth + 1);
    const previousContext = yearContexts[previous.year] || defaultRealComputationContext();
    const previousSavingsRubricsTotal = Number(previousContext.totals?.savings?.[previous.monthIndex]) || 0;
    const resolved = previousSavings + previousSavingsRubricsTotal;

    memo.set(key, resolved);
    resolving.delete(key);
    return resolved;
  };

  return months.map((_, monthIndex) => resolveSavings(Number(targetYear), monthIndex));
}

function computeSavingsRubricSeriesForYear(targetYear, rubricId, contexts) {
  if (HIDE_SAVINGS) {
    return emptyValues();
  }
  const memo = new Map();
  const resolving = new Set();
  const maxDepth = 120;
  const yearContexts = contexts && typeof contexts === "object" ? contexts : {};
  const normalizedRubricId = rubricId == null ? "" : String(rubricId);

  const keyOf = (year, monthIndex) => `${Number(year)}::${Number(monthIndex)}`;
  const rubricRawAt = (year, monthIndex) => {
    const context = yearContexts[Number(year)] || defaultRealComputationContext();
    const rubricsById =
      context?.savingsRubricsById && typeof context.savingsRubricsById === "object"
        ? context.savingsRubricsById
        : {};
    const values = rubricsById[normalizedRubricId];
    return Number(values?.[monthIndex]) || 0;
  };

  const resolveSavingsRubric = (year, monthIndex, depth = 0) => {
    const key = keyOf(year, monthIndex);
    if (memo.has(key)) {
      return memo.get(key);
    }

    if (depth > maxDepth || resolving.has(key)) {
      memo.set(key, 0);
      return 0;
    }

    resolving.add(key);
    const previous = previousMonthContext(year, monthIndex);
    const previousAccumulated = resolveSavingsRubric(previous.year, previous.monthIndex, depth + 1);
    const previousRubricValue = rubricRawAt(previous.year, previous.monthIndex);
    const resolved = previousAccumulated + previousRubricValue;

    memo.set(key, resolved);
    resolving.delete(key);
    return resolved;
  };

  return months.map((_, monthIndex) => resolveSavingsRubric(Number(targetYear), monthIndex));
}

function computeRealSeriesForYear(targetYear, contexts) {
  const memo = new Map();
  const resolving = new Set();
  const maxDepth = 120;
  const yearContexts = contexts && typeof contexts === "object" ? contexts : {};

  const keyOf = (year, monthIndex) => `${Number(year)}::${Number(monthIndex)}`;
  const balanceTotalAt = (year, monthIndex) => {
    const normalizedYear = Number(year);
    const context = yearContexts[normalizedYear] || defaultRealComputationContext();
    const income = Number(context.totals?.income?.[monthIndex]) || 0;
    const savings = HIDE_SAVINGS ? 0 : Number(context.totals?.savings?.[monthIndex]) || 0;
    const outcome = Number(context.totals?.outcome?.[monthIndex]) || 0;
    return income + savings - outcome;
  };

  const resolveReal = (year, monthIndex, depth = 0) => {
    const key = keyOf(year, monthIndex);
    if (memo.has(key)) {
      return memo.get(key);
    }

    if (depth > maxDepth || resolving.has(key)) {
      const fallback = { value: 0, estimated: true };
      memo.set(key, fallback);
      return fallback;
    }

    const context = yearContexts[year] || defaultRealComputationContext();
    const dbValue = context.dbRealValues?.[monthIndex];
    if (Number.isFinite(dbValue)) {
      const direct = { value: Number(dbValue), estimated: false };
      memo.set(key, direct);
      return direct;
    }

    resolving.add(key);
    const previous = previousMonthContext(year, monthIndex);
    const previousResolved = resolveReal(previous.year, previous.monthIndex, depth + 1);
    const previousBalance = balanceTotalAt(previous.year, previous.monthIndex);
    const estimatedValue = previousResolved.value + previousBalance;

    const estimated = { value: estimatedValue, estimated: true };
    memo.set(key, estimated);
    resolving.delete(key);
    return estimated;
  };

  const resolved = months.map((_, monthIndex) => resolveReal(Number(targetYear), monthIndex));
  return {
    values: resolved.map((entry) => entry.value),
    estimatedFlags: resolved.map((entry) => Boolean(entry.estimated))
  };
}

function buildRealComputationContextsForFutureMonths(year, startMonthIndex, contexts) {
  const normalizedYear = Number(year);
  const normalizedStartMonth = Number(startMonthIndex);
  const sourceContexts = contexts && typeof contexts === "object" ? contexts : {};
  const currentYearContext = sourceContexts[normalizedYear] || defaultRealComputationContext();
  const dbRealValues = Array.isArray(currentYearContext.dbRealValues)
    ? currentYearContext.dbRealValues.slice(0, 12)
    : Array.from({ length: 12 }, () => null);

  for (let monthIndex = normalizedStartMonth + 1; monthIndex <= 11; monthIndex += 1) {
    dbRealValues[monthIndex] = null;
  }

  return {
    ...sourceContexts,
    [normalizedYear]: {
      ...currentYearContext,
      dbRealValues
    }
  };
}

async function refreshYearDataAndFutureTotalizerFromMonth(startMonthIndex) {
  await loadYearData(cgdState.selectedYear);

  const normalizedStartMonth = Number(startMonthIndex);
  if (!Number.isInteger(normalizedStartMonth) || normalizedStartMonth < 0 || normalizedStartMonth >= 11) {
    return;
  }

  // Recompute future "Real" values as estimates in-memory only.
  // No writes are made to cgd_real for estimated months.
  cgdState.realComputationContexts = buildRealComputationContextsForFutureMonths(
    Number(cgdState.selectedYear),
    normalizedStartMonth,
    cgdState.realComputationContexts
  );

  renderCgdTopTiles();
  renderCgdTemporalSummaryChart();
  renderNbPieCharts();
  renderCgdAlerts();
  renderSoberTotalizer();
  syncRealTotalizerEditableMonth(document.querySelector(".month-tile.active")?.getAttribute("data-month"));
}

async function fetchYearContextForRealComputation(year) {
  if (!supabaseClient) {
    return defaultRealComputationContext();
  }

  const [rubricsResult, expensesResult, realValuesResult] = await Promise.allSettled([
    fetchRubricsForYear(year),
    fetchExpensesForYear(year),
    fetchRealValuesForYear(year)
  ]);

  const rubricRows = rubricsResult.status === "fulfilled" ? rubricsResult.value : [];
  const expenseRows = expensesResult.status === "fulfilled" ? expensesResult.value : [];
  const realRows = realValuesResult.status === "fulfilled" ? realValuesResult.value : [];

  const model = buildDataModel(rubricRows, expenseRows, new Set());
  return {
    model,
    dbRealValues: buildRealValuesFromRows(realRows),
    savingsRubricsById: buildSavingsRubricsById(model),
    totals: buildTotalsForModel(model)
  };
}

function getPersonRubricMonthTotal(year, kind, personName, monthIndex) {
  const sourceModel = cgdState.yearModels?.[Number(year)];
  if (!sourceModel) {
    return 0;
  }

  const sourceRubrics = kind === "income"
    ? sourceModel.income
    : kind === "outcome"
      ? sourceModel.outcome
      : [];

  return (Array.isArray(sourceRubrics) ? sourceRubrics : []).reduce((acc, rubric) => {
    if (!rubricNameMatchesAny(rubric?.name, [personName])) {
      return acc;
    }
    const value = Number(rubric?.values?.[monthIndex]);
    return acc + (Number.isFinite(value) ? value : 0);
  }, 0);
}

function computePersonTotalizerSeriesForYear(year, personName) {
  const normalizedYear = Number(year);
  const personKey = normalizeComparableText(personName);
  if (!Number.isFinite(normalizedYear) || !personKey) {
    return emptyValues();
  }

  cgdState.personTotalizerSeriesCache[normalizedYear] = cgdState.personTotalizerSeriesCache[normalizedYear] || {};
  const cached = cgdState.personTotalizerSeriesCache[normalizedYear][personKey];
  if (Array.isArray(cached) && cached.length === 12) {
    return cached;
  }

  const previousYear = normalizedYear - 1;
  let previousDecemberTotal = 0;
  if (cgdState.yearModels?.[previousYear]) {
    const previousYearSeries = computePersonTotalizerSeriesForYear(previousYear, personName);
    previousDecemberTotal = Number(previousYearSeries?.[11]) || 0;
  }

  let runningTotal = previousDecemberTotal;
  const series = months.map((_, monthIndex) => {
    const sourceYear = monthIndex === 0 ? previousYear : normalizedYear;
    const sourceMonthIndex = monthIndex === 0 ? 11 : monthIndex - 1;
    const previousIncome = getPersonRubricMonthTotal(sourceYear, "income", personName, sourceMonthIndex);
    const previousOutcome = getPersonRubricMonthTotal(sourceYear, "outcome", personName, sourceMonthIndex);

    runningTotal = runningTotal + previousIncome - previousOutcome;
    return runningTotal;
  });

  cgdState.personTotalizerSeriesCache[normalizedYear][personKey] = series;
  return series;
}

function renderTotalizerMonthPills(values, options = {}) {
  const editable = Boolean(options.editable);
  const inputPrefix = options.inputPrefix || "Totalizador";
  const estimatedFlags = Array.isArray(options.estimatedFlags) ? options.estimatedFlags : [];

  return months
    .map((monthName, monthIndex) => {
      const numericValue = Number(values?.[monthIndex]);
      const safeValue = Number.isFinite(numericValue) ? numericValue : 0;
      const isEstimated = Boolean(estimatedFlags[monthIndex]);
      if (editable) {
        return `
          <div class='money-pill totalizer-month-pill' data-month-col='${monthIndex}' data-totalizer-month='${monthIndex}'>
            <button
              type='button'
              class='real-total-btn${isEstimated ? " is-estimated" : ""}'
              data-real-total-btn='true'
              data-real-total-month='${monthIndex}'
              data-real-total-value='${safeValue}'
              data-real-total-estimated='${isEstimated ? "true" : "false"}'
              aria-label='${inputPrefix} ${monthName}'
            >${money(safeValue)}</button>
          </div>
        `;
      }

      return `
        <div class='money-pill totalizer-month-pill readonly' data-month-col='${monthIndex}' data-totalizer-month='${monthIndex}'>
          <span class='totalizer-value'>${money(safeValue)}</span>
        </div>
      `;
    })
    .join("");
}

function renderSoberTotalizer() {
  const host = document.getElementById("cgd-totalizer");
  if (!host) {
    return;
  }

  const year = Number(cgdState.selectedYear);
  const realSeries = computeRealSeriesForYear(year, cgdState.realComputationContexts);
  const realValues = realSeries.values;
  const realEstimatedFlags = realSeries.estimatedFlags;
  const savingsTotals = computeSavingsSeriesForYear(year, cgdState.realComputationContexts);
  const availableTotals = months.map((_, monthIndex) => {
    const real = Number(realValues?.[monthIndex]) || 0;
    const savings = HIDE_SAVINGS ? 0 : Number(savingsTotals?.[monthIndex]) || 0;
    return real - savings;
  });
  const savingsRubrics = HIDE_SAVINGS ? [] : Array.isArray(cgdState.data?.savings) ? cgdState.data.savings : [];
  const peopleRows = TOTALIZER_PEOPLE.length ? TOTALIZER_PEOPLE : ["Sergio", "Carina"];
  const personRowsMarkup = IS_COVERFLEX
    ? peopleRows
      .map((personName) => {
        const personValues = computePersonTotalizerSeriesForYear(year, personName);
        const personRowClass = getPersonRowClass(personName);
        return `
          <div class='data-row totalizer-row totalizer-row-person ${personRowClass}'>
            <div class='desc-cell totalizer-desc-cell'>
              <span class='totalizer-row-label'>${escapeHtml(personName)}</span>
            </div>
            ${renderTotalizerMonthPills(personValues)}
          </div>
        `;
      })
      .join("")
    : "";

  const savingsRubricRows = savingsRubrics
    .map((rubric) => {
      const rubricTotals = computeSavingsRubricSeriesForYear(year, rubric?.id, cgdState.realComputationContexts);

      return `
        <div class='data-row totalizer-row totalizer-row-savings-rubric'>
          <div class='desc-cell totalizer-desc-cell'>
            <span class='totalizer-row-label'>${escapeHtml(rubric?.name || "Poupancas")}</span>
          </div>
          ${renderTotalizerMonthPills(rubricTotals)}
        </div>
      `;
    })
    .join("");

  host.innerHTML = `
    <section class='totalizer-shell' aria-label='Totalizador mensal consolidado'>
      <header class='totalizer-head'>
        <h3>Totalizador mensal</h3>
      </header>
      <div class='totalizer-grid-wrap'>
        <div class='totalizer-grid'>
          <div class='data-row totalizer-row totalizer-row-real'>
            <div class='desc-cell totalizer-desc-cell'>
              <span class='totalizer-row-label'>Real</span>
            </div>
            ${renderTotalizerMonthPills(realValues, { editable: true, inputPrefix: "Real", estimatedFlags: realEstimatedFlags })}
          </div>
          ${HIDE_AVAILABLE_ROW
            ? personRowsMarkup
            : `<div class='data-row totalizer-row totalizer-row-available'>
            <div class='desc-cell totalizer-desc-cell'>
              <span class='totalizer-row-label'>Disponivel</span>
            </div>
            ${renderTotalizerMonthPills(availableTotals)}
          </div>`}
          ${HIDE_SAVINGS
            ? ""
            : `
          <div class='data-row totalizer-row totalizer-row-savings'>
            <div class='desc-cell totalizer-desc-cell'>
              <span class='totalizer-row-label'>Poupancas</span>
            </div>
            ${renderTotalizerMonthPills(savingsTotals)}
          </div>
          ${savingsRubricRows}`}
        </div>
      </div>
    </section>
  `;
}

function monthPills(values, editable, labelPrefix, estimatedFlags = [], historyByMonth = [], detailMeta = null) {
  const safeLabelPrefix = escapeHtml(labelPrefix);
  return values
    .map((value, monthIndex) => {
      const dataMonth = `data-month-col='${monthIndex}'`;
      const isRubricTotalCell = /\stotal$/i.test(String(labelPrefix || ""));
      const rubricTotalClass = isRubricTotalCell ? " rubric-total-cell" : "";
      if (editable) {
        const numericValue = Number(value);
        const displayValue = Number.isFinite(numericValue) && !isZeroMoneyDisplayValue(numericValue) ? money(numericValue) : "";
        return `
          <div class='money-pill${rubricTotalClass}' ${dataMonth}>
            <input data-money class='${isRubricTotalCell ? "rubric-total-input" : ""}' type='text' value='${displayValue}' aria-label='${safeLabelPrefix} ${months[monthIndex]}' />
          </div>`;
      }
      const detailAttrs = detailMeta
        ? `data-rubrica-id='${escapeHtml(detailMeta.rubricaId ?? detailMeta.rubricId ?? "")}' data-expense-id='${escapeHtml(detailMeta.expenseId ?? "")}' data-month-index='${monthIndex}' data-expense-kind='${escapeHtml(detailMeta.kind || "outcome")}'`
        : "";
      const isInteractiveReadonly = Boolean(detailMeta);
      const historyClass = historyByMonth?.[monthIndex] ? "has-history-note" : "";
      const numericValue = Number(value);
      const hasDisplayValue = value != null && Number.isFinite(numericValue) && !isZeroMoneyDisplayValue(numericValue);
      const displayValue = hasDisplayValue ? money(numericValue) : "";
      const estimatedClass = hasDisplayValue && estimatedFlags[monthIndex] ? "estimated-value" : "";
      if (!isInteractiveReadonly) {
        return `
          <div class='money-pill readonly${rubricTotalClass}' ${dataMonth}>
            <span class='${estimatedClass}'>${displayValue}</span>
          </div>`;
      }
      return `
          <div class='money-pill readonly${rubricTotalClass}' ${dataMonth}>
            <button type='button' class='${historyClass}${isRubricTotalCell ? " rubric-total-btn" : ""}' data-expense-field='${safeLabelPrefix} - ${months[monthIndex]}' ${detailAttrs}>
              <span class='${estimatedClass}'>${displayValue}</span>
            </button>
          </div>`;
    })
    .join("");
}

function readonlySummaryPills(values, labelPrefix) {
  const safeLabelPrefix = escapeHtml(labelPrefix);
  return values
    .map((value, monthIndex) => {
      const dataMonth = `data-month-col='${monthIndex}' data-totalizer-month='${monthIndex}'`;
      return `
      <div class='money-pill readonly income-collapsed-pill' ${dataMonth}>
        <span aria-label='${safeLabelPrefix} ${months[monthIndex]}'>${money(value)}</span>
      </div>`;
    })
    .join("");
}

function readonlyBalanceSummaryPills(values, labelPrefix) {
  const safeLabelPrefix = escapeHtml(labelPrefix);
  return values
    .map((value, monthIndex) => {
      const numericValue = Number(value);
      const safeValue = Number.isFinite(numericValue) ? numericValue : 0;
      const signClass = safeValue > 0 ? "balance-value-positive" : safeValue < 0 ? "balance-value-negative" : "balance-value-neutral";
      const dataMonth = `data-month-col='${monthIndex}' data-totalizer-month='${monthIndex}'`;
      return `
      <div class='money-pill readonly income-collapsed-pill' ${dataMonth}>
        <span class='${signClass}' aria-label='${safeLabelPrefix} ${months[monthIndex]}'>${money(safeValue)}</span>
      </div>`;
    })
    .join("");
}

function normalizeComparableText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getPersonSummaryColor(personName) {
  const normalized = normalizeComparableText(personName);
  if (normalized.includes("sergio")) {
    return THEME_COLORS.summary.sergio;
  }
  if (normalized.includes("carina")) {
    return THEME_COLORS.summary.carina;
  }
  return THEME_COLORS.summary.available;
}

function getPersonRowClass(personName) {
  const normalized = normalizeComparableText(personName)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized ? `totalizer-row-person-${normalized}` : "totalizer-row-person-generic";
}

function rubricNameMatchesAny(rubricName, terms) {
  const normalizedName = normalizeComparableText(rubricName);
  return (Array.isArray(terms) ? terms : []).some((term) => normalizedName.includes(normalizeComparableText(term)));
}

function averageOfSeries(values) {
  const source = Array.isArray(values) ? values : [];
  if (!source.length) {
    return 0;
  }
  const total = source.reduce((acc, value) => acc + (Number(value) || 0), 0);
  return total / source.length;
}

function formatTileMoney(value) {
  const numeric = Number(value);
  const safeValue = Number.isFinite(numeric) ? numeric : 0;
  return `${money(safeValue)} EUR`;
}

function renderCgdTemporalSummaryChart() {
  const host = document.getElementById("cgd-temporal-summary-chart");
  if (!host) {
    return;
  }

  const year = Number(cgdState.selectedYear);
  const realSeries = computeRealSeriesForYear(year, cgdState.realComputationContexts);
  const realValues = Array.isArray(realSeries?.values) ? realSeries.values : emptyValues();
  const peopleRows = TOTALIZER_PEOPLE.length ? TOTALIZER_PEOPLE : ["Sergio", "Carina"];
  const isCoverflexTemporalSummary = IS_COVERFLEX && HIDE_AVAILABLE_ROW;
  const savingsValues = computeSavingsSeriesForYear(year, cgdState.realComputationContexts);
  const availableValues = months.map((_, monthIndex) => {
    const real = Number(realValues?.[monthIndex]) || 0;
    const savings = HIDE_SAVINGS ? 0 : Number(savingsValues?.[monthIndex]) || 0;
    return real - savings;
  });

  const allSeries = isCoverflexTemporalSummary
    ? [
      { key: "real", label: "Real", color: THEME_COLORS.summary.real, values: realValues },
      ...peopleRows.slice(0, 2).map((personName) => ({
        key: `person-${normalizeComparableText(personName)}`,
        label: personName,
        color: getPersonSummaryColor(personName),
        values: computePersonTotalizerSeriesForYear(year, personName)
      }))
    ]
    : HIDE_AVAILABLE_ROW
      ? [
        { key: "real", label: "Real", color: THEME_COLORS.summary.real, values: realValues }
      ]
      : [
        { key: "real", label: "Real", color: THEME_COLORS.summary.real, values: realValues },
        { key: "available", label: "Disponivel", color: THEME_COLORS.summary.available, values: availableValues },
        ...(HIDE_SAVINGS ? [] : [{ key: "savings", label: "Poupancas", color: THEME_COLORS.summary.savings, values: savingsValues }])
      ];

  const hiddenSeries = cgdState.temporalSummaryHiddenSeries;
  const visibleSeries = allSeries.filter((entry) => !hiddenSeries.has(entry.key));

  const legend = allSeries
    .map((entry) => {
      const isVisible = !hiddenSeries.has(entry.key);
      const stateClass = isVisible ? "is-active" : "is-inactive";
      return `<button type='button' class='outcome-evolution-legend-item ${stateClass}' data-cgd-summary-toggle='${escapeHtml(entry.key)}' aria-pressed='${isVisible ? "true" : "false"}'><span class='outcome-evolution-legend-dot' style='background:${entry.color};'></span>${escapeHtml(entry.label)}</button>`;
    })
    .join("");

  if (!visibleSeries.length) {
    host.innerHTML = `
      <div class='cgd-summary-map'>
        <div class='outcome-evolution-head'>
          <h3>Saldo ${year}</h3>
        </div>
        <p class='outcome-evolution-empty'>Nenhuma serie selecionada. Clica na legenda para voltar a mostrar.</p>
        <div class='outcome-evolution-legend'>${legend}</div>
      </div>
    `;
  } else {
    const chartWidth = 980;
    const chartHeight = 320;
    const padding = { top: 20, right: 18, bottom: 38, left: 54 };
    const plotWidth = chartWidth - padding.left - padding.right;
    const plotHeight = chartHeight - padding.top - padding.bottom;
    const monthBand = plotWidth / Math.max(months.length - 1, 1);
    const xFor = (monthIndex) => padding.left + monthBand * monthIndex;

    const allValues = visibleSeries.flatMap((entry) => entry.values.map((value) => Number(value) || 0));
    const verticalScale = computeChartVerticalScale(allValues, { top: padding.top, height: plotHeight });
    const yFor = verticalScale.yFor;
    const zeroY = verticalScale.zeroY;

    const horizontalGridCount = 6;
    const gridLines = Array.from({ length: horizontalGridCount + 1 }, (_, index) => {
      const ratio = index / horizontalGridCount;
      const y = padding.top + ratio * plotHeight;
      const labelValue = verticalScale.maxValue - ratio * (verticalScale.maxValue - verticalScale.minValue);
      return `
        <line x1='${padding.left}' y1='${y.toFixed(2)}' x2='${(chartWidth - padding.right).toFixed(2)}' y2='${y.toFixed(2)}' stroke='rgba(176,210,226,0.18)' stroke-width='0.7' />
        <text x='${(padding.left - 8).toFixed(2)}' y='${(y + 4).toFixed(2)}' text-anchor='end' fill='rgba(197,220,231,0.82)' font-size='9'>${labelValue.toFixed(0)}</text>
      `;
    }).join("");

    const monthGridLines = months
      .map((_, monthIndex) => {
        const x = xFor(monthIndex);
        return `<line x1='${x.toFixed(2)}' y1='${padding.top}' x2='${x.toFixed(2)}' y2='${(padding.top + plotHeight).toFixed(2)}' stroke='rgba(176,210,226,0.12)' stroke-width='1' />`;
      })
      .join("");

    const monthLabels = months
      .map((monthName, monthIndex) => {
        const x = xFor(monthIndex);
        return `<text x='${x.toFixed(2)}' y='${(chartHeight - 12).toFixed(2)}' text-anchor='middle' fill='rgba(197,220,231,0.9)' font-size='10'>${escapeHtml(monthName)}</text>`;
      })
      .join("");

    const seriesMarkup = visibleSeries
      .map((entry) => {
        const points = entry.values.map((value, monthIndex) => ({
          x: xFor(monthIndex),
          y: yFor(value),
          value: Number(value) || 0,
          month: months[monthIndex]
        }));

        const pathData = buildSmoothPathData(points);
        const areaPath = `${pathData} L ${points[points.length - 1].x.toFixed(2)} ${zeroY.toFixed(2)} L ${points[0].x.toFixed(2)} ${zeroY.toFixed(2)} Z`;
        const pointsMarkup = points
          .map((point, monthIndex) => `<circle class='outcome-evolution-point' cx='${point.x.toFixed(2)}' cy='${point.y.toFixed(2)}' r='2.2' fill='${entry.color}' tabindex='0' data-month-name='${escapeHtml(point.month)}' data-series-name='${escapeHtml(entry.label)}' data-value='${money(point.value)} EUR' data-series-color='${entry.color}' data-point-month='${monthIndex}'></circle>`)
          .join("");

        return `
          <g class='outcome-evolution-series'>
            <path d='${areaPath}' class='outcome-evolution-area' fill='${entry.color}' fill-opacity='0.10' />
            <path d='${pathData}' class='outcome-evolution-line cgd-summary-line-animated' fill='none' stroke='${entry.color}' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round' />
            ${pointsMarkup}
          </g>
        `;
      })
      .join("");

    host.innerHTML = `
      <div class='cgd-summary-map'>
        <div class='outcome-evolution-head'>
          <h3>Saldo ${year}</h3>
        </div>
        <div class='outcome-evolution-legend'>${legend}</div>
        <div class='outcome-evolution-svg-wrap cgd-summary-svg-wrap'>
          <svg class='outcome-evolution-svg' viewBox='0 0 ${chartWidth} ${chartHeight}' role='img' aria-label='${isCoverflexTemporalSummary ? "Grafico temporal com Real, Sergio e Carina" : HIDE_SAVINGS ? "Grafico temporal com Real e Disponivel" : "Grafico temporal com Real, Disponivel e Poupancas"}'>
            ${gridLines}
            ${monthGridLines}
            ${seriesMarkup}
            ${monthLabels}
          </svg>
          <div class='outcome-evolution-tooltip' aria-hidden='true'></div>
        </div>
      </div>
    `;
  }

  if (host.dataset.summaryLegendBound !== "1") {
    host.dataset.summaryLegendBound = "1";
    host.addEventListener("click", (event) => {
      const toggleBtn = event.target.closest("[data-cgd-summary-toggle]");
      if (!toggleBtn) {
        return;
      }

      const key = String(toggleBtn.getAttribute("data-cgd-summary-toggle") || "").trim();
      if (!key) {
        return;
      }

      if (cgdState.temporalSummaryHiddenSeries.has(key)) {
        cgdState.temporalSummaryHiddenSeries.delete(key);
      } else {
        cgdState.temporalSummaryHiddenSeries.add(key);
      }

      renderCgdTemporalSummaryChart();
    });

    bindOutcomeChartHover(host);
  }
}

// ─── CGD Alerts (exclusive to CGD page) ─────────────────────────────────
function renderCgdAlerts() {
  if (TABLE_PREFIX !== "cgd") return;
  const section = document.getElementById("cgd-alerts-section");
  if (!section) return;

  const MONTHS_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const now = new Date();
  const currentMonth = now.getMonth(); // 0-based
  const monthsToCheck = [currentMonth, Math.min(currentMonth + 1, 11)];
  const THRESHOLD = 0.30; // 30%

  const outcomeRubrics = Array.isArray(cgdState.data?.outcome) ? cgdState.data.outcome : [];
  const alerts = [];

  for (const rubric of outcomeRubrics) {
    const expenses = Array.isArray(rubric?.expenses) ? rubric.expenses : [];
    for (const expense of expenses) {
      const name = (expense?.name || "").trim();
      if (!name) continue;
      const values = Array.isArray(expense?.values) ? expense.values : [];

      for (const m of monthsToCheck) {
        if (m < 1) continue; // can't compare month 0 with previous
        const prevM = m - 1;

        const currVal = Number(values[m]) || 0;
        const prevVal = Number(values[prevM]) || 0;

        // Skip if current has no value
        if (currVal === 0) continue;

        // If prev is 0 and current > 0, always alert (show as "novo")
        if (prevVal === 0) {
          alerts.push({
            month: m,
            monthLabel: MONTHS_SHORT[m],
            desc: name,
            value: currVal,
            prevValue: 0,
            pct: null
          });
          continue;
        }

        const increase = (currVal - prevVal) / Math.abs(prevVal);
        if (increase > THRESHOLD) {
          alerts.push({
            month: m,
            monthLabel: MONTHS_SHORT[m],
            desc: name,
            value: currVal,
            prevValue: prevVal,
            pct: Math.round(increase * 100)
          });
        }
      }
    }
  }

  if (!alerts.length) {
    section.style.display = "none";
    return;
  }

  // Sort: month desc, then value desc
  alerts.sort((a, b) => b.month - a.month || b.value - a.value);

  const titleEl = document.getElementById("cgd-alerts-title");
  const listEl = document.getElementById("cgd-alerts-list");
  if (titleEl) titleEl.textContent = `Alertas (${alerts.length})`;
  if (listEl) {
    listEl.innerHTML = alerts.map(a => `
      <li>
        <span class='cgd-alert-month'>${escapeHtml(a.monthLabel)}</span>
        <span class='cgd-alert-desc'>${escapeHtml(a.desc)}</span>
        <span class='cgd-alert-value'>${money(a.value)}</span>
        <span class='cgd-alert-pct'>${a.pct != null ? `+${a.pct}%` : "novo"}</span>
      </li>
    `).join("");
  }

  section.style.display = "";

  // Bind toggle (only once)
  const toggle = document.getElementById("cgd-alerts-toggle");
  const body = document.getElementById("cgd-alerts-body");
  if (toggle && body && !toggle.dataset.bound) {
    toggle.dataset.bound = "1";
    toggle.addEventListener("click", () => {
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!expanded));
      body.hidden = expanded;
    });
  }
}

function renderNbPieCharts() {
  const receitasHost = document.getElementById("nb-pie-receitas");
  const despesasHost = document.getElementById("nb-pie-despesas");
  if (!receitasHost && !despesasHost) return;

  const PIE_COLORS_RECEITAS = [
    "#00dc6e", "#2f9ad4", "#f2c46a", "#a78bfa", "#00b84f",
    "#ff8c42", "#41b37a", "#e06090", "#58d2c3", "#c8a030",
    "#7cc4ff", "#d46b5f", "#84d56b", "#b070e0", "#e6b86d",
    "#5fc8b6", "#f08b5f", "#70c3ff", "#9ed86b", "#f29db1"
  ];

  const PIE_COLORS_DESPESAS = [
    "#ff6b6b", "#ffa94d", "#a78bfa", "#ffd43b", "#69db7c",
    "#e06090", "#5fc8b6", "#f08b5f", "#7cb7ff", "#c8a030",
    "#84d56b", "#d46bff", "#f2c46a", "#2f9ad4", "#f29db1",
    "#58d2c3", "#e6b86d", "#9ed86b", "#70c3ff", "#ff8c42"
  ];

  function buildReceitasSlices() {
    const incomeRubrics = Array.isArray(cgdState.data?.income) ? cgdState.data.income : [];
    const savingsRubrics = Array.isArray(cgdState.data?.savings) ? cgdState.data.savings : [];
    const allRubrics = [...incomeRubrics, ...savingsRubrics];

    const aggregated = {};

    if (IS_COVERFLEX) {
      // Coverflex: aggregate by rubric name, no exclusions, income only
      for (const rubric of allRubrics) {
        const rubricName = (rubric?.name || "").trim();
        if (!rubricName) continue;
        const expenses = Array.isArray(rubric?.expenses) ? rubric.expenses : [];
        let rubricTotal = 0;
        if (expenses.length) {
          for (const expense of expenses) {
            rubricTotal += (Array.isArray(expense?.values) ? expense.values : [])
              .slice(0, 12)
              .reduce((sum, v) => sum + (Number(v) || 0), 0);
          }
        } else {
          rubricTotal = (Array.isArray(rubric?.values) ? rubric.values : [])
            .slice(0, 12)
            .reduce((sum, v) => sum + (Number(v) || 0), 0);
        }
        const key = rubricName.toLowerCase();
        aggregated[key] = aggregated[key] || { label: rubricName, value: 0 };
        aggregated[key].value += rubricTotal;
      }
    } else {
      // CGD / NB: aggregate by expense name, exclude movimentos
      for (const rubric of allRubrics) {
        if (rubricNameMatchesAny(rubric?.name, ["movimentos"])) continue;
        const expenses = Array.isArray(rubric?.expenses) ? rubric.expenses : [];
        if (expenses.length) {
          for (const expense of expenses) {
            const name = (expense?.name || "").trim();
            if (!name) continue;
            if (rubricNameMatchesAny(name, ["movimentos receitas"])) continue;
            const yearTotal = (Array.isArray(expense?.values) ? expense.values : [])
              .slice(0, 12)
              .reduce((sum, v) => sum + (Number(v) || 0), 0);
            const key = name.toLowerCase();
            aggregated[key] = aggregated[key] || { label: name, value: 0 };
            aggregated[key].value += yearTotal;
          }
        } else {
          const name = (rubric?.name || "").trim();
          if (!name) continue;
          const yearTotal = (Array.isArray(rubric?.values) ? rubric.values : [])
            .slice(0, 12)
            .reduce((sum, v) => sum + (Number(v) || 0), 0);
          const key = name.toLowerCase();
          aggregated[key] = aggregated[key] || { label: name, value: 0 };
          aggregated[key].value += yearTotal;
        }
      }
    }

    return Object.values(aggregated)
      .filter((entry) => entry.value !== 0)
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      .map((entry, i) => ({
        label: entry.label,
        value: Math.abs(entry.value),
        color: PIE_COLORS_RECEITAS[i % PIE_COLORS_RECEITAS.length]
      }));
  }

  function buildDespesasSlices() {
    const outcomeRubrics = Array.isArray(cgdState.data?.outcome) ? cgdState.data.outcome : [];
    const aggregated = {};
    const isNbPage = TABLE_PREFIX === "nb";

    for (const rubric of outcomeRubrics) {
      if (!IS_COVERFLEX && rubricNameMatchesAny(rubric?.name, ["movimentos"])) continue;

      if (isNbPage) {
        // NovoBanco: aggregate by rubric name
        const rubricName = (rubric?.name || "").trim();
        if (!rubricName) continue;
        const expenses = Array.isArray(rubric?.expenses) ? rubric.expenses : [];
        let rubricTotal = 0;
        if (expenses.length) {
          for (const expense of expenses) {
            rubricTotal += (Array.isArray(expense?.values) ? expense.values : [])
              .slice(0, 12)
              .reduce((sum, v) => sum + (Number(v) || 0), 0);
          }
        } else {
          rubricTotal = (Array.isArray(rubric?.values) ? rubric.values : [])
            .slice(0, 12)
            .reduce((sum, v) => sum + (Number(v) || 0), 0);
        }
        const key = rubricName.toLowerCase();
        aggregated[key] = aggregated[key] || { label: rubricName, value: 0 };
        aggregated[key].value += rubricTotal;
      } else {
        // CGD / others: aggregate by expense name, except specific rubrics that collapse into one entry
        const rubricName = (rubric?.name || "").trim();
        const collapseAsRubric = rubricNameMatchesAny(rubricName, ["credito habitacao", "credito habitação", "crédito habitação", "crédito habitacao"]);
        const expenses = Array.isArray(rubric?.expenses) ? rubric.expenses : [];
        if (collapseAsRubric) {
          // Aggregate all expenses under the rubric name
          let rubricTotal = 0;
          if (expenses.length) {
            for (const expense of expenses) {
              rubricTotal += (Array.isArray(expense?.values) ? expense.values : [])
                .slice(0, 12)
                .reduce((sum, v) => sum + (Number(v) || 0), 0);
            }
          } else {
            rubricTotal = (Array.isArray(rubric?.values) ? rubric.values : [])
              .slice(0, 12)
              .reduce((sum, v) => sum + (Number(v) || 0), 0);
          }
          const key = rubricName.toLowerCase();
          aggregated[key] = aggregated[key] || { label: rubricName, value: 0 };
          aggregated[key].value += rubricTotal;
        } else if (expenses.length) {
          for (const expense of expenses) {
            const name = (expense?.name || "").trim();
            if (!name) continue;
            const yearTotal = (Array.isArray(expense?.values) ? expense.values : [])
              .slice(0, 12)
              .reduce((sum, v) => sum + (Number(v) || 0), 0);
            const key = name.toLowerCase();
            aggregated[key] = aggregated[key] || { label: name, value: 0 };
            aggregated[key].value += yearTotal;
          }
        } else {
          const name = (rubric?.name || "").trim();
          if (!name) continue;
          const yearTotal = (Array.isArray(rubric?.values) ? rubric.values : [])
            .slice(0, 12)
            .reduce((sum, v) => sum + (Number(v) || 0), 0);
          const key = name.toLowerCase();
          aggregated[key] = aggregated[key] || { label: name, value: 0 };
          aggregated[key].value += yearTotal;
        }
      }
    }

    return Object.values(aggregated)
      .filter((entry) => entry.value !== 0)
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      .map((entry, i) => ({
        label: entry.label,
        value: Math.abs(entry.value),
        color: PIE_COLORS_DESPESAS[i % PIE_COLORS_DESPESAS.length]
      }));
  }

  function polarToCartesian(cx, cy, r, angleDeg) {
    const rad = (angleDeg - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function buildPie(host, title, slices) {
    if (!host) return;
    const total = slices.reduce((s, entry) => s + entry.value, 0);
    if (!total) { host.innerHTML = ""; return; }

    const cx = 50, cy = 50, outerR = 40, innerR = 20;
    let currentAngle = 0;

    const paths = slices.map((slice, idx) => {
      const sliceAngle = (slice.value / total) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + sliceAngle;
      currentAngle = endAngle;

      const outerStart = polarToCartesian(cx, cy, outerR, startAngle);
      const outerEnd = polarToCartesian(cx, cy, outerR, endAngle);
      const innerStart = polarToCartesian(cx, cy, innerR, endAngle);
      const innerEnd = polarToCartesian(cx, cy, innerR, startAngle);
      const largeArc = sliceAngle > 180 ? 1 : 0;

      const d = [
        `M ${outerStart.x.toFixed(2)} ${outerStart.y.toFixed(2)}`,
        `A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerEnd.x.toFixed(2)} ${outerEnd.y.toFixed(2)}`,
        `L ${innerStart.x.toFixed(2)} ${innerStart.y.toFixed(2)}`,
        `A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerEnd.x.toFixed(2)} ${innerEnd.y.toFixed(2)}`,
        "Z"
      ].join(" ");

      const pct = ((slice.value / total) * 100).toFixed(1);
      return `<path class='nb-pie-slice' d='${d}' fill='${slice.color}' stroke='rgba(0,0,0,0.3)' stroke-width='0.5' data-pie-label='${escapeHtml(slice.label)}' data-pie-value='${money(slice.value)}' data-pie-pct='${pct}%' data-pie-color='${slice.color}'/>`;
    }).join("");

    const legend = slices.map((slice) => {
      const pct = ((slice.value / total) * 100).toFixed(0);
      return `<span class='nb-pie-legend-item'><span class='nb-pie-legend-dot' style='background:${slice.color}'></span>${escapeHtml(slice.label)} ${pct}%</span>`;
    }).join("");

    host.innerHTML = `
      <h4 class='nb-pie-title'>${escapeHtml(title)}</h4>
      <div class='nb-pie-body'>
        <div class='nb-pie-svg-wrap'>
          <svg class='nb-pie-svg' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'>
            ${paths}
          </svg>
          <div class='nb-pie-center-label'>
            <span class='nb-pie-center-value'>${money(total)}</span>
            <span class='nb-pie-center-sub'>EUR</span>
          </div>
        </div>
        <div class='nb-pie-legend'>${legend}</div>
      </div>
      <div class='nb-pie-tooltip' aria-hidden='true'></div>
    `;

    // Tooltip hover
    const wrap = host.querySelector(".nb-pie-svg-wrap");
    const tooltip = host.querySelector(".nb-pie-tooltip");
    if (wrap && tooltip) {
      const hideTooltip = () => tooltip.classList.remove("is-visible");
      host.addEventListener("pointerleave", hideTooltip);
      wrap.querySelectorAll(".nb-pie-slice").forEach((slice) => {
        const showTip = (e) => {
          const label = slice.getAttribute("data-pie-label");
          const value = slice.getAttribute("data-pie-value");
          const pct = slice.getAttribute("data-pie-pct");
          const color = slice.getAttribute("data-pie-color");
          const row = document.createElement("div");
          row.className = "nb-pie-tooltip-row";
          const dot = document.createElement("span");
          dot.className = "nb-pie-tooltip-dot";
          dot.style.backgroundColor = color;
          const labelEl = document.createElement("span");
          labelEl.className = "nb-pie-tooltip-label";
          labelEl.textContent = label;
          const valueEl = document.createElement("strong");
          valueEl.className = "nb-pie-tooltip-value";
          valueEl.textContent = value;
          const pctEl = document.createElement("span");
          pctEl.className = "nb-pie-tooltip-pct";
          pctEl.textContent = `(${pct})`;
          row.append(dot, labelEl, valueEl, pctEl);
          tooltip.replaceChildren(row);
          tooltip.classList.add("is-visible");
        };
        slice.addEventListener("pointerenter", showTip);
        slice.addEventListener("pointerleave", hideTooltip);
      });
    }
  }

  const year = Number(cgdState.selectedYear) || new Date().getFullYear();
  const receitasSlices = buildReceitasSlices();
  const despesasSlices = buildDespesasSlices();
  buildPie(receitasHost, `Total receitas ${year}`, receitasSlices);
  buildPie(despesasHost, `Total despesas ${year}`, despesasSlices);
}

function calculateAccumulatedSavingsToDecember(rubrics, year) {
  const source = Array.isArray(rubrics) ? rubrics : [];
  return source.reduce((acc, rubric) => {
    const rubricId = Number(rubric?.id);
    if (Number.isFinite(rubricId)) {
      const rubricSeries = computeSavingsRubricSeriesForYear(year, rubricId, cgdState.realComputationContexts);
      return acc + (Number(rubricSeries?.[11]) || 0);
    }
    const rawValues = Array.isArray(rubric?.values) ? rubric.values.slice(0, 12) : emptyValues();
    const fallbackAccumulated = rawValues.reduce((sum, monthValue) => sum + (Number(monthValue) || 0), 0);
    return acc + fallbackAccumulated;
  }, 0);
}

function calculateAccumulatedSavingsForMonth(rubrics, year, monthIndex) {
  const source = Array.isArray(rubrics) ? rubrics : [];
  const normalizedMonthIndex = Number(monthIndex);
  if (!Number.isInteger(normalizedMonthIndex) || normalizedMonthIndex < 0 || normalizedMonthIndex > 11) {
    return 0;
  }

  return source.reduce((acc, rubric) => {
    const rubricId = Number(rubric?.id);
    if (Number.isFinite(rubricId)) {
      const rubricSeries = computeSavingsRubricSeriesForYear(year, rubricId, cgdState.realComputationContexts);
      return acc + (Number(rubricSeries?.[normalizedMonthIndex]) || 0);
    }
    const rawValues = Array.isArray(rubric?.values) ? rubric.values.slice(0, 12) : emptyValues();
    return acc + (Number(rawValues?.[normalizedMonthIndex]) || 0);
  }, 0);
}

function renderCgdTopTiles() {
  const averagesHost = document.getElementById("cgd-top-tiles-averages");
  const projectionHost = document.getElementById("cgd-top-tiles-projection");
  if (!averagesHost && !projectionHost) {
    return;
  }

  const year = Number(cgdState.selectedYear);
  const savingsRubrics = HIDE_SAVINGS ? [] : Array.isArray(cgdState.data?.savings) ? cgdState.data.savings : [];
  const incomeRubrics = Array.isArray(cgdState.data?.income) ? cgdState.data.income : [];
  const outcomeRubrics = Array.isArray(cgdState.data?.outcome) ? cgdState.data.outcome : [];

  const irsSavingsRubrics = savingsRubrics.filter((rubric) => rubricNameMatchesAny(rubric?.name, ["irs"]));
  const irsSavingsAccumulatedDecember = calculateAccumulatedSavingsToDecember(irsSavingsRubrics, year);

  const audiSavingsRubrics = savingsRubrics.filter((rubric) => rubricNameMatchesAny(rubric?.name, ["audi"]));
  const audiSavingsAccumulatedDecember = calculateAccumulatedSavingsToDecember(audiSavingsRubrics, year);

  const realSeries = computeRealSeriesForYear(year, cgdState.realComputationContexts);
  const savingsAccumulatedSeries = computeSavingsSeriesForYear(year, cgdState.realComputationContexts);
  const totalAvailableDecember = (Number(realSeries?.values?.[11]) || 0) - (Number(savingsAccumulatedSeries?.[11]) || 0);
  const peopleRows = TOTALIZER_PEOPLE.length ? TOTALIZER_PEOPLE : ["Sergio", "Carina"];
  const sergioName = peopleRows[0] || "Sergio";
  const carinaName = peopleRows[1] || "Carina";

  let savingsAverage;
  if (TABLE_PREFIX === "cgd") {
    // Sum all expenses in savings rubrics, excluding "Movimentos Receitas"
    const savingsMonthlySums = months.map((_, monthIndex) => {
      let total = 0;
      for (const rubric of savingsRubrics) {
        const expenses = Array.isArray(rubric?.expenses) ? rubric.expenses : [];
        if (expenses.length) {
          for (const expense of expenses) {
            if (rubricNameMatchesAny(expense?.name, ["movimentos receitas"])) continue;
            total += Number(expense?.values?.[monthIndex]) || 0;
          }
        } else {
          if (rubricNameMatchesAny(rubric?.name, ["movimentos"])) continue;
          total += Number(rubric?.values?.[monthIndex]) || 0;
        }
      }
      return total;
    });
    savingsAverage = averageOfSeries(savingsMonthlySums);
  } else {
    savingsAverage = averageOfSeries(sumRubricsValuesByMonth(savingsRubrics));
  }
  const savingsAverageSubtitle = TABLE_PREFIX === "cgd" ? "<span class='stat-tile-meta stat-tile-meta--right'>Exclui movimentos</span>" : "";

  const outcomeExcludeTerms = TABLE_PREFIX === "cgd" ? ["movimentos"] : ["movimentos", "impostos"];
  const outcomeFilteredRubrics = outcomeRubrics.filter(
    (rubric) => !rubricNameMatchesAny(rubric?.name, outcomeExcludeTerms)
  );
  const outcomeAverage = averageOfSeries(sumRubricsValuesByMonth(outcomeFilteredRubrics));

  const incomeFilteredRubrics = incomeRubrics.filter((rubric) => !rubricNameMatchesAny(rubric?.name, ["movimentos"]));
  const incomeAverage = averageOfSeries(sumRubricsValuesByMonth(incomeFilteredRubrics));
  const incomeAverageSubtitle = IS_COVERFLEX ? "" : "<span class='stat-tile-meta stat-tile-meta--right'>Exclui movimentos</span>";
  const outcomeAverageSubtitle = IS_COVERFLEX ? "" : (TABLE_PREFIX === "cgd" ? "<span class='stat-tile-meta stat-tile-meta--right'>Exclui movimentos</span>" : "<span class='stat-tile-meta stat-tile-meta--right'>Exclui movimentos e impostos</span>");

  const incomeTotalYear = sumRubricsValuesByMonth(incomeFilteredRubrics).reduce((acc, v) => acc + (Number(v) || 0), 0);
  const outcomeTotalYear = sumRubricsValuesByMonth(outcomeFilteredRubrics).reduce((acc, v) => acc + (Number(v) || 0), 0);
  const incomeTotalSubtitle = IS_COVERFLEX ? "" : "<span class='stat-tile-meta stat-tile-meta--right'>Exclui movimentos</span>";
  const outcomeTotalSubtitle = IS_COVERFLEX ? "" : "<span class='stat-tile-meta stat-tile-meta--right'>Exclui movimentos e impostos</span>";

  if (averagesHost) {
    averagesHost.innerHTML = `
      <article class='stat-tile stat-tile--green'>
        <h4>Media de receitas</h4>
        <p>${formatTileMoney(incomeAverage)}</p>
        ${incomeAverageSubtitle}
      </article>
      ${HIDE_SAVINGS
        ? ""
        : `
      <article class='stat-tile stat-tile--blue'>
        <h4>Media de poupancas</h4>
        <p>${formatTileMoney(savingsAverage)}</p>
        ${savingsAverageSubtitle}
      </article>`}
      <article class='stat-tile stat-tile--danger'>
        <h4>Media de despesas</h4>
        <p>${formatTileMoney(outcomeAverage)}</p>
        ${outcomeAverageSubtitle}
      </article>
    `;
  }

  if (projectionHost) {
    const realDecember = Number(realSeries?.values?.[11]) || 0;
    const projectionYear = year + 1;
    const nextYearRealSeries = computeRealSeriesForYear(projectionYear, cgdState.realComputationContexts);
    const nextYearSavingsSeries = computeSavingsSeriesForYear(projectionYear, cgdState.realComputationContexts);
    const realJanuaryNextYear = Number(nextYearRealSeries?.values?.[0]) || 0;
    const sergioJanuaryNextYear = Number(computePersonTotalizerSeriesForYear(projectionYear, sergioName)?.[0]) || 0;
    const carinaJanuaryNextYear = Number(computePersonTotalizerSeriesForYear(projectionYear, carinaName)?.[0]) || 0;
    const totalAvailableJanuaryNextYear = realJanuaryNextYear - (Number(nextYearSavingsSeries?.[0]) || 0);
    const irsSavingsJanuaryNextYear = calculateAccumulatedSavingsForMonth(irsSavingsRubrics, projectionYear, 0);
    const audiSavingsJanuaryNextYear = calculateAccumulatedSavingsForMonth(audiSavingsRubrics, projectionYear, 0);
    const estimatedIrsTotals = computeEstimatedIrsMonthlyTotals(outcomeRubrics);
    const estimatedIrsYearTotal = estimatedIrsTotals.reduce((acc, value) => acc + (Number(value) || 0), 0);

    // Variance vs January of selected year (CGD and NB)
    const showProjectionVariance = TABLE_PREFIX === "cgd" || TABLE_PREFIX === "nb";
    let realVariance = "", availableVariance = "", irsVariance = "", audiVariance = "";
    if (showProjectionVariance) {
      const currentYearRealSeries = computeRealSeriesForYear(year, cgdState.realComputationContexts);
      const currentYearSavingsSeries = computeSavingsSeriesForYear(year, cgdState.realComputationContexts);
      const realJanuaryCurrent = Number(currentYearRealSeries?.values?.[0]) || 0;
      const totalAvailableJanuaryCurrent = realJanuaryCurrent - (Number(currentYearSavingsSeries?.[0]) || 0);
      const irsSavingsJanuaryCurrent = calculateAccumulatedSavingsForMonth(irsSavingsRubrics, year, 0);
      const audiSavingsJanuaryCurrent = calculateAccumulatedSavingsForMonth(audiSavingsRubrics, year, 0);

      const fmtVariance = (current, next) => {
        if (!current) return "";
        const pct = ((next - current) / Math.abs(current)) * 100;
        const sign = pct >= 0 ? "+" : "";
        const color = pct >= 0 ? "var(--color-success, #00dc6e)" : "var(--color-danger, #ff6b6b)";
        return `<span class='stat-tile-meta stat-tile-meta--right' style='color:${color}'>${sign}${pct.toFixed(1)}% vs ano anterior</span>`;
      };
      realVariance = fmtVariance(realJanuaryCurrent, realJanuaryNextYear);
      availableVariance = fmtVariance(totalAvailableJanuaryCurrent, totalAvailableJanuaryNextYear);
      irsVariance = fmtVariance(irsSavingsJanuaryCurrent, irsSavingsJanuaryNextYear);
      audiVariance = fmtVariance(audiSavingsJanuaryCurrent, audiSavingsJanuaryNextYear);
    }

    const availableProjectionMarkup = IS_COVERFLEX
      ? `
      <article class='stat-tile stat-tile--sergio'>
        <h4>${escapeHtml(sergioName)} Janeiro ${projectionYear}</h4>
        <p>${formatTileMoney(sergioJanuaryNextYear)}</p>
      </article>
      <article class='stat-tile stat-tile--carina'>
        <h4>${escapeHtml(carinaName)} Janeiro ${projectionYear}</h4>
        <p>${formatTileMoney(carinaJanuaryNextYear)}</p>
      </article>`
      : HIDE_AVAILABLE_ROW
        ? ""
        : `
      <article class='stat-tile stat-tile--green'>
        <h4>Total disponivel Janeiro ${projectionYear}</h4>
        <p>${formatTileMoney(totalAvailableJanuaryNextYear)}</p>
        ${availableVariance}
      </article>`;

    const projectionTitle = document.querySelector(".cgd-top-tiles-projection-card .cgd-top-tiles-section-title");
    if (projectionTitle) {
      projectionTitle.textContent = `Projeccao ${projectionYear}`;
    }

    projectionHost.innerHTML = `
      <article class='stat-tile stat-tile--cyan'>
        <h4>Real Janeiro ${projectionYear}</h4>
        <p>${formatTileMoney(realJanuaryNextYear)}</p>
        ${realVariance}
      </article>
      ${availableProjectionMarkup}
      ${HIDE_SAVINGS
        ? ""
        : `
      <article class='stat-tile stat-tile--blue'>
        <h4>Poupanca IRS Janeiro ${projectionYear}</h4>
        <p>${formatTileMoney(irsSavingsJanuaryNextYear)}</p>
        ${irsVariance}
      </article>
      <article class='stat-tile stat-tile--blue'>
        <h4>Poupanca Audi Janeiro ${projectionYear}</h4>
        <p>${formatTileMoney(audiSavingsJanuaryNextYear)}</p>
        ${audiVariance}
        <span class='stat-tile-meta stat-tile-meta--right'>Meta Setembro 2028</span>
        <span class='stat-tile-meta stat-tile-meta--right stat-tile-meta-target'>${formatTileMoney(5900)}</span>
      </article>`}
      ${IS_COVERFLEX
        ? `
      <article class='stat-tile stat-tile--danger'>
        <h4>IRS ${projectionYear}</h4>
        <p>${formatTileMoney(estimatedIrsYearTotal)}</p>
      </article>`
        : ""}
    `;
  }
}

function buildBalancePanel() {
  const incomeTotals = sumRubricsValuesByMonth(cgdState.data?.income || []);
  const savingsTotals = sumRubricsValuesByMonth(cgdState.data?.savings || []);
  const outcomeTotals = sumRubricsValuesByMonth(cgdState.data?.outcome || []);
  const balanceTotals = months.map((_, monthIndex) => {
    const income = Number(incomeTotals?.[monthIndex]) || 0;
    const savings = HIDE_SAVINGS ? 0 : Number(savingsTotals?.[monthIndex]) || 0;
    const outcome = Number(outcomeTotals?.[monthIndex]) || 0;
    return income + savings - outcome;
  });

  return `
  <section class='panel balance'>
    <header class='panel-head'>
      <div class='panel-title'>
        <span class='chev-spacer' aria-hidden='true'></span>
        <span class='desc-pill panel-balance-title'>Saldo</span>
      </div>
    </header>
    <div class='panel-collapsed-summary panel-collapsed-summary-balance'>
      <div class='data-row collapsed-total-row collapsed-total-row-balance'>
        <div class='desc-cell'>
          <span class='desc-pill collapsed-total-label collapsed-total-label-balance'>Total</span>
        </div>
        ${readonlyBalanceSummaryPills(balanceTotals, "Total Saldo")}
      </div>
    </div>
  </section>
  `;
}

function buildEstimatedIrsPanel() {
  const outcomeRubrics = Array.isArray(cgdState.data?.outcome) ? cgdState.data.outcome : [];
  const estimatedTotals = computeEstimatedIrsMonthlyTotals(outcomeRubrics, 0.45);

  return `
  <section class='panel balance panel-estimated-irs'>
    <header class='panel-head'>
      <div class='panel-title'>
        <span class='chev-spacer' aria-hidden='true'></span>
        <span class='desc-pill panel-balance-title'>IRS Estimado (45%)</span>
      </div>
    </header>
    <div class='panel-collapsed-summary panel-collapsed-summary-balance'>
      <div class='data-row collapsed-total-row collapsed-total-row-balance'>
        <div class='desc-cell'>
          <span class='desc-pill collapsed-total-label collapsed-total-label-balance'>Total</span>
        </div>
        ${readonlyBalanceSummaryPills(estimatedTotals, "Total IRS Estimado (45%)")}
      </div>
    </div>
  </section>
  `;
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
  const entryLabel = kind === "income" ? "receita" : kind === "savings" ? "poupanca" : "despesa";

  return expenses
    .map((expense) => {
      const safeExpenseName = escapeHtml(expense.name);
      return `
      <div class='data-row expense' data-sortable data-expense-id='${escapeHtml(expense.id ?? "")}' data-rubrica-id='${escapeHtml(expense.rubricId ?? "")}' data-despesa-seq='${escapeHtml(expense.seq ?? "")}'>
        <div class='desc-cell expense-desc-cell'>
          <span class='chev-spacer' aria-hidden='true'></span>
          <button class='desc-pill expense-menu-trigger' type='button' data-expense-menu-toggle aria-expanded='false' aria-label='Opcoes da ${entryLabel} ${safeExpenseName}'>${safeExpenseName}</button>
          <div class='expense-sort-actions'>
            <div class='expense-menu' role='menu'>
              <button type='button' role='menuitem' data-expense-menu-action='up'><span class='menu-icon' aria-hidden='true'><svg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M12 18V6M12 6L7 11M12 6L17 11' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/></svg></span><span>Mover para cima</span></button>
              <button type='button' role='menuitem' data-expense-menu-action='down'><span class='menu-icon' aria-hidden='true'><svg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M12 6V18M12 18L7 13M12 18L17 13' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/></svg></span><span>Mover para baixo</span></button>
              <div class='menu-separator' role='separator' aria-hidden='true'></div>
              <button type='button' role='menuitem' data-expense-menu-action='rename-expense'><span class='menu-icon' aria-hidden='true'><svg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/></svg></span><span>Renomear ${entryLabel}</span></button>
              <button type='button' role='menuitem' data-expense-menu-action='delete-expense'><span class='menu-icon danger' aria-hidden='true'><svg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M8 8L16 16M16 8L8 16' stroke='currentColor' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'/></svg></span><span>Eliminar ${entryLabel}</span></button>
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
  const createLabel = kind === "income" ? "receita" : kind === "savings" ? "poupanca" : "despesa";

  return rubrics
    .map((rubric, rubricIndex) => {
      const rubricId = `${kind}-rubric-${rubricIndex}`;
      const expenseBodyId = `${rubricId}-expenses`;
      const totals = rubric.values || sumByMonth(rubric.expenses);
      const safeRubricName = escapeHtml(rubric.name);

      return `
      <article class='rubric' data-sortable data-rubrica-id='${escapeHtml(rubric.id ?? "")}' data-rubrica-seq='${escapeHtml(rubric.seq ?? "")}' data-rubrica-tipo='${kind}'>
        <header class='rubric-head data-row'>
          <div class='desc-cell rubric-desc-cell'>
            <button class='chev' type='button' data-toggle-target='${expenseBodyId}' aria-expanded='false' aria-label='Expandir rubrica'>&#9660;</button>
            <button class='desc-pill rubric-title rubric-menu-trigger' type='button' data-rubric-menu-toggle aria-expanded='false' aria-label='Opcoes da rubrica ${safeRubricName}'>${safeRubricName}</button>
            <div class='rubric-sort-actions'>
              <div class='rubric-menu' role='menu'>
                <button type='button' role='menuitem' data-rubric-menu-action='up'><span class='menu-icon' aria-hidden='true'><svg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M12 18V6M12 6L7 11M12 6L17 11' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/></svg></span><span>Mover para cima</span></button>
                <button type='button' role='menuitem' data-rubric-menu-action='down'><span class='menu-icon' aria-hidden='true'><svg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M12 6V18M12 18L7 13M12 18L17 13' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/></svg></span><span>Mover para baixo</span></button>
                <div class='menu-separator' role='separator' aria-hidden='true'></div>
                <button type='button' role='menuitem' data-rubric-menu-action='create-expense'><span class='menu-icon' aria-hidden='true'><svg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M12 5V19M5 12H19' stroke='currentColor' stroke-width='2.2' stroke-linecap='round'/></svg></span><span>Criar ${createLabel}</span></button>
                <div class='menu-separator' role='separator' aria-hidden='true'></div>
                <button type='button' role='menuitem' data-rubric-menu-action='rename-rubric'><span class='menu-icon' aria-hidden='true'><svg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/></svg></span><span>Renomear rubrica</span></button>
                <button type='button' role='menuitem' data-rubric-menu-action='delete-rubric'><span class='menu-icon danger' aria-hidden='true'><svg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M8 8L16 16M16 8L8 16' stroke='currentColor' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'/></svg></span><span>Eliminar rubrica</span></button>
              </div>
            </div>
          </div>
          ${monthPills(totals, false, `${rubric.name} total`)}
        </header>
        <div class='rubric-body is-collapsed' id='${expenseBodyId}'>
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
  const totalsByMonth = sumRubricsValuesByMonth(rubrics);
  const hasCollapsedSummary = kind === "income" || kind === "savings" || kind === "outcome";
  const collapsedSummary = hasCollapsedSummary
    ? `
    <div class='panel-collapsed-summary panel-collapsed-summary-${kind}'>
      <div class='data-row collapsed-total-row collapsed-total-row-${kind}'>
        <div class='desc-cell'>
          <span class='desc-pill collapsed-total-label collapsed-total-label-${kind}'>Total</span>
        </div>
        ${readonlySummaryPills(totalsByMonth, "Total")}
      </div>
    </div>`
    : "";
  const showChartAction = kind === "outcome" || kind === "income" || kind === "savings";
  const lineChartVisible = kind === "outcome"
    ? cgdState.outcomeChartVisible
    : kind === "savings"
      ? cgdState.savingsChartVisible
      : cgdState.incomeChartVisible;
  const comparisonChartVisible = kind === "outcome"
    ? cgdState.outcomeComparisonChartVisible
    : kind === "savings"
      ? cgdState.savingsComparisonChartVisible
      : cgdState.incomeComparisonChartVisible;
  const lineChartToggleAttr = kind === "outcome"
    ? "data-outcome-chart-toggle-visibility"
    : kind === "savings"
      ? "data-savings-chart-toggle-visibility"
      : "data-income-chart-toggle-visibility";
  const comparisonChartToggleAttr = kind === "outcome"
    ? "data-outcome-comparison-chart-toggle-visibility"
    : kind === "savings"
      ? "data-savings-comparison-chart-toggle-visibility"
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
            <path d='M4.5 18.5H19.5' stroke='currentColor' stroke-width='1.8' stroke-linecap='round'/>
            <path d='M5.5 15.8L9.3 11.9L12.6 13.9L18.5 7.8' stroke='currentColor' stroke-width='2.1' stroke-linecap='round' stroke-linejoin='round'/>
            <circle cx='5.5' cy='15.8' r='1.2' fill='currentColor'/>
            <circle cx='9.3' cy='11.9' r='1.2' fill='currentColor'/>
            <circle cx='12.6' cy='13.9' r='1.2' fill='currentColor'/>
            <circle cx='18.5' cy='7.8' r='1.2' fill='currentColor'/>
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
            <path d='M4.5 18.5H19.5' stroke='currentColor' stroke-width='1.8' stroke-linecap='round'/>
            <path d='M6.5 17V11.5' stroke='currentColor' stroke-width='2.1' stroke-linecap='round'/>
            <path d='M9.5 17V8.5' stroke='currentColor' stroke-width='2.1' stroke-linecap='round'/>
            <path d='M14.5 17V13.5' stroke='currentColor' stroke-width='2.1' stroke-linecap='round'/>
            <path d='M17.5 17V7' stroke='currentColor' stroke-width='2.1' stroke-linecap='round'/>
          </svg>
        </button>
      </div>`
    : "";
  return `
  <section class='panel ${kind}' data-panel-block data-panel-kind='${kind}'>
    <header class='panel-head'>
      <div class='panel-title'>
        <button class='chev' type='button' data-toggle-target='${bodyId}' aria-expanded='false' aria-label='Expandir ${title}'>&#9660;</button>
        <button class='desc-pill panel-menu-trigger' type='button' data-panel-menu-toggle aria-expanded='false' aria-label='Opcoes do painel ${title}'>${title}</button>
        <div class='panel-sort-actions'>
          <div class='panel-menu' role='menu'>
            <button type='button' role='menuitem' data-panel-menu-action='add-rubric'>Criar rubrica</button>
          </div>
        </div>
      </div>
      ${chartAction}
    </header>
    <div class='panel-body is-collapsed' id='${bodyId}'>
      ${renderRubrics(rubrics, kind)}
    </div>
    ${collapsedSummary}
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

function computeChartVerticalScale(values, { top, height }) {
  const numericValues = (Array.isArray(values) ? values : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  const minRaw = numericValues.length ? Math.min(...numericValues) : 0;
  const maxRaw = numericValues.length ? Math.max(...numericValues) : 0;
  const minValue = Math.min(minRaw, 0);
  const maxValue = Math.max(maxRaw, 0);
  const range = maxValue - minValue || 1;

  const yFor = (value) => {
    const numericValue = Number(value);
    const safeValue = Number.isFinite(numericValue) ? numericValue : 0;
    return top + ((maxValue - safeValue) / range) * height;
  };

  return {
    minValue,
    maxValue,
    range,
    yFor,
    zeroY: yFor(0)
  };
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
    let positionFrame = 0;
    let pointerPosition = null;
    const schedulePosition = (event) => {
      if (!Number.isFinite(event?.clientX) || !Number.isFinite(event?.clientY)) {
        return;
      }
      pointerPosition = { clientX: event.clientX, clientY: event.clientY };
      if (positionFrame) {
        return;
      }
      positionFrame = requestAnimationFrame(() => {
        positionFrame = 0;
        if (pointerPosition) {
          positionOutcomeChartTooltip(tooltip, wrap, pointerPosition);
        }
      });
    };

    wrap.addEventListener("pointerleave", hideTooltip);

    wrap.querySelectorAll(".outcome-evolution-point").forEach((point) => {
      const showTooltip = (event) => {
        const monthName = point.getAttribute("data-month-name") || "";
        const seriesName = point.getAttribute("data-series-name") || "";
        const value = point.getAttribute("data-value") || "0.00";
        const color = point.getAttribute("data-series-color") || THEME_COLORS.tooltipFallback;

        tooltip.innerHTML = `
          <div class='outcome-evolution-tooltip-month'>${escapeHtml(monthName)}</div>
          <div class='outcome-evolution-tooltip-row'>
            <span class='outcome-evolution-tooltip-dot' style='background:${escapeHtml(color)};'></span>
            <span class='outcome-evolution-tooltip-series'>${escapeHtml(seriesName)}</span>
            <strong class='outcome-evolution-tooltip-value'>${escapeHtml(value)}</strong>
          </div>
        `;
        tooltip.classList.add("is-visible");
        schedulePosition(event);
      };

      point.addEventListener("pointerenter", showTooltip);
      point.addEventListener("pointermove", schedulePosition);
      point.addEventListener("focus", (event) => showTooltip(event));
      point.addEventListener("blur", hideTooltip);
    });
  });
}

function buildOutcomeRubricSeries() {
  const palette = THEME_COLORS.outcomeRubrics;
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
  const palette = THEME_COLORS.incomeRubrics;
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
            name: expense?.name || `Receita ${expenseIndex + 1}`,
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

function buildSavingsRubricSeries() {
  const palette = THEME_COLORS.savingsRubrics;
  const sourceRubrics = Array.isArray(cgdState.data?.savings) ? cgdState.data.savings : [];

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

  const palette = THEME_COLORS.outcomeExpenses;
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

  const palette = THEME_COLORS.incomeExpenses;
  return (rubric.expenses || [])
    .map((expense, index) => ({
      key: expense.key || `expense-${index}`,
      name: expense.name || `Receita ${index + 1}`,
      values: months.map((_, monthIndex) => {
        const numeric = Number(expense.values?.[monthIndex]);
        return Number.isFinite(numeric) ? numeric : 0;
      }),
      color: palette[index % palette.length]
    }))
    .filter((entry) => entry.values.some((value) => value !== 0));
}

function buildSavingsExpenseSeriesForRubric(rubric) {
  if (!rubric) {
    return [];
  }

  const palette = THEME_COLORS.savingsExpenses;
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
      resetIncomeRevenueDetail();
      renderPanels();
      document.dispatchEvent(new Event("cgd:rendered"));
      requestAnimationFrame(() => {
        ensurePanelHeadVisible("income");
      });
      return;
    }

    const revenueDetailToggle = event.target.closest("[data-income-revenue-detail-toggle]");
    if (revenueDetailToggle && EXPLICIT_INCOME_REVENUE_DETAIL) {
      const detailConfig = getExplicitDetailConfig("income", "evolution");
      const activeRubricKey = String(host.dataset.singleIncomeRubricKey || "").trim();
      if (!activeRubricKey) {
        return;
      }

      if (isExplicitDetailExpanded(detailConfig, activeRubricKey)) {
        resetExplicitItemDetail(detailConfig);
      } else {
        expandExplicitItemDetail(detailConfig, activeRubricKey);
      }
      renderIncomeEvolutionChart();
      focusExplicitDetailToggle(host, detailConfig);
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
      resetIncomeRevenueDetail();

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
        resetIncomeRevenueDetail();
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
      resetIncomeRevenueDetail();
      cgdState.incomeChartHiddenRubrics.clear();
      renderIncomeEvolutionChart();
      return;
    }

    const deselectAllBtn = event.target.closest("[data-income-chart-deselect-all]");
    if (deselectAllBtn) {
      resetIncomeRevenueDetail();
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
  const detailConfig = getExplicitDetailConfig("income", "evolution");
  if (
    detailConfig.enabled
    && (
      !singleVisibleRubric
      || (
        cgdState.incomeChartRevenueDetailVisible
        && cgdState.incomeChartRevenueDetailRubricKey !== singleVisibleRubric.key
      )
    )
  ) {
    resetExplicitItemDetail(detailConfig);
  }

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

  const isLegacySingleRubricMode = Boolean(singleVisibleRubric) && !detailConfig.enabled;
  const expenseSeries = singleVisibleRubric ? buildIncomeExpenseSeriesForRubric(singleVisibleRubric) : [];
  const expenseStateKey = (expenseKey) => `${singleVisibleRubric?.key || ""}::${expenseKey}`;
  const isExplicitRevenueDetailAvailable = Boolean(
    detailConfig.enabled
    && singleVisibleRubric
    && expenseSeries.length
  );
  if (
    detailConfig.enabled
    && !isExplicitRevenueDetailAvailable
    && cgdState.incomeChartRevenueDetailVisible
  ) {
    resetExplicitItemDetail(detailConfig);
  }
  const isExplicitRevenueDetailExpanded = Boolean(
    isExplicitRevenueDetailAvailable
    && isExplicitDetailExpanded(detailConfig, singleVisibleRubric.key)
  );
  const visibleExpenseSeries = isLegacySingleRubricMode || isExplicitRevenueDetailExpanded
    ? expenseSeries.filter((entry) => !cgdState.incomeDrilldownHiddenExpenses.has(expenseStateKey(entry.key)))
    : [];

  const chartWidth = 980;
  const chartHeight = 320;
  const padding = { top: 20, right: 18, bottom: 38, left: 54 };
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;
  const monthStep = plotWidth / (months.length - 1);
  const plotBottom = padding.top + plotHeight;

  const rubricPlotSeries = visibleSeries.map((entry) => ({ ...entry, seriesKind: "rubric" }));
  const expensePlotSeries = visibleExpenseSeries.map((entry) => ({ ...entry, seriesKind: "expense" }));
  const plottedSeries = isLegacySingleRubricMode || isExplicitRevenueDetailExpanded
    ? expensePlotSeries
    : rubricPlotSeries;
  const averageSource = detailConfig.enabled && plottedSeries.length === 1
    ? plottedSeries[0]
    : null;
  const averageValue = averageSource ? computeOutcomeSeriesAverage(averageSource) : null;
  if (isLegacySingleRubricMode && !expenseSeries.length) {
    host.innerHTML = `
      <div class='outcome-drilldown-toolbar'>
        <button type='button' class='outcome-drilldown-close-btn' data-income-chart-close-main>Fechar</button>
      </div>
      <div class='outcome-evolution-top-series'>${legend}</div>
      <p class='outcome-evolution-empty'>Esta rubrica nao tem receitas com valores ao longo do ano.</p>
    `;
    return;
  }

  if (isLegacySingleRubricMode && !visibleExpenseSeries.length) {
    host.innerHTML = `
      <div class='outcome-drilldown-toolbar'>
        <button type='button' class='outcome-drilldown-close-btn' data-income-chart-close-main>Fechar</button>
      </div>
      <div class='outcome-evolution-top-series'>${legend}</div>
      <p class='outcome-evolution-empty'>Nenhuma receita selecionada. Clica na legenda para voltar a mostrar.</p>
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

  const allValues = plottedSeries.flatMap((entry) => entry.values);
  const verticalScale = computeChartVerticalScale(allValues, { top: padding.top, height: plotHeight });
  const xFor = (monthIndex) => padding.left + monthIndex * monthStep;
  const yFor = verticalScale.yFor;
  const plotBaselineY = verticalScale.zeroY;

  const horizontalGridCount = 12;
  const gridLines = Array.from({ length: horizontalGridCount + 1 }, (_, index) => {
    const ratio = index / horizontalGridCount;
    const y = padding.top + ratio * plotHeight;
    const labelValue = verticalScale.maxValue - ratio * (verticalScale.maxValue - verticalScale.minValue);
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
      const isRubricSeries = entry.seriesKind === "rubric";
      const isSelected = isRubricSeries && entry.key === cgdState.incomeChartSelectedRubricKey;
      const strokeWidth = isRubricSeries ? "1.3" : "0.6";
      const selectionClass = isSelected ? "is-selected" : "";
      const points = entry.values.map((value, monthIndex) => ({ x: xFor(monthIndex), y: yFor(value), value, monthIndex }));
      const pathData = buildSmoothPathData(points);
      const areaPath = `${pathData} L ${points[points.length - 1].x.toFixed(2)} ${plotBaselineY.toFixed(2)} L ${points[0].x.toFixed(2)} ${plotBaselineY.toFixed(2)} Z`;
      const pointsMarkup = entry.values
        .map((value, monthIndex) => {
          const cx = xFor(monthIndex);
          const cy = yFor(value);
          return `<circle class='outcome-evolution-point' cx='${cx.toFixed(2)}' cy='${cy.toFixed(2)}' r='2.8' fill='${entry.color}' tabindex='0' data-series-name='${escapeHtml(entry.name)}' data-month-name='${escapeHtml(months[monthIndex])}' data-value='${value.toFixed(2)}' data-series-color='${entry.color}'></circle>`;
        })
        .join("");
      return `
        <g
          class='outcome-evolution-series ${selectionClass}'
          data-series-kind='${entry.seriesKind}'
          data-series-key='${escapeHtml(entry.key)}'
          ${isRubricSeries && !singleVisibleRubric ? `data-income-chart-drilldown='${escapeHtml(entry.key)}'` : ""}
        >
          <path d='${areaPath}' class='outcome-evolution-area' fill='${entry.color}' fill-opacity='0.10' />
          <path d='${pathData}' class='outcome-evolution-line' fill='none' stroke='${entry.color}' stroke-width='${strokeWidth}' stroke-linecap='round' stroke-linejoin='round' />
          ${pointsMarkup}
        </g>
      `;
    })
    .join("");

  const averageLine = averageSource && Number.isFinite(averageValue)
    ? (() => {
        const averageY = yFor(averageValue);
        const formattedAverage = formatOutcomeAverageValue(averageValue);
        const averageAccessibleLabel = `Média - ${averageSource.name}: ${formattedAverage}. Usa valores estimados nos meses sem valor real.`;
        return `
          <g
            class='outcome-evolution-average'
            data-income-average
            data-average-source-kind='${averageSource.seriesKind}'
            data-average-source-key='${escapeHtml(averageSource.key)}'
            data-average-value='${averageValue}'
            role='img'
            aria-label='${escapeHtml(averageAccessibleLabel)}'
            pointer-events='none'
          >
            <title>${escapeHtml(averageAccessibleLabel)}</title>
            <line
              data-income-average-line
              x1='${padding.left}'
              y1='${averageY.toFixed(2)}'
              x2='${chartWidth - padding.right}'
              y2='${averageY.toFixed(2)}'
              fill='none'
              stroke='${averageSource.color}'
              stroke-width='1.8'
              stroke-dasharray='8 6'
              stroke-linecap='butt'
              vector-effect='non-scaling-stroke'
            />
          </g>
        `;
      })()
    : "";
  const averageLabelMarkup = averageSource && Number.isFinite(averageValue)
    ? `
      <div class='outcome-evolution-top-series' data-income-average-label-row aria-hidden='true'>
        <span
          class='outcome-evolution-tooltip-series'
          data-income-average-label
          style='color:${averageSource.color};'
        >${escapeHtml(`Média: ${formatOutcomeAverageValue(averageValue)}`)}</span>
      </div>
    `
    : "";

  const expenseLegend = isLegacySingleRubricMode || isExplicitRevenueDetailExpanded
    ? expenseSeries
        .map((entry) => {
          const isVisible = !cgdState.incomeDrilldownHiddenExpenses.has(expenseStateKey(entry.key));
          const stateClass = isVisible ? "is-active" : "is-inactive";
          return `<button type='button' class='outcome-evolution-legend-item ${stateClass}' data-income-drilldown-toggle='${escapeHtml(entry.key)}' aria-pressed='${isVisible ? "true" : "false"}'><span class='outcome-evolution-legend-dot' style='background:${entry.color};'></span>${escapeHtml(entry.name)}</button>`;
        })
        .join("")
    : "";

  const singleRubricLegendMarkup = isLegacySingleRubricMode && expenseSeries.length
    ? `<div class='outcome-evolution-top-series'>${expenseLegend}</div>`
    : "";
  const revenueDetailToggleMarkup = isExplicitRevenueDetailAvailable
    ? `
      <button
        type='button'
        class='outcome-evolution-control-btn outcome-expense-detail-toggle'
        data-income-revenue-detail-toggle
        aria-expanded='${isExplicitRevenueDetailExpanded ? "true" : "false"}'
        aria-controls='income-revenue-detail-series'
      >${isExplicitRevenueDetailExpanded ? "Ocultar receitas" : "Mostrar receitas"}</button>
    `
    : "";
  const revenueDetailMarkup = isExplicitRevenueDetailAvailable
    ? `
      <div
        id='income-revenue-detail-series'
        class='outcome-expense-detail'
        role='group'
        aria-label='Receitas da rubrica selecionada'
        ${isExplicitRevenueDetailExpanded ? "" : "hidden"}
      >
        ${isExplicitRevenueDetailExpanded ? `<div class='outcome-evolution-top-series'>${expenseLegend}</div>` : ""}
      </div>
    `
    : "";
  const chartAriaLabelBase = isLegacySingleRubricMode || isExplicitRevenueDetailExpanded
    ? "Grafico de linhas com evolucao das receitas da rubrica selecionada"
    : "Grafico de linhas com evolucao das rubricas de receitas";
  const chartAriaLabel = averageSource && Number.isFinite(averageValue)
    ? `${chartAriaLabelBase}. Média de ${averageSource.name}: ${formatOutcomeAverageValue(averageValue)}, usando valores estimados nos meses sem valor real`
    : chartAriaLabelBase;

  host.innerHTML = `
    <div class='outcome-drilldown-toolbar ${isExplicitRevenueDetailAvailable ? "has-expense-detail" : ""}'>
      ${revenueDetailToggleMarkup}
      <button type='button' class='outcome-drilldown-close-btn' data-income-chart-close-main>Fechar</button>
    </div>
    <div class='outcome-evolution-top-series'>${legend}</div>
    ${singleRubricLegendMarkup}
    ${revenueDetailMarkup}
    ${averageLabelMarkup}
    <div class='outcome-evolution-svg-wrap'>
      <svg class='outcome-evolution-svg' viewBox='0 0 ${chartWidth} ${chartHeight}' role='img' aria-label='${escapeHtml(chartAriaLabel)}'>
        ${gridLines}
        ${monthGridLines}
        ${lines}
        ${averageLine}
        ${monthLabels}
      </svg>
      <div class='outcome-evolution-tooltip' aria-hidden='true'></div>
    </div>
  `;

  bindOutcomeChartHover(host);
}

function bindSavingsChartInteractions(host) {
  if (!host || host.dataset.chartBoundSavings === "1") {
    return;
  }

  host.dataset.chartBoundSavings = "1";
  host.addEventListener("click", (event) => {
    const closeMainChartBtn = event.target.closest("[data-savings-chart-close-main]");
    if (closeMainChartBtn) {
      cgdState.savingsChartVisible = false;
      cgdState.savingsChartSelectedRubricKey = null;
      cgdState.savingsChartHiddenRubrics.clear();
      renderPanels();
      document.dispatchEvent(new Event("cgd:rendered"));
      requestAnimationFrame(() => {
        ensurePanelHeadVisible("savings");
      });
      return;
    }

    const drilldownToggle = event.target.closest("[data-savings-drilldown-toggle]");
    if (drilldownToggle) {
      const expenseKey = String(drilldownToggle.getAttribute("data-savings-drilldown-toggle") || "").trim();
      const activeRubricKey = cgdState.savingsChartSelectedRubricKey || String(host.dataset.singleSavingsRubricKey || "").trim();
      if (expenseKey) {
        const stateKey = `${activeRubricKey}::${expenseKey}`;
        if (cgdState.savingsDrilldownHiddenExpenses.has(stateKey)) {
          cgdState.savingsDrilldownHiddenExpenses.delete(stateKey);
        } else {
          cgdState.savingsDrilldownHiddenExpenses.add(stateKey);
        }
        renderSavingsEvolutionChart();
      }
      return;
    }

    const drilldownTarget = event.target.closest("[data-savings-chart-drilldown]");
    if (drilldownTarget) {
      const key = String(drilldownTarget.getAttribute("data-savings-chart-drilldown") || "").trim();
      const isSameSelectedRubric = cgdState.savingsChartSelectedRubricKey === key;

      if (isSameSelectedRubric) {
        cgdState.savingsChartSelectedRubricKey = null;
        cgdState.savingsChartHiddenRubrics.clear();
      } else {
        cgdState.savingsChartSelectedRubricKey = key;
        const allRubricKeys = buildSavingsRubricSeries().map((entry) => entry.key);
        cgdState.savingsChartHiddenRubrics.clear();
        allRubricKeys.forEach((rubricKey) => {
          if (rubricKey !== key) {
            cgdState.savingsChartHiddenRubrics.add(rubricKey);
          }
        });
      }

      renderSavingsEvolutionChart();
      return;
    }

    const toggleBtn = event.target.closest("[data-savings-chart-toggle]");
    if (toggleBtn) {
      const key = String(toggleBtn.getAttribute("data-savings-chart-toggle") || "").trim();
      if (key) {
        if (cgdState.savingsChartHiddenRubrics.has(key)) {
          cgdState.savingsChartHiddenRubrics.delete(key);
        } else {
          cgdState.savingsChartHiddenRubrics.add(key);
          if (cgdState.savingsChartSelectedRubricKey === key) {
            cgdState.savingsChartSelectedRubricKey = null;
          }
        }
        renderSavingsEvolutionChart();
      }
      return;
    }

    const selectAllBtn = event.target.closest("[data-savings-chart-select-all]");
    if (selectAllBtn) {
      cgdState.savingsChartHiddenRubrics.clear();
      renderSavingsEvolutionChart();
      return;
    }

    const deselectAllBtn = event.target.closest("[data-savings-chart-deselect-all]");
    if (deselectAllBtn) {
      host.querySelectorAll("[data-savings-chart-toggle]").forEach((item) => {
        const key = String(item.getAttribute("data-savings-chart-toggle") || "").trim();
        if (key) {
          cgdState.savingsChartHiddenRubrics.add(key);
        }
      });
      cgdState.savingsChartSelectedRubricKey = null;
      renderSavingsEvolutionChart();
    }
  });
}

function renderSavingsEvolutionChart() {
  const host = document.getElementById("savings-evolution-chart");
  if (!host) {
    return;
  }

  const chartCard = host.closest(".savings-evolution-card");
  if (!cgdState.savingsChartVisible) {
    if (chartCard) {
      chartCard.classList.add("outcome-evolution-card-hidden");
    }
    host.innerHTML = "";
    return;
  }

  if (chartCard) {
    chartCard.classList.remove("outcome-evolution-card-hidden");
  }

  bindSavingsChartInteractions(host);

  const series = buildSavingsRubricSeries();
  const visibleSeries = series.filter((entry) => !cgdState.savingsChartHiddenRubrics.has(entry.key));
  const singleVisibleRubric = visibleSeries.length === 1 ? visibleSeries[0] : null;
  host.dataset.singleSavingsRubricKey = singleVisibleRubric ? singleVisibleRubric.key : "";

  const legend = series
    .map((entry) => {
      const isVisible = !cgdState.savingsChartHiddenRubrics.has(entry.key);
      const stateClass = isVisible ? "is-active" : "is-inactive";
      return `<button type='button' class='outcome-evolution-legend-item ${stateClass}' data-savings-chart-toggle='${escapeHtml(entry.key)}' aria-pressed='${isVisible ? "true" : "false"}'><span class='outcome-evolution-legend-dot' style='background:${entry.color};'></span>${escapeHtml(entry.name)}</button>`;
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
  const expenseSeries = isSingleRubricMode ? buildSavingsExpenseSeriesForRubric(singleVisibleRubric) : [];
  const expenseStateKey = (expenseKey) => `${singleVisibleRubric.key}::${expenseKey}`;
  const visibleExpenseSeries = isSingleRubricMode
    ? expenseSeries.filter((entry) => !cgdState.savingsDrilldownHiddenExpenses.has(expenseStateKey(entry.key)))
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
        <button type='button' class='outcome-drilldown-close-btn' data-savings-chart-close-main>Fechar</button>
      </div>
      <div class='outcome-evolution-top-series'>${legend}</div>
      <p class='outcome-evolution-empty'>Esta rubrica nao tem despesas com valores ao longo do ano.</p>
    `;
    return;
  }

  if (isSingleRubricMode && !visibleExpenseSeries.length) {
    host.innerHTML = `
      <div class='outcome-drilldown-toolbar'>
        <button type='button' class='outcome-drilldown-close-btn' data-savings-chart-close-main>Fechar</button>
      </div>
      <div class='outcome-evolution-top-series'>${legend}</div>
      <p class='outcome-evolution-empty'>Nenhuma despesa selecionada. Clica na legenda para voltar a mostrar.</p>
      <div class='outcome-evolution-top-series'>${expenseSeries
        .map((entry) => {
          const isVisible = !cgdState.savingsDrilldownHiddenExpenses.has(expenseStateKey(entry.key));
          const stateClass = isVisible ? "is-active" : "is-inactive";
          return `<button type='button' class='outcome-evolution-legend-item ${stateClass}' data-savings-drilldown-toggle='${escapeHtml(entry.key)}' aria-pressed='${isVisible ? "true" : "false"}'><span class='outcome-evolution-legend-dot' style='background:${entry.color};'></span>${escapeHtml(entry.name)}</button>`;
        })
        .join("")}</div>
    `;
    return;
  }

  const allValues = plottedSeries.flatMap((entry) => entry.values);
  const verticalScale = computeChartVerticalScale(allValues, { top: padding.top, height: plotHeight });
  const xFor = (monthIndex) => padding.left + monthIndex * monthStep;
  const yFor = verticalScale.yFor;
  const plotBaselineY = verticalScale.zeroY;

  const horizontalGridCount = 12;
  const gridLines = Array.from({ length: horizontalGridCount + 1 }, (_, index) => {
    const ratio = index / horizontalGridCount;
    const y = padding.top + ratio * plotHeight;
    const labelValue = verticalScale.maxValue - ratio * (verticalScale.maxValue - verticalScale.minValue);
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
      const isSelected = !isSingleRubricMode && entry.key === cgdState.savingsChartSelectedRubricKey;
      const strokeWidth = isSingleRubricMode ? "0.6" : "1.3";
      const selectionClass = isSelected ? "is-selected" : "";
      const points = entry.values.map((value, monthIndex) => ({ x: xFor(monthIndex), y: yFor(value), value, monthIndex }));
      const pathData = buildSmoothPathData(points);
      const areaPath = `${pathData} L ${points[points.length - 1].x.toFixed(2)} ${plotBaselineY.toFixed(2)} L ${points[0].x.toFixed(2)} ${plotBaselineY.toFixed(2)} Z`;
      const pointsMarkup = entry.values
        .map((value, monthIndex) => {
          const cx = xFor(monthIndex);
          const cy = yFor(value);
          return `<circle class='outcome-evolution-point' cx='${cx.toFixed(2)}' cy='${cy.toFixed(2)}' r='2.8' fill='${entry.color}' tabindex='0' data-series-name='${escapeHtml(entry.name)}' data-month-name='${escapeHtml(months[monthIndex])}' data-value='${value.toFixed(2)}' data-series-color='${entry.color}'></circle>`;
        })
        .join("");
      return `
        <g class='outcome-evolution-series ${selectionClass}' ${isSingleRubricMode ? "" : `data-savings-chart-drilldown='${escapeHtml(entry.key)}'`}>
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
          const isVisible = !cgdState.savingsDrilldownHiddenExpenses.has(expenseStateKey(entry.key));
          const stateClass = isVisible ? "is-active" : "is-inactive";
          return `<button type='button' class='outcome-evolution-legend-item ${stateClass}' data-savings-drilldown-toggle='${escapeHtml(entry.key)}' aria-pressed='${isVisible ? "true" : "false"}'><span class='outcome-evolution-legend-dot' style='background:${entry.color};'></span>${escapeHtml(entry.name)}</button>`;
        })
        .join("")
    : "";

  const singleRubricLegendMarkup = isSingleRubricMode && expenseSeries.length
    ? `<div class='outcome-evolution-top-series'>${expenseLegend}</div>`
    : "";

  host.innerHTML = `
    <div class='outcome-drilldown-toolbar'>
      <button type='button' class='outcome-drilldown-close-btn' data-savings-chart-close-main>Fechar</button>
    </div>
    <div class='outcome-evolution-top-series'>${legend}</div>
    ${singleRubricLegendMarkup}
    <div class='outcome-evolution-svg-wrap'>
      <svg class='outcome-evolution-svg' viewBox='0 0 ${chartWidth} ${chartHeight}' role='img' aria-label='${isSingleRubricMode ? "Grafico de linhas com evolucao das despesas da rubrica selecionada" : "Grafico de linhas com evolucao das rubricas de poupancas"}'>
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

function resetOutcomeExpenseDetail() {
  resetExplicitItemDetail(getExplicitDetailConfig("outcome", "evolution"));
}

function resetIncomeRevenueDetail() {
  resetExplicitItemDetail(getExplicitDetailConfig("income", "evolution"));
}

function resetHiddenSeriesSelectionToFirst(series, hiddenSet) {
  hiddenSet.clear();
  series.slice(1).forEach((entry) => {
    hiddenSet.add(entry.key);
  });
}

function resetHiddenExpenseSelectionToFirst(rubricKey, expenseSeries, hiddenSet) {
  hiddenSet.clear();
  expenseSeries.slice(1).forEach((entry) => {
    hiddenSet.add(`${rubricKey}::${entry.key}`);
  });
}

function getExplicitDetailConfig(kind, renderer) {
  const isComparison = renderer === "comparison";
  if (kind === "income") {
    return {
      enabled: EXPLICIT_INCOME_REVENUE_DETAIL,
      detailVisibleStateKey: isComparison
        ? "incomeComparisonRevenueDetailVisible"
        : "incomeChartRevenueDetailVisible",
      detailRubricKeyStateKey: isComparison
        ? "incomeComparisonRevenueDetailRubricKey"
        : "incomeChartRevenueDetailRubricKey",
      selectedRubricStateKey: isComparison ? null : "incomeChartSelectedRubricKey",
      hiddenRubricsSet: isComparison
        ? cgdState.incomeComparisonHiddenRubrics
        : cgdState.incomeChartHiddenRubrics,
      hiddenItemsSet: isComparison
        ? cgdState.incomeComparisonHiddenExpenses
        : cgdState.incomeDrilldownHiddenExpenses,
      buildRubricSeries: isComparison
        ? () => buildComparisonSeriesForKind("income")
        : buildIncomeRubricSeries,
      buildItemSeries: isComparison
        ? (rubric) => buildComparisonExpenseSeriesForRubric(rubric, "income")
        : buildIncomeExpenseSeriesForRubric,
      toggleSelector: isComparison
        ? "[data-income-comparison-revenue-detail-toggle]"
        : "[data-income-revenue-detail-toggle]",
      toggleAttribute: isComparison
        ? "data-income-comparison-revenue-detail-toggle"
        : "data-income-revenue-detail-toggle",
      detailSeriesId: isComparison
        ? "income-comparison-revenue-detail-series"
        : "income-revenue-detail-series",
      itemPlural: "receitas",
      detailGroupLabel: isComparison
        ? "Receitas da rubrica selecionada no grafico comparativo"
        : "Receitas da rubrica selecionada"
    };
  }
  if (kind === "outcome") {
    return {
      enabled: EXPLICIT_OUTCOME_EXPENSE_DETAIL,
      detailVisibleStateKey: isComparison
        ? "outcomeComparisonExpenseDetailVisible"
        : "outcomeChartExpenseDetailVisible",
      detailRubricKeyStateKey: isComparison
        ? "outcomeComparisonExpenseDetailRubricKey"
        : "outcomeChartExpenseDetailRubricKey",
      selectedRubricStateKey: isComparison ? null : "outcomeChartSelectedRubricKey",
      hiddenRubricsSet: isComparison
        ? cgdState.outcomeComparisonHiddenRubrics
        : cgdState.outcomeChartHiddenRubrics,
      hiddenItemsSet: isComparison
        ? cgdState.outcomeComparisonHiddenExpenses
        : cgdState.outcomeDrilldownHiddenExpenses,
      buildRubricSeries: isComparison
        ? () => buildComparisonSeriesForKind("outcome")
        : buildOutcomeRubricSeries,
      buildItemSeries: isComparison
        ? (rubric) => buildComparisonExpenseSeriesForRubric(rubric, "outcome")
        : buildOutcomeExpenseSeriesForRubric,
      toggleSelector: isComparison
        ? "[data-outcome-comparison-expense-detail-toggle]"
        : "[data-outcome-expense-detail-toggle]",
      toggleAttribute: isComparison
        ? "data-outcome-comparison-expense-detail-toggle"
        : "data-outcome-expense-detail-toggle",
      detailSeriesId: isComparison
        ? "outcome-comparison-expense-detail-series"
        : "outcome-expense-detail-series",
      itemPlural: "despesas",
      detailGroupLabel: isComparison
        ? "Despesas da rubrica selecionada no grafico comparativo"
        : "Despesas da rubrica selecionada"
    };
  }
  return null;
}

function resetExplicitItemDetail(config) {
  if (!config?.enabled) {
    return;
  }
  cgdState[config.detailVisibleStateKey] = false;
  cgdState[config.detailRubricKeyStateKey] = null;
  config.hiddenItemsSet.clear();
}

function isExplicitDetailExpanded(config, rubricKey) {
  return Boolean(
    config?.enabled
    && rubricKey
    && cgdState[config.detailVisibleStateKey]
    && cgdState[config.detailRubricKeyStateKey] === rubricKey
  );
}

function resetExplicitRubricSelectionToFirst(config) {
  if (!config?.enabled) {
    return;
  }
  const rubricSeries = config.buildRubricSeries();
  if (config.selectedRubricStateKey) {
    cgdState[config.selectedRubricStateKey] = null;
  }
  resetHiddenSeriesSelectionToFirst(rubricSeries, config.hiddenRubricsSet);
  resetExplicitItemDetail(config);
}

function resetExplicitItemSelectionToFirst(config, rubricKey) {
  if (!config?.enabled) {
    return;
  }
  const activeRubric = config.buildRubricSeries().find((entry) => entry.key === rubricKey);
  const itemSeries = config.buildItemSeries(activeRubric);
  resetHiddenExpenseSelectionToFirst(rubricKey, itemSeries, config.hiddenItemsSet);
}

function expandExplicitItemDetail(config, rubricKey) {
  if (!config?.enabled || !rubricKey) {
    return;
  }
  cgdState[config.detailVisibleStateKey] = true;
  cgdState[config.detailRubricKeyStateKey] = rubricKey;
  resetExplicitItemSelectionToFirst(config, rubricKey);
}

function focusExplicitDetailToggle(host, config) {
  if (!config?.enabled) {
    return;
  }
  requestAnimationFrame(() => {
    host.querySelector(config.toggleSelector)?.focus();
  });
}

function resetOutcomeRubricSelectionToFirst() {
  resetExplicitRubricSelectionToFirst(getExplicitDetailConfig("outcome", "evolution"));
}

function resetOutcomeExpenseSelectionToFirst(rubricKey) {
  resetExplicitItemSelectionToFirst(getExplicitDetailConfig("outcome", "evolution"), rubricKey);
}

function resetIncomeRubricSelectionToFirst() {
  resetExplicitRubricSelectionToFirst(getExplicitDetailConfig("income", "evolution"));
}

function resetIncomeRevenueSelectionToFirst(rubricKey) {
  resetExplicitItemSelectionToFirst(getExplicitDetailConfig("income", "evolution"), rubricKey);
}

function computeTwelveMonthAverage(values) {
  const normalizedValues = months.map((_, monthIndex) => {
    const numeric = Number(values?.[monthIndex]);
    return Number.isFinite(numeric) ? numeric : 0;
  });
  return normalizedValues.reduce((sum, value) => sum + value, 0) / months.length;
}

function computeOutcomeSeriesAverage(series) {
  // Series values already contain the model's real-to-estimated monthly fallback.
  return computeTwelveMonthAverage(series?.values);
}

function formatOutcomeAverageValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : "0.00";
}

function composeCssColorWithOpacity(color, opacity) {
  const normalizedColor = String(color || "").trim();
  const numericOpacity = Number(opacity);
  const safeOpacity = Number.isFinite(numericOpacity)
    ? Math.min(Math.max(numericOpacity, 0), 1)
    : 1;
  if (safeOpacity === 1) {
    return normalizedColor;
  }

  const longHex = normalizedColor.match(/^#([0-9a-f]{6})$/i)?.[1];
  const shortHex = normalizedColor.match(/^#([0-9a-f]{3})$/i)?.[1];
  const expandedHex = longHex || (shortHex
    ? shortHex.split("").map((character) => character.repeat(2)).join("")
    : "");
  if (expandedHex) {
    const red = Number.parseInt(expandedHex.slice(0, 2), 16);
    const green = Number.parseInt(expandedHex.slice(2, 4), 16);
    const blue = Number.parseInt(expandedHex.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${safeOpacity})`;
  }

  return `color-mix(in srgb, ${normalizedColor} ${safeOpacity * 100}%, transparent)`;
}

function focusOutcomeExpenseDetailToggle(host) {
  requestAnimationFrame(() => {
    host.querySelector("[data-outcome-expense-detail-toggle]")?.focus();
  });
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
      resetOutcomeExpenseDetail();
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
      resetOutcomeExpenseDetail();
      resetOutcomeRubricSelectionToFirst();
      renderOutcomeEvolutionChart();
      return;
    }

    const expenseDetailToggle = event.target.closest("[data-outcome-expense-detail-toggle]");
    if (expenseDetailToggle) {
      const activeRubricKey = String(host.dataset.singleRubricKey || "").trim();
      if (!activeRubricKey) {
        return;
      }

      const isExpanded = cgdState.outcomeChartExpenseDetailVisible
        && cgdState.outcomeChartExpenseDetailRubricKey === activeRubricKey;
      if (isExpanded) {
        resetOutcomeExpenseDetail();
      } else {
        cgdState.outcomeChartExpenseDetailVisible = true;
        cgdState.outcomeChartExpenseDetailRubricKey = activeRubricKey;
        resetOutcomeExpenseSelectionToFirst(activeRubricKey);
      }
      renderOutcomeEvolutionChart();
      focusOutcomeExpenseDetailToggle(host);
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
      resetOutcomeExpenseDetail();

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
        resetOutcomeExpenseDetail();
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
      resetOutcomeExpenseDetail();
      cgdState.outcomeChartHiddenRubrics.clear();
      renderOutcomeEvolutionChart();
      return;
    }

    const deselectAllBtn = event.target.closest("[data-outcome-chart-deselect-all]");
    if (deselectAllBtn) {
      resetOutcomeExpenseDetail();
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
  if (
    EXPLICIT_OUTCOME_EXPENSE_DETAIL
    && (
      !singleVisibleRubric
      || (
        cgdState.outcomeChartExpenseDetailVisible
        && cgdState.outcomeChartExpenseDetailRubricKey !== singleVisibleRubric.key
      )
    )
  ) {
    resetOutcomeExpenseDetail();
  }

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

  const isLegacySingleRubricMode = Boolean(singleVisibleRubric) && !EXPLICIT_OUTCOME_EXPENSE_DETAIL;
  const expenseSeries = singleVisibleRubric ? buildOutcomeExpenseSeriesForRubric(singleVisibleRubric) : [];
  const expenseStateKey = (expenseKey) => `${singleVisibleRubric?.key || ""}::${expenseKey}`;
  const isExplicitExpenseDetailAvailable = Boolean(
    EXPLICIT_OUTCOME_EXPENSE_DETAIL
    && singleVisibleRubric
    && expenseSeries.length
  );
  if (
    EXPLICIT_OUTCOME_EXPENSE_DETAIL
    && !isExplicitExpenseDetailAvailable
    && cgdState.outcomeChartExpenseDetailVisible
  ) {
    resetOutcomeExpenseDetail();
  }
  const isExplicitExpenseDetailExpanded = Boolean(
    isExplicitExpenseDetailAvailable
    && cgdState.outcomeChartExpenseDetailVisible
    && cgdState.outcomeChartExpenseDetailRubricKey === singleVisibleRubric.key
  );
  const visibleExpenseSeries = isLegacySingleRubricMode || isExplicitExpenseDetailExpanded
    ? expenseSeries.filter((entry) => !cgdState.outcomeDrilldownHiddenExpenses.has(expenseStateKey(entry.key)))
    : [];

  const chartWidth = 980;
  const chartHeight = 320;
  const padding = { top: 20, right: 18, bottom: 38, left: 54 };
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;
  const monthStep = plotWidth / (months.length - 1);

  const rubricPlotSeries = visibleSeries.map((entry) => ({ ...entry, seriesKind: "rubric" }));
  const expensePlotSeries = visibleExpenseSeries.map((entry) => ({ ...entry, seriesKind: "expense" }));
  const plottedSeries = isLegacySingleRubricMode || isExplicitExpenseDetailExpanded
    ? expensePlotSeries
    : rubricPlotSeries;
  const averageSource = EXPLICIT_OUTCOME_EXPENSE_DETAIL && plottedSeries.length === 1
    ? plottedSeries[0]
    : null;
  const averageValue = averageSource ? computeOutcomeSeriesAverage(averageSource) : null;
  if (isLegacySingleRubricMode && !expenseSeries.length) {
    host.innerHTML = `
      <div class='outcome-drilldown-toolbar'>
        <button type='button' class='outcome-drilldown-close-btn' data-outcome-chart-close-main>Fechar</button>
      </div>
      <div class='outcome-evolution-top-series'>${legend}</div>
      <p class='outcome-evolution-empty'>Esta rubrica nao tem despesas com valores ao longo do ano.</p>
    `;
    return;
  }

  if (isLegacySingleRubricMode && !visibleExpenseSeries.length) {
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
  const allValues = plottedSeries.flatMap((entry) => entry.values);
  const verticalScale = computeChartVerticalScale(allValues, { top: padding.top, height: plotHeight });
  const xFor = (monthIndex) => padding.left + monthIndex * monthStep;
  const yFor = verticalScale.yFor;
  const plotBaselineY = verticalScale.zeroY;

  const horizontalGridCount = 12;
  const gridLines = Array.from({ length: horizontalGridCount + 1 }, (_, index) => {
    const ratio = index / horizontalGridCount;
    const y = padding.top + ratio * plotHeight;
    const labelValue = verticalScale.maxValue - ratio * (verticalScale.maxValue - verticalScale.minValue);
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
      const isRubricSeries = entry.seriesKind === "rubric";
      const isSelected = isRubricSeries && entry.key === cgdState.outcomeChartSelectedRubricKey;
      const strokeWidth = isRubricSeries ? "1.3" : "0.6";
      const selectionClass = isSelected ? "is-selected" : "";
      const points = entry.values.map((value, monthIndex) => ({ x: xFor(monthIndex), y: yFor(value), value, monthIndex }));
      const pathData = buildSmoothPathData(points);
      const areaPath = `${pathData} L ${points[points.length - 1].x.toFixed(2)} ${plotBaselineY.toFixed(2)} L ${points[0].x.toFixed(2)} ${plotBaselineY.toFixed(2)} Z`;
      const pointsMarkup = entry.values
        .map((value, monthIndex) => {
          const cx = xFor(monthIndex);
          const cy = yFor(value);
          return `<circle class='outcome-evolution-point' cx='${cx.toFixed(2)}' cy='${cy.toFixed(2)}' r='2.8' fill='${entry.color}' tabindex='0' data-series-name='${escapeHtml(entry.name)}' data-month-name='${escapeHtml(months[monthIndex])}' data-value='${value.toFixed(2)}' data-series-color='${entry.color}'></circle>`;
        })
        .join("");
      return `
        <g
          class='outcome-evolution-series ${selectionClass}'
          data-series-kind='${entry.seriesKind}'
          data-series-key='${escapeHtml(entry.key)}'
          ${isRubricSeries && !singleVisibleRubric ? `data-outcome-chart-drilldown='${escapeHtml(entry.key)}'` : ""}
        >
          <path d='${areaPath}' class='outcome-evolution-area' fill='${entry.color}' fill-opacity='0.10' />
          <path d='${pathData}' class='outcome-evolution-line' fill='none' stroke='${entry.color}' stroke-width='${strokeWidth}' stroke-linecap='round' stroke-linejoin='round' />
          ${pointsMarkup}
        </g>
      `;
    })
    .join("");

  const averageLine = averageSource && Number.isFinite(averageValue)
    ? (() => {
        const averageY = yFor(averageValue);
        const formattedAverage = formatOutcomeAverageValue(averageValue);
        const averageAccessibleLabel = `Média - ${averageSource.name}: ${formattedAverage}. Usa valores estimados nos meses sem valor real.`;
        return `
          <g
            class='outcome-evolution-average'
            data-outcome-average
            data-average-source-kind='${averageSource.seriesKind}'
            data-average-source-key='${escapeHtml(averageSource.key)}'
            data-average-value='${averageValue}'
            role='img'
            aria-label='${escapeHtml(averageAccessibleLabel)}'
            pointer-events='none'
          >
            <title>${escapeHtml(averageAccessibleLabel)}</title>
            <line
              data-outcome-average-line
              x1='${padding.left}'
              y1='${averageY.toFixed(2)}'
              x2='${chartWidth - padding.right}'
              y2='${averageY.toFixed(2)}'
              fill='none'
              stroke='${averageSource.color}'
              stroke-width='1.8'
              stroke-dasharray='8 6'
              stroke-linecap='butt'
              vector-effect='non-scaling-stroke'
            />
          </g>
        `;
      })()
    : "";
  const averageLabelMarkup = averageSource && Number.isFinite(averageValue)
    ? `
      <div class='outcome-evolution-top-series' data-outcome-average-label-row aria-hidden='true'>
        <span
          class='outcome-evolution-tooltip-series'
          data-outcome-average-label
          style='color:${averageSource.color};'
        >${escapeHtml(`Média: ${formatOutcomeAverageValue(averageValue)}`)}</span>
      </div>
    `
    : "";

  const expenseLegend = isLegacySingleRubricMode || isExplicitExpenseDetailExpanded
    ? expenseSeries
        .map((entry) => {
          const isVisible = !cgdState.outcomeDrilldownHiddenExpenses.has(expenseStateKey(entry.key));
          const stateClass = isVisible ? "is-active" : "is-inactive";
          return `<button type='button' class='outcome-evolution-legend-item ${stateClass}' data-outcome-drilldown-toggle='${escapeHtml(entry.key)}' aria-pressed='${isVisible ? "true" : "false"}'><span class='outcome-evolution-legend-dot' style='background:${entry.color};'></span>${escapeHtml(entry.name)}</button>`;
        })
        .join("")
    : "";

  const singleRubricLegendMarkup = isLegacySingleRubricMode && expenseSeries.length
    ? `<div class='outcome-evolution-top-series'>${expenseLegend}</div>`
    : "";
  const expenseDetailToggleMarkup = isExplicitExpenseDetailAvailable
    ? `
      <button
        type='button'
        class='outcome-evolution-control-btn outcome-expense-detail-toggle'
        data-outcome-expense-detail-toggle
        aria-expanded='${isExplicitExpenseDetailExpanded ? "true" : "false"}'
        aria-controls='outcome-expense-detail-series'
      >${isExplicitExpenseDetailExpanded ? "Ocultar despesas" : "Mostrar despesas"}</button>
    `
    : "";
  const expenseDetailMarkup = isExplicitExpenseDetailAvailable
    ? `
      <div
        id='outcome-expense-detail-series'
        class='outcome-expense-detail'
        role='group'
        aria-label='Despesas da rubrica selecionada'
        ${isExplicitExpenseDetailExpanded ? "" : "hidden"}
      >
        ${isExplicitExpenseDetailExpanded ? `<div class='outcome-evolution-top-series'>${expenseLegend}</div>` : ""}
      </div>
    `
    : "";
  const chartAriaLabelBase = isLegacySingleRubricMode
    ? "Grafico de linhas com evolucao das despesas da rubrica selecionada"
    : isExplicitExpenseDetailExpanded
      ? "Grafico de linhas com evolucao das despesas da rubrica selecionada"
      : "Grafico de linhas com evolucao das rubricas de despesas";
  const chartAriaLabel = averageSource && Number.isFinite(averageValue)
    ? `${chartAriaLabelBase}. Média de ${averageSource.name}: ${formatOutcomeAverageValue(averageValue)}, usando valores estimados nos meses sem valor real`
    : chartAriaLabelBase;

  host.innerHTML = `
    <div class='outcome-drilldown-toolbar ${isExplicitExpenseDetailAvailable ? "has-expense-detail" : ""}'>
      ${expenseDetailToggleMarkup}
      <button type='button' class='outcome-drilldown-close-btn' data-outcome-chart-close-main>Fechar</button>
    </div>
    <div class='outcome-evolution-top-series'>${legend}</div>
    ${singleRubricLegendMarkup}
    ${expenseDetailMarkup}
    ${averageLabelMarkup}
    <div class='outcome-evolution-svg-wrap'>
      <svg class='outcome-evolution-svg' viewBox='0 0 ${chartWidth} ${chartHeight}' role='img' aria-label='${escapeHtml(chartAriaLabel)}'>
        ${gridLines}
        ${monthGridLines}
        ${lines}
        ${averageLine}
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

  const isCoverflexPage =
    IS_COVERFLEX
    || Boolean(document.body?.classList?.contains("coverflex-theme"))
    || String(window.location?.pathname || "").toLowerCase().includes("coverflex");

  const collapseState = captureCollapseState();

  panels.innerHTML = `
    ${isCoverflexPage ? "" : buildBalancePanel()}
    ${buildPanel("Receitas", "income", cgdState.data.income)}
    <section class='outcome-evolution-card income-evolution-card'>
      <div class='outcome-evolution' id='income-evolution-chart' aria-live='polite'></div>
    </section>
    <section class='outcome-evolution-card income-comparison-card'>
      <div class='outcome-evolution' id='income-comparison-chart' aria-live='polite'></div>
    </section>
    ${HIDE_SAVINGS
      ? ""
      : `${buildPanel("Poupancas", "savings", cgdState.data.savings)}
    <section class='outcome-evolution-card savings-evolution-card'>
      <div class='outcome-evolution' id='savings-evolution-chart' aria-live='polite'></div>
    </section>
    <section class='outcome-evolution-card savings-comparison-card'>
      <div class='outcome-evolution' id='savings-comparison-chart' aria-live='polite'></div>
    </section>`}
    ${buildPanel("Despesas", "outcome", cgdState.data.outcome)}
    <section class='outcome-evolution-card outcome-evolution-card-main'>
      <div class='outcome-evolution' id='outcome-evolution-chart' aria-live='polite'></div>
    </section>
    <section class='outcome-evolution-card outcome-comparison-card-main'>
      <div class='outcome-evolution' id='outcome-comparison-chart' aria-live='polite'></div>
    </section>
    ${isCoverflexPage ? buildEstimatedIrsPanel() : ""}
  `;

  if (isCoverflexPage) {
    panels.querySelectorAll(".panel.balance:not(.panel-estimated-irs)").forEach((node) => node.remove());
  }

  restoreCollapseState(collapseState);

  renderIncomeEvolutionChart();
  renderIncomeComparisonChart();
  if (!HIDE_SAVINGS) {
    renderSavingsEvolutionChart();
    renderSavingsComparisonChart();
  }
  renderOutcomeEvolutionChart();
  renderOutcomeComparisonChart();
}

function parseMoneyInputValue(value) {
  const normalized = String(value || "").replace(/\s+/g, "").replace(/,/g, "").trim();
  if (!normalized) {
    return null;
  }
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeBoundedRealInputValue(value) {
  const parsed = parseMoneyInputValue(value);
  if (parsed === null) {
    return null;
  }

  const clamped = Math.max(-999999.99, Math.min(999999.99, parsed));
  return Math.round(clamped * 100) / 100;
}

function isPastMonthOfCurrentYear(year, monthIndex) {
  const selectedYear = Number(year);
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  return selectedYear === currentYear && Number(monthIndex) < currentMonth;
}

function syncRealTotalizerEditableMonth(monthIndex) {
  const activeMonth = Number(monthIndex);
  const validActiveMonth = Number.isInteger(activeMonth) && activeMonth >= 0 && activeMonth <= 11
    ? activeMonth
    : Number(document.querySelector(".month-tile.active")?.getAttribute("data-month"));

  document.querySelectorAll("button[data-real-total-btn='true']").forEach((btn) => {
    const btnMonth = Number(btn.getAttribute("data-real-total-month"));
    const isActive = Number.isInteger(validActiveMonth) && btnMonth === validActiveMonth;
    btn.classList.toggle("is-active-month", isActive);
    btn.disabled = !isActive;
  });
}

function openRealValuePopup(monthIndex) {
  const modal = document.getElementById("real-value-modal");
  if (!modal) return;

  const year = Number(cgdState.selectedYear);
  const monthName = months[monthIndex] || "";
  const realSeries = computeRealSeriesForYear(year, cgdState.realComputationContexts);
  const currentValue = Number(realSeries?.values?.[monthIndex]) || 0;

  modal.querySelector("[data-real-modal-title]").textContent = `Real - ${monthName} ${year}`;
  const input = modal.querySelector("[data-real-modal-input]");
  input.value = money(currentValue);
  input.setAttribute("data-real-modal-month", monthIndex);
  window.DashboardModalLifecycle?.lock(modal, document.activeElement);
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  input.focus();
}

function closeRealValuePopup() {
  const modal = document.getElementById("real-value-modal");
  if (modal) {
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
    window.DashboardModalLifecycle?.unlock(modal);
  }
}

function bindRealValuePopup() {
  document.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-real-total-btn='true']");
    if (btn && !btn.disabled) {
      const monthIndex = Number(btn.getAttribute("data-real-total-month"));
      if (Number.isInteger(monthIndex) && monthIndex >= 0 && monthIndex <= 11) {
        openRealValuePopup(monthIndex);
      }
    }
  });

  const modal = document.getElementById("real-value-modal");
  if (!modal) return;

  const input = modal.querySelector("[data-real-modal-input]");

  input.addEventListener("input", () => {
    const normalized = String(input.value || "")
      .replace(/[^0-9,\.-]/g, "")
      .replace(/(?!^)-/g, "");
    if (normalized !== input.value) {
      input.value = normalized;
    }
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      modal.querySelector("[data-real-modal-save]").click();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape"
      && modal.classList.contains("show")
      && window.DashboardModalLifecycle?.isTopmost(modal)
    ) {
      event.preventDefault();
      closeRealValuePopup();
    }
  });

  modal.querySelector("[data-real-modal-save]").addEventListener("click", async () => {
    const monthIndex = Number(input.getAttribute("data-real-modal-month"));
    const realValue = normalizeBoundedRealInputValue(input.value);
    if (realValue === null) return;

    const year = Number(cgdState.selectedYear);
    try {
      await upsertRealValueForMonth({ ano: year, mes: monthIndex + 1, real: realValue });
      closeRealValuePopup();
      await loadYearData(cgdState.selectedYear);
    } catch (error) {
      console.error(`Erro ao guardar valor real em ${REAL_TABLE}:`, error);
      if (String(error?.code || "") === "42501") {
        console.error(`Permissao RLS negada para ${REAL_TABLE}. Verifica policies de insert/update para anon/authenticated.`);
        alert(
          `⚠️ ATIVAÇÃO NECESSÁRIA\n\n` +
          `As permissões de base de dados para ${TABLE_PREFIX.toUpperCase()} ainda não foram configuradas.\n\n` +
          `VER: ACTIVATION_REQUIRED.md\n\n` +
          `Passo rápido:\n` +
          `1. Abra: https://app.supabase.com/project/uooovgxrexpstrtfktst/sql/new\n` +
          `2. Copie SUPABASE_RLS_FIX_NB_REAL.sql\n` +
          `3. Cole e clique RUN`
        );
      }
    }
  });

  modal.querySelector("[data-real-modal-estimate]").addEventListener("click", async () => {
    const monthIndex = Number(input.getAttribute("data-real-modal-month"));
    const year = Number(cgdState.selectedYear);
    try {
      await supabaseClient
        .from(REAL_TABLE)
        .delete()
        .eq("ano", year)
        .eq("mes", monthIndex + 1);
      closeRealValuePopup();
      await loadYearData(cgdState.selectedYear);
    } catch (error) {
      console.error("Erro ao estimar valor real:", error);
    }
  });

  modal.querySelector("[data-real-modal-close]").addEventListener("click", () => {
    closeRealValuePopup();
  });

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeRealValuePopup();
    }
  });
}

function bindSoberTotalizerInputs() {
  bindRealValuePopup();
}

function buildComparisonSeriesForKind(kind) {
  const palette = kind === "income"
    ? THEME_COLORS.incomeRubrics
    : kind === "savings"
      ? THEME_COLORS.savingsRubrics
      : THEME_COLORS.outcomeRubrics;
  const sourceRubrics = kind === "income" ? cgdState.data?.income : kind === "savings" ? cgdState.data?.savings : cgdState.data?.outcome;
  const rubrics = Array.isArray(sourceRubrics) ? sourceRubrics : [];

  return rubrics
    .map((rubric, index) => {
      const rawId = rubric?.id;
      const key = Number.isFinite(Number(rawId)) ? `id-${Number(rawId)}` : `idx-${index}`;
      const valueTotals = emptyValues();
      const estimatedTotals = emptyValues();
      const realAverageTotals = emptyValues();

      const expenses = Array.isArray(rubric?.expenses) ? rubric.expenses : [];
      const comparisonExpenses = expenses
        .map((expense, expenseIndex) => {
          const expenseKey = Number.isFinite(Number(expense?.id))
            ? `id-${Number(expense.id)}`
            : `idx-${expenseIndex}`;
          const expenseValues = emptyValues();
          const expenseEstimatedValues = emptyValues();
          const expenseRealAverageValues = emptyValues();

          months.forEach((_, monthIndex) => {
            const monthData = expense?.monthData?.[monthIndex] || {};
            const rawValor = Number(monthData.valor);
            const rawEstimado = Number(monthData.valorEstimado);
            const normalizedValor = Number.isFinite(rawValor) ? rawValor : 0;
            const normalizedEstimado = Number.isFinite(rawEstimado) ? rawEstimado : 0;
            const resolvedRealAverage = parseExpenseValue({
              valor: normalizedValor,
              valor_estimado: normalizedEstimado
            });

            expenseValues[monthIndex] = normalizedValor;
            expenseEstimatedValues[monthIndex] = normalizedEstimado;
            expenseRealAverageValues[monthIndex] = resolvedRealAverage;
            valueTotals[monthIndex] += normalizedValor;
            estimatedTotals[monthIndex] += normalizedEstimado;
            realAverageTotals[monthIndex] += resolvedRealAverage;
          });

          return {
            key: expenseKey,
            name: expense?.name || `${kind === "income" ? "Receita" : "Despesa"} ${expenseIndex + 1}`,
            values: expenseValues,
            estimatedValues: expenseEstimatedValues,
            realAverageValues: expenseRealAverageValues
          };
        })
        .filter((entry) => entry.values.some((value) => value !== 0) || entry.estimatedValues.some((value) => value !== 0));

      return {
        key,
        name: rubric?.name || `Rubrica ${index + 1}`,
        color: palette[index % palette.length],
        values: valueTotals,
        estimatedValues: estimatedTotals,
        realAverageValues: realAverageTotals,
        expenses: comparisonExpenses
      };
    })
    .filter((entry) => entry.values.some((value) => value !== 0) || entry.estimatedValues.some((value) => value !== 0));
}

function buildComparisonExpenseSeriesForRubric(rubric, kind) {
  if (!rubric) {
    return [];
  }

  const palette = kind === "income"
    ? THEME_COLORS.incomeExpenses
    : kind === "savings"
      ? THEME_COLORS.savingsExpenses
      : THEME_COLORS.outcomeExpenses;

  const expenses = Array.isArray(rubric.expenses) ? rubric.expenses : [];
  return expenses.map((expense, index) => ({
    key: expense.key,
    name: expense.name,
    values: expense.values,
    estimatedValues: expense.estimatedValues,
    realAverageValues: expense.realAverageValues,
    color: palette[index % palette.length]
  }));
}

function resetOutcomeComparisonExpenseDetail() {
  resetExplicitItemDetail(getExplicitDetailConfig("outcome", "comparison"));
}

function resetIncomeComparisonRevenueDetail() {
  resetExplicitItemDetail(getExplicitDetailConfig("income", "comparison"));
}

function resetOutcomeComparisonRubricSelectionToFirst() {
  resetExplicitRubricSelectionToFirst(getExplicitDetailConfig("outcome", "comparison"));
}

function resetIncomeComparisonRubricSelectionToFirst() {
  resetExplicitRubricSelectionToFirst(getExplicitDetailConfig("income", "comparison"));
}

function resetOutcomeComparisonExpenseSelectionToFirst(rubricKey) {
  resetExplicitItemSelectionToFirst(getExplicitDetailConfig("outcome", "comparison"), rubricKey);
}

function resetIncomeComparisonRevenueSelectionToFirst(rubricKey) {
  resetExplicitItemSelectionToFirst(getExplicitDetailConfig("income", "comparison"), rubricKey);
}

function focusOutcomeComparisonExpenseDetailToggle(host) {
  focusExplicitDetailToggle(host, getExplicitDetailConfig("outcome", "comparison"));
}

function renderComparisonChartByKind(kind) {
  if (kind === "income") {
    renderIncomeComparisonChart();
  } else if (kind === "savings") {
    renderSavingsComparisonChart();
  } else {
    renderOutcomeComparisonChart();
  }
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
    let positionFrame = 0;
    let pointerPosition = null;
    const schedulePosition = (event) => {
      if (!Number.isFinite(event?.clientX) || !Number.isFinite(event?.clientY)) {
        return;
      }
      pointerPosition = { clientX: event.clientX, clientY: event.clientY };
      if (positionFrame) {
        return;
      }
      positionFrame = requestAnimationFrame(() => {
        positionFrame = 0;
        if (pointerPosition) {
          positionOutcomeChartTooltip(tooltip, wrap, pointerPosition);
        }
      });
    };

    wrap.addEventListener("pointerleave", hideTooltip);

    wrap.querySelectorAll("[data-comparison-point]").forEach((point) => {
      const showTooltip = (event) => {
        const monthName = point.getAttribute("data-month-name") || "";
        const seriesName = point.getAttribute("data-series-name") || "";
        const value = point.getAttribute("data-value") || "0.00";
        const color = point.getAttribute("data-series-color") || THEME_COLORS.tooltipFallback;

        tooltip.innerHTML = `
          <div class='outcome-evolution-tooltip-month'>${escapeHtml(monthName)}</div>
          <div class='outcome-evolution-tooltip-row'>
            <span class='outcome-evolution-tooltip-dot' style='background:${escapeHtml(color)};'></span>
            <span class='outcome-evolution-tooltip-series'>${escapeHtml(seriesName)}</span>
            <strong class='outcome-evolution-tooltip-value'>${escapeHtml(value)}</strong>
          </div>
        `;
        tooltip.classList.add("is-visible");
        schedulePosition(event);
      };

      point.addEventListener("pointerenter", showTooltip);
      point.addEventListener("pointermove", schedulePosition);
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
    const detailConfig = getExplicitDetailConfig(kind, "comparison");
    const hiddenSet = kind === "income"
      ? cgdState.incomeComparisonHiddenRubrics
      : kind === "savings"
        ? cgdState.savingsComparisonHiddenRubrics
        : cgdState.outcomeComparisonHiddenRubrics;
    const hiddenExpensesSet = kind === "income"
      ? cgdState.incomeComparisonHiddenExpenses
      : kind === "savings"
        ? cgdState.savingsComparisonHiddenExpenses
        : cgdState.outcomeComparisonHiddenExpenses;

    const closeBtn = event.target.closest("[data-income-comparison-chart-close-main], [data-savings-comparison-chart-close-main], [data-outcome-comparison-chart-close-main]");
    if (closeBtn) {
      hiddenSet.clear();
      hiddenExpensesSet.clear();
      if (kind === "income") {
        cgdState.incomeComparisonChartVisible = false;
        resetExplicitItemDetail(detailConfig);
      } else if (kind === "savings") {
        cgdState.savingsComparisonChartVisible = false;
      } else {
        cgdState.outcomeComparisonChartVisible = false;
        resetOutcomeComparisonExpenseDetail();
      }

      renderPanels();
      document.dispatchEvent(new Event("cgd:rendered"));
      requestAnimationFrame(() => {
        ensurePanelHeadVisible(kind);
      });
      return;
    }

    const expenseDetailToggle = detailConfig?.enabled
      ? event.target.closest(detailConfig.toggleSelector)
      : null;
    if (expenseDetailToggle) {
      const activeRubricKey = String(host.dataset.singleComparisonRubricKey || "").trim();
      if (!activeRubricKey) {
        return;
      }

      if (isExplicitDetailExpanded(detailConfig, activeRubricKey)) {
        resetExplicitItemDetail(detailConfig);
      } else {
        expandExplicitItemDetail(detailConfig, activeRubricKey);
      }
      renderComparisonChartByKind(kind);
      focusExplicitDetailToggle(host, detailConfig);
      return;
    }

    const drilldownToggle = event.target.closest("[data-comparison-drilldown-toggle]");
    if (drilldownToggle) {
      const expenseKey = String(drilldownToggle.getAttribute("data-comparison-drilldown-toggle") || "").trim();
      const activeRubricKey = String(host.dataset.singleComparisonRubricKey || "").trim();
      if (!expenseKey || !activeRubricKey) {
        return;
      }

      const stateKey = `${activeRubricKey}::${expenseKey}`;
      if (hiddenExpensesSet.has(stateKey)) {
        hiddenExpensesSet.delete(stateKey);
      } else {
        hiddenExpensesSet.add(stateKey);
      }

      renderComparisonChartByKind(kind);
      return;
    }

    const toggleBtn = event.target.closest("[data-comparison-chart-toggle]");
    if (toggleBtn) {
      const key = String(toggleBtn.getAttribute("data-comparison-chart-toggle") || "").trim();
      if (!key) {
        return;
      }

      resetExplicitItemDetail(detailConfig);

      if (hiddenSet.has(key)) {
        hiddenSet.delete(key);
      } else {
        hiddenSet.add(key);
      }

      renderComparisonChartByKind(kind);
      return;
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

  const hiddenSet = kind === "income"
    ? cgdState.incomeComparisonHiddenRubrics
    : kind === "savings"
      ? cgdState.savingsComparisonHiddenRubrics
      : cgdState.outcomeComparisonHiddenRubrics;
  const hiddenExpensesSet = kind === "income"
    ? cgdState.incomeComparisonHiddenExpenses
    : kind === "savings"
      ? cgdState.savingsComparisonHiddenExpenses
      : cgdState.outcomeComparisonHiddenExpenses;
  const rubricSeries = buildComparisonSeriesForKind(kind);
  const detailConfig = getExplicitDetailConfig(kind, "comparison");
  const isExplicitDetail = Boolean(detailConfig?.enabled);
  const comparisonToolbarClass = isExplicitDetail
    ? "outcome-drilldown-toolbar outcome-comparison-toolbar"
    : "outcome-drilldown-toolbar";

  if (!rubricSeries.length) {
    host.dataset.singleComparisonRubricKey = "";
    resetExplicitItemDetail(detailConfig);
    host.innerHTML = `
      <div class='${comparisonToolbarClass}'>
        <button type='button' class='outcome-drilldown-close-btn' ${closeAttr}>Fechar</button>
      </div>
      <p class='outcome-evolution-empty'>Ainda nao existem valores para comparar valor e valor estimado.</p>
    `;
    return;
  }

  const visibleRubrics = rubricSeries.filter((entry) => !hiddenSet.has(entry.key));
  const singleVisibleRubric = visibleRubrics.length === 1 ? visibleRubrics[0] : null;
  host.dataset.singleComparisonRubricKey = singleVisibleRubric ? singleVisibleRubric.key : "";
  if (
    isExplicitDetail
    && (
      !singleVisibleRubric
      || (
        cgdState[detailConfig.detailVisibleStateKey]
        && cgdState[detailConfig.detailRubricKeyStateKey] !== singleVisibleRubric.key
      )
    )
  ) {
    resetExplicitItemDetail(detailConfig);
  }

  const expenseSeries = singleVisibleRubric ? buildComparisonExpenseSeriesForRubric(singleVisibleRubric, kind) : [];
  const expenseStateKey = (expenseKey) => `${singleVisibleRubric?.key || ""}::${expenseKey}`;
  const isExplicitDetailAvailable = Boolean(
    isExplicitDetail
    && singleVisibleRubric
    && expenseSeries.length
  );
  if (
    isExplicitDetail
    && !isExplicitDetailAvailable
    && cgdState[detailConfig.detailVisibleStateKey]
  ) {
    resetExplicitItemDetail(detailConfig);
  }
  const isExplicitDetailExpandedState = Boolean(
    isExplicitDetailAvailable
    && isExplicitDetailExpanded(detailConfig, singleVisibleRubric.key)
  );
  const isLegacySingleRubricMode = Boolean(singleVisibleRubric) && !isExplicitDetail;
  const showsExpenseSeries = isLegacySingleRubricMode || isExplicitDetailExpandedState;
  const visibleExpenseSeries = showsExpenseSeries
    ? expenseSeries.filter((entry) => !hiddenExpensesSet.has(expenseStateKey(entry.key)))
    : [];

  const estimatedBarFillOpacity = 0.42;
  const withComparisonBarColors = (entry, seriesKind) => ({
    ...entry,
    seriesKind,
    barColors: {
      realFill: entry.color,
      estimatedFill: entry.color,
      estimatedFillOpacity: estimatedBarFillOpacity,
      estimatedStroke: entry.color
    }
  });
  const rubricPlotSeries = visibleRubrics.map((entry) => withComparisonBarColors(entry, "rubric"));
  const expensePlotSeries = visibleExpenseSeries.map((entry) => withComparisonBarColors(entry, "expense"));
  const plottedSeries = showsExpenseSeries ? expensePlotSeries : rubricPlotSeries;
  const comparisonAverageSource = isExplicitDetail && plottedSeries.length === 1
    ? plottedSeries[0]
    : null;
  const comparisonAverages = comparisonAverageSource
    ? [
        {
          kind: "real",
          label: "Média Real",
          values: comparisonAverageSource.realAverageValues,
          color: comparisonAverageSource.barColors.realFill,
          dashArray: "8 6"
        },
        {
          kind: "estimated",
          label: "Média Estimada",
          values: comparisonAverageSource.estimatedValues,
          color: composeCssColorWithOpacity(
            comparisonAverageSource.barColors.estimatedFill,
            comparisonAverageSource.barColors.estimatedFillOpacity
          ),
          dashArray: "8 6"
        }
      ].map((average) => ({
        ...average,
        value: computeTwelveMonthAverage(average.values)
      }))
    : [];

  const legend = rubricSeries
    .map((entry) => {
      const isVisibleRubric = !hiddenSet.has(entry.key);
      const stateClass = isVisibleRubric ? "is-active" : "is-inactive";
      return `<button type='button' class='outcome-evolution-legend-item ${stateClass}' data-comparison-chart-toggle='${escapeHtml(entry.key)}' aria-pressed='${isVisibleRubric ? "true" : "false"}'><span class='outcome-evolution-legend-dot' style='background:${entry.color};'></span>${escapeHtml(entry.name)}</button>`;
    })
    .join("");

  const expenseLegend = showsExpenseSeries
    ? expenseSeries
        .map((entry) => {
          const isVisibleExpense = !hiddenExpensesSet.has(expenseStateKey(entry.key));
          const stateClass = isVisibleExpense ? "is-active" : "is-inactive";
          return `<button type='button' class='outcome-evolution-legend-item ${stateClass}' data-comparison-drilldown-toggle='${escapeHtml(entry.key)}' aria-pressed='${isVisibleExpense ? "true" : "false"}'><span class='outcome-evolution-legend-dot' style='background:${entry.color};'></span>${escapeHtml(entry.name)}</button>`;
        })
        .join("")
    : "";

  if (!visibleRubrics.length) {
    host.innerHTML = `
      <div class='${comparisonToolbarClass}'>
        <button type='button' class='outcome-drilldown-close-btn' ${closeAttr}>Fechar</button>
      </div>
      <p class='outcome-evolution-empty'>Nenhuma rubrica selecionada. Clica na legenda para voltar a mostrar.</p>
      <div class='outcome-evolution-top-series'>${legend}</div>
    `;
    return;
  }

  if (isLegacySingleRubricMode && !expenseSeries.length) {
    host.innerHTML = `
      <div class='${comparisonToolbarClass}'>
        <button type='button' class='outcome-drilldown-close-btn' ${closeAttr}>Fechar</button>
      </div>
      <div class='outcome-evolution-top-series'>${legend}</div>
      <p class='outcome-evolution-empty'>Esta rubrica nao tem despesas com valores para comparar.</p>
    `;
    return;
  }

  if (isLegacySingleRubricMode && !visibleExpenseSeries.length) {
    host.innerHTML = `
      <div class='${comparisonToolbarClass}'>
        <button type='button' class='outcome-drilldown-close-btn' ${closeAttr}>Fechar</button>
      </div>
      <div class='outcome-evolution-top-series'>${legend}</div>
      <p class='outcome-evolution-empty'>Nenhuma despesa selecionada. Clica na legenda de despesas para voltar a mostrar.</p>
      <div class='outcome-evolution-top-series'>${expenseLegend}</div>
    `;
    return;
  }

  const chartWidth = 980;
  const chartHeight = 320;
  const padding = { top: 20, right: 18, bottom: 38, left: 54 };
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;
  const monthBand = plotWidth / months.length;

  const allValues = plottedSeries.flatMap((entry) => [...entry.values, ...entry.estimatedValues]);
  const verticalScale = computeChartVerticalScale(allValues, { top: padding.top, height: plotHeight });
  const xFor = (monthIndex) => padding.left + monthIndex * monthBand;
  const yFor = verticalScale.yFor;
  const zeroY = verticalScale.zeroY;

  const horizontalGridCount = 12;
  const gridLines = Array.from({ length: horizontalGridCount + 1 }, (_, index) => {
    const ratio = index / horizontalGridCount;
    const y = padding.top + ratio * plotHeight;
    const labelValue = verticalScale.maxValue - ratio * (verticalScale.maxValue - verticalScale.minValue);
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

  const monthInnerPadding = 6;
  const barPairsPerMonth = Math.max(plottedSeries.length, 1);
  const barSlotWidth = Math.max((monthBand - monthInnerPadding * 2) / (barPairsPerMonth * 2), 2);
  const barWidth = Math.min(barSlotWidth, 11);
  const clusterWidth = barPairsPerMonth * 2 * barWidth;

  const bars = months
    .map((monthName, monthIndex) => {
      const monthCenter = xFor(monthIndex) + monthBand / 2;
      const monthStart = monthCenter - clusterWidth / 2;
      return plottedSeries
        .map((entry, entryIndex) => {
          const baseX = monthStart + entryIndex * 2 * barWidth;
          const value = Number(entry.values?.[monthIndex]) || 0;
          const estimated = Number(entry.estimatedValues?.[monthIndex]) || 0;
          const valueY = yFor(value);
          const estimatedY = yFor(estimated);
          const valueTop = Math.min(valueY, zeroY);
          const estimatedTop = Math.min(estimatedY, zeroY);
          const valueHeight = Math.max(Math.abs(valueY - zeroY), 1);
          const estimatedHeight = Math.max(Math.abs(estimatedY - zeroY), 1);
          return `
            <rect class='outcome-comparison-bar' x='${baseX.toFixed(2)}' y='${valueTop.toFixed(2)}' width='${barWidth.toFixed(2)}' height='${valueHeight.toFixed(2)}' fill='${entry.barColors.realFill}' data-series-kind='${entry.seriesKind}' data-series-key='${escapeHtml(entry.key)}' data-bar-value-kind='value' data-comparison-point tabindex='0' data-series-name='${escapeHtml(`${entry.name} ┬À Valor`)}' data-month-name='${escapeHtml(monthName)}' data-value='${value.toFixed(2)}' data-series-color='${entry.color}'></rect>
            <rect class='outcome-comparison-bar outcome-comparison-bar-estimated' x='${(baseX + barWidth).toFixed(2)}' y='${estimatedTop.toFixed(2)}' width='${barWidth.toFixed(2)}' height='${estimatedHeight.toFixed(2)}' fill='${entry.barColors.estimatedFill}' fill-opacity='${entry.barColors.estimatedFillOpacity}' stroke='${entry.barColors.estimatedStroke}' stroke-width='0.8' data-series-kind='${entry.seriesKind}' data-series-key='${escapeHtml(entry.key)}' data-bar-value-kind='estimated' data-comparison-point tabindex='0' data-series-name='${escapeHtml(`${entry.name} ┬À Estimado`)}' data-month-name='${escapeHtml(monthName)}' data-value='${estimated.toFixed(2)}' data-series-color='${entry.color}'></rect>
          `;
        })
        .join("");
    })
    .join("");
  const comparisonAverageLines = comparisonAverages
    .map((average) => {
      const averageY = yFor(average.value);
      const formattedAverage = formatOutcomeAverageValue(average.value);
      const accessibleLabel = `${average.label} - ${comparisonAverageSource.name}: ${formattedAverage}.`;
      return `
        <g
          class='outcome-comparison-average'
          data-outcome-comparison-average='${average.kind}'
          data-average-source-kind='${comparisonAverageSource.seriesKind}'
          data-average-source-key='${escapeHtml(comparisonAverageSource.key)}'
          data-average-value='${average.value}'
          role='img'
          aria-label='${escapeHtml(accessibleLabel)}'
          pointer-events='none'
        >
          <title>${escapeHtml(accessibleLabel)}</title>
          <line
            data-outcome-comparison-average-line='${average.kind}'
            x1='${padding.left}'
            y1='${averageY.toFixed(2)}'
            x2='${chartWidth - padding.right}'
            y2='${averageY.toFixed(2)}'
            fill='none'
            stroke='${average.color}'
            stroke-width='1.8'
            stroke-dasharray='${average.dashArray}'
            stroke-linecap='butt'
            vector-effect='non-scaling-stroke'
          />
        </g>
      `;
    })
    .join("");
  const comparisonAverageLabelMarkup = comparisonAverages.length
    ? `
      <div
        class='outcome-evolution-top-series'
        data-outcome-comparison-average-label-row
        aria-hidden='true'
      >
        ${comparisonAverages
          .map((average) => `
            <span
              class='outcome-evolution-tooltip-series'
              data-outcome-comparison-average-label='${average.kind}'
              style='color:${average.color};'
            >${escapeHtml(`${average.label}: ${formatOutcomeAverageValue(average.value)}`)}</span>
          `)
          .join("")}
      </div>
    `
    : "";

  const chartLabelBase = kind === "income"
    ? (showsExpenseSeries
      ? "Grafico comparativo mensal de valor e valor estimado das receitas da rubrica selecionada"
      : "Grafico comparativo mensal de valor e valor estimado das receitas")
    : kind === "savings"
      ? (showsExpenseSeries
        ? "Grafico comparativo mensal de valor e valor estimado das despesas da rubrica de poupancas selecionada"
        : "Grafico comparativo mensal de valor e valor estimado das poupancas")
      : (showsExpenseSeries
        ? "Grafico comparativo mensal de valor e valor estimado das despesas da rubrica de despesas selecionada"
        : "Grafico comparativo mensal de valor e valor estimado das despesas");
  const chartLabel = comparisonAverages.length
    ? `${chartLabelBase}. ${comparisonAverages
        .map((average) => `${average.label} de ${comparisonAverageSource.name}: ${formatOutcomeAverageValue(average.value)}`)
        .join(". ")}`
    : chartLabelBase;

  const singleRubricLegendMarkup = isLegacySingleRubricMode && expenseSeries.length
    ? `<div class='outcome-evolution-top-series'>${expenseLegend}</div>`
    : "";
  const expenseDetailToggleMarkup = isExplicitDetailAvailable
    ? `
      <button
        type='button'
        class='outcome-evolution-control-btn outcome-expense-detail-toggle'
        ${detailConfig.toggleAttribute}
        aria-expanded='${isExplicitDetailExpandedState ? "true" : "false"}'
        aria-controls='${detailConfig.detailSeriesId}'
      >${isExplicitDetailExpandedState ? `Ocultar ${detailConfig.itemPlural}` : `Mostrar ${detailConfig.itemPlural}`}</button>
    `
    : "";
  const expenseDetailMarkup = isExplicitDetailAvailable
    ? `
      <div
        id='${detailConfig.detailSeriesId}'
        class='outcome-expense-detail'
        role='group'
        aria-label='${detailConfig.detailGroupLabel}'
        ${isExplicitDetailExpandedState ? "" : "hidden"}
      >
        ${isExplicitDetailExpandedState ? `<div class='outcome-evolution-top-series'>${expenseLegend}</div>` : ""}
      </div>
    `
    : "";

  host.innerHTML = `
    <div class='${comparisonToolbarClass}${isExplicitDetailAvailable ? " has-expense-detail" : ""}'>
      ${expenseDetailToggleMarkup}
      <button type='button' class='outcome-drilldown-close-btn' ${closeAttr}>Fechar</button>
    </div>
    <div class='outcome-evolution-top-series'>${legend}</div>
    ${singleRubricLegendMarkup}
    ${expenseDetailMarkup}
    ${comparisonAverageLabelMarkup}
    <div class='outcome-evolution-svg-wrap'>
      <svg class='outcome-evolution-svg' viewBox='0 0 ${chartWidth} ${chartHeight}' role='img' aria-label='${escapeHtml(chartLabel)}'>
        ${gridLines}
        ${monthGridLines}
        ${bars}
        ${comparisonAverageLines}
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

function renderSavingsComparisonChart() {
  renderComparisonChart({
    hostId: "savings-comparison-chart",
    kind: "savings",
    isVisible: cgdState.savingsComparisonChartVisible,
    closeAttr: "data-savings-comparison-chart-close-main"
  });
}

window.cgdToggleIncomeChart = () => {
  cgdState.incomeChartVisible = !cgdState.incomeChartVisible;
  if (cgdState.incomeChartVisible) {
    resetIncomeRubricSelectionToFirst();
  } else {
    cgdState.incomeChartSelectedRubricKey = null;
    cgdState.incomeChartHiddenRubrics.clear();
    resetIncomeRevenueDetail();
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
  if (cgdState.incomeComparisonChartVisible) {
    resetIncomeComparisonRubricSelectionToFirst();
  } else {
    cgdState.incomeComparisonHiddenRubrics.clear();
    cgdState.incomeComparisonHiddenExpenses.clear();
    resetIncomeComparisonRevenueDetail();
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

window.cgdToggleSavingsChart = () => {
  cgdState.savingsChartVisible = !cgdState.savingsChartVisible;
  if (!cgdState.savingsChartVisible) {
    cgdState.savingsChartSelectedRubricKey = null;
    cgdState.savingsChartHiddenRubrics.clear();
  }
  renderPanels();
  document.dispatchEvent(new Event("cgd:rendered"));

  if (cgdState.savingsChartVisible) {
    scheduleChartOpenScroll(".savings-evolution-card");
  } else {
    requestAnimationFrame(() => {
      ensurePanelHeadVisible("savings");
    });
  }

  return cgdState.savingsChartVisible;
};

window.cgdToggleSavingsComparisonChart = () => {
  cgdState.savingsComparisonChartVisible = !cgdState.savingsComparisonChartVisible;
  if (!cgdState.savingsComparisonChartVisible) {
    cgdState.savingsComparisonHiddenRubrics.clear();
    cgdState.savingsComparisonHiddenExpenses.clear();
  }
  renderPanels();
  document.dispatchEvent(new Event("cgd:rendered"));

  if (cgdState.savingsComparisonChartVisible) {
    scheduleChartOpenScroll(".savings-comparison-card");
  } else {
    requestAnimationFrame(() => {
      ensurePanelHeadVisible("savings");
    });
  }

  return cgdState.savingsComparisonChartVisible;
};

window.cgdToggleOutcomeChart = () => {
  cgdState.outcomeChartVisible = !cgdState.outcomeChartVisible;
  if (cgdState.outcomeChartVisible) {
    resetOutcomeRubricSelectionToFirst();
  } else {
    cgdState.outcomeChartSelectedRubricKey = null;
    cgdState.outcomeChartHiddenRubrics.clear();
    resetOutcomeExpenseDetail();
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
  if (cgdState.outcomeComparisonChartVisible) {
    resetOutcomeComparisonRubricSelectionToFirst();
  } else {
    cgdState.outcomeComparisonHiddenRubrics.clear();
    cgdState.outcomeComparisonHiddenExpenses.clear();
    resetOutcomeComparisonExpenseDetail();
  }
  renderPanels();
  document.dispatchEvent(new Event("cgd:rendered"));

  if (cgdState.outcomeComparisonChartVisible) {
    scheduleChartOpenScroll(".outcome-comparison-card-main");
  } else {
    requestAnimationFrame(() => {
      ensurePanelHeadVisible("outcome");
    });
  }

  return cgdState.outcomeComparisonChartVisible;
};

async function loadYearData(year, options = {}) {
  const normalizedYear = Number(year);
  const loadGeneration = ++yearLoadGeneration;
  if (activeYearBootstrapPromptCancel) {
    activeYearBootstrapPromptCancel();
    activeYearBootstrapPromptCancel = null;
  }
  cgdState.selectedYear = normalizedYear;
  resetIncomeRevenueDetail();
  resetIncomeComparisonRevenueDetail();
  resetOutcomeExpenseDetail();
  resetOutcomeComparisonExpenseDetail();
  delete cgdState.personTotalizerSeriesCache[normalizedYear];
  const yearLabel = document.querySelector("[data-year-label]");
  if (yearLabel) {
    yearLabel.textContent = String(normalizedYear);
  }

  if (!supabaseClient) {
    cgdState.data = fallbackMock;
    cgdState.yearModels = {
      [normalizedYear]: fallbackMock,
      [normalizedYear - 1]: fallbackMock,
      [normalizedYear - 2]: fallbackMock
    };
    cgdState.realComputationContexts = {
      [normalizedYear]: defaultRealComputationContext(),
      [normalizedYear - 1]: defaultRealComputationContext(),
      [normalizedYear - 2]: defaultRealComputationContext()
    };
    renderCgdTopTiles();
    renderCgdTemporalSummaryChart();
    renderNbPieCharts();
    renderSoberTotalizer();
    resetIncomeRubricSelectionToFirst();
    resetIncomeComparisonRubricSelectionToFirst();
    resetOutcomeRubricSelectionToFirst();
    resetOutcomeComparisonRubricSelectionToFirst();
    renderPanels();
    document.dispatchEvent(new Event("cgd:rendered"));
    return;
  }

  try {
    await ensureResolvedTableNames();
  } catch (tableResolutionError) {
    console.error("Erro ao resolver nomes de tabelas no Supabase:", tableResolutionError);
  }
  if (!isCurrentYearLoad(loadGeneration, normalizedYear)) {
    return;
  }

  try {
    const [rubricsResult, expensesResult, expenseHistoryResult, realValuesResult] = await Promise.allSettled([
      fetchRubricsForYear(normalizedYear),
      fetchExpensesForYear(normalizedYear),
      fetchExpenseHistoryMonthKeysForYear(normalizedYear),
      fetchRealValuesForYear(normalizedYear)
    ]);
    if (!isCurrentYearLoad(loadGeneration, normalizedYear)) {
      return;
    }

    const rubricRows = rubricsResult.status === "fulfilled" ? rubricsResult.value : [];
    const expenseRows = expensesResult.status === "fulfilled" ? expensesResult.value : [];
    if (!options.suppressYearBootstrap) {
      await maybeBootstrapEmptyYear({
        year: normalizedYear,
        loadGeneration,
        rubricsResult,
        expensesResult
      });
      if (!isCurrentYearLoad(loadGeneration, normalizedYear)) {
        return;
      }
    }
    cgdState.expenseColumns = new Set(expenseRows.flatMap((row) => Object.keys(row || {})));

    if (rubricsResult.status === "rejected") {
      console.error("Erro a carregar rubricas CGD:", rubricsResult.reason);
    }

    if (expensesResult.status === "rejected") {
      console.error("Erro a carregar despesas CGD:", expensesResult.reason);
    }

    // Notes/history and real values are optional for initial render.
    // Keep page load silent when these calls fail; panels continue to render.

    const expenseHistoryMonthKeys = expenseHistoryResult.status === "fulfilled" ? expenseHistoryResult.value : new Set();
    const realRows = realValuesResult.status === "fulfilled" ? realValuesResult.value : [];
    const model = buildDataModel(rubricRows, expenseRows, expenseHistoryMonthKeys);
    cgdState.data = model;
    cgdState.yearModels = {
      ...cgdState.yearModels,
      [normalizedYear]: model
    };

    // Never let totalizer context errors hide main rubric/expense panels.
    try {
      const previousYear = normalizedYear - 1;
      const twoYearsBack = normalizedYear - 2;
      const previousYearCached = cgdState.realComputationContexts?.[previousYear];
      const twoYearsBackCached = cgdState.realComputationContexts?.[twoYearsBack];
      const [previousYearContext, twoYearsBackContext] = await Promise.all([
        previousYearCached ? Promise.resolve(previousYearCached) : fetchYearContextForRealComputation(previousYear),
        twoYearsBackCached ? Promise.resolve(twoYearsBackCached) : fetchYearContextForRealComputation(twoYearsBack)
      ]);
      if (!isCurrentYearLoad(loadGeneration, normalizedYear)) {
        return;
      }

      cgdState.realComputationContexts = {
        [normalizedYear]: {
          model,
          dbRealValues: buildRealValuesFromRows(realRows),
          savingsRubricsById: buildSavingsRubricsById(model),
          totals: buildTotalsForModel(model)
        },
        [previousYear]: previousYearContext,
        [twoYearsBack]: twoYearsBackContext
      };
      cgdState.yearModels = {
        ...cgdState.yearModels,
        [previousYear]: previousYearContext?.model || cgdState.yearModels?.[previousYear] || fallbackMock,
        [twoYearsBack]: twoYearsBackContext?.model || cgdState.yearModels?.[twoYearsBack] || fallbackMock
      };
    } catch (realContextError) {
      if (!isCurrentYearLoad(loadGeneration, normalizedYear)) {
        return;
      }
      console.error("Erro a preparar contexto real do totalizador:", realContextError);
      cgdState.realComputationContexts = {
        [normalizedYear]: {
          model,
          dbRealValues: buildRealValuesFromRows(realRows),
          savingsRubricsById: buildSavingsRubricsById(model),
          totals: buildTotalsForModel(model)
        },
        [normalizedYear - 1]: defaultRealComputationContext(),
        [normalizedYear - 2]: defaultRealComputationContext()
      };
    }

    if (!isCurrentYearLoad(loadGeneration, normalizedYear)) {
      return;
    }
    try {
      renderCgdTopTiles();
    } catch (topTilesError) {
      console.error("Erro a renderizar tiles de topo CGD:", topTilesError);
      ["cgd-top-tiles-averages", "cgd-top-tiles-projection"].forEach((hostId) => {
        const host = document.getElementById(hostId);
        if (host) {
          host.innerHTML = "";
        }
      });
    }

    try {
      renderCgdTemporalSummaryChart();
    } catch (summaryChartError) {
      console.error("Erro a renderizar grafico temporal CGD:", summaryChartError);
      const summaryChartHost = document.getElementById("cgd-temporal-summary-chart");
      if (summaryChartHost) {
        summaryChartHost.innerHTML = "";
      }
    }

    renderNbPieCharts();

    try {
      renderSoberTotalizer();
    } catch (totalizerError) {
      console.error("Erro a renderizar totalizador CGD:", totalizerError);
      const totalizerHost = document.getElementById("cgd-totalizer");
      if (totalizerHost) {
        totalizerHost.innerHTML = "";
      }
    }
    resetIncomeRubricSelectionToFirst();
    resetIncomeComparisonRubricSelectionToFirst();
    resetOutcomeRubricSelectionToFirst();
    resetOutcomeComparisonRubricSelectionToFirst();
    renderPanels();
    document.dispatchEvent(new Event("cgd:rendered"));
  } catch (error) {
    if (!isCurrentYearLoad(loadGeneration, normalizedYear)) {
      return;
    }
    console.error("Erro a carregar dados CGD:", error);
    cgdState.data = fallbackMock;
    cgdState.yearModels = {
      [normalizedYear]: fallbackMock,
      [normalizedYear - 1]: fallbackMock,
      [normalizedYear - 2]: fallbackMock
    };
    cgdState.realComputationContexts = {
      [normalizedYear]: defaultRealComputationContext(),
      [normalizedYear - 1]: defaultRealComputationContext(),
      [normalizedYear - 2]: defaultRealComputationContext()
    };
    try {
      renderCgdTopTiles();
    } catch (topTilesError) {
      console.error("Erro a renderizar tiles de topo CGD em fallback:", topTilesError);
      ["cgd-top-tiles-averages", "cgd-top-tiles-projection"].forEach((hostId) => {
        const host = document.getElementById(hostId);
        if (host) {
          host.innerHTML = "";
        }
      });
    }
    try {
      renderCgdTemporalSummaryChart();
    } catch (summaryChartError) {
      console.error("Erro a renderizar grafico temporal CGD em fallback:", summaryChartError);
      const summaryChartHost = document.getElementById("cgd-temporal-summary-chart");
      if (summaryChartHost) {
        summaryChartHost.innerHTML = "";
      }
    }
    renderNbPieCharts();
    try {
      renderSoberTotalizer();
    } catch (totalizerError) {
      console.error("Erro a renderizar totalizador CGD em fallback:", totalizerError);
      const totalizerHost = document.getElementById("cgd-totalizer");
      if (totalizerHost) {
        totalizerHost.innerHTML = "";
      }
    }
    resetIncomeRubricSelectionToFirst();
    resetIncomeComparisonRubricSelectionToFirst();
    resetOutcomeRubricSelectionToFirst();
    resetOutcomeComparisonRubricSelectionToFirst();
    renderPanels();
    document.dispatchEvent(new Event("cgd:rendered"));
  }
}

async function persistRubricOrder(rubricRows) {
  if (!supabaseClient) {
    return false;
  }

  await ensureResolvedTableNames();

  const updates = rubricRows
    .map((row, index) => ({
      id: Number(row.getAttribute("data-rubrica-id")),
      seq: index + 1,
      tipo: (() => {
        const rubricType = row.getAttribute("data-rubrica-tipo");
        if (rubricType === "income") {
          return "Receita";
        }
        if (rubricType === "savings") {
          return "Aprovisionamento";
        }
        return "Despesa";
      })()
    }))
    .filter((item) => Number.isFinite(item.id));

  if (!updates.length) {
    return false;
  }

  await Promise.all(
    updates.map((item) =>
      supabaseClient
        .from(RUBRIC_TABLE)
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

  await ensureResolvedTableNames();

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
        .from(EXPENSE_TABLE)
        .update({ [EXPENSE_SEQ_COLUMN]: item.seq })
        .eq("despesa_id", item.id)
        .eq("rubrica_id", rubricId)
        .eq("ano", cgdState.selectedYear)
    )
  );

  return true;
}

async function getNextRubricaId() {
  await ensureResolvedTableNames();

  const { data, error } = await supabaseClient
    .from(RUBRIC_TABLE)
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

  await ensureResolvedTableNames();

  const normalizedKind = kind === "income" || kind === "savings" ? kind : "outcome";
  const rubricaTipo = normalizedKind === "income" ? "Receita" : normalizedKind === "savings" ? "Aprovisionamento" : "Despesa";
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

  const { error } = await supabaseClient.from(RUBRIC_TABLE).insert(rows);
  if (error) {
    throw error;
  }
  return nextRubricaId;
}

async function getNextDespesaId() {
  await ensureResolvedTableNames();

  const { data, error } = await supabaseClient
    .from(EXPENSE_TABLE)
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

  await ensureResolvedTableNames();

  const rubricType = cgdState.data.income.some((rubric) => Number(rubric.id) === rubricaId)
    ? "income"
    : cgdState.data.savings.some((rubric) => Number(rubric.id) === rubricaId)
      ? "savings"
      : "outcome";
  const sourceRubrics = rubricType === "income"
    ? cgdState.data.income
    : rubricType === "savings"
      ? cgdState.data.savings
      : cgdState.data.outcome;
  const rubric = sourceRubrics.find((item) => Number(item.id) === rubricaId);
  const existingExpenses = rubric?.expenses || [];
  const nextSeq = existingExpenses.length ? Math.max(...existingExpenses.map((item) => parseSeq(item.seq, 0))) + 1 : 1;
  const nextDespesaId = await getNextDespesaId();
  const estimatedColumnName = cgdState.expenseColumns.has("valor_estimado")
    ? "valor_estimado"
    : cgdState.expenseColumns.has("valor_Estimado")
      ? "valor_Estimado"
      : "valor_estimado";

  const rows = Array.from({ length: 12 }, (_, index) => ({
    ano: cgdState.selectedYear,
    mes: index + 1,
    rubrica_id: rubricaId,
    despesa_id: nextDespesaId,
    despesa_desc: description,
    [EXPENSE_SEQ_COLUMN]: nextSeq,
    valor: 0,
    [estimatedColumnName]: 0,
    zerado: false,
    totalizador: true
  }));

  const { error } = await supabaseClient.from(EXPENSE_TABLE).insert(rows);
  if (error) {
    throw error;
  }
  return nextDespesaId;
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
    input.value = options?.defaultValue || "";
    if (title) {
      title.textContent = options?.title || "Adicionar";
    }
    if (subtitle) {
      subtitle.textContent = options?.subtitle || "Indica o descritivo.";
    }
    if (label) {
      label.textContent = options?.label || "Descricao";
    }
    confirmBtn.textContent = options?.confirmText || "Adicionar";
    const actionsContainer = confirmBtn.parentElement;
    if (options?.confirmFirst && actionsContainer) {
      actionsContainer.insertBefore(confirmBtn, cancelBtn);
    } else if (actionsContainer) {
      actionsContainer.insertBefore(cancelBtn, confirmBtn);
    }

    const close = (result) => {
      modal.classList.remove("show");
      modal.setAttribute("aria-hidden", "true");
      window.DashboardModalLifecycle?.unlock(modal, options?.returnFocusFallback);
      confirmBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);
      modal.removeEventListener("click", onBackdrop);
      input.removeEventListener("keydown", onKeydown);
      document.removeEventListener("keydown", onDocumentKeydown);
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
    };

    const onDocumentKeydown = (event) => {
      if (
        event.key === "Escape"
        && window.DashboardModalLifecycle?.isTopmost(modal)
      ) {
        event.preventDefault();
        onCancel();
      }
    };

    confirmBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onCancel);
    modal.addEventListener("click", onBackdrop);
    input.addEventListener("keydown", onKeydown);
    document.addEventListener("keydown", onDocumentKeydown);

    window.DashboardModalLifecycle?.lock(modal, document.activeElement);
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
    const confirmed = window.confirm(options?.subtitle || options?.title || "Confirmar");
    if (!confirmed || typeof options?.onConfirm !== "function") {
      return Promise.resolve(confirmed);
    }
    return Promise.resolve(options.onConfirm()).then((value) => ({ confirmed: true, value }));
  }

  return new Promise((resolve, reject) => {
    const modalCard = confirmBtn.closest(".modal-card") || modal;
    const originalConfirmText = confirmBtn.textContent;
    const originalCancelText = cancelBtn.textContent;
    const originalConfirmDisabled = confirmBtn.disabled;
    const originalCancelDisabled = cancelBtn.disabled;
    const originalCancelHidden = cancelBtn.hidden;
    const originalAriaBusy = modalCard.getAttribute("aria-busy");
    let settled = false;
    let busy = false;

    if (title) {
      title.textContent = options?.title || "Confirmar";
    }
    if (subtitle) {
      subtitle.textContent = options?.subtitle || "Tem a certeza que pretende continuar?";
    }
    confirmBtn.textContent = options?.confirmText || originalConfirmText;
    cancelBtn.textContent = options?.cancelText || originalCancelText;
    cancelBtn.hidden = Boolean(options?.hideCancel);

    const setBusy = (nextBusy) => {
      busy = nextBusy;
      confirmBtn.disabled = nextBusy;
      cancelBtn.disabled = nextBusy;
      if (nextBusy) {
        confirmBtn.textContent = options?.busyText || "A processar...";
        modalCard.setAttribute("aria-busy", "true");
      }
    };

    const close = (result, error) => {
      if (settled) {
        return;
      }
      settled = true;
      modal.classList.remove("show");
      modal.setAttribute("aria-hidden", "true");
      window.DashboardModalLifecycle?.unlock(modal, options?.returnFocusFallback);
      confirmBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);
      modal.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onKeydown);
      confirmBtn.textContent = originalConfirmText;
      cancelBtn.textContent = originalCancelText;
      confirmBtn.disabled = originalConfirmDisabled;
      cancelBtn.disabled = originalCancelDisabled;
      cancelBtn.hidden = originalCancelHidden;
      if (originalAriaBusy === null) {
        modalCard.removeAttribute("aria-busy");
      } else {
        modalCard.setAttribute("aria-busy", originalAriaBusy);
      }
      options?.registerCancel?.(null);
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    };

    const onConfirm = async () => {
      if (busy) {
        return;
      }
      if (typeof options?.onConfirm !== "function") {
        close(true);
        return;
      }

      setBusy(true);
      try {
        const value = await options.onConfirm();
        close({ confirmed: true, value });
      } catch (error) {
        close(null, error);
      }
    };
    const onCancel = () => {
      if (!busy) {
        close(false);
      }
    };
    const onBackdrop = (event) => {
      if (!busy && event.target === modal) {
        close(false);
      }
    };
    const onKeydown = (event) => {
      if (
        !busy
        && event.key === "Escape"
        && window.DashboardModalLifecycle?.isTopmost(modal)
      ) {
        event.preventDefault();
        onCancel();
      }
    };

    confirmBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onCancel);
    modal.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKeydown);
    options?.registerCancel?.(() => close(false));

    window.DashboardModalLifecycle?.lock(modal, document.activeElement);
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => {
      if (!settled) {
        (options?.hideCancel ? confirmBtn : cancelBtn).focus();
      }
    });
  });
}

function isCurrentYearLoad(loadGeneration, year) {
  return (
    loadGeneration === yearLoadGeneration
    && Number(cgdState.selectedYear) === Number(year)
  );
}

function hasYearBootstrapEditPermission() {
  try {
    const session = JSON.parse(window.localStorage?.getItem("dashboard_session") || "null");
    return session?.permissions?.editar === true;
  } catch {
    return false;
  }
}

function invalidateYearContextCaches(year) {
  const normalizedYear = Number(year);
  delete cgdState.yearModels[normalizedYear];
  delete cgdState.realComputationContexts[normalizedYear];
  delete cgdState.personTotalizerSeriesCache[normalizedYear];
}

async function requestYearBootstrapModal(options) {
  let registeredCancel = null;
  const registerCancel = (cancel) => {
    if (typeof cancel === "function") {
      registeredCancel = cancel;
      activeYearBootstrapPromptCancel = cancel;
    } else if (activeYearBootstrapPromptCancel === registeredCancel) {
      activeYearBootstrapPromptCancel = null;
    }
  };

  try {
    return await requestConfirmation({ ...options, registerCancel });
  } finally {
    if (activeYearBootstrapPromptCancel === registeredCancel) {
      activeYearBootstrapPromptCancel = null;
    }
  }
}

async function showYearBootstrapNotice(title, subtitle) {
  await requestYearBootstrapModal({
    title,
    subtitle,
    confirmText: "Fechar",
    hideCancel: true
  });
}

async function reloadBootstrappedYear(year, announceCreated) {
  if (Number(cgdState.selectedYear) !== Number(year)) {
    return;
  }

  invalidateYearContextCaches(year);
  const expectedReloadGeneration = yearLoadGeneration + 1;
  await loadYearData(year, { suppressYearBootstrap: true });
  if (
    announceCreated
    && yearLoadGeneration === expectedReloadGeneration
    && Number(cgdState.selectedYear) === Number(year)
  ) {
    await showYearBootstrapNotice(
      "Ano criado",
      `A estrutura de ${year} foi criada com todos os valores a zero.`
    );
  }
}

async function maybeBootstrapEmptyYear({ year, loadGeneration, rubricsResult, expensesResult }) {
  const normalizedYear = Number(year);
  const prefix = YEAR_BOOTSTRAP_PREFIXES.has(TABLE_PREFIX) ? TABLE_PREFIX : null;
  const hasSuccessfulEmptyQueries = (
    rubricsResult?.status === "fulfilled"
    && expensesResult?.status === "fulfilled"
    && Array.isArray(rubricsResult.value)
    && Array.isArray(expensesResult.value)
    && rubricsResult.value.length === 0
    && expensesResult.value.length === 0
  );

  if (
    window.DASHBOARD_ENABLE_YEAR_BOOTSTRAP !== true
    || !hasYearBootstrapEditPermission()
    || !prefix
    || !hasSuccessfulEmptyQueries
    || !isCurrentYearLoad(loadGeneration, normalizedYear)
  ) {
    return;
  }

  const sourceYear = normalizedYear - 1;
  let confirmation;
  try {
    confirmation = await requestYearBootstrapModal({
      title: `Criar o ano ${normalizedYear}?`,
      subtitle: `Pretende copiar a estrutura de receitas, despesas e poupancas de dezembro de ${sourceYear} para todos os meses de ${normalizedYear}? Todos os valores e estimativas comecam a zero.`,
      confirmText: "Criar ano",
      cancelText: "Cancelar",
      busyText: "A criar...",
      onConfirm: async () => {
        const { data, error } = await supabaseClient.rpc(YEAR_BOOTSTRAP_RPC, {
          p_prefix: prefix,
          p_source_year: sourceYear,
          p_target_year: normalizedYear
        });
        if (error) {
          throw error;
        }
        return data;
      }
    });
  } catch (error) {
    console.error("Erro ao criar o novo ano:", error);
    if (isCurrentYearLoad(loadGeneration, normalizedYear)) {
      await showYearBootstrapNotice(
        "Nao foi possivel criar o ano",
        "Os dados existentes nao foram alterados. Pode voltar a este ano mais tarde para tentar novamente."
      );
    }
    return;
  }

  if (!confirmation?.confirmed || !isCurrentYearLoad(loadGeneration, normalizedYear)) {
    return;
  }

  const resultCode = String(confirmation.value?.code || "").trim().toUpperCase();
  if (resultCode === "CREATED") {
    await reloadBootstrappedYear(normalizedYear, true);
    return;
  }
  if (resultCode === "TARGET_NOT_EMPTY") {
    await reloadBootstrappedYear(normalizedYear, false);
    return;
  }
  if (resultCode === "SOURCE_EMPTY") {
    await showYearBootstrapNotice(
      "Ano anterior sem estrutura",
      `Dezembro de ${sourceYear} nao tem rubricas para copiar. ${normalizedYear} permaneceu inalterado.`
    );
    return;
  }

  console.error("Resposta inesperada ao criar o novo ano:", confirmation.value);
  await showYearBootstrapNotice(
    "Nao foi possivel criar o ano",
    "A resposta do servidor nao foi reconhecida. Os dados existentes nao foram alterados."
  );
}

async function deleteDespesaForYear(rubricaId, despesaId) {
  if (!supabaseClient) {
    return;
  }

  await ensureResolvedTableNames();

  const { error } = await supabaseClient
    .from(EXPENSE_TABLE)
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

  await ensureResolvedTableNames();

  const { error: expenseError } = await supabaseClient
    .from(EXPENSE_TABLE)
    .delete()
    .eq("ano", cgdState.selectedYear)
    .eq("rubrica_id", rubricaId);

  if (expenseError) {
    throw expenseError;
  }

  const { error: rubricError } = await supabaseClient
    .from(RUBRIC_TABLE)
    .delete()
    .eq("ano", cgdState.selectedYear)
    .eq("rubrica_id", rubricaId);

  if (rubricError) {
    throw rubricError;
  }
}

function findExpenseRecord(rubricaId, despesaId) {
  const allRubrics = [...(cgdState.data.income || []), ...(cgdState.data.savings || []), ...(cgdState.data.outcome || [])];
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

function resolveExpenseUpdatePayload(detail, options = {}) {
  const estimatedMode = Boolean(options?.estimatedMode);
  const payload = {
    totalizador: detail.totalizador
  };

  if (cgdState.expenseColumns.has("zerado")) {
    payload.zerado = false;
  }

  if (estimatedMode) {
    if (cgdState.expenseColumns.has("valor_estimado")) {
      payload.valor_estimado = detail.valorEstimado;
    } else if (cgdState.expenseColumns.has("valor_Estimado")) {
      payload.valor_Estimado = detail.valorEstimado;
    }
  } else {
    payload.valor = detail.valor;
  }

  if (cgdState.expenseColumns.has("nota")) {
    payload.nota = detail.nota;
  } else if (cgdState.expenseColumns.has("notas")) {
    payload.notas = detail.nota;
  }

  return payload;
}

window.cgdLoadYearData = loadYearData;
window.cgdSyncRealTotalizerEditableMonth = syncRealTotalizerEditableMonth;

function captureCrudFocusContext({
  operation,
  entityType,
  kind,
  rubricaId,
  despesaId,
  returnFocusFallback
}) {
  const toFiniteId = (value) => (
    value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value))
      ? Number(value)
      : null
  );
  const entityRow = entityType === "expense"
    ? returnFocusFallback?.closest(".data-row.expense[data-sortable]")
    : returnFocusFallback?.closest("article.rubric[data-sortable]");
  const siblingRows = Array.from(entityRow?.parentElement?.children || [])
    .filter((row) => row.matches?.(entityType === "expense" ? ".data-row.expense[data-sortable]" : "article.rubric[data-sortable]"));
  const entityIndex = siblingRows.indexOf(entityRow);
  const idAttribute = entityType === "expense" ? "data-expense-id" : "data-rubrica-id";
  const readSiblingId = (offset) => toFiniteId(
    siblingRows[entityIndex + offset]?.getAttribute(idAttribute)
  );
  const panel = returnFocusFallback?.closest(".panel[data-panel-kind]");
  const rubric = entityType === "expense"
    ? returnFocusFallback?.closest("article.rubric[data-rubrica-id]")
    : entityRow;

  return {
    operation,
    entityType,
    kind: kind || panel?.getAttribute("data-panel-kind") || rubric?.getAttribute("data-rubrica-tipo") || "outcome",
    rubricaId: toFiniteId(rubricaId) ?? toFiniteId(rubric?.getAttribute("data-rubrica-id")),
    despesaId: toFiniteId(despesaId),
    nextEntityId: entityIndex >= 0 ? readSiblingId(1) : null,
    previousEntityId: entityIndex >= 0 ? readSiblingId(-1) : null,
    returnFocusFallback
  };
}

function resolveCrudFocusTarget(context) {
  const isFocusable = window.DashboardModalLifecycle?.isRestorableFocusTarget;
  const find = (selector) => selector ? document.querySelector(selector) : null;
  const isFiniteId = (value) => (
    value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value))
  );
  const rubricSelector = (rubricaId) => isFiniteId(rubricaId)
    ? `article.rubric[data-rubrica-id='${Number(rubricaId)}'] [data-rubric-menu-toggle]`
    : null;
  const expenseSelector = (despesaId) => (
    isFiniteId(context.rubricaId) && isFiniteId(despesaId)
      ? `.data-row.expense[data-rubrica-id='${Number(context.rubricaId)}'][data-expense-id='${Number(despesaId)}'] [data-expense-menu-toggle]`
      : null
  );
  const entitySelector = context.entityType === "expense" ? expenseSelector : rubricSelector;
  const candidates = [];

  if (context.operation !== "delete") {
    candidates.push(find(entitySelector(context.entityType === "expense" ? context.despesaId : context.rubricaId)));
  } else {
    candidates.push(find(entitySelector(context.nextEntityId)));
    candidates.push(find(entitySelector(context.previousEntityId)));
  }
  if (context.entityType === "expense") {
    candidates.push(find(rubricSelector(context.rubricaId)));
  }
  candidates.push(find(`[data-panel-kind='${context.kind}'] [data-panel-menu-toggle]`));
  candidates.push(find("[data-year-prev]"));
  candidates.push(find(".brand"));

  return candidates.find((candidate) => (
    typeof isFocusable === "function" ? isFocusable(candidate) : Boolean(candidate?.isConnected)
  ));
}

function beginCrudFocusRestore(context) {
  const transientModal = document.activeElement?.closest?.(".modal, .admin-modal") || null;
  let userMovedFocus = false;
  let resolveUserFocusTarget = null;
  let active = true;
  const transientModalIsClosed = () => Boolean(
    transientModal
    && (
      transientModal.getAttribute("aria-hidden") === "true"
      || transientModal.hasAttribute("inert")
      || !transientModal.classList.contains("show")
    )
  );
  const isExpectedTransientTarget = (target) => (
    !target
    || target === document.body
    || target === context.returnFocusFallback
    || !target.isConnected
    || Boolean(transientModal?.contains(target) && transientModalIsClosed())
  );
  const captureUserFocusResolver = (target) => {
    const expenseToggle = target?.closest?.("[data-expense-menu-toggle]");
    if (expenseToggle) {
      const row = expenseToggle.closest(".data-row.expense[data-rubrica-id][data-expense-id]");
      const rubricaId = Number(row?.getAttribute("data-rubrica-id"));
      const despesaId = Number(row?.getAttribute("data-expense-id"));
      return () => resolveCrudFocusTarget({
        operation: "rename",
        entityType: "expense",
        rubricaId,
        despesaId,
        kind: row?.closest(".panel[data-panel-kind]")?.getAttribute("data-panel-kind")
      });
    }
    const rubricToggle = target?.closest?.("[data-rubric-menu-toggle]");
    if (rubricToggle) {
      const row = rubricToggle.closest("article.rubric[data-rubrica-id]");
      const rubricaId = Number(row?.getAttribute("data-rubrica-id"));
      return () => resolveCrudFocusTarget({
        operation: "rename",
        entityType: "rubric",
        rubricaId,
        kind: row?.getAttribute("data-rubrica-tipo")
      });
    }
    const panelToggle = target?.closest?.("[data-panel-menu-toggle]");
    if (panelToggle) {
      const kind = panelToggle.closest(".panel[data-panel-kind]")?.getAttribute("data-panel-kind");
      return () => document.querySelector(`[data-panel-kind='${kind}'] [data-panel-menu-toggle]`);
    }
    if (target?.matches?.("[data-year-prev]")) {
      return () => document.querySelector("[data-year-prev]");
    }
    if (target?.matches?.("[data-year-next]")) {
      return () => document.querySelector("[data-year-next]");
    }
    if (target?.matches?.(".brand")) {
      return () => document.querySelector(".brand");
    }
    return null;
  };
  const onFocusIn = (event) => {
    if (!isExpectedTransientTarget(event.target)) {
      userMovedFocus = true;
      resolveUserFocusTarget = captureUserFocusResolver(event.target);
    }
  };
  const stop = () => {
    if (!active) return;
    active = false;
    document.removeEventListener("focusin", onFocusIn, true);
  };

  document.addEventListener("focusin", onFocusIn, true);
  return {
    cancel: stop,
    restore(overrides = {}) {
      const resolvedContext = { ...context, ...overrides };
      requestAnimationFrame(() => {
        const currentFocus = document.activeElement;
        const isFocusable = window.DashboardModalLifecycle?.isRestorableFocusTarget;
        if (userMovedFocus) {
          const currentFocusIsMeaningful = typeof isFocusable === "function"
            ? isFocusable(currentFocus)
            : Boolean(currentFocus?.isConnected && currentFocus !== document.body);
          const userFocusTarget = currentFocusIsMeaningful ? null : resolveUserFocusTarget?.();
          stop();
          if (!currentFocusIsMeaningful && userFocusTarget) {
            userFocusTarget.focus();
          }
          return;
        }
        const shouldRestore = isExpectedTransientTarget(currentFocus);
        stop();
        if (!shouldRestore) {
          return;
        }
        resolveCrudFocusTarget(resolvedContext)?.focus();
      });
    }
  };
}

async function runCrudMutationWithFocus(context, mutation) {
  const focusRestore = beginCrudFocusRestore(context);
  try {
    const focusOverrides = await mutation();
    await loadYearData(cgdState.selectedYear);
    focusRestore.restore(focusOverrides);
    return true;
  } catch (error) {
    focusRestore.cancel();
    throw error;
  }
}

window.cgdCreateRubric = async (kind, returnFocusFallback) => {
  const focusContext = captureCrudFocusContext({
    operation: "create",
    entityType: "rubric",
    kind,
    returnFocusFallback
  });
  const sectionLabel = kind === "income" ? "Receitas" : kind === "savings" ? "Poupancas" : "Despesas";
  const description = await requestEntityDescription({
    title: `Adicionar rubrica ${sectionLabel}`,
    subtitle: "Indica o descritivo da nova rubrica para o ano selecionado.",
    label: "Descricao da rubrica",
    promptText: "Descricao da nova rubrica",
    returnFocusFallback
  });
  if (!description) {
    return false;
  }

  try {
    return await runCrudMutationWithFocus(focusContext, async () => {
      const rubricaId = await createRubricaForYear(kind, description.trim());
      return { rubricaId };
    });
  } catch (error) {
    console.error("Erro ao criar rubrica:", error);
    const code = String(error?.code || "").trim();
    const message = String(error?.message || "").toLowerCase();
    const isSavingsConstraintError =
      kind === "savings" && code === "23514" && (message.includes("rubrica_tipo") || message.includes("check constraint"));

    if (isSavingsConstraintError) {
      window.alert("Nao foi possivel criar a rubrica em Poupancas porque a base de dados ainda nao permite rubrica_tipo = Aprovisionamento. Aplica a migration que atualiza a check constraint da tabela cgd_rubrica.");
    }
    return false;
  }
};

window.cgdCreateExpense = async (rubricaId, returnFocusFallback) => {
  const rubricIdNumber = Number(rubricaId);
  const focusContext = captureCrudFocusContext({
    operation: "create",
    entityType: "expense",
    rubricaId: rubricIdNumber,
    returnFocusFallback
  });
  const entryLabel = cgdState.data.income.some((rubric) => Number(rubric.id) === rubricIdNumber)
    ? "receita"
    : cgdState.data.savings.some((rubric) => Number(rubric.id) === rubricIdNumber)
      ? "poupanca"
      : "despesa";

  const description = await requestEntityDescription({
    title: `Adicionar ${entryLabel}`,
    subtitle: `Indica o descritivo da nova ${entryLabel} para a rubrica selecionada.`,
    label: `Descricao da ${entryLabel}`,
    promptText: `Descricao da nova ${entryLabel}`,
    returnFocusFallback
  });
  if (!description) {
    return false;
  }

  try {
    return await runCrudMutationWithFocus(focusContext, async () => {
      const despesaId = await createDespesaForRubrica(rubricIdNumber, description.trim());
      return { despesaId };
    });
  } catch (error) {
    console.error("Erro ao criar despesa:", error);
    const code = String(error?.code || "").trim();
    const message = String(error?.message || "Erro desconhecido ao criar despesa.");
    window.alert(`Nao foi possivel criar a despesa (${code || "sem codigo"}). ${message}`);
    return false;
  }
};

window.cgdDeleteExpense = async (rubricaId, despesaId, returnFocusFallback) => {
  const focusContext = captureCrudFocusContext({
    operation: "delete",
    entityType: "expense",
    rubricaId,
    despesaId,
    returnFocusFallback
  });
  const confirmed = await requestConfirmation({
    title: "Eliminar despesa",
    subtitle: "Tem a certeza que pretende eliminar a despesa selecionada para o ano atual?",
    returnFocusFallback
  });

  if (!confirmed) {
    return false;
  }

  try {
    return await runCrudMutationWithFocus(focusContext, () => (
      deleteDespesaForYear(Number(rubricaId), Number(despesaId))
    ));
  } catch (error) {
    console.error("Erro ao eliminar despesa:", error);
    return false;
  }
};

window.cgdDeleteRubric = async (rubricaId, returnFocusFallback) => {
  const focusContext = captureCrudFocusContext({
    operation: "delete",
    entityType: "rubric",
    rubricaId,
    returnFocusFallback
  });
  const confirmed = await requestConfirmation({
    title: "Eliminar rubrica",
    subtitle: "Tem a certeza que pretende eliminar esta rubrica? As despesas contidas na rubrica tambem serao eliminadas.",
    returnFocusFallback
  });

  if (!confirmed) {
    return false;
  }

  try {
    return await runCrudMutationWithFocus(focusContext, () => (
      deleteRubricaForYear(Number(rubricaId))
    ));
  } catch (error) {
    console.error("Erro ao eliminar rubrica:", error);
    return false;
  }
};

window.cgdRenameRubric = async (rubricaId, returnFocusFallback) => {
  const focusContext = captureCrudFocusContext({
    operation: "rename",
    entityType: "rubric",
    rubricaId,
    returnFocusFallback
  });
  const allRubrics = [...(cgdState.data.income || []), ...(cgdState.data.savings || []), ...(cgdState.data.outcome || [])];
  const rubric = allRubrics.find((item) => Number(item.id) === Number(rubricaId));
  if (!rubric) return false;

  const newName = await requestEntityDescription({
    title: "Renomear rubrica",
    subtitle: "Indica o novo nome para a rubrica.",
    label: "Nome da rubrica",
    promptText: "Novo nome da rubrica",
    defaultValue: rubric.name || "",
    confirmText: "Gravar",
    confirmFirst: true,
    returnFocusFallback
  });

  if (!newName || newName === rubric.name) return false;

  try {
    return await runCrudMutationWithFocus(focusContext, async () => {
      const { error } = await supabaseClient
        .from(RUBRIC_TABLE)
        .update({ rubrica_desc: newName.trim() })
        .eq("rubrica_id", Number(rubricaId));
      if (error) throw error;
    });
  } catch (error) {
    console.error("Erro ao renomear rubrica:", error);
    return false;
  }
};

window.cgdRenameExpense = async (rubricaId, despesaId, returnFocusFallback) => {
  const focusContext = captureCrudFocusContext({
    operation: "rename",
    entityType: "expense",
    rubricaId,
    despesaId,
    returnFocusFallback
  });
  const found = findExpenseRecord(rubricaId, despesaId);
  if (!found) return false;

  const entryLabel = cgdState.data.income.some((r) => Number(r.id) === Number(rubricaId))
    ? "receita"
    : cgdState.data.savings.some((r) => Number(r.id) === Number(rubricaId))
      ? "poupanca"
      : "despesa";

  const newName = await requestEntityDescription({
    title: `Renomear ${entryLabel}`,
    subtitle: `Indica o novo nome para a ${entryLabel}.`,
    label: `Nome da ${entryLabel}`,
    promptText: `Novo nome da ${entryLabel}`,
    defaultValue: found.expense.name || "",
    confirmText: "Gravar",
    confirmFirst: true,
    returnFocusFallback
  });

  if (!newName || newName === found.expense.name) return false;

  try {
    return await runCrudMutationWithFocus(focusContext, async () => {
      const { error } = await supabaseClient
        .from(EXPENSE_TABLE)
        .update({ despesa_desc: newName.trim() })
        .eq("despesa_id", Number(despesaId));
      if (error) throw error;
    });
  } catch (error) {
    console.error(`Erro ao renomear ${entryLabel}:`, error);
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
    valor: null,
    valorEstimado: 0,
    totalizador: false,
    zerado: false,
    nota: ""
  };

  const noteText = monthDetail.nota == null ? "" : String(monthDetail.nota);
  const isZerado = Boolean(monthDetail.zerado);
  const rawValor = Number(monthDetail.valor);
  const hasValor = Number.isFinite(rawValor) && rawValor !== 0;
  const normalizedValor = hasValor ? rawValor : null;
  const normalizedValorEstimado = Number(monthDetail.valorEstimado);
  const safeValorEstimado = Number.isFinite(normalizedValorEstimado) ? normalizedValorEstimado : 0;

  const valorInputValue = isZerado
    ? null
    : normalizedValor;

  return {
    valor: normalizedValor,
    valorInputValue,
    valorEstimado: safeValorEstimado,
    totalizador: Boolean(monthDetail.totalizador),
    nota: noteText
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

window.cgdSaveExpenseDetail = async ({
  rubricaId,
  despesaId,
  monthIndex,
  valor,
  valorEstimado,
  estimatedMode,
  totalizador,
  nota,
  applyToEndYear,
  adjustmentValue,
  registerAdjustment,
  registerValueChangeNote,
  noteEntryValue
}) => {
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

  const estimatedToggleOn = Boolean(estimatedMode);
  const payload = resolveExpenseUpdatePayload(detail, { estimatedMode: estimatedToggleOn });
  const targetMonths = applyToEndYear
    ? Array.from({ length: 13 - startMonth }, (_, index) => startMonth + index)
    : [startMonth];

  if (applyToEndYear) {
    await supabaseClient
      .from(EXPENSE_TABLE)
      .update(payload)
      .eq("ano", selectedKey.ano)
      .eq("rubrica_id", selectedKey.rubricaId)
      .eq("despesa_id", selectedKey.despesaId)
      .gte("mes", startMonth);
  } else {
    await supabaseClient
      .from(EXPENSE_TABLE)
      .update(payload)
      .eq("ano", selectedKey.ano)
      .eq("rubrica_id", selectedKey.rubricaId)
      .eq("despesa_id", selectedKey.despesaId)
      .eq("mes", startMonth);
  }

  const numericAdjustment = Number(adjustmentValue);
  const normalizedNoteEntryValue = Number(noteEntryValue);
  const rawAdjustmentNote = String(nota == null ? "" : nota).trim();
  const adjustmentNote = estimatedToggleOn
    ? (rawAdjustmentNote ? `(Est) ${rawAdjustmentNote}` : "(Est)")
    : rawAdjustmentNote;
  const shouldRegisterAdjustment = Boolean(registerAdjustment) && Number.isFinite(numericAdjustment) && numericAdjustment !== 0;
  const shouldRegisterValueChangeNote = Boolean(registerValueChangeNote);
  const skipEstimatedReplicateWithoutNote = estimatedToggleOn && applyToEndYear && !rawAdjustmentNote;
  const shouldCreateNote = (shouldRegisterAdjustment || shouldRegisterValueChangeNote) && !skipEstimatedReplicateWithoutNote;

  if (shouldCreateNote) {
    const valueForNote = shouldRegisterAdjustment
      ? numericAdjustment
      : Number.isFinite(normalizedNoteEntryValue)
        ? normalizedNoteEntryValue
        : detail.valor;

    await Promise.all(
      targetMonths.map((mes) =>
        createExpenseNoteEntry({
          ano: selectedKey.ano,
          rubricaId: selectedKey.rubricaId,
          despesaId: selectedKey.despesaId,
          mes,
          valor: valueForNote,
          nota: adjustmentNote
        })
      )
    );
  }

  await refreshYearDataAndFutureTotalizerFromMonth(startMonth - 1);
  return true;
};

window.cgdZeroExpenseDetail = async ({ rubricaId, despesaId, monthIndex }) => {
  if (!supabaseClient) {
    return false;
  }

  const selectedKey = resolveSelectedExpenseKey({ rubricaId, despesaId, monthIndex });
  if (!selectedKey) {
    return false;
  }

  const payload = { valor: null };
  if (cgdState.expenseColumns.has("zerado")) {
    payload.zerado = true;
  }

  await supabaseClient
    .from(EXPENSE_TABLE)
    .update(payload)
    .eq("ano", selectedKey.ano)
    .eq("rubrica_id", selectedKey.rubricaId)
    .eq("despesa_id", selectedKey.despesaId)
    .eq("mes", selectedKey.mes);

  await refreshYearDataAndFutureTotalizerFromMonth(selectedKey.mes - 1);
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
  renderNbPieCharts();
  bindSoberTotalizerInputs();
  renderTimeline(cgdState.selectedYear);
  await loadYearData(cgdState.selectedYear);

  const currentMonth = new Date().getMonth();
  const activeMonthTile = document.querySelector(`.month-tile[data-month='${currentMonth}']`) || document.querySelector(".month-tile");
  if (activeMonthTile) {
    activeMonthTile.click();
  }
});
