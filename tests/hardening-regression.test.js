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
  "totalizador",
  "zerado"
]) {
  assert.match(cgd, new RegExp(`"${column}"`));
}
assert.match(expenseFetch, /for \(const noteColumn of \["nota", "notas", null\]\)/);

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

console.log("Hardening regression checks passed.");
