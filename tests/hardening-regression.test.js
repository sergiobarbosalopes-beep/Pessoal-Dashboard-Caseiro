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
  assert.match(source, /assets\/js\/main\.js\?v=20260802-2/);
}
for (const source of html.filter((value) => value.includes("assets/js/cgd.js"))) {
  assert.match(source, /assets\/js\/cgd\.js\?v=20260802-2/);
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

testExpenseProjectionFallbacks()
  .then(() => console.log("Hardening regression checks passed."))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
