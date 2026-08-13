const MONTHS_PT = ["Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function money(value) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(value);
}

function escapeHtml(str) {
  const el = document.createElement("span");
  el.textContent = str;
  return el.innerHTML;
}

function getDashboardFinancialCalculations() {
  const calculator = window.DashboardFinancialCalculations;
  if (!calculator?.calculateCoverflexIrsFromRows) {
    throw new Error("Dashboard financial calculations are unavailable.");
  }
  return calculator;
}

function calculateHomeCoverflexIrs(rubricRows, expenseRows) {
  return getDashboardFinancialCalculations().calculateCoverflexIrsFromRows(rubricRows, expenseRows);
}

function isMissingColumnError(error) {
  const code = String(error?.code || "").trim();
  const message = String(error?.message || "");
  return code === "42703" || code === "PGRST204" || /column .* does not exist/i.test(message);
}

(async function homeInit() {
  const SUPABASE_URL = window.CGD_SUPABASE_URL || "";
  const SUPABASE_KEY = window.CGD_SUPABASE_ANON_KEY || "";
  if (!window.supabase?.createClient || !SUPABASE_URL || !SUPABASE_KEY) return;

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  const year = new Date().getFullYear();
  const currentMonth = new Date().getMonth(); // 0-indexed
  const requestCache = new Map();

  const fetchRowsOnce = (key, requestFactory) => {
    if (requestCache.has(key)) {
      return requestCache.get(key);
    }

    const request = Promise.resolve()
      .then(requestFactory)
      .then(({ data, error }) => {
        if (error) throw error;
        return Array.isArray(data) ? data : [];
      })
      .catch((error) => {
        if (requestCache.get(key) === request) {
          requestCache.delete(key);
        }
        throw error;
      });

    requestCache.set(key, request);
    return request;
  };

  const fetchCoverflexIrsExpenses = async () => {
    const baseColumns = "rubrica_id,despesa_id,despesa_desc,mes,valor,totalizador,zerado";
    try {
      return await fetchRowsOnce(
        `coverflex_despesa:irs:${year}:valor_estimado`,
        () => sb.from("coverflex_despesa")
          .select(`${baseColumns},valor_estimado`)
          .eq("ano", year)
      );
    } catch (error) {
      if (!isMissingColumnError(error)) {
        throw error;
      }
      return fetchRowsOnce(
        `coverflex_despesa:irs:${year}:valor_Estimado`,
        () => sb.from("coverflex_despesa")
          .select(`${baseColumns},valor_Estimado`)
          .eq("ano", year)
      );
    }
  };

  const fetchCgdSavingsRows = () => Promise.all([
    fetchRowsOnce(
      "cgd_rubrica:savings:all",
      () => sb.from("cgd_rubrica").select("rubrica_id,ano,mes,rubrica_tipo,rubrica_desc").in("rubrica_tipo", ["Aprovisionamento"])
    ),
    fetchRowsOnce(
      "cgd_despesa:savings:all",
      () => sb.from("cgd_despesa").select("rubrica_id,ano,mes,valor,valor_estimado,zerado")
    )
  ]).then(([rubrics, expenses]) => ({ rubrics, expenses }));

  // Update title
  const titleEl = document.getElementById("home-resumo-title");
  if (titleEl) {
    titleEl.textContent = "Resumo Saldo Total";
  }

  // Fetch real values from all 3 tables (for current year AND next year)
  const fetchReal = async (table, yr) => {
    try {
      return await fetchRowsOnce(
        `${table}:real:${yr}`,
        () => sb.from(table).select("ano,mes,real").eq("ano", yr).order("mes", { ascending: true })
      );
    } catch { return []; }
  };

  // Compute estimated real series for a bank (mimics CGD totalizer logic)
  // Returns array of 12 values for the given year, using stored real when available, otherwise estimating
  function computeEstimatedRealSeries(dbReals, monthlyTotals, yr) {
    // dbReals: array of {ano, mes, real}
    // monthlyTotals: { income: [12], savings: [12], outcome: [12] } for the given year
    const result = new Array(12).fill(0);
    const dbMap = new Map();
    for (const r of dbReals) {
      if (Number(r.ano) === yr && r.real != null && Number.isFinite(Number(r.real))) {
        dbMap.set(Number(r.mes) - 1, Number(r.real));
      }
    }

    for (let m = 0; m < 12; m++) {
      if (dbMap.has(m)) {
        result[m] = dbMap.get(m);
      } else {
        // Estimate: previous real + income[prev] + savings[prev] - outcome[prev]
        if (m === 0) {
          // For January, we'd need December of previous year - use 0 if no data
          result[m] = 0;
        } else {
          const prevReal = result[m - 1];
          const prevIncome = monthlyTotals.income[m - 1] || 0;
          const prevSavings = monthlyTotals.savings[m - 1] || 0;
          const prevOutcome = monthlyTotals.outcome[m - 1] || 0;
          result[m] = prevReal + prevIncome + prevSavings - prevOutcome;
        }
      }
    }
    return result;
  }

  // Fetch monthly income/outcome/savings totals for a bank
  const fetchBankTotals = async (rubricTable, expenseTable, yr) => {
    const empty = { income: new Array(12).fill(0), savings: new Array(12).fill(0), outcome: new Array(12).fill(0) };
    try {
      const [rubrics, expenses] = await Promise.all([
        fetchRowsOnce(
          `${rubricTable}:totals:${yr}`,
          () => sb.from(rubricTable).select("rubrica_id,rubrica_tipo").eq("ano", yr)
        ),
        fetchRowsOnce(
          `${expenseTable}:totals:${yr}`,
          () => sb.from(expenseTable).select("rubrica_id,ano,mes,valor,valor_estimado,zerado").eq("ano", yr)
        )
      ]);

      const incomeIds = new Set();
      const savingsIds = new Set();
      const outcomeIds = new Set();
      for (const r of rubrics) {
        if (r.rubrica_tipo === "Receita") incomeIds.add(r.rubrica_id);
        else if (r.rubrica_tipo === "Aprovisionamento") savingsIds.add(r.rubrica_id);
        else if (r.rubrica_tipo === "Despesa") outcomeIds.add(r.rubrica_id);
      }

      const income = new Array(12).fill(0);
      const savings = new Array(12).fill(0);
      const outcome = new Array(12).fill(0);
      for (const exp of expenses) {
        if (exp.zerado === true || exp.zerado === "true") continue;
        const val = Number(exp.valor) || Number(exp.valor_estimado) || 0;
        const m = Number(exp.mes) - 1;
        if (m < 0 || m > 11) continue;
        if (incomeIds.has(exp.rubrica_id)) income[m] += val;
        else if (savingsIds.has(exp.rubrica_id)) savings[m] += val;
        else if (outcomeIds.has(exp.rubrica_id)) outcome[m] += val;
      }
      return { income, savings, outcome };
    } catch { return empty; }
  };

  // Fetch CGD savings rubrics + expenses to compute accumulated savings (total, IRS, Audi)
  const fetchCgdSavings = async () => {
    const empty = { totalAccumulated: 0, totalAccumulatedJan: 0, totalAccumulatedPrev: 0, irsAccumulated: 0, audiAccumulated: 0, irsAccumulatedJan: 0, audiAccumulatedJan: 0, irsAccumulatedPrev: 0, audiAccumulatedPrev: 0, totalAccumulatedNext: 0, irsAccumulatedNext: 0, audiAccumulatedNext: 0, totalAccumulatedJanNext: 0, irsAccumulatedJanNext: 0, audiAccumulatedJanNext: 0 };
    try {
      const { rubrics, expenses } = await fetchCgdSavingsRows();

      const allSavingsIds = new Set();
      const irsIds = new Set();
      const audiIds = new Set();
      for (const r of rubrics) {
        allSavingsIds.add(r.rubrica_id);
        const name = (r.rubrica_desc || "").toLowerCase();
        if (name.includes("irs")) irsIds.add(r.rubrica_id);
        if (name.includes("audi")) audiIds.add(r.rubrica_id);
      }

      const prevMonth = currentMonth > 0 ? currentMonth - 1 : 11;
      const prevYear = currentMonth > 0 ? year : year - 1;
      const nextMonth = currentMonth < 11 ? currentMonth + 1 : 0;
      const nextYear = currentMonth < 11 ? year : year + 1;

      let totalAccumulated = 0, totalAccumulatedJan = 0, totalAccumulatedPrev = 0;
      let irsAccumulated = 0, audiAccumulated = 0;
      let irsAccumulatedJan = 0, audiAccumulatedJan = 0;
      let irsAccumulatedPrev = 0, audiAccumulatedPrev = 0;
      let totalAccumulatedNext = 0, irsAccumulatedNext = 0, audiAccumulatedNext = 0;
      let totalAccumulatedJanNext = 0, irsAccumulatedJanNext = 0, audiAccumulatedJanNext = 0;

      for (const exp of expenses) {
        if (!allSavingsIds.has(exp.rubrica_id)) continue;
        if (exp.zerado === true || exp.zerado === "true") continue;
        const val = Number(exp.valor) || Number(exp.valor_estimado) || 0;
        const expYear = Number(exp.ano);
        const expMonth = Number(exp.mes) - 1;

        const isBeforeCurrentMonth = expYear < year || (expYear === year && expMonth < currentMonth);
        const isBeforeJanuary = expYear < year;
        const isBeforePrevMonth = expYear < prevYear || (expYear === prevYear && expMonth < prevMonth);
        const isBeforeNextMonth = expYear < nextYear || (expYear === nextYear && expMonth < nextMonth);
        const isBeforeJanNextYear = expYear < year + 1;

        if (isBeforeCurrentMonth) totalAccumulated += val;
        if (isBeforeJanuary) totalAccumulatedJan += val;
        if (isBeforePrevMonth) totalAccumulatedPrev += val;
        if (isBeforeNextMonth) totalAccumulatedNext += val;
        if (isBeforeJanNextYear) totalAccumulatedJanNext += val;

        if (irsIds.has(exp.rubrica_id)) {
          if (isBeforeCurrentMonth) irsAccumulated += val;
          if (isBeforeJanuary) irsAccumulatedJan += val;
          if (isBeforePrevMonth) irsAccumulatedPrev += val;
          if (isBeforeNextMonth) irsAccumulatedNext += val;
          if (isBeforeJanNextYear) irsAccumulatedJanNext += val;
        }
        if (audiIds.has(exp.rubrica_id)) {
          if (isBeforeCurrentMonth) audiAccumulated += val;
          if (isBeforeJanuary) audiAccumulatedJan += val;
          if (isBeforePrevMonth) audiAccumulatedPrev += val;
          if (isBeforeNextMonth) audiAccumulatedNext += val;
          if (isBeforeJanNextYear) audiAccumulatedJanNext += val;
        }
      }
      return { totalAccumulated, totalAccumulatedJan, totalAccumulatedPrev, irsAccumulated, audiAccumulated, irsAccumulatedJan, audiAccumulatedJan, irsAccumulatedPrev, audiAccumulatedPrev, totalAccumulatedNext, irsAccumulatedNext, audiAccumulatedNext, totalAccumulatedJanNext, irsAccumulatedJanNext, audiAccumulatedJanNext };
    } catch { return empty; }
  };

  const [cgdReals, nbReals, coverflexReals, cgdRealsNext, nbRealsNext, coverflexRealsNext, cgdSavingsData, cgdTotals, nbTotals, coverflexTotals, cgdTotalsNext, nbTotalsNext, coverflexTotalsNext] = await Promise.all([
    fetchReal("cgd_real", year),
    fetchReal("nb_real", year),
    fetchReal("coverflex_real", year),
    fetchReal("cgd_real", year + 1),
    fetchReal("nb_real", year + 1),
    fetchReal("coverflex_real", year + 1),
    fetchCgdSavings(),
    fetchBankTotals("cgd_rubrica", "cgd_despesa", year),
    fetchBankTotals("nb_rubrica", "nb_despesa", year),
    fetchBankTotals("coverflex_rubrica", "coverflex_despesa", year),
    fetchBankTotals("cgd_rubrica", "cgd_despesa", year + 1),
    fetchBankTotals("nb_rubrica", "nb_despesa", year + 1),
    fetchBankTotals("coverflex_rubrica", "coverflex_despesa", year + 1)
  ]);

  // Build estimated real series for each bank (current year and next year)
  const cgdEstimated = computeEstimatedRealSeries(cgdReals, cgdTotals, year);
  const nbEstimated = computeEstimatedRealSeries(nbReals, nbTotals, year);
  const coverflexEstimated = computeEstimatedRealSeries(coverflexReals, coverflexTotals, year);
  const cgdEstimatedNext = computeEstimatedRealSeries(cgdRealsNext, cgdTotalsNext, year + 1);
  const nbEstimatedNext = computeEstimatedRealSeries(nbRealsNext, nbTotalsNext, year + 1);
  const coverflexEstimatedNext = computeEstimatedRealSeries(coverflexRealsNext, coverflexTotalsNext, year + 1);

  // For next year January estimation, chain from December of current year
  // If Jan next year has no valid DB value, estimate from Dec current year
  const hasValidReal = (reals, mes) => reals.some(r => Number(r.mes) === mes && r.real != null && Number.isFinite(Number(r.real)));
  if (!hasValidReal(cgdRealsNext, 1)) {
    cgdEstimatedNext[0] = cgdEstimated[11] + (cgdTotals.income[11] || 0) + (cgdTotals.savings[11] || 0) - (cgdTotals.outcome[11] || 0);
  }
  if (!hasValidReal(nbRealsNext, 1)) {
    nbEstimatedNext[0] = nbEstimated[11] + (nbTotals.income[11] || 0) + (nbTotals.savings[11] || 0) - (nbTotals.outcome[11] || 0);
  }
  if (!hasValidReal(coverflexRealsNext, 1)) {
    coverflexEstimatedNext[0] = coverflexEstimated[11] + (coverflexTotals.income[11] || 0) + (coverflexTotals.savings[11] || 0) - (coverflexTotals.outcome[11] || 0);
  }

  // Helper: get value from estimated series
  const getVal = (series, monthIndex) => series[monthIndex] || 0;
  const getValNext = (series, monthIndex) => series[monthIndex] || 0;

  // Current month values
  const cgdReal = getVal(cgdEstimated, currentMonth);
  const nbReal = getVal(nbEstimated, currentMonth);
  const coverflexReal = getVal(coverflexEstimated, currentMonth);
  const cgdAccumulatedSavings = cgdSavingsData.totalAccumulated;
  const totalSaldo = cgdReal + nbReal + coverflexReal;
  const cgdDisponivel = cgdReal - cgdAccumulatedSavings;
  const saldoDisponivel = cgdDisponivel + nbReal + coverflexReal;

  // January values
  const cgdRealJan = getVal(cgdEstimated, 0);
  const nbRealJan = getVal(nbEstimated, 0);
  const coverflexRealJan = getVal(coverflexEstimated, 0);
  const cgdAccumulatedSavingsJan = cgdSavingsData.totalAccumulatedJan;
  const cgdDisponivelJan = cgdRealJan - cgdAccumulatedSavingsJan;
  const saldoDisponivelJan = cgdDisponivelJan + nbRealJan + coverflexRealJan;

  // Previous month values
  const prevMonthIdx = currentMonth > 0 ? currentMonth - 1 : 11;
  const prevMonthName = MONTHS_PT[prevMonthIdx];
  const cgdRealPrev = getVal(cgdEstimated, prevMonthIdx);
  const nbRealPrev = getVal(nbEstimated, prevMonthIdx);
  const coverflexRealPrev = getVal(coverflexEstimated, prevMonthIdx);
  const cgdAccumulatedSavingsPrev = cgdSavingsData.totalAccumulatedPrev;
  const cgdDisponivelPrev = cgdRealPrev - cgdAccumulatedSavingsPrev;
  const saldoDisponivelPrev = cgdDisponivelPrev + nbRealPrev + coverflexRealPrev;

  // Next month values
  const nextMonthIdx = currentMonth < 11 ? currentMonth + 1 : 0;
  const nextMonthYear = currentMonth < 11 ? year : year + 1;
  const cgdRealNext = nextMonthYear === year ? getVal(cgdEstimated, nextMonthIdx) : getValNext(cgdEstimatedNext, nextMonthIdx);
  const nbRealNext = nextMonthYear === year ? getVal(nbEstimated, nextMonthIdx) : getValNext(nbEstimatedNext, nextMonthIdx);
  const coverflexRealNext = nextMonthYear === year ? getVal(coverflexEstimated, nextMonthIdx) : getValNext(coverflexEstimatedNext, nextMonthIdx);
  const cgdAccumulatedSavingsNext = cgdSavingsData.totalAccumulatedNext;
  const cgdDisponivelNext = cgdRealNext - cgdAccumulatedSavingsNext;

  // January next year values
  const cgdRealJanNext = getValNext(cgdEstimatedNext, 0);
  const nbRealJanNext = getValNext(nbEstimatedNext, 0);
  const coverflexRealJanNext = getValNext(coverflexEstimatedNext, 0);
  const cgdAccumulatedSavingsJanNext = cgdSavingsData.totalAccumulatedJanNext;
  const cgdDisponivelJanNext = cgdRealJanNext - cgdAccumulatedSavingsJanNext;

  // IRS and Audi accumulated
  const irsAccumulated = cgdSavingsData.irsAccumulated;
  const irsAccumulatedJan = cgdSavingsData.irsAccumulatedJan;
  const audiAccumulated = cgdSavingsData.audiAccumulated;
  const audiAccumulatedJan = cgdSavingsData.audiAccumulatedJan;
  const irsAccumulatedPrev = cgdSavingsData.irsAccumulatedPrev;
  const audiAccumulatedPrev = cgdSavingsData.audiAccumulatedPrev;

  // ─── Pie chart renderer ────────────────────────────────────────────────
  const PIE_COLORS = ["#2f9ad4", "#00dc6e", "#f2c46a"];

  function renderPieChart(hostId, title, cgdVal, nbVal, coverVal, { highlight = false, past = false } = {}) {
    const slices = [
      { label: "CGD", value: Math.abs(cgdVal), color: PIE_COLORS[0] },
      { label: "Novo Banco", value: Math.abs(nbVal), color: PIE_COLORS[1] },
      { label: "Coverflex", value: Math.abs(coverVal), color: PIE_COLORS[2] }
    ].filter(s => s.value !== 0);

    const pieHost = document.getElementById(hostId);
    if (!pieHost || !slices.length) return;

    if (highlight) pieHost.classList.add("nb-pie-card--active");
    if (past) pieHost.classList.add("nb-pie-card--past");

    const totalVal = slices.reduce((s, e) => s + e.value, 0);
    const cx = 50, cy = 50, outerR = 42, innerR = 24;
    let currentAngle = 0;
    const gap = 1.5; // gap degrees between slices

    function polarToCartesian(ccx, ccy, r, angleDeg) {
      const rad = (angleDeg - 90) * Math.PI / 180;
      return { x: ccx + r * Math.cos(rad), y: ccy + r * Math.sin(rad) };
    }

    const paths = slices.map((slice, i) => {
      const sliceAngle = (slice.value / totalVal) * 360;
      const startAngle = currentAngle + (i === 0 ? 0 : gap / 2);
      const endAngle = currentAngle + sliceAngle - gap / 2;
      currentAngle += sliceAngle;

      if (endAngle - startAngle < 0.5) return "";

      const outerStart = polarToCartesian(cx, cy, outerR, startAngle);
      const outerEnd = polarToCartesian(cx, cy, outerR, endAngle);
      const innerStart = polarToCartesian(cx, cy, innerR, endAngle);
      const innerEnd = polarToCartesian(cx, cy, innerR, startAngle);
      const largeArc = (endAngle - startAngle) > 180 ? 1 : 0;

      const d = [
        `M ${outerStart.x.toFixed(2)} ${outerStart.y.toFixed(2)}`,
        `A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerEnd.x.toFixed(2)} ${outerEnd.y.toFixed(2)}`,
        `L ${innerStart.x.toFixed(2)} ${innerStart.y.toFixed(2)}`,
        `A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerEnd.x.toFixed(2)} ${innerEnd.y.toFixed(2)}`,
        "Z"
      ].join(" ");

      const pct = ((slice.value / totalVal) * 100).toFixed(1);
      return `<path class='nb-pie-slice' d='${d}' fill='${slice.color}' stroke='none' data-pie-label='${escapeHtml(slice.label)}' data-pie-value='${money(slice.value)}' data-pie-pct='${pct}%' data-pie-color='${slice.color}'/>`;
    }).join("");

    const legend = slices.map((slice) => {
      const pct = ((slice.value / totalVal) * 100).toFixed(0);
      return `<span class='nb-pie-legend-item'><span class='nb-pie-legend-dot' style='background:${slice.color}'></span>${escapeHtml(slice.label)} ${pct}%</span>`;
    }).join("");

    const totalDisplay = money(cgdVal + nbVal + coverVal);

    pieHost.innerHTML = `
      <h4 class='nb-pie-title'>${escapeHtml(title)}</h4>
      <div class='nb-pie-body'>
        <div class='nb-pie-svg-wrap'>
          <svg class='nb-pie-svg' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'>
            ${paths}
          </svg>
          <div class='nb-pie-center-label'>
            <span class='nb-pie-center-value'>${totalDisplay}</span>
          </div>
        </div>
      </div>
      <div class='nb-pie-legend nb-pie-legend--bottom'>${legend}</div>
      <div class='nb-pie-tooltip' aria-hidden='true'></div>
    `;

    // Tooltip hover
    const wrap = pieHost.querySelector(".nb-pie-svg-wrap");
    const tooltip = pieHost.querySelector(".nb-pie-tooltip");
    if (wrap && tooltip) {
      const hideTooltip = () => tooltip.classList.remove("is-visible");
      pieHost.addEventListener("pointerleave", hideTooltip);
      wrap.querySelectorAll(".nb-pie-slice").forEach((sliceEl) => {
        const showTip = () => {
          const label = sliceEl.getAttribute("data-pie-label");
          const value = sliceEl.getAttribute("data-pie-value");
          const pct = sliceEl.getAttribute("data-pie-pct");
          const color = sliceEl.getAttribute("data-pie-color");
          const row = document.createElement("div");
          row.className = "nb-pie-tooltip-row";
          const dot = document.createElement("span");
          dot.className = "nb-pie-tooltip-dot";
          dot.style.backgroundColor = color;
          const labelEl = document.createElement("span");
          labelEl.className = "nb-pie-tooltip-label";
          labelEl.textContent = label;
          const valueEl = document.createElement("strong");
          valueEl.className = "nb-pie-tooltip-value";
          valueEl.textContent = value;
          const pctEl = document.createElement("span");
          pctEl.className = "nb-pie-tooltip-pct";
          pctEl.textContent = `(${pct})`;
          row.append(dot, labelEl, valueEl, pctEl);
          tooltip.replaceChildren(row);
          tooltip.classList.add("is-visible");
        };
        sliceEl.addEventListener("pointerenter", showTip);
        sliceEl.addEventListener("pointerleave", hideTooltip);
      });
    }
  }

  // Render 5 pie charts
  const prevMonthYear = currentMonth > 0 ? year : year - 1;
  renderPieChart("home-pie-jan", `Janeiro ${year}`, cgdRealJan, nbRealJan, coverflexRealJan, { past: true });
  renderPieChart("home-pie-prev", `${MONTHS_PT[prevMonthIdx]} ${prevMonthYear}`, cgdRealPrev, nbRealPrev, coverflexRealPrev, { past: true });
  renderPieChart("home-pie-saldo", `${MONTHS_PT[currentMonth]} ${year}`, cgdReal, nbReal, coverflexReal, { highlight: true });
  renderPieChart("home-pie-next", `${MONTHS_PT[nextMonthIdx]} ${nextMonthYear}`, cgdRealNext, nbRealNext, coverflexRealNext);
  renderPieChart("home-pie-jan-next", `Janeiro ${year + 1}`, cgdRealJanNext, nbRealJanNext, coverflexRealJanNext);

  // ─── Temporal Evolution Chart ──────────────────────────────────────────
  (function renderTemporalChart() {
    const host = document.getElementById("home-temporal-chart");
    if (!host) return;

    // Build 12-month accumulated savings for IRS and Audi from raw expenses
    const buildMonthlySavings = async (filterFn) => {
      try {
        const { rubrics, expenses } = await fetchCgdSavingsRows();
        const ids = new Set();
        for (const r of rubrics) {
          if (filterFn(r.rubrica_desc || "")) ids.add(r.rubrica_id);
        }
        // Accumulated up to each month
        const result = new Array(12).fill(0);
        for (const exp of expenses) {
          if (!ids.has(exp.rubrica_id)) continue;
          if (exp.zerado === true || exp.zerado === "true") continue;
          const val = Number(exp.valor) || Number(exp.valor_estimado) || 0;
          const expYear = Number(exp.ano);
          const expMonth = Number(exp.mes) - 1;
          for (let m = 0; m < 12; m++) {
            if (expYear < year || (expYear === year && expMonth < m)) {
              result[m] += val;
            }
          }
        }
        return result;
      } catch { return new Array(12).fill(0); }
    };

    // Compute all monthly accumulated savings
    Promise.all([
      buildMonthlySavings((desc) => true), // all savings
      buildMonthlySavings((desc) => desc.toLowerCase().includes("irs")),
      buildMonthlySavings((desc) => desc.toLowerCase().includes("audi"))
    ]).then(([allSavingsMonthly, irsMonthly, audiMonthly]) => {
      // CGD disponivel = cgdEstimated - allSavingsMonthly
      const cgdDispSeries = cgdEstimated.map((v, m) => v - allSavingsMonthly[m]);
      const nbSeries = nbEstimated.slice();
      const cfSeries = coverflexEstimated.slice();
      const irsSeries = irsMonthly;
      const audiSeries = audiMonthly;
      const totalSeries = cgdDispSeries.map((v, m) => v + nbSeries[m] + cfSeries[m]);

      const CHART_COLORS = {
        cgd: "#2f9ad4",
        nb: "#00dc6e",
        cf: "#f2c46a",
        irs: "#ef9a9a",
        audi: "#b388ff",
        total: "#ffffff"
      };

      const allSeries = [
        { key: "total", label: "Total Disponivel", color: CHART_COLORS.total, values: totalSeries },
        { key: "cgd", label: "CGD", color: CHART_COLORS.cgd, values: cgdDispSeries },
        { key: "nb", label: "Novo Banco", color: CHART_COLORS.nb, values: nbSeries },
        { key: "cf", label: "Coverflex", color: CHART_COLORS.cf, values: cfSeries },
        { key: "irs", label: "Poupanca IRS", color: CHART_COLORS.irs, values: irsSeries },
        { key: "audi", label: "Poupanca Audi", color: CHART_COLORS.audi, values: audiSeries }
      ];

      const hiddenKeys = new Set();

      function render() {
        const visibleSeries = allSeries.filter(s => !hiddenKeys.has(s.key));

        const legend = allSeries.map(s => {
          const active = !hiddenKeys.has(s.key);
          return `<button type='button' class='outcome-evolution-legend-item ${active ? "is-active" : "is-inactive"}' data-home-chart-toggle='${s.key}'><span class='outcome-evolution-legend-dot' style='background:${s.color}'></span>${s.label}</button>`;
        }).join("");

        if (!visibleSeries.length) {
          host.innerHTML = `<div class='cgd-summary-map'><div class='outcome-evolution-head'><h3>Saldo ${year}</h3></div><p class='outcome-evolution-empty'>Nenhuma serie selecionada.</p><div class='outcome-evolution-legend'>${legend}</div></div>`;
          return;
        }

        const chartWidth = 980, chartHeight = 320;
        const padding = { top: 20, right: 18, bottom: 38, left: 54 };
        const plotWidth = chartWidth - padding.left - padding.right;
        const plotHeight = chartHeight - padding.top - padding.bottom;
        const monthBand = plotWidth / 11;
        const xFor = (m) => padding.left + monthBand * m;

        const allVals = visibleSeries.flatMap(s => s.values.map(v => Number(v) || 0));
        const minVal = Math.min(0, ...allVals);
        const maxVal = Math.max(0, ...allVals);
        const range = maxVal - minVal || 1;
        const yFor = (v) => padding.top + ((maxVal - (Number(v) || 0)) / range) * plotHeight;
        const zeroY = yFor(0);

        const gridCount = 6;
        const gridLines = Array.from({ length: gridCount + 1 }, (_, i) => {
          const ratio = i / gridCount;
          const y = padding.top + ratio * plotHeight;
          const val = maxVal - ratio * (maxVal - minVal);
          return `<line x1='${padding.left}' y1='${y.toFixed(1)}' x2='${(chartWidth - padding.right).toFixed(1)}' y2='${y.toFixed(1)}' stroke='rgba(176,210,226,0.18)' stroke-width='0.7'/><text x='${(padding.left - 8).toFixed(1)}' y='${(y + 4).toFixed(1)}' text-anchor='end' fill='rgba(197,220,231,0.82)' font-size='9'>${val.toFixed(0)}</text>`;
        }).join("");

        const monthLabels = MONTHS_PT.map((name, m) => {
          const x = xFor(m);
          return `<text x='${x.toFixed(1)}' y='${(chartHeight - 12).toFixed(1)}' text-anchor='middle' fill='rgba(197,220,231,0.9)' font-size='10'>${name.substring(0, 3)}</text>`;
        }).join("");

        function buildSmoothPath(points) {
          if (points.length < 2) return "";
          let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
          for (let i = 0; i < points.length - 1; i++) {
            const p0 = points[i - 1] || points[i];
            const p1 = points[i];
            const p2 = points[i + 1];
            const p3 = points[i + 2] || p2;
            const cp1x = p1.x + (p2.x - p0.x) / 6;
            const cp1y = p1.y + (p2.y - p0.y) / 6;
            const cp2x = p2.x - (p3.x - p1.x) / 6;
            const cp2y = p2.y - (p3.y - p1.y) / 6;
            path += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
          }
          return path;
        }

        const seriesMarkup = visibleSeries.map(s => {
          const points = s.values.map((v, m) => ({ x: xFor(m), y: yFor(v), value: Number(v) || 0, month: MONTHS_PT[m] }));
          const pathData = buildSmoothPath(points);
          const areaPath = `${pathData} L ${points[11].x.toFixed(2)} ${zeroY.toFixed(2)} L ${points[0].x.toFixed(2)} ${zeroY.toFixed(2)} Z`;
          const dots = points.map((p, m) => `<circle class='outcome-evolution-point${m === currentMonth ? " is-active-month" : ""}' cx='${p.x.toFixed(2)}' cy='${p.y.toFixed(2)}' r='${m === currentMonth ? "4.5" : "2.2"}' fill='${s.color}' data-month-name='${p.month}' data-series-name='${s.label}' data-value='${money(p.value)}' data-series-color='${s.color}'/>`).join("");
          return `<g class='outcome-evolution-series'><path d='${areaPath}' fill='${s.color}' fill-opacity='0.08'/><path d='${pathData}' fill='none' stroke='${s.color}' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'/>${dots}</g>`;
        }).join("");

        host.innerHTML = `
          <div class='cgd-summary-map'>
            <div class='outcome-evolution-head'><h3>Saldo ${year}</h3></div>
            <div class='outcome-evolution-legend'>${legend}</div>
            <div class='outcome-evolution-svg-wrap cgd-summary-svg-wrap'>
              <svg class='outcome-evolution-svg' viewBox='0 0 ${chartWidth} ${chartHeight}'>
                ${gridLines}
                ${seriesMarkup}
                ${monthLabels}
              </svg>
              <div class='outcome-evolution-tooltip' aria-hidden='true'></div>
            </div>
          </div>
        `;

        // Tooltip
        const wrap = host.querySelector(".outcome-evolution-svg-wrap");
        const tooltip = host.querySelector(".outcome-evolution-tooltip");
        if (wrap && tooltip) {
          const hideTooltip = () => tooltip.classList.remove("is-visible");
          let positionFrame = 0;
          let pointerPosition = null;
          const schedulePosition = (event) => {
            pointerPosition = { clientX: event.clientX, clientY: event.clientY };
            if (positionFrame) return;
            positionFrame = requestAnimationFrame(() => {
              positionFrame = 0;
              if (!pointerPosition) return;
              const wrapRect = wrap.getBoundingClientRect();
              const tooltipRect = tooltip.getBoundingClientRect();
              const margin = 10;
              let left = pointerPosition.clientX - wrapRect.left + 12;
              let top = pointerPosition.clientY - wrapRect.top - tooltipRect.height - 12;
              if (left + tooltipRect.width > wrapRect.width - margin) left = wrapRect.width - tooltipRect.width - margin;
              if (left < margin) left = margin;
              if (top < margin) top = pointerPosition.clientY - wrapRect.top + 14;
              if (top + tooltipRect.height > wrapRect.height - margin) top = wrapRect.height - tooltipRect.height - margin;
              tooltip.style.left = `${left}px`;
              tooltip.style.top = `${top}px`;
            });
          };
          wrap.addEventListener("pointerleave", hideTooltip);
          wrap.querySelectorAll(".outcome-evolution-point").forEach(dot => {
            const showTooltip = (event) => {
              const monthName = dot.dataset.monthName || "";
              const seriesName = dot.dataset.seriesName || "";
              const value = dot.dataset.value || "0";
              const color = dot.dataset.seriesColor || "#fff";
              tooltip.innerHTML = `
                <div class='outcome-evolution-tooltip-month'>${monthName}</div>
                <div class='outcome-evolution-tooltip-row'>
                  <span class='outcome-evolution-tooltip-dot' style='background:${color};'></span>
                  <span class='outcome-evolution-tooltip-series'>${seriesName}</span>
                  <strong class='outcome-evolution-tooltip-value'>${value}</strong>
                </div>
              `;
              tooltip.classList.add("is-visible");
              schedulePosition(event);
            };
            dot.addEventListener("pointerenter", showTooltip);
            dot.addEventListener("pointermove", schedulePosition);
            dot.addEventListener("pointerleave", hideTooltip);
          });
        }
      }

      render();

      // Legend toggle
      host.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-home-chart-toggle]");
        if (!btn) return;
        const key = btn.dataset.homeChartToggle;
        if (hiddenKeys.has(key)) hiddenKeys.delete(key); else hiddenKeys.add(key);
        render();
      });
    });
  })();

  // ─── Generic disponivel tile renderer ─────────────────────────────────
  function renderDispTile(id, label, value, { highlight = false, whiteGlow = false, past = false, meta = null, vsJan = null, vsPrev = null, vsPrevLabel = null } = {}) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = "";
    if (highlight) el.classList.add("nb-pie-card--active");
    if (whiteGlow) el.classList.add("nb-pie-card--white-glow");
    if (past) el.classList.add("nb-pie-card--past");

    let varianceHtml = "";
    if (meta) {
      varianceHtml += `<div class="home-tile-footer" style="color:rgba(180,200,220,0.7);font-size:0.63rem;"><span>${meta}</span></div>`;
    }
    if (vsJan !== null && vsJan !== 0) {
      const pct = ((value - vsJan) / Math.abs(vsJan)) * 100;
      const sign = pct >= 0 ? "+" : "";
      const color = pct >= 0 ? "#00dc6e" : "#ff6b6b";
      varianceHtml += `<div class="home-tile-footer" style="color:${color}"><span>${sign}${pct.toFixed(1)}% vs Jan ${year}</span></div>`;
    }
    if (vsPrev !== null && vsPrev !== 0) {
      const pct = ((value - vsPrev) / Math.abs(vsPrev)) * 100;
      const sign = pct >= 0 ? "+" : "";
      const color = pct >= 0 ? "#00dc6e" : "#ff6b6b";
      varianceHtml += `<div class="home-tile-footer" style="color:${color}"><span>${sign}${pct.toFixed(1)}% vs ${vsPrevLabel || MONTHS_PT[prevMonthIdx]}</span></div>`;
    }

    el.innerHTML = `
      <div class="home-tile-header">
        <h4>${label}</h4>
        <p>${money(value)}</p>
      </div>
      ${varianceHtml}
    `;
  }

  function renderUnavailableDispTile(id, label) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = "";
    el.innerHTML = `
      <div class="home-tile-header">
        <h4>${label}</h4>
        <p>Indisponivel</p>
      </div>
    `;
  }

  // CGD Disponivel tiles
  renderDispTile("home-cgd-disp-jan", `Janeiro ${year}`, cgdDisponivelJan, { past: true });
  renderDispTile("home-cgd-disp-prev", `${MONTHS_PT[prevMonthIdx]} ${prevMonthYear}`, cgdDisponivelPrev, { past: true, vsJan: cgdDisponivelJan });
  renderDispTile("home-cgd-disp-current", `${MONTHS_PT[currentMonth]} ${year}`, cgdDisponivel, { highlight: true, vsJan: cgdDisponivelJan, vsPrev: cgdDisponivelPrev });
  renderDispTile("home-cgd-disp-next", `${MONTHS_PT[nextMonthIdx]} ${nextMonthYear}`, cgdDisponivelNext, { vsJan: cgdDisponivelJan, vsPrev: cgdDisponivel, vsPrevLabel: MONTHS_PT[currentMonth] });
  renderDispTile("home-cgd-disp-jan-next", `Janeiro ${year + 1}`, cgdDisponivelJanNext, { whiteGlow: true, vsJan: cgdDisponivelJan });

  // NB Disponivel tiles (NB has no savings deduction, value = real)
  const nbRealNextDisp = nextMonthYear === year ? getVal(nbEstimated, nextMonthIdx) : getValNext(nbEstimatedNext, nextMonthIdx);
  const nbRealJanNextDisp = getValNext(nbEstimatedNext, 0);

  renderDispTile("home-nb-disp-jan", `Janeiro ${year}`, nbRealJan, { past: true });
  renderDispTile("home-nb-disp-prev", `${MONTHS_PT[prevMonthIdx]} ${prevMonthYear}`, nbRealPrev, { past: true, vsJan: nbRealJan });
  renderDispTile("home-nb-disp-current", `${MONTHS_PT[currentMonth]} ${year}`, nbReal, { highlight: true, vsJan: nbRealJan, vsPrev: nbRealPrev });
  renderDispTile("home-nb-disp-next", `${MONTHS_PT[nextMonthIdx]} ${nextMonthYear}`, nbRealNextDisp, { vsJan: nbRealJan, vsPrev: nbReal, vsPrevLabel: MONTHS_PT[currentMonth] });
  renderDispTile("home-nb-disp-jan-next", `Janeiro ${year + 1}`, nbRealJanNextDisp, { whiteGlow: true, vsJan: nbRealJan });

  // Coverflex Disponivel tiles (no savings deduction, value = real)
  const cfRealNextDisp = nextMonthYear === year ? getVal(coverflexEstimated, nextMonthIdx) : getValNext(coverflexEstimatedNext, nextMonthIdx);
  const cfRealJanNextDisp = getValNext(coverflexEstimatedNext, 0);

  renderDispTile("home-cf-disp-jan", `Janeiro ${year}`, coverflexRealJan, { past: true });
  renderDispTile("home-cf-disp-prev", `${MONTHS_PT[prevMonthIdx]} ${prevMonthYear}`, coverflexRealPrev, { past: true, vsJan: coverflexRealJan });
  renderDispTile("home-cf-disp-current", `${MONTHS_PT[currentMonth]} ${year}`, coverflexReal, { highlight: true, vsJan: coverflexRealJan, vsPrev: coverflexRealPrev });
  renderDispTile("home-cf-disp-next", `${MONTHS_PT[nextMonthIdx]} ${nextMonthYear}`, cfRealNextDisp, { vsJan: coverflexRealJan, vsPrev: coverflexReal, vsPrevLabel: MONTHS_PT[currentMonth] });
  renderDispTile("home-cf-disp-jan-next", `Janeiro ${year + 1}`, cfRealJanNextDisp, { whiteGlow: true, vsJan: coverflexRealJan });

  // IRS Poupanca tiles
  const irsNext = cgdSavingsData.irsAccumulatedNext;
  const irsJanNext = cgdSavingsData.irsAccumulatedJanNext;

  renderDispTile("home-irs-disp-jan", `Janeiro ${year}`, irsAccumulatedJan, { past: true });
  renderDispTile("home-irs-disp-current", `${MONTHS_PT[currentMonth]} ${year}`, irsAccumulated, { highlight: true, vsJan: irsAccumulatedJan });
  renderDispTile("home-irs-disp-jan-next", `Janeiro ${year + 1}`, irsJanNext, { whiteGlow: true, vsJan: irsAccumulatedJan });

  let coverflexIrsResult = null;
  try {
    const [rubrics, expenses] = await Promise.all([
      fetchRowsOnce(
        `coverflex_rubrica:irs:${year}`,
        () => sb.from("coverflex_rubrica")
          .select("rubrica_id,rubrica_desc,rubrica_tipo")
          .eq("ano", year)
          .eq("rubrica_tipo", "Despesa")
      ),
      fetchCoverflexIrsExpenses()
    ]);
    coverflexIrsResult = calculateHomeCoverflexIrs(rubrics, expenses);
  } catch (error) {
    console.error("Unable to calculate Coverflex IRS for Home.", error);
  }
  if (coverflexIrsResult) {
    renderDispTile(
      "home-irs-disp-coverflex",
      `IRS Coverflex ${year + 1}`,
      coverflexIrsResult.annualAmount,
      { highlight: true }
    );
  } else {
    renderUnavailableDispTile("home-irs-disp-coverflex", `IRS Coverflex ${year + 1}`);
  }

  // Audi Poupanca tiles
  const audiNext = cgdSavingsData.audiAccumulatedNext;
  const audiJanNext = cgdSavingsData.audiAccumulatedJanNext;

  renderDispTile("home-audi-disp-jan", `Janeiro ${year}`, audiAccumulatedJan, { past: true });
  renderDispTile("home-audi-disp-current", `${MONTHS_PT[currentMonth]} ${year}`, audiAccumulated, { highlight: true, vsJan: audiAccumulatedJan });
  renderDispTile("home-audi-disp-jan-next", `Janeiro ${year + 1}`, audiJanNext, { whiteGlow: true, vsJan: audiAccumulatedJan, meta: `Meta 2028: ${money(5900)}` });
})();
