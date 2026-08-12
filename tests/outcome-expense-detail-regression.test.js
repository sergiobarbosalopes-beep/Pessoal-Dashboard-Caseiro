const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const cgd = read("assets/js/cgd.js");
const styles = read("assets/css/styles.css");
const novoBancoHtml = read("novobanco.html");
const cgdHtml = read("caixa-geral-depositos.html");
const coverflexHtml = read("coverflex.html");

const sliceBetween = (source, startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Unable to extract ${startMarker}`);
  return source.slice(start, end);
};

const escapeHtmlSource = sliceBetween(cgd, "function escapeHtml(", "\nfunction buildSmoothPathData");
const expenseNormalizationSource = sliceBetween(
  cgd,
  "function normalizeMonth(",
  "\nasync function fetchRubricsForYear"
);
const buildDataModelSource = sliceBetween(
  cgd,
  "function buildDataModel(",
  "\nfunction money("
);
const moneySource = sliceBetween(cgd, "function money(", "\nfunction isZeroMoneyDisplayValue");
const outcomeRubricBuilderSource = sliceBetween(
  cgd,
  "function buildOutcomeRubricSeries()",
  "\nfunction buildIncomeRubricSeries()"
);
const outcomeExpenseBuilderSource = sliceBetween(
  cgd,
  "function buildOutcomeExpenseSeriesForRubric(",
  "\nfunction buildIncomeExpenseSeriesForRubric("
);
const outcomeChartSource = sliceBetween(
  cgd,
  "function resetOutcomeExpenseDetail()",
  "\nfunction renderPanels()"
);
const incomeChartSource = sliceBetween(
  cgd,
  "function renderIncomeEvolutionChart()",
  "\nfunction bindSavingsChartInteractions("
);
const outcomeToggleSource = sliceBetween(
  cgd,
  "window.cgdToggleOutcomeChart =",
  "\nwindow.cgdToggleOutcomeComparisonChart ="
);

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(value) {
    this.values.add(value);
  }

  remove(value) {
    this.values.delete(value);
  }

  contains(value) {
    return this.values.has(value);
  }
}

class FakeTarget {
  constructor(attribute, value = "") {
    this.attribute = attribute;
    this.value = value;
  }

  closest(selector) {
    return selector === `[${this.attribute}]` ? this : null;
  }

  getAttribute(name) {
    return name === this.attribute ? this.value : null;
  }
}

class FakeHost {
  constructor() {
    this.classList = new FakeClassList();
    this.dataset = {};
    this.focusCount = 0;
    this.html = "";
    this.listeners = new Map();
    this.card = { classList: new FakeClassList() };
  }

  set innerHTML(value) {
    this.html = String(value);
  }

  get innerHTML() {
    return this.html;
  }

  closest(selector) {
    return selector.includes("evolution-card") ? this.card : null;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  querySelector(selector) {
    if (selector === "[data-outcome-expense-detail-toggle]" && this.html.includes("data-outcome-expense-detail-toggle")) {
      return {
        focus: () => {
          this.focusCount += 1;
        }
      };
    }
    return null;
  }

  querySelectorAll(selector) {
    if (selector !== "[data-outcome-chart-toggle]") {
      return [];
    }

    return Array.from(this.html.matchAll(/data-outcome-chart-toggle='([^']+)'/g), (match) => ({
      getAttribute: (name) => (name === "data-outcome-chart-toggle" ? match[1] : null)
    }));
  }

  click(attribute, value = "") {
    const listener = this.listeners.get("click");
    assert.ok(listener, "Chart click listener must be bound");
    listener({ target: new FakeTarget(attribute, value) });
  }
}

const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const monthValues = (base) => months.map((_, index) => base + index);
const zeroValues = () => months.map(() => 0);

const makeData = () => ({
  income: [],
  savings: [],
  outcome: [
    {
      id: 11,
      name: "Educacao",
      values: monthValues(300),
      expenses: [
        { id: 101, name: "Livros", values: monthValues(80) },
        { id: 102, name: "Formacao", values: monthValues(120) }
      ]
    },
    {
      id: 22,
      name: "Casa",
      values: monthValues(700),
      expenses: [
        { id: 201, name: "Condominio", values: monthValues(60) }
      ]
    }
  ]
});

const makeContext = ({ explicitDetail, data = makeData(), outcomeChartVisible = true }) => {
  const outcomeHost = new FakeHost();
  const incomeHost = new FakeHost();
  const state = {
    data,
    outcomeChartVisible,
    outcomeChartHiddenRubrics: new Set(),
    outcomeChartSelectedRubricKey: null,
    outcomeChartExpenseDetailVisible: false,
    outcomeChartExpenseDetailRubricKey: null,
    outcomeDrilldownHiddenExpenses: new Set(),
    incomeChartVisible: true,
    incomeChartHiddenRubrics: new Set(),
    incomeChartSelectedRubricKey: null,
    incomeDrilldownHiddenExpenses: new Set()
  };
  let api;
  const context = vm.createContext({
    Array,
    Boolean,
    Event: class {},
    Map,
    Number,
    Set,
    String,
    EXPENSE_SEQ_COLUMN: "despesa_seq",
    EXPLICIT_OUTCOME_EXPENSE_DETAIL: explicitDetail,
    HIDE_SAVINGS: false,
    THEME_COLORS: {
      outcomeRubrics: ["#111111", "#222222"],
      outcomeExpenses: ["#333333", "#444444", "#555555"]
    },
    bindIncomeChartInteractions: () => {},
    bindOutcomeChartHover: () => {},
    buildIncomeExpenseSeriesForRubric: (rubric) => rubric.expenses,
    buildIncomeRubricSeries: () => [{
      key: "income-1",
      name: "Receitas",
      values: monthValues(1000),
      color: "#117744",
      expenses: [{
        key: "income-expense-1",
        name: "Salario",
        values: monthValues(1000),
        color: "#33aa66"
      }]
    }],
    buildSmoothPathData: (points) => points
      .map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
      .join(" "),
    cgdState: state,
    computeChartVerticalScale: (values, { top, height }) => {
      const minValue = Math.min(0, ...values);
      const maxValue = Math.max(0, ...values);
      const span = maxValue - minValue || 1;
      return {
        minValue,
        maxValue,
        zeroY: top + (maxValue / span) * height,
        yFor: (value) => top + ((maxValue - value) / span) * height
      };
    },
    buildExpenseHistoryMonthKey: (rubricId, expenseId, month) => `${rubricId}::${expenseId}::${month}`,
    document: {
      dispatchEvent: () => {},
      getElementById: (id) => (id === "outcome-evolution-chart" ? outcomeHost : incomeHost)
    },
    emptyValues: () => months.map(() => 0),
    ensurePanelHeadVisible: () => {},
    months,
    requestAnimationFrame: (callback) => callback(),
    renderPanels: () => {
      if (api) {
        api.renderOutcomeEvolutionChart();
      }
    },
    scheduleChartOpenScrollByHostId: () => {},
    window: {},
    chartApi: null
  });

  vm.runInContext(`
    ${expenseNormalizationSource}
    ${buildDataModelSource}
    ${moneySource}
    ${escapeHtmlSource}
    ${outcomeRubricBuilderSource}
    ${outcomeExpenseBuilderSource}
    ${outcomeChartSource}
    ${incomeChartSource}
    ${outcomeToggleSource}
    chartApi = {
      renderIncomeEvolutionChart,
      renderOutcomeEvolutionChart,
      resetOutcomeRubricSelectionToFirst,
      buildDataModel,
      computeOutcomeSeriesAverage,
      formatOutcomeAverageValue,
      parseExpenseValue
    };
  `, context);
  api = context.chartApi;

  return { api, context, incomeHost, outcomeHost, state };
};

const countSeries = (html, kind) => (html.match(new RegExp(`data-series-kind='${kind}'`, "g")) || []).length;
const countPressed = (html, attribute, pressed) => (
  html.match(new RegExp(`${attribute}='[^']+' aria-pressed='${pressed}'`, "g")) || []
).length;
const countAverageLines = (html) => (html.match(/data-outcome-average-line/g) || []).length;
const countNormalLines = (html) => (html.match(/class='outcome-evolution-line'/g) || []).length;
const countAreas = (html) => (html.match(/class='outcome-evolution-area'/g) || []).length;
const extractPointValues = (html) => Array.from(
  html.matchAll(/class='outcome-evolution-point'[^>]*data-value='([^']+)'/g),
  (match) => Number(match[1])
);
const extractAverageValue = (html) => {
  const match = html.match(/data-average-value='([^']+)'/);
  return match ? Number(match[1]) : null;
};
const assertAverageLine = (html, { kind, key, color, value }) => {
  const formattedValue = Number(value).toFixed(2);
  assert.equal(countAverageLines(html), 1);
  assert.match(html, new RegExp(`data-average-source-kind='${kind}'`));
  assert.match(html, new RegExp(`data-average-source-key='${key}'`));
  assert.match(html, new RegExp(`data-outcome-average-line[\\s\\S]*stroke='${color}'`));
  assert.match(html, /stroke-dasharray='8 6'/);
  assert.match(html, /vector-effect='non-scaling-stroke'/);
  assert.match(html, /data-outcome-average-label/);
  assert.match(html, /aria-label='Média - /);
  assert.match(html, new RegExp(`: ${formattedValue.replace(".", "\\.")}\\. Usa valores estimados`));
  assert.match(html, new RegExp(`>Média: ${formattedValue.replace(".", "\\.")}</span>`));
  assert.doesNotMatch(html, new RegExp(`Média[^<']*[0-9],[0-9]{3}\\.${formattedValue.slice(-2)}`));
  assert.match(html, /Usa valores estimados nos meses sem valor real/);
  assert.ok(Math.abs(extractAverageValue(html) - value) < 1e-12);
  const coordinates = html.match(/data-outcome-average-line[\s\S]*?y1='([^']+)'[\s\S]*?y2='([^']+)'/);
  assert.ok(coordinates);
  assert.equal(coordinates[1], coordinates[2]);
};

const assertCollapsedToggle = (html) => {
  assert.match(html, /data-outcome-expense-detail-toggle/);
  assert.match(html, /aria-expanded='false'/);
  assert.match(html, />Mostrar despesas<\/button>/);
};

const explicit = makeContext({ explicitDetail: true, outcomeChartVisible: false });
explicit.context.window.cgdToggleOutcomeChart();
assert.equal(countSeries(explicit.outcomeHost.html, "rubric"), 1);
assert.equal(countSeries(explicit.outcomeHost.html, "expense"), 0);
assert.match(explicit.outcomeHost.html, /data-series-key='id-11'/);
assert.doesNotMatch(explicit.outcomeHost.html, /data-series-key='id-22'/);
assert.equal(countPressed(explicit.outcomeHost.html, "data-outcome-chart-toggle", "true"), 1);
assert.equal(countPressed(explicit.outcomeHost.html, "data-outcome-chart-toggle", "false"), 1);
assertCollapsedToggle(explicit.outcomeHost.html);
assertAverageLine(explicit.outcomeHost.html, {
  kind: "rubric",
  key: "id-11",
  color: "#111111",
  value: 305.5
});
assert.equal(countNormalLines(explicit.outcomeHost.html), 1);
assert.equal(countAreas(explicit.outcomeHost.html), 1);
assert.equal(explicit.state.outcomeChartHiddenRubrics.size, 1);

explicit.outcomeHost.click("data-outcome-expense-detail-toggle");
assert.equal(countSeries(explicit.outcomeHost.html, "rubric"), 0);
assert.equal(countSeries(explicit.outcomeHost.html, "expense"), 1);
assert.doesNotMatch(explicit.outcomeHost.html, /data-series-kind='rubric'/);
assert.match(explicit.outcomeHost.html, /data-series-key='expense-0-0-101'/);
assert.doesNotMatch(explicit.outcomeHost.html, /data-series-key='expense-0-1-102'/);
assert.equal(countPressed(explicit.outcomeHost.html, "data-outcome-drilldown-toggle", "true"), 1);
assert.equal(countPressed(explicit.outcomeHost.html, "data-outcome-drilldown-toggle", "false"), 1);
assert.match(explicit.outcomeHost.html, /aria-expanded='true'/);
assert.match(explicit.outcomeHost.html, />Ocultar despesas<\/button>/);
assert.match(explicit.outcomeHost.html, /Livros/);
assert.match(explicit.outcomeHost.html, /Formacao/);
assert.doesNotMatch(explicit.outcomeHost.html, /Condominio/);
assert.equal(explicit.outcomeHost.focusCount, 1);
assertAverageLine(explicit.outcomeHost.html, {
  kind: "expense",
  key: "expense-0-0-101",
  color: "#333333",
  value: 85.5
});
assert.equal(countNormalLines(explicit.outcomeHost.html), 1);
assert.equal(countAreas(explicit.outcomeHost.html), 1);
assert.equal(explicit.state.outcomeDrilldownHiddenExpenses.size, 1);

explicit.outcomeHost.click("data-outcome-drilldown-toggle", "expense-0-1-102");
assert.equal(countSeries(explicit.outcomeHost.html, "expense"), 2);
assert.equal(countPressed(explicit.outcomeHost.html, "data-outcome-drilldown-toggle", "true"), 2);
assert.equal(countAverageLines(explicit.outcomeHost.html), 0);
explicit.outcomeHost.click("data-outcome-drilldown-toggle", "expense-0-0-101");
assert.equal(countSeries(explicit.outcomeHost.html, "expense"), 1);
assert.match(explicit.outcomeHost.html, /data-series-key='expense-0-1-102'/);
assertAverageLine(explicit.outcomeHost.html, {
  kind: "expense",
  key: "expense-0-1-102",
  color: "#444444",
  value: 125.5
});

explicit.outcomeHost.click("data-outcome-expense-detail-toggle");
assert.equal(countSeries(explicit.outcomeHost.html, "rubric"), 1);
assert.equal(countSeries(explicit.outcomeHost.html, "expense"), 0);
assertCollapsedToggle(explicit.outcomeHost.html);
assert.equal(explicit.outcomeHost.focusCount, 2);
assertAverageLine(explicit.outcomeHost.html, {
  kind: "rubric",
  key: "id-11",
  color: "#111111",
  value: 305.5
});

explicit.outcomeHost.click("data-outcome-expense-detail-toggle");
assert.equal(countSeries(explicit.outcomeHost.html, "rubric"), 0);
assert.equal(countSeries(explicit.outcomeHost.html, "expense"), 1);
assert.match(explicit.outcomeHost.html, /data-series-key='expense-0-0-101'/);
assert.doesNotMatch(explicit.outcomeHost.html, /data-series-key='expense-0-1-102'/);
assertAverageLine(explicit.outcomeHost.html, {
  kind: "expense",
  key: "expense-0-0-101",
  color: "#333333",
  value: 85.5
});

explicit.outcomeHost.click("data-outcome-expense-detail-toggle");
explicit.outcomeHost.click("data-outcome-chart-toggle", "id-22");
assert.equal(countSeries(explicit.outcomeHost.html, "rubric"), 2);
assert.equal(countPressed(explicit.outcomeHost.html, "data-outcome-chart-toggle", "true"), 2);
assert.equal(explicit.state.outcomeChartExpenseDetailVisible, false);
assert.equal(countAverageLines(explicit.outcomeHost.html), 0);
explicit.outcomeHost.click("data-outcome-chart-toggle", "id-11");
assert.equal(countSeries(explicit.outcomeHost.html, "rubric"), 1);
assert.match(explicit.outcomeHost.html, /data-series-key='id-22'/);
assert.equal(countPressed(explicit.outcomeHost.html, "data-outcome-chart-toggle", "true"), 1);
assertCollapsedToggle(explicit.outcomeHost.html);
assertAverageLine(explicit.outcomeHost.html, {
  kind: "rubric",
  key: "id-22",
  color: "#222222",
  value: 705.5
});

explicit.outcomeHost.click("data-outcome-expense-detail-toggle");
assert.equal(countSeries(explicit.outcomeHost.html, "rubric"), 0);
assert.equal(countSeries(explicit.outcomeHost.html, "expense"), 1);
assert.match(explicit.outcomeHost.html, /Condominio/);
assert.doesNotMatch(explicit.outcomeHost.html, /Livros/);
assertAverageLine(explicit.outcomeHost.html, {
  kind: "expense",
  key: "expense-1-0-201",
  color: "#333333",
  value: 65.5
});
explicit.outcomeHost.click("data-outcome-drilldown-toggle", "expense-1-0-201");
assert.equal(countSeries(explicit.outcomeHost.html, "expense"), 0);
assert.equal(countAverageLines(explicit.outcomeHost.html), 0);
explicit.outcomeHost.click("data-outcome-drilldown-toggle", "expense-1-0-201");
assertAverageLine(explicit.outcomeHost.html, {
  kind: "expense",
  key: "expense-1-0-201",
  color: "#333333",
  value: 65.5
});
explicit.outcomeHost.click("data-outcome-chart-close-main");
assert.equal(explicit.state.outcomeChartVisible, false);
assert.equal(explicit.state.outcomeChartExpenseDetailVisible, false);
assert.equal(explicit.outcomeHost.html, "");
explicit.context.window.cgdToggleOutcomeChart();
assert.equal(explicit.state.outcomeChartVisible, true);
assert.equal(countSeries(explicit.outcomeHost.html, "rubric"), 1);
assert.equal(countSeries(explicit.outcomeHost.html, "expense"), 0);
assert.match(explicit.outcomeHost.html, /data-series-key='id-11'/);
assert.equal(countPressed(explicit.outcomeHost.html, "data-outcome-chart-toggle", "true"), 1);
assertAverageLine(explicit.outcomeHost.html, {
  kind: "rubric",
  key: "id-11",
  color: "#111111",
  value: 305.5
});

const reorderedData = makeData();
reorderedData.outcome.reverse();
explicit.state.data = reorderedData;
explicit.api.resetOutcomeRubricSelectionToFirst();
explicit.api.renderOutcomeEvolutionChart();
assert.equal(countSeries(explicit.outcomeHost.html, "rubric"), 1);
assert.match(explicit.outcomeHost.html, /data-series-key='id-22'/);
assert.doesNotMatch(explicit.outcomeHost.html, /data-series-key='id-11'/);
assert.equal(explicit.state.outcomeChartExpenseDetailVisible, false);
assertAverageLine(explicit.outcomeHost.html, {
  kind: "rubric",
  key: "id-22",
  color: "#111111",
  value: 705.5
});

const dataWithInvalidFirstRubric = makeData();
dataWithInvalidFirstRubric.outcome.unshift({
  id: 5,
  name: "Sem valores",
  values: zeroValues(),
  expenses: []
});
const firstValidRubric = makeContext({
  explicitDetail: true,
  outcomeChartVisible: false,
  data: dataWithInvalidFirstRubric
});
firstValidRubric.context.window.cgdToggleOutcomeChart();
assert.equal(countSeries(firstValidRubric.outcomeHost.html, "rubric"), 1);
assert.match(firstValidRubric.outcomeHost.html, /data-series-key='id-11'/);
assert.doesNotMatch(firstValidRubric.outcomeHost.html, /data-series-key='id-5'/);

const emptyItems = makeContext({
  explicitDetail: true,
  outcomeChartVisible: false,
  data: {
    income: [],
    savings: [],
    outcome: [{
      id: 33,
      name: "Sem detalhe",
      values: monthValues(50),
      expenses: [{ id: 301, name: "Sem valores", values: zeroValues() }]
    }]
  }
});
emptyItems.context.window.cgdToggleOutcomeChart();
assert.equal(countSeries(emptyItems.outcomeHost.html, "rubric"), 1);
assert.equal(countSeries(emptyItems.outcomeHost.html, "expense"), 0);
assert.doesNotMatch(emptyItems.outcomeHost.html, /data-outcome-expense-detail-toggle/);
assertAverageLine(emptyItems.outcomeHost.html, {
  kind: "rubric",
  key: "id-33",
  color: "#111111",
  value: 55.5
});

const malicious = makeContext({
  explicitDetail: true,
  outcomeChartVisible: false,
  data: {
    income: [],
    savings: [],
    outcome: [{
      id: 44,
      name: "Casa <img src=x onerror=alert(1)>",
      values: monthValues(90),
      expenses: [{
        id: 401,
        name: "Item '><svg onload=alert(2)>",
        values: monthValues(10)
      }]
    }]
  }
});
malicious.context.window.cgdToggleOutcomeChart();
assert.match(malicious.outcomeHost.html, /Casa &lt;img/);
assert.doesNotMatch(malicious.outcomeHost.html, /<img/);
assert.match(malicious.outcomeHost.html, /aria-label='Média - Casa &lt;img/);
malicious.outcomeHost.click("data-outcome-expense-detail-toggle");
assert.equal(countSeries(malicious.outcomeHost.html, "rubric"), 0);
assert.equal(countSeries(malicious.outcomeHost.html, "expense"), 1);
assert.match(malicious.outcomeHost.html, /Item &#39;&gt;&lt;svg/);
assert.doesNotMatch(malicious.outcomeHost.html, /<svg onload/);
assert.match(malicious.outcomeHost.html, /aria-label='Média - Item &#39;&gt;&lt;svg/);

const emptySeries = makeContext({
  explicitDetail: true,
  outcomeChartVisible: false,
  data: {
    income: [],
    savings: [],
    outcome: [{
      id: 55,
      name: "Sem valores",
      values: zeroValues(),
      expenses: []
    }]
  }
});
emptySeries.context.window.cgdToggleOutcomeChart();
assert.equal(countSeries(emptySeries.outcomeHost.html, "rubric"), 0);
assert.equal(countSeries(emptySeries.outcomeHost.html, "expense"), 0);
assert.match(emptySeries.outcomeHost.html, /Ainda nao existem valores totalizadores/);
assert.equal(countAverageLines(emptySeries.outcomeHost.html), 0);

const zeroMean = makeContext({
  explicitDetail: true,
  outcomeChartVisible: false,
  data: {
    income: [],
    savings: [],
    outcome: [{
      id: 66,
      name: "Media zero",
      values: [10, -10, ...months.slice(2).map(() => 0)],
      expenses: []
    }]
  }
});
zeroMean.context.window.cgdToggleOutcomeChart();
assertAverageLine(zeroMean.outcomeHost.html, {
  kind: "rubric",
  key: "id-66",
  color: "#111111",
  value: 0
});

const largeAverage = makeContext({
  explicitDetail: true,
  outcomeChartVisible: false,
  data: {
    income: [],
    savings: [],
    outcome: [{
      id: 67,
      name: "Media grande",
      values: months.map(() => 1234.5),
      expenses: []
    }]
  }
});
largeAverage.context.window.cgdToggleOutcomeChart();
assertAverageLine(largeAverage.outcomeHost.html, {
  kind: "rubric",
  key: "id-67",
  color: "#111111",
  value: 1234.5
});
assert.match(largeAverage.outcomeHost.html, /data-value='1234.50'/);
assert.doesNotMatch(largeAverage.outcomeHost.html, /1,234\.50/);

const negativeAverage = makeContext({
  explicitDetail: true,
  outcomeChartVisible: false,
  data: {
    income: [],
    savings: [],
    outcome: [{
      id: 68,
      name: "Media negativa",
      values: months.map(() => -1234.5),
      expenses: []
    }]
  }
});
negativeAverage.context.window.cgdToggleOutcomeChart();
assertAverageLine(negativeAverage.outcomeHost.html, {
  kind: "rubric",
  key: "id-68",
  color: "#111111",
  value: -1234.5
});

assert.equal(explicit.api.formatOutcomeAverageValue(96.25), "96.25");
assert.equal(explicit.api.formatOutcomeAverageValue(1234.5), "1234.50");
assert.equal(explicit.api.formatOutcomeAverageValue(12345678.9), "12345678.90");
assert.equal(explicit.api.formatOutcomeAverageValue(0), "0.00");
assert.equal(explicit.api.formatOutcomeAverageValue(-1234.5), "-1234.50");
assert.equal(explicit.api.formatOutcomeAverageValue(Number.NaN), "0.00");
assert.equal(explicit.api.formatOutcomeAverageValue(Number.POSITIVE_INFINITY), "0.00");

const normalizedRows = [
  { valor: 100, valor_estimado: 999 },
  { valor: 0, valor_estimado: 50 },
  { valor: 0, valor_estimado: null },
  { valor: 0, valor_Estimado: -20 },
  { valor: 0, valor_estimado: 0 },
  { valor: null, valor_estimado: 30 },
  { valor: " ", valor_estimado: 40 },
  { valor: "not-a-number", valor_estimado: 45 },
  { valor: 0, valor_estimado: "not-a-number" },
  { valor: 5, valor_estimado: -99 },
  { valor: -10, valor_estimado: 99 },
  { valor: 0, valor_estimado: "" }
];
const secondExpenseRows = [
  { valor: 0, valor_estimado: 10 },
  { valor: 20, valor_estimado: 30 },
  { valor: 0, valor_estimado: -5 },
  ...months.slice(3).map(() => ({ valor: 0, valor_estimado: 0 }))
];
const fallbackContext = makeContext({
  explicitDetail: true,
  outcomeChartVisible: false,
  data: { income: [], savings: [], outcome: [] }
});
const normalizedModel = fallbackContext.api.buildDataModel(
  [{ rubrica_id: 77, rubrica_desc: "Fallback mensal", rubrica_tipo: "Despesa", rubrica_seq: 1, mes: 1 }],
  [
    ...normalizedRows.map((row, index) => ({
      ...row,
      ano: 2026,
      mes: index + 1,
      rubrica_id: 77,
      despesa_id: 701,
      despesa_desc: "Item misto",
      despesa_seq: 1,
      totalizador: true
    })),
    ...secondExpenseRows.map((row, index) => ({
      ...row,
      ano: 2026,
      mes: index + 1,
      rubrica_id: 77,
      despesa_id: 702,
      despesa_desc: "Item agregado",
      despesa_seq: 2,
      totalizador: true
    }))
  ]
);
const expectedFirstExpenseValues = [100, 50, 0, -20, 0, 30, 40, 45, 0, 5, -10, 0];
const expectedSecondExpenseValues = [10, 20, -5, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const expectedRubricValues = [110, 70, -5, -20, 0, 30, 40, 45, 0, 5, -10, 0];
assert.deepEqual(Array.from(normalizedModel.outcome[0].expenses[0].values), expectedFirstExpenseValues);
assert.deepEqual(Array.from(normalizedModel.outcome[0].expenses[1].values), expectedSecondExpenseValues);
assert.deepEqual(Array.from(normalizedModel.outcome[0].values), expectedRubricValues);
assert.equal(fallbackContext.api.parseExpenseValue({ valor: 0, valor_Estimado: -20 }), -20);
assert.equal(fallbackContext.api.parseExpenseValue({ valor: 0, valor_estimado: 0 }), 0);
assert.equal(fallbackContext.api.parseExpenseValue({ valor: null, valor_estimado: 30 }), 30);
assert.equal(fallbackContext.api.parseExpenseValue({ valor: " ", valor_estimado: 40 }), 40);
assert.equal(fallbackContext.api.parseExpenseValue({ valor: "invalid", valor_estimado: 45 }), 45);
assert.equal(fallbackContext.api.parseExpenseValue({ valor: 0, valor_estimado: "invalid" }), 0);

fallbackContext.state.data = normalizedModel;
fallbackContext.context.window.cgdToggleOutcomeChart();
assert.deepEqual(extractPointValues(fallbackContext.outcomeHost.html), expectedRubricValues);
assertAverageLine(fallbackContext.outcomeHost.html, {
  kind: "rubric",
  key: "id-77",
  color: "#111111",
  value: 265 / 12
});
assert.equal(countNormalLines(fallbackContext.outcomeHost.html), 1);
assert.equal(countAreas(fallbackContext.outcomeHost.html), 1);
fallbackContext.outcomeHost.click("data-outcome-expense-detail-toggle");
assert.deepEqual(extractPointValues(fallbackContext.outcomeHost.html), expectedFirstExpenseValues);
assertAverageLine(fallbackContext.outcomeHost.html, {
  kind: "expense",
  key: "expense-0-0-701",
  color: "#333333",
  value: 20
});
fallbackContext.outcomeHost.click("data-outcome-drilldown-toggle", "expense-0-1-702");
assert.equal(countAverageLines(fallbackContext.outcomeHost.html), 0);
fallbackContext.outcomeHost.click("data-outcome-drilldown-toggle", "expense-0-0-701");
assert.deepEqual(extractPointValues(fallbackContext.outcomeHost.html), expectedSecondExpenseValues);
assertAverageLine(fallbackContext.outcomeHost.html, {
  kind: "expense",
  key: "expense-0-1-702",
  color: "#444444",
  value: 25 / 12
});

const sharedOpening = makeContext({
  explicitDetail: false,
  outcomeChartVisible: false
});
sharedOpening.context.window.cgdToggleOutcomeChart();
assert.equal(countSeries(sharedOpening.outcomeHost.html, "rubric"), 2);
assert.equal(countSeries(sharedOpening.outcomeHost.html, "expense"), 0);
assert.equal(countAverageLines(sharedOpening.outcomeHost.html), 0);

const sharedLegacy = makeContext({
  explicitDetail: false,
  data: {
    income: [],
    savings: [],
    outcome: [makeData().outcome[0]]
  }
});
sharedLegacy.api.renderOutcomeEvolutionChart();
assert.equal(countSeries(sharedLegacy.outcomeHost.html, "rubric"), 0);
assert.equal(countSeries(sharedLegacy.outcomeHost.html, "expense"), 2);
assert.doesNotMatch(sharedLegacy.outcomeHost.html, /data-outcome-expense-detail-toggle/);
assert.equal(countAverageLines(sharedLegacy.outcomeHost.html), 0);

sharedLegacy.api.renderIncomeEvolutionChart();
assert.match(sharedLegacy.incomeHost.html, /data-series-name='Salario'/);
assert.doesNotMatch(sharedLegacy.incomeHost.html, /data-series-name='Receitas'/);
assert.doesNotMatch(sharedLegacy.incomeHost.html, /data-outcome-average/);

assert.match(novoBancoHtml, /DASHBOARD_EXPLICIT_OUTCOME_EXPENSE_DETAIL = true/);
assert.match(novoBancoHtml, /assets\/js\/cgd\.js\?v=20260812-4/);
assert.match(novoBancoHtml, /assets\/css\/styles\.css\?v=20260812-1/);
assert.doesNotMatch(cgdHtml, /DASHBOARD_EXPLICIT_OUTCOME_EXPENSE_DETAIL/);
assert.doesNotMatch(coverflexHtml, /DASHBOARD_EXPLICIT_OUTCOME_EXPENSE_DETAIL/);
assert.doesNotMatch(cgdHtml, /20260812-1/);
assert.doesNotMatch(coverflexHtml, /20260812-1/);
assert.doesNotMatch(cgdHtml, /20260812-2/);
assert.doesNotMatch(coverflexHtml, /20260812-2/);
assert.doesNotMatch(cgdHtml, /20260812-4/);
assert.doesNotMatch(coverflexHtml, /20260812-4/);
assert.match(styles, /\.outcome-evolution-tooltip-series\s*\{\s*font-size:\s*0\.73rem;/);
const averageTextTag = cgd.match(/<span\s+[^>]*data-outcome-average-label[^>]*>/)?.[0] || "";
assert.match(averageTextTag, /class='outcome-evolution-tooltip-series'/);
assert.doesNotMatch(averageTextTag, /font-size=|font-weight=|font-style=|paint-order=|stroke=/);
assert.match(cgd, /data-outcome-average-label-row aria-hidden='true'/);
assert.match(styles, /\.nb-theme \.outcome-expense-detail-toggle,[\s\S]*min-height: 44px;/);
assert.match(styles, /\.nb-theme \.outcome-expense-detail-toggle:focus-visible/);
assert.ok(
  (
    cgd.match(
      /resetOutcomeRubricSelectionToFirst\(\);\s*resetOutcomeComparisonRubricSelectionToFirst\(\);\s*renderPanels\(\);/g
    ) || []
  ).length >= 3,
  "Every year-load render path must reset to the first valid rubric"
);

console.log("Outcome expense detail regression checks passed.");
