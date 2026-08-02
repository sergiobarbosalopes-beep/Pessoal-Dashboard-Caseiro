const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const cgd = read("assets/js/cgd.js");
const main = read("assets/js/main.js");
const home = read("assets/js/home.js");
const admin = read("assets/js/admin.js");
const styles = fs.readFileSync(path.join(root, "assets/css/styles.css"));
const stylesText = styles.toString("utf8");

const extractCssBlock = (source, marker) => {
  const markerIndex = source.indexOf(marker);
  assert.ok(markerIndex >= 0, `Missing CSS block: ${marker}`);
  const openBraceIndex = source.indexOf("{", markerIndex);
  let depth = 1;
  for (let index = openBraceIndex + 1; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(openBraceIndex + 1, index);
  }
  assert.fail(`Unclosed CSS block: ${marker}`);
};

const testHiddenModalOpenerFallback = () => {
  class FakeClassList {
    add() {}
    remove() {}
  }

  class FakeHTMLElement {
    constructor({ visible = true, focusable = true } = {}) {
      this.attributes = new Set();
      this.classList = new FakeClassList();
      this.computedStyle = {
        display: visible ? "block" : "none",
        visibility: "visible"
      };
      this.focusable = focusable;
      this.focusCount = 0;
      this.isConnected = true;
      this.style = {};
    }

    matches() {
      return this.focusable;
    }

    closest() {
      return null;
    }

    getClientRects() {
      return this.computedStyle.display === "none" ? [] : [{}];
    }

    focus() {
      this.focusCount += 1;
    }

    querySelectorAll() {
      return [];
    }

    getAttribute() {
      return null;
    }

    setAttribute(name) {
      this.attributes.add(name);
    }

    removeAttribute(name) {
      this.attributes.delete(name);
    }

    hasAttribute(name) {
      return this.attributes.has(name);
    }
  }

  const body = new FakeHTMLElement({ focusable: false });
  body.removeAttribute = () => {};
  const hiddenMenuItem = new FakeHTMLElement({ visible: false });
  const visibleToggle = new FakeHTMLElement();
  const owner = new FakeHTMLElement({ focusable: false });
  const document = {
    activeElement: hiddenMenuItem,
    body,
    documentElement: { clientWidth: 1000 },
    addEventListener() {},
    querySelector() {
      return null;
    }
  };
  const context = {
    Array,
    Set,
    WeakMap,
    HTMLElement: FakeHTMLElement,
    document,
    window: {
      innerWidth: 1000,
      scrollY: 0,
      getComputedStyle: (element) => element.computedStyle,
      scrollTo() {}
    },
    requestAnimationFrame: (callback) => callback(),
    lifecycle: null
  };
  const lifecycleStart = main.indexOf("function createDashboardModalLifecycle()");
  const lifecycleEnd = main.indexOf("window.DashboardModalLifecycle", lifecycleStart);
  assert.ok(lifecycleStart >= 0 && lifecycleEnd > lifecycleStart);
  vm.runInNewContext(
    `${main.slice(lifecycleStart, lifecycleEnd)}\nlifecycle = createDashboardModalLifecycle();`,
    context
  );

  context.lifecycle.lock(owner, hiddenMenuItem);
  context.lifecycle.unlock(owner, visibleToggle);
  assert.equal(hiddenMenuItem.focusCount, 0);
  assert.equal(visibleToggle.focusCount, 1);
};

const testCrudPostRenderFocus = async () => {
  class FakeCrudElement {
    constructor(type, attributes = {}) {
      this.type = type;
      this.attributes = new Map(Object.entries(attributes));
      this.children = [];
      this.parentElement = null;
      this.isConnected = true;
      this.focusCount = 0;
    }

    append(...children) {
      children.forEach((child) => {
        child.parentElement = this;
        this.children.push(child);
      });
    }

    matches(selector) {
      return (
        (selector === ".data-row.expense[data-sortable]" && this.type === "expense-row")
        || (selector === "article.rubric[data-sortable]" && this.type === "rubric-row")
      );
    }

    closest(selector) {
      if (selector === ".modal, .admin-modal") return this.modal || null;
      if (selector === "[data-expense-menu-toggle]") return this.type === "expense-toggle" ? this : null;
      if (selector === "[data-rubric-menu-toggle]") return this.type === "rubric-toggle" ? this : null;
      if (selector === "[data-panel-menu-toggle]") return this.type === "panel-toggle" ? this : null;
      if (selector.startsWith(".data-row.expense")) return this.expenseRow || (this.type === "expense-row" ? this : null);
      if (selector.startsWith("article.rubric")) return this.rubricRow || (this.type === "rubric-row" ? this : null);
      if (selector === ".panel[data-panel-kind]") return this.panel || (this.type === "panel" ? this : null);
      return null;
    }

    contains(element) {
      return element === this || element?.modal === this;
    }

    getAttribute(name) {
      return this.attributes.get(name) ?? null;
    }

    focus() {
      this.focusCount += 1;
      fakeDocument.activeElement = this;
      fakeDocument.dispatchFocus(this);
    }
  }

  const body = new FakeCrudElement("body");
  const selectorMap = new Map();
  const focusListeners = new Set();
  const fakeDocument = {
    activeElement: body,
    body,
    querySelector: (selector) => selectorMap.get(selector) || null,
    addEventListener(type, listener) {
      if (type === "focusin") focusListeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === "focusin") focusListeners.delete(listener);
    },
    dispatchFocus(target) {
      focusListeners.forEach((listener) => listener({ target }));
    }
  };
  let replacePanels = () => {};
  const context = {
    Array,
    Number,
    document: fakeDocument,
    window: {
      DashboardModalLifecycle: {
        isRestorableFocusTarget: (element) => Boolean(element?.isConnected && element !== body)
      }
    },
    cgdState: { selectedYear: 2026 },
    loadYearData: async () => replacePanels(),
    requestAnimationFrame: (callback) => callback(),
    crudApi: null
  };
  const helperStart = cgd.indexOf("function captureCrudFocusContext(");
  const helperEnd = cgd.indexOf("window.cgdCreateRubric", helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart);
  vm.runInNewContext(
    `${cgd.slice(helperStart, helperEnd)}
crudApi = { captureCrudFocusContext, runCrudMutationWithFocus };`,
    context
  );

  const createPanel = (kind = "outcome") => new FakeCrudElement("panel", { "data-panel-kind": kind });
  const createRubric = (id, kind = "outcome") => new FakeCrudElement("rubric-row", {
    "data-rubrica-id": String(id),
    "data-rubrica-tipo": kind
  });
  const createExpense = (rubricaId, despesaId) => new FakeCrudElement("expense-row", {
    "data-rubrica-id": String(rubricaId),
    "data-expense-id": String(despesaId)
  });
  const createToggle = (type, panel, rubricRow = null, expenseRow = null) => {
    const toggle = new FakeCrudElement(type);
    toggle.panel = panel;
    toggle.rubricRow = rubricRow;
    toggle.expenseRow = expenseRow;
    return toggle;
  };
  const reset = () => {
    selectorMap.clear();
    fakeDocument.activeElement = body;
    replacePanels = () => {};
  };

  reset();
  const createOldPanel = createPanel();
  const createOldPanelToggle = createToggle("panel-toggle", createOldPanel);
  fakeDocument.activeElement = createOldPanelToggle;
  const createContext = context.crudApi.captureCrudFocusContext({
    operation: "create",
    entityType: "rubric",
    kind: "outcome",
    returnFocusFallback: createOldPanelToggle
  });
  const createdRubricToggle = createToggle("rubric-toggle", createPanel(), createRubric(99));
  replacePanels = () => {
    createOldPanelToggle.isConnected = false;
    fakeDocument.activeElement = body;
    selectorMap.set("article.rubric[data-rubrica-id='99'] [data-rubric-menu-toggle]", createdRubricToggle);
  };
  await context.crudApi.runCrudMutationWithFocus(createContext, async () => ({ rubricaId: 99 }));
  assert.equal(createdRubricToggle.focusCount, 1, "create focuses the new rerendered entity");

  reset();
  const collapsedCreatePanel = createPanel();
  const collapsedOldPanelToggle = createToggle("panel-toggle", collapsedCreatePanel);
  fakeDocument.activeElement = collapsedOldPanelToggle;
  const collapsedCreateContext = context.crudApi.captureCrudFocusContext({
    operation: "create",
    entityType: "rubric",
    kind: "outcome",
    returnFocusFallback: collapsedOldPanelToggle
  });
  const collapsedCreatedToggle = createToggle("rubric-toggle", createPanel(), createRubric(100));
  collapsedCreatedToggle.hiddenByCollapse = true;
  const collapsedPanelToggle = createToggle("panel-toggle", createPanel());
  context.window.DashboardModalLifecycle.isRestorableFocusTarget = (element) => (
    Boolean(element?.isConnected && element !== body) && !element.hiddenByCollapse
  );
  replacePanels = () => {
    collapsedOldPanelToggle.isConnected = false;
    fakeDocument.activeElement = body;
    selectorMap.set("article.rubric[data-rubrica-id='100'] [data-rubric-menu-toggle]", collapsedCreatedToggle);
    selectorMap.set("[data-panel-kind='outcome'] [data-panel-menu-toggle]", collapsedPanelToggle);
  };
  await context.crudApi.runCrudMutationWithFocus(collapsedCreateContext, async () => ({ rubricaId: 100 }));
  assert.equal(collapsedCreatedToggle.focusCount, 0);
  assert.equal(collapsedPanelToggle.focusCount, 1, "collapsed create target falls back to the visible panel");
  context.window.DashboardModalLifecycle.isRestorableFocusTarget = (element) => Boolean(element?.isConnected && element !== body);

  reset();
  const renamePanel = createPanel();
  const renameRubric = createRubric(10);
  const renameOldToggle = createToggle("rubric-toggle", renamePanel, renameRubric);
  renameRubric.parentElement = { children: [renameRubric] };
  fakeDocument.activeElement = renameOldToggle;
  const renameContext = context.crudApi.captureCrudFocusContext({
    operation: "rename",
    entityType: "rubric",
    rubricaId: 10,
    returnFocusFallback: renameOldToggle
  });
  const renamedToggle = createToggle("rubric-toggle", createPanel(), createRubric(10));
  replacePanels = () => {
    renameOldToggle.isConnected = false;
    fakeDocument.activeElement = body;
    selectorMap.set("article.rubric[data-rubrica-id='10'] [data-rubric-menu-toggle]", renamedToggle);
  };
  await context.crudApi.runCrudMutationWithFocus(renameContext, async () => {});
  assert.equal(renamedToggle.focusCount, 1, "rename focuses the rerendered entity");

  reset();
  const deletePanel = createPanel();
  const deletedRubric = createRubric(20);
  const survivingRubric = createRubric(21);
  const rubricParent = { children: [deletedRubric, survivingRubric] };
  deletedRubric.parentElement = rubricParent;
  survivingRubric.parentElement = rubricParent;
  const deleteOldToggle = createToggle("rubric-toggle", deletePanel, deletedRubric);
  fakeDocument.activeElement = deleteOldToggle;
  const deleteContext = context.crudApi.captureCrudFocusContext({
    operation: "delete",
    entityType: "rubric",
    rubricaId: 20,
    returnFocusFallback: deleteOldToggle
  });
  const siblingToggle = createToggle("rubric-toggle", createPanel(), createRubric(21));
  replacePanels = () => {
    deleteOldToggle.isConnected = false;
    fakeDocument.activeElement = body;
    selectorMap.set("article.rubric[data-rubrica-id='21'] [data-rubric-menu-toggle]", siblingToggle);
  };
  await context.crudApi.runCrudMutationWithFocus(deleteContext, async () => {});
  assert.equal(siblingToggle.focusCount, 1, "delete focuses a surviving adjacent sibling");

  reset();
  const loneExpensePanel = createPanel();
  const loneExpenseRubric = createRubric(30);
  const loneExpense = createExpense(30, 40);
  loneExpense.parentElement = { children: [loneExpense] };
  const loneExpenseToggle = createToggle("expense-toggle", loneExpensePanel, loneExpenseRubric, loneExpense);
  fakeDocument.activeElement = loneExpenseToggle;
  const loneDeleteContext = context.crudApi.captureCrudFocusContext({
    operation: "delete",
    entityType: "expense",
    rubricaId: 30,
    despesaId: 40,
    returnFocusFallback: loneExpenseToggle
  });
  const parentRubricToggle = createToggle("rubric-toggle", createPanel(), createRubric(30));
  replacePanels = () => {
    loneExpenseToggle.isConnected = false;
    fakeDocument.activeElement = body;
    selectorMap.set("article.rubric[data-rubrica-id='30'] [data-rubric-menu-toggle]", parentRubricToggle);
  };
  await context.crudApi.runCrudMutationWithFocus(loneDeleteContext, async () => {});
  assert.equal(parentRubricToggle.focusCount, 1, "delete without siblings focuses the parent rubric");

  reset();
  const loneRubricPanel = createPanel();
  const loneRubric = createRubric(31);
  loneRubric.parentElement = { children: [loneRubric] };
  const loneRubricToggle = createToggle("rubric-toggle", loneRubricPanel, loneRubric);
  fakeDocument.activeElement = loneRubricToggle;
  const loneRubricDeleteContext = context.crudApi.captureCrudFocusContext({
    operation: "delete",
    entityType: "rubric",
    rubricaId: 31,
    returnFocusFallback: loneRubricToggle
  });
  const parentPanelToggle = createToggle("panel-toggle", createPanel());
  replacePanels = () => {
    loneRubricToggle.isConnected = false;
    fakeDocument.activeElement = body;
    selectorMap.set("[data-panel-kind='outcome'] [data-panel-menu-toggle]", parentPanelToggle);
  };
  await context.crudApi.runCrudMutationWithFocus(loneRubricDeleteContext, async () => {});
  assert.equal(parentPanelToggle.focusCount, 1, "rubric delete without siblings focuses the parent panel");

  reset();
  const movedPanel = createPanel();
  const movedRubric = createRubric(50);
  movedRubric.parentElement = { children: [movedRubric] };
  const movedOldToggle = createToggle("rubric-toggle", movedPanel, movedRubric);
  const userControl = new FakeCrudElement("year-control");
  const replacementToggle = createToggle("rubric-toggle", createPanel(), createRubric(50));
  fakeDocument.activeElement = movedOldToggle;
  const movedContext = context.crudApi.captureCrudFocusContext({
    operation: "rename",
    entityType: "rubric",
    rubricaId: 50,
    returnFocusFallback: movedOldToggle
  });
  replacePanels = () => {
    userControl.focus();
    movedOldToggle.isConnected = false;
    selectorMap.set("article.rubric[data-rubrica-id='50'] [data-rubric-menu-toggle]", replacementToggle);
  };
  await context.crudApi.runCrudMutationWithFocus(movedContext, async () => {});
  assert.equal(fakeDocument.activeElement, userControl, "async restoration preserves user-moved focus");
  assert.equal(replacementToggle.focusCount, 0);

  reset();
  const originPanel = createPanel("income");
  const originRubric = createRubric(55, "income");
  originRubric.parentElement = { children: [originRubric] };
  const originToggle = createToggle("rubric-toggle", originPanel, originRubric);
  const userChosenPanel = createPanel("outcome");
  const userChosenOldToggle = createToggle("panel-toggle", userChosenPanel);
  const userChosenNewToggle = createToggle("panel-toggle", createPanel("outcome"));
  const originReplacementToggle = createToggle("rubric-toggle", createPanel("income"), createRubric(55, "income"));
  fakeDocument.activeElement = originToggle;
  const movedPanelContext = context.crudApi.captureCrudFocusContext({
    operation: "rename",
    entityType: "rubric",
    rubricaId: 55,
    returnFocusFallback: originToggle
  });
  replacePanels = () => {
    userChosenOldToggle.focus();
    originToggle.isConnected = false;
    userChosenOldToggle.isConnected = false;
    fakeDocument.activeElement = body;
    selectorMap.set("[data-panel-kind='outcome'] [data-panel-menu-toggle]", userChosenNewToggle);
    selectorMap.set("article.rubric[data-rubrica-id='55'] [data-rubric-menu-toggle]", originReplacementToggle);
  };
  await context.crudApi.runCrudMutationWithFocus(movedPanelContext, async () => {});
  assert.equal(userChosenNewToggle.focusCount, 1, "rerender preserves the user's moved panel focus");
  assert.equal(originReplacementToggle.focusCount, 0);

  reset();
  const reopenedPanel = createPanel();
  const reopenedRubric = createRubric(60);
  reopenedRubric.parentElement = { children: [reopenedRubric] };
  const reopenedOldToggle = createToggle("rubric-toggle", reopenedPanel, reopenedRubric);
  const transientModal = new FakeCrudElement("modal", { "aria-hidden": "true" });
  transientModal.classList = {
    contains: (name) => name === "show" && transientModal.getAttribute("aria-hidden") === "false"
  };
  transientModal.hasAttribute = (name) => transientModal.attributes.has(name);
  const closedModalControl = new FakeCrudElement("modal-control");
  closedModalControl.modal = transientModal;
  const reopenedModalControl = new FakeCrudElement("modal-control");
  reopenedModalControl.modal = transientModal;
  const reopenedReplacementToggle = createToggle("rubric-toggle", createPanel(), createRubric(60));
  fakeDocument.activeElement = closedModalControl;
  const reopenedContext = context.crudApi.captureCrudFocusContext({
    operation: "rename",
    entityType: "rubric",
    rubricaId: 60,
    returnFocusFallback: reopenedOldToggle
  });
  replacePanels = () => {
    reopenedOldToggle.isConnected = false;
    transientModal.attributes.set("aria-hidden", "false");
    reopenedModalControl.focus();
    selectorMap.set("article.rubric[data-rubrica-id='60'] [data-rubric-menu-toggle]", reopenedReplacementToggle);
  };
  await context.crudApi.runCrudMutationWithFocus(reopenedContext, async () => {});
  assert.equal(fakeDocument.activeElement, reopenedModalControl, "a reopened modal keeps focus");
  assert.equal(reopenedReplacementToggle.focusCount, 0);
};

assert.doesNotMatch(main, /historyTableBody\.innerHTML/);
assert.match(main, /noteText\.textContent = note/);

assert.match(cgd, /const safeExpenseName = escapeHtml\(expense\.name\)/);
assert.match(cgd, /const safeRubricName = escapeHtml\(rubric\.name\)/);
assert.match(cgd, /data-expense-field='\$\{safeLabelPrefix\}/);
assert.doesNotMatch(cgd, />\$\{expense\.name\}<\/button>/);
assert.doesNotMatch(cgd, />\$\{rubric\.name\}<\/button>/);
assert.match(cgd, /labelEl\.textContent = label/);
const escapeFunction = cgd.match(/function escapeHtml\(value\) \{[\s\S]+?\n\}/)?.[0] || "";
const escapeContext = { escaped: "" };
vm.runInNewContext(`${escapeFunction}\nescaped = escapeHtml("<img src=x onerror='alert(1)'>");`, escapeContext);
assert.equal(escapeContext.escaped, "&lt;img src=x onerror=&#39;alert(1)&#39;&gt;");

assert.match(admin, /const email\s+= escapeHtml\(row\.email\)/);

const expenseFetch = cgd.match(/async function fetchExpensesForYear[\s\S]+?(?=\nasync function fetchRealValuesForYear)/)?.[0] || "";
assert.doesNotMatch(expenseFetch, /\.select\(["']\*["']\)/);
for (const column of [
  "ano",
  "mes",
  "rubrica_id",
  "despesa_id",
  "despesa_desc",
  "valor",
  "valor_estimado",
  "valor_Estimado",
  "totalizador",
  "zerado"
]) {
  assert.match(cgd, new RegExp(`"${column}"`));
}
assert.match(cgd, /const EXPENSE_ESTIMATED_COLUMNS = \["valor_estimado", "valor_Estimado"\]/);
assert.match(cgd, /const EXPENSE_NOTE_COLUMNS = \["nota", "notas", null\]/);

const createExpenseFetchHarness = (prefix, responseForProjection) => {
  const projections = [];
  const expenseTable = `${prefix}_despesa`;
  const supabase = {
    from(table) {
      assert.equal(table, expenseTable);
      let projection = "";
      const query = {
        select(value) {
          projection = value;
          projections.push(value);
          return query;
        },
        eq() {
          return query;
        },
        order() {
          return query;
        },
        then(resolve, reject) {
          return Promise.resolve(responseForProjection(projection)).then(resolve, reject);
        }
      };
      return query;
    }
  };
  const window = {
    CGD_SUPABASE_URL: "https://example.test",
    CGD_SUPABASE_ANON_KEY: "test-key",
    DASHBOARD_TABLE_PREFIX: prefix,
    DASHBOARD_RUBRIC_TABLE: `${prefix}_rubrica`,
    DASHBOARD_EXPENSE_TABLE: expenseTable,
    DASHBOARD_REAL_TABLE: `${prefix}_real`,
    DASHBOARD_EXPENSE_NOTES_TABLE: `${prefix}_despesa_notas`,
    DASHBOARD_EXPENSE_NOTES_TABLE_LEGACY: `${prefix}_despesas_notas`,
    DASHBOARD_EXPENSE_SEQ_COLUMN: "despesa_seq",
    location: { pathname: `/${prefix}.html` },
    supabase: { createClient: () => supabase }
  };
  const context = vm.createContext({
    console,
    document: { addEventListener() {} },
    window
  });
  vm.runInContext(cgd, context);
  return {
    projections,
    fetchExpenses: (year) => vm.runInContext(`fetchExpensesForYear(${year})`, context)
  };
};

const testExpenseProjectionFallbacks = async () => {
  for (const prefix of ["cgd", "nb", "coverflex"]) {
    const legacyRow = {
      ano: 2026,
      mes: 1,
      rubrica_id: 1,
      despesa_id: 2,
      despesa_desc: "Legacy",
      despesa_seq: 3,
      valor: null,
      valor_Estimado: 42,
      totalizador: true,
      zerado: false,
      nota: "ok"
    };
    const harness = createExpenseFetchHarness(prefix, (projection) => (
      projection.includes("valor_estimado")
        ? { data: null, error: { code: "42703", message: "column valor_estimado does not exist" } }
        : { data: [legacyRow], error: null }
    ));

    assert.deepEqual(await harness.fetchExpenses(2026), [legacyRow]);
    assert.equal(harness.projections.length, 2);
    assert.match(harness.projections[0], /valor_estimado,nota$/);
    assert.match(harness.projections[1], /valor_Estimado,nota$/);
    for (const requiredColumn of [
      "ano",
      "mes",
      "rubrica_id",
      "despesa_id",
      "despesa_desc",
      "despesa_seq",
      "valor",
      "totalizador",
      "zerado"
    ]) {
      assert.ok(harness.projections[1].split(",").includes(requiredColumn));
    }
  }

  const notasRow = { ano: 2026, mes: 1, valor_estimado: 10, notas: "legacy note" };
  const notasHarness = createExpenseFetchHarness("cgd", (projection) => {
    const columns = projection.split(",");
    if (columns.includes("valor_Estimado") || columns.at(-1) === "nota") {
      return { data: null, error: { code: "42703", message: "projection column does not exist" } };
    }
    return { data: [notasRow], error: null };
  });
  assert.deepEqual(await notasHarness.fetchExpenses(2026), [notasRow]);
  assert.match(notasHarness.projections.at(-1), /valor_estimado,notas$/);

  const noNoteRow = { ano: 2026, mes: 1, valor_estimado: 12 };
  const noNoteHarness = createExpenseFetchHarness("nb", (projection) => {
    const columns = projection.split(",");
    const noteColumn = columns.at(-1);
    if (columns.includes("valor_Estimado") || noteColumn === "nota" || noteColumn === "notas") {
      return { data: null, error: { code: "42703", message: "projection column does not exist" } };
    }
    return { data: [noNoteRow], error: null };
  });
  assert.deepEqual(await noNoteHarness.fetchExpenses(2026), [noNoteRow]);
  assert.match(noNoteHarness.projections.at(-1), /valor_estimado$/);
  assert.doesNotMatch(noNoteHarness.projections.at(-1), /,notas?$/);

  const permissionError = { code: "42501", message: "permission denied" };
  const deniedHarness = createExpenseFetchHarness("cgd", () => ({ data: null, error: permissionError }));
  await assert.rejects(deniedHarness.fetchExpenses(2026), (error) => error === permissionError);
  assert.equal(deniedHarness.projections.length, 1);
};

assert.equal((home.match(/\.from\("cgd_rubrica"\)/g) || []).length, 1);
assert.equal((home.match(/\.from\("cgd_despesa"\)/g) || []).length, 1);
assert.match(home, /requestCache\.set\(key, request\)/);
assert.match(home, /requestCache\.delete\(key\)/);

assert.notDeepEqual(Array.from(styles.subarray(0, 3)), [0xef, 0xbb, 0xbf]);
assert.ok(stylesText.startsWith(":root"));
assert.match(stylesText, /@media \(prefers-reduced-motion: reduce\)/);

assert.match(main, /function initMobileNavigation\(\)/);
assert.match(main, /toggle\.setAttribute\("aria-controls", menu\.id\)/);
assert.match(main, /toggle\.setAttribute\("aria-expanded", String\(open\)\)/);
assert.match(main, /event\.key === "Escape" && topbar\.classList\.contains\("menu-open"\)/);
assert.match(main, /!topbar\.contains\(event\.target\)/);
assert.match(main, /window\.matchMedia\("\(max-width: 1024px\)"\)/);
assert.match(main, /menu\.addEventListener\("click"/);
assert.match(main, /createDashboardModalLifecycle/);
assert.match(main, /activeOwners = new Set\(\)/);
assert.match(main, /savedBodyStyle = document\.body\.getAttribute\("style"\)/);
assert.match(main, /const isTopmost = \(owner\)/);
assert.match(main, /const isRestorableFocusTarget = \(element\)/);
assert.match(main, /element\.getClientRects\(\)\.length > 0/);
assert.match(main, /\[returnFocus, fallbackFocus, document\.querySelector\("\.brand"\)\]/);
assert.match(main, /window\.DashboardModalLifecycle\?\.(lock|unlock)/);
assert.match(main, /event\.key !== "Tab"/);
assert.match(main, /owner\.removeAttribute\("inert"\)/);
assert.match(main, /owner\.setAttribute\("inert", ""\)/);
for (const invocation of [
  "cgdCreateRubric\\(kind, focusFallback\\)",
  "cgdCreateExpense\\(rubricId, focusFallback\\)",
  "cgdDeleteRubric\\(rubricId, focusFallback\\)",
  "cgdRenameRubric\\(rubricId, focusFallback\\)",
  "cgdDeleteExpense\\(rubricId, despesaId, focusFallback\\)",
  "cgdRenameExpense\\(rubricId, despesaId, focusFallback\\)"
]) {
  assert.match(main, new RegExp(invocation));
}
assert.equal((cgd.match(/unlock\(modal, options\?\.returnFocusFallback\)/g) || []).length, 2);

assert.match(stylesText, /\/\* ── Responsive hardening:/);
assert.match(stylesText, /max-height: calc\(100dvh - 24px\)/);
assert.match(stylesText, /\.modal,\s*\.admin-modal \{[\s\S]*?z-index: 30000/);
assert.match(stylesText, /\.modal:not\(\.show\) \{\s*visibility: hidden/);
assert.match(stylesText, /\.expense-modal-top-layout \{[\s\S]*?grid-template-columns: minmax\(220px, 0\.85fr\) minmax\(280px, 1\.15fr\)/);
const phoneResponsiveCss = extractCssBlock(stylesText, "@media (max-width: 768px)");
assert.match(phoneResponsiveCss, /\.expense-modal-top-layout \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
assert.match(phoneResponsiveCss, /\.expense-history-section \{[\s\S]*?height: auto;[\s\S]*?min-height: auto/);
assert.match(phoneResponsiveCss, /\.expense-history-section \.expense-history-table-wrap \{[\s\S]*?flex: none;[\s\S]*?overflow-y: hidden/);
const shortResponsiveCss = extractCssBlock(stylesText, "@media (max-width: 1024px) and (max-height: 500px)");
assert.match(shortResponsiveCss, /\.expense-modal-top-layout \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
assert.match(shortResponsiveCss, /\.expense-history-section \.expense-history-table-wrap \{[\s\S]*?flex: none;[\s\S]*?overflow-y: hidden/);
assert.match(stylesText, /\.topbar\.nav-enhanced,[\s\S]*?display: grid/);
assert.doesNotMatch(stylesText, /\.topbar,\s*\.nb-theme \.topbar,\s*\.coverflex-theme \.topbar \{[^}]*display: grid/);
assert.match(stylesText, /\.panel-menu,\s*\.rubric-menu,\s*\.expense-menu \{[\s\S]*?position: fixed/);
assert.match(stylesText, /\.panel-sort-actions,\s*\.rubric-sort-actions,\s*\.expense-sort-actions \{[\s\S]*?transform: none/);
assert.match(stylesText, /\.panel-sort-actions\.open,[\s\S]*?z-index: 22000/);
assert.match(stylesText, /@media \(max-width: 430px\)/);
assert.match(stylesText, /env\(safe-area-inset-top\)/);
assert.match(stylesText, /-webkit-overflow-scrolling: touch/);
assert.match(stylesText, /@media \(pointer: coarse\)/);

const htmlFiles = [
  "index.html",
  "admin.html",
  "caixa-geral-depositos.html",
  "novobanco.html",
  "coverflex.html",
  "credito-habitacao.html",
  "paineis-solares.html",
  "login.html"
];
const html = htmlFiles.map(read);
for (const source of html) {
  assert.match(source, /viewport-fit=cover/);
  assert.match(source, /assets\/css\/styles\.css\?v=20260802-2/);
}
for (const source of html.filter((value) => value.includes("assets/js/main.js"))) {
  assert.match(source, /assets\/js\/main\.js\?v=20260802-3/);
}
for (const source of html.filter((value) => value.includes("assets/js/cgd.js"))) {
  assert.match(source, /assets\/js\/cgd\.js\?v=20260802-3/);
}
assert.match(read("admin.html"), /assets\/js\/admin\.js\?v=20260802-1/);
assert.match(read("index.html"), /assets\/js\/home\.js\?v=20260801-1/);

for (const relativePath of [
  "caixa-geral-depositos.html",
  "novobanco.html",
  "coverflex.html"
]) {
  const source = read(relativePath);
  assert.match(source, /id="expense-modal" role="dialog" aria-modal="true"/);
  assert.match(source, /id="confirm-modal" role="alertdialog" aria-modal="true"/);
}

testHiddenModalOpenerFallback();

Promise.all([
  testCrudPostRenderFocus(),
  testExpenseProjectionFallbacks()
])
  .then(() => console.log("Hardening regression checks passed."))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
