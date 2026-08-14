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
const chartBuildersSource = sliceBetween(
  cgd,
  "function buildOutcomeRubricSeries()",
  "\nfunction bindIncomeChartInteractions("
);
const outcomeChartSource = sliceBetween(
  cgd,
  "function resetOutcomeExpenseDetail()",
  "\nfunction renderPanels()"
);
const incomeChartSource = sliceBetween(
  cgd,
  "function bindIncomeChartInteractions(",
  "\nfunction bindSavingsChartInteractions("
);
const savingsChartSource = sliceBetween(
  cgd,
  "function bindSavingsChartInteractions(",
  "\nfunction resetOutcomeExpenseDetail("
);
const incomeToggleSource = sliceBetween(
  cgd,
  "window.cgdToggleIncomeChart =",
  "\nwindow.cgdToggleIncomeComparisonChart ="
);
const outcomeToggleSource = sliceBetween(
  cgd,
  "window.cgdToggleOutcomeChart =",
  "\nwindow.cgdToggleOutcomeComparisonChart ="
);
const savingsToggleSource = sliceBetween(
  cgd,
  "window.cgdToggleSavingsChart =",
  "\nwindow.cgdToggleSavingsComparisonChart ="
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
    if (
      [
        "[data-outcome-expense-detail-toggle]",
        "[data-income-revenue-detail-toggle]",
        "[data-savings-saving-detail-toggle]"
      ].includes(selector)
      && this.html.includes(selector.slice(1, -1))
    ) {
      return {
        focus: () => {
          this.focusCount += 1;
        }
      };
    }
    return null;
  }

  querySelectorAll(selector) {
    const attribute = selector.match(/^\[([^\]]+)\]$/)?.[1];
    if (!["data-outcome-chart-toggle", "data-income-chart-toggle", "data-savings-chart-toggle"].includes(attribute)) {
      return [];
    }

    return Array.from(this.html.matchAll(new RegExp(`${attribute}='([^']+)'`, "g")), (match) => ({
      getAttribute: (name) => (name === attribute ? match[1] : null)
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
  income: [
    {
      id: 31,
      name: "Salarios",
      values: monthValues(2000),
      expenses: [
        { id: 301, name: "Ordenado", values: monthValues(1000) },
        { id: 302, name: "Bonus", values: monthValues(200) }
      ]
    },
    {
      id: 32,
      name: "Rendas",
      values: monthValues(500),
      expenses: [
        { id: 303, name: "Apartamento", values: monthValues(400) }
      ]
    }
  ],
  savings: [
    {
      id: 41,
      name: "Reserva",
      values: monthValues(800),
      expenses: [
        { id: 401, name: "Conta reserva", values: monthValues(600) },
        { id: 402, name: "Objetivo", values: monthValues(100) }
      ]
    },
    {
      id: 42,
      name: "Ferias",
      values: monthValues(300),
      expenses: [
        { id: 403, name: "Viagem", values: monthValues(250) }
      ]
    }
  ],
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

const makeContext = ({
  explicitDetail,
  incomeExplicitDetail = explicitDetail,
  savingsExplicitDetail = explicitDetail,
  data = makeData(),
  outcomeChartVisible = true,
  incomeChartVisible = true,
  savingsChartVisible = true
}) => {
  const outcomeHost = new FakeHost();
  const incomeHost = new FakeHost();
  const savingsHost = new FakeHost();
  const state = {
    data,
    outcomeChartVisible,
    outcomeChartHiddenRubrics: new Set(),
    outcomeChartSelectedRubricKey: null,
    outcomeChartExpenseDetailVisible: false,
    outcomeChartExpenseDetailRubricKey: null,
    outcomeDrilldownHiddenExpenses: new Set(),
    incomeChartVisible,
    incomeChartHiddenRubrics: new Set(),
    incomeChartSelectedRubricKey: null,
    incomeChartRevenueDetailVisible: false,
    incomeChartRevenueDetailRubricKey: null,
    incomeDrilldownHiddenExpenses: new Set(),
    savingsChartVisible,
    savingsChartHiddenRubrics: new Set(),
    savingsChartSelectedRubricKey: null,
    savingsChartDetailVisible: false,
    savingsChartDetailRubricKey: null,
    savingsDrilldownHiddenExpenses: new Set()
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
    HIDE_SAVINGS: false,
    THEME_COLORS: {
      incomeRubrics: ["#115511", "#226622"],
      incomeExpenses: ["#337733", "#448844", "#559955"],
      savingsRubrics: ["#115", "#226"],
      savingsExpenses: ["#337", "#448", "#559"],
      outcomeRubrics: ["#111111", "#222222"],
      outcomeExpenses: ["#333333", "#444444", "#555555"]
    },
    bindOutcomeChartHover: () => {},
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
      getElementById: (id) => {
        if (id === "outcome-evolution-chart") {
          return outcomeHost;
        }
        if (id === "savings-evolution-chart") {
          return savingsHost;
        }
        return incomeHost;
      }
    },
    emptyValues: () => months.map(() => 0),
    ensurePanelHeadVisible: () => {},
    isExplicitChartDetailEnabled: (kind) => (
      kind === "income"
        ? incomeExplicitDetail
        : kind === "savings"
          ? savingsExplicitDetail
          : explicitDetail
    ),
    months,
    requestAnimationFrame: (callback) => callback(),
    renderPanels: () => {
      if (api) {
        api.renderOutcomeEvolutionChart();
        api.renderIncomeEvolutionChart();
        api.renderSavingsEvolutionChart();
      }
    },
    scheduleChartOpenScroll: () => {},
    scheduleChartOpenScrollByHostId: () => {},
    window: {},
    chartApi: null
  });

  vm.runInContext(`
    ${expenseNormalizationSource}
    ${buildDataModelSource}
    ${moneySource}
    ${escapeHtmlSource}
    ${chartBuildersSource}
    ${incomeChartSource}
    ${savingsChartSource}
    ${outcomeChartSource}
    ${incomeToggleSource}
    ${savingsToggleSource}
    ${outcomeToggleSource}
    chartApi = {
      renderIncomeEvolutionChart,
      renderSavingsEvolutionChart,
      renderOutcomeEvolutionChart,
      resetIncomeRubricSelectionToFirst,
      resetSavingsRubricSelectionToFirst,
      resetOutcomeRubricSelectionToFirst,
      buildDataModel,
      computeEvolutionSeriesAverage,
      formatOutcomeAverageValue,
      parseExpenseValue
    };
  `, context);
  api = context.chartApi;

  return { api, context, incomeHost, outcomeHost, savingsHost, state };
};

const countSeries = (html, kind) => (html.match(new RegExp(`data-series-kind='${kind}'`, "g")) || []).length;
const countPressed = (html, attribute, pressed) => (
  html.match(new RegExp(`${attribute}='[^']+' aria-pressed='${pressed}'`, "g")) || []
).length;
const countAverageLines = (html, namespace = "outcome") => (
  html.match(new RegExp(`data-${namespace}-average-line`, "g")) || []
).length;
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
const assertAverageLine = (html, { kind, key, color, value, namespace = "outcome" }) => {
  const formattedValue = Number(value).toFixed(2);
  assert.equal(countAverageLines(html, namespace), 1);
  assert.match(html, new RegExp(`data-average-source-kind='${kind}'`));
  assert.match(html, new RegExp(`data-average-source-key='${key}'`));
  assert.match(html, new RegExp(`data-${namespace}-average-line[\\s\\S]*stroke='${color}'`));
  assert.match(html, /stroke-dasharray='8 6'/);
  assert.match(html, /vector-effect='non-scaling-stroke'/);
  assert.match(html, new RegExp(`data-${namespace}-average-label`));
  assert.match(html, /aria-label='Média - /);
  assert.match(html, new RegExp(`: ${formattedValue.replace(".", "\\.")}\\. Usa valores estimados`));
  assert.match(html, new RegExp(`>Média: ${formattedValue.replace(".", "\\.")}</span>`));
  assert.doesNotMatch(html, new RegExp(`Média[^<']*[0-9],[0-9]{3}\\.${formattedValue.slice(-2)}`));
  assert.match(html, /Usa valores estimados nos meses sem valor real/);
  assert.ok(Math.abs(extractAverageValue(html) - value) < 1e-12);
  const coordinates = html.match(
    new RegExp(`data-${namespace}-average-line[\\s\\S]*?y1='([^']+)'[\\s\\S]*?y2='([^']+)'`)
  );
  assert.ok(coordinates);
  assert.equal(coordinates[1], coordinates[2]);
};

const assertCollapsedToggle = (html) => {
  assert.match(html, /data-outcome-expense-detail-toggle/);
  assert.match(html, /aria-expanded='false'/);
  assert.match(html, />Mostrar despesas<\/button>/);
};

const assertCollapsedRevenueToggle = (html) => {
  assert.match(html, /data-income-revenue-detail-toggle/);
  assert.match(html, /aria-expanded='false'/);
  assert.match(html, /aria-controls='income-revenue-detail-series'/);
  assert.match(html, />Mostrar receitas<\/button>/);
  assert.match(html, /id='income-revenue-detail-series'[^>]*\shidden(?:\s|>)/);
  assert.doesNotMatch(html, />Mostrar despesas<\/button>|>Ocultar despesas<\/button>/);
};

const assertCollapsedSavingToggle = (html) => {
  assert.match(html, /data-savings-saving-detail-toggle/);
  assert.match(html, /aria-expanded='false'/);
  assert.match(html, /aria-controls='savings-saving-detail-series'/);
  assert.match(html, />Mostrar poupanças<\/button>/);
  assert.match(html, /id='savings-saving-detail-series'[^>]*\shidden(?:\s|>)/);
  assert.doesNotMatch(html, />Mostrar despesas<\/button>|>Mostrar receitas<\/button>/);
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

const incomeExplicit = makeContext({
  explicitDetail: true,
  incomeChartVisible: false
});
incomeExplicit.state.outcomeChartHiddenRubrics.add("id-22");
incomeExplicit.state.outcomeChartSelectedRubricKey = "id-11";
incomeExplicit.state.outcomeChartExpenseDetailVisible = true;
incomeExplicit.state.outcomeChartExpenseDetailRubricKey = "id-11";
incomeExplicit.state.outcomeDrilldownHiddenExpenses.add("id-11::expense-0-1-102");
incomeExplicit.api.renderOutcomeEvolutionChart();
const outcomeStateBeforeIncome = {
  visible: incomeExplicit.state.outcomeChartVisible,
  selected: incomeExplicit.state.outcomeChartSelectedRubricKey,
  detailVisible: incomeExplicit.state.outcomeChartExpenseDetailVisible,
  detailKey: incomeExplicit.state.outcomeChartExpenseDetailRubricKey,
  hiddenRubrics: Array.from(incomeExplicit.state.outcomeChartHiddenRubrics),
  hiddenExpenses: Array.from(incomeExplicit.state.outcomeDrilldownHiddenExpenses)
};

incomeExplicit.context.window.cgdToggleIncomeChart();
assert.equal(incomeExplicit.state.incomeChartVisible, true);
assert.equal(countSeries(incomeExplicit.incomeHost.html, "rubric"), 1);
assert.equal(countSeries(incomeExplicit.incomeHost.html, "expense"), 0);
assert.match(incomeExplicit.incomeHost.html, /data-series-key='id-31'/);
assert.doesNotMatch(incomeExplicit.incomeHost.html, /data-series-key='id-32'/);
assert.equal(countPressed(incomeExplicit.incomeHost.html, "data-income-chart-toggle", "true"), 1);
assert.equal(countPressed(incomeExplicit.incomeHost.html, "data-income-chart-toggle", "false"), 1);
assertCollapsedRevenueToggle(incomeExplicit.incomeHost.html);
assertAverageLine(incomeExplicit.incomeHost.html, {
  namespace: "income",
  kind: "rubric",
  key: "id-31",
  color: "#115511",
  value: 2005.5
});

incomeExplicit.incomeHost.click("data-income-revenue-detail-toggle");
assert.equal(countSeries(incomeExplicit.incomeHost.html, "rubric"), 0);
assert.equal(countSeries(incomeExplicit.incomeHost.html, "expense"), 1);
assert.match(incomeExplicit.incomeHost.html, /data-series-key='expense-0-0-301'/);
assert.doesNotMatch(incomeExplicit.incomeHost.html, /data-series-key='expense-0-1-302'/);
assert.equal(countPressed(incomeExplicit.incomeHost.html, "data-income-drilldown-toggle", "true"), 1);
assert.equal(countPressed(incomeExplicit.incomeHost.html, "data-income-drilldown-toggle", "false"), 1);
assert.match(incomeExplicit.incomeHost.html, /aria-expanded='true'/);
assert.match(incomeExplicit.incomeHost.html, />Ocultar receitas<\/button>/);
assert.doesNotMatch(incomeExplicit.incomeHost.html, />Ocultar despesas<\/button>/);
assert.equal(incomeExplicit.incomeHost.focusCount, 1);
assertAverageLine(incomeExplicit.incomeHost.html, {
  namespace: "income",
  kind: "expense",
  key: "expense-0-0-301",
  color: "#337733",
  value: 1005.5
});

incomeExplicit.incomeHost.click("data-income-drilldown-toggle", "expense-0-1-302");
assert.equal(countSeries(incomeExplicit.incomeHost.html, "expense"), 2);
assert.equal(countAverageLines(incomeExplicit.incomeHost.html, "income"), 0);
incomeExplicit.incomeHost.click("data-income-drilldown-toggle", "expense-0-0-301");
assert.equal(countSeries(incomeExplicit.incomeHost.html, "expense"), 1);
assert.match(incomeExplicit.incomeHost.html, /data-series-key='expense-0-1-302'/);
assertAverageLine(incomeExplicit.incomeHost.html, {
  namespace: "income",
  kind: "expense",
  key: "expense-0-1-302",
  color: "#448844",
  value: 205.5
});

incomeExplicit.incomeHost.click("data-income-revenue-detail-toggle");
assert.equal(countSeries(incomeExplicit.incomeHost.html, "rubric"), 1);
assert.equal(countSeries(incomeExplicit.incomeHost.html, "expense"), 0);
assertCollapsedRevenueToggle(incomeExplicit.incomeHost.html);
assert.equal(incomeExplicit.incomeHost.focusCount, 2);
incomeExplicit.incomeHost.click("data-income-revenue-detail-toggle");
assert.match(incomeExplicit.incomeHost.html, /data-series-key='expense-0-0-301'/);
assert.doesNotMatch(incomeExplicit.incomeHost.html, /data-series-key='expense-0-1-302'/);

incomeExplicit.incomeHost.click("data-income-revenue-detail-toggle");
incomeExplicit.incomeHost.click("data-income-chart-toggle", "id-32");
assert.equal(countSeries(incomeExplicit.incomeHost.html, "rubric"), 2);
assert.equal(incomeExplicit.state.incomeChartRevenueDetailVisible, false);
assert.equal(countAverageLines(incomeExplicit.incomeHost.html, "income"), 0);
assert.doesNotMatch(incomeExplicit.incomeHost.html, /data-income-revenue-detail-toggle/);
incomeExplicit.incomeHost.click("data-income-chart-toggle", "id-31");
assert.equal(countSeries(incomeExplicit.incomeHost.html, "rubric"), 1);
assert.match(incomeExplicit.incomeHost.html, /data-series-key='id-32'/);
assertCollapsedRevenueToggle(incomeExplicit.incomeHost.html);
assertAverageLine(incomeExplicit.incomeHost.html, {
  namespace: "income",
  kind: "rubric",
  key: "id-32",
  color: "#226622",
  value: 505.5
});

incomeExplicit.incomeHost.click("data-income-revenue-detail-toggle");
assert.match(incomeExplicit.incomeHost.html, /data-series-key='expense-1-0-303'/);
incomeExplicit.incomeHost.click("data-income-chart-close-main");
assert.equal(incomeExplicit.state.incomeChartVisible, false);
assert.equal(incomeExplicit.state.incomeChartRevenueDetailVisible, false);
assert.equal(incomeExplicit.state.incomeChartHiddenRubrics.size, 0);
assert.equal(incomeExplicit.state.incomeDrilldownHiddenExpenses.size, 0);
assert.equal(incomeExplicit.incomeHost.html, "");
incomeExplicit.context.window.cgdToggleIncomeChart();
assert.equal(countSeries(incomeExplicit.incomeHost.html, "rubric"), 1);
assert.match(incomeExplicit.incomeHost.html, /data-series-key='id-31'/);
assertCollapsedRevenueToggle(incomeExplicit.incomeHost.html);

const reorderedIncome = makeData();
reorderedIncome.income.reverse();
incomeExplicit.state.data = reorderedIncome;
incomeExplicit.api.resetIncomeRubricSelectionToFirst();
incomeExplicit.api.renderIncomeEvolutionChart();
assert.equal(countSeries(incomeExplicit.incomeHost.html, "rubric"), 1);
assert.match(incomeExplicit.incomeHost.html, /data-series-key='id-32'/);
assert.doesNotMatch(incomeExplicit.incomeHost.html, /data-series-key='id-31'/);
assert.equal(incomeExplicit.state.incomeChartRevenueDetailVisible, false);
assertAverageLine(incomeExplicit.incomeHost.html, {
  namespace: "income",
  kind: "rubric",
  key: "id-32",
  color: "#115511",
  value: 505.5
});
assert.deepEqual({
  visible: incomeExplicit.state.outcomeChartVisible,
  selected: incomeExplicit.state.outcomeChartSelectedRubricKey,
  detailVisible: incomeExplicit.state.outcomeChartExpenseDetailVisible,
  detailKey: incomeExplicit.state.outcomeChartExpenseDetailRubricKey,
  hiddenRubrics: Array.from(incomeExplicit.state.outcomeChartHiddenRubrics),
  hiddenExpenses: Array.from(incomeExplicit.state.outcomeDrilldownHiddenExpenses)
}, outcomeStateBeforeIncome);

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

const incomeFallback = makeContext({
  explicitDetail: true,
  incomeChartVisible: false,
  data: { income: [], savings: [], outcome: [] }
});
const normalizedIncomeModel = incomeFallback.api.buildDataModel(
  [{
    rubrica_id: 87,
    rubrica_desc: "Receita mensal",
    rubrica_tipo: "Receita",
    rubrica_seq: 1,
    mes: 1
  }],
  [
    ...normalizedRows.map((row, index) => ({
      ...row,
      ano: 2026,
      mes: index + 1,
      rubrica_id: 87,
      despesa_id: 801,
      despesa_desc: "Receita mista",
      despesa_seq: 1,
      totalizador: true
    })),
    ...secondExpenseRows.map((row, index) => ({
      ...row,
      ano: 2026,
      mes: index + 1,
      rubrica_id: 87,
      despesa_id: 802,
      despesa_desc: "Receita nao totalizadora",
      despesa_seq: 2,
      totalizador: false
    }))
  ]
);
assert.deepEqual(Array.from(normalizedIncomeModel.income[0].expenses[0].values), expectedFirstExpenseValues);
assert.deepEqual(Array.from(normalizedIncomeModel.income[0].expenses[1].values), expectedSecondExpenseValues);
assert.deepEqual(Array.from(normalizedIncomeModel.income[0].values), expectedFirstExpenseValues);
incomeFallback.state.data = normalizedIncomeModel;
incomeFallback.context.window.cgdToggleIncomeChart();
assert.deepEqual(extractPointValues(incomeFallback.incomeHost.html), expectedFirstExpenseValues);
assertAverageLine(incomeFallback.incomeHost.html, {
  namespace: "income",
  kind: "rubric",
  key: "id-87",
  color: "#115511",
  value: 20
});
incomeFallback.incomeHost.click("data-income-revenue-detail-toggle");
assert.deepEqual(extractPointValues(incomeFallback.incomeHost.html), expectedFirstExpenseValues);
assertAverageLine(incomeFallback.incomeHost.html, {
  namespace: "income",
  kind: "expense",
  key: "expense-0-0-801",
  color: "#337733",
  value: 20
});

const incomeEmptyItems = makeContext({
  explicitDetail: true,
  incomeChartVisible: false,
  data: {
    income: [{
      id: 91,
      name: "Sem detalhe",
      values: monthValues(50),
      expenses: [{ id: 901, name: "Sem valores", values: zeroValues() }]
    }],
    savings: [],
    outcome: []
  }
});
incomeEmptyItems.context.window.cgdToggleIncomeChart();
assert.equal(countSeries(incomeEmptyItems.incomeHost.html, "rubric"), 1);
assert.doesNotMatch(incomeEmptyItems.incomeHost.html, /data-income-revenue-detail-toggle/);

const incomeUnnamedItem = makeContext({
  explicitDetail: true,
  incomeChartVisible: false,
  data: {
    income: [{
      id: 93,
      name: "Receita sem nome interno",
      values: monthValues(70),
      expenses: [{ id: 903, name: "", values: monthValues(70) }]
    }],
    savings: [],
    outcome: []
  }
});
incomeUnnamedItem.context.window.cgdToggleIncomeChart();
incomeUnnamedItem.incomeHost.click("data-income-revenue-detail-toggle");
assert.match(incomeUnnamedItem.incomeHost.html, />Receita 1<\/button>/);
assert.doesNotMatch(incomeUnnamedItem.incomeHost.html, />Despesa 1<\/button>/);

const maliciousIncome = makeContext({
  explicitDetail: true,
  incomeChartVisible: false,
  data: {
    income: [{
      id: 92,
      name: "Receita <img src=x onerror=alert(1)>",
      values: monthValues(90),
      expenses: [{
        id: 902,
        name: "Item '><svg onload=alert(2)>",
        values: monthValues(10)
      }]
    }],
    savings: [],
    outcome: []
  }
});
maliciousIncome.context.window.cgdToggleIncomeChart();
assert.match(maliciousIncome.incomeHost.html, /Receita &lt;img/);
assert.doesNotMatch(maliciousIncome.incomeHost.html, /<img/);
assert.match(maliciousIncome.incomeHost.html, /aria-label='Média - Receita &lt;img/);
maliciousIncome.incomeHost.click("data-income-revenue-detail-toggle");
assert.match(maliciousIncome.incomeHost.html, /Item &#39;&gt;&lt;svg/);
assert.doesNotMatch(maliciousIncome.incomeHost.html, /<svg onload/);
assert.match(maliciousIncome.incomeHost.html, /aria-label='Média - Item &#39;&gt;&lt;svg/);

const savingsExplicit = makeContext({
  explicitDetail: true,
  savingsChartVisible: false
});
const incomeOutcomeStateBeforeSavings = {
  incomeHidden: Array.from(savingsExplicit.state.incomeChartHiddenRubrics),
  incomeDetail: savingsExplicit.state.incomeChartRevenueDetailVisible,
  outcomeHidden: Array.from(savingsExplicit.state.outcomeChartHiddenRubrics),
  outcomeDetail: savingsExplicit.state.outcomeChartExpenseDetailVisible
};
savingsExplicit.context.window.cgdToggleSavingsChart();
assert.equal(countSeries(savingsExplicit.savingsHost.html, "rubric"), 1);
assert.equal(countSeries(savingsExplicit.savingsHost.html, "expense"), 0);
assert.match(savingsExplicit.savingsHost.html, /data-series-key='id-41'/);
assert.doesNotMatch(savingsExplicit.savingsHost.html, /data-series-key='id-42'/);
assert.equal(countPressed(savingsExplicit.savingsHost.html, "data-savings-chart-toggle", "true"), 1);
assert.equal(countPressed(savingsExplicit.savingsHost.html, "data-savings-chart-toggle", "false"), 1);
assertCollapsedSavingToggle(savingsExplicit.savingsHost.html);
assertAverageLine(savingsExplicit.savingsHost.html, {
  namespace: "savings",
  kind: "rubric",
  key: "id-41",
  color: "#115",
  value: 805.5
});

savingsExplicit.savingsHost.click("data-savings-saving-detail-toggle");
assert.equal(countSeries(savingsExplicit.savingsHost.html, "rubric"), 0);
assert.equal(countSeries(savingsExplicit.savingsHost.html, "expense"), 1);
assert.match(savingsExplicit.savingsHost.html, /data-series-key='expense-0-0-401'/);
assert.doesNotMatch(savingsExplicit.savingsHost.html, /data-series-key='expense-0-1-402'/);
assert.match(savingsExplicit.savingsHost.html, />Ocultar poupanças<\/button>/);
assert.doesNotMatch(savingsExplicit.savingsHost.html, />Ocultar despesas<\/button>|>Ocultar receitas<\/button>/);
assert.equal(countPressed(savingsExplicit.savingsHost.html, "data-savings-drilldown-toggle", "true"), 1);
assert.equal(countPressed(savingsExplicit.savingsHost.html, "data-savings-drilldown-toggle", "false"), 1);
assertAverageLine(savingsExplicit.savingsHost.html, {
  namespace: "savings",
  kind: "expense",
  key: "expense-0-0-401",
  color: "#337",
  value: 605.5
});
savingsExplicit.savingsHost.click("data-savings-drilldown-toggle", "expense-0-1-402");
assert.equal(countSeries(savingsExplicit.savingsHost.html, "expense"), 2);
assert.equal(countAverageLines(savingsExplicit.savingsHost.html, "savings"), 0);
savingsExplicit.savingsHost.click("data-savings-drilldown-toggle", "expense-0-0-401");
assertAverageLine(savingsExplicit.savingsHost.html, {
  namespace: "savings",
  kind: "expense",
  key: "expense-0-1-402",
  color: "#448",
  value: 105.5
});
savingsExplicit.savingsHost.click("data-savings-saving-detail-toggle");
assertCollapsedSavingToggle(savingsExplicit.savingsHost.html);
savingsExplicit.savingsHost.click("data-savings-saving-detail-toggle");
assert.match(savingsExplicit.savingsHost.html, /data-series-key='expense-0-0-401'/);
assert.doesNotMatch(savingsExplicit.savingsHost.html, /data-series-key='expense-0-1-402'/);
savingsExplicit.savingsHost.click("data-savings-saving-detail-toggle");
savingsExplicit.savingsHost.click("data-savings-chart-toggle", "id-42");
assert.equal(countSeries(savingsExplicit.savingsHost.html, "rubric"), 2);
assert.equal(savingsExplicit.state.savingsChartDetailVisible, false);
assert.equal(countAverageLines(savingsExplicit.savingsHost.html, "savings"), 0);
savingsExplicit.savingsHost.click("data-savings-chart-toggle", "id-41");
assert.match(savingsExplicit.savingsHost.html, /data-series-key='id-42'/);
assertCollapsedSavingToggle(savingsExplicit.savingsHost.html);
savingsExplicit.savingsHost.click("data-savings-saving-detail-toggle");
assert.match(savingsExplicit.savingsHost.html, /data-series-key='expense-1-0-403'/);
savingsExplicit.savingsHost.click("data-savings-chart-close-main");
assert.equal(savingsExplicit.state.savingsChartVisible, false);
assert.equal(savingsExplicit.state.savingsChartDetailVisible, false);
assert.equal(savingsExplicit.state.savingsChartHiddenRubrics.size, 0);
assert.equal(savingsExplicit.state.savingsDrilldownHiddenExpenses.size, 0);
savingsExplicit.context.window.cgdToggleSavingsChart();
assert.match(savingsExplicit.savingsHost.html, /data-series-key='id-41'/);
assertCollapsedSavingToggle(savingsExplicit.savingsHost.html);
assert.deepEqual({
  incomeHidden: Array.from(savingsExplicit.state.incomeChartHiddenRubrics),
  incomeDetail: savingsExplicit.state.incomeChartRevenueDetailVisible,
  outcomeHidden: Array.from(savingsExplicit.state.outcomeChartHiddenRubrics),
  outcomeDetail: savingsExplicit.state.outcomeChartExpenseDetailVisible
}, incomeOutcomeStateBeforeSavings);

const savingsFallback = makeContext({
  explicitDetail: true,
  savingsChartVisible: false,
  data: { income: [], savings: [], outcome: [] }
});
const normalizedSavingsModel = savingsFallback.api.buildDataModel(
  [{
    rubrica_id: 97,
    rubrica_desc: "Poupança mensal",
    rubrica_tipo: "Aprovisionamento",
    rubrica_seq: 1,
    mes: 1
  }],
  [
    ...normalizedRows.map((row, index) => ({
      ...row,
      ano: 2026,
      mes: index + 1,
      rubrica_id: 97,
      despesa_id: 901,
      despesa_desc: "Poupança mista",
      despesa_seq: 1,
      totalizador: true
    })),
    ...secondExpenseRows.map((row, index) => ({
      ...row,
      ano: 2026,
      mes: index + 1,
      rubrica_id: 97,
      despesa_id: 902,
      despesa_desc: "Objetivo agregado",
      despesa_seq: 2,
      totalizador: true
    }))
  ]
);
assert.deepEqual(Array.from(normalizedSavingsModel.savings[0].values), expectedRubricValues);
savingsFallback.state.data = normalizedSavingsModel;
savingsFallback.context.window.cgdToggleSavingsChart();
assert.deepEqual(extractPointValues(savingsFallback.savingsHost.html), expectedRubricValues);
assertAverageLine(savingsFallback.savingsHost.html, {
  namespace: "savings",
  kind: "rubric",
  key: "id-97",
  color: "#115",
  value: 265 / 12
});
savingsFallback.savingsHost.click("data-savings-saving-detail-toggle");
assert.deepEqual(extractPointValues(savingsFallback.savingsHost.html), expectedFirstExpenseValues);
assertAverageLine(savingsFallback.savingsHost.html, {
  namespace: "savings",
  kind: "expense",
  key: "expense-0-0-901",
  color: "#337",
  value: 20
});

const savingsSafety = makeContext({
  explicitDetail: true,
  savingsChartVisible: false,
  data: {
    income: [],
    outcome: [],
    savings: [{
      id: 98,
      name: "Reserva <img src=x onerror=alert(1)>",
      values: monthValues(70),
      expenses: [{ id: 903, name: "", values: monthValues(70) }]
    }]
  }
});
savingsSafety.context.window.cgdToggleSavingsChart();
assert.match(savingsSafety.savingsHost.html, /Reserva &lt;img/);
assert.doesNotMatch(savingsSafety.savingsHost.html, /<img/);
savingsSafety.savingsHost.click("data-savings-saving-detail-toggle");
assert.match(savingsSafety.savingsHost.html, />Poupança 1<\/button>/);
assert.doesNotMatch(savingsSafety.savingsHost.html, />Despesa 1<\/button>|>Receita 1<\/button>/);

const savingsEmptyItems = makeContext({
  explicitDetail: true,
  savingsChartVisible: false,
  data: {
    income: [],
    outcome: [],
    savings: [{
      id: 99,
      name: "Sem detalhe",
      values: monthValues(50),
      expenses: [{ id: 904, name: "Sem valores", values: zeroValues() }]
    }]
  }
});
savingsEmptyItems.context.window.cgdToggleSavingsChart();
assert.equal(countSeries(savingsEmptyItems.savingsHost.html, "rubric"), 1);
assert.doesNotMatch(savingsEmptyItems.savingsHost.html, /data-savings-saving-detail-toggle/);

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
    income: [makeData().income[0]],
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
assert.match(sharedLegacy.incomeHost.html, /data-series-name='Ordenado'/);
assert.match(sharedLegacy.incomeHost.html, /data-series-name='Bonus'/);
assert.doesNotMatch(sharedLegacy.incomeHost.html, /data-series-name='Salarios'/);
assert.doesNotMatch(sharedLegacy.incomeHost.html, /data-income-revenue-detail-toggle/);
assert.doesNotMatch(sharedLegacy.incomeHost.html, /data-outcome-average/);
assert.equal(countAverageLines(sharedLegacy.incomeHost.html, "income"), 0);
sharedLegacy.state.savingsDrilldownHiddenExpenses.add("legacy-rubric::legacy-item");
sharedLegacy.context.window.cgdToggleSavingsChart();
assert.deepEqual(
  Array.from(sharedLegacy.state.savingsDrilldownHiddenExpenses),
  ["legacy-rubric::legacy-item"]
);

assert.match(novoBancoHtml, /DASHBOARD_EXPLICIT_CHART_DETAIL_KINDS = \["income", "outcome"\]/);
assert.match(cgdHtml, /DASHBOARD_EXPLICIT_CHART_DETAIL_KINDS = \["income", "savings", "outcome"\]/);
assert.match(coverflexHtml, /DASHBOARD_EXPLICIT_CHART_DETAIL_KINDS = \["income", "outcome"\]/);
assert.match(novoBancoHtml, /assets\/js\/cgd\.js\?v=20260814-2/);
assert.match(novoBancoHtml, /assets\/css\/styles\.css\?v=20260814-2/);
assert.match(coverflexHtml, /assets\/js\/cgd\.js\?v=20260814-2/);
assert.match(coverflexHtml, /assets\/css\/styles\.css\?v=20260814-2/);
for (const source of [novoBancoHtml, coverflexHtml]) {
  assert.match(source, /<body class="[^"]*explicit-chart-detail[^"]*">/);
}
assert.match(cgdHtml, /assets\/js\/cgd\.js\?v=20260814-2/);
assert.match(cgdHtml, /assets\/css\/styles\.css\?v=20260814-2/);
assert.match(cgdHtml, /<body class="[^"]*explicit-chart-detail[^"]*">/);
assert.match(styles, /\.outcome-evolution-tooltip-series\s*\{\s*font-size:\s*0\.73rem;/);
const averageTextTag = cgd.match(/<span\s+[^>]*data-outcome-average-label[^>]*>/)?.[0] || "";
assert.match(averageTextTag, /class='outcome-evolution-tooltip-series'/);
assert.doesNotMatch(averageTextTag, /font-size=|font-weight=|font-style=|paint-order=|stroke=/);
assert.match(cgd, /data-outcome-average-label-row aria-hidden='true'/);
assert.match(styles, /\.explicit-chart-detail \.outcome-expense-detail-toggle,[\s\S]*min-height: 44px;/);
assert.match(styles, /\.explicit-chart-detail \.outcome-expense-detail-toggle:focus-visible/);
assert.doesNotMatch(explicit.outcomeHost.html, /outcome-comparison-toolbar/);
assert.ok(
  (
    cgd.match(
      /resetSavingsRubricSelectionToFirst\(\);\s*resetSavingsComparisonRubricSelectionToFirst\(\);\s*resetOutcomeRubricSelectionToFirst\(\);\s*resetOutcomeComparisonRubricSelectionToFirst\(\);\s*renderPanels\(\);/g
    ) || []
  ).length >= 3,
  "Every year-load render path must reset to the first valid rubric"
);
assert.ok(
  (
    cgd.match(
      /resetIncomeRubricSelectionToFirst\(\);\s*resetIncomeComparisonRubricSelectionToFirst\(\);\s*resetSavingsRubricSelectionToFirst\(\);\s*resetSavingsComparisonRubricSelectionToFirst\(\);\s*resetOutcomeRubricSelectionToFirst\(\);\s*resetOutcomeComparisonRubricSelectionToFirst\(\);\s*renderPanels\(\);/g
    ) || []
  ).length >= 3,
  "Every year-load render path must independently reset both income charts"
);

console.log("Outcome expense detail regression checks passed.");
