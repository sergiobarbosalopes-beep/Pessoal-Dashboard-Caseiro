const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const cgd = read("assets/js/cgd.js");
const cgdHtml = read("caixa-geral-depositos.html");
const novoBancoHtml = read("novobanco.html");
const coverflexHtml = read("coverflex.html");

const sliceBetween = (source, startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Unable to extract ${startMarker}`);
  return source.slice(start, end);
};

const expenseNormalizationSource = sliceBetween(
  cgd,
  "function normalizeMonth(",
  "\nasync function fetchRubricsForYear"
);
const buildDataModelSource = sliceBetween(cgd, "function buildDataModel(", "\nfunction money(");
const totalsSource = sliceBetween(
  cgd,
  "function sumRubricsValuesByMonth(",
  "\nfunction computeEstimatedIrsMonthlyTotals"
);
const buildTotalsSource = sliceBetween(
  cgd,
  "function buildTotalsForModel(",
  "\nfunction buildSavingsRubricsById"
);
const comparableTextSource = sliceBetween(
  cgd,
  "function normalizeComparableText(",
  "\nfunction getPersonSummaryColor"
);
const rubricMatchSource = sliceBetween(
  cgd,
  "function rubricNameMatchesAny(",
  "\nfunction averageOfSeries"
);
const incomeSummarySource = sliceBetween(
  cgd,
  "function averageOfSeries(",
  "\nfunction formatTileMoney"
);
const pieRendererSource = sliceBetween(
  cgd,
  "function renderNbPieCharts(",
  "\nfunction calculateAccumulatedSavingsToDecember"
);
const topTilesRendererSource = sliceBetween(
  cgd,
  "function renderCgdTopTiles(",
  "\nfunction buildBalancePanel"
);
const escapeHtmlSource = sliceBetween(cgd, "function escapeHtml(", "\nfunction buildSmoothPathData");

const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const emptyValues = () => months.map(() => 0);

class FakeHost {
  constructor() {
    this.html = "";
  }

  set innerHTML(value) {
    this.html = String(value);
  }

  get innerHTML() {
    return this.html;
  }

  querySelector() {
    return null;
  }

  addEventListener() {}
}

const hosts = {
  averages: new FakeHost(),
  projection: null,
  receiptsPie: new FakeHost(),
  expensesPie: null
};
const document = {
  getElementById(id) {
    if (id === "cgd-top-tiles-averages") return hosts.averages;
    if (id === "cgd-top-tiles-projection") return hosts.projection;
    if (id === "nb-pie-receitas") return hosts.receiptsPie;
    if (id === "nb-pie-despesas") return hosts.expensesPie;
    return null;
  },
  querySelector() {
    return null;
  }
};

const state = {
  selectedYear: 2026,
  data: { income: [], savings: [], outcome: [] },
  realComputationContexts: {}
};
const context = vm.createContext({
  Array,
  Boolean,
  Date,
  Map,
  Math,
  Number,
  Object,
  Set,
  String,
  TABLE_PREFIX: "cgd",
  IS_COVERFLEX: false,
  HIDE_SAVINGS: false,
  EXPENSE_SEQ_COLUMN: "despesa_seq",
  TOTALIZER_PEOPLE: ["Sergio", "Carina"],
  buildExpenseHistoryMonthKey: (rubricId, expenseId, month) => `${rubricId}::${expenseId}::${month}`,
  calculateAccumulatedSavingsForMonth: () => 0,
  calculateAccumulatedSavingsToDecember: () => 0,
  cgdState: state,
  computeEstimatedIrsMonthlyTotals: () => emptyValues(),
  computePersonTotalizerSeriesForYear: () => emptyValues(),
  computeRealSeriesForYear: () => ({ values: emptyValues() }),
  computeSavingsSeriesForYear: () => emptyValues(),
  document,
  emptyValues,
  escapeHtml: null,
  formatTileMoney: (value) => `${Number(value).toFixed(2)} EUR`,
  money: (value) => Number(value).toFixed(2),
  months,
  incomeSummaryApi: null
});

vm.runInContext(`
  ${expenseNormalizationSource}
  ${buildDataModelSource}
  ${totalsSource}
  ${buildTotalsSource}
  ${comparableTextSource}
  ${rubricMatchSource}
  ${incomeSummarySource}
  ${escapeHtmlSource}
  ${pieRendererSource}
  ${topTilesRendererSource}
  incomeSummaryApi = {
    buildDataModel,
    buildTotalsForModel,
    buildIncomeSummaryMetrics,
    renderNbPieCharts,
    renderCgdTopTiles
  };
`, context);

const api = context.incomeSummaryApi;
const rubricRows = [
  { rubrica_id: 1, rubrica_desc: "Geral", rubrica_tipo: "Receita", rubrica_seq: 1, mes: 1 },
  {
    rubrica_id: 2,
    rubrica_desc: "MÓVIMENTOS <img src=x onerror=alert(1)>",
    rubrica_tipo: "Receita",
    rubrica_seq: 2,
    mes: 1
  },
  { rubrica_id: 3, rubrica_desc: "Reserva", rubrica_tipo: "Aprovisionamento", rubrica_seq: 3, mes: 1 },
  { rubrica_id: 4, rubrica_desc: "Casa", rubrica_tipo: "Despesa", rubrica_seq: 4, mes: 1 },
  { rubrica_id: 5, rubrica_desc: "Movimentos", rubrica_tipo: "Despesa", rubrica_seq: 5, mes: 1 },
  { rubrica_id: 6, rubrica_desc: "Impostos", rubrica_tipo: "Despesa", rubrica_seq: 6, mes: 1 }
];
const expenseRows = [];
const addExpense = ({
  rubricId,
  expenseId,
  name,
  month,
  value = null,
  estimate,
  legacyEstimate,
  totalizer = true,
  zeroed = false
}) => {
  const row = {
    rubrica_id: rubricId,
    despesa_id: expenseId,
    despesa_desc: name,
    despesa_seq: expenseId,
    mes: month,
    valor: value,
    totalizador: totalizer,
    zerado: zeroed
  };
  if (estimate !== undefined) row.valor_estimado = estimate;
  if (legacyEstimate !== undefined) row.valor_Estimado = legacyEstimate;
  expenseRows.push(row);
};

addExpense({ rubricId: 1, expenseId: 11, name: "Salario", month: 1, value: 1200, estimate: 1500 });
addExpense({ rubricId: 1, expenseId: 11, name: "Salario", month: 2, value: 0, estimate: 1000 });
addExpense({ rubricId: 1, expenseId: 11, name: "Salario", month: 3, value: 0, estimate: 900, zeroed: true });
addExpense({
  rubricId: 1,
  expenseId: 12,
  name: "Fora totalizador",
  month: 4,
  value: 0,
  estimate: 777,
  totalizer: false
});
addExpense({
  rubricId: 2,
  expenseId: 21,
  name: "Transferencia <svg onload=alert(2)>",
  month: 1,
  value: 500
});
addExpense({
  rubricId: 2,
  expenseId: 21,
  name: "Transferencia <svg onload=alert(2)>",
  month: 2,
  value: null,
  legacyEstimate: 500
});
addExpense({
  rubricId: 2,
  expenseId: 21,
  name: "Transferencia <svg onload=alert(2)>",
  month: 3,
  value: 500
});
addExpense({ rubricId: 2, expenseId: 22, name: "Estorno", month: 5, value: -250 });
addExpense({ rubricId: 3, expenseId: 31, name: "Movimentos Receitas", month: 1, value: 1000 });
addExpense({ rubricId: 3, expenseId: 32, name: "Objetivo", month: 1, value: 120 });
addExpense({ rubricId: 4, expenseId: 41, name: "Renda", month: 1, value: 300 });
addExpense({ rubricId: 5, expenseId: 51, name: "Transferencia", month: 1, value: 50 });
addExpense({ rubricId: 6, expenseId: 61, name: "IRS", month: 1, value: 70 });

const model = api.buildDataModel(rubricRows, expenseRows, new Set());
state.data = model;

const expectedMonthlyIncome = [1700, 1500, 500, 0, -250, 0, 0, 0, 0, 0, 0, 0];
const expectedIncomeTotal = 3450;
const expectedIncomeAverage = expectedIncomeTotal / 12;
for (const prefix of ["cgd", "nb"]) {
  const summary = JSON.parse(JSON.stringify(api.buildIncomeSummaryMetrics(model.income, prefix)));
  assert.deepEqual(summary.monthlyTotals, expectedMonthlyIncome);
  assert.equal(summary.totalYear, expectedIncomeTotal);
  assert.equal(summary.average, expectedIncomeAverage);
  assert.equal(summary.includeMovements, true);
}

const graphTotals = JSON.parse(JSON.stringify(api.buildTotalsForModel(model).income));
assert.deepEqual(graphTotals, expectedMonthlyIncome);
assert.equal(
  graphTotals.reduce((total, value) => total + value, 0) / 12,
  expectedIncomeAverage,
  "Income summary and chart/monthly-flow totals must use the same 12 normalized values"
);

const coverflexSummary = JSON.parse(JSON.stringify(
  api.buildIncomeSummaryMetrics(model.income, "coverflex")
));
assert.deepEqual(coverflexSummary.monthlyTotals, [1200, 1000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
assert.equal(coverflexSummary.totalYear, 2200);
assert.equal(coverflexSummary.average, 2200 / 12);
assert.equal(coverflexSummary.includeMovements, false);

const renderBrand = ({ prefix, isCoverflex, hideSavings }) => {
  context.TABLE_PREFIX = prefix;
  context.IS_COVERFLEX = isCoverflex;
  context.HIDE_SAVINGS = hideSavings;
  hosts.averages.innerHTML = "";
  hosts.receiptsPie.innerHTML = "";
  api.renderCgdTopTiles();
  api.renderNbPieCharts();
  return {
    averages: hosts.averages.innerHTML,
    receiptsPie: hosts.receiptsPie.innerHTML
  };
};

const cgdRendered = renderBrand({ prefix: "cgd", isCoverflex: false, hideSavings: false });
assert.match(cgdRendered.averages, /Media de receitas[\s\S]*287\.50 EUR[\s\S]*Inclui movimentos/);
assert.doesNotMatch(
  cgdRendered.averages.match(/<article class='stat-tile stat-tile--green'>[\s\S]*?<\/article>/)?.[0] || "",
  /Exclui movimentos/
);
assert.match(cgdRendered.receiptsPie, /Total receitas 2026/);
assert.match(cgdRendered.receiptsPie, /nb-pie-center-value'>3450\.00/);
assert.match(cgdRendered.receiptsPie, /data-pie-label='Estorno' data-pie-value='-250\.00'/);
assert.match(cgdRendered.receiptsPie, /Transferencia &lt;svg onload=alert\(2\)&gt;/);
assert.doesNotMatch(cgdRendered.receiptsPie, /<svg onload=alert\(2\)>/);
assert.doesNotMatch(cgdRendered.receiptsPie, /Fora totalizador|Movimentos Receitas|Objetivo/);
assert.match(cgdRendered.averages, /Media de poupancas[\s\S]*10\.00 EUR[\s\S]*Exclui movimentos/);
assert.match(cgdRendered.averages, /Media de despesas[\s\S]*30\.83 EUR[\s\S]*Exclui movimentos/);

const nbRendered = renderBrand({ prefix: "nb", isCoverflex: false, hideSavings: true });
assert.match(nbRendered.averages, /Media de receitas[\s\S]*287\.50 EUR[\s\S]*Inclui movimentos/);
assert.match(nbRendered.receiptsPie, /nb-pie-center-value'>3450\.00/);
assert.doesNotMatch(nbRendered.averages, /Media de poupancas/);
assert.match(
  nbRendered.averages,
  /Media de despesas[\s\S]*25\.00 EUR[\s\S]*Exclui movimentos e impostos/
);

const coverflexModel = {
  ...model,
  income: model.income
    .filter((rubric) => Number(rubric.id) === 1)
    .map((rubric) => ({
      ...rubric,
      expenses: rubric.expenses.filter((expense) => Number(expense.id) === 11)
    }))
};
state.data = coverflexModel;
const coverflexRendered = renderBrand({ prefix: "coverflex", isCoverflex: true, hideSavings: true });
assert.match(coverflexRendered.averages, /Media de receitas[\s\S]*183\.33 EUR/);
assert.doesNotMatch(coverflexRendered.averages, /Inclui movimentos|Exclui movimentos/);
assert.match(coverflexRendered.receiptsPie, /nb-pie-center-value'>2200\.00/);

assert.match(cgdHtml, /assets\/js\/cgd\.js\?v=20260813-4/);
assert.match(novoBancoHtml, /assets\/js\/cgd\.js\?v=20260813-4/);
assert.match(coverflexHtml, /assets\/js\/cgd\.js\?v=20260813-4/);
assert.match(cgd, /function buildIncomeSummaryMetrics\(/);
assert.doesNotMatch(cgd, /const incomeFilteredRubrics/);
assert.match(cgd, /Inclui movimentos/);
assert.match(cgd, /const outcomeExcludeTerms = TABLE_PREFIX === "cgd" \? \["movimentos"\] : \["movimentos", "impostos"\]/);
assert.match(cgd, /if \(rubricNameMatchesAny\(expense\?\.name, \["movimentos receitas"\]\)\) continue/);

console.log("CGD and Novo Banco income summary regression checks passed.");
