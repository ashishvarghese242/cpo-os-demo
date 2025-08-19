// components/RadarCard.js
export default function RadarCard({ title, labels, targetData, currentData, height=300 }) {
  const React = window.React;
  const { useEffect, useRef } = React;
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    const ctx = ref.current.getContext("2d");
    if (ref.current.__chart) { ref.current.__chart.destroy(); ref.current.__chart = null; }

    const styles = getComputedStyle(document.documentElement);
    const targetFill = (styles.getPropertyValue("--chart-target-fill")||"rgba(106,0,255,0.18)").trim();
    const targetLine = (styles.getPropertyValue("--chart-target-line")||"rgba(106,0,255,1)").trim();
    const actualFill = (styles.getPropertyValue("--chart-actual-fill")||"rgba(15,23,42,0.45)").trim();
    const actualLine = (styles.getPropertyValue("--chart-actual-line")||"rgba(15,23,42,1)").trim();

    ref.current.__chart = new window.Chart(ctx, {
      type: "radar",
      data: {
        labels,
        datasets: [
          { label: "Target (IRP)", data: targetData, backgroundColor: targetFill, borderColor: targetLine, borderWidth: 2, pointRadius: 2, order:1 },
          { label: "Current", data: currentData, backgroundColor: actualFill, borderColor: actualLine, borderWidth: 2, pointRadius: 2, order:2 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" } },
        elements: { line: { tension: 0.2 } },
        scales: { r: { suggestedMin: 0, suggestedMax: 5, ticks: { stepSize: 1 } } }
      }
    });
  }, [JSON.stringify(labels), JSON.stringify(targetData), JSON.stringify(currentData)]);

  return window.React.createElement("div", { className: "card" },
    window.React.createElement("h3", { className: "radar-title" }, title),
    window.React.createElement("div", { style:{height: height+"px"} },
      window.React.createElement("canvas", { ref })
    )
  );
}
