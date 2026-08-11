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
    Number,
    Set,
    String,
    EXPLICIT_OUTCOME_EXPENSE_DETAIL: explicitDetail,
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
    document: {
      dispatchEvent: () => {},
      getElementById: (id) => (id === "outcome-evolution-chart" ? outcomeHost : incomeHost)
    },
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
    ${escapeHtmlSource}
    ${outcomeRubricBuilderSource}
    ${outcomeExpenseBuilderSource}
    ${outcomeChartSource}
    ${incomeChartSource}
    ${outcomeToggleSource}
    chartApi = {
      renderIncomeEvolutionChart,
      renderOutcomeEvolutionChart,
      resetOutcomeRubricSelectionToFirst
    };
  `, context);
  api = context.chartApi;

  return { api, context, incomeHost, outcomeHost, state };
};

const countSeries = (html, kind) => (html.match(new RegExp(`data-series-kind='${kind}'`, "g")) || []).length;
const countPressed = (html, attribute, pressed) => (
  html.match(new RegExp(`${attribute}='[^']+' aria-pressed='${pressed}'`, "g")) || []
).length;
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

explicit.outcomeHost.click("data-outcome-drilldown-toggle", "expense-0-1-102");
assert.equal(countSeries(explicit.outcomeHost.html, "expense"), 2);
assert.equal(countPressed(explicit.outcomeHost.html, "data-outcome-drilldown-toggle", "true"), 2);
explicit.outcomeHost.click("data-outcome-drilldown-toggle", "expense-0-0-101");
assert.equal(countSeries(explicit.outcomeHost.html, "expense"), 1);
assert.match(explicit.outcomeHost.html, /data-series-key='expense-0-1-102'/);

explicit.outcomeHost.click("data-outcome-expense-detail-toggle");
assert.equal(countSeries(explicit.outcomeHost.html, "rubric"), 1);
assert.equal(countSeries(explicit.outcomeHost.html, "expense"), 0);
assertCollapsedToggle(explicit.outcomeHost.html);
assert.equal(explicit.outcomeHost.focusCount, 2);

explicit.outcomeHost.click("data-outcome-expense-detail-toggle");
assert.equal(countSeries(explicit.outcomeHost.html, "rubric"), 0);
assert.equal(countSeries(explicit.outcomeHost.html, "expense"), 1);
assert.match(explicit.outcomeHost.html, /data-series-key='expense-0-0-101'/);
assert.doesNotMatch(explicit.outcomeHost.html, /data-series-key='expense-0-1-102'/);

explicit.outcomeHost.click("data-outcome-expense-detail-toggle");
explicit.outcomeHost.click("data-outcome-chart-toggle", "id-22");
assert.equal(countSeries(explicit.outcomeHost.html, "rubric"), 2);
assert.equal(countPressed(explicit.outcomeHost.html, "data-outcome-chart-toggle", "true"), 2);
assert.equal(explicit.state.outcomeChartExpenseDetailVisible, false);
explicit.outcomeHost.click("data-outcome-chart-toggle", "id-11");
assert.equal(countSeries(explicit.outcomeHost.html, "rubric"), 1);
assert.match(explicit.outcomeHost.html, /data-series-key='id-22'/);
assert.equal(countPressed(explicit.outcomeHost.html, "data-outcome-chart-toggle", "true"), 1);
assertCollapsedToggle(explicit.outcomeHost.html);

explicit.outcomeHost.click("data-outcome-expense-detail-toggle");
assert.equal(countSeries(explicit.outcomeHost.html, "rubric"), 0);
assert.equal(countSeries(explicit.outcomeHost.html, "expense"), 1);
assert.match(explicit.outcomeHost.html, /Condominio/);
assert.doesNotMatch(explicit.outcomeHost.html, /Livros/);
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

const reorderedData = makeData();
reorderedData.outcome.reverse();
explicit.state.data = reorderedData;
explicit.api.resetOutcomeRubricSelectionToFirst();
explicit.api.renderOutcomeEvolutionChart();
assert.equal(countSeries(explicit.outcomeHost.html, "rubric"), 1);
assert.match(explicit.outcomeHost.html, /data-series-key='id-22'/);
assert.doesNotMatch(explicit.outcomeHost.html, /data-series-key='id-11'/);
assert.equal(explicit.state.outcomeChartExpenseDetailVisible, false);

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
malicious.outcomeHost.click("data-outcome-expense-detail-toggle");
assert.equal(countSeries(malicious.outcomeHost.html, "rubric"), 0);
assert.equal(countSeries(malicious.outcomeHost.html, "expense"), 1);
assert.match(malicious.outcomeHost.html, /Item &#39;&gt;&lt;svg/);
assert.doesNotMatch(malicious.outcomeHost.html, /<svg onload/);

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

const sharedOpening = makeContext({
  explicitDetail: false,
  outcomeChartVisible: false
});
sharedOpening.context.window.cgdToggleOutcomeChart();
assert.equal(countSeries(sharedOpening.outcomeHost.html, "rubric"), 2);
assert.equal(countSeries(sharedOpening.outcomeHost.html, "expense"), 0);

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

sharedLegacy.api.renderIncomeEvolutionChart();
assert.match(sharedLegacy.incomeHost.html, /data-series-name='Salario'/);
assert.doesNotMatch(sharedLegacy.incomeHost.html, /data-series-name='Receitas'/);

assert.match(novoBancoHtml, /DASHBOARD_EXPLICIT_OUTCOME_EXPENSE_DETAIL = true/);
assert.match(novoBancoHtml, /assets\/js\/cgd\.js\?v=20260811-3/);
assert.match(novoBancoHtml, /assets\/css\/styles\.css\?v=20260811-1/);
assert.doesNotMatch(cgdHtml, /DASHBOARD_EXPLICIT_OUTCOME_EXPENSE_DETAIL/);
assert.doesNotMatch(coverflexHtml, /DASHBOARD_EXPLICIT_OUTCOME_EXPENSE_DETAIL/);
assert.match(styles, /\.nb-theme \.outcome-expense-detail-toggle,[\s\S]*min-height: 44px;/);
assert.match(styles, /\.nb-theme \.outcome-expense-detail-toggle:focus-visible/);
assert.ok(
  (cgd.match(/resetOutcomeRubricSelectionToFirst\(\);\s*renderPanels\(\);/g) || []).length >= 3,
  "Every year-load render path must reset to the first valid rubric"
);

console.log("Outcome expense detail regression checks passed.");
