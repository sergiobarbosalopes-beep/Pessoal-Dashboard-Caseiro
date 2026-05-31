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

  // Fetch CGD savings rubrics + expenses to compute accumulated savings
  const fetchCgdSavings = async () => {
    try {
      const [rubRes, despRes] = await Promise.all([
        sb.from("cgd_rubrica").select("rubrica_id,mes,rubrica_tipo").eq("ano", year).in("rubrica_tipo", ["Aprovisionamento"]),
        sb.from("cgd_despesa").select("rubrica_id,mes,valor,valor_estimado,zerado").eq("ano", year)
      ]);
      const rubrics = Array.isArray(rubRes.data) ? rubRes.data : [];
      const expenses = Array.isArray(despRes.data) ? despRes.data : [];
      const savingsRubricIds = new Set(rubrics.map(r => r.rubrica_id));
      const monthlyTotals = Array.from({ length: 12 }, () => 0);
      for (const exp of expenses) {
        if (!savingsRubricIds.has(exp.rubrica_id)) continue;
        const monthIdx = Number(exp.mes) - 1;
        if (monthIdx < 0 || monthIdx > 11) continue;
        if (exp.zerado === true || exp.zerado === "true") continue;
        const val = Number(exp.valor) || Number(exp.valor_estimado) || 0;
        monthlyTotals[monthIdx] += val;
      }
      return monthlyTotals;
    } catch { return Array.from({ length: 12 }, () => 0); }
  };

  const [cgdReals, nbReals, coverflexReals, cgdSavingsMonthly] = await Promise.all([
    fetchReal("cgd_real"),
    fetchReal("nb_real"),
    fetchReal("coverflex_real"),
    fetchCgdSavings()
  ]);

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
})();
