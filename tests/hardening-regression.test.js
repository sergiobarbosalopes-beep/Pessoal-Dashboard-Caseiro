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
assert.match(styles.toString("utf8"), /@media \(prefers-reduced-motion: reduce\)/);

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
  assert.match(source, /assets\/css\/styles\.css\?v=20260801-2/);
}
for (const source of html.filter((value) => value.includes("assets/js/main.js"))) {
  assert.match(source, /assets\/js\/main\.js\?v=20260801-1/);
}
for (const source of html.filter((value) => value.includes("assets/js/cgd.js"))) {
  assert.match(source, /assets\/js\/cgd\.js\?v=20260801-1/);
}
assert.match(read("index.html"), /assets\/js\/home\.js\?v=20260801-1/);

testExpenseProjectionFallbacks()
  .then(() => console.log("Hardening regression checks passed."))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
