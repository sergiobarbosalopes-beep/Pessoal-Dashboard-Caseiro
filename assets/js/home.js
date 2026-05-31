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
    titleEl.textContent = `Resumo ${MONTHS_PT[currentMonth]}`;
  }

  // Fetch real values from all 3 tables
  const fetchReal = async (table) => {
    try {
      const { data, error } = await sb.from(table).select("ano,mes,real").eq("ano", year).order("mes", { ascending: true });
      if (error) return [];
      return Array.isArray(data) ? data : [];
    } catch { return []; }
  };

  // Fetch CGD savings rubrics + expenses to compute accumulated savings (total, IRS, Audi)
  // IRS and Audi accumulate across all years, so we query without year filter for those
  const fetchCgdSavings = async () => {
    const empty = { total: Array.from({ length: 12 }, () => 0), irsAccumulated: 0, audiAccumulated: 0, irsAccumulatedJan: 0, audiAccumulatedJan: 0 };
    try {
      const [rubRes, despRes] = await Promise.all([
        sb.from("cgd_rubrica").select("rubrica_id,ano,mes,rubrica_tipo,rubrica_desc").in("rubrica_tipo", ["Aprovisionamento"]),
        sb.from("cgd_despesa").select("rubrica_id,ano,mes,valor,valor_estimado,zerado")
      ]);
      const rubrics = Array.isArray(rubRes.data) ? rubRes.data : [];
      const expenses = Array.isArray(despRes.data) ? despRes.data : [];

      // Build sets for all savings, IRS and Audi rubric IDs
      const allSavingsIds = new Set();
      const irsIds = new Set();
      const audiIds = new Set();
      for (const r of rubrics) {
        allSavingsIds.add(r.rubrica_id);
        const name = (r.rubrica_desc || "").toLowerCase();
        if (name.includes("irs")) irsIds.add(r.rubrica_id);
        if (name.includes("audi")) audiIds.add(r.rubrica_id);
      }

      // Current year monthly totals (for disponivel calculation)
      const totalMonthly = Array.from({ length: 12 }, () => 0);
      // IRS/Audi: accumulate ALL expenses before the target month
      let irsAccumulated = 0;   // all expenses before current month of current year
      let audiAccumulated = 0;
      let irsAccumulatedJan = 0; // all expenses before January of current year
      let audiAccumulatedJan = 0;

      for (const exp of expenses) {
        if (!allSavingsIds.has(exp.rubrica_id)) continue;
        if (exp.zerado === true || exp.zerado === "true") continue;
        const val = Number(exp.valor) || Number(exp.valor_estimado) || 0;
        const expYear = Number(exp.ano);
        const expMonth = Number(exp.mes) - 1; // 0-indexed

        // Total savings monthly (current year only, for disponivel)
        if (expYear === year && expMonth >= 0 && expMonth <= 11) {
          totalMonthly[expMonth] += val;
        }

        // IRS/Audi: sum everything BEFORE the target month (cross-year)
        const isBeforeCurrentMonth = expYear < year || (expYear === year && expMonth < currentMonth);
        const isBeforeJanuary = expYear < year;

        if (irsIds.has(exp.rubrica_id)) {
          if (isBeforeCurrentMonth) irsAccumulated += val;
          if (isBeforeJanuary) irsAccumulatedJan += val;
        }
        if (audiIds.has(exp.rubrica_id)) {
          if (isBeforeCurrentMonth) audiAccumulated += val;
          if (isBeforeJanuary) audiAccumulatedJan += val;
        }
      }
      return { total: totalMonthly, irsAccumulated, audiAccumulated, irsAccumulatedJan, audiAccumulatedJan };
    } catch { return empty; }
  };

  const [cgdReals, nbReals, coverflexReals, cgdSavingsData] = await Promise.all([
    fetchReal("cgd_real"),
    fetchReal("nb_real"),
    fetchReal("coverflex_real"),
    fetchCgdSavings()
  ]);

  const cgdSavingsMonthly = cgdSavingsData.total;

  const getRealForMonth = (reals, monthIndex) => {
    const row = reals.find(r => Number(r.mes) === monthIndex + 1);
    return row ? Number(row.real) || 0 : 0;
  };

  const cgdReal = getRealForMonth(cgdReals, currentMonth);
  const nbReal = getRealForMonth(nbReals, currentMonth);
  const coverflexReal = getRealForMonth(coverflexReals, currentMonth);

  // Accumulated savings for month N = sum of savings from months 0 to N-1
  let cgdAccumulatedSavings = 0;
  for (let i = 0; i < currentMonth; i++) {
    cgdAccumulatedSavings += cgdSavingsMonthly[i];
  }

  const totalSaldo = cgdReal + nbReal + coverflexReal;
  const cgdDisponivel = cgdReal - cgdAccumulatedSavings;
  const saldoDisponivel = cgdDisponivel + nbReal + coverflexReal;

  // January values for variance
  const cgdRealJan = getRealForMonth(cgdReals, 0);
  const nbRealJan = getRealForMonth(nbReals, 0);
  const coverflexRealJan = getRealForMonth(coverflexReals, 0);
  // Savings accumulated at January = 0 (nothing before month 0)
  const cgdDisponivelJan = cgdRealJan;
  const saldoDisponivelJan = cgdDisponivelJan + nbRealJan + coverflexRealJan;

  // IRS and Audi accumulated (already computed cross-year in fetchCgdSavings)
  const irsAccumulated = cgdSavingsData.irsAccumulated;
  const irsAccumulatedJan = cgdSavingsData.irsAccumulatedJan;
  const audiAccumulated = cgdSavingsData.audiAccumulated;
  const audiAccumulatedJan = cgdSavingsData.audiAccumulatedJan;

  // Build pie chart
  const PIE_COLORS = ["#00dc6e", "#2f9ad4", "#f2c46a"];
  const slices = [
    { label: "CGD", value: Math.abs(cgdReal), color: PIE_COLORS[0] },
    { label: "Novo Banco", value: Math.abs(nbReal), color: PIE_COLORS[1] },
    { label: "Coverflex", value: Math.abs(coverflexReal), color: PIE_COLORS[2] }
  ].filter(s => s.value !== 0);

  const pieHost = document.getElementById("home-pie-saldo");
  if (pieHost && slices.length) {
    const total = slices.reduce((s, e) => s + e.value, 0);
    const cx = 50, cy = 50, outerR = 40, innerR = 24;
    let currentAngle = 0;

    function polarToCartesian(ccx, ccy, r, angleDeg) {
      const rad = (angleDeg - 90) * Math.PI / 180;
      return { x: ccx + r * Math.cos(rad), y: ccy + r * Math.sin(rad) };
    }

    const paths = slices.map((slice) => {
      const sliceAngle = (slice.value / total) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + sliceAngle;
      currentAngle = endAngle;

      const outerStart = polarToCartesian(cx, cy, outerR, startAngle);
      const outerEnd = polarToCartesian(cx, cy, outerR, endAngle);
      const innerStart = polarToCartesian(cx, cy, innerR, endAngle);
      const innerEnd = polarToCartesian(cx, cy, innerR, startAngle);
      const largeArc = sliceAngle > 180 ? 1 : 0;

      const d = [
        `M ${outerStart.x.toFixed(2)} ${outerStart.y.toFixed(2)}`,
        `A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerEnd.x.toFixed(2)} ${outerEnd.y.toFixed(2)}`,
        `L ${innerStart.x.toFixed(2)} ${innerStart.y.toFixed(2)}`,
        `A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerEnd.x.toFixed(2)} ${innerEnd.y.toFixed(2)}`,
        "Z"
      ].join(" ");

      const pct = ((slice.value / total) * 100).toFixed(1);
      return `<path class='nb-pie-slice' d='${d}' fill='${slice.color}' stroke='rgba(0,0,0,0.3)' stroke-width='0.5' data-pie-label='${escapeHtml(slice.label)}' data-pie-value='${money(slice.value)}' data-pie-pct='${pct}%' data-pie-color='${slice.color}'/>`;
    }).join("");

    const legend = slices.map((slice) => {
      const pct = ((slice.value / total) * 100).toFixed(0);
      return `<span class='nb-pie-legend-item'><span class='nb-pie-legend-dot' style='background:${slice.color}'></span>${escapeHtml(slice.label)} ${pct}%</span>`;
    }).join("");

    pieHost.innerHTML = `
      <h4 class='nb-pie-title'>Saldo actual ${MONTHS_PT[currentMonth]} ${year}</h4>
      <div class='nb-pie-body'>
        <div class='nb-pie-svg-wrap'>
          <svg class='nb-pie-svg' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'>
            ${paths}
          </svg>
          <div class='nb-pie-center-label'>
            <span class='nb-pie-center-value'>${money(totalSaldo)}</span>
            <span class='nb-pie-center-sub'>EUR</span>
          </div>
        </div>
        <div class='nb-pie-legend'>${legend}</div>
      </div>
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

  // Build saldo disponivel tile
  const tileEl = document.getElementById("home-tile-disponivel");
  const tileValueEl = document.getElementById("home-tile-disponivel-value");
  const tileTitleEl = document.getElementById("home-tile-disponivel-title");
  const tileVarianceEl = document.getElementById("home-tile-disponivel-variance");

  if (tileEl && tileValueEl) {
    tileEl.style.display = "";
    if (tileTitleEl) {
      tileTitleEl.textContent = `Saldo disponivel ${MONTHS_PT[currentMonth]} ${year}`;
    }
    tileValueEl.textContent = money(saldoDisponivel);

    // Variance vs January
    if (tileVarianceEl && saldoDisponivelJan) {
      const pct = ((saldoDisponivel - saldoDisponivelJan) / Math.abs(saldoDisponivelJan)) * 100;
      const sign = pct >= 0 ? "+" : "";
      const color = pct >= 0 ? "var(--color-success, #00dc6e)" : "var(--color-danger, #ff6b6b)";
      tileVarianceEl.style.color = color;
      tileVarianceEl.textContent = `${sign}${pct.toFixed(1)}% vs Janeiro ${year}`;
    }
  }

  // Helper to render a savings tile with variance
  function renderSavingsTile(prefix, value, valueJan) {
    const el = document.getElementById(`home-tile-${prefix}`);
    const valEl = document.getElementById(`home-tile-${prefix}-value`);
    const titleEl = document.getElementById(`home-tile-${prefix}-title`);
    const varEl = document.getElementById(`home-tile-${prefix}-variance`);
    if (!el || !valEl) return;
    el.style.display = "";
    const label = prefix === "irs" ? "Saldo IRS" : "Saldo Audi";
    if (titleEl) titleEl.textContent = `${label} ${MONTHS_PT[currentMonth]} ${year}`;
    valEl.textContent = money(value);
    if (varEl && valueJan !== 0) {
      const pct = ((value - valueJan) / Math.abs(valueJan)) * 100;
      const sign = pct >= 0 ? "+" : "";
      const color = pct >= 0 ? "var(--color-success, #00dc6e)" : "var(--color-danger, #ff6b6b)";
      varEl.style.color = color;
      varEl.textContent = `${sign}${pct.toFixed(1)}% vs Janeiro ${year}`;
    }
  }

  renderSavingsTile("irs", irsAccumulated, irsAccumulatedJan);
  renderSavingsTile("audi", audiAccumulated, audiAccumulatedJan);
})();
