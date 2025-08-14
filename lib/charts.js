// lib/charts.js
export function renderRadar(el, labels, datasets, options = {}) {
  const Chart = window.Chart;
  if (!Chart) return;

  if (el.__chart) {
    el.__chart.destroy();
    el.__chart = null;
  }
  const ctx = el.getContext("2d");
  el.__chart = new Chart(ctx, {
    type: "radar",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } },
      scales: { r: { suggestedMin: 0, suggestedMax: 5, ticks: { stepSize: 1 } } },
      ...options
    }
  });
}
