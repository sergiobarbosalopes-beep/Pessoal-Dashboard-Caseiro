const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const cgd = fs.readFileSync(path.join(__dirname, "..", "assets", "js", "cgd.js"), "utf8");
const helperStart = cgd.indexOf("function parseRealDatabaseValue(");
const helperEnd = cgd.indexOf(
  "\nfunction buildRealComputationContextsForFutureMonths",
  helperStart
);

assert.ok(helperStart >= 0 && helperEnd > helperStart, "Real production helpers must be extractable");

const context = vm.createContext({
  Array,
  Boolean,
  Map,
  Number,
  Set,
  String,
  HIDE_SAVINGS: false,
  fallbackMock: {},
  months: Array.from({ length: 12 }, (_, index) => index + 1),
  emptyValues: () => Array.from({ length: 12 }, () => 0),
  normalizeMonth: (value) => {
    const month = Number(value);
    return Number.isInteger(month) && month >= 1 && month <= 12 ? month - 1 : -1;
  },
  realApi: null
});

vm.runInContext(`
  ${cgd.slice(helperStart, helperEnd)}
  realApi = {
    parseRealDatabaseValue,
    buildRealValuesFromRows,
    computeRealSeriesForYear,
    computeSavingsSeriesForYear
  };
`, context);

const api = context.realApi;
const missingValues = [
  api.parseRealDatabaseValue(null),
  api.parseRealDatabaseValue(undefined),
  api.parseRealDatabaseValue(""),
  api.parseRealDatabaseValue("   "),
  api.parseRealDatabaseValue(Number.NaN),
  api.parseRealDatabaseValue(Number.POSITIVE_INFINITY)
];
assert.deepEqual(Array.from(missingValues), [null, null, null, null, null, null]);
assert.equal(api.parseRealDatabaseValue(0), 0);
assert.equal(api.parseRealDatabaseValue("0"), 0);
assert.equal(api.parseRealDatabaseValue("12194.01"), 12194.01);

const parsedRows = api.buildRealValuesFromRows([
  { mes: 1, real: null },
  { mes: 2, real: " " },
  { mes: 3, real: "0" }
]);
assert.deepEqual(Array.from(parsedRows.slice(0, 3)), [null, null, 0]);

const zeros = () => Array.from({ length: 12 }, () => 0);
const missing = () => Array.from({ length: 12 }, () => null);
const previousSavingsDeltas = zeros();
previousSavingsDeltas[0] = 8392;
previousSavingsDeltas[11] = 1066.86;
const previousIncome = zeros();
previousIncome[11] = 1431;
const previousOutcome = zeros();
previousOutcome[11] = 876;
const previousReal = missing();
previousReal[11] = 12194.01;

const contexts = {
  2026: {
    dbRealValues: previousReal,
    totals: {
      income: previousIncome,
      savings: previousSavingsDeltas,
      outcome: previousOutcome
    }
  },
  2027: {
    dbRealValues: missing(),
    totals: {
      income: zeros(),
      savings: zeros(),
      outcome: zeros()
    }
  }
};

const real2027 = api.computeRealSeriesForYear(2027, contexts);
assert.ok(Math.abs(real2027.values[0] - 13815.87) < 1e-9);
assert.ok(real2027.values.every((value) => Math.abs(value - 13815.87) < 1e-9));
assert.ok(real2027.estimatedFlags.every(Boolean));

const savings2027 = api.computeSavingsSeriesForYear(2027, contexts);
assert.ok(Math.abs(savings2027[0] - 9458.86) < 1e-9);
assert.ok(savings2027.every((value) => Math.abs(value - 9458.86) < 1e-9));
assert.ok(Math.abs(real2027.values[0] - savings2027[0] - 4357.01) < 1e-9);

const explicitZeroContexts = {
  ...contexts,
  2027: {
    ...contexts[2027],
    dbRealValues: api.buildRealValuesFromRows([{ mes: 1, real: "0" }])
  }
};
const explicitZeroReal = api.computeRealSeriesForYear(2027, explicitZeroContexts);
assert.equal(explicitZeroReal.values[0], 0);
assert.equal(explicitZeroReal.estimatedFlags[0], false);

console.log("Real estimation regression checks passed.");
