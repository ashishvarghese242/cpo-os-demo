// components/RadarCard.js
export default function RadarCard({ title, labels, targetData, currentData, height=360 }) {
  const React = window.React;
  const { useEffect, useRef } = React;
  const ref = useRef(null);

  function wrapLabel(s, max=16){
    if (!s) return s;
    const parts = [];
    let buf = "";
    s.split(" ").forEach(word=>{
      if ((buf + " " + word).trim().length > max){
        parts.push(buf.trim());
        buf = word;
      } else {
        buf = (buf ? buf + " " : "") + word;
      }
    });
    if (buf) parts.push(buf);
    return parts.join("\n");
  }

  useEffect(() => {
    if (!ref.current) return;
    const ctx = ref.current.getContext("2d");
    if (ref.current.__chart) { ref.current.__chart.destroy(); ref.current.__chart = null; }

    const styles = getComputedStyle(document.documentElement);
    const targetFill = (styles.getPropertyValue("--chart-target-fill")||"rgba(106,0,255,0.18)").trim();
    const targetLine = (styles.getPropertyValue("--chart-target-line")||"rgba(106,0,255,1)").trim();
    const actualFill = (styles.getPropertyValue("--chart-actual-fill")||"rgba(15,23,42,0.35)").trim();
    const actualLine = (styles.getPropertyValue("--chart-actual-line")||"rgba(15,23,42,1)").trim();
    const textColor = (styles.getPropertyValue("--text")||"#0f172a").trim();

    const wrapped = labels.map(l => wrapLabel(l, 18));

    ref.current.__chart = new window.Chart(ctx, {
      type: "radar",
      data: {
        labels: wrapped,
        datasets: [
          { label: "Target (IRP)", data: targetData, backgroundColor: targetFill, borderColor: targetLine, borderWidth: 2, pointRadius: 3, order:1 },
          { label: "Current", data: currentData, backgroundColor: actualFill, borderColor: actualLine, borderWidth: 2, pointRadius: 3, order:2 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: 8 },
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 16, font: { size: 13 } } },
          tooltip: { bodyFont: { size: 13 }, titleFont: { size: 13 } }
        },
        elements: { line: { tension: 0.2 } },
        scales: {
          r: {
            suggestedMin: 0, suggestedMax: 5,
            ticks: { stepSize: 1, backdropColor: "transparent", color: textColor, font: { size: 12 } },
            pointLabels: { color: textColor, font: { size: 14, weight: "600" } },
            grid: { color: "rgba(2,6,23,0.08)" },
            angleLines: { color: "rgba(2,6,23,0.12)" }
          }
        }
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
