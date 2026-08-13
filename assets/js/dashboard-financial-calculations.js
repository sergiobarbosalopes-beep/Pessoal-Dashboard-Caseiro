(function exposeDashboardFinancialCalculations(root, factory) {
  const calculations = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = calculations;
  }
  if (root) {
    root.DashboardFinancialCalculations = calculations;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createDashboardFinancialCalculations() {
  const MONTH_COUNT = 12;
  const DEFAULT_IRS_RATE = 0.45;
  const EXCLUDED_IRS_NAME = "chica beni";

  function normalizeComparableText(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ");
  }

  function parseBoolean(value) {
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "number") {
      return value !== 0;
    }
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      return normalized === "true" || normalized === "t" || normalized === "1" || normalized === "yes" || normalized === "sim";
    }
    return false;
  }

  function isExplicitFalse(value) {
    if (value === false || value === 0) {
      return true;
    }
    if (typeof value !== "string") {
      return false;
    }
    const normalized = value.trim().toLowerCase();
    return normalized === "false" || normalized === "0" || normalized === "no" || normalized === "nao" || normalized === "não";
  }

  function parseFiniteValue(value) {
    if (value == null || (typeof value === "string" && value.trim() === "")) {
      return null;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function resolveEffectiveExpenseValue(record) {
    if (parseBoolean(record?.zerado)) {
      return 0;
    }

    const actual = parseFiniteValue(record?.valor);
    if (actual !== null && actual !== 0) {
      return actual;
    }

    const estimates = [record?.valor_estimado, record?.valor_Estimado];
    for (const estimateValue of estimates) {
      const estimate = parseFiniteValue(estimateValue);
      if (estimate !== null) {
        return estimate;
      }
    }

    return 0;
  }

  function normalizeOutcomeType(value) {
    const normalized = normalizeComparableText(value);
    return normalized === "despesa"
      || normalized === "despesas"
      || normalized === "outcome"
      || normalized === "expense";
  }

  function isExcludedIrsName(value) {
    return normalizeComparableText(value).includes(EXCLUDED_IRS_NAME);
  }

  function normalizeOneBasedMonth(value) {
    const numeric = Number(value);
    if (!Number.isInteger(numeric) || numeric < 1 || numeric > MONTH_COUNT) {
      return -1;
    }
    return numeric - 1;
  }

  function calculateCoverflexIrsFromEntries(entries, options = {}) {
    const rateValue = Number(options.rate);
    const rate = Number.isFinite(rateValue) ? rateValue : DEFAULT_IRS_RATE;
    const baseByMonth = Array.from({ length: MONTH_COUNT }, () => 0);

    (Array.isArray(entries) ? entries : []).forEach((entry) => {
      const monthIndex = Number(entry?.monthIndex);
      if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex >= MONTH_COUNT) {
        return;
      }
      if (!normalizeOutcomeType(entry?.rubricType)) {
        return;
      }
      if (isExcludedIrsName(entry?.rubricName) || isExcludedIrsName(entry?.itemName)) {
        return;
      }
      if (isExplicitFalse(entry?.totalizador)) {
        return;
      }

      baseByMonth[monthIndex] += resolveEffectiveExpenseValue(entry);
    });

    const amountByMonth = baseByMonth.map((value) => value * rate);
    const annualBase = baseByMonth.reduce((total, value) => total + value, 0);
    const annualAmount = amountByMonth.reduce((total, value) => total + value, 0);
    return {
      rate,
      baseByMonth,
      amountByMonth,
      annualBase,
      annualAmount
    };
  }

  function calculateCoverflexIrsFromRows(rubricRows, expenseRows, options = {}) {
    const outcomeRubricsById = new Map();
    (Array.isArray(rubricRows) ? rubricRows : []).forEach((rubric) => {
      if (!normalizeOutcomeType(rubric?.rubrica_tipo)) {
        return;
      }
      const rubricId = rubric?.rubrica_id;
      if (rubricId == null) {
        return;
      }
      const key = String(rubricId);
      const existing = outcomeRubricsById.get(key);
      const rubricName = rubric?.rubrica_desc || "";
      outcomeRubricsById.set(key, {
        rubricType: "outcome",
        rubricName: existing?.rubricName || rubricName,
        excluded: Boolean(existing?.excluded || isExcludedIrsName(rubricName))
      });
    });

    const entries = [];
    (Array.isArray(expenseRows) ? expenseRows : []).forEach((expense) => {
      const rubric = outcomeRubricsById.get(String(expense?.rubrica_id));
      if (!rubric || rubric.excluded) {
        return;
      }
      const monthIndex = normalizeOneBasedMonth(expense?.mes);
      if (monthIndex < 0) {
        return;
      }
      entries.push({
        rubricType: rubric.rubricType,
        rubricName: rubric.rubricName,
        itemName: expense?.despesa_desc || "",
        monthIndex,
        totalizador: parseBoolean(expense?.totalizador),
        zerado: expense?.zerado,
        valor: expense?.valor,
        valor_estimado: expense?.valor_estimado,
        valor_Estimado: expense?.valor_Estimado
      });
    });

    return calculateCoverflexIrsFromEntries(entries, options);
  }

  function calculateCoverflexIrsFromModel(outcomeRubrics, options = {}) {
    const entries = [];
    (Array.isArray(outcomeRubrics) ? outcomeRubrics : []).forEach((rubric) => {
      const rubricType = rubric?.type || "outcome";
      if (!normalizeOutcomeType(rubricType)) {
        return;
      }
      const expenses = Array.isArray(rubric?.expenses) ? rubric.expenses : [];
      if (!expenses.length) {
        for (let monthIndex = 0; monthIndex < MONTH_COUNT; monthIndex += 1) {
          entries.push({
            rubricType,
            rubricName: rubric?.name || "",
            itemName: "",
            monthIndex,
            totalizador: true,
            valor: rubric?.values?.[monthIndex]
          });
        }
        return;
      }

      expenses.forEach((expense) => {
        for (let monthIndex = 0; monthIndex < MONTH_COUNT; monthIndex += 1) {
          const monthData = expense?.monthData?.[monthIndex] || {};
          entries.push({
            rubricType,
            rubricName: rubric?.name || "",
            itemName: expense?.name || "",
            monthIndex,
            totalizador: parseBoolean(monthData.totalizador),
            zerado: monthData.zerado,
            valor: monthData.valor,
            valor_estimado: monthData.valorEstimado
          });
        }
      });
    });

    return calculateCoverflexIrsFromEntries(entries, options);
  }

  return Object.freeze({
    calculateCoverflexIrsFromEntries,
    calculateCoverflexIrsFromModel,
    calculateCoverflexIrsFromRows,
    isExcludedIrsName,
    normalizeComparableText,
    resolveEffectiveExpenseValue
  });
});
