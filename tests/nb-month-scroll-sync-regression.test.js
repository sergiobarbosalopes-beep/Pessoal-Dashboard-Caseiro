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
  "const nbMonthScrollBindings = new Map();",
  "\nfunction buildCgdMonthlyFlowEstimatedFlags"
);
const attributeHelperSource = sliceBetween(
  cgdSource,
  "function nbMonthScrollSyncAttribute(",
  "\nif (window.DASHBOARD_EXPLICIT_INCOME_REVENUE_DETAIL)"
);

assert.match(cgdSource, /const ENABLE_NB_MONTH_SCROLL_SYNC = TABLE_PREFIX === "nb";/);
assert.match(cgdSource, /const NB_MONTH_SCROLL_SYNC_SELECTOR = "\[data-month-scroll-sync\]";/);
assert.match(cgdSource, /nbMonthScrollSyncAttribute\("totalizer"\)/);
assert.match(cgdSource, /nbMonthScrollSyncAttribute\("balance"\)/);
assert.match(cgdSource, /nbMonthScrollSyncAttribute\(kind\)/);
assert.match(cgdSource, /timelineScroller\.dataset\.monthScrollSync = "timeline"/);
assert.match(cgdSource, /scheduleNbMonthScrollSyncRefresh\(\);/);
assert.match(cgdSource, /addEventListener\("scroll", handler, \{ passive: true \}\)/);
assert.match(cgdSource, /requestAnimationFrame\(\(\) =>/);
assert.match(cgdSource, /nbMonthProgrammaticScrolls/);
assert.match(cgdSource, /removeEventListener\("scroll", handler\)/);
assert.match(controllerSource, /new ResizeObserver\(handleNbMonthScrollViewportChange\)/);
assert.match(controllerSource, /if \(!nbMonthScrollPageshowBound\)[\s\S]*?window\.addEventListener\("pageshow", \(\) =>/);
assert.doesNotMatch(controllerSource, /data-cgd-temporal-scroll|outcome-evolution-svg-wrap|preventDefault/);

assert.match(
  styles,
  /@media \(max-width: 1024px\)[\s\S]*?\.nb-theme \[data-month-scroll-sync\][\s\S]*?--nb-month-track-width:\s*51px;[\s\S]*?--nb-month-track-gap:\s*4px;/
);
assert.match(
  styles,
  /\.nb-theme \[data-month-scroll-sync="totalizer"\]\s*\{\s*--nb-month-leading-track:\s*107px;/
);
assert.match(
  styles,
  /\.nb-theme \[data-month-scroll-sync\] \.timeline-grid,[\s\S]*?grid-template-columns:\s*var\(--nb-month-leading-track\) repeat\(12, var\(--nb-month-track-width\)\)/
);
assert.match(novoBancoHtml, /window\.DASHBOARD_TABLE_PREFIX = "nb"/);
assert.match(cgdHtml, /window\.DASHBOARD_TABLE_PREFIX = "cgd"/);
assert.match(coverflexHtml, /window\.DASHBOARD_TABLE_PREFIX = "coverflex"/);
[novoBancoHtml, cgdHtml, coverflexHtml].forEach((html) => {
  assert.match(html, /assets\/css\/styles\.css\?v=20260814-1/);
  assert.match(html, /assets\/js\/cgd\.js\?v=20260814-1/);
});
const renderSyncAttribute = (enabled, name) => {
  const attributeContext = vm.createContext({
    ENABLE_NB_MONTH_SCROLL_SYNC: enabled,
    String
  });
  return vm.runInContext(
    `${attributeHelperSource}\nnbMonthScrollSyncAttribute(${JSON.stringify(name)});`,
    attributeContext
  );
};
assert.equal(renderSyncAttribute(false, "timeline"), "");
assert.equal(renderSyncAttribute(false, "income"), "");
assert.equal(renderSyncAttribute(false, "outcome"), "");
assert.equal(renderSyncAttribute(true, "income"), " data-month-scroll-sync='income'");

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
const outcome = new FakeScroller({
  name: "outcome",
  firstCenter: 143.5,
  clientWidth: 376,
  maxScroll: 400
});
let currentScrollers = [timeline, totalizer, balance, income, outcome];

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
  ENABLE_NB_MONTH_SCROLL_SYNC: true,
  NB_MONTH_SCROLL_SYNC_SELECTOR: "[data-month-scroll-sync]",
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
globalThis.nbMonthSyncTestApi = {
  initNbMonthScrollSync,
  refreshNbMonthScrollSync,
  scheduleNbMonthScrollSyncRefresh,
  destroyNbMonthScrollSync,
  readNbMonthLogicalOffset,
  getNbMonthLogicalBounds,
  getBindingCount: () => nbMonthScrollBindings.size,
  getLogicalOffset: () => nbMonthScrollLogicalOffset,
  isLayoutChanging: () => nbMonthScrollLayoutChanging
};`, context);
const api = context.nbMonthSyncTestApi;

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

api.initNbMonthScrollSync();
flushAnimationFrames();
assert.equal(api.getBindingCount(), 5);
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
currentScrollers = [...currentScrollers, noOverflow];
api.refreshNbMonthScrollSync();
assert.equal(noOverflow.logicalScrollLeft, 0, "no-overflow panel must not block or move");
assert.equal(noOverflow.listenerCount("scroll"), 1);
noOverflow.clientWidth = 354;
noOverflow.scrollWidth = 777;
api.refreshNbMonthScrollSync();
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
api.refreshNbMonthScrollSync();
assert.equal(outcome.listenerCount("scroll"), 0, "detached scroller listener should be removed");
assert.equal(replacementOutcome.listenerCount("scroll"), 1);
assertAligned(currentScrollers, "rerender replacement");
api.refreshNbMonthScrollSync();
assert.equal(replacementOutcome.listenerCount("scroll"), 1, "refresh must not duplicate listeners");

const verticalScrollBeforeMonthReveal = 640;
driveScroller(timeline, 250, "selected month reveal");
assert.equal(verticalScrollBeforeMonthReveal, 640, "month synchronization must not mutate vertical scroll");

api.destroyNbMonthScrollSync();
currentScrollers.forEach((scroller) => assert.equal(scroller.listenerCount("scroll"), 0));
assert.equal(api.getBindingCount(), 0);
windowTarget.dispatch("pageshow");
flushAnimationFrames();
assert.equal(windowTarget.listenerCount("pageshow"), 1, "BFCache restore must not accumulate pageshow listeners");
assert.equal(api.getBindingCount(), currentScrollers.length);
currentScrollers.forEach((scroller) => assert.equal(scroller.listenerCount("scroll"), 1));
api.destroyNbMonthScrollSync();

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
  ENABLE_NB_MONTH_SCROLL_SYNC: true,
  NB_MONTH_SCROLL_SYNC_SELECTOR: "[data-month-scroll-sync]",
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
globalThis.rtlApi = { initNbMonthScrollSync, destroyNbMonthScrollSync };`, rtlContext);
rtlContext.rtlApi.initNbMonthScrollSync();
flushRtlFrames();
rtlTimeline.setUserScroll(180);
rtlTimeline.dispatch("scroll");
flushRtlFrames();
assertAligned([rtlTimeline, rtlOutcome], "RTL inline-axis synchronization");
rtlContext.rtlApi.destroyNbMonthScrollSync();

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
  ENABLE_NB_MONTH_SCROLL_SYNC: false,
  NB_MONTH_SCROLL_SYNC_SELECTOR: "[data-month-scroll-sync]",
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
initNbMonthScrollSync();
scheduleNbMonthScrollSyncRefresh();`, offContext);
assert.equal(offScroller.listenerCount("scroll"), 0, "CGD/Coverflex gate must stay off");
assert.equal(offFrames.length, 0, "disabled brands must not schedule sync work");

console.log("Novo Banco monthly scroll synchronization regression checks passed.");
