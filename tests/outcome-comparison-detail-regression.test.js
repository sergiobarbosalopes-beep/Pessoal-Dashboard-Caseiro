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
const incomeComparisonToggleSource = sliceBetween(
  cgd,
  "window.cgdToggleIncomeComparisonChart =",
  "\nwindow.cgdToggleSavingsChart ="
);
const savingsComparisonToggleSource = sliceBetween(
  cgd,
  "window.cgdToggleSavingsComparisonChart =",
  "\nwindow.cgdToggleOutcomeChart ="
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
      [
        "[data-outcome-comparison-expense-detail-toggle]",
        "[data-income-comparison-revenue-detail-toggle]",
        "[data-savings-comparison-saving-detail-toggle]"
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
      name: "Salarios",
      expenses: [
        { id: 301, name: "Ordenado", monthData: monthData(1000, 1100) },
        { id: 302, name: "Bonus", monthData: monthData(200, 300) }
      ]
    },
    {
      id: 32,
      name: "Rendas",
      expenses: [
        { id: 303, name: "Apartamento", monthData: monthData(400, 450) }
      ]
    }
  ],
  savings: [
    {
      id: 41,
      name: "Reserva",
      expenses: [
        { id: 401, name: "Conta reserva", monthData: monthData(600, 650) },
        { id: 402, name: "Objetivo", monthData: monthData(100, 150) }
      ]
    },
    {
      id: 42,
      name: "Ferias",
      expenses: [
        { id: 403, name: "Viagem", monthData: monthData(250, 275) }
      ]
    }
  ]
});

const makeContext = ({
  explicitDetail,
  incomeExplicitDetail = explicitDetail,
  savingsExplicitDetail = explicitDetail,
  data = makeData(),
  outcomeVisible = false,
  incomeVisible = false,
  savingsVisible = false
}) => {
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
    incomeComparisonChartVisible: incomeVisible,
    incomeComparisonHiddenRubrics: new Set(),
    incomeComparisonHiddenExpenses: new Set(),
    incomeComparisonRevenueDetailVisible: false,
    incomeComparisonRevenueDetailRubricKey: null,
    savingsComparisonChartVisible: savingsVisible,
    savingsComparisonHiddenRubrics: new Set(),
    savingsComparisonHiddenExpenses: new Set(),
    savingsComparisonDetailVisible: false,
    savingsComparisonDetailRubricKey: null,
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
    isExplicitChartDetailEnabled: (kind) => (
      kind === "income"
        ? incomeExplicitDetail
        : kind === "savings"
          ? savingsExplicitDetail
          : explicitDetail
    ),
    months,
    positionOutcomeChartTooltip: () => {},
    requestAnimationFrame: (callback) => callback(),
    renderPanels: () => {
      if (api) {
        api.renderOutcomeComparisonChart();
        api.renderIncomeComparisonChart();
        api.renderSavingsComparisonChart();
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
    ${incomeComparisonToggleSource}
    ${savingsComparisonToggleSource}
    ${outcomeComparisonToggleSource}
    comparisonApi = {
      buildDataModel,
      buildComparisonSeriesForKind,
      computeChartVerticalScale,
      renderIncomeComparisonChart,
      renderSavingsComparisonChart,
      renderOutcomeComparisonChart,
      resetIncomeComparisonRubricSelectionToFirst,
      resetSavingsComparisonRubricSelectionToFirst,
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
const getComparisonBars = (html, key, valueKind) => (
  (html.match(/<rect(?=[^>]*data-comparison-point)[^>]*>/g) || [])
    .filter((tag) => (
      getAttribute(tag, "data-series-key") === key
      && getAttribute(tag, "data-bar-value-kind") === valueKind
    ))
    .map((tag) => ({
      month: getAttribute(tag, "data-month-name"),
      value: Number(getAttribute(tag, "data-value")),
      y: Number(getAttribute(tag, "y")),
      height: Number(getAttribute(tag, "height"))
    }))
);
const assertComparisonBarsPreserved = (
  html,
  key,
  expectedRealValues,
  expectedEstimatedValues,
  computeVerticalScale
) => {
  const realBars = getComparisonBars(html, key, "value");
  const estimatedBars = getComparisonBars(html, key, "estimated");
  assert.equal(realBars.length, 12);
  assert.equal(estimatedBars.length, 12);
  assert.deepEqual(realBars.map((bar) => bar.month), months);
  assert.deepEqual(estimatedBars.map((bar) => bar.month), months);
  assert.deepEqual(realBars.map((bar) => bar.value), expectedRealValues);
  assert.deepEqual(estimatedBars.map((bar) => bar.value), expectedEstimatedValues);

  const verticalScale = computeVerticalScale(
    [...expectedRealValues, ...expectedEstimatedValues],
    { top: 20, height: 262 }
  );
  const zeroY = verticalScale.yFor(0);
  [
    [realBars, expectedRealValues],
    [estimatedBars, expectedEstimatedValues]
  ].forEach(([bars, values]) => {
    bars.forEach((bar, monthIndex) => {
      const valueY = verticalScale.yFor(values[monthIndex]);
      assert.equal(bar.y, Number(Math.min(valueY, zeroY).toFixed(2)));
      assert.equal(bar.height, Number(Math.max(Math.abs(zeroY - valueY), 1).toFixed(2)));
    });
  });
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

const assertCollapsedRevenueDetail = (html) => {
  assert.match(html, /data-income-comparison-revenue-detail-toggle/);
  assert.match(html, /aria-expanded='false'/);
  assert.match(html, /aria-controls='income-comparison-revenue-detail-series'/);
  assert.match(html, />Mostrar receitas<\/button>/);
  assert.match(html, /id='income-comparison-revenue-detail-series'[^>]*\shidden(?:\s|>)/);
  assert.doesNotMatch(html, /data-outcome-comparison-expense-detail-toggle/);
  assert.doesNotMatch(html, />Mostrar despesas<\/button>|>Ocultar despesas<\/button>/);
};

const assertExpandedRevenueDetail = (html) => {
  assert.match(html, /data-income-comparison-revenue-detail-toggle/);
  assert.match(html, /aria-expanded='true'/);
  assert.match(html, />Ocultar receitas<\/button>/);
  assert.doesNotMatch(html, /id='income-comparison-revenue-detail-series'[^>]*\shidden(?:\s|>)/);
  assert.doesNotMatch(html, />Ocultar despesas<\/button>/);
};

const assertCollapsedSavingDetail = (html) => {
  assert.match(html, /data-savings-comparison-saving-detail-toggle/);
  assert.match(html, /aria-expanded='false'/);
  assert.match(html, /aria-controls='savings-comparison-saving-detail-series'/);
  assert.match(html, />Mostrar poupanças<\/button>/);
  assert.match(html, /id='savings-comparison-saving-detail-series'[^>]*\shidden(?:\s|>)/);
  assert.doesNotMatch(html, />Mostrar despesas<\/button>|>Mostrar receitas<\/button>/);
};

const assertExpandedSavingDetail = (html) => {
  assert.match(html, /data-savings-comparison-saving-detail-toggle/);
  assert.match(html, /aria-expanded='true'/);
  assert.match(html, />Ocultar poupanças<\/button>/);
  assert.doesNotMatch(html, />Ocultar despesas<\/button>|>Ocultar receitas<\/button>/);
  assert.doesNotMatch(html, /id='savings-comparison-saving-detail-series'[^>]*\shidden(?:\s|>)/);
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
assert.match(
  explicit.outcomeHost.html,
  /class='outcome-drilldown-toolbar outcome-comparison-toolbar has-expense-detail'/
);
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

const incomeExplicit = makeContext({
  explicitDetail: true,
  incomeVisible: false,
  outcomeVisible: true
});
incomeExplicit.state.outcomeComparisonHiddenRubrics.add("id-22");
incomeExplicit.state.outcomeComparisonExpenseDetailVisible = true;
incomeExplicit.state.outcomeComparisonExpenseDetailRubricKey = "id-11";
incomeExplicit.state.outcomeComparisonHiddenExpenses.add("id-11::id-102");
incomeExplicit.api.renderOutcomeComparisonChart();
const outcomeComparisonStateBeforeIncome = {
  visible: incomeExplicit.state.outcomeComparisonChartVisible,
  detailVisible: incomeExplicit.state.outcomeComparisonExpenseDetailVisible,
  detailKey: incomeExplicit.state.outcomeComparisonExpenseDetailRubricKey,
  hiddenRubrics: Array.from(incomeExplicit.state.outcomeComparisonHiddenRubrics),
  hiddenExpenses: Array.from(incomeExplicit.state.outcomeComparisonHiddenExpenses)
};
const incomeRubricActual = months.map((_, index) => 1200 + (index * 2));
const incomeRubricEstimated = months.map((_, index) => 1400 + (index * 2));
const firstIncomeActual = months.map((_, index) => 1000 + index);
const firstIncomeEstimated = months.map((_, index) => 1100 + index);

incomeExplicit.context.window.cgdToggleIncomeComparisonChart();
assert.equal(incomeExplicit.state.incomeComparisonChartVisible, true);
assert.match(
  incomeExplicit.incomeHost.html,
  /class='outcome-drilldown-toolbar outcome-comparison-toolbar has-expense-detail'/
);
assert.equal(countBars(incomeExplicit.incomeHost.html, "rubric"), 24);
assert.equal(countBars(incomeExplicit.incomeHost.html, "expense"), 0);
assert.equal(countBarsForKey(incomeExplicit.incomeHost.html, "id-31"), 24);
assert.equal(countBarsForKey(incomeExplicit.incomeHost.html, "id-32"), 0);
assert.equal(countPressed(incomeExplicit.incomeHost.html, "data-comparison-chart-toggle", "true"), 1);
assert.equal(countPressed(incomeExplicit.incomeHost.html, "data-comparison-chart-toggle", "false"), 1);
assertCollapsedRevenueDetail(incomeExplicit.incomeHost.html);
assertComparisonBarsPreserved(
  incomeExplicit.incomeHost.html,
  "id-31",
  incomeRubricActual,
  incomeRubricEstimated,
  incomeExplicit.api.computeChartVerticalScale
);
assertDualAverages(incomeExplicit.incomeHost.html, {
  sourceKind: "rubric",
  sourceKey: "id-31",
  name: "Salarios",
  color: "#115511",
  real: 1211,
  estimated: 1411
});

incomeExplicit.incomeHost.click("data-income-comparison-revenue-detail-toggle");
assert.equal(countBars(incomeExplicit.incomeHost.html, "rubric"), 0);
assert.equal(countBars(incomeExplicit.incomeHost.html, "expense"), 24);
assert.equal(countBarsForKey(incomeExplicit.incomeHost.html, "id-301"), 24);
assert.equal(countBarsForKey(incomeExplicit.incomeHost.html, "id-302"), 0);
assert.equal(countPressed(incomeExplicit.incomeHost.html, "data-comparison-drilldown-toggle", "true"), 1);
assert.equal(countPressed(incomeExplicit.incomeHost.html, "data-comparison-drilldown-toggle", "false"), 1);
assertExpandedRevenueDetail(incomeExplicit.incomeHost.html);
assertComparisonBarsPreserved(
  incomeExplicit.incomeHost.html,
  "id-301",
  firstIncomeActual,
  firstIncomeEstimated,
  incomeExplicit.api.computeChartVerticalScale
);
assertDualAverages(incomeExplicit.incomeHost.html, {
  sourceKind: "expense",
  sourceKey: "id-301",
  name: "Ordenado",
  color: "#337733",
  real: 1005.5,
  estimated: 1105.5
});
assert.equal(incomeExplicit.incomeHost.focusCount, 1);

incomeExplicit.incomeHost.click("data-comparison-drilldown-toggle", "id-302");
assert.equal(countBars(incomeExplicit.incomeHost.html, "expense"), 48);
assertNoComparisonAverages(incomeExplicit.incomeHost.html);
incomeExplicit.incomeHost.click("data-comparison-drilldown-toggle", "id-301");
assert.equal(countBars(incomeExplicit.incomeHost.html, "expense"), 24);
assert.equal(countBarsForKey(incomeExplicit.incomeHost.html, "id-302"), 24);
assertDualAverages(incomeExplicit.incomeHost.html, {
  sourceKind: "expense",
  sourceKey: "id-302",
  name: "Bonus",
  color: "#448844",
  real: 205.5,
  estimated: 305.5
});

incomeExplicit.incomeHost.click("data-income-comparison-revenue-detail-toggle");
assert.equal(countBarsForKey(incomeExplicit.incomeHost.html, "id-31"), 24);
assertCollapsedRevenueDetail(incomeExplicit.incomeHost.html);
assert.equal(incomeExplicit.incomeHost.focusCount, 2);
incomeExplicit.incomeHost.click("data-income-comparison-revenue-detail-toggle");
assert.equal(countBarsForKey(incomeExplicit.incomeHost.html, "id-301"), 24);
assert.equal(countBarsForKey(incomeExplicit.incomeHost.html, "id-302"), 0);

incomeExplicit.incomeHost.click("data-income-comparison-revenue-detail-toggle");
incomeExplicit.incomeHost.click("data-comparison-chart-toggle", "id-32");
assert.equal(countBars(incomeExplicit.incomeHost.html, "rubric"), 48);
assert.equal(incomeExplicit.state.incomeComparisonRevenueDetailVisible, false);
assert.doesNotMatch(incomeExplicit.incomeHost.html, /data-income-comparison-revenue-detail-toggle/);
assertNoComparisonAverages(incomeExplicit.incomeHost.html);
incomeExplicit.incomeHost.click("data-comparison-chart-toggle", "id-31");
assert.equal(countBarsForKey(incomeExplicit.incomeHost.html, "id-32"), 24);
assertCollapsedRevenueDetail(incomeExplicit.incomeHost.html);
assertDualAverages(incomeExplicit.incomeHost.html, {
  sourceKind: "rubric",
  sourceKey: "id-32",
  name: "Rendas",
  color: "#226622",
  real: 405.5,
  estimated: 455.5
});
incomeExplicit.incomeHost.click("data-income-comparison-revenue-detail-toggle");
assert.equal(countBarsForKey(incomeExplicit.incomeHost.html, "id-303"), 24);

incomeExplicit.incomeHost.click("data-income-comparison-chart-close-main");
assert.equal(incomeExplicit.state.incomeComparisonChartVisible, false);
assert.equal(incomeExplicit.state.incomeComparisonRevenueDetailVisible, false);
assert.equal(incomeExplicit.state.incomeComparisonHiddenRubrics.size, 0);
assert.equal(incomeExplicit.state.incomeComparisonHiddenExpenses.size, 0);
assert.equal(incomeExplicit.incomeHost.html, "");
incomeExplicit.context.window.cgdToggleIncomeComparisonChart();
assert.equal(countBarsForKey(incomeExplicit.incomeHost.html, "id-31"), 24);
assertCollapsedRevenueDetail(incomeExplicit.incomeHost.html);

const reorderedIncomeComparison = makeData();
reorderedIncomeComparison.income.reverse();
incomeExplicit.state.data = reorderedIncomeComparison;
incomeExplicit.api.resetIncomeComparisonRubricSelectionToFirst();
incomeExplicit.api.renderIncomeComparisonChart();
assert.equal(countBarsForKey(incomeExplicit.incomeHost.html, "id-32"), 24);
assert.equal(countBarsForKey(incomeExplicit.incomeHost.html, "id-31"), 0);
assert.equal(incomeExplicit.state.incomeComparisonRevenueDetailVisible, false);
assertDualAverages(incomeExplicit.incomeHost.html, {
  sourceKind: "rubric",
  sourceKey: "id-32",
  name: "Rendas",
  color: "#115511",
  real: 405.5,
  estimated: 455.5
});
assert.deepEqual({
  visible: incomeExplicit.state.outcomeComparisonChartVisible,
  detailVisible: incomeExplicit.state.outcomeComparisonExpenseDetailVisible,
  detailKey: incomeExplicit.state.outcomeComparisonExpenseDetailRubricKey,
  hiddenRubrics: Array.from(incomeExplicit.state.outcomeComparisonHiddenRubrics),
  hiddenExpenses: Array.from(incomeExplicit.state.outcomeComparisonHiddenExpenses)
}, outcomeComparisonStateBeforeIncome);

const savingsExplicit = makeContext({
  explicitDetail: true,
  savingsVisible: false
});
const otherComparisonStateBeforeSavings = {
  incomeVisible: savingsExplicit.state.incomeComparisonChartVisible,
  incomeHidden: Array.from(savingsExplicit.state.incomeComparisonHiddenRubrics),
  outcomeVisible: savingsExplicit.state.outcomeComparisonChartVisible,
  outcomeHidden: Array.from(savingsExplicit.state.outcomeComparisonHiddenRubrics)
};
const savingsRubricActual = months.map((_, index) => 700 + (index * 2));
const savingsRubricEstimated = months.map((_, index) => 800 + (index * 2));
const firstSavingActual = months.map((_, index) => 600 + index);
const firstSavingEstimated = months.map((_, index) => 650 + index);
savingsExplicit.context.window.cgdToggleSavingsComparisonChart();
assert.equal(savingsExplicit.state.savingsComparisonChartVisible, true);
assert.equal(countBars(savingsExplicit.savingsHost.html, "rubric"), 24);
assert.equal(countBars(savingsExplicit.savingsHost.html, "expense"), 0);
assert.equal(countBarsForKey(savingsExplicit.savingsHost.html, "id-41"), 24);
assert.equal(countBarsForKey(savingsExplicit.savingsHost.html, "id-42"), 0);
assert.equal(countPressed(savingsExplicit.savingsHost.html, "data-comparison-chart-toggle", "true"), 1);
assert.equal(countPressed(savingsExplicit.savingsHost.html, "data-comparison-chart-toggle", "false"), 1);
assertCollapsedSavingDetail(savingsExplicit.savingsHost.html);
assertComparisonBarsPreserved(
  savingsExplicit.savingsHost.html,
  "id-41",
  savingsRubricActual,
  savingsRubricEstimated,
  savingsExplicit.api.computeChartVerticalScale
);
assertDualAverages(savingsExplicit.savingsHost.html, {
  sourceKind: "rubric",
  sourceKey: "id-41",
  name: "Reserva",
  color: "#111155",
  real: 711,
  estimated: 811
});

savingsExplicit.savingsHost.click("data-savings-comparison-saving-detail-toggle");
assert.equal(countBars(savingsExplicit.savingsHost.html, "rubric"), 0);
assert.equal(countBars(savingsExplicit.savingsHost.html, "expense"), 24);
assert.equal(countBarsForKey(savingsExplicit.savingsHost.html, "id-401"), 24);
assert.equal(countBarsForKey(savingsExplicit.savingsHost.html, "id-402"), 0);
assertExpandedSavingDetail(savingsExplicit.savingsHost.html);
assertComparisonBarsPreserved(
  savingsExplicit.savingsHost.html,
  "id-401",
  firstSavingActual,
  firstSavingEstimated,
  savingsExplicit.api.computeChartVerticalScale
);
assertDualAverages(savingsExplicit.savingsHost.html, {
  sourceKind: "expense",
  sourceKey: "id-401",
  name: "Conta reserva",
  color: "#333377",
  real: 605.5,
  estimated: 655.5
});
savingsExplicit.savingsHost.click("data-comparison-drilldown-toggle", "id-402");
assert.equal(countBars(savingsExplicit.savingsHost.html, "expense"), 48);
assertNoComparisonAverages(savingsExplicit.savingsHost.html);
savingsExplicit.savingsHost.click("data-comparison-drilldown-toggle", "id-401");
assert.equal(countBarsForKey(savingsExplicit.savingsHost.html, "id-402"), 24);
assertDualAverages(savingsExplicit.savingsHost.html, {
  sourceKind: "expense",
  sourceKey: "id-402",
  name: "Objetivo",
  color: "#444488",
  real: 105.5,
  estimated: 155.5
});
savingsExplicit.savingsHost.click("data-savings-comparison-saving-detail-toggle");
assertCollapsedSavingDetail(savingsExplicit.savingsHost.html);
savingsExplicit.savingsHost.click("data-savings-comparison-saving-detail-toggle");
assert.equal(countBarsForKey(savingsExplicit.savingsHost.html, "id-401"), 24);
assert.equal(countBarsForKey(savingsExplicit.savingsHost.html, "id-402"), 0);
savingsExplicit.savingsHost.click("data-savings-comparison-saving-detail-toggle");
savingsExplicit.savingsHost.click("data-comparison-chart-toggle", "id-42");
assert.equal(countBars(savingsExplicit.savingsHost.html, "rubric"), 48);
assert.equal(savingsExplicit.state.savingsComparisonDetailVisible, false);
assertNoComparisonAverages(savingsExplicit.savingsHost.html);
savingsExplicit.savingsHost.click("data-comparison-chart-toggle", "id-41");
assert.equal(countBarsForKey(savingsExplicit.savingsHost.html, "id-42"), 24);
assertCollapsedSavingDetail(savingsExplicit.savingsHost.html);
savingsExplicit.savingsHost.click("data-savings-comparison-saving-detail-toggle");
assert.equal(countBarsForKey(savingsExplicit.savingsHost.html, "id-403"), 24);
savingsExplicit.savingsHost.click("data-savings-comparison-chart-close-main");
assert.equal(savingsExplicit.state.savingsComparisonChartVisible, false);
assert.equal(savingsExplicit.state.savingsComparisonDetailVisible, false);
assert.equal(savingsExplicit.state.savingsComparisonHiddenRubrics.size, 0);
assert.equal(savingsExplicit.state.savingsComparisonHiddenExpenses.size, 0);
savingsExplicit.context.window.cgdToggleSavingsComparisonChart();
assert.equal(countBarsForKey(savingsExplicit.savingsHost.html, "id-41"), 24);
assertCollapsedSavingDetail(savingsExplicit.savingsHost.html);
assert.deepEqual({
  incomeVisible: savingsExplicit.state.incomeComparisonChartVisible,
  incomeHidden: Array.from(savingsExplicit.state.incomeComparisonHiddenRubrics),
  outcomeVisible: savingsExplicit.state.outcomeComparisonChartVisible,
  outcomeHidden: Array.from(savingsExplicit.state.outcomeComparisonHiddenRubrics)
}, otherComparisonStateBeforeSavings);

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
const rawActualValues = [0, -12.3, 1234.5, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const rawEstimatedValues = [1200, -12.3, 0, 0, 0, 0, 5, 0, 0, -20, 0, 0];
const rawRealAverageValues = [1200, -12.3, 1234.5, 0, 0, 0, 5, 0, 0, -20, 0, 0];
const rawRubricSeries = rawNormalization.api.buildComparisonSeriesForKind("outcome")[0];
assert.deepEqual(Array.from(rawRubricSeries.values), rawActualValues);
assert.deepEqual(Array.from(rawRubricSeries.estimatedValues), rawEstimatedValues);
assert.deepEqual(Array.from(rawRubricSeries.realAverageValues), rawRealAverageValues);
rawNormalization.context.window.cgdToggleOutcomeComparisonChart();
assert.equal(countBars(rawNormalization.outcomeHost.html, "rubric"), 24);
assert.match(rawNormalization.outcomeHost.html, /data-value='1200\.00'/);
assert.match(rawNormalization.outcomeHost.html, /data-value='-12\.30'/);
assertComparisonBarsPreserved(
  rawNormalization.outcomeHost.html,
  "id-77",
  rawActualValues,
  rawEstimatedValues,
  rawNormalization.api.computeChartVerticalScale
);
assertDualAverages(rawNormalization.outcomeHost.html, {
  sourceKind: "rubric",
  sourceKey: "id-77",
  name: "Normalizacao",
  color: "#111111",
  real: 2407.2 / 12,
  estimated: 1172.7 / 12
});
rawNormalization.outcomeHost.click("data-outcome-comparison-expense-detail-toggle");
assertComparisonBarsPreserved(
  rawNormalization.outcomeHost.html,
  "id-701",
  rawActualValues,
  rawEstimatedValues,
  rawNormalization.api.computeChartVerticalScale
);
assertDualAverages(rawNormalization.outcomeHost.html, {
  sourceKind: "expense",
  sourceKey: "id-701",
  name: "Legacy",
  color: "#333333",
  real: 2407.2 / 12,
  estimated: 1172.7 / 12
});

const zeroedMonths = makeContext({
  explicitDetail: true,
  data: { income: [], savings: [], outcome: [] }
});
zeroedMonths.state.data = zeroedMonths.api.buildDataModel(
  [{
    rubrica_id: 78,
    rubrica_desc: "Meses zerados",
    rubrica_tipo: "Despesa",
    rubrica_seq: 1,
    mes: 1
  }],
  months.map((_, index) => ({
    rubrica_id: 78,
    despesa_id: 708,
    despesa_desc: "Zero explícito",
    despesa_seq: 1,
    mes: index + 1,
    valor: 0,
    valor_estimado: 120,
    zerado: true,
    totalizador: true
  })),
  new Set()
);
zeroedMonths.context.window.cgdToggleOutcomeComparisonChart();
assertComparisonBarsPreserved(
  zeroedMonths.outcomeHost.html,
  "id-78",
  months.map(() => 0),
  months.map(() => 120),
  zeroedMonths.api.computeChartVerticalScale
);
assertDualAverages(zeroedMonths.outcomeHost.html, {
  sourceKind: "rubric",
  sourceKey: "id-78",
  name: "Meses zerados",
  color: "#111111",
  real: 0,
  estimated: 120
});

const outOfRangeHybridAverage = makeContext({
  explicitDetail: true,
  data: {
    income: [],
    savings: [],
    outcome: [{
      id: 79,
      name: "Fallback acima das barras",
      expenses: [
        {
          id: 709,
          name: "Real",
          monthData: months.map(() => ({ valor: 100, valorEstimado: 0, totalizador: true }))
        },
        {
          id: 710,
          name: "Estimado",
          monthData: months.map(() => ({ valor: 0, valorEstimado: 100, totalizador: true }))
        }
      ]
    }]
  }
});
outOfRangeHybridAverage.context.window.cgdToggleOutcomeComparisonChart();
const outOfRangeReal = getComparisonAverage(outOfRangeHybridAverage.outcomeHost.html, "real");
assert.equal(outOfRangeReal.value, 200);
assert.ok(outOfRangeReal.y1 >= 20 && outOfRangeReal.y1 <= 282);
assert.deepEqual(
  getComparisonBars(outOfRangeHybridAverage.outcomeHost.html, "id-79", "value")
    .map((bar) => bar.value),
  months.map(() => 100)
);
assert.deepEqual(
  getComparisonBars(outOfRangeHybridAverage.outcomeHost.html, "id-79", "estimated")
    .map((bar) => bar.value),
  months.map(() => 100)
);

const itemByItemFallback = makeContext({ explicitDetail: true });
const mixedItemA = [
  { valor: 100, valor_Estimado: 999 },
  { valor: 0, valor_Estimado: 10 },
  { valor: null, valor_Estimado: 20 },
  { valor: "", valor_Estimado: 30 },
  { valor: Number.NaN, valor_Estimado: 40 },
  { valor: 0, valor_Estimado: -2 },
  { valor: -5, valor_Estimado: 500 },
  { valor: 0, valor_Estimado: 0 },
  { valor: 0, valor_Estimado: null },
  { valor: 0, valor_Estimado: Number.POSITIVE_INFINITY },
  { valor: 0, valor_Estimado: 0 },
  { valor: 0, valor_Estimado: 5 }
];
const mixedItemB = [
  { valor: 0, valor_estimado: 40 },
  { valor: 20, valor_estimado: 200 },
  { valor: 30, valor_estimado: 300 },
  { valor: 0, valor_estimado: 50 },
  { valor: 0, valor_estimado: 60 },
  { valor: 0, valor_estimado: 0 },
  { valor: 0, valor_estimado: -7 },
  { valor: 0, valor_estimado: 0 },
  { valor: 0, valor_estimado: 9 },
  { valor: 0, valor_estimado: 10 },
  { valor: 0, valor_estimado: -11 },
  { valor: 0, valor_estimado: 0 }
];
itemByItemFallback.state.data = itemByItemFallback.api.buildDataModel(
  [{
    rubrica_id: 81,
    rubrica_desc: "Fallback item a item",
    rubrica_tipo: "Despesa",
    rubrica_seq: 1,
    mes: 1
  }],
  [
    ...mixedItemA.map((values, index) => ({
      ...values,
      rubrica_id: 81,
      despesa_id: 811,
      despesa_desc: "Misto legacy",
      despesa_seq: 1,
      mes: index + 1,
      totalizador: true
    })),
    ...mixedItemB.map((values, index) => ({
      ...values,
      rubrica_id: 81,
      despesa_id: 812,
      despesa_desc: "Misto atual",
      despesa_seq: 2,
      mes: index + 1,
      totalizador: true
    }))
  ],
  new Set()
);
const mixedRubricActual = [100, 20, 30, 0, 0, 0, -5, 0, 0, 0, 0, 0];
const mixedRubricEstimated = [1039, 210, 320, 80, 100, -2, 493, 0, 9, 10, -11, 5];
const mixedRubricResolved = [140, 30, 50, 80, 100, -2, -12, 0, 9, 10, -11, 5];
const mixedItemAActual = [100, 0, 0, 0, 0, 0, -5, 0, 0, 0, 0, 0];
const mixedItemAEstimated = [999, 10, 20, 30, 40, -2, 500, 0, 0, 0, 0, 5];
const mixedItemAResolved = [100, 10, 20, 30, 40, -2, -5, 0, 0, 0, 0, 5];
const mixedRubricSeries = itemByItemFallback.api.buildComparisonSeriesForKind("outcome")[0];
assert.deepEqual(Array.from(mixedRubricSeries.values), mixedRubricActual);
assert.deepEqual(Array.from(mixedRubricSeries.estimatedValues), mixedRubricEstimated);
assert.deepEqual(Array.from(mixedRubricSeries.realAverageValues), mixedRubricResolved);
assert.equal(mixedRubricSeries.values[0], 100);
assert.equal(mixedRubricSeries.realAverageValues[0], 140);
assert.equal(mixedRubricSeries.expenses[0].realAverageValues[6], -5);
itemByItemFallback.context.window.cgdToggleOutcomeComparisonChart();
assertComparisonBarsPreserved(
  itemByItemFallback.outcomeHost.html,
  "id-81",
  mixedRubricActual,
  mixedRubricEstimated,
  itemByItemFallback.api.computeChartVerticalScale
);
assertDualAverages(itemByItemFallback.outcomeHost.html, {
  sourceKind: "rubric",
  sourceKey: "id-81",
  name: "Fallback item a item",
  color: "#111111",
  real: 399 / 12,
  estimated: 2253 / 12
});
itemByItemFallback.outcomeHost.click("data-outcome-comparison-expense-detail-toggle");
assertComparisonBarsPreserved(
  itemByItemFallback.outcomeHost.html,
  "id-811",
  mixedItemAActual,
  mixedItemAEstimated,
  itemByItemFallback.api.computeChartVerticalScale
);
assertDualAverages(itemByItemFallback.outcomeHost.html, {
  sourceKind: "expense",
  sourceKey: "id-811",
  name: "Misto legacy",
  color: "#333333",
  real: 198 / 12,
  estimated: 1602 / 12
});
assert.deepEqual(
  Array.from(
    itemByItemFallback.api
      .buildComparisonSeriesForKind("outcome")[0]
      .expenses[0]
      .realAverageValues
  ),
  mixedItemAResolved
);

const incomeItemByItemFallback = makeContext({
  explicitDetail: true,
  incomeVisible: false,
  data: { income: [], savings: [], outcome: [] }
});
incomeItemByItemFallback.state.data = incomeItemByItemFallback.api.buildDataModel(
  [{
    rubrica_id: 181,
    rubrica_desc: "Receita fallback item a item",
    rubrica_tipo: "Receita",
    rubrica_seq: 1,
    mes: 1
  }],
  [
    ...mixedItemA.map((values, index) => ({
      ...values,
      rubrica_id: 181,
      despesa_id: 1811,
      despesa_desc: "Receita legacy",
      despesa_seq: 1,
      mes: index + 1,
      totalizador: true
    })),
    ...mixedItemB.map((values, index) => ({
      ...values,
      rubrica_id: 181,
      despesa_id: 1812,
      despesa_desc: "Receita atual",
      despesa_seq: 2,
      mes: index + 1,
      totalizador: true
    }))
  ],
  new Set()
);
const mixedIncomeSeries = incomeItemByItemFallback.api.buildComparisonSeriesForKind("income")[0];
assert.deepEqual(Array.from(mixedIncomeSeries.values), mixedRubricActual);
assert.deepEqual(Array.from(mixedIncomeSeries.estimatedValues), mixedRubricEstimated);
assert.deepEqual(Array.from(mixedIncomeSeries.realAverageValues), mixedRubricResolved);
assert.equal(mixedIncomeSeries.values[0], 100);
assert.equal(mixedIncomeSeries.realAverageValues[0], 140);
incomeItemByItemFallback.context.window.cgdToggleIncomeComparisonChart();
assertComparisonBarsPreserved(
  incomeItemByItemFallback.incomeHost.html,
  "id-181",
  mixedRubricActual,
  mixedRubricEstimated,
  incomeItemByItemFallback.api.computeChartVerticalScale
);
assertDualAverages(incomeItemByItemFallback.incomeHost.html, {
  sourceKind: "rubric",
  sourceKey: "id-181",
  name: "Receita fallback item a item",
  color: "#115511",
  real: 399 / 12,
  estimated: 2253 / 12
});
incomeItemByItemFallback.incomeHost.click("data-income-comparison-revenue-detail-toggle");
assertComparisonBarsPreserved(
  incomeItemByItemFallback.incomeHost.html,
  "id-1811",
  mixedItemAActual,
  mixedItemAEstimated,
  incomeItemByItemFallback.api.computeChartVerticalScale
);
assertDualAverages(incomeItemByItemFallback.incomeHost.html, {
  sourceKind: "expense",
  sourceKey: "id-1811",
  name: "Receita legacy",
  color: "#337733",
  real: 198 / 12,
  estimated: 1602 / 12
});

const savingsItemByItemFallback = makeContext({
  explicitDetail: true,
  savingsVisible: false,
  data: { income: [], savings: [], outcome: [] }
});
savingsItemByItemFallback.state.data = savingsItemByItemFallback.api.buildDataModel(
  [{
    rubrica_id: 281,
    rubrica_desc: "Poupança fallback item a item",
    rubrica_tipo: "Aprovisionamento",
    rubrica_seq: 1,
    mes: 1
  }],
  [
    ...mixedItemA.map((values, index) => ({
      ...values,
      rubrica_id: 281,
      despesa_id: 2811,
      despesa_desc: "Poupança legacy",
      despesa_seq: 1,
      mes: index + 1,
      totalizador: true
    })),
    ...mixedItemB.map((values, index) => ({
      ...values,
      rubrica_id: 281,
      despesa_id: 2812,
      despesa_desc: "Poupança atual",
      despesa_seq: 2,
      mes: index + 1,
      totalizador: true
    })),
    ...months.map((_, index) => ({
      valor: 9999,
      valor_estimado: 8888,
      rubrica_id: 281,
      despesa_id: 2813,
      despesa_desc: "Poupança não totalizadora",
      despesa_seq: 3,
      mes: index + 1,
      totalizador: false
    }))
  ],
  new Set()
);
const mixedSavingsSeries = savingsItemByItemFallback.api.buildComparisonSeriesForKind("savings")[0];
assert.deepEqual(Array.from(mixedSavingsSeries.values), mixedRubricActual);
assert.deepEqual(Array.from(mixedSavingsSeries.estimatedValues), mixedRubricEstimated);
assert.deepEqual(Array.from(mixedSavingsSeries.realAverageValues), mixedRubricResolved);
assert.equal(mixedSavingsSeries.values[0], 100);
assert.equal(mixedSavingsSeries.realAverageValues[0], 140);
assert.equal(mixedSavingsSeries.expenses.length, 3);
assert.equal(mixedSavingsSeries.expenses[2].values[0], 9999);
savingsItemByItemFallback.context.window.cgdToggleSavingsComparisonChart();
assertComparisonBarsPreserved(
  savingsItemByItemFallback.savingsHost.html,
  "id-281",
  mixedRubricActual,
  mixedRubricEstimated,
  savingsItemByItemFallback.api.computeChartVerticalScale
);
assertDualAverages(savingsItemByItemFallback.savingsHost.html, {
  sourceKind: "rubric",
  sourceKey: "id-281",
  name: "Poupança fallback item a item",
  color: "#111155",
  real: 399 / 12,
  estimated: 2253 / 12
});
savingsItemByItemFallback.savingsHost.click("data-savings-comparison-saving-detail-toggle");
assertComparisonBarsPreserved(
  savingsItemByItemFallback.savingsHost.html,
  "id-2811",
  mixedItemAActual,
  mixedItemAEstimated,
  savingsItemByItemFallback.api.computeChartVerticalScale
);
assertDualAverages(savingsItemByItemFallback.savingsHost.html, {
  sourceKind: "expense",
  sourceKey: "id-2811",
  name: "Poupança legacy",
  color: "#333377",
  real: 198 / 12,
  estimated: 1602 / 12
});

const incomeZeroReal = makeContext({
  explicitDetail: true,
  incomeVisible: false,
  data: {
    income: [{
      id: 188,
      name: "Receita real zero",
      expenses: [{
        id: 1801,
        name: "Estimativa futura",
        monthData: months.map((_, index) => ({
          valor: 0,
          valorEstimado: 120 + index
        }))
      }]
    }],
    savings: [],
    outcome: []
  }
});
incomeZeroReal.context.window.cgdToggleIncomeComparisonChart();
assertComparisonBarsPreserved(
  incomeZeroReal.incomeHost.html,
  "id-188",
  months.map(() => 0),
  months.map((_, index) => 120 + index),
  incomeZeroReal.api.computeChartVerticalScale
);
assertDualAverages(incomeZeroReal.incomeHost.html, {
  sourceKind: "rubric",
  sourceKey: "id-188",
  name: "Receita real zero",
  color: "#115511",
  real: 125.5,
  estimated: 125.5
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
  real: 125.5,
  estimated: 125.5
});
assert.match(zeroReal.outcomeHost.html, /Média Real: 125\.50/);

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

const maliciousIncome = makeContext({
  explicitDetail: true,
  incomeVisible: false,
  data: {
    income: [{
      id: 166,
      name: "Receita <img src=x onerror=alert(3)>",
      expenses: [{
        id: 1601,
        name: "Entrada '><svg onload=alert(4)>",
        monthData: monthData(10, 20)
      }]
    }],
    savings: [],
    outcome: []
  }
});
maliciousIncome.context.window.cgdToggleIncomeComparisonChart();
assert.match(maliciousIncome.incomeHost.html, /Receita &lt;img/);
assert.doesNotMatch(maliciousIncome.incomeHost.html, /<img/);
assert.match(
  getComparisonAverage(maliciousIncome.incomeHost.html, "real").ariaLabel,
  /Receita &lt;img src=x onerror=alert\(3\)&gt;/
);
maliciousIncome.incomeHost.click("data-income-comparison-revenue-detail-toggle");
assert.match(maliciousIncome.incomeHost.html, /Entrada &#39;&gt;&lt;svg/);
assert.doesNotMatch(maliciousIncome.incomeHost.html, /<svg onload/);
assert.match(
  getComparisonAverage(maliciousIncome.incomeHost.html, "estimated").ariaLabel,
  /Entrada &#39;&gt;&lt;svg onload=alert\(4\)&gt;/
);

const maliciousSavings = makeContext({
  explicitDetail: true,
  savingsVisible: false,
  data: {
    income: [],
    outcome: [],
    savings: [{
      id: 266,
      name: "Poupança <img src=x onerror=alert(5)>",
      expenses: [{
        id: 2601,
        name: "Conta '><svg onload=alert(6)>",
        monthData: monthData(10, 20)
      }]
    }]
  }
});
maliciousSavings.context.window.cgdToggleSavingsComparisonChart();
assert.match(maliciousSavings.savingsHost.html, /Poupança &lt;img/);
assert.doesNotMatch(maliciousSavings.savingsHost.html, /<img/);
maliciousSavings.savingsHost.click("data-savings-comparison-saving-detail-toggle");
assert.match(maliciousSavings.savingsHost.html, /Conta &#39;&gt;&lt;svg/);
assert.doesNotMatch(maliciousSavings.savingsHost.html, /<svg onload/);
assert.match(
  getComparisonAverage(maliciousSavings.savingsHost.html, "estimated").ariaLabel,
  /Conta &#39;&gt;&lt;svg onload=alert\(6\)&gt;/
);

const emptyIncome = makeContext({
  explicitDetail: true,
  incomeVisible: false,
  data: {
    income: [{
      id: 155,
      name: "Receita sem valores",
      expenses: [{ id: 1501, name: "Sem valores", monthData: zeroMonthData() }]
    }],
    savings: [],
    outcome: []
  }
});
emptyIncome.context.window.cgdToggleIncomeComparisonChart();
assert.equal(countBars(emptyIncome.incomeHost.html, "rubric"), 0);
assert.equal(countBars(emptyIncome.incomeHost.html, "expense"), 0);
assert.match(emptyIncome.incomeHost.html, /Ainda nao existem valores para comparar/);
assert.doesNotMatch(emptyIncome.incomeHost.html, /data-income-comparison-revenue-detail-toggle/);
assertNoComparisonAverages(emptyIncome.incomeHost.html);

const emptySavings = makeContext({
  explicitDetail: true,
  savingsVisible: false,
  data: {
    income: [],
    outcome: [],
    savings: [{
      id: 255,
      name: "Poupança sem valores",
      expenses: [{ id: 2501, name: "Sem valores", monthData: zeroMonthData() }]
    }]
  }
});
emptySavings.context.window.cgdToggleSavingsComparisonChart();
assert.equal(countBars(emptySavings.savingsHost.html, "rubric"), 0);
assert.equal(countBars(emptySavings.savingsHost.html, "expense"), 0);
assert.match(emptySavings.savingsHost.html, /Ainda nao existem valores para comparar/);
assert.doesNotMatch(emptySavings.savingsHost.html, /data-savings-comparison-saving-detail-toggle/);
assertNoComparisonAverages(emptySavings.savingsHost.html);

const sharedOpening = makeContext({ explicitDetail: false });
sharedOpening.context.window.cgdToggleOutcomeComparisonChart();
assert.equal(countBars(sharedOpening.outcomeHost.html, "rubric"), 48);
assert.equal(countBars(sharedOpening.outcomeHost.html, "expense"), 0);
assert.doesNotMatch(sharedOpening.outcomeHost.html, /data-outcome-comparison-expense-detail-toggle/);
assert.doesNotMatch(sharedOpening.outcomeHost.html, /outcome-comparison-toolbar/);
assertNoComparisonAverages(sharedOpening.outcomeHost.html);

const sharedLegacy = makeContext({
  explicitDetail: false,
  outcomeVisible: true,
  incomeVisible: true,
  data: {
    ...makeData(),
    income: [makeData().income[0]],
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
assert.equal(countBars(sharedLegacy.incomeHost.html, "expense"), 48);
assert.match(sharedLegacy.incomeHost.html, /data-series-name='Ordenado .* Valor'/);
assert.match(sharedLegacy.incomeHost.html, /data-series-name='Ordenado .* Estimado'/);
assert.match(sharedLegacy.incomeHost.html, /data-series-name='Bonus .* Valor'/);
assert.doesNotMatch(sharedLegacy.incomeHost.html, /data-income-comparison-revenue-detail-toggle/);
assert.doesNotMatch(sharedLegacy.incomeHost.html, /data-outcome-comparison-expense-detail-toggle/);
assertNoComparisonAverages(sharedLegacy.incomeHost.html);

assert.match(novoBancoHtml, /DASHBOARD_EXPLICIT_CHART_DETAIL_KINDS = \["income", "outcome"\]/);
assert.match(cgdHtml, /DASHBOARD_EXPLICIT_CHART_DETAIL_KINDS = \["income", "savings", "outcome"\]/);
assert.match(coverflexHtml, /DASHBOARD_EXPLICIT_CHART_DETAIL_KINDS = \["income", "outcome"\]/);
assert.match(novoBancoHtml, /assets\/js\/cgd\.js\?v=20260813-2/);
assert.match(novoBancoHtml, /assets\/css\/styles\.css\?v=20260812-6/);
assert.match(coverflexHtml, /assets\/js\/cgd\.js\?v=20260812-8/);
assert.match(coverflexHtml, /assets\/css\/styles\.css\?v=20260812-4/);
assert.match(cgdHtml, /assets\/js\/cgd\.js\?v=20260813-2/);
assert.match(cgdHtml, /assets\/css\/styles\.css\?v=20260812-6/);
assert.match(styles, /\.explicit-chart-detail \.panel-stack\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\);/);
const comparisonControlRule = styles.match(
  /\.explicit-chart-detail \.outcome-drilldown-toolbar\.outcome-comparison-toolbar > \.outcome-expense-detail-toggle,\s*\.explicit-chart-detail \.outcome-drilldown-toolbar\.outcome-comparison-toolbar > \.outcome-drilldown-close-btn \{([^}]*)\}/
)?.[1] || "";
assert.match(comparisonControlRule, /height:\s*36px;/);
assert.match(comparisonControlRule, /min-height:\s*36px;/);
assert.match(comparisonControlRule, /padding:\s*0 12px;/);
assert.match(comparisonControlRule, /border:\s*1px solid rgba\(176, 210, 226, 0\.24\);/);
assert.match(comparisonControlRule, /border-radius:\s*9px;/);
assert.doesNotMatch(comparisonControlRule, /999px|50%/);
assert.match(comparisonControlRule, /align-items:\s*center;/);
assert.match(comparisonControlRule, /justify-content:\s*center;/);
const comparisonTouchTargetRule = styles.match(
  /\.explicit-chart-detail \.outcome-drilldown-toolbar\.outcome-comparison-toolbar > \.outcome-expense-detail-toggle::before,\s*\.explicit-chart-detail \.outcome-drilldown-toolbar\.outcome-comparison-toolbar > \.outcome-drilldown-close-btn::before \{([^}]*)\}/
)?.[1] || "";
assert.match(comparisonTouchTargetRule, /inset-block:\s*-4px;/);
assert.match(comparisonTouchTargetRule, /inset-inline:\s*0;/);
assert.match(
  styles,
  /@media \(pointer: coarse\), \(max-width: 1024px\) \{[\s\S]*?\.explicit-chart-detail \.outcome-drilldown-toolbar\.outcome-comparison-toolbar > \.outcome-expense-detail-toggle::before,[\s\S]*?inset-block:\s*-4px;/
);
assert.match(cgd, /function computeEvolutionSeriesAverage\(series\)[\s\S]*return computeTwelveMonthAverage\(series\?\.values\);/);
assert.ok(
  (cgd.match(/resetSavingsComparisonRubricSelectionToFirst\(\);\s*resetOutcomeRubricSelectionToFirst\(\);\s*resetOutcomeComparisonRubricSelectionToFirst\(\);\s*renderPanels\(\);/g) || []).length >= 3,
  "Every year-load render path must reset the comparison chart to the first valid rubric"
);
assert.ok(
  (
    cgd.match(
      /resetIncomeRubricSelectionToFirst\(\);\s*resetIncomeComparisonRubricSelectionToFirst\(\);\s*resetSavingsRubricSelectionToFirst\(\);\s*resetSavingsComparisonRubricSelectionToFirst\(\);\s*resetOutcomeRubricSelectionToFirst\(\);\s*resetOutcomeComparisonRubricSelectionToFirst\(\);\s*renderPanels\(\);/g
    ) || []
  ).length >= 3,
  "Every year-load render path must reset all four explicit chart states"
);
assert.notEqual("outcome-expense-detail-series", "outcome-comparison-expense-detail-series");
assert.match(cgd, /id='outcome-expense-detail-series'/);
assert.match(cgd, /"outcome-comparison-expense-detail-series"/);
assert.match(cgd, /id='income-revenue-detail-series'/);
assert.match(cgd, /"income-comparison-revenue-detail-series"/);
assert.match(cgd, /id='savings-saving-detail-series'/);
assert.match(cgd, /"savings-comparison-saving-detail-series"/);
assert.notEqual("income-revenue-detail-series", "income-comparison-revenue-detail-series");
assert.notEqual("income-comparison-revenue-detail-series", "outcome-comparison-expense-detail-series");

console.log("Outcome comparison detail regression checks passed.");
