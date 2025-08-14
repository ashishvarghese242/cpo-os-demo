// lib/charts.js
import { themeVars } from "./theme.js";

export function renderRadar(el, labels, datasets, options = {}) {
  const Chart = window.Chart;
  if (!Chart) return;

  if (el.__chart) { el.__chart.destroy(); el.__chart = null; }
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

export function dsActual(){ const t = themeVars(); return { fill:t.actualFill, line:t.actualLine }; }
export function dsTarget(){ const t = themeVars(); return { fill:t.targetFill, line:t.targetLine }; }
export function dsInfluence(){ const t = themeVars(); return { fill:t.influenceFill, line:t.influenceLine }; }
export function dsTraining(){ const s = getComputedStyle(document.documentElement); return {
  fill: (s.getPropertyValue("--chart-training-fill")||"").trim(),
  line: (s.getPropertyValue("--chart-training-line")||"").trim()
};}
