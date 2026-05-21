function euro(value) {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0
  }).format(value);
}

document.addEventListener("DOMContentLoaded", () => {
  if (!window.Chart) {
    return;
  }

  const chartDefaults = {
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          boxWidth: 14,
          color: "#cfe2ed",
          font: {
            family: "Plus Jakarta Sans"
          }
        }
      },
      tooltip: {
        backgroundColor: "rgba(10, 35, 45, 0.95)",
        titleFont: { family: "Space Grotesk" },
        bodyFont: { family: "Plus Jakarta Sans" },
        callbacks: {
          label(context) {
            return `${context.dataset.label}: ${euro(context.raw)}`;
          }
        }
      }
    },
    scales: {
      x: {
        ticks: {
          color: "#9fbac8",
          font: { family: "Plus Jakarta Sans" }
        },
        grid: {
          color: "rgba(177, 212, 227, 0.14)"
        }
      },
      y: {
        ticks: {
          color: "#9fbac8",
          callback(value) {
            return euro(value);
          },
          font: { family: "Plus Jakarta Sans" }
        },
        grid: {
          color: "rgba(177, 212, 227, 0.14)"
        }
      }
    }
  };

  const monthlyCtx = document.getElementById("monthly-flow-chart");
  if (monthlyCtx) {
    new Chart(monthlyCtx, {
      type: "line",
      data: {
        labels: ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"],
        datasets: [
          {
            label: "Income",
            data: [4180, 4320, 4670, 4410, 4820, 4960, 4870, 5050, 5190, 5100, 5230, 5480],
            borderColor: "#2c9b67",
            backgroundColor: "rgba(44, 155, 103, 0.16)",
            tension: 0.34,
            fill: true,
            borderWidth: 3,
            pointRadius: 2.8
          },
          {
            label: "Outcome",
            data: [2920, 2850, 3140, 3080, 3210, 3290, 3350, 3380, 3470, 3390, 3510, 3560],
            borderColor: "#c89e3d",
            backgroundColor: "rgba(200, 158, 61, 0.14)",
            tension: 0.34,
            fill: true,
            borderWidth: 3,
            pointRadius: 2.8
          }
        ]
      },
      options: chartDefaults
    });
  }

  const splitCtx = document.getElementById("split-chart");
  if (splitCtx) {
    new Chart(splitCtx, {
      type: "doughnut",
      data: {
        labels: ["Casa", "Alimentacao", "Transportes", "Lazer", "Poupanca", "Investimento"],
        datasets: [
          {
            label: "Distribuicao",
            data: [1270, 620, 410, 350, 900, 540],
            backgroundColor: ["#1f7fb8", "#2c9b67", "#c89e3d", "#78c0e8", "#86c99f", "#e4c882"],
            borderColor: "rgba(255,255,255,0.9)",
            borderWidth: 2,
            hoverOffset: 6
          }
        ]
      },
      options: {
        maintainAspectRatio: false,
        cutout: "64%",
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              color: "#cfe2ed",
              font: { family: "Plus Jakarta Sans" }
            }
          },
          tooltip: chartDefaults.plugins.tooltip
        }
      }
    });
  }
});
