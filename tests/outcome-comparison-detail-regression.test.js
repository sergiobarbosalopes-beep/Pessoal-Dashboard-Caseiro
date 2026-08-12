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
const dataModelSource = [
  sliceBetween(cgd, "function normalizeMonth(", "\nasync function fetchRubricsForYear"),
  sliceBetween(cgd, "function buildExpenseHistoryMonthKey(", "\nasync function fetchExpenseHistoryMonthKeysForYear"),
  sliceBetween(cgd, "function buildDataModel(", "\nfunction money(")
].join("\n");
const averageHelpersSource = sliceBetween(
  cgd,
  "function computeTwelveMonthAverage(",
  "\nfunction focusOutcomeExpenseDetailToggle"
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
    Map,
    Number,
    Set,
    String,
    EXPENSE_SEQ_COLUMN: "despesa_seq",
    EXPLICIT_OUTCOME_EXPENSE_DETAIL: explicitDetail,
    HIDE_SAVINGS: false,
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
    ${dataModelSource}
    ${averageHelpersSource}
    ${comparisonSource}
    ${outcomeComparisonToggleSource}
    comparisonApi = {
      buildDataModel,
      buildComparisonSeriesForKind,
      computeChartVerticalScale,
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
const getAttribute = (tag, attribute) => (
  tag.match(new RegExp(`${attribute}='([^']*)'`))?.[1] ?? null
);
const getComparisonAverage = (html, kind) => {
  const group = html.match(
    new RegExp(`<g(?=[^>]*data-outcome-comparison-average='${kind}')[^>]*>[\\s\\S]*?<\\/g>`)
  )?.[0] || "";
  const groupTag = group.match(/^<g[^>]*>/)?.[0] || "";
  const lineTag = group.match(
    new RegExp(`<line(?=[^>]*data-outcome-comparison-average-line='${kind}')[^>]*>`)
  )?.[0] || "";
  const labelMatch = html.match(
    new RegExp(`<span(?=[^>]*data-outcome-comparison-average-label='${kind}')[^>]*>([^<]*)<\\/span>`)
  );
  assert.ok(group, `Missing ${kind} comparison average group`);
  assert.ok(lineTag, `Missing ${kind} comparison average line`);
  assert.ok(labelMatch, `Missing ${kind} comparison average label`);
  return {
    group,
    groupTag,
    lineTag,
    value: Number(getAttribute(groupTag, "data-average-value")),
    sourceKind: getAttribute(groupTag, "data-average-source-kind"),
    sourceKey: getAttribute(groupTag, "data-average-source-key"),
    ariaLabel: getAttribute(groupTag, "aria-label"),
    title: group.match(/<title>([^<]*)<\/title>/)?.[1] || "",
    label: labelMatch[1],
    labelTag: labelMatch[0],
    labelColor: labelMatch[0].match(/style='[^']*color:([^;']+)/)?.[1] || null,
    y1: Number(getAttribute(lineTag, "y1")),
    y2: Number(getAttribute(lineTag, "y2")),
    stroke: getAttribute(lineTag, "stroke"),
    strokeWidth: getAttribute(lineTag, "stroke-width"),
    dashArray: getAttribute(lineTag, "stroke-dasharray"),
    strokeLinecap: getAttribute(lineTag, "stroke-linecap"),
    strokeOpacity: getAttribute(lineTag, "stroke-opacity"),
    opacity: getAttribute(lineTag, "opacity"),
    fill: getAttribute(lineTag, "fill"),
    vectorEffect: getAttribute(lineTag, "vector-effect")
  };
};
const getComparisonBar = (html, key, valueKind) => {
  const tag = html.match(
    new RegExp(`<rect(?=[^>]*data-series-key='${key}')(?=[^>]*data-bar-value-kind='${valueKind}')[^>]*>`)
  )?.[0] || "";
  assert.ok(tag, `Missing ${valueKind} bar for ${key}`);
  return {
    fill: getAttribute(tag, "fill"),
    fillOpacity: Number(getAttribute(tag, "fill-opacity") ?? 1),
    stroke: getAttribute(tag, "stroke"),
    strokeOpacity: Number(getAttribute(tag, "stroke-opacity") ?? 1)
  };
};
const composeRenderedFillColor = (fill, fillOpacity) => {
  if (fillOpacity === 1) {
    return fill;
  }
  const hex = String(fill).match(/^#([0-9a-f]{6})$/i)?.[1];
  assert.ok(hex, `Expected a six-digit rendered fill color, received ${fill}`);
  return `rgba(${Number.parseInt(hex.slice(0, 2), 16)}, ${Number.parseInt(hex.slice(2, 4), 16)}, ${Number.parseInt(hex.slice(4, 6), 16)}, ${fillOpacity})`;
};
const assertNoComparisonAverages = (html) => {
  assert.doesNotMatch(html, /data-outcome-comparison-average=/);
  assert.doesNotMatch(html, /data-outcome-comparison-average-line=/);
  assert.doesNotMatch(html, /data-outcome-comparison-average-label=/);
};
const assertDualAverages = (html, expected) => {
  const real = getComparisonAverage(html, "real");
  const estimated = getComparisonAverage(html, "estimated");
  const expectedEntries = [
    {
      average: real,
      label: "Média Real",
      value: expected.real,
      dashArray: "8 6"
    },
    {
      average: estimated,
      label: "Média Estimada",
      value: expected.estimated,
      dashArray: "8 6"
    }
  ];

  expectedEntries.forEach(({ average, label, value, dashArray }) => {
    const formattedValue = value.toFixed(2);
    assert.ok(Math.abs(average.value - value) < 1e-12);
    assert.equal(average.sourceKind, expected.sourceKind);
    assert.equal(average.sourceKey, expected.sourceKey);
    assert.equal(average.ariaLabel, `${label} - ${expected.name}: ${formattedValue}.`);
    assert.equal(average.title, average.ariaLabel);
    assert.equal(average.label, `${label}: ${formattedValue}`);
    assert.match(average.labelTag, /class='outcome-evolution-tooltip-series'/);
    assert.doesNotMatch(formattedValue, /,|\s/);
    assert.match(formattedValue, /^-?\d+\.\d{2}$/);
    assert.equal(average.strokeWidth, "1.8");
    assert.equal(average.dashArray, dashArray);
    assert.equal(average.strokeLinecap, "butt");
    assert.equal(average.strokeOpacity, null);
    assert.equal(average.opacity, null);
    assert.equal(average.fill, "none");
    assert.equal(average.vectorEffect, "non-scaling-stroke");
    assert.equal(average.y1, average.y2);
    assert.doesNotMatch(average.group, /<rect|<circle|<button|aria-pressed=/);
  });

  const realBar = getComparisonBar(html, expected.sourceKey, "value");
  const estimatedBar = getComparisonBar(html, expected.sourceKey, "estimated");
  const realFillColor = composeRenderedFillColor(realBar.fill, realBar.fillOpacity);
  const estimatedFillColor = composeRenderedFillColor(
    estimatedBar.fill,
    estimatedBar.fillOpacity
  );
  assert.equal(realBar.fill, expected.color);
  assert.equal(estimatedBar.fill, expected.color);
  assert.equal(estimatedBar.stroke, expected.color);
  assert.equal(real.stroke, realFillColor);
  assert.equal(real.labelColor, realFillColor);
  assert.equal(estimated.stroke, estimatedFillColor);
  assert.equal(estimated.labelColor, estimatedFillColor);
  assert.notEqual(estimated.stroke, estimatedBar.stroke);
  assert.notEqual(estimated.labelColor, estimatedBar.stroke);
  [
    "strokeWidth",
    "dashArray",
    "strokeLinecap",
    "strokeOpacity",
    "opacity",
    "fill",
    "vectorEffect"
  ].forEach((property) => {
    assert.equal(estimated[property], real[property], `${property} must match both averages`);
  });

  assert.ok(
    html.indexOf("data-outcome-comparison-average-label='real'")
      < html.indexOf("data-outcome-comparison-average-label='estimated'")
  );
  assert.match(
    html,
    new RegExp(`aria-label='[^']*Média Real de ${expected.name}: ${expected.real.toFixed(2)}`
      + `\\. Média Estimada de ${expected.name}: ${expected.estimated.toFixed(2)}'`)
  );
  return { real, estimated };
};

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
assertDualAverages(explicit.outcomeHost.html, {
  sourceKind: "rubric",
  sourceKey: "id-11",
  name: "Educacao",
  color: "#111111",
  real: 211,
  estimated: 231
});
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
assertDualAverages(explicit.outcomeHost.html, {
  sourceKind: "expense",
  sourceKey: "id-101",
  name: "Livros",
  color: "#333333",
  real: 85.5,
  estimated: 95.5
});
assert.equal(explicit.outcomeHost.focusCount, 1);
assert.deepEqual(Array.from(explicit.state.outcomeComparisonHiddenExpenses), ["id-11::id-102"]);

explicit.outcomeHost.click("data-comparison-drilldown-toggle", "id-102");
assert.equal(countBars(explicit.outcomeHost.html, "expense"), 48);
assert.equal(countPressed(explicit.outcomeHost.html, "data-comparison-drilldown-toggle", "true"), 2);
assertNoComparisonAverages(explicit.outcomeHost.html);
explicit.outcomeHost.click("data-comparison-drilldown-toggle", "id-101");
assert.equal(countBars(explicit.outcomeHost.html, "expense"), 24);
assert.equal(countBarsForKey(explicit.outcomeHost.html, "id-102"), 24);
assert.match(explicit.outcomeHost.html, /data-value='120\.00'/);
assert.match(explicit.outcomeHost.html, /data-value='130\.00'/);
assertDualAverages(explicit.outcomeHost.html, {
  sourceKind: "expense",
  sourceKey: "id-102",
  name: "Formacao",
  color: "#444444",
  real: 125.5,
  estimated: 135.5
});

explicit.outcomeHost.click("data-outcome-comparison-expense-detail-toggle");
assert.equal(countBars(explicit.outcomeHost.html, "rubric"), 24);
assert.equal(countBars(explicit.outcomeHost.html, "expense"), 0);
assertCollapsedDetail(explicit.outcomeHost.html);
assertDualAverages(explicit.outcomeHost.html, {
  sourceKind: "rubric",
  sourceKey: "id-11",
  name: "Educacao",
  color: "#111111",
  real: 211,
  estimated: 231
});
assert.equal(explicit.outcomeHost.focusCount, 2);

explicit.outcomeHost.click("data-outcome-comparison-expense-detail-toggle");
assert.equal(countBarsForKey(explicit.outcomeHost.html, "id-101"), 24);
assert.equal(countBarsForKey(explicit.outcomeHost.html, "id-102"), 0);
assert.deepEqual(Array.from(explicit.state.outcomeComparisonHiddenExpenses), ["id-11::id-102"]);
assertDualAverages(explicit.outcomeHost.html, {
  sourceKind: "expense",
  sourceKey: "id-101",
  name: "Livros",
  color: "#333333",
  real: 85.5,
  estimated: 95.5
});

explicit.outcomeHost.click("data-outcome-comparison-expense-detail-toggle");
explicit.outcomeHost.click("data-comparison-chart-toggle", "id-22");
assert.equal(countBars(explicit.outcomeHost.html, "rubric"), 48);
assert.equal(countBars(explicit.outcomeHost.html, "expense"), 0);
assert.equal(explicit.state.outcomeComparisonExpenseDetailVisible, false);
assert.doesNotMatch(explicit.outcomeHost.html, /data-outcome-comparison-expense-detail-toggle/);
assertNoComparisonAverages(explicit.outcomeHost.html);
explicit.outcomeHost.click("data-comparison-chart-toggle", "id-11");
assert.equal(countBars(explicit.outcomeHost.html, "rubric"), 24);
assert.equal(countBarsForKey(explicit.outcomeHost.html, "id-22"), 24);
assertCollapsedDetail(explicit.outcomeHost.html);
assertDualAverages(explicit.outcomeHost.html, {
  sourceKind: "rubric",
  sourceKey: "id-22",
  name: "Casa",
  color: "#222222",
  real: 65.5,
  estimated: 75.5
});

explicit.outcomeHost.click("data-outcome-comparison-expense-detail-toggle");
assert.equal(countBars(explicit.outcomeHost.html, "expense"), 24);
assert.equal(countBarsForKey(explicit.outcomeHost.html, "id-201"), 24);
assert.match(explicit.outcomeHost.html, /data-value='60\.00'/);
assert.match(explicit.outcomeHost.html, /data-value='70\.00'/);
assertDualAverages(explicit.outcomeHost.html, {
  sourceKind: "expense",
  sourceKey: "id-201",
  name: "Condominio",
  color: "#333333",
  real: 65.5,
  estimated: 75.5
});
explicit.outcomeHost.click("data-comparison-chart-toggle", "id-11");
assert.equal(countBars(explicit.outcomeHost.html, "rubric"), 48);
assert.equal(explicit.state.outcomeComparisonExpenseDetailVisible, false);
assert.doesNotMatch(explicit.outcomeHost.html, /data-outcome-comparison-expense-detail-toggle/);
assertNoComparisonAverages(explicit.outcomeHost.html);

explicit.outcomeHost.click("data-comparison-chart-toggle", "id-11");
assert.equal(countBarsForKey(explicit.outcomeHost.html, "id-22"), 24);
explicit.outcomeHost.click("data-comparison-chart-toggle", "id-22");
assert.equal(countBars(explicit.outcomeHost.html, "rubric"), 0);
assert.match(explicit.outcomeHost.html, /Nenhuma rubrica selecionada/);
assert.doesNotMatch(explicit.outcomeHost.html, /data-outcome-comparison-expense-detail-toggle/);
assertNoComparisonAverages(explicit.outcomeHost.html);
explicit.outcomeHost.click("data-comparison-chart-toggle", "id-11");
assert.equal(countBarsForKey(explicit.outcomeHost.html, "id-11"), 24);
assertCollapsedDetail(explicit.outcomeHost.html);
assertDualAverages(explicit.outcomeHost.html, {
  sourceKind: "rubric",
  sourceKey: "id-11",
  name: "Educacao",
  color: "#111111",
  real: 211,
  estimated: 231
});

explicit.outcomeHost.click("data-outcome-comparison-expense-detail-toggle");
explicit.outcomeHost.click("data-outcome-comparison-chart-close-main");
assert.equal(explicit.state.outcomeComparisonChartVisible, false);
assert.equal(explicit.state.outcomeComparisonExpenseDetailVisible, false);
assert.equal(explicit.state.outcomeComparisonHiddenRubrics.size, 0);
assert.equal(explicit.state.outcomeComparisonHiddenExpenses.size, 0);
assert.equal(explicit.outcomeHost.html, "");
assertNoComparisonAverages(explicit.outcomeHost.html);
explicit.context.window.cgdToggleOutcomeComparisonChart();
assert.equal(countBarsForKey(explicit.outcomeHost.html, "id-11"), 24);
assert.equal(countBars(explicit.outcomeHost.html, "expense"), 0);
assertCollapsedDetail(explicit.outcomeHost.html);
assertDualAverages(explicit.outcomeHost.html, {
  sourceKind: "rubric",
  sourceKey: "id-11",
  name: "Educacao",
  color: "#111111",
  real: 211,
  estimated: 231
});

const reordered = makeData();
reordered.outcome.reverse();
explicit.state.data = reordered;
explicit.api.resetOutcomeComparisonRubricSelectionToFirst();
explicit.api.renderOutcomeComparisonChart();
assert.equal(countBarsForKey(explicit.outcomeHost.html, "id-22"), 24);
assert.equal(countBarsForKey(explicit.outcomeHost.html, "id-11"), 0);
assert.equal(explicit.state.outcomeComparisonExpenseDetailVisible, false);
assertDualAverages(explicit.outcomeHost.html, {
  sourceKind: "rubric",
  sourceKey: "id-22",
  name: "Casa",
  color: "#111111",
  real: 65.5,
  estimated: 75.5
});

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
assertNoComparisonAverages(empty.outcomeHost.html);

const rawNormalization = makeContext({ explicitDetail: true });
const rawMonthlyValues = [
  { valor: 0, valor_Estimado: 1200 },
  { valor: -12.3, valor_Estimado: -12.3 },
  { valor: 1234.5, valor_Estimado: 0 },
  { valor: null, valor_Estimado: null },
  { valor: "", valor_Estimado: "" },
  { valor: "not-a-number", valor_Estimado: "not-a-number" },
  { valor: 0, valor_estimado: 5 },
  { valor: 0, valor_estimado: null },
  { valor: 0, valor_Estimado: Number.POSITIVE_INFINITY },
  { valor: 0, valor_Estimado: -20 },
  { valor: 0, valor_Estimado: 0 },
  { valor: 0 }
];
rawNormalization.state.data = rawNormalization.api.buildDataModel(
  [{
    rubrica_id: 77,
    rubrica_desc: "Normalizacao",
    rubrica_tipo: "Despesa",
    rubrica_seq: 1,
    mes: 1
  }],
  rawMonthlyValues.map((values, index) => ({
    ...values,
    rubrica_id: 77,
    despesa_id: 701,
    despesa_desc: "Legacy",
    despesa_seq: 1,
    mes: index + 1,
    totalizador: true
  })),
  new Set()
);
rawNormalization.context.window.cgdToggleOutcomeComparisonChart();
assert.equal(countBars(rawNormalization.outcomeHost.html, "rubric"), 24);
assert.match(rawNormalization.outcomeHost.html, /data-value='1200\.00'/);
assert.match(rawNormalization.outcomeHost.html, /data-value='-12\.30'/);
assertDualAverages(rawNormalization.outcomeHost.html, {
  sourceKind: "rubric",
  sourceKey: "id-77",
  name: "Normalizacao",
  color: "#111111",
  real: 1222.2 / 12,
  estimated: 1172.7 / 12
});

const zeroReal = makeContext({
  explicitDetail: true,
  data: {
    income: [],
    savings: [],
    outcome: [{
      id: 88,
      name: "Real zero",
      expenses: [{
        id: 801,
        name: "Estimativa",
        monthData: months.map((_, index) => ({
          valor: 0,
          valorEstimado: 120 + index
        }))
      }]
    }]
  }
});
zeroReal.context.window.cgdToggleOutcomeComparisonChart();
assertDualAverages(zeroReal.outcomeHost.html, {
  sourceKind: "rubric",
  sourceKey: "id-88",
  name: "Real zero",
  color: "#111111",
  real: 0,
  estimated: 125.5
});
assert.match(zeroReal.outcomeHost.html, /Média Real: 0\.00/);

const largeAndNegative = makeContext({
  explicitDetail: true,
  data: {
    income: [],
    savings: [],
    outcome: [{
      id: 99,
      name: "Valores grandes",
      expenses: [{
        id: 901,
        name: "Grande",
        monthData: months.map(() => ({
          valor: 1234.5,
          valorEstimado: -12.3
        }))
      }]
    }]
  }
});
largeAndNegative.context.window.cgdToggleOutcomeComparisonChart();
assertDualAverages(largeAndNegative.outcomeHost.html, {
  sourceKind: "rubric",
  sourceKey: "id-99",
  name: "Valores grandes",
  color: "#111111",
  real: 1234.5,
  estimated: -12.3
});
assert.match(largeAndNegative.outcomeHost.html, /Média Real: 1234\.50/);
assert.doesNotMatch(largeAndNegative.outcomeHost.html, /1,234\.50|1 234,50|1\.234,50/);

const coincident = makeContext({
  explicitDetail: true,
  data: {
    income: [],
    savings: [],
    outcome: [{
      id: 111,
      name: "Coincidente",
      expenses: [{
        id: 1101,
        name: "Igual",
        monthData: months.map(() => ({ valor: 100, valorEstimado: 100 }))
      }]
    }]
  }
});
coincident.context.window.cgdToggleOutcomeComparisonChart();
const coincidentAverages = assertDualAverages(coincident.outcomeHost.html, {
  sourceKind: "rubric",
  sourceKey: "id-111",
  name: "Coincidente",
  color: "#111111",
  real: 100,
  estimated: 100
});
assert.equal(coincidentAverages.real.y1, coincidentAverages.estimated.y1);
assert.match(
  coincident.outcomeHost.html,
  /data-outcome-comparison-average-label-row[\s\S]*data-outcome-comparison-average-label='real'[\s\S]*data-outcome-comparison-average-label='estimated'/
);
assert.doesNotMatch(coincidentAverages.real.labelTag, /\sx=|\sy=/);
assert.doesNotMatch(coincidentAverages.estimated.labelTag, /\sx=|\sy=/);

const closeAverages = makeContext({
  explicitDetail: true,
  data: {
    income: [],
    savings: [],
    outcome: [{
      id: 112,
      name: "Proximas",
      expenses: [{
        id: 1201,
        name: "Quase igual",
        monthData: months.map(() => ({ valor: 100, valorEstimado: 100.01 }))
      }]
    }]
  }
});
closeAverages.context.window.cgdToggleOutcomeComparisonChart();
const closeAverageLines = assertDualAverages(closeAverages.outcomeHost.html, {
  sourceKind: "rubric",
  sourceKey: "id-112",
  name: "Proximas",
  color: "#111111",
  real: 100,
  estimated: 100.01
});
assert.ok(Math.abs(closeAverageLines.real.y1 - closeAverageLines.estimated.y1) <= 0.05);

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
assert.match(
  getComparisonAverage(malicious.outcomeHost.html, "real").ariaLabel,
  /Casa &lt;img src=x onerror=alert\(1\)&gt;/
);
malicious.outcomeHost.click("data-outcome-comparison-expense-detail-toggle");
assert.match(malicious.outcomeHost.html, /Item &#39;&gt;&lt;svg/);
assert.doesNotMatch(malicious.outcomeHost.html, /<svg onload/);
assert.match(
  getComparisonAverage(malicious.outcomeHost.html, "estimated").ariaLabel,
  /Item &#39;&gt;&lt;svg onload=alert\(2\)&gt;/
);

const sharedOpening = makeContext({ explicitDetail: false });
sharedOpening.context.window.cgdToggleOutcomeComparisonChart();
assert.equal(countBars(sharedOpening.outcomeHost.html, "rubric"), 48);
assert.equal(countBars(sharedOpening.outcomeHost.html, "expense"), 0);
assert.doesNotMatch(sharedOpening.outcomeHost.html, /data-outcome-comparison-expense-detail-toggle/);
assertNoComparisonAverages(sharedOpening.outcomeHost.html);

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
assertNoComparisonAverages(sharedLegacy.outcomeHost.html);

const sharedSingleLegacy = makeContext({
  explicitDetail: false,
  outcomeVisible: true,
  data: {
    ...makeData(),
    outcome: [makeData().outcome[1]]
  }
});
sharedSingleLegacy.api.renderOutcomeComparisonChart();
assert.equal(countBars(sharedSingleLegacy.outcomeHost.html, "expense"), 24);
assertNoComparisonAverages(sharedSingleLegacy.outcomeHost.html);

sharedLegacy.api.renderIncomeComparisonChart();
assert.equal(countBars(sharedLegacy.incomeHost.html, "rubric"), 0);
assert.equal(countBars(sharedLegacy.incomeHost.html, "expense"), 24);
assert.match(sharedLegacy.incomeHost.html, /data-series-name='Salario .* Valor'/);
assert.match(sharedLegacy.incomeHost.html, /data-series-name='Salario .* Estimado'/);
assert.doesNotMatch(sharedLegacy.incomeHost.html, /data-outcome-comparison-expense-detail-toggle/);
assertNoComparisonAverages(sharedLegacy.incomeHost.html);

assert.match(novoBancoHtml, /DASHBOARD_EXPLICIT_OUTCOME_EXPENSE_DETAIL = true/);
assert.match(novoBancoHtml, /assets\/js\/cgd\.js\?v=20260812-5/);
assert.match(novoBancoHtml, /assets\/css\/styles\.css\?v=20260812-1/);
assert.match(styles, /\.nb-theme \.panel-stack\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\);/);
assert.doesNotMatch(cgdHtml, /DASHBOARD_EXPLICIT_OUTCOME_EXPENSE_DETAIL/);
assert.doesNotMatch(coverflexHtml, /DASHBOARD_EXPLICIT_OUTCOME_EXPENSE_DETAIL/);
assert.doesNotMatch(cgdHtml, /20260812-5/);
assert.doesNotMatch(coverflexHtml, /20260812-5/);
assert.match(cgd, /function computeOutcomeSeriesAverage\(series\)[\s\S]*return computeTwelveMonthAverage\(series\?\.values\);/);
assert.ok(
  (cgd.match(/resetOutcomeComparisonRubricSelectionToFirst\(\);\s*renderPanels\(\);/g) || []).length >= 3,
  "Every year-load render path must reset the comparison chart to the first valid rubric"
);
assert.notEqual("outcome-expense-detail-series", "outcome-comparison-expense-detail-series");
assert.match(cgd, /id='outcome-expense-detail-series'/);
assert.match(cgd, /id='outcome-comparison-expense-detail-series'/);

console.log("Outcome comparison detail regression checks passed.");
