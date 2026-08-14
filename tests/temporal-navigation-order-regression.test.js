const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const cgdSource = read("assets/js/cgd.js");
const mainSource = read("assets/js/main.js");
const styles = read("assets/css/styles.css");

const pageConfigs = [
  {
    file: "caixa-geral-depositos.html",
    hasFlow: true,
    hasAlerts: true
  },
  {
    file: "novobanco.html",
    hasFlow: true,
    hasAlerts: false
  },
  {
    file: "coverflex.html",
    hasFlow: false,
    hasAlerts: false
  }
];

const countMatches = (source, pattern) => (source.match(pattern) || []).length;
const sliceBetween = (source, startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Unable to extract ${startMarker}`);
  return source.slice(start, end);
};

for (const config of pageConfigs) {
  const html = read(config.file);
  const heroIndex = html.indexOf('<section class="hero ');
  const heroEnd = html.indexOf("</section>", heroIndex);
  const mainStart = html.indexOf('<main class="page-grid fade-up delay-2">');
  const mainEnd = html.indexOf("</main>", mainStart);
  const mainMarkup = html.slice(
    mainStart + '<main class="page-grid fade-up delay-2">'.length,
    mainEnd
  );
  const navIndex = html.indexOf('<section class="card temporal-nav-card"');
  const summaryIndex = html.indexOf('id="cgd-temporal-summary-chart"');
  const flowIndex = html.indexOf('id="cgd-monthly-flow-chart"');
  const totalizerIndex = html.indexOf('id="cgd-totalizer"');
  const alertsIndex = html.indexOf('id="cgd-alerts-section"');

  assert.ok(heroIndex >= 0 && heroEnd < mainStart, `${config.file}: hero must precede main`);
  assert.ok(
    mainStart < navIndex && navIndex < summaryIndex,
    `${config.file}: expected hero -> temporal navigation -> Saldo`
  );
  assert.match(
    mainMarkup,
    /^\s*<section class="card temporal-nav-card"[\s\S]*?<\/section>\s*<section class="card cgd-temporal-chart-card"/,
    `${config.file}: temporal navigation must be the first financial section immediately before Saldo`
  );
  assert.ok(summaryIndex < totalizerIndex, `${config.file}: Saldo must precede totalizers`);

  if (config.hasFlow) {
    assert.ok(
      navIndex < summaryIndex && summaryIndex < flowIndex && flowIndex < totalizerIndex,
      `${config.file}: expected navigation -> Saldo -> Fluxo mensal -> remaining content`
    );
  } else {
    assert.equal(flowIndex, -1, `${config.file}: Coverflex must not gain Fluxo mensal`);
    assert.ok(navIndex < summaryIndex && summaryIndex < totalizerIndex);
  }

  if (config.hasAlerts) {
    assert.ok(
      flowIndex < alertsIndex && alertsIndex < totalizerIndex,
      `${config.file}: CGD alerts belong after the temporal charts`
    );
  } else {
    assert.equal(alertsIndex, -1);
  }

  assert.equal(countMatches(html, /class="card temporal-nav-card"/g), 1);
  assert.equal(countMatches(html, /id="month-timeline"/g), 1);
  assert.doesNotMatch(html, /temporal-nav-(?:host|placeholder)|data-temporal-nav-placeholder/);

  const ids = Array.from(html.matchAll(/\sid="([^"]+)"/g), (match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, `${config.file}: duplicate static IDs`);

  assert.match(html, /assets\/css\/styles\.css\?v=20260814-2/);
  assert.match(html, /assets\/js\/main\.js\?v=20260813-3/);
  assert.match(html, /assets\/js\/cgd\.js\?v=20260814-2/);
}

const temporalNavigationBlocks = Array.from(
  styles.matchAll(/^\.temporal-nav-card\s*\{([^}]*)\}/gm),
  (match) => match[1]
);
assert.equal(temporalNavigationBlocks.length, 2);
assert.match(temporalNavigationBlocks[0], /position:\s*sticky/);
assert.match(temporalNavigationBlocks[0], /top:\s*var\(--temporal-nav-sticky-top\)/);
assert.match(temporalNavigationBlocks[0], /z-index:\s*20000/);
assert.match(temporalNavigationBlocks[1], /margin-top:\s*0/);
assert.match(temporalNavigationBlocks[1], /overflow-x:\s*auto/);
assert.match(temporalNavigationBlocks[1], /overflow-y:\s*hidden/);
assert.match(styles, /\.page-grid\.fade-up\s*\{\s*transform:\s*none/);
assert.match(styles, /html,\s*body\s*\{\s*overflow-x:\s*clip/);
assert.match(
  styles,
  /\.card:has\(\.outcome-evolution-tooltip\.is-visible\),[\s\S]*?z-index:\s*20001/
);
assert.match(
  styles,
  /@media \(pointer: coarse\), \(max-width: 1024px\)\s*\{[\s\S]*?\.year-btn,\s*\.month-tile\s*\{[\s\S]*?min-width:\s*44px;[\s\S]*?min-height:\s*44px;/
);
for (const breakpoint of ["1024px", "768px", "430px"]) {
  const marker = `@media (max-width: ${breakpoint})`;
  const blockStart = styles.indexOf(marker);
  assert.ok(blockStart >= 0, `Missing ${breakpoint} responsive rules`);
  const nextMedia = styles.indexOf("\n@media ", blockStart + marker.length);
  const block = styles.slice(blockStart, nextMedia >= 0 ? nextMedia : styles.length);
  assert.doesNotMatch(block, /\.temporal-nav-card[\s\S]*?position:\s*static/);
}

const stickySource = sliceBetween(
  mainSource,
  "function initStickyTemporalNavigation()",
  "\nfunction initMobileNavigation()"
);
assert.match(stickySource, /topbar\.getBoundingClientRect\(\)\.height/);
assert.match(stickySource, /topbarTop \+ topbarHeight \+ gap/);
assert.match(stickySource, /siteShell\.style\.setProperty\("--temporal-nav-sticky-top"/);
assert.match(stickySource, /new ResizeObserver\(scheduleOffsetUpdate\)/);
assert.match(stickySource, /window\.addEventListener\("orientationchange"/);
assert.match(stickySource, /responsiveQuery\.addEventListener\("change", scheduleOffsetUpdate\)/);
assert.doesNotMatch(stickySource, /appendChild|cloneNode|insertAdjacentHTML/);

const monthSelectionSource = sliceBetween(
  mainSource,
  "function revealMonthTileHorizontally(",
  "\nfunction syncExpensePastMonthsState("
);
assert.match(monthSelectionSource, /scroller\.scrollLeft = Math\.max\(0, nextScrollLeft\)/);
assert.match(monthSelectionSource, /setAttribute\("aria-current", "date"\)/);
assert.match(monthSelectionSource, /removeAttribute\("aria-current"\)/);
assert.doesNotMatch(monthSelectionSource, /scrollIntoView|window\.scroll|document\.documentElement\.scroll/);

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  toggle(value, force) {
    if (force) this.values.add(value);
    else this.values.delete(value);
  }

  contains(value) {
    return this.values.has(value);
  }

  remove(value) {
    this.values.delete(value);
  }
}

const scroller = {
  scrollLeft: 0,
  getBoundingClientRect: () => ({ left: 10, right: 310 })
};
const monthTiles = Array.from({ length: 12 }, (_, monthIndex) => {
  const attributes = new Map();
  const left = 20 + monthIndex * 54;
  return {
    attributes,
    classList: new FakeClassList(),
    dataset: { month: String(monthIndex) },
    closest: (selector) => (selector === ".temporal-nav-card" ? scroller : null),
    getBoundingClientRect: () => ({ left, right: left + 48 }),
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
    getAttribute(name) {
      return attributes.get(name) || null;
    }
  };
});
const monthContext = vm.createContext({
  Number,
  document: {
    querySelectorAll(selector) {
      return selector === ".month-tile" ? monthTiles : [];
    }
  },
  window: {}
});
vm.runInContext(`${monthSelectionSource}\nhighlightMonth(7);`, monthContext);
assert.equal(scroller.scrollLeft, 144, "active August should be revealed horizontally");
assert.deepEqual(
  monthTiles.filter((tile) => tile.classList.contains("active")).map((tile) => tile.dataset.month),
  ["7"]
);
assert.equal(monthTiles[7].getAttribute("aria-current"), "date");
monthTiles.filter((_, index) => index !== 7).forEach((tile) => {
  assert.equal(tile.getAttribute("aria-current"), null);
});
scroller.scrollLeft = 77;
vm.runInContext("highlightMonth(3, { reveal: false });", monthContext);
assert.equal(scroller.scrollLeft, 77, "unrelated panel rerenders should preserve manual timeline scroll");
assert.match(mainSource, /highlightMonth\(activeMonth, \{ reveal: false \}\)/);

const renderTimelineSource = sliceBetween(
  cgdSource,
  "function renderTimeline(",
  "\nfunction renderExpenseRows("
);
const timelineScroller = {
  dataset: {},
  removeAttribute() {}
};
const timeline = {
  innerHTML: "",
  closest: () => timelineScroller
};
const timelineContext = vm.createContext({
  MONTH_SCROLL_SYNC_KINDS: new Set(),
  scheduleMonthScrollSyncRefresh() {},
  document: {
    getElementById(id) {
      return id === "month-timeline" ? timeline : null;
    }
  },
  months: [
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
  ]
});
vm.runInContext(`${renderTimelineSource}\nrenderTimeline(2026);`, timelineContext);
assert.equal(countMatches(timeline.innerHTML, /class='month-tile'/g), 12);
assert.equal(countMatches(timeline.innerHTML, /class='year-btn'/g), 2);
assert.match(timeline.innerHTML, /data-year-label>2026</);
vm.runInContext("renderTimeline(2027);", timelineContext);
assert.equal(countMatches(timeline.innerHTML, /class='month-tile'/g), 12);
assert.equal(countMatches(timeline.innerHTML, /class='year-btn'/g), 2);
assert.match(timeline.innerHTML, /data-year-label>2027</);

assert.match(mainSource, /initMobileNavigation\(\);\s*initStickyTemporalNavigation\(\);/);
assert.equal(countMatches(mainSource, /initStickyTemporalNavigation\(\);/g), 1);
assert.equal(countMatches(mainSource, /initYearNavigation\(\);/g), 1);
assert.equal(countMatches(mainSource, /initDelegatedActions\(\);/g), 1);
assert.match(mainSource, /const monthTile = event\.target\.closest\("\.month-tile"\)/);
assert.match(mainSource, /window\.cgdLoadYearData\(nextYear\)/);
assert.match(cgdSource, /renderTimeline\(cgdState\.selectedYear\);\s*await loadYearData/);
assert.doesNotMatch(renderTimelineSource, /cloneNode|appendChild|insertBefore/);

console.log("Temporal navigation order and lifecycle regression checks passed.");
