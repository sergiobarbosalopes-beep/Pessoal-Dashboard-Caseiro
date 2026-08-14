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
const monthlyFlowConfigurationSource = sliceBetween(
  cgd,
  "const MONTHLY_FLOW_COMPONENT_DEFINITIONS",
  "\nconst SUPPORTED_CHART_DETAIL_KINDS"
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
assert.doesNotMatch(temporalSummarySource, /summaryHoverBound/);
assert.match(temporalSummarySource, /bindOutcomeChartHover\(host\);/);
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
    this.queryElements = new Map();
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

  querySelector(selector) {
    return this.queryElements.get(selector) || null;
  }
}

class FakeElement {
  constructor(attributes = {}, classes = []) {
    this.attributes = new Map(Object.entries(attributes));
    this.classNames = new Set(classes);
    this.classList = {
      toggle: (className, force) => {
        if (force) {
          this.classNames.add(className);
        } else {
          this.classNames.delete(className);
        }
      },
      contains: (className) => this.classNames.has(className)
    };
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  removeAttribute(name) {
    this.attributes.delete(name);
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
  temporalChartScrollLeft: 0,
  monthlyFlowSeriesVisibility: {
    balance: false,
    average: false
  }
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
  TABLE_PREFIX: "cgd",
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
      neutral: "#b8ced9",
      average: "#d7a6ff"
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
  window: { DASHBOARD_ENABLE_MONTHLY_FLOW_CHART: true },
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
  ${monthlyFlowConfigurationSource}
  ${monthlyFlowHelpersSource}
  ${temporalSummarySource}
  ${monthlyFlowMarkupSource}
  ${monthlyFlowRendererSource}
  flowApi = {
    buildDataModel,
    buildCgdMonthlyFlowModel,
    computeCgdMonthlyFlowBalanceAverage,
    formatCgdMonthlyFlowAverageValue,
    buildCgdMonthlyFlowStack,
    computeCgdMonthlyFlowVerticalScale,
    formatCgdMonthlyFlowAxisTick,
    buildCgdMonthlyFlowBalanceSegments,
    createCgdMonthlyFlowChartMarkup,
    normalizeCgdMonthlyFlowSeriesVisibility,
    buildCgdMonthlyFlowSvgDescription,
    resetCgdMonthlyFlowSeriesVisibility,
    setCgdMonthlyFlowSeriesVisibility,
    bindCgdMonthlyFlowVisibilityControls,
    getCgdTemporalChartGeometry,
    bindCgdTemporalChartScrollSync,
    renderCgdTemporalSummaryChart,
    renderCgdMonthlyFlowChart,
    monthlyFlowChartConfigs: MONTHLY_FLOW_CHART_CONFIGS,
    monthlyFlowChartConfig: MONTHLY_FLOW_CHART_CONFIG,
    monthlyFlowChartEnabled: ENABLE_MONTHLY_FLOW_CHART
  };
`, context);

const api = context.flowApi;
const cgdFlowConfig = api.monthlyFlowChartConfigs.cgd;
const nbFlowConfig = api.monthlyFlowChartConfigs.nb;
const visibilityState = () => JSON.parse(JSON.stringify(state.monthlyFlowSeriesVisibility));

assert.equal(api.monthlyFlowChartEnabled, true);
assert.deepEqual(
  JSON.parse(JSON.stringify(api.monthlyFlowChartConfig.componentKeys)),
  ["income", "savings", "outcome"]
);

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
const expectedBalanceAverage = 1625 / 12;

assert.equal(flow.length, 12);
assert.equal(api.computeCgdMonthlyFlowBalanceAverage(flow), expectedBalanceAverage);
assert.equal(api.formatCgdMonthlyFlowAverageValue(expectedBalanceAverage), "135.42");
assert.equal(api.formatCgdMonthlyFlowAverageValue(1234.5), "1234.50");
assert.equal(api.formatCgdMonthlyFlowAverageValue(-1234.5), "-1234.50");
assert.equal(
  api.computeCgdMonthlyFlowBalanceAverage(months.map(() => ({ balance: -12 }))),
  -12
);
assert.equal(
  api.computeCgdMonthlyFlowBalanceAverage([
    { balance: 100 },
    { balance: -100 }
  ]),
  0,
  "The 12-month denominator must include missing months as zero"
);
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

const nbFlow = JSON.parse(JSON.stringify(api.buildCgdMonthlyFlowModel(model, nbFlowConfig)));
const expectedNbBalanceAverage = 955 / 12;
assert.equal(nbFlow.length, 12);
assert.equal(api.computeCgdMonthlyFlowBalanceAverage(nbFlow), expectedNbBalanceAverage);
assert.equal(api.formatCgdMonthlyFlowAverageValue(expectedNbBalanceAverage), "79.58");
assert.deepEqual(
  { income: nbFlow[0].income, outcome: nbFlow[0].outcome, balance: nbFlow[0].balance },
  { income: 1200, outcome: 700, balance: 500 }
);
assert.deepEqual(
  { income: nbFlow[1].income, outcome: nbFlow[1].outcome, balance: nbFlow[1].balance },
  { income: 1000, outcome: 800, balance: 200 },
  "Novo Banco future estimates must feed both bars and income minus outcome"
);
assert.deepEqual(
  { income: nbFlow[2].income, outcome: nbFlow[2].outcome, balance: nbFlow[2].balance },
  { income: 900, outcome: 600, balance: 300 },
  "Novo Banco mixed real and estimated items must resolve before aggregation"
);
assert.deepEqual(
  { income: nbFlow[3].income, outcome: nbFlow[3].outcome, balance: nbFlow[3].balance },
  { income: 100, outcome: 0, balance: 100 },
  "Novo Banco zerado=true must block estimate fallback"
);
assert.deepEqual(
  {
    income: nbFlow[4].income,
    outcome: nbFlow[4].outcome,
    outcomeContribution: nbFlow[4].outcomeContribution,
    balance: nbFlow[4].balance
  },
  { income: -100, outcome: -25, outcomeContribution: 25, balance: -75 }
);
assert.equal(nbFlow[5].balance, -50);
assert.equal(nbFlow[8].balance, -20);
assert.equal(Object.hasOwn(nbFlow[0], "savings"), false);
assert.equal(Object.hasOwn(nbFlow[0], "savingsContribution"), false);

const nbJanuaryStack = JSON.parse(JSON.stringify(
  api.buildCgdMonthlyFlowStack(nbFlow[0], nbFlowConfig)
));
assert.deepEqual(
  nbJanuaryStack.segments.map(({ key, start, end }) => ({ key, start, end })),
  [
    { key: "income", start: 0, end: 1200 },
    { key: "outcome", start: 0, end: -700 }
  ]
);
const nbReversalStack = JSON.parse(JSON.stringify(
  api.buildCgdMonthlyFlowStack(nbFlow[4], nbFlowConfig)
));
assert.deepEqual(
  nbReversalStack.segments.map(({ key, start, end }) => ({ key, start, end })),
  [
    { key: "income", start: 0, end: -100 },
    { key: "outcome", start: 0, end: 25 }
  ]
);

const nbRendered = api.createCgdMonthlyFlowChartMarkup(
  nbFlow,
  2026,
  { balance: true, average: true },
  nbFlowConfig
);
assert.match(nbRendered, /<h3>Fluxo mensal 2026<\/h3>/);
assert.match(nbRendered, /<p>Receitas \u2212 Despesas<\/p>/);
assert.match(nbRendered, /data-cgd-flow-bar='income'/);
assert.match(nbRendered, /data-cgd-flow-bar='outcome'/);
assert.doesNotMatch(nbRendered, /Poupancas|Poupanças|savings/i);
assert.doesNotMatch(nbRendered, /data-savings-value|data-cgd-flow-bar='savings'/);
assert.match(
  nbRendered,
  /data-cgd-flow-month='1'[\s\S]*data-income-value='1000'[\s\S]*data-outcome-value='-800'[\s\S]*data-balance-value='200'[\s\S]*data-has-estimated='true'/
);
assert.match(
  nbRendered,
  /aria-label='Fev\. Receitas \+1,000\.00 EUR; Despesas -800\.00 EUR; Saldo mensal \+200\.00 EUR\. Inclui valores estimados\.'/
);
assert.match(nbRendered, /data-balance-average='79\.58333333333333'/);
assert.match(nbRendered, /aria-label='Média do saldo mensal: 79\.58'/);
assert.match(nbRendered, /data-scale-min='-900'/);
assert.match(nbRendered, /data-scale-max='1500'/);
assert.match(nbRendered, /data-scale-ticks='1500,1000,500,0,-300,-600,-900'/);

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
assert.deepEqual(
  visibilityState(),
  { balance: true, average: true },
  "A full render must reset both flow overlays to visible"
);
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
assert.ok(Math.abs(zeroY - 194.67) < 0.02, "Asymmetric scale must place zero from independent bounds");
assert.ok(barFor("income", 1).y < zeroY);
assert.ok(barFor("outcome", 1).y >= zeroY - 0.01);
assert.ok(barFor("savings", 1).y < barFor("income", 1).y, "Savings must stack above income");
assert.ok(Math.abs((barFor("savings", 1).y + barFor("savings", 1).height) - barFor("income", 1).y) < 0.02);
bars.forEach((bar) => {
  assert.ok(bar.y >= 20 - 0.01);
  assert.ok(bar.y + bar.height <= 282 + 0.01);
});

const asymmetricScaleRuntime = api.computeCgdMonthlyFlowVerticalScale(
  [10000, -16000],
  { top: 20, height: 262 }
);
const asymmetricScale = JSON.parse(JSON.stringify(asymmetricScaleRuntime));
assert.equal(asymmetricScale.maxValue, 12000);
assert.equal(asymmetricScale.minValue, -18000);
assert.notEqual(asymmetricScale.maxValue, Math.abs(asymmetricScale.minValue));
assert.deepEqual(asymmetricScale.ticks, [12000, 8000, 4000, 0, -6000, -12000, -18000]);
assert.equal(asymmetricScale.ticks.filter((value) => value === 0).length, 1);
assert.ok(asymmetricScale.ticks.length >= 5 && asymmetricScale.ticks.length <= 7);
const positiveHeadroom = asymmetricScaleRuntime.yFor(10000) - 20;
const negativeHeadroom = 282 - asymmetricScaleRuntime.yFor(-16000);
assert.ok(positiveHeadroom > 0 && positiveHeadroom < 30);
assert.ok(negativeHeadroom > 0 && negativeHeadroom < 30);
assert.ok(asymmetricScaleRuntime.yFor(10000) > 20);
assert.ok(asymmetricScaleRuntime.yFor(-16000) < 282);

const positiveOnlyScale = JSON.parse(JSON.stringify(api.computeCgdMonthlyFlowVerticalScale(
  [100, 1000],
  { top: 20, height: 262 }
)));
assert.equal(positiveOnlyScale.maxValue, 1200);
assert.equal(positiveOnlyScale.minValue, -120);
assert.ok(Math.abs(positiveOnlyScale.minValue) < positiveOnlyScale.maxValue * 0.2);
assert.deepEqual(positiveOnlyScale.ticks, [1200, 900, 600, 300, 0, -120]);

const negativeOnlyScale = JSON.parse(JSON.stringify(api.computeCgdMonthlyFlowVerticalScale(
  [-100, -1000],
  { top: 20, height: 262 }
)));
assert.equal(negativeOnlyScale.maxValue, 120);
assert.equal(negativeOnlyScale.minValue, -1200);
assert.ok(negativeOnlyScale.maxValue < Math.abs(negativeOnlyScale.minValue) * 0.2);
assert.deepEqual(negativeOnlyScale.ticks, [120, 0, -300, -600, -900, -1200]);

const zeroScale = JSON.parse(JSON.stringify(api.computeCgdMonthlyFlowVerticalScale(
  [0, 0, Number.NaN],
  { top: 20, height: 262 }
)));
assert.deepEqual(
  {
    minValue: zeroScale.minValue,
    maxValue: zeroScale.maxValue,
    ticks: zeroScale.ticks
  },
  { minValue: -10, maxValue: 10, ticks: [10, 5, 0, -5, -10] }
);

const outlierScaleRuntime = api.computeCgdMonthlyFlowVerticalScale(
  [1e9, -1, 12],
  { top: 20, height: 262 }
);
const outlierScale = JSON.parse(JSON.stringify(outlierScaleRuntime));
assert.ok(outlierScale.maxValue >= 1e9);
assert.ok(outlierScale.minValue < 0);
assert.ok(outlierScaleRuntime.yFor(1e9) > 20);
assert.ok(outlierScaleRuntime.yFor(-1) < 282);
assert.equal(api.formatCgdMonthlyFlowAxisTick(1.2e9, 4e8), "1.2B");
assert.equal(api.formatCgdMonthlyFlowAxisTick(-18000, 6000), "-18000");
assert.equal(api.formatCgdMonthlyFlowAxisTick(-0, 5), "0");
assert.equal(api.formatCgdMonthlyFlowAxisTick(50000, 50000, 150000), "50k");
assert.equal(api.formatCgdMonthlyFlowAxisTick(100000, 50000, 150000), "100k");
assert.equal(api.formatCgdMonthlyFlowAxisTick(150000, 50000, 150000), "150k");

const floatingResidueScale = JSON.parse(JSON.stringify(api.computeCgdMonthlyFlowVerticalScale(
  [1500.10 + 300.05 - 1800.15, 0.1 + 0.2 - 0.3],
  { top: 20, height: 262 }
)));
assert.deepEqual(
  {
    minValue: floatingResidueScale.minValue,
    maxValue: floatingResidueScale.maxValue,
    ticks: floatingResidueScale.ticks
  },
  { minValue: -10, maxValue: 10, ticks: [10, 5, 0, -5, -10] },
  "Sub-cent floating-point residues must use the stable empty scale"
);
assert.doesNotMatch(JSON.stringify(floatingResidueScale), /NaN|Infinity/);

const residueWithPositiveScale = JSON.parse(JSON.stringify(api.computeCgdMonthlyFlowVerticalScale(
  [100, -1e-13],
  { top: 20, height: 262 }
)));
assert.equal(residueWithPositiveScale.maxValue, 120);
assert.equal(residueWithPositiveScale.minValue, -12);
assert.deepEqual(residueWithPositiveScale.ticks, [120, 90, 60, 30, 0, -12]);

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
const averageLineMatch = rendered.match(
  /data-cgd-flow-average-line[\s\S]*?y1='([^']+)'[\s\S]*?y2='([^']+)'/
);
assert.ok(averageLineMatch);
assert.equal(averageLineMatch[1], averageLineMatch[2], "The balance average must be horizontal");
assert.match(rendered, /data-cgd-flow-average-line[\s\S]*?stroke='#d7a6ff'/);
assert.match(rendered, /data-cgd-flow-average-line[\s\S]*?stroke-width='1\.8'/);
assert.match(rendered, /data-cgd-flow-average-line[\s\S]*?stroke-dasharray='8 6'/);
assert.match(rendered, /data-cgd-flow-average-line[\s\S]*?stroke-linecap='butt'/);
assert.match(rendered, /data-cgd-flow-average-line[\s\S]*?vector-effect='non-scaling-stroke'/);
assert.match(rendered, /data-cgd-flow-series='average'[\s\S]*?role='img' aria-label='Média do saldo mensal: 135\.42'/);
assert.match(rendered, /<title>Média do saldo mensal: 135\.42<\/title>/);
assert.doesNotMatch(
  rendered.match(/<g[^>]*data-cgd-flow-series='average'[\s\S]*?<\/g>/)?.[0] || "",
  /<circle|tabindex=/
);
assert.match(rendered, /data-cgd-flow-toggle='balance'[\s\S]*?aria-pressed='true'/);
assert.match(rendered, /data-cgd-flow-toggle='average'[\s\S]*?aria-pressed='true'[\s\S]*?aria-label='Média do saldo mensal: 135\.42'/);
assert.match(rendered, /data-scale-min='-900'/);
assert.match(rendered, /data-scale-max='1800'/);
assert.match(rendered, /data-scale-ticks='1800,1200,600,0,-300,-600,-900'/);
assert.match(rendered, new RegExp(`data-balance-average='${expectedBalanceAverage}'`));
const renderedTickValues = Array.from(
  rendered.matchAll(/data-cgd-flow-tick-value='([^']+)'/g),
  (match) => Number(match[1])
);
assert.deepEqual(renderedTickValues, [1800, 1200, 600, -300, -600, -900]);
assert.equal((rendered.match(/data-scale-ticks='[^']*\b0\b[^']*'/g) || []).length, 1);
assert.doesNotMatch(rendered, />-0(?:\.0+)?</);
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
assert.match(rendered, /O detalhe mensal mantem o saldo calculado mesmo quando a linha esta oculta/);
assert.doesNotMatch(rendered, /<img|onerror|alert\(1\)/);

const extremeFlow = months.map((monthName, monthIndex) => ({
  monthName,
  monthIndex,
  income: monthIndex === 0 ? 6000 : 0,
  savings: monthIndex === 0 ? 4000 : 0,
  outcome: monthIndex === 0 ? 16000 : 0,
  outcomeContribution: monthIndex === 0 ? -16000 : 0,
  balance: monthIndex === 0 ? -6000 : 0,
  hasEstimated: false
}));
const extremeMarkup = api.createCgdMonthlyFlowChartMarkup(
  extremeFlow,
  2026,
  { balance: false, average: false }
);
assert.match(extremeMarkup, /data-scale-min='-18000'/);
assert.match(extremeMarkup, /data-scale-max='12000'/);
assert.match(extremeMarkup, /data-scale-ticks='12000,8000,4000,0,-6000,-12000,-18000'/);
assert.match(extremeMarkup, /data-cgd-flow-bar='income'[\s\S]*?data-value='6000'/);
assert.match(extremeMarkup, /data-cgd-flow-bar='savings'[\s\S]*?data-value='4000'/);
assert.match(extremeMarkup, /data-cgd-flow-bar='outcome'[\s\S]*?data-value='-16000'/);
assert.match(extremeMarkup, /data-cgd-flow-series='balance'[\s\S]*?aria-hidden='true'/);
assert.match(extremeMarkup, /data-cgd-flow-series='average'[\s\S]*?aria-hidden='true'/);

const hiddenOverlayFlow = months.map((monthName, monthIndex) => ({
  monthName,
  monthIndex,
  income: 0,
  savings: 0,
  outcome: 0,
  outcomeContribution: 0,
  balance: monthIndex === 0 ? 25000 : 0,
  hasEstimated: false
}));
const hiddenOverlayMarkup = api.createCgdMonthlyFlowChartMarkup(
  hiddenOverlayFlow,
  2026,
  { balance: false, average: false }
);
assert.match(hiddenOverlayMarkup, /data-scale-max='30000'/);
assert.match(hiddenOverlayMarkup, /data-scale-min='-3000'/);

const visibilityCombinations = [
  { balance: true, average: true },
  { balance: false, average: true },
  { balance: true, average: false },
  { balance: false, average: false }
];
const geometrySnapshot = (markup) => ({
  monthX: markup.match(/data-month-x='([^']+)'/)?.[1],
  plotLeft: markup.match(/data-plot-left='([^']+)'/)?.[1],
  plotRight: markup.match(/data-plot-right='([^']+)'/)?.[1],
  scaleMin: markup.match(/data-scale-min='([^']+)'/)?.[1],
  scaleMax: markup.match(/data-scale-max='([^']+)'/)?.[1],
  zeroY: markup.match(/data-scale-zero-y='([^']+)'/)?.[1],
  ticks: markup.match(/data-scale-ticks='([^']+)'/)?.[1],
  bars: Array.from(markup.matchAll(/<rect[\s\S]*?data-cgd-flow-bar='[^']+'[\s\S]*?<\/rect>/g), (match) => match[0]),
  grid: Array.from(markup.matchAll(/<line data-cgd-flow-tick-value='[^']+'[\s\S]*?cgd-monthly-flow-grid-line'[\s\S]*?<\/line>/g), (match) => match[0])
});
const combinationMarkups = visibilityCombinations.map((visibility) => ({
  visibility,
  markup: api.createCgdMonthlyFlowChartMarkup(flow, 2026, visibility)
}));
const stableGeometry = geometrySnapshot(combinationMarkups[0].markup);
assert.ok(stableGeometry.bars.length > 0);
assert.ok(stableGeometry.grid.length > 0);
combinationMarkups.forEach(({ visibility, markup }) => {
  assert.deepEqual(
    geometrySnapshot(markup),
    stableGeometry,
    "Toggling overlays must not change scale, ticks, bars, or temporal geometry"
  );
  const balanceGroup = markup.match(/<g[^>]*data-cgd-flow-series='balance'[^>]*>/)?.[0] || "";
  const averageGroup = markup.match(/<g[^>]*data-cgd-flow-series='average'[^>]*>/)?.[0] || "";
  assert.equal(balanceGroup.includes("is-hidden"), !visibility.balance);
  assert.equal(balanceGroup.includes("aria-hidden='true'"), !visibility.balance);
  assert.equal(balanceGroup.includes("role='img'"), visibility.balance);
  assert.equal(averageGroup.includes("is-hidden"), !visibility.average);
  assert.equal(averageGroup.includes("aria-hidden='true'"), !visibility.average);
  assert.equal(averageGroup.includes("role='img'"), visibility.average);
  assert.match(
    markup,
    new RegExp(`data-cgd-flow-toggle='balance'[\\s\\S]*?aria-pressed='${visibility.balance}'`)
  );
  assert.match(
    markup,
    new RegExp(`data-cgd-flow-toggle='average'[\\s\\S]*?aria-pressed='${visibility.average}'`)
  );
  assert.match(
    markup,
    /data-cgd-flow-month='1'[\s\S]*?data-balance-value='400'/,
    "Monthly tooltip targets keep the calculated balance when its visual line is hidden"
  );
  assert.equal(
    markup.match(/<desc[^>]*data-cgd-flow-description[^>]*>([^<]*)<\/desc>/)?.[1],
    api.buildCgdMonthlyFlowSvgDescription(visibility),
    "The parent SVG description must match the visible overlay combination"
  );
});

const nbCombinationMarkups = visibilityCombinations.map((visibility) => ({
  visibility,
  markup: api.createCgdMonthlyFlowChartMarkup(nbFlow, 2026, visibility, nbFlowConfig)
}));
const stableNbGeometry = geometrySnapshot(nbCombinationMarkups[0].markup);
assert.ok(stableNbGeometry.bars.length > 0);
nbCombinationMarkups.forEach(({ visibility, markup }) => {
  assert.deepEqual(
    geometrySnapshot(markup),
    stableNbGeometry,
    "Novo Banco overlay toggles must not change scale, ticks, bars, or geometry"
  );
  assert.equal(stableNbGeometry.monthX, geometry.monthX.map((value) => value.toFixed(2)).join(","));
  assert.doesNotMatch(markup, /Poupancas|Poupanças|savings/i);
  assert.match(
    markup,
    new RegExp(`data-cgd-flow-toggle='balance'[\\s\\S]*?aria-pressed='${visibility.balance}'`)
  );
  assert.match(
    markup,
    new RegExp(`data-cgd-flow-toggle='average'[\\s\\S]*?aria-pressed='${visibility.average}'`)
  );
  assert.match(
    markup,
    /data-cgd-flow-month='1'[\s\S]*?data-balance-value='200'/,
    "Novo Banco tooltip targets keep balance data while the line is hidden"
  );
  assert.equal(
    markup.match(/<desc[^>]*data-cgd-flow-description[^>]*>([^<]*)<\/desc>/)?.[1],
    api.buildCgdMonthlyFlowSvgDescription(visibility, nbFlowConfig)
  );
});

const balanceToggle = new FakeElement(
  { "data-cgd-flow-toggle": "balance", "aria-pressed": "true" },
  ["cgd-monthly-flow-legend-toggle", "is-active"]
);
const averageToggle = new FakeElement(
  { "data-cgd-flow-toggle": "average", "aria-pressed": "true" },
  ["cgd-monthly-flow-legend-toggle", "is-active"]
);
const balanceGroup = new FakeElement(
  {
    "data-cgd-flow-series": "balance",
    "data-cgd-flow-series-label": "Saldo mensal: linha continua com marcadores",
    role: "img",
    "aria-label": "Saldo mensal: linha continua com marcadores"
  },
  ["cgd-monthly-flow-series"]
);
const averageGroup = new FakeElement(
  {
    "data-cgd-flow-series": "average",
    "data-cgd-flow-series-label": "Média do saldo mensal: 135.42",
    role: "img",
    "aria-label": "Média do saldo mensal: 135.42"
  },
  ["cgd-monthly-flow-series"]
);
const flowDescription = new FakeElement();
flowHost.queryElements.set("[data-cgd-flow-toggle='balance']", balanceToggle);
flowHost.queryElements.set("[data-cgd-flow-toggle='average']", averageToggle);
flowHost.queryElements.set("[data-cgd-flow-series='balance']", balanceGroup);
flowHost.queryElements.set("[data-cgd-flow-series='average']", averageGroup);
flowHost.queryElements.set("[data-cgd-flow-description]", flowDescription);

flowHost.listeners.get("click")?.({
  target: { closest: () => balanceToggle }
});
assert.deepEqual(visibilityState(), { balance: false, average: true });
assert.equal(balanceToggle.getAttribute("aria-pressed"), "false");
assert.equal(balanceToggle.classList.contains("is-inactive"), true);
assert.equal(balanceGroup.classList.contains("is-hidden"), true);
assert.equal(balanceGroup.getAttribute("aria-hidden"), "true");
assert.equal(balanceGroup.getAttribute("role"), null);
assert.equal(balanceGroup.getAttribute("aria-label"), null);
assert.match(flowDescription.textContent, /média horizontal tracejada esta visivel e a linha do saldo mensal esta oculta/);

assert.equal(api.setCgdMonthlyFlowSeriesVisibility(flowHost, "average", false), true);
assert.deepEqual(visibilityState(), { balance: false, average: false });
assert.equal(averageToggle.getAttribute("aria-pressed"), "false");
assert.equal(averageGroup.classList.contains("is-hidden"), true);
assert.match(flowDescription.textContent, /As linhas do saldo mensal e da média estao ocultas/);
assert.equal(api.setCgdMonthlyFlowSeriesVisibility(flowHost, "balance", true), true);
assert.deepEqual(visibilityState(), { balance: true, average: false });
assert.equal(balanceGroup.getAttribute("role"), "img");
assert.equal(balanceGroup.getAttribute("aria-label"), "Saldo mensal: linha continua com marcadores");
assert.equal(api.setCgdMonthlyFlowSeriesVisibility(flowHost, "average", true), true);
assert.deepEqual(visibilityState(), { balance: true, average: true });
assert.equal(api.setCgdMonthlyFlowSeriesVisibility(flowHost, "unknown", false), false);

api.setCgdMonthlyFlowSeriesVisibility(flowHost, "average", false);
fakeDocument.selectedMonth = 4;
const monthChangeMarkup = api.createCgdMonthlyFlowChartMarkup(flow, 2026);
assert.match(monthChangeMarkup, /data-cgd-flow-series='average'[\s\S]*?aria-hidden='true'/);
assert.match(monthChangeMarkup, /data-cgd-flow-month='4'[\s\S]*?aria-current='date'/);
assert.deepEqual(
  visibilityState(),
  { balance: true, average: false },
  "Changing month must preserve flow overlay visibility"
);
state.selectedYear = 2027;
api.renderCgdTemporalSummaryChart();
api.renderCgdMonthlyFlowChart();
assert.match(flowHost.html, /Fluxo mensal 2027/);
assert.match(flowHost.html, /class='cgd-temporal-month-highlight is-active'[\s\S]*data-cgd-chart-month='4'/);
assert.deepEqual(
  visibilityState(),
  { balance: true, average: true },
  "Changing year or fully rerendering must restore both overlays"
);

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
assert.match(emptyMarkup, /data-cgd-flow-average-value='0'/);
assert.match(emptyMarkup, /Média do saldo mensal: 0\.00/);
assert.match(emptyMarkup, /data-cgd-flow-average-line[\s\S]*?y1='151\.00'[\s\S]*?y2='151\.00'/);
assert.match(emptyMarkup, /data-cgd-flow-toggle='balance'[\s\S]*?aria-pressed='true'/);
assert.match(emptyMarkup, /data-cgd-flow-toggle='average'[\s\S]*?aria-pressed='true'/);
assert.doesNotMatch(emptyMarkup, /NaN|Infinity/);

const nbEmptyMarkup = api.createCgdMonthlyFlowChartMarkup(
  months.map((monthName, monthIndex) => ({
    monthName,
    monthIndex,
    income: 0,
    outcome: 0,
    outcomeContribution: 0,
    balance: 0,
    hasEstimated: false
  })),
  2028,
  { balance: true, average: true },
  nbFlowConfig
);
assert.match(nbEmptyMarkup, /Sem movimentos no ano selecionado/);
assert.match(nbEmptyMarkup, /data-scale-min='-10'/);
assert.match(nbEmptyMarkup, /data-scale-max='10'/);
assert.doesNotMatch(nbEmptyMarkup, /Poupancas|Poupanças|savings|NaN|Infinity/i);

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

state.selectedYear = 2026;
state.data = model;
api.renderCgdMonthlyFlowChart(nbFlowConfig);
assert.match(flowHost.html, /Fluxo mensal 2026/);
assert.match(flowHost.html, /Receitas \u2212 Despesas/);
assert.match(flowHost.html, /data-balance-average='79\.58333333333333'/);
assert.doesNotMatch(flowHost.html, /Poupancas|Poupanças|savings/i);
assert.deepEqual(visibilityState(), { balance: true, average: true });
assert.equal(api.setCgdMonthlyFlowSeriesVisibility(flowHost, "average", false), true);
assert.match(flowDescription.textContent, /Receitas apresentadas por sinal e despesas como contribuicao negativa/);
assert.doesNotMatch(flowDescription.textContent, /Poupancas|Poupanças|savings/i);
assert.equal(api.setCgdMonthlyFlowSeriesVisibility(flowHost, "average", true), true);

const evaluateMonthlyFlowCapability = (prefix, enabled) => {
  const capabilityContext = vm.createContext({
    Array,
    Boolean,
    Object,
    String,
    TABLE_PREFIX: prefix,
    window: { DASHBOARD_ENABLE_MONTHLY_FLOW_CHART: enabled },
    result: null
  });
  vm.runInContext(`
    ${monthlyFlowConfigurationSource}
    result = {
      enabled: ENABLE_MONTHLY_FLOW_CHART,
      components: MONTHLY_FLOW_CHART_CONFIG?.componentKeys || [],
      subtitle: MONTHLY_FLOW_CHART_CONFIG?.subtitle || ""
    };
  `, capabilityContext);
  return JSON.parse(JSON.stringify(capabilityContext.result));
};
assert.deepEqual(
  evaluateMonthlyFlowCapability("cgd", true),
  {
    enabled: true,
    components: ["income", "savings", "outcome"],
    subtitle: "Receitas + Poupancas - Despesas"
  }
);
assert.deepEqual(
  evaluateMonthlyFlowCapability("nb", true),
  {
    enabled: true,
    components: ["income", "outcome"],
    subtitle: "Receitas \u2212 Despesas"
  }
);
assert.deepEqual(
  evaluateMonthlyFlowCapability("coverflex", true),
  { enabled: false, components: [], subtitle: "" }
);
assert.deepEqual(
  evaluateMonthlyFlowCapability("nb", false),
  { enabled: false, components: [], subtitle: "" }
);

assert.match(cgdHtml, /window\.DASHBOARD_ENABLE_MONTHLY_FLOW_CHART = true/);
assert.match(cgdHtml, /id="month-timeline"[\s\S]*id="cgd-temporal-summary-chart"[\s\S]*id="cgd-monthly-flow-chart"/);
assert.match(cgdHtml, /assets\/js\/cgd\.js\?v=20260814-1/);
assert.match(cgdHtml, /assets\/css\/styles\.css\?v=20260814-1/);
assert.match(novoBancoHtml, /window\.DASHBOARD_ENABLE_MONTHLY_FLOW_CHART = true/);
assert.match(novoBancoHtml, /id="month-timeline"[\s\S]*id="cgd-temporal-summary-chart"[\s\S]*id="cgd-monthly-flow-chart"/);
assert.match(novoBancoHtml, /assets\/js\/cgd\.js\?v=20260814-1/);
assert.match(novoBancoHtml, /assets\/css\/styles\.css\?v=20260814-1/);
assert.doesNotMatch(coverflexHtml, /DASHBOARD_ENABLE_MONTHLY_FLOW_CHART|cgd-monthly-flow-chart/);
assert.match(coverflexHtml, /id="month-timeline"[\s\S]*id="cgd-temporal-summary-chart"/);
assert.match(cgd, /cgd:\s*Object\.freeze\(\{[\s\S]*?componentKeys:\s*Object\.freeze\(\["income", "savings", "outcome"\]\)/);
assert.match(cgd, /nb:\s*Object\.freeze\(\{[\s\S]*?componentKeys:\s*Object\.freeze\(\["income", "outcome"\]\)/);
assert.match(cgd, /const ENABLE_MONTHLY_FLOW_CHART = Boolean\(MONTHLY_FLOW_CHART_CONFIG\)/);
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
assert.match(styles, /\.cgd-monthly-flow-legend-toggle:focus-visible/);
assert.match(styles, /\.cgd-monthly-flow-legend-toggle\[aria-pressed="false"\]::after/);
assert.match(styles, /\.cgd-monthly-flow-series\.is-hidden\s*\{\s*display:\s*none;/);
assert.match(
  styles,
  /@media \(pointer: coarse\), \(max-width: 1024px\)[\s\S]*?\.cgd-monthly-flow-legend-toggle\s*\{[\s\S]*?min-height:\s*44px;/
);

console.log("CGD and Novo Banco monthly flow regression checks passed.");
