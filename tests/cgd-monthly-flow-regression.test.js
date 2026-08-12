const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const cgd = read("assets/js/cgd.js");
const styles = read("assets/css/styles.css");
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
const moneySource = sliceBetween(cgd, "function money(", "\nfunction isZeroMoneyDisplayValue");
const escapeHtmlSource = sliceBetween(cgd, "function escapeHtml(", "\nfunction buildSmoothPathData");
const smoothPathSource = sliceBetween(cgd, "function buildSmoothPathData(", "\nfunction computeChartVerticalScale");
const verticalScaleSource = sliceBetween(
  cgd,
  "function computeChartVerticalScale(",
  "\nfunction ensureChartBottomVisible"
);
const monthlyFlowHelpersSource = sliceBetween(
  cgd,
  "const CGD_TEMPORAL_CHART_GEOMETRY",
  "\nfunction renderCgdTemporalSummaryChart"
);
const temporalSummarySource = sliceBetween(
  cgd,
  "function renderCgdTemporalSummaryChart(",
  "\nfunction createCgdMonthlyFlowChartMarkup"
);
const monthlyFlowMarkupSource = sliceBetween(
  cgd,
  "function createCgdMonthlyFlowChartMarkup(",
  "\nfunction bindCgdMonthlyFlowTooltip"
);
const monthlyFlowRendererSource = sliceBetween(
  cgd,
  "function renderCgdMonthlyFlowChart(",
  "\nfunction renderCgdTemporalCharts"
);

const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const emptyValues = () => months.map(() => 0);

class FakeHost {
  constructor() {
    this.dataset = {};
    this.html = "";
    this.listeners = new Map();
    this.tooltipBound = false;
  }

  set innerHTML(value) {
    this.html = String(value);
  }

  get innerHTML() {
    return this.html;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }
}

class FakeScrollWrapper {
  constructor() {
    this.dataset = {};
    this.scrollLeft = 0;
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  dispatchScroll() {
    this.listeners.get("scroll")?.();
  }
}

const summaryHost = new FakeHost();
const flowHost = new FakeHost();
const fakeDocument = {
  selectedMonth: 7,
  scrollWrappers: [],
  listeners: new Map(),
  getElementById(id) {
    if (id === "cgd-temporal-summary-chart") return summaryHost;
    if (id === "cgd-monthly-flow-chart") return flowHost;
    return null;
  },
  querySelector(selector) {
    if (selector === ".month-tile.active") {
      return {
        getAttribute: (name) => (name === "data-month" ? String(this.selectedMonth) : null)
      };
    }
    return null;
  },
  querySelectorAll(selector) {
    if (selector === "[data-cgd-temporal-scroll]") return this.scrollWrappers;
    return [];
  },
  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }
};

const animationFrames = [];
let nextFrameId = 1;
const requestAnimationFrame = (callback) => {
  animationFrames.push(callback);
  nextFrameId += 1;
  return nextFrameId;
};
const flushAnimationFrames = () => {
  while (animationFrames.length) {
    animationFrames.shift()();
  }
};

const state = {
  selectedYear: 2026,
  data: { income: [], savings: [], outcome: [] },
  realComputationContexts: {},
  temporalSummaryHiddenSeries: new Set(),
  temporalChartScrollLeft: 0
};

const context = vm.createContext({
  Array,
  Boolean,
  Map,
  Math,
  Number,
  Object,
  Set,
  String,
  ENABLE_MONTHLY_FLOW_CHART: true,
  EXPENSE_SEQ_COLUMN: "despesa_seq",
  HIDE_AVAILABLE_ROW: false,
  HIDE_SAVINGS: false,
  IS_COVERFLEX: false,
  THEME_COLORS: {
    summary: {
      real: "#ecf6fb",
      available: "#7fd7a8",
      savings: "#8ccbf3"
    },
    monthlyFlow: {
      income: "#55c98a",
      savings: "#4aa8df",
      outcome: "#f08b5f",
      positive: "#6fe29c",
      negative: "#ff8f75",
      neutral: "#b8ced9"
    }
  },
  TOTALIZER_PEOPLE: ["Sergio", "Carina"],
  bindCgdMonthlyFlowTooltip: (host) => {
    host.tooltipBound = true;
  },
  bindOutcomeChartHover: () => {},
  buildExpenseHistoryMonthKey: (rubricId, expenseId, month) => `${rubricId}::${expenseId}::${month}`,
  cgdState: state,
  computePersonTotalizerSeriesForYear: () => emptyValues(),
  computeRealSeriesForYear: () => ({ values: months.map((_, index) => 1000 + index) }),
  computeSavingsSeriesForYear: () => months.map((_, index) => 200 + index),
  document: fakeDocument,
  emptyValues,
  fallbackMock: { income: [], savings: [], outcome: [] },
  getPersonSummaryColor: () => "#fff",
  months,
  normalizeComparableText: (value) => String(value || "").toLowerCase(),
  requestAnimationFrame,
  window: {},
  flowApi: null
});

vm.runInContext(`
  ${expenseNormalizationSource}
  ${buildDataModelSource}
  ${totalsSource}
  ${buildTotalsSource}
  ${moneySource}
  ${escapeHtmlSource}
  ${smoothPathSource}
  ${verticalScaleSource}
  ${monthlyFlowHelpersSource}
  ${temporalSummarySource}
  ${monthlyFlowMarkupSource}
  ${monthlyFlowRendererSource}
  flowApi = {
    buildDataModel,
    buildCgdMonthlyFlowModel,
    buildCgdMonthlyFlowStack,
    computeCgdMonthlyFlowVerticalScale,
    buildCgdMonthlyFlowBalanceSegments,
    createCgdMonthlyFlowChartMarkup,
    getCgdTemporalChartGeometry,
    bindCgdTemporalChartScrollSync,
    renderCgdTemporalSummaryChart,
    renderCgdMonthlyFlowChart
  };
`, context);

const api = context.flowApi;

const rubricRows = [
  { rubrica_id: 1, rubrica_desc: "Salarios <img src=x onerror=alert(1)>", rubrica_tipo: "Receita", rubrica_seq: 1, mes: 1 },
  { rubrica_id: 2, rubrica_desc: "Reserva", rubrica_tipo: "Aprovisionamento", rubrica_seq: 2, mes: 1 },
  { rubrica_id: 3, rubrica_desc: "Casa", rubrica_tipo: "Despesa", rubrica_seq: 3, mes: 1 }
];

const expenseRows = [];
const addExpense = ({
  rubricaId,
  expenseId,
  name,
  month,
  valor = null,
  valorEstimado,
  valorEstimadoLegacy,
  totalizador = true,
  zerado = false
}) => {
  const row = {
    rubrica_id: rubricaId,
    despesa_id: expenseId,
    despesa_desc: name,
    despesa_seq: expenseId,
    mes: month,
    valor,
    totalizador,
    zerado
  };
  if (valorEstimado !== undefined) row.valor_estimado = valorEstimado;
  if (valorEstimadoLegacy !== undefined) row.valor_Estimado = valorEstimadoLegacy;
  expenseRows.push(row);
};

// January: all three categories have real values.
addExpense({ rubricaId: 1, expenseId: 11, name: "Ordenado", month: 1, valor: 1000, valorEstimado: 1400 });
addExpense({ rubricaId: 1, expenseId: 12, name: "Bonus", month: 1, valor: 200, valorEstimado: 500 });
addExpense({ rubricaId: 2, expenseId: 21, name: "Conta", month: 1, valor: 300, valorEstimado: 350 });
addExpense({ rubricaId: 3, expenseId: 31, name: "Renda", month: 1, valor: 700, valorEstimado: 900 });

// February: no real values in any category; all bars and balance use estimates.
addExpense({ rubricaId: 1, expenseId: 11, name: "Ordenado", month: 2, valor: 0, valorEstimado: 900 });
addExpense({ rubricaId: 1, expenseId: 12, name: "Bonus", month: 2, valor: null, valorEstimadoLegacy: 100 });
addExpense({ rubricaId: 1, expenseId: 13, name: "Fora totalizador", month: 2, valor: 0, valorEstimado: 9999, totalizador: false });
addExpense({ rubricaId: 2, expenseId: 21, name: "Conta", month: 2, valor: "", valorEstimado: 200 });
addExpense({ rubricaId: 3, expenseId: 31, name: "Renda", month: 2, valor: null, valorEstimado: 800 });

// March: mixed item-level real and estimated values in the same category/month.
addExpense({ rubricaId: 1, expenseId: 11, name: "Ordenado", month: 3, valor: 600, valorEstimado: 900 });
addExpense({ rubricaId: 1, expenseId: 12, name: "Bonus", month: 3, valor: 0, valorEstimado: 300 });
addExpense({ rubricaId: 2, expenseId: 21, name: "Conta", month: 3, valor: 100, valorEstimado: 200 });
addExpense({ rubricaId: 2, expenseId: 22, name: "Objetivo", month: 3, valor: null, valorEstimadoLegacy: 50 });
addExpense({ rubricaId: 3, expenseId: 31, name: "Renda", month: 3, valor: 500, valorEstimado: 800 });
addExpense({ rubricaId: 3, expenseId: 32, name: "Condominio", month: 3, valor: 0, valorEstimado: 100 });

// April: zerado is an explicit zero and blocks every estimate.
addExpense({ rubricaId: 1, expenseId: 11, name: "Ordenado", month: 4, valor: 0, valorEstimado: 900, zerado: true });
addExpense({ rubricaId: 1, expenseId: 12, name: "Bonus", month: 4, valor: 100, valorEstimado: 300 });
addExpense({ rubricaId: 2, expenseId: 21, name: "Conta", month: 4, valor: 0, valorEstimado: 200, zerado: true });
addExpense({ rubricaId: 3, expenseId: 31, name: "Renda", month: 4, valor: 0, valorEstimado: 800, zerado: true });

// May: reversals exercise divergent stacking by sign.
addExpense({ rubricaId: 1, expenseId: 11, name: "Ordenado", month: 5, valor: -100, valorEstimado: 900 });
addExpense({ rubricaId: 2, expenseId: 21, name: "Conta", month: 5, valor: -50, valorEstimado: 200 });
addExpense({ rubricaId: 3, expenseId: 31, name: "Renda", month: 5, valor: -25, valorEstimado: 800 });

// June: exact zero monthly balance.
addExpense({ rubricaId: 1, expenseId: 11, name: "Ordenado", month: 6, valor: 100 });
addExpense({ rubricaId: 2, expenseId: 21, name: "Conta", month: 6, valor: 50 });
addExpense({ rubricaId: 3, expenseId: 31, name: "Renda", month: 6, valor: 150 });

// September: non-finite/missing real values still fall back.
addExpense({ rubricaId: 1, expenseId: 11, name: "Ordenado", month: 9, valor: "not-a-number", valorEstimado: 80 });
addExpense({ rubricaId: 2, expenseId: 21, name: "Conta", month: 9, valor: 0, valorEstimado: 20 });
addExpense({ rubricaId: 3, expenseId: 31, name: "Renda", month: 9, valor: " ", valorEstimado: 100 });

const model = api.buildDataModel(rubricRows, expenseRows, new Set());
state.data = model;
const flow = JSON.parse(JSON.stringify(api.buildCgdMonthlyFlowModel(model)));

assert.equal(flow.length, 12);
assert.deepEqual(
  { income: flow[0].income, savings: flow[0].savings, outcome: flow[0].outcome, balance: flow[0].balance },
  { income: 1200, savings: 300, outcome: 700, balance: 800 }
);
assert.deepEqual(
  { income: flow[1].income, savings: flow[1].savings, outcome: flow[1].outcome, balance: flow[1].balance },
  { income: 1000, savings: 200, outcome: 800, balance: 400 },
  "Future month estimates must feed all three bars and the monthly balance"
);
assert.equal(flow[1].hasEstimated, true);
assert.deepEqual(
  { income: flow[2].income, savings: flow[2].savings, outcome: flow[2].outcome, balance: flow[2].balance },
  { income: 900, savings: 150, outcome: 600, balance: 450 },
  "Mixed real/estimated items must resolve before rubric aggregation"
);
assert.deepEqual(
  { income: flow[3].income, savings: flow[3].savings, outcome: flow[3].outcome, balance: flow[3].balance },
  { income: 100, savings: 0, outcome: 0, balance: 100 },
  "zerado=true must remain an explicit zero"
);
assert.deepEqual(
  {
    income: flow[4].income,
    savings: flow[4].savings,
    outcome: flow[4].outcome,
    outcomeContribution: flow[4].outcomeContribution,
    balance: flow[4].balance
  },
  { income: -100, savings: -50, outcome: -25, outcomeContribution: 25, balance: -125 }
);
assert.equal(flow[5].balance, 0);
assert.equal(flow[8].balance, 0);

const januaryStack = JSON.parse(JSON.stringify(api.buildCgdMonthlyFlowStack(flow[0])));
assert.deepEqual(
  januaryStack.segments.map(({ key, start, end }) => ({ key, start, end })),
  [
    { key: "income", start: 0, end: 1200 },
    { key: "savings", start: 1200, end: 1500 },
    { key: "outcome", start: 0, end: -700 }
  ]
);
const reversalStack = JSON.parse(JSON.stringify(api.buildCgdMonthlyFlowStack(flow[4])));
assert.deepEqual(
  reversalStack.segments.map(({ key, start, end }) => ({ key, start, end })),
  [
    { key: "income", start: 0, end: -100 },
    { key: "savings", start: -100, end: -150 },
    { key: "outcome", start: 0, end: 25 }
  ]
);

const geometry = JSON.parse(JSON.stringify(api.getCgdTemporalChartGeometry()));
assert.equal(geometry.chartWidth, 980);
assert.equal(geometry.chartHeight, 320);
assert.equal(geometry.plotLeft, 54);
assert.equal(geometry.plotRight, 962);
assert.equal(geometry.monthX.length, 12);
assert.equal(geometry.monthX[0], 54);
assert.equal(geometry.monthX[11], 962);

api.renderCgdTemporalSummaryChart();
api.renderCgdMonthlyFlowChart();
assert.equal(flowHost.tooltipBound, true);
const summaryCoordinates = summaryHost.html.match(/data-month-x='([^']+)'/)?.[1];
const flowCoordinates = flowHost.html.match(/data-month-x='([^']+)'/)?.[1];
assert.ok(summaryCoordinates);
assert.equal(flowCoordinates, summaryCoordinates, "Both temporal charts must expose identical month centers");
assert.equal(summaryHost.html.match(/data-plot-left='([^']+)'/)?.[1], flowHost.html.match(/data-plot-left='([^']+)'/)?.[1]);
assert.equal(summaryHost.html.match(/data-plot-right='([^']+)'/)?.[1], flowHost.html.match(/data-plot-right='([^']+)'/)?.[1]);
assert.equal((summaryCoordinates.match(/,/g) || []).length, 11);

const rendered = flowHost.html;
const barPattern = /<rect[\s\S]*?data-cgd-flow-bar='([^']+)'[\s\S]*?data-month-index='(\d+)'[\s\S]*?data-value='([^']+)'[\s\S]*?x='([^']+)'[\s\S]*?y='([^']+)'[\s\S]*?width='([^']+)'[\s\S]*?height='([^']+)'/g;
const bars = Array.from(rendered.matchAll(barPattern), (match) => ({
  kind: match[1],
  monthIndex: Number(match[2]),
  value: Number(match[3]),
  x: Number(match[4]),
  y: Number(match[5]),
  width: Number(match[6]),
  height: Number(match[7])
}));
const barFor = (kind, monthIndex) => bars.find((bar) => bar.kind === kind && bar.monthIndex === monthIndex);
assert.equal(barFor("income", 1).value, 1000);
assert.equal(barFor("savings", 1).value, 200);
assert.equal(barFor("outcome", 1).value, -800);
assert.equal(barFor("income", 2).value, 900);
assert.equal(barFor("savings", 2).value, 150);
assert.equal(barFor("outcome", 2).value, -600);
assert.equal(barFor("income", 4).value, -100);
assert.equal(barFor("savings", 4).value, -50);
assert.equal(barFor("outcome", 4).value, 25);

const zeroY = Number(rendered.match(/data-cgd-flow-zero-line[^>]*y1='([^']+)'/)?.[1]);
assert.ok(Number.isFinite(zeroY));
assert.ok(Math.abs(zeroY - 151) < 0.01, "Symmetric scale must place zero at the vertical center");
assert.ok(barFor("income", 1).y < zeroY);
assert.ok(barFor("outcome", 1).y >= zeroY - 0.01);
assert.ok(barFor("savings", 1).y < barFor("income", 1).y, "Savings must stack above income");
assert.ok(Math.abs((barFor("savings", 1).y + barFor("savings", 1).height) - barFor("income", 1).y) < 0.02);

const symmetricScale = JSON.parse(JSON.stringify(api.computeCgdMonthlyFlowVerticalScale(
  [januaryStack.positiveTotal, januaryStack.negativeTotal, flow[0].balance],
  { top: 20, height: 262 }
)));
assert.equal(symmetricScale.minValue, -symmetricScale.maxValue);
assert.ok(symmetricScale.maxValue >= 1500);

const crossingSegments = JSON.parse(JSON.stringify(api.buildCgdMonthlyFlowBalanceSegments([
  { x: 0, y: 10, value: 100 },
  { x: 20, y: 30, value: -100 }
], 20)));
assert.deepEqual(crossingSegments, [
  { x1: 0, y1: 10, x2: 10, y2: 20, sign: "positive" },
  { x1: 10, y1: 20, x2: 20, y2: 30, sign: "negative" }
]);
assert.match(rendered, /cgd-monthly-flow-balance-segment is-positive/);
assert.match(rendered, /cgd-monthly-flow-balance-segment is-negative/);
assert.match(rendered, /cgd-monthly-flow-balance-point is-neutral/);
assert.equal((rendered.match(/data-cgd-flow-month='/g) || []).length, 12);
assert.equal((rendered.match(/class='cgd-temporal-month-highlight is-active'/g) || []).length, 1);
assert.match(rendered, /data-cgd-flow-month='7'[\s\S]*aria-current='date'[\s\S]*aria-label='Ago\./);
assert.match(rendered, /data-cgd-flow-month='1'[\s\S]*data-income-value='1000'[\s\S]*data-savings-value='200'[\s\S]*data-outcome-value='-800'[\s\S]*data-balance-value='400'[\s\S]*data-has-estimated='true'/);
assert.match(rendered, /aria-label='Fev\. Receitas \+1,000\.00 EUR; Poupancas \+200\.00 EUR; Despesas -800\.00 EUR; Saldo mensal \+400\.00 EUR\. Inclui valores estimados\.'/);
assert.doesNotMatch(rendered, /<title>Fev\. Receitas/);
assert.match(rendered, /tabindex='0'/);
assert.match(rendered, /role='group'[\s\S]*aria-labelledby='cgd-monthly-flow-svg-title cgd-monthly-flow-svg-description'/);
assert.match(rendered, /class='outcome-evolution-tooltip cgd-monthly-flow-tooltip' aria-hidden='true' role='tooltip'/);
assert.match(rendered, /Os valores incluem estimativas quando nao existe valor real/);
assert.doesNotMatch(rendered, /<img|onerror|alert\(1\)/);

fakeDocument.selectedMonth = 4;
state.selectedYear = 2027;
api.renderCgdTemporalSummaryChart();
api.renderCgdMonthlyFlowChart();
assert.match(flowHost.html, /Fluxo mensal 2027/);
assert.match(flowHost.html, /class='cgd-temporal-month-highlight is-active'[\s\S]*data-cgd-chart-month='4'/);

const safeMarkup = api.createCgdMonthlyFlowChartMarkup(flow, "<img src=x onerror=alert(9)>");
assert.doesNotMatch(safeMarkup, /<img|onerror|alert\(9\)/);

const emptyMarkup = api.createCgdMonthlyFlowChartMarkup(
  months.map((monthName, monthIndex) => ({
    monthName,
    monthIndex,
    income: 0,
    savings: 0,
    outcome: 0,
    outcomeContribution: 0,
    balance: 0,
    hasEstimated: false
  })),
  2028
);
assert.match(emptyMarkup, /Sem movimentos no ano selecionado/);
assert.doesNotMatch(emptyMarkup, /data-cgd-flow-bar=/);
assert.equal((emptyMarkup.match(/data-cgd-flow-month='/g) || []).length, 12);
assert.doesNotMatch(emptyMarkup, /NaN|Infinity/);

const upperWrapper = new FakeScrollWrapper();
const lowerWrapper = new FakeScrollWrapper();
fakeDocument.scrollWrappers = [upperWrapper, lowerWrapper];
api.bindCgdTemporalChartScrollSync();
upperWrapper.scrollLeft = 182;
upperWrapper.dispatchScroll();
flushAnimationFrames();
assert.equal(lowerWrapper.scrollLeft, 182);
assert.equal(state.temporalChartScrollLeft, 182);
lowerWrapper.scrollLeft = 47;
lowerWrapper.dispatchScroll();
flushAnimationFrames();
assert.equal(upperWrapper.scrollLeft, 47);
assert.equal(state.temporalChartScrollLeft, 47);
assert.equal(upperWrapper.listeners.size, 1);
assert.equal(lowerWrapper.listeners.size, 1);

assert.match(cgdHtml, /window\.DASHBOARD_ENABLE_MONTHLY_FLOW_CHART = true/);
assert.match(cgdHtml, /id="cgd-temporal-summary-chart"[\s\S]*id="cgd-monthly-flow-chart"[\s\S]*id="month-timeline"/);
assert.match(cgdHtml, /assets\/js\/cgd\.js\?v=20260812-9/);
assert.match(cgdHtml, /assets\/css\/styles\.css\?v=20260812-5/);
assert.doesNotMatch(novoBancoHtml, /DASHBOARD_ENABLE_MONTHLY_FLOW_CHART|cgd-monthly-flow-chart/);
assert.doesNotMatch(coverflexHtml, /DASHBOARD_ENABLE_MONTHLY_FLOW_CHART|cgd-monthly-flow-chart/);
assert.match(cgd, /const ENABLE_MONTHLY_FLOW_CHART = TABLE_PREFIX === "cgd"/);
assert.match(cgd, /function renderCgdTemporalCharts\(\) \{\s*renderCgdTemporalSummaryChart\(\);\s*renderCgdMonthlyFlowChart\(\);/);
assert.match(cgd, /let touchTooltipLatched = false/);
assert.match(cgd, /month-tile\[data-month\], \[data-cgd-flow-month\]/);
assert.doesNotMatch(
  sliceBetween(cgd, "function buildCgdMonthlyFlowModel(", "\n// ─── CGD Alerts"),
  /supabaseClient|\bfetch\(/
);
assert.match(styles, /\.cgd-monthly-flow-zero-line[\s\S]*stroke-width: 1\.4/);
assert.match(styles, /\.cgd-monthly-flow-month-target:focus/);
assert.match(styles, /\.cgd-temporal-month-highlight\.is-active/);
assert.match(styles, /\.cgd-monthly-flow-bar-savings[\s\S]*opacity: 0\.72/);

console.log("CGD monthly flow regression checks passed.");
