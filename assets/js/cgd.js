const cgdMock = {
  income: [
    {
      name: "Salarios e bonus",
      expenses: [
        { name: "Salario base", values: [2450, 2450, 2450, 2450, 2450, 2450, 2450, 2450, 2450, 2450, 2450, 2450] },
        { name: "Bonus desempenho", values: [0, 0, 420, 0, 0, 510, 0, 0, 0, 620, 0, 800] }
      ]
    },
    {
      name: "Rendimentos extra",
      expenses: [
        { name: "Freelance", values: [250, 310, 280, 450, 300, 380, 420, 330, 410, 470, 390, 520] },
        { name: "Juros e cashback", values: [40, 32, 35, 31, 44, 39, 41, 43, 35, 48, 42, 50] }
      ]
    },
    {
      name: "Arrendamentos",
      expenses: [
        { name: "Renda anexo", values: [520, 520, 520, 520, 520, 520, 520, 520, 520, 520, 520, 520] }
      ]
    }
  ],
  outcome: [
    {
      name: "Habitacao",
      expenses: [
        { name: "Prestacao casa", values: [960, 960, 960, 960, 960, 960, 960, 960, 960, 960, 960, 960] },
        { name: "Condominio", values: [65, 65, 65, 65, 65, 65, 65, 65, 65, 65, 65, 65] },
        { name: "Seguros", values: [72, 72, 72, 72, 72, 72, 72, 72, 72, 72, 72, 72] }
      ]
    },
    {
      name: "Familia e consumo",
      expenses: [
        { name: "Supermercado", values: [420, 445, 438, 452, 470, 489, 512, 498, 476, 490, 508, 530] },
        { name: "Escola e atividades", values: [130, 130, 130, 180, 145, 140, 90, 90, 180, 150, 140, 160] },
        { name: "Saude", values: [85, 90, 92, 88, 94, 92, 97, 95, 103, 99, 94, 108] }
      ]
    },
    {
      name: "Mobilidade e energia",
      expenses: [
        { name: "Combustivel", values: [140, 135, 142, 138, 150, 156, 160, 165, 158, 152, 146, 149] },
        { name: "Eletricidade e gas", values: [112, 118, 95, 88, 80, 74, 69, 71, 86, 102, 118, 130] }
      ]
    }
  ]
};

const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function sumByMonth(expenses) {
  return months.map((_, index) => expenses.reduce((acc, expense) => acc + (expense.values[index] || 0), 0));
}

function money(value) {
  return Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function monthPills(values, editable, labelPrefix) {
  return values
    .map((value, monthIndex) => {
      const dataMonth = `data-month-col='${monthIndex}'`;
      if (editable) {
        return `
        <div class='money-pill' ${dataMonth}>
          <input data-money type='text' value='${money(value)}' aria-label='${labelPrefix} ${months[monthIndex]}' />
        </div>`;
      }
      return `
      <div class='money-pill readonly' ${dataMonth}>
        <button type='button' data-expense-field='${labelPrefix} - ${months[monthIndex]}'>
          <span>${money(value)}</span>
        </button>
      </div>`;
    })
    .join("");
}

function renderTimeline() {
  const timeline = document.getElementById("month-timeline");
  if (!timeline) {
    return;
  }

  const monthsHtml = months
    .map((month, index) => `<button class='month-tile' type='button' data-month='${index}'>${month}</button>`)
    .join("");

  timeline.innerHTML = `
    <div class='desc-cell'>
      <div class='desc-pill'>Mes de referencia</div>
    </div>
    ${monthsHtml}
  `;
}

function renderExpenseRows(expenses, rubricName) {
  return expenses
    .map((expense) => {
      return `
      <div class='data-row expense' data-sortable>
        <div class='desc-cell'>
          <span class='desc-pill'>${expense.name}</span>
          <div class='sort-actions'>
            <button type='button' aria-label='Subir despesa' data-move-up>↑</button>
            <button type='button' aria-label='Descer despesa' data-move-down>↓</button>
          </div>
        </div>
        ${monthPills(expense.values, false, `${rubricName} / ${expense.name}`)}
      </div>
      `;
    })
    .join("");
}

function renderRubrics(rubrics, kind) {
  return rubrics
    .map((rubric, rubricIndex) => {
      const rubricId = `${kind}-rubric-${rubricIndex}`;
      const expenseBodyId = `${rubricId}-expenses`;
      const totals = sumByMonth(rubric.expenses);

      return `
      <article class='rubric' data-sortable>
        <header class='rubric-head'>
          <div class='panel-title'>
            <button class='chev' type='button' data-toggle-target='${expenseBodyId}' aria-expanded='true' aria-label='Expandir rubrica'>▼</button>
            <strong>${rubric.name}</strong>
          </div>
          <div class='sort-actions'>
            <button type='button' data-move-up aria-label='Subir rubrica'>↑</button>
            <button type='button' data-move-down aria-label='Descer rubrica'>↓</button>
          </div>
        </header>
        <div class='rubric-body' id='${expenseBodyId}'>
          <div class='item-rows'>
            <div class='data-row'>
              <div class='desc-cell'>
                <span class='desc-pill'>Total rubrica</span>
              </div>
              ${monthPills(totals, true, `${rubric.name} total`)}
            </div>
            <div class='expense-body'>
              <div class='item-rows'>
                ${renderExpenseRows(rubric.expenses, rubric.name)}
              </div>
            </div>
          </div>
        </div>
      </article>
      `;
    })
    .join("");
}

function buildPanel(title, kind, rubrics) {
  const panelId = `panel-${kind}`;
  const bodyId = `${panelId}-body`;
  return `
  <section class='panel ${kind}' data-panel-block>
    <header class='panel-head'>
      <div class='panel-title'>
        <button class='chev' type='button' data-toggle-target='${bodyId}' aria-expanded='true' aria-label='Expandir ${title}'>▼</button>
        <h3>${title}</h3>
      </div>
      <span class='muted'>${rubrics.length} rubricas</span>
    </header>
    <div class='panel-body' id='${bodyId}'>
      ${renderRubrics(rubrics, kind)}
    </div>
  </section>
  `;
}

document.addEventListener("DOMContentLoaded", () => {
  renderTimeline();

  const panels = document.getElementById("cgd-panels");
  if (!panels) {
    return;
  }

  panels.innerHTML = `
    ${buildPanel("Income", "income", cgdMock.income)}
    ${buildPanel("Outcome", "outcome", cgdMock.outcome)}
  `;

  const currentMonth = new Date().getMonth();
  const activeMonthTile = document.querySelector(`.month-tile[data-month='${currentMonth}']`) || document.querySelector(".month-tile");
  if (activeMonthTile) {
    activeMonthTile.click();
  }
});
