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
const verticalScaleSource = sliceBetween(
  cgd,
  "function computeChartVerticalScale(",
  "\nfunction ensureChartBottomVisible"
);
const sharedSelectionSource = sliceBetween(
  cgd,
  "function resetHiddenSeriesSelectionToFirst(",
  "\nfunction resetOutcomeRubricSelectionToFirst"
);
const comparisonSource = sliceBetween(
  cgd,
  "function buildComparisonSeriesForKind(",
  "\nwindow.cgdToggleIncomeChart ="
);
const outcomeComparisonToggleSource = sliceBetween(
  cgd,
  "window.cgdToggleOutcomeComparisonChart =",
  "\nasync function loadYearData"
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
}

class FakeTarget {
  constructor(attribute, value = "") {
    this.attribute = attribute;
    this.value = value;
  }

  closest(selector) {
    return selector
      .split(",")
      .map((part) => part.trim())
      .includes(`[${this.attribute}]`)
      ? this
      : null;
  }

  getAttribute(name) {
    return name === this.attribute ? this.value : null;
  }
}

class FakeHost {
  constructor() {
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
    return selector === ".outcome-evolution-card" ? this.card : null;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  querySelector(selector) {
    if (
      selector === "[data-outcome-comparison-expense-detail-toggle]"
      && this.html.includes("data-outcome-comparison-expense-detail-toggle")
    ) {
      return {
        focus: () => {
          this.focusCount += 1;
        }
      };
    }
    return null;
  }

  querySelectorAll() {
    return [];
  }

  click(attribute, value = "") {
    const listener = this.listeners.get("click");
    assert.ok(listener, "Comparison chart click listener must be bound");
    listener({ target: new FakeTarget(attribute, value) });
  }
}

const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const monthData = (valueBase, estimatedBase) => months.map((_, index) => ({
  valor: valueBase + index,
  valorEstimado: estimatedBase + index
}));
const zeroMonthData = () => months.map(() => ({ valor: 0, valorEstimado: 0 }));

const makeData = () => ({
  outcome: [
    {
      id: 11,
      name: "Educacao",
      expenses: [
        { id: 101, name: "Livros", monthData: monthData(80, 90) },
        { id: 102, name: "Formacao", monthData: monthData(120, 130) }
      ]
    },
    {
      id: 22,
      name: "Casa",
      expenses: [
        { id: 201, name: "Condominio", monthData: monthData(60, 70) }
      ]
    }
  ],
  income: [
    {
      id: 31,
      name: "Receitas",
      expenses: [
        { id: 301, name: "Salario", monthData: monthData(1000, 1100) }
      ]
    }
  ],
  savings: []
});

const makeContext = ({ explicitDetail, data = makeData(), outcomeVisible = false }) => {
  const outcomeHost = new FakeHost();
  const incomeHost = new FakeHost();
  const savingsHost = new FakeHost();
  const state = {
    data,
    outcomeComparisonChartVisible: outcomeVisible,
    outcomeComparisonHiddenRubrics: new Set(),
    outcomeComparisonHiddenExpenses: new Set(),
    outcomeComparisonExpenseDetailVisible: false,
    outcomeComparisonExpenseDetailRubricKey: null,
    incomeComparisonChartVisible: true,
    incomeComparisonHiddenRubrics: new Set(),
    incomeComparisonHiddenExpenses: new Set(),
    savingsComparisonChartVisible: false,
    savingsComparisonHiddenRubrics: new Set(),
    savingsComparisonHiddenExpenses: new Set(),
    outcomeChartVisible: true,
    outcomeChartHiddenRubrics: new Set(["line-rubric-hidden"]),
    outcomeChartSelectedRubricKey: "line-rubric",
    outcomeChartExpenseDetailVisible: true,
    outcomeChartExpenseDetailRubricKey: "line-rubric",
    outcomeDrilldownHiddenExpenses: new Set(["line-rubric::line-expense"])
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
      incomeRubrics: ["#115511", "#226622"],
      incomeExpenses: ["#337733", "#448844"],
      savingsRubrics: ["#111155", "#222266"],
      savingsExpenses: ["#333377", "#444488"],
      outcomeRubrics: ["#111111", "#222222"],
      outcomeExpenses: ["#333333", "#444444", "#555555"],
      tooltipFallback: "#999999"
    },
    cgdState: state,
    document: {
      dispatchEvent: () => {},
      getElementById: (id) => {
        if (id === "outcome-comparison-chart") {
          return outcomeHost;
        }
        if (id === "income-comparison-chart") {
          return incomeHost;
        }
        if (id === "savings-comparison-chart") {
          return savingsHost;
        }
        return null;
      }
    },
    emptyValues: () => months.map(() => 0),
    ensurePanelHeadVisible: () => {},
    months,
    positionOutcomeChartTooltip: () => {},
    requestAnimationFrame: (callback) => callback(),
    renderPanels: () => {
      if (api) {
        api.renderOutcomeComparisonChart();
      }
    },
    scheduleChartOpenScroll: () => {},
    window: {},
    comparisonApi: null
  });

  vm.runInContext(`
    ${escapeHtmlSource}
    ${verticalScaleSource}
    ${sharedSelectionSource}
    ${comparisonSource}
    ${outcomeComparisonToggleSource}
    comparisonApi = {
      buildComparisonSeriesForKind,
      renderIncomeComparisonChart,
      renderOutcomeComparisonChart,
      resetOutcomeComparisonRubricSelectionToFirst
    };
  `, context);
  api = context.comparisonApi;

  return { api, context, incomeHost, outcomeHost, savingsHost, state };
};

const countBars = (html, kind) => (html.match(new RegExp(`data-series-kind='${kind}'`, "g")) || []).length;
const countBarsForKey = (html, key) => (html.match(new RegExp(`data-series-key='${key}'`, "g")) || []).length;
const countBarValueKind = (html, kind) => (html.match(new RegExp(`data-bar-value-kind='${kind}'`, "g")) || []).length;
const countPressed = (html, attribute, pressed) => (
  html.match(new RegExp(`${attribute}='[^']+' aria-pressed='${pressed}'`, "g")) || []
).length;

const assertCollapsedDetail = (html) => {
  assert.match(html, /data-outcome-comparison-expense-detail-toggle/);
  assert.match(html, /aria-expanded='false'/);
  assert.match(html, /aria-controls='outcome-comparison-expense-detail-series'/);
  assert.match(html, />Mostrar despesas<\/button>/);
  assert.match(html, /id='outcome-comparison-expense-detail-series'[^>]*\shidden(?:\s|>)/);
  assert.doesNotMatch(html, /id='outcome-expense-detail-series'/);
};

const assertExpandedDetail = (html) => {
  assert.match(html, /data-outcome-comparison-expense-detail-toggle/);
  assert.match(html, /aria-expanded='true'/);
  assert.match(html, />Ocultar despesas<\/button>/);
  assert.doesNotMatch(html, /id='outcome-comparison-expense-detail-series'[^>]*\shidden(?:\s|>)/);
};

const explicit = makeContext({ explicitDetail: true });
const lineStateBefore = {
  visible: explicit.state.outcomeChartVisible,
  selected: explicit.state.outcomeChartSelectedRubricKey,
  detailVisible: explicit.state.outcomeChartExpenseDetailVisible,
  detailKey: explicit.state.outcomeChartExpenseDetailRubricKey,
  hiddenRubrics: Array.from(explicit.state.outcomeChartHiddenRubrics),
  hiddenExpenses: Array.from(explicit.state.outcomeDrilldownHiddenExpenses)
};

explicit.context.window.cgdToggleOutcomeComparisonChart();
assert.equal(explicit.state.outcomeComparisonChartVisible, true);
assert.equal(countBars(explicit.outcomeHost.html, "rubric"), 24);
assert.equal(countBars(explicit.outcomeHost.html, "expense"), 0);
assert.equal(countBarsForKey(explicit.outcomeHost.html, "id-11"), 24);
assert.equal(countBarsForKey(explicit.outcomeHost.html, "id-22"), 0);
assert.equal(countBarValueKind(explicit.outcomeHost.html, "value"), 12);
assert.equal(countBarValueKind(explicit.outcomeHost.html, "estimated"), 12);
assert.equal(countPressed(explicit.outcomeHost.html, "data-comparison-chart-toggle", "true"), 1);
assert.equal(countPressed(explicit.outcomeHost.html, "data-comparison-chart-toggle", "false"), 1);
assert.match(explicit.outcomeHost.html, /data-series-name='Educacao .* Valor'/);
assert.match(explicit.outcomeHost.html, /data-series-name='Educacao .* Estimado'/);
assert.match(explicit.outcomeHost.html, /data-value='200\.00'/);
assert.match(explicit.outcomeHost.html, /data-value='220\.00'/);
assertCollapsedDetail(explicit.outcomeHost.html);
assert.equal(explicit.state.outcomeComparisonHiddenRubrics.size, 1);
assert.deepEqual(Array.from(explicit.state.outcomeComparisonHiddenRubrics), ["id-22"]);

explicit.api.renderOutcomeComparisonChart();
assert.equal(countBarsForKey(explicit.outcomeHost.html, "id-11"), 24);
assert.equal(explicit.state.outcomeComparisonHiddenRubrics.size, 1);

explicit.outcomeHost.click("data-outcome-comparison-expense-detail-toggle");
assert.equal(countBars(explicit.outcomeHost.html, "rubric"), 0);
assert.equal(countBars(explicit.outcomeHost.html, "expense"), 24);
assert.equal(countBarsForKey(explicit.outcomeHost.html, "id-101"), 24);
assert.equal(countBarsForKey(explicit.outcomeHost.html, "id-102"), 0);
assert.equal(countPressed(explicit.outcomeHost.html, "data-comparison-drilldown-toggle", "true"), 1);
assert.equal(countPressed(explicit.outcomeHost.html, "data-comparison-drilldown-toggle", "false"), 1);
assert.match(explicit.outcomeHost.html, /data-value='80\.00'/);
assert.match(explicit.outcomeHost.html, /data-value='90\.00'/);
assertExpandedDetail(explicit.outcomeHost.html);
assert.equal(explicit.outcomeHost.focusCount, 1);
assert.deepEqual(Array.from(explicit.state.outcomeComparisonHiddenExpenses), ["id-11::id-102"]);

explicit.outcomeHost.click("data-comparison-drilldown-toggle", "id-102");
assert.equal(countBars(explicit.outcomeHost.html, "expense"), 48);
assert.equal(countPressed(explicit.outcomeHost.html, "data-comparison-drilldown-toggle", "true"), 2);
explicit.outcomeHost.click("data-comparison-drilldown-toggle", "id-101");
assert.equal(countBars(explicit.outcomeHost.html, "expense"), 24);
assert.equal(countBarsForKey(explicit.outcomeHost.html, "id-102"), 24);
assert.match(explicit.outcomeHost.html, /data-value='120\.00'/);
assert.match(explicit.outcomeHost.html, /data-value='130\.00'/);

explicit.outcomeHost.click("data-outcome-comparison-expense-detail-toggle");
assert.equal(countBars(explicit.outcomeHost.html, "rubric"), 24);
assert.equal(countBars(explicit.outcomeHost.html, "expense"), 0);
assertCollapsedDetail(explicit.outcomeHost.html);
assert.equal(explicit.outcomeHost.focusCount, 2);

explicit.outcomeHost.click("data-outcome-comparison-expense-detail-toggle");
assert.equal(countBarsForKey(explicit.outcomeHost.html, "id-101"), 24);
assert.equal(countBarsForKey(explicit.outcomeHost.html, "id-102"), 0);
assert.deepEqual(Array.from(explicit.state.outcomeComparisonHiddenExpenses), ["id-11::id-102"]);

explicit.outcomeHost.click("data-outcome-comparison-expense-detail-toggle");
explicit.outcomeHost.click("data-comparison-chart-toggle", "id-22");
assert.equal(countBars(explicit.outcomeHost.html, "rubric"), 48);
assert.equal(countBars(explicit.outcomeHost.html, "expense"), 0);
assert.equal(explicit.state.outcomeComparisonExpenseDetailVisible, false);
assert.doesNotMatch(explicit.outcomeHost.html, /data-outcome-comparison-expense-detail-toggle/);
explicit.outcomeHost.click("data-comparison-chart-toggle", "id-11");
assert.equal(countBars(explicit.outcomeHost.html, "rubric"), 24);
assert.equal(countBarsForKey(explicit.outcomeHost.html, "id-22"), 24);
assertCollapsedDetail(explicit.outcomeHost.html);

explicit.outcomeHost.click("data-outcome-comparison-expense-detail-toggle");
assert.equal(countBars(explicit.outcomeHost.html, "expense"), 24);
assert.equal(countBarsForKey(explicit.outcomeHost.html, "id-201"), 24);
assert.match(explicit.outcomeHost.html, /data-value='60\.00'/);
assert.match(explicit.outcomeHost.html, /data-value='70\.00'/);
explicit.outcomeHost.click("data-comparison-chart-toggle", "id-11");
assert.equal(countBars(explicit.outcomeHost.html, "rubric"), 48);
assert.equal(explicit.state.outcomeComparisonExpenseDetailVisible, false);
assert.doesNotMatch(explicit.outcomeHost.html, /data-outcome-comparison-expense-detail-toggle/);

explicit.outcomeHost.click("data-comparison-chart-toggle", "id-11");
assert.equal(countBarsForKey(explicit.outcomeHost.html, "id-22"), 24);
explicit.outcomeHost.click("data-comparison-chart-toggle", "id-22");
assert.equal(countBars(explicit.outcomeHost.html, "rubric"), 0);
assert.match(explicit.outcomeHost.html, /Nenhuma rubrica selecionada/);
assert.doesNotMatch(explicit.outcomeHost.html, /data-outcome-comparison-expense-detail-toggle/);
explicit.outcomeHost.click("data-comparison-chart-toggle", "id-11");
assert.equal(countBarsForKey(explicit.outcomeHost.html, "id-11"), 24);
assertCollapsedDetail(explicit.outcomeHost.html);

explicit.outcomeHost.click("data-outcome-comparison-expense-detail-toggle");
explicit.outcomeHost.click("data-outcome-comparison-chart-close-main");
assert.equal(explicit.state.outcomeComparisonChartVisible, false);
assert.equal(explicit.state.outcomeComparisonExpenseDetailVisible, false);
assert.equal(explicit.state.outcomeComparisonHiddenRubrics.size, 0);
assert.equal(explicit.state.outcomeComparisonHiddenExpenses.size, 0);
assert.equal(explicit.outcomeHost.html, "");
explicit.context.window.cgdToggleOutcomeComparisonChart();
assert.equal(countBarsForKey(explicit.outcomeHost.html, "id-11"), 24);
assert.equal(countBars(explicit.outcomeHost.html, "expense"), 0);
assertCollapsedDetail(explicit.outcomeHost.html);

const reordered = makeData();
reordered.outcome.reverse();
explicit.state.data = reordered;
explicit.api.resetOutcomeComparisonRubricSelectionToFirst();
explicit.api.renderOutcomeComparisonChart();
assert.equal(countBarsForKey(explicit.outcomeHost.html, "id-22"), 24);
assert.equal(countBarsForKey(explicit.outcomeHost.html, "id-11"), 0);
assert.equal(explicit.state.outcomeComparisonExpenseDetailVisible, false);

assert.deepEqual({
  visible: explicit.state.outcomeChartVisible,
  selected: explicit.state.outcomeChartSelectedRubricKey,
  detailVisible: explicit.state.outcomeChartExpenseDetailVisible,
  detailKey: explicit.state.outcomeChartExpenseDetailRubricKey,
  hiddenRubrics: Array.from(explicit.state.outcomeChartHiddenRubrics),
  hiddenExpenses: Array.from(explicit.state.outcomeDrilldownHiddenExpenses)
}, lineStateBefore);

const empty = makeContext({
  explicitDetail: true,
  data: {
    income: [],
    savings: [],
    outcome: [{
      id: 55,
      name: "Sem valores",
      expenses: [{ id: 501, name: "Sem valores", monthData: zeroMonthData() }]
    }]
  }
});
empty.context.window.cgdToggleOutcomeComparisonChart();
assert.equal(countBars(empty.outcomeHost.html, "rubric"), 0);
assert.equal(countBars(empty.outcomeHost.html, "expense"), 0);
assert.match(empty.outcomeHost.html, /Ainda nao existem valores para comparar/);
assert.doesNotMatch(empty.outcomeHost.html, /data-outcome-comparison-expense-detail-toggle/);

const malicious = makeContext({
  explicitDetail: true,
  data: {
    income: [],
    savings: [],
    outcome: [{
      id: 66,
      name: "Casa <img src=x onerror=alert(1)>",
      expenses: [{
        id: 601,
        name: "Item '><svg onload=alert(2)>",
        monthData: monthData(10, 20)
      }]
    }]
  }
});
malicious.context.window.cgdToggleOutcomeComparisonChart();
assert.match(malicious.outcomeHost.html, /Casa &lt;img/);
assert.doesNotMatch(malicious.outcomeHost.html, /<img/);
malicious.outcomeHost.click("data-outcome-comparison-expense-detail-toggle");
assert.match(malicious.outcomeHost.html, /Item &#39;&gt;&lt;svg/);
assert.doesNotMatch(malicious.outcomeHost.html, /<svg onload/);

const sharedOpening = makeContext({ explicitDetail: false });
sharedOpening.context.window.cgdToggleOutcomeComparisonChart();
assert.equal(countBars(sharedOpening.outcomeHost.html, "rubric"), 48);
assert.equal(countBars(sharedOpening.outcomeHost.html, "expense"), 0);
assert.doesNotMatch(sharedOpening.outcomeHost.html, /data-outcome-comparison-expense-detail-toggle/);

const sharedLegacy = makeContext({
  explicitDetail: false,
  outcomeVisible: true,
  data: {
    ...makeData(),
    outcome: [makeData().outcome[0]]
  }
});
sharedLegacy.api.renderOutcomeComparisonChart();
assert.equal(countBars(sharedLegacy.outcomeHost.html, "rubric"), 0);
assert.equal(countBars(sharedLegacy.outcomeHost.html, "expense"), 48);
assert.doesNotMatch(sharedLegacy.outcomeHost.html, /data-outcome-comparison-expense-detail-toggle/);

sharedLegacy.api.renderIncomeComparisonChart();
assert.equal(countBars(sharedLegacy.incomeHost.html, "rubric"), 0);
assert.equal(countBars(sharedLegacy.incomeHost.html, "expense"), 24);
assert.match(sharedLegacy.incomeHost.html, /data-series-name='Salario .* Valor'/);
assert.match(sharedLegacy.incomeHost.html, /data-series-name='Salario .* Estimado'/);
assert.doesNotMatch(sharedLegacy.incomeHost.html, /data-outcome-comparison-expense-detail-toggle/);

assert.match(novoBancoHtml, /DASHBOARD_EXPLICIT_OUTCOME_EXPENSE_DETAIL = true/);
assert.match(novoBancoHtml, /assets\/js\/cgd\.js\?v=20260812-3/);
assert.match(novoBancoHtml, /assets\/css\/styles\.css\?v=20260812-1/);
assert.match(styles, /\.nb-theme \.panel-stack\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\);/);
assert.doesNotMatch(cgdHtml, /DASHBOARD_EXPLICIT_OUTCOME_EXPENSE_DETAIL/);
assert.doesNotMatch(coverflexHtml, /DASHBOARD_EXPLICIT_OUTCOME_EXPENSE_DETAIL/);
assert.doesNotMatch(cgdHtml, /20260812-3/);
assert.doesNotMatch(coverflexHtml, /20260812-3/);
assert.ok(
  (cgd.match(/resetOutcomeComparisonRubricSelectionToFirst\(\);\s*renderPanels\(\);/g) || []).length >= 3,
  "Every year-load render path must reset the comparison chart to the first valid rubric"
);
assert.notEqual("outcome-expense-detail-series", "outcome-comparison-expense-detail-series");
assert.match(cgd, /id='outcome-expense-detail-series'/);
assert.match(cgd, /id='outcome-comparison-expense-detail-series'/);

console.log("Outcome comparison detail regression checks passed.");
