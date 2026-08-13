const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const homeSource = read("assets/js/home.js");
const mainSource = read("assets/js/main.js");
const styles = read("assets/css/styles.css");

const sliceBetween = (source, startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Unable to extract ${startMarker}`);
  return source.slice(start, end);
};

const moneySource = sliceBetween(homeSource, "function money(", "\nfunction escapeHtml(");
const escapeHtmlSource = sliceBetween(
  homeSource,
  "function escapeHtml(",
  "\nfunction getDashboardFinancialCalculations("
);
const visibilitySource = sliceBetween(
  homeSource,
  "const HOME_TEMPORAL_TOTAL_SERIES_KEY",
  "\n(async function homeInit"
);
const temporalRendererSource = sliceBetween(
  homeSource,
  "  (function renderTemporalChart()",
  "\n  // \u2500\u2500\u2500 Generic disponivel tile renderer"
);
const activeMenuSource = sliceBetween(
  mainSource,
  "function setActiveMenu(",
  "\nfunction collapseWithinPanel"
);

class FakeTextElement {
  constructor() {
    this.value = "";
  }

  set textContent(value) {
    this.value = String(value);
  }

  get innerHTML() {
    return this.value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
}

class FakeHost {
  constructor() {
    this.html = "";
    this.listeners = new Map();
    this.focusCounts = new Map();
  }

  set innerHTML(value) {
    this.html = String(value);
  }

  get innerHTML() {
    return this.html;
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  listenerCount(type) {
    return this.listeners.get(type)?.size || 0;
  }

  querySelector(selector) {
    const match = selector.match(/^\[data-home-chart-toggle='([^']+)'\]$/);
    if (!match) return null;
    const key = match[1];
    return {
      focus: () => this.focusCounts.set(key, (this.focusCounts.get(key) || 0) + 1)
    };
  }

  dispatchToggle(key) {
    const button = { dataset: { homeChartToggle: key } };
    const event = {
      target: {
        closest(selector) {
          return selector === "[data-home-chart-toggle]" ? button : null;
        }
      }
    };
    Array.from(this.listeners.get("click") || []).forEach((listener) => listener(event));
  }
}

const months = [
  "Janeiro",
  "Fevereiro",
  "Marco",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro"
];
const host = new FakeHost();
let savingsReadCalls = 0;
const cgdEstimated = Array.from({ length: 12 }, (_, month) => 1000 + month * 10);
const nbEstimated = Array.from({ length: 12 }, () => -900);
const coverflexEstimated = Array.from({ length: 12 }, () => 50);
const chartContext = vm.createContext({
  Array,
  Intl,
  Map,
  Math,
  Number,
  Object,
  Promise,
  Set,
  String,
  MONTHS_PT: months,
  cgdEstimated,
  coverflexEstimated,
  currentMonth: 7,
  document: {
    createElement() {
      return new FakeTextElement();
    },
    getElementById(id) {
      return id === "home-temporal-chart" ? host : null;
    }
  },
  fetchCgdSavingsRows: async () => {
    savingsReadCalls += 1;
    return { rubrics: [], expenses: [] };
  },
  nbEstimated,
  requestAnimationFrame(callback) {
    callback();
    return 1;
  },
  year: 2026
});

vm.runInContext(`
  ${moneySource}
  ${escapeHtmlSource}
  ${visibilitySource}
`, chartContext);

const waitForChartRender = async () => {
  vm.runInContext(temporalRendererSource, chartContext);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(host.__homeTemporalChartController, "Home chart controller was not created");
  return host.__homeTemporalChartController;
};

const countVisibleSeries = () => (
  host.html.match(/<g class='outcome-evolution-series'>/g) || []
).length;
const pressedState = (key) => {
  const match = host.html.match(
    new RegExp(`data-home-chart-toggle='${key}' aria-pressed='(true|false)'`)
  );
  assert.ok(match, `Missing legend toggle ${key}`);
  return match[1] === "true";
};
const firstGridValue = () => {
  const match = host.html.match(/font-size='9'>(-?\d+)<\/text>/);
  assert.ok(match, "Missing chart grid labels");
  return Number(match[1]);
};

const testRenderer = async () => {
  const controller = await waitForChartRender();
  const expectedKeys = ["total", "cgd", "nb", "cf", "irs", "audi"];

  assert.deepEqual(Array.from(controller.getVisibleKeys()), ["total"]);
  assert.equal(countVisibleSeries(), 1);
  assert.match(host.html, /<h3 id='home-temporal-chart-title'>Saldo Total 2026<\/h3>/);
  assert.match(host.html, /role='region' aria-labelledby='home-temporal-chart-title'/);
  assert.match(host.html, /aria-label='Saldo Total 2026\. Series visiveis: Total Disponivel\.'/);
  assert.equal((host.html.match(/data-home-chart-toggle=/g) || []).length, 6);
  expectedKeys.forEach((key) => {
    assert.equal(pressedState(key), key === "total", `Unexpected initial state for ${key}`);
  });
  assert.equal(firstGridValue(), 260, "initial scale must derive from Total Disponivel only");

  const series = Object.fromEntries(
    controller.getSeries().map((entry) => [entry.key, Array.from(entry.values)])
  );
  const expectedTotal = cgdEstimated.map(
    (value, month) => value + nbEstimated[month] + coverflexEstimated[month]
  );
  assert.deepEqual(series.total, expectedTotal);
  assert.deepEqual(series.cgd, cgdEstimated);
  assert.deepEqual(series.nb, nbEstimated);
  assert.deepEqual(series.cf, coverflexEstimated);
  assert.deepEqual(series.irs, new Array(12).fill(0));
  assert.deepEqual(series.audi, new Array(12).fill(0));

  for (const key of expectedKeys.slice(1)) {
    host.dispatchToggle(key);
    assert.deepEqual(Array.from(controller.getVisibleKeys()), ["total", key]);
    assert.equal(pressedState(key), true);
    assert.equal(countVisibleSeries(), 2);
    assert.equal(host.focusCounts.get(key), 1);
    host.dispatchToggle(key);
    assert.deepEqual(Array.from(controller.getVisibleKeys()), ["total"]);
    assert.equal(pressedState(key), false);
    assert.equal(countVisibleSeries(), 1);
    assert.equal(host.focusCounts.get(key), 2);
  }

  host.dispatchToggle("cgd");
  assert.equal(firstGridValue(), 1110, "scale must recalculate when another series becomes visible");
  const selectionBeforeRender = Array.from(controller.getVisibleKeys());
  controller.render();
  assert.deepEqual(Array.from(controller.getVisibleKeys()), selectionBeforeRender);
  assert.equal(pressedState("cgd"), true, "internal rerender must preserve manual choices");
  host.dispatchToggle("cgd");

  host.dispatchToggle("total");
  assert.deepEqual(Array.from(controller.getVisibleKeys()), []);
  assert.equal(countVisibleSeries(), 0);
  assert.match(host.html, /Nenhuma serie selecionada\./);
  assert.equal(pressedState("total"), false);
  host.dispatchToggle("total");
  assert.deepEqual(Array.from(controller.getVisibleKeys()), ["total"]);
  assert.equal(pressedState("total"), true);

  const previousController = host.__homeTemporalChartController;
  host.dispatchToggle("nb");
  assert.deepEqual(Array.from(previousController.getVisibleKeys()), ["total", "nb"]);
  const reloadedController = await waitForChartRender();
  assert.notEqual(reloadedController, previousController);
  assert.deepEqual(Array.from(reloadedController.getVisibleKeys()), ["total"]);
  assert.equal(host.listenerCount("click"), 1, "data reload must replace, not duplicate, listeners");
  assert.equal(countVisibleSeries(), 1);
  assert.equal(savingsReadCalls, 6);
};

class FakeClassList {
  constructor(...values) {
    this.values = new Set(values);
  }

  toggle(value, force) {
    if (force) this.values.add(value);
    else this.values.delete(value);
  }

  contains(value) {
    return this.values.has(value);
  }
}

const menuHrefs = [
  "index.html",
  "caixa-geral-depositos.html",
  "novobanco.html",
  "coverflex.html",
  "admin.html"
];
const evaluateMenuState = (pathname) => {
  const links = menuHrefs.map((href) => ({
    attributes: new Map([["href", href], ["aria-current", "stale"]]),
    classList: new FakeClassList("menu-link", "active"),
    getAttribute(name) {
      return this.attributes.get(name) || null;
    },
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    },
    removeAttribute(name) {
      this.attributes.delete(name);
    }
  }));
  const context = vm.createContext({
    document: { querySelectorAll: () => links },
    window: { location: { pathname: `/${pathname}` } }
  });
  vm.runInContext(`${activeMenuSource}\nsetActiveMenu();`, context);
  return links.map((link) => ({
    active: link.classList.contains("active"),
    ariaCurrent: link.getAttribute("aria-current"),
    href: link.getAttribute("href")
  }));
};

const htmlByPage = Object.fromEntries(menuHrefs.map((page) => [page, read(page)]));
for (const page of menuHrefs) {
  const html = htmlByPage[page];
  const currentLinks = Array.from(
    html.matchAll(/<a class="menu-link active" href="([^"]+)" aria-current="page">/g)
  ).map((match) => match[1]);
  assert.deepEqual(currentLinks, [page], `${page} no-JS active link mismatch`);
  assert.equal((html.match(/aria-current="page"/g) || []).length, 1);

  const enhanced = evaluateMenuState(page);
  assert.deepEqual(
    enhanced.filter((entry) => entry.active).map((entry) => entry.href),
    [page]
  );
  assert.deepEqual(
    enhanced.filter((entry) => entry.ariaCurrent === "page").map((entry) => entry.href),
    [page]
  );
  enhanced.filter((entry) => entry.href !== page).forEach((entry) => {
    assert.equal(entry.active, false);
    assert.equal(entry.ariaCurrent, null);
  });
}

assert.match(styles, /\.menu-link\[href="caixa-geral-depositos\.html"\]\.active\s*\{/);
assert.doesNotMatch(styles, /\.menu-link\[href="caixa-geral-depositos\.html"\]\s*\{/);
assert.match(styles, /\.coverflex-theme \.menu-link\[href="coverflex\.html"\]\.active\s*\{/);
assert.doesNotMatch(styles, /\.coverflex-theme \.menu-link\[href="coverflex\.html"\]\s*\{/);
assert.match(styles, /\.nb-theme \.menu-link\[href="novobanco\.html"\]\.active\s*\{/);
assert.doesNotMatch(styles, /\.nb-theme \.menu-link\[href="novobanco\.html"\]\s*\{/);
assert.match(styles, /#home-temporal-chart \.outcome-evolution-legend-item\s*\{[\s\S]*?min-width:\s*44px;[\s\S]*?min-height:\s*44px;/);
assert.match(styles, /#home-temporal-chart \.outcome-evolution-legend-item:focus-visible\s*\{/);
assert.match(styles, /@media \(max-width:\s*1024px\)[\s\S]*?\.menu-link\s*\{\s*min-height:\s*44px;/);
assert.doesNotMatch(temporalRendererSource, /supabaseClient|\bsb\.from\(|\bfetch\(/);
assert.doesNotMatch(temporalRendererSource, /tooltip\.innerHTML/);
assert.match(temporalRendererSource, /seriesEl\.textContent = seriesName/);
assert.match(activeMenuSource, /classList\.toggle\("active", isCurrent\)/);
assert.match(activeMenuSource, /setAttribute\("aria-current", "page"\)/);
assert.match(activeMenuSource, /removeAttribute\("aria-current"\)/);

for (const html of Object.values(htmlByPage)) {
  assert.match(html, /assets\/css\/styles\.css\?v=20260813-2/);
  assert.match(html, /assets\/js\/main\.js\?v=20260813-2/);
}
assert.match(htmlByPage["index.html"], /assets\/js\/home\.js\?v=20260813-2/);

testRenderer()
  .then(() => {
    console.log("Home balance chart and semantic menu regression checks passed.");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
