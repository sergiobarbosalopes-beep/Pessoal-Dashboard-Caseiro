"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const cgdSource = read("assets/js/cgd.js");
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

const controllerSource = sliceBetween(
  cgdSource,
  "const monthScrollBindings = new Map();",
  "\nfunction buildCgdMonthlyFlowEstimatedFlags"
);
const attributeHelperSource = sliceBetween(
  cgdSource,
  "function monthScrollSyncAttribute(",
  "\nif (window.DASHBOARD_EXPLICIT_INCOME_REVENUE_DETAIL)"
);

const expectedCapabilities = {
  cgd: ["timeline", "totalizer", "balance", "income", "savings", "outcome"],
  nb: ["timeline", "totalizer", "balance", "income", "outcome"],
  coverflex: ["timeline", "totalizer", "income", "outcome", "estimated-irs"]
};
assert.match(cgdSource, /cgd:\s*Object\.freeze\(\["timeline", "totalizer", "balance", "income", "savings", "outcome"\]\)/);
assert.match(cgdSource, /nb:\s*Object\.freeze\(\["timeline", "totalizer", "balance", "income", "outcome"\]\)/);
assert.match(cgdSource, /coverflex:\s*Object\.freeze\(\["timeline", "totalizer", "income", "outcome", "estimated-irs"\]\)/);
assert.match(cgdSource, /const ENABLE_MONTH_SCROLL_SYNC = MONTH_SCROLL_SYNC_KINDS\.size > 0;/);
assert.match(cgdSource, /const MONTH_SCROLL_SYNC_SELECTOR = "\[data-month-scroll-sync\]";/);
assert.match(cgdSource, /monthScrollSyncAttribute\("totalizer"\)/);
assert.match(cgdSource, /monthScrollSyncAttribute\("balance"\)/);
assert.match(cgdSource, /monthScrollSyncAttribute\("estimated-irs"\)/);
assert.match(cgdSource, /monthScrollSyncAttribute\(kind\)/);
assert.match(cgdSource, /timelineScroller\.dataset\.monthScrollSync = "timeline"/);
assert.match(cgdSource, /scheduleMonthScrollSyncRefresh\(\);/);
assert.match(cgdSource, /addEventListener\("scroll", handler, \{ passive: true \}\)/);
assert.match(cgdSource, /requestAnimationFrame\(\(\) =>/);
assert.match(cgdSource, /monthProgrammaticScrolls/);
assert.match(cgdSource, /removeEventListener\("scroll", handler\)/);
assert.match(controllerSource, /new ResizeObserver\(handleMonthScrollViewportChange\)/);
assert.match(controllerSource, /if \(!monthScrollPageshowBound\)[\s\S]*?window\.addEventListener\("pageshow", \(\) =>/);
assert.doesNotMatch(controllerSource, /data-cgd-temporal-scroll|outcome-evolution-svg-wrap|preventDefault/);

assert.match(
  styles,
  /@media \(max-width: 1024px\)[\s\S]*?\[data-month-scroll-sync\][\s\S]*?--month-scroll-track-width:\s*51px;[\s\S]*?--month-scroll-track-gap:\s*4px;/
);
assert.match(
  styles,
  /\[data-month-scroll-sync="totalizer"\]\s*\{\s*--month-scroll-leading-track:\s*107px;/
);
assert.match(
  styles,
  /\[data-month-scroll-sync\] \.timeline-grid,[\s\S]*?grid-template-columns:\s*var\(--month-scroll-leading-track\) repeat\(12, var\(--month-scroll-track-width\)\)/
);
assert.match(novoBancoHtml, /window\.DASHBOARD_TABLE_PREFIX = "nb"/);
assert.match(cgdHtml, /window\.DASHBOARD_TABLE_PREFIX = "cgd"/);
assert.match(coverflexHtml, /window\.DASHBOARD_TABLE_PREFIX = "coverflex"/);
[novoBancoHtml, cgdHtml, coverflexHtml].forEach((html) => {
  assert.match(html, /assets\/css\/styles\.css\?v=20260814-2/);
  assert.match(html, /assets\/js\/cgd\.js\?v=20260814-2/);
});
const renderSyncAttribute = (kinds, name) => {
  const attributeContext = vm.createContext({
    MONTH_SCROLL_SYNC_KINDS: new Set(kinds),
    String
  });
  return vm.runInContext(
    `${attributeHelperSource}\nmonthScrollSyncAttribute(${JSON.stringify(name)});`,
    attributeContext
  );
};
Object.entries(expectedCapabilities).forEach(([prefix, kinds]) => {
  kinds.forEach((kind) => {
    assert.equal(
      renderSyncAttribute(kinds, kind),
      ` data-month-scroll-sync='${kind}'`,
      `${prefix} should emit ${kind}`
    );
  });
  ["balance", "savings", "estimated-irs"].filter((kind) => !kinds.includes(kind)).forEach((kind) => {
    assert.equal(renderSyncAttribute(kinds, kind), "", `${prefix} must exclude ${kind}`);
  });
});
assert.equal(renderSyncAttribute([], "timeline"), "");
assert.equal(renderSyncAttribute(expectedCapabilities.cgd, "modal"), "");

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type).add(handler);
  }

  removeEventListener(type, handler) {
    this.listeners.get(type)?.delete(handler);
  }

  dispatch(type, event = {}) {
    [...(this.listeners.get(type) || [])].forEach((handler) => handler({
      target: this,
      ...event
    }));
  }

  listenerCount(type) {
    return this.listeners.get(type)?.size || 0;
  }
}

class FakeScroller extends FakeEventTarget {
  constructor({ name, firstCenter, pitch = 55, clientWidth, maxScroll, direction = "ltr" }) {
    super();
    this.dataset = { monthScrollSync: name };
    this.firstCenter = firstCenter;
    this.pitch = pitch;
    this.clientWidth = clientWidth;
    this.scrollWidth = clientWidth + maxScroll;
    this.direction = direction;
    this.isConnected = true;
    this.visible = true;
    this._scrollLeft = 0;
    this.writeCount = 0;
    this.cells = Array.from({ length: 12 }, (_, monthIndex) => ({
      monthIndex,
      scroller: this,
      getClientRects: () => (this.visible ? [{}] : []),
      getBoundingClientRect: () => ({
        left: (
          this.direction === "rtl"
            ? this.clientWidth - (this.firstCenter + monthIndex * this.pitch - this.logicalScrollLeft)
            : this.firstCenter + monthIndex * this.pitch - this.logicalScrollLeft
        ) - 10,
        right: (
          this.direction === "rtl"
            ? this.clientWidth - (this.firstCenter + monthIndex * this.pitch - this.logicalScrollLeft)
            : this.firstCenter + monthIndex * this.pitch - this.logicalScrollLeft
        ) + 10,
        width: 20
      })
    }));
  }

  get scrollLeft() {
    return this._scrollLeft;
  }

  set scrollLeft(value) {
    this._scrollLeft = Number(value) || 0;
    this.writeCount += 1;
  }

  get logicalScrollLeft() {
    return this.direction === "rtl" ? -this._scrollLeft : this._scrollLeft;
  }

  setUserScroll(value) {
    this._scrollLeft = this.direction === "rtl" ? -value : value;
  }

  getClientRects() {
    return this.visible ? [{}] : [];
  }

  getBoundingClientRect() {
    return { left: 0, right: this.clientWidth, width: this.clientWidth };
  }

  querySelectorAll(selector) {
    const match = selector.match(/(?:data-month|data-month-col)='(\d+)'/);
    return match ? [this.cells[Number(match[1])]] : [];
  }

  removeAttribute(name) {
    if (name === "data-month-scroll-sync") {
      delete this.dataset.monthScrollSync;
    }
  }

  visibleCenter(monthIndex) {
    return this.firstCenter + monthIndex * this.pitch - this.logicalScrollLeft;
  }
}

const animationFrames = [];
let nextFrameId = 1;
const cancelledFrames = new Set();
const requestAnimationFrame = (callback) => {
  const id = nextFrameId;
  nextFrameId += 1;
  animationFrames.push({ id, callback });
  return id;
};
const cancelAnimationFrame = (id) => cancelledFrames.add(id);
const flushAnimationFrames = () => {
  while (animationFrames.length) {
    const batch = animationFrames.splice(0);
    batch.forEach(({ id, callback }) => {
      if (!cancelledFrames.has(id)) {
        callback();
      }
    });
  }
};

const timeline = new FakeScroller({
  name: "timeline",
  firstCenter: 141.5,
  clientWidth: 376,
  maxScroll: 406
});
const totalizer = new FakeScroller({
  name: "totalizer",
  firstCenter: 141.5,
  clientWidth: 354,
  maxScroll: 423
});
const balance = new FakeScroller({
  name: "balance",
  firstCenter: 143.5,
  clientWidth: 376,
  maxScroll: 400
});
const income = new FakeScroller({
  name: "income",
  firstCenter: 143.5,
  clientWidth: 376,
  maxScroll: 400
});
const savings = new FakeScroller({
  name: "savings",
  firstCenter: 143.5,
  clientWidth: 376,
  maxScroll: 400
});
const outcome = new FakeScroller({
  name: "outcome",
  firstCenter: 143.5,
  clientWidth: 376,
  maxScroll: 400
});
let currentScrollers = [timeline, totalizer, balance, income, savings, outcome];

const documentTarget = new FakeEventTarget();
documentTarget.querySelectorAll = (selector) => (
  selector === "[data-month-scroll-sync]" ? currentScrollers : []
);
const windowTarget = new FakeEventTarget();

const context = vm.createContext({
  Map,
  WeakMap,
  Number,
  Math,
  Array,
  String,
  ENABLE_MONTH_SCROLL_SYNC: true,
  MONTH_SCROLL_SYNC_SELECTOR: "[data-month-scroll-sync]",
  document: documentTarget,
  window: windowTarget,
  requestAnimationFrame,
  cancelAnimationFrame,
  getComputedStyle(element) {
    return {
      direction: element.direction || "ltr",
      display: "block",
      visibility: "visible"
    };
  }
});

vm.runInContext(`${controllerSource}
globalThis.monthSyncTestApi = {
  initMonthScrollSync,
  refreshMonthScrollSync,
  scheduleMonthScrollSyncRefresh,
  destroyMonthScrollSync,
  readMonthLogicalOffset,
  getMonthLogicalBounds,
  getBindingCount: () => monthScrollBindings.size,
  getLogicalOffset: () => monthScrollLogicalOffset,
  isLayoutChanging: () => monthScrollLayoutChanging
};`, context);
const api = context.monthSyncTestApi;

const assertAligned = (scrollers, label) => {
  for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
    const visibleCenters = scrollers.map((scroller) => scroller.visibleCenter(monthIndex));
    const spread = Math.max(...visibleCenters) - Math.min(...visibleCenters);
    assert.ok(spread <= 1, `${label}: month ${monthIndex} spread was ${spread}`);
  }
};

const settleProgrammaticScrollEvents = () => {
  currentScrollers.forEach((scroller) => scroller.dispatch("scroll"));
  flushAnimationFrames();
};

api.initMonthScrollSync();
flushAnimationFrames();
assert.equal(api.getBindingCount(), 6);
assert.equal(windowTarget.listenerCount("pageshow"), 1);
currentScrollers.forEach((scroller) => assert.equal(scroller.listenerCount("scroll"), 1));
assertAligned(currentScrollers, "initial January position");
settleProgrammaticScrollEvents();

const driveScroller = (source, scrollLeft, label) => {
  source.setUserScroll(scrollLeft);
  source.dispatch("scroll");
  flushAnimationFrames();
  assertAligned(currentScrollers.filter((scroller) => scroller.scrollWidth > scroller.clientWidth), label);
  settleProgrammaticScrollEvents();
};

driveScroller(timeline, 110, "timeline to all");
driveScroller(totalizer, 220, "totalizer to all");
driveScroller(balance, 165, "balance to all");
driveScroller(income, 275, "income to all");
driveScroller(savings, 195, "savings to all");
driveScroller(outcome, 85, "outcome to all");

const writesBeforeRapidScroll = currentScrollers.map((scroller) => scroller.writeCount);
income.setUserScroll(120);
income.dispatch("scroll");
income.setUserScroll(150);
income.dispatch("scroll");
income.setUserScroll(180);
income.dispatch("scroll");
assert.equal(animationFrames.length, 1, "rapid momentum events should coalesce into one frame");
flushAnimationFrames();
currentScrollers.forEach((scroller, index) => {
  const writes = scroller.writeCount - writesBeforeRapidScroll[index];
  assert.ok(writes <= 1, `rapid sync wrote ${writes} times to ${scroller.dataset.monthScrollSync}`);
});
assertAligned(currentScrollers, "rapid momentum");
settleProgrammaticScrollEvents();

driveScroller(totalizer, 423, "shared December boundary");
assert.ok(totalizer.logicalScrollLeft < 423, "source should clamp only to the shared aligned range");
assertAligned(currentScrollers, "December centers");

const logicalOffsetBeforePartialResize = api.getLogicalOffset();
const dimensionsBeforePartialResize = currentScrollers.map((scroller) => ({
  scroller,
  clientWidth: scroller.clientWidth
}));
windowTarget.dispatch("resize");
currentScrollers.forEach((scroller) => {
  scroller.clientWidth += 200;
  scroller.setUserScroll(Math.min(scroller.logicalScrollLeft, scroller.scrollWidth - scroller.clientWidth));
  scroller.dispatch("scroll");
});
flushAnimationFrames();
assert.equal(
  api.getLogicalOffset(),
  logicalOffsetBeforePartialResize,
  "a narrower temporary logical range must not replace the desired month position"
);
dimensionsBeforePartialResize.forEach(({ scroller, clientWidth }) => {
  scroller.clientWidth = clientWidth;
});
windowTarget.dispatch("resize");
flushAnimationFrames();
assert.equal(api.getLogicalOffset(), logicalOffsetBeforePartialResize);
assertAligned(currentScrollers, "partial-overflow resize restore");
settleProgrammaticScrollEvents();

driveScroller(timeline, 210, "position before responsive resize");
const logicalOffsetBeforeResize = api.getLogicalOffset();
const dimensionsBeforeResize = currentScrollers.map((scroller) => ({
  scroller,
  clientWidth: scroller.clientWidth,
  scrollWidth: scroller.scrollWidth
}));
windowTarget.dispatch("resize");
currentScrollers.forEach((scroller) => {
  scroller.clientWidth = 900;
  scroller.scrollWidth = 800;
  scroller.setUserScroll(0);
  scroller.dispatch("scroll");
});
flushAnimationFrames();
assert.equal(api.getLogicalOffset(), logicalOffsetBeforeResize, "desktop no-overflow reset must not replace logical state");
dimensionsBeforeResize.forEach(({ scroller, clientWidth, scrollWidth }) => {
  scroller.clientWidth = clientWidth;
  scroller.scrollWidth = scrollWidth;
});
windowTarget.dispatch("resize");
flushAnimationFrames();
assertAligned(currentScrollers, "responsive resize restore");
assert.equal(api.isLayoutChanging(), false);
settleProgrammaticScrollEvents();

const noOverflow = new FakeScroller({
  name: "late",
  firstCenter: 141.5,
  clientWidth: 800,
  maxScroll: 0
});
noOverflow.visible = false;
currentScrollers = [...currentScrollers, noOverflow];
api.refreshMonthScrollSync();
assert.equal(noOverflow.logicalScrollLeft, 0, "hidden panel must not block or move");
assert.equal(noOverflow.listenerCount("scroll"), 1);
noOverflow.visible = true;
api.refreshMonthScrollSync();
assert.equal(noOverflow.logicalScrollLeft, 0, "visible no-overflow panel must not block or move");
noOverflow.clientWidth = 354;
noOverflow.scrollWidth = 777;
api.refreshMonthScrollSync();
assert.ok(noOverflow.logicalScrollLeft > 0, "late-overflow panel should adopt the stored position");
assertAligned(currentScrollers, "late-visible panel");
settleProgrammaticScrollEvents();

const replacementOutcome = new FakeScroller({
  name: "outcome",
  firstCenter: 143.5,
  clientWidth: 376,
  maxScroll: 400
});
outcome.isConnected = false;
currentScrollers = currentScrollers.map((scroller) => (
  scroller === outcome ? replacementOutcome : scroller
));
api.refreshMonthScrollSync();
assert.equal(outcome.listenerCount("scroll"), 0, "detached scroller listener should be removed");
assert.equal(replacementOutcome.listenerCount("scroll"), 1);
assertAligned(currentScrollers, "rerender replacement");
api.refreshMonthScrollSync();
assert.equal(replacementOutcome.listenerCount("scroll"), 1, "refresh must not duplicate listeners");

windowTarget.scrollY = 640;
const verticalScrollBeforeMonthReveal = windowTarget.scrollY;
driveScroller(timeline, 250, "selected month reveal");
assert.equal(windowTarget.scrollY, verticalScrollBeforeMonthReveal, "month synchronization must not mutate vertical scroll");

api.destroyMonthScrollSync();
currentScrollers.forEach((scroller) => assert.equal(scroller.listenerCount("scroll"), 0));
assert.equal(api.getBindingCount(), 0);
windowTarget.dispatch("pageshow");
flushAnimationFrames();
assert.equal(windowTarget.listenerCount("pageshow"), 1, "BFCache restore must not accumulate pageshow listeners");
assert.equal(api.getBindingCount(), currentScrollers.length);
currentScrollers.forEach((scroller) => assert.equal(scroller.listenerCount("scroll"), 1));
api.destroyMonthScrollSync();

const rtlTimeline = new FakeScroller({
  name: "timeline",
  firstCenter: 141.5,
  clientWidth: 376,
  maxScroll: 406,
  direction: "rtl"
});
const rtlOutcome = new FakeScroller({
  name: "outcome",
  firstCenter: 143.5,
  clientWidth: 376,
  maxScroll: 400,
  direction: "rtl"
});
const rtlFrames = [];
const rtlDocument = new FakeEventTarget();
rtlDocument.querySelectorAll = () => [rtlTimeline, rtlOutcome];
const rtlWindow = new FakeEventTarget();
const rtlContext = vm.createContext({
  Map,
  WeakMap,
  Number,
  Math,
  Array,
  String,
  ENABLE_MONTH_SCROLL_SYNC: true,
  MONTH_SCROLL_SYNC_SELECTOR: "[data-month-scroll-sync]",
  document: rtlDocument,
  window: rtlWindow,
  requestAnimationFrame(callback) {
    rtlFrames.push(callback);
    return rtlFrames.length;
  },
  cancelAnimationFrame() {},
  getComputedStyle(element) {
    return {
      direction: element.direction || "ltr",
      display: "block",
      visibility: "visible"
    };
  }
});
const flushRtlFrames = () => {
  while (rtlFrames.length) {
    rtlFrames.splice(0).forEach((callback) => callback());
  }
};
vm.runInContext(`${controllerSource}
globalThis.rtlApi = { initMonthScrollSync, destroyMonthScrollSync };`, rtlContext);
rtlContext.rtlApi.initMonthScrollSync();
flushRtlFrames();
rtlTimeline.setUserScroll(180);
rtlTimeline.dispatch("scroll");
flushRtlFrames();
assertAligned([rtlTimeline, rtlOutcome], "RTL inline-axis synchronization");
rtlContext.rtlApi.destroyMonthScrollSync();

const runBrandDirectionalMatrix = (prefix, kinds) => {
  const brandScrollers = kinds.map((name) => new FakeScroller({
    name,
    firstCenter: name === "timeline" || name === "totalizer" ? 141.5 : 143.5,
    clientWidth: name === "totalizer" ? 354 : 376,
    maxScroll: name === "timeline" ? 406 : name === "totalizer" ? 423 : 400
  }));
  const brandDocument = new FakeEventTarget();
  brandDocument.querySelectorAll = (selector) => (
    selector === "[data-month-scroll-sync]" ? brandScrollers : []
  );
  const brandWindow = new FakeEventTarget();
  const brandFrames = [];
  const brandCancelledFrames = new Set();
  let brandNextFrameId = 1;
  const brandContext = vm.createContext({
    Map,
    WeakMap,
    Number,
    Math,
    Array,
    String,
    ENABLE_MONTH_SCROLL_SYNC: true,
    MONTH_SCROLL_SYNC_SELECTOR: "[data-month-scroll-sync]",
    document: brandDocument,
    window: brandWindow,
    requestAnimationFrame(callback) {
      const id = brandNextFrameId;
      brandNextFrameId += 1;
      brandFrames.push({ id, callback });
      return id;
    },
    cancelAnimationFrame(id) {
      brandCancelledFrames.add(id);
    },
    getComputedStyle(element) {
      return {
        direction: element.direction || "ltr",
        display: "block",
        visibility: "visible"
      };
    }
  });
  const flushBrandFrames = () => {
    while (brandFrames.length) {
      brandFrames.splice(0).forEach(({ id, callback }) => {
        if (!brandCancelledFrames.has(id)) callback();
      });
    }
  };
  vm.runInContext(`${controllerSource}
  globalThis.brandApi = {
    initMonthScrollSync,
    destroyMonthScrollSync,
    getBindingCount: () => monthScrollBindings.size
  };`, brandContext);
  brandContext.brandApi.initMonthScrollSync();
  flushBrandFrames();
  assert.equal(brandContext.brandApi.getBindingCount(), kinds.length, `${prefix} binding count`);
  assert.deepEqual(
    brandScrollers.map((scroller) => scroller.dataset.monthScrollSync),
    kinds,
    `${prefix} exact host kinds`
  );

  brandScrollers.forEach((source, sourceIndex) => {
    source.setUserScroll(Math.min(90 + sourceIndex * 35, source.scrollWidth - source.clientWidth));
    source.dispatch("scroll");
    flushBrandFrames();
    assertAligned(brandScrollers, `${prefix} origin ${source.dataset.monthScrollSync}`);
    brandScrollers.forEach((scroller) => scroller.dispatch("scroll"));
    flushBrandFrames();
  });

  brandContext.brandApi.destroyMonthScrollSync();
  brandScrollers.forEach((scroller) => assert.equal(scroller.listenerCount("scroll"), 0));
};

Object.entries(expectedCapabilities).forEach(([prefix, kinds]) => {
  runBrandDirectionalMatrix(prefix, kinds);
});

const offFrames = [];
const offScroller = new FakeScroller({
  name: "timeline",
  firstCenter: 141.5,
  clientWidth: 376,
  maxScroll: 406
});
const offContext = vm.createContext({
  Map,
  WeakMap,
  Number,
  Math,
  Array,
  String,
  ENABLE_MONTH_SCROLL_SYNC: false,
  MONTH_SCROLL_SYNC_SELECTOR: "[data-month-scroll-sync]",
  document: {
    querySelectorAll: () => [offScroller],
    addEventListener() {},
    removeEventListener() {}
  },
  window: {
    addEventListener() {},
    removeEventListener() {}
  },
  requestAnimationFrame(callback) {
    offFrames.push(callback);
    return offFrames.length;
  },
  cancelAnimationFrame() {},
  getComputedStyle: () => ({ direction: "ltr", display: "block", visibility: "visible" })
});
vm.runInContext(`${controllerSource}
initMonthScrollSync();
scheduleMonthScrollSyncRefresh();`, offContext);
assert.equal(offScroller.listenerCount("scroll"), 0, "unsupported prefixes must stay off");
assert.equal(offFrames.length, 0, "disabled brands must not schedule sync work");

console.log("Multi-brand monthly scroll synchronization regression checks passed.");
