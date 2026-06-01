const MONTHS_PT = ["Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function money(value) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(value);
}

function escapeHtml(str) {
  const el = document.createElement("span");
  el.textContent = str;
  return el.innerHTML;
}

(async function homeInit() {
  const SUPABASE_URL = window.CGD_SUPABASE_URL || "";
  const SUPABASE_KEY = window.CGD_SUPABASE_ANON_KEY || "";
  if (!window.supabase?.createClient || !SUPABASE_URL || !SUPABASE_KEY) return;

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  const year = new Date().getFullYear();
  const currentMonth = new Date().getMonth(); // 0-indexed

  // Update title
  const titleEl = document.getElementById("home-resumo-title");
  if (titleEl) {
    titleEl.textContent = "Resumo Saldo Total";
  }

  // Fetch real values from all 3 tables (for current year AND next year)
  const fetchReal = async (table, yr) => {
    try {
      const { data, error } = await sb.from(table).select("ano,mes,real").eq("ano", yr).order("mes", { ascending: true });
      if (error) return [];
      return Array.isArray(data) ? data : [];
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
      const [rubRes, despRes] = await Promise.all([
        sb.from(rubricTable).select("rubrica_id,rubrica_tipo").eq("ano", yr),
        sb.from(expenseTable).select("rubrica_id,ano,mes,valor,valor_estimado,zerado").eq("ano", yr)
      ]);
      const rubrics = Array.isArray(rubRes.data) ? rubRes.data : [];
      const expenses = Array.isArray(despRes.data) ? despRes.data : [];

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
      const [rubRes, despRes] = await Promise.all([
        sb.from("cgd_rubrica").select("rubrica_id,ano,mes,rubrica_tipo,rubrica_desc").in("rubrica_tipo", ["Aprovisionamento"]),
        sb.from("cgd_despesa").select("rubrica_id,ano,mes,valor,valor_estimado,zerado")
      ]);
      const rubrics = Array.isArray(rubRes.data) ? rubRes.data : [];
      const expenses = Array.isArray(despRes.data) ? despRes.data : [];

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

  function renderPieChart(hostId, title, cgdVal, nbVal, coverVal, { highlight = false } = {}) {
    const slices = [
      { label: "CGD", value: Math.abs(cgdVal), color: PIE_COLORS[0] },
      { label: "Novo Banco", value: Math.abs(nbVal), color: PIE_COLORS[1] },
      { label: "Coverflex", value: Math.abs(coverVal), color: PIE_COLORS[2] }
    ].filter(s => s.value !== 0);

    const pieHost = document.getElementById(hostId);
    if (!pieHost || !slices.length) return;

    if (highlight) pieHost.classList.add("nb-pie-card--active");

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
          tooltip.innerHTML = `
            <div class='nb-pie-tooltip-row'>
              <span class='nb-pie-tooltip-dot' style='background:${color}'></span>
              <span class='nb-pie-tooltip-label'>${label}</span>
              <strong class='nb-pie-tooltip-value'>${value}</strong>
              <span class='nb-pie-tooltip-pct'>(${pct})</span>
            </div>
          `;
          tooltip.classList.add("is-visible");
        };
        sliceEl.addEventListener("pointerenter", showTip);
        sliceEl.addEventListener("pointermove", showTip);
        sliceEl.addEventListener("pointerleave", hideTooltip);
      });
    }
  }

  // Render 5 pie charts
  const prevMonthYear = currentMonth > 0 ? year : year - 1;
  renderPieChart("home-pie-jan", `Janeiro ${year}`, cgdRealJan, nbRealJan, coverflexRealJan);
  renderPieChart("home-pie-prev", `${MONTHS_PT[prevMonthIdx]} ${prevMonthYear}`, cgdRealPrev, nbRealPrev, coverflexRealPrev);
  renderPieChart("home-pie-saldo", `${MONTHS_PT[currentMonth]} ${year}`, cgdReal, nbReal, coverflexReal, { highlight: true });
  renderPieChart("home-pie-next", `${MONTHS_PT[nextMonthIdx]} ${nextMonthYear}`, cgdRealNext, nbRealNext, coverflexRealNext);
  renderPieChart("home-pie-jan-next", `Janeiro ${year + 1}`, cgdRealJanNext, nbRealJanNext, coverflexRealJanNext);

  // Generic tile renderer
  function renderTile(id, label, value, valueJan, valuePrev) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = "";
    let varianceHtml = "";
    if (valueJan) {
      const pct = ((value - valueJan) / Math.abs(valueJan)) * 100;
      const sign = pct >= 0 ? "+" : "";
      const color = pct >= 0 ? "#00dc6e" : "#ff6b6b";
      varianceHtml += `
        <div class="home-tile-footer" style="color:${color}">
          <span>${sign}${pct.toFixed(1)}% vs Janeiro ${year}</span>
          <span class="home-tile-jan">Jan ${year}: ${money(valueJan)}</span>
        </div>`;
    }
    if (valuePrev) {
      const pctPrev = ((value - valuePrev) / Math.abs(valuePrev)) * 100;
      const signPrev = pctPrev >= 0 ? "+" : "";
      const colorPrev = pctPrev >= 0 ? "#00dc6e" : "#ff6b6b";
      varianceHtml += `
        <div class="home-tile-footer" style="color:${colorPrev}">
          <span>${signPrev}${pctPrev.toFixed(1)}% vs ${prevMonthName} ${year}</span>
          <span class="home-tile-jan">${prevMonthName} ${year}: ${money(valuePrev)}</span>
        </div>`;
    }
    el.innerHTML = `
      <div class="home-tile-header">
        <h4>${label} ${MONTHS_PT[currentMonth]} ${year}</h4>
        <p>${money(value)}</p>
      </div>
      ${varianceHtml}
    `;
  }

  // Render all tiles
  renderTile("home-tile-disponivel", "Saldo Total disponivel", saldoDisponivel, saldoDisponivelJan, saldoDisponivelPrev);
  renderTile("home-tile-coverflex", "Saldo disponivel Coverflex", coverflexReal, coverflexRealJan, coverflexRealPrev);
  renderTile("home-tile-irs", "Saldo IRS", irsAccumulated, irsAccumulatedJan, irsAccumulatedPrev);
  renderTile("home-tile-audi", "Saldo Audi", audiAccumulated, audiAccumulatedJan, audiAccumulatedPrev);

  // ─── Generic disponivel tile renderer (CGD + NB) ──────────────────────
  function renderDispTile(id, label, value, { highlight = false, vsJan = null, vsPrev = null, vsPrevLabel = null } = {}) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = "";
    if (highlight) el.classList.add("nb-pie-card--active");

    let varianceHtml = "";
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

  // CGD Disponivel tiles
  renderDispTile("home-cgd-disp-jan", `Janeiro ${year}`, cgdDisponivelJan);
  renderDispTile("home-cgd-disp-prev", `${MONTHS_PT[prevMonthIdx]} ${prevMonthYear}`, cgdDisponivelPrev, { vsJan: cgdDisponivelJan });
  renderDispTile("home-cgd-disp-current", `${MONTHS_PT[currentMonth]} ${year}`, cgdDisponivel, { highlight: true, vsJan: cgdDisponivelJan, vsPrev: cgdDisponivelPrev });
  renderDispTile("home-cgd-disp-next", `${MONTHS_PT[nextMonthIdx]} ${nextMonthYear}`, cgdDisponivelNext, { vsJan: cgdDisponivelJan, vsPrev: cgdDisponivel, vsPrevLabel: MONTHS_PT[currentMonth] });
  renderDispTile("home-cgd-disp-jan-next", `Janeiro ${year + 1}`, cgdDisponivelJanNext, { vsJan: cgdDisponivelJan });

  // NB Disponivel tiles (NB has no savings deduction, value = real)
  const nbRealNextDisp = nextMonthYear === year ? getVal(nbEstimated, nextMonthIdx) : getValNext(nbEstimatedNext, nextMonthIdx);
  const nbRealJanNextDisp = getValNext(nbEstimatedNext, 0);

  renderDispTile("home-nb-disp-jan", `Janeiro ${year}`, nbRealJan);
  renderDispTile("home-nb-disp-prev", `${MONTHS_PT[prevMonthIdx]} ${prevMonthYear}`, nbRealPrev, { vsJan: nbRealJan });
  renderDispTile("home-nb-disp-current", `${MONTHS_PT[currentMonth]} ${year}`, nbReal, { highlight: true, vsJan: nbRealJan, vsPrev: nbRealPrev });
  renderDispTile("home-nb-disp-next", `${MONTHS_PT[nextMonthIdx]} ${nextMonthYear}`, nbRealNextDisp, { vsJan: nbRealJan, vsPrev: nbReal, vsPrevLabel: MONTHS_PT[currentMonth] });
  renderDispTile("home-nb-disp-jan-next", `Janeiro ${year + 1}`, nbRealJanNextDisp, { vsJan: nbRealJan });
})();
