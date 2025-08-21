// components/RadarCard.js
// Radar card with optional orange training overlay points.
// New props:
//   - overlayPoints: number[] (0..5 per metric)
//   - showOverlay: boolean (default false; when true, renders the points)

export default function RadarCard({
  title,
  labels,
  targetData,
  currentData,
  overlayPoints = null,  // 0..5 per label (cohort coverage scaled)
  showOverlay = false,   // NEW: page-level toggle controls visibility
  height = 360
}) {
  const React = window.React;
  const { useEffect, useRef } = React;
  const ref = useRef(null);

  function wrapLabel(s, max = 16){
    if (!s) return s;
    const out = [];
    let buf = "";
    s.split(" ").forEach(w => {
      const tryStr = (buf ? buf + " " : "") + w;
      if (tryStr.length > max){
        if (buf) out.push(buf);
        buf = w;
      } else {
        buf = tryStr;
      }
    });
    if (buf) out.push(buf);
    return out.join("\n");
  }

  useEffect(() => {
    if (!ref.current) return;

    const ctx = ref.current.getContext("2d");
    if (ref.current.__chart) { ref.current.__chart.destroy(); ref.current.__chart = null; }

    const styles = getComputedStyle(document.documentElement);
    const targetFill = (styles.getPropertyValue("--chart-target-fill") || "rgba(106,0,255,0.18)").trim();
    const targetLine = (styles.getPropertyValue("--chart-target-line") || "rgba(106,0,255,1)").trim();
    const actualFill = (styles.getPropertyValue("--chart-actual-fill") || "rgba(15,23,42,0.35)").trim();
    const actualLine = (styles.getPropertyValue("--chart-actual-line") || "rgba(15,23,42,1)").trim();

    // Orange for training overlay
    const trainFill = (styles.getPropertyValue("--chart-training-fill") || "rgba(255,172,28,0.22)").trim();
    const trainLine = (styles.getPropertyValue("--chart-training-line") || "rgba(255,172,28,1)").trim();

    const textColor = (styles.getPropertyValue("--text") || "#0f172a").trim();
    const wrapped = labels.map(l => wrapLabel(l, 18));

    const datasets = [
      {
        label: "Target (IRP)",
        data: targetData,
        backgroundColor: targetFill,
        borderColor: targetLine,
        borderWidth: 2,
        pointRadius: 3,
        order: 1
      },
      {
        label: "Current",
        data: currentData,
        backgroundColor: actualFill,
        borderColor: actualLine,
        borderWidth: 2,
        pointRadius: 3,
        order: 2
      }
    ];

    // Show orange enablement points only when toggled ON and data is present
    if (showOverlay && Array.isArray(overlayPoints) && overlayPoints.length === labels.length) {
      const clamp = (n,min,max)=>Math.max(min,Math.min(max,n));

      // Bigger & brighter mapping
      const radii = overlayPoints.map(v => 4 + clamp(Number(v)||0, 0, 5) * 2.8); // ~4..18
      const bgColors = overlayPoints.map(v => {
        const s = clamp(Number(v)||0, 0, 5);
        const alpha = 0.45 + (s/5) * 0.55; // 0.45..1.00
        if (trainLine.startsWith("rgba(")) return trainLine.replace(/, *1\)$/, `, ${alpha})`);
        if (trainLine.startsWith("rgb("))  return trainLine.replace("rgb(", "rgba(").replace(/\)$/, `, ${alpha})`);
        // fallback to trainFill if we can't synthesize alpha
        return trainFill;
      });

      datasets.push({
        label: "Enablement (Training)",
        data: overlayPoints,                 // 0..5 so tooltips show meaningful values
        pointRadius: radii,
        pointHoverRadius: radii.map(r => r + 2),
        pointBackgroundColor: bgColors,
        pointBorderColor: trainLine,
        borderColor: trainLine,
        borderWidth: 1.5,
        showLine: false,                     // points only
        fill: false,
        order: 999                           // draw on top of everything
      });
    }

    ref.current.__chart = new window.Chart(ctx, {
      type: "radar",
      data: { labels: wrapped, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: 8 },
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 16, font: { size: 13 } } },
          tooltip: {
            bodyFont: { size: 13 },
            titleFont: { size: 13 },
            callbacks: {
              label: (ctx) => {
                const v = (ctx.parsed?.r ?? 0);
                return `${ctx.dataset.label}: ${v.toFixed(2)} / 5`;
              }
            }
          }
        },
        elements: { line: { tension: 0.2 } },
        scales: {
          r: {
            suggestedMin: 0, suggestedMax: 5,
            ticks: { stepSize: 1, backdropColor: "transparent", color: textColor, font: { size: 12 } },
            pointLabels: { color: textColor, font: { size: 14 } },
            grid: { color: "rgba(2,6,23,0.10)" },
            angleLines: { color: "rgba(2,6,23,0.16)" }
          }
        }
      }
    });
  }, [
    JSON.stringify(labels),
    JSON.stringify(targetData),
    JSON.stringify(currentData),
    JSON.stringify(overlayPoints),
    showOverlay,
    height
  ]);

  return window.React.createElement("div", { className: "card" },
    window.React.createElement("h3", { className: "radar-title" }, title),
    window.React.createElement("div", { style: { height: height + "px" } },
      window.React.createElement("canvas", { ref })
    )
  );
}
