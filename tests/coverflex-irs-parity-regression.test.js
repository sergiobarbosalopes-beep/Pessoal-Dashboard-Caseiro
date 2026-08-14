const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const calculations = require(path.join(root, "assets/js/dashboard-financial-calculations.js"));
const sharedSource = read("assets/js/dashboard-financial-calculations.js");
const homeSource = read("assets/js/home.js");
const cgdSource = read("assets/js/cgd.js");

const rubricRows = [];
for (let month = 1; month <= 12; month += 1) {
  rubricRows.push({
    rubrica_id: 1,
    rubrica_desc: "Casa <svg onload=alert(1)>",
    rubrica_tipo: month % 2 ? "Despesa" : "DESPESA",
    mes: month
  });
}
rubricRows.push(
  {
    rubrica_id: 1,
    rubrica_desc: "Casa <svg onload=alert(1)>",
    rubrica_tipo: "Despesa",
    mes: 1
  },
  {
    rubrica_id: 2,
    rubrica_desc: "  CH\u00cdCA   B\u00c9NI  ",
    rubrica_tipo: "Despesa",
    mes: 1
  },
  {
    rubrica_id: 3,
    rubrica_desc: "Receitas",
    rubrica_tipo: "Receita",
    mes: 1
  }
);

const expenseRows = [
  {
    rubrica_id: 1,
    despesa_id: 11,
    despesa_desc: "Regular <img src=x onerror=alert(1)>",
    mes: 1,
    valor: 100,
    valor_estimado: 999,
    totalizador: true,
    zerado: false
  },
  {
    rubrica_id: 1,
    despesa_id: 11,
    despesa_desc: "Regular <img src=x onerror=alert(1)>",
    mes: 2,
    valor: 0,
    valor_estimado: 200,
    totalizador: "true",
    zerado: false
  },
  {
    rubrica_id: 1,
    despesa_id: 11,
    despesa_desc: "Regular <img src=x onerror=alert(1)>",
    mes: 3,
    valor: null,
    valor_Estimado: 300,
    totalizador: 1,
    zerado: false
  },
  {
    rubrica_id: 1,
    despesa_id: 11,
    despesa_desc: "Regular <img src=x onerror=alert(1)>",
    mes: 4,
    valor: 400,
    valor_estimado: 450,
    totalizador: true,
    zerado: "t"
  },
  {
    rubrica_id: 1,
    despesa_id: 11,
    despesa_desc: "Regular <img src=x onerror=alert(1)>",
    mes: 5,
    valor: 500,
    valor_estimado: 550,
    totalizador: "false",
    zerado: false
  },
  {
    rubrica_id: 1,
    despesa_id: 12,
    despesa_desc: "Ch\u00edca    B\u00e9ni <script>alert(1)</script>",
    mes: 6,
    valor: 600,
    valor_estimado: 650,
    totalizador: true,
    zerado: false
  },
  {
    rubrica_id: 1,
    despesa_id: 13,
    despesa_desc: "Blank",
    mes: 7,
    valor: " ",
    valor_estimado: "",
    totalizador: true,
    zerado: false
  },
  {
    rubrica_id: 1,
    despesa_id: 14,
    despesa_desc: "Non finite",
    mes: 7,
    valor: Number.NaN,
    valor_estimado: Number.POSITIVE_INFINITY,
    totalizador: true,
    zerado: false
  },
  {
    rubrica_id: 1,
    despesa_id: 15,
    despesa_desc: "Missing totalizer",
    mes: 7,
    valor: 700,
    valor_estimado: 700,
    totalizador: null,
    zerado: false
  },
  {
    rubrica_id: 1,
    despesa_id: 11,
    despesa_desc: "Regular <img src=x onerror=alert(1)>",
    mes: 8,
    valor: Number.POSITIVE_INFINITY,
    valor_estimado: 80,
    totalizador: true,
    zerado: false
  },
  {
    rubrica_id: 1,
    despesa_id: 11,
    despesa_desc: "Regular <img src=x onerror=alert(1)>",
    mes: 9,
    valor: -90,
    valor_estimado: 900,
    totalizador: true,
    zerado: false
  },
  {
    rubrica_id: 1,
    despesa_id: 11,
    despesa_desc: "Regular <img src=x onerror=alert(1)>",
    mes: 10,
    valor: "0",
    valor_estimado: -100,
    totalizador: true,
    zerado: false
  },
  {
    rubrica_id: 1,
    despesa_id: 11,
    despesa_desc: "Regular <img src=x onerror=alert(1)>",
    mes: 11,
    valor: 110,
    valor_estimado: null,
    totalizador: true,
    zerado: false
  },
  {
    rubrica_id: 1,
    despesa_id: 11,
    despesa_desc: "Regular <img src=x onerror=alert(1)>",
    mes: 12,
    valor: 120,
    totalizador: true,
    zerado: false
  },
  {
    rubrica_id: 1,
    despesa_id: 11,
    despesa_desc: "Invalid zero-based month",
    mes: 0,
    valor: 9999,
    totalizador: true,
    zerado: false
  },
  {
    rubrica_id: 1,
    despesa_id: 11,
    despesa_desc: "Invalid thirteenth month",
    mes: 13,
    valor: 9999,
    totalizador: true,
    zerado: false
  },
  {
    rubrica_id: 2,
    despesa_id: 21,
    despesa_desc: "Excluded by rubric",
    mes: 1,
    valor: 1000,
    totalizador: true,
    zerado: false
  },
  {
    rubrica_id: 3,
    despesa_id: 31,
    despesa_desc: "Wrong rubric type",
    mes: 1,
    valor: 2000,
    totalizador: true,
    zerado: false
  },
  {
    rubrica_id: 999,
    despesa_id: 41,
    despesa_desc: "Missing rubric",
    mes: 1,
    valor: 3000,
    totalizador: true,
    zerado: false
  }
];

const defaultMonthData = () => Array.from({ length: 12 }, () => ({
  valor: null,
  valorEstimado: 0,
  totalizador: false,
  zerado: false
}));
const regularMonthData = defaultMonthData();
regularMonthData[0] = { valor: 100, valorEstimado: 999, totalizador: true, zerado: false };
regularMonthData[1] = { valor: 0, valorEstimado: 200, totalizador: true, zerado: false };
regularMonthData[2] = { valor: null, valorEstimado: 300, totalizador: true, zerado: false };
regularMonthData[3] = { valor: 400, valorEstimado: 450, totalizador: true, zerado: true };
regularMonthData[4] = { valor: 500, valorEstimado: 550, totalizador: false, zerado: false };
regularMonthData[7] = { valor: Number.POSITIVE_INFINITY, valorEstimado: 80, totalizador: true, zerado: false };
regularMonthData[8] = { valor: -90, valorEstimado: 900, totalizador: true, zerado: false };
regularMonthData[9] = { valor: 0, valorEstimado: -100, totalizador: true, zerado: false };
regularMonthData[10] = { valor: 110, valorEstimado: 0, totalizador: true, zerado: false };
regularMonthData[11] = { valor: 120, valorEstimado: 0, totalizador: true, zerado: false };

const excludedItemMonthData = defaultMonthData();
excludedItemMonthData[5] = { valor: 600, valorEstimado: 650, totalizador: true, zerado: false };
const blankMonthData = defaultMonthData();
blankMonthData[6] = { valor: " ", valorEstimado: "", totalizador: true, zerado: false };
const nonFiniteMonthData = defaultMonthData();
nonFiniteMonthData[6] = {
  valor: Number.NaN,
  valorEstimado: Number.POSITIVE_INFINITY,
  totalizador: true,
  zerado: false
};
const missingTotalizerMonthData = defaultMonthData();
missingTotalizerMonthData[6] = {
  valor: 700,
  valorEstimado: 700,
  totalizador: false,
  zerado: false
};
const excludedRubricMonthData = defaultMonthData();
excludedRubricMonthData[0] = { valor: 1000, valorEstimado: 0, totalizador: true, zerado: false };
const incomeMonthData = defaultMonthData();
incomeMonthData[0] = { valor: 2000, valorEstimado: 0, totalizador: true, zerado: false };

const normalizedModel = [
  {
    id: 1,
    name: "Casa <svg onload=alert(1)>",
    type: "outcome",
    expenses: [
      {
        id: 11,
        name: "Regular <img src=x onerror=alert(1)>",
        monthData: regularMonthData
      },
      {
        id: 12,
        name: "Ch\u00edca    B\u00e9ni <script>alert(1)</script>",
        monthData: excludedItemMonthData
      },
      { id: 13, name: "Blank", monthData: blankMonthData },
      { id: 14, name: "Non finite", monthData: nonFiniteMonthData },
      { id: 15, name: "Missing totalizer", monthData: missingTotalizerMonthData }
    ]
  },
  {
    id: 2,
    name: "  CH\u00cdCA   B\u00c9NI  ",
    type: "outcome",
    expenses: [{ id: 21, name: "Excluded by rubric", monthData: excludedRubricMonthData }]
  },
  {
    id: 3,
    name: "Receitas",
    type: "income",
    expenses: [{ id: 31, name: "Wrong rubric type", monthData: incomeMonthData }]
  }
];

const expectedBaseByMonth = [100, 200, 300, 0, 0, 0, 0, 80, -90, -100, 110, 120];
const expectedAmountByMonth = [45, 90, 135, 0, 0, 0, 0, 36, -40.5, -45, 49.5, 54];

const rawResult = calculations.calculateCoverflexIrsFromRows(rubricRows, expenseRows);
const reversedRawResult = calculations.calculateCoverflexIrsFromRows(
  [...rubricRows].reverse(),
  [...expenseRows].reverse()
);
const modelResult = calculations.calculateCoverflexIrsFromModel(normalizedModel);

assert.deepEqual(rawResult.baseByMonth, expectedBaseByMonth);
assert.deepEqual(rawResult.amountByMonth, expectedAmountByMonth);
assert.equal(rawResult.annualBase, 720);
assert.equal(rawResult.annualAmount, 324);
assert.deepEqual(reversedRawResult, rawResult, "row order and repeated monthly rubric rows must not affect IRS");
assert.deepEqual(modelResult, rawResult, "raw Home rows and normalized Coverflex model must converge");

assert.equal(calculations.isExcludedIrsName("  ch\u00edca   b\u00e9ni "), true);
assert.equal(calculations.isExcludedIrsName("CHICA BENI extra"), true);
assert.equal(calculations.isExcludedIrsName("<img src=x onerror=alert(1)>"), false);
assert.equal(calculations.resolveEffectiveExpenseValue({ zerado: true, valor: 100, valor_estimado: 200 }), 0);
assert.equal(calculations.resolveEffectiveExpenseValue({ zerado: "t", valor: 100, valor_estimado: 200 }), 0);
assert.equal(calculations.resolveEffectiveExpenseValue({ valor: -5, valor_estimado: 200 }), -5);
assert.equal(calculations.resolveEffectiveExpenseValue({ valor: 0, valor_estimado: -7 }), -7);
assert.equal(calculations.resolveEffectiveExpenseValue({ valor: null, valor_Estimado: 8 }), 8);
assert.equal(calculations.resolveEffectiveExpenseValue({ valor: Number.NaN, valor_estimado: Number.POSITIVE_INFINITY }), 0);
assert.equal(calculations.resolveEffectiveExpenseValue({ valor: "", valor_estimado: "" }), 0);
const liveTargetResult = calculations.calculateCoverflexIrsFromEntries([{
  rubricType: "outcome",
  rubricName: "Geral",
  itemName: "Target aggregate",
  monthIndex: 0,
  totalizador: true,
  zerado: false,
  valor: 10780.65
}]);
assert.equal(liveTargetResult.annualBase, 10780.65);
assert.equal(liveTargetResult.annualAmount.toFixed(2), "4851.29");

const sliceBetween = (source, startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Unable to extract ${startMarker}`);
  return source.slice(start, end);
};

const homeAdapterSource = sliceBetween(
  homeSource,
  "function getDashboardFinancialCalculations(",
  "\n(async function homeInit"
);
const homeContext = vm.createContext({
  Error,
  String,
  expenseRows,
  result: null,
  rubricRows,
  window: { DashboardFinancialCalculations: calculations }
});
vm.runInContext(`
  ${homeAdapterSource}
  result = calculateHomeCoverflexIrs(rubricRows, expenseRows);
`, homeContext);
const homeResult = JSON.parse(JSON.stringify(homeContext.result));
assert.deepEqual(homeResult, rawResult);

const cgdConsumerSource = sliceBetween(
  cgdSource,
  "function computeEstimatedIrsMonthlyTotals(",
  "\nfunction parseRealDatabaseValue"
);
const coverflexContext = vm.createContext({
  model: normalizedModel,
  result: null,
  window: { DashboardFinancialCalculations: calculations }
});
vm.runInContext(`
  ${cgdConsumerSource}
  result = computeEstimatedIrsMonthlyTotals(model);
`, coverflexContext);
const coverflexMonthly = Array.from(coverflexContext.result);
assert.deepEqual(coverflexMonthly, expectedAmountByMonth);
assert.equal(
  coverflexMonthly.reduce((total, value) => total + value, 0),
  homeResult.annualAmount,
  "Home and Coverflex consumers must produce the exact same annual amount"
);

const missingHomeHelperContext = vm.createContext({
  Error,
  String,
  expenseRows,
  rubricRows,
  window: {}
});
vm.runInContext(homeAdapterSource, missingHomeHelperContext);
assert.throws(
  () => vm.runInContext("calculateHomeCoverflexIrs(rubricRows, expenseRows)", missingHomeHelperContext),
  /financial calculations are unavailable/
);
const missingCoverflexHelperContext = vm.createContext({ model: normalizedModel, window: {} });
vm.runInContext(cgdConsumerSource, missingCoverflexHelperContext);
assert.throws(
  () => vm.runInContext("computeEstimatedIrsMonthlyTotals(model)", missingCoverflexHelperContext),
  /financial calculations are unavailable/
);

const homeIrsFetch = sliceBetween(
  homeSource,
  "const fetchCoverflexIrsExpenses = async",
  "\n  const fetchCgdSavingsRows"
);
const homeIrsRender = sliceBetween(
  homeSource,
  "  let coverflexIrsResult = null;",
  "\n  // Audi Poupanca tiles"
);
assert.match(
  homeIrsFetch,
  /rubrica_id,despesa_id,despesa_desc,mes,valor,totalizador,zerado/
);
assert.match(homeIrsFetch, /valor_estimado/);
assert.match(homeIrsFetch, /valor_Estimado/);
assert.match(homeIrsFetch, /isMissingColumnError/);
assert.match(homeIrsRender, /calculateHomeCoverflexIrs\(rubrics, expenses\)/);
assert.match(homeIrsRender, /coverflexIrsResult\.annualAmount/);
assert.doesNotMatch(homeIrsRender, /valor_estimado|valor_Estimado|0\.45|\.reduce\(|\bfor\s*\(/);
assert.doesNotMatch(homeIrsRender, /catch\s*\{[\s\S]*?return\s+0/);
assert.doesNotMatch(homeSource, /0\.45/);
assert.doesNotMatch(cgdSource, /0\.45/);
assert.match(cgdConsumerSource, /calculateCoverflexIrsFromModel\(outcomeRubrics\)/);
assert.doesNotMatch(cgdConsumerSource, /chica|valor|\.reduce\(|\bfor\s*\(/i);
assert.equal((sharedSource.match(/0\.45/g) || []).length, 1, "the shared helper owns the IRS rate");
assert.doesNotMatch(sharedSource, /supabase|fetch\(|\.insert\(|\.update\(|\.delete\(|\.upsert\(/i);

const assertScriptOrder = (relativePath, helperPattern, consumerPattern) => {
  const html = read(relativePath);
  const helperIndex = html.search(helperPattern);
  const consumerIndex = html.search(consumerPattern);
  assert.ok(helperIndex >= 0, `Missing shared financial helper in ${relativePath}`);
  assert.ok(consumerIndex > helperIndex, `Shared financial helper must load before consumer in ${relativePath}`);
};

assertScriptOrder(
  "index.html",
  /dashboard-financial-calculations\.js\?v=20260813-1/,
  /home\.js\?v=20260813-2/
);
for (const relativePath of [
  "caixa-geral-depositos.html",
  "novobanco.html",
  "coverflex.html"
]) {
  assertScriptOrder(
    relativePath,
    /dashboard-financial-calculations\.js\?v=20260813-1/,
    /cgd\.js\?v=20260814-2/
  );
}
assert.doesNotMatch(read("admin.html"), /dashboard-financial-calculations/);
assert.match(homeSource, /IRS Coverflex \$\{year \+ 1\}/);
assert.match(read("coverflex.html"), /DASHBOARD_TABLE_PREFIX = "coverflex"/);

const runHomeExpenseFetchHarness = async (responseForProjection) => {
  const projections = [];
  const sb = {
    from(table) {
      assert.equal(table, "coverflex_despesa");
      let projection = "";
      const query = {
        select(value) {
          projection = value;
          projections.push(value);
          return query;
        },
        eq(field, value) {
          assert.equal(field, "ano");
          assert.equal(value, 2026);
          return query;
        },
        then(resolve, reject) {
          return Promise.resolve(responseForProjection(projection)).then(resolve, reject);
        }
      };
      return query;
    }
  };
  const context = vm.createContext({
    Error,
    Promise,
    String,
    result: null,
    sb,
    window: {},
    year: 2026,
    fetchRowsOnce: async (_key, requestFactory) => {
      const { data, error } = await requestFactory();
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    }
  });
  const result = await vm.runInContext(`
    (async () => {
      ${homeAdapterSource}
      ${homeIrsFetch}
      return fetchCoverflexIrsExpenses();
    })()
  `, context);
  return { projections, result: Array.from(result) };
};

(async () => {
  const legacyRow = {
    rubrica_id: 1,
    despesa_id: 11,
    despesa_desc: "Legacy",
    mes: 3,
    valor: 0,
    valor_Estimado: 300,
    totalizador: true,
    zerado: false
  };
  const fallbackHarness = await runHomeExpenseFetchHarness((projection) => (
    projection.includes("valor_estimado")
      ? { data: null, error: { code: "42703", message: "column valor_estimado does not exist" } }
      : { data: [legacyRow], error: null }
  ));
  assert.deepEqual(fallbackHarness.result, [legacyRow]);
  assert.equal(fallbackHarness.projections.length, 2);
  assert.match(fallbackHarness.projections[0], /valor_estimado$/);
  assert.match(fallbackHarness.projections[1], /valor_Estimado$/);

  const permissionError = { code: "42501", message: "permission denied" };
  await assert.rejects(
    runHomeExpenseFetchHarness(() => ({ data: null, error: permissionError })),
    (error) => error === permissionError
  );

  console.log("Shared Coverflex IRS parity regression checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
